# Signal / Analysis Stack Audit — everything that could feed a unified "superintelligent Prophet"

Audited 2026-07-31 (read-only).

- **Terminal repo** (worktree of charting-app): `/Users/chriswong/Documents/Cluade/charting-app/.claude/worktrees/terminal-chinese-text-crypto-323a48` — working tree current (branch `claude/quantdata-terminal-options-gaps-33ceb8` off master `5b653977`).
- **Macro Dashboard**: `/Users/chriswong/Documents/Cluade/Macro Dashboard` — ⚠️ the local working tree is **detached at `5c90bf15229` (2026-07-14), 17 days stale**. Everything macro-side in this audit was read from **`origin/main` @ `bb0e422f635` (2026-07-31)** via `git show`, per the `neural-web-read-layer` audit-trap memory.

Legend used per system: **{inputs → algorithm → outputs+schema → cadence → rendered where}**.

---

## PART 1 — Terminal (charting-app) signal stack

### 1.1 `signal_layer/` (repo top level; Python — the Golden Oracle engine)

| file | lines | role |
|---|---|---|
| `signal_layer/confluence.py` | 456 | THE oracle: faithful TV-anchored Pine port ("RSI-MACD × StochRSI MTF" on 3D bars) + as-traded simulator |
| `signal_layer/confluence_v2.py` | 696 | GC-v2 emitter: no-cut scored streams, keeper quality, recipe tier, early dots, ARM/CONFIRM warns, reclaim lane |
| `signal_layer/contracts.py` | 441 | `mastermind.indicator/v1` + `backtest_result/v1` doc builders, `model_slice()` guardrail |
| `signal_layer/golden_gate.py` | 235 | inverted parity gate vs the macro repo's exported canon vectors |
| `signal_layer/backtest.py` | 252 | contract-shaped backtest runner (costs, `use_reclaim_entry`) |
| `signal_layer/seasonal_regime.py` | 592 | regime-aware seasonal outlook engine (24 pre-registered semi-monthly buckets, analog years, LOYO validation) |
| `signal_layer/regime_calendar.py` | 156 | curated 1970–2027 US regime calendar (cycle_pos, NBER recession, rate_dir, anomaly flags) |
| `signal_layer/reclaim_lab.py` | 159 | panel evaluator that promoted the reclaim lane (G1–G5 gates) |

**confluence.py** — inputs: daily closes from `<SYM>.json` (Terminal data dir) or macro deep store `$MACRO_REPO/data/stocks/<SYM>.parquet` (env `MACRO_REPO`). Algorithm: Wilder-RMA RSI(14) → "RSI-based MACD" (EMA14−EMA60 of RSI, signal EMA5) × StochRSI(14,14,3,3) on **session-grouped 3D bars phased to IPO** (`ipo_bar_anchor`, verified 5/5 vs TradingView), leak-free weekly confirm gate (searchsorted, not shift+ffill), monthly + 2W (parity-phased) gates. Emits CB (confirmed buy), CS, revBuy/revSell, plus the two regime fixes: `bear_block` (monthly-bear & <200d & 2W-not-bull blocks new longs) and `strong_bull` (weekly+monthly bull & >200d holds through oscillator sells). `known_ts` availability-date column rides every row (a signal printed mid-3D-bar is never presented as knowable at bar open).

**confluence_v2.py (GC-v2)** — composes (never edits) the oracle frame:
- **SCORED** stream: enter `(CB|revBuy)&~bear_block`, exit `CS&~strong_bull` **only** — revSell demoted to display (the no-cut X1 win: WR 51.4→56.5, expectancy +48%).
- **KEEPER** (display quality per BUY/REBUY): `take/block/pending` — bearish-divergence veto + reclaim-and-hold confirmation, verbatim port of macro `research/signal_engine/buy_filters.py`.
- **RECIPE** (graded tier): 0–100 score from 6 legs (washout 25 w/ sector-cohort frac ≥0.40, rs_inflection 20, anti_chase 20, structure 15, volume 10, monthly 10) with hard vetoes (dist60>0.15, monthly dwell ≥6, RS-both-falling, sector-fresh-low) → tier `aplus(≥80)/quality(≥65)/base`; vetoed bars can never grade (score-not-gate law). Volume/cohort-missing → `score_basis:"partial"` (CN/HK close-only names still get the full surface).
- **early_dots** (GRID_GATE form a, ~4.6d lead), **warn_events** ⚠ARM/⛔CONFIRM (armed distribution + confirmed swing-low structure break; CONFIRM events are also THE source of the unified-stream SELL), **reclaim_events** (TREND-RECLAIM debounce 4 bars / BLOCK-REPAIR window 8 bars — scored since 2026-07-16 promotion), with `reclaim_eligible` name/ticker symbol-class exclusion for decay instruments (levered/inverse/VIX/futures wrappers; `_TICKER_BACKSTOP` = UVXY/SVXY/VIXY/VXX/TVIX/VIXM/USO/UNG).

**contracts.py** — the unified signal stream is **BUY + REBUY + SELL(+RECLAIM)** ordered by bar_index; CS/CUT are sim-internal only. Raw buys the v2 logic refused get `quality:"regime_blocked"` and must never anchor a verdict or flip `position_hint`. `state{}` = `{position_hint, last_signal, last_scored_signal, last_scored_ts(=known_ts), bars_since_signal, extended(deprecated), strong_bull, overbought, weeklyBull, above200}`. `FLAGSHIP_PARAMS` carries `no_cut_exits:True` + `reclaim_lane:True` inside the source hash so v1/v2 docs are distinct identities. `model_slice()` strips `bars/series/gates` and caps signals to last 12 — the LLM-facing cost guardrail.

**golden_gate.py** — reads macro's exported canon vectors `site/factordata/contracts/golden_signals.json` (from `engine.canon.confluence_signals`) and verifies a candidate engine reproduces the BUY/SELL/tier sequence + inputs-hash. Critically: the production Terminal engine is **TV-anchored and intentionally diverges from macro canon** (canon = close-date labels + shift(1)+ffill weekly gate) — the gate *measures* that drift (`pass=False, inputs_hash_match=True`), it does not bless it. **The two repos knowingly run two different bar grammars for "the same" indicator.**

### 1.2 Ingest producers (charting-app `ingest/`, deployed to VPS `/opt/terminal/ingest`)

- **`build_polygon_universe.py`** — flagship ~37: full slices *with backtest contract* + manifest rows carrying `last/chg/**verdict**/**vts**/wr/pf/cagr/regimeBull`. Verdict = `state.last_scored_signal || last_signal` (scored-first; blocked markers never become the public verdict); `vts` = `last_scored_ts`. (⚠ same-name-different-script trap: macro also has a `scripts/build_polygon_universe.py`.)
- **`gen_slices_all.py`** — broad universe (~8.7k): slim slices (`signals`+`state` only, no series/backtest) for every non-flagship symbol with OHLC; builds the **v2 cohort cache once per run**; skips `RATE_TICKERS` (^IRX/^FVX/^TNX/^TYX — no trade verdicts on yields).
- **`v2_cohort_cache.py`** — single-pass streaming build of sector/panel equal-weight baskets + per-sector daily 2W-oversold fraction; persisted to `<data>/_cache/v2_cohort_cache.json` (20h TTL); sector resolution: fund.json `profile.sector` → macro `industry_map.json` → partial.
- **`regen_flagship_slices.py`** — rewrites flagship slices with the full-basis v2 emission right after build_polygon_universe (whose indicator_contract call predates v2 — without it every flagship BUY renders `regime_blocked`).
- **`fast_flagship.py`** — every **5 min via VPS cron**: splices a forming daily bar from the local quote-hub into the 37 flagship OHLC files, recomputes signals, atomically patches slice.indicator + manifest row (backtest block preserved verbatim; nightly-window hard skip).
- **`pull_macro_intel.py`** — the **Brain/Macro intel bridge**: reads macro `site/stockdata/<SYM>.json` (synced from the public R2 bucket `pub-f7ffb4441c5f4ad983ca56ec7c651c61.r2.dev/stockdata/`, custom UA for WAF) → writes `terminal/public/data/<SYM>.intel.json` in **`intel/v1`**:
  - `tape` = `{ai_lean, asof, stale, conviction, regime(ladder.regime_label), gex_flip, call_wall, put_wall, short_pct, sector_pulse?}`.
  - `ai_lean.dir` = pure mapping table of `(view.decision.band × entry_signal.status)` — band low or entry exit/topping → BEAR; band high|constructive AND entry ∈ {buy_now,buy_soon,partial} → BULL; else NEUTRAL; consistency guard demotes BULL w/ conviction<55 and BEAR w/ conviction>65 to NEUTRAL; **staleness ≥5 days → `{abstain:true}`** (panel must not show an old lean).
  - `cards` = `{ai_judgment{verdict,gloss,size_pct}, conviction{score,band,drivers,cautions}, levels[call wall/gamma flip/put wall], analyst{revision_breadth,est_chg_30d/90d,fwd_pe,n_analysts}, smart_money{trend,n_holders,value_change_pct}}`.
  - `analysis` = frozen 2026-07-06 Terminal contract pass-throughs: `confluence{tier,weight,sub,ticks,bars_to_cross,provisional,not_topped,htf_s1,asof}` (htf_s2 is SHADOW — deliberately not forwarded) + `sniper{w2_washout,w2_stoch_d,days_since_63d_low,coiled}`.
  - `tech` = per-symbol Tech-Lab block joined from factordata `tech_lab.json` (signal profiles) + `tech_events/<SYM>.json` (fire dates), resolved **local-first** (FACTORDATA_BASE → $MACRO_REPO/site/factordata → ~/.mm-factordata → sibling checkout → public HTTPS carve-out).
- **`pull_macro_risk.py`** — reads macro `risk_state.json` (web) or `data/market_state/latest.json` (local) → `terminal/public/data/market_risk.json` (`market_risk/v1`): `display{verdict,score,color,label_en}` + radar/headline; display-only, stale-flagged.
- **`pull_cn_hk_intel.py`** — CN/HK counterpart of the intel bridge (Mac cnhk lane).
- **`verify_publish.py`** — nightly publish-integrity gate: asserts flagship manifest verdict == the v2 slice the card reads (warn-only unless `TERMINAL_VERIFY_STRICT=1`).

### 1.3 Terminal frontend — verdict computation & every surface

**`terminal/lib/signalVerdict.ts`** (353 lines — the shared verdict brain):
- `anchorSignal(signals, maxTs)` — THE scored-lane anchor rule: newest signal with `quality !== 'regime_blocked'`; also returns `blockedTail` (newest refused signal after the anchor, for the "blocked — not an entry" note). **Shared by the rail card, the chart chip and copilot get_signals so three surfaces can't drift.**
- `oracleVerdict(manifestVerdict, slice, zh, now, trend)` — trust order: (1) fresh (<`ORACLE_STALE_DAYS`=21d by `known_ts`) anchor event IS the verdict (RECLAIM renders `soft` hollow); (2) stale/undated + regime-carrying state → **stance ladder** `computeStance()` (descriptive noun, never a Buy/Sell verb: "Extended — don't chase" / "Hold — long bias" / "Strong uptrend — awaiting pullback entry" / "Range — no edge" / "Downtrend — stand aside"…), old event demoted to tooltip; (3) bare legacy state → dated/dimmed event render. Lane-disagreement note when the manifest (screener) lane differs from the slice lane.
- `deskVerdict(intel)` — renders `intel.tape.ai_lean` honestly: BEAR whose only cause is band=low → "No setup" (not a short call); NEUTRAL with known entry posture renders the posture (await_confluence / wait_pullback / bounce_wait); score labeled "dip-entry readiness N/100" (name_score.potential_score is buy-readiness, NOT directional conviction); flags source disagreement vs `cards.ai_judgment`; symmetric 21-day staleness dim.
- `verdictIsStale(vts)` — 21-day threshold used by every manifest-lane pill.
- `SOFT_Q = {pending, block, regime_blocked}` — exported so ChartPanel marker softness gates on the same set.

**Surfaces (who renders what):**
- **`components/SignalButton.tsx`** — the rail's two-half button: Golden Oracle half (star glyph; stance/soft/stale CSS states) + Research Desk half (chart glyph), tooltip carries both notes; center "View" seam opens OracleDash.
- **`components/fin/OracleDash.tsx`** (812) — the signal pane: both verdicts, GC-v2 **tier badge** (`aplus`→"A+", `quality`→"Quality") and **keeper quality label/color** per signal row, signal history list (reversed slice signals), ARM/CONFIRM warnings, `/data/<sym>.backtest.json` metrics, techRating verdicts, conviction ring + factor bars from intel cards, and the **market-risk chip** from `/data/market_risk.json`.
- **`components/ChartPanel.tsx`** — chart chip (paintStatus) uses `anchorSignal` with `maxTs`=last visible bar (replay guard); signal markers (BUY/REBUY solid, SELL red pill, RECLAIM hollow, SOFT_Q softness); also fetches intel for chart-level overlays; Tech-Lab chart markers default OFF (TLT-R4).
- **`components/StockAnalysis.tsx`** (852; Research Desk card inside TerminalShell right rail) — adapts the live `intel.cards` schema into the legacy `analysis` shape; conviction + entry rendered as clearly-labelled supporting dimensions, never a third verdict; live techRating from bars (D1/D2) always fresher than intel.
- **`components/fin/MegaPane.tsx`** + **`workspaces/AnalysisWorkspace.tsx`** — the **`/analysis` route** (member-gated: SignupGate when signed out): the full Fundamentals dashboard incl. **`fin/TechLabPanel.tsx`** ("Lab" tab: intel.tech firing-now + per-signal WR-vs-base profiles, survivor-universe caveat, display-tier only).
- **`components/ScreenerView.tsx` / `SearchModal.tsx` / `PortfolioView.tsx`** — manifest-lane verdict pills (`r.verdict` + `vts` staleness demotion). Screener filters run off manifest fields only (documented gap: no slice-derived or bar-derived filters — would need nightly manifest fields).
- **`components/TerminalShell.tsx`** — orchestrates: fetches `/data/<sym>.slice.json` + `/data/<sym>.intel.json` per active symbol (idle-deferred), computes both verdicts for the rail, watchlist rows prefetch json/slice/intel on hover.
- **`lib/copilotTools.ts`** — the Terminal copilot's tool belt over the same files: `get_signals` (Golden-Oracle state, last 3 signals, condensed backtest, staleness via the same anchorSignal), `get_intel` (cards + confluence take + sector pulse), `get_market_state` (market_risk + NW plane), `get_technicals`, `screen` (verdict/regime filter, ranked by WR), `annotate_chart`.
- **`components/prophet/ProphetView.tsx`** — the Prophet tab (three-column managed-pick desk): fetches `prophet_idx` → `/api/hub/prophet` → **R2 `prophet/index.json`**, plus `prophet_marks` → R2 `live_flow/prophet_marks.json` polled every 30 s; honesty chrome ("nightly EOD", "display-only — forward ledger accruing", machine-generated thesis captions).
- **`lib/flowSource.ts`** — the R2-key map for the entire flow/options/context belt (see §4).

---

## PART 2 — Macro Dashboard signal stack (read from origin/main)

### 2.1 `scripts/build_stock_library.py` (4,699 lines) — the stockdata mega-integrator

**Inputs**: nightly breadth-collector closes for all S&P 500 + every stored ETF/stock/commodity/crypto (+ HK/CN/Canada/intl variants via sibling `build_*_library.py`), EDGAR/13F smart-money, revisions, GEX store, finviz themes.
**Algorithm**: for each ticker runs the SAME `engine.cycles.analyze` ladder as sector pages, then layers: `stock_score.conviction_profile` (**conviction** = "worth OWNING?"), `name_score.potential_score` (**POTENTIAL** = dip-entry buy-readiness, edge-blended, forward-graded by `name_score_grader`), `entry_signal.assess` (**entry gauge** = "buy it NOW?" — urgency→status map buy_now/partial/**await_confluence**/buy_soon/watch/wait_pullback/hold/extended/bounce_wait/topping/exit/avoid/blocked, with buy zone, don't-chase line, invalidation stop; **gated on the same MACD-2D×StochRSI-3D confluence as the boards** so "buy now" with no fresh cross reads "awaiting confluence"), `signal_gate`/`engine.confluence_tiers` (owner's weighted **T1–T4 cascade**: T1 0.90 3D master endorsed by buy-filter, T2 1.00 2D cross & 3D crossed (operator re-ranked above T1), T3 0.60 projected ≤1-2d w/ 2-session persistence, T4 0.40 earliest above-200MA; freshness ≤2 native-TF ticks; not-topped veto w/ optional Schmitt hysteresis; HTF S1/S2 super-tier display flags), plus risk_sizing, dispersion, vol_squeeze, gex_confirm, options_ivspread, coiled, donor, hold tracker, earnings-blackout veto, macro sensitivity, seasonality.
**Outputs**: `site/stockdata/<SYM>.json` (gitignored; R2-published) — carries `view.decision{band,headline,gloss}`, `conviction{score,band_en,drivers,cautions,potential}`, `entry_signal`, `ladder`, `gex`, `positioning`, `smart_money`, `sector_pulse`, and the **frozen Terminal contract blocks** `confluence{tier_cascade→tier, weight, sub, ticks, bars_to_cross, provisional, not_topped, htf_s1, htf_s2, asof}` + `sniper{w2_washout, w2_stoch_d, days_since_63d_low, coiled}`. Also `site/factordata/us_standouts.json` (the Buy Board: buy[] lane with conviction+act_level+gate_go) and us_standouts_v2 (shadow Buy Board 2.0).
**Cadence**: inside `scripts.build_site` in the nightly GitHub workflow (see §3). **Rendered**: macro us_stocks/stock pages, Buy Board, and (via the R2→pull_macro_intel bridge) every Terminal Research-Desk surface.

### 2.2 `engine/confluence_tiers.py` + `engine/signal_gate` — the macro-side confluence

Same RSI-MACD×StochRSI math family but **calendar-business-day 3D buckets** (NOT the Terminal's IPO-phased session grouping — a known, documented offset), close-only, leak-free known-date mapping, T4 projection extrapolates the 2D MACD histogram from past bars only. Weights held-out-calibrated on 110 US names (stop-out gradient 38.3%→43.1%). `sub` deep/shallow is display-only. This cascade is what the Terminal receives as `intel.analysis.confluence`.

### 2.3 `engine/subsector_confluence.py` — ENTRY-NOW double gate

Runs `signal_gate` T1–T4 + the validated BUY/SETUP/EXTENDED/TOPPING/SELL sector state machine on **synthetic equal-weight member-average indexes** for 11 sectors + 113 Finviz sub-industries; a stock is a DOUBLE-CONFLUENCE buy when its own gate is buyable AND its subsector is a tailwind; own-gate-fires-but-subsector-TOPPING surfaces as a HEADWIND warning. Survivorship-tinted descriptive tape, display-only. Output `subsector_confluence*.json` + sidecars; rendered on subsectors.html; feeds `cohort_metrics` member tier states and group_context rotation weight. (The richer "subsector confluence desk" per memory sits on the unmerged `feat/subsector-confluence` branch.)

### 2.4 Entry-intel / entry-stack program

`engine/entry_primitives.py` — vectorized full-history, leak-free series primitives (vol percentile, BB bandwidth, OBV, ATR, pct-rank, slope) shared with `stock_technicals.snapshot` so backtests and live reads stay numerically consistent. Research corpus under `research/entry_intel/` (PIT audit, survivorship census) + `research/ENTRY_*` masterplans + `scripts/ei_shadow_review.py`, `entry_gate_phase0.py`. Wired live only through `entry_signal.assess` + prophecy geometry; the rest is research-tier.

### 2.5 Oracle rotation desk (`engine/oracle/` + `scripts/oracle_*`)

**Not the Terminal's Golden Oracle** — this is the sector/complex **rotation intelligence**: `build_oracle_panel.py` builds Tier-S (sector ETFs 1998→, survivorship-clean) and Tier-M (268 subsectors + 40 themes + 47 baskets, 2021-07→) parquet panels **on the Mac, off the render path**; `oracle_nightly.py` orchestrates; episodes/graph/memory/compounds modules detect flow episodes (onset/confirmed/undeniable tiers); `engine/oracle/live.py` assembles `site/basketdata/oracle_state.json` (`oracle_state.v1`: regime rotation_tag ROTATION/LIQUIDATION/ACCUMULATION/quiet, complexes active_in/out, active_episodes) on the sector_pulse bus pattern. Panels published to **R2 `oracle/panel_s.parquet`, `oracle/panel_m.parquet`, `oracle/manifest.json`** (`publish_oracle_panels.py`) and fetched back by the CI runner (`fetch_oracle_panels.py`) for `build_bottom_sensors`. Rendered on macro boards (Oracle desk); **no Terminal surface**.

### 2.6 Prophet (the namesake)

- **`engine/prophet_bridge.py`** — originates `prophet.trade_plan/v1` envelopes **solely from `site/factordata/us_standouts.json` buy[]** (pre-registered pick rule: band≠low; gate_go normal/caution thresholds on act_level & conviction.score; sort by conviction desc; take ≤12; dir=up only). Geometry display-only: invalidation = hold.invalidation else max-protective(20d swing low, entry−2×ATR14); R; T1=1.5R, T2=3R; horizon 45d. Option resolution from the ThetaData EOD store (~0.60-delta call, nearest monthly ≥ signal+60d, EOD mid).
- **`scripts/build_prophet.py`** — writes `site/prophet/index.json`, `plans/<ID>.json`, `states/<ID>.json` (management confidence engine per plan), `showcase.json` (delayed winners for the landing), initializes `data/prophet/ledger.jsonl` (nightly = sole advancer); `--publish` uploads **R2 `prophet/index.json`**. `authority_tier='display'` everywhere; "validated" is CI-forbidden in site artifacts.
- Live add-ons: `build_prophet_marks.py` + **Mac launchd `com.mastermind.prophetmarks`** (`run_prophet_marks_loop.sh`) → R2 `live_flow/prophet_marks.json` (Terminal polls 30 s); `build_prophet_live_pack`, `reconcile_prophet_live`, `run_prophet_pick_autopsies`, `build_prophet_stage_shadow` in the nightly.
- Rendered: macro Prophet scorecard (ONE shared card across boards, per prophet-card-flagship) + landing showcase + **Terminal Prophet tab** (ProphetView via `/api/hub/prophet`).

### 2.7 Technical Lab (the admin tech lab)

`scripts/build_tech_lab_data.py` — ~219 mega-cap survivors × ~43–71 signals from `engine.tech_catalog` → `site/factordata/tech_screener.json` (per-signal firing tickers + per-stock profile/composite) + `tech_lab.json` (per-signal descriptive fire metrics: wr_21d vs base, edge, MFE/MAE, durable rate, era split pre/post-2010, up-tape%). `scripts/build_tech_lab_cli/tech_lab_cli.py` for ops. `scripts/build_tech_lab.py` renders `site/tech_lab.html`. **Serving**: Caddy blocks the page publicly; it is reachable only through the authenticated **admin SPA "Research Tools" directory** → `https://admin.mastermind-x.com/research-tools/tech_lab.html` (alongside committee.html, measurement.html, crossasset.html, signal_lab.html, macro_signals.html, factors.html — see `tests/test_admin_research_tools.py`). The two payload paths `/factordata/tech_lab.json` + `/factordata/tech_events/*` are the ONLY public factordata carve-outs (5-min cache) so `pull_macro_intel` legacy HTTP mode works; the local-first resolution is closing that.

### 2.8 Confluence screener (public, paid-gated)

`scripts/build_confluence_screener.py` — reads `site/factordata/tech_confluence.json` (leg/combo stats artifact: combos.long with h21 wr_mc train/test, rank_score, active_now tickers) → `site/confluence_screener.html` (public shell; rank-1 combo free with tickers) + `site/premiumdata/confluence_screener.json` (server-protected rows for ranks 2–3; GATING LAW: gated combos never expose tickers in the public context) + OG card. CTA deep-links to `app.mastermind-x.com` (the Terminal) via the funnel link builder.

### 2.9 Cohort metrics (`engine/cohort_metrics.py` + `scripts/build_cohort_metrics.py`)

Setup-Species W0.4: per-ticker cohort context for ~500 sector-mapped names — peer_washout_pct, peer_reclaim_pct, peer_macd_turn_pct (reusing subsector_confluence member tier states), **Rubber-Band Score** (z of trailing drawdown within cohort × cohesion × peer washout — knife-vs-cohort-liquidation discriminator), within-cohort 20d RS rank appended daily to `data/cohort_metrics/<date>.parquet`. Coverage law: ≥70% computable members else NULL. Display-only → `site/factordata/cohort_metrics.json`. (Distinct from the Terminal's `v2_cohort_cache` — same idea, two implementations.)

### 2.10 Other labs/desks in the same nightly (brief)

`stage_analysis` (industry stage board), `signal_lab.html` (admin lab), `us/china/hk_stocks_lab.html`, research factory (`research_factory_*`: ingest→decide→monitor loop), `build_signal_quality`, `build_confluence_strength`, `build_flip_confirmation`, `build_bottom_sensors`, GC labs (gc-v2 pre-reg in /tmp/gc-lab, `gc_lab_tv_partial_trim` verdict: trims FAIL), `build_options_entry_state`/`validate_options_entry` (options entry lane), alt-data brain, CPI cycle-pattern program, btc_* suite, Neural Web (`market_plane` → Terminal `/api/nw`), risk radar / market state (once-daily; source of `risk_state.json`).

### 2.11 The "/analysis" clarification

`/analysis` is a **Terminal** route (`terminal/app/(shell)/analysis/page.tsx` → AnalysisWorkspace → MegaPane), not a macro page. The macro-side testing labs are: `signal_lab.html`, `tech_lab.html`, `us_stocks_lab.html`, `china_stocks_lab.html`, `stage_analysis.html` + the admin Research-Tools directory (all admin-gated by Caddy except stage_analysis).

---

## PART 3 — Where each thing runs (execution topology)

| lane | host | trigger | what runs |
|---|---|---|---|
| Macro nightly render | **GitHub self-hosted runner (Mac, Homebrew venv)** | `.github/workflows/daily.yml`, cron **22:30 UTC**, timeout 200 min | collectors → regime engine → `build_site` (≈33 min; **includes build_stock_library**) → ~150 builders incl. build_subsector_confluence, build_cohort_metrics, build_tech_lab_data/tech_lab, build_confluence_screener, build_prophet(+live_pack, reconcile, autopsies), oracle episode/timemachine builders, build_bottom_sensors (fetch_oracle_panels from R2), stage_analysis, `publish_r2`, `mirror_terminal_context_r2`, commit+push (Pages deploys the committed tree) |
| Terminal nightly | **VPS 146.190.142.17** | cron **21:30 UTC** `/usr/local/bin/terminal-data` | Phase 1 flagship (build_polygon_universe → regen_flagship_slices → refresh_ohlc) with shrink guard; Phase 2 marathon (build/expand universe, backfill, macro symbols, FRED, crypto OHLC, **gen_slices_all**, artifact_conformance, **pull_macro_intel**, intl OHLC, seasonal Mondays, hydrate) → verify_publish gate → atomic manifest swap. ⚠ TWO copies install this file (charting-app `ops/terminal-data` wins on every deploy vs macro `app/deploy/terminal-refresh.sh`) — any change must land in BOTH. |
| Flagship intraday | VPS | cron **every 5 min** | `ingest.fast_flagship` (live-bar splice, verdict refresh; nightly-window skip) |
| Macro checkout on VPS | VPS `/opt/macro` | droplet **pulls every 3 min** | serves stockdata-adjacent local reads for the VPS intel bridge lane |
| Deploy | VPS | git-gated `/opt/terminal/terminal-build.sh` | builds merged `origin/master` only; step 7 reinstalls ops/terminal-data + syncs ingest/ + signal_layer/ |
| US fundamentals + intel | **Mac launchd `com.mastermind.fund`** | nightly | `ops/nightly_fund.sh` → `ingest/refresh_fund.sh` from TCC-safe clones outside ~/Documents (`/Users/chriswong/fund-ops-wt` etc.): EDGAR/yfinance fund build, factordata rsync-down from VPS → `~/.mm-factordata`, **step 10 `pull_macro_intel.py --all`** (~1,700 names) |
| CN/HK lane | **Mac launchd `com.mastermind.cnhk`** (+watch) | nightly | `ops/nightly_cnhk.sh` — CN/HK intel + fund refresh |
| Oracle panels | Mac, off render path | `oracle_nightly.py` / manual | panel build → `publish_oracle_panels` → R2 `oracle/*` |
| Live flow/options | **Mac launchd**: `com.mastermind.liveflow` (hourly-really ThetaData flow), `optionshub`, `chainsnapshots`, `flowenrich`, `com.mastermind.prophetmarks` (~30s marks loop), `com.macro.*` (chainheat, optionsmatrix, extquotes, indexgexhistory, thetadata-r2sync…) | continuous | write R2 `live_flow/*`, `options_hub/*`, `options_structure/*` |
| Data-plane migration | M2 → **M1 Max** (`ssh m1`) in progress | — | 24-job plane moving in 4 groups; M2 still feeds prod |

---

## PART 4 — EVERY existing macro→Terminal integration point (the de-facto spine)

1. **stockdata bridge (the big one)**: macro `build_stock_library` → `site/stockdata/<SYM>.json` → public **R2 `pub-f7ffb…r2.dev/stockdata/`** → VPS/Mac `pull_macro_intel` → `/data/<SYM>.intel.json` (`intel/v1`) → deskVerdict / StockAnalysis / OracleDash cards / MegaPane / copilot `get_intel`. Freshness: macro nightly (22:30 UTC) → R2 → Terminal nightly (21:30 UTC next day) ⇒ intel is typically ~1 day behind the macro site; a >5-day-stale source abstains.
2. **Frozen contract blocks inside stockdata** (2026-07-06): `confluence{tier T1–T4, weight, ticks, bars_to_cross, htf_s1}` + `sniper{...}` — the macro cascade's verdict already rides into the Terminal per-name.
3. **Tech-Lab block**: factordata `tech_lab.json` + `tech_events/<SYM>.json` → `intel.tech` → TechLabPanel + optional chart markers; sourced local-first, public carve-out closing.
4. **Market-risk bridge**: macro `risk_state.json`/`market_state/latest.json` → `pull_macro_risk` → `/data/market_risk.json` → OracleDash chip + copilot `get_market_state`.
5. **Prophet**: R2 `prophet/index.json` (+ `live_flow/prophet_marks.json`) → Terminal `/api/hub/prophet(:marks)` → ProphetView. Origination chain: build_stock_library → us_standouts buy lane → prophet_bridge → R2.
6. **Options/flow R2 belt** (lib/flowSource.ts r2Key map): `live_flow/{meta,tide,dte,tickers/*,chain_heat,enrich,manifest,flow_idx,surface/**}`, `options_hub/{vol,gex,oi_movers,hot_contracts,context,oi_confirmed,moves,tickers_ctx}`, `options_structure/{gex_state,matrix}`, `darkpool/eod.json`, `vol/regime.json` (via `mirror_terminal_context_r2`), `flowleaders/leaders.json`, `leaderradar/radar.json`.
7. **Golden-gate canon vectors**: macro `engine.canon.confluence_signals` → `site/factordata/contracts/golden_signals.json` → `signal_layer/golden_gate.py` (drift measured, not enforced).
8. **Neural Web strip**: macro `market_plane` → Terminal `/api/nw` proxy → topbar strip (PR #80).
9. **Deep-store sharing**: `signal_layer/confluence.py` reads macro `data/stocks/<SYM>.parquet` directly via `MACRO_REPO` for IPO anchors; VPS uses `/opt/macro`.
10. **industry_map.json**: macro's Finviz S&P sector map is the Terminal cohort cache's sector fallback.
11. **sector_pulse**: macro theme heat → stockdata → intel.tape.sector_pulse (stale-dropped).
12. **`?ret=` return-links**: Terminal "← Dashboard" returns to the exact macro page.
13. **Reverse direction**: macro `daily.yml` also runs its own `scripts.build_polygon_universe` (different script, same name — trap) and reads Terminal-published data for reclaim_lab (`https://app.mastermind-x.com/data/<SYM>.json`).

---

## PART 5 — Frank read: fragmentation, and where one spine could attach (data-level)

1. **Three confluence engines for one indicator family.** Terminal `signal_layer/confluence.py` (TV/IPO-session-anchored 3D), macro canon/`confluence_tiers` (calendar-3B, close-labeled), and `subsector_confluence` baskets (calendar-3B on synthetic indexes). golden_gate can measure the drift but nothing reconciles it; the same ticker can be BUY on one grammar and blocked on the other. A unified Prophet needs ONE declared bar-grammar authority (or an explicit per-source grammar tag in every artifact).
2. **Two "quality tier" vocabularies never joined.** GC-v2 `aplus/quality/base` (+keeper take/block/pending) lives only in Terminal slices; the macro T1–T4 cascade (+sub deep/shallow, HTF S1/S2) reaches the Terminal only as `intel.analysis.confluence`. OracleDash renders both side-by-side without a cross-map; no artifact anywhere states "GC-v2 says A+ AND cascade says T2-fresh" as one fact — which is exactly the confluence-of-confluences a superintelligent Prophet would score.
3. **Prophet's intake is single-source.** `prophet_bridge` reads ONLY `us_standouts.json` buy[]; it never sees the GC-v2 scored stream, the reclaim lane, the manifest verdict lane, subsector double-gate output, oracle rotation episodes, cohort rubber-band, or options-entry state — all of which already exist as machine artifacts. The `prophet.trade_plan/v1` envelope + ledger + management-state engine are source-agnostic; widening intake is a data-plumbing task, not a research task.
4. **The intel bridge is lossy by design.** `ai_lean` collapses band×entry to 3 values, drops the ladder detail, and forwards htf_s2 as SHADOW-never. `deskVerdict` then re-derives honesty client-side. Fine for a chip; too lossy for a Prophet input — the raw stockdata JSON (already on R2 publicly) is the richer surface a unified brain should read.
5. **`model_slice()` is a ready-made LLM contract.** The Terminal side already has the token-budget projection (signals[-12:] + state + honest_read) and the schema discipline (`mastermind.indicator/v1`, `backtest_result/v1`, `intel/v1`, `market_risk/v1`, `oracle_state.v1`, `prophet.trade_plan/v1`). A unified spine could be one more versioned doc composed FROM these, not a new computation.
6. **R2 is already the bus.** Every cross-repo data hop that works today goes R2-key → Terminal `/api/hub|/api/flow` proxy or `/data/*.json`. The oracle-panels round-trip (Mac → R2 → CI runner) proves even heavy parquet artifacts ride it. A "prophet_spine/*" R2 prefix with the existing fail-soft mirror conventions is the zero-new-infrastructure integration path.
7. **Staleness/authority discipline is uniform and reusable**: known_ts/vts availability dates, 21-day display staleness, 5-day intel abstain, stale→stance demotion, `regime_blocked`-never-anchors, score-not-gate, display-vs-scored tier separation, "validated"-forbidden CI guard. Any unified artifact must carry the same fields or it will be the least honest layer in the stack.
8. **Known operational hazards for any spine build**: the terminal-data two-copies last-writer-wins law; local macro checkouts go stale (this audit's checkout was 17 days behind); EdgeOne caches prerendered pages ~1yr and /api 404s auth-blind; the macro nightly regularly brushes its 200-min cap (adding heavy steps there is risky — Mac launchd or the VPS marathon are the safer homes); build_polygon_universe name collision across repos.
9. **Un-surfaced signal inventory (already computed, no Terminal surface)**: oracle rotation episodes/state bus, subsector ENTRY-NOW double gate (branch unmerged), cohort_metrics rubber-band, us_standouts_v2 shadow board, options_entry_state, seasonal_regime outlooks (Terminal renders `<SYM>.seasonal.json` weekly but macro-side regime analogs are richer), bottom_sensors, stage_analysis stage board, research-factory verdicts. These are the cheapest wins for a unified Prophet: they are nightly JSON artifacts one R2 mirror away.
