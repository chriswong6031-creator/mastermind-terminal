# IVolatility (ivolatility.com) — Engineering Teardown

**Date:** 2026-08-01 · **Author:** research agent (Mastermind options-analytics program)
**Purpose:** capability replication ledger for the Mastermind vol-analytics suite. All content paraphrased from public sources; no verbatim marketing/docs copy. Claims are tagged **[DOC]** (documented fact from a primary IVolatility source), **[SEC]** (secondary source — reviews, licensee docs, community writeups), or **[INF]** (inference).

**Primary sources mined this session:**
- ivolatility.com home, `/ivollive-options/`, `/data-cloud-api/`, `/historical-options-data/` (+ us-index-equity-options), `/faq/`, `/education/` (IV Index, Volatility Surface pages)
- `doc/IVolatility_Data_Nov17.pdf` (full data guide — extracted)
- `doc/companion-guide.pdf` (Advanced Options page guide — extracted)
- `doc/probability_calculator_help_guide.pdf`, `doc/PnL_calculator_help_guide.pdf` (extracted)
- `doc/RT_Spread_Scanner.pdf`, `doc/SSSGuide.pdf` (spread scanner guides — extracted)
- `doc/StockSentimentRanker.pdf` (extracted)
- GitHub `IVolatility-com/API-docs` → `rest-api-ivlive-dev_formatted.json` (OpenAPI 3.0.1, 69 paths, 32 schemas — parsed locally)
- Fidelity IVX Index User Guide (Fidelity licenses IVolatility's IVX — richest public description of the IVX calc)
- SteadyOptions tool reviews (Advanced Ranker, Probability Calculator, PnL Calculator)

---

## 1. Company positioning

- In equity-derivatives data since 1999; database billed as the largest continuous derivatives DB; 70k+ clients historically, incl. majority of top-30 options market makers, CBOE, NYSE, OCC, large banks. **[DOC]**
- Business model = three stacked lines: (1) retail analytics terminal (**IVolLive**), (2) retail/quant **Data Cloud API + IVolAI backtester**, (3) institutional **data licensing** (FTP/managed DB/Snowflake/cloud). Plus adjacent fixed-income/MBS data lines (out of scope for us). **[DOC]**
- Key strategic fact: their IVX/IV-chart stack is white-labeled by brokers (Fidelity's IV Index page is IVolatility's engine). They are the "vol data plumbing" incumbent, not a positioning/gamma shop — no GEX/dealer-positioning products at all. **[DOC/INF]**

---

## 2. Product census

### 2.1 IVolLive (current retail web terminal)

Single-page workspace; all tools share watchlists ("Favorites") and a symbol context. **[DOC]**

| Tool | Function | Cadence |
|---|---|---|
| **Stock Monitor** | Watchlist grid, 100+ selectable columns (price, IVX terms, HV, IV rank, options volume/OI…), groupable/sortable, inline option pricing, CSV export | RT or 15-min delayed |
| **Options Chain** | Compact customizable chain: NBBO, volume, OI, per-contract IV + Greeks; IV rank, HV context; full-chain CSV download | RT or delayed |
| **IV Skew Charts** (inside chain) | Two chart families: **Strike Skew** (IV vs strike per expiration) and **Time Skew** (IV vs DTE per strike/moneyness) | RT or delayed |
| **IVX Monitor** | 30d IVX with 52-week high/low context + IV Rank | RT or delayed |
| **Advanced Charts** | Open interest, "normalized historical volatility surfaces", custom datasets | RT or delayed |
| **Contract Viewer** | Minute-by-minute intraday price + IV of a single contract ("visual backtesting") | intraday |
| **Spread Scanner** | Whole-universe scan across ~14 strategy templates (verticals, calendars, diagonals, straddles, strangles, synthetics, collars, naked); ranked by least-risk / max-reward / probability-of-profit; filters incl. market cap, bid-ask spread, vol smile | RT on top plan; 15-min delayed on base |
| **Sentiment Analyzer** | Composite bullish/bearish + volatile/quiet ranks from technical + options-derived + fundamental signals | EOD |
| **Options Calculator** | Fair value + all Greeks; IV solver; autofills market data | RT or delayed |
| **Probability Calculator** | P(touch) and P(finish above/below/between) for two targets; IV/HV/IVX selectable | RT or delayed |
| **P&L Calculator** | Unlimited legs; payoff chart; what-if sliders for time-to-expiry and IV; live break-evens, max P/L | delayed |
| **Earnings Calendar** | Confirmed + estimated dates, options-implied **expected move** (±%), historical post-earnings **IV crush** analytics, weekly view with EM% + IV Rank | EOD |
| **IVolLive AI** | Context-aware copilot: explains Greeks/IVX/skew, deep-links to tools, assembles multi-leg trades from natural language, prices and charts them, handles "roll/widen/hedge" adjustments in chat | — |
| **Data Download** | In-terminal bulk historical export (20+ yrs EOD), billed against monthly credit | EOD |

Coverage: US stocks/ETFs/indexes/futures + selected international; OPRA source for options. **[DOC]**

### 2.2 Legacy Services & Tools (still instructive for UX archaeology)

- **Basic / Advanced Options page** — the classic report: 4 sections = Stock Data (quote + current & historical IVX term-structure snapshots), IV Skew Charts (strike skew + time skew), Option Data grid (bid/ask/vol/OI/IV/Greeks per contract), IV & Greeks commentary. Click-to-enlarge charts; CSV download. **[DOC]**
- **Advanced Ranker** — universe ranker with category tabs: IV Index level, **IVR** (52-wk rank), **IVP** (52-wk percentile), Call/Put IVX ratio, correlation, HV/IV relationships; min-market-cap and liquidity filters; auto-excludes names with unreliable IV. **[DOC/SEC]**
- **Stock Sentiment Ranker + Analysis page** — see §3.9.
- **RT Spread Scanner (Java-era)** — see §3.8; the modern IVolLive scanner inherits its math. **[INF]**
- **Strategist Scanner** — one-leg + stock-leg strategies (covered call, naked put). **[DOC]**
- **My Favorites** — cross-tool watchlist manager; scanners can emit into Favorites and consume them as universes. **[DOC]**
- **IVGraph** — legacy charting of IV Index vs HV vs price. **[DOC]**
- **Probability / PnL calculators** — as above (guides date to the legacy stack).

### 2.3 Data services (institutional)

Datasets (equities universe ≥5,500 US optionable names, 1M+ contracts; also Canada ~300 names, Europe ~600, Asia ~800, futures ~200 US products + ICE): **[DOC]**

1. **Options prices (NBBO)** — EOD chains: bid/ask, OHLC, volume, OI, stock close. US history from Nov 2000 (packaged retail product: from Jan 2005; SPX from 1990).
2. **Raw IV** — per-contract IV + Greeks for every strike/expiration; includes 3:45pm ET pre-close snapshot (since 2005) to dodge close-auction noise and 0DTE gaps.
3. **Parameterized per-expiration curve** — smoothed raw IV compressed to ~3 coefficients per expiry (parabola in ln(K/F), claimed >99% fit) — see §3.4.
4. **IV Index (IVX)** — constant-maturity composite IV, call/put/mean — see §3.2.
5. **IV Surface by Moneyness** — fixed moneyness×tenor grid — see §3.5.
6. **IV Surface by Delta** — fixed delta×tenor grid — see §3.6.
7. **HV** — close-to-close + Parkinson (+ Garman-Klass education) — see §3.7.
8. **Correlation/beta** — stock-vs-index price corr/beta; cross-stock price & *volatility* correlation matrices — see §3.10.
9. **Dispersion metrics** — implied correlation, realized correlation, theoretical index IV from components. **[DOC]**
10. **Complementary** — splits, dividends, multi-term interest rates, earnings calendar w/ historical implied moves, warrants.
11. **Intraday** — 1-minute snapshots (bid/ask + sizes, volume, IV, Greeks, underlying) since Aug 2011; tick-level option trades w/ NBBO-at-trade + underlying-at-trade + trade-IV since Jan 2014; 20-min-delayed live feed. **[DOC]**

Delivery: CSV files + daily web/FTP updates; managed MS SQL/PostgreSQL replicas with corporate-action maintenance; Snowflake; AWS/Azure; REST API; WebSocket; Excel Power Query; Python SDK. EOD ready 9pm–1am ET same day. **[DOC]**

### 2.4 Data Cloud API + IVolAI

- REST base `restapi.ivolatility.com`; auth via username/password, API key, or `/token/get` bearer session. **[DOC]**
- **IVolAI backtesting module**: natural-language strategy → generated runnable Python; enforces a "5-layer interview" (entry signals → contract selection → optimization params → risk mgmt → symbol universe); backtests on real bid/ask incl. intraday stop-loss; outputs trades.csv + notebook. $50 AI credit included; hosted VS Code workspace bundled. **[DOC]**
- Marketing claims "600+ quality filters" on the derivatives DB. **[DOC]**

---

## 3. Methodology deep-dives (the replication core)

### 3.1 Options pricing / raw IV engine

- Pricing models: **Black-Scholes for European-style**; **Cox-Ross-Rubinstein binomial, 100 steps** for American-style / dividend-paying underlyings. **[DOC]**
- Option "price" input for IV = midpoint of best EOD NBBO: `0.5 * (max(last bid) + min(last ask))` across all exchanges. **[DOC]**
- Proprietary DB supplies per-name dividend schedule + multi-term interest rates (interpolated interbank curve, 1-day delay). **[DOC]**
- Sanity window: IVs outside **1%–250%** are flagged (asterisk in UI), replaced from the paired option or interpolated — the replaced value is used only to keep Greeks computable, not for cheap/rich analysis. **[DOC]**
- Cleansing pipeline: primary+backup vendors, manual corporate-action tracking, automated bad-tick filtering with interpolated substitution, post-calc anomaly scans reviewed by analysts. **[DOC]**
- EOD chain content: regular 3rd-Friday, weeklies, quarterlies, LEAPS; **non-standard (corporate-action-adjusted) contracts excluded**. **[DOC]**

### 3.2 IVX — Implied Volatility Index (their flagship metric)

Two documented vintages of the same design:

- **Classic (Fidelity guide, education page):** per expiration take the **4 strikes nearest spot**; compute a **vega-weighted average** of their IVs → a per-expiration composite ("IVX Call 12" for a 12-DTE expiry). Then take the two expirations bracketing the target tenor and **interpolate linearly in √time** to the virtual tenor (30d etc.). **[DOC]**
- **Current (REST API doc):** **8 ATM options per expiration (4 calls + 4 puts)**, weighting factors **delta and vega**; same √t normalization. **[DOC]** (The 4-vs-8 difference is call/put-split bookkeeping, not a different algorithm. **[INF]**)
- Variants: **IVX Call / IVX Put / IVX Mean** (mean = average of call & put composites). FAQ notes OTM-side weighting for the call and put legs. **[DOC]**
- Tenor grid: classic product 30/60/90/120/150/180d (+ 9m, 12m, 2y, 3y in the data guide); current API grid **7, 14, 21, 30, 60, 90, 120, 150, 180, 270, 360, 720, 1080 days** — the 7/14/21/270-day tenors only exist from **2019-10-10** onward. **[DOC]**
- History: IVX 30d back to **May 1999**; SPX underlying series back to 1990. **[DOC]**
- Interpretation doc: IVX30=25% ⇒ expected daily σ ≈ 25%/√252 ≈ 1.57%. Positioned explicitly as "VIX-like measure for every optionable name". **[DOC]**
- Companion series shipped alongside: 1-day change, 1-week-ago, 1-month-ago values, 52-wk hi/lo, and a **0–1 scaled position within the 52-wk range** (their proto-IV-rank, produced for both IVX30 and HV30). **[DOC]**

### 3.3 IV Rank / IV Percentile (as used in Advanced Ranker / IVolLive)

- **IVR** = (IV − 52wk low) / (52wk high − 52wk low) × 100, on IVX30. **[DOC/SEC]**
- **IVP** = % of the last 52 weeks' trading days with IV below today's. **[SEC]**
- Their own educational framing: IVR is outlier-distorted; IVP is robust; buy-premium when IVP low, sell when high. Ranker sorts on either, auto-drops names with unreliable IV. **[SEC]**

### 3.4 Parameterized per-expiration smile

- Raw smile per expiration is fit with a low-order curve — shown as a **parabola in ln(strike/forward)**, i.e. 3 coefficients per expiry, >99% fit quality claimed. Used to (a) compress hundreds of quotes, (b) de-spike smiles for day-over-day slope comparison, (c) serve as the substrate for the delta surface. **[DOC]**

### 3.5 IV Surface by Moneyness

- Classic grid: **12 moneyness points × 8 tenors = 96 points/day** (education page); data-guide tenor list 1,2,3,4,5,6,12 months + 2,3 years; moneyness **−50%…+50% in 5% steps**; each point carries **IV + delta**. Built from raw IV by interpolation. **[DOC]** (12 vs 21 moneyness points across doc vintages — current API returns the ±50%/5% ladder; the "12-point" figure is the older packaged product. **[INF]**)
- Current API construction rule: **OTM-only** — puts populate virtual strikes 50…100% of spot, calls 100…150%; tenors same 13-point grid as IVX with the 2019-10-10 caveat. **[DOC]**
- Explicit selling points: moneyness normalization is immune to strike adjustments from corporate actions; enables "virtual option" historical comparisons (same moneyness + DTE across years) to answer today-cheap-vs-history. **[DOC]**
- **Volatility Bands**: for each of the 96 grid points, compute 1-year min/max (and average) over the time axis; overlay today's smile against the band envelope → out-of-corridor = rich/cheap flag. This is their vol-regime "corridor" visualization. **[DOC]**

### 3.6 IV Surface by Delta

- Grid: **deltas 0.10→0.90 in 0.05 steps (17 points) × 9 tenors (1,2,3,4,5,6,9,12,24 months) = 153 points/day**; each point carries IV + the moneyness of that delta. Built **on the parameterized curve**, not raw quotes. **[DOC]**
- Rationale they document: delta is a maturity-independent ITM/OTM measure — short-dated smiles by moneyness explode in steepness, while the delta grid keeps resolution near ATM; also better for tracking "the option I'd actually trade" historically. **[DOC]**
- Extended to futures options (announced separately). **[SEC]**

### 3.7 Realized volatility

- **Close-to-close**: log-return stdev with **n−1** (unbiased) denominator, annualized ×√252. Windows (equities): **10, 20, 30, 60, 90, 120, 150, 180d** (education adds 360d). History from 1999; top liquid names from 1995. **[DOC]**
- **Parkinson high-low** variant shipped in parallel. **Garman-Klass (log variant)** covered in education (likely available as custom metric **[INF]**).
- Futures HV windows differ: **5, 10, 20, 40, 60, 80, 100, 120, 180, 250d**. **[DOC]**
- Their pairing convention: HV20 (trading days) is the comparable for IVX30 (calendar days). **[DOC]**

### 3.8 Spread scanner math (documented, unusually explicit)

- **Capital Required**: computed per CBOE margin manual; always positive. **[DOC]**
- **Risk/Reward**: max loss/profit proxied at **±2σ** of underlying (and ±2σ of IV for calendar/diagonal at short-leg expiry) rather than true unbounded extremes. **[DOC]**
- **Risk/CapReq**, **Max Return** = 2σ-loss and 2σ-profit over capital required (to expiry, not annualized). **[DOC]**
- **Probability of Profit** from a fair-pricing two-outcome model: `p = Lmax / (Pmax + Lmax)` — i.e., PoP is *derived from* the risk/reward ratio, an explicit no-free-lunch teaching device. **[DOC]**
- Position Greeks summed naively across legs; **Alpha = |gamma/theta|** exposed as a scan filter, with "fair alpha" ≈ `2·365 / (IV² · S²)` under BS as the rich/cheap threshold. **[DOC]**
- Advanced stock filters (their factor vocabulary — worth cloning wholesale): price/volume % change, volume vs 1-mo average, market cap, **HV_S−HV_L** (HV term-structure slope), **IVX_S−IVX_L** (IV term-structure slope), **IVX_S/HV_S**, **IVX_L/HV_L** (vol risk premium short/long), **options volume % of OI** (unusual activity), **call/put volume ratio**, **IVX call/put ratio** short & long term. Defaults: S=30d/L=180d calendar for IVX, 20d/120d trading for HV. **[DOC]**
- Advanced option filters per leg: bid, ask, spread % of stock, price Δ, IV, IV Δ, volume % of OI, delta/gamma/vega/theta. **[DOC]**
- **Risk Scenario**: P&L matrix over any two of {price, time, vol} with the third fixed, editable axes, auto-refresh from live feed, bid/ask slippage included, **short-leg assignment simulation** (incl. cash-settled index handling). **[DOC]**
- Legacy scanner = strictly 2-leg (+synthetics); one-leg/stock-leg strategies routed to Strategist Scanner; IVolLive merges these into one scanner with ~14 templates incl. collars and naked writes. **[DOC]**

### 3.9 Stock Sentiment engine

- Pre-computed per name from defaults **EMA 12/26, RSI 14, CMF 21** + price/volume action + HV term structure + market correlation + options-derived signals. **[DOC]**
- Each sub-signal emits Buy/Sell/Hold votes (strong signals = 2 votes). **Bullish Rank = 100·(Buy−Sell)/(Buy+Sell+Hold)**; **Volatile Rank = 100·2·min(Buy,Sell)/(Buy+Sell+Hold)** — i.e., *disagreement itself* is the volatility signal. 7-notch verbal scales on both axes. **[DOC]**
- Notable sub-signal: near 52-wk boundary + **rising HV term structure** ⇒ breakout continuation; falling ⇒ mean reversion. **[DOC]**
- Ranker lets users re-weight (or sign-flip) each indicator's votes → custom composite. **[DOC]**

### 3.10 Correlation & dispersion

- Stock-vs-index price correlation/beta, windows 10–252d. Cross-stock **price and volatility** correlation/beta matrices (vol-beta for vega hedging). **[DOC]**
- Index dispersion set: **implied correlation** (avg component-vs-index from IVs), **realized correlation**, **theoretical index IV** from component IVs under several weightings — sold as dispersion-trading timing tools. **[DOC]**

### 3.11 Probability calculator

- Lognormal model; auto-fills spot, **ATM IV** (default), rate, dividends; vol source switchable to HV or any IVX tenor (30–180d). Outputs: **P(touch)** for each target during window, **P(finish)** above/below/between, and ±1/2/3σ price ranges. **[DOC]**

### 3.12 Earnings analytics

- Calendar with confirmed/estimated dates; **expected move** = ±% implied by pre-earnings options (ATM straddle-based **[INF]**); historical **IV crush** per name (post-print IV drop); weekly view: date, EM%, IV Rank. Positioned for pricing "what you pay for the crush". **[DOC]**

---

## 4. API surface (parsed from their OpenAPI 3.0.1 spec)

69 paths. Functional groups:

- **Auth/util**: `GET /token/get`; `/data-download-ui` (GET/POST).
- **Equities EOD**: `stock-prices`, `single-stock-option(-raw-iv)`, `options-rawiv` (whole chain + Greeks), `options-nbbo`, `ivx`, `ivs`, `hv`, `nearest-option-tickers` (2 nearest listed contracts for a target DTE — handy chain-navigation primitive), `option-series`, `underlying-info`, `yield`, `interest-rates`.
- **Equities intraday**: `intraday/stock-prices`, `intraday/equity-options-rawiv` (chain snapshots, `minuteType=MINUTE_1|5|15|30|60`), `intraday/single-equity-option-rawiv`.
- **Equities live**: `rt/stock-prices`, `rt/options-rawiv`, delayed twins `dl/*`, `rtdl/*`.
- **Futures**: EOD `prices`, `options-rawiv`, `options-nbbo`, `ivx`, `ivs`, `hv`; live `rt/fut-prices`, `rt/fut-opt-rawiv`; `market-structure` endpoints.
- **Quotes**: `/quotes/options[/realtime|/delayed]` with strike/expiry range filters.
- **`/dd/*`**: mirror of the above for the pay-per-use Data Download billing lane. **[INF: same handlers, different metering]**

**Response dictionaries (exact field lists from the spec):**
- `EodEquityRawIv`: symbol, exchange, date, expiration, strike, style, call/put, bid, ask, mean_price, iv, delta, gamma, theta, vega, rho, volume, open_interest, adjusted_close, stock_price_for_iv, option_symbol, `*` (unreliable-IV flag **[INF]**).
- `EodEquityIvx`: `{30,60,90,120,150,180,270,360,720,1080}d_iv_{call,put,mean}` + price.
- `EodEquityIvs`: period, strike, iv, delta, out-of-the-money_%, call/put — one row per surface node.
- `EodEquityHv`: `{10,20,30,60,90,120,150,180}d_hv` + price.
- `IntradayEquityOptions`: full NBBO w/ sizes+exchanges+timestamps, optionIv, **optionPreIv**, impliedYield, all Greeks incl. rho, underlyingPrice, calcTimestamp.
- Status envelope includes `queriesLeftEOD` / `queriesLeftIntraday` (quota transparency).
- History anchors in descriptions: US options Nov 2000 (SPX 1990); Europe 2011-04-19; ASX/HKEX 2013-06-12; NSE 2016-04-24; OSE/TSE 2016-07-18; US futures bid/ask 2014-05-22; no Canadian futures options. **[DOC]**

Rate limits: **1 req/s, burst 5** on all retail tiers; monthly quotas per tier; professional negotiated. **[DOC]**

---

## 5. Pricing census (as displayed 2026-08-01)

**IVolLive** (non-professional only; pro via sales):
- **Advanced — $45/mo**: 15-min delayed, all tools + AI, $60/mo download credit, 1-wk trial.
- **Real-Time — $100/mo**: real-time data, full real-time Spread Scanner, $150/mo credit, 1-wk trial. **[DOC]**

**Data Cloud API** (retail): displayed $63 / $159 / $319 per month (promo) vs FAQ list $79 / $199 / $399 — **Builder** (US, 3yr history, 20k req/mo), **Quant** (US, 5yr, 100k), **Lab** (global, 20+yr, unlimited). All: 1-min snapshot access, $50 AI credit, VS Code workspace, IVolAI, 7-day trial. **[DOC — both price sheets seen; promo vs list [INF]]**

**Data Download (pay-per-use, no subscription)** — per ticker·day: **$0.20** underlying prices, **$0.40** NBBO & HV, **$0.60** Raw IV / IV Surface / IV Index; 10 GB per order cap; EOD only; history to Jan 2005. **[DOC]**

**Institutional licensing**: quoted per dataset/coverage/delivery (FTP, managed DB, Snowflake, cloud); custom metrics on request. **[DOC]**

---

## 6. UI/UX patterns worth studying

1. **The 4-panel instrument report** (Advanced Options → IVolLive chain): quote header + IVX term structure with *historical snapshots overlaid* + strike/time skew charts + chain grid. One screen answers "is vol rich, where, and in which expiry". **[DOC]**
2. **Term structure with memory**: current IVX curve drawn against prior-week/prior-month curves and 52-wk min/max/avg per tenor (their Fig-3 pattern: current vs min vs max vs avg by DTE). **[DOC]**
3. **Volatility Bands**: today's smile inside a 1-yr min/max envelope per (moneyness, tenor) node — an instantly readable rich/cheap heat frame. **[DOC]**
4. **Everything emits into Favorites; every scanner consumes Favorites** — list-centric workflow glue. **[DOC]**
5. **Pocket** (scanner): park candidate trades from multiple scans side-by-side for comparison. **[DOC]**
6. **Risk Scenario matrix**: editable 2-axis P&L grid (price × time × vol, pick 2) with live refresh and assignment simulation. **[DOC]**
7. **Two-tier data honesty**: 3:45pm snapshot vs close; asterisked/interpolated IVs; explicit 0DTE-missing-at-close caveat. Trust-building via documented caveats. **[DOC]**
8. **AI as glue, not oracle**: copilot explains metrics, deep-links tools, assembles legs; backtester interviews before generating code. **[DOC]**

---

## 7. What to clone / what to beat (Mastermind build ledger)

### Clone (proven, cheap to replicate given our OPRA/ThetaData lanes)

1. **Constant-maturity IV index (our "MVX")** — vega-weighted 4-strike-per-expiry composite, √t interpolation to fixed tenor ladder {7,14,21,30,60,90,120,150,180,270,360,720}; call/put/mean triplet. This is the single most-reused primitive in their whole stack (rank, percentile, term structure, scanner filters, earnings EM all sit on it).
2. **Dual surfaces** — moneyness grid (±50%/5%, OTM-only construction, delta attached per node) for corporate-action-proof history, plus delta grid (0.10–0.90/0.05 on a parameterized smile) for trader-centric history. Store both; they're cheap once the smile fit exists.
3. **Per-expiry smile parameterization** — 3-coefficient fit in ln(K/F); gives compression, de-spiking, and the delta-surface substrate in one pass.
4. **Vol Bands** — 1-yr min/max/avg envelope per surface node, overlaid on today's curve.
5. **The scanner factor vocabulary** — IVX_S−IVX_L, HV_S−HV_L, IVX/HV (VRP), IVX call/put ratio, volume%OI, C/P volume — as first-class screener columns.
6. **PoP/risk math transparency** — 2σ-bounded risk/reward, PoP = Lmax/(Pmax+Lmax), CBOE-margin capital; publish the formulas like they do.
7. **IVR + IVP side-by-side** (rank AND percentile, both 252d) — never one without the other.
8. **Earnings EM + historical crush** table keyed to the IVX ladder.
9. **3:45pm auxiliary snapshot** concept — a pre-close vol mark to de-noise EOD analytics (we can synthesize from our intraday lane).

### Beat (their visible gaps = our differentiation)

1. **No positioning layer at all** — zero GEX/DEX/vanna/charm, no dealer inventory model, no OI-flow decomposition. Our exposure desk + tape lanes already exceed them here; fuse "their" vol-state metrics with our positioning state (e.g., IVR × gamma-regime matrix).
2. **No fixed-strike vol matrix with z-scores** — they normalize to moneyness/delta but never render the SpotGamma-style fixed-strike change matrix. Ship: strike × expiry ΔIV heat with per-cell σ-scores vs trailing distribution.
3. **Term structure without analytics** — they draw curves but compute no slope/curvature factors, no percentile ribbons per tenor, no inversion alerts. Ship: TS slope (30/90, 30/180) time series with regime thresholds + trend/velocity per regime-dynamics law.
4. **Skew as ratio only** — their skew metric is call/put IVX ratio; no 25Δ risk-reversal / butterfly time series, no skew-vs-history cones, no cross-name skew comparison overlays. Ship: RR25/BF25 per tenor with history percentiles and multi-symbol overlay.
5. **Static UI generation** — legacy pages are grids+GIF-era charts; IVolLive modernizes but stays widget-per-page. Our single-canvas terminal with linked cursors across chain/surface/term-structure wins on workflow.
6. **No streaming vol state** — intraday exists as data, but no live "surface diff since open" view. Ship: intraday fixed-strike and surface-node change stream (our quote-hub pattern).
7. **Percentile discipline** — their 52-wk scaled range predates IVR; extend with multi-lookback (1m/3m/1y/3y) percentile ladders + trend arrows (regime-dynamics law compliance).
8. **Rate/dividend transparency** — they hide the curve; we can expose the implied borrow/dividend per expiry (we already compute impliedYield-style fields intraday — so do they, but they never surface it in UI).
9. **Pricing pressure** — their retail analytics+data bundle is $45–100/mo with metered downloads; our all-in terminal at comparable price with positioning + vol + flow in one shell is a straight value win.

### Explicit non-goals from this teardown
- Their fixed-income/MBS lines: ignore.
- Their AI backtester: our IVolAI-equivalent is out of scope for the vol desk MVP; note the "5-layer interview" pattern for any future strategy-builder UX.

---

## 8. Open questions / verification notes

- 4-vs-8 ATM options per expiry in IVX: education page (older) says 4; current API doc says 8 (4C+4P). Treat 8 as current. **[DOC both; resolution INF]**
- Moneyness surface node count: 96 (12×8, education/data-guide vintage) vs 21 moneyness × 13 tenors in the current API. Both documented; the API grid is what we'd match.
- IVolLive $45/$100 vs historical lower price points seen in third-party reviews — prices as displayed today; recheck at build time.
- Data Cloud API $63/159/319 vs FAQ $79/199/399 — likely promo vs list; confirm before any pricing-comparison marketing.
- Their smile fit is shown as a parabola in ln(K/F); actual production fit may have more terms (wing handling undocumented). **[INF]** Our fit choice (SVI vs quadratic) should be benchmarked against raw-IV reconstruction error like their >99% claim.
