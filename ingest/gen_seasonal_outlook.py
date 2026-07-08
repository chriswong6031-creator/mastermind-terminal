"""Emit the regime-aware seasonal-outlook artifact per symbol.

For each symbol: pull DEEP daily history (yfinance `period=max` — IPO-to-now, no API key,
matching the terminal's deep-EOD backfill), run signal_layer.seasonal_regime, and write
terminal/public/data/<SYM>.seasonal.json (schema mastermind.seasonal_outlook/v1). Falls back
to the on-disk OHLC (<SYM>.json) when yfinance is unavailable.

Usage:  python ingest/gen_seasonal_outlook.py [SYM ...] [--only SYM,SYM]
Outputs into terminal/public/data/ (served by the Next app at /data/*). Display-only.
"""
from __future__ import annotations

import json
import sys
import warnings
from pathlib import Path

import pandas as pd

warnings.filterwarnings("ignore")

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from ingest.build_polygon_universe import DEFAULT   # noqa: E402  (reuse the symbol universe)
from signal_layer import seasonal_regime as sr      # noqa: E402

OUT = ROOT / "terminal" / "public" / "data"
MIN_BARS = 260   # ~1yr; below this the engine returns an "insufficient" outlook anyway


def fetch_close(sym: str) -> pd.Series | None:
    """Deep adjusted-close history via yfinance (split/div-adjusted), oldest→newest."""
    import yfinance as yf
    df = yf.download(sym, period="max", interval="1d", progress=False, auto_adjust=True)
    if df is None or len(df) == 0:
        return None
    c = df["Close"]
    if hasattr(c, "columns"):        # yfinance can return a 1-col frame
        c = c.iloc[:, 0]
    c.index = pd.to_datetime(c.index)
    return c.astype(float).dropna().sort_index()


def close_from_disk(sym: str) -> pd.Series | None:
    """Fallback: the terminal's on-disk OHLC (shallower, but keeps the pipeline offline-safe)."""
    p = OUT / f"{sym}.json"
    if not p.exists():
        return None
    bars = json.loads(p.read_text()).get("bars", [])
    if not bars:
        return None
    df = pd.DataFrame(bars, columns=["date", "o", "h", "l", "c", "v"])
    df["date"] = pd.to_datetime(df["date"])
    return df.set_index("date")["c"].astype(float).sort_index()


def build_one(sym: str) -> dict | None:
    close = None
    try:
        close = fetch_close(sym)
    except Exception as e:
        print(f"  {sym}: yfinance error ({e}); falling back to disk")
    if close is None or len(close) < MIN_BARS:
        close = close_from_disk(sym)
    if close is None or len(close) < MIN_BARS:
        print(f"  skip {sym}: no usable history")
        return None
    return sr.build_outlook(sym, close)


def main(syms: list[str]) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    ok = 0
    for sym in syms:
        outlook = build_one(sym)
        if outlook is None:
            continue
        (OUT / f"{sym}.seasonal.json").write_text(json.dumps(outlook, indent=2, sort_keys=True))
        v = outlook.get("validation", {})
        print(f"  {sym}: {outlook['history']['complete_years']}y "
              f"mode={outlook['mode']} skill={v.get('skill')} verdict={v.get('verdict')} "
              f"| bull/bear baseline={_bb(outlook.get('intervals_baseline', []))} regime={_bb(outlook.get('intervals_regime', []))}")
        ok += 1
    print(f"\nseasonal-outlook: wrote {ok}/{len(syms)} symbols → {OUT}")


def _bb(intervals: list[dict]) -> str:
    b = sum(1 for i in intervals if i["dir"] == "bull")
    r = sum(1 for i in intervals if i["dir"] == "bear")
    return f"{b}/{r}"


if __name__ == "__main__":
    args: list[str] = []
    only: list[str] = []
    for a in sys.argv[1:]:
        if a.startswith("--only"):
            only = a.split("=", 1)[1].split(",") if "=" in a else []
        elif not a.startswith("--"):
            args.append(a)
    main(only or args or DEFAULT)
