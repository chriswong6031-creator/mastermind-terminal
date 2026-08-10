# R6 execution appendix — Issue Desk first, model portfolio after evidence

**Status:** R6.2-A operator-reviewed Issue Desk implemented; automatic portfolio is deferred
**Current contract:** private `options.issue_desk/v1`
**Later contract:** `options.model_portfolio/v1`, after PIT outcome and campaign evidence
**Clean-room boundary:** product behavior and schema requirements only, based on public materials and lawful operator-supplied product observations. Do not retain or copy a competitor's private rules, datasets, coefficients, text, or implementation.

This is an implementation appendix, not a second roadmap. The canonical order and ownership live in
`OPTIONS_SUPERINTELLIGENCE_MASTERPLAN_2026-07-31.md` §R6/§6.2.0: PIT candidate/episode ledger → H+60 and
multi-horizon outcomes → campaign aggregation → sparse selector/abstention → exact contract optimizer → staged
lifecycle → Today/Pulse.

## Product boundary

The sequence is:

```text
Research Watchlist
  -> independently governed research fires
  -> portfolio construction + abstention decision
  -> sparse Issued Model Portfolio
  -> executable managed positions
  -> separate event, management, and outcome ledgers
```

A watch row is not a signal. A research fire is not an issued position. The target is roughly three to four issued calls every few sessions when the environment permits, with cash as a valid allocation. This is a portfolio decision, not `top_k(candidates, 4)`.

## R6.2 speed path — operator-reviewed Issue Desk

Do not make user value wait for automatic-model promotion. Ship a distinct,
operator-reviewed research workflow first:

```text
current Macro candidates
  + options / regime / execution receipts
  -> explicit human approve or reject
  -> sparse Research Portfolio
```

The Issue Desk may add **0–4 new research positions per rolling three sessions**;
zero is a correct decision. It must evaluate the proposals as one allocation,
not approve four independent top scores. Every proposal, rejection, approval and
issued research plan records reviewer identity, exact `decision_at`, exact
`available_at`, frozen input receipts, reason codes and the resulting portfolio
state. It cannot alter Macro candidate rank, cannot call itself automatic Options
Alpha, and cannot bypass executable-contract or risk disclosure.

This speed path owns a separate private `options.issue_desk/v1` read model and
append-only proposal/decision ledgers. Human approval is explicit operator
research authority, not evidence that the automatic options model is calibrated.
It remains `brokerage_trade=false` with rank/gate/size/trade/automatic authority
all false.

The implemented boundary is authenticated and request-driven:

- Macro: `GET /api/options/issue-desk` and `POST /api/options/issue-desk/reviews`;
- Terminal: operator-only same-origin proxies at the same paths;
- durable state: 0600 JSONL proposal and decision ledgers under a 0700 Macro API
  state directory, protected by a global lock and fsync;
- publication: no public R2, no public `site/` document, and no nightly GitHub
  workflow carrying private proposal, decision, contract, risk or position rows;
- write law: strict JSON, server-stamped reviewer/clocks/session/capacity,
  immutable revisions, idempotent review keys, and no optimistic UI promotion.

## Wave-0 ownership — preserve these contracts

Macro Dashboard Wave 0 owns:

- `scripts/build_options_prophet.py` and public schema `options.prophet_shadow/v1`;
- `site/options_prophet/index.json` and R2 key `options_prophet/index.json`;
- `scripts/mirror_flow_idx.py --options-prophet --strict`;
- the existing Flow Leaders/Pick Lab projection, readiness, authority, PIT, accrual, Konseki-context and portfolio-boundary receipts;
- the repaired `scripts/validate_options_entry.py` descriptive gate.

Terminal Wave 0 owns:

- `terminal/components/prophet/ProphetLanesView.tsx`;
- `terminal/components/prophet/OptionsAlphaView.tsx`;
- `terminal/components/prophet/optionsAlphaTypes.ts`;
- the `options_prophet_idx` transport and responsive/contract tests;
- the responsive `GeometryRail` collision solver.

The Issue Desk slice may consume these outputs. It must not add automatic ranking authority to the Wave-0 research watchlist.

## Files owned by the implemented Issue Desk slice

Macro owns the private state machine and API:

- `research/OPTIONS_ISSUE_DESK_R62_PREREG.md`;
- `engine/options_issue_desk.py`;
- `app/options_issue_desk.py` and the guarded mount in `app/main.py`;
- `scripts/build_options_issue_desk.py`;
- `contracts/options/options.issue_desk*.schema.json` and
  `contracts/options/options.issue_receipt.v1.schema.json`;
- private runtime `proposals.jsonl` and `decisions.jsonl` beneath
  `OPTIONS_ISSUE_DESK_STATE_DIR` or `$MACRO_API_STATE_DIR/options_issue_desk`;
- `tests/test_options_issue_desk.py` and `tests/test_options_issue_desk_api.py`.

Terminal owns the private operator surface:

- `terminal/components/prophet/OptionsIssueDeskView.tsx` and
  `optionsIssueDeskTypes.ts`;
- `terminal/app/api/options/issue-desk/{route.ts,reviews/route.ts}`;
- the Issue Desk additions to `ProphetLanesView.tsx`, operator entitlement and
  dedicated Macro upstream;
- unit, route and 1440/820/390 responsive tests.

The earlier proposed public `site/options_issue_desk/index.json` and
`data/options_issue_desk/reviews.parquet` are superseded. The desk contains
owner-private review, contract and risk data and must not ride the public static
artifact plane.

After PIT outcome/campaign evidence accrues, the automatic selector slice should
own new, separate files:

- `research/options_estate/OPTIONS_MODEL_PORTFOLIO_PREREG.md`;
- `scripts/build_options_model_portfolio.py`;
- `data/options_model_portfolio/decisions.parquet`;
- `data/options_model_portfolio/position_events.parquet`;
- `data/options_model_portfolio/outcomes.parquet`;
- `site/options_model_portfolio/index.json`;
- `tests/test_build_options_model_portfolio.py`.

Only after the producer contract and fixture are frozen should Terminal add a new `options_model_portfolio_idx` transport and an issued/managed-position surface. Avoid editing the Wave-0 research parser to reinterpret a fire as a position.

The Issue Desk uses its own authenticated API/read model and review UI. Keep that
route and its human actions separate from both `options_prophet_idx` and the
eventual automatic portfolio route.

## Issued-position lifecycle contract

Operator-supplied product-observation evidence adds a crucial state boundary:

```text
ISSUED
  -> PARTIAL_ALLOWED (optional; only when the frozen issue policy permits a starter)
  -> ARMED
  -> TRIGGERED
  -> MANAGED
  -> CLOSED | CANCELLED | INVALIDATED
```

The current v1 appends only the initial `ISSUED` event (or terminal rejection)
and exposes no post-issue mutation endpoint. The remaining states are the frozen
next-version boundary, not manufactured current functionality. When that version
lands, an issued plan may enter `PARTIAL_ALLOWED` before its underlying trigger, but
only with frozen starter size, premium/underlying limits, no-chase ceiling,
add-on rules and invalidation conditions. `ARMED` is not an open fully
sized trade. Every transition is an append-only management event with exact
`decision_at`, `available_at`, actor, reason and before/after allocation.

Operator-supplied transport conformance fixture, not retained source data or a recommendation: an LMT issue must be able
to retain underlying reference 582.74, separate 595 trigger, 525 stop, 700 T1,
a 600-strike September 18 call and a 30-day minimum hold across its issued,
partial-allowed, armed, triggered and managed events.

The issued receipt must keep two linked but separate plans:

- **Underlying plan:** reference/entry, explicit trigger and condition, stop,
  T1/T2, partial-exit fractions, minimum-hold clock and horizon.
- **Option execution:** OCC symbol, right, strike, expiry, quoted premium and
  quote time, actual fills, quantity, spread/slippage/capacity, option stop or
  premium-risk rule, and contract-specific exit marks.

Dynamic confidence components such as validity, progress, pace and overlay may
be timestamped management receipts. They cannot be backfilled into an
origination score, silently change Macro rank, or substitute for executable
marks. No-chase, add, trim, roll, trail, partial-exit and close instructions are
versioned events—not mutable prose on the original issue.

## Performance-accounting law

Underlying-plan return, option-contract return and sized portfolio return are
three different measures. Store and report them separately. A sum of per-trade
percentage returns is labelled `sum_of_trade_returns`; it is never presented as
portfolio return. Portfolio performance requires allocations, cash, overlaps,
actual fills/costs and a time-indexed equity curve.

The observed product reinforces this law by labelling its headline aggregate as
the sum of individual trade returns, while its option-call subset is materially
weaker during a dense cohort. This is qualitative product-behavior evidence, not
retained source data, copied model rules or independently validated coefficients.
It strengthens the requirement for sparse issuance, abstention, cohort/regime
slices and separate option-value attribution.

## Portfolio decision policy to pre-register

The deterministic policy must specify:

- regime eligibility and which regimes force cash/abstention;
- correlation clusters and per-cluster/per-sleeve caps;
- total gross allocation, cash floor, contract risk budget and loss-at-stop budget;
- maximum new positions per decision window and total concurrent positions;
- ticker/refire cooldown and duplicate-underlying rules;
- event risk and earnings exclusions;
- minimum-hold clock, plus the narrow invalidation exceptions allowed before it expires;
- executable liquidity, NBBO width/depth, quote freshness and capacity rules;
- portfolio-level selection objective and deterministic tie-breaking;
- every candidate accepted, suppressed, resized or deferred, with a reason code.

Konseki Market Memory may be consumed only through `konseki.market_memory/v1` as `context_only`, weight `0`, with no rank/gate/size permission in the first shadow cohort.

## Later automatic `options.model_portfolio/v1` boundary

Every issued or suppressed decision must include exact UTC `decision_at` and `available_at`; a date-only value is invalid. A minimum viable document contains:

```text
schema, policy_version, as_of, built_at, decision_at, available_at
authority, mode, regime_receipt, context_receipts
portfolio: cash_weight, sleeves, correlation_clusters, risk_budget
issued[]: decision_id, symbol, origin_fire_id, allocation, decision_at, available_at
          lifecycle_state{issued|partial_allowed|armed|triggered|managed|closed|cancelled|invalidated}
          issued_at, accumulation_policy, starter_size
          no_chase_limit, add_rules, explicit trigger + trigger condition
          underlying entry/reference, stop, T1/T2 + partial-exit fractions
          horizon, min_hold_until, take_profit/management policy
          OCC symbol, expiry, strike, right, premium_at_issue, quote_at, fills
suppressed[]: fire_id, reason_codes, decision_at, available_at
positions[]: position_id, state, immutable issue receipt, underlying_pnl
             option_pnl, latest management receipt, confidence components
readiness, provenance, authority fences
```

The first implementation remains shadow/display-only. No field may influence Macro Prophet until a separate paired `macro_base` versus `macro_plus_options` adjudication earns that permission.

## Ledger separation

Use three append-only units:

1. **Decision/event ledger** — one row for every issue, abstention and suppression.
2. **Position-event ledger** — entry, minimum-hold expiry, stop/target touch, adjustment and exit events.
3. **Outcome ledger** — one row per decision or position × 1h/EOD/1d/3d/5d/10d/expiry horizon.

Do not count horizon rows as additional decisions. Forward evaluation must remain point-in-time, costed at executable quotes, walk-forward, overlap-aware and separate from the research-fire books.
Do not add per-trade percentage returns and call the result portfolio return.
