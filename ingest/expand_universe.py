"""Phase 2 universe expansion — augment manifest.json toward the full search targets.

ADDITIVE only (never removes / never clobbers existing records). Adds:
  * US: S&P 1500 (macro PIT) UNION top US common stocks by dollar-volume -> ~3,000
        liquid names. Company name + NYSE/NASDAQ exchange from the Polygon reference
        endpoint; liquidity from the Polygon snapshot (prev-day v*c). This is a robust
        proxy for the S&P1500 + Russell2000 + Nasdaq100 index union without scraping
        ETF holdings (iShares' constituent CSV isn't reliably fetchable).
  * HK: top ~500 HK names by turnover from akshare (HSCI proxy), expanding the
        curated 160.

Run AFTER build_universe.py (it only adds rows that aren't already in the manifest):
  MACRO_REPO=<macro> python ingest/expand_universe.py [--us 3000] [--hk 500]
  MACRO_REPO=<macro> python ingest/expand_universe.py --us 3000           # US only
"""
from __future__ import annotations

import json
import os
import sys
import urllib.request
from pathlib import Path

import pandas as pd

from build_universe import OUT, MANIFEST, MACRO, color_for, _clean_name, _polygon_key, MIC_LABEL  # noqa: E402

US_REF_CACHE = Path(__file__).resolve().parent / ".polygon_us_ref.json"


# ---------------------------------------------------------------- US: Polygon reference (name + exchange)
def us_reference() -> dict[str, dict]:
    """ticker -> {'name','mkt'} for all active US common stocks (Polygon, cached)."""
    if US_REF_CACHE.exists():
        try:
            return json.loads(US_REF_CACHE.read_text())
        except Exception:
            pass
    key = _polygon_key()
    if not key:
        print("  [us-ref] no POLYGON_API_KEY — cannot expand US")
        return {}
    out: dict[str, dict] = {}
    url = ("https://api.polygon.io/v3/reference/tickers?market=stocks&active=true"
           f"&type=CS&limit=1000&apiKey={key}")
    pages = 0
    while url and pages < 40:
        with urllib.request.urlopen(url, timeout=30) as r:
            payload = json.loads(r.read())
        for t in payload.get("results", []):
            tk, mic, nm = t.get("ticker"), t.get("primary_exchange"), t.get("name")
            if tk and mic:
                out[tk] = {"name": _clean_name(nm, tk), "mkt": MIC_LABEL.get(mic, "US")}
        nxt = payload.get("next_url")
        url = f"{nxt}&apiKey={key}" if nxt else None
        pages += 1
    US_REF_CACHE.write_text(json.dumps(out))
    print(f"  [us-ref] {len(out)} US common stocks ({pages} pages)")
    return out


def us_dollar_vol() -> dict[str, float]:
    """ticker -> prev-day dollar volume from the Polygon full-market snapshot."""
    key = _polygon_key()
    if not key:
        return {}
    url = f"https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?apiKey={key}"
    with urllib.request.urlopen(url, timeout=60) as r:
        payload = json.loads(r.read())
    out: dict[str, float] = {}
    for t in payload.get("tickers", []):
        pd_ = t.get("prevDay") or {}
        v, c = pd_.get("v") or 0, pd_.get("c") or 0
        if t.get("ticker"):
            out[t["ticker"]] = float(v) * float(c)
    print(f"  [us-snap] {len(out)} tickers with prev-day liquidity")
    return out


def sp1500_current() -> set[str]:
    p = MACRO / "data" / "breadth" / "sp1500_pit_membership.parquet"
    if not p.exists():
        return set()
    df = pd.read_parquet(p)
    cur = df[df["end_date"].isna()] if "end_date" in df else df
    return set(cur["ticker"].astype(str)) if "ticker" in cur else set()


def us_union(target: int) -> dict[str, dict]:
    ref = us_reference()
    if not ref:
        return {}
    dvol = us_dollar_vol()
    sp = sp1500_current() & set(ref)
    ranked = sorted(ref, key=lambda t: dvol.get(t, 0.0), reverse=True)
    chosen = set(ranked[:target]) | sp
    print(f"  [us-union] S&P1500∩ref={len(sp)} | top-{target}-by-$vol | total={len(chosen)}")
    return {t: ref[t] for t in chosen}


# ---------------------------------------------------------------- HK: akshare turnover list (HSCI proxy)
def hk_top(target: int) -> dict[str, dict]:
    try:
        import akshare as ak
    except Exception as e:
        print(f"  [hk] akshare unavailable ({e}) — skipping HK expansion")
        return {}
    try:
        df = ak.stock_hk_spot_em()
    except Exception as e:
        print(f"  [hk] stock_hk_spot_em failed ({e}) — skipping HK expansion")
        return {}
    code_c = next((c for c in ("代码", "symbol", "code") if c in df.columns), df.columns[1])
    name_c = next((c for c in ("名称", "name") if c in df.columns), df.columns[2])
    turn_c = next((c for c in ("成交额", "amount", "turnover") if c in df.columns), None)
    if turn_c:
        df = df.sort_values(turn_c, ascending=False)
    out: dict[str, dict] = {}
    for _, row in df.head(target).iterrows():
        raw = str(row[code_c]).strip()
        digits = "".join(ch for ch in raw if ch.isdigit())
        if not digits:
            continue
        tk = f"{int(digits):04d}.HK"
        out[tk] = {"name": _clean_name(row[name_c], tk), "mkt": "HKEX"}
    print(f"  [hk] {len(out)} HK names by turnover (of {len(df)})")
    return out


# ---------------------------------------------------------------- main
def main(argv: list[str]) -> None:
    us_target = 0
    hk_target = 0
    if "--us" in argv:
        us_target = int(argv[argv.index("--us") + 1])
    if "--hk" in argv:
        hk_target = int(argv[argv.index("--hk") + 1])
    if "--us" not in argv and "--hk" not in argv:
        us_target, hk_target = 3000, 500  # default: do both

    man_path = MANIFEST
    manifest = json.loads(man_path.read_text())
    symbols: dict[str, dict] = manifest["symbols"]
    before = len(symbols)

    adds = {}
    if us_target:
        adds.update({("US", t): r for t, r in us_union(us_target).items()})
    if hk_target:
        adds.update({("HK", t): r for t, r in hk_top(hk_target).items()})

    added = {"US": 0, "HK": 0}
    for (mk, tk), rec in adds.items():
        if tk in symbols:
            continue
        symbols[tk] = {"name": rec["name"], "sec": "Equities", "col": color_for(tk), "mkt": rec["mkt"]}
        added[mk] += 1

    manifest["symbols"] = symbols
    man_path.write_text(json.dumps(manifest, separators=(",", ":")))

    by_mkt: dict[str, int] = {}
    for r in symbols.values():
        by_mkt[r.get("mkt", "?")] = by_mkt.get(r.get("mkt", "?"), 0) + 1
    print(f"\nmanifest: {before} -> {len(symbols)} symbols (+{added['US']} US, +{added['HK']} HK)")
    print("  by market:", dict(sorted(by_mkt.items(), key=lambda kv: -kv[1])))


if __name__ == "__main__":
    main(sys.argv[1:])
