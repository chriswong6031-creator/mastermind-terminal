#!/usr/bin/env python3
"""refresh_ohlc_intl.py — append recent daily bars to EXISTING non-US OHLC files via
yfinance bulk download. Non-US manifest symbols carry Yahoo suffixes (.HK/.SS/.SZ/.T/.L/
.TO/.NS/...), so the manifest key IS the yfinance ticker. Companion to refresh_ohlc.py
(US via Polygon grouped-daily). Batched + memory-light (one batch in RAM at a time);
appends only dates newer than each file's last bar (idempotent). Skips US + flagship.

Usage: refresh_ohlc_intl.py [--batch N] [--limit N] [--days N] [--write]
"""
import json, os, sys
import yfinance as yf

D = os.environ.get("TERMINAL_DATA_DIR", "/opt/terminal/terminal/public/data")
MAN = os.environ.get("TERMINAL_MANIFEST") or os.path.join(D, "manifest.json")
US_MKTS = {"NASDAQ", "NYSE", "US", "AMEX", "NYSEAMERICAN", "NYSE American", "NYSE Arca", "BATS", "Crypto"}
WRITE = "--write" in sys.argv
def _arg(n, d): return int(sys.argv[sys.argv.index(n) + 1]) if n in sys.argv else d
BATCH, LIMIT, DAYS = _arg("--batch", 150), _arg("--limit", 0), _arg("--days", 10)

def _r(x):
    try:
        x = float(x)
        return round(x, 4) if x == x else None
    except Exception:
        return None

man = json.load(open(MAN))
syms = man["symbols"]
todo = [s for s, r in syms.items()
        if r.get("mkt") not in US_MKTS and "verdict" not in r
        and os.path.exists(os.path.join(D, f"{s}.json"))]
if LIMIT:
    todo = todo[:LIMIT]
print(f"non-US OHLC files to refresh: {len(todo)} (batch={BATCH}, write={WRITE})", flush=True)

updated = appended = failed = 0
sample = {}
for i in range(0, len(todo), BATCH):
    batch = todo[i:i + BATCH]
    try:
        df = yf.download(batch, period=f"{max(DAYS,5)}d", group_by="ticker",
                         threads=True, progress=False, auto_adjust=True)
    except Exception:
        failed += len(batch); continue
    for sym in batch:
        try:
            sub = (df[sym] if len(batch) > 1 else df).dropna(how="all")
        except Exception:
            continue
        if sub is None or len(sub) == 0:
            continue
        p = os.path.join(D, f"{sym}.json")
        try:
            d = json.load(open(p)); bars = d.get("bars") or []
        except Exception:
            continue
        if not bars:
            continue
        last_date = bars[-1][0]
        new = []
        for idx, row in sub.iterrows():
            ds = idx.strftime("%Y-%m-%d")
            if ds <= last_date:
                continue
            o, h, l, c = _r(row.get("Open")), _r(row.get("High")), _r(row.get("Low")), _r(row.get("Close"))
            v = row.get("Volume")
            if None in (o, h, l, c):
                continue
            new.append([ds, o, h, l, c, (int(v) if v == v and v is not None else 0)])
        if not new:
            continue
        bars.extend(new); appended += len(new); updated += 1
        if WRITE:
            d["bars"] = bars
            tmp = p + ".tmp"
            json.dump(d, open(tmp, "w"), separators=(",", ":")); os.replace(tmp, p)
        if len(sample) < 8:
            sample[sym] = {"new_last": bars[-1][0], "c": bars[-1][4]}
    del df
    print(f"  ...{min(i+BATCH,len(todo))}/{len(todo)} | updated={updated} appended={appended} failed={failed}", flush=True)

print(f"non-US updated: {updated} | bars appended: {appended} | batch failures: {failed}")
print("sample:", json.dumps(sample))
print("WROTE" if WRITE else "DRY-RUN (no write)")
