# Options Prophet system audit and build contract — 2026-08-08

**Status:** implementation contract for Options Superintelligence R6. This audit separates what is live,
what is shadow measurement, and what must be earned before options intelligence can influence Macro Prophet.

## Executive decision

The current Terminal pane is **Macro Prophet with an optional contract overlay**. It is not an
options-originated opportunity engine:

- Macro's stock-factor `us_standouts` buy lane originates the symbol and direction.
- Stock inputs determine admission, rank, confidence, entry, stop, targets and horizon.
- GEX can enrich explanatory text and an EOD option contract can be attached after selection.
- Terminal reads the published plan and marks. It neither scores options evidence nor writes feedback.
- The Prophet forward ledger grades the underlying plan. It does not grade option P&L or incremental
  options contribution.

The correct product is therefore two explicitly separate lanes:

1. **Macro Plans** — the existing stock-originated plan desk and continuity ledger.
2. **Options Alpha** — an options-originated shadow desk, sourced from the existing Flow Leaders,
   options-state and Pick Lab infrastructure, with independent provenance and forward measurement.

Options Alpha must not be folded into a new fused score. Each information, positioning and execution
component remains visible and independently governed. Macro feedback remains zero until paired forward
evidence passes a separate authority-promotion review.

## Verified current system

```text
US stock factors
  -> us_standouts buy lane
  -> stock Prophet rank and geometry
  -> optional GEX prose + approximately 0.60-delta EOD contract
  -> prophet/index.json and stock-only outcome ledger
  -> Terminal Macro Plans pane

Options stores
  -> GEX / skew / IV spread / DOI / VOI / vanna / charm / flow context
  -> display-only options state + stamped research cohorts
  -> Flow Leaders candidate boards + Pick Lab books
  -X-> no Prophet admission, rank, geometry or feedback authority
```

Snapshot evidence on 2026-08-08:

- The checked-in Prophet artifact contained 128 plans; only SOFI and BA had an attached option contract.
  A live R2 probe found 131 displayed plans and the same two contracts.
- Every current Prophet outcome row is an underlying-stock result. `option_result_pct` is unset.
- Options entry state covered 419 symbols and 31 features, but 252-day IV rank covered 0/419 and
  vanna-hedge history covered 14/419.
- The public bar-flow signing gate reported only 0.4108 net-sign recovery. Magnitude was usable as
  activity context; direction was not reliable.
- Flow Leaders had 368 names and 143 flow sessions, but zero Board A/Board B fires. Its two Pick Lab
  books therefore had zero fires and zero graded outcomes.
- IV-spread, skew and options-dislocation histories covered only 41 of the required 120 dates and
  retained zero score weight.

These are not UI shortcomings. They are evidence boundaries the UI must preserve.

## Measurement defect found in the audit

The options-entry validator declared S-VOI and S-SKEW_DECEL `signal` even though the matured outcomes
behind the apparent effects were below the registered minimum of 30 observations in each outcome
bucket. The validator used raw stamped-row counts for readiness, then accepted any outcome CI excluding
zero. It also described a 36-cell Benjamini-Hochberg false-discovery family without calculating
p-values or executing the BH procedure.

Adversarial review found two deeper sampling defects in the first repair attempt. The production ledger
stores the five-session return as `ret` on the `horizon == 5` row, not as a `fwd_ret_5` column, and it
stores one row per fire and matured horizon. Per-fire stamps and 21-session state outcomes are repeated
on those horizon rows. Reading the synthetic-only return name yielded a permanently empty live cell;
treating every horizon row as an independent sample pseudo-replicated fires and could mature a test
early. Tests had reproduced the synthetic schema and therefore missed both defects.

Weight zero prevented present-day ranking leakage, but the artifact was not promotion-safe. The repair
contract is:

- the declared inference population is the board `buy` lane; other board lanes are not silently pooled;
- readiness is calculated on each registered outcome's own non-null, matured samples;
- the validator first reduces the ledger to one canonical `(as_of, lane, ticker)` fire, with five-session
  return and MFE taken only from the five-session horizon and 21-session outcomes taken only from the
  21-session horizon;
- duplicate event/horizon rows or conflicting repeated stamps/outcomes fail loudly instead of selecting
  an arbitrary value;
- each side needs at least 30 fires, 30 distinct session dates and 30 overlapping dates before even a
  descriptive cell matures;
- unavailable and reserved family cells remain in the 36-cell family conservatively;
- IID bootstrap/permutation/BH results are descriptive only. A date-cluster/block estimator, frozen
  sequential-look plan and fresh post-amendment cohort must be registered before promotion;
- incomplete DOI HAC evidence, missing FRONT-CHARM root-class slices, or an unknown TOP_RISK leg remain
  explicit blockers;
- display and accrual continue while `scored=false`, `weight=0`, and all rank/gate/size/Macro authority
  remain frozen.

The repaired production receipt reduces 3,313 horizon rows to 1,287 canonical buy fires across only 23
dates. Consequently zero cells are mature and zero are rejected. This is the correct answer; the earlier
`signal` labels were sampling artifacts, not alpha evidence.

## Options-native engine design

Options Alpha is three engines, not one opaque score.

### Information engine

Purpose: detect information reaching options before the underlying.

Highest-priority features:

- buyer-initiated opening call/put imbalance when licensed identity is available;
- delta-, vega- and leverage-weighted signed flow by expiry and moneyness;
- flow acceleration, persistence and repeat participation after intraday-seasonality normalization;
- matched call-put IV deviations, separate call/put IV changes, constant-delta skew and term-structure
  changes;
- fitted-surface residuals and event-conditioned changes rather than raw IV alone.

Pan and Poteshman found predictive information in **buyer-initiated opening** option volume, which is
not equivalent to public gross volume. Hu documented information in delta-weighted option-induced
stock order imbalance. These results justify the research lane, not automatic production coefficients.

### Positioning engine

Purpose: describe the path and volatility regime created by inventory and expiry mechanics.

- signed dealer gamma where participant/open-close data supports it;
- otherwise explicitly named `dealer_gamma_estimate`, with sign confidence and coverage;
- vanna/charm scenario shocks conditioned on signed inventory, IV change and time decay;
- wall/flip distance normalized by expected move;
- expiry concentration, pin proximity, volatility amplification/damping and stop-width context.

Gross volume and open interest cannot identify dealer inventory. One open contract has both a long and
a short, and large gross activity may net to little dealer exposure. Estimated GEX, vanna and charm are
therefore trajectory/volatility features first, not standalone bullish or bearish alpha.

### Execution engine

Purpose: decide whether an otherwise interesting signal is tradable.

- NBBO width and depth, quote freshness and contract size capacity;
- simple versus complex-order identity and auction state;
- DTE, delta, IV, OI and event-risk filters;
- achievable entry/exit price, fees, price improvement and slippage;
- contract lifecycle, corporate-action deliverable and root-adjustment integrity.

An opportunity is withheld when execution confidence is insufficient. A midpoint-only backtest is not
evidence of an executable option return.

## Data decision

Public OPRA-style quote/trade feeds are useful for NBBO, last sale, activity and estimated signing, but
they do not expose the complete participant, buy/sell and open/close identity needed to reconstruct
dealer inventory.

The institutional-grade upgrade path is:

1. keep public trade signing probabilistic, with a real abstain state and propagated uncertainty;
2. acquire Cboe Open-Close for participant/action/position aggregates and measure venue coverage;
3. use Cboe trade-by-trade execution detail as T+1, C1-only signing ground truth for model training;
4. never imply that the T+1 ground-truth product can power a live same-day signal.

The data license is a product decision, not a modelling afterthought. Without it, the positioning plane
remains estimated.

## Candidate and publication contract

The initial `options.prophet_shadow/v1` artifact is a projection over existing governed outputs. It adds
no estimator and no composite score.

- `opportunities`: only `picks_today` already admitted and ledgered by the existing
  `plab_flow_leader` or `plab_flow_washout` Pick Lab books; a raw Flow Leaders board flag is not enough.
- `watchlist`: stable Board A-then-Board B union, preserving source order and memberships without a
  score or re-ranking.
- `readiness.components`: separate information, positioning and execution readiness plus the
  underlying source/ledger receipts.
- `direction`: always withheld in v1; source-signing measurement is reported separately.
- `forward_ledgers`: the existing `plab_flow_leader` and `plab_flow_washout` prospective books, with
  paired incremental attribution explicitly unavailable.
- `macro_feedback`: `enabled=false`, `weight=0`, `mode=shadow_only`.
- `trajectory`: target, timing and exit window are null and withheld until calibrated.
- `authority`: display-only shadow; cannot rank or suppress Macro Prophet.
- `decision_at` / `available_at`: exact UTC point-in-time fields at projection and fire boundaries.
  The current source has an exact artifact-availability clock but no exact decision clock, so
  `decision_at=null` is an explicit promotion blocker rather than an inferred market close.
- `accrual`: immutable fire/event counts are separate from outcome accrual at 1h, EOD, 1d, 3d,
  5d, 10d and expiry. Only legacy 5d/10d books exist today, and they are marked non-PIT-exact.
- `context_inputs.konseki_market_memory`: an additive `konseki.market_memory/v1` receipt seam,
  hard-fenced to context-only, weight zero, and no rank/gate/size permission.

The public contract fails closed: stale, foreign or undated Flow Leaders inputs cannot project rows;
untrusted, malformed or session-misaligned Pick Lab inputs cannot project fires; missing signing sources
block information readiness. Non-finite research values become JSON `null`, and strict R2 publication
validates the full authority/direction/trajectory contract plus exact object size and SHA-256 metadata.
Terminal independently re-validates the same root and nested authority fences and visibly marks cached
stale evidence.

The pane must say when there are no true fires. It must not relabel a watchlist row as a buy.

## Sparse portfolio product boundary

The target is an abstention-first portfolio of roughly three to four issued calls every few sessions,
not a wide scanner. Wave 0 deliberately stops before claiming that product. It separates:

1. **Research watchlist** — broad source evidence, collapsed in the Terminal and never a signal;
2. **Research fire** — a Pick Lab-admitted event, still not an issued model position;
3. **Issued model portfolio** — a future portfolio-construction decision;
4. **Managed position** — a future executable contract with entry, stop, T1, horizon, minimum-hold
   clock and take-profit management.

The later automatic selector slice must select the portfolio jointly, not take the top four standalone candidates. Its
pre-registered policy must cover regime alignment, cross-position correlation and sleeve caps,
cash/abstention, maximum new picks, cooldown/refire rules and minimum-hold constraints. Every issue,
suppression and management action requires immutable `decision_at` and `available_at` receipts.

Ownership is intentionally non-overlapping: this wave owns `options.prophet_shadow/v1`, the projection,
strict publication, readiness/accrual contracts and Terminal research surface. After the PIT outcome/campaign
evidence stage, the automatic slice should own a separate `options.model_portfolio/v1` artifact plus portfolio-event,
position and outcome ledgers. It
may consume the shadow artifact and Konseki Market Memory as zero-authority context; it must not retrofit
allocation authority into the Wave-0 watchlist.

The immediate next delivery is the human path: an `options.issue_desk/v1` surface may present current Macro
candidates with frozen options/regime/execution receipts for explicit operator approval or rejection.
It may add 0–4 Research Portfolio positions per rolling three sessions, with zero a valid allocation, and
must ledger every proposal, rejection, issue, reviewer, exact timestamp and reason. This operator-curated
desk remains distinct from automatic Options Alpha and has no permission to change Macro rank.

Operator-supplied product-observation evidence further pins the future issued-position transport
states: issued, optional policy-bounded `partial_allowed`, armed, triggered,
managed, then closed/cancelled/invalidated. The
issue receipt must freeze no-chase/add rules, explicit trigger, minimum hold,
underlying stop/T1/T2 partial exits, OCC contract/expiry/strike, premium and
quote/fill clocks. Dynamic validity/progress/pace/overlay values are timestamped
management context, not retroactive origination authority.

Accounting is likewise split: underlying-plan P&L, option-contract P&L and sized
portfolio P&L. The observed product labels its headline aggregate as a sum of
per-trade returns—not portfolio return—and its option-call subset is materially
weaker during a dense cohort. This is qualitative product-behavior evidence, not
retained source data, an independently reproduced result or a model coefficient;
it reinforces abstention, sparse issuance, regime/cohort reporting and paired
incremental option-value ledgers.

This evidence does not create another roadmap. The canonical R6/QuantData sequence
is now frozen in the Options Superintelligence masterplan §6.2.0: PIT candidate/
episode ledger, H+60 plus multi-horizon outcomes, campaign aggregation, sparse
selector/abstention, exact contract optimizer, staged lifecycle, then Today/Pulse.

## Forward-ledger attribution

Two prospective ledgers are required.

### 1. Macro overlay attribution

Freeze the same Macro candidate in paired form:

- `macro_base`: original candidate, score, geometry and outcome;
- `macro_plus_options`: the frozen options features and shadow decision available at that timestamp.

Measure whether options information improved admission/reranking, calibration, path risk and executable
contract selection. Because the underlying candidate is shared, paired block-bootstrap loss and return
differences can estimate incremental contribution without confusing it with the base stock model.

### 2. Options-originated attribution

Record every fire and suppression, not only winners:

- signal and `available_at` timestamps;
- origin board and immutable component receipts;
- model/data/gate versions, coverage and signing uncertainty;
- underlying entry reference, targets, stop and horizons;
- recommended contract recipe and executable marks when present;
- underlying and option returns, MFE, MAE, target/stop first passage and time to event;
- costs, stale-quote flags, corporate actions and abstention reason.

Promotion evidence should include Brier/log loss, calibration by bucket, precision at actual top-K
capacity, net return/drawdown, MFE/MAE, time-to-event and performance by event/liquidity/volatility/
gamma regime. Proper scoring rules matter more than a headline hit rate.

## Trajectory and take-profit timing

An option surface produces a risk-neutral **terminal** distribution. It is neither the physical
probability distribution nor the path price will travel. Exact take-profit times would be false precision.

The eventual trajectory model should publish:

- probability T1 occurs before stop;
- probability T2 occurs before stop;
- probability stop occurs first;
- probability neither occurs within the horizon;
- conditional median and 20-80% time-to-event bands;
- expected MFE/MAE and terminal return quantiles.

Start from an arbitrage-controlled risk-neutral density, calibrate it to physical outcomes, then train a
competing-risks/survival model with signed flow, volatility regime, expiry/pin state and execution quality.
Until those probabilities pass walk-forward and prospective calibration gates, the product says
`withheld_until_calibrated`.

## Backtest protocol

- Point-in-time universes, listings, rates, dividends, earnings and corporate-action deliverables.
- OI is T+1 and may not be used as if known intraday on the same session.
- Every historical surface is independently fit from data available at that timestamp.
- Crossed, stale, zero-bid, invalid-IV and untradeably wide contracts are excluded or costed explicitly.
- Complex orders are linked or abstained from; their legs are not independently signed.
- Anchored walk-forward evaluation, purge/embargo for overlapping horizons and untouched regime holdouts.
- Block/bootstrap uncertainty plus permanent trial registry and multiple-testing correction.
- Underlying-signal quality and recommended-contract P&L are reported separately.

## Authority ladder

1. **Display/accrual:** raw receipts, candidates and gates; zero ranking weight.
2. **Shadow decision:** immutable options-originated decisions and paired Macro counterfactuals.
3. **Bounded context:** only a pre-registered, calibrated feature may contribute a capped shadow delta.
4. **Ranking authority:** explicit promotion after out-of-sample and forward evidence; never by UI wiring.

No stage may silently promote Neural Web or Macro Prophet authority. A new permission requires a separate
adjudication and versioned contract.

## Primary research and data references

- Pan and Poteshman, buyer-initiated opening volume: <https://www.nber.org/papers/w10925>
- Hu, delta-weighted option order imbalance: <https://papers.ssrn.com/sol3/papers.cfm?abstract_id=1970702>
- Cboe Options Lite: <https://www.cboe.com/data/market-data-services/cboe-options-lite/>
- Cboe Open-Close: <https://datashop.cboe.com/cboe-options-open-close-volume-summary>
- Cboe trade-by-trade execution detail: <https://datashop.cboe.com/enhanced-us-options-trade-by-trade-execution-detail>
- Cboe on gross 0DTE volume versus net gamma: <https://www.cboe.com/insights/posts/volatility-insights-evaluating-the-market-impact-of-spx-0-dte-options>
- BIS participant-specific gamma reconstruction: <https://www.bis.org/publ/bisbull95.pdf>
- OIC open-interest mechanics: <https://www.optionseducation.org/referencelibrary/faq/general-information>
- Federal Reserve, risk-neutral versus physical probabilities: <https://www.federalreserve.gov/econres/ifdp/files/ifdp1294.pdf>
- Gneiting and Raftery, proper scoring rules: <https://sites.stat.washington.edu/people/raftery/Research/PDF/Gneiting2007jasa.pdf>
- Bailey and Lopez de Prado, deflated Sharpe ratio: <https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2460551>
