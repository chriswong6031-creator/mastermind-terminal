# vol.land feature set — BUILD SPECS on data we already own

**Date:** 2026-08-01
**Scope:** engineering + quant specs for reimplementing the vol.land capability set inside
Mastermind's Market Structure Core. **No vendor research here** — a sibling agent covers that.
Every spec is written against *our verified data assets*, our honesty tiers, and our repo seams.
**Companions:** `dealer-positioning-math.md` (methodology of record — §-refs below point there),
`repo-integration-map.md` (where things plug in).

**Evidence tags:** `[DOC]` = documented/standard result. `[INF]` = our derivation, design, or
practitioner consensus. All formulas below are either textbook or ours; nothing is copied.

---

## 0. Asset ledger (what every spec is allowed to assume)

| id | Asset | Shape | Where it lives today |
|---|---|---|---|
| **D1** | EOD full greek + IV surface, 1st/2nd/**3rd** order | 380+ roots, 2017→present, 51 GB | ThetaData T1 store (Mac/M1); read today by `scripts/build_index_gex_history.py` |
| **D2** | Daily OI history | 1.9 GB, full universe | same store; OI-timing law = `OI[t−1]` |
| **D3** | 15-min intraday full-chain snapshots, 1st+2nd order (Δ/θ/vega/ρ/IV + Γ/vanna/charm/vomma/veta) | ~150 roots, RTH | `data/chain_snapshots/{ROOT}/{DATE}.parquet` + `_oi.parquet` (U-CHAIN, `scripts/chain_snapshot_poller.py`) — **no R2 publisher yet** |
| **D4** | Per-strike intraday net-premium + GEX/DEX/VANNA/CHARM grids | SPY/QQQ/IWM, 10-session retain | `live_flow/surface/{ROOT}/…` via `scripts/build_flow_surface.py` |
| **D5** | Nightly per-strike gamma/delta/vanna/charm ladders | 380 roots (22 anchors published today) | `options_hub/gex/{ROOT}.json`, `options_hub.gex/v1` |
| **D6** | Vol payload: ATM IV, IV rank (252/all), term, per-expiry smile, RV20, VRP | per root | `options_hub/vol/{ROOT}.json`, `options_hub.vol/v1` |
| **D7** | Expected-move payload + historical containment calibration | per root | `options_hub/moves/{ROOT}.json`, `options_hub.moves/v1` |
| **D8** | Full OPRA trade tape with NBBO + trade conditions | live, ThetaData PRO | `scripts/live_flow_poller.py` (120 s, `max_concurrent=2` HARD) |

**Hard constraints that shape every spec** `[INF — observed]`:
- ThetaData terminal has **8 slots**; live_flow owns 2, U-CHAIN owns 1 (`max_concurrent=1` HARD).
  No new spec may add an uncapped puller.
- OI is **t−1** everywhere. Any intraday-positioning claim must be tape-built or say so.
- New heavy batch belongs on the **M1 data plane** (memory `m2-to-m1-dataplane-migration`), not the M2.
- Publishing path is fixed: nightly/intraday builder → R2 key → one `flowSource.ts` triplet
  (`isValidF`/`backendPath`/`r2Key`) + root-keyed honest-`{}` fixture + pinned test.
- Every chart obeys the **svgChart law**; every regime label carries **level + trend + velocity**
  (regime-dynamics law); nothing wears live chrome on nightly-EOD data.

**Two derived assets that do not exist yet and that most specs below depend on.** Build them
first; they are not features, they are the substrate:

- **SUB-1 · The arb-free surface engine** (spec §5) — SVI-per-expiry fits with butterfly and
  calendar no-arb, producing `ψ_t(m)` (smile in log-moneyness), its slope/curvature, and a
  per-contract fit residual. Features 4, 7, 8, 9, 10c all consume `ψ` or its slope.
- **SUB-2 · The metric panel** — one parquet `data/msc/panel.parquet`, grain
  `(date, root, metric) → value`, ~2,200 sessions × 380 roots × ~40 metrics ≈ 33 M rows,
  ~1–2 GB. Every percentile, z-score, extreme, analog lookup, and quadrant statistic in this
  document reads the panel and nothing else. Build once, append nightly.

**Blocking infrastructure, called out up front:** several specs need **CLS-1, the trade-side
classifier + inventory posterior** (`dealer-positioning-math.md` §5). It is *not* a feature;
it is the moat. Start it in parallel with the P0 wave (§P).

---

## 1. Aggregate Greek Trend

### 1.1 Definition

For each root and each greek `g ∈ {gamma, delta, vanna, charm, vomma, veta}`, the **history of
the estimated aggregate dealer exposure** to that greek, one point per session, 2017→present,
each point carrying: level (house $ units), percentile vs. its own history, and rate-of-change
at 1d/5d/21d — plus a **decomposition of the change into positioning-flow vs. repricing**.

### 1.2 Formulas

Per-session aggregate, dealer-signed:

```
E_g(t) = Σ_i  n_i(t) · M · g_i(t) · U_g(S_t)
```

`n_i` = signed dealer contracts (naive convention `+OI` calls / `−OI` puts by default; posterior
mean from CLS-1 when available). Unit normalizers `U_g` — **print these on every axis**:

| greek | `U_g` | resulting unit |
|---|---|---|
| gamma | `S² · 0.01` | $ dealer hedge notional per **+1% spot** |
| delta | `S` | $ dealer delta notional |
| vanna | `S · 0.01` | $ delta change per **+1 vol point** |
| charm | `S / 252` | $ delta decay per **trading day** |
| vomma | `0.01² · 100` | $ vega change per +1 vol point (vega in $/pt) |
| veta | `1/252` | $ vega decay per trading day |

**Percentile.** Raw $ exposure has a secular trend (OI, index level, and 0DTE listing all grew
9×-ish over the window) — a percentile of the raw series is a percentile of market growth, not of
positioning. Publish percentile on the **normalized** series only `[INF — this is the single
biggest correctness trap in this feature]`:

```
Ẽ_g(t) = E_g(t) / ADV$_t(root)          # impact-normalized (preferred; §1.6 of the math doc)
Ê_g(t) = E_g(t) / Σ_i |g_i(t)| M OI_i U_g   # sign-free "net share of gross" ∈ [−1, 1]
pct_W(t) = rank of Ẽ_g(t) within trailing W    W ∈ {252d, 756d, all}
```

Ship both `Ẽ` (fragility scale) and `Ê` (crowding scale). `Ê` is the one that is comparable
across roots and across the 2017→2026 structural break.

**Rate of change + velocity** (regime-dynamics law):

```
ROC_k(t)  = Ẽ(t) − Ẽ(t−k),  k ∈ {1, 5, 21}
z_ROC_k   = ROC_k / σ_252(ROC_k)
accel(t)  = ROC_1(t) − ROC_1(t−1)
```

**Change decomposition (the upgrade).** An exact two-term index decomposition with the cross
term isolated:

```
ΔE = Σ_i [ g_i(t) − g_i(t−1) ] · n_i(t−1) · M · U_g(S_t)      ← REPRICE  (same book, new market)
   + Σ_i   g_i(t−1) · [ n_i(t) − n_i(t−1) ] · M · U_g(S_t)     ← FLOW     (new positions)
   + Σ_i [ g_i(t) − g_i(t−1) ] · [ n_i(t) − n_i(t−1) ] · M · U_g(S_t)  ← CROSS
   + E_g(t−1) · [ U_g(S_t)/U_g(S_{t−1}) − 1 ]                  ← UNITS    (spot scaling of the unit)
```

Identity check `REPRICE + FLOW + CROSS + UNITS ≡ ΔE` is a unit test, not a comment. `[INF — ours]`
This is what separates *"dealers sold gamma"* from *"spot walked into the strike where the gamma
already was"* — a distinction no dashboard in this category draws.

### 1.3 Data sources

D1 (greeks + IV) + D2 (OI) for the 2017→ nightly series, 380 roots. D5 for today's live-published
ladder consistency. D3 for an intraday-refreshed *today* point on the ~150 U-CHAIN roots.

### 1.4 Compute cost & cadence

- **Backfill (one-time):** project ~8 columns (`root, exp, strike, right, iv, gamma, vanna, charm,
  delta, oi`) out of the 51 GB store — realistic I/O ≈ 4–10 GB per pass. Vectorized per
  root-session; 380 roots × ~2,200 sessions. Single-process estimate 2–6 h; parallel by root over
  8 workers → **under an hour on the M1**. Write straight into SUB-2.
- **Nightly incremental:** one session per root, ~5–20 k rows → **seconds for the whole universe**.
- **Intraday (optional):** 150 roots × 26 snapshots is a groupby, negligible; gate it behind the
  U-CHAIN publisher.

### 1.5 Honesty tier

- **Tier A:** *gross* series — `Σ|g_i| M OI_i U_g`, gamma concentration, gross-vanna, gross-charm,
  and their percentiles. Sign-free, so the sign assumption cannot contaminate them.
- **Tier B:** every *signed* series (`E_g`, `Ẽ_g`, `Ê_g`, ROC, and the decomposition). Ships with
  the three-convention sensitivity band (naive / calls-flipped / tape-inferred) and, once CLS-1
  lands, a posterior 10–90 band and `P(sign > 0)`.

### 1.6 What could make it dishonest

1. **Percentiling a non-stationary series** (§1.2). A raw-$ gamma percentile in 2026 is ~always
   "extreme" because the book is simply bigger.
2. **A frozen sign convention across a structural break.** Dealer-long-calls was a defensible
   prior in 2017 and is a coin-flip in 2021 meme names and 2023+ 0DTE. A 9-year percentile of a
   metric whose *bias* changed is not one series. **Mitigation:** stamp every historical point
   with `convention_id`; the chart refuses to mix conventions on one line.
3. **Corporate actions.** Splits re-strike contracts and multiply OI; without adjusted contract
   identity the ladder tears and the FLOW term explodes on the split date. Must key on adjusted
   OSI + a split ledger, and mask the split session.
4. **Root/universe survivorship.** Percentiles computed only over roots that exist today.
5. **OI restatements** (OCC corrections) silently rewriting history — freeze published points.

### 1.7 Validation

- **Identity tests:** decomposition sums to ΔE; bucket sums (§6) reconcile to the total.
- **Reconstruction of known episodes** as face validity, not proof: Feb-2018, Mar-2020,
  Jan-2021, the 2022 bear, the 2023→ 0DTE ramp. Sign and *shape* must be defensible in each.
- **Falsifiable claim (the real test):** does the gamma percentile predict forward realized vol?
  Walk-forward HAR-RV with the percentile as an extra regressor:
  `RV_{t+1} = α + β₁RV_t + β₂RV^{5}_t + β₃RV^{22}_t + γ·pct_Γ(t) + δ·1{Ẽ_Γ<0}` —
  report γ, δ with Newey-West errors, out-of-sample R² gain vs. plain HAR, per root and pooled.
  This is a strict generalization of the existing `scripts/validate_gex.py` check.
- **Posterior stability:** week-over-week sign flips of the estimate are noise, not information;
  publish the flip rate.

### 1.8 Upgrade — how ours beats theirs

1. **9 years, not 6 months.** Percentiles get an actual distribution, including two vol crises.
2. **FLOW vs REPRICE decomposition** — the causal question, answered exactly.
3. **Impact normalization** (`Ẽ = E/ADV$`) as the headline fragility scale — the form the
   academic evidence (Barbon–Buraschi) actually supports `[DOC]`, not raw notional.
4. **Sign-confidence on every historical point**, and a convention toggle that keeps history
   comparable instead of silently splicing.
5. **3rd-order greeks** give us `speed` and `color` series nobody else publishes, which feed §2.

### 1.9 Ship surface

`options_hub/greek_trend/{ROOT}.json` → f-param `gtrend:{ROOT}` (prefix-disjoint from `gex:`
at char 4). Schema `options_hub.greek_trend/v1`:
`{schema, asof, root, convention, series[{date, greek, e_raw, e_norm_adv, e_share, pct_252,
pct_all, roc_1, roc_5, roc_21, z_roc_5, decomp{reprice, flow, cross, units}, band_lo, band_hi,
sign_conf}], coverage{since, sessions, roots_universe}}`.
UI: new `components/greektrend/GreekTrendView.tsx` (GEX-desk tab or hub tab), built on the
`GexHistory.tsx` spark template (svgChart-compliant worked example).

---

## 2. Greek Hedging Widget / Notional Hedging Exposure

### 2.1 Definition

Given a hypothetical `(ΔS%, Δσ, Δt)`, the **$ of underlying the dealer complex must trade to stay
delta-neutral** — decomposed by greek contribution, by strike, and by tenor. Rendered as a
scenario heat-surface plus a single headline number on the default path.

### 2.2 Formulas

**Exact engine (primary).** Do not Taylor-expand where we can afford to reprice — and we can
(§2.4):

```
Δ_i(S*, σ*, τ*) = e^{−q τ*} Φ(d1*)                      # put: Φ(d1*) − 1
DealerΔ$(scenario) = Σ_i n_i · M · Δ_i(S*, σ*, τ*) · S*
HedgeFlow$          = −[ DealerΔ$(scenario) − DealerΔ$(base) ]     # dealers trade AGAINST the change
```

with `S* = S(1+ΔS)`, `τ* = τ − Δt/365`, and — critically — a *choice of vol map*:

```
sticky-strike :  σ*_i = σ_i + Δσ                                  (industry-comparable default)
sticky-delta  :  σ*_i = ψ_t( ln(K_i/F*) ) + Δσ                    (SUB-1 smile; the honest one)
empirical     :  σ*_i = ψ_t( ln(K_i/F*) ) + β_SV(τ_i)·ΔS + Δσ_resid   (§4's spot-vol beta)
```

Ship all three; their spread **is** the model-risk band.

**Fast path (live widget, ≤16 ms).** Third-order-accurate expansion — we own the 3rd-order greeks,
so use them:

```
ΔΔ_i ≈ Γ_i·ΔS_$  +  ½·Speed_i·ΔS_$²  +  Vanna_i·Δσ  +  ½·DvannaDvol_i·Δσ²
                   +  Charm_i·Δt  +  Color_i·ΔS_$·Δt
ΔDealerΔ$ = Σ_i n_i M S · ΔΔ_i
```

Publish `|fast − exact| / |exact|` on the widget; if it exceeds 5 %, the widget renders the exact
number and says so. `[INF — ours; the greeks are standard]`

**The two upgrades (§2.8) in formula form.**

*Impact translation.* Convert flow to price with a square-root impact law calibrated on our own
data:
```
impact_bps(Q) = κ · σ_daily · sqrt( |Q| / ADV$ ) · 10⁴ · sign(Q)
```
κ estimated per liquidity bucket by regressing realized intraday returns on same-window signed
underlying volume (a Kyle/√-law fit). `[DOC — the √-law is standard market-impact literature;
INF — our calibration]`

*Feedback fixed point.* The hedge flow moves spot, which changes the hedge requirement:
```
solve  ΔS = ΔS_exog + impact_bps( HedgeFlow$(ΔS) )/10⁴
multiplier  m = ΔS_total / ΔS_exog
```
Newton or 20 fixed-point iterations. **`m > 1` = amplification, `m < 1` = damping, and
`|∂impact/∂ΔS| ≥ 1` = no stable fixed point — which is precisely the cascade diagnostic** and a
far more honest "fragility" number than a raw negative-gamma headline. `[INF — ours]`

### 2.3 Data sources

D5/D1+D2 for the book and greeks (nightly), D3 for an intraday-refreshed book on 150 roots,
D4 for SPY/QQQ/IWM strike-resolved intraday, SUB-1 for `ψ`, §4 for `β_SV`, price/volume history
for `ADV$` and κ.

### 2.4 Compute cost & cadence

Vectorize as `(contracts × scenarios)` float32 broadcast, chunked over contracts.
- **Published nightly grid** 41 spot × 11 vol × 3 horizons = 1,353 points × ~15 k contracts
  ≈ 20 M evals per root → **~0.2–1 s/root**, ~5 min for 380 roots.
- **Research grid** 121×21×5 ≈ 190 M evals/root → ~2–4 s/root; run on demand, not nightly.
- **Fixed point** adds ~20 evaluations of a 1-D slice — negligible.
- **Client** uses the fast path against the published ladder; no server round-trip on slider drag.

### 2.5 Honesty tier

**Tier B.** The magnitude is `n_i`-dependent end to end. The *gross* version — "total hedge
capacity in motion", `Σ|n_i| …` — is Tier A and worth showing beside it. The feedback multiplier
`m` is **Tier C**: it is a claim about market response and needs the §2.7 grade before it may
render in a semantic colour.

### 2.6 What could make it dishonest

- Presenting a hedging *requirement* as a hedging *prediction*. Dealers hedge discretely, band
  their deltas, cross-hedge SPX gamma with ES futures and QQQ with NQ, and a real share of
  inventory sits with holders who never delta-hedge. Copy must say "implied hedging requirement".
- Holding OI fixed through the scenario — in any scenario large enough to matter, the book itself
  changes. Cap the honest scenario radius (we use ±3 σ_daily) and grey out beyond it.
- Letting `Δσ` be a free slider with no link to `ΔS`. A user dragging spot −3 % and vol +0 pts is
  looking at a world that does not exist. **Default the widget to the empirical diagonal**
  (`Δσ = β_SV·ΔS`) and make the free grid the explicit sensitivity view.
- Double-counting the SPX complex (SPX + SPXW + SPY delta-adjusted + ES) or omitting legs of it.

### 2.7 Validation

1. **Flow event study.** Regress next-session (and same-session, 15-min-resolved on D3/D4 roots)
   *signed underlying volume* on projected `HedgeFlow$`. Report slope, R², and the incremental
   R² over a naive momentum baseline. A slope indistinguishable from 0 kills the widget's
   semantic colour.
2. **Vanna-rally episodes.** Select days with `Δσ30 < −1.5 z` and no macro shock; test whether
   realized same-day underlying buying matches the projected vanna leg in sign and rough scale.
3. **Charm/OPEX week.** The projected charm bid in the 5 sessions before monthly OPEX vs. realized
   drift; matched against non-OPEX weeks.
4. **κ and the fixed point:** out-of-sample calibration of κ; then test whether high-`m` days show
   higher intraday |autocorrelation| than matched low-`m` days (the Barbon–Buraschi replication
   with an explicit multiplier instead of a sign dummy). `[DOC for their result; INF for the design]`
5. Fast-vs-exact error distribution published as a QA artifact.

### 2.8 Upgrade

1. **Exact reprice, not Taylor**, on the published grid — most of the category ships a linear
   gamma-times-move number.
2. **Empirical spot-vol coupling as the default path** instead of an unconstrained 2-D grid.
3. **Third-order terms** (speed, color, DvannaDvol) — we hold them; almost nobody does.
4. **Flow → bps → feedback multiplier**, closing the loop the whole category leaves open, with
   the non-existence of the fixed point as an explicit instability flag.
5. **Per-strike and per-tenor attribution** of the projected flow, so the user sees *where*
   (in price and in time) the hedging lands, not just how much.

### 2.9 Ship surface

`options_hub/hedge_map/{ROOT}.json` → f `hedgemap:{ROOT}`. Schema
`options_hub.hedge_map/v1`: `{schema, asof, root, spot_ref, vol_map, grid{ds_pct[], dsigma_pts[],
horizons_days[]}, flow_$[i][j][k], by_greek{gamma,vanna,charm,speed,color}[i][j][k],
by_tenor_bucket{…}, adv_usd, kappa, multiplier_m[i], stable[i], convention, coverage}`.
UI: `components/hedgemap/HedgeMapView.tsx` — heat-surface + slider row + headline card;
crosshair-synced with the Surface tab via the existing `surfaceSync.tsx` idiom.

---

## 3. Dealer Premiums

### 3.1 Definition

The **net option premium in dollars that changed hands from customers to dealers** over a window,
split into collected / paid, by root, tenor bucket (with 0DTE broken out), and call/put.
**This is not P&L.** It excludes hedge P&L, mark-to-market on standing inventory, financing, and
the terminal settlement of the positions the premium bought. It answers *"how much premium did the
customer base hand over"*, and nothing else.

### 3.2 Formulas

For each print `t` with price `P_t`, size `q_t`, multiplier `M`, and a **soft** customer-buy
probability `p_t` from the classifier (CLS-1; quote-rule base + effective-spread position, §5.1
of the math doc):

```
pos_t   = (P_t − mid_t) / (ask_t − mid_t)            ∈ [−1, 1], clipped
p_t     = logistic( a + b·pos_t )                     a,b fit on condition-code-clean prints
Collected = Σ_t   p_t   · P_t · q_t · M               # customer bought → dealer sold
Paid      = Σ_t (1−p_t) · P_t · q_t · M
NetDealerPremium = Collected − Paid
Gross     = Σ_t P_t q_t M
CaptureRate = NetDealerPremium / Gross                ∈ [−1, 1]
```

**The Tier-A twin — ship it first and always beside the above.** Effective-spread revenue needs
*no side classification at all*:

```
SpreadCapture$ = Σ_t |P_t − mid_t| · q_t · M          # theoretical MM edge at trade time
QuotedHalfSpread$ = Σ_t ½(ask_t − bid_t) · q_t · M
PriceImprovement  = 1 − SpreadCapture$ / QuotedHalfSpread$
```

`SpreadCapture$` is deterministic given tape + NBBO, is much closer to actual market-maker
revenue than premium flow, and cannot be argued with. `[INF — ours; the construct is standard
effective-spread accounting]`

**0DTE split:** `τ_t = 0` at trade time, aggregated separately and *also* net-of-round-trip
(a customer who opens and closes a 0DTE contract the same day appears twice in `Gross` and
correctly nets in `NetDealerPremium`; publish both so the churn is visible).

### 3.3 Data sources

D8 (tape + NBBO + condition codes) — ThetaData `trade_quote` returns the prevailing quote with
the print, so **no merge-asof is required**, which is what makes this affordable. D2 for the
ΔOI open/close reconciliation (§5.2 of the math doc) that upgrades `p_t` into an open/close-aware
inventory delta.

### 3.4 Compute cost & cadence

O(n) streaming aggregation. Order 10–60 M prints/session across a wide root set; a vectorized
polars pass is **minutes**, not hours. Cadence: 15-min intraday rollups (piggyback the live_flow
cycle — no new ThetaData slot, reuse the frames already pulled) + an EOD close-out. Backfill is
bounded by tape retention, not by compute.

### 3.5 Honesty tier

- **Tier A:** `SpreadCapture$`, `QuotedHalfSpread$`, `PriceImprovement`, `Gross`.
- **Tier B:** `Collected`, `Paid`, `NetDealerPremium`, `CaptureRate` — with the classifier's
  accuracy band propagated (Savickas–Wilson quote-rule ≈ 83 % on options `[DOC]` ⇒ a materially
  wide band on the *net*, because net is a difference of two large numbers).
- **Never Tier anything:** the word "profit", "P&L", or "revenue" applied to `NetDealerPremium`.

### 3.6 What could make it dishonest

1. **Calling it P&L.** The single largest failure mode. A dealer who collects $100 M of premium
   and hedges it may end the cycle down. Guard: the string "P&L" is CI-forbidden on this payload,
   same mechanism as `check_validated_claims.py` for "validated".
2. **Complex-order legs.** A customer vertical prints two legs — one bought, one sold. Signing
   each leg independently against its own NBBO manufactures both a large `Collected` and a large
   `Paid` from a single spread trade, and the net is right only by luck. **Must** route
   multi-leg condition codes into a package lane and sign the package by net premium vs. the
   derivable package NBBO, else leave unsigned.
3. **Midpoint and auction prints.** Price-improvement auctions and sub-penny mid prints are often
   customer-to-customer; treating the passive side as "dealer" over-attributes. Down-weight
   (`p_t → 0.5` ⇒ contributes 0 to net, full weight to gross).
4. **Wholesaler vs. floor MM.** The "dealer" in a retail PFOF print is a wholesaler whose
   inventory behaviour differs from an exchange MM. Our estimate lumps them; say so.
5. Late/out-of-sequence prints and stale NBBO at the moment of the print.

### 3.7 Validation

1. **Conservation.** Across all participants premium sums to zero by construction; our estimate
   must satisfy `NetDealerPremium = −NetCustomerPremium` exactly — a unit test on the aggregation.
2. **Cycle closure (the strong test).** For a *fully expired* contract, all positions terminate,
   so `Σ_t signed premium + settlement_intrinsic × net_customer_position` is a **closed** quantity
   equal to the customer's ex-hedge result on that line. Aggregate across an expiry cycle and
   compare against the vol-risk-premium magnitude implied by D6 (`vrp`). Signs and orders of
   magnitude must agree; a classifier that is systematically wrong will fail this loudly.
3. **ΔOI consistency.** On `|ΔOI| ≈ V` days (clean opening days) the classifier's implied opening
   direction must match the ΔOI sign; report the agreement rate as a published QA metric.
4. **Effective-spread sanity.** `PriceImprovement` should land in the empirically-known band for
   US options and be stable session to session; a jump means a data problem, not a market event.
5. Where obtainable, benchmark against CBOE Open-Close sample data (§5 of the math doc).

### 3.8 Upgrade

1. **The Tier-A spread-capture twin** — the honest number, shipped first, that no positioning
   assumption can break.
2. **Package-aware signing** instead of per-leg naivety.
3. **Cycle-closure reconciliation** turned into a *published* accuracy statistic for our own
   classifier — an auditable self-grade, which is the actual product.
4. **Premium → inventory join:** premium is the cash leg; pair each dollar with the greek it
   bought (`Σ p_t · vega_t · q_t M` = "dealer vega acquired"), so the desk sees *what risk the
   premium was compensation for*, not just the cash.

### 3.9 Ship surface

`options_flow/dealer_premium/{ROOT}.json` + a cross-root `options_flow/dealer_premium.json`
→ f `dprem:{ROOT}` / `dprem`. Schema `options_flow.dealer_premium/v1`:
`{schema, asof, session_date, root, window, gross_usd, collected_usd, paid_usd, net_usd,
capture_rate, net_band{lo,hi}, spread_capture_usd, quoted_half_spread_usd, price_improvement,
by_dte{"0","1-7","7-30","30-90","90+"}, by_right{c,p}, greeks_acquired{vega,gamma,vanna},
unsigned_share, package_share, classifier{version, accuracy, midpoint_share}}`.
UI: a pane on the existing Flow Desk (`components/flowdesk/`), not a new tab.

---

## 4. Spot-Vol Correlation / "Overvixing"

### 4.1 Definition

The empirical relationship between the underlying's return and the change in its constant-maturity
ATM implied vol, the **expected IV move implied by that relationship for today's spot move**, and
the **standardized deviation of the realized IV move from it** ("overvixing" when IV rose more
than the spot move warranted). Explicitly linked to skew via the mechanical decomposition in §4.2.

### 4.2 Formulas

Constant-maturity ATM IV by variance interpolation across the two bracketing expiries (never
linear in σ):

```
w(h) = σ²_1τ_1 + (σ²_2τ_2 − σ²_1τ_1)·(h − τ_1)/(τ_2 − τ_1);   σ_h = sqrt(w(h)/h)
```

**Estimation** — scale-invariant (log-vol) with a downside asymmetry and a vol-level interaction,
fit by EWMA-weighted OLS over 252 sessions (half-life 63d):

```
Δ ln σ_h,t = α + β · r_t + γ · r_t·1{r_t<0} + δ · r_t·ln σ_{h,t−1} + ε_t
```

`β` is dimensionless — the % change in IV per 1 % spot move. Downside beta = `β+γ`. `δ` captures
the documented shrinkage of the spot-vol response at high vol levels `[INF]`.

**Overvix score:**
```
Δσ̂_t = predicted from the fit;  z_t = (Δ ln σ_t − Δ ln σ̂_t) / σ̂_ε      (heteroskedasticity-adjusted)
```

**The skew link (the part that makes this more than a regression).** Under a frozen smile in
log-moneyness `m = ln(K/F)`, a spot move mechanically slides fixed-strike IV along the smile:

```
mechanical (sticky-delta) spot-vol beta:   β_skew = − ∂ψ/∂m |_{m=0}  ÷  σ_ATM
```

i.e. the ATM skew slope *is* a predicted spot-vol beta. Define the

```
Vol Repricing Ratio    VRR = β_empirical / β_skew
```

- `VRR ≈ 1` → the world is sticky-delta; IV moves are pure smile travel, **nothing repriced**.
- `VRR > 1` → genuine vol repricing on top of the travel (fear being *added*).
- `VRR < 1` → IV is under-responding to spot; skew is richer than the realized dynamic
  justifies — the classic "skew is over-priced relative to the actual spot-vol dynamic" reading.

`VRR` is the direct bridge to features **7** (implied skew) and **9** (fixed/floating), and to our
knowledge is not a construct any consumer dashboard ships. `[INF — ours; both halves standard]`

**Beta term structure:** estimate `β(7d), β(30d), β(90d)`. Its slope is "how far out the fear
propagates" and is a better stress read than any single-tenor number.

### 4.3 Data sources

D1 (2017→ IV surface for σ_h and for the historical fit), SUB-1 (`ψ` and `∂ψ/∂m` for `β_skew`),
D6 (`atm_iv`, `term[]` — cross-check only, not the source), price history for `r_t`.
**Intraday version:** D3 gives 15-min `(spot, ATM IV)` pairs on ~150 roots → an intraday
spot-vol beta on a variance-time clock, which is a genuinely rare object.

### 4.4 Compute cost & cadence

Trivial — a rolling weighted OLS per (root, tenor). 380 roots × 3 tenors = ~1,140 fits, sub-second
total. Nightly full re-fit; 15-min intraday `z_t` refresh on U-CHAIN roots (the coefficients stay
from last night; only the residual updates).

### 4.5 Honesty tier

- **Tier A:** `β`, `γ`, `δ`, their CIs, `σ_h`, the residual `z_t`, `β_skew`, `VRR`. These are
  deterministic transforms of quoted market data with published standard errors.
- **Tier C:** *any* forward claim — "overvixed ⇒ IV mean-reverts", "sell vol here". That needs the
  §4.7 grade attached or it renders grey and informational.

### 4.6 What could make it dishonest

1. **Timestamp mismatch.** If the IV snapshot and the closing print are minutes apart, the fitted
   β is contaminated by asynchronicity — and asynchronicity *biases β toward zero*, which makes
   everything look "overvixed". Both legs must come from the same snapshot.
2. **Earnings and scheduled catalysts.** IV moves for event-arrival reasons on those days;
   including them in the fit corrupts β and then flags the event day as an anomaly it created.
   Dummy them out of the fit (using §10c's calendar) and report them in a separate lane.
3. **Constant-maturity smearing** across a term-structure kink (e.g. interpolating 30d across an
   expiry that straddles FOMC).
4. **Substituting VIX for our own ATM IV.** VIX is a variance-swap-weighted strip, not ATM IV;
   the difference *is* skew, so a "VIX vs SPX" beta silently contains the very skew term we are
   trying to isolate. Name the construct on the axis.
5. Illiquid single-name IV series where the "IV change" is a quote-staleness artifact.

### 4.7 Validation

- **Out-of-sample R²** of the regression, walk-forward, per root and pooled; and a comparison
  against the naive constant-β baseline.
- **The tradeable test:** regress `Δ ln σ_{t+1}` on `z_t`. If overvixing means anything, the
  coefficient is negative and significant. Report Newey-West t, effect size in vol points, and a
  Diebold-Mariano test vs. a random-walk IV forecast. Slice by earnings/non-earnings, by regime.
- **Residual band coverage:** does |z|>2 occur ~5 % of the time? If not, the error model is wrong.
- **VRR face validity:** on the index complex, VRR should sit near 1 with excursions on genuine
  repricing days; if it is systematically 3, `β_skew` is being mis-measured (SUB-1 slope bug).

### 4.8 Upgrade

1. **Hierarchical shrinkage** of single-name β toward a sector/index β — short single-name
   histories otherwise produce confident nonsense. `β_root ~ N(β_sector, τ²)`, empirical-Bayes τ.
2. **VRR** — the skew-implied vs. empirical beta gap, which converts a descriptive stat into a
   structural statement about which vol world we are in.
3. **Beta term structure**, not one number.
4. **Intraday β on a variance-time clock** from D3 — 26 observations/day × 150 roots, versus
   the once-a-day observation everyone else fits on.
5. **Asymmetric + level-dependent** specification, so the model does not claim the same
   sensitivity at 12 vol and at 45 vol.

### 4.9 Ship surface

Folded into `options_vol/decomp/{ROOT}.json` (shared with feature 9) → f `voldecomp:{ROOT}`
(prefix-disjoint from `vol:` at char 4). UI: a panel inside the existing Volatility tab
(`components/vol/`) — `SpotVolPanel.tsx` alongside `VolTermPanel`/`VolSkewPanel`.

---

## 5. Volatility Plane Heatmap (+ dealer-positioning overlay)

### 5.1 Definition

**SUB-1.** The arbitrage-free implied-vol surface `σ(m, τ)` rendered as a heat field over a
selectable x-axis (strike / log-moneyness / delta) × y-axis (expiry date / DTE / √τ), coloured by
IV level *or* by IV z-score vs. that cell's own 2017→ history — plus, as the upgrade, a
co-registered **dealer positioning density** layer.

### 5.2 Formulas

Work in **total implied variance** `w(m,τ) = σ²τ`, `m = ln(K/F_τ)`. Per expiry, fit raw SVI:

```
w(m) = a + b [ ρ (m − m₀) + sqrt( (m − m₀)² + s² ) ]
```

subject to:
- **Butterfly no-arb:** the Durrleman density `g(m) ≥ 0` for all m on the fitted range.
- **Calendar no-arb:** `w(m, τ_j) ≤ w(m, τ_{j+1})` ∀ m.
- **Wing bounds:** slopes respect the Roger Lee moment constraints (`b(1±ρ) ≤ 2/τ`-style caps).
`[DOC — SVI, Durrleman condition, Lee wing bounds are all published results]`

Fit by Levenberg-Marquardt on **vega-weighted** IV errors against NBBO **mid** IV, with
quote-quality weights `ω_i = vega_i / (ask_i − bid_i)` — this automatically down-weights the
garbage deep-ITM wings that `volTypes.ts` already documents in the live store. Interpolate across
τ **linearly in total variance at fixed m** (or at fixed delta for the delta-axis view).

Outputs per contract: `σ_fit`, `resid = σ_mkt − σ_fit`, `resid_bps_of_spread = resid·vega /
half_spread$`, `no_quote` mask.

**The positioning overlay (the upgrade).** Bin the book onto the same `(m, τ)` grid and compute
a *density*, not a sum — so cell size does not distort the picture:

```
VegaDensity(m,τ)  = ( Σ_{i∈cell} n_i M Vega_i ) / (Δm · Δτ)      # $ vega per unit log-moneyness per year
GammaDensity(m,τ) = ( Σ_{i∈cell} n_i M Γ_i S² 0.01 ) / (Δm · Δτ)
```

Render as contours over the IV colour field. The reading a desk actually wants: *"the wing is bid
exactly where dealers are shortest vega"* — i.e. the smile there is inventory-priced, not
distribution-priced.

**The quantitative version — the demand-pressure coefficient.** Regress the surface residual on
the positioning density across cells, pooled over history:

```
resid(m,τ,t) = λ · ( − VegaDensity(m,τ,t) / ADV_vega ) + controls + ε
```

`λ > 0` means cells where dealers are short vega trade rich — the Gârleanu–Pedersen–Poteshman
demand-pressure prediction, measured on our own data `[DOC for the theory; INF for the estimator]`.
`λ` is the engine for features 7 and 8, and is a publishable number in its own right: *"the price
of dealer vol risk in this name, in vol points per unit of dealer vega imbalance."*

### 5.3 Data sources

D1 for the nightly plane (380 roots, and the 2017→ history that makes the z-score version
possible), D3 for the intraday plane and its evolution (~150 roots, 26 frames/session),
D2 + CLS-1 for the overlay, D4 for SPY/QQQ/IWM strike-resolved intraday cross-checks.

### 5.4 Compute cost & cadence

- SVI: ~15 expiries/root × 380 roots ≈ 5,700 constrained LM fits, a few ms each →
  **~30 s nightly** for the universe. Warm-start from yesterday's params: ~3×faster and much
  more stable day-over-day.
- Historical backfill for the z-score layer: 5,700 × 2,200 sessions ≈ 12.5 M fits. At 3 ms →
  ~10 h single-process, **~1.5 h across 8 M1 workers**; one-time, writes into SUB-2.
- Intraday: 150 roots × 26 frames × 15 expiries ≈ 58 k fits/session → ~3 min/session amortized
  at 15-min cadence. Requires a U-CHAIN publisher (does not exist yet — see §P).
- Grid payload: cap at 40 moneyness × 12 expiries per root; JSON stays well under 200 KB.

### 5.5 Honesty tier

- **Tier A:** the plane itself, the fit, residuals, no-arb pass/fail flags, no-quote masks,
  IV z-scores. All market-quoted or deterministic.
- **Tier B:** the positioning overlay and `λ`.
- **Tier C:** any rich/cheap *call* derived from the residual (that is feature 8).

### 5.6 What could make it dishonest

1. **Painting where there is no market.** The single worst sin here — a smooth surface implies a
   quote. Every cell with no two-sided NBBO, or a spread wider than X % of mid, must render as a
   hole, not as an interpolation. (Our own store's deep-ITM IV garbage is the known instance.)
2. **Last-trade IV instead of mid IV.** Last trade in an illiquid wing can be hours old.
3. **Interpolating across an event date** without an event bump — the fitted "smooth" term
   structure will be wrong on both sides of earnings. Feature 10c fixes this; until it exists,
   flag expiries that straddle a known catalyst.
4. **Forward mis-specification.** `m = ln(K/F)` needs the *option-implied* forward (from put-call
   parity per expiry), not `S·e^{(r−q)τ}` with a guessed dividend. Derive `F` from parity; on
   hard-to-borrow names the difference is large enough to tilt the whole smile.
5. Overlaying positioning contours without the posterior band, which makes an estimate look like
   a measurement.

### 5.7 Validation

- **No-arb pass rate** published per root per session; a fit that violates butterfly no-arb is not
  published, it is quarantined.
- **Held-out repricing:** drop 10 % of liquid contracts, reprice from the fit, and report the
  error in vol points and **as a fraction of the half-spread**. Target: inside the spread for
  ≥ 90 % of contracts with `spread/mid < 10 %`. This is the acceptance test.
- **Day-over-day parameter stability:** SVI params should not jump discontinuously absent a
  market event; publish the param-change distribution as QA.
- **`λ` validation:** sign and significance in-sample 2017–2022; hold-out 2023–2026; event study
  around large, publicly-visible vega-supply episodes — does the model see the supply land in the
  correct cells? Cross-sectional: names with larger |dealer vega| imbalance should show larger
  |resid|; a flat cross-section falsifies the mechanism.

### 5.8 Upgrade

1. **Arb-free by construction**, with the no-arb check as a *published field* rather than an
   assumption.
2. **The residual is a first-class output**, not a by-product — "which contracts trade rich vs. the
   arb-free surface" is a screener the moment the fit exists.
3. **Positioning overlay co-registered on the same grid**, with a band.
4. **`λ`, the measured price of dealer vol risk** — this converts the overlay from a pretty
   picture into an estimated economic quantity, and it is the only honest route to features 7–8.
5. **IV z-score colouring against 9 years of that same cell**, which turns "the surface" into
   "the surface, versus how this surface usually looks".
6. **Intraday plane evolution** on 150 roots.

### 5.9 Ship surface

`options_vol/surface/{ROOT}.json` → f `volsurf:{ROOT}`. Schema `options_vol.surface/v1`:
`{schema, asof, root, spot_ref, forwards[{exp, F, tau}], svi[{exp, a,b,rho,m0,s, rmse_vol_pts,
noarb_butterfly, noarb_calendar, n_quotes, warm_started}], grid{moneyness[], dte[],
iv[i][j], iv_z[i][j], mask[i][j]}, residuals_top[{occ, resid_vol_pts, resid_over_half_spread}],
overlay{vega_density[i][j], gamma_density[i][j], band_lo, band_hi, lambda, lambda_se},
coverage}`. UI: extend the existing Surface tab (`components/surface/SurfaceView.tsx`) with a
`plane` metric — it already owns quad-view, pins, crosshair sync, and the replay spine, so this is
a new metric in `QUAD_METRICS`, not a new desk. **Note:** `SURFACE_ROOTS` is currently SPY/QQQ/IWM
only; the nightly plane extends it to the full 380 while the *intraday* plane stays on the D4 three
until a U-CHAIN publisher exists.

---

## 6. Term Structure Aggregate Exposure

### 6.1 Definition

Estimated dealer exposure per greek, **bucketed by tenor**: `0DTE, 1–7d, 7–30d, 30–90d, 90–365d,
LEAPS >365d` — answering *where in time the dealer risk sits* — plus the forward roll-down of that
composition and the expiring-cliff calendar.

### 6.2 Formulas

```
E_g(bucket, t) = Σ_{i: τ_i ∈ bucket} n_i M g_i U_g(S)
share_g(bucket) = E_g(bucket) / Σ_b |E_g(b)|
```

Single-number summaries that are trendable and comparable across roots `[INF — ours]`:

```
gamma-weighted mean tenor   τ̄_Γ = Σ_i |Γ_i OI_i| τ_i / Σ_i |Γ_i OI_i|
front-loading ratio          FLR = E_Γ(≤7d) / E_Γ(all)
expiring share this week     ESW = Σ_{τ_i ≤ 5d} |Γ_i OI_i| / Σ_i |Γ_i OI_i|
```

**Roll-down forecast (the upgrade).** With *no new trades*, tomorrow's bucket composition is
deterministic — contracts age, τ shrinks, and near-ATM gamma migrates forward and sharpens:

```
for n in 1..N:
    τ_i^{(n)} = τ_i − n/252            (drop expired lines; drop them at their true expiry time)
    Γ_i^{(n)} = Γ(S*, K_i, τ_i^{(n)}, σ_i^{(n)})     σ from ψ rolled down the term structure
    E_Γ^{(n)}(bucket) = Σ n_i M Γ_i^{(n)} S*² 0.01
```
run under three spot paths: `S* ∈ {S, S ± EM_n}` with `EM_n` from D7. Output: *"in 5 sessions,
X % of today's gamma sits in the 0–7d bucket; if spot is at the put wall it is Y %."*

**Expiring-gamma cliff calendar:** for the next 60 sessions, the $ gamma / vanna / charm that
expires on each date. This is the OPEX topology, forward, and it is fully deterministic given the
book.

**2-D version:** the same buckets crossed with strike buckets (±1 EM, 1–2 EM, >2 EM), because
"where in time" and "where in price" interact — 3 % of gamma in the 0DTE bucket at the money is
worth more than 30 % in LEAPS 4 EM away.

### 6.3 Data sources

D5 (`by_expiry[]` already exists — this is largely a re-grouping of what we publish) + D1/D2 for
the 2017→ history and for greeks the ladder does not carry; SUB-1 `ψ` for the roll-down vol map;
D7 for `EM_n`; D3 for intraday refresh on 150 roots.

### 6.4 Compute cost & cadence

The bucketing is a groupby on data already computed — **free**. The roll-down is `N × 3` reprices
of the book (N=10 ⇒ 30 passes) ≈ **0.1–0.5 s/root**, ~3 min for 380 roots. Nightly. History
backfill rides the §1 backfill (same scan, extra groupby — do them in one pass).

### 6.5 Honesty tier

**Tier A** for gross/absolute buckets, `τ̄_Γ`, `ESW`, and the expiring-cliff calendar (all
`|g|·OI`, sign-free). **Tier B** for signed bucket exposure and the roll-down's signed magnitude.
The roll-down's *composition* (shares) is nearly sign-free and can render Tier A.

### 6.6 What could make it dishonest

1. **The 0DTE bucket built from t−1 OI is wrong by construction** — 0DTE positions are opened and
   closed intraday. Either build it from the tape (CLS-1) or render it as an explicit
   "OI-basis, understates" state. Never silently.
2. **Calendar DTE vs. trading DTE.** A Friday-to-Monday "3 DTE" has one trading day of gamma decay
   and three days of calendar theta. Use a trading-day τ for greek roll-down and a calendar τ for
   pricing, and label which is on the axis.
3. **The LEAPS bucket** is dominated by a handful of deep-ITM lines with near-zero gamma and
   enormous notional — a delta-notional LEAPS bar looks alarming and means nothing. Show LEAPS in
   greek units, and separately in notional, never merged.
4. **Roll-down presented as a forecast of the future book.** It is the forecast of *today's* book
   aged; new trading will change it. The gap between forecast and realized *is* the positioning-
   change measure (§6.7), which is the honest framing.
5. AM vs. PM settlement on index expiries — an AM-settled SPX line stops hedging on Thursday's
   close, not Friday's.

### 6.7 Validation

- **Identity:** `Σ_buckets = total` exactly (unit test).
- **Roll-down accuracy:** compare the N-day-ahead forecast composition to the realized one on
  low-turnover roots. Report MAE of the share vector. The residual attributable to new trading is
  itself published as `positioning_drift` — a validated, useful by-product.
- **Cliff calendar accuracy:** the gamma that actually left the book on expiry Friday vs. the
  predicted cliff — should match to within corporate-action noise.
- **Face validity:** `ESW` must spike into every monthly OPEX across 9 years; if it doesn't, the
  expiry mapping is broken.

### 6.8 Upgrade

1. **Forward roll-down** — nobody in this category ships the mechanically-known future
   composition of the book.
2. **Expiring-cliff calendar 60 sessions out**, which turns OPEX from folklore into a schedule.
3. **`τ̄_Γ` as a single trendable "duration of dealer risk" number** with a 2017→ percentile.
4. **2-D tenor × moneyness**, weighted so that near-money short-dated exposure is not visually
   drowned by far-dated notional.
5. Per-bucket percentile against 9 years of that bucket's own history.

### 6.9 Ship surface

`options_hub/tenor_exposure/{ROOT}.json` → f `tenorex:{ROOT}`. Schema
`options_hub.tenor_exposure/v1`: `{schema, asof, root, buckets[{key, dte_lo, dte_hi, gamma, delta,
vanna, charm, gross_gamma, share, pct_252, pct_all}], tau_bar_gamma, flr, esw, grid_2d{tenor[],
moneyness[], gamma[i][j]}, rolldown[{n_sessions, spot_path, shares{}, gamma_total}],
cliff[{date, gamma_expiring, vanna_expiring, charm_expiring, is_opex, settle}], convention,
coverage}`. UI: a pane on the GEX desk beside `ExpiryBars`/`ExposureExpiryDrawer` (which already
own the expiry lens), not a new tab.

---

## 7. Implied Skew (positioning-implied vs. market)

### 7.1 Definition

A **theoretical skew curve implied by estimated dealer vega/vanna positioning** under a
demand-pressure model, compared point-by-point against the market's actual skew. Shipped as a
*decomposition* — `market skew = baseline skew + positioning adjustment + residual` — never as a
fair-value call.

### 7.2 Formulas

Coarse the plane to `J` cells (recommend 7 moneyness × 5 tenor = 35). Let `d ∈ ℝ^J` be the dealer
vega position density per cell (§5.2), normalized by the root's vega ADV.

**Baseline skew `ψ⁰`** — the "no-positioning" reference. Three candidates, ship (ii) and offer (i):
- (i) *statistical*: fit a HAR/GARCH + skewed-t to 2017→ returns, risk-neutralize by the
  estimated variance premium, and price the resulting smile. Research-grade; heavy.
- (ii) *own-history*: the root's median smile shape at that `(m, τ)` over a trailing window,
  detrended by the current ATM level. **Shippable, robust, and it is what "normal for this name"
  actually means.**
- (iii) *peer*: cross-sectional smile from sector peers with low dealer vega imbalance.

**Positioning adjustment.** The demand-pressure result is that the price deviation of an option is
proportional to the dealer's exposure to *unhedgeable* risk it carries `[DOC — GPP 2009]`. The
shippable linear form:

```
Δψ = − λ · C · d
```

where `C ∈ ℝ^{J×J}` is the **cell-to-cell unhedgeable-risk kernel**, estimated *from our own 9
years* as the correlation matrix of daily fixed-moneyness IV changes between cells (i.e. cells
whose vols move together share risk). `λ` from §5.2. Then:

```
ψ_implied(m,τ) = ψ⁰(m,τ) + Δψ(m,τ)
RR25_implied  = ψ_implied(25Δc) − ψ_implied(25Δp)
Skew gap      = RR25_market − RR25_implied,   z-scored on its own history
```

Also publish the **fly**: `FLY25 = (ψ(25Δc)+ψ(25Δp))/2 − ψ_ATM` for both curves — the gap in the
wings and the gap in the tilt are different statements.

### 7.3 Data sources

D1 2017→ for `C`, for `ψ⁰`, and for the `λ` fit; SUB-1 for today's `ψ_market`; CLS-1 + D2 for `d`.
Cross-sectional peer sets from the GICS/mcap manifest already in the pipeline.

### 7.4 Compute cost & cadence

`C` is 35×35 — trivial; re-estimate monthly on a 3-year rolling window. `λ` pooled by sector,
re-fit weekly. Per-root nightly evaluation is a 35-vector matrix multiply — **microseconds**.
The cost is entirely in `d` (i.e. CLS-1), not here.

### 7.5 Honesty tier

**Tier C, unambiguously.** This is a model riding on a model: a pricing relation fed by an
*estimated* inventory. It may not ship without a live grade, and the market curve must always
render as the fact with the implied curve as the overlay.

**Propagate the posterior.** The band on `ψ_implied` comes from sampling `d` from CLS-1's
posterior through `−λCd`. **If that band is wider than the market-vs-baseline gap, the panel's
honest reading is "no information"** — and it will be, often. Build the UI so that state is the
default-looking one, not an error state.

### 7.6 What could make it dishonest

1. **Presenting `ψ_implied` as fair value.** It is "the skew consistent with our positioning
   estimate and a fitted risk price". Copy must carry both conditionals.
2. **`λ` fit in-sample and applied forever.** Regime-dependent; re-fit and publish the fit window.
3. **`C` estimated on the wrong object** — the correlation of *fixed-strike* IV changes contains
   skew travel (feature 9); it must be built on **fixed-moneyness** changes or `C` encodes spot
   moves as risk sharing.
4. **Baseline contamination.** `ψ⁰` from own-history already contains the average positioning
   effect, so `Δψ` measures only the *deviation* from typical positioning. Say that explicitly —
   otherwise the level of the adjustment is double-counted.
5. Circularity: `λ` fitted on residuals against the same `d` used to predict them. Fit `λ` on a
   strictly earlier window than every published evaluation.

### 7.7 Validation

- **In-sample:** `λ` sign (positive = short-vega cells trade rich) and significance, with
  clustered standard errors by date.
- **Out-of-sample:** `λ` from 2017–2022 applied to 2023–2026; does the skew gap have any
  predictive content at all, or is it noise?
- **Forward test:** does a positive skew gap (market steeper than positioning-implied) predict
  skew *flattening*? Regress `ΔRR25_{t+1..t+5}` on `gap_z_t`.
- **Trading grade (the one that decides whether it ships in colour):** a delta-hedged 25Δ risk-
  reversal backtest on the gap signal, using our own EOD greeks for the hedge, net of half-spread,
  with Newey-West t-stats and a null of random entry matched on vega and tenor.
- **Supply-shock event study:** periods of large, structurally-known vega supply should show `d`
  moving in the right cells and `Δψ` in the right direction.

### 7.8 Upgrade

1. **`C` estimated from 9 years of our own surface** rather than assumed diagonal — the risk
   kernel is the part everyone hand-waves.
2. **Posterior propagation end to end**, so "we don't know" is a first-class output.
3. **Three baselines side by side** so model risk is visible instead of hidden in one curve.
4. **`λ` published as an interpretable per-name quantity** — the price of dealer vol risk — which
   is more useful than the derived curve on most days.

### 7.9 Ship surface

`options_structure/implied_skew/{ROOT}.json` → f `iskew:{ROOT}`. Payload carries
`authority_tier:"display"`, `experimental:true`, `reliability{}` per the `options_structure`
convention (`engine/options_structure.py` validators are the pattern). UI: a pane inside the
Volatility tab, adjacent to `VolSkewPanel`, so the market curve is literally next to it.

---

## 8. Theo Curves

### 8.1 Definition

Per expiry, a **theoretical price curve across strikes** implied by the positioning framework,
plotted against actual market mid, with rich/cheap expressed three ways: in vol points, in $ per
contract, and — the only one that means anything — **as a multiple of the half-spread plus
estimated hedge cost**.

### 8.2 Formulas

```
Theo_i     = BS( S, K_i, τ_i, r, q, σ_model(m_i, τ_i) )
RC_vol,i   = σ_mkt,i − σ_model,i                                  (vol points)
RC_$,i     = Vega_i · RC_vol,i                                     ($ per contract)
Edge_i     = RC_$,i / ( ½(ask_i − bid_i)·M + HedgeCost_i )         (dimensionless; the only honest one)
HedgeCost_i ≈ |Δ_i| · M · S · (underlying half-spread bps) · E[#rehedges over holding period]
```

**Ship three model curves so model risk is visible, never one:**
1. **`σ_SVI`** — today's own arb-free fit (SUB-1). "Rich vs. the curve" = pure relative-value
   within the smile. Tier A input, and the only one with no positioning dependence.
2. **`σ_hist`** — the root's own historical smile at that `(m,τ)`, level-adjusted. "Rich vs. how
   this name usually prices."
3. **`σ_implied`** — feature 7's positioning-implied curve. "Rich vs. what dealer inventory
   justifies."

Their **disagreement is the product**: three curves agreeing that a wing is cheap is a different
statement from one curve dissenting. Publish the pairwise spread explicitly.

**Rendering rule (hard):** any contract with `|Edge_i| < 1` renders neutral-grey. Below one
half-spread there is no edge, only noise wearing a colour.

### 8.3 Data sources

SUB-1 (fit + residual), D1 (historical smiles, vega), D6, NBBO from D8 for spreads, CLS-1 → §7
for curve 3. Underlying spread/ADV from the equity plane for `HedgeCost`.

### 8.4 Compute cost & cadence

A subtraction on top of the SUB-1 fit — **free** for curves 1 and 2; curve 3 costs a 35-vector
multiply. Nightly for 380 roots; 15-min for the 150 U-CHAIN roots once a publisher exists.
Payload: top-N richest/cheapest per expiry (N≈20) plus the full curve at grid resolution.

### 8.5 Honesty tier

**Tier C.** A rich/cheap claim is a trading claim. Ships only with §8.7's grade attached, and
the grade is rendered *on the panel*, not in a doc.

### 8.6 What could make it dishonest

1. **"Theoretical price" implying fair value.** We have no fair value. The label must be
   "deviation from <named reference>", and the reference must be named on the axis.
2. **Quoting rich/cheap without spread and hedge cost.** A 0.4-vol-point edge on a contract with a
   1.2-vol-point spread is not an edge; presenting it as one is the category's default sin.
3. **Fit misspecification masquerading as edge.** Residuals against an SVI fit are systematically
   largest in the wings *because the fit is worst there*. Publish residuals normalized by the
   fit's own local standard error, not raw.
4. **Stale quotes.** An illiquid contract's "cheapness" is usually a quote that hasn't moved.
   Require a minimum quote-freshness and two-sided NBBO or exclude the line.
5. **Survivorship in the backtest** — grading only on contracts that stayed liquid.

### 8.7 Validation

- **Delta-hedged P&L backtest.** Buy the cheapest decile / sell the richest decile by `Edge`,
  hedge at 15-min resolution on the D3 roots (EOD-only on the rest), hold to a fixed horizon or
  to expiry. Report **gross and net** of half-spread, underlying hedge slippage, and a realistic
  rehedge count. Newey-West t-stats, per curve, per bucket (tenor × moneyness).
- **Null:** random contract selection matched on vega, tenor, and moneyness. The strategy must
  beat that null net of costs, or the panel is informational-grey forever.
- **Calibration curve:** bucket by `Edge` decile and plot realized hedged P&L per unit vega — it
  should be monotone. A non-monotone calibration means the signal is a liquidity proxy.
- **Curve-disagreement test:** does 3-of-3 agreement outperform 1-of-3? If not, drop to one curve.

### 8.8 Upgrade

1. **Edge measured in half-spreads**, with a hard neutral zone — this alone puts us ahead of every
   "rich/cheap" heatmap that ignores transaction costs.
2. **Three references, published disagreement.**
3. **A published, auditable hedged-P&L grade on the panel itself** — per our doctrine the grade
   *is* the product.
4. **Hedge cost modelled from our own underlying liquidity data** (§10b) rather than assumed zero.

### 8.9 Ship surface

`options_structure/theo/{ROOT}.json` → f `theo:{ROOT}`; `authority_tier:"display"`,
`experimental:true`, `grade{}` block mandatory and non-null before the panel may render colour.
UI: a pane on the Volatility tab or a drill from the surface residual list — reuse
`StrikeEvolutionModal`'s drill pattern.

---

## 9. Floating Strike — fixed-vs-floating IV decomposition

### 9.1 Definition

Decompose the change in implied vol into **(a) travel** — spot moved and the observation point
slid along an unchanged smile — and **(b) repricing** — the smile itself moved. In desk language:
how much of today's IV move was sticky-delta mechanics and how much was the market genuinely
re-pricing volatility.

**This is the highest-leverage item in the whole set**: it is Tier A, it needs no classifier, it
is cheap, and it feeds features 4, 7, and 8.

### 9.2 Formulas

Let the smile be a function of log-moneyness, `σ(K,t) = ψ_t( m )`, `m = ln(K/F_t)`. Total
differential of a **fixed-strike** IV:

```
dσ(K) = ∂ψ/∂t|_m · dt          ← REPRICE  (shape + level move at fixed moneyness)
      +  ψ'(m) · dm
with   dm = −d ln F ≈ −( r_t + rate/div drift )
```

so, discretely, for each strike on the ladder:

```
TRAVEL_spot(K)  = − ψ'_t(m) · ln( F_{t+1} / F_t )                 # the sticky-delta mechanical part
TRAVEL_time(K)  =   ψ_{t}( m , τ−Δt ) − ψ_t( m, τ )               # sliding along the term structure
REPRICE(K)      =   Δσ_fixed_strike(K) − TRAVEL_spot(K) − TRAVEL_time(K)
```

**Exact identity** `Δσ_fixed_strike ≡ TRAVEL_spot + TRAVEL_time + REPRICE` — a unit test with
tolerance, not a comment. Publishing the three-way (rather than the usual two-way) split is part
of the upgrade: the term-structure travel is real and is routinely dumped into "repricing".

**The stickiness estimator.** Across the strike ladder, regress:

```
Δσ_fixed_strike(K)  =  b · TRAVEL_spot(K)  +  c  +  e(K)
```

- `b ≈ 1, c ≈ 0` → **pure sticky-delta / floating-strike**: nothing repriced, the smile just slid.
- `b ≈ 0` → **pure sticky-strike**: strike vols didn't move at all; the smile shape absorbed the
  spot move.
- `c ≠ 0` → parallel vol level repricing on top.

Publish `b` (the **stickiness coefficient**) with its standard error, daily, per tenor, plus its
own 2017→ history and percentile. Also the ATM special case:

```
Δσ_ATM_fixed_moneyness = REPRICE at m=0        ← "did vol actually reprice"
Δσ_ATM_fixed_strike    = the number every dashboard shows
```

### 9.3 Data sources

D1 (2017→ fixed-strike IV series) + SUB-1 (`ψ`, `ψ'`, and the option-implied forward `F` from
put-call parity). Intraday version from D3 at 15-min resolution on ~150 roots — a 26-point-per-day
stickiness series that essentially nobody has.

### 9.4 Compute cost & cadence

A ladder-wide regression per (root, tenor) once the SVI fit exists — **microseconds**. Nightly for
380 roots plus a full 2017→ backfill riding the §5.4 historical fit pass. Intraday on U-CHAIN
roots at 15-min.

### 9.5 Honesty tier

**Tier A.** Every input is quoted market data and the decomposition is an identity. The *only*
estimated object is `ψ'`, and we publish its standard error and propagate it into the band on
TRAVEL. (Interpretive claims like "high repricing predicts follow-through" would be Tier C and are
out of scope for v1.)

### 9.6 What could make it dishonest

1. **Comparing across a roll.** If the contract expired or the strike list changed, "fixed-strike"
   is not fixed and phantom repricing appears. Track contract identity; on roll days, decompose
   only on strikes present in both sessions and disclose the coverage.
2. **Using spot instead of the forward.** `m` must be built on the option-implied forward. On
   hard-to-borrow or high-dividend names, using `S` puts a spurious constant into TRAVEL.
3. **`ψ'` estimated from a noisy local finite difference.** Use the fitted SVI slope (smooth,
   with an SE), not `(σ_{K+1}−σ_{K−1})/(m_{K+1}−m_{K−1})`, which is dominated by quote noise on
   wide-spread strikes.
4. **Corporate actions** re-striking the ladder overnight.
5. Reporting `b` from a regression with 4 usable strikes as if it were a measurement — enforce a
   minimum strike count and publish `n` and R².

### 9.7 Validation

- **Identity test** — reconstruction residual ≈ 0 to floating-point tolerance, on every root,
  every session, in CI.
- **Stylized-fact replication:** indices should sit closer to sticky-delta over long horizons and
  closer to sticky-strike intraday in quiet tape; single names should be stickier-strike than
  indices. If our estimator does not reproduce the ordering, `ψ'` is wrong.
- **Event separation:** earnings, FOMC, and CPI days must show large REPRICE; quiet drift days must
  be TRAVEL-dominated. This is a strong, cheap falsification test with 9 years of events.
- **Cross-check with feature 4:** the fitted stickiness `b` and the Vol Repricing Ratio `VRR` are
  two routes to the same statement and must agree in sign and roughly in magnitude
  (`VRR ≈ 1 ⟺ b ≈ 1`). Disagreement is a bug in one of them — a genuinely useful internal alarm.

### 9.8 Upgrade

1. **Three-way split**, isolating term-structure travel that others fold into repricing.
2. **A published stickiness coefficient `b` with a 9-year percentile** — the market's own
   sticky-strike ↔ sticky-delta regime, as a trendable series with level+trend+velocity per the
   regime-dynamics law.
3. **Intraday stickiness** from 15-min chains.
4. **It closes the loop with §2:** the scenario engine's vol-map choice (sticky-strike vs
   sticky-delta) stops being a UI toggle and becomes an *empirically selected* default per root —
   we use the vol map that this root actually exhibits. That is a real, measurable accuracy gain
   in the hedging widget, and it is only available to someone who computed `b`.

### 9.9 Ship surface

`options_vol/decomp/{ROOT}.json` → f `voldecomp:{ROOT}` (shared with feature 4). Schema
`options_vol.decomp/v1`: `{schema, asof, root, forward, tenors[{dte, b_stickiness, b_se, c_level,
r2, n_strikes, travel_spot_vol_pts, travel_time_vol_pts, reprice_vol_pts, identity_resid}],
atm{d_iv_fixed_strike, d_iv_fixed_moneyness, reprice_share}, spotvol{beta, beta_dn, beta_se,
beta_skew, vrr, overvix_z, tenor_betas{}}, history[{date, b, reprice_share, overvix_z}],
coverage{strikes_matched, roll_day}}`. UI: `components/vol/SpotVolPanel.tsx` +
`StickinessPanel.tsx` in the existing Volatility tab.

---

## 10. The remaining widgets — **OUR interpretation**

> Everything in §10 is *our* definition of a feature whose name we know and whose implementation we
> do not. Each spec below is labelled as our construct and must ship with UI copy that says so —
> we are not claiming parity with anyone's undisclosed method.

### 10a. 0DTE Delta Decay — *our interpretation*

**Definition.** As an expiring option's `τ → 0`, its delta converges to 0 or ±1. The dealer delta
carried by 0DTE positions therefore decays *deterministically* through the session, forcing hedge
unwinds. The widget projects the remaining unwind to the close.

**Formulas.** At intraday time `u` with `τ_u` in fractions of a trading day:
```
D0(u)      = Σ_{i ∈ 0DTE} n_i M Δ_i(S_u, σ_i, τ_u) S_u
DecayFlow  = − dD0/du = −[ Charm-term + Γ-term·(dS/du) ]
Projected remaining unwind to close, under three spot paths:
    S_close ∈ { S_u , S_u ± EM_remaining(u) }      EM_remaining from D7 × √(1−u) on the
                                                    variance-time clock (§6 of the math doc)
Headline: "$X of 0DTE dealer delta must be unwound by 16:00 if spot holds."
```
**Data:** CLS-1 tape-built 0DTE positions (t−1 OI is useless here, by construction) + D3/D4 for
the intraday greeks. **Cost:** trivial per 15-min tick; the cost is CLS-1. **Cadence:** 15-min RTH.
**Tier:** B for the magnitude, **C** for any claim about its market effect.
**Dishonesty:** OI-basis 0DTE numbers (wrong by construction); presenting large numbers as a doom
meter when the published evidence is that *net* MM 0DTE inventory is typically small and
slightly positive with modest vol impact `[DOC — CBOE/academic 0DTE literature]`. The honest
headline will usually be a small number, and the UI must be designed for that, not for drama.
**Validation:** projected unwind vs. realized closing-hour signed underlying volume; and the
prediction that the decay flow is largest when spot sits *near* the biggest 0DTE strike.
**Upgrade:** the three-path projection with the variance-time clock rather than a single frozen-
spot number; and per-strike attribution so the user sees which strike is doing the work.
**Surface:** fold into the GEX desk's 0DTE lens + `live_flow/zdte_decay_current.json`, f `zdecay`.

### 10b. Liquidity Widget — *our interpretation*

**Definition.** The tradability state of a root's options market and of its underlying, in the
units that matter for structural analysis.

**Formulas.**
```
spread_vol_pts     = (ask − bid) / vega            # a $0.05 spread means different things at 8 vol and 80 vol
quoted_depth_$     = Σ over top-of-book (bid_sz + ask_sz) · mid · M
eff/quoted ratio   = SpreadCapture$ / QuotedHalfSpread$        (§3.2 — free, already computed)
cost_to_trade_1k_vega = Σ over the cheapest ladder path to acquire 1,000 vega, in $ and in vol pts
underlying:  ADV$, average spread bps, our impact κ (§2.2)
hedgeability   H = |projected hedge flow at ±1%| / ADV$        # the number that makes GEX mean something
option_liquidity_z = z-score of a composite vs. the root's own 2017→ history
```
**Data:** D8 NBBO + D1/D3 for vega + equity ADV/spread. **Cost:** aggregation only; runs inside the
existing live_flow cycle (no new ThetaData slot). **Cadence:** intraday 15-min + EOD.
**Tier: A** throughout — every field is measured.
**Dishonesty:** quoting a "depth" from top-of-book on a market where size is hidden; ignoring that
NBBO in options is frequently a one-lot quote; averaging spreads across the chain without weighting
by where anyone actually trades.
**Validation:** effective/quoted ratio must reproduce the known stability of US option price
improvement; `cost_to_trade_1k_vega` back-tested against realized fills where we can see them.
**Upgrade:** **`H` (hedgeability)** is the important one — impact-normalized exposure is what the
academic evidence supports as the fragility measure, and it belongs on every GEX surface as a
divisor, not as a separate widget.
**Surface:** `options_hub/liquidity/{ROOT}.json`, f `optliq:{ROOT}`; consumed as a *field* by the
GEX desk and the EOD context belt (`components/eodcontext/StructureStrip.tsx`) rather than as a
standalone tab.

### 10c. Catalyst Impact — *our interpretation*

**Definition.** Decompose the term structure into a diffusive base plus discrete **event variance
bumps**, extracting the market's priced move for each scheduled catalyst, and grade it against
that name's realized history of the same catalyst.

**Formulas.** With events `e` at dates `t_e`, total variance to expiry `τ`:
```
w(τ) = σ_base² · τ  +  Σ_{e : t_e ≤ τ} v_e
```
Fit `σ_base` and `{v_e}` by non-negative least squares across expiries that straddle each event
(the identification comes from the *jump* in `w` between the expiry just before and just after).
Then:
```
implied event move   EM_e = sqrt(v_e)                     (as a % of spot, 1σ)
event VRP            = EM_e  −  median realized |move| on that name's past catalysts of that type
post-event IV crush  ΔIV_e = the drop in front ATM IV implied by removing v_e
```
**Data:** D1/SUB-1 term structure + an **event calendar** (earnings dates exist in our fundamentals
plane; FOMC/CPI/NFP are a static macro calendar — this is the one genuinely missing input and it is
small). D1 2017→ for the realized-move history per name per event type. **Cost:** an NNLS over ~15
expiries per root — milliseconds. **Cadence:** nightly, plus an intraday refresh into the event.
**Tier: A** for the extraction (`v_e`, `EM_e`, `ΔIV_e` are transforms of quoted data). **Tier C**
for "this catalyst is priced rich/cheap".
**Dishonesty:** attributing a term-structure kink to an event when it is really a liquidity gap or
a listing artifact (require ≥2 expiries on each side); ignoring overlapping events inside one
expiry gap (the NNLS then splits arbitrarily — flag as unidentified rather than reporting a split);
and treating `EM_e` as a directional forecast.
**Validation:** realized post-event absolute move vs. `EM_e` — coverage, Mincer-Zarnowitz
regression, and pinball loss vs. a naive "last 8 earnings moves" baseline, over 9 years and 380
roots. That is a *large* validation sample and it will produce a genuinely credible calibration.
**Upgrade:** two things nobody links. (1) A per-name, per-event-type **event VRP** built from 9
years of realized moves. (2) **`ΔIV_e` is the missing input to feature 2** — the size of the
post-event IV crush stops being a free slider on the vanna axis and becomes a *derived* quantity,
so the "vanna rally" projection acquires an actual magnitude. That link is the differentiator.
**Surface:** `options_hub/catalyst/{ROOT}.json`, f `catalyst:{ROOT}`; a card on the Volatility tab
+ a `hedgemap` default-scenario feed.

### 10d. Spot Vol Beta — *our interpretation*

Feature **4**, productized as a screenable per-root field rather than a chart: `β_7d, β_30d, β_90d`,
downside beta `β+γ`, the beta term-structure slope, `β_skew`, `VRR`, each with a 2017→ percentile.
**Tier A.** Cost: already computed in §4. Ships as columns in the panel (SUB-2) and in the screener,
with no separate payload.

### 10e. Extremes — *our interpretation*

**Definition.** A cross-root board of *how unusual today is*, per metric and jointly.

**Formulas.** For each `(root, metric)` in SUB-2:
```
pct(root, metric, t) = empirical percentile of the NORMALIZED series over the trailing window
                       (min coverage 500 sessions, else the metric is withheld, not estimated)
```
Then the joint measure — the part that is actually new:
```
x_t = the root's z-vector across K chosen metrics
Σ   = shrunk covariance (Ledoit-Wolf) of x over the root's own history
D_t = sqrt( (x_t − μ)ᵀ Σ⁻¹ (x_t − μ) )          # Mahalanobis "configuration extremeness"
```
plus an **analog engine**: the k nearest historical dates by `D`-metric distance, and the empirical
distribution of what happened next (forward 5/10/21-day return and realized vol) across those
analogs, with `n` and a bootstrap CI.
**Data:** SUB-2 only. **Cost:** the panel is ~33 M rows; percentiles and a 380-root × K-dim
Mahalanobis are a few seconds nightly. Analog search is a k-NN over ~2,200 × 380 vectors — instant
with a KD-tree, precomputed nightly.
**Tier:** each metric inherits its own tier (A or B). `D_t` is **A** (a deterministic transform).
The **analog forward-outcome distribution is C** and needs the §10e validation before it renders
in colour.
**Dishonesty:** percentiles on non-stationary raw series (§1.6); ranking roots by a metric with
5 years of history against roots with 9; treating overlapping historical analogs as independent
observations (they aren't — 20 nearby dates are ~1 observation, so the CI must use a block
bootstrap or the "n=40 analogs" claim is a lie).
**Validation:** block-bootstrap CIs on the analog outcome distribution; test whether analog-based
forward-vol forecasts beat an unconditional and a HAR baseline out-of-sample. If they don't, the
analogs ship as *history browsing*, which is still valuable, rather than as a forecast.
**Upgrade:** the **analog engine** is the killer application of 9 years × 380 roots and is simply
unavailable to anyone holding 6 months. "This configuration of gamma, skew, term slope, and
spot-vol beta has occurred 11 times since 2017; here are the dates and here is what followed" —
with an honest block-bootstrap CI — is a better product than any single extreme reading.
**Surface:** `options_hub/extremes.json`, f `extremes`; new hub tab or a rail on PRISM.

### 10f. Quad Screener — *our interpretation*

**Definition.** Screen the 380-root universe on a user-chosen pair of structural axes, plotted as
a 2×2 (or scatter with quadrant shading), with **forward-outcome statistics attached to each
quadrant from history**.

**Formulas.** Axes are any two SUB-2 metrics (canonical defaults: `sign(net gamma) × VRP z`, and
`IV rank × skew z`). Placement is a lookup. The quadrant statistic:
```
For quadrant q: over 2017→, collect all (root, date) with x ∈ q;
report the forward 5/10/21d distribution of  return, |return|, realized vol, and IV change:
median, IQR, hit rate, n_effective (block-bootstrap-adjusted for overlap and cross-sectional
correlation — this is the number that decides whether the cell says anything)
```
**Data:** SUB-2 only. **Cost:** with the panel precomputed, an arbitrary-axis quadrant statistic is
a groupby over ~800 k `(root,date)` rows — **sub-second**, so the axes can genuinely be
user-selectable rather than a fixed 2×2.
**Tier:** placement **A**; forward-outcome statistics **C**.
**Dishonesty:** the multiple-comparisons problem is severe — a user who tries 40 axis pairs will
find a "significant" quadrant by construction. Mitigate with (i) a fixed, pre-registered default
pair whose stats are the headline, (ii) an explicit "you have viewed N combinations" counter and a
Bonferroni/False-Discovery-adjusted significance column on exploratory pairs, (iii)
`n_effective` (not raw n) shown on every cell. Also: cross-sectional correlation means 380 roots on
one date are nowhere near 380 independent observations.
**Validation:** walk-forward — quadrant statistics estimated on 2017–2022 only, evaluated on
2023–2026; report the decay in effect size. Most cells will decay a lot, and publishing that is the
honest differentiator.
**Upgrade:** **arbitrary user-selected axes with on-the-fly, overlap-corrected statistics** — the
combination of a precomputed 9-year panel and a correct effective-sample-size calculation is what
makes this defensible rather than a data-mining toy.
**Surface:** `options_hub/panel_meta.json` + a server-side aggregation route (the panel itself
stays server-side; the client never receives 33 M rows). f `quad` with query params; UI as a hub
tab reusing `MatrixGrid`'s rendering idiom.

---

## P. Prioritised build order

Ranked by **value × feasibility on data we already own**. Every item's blocking dependency on
**CLS-1** (the trade-side classifier + inventory posterior, `dealer-positioning-math.md` §5) is
called out explicitly.

### Wave 0 — substrate (nothing ships without these)

| # | Item | Classifier? | Why first |
|---|---|---|---|
| 0.1 | **SUB-1 arb-free surface engine** (§5.1–5.2) | **No** | Features 4, 7, 8, 9, 10c all consume `ψ` or `ψ'`. Two weeks of work that unblocks half the document. |
| 0.2 | **SUB-2 metric panel** + the §1 2017→ backfill scan | **No** | One 51 GB pass produces the greek-trend history, the tenor buckets, the surface history, and the screener panel *simultaneously*. Do not scan the store four times. |
| 0.3 | **CLS-1, started in parallel as a research track** | — | It gates 6 of the 10 features. Start now, ship later; do not let the P0 UI wave wait on it. |

### P0 — high value, **no classifier dependency**, data fully in hand

| Rank | Feature | Tier | Rationale |
|---|---|---|---|
| 1 | **§9 Floating Strike decomposition** | **A** | Cheapest genuinely-differentiated item in the set. Identity-checkable, needs no positioning assumption, and its output (`b`) makes §2 measurably more accurate. |
| 2 | **§5 Volatility Plane (base, no overlay)** | **A** | Foundational and immediately shippable into the existing Surface tab. The residual output is a free screener. |
| 3 | **§4 Spot-Vol Beta / Overvixing (+§10d)** | A (+C for claims) | Trivial compute, 9 years of data, and `VRR` is a real construct. Cross-validates §9. |
| 4 | **§1 Aggregate Greek Trend** (naive convention + 3-convention band) | A gross / **B** signed | The 2017→ depth is our structural advantage over a 6-month history. Ships honestly *today* on the naive convention; CLS-1 later replaces the sign layer without changing the surface. |
| 5 | **§6 Term Structure Exposure + roll-down + cliff calendar** | A gross / **B** signed | Falls out of the same nightly pass as #4 at near-zero marginal cost; the roll-down is unique. |
| 6 | **§10b Liquidity Widget** | **A** | Small, entirely measured, and it supplies the `ADV$`/`κ`/`H` divisors that make every other exposure number meaningful. |
| 7 | **§3 (Tier-A half) Spread-capture / effective-spread revenue** | **A** | Deliverable from the tape *without* any side classification. Ships the "dealer premium" surface honestly months before the signed version. |
| 8 | **§2 Greek Hedging Widget** (naive convention, exact reprice, empirical vol path) | **B** | High user value; the magnitude is assumption-dependent but the *shape* and the vol-map choice from #1 are not. Feedback multiplier stays grey until §2.7 grades it. |
| 9 | **§10c Catalyst Impact** | A / C | Needs only a small event calendar we mostly have; the 9-year realized-move calibration is a strong, cheap validation win, and it feeds #8. |
| 10 | **§10e Extremes + analog engine** | A / C | Reads SUB-2 only. The analog engine is the single best use of our history depth. |
| 11 | **§10f Quad Screener** | A / C | Also SUB-2-only; sequenced after #10 because it shares the effective-sample-size machinery. |

### P1 — **blocked on CLS-1** (start only when the posterior is validated)

| Rank | Feature | Why blocked |
|---|---|---|
| 12 | **CLS-1 itself: classifier + ΔOI reconciliation + inventory posterior** | The enabling deliverable. Ship it with its own accuracy grade (§3.7 cycle closure, ΔOI agreement rate, week-over-week sign stability) *before* anything consumes it. |
| 13 | **§3 (Tier-B half) signed Dealer Premiums** | Needs `p_t`, package-aware signing, and the accuracy band. |
| 14 | **§10a 0DTE Delta Decay** | Needs tape-built intraday inventory; t−1 OI is wrong by construction and there is no honest fallback. |
| 15 | **§5 positioning overlay + `λ`** | Needs `d` (dealer vega density) from the posterior. |
| 16 | **§7 Implied Skew** | Model on a model; needs `d`, `λ`, and `C`. Tier C, ships grey until graded. |
| 17 | **§8 Theo Curves** | Needs §7 for its third curve — though curves 1 and 2 (SVI and historical) could ship at P0 as a "relative value vs. the smile" panel, with curve 3 added later. **Consider splitting this: `theo(1,2)` is P0-feasible.** |

### Upgrades that require *no new data at all* and should be treated as free wins

`Ê` (net-share-of-gross) normalization on every exposure series; the FLOW/REPRICE decomposition;
impact-normalized `GEX/ADV` everywhere; the `Edge_i` half-spread neutral zone; block-bootstrapped
`n_effective` on every historical statistic; and the exact-identity unit tests in §1.2, §6.7, §9.2.
Each is a few dozen lines and each removes a specific way the product could lie.

### Sequencing note on infrastructure

- The **U-CHAIN publisher does not exist** (`repo-integration-map.md` §3.4). Everything intraday in
  this document — the intraday plane, intraday stickiness, intraday spot-vol beta, 15-min tenor
  exposure on 150 roots — is gated behind writing one builder + R2 key + f-param triplet. It is a
  small job with a large blast radius; schedule it inside Wave 0.
- New heavy batch (the 51 GB scan, the 12.5 M historical SVI fits) belongs on the **M1**, not the
  M2 that still feeds production.
- Every new payload needs: an `isValidF`/`backendPath`/`r2Key` triplet with a **prefix-disjoint**
  f-param, a root-keyed honest-`{}` fixture, an entry in `hubFixtures.test.ts`, and an `asof` chip
  that tells the truth about whether the data is nightly or live.
