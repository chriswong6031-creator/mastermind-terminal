"""Daily OHLC for every crypto row in the manifest, from Coinbase's public candles endpoint.

WHY THIS EXISTS
    Crypto had no OHLC lane at all. backfill_ohlc.market_of() returns None for anything with a
    dash in the ticker, so every "-USD" row fell through it, and refresh_ohlc.py is US-equity
    grouped-daily only. The four original coins chart because build_polygon_universe carries
    BTC/ETH/SOL/XRP in its own flagship list; the 20 majors added to macro_catalog in July were
    searchable from the day they landed and have 404'd on <SYM>.json ever since — a searchable
    symbol with no chart and no price. Confirmed 2026-07-27: DOGE-USD.json 404 in production
    while DOGE-USD sat in the manifest.

    So this is not "one more feed". It is the missing half of putting crypto in the universe:
    macro_catalog lists what exists, this writes what it charts from.

WHY COINBASE CANDLES
    Coinbase is already the live-quote venue (hub/lib/coinbase.js), so bars and ticks come from
    the same book — a Yahoo composite would disagree with the live price at the seam. It is free
    and keyless, it covers every listed pair (Polygon's crypto aggs on our key stop ~2 years
    back; Yahoo throttles unauthenticated batches into short windows), and history reaches each
    pair's LISTING date, which is the honest start for a chart of that market.

    Depth is therefore per-pair, not uniform: HYPE-USD listed in 2026-02 and has ~170 bars. That
    is not a gap to fill, it is when the market opened.

    Candle rows arrive [time, low, high, open, close, volume] — NOT the OHLC order the name
    suggests. _to_bars remaps to the positional house contract [date, o, h, l, c, v]; getting
    this wrong renders a plausible-looking chart with the highs and lows swapped.

USAGE
    python ingest/refresh_crypto_ohlc.py                 # dry run: report, write nothing
    python ingest/refresh_crypto_ohlc.py --write         # backfill missing + append recent
    python ingest/refresh_crypto_ohlc.py --write --full  # re-fetch full history for every pair
    python ingest/refresh_crypto_ohlc.py --write --only DOGE-USD,SUI-USD

    Idempotent and resumable: an existing file only ever gains bars strictly newer than its last
    one, so a re-run mid-way costs nothing. Safe beside the nightly's other passes — it writes
    only <SYM>.json for symbols whose manifest row says sec == "Crypto", and never the manifest.
"""
from __future__ import annotations

import argparse
import concurrent.futures as cf
import datetime as dt
import json
import os
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

try:
    from ingest.polygon_bars import append_recent_bars   # package context (tests)
except ImportError:                                       # run as `python ingest/refresh_crypto_ohlc.py`
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from polygon_bars import append_recent_bars

ROOT = Path(__file__).resolve().parents[1]
OUT = Path(os.environ.get("TERMINAL_DATA_DIR") or (ROOT / "terminal" / "public" / "data"))
MANIFEST = Path(os.environ.get("TERMINAL_MANIFEST") or (OUT / "manifest.json"))

CB = "https://api.exchange.coinbase.com"
UA = {"User-Agent": "Mozilla/5.0"}
PAGE_DAYS = 295          # the endpoint returns at most 300 candles; leave headroom
MAX_PAGES = 26           # ~21 years of daily bars — older than any listed pair
MIN_BARS = 5             # below this there is no chart to draw; leave no file rather than a stub
REFRESH_DAYS = 10        # append window for an existing file (matches refresh_ohlc_intl's --days)


def _get(url: str, timeout: int = 25):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


def _candles(sym: str, start: dt.date, end: dt.date) -> list[list]:
    """One page of raw Coinbase daily candles, newest-first. [] on a failed/empty window."""
    url = (f"{CB}/products/{sym}/candles?granularity=86400"
           f"&start={start:%Y-%m-%d}&end={end:%Y-%m-%d}")
    for attempt in range(4):
        try:
            rows = _get(url)
            if isinstance(rows, dict):        # {"message": "NotFound"} for an unlisted product
                return []
            return rows if isinstance(rows, list) else []
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
            time.sleep(0.7 * (attempt + 1))
    return []


def _to_bars(raw: list[list]) -> list[list]:
    """Coinbase [time, low, high, open, close, volume] -> house [date, o, h, l, c, v], ascending.

    The house contract is POSITIONAL and every consumer indexes it positionally (ChartPanel
    b[0..5], gen_slices_all b[4], hydrate_prices last[4]) — see build_macro_symbols.fetch_ohlc,
    which learned this the hard way on 2026-07-27.
    """
    bars: list[list] = []
    for c in raw:
        if not isinstance(c, list) or len(c) < 6:
            continue
        ts, low, high, opn, close, vol = c[0], c[1], c[2], c[3], c[4], c[5]
        # A candle with no close did not trade; skip rather than forward-fill, so a dead session
        # never reads as a real flat bar. Crypto trades continuously, so this is rare.
        if close is None:
            continue
        day = dt.datetime.fromtimestamp(int(ts), dt.UTC).strftime("%Y-%m-%d")
        c_ = round(float(close), 8)
        bars.append([
            day,
            round(float(opn), 8) if opn is not None else c_,
            round(float(high), 8) if high is not None else c_,
            round(float(low), 8) if low is not None else c_,
            c_,
            round(float(vol), 4) if vol is not None else 0,
        ])
    # Coinbase pages overlap at the boundaries; de-dupe by date, newest page winning.
    by_day = {b[0]: b for b in bars}
    return [by_day[d] for d in sorted(by_day)]


def drop_incomplete(bars: list[list], today: dt.date) -> list[list]:
    """Drop the in-progress UTC day.

    Crypto never closes, so the candle for the current UTC day is always partial. Storing it
    would be worse than useless: append_recent_bars only ever adds dates strictly NEWER than the
    last stored bar, so a partial bar written tonight is the bar for that day FOREVER — and since
    the nightly runs ~01:30 UTC, every single day would be frozen as its first 90 minutes.

    The current day is not missing from the chart: ChartPanel.spliceDaily appends a live bar for
    today from the Coinbase quote (see lib/__tests__/liveSplice.test.ts). Completed days come
    from here, today comes from the live feed — one owner per bar.
    """
    cutoff = today.strftime("%Y-%m-%d")
    return [b for b in bars if b[0] < cutoff]


def fetch_full(sym: str, today: dt.date | None = None) -> list[list]:
    """Whole listed history, paging back until a page comes up empty."""
    today = today or dt.datetime.now(dt.UTC).date()
    end = today
    raw: list[list] = []
    for _ in range(MAX_PAGES):
        start = end - dt.timedelta(days=PAGE_DAYS)
        page = _candles(sym, start, end)
        if not page:
            break
        raw.extend(page)
        end = start
        time.sleep(0.15)   # public endpoint: stay a polite client
    return drop_incomplete(_to_bars(raw), today)


def fetch_recent(sym: str, days: int = REFRESH_DAYS, today: dt.date | None = None) -> list[list]:
    today = today or dt.datetime.now(dt.UTC).date()
    raw = _candles(sym, today - dt.timedelta(days=days), today)
    return drop_incomplete(_to_bars(raw), today)


def read_existing(path: Path) -> list[list]:
    try:
        doc = json.loads(path.read_text())
    except (OSError, json.JSONDecodeError):
        return []
    bars = doc.get("bars")
    return bars if isinstance(bars, list) else []


def write_atomic(path: Path, bars: list[list]) -> None:
    """tmp + os.replace, and world-readable — these files are served straight out of /data.

    Identical to build_macro_symbols.write_atomic: a bare write_text truncates first, so a crash
    mid-write leaves a half-written series where a complete one used to be.
    """
    doc = {"t": path.stem, "o": 1, "src": "coinbase", "bar_quality": "real_ohlc", "bars": bars}
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=str(path.parent), suffix=".crypto.tmp")
    try:
        with os.fdopen(fd, "w") as f:
            json.dump(doc, f, separators=(",", ":"))
        os.chmod(tmp, 0o644)
        os.replace(tmp, path)
    except BaseException:
        Path(tmp).unlink(missing_ok=True)
        raise


def crypto_symbols(manifest_path: Path) -> list[str]:
    """Manifest rows whose asset class is Crypto — the same field the search Crypto tab reads."""
    symbols = json.loads(manifest_path.read_text()).get("symbols") or {}
    return [s for s, r in symbols.items() if (r or {}).get("sec") == "Crypto"]


def process(sym: str, *, write: bool, full: bool) -> tuple[str, str, int]:
    """Returns (sym, action, bar_count). action is one of backfill/append/nochange/empty."""
    path = OUT / f"{sym}.json"
    existing = read_existing(path)

    if full or not existing:
        bars = fetch_full(sym)
        if len(bars) < MIN_BARS:
            return sym, "empty", len(bars)
        if write:
            write_atomic(path, bars)
        return sym, ("refull" if existing else "backfill"), len(bars)

    fresh = fetch_recent(sym)
    if not fresh:
        return sym, "nochange", len(existing)
    # append_recent_bars keeps only rows strictly newer than the last existing bar and re-runs
    # the ticker-reuse discontinuity guard on the stitched series — crypto tickers get reused
    # too (a delisted token's symbol handed to a new asset), and the guard is cheap.
    merged, n_new = append_recent_bars(sym, existing, fresh)
    if not n_new:
        return sym, "nochange", len(existing)
    if write:
        write_atomic(path, merged)
    return sym, "append", len(merged)


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true", help="actually write files (default: dry run)")
    ap.add_argument("--full", action="store_true", help="re-fetch full history even if a file exists")
    ap.add_argument("--only", default="", help="comma-separated symbols instead of the manifest set")
    ap.add_argument("--workers", type=int, default=6)
    args = ap.parse_args(argv)

    if args.only:
        syms = [s.strip() for s in args.only.split(",") if s.strip()]
    else:
        if not MANIFEST.exists():
            print(f"FATAL: no manifest at {MANIFEST}", file=sys.stderr)
            return 2
        syms = crypto_symbols(MANIFEST)
    if not syms:
        print("no crypto rows in the manifest — nothing to do")
        return 0

    mode = "FULL" if args.full else "backfill+append"
    print(f"crypto ohlc: {len(syms)} symbols, {mode}, "
          f"{'writing' if args.write else 'DRY RUN'} into {OUT}", flush=True)

    tally: dict[str, int] = {}
    empties: list[str] = []
    with cf.ThreadPoolExecutor(max_workers=args.workers) as ex:
        futs = {ex.submit(process, s, write=args.write, full=args.full): s for s in syms}
        for fut in cf.as_completed(futs):
            sym = futs[fut]
            try:
                sym, action, n = fut.result()
            except Exception as e:                      # one bad pair must not sink the pass
                print(f"  {sym}: FAILED {type(e).__name__}: {e}", file=sys.stderr)
                tally["error"] = tally.get("error", 0) + 1
                continue
            tally[action] = tally.get(action, 0) + 1
            if action == "empty":
                empties.append(sym)
            elif action != "nochange":
                print(f"  {sym}: {action} {n} bars", flush=True)

    print(f"crypto ohlc: {tally}")
    # Never silent about a row we could not chart: an empty pair is a searchable dead end, which
    # is the exact failure this script exists to end.
    if empties:
        print(f"NO CANDLES (row will not chart — retire it or check the listing): {sorted(empties)}",
              file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
