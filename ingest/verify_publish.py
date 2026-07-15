"""Publish-integrity gate for the Terminal nightly (step 2 of the ORACLE_DESK_DIAGNOSIS fix program).

Runs between hydrate_prices and the atomic staging->live manifest swap in ops/terminal-data, as the
post-condition check on build_universe.reconcile_flagship_verdicts(): for every flagship row that
carries a verdict, assert it still agrees with the v2 slice the card reads.

  * manifest.verdict == slice.indicator.state.last_signal   (verdict lane == what the card renders)
  * manifest.wr/pf   ~= slice.backtest.metrics.win_rate/profit_factor  (metrics == the slice's backtest)
  * a row with a verdict but NO slice on disk                (reconcile should have demoted it)

WARN-ONLY by default: it prints a mismatch table and ALWAYS exits 0, so it can run in shadow for a few
nights and prove the reconcile holds without ever risking the nightly. Set TERMINAL_VERIFY_STRICT=1 to
exit nonzero on any mismatch — ops/terminal-data then blocks the swap and keeps staging for forensics.
Even in strict mode an INTERNAL error stays non-fatal in warn mode; a guard bug must never freeze the
manifest. Pure file+dict work: no pandas, no network — mirrors reconcile's row scoping (verdict key).
"""
from __future__ import annotations

import json
import math
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = Path(os.environ.get("TERMINAL_DATA_DIR") or (ROOT / "terminal" / "public" / "data"))
MANIFEST = Path(os.environ.get("TERMINAL_MANIFEST") or (OUT / "manifest.json"))


def _num_match(a, b) -> bool:
    """None==None ok; one-sided None is a mismatch; else close (same source, so effectively equal)."""
    if a is None and b is None:
        return True
    if a is None or b is None:
        return False
    try:
        return math.isclose(float(a), float(b), rel_tol=1e-3, abs_tol=0.01)
    except (TypeError, ValueError):
        return a == b


def check_manifest(symbols: dict[str, dict], out_dir: Path) -> list[dict]:
    """Return a list of mismatch records for every rich row whose published values contradict its slice.

    Scopes to rows carrying a `verdict` key (the rich/flagship set — plain search rows have none), the
    same population reconcile_flagship_verdicts touches. Pure: reads <SYM>.slice.json, mutates nothing.
    """
    out: list[dict] = []
    for sym, rec in symbols.items():
        if rec.get("verdict") is None:
            continue  # search rows + too-short flagship — nothing published to contradict
        sp = out_dir / f"{sym}.slice.json"
        if not sp.exists():
            out.append({"sym": sym, "kind": "no_slice", "manifest": rec.get("verdict"), "slice": None})
            continue
        try:
            slice_doc = json.loads(sp.read_text())
        except Exception as e:  # noqa: BLE001 — a corrupt slice is itself a publish-integrity failure
            out.append({"sym": sym, "kind": "slice_unreadable", "manifest": rec.get("verdict"), "slice": str(e)})
            continue
        ind = slice_doc.get("indicator", {}) or {}
        state = ind.get("state", {}) or {}
        metrics = (slice_doc.get("backtest", {}) or {}).get("metrics", {}) or {}
        ls = state.get("last_signal")
        if rec.get("verdict") != ls:
            out.append({"sym": sym, "kind": "verdict", "manifest": rec.get("verdict"), "slice": ls})
        if not _num_match(rec.get("wr"), metrics.get("win_rate")):
            out.append({"sym": sym, "kind": "wr", "manifest": rec.get("wr"), "slice": metrics.get("win_rate")})
        if not _num_match(rec.get("pf"), metrics.get("profit_factor")):
            out.append({"sym": sym, "kind": "pf", "manifest": rec.get("pf"), "slice": metrics.get("profit_factor")})
    return out


def _load_symbols(path: Path) -> dict[str, dict]:
    return json.loads(path.read_text()).get("symbols", {})


def main() -> int:
    strict = os.environ.get("TERMINAL_VERIFY_STRICT", "0") == "1"
    try:
        symbols = _load_symbols(MANIFEST)
    except Exception as e:  # noqa: BLE001
        print(f"verify_publish: cannot read manifest {MANIFEST}: {e}")
        return 1 if strict else 0

    mismatches = check_manifest(symbols, OUT)
    checked = sum(1 for r in symbols.values() if r.get("verdict") is not None)
    if not mismatches:
        print(f"verify_publish: OK — {checked} flagship verdicts consistent with their slices"
              f"{' (strict)' if strict else ''}")
        return 0

    by_kind: dict[str, int] = {}
    for m in mismatches:
        by_kind[m["kind"]] = by_kind.get(m["kind"], 0) + 1
    print(f"verify_publish: {len(mismatches)} MISMATCH across {checked} checked "
          f"({', '.join(f'{k}={v}' for k, v in sorted(by_kind.items()))})"
          f"{' — STRICT, blocking swap' if strict else ' — warn-only'}")
    for m in mismatches[:60]:
        print(f"  {m['sym']:<10} {m['kind']:<16} manifest={m['manifest']!r} slice={m['slice']!r}")
    if len(mismatches) > 60:
        print(f"  … +{len(mismatches) - 60} more")
    return 2 if strict else 0


if __name__ == "__main__":
    sys.exit(main())
