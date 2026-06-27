# TradingView + TrendSpider — Feature Gap Audit

*Auto-generated 2026-06-27 from a 3-agent competitive audit. Tracks which core TV/TrendSpider features we've implemented vs. deferred. IMPLEMENTED this push: bar replay, AI copilot (deterministic), dynamic alerts, indicators modal + EMA/BB/VWAP/RSI/StochRSI/MACD/Vol, chart types (Heikin-Ashi/line/area/bars), seasonality card, type-anywhere/Ctrl-K search, snapshot, watchlist add/remove + settings. DEFERRED (heavier overlay-engine + live data): interactive drawing tools, automated trendline detection, auto-Fibonacci + S/R heatmap, MTFA overlay, full Strategy-Tester report, multi-chart grid, compare-symbols, earnings markers, agentic-LLM copilot, save/load layouts to DB, live/Alpaca feed.*

---

# PRIORITIZED GAP LIST — Mastermind Terminal

## P0 — A credible terminal looks broken without these

### 1. Interactive drawing tools (the essential ~15)
- **What/why:** Trendline, ray, H/V line, Fib retracement, rectangle, parallel channel, long/short position, text, measure. Your dock icons render but don't draw — the single most visible "this is a prototype" tell.
- **Stack note:** LWC v5 has no native drawing layer; render an absolutely-positioned `<canvas>`/SVG overlay synced to the chart's `timeScale`/`priceScale` coordinate API (`timeToCoordinate`/`coordinateToPrice`). Persist drawings as JSON to a Supabase `drawings` table keyed by symbol+layout. Add magnet/snap-to-OHLC as a fast follow.
- **Edge multiplier:** Neutral (table stakes), but the long/short position tool visually ties into your backtest WR/PF numbers.

### 2. Bar Replay
- **What/why:** Scrub history bar-by-bar (step + autoplay, a few speeds) to test reads. For a signal-engine + backtester product, the absence of replay is a glaring hole — it's the most synergistic feature you don't have.
- **Stack note:** Pure historical/client-side — you already have the full Polygon series loaded. Maintain a "visible bars" cutoff index, slice the dataset, and `setData` up to N; play = interval advancing N. Critically: re-run/replay the confluence signal markers AND the Golden Oracle verdict as of the cutoff bar so users watch your signal fire in context. Zero new data dependency.
- **Edge multiplier:** HIGH — this is where "between MarketSniper and TV" earns its keep; replaying your proprietary signal is a demo-defining moment.

### 3. Alerts — price + indicator/signal-cross (built dynamic from day one)
- **What/why:** Turns your confluence verdict into something actionable. TrendSpider's wedge is *dynamic* alerts (track moving trendlines/indicators, not static prices). Build it dynamic-aware (signal-state change, regime-flip, RSI/MA cross) so you leapfrog basic price alerts immediately.
- **Stack note:** Alerts page is already planned + tables exist. On historical-only feed, alerts evaluate against the latest available bar on scheduled refresh (the "scheduled data refresh" already on your list is the trigger). Server-side eval in a Supabase edge function / cron; deliver in-app + email. A "regime-flip" and "Golden-Oracle verdict changed" alert type is nearly free given existing engines.
- **Edge multiplier:** HIGH — "alert me when MY confluence signal + regime align" is something neither TV nor TS can natively express.

### 4. Indicators modal + a broader built-in set
- **What/why:** A 3-indicator chart (EMA/RSI/StochRSI) reads as a prototype. Need a searchable add-indicator picker AND a respectable core library: MACD, Bollinger Bands, ATR, VWAP, volume, plain Stochastic, OBV.
- **Stack note:** Modal is on your known-not-built list, but the *broader indicator set* is the real gap. Compute server-side from Polygon OHLC (reuse the Python that already powers the Pine port) or client-side in JS; render extra oscillators in generalized stacked panes (see #5). Store enabled-indicator sets per layout.
- **Edge multiplier:** Neutral table stakes, but indicator-templates feed your "signal stack" narrative.

### 5. Generalized multi-pane + save/load layouts wired up
- **What/why:** You have ONE hardcoded lower confluence pane and `layouts` tables that aren't wired. Generalize to N resizable stacked panes (so MACD/ATR/volume each get a home) and actually persist/restore workspaces.
- **Stack note:** LWC v5 supports multiple panes via `addPane`/series `paneIndex`. Serialize {symbol, TF, indicators, drawings, pane config} to the existing `layouts` table; restore on load. Pure wiring of existing infra — high leverage, low risk.
- **Edge multiplier:** Neutral.

### 6. Agentic Opus copilot (scan + alert-set + verdict-explainer)
- **What/why:** TrendSpider's 2026 flagship is "Sidekick" — agentic plain-English → scan/alert. This is the exact battleground for your stated edge. Match the agentic scanning/alert-building AND beat it: have Opus *explain your proprietary confluence verdicts and inject macro/regime context*, which TS structurally cannot do.
- **Stack note:** On your "will build" list as "AI copilot panel," but the **agentic** dimension (NL → screener params → run → refine; NL → build alert) is the part that must be explicit, not a passive chat box. Tool-calling Opus over your existing Screener + Alerts + backtester APIs. Historical-feed-friendly.
- **Edge multiplier:** HIGHEST — your single most defensible feature. Prioritize the verdict-explainer + regime narration that TS can never have.

---

## P1 — Clearly expected by serious users

### 7. TV-style Strategy Tester report
- **What/why:** You have the backtester + WR/PF/CAGR but no standardized report surface. Ship Overview / Equity curve / Drawdown / Trade list / Properties tabs.
- **Stack note:** Backtester output exists; this is a presentation layer. Equity/drawdown as LWC line/area series or a small chart lib; trade list as a sortable table. Deep-link each trade to the chart with the replay cutoff at entry.
- **Edge multiplier:** Medium — credibility for the Golden Oracle verdict; pairs with replay (#2).

### 8. Heikin-Ashi + Line/Area/Baseline chart types
- **What/why:** You only have candles. HA is the one "advanced" type institutional users actively use; line/area/baseline are basic expected toggles.
- **Stack note:** Line/Area/Baseline are native LWC series types — trivial. HA = derived OHLC transform computed client-side from the loaded series. Skip Renko/Kagi/P&F/Footprint/TPO (out of positioning + tick-data needs you don't have).
- **Edge multiplier:** Low.

### 9. Automated trendline detection
- **What/why:** TrendSpider's signature differentiator — auto-draws statistically significant S/R trendlines and re-fits them. Gives visual structure your confluence markers lack and feeds dynamic alerts (#3).
- **Stack note:** Swing-point detection (fractal/pivot highs-lows) on Polygon history → fit lines through tunable "base point" spacing → render on the same overlay as #1. Fully historical/deterministic.
- **Edge multiplier:** HIGH — chart-intelligence parity with TS; a signal firing into an auto-detected level = higher-conviction read.

### 10. Auto-Fibonacci + S/R strength heatmap
- **What/why:** Siblings of #9 off the same swing-detection. AutoFib anchors to detected swings; S/R heatmap renders clustered level density as color intensity (brighter = stronger zone).
- **Stack note:** Reuse #9's swing engine. AutoFib = Fib levels from last major swing; heatmap = histogram of level clustering rendered as colored price-zones on the overlay. Historical/deterministic.
- **Edge multiplier:** HIGH — "confluence signal fires INTO a strong S/R zone" is a conviction multiplier unique to your stack.

### 11. Seasonality context card
- **What/why:** Recurring calendar-pattern win-rates (month/week/day) with outlier filtering. TV has no first-class seasonality tool; fits your house "display-only context leg" pattern perfectly.
- **Stack note:** Pure Polygon-history compute; render as a right-rail context card next to the regime chip. Moderate build, high thematic fit with the macro/regime narrative.
- **Edge multiplier:** HIGH — deterministic macro-flavored context that leans directly into your regime edge.

### 12. MTFA on one chart (higher-TF levels overlaid)
- **What/why:** Overlay higher-timeframe S/R / trendlines / signal state on a single chart, color-coded by TF. Your core signal IS an MTF MACD/StochRSI confluence — this is the natural visual home for it.
- **Stack note:** Resample loaded series to higher TFs client-side, project their levels onto the active chart via the #1 overlay. No new data.
- **Edge multiplier:** HIGH — directly visualizes your confluence engine's MTF nature.

### 13. Symbol search nav + Data Window + chart snapshot
- **What/why:** Grouping the navigation/readout table-stakes. Type-to-search symbol jump + Ctrl+K command palette; a Data Window (Alt+D) extending your crosshair status line to every indicator value; one-click PNG snapshot.
- **Stack note:** Search/popup already on your "will build" list — add the *type-anywhere* + Ctrl+K reflex. Data Window reads the same crosshair series values you already surface. Snapshot = `chart.takeScreenshot()` (native LWC) → download/copy. Snapshot is a cheap credibility + AI-copilot-sharing win.
- **Edge multiplier:** Medium (snapshot enables sharing copilot-annotated charts).

### 14. Earnings / event markers on-chart
- **What/why:** Per-symbol earnings, dividends, splits markers — table stakes for an institutional terminal, and usable as scan/alert conditions later.
- **Stack note:** You already have an event-calendar engine (FOMC/CPI/jobs/auctions). Extend to per-symbol earnings/dividends from Polygon; render as LWC series markers. Low cost, leverages existing infra.
- **Edge multiplier:** Medium — your macro event overlay is more developed than TS's; per-symbol is the missing leg.

### 15. Multi-chart grid (2/4-up) + chart sync
- **What/why:** Compare multiple symbols/TFs side by side; linked crosshair/symbol/interval. 4-up is a strong target (skip TV's 16).
- **Stack note:** Multiple LWC instances in a CSS grid; sync via a shared crosshair-move event bus and symbol/TF state. Persist grid config in the `layouts` table.
- **Edge multiplier:** Low-medium.

### 16. Compare/overlay symbols
- **What/why:** Add SPY / sector / peer on the same pane to compare relative performance — a basic analytical reflex.
- **Stack note:** Normalize to % and add as additional line series; reuse loaded Polygon data. Cheap.
- **Edge multiplier:** Low-medium (relative-strength feeds your regime context).

---

## P2 — Nice, defer

- **No-code strategy builder UI** over the existing backtester (point-and-click entry/exit/SL/TP). High-value eventually, but your Pine Editor already serves coders; UI layer can wait.
- **Multi-factor / composite alerts** ("MY signal + regime + S/R zone all align") — high-value but sequences strictly after #3 + screener condition-builder exist.
- **Scanner no-code condition builder + dynamic smart-watchlists** — your Golden-Oracle screener already works; the multi-factor builder is an enhancement, not net-new.
- **Drawing templates + favorites toolbar + object tree** — polish after #1 is interactive.
- **Watchlist color flags** — minor triage nicety on top of existing watchlist.
- **Extended-hours toggle** — data-feed dependent, low priority on historical-only.
- **Indicator-on-indicator, indicator templates** — power-user depth, defer.
- **Smart pre-trade checklist** (green/red confluence+regime+S/R panel) — cheap and on-brand, but cosmetic; bundle later.
- **Core hotkeys** (interval = number keys, Ctrl+S save) — ship alongside whatever feature each maps to.

## Deliberately SKIP (off-positioning / infeasible on our feed)
Volume Footprint / TPO / Session Volume Profile, Raindrop charts, Renko/Kagi/P&F/Line-Break/Range, the full 110+ drawing library, 8/16-chart grids, 100k community scripts, trading bots / live webhooks / paper trading. These are where TV/TS depth lives and where "between MarketSniper and TV" gives you explicit license to stop.

---

# BUILD NEXT — top 10, ordered

1. **Interactive drawing tools (essential ~15)** — closes the #1 "not a real terminal" credibility gap. (P0)
2. **Bar Replay** — replays your signal + verdict; uniquely synergistic, pure historical. (P0)
3. **Agentic Opus copilot** (scan + alert-set + confluence/regime verdict-explainer) — your defensible moat; beats TS Sidekick. (P0)
4. **Alerts — price + signal/regime-cross, dynamic-aware** — makes the confluence signal actionable. (P0)
5. **Indicators modal + broader core set (MACD/BB/ATR/VWAP/vol)** — kills the prototype read. (P0)
6. **Generalized multi-pane + save/load layouts wired up** — unblocks #5 and persists workspaces from existing tables. (P0)
7. **Automated trendline detection** — TS signature; gives structure and feeds dynamic alerts. (P1)
8. **Auto-Fibonacci + S/R strength heatmap** — same swing engine as #7; "signal into strong zone" conviction layer. (P1)
9. **TV-style Strategy Tester report** — surfaces the backtester you already have; pairs with replay. (P1)
10. **Seasonality context card** — deterministic macro/regime-flavored edge TV lacks, off existing Polygon history. (P1)

**Sequencing logic:** 1→6 are table-stakes that make the terminal look real and persist work; 3 and 7/8/10 are the differentiators that make it look *smart*. Build the swing-detection engine once (#7) and it powers #8 and #12 (MTFA). Build the alert eval loop once (#4) and it powers P2 multi-factor alerts.

Relevant existing assets to reuse (per memory): the faithful MTF MACD+StochRSI Pine port (`mtf-confluence-faithful-port`) for #2/#4/#12; the event-calendar engine for #14; the regime engine for #3/#11; the Tier-1 backtester for #9.