# Market Structure Core — repo integration map (2026-08-01)

Read-only audit for planning the dealer-positioning / gamma-structure analytics layer.
Repos:

- **Terminal** (Next.js): `charting-app/…/terminal` (worktree `options-analytics-platform-rebuild-5817fe`)
- **Macro Dashboard** (data engine): `/Users/chriswong/Documents/Cluade/Macro Dashboard`

> ⚠️ **Macro audit basis**: the local Macro checkout is **4,343 commits behind `origin/main`**
> (detached at `5c90bf15229`, Jul-09 vintage). Every macro fact below was read from
> `git show origin/main:<path>` per the `neural-web-read-layer` audit-trap law. Line refs for
> macro files are approximate to origin/main as of today.

---

## 1. The `/options` hub (Terminal)

### 1.1 Route → composer → engine

- `terminal/app/options/` → **`terminal/components/workspaces/OptionsWorkspace.tsx`** — the
  `/options` body. Renders ONE `WorkspaceTabs` above `OptionsHubView` in **CONTROLLED** mode;
  owns `?tab=` URL state via shallow `window.history.replaceState`. Load-bearing aliases:
  `?tab=vol` **and** `?tab=screener` → the hub's `screener` tab (Options Screener);
  `?tab=fundamentals` redirects to `/analysis`.
- **`terminal/components/OptionsHubView.tsx`** (4,627 lines) — the engine.
  - `TabKey` union: line 89. `TABS` registry: lines 91–110.
  - Controlled/uncontrolled contract: lines 1447–1530 (page-driven `activeTab`+`onTab`, or
    self-managed seeding from `?tab=`; `allowedTabs` clamps).
  - Tab panels are code-split `dynamic(…, {ssr:false})` (lines 33–66) and keep-alive after
    first visit (`visitedTabs`, e.g. line 3787).
- Paywall: `terminal/components/OptionsPaywall.tsx`; entitlement authority = macro-api
  (`lib/entitlement.ts hasLiveOptions()`), gated at the SSE spine too (§2.3).

### 1.2 Tab census — key → component → f-params

| Tab key | Component | Data (f-params) |
|---|---|---|
| `prophet` | `components/prophet/ProphetView.tsx` | `prophet_idx`, `prophet_marks`, `manifest` (prefetch line 1681) |
| `desk` | `components/flowdesk/FlowDeskView.tsx` | SSE `feed` (line 296), `tide`, `chainheat`, `enrich`, `ticker:{ROOT}` (lines 335–402) |
| `tape` | inline in OptionsHubView | SSE `feed`, `heat` (1569/1658), `oiconf` (1955) |
| `tide` | inline + `TideChartLazy` + `surface/SessionFlowPane` sub-toggle | `tide`, `dte` (1590), `ctx` (1943) |
| `tickers` | inline (drill) | `ticker:{ROOT}` (1604), `tctx:{ROOT}` (1975), `vol:{ROOT}` (1928 — vol surface folded into right column) |
| `screener` | inline | `oi`, `hot` (1831–1832) |
| `gex` | `components/gexdesk/GexDeskView.tsx` | SSE `gex:{ROOT}` (line 193), `gexstate:{ROOT}`, `matrix:{ROOT}`, `gex_dates:{ROOT}`, `gex_at:{ROOT}:{DATE}`; belt: `moves:{ROOT}`, `vol:{ROOT}`, `darkpool`, `volregime` |
| `surface` | `components/surface/SurfaceView.tsx` | `surface_dates:{ROOT}`, `surface_idx:{ROOT}` / `surface_idx_at:{ROOT}:{DATE}`, `surface:{ROOT}:{STAMP}` / `surface_at:{ROOT}:{DATE}:{STAMP}`, `tide` |
| `prism` | `components/prism/PrismView.tsx` | `matrix:{ROOT}` (line 139), `gexstate:{ROOT}` (154), `oi` (OiMoversRail); heat_seeker rides the matrix payload |
| `structure` | `components/structure/StructureView.tsx` | `oi_time:{ROOT}`, `max_pain:{ROOT}`, `oi_change:{ROOT}` + lazy bare `oi_change` (cross-root board, line 123) |
| `volatility` | `components/vol/VolView.tsx` | `vol:{ROOT}` (line 81) — one fetch per committed root |
| `leaders` | inline | `leaders` (2032) |
| `radar` | inline | `radar` (2053) |

Retired: standalone `vol` surface (folded into Tickers); `vol → screener` URL alias is
load-bearing (OptionsWorkspace header comment).

### 1.3 gexdesk suite (`terminal/components/gexdesk/`)

- **`GexDeskView.tsx`** (991) — desk owner. `GexPayload` interface lines 67–106
  (`schema, asof, root, spot_ref, net_gex_bn, gamma_flip, call_wall, put_wall,
  by_strike[{strike, gamma_net, gamma_call, gamma_put, delta_net?, vanna_net?, charm_net?}],
  by_expiry[], hvl?, magnet?, max_pain?, put_call_oi_ratio?, iv30?, convention, coverage,
  history[{date, net_gex_bn, gamma_flip, call_wall, put_wall, regime}]`).
  `GreekLens = gamma|delta|vanna|charm` (line 114). Expiry lens (`LENS_ALL`, from
  `lib/gexLadder.ts`) is made real by the `matrix:` store. Dated-session replay state
  (R0.10) lines 172–186: `gex_dates:` index (validated by `lib/gexSessions.ts isGexDates`)
  drives a session dropdown; `gex_at:{ROOT}:{DATE}` loads the archived full ladder;
  `archivedMissing` is its own honest state.
- **`StrikeLadder.tsx`** (1,519) — the by-strike ladder (svgChart-law compliant).
- **`GexHistory.tsx`** (389) — scrubbable net-GEX session strip over `GexPayload.history[]`;
  header documents the v7b chart pass (R1/R2/R4/R5/R7/R9) — the template for any new spark.
- **`MarketStateCard.tsx`** (996) — consumes `GexStatePayload` (`gexstate:` →
  `options_structure.gex_state/v1`); renders regime + passport, "state computing" on empty.
- Also: `GexSummaryBar`, `ExpiryBars`, `ExposureExpiryDrawer`, `GexGuide`, `gexStrings.ts`.
- **EOD context belt**: `components/eodcontext/EodContextBelt.tsx` — fetches `darkpool`,
  `volregime` once + `moves:{ROOT}`, `vol:{ROOT}` per root (line 92); `StructureStrip.tsx`
  merges gexState/gex/moves/vol/oiConf into cells; `VolRegimeChip`, `DarkPoolMini`.

### 1.4 Structure tab (R3 OI suite) — `terminal/components/structure/`

`StructureView.tsx` (374; header = full contract): root input + "Nightly EOD" asof chip
(warn past 3 sessions) + "OI = t-1" law chip. Panels: `OiLadderPanel`, `OiExpiryPanel`,
`OiTimePanel` (18-month calls/puts), `MaxPainPanel`, `MaxPainTimePanel`, `OiChangePanel`
(root/all-roots scope). Types in `structureTypes.ts` (`MaxPainPayload`, `OiTimePayload`,
`OiChangePayload`). OI is NON-DIRECTIONAL — neutral accents only.

### 1.5 Volatility tab — `terminal/components/vol/`

`VolView.tsx` (397) + `VolTermPanel` / `VolSkewPanel` / `VolHistoryPanel` / `volShared`.
**`volTypes.ts` is the verified `options_hub.vol/v1` client contract** and records store
facts: `history[].iv_rank` and `.close` are NULL in the live store; smile wings carry
garbage deep-ITM IVs (default-trim); IV/RV are percent numbers, ranks 0–100.

### 1.6 Surface tab + replay spine — `terminal/components/surface/`

- **`SurfaceView.tsx`** (453) — root picker (`SURFACE_ROOTS = SPY/QQQ/IWM` only),
  single/quad view (`QUAD_METRICS = netprem|gex|vanna|charm`), style popover, pins.
  Fetches `surface_dates:` + `surface_idx:` (lines 183–184), validated by
  `lib/surfaceContract.ts isSurfaceDates/isSurfaceIndex`.
- **Replay spine**: pure logic in **`terminal/lib/replayEngine.ts`** (reducer, stamps,
  keybinds, play clock, `stampAt`/`isAtHead`); **`replayContext.tsx`** (143) —
  `ReplayProvider` exposes `asOfStamp / atHead / live / sessionDate / archived`. The
  `atHead` vs `live` split is the point-in-time honesty mechanism: present-only panes key
  off `live`, never `atHead`. **`ReplayBar.tsx`** (416) drives dispatch;
  **`replayBus.ts`** broadcasts scrub position to sibling kept-alive tabs (GEX ladder,
  Session Flow, expiry drawer); **`surfaceSync.tsx`** = crosshair sync across quad cells.
- **`SurfacePane.tsx`** (1,251) heat field; `SessionFlowPane.tsx` (379) session tide;
  `StrikeEvolutionModal`, `EodReplayTag`, `surfacePins`, `surfaceTheme`, `surfaceStrings`.
- Contract types: `lib/surfaceContract.ts` — `SurfaceIndex {date, stamps[HHMM asc], latest,
  cadenceSec}`, `SurfaceFrame {spot, price_levels asc, time_steps, grids[metric][level][time],
  asof, cadence, metrics?, session_date?, root?}`, `SurfaceDates {root, dates NEWEST-FIRST,
  latest, count, retain, cadenceSec, cadence, asof, source}`. Cadence honesty: UI labels the
  observed spacing, not the producer's claim.

### 1.7 PRISM — `terminal/components/prism/`

`PrismView.tsx` (711) — per-root matrix board + SPY/QQQ/IWM confluence; `MatrixGrid.tsx`
(1,043) strike×expiry heat grid; `LensBar` (GEX/OI/VOL/ΔOI lenses), `HeatSeekerCard`
(matrix `heat_seeker`; **confidence is a 0..1 NUMBER, not a tier** — PR #218 lesson),
`ConfluenceView`, `OiMoversRail` (`oi`). Fixture doctrine: unknown root ⇒ `{}` — the old
SPY fallback fabricated perfect cross-index alignment in dev (`flowSource.ts` lines 525–537).

---

## 2. Data path (Terminal server side)

### 2.1 `terminal/lib/flowSource.ts` — the single resolver (810 lines)

SERVER-ONLY. Shared by GET `/api/flow` and the SSE spine. Resolution order:
`FLOW_FIXTURE=1` → fixture; else Python backend (`FLOW_BACKEND`) → R2 CDN (`R2_BASE`)
→ null (both from `lib/upstreams.ts`). `attachFlowScores()` (lines 250–272) attaches the
proprietary `flow_score_v1` result server-side to `f=feed` only — weights never reach the
client. Validation `isValidF()` lines 54–99; `backendPath()` 107–162; `r2Key()` 165–225;
`fixtureFor()` 341–664; `tryFetchUpstream()` 761–790; `loadFlowFresh()` 797–810.
Dev-only synthetic intraday candles: `intradayFixture()` (708–754), gated on FLOW_FIXTURE.

**Complete f-param census** (f → R2 key → fixture file, all fixtures under
`terminal/public/data/`):

| f-param | R2 key | Fixture |
|---|---|---|
| `feed` (default), any other bare f | `live_flow/{f}_current.json` | `flow_fixture.json` (keyed by f) |
| `heat` | `live_flow/heat_current.json` | `flow_fixture.json` |
| `meta` | `live_flow/meta.json` | `flow_fixture.json` |
| `tide` | `live_flow/tide_current.json` | `tide_fixture.json` |
| `dte` | `live_flow/dte_tide_current.json` | `dte_fixture.json` |
| `ticker:{ROOT}` | `live_flow/tickers/{ROOT}.json` | `ticker_fixture.json` (root-keyed, honest `{}`) |
| `vol:{ROOT}` | `options_hub/vol/{ROOT}.json` | `vol_fixture.json` (root-keyed) |
| `gex:{ROOT}` | `options_hub/gex/{ROOT}.json` | `gex_fixture.json` (root-keyed) |
| `gex_dates:{ROOT}` | `options_hub/gex_history/{ROOT}/dates.json` | `gex_dates_fixture.json` |
| `gex_at:{ROOT}:{DATE}` | `options_hub/gex_history/{ROOT}/{DATE}.json` | `gex_fixture.json` re-dated, history[] truncated ≤ date; unlisted date ⇒ `{}` (prod-404 twin) |
| `oi` | `options_hub/oi_movers.json` | `screener_fixture.json`["oi"] |
| `hot` | `options_hub/hot_contracts.json` | `screener_fixture.json`["hot"] |
| `ctx` | `options_hub/context.json` | `ctx_fixture.json` |
| `oiconf` | `options_hub/oi_confirmed.json` | `oiconf_fixture.json` |
| `tctx:{ROOT}` | `options_hub/tickers_ctx/{ROOT}.json` | `tctx_fixture.json` (root-keyed) |
| `moves:{ROOT}` | `options_hub/moves/{ROOT}.json` | `moves_fixture.json` (root-keyed) |
| `oi_time:{ROOT}` | `options_hub/oi_time/{ROOT}.json` | `oi_time_fixture.json` (root-keyed) |
| `max_pain:{ROOT}` | `options_hub/max_pain/{ROOT}.json` | `max_pain_fixture.json` (root-keyed) |
| `oi_change` (bare = cross-root board) | `options_hub/oi_change.json` | `oi_change_fixture.json`["cross"] |
| `oi_change:{ROOT}` | `options_hub/oi_change/{ROOT}.json` | `oi_change_fixture.json` (root-keyed) |
| `gexstate:{ROOT}` | `options_structure/gex_state/{ROOT}.json` | `gexstate_fixture.json` (root-keyed/declared-root-only) |
| `matrix:{ROOT}` | `options_structure/matrix/{ROOT}.json` | `matrix_fixture.json` (root-keyed) |
| `chainheat` | `live_flow/chain_heat_current.json` | `chain_heat_fixture.json` |
| `darkpool` | `darkpool/eod.json` (bucket ROOT) | `darkpool_fixture.json` |
| `volregime` | `vol/regime.json` (bucket ROOT) | `volregime_fixture.json` |
| `surface_idx:{ROOT}` | `live_flow/surface/{ROOT}/idx.json` | `surface_idx_fixture.json` |
| `surface:{ROOT}:{STAMP}` | `live_flow/surface/{ROOT}/{STAMP}.json` | `surface_fixture.json` truncated to stamp |
| `surface_dates:{ROOT}` | `live_flow/surface/{ROOT}/dates.json` | `surface_dates_fixture.json` |
| `surface_idx_at:{ROOT}:{DATE}` | `live_flow/surface/{ROOT}/{DATE}/idx.json` | re-dated canonical session; unlisted date ⇒ empty |
| `surface_at:{ROOT}:{DATE}:{STAMP}` | `live_flow/surface/{ROOT}/{DATE}/{STAMP}.json` | same doctrine |
| `manifest` | `live_flow/manifest.json` (also local-file first) | `manifest.json` |
| `flow_idx` | `live_flow/flow_idx.json` (+ GitHub-Pages final fallback) | `flow_idx_fixture.json` |
| `prophet_idx` | `prophet/index.json` | `prophet_fixture.json` |
| `prophet_marks` | `live_flow/prophet_marks.json` | `prophet_marks_fixture.json` |
| `enrich` | `live_flow/enrich_current.json` | `enrich_fixture.json` |
| `leaders` | `flowleaders/leaders.json` | `flow_leaders_fixture.json` |
| `radar` | `leaderradar/radar.json` | `leader_radar_fixture.json` |

**Prefix discipline** (add-a-param law): new dated forms must be *disjoint prefixes*, never
overloads — `gex_dates:`/`gex_at:` differ from `gex:` at char 4 (`_` vs `:`);
`surface_idx_at:` can't be eaten by `surface_idx:`. Longer prefixes are matched first
anyway ("independent of prefix arithmetic"). The mapping is pinned by tests
(`backendPath`/`r2Key` exported for that reason — header lines 101–106; fixture family
conventions locked by `lib/__tests__/hubFixtures.test.ts`).

**Fixture doctrine**: root-keyed families return honest `{}` for unknown roots (never a
neighbour's data); dated families re-date ONE canonical session and refuse unlisted dates.

### 2.2 Client plumbing

`lib/flowClientCache.ts` (`flowGet`/`flowPrefetch`/`flowInvalidate` over GET `/api/flow`,
SWR-cached in `app/api/flow/route.ts`, 104 lines) and `lib/flowStream.ts`
(`useFlowStream<T>(f)` — EventSource wrapper with automatic poll fallback).

### 2.3 SSE spine — `terminal/app/api/flow/stream/route.ts` (144 lines)

One EventSource per (client, f). Same `?f=` grammar + same `loadFlowFresh` as GET.
Server watch cadence `POLL_MS=15s`, heartbeat 20s, change detection via `signature()` =
`asof|asof_utc|session_date|ts` + serialized byte length (lines 33–39). Entitlement-gated
at connection open: non-fixture requires `hasLiveOptions()` (macro-api `terminal_live_options`)
else 403 `pro_required` (lines 48–50). Rate-limited (`flow-stream`). `Cache-Control:
no-store` deliberately WITHOUT `no-transform` (gzip: 2.0MB→100KB feed frame; header comment
lines 121–137). `runtime="nodejs"`, `dynamic="force-dynamic"`.

### 2.4 Dated reads end-to-end

- **GEX ladder replay (R0.10)**: `gex_dates:{ROOT}` (sessions index, `options_hub.gex_dates/v1`,
  newest-first, `latest==dates[0]`) → dropdown in GexDeskView → `gex_at:{ROOT}:{DATE}` loads the
  archived full `options_hub.gex/v1` payload keyed by its own asof. Terminal validator
  `lib/gexSessions.ts isGexDates` has a byte-twin in the macro builder (`is_gex_dates`).
- **Surface replay**: `surface_dates:` → session picker in SurfaceView → dated
  `surface_idx_at:`/`surface_at:` through the same ReplayProvider; live badge withdraws on
  archived sessions.

---

## 3. Macro engine (all paths in `Macro Dashboard`, read at `origin/main`)

### 3.1 GEX math

- **`engine/gex_engine.py`** (194) — the pure chain→GEX function of record: net GEX/VEX/CEX,
  zero-gamma flip via ±25% spot-grid reevaluation, regime (long above flip / short below),
  magnets, charm anchor, IV30, P/C OI, max pain. Input contract: DataFrame
  `[K, T, iv, oi, is_call, expiry?]` + spot. Dealer sign = +1 call / −1 put (an assumption,
  disclosed everywhere). `DEFAULTS` incl. `strike_window_pct=0.25`, `pct_move=0.01`.
- **`engine/gex_model.py`** (806) — the rich modeling layer for the macro `site/gex` board
  (profile curve, walls, heatmap, smile, term, expected move, per-expiry max pain).
- **`engine/options_hub.py`** — `compute_gex()` (§3.2) replicates the gex_engine dealer-sign
  convention for the Terminal payloads; `_find_gamma_flip` = nearest zero-crossing of
  cumulative net GEX by strike.
- Falsifiable-claim check: `scripts/validate_gex.py` (negative gamma → higher forward RV).
- **`scripts/build_index_gex_history.py`** (325+) — 2017→ reconstructed index-ETF GEX history
  from the ThetaData T1 store through the SAME `gex_engine.compute_gex` (sign/scale-comparable);
  rows stamped `reconstructed=True`; display-only; writes `data/index_gex_history/`.
- **`scripts/build_polygon_gex.py`** → `data/polygon_gex/summary_{ROOT}.parquet` — source of
  the `history[]` block attached to gex payloads (`load_gex_history_v2`).

### 3.2 The options_hub nightly — `scripts/build_options_hub_nightly.py` (the ONE R2 publisher of the gex/vol/oi/moves plane)

`R2_PREFIX="options_hub/"`. `DEFAULT_ROOTS` = 22 ETF anchors (SPY…SPX, SPXW). INERT per
root. OI TIMING LAW: all GEX/OI logic uses OI[t-1]. Publishes (local staging
`data/live_flow_out/options_hub/`):

| R2 key | Builder (engine/options_hub.py unless noted) | Schema |
|---|---|---|
| `options_hub/vol/{ROOT}.json` | `compute_vol` (line ~123) | `options_hub.vol/v1` — `{iv_rank_252, iv_rank_all, coverage_days_all, since_all, atm_iv, iv_52w_hi/lo, rv20, vrp, term[{dte,exp,atm_iv}], smile[{exp,points}], history[{date,iv_rank(null),atm_iv,close(null)}], coverage}` |
| `options_hub/gex/{ROOT}.json` | `compute_gex` (~406) | `options_hub.gex/v1` — `{spot_ref, net_gex_bn, gamma_flip, call_wall, put_wall, by_strike[±20% spot, cap 160: {strike, gamma_net($mn), gamma_call, gamma_put, delta_net, vanna_net, charm_net}], by_strike_full_n, by_expiry[{exp,gamma_net,delta_net}], convention, coverage{n_contracts,oi_date:"t-1",…}}` + `history[]` injected via `_attach_gex_history` (polygon_gex). Upload guarded by `_gex_publish_decision` (empty-over-nonempty suppressed → preserve last-good) |
| `options_hub/gex_history/{ROOT}/{ASOF}.json` | dated copy of the gex payload (`_gex_history_relpath`) | **WP-GEX-SNAPSHOTS** — keyed by payload asof (never wall clock); skipped when by_strike empty. Epoch `GEX_HISTORY_EPOCH="2026-07-17"` |
| `options_hub/gex_history/{ROOT}/dates.json` | `build_gex_dates_index` | `options_hub.gex_dates/v1` — derived from an R2 **LIST** of existing objects (never a ledger); newest-first; self-heal of missed NYSE sessions bounded by `GEX_HISTORY_HEAL_MAX=40`; healed payloads carry `self_healed:true` + truncated history |
| `options_hub/tickers_ctx/{ROOT}.json` | `build_tickers_ctx` (~1036) | `options_hub.tickers_ctx/v1` (tape-flow z-context) |
| `options_hub/oi_movers.json` | `compute_oi_movers` (~679) cross-root | `options_hub.oi_movers/v1` |
| `options_hub/hot_contracts.json` | `compute_hot_contracts` (~766) | `options_hub.hot/v1` |
| `options_hub/context.json` | `build_context_payload` (~926) | `options_hub.context/v1` |
| `options_hub/oi_confirmed.json` | `build_oi_confirmed` (~1127) | — |
| `options_hub/oi_time/{ROOT}.json` | `compute_oi_time` (~790, origin/main) | `options_hub.oi_time/v1` — 18-month call/put total OI per session (`OI_TIME_MONTHS`) |
| `options_hub/max_pain/{ROOT}.json` | `compute_max_pain` (~872) | `options_hub.max_pain/v1` — per-expiration max pain from OI[t-1] |
| `options_hub/oi_change/{ROOT}.json` | `compute_oi_change` (~1020) | `options_hub.oi_change/v1` — top contract-level OI shifts |
| `options_hub/oi_change.json` | `compute_oi_change_cross` | cross-root board; **also the `options_hub_oi` dead-man beacon** |
| `options_hub/moves/{ROOT}.json` | `engine/moves_engine.py moves_payload` (nightly lines ~1171–1195) | `options_hub.moves/v1` — expected-move band (ATM IV, 1.96σ default) + **matched** containment calibration from `data/levels/grades.parquet` (`per_ticker_calibration`, min 8 sessions); published only when `expected_move` present AND gex publish not guarded |

OI-suite completeness guard `_oi_suite_upload_ok`: empty compute over a store WITH rows
suppresses the upload (preserve last-good); genuinely empty store publishes its honest empty.

### 3.3 gex_state + matrix (the `options_structure/` R2 plane)

- **`engine/gex_state.py`** (573+) — `options_structure.gex_state/v1` (~line 649):
  `{spot, net_gex_bn, gamma_regime, stability_pct, gamma_flip, dist_to_flip_pct, call_wall,
  put_wall, magnet, max_pain, pin_probability, gravity_direction, gravity_up_pct,
  cascade_trigger, upside_trigger, oi_delta_clusters{new_oi[], exit_oi[], vintage stamps,
  snapshot_spot, note_en/zh}, regime_passport, authority_tier:"display",
  reliability{levels/regime/oi_delta/note}}`. OI-delta is the signing-free (reliable) read.
  Committed to `site/options_structure/gex_state/*.json`; mirrored to R2
  `options_structure/gex_state/{ROOT}.json` by **`scripts/mirror_gex_state_r2.py`**
  (runs at the end of `ops/launchd/run_options_matrix.sh`; fail-soft exit 0).
- **`engine/options_matrix.py`** + **`scripts/build_options_matrix.py`** →
  `options_structure.matrix/v1` → R2 `options_structure/matrix/{ROOT}.json`.
  Payload: `{spot, expiries[], strikes[], cells[strike×expiry: gex/oi/vol/delta_oi/vex_mn…],
  levels{call_wall,…}, heat_seeker (GEX→OI→VOL first-hit; confidence 0..1), authority_tier,
  experimental:true, reliability{…}, deferred{UNUSUAL}, _build_meta}`. Default roots
  SPY QQQ IWM NVDA TSLA AAPL MSFT META AMD GOOGL. Launchd lane
  `ops/launchd/com.macro.optionsmatrix.plist` weekdays 19:00 (NOT daily.yml — GH runner
  can't see the theta store); runner gates on SPY EOD-store freshness.
- **`scripts/build_gex_board.py`** (386) — the macro SITE page (`site/gex.html`,
  `site/gex/{KEY}.json` + `index.json`) from the live delayed **Cboe** chain via
  `engine/gex_model`. A separate display plane from the Terminal's options_hub payloads.

### 3.4 Chain snapshot poller (U-CHAIN) — `scripts/chain_snapshot_poller.py`

Mac-side RTH loop, cadence 15 min, ~150 roots (22 ETF anchors + top-gex names): full-chain
ThetaData v3 snapshot (first_order + second_order greeks: delta/theta/vega/rho/IV +
gamma/vanna/charm/vomma/veta) → `data/chain_snapshots/{ROOT}/{YYYY-MM-DD}.parquet`
(dedup key = root/exp/strike/right/snapshot_bucket) + one `_oi.parquet` sidecar per day
(OI is EOD t-1, one pull complete) + `_meta.json` run status + corrupt-frame quarantine.
Rows carry `source="chain_snapshot"` — its own cohort, never pooled with live_flow/EOD.
`max_concurrent=1` HARD (live_flow owns 2 of the terminal's 8 ThetaData slots). This is
the Interval Map / Volatility Drift data plane (WP-UCHAIN) — **the natural intraday input
for a Market Structure Core** (no R2 publisher yet; any Terminal consumer needs a new
builder + f-param + R2 key).

### 3.5 Live flow poller — `scripts/live_flow_poller.py` (1,263+; launchd `com.mastermind.liveflow`)

Cadence 120 s, `max_concurrent=2` HARD, RTH-only. Per cycle publishes under `live_flow/`:

- `feed_current.json` (event feed; Terminal attaches flowScore), `heat_current.json`, `meta.json`
  (delta_mode / two_tier probes live here — R0 verification point).
- `tide_current.json` (`live_flow.tide/v1`), `dte_tide_current.json` (`live_flow.dte_tide/v1`)
  via `engine/live_flow.py build_tide_current` / `build_dte_tide_current`.
- Dated archives (OIP W0 T-lane): `tide/{DATE}.json`, `dte_tide/{DATE}.json` + per-family
  `dates.json` (`scripts/build_flow_archive.py stage_dated_archives`; same bytes as current keys).
- `tickers/{ROOT}.json` (`live_flow.ticker/v1`) for top-40 by gross premium + pinned roots
  (Mag7/memory/SPY/QQQ/SMH); empty payloads never overwrite good ones.
- **Surface store** via `scripts/build_flow_surface.py build_and_stage_surfaces`: legacy
  today keys + date-keyed copies + `dates.json` (contract quoted in §1.6; grids
  `netprem` + Lane-G greek grids GEX/DEX/VANNA/CHARM built from per-contract NBBO quotes
  tapped in-cycle joined to session-cached EOD-t-1 OI). Retention
  `SURFACE_RETAIN_SESSIONS=10`, pruned once per session.
- Known failure mode (memory `live-flow-currentday-wildcard-outage`): ThetaData v3 rejects
  wildcard `expiration=*` for current-day trade_quote.

Satellite publishers: `scripts/build_chain_heat.py` (`options_flow.chain_heat/v1` →
`live_flow/chain_heat_current.json`, reads feed_current from R2);
`scripts/build_flow_enrich.py` (`flow.enrich/v1` → `live_flow/enrich_current.json`, trailing
archive threshold pools); `scripts/build_prophet_marks.py` (`prophet.live_marks/v1` →
`live_flow/prophet_marks.json`, 5-min RTH, per-contract quotes);
`scripts/mirror_flow_idx.py` (`live_flow/flow_idx.json`, `flowleaders/leaders.json`,
`leaderradar/radar.json`); `scripts/mirror_terminal_context_r2.py`
(`site/darkpool_eod.json` → `darkpool/eod.json`, `site/vol/regime.json` → `vol/regime.json`);
`scripts/build_flow_leaders.py` (Flow Leaders nightly).

Payload validators for the whole options_structure family live in
**`engine/options_structure.py`** (gex_state / chain_heat / matrix / structural /
prophet.trade_plan / prophet.management_state schema checks — lines ~120–717).

---

## 4. Neural Web plane

- **Macro builder**: `engine/neuralweb/mastermind_context.py` —
  `build_market_plane()` (~line 2669) → **`neuralweb.market_plane.v1`** (~2 KB):
  ```
  {schema, asof, is_context_only:true,
   verdict{verdict, score, label_en, label_zh},
   regime{quad, quad_name, confidence, cycle_tag, transition_state, flip_margin, liquidity_overlay},
   vol{regime, risk_score},
   breadth{…}|null,
   liquidity_plumbing{…},
   contradiction_count, cortex{status, degradation_reason},
   stale, gaps[]}
  ```
  Sourced fail-open from `data/neuralweb/world_state.json`, `liquidity_plumbing.json`,
  `confluence_graph.json`, `cortex/memo.json`; every missing input = nulls + a `gaps[]`
  entry, never an exception. `build_and_write_market_plane()` stamps the synapse envelope
  and dual-writes `data/neuralweb/market_plane.json` (canonical, committed) +
  `site/neuralwebdata/market_plane.json` (public, served at
  `mastermind-x.com/neuralwebdata/`, max-age=300).
- **Terminal proxy**: `terminal/app/api/nw/route.ts` — same-origin proxy over `NW_BASE`
  (`lib/upstreams.ts`); `FEEDS = {market_plane: "market_plane.json"}` is the extension
  point for new feeds; 5-min in-memory cache; `NW_FIXTURE=1` serves
  `public/data/nw_plane_fixture.json`.
- **Consumer**: `terminal/components/NeuralWebStrip.tsx` (topbar) + `terminal/lib/nwPlane.ts`
  (types/tone helpers/staleness) — verdict pill, regime quad chip, vol chip, liquidity, cortex
  health dot. Also read by `lib/copilotTools.ts`.
- **Plug-in path for Market Structure Core context** (e.g. index gamma regime in the topbar):
  add a block inside `build_market_plane` (fail-open + gaps entry) → extend `nwPlane.ts`
  types + a strip chip; a heavier feed instead gets its own `FEEDS` entry in `/api/nw`.
  Display-only law: the Terminal never ranks/gates/scores off these feeds.

---

## 5. Prophet

- **Macro**: `scripts/build_prophet.py` — originates `prophet.trade_plan/v1` envelopes from
  `us_standouts.json` (`engine/prophet_bridge.originate_plans`), runs the management
  confidence engine, writes `site/prophet/index.json` (all active plans + states inline),
  `site/prophet/plans/<ID>.json`, `states/<ID>.json`, `showcase.json` (delayed winners only),
  `data/prophet/ledger.jsonl`; `--publish` uploads index to **R2 `prophet/index.json`**.
  All artifacts `authority_tier='display'`; "validated" CI-forbidden
  (`check_validated_claims.py`). Schema validators: `engine/options_structure.py`
  (`prophet.trade_plan/v1` ~589, `prophet.management_state/v1` ~674).
  Live marks: `scripts/build_prophet_marks.py` → `live_flow/prophet_marks.json`
  (`prophet.live_marks/v1`, 5-min RTH).
- **Terminal consumer**: `f=prophet_idx` + `f=prophet_marks` →
  `terminal/components/prophet/ProphetView.tsx` (three-column desk; honesty doctrine in
  header) with `SignalCard.tsx` (`PlanSummary` accepts BOTH flat current-prod and nested
  legacy shapes — `planAsof/planPhase/planConfidence` accessors), `ConfidencePanel`,
  `GeometryRail`, `OptionCard` (OCC symbol derivation for marks join).
- **Where Market Structure Core joins — the spine**
  (`docs/OPTIONS_SUPERINTELLIGENCE_MASTERPLAN_2026-07-31.md` §6, lines 325–399):
  new `prophet.spine/v1` per candidate, composed **from existing R2 artifacts, no new math
  in v1**. Its `options:` block is exactly this program's output surface:
  `{net_gex, flip, walls, dist_to_flip, vex?, charm?}` from **gex_state/matrix**;
  `{pcr, iv_rank, term_slope, expected_move}` from **vol/moves**;
  `flow:{tide_z, unusual_z, sweep_bias_5t, oi_confirm}` from the R1/R2 intraday lanes.
  Per-source `known_ts` + bar-grammar tag; staleness disclosed. Downstream joints:
  origination lanes L2–L4 (§6.2), options-structure-aware geometry — stops snap to put
  wall/flip, targets respect call walls + expected move, `structure_fit` flag (§6.3),
  intraday re-scorer `live_adjustment` ±10 with the prophet-marks 5-min loop (§6.4),
  spine options block beside the Oracle verdict (§6.6). Score-not-gate, display-tier,
  no merged composite score.

---

## 6. Alerts engine

- **Engine**: `charting-app/…/ingest/alerts_engine.py` (repo root, NOT terminal/) —
  **`evaluate(alert, data, flow)` at line 581**; runs every 5 min via VPS cron. One-shot
  semantics: fire once → `active=false` + evidence stamped into `condition.triggered`
  (zero-DDL, state rides the jsonb); re-arm = user PATCH.
- Existing condition types: legacy `signal|regime|price|rsi` + options types
  `opt_gamma_flip / opt_wall_touch / opt_premium_burst / opt_0dte_spike /
  opt_surface_pocket` (header lines 18–49 document each contract + hysteresis).
- **How to add a condition type** (the pattern the options wave established):
  1. Write `_eval_<name>(cond, payload, prev) -> (fired, value, note, nextState)`;
     `fired=None` = "cannot evaluate" (logs, never disarms). Persist hysteresis on a
     `cond._xx` sub-key.
  2. Register in **`_OPT_EVALUATORS`** (line 572): `(state-key, evaluator, payload-getter)`
     where the getter pulls from the `Flow` accessor class (`flow.gex(root)`,
     `flow.gexstate(root)`, `flow.tide()`, `flow.dte()`, `flow.surface(root)`) — extend
     `Flow` for a new f-param.
  3. Mirror the algorithm in `terminal/lib/optionsAlerts.ts` — parity is guarded verbatim
     by `tests/test_alerts_options.py`.
  4. Add the type to the allow-list in `terminal/app/api/alerts/route.ts`
     (`LEGACY_TYPES` / `OPT_TYPES` / suite lane — unknown types are rejected at the door)
     and to the UI `COND_TYPES` in `terminal/components/AlertsView.tsx`.
- Suite-event lane (Node, `lib/suiteAlerts.ts`) is separate: catalog-driven
  `suite_event` / `suite_sequence` with tier gating.

---

## 7. Design-system constraints for new surfaces

- **Design law** (`terminal/AGENTS.md`): system is REAL and locked — `app/globals.css`
  (Terminal v5) + `app/observatory.css` (`.obs` scope, e.g. `.obs-pillnav` used by hub
  tabs/sub-toggles) + `app/fin.css` (v7 `fin-` primitives: fin-empty, fin-skel, ~774 refs).
  v5 tokens (globals.css `:root`): surfaces `--bg/--panel/-2/-3/--inset`, lines
  `--line/-2/-3 --hairline(-strong)`, text `--text/--text-2/--muted/--text-dim`, semantics
  `--up/--down/--buy/--sell/--signal/--rebuy/--cut/--brand/--warn/--danger/--ai`, glass
  `--pop-*`, motion `--t-fast(120ms)/--t-med(200ms)/--t-slow(320ms) + --ease-out`, type
  scale `--fs-micro…--fs-num-lg`, spacing `--sp-1…--sp-8`, radii `--r-card/--r-tile`.
  ⚠️ Trap (memory `fin-css-undefined-tokens`): fin.css references `--sp-3`/`--shadow-2/-3`
  that globals never defines — never add bare `--sp-*`/`--shadow-*` there; every `var()`
  in a gradient/shadow carries a fallback (svgChart R9). ⚠️ zh flips `--up/--down` — use
  `--act`/`--warn` for severity (alerts memory).
- **svgChart LAW** (`terminal/components/charts/svgChart.ts`, rules R1–R9 in header):
  every inline SVG data chart builds on `useChartWidth / niceTicks / fmtTick / thinLabels /
  padDomain / MIN_CHART_H`. 1:1 measured viewBox; never `preserveAspectRatio="none"`;
  never fixed-unit viewBox; labels thin by PIXEL GAP never `i % n`; domains
  finite-filtered + padded, zero unioned only when straddled; tick precision from step.
  `GexHistory.tsx` header is the worked example of a compliant retrofit.
- **Tip** (`terminal/components/ui/Tip.tsx`): the ONE tooltip primitive — body portal,
  flip+clamp, 120 ms open with warm-open, sizes `mini|card`, v5 `--pop-*` glass. Never for
  inline-belonging content; click-popovers for long prose on touch-critical affordances.
- **LEX i18n** (`terminal/lib/i18n.tsx`): `LEX: Record<key, [en, zh]>` + `useT()/useLang()`.
  Desks additionally use per-desk string factories — `makeGexT` (`gexdesk/gexStrings.ts`),
  `makeSurfaceT`, `makeStructureT`, `makeVolT`, `makePrismT`, `makeProphetT` — the pattern
  for a new desk's strings. LAW: zh must never leak into EN view and vice versa;
  verification screenshots ship light+dark+zh.
- **WorkspaceTabs** (`terminal/components/chrome/WorkspaceTabs.tsx`): the ONE sub-nav
  primitive; pure + CONTROLLED (page owns `?tab=` via shallow replaceState — the
  OptionsWorkspace idiom that dodges the useSearchParams CSR bailout); `.obs-pillnav`
  idiom; roving-tabindex a11y. A new hub tab = TABS entry in OptionsHubView + registry
  entry in OptionsWorkspace + LEX keys.
- **Other laws that bind new surfaces**: honesty doctrine (no "validated"/predictive copy;
  dealer-sign disclosed; nightly-EOD data never wears live chrome — asof chip is the
  freshness truth); regime-dynamics law (level+trend+velocity ride with every regime
  label); responsive contract (1440×900 / 820×1180 / 390×844,
  `npm run test:e2e:responsive`); fixtures for every new f-param family
  (root-keyed honest-empty convention, `hubFixtures.test.ts`).

---

## Appendix — integration seams for "Market Structure Core" (observed, not designed)

1. **Server data**: new payloads follow the nightly-builder pattern (§3.2) → new R2 keys
   under `options_hub/` or `options_structure/` → one `flowSource.ts` triplet
   (isValidF/backendPath/r2Key) + fixture + pinned test. Intraday structure would source
   from U-CHAIN parquets (§3.4) — currently unread by any publisher.
2. **UI**: new tab = code-split view under `components/<desk>/` + TABS/OptionsWorkspace
   registry entries; or new panes on the GEX desk (GexDeskView already owns
   ladder+state+matrix+history+belt composition).
3. **Cross-surface context**: market_plane block (§4) for the topbar; EodContextBelt cell
   (§1.3) for per-chart context; Prophet spine options block (§5) for fusion; alert
   condition types (§6) for automation.
