# Market Structure Core — Dealer-Positioning Math Reference

**Date:** 2026-08-01
**Purpose:** Quant-methodology reference for building Mastermind's own dealer-positioning /
gamma-structure / volatility-mechanics engine ("Market Structure Core") on ThetaData chains.
**Data we hold:** full EOD greek surfaces 2017→present, 15-min intraday chain snapshots with
1st/2nd-order greeks, live trade tape with NBBO + trade conditions, daily OI.
**Evidence discipline:** every claim is tagged `[DOC]` (documented fact — public paper, vendor
doc, or academic result) or `[INF]` (inference / practitioner consensus / our own derivation).
All vendor material is paraphrased, never copied.

---

## 0. Notation

- `S` = spot, `K` = strike, `τ` = time to expiry (years), `σ` = implied vol, `r` = rate, `q` = div yield.
- Black-Scholes: `d1 = [ln(S/K) + (r − q + σ²/2)τ] / (σ√τ)`, `d2 = d1 − σ√τ`, `φ` = standard normal pdf, `Φ` = cdf.
- Per-share greeks (call/put share Γ and vanna/vomma identical for calls and puts):
  - `Δ_call = e^{−qτ} Φ(d1)`, `Δ_put = e^{−qτ}(Φ(d1) − 1)`
  - `Γ = e^{−qτ} φ(d1) / (S σ √τ)`
  - `Vega = S e^{−qτ} φ(d1) √τ` (per 1.00 vol, i.e. per 100 vol points; divide by 100 for per-point)
  - `Vanna = ∂Δ/∂σ = ∂Vega/∂S = −e^{−qτ} φ(d1) · d2/σ = (Vega/S)·(1 − d1/(σ√τ))·…` — use the first closed form; it is the numerically stable one.
  - `Charm_call = ∂Δ/∂τ (sign-flipped to per-calendar-day decay) = −e^{−qτ}[ φ(d1)·(2(r−q)τ − d2σ√τ)/(2τσ√τ) ] + q e^{−qτ}Φ(d1)`; put charm = call charm − q·e^{−qτ} (the `qΦ` term becomes `qΦ(−d1)` with sign flip). For `q=r=0`: `Charm = φ(d1)·d2/(2τ)` per year (calls and puts identical). `[DOC — standard BS results]`
  - `Vomma = Vega · d1 d2 / σ`
- Contract multiplier `M` (=100 for US equity/index options), open interest `OI_i`, per-contract signed dealer position `n_i` (contracts, + = dealer long).
- ThetaData gives us Γ, Δ, vega, theta and (2nd-order snapshot set) vanna/charm/vomma directly; where a greek is missing we compute from the chain IV with the formulas above. `[INF — our data contract]`

**House units convention (recommendation):** report all exposure aggregates in **dollars of dealer delta-hedge notional per +1% spot move** (see §3.5). Keep a share-units column internally for index-futures translation.

---

## 1. The GEX family

### 1.1 Per-contract building block

Gamma exposure of one contract line, in **shares per $1 move**:

```
GEX_shares(i) = Γ_i × M × OI_i
```

Convert to **dollar notional of hedge flow per +1% spot move** (the SqueezeMetrics-lineage unit):

```
GEX_$(i) = Γ_i × M × OI_i × S² × 0.01
```

Derivation: Γ is dΔ per $1 of spot; a 1% move is `0.01·S` dollars; the delta change is in shares,
each worth `S` dollars → multiply by `S` twice and by 0.01. `[DOC — this exact formula
(Gamma × contract size × OI × S² × 0.01) is the published Perfiliev recipe and matches the
SqueezeMetrics-convention implementations circulating publicly]`

### 1.2 Naive convention ("SqueezeMetrics convention")

Assumption: **dealers are long all calls (customers overwrite/sell calls) and short all puts
(customers buy protective puts)**. `[DOC — this is the stated assumption of the 2017
SqueezeMetrics GEX note and of every naive implementation]`

```
GEX_naive = Σ_calls Γ_i M OI_i S² 0.01  −  Σ_puts Γ_i M OI_i S² 0.01
```

- Positive total → dealers hedge counter-trend (buy dips, sell rips) → vol suppression.
- Negative total → dealers hedge with the trend → vol amplification, feedback loops.
- The magnitude reads directly as "shares (or $) bought/sold against a 1% move." `[DOC]`

**Empirical support:** GPP (Gârleanu–Pedersen–Poteshman 2009, RFS) used proprietary
open/close data and found end users are **net long index options, especially OTM puts**
— which is exactly the condition under which the naive sign convention is right for
index products. `[DOC]` The convention is therefore defensible for SPX/SPY/QQQ/NDX
index complex, and progressively less defensible for single names. `[INF, widely shared]`

### 1.3 Signed-by-OI / heuristic-sign variants

Instead of a blanket call/put sign, assign each contract a dealer-side probability using
static heuristics on the chain snapshot:

- **Moneyness prior:** deep-OTM puts → customer-bought (dealer short); slightly-OTM calls on
  single names → customer-sold overwrites (dealer long); far-OTM calls in meme names →
  customer-bought (dealer short — the 2021 gamma-squeeze configuration). `[INF]`
- **IV-richness prior:** contracts trading persistently above the smile fit are being
  bought by customers; below it, sold. (This is the demand-pressure logic of GPP inverted
  into a sign estimator.) `[INF]`
- Formal version: give contract `i` a dealer-share weight `w_i ∈ [−1, +1]` and compute
  `GEX = Σ w_i Γ_i M OI_i S² 0.01`. Naive convention is `w=+1` calls, `w=−1` puts. `[INF]`

### 1.4 Trade-side-inferred GEX (tape / customer-aggressor method)

The only honest way to sign inventory: classify every trade's aggressor from the tape,
assume the passive side is the market maker, and accumulate.

- **Quote rule:** trade at/above ask → customer buy (dealer sells → dealer short that line);
  at/below bid → customer sell (dealer long). Savickas & Wilson (2003, JFQA) on CBOE data
  with known true sides: **quote rule 83% accurate on options, Lee–Ready 80%, EMO 77%,
  tick test 59%** — for options the plain quote rule beats Lee–Ready, and tick tests are
  near-useless because option prices move with the underlying between trades. `[DOC]`
  ~80% of option trades print at bid or ask, which is why the quote rule works. `[DOC]`
- Midpoint prints: leave unsigned (weight 0) or apply depth/size heuristics; do not force
  a tick test on them. `[INF, follows from Savickas–Wilson]`
- Signed flow gamma for a session: `FlowGEX = Σ_trades side_t × Γ_t × M × qty_t × S² × 0.01`,
  where `side_t = +1` if dealer bought (customer sold). Cumulate day over day with OI-based
  decay (see §6) to estimate standing inventory rather than one day's flow. `[INF]`
- **Volume-weighted GEX** (cheaper cousin): replace OI with day volume in §1.1 to see where
  *today's* gamma is being exchanged: `VolGEX(K) = Σ Γ M V_i S² 0.01`. It is a heat map of
  activity, not a positioning estimate — never sign it naively and present it as inventory.
  `[INF — this is what several retail vendors quietly do; the honest framing matters]`

### 1.5 Strike-level netting

For wall/level detection, aggregate per strike across expiries:

```
GEX(K) = Σ_{i: K_i=K} sign_i Γ_i M OI_i S² 0.01
```

Two display conventions exist: (a) netted call−put at each strike (SqueezeMetrics lineage),
(b) separate call-gamma and put-gamma bars per strike (SpotGamma-style chart). Ship both;
netting hides the case where a strike is huge on both sides (pin magnet but weak
directional wall). `[INF]`

### 1.6 Units menu

| Unit | Formula | Use |
|---|---|---|
| Share gamma | Γ·M·OI | translating to underlying share/futures flow |
| $ per 1% move | Γ·M·OI·S²·0.01 | headline GEX, cross-asset comparison |
| $ per 1-point | Γ·M·OI·S | index desks quoting "$ per handle" |
| % of ADV per 1% | GEX_shares×0.01·S / ADV_$ | *impact-normalized* GEX — the level that actually predicts fragility `[INF — this is the Barbon–Buraschi insight: gamma matters interacted with illiquidity]` |

### 1.7 Sensitivity to the sign assumption & the modern critique

- Public OI does not identify the holder; **every** aggregate GEX is an estimate riding on a
  positioning assumption; two vendors can disagree on sign and level while both "computing
  GEX." `[DOC — acknowledged across vendor and independent literature]`
- OI is a **prior-night snapshot**; intraday, naive GEX is stale by construction, fatally so
  on 0DTE-dominated days (§10). `[DOC]`
- Single names around earnings, activism, or retail call-buying manias violate
  dealer-long-calls; the regime read inverts exactly when it matters most. `[DOC/INF]`
- Sensitivity recipe to publish with the product: compute GEX under (a) naive, (b) all-signs
  flipped for calls, (c) tape-inferred; if the zero-gamma level or regime sign differs across
  (a)–(c), mark the reading LOW-CONFIDENCE in the UI. `[INF — our design]`
- Cross-listing gap: SPX complex must include SPX + SPXW + ES options + SPY (delta-adjusted
  into index units) or the level is mis-scaled; we already pull SPX/SPXW. `[INF]`

---

## 2. Zero-gamma / flip point — the profile method

**Naive method (wrong):** sum GEX at current spot with current greeks, find the strike where
cumulative-by-strike crosses zero. This conflates a strike axis with a spot axis. `[INF]`

**Profile method (correct, documented practice):** re-price the *entire book* at a grid of
hypothetical spot levels and plot net GEX as a function of spot:

```
for S* in grid(0.85·S … 1.15·S, step 0.25%–0.5%):
    for each contract i:
        d1* = [ln(S*/K_i) + (r − q + σ_i²/2)τ_i] / (σ_i√τ_i)
        Γ_i* = e^{−qτ_i} φ(d1*) / (S* σ_i √τ_i)
    GEX(S*) = Σ sign_i Γ_i* M OI_i (S*)² 0.01
ZeroGamma = root of GEX(S*) via linear interpolation between the two bracketing grid points
```

`[DOC — this "compute the gamma contribution of every option at each spot level, sum, and
find where the line crosses zero" recipe is the published Perfiliev methodology and matches
how flip levels are described by level vendors]`

Why superior: gamma of each contract is itself a function of spot; the book's net sign at
S* depends on which strikes become ATM at S*. The naive sum answers "what is hedging
pressure here," not "where does the regime change." `[DOC/INF]`

Engineering details `[INF — our recipe]`:
- **Sticky-strike vs sticky-delta:** the naive profile holds each contract's IV fixed
  (sticky-strike). A better variant shifts the smile (sticky-delta / sticky-moneyness):
  `σ_i(S*) = smile(K_i/S* moneyness)`. Under sticky-strike, put gammas grow too slowly on
  sell-offs; publish sticky-strike as primary (industry comparable) and sticky-delta as a
  sensitivity band.
- **Multiple crossings:** the profile can cross zero more than once (barbell books). Report
  the crossing nearest spot as "the flip," but store all crossings; a second flip below is a
  real feature (air pocket floor).
- **Expiry buckets:** compute profiles for {0DTE, ≤1w, ≤1m, all}; the all-expiry flip and the
  front flip diverge materially around OPEX.
- **Vanna/charm profiles come free:** at each S* also sum vanna* and charm* — one pass yields
  all three profiles (§4).

---

## 3. Walls, absolute gamma strike, hedge-wall semantics

Definitions in the vendor ecosystem (paraphrased, for capability parity):

- **Call Wall** — the strike with the largest net *call* gamma; modeled as resistance:
  dealers long those calls sell more underlying as spot rises into the strike (their delta
  grows), producing systematic supply. Statistically also the boundary above which upside
  momentum historically stalls. `[DOC — SpotGamma's public description; mechanism paraphrased]`
- **Put Wall** — largest net put gamma strike; modeled as support (dealers short puts buy
  as spot falls into it — under positive-gamma regime) *and* as the accelerant boundary in
  negative-gamma regimes. `[DOC/INF]`
- **Absolute gamma strike** — argmax over K of |GEX(K)| regardless of type; the strongest
  magnet/pin candidate, especially into expiry (§8). `[INF — common vendor concept]`
- **Hedge Wall / Volatility Trigger** — SpotGamma's proprietary regime line: below it,
  realized vol is modeled to expand and dealer flows flip from counter-trend to with-trend;
  functionally their trademarked packaging of a flip-type level with a backtested vol-expansion
  claim attached. Exact computation undisclosed. `[DOC that the products exist and what they
  claim; INF that they are flip-profile derivatives with proprietary smoothing/weighting]`
- **MenthorQ vocabulary map** (for competitive parity): Call Resistance ≈ call wall,
  Put Support ≈ put wall, HVL ("High Volume Level") ≈ gamma-regime transition ≈ flip,
  1D Min/Max = an IV-based expected-range band, plus 0DTE-specific copies of each level.
  `[DOC — from their public guides]`

Honest semantics to ship `[INF — our doctrine]`: a wall is a *conditional* claim —
"P(intraday high within x% of Call Wall | opened below it) = p̂, n=…, from our backtest"
(§11) — never a bare "resistance" label. Also encode wall *strength*: wall gamma as multiple
of median strike gamma, and wall distance in expected-move units (§7), since a wall 3 EM
away is decorative.

---

## 4. Vanna and charm exposure profiles & projected hedge flows

### 4.1 Aggregates

With dealer sign convention `sign_i` as in §1:

```
VannaEx = Σ sign_i Vanna_i M OI_i S × 0.01     # $ dealer-delta change per +1 vol-point IV move
CharmEx = Σ sign_i Charm_i M OI_i S / 252      # $ dealer-delta decay per trading day
```

(Vanna aggregated as dealer delta-notional change in $ per +1 vol point; charm as
$ delta-notional per day. Keep the units printed on every chart.) `[INF — unit choices ours;
the greeks themselves standard]`

### 4.2 Structural signs and the two flow stories

- Index skew: customers own OTM puts → dealers are short OTM puts. A short OTM put is a
  positive-delta position for the dealer, hedged by shorting futures; the size of that short
  hedge tracks |Δ_put|. When IV falls, |Δ_put| of an OTM put shrinks toward 0, so the
  dealer's position delta exceeds the (now oversized) short-futures hedge ⇒ the dealer buys
  back futures. Hence **vol crush ⇒ mechanical buying** — the "vanna rally" after event risk
  clears; symmetrically, IV spikes force futures selling. `[INF — standard desk logic;
  popularized by Nomura's Charlie McElligott commentary on "vanna flows," whose research is
  paywalled; the mechanism is reproducible from the greeks]`
- Charm: same short-OTM-put book — as τ→0, OTM put deltas bleed to 0 ⇒ dealer buys back
  hedges day after day into monthly OPEX ("charm bid"), strongest the week before expiry and
  vanishing at expiry; reverses if spot sits below the put strikes (ITM deltas bleed to −1).
  `[INF — same status]`

### 4.3 Scenario hedge-flow projection (the deliverable)

Project dealer re-hedge notional over a (ΔS, Δσ, Δt) grid via a 2nd-order delta expansion
of the whole book:

```
ΔDealerΔ$(ΔS, Δσ, Δt) ≈ Σ_i sign_i M OI_i S ×
      [ Γ_i·ΔS  +  Vanna_i·Δσ  +  Charm_i·Δt ]
HedgeFlow$ = −ΔDealerΔ$        # dealers trade against their delta change
```

Ship as a heat-surface: x = spot scenario (±3%), y = IV scenario (±5 pts, or vol-beta-linked
to the spot move via the smile: Δσ = β_skew·ΔS%, β_skew estimated from daily dIV/dS
regression), cell = $ flow; third slice = "by tomorrow / by Friday close" charm columns.
For large scenarios, replace the Taylor expansion with full re-pricing on the §2 grid —
we already pay that compute. `[INF — our design; mathematically standard]`

### 4.4 Calendar windows

- Monthly OPEX (3rd Friday) and quarterly: charm/vanna flows peak in the final week and
  the *removal* of expiring gamma at 9:30 Friday changes the regime instantly — publish
  "post-OPEX book" (all-expiries-minus-expiring) alongside the live book. `[INF]`
- VIXpiration (Wednesday AM) affects the vol-of-vol complex, not our chain math directly,
  but flag the date. `[INF]`

---

## 5. Dealer inventory estimation from the tape (the moat)

This is where we can beat every naive-GEX vendor, because we hold full tape + NBBO.

### 5.1 Trade-side inference

Per §1.4: quote rule against prevailing NBBO at trade time; Savickas–Wilson accuracies
(quote 83% / LR 80% / EMO 77% / tick 59% on options). `[DOC]` Refinements `[INF]`:
- Effective-spread position: `pos = (P − mid)/(ask − mid)` ∈ [−1,1]; use as *soft* side
  probability `p_buy = (1+pos)/2` clipped by a logistic, rather than hard classification.
- Condition codes: exclude/route-separately complex-order legs (spreads net dealer gamma
  differently — a customer vertical moves two lines in opposite directions), floor prints,
  and late/out-of-sequence prints. Multi-leg marks: treat package legs jointly; sign the
  package by its net premium vs package NBBO when derivable, else leave unsigned.
- Sub-penny/midpoint prints and price-improvement auctions: down-weight.

### 5.2 Open/close inference joined with ΔOI

Daily identity per contract: `OI_{t} − OI_{t−1} = opens − closes` (both sides open → +1;
both close → −1; one opens one closes → 0). Join yesterday's signed volume with tonight's
ΔOI: `[INF — standard reconstruction; the exchange open/close datasets (CBOE Open-Close)
are the paid ground truth this approximates]`
- `ΔOI ≈ +V` → mostly opening volume: customer aggressor side = new customer position;
  dealer takes the other side. Strongest signal.
- `ΔOI ≈ −V` → mostly closing: today's customer buys were *closing shorts*, flip the
  inventory interpretation.
- `|ΔOI| << V` → churn day; signal is weak, widen the posterior (§5.4).

### 5.3 Participant heuristics

`[INF — practitioner heuristics; label as such in-product]`
- Size buckets: 1–10 lots retail-ish; odd 50/100+ blocks institutional; tie to condition
  codes (auction/cross prints = negotiated institutional).
- Time-of-day: open/close auctions institutional-heavy; midday small-lot flow retail-ish.
- Retail-heavy names (high small-lot share) push the single-name sign assumption toward
  dealer-short-calls; institutional overwrite names (dividend blue chips) toward dealer-long-calls.

### 5.4 Probabilistic posterior over inventory (recommended estimator)

Per contract `i`, model dealer inventory `n_i,t` (contracts, +=long) as a latent state:

```
Prior at listing:  n_i,0 ~ N(μ_prior(K,type,moneyness), σ_prior²)
                   μ_prior from the naive convention scaled by OI (e.g. −0.9·OI for index OTM puts)
Daily update:      n_i,t = n_i,t−1 + Σ_trades p_dealer_side,t·qty  with obs noise from
                   classification accuracy (σ_obs ≈ qty·√(p(1−p)), p≈0.83 quote-rule)
ΔOI reconciliation: condition the day's net on the open/close decomposition (§5.2);
                   churn days inflate variance instead of moving the mean.
Anchor:            E[n] over all holders must satisfy Σ positions = 0 vs OI bounds:
                   |n_i,t| ≤ OI_i,t (hard truncation of the posterior).
```

Output **a distribution, not a point**: publish `E[GEX]` plus a 10–90% band obtained by
sampling `n_i` posteriors, and a **sign-confidence** = P(net book gamma > 0). A Kalman-style
Gaussian implementation is sufficient; exact particle filtering is overkill at contract
granularity. `[INF — our design. Prior art for the philosophy: GPP 2009 shows positioning
is knowable from open/close data; the academic UNL/Hu (2014) "option order flow to delta"
literature builds delta from signed flow the same way]`

Decay: without evidence, relax `n_i,t` toward the naive prior with half-life ≈ contract's
remaining life (positions roll); this prevents stale tape from ossifying. `[INF]`

---

## 6. Expected move

- **Straddle rule:** `EM ≈ 0.85 × ATM straddle price` for the horizon of that expiry.
  Basis: BS ATM straddle ≈ `2·0.4·S·σ√τ = 0.8·S·σ√τ` (from `C_ATM ≈ 0.4 S σ√τ`, the
  `√(2/π)/2 ≈ 0.3989` approximation), while 1σ move = `S·σ√τ`; the 0.85 factor maps straddle
  price into a ~68%-coverage band. `[DOC — the 0.4·S·σ√τ straddle approximation is standard
  (Brenner–Subrahmanyam lineage); the 0.85 retail rule and its ~68% coverage claim are
  documented practitioner convention]`
- **Sigma rule:** `EM = S · σ_ATM · √(τ)` with σ from the interpolated ATM term structure;
  or variance-interpolate two expiries to an exact horizon:
  `σ²_h·h = σ²_1·τ1 + (σ²_2·τ2 − σ²_1·τ1)·(h−τ1)/(τ2−τ1)`. `[INF — standard]`
- **Implied 1-day move:** from 0DTE/1DTE ATM straddle directly (preferred over annualized
  σ·√(1/252), which underestimates event days and overestimates holidays). `[INF]`
- **Intraday remaining move:** with fraction `u` of the session's variance elapsed,
  `EM_remaining = EM_day · √(1−u)` where `u` follows the *intraday variance-time profile*
  (U-shaped, not linear clock time — estimate the profile from our 15-min realized-var
  history; roughly ~25% of daily variance in the first hour, ~20% in the last). Ship the
  profile-based version; the naive `√(1 − t/T_clock)` is visibly wrong at 10:00. `[INF —
  the U-shaped intraday volatility pattern is documented (Wood et al. lineage); the exact
  weights must come from our own estimation]`

---

## 7. Pinning probability

- **Evidence:** Ni–Pearson–Poteshman (JFE 2005) — optionable-stock closes cluster at strikes
  on expiration; average return distortion ≥ ~16.5bp per expiration; attributed to market-maker
  delta-hedge rebalancing (and some proprietary-trader manipulation). Pinning is real,
  strongest where MM hedging dominates. `[DOC]`
- **Structural model:** Avellaneda–Lipkin (2003) — hedging feedback near expiry produces a
  restoring drift toward the strike; pinning probability rises with hedger gamma
  concentration and falls with the stock's diffusion "escape" ability. Directionally:
  `P(pin) ↑` in `Γ_wall/liquidity`, `↓` in `|S−K|/(σ√τ_remaining)`. `[DOC — model exists and
  has this structure; exact power-law forms in the paper]`
- **Shippable scoring model** `[INF — ours, to be calibrated in §11]`:
  ```
  z = |S − K*| / EM_remaining              # K* = absolute-gamma strike (§3), EM from §6
  g = GEX(K*) / Σ_K GEX(K)                 # gamma concentration share
  ℓ = GEX_shares(K*) / ADV_shares          # hedge impact ratio
  P(pin) = logistic(b0 + b1·(−z) + b2·g + b3·ℓ + b4·is0DTE + b5·(τ_remaining))
  ```
  Fit on 2017→ history (label: |close − K*| ≤ 0.125·EM_day). Publish only with its Brier
  score / reliability curve; a pin claim without calibration is astrology. Grade against the
  base rate of closing near ANY strike (strikes are dense — the null is not 0).

---

## 8. Vol-regime metrics (context layer)

- **Vol risk premium:** `VRP_t = IV_{t,30d} − RV_{t→t+30d}` (tradeable definition uses
  *subsequent* realized; the live dashboard proxy uses trailing RV: `VRP̂ = IV_30 − RV_trailing21`).
  Regime = rolling z-score of VRP̂ (252d window). Persistent positive VRP is one of the most
  documented facts in derivatives (variance-premium literature, Carr–Wu); inversion (RV > IV)
  marks stress regimes. `[DOC for the premium's existence; INF for the z-score packaging]`
  RV estimator: use our 15-min bars — realized kernel or simple ΣR² over 26 bars/day,
  annualized ×252; 15-min sampling largely dodges microstructure noise. `[INF]`
- **Term-structure slope:** `slope = σ_ATM(m2)/σ_ATM(m1) − 1` (or IV_90/IV_30). Contango
  normal; backwardation = stress. Publish the slope z-score and days-in-current-state;
  transitions matter more than levels (regime-dynamics law). `[INF]`
- **Skew:** 25-delta risk reversal `RR25 = σ(25Δcall) − σ(25Δput)` (index: persistently
  negative; z-score it); butterfly `FLY25 = (σ(25Δc)+σ(25Δp))/2 − σ_ATM`; and **fixed-strike
  vs floating**: track a given strike's IV through time to separate "the smile moved" from
  "spot slid along the smile" — fixed-strike IV changes are the cleanest dealer-repricing
  signal around events. `[INF — all standard desk conventions]`
- Cross-check gauge: our own SPX-chain 30d variance-swap-style index vs VIX as a data-quality
  canary. `[INF]`

---

## 9. 0DTE-specific mechanics

- **The stale-OI problem:** 0DTE positions are opened and closed intraday; last-night OI
  misses most of them. Any 0DTE gamma metric must be built from the **tape** (signed volume,
  §5.1) sampled intraday, not OI. `[DOC that OI is a prior-night snapshot; INF for the recipe]`
- **Intraday gamma of expiring options:** Γ ∝ φ(d1)/(Sσ√τ) with τ measured in *fractions of
  a day* — near-strike gamma explodes as τ→0 (documented practitioner estimates: 2–5× weekly
  gamma at hours-to-expiry, 10×+ near the close) while away-from-strike gamma dies. The 0DTE
  gamma profile is a needle at the nearest strikes that both sharpens and narrows through
  the session; recompute every 15-min snapshot with intraday τ. `[DOC for the mechanics/orders
  of magnitude; INF for cadence]`
- **0DTE share metrics:** `share_vol = V_0DTE/V_total`, `share_gex = |GEX_0DTE|/Σ|GEX|`
  (unsigned share — signs are the uncertain part), plus net signed 0DTE FlowGEX from tape.
  `[INF]`
- **Evidence check (keeps us honest):** the CBOE-published academic work (Baltussen et al.
  lineage / "0DTE and market volatility") finds the measurable *net* MM 0DTE gamma position
  is usually kept small-to-positive intraday and estimated vol impact is modest (single-digit
  percentage points of annualized vol at intraday horizons, and realized vol on 0DTE-heavy
  days is not higher unconditionally). Meanwhile Baltussen–Da–Lammers–Martens (JFE 2021,
  "Hedging demand and market intraday momentum") documents intraday momentum when dealer
  gamma is more negative. Ship 0DTE gamma as *flow context*, not doom meter. `[DOC — both
  results as summarized; exact magnitudes should be quoted from the papers when we write UI copy]`

---

## 10. Backtest & validation designs (grading our own levels)

All levels ship with grades from these harnesses, per our honesty doctrine. `[INF — designs ours]`

1. **Wall hit/hold rates.** For each session and level L (call wall etc.): condition on
   `open < L` (resistance case) and `dist(L) ≤ 1.5·EM_day` (reachable). Outcomes:
   *touched* (high ≥ L−ε), *held* (touched and close < L), *broke* (close > L+ε),
   with ε = 0.1·EM. Report P(hold | touched) with Wilson CIs vs TWO nulls:
   (a) random same-distance level, (b) previous-day-high technical level. A wall is only a
   product if it beats both. Slice by regime sign and wall-strength decile.
2. **Flip-regime conditional vol.** Label each 15-min bar by book sign (above/below flip,
   by our profile). Test: realized vol and |autocorrelation| above vs below;
   HAR-RV regression `RV_{t+1} = α + β·RV_t + γ·1_{neg} + δ·(1_{neg}×RV_t)`; the
   Barbon–Buraschi prediction is positive-gamma ⇒ intraday reversal (negative autocorr),
   negative-gamma × illiquidity ⇒ momentum — replicate their interaction with our
   GEX/ADV-normalized measure. `[DOC for their result; INF for our replication design]`
3. **Straddle-vs-realized calibration.** For each horizon: coverage test (does ±EM contain
   the close 68% of days?), Mincer–Zarnowitz regression of realized |move| on EM,
   pinball-loss vs GARCH baseline. Recalibrate the 0.85 factor per underlying — it is a
   convention, not a law.
4. **Pin model:** Brier + reliability curve vs strike-density null (§7).
5. **Inventory posterior validation:** where we can, benchmark our signed-flow estimates
   against CBOE Open-Close sample data or documented episodes (e.g. known squeeze weeks);
   at minimum, verify posterior sign stability week-over-week (a positioning estimate that
   flips daily is noise).
6. **Regime-transition event study:** returns/vol in ±5d windows around flip crossings vs
   matched non-crossing days (guards against "flip level is just a moving average of spot").

Protocol: walk-forward only, levels computed strictly from T−1 EOD data (or 15-min-lagged
intraday data), no revisions; every published stat carries n and date range.

---

## 11. Prior-art shelf (what to cite in docs)

- SqueezeMetrics, "Gamma Exposure (GEX)" note, 2017 — origin of the naive convention and
  the $-per-1% unit. `[DOC]`
- Perfiliev, "How to calculate GEX and zero-gamma" — public recipe for the spot-grid profile
  method. `[DOC]`
- Gârleanu–Pedersen–Poteshman, *Demand-Based Option Pricing*, RFS 2009 — end-user net
  positioning (long index puts), demand pressure prices options ∝ unhedgeable risk. `[DOC]`
- Barbon–Buraschi, *Gamma Fragility*, 2020/21 — stock-level gamma imbalance × illiquidity ⇒
  intraday momentum/reversal asymmetry. `[DOC]`
- Baltussen–Da–Lammers–Martens, JFE 2021 — hedging demand and intraday momentum. `[DOC]`
- CBOE / Nagel et al. 0DTE volatility-impact studies (2023–24) — measured MM 0DTE inventory
  small/positive; modest vol impact. `[DOC]`
- Ni–Pearson–Poteshman, JFE 2005 — expiration pinning evidence; Avellaneda–Lipkin 2003 —
  pinning mechanism model. `[DOC]`
- Savickas–Wilson, JFQA 2003 — option trade classification accuracies. `[DOC]`
- Sell-side frameworks (GS index-desk gamma estimates, BofA, Nomura McElligott vanna/charm
  commentary): paywalled; treat as vocabulary and mechanism folklore, not reproducible
  methodology — our numbers must stand on our own estimator. `[INF]`

---

## 12. Recommended architecture (honesty-tiered)

**Tier A — ship as deterministic levels (robust to the sign assumption):**
- Strike gamma topology: absolute gamma strike, per-strike call/put gamma bars, gamma
  concentration share — these depend on |Γ|·OI only, not on who is long. `[INF]`
- Expected move bands (§6), intraday remaining-move, term structure, RR/fly z-scores, VRP
  gauge — pure market-quoted quantities.
- OPEX calendar mechanics: expiring-gamma share, post-OPEX book preview.

**Tier B — ship as signed estimates WITH confidence (assumption-dependent):**
- Net GEX, flip level, vanna/charm flow projections — always with (a) the three-convention
  sensitivity band (§1.7), (b) sign-confidence from the inventory posterior (§5.4),
  (c) regime tag with trend/velocity per our regime-dynamics law.
- Index complex defaults to the naive prior (GPP-supported); single names default to
  tape-inferred with wide priors; never show a single-name flip level without the band.

**Tier C — ship only with a live backtest grade attached:**
- Wall support/resistance claims (P(hold|touch), n, CI — §10.1), pin probabilities (§7),
  "vol expands below X" trigger-style claims (§10.2). If the grade is not beating the null,
  the level renders as a gray informational line, not a green/red trading level.

**Pipeline sketch:** nightly job = EOD chain → per-contract signed prior → strike topology +
profiles (GEX/vanna/charm vs spot grid) → levels + grades JSON. Intraday job (15-min) =
tape classifier → FlowGEX + posterior update → 0DTE needle profile + remaining-EM →
level refresh. All outputs carry `asof`, convention id, and confidence fields. Compute cost
is trivial: the S*-grid full re-pricing of an SPX chain (~15k contracts × 120 grid points)
is a vectorized millisecond-scale NumPy op. `[INF]`

**What to clone / what to beat:**
- Clone: the level vocabulary (walls/flip/expected-range/0DTE variants) — it is the
  category's shared language; the $-per-1% unit; the spot-grid profile chart.
- Beat: (1) tape-posterior inventory instead of frozen naive OI signing — no retail vendor
  publishes sign-confidence; (2) intraday 0DTE gamma from signed volume (most vendors' 0DTE
  levels still lean on stale OI); (3) published hit/hold grades on every level — SpotGamma
  asserts statistical significance but publishes no auditable methodology; our grades are
  the product; (4) impact-normalized GEX (GEX/ADV) as the fragility score, which is what the
  academic evidence actually supports. `[INF]`
