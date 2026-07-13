#!/usr/bin/env python3
"""refresh_ohlc_intl.py — append recent daily bars to EXISTING non-US OHLC files via
yfinance bulk download. Non-US manifest symbols carry Yahoo suffixes (.HK/.SS/.SZ/.T/.L/
.TO/.NS/...), so the manifest key IS the yfinance ticker. Companion to refresh_ohlc.py
(US via Polygon grouped-daily). Batched + memory-light (one batch in RAM at a time);
appends only dates newer than each file's last bar (idempotent). Skips US + flagship.

Appends go through append_recent_bars, which re-runs the ticker-reuse guard on the
stitched series: Yahoo series are keyed by ticker string, and exchanges reissue codes
(HKEX 0300 → Midea Group 2024-09), so a reused ticker would otherwise stitch the new
holder's bars onto the old holder's file.

Usage: refresh_ohlc_intl.py [--batch N] [--limit N] [--days N] [--write]
"""
import json, os, sys

try:
    from ingest.polygon_bars import append_recent_bars  # package context (tests)
except ImportError:  # run as `python ingest/refresh_ohlc_intl.py` — same-dir import
    from polygon_bars import append_recent_bars

D = os.environ.get("TERMINAL_DATA_DIR", "/opt/terminal/terminal/public/data")
MAN = os.environ.get("TERMINAL_MANIFEST") or os.path.join(D, "manifest.json")
US_MKTS = {"NASDAQ", "NYSE", "US", "AMEX", "NYSEAMERICAN", "NYSE American", "NYSE Arca", "BATS", "Crypto"}


def _r(x):
    try:
        x = float(x)
        return round(x, 4) if x == x else None
    except Exception:
        return None


def main():
    import yfinance as yf

    write = "--write" in sys.argv
    def _arg(n, d): return int(sys.argv[sys.argv.index(n) + 1]) if n in sys.argv else d
    batch_n, limit, days = _arg("--batch", 150), _arg("--limit", 0), _arg("--days", 10)

    man = json.load(open(MAN))
    syms = man["symbols"]
    todo = [s for s, r in syms.items()
            if r.get("mkt") not in US_MKTS and "verdict" not in r
            and os.path.exists(os.path.join(D, f"{s}.json"))]
    if limit:
        todo = todo[:limit]
    print(f"non-US OHLC files to refresh: {len(todo)} (batch={batch_n}, write={write})", flush=True)

    updated = appended = failed = 0
    sample = {}
    for i in range(0, len(todo), batch_n):
        batch = todo[i:i + batch_n]
        try:
            df = yf.download(batch, period=f"{max(days,5)}d", group_by="ticker",
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
            new = []
            for idx, row in sub.iterrows():
                ds = idx.strftime("%Y-%m-%d")
                o, h, l, c = _r(row.get("Open")), _r(row.get("High")), _r(row.get("Low")), _r(row.get("Close"))
                v = row.get("Volume")
                if None in (o, h, l, c):
                    continue
                new.append([ds, o, h, l, c, (int(v) if v == v and v is not None else 0)])
            bars, n_new = append_recent_bars(sym, bars, new)
            if not n_new:
                continue
            appended += n_new; updated += 1
            if write:
                d["bars"] = bars
                tmp = p + ".tmp"
                json.dump(d, open(tmp, "w"), separators=(",", ":")); os.replace(tmp, p)
            if len(sample) < 8:
                sample[sym] = {"new_last": bars[-1][0], "c": bars[-1][4]}
        del df
        print(f"  ...{min(i+batch_n,len(todo))}/{len(todo)} | updated={updated} appended={appended} failed={failed}", flush=True)

    print(f"non-US updated: {updated} | bars appended: {appended} | batch failures: {failed}")
    print("sample:", json.dumps(sample))
    print("WROTE" if write else "DRY-RUN (no write)")


if __name__ == "__main__":
    main()
