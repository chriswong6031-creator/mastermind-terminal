"""Polygon historical bars → the chart OHLC contract.

Backtesting feed (NOT live trading — that waits on the Alpaca/live decision). Reuses
the macro repo's Polygon/Massive key (api.polygon.io). Real OHLC, so bar_quality is
"real_ohlc" (unlike the macro deep store's synthetic open).

We shell out to `curl` rather than urllib because some edge endpoints 1010-block the
default urllib user-agent (learned the hard way against another API).
"""
from __future__ import annotations

import datetime as dt
import json
import os
import subprocess

BASE = "https://api.polygon.io"
KEY = os.environ.get("POLYGON_API_KEY") or os.environ.get("MASSIVE_API_KEY") or ""

# DB/UI symbol → Polygon ticker (crypto needs the X: prefix and no dash)
CRYPTO = {"BTC-USD": "X:BTCUSD", "ETH-USD": "X:ETHUSD", "SOL-USD": "X:SOLUSD", "XRP-USD": "X:XRPUSD"}

# Polygon aggs are keyed by TICKER STRING, so a symbol whose ticker previously belonged
# to a DIFFERENT security returns the old holder's bars too. META has been Meta Platforms
# only since the FB→META rename on 2022-06-09; before that the ticker was the Roundhill
# Ball Metaverse ETF (~$12-15), whose bars poisoned the 2022 seasonality path (a fake
# +1395% Jan→Jun jump) and the confluence/backtest close series.
HISTORY_START = {"META": "2022-06-09"}

# Generic guard for the same failure shape anywhere else in the universe: a months-long
# trading gap combined with an extreme price jump across it means the ticker changed
# hands. Keep only the newest contiguous segment — a real halt this violent is rare, and
# for charting/seasonality the recent segment is the honest series either way.
REUSE_GAP_DAYS = 45
REUSE_JUMP_RATIO = 3.0


def drop_stale_ticker_history(sym: str, bars: list) -> list:
    """Trim bars that predate the current holder of a reused ticker.

    bars: [[date, o, h, l, c, v], ...] ascending. Applies the curated HISTORY_START
    cutoff first, then the generic gap+jump discontinuity guard.
    """
    start = HISTORY_START.get(sym)
    if start:
        bars = [b for b in bars if b[0] >= start]
    cut = 0
    for i in range(1, len(bars)):
        prev_b, cur_b = bars[i - 1], bars[i]
        try:
            gap = (dt.date.fromisoformat(cur_b[0]) - dt.date.fromisoformat(prev_b[0])).days
        except ValueError:
            continue
        pc, cc = prev_b[4], cur_b[4]
        if gap >= REUSE_GAP_DAYS and pc and cc:
            ratio = cc / pc
            if ratio >= REUSE_JUMP_RATIO or ratio <= 1 / REUSE_JUMP_RATIO:
                cut = i  # keep scanning: retain only the segment after the LAST break
    if cut:
        print(f"  {sym}: dropped {cut} pre-{bars[cut][0]} bars (ticker-reuse discontinuity)")
        bars = bars[cut:]
    return bars


def poly_ticker(sym: str) -> str:
    return CRYPTO.get(sym, sym)


def _get(url: str) -> dict:
    r = subprocess.run(["curl", "-s", "-m", "30", url], capture_output=True, text=True)
    try:
        return json.loads(r.stdout)
    except json.JSONDecodeError:
        return {"status": "ERROR", "error": r.stdout[:200]}


def fetch_daily(sym: str, years: int = 6, end: dt.date | None = None) -> list:
    """Daily OHLCV bars as [date, o, h, l, c, v] (oldest→newest)."""
    if not KEY:
        raise RuntimeError("POLYGON_API_KEY / MASSIVE_API_KEY not set")
    end = end or dt.date.today()
    start = end - dt.timedelta(days=int(365.25 * years) + 5)
    t = poly_ticker(sym)
    url = (f"{BASE}/v2/aggs/ticker/{t}/range/1/day/{start}/{end}"
           f"?adjusted=true&sort=asc&limit=50000&apiKey={KEY}")
    d = _get(url)
    if d.get("status") not in ("OK", "DELAYED") or not d.get("results"):
        return []
    out = []
    for a in d["results"]:
        date = dt.datetime.utcfromtimestamp(a["t"] / 1000).strftime("%Y-%m-%d")
        out.append([date, round(a["o"], 4), round(a["h"], 4), round(a["l"], 4),
                    round(a["c"], 4), int(a.get("v", 0))])
    return drop_stale_ticker_history(sym, out)


def ohlc_json(sym: str, bars: list) -> dict:
    """The chart OHLC contract (mirrors build_chart_data.py; real OHLC from Polygon)."""
    return {"t": sym, "o": 1, "src": "polygon", "bar_quality": "real_ohlc", "bars": bars}
