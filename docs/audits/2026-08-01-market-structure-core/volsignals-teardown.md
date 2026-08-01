# VolSignals / VS3D — Engineering Teardown (2026-08-01)

Research agent report for the Mastermind Terminal dealer-positioning / gamma-structure suite.
Everything below is paraphrased from public sources; no verbatim marketing copy or assets are
reproduced. Claims are tagged **[DOC]** (documented on their site/docs/threads/search results
retrieved 2026-08-01) or **[INF]** (inference — plausible reconstruction, verify before relying).

Sources surveyed: volsignals.com (home, pricing, vs-pro, rtm, blog), vs3d.volsignals.com
(home + FAQ, getting-started, docs, docs/gradient-chart, release-notes), the third-party-hosted
VS3D onboarding guide (vs3d-onboarding-webinars.netlify.app — an extremely detailed 7-chapter
methodology walkthrough authored by the founders), VolSignals Substack archive, X/@VolSignals
threads (via ThreadReader + search snippets), YouTube listing, and secondary coverage.

---

## 1. Who they are — positioning in the market

- **Identity [DOC]:** "The only dealer hedging-flows platform built by actual market makers."
  Their entire moat pitch is *provenance of people + provenance of data*: ex-market-makers using
  exchange clearing data, vs competitors (SpotGamma/MenthorQ-style) inferring dealer positioning
  from open interest + sign heuristics.
- **People [DOC]:**
  - **Daniel Roos ("Dan")** — former lead index trader and youngest capital partner at Belvedere
    Trading (SPX market-making desk 10+ years; traded through 2008, Feb-2018 Volmageddon, Mar-2020).
    Runs the intraday 0DTE dealer-flow commentary.
  - **Matthew Nadel ("Matt")** — ~30 years equity-derivatives across JPM, Morgan Stanley, SocGen,
    RBC, Credit Suisse, UBS; SPX/VIX books; runs the institutional vol-surface commentary.
  - **Nick** — single-name options trader (MacroVoices / Optionfinity affiliation) inside VS Pro.
  - **"Carson"** — the historical voice of the @VolSignals X account and Substack (Quora profile
    "Carson at VolSignals"; described as a career SPX specialist with 25+ yrs derivatives
    experience). **[INF]** Carson appears to be the newsletter/social persona; Roos + Nadel are the
    public product founders. Treat the exact org chart as unverified.
- **Scope [DOC]:** SPX + VIX index options ONLY. No single names, no ETFs, no futures options.
  They explicitly frame SPX+VIX as "the two instruments that matter" for institutional hedging.
  This narrowness is a deliberate positioning choice, not a data limitation.

---

## 2. Product census & pricing

| Product | Price | What it is |
|---|---|---|
| **VS3D Standard** ("VS3D Data") | **$299/mo**, 7-day free trial, month-to-month | The analytics app: dealer positioning + Greek surfaces for SPX & VIX. 3-month historical lookback, positions visible on expirations ~6 months out, Discord, "daily market maker perspective." Activation "within 5 minutes of purchase." [DOC] |
| **VS3D Pro Bundle** | not publicly priced (upsell tier) | App + expert layer: daily positioning reports, real-time commentary, alerts, key levels, price targets. [DOC — FAQ mentions the tier; price unlisted] |
| **VS Pro** (Active Trader) | $300/mo, $790/qtr, $2,790/yr | Human desk-as-a-service: premarket Zoom each morning (overnight flows, institutional positioning, key levels), Dan's intraday 0DTE dealer-flow commentary, Matt's intraday vol-surface commentary, single-name ideation, in-Discord SPX live-Greeks modeling + historical/current SPX vol-surface analytics, "Market Movers" institutional flow highlights, weekly office hours/AMAs. [DOC] |
| **RTM ("Return To Mean")** | $285 for a 5-day trial (ongoing price unlisted) | Joint venture with "TradingClosed": 9:30–4:00 ET live stream combining their dealer-profile model ("VS model") with a swaps-complex/delta-1 leading-indicator model ("TC model") tracking MMs, ETF APs, pension funds, insurers across derivatives/swaps/OTC. [DOC] |
| **VolStudies** | $997 one-time | Video-guided walkthrough of canonical options texts (Natenberg), apprenticeship-style, with community + practitioner Q&As. [DOC] |
| **VIP Mentorship** | $10,000 one-time | Direct mentorship by the ex-MM founders, hundreds of hours of video, private calls, mentorship-only Discord. [DOC] |
| **Free newsletter** | free, Sundays | Weekly digest of institutional research highlights + commentary; the Substack is the marketing top-of-funnel. [DOC] |

Packaging observations:
- The app (VS3D) and the human layer (VS Pro) are **separately priced ~$300 items** — a serious
  subscriber pays ~$600/mo. Education is one-time high-ticket. [DOC]
- "Something Big is Coming" waitlist on the pricing page (unspecified — [INF] likely the Pro
  Bundle or new asset coverage). [DOC that the teaser exists]

---

## 3. The data methodology — their core differentiator

This is the part worth understanding precisely, because their entire product identity hangs on it.

### 3.1 Source: exchange clearing / signed participant volume
- **[DOC]** VS3D consumes **CBOE + OCC exchange-level clearing data with participant-type
  attribution** — the onboarding guide describes "tens of thousands of CBOE C1 signed
  participant-volume files" and the June-OPEX blog post calls it "paid CBOE data showing who
  actually bought and sold, not just open interest."
- **[DOC]** Participant categories surfaced in-app: **Market Maker, Firm, Broker-Dealer, Customer,
  Pro Customer** (default view = Market Maker). This matches the CBOE Open-Close /
  origin-code taxonomy (M/F/B/C/Pro). **[INF]** The product is almost certainly built on CBOE
  DataShop's intraday Open-Close (buy/sell by origin, by series) feed for C1, plus OCC series
  reference data — that's the only commercial feed with this exact shape.
- **[DOC]** Position construction: **iterative build-up from each contract's inception** —
  cumulative signed volume per series per participant class from listing day to now, i.e. a
  reconstructed inventory ledger, not a snapshot heuristic. Coverage includes FLEX options and
  expirations "through 2030+."
- **[DOC]** "Net hedgeable quantity": they net out MM-to-MM volume; example given — 120k contracts
  trade on a strike but only ~1% ends up as actual dealer book imbalance. The bars shown are
  actual net contracts held, NOT a Greek ("these positions are not gamma... these are actual
  options contract totals").
- **Key rhetorical claim [DOC]:** "The exchange tells you the answer — there's no guessing." Their
  standing attack on competitors: OI-based GEX with naive sign assumptions (customer-long-call /
  customer-long-put heuristics) mis-signs large chunks of the book; VS3D models "from the
  positions up" so gamma/charm/vanna reflect true net long/short per strike per contract.

### 3.2 Update cadence — 10 minutes, deliberately
- **[DOC]** Data updates **every 10 minutes** during RTH. They explicitly refused 1-minute
  updates: CBOE's 1-minute open-close series has specification errors that **compound** in a
  cumulative-inventory model. Anecdote from the onboarding guide: a cohort that switched to
  1-minute data saw signal win rates drop from ~80% to 50–60%, recovering when reverted to
  10-minute. This is a rare public admission that cadence > freshness in inventory models.
- **[DOC]** Each data arrival triggers re-simulation of the whole surface; compute takes 30–50s.
- **[DOC]** Pre-market: since Apr 2026 a **synthetic SPX price feed** approximates the index for
  pre/post-market; candles start 8:30 ET (accuracy improved May 2026).

### 3.3 Greek computation — "model" vs "simulated"
- **[DOC]** Greeks computed over the **entire SPX complex, 0–231 DTE** (they repeatedly stress
  modeling out to ~a decade of expirations rather than a single expiry's OI).
- **[DOC]** Two Greek families:
  - **Model Greeks** — instantaneous Black-Scholes partials.
  - **Simulated Greeks** — finite-difference on the full book: bump spot ±$5 and measure delta
    change (simulated gamma); advance the clock 5 minutes and re-measure delta (simulated charm).
    Purpose: complex structures (iron condors, "fishbones") produce alternating-sign model Greeks
    that cancel in practice; finite differences give the "effective" Greek over a tradable range.
  - **[DOC]** Release note 2026-05-31: simulated gamma/charm were REMOVED from the UI ("minimal
    differentiation from model Greeks") and replaced with **"Delta Change"** — the difference
    between current and simulated position delta at future timepoints × prices, marketed as the
    "path of least resistance" view (gamma + charm combined). Lesson: they iterated to a single
    fused forward-delta metric rather than exposing every raw Greek.
- **[DOC]** Units/conventions taught to users:
  - Gamma "bank convention" = $ exposure per 1% move; "exposure convention" = futures per $1 move
    (SPX multiplier 100, E-mini divisor 50). Tooltips show "S&P units" (BS gamma of the book).
  - Charm: exposure × −2 = hedge quantity per 5 minutes; charm peaks in the 15–25-delta band
    (ATM options "don't charm"); ~zero for 7+ DTE relative to 0DTE.
  - Vanna: peaks near 20-delta; two-way. Tracking metric: "1% vol-shift futures" — minis to trade
    per 1-point VIX move (e.g., ±6,700 minis).
  - Secondary Greeks referenced in the education layer: **speed** (dGamma/dSpot — gradient
    sharpness), **color** (dGamma/dTime — intraday profile drift), **volga**, and a
    "VIX-gamma → SPX-gamma via vanna transmission" concept for the VIX book.
- **[DOC]** Dealer-gamma magnitude heuristics they publish: ~$10bn notional = "normal" baseline;
  <$100M-scale ("light") = weak cushion; <25 ≈ "as good as negative"; true negative gamma occurs
  <10% of the time; end-of-day 0DTE gamma readings (e.g., $55bn) are asymptotic modeling artifacts,
  not actionable. Book swings cited in threads: $16bn+ → $6bn across two sessions.

---

## 4. VS3D app — UI/feature teardown

Web app (browser-only, no install). Nav: Home / Getting Started / Docs / Release Notes / FAQ.
Support = Discord + email. Two data modes everywhere: **Live** (streaming RTH) and **Historical**
(timestamp scrubbing / session replay). All [DOC] unless noted.

### 4.1 Positions by Strike (core view)
- Horizontal bar chart, one bar per strike: net MM contracts (calls+puts combined by default,
  "Total"), green/red = long/short (older material shows blue/yellow — scheme changed).
- Dashed line = current spot. **Blue dots = prior 9pm close state** per strike — the tell for
  "structural expiring OI" vs intraday flow (opening position tends to persist and drive hedging
  all day; intraday adds often revert by close).
- Filters: instrument (SPX/VIX), participant entity (MM default; Firm/Broker-Dealer/Customer/Pro
  Customer), expiration selector (default 0DTE; custom multi-select — isolate Tue/Wed/Thu, and
  **Friday split into AM (monthly OPEX SET-settled) and PM entries**), calls/puts/total.
- Position/candlestick display toggle; straddle lines overlaid (Mar 2026).

### 4.2 Gradient Chart (signature view)
- Live candlestick chart with a **continuous color-field background**: each pixel's hue+intensity
  encodes the selected Greek's value at that price level and time. Built by simulating the whole
  option surface across strike space "hundreds of times" per 10-min data drop.
- Greek modes: **Gamma, Delta, Charm, Vanna, Delta Change**.
- Annotation lines: red = local gamma maxima, blue = local gamma minima, dotted = inflection
  (gamma sign-flip) lines; contour lines toggleable at +/− boundaries. Straddle lines added
  Mar 2026. As the 0DTE straddle decays the dotted inflection lines visibly converge toward the
  pin target — the "collapse them forward" read.
- Display controls: gradient palettes (green/red default, blue/yellow, custom), reverse +/−,
  intensity curve (square root / power-law with exponent / arcsinh), background (dark/white/black),
  price line, grid lines, contour lines.
- Calibration guidance they ship: manual symmetric range (±250 anchored to ~$10bn baseline; move
  to ±500 if the regime baseline is ~$20bn), opacity ~35%, power ≈1.
- **What-if control: shift implied vol by +1% increments** and re-render the field (vanna
  scenario view).
- Historical playback: timeline scrubber over past sessions (3-month retention on Standard).
- Cross-view UX: synchronized crosshairs across gradient charts (Jun 2026), synchronized hover
  between Gradient Chart and Positions-by-Strike (Jul 2026), mobile-friendlier controls (Jun 2026).

### 4.3 Position Grid (matrix view)
- Strike (rows) × expiration (columns) heatmap of net position; white ≈ flat; color intensity =
  size; scrolls across the whole expiration calendar (~6 months of visible expirations; book
  modeled much further out).
- Strike bucketing (e.g., 25–50-pt buckets) to denoise; custom expiration filtering.
- Straddle lines/prices added to the grid (Jul 2026).
- Use case they teach: find crowded expirations, roll activity, cross-week structure (e.g.,
  Wednesday-strength/Friday-weakness setups into OPEX week).

### 4.4 Positions by Expiration (calendar view)
- Vertical bar chart of net positioning aggregated per expiration date (green above zero, red
  below). Roll tracking, temporal concentration.

### 4.5 Simulation Grid
- Table of simulated values (the finite-difference engine's raw output) — listed in docs under
  "Greek Profiles" alongside the Gradient Chart. Less documented publicly.

### 4.6 Custom Dashboard
- Drag-and-drop multi-panel workspace: tile any views, resize/rearrange, save/bookmark layouts,
  independent instrument/mode controls per panel.

### 4.7 Charm profile panel
- The onboarding guide's default home layout: Positions-by-Strike (left), Gamma gradient (right
  top), **Charm profile (right bottom)** — charm exposure across spot levels as time advances,
  i.e. the directional-decay pressure map.

### 4.8 Release-note timeline (velocity signal)
- 2026-03-24 straddle lines on Gradient Chart → 03-25 charm color inversion (negative charm =
  green) → 04-29 synthetic pre-market SPX feed → 05-21 synthetic feed accuracy → 05-31 Delta
  Change added, simulated gamma/charm removed → 06-01 docs site launched → 06-04 crosshair sync +
  polish → 07-13 hover sync → 07-21 straddle on grid. Cadence ≈ 1–2 meaningful releases/month;
  the product is young (docs only since June 2026) and still converging on visual conventions.

### 4.9 Not present (gaps) [DOC-absence, bounded by public docs]
- No API/programmatic access documented. No alerting inside the app (alerts live in the unpriced
  Pro Bundle). No single-name or ETF coverage. No mobile app (responsive web only). No
  TradingView integration. 3-month history cap on Standard. No published SLA on the 10-min feed.

---

## 5. The doctrine — models/levels/signals the product encodes

VS3D deliberately ships very few named "levels" (contrast SpotGamma's Call Wall/Put Wall/HIRO
branding). Instead it teaches a mechanism vocabulary. Census of every named concept found:

### 5.1 Test–Anchor framework (their core intraday model) [DOC]
- **Anchor** = cluster of strikes where dealers are net LONG options. Long-gamma dampens moves
  near it, and charm decay pulls price toward it late-day → attracts & pins ("magnetic").
  End-of-day target if the range holds.
- **Test** = strikes where dealers are net SHORT. Short options "can never pin" — gamma
  accelerates through them and charm pushes price away → they act as range boundaries that repel.
- Published prior: ~**65/35 containment odds** at a test level (probabilistic, not guaranteed);
  a decisive break inverts the charm profile.
- Range estimator: **spot ± 0DTE ATM straddle price**; straddle decaying = charm regime intact;
  straddle ticking up = vol repricing, charm signal void.

### 5.2 Position-structure quality taxonomy [DOC]
- **Clean structure** (shorts clustered at one level, longs at another; stable charm path) → high
  conviction.
- **Fishbone** (alternating long/short across adjacent strikes) → charm flips sign locally,
  degraded signal; resolves toward local charm peaks as the straddle decays.
- **Gappy** (sparse scattered lots) → "no-man's land," counterintuitively high vol, no conviction.
- Principle: "a position is stronger than any single option" — distributed structures (flies,
  spreads) dominate isolated single-strike bars.

### 5.3 Charm playbook [DOC]
- Intraday windows: 9:30–11:00 avoid (vol uncertainty + external flow); 11:00–13:00 flow settles;
  **13:30–15:00 sweet spot** (they later refined a 11:30–14:00 window — post-London-close, light
  volume); 15:00–16:00 gamma goes asymptotic/local — pin resolution only, exit 30–60 min before
  the close. Exception: in VIX 12–15 regimes late-day charm+pin is strong.
- Best environments: low vol, non-event days, "boring Fridays," summer/holiday tape, straddle
  must be decaying. Worst: macro event days, vol-repricing days, elevated vol-of-vol.
- Charm shelf-life: 0DTE ≫ 1DTE ≫ 7DTE (≈ nothing).

### 5.4 Vanna playbook [DOC]
- Vanna is the dominant force when positions have time left; two-way (vol up or down).
- Flagship setup: **post-VIX-spike vol bleed** — persistent IV decline over dealer short-put
  inventory forces sustained futures buying; "follow the vol train." Proxy for vanna strength:
  1-month skew percentile. VIX 20+ → vanna dominates; VIX 14–16 → negligible.
- The JPM-collar thread's core claim: apparent "pinning" at the collar's short-put strike is
  actually **vanna-driven drift** (vol up → dealers short puts sell futures → market walks toward
  the strike), NOT gamma pinning; at settlement the strike goes ATM, second-order Greeks flatten,
  and price violently resists sitting there. Directly contradicts the naive "max-pain magnet"
  narrative competitors sell.

### 5.5 OPEX / expiration-cycle mechanics [DOC]
- **VIXpiry Wednesday → SPX AM Thursday/Friday** sequencing tracked explicitly.
- June-OPEX blog: pins near big ITM-call strikes are "mechanical" (deltas→100 force dealer futures
  accumulation); post-expiry "dealers shed gamma, the leash comes off" and realized vol re-floats.
  Post-OPEX months are diagnosed by structure: "hedged everywhere, concentrated nowhere" = no
  clean range.
- Friday AM (SET-settled monthly) positions carry the bigger structural hedges → weight AM
  expiration more heavily approaching OPEX.
- Charm flows INTO OPEX = "temporal redistribution": hedge flow migrates across time as deltas
  bleed; the delta disappears by expiry.

### 5.6 Whale/flow tracking (newsletter layer, not in-app) [DOC]
- **JPM hedged-equity collar (JHEQX)**: quarterly roll reconstruction with exact legs — e.g.
  Sep-2023 roll: buy Dec-29-'23 3410/4050 put spread, sell 4500 calls, ~41,100 collars paired
  with 19,300 0DTE 4100 calls, ~$345M premium, executed at the close to match quarterly NAV,
  delta-neutral at trade. Ongoing tracking of the current short-call/put strikes as dealer
  gravity wells (e.g. the 6475 level in 2026). Scale context: ~35–41k contracts/leg ≈ $20bn+
  notional.
- **0DTE Iron-Condor "whale" / martingale program** (a.k.a. Captain Condor coverage): daily
  tracking of customer-short IC size and strikes (e.g., 32k × 5910/5915P + 6035/6040C, with
  width variants), martingale re-entry logic, and blow-up risk bands; they covered the Dec-2025
  ~$50M wipeout.
- **0DTE flow doctrine**: intraday 0DTE volume is mostly **internalized by specialist 0DTE firms**
  and produces little hedgeable footprint ("ephemeral"); expiring OI opened days ago is what
  actually drives dealer hedging. This is their answer to "why doesn't 0DTE volume show up as
  gamma?"
- **RTM layer**: swaps-complex / delta-1 desk indicators (ETF APs, pension, insurance,
  synthetics) as a second flow engine — [INF] likely futures-basis/swap-spread and EFP-adjacent
  signals; methodology not public.
- Vol-control/CTA flows: referenced in commentary (spot-up-vol-up regimes, systematic supply) but
  no published model of their own — they lean on the dealer book instead. [DOC-absence]

### 5.7 "Top 3 dealer hedging mistakes" doctrine [DOC]
1. Gamma is about **liquidity, not direction** — positive gamma isn't bullish.
2. **A position is not a Greek** — you must model the entire complex (all expirations), not read
   single-expiry position bars as gamma.
3. Structure the trade: into dense positive gamma use spreads/flies (containment pays); in
   negative/absent gamma use single-leg convexity; buy a lower strike and sell your target
   strike rather than buying the target outright. Gamma peaks are **exit targets, not runways**.

---

## 6. Marketing engine / content architecture [DOC]

- **X/@VolSignals**: long educational threads (dealer gamma explainers, pinning myth-busting,
  JPM roll live-tracking, daily "morning prep" slides from the VS Pro meeting). High-frequency,
  high-authority voice; threads regularly dunk on OI-inference GEX.
- **Substack (volsignals.substack.com)**: paid+free mix; titles are punchy/meme-adjacent
  ("SPX Cracks. Whale Cashes. $80b Bullet Dodged.", "Is that really it for Volmageddon 2.0?",
  "Nobody respects a copycat" — IC-whale copycat flows). Recurring franchises: OPEX previews,
  whale updates, VIXpiry recaps, "what have we learned" post-mortems.
- **YouTube**: explainer + product-demo hybrids ("Learn How SPX Option Hedging (Actually) Moves
  Markets", "Introduction to Dealer Hedging Flows", "$16B Just Disappeared...", "Trading Futures
  with VolSignals and VS3D?!"), each funneling to the 7-day trial.
- **Onboarding**: a 7-chapter narrated guide (Intro/Dashboard → Gamma → Charm → Positions →
  Trading with VS3D → From the Desk → Platform Reference) + webinars — effectively a free
  mini-course that doubles as methodology disclosure.
- Blog cross-posts MarketWatch coverage (Captain Condor, triple witching) for SEO/credibility.

---

## 7. Competitive read — VS3D vs the field

| Axis | VS3D | SpotGamma / MenthorQ style |
|---|---|---|
| Position source | Cumulative signed participant volume (CBOE Open-Close C1 + OCC), MM-vs-customer attribution from the exchange | OI + assumed customer/dealer signs, sometimes flow-adjusted |
| Products | SPX + VIX only | Broad (indexes, ETFs, single names) |
| Cadence | 10-min inventory rebuild + full-surface re-sim | Varies; some 1-min "live" GEX (VS3D argues this is spec-noise) |
| Named levels | Deliberately few (test/anchor, inflections) | Heavy level branding (Call Wall, Put Wall, Volatility Trigger, JPM level, etc.) |
| Greeks | Gamma, delta, charm, vanna, delta-change; finite-difference simulated Greeks | Mostly gamma-centric; some vanna/charm dashboards |
| Visual signature | Continuous gradient Greek field under candles; strike×expiry grid | Level lines on price charts; profiles |
| Human layer | $300/mo live desk (ex-MMs) + $10k mentorship | Newsletters, alerts |
| Weaknesses | No API, no alerts in base app, 3-mo history, SPX/VIX only, young product, $299 price point, no TV integration | Sign-assumption fragility, level clutter |

---

## 8. What to clone (capability parity list)

1. **Inventory-ledger positioning, not OI heuristics.** Build per-series cumulative signed
   participant-volume books from CBOE Open-Close (C1, and add C2/BZX/EDGX for completeness —
   VS3D appears C1-focused [INF]) netted to a "hedgeable quantity." Persist per participant
   class (MM/Firm/BD/Cust/ProCust) from series inception; include FLEX.
2. **The 10-minute doctrine.** Match their cadence but validate 1-min feeds ourselves; if CBOE
   1-min really is spec-broken for cumulation, publish the proof — it's a marketing weapon they
   currently own rhetorically.
3. **Gradient Greek field.** Candles + continuous per-pixel Greek field (gamma/delta/charm/vanna/
   delta-change), with maxima/minima/inflection auto-annotation, contour lines, straddle lines,
   symmetric-range calibration, intensity curves (sqrt/power/arcsinh), palette+reverse controls,
   and a +1%-vol what-if. Our chart engine (MastermindChart canvas) can render this as a heatmap
   layer under OHLC.
4. **Strike×expiration position grid** with strike bucketing, AM/PM Friday split, custom
   expiration multi-select, prior-close reference dots, straddle overlay.
5. **Historical scrub/replay** of the whole workspace (their 3-month cap is beatable — we already
   run gex-history lanes; ship 12+ months).
6. **Delta Change / path-of-least-resistance view**: fused forward-delta finite-difference metric
   (bump time × price grid) — they converged on this after killing raw simulated Greeks; skip
   their detour and ship the fused view directly.
7. **Test/Anchor + structure-quality classifier**: auto-label anchors (net-long clusters), tests
   (net-short clusters), fishbone/gappy/clean structure scores, and containment odds — they teach
   this manually; we can compute it.
8. **Whale trackers as first-class features**: JHEQX collar auto-detection (quarter-end close
   prints of the known structure), 0DTE IC-martingale program detection (repeating same-width IC
   size signatures in customer origin), with roll/blow-up dashboards.
9. **Charm-window awareness**: time-of-day weighting (avoid 9:30–11:00, highlight 11:30–15:00,
   asymptote guard after 15:00) and straddle-decay gating baked into signal display.
10. **Doc + onboarding depth**: their netlify onboarding course converts skeptics; our suite
    needs an equivalent mechanism-vocabulary curriculum.

## 9. What to beat (concrete upgrade ideas)

1. **Coverage**: they are SPX+VIX only. We already run SPX/SPXW + ETF/single-name GEX lanes
   (SPY/QQQ/KRE/ARKK etc.). Shipping the same positioning rigor across index + ETF + top single
   names is an immediate categorical win. Handle index-vs-ETF dealer-assumption differences
   explicitly (ETF books have AP/arb cross-hedging; document our sign model per universe).
2. **History**: 3-month lookback → offer 1–2 years + date-picker replay (our `gex_at:`/
   `gex_dates:` ladder replay is already live; extend to full workspace state).
3. **API + alerts in base tier**: they have neither publicly. Expose `/api/*` JSON for every view
   (fits our published-API doctrine) and threshold/regime alerts (gamma sign flip, anchor
   migration, straddle-decay stall, JHEQX roll detected) via our alerts engine.
4. **Regime honesty**: apply our regime-dynamics law — never print "long gamma" as a static
   fact; always level + trend + velocity ("$9.8bn, draining at $1.2bn/hr since 13:00"). VS3D
   shows levels; narrating the trajectory is an upgrade.
5. **Confidence layer**: publish per-strike data-quality/entropy (how much of the bar is stale
   inventory vs today's flow — they hint at this with 9pm dots; we can quantify %-aged inventory
   and decay-weight it).
6. **Vol-surface integration**: they sell surface commentary as a human service (VS Pro). Ship
   surface analytics (skew percentile, vanna-strength proxy, straddle decay tracker) as product
   features, not Discord commentary.
7. **Cross-flow fusion**: fuse dealer book with the flows they only talk about — vol-control/CTA
   model estimates, month-end pension rebalance windows — into one desk (they split this across
   VS3D + RTM + newsletter).
8. **Latency-honest "live" tier**: intraday tape-derived nowcast (our ThetaData trade/quote lane)
   displayed as an explicitly-labeled fast estimate BETWEEN 10-min exchange truth updates —
   best of both, with the correction shown when clearing data lands (turns their 1-min critique
   into our feature).
9. **Price**: $299/mo for one index. Bundling comparable capability inside the Terminal
   subscription is a pricing wedge.
10. **UX**: their conventions churned (blue/yellow→green/red, charm color inversion). Lock a
    theme-stable, colorblind-safe convention day one; sync crosshairs/hover across ALL panels
    (they retrofitted this) and mobile-first layouts (our responsive shell law).

---

## 10. Open questions / verification list

- [ ] Confirm CBOE DataShop product + cost powering them ([INF]: intraday Open-Close C1; check
      whether 10-min intraday O/C subscription pricing fits a $299 retail product for us too).
- [ ] Validate the 1-minute open-close "spec error compounding" claim empirically before echoing.
- [ ] Pro Bundle price and contents (unlisted publicly).
- [ ] Whether VS3D VIX book uses VIX-option participant data to compute the volga/vanna
      transmission view or just displays raw VIX positions.
- [ ] "Something Big is Coming" waitlist — watch for asset-coverage expansion (would erode our
      coverage advantage).
- [ ] Exact identity/role of "Carson" vs Roos/Nadel (branding accuracy only).

## 11. Source log (retrieved 2026-08-01)

- volsignals.com — home, /membership-area/pricing, /vs-pro, /rtm, /blogs, blog posts
  (june-opex-gamma-roll-off, top-3-dealer-hedging-mistakes).
- vs3d.volsignals.com — /home (+FAQ), /home/getting-started, /home/docs,
  /home/docs/gradient-chart, /home/release-notes.
- vs3d-onboarding-webinars.netlify.app — 7-chapter onboarding guide (methodology-dense; the
  richest single source in this teardown).
- volsignals.substack.com/archive — post census.
- X/@VolSignals via ThreadReader: JPM-collar pinning thread (status 2035694556302172282),
  positions-up modeling claim (2012528863788531742), Sep-2023 JHEQX roll (1707828353644797964,
  snippet via search), 0DTE IC martingale (1935301886170562730), dealer-gamma explainers.
- YouTube channel listing (titles/dates via search; watch pages are JS-walled).
- Secondary: MarketWatch (Captain Condor), Tickmill (JHEQX scale), Quora (Carson profile),
  FlashAlpha/Trustpilot (competitor comparison context).
