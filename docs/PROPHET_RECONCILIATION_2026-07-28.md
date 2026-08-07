# Prophet Reconciliation — decision record (2026-07-28)

*Commissioned by the operator ("same product on two dashboards, existing differently — how do we
reconcile, should options feed signaling, should the two merge?"). Forensics by the v7b diagnosis
workflow (lane D3); decision authored by the orchestrating session. Full evidence with file:line
citations lives in the lane output; load-bearing facts are restated here.*

## The facts (verified against the live R2 payload, 2026-07-28)

1. **Terminal Prophet is the Macro factor engine re-surfaced.** Nightly lineage:
   `build_stock_library.py` → `us_standouts.json` buy lane → `build_prophet.py` +
   `engine/prophet_bridge.py` (top-6/run pick, geometry derivation) → R2 `prophet/index.json` →
   Terminal `/api/flow?f=prophet_idx` verbatim. **Options data plays no role in selection,
   conviction, targets, or management confidence.** Options appear only as decoration: a
   display-only suggested contract (1 of 55 live plans), a 5-min marks feed for that contract, and
   a dealer-positioning sentence in the thesis.
2. **The T1/T2 numbers are real model output, not corruption — and the model is volatility-blind.**
   CBOE: entry 285.10, invalidation 224.56 (the hold-tracker's 90-day base-low ×0.97), so
   R = 60.54; T1 = entry+1.5R = 375.91, T2 = entry+3R = 466.72 (+31.9% / +63.7% on a 45-day
   horizon, for a low-vol exchange stock whose own thesis says the $290 call wall is "a place
   price stalls"). Systemic: 33 of 55 active plans have stops ≥15% below entry and T2 ≥ +45%.
3. **The two surfaces diverged because ownership was never decided.** Macro's card is
   deliberately entry-only (buy zone / don't-chase / invalidation — `entry_signal.py` scope).
   The Terminal bridge invented the exit layer (trigger/T1/T2/profit_plan). Neither is "wrong";
   the split was just never made explicit.
4. **The payload starves the Terminal UI.** `index.json` emits no `last_price`/`state`/components
   → the GeometryRail LAST lane, live P&L, the GAINERS sort, and the ConfidencePanel component
   bars are dead on live data. This is why a CBOE card shows entry-era ~285 with no current price.
5. **Book hygiene drifted**: 55 "active" plans vs the 6-pick design, with 5 assets holding
   duplicate concurrent plans (ID = ticker+signal_date; consecutive-day re-qualification
   double-originates).

## The decision

**One engine, two scoped surfaces, options as a bounded verifier.**

- **Origination stays in the Macro factor engine — exclusively.** No second signal engine in the
  Terminal. The house doctrine already settles the options question: a confirmer "can only LOWER
  confidence, never manufacture a buy" (`gex_confirm.py`), and positioning reads are
  "crowding-HAZARD context, NEVER a positive signal" (`theme_options_witness.py`).
- **Ownership split:** Macro board = the entry surface (buy zone, don't-chase, invalidation) and
  links out to the Terminal for management. Terminal desk = the ONLY surface with profit-taking
  plans, option-contract overlays, and management confidence. Do **not** port profit_plan back to
  the Macro card.
- **Options enter as a verifier, not an originator:** wire `gex_confirm.py`'s
  CONFIRM/NEUTRAL/CAUTION verdict into origination as a bounded management-confidence tilt plus a
  structured `target_context` ("call wall $290 sits between entry and T1"). Options-NATIVE alpha
  (sweeps, tide, unusual flow) stays in the Flow desk — a different alpha class and cadence;
  merging it into Prophet origination would recreate the provenance confusion.
- **Provenance becomes data, not copy:** extend `prophet.index/v1` with
  `{producer, engine_version, standouts_as_of, options_involvement}` so both UIs render the truth
  from the payload.

## Staged migration (each stage independently shippable)

| Stage | What | Where | Status |
|---|---|---|---|
| 1 | UI honesty pass: source labeling, wide-geometry guard (rPct>12% or T2 stretch>35% → "geometry, not forecast" caption + de-emphasis), kill dead GAINERS sort when no last_price | Terminal (`components/prophet/*`) | **Shipping in this wave** |
| 2 | Engine target clamp: keep the structural stop (thesis-death exit — do not tighten), cap the projection unit `R_t = min(R_structural, max(2×ATR14, 8%×entry))`; emit `r_unit` + `r_target`; horizon-feasibility test else `targets_under_review`; **new originations only**, `geometry_v: 2` | Macro repo (`engine/prophet_bridge.py`) | Next macro PR |
| 3 | Payload repair: emit `last_price` + `state{geometry, components, change_reason}` — turns on four dead UI features with zero terminal code | Macro repo (`build_prophet.py`) | With stage 2 |
| 4 | Provenance block + gex_confirm tilt + book hygiene (1 plan/asset supersede rule, ~20-plan cap) | Macro repo | After 2-3 |
| 5 | Macro board link-out to Terminal management view | Both | Last |

## Traps for the implementing sessions (from lane risks — all verified)

- **The Macro main checkout is stale (~Jul 9) and does NOT match the live producer** — the live
  payload's `stage_tilt`/"Entry grade" exist only in the newer estate. Branch from origin's
  current state; never patch the stale checkout.
- **Never rewrite geometry on OPEN plans** — the nightly is the sole advancer of the forward
  ledger; clamp new originations only and version the geometry.
- **The desk is paywalled as an options feature while not being options-generated** — the
  provenance labels make this visible; the operator should decide the packaging story
  (entitlement stays product-decision territory, not this wave's).
- **After regenerating `prophet/index.json`, verify the served `asof` on app.mastermind-x.com**,
  not just the R2 bucket (EdgeOne caching traps).
- **Confirm no second writer publishes `prophet/index.json`** (macro DAG + Mac launchd marks loop
  — the known two-copies-last-writer-wins failure mode) before any schema change.
