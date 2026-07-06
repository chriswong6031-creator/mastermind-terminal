"""One-time backfill: rewrite the flagship <SYM>.slice.json so the confluence signal history spans
the FULL deep <SYM>.json (to IPO), matching gen_slices_all / every non-flagship symbol.

WHY: build_polygon_universe used to run confluence on the shallow Polygon `close` (~6yr REST floor),
so AAPL/NVDA/TSLA/… showed BUY/SELL/CUT/REBUY markers only back to ~2021 even though the chart draws
IPO-deep bars — while CN/HK + non-flagship US (gen_slices_all, deep <SYM>.json) show full history.

This reads the already-deep OHLC on disk (NO network, does NOT touch <SYM>.json) and replaces ONLY
slice['indicator']; the existing slice['backtest'] (Polygon-fed WR/PF/CAGR) is preserved verbatim.
Idempotent — safe to re-run. The build_polygon_universe.py fix keeps the nightly cron correct going
forward; this script fixes the live slices immediately without waiting for the cron.

Run on the VPS (deep <SYM>.json + /opt/macro deep store present):
  MACRO_REPO=/opt/macro /opt/macro/.venv/bin/python ingest/regen_flagship_slices.py           # rewrite all
  MACRO_REPO=/opt/macro /opt/macro/.venv/bin/python ingest/regen_flagship_slices.py --check NVDA   # dry-run one
  TERMINAL_DATA_DIR=/some/staging ... --stage                                                  # write to staging
"""
from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from signal_layer import confluence, contracts  # noqa: E402
from ingest.build_polygon_universe import DEFAULT as FLAGSHIP  # noqa: E402

OUT = Path(os.environ.get("TERMINAL_DATA_DIR") or (ROOT / "terminal" / "public" / "data"))
HONEST = "RSI-MACD × StochRSI MTF confluence on full-history daily→3D. Risk/timing overlay + brain input."
try:
    SRC = (ROOT / "signal_layer" / "confluence.py").read_text()
except Exception:
    SRC = ""


def regen(sym: str, write: bool = True) -> str:
    jf = OUT / f"{sym}.json"
    sf = OUT / f"{sym}.slice.json"
    if not jf.exists():
        return f"{sym}: NO OHLC file"
    d = json.loads(jf.read_text())
    bars = d.get("bars") or []
    if len(bars) < 60:
        return f"{sym}: only {len(bars)}b — skip"
    idx = pd.to_datetime([b[0] for b in bars])
    close = pd.Series([float(b[4]) for b in bars], index=idx)
    sig = confluence.compute_signals(
        close,
        bar_anchor=confluence.ipo_bar_anchor(close, sym),
        week_parity=confluence.ipo_week_parity(close, sym),
    )
    if sig.empty:
        return f"{sym}: empty sig ({len(bars)}b)"
    ind = contracts.indicator_contract(
        sym, "3D", sig, bar_quality="real_ohlc", src_text=SRC, honest_read=HONEST)
    for heavy in ("series", "gates", "bars"):
        ind.pop(heavy, None)
    sigs = ind.get("signals", [])
    span = f"{sigs[0]['ts']}→{sigs[-1]['ts']}" if sigs else "none"
    # preserve the existing Polygon-fed backtest slice (OracleDash reads slice.backtest)
    out = {"indicator": ind}
    if sf.exists():
        try:
            existing = json.loads(sf.read_text())
            if "backtest" in existing:
                out["backtest"] = existing["backtest"]
        except Exception:
            pass
    if write:
        sf.write_text(json.dumps(out, separators=(",", ":")))
    return f"{sym}: {len(sigs)} sigs [{span}] over {len(bars)}b  state={ind['state'].get('last_signal')}  bt={'kept' if 'backtest' in out else 'MISSING'}"


def main() -> None:
    if "--check" in sys.argv:
        sym = sys.argv[sys.argv.index("--check") + 1]
        print(regen(sym, write=False))
        return
    t0 = time.time()
    ok = 0
    for sym in FLAGSHIP:
        try:
            print(" ", regen(sym, write=True), flush=True)
            ok += 1
        except Exception as e:  # noqa: BLE001
            print(f"  ERR {sym}: {e}", flush=True)
    print(f"done: {ok}/{len(FLAGSHIP)} flagship slices rewritten in {time.time() - t0:.0f}s -> {OUT}")


if __name__ == "__main__":
    main()
