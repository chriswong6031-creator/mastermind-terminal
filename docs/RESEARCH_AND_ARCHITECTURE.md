# Integrated Live Charting System — Research & Architecture Decision Document

**Date:** 2026-06-26 · **Author:** Lead architect (synthesis of 7 parallel audits + adversarial review) · **Status:** Decision-ready, with one blocking dependency (D8) called out

A new standalone "TradingView-lite" charting app, in its own sibling container under `/Users/chriswong/Documents/Cluade/`, that later integrates into Macro Dashboard via a **defined publish step** + HTML embedding, and exposes every signal/indicator/backtest output as a clean, versioned data contract for **both** the Mastermind Opus brain and the Macro Dashboard stock-picker.

> **Read this first — the one correction that changes the integration thesis.** The original draft claimed the brain reads any JSON the charting app writes "with zero code, immediately." **That is false.** The brain reads `Mastermind/vendor/macro → macro_src`, which is a **separate git checkout** (verified: inode `633018788`, own `.git`, on `main`, remote `mastermindx-market-intelligence/macro`) — **not** the live `Macro Dashboard` working tree (inode `621451496`). Integration is real and still low-code, but it is **publish-then-pull with latency**, not a shared filesystem. Every "zero-code/immediate" framing below has been corrected to a concrete publish path (§7, D8). The stack choices (Lightweight Charts, firewalled PineTS, own-the-backtest-core) survive review intact; the integration mechanics did not, and are rewritten.

---

## 1. Executive summary

**Recommended stack (the one-screen version):**

- **Charting engine:** TradingView **Lightweight Charts v5** (Apache-2.0, already vendored at `site/lightweight-charts-v5.js`). Add an Apache-2.0/MIT drawing-tools plugin (the `lightweight-charts` community ecosystem has several) rather than building a drawing toolbar from scratch — **verify the specific plugin's license and tool count at adoption time** (see D2 note). **Not** TradingView Advanced Charts (its free agreement forbids private/internal use and mandates attribution).
- **Indicator authoring:** **PineTS** (a clean-room "run Pine on your own OHLC" engine, **AGPL-3.0**) running as an **arms-length Node microservice** inside the new container so AGPL never reaches the FastAPI/macro processes. **PyneCore** (Apache-2.0) as the clean-licensed Python-native complement. The user keeps writing Pine; the new container runs it. **Pin a known-good commit, not just a version tag** (the owner can relicense — see §4/P1-5).
- **Backtesting:** a **two-tier** design — Tier 1 is your own already-faithful `research/signal_engine/confluence.py` promoted into a reusable package (zero license entanglement, exactly matches the user's Pine math); Tier 2 adds **vectorbt OSS** (Apache-2.0 + Commons Clause) *internally only* for param sweeps. The significance verdict is **delegated** to Mastermind's frozen `loop/harness.py` — never duplicated. **Note:** the promoted Tier-1 engine must *add* roughly half the metrics the contract wants (`confluence.simulate()` does **not** emit Sharpe/Sortino/CAGR/Calmar/exposure or structured trades today — see §5).
- **Market data:** **Polygon / Massive** full-SIP tier as the eventual PRIMARY (full real-time SIP, tick trades + quotes, WebSocket, after-hours, deep history, and you're already wired in). **Develop against Alpaca's full-SIP market-data add-on** to halve the burn while proving the stack — *after* confirming the 2026 SKU actually bundles full SIP at the quoted price (D1 note).
- **Backend:** Python **FastAPI** (mirrors Mastermind) + a small **Node** sidecar for the PineTS engine. **Frontend:** vanilla JS + Lightweight Charts v5 (same as `site/chart.js`), no heavy framework.
- **Architectural centerpiece:** the **data contract** + a **defined publish step**, not the chart. Every series, signal, and backtest result is a versioned JSON/parquet artifact published into the `macro` repo (committed/pushed → `macro_src` pulls) so the Opus brain and stock-picker consume it with **low** new code — but with **publish latency**, not instantly.

**The money/licensing/architecture decisions you must make (with my recommendation):**

| # | Decision | Options | My recommendation |
|---|----------|---------|-------------------|
| **D1** | **Market-data spend** | ~$99 Alpaca add-on / ~$199 Polygon-Massive / ~$199 Databento | **Develop on Alpaca's full-SIP add-on (~$99 if the SKU confirms), graduate to Polygon (~$199)** once the stack proves out. You already speak Polygon; one vendor covers equities + options/GEX. Don't pay for two. **Re-verify every price/tier on the vendor's current page before committing** — all §6 numbers are point-in-time. |
| **D2** | **Charting-engine license path** | Lightweight Charts (Apache-2.0, build the rest) vs KLineChart (Apache-2.0, toolbar included) vs TV Advanced Charts (restrictive) | **Lightweight Charts v5** — same engine the dashboard already ships, zero migration. **Reject TV Advanced Charts** (forbids internal use + forces "Charts by TradingView" attribution). KLineChart only if you want a drawing/indicator UI out-of-the-box sooner. Confirm the chosen drawing plugin's license/tool count at adoption. |
| **D3** | **Pine-runtime license model** | PineTS (AGPL-3.0) vs PyneCore (Apache-2.0) | **Both, firewalled.** PineTS in a standalone Node service behind a JSON boundary (AGPL contained, **commit-pinned**); PyneCore as the in-process Python path. Optionally use a one-time `.pine`→PyneCore bulk converter — verify its current price/terms before relying on it. |
| **D4** | **Backtest framework** | own code vs vectorbt vs backtesting.py / vectorbt PRO | **Own the Tier-1 core** (promote `confluence.py`, *then add* the missing metrics); add **vectorbt OSS** internally for sweeps. **Reject backtesting.py (AGPL viral)** and **don't buy vectorbt PRO** ("personal use only" license is wrong for a 2-project shared tool). |
| **D8** | **Integration source-of-truth (NEW — blocking)** | write into `macro_src` directly / define a publish-then-pull step | **Define an explicit publish step:** charting app commits/pushes contract artifacts to the `macro` repo; `macro_src` pulls on the existing daily/cron cadence; **state the latency** (minutes if you trigger a pull, up to ~a day on the daily workflow). Do **not** assume a shared filesystem. This gates the whole integration thesis. |

---

## 2. Feature scope — prioritized MUST / SHOULD / NICE / SKIP

The closest *product* analog to what's being built is a **signal-first chart + backtester + AI copilot** (think MarketSniper-class tools), **not** full TradingView — this is a scoping *judgment call* to trim drawing tools and social features, **not** a benchmarked claim that some specific product's feature set is the right target. Make the data contract — not the chart — the centerpiece. `CC` = the cross-cutting data-contract requirement.

### MUST-HAVE — core charting the user explicitly named
| Feature | What ships | Source of truth in your stack |
|---|---|---|
| Multiple chart types | Candles, bars, line, area, **Heikin Ashi, Renko (computed transforms fed as a candlestick series — NOT native LWC series types)**; skip P&F/Kagi | LWC v5 for candles/bars/line/area; HA/Renko = your transform layer |
| Multi-timeframe + custom intervals | 1m→1M + seconds for live; higher-TF indicator overlaid on lower-TF chart | LWC v5 + OHLC JSON; resampling already in `site/chart.js` (`resample`, `resample4H`) |
| Multi-pane indicators | Price pane + RSI/MACD/StochRSI sub-panes synced | LWC v5 native multi-pane + the JS math already in `site/chart.js` |
| Drawing tools | Trendlines, horizontals, Fib, rectangles, channels (~18 core, not TV's 110) | Apache-2.0/MIT LWC drawing plugin (verify tool count/license at adoption) |
| Watchlists + overlays | Symbol watchlist, compare-overlay, macro/signal overlays | reuse published Macro Dashboard data |
| Institutional live data: quote + trade(tick) + after-hours | Real-time SIP WebSocket, 4 AM–8 PM ET, **session-aware time axis (§ live-data design)** | extend `collectors/polygon_options.py` + `build_polygon_intraday.py` |
| **★ Clean DATA CONTRACT (CC)** | Every chart point, indicator value, signal as versioned JSON mirroring `site/ohlc/<T>.json` + `latest[...]` leaf convention, **carrying a `bar_quality`/`ohlc_synthetic` flag** | new bridge writer; reuse the `engine` snapshot-key convention |

### SHOULD-HAVE — high value, user floated these
| Feature | What ships | Stack fit |
|---|---|---|
| Custom (Pine-style) indicators | Write Pine → run in PineTS Node service (PyneCore Python alt); each emits the indicator contract (§4) | golden-gated against `confluence.py` **on a real-OHLC symbol** |
| Strategy backtesting | Tier-1 own engine for per-chart runs; vectorbt for sweeps; results JSON-contracted | promote `confluence.py` **+ add missing metrics**; call Mastermind `loop/` for significance |
| Alerts (price + multi-factor) | Multi-condition alerts firing on the Pine confluence signal; each alert = a contract row | reuse landing-hub alert-dedupe pattern |
| Scanner / screener | Run the signal engine across the universe ("MTF confluence + RSI<30") **with a stated cardinality + IO/cost budget** | `build_stock_library.py` universe |
| Bar Replay | Tick/bar replay for visual strategy review | LWC + Polygon flat files |
| AI copilot hook | Route **sliced** chart/signal context (signals/state/honest_read only — never raw float arrays) to the Mastermind Opus brain ("explain this setup") — the structural differentiator | Mastermind `brain/` exists; **must respect `cost_guard` (§ P0-4 fix)** |

### NICE-TO-HAVE
Auto trendline/pattern detection (high effort) · Raindrop/volume-profile/footprint · Multi-chart 2×2→4×16 grid · Walk-forward/Monte-Carlo backtest (vectorbt can do later) · News panel/economic calendar (reuse macro feeds) · ML strategy lab.

### SKIP — overkill / misaligned with display-only + internal-Opus design
Broker order routing / live execution (you are paper-only) · Social/Ideas feed (single-user) · L2/order-book depth (charting doesn't need it; metered cost) · SuperDOM/DOM ladder · Mobile native apps / 100+ broker integrations / copy-trading · **Building a Pine *interpreter* from scratch** (use PineTS/PyneCore instead).

---

## 3. Charting engine — recommendation + fallback

**Decision: build on TradingView Lightweight Charts v5 (Apache-2.0). Fallback: KLineChart (Apache-2.0). Reject TradingView Advanced Charts.**

**Why Lightweight Charts wins (build):**
- You **already ship it** (`site/lightweight-charts-v5.js`, `site/chart.js`) and already compute RSI/Stoch/MACD/StochRSI/EMA client-side. One engine across the new app and the dashboard.
- v5 closed the historical gaps: **native multi-pane** (`chart.addSeries(..., paneIndex)`, `chart.panes()`, `setStretchFactor()`), **Primitives** for custom drawing tools/annotations, and custom series plugins for indicators.
- The "missing" pieces (drawing toolbar, TA pack) are work you'd own regardless — and the differentiator is *your* Pine signals + *your* contract, not a generic TA library. A community Apache-2.0/MIT drawing plugin is a "wire in a plugin," not a from-scratch build.
- **Data-contract discipline is native** — you already emit `site/ohlc/<TICKER>.json` via `build_chart_data.py`; the new app extends the same pattern.

**Why reject TradingView Advanced Charts:**
1. **License forbids your use.** The Free Advanced Charts Agreement is "for public access implementations as a free offering only, and not for private, personal or internal uses" — your system is explicitly internal/display-only.
2. **Mandatory "Charts by TradingView" attribution** on any off-tradingview.com use.
3. **No Pine, no advantage.** Its "custom studies" are JS plugins — same authoring model as Lightweight — so you'd gain a restrictive license + approval gate with zero Pine capability.

**Fallback — KLineChart (Apache-2.0):** the only free, financial-first library that hands you built-in overlay/drawing tools *and* a clean `registerIndicator()` registry + custom panes + replay API out of the box. Choose it only if you want a running drawing/indicator UI sooner and accept a second engine diverging from the dashboard's Lightweight Charts. (Correction to the original charter: KLineChart is Apache-2.0, **not** MIT.)

**Avoid:** Highcharts/DevExtreme/AnyChart (commercial per-dev/yr, no upside for an internal tool); ECharts/ApexCharts/Plotly (general-purpose, no TA/multi-pane studies); react-financial-charts (unmaintained as of this writing — re-check before relying on it). uPlot is the fastest renderer but even more bare-metal than Lightweight — only if rendering perf becomes a proven bottleneck.

> **Critical reuse warnings from the audit** (a rewrite must respect these — and note that "lift `chart.js`" is therefore a **re-validation spike, not a copy-paste**; see Phase 0a/0b): LWC v5's per-point color path silently aborts on a CSS `color-mix()` string — histogram colors must be pre-resolved to concrete `rgba` via `alpha(hex,a)`; size the chart explicitly from the container (not `autoSize`, whose ResizeObserver intermittently leaves panes stuck at 300×150); the `resample`/`resample4H` MTF logic and the SAFE-name transform must be carried over and re-tested against a new data source + live updates the original never handled. Re-theme/re-translate on the `themechange`/`langchange` DOM events, reading CSS vars (`--up/--down/--text/--muted/--line/--panel/--link/--warn`).

---

## 4. Custom (Pine-style) indicators — authoring path + output contract

**Authoring path:** **PineTS** (a clean-room "write Pine, run on our OHLC" engine, **AGPL-3.0**) as the primary engine, **+ PyneCore** (Apache-2.0) as the Python-native complement.

> **Verification caveat (P1-4).** Several external specifics in the original draft (exact PineTS version/release date, ownership/acquisition date, a converter's monthly price, "~99.999% match," exact drawing-plugin tool counts) could **not** be verified from the repos and read as over-precise. **Treat all external version/ownership/price numbers in this section and §6 as UNVERIFIED until checked against the vendor's current page at adoption time.** The *architecture* below (clean-room Pine engine behind an AGPL firewall, golden-gated) is sound regardless of which exact build you pin.

- **Legality:** the Pine *language* isn't what's restricted — TradingView's *cloud execution and source repo* are. A clean-room reimplementation of Pine semantics is legal; these engines ship explicit non-affiliation disclaimers. Run only scripts you have rights to (the user's own `.pine` + open-source community scripts) — never invite-only/protected scripts.
- **PineTS** runs the user's flagship signal: its `ta.*` coverage (`rsi, ema, sma, macd, stoch, crossover, crossunder, highest, lowest, barssince`) plus `request.security` (MTF) covers the math. It returns named series (`plots['SMA 20'].data`) — contract-friendly.
- **The decisive constraint is AGPL-3.0**, not TradingView. AGPL's network clause could pull a service into copyleft. **Mitigation = the standard AGPL firewall:** run PineTS as a **separate Node "indicator engine" process** in the new container; the FastAPI/macro apps talk to it **only over an HTTP/process boundary returning JSON**. **Legal caveat (P1-5):** whether two processes are "separate works" vs "one combined work" under AGPL depends on coupling and *distribution*. For a **single-user, internal, non-distributed** tool this design is almost certainly fine. **If the app is ever shared/hosted for others, get the firewall reviewed** — do not treat "AGPL stops at the network boundary" as a settled blanket truth. Also: a single owner can dual-license or relicense the project, so **pin a known-good commit hash, not just a version tag.**
- **PyneCore (Apache-2.0)** is the clean-licensed, in-process Python path (imports directly into the vendored `engine/` with zero IPC) — write Pine-shaped Python (`@script.indicator`, `request.security` supported). A one-time `.pine`→PyneCore bulk converter may exist as a paid tool — use it as a **build-time** convenience, **not** a runtime dependency, and confirm its current terms first.
- **Don't:** run PineTS in the browser or link it into FastAPI (AGPL); use `vm2`/`node:vm` for sandboxing (`node:vm` is not a security sandbox — use `isolated-vm` if/when you expose authoring to untrusted users); pin plain `pandas-ta` (supply-chain concern — prefer `pandas-ta-classic`).

**Golden-reference gate (the trust layer Opus needs):** neither engine guarantees byte-for-byte TradingView parity, so on each indicator registration, run the engine **and** the Python oracle `research/signal_engine/confluence.py` on the same OHLC and assert series agree (max abs diff < 1e-6) + exact match on discrete cross events. Fail/flag the contract on divergence — same "evidence-gate fails CI" discipline as `risk_radar_backtest.py`. **CRITICAL (P0-3): run the gate on a symbol with REAL OHLC, not the reconstructed deep store.** `build_chart_data.py` documents that the deep store **carries no `open` column** — open is reconstructed as the prior close and high/low are clamped. A Pine port that references `open`/`high`/`low` will silently diverge from TradingView on exactly the historical bars a deep-store gate runs against, certifying the engine against synthetic data.

**GOTCHA from the audit — three MACDs coexist** and the contract MUST disambiguate them or signals silently disagree:
- `chart.js` → **price** MACD(12,26,9)
- `engine.cycles.macd_parts` → **price** MACD(12,26,9)
- `confluence.py` → **RSI-based** MACD (MACD computed *on RSI*, ~14/60/5 per the flagship)

So `macd_kind` alone is insufficient — **two `rsi_based` indicators with different lengths still disagree.** Make `params` (including the RSI length the MACD is computed on) **mandatory and folded into `source_hash`** (P2-1).

### Indicator output contract — `mastermind.indicator/v1`

One JSON doc per `{indicator_id, symbol, timeframe}`, emitted under `signals/<id>/<symbol>.json` plus an index `signals/registry.json`.

> **Context-budget rule (P0-4, the differentiator's guardrail):** the `series`/`gates`/`bars` arrays are **for the chart only and are NEVER sent to the model.** The brain reads **only** the `signals[]` + `state{}` + `meta.honest_read`-class slices. This MUST be enforced in the `read_signal`/`get_fundamentals` projection (not left to convention), with a per-call token ceiling tied to Mastermind's existing `brain/cost_guard.py`. A naïve `intake.build()` fan-out over the picker universe that pulled full float arrays would blow context and cost — the projection is what makes the "Opus reasons over the signals" claim real.

```jsonc
{
  "schema": "mastermind.indicator/v1",
  "indicator": {
    "id": "confluence_rsimacd_stochrsi_mtf",
    "title": "RSI-MACD × StochRSI MTF Confluence",
    "engine": "pinets@<pinned-commit>",         // commit hash, not just a tag (relicense risk)
    "source_lang": "pine-v5",                    // pine-v5 | pinets-js | pynecore | python
    "source_hash": "sha256:…",                   // hashes the script AND the full params block
    "macd_kind": "rsi_based",                    // rsi_based | price_1226_9  ← REQUIRED
    "params": {                                  // MANDATORY — folded into source_hash
      "confW": 8, "rsiLen": 14, "useMTF": true, "confirmTF": "1W",
      "macd_on": "rsi", "macd_fast": 14, "macd_slow": 60, "macd_signal": 5
    }
  },
  "symbol": "NVDA",
  "timeframe": "3D",
  "as_of": "2026-06-26T20:00:00Z",
  "bar_quality": "real_ohlc",                     // real_ohlc | synthetic_open_deepstore  ← REQUIRED
  // ── CHART-ONLY ARRAYS BELOW — never projected to the model ──
  "bars": ["2026-06-02", "...", "2026-06-26"],   // ISO index; all series align to this
  "series": { "rsiMacd": [], "rsiMacdSignal": [], "stochK": [], "stochD": [], "rsi14": [] },
  "gates":  { "weeklyBull": [], "above200": [], "monthlyBull": [] },
  // ── MODEL-FACING SLICE BELOW — what Opus reasons over ──
  "signals": [
    { "ts": "2026-06-20", "bar_index": 412, "type": "BUY",   // BUY|SELL|EXIT|REBUY|CUT
      "strength": 0.82, "price": 142.10,
      "reasons": ["macd_bull_cross","recent_b1","weekly_confirm","rsi<65"],
      "regime": { "weeklyBull": true, "above200": true } }
  ],
  "state": { "position_hint": "long", "last_signal": "BUY", "bars_since_signal": 2, "extended": false },
  "meta": {
    "leakfree": true, "scored": false,            // display-only convention (mirrors ai_desk.DISCLAIMER)
    "validated_against": "research/signal_engine/confluence.py",
    "validation": { "max_series_abs_diff": 4e-7, "event_match": true, "gate_symbol_bar_quality": "real_ohlc" },
    "honest_read": "…",                           // model-facing calibrated caveat
    "warnings": []
  }
}
```

**Why these fields map to your world:** `signals[].type` + `reasons[]` is the Opus-facing surface — mirrors the existing `CB/CS/revBuy/revSell`, `bear_block/strong_bull` vocabulary in `confluence.py`; Opus reasons over `reasons[]`, not raw floats. `series`+`gates` overlay on the existing LWC panes with zero transform (chart-side only). `state` is the one-row read the picker ranks on. `engine`+`source_hash`+`meta.validation`+`bar_quality` give Opus provenance so it can trust-weight a signal (and discount synthetic-OHLC history).

---

## 5. Strategy backtesting — engine + result contract

**Decision: two-tier, don't pick one framework.** None of `vectorbt`/`backtrader`/`backtesting`/`nautilus`/`zipline` are installed in either repo — clean slate, no lock-in.

- **Tier 1 (PRIMARY) — promote `research/signal_engine/confluence.py` into a reusable package.** It already faithfully runs the user's Pine indicator (`compute_signals()` + `simulate()`), handles next-bar fills + leak-free MTF resampling, ~280 lines, zero deps, zero license entanglement. Refactor to `run_backtest(prices, entry_signals, exit_signals, *, cost_bps, slippage_bps, fill) -> BacktestResult`; keep `compute_signals()` as the indicator layer so any Pine-style indicator plugs in via boolean entry/exit Series.

  > **CORRECTION (P0-2) — the draft's "maps 1:1 onto `confluence.simulate()`" claim is FALSE.** Verified, `simulate()` returns exactly these 14 keys: `{n, wr, avg_win, avg_loss, expectancy, profit_factor, strat_ret, bh_ret, max_dd, bh_max_dd, in_mkt_pct, yrs, worst, best}`, with trades as **bare `(entry_dt, exit_dt, ret)` tuples**. The following contract fields **do not exist today and are net-new code**:
  > - **Metrics to ADD:** `cagr`, `sharpe`, `sortino`, `calmar`, `exposure` — these need a **daily return series the sim does not currently retain** (it keeps an equity array + trade returns, not per-bar returns). Adding them means threading a daily mark-to-market series through `simulate()`.
  > - **Per-trade fields to ADD:** `entry_px`, `exit_px`, `side`, `bars_held`, `exit_reason` (needs the `CB/CS/cut` tag threaded through), and **`mae`/`mfe`** (needs **intrabar high/low**).
  > - **MAE/MFE are GATED on real OHLC** — they are meaningless on the synthetic-open deep store (P0-3). Emit them only when `bar_quality == "real_ohlc"`, else `null`.
  >
  > Also **add cost/slippage** (the current sim has none) and `calmar`. The contract below is therefore the **target spec for the promoted `run_backtest`**, not a description of what `simulate()` returns.

- **Tier 2 — vectorbt OSS (Apache-2.0 + Commons Clause)** *internal-only* param-sweep/Monte-Carlo accelerator (`vbt.Portfolio.from_signals()`). **Commons Clause forbids "selling," which is defined to include offering the software as a hosted/SaaS service whose value derives substantially from it.** A single-user research tool is fine; **the moment any of this becomes a service to others, Commons Clause bites** (P1-6) — which is, in fact, exactly *why* vectorbt PRO's "personal use only" license is also wrong for a 2-project shared *tool*. Keep it strictly internal/paper. Pin it; it's effectively frozen (v1.0.0, Apr 2024) — fine for a signal-array runner, fall back to Tier 1 if it rots.
- **Reserve `nautilus_trader` (LGPLv3, active)** for a future graduation to realistic execution sim / live — wrong tool for "does my Pine signal have edge."
- **Reject:** backtesting.py (**AGPLv3** — viral copyleft reaches a server-hosted brain that imports it), backtrader (dead), zipline (wrong shape), LEAN self-host (C#/ops overkill). **Don't buy vectorbt PRO** ("personal use only"; a 2-project shared tool needs a custom org license).

**Keep backtesting in Python, not JS** — a faithful backtest of the RSI-based-MACD MTF logic must match the Python indicator math bit-for-bit; duplicating in JS reintroduces the documented "unfaithful port" divergence. The chart UI calls a small Python backtest route (FastAPI), which runs Tier 1 and returns the contract; the chart overlays trade markers + equity curve. Brain and chart then read the **identical** result object.

**Composition with Mastermind's `loop/` — feed, don't duplicate.** `loop/` is **not** a single-strategy runner — it's the frozen statistical *judge* (`harness.py`/`pbo.py`/`engine_backtest.py`: DSR, CSCV/PBO, purged k-folds, BH-FDR, holdout). Division of labor:
- **New system** answers *"as traded, what did this one Pine strategy do?"* → trade list + headline metrics + equity curve (fast, per-chart).
- **`loop/harness.score` + `promote.gate`** answer *"is that edge real or overfit?"* The new backtester emits a **net daily-return series** (sidecar parquet) + the spec; when Opus wants a verdict it passes the series through the **existing frozen** functions. The judge is read-only, never edited by the new system.
- To inject a strategy for promotion, emit a **Candidate spec** `{"weights": {TICKER: w}, "knobs": {...}}` (+ a `.materialize(closes)->weights` adapter), let `harness.score` → `promote.gate` (the `paper` gate) judge it; survivors `enroll()` into `engine.signal_archive` as `sleeve_<spec_hash[:8]>` (the live `data/signal_archive/sleeve_97e0c078.parquet` confirms this path). Publish the **spec, not pre-scored metrics**.
  > **VERIFY BEFORE PHASE 3 (P2-4):** the chain `candidate-spec → harness.score → promote.gate → enroll` is *plausible* (modules + a live sleeve parquet exist) but the **exact `harness.score` input signature and whether `enroll` accepts the `{weights, knobs}` shape have NOT been confirmed against source.** The harness is **frozen/read-only**, so a signature mismatch means **you adapt the spec emitter** — there is no recourse to edit the judge. Read those signatures first; do not commit Phase 3 to this API shape sight-unseen.

### Backtest-result contract — `backtest_result/v1`

Mirrors the existing `data/backtest/*.json` shape (`as_of`/`status`/`honest_read`) so the brain needs no new parser. Path: `backtests/<strategy_id>/<ticker>__<asof>.json`; large return arrays go in a sidecar parquet. **Fields marked `+` are net-new (do not exist in `simulate()` today); `mae`/`mfe` are `null` unless `bar_quality == "real_ohlc"`.**

```jsonc
{
  "schema": "backtest_result/v1",
  "as_of": "2026-06-26", "status": "ok",
  "bar_quality": "real_ohlc",                     // gates mae/mfe; flags synthetic deep-store runs
  "strategy": {
    "id": "rsimacd_stochrsi_mtf", "name": "RSI-MACD x StochRSI MTF confluence",
    "source": "signal_engine/confluence.py",
    "spec_hash": "ab12cd34",                       // matches loop's candidate.spec_hash → dedupe/DSR trial-count
    "params": { "confW": 8, "useMTF": true, "revBars": 3, "macd_on": "rsi", "macd_fast": 14, "macd_slow": 60, "macd_signal": 5 },
    "fill": "next_close", "cost_bps": 3.0, "slippage_bps": 1.0   // + cost/slippage net-new
  },
  "universe": { "ticker": "NVDA", "timeframe": "3D", "start": "2009-01-02", "end": "2026-06-25", "bars": 1490 },
  "metrics": {
    "win_rate": 0.66, "expectancy": 0.0412, "avg_win": 0.118, "avg_loss": -0.061,   // exist today
    "n_trades": 47, "profit_factor": 3.10, "max_dd": -0.31, "best": 0.91, "worst": -0.14, "in_mkt_pct": 0.58, // exist today
    "cagr": 0.241, "sharpe": 1.12, "sortino": 1.64, "calmar": 0.78, "exposure": 0.58,  // + ALL net-new (need daily return series)
    "vs_buy_hold": { "bh_total_return": 9.40, "bh_max_dd": -0.70, "beats_return": true, "shallower_dd": true } // exist today
  },
  "trades": [
    { "id": 1, "entry_date": "2009-04-10", "exit_date": "2009-08-21", "ret": 0.330,  // exist today (as tuples)
      "entry_px": 11.2, "exit_px": 14.9, "side": "long", "bars_held": 31,             // + net-new
      "exit_reason": "CS",                                                            // + net-new (thread CB/CS/cut tag)
      "mae": -0.06, "mfe": 0.41 }                                                     // + net-new, null unless real_ohlc
  ],
  "series_ref": "backtests/rsimacd_stochrsi_mtf/NVDA__2026-06-26.returns.parquet",  // ← loop.harness consumes THIS
  "validation": {                                 // null until the loop is invoked (keeps per-chart runs cheap)
    "computed_by": "mastermind.loop.harness",
    "dsr": 0.31, "dsr_verdict": "SURVIVES", "pbo": 0.18,
    "fold_robust": true, "newey_west_p": 0.04, "n_eff_trials": 6,
    "holdout_sharpe": 0.71, "holdout_confirms": true
  },
  "honest_read": "Beats B&H on return and drawdown on NVDA; edge is front-loaded and not yet FWER-significant pooled. Risk/timing overlay, not a standalone return engine."
}
```

`win_rate`/`expectancy`/`profit_factor`/`avg_win`/`avg_loss`/`max_dd`/`best`/`worst`/`in_mkt_pct`/`vs_buy_hold` and the bare trade tuples map onto today's `simulate()`; everything marked `+` is the promoted engine's added scope. `series_ref` is the seam (charting computes the series; the brain computes significance via frozen functions). `honest_read` is the same calibrated-caveat field every existing contract carries.

---

## 6. Market data — comparison + decisive picks

Display-only / paper-only, US equities (China/HK already on Tushare). You are a **non-professional, display** consumer. IEX Cloud is dead (Aug 2024) — don't design around it.

> **Pricing/SKU caveat (P1-1, P1-4).** Every dollar figure, tier name, and "what's bundled" claim below is **point-in-time and must be re-verified on the vendor's current pricing/license page before it anchors a decision.** Two specific skepticisms the draft under-applied: **(a) Alpaca's market-data subscription is separate from its brokerage, and full SIP + real-time OPRA options have historically been add-on/tiered — confirm the exact 2026 SKU actually bundles full SIP (and OPRA, if you want it) at ~$99 before treating it as decided.** **(b) "No exchange fees on top" is true only for non-professional, non-display, non-redistribution personal use** — see the redistribution/non-display gotchas below, which interact with the shared-dashboard and order-reasoning goals.

| Provider / Plan | $/mo (verify) | Real-time | Trades (tick) | Quotes/NBBO | After-hours | WebSocket | Hist | Exchange fees on top? |
|---|---|---|---|---|---|---|---|---|
| Polygon/Massive — Developer | ~$79 | **IEX only** | IEX | IEX | yes | yes | ~10yr | no (non-display, non-redist) |
| **Polygon/Massive — full-SIP tier ⭐** | **~$199** | **Full SIP** | **all** | **all/NBBO** | **full (4a–8p ET)** | **unlimited** | ~20yr | **no for non-display/non-redist; NOT redistribution-granted** |
| Alpaca — Basic (free) | $0 | IEX only | IEX | IEX | limited | yes (1 conn) | yes | no |
| **Alpaca — full-SIP add-on ⭐** | **~$99 (verify SKU bundles SIP)** | **Full SIP (verify)** | yes | yes | yes | **yes — 1 conn (a real ceiling)** | yes | no |
| Tradier — Brokerage API | ~$10–35** | **Consolidated SIP** | yes | yes | yes | yes | limited | no (broker-licensed) |
| **Databento — Standard ⭐** | **~$199** | **RT (Equities Mini: BBO+trades)** | yes | yes (**BBO = top-of-book only**) | yes | yes | ~7yr OHLCV | **Mini = ZERO + redistribution; depth = pass-through, different product** |
| Theta Data — Standard | ~$25 | RT options+stocks | yes | yes | yes | yes | 10yr+ | low (best-value options) |
| Intrinio | ~$200→$1,600 | RT (IEX or SIP by tier) | yes | yes | yes | yes | yes | tier-dependent |

\* Databento's deep order-book depth (Nasdaq TotalView L2/L3) is a **different, far more expensive product** (≥ ~$1,576/mo Nasdaq RT *pro* + non-display fees) — **do not let "Standard ~$199" read as if depth is included.** The **Equities Mini** bundle (BBO top-of-book + trades, zero license fee, redistribution allowed) is what makes the ~$199 line; it is **not** order-book depth.
\** Tradier requires a funded brokerage account; data is bundled.

**SIP vs IEX / real-time / AH / redistribution — the gotchas, explicit:**
- **"Real-time" has three meanings.** Full SIP (all venues, consolidated NBBO + every print — what TradingView shows) vs IEX-only (~2–3% of volume; Polygon Developer + Alpaca free give only this — quotes look thin/wrong on illiquid names) vs 15-min delayed. To match TradingView you **need full SIP** → Polygon full-SIP tier, Alpaca's full-SIP add-on (if confirmed), or Databento Equities Mini.
- **Non-pro vs pro:** as an individual on a display-only dashboard you're non-pro; the vendors absorb the fee. Go pro (managing others' money / commercial redistribution) and fees jump to direct exchange ILAs.
- **Display vs non-display — and the contradiction the draft glossed (P1-1).** Charts a human looks at = display (cheap lane). **The moment Opus *routes orders* off the feed, some exchanges classify that as non-display (~$76/mo+ per feed).** You **cannot** simultaneously claim "no exchange fees on top" AND "this feeds a possibly-shared dashboard + an order-reasoning brain." **Pick a lane:** this project is **paper/research + display only**, so the cheap lane holds — but if order-routing or a shared/hosted dashboard ever lands on the roadmap, re-price for non-display and/or redistribution **before** flipping that switch.
- **Redistribution:** if the bridge writes live prices into shared/hosted pages, that can count as redistribution. **Polygon's tiers here do NOT grant redistribution** (needs a Business tier); **Databento Equities Mini explicitly grants free redistribution** — uniquely valuable for a shared-contract architecture. For purely local/private pages it's moot.

**Decisive picks:**
- **PRIMARY (graduation target) — Polygon/Massive full-SIP tier (~$199/mo).** Full real-time SIP, unlimited WebSocket/REST, full extended-hours, deep history, no separate exchange fees *for non-display/non-redistribution use*. **Lowest-friction integration** — the codebase already speaks Polygon (`collectors/polygon_options.py`, `build_polygon_gex.py`, `build_polygon_intraday.py`), reusing the same auth + the `site/ohlc/<TICKER>.json` contract pattern. (Note the polygon.io → massive.com rebrand; verify the current tier name on massive.com/pricing.)
- **CHEAPER DEV FALLBACK — Alpaca full-SIP add-on (~$99/mo, SKU unconfirmed).** Clean Python SDK + free tier to prototype; **the 1-WebSocket-connection limit is a real ceiling** — bar-replay + live charting + a scanner fan-out can want more than one stream, so validate it against your actual concurrency before relying on it. **Confirm the SKU bundles full SIP (and OPRA if wanted) at the quoted price first.**
- **PREMIUM / MOST LICENSE-CLEAN — Databento "Standard" (~$199/mo).** Best match for the "data contract for Opus" goal: institutional normalized schemas, Equities Mini = real-time **BBO (top-of-book) + trades** with **zero license fees + free redistribution**, PAYG top-ups for deep tick/MBO history. Pick this if redistribution-clean data flowing into shared pages becomes important. **Order-book depth is a separate, expensive product — not included here.**

**My pick for the exact goal:** **build/prove on Alpaca (~$99, after confirming the SKU)**, then **graduate to Polygon (~$199)** for history/WS headroom + collector reuse — or to **Databento (~$199)** if redistribution-clean contracts become important. Don't pay for two up front. Mastermind today has **no live/tick/AH tape** (`data_layer/polygon.py` is delayed/EOD-only, `realtime:false`, ~12-name universe) — the new container is the natural place to *originate* this feed.

---

## 7. Integration architecture — diagram + the real data-contract seams

**The centerpiece is the contract + a defined publish step.** The original draft's "drop a file, the brain reads it instantly" model is **wrong** and is corrected here.

> **THE CORRECTION THAT GATES EVERYTHING (P0-1).** `Mastermind/vendor/macro → macro_src` is a **separate git checkout** (verified inode `633018788`, own `.git`, on `main`, remote `mastermindx-market-intelligence/macro`). The live `Macro Dashboard` working tree (inode `621451496`) is a **different directory**. Therefore a file the charting app writes into the dashboard tree is **invisible to the brain** until it is **committed + pushed to the `macro` repo and `macro_src` pulls it.** "Zero code, immediate" is replaced everywhere below by **"publish (commit/push) → pull, with latency."**

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│  NEW SIBLING CONTAINER  /Users/chriswong/Documents/Cluade/charting-app/            │
│                                                                                    │
│   Polygon/Massive WS (live ticks + quotes + AH)  +  REST history                   │
│            │   (session-aware: pre/RTH/post, holiday calendar, reconnect+backfill, │
│            │    out-of-order/late-tick dedup, gap handling on the time axis)       │
│            ▼                                                                       │
│   ingest/  ──►  Python signal layer (FastAPI)                                      │
│            │     reuse engine/cycles.py (vendored) + signal_engine/confluence.py   │
│            ├──► Node "indicator engine" sidecar  (PineTS @<commit>, AGPL-firewalled)│
│            │      writes named series + signals  ── golden-gated vs confluence.py  │
│            │      (gate runs on a REAL-OHLC symbol, not the synthetic deep store)  │
│            ▼                                                                       │
│   ┌─────────────────────  DATA CONTRACTS (versioned JSON + parquet)  ───────────┐  │
│   │  ohlc/<T>.json     {t,o,src,bars:[[date,o,h,l,c,v]]} | close-only {o:0,...} │  │
│   │  intraday/<T>.json {t,intraday:1,bars:[[epochSec,o,h,l,c,v]]}               │  │
│   │  signals/<id>/<T>.json   mastermind.indicator/v1  (+ bar_quality)   (§4)    │  │
│   │  signals/registry.json   index of all registered indicators                │  │
│   │  backtests/<id>/<T>__<d>.json  backtest_result/v1  (+ .returns.parquet)(§5) │  │
│   └────────────────────────────────────────────────────────────────────────────┘  │
│            │                                                                       │
│   Web UI ──┘  Lightweight Charts v5 (multi-pane, Primitives drawing tools)         │
└──────────────┬─────────────────────────────────────────────────────────────────────┘
               │  ★ PUBLISH STEP (D8): git commit + push to `macro` repo
               ▼
        ┌──────────────────────────────┐
        │  `macro` GitHub repo (origin) │
        └───────────────┬──────────────┘
        pull (daily workflow / cron / manual trigger — STATE THE LATENCY)
   ┌───────────────────▼───────────────┐        ┌──────────────────────────────────┐
   │  MACRO DASHBOARD checkout          │        │  MASTERMIND  (FastAPI + Opus)      │
   │  (live working tree, builds pages) │        │  vendor/macro -> macro_src (PULLED)│
   │  site/chart.js renders ohlc/<T>    │        │  brain/bot_mcp.py read tools:      │
   │  stock-picker spreads              │        │   get_fundamentals → tech.* (proj.)│
   │  cycle/mtf/early/ladder            │        │   read_signal (allowlisted, SLICED)│
   │  + NEW charting_signals            │        │  brain/intake.py funnel +          │
   │                                    │        │  loop/harness → promote → enroll   │
   └────────────────────────────────────┘        └────────────────────────────────────┘
```

**The concrete seams (corrected and grounded in the audits):**

- **Seam A — OHLC the chart already reads (low JS change, AFTER publish).** Produce files in the exact verified shapes. **`build_chart_data.py` emits TWO shapes, not one (P0-3):** candles `{"t":"AAPL","o":1,"src":"deep","bars":[["YYYY-MM-DD",o,h,l,c,v]]}` **and** close-only `{"t":"AAPL","o":0,"bars":[["YYYY-MM-DD",close,v]]}`. The deep store **has no real `open`** — open is reconstructed as prior close, high/low clamped. The contract MUST carry `bar_quality`/`ohlc_synthetic` per series so HA/Renko/MAE-MFE/gap logic and the golden gate never silently run on fiction. Intraday: `{"t":"AAPL","intraday":1,"bars":[[epochSec,o,h,l,c,v]]}` (epoch seconds, UTC; `chart.js` aggregates to 4H via `resample4H`). **Must mirror the SAFE-name transform** `ticker.replace("=","_").replace("^","_")`. For live/AH, point `StockChart.mount(host, ticker, {data: liveJSON})` at an endpoint of the same shape (the HK inline-`data:` path proves `opts.data` works without a fetch).

- **Seam B — per-instrument signal leaf the stock-picker renders (AFTER publish).** The picker reads `site/stockdata/<SAFE>.json` and spreads `analyze()`'s `cycle/mtf/early/ladder` into the record (`build_stock_library.py::_one`). Emit the new output as an additive top-level key (`charting_signals`) on that record — mirroring how `anticipation`/`tech` were added — OR as a sibling file `signals/<id>/<SAFE>.json`. `bot_mcp.get_fundamentals` already projects the `tech` block to the brain via `_pick(d.get("tech"), [...])`; extend that list — **but project the SLICED fields only (state/signals/honest_read), never the raw arrays (P0-4).**

- **Seam C — the brain reads PUBLISHED JSON (NOT the live tree).** `brain/bot_mcp.py`'s `read_signal` allowlist is `_READ_ROOTS = [vendor/macro/site, vendor/macro/data, Mastermind/data]` (deny: `Mastermind/data/portfolio*`). **`vendor/macro` resolves to `macro_src`, the separate published checkout.** So: a JSON the charting app produces is readable by the brain **only after** it is committed/pushed to `macro` and `macro_src` pulls. The code change on the brain side is still ~zero — **the new work is the publish pipeline + the read-time projection (slicing), not a parser.**

- **Seam D — the candidate funnel (gets signals into the brain's reasoning).** `brain/intake.py::build()` merges every per-ticker surface into one ranked queue with provenance `{ticker, score, sources[], reasons[], lean(±1/0), confidence, falsifier, divergent}` (corroboration `+0.08`, divergence `+0.12`). Plug in by either (a) publishing a JSON it already reads (`factordata/us_standouts.json`, `basketdata/radar_ticker.json`, `altdata/mastermind.json`) **into `macro_src` via the publish step**, or (b) adding a `_from_charting()` loader to `_LOADERS` returning `{TICKER: {score, reason, lean, confidence, falsifier}}` — a small, scalar, model-safe surface (no arrays).

- **Seam E — backtest → the loop (feed, don't duplicate; verify signatures first).** Emit a Candidate spec `{"weights": {...}, "knobs": {...}}` (+ `.materialize(closes)->weights`); `loop/harness.score` (frozen) → `loop/promote.gate` → on pass, `loop/paper.enroll(...)` archives `sleeve_<hash>` into `engine.signal_archive`. **Read the actual `harness.score`/`enroll` signatures before Phase 3 (P2-4)** — the judge is frozen, so you adapt. Publish the *spec*, not pre-scored metrics.

- **Seam F — originate the live/tick/AH feed Mastermind lacks.** `data_layer/polygon.py` is a thin read-only wrapper (delayed/EOD-only). Expose the new feed as either (i) a `data_layer/`-style module mirroring its function contract (`quote/quotes/snapshot_price/daily_closes`) so `get_quote`/marks upgrade to real-time, or (ii) the published `ohlc/` + an AH/tick JSON the brain reads. Additive — nothing in Mastermind supplies this today.

- **Seam G — the bridge write-back pattern + the publish step (CORRECTED).** Mastermind's `bridge/macro_snapshot.py` writes `mastermind_snapshot.v1` one-way into `site/mastermind/` **inside the `macro_src` checkout it controls.** The charting app should mirror the *one-way-push discipline*, but **its target is the `macro` repo via commit/push, not a shared symlink** — because its `vendor/macro → ../Macro Dashboard` (if used at all) points at the *live working tree*, a **different directory** from the brain's `macro_src`. **Define the publish step explicitly (D8):** charting app commits contract artifacts → pushes to `macro` → the existing daily/cron workflow (or a manual/triggered pull) refreshes `macro_src`. **State the latency: minutes if you trigger a pull, up to ~a day on the daily cadence.** The macro GitHub-Pages workflow can't reach localhost, which is *why* the publish-through-git path (not a localhost fetch) is the correct seam.

**Conventions to inherit (verified):** SAFE-name `=→_`, `^→_`; additive-leaf + try/except-never-fatal; bilingual `{en,zh}` label dicts; `scored:false`/disclaimer on display-only outputs; compact JSON (`separators=(",",":")`) for bar files, `indent=2,default=str` for snapshot dicts; re-theme/re-translate on `themechange`/`langchange` events reading CSS vars; **`bar_quality` flag on every series; model-facing projection slices arrays out.**

---

## 8. Proposed container layout

A new sibling directory mirroring how Mastermind is organized. **Frontend:** vanilla JS + Lightweight Charts v5 (matches `site/chart.js`, no React tax). **Backend:** Python **FastAPI** (mirrors Mastermind, lets you import the vendored macro `engine/` directly) + a small **Node** sidecar isolating PineTS behind the AGPL firewall.

```
/Users/chriswong/Documents/Cluade/charting-app/
├── README.md
├── config/
│   └── charting.yml              # provider keys via env/secret ref (NOT plaintext); universe; engine pins (pinets@<commit>)
├── vendor/
│   └── macro -> ../Macro Dashboard        # OPTIONAL local read of the LIVE tree (for builds/preview only).
│                                          #   NOTE: this is NOT the brain's source — the brain reads macro_src
│                                          #   AFTER the publish step. Do not conflate the two.
├── publish/
│   └── push_contracts.py         # ★ D8: stage→commit→push contract artifacts to the `macro` repo; optional pull-trigger
├── ingest/                       # live + historical market data
│   ├── polygon_live.py           # WS tick/quote/AH stream (extends collectors/polygon_options.py)
│   ├── alpaca_live.py            # cheaper-fallback feed (dev mode); respects 1-WS-conn ceiling
│   ├── session.py                # ★ session calendar (pre/RTH/post), holiday/half-day, gap + late-tick handling
│   └── bars.py                   # → ohlc + intraday JSON (mirrors build_chart_data.py; sets bar_quality)
├── signal_layer/                 # Python — the trusted math
│   ├── confluence.py             # promoted copy of research/signal_engine/confluence.py
│   ├── backtest.py               # Tier-1 run_backtest(...) -> backtest_result/v1 (+ ADDED metrics §5)
│   ├── golden_gate.py            # diffs any engine vs confluence.py oracle (CI fail; runs on REAL-OHLC symbol)
│   └── contracts.py              # mastermind.indicator/v1 + backtest_result/v1 emitters + projection/slicing
├── indicator_engine/             # Node sidecar — AGPL FIREWALL
│   ├── server.js                 # HTTP boundary: {script, ohlc, params} -> {series, signals}
│   └── pinets_runtime/           # pinets pinned to a COMMIT (worker_threads)
├── api/                          # FastAPI app
│   ├── main.py                   # /chart, /indicator, /backtest, /scan, /alert routes — AUTH + rate-limit on paid-data routes
│   └── bridge.py                 # writes contract artifacts to a staging dir → publish/push_contracts.py
├── data/
│   ├── cache/                    # REST/agg disk cache w/ eviction+size cap (tick data is huge)
│   └── backtests/                # *.returns.parquet sidecars w/ retention policy
└── tests/
    └── test_golden_gate.py       # the determinism receipt (on real OHLC)
```

**Why these choices:** FastAPI+Python keeps the trusted indicator/backtest math in the language where it's already faithful and where Opus reads it (no JS re-port → no "unfaithful port" regression). The Node sidecar is the *only* component touching AGPL PineTS, behind an HTTP boundary, commit-pinned. The `publish/` step is the corrected integration mechanic (D8). **New, addressing P2-2:** provider keys via env/secret reference (never plaintext in `charting.yml`); **auth + rate-limit on `/backtest` and `/scan`** (compute- and cost-amplification endpoints hitting a *paid* feed — an unguarded `/scan` over the universe is a real wallet-risk); cache eviction/size caps and a parquet retention policy.

---

## 9. Phased build plan

> Phase 0 was over-stuffed in the draft (P1-2): "lift `chart.js`" is a **re-validation spike** (color-mix abort, `autoSize` bug, resample logic, SAFE-name, live updates the original never handled), and it bundled scaffold + golden gate + two schemas + a validator + first render. **Split into 0a and 0b.**

**Phase 0a — scaffold + static render (small, shippable).**
Goal: stand up the container skeleton; lift `site/chart.js` + `lightweight-charts-v5.js` into `web/` and **re-validate the documented gotchas** against the new build; render one ticker from an `ohlc/<T>.json` file the new app writes.
Acceptance: the new app renders NVDA candles + RSI/StochRSI panes from its own emitted OHLC JSON; theme/lang re-render works; panes size correctly (no 300×150 stall).

**Phase 0b — golden gate + schemas (small, shippable).**
Goal: wrap `confluence.py` as the golden oracle; write the v1 contract schemas + a validator; **run the gate on a REAL-OHLC symbol (not the synthetic deep store).**
Acceptance: `golden_gate.py` passes on `confluence.py`'s own output (max abs diff < 1e-6) on a real-OHLC name; contracts validate; `bar_quality` is populated correctly.

**Phase 1 — single indicator + live data, end-to-end.**
Goal: connect the live feed (Alpaca dev, after SKU confirm) **with session-aware ingest (pre/RTH/post calendar, gap handling, reconnect+backfill, late-tick dedup)**; stand up the PineTS Node sidecar (commit-pinned); port the flagship `MACD STOCH RSI CONFLUENCE SIGNAL.pine`; emit `mastermind.indicator/v1` for one symbol and **pass the golden gate**; render its series on a LWC pane; live ticks update the chart across the RTH/AH boundary correctly.
Acceptance: a live-updating NVDA chart with the user's Pine confluence overlaid, its `signals[]` matching `confluence.py` events exactly; AH bars delineated and not drawn as a flat overnight line; the contract file is readable by the brain **after a publish→pull** via `read_signal`.

**Phase 2 — registry + fan-out + brain integration.**
Goal: registry of N indicators; batch-emit `signals/<id>/<symbol>.json` across the stock-picker universe (**state the universe cardinality + the write/IO + paid-data budget — Phase 2 could be thousands of files**); drop `charting_signals` onto `site/stockdata/<SAFE>.json` (Seam B); add the `_from_charting()` loader to `brain/intake.py` (Seam D); wire the scanner ("MTF confluence + RSI<30"); **implement the read-time projection so the brain ingests only sliced fields within the `cost_guard` ceiling (P0-4).**
Acceptance: after publish→pull, the stock-picker ranks on charting signals; an Opus `intake.build()` run surfaces a charting-flagged name with corroboration lift, reading only sliced fields; `bot_mcp.get_fundamentals` returns the new (sliced) fields.

**Phase 3 — authoring + backtesting.**
Goal: in-app Pine-like editor; Tier-1 `run_backtest` behind an **authed/rate-limited** FastAPI route emitting `backtest_result/v1` + return-series parquet (**including the added Sharpe/Sortino/CAGR/Calmar/exposure + per-trade fields; MAE/MFE gated on real OHLC**); chart overlays trade markers + equity curve; **after verifying `harness.score`/`enroll` signatures (P2-4)**, wire Seam E (spec → `loop/harness.score` → `promote.gate` → `enroll`); add vectorbt sweeps internally; add a falsifier gate like `risk_radar_backtest.py`.
Acceptance: a user-authored strategy runs a per-chart backtest, emits the contract with the new metrics, and a survivor `enroll()`s into `signal_archive` as a `sleeve_<hash>` — without editing the frozen harness.

**Phase 4 — graduation + hardening.**
Goal: graduate the feed to Polygon (~$199, collector reuse) or Databento (~$199, if redistribution-clean contracts needed); add Bar Replay, alerts→contract rows, multi-chart layout; harden the indicator sandbox with `isolated-vm` only if/when untrusted users author; finalize cache eviction + parquet retention. Defer auto-trendline/pattern detection and ML strategy lab.
Acceptance: full-SIP live + AH on the production feed; alerts fire as contract rows the brain subscribes to (post-publish); cost/IO budgets enforced.

---

## 10. Open questions / decisions for the user

| # | Decision needed | My recommendation |
|---|-----------------|-------------------|
| **D1** | **Market-data monthly commitment** — start at ~$99 or jump to ~$199? | **Start Alpaca (~$99) AFTER confirming the 2026 SKU bundles full SIP** and the 1-WS-conn limit fits your concurrency; **graduate to Polygon (~$199)** at Phase 4 for history/WS headroom + collector reuse. Don't pay for two. Re-verify all prices on the vendor page. |
| **D2** | **Charting-engine licensing path** — Lightweight Charts (build) vs KLineChart (toolbar included)? | **Lightweight Charts v5** — same engine the dashboard ships, zero migration; vendor an Apache-2.0/MIT drawing plugin (confirm its license + tool count). Switch to KLineChart only if you want the drawing/indicator UI out-of-the-box sooner. **Do not use TV Advanced Charts.** |
| **D3** | **Pine-runtime model** — PineTS (AGPL, firewalled) + PyneCore (Apache); bulk-convert the `.pine` library? | **Run both, firewalled** (PineTS in the Node sidecar, **commit-pinned**; PyneCore in-process). Use a one-time `.pine`→PyneCore converter as a build-time convenience if its current terms check out — not a runtime dep. Get the AGPL firewall reviewed *if* the app is ever shared/hosted. |
| **D4** | **Backtest framework spend** — own + vectorbt OSS, or buy vectorbt PRO? | **Own Tier-1 (promote `confluence.py`, then ADD the missing metrics) + vectorbt OSS (free, strictly internal/paper).** **Don't buy vectorbt PRO.** Commons Clause holds only while internal — re-evaluate if any of this becomes a service to others. |
| **D5** | **Redistribution / non-display exposure** — will live prices ever flow into *shared/hosted* pages, or will Opus ever *route orders* off the feed? | If shared/hosted is on the roadmap, prefer **Databento Standard (~$199)** (Equities Mini grants redistribution; Polygon's tier does not). If order-routing is ever added, **re-price for non-display first.** If purely local/private + paper, it's moot — stay Polygon. |
| **D6** | **MACD definition policy** — three coexist (`chart.js`/`cycles` price MACD 12,26,9 vs `confluence.py` RSI-MACD ~14,60,5). | **Make `macd_kind` AND the full `params` (incl. the RSI length the MACD runs on) required and folded into `source_hash` (§4).** Default the flagship to `rsi_based` with the faithful Pine lengths. `macd_kind` alone is insufficient — same enum, different lengths still disagree. |
| **D7** | **Indicator-sandbox timing** — when to harden execution? | **Defer adversarial sandboxing** (you + Opus are the only authors now). Adopt `isolated-vm` (JS) / OS-level isolation (Python) only when you expose authoring to untrusted third parties. Never use `vm2`/`node:vm`. |
| **D8** | **★ Integration source-of-truth (BLOCKING)** — how do contract artifacts reach the brain? | **Define an explicit publish step:** charting app commits/pushes contract JSON/parquet to the `macro` repo; `macro_src` pulls on the daily/cron cadence (or a manual trigger). **State the latency (minutes-to-a-day).** Do NOT assume the dashboard working tree and the brain's `vendor/macro → macro_src` are the same directory — **they are verified-separate checkouts.** Resolve this before green-lighting the integration thesis. |
| **D9** | **Opus context/cost policy (NEW)** — how does the brain ingest signals without blowing tokens? | **Project model-facing slices only** (`signals[]`/`state{}`/`honest_read`); the `series`/`gates`/`bars` arrays are chart-only and never sent to the model. Enforce in the `read_signal`/`get_fundamentals` projection with a per-call token ceiling tied to `brain/cost_guard.py`. This is what makes the "AI copilot" differentiator actually viable. |

---

### Notes on critique points deliberately not adopted as written
- **P2-5 (MarketSniper analog):** accepted in substance — §2 now frames the trimmed scope as a *judgment call*, not a benchmarked analog. I keep a single descriptive reference to the "signal-first chart + backtester + copilot" product *class* because it usefully conveys the shape of the target; I do not assert any specific product's feature set as a measured benchmark.
- **P1-3 (live/session handling) kept at P1, not elevated to P0:** the critique itself scopes this to Phase 1/4, and Phase 0a/0b ship without it. I added a full `ingest/session.py` design surface and acceptance criteria rather than treating it as a checkbox, which satisfies the substance without blocking the early phases.
- All other P0/P1 points (P0-1 symlink, P0-2 metrics gap, P0-3 synthetic OHLC, P0-4 token budget, P1-1 cost realism, P1-2 Phase-0 split, P1-4 unverified externals, P1-5 AGPL legal caveat, P1-6 Commons Clause boundary) and the P2 items (P2-1 params-in-hash, P2-2 auth/secrets/retention, P2-3 universe cardinality, P2-4 verify `loop/` signatures, P2-6 Renko/HA not native) are incorporated above.