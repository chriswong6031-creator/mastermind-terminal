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
import os
import sys
import time
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from ingest.polygon_bars import fetch_daily, ohlc_json   # noqa: E402
from signal_layer import confluence, contracts, backtest  # noqa: E402

OUT = ROOT / "terminal" / "public" / "data"
MANIFEST = Path(os.environ.get("TERMINAL_MANIFEST") or (OUT / "manifest.json"))

META = {
    "NVDA": ("NVIDIA Corp", "Equities", "#76b900"),
    "AAPL": ("Apple Inc", "Equities", "#a2aaad"),
    "MSFT": ("Microsoft Corp", "Equities", "#3b82f6"),
    "GOOGL": ("Alphabet Inc", "Equities", "#4285f4"),
    "AMZN": ("Amazon.com", "Equities", "#ff9900"),
    "META": ("Meta Platforms", "Equities", "#0668e1"),
    "TSLA": ("Tesla Inc", "Equities", "#e82127"),
    "AMD": ("Advanced Micro Devices", "Equities", "#ed1c24"),
    "AVGO": ("Broadcom Inc", "Equities", "#cc0000"),
    "NFLX": ("Netflix Inc", "Equities", "#e50914"),
    "CRM": ("Salesforce Inc", "Equities", "#00a1e0"),
    "SMCI": ("Super Micro Computer", "Equities", "#7cb342"),
    "ARM": ("Arm Holdings", "Equities", "#0091bd"),
    "PLTR": ("Palantir Technologies", "Equities", "#101113"),
    "MSTR": ("MicroStrategy", "Equities", "#f7931a"),
    "MU": ("Micron Technology", "Equities", "#0033a0"),
    "INTC": ("Intel Corp", "Equities", "#0071c5"),
    "COIN": ("Coinbase Global", "Equities", "#0052ff"),
    "JPM": ("JPMorgan Chase", "Equities", "#1a3c6e"),
    "V": ("Visa Inc", "Equities", "#1a1f71"),
    "XOM": ("Exxon Mobil", "Equities", "#e31837"),
    "LLY": ("Eli Lilly", "Equities", "#d52b1e"),
    "COST": ("Costco Wholesale", "Equities", "#005daa"),
    "SPY": ("SPDR S&P 500 ETF", "Equities", "#1f8a4c"),
    "QQQ": ("Invesco QQQ Trust", "Equities", "#4d82ff"),
    "IWM": ("iShares Russell 2000", "Equities", "#6f42c1"),
    "DIA": ("SPDR Dow Jones", "Equities", "#2e7d32"),
    "SOXL": ("Direxion Semis 3x", "Equities", "#ff6d00"),
    "GLD": ("SPDR Gold Shares", "Equities", "#d4af37"),
    "TLT": ("iShares 20+ Treasury", "Equities", "#5c6bc0"),
    "BTC-USD": ("Bitcoin", "Crypto", "#f7931a"),
    "ETH-USD": ("Ethereum", "Crypto", "#627eea"),
    "SOL-USD": ("Solana", "Crypto", "#14f195"),
    "XRP-USD": ("XRP", "Crypto", "#23292f"),
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

        # Phase the 3D session grid (and the 2-week confirm pairing) to the symbol's IPO so they
        # match a full-history TV chart (Polygon feed is truncated to ~6yr; defaults mis-phase).
        anchor = confluence.ipo_bar_anchor(close, sym)
        wparity = confluence.ipo_week_parity(close, sym)
        sig = confluence.compute_signals(close, bar_anchor=anchor, week_parity=wparity)
        if not sig.empty:
            ind = contracts.indicator_contract(
                sym, "3D", sig, bar_quality="real_ohlc", src_text=src,
                honest_read="RSI-MACD × StochRSI MTF confluence on Polygon daily→3D. Risk/timing overlay + brain input.")
            bt = backtest.run_backtest(close, fixed=True, bar_quality="real_ohlc",
                                       bar_anchor=anchor, week_parity=wparity)
            btc = contracts.backtest_contract(
                sym, "3D", bt,
                honest_read="As-traded Polygon backtest after costs; significance verdict delegated to loop/harness.")
            # chart slice keeps the FULL indicator signal history (model_slice caps to 12 for the
            # Opus token budget — the chart needs every BUY/SELL/CUT/REBUY marker, not just recent);
            # backtest stays sliced (it carries heavy trade/equity arrays).
            slim = {"indicator": ind, "backtest": contracts.model_slice(btc)}
            (OUT / f"{sym}.slice.json").write_text(json.dumps(slim, indent=2))

            # Write full backtest contract + equity curve (HANDOFF §7.3)
            if bt.get("status") == "ok" and bt.get("trades"):
                _rets = bt.get("_returns", [])
                _idx = bt.get("_returns_index", [])
                # Build cumulative equity curve: start 1.0, compound each bar return
                eq_v = [1.0]
                for r in _rets:
                    eq_v.append(round(eq_v[-1] * (1.0 + r), 8))
                bh_tr = bt.get("metrics", {}).get("vs_buy_hold", {}).get("bh_total_return")
                equity_obj = {
                    "t": [bt["first"]] + _idx,
                    "v": eq_v,
                    "bh_total_return": bh_tr,
                }
                # backtest_contract dict + "equity" key; strip raw _returns/_returns_index
                full_bt = {k: v for k, v in btc.items() if k not in ("_returns", "_returns_index")}
                full_bt["equity"] = equity_obj
                (OUT / f"{sym}.backtest.json").write_text(
                    json.dumps(full_bt, separators=(",", ":"))
                )
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
    MANIFEST.write_text(json.dumps(manifest, indent=2))
    print(f"\nmanifest: {len(manifest['symbols'])} symbols, as_of {manifest['as_of']}")


if __name__ == "__main__":
    main(sys.argv[1:] or DEFAULT)
