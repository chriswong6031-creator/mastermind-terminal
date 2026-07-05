"""Phase 2b — backfill per-symbol chart OHLC for the expanded search universe.

Writes terminal/public/data/<SYMBOL>.json (REAL OHLC contract) for every manifest
symbol that doesn't already have one, choosing a feed by market:
  * US (NYSE/NASDAQ/AMEX/US/Cboe) -> Polygon daily aggs
  * HK (.HK)                       -> yfinance
  * Canada (.TO)                   -> yfinance
  * Intl (all other exchange suffixes: .T .KS .TW .NS .AX .L .SW .DE .MC .PA
           .MI .AS .BR .HE .CO .ST .VI .IR .OL .LS)   -> yfinance
  * China (.SS/.SZ)                -> already built from the macro store (skipped)

Resumable: skips any symbol that already has a JSON, so it's safe to re-run / run in
the background. Concurrency via a thread pool; JSON written as each symbol completes.

  python ingest/backfill_ohlc.py [--market US|HK|CA|INTL|all] [--limit N] [--workers N]
"""
from __future__ import annotations

import json
import os
import sys
import time
import datetime as dt
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
# OUT is env-overridable so a full-history backfill can stage into a scratch dir
# (e.g. /tmp/ohlc-full) and rsync only the deepened files up, without dirtying the
# live/repo data dir. MANIFEST stays independently overridable.
OUT = Path(os.environ.get("TERMINAL_DATA_DIR") or (ROOT / "terminal" / "public" / "data"))
MANIFEST = Path(os.environ.get("TERMINAL_MANIFEST") or (OUT / "manifest.json"))
# PERIOD drives yfinance history depth. Default "max" = ENTIRE listed history (back to
# IPO / Yahoo's earliest bar), which is what the full-history backfill wants. Override
# with BACKFILL_PERIOD=15y etc. for a shallower/faster run. MAX_BARS is a safety ceiling
# only (60y of daily ~= 15,120 bars; 20k never truncates a real equity's full history).
PERIOD = os.environ.get("BACKFILL_PERIOD", "max")
MAX_BARS = 20000
YEARS = 15  # legacy fallback for the (unused) Polygon date-range path


def _polygon_key() -> str | None:
    if os.environ.get("POLYGON_API_KEY"):
        return os.environ["POLYGON_API_KEY"]
    env = ROOT / ".env"
    if env.exists():
        for line in env.read_text().splitlines():
            if line.startswith("POLYGON_API_KEY="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    return None


POLY = _polygon_key()


def _round(x, nd=4):
    try:
        f = float(x)
    except (TypeError, ValueError):
        return None
    return None if f != f else round(f, nd)


def write_json(ticker: str, rows: list[list], src: str) -> int:
    """rows: [[date,o,h,l,c,v], ...] ascending. Returns bar count (0 = nothing written)."""
    rows = [r for r in rows if r[4] is not None][-MAX_BARS:]
    if len(rows) < 30:
        return 0
    doc = {"t": ticker, "o": 1, "src": src, "bar_quality": "real_ohlc", "bars": rows}
    (OUT / f"{ticker}.json").write_text(json.dumps(doc, separators=(",", ":")))
    return len(rows)


# ---------------------------------------------------------------- Polygon (US)
def fetch_polygon(ticker: str) -> list[list]:
    to = dt.date.today()
    frm = to - dt.timedelta(days=int(YEARS * 365.25))
    url = (f"https://api.polygon.io/v2/aggs/ticker/{ticker}/range/1/day/{frm}/{to}"
           f"?adjusted=true&sort=asc&limit=50000&apiKey={POLY}")
    for attempt in range(4):
        try:
            with urllib.request.urlopen(url, timeout=30) as r:
                payload = json.loads(r.read())
            rows = []
            for b in payload.get("results", []) or []:
                d = dt.datetime.utcfromtimestamp(b["t"] / 1000).strftime("%Y-%m-%d")
                rows.append([d, _round(b.get("o")), _round(b.get("h")), _round(b.get("l")),
                             _round(b.get("c")), _round(b.get("v"), 0)])
            return rows
        except Exception:
            time.sleep(1.5 * (attempt + 1))
    return []


# All Yahoo Finance exchange suffixes that must be kept intact (dot preserved).
# US class shares (BRK.B → BRK-B) hit the .replace() branch; everything here
# passes through verbatim so Yahoo resolves the correct exchange.
_YF_SUFFIXES = (
    ".HK", ".TO", ".SS", ".SZ",            # already handled; kept for completeness
    ".T", ".KS", ".TW", ".NS", ".AX",      # Japan / Korea / Taiwan / India / Australia
    ".L", ".SW", ".DE", ".MC", ".PA",      # London / Swiss / Germany / Madrid / Paris
    ".MI", ".AS", ".BR", ".HE", ".CO",     # Milan / Amsterdam / Brussels / Helsinki / Copenhagen
    ".ST", ".VI", ".IR", ".OL", ".LS",     # Stockholm / Vienna / Dublin / Oslo / Lisbon
)

# All 20 intl suffixes (excludes the primary HK/CA/CN group) for market_of() routing.
_INTL_SUFFIXES = (
    ".T", ".KS", ".TW", ".NS", ".AX",
    ".L", ".SW", ".DE", ".MC", ".PA",
    ".MI", ".AS", ".BR", ".HE", ".CO",
    ".ST", ".VI", ".IR", ".OL", ".LS",
)


# ---------------------------------------------------------------- yfinance (HK / Canada / Intl)
def fetch_yf(ticker: str) -> list[list]:
    import yfinance as yf
    # US class shares carry a dot in the manifest (BRK.B) but a dash in Yahoo (BRK-B);
    # keep all recognised exchange suffixes intact so Yahoo resolves the correct listing.
    # auto_adjust=True → split/dividend adjusted, continuous series (essential over 15y).
    yt = ticker if ticker.endswith(_YF_SUFFIXES) else ticker.replace(".", "-")
    yf_rows: list[list] = []
    for attempt in range(3):
        try:
            df = yf.Ticker(yt).history(period=PERIOD, auto_adjust=True)
            if df is None or df.empty:
                break
            yf_rows = []
            for idx, row in df.iterrows():
                yf_rows.append([idx.strftime("%Y-%m-%d"), _round(row["Open"]), _round(row["High"]),
                                _round(row["Low"]), _round(row["Close"]), _round(row.get("Volume"), 0)])
            break
        except Exception:
            time.sleep(1.5 * (attempt + 1))
    # Yahoo has gaps for HK names (delisted/suspended, e.g. 0011.HK) and sometimes shallower
    # history than Tencent for recent listings. When Yahoo is thin/empty, fall back to Tencent's
    # keyless daily klines (the same source as the live HK quote + intraday path) and keep the
    # deeper series — so "the whole HKEX universe" actually charts.
    if ticker.endswith(".HK") and len(yf_rows) < 30:
        tc = fetch_hk_tencent(ticker)
        if len(tc) > len(yf_rows):
            return tc
    return yf_rows


def fetch_hk_tencent(ticker: str) -> list[list]:
    """Daily OHLC fallback from Tencent (keyless) for HK names Yahoo lacks.

    Tencent row order is [date, open, close, high, low, vol(, dividend-dict)]; remap to
    the write_json contract [date, o, h, l, c, v]. ~1500 qfq (split/div-adjusted) bars.
    """
    digits = "".join(ch for ch in ticker if ch.isdigit())
    if not digits:
        return []
    code = "hk" + digits.zfill(5)
    url = f"https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param={code},day,,,1500,qfq"
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=30) as r:
                payload = json.loads(r.read())
            node = (payload.get("data") or {}).get(code) or {}
            raw = node.get("qfqday") or node.get("day") or []
            rows = []
            for x in raw:
                if not isinstance(x, list) or len(x) < 6:
                    continue
                rows.append([x[0], _round(x[1]), _round(x[3]), _round(x[4]),
                             _round(x[2]), _round(x[5], 0)])
            return rows
        except Exception:
            time.sleep(1.5 * (attempt + 1))
    return []


# ---------------------------------------------------------------- routing
US_MKTS = {"NYSE", "NASDAQ", "AMEX", "US", "Cboe", "NYSE Arca", "IEX"}


def market_of(sym: str, rec: dict) -> str | None:
    mkt = rec.get("mkt")
    if sym.endswith(".HK"):
        return "HK"
    if sym.endswith(".TO"):
        return "CA"
    if sym.endswith((".SS", ".SZ")) or mkt in ("SSE", "SZSE"):
        return None  # macro store — already built
    if sym.endswith(_INTL_SUFFIXES):
        return "INTL"  # routed through fetch_yf with suffix preserved
    if mkt in US_MKTS or (sym.isalpha() and "-" not in sym):
        return "US"
    return None


def main(argv: list[str]) -> None:
    want = "all"
    limit = 0
    workers = 12
    if "--market" in argv:
        want = argv[argv.index("--market") + 1]
    if "--limit" in argv:
        limit = int(argv[argv.index("--limit") + 1])
    if "--workers" in argv:
        workers = int(argv[argv.index("--workers") + 1])
    force = "--force" in argv   # re-fetch even if a JSON already exists (deepen 5y → 15y)

    symbols = json.loads(MANIFEST.read_text())["symbols"]
    todo = []
    for sym, rec in symbols.items():
        mk = market_of(sym, rec)
        if mk is None:
            continue
        if want != "all" and mk != want:
            continue
        if not force and (OUT / f"{sym}.json").exists():
            continue
        todo.append((sym, mk))
    if limit:
        todo = todo[:limit]

    by = {}
    for _, mk in todo:
        by[mk] = by.get(mk, 0) + 1
    print(f"backfill: {len(todo)} symbols to fetch {by} (workers={workers})", flush=True)

    def work(item):
        sym, mk = item
        # Polygon's REST aggregates cap at ~5y on this key, so route every market
        # through yfinance for the full 15y depth.
        rows = fetch_yf(sym)
        n = write_json(sym, rows, "yahoo")
        return sym, mk, n

    done = ok = 0
    with ThreadPoolExecutor(max_workers=workers) as ex:
        futs = [ex.submit(work, it) for it in todo]
        for f in as_completed(futs):
            sym, mk, n = f.result()
            done += 1
            if n:
                ok += 1
            if done % 100 == 0 or done == len(todo):
                print(f"  {done}/{len(todo)} done | {ok} written", flush=True)
    print(f"backfill complete: {ok}/{len(todo)} symbols written", flush=True)


if __name__ == "__main__":
    main(sys.argv[1:])
