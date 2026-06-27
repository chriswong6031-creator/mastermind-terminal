"""Build the terminal's market data from Polygon (backtesting feed).

For each symbol: fetch daily bars → write the OHLC contract; run the user's faithful
confluence signal + Tier-1 backtest → write the model-sliced indicator+backtest
contracts; and roll a `manifest.json` (last price, % change, Golden-Oracle verdict,
WR/PF/CAGR, regime) so the terminal renders REAL prices + per-symbol verdicts.

Usage:  POLYGON_API_KEY=… python ingest/build_polygon_universe.py [SYM ...]
Outputs into terminal/public/data/ (served by the Next app at /data/*).
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from ingest.polygon_bars import fetch_daily, ohlc_json   # noqa: E402
from signal_layer import confluence, contracts, backtest  # noqa: E402

OUT = ROOT / "terminal" / "public" / "data"

META = {
    "NVDA": ("NVIDIA Corp", "Equities", "#76b900"),
    "AAPL": ("Apple Inc", "Equities", "#a2aaad"),
    "MSFT": ("Microsoft Corp", "Equities", "#3b82f6"),
    "QQQ": ("Invesco QQQ Trust", "Equities", "#4d82ff"),
    "TSLA": ("Tesla Inc", "Equities", "#e82127"),
    "AMD": ("Advanced Micro Devices", "Equities", "#ed1c24"),
    "AVGO": ("Broadcom Inc", "Equities", "#cc0000"),
    "COIN": ("Coinbase Global", "Equities", "#0052ff"),
    "SPY": ("SPDR S&P 500 ETF", "Equities", "#1f8a4c"),
    "BTC-USD": ("Bitcoin", "Crypto", "#f7931a"),
    "ETH-USD": ("Ethereum", "Crypto", "#627eea"),
    "SOL-USD": ("Solana", "Crypto", "#14f195"),
}
DEFAULT = list(META.keys())


def main(syms: list[str]) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    src = (ROOT / "signal_layer" / "confluence.py").read_text()
    manifest: dict = {"as_of": None, "source": "polygon", "symbols": {}}
    for sym in syms:
        bars = fetch_daily(sym, years=6)
        if len(bars) < 120:
            print(f"  skip {sym}: {len(bars)} bars")
            continue
        (OUT / f"{sym}.json").write_text(json.dumps(ohlc_json(sym, bars), separators=(",", ":")))

        df = pd.DataFrame(bars, columns=["date", "o", "h", "l", "c", "v"])
        df["date"] = pd.to_datetime(df["date"])
        close = df.set_index("date")["c"].astype(float)
        last, prev = float(close.iloc[-1]), float(close.iloc[-2])
        chg = (last - prev) / prev * 100

        name, sec, col = META.get(sym, (sym, "Equities", "#888"))
        lb = bars[-1]  # [date,o,h,l,c,v]
        hi52 = float(df["h"].tail(252).max()); lo52 = float(df["l"].tail(252).min())
        row = {"name": name, "sec": sec, "col": col, "last": round(last, 4), "chg": round(chg, 2),
               "open": lb[1], "high": lb[2], "low": lb[3], "vol": lb[5],
               "hi52": round(hi52, 2), "lo52": round(lo52, 2),
               "verdict": None, "wr": None, "pf": None, "cagr": None, "regimeBull": None}

        sig = confluence.compute_signals(close)
        if not sig.empty:
            ind = contracts.indicator_contract(
                sym, "3D", sig, bar_quality="real_ohlc", src_text=src,
                honest_read="RSI-MACD × StochRSI MTF confluence on Polygon daily→3D. Risk/timing overlay + brain input.")
            bt = backtest.run_backtest(close, fixed=True, bar_quality="real_ohlc")
            btc = contracts.backtest_contract(
                sym, "3D", bt,
                honest_read="As-traded Polygon backtest after costs; significance verdict delegated to loop/harness.")
            slim = {"indicator": contracts.model_slice(ind), "backtest": contracts.model_slice(btc)}
            (OUT / f"{sym}.slice.json").write_text(json.dumps(slim, indent=2))
            st = slim["indicator"]["state"]
            m = slim["backtest"]["metrics"]
            row.update(verdict=st.get("last_signal"),
                       regimeBull=bool(st.get("above200") and st.get("weeklyBull")),
                       wr=m.get("win_rate"), pf=m.get("profit_factor"), cagr=m.get("cagr"))
            print(f"  {sym}: {len(bars)}b last={last:.2f} {chg:+.2f}% | {st.get('last_signal')} "
                  f"WR={m.get('win_rate')} PF={m.get('profit_factor')} CAGR={m.get('cagr')}")
        else:
            print(f"  {sym}: {len(bars)}b last={last:.2f} (no signal — too short)")
        manifest["symbols"][sym] = row
        manifest["as_of"] = bars[-1][0]
        time.sleep(0.2)
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2))
    print(f"\nmanifest: {len(manifest['symbols'])} symbols, as_of {manifest['as_of']}")


if __name__ == "__main__":
    main(sys.argv[1:] or DEFAULT)
