"""Recompute transcript speaker roles with the current conservative classifier.

The collector reconciles the recent quarters it visits, but improving role
inference still needs a complete-corpus pass.  This migration scans and validates
the complete archive before it writes anything, then atomically replaces only
bodies whose inferred roles changed.  Dry-run is the default; ``--write`` is
required to mutate data.
"""
from __future__ import annotations

import argparse
import gzip
import json
import os
import re
import sys
from dataclasses import dataclass
from pathlib import Path

try:  # direct execution: python ingest/repair_transcript_roles.py
    from build_transcript_index import _read_body
    from collect_transcripts import _infer_transcript_roles
except ImportError:  # module execution: python -m ingest.repair_transcript_roles
    from ingest.build_transcript_index import _read_body
    from ingest.collect_transcripts import _infer_transcript_roles


_REPO_ROOT = Path(__file__).resolve().parents[1]
_DEFAULT_TX_ROOT = _REPO_ROOT / "terminal" / "public" / "data" / "tx"
_TX_ID_RE = re.compile(r"^\d{4}Q[1-4]$")


@dataclass(frozen=True)
class RepairPlan:
    path: Path
    size: int
    mtime_ns: int
    roles: tuple[tuple[int, str, str], ...]


def _body_paths(tx_root: Path) -> list[Path]:
    return sorted(
        path
        for path in Path(tx_root).glob("*/*.json.gz")
        if _TX_ID_RE.fullmatch(path.name.removesuffix(".json.gz"))
    )


def plan_role_repairs(tx_root: Path) -> tuple[list[RepairPlan], dict[str, int | bool | str]]:
    """Validate the archive and return an in-memory mutation plan.

    No file is changed in this phase.  A corrupt body therefore aborts the
    migration before an earlier valid file can be rewritten.
    """
    root = Path(tx_root)
    if not root.is_dir():
        raise ValueError(f"transcript root is missing or not a directory: {root}")
    plans: list[RepairPlan] = []
    bodies = _body_paths(root)
    if not bodies:
        raise ValueError(f"transcript root contains no versioned gzip bodies: {root}")
    segments_scanned = 0
    roles_changed = 0
    roles_removed = 0
    roles_added = 0

    for path in bodies:
        sym = path.parent.name.strip().upper()
        tx_id = path.name.removesuffix(".json.gz")
        before = path.stat()
        payload = _read_body(path, sym, tx_id)
        after = path.stat()
        if before.st_size != after.st_size or before.st_mtime_ns != after.st_mtime_ns:
            raise RuntimeError(f"transcript changed during repair scan: {path}")
        updates: list[tuple[int, str, str]] = []
        inferred_roles = _infer_transcript_roles(payload["segments"])
        for index, (segment, new_role) in enumerate(zip(payload["segments"], inferred_roles)):
            segments_scanned += 1
            old_role = segment["role"]
            if new_role == old_role:
                continue
            updates.append((index, old_role, new_role))
            roles_changed += 1
            if old_role and not new_role:
                roles_removed += 1
            elif new_role and not old_role:
                roles_added += 1

        if updates:
            plans.append(RepairPlan(path, after.st_size, after.st_mtime_ns, tuple(updates)))

    return plans, {
        "schema": "mastermind.tx-role-repair/v1",
        "write": False,
        "bodies_scanned": len(bodies),
        "segments_scanned": segments_scanned,
        "bodies_changed": len(plans),
        "roles_changed": roles_changed,
        "roles_removed": roles_removed,
        "roles_added": roles_added,
        "bodies_written": 0,
    }


def _atomic_write_body(path: Path, payload: dict) -> None:
    raw = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    tmp = path.with_name(path.name + ".role-repair.tmp")
    try:
        with gzip.open(tmp, "wb", compresslevel=6) as handle:
            handle.write(raw)
        os.replace(tmp, path)
    finally:
        tmp.unlink(missing_ok=True)


def repair_roles(tx_root: Path, *, write: bool = False) -> dict[str, int | bool | str]:
    """Plan a corpus-wide repair and optionally apply it atomically per body."""
    plans, summary = plan_role_repairs(tx_root)
    if not write:
        return summary

    # Preflight every changed body before the first write.  The nightly lane is
    # single-writer, but this also catches accidental concurrent collection.
    for plan in plans:
        stat = plan.path.stat()
        if stat.st_size != plan.size or stat.st_mtime_ns != plan.mtime_ns:
            raise RuntimeError(f"transcript changed during repair scan: {plan.path}")

    for plan in plans:
        sym = plan.path.parent.name.strip().upper()
        tx_id = plan.path.name.removesuffix(".json.gz")
        payload = _read_body(plan.path, sym, tx_id)
        for index, expected_old, new_role in plan.roles:
            actual_old = payload["segments"][index]["role"]
            if actual_old != expected_old:
                raise RuntimeError(
                    f"transcript role changed during repair scan: {plan.path} segment {index}"
                )
            payload["segments"][index]["role"] = new_role
        _atomic_write_body(plan.path, payload)

    summary["write"] = True
    summary["bodies_written"] = len(plans)
    return summary


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tx-root", type=Path, default=_DEFAULT_TX_ROOT)
    parser.add_argument(
        "--write",
        action="store_true",
        help="atomically rewrite changed bodies (default is validation-only dry-run)",
    )
    args = parser.parse_args(argv)

    try:
        summary = repair_roles(args.tx_root, write=args.write)
    except Exception as exc:
        sys.stderr.write(json.dumps({"schema": "mastermind.tx-role-repair/v1", "error": str(exc)}))
        sys.stderr.write("\n")
        return 1
    sys.stdout.write(json.dumps(summary, separators=(",", ":")))
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
