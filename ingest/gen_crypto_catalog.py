"""Regenerate the `_CRYPTO` block of macro_catalog.py from live Coinbase reference data.

WHY A GENERATOR AND A HAND-KEPT LIST
    macro_catalog.py is deliberately a curated, reviewable file — a feed that silently balloons
    the search universe is exactly what it exists to avoid. But "which coins" is a question about
    live venue data (what is listed, what actually trades), not a matter of taste. So the rule is
    encoded here, run by hand, and its OUTPUT is pasted into macro_catalog.py where a human can
    review the diff. Nothing in the nightly calls this.

        python ingest/gen_crypto_catalog.py                 # print the _CRYPTO rows
        python ingest/gen_crypto_catalog.py --explain        # + the ranking table behind them

THE SELECTION RULE
    A pair is in the universe when it is BOTH live-quotable and chartable on the legs the
    Terminal already uses — no row may be a dead end:

      * listed on Coinbase as an ONLINE USD spot product. Crypto quotes come from the Coinbase
        websocket (hub/lib/coinbase.js derives its products straight from the manifest's -USD
        symbols), so anything off that list can never price. MATIC-USD is the cautionary case:
        Coinbase delisted it, and the feed answers a subscribe with "MATIC-USD is delisted".
      * has daily candles on Coinbase's public candles endpoint, which is what
        refresh_crypto_ohlc.py charts it from.

    Then, ranked by 30-DAY MEDIAN USD VOLUME (close x volume, median not mean so one squeeze day
    cannot promote a dust market), we keep:

      * the top TOP_N by that measure — an objective liquidity cut on our own venue, and
      * every coin in MAJORS below — durable names whose Coinbase volume alone understates them
        (a US venue is not where TON or GRT trades). Without this floor the list churns with each
        month's rotation and recognizable coins fall out.

    Both legs matter: volume alone admits a memecoin of the week and drops Tezos; a curated list
    alone goes stale. The union is ~160 pairs, four figures short of "everything" and reviewable.

ENGLISH AND CHINESE NAMES
    Coinbase's /currencies name is the default English name. NAME_FIX overrides the handful it
    gets wrong or abbreviates ("Ether" -> "Ethereum", "Crypto.com Coin" -> "Cronos"). ZH carries
    Chinese names for the coins that genuinely have one in circulation; the rest fall back to the
    English name, which is what the zh UI shows for Uniswap/Aave/Arbitrum today. A blank zh is
    not acceptable — displayName() would render an empty row name in the Chinese UI.
"""
from __future__ import annotations

import argparse
import concurrent.futures as cf
import datetime as dt
import json
import statistics
import sys
import time
import urllib.error
import urllib.request

CB = "https://api.exchange.coinbase.com"
UA = {"User-Agent": "Mozilla/5.0"}

TOP_N = 140
CANDLE_DAYS = 299          # the candles endpoint serves 300 rows per request; stay inside one page
MIN_BARS = 20              # a pair too new to draw anything is not chartable yet

# Durable names that must not fall out of the universe on a slow Coinbase month. Bases, not pairs;
# a name here that Coinbase does not list is simply skipped (MKR, TRX, RUNE, EOS are not listed).
MAJORS = {
    "BTC", "ETH", "SOL", "XRP", "ADA", "AVAX", "LINK", "DOT", "LTC", "BCH", "UNI", "ATOM",
    "AAVE", "ALGO", "FIL", "ETC", "XLM", "SHIB", "NEAR", "APT", "ARB", "OP", "DOGE", "POL",
    "TON", "TRX", "MKR", "GRT", "MANA", "SAND", "XTZ", "EOS", "COMP", "ZEC", "SNX", "ENS",
    "SUSHI", "CHZ", "CRV", "LDO", "IMX", "STX", "HBAR", "ICP", "SUI", "TAO", "SEI", "TIA",
    "RENDER", "INJ", "VET", "DASH", "ZK", "STRK", "1INCH", "BAL", "KSM", "QNT", "JASMY",
}

# Coinbase /currencies names that are wrong, abbreviated, or renamed. Left of the arrow is the
# base currency id; the value is what the row displays in the English UI.
NAME_FIX = {
    "ETH": "Ethereum",
    "ETC": "Ethereum Classic",
    "NEAR": "NEAR Protocol",
    "CRO": "Cronos",
    "ZRO": "LayerZero",
    "IO": "io.net",
    "ETHFI": "ether.fi",
    "IP": "Story Protocol",
    "O": "O1 Exchange",
    "S": "Sonic",
    "AI": "Gensyn",
    "RE": "Re Protocol",
    "SPX": "SPX6900",
    "WIF": "dogwifhat",
    "JUPITER": "Jupiter",
    "MANTLE": "Mantle",
    "STG": "Stargate Finance",
    "USD1": "World Liberty Financial USD",
    "LSETH": "Liquid Staked ETH",
    "CBETH": "Coinbase Wrapped Staked ETH",
    "PAXG": "PAX Gold",
    "XCN": "Onyxcoin",
    "GWEI": "EthGas",
    "CHIP": "USD.ai",
    "B3": "B3",
    "APR": "aPriori",
    "PROS": "Pharos",
}

# Chinese names in actual circulation on Chinese-language crypto sites. Everything not listed
# here keeps its English name in the zh UI — the honest fallback for a token with no established
# Chinese name, and what the catalog already did for Uniswap / Aave / Arbitrum / Optimism.
#
# The bar for an entry is "a Chinese reader would recognize this as the coin's name", NOT "this
# is a correct translation of the English words". A literal rendering nobody uses (Injective ->
# 注入协议, The Graph -> 图表币) is the same wrong-language noise as showing 狗狗币 to an English
# reader, only harder to notice — so when in doubt the coin stays English in both languages.
ZH = {
    "BTC": "比特币", "ETH": "以太坊", "SOL": "索拉纳", "XRP": "瑞波币", "USDT": "泰达币",
    "USDC": "美元币", "DOGE": "狗狗币", "ADA": "艾达币", "AVAX": "雪崩", "LINK": "链环",
    "DOT": "波卡", "POL": "多边形", "LTC": "莱特币", "BCH": "比特币现金", "ATOM": "宇宙",
    "ALGO": "阿尔戈兰德", "FIL": "文件币", "ETC": "以太经典", "XLM": "恒星币",
    "SHIB": "柴犬币", "BNB": "币安币", "TRX": "波场", "ZEC": "大零币", "DASH": "达世币",
    "XTZ": "特佐斯", "EOS": "柚子币", "XMR": "门罗币", "MKR": "创客币",
    "PEPE": "佩佩蛙", "WIF": "狗帽子", "FARTCOIN": "屁币", "TRUMP": "特朗普币",
    "ICP": "互联网计算机", "VET": "唯链", "SAND": "沙盒", "CHZ": "粉丝币",
    "SUSHI": "寿司", "CRV": "曲线", "RENDER": "渲染网络", "JASMY": "茉莉币",
    "WLD": "世界币",
}

MacroRow = tuple[str, str, str, str]     # base, english, chinese, colour


def _get(url: str, timeout: int = 25):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


def online_usd_products() -> list[dict]:
    """Coinbase USD spot pairs that are actually tradable right now."""
    return [
        p for p in _get(f"{CB}/products")
        if p.get("quote_currency") == "USD"
        and p.get("status") == "online"
        and not p.get("trading_disabled")
        and not p.get("auction_mode")
    ]


def currency_names() -> dict[str, str]:
    return {c["id"]: c.get("name") or c["id"] for c in _get(f"{CB}/currencies")}


def liquidity(product: dict) -> dict:
    """30-day median USD volume + candle depth for one pair. bars=-1 means the fetch failed."""
    pid = product["id"]
    end = dt.datetime.now(dt.UTC)
    start = end - dt.timedelta(days=CANDLE_DAYS)
    url = (f"{CB}/products/{pid}/candles?granularity=86400"
           f"&start={start:%Y-%m-%d}&end={end:%Y-%m-%d}")
    for attempt in range(4):
        try:
            rows = _get(url)
            if not isinstance(rows, list):          # {"message": "..."} on a rejected request
                raise ValueError(str(rows)[:120])
            # Coinbase candle order is [time, low, high, open, close, volume], newest first.
            usd = [c[4] * c[5] for c in rows if c[4] and c[5]]
            med = statistics.median(usd[:30]) if len(usd) >= 10 else 0.0
            return {"id": pid, "base": product["base_currency"], "bars": len(rows), "med30": med}
        except (urllib.error.URLError, TimeoutError, ValueError, json.JSONDecodeError):
            time.sleep(0.8 * (attempt + 1))
    return {"id": pid, "base": product["base_currency"], "bars": -1, "med30": 0.0}


# Row accent colours. Brand hexes for the coins that have a recognizable one; everything else
# gets a stable hash-derived colour from the same muted palette the rest of the catalog uses, so
# a new row never needs a colour decision to be added.
BRAND = {
    "BTC": "#f7931a", "ETH": "#627eea", "SOL": "#14f195", "XRP": "#23292f", "DOGE": "#c2a633",
    "ADA": "#0033ad", "AVAX": "#e84142", "LINK": "#2a5ada", "DOT": "#e6007a", "POL": "#8247e5",
    "LTC": "#a6a9aa", "BCH": "#8dc351", "UNI": "#ff007a", "ATOM": "#2e3148", "AAVE": "#b6509e",
    "ALGO": "#000000", "FIL": "#0090ff", "ETC": "#328332", "XLM": "#7d00ff", "SHIB": "#ffa409",
    "NEAR": "#00c08b", "APT": "#00d4aa", "ARB": "#2d374b", "OP": "#ff0420", "USDT": "#26a17b",
    "USDC": "#2775ca", "BNB": "#f3ba2f", "TON": "#0098ea", "TRX": "#eb0029", "ZEC": "#ecb244",
    "DASH": "#008ce7", "XTZ": "#2c7df7", "HBAR": "#000000", "ICP": "#3b00b9", "SUI": "#4da2ff",
    "TAO": "#ff9900", "PEPE": "#4a9c2d", "BONK": "#f4a52c", "CRO": "#1199fa", "VET": "#15bdff",
}
PALETTE = ["#2962ff", "#089981", "#f23645", "#f8b500", "#9c27b0", "#00bcd4", "#ff6d00", "#7e57c2"]


def colour(base: str) -> str:
    if base in BRAND:
        return BRAND[base]
    return PALETTE[sum(base.encode()) % len(PALETTE)]


def build(explain: bool = False) -> list[MacroRow]:
    products = online_usd_products()
    names = currency_names()
    print(f"coinbase: {len(products)} online USD spot products", file=sys.stderr)

    stats: list[dict] = []
    with cf.ThreadPoolExecutor(max_workers=6) as ex:
        for s in ex.map(liquidity, products):
            stats.append(s)
    failed = [s for s in stats if s["bars"] < 0]
    if failed:
        print(f"WARNING: {len(failed)} candle fetches failed: "
              f"{[s['id'] for s in failed][:8]} — rerun before pasting", file=sys.stderr)

    chartable = [s for s in stats if s["bars"] >= MIN_BARS]
    chartable.sort(key=lambda s: -s["med30"])
    top = chartable[:TOP_N]
    kept_bases = {s["base"] for s in top}
    floor = [s for s in chartable if s["base"] in MAJORS and s["base"] not in kept_bases]
    selected = top + sorted(floor, key=lambda s: -s["med30"])

    if explain:
        for i, s in enumerate(selected, 1):
            tag = "top" if s["base"] in kept_bases else "MAJORS-floor"
            print(f"{i:4d} {s['id']:16s} med30=${s['med30']:>14,.0f} bars={s['bars']:4d}  {tag}",
                  file=sys.stderr)
        missing = sorted(MAJORS - {s["base"] for s in chartable})
        print(f"\nMAJORS not listed/chartable on Coinbase (skipped): {missing}", file=sys.stderr)

    rows: list[MacroRow] = []
    for s in selected:
        base = s["base"]
        en = NAME_FIX.get(base) or names.get(base) or base
        rows.append((base, en, ZH.get(base, en), colour(base)))
    return rows


def emit(rows: list[MacroRow]) -> None:
    print("        # ── generated by ingest/gen_crypto_catalog.py — see that file for the rule ──")
    for base, en, zh, col in rows:
        row = f'("{base}", "{en}", "{zh}", "{col}"),'
        print(f"        {row}")
    print(f"        # {len(rows)} pairs", file=sys.stderr)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--explain", action="store_true", help="print the ranking table to stderr")
    args = ap.parse_args()
    emit(build(explain=args.explain))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
