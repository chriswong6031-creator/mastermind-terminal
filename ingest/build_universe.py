"""Build the Terminal's MULTI-MARKET symbol universe + chart OHLC from the macro repo.

This is the search-bar universe builder. It reads the macro repo's per-market
universe stores (US / China A / Hong Kong / Canada) and per-name OHLC parquets,
and writes two things the Next app serves out of terminal/public/data/:

  * manifest.json          — the SEARCH universe. Every symbol carries a `mkt`
                             (home-market) label — NYSE / NASDAQ / SSE / SZSE /
                             HKEX / TSX / Crypto — rendered on the right of each
                             search row (TradingView-style). The existing rich
                             records (price / verdict / backtest) are preserved.
  * <SYMBOL>.json          — chart OHLC (same contract as sample_from_macro.py,
                             so chart.js renders it unchanged) for every name we
                             have a price store for. Symbols with no OHLC stay
                             searchable; the chart shows "No data" until backfilled.

Markets & sources (relative to MACRO_REPO):
    US      data/breadth/constituents.parquet     +  data/stocks/<T>.parquet
    China   data/china_search/members.parquet     +  data/china_stocks/<T>.parquet
    HK      data/hk_breadth/constituents.parquet  +  data/hk_stocks/<T>.parquet
    Canada  data/canada_search/members.parquet    +  (no OHLC store yet)

Usage:
    MACRO_REPO=/path/to/macro python ingest/build_universe.py            # manifest only
    MACRO_REPO=/path/to/macro python ingest/build_universe.py --ohlc all # + all OHLC
    MACRO_REPO=/path/to/macro python ingest/build_universe.py --ohlc US China
    MACRO_REPO=/path/to/macro python ingest/build_universe.py --ohlc-sample 5

POLYGON_API_KEY (read from the repo .env if present) is used only to label US
names with their precise listing exchange (NYSE vs NASDAQ). Without it, US names
fall back to the generic "US" tag — everything else still works.
"""
from __future__ import annotations

import json
import os
import sys
import urllib.request
import urllib.parse
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]                       # charting-app/
OUT = ROOT / "terminal" / "public" / "data"
# manifest path override — the nightly refresh stages the manifest then atomically swaps it
MANIFEST = Path(os.environ.get("TERMINAL_MANIFEST") or (OUT / "manifest.json"))
MACRO = Path(os.environ.get("MACRO_REPO", "/Users/chriswong/Documents/Cluade/Macro Dashboard"))
MAX_BARS = 1300                                                  # ~5y daily, matches existing US files
EXCH_CACHE = ROOT / "ingest" / ".polygon_exchanges.json"


# ---------------------------------------------------------------- market labels
def _mkt_cn(t: str) -> str:
    return "SSE" if t.endswith(".SS") else "SZSE" if t.endswith(".SZ") else "CN"


# (key, members parquet, english-name column, per-name OHLC dir, market-label fn)
STORES = [
    ("US",     "data/breadth/constituents.parquet",    "name",    "data/stocks",        None),
    ("China",  "data/china_search/members.parquet",     "name_en", "data/china_stocks",  _mkt_cn),
    ("HK",     "data/hk_breadth/constituents.parquet",  "name",    "data/hk_stocks",     lambda t: "HKEX"),
    ("Canada", "data/canada_search/members.parquet",    "name",    "data/canada_stocks", lambda t: "TSX"),
]

# Polygon primary_exchange MIC -> display label
MIC_LABEL = {
    "XNYS": "NYSE", "XNAS": "NASDAQ", "XASE": "AMEX", "ARCX": "NYSE Arca",
    "BATS": "Cboe", "BATY": "Cboe", "EDGX": "Cboe", "IEXG": "IEX", "OTC": "OTC",
}


# ---------------------------------------------------------------- helpers
def _hsl_to_hex(h: float, s: float, l: float) -> str:
    def f(n):
        k = (n + h / 30) % 12
        a = s * min(l, 1 - l)
        return l - a * max(-1, min(k - 3, 9 - k, 1))
    return "#%02x%02x%02x" % tuple(round(255 * f(n)) for n in (0, 8, 4))


def color_for(sym: str) -> str:
    """Stable, distinct-ish icon colour from the ticker (icon text is dark)."""
    h = sum((i + 1) * ord(c) for i, c in enumerate(sym)) % 360
    return _hsl_to_hex(h, 0.55, 0.60)


def _clean_name(v, fallback: str) -> str:
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return fallback
    s = str(v).strip()
    return s.split(" / ")[0] if " / " in s else (s or fallback)


def _round(x, nd=4):
    return None if x is None or pd.isna(x) else round(float(x), nd)


def build_ohlc_json(ticker: str, df: pd.DataFrame) -> dict:
    """Candle contract; reconstruct open = prior close and clamp h/l to include it
    (verbatim with the macro build_chart_data.py / sample_from_macro.py)."""
    df = df.dropna(subset=["close"]).sort_index().tail(MAX_BARS)
    closes = df["close"].astype(float)
    prev = closes.shift(1).fillna(closes)
    bars = []
    for dt, c, o in zip(df.index, closes, prev):
        hi = df.at[dt, "high"] if "high" in df else c
        lo = df.at[dt, "low"] if "low" in df else c
        hi = max(_round(hi) or c, c, o)
        lo = min(_round(lo) or c, c, o)
        vol = _round(df.at[dt, "volume"], 0) if "volume" in df else None
        bars.append([dt.strftime("%Y-%m-%d"), _round(o), hi, lo, _round(c), vol])
    return {"t": ticker, "o": 1, "src": "deep", "bar_quality": "synthetic_open_deepstore", "bars": bars}


# ---------------------------------------------------------------- polygon exchange map
def _polygon_key() -> str | None:
    if os.environ.get("POLYGON_API_KEY"):
        return os.environ["POLYGON_API_KEY"]
    env = ROOT / ".env"
    if env.exists():
        for line in env.read_text().splitlines():
            if line.startswith("POLYGON_API_KEY="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    return None


def us_exchange_map() -> dict[str, str]:
    """ticker -> 'NYSE'/'NASDAQ'/... from Polygon reference (cached). {} on failure."""
    if EXCH_CACHE.exists():
        try:
            return json.loads(EXCH_CACHE.read_text())
        except Exception:
            pass
    key = _polygon_key()
    if not key:
        print("  [exch] no POLYGON_API_KEY — US names get the generic 'US' tag")
        return {}
    out: dict[str, str] = {}
    url = ("https://api.polygon.io/v3/reference/tickers?market=stocks&active=true"
           f"&type=CS&limit=1000&apiKey={key}")
    pages = 0
    try:
        while url and pages < 40:
            with urllib.request.urlopen(url, timeout=30) as r:
                payload = json.loads(r.read())
            for t in payload.get("results", []):
                tk, mic = t.get("ticker"), t.get("primary_exchange")
                if tk and mic:
                    out[tk] = MIC_LABEL.get(mic, "US")
            nxt = payload.get("next_url")
            url = f"{nxt}&apiKey={key}" if nxt else None
            pages += 1
        EXCH_CACHE.write_text(json.dumps(out))
        print(f"  [exch] polygon reference: {len(out)} US tickers mapped ({pages} pages)")
    except Exception as e:
        print(f"  [exch] polygon fetch failed ({e}); falling back to 'US' tag")
        return {}
    return out


# ---------------------------------------------------------------- main
def main(argv: list[str]) -> None:
    # parse args
    ohlc_markets: set[str] = set()
    ohlc_sample = 0
    if "--ohlc" in argv:
        i = argv.index("--ohlc")
        rest = argv[i + 1:]
        if rest and rest[0] == "all":
            ohlc_markets = {"US", "China", "HK", "Canada"}
        else:
            ohlc_markets = {a for a in rest if not a.startswith("-")}
    if "--ohlc-sample" in argv:
        i = argv.index("--ohlc-sample")
        ohlc_sample = int(argv[i + 1])
        ohlc_markets = {"US", "China", "HK", "Canada"}

    OUT.mkdir(parents=True, exist_ok=True)

    # 1) preserve the existing rich manifest (price/verdict/backtest for the tracked set)
    man_path = MANIFEST
    manifest = json.loads(man_path.read_text()) if man_path.exists() else {"as_of": None, "source": "macro", "symbols": {}}
    symbols: dict[str, dict] = manifest.get("symbols", {})

    exch = us_exchange_map()

    # tag the existing records with a market label
    for sym, rec in symbols.items():
        if rec.get("mkt"):
            continue
        if rec.get("sec") == "Crypto" or sym.endswith("-USD"):
            rec["mkt"] = "Crypto"
        else:
            rec["mkt"] = exch.get(sym, "US")

    # 2) fold in every per-market universe (search rows + colour + market tag)
    added = {k: 0 for k, *_ in STORES}
    ohlc_written = {k: 0 for k, *_ in STORES}
    last_dates: list[str] = []
    if manifest.get("as_of"):
        last_dates.append(manifest["as_of"])

    for key, members_rel, name_col, ohlc_rel, mkt_fn in STORES:
        mp = MACRO / members_rel
        if not mp.exists():
            print(f"  [{key}] members parquet missing: {mp} — skipped")
            continue
        meta = pd.read_parquet(mp)
        tickers = list(meta.index.astype(str))
        ohlc_dir = MACRO / ohlc_rel

        # decide which tickers get OHLC this run
        do_ohlc = key in ohlc_markets
        sample_left = ohlc_sample if ohlc_sample else None

        for tk in tickers:
            if tk not in symbols:                       # don't clobber rich records
                name = _clean_name(meta.at[tk, name_col] if name_col in meta.columns else None,
                                   _clean_name(meta.at[tk, "name"] if "name" in meta.columns else None, tk))
                mkt = (mkt_fn(tk) if mkt_fn else exch.get(tk, "US"))
                symbols[tk] = {"name": name, "sec": "Equities", "col": color_for(tk), "mkt": mkt}
                added[key] += 1

            if do_ohlc and (sample_left is None or sample_left > 0):
                out_path = OUT / f"{tk}.json"
                # never clobber the flagship real-OHLC (polygon) files with deep-store synthetic opens
                keep_existing = False
                if out_path.exists():
                    try:
                        keep_existing = json.loads(out_path.read_text()).get("src") == "polygon"
                    except Exception:
                        keep_existing = False
                p = ohlc_dir / f"{tk}.parquet"
                if not keep_existing and p.exists():
                    try:
                        df = pd.read_parquet(p)
                        if "close" in df and len(df.dropna(subset=["close"])):
                            oj = build_ohlc_json(tk, df)
                            out_path.write_text(json.dumps(oj, separators=(",", ":")))
                            ohlc_written[key] += 1
                            last_dates.append(oj["bars"][-1][0])
                            if sample_left is not None:
                                sample_left -= 1
                    except Exception as e:
                        print(f"    skip OHLC {tk}: {e}")

        print(f"  [{key}] {len(tickers)} names | +{added[key]} new search rows | {ohlc_written[key]} OHLC written")

    # 3) write manifest
    manifest["symbols"] = symbols
    manifest["source"] = "macro-multimarket"
    if last_dates:
        manifest["as_of"] = max(last_dates)
    man_path.write_text(json.dumps(manifest, separators=(",", ":")))

    by_mkt: dict[str, int] = {}
    for r in symbols.values():
        by_mkt[r.get("mkt", "?")] = by_mkt.get(r.get("mkt", "?"), 0) + 1
    print(f"\nmanifest: {len(symbols)} searchable symbols, as_of {manifest.get('as_of')}")
    print("  by market:", dict(sorted(by_mkt.items(), key=lambda kv: -kv[1])))


if __name__ == "__main__":
    main(sys.argv[1:])
