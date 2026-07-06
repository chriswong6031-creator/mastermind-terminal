"""Fetch yfinance analyst price-targets + rating distribution for every US name that already has a
Macro Dashboard site JSON — the ONE genuine gap in the US treasure (site JSON carries
analyst.target=null / analyst.rating=null; see ingest-topology.md §4).

The US per-stock JSONs (site/stockdata/<SYM>.json) are deep and multi-year, but the deep-snapshot
build never populated analyst PRICE TARGETS or the buy/hold/sell rating distribution. This collector
fills exactly those two things (nothing the site JSON already has) into a parquet the US intel bridge
(pull_macro_intel.build_analysis) joins — the same fallback pattern pull_cn_hk_intel._read_parquet uses.

  yfinance .analyst_price_targets  -> {current, high, low, mean, median}
  yfinance .recommendations_summary -> latest-period {strongBuy, buy, hold, sell, strongSell}

Universe = every site/stockdata/<SYM>.json (US equities; ~1,300 with analyst coverage). Resumable
(skip names already in the parquet unless --force), threaded ≤4, jittered sleep (yfinance etiquette:
~1s jitter, threads ≤4 per the recon probes). Ctrl-C-safe: writes a partial parquet on interrupt.

Output: <Macro Dashboard>/data/tushare/us_deep.parquet  {ticker, targets_json, recs_json, asof}

Run with the macro venv:
  "<Macro Dashboard>/.venv/bin/python" ingest/collect_us_deep.py [--workers 4] [--only AAPL,NVDA] [--limit N] [--force]
"""
from __future__ import annotations

import glob
import json
import os
import random
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date
from pathlib import Path

import pandas as pd

MACRO = Path("/Users/chriswong/Documents/Cluade/Macro Dashboard")
STOCKDATA = MACRO / "site" / "stockdata"
OUT = MACRO / "data" / "tushare" / "us_deep.parquet"

_ASOF = date.today().isoformat()
# yfinance etiquette (recon probe): keep threads ≤4 and add ~1s jitter between symbols so a burst
# of workers doesn't hammer the endpoint. The jitter lives inside each worker.
_JITTER_LO, _JITTER_HI = 0.6, 1.4


def _num(v):
    """float or None (drops NaN)."""
    if v is None:
        return None
    try:
        f = float(v)
        return None if f != f else f
    except (TypeError, ValueError):
        return None


def fetch_targets(ticker: str) -> dict | None:
    """{current, high, low, mean, median} from yfinance analyst_price_targets; None if empty."""
    import yfinance as yf  # noqa: PLC0415
    try:
        apt = yf.Ticker(ticker).analyst_price_targets or {}
    except Exception:
        return None
    out = {k: _num(apt.get(k)) for k in ("current", "high", "low", "mean", "median")}
    return out if any(v is not None for v in out.values()) else None


def fetch_recs(ticker: str) -> dict | None:
    """Latest-period {strongBuy, buy, hold, sell, strongSell} from recommendations_summary; None if empty."""
    import yfinance as yf  # noqa: PLC0415
    try:
        rs = yf.Ticker(ticker).recommendations_summary
    except Exception:
        return None
    if rs is None or getattr(rs, "empty", True):
        return None
    try:
        recs = rs.to_dict("records")
    except Exception:
        return None
    if not recs:
        return None
    # prefer the current period ("0m"); else the first row.
    row = next((r for r in recs if str(r.get("period")) == "0m"), recs[0])
    cols = ("strongBuy", "buy", "hold", "sell", "strongSell")
    out = {c: (int(row[c]) if row.get(c) is not None and str(row.get(c)) not in ("", "nan") else None) for c in cols}
    return out if any(v is not None for v in out.values()) else None


def fetch_one(ticker: str) -> dict | None:
    """One symbol: targets + recs. Jittered (yfinance etiquette). None when both are empty."""
    time.sleep(random.uniform(_JITTER_LO, _JITTER_HI))
    tgt = fetch_targets(ticker)
    recs = fetch_recs(ticker)
    if tgt is None and recs is None:
        return None
    return {
        "ticker": ticker,
        "targets_json": json.dumps(tgt, default=str) if tgt else None,
        "recs_json": json.dumps(recs, default=str) if recs else None,
        "asof": _ASOF,
    }


def us_universe() -> list[str]:
    """Every US site JSON symbol (excludes CN/HK/TO which live in other stockdata dirs)."""
    out = []
    for f in glob.glob(str(STOCKDATA / "*.json")):
        sym = os.path.basename(f)[:-5]
        if sym.endswith((".SS", ".SZ", ".HK", ".TO")):
            continue
        out.append(sym)
    return sorted(out)


def _load_cache() -> dict[str, dict]:
    if not OUT.exists():
        return {}
    try:
        return {r["ticker"]: r for r in pd.read_parquet(OUT).to_dict("records")}
    except Exception:
        return {}


def _flush(cache: dict[str, dict]) -> None:
    df = pd.DataFrame([cache[k] for k in sorted(cache)])
    OUT.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(OUT, index=False)


def main(argv: list[str]) -> None:
    workers = int(argv[argv.index("--workers") + 1]) if "--workers" in argv else 4
    workers = max(1, min(4, workers))   # hard cap ≤4 (yfinance etiquette)
    limit = int(argv[argv.index("--limit") + 1]) if "--limit" in argv else 0
    only = None
    if "--only" in argv:
        only = [s.strip() for s in argv[argv.index("--only") + 1].split(",") if s.strip()]
    force = "--force" in argv

    if only:
        want = [s for s in only if (STOCKDATA / f"{s}.json").exists()]
        missing = [s for s in only if s not in want]
        for s in missing:
            print(f"  skip {s}: no site JSON", flush=True)
    else:
        want = us_universe()
    if limit:
        want = want[:limit]

    cache = {} if force else _load_cache()
    todo = [t for t in want if t not in cache]
    print(f"us_deep: {len(want)} US names, {len(todo)} to fetch "
          f"(workers={workers}, force={force}, cache={len(cache)})", flush=True)

    lock = threading.Lock()
    got = done = 0
    try:
        with ThreadPoolExecutor(max_workers=workers) as ex:
            futs = {ex.submit(fetch_one, t): t for t in todo}
            for fut in as_completed(futs):
                done += 1
                try:
                    rec = fut.result()
                except Exception:
                    rec = None
                if rec:
                    with lock:
                        cache[rec["ticker"]] = rec
                    got += 1
                if done % 50 == 0 or done == len(todo):
                    print(f"  {done}/{len(todo)} done, {got} with data", flush=True)
    except KeyboardInterrupt:
        print("\ninterrupted — flushing partial cache", flush=True)

    _flush(cache)
    print(f"us_deep.parquet: {len(cache)} names ({got} newly fetched)", flush=True)


if __name__ == "__main__":
    main(sys.argv[1:])
