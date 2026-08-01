# MenthorQ — Engineering Teardown (2026-08-01)

**Purpose:** capability-replication audit of MenthorQ (menthorq.com / dashboard.menthorq.io) for the
Mastermind Terminal dealer-positioning / gamma-structure suite. Everything below is paraphrased from
public sources; no vendor text or assets are to be copied into product.

**Evidence discipline:** every claim is tagged `[DOC]` (stated on a public MenthorQ page or a named
secondary source) or `[INF]` (our inference — plausible reconstruction, not vendor-confirmed).
Where the vendor deliberately hides a formula, that is stated explicitly.

**Primary sources crawled:** menthorq.com homepage, /pricing/, /features/, /integrations/,
/quantitative-models/ (26 model pages), Finance Wiki guides (key-gamma-levels,
key-levels-and-key-terms, free-daily-report-explained, call-resistance, high-vol-level,
0dte-gamma-levels, trade-net-gex-levels, 1d-expected-move-indicator, blind-spots-levels,
gamma-levels-on-es, ctas-funds-model, the-menthor-q-score, swing-trading-model,
discord-ai-bot-commands, tradingview, tradingview-scanner, levels-conversion,
menthorq-asset-coverage, quin-ai-screeners-documentation-and-prompts,
how-to-use-the-option-matrix-2), academy course indexes, plus secondary sources
(optionstradingiq.com review, thetaprofits.com MenthorQ 3.0 review, TrendSpider/Quantower blogs,
barchart PR, Trustpilot, @MenthorQpro on X).

---

## 1. Company snapshot & marketing claims

- Positioning: "Institutional Quant Data. For Active Traders." `[DOC]`
- Claims: 64+ quant models, 1,000+ assets on the homepage; 1,400+ assets in the coverage guide;
  7,000+ active/premium traders; 500+ hours of academy content; 350+ lessons; 350+ guides. `[DOC]`
- Press logos: Bloomberg, Benzinga, TradingView, BusinessInsider, NinjaTrader, MarketWatch,
  Investing.com. `[DOC]`
- HQ: 701 Brickell Key Blvd, Miami, FL. `[DOC]`
- Trustpilot: ~63 reviews, overwhelmingly positive; praise for level accuracy, education, support,
  fast refunds. No systematic negative theme found beyond TradingView indicator load time. `[DOC]`
- "MenthorQ 3.0" (2026) is their current-generation web app: real-time futures gamma, embedded
  TradingView charting, a gamma-level backtester, and the QUIN AI assistant. `[DOC: thetaprofits,
  barchart PR, YouTube "MenthorQ 3.0 Live Demo"]`

## 2. Pricing & packaging

| Tier | Price | Intro offer | Contents |
|---|---|---|---|
| Free | $0, no card | — | Delayed-data snapshot of full dashboard; free Discord channels (SPX/QQQ/VIX data); free daily 6:30 AM ET email report; some academy content `[DOC]` |
| Premium | **$129/mo** | **$39 first month** (code FIRST39, "save 70%") | 20+ models, 10+ integrations, 350+ lessons, community, 350+ guides, webinars `[DOC]` |
| Pro | **$349/mo** | $174.50 first month (code FIRST50) | Premium + 24h/wk pro-trader access, weekly mentorship, 9 live sessions/wk, monthly strategy session, recordings `[DOC]` |

- 7-day money-back guarantee; one-click cancel. Stripe checkout. `[DOC]`
- Affiliate discount code "MQ20" circulates via review sites (lucaspropfirm.fr). `[DOC existence; INF: ~20% off]`
- Historical pricing (optionstradingiq review, older): $69/mo or $588/yr Premium; $399 one-time
  options academy. Shows aggressive price escalation as the product matured. `[DOC, dated]`
- Packaging insight: Pro is a **human-services upsell** (mentorship/live rooms), not a data upsell.
  All data/models are in Premium. `[DOC]`

## 3. Model census

26 first-class model pages under /quantitative-model/ `[DOC]`:

| # | Model | One-line function |
|---|---|---|
| 1 | Net Gamma Exposure | Strike-level net GEX map; source of Call Resistance / Put Support |
| 2 | Q-Score | 4-factor composite score (momentum/seasonality/volatility/options) |
| 3 | Gamma Levels (Stocks) | Key levels on stocks/ETFs/indices |
| 4 | Gamma Levels (Futures) | Same, built from native CME-complex futures options |
| 5 | Blind Spot Levels | Cross-asset "hidden" reaction zones (BL1–BL10) |
| 6 | Volatility Risk Premium | IV vs HV rich/cheap gauge + cross-asset tracker |
| 7 | Volatility Smile | IV across strikes, single expiry |
| 8 | Swing Trading Model | ML 5-day & 20-day price bands + Risk Trigger |
| 9 | Skew | 25-delta risk-reversal skew (0DTE/next-exp/1M/3M) |
| 10 | Volume & Open Interest | Per-strike volume/OI with P/C heatmaps |
| 11 | Intraday Gamma Models | Intraday GEX/OI change, liquidity summary, gamma flips |
| 12 | Crypto Quant Models | Momentum/regime filters for crypto |
| 13 | Crypto Gamma Models | Dealer positioning from Deribit+Binance+OKX chains |
| 14 | Key Levels on Forex | Gamma levels + blind spots for FX (via FX futures options) |
| 15 | 3D Volatility Surface | IV across strike × expiry, 3D/2D views |
| 16 | Momentum Models | Breadth, trend bias, supertrend, RSI/BB, MA, MACD |
| 17 | Net Delta Exposure | Strike-level DEX; dealer directional positioning |
| 18 | 1D Expected Move | Proprietary next-day min/max band |
| 19 | Options Screeners | Factor/momentum screeners, stock baskets |
| 20 | Long Short Volatility | Vol-ETP positioning barometer (LSVB) |
| 21 | Volatility Control Fund Model | Vol-control fund equity-exposure estimate |
| 22 | CTAs Model | CTA positioning % of max risk, percentiles, z-scores |
| 23 | Term Structure | ATM IV curve + historical comparisons |
| 24 | IV per Open Interest | "Sticky strike" detection: IV × OI concentration |
| 25 | 0DTE Levels | Same-day-expiry gamma levels + matrix + skew |
| 26 | Option Matrix | Per-expiry GEX/DEX/OI/level/EM table, "morning feed" |

Homepage claims "64+ models" — the delta between 26 pages and 64+ is sub-model counting
(per-asset-class variants, each Discord command counted as a model). `[INF]`

## 4. Level taxonomy — the core product

This is the heart of what to replicate. All definitions below are from their glossary
(guide/key-levels-and-key-terms) and per-level guides. `[DOC]` unless tagged.

### 4.1 Primary levels (per ticker, per day)

- **Call Resistance** — the strike with the highest net *call* gamma exposure; widest green bar on
  the Net GEX chart. Rendered as a green dotted line. Behavioral spec: dealers long call gamma sell
  into strength approaching it → stall/reject; if call positioning rolls higher, the level flips to
  support ("structural ceiling" → floor on breakout, retest confirms). `[DOC]`
- **Put Support** — the strike with the most net *put* gamma; red dotted line. Dealers buy futures
  hedging downside as price approaches → selloffs decelerate/stabilize. `[DOC]`
- **HVL (High Vol Level)** — the gamma-flip transition level: above = positive-gamma regime
  (vol-suppressed, mean-reverting, "fade" environment), below = negative-gamma regime
  (vol-amplified, momentum/breakout environment). Vendor describes it as the inflection point in
  the slope of the gamma-exposure curve. `[DOC]` Computation: zero-crossing of the net cumulative
  GEX-vs-spot profile (classic gamma-flip). `[INF]`
- **1D Exp Move Min / Max** — proprietary next-day band; "uses historical implied volatility" to
  project a min and max move off prior close, also expressed as 1D Exp Move %. Formula not
  disclosed. `[DOC that it's IV-derived; formula hidden]` Published backtest (SPX, multi-year):
  close above the Min band 87.62% of days; close below the Max band 85.02%; iron condor with
  strikes on the bands won 72.63%. `[DOC]`
- **GEX Levels 0–10** — secondary levels: the strikes with the highest net GEX *and* DEX magnitude
  **within the 1D expected-move range**, ranked. Delivered in two groups (GEX 1–5, GEX 6–10) in
  alerting UIs. Act as intraday "sticky levels" once price leaves the primaries. `[DOC]`

### 4.2 0DTE family (second parallel level set)

Same taxonomy recomputed on same-day-expiry chains only: **Call Resistance 0DTE, Put Support 0DTE,
HVL 0DTE, Gamma Wall 0DTE**. `[DOC — all four appear as alertable level types in the TradingView
scanner settings]` Gamma Wall 0DTE = the dominant 0DTE gamma-concentration strike (magnet/pin
candidate intraday). `[INF — name documented, definition inferred from their gamma-wall guide
language: call wall caps, put wall holds]`

### 4.3 Blind Spots (BL1–BL10)

- Mechanism (documented at concept level): three inputs — options positioning (net buy/sell
  pressure), momentum divergence, and cross-asset correlation. Levels from multiple correlated
  instruments are projected onto the target and **overlap clusters** become zones; ranked BL1
  (densest cluster) → BL10. Explicitly framed as "what price-only traders can't see": liquidity
  voids and hedging-pressure zones sitting between the obvious gamma strikes. `[DOC]`
- Example correlation sets: ES ↔ SPY/QQQ/MAG7/gold/VIX/CL/BTC; NQ ↔ AAPL/MSFT/NVDA; FX ↔
  commodities/rates. `[DOC]`
- The projection math is not disclosed; their separate **Levels Conversion** tool (§7.2) shows the
  house method for cross-instrument mapping: spread (futures − index) or ratio (futures ÷ index),
  auto-ratio from prior-day closes. Blind Spots almost certainly reuse this conversion plus a
  clustering pass with a distance tolerance. `[INF]`

### 4.4 Swing model levels

- **Upper Band (red)** / **Lower Band (green)** at 5-day and 20-day horizons — ML forecast of the
  extreme price reachable in the window; **Risk Trigger** — a third level flagging heightened-risk
  inflection. `[DOC]`
- One directional bias per day: model publishes *either* a Lower Band (bullish read; expected to
  hold as floor) *or* an Upper Band (bearish read; ceiling), never both. Success criterion is
  close-beyond-band at horizon end. Inputs named: momentum, options flow, market positioning,
  gamma, delta. Refreshed daily. Monthly public backtest posts. `[DOC]`
- **Swing Bias** and 5/20-day band values are queryable metrics in QUIN screeners. `[DOC]`

### 4.5 Q-Score

Composite of four sub-scores `[DOC]`:
- Momentum 0–5 (0 bearish, 3 neutral, 5 bullish) — price action + technical indicators.
- Seasonality −5..+5 — 20 years of history, scoring the *next 5 days'* seasonal tendency.
- Volatility 0–5 — realized-vol magnitude regime.
- Options 0–5 — options-market activity/sentiment ranking.
Positioned as "institutional factor investing for retail." Used in screeners, scanner overlays,
and as confluence with levels. Exact factor weights/indicators undisclosed. `[DOC/hidden]`

### 4.6 Naming note ("Q-Lines", "Master Ranges", "SMT", "Trend model")

- Their brand term is **Q-Levels** (the delivered level set / indicator name on
  NinjaTrader/Sierra); "Q-Lines" does not appear as an official product name. `[DOC]`
- **"Master Ranges" and "SMT": no MenthorQ usage found anywhere** (site search + web search).
  These appear to be other vendors' vocabulary (task brief error or a competitor's term —
  MenthorQ's range construct is the 1D Expected Move band and per-expiry Expected Move). `[DOC-absence;
  bounded by site-restricted web searches for those exact terms]`
- No standalone "Trend Model" page exists; trend lives inside Momentum Models
  (`/trend_bias`, `/super_trend`, `/market_breadth`, `/rsi_bollinger`, `/ma_indicator`,
  `/macd_indicator` Discord commands) and the Q-Score momentum factor. `[DOC]`
- "Standard deviation levels" as a product = not present; SD appears only as education
  (Bollinger/VaR guides) and implicitly inside the 1D EM band. `[DOC-absence]`
- **Delta Risk Reversal** is a *metric*, not a plotted level: 25Δ RR = IV(25Δ put) − IV(25Δ call)
  tracked for next expiry, 0DTE, 1M, 3M. (Sign convention flips between their pages; the glossary
  defines put-minus-call.) `[DOC; inconsistency noted]`

## 5. Analytics beyond levels — definitions worth cloning verbatim-in-spirit

From the glossary + daily-report guide `[DOC]`:

- **Net GEX** = call gamma − put gamma per strike; positive ⇒ vol-dampening. **Total GEX** = gross.
- **Net DEX** — glossary states "put delta minus call delta" (nonstandard sign; their charts frame
  positive DEX = dealers net long → sell to re-hedge = overhead supply). `[DOC; sign quirk worth
  testing before cloning]`
- **Gamma Condition** — boolean/regime tag per ticker: positive vs negative gamma. Appears in every
  snapshot table.
- **Vol Regime IV/HV** — regime tag: IV>HV vs IV<HV.
- **Distance to HVL %** — spot's % distance from HVL (screener-able).
- **Gamma Expirations** — notional gamma expiring per date (OPEX decay analysis).
- **Put/Call ratios** on four bases: OI, volume, GEX, DEX.
- **Top-10 ±GEX/DEX strikes** tables (the "sticky level" feed).
- **Vanna & Charm** are defined in the glossary and a cumulative **vanna profile** is drawn on the
  Net GEX chart (gamma yellow / delta blue / vanna purple cumulative curves). No standalone
  vanna/charm level products. `[DOC]`
- **Option Matrix** — per-expiration rows for ~1 month forward: DTE, GEX, DEX, OI, each also
  normalized by monthly totals, 1-day changes, per-expiry Call Res/Put Sup/HVL, and per-expiry
  expected move. Color-coded GEX (deep red = short-gamma instability). Doubles as OPEX map. `[DOC]`
- **Term Structure** — ATM IV per expiry (puts & calls), overlaid vs yesterday/last week/last
  month. `[DOC]`
- **VRP model** — IV vs HV spread plus **Normalized VRP** and 1Y/3M percentiles; cross-asset
  scatter of IV percentile vs HV percentile (3M lookback) to tag vol as rich/cheap/fair. `[DOC]`
- **IV per OI** — "sticky strikes": strikes where high IV coincides with high OI ⇒ concentrated
  long-call/long-put positioning. `[DOC]`
- **CTA model** — CTA position as % of deployable risk per asset (SPX, NDX, WTI, Brent, gold,
  natgas, 2Y/10Y, copper, silver, FX); columns: now / yesterday / 1M-ago, percentile (0–1), 3M
  z-score (|z|>2 = extreme); price-overlay charts with current-position dot. Daily. `[DOC]`
- **Vol Control Fund model** — fund equity-exposure estimate driven by 1M realized vs 3M vol
  comparison; systematic-flow chart. `[DOC]`
- **LSVB (Long/Short Volatility Barometer)** — dollar volume + OI + greeks across long-vol vs
  short-vol ETPs → sentiment barometer; divergence vs SPX is the trade signal. `[DOC]`
- **Historical GEX/DEX** (`/histgex`, SPX only) — time series of aggregate GEX & DEX with SMAs
  under spot. `[DOC]`
- **Crypto suite** — chains from Deribit + Binance + OKX ("95%+ of crypto options market");
  full model stack (GEX, levels, DEX, skew, smile, term, matrix, surface, swing, Q-Score) on
  BTC/ETH/SOL/XRP/BNB across USDT/USD/USDC quote pairs. `[DOC]`
- **Futures suite** — native options chains from CME, NYMEX, CBOT, COMEX. Coverage: ES NQ RTY, CL
  NG RBOB, GC SI PL HG, ZN ZT ZB ZF, 6A 6B 6C 6E 6J 6S, MBT, and 13 ag/soft tickers. `[DOC]`
- **FX suite** — gamma levels + blind spots for AUD CHF GBP EUR JPY CAD XAU, computed from FX
  futures options. `[DOC]`

## 6. Data pipeline & cadence (as published)

| Surface | Cadence | Source |
|---|---|---|
| Daily email report | 6:30 AM ET Mon–Fri | free-daily-report guide `[DOC]` |
| Stocks/ETFs/indices EOD levels | 6:00 PM ET | asset-coverage guide `[DOC]` |
| First morning snapshot (stocks) | 8:00 AM ET | asset-coverage guide `[DOC]` |
| Stocks intraday levels | every 5 min, 9:35 AM–4:00 PM ET | asset-coverage guide `[DOC]` |
| Futures EOD levels | 11:00 PM ET | asset-coverage guide `[DOC]` |
| Futures intraday levels | every 5 min, 10:30 PM–5:00 PM next day | asset-coverage guide `[DOC]` |
| TradingView EOD indicator push | 2×/day: 6:30 PM & 11:00 PM ET | tradingview guide `[DOC]` |
| TradingView intraday indicator | "14+ updates/day" (marketing) vs 5-min (coverage guide) — the TV push is coarser than the dashboard feed | `[DOC both; INF reconciliation]` |
| Discord bot charts | on-demand, most commands keep 5-day history | bot guide `[DOC]` |
| Q-Score / screeners / matrix / CTA / vol models | daily refresh | multiple guides `[DOC]` |
| Dashboard 3.0 futures gamma | "real-time," every 5 min | thetaprofits `[DOC]` |

Ticker universe is tiered (Tier 1/2/3 pre-calculated in indicators; full list in a coverage doc);
1,400+ assets total. Everything outside tiers requires the Custom Levels manual-upload indicator.
`[DOC]`

## 7. Delivery channels

### 7.1 Dashboard (dashboard.menthorq.io — "MenthorQ 3.0")

Auth-gated SPA (bare fetch → sign-in redirect). Structure assembled from vendor demo + reviews
`[DOC: thetaprofits, QUIN guides, YouTube demo listing]`:
- Per-ticker workspace: embedded **TradingView charts** with proprietary overlays (gamma levels,
  Q-Score, vol indicators, market structure) auto-updating through the session.
- **Gamma-level backtester** — for a level under current-like conditions shows: historical success
  rate, probability of holding, average move when the level breaks, worst historical outcome. This
  is their newest differentiator.
- **QUIN chat** (dashboard.menthorq.io/en/chats): left-rail chat threads; "Inspire me" prompt
  library grouped by use case (learning, futures, swing, options, 0DTE/SPX, general research).
- **Screeners** section: create/save/re-run screens; refreshed daily.
- Free accounts see the full app with delayed data.
- Distribution also as a WebCatalog-wrapped desktop app (Mac/Windows). `[DOC]`
- Workflow pitch: overnight futures positioning → live levels → chart → backtest → AI trade ideas,
  replacing tool-switching. `[DOC]`

### 7.2 TradingView (invite-only suite, 7 indicators + public conversion script)

`[DOC: tradingview guide]`
1. **MenthorQ Levels | End of Day** — all asset classes; 2×/day push.
2. **MenthorQ Levels | Intraday** — stocks/ETFs/indices; multiple daily pushes.
3. **Blind Spots Levels** — futures/ETFs/indices.
4. **Custom Levels** — paste-your-own (historical or uncovered tickers; fed by Discord
   `/levels_tw` text output).
5. **Swing Trading Levels**.
6. **Momentum Indicator** — 3-in-1: algorithmic S/R, dynamic Fibonacci, volume profile.
7. **TradingView Scanner** — 40-ticker watchlist (20 preloaded: ES1! NQ1! RTY1! SPX NDX VIX SPY
   QQQ DIA IWM CL GC BTCUSD NVDA TSLA AAPL AMZN GOOG META MSFT + 20 custom); shows price, IV,
   gamma condition, all four Q-Scores; alert types = breakout/breakdown per level; level types =
   Call Res, Put Sup, HVL, 1D Min/Max, 0DTE variants (incl. **Gamma Wall 0DTE**), GEX 1–5, GEX 6–10.
   Pain point: alerts must be re-created daily after level refresh. `[DOC]`
- Indicator UX: **Q-Levels table** (level name / value / live distance-to-spot), dark/light,
  label offset to 500 bars, per-group and per-level color overrides, **Trading Roadmap** mode that
  converts levels into S/R zone boxes (box-ratio 2–4 recommended for SPX/QQQ/ES/NQ), and
  **Levels Conversion** (spread = futures−index; ratio = futures÷index; auto-ratio from prior
  close vs manual intraday ratio). `[DOC]`
- No TradingView API ⇒ levels ship as indicator-code updates; users must re-add or click update.
  Known complaint: slow load with full level set. `[DOC]`

### 7.3 Discord bot (complete command census)

`[DOC: guide/discord-ai-bot-commands]`
- Core per-ticker: `/mainchart`, `/key_levels`, `/liq_snapshot`, `/netgex` (5-day history nav),
  `/matrix`, `/netgex_multiexpiry` (0DTE vs weekly vs monthly).
- Secondary: `/posgex`, `/neggex` (top-10 strike tables), `/voloi`, `/voloi_0dte`, `/voloi_1dte`,
  `/ivoi`, `/term`, `/bidask`, `/skew` (SPX only), `/histgex` (SPX only).
- TradingView feed: `/levels_tw`, `/tw_list` (≤5 tickers), `/tw_toptk` (SPX/QQQ/VIX/IWM/TLT).
- CTA channel: `/cta_table`, `/cta_index`, `/cta_currency`, `/cta_commodity`, plus 10 per-asset
  commands (`/cta_spx` … `/cta_silver`).
- Vol/momentum: `/vol_control`, `/vol_barometer`, `/market_breadth`, `/trend_bias`, `/super_trend`,
  `/rsi_bollinger`, `/ma_indicator`, `/macd_indicator`.
- `/help`, keyword autocomplete. Premium gates most; free channels carry SPX/QQQ/VIX data.

### 7.4 Other platform integrations (11)

NinjaTrader (full "Q-Levels Indicator" integration), Sierra Chart, ATAS (marketplace product
"MenthorQ Market Data Services"), Quantower, Bookmap, TrendSpider (Gamma + Blind Spots +
Conversion), MotiveWave, EdgeClear, Tickblaze, MetaTrader (MT5), ThinkorSwim (per 3.0 PR). All
Premium-gated. Integrations authenticate with a **per-user API key from the account dashboard** —
i.e., a levels-delivery API exists but is partner/pull-oriented, with no public developer docs.
`[DOC; INF: simple keyed REST returning level sets per ticker]`

### 7.5 QUIN AI

- Conversational quant engine; marketing insists "not a ChatGPT wrapper." NL → structured queries
  over their metrics store; returns ranked tables with outlier/sector annotations. `[DOC]`
- **97+ metrics per ticker** documented for screening: identifiers (ticker/tier/type/sector),
  OHLC/mcap/52wk, IV30, IV rank, IV percentile (1Y & 3M), HV30, 1D EM; call/put volume & OI &
  ratios; net/total GEX & DEX + ratios; expiring GEX/DEX (today/1wk/2wk/1M); 50Δ IV at 0DTE/1M/3M;
  skew 0DTE/1M/3M; VRP + normalized (std & 3M); term-structure slope (contango/backwardation);
  1Y & 3M percentiles for DEX/GEX/IV/OI/VRP/skew; 4 Q-Scores; levels (Call Res, Put Sup, HVL,
  0DTE variants, Swing Bias, 5/20-day bands, Risk Triggers). `[DOC]`
- Query classes: rankings, comparisons, historical series ("VRP of NVDA last 10 days"),
  day-over-day change screens, **proximity screens** ("within 2% of HVL"), percentile-extreme
  screens. Saved screeners re-run daily. `[DOC]`
- 3.0 QUIN adds: summarize positioning changes, explain GEX shifts, build trading roadmaps,
  news-aware trade ideas. `[DOC: thetaprofits]`

### 7.6 Newsletter & education

- Daily 6:30 AM ET data report (free tier = the funnel; structure in §5). `[DOC]`
- Academy: course tracks incl. "How to use MenthorQ Models" (lessons: daily routine, gamma levels,
  blind spots, gamma on Bitcoin, Net DEX chart, swing model, Q-Score, earnings playbook, skew,
  term structure+skew, crypto quant, volatility models, options screeners, Q-Score screeners,
  stock baskets). Finance Wiki: 350–500+ guides incl. backtests. `[DOC]`

## 8. Documented usage doctrine (their "how to trade it")

- Regime first: locate spot vs HVL → decide fade (positive gamma) vs momentum (negative gamma)
  tactics. `[DOC]`
- Primary levels as day frame: Call Res = ceiling/target, Put Sup = floor/target, 1D EM band =
  day's expected envelope (also IC strike placement). `[DOC]`
- When primaries are far, GEX 1–10 "sticky levels" become intraday S/R — especially in negative
  gamma. `[DOC: NFLX case study]`
- Blind Spots fill the gaps between gamma strikes; used for partial-profit targets, entries with
  bias, and "don't enter directly into a BL against you." `[DOC]`
- Sequential multi-model workflow (their Option Matrix guide): matrix (positioning across
  expiries) → GEX/DEX 1D changes (shock timing) → smile (IV distribution) → Net GEX map + HVL
  (structure) → VRP (premium-sell vs directional) → 25Δ RR skew (tail bias) → 5-day swing model
  (trigger). `[DOC]`
- Confluence over single-level signals is repeatedly emphasized (levels + Q-Score + blind spots).
  They do NOT publish a mechanical "1st touch rejection" stat-rule; the closest is the 3.0
  backtester's per-level hold-probability. `[DOC-absence of formal rule + DOC backtester]`
- Earnings: dedicated lesson on using levels/IV around earnings. `[DOC: lesson exists; content gated]`

## 9. Where they are strong vs weak (build-team read)

**Strong / clone-worthy:**
1. **Two-tier level taxonomy** (primaries + ranked GEX 1–10 secondaries bounded by the 1D EM
   range) — clean, teachable, alert-friendly.
2. **Parallel 0DTE level set** incl. Gamma Wall 0DTE — first-class, not a toggle.
3. **Option Matrix** — per-expiry positioning grid with normalized columns and per-expiry levels +
   expected move; the single best "morning sheet" artifact in this market.
4. **Per-level backtester** (hold probability, avg break move, worst case) — turns levels from
   assertions into measurable claims; biggest 3.0 differentiator.
5. **Cross-asset projection** (Blind Spots + Levels Conversion) — native futures options PLUS
   index-options-projected-to-futures in one chart.
6. **QUIN conversational screener** over a 97-metric store with percentile/change/proximity
   verbs — the metric *verbs* (change-vs-yesterday, percentile-3M, distance-to-level) matter more
   than the LLM.
7. **Channel ubiquity** — same level set piped to 11 platforms + Discord + email; Discord slash
   commands double as a zero-UI API.
8. **Packaging** — data all-in at one tier; humans as the upsell; $39 intro month funnel; free
   delayed-data mirror of the real app as trial.

**Weak / beatable:**
1. **Opaque methodology** — 1D EM, Q-Score, swing ML, blind-spot clustering formulas all hidden;
   glossary has sign-convention inconsistencies (Net DEX, RR). A transparent, unit-tested
   methodology page is a trust wedge.
2. **Cadence ceiling** — 5-minute intraday recompute; EOD-anchored OI; TradingView delivery is
   indicator-code pushes with manual refresh and daily alert re-creation. True streaming levels +
   self-rearming alerts beat this outright.
3. **No trade-level flow** — everything is OI/greeks structure; no tape/sweep/block detection
   (our ThetaData trade_quote lanes already exceed this).
4. **Level clutter** — 15+ lines per chart; reviews note load time. Auto-decluttering (regime- and
   distance-aware level relevance scoring) is an obvious UX win.
5. **Static regime labels** — "Gamma Condition: positive" with no trend/velocity. Our
   regime-dynamics law (level + trend + velocity) directly upgrades this.
6. **History shallow at the surface** — Discord keeps 5 days; historical GEX/DEX chart is SPX-only.
   Our dated GEX ladder replay (`gex_at:`/`gex_dates:`, exposure desk) already generalizes this.
7. **No confluence engine** — doctrine says "stack models" but the user does it by eye. A scored
   confluence (level × vol regime × skew × CTA/vol-control flow) with published hit rates is the
   step past parity.
8. **Vanna/charm underexploited** — drawn as one cumulative curve, never leveled or alerted.

## 10. Concrete upgrade backlog for Mastermind Terminal

1. Ship the taxonomy at parity: Call Res / Put Sup / HVL / Gamma Wall + 0DTE set + GEX-ranked
   secondaries clipped to an expected-move band; per-expiry matrix view. (Most primitives exist in
   the options suite; this is mostly assembly + naming.)
2. **Level Reliability Engine**: for every published level, nightly-compute touch count, hold
   rate, mean/max adverse excursion on break, conditioned on gamma regime — surfaced inline as a
   badge. Beats their backtester by being always-on rather than on-demand.
3. **Expected-move honesty ledger**: publish our band's rolling containment stats (their 87.6/85.0%
   claim is static marketing; a live ledger is stronger).
4. Dynamic regime chip: gamma condition + distance-to-HVL + 3-day trend + velocity (per repo law).
5. Confluence score with attribution (which models agree, weight, historical edge of that stack).
6. Cross-asset projection with **live basis** (their auto-ratio uses prior close; we can stream).
7. Conversational screener: expose our metrics store with their six query verbs; return artifacts,
   cite the underlying data rows.
8. Alert engine: self-rearming level alerts that survive the nightly level refresh (their TV
   scanner cannot).
9. Flow overlay: merge dealer-structure levels with live tape (sweeps at level, absorption) —
   category they don't play in.
10. Distribution: our web-first rule holds; but their Discord-bot-as-API pattern is worth copying
    as terminal slash-commands / API endpoints returning the same artifacts.

## 11. Source log (for verification)

- menthorq.com: `/`, `/pricing/`, `/features/`, `/integrations/`, `/quantitative-models/` and the
  26 model subpages; guides: `key-gamma-levels`, `key-levels-and-key-terms`,
  `free-daily-report-explained`, `call-resistance`, `high-vol-level`, `0dte-gamma-levels`,
  `trade-net-gex-levels`, `1d-expected-move-indicator`, `backtesting-results-1d-move`,
  `blind-spots-levels`, `gamma-levels-on-es`, `ctas-funds-model`, `the-menthor-q-score`,
  `swing-trading-model`, `discord-ai-bot-commands`, `tradingview`, `tradingview-scanner`,
  `levels-conversion`, `menthorq-asset-coverage`, `quin-ai-screeners-documentation-and-prompts`,
  `how-to-use-the-option-matrix-2`; academy `how-to-use-menthor-q-models` course index;
  `landing/quin-the-quant-engine`.
- Secondary: optionstradingiq.com/menthor-q-review (historical pricing, Discord-era UI);
  thetaprofits.com MenthorQ 3.0 review (app UI, backtester); barchart.com 3.0 PR; TrendSpider
  blog/store (intraday 14+/day, tiers); Quantower blog; trustpilot.com/review/menthorq.com;
  @MenthorQpro on X (roadmap indicator combining Q-Levels + Blind Spots); webcatalog.io (desktop
  wrapper); lucaspropfirm.fr (MQ20 code).
- Dashboard.menthorq.io fetch confirmed auth-gated redirect only; all dashboard UI claims come
  from vendor demo material and third-party reviews, tagged accordingly.
