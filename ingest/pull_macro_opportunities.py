"""Bridge Macro's durable opportunity timeline into Terminal symbol slices.

The Macro Dashboard owns Prophet/reversal-watch provenance.  It publishes one
``opportunity_timeline.v1`` artifact at::

    $MACRO_REPO/site/factordata/opportunity_timeline.json

This bridge does not reinterpret those receipts.  For every symbol explicitly
present in the artifact it atomically read-modify-writes the existing Terminal
``<SYM>.slice.json`` and adds/replaces only this sibling block::

    "opportunities": {
        "schema": "opportunity_timeline.v1",
        "as_of": "YYYY-MM-DD",
        "priced_through": {...},
        "events": [...]
    }

``indicator``, ``backtest``, and every other sibling remain byte-equivalent as
JSON values.  Symbols omitted by the source are deliberately left alone: an
incomplete source must not erase the last-good receipt.  An explicitly included
symbol with ``events: []`` is authoritative and clears that symbol's stale event
list.  Missing/malformed source data is a non-fatal no-op, matching the nightly's
last-good publication contract.

No anonymous network fallback is used.  Production has the Macro checkout on the
same host; ``MACRO_OPPORTUNITY_TIMELINE_PATH`` exists only for a deliberate local
override in tests or recovery work.

Usage:
    MACRO_REPO=/opt/macro /opt/macro/.venv/bin/python ingest/pull_macro_opportunities.py
"""
from __future__ import annotations

import json
import logging
import os
import re
from datetime import date
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = Path(os.environ.get("TERMINAL_DATA_DIR") or
                (ROOT / "terminal" / "public" / "data"))
MACRO = Path(os.environ.get(
    "MACRO_REPO", "/Users/chriswong/Documents/Cluade/Macro Dashboard"))
SOURCE = Path(os.environ.get(
    "MACRO_OPPORTUNITY_TIMELINE_PATH",
    MACRO / "site" / "factordata" / "opportunity_timeline.json",
))

SCHEMA = "opportunity_timeline.v1"
_SAFE_SYMBOL = re.compile(r"^[A-Za-z0-9^][A-Za-z0-9.^=_+\-]{0,63}$")

log = logging.getLogger(__name__)


class SourceError(ValueError):
    """The source is unreadable or violates the bridge contract."""


def _reject_json_constant(token: str) -> None:
    """Reject NaN/Infinity, which Python accepts but browsers do not."""
    raise SourceError(f"non-JSON numeric constant: {token}")


def load_source(path: Path = SOURCE) -> dict:
    """Read *path* as strict JSON.  Raises ``SourceError`` on any failure."""
    try:
        raw = json.loads(path.read_text(), parse_constant=_reject_json_constant)
    except SourceError:
        raise
    except Exception as exc:  # noqa: BLE001 - converted to the fail-closed contract
        raise SourceError(f"cannot read {path}: {exc}") from exc
    if not isinstance(raw, dict):
        raise SourceError("artifact root must be an object")
    return raw


def validate_source(raw: dict) -> dict[str, object]:
    """Validate and normalize the fields the slice bridge consumes.

    Validation completes for the *whole* artifact before a slice is touched.  A
    malformed symbol row therefore cannot produce a half-updated universe.
    Event payloads remain otherwise opaque: Macro owns their versioned semantics.
    """
    if raw.get("schema") != SCHEMA:
        raise SourceError(
            f"schema must be {SCHEMA!r}, got {raw.get('schema')!r}")

    as_of = raw.get("as_of")
    if not isinstance(as_of, str) or not as_of.strip():
        raise SourceError("as_of must be a non-empty ISO date string")
    try:
        date.fromisoformat(as_of[:10])
    except ValueError as exc:
        raise SourceError(f"bad as_of date: {as_of!r}") from exc

    priced_through = raw.get("priced_through")
    if not isinstance(priced_through, dict):
        raise SourceError("priced_through must be an object keyed by market")

    symbols = raw.get("symbols")
    if not isinstance(symbols, dict):
        raise SourceError("symbols must be an object")

    normalized: dict[str, dict] = {}
    for source_symbol, row in symbols.items():
        if not isinstance(source_symbol, str):
            raise SourceError("every symbols key must be a string")
        symbol = source_symbol.strip().upper()
        if not _SAFE_SYMBOL.fullmatch(symbol):
            raise SourceError(f"unsafe symbol key: {source_symbol!r}")
        if symbol in normalized:
            raise SourceError(f"duplicate symbol after normalization: {symbol}")
        if not isinstance(row, dict):
            raise SourceError(f"symbols.{source_symbol} must be an object")
        events = row.get("events")
        if not isinstance(events, list):
            raise SourceError(f"symbols.{source_symbol}.events must be an array")
        if not all(isinstance(event, dict) for event in events):
            raise SourceError(
                f"symbols.{source_symbol}.events may contain only objects")
        normalized[symbol] = {"events": events}

    return {
        "schema": SCHEMA,
        "as_of": as_of,
        "priced_through": priced_through,
        "symbols": normalized,
    }


def _atomic_write_json(path: Path, payload: dict) -> None:
    """Write one complete slice without exposing a partially-written document."""
    tmp = path.with_name(f".{path.name}.opportunities.{os.getpid()}.tmp")
    try:
        tmp.write_text(json.dumps(payload, separators=(",", ":"), ensure_ascii=False))
        os.replace(tmp, path)
    finally:
        try:
            tmp.unlink(missing_ok=True)
        except OSError:
            pass


def embed_opportunities(validated: dict[str, object], data_dir: Path = DATA_DIR) -> dict[str, int]:
    """Embed validated receipts in existing slices and return update statistics."""
    symbols = validated["symbols"]
    assert isinstance(symbols, dict)  # established by validate_source
    common = {
        "schema": validated["schema"],
        "as_of": validated["as_of"],
        "priced_through": validated["priced_through"],
    }
    stats = {"updated": 0, "missing_slice": 0, "bad_slice": 0, "write_error": 0}

    for symbol, row in symbols.items():
        slice_path = data_dir / f"{symbol}.slice.json"
        if not slice_path.is_file():
            stats["missing_slice"] += 1
            continue
        try:
            current = json.loads(slice_path.read_text())
            if not isinstance(current, dict):
                raise ValueError("slice root is not an object")
        except Exception as exc:  # noqa: BLE001 - preserve this symbol's last-good file
            stats["bad_slice"] += 1
            log.warning("%s: existing slice unreadable; left untouched: %s", symbol, exc)
            continue

        # Read-modify-write only this sibling. In particular, never reconstruct a
        # slice from indicator/backtest fields: future sibling blocks must survive too.
        updated = dict(current)
        updated["opportunities"] = {**common, "events": row["events"]}
        try:
            _atomic_write_json(slice_path, updated)
        except Exception as exc:  # noqa: BLE001 - one failed file must not truncate it
            stats["write_error"] += 1
            log.warning("%s: opportunity embed failed; left last-good slice: %s", symbol, exc)
            continue
        stats["updated"] += 1

    return stats


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
    try:
        validated = validate_source(load_source(SOURCE))
    except SourceError as exc:
        log.warning("opportunity timeline unavailable/invalid; all slices left untouched: %s", exc)
        return 0

    stats = embed_opportunities(validated, DATA_DIR)
    log.info(
        "opportunity timeline embedded: as_of=%s updated=%d missing_slice=%d "
        "bad_slice=%d write_error=%d",
        validated["as_of"], stats["updated"], stats["missing_slice"],
        stats["bad_slice"], stats["write_error"],
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
