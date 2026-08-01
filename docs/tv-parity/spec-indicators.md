# TradingView iOS — "Indicators" Surface: Pixel Spec

Source frames measured (all 1206×2622 px @3x = 402×874 pt, iPhone with Dynamic Island safe area):

| File | Content |
|---|---|
| `IMG_2284.PNG` | **Indicators, metrics, and strategies** picker — full-screen page (Personal/Built-in/Community) |
| `IMG_2320.PNG` | **Indicator templates** modal — bottom sheet, **"Technicals" tab selected** (not "Favorites" — see §6 correction) |
| `tvframes/t-020.png` | Same screen as IMG_2284, confirms layout is stable across captures |
| `tvframes/t-024.png` | Actually shows **Analysis hub → Chart type** sheet, not "Indicator templates" — see §6 correction |
| `tvframes/t-023.png` | Transition frame: Indicator Templates sheet rising over Analysis Hub (tab bar visible, rows not yet loaded) |
| `IMG_2281–2283, 2286–2298, 2306–2308, 2319, 2321–2327` | Supporting context: Analysis Hub (entry point), Chart Type, Object Tree, Symbol Details/Financials/Forecast/Technicals, Compare Symbols, Drawings, applied-indicator context menu, JNJ overview/news — reviewed to confirm surface hierarchy and to source the indicator-context-menu and Object Tree specs below. Not fully re-specified here as they are adjacent surfaces, not the Indicators surface itself. |

All measurements below were extracted with PIL pixel scans (band detection on luminance vs. local background, per-column glyph-extent scans, and histogram sampling for color), not eyeballed. Every pt value = px/3.

---

## 1. Surface inventory

| # | Surface | Presentation | Background |
|---|---|---|---|
| A | **Analysis hub** | Bottom sheet (grabber handle, rounded top corners), scrollable | Elevated `#1C1C1E` |
| B | **Indicators, metrics, and strategies picker** (main "Indicators" screen) | Full-screen page (push/cover), own nav bar + bottom tab bar stays visible | Pure black `#000000` |
| C | **Indicator templates modal** | Bottom sheet stacked over Analysis Hub, grabber handle | Elevated `#1C1C1E` |
| D | **Object tree** | Full-screen page, lists every drawing/indicator on the chart with visibility + delete controls | Pure black `#000000` |
| E | **Applied-indicator context menu** (long-press an indicator's legend) | Bottom sheet, plain list of actions | Elevated `#1C1C1E` |
| F | *(adjacent, not respec'd)* Chart type sheet, Compare symbols, Symbol details/Financials/Forecast/Technicals, Drawings picker | Sheet or full-screen page | `#1C1C1E` (sheets) / `#000000` (full-screen pages) |

**Surface-hierarchy rule observed:** any screen presented as a **full-screen page that replaces the chart context** (has its own top title bar AND the bottom Watchlist/Chart/Explore/Community/Menu tab bar) is **pure black `#000000`**. Any screen presented as a **bottom sheet stacked on top of the chart** (grabber handle, rounded top corners, chart dimly visible peeking above it) is **elevated dark gray `#1C1C1E`**. Nested sheets (sheet-over-sheet, e.g. Indicator Templates over Analysis Hub) are the *same* `#1C1C1E` — TradingView does not lighten with each stacking level. Interior fills one step lighter than the sheet (search fields, tool tiles' hover state) sit around `#2C2C2E`–`#313135`. The only pure-white surfaces are primary CTA buttons (`#FFFFFF` fill, near-black `#0F0F0F` text).

---

## 2. Surface B — Indicators, metrics, and strategies picker (main screen)

Reference: `IMG_2284.PNG` / `t-020.png` (identical layout, cross-validated).

### Layout tree (top → bottom, all x/y in pt from screen top-left, screen = 402×874pt)

```
[Status bar]                              y 0–~59   (OS-controlled, time/signal/battery)
[Title row]                               y ~76–118
  "Indicators, metrics, and strateg…"     x 21.3–299.7, y 87.3–106.3   truncated w/ ellipsis
  X (close)                               x 316.7–375.3, y 88.7–106.7  plain glyph, no button chrome
[Search field]                            y 134.0–174.0  (h 40.0pt)   x 20.0–381.7 (w 361.7, full-bleed 20pt margins)
  — rounded-pill outline (border only, no fill)
  magnifying-glass icon                   x ~33–52.7 (icon), left inset 13pt from field edge
  "Search" placeholder                    x 62.0–112.7
[section header] "PERSONAL"               y 209.0–217.0   caps, tracked
  › Favorites            (star outline)   row y 247.0–266.7  center 256.8
  › My scripts           (person)         row y 310.0–327.0  center 318.5
  › Invite-only          (person.2)       row y 370.0–387.0  center 378.5
[section header] "BUILT-IN"                y 427.0–435.0
  › Technicals   (line+bar chart)         row center 475.8
  › Fundamentals (ascending bars)         row center 536.2
[section header] "COMMUNITY"               y 585.0–593.0
  › Editors' picks (bookmark/ribbon)      row center 634.5
  › Top            (bars + up-arrow)      row center 694.0
  › Trending       (flame outline)        row center 753.3
[hairline]                                 y 791.0  full-width, #4A4A4A
[Bottom tab bar]                           y 791.0–874.0  (h 83.0pt total = 49pt bar + 34pt home-indicator inset)
  icons: Watchlist / Chart / Explore / Community / Menu   icon band y 798.3–819.7 (h 21.3)
  labels                                   y 827.3–838.0 (h 10.7)
  red notification dot on "Chart" icon     ~5.3×5.7pt circle, upper-right of icon
```

### Row anatomy (every "Personal/Built-in/Community" row)

- **Height:** 60.2pt average, center-to-center (measured across 7 rows: 61.3, 60.0, 60.3, 59.5, 59.85 — treat as **60pt**).
- **Left inset:** icon left edge at **19.7–20pt** from screen edge (same margin the search field and section headers use).
- **Icon:** ~20×20pt visible ink (SF-Symbol-style outline glyph at ~24pt point size), left edge 20pt, right edge ~40pt (icon column is 20pt wide, giving a fixed icon slot).
- **Gap icon→label:** 13.3pt (icon ends 40.0pt, label starts 53.3pt).
- **Label:** bold/semibold, ink height 14pt (no ascender/descender chars) → estimate **17–19pt bold**, color `#DBDBDB` (219,219,219 — not pure white; ~86% white).
- **Chevron (›):** right-aligned, x 368.3–375.7pt (7.3pt wide glyph), same color `#DBDBDB`, vertically centered with label. Right margin from screen edge: 402−375.7 = **26.3pt**.
- **No visible divider between rows** — sections are separated purely by vertical whitespace, not hairlines (confirmed: no full-width `#4A4A4A` line inside a section).
- Full row (icon+label+chevron) is presumably the whole tap target, edge-to-edge (20pt–382pt), height 60pt.

### Section header anatomy

- Caps, letter-tracked, color `#8C8C8C` (140,140,140), ink cap-height **8pt** → estimated **~11–12pt** font, left inset matches row icon (~20–21pt).
- Vertical rhythm: **~40pt gap** from the previous section's last row-center to the next header's ink-top; **~30–33pt gap** from a header's ink-bottom to its first row's ink-top.

### Search field anatomy

- Pill, **border-only** (no fill — background shows through as pure black), border stroke color `#4A4A4A` (74,74,74), ~1pt hairline.
- Bounds: x 20.0–381.7pt, y 134.0–174.0pt → **40pt tall**, fully rounded (radius = height/2 = 20pt).
- Magnifying-glass icon + "Search" placeholder both `#8C8C8C` (140,140,140), placeholder ink height 12pt.

### Title bar

- Title: bold, truncates with `…` mid-sentence ("strateg…"), color `#DBDBDB`, ink height 19pt (includes descender of "g") → **~22–24pt bold**.
- Close (X): plain glyph directly on black background — **no circular button chrome** here (contrast with sheet-presented X buttons, see §3), color `#DBDBDB`, 18×18.7pt bounding box, positioned x 316.7–375.3 / y 88.7–106.7 (i.e., ~27pt from right edge, vertically aligned with title).

### Icon inventory (nearest SF Symbol)

| Row | Icon look | Nearest SF Symbol |
|---|---|---|
| Favorites | 5-point star, outline | `star` |
| My scripts | single person, outline | `person` |
| Invite-only | two overlapping people, outline | `person.2` |
| Technicals | zig-zag line over small bar ticks | `waveform.path.ecg` / custom (line+bars combo) |
| Fundamentals | 3 ascending solid bars | `chart.bar.fill` |
| Editors' picks | bookmark/ribbon with fold | `bookmark` (custom ribbon variant) |
| Top | ascending bars with up-arrow accent | `chart.bar.xaxis` + arrow (custom) |
| Trending | flame, outline | `flame` |

### Bottom tab bar

- Hairline separator `#4A4A4A` at y=791.0 spans full width.
- Total bar height (hairline → screen bottom) = **83pt** = ~49pt icon/label content + 34pt home-indicator safe area.
- 5 equal columns, icon centers at x ≈ 39.7 / 120.0 / 200.7 / 281.7 / 361.7pt (i.e. ~80.4pt column pitch across 402pt width).
- Icon ink band: y 798.3–819.7 (21.3pt tall). Label band: y 827.3–838.0 (10.7pt, small caption ~10pt font).
- All 5 icons render in the same `#DBDBDB` — **no distinct "selected" tint color was observed**; if an active state exists it's likely conveyed by label weight, not hue (open question, §6).
- Red badge dot on the "Chart" icon: solid **`#F23645`** (242,54,69) — this is TradingView's own brand red (their down-candle red), ~5.5pt diameter circle, positioned upper-right of the icon.

---

## 3. Surface C — Indicator templates modal

Reference: `IMG_2320.PNG` (Technicals tab active); transition frame `t-023.png` confirms the tab bar (Favorites / My templates / Technicals) and that this sheet slides up **over** the Analysis Hub sheet.

### Layout tree

```
[Status bar — background, dimmed]                y 0–~46
[previous sheet's rounded top corner, peeking]     faint, ~y 46–65 (Analysis Hub sheet behind)
[grabber handle]                                    ~y 77–83, centered, light gray pill ~36×4pt
[Title row]                                         y 95.0–124.7
  "Indicator templates"                             x 11.3–216.7ish, ink y 101.3–120.3, bold, ~22–24pt, #DBDBDB
  X close button — circular chrome                  circle Ø 29.7pt, x 356.0–385.7 / y 95.0–124.7
    circle fill  #313136 (49,49,54)
    X glyph      #A0A0A8 (160,160,168) — dimmer than body text, NOT #DBDBDB
[Search field]                                      y 139.0–175.0  (h 36.0pt)
  — FILLED pill (not outline-only, unlike Surface B): fill #313135 (49,49,53)
  x 16.0–385.7 (w 369.7, 16pt margins — tighter than Surface B's 20pt)
[Tab row]  Favorites | My templates | (Technicals ●)   y 190.0–221.7  (block h 31.0pt)
  unselected tabs: plain text, #DBDBDB, no background
  selected tab: capsule pill, fill #2E2E2E (46,46,46), fully rounded (h≈31pt → radius ≈15.5pt), text #DBDBDB bold
  approx label x: "Favorites" starts ~29pt, "My templates" ~132pt, "Technicals" pill ~253–358pt (w 104.7pt)
[List — one row per template/category, divider-separated]
  Row: Title (bold) + Subtitle (regular, gray, 1 or 2 lines)
  Row height = 61.7pt  (1-line subtitle)  or  77.3pt (2-line subtitle)
  Divider: full-bleed hairline #4A4A4A (74,74,74), x edge-to-edge 16.0–401.7pt (no inset)
[…rows continue, list ends, whitespace…]
[Save indicator template button]                    y 795.7–839.7  (h 44.0pt exactly)
  x 16.0–385.7 (w 369.7, same margins as search field)
  fill #FFFFFF, fully-rounded pill (radius 22pt), text near-black #0F0F0F bold, centered
```

### Rows actually visible (Technicals category — built-in preset bundles, NOT user favorites)

| Title | Subtitle | Row height |
|---|---|---|
| Bill Williams' 3 Lines | Moving Average x 3, Volume | 61.7pt (1-line, but title ink itself ran tall due to apostrophe) |
| Displaced EMA | Moving Average Exponentional, Volume | 61.7pt |
| MA Exp Ribbon | Moving Average Exponentional x 8, Volume | 61.7pt |
| Oscillators | Commodity Channel Index, Relative Strength Index, Stochastic RSI, Volume | 77.3pt (2-line subtitle) |
| Swing Trading | Pivots, Pivots HL, Vol, Zig Zag | 61.7pt |
| Volume Based | Chaikin Money Flow, Commodity Channel Index, On Balance Volume, Rate Of Change, Volume | 77.3pt (2-line subtitle) |

### Row typography/color

- **Title:** bold, `#DBDBDB`, ink height ~14.7pt (no descenders) → estimated **~18–19pt bold**.
- **Subtitle:** regular weight, `#8C8C8C`-adjacent gray — measured dominant value **#8C8C8C (140,140,140)**, ink height ~12.3pt per line → estimated **~15pt regular**.
- **Left inset for row text:** 16–17pt (tighter than Surface B's 20pt icon-row inset — these rows have no leading icon).
- **Divider:** edge-to-edge (no inset), `#4A4A4A`, 1pt hairline.

### Search field (this sheet)

- **Filled** pill (unlike Surface B's outline-only field): fill `#313135` (49,49,53), no visible border stroke.
- Bounds x 16.0–385.7pt, y 139.0–175.0pt → **36pt tall**, fully rounded.

### Close (X) button — sheet-chrome style

- Circular button, Ø **29.7pt** (~30pt).
- Circle fill `#313136` (49,49,54) — same family as the filled search box.
- X glyph color `#A0A0A8` (160,160,168) — a **muted** gray/lavender, distinctly dimmer than the `#DBDBDB` used for all primary text/icons elsewhere. This is the dedicated "sheet dismiss" token — different from Surface B's plain borderless X (because Surface B's background is already pure black, no chrome needed for contrast).

### Save button

- Full-width pill, x 16.0–385.7pt (369.7pt wide), y 795.7–839.7pt, **h = 44.0pt exactly**.
- Fill **`#FFFFFF`** pure white, fully rounded (radius = 22pt), text **`#0F0F0F`** near-black, bold, centered. This is the app's primary-CTA token (matches the "Trade" button seen on JNJ overview and "Trade with your broker" banner treatment).

---

## 4. Component anatomy (shared across surfaces)

### 4.1 Analysis Hub tool-tile (entry point to Indicators + Indicator templates)

Reference: `IMG_2281.PNG`. The Analysis Hub sheet is the only path to both Surface B and Surface C.

- Sheet background `#1C1C1E`, grabber handle + rounded top corners, title "Analysis hub" (same title-bar style as §3).
- Tiles are arranged in rows of 2 (e.g. "Indicators" / "Compare", "Alerts" / "Bar Replay") or 3 (e.g. "Indicator templates" / "Chart type" / "Object Tree"), icon-on-top + label-below, centered.
- 2-column row: tile width **156pt** each, x 28.3–184.3 and 217.3–373.3 (33pt gutter between, ~28pt outer margins each side).
- Row height (icon+label content, 2-col style): **71.7pt**; inter-row gap ≈ 8.3pt.
- A shorter tile style exists too (top row "Layout setup" / "Manage [layout name]", and "New"/"Save"/"Open" 3-up row): row height **55.7pt**.
- Tile fill = **transparent** (same `#1C1C1E` as sheet bg) — tiles are **outline-only cards** using the standard `#4A4A4A` hairline stroke, not a distinct fill color. Corner radius visually ~12pt.
- One outlier: **"Trade with your broker"** banner uses a pink→blue gradient border (accent treatment, not a plain hairline) and is full-width, taller (~72pt), sitting below the New/Save/Open row and above the "TOOLS" section.
- A red notification dot (same `#F23645`) appears on the "Alerts" tile's icon, top-right — same badge token as the tab-bar dot.
- Section headers ("TOOLS", "INFO", "MORE") use the same caps/tracked/`#8C8C8C` style as Surface B's section headers.

### 4.2 Object tree row (Surface D)

Reference: `IMG_2288.PNG` / `IMG_2298.PNG`.

- Full-screen page, pure black `#000000`, title "Object tree" + a folder-add icon, a "clear all" (folder-scissors) icon, and X — all top-right, same borderless-X-on-black convention as Surface B.
- Rows are **much more compact** than Surface B: row height ≈ **38pt** (vs 60pt), single line of text, right-aligned eye-slash (visibility toggle) + trash-can icon per row.
- The chart's own candle/symbol series row is **bold, full-brightness** (`#DBDBDB`) and has no eye/trash controls (it can't be hidden/deleted this way).
- Hidden objects render at reduced opacity (dim gray, roughly 30–40% of `#DBDBDB`) with an eye-slash icon in its "active/crossed-out" state; visible objects show a plain trash icon only.
- Thin `#4A4A4A` divider separates the "drawings + built-ins" block from the "applied indicators" block at the bottom of the list.

### 4.3 Applied-indicator context menu (long-press an indicator's legend on the chart)

Reference: `IMG_2324.PNG`. Sheet, `#1C1C1E`, grabber handle, no title bar close button (dismiss by tapping outside or selecting an item) — a plain list of rows, each with a leading icon + label, some with a trailing chevron (indicating a submenu):

1. Add alert on `<indicator name>…` (alarm-clock+plus icon)
2. Add indicator/strategy on `<indicator name>…` (chart+plus icon) — **two-line label**, taller row
3. Add this indicator to favorites (star outline)
4. — thin divider —
5. Visual order › (chevron)
6. Visibility on intervals › (chevron)
7. Move to › (chevron)
8. Pin to scale (now right) › (chevron)
9. — divider —
10. Copy (two-squares icon)
11. Hide (eye-slash icon)
12. Remove (trash icon)
13. — divider —
14. Object tree… (stacked-layers icon)
15. Settings… (hexagon/gear icon)

This is the single most information-dense "indicator" component in the captured set and should be treated as the canonical action list for any applied indicator's overflow menu in the rebuild.

---

## 5. Interactions inferred from consecutive frames

- **Entry path:** Chart → tap the Analysis-Hub-launcher icon (bottom toolbar "···" near the chart) → **Analysis hub** sheet rises from bottom (grabber handle, `#1C1C1E`) → tap **"Indicators"** tile → Analysis Hub sheet is replaced by the **Indicators, metrics, and strategies** full-screen page (Surface B) — this is a *push*, not another sheet: background goes from `#1C1C1E` to pure `#000000`, and the OS bottom tab bar reappears (it's hidden while a sheet is up).
- **Templates path:** Analysis hub → tap **"Indicator templates"** tile → a *new* sheet (Surface C) slides up **on top of** the Analysis Hub sheet (confirmed by `t-023.png`: both sheets visible mid-transition, Analysis Hub's rounded top corner peeking above the rising Indicator Templates sheet). The tab bar (Favorites/My templates/Technicals) fades/slides in before the row content populates.
- **Category tabs behave like segmented control, not a picker sheet:** tapping "Technicals" highlights it with a capsule fill and swaps the row list in place (no navigation push) — same pattern likely applies to "Favorites" and "My templates".
- **Selecting a template row** (not captured in the provided frames, inferred): would apply that bundle of indicators to the chart and dismiss the sheet, based on TradingView's known behavior and the presence of a distinct "Save indicator template" primary CTA at the bottom (save the *current* chart's indicator set as a new named template — a separate action from selecting an existing one).
- **Long-press an indicator's legend row on the chart** → opens the applied-indicator context menu (§4.3) directly as a sheet, bypassing Analysis Hub entirely.
- **"Object tree"** is reachable both from Analysis Hub directly and from the applied-indicator context menu's "Object tree…" row — same destination, confirms Object Tree is a per-indicator management surface, not specific to one indicator.
- **X close buttons dismiss one level only** — closing Indicator Templates (Surface C) returns to Analysis Hub (Surface A), not directly to the chart.
- Across the whole 47-screenshot burst (IMG_2281–2327), the user toured Analysis Hub → Layout → Indicators → Compare → Alerts(implied)→ Indicator templates → Chart type → Object tree → Symbol details → Financials → Forecast → Technicals → Drawings → back to chart with an indicator's context menu → then switched symbol/context entirely (JNJ overview/news), suggesting this was a single continuous "tour every entry point" recording rather than a task-directed flow.

---

## 6. Corrections to the task's frame descriptions (verified by pixel inspection)

- **`IMG_2320.PNG`** was described as showing the **Favorites** tab; it actually shows the **Technicals** tab selected (filled capsule), listing built-in preset *bundles* (Bill Williams' 3 Lines, Displaced EMA, MA Exp Ribbon, Oscillators, Swing Trading, Volume Based) — not user-saved favorites. No frame in the provided set shows populated or empty "Favorites"/"My templates" content for this modal.
- **`t-024.png`** was described as "Indicator templates sheet with tabs: Favorites, My templates, Technicals sections"; it actually shows **Analysis hub → Chart type** (the chart-type grid, Candles selected). The genuine Indicator-Templates-tab-bar transition frame is `t-023.png`, one capture earlier in that burst.

These corrections don't block the rebuild (the real Indicator Templates content is fully captured in `IMG_2320.PNG`), but the rebuild team should not search for "Favorites" content in `IMG_2320` — it isn't there.

---

## 7. FEATURES — distinct product capabilities observed

1. **Three-source indicator picker**: Personal (Favorites, My scripts, Invite-only), Built-in (Technicals, Fundamentals), Community (Editors' picks, Top, Trending) — a taxonomy, not a flat list.
2. **Global search** inside the indicator picker (search field present, not yet exercised in captured frames).
3. **Indicator templates** — named, curated *bundles* of multiple indicators applied together in one tap (e.g. "Oscillators" = CCI+RSI+StochRSI+Volume in one shot).
4. **Save current chart's indicators as a new template** ("Save indicator template" CTA).
5. **User-saved template favorites and personal templates** (Favorites / My templates tabs exist as first-class categories alongside built-ins — content itself not captured).
6. **Per-indicator context menu** with: alerts-on-indicator-value, chaining another indicator/strategy onto an indicator's output, favoriting, z-order ("Visual order"), timeframe-scoped visibility ("Visibility on intervals"), moving between panes ("Move to"), scale pinning (left/right axis), duplicate ("Copy"), hide, remove, and a settings/format sheet.
7. **Object tree**: a flat, per-chart manifest of every drawing + indicator + the symbol series itself, each independently hideable/deletable, grouped by section (drawings/tools vs. applied indicators) with a divider.
8. **Indicator badge/notification affordance** reused as a generic system pattern (same red dot appears on the Chart tab and on the Alerts tool tile — not indicator-specific, but visually consistent with how an "unread/pending" state would be shown on an Indicators entry point too).
9. **Nested nav model**: Analysis Hub (sheet) → Indicators (full-screen page) is a *push*, while Analysis Hub → Indicator Templates is a *sheet-over-sheet* — two different presentation styles for two adjacent entry points in the same hub, which the SwiftUI rebuild needs to replicate deliberately (not just "everything is a sheet").
10. **Consistent iconography language**: outline-weight SF-Symbol-style icons throughout (star, person, person.2, flame, bookmark) at a uniform ~20–24pt size, always paired left-of-label.

---

## 8. Open questions — only answerable by live interaction with the real app

1. What does the **"Favorites" tab** of Indicator Templates look like empty vs. populated (empty-state copy/illustration)? Not captured.
2. What does **"My templates"** contain/look like — user-authored templates distinct from saved favorites of built-ins?
3. Does the **bottom tab bar** actually have a visually distinct "active" tint, or is state conveyed purely by label weight? All 5 icons measured identically at `#DBDBDB` in the one frame available.
4. What happens on **tap** (not long-press) of a template row in Surface C — does it apply-and-dismiss immediately, or open a preview/detail step first?
5. Does the **Indicators picker's search field** filter live across all three sections simultaneously, or does it require first entering a section?
6. What is the **empty-state** for "My scripts" / "Invite-only" for a user with none?
7. Exact **corner radius** value for Analysis Hub tool-tiles (visually ~12pt, not independently confirmed via pixel-perfect corner detection since the border-color contrast at the tile edges was too low to isolate reliably from this JPEG-compressed screenshot set).
8. Whether the **search field style difference** between Surface B (outline-only, 40pt) and Surface C (filled, 36pt) is a deliberate per-surface design decision or simply two different eras/components in the TradingView codebase — worth deciding intentionally rather than replicating as inconsistency.
