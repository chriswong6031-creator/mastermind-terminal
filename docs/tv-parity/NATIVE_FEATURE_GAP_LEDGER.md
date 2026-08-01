# Native Feature-Gap Ledger — TradingView iOS vs. Mastermind Terminal

**Date:** 2026-07-31
**Scope:** the installable iPhone/iPad alpha (`apps/ios/`) measured against the 5-screen TradingView
iOS reference spec (chart · indicators · search · symbol-detail · watchlist).

**Governing docs (read, not modified):**
- `docs/NATIVE_APPS_ALPHA_MASTERPLAN_2026-07-30.md` — §4.5 feature manifest, §5 iOS spec, §7 alpha scope
- `contracts/native-features.v1.json` — `options:false, alerts:false, portfolio:false, scripts:false, admin:false, broker:false`; `allowedRoutes = /terminal /analysis /discover /embed/chart`
- root `AGENTS.md` "Native app shells" law — native = presentation + OS integration only; no chart/indicator/entitlement math in Swift; **if a native screen needs data no API publishes, the API is added to `terminal/` first**
- `terminal/AGENTS.md` — design law, chart law, verification law

**Verified starting state of our stack (2026-07-31):**

| Layer | What exists |
|---|---|
| iOS (`apps/ios/MastermindTerminal/`, 22 Swift files) | 4 tabs (Watchlist · Chart · Markets · Menu); `RollerStrip` symbol+TF wheel pickers; `SearchSheet` (category chips, recents, category-browse, add-toggle); `WatchlistScreen` + `WatchlistStore` + `WatchlistSyncService` (multi named lists, "Default" mirrored to Supabase); `PreviewSheet` (embed-chart mini chart, range chips, key stats, desk read); `MarketsScreen` (index tiles + Discover/Analysis rows); `MenuScreen` (auth card, EN/中文); `ShellBridge` v1; `AuthCore` + `KeychainStore`; `QuoteService` (regular + extended lanes, `basis`); `ManifestStore`; `SearchTracker`; `Theme` (v5 palette); `TVComponents` (row anatomy, LogoCircle) |
| Web chart (`terminal/components/`) | `ChartPanel` + `ChartPane` (9 chart types: candles/hollow/heikin/bars/line/line-markers/step/area/baseline); `DrawingSidebar` + `lib/drawingTools.ts` (7 groups: lines/fibonacci/shapes/patterns/annotation/measurement/forecasting); `ChartObjectTree`; `IndicatorsModal` + `IndicatorSettings` + `IndicatorSource`; `lib/chartTemplates.ts`; bar replay (`TerminalShell` replay rail); `CompareSettings`; 1/2/4-pane split + `sync`; `PineEditor` + real `lib/pine-engine`; `/api/layouts` (upsert-by-name) + `/api/drawings` |
| Web analysis (`terminal/components/fin/`, `prophet/`, etc.) | `MegaPane` 9 pages: Overview · Statements · Statistics · Dividends · Earnings · Revenue · Forecast · Technicals · Seasonals; plus `InsiderPage`, `OracleDash`, `RegimeOutlook`, `AdvancedSeasonality`, `TranscriptDrawer`; `ProphetView` desk; `ScreenerView`/`heatmap` (Discover); `AlertsView` + `/api/alerts`; `PortfolioView`; `Tracker`; `NeuralWebStrip` + `/api/nw`; `BrainWidget` |
| Excluded-by-law | `OptionsHubView`, `OptionsWorkspace`, `gexdesk/`, `flowdesk/`, `surface/`, `prism/` — Options suite, hard-blocked from every installable alpha |

**Status vocabulary:** `SHIPPED` (in the iOS build today) · `WEB-ONLY` (exists in `terminal/`, no native
entry point) · `PARTIAL` · `MISSING` (neither) · `EXCLUDED`.

---

## A. BUILD STRUCTURE NOW (iOS)

TV surfaces/affordances we can mirror immediately as native UI structure. Per operator directive,
**rows marked `placeholder` ship the same structure and buttons before the backing feature works** —
disabled state with the honest native "Not in this alpha" / "Coming" notice, never a hidden control.
Nothing here needs new product logic in Swift; live rows either read a published API/`/data` file or
open the shell-mode webview whose own toolbar already does the work.

### A1. Navigation chrome & hubs

| # | Feature | TV surface | Our status | Decision |
|---|---|---|---|---|
| A1 | 5-tab primary navigation | chart, watchlist | PARTIAL — 4 tabs (Community dropped, masterplan §5.1) | Keep 4. Ledger-closed: TV's 5th tab is Community → bucket D. |
| A2 | Persistent secondary analysis toolbar above the tab bar on the Chart tab | chart | MISSING | **Build now.** Native horizontal strip above `RollerStrip`: Indicators · Chart type · Compare · Object tree · Bar replay · Alerts · Metrics. Each tile is a native button; live tiles drive the shell-mode webview, placeholders are disabled. |
| A3 | Analysis Hub tool tray as its own sheet (Indicators/Compare/Alerts/Bar Replay/Chart type/Object Tree/Pine Editor/Siri/Publish Idea) | chart, symbol-detail | MISSING (native); tools exist WEB-ONLY | **Build the tray now** with the full tile grid. Live: Indicators, Chart type, Compare, Object tree, Bar replay, Symbol details/Financials/Forecast/Technicals. `placeholder`: Alerts, Pine Editor. Omitted: Siri Shortcut, Publish Idea, Trade (bucket D). |
| A4 | Two navigation styles from one hub — push-to-fullscreen (Indicators) vs. sheet-over-sheet (Templates) | indicators | MISSING | **Build now.** Codify in `TVComponents`: `push` for full-screen tools, `.sheet` detent for pickers. Cheap, and it is the thing that makes the hub feel native. |
| A5 | Red notification-dot badge pattern reused on tab bar + hub tiles | indicators, watchlist | MISSING | **Build the dot infrastructure now** (`TVComponents.NotificationDot`), wired to nothing in alpha. It is the affordance Alerts (B20) lights up later. |
| A6 | Monochrome bottom tab bar, no accent selected state, glyph-only differentiation | watchlist | SHIPPED (monochrome) | Confirm against `Theme`; add A5's dot slot. |
| A7 | Consistent outline SF-Symbol-style iconography left-of-label | indicators | PARTIAL | **Normalize now** across `MenuScreen`/`MarketsScreen`/A3 tray — one icon idiom, SF Symbols outline weight. |
| A8 | Skeleton loading states for async content | symbol-detail | PARTIAL (native spinners) | **Build now.** Native skeleton row/block matching web `RouteSkeleton`; applies to preview sheet, watchlist first paint, Markets tiles. |
| A9 | Custom scroll-indicator thumb | watchlist | MISSING | Build now (low cost, high "not-a-webview" signal). |
| A10 | Horizontally-scrolling wide data tables independent of page scroll | symbol-detail | WEB-ONLY (MegaPane) | Native rule for any table we render natively; the MegaPane pages already do this inside the webview. |

### A2b. Chart tab

| # | Feature | TV surface | Our status | Decision |
|---|---|---|---|---|
| A11 | Bottom-toolbar symbol & interval scroll wheels (drag-to-spin), distinct verb from tap | chart | SHIPPED (`RollerStrip`, S3) | Done. Tap-on-selected-symbol → search is already the TV verb. |
| A12 | Full modal interval-wheel sheet, distinct from the inline wheel | chart | MISSING | **Build now** — tap the TF slot → TF picker sheet (masterplan §5.1.3 already specifies it). |
| A13 | Chart-type library entry point | chart | WEB-ONLY (9 types) | **Build the native tile now**; it opens the web chart's own type picker in shell mode. The missing 12 TV types are B1 — the tile does not change when they land. |
| A14 | Object tree (flat inspector, per-item show/hide + delete, grouped by pane) | chart, indicators | WEB-ONLY (`ChartObjectTree`) | **Build the native tile now** → opens the web object tree. No native re-implementation (it inspects chart state = product logic). |
| A15 | On-chart indicator legend with inline toggle + floating quick-action pill | chart | WEB-ONLY | Nothing native to build; **verify shell mode does not hide it** and that its hit targets are ≥44 pt at 390 pt width. |
| A16 | Bar Replay historical playback | chart, symbol-detail | WEB-ONLY (replay rail in `TerminalShell`) | **Build the native tile now** → toggles the web replay rail. |
| A17 | Compare / overlay-symbol picker | chart, symbol-detail | WEB-ONLY (`CompareSettings`) | **Build now** as a third `SearchSheet.Mode` (`.compare`) with TV's bordered/armed multi-select rows. Needs one bridge verb (`addCompare(syms)`) — a small S1-class web addition, not a rewrite. |
| A18 | Multi-pane workspace layouts + "Sync in layout" | chart | PARTIAL WEB (1/2/4 split + sync; TV has 13 arrangements) | **Build the native entry point now** (iPad-first, per masterplan §5.2). Preset count is B2. |
| A19 | Manual y-axis override + explicit reset-to-auto-fit | chart | UNVERIFIED web | Native does nothing. Audit the web chart; if absent → B18. |
| A20 | Per-chart dark/light theme override, independent of app theme | chart | PARTIAL (`/embed/chart` takes `theme`) | **Build the native toggle now** in the A3 tray; needs a bridge `setTheme(theme)` verb alongside `setLang`. |
| A21 | Live / auto-refresh toggle in the quote header | chart | MISSING | **Build now.** `QuoteTicker` already polls at 6 s — this is a native switch that pauses/resumes it. |
| A22 | Asset-class-aware quote header (equities "At close:" vs. futures/FX bare price + contract badge) | chart | PARTIAL — `/api/quote` returns `basis` | **Build now** off `basis` + manifest `sec`/`col`. Futures contract badge is inert until B15. |
| A23 | Price alerts with active/triggered red dot | chart, symbol-detail | EXCLUDED in alpha (`alerts:false`) though the web engine is live | **`placeholder`** — tile + dot slot present and disabled. See D9/B20. |
| A24 | Drawing-tool suite, 7 categories | chart | WEB-ONLY, 7 groups already (`lib/drawingTools.ts`) | No native work: shell mode keeps the chart's own drawing sidebar. Category-for-category we already match TV's grouping. |
| A25 | Landscape hides native chrome (full-bleed chart) | chart | SHIPPED (`ChartScreen`) | Done. |

### A3b. Search

| # | Feature | TV surface | Our status | Decision |
|---|---|---|---|---|
| A26 | Universal symbol search with category tabs | search, watchlist | SHIPPED (`SearchSheet`: All/Equities/Crypto/…) | Done. Extend chip set toward TV's All/Stocks/Funds/Futures/Forex as B15/B16 data lands. |
| A27 | Non-empty browse-before-typing state | search, watchlist | SHIPPED (category-browse; search-row law) | Done — this is already a repo LAW, not a TV import. |
| A28 | Recents list distinct from unlabeled suggested-defaults list | search | PARTIAL (recents exist; one mode) | **Build now** — `.go` shows recents, `.add`/`.compare` show suggested defaults, per TV's two sheets. |
| A29 | Add-to-watchlist via per-row `+` → ✓ with a named confirmation toast | search, watchlist | PARTIAL (add-toggle exists, no toast) | **Build the toast now** — "Added to CHRIS", TV's exact affordance shape. |
| A30 | Rich per-row metadata: exchange, instrument type, country flag, data-feed badge | search, watchlist | PARTIAL (logo · symbol · name · category) | **Build now** from manifest `sec`/`col`/market: flag glyph + exchange text + verified/globe badge. |
| A31 | Compare/overlay multi-select with bordered "armed" rows | search | MISSING | Ships with A17. |
| A32 | Inline calculator in the search bar ("Use `=` to do math") | search | MISSING | **Build now natively** (pure presentation, zero backend). Note the web placeholder string already promises more than the web delivers → B12. |
| A33 | Search by Symbol, ISIN, or CUSIP | search | MISSING — the web placeholder literally says `"Symbol, ISIN, or CUSIP"` (`lib/i18n.tsx:996`) with no identifier data behind it | **Do NOT copy the lying placeholder.** Native placeholder says "Symbol or name" until B11 ships identifiers. |
| A34 | Futures contract-month disambiguation in one flat list | search | MISSING (no futures universe) | Structure only; rows appear when B15 lands. |

### A4b. Watchlist

| # | Feature | TV surface | Our status | Decision |
|---|---|---|---|---|
| A35 | Multiple named watchlists as a horizontal pill selector | watchlist, search | SHIPPED (`WatchlistScreen` chips + `WatchlistStore`) | Done. |
| A36 | In-list section grouping with named all-caps headers | watchlist | MISSING native; **schema already supports it** (`watchlist_symbols.section`, `app/api/watchlist/route.ts:10`) | **Build now.** Sectioned `List` + a "New section" action. Native is only rendering a column the DB already has — inside the boundary law. Web UI parity is B13. |
| A37 | Dual quote lines per row: day change + independently-colored extended-hours change with moon glyph | watchlist, symbol-detail | PARTIAL — `QuoteService` already returns explicit regular + extended lanes | **Build now.** Second line + moon glyph in `TVComponents` row anatomy. |
| A38 | Per-row data-delay "D" badge | watchlist | PARTIAL — `/api/quote` returns `basis` | **Build now.** Honesty win: our US feed is delayed-tier, and TV's own badge is the right vocabulary for saying so. |
| A39 | "+ Add symbol" footer row, always centered, on every list | watchlist | MISSING | Build now. |
| A40 | Dismissible in-app promo/marketing banner at the top of a list | watchlist | MISSING | **Build the slot now**, empty in alpha. It is where the members/upgrade nudge lands post-alpha. |
| A41 | Docked mini-watchlist strip while charting, sharing state with the Watchlist tab | watchlist | PARTIAL — `RollerStrip`'s symbol wheel *is* the active watchlist in list order | Already the stronger version of this. **Add now:** the star/add-to-watchlist control at the strip's right edge (masterplan §5.1.3). |
| A42 | Symbol quote-preview bottom sheet as the universal row tap target | watchlist | SHIPPED (`PreviewSheet`, S4) | Done. Tab strip is A44. |
| A43 | Long-press row context menu | watchlist | SHIPPED (Open chart · Remove · Move to top) | Done. Flags/Add-alert/Trade stay out (D). |

### A5b. Symbol detail / preview sheet

| # | Feature | TV surface | Our status | Decision |
|---|---|---|---|---|
| A44 | Preview-sheet tab strip (Overview / News / Minds / Ideas) | watchlist, symbol-detail | PARTIAL (single Overview body) | **Build the strip now:** Overview (live) · **Desk** (ours, C1 — live) · News (`placeholder`, B3). Minds/Ideas omitted (D4). |
| A45 | Deep-dive menu off the preview sheet (Notes/Metrics/Financials/Forecast/Seasonals/Options/Bonds/ETFs/About) | watchlist | MISSING native; 9 MegaPane pages WEB-ONLY | **Build the menu now.** Live → shell-mode webview: Metrics, Financials, Forecast, Technicals, Seasonals, About, **Insider** (ours). `placeholder`: Notes (B4). Omitted: Options (D1), Bonds (D2), ETFs (D3). |
| A46 | Centralized Metrics command palette reachable from a header `...` | symbol-detail | MISSING native | **Build now** as the same menu as A45, reached from the header — TV's two entry points, one native model. |
| A47 | Ticker-switcher chevron next to the company name | symbol-detail | MISSING | Build now → opens `SearchSheet` in `.go` mode. |
| A48 | Real-time + extended-hours dual quote (separate at-close and pre/post lines) | symbol-detail | PARTIAL (`QuoteService` lanes) | Build now, same source as A37. |
| A49 | Day's Range slider with current-price marker | symbol-detail | WEB-ONLY (`components/DayRange.tsx`) | **Build the native mirror now** — pure presentation over `/api/quote` low/high/last/open. |
| A50 | 52-Week Range slider with marker | symbol-detail | PARTIAL — hi52/lo52 computed in `ScreenerView`/`heatmap` tiles, not published per symbol | **Build the slider structure now, values dashed** until B6 publishes per-symbol hi52/lo52. Textbook placeholder row. |
| A51 | Trailing performance chips (1W/1M/3M/6M/YTD/1Y) | symbol-detail | MISSING native; bars available | **Build now** from the OHLC the sheet already fetches. |
| A52 | Range chips 1D/5D/1M/3M/1Y/All over the mini chart | symbol-detail, watchlist | SHIPPED (S4, over `/embed/chart`) | Done. |
| A53 | Company About facts block (sector/industry/CEO/HQ/founded/IPO) + expandable description | symbol-detail | WEB-ONLY (`OverviewPage` Key facts / About) | **Build the native block now** from `fund.json`; expandable description with "Show more". |
| A54 | Earnings actual-vs-estimate chart + next-earnings countdown + one-tap Add to calendar | symbol-detail | PARTIAL — `EarningsPage` WEB-ONLY; countdown data in `fund.json` | **Build the native countdown chip + EventKit "Add to calendar" now** (OS integration = squarely native's job). The chart itself stays in the webview. |
| A55 | Technicals summary gauge with sub-gauges, signal tables, Pivots, timeframe selector | symbol-detail | WEB-ONLY (`TechnicalsPage`: gauges + oscillators/MA tables + Classic/Fib/Camarilla/Woodie/DM pivots) | Native entry point in A45/A46 only. **We are at or past TV parity here** — do not re-render gauges in Swift. |
| A56 | Analyst rating gauge + 1-yr price target → full Forecast page (fan chart, rating bars, EPS/Revenue forecast, hatched forecast region) | symbol-detail | WEB-ONLY (`ForecastPage`, 1094 lines, TV-parity by construction) | Native entry point only. |
| A57 | Income-statement teaser expanding into the full Financials module | symbol-detail | WEB-ONLY (`MegaPane` → Overview/Statements/Statistics/Dividends/Earnings/Revenue) | **Build the native teaser card now** (3 rows from `fund.json` + "See all") → pushes MegaPane in shell mode. |
| A58 | Seasonals overlay chart vs. prior 2 years | symbol-detail | WEB-ONLY (`SeasonalsPage`, `AdvancedSeasonality`) | Native entry point only; verify the "prior 2 years" overlay form exists → else B17. |
| A59 | Revenue/earnings segmentation by product and by geography | symbol-detail | WEB-ONLY (`RevenuePage`, `OverviewPage` donuts; CN segments via Tushare `fina_mainbz`) | Native entry point only. **Our CN coverage exceeds TV's** → C7. |
| A60 | Company profile/identifiers with copy-to-clipboard (ISIN/CUSIP/FIGI/CFI) | symbol-detail | MISSING (no identifier data) | **Build the block structure now with dashed values**; copy buttons disabled until B10. |
| A61 | Persistent Trade CTA | symbol-detail, watchlist | EXCLUDED | Not built, not placeheld — see D5. |

---

## B. WEB-FIRST BACKLOG

TV has it, our **web terminal** lacks it. These are `terminal/` PRs (design law → pin markup first;
chart law → build on `components/charts/svgChart.ts`; verification law → `npm run test:e2e:responsive`
at 1440×900 / 820×1180 / 390×844, EN + zh, then the full commit→PR→CI→merge→deploy→live-verify chain).
iOS gets each one for free through the webview, or via the placeholder already built in bucket A.

| # | Feature | TV surface | Our web status | Web work |
|---|---|---|---|---|
| B1 | Chart-type library — 21 types | chart | 9 types (`ChartPanel` series factory + `TerminalShell` CT groups) | Add the 8 cheap ones first: **Columns, High-low, HLC area, Volume candles, Renko, Line break, Kagi, Point & figure, Range**. Each needs (a) a bar-transform in `ChartPanel` alongside the existing `heikin()`, (b) a `CT_TKEY` i18n entry + group icon in `TerminalShell:230`, (c) `VALUE_CHART_TYPES` classification. Renko/Kagi/P&F/Line-break/Range are *re-bucketings of bars* — pure client transforms, no new data. |
| B1b | Volume footprint · Time Price Opportunity · Session volume profile | chart | Missing | Separate program: needs intraday tick/level aggregation. Depends on the intraday store (`lib/intradayStore.ts`) exposing per-bar volume-at-price. Do NOT bundle with B1. |
| B2 | Multi-pane layouts: 1–4 panes, 13 arrangement presets | chart | 1/2/4 split only (`TerminalShell:2492`), plus `sync` | Extend `setGrid` to a preset table (rows×cols + weights), keep the existing `paneSync` mixed-TF guard. Pure layout work. |
| B3 | Symbol-scoped multi-source news feed with source filter + inline flash callout | symbol-detail, watchlist | **Missing entirely** (no `news` anywhere in `components/fin`) | New `/api/news?sym=` server proxy + provider decision (owner input needed), a `NewsPage` in `MegaPane`, a source-filter chip row, fixtures under `lib/__tests__/fixtures/`. Biggest single web gap on this list. |
| B4 | Freeform note-taking on a symbol | symbol-detail | Missing | `symbol_notes` RLS table + `/api/notes` (GET/PUT by symbol) + a Notes page in `MegaPane`. Small, and it unblocks A45's placeholder. |
| B5 | Level-1 bid/ask size chips (price×size) | symbol-detail | Missing | Extend `/api/quote` with `bid/ask/bidSize/askSize` where the feed entitles it (our US tier is delayed — the honest answer may be "delayed L1 or nothing"; decide before building UI). Render in `DayStatsStrip`. |
| B6 | 52-Week Range slider | symbol-detail | Computed in `ScreenerView`/`heatmap` tiles, not published per symbol | Promote `hi52`/`lo52` into `/api/quote` or the per-symbol `fund.json`; reuse `components/DayRange.tsx` with a second variant. Unblocks A50. |
| B7 | Dividend payout-ratio donut gauge + full payout history with per-metric drill-in | symbol-detail | `DividendsPage` has yield/payout summary + events table; no donut, no drill-in | Add an `ArcGauge`/donut (component exists: `components/ui/ArcGauge`) + drill-in rows. |
| B8 | Per-metric historical drill-in page + searchable metric picker across Financials | symbol-detail | `StatementsPage`/`StatisticsPage` render tables; no per-metric page, no metric search | New `MetricDetailPage` (history chart + table, `svgChart.ts` per chart law) + a search field over the metric registry. |
| B9 | One-tap Add-to-calendar for next earnings | symbol-detail | Missing | Web: `.ics` download from `EarningsPage`. (Native uses EventKit — A54 — and does not wait on this.) |
| B10 | Company identifiers block (ISIN/CUSIP/FIGI/CFI) with copy-to-clipboard | symbol-detail | Missing | Add identifiers to `fund.json` ingest, render a copy-row block in `OverviewPage` Key facts. Unblocks A60. |
| B11 | Search by ISIN/CUSIP | search | **Placeholder promises it, nothing implements it** (`lib/i18n.tsx:996`) | Either add identifier fields to `/data/manifest.json` + match them in `scoreSymbol`, **or fix the placeholder string.** Shipping a search box that advertises a capability it does not have is a bug today, independent of the app. |
| B12 | Inline calculator in the search field | search | Missing | Small `SearchModal` addition; `=`-prefixed input evaluates and renders a result row. |
| B13 | Watchlist section grouping in the web UI | watchlist | **Schema has it** (`watchlist_symbols.section`), the web renders one flat list | Render sections + a create/rename/reorder-section affordance. Keeps web and iOS (A36) telling the same story. |
| B14 | Extended-hours dual line in web watchlist/quote rows | watchlist, symbol-detail | `/api/ext-quote` exists; presentation is single-line | Second line + moon glyph in the web row, matching A37. Respect the zh red/green flip law. |
| B15 | Futures universe: continuous (`MNQ1!`/`MNQ2!`) vs. dated (`MNQU2026`) contracts, disambiguated in one flat list | search | **No futures universe at all** | Data-plane program, not a UI task: contract roll conventions, continuous-series stitching, `manifest.json` category. Sequence after the M1 data-plane migration; gates A34 and the Futures search chip. |
| B16 | Funds/Forex category coverage matching TV's chip set | search, watchlist | Partial (equities · crypto · CN/HK · ETFs) | Manifest category enrichment; smaller than B15. |
| B17 | Seasonals overlay vs. prior 2 years specifically | symbol-detail | `SeasonalsPage`/`AdvancedSeasonality` exist — overlay form unverified | Audit first; only build if the prior-2-year comparison line is genuinely absent. |
| B18 | Manual y-axis override + explicit reset-to-auto-fit affordance | chart | Unverified | Audit `ChartPanel` scale handling; add an explicit "reset scale" control if the drag-to-scale path has no visible escape hatch. Mobile-critical (A19). |
| B19 | Per-chart theme override + bridge `setTheme` | chart | `/embed/chart` takes `theme`; the full chart follows the app theme | Add a chart-scoped theme override + a `setTheme` verb in `lib/platform/contract.ts` and `contracts/native-shell.v1.schema.json` (bridge v1.1). Unblocks A20. |
| B20 | Alert **on an indicator** (not just price) | indicators, chart | `AlertsView` + `/api/alerts` + 5-min VPS cron evaluate real price alerts | Extend `evaluate()` with indicator-value condition types (the alerts-engine memory names this as the designed extension point) + the picker's long-press "Add alert on <indicator>" entry. Alpha still ships the app tile disabled (A23/D9); this is for the web and the beta. |
| B21 | Indicator long-press action set: per-interval visibility · move to pane · pin to left/right scale · visual z-order · chain indicator-on-indicator | indicators | Partial (`IndicatorsModal`/`IndicatorSettings`/`IndicatorSource`; pane assignment exists) | Audit which of the five exist; build the missing ones into the legend's context menu. "Chain another indicator onto this one" is the hardest — it changes the indicator input source model in `lib/indicatorMath.ts`. |
| B22 | Layouts manager: New / Save with dirty-state red dot / Open / Rename / Duplicate / Autosave toggle / Sharing toggle + link; searchable, sortable, star-favoritable list | chart | `/api/layouts` is **upsert-by-name only**; no manager UI, no favorites, no share token, no autosave | Schema: move `chart_layouts` to id-keyed rows + `is_favorite` + `share_token` + `updated_at` sort. UI: a manager modal, dirty-state tracking against the last saved config, an autosave scheduler. This is the single largest chart-side gap vs. TV. |
| B23 | Chart/layout sharing link | chart | Missing | Rides B22's `share_token` + a read-only `/l/<token>` route. Consider the security posture (public read of a saved layout) before shipping. |
| B24 | Indicator template *favorites* + "My templates" category | indicators | `lib/chartTemplates.ts` has named save/list in **localStorage** | Add a favorites flag and, if templates should survive a device change, promote to a Supabase table. TV's "apply a bundle in one tap" is already ours — only the organization is missing. |
| B25 | Compare multi-select from the search modal + `addCompare` bridge verb | search, chart | `CompareSettings` exists; the search modal has no compare mode | Add compare mode to `SearchModal` + the bridge verb. Unblocks A17/A31. |
| B26 | Community indicator sources (Editors' picks / Top / Trending / Invite-only) | indicators | Missing (Personal + Built-in only) | **Deliberately not planned** → D12. Listed here only so the three-source picker's absence is a decision, not an oversight. |

---

## C. OURS-NOT-THEIRS

Capability our stack has that TradingView's iOS app does not — and where each one slots into the
TV-parity layout **without breaking it**. The rule: ours goes *inside* a TV-shaped container (a tab in
the preview sheet, a tile in the Analysis Hub, a row in Markets), never as a fifth bespoke navigation
concept. That is what keeps the app feeling like TV while being unmistakably ours.

| # | Feature | Our surface | Slot in the TV-parity layout |
|---|---|---|---|
| C1 | **Research-Desk read** — verdict + drivers/cautions from `/data/<SYM>.intel.json`, labeled research, never a trade signal | `PreviewSheet` (SHIPPED, S4); web `OracleDash` | A **Desk** tab in the preview sheet's tab strip (A44), sitting exactly where TV puts "Minds". Same container, better content. |
| C2 | **Prophet managed-pick desk** — confidence-index arc, geometry rail, "what to do now", profit-taking plan, signal thesis | `components/prophet/ProphetView` (WEB-ONLY) | A **Desk** tile in the Analysis Hub tray (A3) + a Markets-tab row, both pushing shell-mode `/analysis`. TV's hub has 9 tiles; ours has 10. |
| C3 | **Golden Confluence v2 scoring + quality tiers** (A+/Q badges, no-cut scored) rendered on the chart itself | `ChartPanel` badge rendering (WEB-ONLY) | Nothing to add — it rides the chart inside the webview. Surfaces in the app the moment the chart loads. TV has no equivalent on-chart conviction mark. |
| C4 | **Neural Web `market_plane`** macro-regime strip | `NeuralWebStrip` + `/api/nw` | A native header strip on the **Markets** tab, above the index tiles. TV's Explore opens with movers; ours opens with a regime read. |
| C5 | **Regime Outlook** with the regime-dynamics law (level + TREND + velocity always travel together) | `components/fin/RegimeOutlook` | A block in the preview sheet's Overview tab (A44), under Key stats. |
| C6 | **Insider Power** — `/data/<SYM>.insider.json` | `components/fin/InsiderPage` | An entry in the Metrics palette (A45/A46), between Financials and Forecast. TV's palette has 8 entries; ours has 9. |
| C7 | **CN/HK depth** — 2,798 HK names, CN fundamentals + `fina_mainbz` revenue segments, HK tick-synthesized intraday, the zh red/green flip law, and the one-language `displayName` law | `ManifestStore` + `SearchSheet` (SHIPPED); web fin pages | A **China / HK** category chip in search (A26) and correct flags in row metadata (A30). This is the flagship differentiator: TV's app is thin on exactly this universe. |
| C8 | **EN / 中文 throughout**, native strings + webview `setLang` from one preference | `L10n` + `MenuScreen` + bridge (SHIPPED, S5) | Already in TV's Menu-tab position. TV's app has no comparable bilingual mode with a market-convention color flip. |
| C9 | **Discover** — screener + heatmap hub with 52w-proximity, GICS/mcap enrichment | `ScreenerView`, `heatmap/` (SHIPPED as a Markets row) | Markets tab row (SHIPPED). This is TV's "Screener", already at parity-plus. |
| C10 | **Track record / Tracker** — open-ended MTM outcome tracking on desk calls | `components/Tracker` | A Markets-tab row ("Track record"). TV has no honesty surface of this kind. |
| C11 | **Advanced seasonality + EventEdgePop** (event-conditioned edge) | `AdvancedSeasonality`, `EventEdgePop` | Rides the Seasonals entry in the Metrics palette (A45) — deeper than TV's Seasonals, same door. |
| C12 | **Server-side alert evaluation** (real 5-min VPS cron, one-shot zero-DDL semantics), not client-side polling | `AlertsView` + `/api/alerts` + cron | Backend advantage; the app tile stays disabled in alpha (A23/D9) and lights up in beta with a real engine behind it — the reverse of shipping UI over nothing. |
| C13 | **Real client-side Pine v6 interpreter** (`lib/pine-engine`, not a stub) | `PineEditor` (WEB-ONLY) | Analysis Hub tile, `placeholder` in alpha (`scripts:false`, D8). The capability is genuinely ours; the alpha exclusion is scope, not absence. |
| C14 | **Mastermind Brain** AI copilot over the terminal | `BrainWidget` (WEB-ONLY) | Post-alpha: an Analysis Hub tile. No TV analog. Not in the alpha manifest — do not add a tile yet. |
| C15 | **Search tracking plane** → owner Search Log | `SearchTracker` (SHIPPED, S3) | Invisible to users, deliberately anonymous. Keeps app users visible in the owner's Search Log at web parity. |
| C16 | **Chart Conductor / workspace tabs** — multi-workspace chart orchestration | `ChartConductor`, `chrome/WorkspaceTabs` | iPad `NavigationSplitView` sidebar (masterplan §5.2). No iPhone slot; do not force one. |

---

## D. EXCLUDED

Deliberately not in the alpha. Each is a decision with a one-line reason, not a backlog item.

| # | Feature | TV surface | Reason |
|---|---|---|---|
| D1 | **Options suite** — options analytics (ATM IV term structure, volatility smile), options chain, GEX, flow desk | symbol-detail, chart | **Hard law:** `contracts/native-features.v1.json` `options:false` + `allowedRoutes` blocks `/options` in the WKWebView nav policy; masterplan §4.5/§7. Untouched on the web. |
| D2 | Bond listing (Highest YTM bonds) | symbol-detail | No bond data plane and no audience for one; building the pipeline to fill a panel is backwards. |
| D3 | ETFs-holding-stock panel | symbol-detail | Same — no holdings data plane today; revisit only if fund flows become a program. |
| D4 | **Minds, Ideas, Publish Idea, community reposts** | symbol-detail, search, chart | We do not run a social network. This is TV's 5th tab, dropped in masterplan §5.1; moderation and abuse surface alone rule it out of an alpha. |
| D5 | **Broker integration** — "Trade with your broker", persistent Trade CTA | chart, symbol-detail, watchlist | `broker:false`. We are not a broker; order routing is a regulatory surface, and the repo law is that we publish research, never a trade instruction. |
| D6 | Community indicator sources (Editors' picks / Top / Trending / Invite-only scripts) | indicators | No script marketplace, no moderation, no invite system. Personal + Built-in is the whole picker. |
| D7 | Siri Shortcut integration | chart, symbol-detail | Deferred past alpha (masterplan §5.3). Genuine native value, but it needs stable intents — and our surface is still moving. |
| D8 | Pine Editor in the app | chart, symbol-detail | `scripts:false`. The Pine engine is real and stays web-only for alpha (see C13); a code editor on a phone is the wrong first surface anyway. |
| D9 | Alerts creation UI (incl. TV's draggable price-line keypad) | chart, symbol-detail, indicators | `alerts:false` (masterplan §7). The engine is live (C12); only the app UI is deferred — the tile ships as a disabled placeholder (A23). |
| D10 | Portfolio | — | `portfolio:false`. Deferred with alerts. |
| D11 | Admin surfaces | — | `admin:false`. Owner tooling never ships in a member binary. |
| D12 | **Push notifications** (incl. TV's community-repost pushes) | search | Deferred to beta with deep/universal links (masterplan §7). Needs APNs + an entitlement + a real alert-delivery contract; not alpha work. |
| D13 | Auto-update, widgets, watch app, offline data bundles | — | Masterplan §7. Members re-download during alpha; `electron-updater` arrives with the Windows wave. |
| D14 | Multi-layout save/open in the app | chart | Deferred (masterplan §5.3) and blocked on the web work anyway (B22). The app gets it free once the web manager exists. |
| D15 | Flags, watchlist row flags | watchlist | Deferred (masterplan §5.3); sections (A36) cover the organizing need for alpha. |
| D16 | Telemetry vendor | — | Alpha uses TestFlight crash reports + MetricKit only (masterplan §7). |

---

## Sequencing note

Bucket A is one iOS slice family (S4b/S5b-shaped) and depends on exactly **three** small web/bridge
additions, all of which belong in one `terminal/` PR: `addCompare` (A17/B25), `setTheme` (A20/B19),
and — if the audit finds it missing — a reset-scale affordance (A19/B18). Every other A row reads a
published API/`/data` file or opens the shell-mode webview, so it stays inside the boundary law:
*presentation and OS integration only.*

Bucket B's honest top three by user-visible impact: **B22** (layouts manager — the largest chart-side
gap), **B3** (news — the only "TV has a whole content type we lack"), and **B1** (chart types, 9 → 18
via pure client transforms). **B11 is a bug fix, not a feature**: today's search box advertises ISIN
and CUSIP and matches neither.

---

## PASS-2 ADDENDUM (2026-07-31 — spec2-watchlist / spec2-menu-settings / spec2-explore)

New TradingView affordances observed in the original 43-shot corpus, bucketed:

| Feature | TV surface | Our status | Decision |
|---|---|---|---|
| Sort menu incl. "Customized order" | Watchlist ••• | none | **A** — menu structure now; local sort logic |
| Flag colors + row ribbons | Watchlist rows | none | **A** — device-local flags first |
| User-authored sections ("Add section above" + create modal) | Watchlist | none | **A** — local sections |
| Row long-press context menu (Open chart / Open symbol screen / Add alert / Flag / Remove) | Watchlist | partial (context menu exists) | **A** — restyle + extend; Trade excluded (D) |
| Drag-reorder (drag-handle glyph on every row) | Watchlist | moveToTop only | **A** — long-press drag |
| News by watchlist (flag-filtered feed) | Watchlist ••• | no news API | **B** — publish a news API in terminal/ first |
| Profile card w/ social stats (Published/Followers/Following) | Menu | no social plane | **A structure** with our account fields; social stats **D** for alpha |
| Manage-subscription promo card | Menu | billing portal exists on web | **A** — link to web billing |
| Refer-a-friend card | Menu | none | **D** for alpha |
| Rate us / Help Center / About rows | Menu | partial | **A** — StoreKit review + web link + About push |
| Settings gear + Messages bubble | Menu top | none | **A placeholders** (targets unphotographed, §4-A18) |
| Index-card market carousel | Explore | manifest + /api/quote serve it TODAY | **A** — real data, no new API |
| Category pills → curated browses | Explore | manifest categories exist | **A** |
| News / Calendar action buttons | Explore | no market-news or econ/earnings-calendar API | **B** — terminal/ APIs first; ship placeholder buttons now |
| Top Stories feed | Explore | no news API | **B** — placeholder/empty state now |
| Brokers button | Explore | — | **D** — excluded |
