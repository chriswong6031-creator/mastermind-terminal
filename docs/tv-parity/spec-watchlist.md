# TradingView iOS — Watchlist Surface: Pixel Spec

Source frames: `tvframes/t-001.png` … `t-098.png` (video frames, 2s apart, chronological).
Frame size: **1206×2622 px = 402×874 pt @3x** → this is the logical resolution of an **iPhone 16 Pro**. All
measurements below were taken with PIL pixel sampling on the original frames and are reported in **pt**
(px ÷ 3) unless stated otherwise. Where a font size is given, it is *derived* from measured cap-height
(cap-height ≈ 0.72 × font size) — treat these as close estimates (±1pt), not ground truth from an inspector.

Primary reference frames actually used (renumbered from what was supplied, since file content did not line
up 1:1 with the given descriptions — noted so nothing looks silently substituted):
- `t-005.png` — CHRIS custom list, **top of scroll**: promo banner + "CORE HOLDINGS" section (JNJ, WMT, MCD,
  CBOE, REGN, VEEV). This is what the prompt called out as showing JNJ/WMT/MCD/CBOE/REGN/VEEV.
- `t-007.png` — same CHRIS list, scrolled further: "SECTOR ETFS"-style rows (XLC, XLY, XLI, XLE, XLB, XLRE)
  and a "GOLD SILVER MINERS" section header + GDX.
- `t-085.png` — a different watchlist, mid-scroll: Sea Limited (cut off), TPR, SMP, VZ, DLB, TKO, XOM, MNQ2!,
  then a "+ Add symbol" row. This is a **transition frame** (see §4) — the tab-pill row is absent because the
  screen is still animating in from a chart's docked mini-watchlist strip, not because this list has no tabs.
- `t-086.png` — CHRIS/SECTOR ETF/STEVEN tab row fully settled, list scrolled to a later section (MS, AXP, V,
  MAST, BROS, AC, UAL, DAL).
- `t-001`–`t-004`, `t-006` — the global "add symbol" search sheet (opened from the watchlist's `+`), including
  an "Added to CHRIS" confirmation toast.
- `t-008`–`t-011`, `t-087`–`t-098` — the symbol quote preview bottom sheet reached by tapping a row (MNQ2!,
  then later AXP), included because it's the watchlist row's tap destination.

---

## 1. Surface inventory

| # | Surface | State | Frames |
|---|---|---|---|
| S1 | **Watchlist tab — custom list, top of scroll** | CHRIS tab active; dismissible promo banner + first section ("CORE HOLDINGS") visible | t-005 |
| S2 | **Watchlist tab — custom list, scrolled** | Later sections in same list (sector ETFs, gold/silver miners, financials/travel) | t-007, t-086 |
| S3 | **Add-symbol search sheet — empty query** | Modal sheet over the watchlist, keyboard up, "All" category chip selected, global top-of-list results (Gold, Micro E-mini futures) | t-001, t-003, t-004 |
| S4 | **Add-symbol search sheet — OS notification overlaid** | Same sheet with an iOS banner notification transiently covering it (OS chrome, not app UI) | t-002 |
| S5 | **Add-symbol confirmation toast** | Same sheet, after tapping `+` on a result row; centered toast "✓ MNQ2! Added to "CHRIS"" | t-006 |
| S6 | **Symbol quote preview — bottom sheet, Overview** | Partial-height card over the previous screen: icon/name/price, mini chart, range pills, Trade button, Overview/News/Minds/Ideas tabs | t-008–t-011 |
| S7 | **Symbol quote preview — collapsed header, sub-tab** | Same sheet scrolled/tab-switched (News tab, skeleton-loading state); header collapses to one compact row | t-088 |
| S8 | **Chart screen's docked "next symbol" strip** | While charting, a partial list (TPR, SMP, VZ, DLB, TKO, XOM, MNQ2!) is docked at the bottom of the chart, above the chart toolbar | t-084, t-087 |
| S9 | **Watchlist tab — mid-transition from chart** | The docked strip from S8 expanding into the full Watchlist tab; header/tab-pill row not yet settled | t-085 |

Sections 2–3 below cover S1–S3/S5 in full geometric detail (the actual "watchlist" ask); S6–S9 are covered at
lighter, qualitative detail since they are tap-destinations from the watchlist, not the watchlist itself.

---

## 2. Layout trees — measured geometry, typography, colors

### 2.0 Global color system (sampled, hex)

Use this table as the single source of truth for surface hierarchy — this is the "pure black vs elevated
surface" answer the rebuild needs:

| Role | Hex | RGB | Notes |
|---|---|---|---|
| Canvas background (list, screen) | `#000000` | 0,0,0 | True black everywhere behind content — OLED-style |
| Bottom tab bar background | `#090909` | 9,9,9 | Barely lighter than canvas; separated by a hairline, not a visible fill difference |
| Modal sheet background (search sheet, preview sheet) | `#1A191C` | 26,25,28 | Cool near-black, one clear step up from canvas |
| Pill / chip / search-field fill | `#262628`–`#282828` | 38,37,40 / 40,40,40 | Same fill reused for: search input, category chips, active watchlist-tab pill |
| Promo banner card | `#1D2029` → lighter | 29,32,41 (top-left) | Dark slate-navy gradient card with faint line-art doodles + a glowing pink/red heart graphic on the right — the single most "elevated" surface in the list |
| Toast/confirmation card | `≈#242424` | ~36,36,36 | Large centered rounded card, dims the sheet behind it |
| Hairline separator (row/tab divider) | `#2C2C2C`–`#414141` | 44,44,44 / 65,65,65 | 1px; inset to match content on the left, flush to the screen edge on the right (see §3.1) |
| Primary text/icon (ticker, price, active-tab label, header icons, nav bar icons+labels) | `#D4D4D4` | 212,212,212 | Not pure white anywhere in the app |
| Primary text, row-specific variant | `#BDC2C6` | 189,194,198 | Ticker/price glyph-fill sampled slightly bluer than the `#D4D4D4` used for chrome — treat as the same "primary" tier |
| Secondary text (company name / description under ticker) | `#656565` | 101,101,101 | |
| Secondary text (inactive tab / chip label) | `#808080` | 128,128,128 | One step brighter than the row-subtitle gray above — two distinct "secondary" tones |
| Positive change (green) | `#1EA089` | 30,160,137 | TradingView teal-green |
| Negative change (red) | `#F54655` | 245,70,85 | Identical hex used for the day-session line *and* the extended-hours line — colors are computed independently per value, not inherited from the row (confirmed: DLB's day change is green +13.58% while its extended-hours change is red −0.87% in the same row) |
| Zero / unchanged value | same as primary `#D4D4D4`/`#BDC2C6` | | Not colored green or red when the delta is exactly 0.00 |
| Extended-hours "moon" glyph | `#2456FF` | 36,86,255 | Vivid blue, only color-accent icon in the whole row system |
| Notification badge dot (bottom nav) | red, ≈`#E8433A`-family | | Small dot, top-right of the Chart tab icon only |

### 2.1 Header chrome (shared by every Watchlist state, S1/S2)

Top to bottom, absolute y in pt from screen top:

| Element | y-range (pt) | x-range (pt) | Size | Detail |
|---|---|---|---|---|
| Status bar (OS) | 0–~50 | full width | — | Standard iOS status bar; a red pill left-of-center in some frames is the OS screen-recording indicator, not app UI — ignore it |
| Toolbar row | ~67–96 | full width | icons ~78pt vertical center | `•••` "more" button (3 dots, glyph ~20×4pt, left, glyph starts x=32pt), TradingView flag logo (glyph ~29×14pt, horizontally centered), `+` add-symbol button (glyph ~21×21pt, right, right edge inset 19.3pt from screen edge) |
| Watchlist-tabs row | ~110–143 | full width, 16pt margins | pill 33pt tall | Horizontally-scrolling row of the user's custom watchlists. Active tab: bold `#D4D4D4` text on a `#282828` capsule (fully rounded, radius = half height ≈16.5pt), 16pt left inset. Inactive tabs: plain `#808080` bold text, no background, no underline. Long names truncate with `…` (e.g. "SECTOR ETF 美国…" — confirms list names can mix scripts/length and are simply ellipsis-truncated, not wrapped) |

Toolbar icon color: `#D4D4D4` throughout (dots, logo, plus, active tab, all identical tone).

Gap rhythm: toolbar row → tabs row ≈ 22pt gap; tabs row → first list content ≈ 19–20pt gap. This ~20pt
vertical rhythm repeats between every stacked chrome block in the app (search field → chips, banner → section
label, etc.) — treat 20pt as the canonical "block gap" token.

### 2.2 S1 — Top of CHRIS list: promo banner + "CORE HOLDINGS" (t-005)

```
[Toolbar + Tabs — as §2.1, CHRIS active]
│
├─ Promo banner card                              y ≈ 162–230 pt   (68pt tall)
│   x 16–390pt (16pt margins), rounded corners (~10-14pt radius est.)
│   bg: dark slate/navy gradient #1D2029-ish, faint line-art doodle icons (compass/ruler/
│        wrench/pencil), glowing pink→red heart graphic with white TV logo mark, bottom-right;
│        small "×" dismiss control, top-right corner
│   "Love our app?"      — ~22pt Bold, #D4D4D4
│   "Share what you love!" — ~17pt Regular, #B0B0B0-ish
│
├─ gap ≈ 30pt
├─ Section header "CORE HOLDINGS"                 y ≈ 260–270 pt
│   x from 16pt; ~13pt Bold, all-caps, letter-spaced, #808080-ish gray
│   (this exact same label style repeats later for "GOLD SILVER MINERS", see §2.3)
│
├─ gap ≈ 27pt
└─ Row list (3-line "extended-hours" row type, 82pt each — see §3.1 anatomy)
    1. JNJ · Johnson & Johnson         256.35  +0.53 +0.21%   ⏾ 256.50 +0.15 +0.06%
    2. WMT · Walmart Inc.              111.20  +0.10 +0.09%   ⏾ 111.15 −0.05 −0.04%
    3. MCD · McDonald's Corporation    270.64  +2.20 +0.82%   ⏾ 271.00 +0.36 +0.13%
    4. CBOE · Cboe Global Markets, Inc.310.23 +13.71 +4.62%   ⏾ 309.94 −0.29 −0.09%
    5. REGN · Regeneron Pharmaceutic…  762.63 +24.29 +3.29%   ⏾ 763.20 +0.57 +0.07%
    6. VEEV · Veeva Systems Inc.       203.78  +2.22 +1.10%   ⏾ 203.72 −0.06 −0.03%
    [row 7 cut off at bottom of frame]
```

### 2.3 S2 — Same list, scrolled further (t-007)

Confirms the list is one long, hand-curated watchlist with **multiple named sections**, each using the exact
same small-caps gray label style as "CORE HOLDINGS":

```
… (Core Holdings continues above, off top of frame)
XLC  State Street Communicati…   108.24  +1.66 +1.56%   ⏾ 108.24  0.00  0.00%
XLY  State Street Consumer Di…   116.09  +3.70 +3.29%   ⏾ 116.24 +0.15 +0.13%
XLI  State Street Industrial S…  179.84  +1.45 +0.81%   ⏾ 178.72 −1.12 −0.62%
XLE  State Street Energy Selec…   59.55  +0.59 +1.00%   ⏾  60.17 +0.62 +1.04%
XLB  State Street Materials Sel…  50.43  −1.21 −2.34%   ⏾  50.53 +0.10 +0.20%
XLRE State Street Real Estate S…  45.07  −0.23 −0.51%   ⏾  45.08 +0.01 +0.01%

GOLD SILVER MINERS                              ← identical section-header style
GDX  VanEck Gold Miners ETF        74.10  −2.68 −3.49%   ⏾  73.88 −0.22 −0.30%
```

Scrolling further still (t-086, different list-scroll position, tabs still pinned) shows another
section containing MS (Morgan Stanley), AXP (American Express), V (Visa), MAST (Mastercard, with an
orange "D" delayed-data badge next to the ticker), BROS (Dutch Bros), AC (Air Canada, also "D" badge),
UAL (United Airlines), DAL (Delta) — i.e. a financials/payments group followed by an airlines/travel
group, same row template throughout.

Small "D" badge (orange, next to MAST / AC ticker) = a data-delay indicator on specific symbols; not present
on the majority of rows. Worth carrying into the rebuild as a per-row optional badge, not a per-list toggle.

### 2.4 S3 — Add-symbol search sheet, empty query (t-001)

Reached by tapping the `+` in the watchlist toolbar. Presented as a standard iOS modal sheet — the
previous screen's top corners are visible, scaled down and dimmed, peeking above the new sheet.

```
[Presenting screen peeks through, dimmed, top ~2pt sliver]
Sheet bg #1A191C, rounded top corners
│
├─ Search field                                   y ≈ 91–126 pt   (35pt tall)
│   x 16–336pt (pill, fill #262628, fully rounded)
│   🔍 icon + "Use = to do math" placeholder, gray italic-less regular ~17pt, blinking cursor
│   "Close" plain-text button to the right of the pill (bold white #D4D4D4, no background),
│     right edge 16.7pt from screen edge
│
├─ gap ≈ 20pt
├─ Category chip row                               y ≈ 146–180 pt
│   "All" (selected: #262628 capsule, bold #D4D4D4) · "Stocks" · "Funds" · "Futures" · "Forex"…
│   (unselected chips: plain #808080 bold text, no pill, same treatment as inactive watchlist tabs)
│
└─ Result rows (2-line row type, 60pt each — see §3.2 anatomy), scoped to "All" = every asset class:
    XAUUSD · Gold                       OANDA [✓-badge]        commodity cfd    +
    MNQ1!  · Micro E-mini Nasdaq-100…   CME [globe-badge]       futures         +
    MNQ2!  · Micro E-mini Nasdaq-100…   CME [globe-badge]       futures         +
    MNQU2026 · Sep 2026                 CME [globe-badge]       futures         +
    MNQZ2026 · Dec 2026                 CME [globe-badge]       futures         +
    MNQH2027 · Mar 2027                 CME [globe-badge]       futures         +
[Keyboard docked at bottom, standard iOS QWERTY]
```

### 2.5 S5 — Add-symbol confirmation toast (t-006)

After tapping `+` on the MNQ2! row: the row's `+` becomes a `✓` checkmark (state persists — this is how the
sheet shows "already in this list"), and a centered toast overlays the sheet:

```
┌───────────────────────────────┐
│                               │
│            ✓ (large,          │   toast card: dark gray ~#242424,
│         ~84×57pt glyph)       │   rounded rect, roughly centered,
│                               │   ~85% width, dims the sheet behind it
│           MNQ2!               │   bold #D4D4D4, ~20pt
│      Added to "CHRIS"         │   regular #808080-ish, ~15pt
│                               │
└───────────────────────────────┘
```

Toast is transient (single frame captured mid-display; exact auto-dismiss timing not observable from
these frames — see §6 open questions).

### 2.6 S6/S7 — Symbol quote preview bottom sheet (tap destination from any row)

Lighter detail since this isn't the watchlist itself, but it's the row's primary tap target and worth
carrying into a native rebuild as a distinct, reusable component:

```
[Presenting screen (chart or watchlist) peeks ~83pt above, dimmed]
Sheet bg #000000 (true black, unlike the search sheet), rounded top corners, small gray
  drag-handle/grabber centered just below the top edge (~53,53,53, ~5pt tall)
│
├─ Header row: [icon 36pt] Company Name ⌄     •••
│     TICKER · EXCHANGE  [session-badge][entitlement-badge]
├─ Price block: 336.25 USD  (~34pt Bold)
│                −1.27 −0.38% at close  (red/green, ~17pt)
│                [extended-hours pill: 🌙 336.58 +0.33 +0.10%]
├─ Mini candlestick chart (full width, ~380pt tall)
├─ [alarm-clock+ ] ................... [mini-chart/compare icon]
├─ Range selector: 1D 5D 1M 3M YTD 1Y 5Y All  [⤢ fullscreen]
├─ "Trade" — full-width white rounded button, bold black label
└─ Content tabs: Overview | News | Minds | Ideas  (selected = #282828 capsule, same chip
     style as watchlist tabs/category chips — this pill treatment is reused a fourth time)
```

Collapsed variant (S7, seen once a content tab is active/scrolled): header shrinks to one line —
`[icon] 336.25  −0.38%` then `AXP · NYSE [badges]` underneath, `•••` menu at far right — and the
Overview/News/Minds/Ideas tab row sits directly under it. The `•••` here opens a menu: Share, Notes,
Metrics (expandable: Financials/Documents/Technicals/Forecast/Seasonals/Options/Bonds/ETFs), and an About
block (Sector/Industry/CEO/Website/Headquarters/Founded/IPO date/ISIN/CUSIP/FIGI) — out of scope for the
watchlist rebuild but noted since it hangs off the same tap target.

### 2.7 S8/S9 — Chart's docked mini-watchlist & the transition into full Watchlist

While charting (S8), a partial watchlist strip is docked above the chart's drawing toolbar, showing the
next few symbols in the active list (TPR, SMP, VZ, DLB, TKO, XOM, MNQ2!) in the same row style as the full
Watchlist tab, just clipped to a few rows. Tapping the bottom tab bar's "Watchlist" icon expands this into
the full-screen Watchlist tab.

t-085 is a **mid-animation frame** of that expansion: the toolbar's `•••`/logo/`+` are present but the
tab-pill row is not yet in place, and a leftover gray "grabber" pill (from the docked strip's sheet
presentation) is still visible top-left. Two seconds later (t-086) everything has settled and the
CHRIS/SECTOR ETF/STEVEN tab row is fully rendered. **Do not model S9 as a distinct no-tabs watchlist
variant** — treat it as an interaction/animation detail (see §4).

---

## 3. Component anatomy (exact metrics)

### 3.1 Watchlist row — "3-line / extended-hours" variant (the CORE row type)

82pt total height. Verified on JNJ/TPR/DLB rows; row-to-row hairline spacing measured at a rock-solid
246px (=82pt) across 5 consecutive separators.

```
┌────────────────────────────────────────────────────────────┐  ← hairline (1px, #2C2C2C-#414141,
│  ╭──╮   JNJ                                       256.35   │     left-inset 16pt, flush right)
│  │J&J│  Johnson & Johnson              +0.53 +0.21%        │
│  ╰──╯   🌙 256.50 +0.15 +0.06%                              │
└────────────────────────────────────────────────────────────┘  ← next hairline
```

| Element | Position | Size | Font (est.) | Color |
|---|---|---|---|---|
| Row height | — | 82pt | — | — |
| Avatar icon | left 16pt inset, vertically centered on lines 1–2 (not the full row) | 36×36pt circle, perfect circle (bbox w=h) | — | per-brand fill (e.g. J&J red `#E81500` w/ white wordmark; company logos otherwise) |
| Ticker (line 1, left) | left 65pt inset (49pt gap after icon) | cap-height ≈12pt | **~17pt Bold/Semibold** | `#BDC2C6` |
| Price (line 1, right) | right-aligned, ~17.3pt inset from right edge | cap-height ≈12pt | **~17pt Bold/Semibold** (same size as ticker) | `#BDC2C6` |
| Name (line 2, left) | same left inset as ticker | cap-height ≈10.7pt | **~15pt Regular** | `#656565` |
| Day change $ + % (line 2, right) | right-aligned | cap-height ≈10.7pt | **~15pt Medium** | `#1EA089` green / `#F54655` red / `#BDC2C6` if exactly 0 |
| Extended-hours line (line 3) | left-aligned starting ~2pt right of icon's right edge (icon column width), moon glyph then price then Δ | moon glyph ~6×6.7pt; cap-height ≈9.3pt | **~13pt Regular** | moon `#2456FF`; price/Δ same white/green/red rule as lines 1–2, sized down |
| Vertical rhythm inside the row | top pad ~14pt → line1 ~12pt → gap ~11pt → line2 ~11pt → gap ~13pt → line3 ~9pt → bottom pad ~12pt | sums to 82pt | | |

Row anatomy generalizes as: **ticker+price share one type size/weight; name+change share a second,
smaller size; the optional extended-hours line uses a third, smallest size** — a strict 3-tier
typographic hierarchy, not just 2.

### 3.2 Watchlist row — "2-line" variant (no extended-hours data)

60pt total height (confirmed via hairlines flanking the MNQ2! row: 180px = 60pt). Used for instruments
without a separate extended/overnight quote (e.g. the MNQ2! futures row, and every search-result row,
§3.3). Same left/right insets and line-1/line-2 typography as the 3-line variant, just without line 3 and
with reduced top/bottom padding (proportionally: pad ~14pt / line1 ~12pt / gap ~11pt / line2 ~11pt / pad
~12pt ≈ 60pt).

A small dash "–" glyph sometimes sits immediately after the ticker (seen on "MNQ2! –") — read as a
session/flat-state indicator; exact meaning unconfirmed (see §6).

### 3.3 Search-result row (add-symbol sheet)

60pt total height (identical to the 2-line watchlist row — same underlying row template, different right
column content).

```
╭──╮  XAUUSD                          OANDA [●]      +
│🪙│  Gold                     commodity cfd
╰──╯
```

| Element | Position | Size | Color |
|---|---|---|---|
| Icon | left 16pt inset | 36pt circle (identical to watchlist row icon) | per-asset |
| Ticker | left 65pt inset | ~17pt Bold | `#BDC2C6` |
| Name/description (line 2) | same left inset | ~15pt Regular | `#656565`-ish |
| Exchange name | right-aligned, before badge | ~17pt Bold | `#BDC2C6` |
| Provider/session badge | small circle, ~10pt diameter, immediately right of exchange name | icon varies: check-mark badge (OANDA), globe (CME = 24h/international market) | badge bg dark blue |
| Category (line 2, right side) | under exchange name | ~15pt Regular | `#656565`-ish |
| Add button | far right, ~17.7×17.7pt `+` glyph, 19.3pt from right edge | plain glyph, no fill | `#D4D4D4` |
| Add button, "already added" state | same position | `✓` checkmark glyph replaces `+` | dimmer gray |

### 3.4 Watchlist tab-pill / category-chip (shared component, used 4×: watchlist tabs, search
category chips, preview-sheet content tabs, and the toast-adjacent "All" filter)

- Capsule shape, height 33pt, fully rounded ends (radius = half height)
- Active: fill `#262628`–`#282828`, label bold ~17pt `#D4D4D4`
- Inactive: no fill, label bold ~17pt `#808080`
- Horizontal gap between adjacent inactive labels: comfortably spaced, no fixed divider
- Long labels truncate mid-word with `…` rather than wrapping or shrinking

### 3.5 Section header label ("CORE HOLDINGS", "GOLD SILVER MINERS")

- All-caps, letter-spaced, ~13pt Bold
- Color `#808080`-ish (matches inactive-tab gray, not the dimmer `#656565` row-subtitle gray)
- Left inset 16pt (flush with row icon left edge)
- ~30pt gap above (from whatever precedes it), ~27pt gap below (to the first icon of the section)

### 3.6 Promo/dismissible banner card

- 68pt tall, 16pt side margins, rounded corners
- Dark slate/navy gradient fill with faint decorative line-art icon doodles
- Bold ~22pt heading + regular ~17pt subheading, left-aligned
- Right side: glowing pink-to-red heart graphic with the TradingView flag mark inset in white
- Small "×" dismiss control, top-right corner (~20pt tap target estimated)
- Appears once, above the first section, on this particular list — not confirmed whether it's
  per-list or global/app-level (see §6)

### 3.7 "+ Add symbol" footer row

- Appears once, after the last row of a list, before the empty tail space / bottom-nav
- Centered `+` glyph + "Add symbol" bold ~17pt label, `#D4D4D4`
- Not right/left aligned like data rows — the only centered row in the whole list

### 3.8 Bottom tab bar (persistent, all 5 states)

- Container: background `#090909`, separated from content by a 1px `#414141` hairline; extends
  through the home-indicator safe area (that safe-area strip stays pure black, no extra content)
- Icon row ~20pt tall icons, ~9pt gap, label row ~9pt tall text (~11pt Bold)
- 5 items, equally spaced: **Watchlist** (bookmark/ribbon glyph, **filled** — nearest SF Symbol
  `list.bullet.rectangle.fill`), **Chart** (diamond/rhombus brand-mark glyph with mini candlestick
  ticks inside, outline style; red notification dot ~5.7pt diameter top-right of the icon; no single
  SF Symbol match — custom mark, nearest generic stand-in `chart.bar.fill`), **Explore** (compass
  circle with a pen-nib needle, outline; nearest SF Symbol `safari`), **Community** (two overlapping
  person outlines; red notification dot also seen on this icon in some frames; SF Symbol
  `person.2`), **Menu** (3 horizontal lines; SF Symbol `line.3.horizontal`)
- **All 5 icons/labels render in the identical color `#D4D4D4`** — there is no accent-color highlight
  for the active tab. The only signal for "active" is glyph style (filled vs outline) on Watchlist;
  Chart/Explore/Community/Menu don't appear to have a distinct filled variant observed in these frames

### 3.9 Search field / category chip strip (add-symbol sheet)

- Search pill: 319pt wide (fills available width minus the Close button), 35pt tall, `#262628` fill,
  fully rounded, 🔍 icon + gray ~17pt placeholder + blinking cursor
- "Close": plain text button, bold `#D4D4D4`, no background, sits to the right of the pill
- Category chips: identical capsule component to §3.4, horizontally arranged, "All" pre-selected by
  default; observed set = All / Stocks / Funds / Futures / Forex (at least — row is wide enough to be
  horizontally scrollable, "Forex" is cut off at the frame edge)

---

## 4. Interactions inferred from consecutive frames

1. **`+` in the watchlist toolbar → add-symbol search sheet.** t-005 (plain CHRIS list) is directly
   followed by t-001-family frames (search sheet open, keyboard up, empty query, "All" results already
   populated with global top symbols) — the sheet opens with a non-empty default result set, not a blank
   state.
2. **Category chips filter the result set.** Inferred from the chip component design (identical to the
   watchlist tab-pill selection pattern) — not directly observed changing content between frames.
3. **Tapping a result row's `+` adds the symbol to the *currently active custom list*** and shows a
   toast: "✓ MNQ2! Added to "CHRIS"" (t-006). The row's own `+` glyph is replaced by a `✓` in the same
   position — this is the sheet's persistent "is this already in my list" indicator, it does not revert
   after the toast fades.
4. **Toast is centered, large, and dims the sheet behind it** — behaves like a blocking confirmation
   rather than a small inline snackbar; single-frame capture means duration/auto-dismiss can't be timed
   from this data.
5. **Tapping a row itself (not the `+`) opens the Symbol Quote Preview bottom sheet**, sliding up over
   whatever screen you were on (chart in this case) — confirmed via t-008 (MNQ2! preview) appearing right
   after the MNQ2! add flow, and again later for AXP (t-089) after scrolling the CHRIS-tab-adjacent list.
6. **The docked mini-watchlist strip on the chart screen (S8) is the same list/scroll-position as the
   full Watchlist tab** — tapping the bottom tab bar's "Watchlist" icon expands that strip into the full
   screen (S9 → settles into S1/S2 two seconds later). This means Watchlist and Chart share one
   "currently active symbol list + position" concept rather than being fully independent.
7. **Horizontal position across CHRIS/SECTOR ETF/STEVEN is presumed swipeable** (standard iOS segmented
   paging pattern for this pill-tab style) but no direct swipe-frame pair was captured; this is an
   inference from the component style, not a confirmed observation.
8. **Scrolling reveals sequential named sections** within one list (Core Holdings → Sector ETFs → Gold
   Silver Miners → Financials/Payments → Travel/Airlines, per t-005/007/086) — this is one long,
   manually organized watchlist with in-list group headers, not multiple separate lists.
9. **The promo banner has a dismiss control (`×`)** but no before/after pair was captured to confirm it
   disappears permanently vs. per-session.

---

## 5. Features list (every distinct product capability visible)

- Multiple **custom named watchlists** as a horizontally-arranged tab/pill selector (CHRIS, SECTOR ETF
  美国…, STEVEN) — names can be arbitrary length/script, truncate with ellipsis
- **In-list section grouping** with named, all-caps group headers inside a single watchlist (Core
  Holdings / Sector ETFs / Gold Silver Miners / etc.) — not just a flat symbol list
- **Global cross-asset-class symbol search** (Stocks/Funds/Futures/Forex/…) from a single `+` entry point,
  with a non-empty "browse" state before typing anything
- **Add-to-active-list** flow from search with inline `+` → `✓` state change and a confirmation toast
  naming the destination list by name
- **Dual quote lines per row**: the official/day-session change *and* an independent extended-hours
  (pre/post-market or overnight) change with its own sign/color and a moon glyph — shown only for
  instruments that have a meaningful distinction (not shown for the always-on futures row)
- **Per-row data-delay badge** ("D") distinguishing delayed-data symbols within an otherwise-live list
- **Exchange/venue badges** in search results distinguishing verified/流通 feeds (checkmark) vs.
  international/continuous markets (globe)
- **Dismissible in-app promo/marketing banner** injected at the top of a watchlist's content
- **"Add symbol" affordance** repeated as a footer row at the bottom of every list (in addition to the
  toolbar `+`), always centered
- **Docked mini-watchlist strip while charting** — lets you jump between watchlist symbols without
  leaving the chart, and is the same underlying list as the full Watchlist tab
- **Symbol quote preview bottom sheet** as the universal tap target from any row (watchlist row or
  search result), including its own mini chart, quick range selector, a "Trade" CTA, and
  Overview/News/Minds/Ideas sub-tabs
- **Custom scroll indicator** (thin light-gray thumb, right edge) visible during active scrolling
- **Monochrome bottom tab bar** — no accent-color "selected" state, only glyph-style differences, plus
  small red badge dots for unread Chart/Community content
- **Notes/Metrics/Financials/Forecast/Seasonals/Options/Bonds/ETFs/About** deep-dive menu hanging off the
  quote preview sheet's `•••` (out of scope for the watchlist itself, but it's what a row ultimately leads
  to)

---

## 6. Open questions (need live interaction with the real app to resolve)

1. What does the toolbar **`•••` (top-left)** open from the Watchlist tab? Never tapped in these frames —
   presumably watchlist management (rename/reorder/create/delete lists), but unconfirmed.
2. Is there a **swipe-to-delete / long-press-to-reorder** gesture on watchlist rows? Not observed in any
   frame pair.
3. Does the **CHRIS/SECTOR ETF/STEVEN tab row scroll horizontally** if more lists exist, or is 3 the
   practical max before it wraps/overflows? No overflow affordance (fade edge, chevron) was visible.
4. Exact **toast auto-dismiss duration** and whether it's tappable/swipeable to dismiss early.
5. Is the **"Love our app?" promo banner** scoped per-list, per-account, or global-app, and does
   dismissing it persist across app restarts?
6. Meaning of the **small dash glyph after "MNQ2!"** in the 2-line row variant (session/flat-state marker?
   liquidity marker?) — not seen on any other row in this capture.
7. Does the **extended-hours line ever show for equities outside of market hours in a materially
   different visual state** (e.g. bolded when the extended session is "live" vs. dimmed when it's stale)?
   All captured examples are essentially equivalent in weight.
8. What is the **exact provider-badge iconography** rule — when is it a checkmark vs. a globe vs. absent
   entirely? Only two examples were captured (OANDA, CME).
9. Corner radius of the promo banner card and the modal sheet's top corners — visually ~10-16pt but not
   independently confirmed against a curvature model.
