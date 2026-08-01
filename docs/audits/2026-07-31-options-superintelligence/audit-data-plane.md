# Options Data-Plane Reality Audit — 2026-07-31 (read-only)

Auditor: subagent, read-only. Machines: this box = **M2 Ultra workstation** (`Mac-Studio.ts.net`), remote = **M1 Max server** (`ssh m1`, reachable, BatchMode OK). No state was modified anywhere.

---

## 1. Topology as of today: the M2→M1 migration is COMPLETE for the options plane

`launchctl list | grep -iE "mastermind|macro"` **on this M2** shows only:

```
actions.runner.…mac-builder-light / -4 / -5   (GitHub CI runners)
com.macro.mem-sentinel
```

Every data-plane job has been booted off the M2. The parked plists live in
`/Users/chriswong/dataplane-migration/`:

- `m2-disabled-groupA/` — the whole options core: `com.macro.{extquotes, optionsmatrix, theme-options-witness, theta-staleness, theta-terminal, thetadata-backfill, thetadata-r2sync, unusualbaseline}` + `com.mastermind.{flowenrich, levelsgrader, levelsseal, liveflow, optionshub, prophetmarks}`
- `m2-disabled-groupB/` — cnhk, cnhk-watch, fund
- `m2-disabled-groupC/` — macro-live, live-breadth
- `m2-disabled-groupD/` — bot, bottunnel, statesync
- `m2-dead/` — **`com.macro.chainheat.plist` only** (see §5 — this lane was killed, not migrated)
- rollback-group{A..D}-to-M2.sh scripts exist for instant rollback.

`ssh m1 'launchctl list'` confirms all of the above (minus chainheat) are installed and loaded on the M1, including live pids: `com.macro.theta-terminal` (pid 17083), `com.macro.thetadata-backfill` (pid 67169, actively pulling SOXX eod windows at 17:15 local today), `com.mastermind.optionshub` (pid 81338), plus 3 GH runners, statesync, bot, macro-live. Non-zero last-exit statuses on M1 worth noting: **`com.mastermind.levelsseal` = 4**, **`com.macro.thetadata-r2sync` = 1**, `com.mastermind.bottunnel` = 255.

Worktrees: `~/liveflow-ops-wt`, `~/flow-ops-wt`, `~/hub-ops-wt`, `~/fund-ops-wt` exist on BOTH machines (M1 copies refreshed; `.orphaned-20260730*` snapshots of the pre-migration M1 copies kept alongside). **`~/chainheat-ops-wt` and `~/theta-ops-wt` do NOT exist on this M2 at all** — `theta-ops-wt` lives only on the M1 (it is the store owner), `chainheat-ops-wt` exists on neither machine (deleted).

---

## 2. `~/liveflow-ops-wt/scripts/live_flow_poller.py` (1,813 lines) — the "live" flow lane

Runs on M1 as `com.mastermind.liveflow`: `plane`-env python `-m scripts.live_flow_poller --rth-only`, StartCalendarInterval weekdays 06:25 **local (M1 is Pacific)** = 09:25 ET, KeepAlive 0; poller self-exits outside 09:25–16:05 ET.

### Cadence: target vs mechanism vs reality
- Config (`config.yml live_flow:` block): `cadence_sec: 120` target, `max_concurrent: 2` ("HARD LAW — T1 backfill shares the terminal's 8-request cap"), `near_dte_cap_days: 90`, `top_names: 100`, `retention_hours: 24`.
- Mechanism: while-loop; per cycle fetch call+put `bulk_trade_quote` per root (2 requests/root) through a ThreadPoolExecutor capped at 2; then `sleep(max(0, cadence − elapsed))` — i.e. when a cycle overruns 120 s it just runs back-to-back.
- **Measured reality (live `meta.json`, asof 2026-07-31T19:22:57Z = 15:22 ET today):**
  ```
  cadence_sec_target: 120   cadence_sec_measured: 2880.1  (~48 minutes)
  universe_n: 122  roots_polled: 122  requests_last_cycle: 244
  delta_mode: full_day  two_tier: False  max_concurrent: 2
  notes: "Incremental time-window pulls not supported on this terminal;
          using full-day re-pull each cycle."
  ```
  So the "live" tape is a **~48-minute full-day re-pull loop** (slightly better than the ~59 min measured 2026-07-24, still ~24× off target).

### Incremental time-window pulls: implemented but INERT
- A real incremental path exists: `_probe_delta_mode()` probes SPY full-day vs a 14:30–14:45 window at startup; if the window returns fewer rows → `delta_mode="time_window"`, and `run_cycle` then uses **per-root watermarks** (`{ts, seq}`, 30 s overlap re-fetch, sequence-dedup) so each cycle pulls only new trades. The collector supports `start_time`/`end_time` ("HH:MM:SS.mmm" ET).
- The probe **fails on the deployed ThetaTerminalv3.jar** (M1: `/Users/chriswong/theta/ThetaTerminalv3.jar`, 42 MB, dated Jul 4) — time filters don't reduce rows, so every cycle falls back to `full_day`. The cadence fix is therefore a terminal-build/vendor question, not poller code.
- Second wart: current-day wildcard-expiration is rejected by v3 ("Cannot fetch current-day data without specifying an expiration") → `_bulk_trade_quote_per_exp` fallback iterates each unexpired expiration **sequentially** per root (capped to ≤90 DTE via `near_dte_cap_days`) — this is the main reason a cycle costs ~17 s/root.

### Root universe
- `_resolve_universe()` = 22 ETF anchors (SPY QQQ IWM GLD SLV TLT HYG XLF XLE XLU XLK XLV XLI XLB XLY XLP XLRE KRE SMH XBI ARKK DIA) + `top_names: 100` from `engine.options_universe.gex_symbols()` (config anchors + baskets, cap 400) → **122 roots live** vs the ~360–380-root full GEX universe.
- FC-R6 two-tier cadence (tier-1 = 33 roots incl. Mag7 + MU/WDC/STX/SNDK every cycle, tier-2 round-robin in 4 buckets) is fully coded but **DEFAULT OFF** (`LIVE_FLOW_TWO_TIER` unset in the M1 plist → `two_tier: False` in meta).
- Pinned-publish (default ON) guarantees SPY/QQQ/SMH + Mag7 + memory names appear in the published ticker JSONs even outside the top-40-by-gross.

### Columns/conditions dropped at ingestion
The v3 `trade_quote` CSV carries 23 columns:
```
symbol,expiration,strike,right,trade_timestamp,quote_timestamp,sequence,
ext_condition1..4,condition,size,exchange,price,
bid_size,bid_exchange,bid,bid_condition,ask_size,ask_exchange,ask,ask_condition
```
`bulk_trade_quote._parse_rows` keeps `date, trade_timestamp, quote_timestamp, sequence, expiration, strike, right, price, size, exchange, bid, ask` and **discards: `ext_condition1–4`, `condition`, `bid_size`, `ask_size`, `bid_exchange`, `ask_exchange`, `bid_condition`, `ask_condition`.** (The narrower `_normalize_trade_quote_df` used elsewhere keeps even less — no sequence/exchange/quote_timestamp.) So **OPRA trade-condition codes are thrown away before anything downstream can see them**; NBBO *sizes* are also lost. NBBO *prices* at execution ARE retained → quote-rule signing works (see §7).

### Per-cycle outputs (local `data/live_flow_out/` → R2 `live_flow/` prefix)
`feed_current.json`, `heat_current.json`, `meta.json`, `tide_current.json`, `dte_tide_current.json`, `tickers/{ROOT}.json` (top ~40 + pinned), hourly archives `live_flow/archive/YYYYMMDDTHH.json`, optional `live_flow_daily/` summary (env-gated, OFF). Lane G "flow surface": per-strike net-premium grids + snapshot-greek grids for 3 surface roots (SPY/QQQ/IWM; `surface_greek_quote_sec: 2.17` per cycle), OI-weighted by cached EOD t-1 OI from the ThetaData store.

R2 artifacts verified fresh today: `tide_current.json` asof 2026-07-31T19:22:57Z; `enrich_current.json` asof 2026-08-01T00:13:32Z.

---

## 3. `~/flow-ops-wt/scripts` — the enrichment/publish satellites (all launchd on M1)

| Script | One line | Schedule (M1 plist) |
|---|---|---|
| `build_flow_enrich.py` | Reads `live_flow/feed_current.json` + samples hourly archives to build trailing threshold pools, runs `engine.flow_enrich`, publishes `live_flow/enrich_current.json` (elite/strong/high/medium tiers). | `com.mastermind.flowenrich`, **every 300 s** |
| `build_options_matrix.py` | One-shot strike×expiry `options_structure.matrix/v1` per root **from the ThetaData EOD store** → R2 `options_structure/matrix/<ROOT>.json`. | `com.macro.optionsmatrix` via `run_options_matrix.sh` (freshness-gated), weekdays 16:00 |
| `build_unusual_baseline.py` | Per-root 30-session option-volume baseline (+per-contract where cheap, RAM-law column-pruned store reads) → `live_flow/unusual_baseline.json`; feeds the UNUSUAL lens accrual. | `com.macro.unusualbaseline`, weekdays 16:30 |
| `publish_r2.py --dirs thetadata_eod` | The **thetadata-r2sync** job: md5-delta mirror of the 60 GB EOD store to R2 bucket `mastermindx` (13,126 files; ~2,200 changed/night). | `com.macro.thetadata-r2sync`, daily 22:00 |
| `build_prophet_marks.py` | Live premium marks for active Prophet plans: per-contract v3 quotes (wildcard rejected current-day, #1774) → `live_flow/prophet_marks.json`; RTH-only. | `com.mastermind.prophetmarks` via 5-min loop wrapper, 09:25 weekdays |
| also present | `build_chain_heat.py` (orphaned — see §5), `chain_snapshot_poller.py` (see §6), `calibrate_flow_signing.py`, `repair_thetadata_dedup.py`, `backfill_thetadata_eod.py`, `audit_thetadata_accrual.py`, `rerun_options_gates_thetadata.py`, `build_darkpool_desk.py` | — |

`com.macro.theme-options-witness` (17:15) and `com.macro.extquotes` also run out of flow-ops-wt.

## 4. `~/hub-ops-wt/scripts` — Options Hub / Levels lanes (M1)

| Script | One line | Schedule |
|---|---|---|
| `build_options_hub_nightly.py` | Nightly per-root **vol + GEX payloads** + cross-root OI movers/hot contracts from store greeks (OI-timing law: OI[t-1]) → `options_hub/` R2 prefix. Default roots = "all roots with greeks in the T1 store". | `com.mastermind.optionshub`, weekdays 16:45, `HUB_ROOT_BUDGET_S=420`, `THETADATA_STORE=/Users/chriswong/theta-ops-wt/data/thetadata_eod` |
| `seal_levels_ledger.py` | Voltick Gamma-Levels WP-C3: pre-open compute of each root's named-level board from greeks + t-1 OI, SHA-256 sealed to a public manifest. | `com.mastermind.levelsseal` via `levels_seal_preopen.sh`, weekdays 04:30 + 06:00 PT |
| `levels_grader_daily.sh` → grader | WP-C1: grade sealed boards after close; year-chunk backfill 2026→2017 then rolling 14-day re-grade; upserts `grades.parquet`. | `com.mastermind.levelsgrader`, daily 18:00 |
| also | `build_gex_board.py`, `build_polygon_gex.py`, `build_index_gex_history.py` (reconstructs historical chains from the greek surface but summarizes to scalars), `build_levels.py`, `build_levels_track_record.py`, `build_levels_trust_index.py`, `mirror_gex_state_r2.py`, `validate_gex.py` | — |

⚠️ **levelsseal is currently degraded**: last-exit 4; stderr shows `nothing to seal for 2026-07-29 (12 roots skipped — no reconstructable board)` and the same for 2026-07-30 — the pre-open seal has produced **zero boards for the last two sessions**. (Cause not diagnosed here; consistent with greeks/OI for t-1 not being in the store by 04:30 PT.)

⚠️ **thetadata-r2sync**: exit 1 = recurring transient multipart-upload failures (1–12 files/night, "Connection was closed…"); the md5 delta retries next run and the manifest is correctly withheld, so it self-heals but has not run clean for ≥4 nights.

## 5. `~/chainheat-ops-wt` — DEAD LANE, and its artifact is stale in prod

- The worktree exists on neither machine; the plist sits in `dataplane-migration/m2-dead/` (was: `scripts.build_chain_heat` every 5 min market hours, aggregating `feed_current.json` sweep clusters → `live_flow/chain_heat_current.json`). It was **never reinstalled on the M1**.
- Live check: R2 `live_flow/chain_heat_current.json` **asof = 2026-07-23T18:50:12Z — 8 days stale**, while the Terminal's Flow Desk still polls chain-heat every 45 s client-side. The Chain-Heat rail has been silently serving week-old campaigns since the migration. (`build_chain_heat.py` still exists in `~/flow-ops-wt/scripts` — relighting it is a plist re-point, not a rebuild.)

## 6. `~/theta-ops-wt` (M1-only) — Theta Terminal + the EOD store

- `com.macro.theta-terminal` keepalive runs `ThetaTerminalv3.jar` (port 25503 watchdog logic); `com.macro.theta-staleness` sentinel 06:15/18:30; `com.macro.thetadata-backfill` keepalive with a 20:10-UTC timing gate so heavy pulls never fight the RTH poller.
- **Backfill refresh contract (the old GEX "no strike data" scheduler bug is FIXED):** the keepalive now unmarks and re-pulls **22 ETF anchors (`SPY…SPX,SPXW`) + ~25 curated liquid single names (`NVDA,TSLA,AAPL,…SOFI,UBER`)** every post-close pass, then resumes the bare ~360-root universe pass. Comment in the script explicitly records the old failure: "Single names were previously NEVER unmarked, so the GEX desk had index ETFs only."
- **Store**: `~/theta-ops-wt/data/thetadata_eod` on M1 is a **symlink → `/Users/chriswong/flow-ops-wt/data/thetadata_eod`** (the reverse of the old M2 topology; every consumer plist pins `THETADATA_STORE` to the theta-ops-wt path so the symlink is load-bearing). The M2 copies of `data/thetadata_eod` in all three local worktrees are **8 KB empty stubs** (n_roots 0) — this workstation no longer holds the data.
- **Size/coverage (measured on M1 today)**: total **60 GB** = `eod/` 7.3 G + `greeks/` **51 G** + `oi/` 1.9 G; **380 root dirs on disk / 383 in `_manifest.json`** (updated today 17:07); layout = `{tier}/{ROOT}/{YYYY}.parquet`. SPY: eod 2012–2026 (15 files), **greeks 2017–2026 (10 files)**, oi 2012–2026.
- **Greeks surface schema** (SPY/2026.parquet, 1.89 M rows for 2026 YTD): `root, expiration, strike, right, date, bid, ask, underlying_price, delta, theta, vega, rho, epsilon, lambda, implied_vol, iv_error, gamma, vanna, charm, vomma, veta, vera, speed, zomma, color, ultima` — full 1st/2nd/3rd-order EOD surface + IV, one row per contract per day. `eod/` schema: OHLCV + count + closing bid/ask.

## 7. ThetaData client usage today vs PROFESSIONAL entitlement

Collector header states the account plainly: **"Account: Options: PROFESSIONAL; Max concurrent requests: 8"** (`collectors/thetadata.py:32`).

**Endpoints called today** (all `/v3/option/...`, localhost terminal):
- `list/symbols` (reachability), `list/expirations`
- `history/eod` → `bulk_eod()` (nightly backfill)
- `history/open_interest` → `bulk_open_interest()`
- `history/greeks/eod` → `bulk_greeks()` (the 51 GB surface; day-at-a-time wildcard)
- `history/trade_quote` → `bulk_trade_quote()` (live poller; wildcard exp+strike, per-exp current-day fallback) and `trade_quote()` (per-contract, prophet marks / signing calibration)
- `snapshot/greeks/first_order` + `second_order`, `snapshot/open_interest` → `snapshot_greeks()`, `snapshot_open_interest()` (full live chain in ~1 s; used by the poller's 3-root surface lane and the U-CHAIN poller)

**PROFESSIONAL capabilities NOT exploited:**
1. **Intraday/streaming greeks** — `/greeks/all` streams 1-second snapshots but the client found all `interval` values rejected on this terminal build (probe note 2026-07-04, "VERIFY on our tier" still open); nothing subscribes to ThetaData's websocket/MDDS stream at all.
2. **Trade conditions / full OPRA condition codes** — delivered in every trade_quote row and **dropped at parse** (§2).
3. **Full-universe live tape** — entitlement covers ~380 roots; the poller polls 122 and can't even keep those under 5 minutes on this terminal build.
4. NBBO depth (bid_size/ask_size) — delivered, dropped.

## 8. What exists TODAY for the four Phase-2 capability questions

| Capability | Today's reality |
|---|---|
| **1-minute intraday snapshots** | **None.** Closest: (a) the ~48-min live_flow cycle artifacts + hourly R2 archives; (b) the **U-CHAIN 15-min chain-snapshot lane** (`chain_snapshot_poller.py` — full-chain 1st+2nd-order greeks per ~150 roots to per-root/day parquet) is fully authored with a plist `com.mastermind.chainsnapshots` in repo ops/, but the plist targets a **nonexistent `~/chainsnap-ops-wt`** and is **installed on neither machine — the lane has never run**; (c) GEX history = nightly scalars only (net_gex_bn, flip, walls) — no by-strike history persisted. |
| **Per-trade greeks** | **None.** Greeks exist as (a) EOD per-contract surface (51 GB, t-1), (b) live full-chain snapshots for the 3 surface roots each poller cycle. No greek is attached to individual trade events; QuantData attaches 15 greeks per print in real time. |
| **Trade-condition / sentiment (exec-vs-NBBO) classification** | **Half-exists.** Condition codes: discarded at ingestion (§2) — no sweep/block/auction/cross classification is possible until the parser keeps them. Exec-vs-NBBO: the NBBO at execution IS kept, and `engine/flow_signing.quote_rule_sign` applies Lee-Ready (above mid = +1, below = −1, tick-test fallback; `signing_source="tape"`, soft "~buy/~sell") — but it is a **binary sign vs mid**, not QuantData's 5-tier Below-Bid/Bid/Mid/Ask/Above-Ask ladder. The 5-tier ladder is computable from data already retained (price vs bid/ask); it simply isn't computed or persisted. |
| **Dark-pool prints** | **None live.** `build_darkpool_desk.py` is explicit: FINRA CNMS daily short-volume ("NOT 'dark pool prints', NOT 'live'") + weekly OTC-ATS breakdown with a 2–4-week-lag chip. ThetaData doesn't cover TRF prints; a Polygon-TRF or Databento feed remains the only route (per `docs/DATABENTO_INTEGRATION_DESIGN.md`). |

## 9. Punch list surfaced by this audit (no changes made)

1. **Chain-heat lane is dead and its prod artifact is 8 days stale** — highest-visibility regression from the migration; relight = point the parked plist at `flow-ops-wt` (script already there) and bootstrap on M1.
2. **levelsseal has sealed nothing for 2 sessions** ("no reconstructable board", exit 4) — diagnose store freshness at 04:30 PT.
3. The cadence blocker is the **terminal build's rejection of time-window filtering** (poller-side incremental machinery + watermarks are ready); a terminal upgrade/vendor ticket is the unlock, then `LIVE_FLOW_TWO_TIER=1` covers the 122→380 expansion within budget.
4. Keeping `condition`/`ext_condition1–4`/`bid_size`/`ask_size` in `_parse_rows` is a small parser change that unblocks the entire sentiment/Filter-Group vocabulary later — currently the data is fetched and thrown away every cycle.
5. U-CHAIN chain snapshots: creating `~/chainsnap-ops-wt` (or re-pointing the plist) is all that stands between the repo and a 15-min intraday greeks plane it already knows how to build.
6. thetadata-r2sync's nightly 1-file multipart failures self-heal but deserve a retry/backoff tweak eventually.
