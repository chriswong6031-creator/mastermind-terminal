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

## 7. What's DEFERRED (the next big chunk) — see `docs/FEATURE_GAP_AUDIT.md`
Mostly **one cohesive sub-project: a swing-detection overlay engine**, plus live data + brain integration:
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
