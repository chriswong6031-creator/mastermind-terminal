# Market Structure Core — Masterplan (2026-08-01)

**Status:** ACTIVE program. Sibling of `docs/OPTIONS_SUPERINTELLIGENCE_MASTERPLAN_2026-07-31.md`
(which owns *QuantData-class capability parity* — tape, filters, playback, IA). This document owns
the **other half of the estate**: turning options data into **dealer-positioning, gamma-structure and
volatility-mechanics intelligence**, and wiring that intelligence into the Terminal, Neural Web and
Prophet.

> **Division of labour.** OPTIONS_SUPERINTELLIGENCE = *"see every print, replay every minute."*
> MARKET_STRUCTURE_CORE = *"interpret what the whole inventory does to price."* They share the
> same data plane and the same honesty doctrine; they do not overlap in surfaces.

**Commissioning intent (operator, 2026-08-01):** dissect MenthorQ, SpotGamma, VolSignals/VS3D and
IVolatility end-to-end; rebuild their capability inside Mastermind — front end and back end —
with upgrades that make ours materially stronger; then integrate the resulting signal layer into
the Terminal intraday options suite, Neural Web context, Prophet signalling, and the Macro
Dashboard's EOD options plane.

**Evidence base.** Six parallel teardowns + two authenticated live walkthroughs, all filed under
`docs/audits/2026-08-01-market-structure-core/`:

| File | What it contains |
|---|---|
| `spotgamma-teardown.md` | 417 support-centre articles + TRACE manual: every level, HIRO, TRACE, Equity Hub, Compass, Vol Dashboard, cadences, pricing |
| `menthorq-teardown.md` | Academy/guides census of the 20+ models, delivery channels, pricing |
| `volsignals-teardown.md` | VS3D positioning grids, gradient charts, methodology |
| `ivolatility-teardown.md` | IVX methodology, vol analytics suite, data/API products |
| `dealer-positioning-math.md` | **The quant reference** — every formula, estimator, backtest design, prior art, honesty tiering |
| `repo-integration-map.md` | Our own code: every f-param, payload schema, builder, seam |

Live walkthroughs (this session, authenticated browser): **MenthorQ dashboard** (Summary, Chart,
Levels, Options Matrix/Heatmap/Exposure, Explore screeners, Quin AI) and **VolSignals VS3D**
(Positions by Strike, Position Grid, Gradient Chart, Dashboard, full docs set).

---

## 0. Executive assessment

### 0.1 What these four products actually are

| Product | One-line identity | Real moat | Price |
|---|---|---|---|
| **SpotGamma** | The category's *vocabulary owner*. Two dealer-positioning models (assumption-driven "Total OI", flow-classified "Synthetic OI") rendered through 8 surfaces. | Brand + published hit-rate statistics + Bloomberg distribution. **No public API.** | $99 Essential / $299 Alpha |
| **MenthorQ** | A *level factory*. One nightly + intraday gamma model reduced to ~20 named lines, syndicated to TradingView/Sierra/NinjaTrader, wrapped in an AI chat ("Quin") and NL screeners. | Breadth (equities, futures, FX, crypto) + distribution into charting platforms | ~$129/mo |
| **VolSignals / VS3D** | An *SPX/VIX specialist instrument*. Participant-tagged positioning grids and greek gradient surfaces, live + replay. | **CBOE participant-tagged data** (see §0.2) — the only genuine data moat of the four | Tiered, Pro gates CSV/Simulation Grid |
| **IVolatility** | A *volatility-analytics utility and data vendor*. IVX surfaces, rank/percentile, skew/term tooling, plus historical options data + API + AI backtesting. | 20+ years of cleaned surface history sold as data | Data-plan led |

### 0.2 The single most important finding

**VolSignals' participant selector is the CBOE/OCC account-origin taxonomy.** Their config exposes
exactly: *Market Maker · Broker Dealer · Firm · Customer · Pro Customer*, and their own docs state
"the platform processes CBOE options data." Those five values are the origin codes on the exchange
**Open-Close volume** product — a licensed dataset that tags every contract's volume by account type
**and by opening vs closing transaction**.

SpotGamma's "Synthetic OI" model exposes the *same five* participant lenses. Two independent
vendors converging on one taxonomy is not a coincidence: **the top of this market runs on licensed
participant-tagged open-close data, not on clever inference.**

Consequences for us, in order of importance:

1. **The moat is buyable, not magical.** A CBOE Open-Close (LiveVol) subscription converts our
   positioning estimates from *inference* to *measurement* for the index complex. This is the one
   spend decision in this plan (§R7 / §8) and it is the difference between competing and leading.
2. **Until we buy it, we must be probabilistic — and say so.** Our tape + NBBO + ΔOI gives an
   *estimator* (`dealer-positioning-math.md` §5), not ground truth. Our honesty doctrine turns that
   into an advantage: **we publish sign-confidence; they publish none.**
3. **The naive "dealers long calls / short puts" convention is a prior, not a fact** — and our
   current `options_hub` payloads already bake it in silently. Fixing that disclosure is Wave 1.

### 0.3 Cloneability re-scored

The commissioning brief scored cloneability 6.5/10 with a medium-to-high data moat. After the
teardown, that decomposes:

| Layer | Cloneability | Note |
|---|---|---|
| Level vocabulary & math (walls, flip, expected move, absolute gamma, tilts) | **9/10** | Fully documented or trivially derivable; we already compute most of it |
| Greek surfaces & gradient/heatmap visualisation | **8/10** | Rendering problem, not a data problem, once intraday chains are stored (U-CHAIN exists) |
| Real-time flow-impact line (HIRO class) | **6/10** | Needs sub-minute tape (our known cadence blocker) + a hedged-trade classifier |
| Participant-tagged inventory (TRACE / VS3D class) | **3/10 without a licence, 8/10 with one** | This is the entire moat |
| Backtested level statistics | **10/10 — and it is an open flank** | They assert hit-rates from static PDFs; a live, continuously-recomputed scorecard is strictly better and we already have a level-grading lane |

**Where we can be better than all four, starting immediately:**

1. **Publish uncertainty.** Nobody in this category ships a sign-confidence, a sensitivity band, or
   a model card. Our doctrine already demands it. This is a differentiator we get for free.
2. **Normalise levels to expected move.** All four quote levels in price. A wall three expected
   moves away is decoration; a wall 0.3 EM away is the session's structure. **Nobody does this.**
3. **Live-graded levels.** SpotGamma's hit-rates are a 2018–2024 static marketing artifact. Ours
   recompute nightly with n and confidence intervals, per ticker.
4. **Scenario-first, not level-first.** VS3D's best idea ("Delta Change" — how much delta must a
   hedged dealer trade to get from *here* to *(t, S)*) is a 2-D field. We generalise it to a full
   (ΔS, Δσ, Δt) hedge-flow surface — gamma **and** vanna **and** charm in one object.
5. **A real API.** SpotGamma explicitly has none; MenthorQ's is thin. Levels + positioning +
   grades over HTTP is a product in itself.
6. **One brain.** None of them feed a macro regime engine or a trade-management system. Our
   Neural Web and Prophet integrations (§6, §7) are capability they structurally cannot match.

---

## 1. Capability census — what exists out there

### 1.1 SpotGamma (from 417 crawled support articles + the public TRACE manual)

**Models.** Two, and every surface is a view over one:
- *Total OI* (legacy, assumption-driven): dealers modelled **short every option** for single stocks;
  for **index** products the assumption flips to the street book — **short puts / long calls**.
- *Synthetic OI* (Options Inventory Model): classifies each transaction to track who bought vs sold,
  producing **signed per-participant inventory** — the five-way participant lens. Can render
  **negative OI** at a strike (sign = estimated dealer direction). Adds *High/Low Volatility Point*
  (most-negative / most-positive gamma strike).

**Level dictionary** (paraphrased): Call Wall · Put Wall · Zero Gamma/Gamma Flip · Volatility
Trigger™ · Hedge Wall · Absolute Gamma Strike · Key Gamma Strike · Key Delta Strike · Large Gamma
Strikes 1..n · Combos 1–5 (ETF+index merged, mapped to ES/NQ/RTY/YM) · SG Implied 1-Day and 5-Day
Move · SIV curve (expected-move % as a function of spot — feeds their vanna model) · Gamma Index
(−4…+4 dial) · Gamma Notional · CP Gamma Tilt · Delta Tilt · Gamma/Delta in Next Expiration % ·
Reference Price/VIX Ref (staleness disclosure) · 25Δ Risk Reversal · DPI (dark-pool indicator).

**Published statistics** (their trust engine, SPX 2018–2024): intraday high stayed below Call Wall
83% of sessions (close below 88%); intraday low held Put Wall 89% (close above 93%); realized vol
averaged materially higher below the Volatility Trigger than above.

**HIRO.** Per-trade estimated signed **delta-notional hedge requirement**, summed over a rolling
window (1m…1d), plotted against price; filters for *All trades minus classified pre-hedged flow*,
*Next Expiry*, and *put/call split*; a 30-day/5-day/today gauge that normalises "unusual for this
name"; per-symbol dynamic alert thresholds; ~400 symbols; TA indicators can be applied to the HIRO
series itself.

**TRACE.** (time × strike) heatmap of modelled hedging pressure with three lenses — **Gamma**
(expected local RV), **Delta Pressure** (net dealer delta change across price/time; meaning is
*conditional on the gamma regime*), **Charm Pressure** (time-decay-driven flow) — plus a live strike
plot, a proprietary **Stability** gauge (probability-of-calm over the next ten minutes), key-level
overlay, intraday timeline replay, and forward projection. SPX-focused.

**Cadences.** Equity levels daily 03:00 ET; Synthetic OI before the open; HIRO real-time with 5-day
history; TRACE 1-min data with ~10-min heatmap frames; Tape ~30 s; OCC indicator weekly.

**Distribution.** Web SPA, twice-daily Founder's Note, **Bloomberg App Portal**, and "cloud notes"
level syndication into Bookmap, NinjaTrader, Sierra Chart, TradingView, thinkorswim and more.
**No public API** (support states this explicitly); CSV export only.

### 1.2 MenthorQ (live walkthrough, 2026-08-01)

**The product is a level string.** Their Levels page emits, per ticker per date, a single
copy-paste line for TradingView. Verified live for SPX (2026-07-31):

- **Gamma Levels (EOD and Intraday variants):** `Call Resistance · Put Support · HVL · 1D Min ·
  1D Max · Call Resistance 0DTE · Put Support 0DTE · HVL 0DTE · Gamma Wall 0DTE · GEX 1…GEX 10`.
  Intraday levels are timestamped (observed 15:30) and differ from EOD; EOD levels are dated for the
  next session. `1D Min/Max` carry decimals (IV-derived band); everything else snaps to strikes.
- **Blind Spots:** `BL 1…BL 10`, **non-strike, fractional** prices — a derived reaction-zone model,
  not an OI ladder.
- **Swing Levels** and a **5-day swing band** (upper/lower) used heavily by their screeners.

**Semantics** (their own AI assistant, asked directly): Call Resistance = strike with the highest
concentration of call gamma; Put Support = highest put-gamma strike; **HVL = the strike where net
dealer gamma flips sign**; GEX 1–10 = secondary gamma concentrations ranked by magnitude, used as
intraday turning points and scalp targets; 0DTE model uses a **narrower calculation range** than the
main model, producing a denser cluster of levels; Blind Spots = correlated-gamma / secondary-OI
clusters that become targets once primary levels fail; 1D Min/Max = an IV-implied expected daily
range. They explicitly decline to publish formulas.

**Surfaces.** *Summary* (price, QScore with Option/Momentum/Volatility/Seasonality sub-scores and
30-day trends, **Gamma Insight EOD** = net-GEX history line + per-expiry forward bars with
`Total Net GEX / GEX Change 1D / Expiring Net GEX`, **Volatility Insight** = IV level + HV + IV
percentile + IV rank, Skew with a put-bias reading, VRP with a compressed/normal/elevated band, and
a term-structure contango/backwardation panel) · *Chart* (TradingView-style with their levels) ·
*Options → Matrix* (per-expiration rows × `GEX · DEX · GEX Normalized · DEX Normalized · OI
Normalized · GEX Change 1D · DEX Change 1D`, with a Total Exposure header row and an EOD/Intraday
switch) · *Options → Heatmap* (strike × expiration, metric ∈ `Net GEX · Net DEX · OI · Volume ·
Abs GEX · Abs DEX · IV × OI`, strike-window selector) · *Options → Exposure* (per-expiry share strip
with % of total and DTE, then a strike ladder with a **level overlay picker** — HVL, CR, PS, CR 0DTE,
PS 0DTE, 1D Max, 1D Min — and a Put/Call OI column) · *Levels* (the syndication page, with
prev/next-date navigation = a level archive) · *Explore/Create/Saved* (natural-language screeners).

**Screener vocabulary** (observed): Swing Bias, 5D swing bands and distance-to-band, Skew 1M and its
1-year percentile, GEX, **GEX P/C ratio**, IV 0DTE/1M/3M 1-year percentiles, HV30, **Volatility
Score**, VRP, **1W Expiring GEX** and its share of total GEX, market cap, close. Categories: Swing
Trader · Extreme Positioning · Iron Condor · Option Seller · Option Buyer · Sector Rotation ·
Directional.

**Backend shape** (observed network calls): a ClickHouse-backed gateway with clean resource routes —
`/gamma-levels/{SYM}/eod`, `/gamma-insights/{SYM}?limit=`, `/gamma-insights/{SYM}/expirations`,
`/volatility-insights/{SYM}`, `/options/matrix/{SYM}?frequency=intraday`, `/screeners/columns`,
`/prices`, `/market-status/{MIC}`. Coverage spans equities, index, **futures** (ES/NQ/FX/energy
contract codes appear in their ticker list) and crypto.

### 1.3 VolSignals / VS3D (live walkthrough + full docs, 2026-08-01)

**Universe: SPX and VIX only.** Deliberate specialisation.

**Data:** CBOE options data with the five-way participant taxonomy (§0.2). Default view is Market
Maker "as this is often the most informative for understanding market structure and hedging flows."

**Views.**
- *Positions by Strike* — horizontal bars of **net position in contracts** per strike, with:
  view-mode `Position | Candlestick` (candlestick = OHLC of the position's intraday range per strike
  — an excellent idea), participant filter, expiration filter (`All | DTE | Custom`),
  `Total | Calls | Puts`, **comparison dots** (position 10 minutes ago, and versus market open or a
  custom timestamp), 0.5×/1× straddle bounds as price indicators, bar alignment, and strike bucketing
  (5/10/25/50).
- *Positions by Expiration* — the same aggregate across the term structure.
- *Position Grid* — strike × expiration heatmap of net position, with strike **and expiration**
  bucketing (day/week/month/quarter/year), three expiry-label formats, and
  **percentile-range colour normalisation** (default 5–95) so outliers cannot wash out the field.
  CSV export is a Pro gate.
- *Gradient Chart* (their signature) — candlesticks over a continuous greek field in (time × price):
  greek ∈ `Gamma | Delta | Charm | Vanna | Delta Change`; **Vol Adjust 0% / +1%** scenario; contour
  lines tracing the zero boundary and ridges; colour schemes and **intensity curves**
  (`Square Root | Power Law | Arcsinh`) to control how the gradient responds to magnitude; RTH
  toggle; a crop/zoom brush; live and historical replay.
- *Simulation Grid* (Pro) — simulated greek values across price and time intervals.
- *Custom Dashboard* — drag-and-drop 12-column grid, up to 20 widgets, **layout persisted in the
  URL** (shareable), each widget independently configured with its own live/historical state.

**Their best concept — "Delta Change".** Defined in their docs as the difference between the current
position delta and the position delta computed at a future point in time and price; because market
makers are assumed continuously hedged, that difference **is** the delta they will have to trade to
get from here to there. They describe it as showing "the path (or paths) of least resistance", and
as combining gamma and charm into a single view. This is the sharpest idea any of the four products
has, and it is a strictly better framing than a static gamma level.

### 1.4 IVolatility

Long-running volatility-analytics utility and data vendor: **IVX** interpolated implied-vol indices
by tenor, IV rank/percentile with configurable lookbacks, HV suite, fixed-strike IV matrices with
z-scores, term structure with historical cones, skew charts by strike/delta/moneyness, options
calculators and probability tools, scanners, earnings analytics; plus historical EOD/intraday
options data, delta-based IV surfaces, a REST API, Snowflake/FTP delivery, and an AI backtesting
module. **What to take from them is the vol dashboard grammar** — fixed-strike matrix coloured by
z-score, term structure with a percentile cone, skew with historical bands — which SpotGamma also
converged on, and which our own Volatility tab currently lacks.

---

## 2. Our ground truth (verified 2026-08-01)

Full detail in `docs/audits/2026-08-01-market-structure-core/repo-integration-map.md`.

**What we already compute and publish** (macro → R2 → Terminal):

- `options_hub/gex/{ROOT}.json` — per-strike **`gamma_net`, `gamma_call`, `gamma_put`, `delta_net`,
  `vanna_net`, `charm_net`** (±20% of spot, 160-strike cap, uncut count disclosed), `by_expiry`
  (`gamma_net`, `delta_net` per expiration), `net_gex_bn`, `gamma_flip`, `call_wall`, `put_wall`,
  convention string, coverage, and a 30-session scalar `history[]`.
- `options_hub/gex_history/{ROOT}/{DATE}.json` + `dates.json` — dated full ladders since 2026-07-16,
  hole-healed, with a Terminal date picker already shipped (R0.10).
- `options_structure/gex_state/{ROOT}.json` — regime, stability, `dist_to_flip_pct`, magnet,
  max pain, **`pin_probability`**, gravity, cascade/upside triggers, OI-delta clusters,
  reliability notes, `authority_tier: "display"`.
- `options_structure/matrix/{ROOT}.json` — strike × expiry cells (gex/oi/vol/Δoi/vex).
- `options_hub/vol/{ROOT}.json` — ATM IV, IV rank (252d and all), 52w range, RV20, **VRP**, term
  structure, per-expiry smile, 90-day history.
- `options_hub/moves/{ROOT}.json` — expected-move band **with matched containment calibration** from
  `data/levels/grades.parquet` (min 8 sessions per ticker).
- `options_hub/{oi_time,max_pain,oi_change}/{ROOT}.json` — the OI suite (shipped 2026-08-01).
- `live_flow/surface/{ROOT}/…` — intraday per-strike net-premium **and** GEX/DEX/vanna/charm grids
  for SPY/QQQ/IWM, 10-session retention, with a replay spine.
- **U-CHAIN** (`data/chain_snapshots/`) — 15-minute full-chain snapshots with 1st **and 2nd-order**
  greeks (gamma/vanna/charm/vomma/veta) across ~150 roots. Bootstrapped 2026-07-31.
  **No R2 publisher yet — this is the single most valuable unlit asset we own.**
- 60 GB EOD store with a 51 GB full greek surface, 2017→present, 380+ roots.

### 2.1 ⚠️ Measured on LIVE production R2 (2026-08-01) — the flip defect is real and shipping

Predicted from the code, then confirmed against the public R2 payloads. **Two builders publish a
`gamma_flip` for the same root and they disagree catastrophically:**

| Root | spot | `options_hub/gex` flip | distance | plausible? |
|---|---|---|---|---|
| SPY | 741.69 | **275.0** | **62.9% away** | no |
| QQQ | 683.55 | **249.8** | **63.5% away** | no |
| SPX | 7437.63 | **8676.93** | **16.7% away** (above both walls) | no |
| NVDA | 195.04 | 219.55 | 12.6% away | doubtful |
| IWM | 292.59 | `null` | — | absent |

Against `options_structure/gex_state/SPY.json`, whose flip is computed by a **different** builder
(`engine/gex_state.py`): **752.2 with spot 750.72 — 0.2% away.** Sane.

So the Exposure desk currently renders a nonsense flip in its summary bar and ladder while the
Market State card beside it renders a sane one. The cause is exactly what §2's table predicted:
`engine/options_hub.py::_find_gamma_flip` takes the nearest zero-crossing of *cumulative net GEX by
strike*, which on a put-heavy book walks the cumulative sum far down the ladder; `gex_state` does
not use that method. **The fixture hides it** — `gex_fixture.json` carries a sane SPY flip of 748.3,
which is why every local verification pass has looked correct.

**Root cause CONFIRMED** — full analysis, numeric reproduction and fix spec in
`docs/audits/2026-08-01-market-structure-core/gamma-flip-defect-rca.md`. The short version:
`_find_gamma_flip` computes the zero-crossing of the **running partial sum of dealer gamma across
the strike ladder**, gammas frozen at today's spot, unwindowed. The real flip is the hypothetical
spot `S*` at which the whole book **re-priced at `S*`** has zero net gamma — which is exactly what
`gex_engine._gamma_flip` does on a 101-point ±25% grid, and what reaches `gex_state` through
`gex_model.build_model`. Two different mathematical objects; agreement would be coincidence. The
docstring claiming it "mirrors gex_engine._gamma_flip" is false, and is what let this survive.

Five extra findings from that analysis, each of which changes the work:

1. **All five symptoms are one bug in three regimes.** Reproduced on the real
   `polygon_gex/chains/2026-07-09.parquet`: with negative net GEX the cumulative series never
   recrosses zero on a shallow ladder ⇒ `null` (IWM); deepen SPY's ladder and the *same book*
   returns 379.96 with eight crossings in the deep tail ⇒ the gross failures. Positive net GEX
   yields a single crossing where the integral turns positive ⇒ SPX/NVDA. **The last case is the
   dangerous one** — 12–16% off survives every guard and reads as credible.
2. **The same JSON is self-contradictory.** `history[]` is sourced from `summary_{ROOT}.parquet`,
   which *is* grid-method and *is* sane (SPY 747.83 against spot 745.40). The desk renders the
   broken scalar and the sane history side by side.
3. **A frontend workaround already existed** (`GexDeskView.tsx`, citing "285 vs spot 748"): a ±20%
   plausibility band. So SPY/QQQ render **no** flip while SPX/NVDA render the **wrong one as real**.
   That guard is now centralised in `lib/marketStructure.ts` (`guardedFlip`) so this desk and the
   Positioning tab cannot disagree, and so the whole workaround is deleted in one place at R1.1.
   Its blind spot is pinned by a test that names SPX and NVDA.
4. **Sibling defects, same shape:** `vex_engine._find_vex_flip` is broken identically (so `vex_flip`
   is live-wrong too), and `levels_engine._flip_from_rows` replicates it with `min(crossings)` —
   worse. R1.1 must fix all three, not just the one we happened to measure.
5. **A backfill is required, and ordering matters.** `gex_history/{ROOT}/{DATE}.json` is a verbatim
   payload copy, and `_heal_gex_history` re-runs the same `compute_gex` — so after the fix, healing
   a past date would still mint a *new* bad snapshot unless the repair ships with it. Sequence:
   fix → verify one nightly → then backfill (only `gamma_flip` needs rewriting).

Consequences for sequencing:
- **R1.1 is promoted to the critical path** and is no longer a refinement — it is a live-data repair.
  Route the hub payload's flip through `engine/gex_engine.py`'s existing ±25% spot-grid
  re-evaluation, and reconcile against `gex_state` before cutting over.
- The Positioning tab's **levels-in-expected-moves module surfaces this on sight**: SPY's flip
  renders at **69 expected moves away, tagged "far"**, instead of being drawn as a confident level.
  That is the honesty tiering doing its job, and it is why the module ships in wave 1.
- Add a **cross-builder agreement check** (hub flip vs gex_state flip, alert past a tolerance) to the
  R0.9 dead-man switch set — two builders silently disagreeing by 63% is exactly the class of failure
  that no freshness anchor catches.
- Separately: `options_structure/gex_state/SPY.json` was stamped **2026-07-17** while
  `options_hub/gex/SPY.json` was **2026-07-30** — a 13-day-stale lane, its own R0.9 item.

**Where our math is behind the category:**

| Gap | Detail | Fix |
|---|---|---|
| **Flip level uses the naive method** | `engine/options_hub.py::_find_gamma_flip` takes the nearest zero-crossing of *cumulative net GEX by strike*. That conflates a strike axis with a spot axis. (`engine/gex_engine.py` already has the correct ±25% spot-grid re-evaluation — the right code exists, the hub payload just doesn't use it.) | R1.1 — route the hub payload through the profile method |
| **The dealer-sign convention is silent** | `gamma_call` is published positive and `gamma_put` negative; the naive prior is baked in with only a `convention` string. No sensitivity, no confidence. | R0.1 (Wave 1) — sensitivity band in the UI, then a posterior in the engine |
| **No spot-grid profile is published** | We publish exposure *at* spot, never *as a function of* spot. Every competitor's flagship chart is the profile. | R1.1 |
| **No hedge-flow projection** | We publish greeks; we never translate them into "dealers must trade $X if spot moves 1% / IV moves 1pt / a day passes". | R0.2 (Wave 1, local estimate) → R1.3 (full re-pricing) |
| **Levels are not normalised to expected move** | Walls are quoted in price only. | R0.3 (Wave 1) |
| **Level grades are computed but unsurfaced** | The seal/grade lane writes `data/levels/grades.parquet`; only `moves` consumes it, as a calibration scalar. | R2.4 |
| **No participant dimension at all** | Category leaders sell exactly this. | R7 (spend gate) |

---

## 3. The gap matrix

| # | Capability | Best-in-class reference | Ours today | Wave |
|---|---|---|---|---|
| M1 | Net GEX by strike and expiry | all four | ✅ shipped | — |
| M2 | Zero-gamma / flip via the **profile** method | SpotGamma, MenthorQ (HVL) | ⚠️ naive method | R1.1 |
| M3 | Call/put walls | all four | ✅ shipped | — |
| M4 | **Absolute-gamma strike** (\|call\|+\|put\|) | SpotGamma | ❌ derivable from published fields | R0.4 |
| M5 | Delta pressure surface | SpotGamma TRACE, VS3D | partial (surface tab, 3 roots) | R1.2 |
| M6 | Charm and vanna exposure profiles | VS3D, SpotGamma | per-strike values only, no profile | R1.1 |
| M7 | **Hedge-flow projection across (ΔS, Δσ, Δt)** | VS3D "Delta Change" (2-D) | ❌ | **R0.2 → R1.3 (3-D, our upgrade)** |
| M8 | 0DTE vs longer-dated split | MenthorQ 0DTE level set, SpotGamma | partial (dte tide) | R0.5, R2.2 |
| M9 | OPEX unwind / expiring-gamma share | SpotGamma "gamma in next expiration %" | ❌ derivable from `by_expiry` | R0.5 |
| M10 | IV vs RV gap | MenthorQ VRP, IVolatility | ✅ `vrp` in vol payload, thinly surfaced | R2.3 |
| M11 | Skew and term-structure regimes | IVolatility, SpotGamma, MenthorQ | partial (Volatility tab) | R2.3 |
| M12 | Expected dealer hedge requirement per scenario | none ship the full grid | ❌ | R0.2 / R1.3 |
| M13 | Pinning probability | none publish a calibrated one | `pin_probability` exists, **ungraded** | R2.5 |
| M14 | Vol expansion/contraction regime | SpotGamma Vol Trigger, MenthorQ | partial (`volregime`) | R2.3 |
| M15 | Options-derived S/R overlaid on the Terminal chart | SpotGamma/MenthorQ syndication | ❌ | R3.1 |
| M16 | **Historical playback proving whether each level worked** | nobody does this live | grades computed, unsurfaced | **R2.4 — our flagship** |
| M17 | Participant-tagged inventory | VS3D, SpotGamma Synthetic | ❌ | R7 (spend) |
| M18 | Flow-impact line (HIRO class) | SpotGamma | ❌ (blocked on tape cadence) | R4 |
| M19 | Levels API / syndication | SpotGamma has none; MenthorQ thin | ❌ | R5 |
| M20 | **Sign-confidence / sensitivity disclosure** | **nobody** | ❌ | **R0.1 — ships first** |

---

## 4. Architecture

### 4.1 The honesty tiering (binding law for this program)

Adopted from `dealer-positioning-math.md` §12. **Every Market Structure Core output declares its
tier, and the UI renders tiers differently.**

- **Tier A — deterministic.** Depends only on |Γ|·OI and market-quoted prices, not on who is long:
  strike gamma topology, absolute-gamma strike, gamma concentration share, expected-move bands,
  term structure, skew and VRP gauges, expiring-gamma share, post-OPEX book preview.
  → Rendered as normal data.
- **Tier B — signed estimate with confidence.** Net GEX, flip level, vanna/charm flow projections.
  → **Must** carry the convention id, the sensitivity band, and a sign-confidence. Index complex
  defaults to the naive prior (which the Gârleanu–Pedersen–Poteshman result supports for index
  products); single names default to wider priors and never render a bare flip level.
- **Tier C — claim requiring a grade.** "This wall is resistance", "vol expands below X",
  "P(pin) = …". → Renders as a **grey informational line until its live grade beats the null**, and
  always ships n, the window, and a confidence interval.

This tiering is what makes us better than the category rather than a copy of it: SpotGamma asserts
83% wall-hold rates from a static 2018–2024 study; MenthorQ declines to publish methodology at all.
**We ship the grade next to the level, recomputed nightly, or we do not ship the claim.**

### 4.2 The artifact — `options_structure.msc/v1`

One new versioned payload per root, published nightly by the macro engine, joined intraday by the
U-CHAIN lane once R2 lands:

```
{
  schema: "options_structure.msc/v1", asof, root, spot_ref, session_date,
  convention: { id, dealer_call_sign, dealer_put_sign, source, note_en, note_zh },

  profile: {                      # Tier B — the spot-grid re-pricing (R1.1)
    grid: [S*],                   # ±15% of spot, 0.25% step
    gex:  [$ per 1% at S*],
    vanna:[$ per 1 vol pt at S*],
    charm:[$ per day at S*],
    crossings: [{ spot, kind:"flip", nearest:true }],
    method: "spot_grid_reprice", smile_mode: "sticky_strike",
    buckets: { "0dte": {...}, "1w": {...}, "1m": {...}, "all": {...} }
  },

  topology: {                     # Tier A
    absolute_gamma_strike, gamma_concentration_share,
    call_wall, put_wall, wall_strength_x_median,
    large_gamma_strikes: [{strike, gex, rank}]
  },

  scenario: {                     # Tier B — the hedge-flow surface (M7/M12)
    ds_pct: [-3…+3], dvol_pts: [-5…+5], dt_days: [0,1,5],
    hedge_flow_usd: [[[...]]],    # [dt][dvol][ds] — dealer $ to transact
    method: "taylor2" | "reprice", disclosure_en, disclosure_zh
  },

  sensitivity: {                  # Tier B — OUR DIFFERENTIATOR (R0.1)
    call_weight_grid: [-1…+1],
    net_gex_by_weight: [...],
    critical_weight: w*,          # weight at which the regime verdict flips
    sign_confidence: 0..1,
    verdict: "robust" | "fragile"
  },

  expiry: {                       # Tier A (M9)
    next_exp, gamma_share_next_pct, delta_share_next_pct,
    concentration_flag: bool,     # >25%
    post_opex: { net_gex_bn, gamma_flip_est, note }
  },

  em_frame: {                     # Tier A (M20 upgrade — nobody does this)
    expected_move_1d, source, containment_hit_rate, containment_n,
    levels_in_em: [{ name, price, dist_em, reachable }]
  },

  grades: {                       # Tier C (R2.4)
    call_wall:  { p_hold_given_touch, n, ci_low, ci_high, window, beats_null },
    put_wall:   { ... },
    flip:       { rv_above, rv_below, n, window },
    pin:        { brier, reliability_bins, base_rate }
  },

  reliability: { levels, regime, note_en, note_zh },
  authority_tier: "display"
}
```

Design rules: fail-open per block (a missing input yields `null` plus a `gaps[]` entry, never an
exception — the `market_plane` pattern); every block carries its own `known_ts`; the payload is
additive over `options_hub.gex/v1` and never replaces it.

### 4.3 Where it lives

| Layer | Home | Notes |
|---|---|---|
| Nightly compute | Macro `engine/market_structure.py` (new) + `scripts/build_options_hub_nightly.py` step | Rides the existing per-root budget; reuses `engine/gex_engine.py` for the profile |
| Intraday compute | M1 launchd, U-CHAIN 15-min lane → `options_structure/msc_intraday/{ROOT}/{STAMP}.json` | R2 |
| Transport | R2 `options_structure/msc/{ROOT}.json` + `msc_history/{ROOT}/{DATE}.json` | Same dated-family doctrine as `gex_history` |
| Terminal read | `flowSource.ts` triplet: `msc:{ROOT}`, `msc_dates:{ROOT}`, `msc_at:{ROOT}:{DATE}` + fixtures | Prefix-disjoint from `matrix:`/`moves:` |
| Terminal UI | `terminal/components/msc/` — panels composed onto the Exposure desk (R0/R1), then a category surface (R3) | v5/v7 tokens, svgChart law, LEX i18n, Tip |
| Context out | Neural Web `market_plane` block (§6); Prophet spine `options:` block (§7); alerts condition types (§8) | Display-tier, score-not-gate |

---

## 5. Roadmap

Waves are numbered R0–R7. Each names its host, its honesty gate, and its exit marker. In-repo waves
follow the standing delivery chain (commit → PR → CI → merge → deploy → marker-verify); data-plane
waves follow M1 ops discipline.

> **STATUS LEDGER (2026-08-01, evening — kept honest after the operator's review).** A compaction
> summary earlier today called this program "complete"; it was not, and the operator caught it.
> The truth: **R0 shipped** (Positioning tab, PR #298 + the production-sweep rebuild). **R1.1
> shipped in full** — flip estimator repaired end to end (live + 450 archived snapshots) AND the
> §4.2 `profile` block now publishes (macro #4219) with the Terminal ProfileCard. **R1.4 shipped**
> (percentile-clamped strike×expiry heat, MatrixHeatCard). **§6 producer shipped** (macro #4199).
> **NOT DONE:** R1.2 (pressure fields), R1.3 (full re-pricing scenario grid), R2.1 (msc/v1
> payload), R2.2 (U-CHAIN publisher), R2.5 (pin calibration), R3 (chart overlay — highest-utility
> integration), R4/R5/R6/R7, Prophet §7. Sibling defect repaired late: `options_matrix.
> _compute_levels` carried a FIFTH copy of the cumulative-flip estimator (live at 594.28 vs SPY
> 741.69) — retired in macro #4219.
>
> **LATER THE SAME EVENING:** **§8 alerts SHIPPED** (terminal #318: `opt_wall_migration` /
> `opt_sign_fragile` / `opt_opex_concentration`; flip-cross already existed as `opt_gamma_flip`;
> deployed, VPS cron live). **R2.3 vol grammar SHIPPED** (terminal #314: VRP regime with
> trend+velocity, skew read, term slopes). **R2.4 v1 SHIPPED END TO END** (macro #4229 publisher →
> R2 `options_hub/level_grades/`, terminal #321 GradesCard): the LIVE Level Report Card — and its
> first run is a research result: **across 15,490 graded single-name boards, NO role beats the
> coin-flip null under the close-side hold test** (call wall 49.0% [47.1–50.9] n=2,599; walls-
> containment 67.6%, EM-band containment 93.3%). Memory: `level-hold-rates-no-edge`. R2.4b owns
> the stronger nulls + intraday-containment variants + the INDEX grading lane (SPY/SPX/QQQ have
> zero graded boards today — the card shows the labelled universe aggregate for them).
>
> **2026-08-02: R3.1 SHIPPED** (terminal #326): **options levels on the price chart** — the
> registry indicator "Options Levels" (opt-in, default OFF) draws call/put walls, the gamma flip
> (profile-crossing preferred), the abs-gamma strike (yields to a coinciding wall) and the
> published EM band as price rails from `gex:`+`moves:`, with the legend row as the provenance
> surface (`EOD {date} · signed estimate`, stale >3 sessions; the signed-estimate disclosure rides
> ONLY when a wall/flip is drawn — EM-only partial publishes are Tier A). Discoverability law
> respected: non-US / no-coverage / gated states annotate the row, never vanish. Pure derivation
> in `terminal/lib/optionsLevels.ts` (19 tests). Ride-along fixes: the guest `mm.inds`
> reload-clobber (anon clamp racing hydration — the one persist key missing the mount guard) and
> the eye-toggle silent no-op for price-line-only overlays (slevels/pivots included).
> **R3.2 SHIPPED 2026-08-02** (macro #4292 + terminal #334): the first cross-root positioning
> aggregate on R2 (`options_structure/gex_state/_index.json`, built by build_gex_board, riding
> `git add site/` + the launchd R2 mirror — arrives with the Monday 16:00 mirror run), the
> ticker page's LIVE "Options · dealer positioning" block (the old gamma block was dead twice
> over: `deep`-gated with no caller AND reading analysis.gex, which fresh intel payloads no
> longer carry; it also role-inverted the wall colours), and three screener `msc_*` columns
> (six-state regime word/colour from the ONE table in `lib/mscGlance.ts`, risk-rank sortable;
> net GEX polarity; dist-to-flip). Degrade-to-absent everywhere; free UX unchanged.
> **R3.3 watchlist dot DEFERRED with the mechanism on record:** the index arrival commits a
> span into every watchlist row at once, and that one commit landing inside a phone
> double-tap window eats the pane-maximize gesture (mobile-chart-chrome e2e, cold-reproducible
> vs a clean base; startTransition cannot help — the commit phase is synchronous). Ship it
> only with a per-row, jank-free paint path. Command-tab gauges also still open.
>
> **2026-08-02 (same evening): R2.4b SHIPPED** (macro #4336 + terminal #338). The Report
> Card's two open holes closed together. **Index lane:** SPY/SPX/QQQ/IWM/DIA/SPXW had zero
> graded boards because `data/stocks` carries no ETF/index bars — new
> `scripts/refresh_index_bars.py` maintains `data/levels/index_bars/` (yfinance adjusted
> basis, ^GSPC for SPX, SPXW aliases to SPX bars at load), the driver gained
> `--universe index`, and the grader wrapper drains an index backfill queue FIRST (own
> state file, one year-chunk per pass; the 2026 chunk was kicked immediately on m1 so the
> first per-root index cards publish the same evening). Index runs never `--publish` the
> track-record JSON — that R2 artifact stays the stocks-universe study; index results flow
> through grades.parquet → per-root `level_grades/` cards. **Stronger nulls:** every
> touch-role node also grades its equidistant-mirror strike (2·spot − strike, identical
> close-side test) and every board the prior-day extremes as pseudo-walls;
> `beats_equidistant_null` demands the real Wilson LOWER bound clear the null's measured
> rate. First real run behaved exactly as the no-edge finding predicts (mirror null held
> 10/20 on the July index smoke). **Intraday variants (threshold-free):**
> `wall_range_contained` (35% on the smoke vs 62% close test), `band_close_contained`,
> per-node `pierce_pct` medians. All columns additive — a pre-R2.4b parquet degrades to
> the exact v1 card (tested). GradesCard: verdicts vs the measured null (tick moves off
> 50%), three new board stats, EN/zh de-hardcoded from the coin flip. Ride-alongs: the
> two WP-C1 grader suites were never CI-named (back-wired, two-halves), and
> `grades_fixture.json` was never committed with v1 (#321) — it sat under a local
> `.git/info/exclude` glob, so CI/fixture sessions silently rendered no grades card;
> force-added with R2.4b fields on `_universe` + NVDA, AMD kept pre-R2.4b as fallback
> coverage. ⚠️ 2025 stocks boards were mid-grade under v1 code when this deployed —
> that year lacks null columns until requeued (drop `2025` from
> `backfill_done_years.txt` after the index queue drains, one extra night).

### R0 — Wave 1: the Positioning panel *(terminal only, zero data-plane dependency)* — **THIS SESSION**

Everything here is arithmetic on payloads the Exposure desk **already fetches**
(`gex:`, `gexstate:`, `moves:`, `vol:`). No new f-param, no new builder, no new R2 key.

- **R0.1 Sign-sensitivity band** *(Tier B — the differentiator)*. `gamma_call` and `gamma_put` are
  published separately signed, so the net can be recomputed for any call-side weight
  `w ∈ [−1, +1]`: `net(w) = w·Σ|gamma_call| − Σ|gamma_put|`. Report the curve, the **critical weight
  w\*** at which the long/short-gamma verdict flips, and a robustness verdict. If `w*` falls inside
  the plausible range, the desk's regime read is labelled fragile. **No competitor ships this.**
- **R0.2 Hedge-flow scenario grid** *(Tier B)*. Second-order expansion over the published aggregates:
  `ΔDealerΔ$ ≈ Σ(Γ·ΔS + Vanna·Δσ + Charm·Δt)`, hedge flow = −ΔDealerΔ$. Rendered as a
  (ΔS × Δσ) grid with a charm-per-day column. Explicitly disclosed as a **local estimate**, bounded
  to ±3% / ±5 vol points, superseded by full re-pricing in R1.3. This is the VS3D "Delta Change"
  idea generalised to three dimensions.
- **R0.3 Levels in expected-move units** *(Tier A)*. Join `gex` levels with the `moves` expected-move
  band: every level renders its distance in EM units plus a reachability chip. Carries the
  containment calibration already computed by `moves_engine`.
- **R0.4 Absolute-gamma strike + concentration** *(Tier A)*. `argmax(|gamma_call| + |gamma_put|)`,
  and the top strike's share of total absolute gamma.
- **R0.5 Expiry concentration + post-OPEX preview** *(Tier A)*. From `by_expiry`: gamma and delta
  share expiring at the next expiration, a >25% concentration flag, and the net-GEX book with the
  expiring tranche removed.

**Honesty gate:** every module states its tier; Tier B modules render the convention string and the
sensitivity verdict; nothing claims support/resistance without a grade (grades arrive in R2.4).
**Exit marker:** the Positioning panel renders on the Exposure desk for an index root and a single
name, at all three contract viewports, in EN and zh, with fixtures and unit tests for the math.

### R1 — The profile engine *(macro engine + terminal)*

- **R1.1** Route the hub GEX payload's flip through **`engine/gex_engine`'s spot-grid re-evaluation**
  and publish the full `profile` block (GEX/vanna/charm vs spot, all crossings, expiry buckets,
  sticky-strike primary with a sticky-delta sensitivity band). Fixes the naive-flip defect and gives
  us the category's flagship chart. **Validate against the current flip before cutting over**;
  disclose the method change in the payload (`method` field) and in the UI.
- **R1.2** Delta/charm/vanna **pressure fields** in (time × price) for the surface roots, upgrading
  the existing surface grids into a TRACE-class read with contour lines at the zero boundary and
  configurable intensity curves (sqrt / power / arcsinh — VS3D's trick, and it genuinely matters
  when one strike dominates).
- **R1.3** Replace the R0.2 Taylor grid with **full book re-pricing** on the spot grid (the compute
  is a vectorised millisecond-scale operation over ~15k contracts × 120 grid points), plus a
  vol-shock axis tied to the smile's dIV/dS beta rather than a flat shift.
- **R1.4** Percentile-range colour normalisation (default 5–95) across every heat surface, so a
  single outlier strike cannot wash out a field. Cheap, and it is why VS3D's grids read better than
  ours.

### R2 — Grades, history and the intraday plane

- **R2.1** Publish `options_structure/msc/{ROOT}.json` + the dated history family; Terminal f-params
  and fixtures.
- **R2.2** **Light U-CHAIN.** Build the first R2 publisher over `data/chain_snapshots/` → 15-minute
  intraday MSC frames. This unlocks intraday flip/wall migration, 0DTE needle profiles recomputed
  with intraday τ, and honest 0DTE levels (last night's OI cannot see today's 0DTE book).
- **R2.3** **Volatility mechanics surfacing**: fixed-strike IV matrix with trailing z-scores, term
  structure with a historical percentile cone, skew with percentile bands, VRP regime with trend and
  velocity (regime-dynamics law), and a 25Δ risk-reversal rank. This is the IVolatility/SpotGamma
  vol-dashboard grammar, on data we already publish plus modest history depth.
- **R2.4** **The Level Report Card — the flagship.** Surface the level-grading lane as a live,
  per-ticker scorecard: P(hold | touched) with Wilson intervals against two nulls (a random
  equidistant level, and the prior-day high/low), sliced by regime sign and wall-strength decile;
  flip-conditional realized-vol splits; expected-move coverage tests. **Levels without a passing
  grade render grey.** SpotGamma's static PDF becomes our live product.
- **R2.5** Calibrate `pin_probability` (Brier score, reliability curve, strike-density null) or
  demote it to Tier C grey until it passes.

### R3 — Distribution inside the Terminal

- **R3.1** **Options levels on the price chart** — opt-in overlay of walls, flip, absolute-gamma
  strike and the EM band, with the same provenance chip as the desk. (`ChartPanel` already draws
  level rails; this is the single highest-utility integration for day-to-day users.)
- **R3.2** Positioning block on the ticker page (StockAnalysis) and `msc_*` columns in the screener.
- **R3.3** Watchlist-rail regime dot; Command-tab session gauges.

### R4 — Flow-impact line (HIRO class)

Requires the sub-minute tape unlock tracked in the sibling masterplan (R0.6 there). Then: per-print
signed delta-notional using the quote rule against prevailing NBBO (Savickas–Wilson: 83% accurate on
options — the plain quote rule beats Lee–Ready here, and tick tests are near-useless), a
hedged/pre-hedged classifier so the line is impact rather than raw tape, rolling windows,
put/call and next-expiry decomposition, and a 30-day/5-day/today gauge that normalises "unusual for
this name". **Our upgrade:** publish the *impact ratio* (impactful ÷ total volume) as a first-class
metric — SpotGamma's equivalent filter is a black box.

### R5 — The API and syndication

Levels + positioning + grades over authenticated HTTP, plus webhooks and a TradingView-ready export.
SpotGamma explicitly has no public API; MenthorQ's syndication is a copy-paste string. This is an
open flank with real revenue attached, and our entitlement plane already exists.

### R6 — Single-name breadth

The category's index products are excellent and their single-name products are thin (SpotGamma's
TRACE is SPX-only; VS3D is SPX/VIX-only). We already publish per-strike ladders for ~380 roots.
Per-ticker positioning surfaces at breadth is open field — gated on R1 (so single-name flip levels
carry a sensitivity band, per §4.1).

### R7 — Participant data *(operator spend decision)*

**CBOE Open-Close / LiveVol licence.** Converts Tier B estimates into measurements for the index
complex, and unlocks the participant lens both leaders sell. Decision inputs: cost, redistribution
terms (can we show derived participant aggregates to subscribers?), and coverage. **Recommended:**
price it now, decide after R2 proves the surfaces. Until then the honest estimator stands, and its
sensitivity band is a feature.

**Sequencing law.** R0 ships first and standalone. R1 is the engine correctness wave and gates R2's
grades. R2.2 (U-CHAIN publisher) is the keystone for everything intraday. R3 can start as soon as
R0 lands. R4/R5/R6/R7 are independently gated.

---

## 6. Neural Web integration

`build_market_plane()` gains one fail-open block. The Neural Web is **context, never a gate** — the
Terminal must not rank, score or filter off it.

```
options_structure: {
  index_regime: "long_gamma" | "short_gamma" | "near_flip",
  regime_trend: "strengthening" | "stable" | "weakening",     # regime-dynamics law
  regime_velocity_1d,                                          # Δ net GEX, 1 session
  dist_to_flip_pct, sign_confidence,
  expiring_gamma_share_pct, opex_window: bool,
  vol_regime: { vrp_z, term_slope_z, skew_z },
  roots: ["SPX","SPY","QQQ"], known_ts, stale: bool
}
```

Why it belongs in the macro brain: the gamma regime is a **conditioning variable for every other
macro read**. "Risk-on with dealers long gamma" and "risk-on with dealers short gamma below the
flip" are different states with different realized-vol distributions, and the Neural Web currently
cannot tell them apart. Per the regime-dynamics law, the label never ships bare — level, trend and
velocity ride together.

**Producer side — SHIPPED 2026-08-01** (macro #4199, `engine/neuralweb/options_plane.py`).
278 bytes against the plane's ~2KB budget, fail-open, verified on real payloads.

**Terminal side — CORRECTED. Do not add a chip to `NeuralWebStrip`.** This plan assumed
that strip was live. It is not: the operator ordered it unmounted on 2026-07-12
("internal-jargon at the glance tier — get rid of it", commit `12d8c395`) and it has been
dead code since. A chip there would render nothing, or re-introduce a rejected surface.

`lib/nwPlane.ts` carries the `options_structure` type — `/api/nw` still proxies the
payload and a consumer should not have to guess its shape — and nothing more. **If a
glance-tier surface for the gamma regime is wanted, it needs an operator decision about
WHERE, not a re-mount of the strip they deleted.** The Positioning tab is the surface that
exists today and it renders this material in full.

A heavier feed still gets its own entry in `/api/nw`'s `FEEDS` map rather than bloating
`market_plane`.

## 7. Prophet integration

The sibling masterplan's §6 already reserves an `options:` block inside `prophet.spine/v1`. Market
Structure Core is what fills it, and it upgrades three specific Prophet behaviours:

1. **Geometry (§6.3 there).** Today stops and targets are blind R-multiples. With MSC: invalidation
   snaps below the nearest of (swing low, 2×ATR, **put wall / flip when between**); T1/T2 respect the
   **call wall** and the **expected-move cone** for the plan's horizon; targets inside the reachable
   cone are flagged `structure_fit: true`, targets outside keep the honest "geometry, not forecast"
   warning. The EM frame from R0.3 is exactly the object this needs.
2. **Management.** The intraday re-scorer gains structural triggers: wall break, flip crossing,
   sign-confidence collapse, and an **OPEX-unwind flag** when the expiring-gamma share is
   concentrated. Bounded `live_adjustment` (±10, decays to zero at the close, never crosses a phase
   boundary — the nightly engine stays the authority).
3. **Origination (lane L3).** The "sudden bullish shift" continuation-catcher becomes structurally
   aware: a flow trigger only promotes to a provisional plan when the spine's structure block is
   non-hostile (above flip, or below with a nearby put wall and positive sign-confidence).

**Law preserved:** score-not-gate, display tier, no merged composite score, disagreement displayed
rather than averaged away.

## 8. Macro Dashboard integration

- The nightly `options_hub` builder gains the MSC step (§4.3); the `site/gex` board gains the profile
  chart and the sensitivity band.
- **Alerts** (`ingest/alerts_engine.py`) gains condition types following the established pattern
  (`_eval_*` → `_OPT_EVALUATORS` → mirror in `terminal/lib/optionsAlerts.ts` → allow-list in the
  API route → `COND_TYPES` in the UI): `msc_flip_cross`, `msc_wall_migration` (the wall *re-strikes*
  — a positioning change, not a price touch, which nobody alerts on), `msc_sign_fragile`,
  `msc_opex_concentration`.
- The `audit_r2` dead-man anchor set gains `options_structure/msc/` so a dead lane pages instead of
  silently serving stale structure.

---

## 9. What we deliberately do not copy

- **News feeds** (`DAYTRADE_SUITE_SPEC.md` §0 stands).
- **Their visual language.** Parity is capability parity; the v5/v7 Terminal idiom is ours.
- **Any vendor's copy, assets or marketing text.** Every teardown in this program is paraphrase.
- **Unfalsifiable claims.** No trademarked "trigger" line whose statistics we cannot reproduce
  nightly. If we cannot grade it, it ships grey or not at all.
- **Point-estimate positioning.** We will not label the largest open-interest strike "dealer gamma"
  and call it institutional. That warning from the commissioning brief is now the §4.1 law.

---

## 10. Open decisions for the operator

1. **CBOE Open-Close / LiveVol licence** (R7) — the one real moat purchase. Recommend pricing it now,
   deciding after R2.
2. **Levels API / syndication** (R5) — product and pricing decision; SpotGamma's absence here is the
   clearest commercial gap in the category.
3. **Futures level coverage** (MenthorQ's ES/NQ breadth) — needs a futures options data decision;
   ThetaData covers index options, not the full futures option complex.
4. **Single-name breadth vs index depth** (R6 sequencing) — both are open field, but they compete for
   the same U-CHAIN budget.

---

*Program of record for the dealer-positioning / gamma-structure / volatility-mechanics estate.
Reference teardowns: `docs/audits/2026-08-01-market-structure-core/`. Sibling program:
`docs/OPTIONS_SUPERINTELLIGENCE_MASTERPLAN_2026-07-31.md`.*
