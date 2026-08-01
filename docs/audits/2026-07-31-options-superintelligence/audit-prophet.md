# Prophet — end-to-end pipeline audit (read-only)

Audited 2026-07-31 across three checkouts:

- **Terminal** (Next.js): `/Users/chriswong/Documents/Cluade/charting-app/.claude/worktrees/terminal-chinese-text-crypto-323a48/terminal`
- **Ops worktree** (Macro Dashboard repo worktree, detached at `ce6ede87ce8`, 2026-07-25): `/Users/chriswong/flow-ops-wt`
- **Macro Dashboard main checkout** (detached at `5c90bf15229`, 2026-07-14 — **stale by ~11 days vs the ops worktree**; per memory `neural-web-read-layer`, macro checkouts go stale, so the ops worktree was used as the macro-side source of truth): `/Users/chriswong/Documents/Cluade/Macro Dashboard`

**Naming caution up front:** "Prophet" is three different things in this estate, all fed by the same nightly factor board:

1. **Macro-side "Prophet card" boards** — the flagship `pv_card` standout-stock card shared by the US/China/HK/Canada/Intl dashboard boards (5-verb vocabulary, buy-zone bands).
2. **Terminal "Prophet" desk** — the managed-trade-plan tab inside the `/options` hub (`prophet.trade_plan/v1` envelopes with entry/stop/T1/T2, management confidence, option overlay).
3. **"Prophet governor"** — an aspirational cross-market governing-lobe program (`research/PROPHET_MASTERPLAN_BY_FABLE.md`), largely **not built**; it shares only the name.

This report traces (2) end-to-end, documents (1) as the consuming card system, and flags (3) where relevant.

---

## 1. Complete pipeline diagram (builder → publish → render)

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ STAGE 0 — Factor engine nightly (GitHub Actions daily.yml, self-hosted macstudio,│
│           cron 30 22 * * * UTC = 18:30 ET; "Build B", sole ledger-advancing run) │
│                                                                                  │
│  scripts/build_stock_library.py  (the US stock factor engine)                    │
│    → site/factordata/us_standouts.json                                           │
│      buy[] lane rows: conviction{score,band,drivers,cautions,trust_tier},        │
│      entry_signal{status,act_level,spot,chase_above,atr_pct,buy_zone,above200,   │
│      weekly_bull,coiled}, hold{invalidation,anchor}, lane, spark_svg (with       │
│      builder-drawn buy-zone band), gate_go (macro-caution flag)                  │
└──────────────────────────┬───────────────────────────────────────────────────────┘
                           │ (same nightly run, AFTER build_site)
┌──────────────────────────▼───────────────────────────────────────────────────────┐
│ STAGE 1 — Prophet nightly builder                                                │
│  scripts/build_prophet.py --publish   (flow-ops-wt; continue-on-error)           │
│                                                                                  │
│  a. engine/prophet_bridge.originate_plans()                                      │
│     PICK RULE: us_standouts buy lane; band != "low"; gate_go=True → act_level≥2; │
│     gate_go=False → act_level≥2 OR score≥60; dir=="up" only (BULL-only universe);│
│     sort by conviction score desc then act_level desc; TAKE TOP 6.               │
│     GEOMETRY: entry = spot; trigger = chase_above||entry;                        │
│       invalidation = hold.invalidation, else max-protective of                   │
│       (20d swing-low close, entry − 2×ATR14); R = |entry−invalidation|;          │
│       T1 = entry + 1.5R; T2 = entry + 3.0R; horizon 45d (×1.25 PSQ stage-tilt    │
│       leash when Stage-2 ∩ EC-positive, bear-gated, shadow-auto-demote);         │
│       min_hold 10d. ID = TICKER-BULL-YYYYMMDD (dupe-suppressed forever).         │
│     OPTION OVERLAY (display-only): from local ThetaData EOD store —              │
│       right=C; expiry = first monthly (3rd-Fri) ≥ signal+horizon+15d;            │
│       strike = nearest |delta−0.60| from greeks, else first OTM from EOD;        │
│       premium = EOD (bid+ask)/2; + structure receipt (spread %, OI w/ vintage,   │
│       IV-rank vs own history → liquid/workable/wide/thin, EN+ZH pre-translated). │
│     CONTENT (deterministic templates, NO LLM): thesis EN/ZH woven from drivers/  │
│       cautions/tech flags + ONE dealer-positioning sentence from GEX walls       │
│       (lib.options_context.load_gex_walls — thesis STRING only, never a signal   │
│       input); what_to_do_now[] and profit_plan[] keyed to phase.                 │
│                                                                                  │
│  b. engine/prophet_management.compute_management_state()  (per active plan)      │
│     Port of reverse-engineered "MomoEdge V2" browser confidence model            │
│     (oracle_spec.md §4), nightly-cadence adaptation. Inputs: plan + daily-close  │
│     history (PIT-filtered ≤ asof) + prev_state (EMA/MFE/MAE accumulator).        │
│     7-phase lifecycle: pre_trigger → triggered_pre_t1 → at_t1 → between_t1_t2 →  │
│     at_t2 → overtime → invalidated (internal superset incl. post_t1_failed_hold).│
│     Confidence = phase-weighted blend of 7 components (base, trigger, validity,  │
│     objective/progress, pace, retention, overlay) − path penalty; phase bounds;  │
│     EMA smoothing; HARD CEILING 92. recommended_action ∈ {Wait,Enter,Hold,Trim,  │
│     Trail-stop,Exit,Invalidated}. NOTE: macro_stance + futures_chg params exist  │
│     but build_prophet NEVER passes them → overlay degenerates to                 │
│     0.5 + trigger-confirm bonus ± 1-day close-to-close momentum pulse.           │
│                                                                                  │
│  c. advance_ledger() — nightly is the SOLE advancer. First-close-trigger outcome │
│     per plan: INVALIDATED | T2_HIT | T1_HIT | EXPIRED (close-only scan; may miss │
│     intraday touches — documented). option_result_pct ALWAYS null.               │
│     → data/prophet/ledger.jsonl (prophet.ledger/v1)                              │
│                                                                                  │
│  d. write_showcase() — landing teaser: DELAYED (~2wk) winning calls only, from   │
│     the fully-matured 10-session board grades (grade_us_board ledger), min 6     │
│     winners else keep previous. → site/prophet/showcase.json                     │
│                                                                                  │
│  OUTPUTS: site/prophet/index.json (prophet.index/v1, flat plans[]) +             │
│           plans/<ID>.json + states/<ID>.json + showcase.json;                    │
│  PUBLISH: R2 s3 upload → key "prophet/index.json" (bucket mastermindx).          │
│  THEN: scripts/build_prophet_stage_shadow.py — forward Stage×Prophet shadow      │
│  (tags entries, grades matured, summary.json; NEVER gates picks).                │
└──────────────────────────┬───────────────────────────────────────────────────────┘
                           │
┌──────────────────────────▼───────────────────────────────────────────────────────┐
│ STAGE 2 — Live option marks (intraday side-channel, Mac launchd)                 │
│  ops/launchd/com.mastermind.prophetmarks.plist → run_prophet_marks_loop.sh       │
│  fires 09:25 ET weekdays, loops scripts/build_prophet_marks.py --publish every   │
│  5 min until 16:05 ET (script self-guards to NYSE RTH 09:30–16:00).              │
│  Reads site/prophet/index.json (local → R2 fallback), derives OCC symbol per     │
│  active plan's option_contract, pulls PER-CONTRACT ThetaData v3 trade_quote      │
│  (wildcard-exp rejected current-day — #1774), publishes                          │
│  prophet.live_marks/v1 {marks: {OCC → {bid,ask,mid,last,ts_utc}}}                │
│  → R2 key "live_flow/prophet_marks.json".                                        │
└──────────────────────────┬───────────────────────────────────────────────────────┘
                           │
┌──────────────────────────▼───────────────────────────────────────────────────────┐
│ STAGE 3 — Render                                                                 │
│                                                                                  │
│  TERMINAL (app.mastermind-x.com/options — the ONLY Terminal surface):            │
│    OptionsWorkspace (?tab=prophet) → OptionsHubView PROPHET tab → ProphetView    │
│    fetch: flowGet("prophet_idx") → GET /api/flow?f=prophet_idx → server-side     │
│    lib/flowSource.ts: FLOW_FIXTURE=1 → public/data/prophet_fixture.json;         │
│    else FLOW_BACKEND(127.0.0.1:8000)/api/hub/prophet; else R2 CDN               │
│    https://pub-f7ffb4441c5f4ad983ca56ec7c651c61.r2.dev/prophet/index.json.       │
│    prophet_marks polled every 30 s (R2 live_flow/prophet_marks.json), 20-min     │
│    freshness window → LIVE premium on OptionCard, else EOD mark.                 │
│                                                                                  │
│  MACRO LANDING (mastermind-x.com): templates/index.html #f-prophet — baked       │
│    #ph-data JSON island, live-overridden from prophet/showcase.json (delayed     │
│    winners belt; the live board stays behind registration).                      │
│                                                                                  │
│  MACRO BOARDS (us_stocks/china/hk/canada/intl.html): templates/                  │
│    _prophet_card.html.j2 pv_card — renders the STANDOUT rows directly (not the   │
│    trade-plan envelopes); verb/stage/zone derivation lives in each board         │
│    template; spark buy-zone band drawn by each *_library builder's _spark_svg.   │
└──────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Terminal repo — every Prophet artifact

### 2.1 Components (`terminal/components/prophet/`)

| File | Lines | Role |
|---|---|---|
| `ProphetView.tsx` | 1081 | 3-column desk (alert stream / analysis / confidence). Fetches `prophet_idx` once + `prophet_marks` every 30 s. OCC-symbol derivation client-side; 20-min live-mark window; sorts NEW/BEST/GAINERS (GAINERS hidden because producer omits `last_price`); PERF sub-tab is a placeholder ("outcome ledger accruing"). Extensive honesty doctrine in the header comment. |
| `SignalCard.tsx` | 420 | One stream row + the canonical `PlanSummary` payload type (accepts both the legacy nested `state{}` shape and the current flat shape: `management_confidence`/`phase`/`recommended_action` hoisted top-level). `phaseTone()` shared color law. T1-progress and P&L-vs-plan bars render only if `last_price` present (it never is in prod). |
| `ConfidencePanel.tsx` | 327 | Arc gauge (ceiling 92) + 5 component bars (validity/progress/pace/retention/overlay). Prod flat payload publishes **no components** → renders the honest "Component scores are not published in this payload" state. |
| `GeometryRail.tsx` | 339 | STOP/ENTRY/T1/T2 (+LAST when present) price rail; wide-geometry warning; "no intraday price in this payload" note. |
| `OptionCard.tsx` | 437 | The suggested contract ("Oracle Option"): type/strike/expiry/entry-premium/EOD-mark, structure receipt line, LIVE overlay from marks; tagged "Overlay — not signal input". `LiveMark = {bid,ask,mid,last,ts_utc}`. |
| `prophetStrings.ts` | 259 | Bilingual EN/ZH lexicon. Encodes the honesty doctrine as copy: "Signal desk · nightly EOD", "Source: Mastermind factor engine — nightly EOD standouts. Options shown as context overlays, not signal input", "display-only — forward ledger accruing", ceiling-92 note, 7 phase labels, 7 recommended-action labels. |

### 2.2 Data plumbing

- `lib/flowSource.ts` — f-params `prophet_idx` and `prophet_marks`; backend paths `/api/hub/prophet`, `/api/hub/prophet_marks`; R2 keys `prophet/index.json`, `live_flow/prophet_marks.json`; dev fixtures `public/data/prophet_fixture.json` / `prophet_marks_fixture.json`; honest empty fallbacks (`prophet.index/v1` with `plans: []`).
- `lib/upstreams.ts` — `FLOW_BACKEND = FLOW_API_BASE || http://127.0.0.1:8000` (the VPS Python hub), `R2_BASE = https://pub-f7ffb4441c5f4ad983ca56ec7c651c61.r2.dev`. Resolve order: fixture → backend (3 s timeout) → R2.
- `lib/eodContext.ts` (~line 636) — `StructureReceipt` renderer for `option_contract.structure` (band/spread/OI-vintage/IV-rank; macro's pre-translated EN/ZH strings rendered verbatim; `iv_rank_young` disclosed).
- `lib/i18n.tsx` — `tabProphet`/`wtProphet`: `["Prophet", "先知"]` (workspace chrome; the desk's own lexicon uses 预言台).
- `components/OptionsHubView.tsx` — dynamic-imports ProphetView; tab-activation prefetch of `prophet_idx` (~136 KB) + `manifest`.
- `components/workspaces/OptionsWorkspace.tsx` — `prophet` is the last tab of the `/options` workspace; in `RESEARCH_ALLOWED`.
- `components/flowdesk/FlowGauge.tsx` — only borrows the "Prophet accent" color token; no data linkage.

### 2.3 Where Prophet renders — and where it does NOT

Renders **only** in the `/options` workspace Prophet tab (plus, indirectly, the marketing landing's delayed-winners showcase on the macro origin). It does **not** appear on charts, ticker pages, the stock screener, watchlists, or mobile-specific surfaces; per the native-apps rules the entire Options suite (Prophet included) is excluded from installable app alphas. `/options` sits behind the paywall/regwall (live since 2026-07-27, PR #195).

### 2.4 Cadence as experienced by the user

- Plan index: nightly EOD (`cadence: "nightly-EOD"`, `asof` = board date). Fetched once per tab activation; no index polling.
- Option marks: R2 file refreshed every 5 min during RTH; browser polls every 30 s; a mark older than 20 min falls back to EOD display.
- Masthead: Active plans count, In-focus asset, Model close date, "Option marks: Live" dot when any mark is fresh.

---

## 3. Ops worktree — the builders (mechanism, thresholds, schemas)

### 3.1 `scripts/build_prophet.py` (976 lines) — nightly orchestrator
Reads `site/factordata/us_standouts.json`; originates via `engine/prophet_bridge.py`; manages via `engine/prophet_management.py`; advances `data/prophet/ledger.jsonl`; writes `site/prophet/{index.json,plans/,states/,showcase.json}`; `--publish` uploads index to R2 `prophet/index.json`. Index whitelist per plan (flat shape): `id, asset, direction, entry, invalidation, targets, trigger, option_contract, _r_unit, _conviction_score, _signal_date, phase, management_confidence, recommended_action, what_to_do_now(+zh via plan), profit_plan, thesis, thesis_zh, horizon_days, stage_tilt` — deliberately **no** `last_price`, **no** `components`, **no** `min_hold_days` at index level. Deterministic sort: conviction desc, id asc. `authority_tier: "display"` and a "validated"-forbidden note ride the payload (CI-enforced by `check_validated_claims.py`).

### 3.2 `engine/prophet_bridge.py` (1473 lines) — origination
Pick rule / geometry / option resolution / templates exactly as in the diagram. Notables:
- Constants: `N_CANDIDATES=6`, `T1_MULTIPLIER=1.5`, `T2_MULTIPLIER=3.0`, `ATR_MULTIPLIER=2.0`, `TARGET_DELTA=0.60`, `HORIZON_DAYS_DEFAULT=45`, `MIN_HOLD_DAYS_DEFAULT=10`, `STAGE_TILT_LEASH=1.25`.
- BULL-only: `dir != "up"` rows are skipped; BEAR branches exist in geometry/templates but are dead code today.
- PSQ-TILT W1: Stage-2 ∩ earnings-call-sentiment-positive picks get horizon 45→56 d (hold-leash only; binding authority boundary: never selection/veto/rank). Bear-gate reads `data/regime/latest.json` (SPY-below-200dma / risk-off ⇒ leash off; fail-safe bear=True). Auto-demote reads the forward shadow's `summary.json` (needs ≥30 matured 126-d cohort entries AND diff ≤ 0).
- Dealer positioning (OEU M-PRO) is loaded once per run **after** selection and reaches thesis strings only.
- `_sanitize_thesis_text` replaces "validated"/"已验证" with "risk gate"/"风险管控".

### 3.3 `engine/prophet_management.py` (1210 lines) — confidence engine
Faithful PIT-safe port of a reverse-engineered competitor browser model ("MomoEdge V2", `oracle_spec.md` §4 — see `research/momoedge/`). Phase-weight table (7 rows, weights sum to 1.0; invalidated = validity 1.0). Components: base (conviction/100), trigger-zone score, validity (stop distance in R), objective (progress to T1/T2), pace (smoothstep of progress vs τ = days/horizon), retention (give-back vs MFE), overlay (see below), minus path-quality penalty (MAE-based). Phase-dependent floor/ceiling then EMA smoothing across nightly runs via `prev_state`; ceiling 92 applied twice. Output `prophet.management_state/v1` includes `components{}` and a rich `geometry{}` block (dist_to_stop_r, p1/p2/p3, mfe_r/mae_r, horizon_pct_used) — **most of which the index whitelist then drops**, so the Terminal never sees it. **Key wiring gap:** `build_prophet` calls it without `macro_stance`/`futures_chg`, so the "market overlay" component is only 0.5 base + 0.06 trigger-confirmed ± 0.03 one-day momentum pulse.

### 3.4 `scripts/build_prophet_marks.py` (516 lines) — live marks
As diagrammed. Schema `prophet.live_marks/v1`; per-contract error → skip + warn; outside-RTH → clean exit; global error → exit 0 (no crash-loop). Timestamps normalized ET→UTC. Launchd: `com.mastermind.prophetmarks` + `run_prophet_marks_loop.sh` (09:25 ET fire, 5-min loop to 16:05 ET).

### 3.5 Research/shadow lane (never gates)
- `scripts/build_prophet_stage_shadow.py` (nightly, `COLLECT_LANE=nightly` sole grade-advancer) — tags every real Prophet entry with PIT stage-at-entry + last-EC, grades matured entries, writes `data/prophet_stage_shadow/summary.json`; first 126-d cohort matures ~Dec 2026.
- `scripts/run_prophet_stage_fusion.py` / `run_prophet_stage_quality.py` — pre-registered backtests (PSF/PSQ) behind the stage-tilt; the win-rate-gate construction was explicitly KILLED; nulls printed, no "validated".

### 3.6 Outcome ledger schema (`prophet.ledger/v1`, `data/prophet/ledger.jsonl`)
`{schema, id, asset, direction, signal_date, close_date, outcome ∈ T1_HIT|T2_HIT|INVALIDATED|EXPIRED|CLOSED_EARLY, stock_result_pct, option_result_pct (always null — premium marks not graded), days_held, plan_adherence, asof}`. First-close-trigger semantics: a plan that closes ≥T1 is recorded T1_HIT even if it later reaches T2 (T2_HIT only on a gap that skips T1) — documented, but consumers must not read T2_HIT frequency as "ever reached T2".

---

## 4. Macro Dashboard — the Prophet card system (boards + landing)

- `templates/_prophet_card.html.j2` — "PROPHET CARD v1", the flagship standout card shared by all five boards (operator-ratified 2026-07-21). Contract: chart-first spark hero recolored to the verb hue; **5-verb vocabulary `buy / near / wait / hold / avoid`** (EN/ZH pairs 买入/临近/等待/持有/回避; only BUY renders solid); ONE "Edge" score slot (em-dash when suppressed); **4-stage lifecycle tracker Bottoming → Turning → Ready → Trend**; zone footer kinds `active / muted / readd / confirm / note / none`; optional ⚡ Triggered/Imminent chip (Top-setups presentation merge 2026-07-24); ⚠N caution popover; one hue per card via `--pv-*` tokens (never `--up/--down`, which flip in zh).
- **Buy-zone band**: drawn INTO the spark SVG by each of the five `*_library` builders' `_spark_svg` (zone_lo/zone_hi/zone_state); the card CSS recolor rules are written so the band's dashed edges + low-opacity rect survive (band contract in the template comment).
- **Verb derivation lives in each board template**, mapping `entry_signal.status`: `buy_now|partial→buy`, `buy_soon|await_confluence→near`, `hold|topping→hold`, `exit|avoid→avoid`, else `wait` — mirrored byte-for-byte by `build_prophet.derive_showcase_card()` for the landing.
- **Landing** (`templates/index.html` #f-prophet): baked `#ph-data` JSON island + live override from `prophet/showcase.json` — `prophet.showcase/v2 kind=delayed_winners`: winners only (ret>0) from the freshest fully-matured 10-session board, ≥6 winners or keep previous, each stamped `since_pct`; operator order 2026-07-24: the live board is paid product, the free teaser is ~2-weeks-delayed winners labelled as exactly that.
- Tests: `tests/test_prophet_bridge.py`, `tests/test_prophet_management.py`.
- Research corpus (ops worktree `research/`): `PROPHET_MASTERPLAN_BY_FABLE.md` (governor concept), `PROPHET_LIVE_P1_DESIGN_SPEC.md`, `PROPHET_LIVE_INTRADAY_SIGNALS_MASTERPLAN_BY_FABLE.md` (intraday origination — unbuilt), `PROPHET_TRADE_MEMORY_MASTERPLAN_2026-07-28.md`, `PROPHET_TOPSETUPS_PRESENTATION_MERGE_MASTERPLAN.md`, `PROPHET_STAGE_{FUSION,QUALITY}_PREREG.md`, `PROPHET_STAGE_TILT_W1_DESIGN.md`, `PROPHET_LEDGER_SCHEMA.md`, `momoedge/` (the reverse-engineered V2 spec).

---

## 5. Honest assessment of signal sophistication

**What it actually is:** Prophet originates nothing. It is a *packaging and lifecycle-management layer* over the nightly stock-factor board:

1. **Selection = a filter + sort on someone else's score.** Top-6 of the us_standouts buy lane by conviction score with an act_level gate. All alpha (or lack of it) is inherited from `build_stock_library.py`'s composite; Prophet adds zero independent selection signal. BULL-only.
2. **Geometry = mechanical R-multiples.** Stop = swing-low/2×ATR heuristic; T1/T2 = fixed 1.5R/3.0R projections. No statistical target-setting, no volatility-regime conditioning, no support/resistance beyond a 20-day close extreme. The Terminal even has a "Wide geometry — treat T1/T2 as geometry, not forecasts" warning for the failure mode this produces.
3. **Management confidence = a hand-tuned weighted checklist**, ported from a reverse-engineered competitor UI model, driven entirely by daily closes vs the plan's own levels. It is a *state descriptor* (where price is relative to stop/targets/clock), not a predictor. Its one exogenous component (overlay) is effectively disabled because the caller never passes `macro_stance`/`futures_chg` — a real, fixable wiring gap.
4. **Content = deterministic string templates** (no LLM at runtime), which is honest but means "What To Do Now"/thesis carry no information beyond the fields already shown.
5. **Option overlay = a 0.60-delta monthly heuristic** priced at EOD mid, decorated with a good liquidity/IV receipt — but the contract choice is never optimized (no spread-cost vs delta tradeoff, no IV-rank input to choice) and **option outcomes are never graded** (`option_result_pct` always null).
6. **Accountability is embryonic but well-engineered.** PIT-safety, idempotent ledger, first-trigger close semantics, forward stage-shadow with pre-registered demotion criteria, delayed-winners-only marketing. The honesty engineering (ceiling 92, display-tier framing, "validated" ban, absence-honest UI states) is considerably more sophisticated than the signal math itself. The PERF tab is still a placeholder and the ledger is not yet surfaced anywhere user-facing.

**Net:** as a *product surface* it is polished and unusually honest; as a *signal engine* it is a thin, deterministic derivative of the factor board with textbook trade-management arithmetic on top.

## 6. Concrete data inputs the current Prophet does NOT use

Confirmed by reading `prophet_bridge.py`, `prophet_management.py`, `build_prophet.py` end-to-end — none of these touch selection, geometry, confidence, or actions:

1. **GEX / dealer positioning** — exists in the estate (`options_structure/gex_state/`, gex walls); reaches ONE display-only thesis sentence, never a signal input. **VEX, vanna, charm** — nowhere at all.
2. **PRISM clusters / options-structure matrix** (`options_structure/matrix/*`, the Terminal PRISM tab data) — published beside Prophet in the same R2 bucket, unused.
3. **Intraday options flow** (live_flow feed, tide, unusual-names, heat_seeker confidence, chain heat, hot contracts) — unused. Marks are display quotes only. Interestingly `build_options_flow_attention.py` consumes us_standouts (flow → attention direction), never the reverse.
4. **Golden Oracle desk / GC-v2 signals** — not read by any prophet module (whatever GC-derived features the upstream conviction score encodes are inherited blindly; Prophet cannot see cohort quality tiers, no-cut scores, or sell-side cascade state).
5. **Technicals beyond ATR14 + 20-day close extremes** — management sees only daily closes vs plan levels; no MA/MACD/RSI/volume/Donchian/relative-strength input to phase or confidence (flags like above200/weekly_bull/coiled appear in thesis prose only, frozen at origination).
6. **Macro regime / futures overlay** — the engine supports `macro_stance` + `futures_chg` (±0.08/−0.20 stance, futures adverse/tailwind terms) but the nightly caller passes neither; regime only appears as the stage-tilt bear-gate on horizon length.
7. **Intraday prices** — outcome ledger and phase detection scan closes only; intraday T1/stop touches are missed (documented display-tier limitation). The Terminal has full intraday stores that could close this.
8. **IV surface / vol regime / expected moves / darkpool context** (`vol/regime.json`, `options_hub/moves/*`, `darkpool/eod.json`) — mirrored for the EOD context belt, unused by Prophet.
9. **Earnings calendar** — upstream caution chips only; management will happily say "Hold" through a report date.
10. **`last_price`** — not published in the index, so the Terminal's GAINERS sort, T1-progress bars, and P&L-vs-plan are all dead UI in prod (and the desk honestly says so).
11. **Component scores** — computed nightly in states/ but stripped from the flat index, so the ConfidencePanel's five bars render their absent-state; a one-line whitelist addition would light them up.

## 7. Smallest-lever observations (not recommendations, just facts found)

- Passing `macro_stance`/`futures_chg` into `compute_management_state` (both already parameters) would activate the dormant overlay component.
- Whitelisting `components` and `last_price` (nightly close is already loaded as `ph_pit["close"].iloc[-1]`) into `active_entries` would activate three already-built Terminal UI features (component bars, GAINERS sort, T1-progress/P&L).
- The Terminal renders `state?.geometry` and `state?.change_reason` from the nested shape — also currently stripped by the flat index.
