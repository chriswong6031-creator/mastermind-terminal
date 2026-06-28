# Mastermind Terminal — Session Handoff

**Last updated:** 2026-06-27 · **Status:** all pages + core features built & verified; one large sub-project + live data deferred.
**Read order for a fresh session:** this doc → `docs/PRODUCT_PLAN_V2.md` (the product bar) → `docs/FEATURE_GAP_AUDIT.md` (what's left) → `docs/RESEARCH_AND_ARCHITECTURE.md` (deep background).

---

## 1. What this is
An institutional **charting SaaS** ("Mastermind Terminal"), a standalone local container, positioned **between MarketSniper Pro and TradingView**. It pairs a snappy TradingView-class chart with the user's **proprietary backtested confluence signal** ("Golden Oracle"), a **macro/regime read**, and an **Opus AI copilot**. Display-only / paper / research — **nothing executes orders**. Backtesting feed = **Polygon historical** (live/Alpaca deferred by the user).

It is a sibling to two existing local projects under `/Users/chriswong/Documents/Cluade/`:
- **Macro Dashboard** — the Python data pipeline + the faithful Pine signal port. Its `.venv` and Polygon key are reused here.
- **Mastermind** — the Opus brain / paper-portfolio app. Future integration target (publish-then-pull).

## 2. Where it lives / how to run
```
Container root:  /Users/chriswong/Documents/Cluade/charting-app   (LOCAL git only — NOT on GitHub)
Python venv:     /Users/chriswong/Documents/Cluade/Macro Dashboard/.venv/bin/python   (has pandas/numpy/pyarrow)
```
**Run the app (Next.js dev server, port 3002):**
- Via the Claude preview: `preview_start` with launch config **`mastermind-terminal`** (in `Macro Dashboard/.claude/launch.json`).
- Or manually: `cd terminal && npm run dev -- --port 3002`
- App URL: `http://localhost:3002`. **Sign in:** `demo@mastermind.test` / `mastermind123` (this account is set `is_pro=true`).

**Rebuild/refresh market data** (writes `terminal/public/data/*.json` + `manifest.json`):
```bash
cd /Users/chriswong/Documents/Cluade/charting-app
set -a; . ./.env; set +a
"/Users/chriswong/Documents/Cluade/Macro Dashboard/.venv/bin/python" ingest/build_polygon_universe.py
#   or:  ingest/refresh.sh   (cron-ready; rebuilds the full 34-symbol universe)
```

## 3. Tech stack
- **Frontend:** Next.js **16.2.9** (App Router) + React 19 + TypeScript + Tailwind 4 + **Lightweight Charts v5** — in `terminal/`.
- **Auth/DB:** **Supabase** (Postgres + Auth + RLS). **Data:** Polygon historical bars. **Signal math:** Python in `signal_layer/`.
- **Design system:** institutional — near-black chrome `#0a0b0e`, **navy chart pane only** `#131722`, flat blue accent `#2962ff`, hairline borders, tabular numerics. Tokens live in `terminal/app/globals.css` (`:root`).

## 4. Secrets / env (ALL gitignored)
- **`charting-app/.env`** (used by Python/CLI): `SUPABASE_ACCESS_TOKEN` (PAT — see warning), `SUPABASE_PROJECT_REF`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `POLYGON_API_KEY`.
- **`terminal/.env.local`** (used by the Next app): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
- ⚠️ **The Supabase PAT (`sbp_…`) was pasted in chat earlier — the user should rotate it** (Supabase Dashboard → Account → Access Tokens). The app itself doesn't use the PAT (only the URL + anon key); rotating it won't break the app. The PAT is only for Management-API migrations.
- The Polygon key is a real dedicated key on `api.polygon.io` (works for stocks + crypto aggregates; crypto via `X:BTCUSD` mapping in `ingest/polygon_bars.py`).

## 5. Supabase project
- **Project:** "MarketIntelligence", ref **`fsldfzlxyavsuwqbceod`**, org `macro`, region us-west-2. (Was paused; restored.)
- **Schema:** `supabase/migrations/0001_init.sql` — `profiles`(+`is_pro` Free/Pro gate, auto-created via `handle_new_user` trigger), `watchlists`(unique `(user_id,name)`) + `watchlist_symbols`, `chart_layouts`, `saved_scripts`, `alerts`, `favorites`. **All RLS owner-scoped.**
- **Apply SQL via the Management API** (no psql password on hand): `POST https://api.supabase.com/v1/projects/<ref>/database/query` with `{"query": "..."}` and `Authorization: Bearer $SUPABASE_ACCESS_TOKEN`. **Two hard-won rules:** (1) **strip `--` comments** first — the endpoint splits on `;` and chokes on a `;` inside a comment; (2) use **`curl`**, not python-urllib (urllib gets a Cloudflare 1010 block).

## 6. What's BUILT & verified
All routes are auth-gated (`terminal/proxy.ts` guards `/terminal /screener /scripts /portfolio /alerts`):
- **`/` landing** + **`/login`** (email/password; signup autoconfirmed).
- **`/terminal`** — `components/TerminalShell.tsx` (client) + `components/ChartPanel.tsx` (LWC v5). Multi-symbol; **chart types** candles/Heikin-Ashi/bars/line/area; **indicators modal** (EMA·BB·VWAP overlays + RSI·StochRSI·MACD·Volume panes); on-chart confluence BUY/SELL markers; **bar replay** (scrubber/play/speed, markers replay to cutoff); **timeframe favorites** D/3D/W/1M (resample; intraday = "live feed" placeholder); **stock search** (`+` / type-anywhere / ⌘K) + **add/remove → DB**; **watchlist table-view + columns** (localStorage); **AI copilot** slide-over (deterministic verdict+regime+backtest read); **seasonality card**; **snapshot**; detail card with Golden-Oracle WR/PF/CAGR.
- **`/screener`** — `ScreenerView`: scan by verdict/regime/sector, sortable WR/PF/CAGR, row→`/terminal?sym=`.
- **`/scripts`** — `PineEditor`: DB `saved_scripts` library, syntax-highlighted Pine (`lib/pine.ts`), inputs, golden-gate console, **Pro-gated save** (`/api/scripts/save` checks `is_pro` server-side).
- **`/alerts`** — `AlertsView`: signal-flip / regime-flip / price / RSI conditions; `/api/alerts` GET/POST/DELETE.
- **`/portfolio`** — `PortfolioView`: "Conviction Book", watchlist ranked by confluence + win-rate-weighted tilt.
- **Engine (Python, reused as the data builder):** `signal_layer/` = `confluence.py` (the GOLDEN ORACLE — faithful Pine port, never edit), `backtest.py` (Tier-1 + added metrics), `contracts.py` (`mastermind.indicator/v1` + `backtest_result/v1` + `model_slice`), `golden_gate.py`. `ingest/build_polygon_universe.py` runs it across 34 symbols → `terminal/public/data/<SYM>.json` + `<SYM>.slice.json` + `manifest.json`.

## 7. ~~DEFERRED~~ → BUILT (2026-06-28) — all items below shipped & smoke-tested
**Status: all 7 implemented and verified in the running app (logged in as demo, zero console/server errors).** See `docs/FEATURE_GAP_AUDIT.md` for the original spec. What landed:
1. **Drawing/overlay engine** — `lib/drawings.ts` + an SVG overlay inside `ChartPanel.tsx` synced to LWC coords (`timeToCoordinate`/`priceToCoordinate`, re-rendered on `subscribeVisibleLogicalRangeChange` + ResizeObserver). Left tool dock is now LIVE (trendline/ray/hline/rect/fib/text/measure/erase). Persists to the new `public.drawings` table (migration `0002_drawings.sql`, applied) via `app/api/drawings`.
2. **Detection** — `lib/drawings.ts` swing/pivot engine → auto-trendlines, auto-Fibonacci, S/R strength clusters, MTFA (daily + ≈weekly). Wired to the "Detect ▾" menu. (Verified: trendlines drew 2 lines + 4 anchors.)
3. **Strategy-tester report** — builder now emits FULL un-sliced `<SYM>.backtest.json` (trades + reconstructed equity curve). `StrategyTester.tsx` + the "Strategy tester" workspace tab render KPIs + equity curve (LWC) + trade log. (Verified NVDA: ×2.17 vs ×11.53 buy-hold, 6 trades.)
4. **Agentic copilot** — `app/api/copilot` runs a real tool-calling loop on **DeepSeek** (key pulled into `terminal/.env.local`) with tools `get_quote / get_intel / get_backtest / screen` over the data plane. `CopilotPanel.tsx` is now a chat. (Verified: called get_quote+get_intel, grounded reply.)
5. **Save/load chart layouts → DB** — `app/api/layouts` (upsert/list/delete) over the existing `chart_layouts` table + a "Layouts ▾" menu in the toolbar. (Verified round-trip.)
6. **Brain/Macro integration** — `ingest/pull_macro_intel.py` reads `../Macro Dashboard/site/stockdata/<SYM>.json` → `<SYM>.intel.json` (`intel/v1`); surfaced as a "Macro intel" card in the rail AND consumed by the copilot's `get_intel` tool. (26 symbols.)
7. **Live data** — `lib/live.ts` Polygon trades-WS client + a Historical/Live badge. OFF by default (account not real-time-entitled yet, per below); flip `NEXT_PUBLIC_LIVE=1` + a real-time `NEXT_PUBLIC_POLYGON_KEY` to activate — wiring is complete.

**Polish pass (2026-06-28, follow-up) — TradingView-grade UX:** drawings now support
select + drag-to-move + Delete/Esc + magnet-snap to OHLC + fat hit-targets + a floating
color/delete toolbar over the selection + a right-click chart context menu (hline /
remove-all / reset). Copilot renders model markdown (tables/headers) via `lib/md.ts`.
Rail: dropped the dead Watchlist/Details/Signals tabs, added a real "Recent signals" log.
All verified in the running app, zero console errors. Commits `0690405`/`f6f393f`/`be1c47c`.
**Follow-up 2 (same day):** copilot now STREAMS token-by-token (SSE in `app/api/copilot`,
live tool-step chips); **compare-symbols** overlay (rebased lines + legend chips, "Compare"
toolbar button); nav consistency — removed the duplicate dead "Markets" item and wired the
dead "AI" nav button to open the copilot (`mm:copilot` event / `?ai=1`). All verified.
**Hardening pass:** an adversarial multi-dimension review (7 finders → verify) surfaced 15
confirmed bugs, all fixed: sticky drawing-selection (empty-click now deselects via window
pointerdown); copilot stream crash on mid-stream symbol switch (AbortController + request-gen
guard + empty-array guard); copilot endpoint now auth-gated + sanitizes client messages (role
allowlist, size caps, strips forged system/tool turns); cross-symbol drawing data-loss (stale-GET
`alive` guard + flush-pending-save on switch); async-IIFE leak (dead-recheck after the compare
await); stranded drag listeners cleaned up; detect retries until bars load; compare reset on symbol
switch + dynamic precision + common-origin rebase + active-symbol filtered; sticky-bottom copilot
autoscroll; live-WS dead-guard. Layouts also persist the compare set. All re-verified in-app, zero
console/server errors. Commit `<this batch>`.
**Follow-up 3 — multi-pane chart grid (same day):** the toolbar `1 | 2 | 4` split renders a
synced grid of independent `ChartPane`s (`ChartPane.tsx` + `.pane-grid` CSS), each owning its
own symbol + drawings; the focused pane is outlined and drives the header/toolbar. A second
adversarial review (multi-pane focus) found **10 more real bugs**, all fixed & verified: duplicate-
symbol panes (picking an already-shown symbol focuses that pane; auto-fill seeds unique watchlist
symbols only); background panes no longer hijack snapshot / Delete-key / click-to-select (gated by an
`isActive` ref); module OHLC cache split into `ohlcCache`/`sliceCache` so compare can't poison the
primary series; stale async drawings-GET no longer clobbers fresh edits (`pending.current === null`
guard); `onActivate` fires only when inactive; 3-pane CSS layout. Verified: 1/2/4 render a clean 2×2
grid with live charts, no overflow, unique symbols, inactive-pane draws are no-ops. Commit `ecb8ab9`.
**Follow-up 4 — page-consistency sweep (same day):** an adversarial audit of every non-Terminal
page against the Terminal's bar (7 finders → per-finding verify) confirmed **34 real issues**, all
fixed & verified in-app (prod build green). The big one was **Scripts**: it went from a wall of
decorative dead controls to a real tool — editable source (textarea overlay synced to the highlight
layer, so Save persists real edits), working −/+ steppers, a header script-switcher dropdown, a
Run/compile button with lightweight client compile (flags unbalanced parens / missing `indicator()`),
a **script-aware** console (MACD no longer claims oracle backtest parity), an empty state, and a real
disabled affordance for free accounts. Also: Alerts (create/delete error-handling + in-flight guard +
rollback + loading state + aria-labels + de-duped heading); Screener (loading/empty/error states,
Golden-Oracle chip deduped to `.chip.on`, name truncation); Portfolio (loading/empty, the dead `pf`
field surfaced as a Profit-factor column, CSS row-hover); Home/Login (`?mode=signup` honored under
Suspense, stale error/busy cleared on mode switch, mode toggles are real buttons); IndicatorsModal
Escape-close; SeasonalityCard no-sample vs true-0% distinction; nav a11y (`aria-label`/`aria-current`);
CSS hygiene (defined `--ease`, un-clipped the watchlist popover, tokenized Pine colors + brand-hover,
removed dead `--up-soft`/`--down-soft` + the unreachable `[data-n="3"]` rule, input focus indicators).
Commit `facc482`.
**Follow-up 5 — cross-pane sync (same day):** a "Sync" toggle (shown only in 2/4 split, default on)
that mirrors the focused pane's crosshair + visible time-range onto every other pane via a small bus
(`lib/paneSync.ts`). Crosshair is mirrored by **time, not price** — each peer looks up its own close at
that time, so a $192 NVDA crosshair lands on BTC's candle at the same date, not at $192. `ChartPanel`
gets a `syncId` prop and registers {chart, series, valueAt} + broadcasts on crosshair-move / range-change
(dead-guarded teardown); a re-entrancy guard kills echo loops; TerminalShell gates the bus to multi-pane.
Verified deterministically (bus wiring): 2 peers register, range + crosshair forward to peers with each
peer's own value, null clears, toggle gates. NOTE for future verification: the headless preview tab runs
**hidden**, and LWC commits range/crosshair on `requestAnimationFrame` which is paused when
`document.hidden` — so visual range/crosshair changes and synthetic-hover crosshairs won't paint between
evals (charts still render in `preview_screenshot`, which forces a paint). Assert the driving API calls
(spy on `setVisibleLogicalRange`/`setCrosshairPosition`) rather than the painted result. Commit `0601426`.
**Follow-up 6 — regression self-review (same day):** a finder→verify workflow over this turn's diff
(base `15dbf6e`) confirmed **5 regressions**, all fixed (`8570f0c`). The important one: the cross-pane
**range echo loop** — paneSync's synchronous `applying` guard can't contain range mirroring because LWC
applies `setVisibleLogicalRange` on the NEXT rAF (after the flag resets), so peers re-broadcast and fight
(differing bar counts → differing clamp). Fixed with a per-peer suppression marker (armed only when a peer
will actually move; swallows one echo). The crosshair path was already safe — LWC's `setCrosshairPosition`
uses `skipEvent` and fires no move event. Verified the fix with a **Node simulation** of the async-rAF +
differing-clamp scenario (compile paneSync.ts with esbuild, mock peers): converges in 2 set-calls, no loop
— a good pattern when the preview browser is unavailable. Also fixed: AlertsView optimistic-delete restored
a stale full list (now re-inserts only the failed item), empty-state rows read as clickable (added
`.empty-row`), PineEditor gutter desynced on a trailing newline (`lines` mirrors the textarea 1:1), and the
split-button highlight keyed off `panes.length` instead of the requested split. NOTE: the `preview_start`
tooling failed this session with `spawn .../Helpers/disclaimer ENOENT` (intermittent env issue) — fall back
to `npm run dev` over Bash + curl for route/compile checks, and Node sims for pure-logic verification.
**Follow-up 7 — per-pane timeframes (same day):** each split-grid pane now carries its own timeframe
(`paneTfs[]` in TerminalShell; `tf` is derived from `paneTfs[activePane]`). The toolbar TF selector
drives the active pane and reflects its interval on focus change; new panes inherit the active tf; a TF
chip shows in each pane header. Cross-pane sync is gated to **same-timeframe** panes (logical ranges/bar
times aren't comparable across intervals) — ChartPanel registers its peer with its tf and paneSync skips
mismatched tfs. Layouts persist/restore `paneTfs` (back-compat: older single-`tf` layouts fill all panes).
The unique-symbol-per-pane invariant is intentionally kept (drawings keyed by symbol), so a same-symbol
MTF layout is deferred until the drawing store is keyed by symbol+tf. Verified in-app ([D,W] independent,
toolbar tracks active pane, collapse/expand inherit) + Node sim for the tf-gated sync. Commit `e5f35b9`.
**Follow-up 8 — workspace persistence (same day):** the split grid + per-pane symbols/timeframes + active
pane + sync toggle now survive a reload via localStorage `mm.ws` (restore on mount filters saved symbols
against the current universe and snaps split to the pane count; a `?sym=` deep-link always wins; save is
gated behind a `restored` ref so the default state can't clobber the saved layout before restore runs).
Verified: build [NVDA·D, BTC·W] split-2 → reload → fully restored; `?sym=AAPL` → single AAPL pane. Commit `8260ce3`.

**Historical context (original deferral notes):**
1. **Interactive drawing tools** — the left tool dock is currently DECORATIVE. Build an absolutely-positioned canvas/SVG overlay synced to LWC's `timeToCoordinate`/`priceToCoordinate`; persist to a new `drawings` table. (P0 in the audit.)
2. **Automated trendline detection** → **auto-Fibonacci** → **S/R strength heatmap** → **MTFA overlay** — all share #1's overlay + a swing/pivot engine. (TrendSpider signatures; high edge.)
3. **Full Strategy-Tester report** — equity curve + trade list. NOTE: `model_slice` strips `trades[]`/`_returns`; to build this, emit a FULL (un-sliced) backtest JSON per symbol from `build_polygon_universe.py` (the data is already computed in `backtest.run_backtest`).
4. **Agentic** LLM copilot — currently a sharp **deterministic** read. To make it agentic, wire a real Opus tool-calling loop over the Screener/Alerts/backtest APIs (needs an Anthropic key; the Macro Dashboard `.env` may have one).
5. **Save/load chart layouts → DB** (`chart_layouts` table exists; UI state currently only in localStorage). Multi-chart grid, compare-symbols, earnings markers.
6. **Brain/Macro-Dashboard integration** — the publish-then-pull contract flow (research doc §7) is NOT yet wired; contracts currently land in `terminal/public/data`, not committed to the `macro` repo.
7. **Live data** — Alpaca/Polygon WebSocket feed (user deferred until the account lands). The whole app is built on historical Polygon for now.

**Recommended next build:** the overlay engine (#1→#2) as its own focused pass — it's the biggest remaining credibility lever and unlocks several audit items at once.

## 8. CRITICAL gotchas (will waste hours otherwise)
- **Turbopack `.next` cache does NOT hot-reload APPENDED `globals.css` rules.** Symptom: new CSS classes render unstyled (`getComputedStyle` shows `display:block`, no error in logs). **FIX: `rm -rf terminal/.next` then restart the dev server.** A plain reload/restart is NOT enough.
- **Preview viewport starts at 0×0** → always `preview_resize` with explicit `width`/`height` (the `desktop` preset gives 0×0). LWC `canvas.width` may read `300x150` but still render fine — trust the screenshot.
- **First `/terminal` (or `/scripts`) load right after signup races the auth cookie** → seed-then-read returns empty. Guards render a calm "setting up" shell; a reload fixes it. (Why a unique index on `watchlists(user_id,name)` exists.)
- The browser preview has a **MetaMask extension** that throws `Failed to connect to MetaMask` in console — **not our app**, ignore.
- `signal_layer/confluence.py` is the **golden oracle** — keep it a faithful copy; don't "improve" the math or the parity gate loses meaning.

## 9. Key files
```
HANDOFF.md (this) · README.md · docs/{PRODUCT_PLAN_V2,RESEARCH_AND_ARCHITECTURE,FEATURE_GAP_AUDIT}.md
supabase/migrations/0001_init.sql
signal_layer/{confluence,backtest,contracts,golden_gate}.py
ingest/{polygon_bars,build_polygon_universe}.py · ingest/refresh.sh
terminal/
  app/{page(landing),login,terminal,screener,scripts,alerts,portfolio}/  · app/api/{watchlist,alerts,scripts/save}
  components/{TerminalShell,ChartPanel,ScreenerView,PineEditor,AlertsView,PortfolioView,
             SearchModal,IndicatorsModal,CopilotPanel,SeasonalityCard,AppNav,BrandMark}.tsx
  lib/{supabase/{client,server,middleware},pine}.ts · app/globals.css (design tokens) · proxy.ts (auth guard)
web/   = original static design mockups (pre-Next.js reference; web/mockup/index.html is the v5 design comp)
```

## 10. Git
Local repo (no remote). Latest commits: `f9b8013` (gap audit doc) → `4b39e6a` (polish) → `5a0009a` (terminal features + Alerts/Portfolio) → `725f544` (screener+pine+nav+is_pro) → `6a16788` (Polygon multi-symbol) → `867a160` (Phase 1 Next.js+Supabase). Standing convention in this workspace: commit autonomously; this container is local-only (do NOT push it to GitHub unless the user asks).
