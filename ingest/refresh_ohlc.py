#!/usr/bin/env python3
"""refresh_ohlc.py — append recent daily bars to EXISTING US OHLC files from Polygon
grouped-daily (ONE call per date covers the whole US market). Fills the gap left by
backfill_ohlc.py, which only fetches NEW symbols and never refreshes existing ones — so
non-flagship OHLC (and thus watchlist LAST/CHG via hydrate_prices) was frozen. Memory-
light: a few grouped snapshots in RAM; OHLC files rewritten one at a time (atomic).
Only appends dates strictly newer than each file's last bar (no dups; won't clobber
flagship bars already written by build_polygon_universe).

Usage: refresh_ohlc.py [--days N] [--write]   (default days=7; dry-run unless --write)
"""
import json, os, sys, urllib.request, datetime as dt

D = os.environ.get("TERMINAL_DATA_DIR", "/opt/terminal/terminal/public/data")
US_MKTS = {"NASDAQ", "NYSE", "US", "AMEX", "NYSEAMERICAN", "NYSE American", "NYSE Arca", "BATS"}
WRITE = "--write" in sys.argv
DAYS = int(sys.argv[sys.argv.index("--days") + 1]) if "--days" in sys.argv else 7

POLY = os.environ.get("POLYGON_API_KEY") or os.environ.get("POLYGON_KEY")
if not POLY and os.path.exists("/opt/terminal/.env"):
    for line in open("/opt/terminal/.env"):
        line = line.strip()
        for k in ("POLYGON_API_KEY=", "POLYGON_KEY="):
            if line.startswith(k):
                POLY = line.split("=", 1)[1].strip().strip('"').strip("'")
assert POLY, "no polygon key"

def grouped(date_str):
    url = (f"https://api.polygon.io/v2/aggs/grouped/locale/us/market/stocks/{date_str}"
           f"?adjusted=true&apiKey={POLY}")
    try:
        with urllib.request.urlopen(url, timeout=30) as r:
            d = json.loads(r.read())
    except Exception:
        return {}
    out = {}
    for x in d.get("results") or []:
        t = x.get("T")
        if t and None not in (x.get("o"), x.get("h"), x.get("l"), x.get("c")):
            out[t] = [date_str, x.get("o"), x.get("h"), x.get("l"), x.get("c"), x.get("v")]
    return out

today = dt.date.today()
by_tkr, dates_ok = {}, []
for i in range(DAYS, -1, -1):
    ds = (today - dt.timedelta(days=i)).isoformat()
    g = grouped(ds)
    if not g:
        continue
    dates_ok.append(ds)
    for t, bar in g.items():
        by_tkr.setdefault(t, {})[ds] = bar
print(f"grouped days with data: {dates_ok}  |  tickers: {len(by_tkr)}")

man = json.load(open(os.environ.get("TERMINAL_MANIFEST") or os.path.join(D, "manifest.json")))
updated = appended = 0
sample = {}
for sym, row in man["symbols"].items():
    if row.get("mkt") not in US_MKTS:
        continue
    gt = by_tkr.get(sym)
    if not gt:
        continue
    p = os.path.join(D, f"{sym}.json")
    if not os.path.exists(p):
        continue
    try:
        d = json.load(open(p))
    except Exception:
        continue
    bars = d.get("bars") or []
    if not bars:
        continue
    new_dates = sorted(ds for ds in gt if ds > bars[-1][0])
    if not new_dates:
        continue
    for ds in new_dates:
        bars.append(gt[ds]); appended += 1
    if WRITE:
        d["bars"] = bars
        tmp = p + ".tmp"
        json.dump(d, open(tmp, "w"), separators=(",", ":"))
        os.replace(tmp, p)
    updated += 1
    if sym in ("WM", "REGN", "MCK", "SOFI", "KRUS", "ZS", "FOUR", "VEEV", "YELP", "CNI"):
        sample[sym] = {"new_last_date": bars[-1][0], "close": bars[-1][4]}

print(f"US symbols updated: {updated}  |  bars appended: {appended}")
print("sample:", json.dumps(sample))
print("WROTE" if WRITE else "DRY-RUN (no write)")
