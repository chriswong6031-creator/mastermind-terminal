# Volland parity — what to copy, what to beat, and in what order

**Date:** 2026-08-01 · Annex to `docs/MARKET_STRUCTURE_CORE_MASTERPLAN_2026-08-01.md`.

> **Status 2026-08-01 — W1, W2 and W3 shipped.** See §7 for what landed, the two live
> defects the work surfaced, and what W4 still owes. Read §7 before re-planning anything
> here: three §3 rows moved, and one methodological assumption in §5 was measured wrong.

**Evidence:** operator-supplied screenshots of the live product (retail dashboard, institutional
widgets, single-name exposure), plus `docs/audits/2026-08-01-market-structure-core/`
(`volland-feature-census.md`, `volland-methodology.md`, `volland-build-specs.md`). The census agent
located Volland's **official 45-page user guide**, their **white paper**, and their public Stripe
products endpoint, so tier pricing and per-widget behaviour are documented rather than inferred.

We have no subscription and there is no trial. Everything here is from public artifacts and the
operator's screenshots. **Parity means capability parity — never their copy, assets, or design.**

---

## 1. The one idea worth taking above all others

Every Volland exposure chart labels its y-axis **"Notional Hedging Requirement"** in dollars — not
"gamma exposure", not "GEX $mn". Gamma, vanna, charm, vega, theta and delta all render into the same
unit: *the dollar amount of underlying a hedged dealer must transact.*

That is a better product than ours, and the gap is framing, not data. We already publish
`gamma_net`, `delta_net`, `vanna_net` and `charm_net` per strike in $mn of dealer delta
(verified against `engine/options_hub.py`). We have been showing traders a greek and asking them to
translate. Volland does the translation and shows the answer.

**Consequence:** the highest-value change we can make to the Exposure desk costs no new data. It is
a unit reframing plus the honest per-unit disclosure ("per +1% spot" / "per +1 vol point" /
"per +1 day"), which we already carry in `lib/marketStructure.ts`.

**Where we then beat them:** their axis is a *static* requirement at the current spot. Our
`scenarioGrid` already answers the same question across a (ΔS, Δσ, Δt) surface. Their number is one
cell of our grid.

---

## 2. Design decisions worth adopting (from the screenshots)

These are craft choices, visible in the product, that make their charts read better than ours:

1. **One unit across every greek** — §1. Removes the "is this big?" problem entirely.
2. **Two renderings of the same series, always available**: a per-strike **histogram** and a
   **cumulative/profile** line. Bars answer "where is it concentrated"; the line answers "what
   happens as price travels".
3. **The cumulative chart is anchored, not a raw cumsum.** Per their user guide: for *second-order*
   greeks the most recent closing strike is pinned at **zero**, and the curve shows the cumulative
   hedging requirement accumulated as the market moves away from it. For *first-order* greeks it
   shows absolute dealer position across strikes (a roughly flat line). This is a real modelling
   distinction we would otherwise have got wrong by cumsumming everything identically.
4. **Tenor colour-banding on term-structure charts**, encoding the *gap* between expirations:
   orange = daily (1–5d), yellow = weekly (6–10d), blue = monthly (11–35d), indigo = quarterly
   (36–360d), violet = annual (>360d). Visible in the operator's screenshots. It makes "where in
   time does the risk sit" legible at a glance without reading axis labels.
5. **A range brush under every chart.** Same affordance, same position, every widget. Strike axes
   span the full listed range including deep tails, so the brush is load-bearing rather than decorative.
6. **Spot marked as a labelled vertical rule** on every strike chart.
7. **Provenance in every widget header**: ticker · tier badge · greek · expiration filter ·
   puts/calls · `as of` timestamp. The tier badge doubles as feature provenance.
8. **Expiration filter is a first-class control on every exposure chart**, not a separate view —
   "All expirations", "0–30 days (dated range shown)", "Today (dated)".
9. **Gauges for bounded scalars** (Catalyst Impact 0–100 with a verdict word; Spot Vol Beta on an
   Overvixed↔Undervixed axis). A dial communicates "where in range" faster than a number.

Adopting 1–4 is most of the perceived quality gap. None of them need new data.

---

## 3. Feature census → our status → verdict

Tier prices confirmed from Volland's own public Stripe endpoint: VolHacks $99 · Swing $150 ·
0DTE $250 · Insight $400 · Universe $1,000 · Institutional $5,000.

### 3.1 Buildable now, on data we already hold

| Volland feature | What it is | Our status | Build |
|---|---|---|---|
| **Notional Hedging Requirement axis** | every greek in $ of underlying to transact | we ship raw $mn greeks | **W1** |
| **Exposure histogram + cumulative pair** | per-strike bars and an anchored profile line | bars only (StrikeLadder) | **W1** |
| **Term Structure Exposure** | exposure by expiration, tenor-banded, bars + cumulative | `by_expiry` published, rendered plainly | **W1** |
| **Greek Hedging card** | Daily Delta / Vega / Theta hedging + Total | not built | **W1** |
| **Aggregate Greek Trend** | greek aggregate over time vs its historical average | not built — **but we hold 2017→, they show ~5 months** | **W2** |
| **Spot-Vol Correlation** | regress vol change on spot change; R², slope, current ratio | not built | **W2** |
| **Spot Vol Beta gauge** | the same relationship as an Overvixed↔Undervixed dial | not built | **W2** |
| **Extremes** | short-term / swing / long-term support & resistance table | we have walls, not a horizon table | **W2** |
| **Floating Strike** | exposure bucketed by **delta band** (C-95-100 … C-0-5) rather than strike | not built — **we have per-contract delta** | **W2** |
| **Greek Volatility surface** | 3-D greek across strike × DTE × IV | not built | **W3** |
| **Quad Screener** | cross-ticker scatter, direction × volatility, both normalised to ±1 | not built | **W3** |
| **Liquidity** | delta-adjusted dealer spread vs VIX | not built | **W3** |
| **Implied Skew** | market skew curve vs a positioning-implied one | not built | **W3** |
| **Theo Curves** | actual vs theoretical **notional delta** across strikes | not built | **W3** |

**Note on Floating Strike:** the screenshot resolves what the public docs do not. Its x-axis is
`C-95-100, C-90-95 … C-5-0` — **call-delta buckets**, not strikes. So Floating Strike is exposure in
*delta space* rather than *strike space*: the sticky-delta view of the same book. That is a genuine
and cheap addition for us — our chain carries per-contract delta already.

**Note on Theo Curves:** the screenshot shows the y-axis as **Notional Delta**, not option price. So
it is not a pricing model — it compares the *actual* exposure curve against a *theoretical* one
across strikes. That is materially easier than the "theoretical option pricing" reading in the
earlier brief, and it is buildable once we have a positioning-implied reference curve.

### 3.2 Blocked or deliberately skipped

| Feature | Why |
|---|---|
| **Dealer Premium** | needs accumulated per-trade premium from a classified tape (§4). Their own docs warn it is not dealer P&L — we must carry the same caveat or not ship it. |
| **Paradigm / Lines in the Sand** | a named regime classifier ("BOFA-PURE", "AG-LIS") with a target and a level band. Methodology undocumented. **Do not clone a named regime we cannot reproduce or grade** — it would be exactly the unfalsifiable-claim class our doctrine forbids. |
| **Catalyst Impact** | 0–100 dial with a bias verdict; methodology undocumented. Same ruling — build our own graded equivalent or nothing. |
| **Futures tickers** | operator ruling: not now. See §6. |

---

## 4. Their real moat, and the honest correction to our earlier position

Volland's white paper and guide describe the pipeline: process individual OPRA trades → estimate
whether the **dealer** bought or wrote each contract from execution price, surrounding trades, fair
value and bid/ask → accumulate an inventory estimate → recompute greeks per strike and expiry. They
report >90% classification accuracy across expirations and ~99% for SPX 0DTE, benchmarked against
Cboe open/close.

**So Cboe open-close is their answer key, not their input.** An earlier note in this program implied
we needed to license participant data to compete. That was wrong, and the correction matters:

- Their input is the same OPRA tape we already hold through ThetaData Professional.
- What we lack is not data but a **calibrated classifier** and the ground truth to measure it.
- Per `participant-data-economics.md`: Cboe offers a **free trial of up to 6 months of historical
  EOD Open-Close** to firms that have never purchased it. That is enough to calibrate and measure.
  **Budget $0.**
- The number that actually bites is **redistribution: ~$5,000/month per exchange** to show derived
  aggregates to subscribers. We stay on the internal-use side by calibrating only — never serving
  from it.
- Scope caveat worth internalising: Cboe is ~28% of total US options volume but **~98% of index
  option volume**. So for SPX/VIX the open-close file is effectively a census and near-perfect
  ground truth; for SPY/QQQ and single names it is a sample. **This is very likely why Volland's
  headline accuracy figure is quoted for SPX 0DTE** — that is where the ground truth is best.

**Where that leaves us:** their accuracy claim is self-reported with no independent audit. Ours can
be measured against the same public ground truth and published with its n and its confidence
interval — per-root, and honestly weaker for single names than for SPX. That is a claim they have
not made and structurally cannot, having priced their product on the assertion.

---

## 5. Build order

**W1 — the reframing (no new data, no new payload).**
Notional Hedging Requirement as the canonical unit on the Exposure desk and the Positioning tab ·
per-strike histogram **and** anchored cumulative profile · Term Structure Exposure with tenor
colour-banding · Greek Hedging summary card. This is the wave that closes most of the perceived
quality gap.

**W2 — history and relationships (data we hold, new compute).**
Aggregate Greek Trend over our full 2017→ surface with a historical-average reference — **deeper
than their ~5 months, which is a real advantage, not parity** · Spot-Vol Correlation + Spot Vol Beta
gauge · Extremes horizon table · Floating Strike (delta-bucketed exposure).

**W3 — surfaces and cross-sectional.**
Greek Volatility 3-D surface · Quad Screener · Liquidity · Implied Skew · Theo Curves. These need
either a positioning-implied reference curve (Implied Skew, Theo Curves) or a cross-root batch
(Quad Screener), so they follow W2.

**W4 — the classifier.** Trade-side inference on the OPRA tape → accumulated dealer inventory →
calibration against the free Cboe EOD Open-Close trial → **published per-root accuracy**. This is
what turns every Tier-B estimate in the estate into a measured one, and it is the only work here
that touches their actual moat.

**Sequencing note:** W1 is pure presentation over shipped payloads and can land immediately. W2's
Aggregate Greek Trend needs a macro-side history builder. W4 is a program, not a wave.

---

## 6. Futures — the standing recommendation

Operator ruling is not now, and the research supports it. SpotGamma serves ES/NQ traders without CME
options data by publishing levels in SPX terms with basis conversions. If that holds, a converter
gives us most of the futures audience for $0, and Databento's ~$199/mo buys only genuinely different
underlyings (CL, GC, ZB) that an equity/index terminal does not need yet. Revisit when a user
segment actually asks for oil or metals gamma.

---

*Do not reproduce Volland's copy, marketing, or visual design. Parity here means capability parity,
rendered in the v5/v7 Terminal idiom, under our honesty tiering.*

---

## 7. What shipped, 2026-08-01 — and what the build taught us

### 7.1 Delivered

| Wave | Cards | PRs |
|---|---|---|
| **W1** | Hedging requirement by strike · Today's hedging · Term structure | terminal #302 |
| **W2** | Positioning vs its own history · Spot–vol relationship · Where gamma sits by horizon | macro #4194 · terminal #304 |
| **W3** | The book in delta space · Which names sit at a positioning extreme | macro #4199 · terminal #305 |

The Positioning tab now carries **13 cards**. New published artifacts:
`options_hub.aggtrend/v1` (`agg:{ROOT}`), `options_hub.quad/v1` (`quad`), and a `by_delta`
block on `options_hub.gex/v1`.

### 7.2 Two live defects the work surfaced

Both were found by *building on top of the data*, not by auditing it — which is the
argument for building history and cross-sectional views early rather than late.

1. **The gamma flip was the wrong estimator** (macro #4189). Three sites returned the
   zero-crossing of a running sum across the strike ladder rather than the zero-gamma
   *spot*. SPY published 275.00 against a spot of 741.69. Full RCA in
   `docs/audits/2026-08-01-market-structure-core/gamma-flip-defect-rca.md`.

2. **A degenerate quote could dominate a headline** (macro #4194). On 2026-06-26 the
   published SPY net gamma was **−$1,129bn**, all of it one 0DTE at-the-money put quoted
   at `iv = 0.0001`, where Black-Scholes gamma diverges. 21 of 2,407 SPY sessions were
   contaminated; **two had the sign inverted**. Fixed by gating on `MIN_QUOTED_IV`; the
   filter changes nothing on ordinary sessions.

The pattern is identical in both: a number that is arithmetically faithful line by line
and wrong as an answer to the question asked. Neither would have been caught by a test
of the code as written — only by checking the output against reality.

### 7.3 The §5 assumption that was measured wrong

§5 W2 said our depth (2017→, 2012→ for QQQ) was "a real advantage, not parity". That is
true for the *chart* and false for the *percentile*, and the difference matters.

Dealer exposure scales with the underlying — gamma with S², vanna and charm with S. SPY's
yearly **median** vanna climbed 3.54bn (2017) → 5.07bn (2026) while spot went 225 → 741.
So a rank against nine years partly measures how much the market **grew**: the first quad
board put 20 of 23 roots above the 85th vanna percentile and left two of the four corners
empty. Not a finding — a trend.

**Ruling:** ranks are computed over a trailing year; the long series stays for the *chart*,
where the drift is visible and the reader can judge it. Any future percentile over these
series inherits this constraint. Detrending (exposure per unit of notional) is the more
principled fix and is open for a later wave; it changes the published unit, so it is not
a drive-by.

### 7.4 What W4 still owes

- **The trade-side classifier** (§5 W4) — untouched. Still the only work here that
  reaches their actual moat, and still a program rather than a wave.
- **Theo Curves / positioning-implied skew** — deliberately not built. `VolSkewPanel`
  already ships the *market* smile; the missing half is a positioning-implied reference
  curve, which is a model we cannot yet grade. Same ruling as Paradigm and Catalyst
  Impact in §3.2: build a graded equivalent or nothing.
- **Greek Volatility 3-D surface, Liquidity** — buildable, not yet built. The matrix
  store already carries strike × expiry, so the surface is presentation work; Liquidity
  needs a per-root spread series the EOD store can support.
- **Detrended exposure** — see §7.3.
