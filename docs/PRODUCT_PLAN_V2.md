# Mastermind Terminal — v2 Research & Product Plan
**Institutional-grade charting SaaS, positioned between MarketSniper Pro and TradingView**

*Lead product architect synthesis · 2026-06-26 · supersedes the Phase-0 frontend/product plan. The Phase-0 BACKEND — `signal_layer/`, the v1 contracts, the golden-gate parity harness, and the data feed — is preserved verbatim and treated as the immutable Research Plane.*

---

## 0. Decisions locked (2026-06-27)

User confirmed against the first mockup:

1. **Brand** — use the **real Mastermind logo** from the macro repo (the `brand-glyph` "M" tile + `MASTERMIND` wordmark, single source). Done in the mockup.
2. **Data provider** — **Alpaca** (start on Alpaca; confirm the SKU bundles full SIP for production). Polygon/Databento are future graduations, not v1.
3. **Subscription tiers — keep it minimal for now** (the whole Mastermind + Macro Dashboard suite will be gated later, so don't over-build billing):
   - **Free** — full chart + market data access, **but cannot use custom Pine indicators or our prebuilt proprietary ("Mastermind") indicators**.
   - **Pro** — full unlock (custom + proprietary indicators, AI copilot, alerts, backtesting).
   - Implementation: a single `is_pro` boolean gate on the indicator/script/copilot surfaces; defer multi-tier metering.
4. **Accent color + visual language** — **blue, not violet**, and **flat institutional, not friendly-SaaS.** The reference is **Coinbase *Advanced*** (their pro/institutional trading platform), explicitly **not** retail Coinbase. Pivot applied 2026-06-27: **pure-black** canvas (`#07080a`), **no gradients, no glows, minimal radii** (4–8px, fewer pills), hairline dividers, **tabular numerics**, confident whitespace; flat Coinbase-blue (`#1652f0`/`#3b82f6`) used **sparingly** (active nav, active tab underline, selected pill, links, one CTA). Layout adopts the Coinbase-Advanced shell: **header stat-row** (Last / 24h Change / 24h Vol / 24h High / 24h Low), **left icon app-nav rail** (Chart / Markets / Screener / Portfolio / Alerts / AI), chart **tool dock**, and a **bottom movers ticker-tape**. The bar is "used by billionaires — sleek, matte, professional," not toy/bubbly. The earlier violet `#7c5cff` is retired (survives only faintly inside the logo glyph).
5. **Chart** — must match TradingView's beauty + responsiveness. We use **TradingView Lightweight Charts** (open-source, TypeScript, **HTML5 Canvas** renderer — the same canvas approach that makes TradingView fast; the flagship TradingView "Advanced Charts" engine is closed-source, but the snappiness recipe — canvas + imperative data updates + Web Workers — is ours to reuse). The mockup already renders on it.

---

## 1. What changed & why

Phase 0 shipped a **correct but unsellable** thing: a static harness that proves the golden-oracle confluence signal ports faithfully from Pine to Python, with two versioned contracts (`mastermind.indicator/v1`, `backtest_result/v1`), a `model_slice()` that shrinks a 400 KB raw surface to ~6 KB for the Opus brain, a golden-gate parity gate, and real AAPL/NVDA sample contracts. That backend is excellent and stays. The user rejected the **front of the house** as "too simple."

**The re-scope, in one sentence:** stop shipping a research harness; ship a **beautifully designed, snappy, paid SaaS web app** that a trader would put a credit card behind — and let the Phase-0 engine become its quiet, powerful backend.

**The bar, stated precisely:**

| Axis | Minimum (floor) | Target | Ceiling (do NOT match) |
|---|---|---|---|
| **Feature depth** | MarketSniper Pro | **Between MS and TradingView** | Full TradingView (80+ drawing tools, social feed, broker routing) |
| **Polish / design** | Above MarketSniper | Linear-grade institutional cockpit | — |
| **Responsiveness** | Beat MarketSniper's sluggishness | **As snappy as TradingView's web app** | — |

Two corrections to the charter that the findings force, and we adopt:

1. **Next.js 16, not 15.** Next.js 16 went GA **2025-10-21** (Turbopack default, React Compiler stable, React 19.2, `experimental.ppr` replaced by **Cache Components**). Building on 15 would adopt a deprecated caching/PPR model on day one. Source: https://nextjs.org/blog/next-16
2. **Lightweight Charts v5.2.0** (35 kB, Apache-2.0, **native multi-pane**) — the Phase-0 engine decision is reconfirmed; v5's native panes remove the only reason we'd have considered TradingView Advanced Charts for v1. Source: https://www.tradingview.com/blog/en/tradingview-lightweight-charts-version-5-50837/

The Phase-0 **publish-then-pull** integration is also preserved: contract artifacts are committed to the macro repo and read by the brain from its own checkout (`macro_src`), never a shared filesystem.

---

## 2. Product vision & positioning

Mastermind Terminal is a blue-graphite institutional charting cockpit where **color is information and the chart has an opinion.** It pairs a TradingView-fast canvas with three things no competitor ships together: a **proprietary, backtested confluence signal** (the user's flagship RSI-MACD × StochRSI MTF "Golden Oracle," already ported in `signal_layer/`), a **live macro/regime context layer** (the Macro Dashboard engine — regime, breadth, sector rotation, credit/vol risk), and an **Opus-4.8 AI copilot** that reads the ~6 KB `model_slice()` surface and *explains the setup in plain language*. MarketSniper gives you proprietary signals but no reasoning and a sluggish app; TradingView gives you a fast app and a scripting ecosystem but no opinion. Mastermind gives you a fast app, a proprietary opinion, **and the reasoning behind it** — plus the one feature MarketSniper users keep asking for, a personal "My Scripts" Pine library.

> **Elevator pitch:** *As fast as TradingView, smarter than both. Mastermind Terminal is the only charting terminal where a verified, backtested confluence signal, a top-down macro/regime read, and an Opus AI copilot work as one system — so you don't just see the chart, you understand the setup.*

**The moat is the three-layer stack, and it is already built on the backend:**

| Layer | What it is | MarketSniper | TradingView | **Mastermind** |
|---|---|---|---|---|
| **(a) Sniper-class signal** | The Golden Oracle confluence + Tier-1 backtester, on-chart BUY/SELL markers | Black-box "Sniper" indicators, no backtest, no explanation | Community Pine scripts, nothing curated as verified edge | **Verified, backtested, model-sliced — you see the win-rate evidence, not just the arrow** |
| **(b) Macro / regime** | Regime label, earnings, dividends, breadth, sector rotation, cross-asset risk | Single-name regime word only | Fundamentals + calendar, no synthesized regime | **Full top-down stack already computed in the macro engine** |
| **(c) Opus copilot** | LLM reasoning over the contracts | None | None | **Category-defining — nobody pairs a proprietary signal with an LLM that defends it** |

---

## 3. Feature scope

Calibration: **MUST = at/above MarketSniper parity · SHOULD = the "between MS and TV" tier where we win · NICE = opportunistic · SKIP = full-TV overkill.** ⭐ = wedge differentiator. Every row cites the reference screenshot that defines it (all 15 MS + 23 TV shots read in full; paths `/private/tmp/cw_assets/{marketsniper,tradingview}/...`).

### 3.1 Distilled per-screen inventory (the bar, in one place)

**App shell (MS `main dashboard.png`, `timeframe.png`):** 3 columns — top bar (settings gear · `Chart ▾` · symbol pill · favorite ★ · TF buttons `D`/`W`/`▾` · chart-type `▾` · `Indicators` (+) · `▷ Replay` · undo/redo · layouts square · `Default ▾` saved layout · camera/snapshot); a slim **left tool dock** (crosshair, trendline, channel, fib, text, sticker, measure, zoom, magnet); center candlestick chart with OHLC status line + last-price line; right rail (watchlist + stock card).

**Stock-detail card (MS `stock details on sidebar.png` + `…scroll down.png`; TV `…23.27.42/49/54/58/28.03/09/14.png`):** logo + name + price hero + sector·exchange + change; rows **Open, Day Range, Prev Close, Volume (+ rel-vol ×1.35), Avg Vol, Market Cap, 52W High (−% distance), 52W Low (+% distance)**; ⭐ a green-dot **regime chip ("Uptrend regime")**; sections **EARNINGS** (beat/miss scatter), **DIVIDENDS** (payout donut), **RETURNS** tiles (1M/3M/YTD/1Y), **SEASONALITY** multi-year overlay. TV adds Key stats (P/E, EPS, float, beta, next-earnings countdown), Income statement (Annual/Quarterly), AI news card.

**Indicators modal (MS `all indicators/trend/momentum/volatility/volume/sniper custon indicators.png`; TV `have a place where user can save their pine indicators….png`):** search + **category pills `All | Trend | Momentum | Volatility | Volume | [proprietary]`** + per-row `ⓘ` tooltip + favorite ★. TV's superset is the tri-section **PERSONAL (Favorites / My scripts / Invite-only / Purchased) · BUILT-IN (Technicals / Fundamentals) · COMMUNITY (Editors' picks / Top / Trending / Store)**. The proprietary pill = **"Mastermind"** (our Sniper equivalent).

**Pine editor (MS `pine editor.png`):** code panel, script tab `MACD+STOCH RSI`, syntax highlight, line numbers, `▷ Publish script`. The visible code is literally the user's RSI-MACD confluence (`grpR="RSI-MACD (TH_RSIMACD+)"`). **MS has the editor but no saved-script library** — that is the explicit gap.

**Symbol search (MS `pop up search for stock.png`):** overlay, logo + ticker + name + compare/layers icon + `+` add, current ✓, keyboard hints `↑↓ Navigate · ↵ Select · Esc Close`.

**Timeframe (MS `timeframe.png`):** `1H 4H 8H 12H D⭐ 3D W⭐ 2W M + Custom…`, each star-favoritable. **Note: our Golden Oracle is 3D-native — make 3D first-class.**

**Chart types (MS `switch between type of line.png` = 6; TV `…23.26.38.png` = 21):** MS = Candles, Hollow, Bars, Line, Area, Heikin-Ashi. We ship MS's 6 + a cheap second wave (Step line, Baseline, Line-with-markers, Columns).

**Watchlist (MS `watchlist.png` + `watchlist drop down….png`):** header `Default 6 ▾`, search/add/settings/collapse, columns **SYMBOL | PRICE | CHG%**, filter box, **collapsible section dividers**, `+ New Watchlist` / `+ Add Section`, per-symbol favicon, right micro-rail (details/news/alerts/notes).

**Settings (TV `…23.28.44/49/53/59.png`):** Symbol (body/border/wick colors, precision, tz, dividend-adjust) · Status line · Scales and lines (Regular/Percent/Log/Indexed, countdown-to-close) · Canvas (background gradient, grid, crosshair, margins). This depth is table-stakes polish.

**Drawing tools (TV `…23.26.49/53/56/59/27.04/08/11.png`):** TV has 80+ across Lines/Channels/Pitchforks/Fibonacci/Gann/Patterns/Elliott/Cycles/Forecasting/Volume/Brushes/Arrows/Shapes/Text/Stickers. We ship a **useful subset**, not the long tail.

### 3.2 The matrix

#### MUST-HAVE (v1 — MarketSniper parity or better)

| # | Feature | Evidence | Our angle |
|---|---|---|---|
| M1 | 3-column shell (top bar · left dock · chart · right rail) | MS dashboard, timeframe | Reproduce 1:1; slim 44px left dock is the single biggest "premium terminal" tell |
| M2 | Canvas chart engine, GPU-snappy | both | **Lightweight Charts v5.2.0**, native multi-pane |
| M3 | Chart types: Candles, Hollow, Bars, Line, Area, Heikin-Ashi | MS switch-type | MS's exact 6 |
| M4 | TF selector w/ favorites (1H/4H/8H/12H/D/3D/W/2W/M/Custom) | MS timeframe | ⭐ **3D first-class** (Golden Oracle native TF) |
| M5 | Symbol search overlay (logo, name, compare, +add, ⌨ nav, ✓) | MS search | Keyboard-first |
| M6 | Watchlist: SYMBOL/PRICE/CHG%, filter, multi-list, **section dividers**, add/settings/collapse | MS watchlist + dropdown | New Watchlist + Add Section |
| M7 | Symbol-detail card (price, sector·exchange, OHLC rows, rel-vol, mkt cap, 52W hi/lo +% distance) | MS stock details; TV key-stats | Macro engine already computes all of it |
| M8 | ⭐ **Regime chip** | MS "Uptrend regime" | Richer Mastermind/macro regime, not a single word |
| M9 | EARNINGS · DIVIDENDS · RETURNS tiles · SEASONALITY overlay | MS scroll; TV earnings/div/perf/seasonals | Already in macro engine |
| M10 | Indicators modal: search + pills All/Trend/Momentum/Volatility/Volume + ⭐ **Mastermind** + ⓘ + favorite ★ | MS 6 category screens | Proprietary pill = Mastermind |
| M11 | Built-in indicator set (the MS list) | MS 5 category screens | RSI, MACD, Stoch, BB, EMA/HMA, VWAP, Vol Profile, Ichimoku, Squeeze, ADX, ATR, Keltner/Donchian, OBV, MFI, CMF |
| M12 | ⭐ **Mastermind proprietary indicators** (Sniper-equivalent) | MS sniper screen | Confluence Signal, Confluence Candles, Regime MA, MTF RSI/Stoch, Targets, Macro Sweeps — fed by `mastermind.indicator/v1` |
| M13 | ⭐ **On-chart BUY/SELL/RE-BUY markers** | TV pins; MS Sniper Signals | Golden Oracle rendered via LWC `createSeriesMarkers` plugin — the "pay for it" hook |
| M14 | Core drawing tools subset (crosshair, trendline, ray, h/v line, rectangle, fib retracement, text/note, measure, brush, magnet, eraser, lock, hide) | MS rail; TV Lines/Shapes/Text | Useful subset, not TV's 80+ |
| M15 | Status-line OHLC + change readout | both | |
| M16 | Price-scale modes (Regular/Percent/Log/Invert/Auto, lock ratio, move scale) | TV scale context menu | Right-click menu |
| M17 | Undo/redo, snapshot/export-image, settings gear | MS top bar | |
| M18 | Live quotes (streaming last + chg) | both | Dedicated market-data WS (see §5) |
| M19 | Chart Settings modal (Symbol · Status line · Scales · Canvas) | TV 4 settings tabs | Match TV depth — table-stakes polish |
| M20 | Dark institutional theme + PWA + **TV-class responsiveness** | requirement | Next 16 + React 19.2 + canvas off main thread |

#### SHOULD-HAVE (the "between MS and TV" tier — where we beat MarketSniper)

| # | Feature | Evidence | Our angle |
|---|---|---|---|
| S1 | ⭐ **My Scripts / saved-indicators library** (Personal: Favorites / My scripts / Invite-only; Built-in: Technicals / Fundamentals) | TV "save pine…" | **The explicit MS gap the user wants.** Supabase-backed, optimistic CRUD |
| S2 | Pine-style editor (syntax highlight, tabs, Save/Publish) | MS pine editor | Lazy-loaded Monaco/CodeMirror; backed by `signal_layer` compile/parity |
| S3 | Alerts (price + indicator/signal cross) + alerts inbox (bell badge) | TV alert-clock, bell; Settings→Alerts | ⭐ Fire on Mastermind confluence flip — high willingness-to-pay |
| S4 | Bar **Replay** mode | MS + TV ◅◅ | Scrub history bar-by-bar |
| S5 | Multi-pane layout (price + oscillator panes) | LWC v5 native; TV | Free with v5 |
| S6 | Saved chart **layouts/templates** (`Default ▾`) | MS top bar; TV | Per-user persisted |
| S7 | Extended chart types (Step line, Baseline, Line-w-markers, Columns) | TV chart menu | Cheap adds beyond MS's 6 |
| S8 | Fundamentals sub-panels (earnings beat/miss scatter, dividend donut, income bars Annual/Quarterly) | TV symbol-info | Macro engine has data; richer than MS |
| S9 | ⭐⭐ **Opus AI copilot** ("explain this signal / regime / what changed") | new differentiator | Reads ~6 KB `model_slice()` — **no competitor has it** |
| S10 | News card per symbol (AI-summarized) | TV news chip | Reuse macro news pipeline |
| S11 | Economic-event badges (E/D) on time axis + Settings→Events | TV time axis | |
| S12 | Compare / overlay symbols | MS search layers icon | |
| S13 | Watchlist→detail micro-tabs (details/news/alerts/notes) | MS far-right rail | |
| S14 | Stickers/emoji/flag annotations | TV picker | Low effort, nice polish |
| S15 | Second-wave drawing tools (parallel channel, fib extension, Anchored VWAP, position/long-short tool, pitchfork) | TV flyouts | |

#### NICE-TO-HAVE

| # | Feature | Evidence |
|---|---|---|
| N1 | Multi-chart grid layouts (2/4 charts) | TV layout `▦` |
| N2 | Volume Profile / Fixed-range / Session volume profile | TV volume-based; MS Volume Profile |
| N3 | Renko / Kagi / P&F / Range / HLC-area / Volume-candles | TV chart menu |
| N4 | Elliott Wave / Gann / advanced pattern tools | TV pattern/Gann flyouts |
| N5 | SELL/BUY spread quote badges | TV |
| N6 | ⭐ "Mastermind picks" curated read-only shelf (community analog) | TV community section |
| N7 | Image/Idea/Post chart sharing | TV Text→Content |
| N8 | Custom-timeframe builder | MS/TV "Custom…" |

#### SKIP (full-TradingView overkill)

| Skip | Why | Evidence |
|---|---|---|
| Broker order routing / live Trade button | Not a brokerage; "don't execute trades" | TV `Trade`, Settings→Trading |
| Level-2 / order-book depth, footprint, TPO | Microstructure, off-thesis | TV chart menu |
| Full social network / public Ideas feed / followers | Not our product | TV Content |
| 80+ exhaustive drawing tools (Gann square fixed, Schiff variants, fib spiral/wedge, Sine line, Ghost feed) | Long-tail, low-use | TV flyouts |
| Invite-only / Purchased / paid 3rd-party Store | Our scripts are first-party (Mastermind) | TV personal/community |
| Crypto perp / options-chain / yield-curve charts | Scope creep for v1 | — |

---

## 4. Frontend architecture & the snappiness playbook

**Stack decisions (decisive):** Next.js **16** (App Router, Turbopack default, React Compiler stable) · React **19.2** (View Transitions, `<Activity>`, `useEffectEvent`) · Lightweight Charts **v5.2.0** · **Zustand** for workspace state · **Web Workers (Comlink)** for indicator/backtest math · **TanStack Query** for the server cache. Min runtime Node 20.9+, TS 5.1+.

### 4.1 The App Router does NOT fight a stateful canvas — if scoped right

The product is **a thin RSC shell wrapping one big client island**, not "an App Router app." Route map (Next 16):

```
app/
  (marketing)/        → RSC, fully static/cached. Landing, pricing, docs. Near-zero JS, great SEO.
  (auth)/login        → RSC + Server Actions. Supabase auth.
  layout.tsx          → RSC root shell (fonts, theme, nav chrome)
  terminal/
    layout.tsx        → RSC: server-fetch saved layouts/watchlists/scripts ONCE, stream in
    page.tsx          → renders <ChartWorkspace/> — a "use client" island
```

- **Marketing / pricing / docs → RSC, static** (`"use cache"`, the Next 16 Cache Components successor to PPR). This is what a prospective subscriber and search engine see first; MarketSniper's pure-PWA marketing surface is the same heavyweight shell, which is part of why first paint feels heavy.
- **The terminal is NOT an RSC.** A live, imperative-canvas, WebSocket-driven, drag-resizable workspace has no business re-rendering on the server. The App Router's only job here: (a) authenticate, (b) server-fetch *initial* state in `layout.tsx`, (c) hand it to the client island as props **once**. After mount it gets out of the way.
- **Never switch symbols/timeframes with `router.push`** — that tears down and re-hydrates the canvas (MarketSniper-style jank). Symbol/TF/layout switches are **Zustand state**. Use the URL only as a *shallow, shareable mirror* via `router.replace(..., {scroll:false})` so `/terminal?sym=NVDA&tf=3D` is deep-linkable without remounting.

### 4.2 Lightweight Charts v5 without re-render storms (the load-bearing decision)

LWC is canvas, not DOM/SVG — but **MarketSniper is also canvas, so canvas alone doesn't win.** The win is *never letting React touch the canvas after mount.*

1. **Chart + series live in `useRef`, created once in `useLayoutEffect`** (not `useEffect` — avoids flicker, ref issue #2054), empty deps, torn down on unmount only.
2. **Data flows through the imperative API, never React state.** Initial: `series.setData(bars)`. Tick: `series.update(bar)`. Bar arrays never enter `useState` — that is the #1 thing separating a snappy chart from a janky one.
3. **v5 specifics baked in now:** unified `chart.addSeries(CandlestickSeries, opts, paneIndex?)` (not v4's `addCandlestickSeries`); **native panes** `chart.addPane()` for the Mastermind RSI-MACD/StochRSI sub-panels in the same chart; markers are now a plugin — `createSeriesMarkers(series, markers)` is exactly how we render BUY/SELL flags; ESM-only/ES2020 (fine for Turbopack).
4. **Resize via `ResizeObserver` → `applyOptions({width,height})`**, never React state; coalesce with rAF on drag-resize.
5. **`dynamic(() => import('./ChartCanvas'), { ssr:false })`** — LWC touches `window`; keeps 35 kB + our indicator code out of the initial shell.

### 4.3 The performance playbook — why MS feels slow, how we beat it

MarketSniper feels sluggish because (likely): the whole product+chrome is one heavy client bundle; indicator math runs on the main thread (UI stalls when toggling); Supabase round-trips sit in the interaction path with no optimistic UI; every watchlist row re-renders on every quote. We attack each.

**P0 — keep React out of the hot loops**
- [ ] Chart data via imperative API only (§4.2). No bar arrays in `useState`.
- [ ] ⭐ **Web Workers (Comlink) for ALL indicator + backtest math.** The confluence engine, MACD/StochRSI, Tier-1 backtester run off-thread; worker posts back `Float64Array` series + markers via **transferables** (zero-copy); main thread just calls `setData`/`createSeriesMarkers`. **This is the single biggest perceptual win over MarketSniper** — toggling an indicator must never freeze scroll or the crosshair.
- [ ] **WebSocket tick batching + rAF coalescing** — buffer ticks, flush once per animation frame into `series.update()`. Never one `setState`/`update` per message. Throttle off-screen symbols.

**P1 — ship less JS, ship it later**
- [ ] Route-level + dynamic code splitting; **Monaco/CodeMirror Pine editor is `dynamic(ssr:false)`**, loaded only when the drawer opens.
- [ ] **Bundle budget**: initial terminal route ≤ ~200 kB gzip JS (LWC is only 35 kB; the budget is *our* code). Enforce in CI.
- [ ] Keep everything that can be RSC as RSC (nav, settings, billing, docs) = zero hydration cost. Don't wrap the app in one giant `"use client"`.
- [ ] **React Compiler** (`reactCompiler: true`) — auto-memoize the React parts (watchlist, panels), kill manual `useMemo`/`useCallback`. (Babel → slower builds; acceptable.)

**P2 — make interactions feel instant**
- [ ] **Virtualized watchlist** (`@tanstack/react-virtual`); each row subscribes to *its own* quote via a Zustand selector → one tick re-renders one row, not the list.
- [ ] **Optimistic UI** for add-to-watchlist, save-layout, favorite — update Zustand immediately, fire Supabase write in background, reconcile/rollback on error. MS appears to wait on the round-trip.
- [ ] **Prefetch + Priority Hints** — prefetch candle history for symbols the user hovers; `fetchpriority="high"` on the active symbol; warm the WS subscription on hover.
- [ ] **`<Activity>` (React 19.2)** keeps inactive chart layouts mounted-but-hidden (state preserved) → instant layout switching.

**P3 — polish**
- [ ] Theme via CSS variables (instant dark/light, no re-render); chart re-tints via `applyOptions`.
- [ ] `content-visibility:auto` on off-screen panels; `transform`-based drag (no layout thrash).
- [ ] Service worker / PWA for instant repeat loads — match MarketSniper's one genuine strength.

### 4.4 State management — Zustand (decisive)

- **Zustand** for the workspace store (active symbol, TF, layout tree, watchlists, indicator config, panel open/close, live-quote map). ~1 kB; `getState()`/`setState()` work *outside React* so the WS rAF loop and worker callbacks write to the store without a hook; **selector subscriptions** mean a tick updates only the subscribed row.
- **Not Redux** (boilerplate, indirection adds nothing). **Jotai** only if selector explosion appears.
- **TanStack Query** for the *server* cache (candle history, fundamentals, published contract artifacts). Query owns "data from the network," Zustand owns "what the user is looking at." OHLC arrays go in neither — straight to the chart via the worker.

### 4.5 When to leave Lightweight Charts (don't, for v1)

LWC v5 covers the whole roadmap (candles/line/area/bars/histogram + native panes + markers plugin + custom-series primitives for confluence bands / regime shading). **Re-evaluate only if user-drawn, draggable drawing tools at TV fidelity become a headline feature** → then consider TradingView Advanced Charts (free, license application; full drawing tools + 100+ studies) or KLineCharts (MIT) for exotic chart types. Don't pre-optimize for it.

*Sources: [Next.js 16](https://nextjs.org/blog/next-16) · [Server/Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components) · [LWC v4→v5 migration](https://tradingview.github.io/lightweight-charts/docs/migrations/from-v4-to-v5) · [LWC release notes](https://tradingview.github.io/lightweight-charts/docs/release-notes) · [LWC advanced React tutorial](https://tradingview.github.io/lightweight-charts/tutorials/react/advanced) · [flicker fix #2054](https://github.com/tradingview/lightweight-charts/issues/2054) · [React 19.2](https://react.dev/blog/2025/10/01/react-19-2)*

---

## 5. SaaS backend & the data-ownership boundary

### 5.1 The two-plane mental model (the headline)

The system splits into **two planes that never share a database**:

| | **User Plane (Supabase)** | **Research Plane (Python — existing, Phase 0)** |
|---|---|---|
| Owns | watchlists, layouts, saved scripts, alerts, favorites, subscriptions, auth identities | OHLC, the Golden-Oracle confluence signals, regime labels, backtests, scans |
| Tech | Postgres + Auth + Realtime + Storage, behind Next.js on Vercel | `charting-app/signal_layer` + `api/main.py` (FastAPI), macro pipeline, Mastermind brain |
| Write path | the user, via RLS-guarded writes | offline batch jobs; **read-only** to the web app |
| Source of truth for | "what did *this user* save / pay for" | "what is *true about the market*" |

**The boundary rule, once:** *Supabase stores nothing the engine computes, and the engine stores nothing the user owns.* They meet at exactly two seams — (a) the web app reads market/signal artifacts from the Research Plane over HTTP/CDN, and (b) a thin sync writes symbol-keyed signal snapshots into a Supabase **`signal_cache`** table purely so alerts/synced badges can ride Realtime. That cache is **disposable and re-derivable** — never a source of truth.

```
                          ┌────────────────────────────────────────────┐
                          │                 CLIENT (PWA)                 │
                          │   Next.js 16 + React 19.2 + LWC v5           │
                          │   service worker (offline shell + push)      │
                          └───────┬─────────────────┬────────────────────┘
            user data (auth'd)    │                 │   market data / signals (read)
                                  ▼                 ▼
          ┌───────────────────────────────┐   ┌─────────────────────────────────────┐
          │     SUPABASE (User Plane)      │   │   RESEARCH PLANE (read-only to web)  │
          │  Auth (email/OAuth + JWT)      │   │  charting-app/api  (FastAPI)          │
          │  Postgres + RLS                │   │   /chart /indicator /backtest /scan   │
          │   profiles, subscriptions      │   │   ← signal_layer (GOLDEN ORACLE)      │
          │   watchlists(+sections+symbols)│   │  contracts/ artifacts (indicator/v1,  │
          │   chart_layouts, saved_scripts │   │   backtest_result/v1) committed to    │
          │   alerts, favorites            │   │   the macro repo → published to CDN   │
          │   signal_cache  (disposable)   │   └───────────────┬───────────────────────┘
          │  Realtime (Broadcast)          │                   │  live quotes
          │  Storage (chart snapshots)     │                   ▼
          └───────┬────────────────────────┘   ┌──────────────────────────────┐
                  │  webhooks                   │  MARKET-DATA WS (Phase-1 feed) │
                  ▼                             │  one provider socket, fanned   │
          ┌────────────────┐                    │  out to clients (NOT Supabase  │
          │  STRIPE         │  webhook →         │  Realtime)                     │
          │  Checkout +     │  Vercel Node fn    └──────────────────────────────┘
          │  Billing Portal │  → subscriptions
          └────────────────┘
```

**Deployment:** User Plane = **Vercel** (Next 16). Research Plane stays a Python container — a small always-on FastAPI box (Fly.io / Railway / tiny VPS, ~$5–7/mo) + the macro repo's existing static-publish step. **Do NOT port the signal engine into Vercel functions** — it's NumPy/pandas math under a golden-gate parity contract; it stays Python, unchanged.

### 5.2 Supabase schema + RLS

Tables (sketch — full SQL in the saas-infra finding): `profiles` (1:1 with `auth.users`, `tier` mirror), `watchlists`, `watchlist_sections`, `watchlist_symbols`, `chart_layouts` (panes/indicators/drawings/tf/lineType as `jsonb`), **`saved_scripts`** (the My-Scripts library: name, Pine source, cached `compiled` AST, `visibility` private/invite/public, `version`), `alerts` (kind: `price_cross | confluence_buy | regime_flip`), `favorites` (indicator_id), `subscriptions` (Stripe-written only), and `signal_cache` (disposable `model_slice` mirror: `state{}` + `signals[]`, no arrays).

**RLS rules (2026-current, non-negotiable):**
- **RLS on every `public` table; every policy names `TO authenticated`.** CVE-2025-48757 (May 2025) found ~10% of vibe-coded Supabase apps shipped anon-readable tables. Source: https://vibeappscanner.com/supabase-row-level-security
- **Canonical owner policy uses `(select auth.uid())` wrapped** so the planner evaluates it once per query, not per row (>100× on large tables), + a btree index on `user_id`. Source: https://supabase.com/docs/guides/database/postgres/row-level-security
- **Never trust `user_metadata` in RLS** — the end user can edit it. Tier/entitlement comes from the server-written `subscriptions` table, never app metadata.
- Per-table deviations: `saved_scripts` read policy adds `OR visibility='public'` (powers invite-only/public sharing); **`subscriptions` is read-own, write-NONE** (only the Stripe webhook writes it via service role → a user can never grant themselves Pro); `signal_cache` is world-readable, write-none (no user data).
- Denormalize `user_id` onto child tables so RLS is a single-column index check, no joins in a policy. Each table gets the full four-policy (select/insert/update/delete) block — UPDATE needs a matching SELECT policy to see the row.

**Realtime = Broadcast, not Postgres Changes.** Postgres Changes re-checks RLS per client on a single thread (doesn't scale); **Broadcast-from-Database** (`realtime.broadcast_changes()` trigger) uses one replication slot and fans out to tens of thousands. Use it for *low-frequency, user-scoped* events only — watchlist sync, fired alerts, presence — on `topic="user:<uid>"`. Plan limits: Free 200 concurrent/100 msg-s, Pro 500/500, Pro-uncapped 10,000/2,500. Sources: https://supabase.com/blog/realtime-broadcast-from-database · https://supabase.com/docs/guides/realtime/limits

**Storage:** one private `chart-snapshots` bucket, path `userId/layoutId/timestamp.png`, Storage RLS keyed on first path segment; PNGs generated client-side from the LWC canvas (keeps it off Python). Public shares = signed URLs with TTL.

### 5.3 Vercel + Stripe + PWA

- **Runtime: default Node, not Edge.** Vercel now recommends Node over Edge; both run on **Fluid compute** (default since 2025-04-23) with Active-CPU pricing, so the old Edge cold-start advantage is gone. Node gives full APIs, 250 MB bundles, up to 800 s. Pin `preferredRegion` near Supabase. Sources: https://vercel.com/docs/functions/runtimes · https://vercel.com/docs/fluid-compute
- **Gate Pro features in RSC** — the server component fetches subscription status and renders gated UI *before paint* (no flash of unpaid content, no `useEffect`). Chart shell stays a client island.
- **Stripe:** hosted Checkout → on `checkout.session.completed` a **Vercel Node webhook** (`/api/webhooks/stripe`, signature-verified, **service-role key**) upserts `subscriptions` with `user_id` (from `client_reference_id`), `status`, `price_id`, `tier`, `current_period_end`; handles `customer.subscription.created|updated|deleted`, `invoice.payment_succeeded|failed`. Feature limits live in Stripe price `metadata`. Billing Portal for upgrade/cancel. Pattern: https://github.com/vercel/nextjs-subscription-payments
- **Cron:** Vercel Cron (`vercel.json crons[]`) → Node fn that (a) refreshes `signal_cache` from the Research Plane and (b) evaluates `alerts` and broadcasts/pushes fired ones.
- **PWA: ship it.** `manifest.json` `display:standalone` (mandatory or iOS won't expose Push), SW caches shell + last layouts + last `signal_cache`. **Web Push works on iOS 16.4+** but only after manual Add-to-Home-Screen, **not in the EU** on iOS; frictionless on Android/desktop. **iOS throttles background execution → alert *evaluation* happens server-side (Cron), the SW only receives pushes.** Source: https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide

### 5.4 How live prices reach the client — DECISIVE

**Do NOT route live prices through Supabase Realtime** — tick fan-out blows past msg/sec limits, every tick is billable, and prices are market truth (not user data). Split by data nature:
- **High-frequency market ticks → a dedicated market-data WebSocket relay** (Research Plane / a small Python or Node relay that subscribes once to the provider socket and fans out to clients — the upgrade of the macro repo's existing `live.js` / `build_live_quotes.py` snapshot pattern). This is where the snappiness budget lives.
- **Low-frequency user state & events → Supabase Realtime Broadcast** (watchlist sync, fired alerts, presence) — the one thing it's great at.

*Existing-code anchors confirmed on disk: container `/Users/chriswong/Documents/Cluade/charting-app/`; read-only seam `charting-app/api/main.py` (`/health`, `/chart/{symbol}`, `/indicator/{indicator_id}/{symbol}`, `/backtest`, `/scan`); contracts `charting-app/contracts/{indicator.v1,backtest_result.v1}.schema.json` + `contracts/samples/`; live-quote precedent macro repo `site/live.js` + `build_live_quotes.py`.*

---

## 6. Design system — Mastermind Terminal

**North star:** *Calm, precise, dimensional, quietly luxurious.* A blue-graphite institutional cockpit where **color is information** — the canvas and chrome are desaturated near-monochrome, and the only saturated pixels are price (green/red), the Mastermind **violet** brand accent, and the confluence BUY/SELL markers. We differ from MarketSniper by having **real elevation hierarchy** (4 surface tiers + true hairline borders + soft shadows, not flat-black slabs) and **tabular numerics**; we differ from TradingView by being **more curated and less chrome-dense** (one confident accent, not a rainbow of editor pickers). Bloomberg's density meets Linear's polish.

*Why the references read as they do:* MarketSniper's `#0a0c0e` flat panels, borderless slabs, toy-ish rounded green, and missing left dock make it look like a Bootstrap-admin skin over a chart. TradingView's premium tells are its **blue-tinted** `#131722` (not pure black — the single biggest premium signal), three-tier elevation, ~8%-white hairlines, tabular numerics everywhere, and restraint (color only where it carries data). We take TV's depth + numeric rigor and MS's single-accent calm.

### 6.1 Color tokens — DARK (primary)

```css
:root {
  /* surfaces — 4-tier elevation, blue-tinted near-black (cooler/deeper than MS #0a0c0e) */
  --bg:#0b0e14; --panel:#11151d; --panel-2:#161b25; --panel-3:#1c222e; --inset:#090c11;

  /* borders — hairlines on white alpha = the TV tell */
  --line:rgba(255,255,255,.07); --line-2:rgba(255,255,255,.04); --line-3:rgba(255,255,255,.12);
  --grid:rgba(255,255,255,.045); --grid-axis:rgba(255,255,255,.10);

  /* text */
  --text:#e6e9ef; --text-2:#aab2c0; --muted:#6f7888; --text-dim:#4b5363;

  /* PRICE (evolve macro greens/reds for the deeper bg) */
  --up:#34d399; --up-soft:#1f7a55; --down:#f0616d; --down-soft:#93343c; --flat:#6f7888;

  /* SIGNALS (the Golden-Oracle confluence markers) */
  --buy:#16c784; --buy-bg:rgba(22,199,132,.14);
  --sell:#ef4956; --sell-bg:rgba(239,73,86,.14);
  --signal-strong:#ffd166;  /* gold halo on highest-conviction confluence */

  /* BRAND/ACCENT — Mastermind violet = the ONE saturated chrome color */
  --brand:#7c5cff; --brand-2:#9d86ff; --brand-ink:#ffffff;
  --accent:#5b9bf0; --link:#7aa7e0;   /* keep macro link blue for continuity */

  /* regime / status */
  --regime-up:#34d399; --regime-down:#f0616d; --regime-range:#d4a017;
  --warn:#f0a830; --danger:#ef4956; --ok:#16c784;

  /* elevation — soft, low-spread, never a hard black halo */
  --shadow-1:0 1px 0 rgba(255,255,255,.03),0 1px 2px rgba(0,0,0,.35);
  --shadow-2:0 8px 24px -8px rgba(0,0,0,.55),0 2px 6px rgba(0,0,0,.35);
  --shadow-3:0 24px 60px -12px rgba(0,0,0,.65),0 4px 12px rgba(0,0,0,.4);
  --glow-brand:0 0 0 3px rgba(124,92,255,.30);  /* focus */

  /* chart-specific */
  --chart-bg:#0b0e14; --chart-crosshair:rgba(230,233,239,.45); --chart-watermark:rgba(255,255,255,.03);
}
```

### 6.2 Color tokens — LIGHT

```css
html[data-theme="light"] {
  --bg:#f5f7fb; --panel:#ffffff; --panel-2:#f0f3f8; --panel-3:#ffffff; --inset:#eef1f6;
  --line:rgba(15,23,42,.09); --line-2:rgba(15,23,42,.05); --line-3:rgba(15,23,42,.16);
  --grid:rgba(15,23,42,.06); --grid-axis:rgba(15,23,42,.14);
  --text:#0f1729; --text-2:#3d4759; --muted:#6b7588; --text-dim:#9aa3b2;
  --up:#0fa968; --up-soft:#7fd3ab; --down:#e0414f; --down-soft:#f0a3a9; --flat:#6b7588;
  --buy:#0fa968; --buy-bg:rgba(15,169,104,.12); --sell:#e0414f; --sell-bg:rgba(224,65,79,.12); --signal-strong:#c9890a;
  --brand:#6b46f0; --brand-2:#5733e0; --brand-ink:#ffffff; --accent:#285fff; --link:#285fff;
  --regime-up:#0fa968; --regime-down:#e0414f; --regime-range:#b07d05;
  --warn:#c4781f; --danger:#e0414f; --ok:#0fa968;
  --shadow-1:0 1px 2px rgba(15,23,42,.06);
  --shadow-2:0 6px 16px rgba(15,23,42,.10),0 2px 4px rgba(15,23,42,.06);
  --shadow-3:0 24px 60px -12px rgba(15,23,42,.22);
  --glow-brand:0 0 0 3px rgba(107,70,240,.22);
  --chart-bg:#ffffff; --chart-crosshair:rgba(15,23,42,.5); --chart-watermark:rgba(15,23,42,.04);
}
```

**zh (Asia 红涨绿跌) inversion:** keep the macro `html[data-lang="zh"]` dual-attribute swap. Swap only `--up`/`--down` and the regime/price pair; **do NOT blindly swap `--buy`/`--sell` semantics** — a BUY marker still means "go long," only its *color* follows the up-color. Reuse the existing `[data-theme][data-lang]` specificity trick.

### 6.3 Typography

```css
:root {
  --font-ui:"Inter",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
  --font-num:"Geist Mono","JetBrains Mono",ui-monospace,"SF Mono",Menlo,monospace; /* Pine editor + dense numeric grids */
  --font-brand:"Geist","Inter",sans-serif; /* wordmark / hero only */
}
.num,.price,td.num,.quote{font-variant-numeric:tabular-nums;font-feature-settings:"tnum" 1,"cv05" 1;}
.code,.editor,.mono{font-family:var(--font-num);font-variant-numeric:tabular-nums;}
```
Self-host via Fontsource (subset + `font-display:swap`), not Google CDN — for snappiness. **Prices use Inter with tabular figures** (columns align without a full-terminal monospace feel); reserve true mono for the Pine editor + watchlist numeric columns.

**Type scale (1.20 minor third, density-tightened):**

| Token | px / line | weight | use |
|---|---|---|---|
| `--fs-hero` | 28 / 1.15 | 700 | right-rail big quote (`728.99`) |
| `--fs-h1` | 20 / 1.25 | 650 | modal titles ("Indicators, metrics, and strategies") |
| `--fs-h2` | 16 / 1.3 | 600 | panel headers / section dividers |
| `--fs-body` | 14 / 1.45 | 450 | default UI |
| `--fs-sm` | 13 / 1.4 | 450 | table cells, watchlist rows |
| `--fs-xs` | 11.5 / 1.4 | 500 | labels, axis ticks, "SYMBOL / PRICE / CHG%" caps |
| `--fs-micro` | 10.5 / 1.3 | 600 | over-line eyebrows (uppercase, +.08em) |

Letter-spacing: `-0.01em` on Inter ≥16px; `+0.06em` uppercase micro eyebrows; `0` on all CJK headings.

### 6.4 Spacing, radius, elevation, controls

```css
:root {
  --sp-1:4px;--sp-2:8px;--sp-3:12px;--sp-4:16px;--sp-5:20px;--sp-6:24px;--sp-8:32px;--sp-10:40px; /* 4px grid */
  --r-xs:4px;--r-sm:6px;--r-md:8px;--r-lg:12px;--r-xl:16px;--r-pill:999px; /* 8px is the workhorse — calmer than MS pills */
  --ctl-h:30px;--ctl-h-sm:26px;--row-h:34px; /* terminal-grade tight */
}
```
Density: panel padding `--sp-4`, list-row `--sp-2 --sp-3`, modal `--sp-5 --sp-6`. Borders always **1px `--line`** — that hairline is what separates us from MarketSniper's borderless slabs.

### 6.5 Chart styling (Lightweight Charts v5)

Pull colors from CSS vars at runtime so theme/zh swaps re-tint instantly:
```js
chart.applyOptions({
  layout:{ background:{color:'transparent'}, textColor:css('--muted'),
           fontFamily:css('--font-ui'), fontSize:11.5, attributionLogo:false },
  grid:{ vertLines:{color:css('--grid')}, horzLines:{color:css('--grid')} },
  crosshair:{ mode:1, vertLine:{color:css('--chart-crosshair'),width:1,style:3,labelBackgroundColor:css('--panel-3')},
              horzLine:{color:css('--chart-crosshair'),labelBackgroundColor:css('--panel-3')} },
  rightPriceScale:{ borderColor:css('--line') }, timeScale:{ borderColor:css('--line') },
});
candles.applyOptions({ upColor:css('--up'), downColor:css('--down'),
  wickUpColor:css('--up-soft'), wickDownColor:css('--down-soft'),
  borderVisible:false }); // borderless candles = TV-clean, not MS-outlined
```
Highest-conviction confluence gets a `--signal-strong` (gold) outer-glow ring so the "Golden Oracle" reads as premium. Faint diagonal `--chart-watermark` ticker behind the series (the TV touch).

### 6.6 Motion (confirmation, not decoration)

```css
:root { --ease:cubic-bezier(.2,.7,.3,1); --t-fast:120ms; --t-base:160ms; --t-slow:220ms; }
```
- Hover/active: `--t-fast` on `background`/`border`/`color` only — never animate shadow-spread or width on hot paths.
- Modals/popovers: fade + `translateY(4px)` over `--t-base`; backdrop `rgba(11,14,20,.55)` blur 8px.
- **Never** animate the chart container, transform the candle layer, or run continuous CSS animation behind the canvas (kills the frame budget). Disable the ambient aurora backdrop **on the chart workspace** (fine on shell/landing).
- Honor `prefers-reduced-motion`: drop transforms, keep opacity.

### 6.7 Component cues (from the screenshots)

- **Right-rail card:** hero price `--fs-hero` tabular, `+0.3 (+1.71%)` in `--up`, `label … value` rows (`--muted` labels, tabular values), 52W hi/lo `%` distance in `--up`/`--down`, **regime chip** (dot + word) tinted `--regime-up`, plus our Mastermind confluence score badge.
- **Indicators modal:** TV tri-section (PERSONAL → BUILT-IN → COMMUNITY) since the user wants the My-Scripts library; pills `--panel-2` resting / `--brand` outline active (replaces MS green); favorite star fills `--signal-strong`; proprietary category = **"Mastermind."**
- **Watchlist:** collapsible section dividers, 18px favicon `--r-xs`, caps header `--fs-xs --muted`, chg% `--up`/`--down` tabular.
- **Left tool dock (44px):** `--panel` dock on `--bg`, active tool `--brand` — the single element that most sells "premium terminal."
- **BUY/SELL boxed quotes** at chart top use `--buy`/`--sell` on `--buy-bg`/`--sell-bg`.

**Brand decision:** *evolve, don't discard.* Keep the macro green/red price family and the crafted Mastermind "M" mark; deepen the canvas to blue-graphite `#0b0e14`; add the missing `--panel-3`/`--inset` tiers for TV-grade elevation; promote **Mastermind violet `#7c5cff`** to the single saturated accent (mark, primary buttons, active nav, focus). *Implementer note: the "M" SVG (`_BRAND_MARK_SVG`) is NOT in this checkout — pull it from the macro repo's `build_vector.py` / `theme.css` (`.nav-brand`/`.brand-word`) as the single source, don't redraw it.*

*Sources: [Eleken fintech 2026](https://www.eleken.co/blog-posts/modern-fintech-design-guide) · [Lollypop trading app 2026](https://lollypop.design/blog/2026/june/trading-app-design/) · [Authon tabular numbers](https://blog.authon.dev/tabular-numbers-in-css-font-variant-numeric-vs-monospace-hacks) · [Datawrapper data-viz fonts](https://www.datawrapper.de/blog/fonts-for-data-visualization)*

---

## 7. Integration with Mastermind + Macro Dashboard

**Publish-then-pull, reaffirmed.** The SaaS never reaches into a shared filesystem. The flow:

1. **Research Plane computes & publishes.** The macro pipeline + `signal_layer/` produce `mastermind.indicator/v1` and `backtest_result/v1` artifacts; `model_slice()` strips raw arrays (400 KB → ~6 KB: `state{}` + `signals[]`). Artifacts are **committed to the macro repo** and published to CDN. (Schemas + samples already on disk at `charting-app/contracts/`.)
2. **The Opus brain (Mastermind) reads from its own checkout** (`macro_src`), not a shared mount — preserving the Phase-0 contract.
3. **The SaaS reads the same artifacts as read-only HTTP/CDN resources** via the FastAPI seam `charting-app/api/main.py` (`/chart/{symbol}`, `/indicator/{id}/{symbol}`, `/backtest`, `/scan`), cached aggressively in TanStack Query. Heavy OHLC arrays go straight to the chart worker; they never touch Supabase.
4. **One disposable seam into Supabase:** Vercel Cron mirrors the latest per-symbol `model_slice` into `signal_cache` *only* so alerts can be evaluated near the data and a "signal fired" badge can ride Realtime. Rebuildable any time; never a source of truth.

**How each layer surfaces in the UI:**
- **Indicator contract → the Mastermind indicator pill (M12) + on-chart BUY/SELL markers (M13).** The worker reads the indicator/v1 series + signals → `setData` / `createSeriesMarkers`.
- **Backtest contract → the backtest viewer (S8/Elite).** "See the win-rate evidence, not just the arrow."
- **Regime / macro → the regime chip (M8) + symbol-detail card (M7/M9).**
- **Opus copilot (S9)** is a server action that feeds the ~6 KB `model_slice` (NOT 400 KB raw) to Opus-4.8 and streams the explanation. Grounded, bounded token cost, metered per tier (§8). It is the one feature no competitor has.

**Stay grounded:** the SaaS owns presentation and user data; it never recomputes signals, never writes market truth, and never executes trades.

---

## 8. Monetization

**Positioning:** *As fast as TradingView, smarter than both* — the only charting terminal pairing a verified, backtested proprietary confluence signal with a macro/regime layer and an Opus copilot that explains the setup, plus the My-Scripts Pine library MarketSniper lacks.

**Benchmarks (verified June 2026):** TradingView Essential **$14.95**/Plus **$34.95**/Premium **$69.95**/Ultimate **$239.95** (raised across all tiers April 2026; monthly). MarketSniper Sniper Core **~$9** / Sniper Elite **$49** ($490/yr). TrendSpider **~$54–149**. We sit **above MarketSniper, below TV Premium.**

**Tiers — Scout (Free) / Pro / Elite:**

| Capability | **Scout (Free)** | **Pro — $39/mo** ($390/yr) | **Elite — $89/mo** ($890/yr) |
|---|---|---|---|
| Market data | **15-min delayed** (US eq/ETF) | **Real-time** (SIP, non-pro) | **Real-time** (SIP, non-pro) |
| Charting engine (LWC v5) | Full, snappy | Full | Full |
| Sniper-class confluence (Golden Oracle) | **Daily TF only**, markers | **All TFs + MTF confluence** | All + early-trigger/alerts |
| Macro / regime layer | Regime label only | **Full** (earnings, dividends, breadth, rotation) | **Full + cross-asset risk gauges** |
| **Opus copilot calls** | **5 / mo** (taste) | **150 / mo** | **1,000 / mo** (fair-use) |
| Backtesting (Tier-1) | View samples | **On-demand, signal-level** | **Custom params + trade-level + export** |
| Watchlists | 1 (10 symbols) | **10** | **Unlimited** |
| Saved Pine scripts (My-Scripts) | 1 | **15** | **Unlimited** |
| Price/signal alerts | 1 | **30** | **400** |
| Multi-chart layouts | 1 | **4** | **8** |
| Data export / API | — | — | **Yes** |
| Support / freshness | — | Standard | Priority |

**Gating maps to the subscription row:** metered counters (AI calls, alerts, backtests — reset monthly, enforced server-side; **AI copilot calls are the #1 cost-and-value lever and natural top-up upsell**); entitlement flags (`realtime_data`, `api_access`, `export`, `all_timeframes`); hard integer limits (watchlists, scripts, layouts).

**Data-cost / licensing reality (read this — it changed because we now SELL the data):**
- **Vendor feed is the cheap part:** Alpaca "Algo Trader Plus" **$99/mo** (full SIP real-time + OPRA, 10k rpm) or Polygon.io **$199/mo**. At $39 Pro, **3 users cover Alpaca, ~6 cover Polygon.**
- **Redistribution is the real cost.** A paid SaaS showing real-time consolidated prices to its own paying users is *redistributing* market data → triggers **separate exchange/SIP redistribution agreements** (real-time consolidated NBBO + last-sale "routinely five figures/month" and escalates with users), **per-subscriber display fees + professional/non-professional classification + per-user reporting.** Vendor's $99–199 covers *your* access, not *your customers'* redistribution.
- **Mitigation (why the table is built this way):** Free = **15-min delayed** (~$250/mo base + $250/yr admin, **no per-user fees** — the licensing firewall, scales cleanly). Real-time gated to paid only, so per-user exchange fees hit only revenue users; Pro/Elite margin must absorb a few $/user/mo of exchange pass-through (classify non-pro by default with attestation). **Fallback launch posture: IEX TOPS single-exchange ~$500/mo flat — no pro/non-pro classification, no per-subscriber charges.**
- **Action item before launch:** get the redistribution question answered **in writing** from Alpaca/Polygon; budget exchange pass-through into Pro/Elite unit economics. Do NOT assume the $99–199 vendor fee is the whole data cost.

*Sources: [TradingView pricing](https://www.tradingview.com/pricing/) · [MarketSniper plans](https://www.marketsniper.pro/plans.html) · [TrendSpider pricing](https://trendspider.com/pricing/) · [Polygon](https://polygon.io/) · [Alpaca data](https://alpaca.markets/data) · [Market-data licensing primer](https://www.marketdata.app/education/stocks/stock-market-data-licensing/) · [Databento exchange fees](https://databento.com/blog/understanding-exchange-fees) · [NYSE data pricing PDF](https://www.nyse.com/publicdocs/nyse/data/NYSE_Market_Data_Pricing.pdf)*

---

## 9. Revised phased roadmap

**Phase 0 — Backend engine (DONE, preserved).** `signal_layer/` (faithful Golden-Oracle port + Tier-1 backtester), `mastermind.indicator/v1` + `backtest_result/v1` contracts + `model_slice()`, golden-gate parity harness, real AAPL/NVDA samples, FastAPI seam, charting engine chosen (LWC v5).
*Acceptance: ✅ golden gate green; contracts validate; `model_slice` ≤ ~6 KB.*

**Phase 1 — The mockup made real (Next.js shell + Supabase auth + chart workspace rendering Phase-0 contracts).**
Next 16 App Router skeleton (RSC marketing shell + `terminal` client island); Supabase Auth (email + OAuth) + the schema & RLS for `profiles`/`watchlists`/`chart_layouts`; the 3-column shell (M1) with the design-system tokens (§6); LWC v5 chart (M2–M3) with imperative-only data + native panes; **the Golden Oracle rendered as on-chart BUY/SELL markers (M13) and a Mastermind sub-pane (M12)** by pulling the published `indicator/v1` contract through a Web Worker; symbol search (M5) + watchlist (M6) + the regime/stock-detail card (M7–M9).
*Acceptance: open `/terminal?sym=NVDA&tf=3D`, see real candles + live Golden-Oracle markers from the contract, switch symbol with NO route change / NO canvas remount, toggling the Mastermind indicator never stalls scroll (worker), watchlist virtualized; Lighthouse + a tick-storm test confirm 60fps.*

**Phase 2 — The terminal feels professional (parity polish).**
Indicators modal with category pills + the Mastermind pill + favorites (M10–M12); built-in indicator set (M11); core drawing-tools subset (M14); chart settings modal (M19); price-scale modes (M16); chart types (M3 + S7); saved layouts (S6) + multi-pane (S5); symbol-detail fundamentals sub-panels (S8); theme/zh switching; PWA install + offline shell.
*Acceptance: a MarketSniper user does a blind side-by-side and finds us at-or-above on every screen, and noticeably snappier on indicator toggles / watchlist scroll.*

**Phase 3 — The wedge (the reasons to pay).**
⭐ **My-Scripts Pine library + lazy-loaded editor (S1–S2)** backed by `saved_scripts` + `signal_layer` parity; ⭐ **Opus AI copilot (S9)** as a server action over `model_slice`; **alerts (S3)** with server-side Cron evaluation + Web Push + Realtime broadcast + `signal_cache`; backtest viewer (Elite); bar Replay (S4); news card (S10); economic-event badges (S11); compare (S12).
*Acceptance: the copilot can correctly explain a live confluence flip from the contract; an alert fires on a confluence flip and reaches an installed iOS PWA via push; a user saves and re-runs a Pine script.*

**Phase 4 — Monetize & launch.**
Stripe Checkout + Billing Portal + webhook → `subscriptions`; RSC feature-gating per tier (§8); metered counters (AI/alerts/backtests) + entitlement flags + hard limits; **real-time market-data WebSocket relay** for paid tiers (delayed for Free); the redistribution/licensing answer secured in writing; marketing/pricing pages (RSC, static); onboarding.
*Acceptance: a user signs up free (15-min delayed), upgrades to Pro via Checkout, the webhook flips `subscriptions.tier`, real-time prices stream over the WS relay within seconds, and a downgrade revokes real-time at period end — all without a flash of unpaid content.*

**Phase 5 — Beyond (NICE).** Multi-chart grids (N1), Volume Profile (N2), exotic chart types (N3), "Mastermind picks" curated shelf (N6), second-wave drawing tools (S15), chart-idea sharing (N7).

---

## 10. Open decisions for the user

| # | Decision | Recommendation |
|---|---|---|
| 1 | **Next.js 15 vs 16** | **16.** It's GA since 2025-10-21; 15's caching/PPR model is deprecated. Building on 15 adopts a dead model day one. |
| 2 | **Chart engine** | **Keep Lightweight Charts v5.2.0.** Native multi-pane covers v1; revisit only if user-drawn draggable drawing tools become a headline feature (then TV Advanced Charts or KLineCharts). |
| 3 | **Market-data provider** | **Launch on Alpaca Algo Trader Plus ($99/mo)** for price/bit; keep **IEX TOPS ($500 flat, no per-user fees)** as the redistribution-light fallback if SIP per-user reporting proves heavy. **Resolve redistribution rights in writing before launch.** |
| 4 | **Live-price transport** | **Dedicated market-data WebSocket relay**, NOT Supabase Realtime (which is reserved for low-frequency user events). |
| 5 | **Pricing** | **Free / $39 Pro / $89 Elite.** Above MS Elite ($49), below TV Premium ($70). AI copilot calls are the metered discriminator + top-up upsell. |
| 6 | **Free-tier data** | **15-min delayed** — both a product gate and the licensing firewall (no per-user exchange fees). |
| 7 | **Brand name** | "**Mastermind Terminal**" — ties to the existing Mastermind brain + "M" mark + violet accent, and the elevator pitch. Confirm, or propose an alternative (the design system assumes it). |
| 8 | **AI copilot scope at launch** | **Explain-only** over `model_slice` (signal/regime/"what changed"). Defer agentic/portfolio actions; never execute trades. |
| 9 | **Auth providers** | Email/password + **Google + Apple** at launch (Apple is mandatory if we ever wrap as iOS); add GitHub later. |
| 10 | **PWA push on iOS / EU** | Ship PWA push as a **Pro feature with an in-app Realtime-toast fallback** (iOS needs manual Add-to-Home-Screen; no EU iOS push; alert evaluation is server-side regardless). |
| 11 | **Stripe limits source-of-truth** | Store feature limits in **Stripe price `metadata`** so flags travel with the price and the subscriptions table stays tier-agnostic. |
| 12 | **Hosting split** | **Vercel (Node runtime, Fluid compute) for the User Plane; a tiny always-on FastAPI box (Fly.io/Railway, ~$5–7/mo) for the Research Plane.** Do not port the NumPy/pandas signal engine into Vercel functions. |