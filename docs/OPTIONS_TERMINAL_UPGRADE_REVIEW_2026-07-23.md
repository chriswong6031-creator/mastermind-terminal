# Terminal Options Suite: Competitive Assessment and Upgrade Blueprint

**Date:** 2026-07-23  
**Audience:** Product owner and Claude implementation agent  
**Terminal code baseline:** local `charting-app@687da219`  
**Related handoff:** [Macro Dashboard Options consolidation review](./OPTIONS_MACRO_DASHBOARD_CONSOLIDATION_REVIEW_2026-07-23.md)  
**Decision:** retain the existing technical work, but reorganize and rebuild it around a live options decision workflow. Do not add more peer-level pages.

> This assessment combines source review, local fixture-mode browser inspection, generated-artifact inspection, and current competitor research. Fixture behavior is identified as such; it does not prove production feed completeness, latency, exchange entitlement, or model accuracy. Competitor capabilities and prices can change and are dated to this review.

## Executive verdict

Terminal has more options functionality than the team realizes. It already contains:

- a live-ish options tape and a card-based Flow Desk;
- whole-market and sector Tide views;
- ticker-level flow, contract, volatility, wall, and surface views;
- several cross-sectional screener presets;
- an EOD GEX desk;
- a strike-by-expiry PRISM matrix;
- EOD Prophet plans, Leaders, and Leader Radar;
- a separate market heatmap;
- unusually good caution copy around approximate trade direction.

The product is nevertheless behind serious intraday options subscriptions because those pieces do not form a decision system. A trader can see a lot of data, but Terminal does not reliably answer:

1. What changed in options positioning in the last minute?
2. Is it unusual relative to this ticker, DTE, liquidity, and time of day?
3. Is the apparent direction credible, ambiguous, a spread, a roll, or a hedge?
4. Is options pressure confirming price or diverging from it?
5. For SPX/SPY/QQQ 0DTE, where is modeled hedging pressure likely to dampen or amplify price?
6. Which wall or node formed, moved, held, broke, or expired?
7. What invalidates the setup?
8. How did the same signal perform historically after realistic spread and slippage?

The central gap is therefore not a missing generic heatmap or another whale feed. It is the absence of:

- options-originated intraday signals;
- a dedicated 0DTE/index command center;
- a strike-by-intraday-time estimated hedge-pressure map;
- synchronized price/flow/structure replay;
- signal lifecycle and outcome calibration;
- an observed-versus-inferred-versus-modeled truth contract;
- a coherent scan → investigate → alert → manage → review workflow.

The strongest product promise available to Mastermind is:

> **A live, replayable options market-structure workspace that shows what was observed, what was inferred, what changed, what would invalidate the read, and how comparable signals actually performed.**

Prophet can provide regime or directional context, but an “intraday options signal” must originate from intraday options data. A post-processing layer that merely strengthens a Prophet signal with options context is confluence analysis, not an options signal engine.

## Product decision

### Terminal owns “Now”

Terminal should own:

- real-time tape and grouped campaigns;
- 0DTE and index monitoring;
- estimated intraday hedge pressure;
- wall/node formation and migration;
- options-originated alerts;
- contract and setup investigation;
- intraday trade-management context;
- synchronized replay.

### Macro Dashboard owns “Close and Research”

Macro Dashboard should own:

- confirmed next-session open-interest changes;
- EOD GEX/DEX/VEX/charm and volatility structure;
- multi-day flow accumulation and recurrence;
- OPEX/expiration research;
- EOD cross-sectional scans and leaders;
- signal outcomes, backtests, and longer-horizon reports.

The apps should share symbols, watchlists, alert definitions, signal IDs, metric definitions, and data lineage. They should not immediately be merged into one codebase, and they should not each reproduce the other app’s pages.

### Canonical ownership across both apps

| Capability | Canonical owner | Other app’s role |
|---|---|---|
| Live signal detection/lifecycle | Terminal | Macro links to the archived signal |
| Intraday replay | Terminal | Macro deep-links to a session/time |
| Compact live calibration context | Terminal | Show only sample/status needed for a live decision |
| Full detector research, backtests, and performance | Macro Dashboard | Terminal links to the canonical study |
| Nightly Leaders and Terminal Leader Radar | Macro Dashboard → Leaders & History | Terminal shows only live candidates derived from options-native detectors |
| Confirmed T+1 OI | Macro Dashboard/shared data service | Terminal attaches confirmation when historically available |
| Live alerts and delivery | Terminal/shared user service | Macro creates next-session alert definitions |

Do not remove a Terminal or Macro route until its replacement view is deployed, state migration is tested, and a redirect preserves ticker/date/signal context.

## Current-state scorecard

Scale: `0` absent, `1` display/prototype, `2` partial, `3` useful beta, `4` competitive, `5` category-leading. Scores describe product maturity, not code effort.

| Capability | Current | Competitive target | Assessment |
|---|---:|---:|---|
| Raw tape and filtering | 3.0 | 4.0 | Broad and useful; polling, weak trade interpretation, no saved workflow, and duplication with Desk hold it back. |
| Grouped campaigns and unusual activity | 2.7 | 4.2 | Repeat, whale, sweep, z-score, and OI badges are a good start; grouping and intent are not sufficiently reconstructable or validated. |
| Ticker investigation | 3.1 | 4.2 | One of the strongest current surfaces; needs universal search, shared chart context, trade replay, liquidity, and “what changed” interpretation. |
| Market/sector options context | 2.6 | 3.8 | Tide is useful, but approximate direction is presented too categorically and one refresh path is defective. |
| Static/EOD GEX | 2.8 | 4.0 in Macro | Rich levels and regime context; cadence is misplaced in the live suite and expiry filtering is misleading. |
| Strike × expiry matrix | 2.8 | 4.2 | PRISM is a credible chain heatmap foundation; VEX is disabled, ΔOI loses call/put separation, and 0DTE behavior can be false. |
| Strike × intraday-time estimated hedge-pressure map | 0.5 | 4.3 | Missing. This is the most important visualization gap versus TRACE/Heatseeker-class products. |
| 0DTE/index workflow | 1.4 | 4.5 | Filters and summaries exist, but no purpose-built desk, hedge-pressure model, cross-index view, or lifecycle alerts. |
| Options-native signals | 1.2 | 4.5 | Flow Score measures notability, not expected outcome; Prophet is EOD and disconnected from live flow. |
| Signal lifecycle and calibration | 0.5 | 4.5 | No consistent detected/confirmed/invalidated/expired state or transparent forward-outcome ledger. |
| Replay | 0.5 | 4.2 | No synchronized options replay across price, tape, aggregates, structure, and signals. |
| Alerts and workflow handoff | 0.8 | 4.0 | No options event-to-chart handoff, reliable delivery, saved scan, webhook, audio, or shared-watchlist workflow. |
| Data truth and provenance | 2.0 | 4.7 | Some caution copy is excellent; NBBO, complex orders, OI vintage, latency, model basis, and completeness are insufficient. |
| Information architecture | 1.8 | 4.0 | Ten peer tabs mix live and nightly products and expose internal feature history rather than trader jobs. |
| Subscription/security readiness | 1.5 | 4.5 | `/api/flow` is not protected by the same entitlement controls expected for a paid feed. |
| Options-specific test coverage | 0.5 | 4.0 | Current tests do not cover flow scoring, filters, GEX, PRISM, Prophet, caching, or API contracts. |

**Bottom line:** this is a broad descriptive beta, not yet a trustworthy live options intelligence subscription.

## Plain-English orientation for the product team

| Term | What it can tell you | What it cannot prove |
|---|---|---|
| **Options tape/flow** | A contract traded at a given price, size, and time; execution near the bid/ask can suggest aggressor side | Who traded, whether they opened or closed, whether the print was a hedge, or whether it is bullish by itself |
| **Premium** | Dollars paid/received for the contract transaction; useful for size and attention | Directional exposure; deep-ITM options can carry huge premium without being the most urgent trade |
| **Volume > prior OI** | More contracts traded today than existed as open interest after the prior clearing cycle | That the visible trade is a new open position or remains open |
| **Next-day ΔOI** | How settled open contracts changed after clearing | Exact trade intent when many opens/closes/rolls net together |
| **Delta notional** | Approximate underlying-equivalent directional sensitivity of a trade | Observed dealer hedge orders or certain future price impact |
| **Gamma/GEX** | How option delta may change with price and where modeled hedging sensitivity concentrates | Actual dealer inventory unless participant/open-close data supports the sign |
| **Call/put wall or gamma flip** | A modeled structural level/regime worth monitoring | A guaranteed support, resistance, target, or reversal |
| **0DTE share** | How much activity expires today; useful because Greeks and decay change rapidly | That a high share is automatically bullish, bearish, or destabilizing |
| **IV/skew/term** | The price of expected volatility across strikes and expiries and how demand is distributed | A guaranteed direction; IV can rise for protection, event risk, or volatility trades |
| **Dark-pool print** | A large off-exchange equity transaction and a price level to monitor | Whether the print was accumulation or distribution |
| **Signal** | A versioned rule detected a specific combination of evidence | A trade recommendation or guaranteed outcome; it still needs horizon, invalidation, and calibrated history |

The product should reinforce these distinctions at the moment a user makes an interpretation. A disclaimer at the bottom of the page is not enough.

## What exists today

`/flow` mounts the 4,000-plus-line `terminal/components/OptionsHubView.tsx`. Its top bar presents ten modes:

1. Prophet
2. Flow Desk
3. Tape
4. Tide
5. Tickers
6. Screener
7. GEX
8. PRISM
9. Leaders
10. Leader Radar

The app defaults to raw Tape (`OptionsHubView.tsx:1401`). `/heatmap` is a separate primary navigation destination, and `/terminal` is the main chart workspace.

The flow API facade (`terminal/app/api/flow/route.ts`) supports feed, heat, tide, DTE, ticker, volatility, GEX, OI, context, chain heat, GEX state, matrix, Prophet, enrichment, Leaders, and Radar. It can fall back from a Python service to public JSON/R2-style artifacts. There is no live dark-pool/TRF/ATS endpoint.

### Current surface disposition

| Surface | What it currently does | What is good | Main problem | Recommended action |
|---|---|---|---|---|
| Tape | Dense, filterable event table | Fast scanning; sector strip; DTE, moneyness, size, premium, flags, approximate side | No campaign investigation, chart handoff, saved views, replay, or trustworthy intent; duplicates Desk | Merge into **Live Desk** with a table/card density switch |
| Flow Desk | Three-pane event cards, gauge, radar, watchlist, chain heat, inspector | Good investigation skeleton; visible score decomposition and caveats | Dense at ordinary laptop widths; local-only watchlist; empty inspector; “smart money”/tier language exceeds evidence | Keep layout concept, simplify, share state, rename scores |
| Tide | Cumulative net-call/net-put proxies, SPY overlay, sectors, top impact, DTE buckets | Useful market context | Direction is soft but UI says “net call · bullish” and “net put · bearish”; refresh defect | Keep inside Live Market, change language and fix refresh |
| Tickers | Flow timeline, top contracts, strike ladder, vol surface, walls, max pain, IV rank/term/smile | Polished and analytically broad | Blank until selected; candidate search is not universal; no “what changed” or synchronized chart/replay | Evolve into **Ticker Lab** |
| Screener | Premium, unusual-z, vol>OI, ΔOI, 0DTE-heavy, and hot-contract presets | Useful inventory and starter presets | Presets are separate mini-pages rather than a rule builder; “fresh positioning” overstates vol>OI | Rebuild as saved scanner templates |
| GEX | Net GEX, wall/support, magnet/HVL, flip, expiry controls, strike ladder, market state | Rich EOD levels and regime view | Nightly data is mixed with live pages; expiry selection does not filter ladder; contradictory unknown/dominant states possible | Move primary EOD research to Macro; keep a live-relevant Structure view backed by honest intraday model |
| PRISM | Strike × expiry matrix for GEX/OI/volume/ΔOI, 0DTE scope, confluence, HeatSeeker card, OI rail | Closest current surface to a competitive options heatmap | It is not strike × time; VEX/Unusual disabled; ΔOI combines calls and puts; 0DTE can silently fall back; fixture confluence can repeat wrong data | Use as foundation for unified **Structure** workspace, not as the final estimated-pressure map |
| HeatSeeker card | Selects one standout matrix strike/expiry/lens | Concise concentration callout with non-directional copy | It is a concentration pick, not a Heatseeker-class map or tested signal; can disappear when stale | Rename **Standout Node** until evidence-backed signal exists |
| Prophet | EOD directional plans, targets/stops/actions, option marks | Existing signal context and plan-management UI | Does not join live flow; PERF is placeholder; “display only” conflicts with Enter/Hold/Trim/Exit language | Move to **Signals & Outcomes → EOD Swing Context** |
| Leaders/Radar | Nightly cross-sectional rank and baseline views | Potentially useful EOD research | Mixed into intraday hub; empty overnight states; fixture schema can crash; separate overlapping destinations | Move/consolidate into Macro EOD |
| General Heatmap | Price treemap and EOD ΔOI “Flow” layer | Strong price-tile visual | Not an intraday options heatmap; displayed premium/call-share calculations are incorrect | Keep as market breadth after fixing; do not use as answer to dealer-map gap |

There is also an unreachable legacy volatility tab in `OptionsHubView.tsx`: the tab key and rendering code remain although the item is absent from the visible tab definition and URL validation. Remove dead code after confirming no deep links depend on it.

## UX and layout assessment

### 1. Navigation describes features, not trader decisions

“Prophet,” “PRISM,” “HeatSeeker,” “Leader Radar,” “Smart Money Radar,” and “Chain Heat” are internal/product metaphors. A user unfamiliar with options cannot predict which one answers a question. Expert users must also jump among unrelated tabs while losing ticker, expiry, filter, and time context.

Replace the ten tabs with five task-oriented modes:

1. **Live Desk**
2. **0DTE & Indices**
3. **Ticker Lab**
4. **Structure & Scanner**
5. **Signals, Alerts & Replay**

Prophet, GEX lenses, matrix views, and screen presets become subviews or evidence layers—not peer products.

### 2. The default view is wrong for both beginners and experts

A raw options tape is not a useful landing page without strong filters and experience. A beginner sees jargon and noise; an expert first wants regime, feed health, levels, and recent changes.

The default should be a **Live Market overview**:

- feed status and source age;
- index regime strip;
- 0DTE share and delta-pressure change;
- active signals with lifecycle;
- largest new campaigns;
- cross-market flow/price divergence;
- direct entry into Tape, Ticker Lab, or 0DTE desk.

The system should remember the user’s last workspace thereafter.

### 3. Density is high without sufficient hierarchy

The Flow Desk’s three-pane design is conceptually sound, but at a common 1270×713 viewport:

- cards, filter chips, and both rails compete for width;
- the right inspector is mostly empty until selection;
- numbers and small badges have similar visual weight;
- low-contrast labels force slow reading;
- persistent rails reduce the central feed below comfortable scanning width.

Required behavior:

- collapsible left and right rails;
- minimum center width;
- inspector becomes a drawer at medium widths;
- table/card toggle;
- one primary number and one primary reason per event;
- keyboard navigation and command palette;
- consistent empty, loading, stale, error, and permission states.

### 4. State is fragmented

Options views do not share a universal:

- symbol;
- option contract;
- date/time cursor;
- expiry scope;
- DTE bucket;
- watchlist;
- alert;
- replay timestamp.

Flow Desk even keeps a separate localStorage watchlist (`flowdesk/FlowDeskView.tsx:89`) rather than using chart-workspace watchlists. Selecting a tape event filters the tape rather than opening the corresponding underlying/contract on the main chart.

Add a single `OptionsWorkspaceContext` (or server-persisted equivalent) with URL-addressable state. Every event, signal, strike, wall, and scanner row must deep-link into the same investigation state.

### 5. Empty states conceal product value

Observed fixture states included:

- three empty Prophet columns;
- Leader Radar waiting for a nightly baseline;
- HeatSeeker disappearing because its chosen expiry had passed;
- a blank right rail before selection;
- Flow Heatmap tiles with no visible values;
- Leaders crashing on a fixture schema mismatch.

Empty states must explain:

- whether the market is closed;
- whether the dataset is building, stale, missing, or simply has no qualifying observations;
- when the next update is expected;
- the last good publication;
- how to inspect a historical example or replay immediately.

Premium products should always have a truthful “show a recent session” path so users can learn the surface outside market hours.

### 6. Visual sophistication is not the primary deficiency

The UI already looks more sophisticated than its underlying guarantees. More gradients, glowing cards, or branded names will not make it competitive. The next visual work should improve:

- synchronized price/time relationships;
- state change and movement;
- provenance and confidence;
- hierarchy and drilldown;
- comparison across expiries and indices;
- replay.

## Correctness and trust gate

Fix these before building new analytics. They are not cosmetic.

### P0 code defects

1. **Tide can stop refreshing after its first load.**  
   `fetchTide` exits when `tideData` exists, while the polling interval invalidates cache and calls the same guarded function (`OptionsHubView.tsx:1461,1546-1558`).

2. **GEX expiry selection does not filter the strike ladder.**  
   The ladder remains the all-expiry aggregate even when the control or 0DTE chip changes (`gexdesk/StrikeLadder.tsx:474`).

3. **PRISM 0DTE can silently show non-0DTE data.**  
   When no same-day expiry exists, it falls back to the first expiry while the 0DTE mode stays selected (`prism/PrismView.tsx:277`).

4. **HeatSeeker’s intended null state is unreachable.**  
   A null pick reaches invalid-date logic and returns before the explicit empty branch (`prism/HeatSeekerCard.tsx:95`).

5. **OI movers can collapse different expiries.**  
   Deduplication uses `strike|right` and omits expiration (`prism/OiMoversRail.tsx:84`).

6. **PRISM ΔOI destroys call/put structure.**  
   Calls and puts are combined into one cell value (`prism/MatrixGrid.tsx:146`). Preserve two sides or render signed layers explicitly.

7. **Heatmap “Call Share” is mislabeled.**  
   It is the fraction of tickers whose EOD tone is positive, not call-premium share (`heatmap/HeatmapView.tsx:181,465-479`).

8. **Heatmap “Total Premium” is not gross premium.**  
   It sums signed net premium, allowing positive and negative names to cancel (`heatmap/HeatmapView.tsx:173,449-463`).

9. **Ticker lookup is not universal.**  
   Candidates are limited to Tide top-impact and unusual-name lists (`OptionsHubView.tsx:1656`).

10. **The `BLOCK` badge is not a dark-pool event.**  
    It is simply an options event with size at least 5,000 (`flowdesk/FlowCard.tsx:40`). Rename it “large print.”

11. **Prophet is not responsive as described.**  
    Its root remains a fixed `280px 1fr 260px` grid (`prophet/ProphetView.tsx:556`).

12. **Leaders fixture and rendering contracts disagree.**  
    The local page crashed when `coverage.n_universe` was absent. Validate all producer/consumer schemas and render partial-safe fallbacks.

13. **Fixture confluence violates symbol identity.**  
    SPX, SPY, and QQQ displayed identical spot/structure in PRISM confluence. Fixtures must never repeat one symbol’s payload under another symbol.

14. **GEX can present mutually inconsistent states.**  
    The fixture showed “UNKNOWN / insufficient chain data” and “LONG γ DOMINANT / hedge pressure HIGH” together. Compute a single quality gate that suppresses downstream regime claims when the input is insufficient.

### Freshness defects

There is no options WebSocket or SSE path. Major views poll every 30–60 seconds. Two stale-while-revalidate layers can add another poll cycle:

- client flow cache returns stale data and refreshes in the background (`terminal/lib/flowClientCache.ts:62`);
- server flow cache can also return stale data while revalidating (`terminal/app/api/flow/route.ts:393`).

A 45-second tape poll can therefore receive the prior server snapshot while the next one is prepared. Prophet can call an option mark “LIVE” for up to 20 minutes (`prophet/OptionCard.tsx:51`).

Until transport is improved:

- label event age, artifact age, and transport separately;
- never show `LIVE` based only on “less than 20 minutes old”;
- show `DELAYED`, `STALE`, `PARTIAL`, `RECONNECTING`, and `CLOSED` states;
- pause signal generation when required inputs exceed their freshness budget.

### Entitlement defect

`proxy.ts` excludes `/api/*` from global auth. Quote and intraday endpoints perform conditional checks themselves, but `/api/flow` appears to rate-limit without an equivalent user/subscription entitlement gate (`terminal/app/api/flow/route.ts:316`).

Before a paid launch:

- authenticate before cache lookup;
- authorize plan/data entitlement before returning any artifact;
- use private object storage or signed access for proprietary artifacts;
- meter expensive endpoints and exports;
- test guest, expired, wrong-plan, and cache-warm bypass cases.

### Missing tests

Add automated coverage for:

- every normalized options event schema version;
- flow score boundaries and 0DTE behavior;
- saved filters and scanner rules;
- cache freshness and stale-state transitions;
- GEX expiry filtering;
- PRISM 0DTE and call/put ΔOI;
- options-intraday signal origin and evidence-origin validation;
- signal lifecycle transitions;
- no-lookahead outcome calculations;
- fixture contract parity;
- API auth and entitlement;
- mobile/medium-width visual regression;
- replay determinism.

## Audit of the current Flow Score

`terminal/lib/flowScore.ts` is transparent, which is a strength. It is not an alpha model.

Its weighted inputs are:

- premium magnitude;
- premium z-score;
- DTE relevance;
- vol>OI;
- moneyness;
- repeat clustering;
- a small direction-reliability penalty.

The comments explicitly describe magnitude and structure as primary, direction as weak, and the achievable score range as 0–94 (`flowScore.ts:3-23`). The UI also says the score is not a win-rate prediction.

Three product problems remain:

1. **Tier names imply expected performance.**  
   `ELITE`, `STRONG`, and “conviction” sound predictive even when the score only ranks activity.

2. **0DTE is structurally suppressed.**  
   The DTE factor assigns 0DTE only `0.20` (`flowScore.ts:114-129`). Even an otherwise maximal 0DTE print cannot reach the top tier. A universal swing-oriented DTE preference should not govern a dedicated 0DTE product.

3. **vol>OI is mislabeled as new/fresh positioning.**  
   Volume exceeding prior open interest proves that turnover exceeded the prior stock of contracts. It does not prove that a visible print opened, remains open, or is not part of a spread/roll. `freshFactor` and UI copy should call it `volume_exceeds_prior_oi`, with next-day OI needed for confirmation.

### Replace one ambiguous score with four transparent dimensions

| Dimension | Question | Example inputs |
|---|---|---|
| **Activity** | How unusual and urgent is this activity? | premium/delta/gamma notional percentiles, repeat speed, exchanges, time-of-day z-score |
| **Intent confidence** | How credible is side/opening/strategy interpretation? | NBBO position, quote width, complex linkage, open/close estimate, stock-option combo, hedge/roll evidence |
| **Tradability** | Could a subscriber reasonably act on it? | spread %, depth, OI, volume, underlying liquidity, expected slippage |
| **Setup evidence** | Does flow align with price, structure, volatility, and regime? | price/flow confirmation, wall proximity/movement, skew, catalyst, cross-index alignment |

Display the dimensions separately. If a composite rank is needed for sorting, call it **Attention Rank**, expose its components, version it, and do not map it to win probability.

## How serious users use intraday options data

The suite should be organized around these jobs:

| Stage | User question | Required product behavior |
|---|---|---|
| Premarket preparation | Is the day more likely to pin, mean-revert, trend, or become unstable? Where are scenarios and invalidations? | Overnight/event context, expected move, gamma regime, flip/walls, 0DTE structure, prior-day change |
| Discovery | Which activity is genuinely abnormal for this ticker right now? | Liquidity-, DTE-, and time-of-day-normalized scanner |
| Intent analysis | Is this opening direction, closing, roll, spread, vol trade, hedge, or ambiguous? | NBBO, trade conditions, complex reconstruction, confidence and contradiction |
| Entry timing | Is options pressure confirming price at a structural level? | Price plus signed Greek impulse, acceleration, divergence, wall/node changes |
| Index/0DTE management | Will hedging likely dampen or amplify moves? Are SPX/SPY/QQQ aligned? | 0DTE pressure map, cross-index view, node lifecycle, expected range |
| Contract selection | Is premium/liquidity appropriate, and what expression fits? | Spread, Greeks, IV/skew/term, expected move, scenario P/L |
| Open-trade management | Has the thesis strengthened, weakened, achieved, or failed? | Signal lifecycle, freshness decay, reversal, wall break/hold, target/invalidation |
| Review | Did it work for the stated reason after costs? | Synchronized replay, inputs/model version, MFE/MAE, time-to-peak, slippage |
| Next-day confirmation | Did apparent accumulation become open interest? | T+1 OI confirmation, strike/expiry change, multi-day campaign |

The interface should teach this workflow in place. Experienced platforms repeatedly tell users not to tail a print blindly; they combine flow with price, levels, catalysts, liquidity, and history. Terminal should encode that discipline rather than relying on tooltips scattered across features.

## Competitive bar

The market has two broad groups:

- generalist flow suites in roughly the $50–$150/month range;
- index/dealer-position specialists around $100–$300/month, with premium products reaching about $699/month.

Pricing is included only to establish the expectation level, not to set Mastermind pricing.

| Product | Competitive lesson for Terminal |
|---|---|
| **Unusual Whales** | Broad full-market tape, group filters, Market Tide, GEX, historical data, alerts, API, and replay. Its own documentation carefully describes trade side as estimated and alerts as non-entry signals. Match breadth only where it supports a coherent workflow. |
| **Tradytics** | Strong generalist benchmark for SPY/SPX/QQQ 0DTE, dealer delta/gamma/vanna/charm, flow maps, repeats, and timelines. Terminal needs at least this level of index focus. |
| **FlowAlgo** | Demonstrates the value of aggressive curation, dark-pool levels, voice alerts, and a simple workflow. It also openly warns that intent/holding period are unknown. |
| **Cheddar Flow** | Clean onboarding, AI alerts, GEX, walls, gamma regime, and contract detail. A useful benchmark for clarity, not necessarily model depth. |
| **BlackBoxStocks** | Named repeat/speed/large-flow alert types, heatmaps, GEX, Net Options Delta, notification delivery, and live interpretation. Shows that users value actionable alert taxonomy. |
| **SpotGamma** | Primary 0DTE benchmark. TRACE presents strike × time gamma/delta/charm pressure, participant lenses, price/HIRO overlays, node history, and one-minute replay. HIRO estimates real-time hedging pressure across SPX/SPY/XSP/ES. |
| **Skylit Heatseeker** | Primary dealer-map benchmark. Node hierarchy, air pockets, migration, lifecycle, chart overlay, replay, and SPX/SPY/QQQ cross-index alignment turn a heatmap into a trading workflow. “Heatseeker” is their name; do not copy it. |
| **GammaEdge** | Shows demand for a purpose-built SPX 0DTE game plan and training, rather than another general tape. |
| **OptionsHawk** | Shows the continuing value of multi-day recurrence, OI confirmation, catalyst/technical context, and human-readable EOD interpretation. |
| **Gexmap** | Emerging benchmark for custom signal recipes, one-click backtests, statistics, and day-by-day 0DTE map replay. Treat advertised capabilities cautiously until broadly released, but recognize the direction of competition. |

### Competitive capability matrix

`Strong` means the capability is a central, publicly documented part of the product. `Partial` means it exists but is narrower or less integrated. `Not established` means the reviewed public material did not substantiate it; it does not prove the vendor has no private/beta implementation.

| Product | Live flow | Native alert taxonomy | Dedicated 0DTE/index | Dealer strike × time | Replay/history | Main public price at review |
|---|---|---|---|---|---|---|
| Unusual Whales | Strong | Strong, but explicitly not entry/exit advice | Partial | Not established | Strong; Market Tide replay and historical flow | Dynamic/current checkout; verify before pricing comparison |
| Tradytics | Strong | Strong repeat/predictive tools | Strong for SPY/SPX/QQQ | Partial | Historical-day tools; full synchronized replay not established | Checkout/login dependent; do not cite third-party price as verified |
| FlowAlgo | Strong curated feed | Partial; Alpha AI beta | Not established | Not established | Flow history and daily recaps | $149 monthly; $129/mo quarterly; $99/mo annually |
| Cheddar Flow | Strong | AI Power Alerts | Partial | Not established | Historical flow and short alert-performance windows | $85 Standard; $99 Pro; $75/mo annual plan |
| BlackBoxStocks | Strong | Strong named alert types | Not established | Partial options heatmap/GEX/NOD | Historical dashboards and notifications | Options Basic $59/mo; verify higher recurring tiers |
| SpotGamma | Strong specialist flow/HIRO | Strong structure/flow alerts | **Strong benchmark** | **Strong benchmark: TRACE** | Five-day/history and intraday map replay | Essential $99/mo; Alpha $299/mo; annual effective $74/$224 |
| GammaEdge | Partial/specialist | Regime and scanner signals | Strong SPX focus | Partial web/bot maps | Substantial replay not publicly established | $150/mo or $125/mo annual |
| Skylit | Flowseeker plus dealer analytics | Strong node/pattern workflow | **Strong benchmark** | **Strong benchmark: Heatseeker** | Atlas overlay/replay in higher tiers | $99 / $299 / $699 |
| InsiderFinance | Strong curated flow | Proprietary indicators/trade ideas | Partial | Not established | Historical flow | $75 monthly; $65/mo quarterly; $55/mo annually |
| OptionsHawk | Human-curated live/EOD flow | Human interpretation | Partial | Not established | Strong EOD/OI research | Elite $199/mo; Max $399/mo; dashboard app listed separately at $125/mo |
| Gexmap | Focused SPX product, advertised/waitlist | Custom signal recipes | Strong advertised focus | Strong advertised GEX map | Advertised one-click backtests/replay | Advertised $249/mo or $179/mo annual; signal/backtest add-on +$49 |
| **Terminal now** | Partial, 30–60s polling | Activity tiers, not validated signals | Weak | Missing | Missing synchronized replay | Not assessed |

This matrix sets the minimum competitive expectation:

- a generalist paid suite is expected to offer saved flow filters, alerts, history, and usable ticker drilldown;
- a premium index product is expected to offer a purpose-built 0DTE view, structure change through time, price overlay, and replay;
- Mastermind should not charge specialist-level pricing for a static GEX snapshot plus a polling tape, regardless of visual polish.

Current benchmark references:

- [SpotGamma TRACE guide](https://spotgamma.com/wp-content/uploads/2026/03/TRACE-User-Guide_30-March-2026.pdf)
- [SpotGamma HIRO guide](https://spotgamma.com/wp-content/uploads/2025/10/SpotGamma-HIRO-User-Guide-2.pdf)
- [Skylit learning hub](https://www.skylit.ai/learn)
- [Tradytics options market](https://tradytics.com/options-market)
- [Unusual Whales flow documentation](https://docs.unusualwhales.com/features/2-options-flow/)
- [FlowAlgo plans and product](https://flowalgo.com/select-a-plan/)
- [Cheddar Flow GEX](https://www.cheddarflow.com/features/gamma-exposure/)
- [BlackBoxStocks features](https://blackboxstocks.com/features/)
- [SpotGamma subscription pricing](https://support.spotgamma.com/hc/en-us/articles/1500002666102-What-is-the-cost-of-a-SpotGamma-Subscription)
- [GammaEdge SPX 0DTE and pricing](https://www.gammaedge.com/trading-0dte-at-gammaedge)
- [Skylit product and pricing](https://www.skylit.ai/)
- [InsiderFinance](https://www.insiderfinance.io/)
- [OptionsHawk subscription plans](https://optionshawk.com/subscription-plans/)
- [Gexmap](https://www.gexmap.com/)

Cboe reports that U.S. listed options averaged roughly 61 million contracts per day in 2025; SPX 0DTE averaged about 2.3 million and represented 59% of SPX volume. By Q2 2026, 0DTE exceeded 20 million daily contracts across an expanding product set. Architecture must not hardcode “0DTE = SPX only”: Monday/Wednesday expirations expanded to selected single names and IBIT in 2026.

- [Cboe: State of the Options Industry 2025](https://www.cboe.com/insights/posts/the-state-of-the-options-industry-2025)
- [Cboe: Q1 2026](https://www.cboe.com/insights/posts/the-state-of-the-options-industry-q-1-2026)
- [Cboe: Q2 2026](https://www.cboe.com/insights/posts/state-of-the-options-industry-options-market-continued-to-break-records-in-q-2-2026)

## Target Terminal information architecture

### 1. Live Desk

Merge Tape and Flow Desk.

Core features:

- one live event stream with table/card density;
- grouped campaigns and expandable legs;
- universal ticker/contract search;
- saved filters and views;
- pause/resume with buffered events;
- feed health and latency;
- shared watchlist;
- event → chart → chain → signal deep link;
- alert creation from any event or campaign;
- related price, news/event, and historical-flow context.

Default event row:

`time · ticker · contract · premium · delta notional · execution · activity · intent confidence · spread · reason`

Do not make ten badges compete for attention. Expand for full evidence.

### 2. 0DTE & Indices

This is the main competitive build and should receive the most screen area.

Initial universe:

- SPX
- SPY
- QQQ
- XSP
- NDX
- IWM
- VIX

Architect symbol/settlement rules so selected daily-expiry single stocks and IBIT can be added without rewriting the model.

### 3. Ticker Lab

Evolve the current Tickers tab into an investigation workbench:

- synchronized underlying chart and event markers;
- session flow/Greek impulse;
- campaigns and top contracts;
- chain with NBBO, Greeks, liquidity, volume, prior OI, and inferred intent;
- strike/expiry structure;
- IV term/smile/skew and intraday changes;
- catalysts and earnings;
- saved alert/contract/watchlist actions;
- historical sessions and next-day OI confirmation.

### 4. Structure & Scanner

Unify GEX and PRISM concepts:

- **Levels:** flip, walls, magnet, expected move, regime;
- **Surface:** strike × expiry GEX/DEX/VEX/charm/OI/volume/ΔOI;
- **History:** wall/node migration and OI change;
- **Scanner:** saved cross-sectional recipes.

Macro remains the source of settled EOD/confirmed OI research. Terminal renders intraday estimates only when their model basis and freshness are explicit.

### 5. Signals, Alerts & Replay

- live options-native signal feed;
- alert inbox and delivery status;
- lifecycle management;
- synchronized historical replay;
- calibration/outcome pages;
- Prophet as a separately labeled EOD Swing Context lens.

### Cross-app navigation

Use one conceptual Options menu:

```text
OPTIONS
├── Now / Live Desk                    → Terminal
├── 0DTE & Indices                     → Terminal
├── Ticker Lab                         → Terminal
├── Alerts & Replay                    → Terminal
├── Today's Close                      → Macro Dashboard
├── EOD Scanner                        → Macro Dashboard
└── Positioning History & Research     → Macro Dashboard
```

Preserve ticker, date, and selected signal in deep links. Do not iframe or visually duplicate entire pages.

## 0DTE & Index Command Center specification

### Primary desktop layout

```text
┌─────────────────────────────────────────────────────────────────────────────────────┐
│ SPX  SPY  QQQ  XSP  NDX  IWM │ LIVE 214ms · COMPLETE │ 0DTE / ALL │ REPLAY        │
├─────────────────────────────────────────────────────────────────────────────────────┤
│ Spot │ Exp move │ Net γ │ Flip │ Call wall │ Put wall │ Δ-pressure │ Regime/event │
├───────────────────────────────┬─────────────────────────────┬───────────────────────┤
│                               │                             │ Active signals        │
│ Price + levels + signal marks │ Estimated Hedge Pressure Map│ evidence/contradiction│
│                               │ strike × intraday time      │ target/invalidation   │
│                               │ spot path overlaid          │ lifecycle/freshness   │
├───────────────────────────────┴─────────────────────────────┴───────────────────────┤
│ Timeline: delta impulse · gamma impulse · call/put decomposition · SPX/SPY/QQQ sync │
├─────────────────────────────────────────────────────────────────────────────────────┤
│ Synchronized tape / campaigns / selected-strike chain / node changes               │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

### Regime strip

Show:

- spot and session return;
- expected move/range with source;
- current IV/VIX and intraday change;
- prior-night OI gamma regime;
- volume-estimated intraday gamma regime;
- gamma flip/volatility trigger;
- call/put walls with change since open;
- 0DTE signed delta-pressure impulse;
- feed/model timestamps;
- major event countdown.

Never collapse prior-night OI GEX and volume-estimated intraday GEX into one unlabeled number.

### Scenario card

Use model states, not trade commands:

- `RANGE / DAMPENING ESTIMATE`
- `TREND / AMPLIFYING ESTIMATE`
- `MIXED / WHIPSAW RISK`
- `INSUFFICIENT DATA`

Each state includes:

- evidence;
- contradictions;
- relevant zone;
- what would confirm;
- what would invalidate;
- model freshness and basis;
- link to comparable historical sessions.

### Cross-index alignment

For SPX/SPY/QQQ and related products, show:

- same-direction pressure;
- divergence;
- index/ETF basis normalization;
- product-specific session/settlement differences;
- options pressure versus ES/NQ price response where licensed/available.

Do not simply sum unmatched dollar notionals. Normalize by underlying multiplier, delta, product liquidity, and time.

## Estimated Hedge Pressure Map specification

PRISM already approximates a **chain heatmap**: strike × expiry. The missing flagship is a **modeled hedge-pressure time surface**: strike × intraday time.

Use **Estimated Hedge Pressure Map** or a neutral name such as **Gamma Terrain** until licensed participant data supports direct dealer attribution. Do not call the product Heatseeker.

### Required lenses

- Gamma exposure/estimated gamma positioning
- Delta pressure
- Vanna exposure/pressure
- Charm pressure
- Open interest
- Volume-estimated position change

### Required controls

- 0DTE / next expiry / all expiries;
- product/participant/model basis;
- signed / absolute;
- global / visible-window scale;
- calls / puts / combined;
- live / replay;
- show price;
- show walls/nodes/signals;
- 1/5/15-minute aggregation;
- model version and assumptions.

### Required visual behavior

- y-axis = strike;
- x-axis = event/session time;
- spot path and candles overlaid;
- node intensity and contours;
- wall/node ranking;
- node state: forming, strengthening, tested, migrating, decaying, removed;
- crosshair synchronizes price, map cell, tape, and chain;
- map can rewind without exposing future state;
- exact timestamps and values in tooltip;
- clear `NO 0DTE EXPIRY` instead of fallback data.

### Additional heatmaps to distinguish

1. **Market heatmap:** ticker/sector tiles.
2. **Flow heatmap:** ticker or strike × time, colored by premium/Greek impulse.
3. **Chain heatmap:** strike × expiry for OI/volume/IV/GEX/DEX/VEX.
4. **Estimated hedge-pressure time surface:** strike × intraday time with spot and node lifecycle.
5. **OI-change history:** strike × date using confirmed overnight OI.

Do not label all five merely “Heatmap.” Give every one an axis description and cadence badge.

## Native intraday signal system

### Non-negotiable rule

Every signal must declare a signal kind, one detector origin, and any supporting evidence origins:

- `OPTIONS_INTRADAY`
- `OPTIONS_EOD_CONFIRMED`
- `UNDERLYING_PRICE`
- `PROPHET`

An `OPTIONS_INTRADAY` signal must use `OPTIONS_INTRADAY` as its detector origin. Prophet, price, EOD OI, and other domains may appear in `evidence_origins`, evidence, or contradictions, but cannot silently become the detector source. “Cross-domain confluence” is a relationship among evidence sources, not an origin.

### Initial deterministic detectors

| Signal | Core question | Baseline trigger family | Important gates | Typical horizon |
|---|---|---|---|---|
| **Flow Burst** | Did meaningful Greek-adjusted activity accelerate abnormally? | premium, delta-notional, or gamma-notional per minute z-scored by ticker, DTE, liquidity, and time of day | quote quality, spread, cancels/corrections, minimum liquidity | 5–60 min |
| **Repeat Campaign** | Is related activity recurring in the same thesis? | same contract or nearby strikes/expiries clustered over 30s/1m/5m/15m and optionally days | complex/roll grouping, side confidence, concentration | intraday to multi-day |
| **Net Delta Impulse** | Did estimated options pressure change sharply? | signed delta-notional rate and acceleration, split 0DTE/1–7D/longer | NBBO confidence, underlying liquidity, product normalization | 1–30 min |
| **Price/Flow Confirmation** | Are price and options pressure moving together? | price return/break plus aligned delta/IV/volume impulse | level proximity, spread, catalyst, regime | 5–60 min |
| **Price/Flow Divergence** | Is price moving while options pressure fades or opposes it? | standardized price impulse versus options impulse residual | regime, ETF-hedge evidence, cross-product agreement | 5–60 min |
| **0DTE Hedge Pressure** | What underlying hedge demand is implied by current 0DTE flow? | call-buy/call-sell/put-buy/put-sell Greek decomposition with decay | explicitly modeled; cross-index normalization; confidence | 1–15 min |
| **Gamma Regime Change** | Did estimated dampening/amplifying structure change? | flip crossing, net-gamma sign/magnitude shift, 0DTE dominance change | model quality, OI vintage, minimum coverage | intraday |
| **Wall/Node Event** | Did a relevant level form, strengthen, migrate, hold, or break? | ranked exposure node change plus price interaction | persistence, minimum notional, replay-safe state | 5–60 min |
| **IV/Skew Dislocation** | Did implied vol reprice unusually relative to spot/term history? | residual IV, risk reversal, wing demand, term inversion | quote quality, event context, maturity history | 15 min–days |
| **Cross-Index Alignment** | Do SPX/SPY/QQQ or NDX/QQQ confirm one another? | normalized pressure/regime consensus or divergence | basis/session matching | 5–60 min |
| **Next-Day OI Confirmation** | Did apparent opening activity become settled OI? | T+1 ΔOI at contract/campaign level | strict no-lookahead; corporate actions; expiry | next session |
| **Off-Exchange Level Confluence** | Is an options setup interacting with an unusual equity print level? | price/flow signal at a neutral off-exchange level | licensed true prints; no directional claim | intraday–days |

Thresholds in the first implementation are research hypotheses, not immutable truths. Store raw features and detector version so they can be calibrated without rewriting history.

### Signal lifecycle

Every emitted signal follows:

`detected → confirmed → active → weakening → achieved | invalidated | expired`

Transitions must be deterministic and replayable. Example:

- **Detected:** raw threshold crossed.
- **Confirmed:** minimum persistence plus independent evidence.
- **Active:** entry/observation zone remains valid.
- **Weakening:** freshness decayed, pressure reversed, or evidence fell below threshold.
- **Achieved:** predeclared objective reached before invalidation.
- **Invalidated:** predeclared price/flow/structure condition failed.
- **Expired:** time horizon ended without achieved/invalidated.

Do not rewrite a signal’s original state after the fact. Append state-transition events.

### Signal card contract

Every signal card needs:

- human title and detector/version;
- symbol/product and option scope;
- origin and observed/inferred/modeled tags;
- detected/event/processed timestamps;
- reference underlying price;
- horizon;
- stance: bullish, bearish, volatility-up/down, range/pin, or non-directional;
- entry/observation zone, objective, and invalidation where applicable;
- primary reasons;
- contradictions;
- freshness;
- activity, intent, tradability, and setup dimensions;
- feed/model quality;
- sample size and calibration status;
- open chart/replay/chain/alert actions.

### Minimal machine contract

```ts
type OptionsSignalV1 = {
  schema_version: "options_signal_v1";
  signal_id: string;
  detector_id: string;
  detector_version: string;
  signal_kind: "OPTIONS_INTRADAY" | "OPTIONS_EOD" | "UNDERLYING_MODEL" | "CONTEXT";
  detector_origin: "OPTIONS_INTRADAY" | "OPTIONS_EOD_CONFIRMED" |
                   "UNDERLYING_PRICE" | "PROPHET";
  evidence_origins: Array<"OPTIONS_INTRADAY" | "OPTIONS_EOD_CONFIRMED" |
                          "UNDERLYING_PRICE" | "PROPHET">;
  symbol: string;
  product_family?: string;
  contract_ids: string[];
  event_time_utc: string;
  detected_time_utc: string;
  processed_time_utc: string;
  reference_underlying_price: number;
  horizon_seconds: number;
  stance: "BULLISH" | "BEARISH" | "VOL_UP" | "VOL_DOWN" | "RANGE" | "NONE";
  lifecycle_state: "DETECTED" | "CONFIRMED" | "ACTIVE" | "WEAKENING" |
                   "ACHIEVED" | "INVALIDATED" | "EXPIRED";
  levels?: { zone?: [number, number]; objectives?: number[]; invalidation?: number };
  scores: {
    activity: number;
    intent_confidence: number;
    tradability: number;
    setup_evidence: number;
  };
  reasons: Array<{ code: string; value?: number; text: string }>;
  contradictions: Array<{ code: string; value?: number; text: string }>;
  input_refs: string[];
  basis: {
    side_method: string;
    oi_asof?: string;
    dealer_model?: string;
    participant_basis?: string;
    feed_health: "COMPLETE" | "PARTIAL" | "DELAYED" | "STALE";
  };
};
```

Validate `signal_kind === "OPTIONS_INTRADAY" → detector_origin === "OPTIONS_INTRADAY"` at schema and persistence boundaries. The persisted record should also include feature values used at firing time. A reason string alone is not auditable.

### Outcome ledger

For each signal and detector version, compute:

- underlying return at 1/5/15/30/60 minutes and EOD;
- option mid return where a tradable contract is specified;
- IV change;
- maximum favorable excursion;
- maximum adverse excursion;
- time to peak;
- achieved/invalidated/expired;
- quoted spread and realistic slippage assumptions;
- market regime, DTE, ticker, event, and time-of-day cohort.

Publish:

- sample size;
- mean and median;
- distribution, not just “win rate”;
- calibration curve by score band;
- confidence interval;
- out-of-sample period;
- detector/model version;
- known survivorship and data-quality limitations.

Never compute results with next-day OI or corrected data before those inputs were historically available.

### Compliance and performance-claims gate

Before any P2 signal with zones, objectives, invalidations, personalized alerting, or public performance claims is sold:

- obtain legal/compliance review for the jurisdictions and customer types in scope;
- define the boundary between market analytics, generalized education, personalization, and recommendations;
- approve alert/action wording and required disclosures;
- document performance methodology, sample inclusion, costs, revisions, and out-of-sample periods;
- retain detector inputs, model version, original signal state, corrections, and claim-supporting evidence;
- prohibit cherry-picked examples and unqualified “win rate” marketing;
- review whether broker/order integration changes the regulatory posture.

This gate does not prevent deterministic research. It prevents product and marketing language from outrunning the evidence or intended legal posture.

## Data-truth architecture

### Data-rights and feasibility gate

The desired product assumes capabilities that the audit did not establish in the current feed: NBBO-at-trade, cancel/correct history, complex-order linkage, streaming transport, durable OPRA history, replay rights, and possibly participant-capacity/open-close data.

Before committing P1 architecture, build a vendor/source inventory for every required field:

| Requirement | Inventory decision |
|---|---|
| Source/vendor and feed product | Exact contract, environment, and owner |
| Observation completeness | Exchanges/products/conditions included and excluded |
| Latency SLA | Event, quote, normalized, and delivered p50/p95/p99 |
| Historical depth | Raw trades, quotes, corrections, and derived snapshots |
| Rights | Internal use, derived display, redistribution, retention, replay, export/API |
| Entitlements | OPRA/index/non-pro user agreements and per-subscriber requirements |
| Cost | Fixed, usage, per-user, storage, and egress |
| Failure behavior | Backfill, gap detection, corrections, and provider fallback |
| Auditability | Sequence IDs, timestamps, original/corrected records |

Produce a go/no-go matrix before promising product behavior. If a field or right is unavailable, the UI and detector must degrade explicitly rather than synthesizing certainty.

### Three truth classes

Every metric and visual layer must be marked:

1. **Observed** — exchange/trade/quote/underlying facts.
2. **Inferred** — side, opening/closing, campaign, spread, roll, hedge.
3. **Modeled** — dealer sign, GEX, hedge pressure, scenarios, expected outcomes.

Suggested UI, using OPRA only as an illustrative placeholder until the source and display rights are verified:

`OBSERVED · OPRA · event 18:43:12.442Z · received +186ms · COMPLETE`

`INFERRED · ask-side 0.82 · opening 0.46 · complex-order uncertain`

`MODELED · volume-estimated dealer pressure v2.1 · prior OI 2026-07-22`

### Normalized event requirements

The current event schema has timestamp, symbol, contract, DTE, moneyness bucket, approximate side, print count, size, average price, premium, z-score, vol>OI, repeat, 0DTE, signing source, and sweep. Add:

- immutable event and sequence IDs;
- exchange and trade condition;
- cancel/correct references;
- exact contract identity/multiplier/settlement;
- bid, ask, midpoint, and quote timestamp at execution;
- execution position within spread;
- underlying price and timestamp at execution;
- IV and Greeks at execution;
- premium, delta-, gamma-, vega-, and theta-notional;
- quote width, depth where licensed, and tradability;
- complex order/leg group and confidence;
- stock-option combination evidence;
- inferred aggressor side and confidence;
- inferred opening/closing and confidence;
- prior OI with explicit as-of;
- event, received, normalized, and published timestamps;
- feed completeness and source entitlement.

### Direction language

Public options flow direction is inferred unless proprietary exchange-level direction data is licensed. Use:

- `ask-side`
- `bid-side`
- `at/mid`
- `above ask` / `below bid` where accurate
- `side confidence`

Do not use:

- “institution bought”
- “institution sold”
- “smart money bullish”
- “new position confirmed”

without participant/open-close evidence.

Cboe notes the difference between actual proprietary direction and assumptions made from incomplete public data. Unusual Whales likewise documents that side is estimated from execution versus NBBO and does not mean buy-to-open.

- [Cboe: Debunking Options Myths](https://www.cboe.com/insights/posts/debunking-options-myths)
- [Unusual Whales flow methodology](https://docs.unusualwhales.com/features/2-options-flow/)

### Open-interest language

Open interest is a settled overnight fact. It normally stays static intraday and updates after clearing.

- show `OI as of YYYY-MM-DD`;
- call live approximations `estimated position change`, not OI;
- rename vol>OI to `volume exceeds prior OI`;
- use T+1 ΔOI as confirmation only after it became available;
- protect backtests from OI lookahead.

References:

- [Options Industry Council: Open Interest](https://www.optionseducation.org/news/open-interest-why-it-matters)
- [Cboe DataShop FAQ](https://datashop.cboe.com/faqs)

### Dealer-model language

Separate:

- prior-night OI GEX;
- intraday volume-estimated GEX;
- participant-capacity positioning where licensed;
- actual versus assumed dealer sign;
- index model versus fragile single-name model.

Every model output includes model ID/version, OI vintage, input window, participant basis, sign convention, coverage, and quality.

Consider licensing open/close volume by participant capacity. Cboe offers customer, professional customer, broker, firm, and market-maker summaries in EOD and interval products; this would materially improve credibility over OPRA-only dealer assumptions.

- [Cboe Option Trades datasets](https://datashop.cboe.com/option-trades)

### Dark-pool language

An off-exchange equity print has a buyer and a seller and is not intrinsically bullish or bearish. Treat it as:

- an observed print;
- an unusual size/level;
- a later price reaction;
- possible confluence.

Do not use Macro Dashboard’s FINRA short-volume aggregates as live dark-pool prints, and do not infer accumulation/distribution from them.

### 0DTE marketing restraint

0DTE positioning can matter, but “dealers are forced to buy/sell” should not be presented as observed fact. Cboe’s research describes balanced customer activity and much smaller aggregate hedging impact than some retail marketing suggests. Use “estimated dampening/amplifying pressure,” expose assumptions, and validate reactions.

- [Cboe: 0DTEs Decoded](https://www.cboe.com/insights/posts/0-dt-es-decoded-positioning-trends-and-market-impact/)

## Alerting and replay requirements

### Alerts

Users must be able to alert on:

- detector/lifecycle transition;
- activity/intent/tradability threshold;
- campaign repeat or acceleration;
- 0DTE pressure flip;
- wall/node formed, migrated, held, or broken;
- price crossing a level with/without flow confirmation;
- IV/skew dislocation;
- cross-index agreement/divergence;
- next-day OI confirmation.

Channels:

- in-app;
- desktop/mobile push;
- email;
- webhook;
- optional sound/voice.

Store delivery attempt, acknowledgement, retry, failure, and dedupe key. Alert replay must show exactly why it fired.

### Replay

Replay one consistent event stream:

- underlying quotes/bars;
- option trades and NBBO;
- campaigns;
- aggregate Greek flow;
- GEX/pressure surfaces;
- wall/node state;
- signals and lifecycle;
- alerts.

Required controls:

- date;
- session time;
- 1×/5×/15×;
- event-by-event;
- jump to signal;
- hide future;
- compare model versions only in an explicitly labeled research mode.

A static daily screenshot or a date dropdown is not replay.

## Implementation architecture

The current Terminal primarily consumes generated artifacts. The producer logic for enrichment, matrix standout selection, and several nightly products is not fully present in this repository. Before implementation:

1. identify the canonical producer repository/job for every `/api/flow?f=...` artifact;
2. assign an owner and schema version;
3. add contract fixtures generated by the same schemas;
4. reject incompatible payloads instead of silently substituting empty objects;
5. publish atomically with one manifest/generation ID.

Suggested bounded contexts:

```text
options-ingest
  raw trades · quotes · corrections · reference data

options-normalize
  canonical contracts · NBBO join · Greeks · condition handling

options-inference
  side confidence · complex groups · opening confidence · campaigns

options-structure
  OI vintages · GEX/DEX/VEX/charm · walls/nodes · index normalization

options-signals
  deterministic detectors · lifecycle · alert events

options-outcomes
  replay-safe forward outcomes · calibration · research datasets

terminal-options-ui
  Live Desk · 0DTE · Ticker Lab · Structure · Signals/Replay
```

Use append-only event/state records and deterministic reducers where possible. Store a dataset generation ID in every derived artifact so mixed generations are visible and rejectable.

## Prioritized delivery plan

### P0 — truth, defects, and simplification

**Goal:** stop misleading users and make the current suite internally consistent.

- fix the fourteen correctness defects listed above;
- secure and entitlement-gate `/api/flow`;
- expose event/artifact/model age and feed completeness;
- rename Flow Score to Attention/Activity and remove predictive tier language;
- rename vol>OI everywhere;
- distinguish live, delayed, nightly, and T+1-OI modes;
- merge Desk and Tape navigation without deleting useful layouts;
- move Prophet, Leaders, and Radar out of the default live journey;
- remove unreachable legacy volatility code after link audit;
- unify watchlist and ticker state with the chart workspace;
- add option-specific contract/unit/E2E tests;
- make fixtures complete, current, symbol-correct, and schema-validated.
- complete the vendor/source, entitlement, retention, redistribution, latency, history, and cost feasibility matrix.

**Acceptance gate:**

- no selected filter can silently show a different dataset;
- no “live” label exceeds its defined latency budget;
- all visible values show cadence and as-of;
- no options API data is accessible without correct entitlement;
- no fixture route crashes;
- source/fixture schemas pass CI;
- no unvalidated score is called probability, conviction, elite, or strong.
- every P1 data requirement has a verified source, right-to-use decision, cost, latency budget, and fallback.

### P1 — competitive workflow foundation

**Goal:** create a usable paid live-options core.

- normalized NBBO-enriched event stream;
- streaming delivery with reconnect/backfill and completeness;
- merged Live Desk with grouping and universal search;
- shared watchlists, saved views, alerts, and chart handoff;
- Ticker Lab with synchronized price/event/chain context;
- Structure workspace with real expiry filtering and call/put-separated matrices;
- initial 0DTE/index board with SPX/SPY/QQQ;
- basic synchronized replay;
- append-only signal and lifecycle schema.

**Acceptance gate:**

- event appears within a documented p95 latency;
- cancel/correct and reconnect do not duplicate signals;
- event → chart → chain → replay preserves symbol/contract/time;
- 0DTE never falls back to another expiry;
- saved views and alerts persist across sessions;
- replay reproduces the same detector output.

### P2 — options-native differentiation

**Goal:** originate useful, explainable intraday signals.

- Flow Burst, Repeat Campaign, Net Delta Impulse;
- price/flow confirmation and divergence;
- 0DTE Hedge Pressure;
- gamma-regime and wall/node lifecycle detectors;
- IV/skew dislocation;
- cross-index alignment;
- Estimated Hedge Pressure Map with price overlay;
- signal outcome ledger and initial calibration UI;
- T+1 OI confirmation from Macro;
- synchronized signal/tape/map replay.

**Acceptance gate:**

- every signal has provenance, contradictions, lifecycle, and replay;
- no detector consumes future information;
- model version and sample size are visible;
- detector performance includes MFE/MAE and costs, not just win rate;
- insufficient data prevents—not merely annotates—strong conclusions.
- compliance-approved signal, alert, personalization, and performance-claims language is in place.

### P3 — subscription moat

- participant-capacity/open-close data where commercially justified;
- VEX/charm production lenses;
- custom no-code signal recipes;
- historical recipe backtests;
- mobile alerts and review;
- journal linkage;
- advanced exports/API/webhooks;
- cross-product SPX/SPY/XSP/ES and NDX/QQQ confluence;
- licensed live off-exchange print levels;
- strategy/contract scenario simulator.

## Claude implementation sequence

Claude should not begin with a visual rewrite. Use this sequence:

1. **Create an inventory document** mapping every UI metric to producer, schema, cadence, source, assumption, and owner.
2. **Add schema validation** at producer output, `/api/flow`, and fixture generation.
3. **Write regression tests for known defects** before fixing them.
4. **Fix P0 correctness, auth, freshness, and naming.**
5. **Create shared URL-addressable Options workspace state.**
6. **Merge Tape/Desk and connect events to chart/watchlist/alerts.**
7. **Define normalized event and signal contracts.**
8. **Implement streaming transport and replay journal.**
9. **Build the 0DTE shell using observed inputs first.**
10. **Add deterministic detectors one at a time with outcome capture.**
11. **Build the Estimated Hedge Pressure Map from versioned/replayable structure snapshots.**
12. **Only then add AI explanations and advanced scoring.**

Likely initial code touchpoints:

- `terminal/components/OptionsHubView.tsx`
- `terminal/components/flowdesk/*`
- `terminal/components/gexdesk/*`
- `terminal/components/prism/*`
- `terminal/components/prophet/*`
- `terminal/components/heatmap/*`
- `terminal/app/api/flow/route.ts`
- `terminal/lib/flowClientCache.ts`
- `terminal/lib/flowScore.ts`
- the external producer(s) behind flow/enrich/matrix/GEX/Prophet artifacts

Before changing Next.js code, follow `terminal/AGENTS.md` and the repository’s bundled Next.js version documentation.

## Definition of done for a competitive v1

A professional user can:

1. open Options and immediately understand feed health, index regime, levels, and active changes;
2. see a live options event with NBBO/Greeks/tradability and honest side/opening confidence;
3. follow related prints as one campaign;
4. open the underlying chart at the exact event time;
5. inspect the relevant chain, surface, node, and catalyst without losing context;
6. monitor SPX/SPY/QQQ 0DTE structure and modeled pressure;
7. receive an options-originated signal with evidence, contradiction, target/zone, invalidation, and lifecycle;
8. create and receive a reliable alert;
9. replay the complete setup without future leakage;
10. see how the detector performed across comparable samples and costs;
11. return next day to see whether the apparent position was confirmed by OI;
12. move between Terminal and Macro without losing symbol, date, or signal.

If any of those steps requires understanding which of ten branded tabs might contain the answer, the redesign is not finished.

## What not to build

- another generic whale-tape page;
- a decorative ticker heatmap presented as dealer analysis;
- a static prior-night GEX chart labeled real-time;
- categorical bullish/bearish calls based only on ask/bid side;
- “institutional” or “smart money” claims without participant evidence;
- a proprietary score whose decomposition and calibration are hidden;
- a HeatSeeker copy or name;
- AI prose as the source of a signal;
- win rates based on maximum excursion without expiry, invalidation, spread, or slippage;
- more peer-level tabs;
- live dark-pool claims derived from EOD FINRA short-volume files;
- duplicated Macro pages inside Terminal.

## Final product recommendation

Preserve the existing tape, Ticker view, GEX calculations, PRISM matrix, education, bilingual support, and caution language. They represent meaningful work. But stop treating their existence as competitive completeness.

The upgrade should center on three flagship experiences:

1. **Live Desk** — trustworthy tape-to-campaign investigation.
2. **0DTE & Index Command Center** — price, dealer pressure, structural change, and cross-index context.
3. **Signals & Replay** — options-originated, lifecycle-managed, auditable setups with outcomes.

Everything else should support those experiences or move to the Macro Dashboard’s EOD research workspace.
