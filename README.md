# Mastermind Terminal

An institutional **charting SaaS** — a standalone sibling container to `Mastermind` —
positioned between MarketSniper Pro and TradingView. It pairs a snappy TradingView-class
chart with a **proprietary backtested confluence signal**, a **macro/regime read**, and an
**Opus AI copilot**, on real market data. Display-only / paper / research — nothing executes.

## Stack
- **Frontend:** Next.js 16 (App Router) + React 19 + TypeScript + Lightweight Charts v5, in
  `terminal/`. Institutional design system (black chrome, navy chart, flat-blue accent).
- **Backend / auth / data:** Supabase (Postgres + Auth + RLS) — users, watchlists, saved
  scripts, alerts, the Free/Pro gate. Market data = **Polygon historical** (backtesting feed;
  live/Alpaca deferred). The trusted signal math lives in `signal_layer/` (Python).
- **Engine:** the faithful Pine confluence port (`signal_layer/confluence.py`) + Tier-1
  backtester + the `mastermind.indicator/v1` & `backtest_result/v1` contracts.

## Pages / features
- **Terminal** (`/terminal`): multi-symbol chart (candles / Heikin-Ashi / bars / line / area),
  EMA·BB·VWAP overlays + RSI / StochRSI / MACD / Volume panes, on-chart confluence BUY/SELL
  markers, **bar replay**, timeframe favorites (D/3D/W/1M), stock search (`+` / type-anywhere /
  ⌘K) with add-to-watchlist, watchlist table/column settings, a **Golden-Oracle verdict card**
  (WR/PF/CAGR), a **seasonality card**, snapshot, and the **AI copilot** slide-over.
- **Screener** (`/screener`): scan the universe by Golden-Oracle verdict / regime / sector;
  sortable WR/PF/CAGR table; row → chart deep-link.
- **Pine Editor** (`/scripts`): DB-backed My-Scripts library, syntax-highlighted Pine, inputs,
  golden-gate parity console, **Pro-gated save**.
- **Alerts** (`/alerts`): signal-flip / regime-flip / price / RSI conditions (DB-backed).
- **Portfolio** (`/portfolio`): "Conviction Book" — watchlist ranked by the confluence +
  win-rate-weighted tilt.
- **Auth**: email/password; **Free vs Pro** gate (`is_pro`) on custom + proprietary indicators.

## Run
```bash
# 1) build/refresh market data (real Polygon → terminal/public/data/*)
set -a; . ./.env; set +a            # POLYGON_API_KEY + Supabase keys (gitignored)
"$MACRO_VENV/bin/python" ingest/build_polygon_universe.py     # or: ingest/refresh.sh

# 2) run the app
cd terminal && npm run dev          # http://localhost:3002  (or via the preview launch config)
```
Daily data refresh: `ingest/refresh.sh` (cron example inside).

## Layout
```
terminal/            Next.js 16 SaaS app (app/, components/, lib/supabase, api/)
signal_layer/        confluence oracle + backtester + contracts + golden gate (Python)
ingest/              Polygon bars + universe builder + refresh.sh
supabase/migrations/ 0001_init.sql (profiles+is_pro, watchlists, scripts, alerts, … all RLS)
contracts/           v1 JSON Schemas + samples
docs/                RESEARCH_AND_ARCHITECTURE.md, PRODUCT_PLAN_V2.md
web/                 the original static design mockups (pre-Next.js reference)
```

> Not on GitHub yet (local container, like `Mastermind`). Integrates into the Macro Dashboard
> via the publish-then-pull contract flow (see `docs/`).
