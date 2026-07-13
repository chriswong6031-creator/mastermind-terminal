"""Phase 2 universe expansion — augment manifest.json toward the full search targets.

ADDITIVE only (never removes / never clobbers existing records). Adds:
  * US: S&P 1500 (macro PIT) UNION top US common stocks by dollar-volume -> ~3,000
        liquid names, UNION ALL active ADRCs (US-listed foreign companies).
        Company name + NYSE/NASDAQ exchange from the Polygon reference
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
import time
import urllib.request
from pathlib import Path

import pandas as pd

from build_universe import OUT, MANIFEST, MACRO, color_for, _clean_name, _polygon_key, MIC_LABEL  # noqa: E402

US_REF_CACHE = Path(__file__).resolve().parent / ".polygon_us_ref.json"
HK_TOP_CACHE = Path(__file__).resolve().parent / "hk_universe_cache.json"

# Schema sentinel: the cache must carry BOTH CS and ADRC records.
# Strip this key on read; refetch if absent or mismatched (auto-heals old CS-only cache).
_US_REF_SCHEMA = "cs+adrc-v1"

# Refetch the Polygon reference once the cache is older than this. Without a TTL the
# cache was permanent, so brand-new listings (IPOs, new ADRs) could never enter the
# universe. A failed refetch falls back to the stale cache — never shrinks.
_US_REF_TTL_S = 20 * 3600


# ---------------------------------------------------------------- US: Polygon reference (name + exchange)
def _fetch_ref_by_type(key: str, tk_type: str) -> dict[str, dict]:
    """Paginate Polygon reference/tickers for a single type (CS or ADRC).

    Returns ticker -> {name, mkt, adr} for all active US tickers of that type.
    adr=True only for ADRC records.
    """
    out: dict[str, dict] = {}
    url = ("https://api.polygon.io/v3/reference/tickers?market=stocks&active=true"
           f"&type={tk_type}&limit=1000&apiKey={key}")
    pages = 0
    is_adr = (tk_type == "ADRC")
    while url and pages < 40:
        with urllib.request.urlopen(url, timeout=30) as r:
            payload = json.loads(r.read())
        for t in payload.get("results", []):
            tk, mic, nm = t.get("ticker"), t.get("primary_exchange"), t.get("name")
            if tk and mic:
                out[tk] = {
                    "name": _clean_name(nm, tk),
                    "mkt": MIC_LABEL.get(mic, "US"),
                    "adr": is_adr,
                }
        nxt = payload.get("next_url")
        url = f"{nxt}&apiKey={key}" if nxt else None
        pages += 1
    if url:
        # Hitting the page cap with next_url pending means a silently truncated result;
        # raise so us_reference() falls back to the stale cache instead of trusting it.
        raise RuntimeError(f"{tk_type} pagination truncated at {pages} pages")
    print(f"  [us-ref/{tk_type}] {len(out)} tickers ({pages} pages)")
    return out


def us_reference() -> dict[str, dict]:
    """ticker -> {'name','mkt','adr'} for all active US CS + ADRC tickers (Polygon, cached).

    The cache carries a __schema__ sentinel 'cs+adrc-v1'.  If the sentinel is absent
    or mismatched (old CS-only cache) the cache is discarded and both passes are re-run.
    Both passes must succeed before the cache is written (all-or-nothing).
    """
    cached: dict[str, dict] | None = None
    if US_REF_CACHE.exists():
        try:
            raw = json.loads(US_REF_CACHE.read_text())
            if raw.get("__schema__") == _US_REF_SCHEMA:
                # Strip the sentinel key; an empty payload is not a usable cache.
                cached = {k: v for k, v in raw.items() if k != "__schema__"} or None
                age = time.time() - US_REF_CACHE.stat().st_mtime
                if cached and age < _US_REF_TTL_S:
                    return cached
                if cached:
                    print(f"  [us-ref] cache is {age / 3600:.0f}h old — refetching for new listings")
            else:
                print(f"  [us-ref] cache schema mismatch ({raw.get('__schema__')!r} != {_US_REF_SCHEMA!r}) — refetch")
        except Exception:
            pass

    key = _polygon_key()
    if not key:
        if cached:
            print("  [us-ref] no POLYGON_API_KEY — using stale cache")
            return cached
        print("  [us-ref] no POLYGON_API_KEY — cannot expand US")
        return {}

    # Two sequential passes; write cache only after BOTH succeed (all-or-nothing).
    # A network failure on either pass must NOT propagate — fall back to the stale
    # cache when we have one, else return {} so us_union() skips US expansion cleanly
    # (mirrors build_universe.us_exchange_map()).
    out: dict[str, dict] = {}
    try:
        for tk_type in ("CS", "ADRC"):
            out.update(_fetch_ref_by_type(key, tk_type))
    except Exception as exc:
        if cached:
            print(f"  [us-ref] polygon refetch failed ({exc}) — using stale cache")
            return cached
        print(f"  [us-ref] polygon fetch failed ({exc}) — cannot expand US")
        return {}

    # A well-formed but degraded response (empty results, partial outage) must not
    # replace a known-good cache: treat a big shrink as a failed fetch.
    if cached and len(out) < 0.8 * len(cached):
        print(f"  [us-ref] refetch returned {len(out)} < 80% of cached {len(cached)} — keeping stale cache")
        return cached

    # Write cache with schema sentinel (atomic: tmp + replace, this now runs nightly)
    to_write = dict(out)
    to_write["__schema__"] = _US_REF_SCHEMA
    tmp = US_REF_CACHE.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(to_write))
    os.replace(tmp, US_REF_CACHE)
    print(f"  [us-ref] {len(out)} total US tickers cached (CS+ADRC)")
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


# Curated must-include names: guaranteed in the universe from day one even when the
# Polygon reference hasn't picked them up yet (e.g. an ADR that starts trading this
# week). The reference record wins once it appears — this is only the bootstrap row.
ENSURE_US: dict[str, dict] = {
    # Regular-way trading starts 2026-07-13 (Nasdaq Global Select; when-issued SKHYV
    # traded 2026-07-10 only). 1 ADS = 1/10 KRX 000660 share. HXSCL is the old,
    # separate GDR line — do not alias.
    "SKHY": {"name": "SK hynix", "mkt": "NASDAQ", "adr": True},
}


def us_union(target: int) -> dict[str, dict]:
    ref = us_reference()
    if not ref:
        return dict(ENSURE_US)
    for tk, rec in ENSURE_US.items():
        ref.setdefault(tk, rec)
    dvol = us_dollar_vol()
    sp = sp1500_current() & set(ref)
    ranked = sorted(ref, key=lambda t: dvol.get(t, 0.0), reverse=True)
    # ADR force-include: all ADRC tickers always enter chosen regardless of $vol rank
    adr = {t for t in ref if ref[t].get("adr")}
    chosen = set(ranked[:target]) | sp | adr | set(ENSURE_US)
    print(f"  [us-union] S&P1500∩ref={len(sp)} | top-{target}-by-$vol | ADR={len(adr)} | total={len(chosen)}")
    return {t: ref[t] for t in chosen}


# ---------------------------------------------------------------- HK: akshare turnover list (HSCI proxy)
def _hk_cache_load() -> dict[str, dict]:
    try:
        data = json.loads(HK_TOP_CACHE.read_text())
        return {k: v for k, v in data.items()
                if isinstance(v, dict) and v.get("name") and v.get("mkt")}
    except Exception:
        return {}


def hk_top(target: int) -> dict[str, dict]:
    """Full HKEX universe (was: top-`target` by turnover).

    The cache (hk_universe_cache.json) is now the AUTHORITATIVE FLOOR — the complete list
    of HKEX-listed names from Tushare `hk_basic` (~2.8k), refreshed on the Mac via
    ingest/gen_hk_universe.py (the Tushare token lives on the Mac, not the VPS). akshare's
    live East Money spot list is unioned on top when reachable, purely to pick up brand-new
    listings and refresh names; it can NEVER shrink the universe below the cache, and its
    failure (RemoteDisconnected is common from the VPS) is a clean no-op.

    `target` is retained for CLI back-compat. It no longer caps the universe: every akshare
    name is taken. It only bounds the akshare overlay when there is NO cache floor at all
    (fresh box), preserving the old top-N behavior in that degenerate case.
    """
    base = _hk_cache_load()  # authoritative floor (full hk_basic universe; may be empty on a fresh box)
    try:
        import akshare as ak

        df = ak.stock_hk_spot_em()
    except Exception as e:
        print(f"  [hk] akshare unreachable ({type(e).__name__}) — using cache floor ({len(base)} names)")
        return base
    code_c = next((c for c in ("代码", "symbol", "code") if c in df.columns), df.columns[1])
    name_c = next((c for c in ("名称", "name") if c in df.columns), df.columns[2])
    turn_c = next((c for c in ("成交额", "amount", "turnover") if c in df.columns), None)
    if turn_c:
        df = df.sort_values(turn_c, ascending=False)
    # No cap when we have an authoritative floor: take every akshare name. Only fall back to
    # head(target) on a fresh box (no cache) with a positive target (legacy behavior).
    rows = df if (base or target <= 0) else df.head(target)
    ak_out: dict[str, dict] = {}
    for _, row in rows.iterrows():
        raw = str(row[code_c]).strip()
        digits = "".join(ch for ch in raw if ch.isdigit())
        if not digits:
            continue
        tk = f"{int(digits):04d}.HK"
        ak_out[tk] = {"name": _clean_name(row[name_c], tk), "mkt": "HKEX"}
    # Union: cache (authoritative English/curated names) WINS; akshare only ADDS new listings.
    out = {**ak_out, **base}
    print(f"  [hk] {len(out)} HK names (cache floor {len(base)} ∪ akshare {len(ak_out)})")
    if out:
        try:
            HK_TOP_CACHE.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
        except Exception as e:
            print(f"  [hk] cache write failed ({e})")
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
        # Drop the internal 'adr' flag — manifest row shape is {name, sec, col, mkt}
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
