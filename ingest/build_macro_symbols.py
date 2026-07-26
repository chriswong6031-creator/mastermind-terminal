"""Merge the macro-instrument catalog (indices, yields, FX, futures, crypto majors) into the
Terminal's manifest, and write daily OHLC for the Yahoo-sourced ones.

Run AFTER build_universe.py in the nightly refresh: this pass is purely ADDITIVE — it never
removes an existing manifest row and never rewrites an equity row it did not create. That
matters because build_universe.py owns the 8.7k equity universe and a careless rewrite here is
exactly how the 2026-07-11 manifest 8,740 -> 34 incident happened (see terminal-refresh.sh).

    python ingest/build_macro_symbols.py                     # merge catalog + fetch OHLC
    python ingest/build_macro_symbols.py --no-ohlc           # manifest rows only
    python ingest/build_macro_symbols.py --out /tmp/probe    # write elsewhere (dry run)

Sources
    Yahoo spark   quotes for ^indices, =F futures, =X FX, DX-Y.NYB   (DELAYED — see below)
    Yahoo chart   daily OHLC for the same set
    (CN indices route to Tencent and crypto to Coinbase at REQUEST time via the Next app; this
     script only needs to put their rows in the manifest so they are searchable.)

Honesty note: everything on the Yahoo leg is delayed, not real-time. Index values, CME futures
and the ICE dollar index all need licensed real-time feeds. The manifest row carries no basis
claim; lib/intradaySources.ts marks these quotes DELAYED_15M at request time.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from macro_catalog import CATALOG, duplicates, manifest_rows, yahoo_symbols  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "terminal" / "public" / "data"

UA = {"User-Agent": "Mozilla/5.0"}
SPARK = "https://query1.finance.yahoo.com/v7/finance/spark"
CHART = "https://query1.finance.yahoo.com/v8/finance/chart"
# Yahoo's spark endpoint 400s past ~20 symbols and returns ZERO results rather than a partial
# answer, so an oversized batch silently loses everything. Confirmed at 23; stay well under.
SPARK_BATCH = 18


def _get(url: str, timeout: int = 20) -> dict:
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


def fetch_quotes(syms: list[str]) -> dict[str, dict]:
    """Last price + previous close for each symbol. Missing symbols are simply absent."""
    out: dict[str, dict] = {}
    for i in range(0, len(syms), SPARK_BATCH):
        batch = syms[i : i + SPARK_BATCH]
        url = f"{SPARK}?symbols={urllib.parse.quote(','.join(batch))}&range=1d&interval=5m"
        try:
            j = _get(url)
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:
            print(f"  spark batch {i // SPARK_BATCH} failed: {e}", file=sys.stderr)
            continue
        for row in (j.get("spark") or {}).get("result") or []:
            meta = ((row.get("response") or [{}])[0] or {}).get("meta") or {}
            last = meta.get("regularMarketPrice")
            sym = row.get("symbol") or meta.get("symbol")
            if not sym or last is None:
                continue
            prev = meta.get("previousClose") or meta.get("chartPreviousClose")
            chg = ((last - prev) / prev * 100) if prev else None
            out[sym] = {"last": round(float(last), 6), "chg": round(chg, 4) if chg is not None else None}
        time.sleep(0.3)   # be a polite client; this runs once a night
    return out


def fetch_ohlc(sym: str) -> list[dict]:
    """Daily OHLC in the same shape chart.js already reads for equities."""
    url = f"{CHART}/{urllib.parse.quote(sym)}?range=5y&interval=1d"
    try:
        j = _get(url)
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:
        print(f"  ohlc {sym} failed: {e}", file=sys.stderr)
        return []
    res = ((j.get("chart") or {}).get("result") or [{}])[0]
    ts = res.get("timestamp") or []
    q = ((res.get("indicators") or {}).get("quote") or [{}])[0]
    o, h, l, c, v = (q.get(k) or [] for k in ("open", "high", "low", "close", "volume"))
    bars: list[dict] = []
    for i, t in enumerate(ts):
        # A null close means the session did not print — skip rather than forward-fill, so a
        # holiday never appears as a real flat bar.
        if i >= len(c) or c[i] is None:
            continue
        day = time.strftime("%Y-%m-%d", time.gmtime(t))
        bars.append({
            "t": day,
            "o": round(float(o[i]), 6) if i < len(o) and o[i] is not None else None,
            "h": round(float(h[i]), 6) if i < len(h) and h[i] is not None else None,
            "l": round(float(l[i]), 6) if i < len(l) and l[i] is not None else None,
            "c": round(float(c[i]), 6),
            "v": int(v[i]) if i < len(v) and v[i] is not None else 0,
        })
    return bars


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(DATA), help="output data dir (default terminal/public/data)")
    ap.add_argument("--no-ohlc", action="store_true", help="manifest rows only, skip OHLC fetch")
    ap.add_argument("--no-quotes", action="store_true", help="skip the live-quote enrichment")
    args = ap.parse_args()

    dupes = duplicates()
    if dupes:
        print(f"FATAL: duplicate symbols in catalog: {dupes}", file=sys.stderr)
        return 2

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    mpath = out_dir / "manifest.json"

    if mpath.exists():
        manifest = json.loads(mpath.read_text())
    else:
        manifest = {"as_of": time.strftime("%Y-%m-%d"), "source": "macro-catalog", "symbols": {}}
    symbols = manifest.setdefault("symbols", {})
    before = len(symbols)

    rows = manifest_rows()
    if not args.no_quotes:
        quotes = fetch_quotes(yahoo_symbols())
        print(f"quotes: {len(quotes)}/{len(yahoo_symbols())} symbols priced")
        for sym, q in quotes.items():
            if sym in rows:
                rows[sym].update(q)

    # ADDITIVE merge. An existing row wins on every key it already has: build_universe.py owns
    # the equity universe and its prices are fresher than ours for anything we overlap on.
    added, updated = 0, 0
    for sym, row in rows.items():
        if sym in symbols:
            merged = {**row, **symbols[sym]}
            if merged != symbols[sym]:
                symbols[sym] = merged
                updated += 1
        else:
            symbols[sym] = row
            added += 1

    mpath.write_text(json.dumps(manifest, ensure_ascii=False, separators=(",", ":")))
    print(f"manifest: {before} -> {len(symbols)} symbols (+{added} new, {updated} enriched)")

    if not args.no_ohlc:
        wrote = 0
        for sym in yahoo_symbols():
            bars = fetch_ohlc(sym)
            if not bars:
                continue
            (out_dir / f"{sym}.json").write_text(json.dumps({"symbol": sym, "bars": bars}, separators=(",", ":")))
            wrote += 1
            time.sleep(0.25)
        print(f"ohlc: wrote {wrote}/{len(yahoo_symbols())} series")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
