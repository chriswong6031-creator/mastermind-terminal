"""Daily FRED series for the Terminal: US real yields (TIPS) and breakeven inflation.

WHY THIS EXISTS
    macro_catalog's ^ ladder is the NOMINAL curve. The two numbers a macro desk reads next to
    a nominal yield — the TIPS real yield and the breakeven (nominal − real) — have no free
    quote feed: Yahoo carries neither DFII10 nor T10YIE. FRED publishes both daily and with NO
    API KEY, so the Terminal can carry them as first-class daily symbols with no credential to
    rotate and no vendor to depend on.

    python ingest/fetch_fred_daily.py                       # fetch series + merge manifest rows
    python ingest/fetch_fred_daily.py --years 25            # deeper history
    python ingest/fetch_fred_daily.py --no-bars             # manifest rows only, no network
    python ingest/fetch_fred_daily.py --out /tmp/p --manifest /tmp/p/manifest.json   # dry run

SHAPE — WHY POSITIONAL BARS
    Every OHLC file the Terminal reads is {"t": SYM, "o": 1, "src": …, "bars": [[date,o,h,l,c,v]]}
    and ChartPanel maps it POSITIONALLY (b[0]..b[5]), as do embed/chartData.toBars() and
    hydrate_prices.py. A yield prints one number a day, so each bar is written flat
    (o=h=l=c=value, v=0): the candles collapse to a line and no intraday range is invented.
    bar_quality is "single_value_daily", NOT "real_ohlc" — golden_gate.py reads real_ohlc as
    "intrabar highs/lows are genuine", which for a single daily print would be a lie.

USER-AGENT — LOAD-BEARING
    FRED's WAF accepts an honest client string and answers in <1s, but a forged browser UA
    ("Mozilla/5.0 …") is swallowed: TLS completes, the request is sent, and the socket then
    hangs until the read timeout with ZERO bytes. Do NOT copy build_macro_symbols.py's UA
    into this module — it turns every series into a silent timeout.

NIGHTLY SAFETY
    Additive: the pass only ever touches the four rows it owns, so it can never shrink or
    overwrite the equity universe build_universe.py owns (cf. the 2026-07-11 manifest
    8,740 -> 34 incident). Per-file and manifest writes are atomic (tmp + os.replace), so a
    crash mid-run leaves the previous night's bytes intact. A failed series WARNs and is
    skipped; the run exits non-zero only when EVERY series failed.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from macro_catalog import duplicates, fred_symbols, manifest_rows  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
DATA = Path(os.environ.get("TERMINAL_DATA_DIR") or (ROOT / "terminal" / "public" / "data"))

CSV_URL = "https://fred.stlouisfed.org/graph/fredgraph.csv"
# Honest client string — see USER-AGENT above. Never "Mozilla/5.0 …".
UA = {"User-Agent": "mastermind-terminal-ingest/1.0 (+https://app.mastermind-x.com)"}
SRC = "fred"
BAR_QUALITY = "single_value_daily"
# Below this a series is not a chartable history — write nothing and keep whatever the last
# good run left on disk, rather than replacing a real file with a stub.
MIN_BARS = 30


def fetch_csv(sym: str, start: dt.date, timeout: int = 30) -> str:
    """Raw fredgraph CSV for one series from ``start`` (cosd) to the latest print."""
    q = urllib.parse.urlencode({"id": sym, "cosd": start.isoformat()})
    req = urllib.request.Request(f"{CSV_URL}?{q}", headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8")


def parse_csv(text: str) -> list[list]:
    """FRED CSV -> [[date, o, h, l, c, v], ...] ascending, flat bars, v=0.

    FRED renamed the header column (``DATE`` historically, ``observation_date`` today), so the
    header is skipped BY SHAPE — a header's first field never parses as a date — rather than by
    matching either name and silently eating a real row if they rename it again.

    A day with no print still ships a row. fredgraph.csv leaves the value field EMPTY
    ("2016-09-05,") — 110 of them in a 10-year DFII10 pull, i.e. the US market holidays — while
    other FRED endpoints write "."; both are dropped, never forward-filled, so a holiday cannot
    appear as a real flat observation.
    """
    bars: dict[str, list] = {}
    for raw in text.splitlines():
        line = raw.strip().lstrip("\ufeff")   # FRED sometimes ships a BOM on the header line
        if not line:
            continue
        parts = [p.strip() for p in line.split(",")]
        if len(parts) < 2:
            continue
        day, val = parts[0], parts[-1]
        try:
            dt.date.fromisoformat(day)
        except ValueError:
            continue                      # header line, or a footer FRED may append
        if val in (".", "", "NA", "NaN"):
            continue                      # no print that day
        try:
            v = float(val)
        except ValueError:
            continue
        bars[day] = [day, v, v, v, v, 0]  # one number a day: o=h=l=c, no volume exists
    return [bars[d] for d in sorted(bars)]


def doc_for(sym: str, bars: list[list]) -> dict:
    """The on-disk OHLC document, in the envelope every other ingest writer uses."""
    return {"t": sym, "o": 1, "src": SRC, "bar_quality": BAR_QUALITY, "bars": bars}


def summary(bars: list[list]) -> dict:
    """last/chg for the manifest row — the fields the EOD fallback quote reads.

    Same two keys, same units as build_macro_symbols.py and hydrate_prices.py: ``last`` is the
    latest value and ``chg`` is the PERCENT change against the prior print. A single-bar series
    has nothing to compare against, so chg is null rather than a fabricated 0.
    """
    if not bars:
        return {}
    last = float(bars[-1][4])
    prev = float(bars[-2][4]) if len(bars) >= 2 else None
    chg = ((last - prev) / prev * 100) if prev else None
    return {"last": round(last, 6), "chg": round(chg, 4) if chg is not None else None}


def write_atomic(path: Path, payload: dict) -> None:
    """tmp + os.replace inside the destination dir: a reader never sees a half-written file,
    and a crash mid-write leaves the previous run's bytes intact."""
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=str(path.parent), suffix=".fred.tmp")
    try:
        with os.fdopen(fd, "w") as f:
            json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
        # mkstemp creates 0600. These files are SERVED (terminal/public/data), so they must be
        # world-readable like every other writer's world-readable output — otherwise a web
        # server running as a different user 403s on exactly the symbols this script owns.
        os.chmod(tmp, 0o644)
        os.replace(tmp, path)
    except BaseException:
        Path(tmp).unlink(missing_ok=True)
        raise


def merge_manifest(mpath: Path, rows: dict[str, dict]) -> tuple[int, int, int]:
    """Merge OUR rows into the manifest. Returns (before, added, updated).

    Only the four FRED syms are touched — every other row is passed through untouched, so this
    pass can never shrink the universe build_universe.py owns.

    Within our own rows OUR keys win and foreign keys survive ({**existing, **row}). That is
    deliberately the OPPOSITE of build_macro_symbols.py's existing-wins rule: existing-wins is
    right there because its symbols overlap an equity universe with fresher prices, but nothing
    else on the box writes a FRED series — existing-wins would freeze last/chg at whatever the
    first run happened to write. Keys other writers add later (hydrate_prices' hi52/lo52/vol)
    are preserved.
    """
    if mpath.exists():
        manifest = json.loads(mpath.read_text())
    else:
        manifest = {"as_of": time.strftime("%Y-%m-%d"), "source": "fred", "symbols": {}}
    symbols = manifest.setdefault("symbols", {})
    before = len(symbols)
    added = updated = 0
    for sym, row in rows.items():
        cur = symbols.get(sym)
        merged = {**(cur or {}), **row}
        if cur is None:
            symbols[sym] = merged
            added += 1
        elif merged != cur:
            symbols[sym] = merged
            updated += 1
    write_atomic(mpath, manifest)
    return before, added, updated


def main() -> int:
    ap = argparse.ArgumentParser(
        description="Fetch FRED daily series (US real yields + breakevens) into the Terminal data dir.")
    ap.add_argument("--out", default=str(DATA),
                    help="data dir (default $TERMINAL_DATA_DIR or terminal/public/data)")
    ap.add_argument("--manifest", default=None,
                    help="manifest path (default $TERMINAL_MANIFEST, else <out>/manifest.json)")
    ap.add_argument("--years", type=float, default=10.0, help="history window in years (default 10)")
    ap.add_argument("--no-bars", action="store_true", help="merge manifest rows only, skip the fetch")
    args = ap.parse_args()

    dupes = duplicates()
    if dupes:
        print(f"FATAL: duplicate symbols in catalog: {dupes}", file=sys.stderr)
        return 2

    syms = fred_symbols()
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    # The nightly stages the manifest and swaps it in at the very end, so writing to
    # $TERMINAL_MANIFEST is what makes these rows SURVIVE the swap.
    mpath = Path(args.manifest) if args.manifest else Path(
        os.environ.get("TERMINAL_MANIFEST") or (out_dir / "manifest.json"))
    start = dt.date.today() - dt.timedelta(days=int(args.years * 365.25))

    priced: dict[str, dict] = {}
    failed: list[str] = []
    if not args.no_bars:
        for sym in syms:
            try:
                bars = parse_csv(fetch_csv(sym, start))
            except (urllib.error.URLError, TimeoutError, OSError, UnicodeDecodeError) as e:
                print(f"  WARN {sym}: fetch failed ({type(e).__name__}: {e}) — keeping the file on disk",
                      file=sys.stderr)
                failed.append(sym)
                continue
            if len(bars) < MIN_BARS:
                print(f"  WARN {sym}: only {len(bars)} usable rows (< {MIN_BARS}) — nothing written",
                      file=sys.stderr)
                failed.append(sym)
                continue
            write_atomic(out_dir / f"{sym}.json", doc_for(sym, bars))
            priced[sym] = summary(bars)
            print(f"  {sym}: {len(bars)} bars, last {bars[-1][4]} on {bars[-1][0]}")
            time.sleep(0.25)   # be a polite client; this runs once a night

    # Catalog rows go in whether or not today's fetch worked: a series that failed tonight
    # still has yesterday's file on disk, and staying searchable is the honest outcome.
    rows = {s: r for s, r in manifest_rows().items() if s in set(syms)}
    for sym, q in priced.items():
        rows[sym].update(q)

    before, added, updated = merge_manifest(mpath, rows)
    print(f"manifest {mpath}: {before} -> {before + added} symbols (+{added} new, {updated} updated)")
    print(f"series: {len(priced)}/{len(syms)} fetched")

    if syms and len(failed) == len(syms) and not args.no_bars:
        print(f"FATAL: all {len(syms)} FRED series failed", file=sys.stderr)
        return 1
    if failed:
        print(f"partial: {len(failed)} of {len(syms)} failed ({', '.join(failed)}) — rows kept")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
