# Macro Dashboard — EOD Options Data/Compute Plane Audit

**Date:** 2026-07-31 · **Auditor:** read-only session (charting-app worktree `claude/quantdata-terminal-options-gaps-33ceb8`)
**Repo:** `/Users/chriswong/Documents/Cluade/Macro Dashboard`

---

## 0. Working-tree state (important caveat)

- The local checkout is a **detached HEAD at `5c90bf15229`** ("feat(china): CN board integrity …", committed **2026-07-14**). It is **not** on a branch, and it is **~2.5 weeks stale** vs `origin/main` at `bb0e422f635` (**2026-07-31**). Working tree is heavily dirty (site/*.html render churn), consistent with the standing memory law "local macro checkouts go stale — audit via origin/main or the live site".
- The staleness is **material to this audit**: the entire flow-surface lane (`scripts/build_flow_surface.py`, `scripts/build_flow_archive.py`), the W2 surface plane (`engine/options_surface.py`, `scripts/build_options_surface.py`), `engine/theme_options_witness.py`, `scripts/mirror_gex_state_r2.py`, `engine/positioning_persistence.py`, `engine/levels_publish.py`, `engine/vex_engine.py`, `engine/moves_engine.py`, the WP-GEX-SNAPSHOTS dated retention in `build_options_hub_nightly.py`, and the OIP-E3 gex_state extensions **exist only on `origin/main`, not in this working tree**.
- Method: audited working-tree files where they exist; audited `origin/main` via read-only `git show` for everything newer; **verified live behavior against R2 itself** (public base `https://pub-f7ffb4441c5f4ad983ca56ec7c651c61.r2.dev`, HTTP GET probes only).

---

## 1. Physical topology (who computes, where, when)

**Data host:** the M1 ops Mac (`ssh m1`, migration 2026-07-25 per `ops/THETADATA_R2_SYNC_RUNBOOK.md`). The ThetaData EOD store physically lives at `~/flow-ops-wt/data/thetadata_eod` (~60 GB, ~13k parquets, 380+ roots × 2012–2026, tiers `eod/ oi/ greeks/`); `~/theta-ops-wt/data/thetadata_eod` is a symlink to it. Store path resolution is now canonical through `engine/thetadata_store.resolve_thetadata_store()` (`THETADATA_STORE` env → `data_dir()/thetadata_eod` → ops-wt, all content-checked so empty stubs never resolve) — the fix for the options_witness empty-store incident class.

**launchd lanes (origin/main `ops/launchd/` + `scripts/launchd/`), all local time (PT) unless noted:**

| Lane | Schedule | What it runs |
|---|---|---|
| `com.mastermind.liveflow` | RTH weekdays | `scripts/live_flow_poller.py` — intraday flow plane (target cadence 120 s; measured ~hourly per parity memory) |
| `com.macro.chainheat` | every 5 min RTH | `scripts/build_chain_heat.py` |
| `com.mastermind.optionshub` | weekdays 16:45 | `scripts/build_options_hub_nightly.py --publish` — the EOD options hub plane |
| `com.macro.optionsmatrix` | weekdays 16:00 | `run_options_matrix.sh` → `build_options_matrix --publish` (SPY-EOD-freshness-gated, 20-min retry ×6) then `mirror_gex_state_r2.py` |
| `com.macro.unusualbaseline` | weekdays 16:30 | `scripts/build_unusual_baseline.py --publish` |
| `com.macro.theme-options-witness` | weekdays 17:15 | `run_theme_options_witness.sh` |
| `com.macro.indexgexhistory` | **weekly, Sun 20:00** | `run_index_gex_history.sh` → `build_index_gex_history` (host-bound reconstruction) |
| `com.macro.thetadata-surface` | nightly (theta lane) | `theta_surface_accrual.sh` → `build_options_surface` (W2 nightly accrual) |
| `com.macro.thetadata-r2sync` | daily 22:00 | `publish_r2 --dirs thetadata_eod` — the store's **sole offsite copy** |
| `com.macro.theta-terminal` / `-backfill` / `-staleness` | keepalive | ThetaTerminal jar + store backfill + staleness sentinel |

The nightly GitHub render (daily.yml) **never** reads the theta store; it reads committed `data/` parquets and R2. The GEX board (`build_gex_board`) runs in the site render (Cboe delayed chains, no theta store dependency).

---

## 2. The authoritative schema module — `engine/options_structure.py`

Six schemas, all display/shadow tier ("validated" is a banned word, CI-enforced; direction always soft without NBBO; LLMs narrate only):

1. **`options_structure.gex_state/v1`** (per-symbol dealer gamma structure state, freshness SLA 30 h): `asof, root, spot, net_gex_bn, gamma_regime (PIN|DRIFT|RANGE|TRANSITION|TREND|CASCADE), stability_pct, gamma_flip, dist_to_flip_pct, call_wall, put_wall, magnet, max_pain, pin_probability, gravity_direction/up_pct, cascade_trigger, upside_trigger, oi_delta_clusters {new_oi[], exit_oi[]}, regime_passport, authority_tier, reliability`.
   **origin/main additions (OIP E3, additive & omitted-when-uncovered):** `wall_persistence` (how long the heaviest-OI strike either side of price has held, bounded snapshot window, from `engine/positioning_persistence.py` — deliberately the OI wall, NOT the dollar-gamma wall, with `matches_board_wall` disclosure), `net_gex_pctile` (today's net GEX inside the name's own daily record), `deep_history` (window/spread of the multi-year index rebuild, index ETFs only), plus vintage stamps inside `oi_delta_clusters`.
2. **`options_flow.chain_heat/v1`**: campaigns keyed (root,strike,expiry,right); per campaign `option_symbol (OCC), ticker, right, strike, expiry, dte, total_premium_mn, alert_count, span_minutes, first_seen, last_seen, ask_share, lean (accumulation ≥0.65 / distribution ≤0.35 / contested), direction_reliability='soft' (validator-enforced)`. Gates: ≥$3M premium, ≥2 alerts.
3. **`options_structure.matrix/v1`** (PRISM): `asof, root, spot, expiries[], strikes[], cells[] {strike, expiry, gex, call_oi, put_oi, call_vol, put_vol, delta_oi{call,put}, unusual|null}, levels {call_wall, put_support, hvl, gamma_flip, max_pain}, heat_seeker {strike, expiry, lens, standout_ratio, confidence(0-1 number), note='descriptive — not a recommendation' (validator-enforced)}`.
4. **`options_structure.structural/v1`** (shadow tier): squeeze/cascade state, top_relevance_score, flow_near_flip/wall, dealer_regime, explanation.
5/6. **`prophet.trade_plan/v1`** / **`prophet.management_state/v1`** (plan envelope + 7-phase management state, confidence ceiling 92).

---

## 3. Per-session, per-root artifact contract (field level)

### 3.1 `options_hub/` plane — the EOD per-root spine (16:45 lane, ThetaData store)

Builder `scripts/build_options_hub_nightly.py` + `engine/options_hub.py`. Roots = **every root with greeks in the T1 store** (ETF anchors `SPY QQQ IWM DIA SMH XLF XLE XLU XLK XLV XLI XLB XLY XLP XLRE XLC KRE XBI ARKK SOXX SPX SPXW` first, then the remaining store universe — ~380+ roots, i.e. **single names included**). `asof` = latest SPY greeks date. Per-root wall-clock budget 420 s; parquet cache cleared per root (OOM law); incremental aggregate publish every 50 roots. Fail-loud when no store resolves (WP-RESOLVER).

Per root, per session, R2 keys (overwrite-in-place):

- **`options_hub/vol/{ROOT}.json`** — `options_hub.vol/v1`: `iv_rank_252, iv_rank_all, coverage_days_all, since_all, atm_iv (30d interp), iv_52w_hi/lo, rv20 (yahoo), vrp, term[] {dte, exp, atm_iv}, smile[] {exp, points[{strike, call_iv, put_iv}]} (2 nearest ≥2DTE expiries), history[] (daily ATM-IV rows), coverage {n_days, since}`.
- **`options_hub/gex/{ROOT}.json`** — `options_hub.gex/v1`: `spot_ref, net_gex_bn, gamma_flip, call_wall, put_wall`; **`by_strike[]`** rows `{strike, gamma_net, gamma_call, gamma_put, delta_net, vanna_net, charm_net}` ($mn, 4dp), **windowed ±20% of spot, capped 160 strikes nearest spot** (`by_strike_full_n` preserves the pre-window count, e.g. SPY 482); **`by_expiry[]`** `{exp, gamma_net, delta_net}`; `convention` (dealer long-call/short-put), `coverage {n_contracts, asof, oi_date:'t-1', n_days, since, history_asof}`, `history[]` (30 scalar rows injected from `data/polygon_gex/summary_{ROOT}.parquet`: `{date, net_gex_bn, gamma_flip, call_wall←magnet_up, put_wall←magnet_down, regime}` — a separately-cadenced store, lag disclosed via `coverage.history_asof`). Inputs: greeks[asof] ⋈ OI[t-1] (OPRA OI timing law). **Completeness guard:** upload suppressed (last-good preserved) when by_strike is empty but the store has OI rows; genuine no-data publishes with `no_data_reason`.
- **`options_hub/gex_history/{ROOT}/{ASOF}.json`** — **WP-GEX-SNAPSHOTS (PR #2615, 2026-07-16): the dated per-strike snapshot.** Same bytes as the day's gex payload, keyed by the payload's own asof (never wall clock); never written empty. **Verified live on R2 2026-07-31**: SPY 200s for 2026-07-17, 07-21..24, 07-27..30; **404s for 07-15/16 (pre-ship), 07-18 and 07-20 (accrual holes), 07-31 (not yet landed at probe time)**. No dates index exists for this plane; forward-accruing only.
- **`options_hub/vex/{ROOT}.json`** — `options_hub.vex/v1` (`engine/vex_engine.compute_vex`): vega-exposure sibling of gex (same PIT inputs), powering the GEX↔VEX toggle; upload gated on the same completeness guard **and** non-empty by_strike.
- **`options_hub/moves/{ROOT}.json`** — `moves.v1` (`engine/moves_engine`): expected move (spot + ATM IV) + per-ticker matched calibration from graded history (Wilson CI when available), learned band multiplier, regime label from levels.
- **`levels/{ROOT}.json`** (top-level plane, `LEVELS_PREFIX='levels/'`, `engine/levels_publish` → `engine/levels_engine.compute_levels`) — `levels.v1` named gamma-level board (Anchor, Call/Put Walls, Flip, Cluster, Counter, Void, Trapdoor, Launchpad, Stack) derived purely from the gex payload; never published empty; gated on gex_publish.
- **`options_hub/tickers_ctx/{ROOT}.json`** — per-root tape-flow context (from `data/tape_flow/daily`).

Cross-root aggregates per session (overwrite): **`options_hub/oi_movers.json`** (`oi_movers/v1`, top-100 by |ΔOI| across roots, per-root top-100 merged), **`options_hub/hot_contracts.json`** (`hot/v1`), **`options_hub/context.json`** (index GEX SPX/NDX/RUT/SPY + fear/greed + ETF flows), **`options_hub/oi_confirmed.json`** (`oi_confirmed/v1` — yesterday's flow events confirmed by today's OI build).

### 3.2 GEX Board plane (Cboe delayed; site render; macro page + archive)

Builder `scripts/build_gex_board.py` (+ `engine/gex_model.build_model` over `engine/gex_engine.compute_gex`):

- Universe: 37 curated (3 index `_SPX/_NDX/_RUT`, 4 ETF, 4 sector, 4 macro ETF, 7 mega-tech, 6 semis, 8 retail) + **all thematic-basket members** from `data/baskets/membership.json` (~313 symbols total; theme names honesty-gated: ≥8 strikes and top-OI share ≤0.55).
- **`site/gex/{KEY}.json`** — the rich per-underlying model, **overwritten daily**: `summary` (compute_gex summary + walls/bands, skew, iv_rank), `expected_move {daily_pct, weekly_pct, …}`, `vol_hole`, `tilt` (per-leg directional leans + headline), `profile` (net-gamma vs spot grid, 81 pts ±15%), `walls`, `surface` (strike×expiry heatmap matrices: net dealer gamma $mn, OI, volume), `smile` (front-expiry IV by strike), `term` (per-expiry ATM IV, implied move, straddle, **max_pain per expiry**), `history[]` (≤40 sessions of `{date, net_gex_bn, regime, iv30}` from the `data/cboe/gex_{KEY}` store).
- **`site/gex/index.json`** — manifest per symbol (regime/net-GEX/flip/IV/walls/bands/max_pain/daily_move/vh/tilt/skew/iv-rank-band). Origin/main adds `coverage_v1` (shared `lib/options_coverage.py` object, session-date-stamped via `lib/nyse_calendar` — never wall clock) and session-filters the skew/putcall context reads.
- **`site/gex.html`** — the macro Options Desk page (template `templates/gex.html.j2` + `site/gex.js`; fetches `site/gex/{KEY}.json` on demand).
- **`data/gex/latest.json`** — the daily archive snapshot: **index/ETF slice only** (`ARCHIVE_KEYS = SPX NDX RUT SPY QQQ IWM DIA`) × 12 scalar fields (`spot, regime, tier, net_gex_bn, gamma_flip, dist_to_flip_pct, iv30, put_call_oi_ratio, call_wall, put_wall, max_pain, daily_move_pct`) + market context (CBOE SKEW, index/equity put-call).
- **`site/options_structure/gex_state/{KEY}.json`** — Package C emitter (`engine/gex_state.compute_gex_state`, schema-validated) per board symbol; **mirrored to R2 `options_structure/gex_state/{ROOT}.json`** by `scripts/mirror_gex_state_r2.py` (runs at the end of the matrix lane; fail-soft; JSON-validated before mirroring — this mirror exists because the Terminal `f=gexstate` proxy reads R2, which was 404 until 2026-07-10).

### 3.3 `engine/signal_archive.py` — what is archived per date (the scalar law)

- Append-only, keep-FIRST per asof, one parquet per label under `data/signal_archive/`. Row = `asof, logged_at,` **all scalar leaves dot-flattened** (lists are skipped from columns) **+ `snapshot_json`** (the full snapshot, lossless).
- Options label: **`options_gex`** ← `data/gex/latest.json` via `scripts/archive_signals.py` (manifest line 42). So the per-session PIT record through this path is **index-only scalars** (the 7 keys × 12 fields above) — no ladders (the latest.json snapshot never contained them, so snapshot_json can't recover them either).
- origin/main gates writes behind `engine.ledger_lane.nightly_advance_enabled()` (`COLLECT_LANE=nightly` only — non-nightly lanes can no longer advance the archive).
- Measured depth (origin/main): **24 rows, 2026-06-28 → 2026-07-30**.

### 3.4 PRISM matrix plane

`scripts/build_options_matrix.py` + `engine/options_matrix.build_matrix` (Package E): **10 roots** (`SPY QQQ IWM NVDA TSLA AAPL MSFT META AMD GOOGL`), window ±20% strike / ≤90 DTE, GEX per prism_spec (OI[t-1] · gamma · S² · 0.01 · 100; BS-gamma fallback with median-IV), `delta_oi = OI[t-1]−OI[t-2]`; VEX and UNUSUAL lenses **deliberately deferred** (greeks-path stability unverified; 30d per-strike volume baseline still accruing). Publishes **`options_structure/matrix/{ROOT}.json`** — **overwrite-in-place, no dated copies**. Nightly 16:00 lane, freshness-gated.

### 3.5 Chain-heat & unusual baseline

- **Chain heat:** `scripts/build_chain_heat.py` every 5 min RTH: reads R2 `live_flow/feed_current.json` → `aggregate_chain_heat` (pure) → **`live_flow/chain_heat_current.json`** (`options_flow.chain_heat/v1`). Fail-soft exit 0 (stale honest data beats a spinner). Current-day only, no history.
- **Unusual baseline:** `scripts/build_unusual_baseline.py` daily 16:30 → **`live_flow/unusual_baseline.json`** (`flow.unusual_baseline/v1`): per root `{mean_vol_30d, p95_vol_30d, sessions_used, null_reason}` over ~22 ETF anchors + extended roots, from the theta EOD store (RAM law: single-year, column-pruned reads). origin/main adds the canonical store resolver + **fail-loud refusal to publish an all-null baseline** (exit 1). Consumed by the live poller (`UNUSUAL_BASELINE=1`) to annotate `unusual_names` with `vol_baseline` fields; staleness >5 sessions → heuristic fallback.

### 3.6 Live-flow intraday plane (context for the EOD contract)

`scripts/live_flow_poller.py` (origin/main; R2 prefix `live_flow/`): `feed_current.json`, `heat_current.json`, `tide_current.json` (full-session cumulative NCP/NPP/gross/vol minutes + sector tide), `dte_tide_current.json` (5 DTE buckets), `tickers/{ROOT}.json` (top ~40 per-root drill), hourly `archive/` (48 h TTL), plus:
- **Dated tide archives** (`scripts/build_flow_archive.py`, OIP W0): `live_flow/tide/{DATE}.json`, `live_flow/dte_tide/{DATE}.json`, per-family `dates.json` (newest-first; **retention 30 sessions**; best-effort index — listed dates can 404, readers must tolerate). Same bytes as the current keys (the last write of the day IS the whole session because the payloads are cumulative).
- **Flow surface store** (`scripts/build_flow_surface.py`, consumed by the Terminal Surface tab replay): legacy today keys `live_flow/surface/{ROOT}/idx.json` + `{HHMM}.json` **and** date-keyed copies `live_flow/surface/{ROOT}/{DATE}/idx.json|{HHMM}.json` + `dates.json` — these are exactly the Terminal's **`surface_idx_at:{ROOT}:{DATE}` / `surface_at:{ROOT}:{DATE}:{STAMP}`** f-params (`terminal/lib/flowSource.ts` r2Key mapping; fixtures pin the shapes). SurfaceFrame = `{spot, price_levels[], time_steps[], grids{netprem, gex, dex, vanna, charm}[level][time], asof, cadence, metrics?, session_date?}` — **Lane G intraday greek grids** are computed from cycle tape NBBO mids ⋈ EOD t-1 OI via `engine/intraday_greeks` using the EOD dealer conventions. Surface roots: `SPY QQQ IWM` (config-extendable). **Retention 10 sessions** (`prune_surface_dates`, prune never touches legacy today-keys). Cadence honesty law: stamps carry the true write interval (120 s nominal).

### 3.7 Deep-history / research stores (per-date, the slice-3 raw material)

| Store | Producer | Grain | Depth (measured) | Notes |
|---|---|---|---|---|
| `data/polygon_gex/chains/{DATE}.parquet` | `scripts/build_polygon_gex.py` (daily collect) | **full per-contract chain** per date: `underlying, strike_ticker, expiry, K, T, is_call, oi, iv, gamma, delta, volume, spot, asof`; float32-compacted | 2026-06-15 → 2026-07-31 (41 files on origin/main; **370 underlyings, ~180k rows, ~5 MB/day**, committed to git, append-only) | The per-strike OI history "the Cboe path discards and that CANNOT be backfilled" |
| `data/polygon_gex/summary_{SYM}.parquet` | same | 1 scalar row/day (compute_gex SUMMARY_KEYS incl. `net_vex`, `net_cex`) | **403 names**, 2026-06-15 → 2026-07-31 (41 rows SPY) | feeds hub `history[]`, options screener, options stamps |
| `data/cboe/gex_{KEY}.parquet` | Cboe `GexAdapter` daily | 1 scalar row/day (same key set) | **10 keys only** (SPX SPY QQQ IWM NVDA TSLA AAPL AMD META MSFT); 2026-06-14 → 2026-07-29 (37 rows) | feeds the board's 40-session sparkline/iv-rank |
| `data/index_gex_history/{ROOT}.parquet` | `scripts/build_index_gex_history.py` (weekly, M1-only) | 1 scalar row/day, `SUMMARY_KEYS` + `reconstructed=True, root, source='thetadata_eod:greeks⋈oi'` | SPY/QQQ/IWM/DIA, **2017-01-03 → 2026-07-02, 2,388 rows** — **frozen at 2026-07-02 even on origin/main (2026-07-31)** | SPX/SPXW excluded (backfill state doesn't list them complete). Rebuilds the full chain per date via greeks⋈oi ⋈ the SAME `compute_gex`, then **discards the ladder, keeping scalars** |
| `data/options_surface/{index,sector,industry}_etf.parquet` | `scripts/build_options_surface.py` (W2; backfill + nightly accrual) | 1 row per (root,date): `net_gex_bn, net_vex, net_cex, front7_abs_charm_share, front7_abs_gex_share, total_abs_gamma_notional, oi_notional, fw/fm/bk_gex_bn, fw/fm_oi_frac, root_class, dealer_sign_assumption` | index_etf: **14,371 rows, 2017-01-03 → 2026-07-15**; roster = 6 index + 10 sector + 3 industry ETFs (single names scope-fenced) | whole-market dealer-surface aggregates, no ladders |
| `data/options_skew/snapshots.parquet` | `build_options_skew` daily | per (underlying,date) skew scalar | ~400 names | forward ledger for the gated validator |
| `data/options_ivspread/snapshots.parquet` | `build_options_ivspread` daily | per (underlying,date) C-W IV-spread | ~370 names | same |
| `data/options_flow/summary_{KEY}.parquet` | `build_options_flow` daily | 1 row/day measured signed flow (premium_mn, net_premium_mn, pc, 0DTE share, measured dealer gamma/delta flow) | ~353 names | + `site/flow/{KEY}.json`, `site/flow/index.json` |
| `data/signal_archive/options_gex.parquet` | archive_signals nightly | index-only scalars + lossless snapshot_json | 24 rows, 2026-06-28 → 2026-07-30 | keep-first PIT |

### 3.8 Vanna / charm / VEX / CHEX computation map

- **EOD engine (`engine/gex_engine.compute_gex`)** — the single shared pure function (live Cboe path, polygon path, AND the historical reconstruction): implies greeks from IV via `engine/greeks.bs_greeks` (never trusts vendor gamma), signs dealer long-call(+)/short-put(−), emits `net_gex_bn` ($/1% move /1e9), **`net_vex`** (vanna·OI·mult·S·0.01) and **`net_cex`** ((charm/365)·OI·mult·S), gamma-flip via ±25% spot-grid re-evaluation, magnets, charm_anchor, iv30, PCR, max-pain, top-OI share, thin-chain tiering, and the regime **passport** (single-name regime = near-constant product attribute; index set = `SPX SPY QQQ NDX IWM RUT VIX DIA SPXW`).
- **Hub per-strike (`engine/options_hub.compute_gex`)** — per-strike `gamma/delta/vanna/charm` nets from the ThetaData greeks store ⋈ OI[t-1] (vendor greeks here, BS fallback), aggregated per strike and per expiry.
- **VEX board (`engine/vex_engine.compute_vex`)** — vega-weighted sibling payload.
- **Intraday (`engine/intraday_greeks.compute_greek_grids`)** — solves IV from tape NBBO mids, then GEX/DEX/VANNA/CHARM per strike for the surface grids, mirroring the EOD conventions.
- **W2 surface (`engine/options_surface`)** — net_gex/vex/cex + |·|-magnitude front-week shares per (root,date).

---

## 4. Index-only vs single-name (honesty boundaries)

- **Index-only (validatable slice):** the signal_archive `options_gex` snapshot (7 index/ETF keys); `index_gex_history` reconstruction (SPY/QQQ/IWM/DIA); `market_gamma` regime banner (SPX store + SPY percentile context with staleness disclosure ≥7 sessions); gex_state `deep_history` block; W2 surface roster (ETFs only, single_name scope-fenced).
- **Single-name covered but assumption-flagged:** hub `gex/vol/vex/moves/levels/gex_history` (~380+ store roots), matrix (10 roots incl. 8 single names), polygon chains/summaries (370–403 names), skew/ivspread/flow/screener stores, gex board (~313 incl. theme members, honesty-gated). Every one carries the dealer-sign passport/`convention`; the board suppresses theme members with thin/concentrated chains; single-name regime is display-only by law (structurally-constant product attribute).

---

## 5. Complete R2 key inventory for options data (writers in this repo)

**Bucket** `mastermindx` (env `R2_BUCKET`), S3 API via `R2_ENDPOINT/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY`; public read base `https://pub-f7ffb4441c5f4ad983ca56ec7c651c61.r2.dev` (403s non-browser UAs for some prefixes).

| Prefix / key | Writer | Cadence | Dated history? |
|---|---|---|---|
| `options_hub/vol|gex|vex|moves|tickers_ctx/{ROOT}.json` | hub nightly | daily 16:45 | overwrite |
| `options_hub/gex_history/{ROOT}/{DATE}.json` | hub nightly (WP-GEX-SNAPSHOTS) | daily | **YES — verified live since 2026-07-17 (holes 07-18, 07-20); no index; unbounded retention** |
| `options_hub/oi_movers|hot_contracts|context|oi_confirmed.json` | hub nightly (+incremental every 50 roots) | daily | overwrite |
| `levels/{ROOT}.json` | hub nightly via `engine/levels_publish` | daily | overwrite |
| `options_structure/matrix/{ROOT}.json` | `build_options_matrix` | daily 16:00 | overwrite |
| `options_structure/gex_state/{ROOT}.json` | `mirror_gex_state_r2` (end of matrix lane) | daily | overwrite |
| `live_flow/feed_current|heat_current|tide_current|dte_tide_current.json`, `live_flow/tickers/{ROOT}.json` | live poller | per cycle | overwrite |
| `live_flow/archive/…` | poller | hourly | 48 h TTL |
| `live_flow/tide/{DATE}.json`, `live_flow/dte_tide/{DATE}.json`, `…/dates.json` | poller via `build_flow_archive` | per cycle (same bytes) | **30 sessions** |
| `live_flow/surface/{ROOT}/idx.json`, `{HHMM}.json` | poller via `build_flow_surface` | per cycle | overwrite (today) |
| `live_flow/surface/{ROOT}/{DATE}/idx.json`, `{DATE}/{HHMM}.json`, `…/dates.json` | same | per cycle | **10 sessions** (`prune_surface_dates`) |
| `live_flow/chain_heat_current.json` | `build_chain_heat` | 5 min RTH | overwrite |
| `live_flow/unusual_baseline.json` | `build_unusual_baseline` | daily 16:30 | overwrite |
| `live_flow/flow_idx.json`, `flowleaders/leaders.json`, `leaderradar/radar.json` | `mirror_flow_idx` | daily lanes | overwrite |
| `thetadata_eod/{eod,oi,greeks}/{ROOT}/{YYYY}.parquet` + `_manifest.json` | `publish_r2 --dirs thetadata_eod` (r2sync 22:00) | nightly delta (~1.7 GB) | the store IS history (2012→); offsite backup role |
| `index_gex_history/{ROOT}.parquet` + `_manifest.json` | `publish_r2 --dirs index_gex_history` (ops lane, explicit) | weekly | offsite copy of the committed parquets; append-only fences (min-files 5, min-bytes 600 KB, per-file no-shrink) + builder-side `shrink_verdict` refusing row-count/end-date regressions |
| terminal context mirrors | `mirror_terminal_context_r2` | — | overwrite |

**Freshness tripwires:** `audit_r2` anchors (config `r2_data_plane.anchors`) = `stockdata, chinastockdata, feeds, thetadata_eod` (26 h budget). **No options_hub/ or live_flow/ key is an audit_r2 anchor** — EOD options-plane freshness is only surfaced by the Terminal's staleness chips and the hub lane's own logs (this is why the gex_history holes went unnoticed).

---

## 6. Macro front-end consumers (this repo's own pages)

- **`site/gex.html`** (templates/gex.html.j2 + site/gex.js) — the Options Desk board; on-demand fetch of `site/gex/{KEY}.json`; manifest-driven board/search; group coverage honesty; per-symbol regime/walls/profile/surface heatmap/smile/term/tilt/expected-move + 40-session sparkline.
- **`site/options_screener.html`** (`build_options_screener`) — cross-sectional screener over `polygon_gex/summary_*` (384 names), `options_flow/summary_*` (353), skew + ivspread snapshots, tape_flow; coverage + young-history stamps.
- **`site/flow_desk.html`** / **`site/flow_velocity.html`** (`build_flow_desk`, `build_flow_velocity`) — group flow heatmap/market tide + velocity, from `options_flow` summaries + `site/flow/index.json` + tape_flow + ETF flow proxies.
- **`site/flow/{KEY}.json` + index.json** (`build_options_flow`) — measured (tick-rule signed) dealer positioning per name; divergence-from-assumption surfaced.
- Options stamps ride the US board ledger (`retro_grades.parquet` `opt_*` columns: gamma regime, dist-to-flip, walls, iv30, ΔOI slope, VOI flag, skew/ivspread + 5d changes, opex distance, wall-dist, pin-risk, vanna-relief, front7 charm share, root class, tape-flow stamps) — research/calibration surfaces, not a page per se.
- The **Terminal** (charting-app) consumes the R2 planes via `/api/flow` f-params (`gex`, `vol`, `tide`, `feed`, `surface_idx[_at]`, `surface[_at]`, `gexstate`, `levels`, `matrix`, `heat`, …) — the macro repo is the sole producer.

---

## 7. Slice-3 (full per-date by-strike ladders) — current truth and the closing plan

**Correction to the program memory (verified against live R2 2026-07-31):** the claim "full per-strike ladder for past dates is NOT persisted/published anywhere" is **stale**. `options_hub/gex_history/{ROOT}/{DATE}.json` (WP-GEX-SNAPSHOTS, merged 2026-07-16, PR #2615) has been accruing dated per-strike GEX snapshots since **2026-07-17**. The 2026-07-26 verification guessed the wrong key shape (`options_hub/gex/{DATE}/{ROOT}.json`) and concluded 404. Verified content (SPY 2026-07-30): `by_strike` = 160 rows × `{strike, gamma_net, gamma_call, gamma_put, delta_net, vanna_net, charm_net}`, `by_expiry` = 34 rows, walls/flip/net_gex_bn/spot_ref/coverage + 30-row scalar history — i.e. **GEX/DEX/VEX/CHEX ladder replay per date is already materially possible from 2026-07-17 forward, for every hub root (single names included)**.

**What is still missing, and what closing slice 3 requires:**

1. **Backfill before 2026-07-17.** Three sources, in order of depth:
   - *2017→ (index ETFs only):* extend `scripts/build_index_gex_history.py` — it already rebuilds the full per-strike chain per date (greeks⋈oi) and feeds the exact live `compute_gex`; today it throws the ladder away (`SUMMARY_KEYS` scalars). Persist, per (root,date), the by-strike ladder in the `options_hub.gex/v1` field shape (reuse `engine/options_hub.compute_gex`'s windowing so bytes are comparable with the live payload) and publish under the SAME dated key family. Host-bound (M1 weekly lane), ~2,400 sessions × 4 roots × ~25–40 KB ≈ 300–400 MB of R2 — trivial. Index-only per the honesty boundary; stamp `reconstructed: true`.
   - *2026-06-15→ (370 single names + indices):* `data/polygon_gex/chains/{DATE}.parquet` already holds full per-contract chains per date (committed, ~5 MB/day) — a local re-run of the hub per-strike aggregation per date can backfill six weeks of single-name ladders if wanted (mixed-source caveat: Polygon vs ThetaData greeks).
   - *2012/2017→ any of 380 roots:* the 60 GB theta store itself (greeks 2017→) — same join as index history, bounded by compute budget only.
2. **Validation gate before exposure** (the program's own honesty law): `audit_overlap` already measures scalar agreement vs live (0.94–0.998 same-spot net-GEX corr claimed); extend it ladder-level (per-strike rank corr / wall agreement on the 2026-07-17→ overlap where both reconstructed and live dated snapshots exist). Do NOT ship a date picker over unvalidated reconstruction.
3. **A dates index + retention decision.** `gex_history/` has no `dates.json`; consumers must probe blind. Mirror the `build_flow_surface` conventions (`dates.json` newest-first, `is_session_date` guard, prune fences). EOD ladders are small — keep-forever is affordable, but decide explicitly.
4. **Accrual reliability + tripwire.** Two holes in the first ten sessions (07-18, 07-20). The hub lane needs (a) a next-run self-heal that re-publishes missed session dates from the store, and (b) an `audit_r2`-style freshness anchor for `options_hub/` (currently none).
5. **Windowed vs full ladder decision.** The dated snapshot inherits the live payload's ±20%/160-strike window (`by_strike_full_n` 482 for SPY discloses the cut). For scrubber parity that's exactly right (byte-identical to what the live board shows); for research-grade replay (deep wings, per-(strike,expiry) matrices), a separate dated artifact would be needed — note `options_structure/matrix/{ROOT}.json` (the only per-(strike,expiry) surface) is overwrite-only, 10 roots, no history; and the board's `site/gex/{KEY}.json` surface heatmap is likewise overwritten daily.
6. **Terminal wiring (charting-app side, out of macro scope):** no `gex_at:{ROOT}:{DATE}` f-param exists yet (`git grep gex_history origin/master -- terminal/` = empty). Needed: flowSource.ts f-param + r2Key mapping mirroring `surface_at:`, a session `<select>`/date picker on GexDeskView, fixture + redate logic.
7. **Contract hygiene for backfilled writes:** session-filter every date through `lib/nyse_calendar` (both stores hold real weekend/holiday rows — 11/39 chains files are non-session), respect OI-vintage integrity (`same_vintage` guard from `positioning_persistence` — consecutive OI snapshots can be byte-identical), key by session date never wall clock, and never write empty ladders (all already-established laws in this codebase).

---

## 8. Notable risks / open findings

1. **`data/index_gex_history` is frozen at 2026-07-02** on origin/main as of 2026-07-31 despite the weekly Sunday lane (`com.macro.indexgexhistory.plist`) and the E3c resolver work landing 2026-07-29 — either the lane hasn't fired/pushed since, or its commit leg is failing. `market_gamma`'s window-disclosure (staleness ≥7 sessions) is the only consumer-side mitigation; the deep_history block now prints the lag, but the series itself isn't advancing. Worth checking `/tmp` logs on the M1.
2. **gex_history accrual holes** (2026-07-18, 07-20 SPY 404) — no tripwire, no self-heal; the plane silently loses sessions.
3. **No options-plane freshness anchor in audit_r2** — `options_hub/`, `live_flow/`, `levels/`, `options_structure/` all lack a dead-man's switch (config anchors are stockdata/chinastockdata/feeds/thetadata_eod only).
4. **The stale slice-3 memory note** in `options-suite-parity-program.md` should be corrected (dated per-strike keys exist and are live; the guessed key shape was wrong).
5. **The working tree** of this repo is a 17-day-old detached HEAD; any audit or edit made against it (rather than origin/main) will re-litigate already-shipped work (this audit nearly did — e.g. surface lane, WP-GEX-SNAPSHOTS, resolver hardening all absent locally).
6. **Two-source scalar history duplication**: hub `history[]` (polygon_gex summaries, 2026-06-15→, 403 names) vs board sparkline (cboe `gex_{KEY}`, 10 names) vs `index_gex_history` (theta reconstruction, 4 names, 2017→) — three separately-cadenced scalar GEX histories with different signs-of-freshness; the hub payload at least discloses `history_asof` divergence.
7. `signal_archive`'s flatten-scalars law means ladders can never ride the archive path by design — the R2 dated-key plane (gex_history / surface / tide) is the sanctioned ladder history mechanism; keep them separate.
