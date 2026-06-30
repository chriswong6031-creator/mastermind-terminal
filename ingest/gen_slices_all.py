"""Generate <SYM>.slice.json confluence slices for the BROAD universe from already-fetched OHLC.

build_polygon_universe.py only writes slices for the flagship ~34 (with a full backtest + the precise
IPO anchor). Every OTHER symbol that has a <SYM>.json OHLC file has NO slice, so the chart's confluence
indicator (BUY/SELL/CUT/REBUY markers + the GOLDEN ORACLE verdict) never renders on it. This script
fills that gap: for each non-flagship symbol it computes the confluence signals from the existing daily
OHLC and writes a SLIM slice — the indicator's `signals` + `state` only (the chart reads nothing else;
the heavy `series`/`gates`/`bars` arrays and the backtest are dropped to keep the files small).

No network: it reads <SYM>.json that the nightly OHLC refresh already produced. The 3D session grid is
phased to each symbol's IPO when the deep store has it (US deep-store names), and falls back to a
feed-anchored phase otherwise (still session-grouped — see confluence.ipo_bar_anchor).

Modes:
  (default)        regenerate every non-flagship slice from current OHLC (keeps signals fresh nightly)
  --only-missing   only create slices that don't exist yet (cheap incremental backfill)
  --limit N        process at most N symbols (smoke testing)

Run with the macro venv python:
  /opt/macro/.venv/bin/python ingest/gen_slices_all.py [--only-missing] [--limit N]
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from signal_layer import confluence, contracts  # noqa: E402
from ingest.build_polygon_universe import DEFAULT as FLAGSHIP  # the ~34 with rich slices  # noqa: E402

OUT = ROOT / "terminal" / "public" / "data"
HONEST = "RSI-MACD × StochRSI MTF confluence on daily→3D. Risk/timing overlay."
FLAG = set(FLAGSHIP)


def _arg_int(flag: str, default: int) -> int:
    if flag in sys.argv:
        try:
            return int(sys.argv[sys.argv.index(flag) + 1])
        except Exception:
            pass
    return default


def main() -> None:
    only_missing = "--only-missing" in sys.argv
    limit = _arg_int("--limit", 0)
    files = sorted(OUT.glob("*.json"))
    n_ok = n_skip = n_err = 0
    t0 = time.time()
    for jf in files:
        name = jf.name
        if name == "manifest.json" or "staging" in name or name.endswith((".slice.json", ".intel.json", ".backtest.json")):
            continue
        sym = name[:-5]
        if sym in FLAG:
            continue  # flagship keeps its precise build_polygon_universe slice (with backtest)
        slice_f = OUT / f"{sym}.slice.json"
        if only_missing and slice_f.exists():
            continue
        try:
            d = json.loads(jf.read_text())
            bars = d.get("bars") or []
            if len(bars) < 60:
                n_skip += 1
                continue
            idx = pd.to_datetime([b[0] for b in bars])
            close = pd.Series([float(b[4]) for b in bars], index=idx)
            sig = confluence.compute_signals(
                close,
                bar_anchor=confluence.ipo_bar_anchor(close, sym),
                week_parity=confluence.ipo_week_parity(close, sym),
            )
            if sig.empty:
                n_skip += 1
                continue
            ind = contracts.indicator_contract(
                sym, "3D", sig, bar_quality="real_ohlc", src_text="", honest_read=HONEST)
            # the chart only consumes indicator.signals + indicator.state — drop the heavy arrays
            for heavy in ("series", "gates", "bars"):
                ind.pop(heavy, None)
            slice_f.write_text(json.dumps({"indicator": ind}, separators=(",", ":")))
            n_ok += 1
            if n_ok % 250 == 0:
                print(f"  …{n_ok} slices ({time.time() - t0:.0f}s)", flush=True)
            if limit and n_ok >= limit:
                break
        except Exception as e:  # noqa: BLE001
            n_err += 1
            if n_err <= 20:
                print(f"  ERR {sym}: {e}", flush=True)
    mode = "missing-only" if only_missing else "full regen"
    print(f"gen_slices_all done: {n_ok} written, {n_skip} skipped, {n_err} errors in {time.time() - t0:.0f}s ({mode})")


if __name__ == "__main__":
    main()
