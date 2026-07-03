"""Phase 2b — backfill per-symbol chart OHLC for the expanded search universe.

Writes terminal/public/data/<SYMBOL>.json (REAL OHLC contract) for every manifest
symbol that doesn't already have one, choosing a feed by market:
  * US (NYSE/NASDAQ/AMEX/US/Cboe) -> Polygon daily aggs
  * HK (.HK)                       -> yfinance
  * Canada (.TO)                   -> yfinance
  * China (.SS/.SZ)                -> already built from the macro store (skipped)

Resumable: skips any symbol that already has a JSON, so it's safe to re-run / run in
the background. Concurrency via a thread pool; JSON written as each symbol completes.

  python ingest/backfill_ohlc.py [--market US|HK|CA|all] [--limit N] [--workers N]
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
OUT = ROOT / "terminal" / "public" / "data"
MANIFEST = Path(os.environ.get("TERMINAL_MANIFEST") or (OUT / "manifest.json"))
MAX_BARS = 3900   # ~15y of daily bars
YEARS = 15


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


# ---------------------------------------------------------------- yfinance (HK / Canada)
def fetch_yf(ticker: str) -> list[list]:
    import yfinance as yf
    # US class shares carry a dot in the manifest (BRK.B) but a dash in Yahoo (BRK-B);
    # keep the market suffix (.HK/.TO/.SS/.SZ) intact. auto_adjust=True → split/dividend
    # adjusted, continuous series (essential over 15y, else splits read as cliffs).
    yt = ticker if ticker.endswith((".HK", ".TO", ".SS", ".SZ")) else ticker.replace(".", "-")
    for attempt in range(3):
        try:
            df = yf.Ticker(yt).history(period=f"{YEARS}y", auto_adjust=True)
            if df is None or df.empty:
                return []
            rows = []
            for idx, row in df.iterrows():
                rows.append([idx.strftime("%Y-%m-%d"), _round(row["Open"]), _round(row["High"]),
                             _round(row["Low"]), _round(row["Close"]), _round(row.get("Volume"), 0)])
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
        return None  # macro store
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
