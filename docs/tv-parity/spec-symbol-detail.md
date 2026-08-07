# TradingView iOS — Symbol-Detail Surface: Pixel-Level Spec

Source: 20 stills in `/Users/chriswong/Downloads/tradingview/` (NVDA, AXP, JNJ) + 65 video
frames in `scratchpad/tvframes/` (REGN, AXP, NVDA — 2-second-apart, chronological). All
frames are 1206×2622 px @3x = **402×874 pt**. Every measurement below was taken with
PIL pixel sampling on the original files (see scripts run in-session); numbers are pt
unless marked px. Where a value could not be isolated from anti-aliasing it is marked
`~` (typical-iOS estimate, cross-checked against the visible proportions).

> **Correction to the supplied file captions:** `IMG_2324.PNG` is **not** a "JNJ symbol
> preview" — it is the long-press **object/indicator context menu** for a chart element
> on an Alibaba (BABA) chart (Add alert / Add indicator / Visual order / Pin to scale /
> Copy / Hide / Remove / Object tree / Settings). It is unrelated to symbol-detail and is
> only mentioned here for completeness (§6).

---

## 0. Global palette (measured)

| Token | Hex | Sampled RGB | Where used |
|---|---|---|---|
| Canvas black | `#000000` | (0,0,0) | Full-bleed background of every sheet/page |
| Chrome near-black | `#040404` | (4,4,4) | Bottom global tab bar fill (imperceptibly lighter than canvas) |
| Elevated surface | `#2E2E2E` | (46,46,46) | Unselected segmented-pill bg, "Add note" pill, grabber handle, "..." menu row hover |
| Hairline divider | `#4A4A4A` | (74,74,74) | 1pt (3px) rules under header, between sections, table rows |
| Primary text | `#DBDBDB` | (219,219,219) | Prices, headers, values — **not** pure white |
| Secondary text | `#707070`–`#808080` | (112,112,112) / (128,128,128) | Captions, unselected tab labels, timestamps |
| Bull / positive | `#22AB94` | (34,171,148) | +% change, buy zone, teal gauge segment, dividend-gauge ring |
| Bear / negative | `#F7525F` | (247,82,95) | −% change, sell zone, red candles |
| Brand blue | `#2962FF`(±) | (41,98,255) / (56,96,246) | Links, "Buy" signal text, post-market bullet, selected-tab underline color family |
| Bid chip bg | `#0D1B33` | (13,27,51) | L1 bid size chip (dark navy tint) |
| Ask chip bg | `#300B0E` | (48,11,14) | L1 ask size chip (dark maroon tint) |
| Selected pill | `#FFFFFF`/`#F2F2F2` | (242,242,242)+ | Active segmented-control pill, "1D" range pill, Trade button |
| Active tab pill (dark) | `#282828` | (40,40,40) | Selected Overview/News/Minds/Ideas tab background |

Typography is SF Pro throughout (system font), rounded-off numeric tabular figures in
tables. Observed sizes (converted from measured cap-heights, cross-checked against
standard SF scale):

| Role | Size | Weight | Example |
|---|---|---|---|
| Hero price | ~28–30pt | Bold | "200.75", "336.25" |
| Symbol/company title | ~20pt | Bold/Semibold | "NVIDIA Corporation", "American Express Company" |
| Section header | ~19–20pt | Bold | "Key stats", "Earnings", "Statistics" |
| Body value (list rows) | ~17pt | Regular/Medium | "139.78 M", "24.30 B" |
| Body label (list rows) | ~17pt | Regular | "Volume", "Market capitalization" |
| Caption / secondary | ~13–14pt | Regular | "Last update at 15:39 GMT-7", axis labels |
| Tab-bar label (global) | ~10pt | Medium | "Watchlist", "Chart" |
| Segmented pill label | ~15–17pt | Semibold | "Statements", "1D" |
| Chart axis ticks | ~13pt | Regular | "47%", "2025" |

Corner radii: pill buttons and chips are full-capsule (radius = height/2). The "Trade"
button, segmented pills, and quote-size chips all use this capsule treatment. The
symbol-detail sheet itself has a large top radius (~14–16pt, standard iOS sheet radius).

---

## 1. Surface inventory

| # | Surface | Entry point | Chrome behind it |
|---|---|---|---|
| A | **Symbol Quick-Info** (push page) | Tapping a ticker row (e.g. from Watchlist) while a tab is active | Global bottom tab bar (Watchlist/Chart/Explore/Community/Menu) stays visible; page has its own `X` close, top-left |
| B | **Symbol Detail** (large chart-anchored sheet) | Tapping the symbol legend on the Chart screen / from search | Chart screen's own top bar ("···" menu, TV watermark, "+" compare) peeks above the sheet's grabber handle; chart's mini-watchlist ticker tape + drawing toolbar peek below at very bottom |
| B1 | — **Overview** tab (default) | Tab row inside B | — |
| B2 | — **News** tab | Tab row inside B | Skeleton-loading state observed, then populated list |
| B3 | — **Minds** tab | Tab row inside B | Not captured (unopened in frames) |
| B4 | — **Ideas** tab | Tab row inside B | Not captured (unopened in frames) |
| C | **Financials** detail screen | "More financials" (from A/B Overview) or Metrics-menu → Financials | Same sheet chrome as B (ticker tape + drawing toolbar visible at bottom) |
| C1 | — Financials **Overview** pill | Pill row inside C | Key facts recap |
| C2 | — **Statements** pill (Income statement / Balance sheet / Cash flow toggle) | Pill row inside C | |
| C3 | — **Statistics** pill (Annual/Quarterly) | Pill row inside C | |
| C4 | — **Dividends** pill | Pill row inside C | |
| C5 | — **Earnings** pill | Pill row inside C | |
| C6 | — **Segments** pill (by product / by country) | Pill row inside C | |
| D | **Forecast** detail screen | "See forecast" / Metrics-menu → Forecast | Same sheet chrome |
| E | **Technicals** detail screen | "More technicals" / Metrics-menu → Technicals | Same sheet chrome; own timeframe selector (1h…1mo) |
| F | **Metric-detail drill-in** (single line-item) | Tapping any row inside Statements/Statistics table | Adds a "← Back" pill under the header |
| G | **Financials search modal** | Tapping the 🔍 icon next to the Statements/Statistics/Dividends pill row | Full-screen, `X` close, live keyboard, alphabetical grouped list |
| H | **"···" action sheet** (Share / Notes / Metrics) | Tapping "···" top-right of Symbol Detail header | Half-sheet overlay; "Metrics" sub-list expands in place |
| I | **Analysis Hub** bottom sheet | A tool elsewhere in Chart (not the symbol header) | Full drag-sheet, grabber handle, `X` close, icon grid |
| J | Options metrics block (ATM IV term structure + Volatility curve) | Embedded in Overview scroll, and standalone via Metrics → Options | — |
| — | *(Adjacent, not symbol-detail)* Indicator/object context menu | Long-press a chart drawing/indicator | Mis-captioned frame `IMG_2324`; documented in §6 only |

---

## 2. Layout trees

### 2A. Symbol Quick-Info (push page) — NVDA example

Header region (`y0–130pt`), pure black canvas throughout, hairline at **y=130pt**.

```
[Status bar 3:39 ...]                                         44pt (system)
┌─────────────────────────────────────────────────────────────┐
│ (●NVDA logo 36pt circle)  NVDA                          [X] │  Row ~86pt tall
│                                                               │  logo x-inset 20pt from left edge
└─────────────────────────────── hairline #4A4A4A, 1pt ────────┘  y=130pt
  NVIDIA Corporation ↗ · NASDAQ                                   20pt/Semibold, ↗ = external-link glyph 12pt
  Electronic Technology · Semiconductors                          15pt/Regular, secondary gray #707070
  200.75 USD  +5.71 +2.93%                                        price ~29pt Bold; "USD" 14pt caption riding baseline;
                                                                    change in green #22AB94, same 20pt Semibold
  Last update at 15:39 GMT-7                                      13pt secondary gray
  199.15 USD  −1.60 −0.80%   [🌙 Post-market label blue]           extended-hours price block, red #F7525F change
  Last update at 15:38 GMT-7
  [199.10×100]  [199.19×100]                                      two capsule chips, bid navy #0D1B33 / ask maroon
                                                                     #300B0E bg, blue #2962FF numerals, ~34pt tall
  194.95   DAY'S RANGE   202.00                                    label 13pt caps+tracking, gray; endpoints 17pt
  ▬▬▬▬▬▬▬▬▬▬[███ teal segment ███]▬▬▬▲▬▬▬▬                        track: 4pt rounded bar, gray #2E2E2E, teal fill
                                                                     #22AB94 for current-range slice, white ▲ marker
  164.07   52WK RANGE   236.54                                    identical anatomy, second slider
  ▬▬▬▬▬▬▬▬[██small teal██]▬▬▬▲▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬
  ┌───────────────────────────────────────────────┐
  │ 🖊  Add note                                +  │  full-width capsule pill, bg #2E2E2E, ~50pt tall, 16pt insets
  └───────────────────────────────────────────────┘
  Key stats                                                        20pt Bold section header
  Next earnings report            In 26 days                      each row: label left / value right, 17pt, ~44pt row
  Volume                          139.78 M
  Average Volume (30D)            138.87 M
  Market capitalization           4.86 T
        ⌄  (collapse/expand pill, 34pt circle, #2E2E2E)
  Earnings                                          [26]          section header + rounded "26" quarter-count badge
  (scatter/line chart, axis 2.40/1.80/1.20…; teal filled dots = Actual, hollow ring = Estimate; x-axis "Q2 '25"… )
     Actual ● / Estimate ○  legend
     [More info] pill
  Dividends
     (donut gauge, ring #2E2E2E track, teal #22AB94 arc = Payout ratio TTM, tick mark accent)
     "0.61%" centered, ~28pt Bold
     Earnings retained ● / Payout ratio (TTM) ●  legend
     Dividend yield TTM              0.14%
     Last payment                    0.25
     Last ex-dividend date           Jun 4, 2026
     Last payment date               Jun 26, 2026
     [More info] pill
  Income statement ⌄                    Annual | Quarterly  (Annual underlined blue = active)
     (grouped bar+line combo chart: Revenue bars blue, Net income bars cyan, Net margin % line orange with hollow dot markers)
     Revenue ● / Net income ● / Net margin % ●  legend
     [More financials] pill
  Performance
     6 stat chips in a 3×2 grid: 1W / 1M / 3M / 6M / YTD / 1Y
       negative chip: dark red bg #2A0E10ish, red text
       positive chip: dark green bg, green text
  Seasonals
     (3 overlaid line-series per year: 2024 orange / 2025 green / 2026 blue, dashed quarter gridlines, Jan/Apr/Jul/Oct axis)
  Technicals
     (semicircular gauge, red→purple gradient sell arc, gray buy arc, white needle, "Neutral" label above+below)
     [More technicals] pill
  Analyst rating
     (semicircular gauge, orange→yellow→green gradient, white needle) "Strong buy"
     1 year price target        314.29  (+56.56%)   ← green parenthetical
     [See forecast] pill
  Highest YTM bonds
     Jun 15, 2056     6.34%
     Jun 15, 2046     6.21%
     Apr 1, 2060      6.12%
     [More bonds] pill
  ATM IV term structure
     (line+dot chart, blue #2962FF, 1W…1Y x-axis, % y-axis)
  Volatility curve (28 days)
     (smile-shaped line chart, blue, strike x-axis, IV% y-axis)
     [More on options] pill
  Profile
     Website          nvidia.com ↗
     Employees (FY)   42 K
     ISIN             US67066G1040  [copy icon]
     CUSIP            67066G104    [copy icon]
     FIGI             BBG000BBJQV0 [copy icon]
     CFI code         ESVUFR (underlined) [copy icon]
     (company description paragraph, 17pt, ~1.4 line-height, truncated with ⌄ expand chevron pill)
└───────────── hairline ─────────────────────────────────────┘  y=791pt
[Watchlist] [Chart] [Explore] [Community] [Menu]                  global tab bar, 83pt tall total
                                                                    (49pt content + 34pt home-indicator safe area)
```

Bottom tab bar detail: 5 equal-width items, icon ~26pt, label ~10pt Medium below with
2pt gap; "Chart" icon carries a small red dot badge (top-right of icon, ~8pt circle).

### 2B. Symbol Detail sheet (chart-anchored) — AXP example

```
[Status bar]  [chart's own pill search/record indicator]                y 0–~60pt (belongs to Chart screen, not the sheet)
··· (chart menu)      TV logo watermark        + (compare)              y ~60–95pt (Chart screen chrome)
                    ▬▬ grabber handle (46,46,46 gray, ~4pt tall, ~36pt wide, centered) y ~100pt
┌── sheet top radius ~14pt ─────────────────────────────────────────┐   sheet begins ~y=108pt
│ (●AMEX logo 36pt circle) American Express Company ⌄          ···  │   row ~120pt tall; chevron = ticker-switcher
│  AXP · NYSE  [🌙 ●] [👑 teal]                                     │   two small session/plan badge pills, ~24pt each,
│                                                                     │   dark bg (moon=extended-hours indicator,
│                                                                     │   crown/laurel=premium data badge, teal icon)
│ 336.25 USD                                                         │   ~30pt Bold
│ −1.27 −0.38% at close                                              │   17pt, red #F7525F, "at close" gray suffix
│ [🌙 336.58  +0.33 +0.10%]                                          │   pill row, post-market re-quote, green delta
│                                                                     │
│  (1D candlestick chart — teal-up #22AB94 / red-down #F7525F        │   chart plot area ~430pt tall
│   bodies, thin wicks, dashed gray prior-close line, right-side     │
│   price-axis labels e.g. 340/339/338/337/336, floating price       │
│   tag at last value)                                               │
│                                                                     │
│  (⏰+) alert-quick-add          07:00 08:00 09:00 10:00 (11:00 bold)  12:00  14:00      (📈) indicator toggle
│  ── x-axis time ticks, current/bold time is heavier weight ──      │
│  [1D][5D][1M][3M][YTD][1Y][5Y][All]                    ⤢ fullscreen │  range pills row, "1D" selected = dark
│                                                                     │   capsule #2E2E2E-ish bg; ⤢ = expand icon in
│                                                                     │   dashed-corner square, 34pt
│  ─────────────── hairline ──────────────────────────────────────   │
│  ┌───────────────────────────────────────────────────────────┐    │
│  │                      Trade                                │    │  white capsule, 402−32=370pt wide, ~40pt tall,
│  └───────────────────────────────────────────────────────────┘    │  16pt side insets, bold black label
│  Overview⬛  News   Minds   Ideas                                   │  tab row: active = dark pill #282828 bg + white
│                                                                     │  bold text; inactive = plain gray #808080 text
│  ─────────────────────────────────────────────────────────────    │
│  ⚡ 22:45 · Jul 30 · 5 Must-Read Analyst Questions From American…▸ │  "news flash" card: rounded dark-purple tint bg,
│                                                                     │  bolt icon, 2-line clamp, chevron affordance
│  Key stats                                                         │  (same section pattern as 2A from here down:
│  Volume … Average volume (30D) … Market capitalization …           │   Volume/Avg vol/Mkt cap/Div yield/P·E/EPS/
│  Dividend yield (indicated) … P/E (TTM) … Basic EPS (TTM) …        │   Net income/Revenue/Shares float/Beta)
│  Net income (FY) … Revenue (FY) … Shares float … Beta (1Y)         │
│  [More financials ▸]                                                │
│  Earnings  (Actual-only red dots chart, no Estimate yet)            │
│    Next earnings report   Oct 23, 2026 🌅        [Add 📅]  ← pill-button, dark bg, calendar+arrow icon
│    Report period         Q3, 2026
│    EPS estimate          4.56 USD
│    Revenue estimate      20.11 B USD
│  [More earnings ▸]
│  Dividends  (donut gauge "21.48%")
│  [More technicals ▸] → Analyst rating gauge "Buy" → 1yr target 377.29 (+12.21%) → [See forecast ▸]
│  Employees
│    Employees (FY) 76.8K / Revenue per Employee 1.05M / Net income per Employee 140.09K
│  Highest YTM bonds → [More bonds ▸]
│  About
│    Sector Finance / Industry Finance-Rental-Leasing / CEO Stephen J. Squeri /
│    Website americanexpress.com (blue link) / Headquarters New York / Founded 1850 /
│    IPO date May 17, 1977 / ISIN·CUSIP·FIGI·CFI (each with copy-icon)
│    (description paragraph, expand/collapse chevron)
│  ─── chart's own bottom bar peeks in: mini watchlist tape (META/NVDA/BABA rows) ───
│  (pencil) (trendline) (··· menu, red dot badge) | (undo) (redo)         drawing toolbar, ~60pt tall
└─────────────────────────────────────────────────────────────────────┘
```

Session/plan badge pill anatomy (measured ~190×52px crop ≈ 63×17pt visible glyph area,
badge capsule itself ~24pt tall): two adjoining rounded-rect chips, left = dark navy with
a filled crescent-moon glyph (extended-hours indicator), right = dark teal with a
laurel/crown glyph (data-plan indicator) — both sit directly right of the "AXP · NYSE"
line.

### 2C. Financials detail screen — pill row anatomy

```
🔍  [Overview] [Statements] [Statistics] [Dividends] [Earnings] [Segments]   ← horizontally
     ~34pt tall pills, 8pt gaps, selected = white bg #F2F2F2 + black bold     scrollable,
     text, unselected = #2E2E2E bg + gray text; leftmost search icon in a     search icon
     plain (no-bg) circle, tap opens surface G                               fixed, pills scroll
```

- **Statements** sub-row adds a second segmented row: `[Income statement] [Balance sheet] [Cash…]`
  (same pill styling) plus an `Annual | Quarterly` 2-way toggle, right-aligned.
- **Statistics** shows `Annual | Quarterly` toggle top-right, then a dual-series bar chart
  (Price-to-earnings ratio blue / Price-to-cash-flow ratio cyan), then a "Metrics" table
  with a frozen left label column and 2 data columns (period headers stacked: fiscal year
  on top, calendar month below in gray, e.g. "2025 / Dec 2025" then "Current"). Table is
  grouped under bold section headers: **Key stats**, **Valuation ratios**, **Profitability
  ratios**, **Solvency ratios**, **Per share metrics**. Two of the metric rows (whichever
  correspond to the two chart series) get a **left accent bar** (3pt wide, blue or cyan)
  and a subtle **row tint** (`rgba(41,98,255,0.10)`-ish navy wash) to tie the table row to
  its chart legend color.
- **Dividends** sub-row: `Next ex-dividend date`, `Next payment date`, `Dividend amount`,
  `Dividend yield TTM` as stat rows, then dual-axis line+bar chart (yield % left axis /
  per-share $ right axis), then **Dividend payout history** table: `Ex-dividend date |
  Record date | Payment date | Amount | Frequency` — this table is **wider than the
  screen** and scrolls horizontally independent of the page (col headers freeze, row
  hairlines every ~58pt).
- **Earnings** sub-row: `Latest report date`, `Report period`, `EPS`, `Revenue` stat rows,
  then `EPS`/`Revenue` bar charts each with `Annual | Quarterly` toggle and a **diagonal
  hatch overlay** (repeating 45° stripe pattern, translucent gray) covering the forecast
  years, labelled with a dark "FORECAST" pill centered in the hatched region.
- **Segments** sub-row: "by product/segment" stacked-or-grouped bar chart + table, then
  **By country** stacked bar chart (Rest of World / United States / Other / United
  States+EU+Japan series, 4-color legend) + table.

### 2D. Metric-detail drill-in (surface F)

Reached by tapping any row in a Statements/Statistics table.

```
{Company} · Financials                                    ◇ (pin/compare icon)
┌────────┐
│ ← Back │   pill button, #2E2E2E bg, ~40pt tall, left-aligned, 16pt inset
└────────┘
Basic earnings per share (basic EPS)  (?)                 title ~24pt Bold, wraps 2 lines,
                                                            trailing "?" = 20pt circled-question tooltip icon
Annual data                                                15pt label
(single-series bar chart, blue #2962FF bars, one per fiscal year + a final "TTM" bar)
Period          Value          Change %                    table header row, gray labels
TTM             41.91          −2.69%   (red)
2025            43.07          +5.31%   (green)
2024            40.90          +10.37%  (green)
2023            37.05          −8.53%   (red)
...
```
Row height in this table ≈ 82pt (label+value+% all on one 17pt text baseline, generous
vertical padding — noticeably taller than the Statements list rows). Change % column
color-codes green/red per sign; hairline divider between every row.

### 2E. Financials search modal (surface G)

```
Financials                                                          ✕
────────────────────────────────────────────────────────────────────
🔍  |                                                                  active caret, full-width field, no visible
                                                                        border box — just the icon + hairline below
STATEMENTS                                                            13pt caps section label, gray, left-inset ~16pt
Accounts payable
Accounts receivable (trade, net)
Accounts receivables (gross)
Accrued payroll
...
────────────────────────────────────────────────────────────────────  (row under keyboard-focus gets #3A3A3A highlight)
⌃ ⌄                                                    Done            up/down row-navigation chevrons + Done, sits
                                                                        directly above the system QWERTY keyboard
[ QWERTY keyboard ]
```
List rows ≈ 76pt tall, 17pt text, no per-row hairlines visible in this list (just
whitespace rhythm) except the keyboard-focused row which gets a full-bleed `#3A3A3A`
(approx) highlight rectangle. Section header "STATEMENTS" (and elsewhere "Currency:",
etc.) is small-caps gray, matches other section-label styling app-wide.

### 2F. "···" action sheet (surface H)

```
Share                                              ⬆ (share icon)
Notes                                               🖉 (edit icon)
▾ Metrics                                                              chevron-down = expanded, bold row
   Financials         📊
   Documents          📄
   Technicals         🎚 (gauge icon)
   Forecast           📈 (trend-arrow icon)
   Seasonals          🍂 (leaf/season icon)
   Options            〽 (strike-ladder icon)
   Bonds              💵
   ETFs               🧺
```
Presented as a half-height overlay anchored top-right, semi-transparent scrim over the
rest of the sheet (the underlying "Highest YTM bonds" / "About" content is still dimly
visible through it). Rows ~92pt tall, icon right-aligned ~28pt, label left-aligned 19pt
Semibold, `#2E2E2E`-ish separators between rows, "Metrics" header itself is bold with a
chevron and slightly darker/highlighted background than its children.

### 2G. Analysis Hub (surface I)

Full drag-sheet, grabber handle centered top, title **"Analysis hub"** (Bold ~28pt) with
`✕` circle-button top-right (`#2E2E2E` filled circle, ~40pt). Content is a **2-column
icon-tile grid**: tile ≈ 175pt wide × 130pt tall, `#1C1C1E`-ish rounded-rect bg, centered
glyph ~32pt above a 15pt Medium caption. Some tiles span narrower (3-across row) for
"Indicator templates / Chart type / Object Tree". Sections: unlabeled top grid
(Indicators, Compare, Alerts [with red-dot badge], Bar Replay, Indicator templates,
Chart type, Object Tree), then **INFO** (Symbol details, Financials, Forecast,
Technicals), then **MORE** (Pine Editor, Siri shortcut, Publish Idea — full width), then
a standalone **Help Center** row below the sheet's main card, outside the tile grid.

---

## 3. Component anatomy reference

**List/stat row** (Key stats, About, Employees, etc.)
- Height: ~44pt single-line, up to ~64pt when value wraps a unit suffix (e.g. "617.78 B USD")
- Layout: label left (17pt Regular, primary `#DBDBDB`), value right-aligned (17pt
  Regular/Semibold primary, with a smaller 13pt gray unit suffix riding the baseline, e.g.
  "USD"/"B"/"K"/"M")
- No divider between simple stat rows (Overview sections); **table-style** rows
  (Statements/Statistics/metric-detail) DO get a full-width `#4A4A4A` hairline, inset 0
  (edge-to-edge)

**Financial/Statistics table row**
- Two or three right-aligned numeric columns + left label column (label truncates with
  `…` if it overflows, full text only visible via the search modal or by opening the
  metric detail page)
- Frozen header row: `Metrics / Currency: USD` (label col) + period headers (fiscal year
  bold, calendar-month gray subtext) — this header re-appears (sticky) as you scroll
  within a sub-tab
- Selected/charted metrics get a **3pt left accent bar** in the series color + faint
  color-matched row background wash

**Segmented pill control** (Statements/Statistics/Dividends…; Annual/Quarterly; range 1D…All)
- Height ~34pt (measured), fully rounded (capsule), 2px gap between adjacent pills when
  they're separate buttons (Overview/Statements/Statistics/…), OR a single track with a
  sliding selected segment (Annual|Quarterly, 1yr-target style)
- Selected: white/`#F2F2F2` bg, black bold text
- Unselected: `#2E2E2E` bg, `#DBDBDB`/gray text

**Capsule action button** ("Add note", "More info", "More financials", "See forecast", "← Back")
- Height ~40–50pt, bg `#2E2E2E`, label 15–17pt Semibold primary color, optional trailing
  chevron `▸` (gray, 12pt) when it navigates deeper; optional leading icon (pencil for
  "Add note")

**Gauge (semicircle dial)**
- Diameter ≈ 220pt, stroke width ≈ 14pt, track drawn as a colored arc gradient (two
  variants seen): **Technicals** = red → magenta/purple → gray (sell-biased side colored,
  buy side left uncolored/gray until value crosses); **Analyst rating** = orange → yellow
  → green (full gradient always visible). Center needle: white, pivoting from bottom
  center, thickness ~4pt, rounded cap. Below the needle, a bold word-label ("Neutral",
  "Strong buy") mirrors the top-center label.
- "Summary" style gauge (Technicals detail page) additionally prints a 3-column
  `Sell / Neutral / Buy` count readout beneath, each column = 13pt gray label over a
  ~24pt Bold number

**Donut gauge** (Dividends payout ratio)
- Outer diameter ≈ 230pt, ring thickness ≈ 34pt, track `#2E2E2E`, progress arc teal
  `#22AB94` starting at 12 o'clock, small tick/pointer mark at the ring's leading edge,
  centered percentage label ~28pt Bold teal, 2-item legend below (dot + label ×2)

**Bid/Ask quote chips**
- Capsule, ~34pt tall, auto-width to content, bg tinted navy (bid) / maroon (ask),
  numerals blue `#2962FF` (bid) / red-pink (ask), format `{price}×{size}`

**Range/day slider** (Day's Range, 52Wk Range)
- 4pt-tall track, full width, rounded ends, base color `#2E2E2E`, a colored (teal) inset
  segment marks the meaningful sub-range (day's actual range within an implied larger
  scale for 52wk), small upward-pointing white triangle marks "current price" position
  under the track; numeric endpoints flank the caption above the track (caption is
  centered, small-caps, gray, letter-spaced)

**News row** (News tab / Overview news-flash card)
- List: leading ~28pt circular source-logo avatar → `{time} · {date} · {source}` gray
  caption row (13–14pt) → headline 2–3 line clamp (19pt Semibold primary) → optional
  trailing square thumbnail (~90×90pt, rounded ~8pt) for stories with art
- Loading state: identical geometry rendered as flat dark-gray skeleton blocks
  (`#141414`-ish) with no shimmer visible in the captured frame
- Inline "flash" card (top of Overview): single most-recent headline, rounded card,
  dark purple/violet tinted bg, bolt-icon leading, trailing chevron, 2-line clamp

**Company header block** (Symbol Detail, surface B)
- Logo: 36×36pt circle, brand-colored fill, initials/logomark centered
- Title row: company name 20–22pt Bold + small `⌄` chevron (ticker-switcher affordance)
  to the right of the name; "···" icon far right (28×28pt tap target)
- Subtitle row: `{TICKER} · {EXCHANGE}` 15pt gray, followed by 1–2 small status badge
  pills (~24pt tall) for session state (moon = pre/post-market) and data-plan tier
  (crown/laurel)
- Price row: ~30pt Bold + 17pt "at close"/session-state gray suffix, change value+% in
  green/red directly after

**Global bottom tab bar** (surface A only — absent from B/C/D/E/F/G/I which sit as sheets
over Chart)
- 5 items, equal width, icon ~26pt line-icon + 10pt Medium label, 2pt gap; total bar
  height 83pt = 49pt content + 34pt safe-area; hairline `#4A4A4A` divider above it;
  active item currently indistinguishable in color from inactive in these captures
  (all appear white/gray — the active "Chart" vs "Watchlist" state wasn't isolated)

---

## 4. Interactions inferred from consecutive frames

- **IMG_2289→2295** (2s apart, NVDA): a single continuous downward scroll through one
  page — confirms Key stats → Earnings → Dividends → Income statement → Performance →
  Seasonals → Technicals → Analyst rating → bonds → Options (ATM IV, vol curve) → Profile
  → description is **one scroll, not swipeable tabs**, in the Quick-Info surface (A).
- **t-031→t-032** (REGN, Forecast): scrolling from the price-target fan chart straight
  into "Analyst rating" text intro — confirms Forecast page order: Price target chart →
  Analyst rating gauge+breakdown → EPS chart(+table) → Revenue chart(+table) → Disclaimer.
- **t-035→t-038** (REGN, Financials/Statistics): scroll reveals sticky-ish header
  ("Metrics / Currency: USD / 2025 / Current") persisting while section headers "Key
  stats" → "Valuation ratios" → "Profitability ratios" scroll past — table sections are
  independently labeled but share one continuous scroll and one frozen 3-column layout.
- **t-036→t-037**: tapping the pill row scrolled it — "Overview [Statements] [Statistics]
  Dividends" pills are **horizontally scrollable**, and tapping a pill also **resets the
  vertical scroll position to top of that sub-tab's content** (Statistics content starts
  fresh at its own chart, not where Overview left off).
- **t-039→t-048**: cycling Overview→Statements→Statistics→Dividends→Earnings→Segments
  pills each swaps the entire content well below the pill row instantly (no visible
  transition animation captured — consistent with a plain crossfade/instant swap at 2s
  sampling).
- **t-062→t-077**: tapping the 🔍 icon opens a **full-screen modal** (surface G) with an
  immediately-focused text field and system keyboard; scrolling the result list while the
  keyboard is up is possible; tapping a row (e.g. "Basic EPS") **dismisses the modal and
  navigates to the metric-detail page** (F) — confirmed by t-064/t-065 showing "Basic
  earnings per share" appear immediately after.
- **t-065→t-067**: the metric-detail page (F) has a "← Back" pill (not a nav-bar chevron)
  — tapping it returns to the search modal's last state (still scrolled to the same
  letter), not to the underlying Statements table directly — i.e. Search → Metric-detail
  → Back is a 2-deep push stack layered on top of the sheet.
- **t-090→t-093→t-098** (AXP): scrolling Overview continues past Dividends/Earnings donut
  straight into "Technicals" recap → "Analyst rating" gauge → "Employees" → "Highest YTM
  bonds" → "About" (sector/industry/CEO/website/founded/IPO/identifiers) → description —
  i.e. surface B's Overview tab is a **superset** of surface A's content, reordered
  slightly (About/company-facts block appears near Employees/bonds rather than at the very
  end after Options, and B's Options block was not observed — likely present further down
  or gated behind the Metrics menu only for B).
- **t-096→t-097**: tapping "···" opens the action sheet (H); tapping "Metrics" (already
  expanded by default in the capture) highlights each row briefly on tap (t-097 shows
  "ETFs" mid-highlight) before presumably navigating — confirms Metrics entries are the
  **same destinations** as the Overview "More X"/"See forecast" pills, just centralized.
- **t-087→t-088→t-089**: opening the News tab shows a **skeleton-loading placeholder**
  first (t-088, uniform dark blocks matching the eventual row geometry) then populates
  with real headlines 2s later (t-089) — confirms an async fetch with a shimmer-less
  skeleton state.
- **IMG_2326→IMG_2327**: tapping "News" in the AXP/JNJ tab row swaps Overview's
  "flash card + Key stats" body for a **plain reverse-chronological headline list**
  grouped only by a "Show [All ▾]" filter control, no further sectioning.

---

## 5. Features list (distinct product capabilities observed)

1. **Real-time + extended-hours dual quote** — separate at-close and pre/post-market
   price lines, each with its own timestamp and delta.
2. **Level-1 bid/ask size chips** (`price×size`) directly under the quote.
3. **Day's Range and 52-Week Range sliders** with a current-price marker.
4. **Freeform note-taking on a symbol** ("Add note" capsule).
5. **Earnings actual-vs-estimate scatter/bar chart** with a live "next earnings in N days"
   countdown and one-tap **"Add" to calendar/alert** for the next report.
6. **Dividend payout-ratio donut gauge** + yield/payment-date facts + full payout history
   table (ex-div/record/payment date, amount, frequency) with per-metric drill-in.
7. **Income statement teaser** (Revenue/Net income bars + Net margin line) that expands
   into a full **Financials** module with Statements (Income/Balance/Cash flow),
   Statistics (30+ valuation/profitability/solvency/per-share ratios), Dividends,
   Earnings, and Segments (by product & by country) — every line item drillable to its
   own historical bar chart + period table via a **searchable metric picker**.
8. **Trailing performance chips** (1W/1M/3M/6M/YTD/1Y) color-coded green/red.
9. **Seasonals overlay chart** comparing the current year's price path against the prior
   2 years on a common Jan–Dec axis.
10. **Technicals summary** — Buy/Sell/Neutral gauge + counts, broken into Oscillators and
    Moving Averages sub-gauges, each expandable into full **Name/Value/Action** tables
    (RSI, Stochastic, CCI, ADX, Awesome Oscillator, Momentum, MACD, Stoch RSI, Williams %R,
    Bull/Bear Power, Ultimate Oscillator; then EMA/SMA 10-200, Ichimoku, VWMA, Hull MA),
    plus a **Pivots** table (Classic/Fibonacci/Camarilla/Woodie × R3-R1/P/S1-S3) — with a
    timeframe selector (…4 hours/1 day/1 week/1 mo).
11. **Analyst rating gauge + 1-year price target** with % upside, drilling into a full
    **Forecast** page: price-target fan chart (max/avg/current/min bands with %s),
    Strong-Buy…Strong-Sell horizontal bar breakdown with analyst counts, EPS forecast
    chart+table (reported vs. estimate, diagonally-hatched "FORECAST" future region),
    Revenue forecast chart+table, and a disclaimer with a Terms-of-Use link.
12. **Bond listing** — "Highest YTM bonds" teaser (date + yield) expanding to "More bonds".
13. **Options analytics** — ATM IV term structure (1W…1Y) and a full volatility smile/skew
    curve (by strike), plus an ETFs-holding-this-stock surface (seen only as a Metrics
    menu entry).
14. **Company profile/identifiers** — website (external link), employee count,
    ISIN/CUSIP/FIGI/CFI with one-tap **copy-to-clipboard** icons, and an expandable full
    business-description paragraph plus per-segment operating description.
15. **Company "About" facts** — sector, industry, CEO, headquarters, founded date, IPO
    date (distinct block from #14, seen on the chart-anchored surface).
16. **Revenue/earnings segmentation** — by product line and by geography, each as a
    stacked bar chart across ~7 fiscal years with its own data table.
17. **News feed** scoped to the symbol, multi-source (Benzinga, Reuters, Dow Jones
    Newswires, Zacks, Stock Story, TradingView originals), with a "Show: All ▾" source
    filter and a single-story "flash" callout surfaced inside Overview.
18. **Minds** and **Ideas** tabs present in the tab bar (community commentary / published
    chart ideas) — not opened in any captured frame (open question, §7).
19. **Ticker-switcher affordance** — chevron next to the company name (likely opens a
    symbol-swap search without leaving the sheet).
20. **"Metrics" command palette** — a centralized "···" → Metrics list (Financials,
    Documents, Technicals, Forecast, Seasonals, Options, Bonds, ETFs) that deep-links into
    the same destinations reachable from inline "More …" buttons — two navigation paths
    into identical content.
21. **Analysis Hub** — a separate, more powerful tool tray (Indicators, Compare, Alerts,
    Bar Replay, Indicator templates, Chart type, Object Tree, Pine Editor, Siri Shortcut,
    Publish Idea, Help Center) that also contains its own shortcuts to Symbol
    details/Financials/Forecast/Technicals — a **third** entry point into symbol-detail
    content, from the charting surface rather than the symbol header.
22. **Trade button** — persistent call-to-action pinned above the tab row on the
    chart-anchored Symbol Detail sheet (broker hookup, not exercised in captures).
23. **Horizontally-scrolling wide tables** (Dividend payout history, quarterly Statistics)
    that scroll independently of the page's vertical scroll.
24. **Skeleton loading states** for async content (News tab confirmed).

---

## 6. Adjacent surface (not symbol-detail, seen once)

`IMG_2324.PNG` — a chart **object/indicator context menu** (long-press on a chart element,
BABA symbol visible faintly in the dimmed strip above): rows are `Add alert on
TH_RSIMACD+…`, `Add indicator/strategy on …`, `Add this indicator to favorites`, then a
second group `Visual order ▸ / Visibility on intervals ▸ / Move to ▸ / Pin to scale (now
right) ▸`, then `Copy / Hide / Remove`, then `Object tree… / Settings…`. Same half-sheet
chrome as the "···" action sheet (H): grabber handle, `#141414`-ish rows, hairlines
between groups, chevrons on rows that open a further sub-list. Included for completeness
only — it is a chart-drawing feature, not part of the symbol-detail information
architecture, and should **not** be built as part of this surface.

---

## 7. Open questions (need live interaction to resolve)

1. **Minds and Ideas tabs** were never opened in any captured frame — their layout,
   content model, and whether they support posting/commenting is unknown.
2. **Ticker-switcher chevron** next to the company name (surface B header) — unconfirmed
   whether it opens a search sheet, a watchlist picker, or a related-symbols list.
3. **Ticker "at close"/session badge exact semantics** — the moon-icon badge appears both
   as a small header pill and as an inline "🌙 336.58 +0.33 +0.10%" row; unclear if
   tapping either does anything (toggle live/close view?) or is purely informational.
4. **"Trade" button destination** — never tapped in the captures; unknown whether it's an
   in-app broker order ticket, an external broker link picker, or paywalled.
5. **Financials/Technicals/Forecast pill navigation origin duplication** — three entry
   points (Overview "More X" buttons, "···" → Metrics, Analysis Hub → Info) all appear to
   converge on the same screens, but whether the **back-navigation target** differs by
   entry point (e.g. does "← Back" from a Metrics-menu-opened Financials screen return to
   Metrics or to Overview?) was not observable.
6. **Active-state styling of the global bottom tab bar** (surface A) — could not isolate a
   visually distinct "selected" icon/label color from the captured frames; assume
   standard iOS tab-bar tinting (accent vs. gray) until confirmed live.
7. **Exact point size of the hero price text** — measured cap-height converts to ~24–30pt
   depending on assumed cap-height ratio; recommend confirming against a live Dynamic Type
   accessibility inspector rather than trusting the pixel-measurement conversion.
8. **Whether Quick-Info (A) and Symbol Detail (B) are two genuinely different, reachable
   surfaces, or whether A is simply an older/alternate build's version of B** — the NVDA
   captures (A) and AXP/JNJ/REGN captures (B) never appear back-to-back in the same
   session, so the transition between them (if any) was never directly observed. Treat
   the "two surfaces" framing in this doc as the best available inference, not a
   confirmed fact, and verify with a live device before committing SwiftUI navigation
   architecture to it.
9. **Skeleton-loading shimmer** — the News-tab loading state (t-088) shows flat gray
   blocks with no visible shimmer/pulse animation in a single still; a real shimmer
   animation may exist between the sampled frames.
10. **Segments tab's 4th legend series** ("United States, European Union, Japan" —
    purple dot) never shows a non-zero value in the sampled table rows; unclear if it's
    a real data series or a legend artifact for a category with no recent data.
