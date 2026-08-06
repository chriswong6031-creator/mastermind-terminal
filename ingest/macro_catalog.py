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
    # International — the intraday chart plots each of these on its HOME market's clock.
    # ADDING A ROW HERE = add its timezone to MACRO_TZ in terminal/lib/macroSymbols.ts,
    # or the new index's intraday axis silently comes out in US Eastern time.
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
# The universe shipped exactly BTC / ETH / SOL / XRP, then a hand-written majors list of 20.
# This is the full liquid Coinbase USD book instead — 152 pairs, every one of them BOTH
# live-quotable (Coinbase websocket, the leg hub/lib/coinbase.js already derives from these very
# manifest rows) and chartable (Coinbase daily candles via refresh_crypto_ohlc.py). Genuinely
# real-time, not delayed.
#
# The rows below are GENERATED — run ingest/gen_crypto_catalog.py and paste its output here. That
# file carries the selection rule (top 140 by 30-day median USD volume, union a durable-majors
# floor) and the name/colour maps. Regenerate when Coinbase's book moves; review the diff.
#
# The old worry — "a search for 'A' should not return sixty micro-cap tokens ahead of Apple" —
# is handled by ranking, not by scarcity: scoreSymbol() penalises ticker length, and every pair
# here is 7+ characters ("ARB-USD") against a 2-4 character equity, on top of the home-market
# boost a US user's equities get. tests/test_crypto_catalog.py pins that ordering.
#
# NOT here on purpose: MATIC-USD. Coinbase delisted it (the feed answers a subscribe with
# "MATIC-USD is delisted"), so the row could never price or chart. It is listed in RETIRED below
# so the additive manifest merge actually drops the row it already wrote.
_CRYPTO: list[MacroSymbol] = [
    MacroSymbol(f"{t}-USD", n, z, "Crypto", "Crypto", c)
    for t, n, z, c in [
        # ── generated by ingest/gen_crypto_catalog.py — see that file for the rule ──
        ("BTC", "Bitcoin", "比特币", "#f7931a"),
        ("ETH", "Ethereum", "以太坊", "#627eea"),
        ("SOL", "Solana", "索拉纳", "#14f195"),
        ("XRP", "XRP", "瑞波币", "#23292f"),
        ("ZEC", "Zcash", "大零币", "#ecb244"),
        ("HYPE", "Hyperliquid", "Hyperliquid", "#ff6d00"),
        ("USDT", "Tether", "泰达币", "#26a17b"),
        ("XLM", "Stellar", "恒星币", "#7d00ff"),
        ("ADA", "Cardano", "艾达币", "#0033ad"),
        ("DOGE", "Dogecoin", "狗狗币", "#c2a633"),
        ("NEAR", "NEAR Protocol", "NEAR Protocol", "#00c08b"),
        ("SUI", "Sui", "Sui", "#4da2ff"),
        ("LTC", "Litecoin", "莱特币", "#a6a9aa"),
        ("VVV", "Venice Token", "Venice Token", "#f23645"),
        ("LINK", "Chainlink", "链环", "#2a5ada"),
        ("ONDO", "Ondo Finance", "Ondo Finance", "#2962ff"),
        ("TAO", "Bittensor", "Bittensor", "#ff9900"),
        ("AAVE", "Aave", "Aave", "#b6509e"),
        ("AERO", "Aerodrome Finance", "Aerodrome Finance", "#7e57c2"),
        ("HBAR", "Hedera", "Hedera", "#000000"),
        ("LIGHTER", "Lighter", "Lighter", "#7e57c2"),
        ("UNI", "Uniswap", "Uniswap", "#ff007a"),
        ("WLD", "Worldcoin", "世界币", "#7e57c2"),
        ("PUMP", "Pump.fun", "Pump.fun", "#f23645"),
        ("BCH", "Bitcoin Cash", "比特币现金", "#8dc351"),
        ("MON", "Monad", "Monad", "#f23645"),
        ("AVAX", "Avalanche", "雪崩", "#e84142"),
        ("ICP", "Internet Computer", "互联网计算机", "#3b00b9"),
        ("RE", "Re Protocol", "Re Protocol", "#7e57c2"),
        ("BILL", "Billions Network", "Billions Network", "#f8b500"),
        ("BONK", "Bonk", "Bonk", "#f4a52c"),
        ("INJ", "Injective Protocol", "Injective Protocol", "#089981"),
        ("JTO", "Jito", "Jito", "#00bcd4"),
        ("FARTCOIN", "Fartcoin", "屁币", "#ff6d00"),
        ("PENGU", "Pudgy Penguins", "Pudgy Penguins", "#7e57c2"),
        ("ALLO", "Allora", "Allora", "#2962ff"),
        ("FET", "Fetch.ai", "Fetch.ai", "#7e57c2"),
        ("USELESS", "Useless Coin", "Useless Coin", "#9c27b0"),
        ("BNB", "BNB", "币安币", "#f3ba2f"),
        ("DOT", "Polkadot", "波卡", "#e6007a"),
        ("PEPE", "Pepe", "佩佩蛙", "#4a9c2d"),
        ("PAXG", "PAX Gold", "PAX Gold", "#2962ff"),
        ("RAVE", "Ravedao", "Ravedao", "#ff6d00"),
        ("GWEI", "EthGas", "EthGas", "#9c27b0"),
        ("TIA", "Celestia", "Celestia", "#ff6d00"),
        ("BASED1", "Based One", "Based One", "#2962ff"),
        ("MORPHO", "Morpho", "Morpho", "#00bcd4"),
        ("ENA", "Ethena", "Ethena", "#9c27b0"),
        ("SEI", "Sei", "Sei", "#089981"),
        ("CRV", "Curve DAO Token", "曲线", "#f8b500"),
        ("CBETH", "Coinbase Wrapped Staked ETH", "Coinbase Wrapped Staked ETH", "#ff6d00"),
        ("CAP", "Cap", "Cap", "#9c27b0"),
        ("SYRUP", "Maple Finance", "Maple Finance", "#f8b500"),
        ("XPL", "Plasma", "Plasma", "#9c27b0"),
        ("KAITO", "Kaito", "Kaito", "#2962ff"),
        ("WLFI", "World Liberty Financial", "World Liberty Financial", "#f23645"),
        ("MEGA", "MegaETH", "MegaETH", "#f23645"),
        ("IP", "Story Protocol", "Story Protocol", "#089981"),
        ("TON", "Toncoin", "Toncoin", "#0098ea"),
        ("RENDER", "Render Network", "渲染网络", "#2962ff"),
        ("ALGO", "Algorand", "阿尔戈兰德", "#000000"),
        ("SPX", "SPX6900", "SPX6900", "#f8b500"),
        ("BNKR", "BankrCoin", "BankrCoin", "#00bcd4"),
        ("APT", "Aptos", "Aptos", "#00d4aa"),
        ("ATOM", "Cosmos", "宇宙", "#2e3148"),
        ("FIL", "Filecoin", "文件币", "#0090ff"),
        ("DASH", "Dash", "达世币", "#008ce7"),
        ("PYTH", "Pyth Network", "Pyth Network", "#00bcd4"),
        ("QNT", "Quant", "Quant", "#f8b500"),
        ("PENDLE", "Pendle", "Pendle", "#2962ff"),
        ("PLUME", "Plume", "Plume", "#f8b500"),
        ("AKT", "Akash", "Akash", "#2962ff"),
        ("KITE", "Kite", "Kite", "#00bcd4"),
        ("LSETH", "Liquid Staked ETH", "Liquid Staked ETH", "#2962ff"),
        ("ARX", "Arcium", "Arcium", "#f8b500"),
        ("ARB", "Arbitrum", "Arbitrum", "#2d374b"),
        ("JASMY", "JasmyCoin", "茉莉币", "#9c27b0"),
        ("CRO", "Cronos", "Cronos", "#1199fa"),
        ("TROLL", "Troll", "Troll", "#00bcd4"),
        ("MET", "Meteora", "Meteora", "#ff6d00"),
        ("TRIA", "Tria", "Tria", "#2962ff"),
        ("VIRTUAL", "Virtuals Protocol", "Virtuals Protocol", "#7e57c2"),
        ("CHIP", "USD.ai", "USD.ai", "#9c27b0"),
        ("FLR", "Flare", "Flare", "#9c27b0"),
        ("POL", "Polygon Ecosystem Token", "多边形", "#8247e5"),
        ("MANTLE", "Mantle", "Mantle", "#089981"),
        ("SHIB", "Shiba Inu", "柴犬币", "#ffa409"),
        ("XCN", "Onyxcoin", "Onyxcoin", "#089981"),
        ("SKY", "Sky", "Sky", "#7e57c2"),
        ("TRAC", "OriginTrail", "OriginTrail", "#f23645"),
        ("ZRO", "LayerZero", "LayerZero", "#f8b500"),
        ("TRUMP", "Official Trump", "特朗普币", "#2962ff"),
        ("EIGEN", "Eigenlayer", "Eigenlayer", "#2962ff"),
        ("O", "O1 Exchange", "O1 Exchange", "#7e57c2"),
        ("WIF", "dogwifhat", "狗帽子", "#ff6d00"),
        ("GROVE", "Grove", "Grove", "#f8b500"),
        ("JUPITER", "Jupiter", "Jupiter", "#f8b500"),
        ("STX", "Stacks", "Stacks", "#7e57c2"),
        ("ETC", "Ethereum Classic", "以太经典", "#328332"),
        ("LDO", "Lido DAO", "Lido DAO", "#7e57c2"),
        ("TOSHI", "Toshi", "Toshi", "#7e57c2"),
        ("ZORA", "Zora", "Zora", "#9c27b0"),
        ("USD1", "World Liberty Financial USD", "World Liberty Financial USD", "#00bcd4"),
        ("OPG", "Opengradient", "Opengradient", "#ff6d00"),
        ("KTA", "Keeta", "Keeta", "#2962ff"),
        ("SKR", "Seeker", "Seeker", "#2962ff"),
        ("STRK", "Starknet", "Starknet", "#9c27b0"),
        ("HOME", "HOME", "HOME", "#089981"),
        ("AERGO", "Aergo", "Aergo", "#ff6d00"),
        ("AVNT", "Avantis", "Avantis", "#089981"),
        ("ETHFI", "ether.fi", "ether.fi", "#2962ff"),
        ("CFG", "Centrifuge", "Centrifuge", "#2962ff"),
        ("ATH", "Aethir", "Aethir", "#00bcd4"),
        ("SPK", "Spark", "Spark", "#ff6d00"),
        ("XAN", "Anoma", "Anoma", "#7e57c2"),
        ("CTR", "Citrea", "Citrea", "#089981"),
        ("ORCA", "Orca", "Orca", "#00bcd4"),
        ("BIRB", "Moonbirds", "Moonbirds", "#7e57c2"),
        ("AI", "Gensyn", "Gensyn", "#f23645"),
        ("OXT", "Orchid", "Orchid", "#f8b500"),
        ("CLANKER", "Tokenbot", "Tokenbot", "#2962ff"),
        ("MOODENG", "Moo Deng", "Moo Deng", "#089981"),
        ("OP", "Optimism", "Optimism", "#ff0420"),
        ("DRV", "Derive", "Derive", "#9c27b0"),
        ("IMX", "ImmutableX", "ImmutableX", "#ff6d00"),
        ("VET", "VeChain", "唯链", "#15bdff"),
        ("SQD", "Subsquid", "Subsquid", "#2962ff"),
        ("XTZ", "Tezos", "特佐斯", "#2c7df7"),
        ("SAFE", "Safe", "Safe", "#7e57c2"),
        ("RECALL", "Recall Network", "Recall Network", "#f8b500"),
        ("APR", "aPriori", "aPriori", "#f8b500"),
        ("DEGEN", "Degen", "Degen", "#f8b500"),
        ("WET", "Humidifi", "Humidifi", "#2962ff"),
        ("BIO", "Bio Protocol", "Bio Protocol", "#f23645"),
        ("HIGH", "Highstreet", "Highstreet", "#2962ff"),
        ("PROS", "Pharos", "Pharos", "#9c27b0"),
        ("EDGE", "Definitive", "Definitive", "#00bcd4"),
        ("ZAMA", "Zama", "Zama", "#089981"),
        ("HNT", "Helium", "Helium", "#f23645"),
        ("ICNT", "Impossible Cloud Network", "Impossible Cloud Network", "#ff6d00"),
        ("ZK", "zkSync", "zkSync", "#00bcd4"),
        ("COMP", "Compound", "Compound", "#7e57c2"),
        ("GRT", "The Graph", "The Graph", "#00bcd4"),
        ("SNX", "Synthetix", "Synthetix", "#089981"),
        ("ENS", "Ethereum Name Service", "Ethereum Name Service", "#ff6d00"),
        ("MANA", "Decentraland", "Decentraland", "#00bcd4"),
        ("SUSHI", "SushiSwap", "寿司", "#9c27b0"),
        ("CHZ", "Chiliz", "粉丝币", "#00bcd4"),
        ("SAND", "The Sandbox", "沙盒", "#ff6d00"),
        ("KSM", "Kusama", "Kusama", "#f8b500"),
        ("BAL", "Balancer", "Balancer", "#7e57c2"),
        ("1INCH", "1Inch", "1Inch", "#f8b500"),
    ]
]

CATALOG: list[MacroSymbol] = [*_INDICES, *_RATES, *_FRED_RATES, *_FX, *_FUTURES, *_CRYPTO]

# Rows this catalog wrote in the past and now RETIRES. Merging is additive by design (see
# build_macro_symbols.py — a careless rewrite here is how the 2026-07-11 "8,740 -> 34" incident
# happened), which means dropping a row from the list above does not remove it from the live
# manifest: it lingers forever as a searchable dead end that can never price or chart. Naming it
# here is the explicit, auditable way to actually delete one. Exact symbols only — never a
# pattern, never derived from an absence — so this can only ever remove what a human typed.
RETIRED: list[str] = [
    # Coinbase delisted MATIC in favour of POL (the Polygon token migration). The websocket
    # answers a subscribe with "MATIC-USD is delisted", so the row has had no quote since it was
    # added, and Coinbase serves no candles for it either. POL-USD is in the catalog above.
    "MATIC-USD",
]


def iter_catalog() -> Iterator[MacroSymbol]:
    return iter(CATALOG)


def retired_symbols() -> list[str]:
    """Symbols to DELETE from the manifest — see RETIRED. Never overlaps the live catalog."""
    live = {s.sym for s in CATALOG}
    return [s for s in RETIRED if s not in live]


def yahoo_symbols() -> list[str]:
    """Symbols whose quotes/OHLC come from the Yahoo leg.

    Excludes the mainland-China index codes, which route to Tencent (live), and crypto, which
    routes to the Coinbase-backed Quote Hub (live). Mirrors lib/macroSymbols.ts isMacroSymbol().
    """
    return [
        s.sym for s in CATALOG
        if s.sym == "DX-Y.NYB" or s.sym.startswith("^") or s.sym.endswith("=F") or s.sym.endswith("=X")
    ]


def ohlc_symbols() -> list[str]:
    """Symbols whose DAILY HISTORY comes from the Yahoo chart endpoint.

    A superset of yahoo_symbols(): the mainland-China indices take their live QUOTES from Tencent,
    but Tencent serves no daily history and nothing else wrote them a `/data/<sym>.json`, so they
    shipped searchable-but-unchartable — a live price in the rail above a dead-ended chart. Yahoo
    carries the same codes, so history comes from there while the quote leg stays exactly as it is.

    Read off the _INDICES section by market group rather than pattern-matched, for the same reason
    fred_symbols() is: a China index code (000001.SS) has no shape that separates it from an A-share
    ticker (000001.SZ), and only this section can put a symbol on the leg. A new CN index row picks
    up history automatically.

    Yahoo's coverage of these five is uneven — as of 2026-08-05 it returns full 5y history for
    000001.SS / 000300.SS / 399001.SZ and a single bar for 000905.SS / 399006.SZ. The fetcher's
    depth guard drops the thin ones rather than writing a one-bar "chart"; they stay quote-only
    until Yahoo backfills, and the Terminal's empty state says so plainly.
    """
    cn = [s.sym for s in _INDICES if s.mkt in ("SSE", "SZSE")]
    return yahoo_symbols() + cn


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
