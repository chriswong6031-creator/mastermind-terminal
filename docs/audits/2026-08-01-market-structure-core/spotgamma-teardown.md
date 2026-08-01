# SpotGamma — Engineering-Grade Capability Teardown

- **Date:** 2026-08-01
- **Prepared for:** Mastermind Terminal — dealer-positioning / gamma-structure / volatility-mechanics suite (market-structure-core program)
- **Purpose:** Replicate *capability*, not content. Everything below is paraphrased from public sources; no marketing copy, docs text, or assets may be copied into our product.
- **Primary sources (crawled 2026-08-01):**
  - Zendesk help center JSON API: `support.spotgamma.com/api/v2/help_center/en-us/{categories,sections,articles}.json` — **15 categories, 64 sections, 417 articles** captured with full bodies.
  - TRACE User Manual PDF (public): `spotgamma.com/wp-content/uploads/2025/07/TRACE-User-Manual-Final-Version.pdf` (8 pp, "Last Update: July 16, 2024").
  - Web search for corporate facts / Bloomberg distribution.
- **Epistemics:** Items are **[DOC]** (stated in SpotGamma's own public docs), **[STAT]** (a quantitative claim they publish), or **[INF]** (our inference — labeled inline). Where two of their own documents disagree, both are reported.

---

## 1. Company & commercial snapshot

- Founded by **Brent Kochuba** (ex Seven North Capital PM; derivatives broker at Wolverine Execution, Credit Suisse, BofA). About-page says founded **2020** [DOC via web]; press coverage exists from 2021 onward (WSJ, Bloomberg Markets, Benzinga).
- Positioning: "we model all US options flows" → proprietary dealer-positioning analytics for retail/prosumer traders. They claim to have **coined "GEX"** and to have been first to publish it systematically [DOC — their glossary; treat as marketing claim].
- No acquisition/merger found through 2026-08 [searched; none surfaced].
- They publish a **Quarterly Report Card** (public page) grading their own levels' hit-rates — an accountability/marketing artifact worth copying.

### 1.1 Subscription tiers & pricing (current, from support center 2026-07)

Two tiers (legacy tiers "Standard"/"Pro" still referenced in older articles — the lineup was consolidated):

| | **Essential** | **Alpha** |
|---|---|---|
| Monthly | $99 | $299 |
| Annual | $891/yr ($74/mo eff.) | $2,691/yr ($224/mo eff.) — "save 25%" |
| Founder's Note (AM+PM) | ✅ | ✅ |
| FlowPatrol daily flow report | ✅ | ✅ |
| Index Key Levels + platform integrations (cloud notes) | ✅ | ✅ |
| Options Calculator | ✅ | ✅ |
| Equity Hub (3,500+ tickers) | Total-OI lens only | Total-OI + **Synthetic-OI** lens (one doc says Synthetic OI = annual-plan only) |
| Compass + 15 Scanners | ✅ | ✅ |
| Tape (flow tool, 3,000+ tickers) | ✅ | ✅ |
| Canvas (custom layouts) | ✅ | ✅ |
| **TRACE** | ❌ | ✅ |
| **HIRO** | ❌ | ✅ |
| **Volatility Dashboard** | ❌ | ✅ |
| Discord + 2×/week live Q&A (Mon/Thu 1pm ET) | ✅ | ✅ |

- Payment: Stripe cards + PayPal. No prorated refunds on cancel; plan changes prorate; monthly↔annual switch requires support.
- Affiliate/referral program exists (dashboard, commission payouts).
- Free education funnel: "SpotGamma Academy — 30 Years of Options Education in 30 Minutes" (video drip course).

### 1.2 Distribution surfaces

1. Web dashboard (`dashboard.spotgamma.com`) — SPA; routes observed in docs: `/home`, `/trace`, `/hiro`, `/equityhub` (`?eh-model=legacy|synthoi`), `/indices?sym=SPX…`, `/ivol?tab=…`, `/tape`, `/scanners`, `/optionsCalculator`, `/foundersNotes`, `/canvas`, `/integrations?tab=…`, `/sentiment?tab=equity_pc_ratio`.
2. Email (Founder's Note AM 5:30–8:30 ET, PM 4:00–7:00 ET).
3. **Bloomberg Terminal app** — HIRO ships in Bloomberg App Portal (`APPS SPOTGAMMA <GO>`, live since ~Sept 2023, separate support portal `support.bloomberg.spotgamma.com`) [DOC]. This is their institutional beachhead.
4. **Futures-platform "cloud notes"**: SG levels streamed/imported into Bookmap (CloudNotes column), NinjaTrader, Sierra Chart, Jigsaw, eSignal, TradingView, EdgePro, thinkorswim. Levels published in SPX terms; ES/NQ/RTY/YM conversions provided; futures-platform levels update daily (some docs: pre-market).
5. Discord community (both tiers; weekly "Top-5 Gamma Squeeze Candidates" drop Mondays 8:30 ET).
6. **API: none.** Support explicitly says a public API is "not yet available"; only export is a CSV download button above the Equity Hub grid [DOC]. → A real API is an open flank (see §12).

### 1.3 Data plane (as disclosed)

- Inputs: **OPRA** consolidated feed + direct US options exchange feeds; everything else (GEX, HIRO, levels, DDOI) is computed in-house [DOC].
- They describe ingesting "dealer positioning information" into the TRACE Options Inventory Model [DOC in TRACE manual] — [INF] this is trade-classified OPRA prints (aggressor side + participant-type heuristics), not any private feed; OPRA has no participant field, but OCC/exchange open-close data by account origin (customer/firm/BD/MM) is commercially available and would explain their "Customers / Pro Customers / Firms / Broker Dealers / Market Makers" participant lenses.

### 1.4 Update cadences (documented, per surface)

| Surface | Cadence |
|---|---|
| Equity Hub levels + DPI | daily **3:00 AM ET** |
| Synthetic OI model | daily, before open |
| Total OI model | nightly (new OI ~12AM) |
| TRACE data | support copy: "every 1 minute"; 2024 manual: heatmap snapshots + timeline replay every **10 minutes** — [INF] strike plot/HIRO ~1-min, inventory heatmap 10-min frames, copy later upgraded |
| HIRO | real-time (tick-aggregated); 5-day history retained |
| HIRO trending list | every 15 min |
| Tape highlights | ~every 30 s (measured from prior close) |
| Founder's Note | 2×/trading day (AM emphasized: fresher OI) |
| OCC indicator | weekly (weekend refresh; history to 2018) |
| Equity Hub history tab | 30 trading days (Synthetic), 10 days (Total OI) |
| Stability gauge | live 9:30–15:30 ET only |

---

## 2. Dealer-positioning model — the core IP

Two model families coexist; every product is a view over one of them.

### 2.1 "Total OI" (legacy) model — assumption-driven
- Pulls full open interest, applies "some SpotGamma adjustments," and **assumes dealers are short every option** for single stocks [DOC].
- For **index products** the assumption flips to the street-standard structural book: **dealers short puts / long calls** (rationale: collars + covered-call overwriting dominate index customer flow, so index call gamma is modeled positive to dealers and put gamma negative) [DOC — DDOI + Call Gamma glossary].
- Single stocks in Equity Hub: dealers modeled short **both** puts and calls (collars/overwrites less common) [DOC].
- They openly frame DDOI (dealer-directional open interest) as unknowable and estimated; edge comes from dealers hedging mechanically every day while customers mostly don't [DOC].

### 2.2 "Synthetic OI" / Options Inventory Model — flow-classified
- Newer model (powers TRACE and the Equity Hub Synthetic lens): "eliminates assumptions" by classifying each transaction using multiple data feeds + proprietary algorithms to track **who bought vs sold** ("customer long/short positioning") [DOC].
- Produces **signed, per-participant inventory**: user can pick **Market Makers (default), Customers, Pro Customers, Firms, Broker Dealers** in TRACE/strike plot [DOC].
- Consequence surfaced in UI: Equity Hub can show **negative OI** — sign = direction of estimated dealer exposure at the strike (positive = MM net long that contract) [DOC].
- Adds two synthetic-model-only levels per ticker: **High Volatility Point** (most negative gamma strike) and **Low Volatility Point** (most positive gamma strike) [DOC].
- "Model-free" counterweight: **Combos** and **HIRO** are described as passive measurements that don't lean on dealer assumptions [DOC].

### 2.3 GEX formula (published)
- `GEX = gamma × OI × 100 × spot²` summed per strike/expiry; calls signed positive, puts negative; net = Net GEX, expressed as $ notional to transact per 1% move [DOC — glossary "GEX Explained"]. (Note: their published formula uses spot² — i.e., the per-1%-move dollar convention with the extra ×0.01 folded in or omitted depending on the article; treat scaling as presentational.)
- Regime semantics: +GEX = dealers dampen (sell rallies/buy dips); −GEX = dealers amplify. Marketed as regime indicator, explicitly *not* directional.

---

## 3. Key-levels dictionary (every named level, with methodology)

All definitions below are from their glossary/support docs, paraphrased.

| Level | Definition / computation | Usage semantics |
|---|---|---|
| **Call Wall** | Strike with largest **net call gamma** (older copy: largest call OI) for the underlying — index: also computed across the ETF/index complex | Major resistance; ceiling of expected range; breach → level becomes magnet/support and wall re-strikes higher within days. Movement of the wall up/down is read as bullish/bearish signal |
| **Put Wall** | Strike with largest **net put gamma** (older copy: largest put OI) | Major support; floor of expected range; breach = regime warning (gamma of deep-ITM puts collapses → support evaporates) |
| **Zero Gamma / Gamma Flip** | Spot level where modeled net dealer gamma crosses 0 (inflection of the gamma profile curve) | Regime line, *not* S/R; "eye of the storm" — feedback loops need distance from it |
| **Volatility Trigger™** | Proprietary level *below* Zero Gamma where bearish hedging feedback is modeled to ignite; "last major support above the Put Wall" | Below VT → RV expands (their stats: avg 5-day RV 13% above vs 18% below; 1-day return σ 0.9% vs 1.3%) [STAT] |
| **Hedge Wall** | Single-stock analog of the Vol Trigger: spot level where dealer risk exposure changes sign/regime; above it mean-reversion favored, below it momentum | S/R + volatility-regime line for stocks |
| **Absolute Gamma (Strike)** | Strike with largest total gamma, computed as \|call gamma\| + \|put gamma\| (index-only metric) | Stickiest pin/magnet; typically near Zero Gamma; OPEX magnet |
| **Key Gamma Strike** | Stock-level strike with largest combined gamma magnitude | Tactical nearest-magnet; more immediately relevant than walls in calm regimes |
| **Key Delta Strike** | Stock-level strike with largest total delta | Can sit outside the walls when heavy ITM positioning; ITM Key Delta Strike flags post-OPEX reversal risk (hedge unwind) |
| **Large Gamma Strikes 1..n** | Index version of Key Gamma Strike; several published, ranked by size | Intermediate S/R rungs between walls |
| **Combos (1–5)** | Model-free merged gamma hotspots across paired ETF+index chains (SPY+SPX, QQQ+NDX, IWM+RUT, DIA+DJX), ranked 1=strongest; mapped to ES/NQ/RTY/YM prices for futures users | Strongest cross-complex S/R; streamed as cloud notes |
| **SG Implied 1-Day Move (± band)** | Proprietary 1σ next-day range, explicitly **not** an IV read — fitted on decades of historical data | Published for SPX/SPY/QQQ/NQ/RUT; SPX closes inside it 76% of days; intraday break-rate 65% held [STAT] |
| **SG Implied 5-Day Move** | Same methodology, 5-day horizon | Weekly range framing |
| **SIV Index (curve)** | "SpotGamma Implied Volatility": projected expected-move % as a function of spot shift — i.e., a spot→vol response curve; feeds the vanna model | Anticipates vol expansion/compression as market moves |
| **Gamma Index™** | Daily oscillator **−4…+4** ranking total market gamma; computed from modeled MM P&L rather than raw notional | Regime dial in Founder's Note |
| **Gamma Notional / Net Gamma** | Σ call gamma − Σ put gamma ($MM) | Sign = vol regime; reported daily |
| **CP Gamma Tilt** | total call gamma ÷ total put gamma (gamma-weighted P/C) | Rising = bullish, falling = bearish |
| **Delta Tilt / Net Delta** | call delta ÷ put delta; and Total Call Delta − Total Put Delta | Exhaustion/reversal reads; large expiring net delta → unwind risk |
| **Gamma/Delta in Next Expiration (%)** | Share of total gamma/delta expiring at next expiry; >25% flagged as concentration | OPEX un-pinning setups; >30% powers two scanners |
| **Top Gamma / Top Delta Expiry** | Expiration date holding the most gamma/delta notional | Event mapping |
| **High/Low Volatility Point** | Synthetic-OI-only: most-negative / most-positive gamma strike | Intraday accel vs pin zones |
| **Reference Price / VIX Ref** | Spot & VIX at model-calc time; all levels are conditional on it | Staleness disclosure — worth cloning |
| **25D Risk Reversal** | IV(25Δ call, 30d) − IV(25Δ put, 30d) | Sentiment skew gauge; feeds Compass rank |
| **SDEX / TDEX** | Nations SkewDex / TailDex (licensed third-party skew & tail-cost indices) | Referenced in vol commentary |
| **DPI (Dark Pool Indicator)** | Short/off-exchange activity read from FINRA-reported dark-pool prints; %DPI = shares sold short (dark + lit) ÷ shares outstanding; 5-day averages; color-graded | >60 bullish next-60-day tendency, <30 bearish [STAT]; two scanners |

**Published hit-rate stats (2018–2024 SPX sample)** [STAT — their "SPX Key Levels Statistics" article]:
- Call Wall: intraday high stayed below it 83% of sessions; close below 88%; post-breach forward returns ≈ flat (−7 bps 1-day, +5 bps 5-day).
- Put Wall: intraday low held 89%; close above 93%; post-breach 1-day +14 bps, 10-day +39 bps.
- Vol Trigger: RV/σ splits as in the table above.
- These stats are the backbone of their sales pitch → we need an equivalent, continuously-computed scorecard.

---

## 4. HIRO — real-time hedging-impact indicator (deep dive)

**What it is** [DOC]: HIRO = "Hedging Impact of Real-time Options." For every option trade on a symbol, it estimates the **signed delta-notional hedge** the trade forces onto dealers, and aggregates that into a running intraday line plotted against price. Positive slope = flows forcing dealer buying (customers buying calls / selling puts); negative = dealer selling (call selling / put buying).

**Computation details (documented):**
- Universe: **400+** stocks/ETFs/indices with active options (additions by request). Aggregate tickers exist: "S&P 500" = SPX+XSP+SPY+ES combined; "S&P Equities" = sum of single-stock components' HIRO.
- Units: **$ delta notional** (per-trade estimated hedge requirement, summed).
- **Rolling window** setting = lookback over which per-trade impacts are summed (explicitly analogized to an SMA): 1m, 5m, 10m, 30m, 1h, 4h, 1d. Short = 0DTE scalping; long = day-trend.
- **Filters/decompositions:**
  - *All Trades* — all options for the symbol, **minus trades their logic classifies as pre-hedged/non-impactful** (documented proprietary exclusion — important: HIRO is not raw tape).
  - *Next Expiry* — separate line isolating nearest expiration (0DTE/weekly).
  - *Put/Call split* — puts line (dark blue) vs calls line (orange); combinable with Next-Expiry.
  - *Total* — single net line.
- **Chart shell:** price candles + HIRO line(s) with second Y-axis; key-levels overlay (Call/Put/Hedge Wall); timezone / RTH-vs-ETH / % / log / auto-scale controls; extra TA indicators (RSI, MACD, …) can be applied *to the HIRO series itself* — a genuinely good idea; 5-day lookback via calendar.
- **HIRO Signal gauge (screener + top-card):** gray bar = 30-day min–max range of the signal; inner colored segment = 5-day range; dot = today, colored red/yellow/green by sign, dark shading when pinned at day-extremes. Used to normalize "is today's flow unusual *for this name*".
- **Flow Alerts:** per-symbol dynamic **impact threshold**; alert fires when a flow's estimated hedging impact breaches it. Delivered on-chart (as a chart indicator "SpotGamma Alerts"), in an alert log pane (All vs Watchlist), and via bell icon. Companion alerts: Call/Put Wall *breached* and *within 1%*.
- **Published behavioral stat** [STAT]: after a flow alert, when flows "shut off," price reverts ~**70%** of the time — their flagship mean-reversion claim.
- **Documented playbooks:** fade flow-flatline at walls (sell 0DTE spreads at/beyond wall); trade with flow while slope persists; ITM 0DTE spreads against sharp HIRO spikes confirmed by largest prints in the flow table below the chart.
- Bloomberg app = HIRO only (plus alerts), separate Zendesk.

**[INF] engineering reconstruction:** per-print signed delta ≈ Δ(contract) × size × 100 × spot × side-sign(aggressor via NBBO quote-rule), with a hedged-trade classifier (e.g., tied prints, multi-leg delta-neutral packages, dividend/box structures) zeroing out non-impactful volume; window sum + downsampling to ~1s–1m bars for the UI.

---

## 5. TRACE — SPX dealer-inventory heatmap (deep dive)

**Concept** [DOC]: 2-D field over (time-of-day × strike) showing modeled hedging pressure from the Options Inventory Model, next to a live strike plot; sold as "where hedging will kick in," refreshed intraday, with 5-day forward projections for swing traders.

**Layout:** left = **Strike Plot**, right = **Heatmap**; RTH only (9:30–16:00 ET).

**Strike Plot lenses** (per selected participant): GEX by strike ($ notional at current spot; blue=+MM gamma, red=−MM gamma), OI by strike (contracts, calls orange/puts blue), **Net OI** by strike (signed net of MM long/short). Toggles: 0DTE-only filter; "strike-bar dots" ghosting values from 10/30/60-minutes ago; tooltips with percentile-vs-lookback, daily min/max.

**Heatmap:**
- X = session time (manual: 10-min frames; support copy: 1-min data), Y-left = strike, Y-right = HIRO scale, color = $ notional delta (Delta/Charm lens) or gamma (Gamma lens).
- **Model dropdown = 3 lenses:**
  1. **Gamma** — expected local RV: blue = +MM gamma (pin/compress), red = −MM gamma (accelerate), white/black = neutral transition. Pin at EOD in blue zones; vol in red.
  2. **Delta Pressure** — net change in dealer delta positioning across price/time: blue = hedge-buying zone, red = hedge-selling; interpretation *conditional on gamma regime* (S/R in +gamma; accelerant in −gamma). Contours mark zone borders / closing-level guides.
  3. **Charm Pressure** — time-decay-driven dealer flow (0DTE-heavy): red = options passively gaining value → dealers sell futures; blue = passively losing value → dealers buy. EOD tactic: spot migrates to where +charm and −charm meet; pin between red/blue pockets near +gamma nodes.
- **Overlays/controls:** Stability gauge; key-levels toggle; candle interval 1/5/15m; Y-zoom; calendar (history replay any prior day; HIRO overlay only 5 days back; **forward dates = 5-day projection**); full-screen; settings (custom hex colors for ± delta; scale range auto/low/med/high; HIRO overlay symbol S&P-500 vs S&P-Equities vs none; color-scale + contour toggles; stats lookback 30/60/90d; light/dark; strike-dots).
- **Timeline slider** replays inventory evolution through the day (10-min steps) — the "timelapse" UX.
- **Stability (score) gauge:** proprietary forward-looking % gauging likelihood of a large move in the **next 10 minutes** (higher = calmer); live 9:30–15:30 only; formula undisclosed.
- **Participant switch** (2026 docs): Market Makers / Customers / Pro Customers / Firms / Broker Dealers — flips the sign/POV of the whole surface.
- ES workflow: docs teach SPX↔ES basis conversion; TRACE is pitched as the primary ES-futures tool.
- **Dark pool / "inverted" toggles:** *not documented anywhere in the crawled help center or the 2024 manual.* DPI (dark pool) lives in Equity Hub, not TRACE. [INF] the request's "inverted toggle" likely maps to the participant switch (customer view is ≈ inverse of MM view) and/or the color-customization; flag as unverified.

**[INF] build recipe:** maintain intraday synthetic inventory per (strike, expiry, participant); for each 10-min frame and a grid of hypothetical spot levels, revalue book Greeks (gamma/delta/charm) at that spot; render $ notional as color field; project forward frames by decaying time-to-expiry with inventory frozen (their "5-day forward projection").

---

## 6. Equity Hub — per-ticker positioning workstation

- Coverage: **3,500+** stocks/ETFs/indices; two model lenses (Total OI vs Synthetic OI); daily refresh (3AM ET), live price on charts.
- **Options Impact gauge** — headline dial: size of gamma exposure relative to the stock's notional trading volume; green = options big enough to drive spot (levels reliable), red = stock volume dominates (levels weak). Explicitly qualitative. Pairs with HIRO gauge to filter "which names respect their levels today."
- **Charts (per lens):**
  - **Composite View** (default): X = strike/price; Y = *SG Acceleration Indicator* (Synthetic) / *SG Momentum Indicator* (Total) = rate-of-change of gamma → spike = expected vol. Green/red field = calls vs puts dominance per strike (dark = strong, white = neither); blue outline line = yesterday's options activity intensity. Key levels annotated (Hedge Wall, Key Gamma/Delta strikes visible here).
  - **Put & Call Impact**: per-strike bars + cumulative curves. Lenses: Gamma (bars: total/put/call gamma by strike; curves: cumulative ATM-MM-gamma with 5 toggles — total, next-expiry, monthly, total−next, total−monthly), Delta (same structure for delta), OI (total OI / day-over-day ΔOI / net positioning bars, calls vs puts). Total-OI variant: put & call gamma-RoC curves + all-expiry vs next-expiry bar overlay; steep curve = fast gamma change = vol.
  - **Live Price & SG Levels**: intraday price vs level lines; Synthetic version adds 4 lenses (gamma / delta / OI / net positioning by strike) beside live tape; Total version shows call (orange) / put (blue) gamma bars.
  - **Risk Reversal chart**: stock's skew position → extreme skew = potential reversal setup.
  - **Skew chart** (Total lens): IV vs delta axis (puts left of 50d, calls right), 30-day line (green) + next-expiry line (blue) + yesterday's dashed pair; neutral/bearish/bullish skew reads.
  - **History tab**: full metrics table time series (30d Synthetic / 10d Total), incl. 1M RV and RV Rank.
- **Equities Table** (screener grid): five color-coded column families — Ticker info (price, prev close, volume, 52wk, earnings date); **SG Key Daily Levels** (Key Gamma Strike, Key Delta Strike, Hedge Wall, Call/Put Wall, call/put gamma, next-expiry gamma%/delta% [25% threshold], top gamma/delta expiry, call/put volume + next-expiry shares); Directionals (P/C OI ratio, gamma ratio, delta ratio, volume ratio); **Volatility Insights** (NE skew, 30d skew, 1M RV, 1M IV, IV Rank, **Garch Rank** — proprietary vol-vs-30d percentile ignoring event volume, Skew Rank, options implied move); Dark-pool block (DPI, %DPI volume, 5-day versions). Sortable/filterable; CSV export.
- **Alerts:** real-time Call-Wall/Put-Wall touch alerts per ticker, deep-linking to the live chart.
- Watchlists shared across HIRO/EH; scanner-driven name selection.

---

## 7. Indices page (per-symbol: SPX, SPY, NDX, QQQ, RUT, IWM)

Census of the 18 documented modules: Real-Time Updates (live price vs nearby SG levels); Gamma Model (gamma-vs-spot curve, today + next-expiry lines; slope = vol); **Delta Model** (delta-notional vs spot; current vs next-expiry divergence = expiration risk); **Vanna Model** (delta curve with IV held flat [gray] vs IV shifted per SIV model [purple]; gap = vanna flow magnitude); SIV Index (expected-move% vs strike curve); Absolute Gamma histogram (per-strike call/put gamma, current/next expiration filters); **Combo Strikes** (ETF+index merged gamma by strike); Expiration Concentration (delta notional per expiry, 2yr horizon); Concentration Table (per-expiry calls/puts/gamma/delta notional & absolute; >20% expiring = turning-point heuristic); Strike Table (same per-strike for next expiry); Gamma & Delta Tilt time series vs price (extremes = reversal timing, more weight to lows); Historical Chart (price vs Call Wall/Put Wall/Vol Trigger through time); 0DTE Volume/OI (0DTE% of volume [white] vs next-expiry OI share [pink] — speculation gauge); Equity P/C Ratio (volume vs OI lines; gap = day-trading speculation); Realized Vol multi-window; Price vs 2M/6M RV ratio (CTA/institutional proxy); Return histograms (5d red vs 30d blue distribution shift); OCC weekly indicator (open/close, contracts/premium, bought/sold, **retail vs institutional via transaction-size filter**, history to 2018).

---

## 8. Volatility Dashboard (Alpha)

- **Fixed Strike Matrix**: real-time IV grid (strike × expiration). *Statistical Mode* (default): cell color = **Z-score of today's IV vs trailing 30/60/90-day mean** for that cell (red = cheap vs history, green = rich); off-mode = relative "teal" shading across today's surface only. *Skew Premium* mode prices the skew-attributable premium per cell. *Show Highlights* draws borders around cells mispriced **vs adjacent cells** (neighbor-relative arbitrage flags). *Compare Mode*: IV diff between two dates; historical mode plots date-vs-date. Controls: zoom, expiration-range cap, %OTM cap, prune illiquid strikes/expiries, center-on-spot.
- **Term Structure**: ATM IV vs expiry (or DTE); overlays: **Forward IV Adjustment** (time-adjusted fair-IV line — above market IV = event underpriced), **Statistics cone** (10th–90th pct of historical IV at same DTE), **Economic Events** flags; add prior-date curves; real-time today / EOD history.
- **VIX Term Structure**: VX futures curve, contango/backwardation framing, multi-date compare.
- **Volatility Skew**: single-expiry smile; X-axis = moneyness / fixed strike / delta; statistics band (10–90th pct at same DTE, lookback 30/60/90d); multi-expiry overlay incl. same-DTE-different-date comparisons.
- Documented playbooks: pre/post-event condor & calendar construction validated by the cone and skew percentile positions.

---

## 9. Compass & Scanners

- **Compass Guided View**: 2-D scatter of any watchlist/scanner names — axes fixed to **IV Rank** (volatility expectation, y) × **Risk Reversal Rank** (directional skew, x), each ranked vs the name's own trailing year. RR = IV(25Δ call 30dte) − IV(25Δ put 30dte). Quadrant semantics: high-RR-rank = calls rich (fade with call-spread sales / puts), low-RR-rank = puts rich (sell put spreads / buy calls); tooltips embed nearby SG levels + conservative setup text; color coding customizable.
- **Backtest disclosures** [STAT]: 1yr, 3,500 names — forward returns highest when RR-rank < 0.2; lowest when RR-rank > 0.6 & IV-rank > 0.6; 10-day forward vol highest when IV-rank > 0.8 & RR-rank < 0.2; lowest when IV-rank < 0.2.
- **Explorer View**: free-form scatter — choose any x/y from the scanner table + extra fields (call-skew %ile, put-skew %ile, IV %ile, RR %ile, **proximity-to-call-wall / put-wall** [broken-wall names pinned to grid border], RSI, Bollinger %); z-axis = dot size; saved configurations.
- **History trails:** not documented in the crawled articles — [INF] absent or undocumented; treat "trails" as our differentiator, not parity.
- **15 Scanners** in 4 groups: Proprietary (**Volatility Risk Premium** = unusually expensive options; **Squeeze** = short interest + gamma + options volume composite), Bullish (Most Call Gamma; Lowest P/C; Gamma Squeeze curated list; Bullish DPI>60), Bearish (Most Put Gamma; Highest P/C; Bearish DPI<30), Variable (1% of Hedge Wall; 1% of Key Delta Strike; Top Gamma % expiring Friday ≥30%; Top Delta % expiring Friday >30%; Largest Delta Positions; **High Impact** = names whose price is options-driven and respect levels).

---

## 10. Tape, FlowPatrol, Founder's Note, Calculator, Canvas

- **Tape** (flow feed, 3,000+ tickers): Highlights row (Top options volume / Top daily gamma notional / Top daily movers / Largest trades by premium; ~30s refresh) → Filters (savable) → Summary charts (volume/premium/delta/gamma/vega, puts vs calls, aggregated over current filter) → Flow Data stream (per-print rows; **Sweep / Cross / Block / Multileg** flags; above-ask/below-bid conviction reads) → Contract Data rollup (per-contract volume/premium/Greeks). Same flow panel is embedded under the HIRO chart so prints can be matched to hedging impact.
- **FlowPatrol** (daily report, both tiers): Synthetic-OI-derived "most impactful trades of the day" — largest new positions with **bought-vs-sold disambiguation**, delta & gamma leaders, premium commitment, statistically-unusual volume/"extreme flow" flags, and an "algo-amplified names" caution list.
- **Founder's Note**: AM (pre-open) + PM (recap) commentary + SPX/index levels table (reference prices, walls, VT, gamma index, 1/5-day moves, gamma/delta notionals, call/put volumes); AM carries more weight (fresh OI). Statistics page (2018–2024) doubles as marketing.
- **Options Calculator** (both tiers): 15 strategy templates (long call/put, verticals ×4, iron condor/fly, call/put fly, calendars, diagonals, straddle); PnL chart with expiry line + T+n slider + **IV/skew shock scenarios** (market-IV line vs IV-adjusted line), draggable strike handles, SG key-levels overlay on the payoff chart (Essential limited to index levels), saved positions incl. stock legs, per-leg Greeks.
- **Canvas** (both tiers): grid workspace builder — Workspaces (multiple, autosaved) → Containers (tabbed up to 5 components, or single) → 30+ Components (any SG chart); **ticker Grouping** channels (color-tagged; changing ticker updates all grouped components); HIRO/Tape/TRACE capped at 2 instances per workspace (data-load guard).

---

## 11. UX patterns worth stealing (cross-cutting)

1. **Percentile-vs-self normalization everywhere** (HIRO 30d/5d gauge, IV z-score matrix, ranks vs own 1-yr history, strike-plot percentile tooltips) — every raw number ships with "is this unusual *for this name*".
2. **Ghost dots for temporal context** (strike plot values 10/30/60 min ago) — cheap, high-signal.
3. **Timeline replay slider** on the positioning surface (we already shipped a dated gex ladder replay; TRACE does it intraday at 10-min resolution).
4. **Regime-conditional interpretation baked into copy** (Delta Pressure zones mean S/R in +gamma but accelerant in −gamma) — the UI teaches the conditionality.
5. **Levels as a syndication product** (cloud notes into 8 charting platforms) — distribution moat independent of their own UI.
6. **Self-graded accuracy stats** (83/89% wall-hold rates, quarterly report card) — converts methodology into trust.
7. **Every support article ends in a trade recipe** (checklists + basic/intermediate/advanced examples per tool) — docs are an onboarding funnel, not reference.
8. **Reference-price/VIX-ref staleness disclosure** on every model output.

---

## 12. What to clone vs what to beat

### Clone (parity requirements)
- Full key-level set (§3) incl. Vol-Trigger/Hedge-Wall class "regime line" distinct from Zero Gamma; combo (ETF+index merged) levels with futures mapping; SIV-style historical expected-move bands; −4…+4 regime dial.
- HIRO-equivalent: signed delta-notional flow line w/ rolling windows, put/call & next-expiry decomposition, per-name dynamic alert thresholds, 30d/5d/today gauge, aggregate SPX-complex ticker.
- TRACE-equivalent: (time × strike) MM-inventory heatmap with gamma/delta/charm lenses, strike plot w/ 0DTE filter, stability score, key-level overlay, intraday replay + forward projection.
- Equity-hub-equivalent: per-ticker positioning page with dual model lenses, options-impact gauge, level table + history, wall alerts.
- Vol dashboard: fixed-strike z-score matrix + term cone + skew percentile bands; forward-IV mispricing line.
- Compass quadrant (IV rank × RR rank) + explorer scatter.
- Levels syndication (at minimum TradingView/webhook/CSV) + self-scoring stats page.

### Beat (their documented weaknesses → our upgrade lanes)
1. **No public API** and CSV-only export → ship a real levels/positioning API + webhooks day one (they explicitly punt).
2. **Batch cadence on equities** (3AM daily levels; 10-day/30-day history caps; 5-day HIRO history) → intraday level recomputation on single names, deep history (we already store multi-year gex history), and unlimited replay.
3. **SPX-only TRACE** → per-ticker heatmaps for the top-N option names (they only do SPX; single-name inventory surfaces are open field).
4. **Opaque provenance** (stability score & SIV "proprietary analysis") → publish confidence intervals + model cards; show inventory-classification confidence per strike (they expose no uncertainty).
5. **No positioning-change diffs/alerting beyond walls** → alert on level *migration* (wall re-strikes, VT crossings, gamma-flip distance), not just price-touches.
6. **Compass lacks trails/animation** (undocumented at minimum) → time-trailed quadrant paths + event annotations.
7. **Vanna/charm only as daily curves (indices)** → intraday vanna surface + IV-shock scenario slider unified with the heatmap (they keep SIV/vanna on a separate static page).
8. **0DTE**: they filter 0DTE on strike plot & next-expiry HIRO — we can add 0DTE-only walls/flip levels recomputed intraday and 0DTE charm-decay countdown visuals.
9. **Their hedged-flow filter is a black box** → expose "impactful vs hedged volume" split as a first-class metric (e.g., impact ratio per name/day).
10. **Bundle economics:** $299/mo gates the entire real-time suite behind one tier → modular pricing and/or a cheaper real-time single-name tier undercuts them.

---

## 13. Verification notes & open gaps

- Everything in §§1–10 is grounded in the crawled help-center corpus (417 articles, saved locally at the session scratchpad `sg/` dir with per-category text dumps) and the public TRACE manual PDF; corporate facts from spotgamma.com/about via search snippets.
- **Unverified / not found:** TRACE "dark-pool" or "inverted" toggles (absent from manual + support center — possibly post-2024 UI or a misattribution); Compass history trails; exact stability-score and SIV formulas (undisclosed by design); HIRO per-trade classification rules (proprietary); whether "1-minute TRACE updates" applies to the heatmap frames or only strike plot/HIRO; founding year (about-page says 2020; some coverage implies 2019).
- **Internal contradictions in their own docs (useful for competitive copy):** wall definitions oscillate between "largest OI" (older articles/alerts copy) and "largest net gamma" (newer SEO articles); Equity Hub cadence stated as both "3AM daily" and "refreshes throughout the trading day"; Synthetic-OI availability stated as Alpha and "Alpha annual only" in different articles.
