#!/usr/bin/env python3
"""hydrate_prices.py — fill manifest last/chg/open/high/low/vol/hi52/lo52 for every
symbol that has an OHLC file but no manifest price (the expanded non-flagship universe).
Flagship rows (which already carry live-hub last/chg) are left untouched. Reads OHLC one
file at a time (low RSS — safe on the 1.9GB box). Atomic write.

Operates on $TERMINAL_MANIFEST if set (nightly staging), else the live manifest.json.
Usage: hydrate_prices.py [--write]   (default = dry-run)
"""
import json, os, sys, tempfile

D = os.environ.get("TERMINAL_DATA_DIR", "/opt/terminal/terminal/public/data")
MAN = os.environ.get("TERMINAL_MANIFEST") or os.path.join(D, "manifest.json")
WRITE = "--write" in sys.argv

man = json.load(open(MAN))
syms = man["symbols"]
filled = have = no_ohlc = empty = 0
sample = {}
for sym, row in syms.items():
    if "verdict" in row:  # flagship (build_polygon_universe/fast_flagship) — leave live prices
        have += 1; continue
    p = os.path.join(D, f"{sym}.json")
    if not os.path.exists(p):
        no_ohlc += 1; continue
    try:
        bars = (json.load(open(p)) or {}).get("bars") or []
    except Exception:
        empty += 1; continue
    if not bars or len(bars[-1]) < 6:
        empty += 1; continue
    last = bars[-1]
    c = last[4]
    if not c:
        empty += 1; continue
    prev_c = bars[-2][4] if len(bars) >= 2 and bars[-2][4] else last[1]
    row["last"] = c
    row["chg"] = (c / prev_c - 1.0) * 100.0 if prev_c else 0.0
    row["open"], row["high"], row["low"], row["vol"] = last[1], last[2], last[3], last[5]
    win = bars[-252:]
    row["hi52"] = max(b[2] for b in win)
    row["lo52"] = min(b[3] for b in win)
    filled += 1
    if sym in ("WM", "REGN", "MCK", "KRUS", "SOFI", "ZS", "FOUR", "VEEV", "YELP"):
        sample[sym] = {"last": row["last"], "chg": round(row["chg"], 2), "asof": last[0]}

print(f"manifest={MAN}")
print(f"symbols={len(syms)} already_priced={have} FILLED={filled} no_ohlc_file={no_ohlc} empty_ohlc={empty}")
print("sample:", json.dumps(sample))
if WRITE:
    fd, tmp = tempfile.mkstemp(dir=D, suffix=".hydrate.tmp")
    with os.fdopen(fd, "w") as f:
        json.dump(man, f, separators=(",", ":"))
    os.replace(tmp, MAN)
    print("WROTE", MAN)
else:
    print("DRY-RUN (no write)")
