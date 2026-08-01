# TV_PARITY_MASTER_SPEC — Mastermind Terminal iOS rebuild

**Authoritative design spec. A Swift engineer should need no other document.**
Per-screen source specs remain the reference for *content inventory and
interaction detail*; **this document overrides all of them on tokens, geometry
and typography** wherever they disagree.

- Pass 1: `spec-chart.md`, `spec-indicators.md`, `spec-search.md`,
  `spec-symbol-detail.md`, `spec-watchlist.md`
- Pass 2: `spec2-watchlist.md`, `spec2-menu-settings.md`, `spec2-explore.md`

Device basis: iPhone 16 Pro, 1206×2622 px @3x = **402×874 pt**. Every value is pt
unless suffixed `px`.

> **Pass-2 status (2026-07-31).** A second capture set (`tvzip-flat/z-001…z-043`,
> 43 lossless 1206×2622 stills) added four previously-unspecced surfaces —
> **Menu tab root, Explore tab root, watchlist popup/context-menu family, and the
> price-alert slider** — and, decisively, **frames in which four different tabs
> are the active one**. Everything marked `[P2]` below is new or corrected in this
> pass and was re-measured from the raw PNGs with PIL for this reconciliation
> rather than copied from the pass-2 specs.

---

## 0. Provenance and conflict-resolution log

### 0.1 Two capture classes — only one is colour-trustworthy

| Class | Files | Colour | Geometry |
|---|---|---|---|
| **Lossless stills** | `IMG_2281–2327.PNG` | ✅ trust | ✅ trust |
| **Video frames** | `tvframes/t-0NN.png` | ❌ **do not trust** — H.264 chroma drift shifts every hex | ✅ trust |

Proof: the *same* TradingView green measures `#089981` in `IMG_2325.PNG` and
`#0A8D72` in `t-017.png`; the *same* red measures `#F23645` in `IMG_2325` and
`#F02F3B` in `t-017`. Drift is a consistent −2/−12/+2-ish shift. Three of the
five per-screen specs sampled colour from `t-*` frames and therefore published
drifted hexes.

A 148.6-million-pixel census across all 47 lossless stills produced the canonical
palette in §1.1 (frequencies quoted there are share-of-all-pixels).

### 0.2 Resolved conflicts (measurement wins)

| # | Conflict | Claims | **Resolution** | Evidence |
|---|---|---|---|---|
| C1 | Bull green | `#0B8E75` (chart) / `#1EA089` (watchlist) / `#22AB94` (symbol-detail) | **Two real tokens:** fill/candle `#089981`, text/accent `#22AB94`. The other two are video drift. | census: `#089981` 26 847 px + `#22AB94` 4 456 px coexist in `IMG_2325` |
| C2 | Bear red | `#EE2F3B` / `#F54655` / `#F7525F` / `#F23645` | **Two real tokens:** fill/candle/badge `#F23645`, text `#F7525F`. | `IMG_2289`: `#F7525F` 3 886 px, `#F23645` 1 643 px |
| C3 | Tab-bar bg | `#090909` (watchlist) vs `#040404` (symbol-detail) | **`#040404`** | lossless `IMG_2284/2285/2288/2310/2321` all `#040404`; `#090909` only in `t-*` |
| C4 | Tab-bar label size | 10 / 11 / 13 / **15**pt | **12 pt** (measured ascender ink 9.33 pt ÷ 0.73) | `IMG_2284`, per-column band scan |
| C5 | Sheet title size | 22–24 pt vs **28 pt** | **20 pt Bold** (cap ink 14.0–14.7 pt ÷ 0.705) | `IMG_2281` "A", `IMG_2284` "I", `IMG_2285` "C", `IMG_2320` "I" — all agree |
| C6 | Analysis-hub tile fill | "filled `#2C2C2E`" (chart) vs "outline-only" (indicators) | **Both, by row class.** Compact action rows (55.7 pt) = outline `#4A4A4A` on sheet bg. Tool tiles (72 pt) = filled `#2C2C2E`. | `IMG_2281` row-dominance scan: y 450–617 & 654–821 px outline; y 1309–1525 px etc. solid `#2C2C2E` |
| C7 | Tile grid width | 156 pt (indicators) vs 180.7 pt (chart) | **2-col = 180.7 pt**, gutter 8.3, margins 16. **3-col = 117.3 pt**, gutter 9, margins 16. | `IMG_2281` y=1330/1830 run scan |
| C8 | Chart-type cell | 112.7 × 71.7 pt, gutter 14.7, margin 17, r 10.7 | **Identical to the 3-col tile: 117.3 × 72 pt, gutter 9, margin 16, r 12.** One grid token app-wide. | `IMG_2286` y=1530 run scan |
| C9 | Tool-tile height | 55.7 pt vs 71.7 pt | **72 pt** for tiles; **55.7 pt** is the compact action row (C6) | `IMG_2281` |
| C10 | Sheet background | `#1C1C1E` vs `#1A191C` vs `#000000` | **Two tiers, by sheet role** (§1.2). `#1A191C` = drift of `#1C1C1E`. | census; `IMG_2325`/`IMG_2285` are genuinely `#000000` |
| C11 | Search-field style | outline 40 pt vs filled 36 pt — "inconsistency?" | **Deliberate rule, not a bug:** outline-40 on `#000000` surfaces, filled-36 on `#1C1C1E` surfaces. Contrast-driven. Keep it. | `IMG_2284` (black→outline), `IMG_2320` (gray→`#313135` fill) |
| C12 | Chart canvas | `#171A21` | **Vertical gradient `#131722` (top) → `#181B26` (bottom).** Our existing `Theme.chartBg = 0x131722` is already exact. | census family + `IMG_2321` row profile |
| C13 | Primary text | `#DBDBDB` / `#D4D4D4` / `#BDC2C6` | **`#DBDBDB`** (1.496 % of all pixels; the other two are drift) | census |
| C14 | Secondary text | `#8C8C8C` / `#808080` / `#656565` | **`#8C8C8C`** primary-secondary; `#6F6F6F` is a real dimmer tertiary tier | census: `#8C8C8C` 0.283 %, `#6F6F6F` 0.133 % |
| C15 | Tile corner radius | "~10.7 pt" / "~12 pt, unconfirmed" | **12 pt** (corner-curve inflection solve: r ≈ 38 px) | `IMG_2281` y 1309→1322 span growth |
| C16 | Object-tree row height | 38 pt | **51 pt pitch** in the lower (applied-indicator) group; upper group is denser and dividerless | `IMG_2288` hairlines at 525/576/627/678 pt |

### 0.2b Pass-2 conflicts — re-measured for this reconciliation `[P2]`

Every row below was re-derived with PIL from the raw PNG named in the evidence
column, **not** taken on trust from the pass-2 spec that raised it.

| # | Conflict | Claims | **Resolution (measured)** | Evidence |
|---|---|---|---|---|
| C17 | **Which tab glyph is filled** | Master §1.10: "Watchlist — *filled* — the only filled tab glyph" | **Wrong.** Every one of the 25 lossless pass-1 stills that shows a tab bar has the **Chart** tab active; its diamond is the filled one and the Watchlist bookmark is an **outline**. Pass 1 read a selected state as a permanent glyph property. | Per-column ink census over `IMG_2284…2323`: all return `[1378, 2427, 1462, 1346, 713]`; `z-001` returns `[2715, …]` (Watchlist active) |
| C18 | **Tab-bar active state** (was blocking ambiguity A1) | Master §1.6/§1.10/§4-A1: "no visual state at all"; `spec2-menu` D8: "fill vs outline, Watchlist only"; `spec2-explore` §3.7: "filled disc, Explore only" | **Both pass-2 specs are partially right and each generalises from one tab.** The real law is: **selected = the glyph's solid/`.fill` variant; unselected = its outline variant. The label never changes.** Explore's fill happens to *be* a disc because the compass glyph's outer form is a circle — it is not a background pill. Menu (a hamburger, which has no fill variant) instead **doubles its stroke weight**. See §1.10. | Selected/unselected pairs measured for 4 of 5 tabs: Watchlist `z-001` vs `z-014`; Chart `IMG_2284` vs `z-001`; Explore `z-015` vs `z-014`; Menu `z-014` vs `z-001`. Menu bar stroke **1.33–1.67 pt → 3.0–3.33 pt** (`z-001`/`z-014`, x=1085) |
| C19 | Hairline weight | Master §1.1/§2.1: "1 pt (3 px — **not** 0.5 pt)" everywhere; `spec2-menu` D2 + `spec2-explore` §3.6: "0.33 pt, must be a capture artefact" | **Neither is universal — there are two real weights, keyed to host surface.** *Sheet* dividers (inside `#1C1C1E`) measure **3 px = 1 pt**; the **tab-bar top rule** and **list rows on `#000000` pages** measure **exactly 1 px = 0.33 pt**. The 1 px reading is **not** a mirroring artefact: it is identical in the lossless pass-1 stills. | `IMG_2284` (lossless) tab rule at y2373 = a single px of `(74,74,74)`, y2372 and y2374 pure bg; same file's add-symbol sheet rows = 3 px `(74,74,74)`; `z-014` Menu rows = 1 px `(74,74,74)`; `z-019` watchlist rows = 1 px `(50,50,53)` |
| C20 | Row-divider colour | Master `tvHairlineList #414141`; `spec2-watchlist` D3 `#323234` | **`#323235`** for watchlist rows on pure black — 11 consecutive dividers in `z-019` all read `(50,50,53)`. `#414141` stands for divider rows on `#1C1C1E` sheets. Two tokens, keyed to host surface, same as C19. | `z-019` x=1150, dividers at y 496/676/856/1036/1216/1396/1576/1756 px (180 px = **60 pt** pitch) |
| C21 | **`tvTile #2C2C2E` vs a proposed new `tvCard #2E2E2E`** (`spec2-menu` D1) | "2-unit delta is outside PNG noise → new token" | **No new token.** The two hexes are the *same rule applied to two host surfaces*: a raised child steps **one** notch above whatever it sits on. `#2C2C2E` over a `#1C1C1E` sheet; **`#2E2E2E` over `#000000`**. Every `#2E2E2E` instance in the corpus — watchlist chip fill, Explore category pill, Explore action button, Menu profile card, Menu promo cards, symbol-detail segmented pill — sits on pure black. Keep `tvTile` and `tvPill`; rename the mental model, not the palette. | `IMG_2281` hub tile = `(44,44,46)`; `z-014` profile + promo cards = `(46,46,46)`; `z-015` action buttons + pills = `(46,46,46)`; `z-001` selected chip = `(46,46,46)` |
| C22 | Title size — one tier or many | Master §1.3: "**Every** sheet + full-screen page title is 20 pt Bold. Never 28"; `spec2-watchlist` D6: "17–18 pt tier"; `spec2-explore` §2.2: "34 pt system large title" | **Three tiers, all confirmed by isolated first-cap-glyph scans.** **34 pt** tab-root large title · **20 pt Bold** tool page / sheet title · **18 pt Bold** compact inline nav title (collapsed watchlist name, pushed-page title, compact modal title). | cap ink ÷ 0.705: `z-015` "E" 24.00 → **34.0**; `IMG_2284` "I" 14.00 → 19.9, `IMG_2285` "C" 14.67 → 20.8, `IMG_2310` "L" 14.00 → 19.9 → **20**; `z-018` "N" 12.67 → **18.0**, `z-019` "CHRIS" 12.67 → **18.0**, `z-022` "C" 12.67 → **18.0**, `z-014` username 12.67 → **18.0** |
| C23 | `TVChip` label size — one component or two | Master §2.4: 17 pt Bold, ink 12.7, height 33, used 5× ; `spec2-explore` §3.2: 13–14 pt Bold, height 31.3 — "recommend a re-measure of both screens" | **Two genuinely different components.** Watchlist tabs: capsule **33.7 pt**, all-caps cap ink **12.67 pt → 18 pt Bold** (master's own ink figure converts to 18, not 17 — correct the size). Explore category pills: capsule **31.3 pt**, label ink **9.67 pt → 13–14 pt Semibold**. And the *behaviour* differs: watchlist chips are a **segmented selector** (only the selected one is filled); Explore pills are **navigation buttons** (all filled, no selected state). | `z-001` pill fill span 329–429 px = 33.67 pt, "CHRIS" ink y361–398 = 12.67 pt; `z-015` pill fill span 722–815 px = 31.33 pt, "Stocks" ink y754–782 = 9.67 pt |
| C24 | Red notification dot | Master §2.16: ⌀ **5.5 pt** `#F23645` | **⌀ 6.0 pt** (17–18 px), `#F23645` exact. Anchored so its centre sits at the host icon's top-right corner and it **overhangs the icon's top edge by ~1 pt**. Observed only on the **Chart** tab in the entire 90-frame corpus; the Community dot the master asserts has **zero** pixels in any capture. | `IMG_2284`/`IMG_2310` dot bbox x376–392, y2395–2412 px, `(242,54,69)`; Community column red-pixel count = 0 in every frame |
| C25 | Close-button variant rule | Master §2.2: circle-30 on `#1C1C1E`, bare `×` on `#000000` | **Key it to *presentation class*, not background hex.** Full-screen **pages** get the bare `×`; compact **modals/sheets** get the ⌀30 circle — including the "Create section" modal, which is `#000000` yet uses the circle. | `z-022` close button 29.7×29.7 pt, fill ≈`#1C1C1F`, glyph ≈`#9899A0`, on a pure-black modal |

### 0.3 Corrections carried forward from the source specs (still true)

- `IMG_2320` shows the **Technicals** tab, not Favorites.
- `t-024` shows **Chart type**, not Indicator templates (that's `t-023`).
- `IMG_2324` is the **chart object context menu** on BABA, not a JNJ symbol preview.
- `t-005` / `t-007` show a plain Watchlist — the "added to watchlist" toast is in **`t-006`**.

---

## 1. DESIGN TOKENS — the measured system

### 1.1 Colour

All hexes below are from the lossless census. `%` = share of all captured pixels,
a useful proxy for "how much of the app is this colour".

#### Surfaces (4 tiers — do **not** collapse them)

| Token | Hex | % | Role |
|---|---|---|---|
| `tvBlack` | `#000000` | 43.58 | Canvas for full-screen pages, list sheets, symbol-detail sheet, chart bottom toolbar, status bar |
| `tvChrome` | `#040404` | 4.72 | **Tab bar only.** Imperceptibly-lighter black — reads as a material, not a fill |
| `tvSheet` | `#1C1C1E` | 18.81 | Tool sheets: Analysis hub, Chart type, Drawings, Indicator templates, Layout, add-symbol search, context menus |
| `tvTile` | `#2C2C2E` | 9.98 | Filled tiles/cards **inside** `tvSheet`. One step up, never two |
| `tvRowBlock` | `#1F1F1F` | 1.14 | Elevated grouped row container on a `#000000` sheet (Compare Symbols recents list) |
| `tvControl` | `#313135` | 0.70 | Filled search field, close-button circle fill (`#313132` variant) inside sheets |
| `tvPill` | `#2E2E2E` | 0.91 | Segmented-pill / chip / capsule-button fill on symbol-detail surfaces |
| `tvScrim` | `#141415` | 0.83 | The dimmed presenting layer visible above a raised sheet (sheet top edge sits at y=62 pt) |
| `tvScrimChart` | `#1D1D1D` | 0.55 | Same, when a chart is the presenting layer (symbol-detail sheet, top edge y=83 pt) |
| `tvChartTop` | `#131722` | — | Chart canvas gradient top |
| `tvChartBottom` | `#181B26` | — | Chart canvas gradient bottom |

> **Mapping onto our current `Theme.swift`.** TradingView's base is **pure
> `#000000`**; ours is `bg = 0x0A0B0E`. That 10-unit lift is the single most
> visible non-parity delta — every screen reads "washed" next to TV on OLED.
> **Change `Theme.bg` to `0x000000`.** Full mapping in §1.7.

#### Text

| Token | Hex | Role |
|---|---|---|
| `tvText` | `#DBDBDB` | **Primary.** Titles, tickers, prices, row labels, tab labels, icons. TradingView uses **no pure white for text** |
| `tvTextSecondary` | `#8C8C8C` | Subtitles, company names, placeholders, section headers, unselected tab labels |
| `tvTextTertiary` | `#6F6F6F` | Timestamps, disabled rows, hint copy |
| `tvTextInverse` | `#0F0F0F` | Text on a white/inverted surface (primary CTA, selected tile, selected row) |
| `tvDismiss` | `#A0A0A8` | The `×` glyph inside a circular sheet-close button — deliberately dimmer than `tvText` |

#### Semantic / accent

| Token | Hex | Role |
|---|---|---|
| `tvUpFill` | `#089981` | Up candles, filled bars, price badges, gauge arcs |
| `tvUpText` | `#22AB94` | Positive change text, `+%`, range-slider fill, donut arc |
| `tvDownFill` | `#F23645` | Down candles, price badges, **and the universal red notification dot** |
| `tvDownText` | `#F7525F` | Negative change text, `−%` |
| `tvBrand` | `#2962FF` | Links, bid numerals, "Buy" signal text, single-series bar charts |
| `tvRefBadge` | `#2557FF` | Secondary/comparison price pill on the chart price scale |
| `tvExtHours` | `#2456FF` | The moon glyph on a watchlist extended-hours line — the *only* chromatic icon in the row system |
| `tvSelectAccent` | `#3D7BFF` | Border of the selected-indicator floating pill on the chart |
| `tvPurple` | `#9B7FE0` on `#3C2E4C` disc | Auto-refresh / live-sync icon, on-chart quick-alert bolt |
| `tvBidChip` | bg `#0D1B33`, numerals `#2962FF` | L1 bid `price×size` chip |
| `tvAskChip` | bg `#300B0E`, numerals `#F7525F` | L1 ask chip |
| `tvCtaGradient` | `#FE46A5` → `#4A5AFF` | Border-only gradient, "Trade with your broker" |
| `tvInverse` | `#FFFFFF` (rows: `#F2F2F2`) | **Selected = full inversion.** See §1.6 |
| `tvDelayD` | `#F57C00` | The orange "D" delayed-data glyph. **Bare glyph, no background chip.** Watchlist rows *and* Explore index cards `[P2]` |
| `tvCtaDisabled` | `#7F7F7F` | Disabled `TVPrimaryCTA` fill (flat mid-gray, no label-colour change) `[P2]` |

#### Flag palette `[P2]` — verbatim Material Design hues

Watchlist row flags. Used in three places: the row ribbon, the flag picker, and
the News-by-watchlist filter row.

| Name | Hex | Name | Hex |
|---|---|---|---|
| Red | `#FF5252` | Purple | `#BA68C8` |
| Blue | `#2979FF` | Cyan | `#00E5FF` |
| Green | `#81C784` | Pink | `#F48FB1` |
| Orange | `#FBC02D` | | |

#### Explore index-badge palette `[P2]` — per-instrument, not semantic

Do **not** route these through the up/down palette; they are brand identity discs.
S&P 500 `#C4162E` · Dow 30 `#13A3D7` · Nasdaq 100 `#0091BA` · US 2000 `#511732`.
Nasdaq Composite and NYSE Composite use a logotype mark instead of a numeral.

#### Lines

| Token | Hex | Width | Where |
|---|---|---|---|
**Two weights, keyed to host surface (C19/C20) `[P2]`.** This replaces the earlier
"everything is 1 pt" rule, which was measured only on sheets.

| Token | Hex | Width | Where |
|---|---|---|---|
| `tvHairline` | `#4A4A4A` | **1 pt (3 px)** | Dividers, section rules and ghost-button borders **inside a `#1C1C1E` sheet** |
| `tvHairlineSoft` | `#3D3D3D` | 1 pt | Between rows inside a `tvRowBlock` container |
| `tvHairlineList` | `#414141` | 1 pt | Between flat list rows **on a sheet** |
| `tvRule` `[P2]` | `#4A4A4A` | **0.33 pt (1 px)** | **Tab-bar top rule**; list rows on a `#000000` full-screen page (Menu tab) |
| `tvRuleList` `[P2]` | `#323235` | **0.33 pt (1 px)** | Between watchlist rows on pure black |
| `tvRuleCard` `[P2]` | `#2E2E2E` | 0.33 pt (1 px), **soft-faded ~8 pt at each end** | Vertical column rules flanking each Explore index card |

> ⚠️ Our `Hairline` renders `0.5 pt` of `Theme.line (#23262F)`. Both TV weights are
> brighter than ours; the sheet weight is also twice as thick. Ship **two**
> primitives (`TVHairline.sheet` 1 pt / `TVHairline.hair` 0.33 pt), not one.
> A single 1 pt rule under the tab bar is a visible, wrong-looking delta — the real
> one is a true single device pixel.

### 1.2 Surface-hierarchy law

Three rules, in priority order. They fully determine which background any new
screen gets:

1. **Full-screen page that replaces context** (own title row + the 5-tab bar
   still visible) → `tvBlack`. *Indicators picker, Object tree, Layouts manager.*
2. **Sheet whose content is a symbol or a list of symbols** → `tvBlack`.
   *Symbol detail, Compare Symbols, symbol quote preview.*
3. **Sheet whose content is chart tooling** → `tvSheet` `#1C1C1E`, with filled
   children at `tvTile` `#2C2C2E`. *Analysis hub, Chart type, Drawings, Layout,
   Indicator templates, add-symbol search, context menus.*

Nested sheets **never lighten** — a sheet stacked on a `#1C1C1E` sheet is also
`#1C1C1E`. Depth is signalled by the peeking `tvScrim` sliver above, nothing else.

**4. The one-notch rule for raised children (C21) `[P2]`.** A card, tile, pill or
chip fill steps **exactly one notch above its host surface**, and which hex you get
is a function of the host, not of the component:

| Host surface | Raised child fill |
|---|---|
| `#1C1C1E` tool sheet | `tvTile` **`#2C2C2E`** |
| `#000000` page or black sheet | `tvPill` **`#2E2E2E`** |

This is why the Analysis-hub tool tile (`#2C2C2E`) and the Menu-tab profile card
(`#2E2E2E`) are different hexes despite being the same idea. Do **not** add a third
"card" token — pick the fill from the host.

### 1.3 Type scale

Sizes derived from measured cap-height ÷ 0.705 (SF Pro cap ratio) and rounded to
the nearest shipping size. `ink` = the measured glyph band, for re-verification.

| Role | Size / weight | Colour | ink | Where |
|---|---|---|---|---|
| **Tab-root large title** `[P2]` | **34 pt Heavy** | `tvText` | 24.00 cap | Explore. iOS stock `UINavigationBar` large title. Strokes are visibly heavier than SF Pro Bold — read as Heavy/Black (§4-A16) |
| **Hero price** | 28 pt Bold | `tvText` | 19.67 | Symbol-detail price |
| **Sheet / tool-page title** | **20 pt Bold** | `tvText` | 14.0–14.7 cap | Analysis hub, Indicators picker, Compare symbols, Layouts, Chart type. Never 28 |
| **Compact nav title** `[P2]` | **18 pt Bold** | `tvText` | 12.67 cap | Collapsed watchlist name ("CHRIS"), pushed-page title ("News by watchlist"), compact-modal title ("Create section"), profile display name. **Four independent measurements land on exactly 18.0** — this is a real tier, not noise |
| **Section header (in-content)** | 20 pt Bold | `tvText` | 14.33 cap | "Key stats", "Earnings", "Statistics", "Top Stories" |
| **Toolbar symbol / interval** | **17 pt Bold** (C24) | `#FFFFFF` | 12.0 | Chart bottom toolbar — the only pure-white text in the app. C24 correction: the original 26 pt reading was the enlarged mid-drag wheel centre (§2.19), not the at-rest label — t-045's at-rest ink band measures 36 px = 12.0 pt → 17 pt |
| **Row primary** | 17 pt Semibold | `tvText` | 11.3–12.7 | Ticker, price, list-row label, template title |
| **Row primary (menu rows)** | 18 pt Semibold | `tvText` | 12.67 | Indicators-picker rows; use 17 pt if Dynamic Type matters more than exactness |
| **Row secondary** | 15 pt Regular | `tvTextSecondary` | 9.7–11.0 | Company name, category, subtitle, change value |
| **Row tertiary** | 13 pt Regular | `tvTextSecondary` | 9.3 | Extended-hours line, timestamps, axis ticks |
| **Chip label (selector)** `[P2]` | **18 pt Bold** | `tvText` sel. / `tvTextSecondary` unsel. | 12.67 cap | Watchlist tabs, search category filters, symbol-detail content tabs, template tabs. *Corrected from 17 — the master's own 12.7 pt ink converts to 18* |
| **Pill label (navigation)** `[P2]` | **13–14 pt Semibold** | `tvText` always | 9.67 | Explore category pills, Explore News/Calendar/Brokers labels. A genuinely smaller step; **not** the same component (C23) |
| **Segmented pill (detail)** | 15–17 pt Semibold | inverted when selected | — | Statements / 1D / Annual|Quarterly |
| **Section caption** | 11 pt Semibold, ALL CAPS, tracking +0.6 | `tvTextSecondary` | 7.67 | "PERSONAL", "TOOLS", "RECENT SYMBOLS" |
| **Watchlist group header** | 13 pt Bold, ALL CAPS, tracking +0.6 | `tvTextSecondary` | 9.0 | "CORE HOLDINGS" — deliberately 2 pt larger than the sheet caption |
| **Tab-bar label** | **12 pt Semibold** | `tvText` **in both states** | 8.33 cap ("M" of Menu) / 9.33 asc ("Watchlist") | Not 10 pt (HIG) and not 15 pt — explicitly oversized vs the iOS default. Weight corrected from Medium: stems measure 5–6 px = **1.67–2.0 pt** at 12 pt `[P2]` |
| **Primary CTA label** | 17 pt Bold | `tvTextInverse` | — | White pill buttons |

Font family: **SF Pro (system)** throughout. Numerics in tables and price stacks:
`.monospacedDigit()`.

### 1.4 Spacing scale

| Token | pt | Use |
|---|---|---|
| `s1` | 4 | Icon–badge offsets, intra-line gaps |
| `s2` | 8 | 2-col tile gutter (8.3), Analysis-hub tile row gap |
| `s2h` | 9 | **3-col tile gutter** |
| `s3` | 12 | Chart-type grid row gap, tile corner radius |
| `s4` | **16** | **Master horizontal margin.** Sheets, tiles, rows-with-avatar, CTA insets |
| `s5` | 20 | Alternate margin used by black full-screen pages (Indicators picker, Compare Symbols); block-to-block vertical rhythm |
| `s6` | 24 | Section-header top gap |
| `s7` | 30 | Watchlist section-header top gap |

**The 20 pt block rhythm.** Every stacked chrome block on a sheet is separated by
≈20 pt: search field → chips 19.3; chips → first row 20.7; toolbar → tabs 22;
tabs → list 19–20. Build one `blockGap = 20` and use it everywhere.

**Two margin systems, matched to the surface tier:**
- `#000000` full-screen pages / Compare sheet → **20 pt** side inset.
- `#1C1C1E` tool sheets and all rows with a leading avatar → **16 pt**.

### 1.5 Row-height scale

| Height | Row type | Where |
|---|---|---|
| **38 pt** | Dense inspector row, dividerless | Object tree, upper group |
| **44 pt** | Stat row (label ⟷ value), no divider | Key stats, About, Profile |
| **44 pt** `[P2]` | **Popup-menu row** (`TVPopupMenu`) | `•••` dropdown, Sort-by, row context menu, flag picker |
| **44 pt** `[P2]` | **Account list row** (`TVAccountRow`) | Menu tab: Rate us / Help Center / About / Sign out |
| **55.7 pt** `[P2]` | **Popup-menu *header* row** — the accordion row when its sub-list is showing | "Sort by ⌄", "Flag ⌄". Reuses the `TVGhostButton` height |
| **48 pt** | Layouts-manager row (2 lines + star + trash) | Layouts manager |
| **51 pt** | Object-tree applied-indicator row, divider-separated | Object tree, lower group |
| **52 pt** | Compact symbol row, 24 pt avatar | Compare Symbols recents |
| **55.7 pt** | Compact action row (outline style) | Analysis hub rows 1–2 |
| **60 pt** | **Standard 2-line symbol row**, 36 pt avatar | Search results, futures watchlist rows, Indicators-picker menu rows |
| **61.7 / 77.3 pt** | Template row, 1-line / 2-line subtitle | Indicator templates |
| **72 pt** | **Tool tile** (icon over label) | Analysis hub, Chart type, Drawings |
| **82 pt** | **3-line watchlist row** (ticker/price · name/change · extended-hours) | Watchlist — verified 82.0 pt across 5 consecutive hairlines |
| **82 pt** | Metric-detail table row | Financials drill-in |

### 1.6 Selection language — inversion, not tint

TradingView has **no accent-tinted selected state anywhere**. Selection is a
photographic negative:

| Element | Unselected | Selected |
|---|---|---|
| Grid tile (chart type, layout arrangement) | `#2C2C2E` fill, `tvText` glyph | `#FFFFFF` fill, `#0F0F0F` glyph |
| List row (Layouts manager active layout) | `#000000`, `tvText` | `#F2F2F2` row bg, black text |
| Chip / pill (watchlist tab, category, content tab) | no fill, `tvTextSecondary` label | `#2E2E2E`–`#282828` capsule, `tvText` label |
| Segmented pill (Financials sub-nav) | `#2E2E2E`, `tvText` | `#F2F2F2`, black bold |
| Compare-Symbols armed row | plain | 2 pt `#F2F2F2` full-bleed border **over** the row |
| **Tab-bar item** `[P2]` | glyph's **outline** variant, `#DBDBDB` stroke | glyph's **solid** variant, `#DBDBDB` mass with the interior knocked out in `tvChrome`. **Label identical in both states.** See §1.10 |
| **Flag colour swatch** `[P2]` | coloured **outline**, transparent centre | **solid fill**, same hue |

**Four idioms, not two `[P2]`:**

1. **Full inversion** — tiles, list rows, segmented pills. White fill, black content.
2. **Chip darkening** — the selector chip row gains a `#2E2E2E` capsule; it darkens
   rather than inverts. Non-inverting by design.
3. **Outline → solid, same hue** — the flag colour picker. The swatch keeps its
   colour and gains mass.
4. **Outline glyph → solid glyph** — the tab bar. Same as (3) but monochrome, and
   the label is deliberately excluded from the state change.

(3) and (4) are the same underlying move — *selection adds ink mass, never a tint*.
Read alongside (1) that is the whole system: **TradingView never uses an accent
colour to say "selected."** Do not invent a fifth idiom.

### 1.7 `Theme.swift` mapping and required edits

| Current token | Value | TV counterpart | Action |
|---|---|---|---|
| `bg` | `0x0A0B0E` | `#000000` | **Change to `0x000000`.** Highest-impact single edit |
| `panel` | `0x0D0F13` | `#040404` (tab bar) | Retarget to `0x040404` |
| `panel2` | `0x15171D` | `#1C1C1E` | Retarget to `0x1C1C1E` |
| `panel3` | `0x1F222B` | `#2C2C2E` | Retarget to `0x2C2C2E` |
| `chartBg` | `0x131722` | `#131722` | ✅ **already exact** — keep |
| `line` | `0x23262F` | `#4A4A4A` | Retarget to `0x4A4A4A`, and change `Hairline` height 0.5 → 1.0 |
| `text` | `0xD6DAE3` | `#DBDBDB` | Retarget (drop the blue tint) |
| `text2` | `0x9BA3B4` | `#8C8C8C` | Retarget |
| `muted` | `0x717A8E` | `#6F6F6F` | Retarget |
| `up` | `0x26C281` | `#22AB94` text / `#089981` fill | **Split into `upText` + `upFill`** |
| `down` | `0xF0566B` | `#F7525F` text / `#F23645` fill | **Split into `downText` + `downFill`** |
| `brand` | `0x2962FF` | `#2962FF` | ✅ already exact |
| `brand2` | `0x4D82FF` | `#3D7BFF` selection accent | Retarget |
| `signal` | `0xE8B339` | — | No TV equivalent; keep for our own affordances |
| — | — | `#2E2E2E` pill, `#313135` control, `#1F1F1F` row block, `#0F0F0F` inverse text, `#F2F2F2` inverse row | **Add 5 new tokens** |

Keep the AGENTS.md rule intact: this palette must stay mirrored with the web
terminal's `globals.css` in the same PR.

### 1.8 Icons

- **Thin outlined SF-Symbol-style line art**, uniform stroke. No filled glyphs
  except the Watchlist tab icon and a handful of chart-type marks.
- Sizes: **20 pt** ink in menu rows (24 pt point size); **22 pt** ink in the tab
  bar; **28 pt** ink in the chart bottom toolbar and the selected-indicator pill;
  **~15 pt** ink inside tool tiles; **18 pt** for row accessories (`plus`, flags,
  exchange badges); **12 pt** for trailing chevrons (`›`, 7.3 pt wide).
- Colour: `tvText` for everything. Icons are never tinted, with four exceptions —
  the extended-hours moon (`#2456FF`), the sync/bolt purple (`#9B7FE0`), the Siri
  shortcut glyph (full colour), and the red dot.
- **Red notification dot:** `#F23645`, ⌀ 5.5 pt, anchored to the host icon's
  top-right. Used on: Chart tab icon, Alerts tile, Save tile, chart `•••` toolbar
  icon, Community tab icon. One universal token.
- Nearest SF Symbols: `star`, `person`, `person.2`, `flame`, `bookmark`,
  `chart.bar.fill`, `magnifyingglass`, `plus`, `xmark`, `chevron.right`,
  `trash`, `eye.slash`, `line.3.horizontal`, `safari`. The Chart tab's diamond
  candlestick mark has **no SF equivalent** — ship a custom vector.

### 1.9 Corner radii

| Radius | Where |
|---|---|
| **12 pt** | All tiles and cards (measured r ≈ 38 px). Use `.continuous` |
| **10 pt** | Compact outline action buttons (Analysis hub rows 1–2) |
| **14–16 pt** | Sheet top corners (system default — do not hand-roll) |
| **capsule (h/2)** | Every pill: search fields, chips, segmented controls, CTAs, quote chips, price badges |
| **24 pt** | "Chart saved" toast card |
| **8 pt** | News-row thumbnail |

### 1.10 Tab-bar anatomy (exact)

Five equal columns, **80.4 pt pitch** (402 / 5). Icon centres at x = 39.7 / 120.0
/ 200.7 / 281.7 / 361.7.

```
y 791.0   1 pt hairline #4A4A4A, full bleed
y 791.3   bar background #040404 begins
y 797.7   icon ink top          ┐
y 821.0   icon ink bottom       ┘  icon ink band ≈ 22–23 pt
y 827.0   label ink top         ┐
y 838.0   label ink bottom      ┘  label ink ≈ 9.3 pt (ascender) → 12 pt Medium
y 838–874 home-indicator inset, 36 pt, pure black, no content
```

Total 83 pt (49 pt content + 34 pt safe area). Icon→label gap **6 pt**.

Tabs, left → right: **Watchlist** (bookmark/ribbon), **Chart** (diamond
containing candlestick ticks, red dot), **Explore** (compass with pen-nib
needle), **Community** (`person.2`, red dot when unread), **Menu**
(`line.3.horizontal`). Every glyph ships in an outline AND a solid variant.

**Selected-tab treatment (RESOLVED in pass 2, was A1 — law per C18):** selected
= the glyph's solid/`.fill` variant; unselected = its outline variant; the label
never changes and there is no accent tint anywhere. Explore's fill reads as a
`#DBDBDB` disc with a knocked-out glyph only because the compass's outer form is
a circle — it is not a background pill. The Menu hamburger, which has no fill
variant, doubles its stroke weight instead (1.33–1.67 → 3.0–3.33 pt). Measured
selected/unselected pairs exist for 4 of 5 tabs; Community's active state is the
residual check (§4-A1r).

---

## 2. COMPONENT KIT — `TVKit.swift`

Everything below is shared across ≥2 screens. Metrics are exact; build these once.

### 2.1 `TVHairline`
Two weights, keyed to host surface (C19): **1 pt (3 px) on `#1C1C1E` sheets**;
**0.33 pt (1 px) on `#000000` pages, black-page list rows, and the tab-bar top
rule**. Colours: `#4A4A4A` for structural rules and sheet-row dividers;
`.list` **`#323235`** between symbol rows on pure black (C20); `.soft` `#3D3D3D`
inside a `#1F1F1F` row block; `#414141` between flat rows on a `#1C1C1E` sheet.
Inset rule: **left-inset to align with content, always flush to the right screen
edge.** Full-bleed both sides only when separating major sheet regions.

### 2.2 `TVSheetChrome`
- **Grabber:** 36.7 × 5.3 pt, mid-gray, centred, 8 pt below the sheet's top edge.
- **Title:** 20 pt Bold `#DBDBDB`, leading inset 16 pt (sheets) / 20 pt (black pages).
- **Close button, two variants keyed to surface:**
  - on `#1C1C1E`: circle ⌀ **30 pt**, fill `#313136`, `xmark` glyph `#A0A0A8`.
  - on `#000000`: **bare `xmark` glyph**, 18 pt, `#DBDBDB`, no chrome.
- Close dismisses **one level only**.
- D4 nuance (pass 2): compact **dialogs** (e.g. the Create-section modal) use the
  circle variant even on `#000000` — key the variant to page-vs-dialog, not to
  the background hex.
- Sheet top edge lands at y = 62 pt (over a sheet) or y = 83 pt (over the chart);
  `tvScrim`/`tvScrimChart` shows above it.

### 2.3 `TVSearchField` — two variants, chosen by surface (C11)

| | `.outline` | `.filled` |
|---|---|---|
| Host surface | `#000000` | `#1C1C1E` |
| Height | **40 pt** | **36 pt** |
| Fill | transparent | `#313135` |
| Border | 1 pt `#4A4A4A` | none |
| Side margins | 20 pt | 16 pt |
| Shape | capsule (r 20) | capsule (r 18) |

Both: leading `magnifyingglass` inset 13 pt, placeholder 17 pt Regular
`#8C8C8C`, caret rendered **flat gray `#D4D4D4` — never the system blue accent**.
Placeholder copy differs per surface: `"Search"`, `"Symbol, ISIN, or CUSIP"`,
`"Use = to do math"`.

Trailing dismiss also differs: sheet-level `×` (Compare) vs an inline **"Close"**
text button, 17 pt, `#FFFFFF`, right edge 16.7 pt (Add-symbol).

Sibling primitive **`TVTextField`** (pass 2, D5): plain naming/text-entry field —
single line, bottom hairline only, no capsule, no fill, no leading icon
(Create-section modal). Do not force it into the search-field variant table.

### 2.4 `TVChip` (segmented capsule) — reused **five** times
Watchlist tabs · search category filters · symbol-detail content tabs
(Overview/News/Minds/Ideas) · indicator-template tabs · Financials pill row.

- Height **33.7 pt**, capsule, horizontal padding 15 pt.
- Selected: fill `#2E2E2E` (`#282828` variant), label **18 pt Bold** `#DBDBDB` (C23).
- Unselected: **no fill**, label 18 pt Bold `#8C8C8C`.
- Sibling component `TVNavPill` (Explore category pills — C23): capsule
  **31.3 pt**, label 13–14 pt Semibold, ALL pills filled `#2E2E2E`, no selected
  state. They navigate; they don't select. Do not merge with `TVChip`.
- Row is horizontally scrollable, leading inset 16 pt, no divider or fade edge.
- Long labels **truncate mid-word with `…`** — never wrap, never shrink.
- ⚠️ Our current `ListChipsRow` uses 12 pt semibold **uppercased** labels with
  12/6 padding. TV does **not** uppercase and is ~40 % larger. Fix both.

### 2.5 `TVSegmentedPill` (Financials/range sub-nav) — the *inverting* variant
Height 34 pt, capsule, 8 pt gaps. Selected `#F2F2F2` + black Bold; unselected
`#2E2E2E` + `#DBDBDB`. Distinct from `TVChip` — chips darken, pills invert.

### 2.6 `TVSymbolRow` — three variants on one grid

Shared grid: `avatar → 13 pt gap → 2-line leading stack ⟷ 2-line trailing stack
→ accessory`. Trailing stack is right-aligned; its two lines match the leading
stack's baselines exactly.

| | `.watchlist3` | `.symbol2` | `.compact` |
|---|---|---|---|
| Height | **82 pt** | **60 pt** | **52 pt** |
| Avatar | 36 pt circle | 36 pt circle | 24 pt circle |
| Left inset | 16 | 16 | 20 |
| Text left edge | 65 | 65 | 53 |
| Line 1 | ticker 17 Semibold `tvText` ⟷ price 17 Semibold `tvText` | ticker ⟷ exchange | ticker ⟷ exchange |
| Line 2 | name 15 Regular `#8C8C8C` ⟷ change 15 Medium (up/down/neutral) | name ⟷ category | name ⟷ category |
| Line 3 | 🌙 `#2456FF` + ext price + ext Δ, 13 pt | — | — |
| Accessory | optional orange `D` delay badge next to ticker | 18 pt exchange badge circle + 18 pt `plus` (→ `checkmark` once added) | 18 pt country flag circle |
| Background | flat, transparent | flat, transparent | `#1F1F1F` inside a grouped block |
| Divider | 1 pt `#414141`, left-inset 16, flush right | 1 pt `#414141` | 1 pt `#3D3D3D` |

Vertical rhythm of `.watchlist3`: 14 top pad / 12 line1 / 11 gap / 11 line2 /
13 gap / 9 line3 / 12 bottom pad = 82.

Colour rule for change values: **each value is coloured independently.** A row
can be green on the day line and red on the extended-hours line. Exactly `0.00`
renders `tvText`, not green.

### 2.7 `TVMenuRow` (icon · label · chevron)
Height **60 pt**. Icon 20 pt ink at left inset 20 pt; 13.3 pt gap; label 17–18 pt
Semibold `#DBDBDB` at x = 53; trailing `›` 7.3 pt wide `#DBDBDB`, right inset
26.3 pt. **No dividers between rows** — sections separate by whitespace alone.

### 2.8 `TVStatRow` (label ⟷ value)
Height 44 pt (64 pt when the value wraps a unit). Label 17 Regular `#DBDBDB`
left; value 17 Regular/Semibold right, with a 13 pt `#8C8C8C` unit suffix riding
the baseline ("USD", "B", "M", "K"). **No divider** in Overview sections; 1 pt
edge-to-edge `#4A4A4A` in table contexts.

### 2.9 `TVSectionCaption`
ALL CAPS, tracking +0.6. Two sizes: **11 pt Semibold** on sheets/pages
("PERSONAL", "TOOLS", "RECENT SYMBOLS"); **13 pt Bold** in a watchlist
("CORE HOLDINGS"). Colour `#8C8C8C`. Inset matches the row icon (16 or 20 pt).
Rhythm: ~30 pt above, ~27 pt below.

### 2.10 `TVTile` — the grid primitive
Icon-over-label card. **72 pt** tall, radius **12 pt** `.continuous`,
fill `#2C2C2E`, icon ~15 pt ink centred above a 15 pt Medium `#DBDBDB` label.

| Grid | Cell width | Gutter | Margin | Row gap |
|---|---|---|---|---|
| 2-column | **180.7 pt** | 8.3 | 16 | 8 |
| 3-column | **117.3 pt** | 9.0 | 16 | 8 (hub) / 12 (chart-type, drawings) |

Selected state = **full inversion** (`#FFFFFF` fill, black glyph + label).

### 2.11 `TVGhostButton` — compact outline action row
**55.7 pt** tall, radius 10 pt, **transparent fill** (reads as sheet bg), 1 pt
`#4A4A4A` border, icon ~15 pt over a 17 pt Medium gray label. Used only for
"Layout setup" / "Manage <name>" (2-up) and "New / Save / Open" (3-up).
This is a *secondary/contextual* affordance — do not use it for content tiles.

### 2.12 `TVPrimaryCTA`
Full-width capsule, **44 pt** tall (40 pt in the symbol-detail sheet), side
margins 16 pt, fill `#FFFFFF`, label 17 pt Bold `#0F0F0F`, centred.
One outlier: **"Trade with your broker"** — 70 pt tall, fill `#2C2C2E`, 1.5 pt
**gradient border** `#FE46A5 → #4A5AFF`, leading double-chevron icon.

### 2.13 `TVCapsuleButton` (secondary)
"Add note", "More info", "More financials", "See forecast", "← Back".
Height 40–50 pt, fill `#2E2E2E`, label 15–17 pt Semibold `#DBDBDB`, optional
leading icon and trailing `▸` 12 pt gray.

### 2.14 `TVPriceBadge`
On-chart price-scale pill. Fill `#089981` (bull) / `#F23645` (bear) /
`#2557FF` (reference/compare). White Bold numerals. 2-line variant adds `HH:MM`
under the price when a bar is scrubbed. A contract-code chip (e.g. `MNQZ2026`)
may sit immediately left, same fill.

### 2.15 `TVRangeSlider`
4 pt track, fully rounded, base `#2E2E2E`, teal `#22AB94` inset segment marking
the meaningful range, small upward white ▲ marking current price under the
track. Caption centred above, small-caps tracked gray, numeric endpoints
flanking.

### 2.16 `TVBadgeDot`
⌀ 5.5 pt filled `#F23645`, anchored top-right of its host icon.

### 2.17 `TVToast`
Centred card ≈ 85 % width, fill `#242424`, radius 24 pt, **dims the layer
behind it** (blocking confirmation, not an inline snackbar). Big centred glyph
(✓, ~28 pt) over a 20 pt Bold `#DBDBDB` title over a 15 pt `#8C8C8C` subtitle.
Copy pattern: `MNQ2!` / `Added to "CHRIS"`.

### 2.18 `TVChartToolbar` (chart tab only)
**51.7 pt** tall (measured 739.3 → 791.0), fill `#000000`, 1 pt `#4A4A4A`
hairline above **and** below. Contents left → right: symbol label **17 pt Bold**
`#FFFFFF` · interval label **17 pt Bold** `#FFFFFF` (C24 — at rest; the wheel
centre enlarges only mid-drag, §2.19) · pencil · magnet · `•••`
(+ red dot) · 1 pt vertical divider · undo · fullscreen. Icons 28 pt white
stroke, no fill.
Both text labels show the **previous/next wheel values ghosted above and below at
~40 % opacity and reduced scale, at rest** — the "keep scrolling" affordance.

### 2.19 `TVWheelPicker`
Floating `UIPickerView`-style list, no sheet, no scrim (drag variant) or full
scrim at 30–40 % dim (tap variant). Container ≈ 183 × 133 pt, dark translucent
(~55 % black). Row emphasis by distance from centre: centre 34 pt Bold white →
±1 28 pt light gray → ±2/±3 24 pt dim gray, fading to the container edge.
Symbol variant prefixes each row with a 16.7 pt avatar at matching opacity.

### 2.20 `TVTabBar`
Per §1.10. Five items, 80.4 pt pitch, 22 pt icons, 12 pt Medium labels, 6 pt gap,
`#040404` over a 1 pt `#4A4A4A` rule, 83 pt total, **no selected tint**.

---

## 3. PER-SCREEN BUILD CHECKLIST

Each item is a concrete visual delta a rebuild must implement. `→ spec-x.md §y`
points at the source doc for content/interaction detail this document omits.

### 3.1 Watchlist → `spec-watchlist.md`

1. Background to pure `#000000`; tab bar `#040404` over a 1 pt `#4A4A4A` rule.
2. **Toolbar row** at y 67–96: `•••` (left, x 32), brand mark (centred), `+`
   (right, inset 19.3). All `#DBDBDB`, 21 pt glyphs. → §2.1
3. **Watchlist tab chips** at y 110–143, `TVChip`, 16 pt leading inset, 33 pt
   capsules, 17 pt Bold, horizontally scrollable, ellipsis truncation (must
   survive mixed-script names like `SECTOR ETF 美国…`). → §2.1
4. 22 pt gap toolbar→chips; 19–20 pt chips→first content.
5. **Promo banner** (optional, dismissible): 68 pt tall, 16 pt margins, r 12,
   dark slate-navy gradient `#1D2029`, 22 pt Bold heading + 17 pt Regular
   subhead, decorative art right, `×` top-right. → §3.6
6. **In-list named sections**: `TVSectionCaption` at 13 pt Bold, 30 pt above /
   27 pt below. One watchlist contains many named groups. → §3.5
7. **Rows**: `TVSymbolRow.watchlist3` at exactly **82 pt** for instruments with an
   extended-hours quote; `.symbol2` at 60 pt for those without (futures). → §3.1/3.2
8. Extended-hours line: `#2456FF` moon glyph + 13 pt price + 13 pt signed Δ,
   coloured **independently** of line 2.
9. Optional orange `D` delayed-data badge immediately right of the ticker.
10. **`+ Add symbol` footer row** — the only centred row in the list. → §3.7
11. Hairlines: 1 pt `#414141`, left-inset 16 pt, flush right.
12. Row tap → symbol quote-preview sheet (§3.4). `+` in toolbar → add-symbol
    search sheet (§3.3).
13. Replace `LogoCircle(size: 34)` with 36 pt; replace `PriceStack` sizes
    15/12 → **17/15**; replace `SymbolTitle` 15/11 → **17/15**.
14. Replace the `PRE`/`AH`/`OVN` 8 pt text badge in `ExtendedQuoteLine` with the
    moon glyph + 13 pt line. (Keep the VoiceOver label — it's better than TV's.)

### 3.2 Search / Add symbol → `spec-search.md`

**Add-Symbol sheet** (from the watchlist `+`), bg `#1C1C1E`:
1. `TVSearchField.filled` at y 90.7–126.7, 36 pt, `#313135`… **note:** this
   surface measures `#262528`/`#282828` in video and `#313135` in the lossless
   sheet capture — ship `#313135` (§4-A4).
2. Trailing **"Close"** text button, 17 pt `#FFFFFF`, not an `×`.
3. Placeholder literally `"Use = to do math"` — the field is also a calculator.
4. `TVChip` category row at y 146–179.3: All / Stocks / Funds / Futures / Forex…
   horizontally scrollable.
5. Results: `TVSymbolRow.symbol2` at 60 pt, flat on the sheet (**no** elevated
   row background), 1 pt `#414141` dividers, **no divider above row 1**.
6. Per-row trailing: 18 pt exchange/verification badge circle (navy `#001E41` +
   white ✓ for a broker feed; `#132640` + `#2F96C9` globe for an exchange) then
   an 18 pt `plus` glyph `#D5D5D5`.
7. `+` tap → glyph becomes a persistent `checkmark`, **and** `TVToast` fires
   ("✓ / MNQ2! / Added to "CHRIS""). The checkmark does not revert. → §2.5
8. Opens with a **non-empty default result set** — never a blank state.

**Compare Symbols sheet** (from the chart), bg `#000000`:
9. `TVSearchField.outline` 40 pt, 20 pt margins, placeholder
   `"Symbol, ISIN, or CUSIP"`.
10. `TVSectionCaption` "RECENT SYMBOLS" at 11 pt, 20 pt inset.
11. Rows in an elevated `#1F1F1F` block, `TVSymbolRow.compact` 52 pt, 24 pt
    avatars, `#3D3D3D` dividers, trailing 18 pt country flag.
12. **Multi-select**: an armed row gets a 2 pt `#F2F2F2` full-bleed border drawn
    *over* it; the sheet stays open. Not a momentary press state.
13. Tab bar remains visible beneath (partial-height sheet).

### 3.3 Chart → `spec-chart.md`

1. Canvas: vertical gradient `#131722 → #181B26`. **Not** a flat black, and not
   the same token as the chrome above/below it.
2. **Quote header overlays the canvas directly** — no separate surface. Rows:
   identity (16.7 pt exchange disc, symbol name, overflow), price+change,
   controls (`⌄ N` legend-count outline chip + purple sync disc). → §2.1
3. Asset-class-aware copy: equities `At close: <price> <Δ> (<Δ%>)`; futures/FX
   omit "At close" and add a contract-code chip on the price badge.
4. Manual-scale affordances (white auto-fit square + `↓` lock) appear **only
   after** the user pans/zooms the price scale. Ship the conditional.
5. Candles `#089981` / `#F23645` — **not** `#0B8E75`/`#EE2F3B` (C1/C2).
6. Price scale: 13 pt `#A9ABB7` labels; round-number gridlines render Bold
   near-`#FAFAFA`. `TVPriceBadge` pinned to its Y value, decoupled from scroll.
7. Sub-panes (volume + 0–3 studies), each with its own right axis and one badge
   per plot.
8. **`TVChartToolbar`** at 51.7 pt with hairlines above and below; symbol and
   interval at 17 pt Bold pure white (C24) with ghosted neighbour values.
9. `TVWheelPicker` on drag of either label; commits **live per drag-frame**, not
   on release.
10. On-chart legend (top-left per pane): 19 pt Semibold names, hidden studies
    dimmed + eye-slash. Tap → the row becomes a `TVSelectedIndicatorPill`:
    ~282.7 × 26 pt, black fill, 1–1.5 pt `#3D7BFF` border, contents
    name · eye · gear · trash · `•••` at 28 pt.
11. Explicit **header-only loading state** (price + timeframe, blank plot) before
    candles paint. Not a spinner. → §5
12. Default study stack loads automatically — the chart is never blank.
13. "Chart saved" `TVToast`.

### 3.4 Symbol detail → `spec-symbol-detail.md`

1. Sheet background **pure `#000000`** (tier 2), not `#1C1C1E`.
2. Header block: 36 pt logo circle · company name 20–22 pt Bold + `⌄`
   ticker-switcher · `•••` far right · `TICKER · EXCHANGE` 15 pt gray + up to two
   24 pt status badge pills (moon = extended hours, crown = data plan).
3. Price block: hero **28 pt Bold**, change 17 pt with a gray "at close" suffix,
   then an extended-hours pill row.
4. Mini candlestick chart, then `TVChip` range row `1D 5D 1M 3M YTD 1Y 5Y All`
   + fullscreen glyph.
5. **`TVPrimaryCTA` "Trade"** — white capsule, 370 pt wide, 40 pt tall, 16 pt
   insets, black Bold label. Hairline above, hairline below the tab row.
6. Content tabs `Overview | News | Minds | Ideas` as `TVChip` (darkening, not
   inverting).
7. Overview scroll order (one scroll, not tabs): news-flash card → Key stats →
   Earnings → Dividends → Income statement → Performance chips → Seasonals →
   Technicals gauge → Analyst rating → Employees → Bonds → Options → About /
   Profile → description. → §2A/§4
8. `TVStatRow` at 44 pt, no dividers, 13 pt gray unit suffix on values.
9. `TVRangeSlider` ×2 (Day's Range, 52 Wk Range).
10. Bid/ask chips: capsule 34 pt, `#0D1B33`/`#300B0E`, `price×size`.
11. Gauges: semicircle ⌀ ≈ 220 pt, stroke 14 pt, white needle 4 pt rounded;
    donut ⌀ ≈ 230 pt, ring 34 pt, track `#2E2E2E`, arc `#22AB94` from 12 o'clock.
12. **Financials module**: `TVSegmentedPill` row (inverting) + a leading fixed
    search glyph; sticky 3-column table header; charted metrics get a 3 pt left
    accent bar + a faint colour-matched row wash; wide tables scroll
    horizontally **independently** of the page. → §2C
13. Metric drill-in uses a **"← Back" pill**, not a nav-bar chevron; 82 pt table
    rows; Change % colour-coded per sign.
14. News tab: **skeleton loading state** with identical geometry in flat
    `#141414` blocks (no shimmer observed). → §4
15. `•••` action sheet: Share / Notes / ▾ Metrics (Financials, Documents,
    Technicals, Forecast, Seasonals, Options, Bonds, ETFs), ~92 pt rows.

### 3.5 Indicators / Analysis hub → `spec-indicators.md`

1. **Analysis hub sheet** `#1C1C1E`, grabber, 20 pt Bold title, 30 pt circular
   close (`#313136` fill, `#A0A0A8` glyph), 16 pt content inset.
2. Row 1 (Layout setup / Manage <name>) and Row 2 (New / Save / Open) are
   **`TVGhostButton` at 55.7 pt — outline, transparent fill** (C6). The "filled
   `#2C2C2E`" claim in `spec-chart.md` §2.4 is wrong.
3. Full-bleed 1 pt `#4A4A4A` divider at y 298 — the only edge-to-edge line.
4. "Trade with your broker": 70 pt, `#2C2C2E`, gradient border.
5. `TVSectionCaption` TOOLS / INFO / MORE at 11 pt.
6. Tool grids: `TVTile` **72 pt**, filled `#2C2C2E`, r 12. 2-col = 180.7 pt
   (gutter 8.3); 3-col = 117.3 pt (gutter 9). Row gap 8 pt. (C7/C8/C9)
7. Red dot on the Alerts tile and the Save button.
8. **Navigation is deliberately mixed**: "Indicators" **pushes a full-screen
   black page** (tab bar returns); "Indicator templates" / "Chart type" /
   "Object Tree" **stack a sheet over the sheet** (previous sheet's top edge
   peeks). Do not make everything a sheet. → §5
9. **Indicators picker** (`#000000` page): bare `×` close, `TVSearchField.outline`
   40 pt at 20 pt margins, `TVSectionCaption` PERSONAL / BUILT-IN / COMMUNITY,
   `TVMenuRow` at 60 pt with 20 pt icons and `›` chevrons, **no dividers**.
10. **Indicator templates sheet** (`#1C1C1E`): `TVSearchField.filled` 36 pt at
    16 pt margins, `TVChip` row (Favorites / My templates / Technicals), rows
    61.7 pt (1-line subtitle) / 77.3 pt (2-line), edge-to-edge `#4A4A4A`
    dividers, pinned `TVPrimaryCTA` "Save indicator template" at 44 pt.
11. **Chart type sheet**: sticky hint banner (does not scroll with the grid),
    3-col `TVTile` grid, row gap 12 pt, 21 types, **selected = full inversion**.
12. **Object tree** (`#000000` full page): nav title + new-folder / move / `×`
    cluster; the chart's own symbol row is bold with a candle icon and **no
    hide/delete**; study rows carry eye-slash (hidden state dims to ~35 %) +
    trash; a divider splits main-pane overlays from sub-pane studies. Row pitch
    **51 pt** in the lower group (C16).
13. **Applied-indicator context menu** (`#1C1C1E` sheet, grabber, no title) — 15
    rows in 4 divider-separated groups. Treat `spec-indicators.md` §4.3 as the
    canonical action list.
14. **Drawings sheet**: horizontally scrollable `TVChip` tab row (7 categories),
    same 3-col tile grid, **no selected state** (one-shot launchers), tab swap
    replaces the whole grid and resets scroll.

### 3.6 Watchlist supplement (pass 2) → `spec2-watchlist.md`

1. **`•••` dropdown** (S10): compact popup anchored top-left over the dimmed
   list — Edit / Sort by › / News by watchlist / "Watchlists" group /
   All watchlists / Create new list. Card chrome per spec2 §3.2; popup row
   labels are brighter than sheet rows (`#F6F6F6`, D7); group labels are plain
   mixed-case, NOT `TVSectionCaption` (D8).
2. **Sort by** accordion-expands in place (`›`→`⌄`), first entry
   "Customized order" (S11).
3. **Row long-press context menu** (S13): the row "peeks" as an elevated
   `#1C1C1E` card above 4 divider-separated action groups incl. Open chart /
   **Open symbol screen** / Trade / Add alert / Flag › / Add section above /
   Remove.
4. **Flag system** (S14): 7-colour picker; selection idiom = outline→solid fill
   (§1.6 idiom 4); flagged rows carry a flag ribbon (spec2 §3.4); News-by-
   watchlist filters by flag colour.
5. **User-authored sections**: "Add section above" → Create-section modal
   (S15) — full-black compact dialog, `TVTextField`, white CTA, circle close
   (D4). Sections are user data, not server curation (D12).
6. **News by watchlist** (S12): pushed full-screen page, 18 pt compact nav
   title (C22 tier 3), flag + list-name filter chips, article feed.
7. **Row height is session-state-driven** (D2): the extended-hours line renders
   only while an extended session has live data — the SAME symbol renders 82 pt
   or 60 pt by time of day. Build one row that grows, not two row classes.
8. Universal per-row trailing dash glyph ≈ drag handle (D1); "Customized order"
   implies long-press reorder (D10 / §4-A19).

### 3.7 Menu tab → `spec2-menu-settings.md`

1. Full-black tab-root page. Top utility row: messages bubble + settings gear
   (both targets unphotographed — ship as affordances, §4-A18).
2. **Profile card**: `#2E2E2E` (the one-notch-above-black rule, C21), avatar,
   **pure-white** display name (C13 exception), PREMIUM badge, Published /
   Followers / Following stat row in `#8C8C8C`, whole-card chevron.
3. Two **`TVPromoCard`s**: subscription-manage + refer-a-friend; promo subtitles
   stay `#DBDBDB` (dimming exception, D4-menu).
4. **`TVAccountRow`** plain rows at **44 pt**: Rate us / Help Center / About(›) /
   Sign out; 0.33 pt `#4A4A4A` dividers (C19).
5. **Sign out** renders label + icon in fill-red `#F23645` (destructive
   exception to the C2 text/fill split, D5-menu).
6. **Our mapping**: account card = existing auth state (email/Guest + Sign
   in/out); Language row restyled as a `TVAccountRow`; version/bridge/Logo.dev
   attribution move into an About push; gear + messages ship as placeholder
   affordances.

### 3.8 Explore tab → `spec2-explore.md`

1. Full-black tab-root: **34 pt Bold large title** "Explore" (C22 tier 1) +
   trailing search glyph.
2. Action row: **News / Calendar / Brokers** — filled `#2E2E2E` capsule buttons,
   13–14 pt labels.
3. **`TVNavPill` category row**: Stocks / Crypto / Futures / Forex / Bonds / … —
   all filled, navigation not selection (C23).
4. **Index-card carousel**: 2-row horizontally-scrolling grid of market cards
   (name, last, signed change) — maps directly onto our manifest + `/api/quote`
   plane today.
5. **Top Stories** feed: section header + news rows (8 pt-radius thumbnail,
   2-line title, source·time in gray). Needs a published news API → ledger
   bucket B; ship the structure with an honest empty/placeholder state.
6. **Our mapping**: replaces MarketsScreen as the Explore tab; Discover/Analysis
   web pushes become Explore entries alongside News/Calendar placeholders;
   Brokers is excluded (bucket D).

---

## 4. AMBIGUITIES — resolve by live screen-mirroring

Ordered by build risk. Each names the exact check to run.

**A1r — Tab-bar active state (RESOLVED for 4/5 tabs, C18).** Selected = glyph
solid variant, label unchanged. Residual: Community's active state was never
captured, and whether Chart's red dot survives selection. *Check: tap Community,
screenshot.*

**A2 — Quick-Info (A) vs Symbol Detail (B).** Are these two reachable surfaces or
one surface across two app versions? They never appear back-to-back in any
capture. This decides the entire symbol navigation architecture. *Check: from
the Watchlist tap a row; from the Chart tap the symbol legend; compare.*
Pass-2 partial (D11): the row context menu exposes BOTH `Open chart` and
`Open symbol screen` — two deliberately distinct targets confirmed; which
surface `Open symbol screen` lands on still needs the live tap.

**A3 — Wheel-picker physics.** Inertia, snap points, haptics on value crossing,
and whether commit is live-per-frame or on-release. 2-second sampling cannot
resolve it. *Check: slow-drag the toolbar symbol label while recording at 60 fps.*

**A4 — Add-symbol search-field fill.** Video frames give `#262528`/`#282828`;
the lossless sheet family gives `#313135`. If TV really ships two fills for the
same component, we need the second token. *Check: lossless screenshot of the
add-symbol sheet.*

**A5 — Object-tree row heights.** Lower group measures 51 pt pitch; the dividerless
upper group was estimated at 38 pt. *Check: screenshot with many studies loaded.*

**A6 — Add-to-watchlist toast timing.** Duration, dismissal gesture, and exact
placement. Only one mid-display frame exists (`t-006`). *Check: tap `+` and record.*

**A7 — Category-tab inventory.** "Forex" is clipped at the right edge in every
frame. Crypto / Indices / Bonds / Economy unconfirmed. *Check: scroll the chip row.*

**A8 — Drawings tab-row inventory.** Same clipping problem; unknown whether
categories exist beyond the 7 captured.

**A9 — Sub-pane resize.** Pane ratios vary across captures, implying a drag
handle, but no frame captures the gesture. *Check: drag a pane boundary.*

**A10 — Sheet detent behaviour.** `t-033→t-034` shows sheet content scrolling
during the presentation animation, implying a fully-interactive
`UISheetPresentationController`. Confirm detents (medium/large/custom) and
whether Analysis hub restores or resets scroll position on re-open. *Recommend:
always open at top regardless of what TV does.*

**A11 — Selection-inversion completeness.** Confirm the inversion rule holds for
states never captured selected: Drawings tools, Indicator-template rows, chip
rows under `.highlighted`.

**A12 — "Sync in layout" dropdown.** Never opened. Controls crosshair / symbol /
interval sync across panes — unknown which.

**A13 — Light mode.** Every capture is dark. TV ships a per-chart theme toggle
(moon/sun) in the quote header. The entire light palette is unspecified. *Check:
toggle it and re-run the census.* Until then, ship dark-only.

**A14 — Hero-price point size.** Measured cap-height converts to 28 pt at a 0.705
ratio but 24–30 pt across plausible ratios. *Check: Accessibility Inspector on a
live device rather than trusting pixel conversion.*

**A15 — "D" delayed badge.** Colour, shape and trigger rule for the orange `D`
(appears once). The MNQ2! trailing dash is RESOLVED by pass 2 (D1): it appears
on 100 % of watchlist rows — a universal glyph, most plausibly a drag handle
(see A19).

**A16 — Community tab.** Zero captures in either corpus. Entire surface
unspecified. Ship a placeholder tab; needs screenshots or a mirroring session
before real build.

**A17 — Alerts surfaces.** Alert list/editor never captured (only the hub tile
and red dots). Our web terminal has a live alerts engine to surface eventually —
blocked on reference imagery.

**A18 — Menu children.** Settings, Messages, public profile, About, and
subscription pages unphotographed (`spec2-menu-settings.md` §1 table).

**A19 — Watchlist reorder gesture.** "Customized order" + the universal drag
glyph imply long-press drag reorder (D10). Confirm the gesture and haptics live.

---

## 5. Build order (recommended)

1. `Theme.swift` retarget (§1.7) — one PR, no layout changes. Instantly closes
   the largest perceived gap (black base + hairline weight).
2. `TVKit.swift`: §2.1, 2.4, 2.6, 2.7, 2.8, 2.9, 2.20 — covers Watchlist and
   Search entirely.
3. Watchlist (§3.1) and Search (§3.2) — highest-traffic, fully specified.
4. `TVKit` part 2: §2.2, 2.3, 2.10, 2.11, 2.12 — unlocks every sheet.
5. Explore + Menu tab roots (§3.7/§3.8) — includes the 5-tab restructure
   (Community ships as a placeholder pending §4-A16).
6. Analysis hub + Indicators (§3.5).
7. Symbol detail (§3.4) — largest content surface; §2.14/2.15 needed.
8. Chart chrome (§3.3) — depends on the renderer, which per `AGENTS.md` stays in
   `terminal/`; the native side ships only the header, toolbar, wheel and legend.

**Standing constraint (`AGENTS.md`):** native code implements presentation and OS
integration only. No chart rendering, no indicator math, no entitlement logic in
`apps/ios`. Any screen here that needs data no published Terminal API exposes
gets its API added to `terminal/` first.
