"""Validate and publish discovery indexes for the Terminal transcript archive.

The transcript bodies live under ``tx/<SYM>/<YYYYQn>.json.gz``.  A scan opens
and validates every body before returning a candidate index; it never writes.
Publication is a separate, atomic phase and treats the archive-wide index as
the commit marker by writing it last.

The legacy ``{SYM: [ids]}`` map remains available while fund payloads migrate
to the canonical per-symbol indexes.  Existing discovery pairs are append-only:
an index rebuild may add calls, but may never silently remove or remap one.
The global commit marker keeps that ``symbols`` contract intact and adds compact
``revisions`` and ``dates`` maps keyed by ``SYM/ID`` for downstream delta scans.
"""
from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

_TX_ID_RE = re.compile(r"^(\d{4})Q([1-4])$")
_QA_RE = re.compile(r"question(?:-and-answer|s and answers|s)?", re.IGNORECASE)
_REPO_ROOT = Path(__file__).resolve().parents[1]
_DEFAULT_TX_ROOT = _REPO_ROOT / "terminal" / "public" / "data" / "tx"


def _atomic_write_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    os.replace(tmp, path)


def normalize_legacy_map(raw: object) -> dict[str, list[str]]:
    """Return a canonical transcript map, rejecting structurally invalid input."""
    if not isinstance(raw, dict):
        raise ValueError("transcript index must be a JSON object")
    clean: dict[str, list[str]] = {}
    for raw_sym, raw_ids in raw.items():
        if not isinstance(raw_sym, str) or not isinstance(raw_ids, list):
            raise ValueError("transcript index entries must map symbol strings to ID arrays")
        sym = raw_sym.strip().upper()
        if not sym:
            raise ValueError("transcript index contains an empty symbol")
        ids: set[str] = set()
        for raw_id in raw_ids:
            if not isinstance(raw_id, str) or not _TX_ID_RE.fullmatch(raw_id):
                raise ValueError(f"invalid transcript ID for {sym}: {raw_id!r}")
            ids.add(raw_id)
        if ids:
            clean[sym] = sorted(ids)
    return clean


def transcript_pairs(index: object) -> set[tuple[str, str]]:
    """Return exact ``(symbol, transcript_id)`` discovery pairs."""
    return {
        (sym, tx_id)
        for sym, ids in normalize_legacy_map(index).items()
        for tx_id in ids
    }


def assert_append_only(candidate: object, baseline: object, *, label: str = "transcript index") -> None:
    """Reject any candidate that drops a previously published discovery pair."""
    candidate_pairs = transcript_pairs(candidate)
    missing = sorted(transcript_pairs(baseline) - candidate_pairs)
    if missing:
        preview = ", ".join(f"{sym}/{tx_id}" for sym, tx_id in missing[:8])
        suffix = f" (+{len(missing) - 8} more)" if len(missing) > 8 else ""
        raise ValueError(
            f"{label} is not append-only; missing {len(missing)} published pair(s): "
            f"{preview}{suffix}"
        )


def _read_json(path: Path) -> object:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        raise ValueError(f"cannot read {path}: {exc}") from exc


def _read_body(path: Path, expected_sym: str, expected_id: str) -> dict[str, Any]:
    try:
        with gzip.open(path, "rt", encoding="utf-8") as handle:
            raw = json.load(handle)
    except Exception as exc:
        raise ValueError(f"invalid transcript body {path}: {exc}") from exc
    if not isinstance(raw, dict) or raw.get("schema") != "mastermind.tx/v1":
        raise ValueError(f"invalid transcript schema in {path}")
    ticker = raw.get("ticker")
    tx_id = raw.get("id")
    if not isinstance(ticker, str) or ticker.strip().upper() != expected_sym:
        raise ValueError(f"transcript ticker mismatch in {path}: {ticker!r} != {expected_sym}")
    if tx_id != expected_id:
        raise ValueError(f"transcript ID mismatch in {path}: {tx_id!r} != {expected_id}")
    segments = raw.get("segments")
    if not isinstance(segments, list):
        raise ValueError(f"transcript segments must be an array in {path}")
    for i, segment in enumerate(segments):
        if not isinstance(segment, dict):
            raise ValueError(f"transcript segment {i} must be an object in {path}")
        for field in ("speaker", "role", "text"):
            if not isinstance(segment.get(field), str):
                raise ValueError(f"transcript segment {i}.{field} must be a string in {path}")
        if not segment["text"].strip():
            raise ValueError(f"transcript segment {i}.text is empty in {path}")
    for field in ("period", "title"):
        if not isinstance(raw.get(field), str) or not raw[field].strip():
            raise ValueError(f"transcript {field} must be a non-empty string in {path}")
    if raw.get("date") is not None and not isinstance(raw.get("date"), str):
        raise ValueError(f"transcript date must be a string or null in {path}")
    return raw


def body_sha256(payload: object) -> str:
    """Hash a transcript's canonical decompressed JSON representation."""
    canonical = json.dumps(
        payload,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(canonical).hexdigest()


def _qa_start(segments: list[dict[str, str]]) -> int | None:
    for i, segment in enumerate(segments):
        role = segment["role"].strip().lower()
        speaker = segment["speaker"].strip().lower()
        if role == "analyst":
            return i
        if (role == "operator" or speaker == "operator") and _QA_RE.search(segment["text"]):
            return i
    return None


def build_transcript_indexes(tx_root: Path) -> tuple[dict, dict, dict[str, dict]]:
    """Scan without writing and return global, legacy, and per-symbol candidates.

    Every filename-shaped body is opened and schema-validated.  A corrupt or
    mismatched body aborts the scan so it cannot be advertised by an index.
    """
    tx_root = Path(tx_root)
    generated_at = datetime.now(timezone.utc).isoformat()
    legacy: dict[str, list[str]] = {}
    per_symbol: dict[str, dict] = {}
    revisions: dict[str, str] = {}
    dates: dict[str, str | None] = {}
    latest_mtime: float | None = None
    body_count = 0

    if tx_root.is_dir():
        for symbol_dir in sorted(p for p in tx_root.iterdir() if p.is_dir()):
            sym = symbol_dir.name.strip().upper()
            if not sym:
                continue
            calls: list[dict] = []
            for body in sorted(symbol_dir.glob("*.json.gz")):
                match = _TX_ID_RE.fullmatch(body.name.removesuffix(".json.gz"))
                if not match:
                    continue
                stat = body.stat()
                tx_id = match.group(0)
                payload = _read_body(body, sym, tx_id)
                revision_key = f"{sym}/{tx_id}"
                revision = body_sha256(payload)
                revisions[revision_key] = revision
                dates[revision_key] = payload.get("date")
                segments = payload["segments"]
                speakers = sorted({
                    segment["speaker"].strip()
                    for segment in segments
                    if segment["speaker"].strip()
                })
                qa_start = _qa_start(segments)
                calls.append({
                    "id": tx_id,
                    "body_sha256": revision,
                    "period": payload["period"].strip(),
                    "date": payload.get("date"),
                    "title": payload["title"].strip(),
                    "url": f"/data/tx/{sym}/{tx_id}.json.gz",
                    "bytes": int(stat.st_size),
                    "segment_count": len(segments),
                    "speaker_count": len(speakers),
                    "speakers": speakers,
                    "word_count": sum(len(segment["text"].split()) for segment in segments),
                    "qa_start": qa_start,
                    "has_qa": qa_start is not None,
                    "source": "DefeatBeta",
                })
                latest_mtime = max(latest_mtime or stat.st_mtime, stat.st_mtime)

            if not calls:
                continue
            calls.sort(key=lambda call: call["id"], reverse=True)
            ids = [call["id"] for call in calls]
            legacy[sym] = sorted(ids)
            body_count += len(calls)
            per_symbol[sym] = {
                "schema": "mastermind.tx-symbol-index/v1",
                "generated_at": generated_at,
                "ticker": sym,
                "n": len(calls),
                "calls": calls,
            }

    global_index = {
        "schema": "mastermind.tx-index/v1",
        "generated_at": generated_at,
        "body_count": body_count,
        "symbol_count": len(legacy),
        "latest_body_mtime": (
            datetime.fromtimestamp(latest_mtime, tz=timezone.utc).isoformat()
            if latest_mtime is not None
            else None
        ),
        "symbols": legacy,
        "revisions": revisions,
        "dates": dates,
    }
    return global_index, legacy, per_symbol


def _existing_public_map(tx_root: Path) -> dict[str, list[str]] | None:
    path = tx_root / "index.json"
    if not path.exists():
        return None
    raw = _read_json(path)
    if not isinstance(raw, dict) or raw.get("schema") != "mastermind.tx-index/v1":
        raise ValueError(f"invalid existing public transcript index at {path}")
    return normalize_legacy_map(raw.get("symbols"))


def write_transcript_indexes(
    tx_root: Path,
    *,
    write_public: bool = True,
    legacy_out: Path | None = None,
    require_superset_of: object | None = None,
) -> tuple[dict, dict]:
    """Validate a no-write scan, then atomically publish its indexes.

    Per-symbol indexes and the optional legacy map are written before the
    archive-wide index.  The latter is the reader-visible commit marker.
    """
    tx_root = Path(tx_root)
    global_index, legacy, per_symbol = build_transcript_indexes(tx_root)
    baselines: list[tuple[str, object]] = []
    if require_superset_of is not None:
        baselines.append(("required baseline", require_superset_of))
    public_baseline = _existing_public_map(tx_root) if write_public else None
    if public_baseline is not None:
        baselines.append(("existing public index", public_baseline))
    legacy_path = Path(legacy_out) if legacy_out is not None else None
    if legacy_path is not None and legacy_path.exists():
        baselines.append(("existing legacy index", _read_json(legacy_path)))
    for label, baseline in baselines:
        assert_append_only(legacy, baseline, label=label)

    if write_public:
        for sym, payload in per_symbol.items():
            _atomic_write_json(tx_root / sym / "index.json", payload)
    if legacy_path is not None:
        _atomic_write_json(legacy_path, legacy)
    if write_public:
        _atomic_write_json(tx_root / "index.json", global_index)
    return global_index, legacy


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tx-root", type=Path, default=_DEFAULT_TX_ROOT)
    parser.add_argument(
        "--write-public",
        action="store_true",
        help="write per-symbol indexes, then tx/index.json as the commit marker",
    )
    parser.add_argument("--legacy-out", type=Path, default=None)
    parser.add_argument(
        "--require-superset-of",
        type=Path,
        default=None,
        help="reject publication if any pair in this legacy JSON map is absent",
    )
    parser.add_argument(
        "--stdout",
        choices=("summary", "legacy", "global"),
        default="summary",
        help="payload printed to stdout (default: summary)",
    )
    args = parser.parse_args(argv)

    baseline = _read_json(args.require_superset_of) if args.require_superset_of else None
    global_index, legacy = write_transcript_indexes(
        args.tx_root,
        write_public=args.write_public,
        legacy_out=args.legacy_out,
        require_superset_of=baseline,
    )
    if args.stdout == "legacy":
        payload: object = legacy
    elif args.stdout == "global":
        payload = global_index
    else:
        payload = {
            "schema": global_index["schema"],
            "body_count": global_index["body_count"],
            "symbol_count": global_index["symbol_count"],
            "latest_body_mtime": global_index["latest_body_mtime"],
        }
    sys.stdout.write(json.dumps(payload, separators=(",", ":")))
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
