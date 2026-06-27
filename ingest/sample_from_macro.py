"""Phase 0 data bridge / sample generator.

Reads the macro repo's deep OHLC store and produces, from REAL data:
  * web/ohlc/<T>.json            — the chart's OHLC contract (mirrors the macro
                                    repo's build_chart_data.py format exactly, so
                                    the lifted chart.js renders it unchanged)
  * contracts/samples/<T>.indicator.json   — mastermind.indicator/v1
  * contracts/samples/<T>.backtest.json    — backtest_result/v1
  * contracts/samples/<T>.model_slice.json — what Opus actually ingests

This doubles as the worked example of the data-contract seam. In Phase 1 the same
shapes are produced from the live Polygon/Alpaca feed instead of the macro parquet.

Usage:  python ingest/sample_from_macro.py [TICKER ...]   (default: AAPL NVDA)
        MACRO_REPO=/path/to/macro  overrides the source repo.
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from signal_layer import backtest, contracts, golden_gate   # noqa: E402

MACRO = Path(os.environ.get("MACRO_REPO", "/Users/chriswong/Documents/Cluade/Macro Dashboard"))
STOCKS = MACRO / "data" / "stocks"
MAX_BARS = 700
TIMEFRAME = "3D"   # the timeframe confluence.compute_signals runs on
BAR_QUALITY = "synthetic_open_deepstore"   # deep store has no real open (P0-3)


def _round(x, nd=4):
    return None if x is None or pd.isna(x) else round(float(x), nd)


def build_ohlc_json(ticker: str, df: pd.DataFrame) -> dict:
    """Candle contract, reconstructing open = prior close and clamping h/l to
    include it (verbatim with macro build_chart_data.py — keeps candles upright)."""
    df = df.tail(MAX_BARS)
    closes = df["close"].astype(float)
    prev = closes.shift(1).fillna(closes)
    bars = []
    for dt, c, o in zip(df.index, closes, prev):
        hi = df.at[dt, "high"] if "high" in df else c
        lo = df.at[dt, "low"] if "low" in df else c
        hi = max(_round(hi) or c, c, o)
        lo = min(_round(lo) or c, c, o)
        vol = _round(df.at[dt, "volume"], 0) if "volume" in df else None
        bars.append([dt.strftime("%Y-%m-%d"), _round(o), hi, lo, _round(c), vol])
    return {"t": ticker, "o": 1, "src": "deep", "bar_quality": BAR_QUALITY, "bars": bars}


def main(tickers: list[str]) -> None:
    (ROOT / "web" / "ohlc").mkdir(parents=True, exist_ok=True)
    (ROOT / "contracts" / "samples").mkdir(parents=True, exist_ok=True)

    for t in tickers:
        p = STOCKS / f"{t}.parquet"
        if not p.exists():
            print(f"  skip {t}: {p} not found")
            continue
        df = pd.read_parquet(p)
        if "close" not in df:
            print(f"  skip {t}: no close column")
            continue
        df = df.dropna(subset=["close"]).sort_index()
        close = df["close"].astype(float)

        # 1) chart OHLC
        ohlc = build_ohlc_json(t, df)
        (ROOT / "web" / "ohlc" / f"{t}.json").write_text(
            json.dumps(ohlc, separators=(",", ":")))

        # 2) golden gate (self-check in Phase 0b: candidate engine == oracle)
        gate = golden_gate.check(close, bar_quality=BAR_QUALITY)

        # 3) indicator contract (mastermind.indicator/v1)
        from signal_layer import confluence
        sig = confluence.compute_signals(close)
        src_text = (ROOT / "signal_layer" / "confluence.py").read_text()
        ind = contracts.indicator_contract(
            t, TIMEFRAME, sig, bar_quality=BAR_QUALITY, src_text=src_text,
            validation={"max_series_abs_diff": gate["max_series_abs_diff"],
                        "event_match": gate["event_match"],
                        "gate_symbol_bar_quality": BAR_QUALITY},
            honest_read=("RSI-MACD × StochRSI MTF confluence on the 3D. Risk/timing "
                         "overlay + brain input, not a standalone return engine. "
                         "Gate ran on synthetic-open deep-store data — advisory only."))
        (ROOT / "contracts" / "samples" / f"{t}.indicator.json").write_text(
            json.dumps(ind, indent=2))

        # 4) backtest contract (backtest_result/v1) + the returns sidecar
        bt = backtest.run_backtest(close, fixed=True, bar_quality=BAR_QUALITY)
        series_ref = f"data/backtests/{t}__{bt.get('last')}.returns.parquet"
        if bt.get("_returns"):
            (ROOT / "data" / "backtests").mkdir(parents=True, exist_ok=True)
            pd.DataFrame({"ret": bt["_returns"]},
                         index=pd.to_datetime(bt["_returns_index"])).to_parquet(ROOT / series_ref)
        btc = contracts.backtest_contract(
            t, TIMEFRAME, bt, series_ref=series_ref,
            honest_read=("As-traded result of the user's Pine confluence on the 3D, "
                         "after costs. Significance verdict is delegated to "
                         "Mastermind loop/harness via series_ref — not computed here."))
        (ROOT / "contracts" / "samples" / f"{t}.backtest.json").write_text(
            json.dumps(btc, indent=2))

        # 5) the model-facing slices (what Opus ingests — no raw arrays)
        slim = {"indicator": contracts.model_slice(ind),
                "backtest": contracts.model_slice(btc)}
        (ROOT / "contracts" / "samples" / f"{t}.model_slice.json").write_text(
            json.dumps(slim, indent=2))

        m = bt.get("metrics", {})
        print(f"  {t}: {len(ohlc['bars'])} bars | gate diff={gate['max_series_abs_diff']:.2e} "
              f"events_match={gate['event_match']} | {len(ind['signals'])} signals | "
              f"bt n={m.get('n_trades')} sharpe={m.get('sharpe')} cagr={m.get('cagr')} "
              f"maxDD={m.get('max_dd')}")


if __name__ == "__main__":
    main(sys.argv[1:] or ["AAPL", "NVDA"])
