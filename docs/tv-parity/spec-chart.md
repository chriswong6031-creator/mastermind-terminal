# TradingView iOS — "Chart" Surface — Pixel Spec

Source: 23 static screenshots (`IMG_22xx.PNG`) + 24 video frames (`t-0xx.png`), all
**1206×2622px @3x** → **402×874pt**. All pt values below = measured px ÷ 3, via
`PIL.Image.getpixel` / numpy column-profile scans, cross-checked with a custom
ruler-overlay script (`scratchpad/tvspec/ruler.py`) that burns in absolute-pixel
gridlines so positions can be read directly off a rendered crop. Where a value is
visually estimated rather than edge-detected, it is marked **(≈ est.)**.

Two device chrome variants appear across the captures: the **video frames**
(`t-0xx`) show a screen-recording pill instead of the carrier/app-name pill; the
**static PNGs** (`IMG_22xx`) show a white `TradingView` pill. Cosmetic only —
ignore for rebuild purposes. Status bar height in both = **184px / 61.3pt**,
`#000000`.

---

## 1. Surface inventory

| # | Surface | Presentation | Seen in |
|---|---|---|---|
| 1 | **Chart screen** (quote header + multi-pane canvas + bottom toolbar + tab bar) | full screen | t-008…021, 026, 084 |
| 2 | **Symbol / interval scroll-wheel switcher** (overlay while dragging bottom-left symbol or bottom-right interval label) | transient overlay, no scrim | t-014, t-015 |
| 3 | **Interval picker "wheel" sheet** (tap interval label) | translucent scrim + vertical list, center item emphasized | t-011 |
| 4 | **Analysis hub** ("+" / hub button) | bottom sheet, ~85% height, scrollable | IMG_2281/2282, t-019/022/027/030/033/034 |
| 5 | **Analysis hub → "⋯" context menu** (on Manage-layout tile) | inline popover anchored under the tile (Autosave, Make a copy, Rename, Sharing, Share link, Open link) | t-023, t-028, IMG_2308 |
| 6 | **Autosave / Sharing sub-toggle** (drill-in of the context menu) | same popover, replaces rows with On/Off radio list | t-029 |
| 7 | **Chart type sheet** | bottom sheet stacked over Analysis hub | IMG_2286/2287, t-019 (as a route) |
| 8 | **Object tree sheet** | full-height sheet (near full screen) | IMG_2288, t-025 |
| 9 | **Layout (pane-split) sheet** | bottom sheet | IMG_2306/2307 |
| 10 | **Create-layout name prompt** | half-sheet + system keyboard, Cancel/Create layout/Save nav bar | IMG_2309 |
| 11 | **Layouts manager** (saved layouts library) | full-height sheet, searchable list | IMG_2310 |
| 12 | **"Chart saved" toast** | transient centered overlay on the chart | IMG_2311 |
| 13 | **Drawings picker sheet** (7 tabs) | bottom sheet, ~full height, segmented tab row | IMG_2312-2319 |
| 14 | **On-chart indicator legend** (per-pane overlay list, top-left of each pane) | always-on translucent overlay, expandable | t-013…018, 023, IMG_2321-2323 |
| 15 | **Selected-indicator quick-action pill** | floating pill replacing the legend row on tap | IMG_2323 |

---

## 2. Layout trees, geometry, typography, color

### 2.1 Chart screen — top-to-bottom

```
Status bar            0–184px   (0–61.3pt)   #000000, pure black
─────────────────────────────────────────────────────────────────
Quote header block   184–~430px (61.3–143pt)  bg #171A21 (chart canvas bg
                                               begins here — header has NO
                                               separate surface, it overlays
                                               the canvas directly)
  Row A — identity          y 186–290 (≈ h 35pt)
    • Provider/exchange icon: circle, ⌀ ~50px/16.7pt, x 68–120(REGN)
        fill #005092 (equity icon bg) — flag emoji art for futures/FX
    • Symbol name, x 140–760, truncated w/ "…": color #A9ABB7 (169,171,183),
      weight Medium/Semibold, cap-height ~50px → ≈ 20pt
    • "···" 3-dot overflow (equities) OR "▬" mute/compare icon (futures),
      x ~800, same row
    • Dark/Light theme toggle (moon/sun in filled circle), ⌀ ~50px/16.7pt,
      x 800–855 — ONLY present once a manual scale/theme override is active
    • "Auto-fit"/reset-scale icon: rounded-square, 66×66px/22×22pt,
      x 865–935, fill highlights WHITE (#FFFFFF) with black glyph when the
      user has manually panned/zoomed (i.e. it's the "snap back to auto"
      affordance) — paired with a "↓" lock icon to its left (same size,
      dark fill #000000/1C1C1E) that appears at the same time
  Row B — price + change     y 245–345 (≈ h 33pt)
    "At close:" (equities only, gray #A9ABB7, ~14pt) + big price (white/gray
    #A9ABB7, bold, ~18–20pt) + change value & % (colored, bold, ~18pt):
      up   → #0B8E75 (teal-green)
      down → #EE2F3B (red)
    Futures/FX header omits "At close:" and instead right-pads with "•••"
    page-indicator dots (3 dots, 1 highlighted) — a horizontal-scroll hint
    for additional quote stats.
  Row C — controls            y 300–350 (≈ h 17pt)
    • Chevron "⌄" + count badge, rounded-rect outline (border #4A4A4A,
      no fill), x 68–200, h ~50px/16.7pt — collapses/expands the on-chart
      indicator legend; badge number = count of studies loaded
    • Auto-refresh/live-sync icon: circular arrows, purple #9B7FE0 on
      translucent purple-tinted dark disc (~#3C2E4C), ⌀ ~55px/18.3pt
  Reference line: 1px dotted horizontal rule at the prior-close / last price
    level, color = #0B8E75 (up) or #EE2F3B (down) matching change direction

Multi-pane canvas    ~430px → 2217px   bg #171A21
  • Main price pane (candles + up to N overlay studies: MAs, VWAP bands,
    proprietary "Market Oracle/Dynamics Pro" ribbons, etc.)
      – Candle body: bull #0B8E75 (measured median #0A8D74), bear #EE2F3B
        (measured #EE2F3B / badge #EF2F39) — TV's signature teal-green,
        NOT lime-green; carry this exact hue into the SwiftUI rebuild.
      – Right price scale: labels #A9ABB7 ~13pt regular; "round number"
        gridline labels (multiples of the visible step) render bold/near-white
        (~#FAFAFA) to emphasize major levels.
      – Live/last-price badge on the scale: pill, bull fill #0B8E75 /
        bear fill #EE2F3B, white bold text, 2-line variant shows HH:MM
        under the price when a specific bar is scrubbed.
      – Secondary reference badge: blue pill #2557FF/#2456FF, white bold
        text — marks a comparison value (e.g. previous session close or
        crosshair readout), independent of the bull/bear price badge.
      – Contract/instrument-code chip immediately left of a futures price
        badge (e.g. "MNQZ2026"), same fill color as the badge, white bold.
      – Quick-action affordances embedded in the plot, bottom-right of the
        pane: green "E" (session/extended-hours marker) badge (hex outline,
        ⌀ ~46px/15.3pt) + purple lightning-bolt disc (⌀ ~50px/16.7pt,
        same purple #9B7FE0 as the sync icon) — the latter opens a quick
        add-alert/compare affordance at the tapped price.
  • Volume sub-pane: thin bars, green/red matching candle colors, own
    compact right-axis (e.g. "10.00/0.00") + a small colored last-value
    badge.
  • Additional indicator sub-panes (0–3, user configurable): each gets its
    own horizontal divider-free band, its own right-axis scale, and its
    own set of colored last-value badges (one per plot in that study).
    Observed studies: a dot-marker oscillator ("TH_RSIMACD+"), a banded
    red/green oscillator ("CM_Stoch_MTF"), a classic blue/orange Stochastic
    RSI. Panes are user-resizable (implied — no visible fixed ratio; ratio
    varies per screenshot depending on indicator count).
  • Time axis: bottom-most strip inside the canvas, gray labels ~13pt,
    date/time transitions marked in bold when crossing a day/month
    boundary (e.g. "Aug" bold vs "09:00" regular).
  • Settings/hexagon icon, bottom-right corner of the time axis
    (⌀ ~40px/13pt) — opens chart settings.
  • "TV" bug watermark, bottom-left of the lowest visible pane, low-opacity
    white.
─────────────────────────────────────────────────────────────────
Toolbar row          2218–2372px (51.3pt)   #000000 pure black
  1px hairline above (#414141) and below (#414141) separating it from the
  canvas and the tab bar respectively.
  Layout (measured on REGN/1H example, y-center ≈ 2295):
    • Symbol label "REGN" — x 40–210, White #FFFFFF, Bold, ~26pt (large,
      the biggest text on this row) — tap opens the symbol scroll-wheel
    • Interval label "1H" — x 290–430, Bold White ~26pt — tap opens the
      interval-wheel sheet (§2.3); both labels show the PREVIOUS/NEXT
      wheel values ghosted above/below at ~40% opacity+smaller scale as a
      "there's more, keep scrolling" affordance even at rest (e.g. "CBOE
      /15m" dimmed above, "VEEV/2H" dimmed below)
    • Pencil/draw icon — x ~795–865, white stroke, ⌀ ~50px/16.7pt icon
    • "Magnet"/snap icon (double-chevron zigzag glyph) — x ~925–1010
    • "•••" more icon — x ~1055–1155, with a small red dot badge top-right
      (top-right corner offset ≈ +18,-14) indicating unseen items
    • 1px vertical divider, x ~1195
    • Undo (⟲) icon — x ~1260–1330
    • Fullscreen/expand icon — clipped at right edge (x >1290), only a
      sliver visible; becomes fully visible / is joined by Redo + Share
      icons once a drawing exists on the chart (see IMG_2322: order
      becomes "••• | ↶ ⤢ ↷ ⇧").
  All icons: white stroke, ~28×28pt touch targets, no fill/background.

Tab bar               2374–2622px (82.7pt)  ≈#090909 (near-black, likely a
  1px hairline above (#414141).                 blurred/vibrancy material)
  5 equal columns, 1206/5 = 241.2px/80.4pt each: Watchlist, Chart, Explore,
  Community, Menu.
    • Icon ⌀/bbox ≈ 28×22pt (bookmark/diamond-chart/compass/people/lines)
    • Label: White (active) / gray (inactive), Bold, ≈ 15pt — notably
      LARGER and BOLDER than stock iOS tab-bar captions (10pt); rebuild
      should not default to HIG tab-label size.
    • Icon→label gap ≈ 6pt
    • Content height ≈ 49pt + 34pt home-indicator safe area = 83pt total
      (matches measured 82.7pt almost exactly)
    • "Chart" tab icon = a diamond/kite outline containing a tiny
      candlestick glyph; carries a red notification dot (top-right) when
      an alert has fired.
    • Active tab = brighter icon/label; no pill/background highlight.
```

**Header content adapts by asset class** (compare t-010 MNQ2! vs t-017 REGN):
- Equities: `At close:  <price>  <±change> (<±%>)` — price/close explicitly
  labeled.
- Futures/FX: `<price>  <±change> (<±%>)` — no "At close" label, and the
  live-price badge shows the **contract code** chip (e.g. `MNQZ2026`) to the
  left of the numeric badge.

### 2.2 Symbol / interval scroll-wheel switcher (t-014, t-015)

Appears directly over the chart canvas mid-drag; no scrim, no sheet —
literally a big vertical `UIPickerView`-style list floating center-screen.

- Container: rounded-rect, dark translucent fill (~`#000000` @ ~55% opacity
  over the chart), centered horizontally, roughly 550×400px / 183×133pt.
- Row list (symbol variant): shows ~6 rows simultaneously — 2 above, center
  (selected), 3 below — decreasing size/opacity with distance from center:
  - Center row: white, ~34pt, bold (e.g. **"WMT"**)
  - ±1 row: light gray, ~28pt
  - ±2/±3 rows: dim gray, ~24pt, fading toward container edge
  - Each row is prefixed with a small circular symbol-icon avatar (⌀ ~50px)
    at far left, dimmed to match its row's opacity.
- Interval variant (t-011, see §2.3) uses the identical row-emphasis system
  but plain text, no icon, right-aligned under the interval label instead of
  the symbol label.
- Interaction: vertical drag/scroll on the bottom-toolbar symbol or interval
  label morphs directly into this wheel; releasing commits the centered
  value and the wheel collapses back into the toolbar label.

### 2.3 Interval picker "wheel" sheet (t-011)

- Full-screen dark scrim over the dimmed chart (chart still visible/blurred
  behind, ~30–40% dim).
- Vertical list, same center-emphasis rule as §2.2: "15 minutes" centered,
  bold, largest (~34pt white); "1 minute / 3 minutes / 5 minutes" above and
  "1 hour / 2 hours / 3 hours / 4 hours" below, shrinking + dimming with
  distance. No visible OK/Cancel — a tap or drag-release outside commits or
  dismisses.

### 2.4 Analysis hub (bottom sheet)

Reference: `IMG_2281`, ruler-measured.

```
Grabber pill: x 588–698 (110px/36.7pt wide) × ~16px/5.3pt tall, mid-gray,
  ~24px/8pt below the sheet's rounded top edge.
Title "Analysis hub": x 90–463, y 335–405 → cap-height ~70px ⇒ ≈28pt Bold,
  color #DBDBDB (near-white, NOT pure #FFFFFF).
Close "X": circular button, ⌀ ~96px/32pt, centered ~(1153,371),
  fill #313136, X-glyph light gray.
Sheet background: #1C1C1E (= iOS "systemGray6 dark" — standard elevated
  sheet material, distinct from the pure-black chart canvas and pure-black
  toolbar/tab-bar — this is the surface-hierarchy signal to mirror: sheets
  are dark GRAY, chart chrome is pure BLACK).
Horizontal content inset: 48px/16pt both sides (full-bleed sheet, only
  content is inset).

Row 1 — "Layout setup" / "Manage <name>" — 2-column, GHOST style:
  fill = transparent (matches sheet bg #1C1C1E exactly), 1px border #4A4A4A.
  Cell: x 48–590 / 616–1158 (≈542px/180.7pt wide each), gap 26px/8.7pt,
  y 450–617 (167px/55.7pt tall), corner radius ≈ 30px/10pt.
  Icon ~46×46px/15.3pt centered above a label, label ~17pt Medium, gray.

Row 2 — "New" / "Save" / "Open" — 3-column, FILLED style:
  fill #2C2C2E (measured directly), no visible border.
  Cells: x 48–401 / 427–779 / 805–1157 (≈353px/117.7pt wide each),
  gap 25px/8.3pt, y 654–821 (167px/55.7pt tall) — SAME height as row 1.
  "Save" shows a small red dot badge (unsaved-changes indicator) top-right
  of its icon.

Hairline divider: full-bleed 1px line, #4A4A4A, y ≈ 894 — the only element
  in this sheet that runs edge-to-edge with no margin.

CTA "Trade with your broker": full-width pill, x 48–1158 (16pt margins),
  y 967–1180 (213px/71pt tall — taller than the grid buttons, 2 lines of
  content), fill #2C2C2E, 1–1.5px GRADIENT border sweeping pink→purple→blue
  (`#FE46A5`-ish → `#4A5AFF`-ish left-to-right), icon = two chevrons
  ("look at broker connections"), label ~17pt Semibold white.

Section header "TOOLS" / "INFO" / "MORE": x=48 (16pt inset), gray
  (#8E8E93-ish), ALL-CAPS, ~13pt Semibold, letter-spaced.

TOOLS / INFO grid — 2-column FILLED tiles (Indicators, Compare, Alerts,
  Bar Replay / Symbol details, Financials, Forecast, Technicals) — same
  #2C2C2E fill, same ≈10pt corner radius, same 167px/55.7pt row height as
  row 2 above; "Alerts" carries a persistent small red dot (has active
  alerts). A 3-cell row ("Indicator templates" / "Chart type" / "Object
  Tree") sits between TOOLS and INFO at the same metrics but 3-up.

MORE row — 2-col ("Pine Editor" / "Siri shortcut" — the latter uses a
  colorful Siri-glyph icon instead of a line icon) + full-width
  "Publish Idea" tile below, then (scroll to bottom) a borderless
  "? Help Center" row centered, icon + label only, no card.
```

Sheet is a **navigation stack**, not a single screen: tapping "Chart type",
"Object Tree", "Layout setup", "Indicator templates" etc. **pushes a new
sheet on top** (you can see the previous sheet's top edge — e.g. the CTA's
gradient border — peeking above the new sheet, confirming a card-stack
presentation rather than a push/pop navigation controller).

### 2.5 Manage-layout "⋯" context menu (t-023/028/029)

Anchored popover (native `UIMenu` styling), appears overlapping the
Analysis-hub grid, right-aligned under the "Manage <name>" tile:
- Rows, each ~50pt tall, white/gray text ~17pt, SF-Symbol-style trailing
  icon or chevron:
  1. **Autosave** — `Off` subtitle, `>` chevron (drills into Off/On radio list)
  2. **Make a copy** — trailing duplicate-icon
  3. **Rename** — trailing pencil icon
  4. divider
  5. **Sharing** — `Off` subtitle, `>` chevron (drills into Off/On radio list,
     checkmark shown next to the active choice)
  6. **Share link** — trailing share icon, DISABLED/dimmed while Sharing=Off
  7. **Open link** — trailing "open in" icon, always enabled
- Background: same dark elevated menu material (~#2C2C2E with blur),
  rounded rect, drop shadow implied by the grabber-less floating look.

### 2.6 Chart type sheet (IMG_2286/2287)

```
Title "Chart type" — identical geometry/typography to Analysis-hub title.
Hint banner: rounded rect, fill ≈ #2C2C2E, full-bleed-minus-margin, star
  emoji + pointing-hand icon + 2-line gray hint text + dismiss "×" top-right.
Grid: 3 columns.
  Cell: x 52–390 / 434–772 / 816–1154 → 338px/112.7pt wide, 44px/14.7pt
    column gap, margins 51–52px/17pt both sides.
  Cell height: 215px/71.7pt (top border y=1506, bottom y≈1721 for row 1);
    row gap 37px/12.3pt.
  Corner radius: 32px/10.7pt (measured via corner-curve inflection).
  Unselected fill: #2C2C2E, icon+label white/light-gray, label ~15pt Medium
    centered below a ~40pt icon glyph.
  SELECTED state ("Candles" in these captures): fill flips to pure
    WHITE (#FFFFFF), icon+label render BLACK — a full color-inversion,
    not just a border/checkmark. Important for the rebuild: TV's
    "selected" state in these grids is inverted-fill, not accent-tinted.
21 total chart types across the full scroll (Bars, Candles, Hollow candles,
  Volume candles, Line, Line with markers, Step line, Area, HLC area,
  Baseline, Columns, High-low, Volume footprint, Time Price Opportunity,
  Session volume profile, Heikin Ashi, Renko, Line break, Kagi,
  Point & figure, Range).
```

### 2.7 Object tree sheet (IMG_2288, t-025)

```
Presented as a near-FULL-SCREEN sheet — background is PURE BLACK (#000000,
not the #1C1C1E sheet gray used elsewhere) — this is a distinguishing
surface: Object tree and Layouts-manager both use pure-black full-height
list screens, while Analysis hub/Chart type/Drawings use the gray #1C1C1E
half/full sheet material. Bottom tab bar remains visible underneath.

Nav row: "Object tree" title (same ~28pt Bold style) + trailing icon
  cluster: "new folder" (⌀ tap target ~50pt, dimmed/disabled), "cut/move to
  folder" (scissors+folder glyph), "×" close — all right-aligned, evenly
  spaced ~50pt apart, y-centered on the title.
Divider: 1px full-bleed hairline, gray, under the nav row.

List rows, ~115px/38.3pt tall, no per-row divider (seamless), full-bleed:
  • Leading icon (small "study" wave glyph "∿" or an "instrument" ⌶ icon for
    the main symbol row) — x ~113–160, ⌀ ~28px/9.3pt
  • Name label — x ~215+, ~19pt Semibold
      - Visible/active studies: bright white
      - Hidden studies: dimmed mid-gray, PAIRED with an eye-slash icon in
        the trailing position (x ~1063–1113)
  • Trailing trash icon — x ~1163–1213, all rows (delete)
  • The chart's OWN row (e.g. "REGN · NASDAQ, 1h") uses a distinct
    candle-shaped leading icon and bold white text, and has NO trash/hide
    (it's the base symbol, not a removable study) — visually anchors the
    list.
  • A thin divider separates "main-pane overlays" (VRVP, Vol, Market Oracle
    Pro, Market Dynamics Pro, SMA, TT, LBRBARS_LB, BBAWE, Auto AVWAP) from
    "sub-pane studies" (TH_RSIMACD+, CM_Stoch_MTF, Stoch RSI, RM×ST) —
    i.e. the tree is grouped by pane, main pane first.
```

### 2.8 Layout (pane-split) sheet (IMG_2306/2307)

```
Title "Layout" (same 28pt Bold style).
"Sync in layout ⌄" pill/dropdown directly below title, left-aligned,
  rounded pill, x 88–530ish, ~17pt Bold white text + chevron.
Numbered sections "1"/"2"/"3"/"4" — plain gray numeral, ~24pt, left-aligned
  at the 16.7pt margin, own row above each icon-button group.
Section 1 (single pane): ONE large cell, fill WHITE, x 88–347 (259px/86.3pt
  wide) × y 270–435 (165px/55pt tall), corner radius ~generous
  (≈16–18pt, visibly rounder than the chart-type grid), black icon glyph —
  this is the CURRENTLY ACTIVE layout, hence inverted/selected (white) fill,
  confirming the same "selected = inverted fill" convention as §2.6.
Section 2 (two panes): TWO cells, dark fill (#2C2C2C-ish, unselected),
  x 88–347 / 370–628 (258px/86pt wide), gap 23px/7.7pt, y 620–772
  (152px/50.7pt tall) — variants shown: vertical-split icon, horizontal-
  split icon.
Section 3: 6 arrangement icons (3-across row 1, then... — horizontal
  thirds, vertical thirds, 1-left+2-right-stacked, 2-top+1-bottom, etc.)
Section 4: 8 arrangement icons (2×2 grid, 4 columns, 4 rows, and mixed
  1+3 combinations) — up to 4 panes max.
Divider: full-bleed hairline between each numbered section.
```

### 2.9 Create-layout name prompt (IMG_2309)

Standard iOS half-sheet + keyboard: nav row `Cancel | Create layout | Save`
(Save disabled/dimmed until text entered), single rounded text field
"Layout name" below, then the system QWERTY keyboard. Bog-standard — no
custom chrome worth deviating from native `UIAlertController`/sheet+
`TextField` behavior.

### 2.10 Layouts manager (IMG_2310)

```
Pure-black full-height sheet (same surface tier as Object tree, §2.7).
Title "Layouts" (28pt Bold) + trailing "×".
Search field: rounded-rect outline (border only, no fill) below title,
  magnifier icon + "Search" placeholder, gray.
Column header row: "LAYOUT NAME" (small gray caps, left) + sort icon
  (down-arrow/lines glyph, right) — a real sortable-list header.
Rows: ~140px/46.7pt tall (taller than Object-tree rows — 2 lines of text).
  • Leading star (☆ outline / ★ filled-black for favorited) — tap target
  • Title line: name, White, Bold, ~19pt (e.g. "CHRIS", "BTC AO")
  • Subtitle line: "<SYMBOL>, <interval> (<full date+time>)", gray, ~15pt
  • Trailing trash icon
  • ACTIVE/current layout row ("CHRIS") is highlighted with a light-gray
    ROW BACKGROUND (near-white, ~#F0F0F0) and BLACK text — full row
    inversion, not just a checkmark — echoing the same selected-state
    inversion pattern used throughout the app (§2.6, §2.8).
```

### 2.11 "Chart saved" toast (IMG_2311)

Centered floating card over the dimmed chart: rounded rect, dark
translucent fill, large white checkmark icon (~role: success), "Chart
saved" label ~20pt Semibold below it. No buttons — auto-dismisses.
Card ≈ 340×260px / 113×87pt, corner radius ≈ 24pt.

### 2.12 Drawings picker sheet (IMG_2312-2319)

```
Title "Drawings" (28pt Bold) + close "×" — identical chrome to Chart type.
Search field below title: rounded-rect OUTLINE (border only, transparent
  fill), magnifier + "Search" placeholder — same style as Layouts-manager
  search but border-only here vs Layouts' also border-only (consistent).
Tab row (segmented, horizontally SCROLLABLE — more tabs than fit on
  screen, confirmed by mid-scroll crops showing partial labels at both
  edges, e.g. "…ci" and "…ment" clipped):
  Trend lines | Gann and fibonacci | Patterns |
  Forecasting and measurement | Geometric shapes | Annotation | Visuals
  Selected tab: filled pill, dark-gray bg, white bold text.
  Unselected: plain gray text, no pill.
Grid: identical metrics to the Chart-type grid (§2.6) — 3 columns, 338px/
  112.7pt cells, ~14.7pt gaps, ~71.7pt tall, ~10.7pt corner radius, fill
  #2C2C2E, icon (line-art glyph depicting the tool) + label ~15pt.
  No "selected" state in this sheet (these are one-shot tool launchers,
  not persistent choices) — tapping a tool dismisses the sheet and arms
  the drawing tool on the chart.

Per-tab tool inventory (for feature completeness):
  Trend lines (15): Trend Line, Ray, Info Line, Extended Line, Trend Angle,
    Horizontal Line, Horizontal Ray, Vertical Line, Cross Line, Parallel
    Channel, Regression Trend, Flat Top/Bottom, Disjoint Channel, Pitchfork,
    Schiff Pitchfork, Modified Schiff Pitchfork, Inside Pitchfork (17 shown)
  Gann and fibonacci (13): Fib Retracement, Trend-Based Fib Extension, Fib
    Channel, Fib Time Zone, Fib Speed Resistance Fan, Trend-Based Fib Time,
    Fib Circles, Fib Spiral, Fib Speed Resistance Arcs, Fib Wedge, Pitchfan,
    Gann Box, Gann Square Fixed, Gann Square, Gann Fan
  Patterns (13): XABCD, Cypher, Head & Shoulders, ABCD, Triangle, Three
    Drives, Elliott Impulse Wave (12345), Elliott Correction Wave (ABC),
    Elliott Triangle Wave (ABCDE), Elliott Double Combo Wave (WXY), Elliott
    Triple Combo Wave (WXYZ), Cyclic Lines, Time Cycles, Sine Line
  Forecasting & measurement (12): Long Position, Short Position, Forecast,
    Bars Pattern, Ghost Feed, Projection, Anchored VWAP, Fixed Range Volume
    Profile, Anchored Volume Profile, Price Range, Date Range, Date and
    Price Range
  Geometric shapes (13): Brush, Highlighter, Arrow Marker, Arrow, Arrow
    Mark Up, Arrow Mark Down, Rectangle, Rotated Rectangle, Path, Circle,
    Ellipse, Polyline, Triangle, Arc, Curve, Double Curve
  Annotation (13): Text, Note, Price Note, Pin, Table, Callout, Comment,
    Price Label, Signpost, Flag Mark, Image, Tweet, Idea
  Visuals (3): Emojis, Stickers, Icons
```

### 2.13 On-chart indicator legend + selected-indicator pill

```
Legend (always-on, top-left corner of EACH pane): stacked list of overlay/
  study names, one per line, ~19pt Semibold:
    - Visible study: bright white name
    - Hidden study: dimmed gray name + small eye-slash glyph to its right
  Collapsed state shows just the symbol row ("REGN · NASDAQ, 1h" etc,
  §2.7); expanded (tap the "⌄ 9" badge, §2.1 Row C) reveals the FULL list
  stacked vertically, overlapping the top of the price pane, ending in a
  small "⌃" collapse chevron.

Selected-indicator pill (tap a name in the legend): the row transforms
  in-place into a pill: rounded-rect, 1–1.5px BLUE border (selection
  accent, ~#3D7BFF), BLACK fill, x ~42–890 (848px/282.7pt, i.e. nearly
  full pane width), y 1252–1330 (78px/26pt tall). Content, left→right:
    name label → eye (visibility) → hexagon/gear (settings) → trash
    (delete) → "•••" (more) — evenly spaced, ~28pt icons, white stroke.
```

---

## 3. Component anatomy — reusable primitives

| Component | Metrics | Notes |
|---|---|---|
| **Sheet grabber** | 110×16px / 36.7×5.3pt, mid-gray, ~8pt below top edge | standard on every bottom sheet |
| **Sheet title** | ~28pt Bold, color `#DBDBDB` | "Analysis hub", "Chart type", "Drawings", "Object tree", "Layout", "Layouts" all identical |
| **Sheet close "×"** | ⌀ 32pt circle, fill `#313136`, icon light-gray | top-right, vertically centered on title |
| **Ghost button** (2-col, Analysis-hub row 1 only) | fill = sheet bg (transparent look), 1px border `#4A4A4A`, ~10pt radius, 55.7pt tall | rare — used only where the action is "secondary/contextual" (Layout setup, Manage-layout) |
| **Filled tile/button** (everywhere else: New/Save/Open, all TOOLS/INFO/MORE grid cells, Chart-type/Drawings grid cells) | fill `#2C2C2E`, no border, ~10–11pt corner radius | dominant button style app-wide |
| **Selected-state inversion** | fill → `#FFFFFF`, all glyph/text → black | used for: active chart type, active layout-pane arrangement, active row in Layouts manager (row-level, not cell) — a consistent, deliberate design language: "selected = photographic negative," not accent-color tinting |
| **Section header caption** | ALL CAPS, ~13pt Semibold, gray `≈#8E8E93`, tracked out | "TOOLS" / "INFO" / "MORE" |
| **Hairline divider** | 1px, `#4A4A4A` (`#414141` variant on pure-black surfaces) | full-bleed only when separating major sheet regions; margin-inset when separating a title from content |
| **Red notification dot** | small filled circle, ⌀ ~14px/4.7pt, offset to the top-right corner of its host icon | Alerts tile, Save tile, "•••" toolbar icon, Chart tab icon — universal "unseen/active" signal |
| **Price/value badge (pill)** | rounded-rect, colored fill (bull `#0B8E75` / bear `#EE2F3B` / reference `#2557FF`), white bold text, ~2px corner radius per line-height | on-chart, right price scale |
| **Bottom toolbar row** | 51.3pt tall, pure `#000000`, white 28pt icons, symbol/interval as ~26pt Bold white text with dimmed neighbor-values ghosted above/below | persistent above tab bar whenever the Chart tab is active |
| **Tab bar** | 82.7pt tall (49pt content + 34pt home-indicator inset), `≈#090909`, 5 equal 80.4pt columns, icon ⌀≈28pt + 15pt Bold label, 6pt gap | oversized label vs stock iOS HIG |

---

## 4. Color system (hex, as measured)

| Role | Hex | Where |
|---|---|---|
| Pure black chrome | `#000000` | status bar, bottom toolbar row, chart-tab underlying black |
| Near-black tab bar | `#090909` | tab bar (likely a blurred/vibrancy black material, not flat #000) |
| Chart canvas / quote header bg | `#171A21` | main chart screen background (a near-black, blue-tinted navy — NOT the same token as the pure-black chrome above it/below it) |
| Sheet elevated surface | `#1C1C1E` | Analysis hub, Chart type, Drawings, Layout — iOS "systemGray6 dark" equivalent |
| Full-height list-sheet bg | `#000000` | Object tree, Layouts manager (distinct from the gray sheets above) |
| Filled tile/button | `#2C2C2E` | dominant button fill everywhere |
| Ghost-button/divider stroke | `#4A4A4A` | 1px borders + hairlines inside gray sheets |
| Title text | `#DBDBDB` | all sheet titles |
| Symbol-name text (quote header) | `#A9ABB7` | secondary gray, medium weight |
| Price-scale label | `#A9ABB7` regular / `≈#FAFAFA` bold | gray for minor gridlines, near-white bold for emphasized round numbers |
| Bull / up | `#0B8E75` (candle median `#0A8D74`) | candles, change-% text, reference dotted line, price badge |
| Bear / down | `#EE2F3B` (badge `#EF2F39`) | candles, change-% text, reference dotted line, price badge |
| Reference/compare badge | `#2557FF` | secondary blue price pill (not up/down) |
| Purple accent | `≈#9B7FE0` on `≈#3C2E4C` disc | auto-refresh/live-sync icon, on-chart quick-alert lightning icon |
| Selection accent (indicator pill border) | `≈#3D7BFF` | selected-indicator floating toolbar |
| CTA gradient | pink `≈#FE46A5` → blue `≈#4A5AFF` | "Trade with your broker" border only |

**Surface-hierarchy takeaway for the SwiftUI rebuild:** there are THREE
distinct dark tiers in play, not one flat black — (1) pure `#000000` for
persistent app chrome (status bar, toolbar, tab bar), (2) a navy-black
`#171A21` for the chart canvas itself, and (3) iOS-standard `#1C1C1E` for
modal sheets, with `#2C2C2E` as the one-step-lighter fill for interactive
tiles inside those sheets. Preserve all three as distinct tokens — do not
collapse them into a single "black" or a single "dark gray."

---

## 5. Interactions inferred from consecutive frames

- **t-008 → t-009**: opening a symbol from the watchlist first shows a
  header-only "loading" state (price + timeframe pills, blank plot area)
  before the candle chart paints in — an explicit empty/loading state to
  replicate, not just a spinner.
- **t-009 → t-010**: default indicator stack loads automatically under the
  main pane (volume + up to 3 studies) — i.e. the chart is NOT a blank
  canvas by default; TV ships a standing default study stack per symbol
  (matches the project's own MACD/RSI/Stoch default-on convention).
- **t-010 → t-011**: tapping the interval label ("1m") over the toolbar
  triggers the full-screen scrim + big vertical wheel picker (§2.3); the
  currently-active interval is centered/bold.
- **t-011 → t-012**: selecting "15 minutes" (visible in t-011) commits and
  the chart redraws at that interval; by t-012 the toolbar shows "1H"
  already selected next (continuing the same drag gesture across
  intervals confirms the wheel commits live per drag-frame, not only on
  release).
- **t-013 → t-014 → t-015 → t-016**: dragging on the bottom-left SYMBOL
  label (not the interval one) instead opens the symbol-switch wheel
  (§2.2) — same gesture vocabulary, different axis of data, confirming
  both labels are independently "spinnable." The symbol list order shown
  (XOM, JNJ, MNQ2!, WMT, MCD, CBOE, REGN, VEEV, COST, IHE…) matches a
  recently-viewed/watchlist queue, not alphabetical.
- **t-016 → t-017 → t-018 → t-021**: once settled on REGN, a manual
  vertical drag on the PRICE SCALE (right edge) engages manual y-axis
  scaling — this is when the header gains the "↓ lock" + white "auto-fit"
  icon pair (absent in t-010/t-013 where no manual scale edit has
  occurred yet). Panning horizontally (t-018→t-021) shows the "at-close"
  dotted reference line and price badge staying pinned to the true price
  level regardless of scroll position (badge de-couples from candle
  position, stays screen-pinned to its Y value).
- **t-019 → t-022 → t-027 → t-030 → t-034**: the Analysis-hub sheet is
  reached from multiple starting scroll positions but is always the SAME
  sheet — i.e. it remembers/])resets scroll position depending on entry
  point (sometimes opens scrolled to TOOLS, sometimes to the very top) —
  worth deciding deliberately in the rebuild (recommend: always open at
  top).
- **t-022 → t-023 → t-028 → t-029**: tapping "Manage CHRIS" opens the "⋯"
  context menu in place (popover, not a new sheet); selecting "Sharing"
  drills the SAME popover into an Off/On radio sub-list (in-place content
  swap, not a push) — then presumably a back-chevron (not directly
  captured) returns to the parent menu.
- **t-025**: Object tree is reached as a full sheet from Analysis hub's
  "Object Tree" tile; note the tab bar remains visible/active underneath
  (Chart tab still highlighted), confirming it's presented as a sheet over
  the tab, not a full navigation push.
- **t-033 → t-034**: scrolling the Analysis-hub sheet while it's still
  mid-presentation-animation (sheet only ~40% up) is possible — the sheet
  content scrolls independently of the presentation drag, i.e. it's a
  fully-interactive `UISheetPresentationController` detent, not a static
  animation.
- **IMG_2308 → 2309 → 2310 → 2311**: New → names the layout via a
  half-sheet+keyboard prompt → the new layout appears at the top of the
  Layouts manager list → returning to the chart and hitting Save (or
  autosave) produces the centered "Chart saved" toast on the live chart
  (BABA example), auto-dismissing after ~1–2s (single frame captured).
- **IMG_2286 → 2287**: the Chart-type sheet scrolls to reveal 21 total
  options; scrolling does NOT change the sheet header/hint banner
  (they stay pinned) — only the grid scrolls, confirming the hint banner
  is a sticky header, not the first grid row.
- **IMG_2312 → 2319**: Drawings sheet tabs are swiped through
  left-to-right in tool-category order; each tab swap replaces the ENTIRE
  grid below (not an accordion/expand) and resets scroll to top.

---

## 6. Features list (every distinct product capability observed)

1. Multi-pane technical chart: candles + N stacked studies, each pane with
   its own right-axis scale and live value badges.
2. Full custom chart-type library (21 types incl. Renko, Kagi, Point &
   Figure, Range, Volume Footprint, Session Volume Profile, Heikin Ashi).
3. Object tree — a flat, groupable inspector for every overlay/study
   attached to the chart, with per-item show/hide + delete.
4. On-chart indicator legend with inline visibility toggle and a
   floating per-indicator quick-action pill (visibility / settings /
   delete / more).
5. Multi-pane workspace layouts (1–4 panes, 13 arrangement presets) with a
   "Sync in layout" cross-pane linking control.
6. Full chart-layout persistence: New / Save (cloud, dirty-state red dot) /
   Open / rename / duplicate ("Make a copy") / autosave toggle / sharing
   toggle with shareable link (share-out + "open link" import) — i.e. a
   whole saved-workspaces system, browsable via a searchable, sortable,
   star-favoritable Layouts manager.
7. "Trade with your broker" — broker connectivity entry point surfaced
   directly in the chart's primary action hub.
8. Full drawing-tool suite across 7 categories incl. Elliott Wave,
   Gann tools, harmonic patterns (XABCD/Cypher/Head&Shoulders), volume
   profile drawings, long/short position P&L tools, annotations (Note,
   Callout, Signpost, Tweet, Idea), and Visuals (Emojis/Stickers/Icons).
9. Price alerts (bell icon w/ red dot = active/triggered), reachable both
   from the Analysis hub and (implied) from the on-chart lightning quick-
   action.
10. Bar Replay (historical playback scrubbing).
11. Compare / overlay-symbol picker ("+" Compare tile).
12. Symbol details / Financials / Forecast / Technicals panels — deep
    fundamental & analyst-consensus data surfaced from the chart itself.
13. Pine Editor (custom script authoring) accessible in-app.
14. Siri Shortcut integration for the current chart/symbol.
15. Publish Idea — social/community idea authoring from the live chart.
16. Symbol/interval "scroll wheel" quick switcher directly from the bottom
    toolbar labels (drag-to-spin, no sheet needed) for both symbol and
    timeframe, distinct from the full modal interval-wheel sheet.
17. Manual y-axis (price-scale) override with an explicit "reset to
    auto-fit" affordance once engaged.
18. Per-chart dark/light theme override (moon/sun toggle) independent of
    the OS/app-wide theme.
19. Live/auto-refresh toggle exposed directly in the quote header.
20. Asset-class–aware quote header copy (equities show "At close:"
    labeling; futures/FX show bare price + contract-code price badge).
21. 5-tab primary navigation (Watchlist / Chart / Explore / Community /
    Menu) with a persistent secondary analysis toolbar layered above it
    whenever on the Chart tab.

---

## 7. Open questions (answerable only via live interaction)

1. Exact drag physics of the symbol/interval scroll-wheel (§2.2/2.3) —
   inertia, snap points, haptic feedback on cross a value — could not be
   derived from 2-second-interval frames.
2. Whether indicator sub-panes are user-resizable via a drag handle
   (strongly implied by variable pane-height ratios across screenshots,
   but no frame captures the drag itself).
3. The full content of the horizontally-scrolling Drawings tab bar beyond
   the 7 labels captured — whether more categories exist off-screen to
   either side.
4. What the "Sync in layout" dropdown (Layout sheet, §2.8) actually
   controls when expanded (crosshair sync? symbol sync? interval sync
   across panes?) — never opened in the captured frames.
5. Whether the Autosave/Sharing toggles in the "⋯" context menu (§2.5)
   have any visible confirmation/toast when flipped, or apply silently.
6. Exact behavior of "Compare" (Analysis hub) — whether it reuses the same
   symbol scroll-wheel (§2.2) or opens a distinct search/list UI.
7. Content and layout of Alerts, Bar Replay, Symbol details, Financials,
   Forecast, Technicals, Pine Editor, and Publish Idea screens — tiles are
   visible in the hub but none of their destination screens were captured
   in this frame set.
8. Precise corner radius and elevation/shadow treatment of the floating
   symbol/interval wheel (§2.2) and the "Chart saved" toast (§2.11) —
   estimated from a single static frame each, not edge-verified.
9. Whether the pure-black Object-tree/Layouts-manager sheets ever appear
   in the same "gray #1C1C1E" tier under different entry conditions (i.e.
   confirm the black-vs-gray split is a deliberate, permanent rule and
   not an artifact of these particular captures).
