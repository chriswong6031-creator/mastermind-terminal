"""The curated macro-instrument catalog: indices, benchmark yields, FX, and futures.

WHY THIS EXISTS
    The Terminal universe was equities + 61 US ETFs + 4 crypto. There were no indices, no
    FX, no rates, no commodities, and no index futures — while the search dialog has always
    shipped Forex / Futures / Indices / Bonds / Economy category tabs that had nothing to
    show. This is the catalog those tabs were waiting for.

WHY A CURATED LIST, NOT A FEED
    These are a few dozen instruments that essentially never change, unlike the 8.7k equity
    universe which is rebuilt nightly from the macro repo's stores. A hand-kept list is the
    honest shape: it is reviewable, it carries proper bilingual names, and it cannot silently
    balloon. Add a row to extend it — lib/macroSymbols.ts routes quotes by symbol SHAPE, so a
    new future is live the moment it is listed here, with no matching TS change.

DATA HONESTY
    Every symbol here is DELAYED, not real-time. Index values, CME futures, and ICE's dollar
    index all require licensed real-time feeds; what is freely available runs behind the
    exchange. Quotes are therefore published with basis DELAYED_15M. The genuinely-live legs
    of the Terminal remain: China A-shares and CN/HK indices (Tencent), and crypto (Coinbase).

    The FRED rows (real yields, breakevens) are neither real-time nor delayed quotes: they are
    the official DAILY prints, published once per session with no intraday value at all. One
    number a day is the whole series — see fetch_fred_daily.py for how that is encoded.

    Mainland-China indices are listed with their .SS/.SZ codes on purpose — they match the
    existing A-share classifier and Tencent serves indices under the same sh######/sz######
    codes, so they arrive on the LIVE Tencent leg rather than the delayed one.
"""
from __future__ import annotations

from typing import Iterator, NamedTuple


class MacroSymbol(NamedTuple):
    sym: str
    name: str            # English display name
    zh: str              # Chinese display name (the UI is bilingual; blank is not acceptable)
    sec: str             # search category: Indices | Bonds | Forex | Futures
    mkt: str             # market-group label, matching lib/markets.ts VENUE_GROUP vocabulary
    col: str             # row accent colour


# ── Indices ────────────────────────────────────────────────────────────────────────────────
# mkt is the market GROUP the index belongs to, so the market filter hides ^HSI for a user who
# has switched Hong Kong off — an index is part of a market like any listed name.
_INDICES: list[MacroSymbol] = [
    MacroSymbol("^GSPC", "S&P 500", "标普500", "Indices", "US", "#2962ff"),
    MacroSymbol("^NDX", "Nasdaq 100", "纳斯达克100", "Indices", "US", "#2962ff"),
    MacroSymbol("^DJI", "Dow Jones Industrial", "道琼斯工业", "Indices", "US", "#2962ff"),
    MacroSymbol("^RUT", "Russell 2000", "罗素2000", "Indices", "US", "#2962ff"),
    MacroSymbol("^VIX", "Volatility Index", "波动率指数", "Indices", "US", "#f23645"),
    # Mainland China — LIVE via Tencent (sh000001 / sh000300 / sz399001 / sz399006).
    MacroSymbol("000001.SS", "Shanghai Composite", "上证指数", "Indices", "SSE", "#f23645"),
    MacroSymbol("000300.SS", "CSI 300", "沪深300", "Indices", "SSE", "#f23645"),
    MacroSymbol("000905.SS", "CSI 500", "中证500", "Indices", "SSE", "#f23645"),
    MacroSymbol("399001.SZ", "Shenzhen Component", "深证成指", "Indices", "SZSE", "#f23645"),
    MacroSymbol("399006.SZ", "ChiNext", "创业板指", "Indices", "SZSE", "#f23645"),
    # Hong Kong — ^HSI has no numeric Tencent code, so it rides the Yahoo leg.
    MacroSymbol("^HSI", "Hang Seng", "恒生指数", "Indices", "HKEX", "#f23645"),
    MacroSymbol("^HSCE", "Hang Seng China Enterprises", "国企指数", "Indices", "HKEX", "#f23645"),
    MacroSymbol("^GSPTSE", "S&P/TSX Composite", "标普/多伦多综合", "Indices", "TSX", "#d33"),
    # International
    MacroSymbol("^N225", "Nikkei 225", "日经225", "Indices", "Japan", "#bc002d"),
    MacroSymbol("^KS11", "KOSPI", "韩国综合", "Indices", "South Korea", "#2962ff"),
    MacroSymbol("^TWII", "TAIEX", "台湾加权", "Indices", "Taiwan", "#089981"),
    MacroSymbol("^FTSE", "FTSE 100", "富时100", "Indices", "United Kingdom", "#012169"),
    MacroSymbol("^GDAXI", "DAX", "德国DAX", "Indices", "Germany", "#ffce00"),
    MacroSymbol("^FCHI", "CAC 40", "法国CAC40", "Indices", "France", "#0055a4"),
    MacroSymbol("^STOXX50E", "Euro Stoxx 50", "欧洲斯托克50", "Indices", "Netherlands", "#003399"),
    MacroSymbol("^BSESN", "BSE Sensex", "印度Sensex", "Indices", "India", "#ff9933"),
    MacroSymbol("^AXJO", "ASX 200", "澳洲200", "Indices", "Australia", "#00843d"),
]

# ── Benchmark yields ───────────────────────────────────────────────────────────────────────
# These quote in PERCENT, not price — ^TNX at 4.68 means a 4.68% 10-year yield. Filed under
# Bonds so they never sit next to price indices as if they were comparable numbers.
_RATES: list[MacroSymbol] = [
    MacroSymbol("^IRX", "US 13-Week T-Bill Yield", "美国13周国库券收益率", "Bonds", "US", "#8b93a1"),
    MacroSymbol("^FVX", "US 5-Year Yield", "美国5年期收益率", "Bonds", "US", "#8b93a1"),
    MacroSymbol("^TNX", "US 10-Year Yield", "美国10年期收益率", "Bonds", "US", "#f8b500"),
    MacroSymbol("^TYX", "US 30-Year Yield", "美国30年期收益率", "Bonds", "US", "#8b93a1"),
]

# ── Real yields + breakeven inflation (FRED) ───────────────────────────────────────────────
# The ^ ladder above is the NOMINAL curve. A nominal yield alone cannot say whether a move was
# growth or inflation — that split is the TIPS real yield and the breakeven (nominal − real)
# sitting next to it, and no free quote feed carries either: Yahoo has no DFII10/T10YIE.
# FRED publishes all four daily and KEYLESSLY, so ingest/fetch_fred_daily.py fills them.
#
# Also quoted in PERCENT, so they belong in Bonds beside the ^ ladder, never next to a price.
# DFII10 carries ^TNX's accent because it is the 10-year headline in the real-rate family; the
# rest stay on the ladder grey rather than inventing a colour meaning the UI does not define.
#
# The syms are bare FRED series ids: they match none of yahoo_symbols()' shape filters (no ^
# prefix, no =F/=X suffix), so the Yahoo leg skips them automatically — see fred_symbols().
#
# THE RUNTIME ROUTERS DO NOT INFER THIS. Matching no shape means matching no *live* leg either,
# and both routers' fallthrough is "us" — which quietly bought a Polygon AM.* subscription, an
# extended-hours slot, and a placeholder quote stamped ts:now / DELAYED_15M on a series that
# prints once a day. Each router therefore carries an EXPLICIT daily-only set:
#
#     ADDING A FRED SERIES HERE = add it to DAILY_ONLY in
#         terminal/lib/macroSymbols.ts   (fetchQuotes / fetchIntraday routing)
#         hub/lib/quotes.js              (demand pass + /quotes response)
#
# Miss either one and the new series silently gets a fabricated intraday freshness claim.
_FRED_RATES: list[MacroSymbol] = [
    MacroSymbol("DFII10", "US 10-Year Real Yield (TIPS)", "美国10年期实际收益率", "Bonds", "US", "#f8b500"),
    MacroSymbol("DFII5", "US 5-Year Real Yield (TIPS)", "美国5年期实际收益率", "Bonds", "US", "#8b93a1"),
    MacroSymbol("T10YIE", "US 10-Year Breakeven Inflation", "美国10年期盈亏平衡通胀率", "Bonds", "US", "#8b93a1"),
    MacroSymbol("T5YIE", "US 5-Year Breakeven Inflation", "美国5年期盈亏平衡通胀率", "Bonds", "US", "#8b93a1"),
]

# ── FX ─────────────────────────────────────────────────────────────────────────────────────
# DX-Y.NYB is ICE's dollar-index ticker. mkt "US" keeps the dollar complex with the market a
# US-only user actually has switched on — an FX pair belongs to no single exchange.
_FX: list[MacroSymbol] = [
    MacroSymbol("DX-Y.NYB", "US Dollar Index", "美元指数", "Forex", "US", "#089981"),
    MacroSymbol("EURUSD=X", "Euro / US Dollar", "欧元/美元", "Forex", "US", "#2962ff"),
    MacroSymbol("USDJPY=X", "US Dollar / Yen", "美元/日元", "Forex", "US", "#2962ff"),
    MacroSymbol("GBPUSD=X", "Pound / US Dollar", "英镑/美元", "Forex", "US", "#2962ff"),
    MacroSymbol("USDCHF=X", "US Dollar / Swiss Franc", "美元/瑞郎", "Forex", "US", "#2962ff"),
    MacroSymbol("AUDUSD=X", "Aussie / US Dollar", "澳元/美元", "Forex", "US", "#2962ff"),
    MacroSymbol("USDCAD=X", "US Dollar / Canadian Dollar", "美元/加元", "Forex", "US", "#2962ff"),
    MacroSymbol("USDCNY=X", "US Dollar / Yuan (onshore)", "美元/在岸人民币", "Forex", "US", "#f23645"),
    MacroSymbol("USDCNH=X", "US Dollar / Yuan (offshore)", "美元/离岸人民币", "Forex", "US", "#f23645"),
    MacroSymbol("USDHKD=X", "US Dollar / HK Dollar", "美元/港元", "Forex", "US", "#f23645"),
    MacroSymbol("USDKRW=X", "US Dollar / Won", "美元/韩元", "Forex", "US", "#2962ff"),
    MacroSymbol("USDINR=X", "US Dollar / Rupee", "美元/卢比", "Forex", "US", "#ff9933"),
    MacroSymbol("EURJPY=X", "Euro / Yen", "欧元/日元", "Forex", "US", "#2962ff"),
]

# ── Futures ────────────────────────────────────────────────────────────────────────────────
_FUTURES: list[MacroSymbol] = [
    # Metals
    MacroSymbol("GC=F", "Gold", "黄金", "Futures", "US", "#f8b500"),
    MacroSymbol("SI=F", "Silver", "白银", "Futures", "US", "#c0c0c0"),
    MacroSymbol("HG=F", "Copper", "铜", "Futures", "US", "#b87333"),
    MacroSymbol("PL=F", "Platinum", "铂金", "Futures", "US", "#a8a9ad"),
    MacroSymbol("PA=F", "Palladium", "钯金", "Futures", "US", "#a8a9ad"),
    # Energy
    MacroSymbol("CL=F", "WTI Crude Oil", "WTI原油", "Futures", "US", "#089981"),
    MacroSymbol("BZ=F", "Brent Crude Oil", "布伦特原油", "Futures", "US", "#089981"),
    MacroSymbol("NG=F", "Natural Gas", "天然气", "Futures", "US", "#2962ff"),
    # Agriculture
    MacroSymbol("ZC=F", "Corn", "玉米", "Futures", "US", "#f8b500"),
    MacroSymbol("ZS=F", "Soybeans", "大豆", "Futures", "US", "#089981"),
    MacroSymbol("ZW=F", "Wheat", "小麦", "Futures", "US", "#f8b500"),
    # Equity index futures
    MacroSymbol("ES=F", "S&P 500 E-mini", "标普500迷你", "Futures", "US", "#2962ff"),
    MacroSymbol("NQ=F", "Nasdaq 100 E-mini", "纳指100迷你", "Futures", "US", "#2962ff"),
    MacroSymbol("YM=F", "Dow E-mini", "道指迷你", "Futures", "US", "#2962ff"),
    MacroSymbol("RTY=F", "Russell 2000 E-mini", "罗素2000迷你", "Futures", "US", "#2962ff"),
]

# ── Crypto ─────────────────────────────────────────────────────────────────────────────────
# The universe shipped exactly BTC / ETH / SOL / XRP. Coinbase lists ~400 live USD pairs on the
# leg the Terminal ALREADY uses for crypto, so these are genuinely real-time, not delayed. This
# is a curated majors list rather than all 400: a search for "A" should not return sixty
# micro-cap tokens ahead of Apple.
_CRYPTO: list[MacroSymbol] = [
    MacroSymbol(f"{t}-USD", n, z, "Crypto", "Crypto", c)
    for t, n, z, c in [
        ("DOGE", "Dogecoin", "狗狗币", "#c2a633"),
        ("ADA", "Cardano", "艾达币", "#0033ad"),
        ("AVAX", "Avalanche", "雪崩", "#e84142"),
        ("LINK", "Chainlink", "链环", "#2a5ada"),
        ("DOT", "Polkadot", "波卡", "#e6007a"),
        ("MATIC", "Polygon", "多边形", "#8247e5"),
        ("LTC", "Litecoin", "莱特币", "#a6a9aa"),
        ("BCH", "Bitcoin Cash", "比特币现金", "#8dc351"),
        ("UNI", "Uniswap", "Uniswap", "#ff007a"),
        ("ATOM", "Cosmos", "宇宙", "#2e3148"),
        ("AAVE", "Aave", "Aave", "#b6509e"),
        ("ALGO", "Algorand", "阿尔戈兰德", "#000000"),
        ("FIL", "Filecoin", "文件币", "#0090ff"),
        ("ETC", "Ethereum Classic", "以太经典", "#328332"),
        ("XLM", "Stellar", "恒星币", "#7d00ff"),
        ("SHIB", "Shiba Inu", "柴犬币", "#ffa409"),
        ("NEAR", "NEAR Protocol", "NEAR", "#00c08b"),
        ("APT", "Aptos", "Aptos", "#00d4aa"),
        ("ARB", "Arbitrum", "Arbitrum", "#2d374b"),
        ("OP", "Optimism", "Optimism", "#ff0420"),
    ]
]

CATALOG: list[MacroSymbol] = [*_INDICES, *_RATES, *_FRED_RATES, *_FX, *_FUTURES, *_CRYPTO]


def iter_catalog() -> Iterator[MacroSymbol]:
    return iter(CATALOG)


def yahoo_symbols() -> list[str]:
    """Symbols whose quotes/OHLC come from the Yahoo leg.

    Excludes the mainland-China index codes, which route to Tencent (live), and crypto, which
    routes to the Coinbase-backed Quote Hub (live). Mirrors lib/macroSymbols.ts isMacroSymbol().
    """
    return [
        s.sym for s in CATALOG
        if s.sym == "DX-Y.NYB" or s.sym.startswith("^") or s.sym.endswith("=F") or s.sym.endswith("=X")
    ]


def fred_symbols() -> list[str]:
    """Symbols whose daily series comes from FRED — the source of truth for fetch_fred_daily.py.

    Read off the _FRED_RATES section rather than pattern-matched, because a FRED series id has
    no distinguishing shape: adding a row to the section is the only way onto this leg, and a
    typo can never silently promote some other catalog row into it.
    """
    return [s.sym for s in _FRED_RATES]


def manifest_rows() -> dict[str, dict]:
    """Catalog as manifest rows, ready to merge into public/data/manifest.json."""
    return {
        s.sym: {"name": s.name, "zh": s.zh, "sec": s.sec, "mkt": s.mkt, "col": s.col}
        for s in CATALOG
    }


def duplicates() -> list[str]:
    """Symbols listed more than once — a hand-kept list needs a guard against paste errors."""
    seen: set[str] = set()
    dupes: list[str] = []
    for s in CATALOG:
        if s.sym in seen:
            dupes.append(s.sym)
        seen.add(s.sym)
    return dupes
