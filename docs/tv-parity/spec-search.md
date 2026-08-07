# TradingView iOS — "Search" Surface — Pixel Spec

Device: iPhone 16 Pro simulator/hardware capture, 1206×2622px @3x = **402×874pt**.
All coordinates below are in **pt** (px ÷ 3), measured with PIL pixel sampling against the
source frames, not eyeballed. Colors are sampled hex values (some are anti-aliased text pixels —
where noted, "max" is the brightest pixel found in a glyph mask, which is a very close proxy for
true fill color on a dark background).

Source frames actually inspected (see §6 for a labeling discrepancy found in the supplied frame
descriptions):

| file | what it actually shows |
|---|---|
| `IMG_2285.PNG` | **Compare Symbols** sheet — recent-symbols list, NVDA row selected (compare mode) |
| `t-001.png` | **Add-Symbol search** sheet over a Watchlist, "All" tab, keyboard up, empty query, default result list (XAUUSD, MNQ1!…) |
| `t-002.png` | Same search sheet, **+ an iOS system notification banner** (X/Twitter repost) overlaid at top — not TradingView UI |
| `t-003.png` | Same search sheet, banner gone, list scrolled ~1px (effectively identical to t-001/t-004) |
| `t-004.png` | Same search sheet, full 6-row result set fully visible (XAUUSD, MNQ1!, MNQ2!, MNQU2026, MNQZ2026, MNQH2027) |
| `t-005.png` | **Not a search screen** — this is the Watchlist ("CHRIS" tab) top, "Core Holdings" section. The search sheet has been dismissed. |
| `t-007.png` | **Not a search screen** — Watchlist ("CHRIS" tab) scrolled further down to a "GOLD SILVER MINERS" section. No toast visible in this frame. |

The supplied captions for t-005/t-007 describe a "search results / added-to-watchlist toast"
state that is **not what these two files actually contain** — I verified this by opening every
file with the Read tool rather than trusting the filename captions. §6 (open questions) covers
what this implies about the missing toast frame.

---

## 1. Surface inventory

1. **Compare Symbols sheet** — invoked from the Chart toolbar (add a symbol overlay / compare).
   Bottom tab bar remains visible underneath → this is a partial-height sheet, not a full-screen
   cover.
2. **Add-Symbol search sheet** — invoked from a Watchlist (the "+" add-symbol flow). Presented
   full-screen-over-full-screen with the system keyboard docked; a sliver of the presenting
   Watchlist (rounded top corners) peeks above it, confirming a standard iOS card-style modal
   presentation.
3. **(Context, not search) Watchlist tab screen** — "CHRIS / SECTOR ETF 美国… / STEVEN" watchlist
   picker + grouped holdings list. Included only because t-005/t-007 land here; full spec of this
   screen is out of scope for this document.
4. **(Chrome, not app UI) iOS system notification banner** — X/Twitter repost banner in t-002,
   rendered by iOS over the app. Documented briefly for completeness, excluded from the SwiftUI
   rebuild.
5. **(Chrome, not app UI) System keyboard** — standard iOS dark QWERTY keyboard with `123`,
   emoji, dictation mic and globe (keyboard-switcher) keys. Not custom to TradingView.

---

## 2. Layout trees

### 2.1 Compare Symbols sheet (`IMG_2285.PNG`)

Overall: partial-height sheet, own background **pure black `#000000`**, tab bar of the host app
visible beneath it (i.e. this is a bottom-sheet-style presentation, not a full cover).

```
Status bar (0–59pt)                          — standard iOS status bar, not app UI
┌─ Sheet header ───────────────────────────────────────────────────────────
│ "Compare symbols"  title          x:20→~121(bbox)   y:88.3–103pt
│ "×" close glyph                    x:360.7–375       y:88.7–103pt
├─ Search field (outline style) ────────────────────────────────────────────
│ rounded-rect stroke only, transparent/black fill
│ box: x:20–381.7pt, y:130–169.7pt (height ≈ 40pt, radius = height/2 = 20pt, capsule)
│ 🔍 icon + "Symbol, ISIN, or CUSIP" placeholder, left-aligned inside, ~17pt regular
├─ "RECENT SYMBOLS" section label ──────────────────────────────────────────
│ x:21–121.7pt, y:198–206pt (8pt cap height, all-caps, tracked)
├─ Recent-symbols list (elevated container, full-bleed, bg #1F1F1F) ───────
│  y:218 → 738pt, 10 rows × 52pt, 1px hairline (#3D3D3D) between rows
│  row 4 (NVDA) has a 2pt "#F2F2F2" selection border, full-bleed x:0–402pt
└─ (sheet ends ~780pt; below that, host app's tab bar shows through) ───────
Tab bar (Watchlist / Chart / Explore / Community / Menu), y ≈ 782–874pt
```

**Header detail**

| Element | Position (pt) | Size | Font / color |
|---|---|---|---|
| Title "Compare symbols" | left 20, baseline band y 88.3–103 | cap-height 14.7pt → ≈22pt | Bold, `#DBDBDB` (off-white, iOS `label` in dark mode) |
| Close "×" | bbox x 360.7–375, y 88.7–103 | glyph ≈14.3×14.3pt (SF Symbol `xmark`, ~18pt weight regular/medium) | `#DBDBDB`-ish gray-white |
| Search field box | x 20–381.7, y 130–169.7 | 361.7×39.7pt, capsule, 1pt stroke ~`#5C5C5C` | transparent fill (shows sheet's black bg through it) |
| Placeholder "Symbol, ISIN, or CUSIP" | inset ~20pt from box left | cap+descender 15.3pt → ≈17pt | Regular, `#8C8C8C`-ish gray |
| 🔍 icon | left-inset inside field | ~18pt | gray, matches placeholder |
| "RECENT SYMBOLS" | x 21–121.7, y 198–206 | cap 8pt → ≈11pt | Semibold, uppercase, letter-spaced, `#8C8C8C` (`#8C8C8C` = max sampled 140,140,140) |

**Row anatomy (measured on row 1 "000660 / SK hynix Inc." and row 4 "NVDA")**

| Element | Geometry | Typography / color |
|---|---|---|
| Row | height **52pt**, full-bleed (no side margin at container level) | bg `#1F1F1F`; 1px hairline `#3D3D3D` between rows |
| Logo avatar | circle, **24×24pt**, left edge x=20, vertically centered (top pad 14pt / bottom pad 14pt) | raster company/asset logo image, white circular backdrop for icon-style logos |
| Symbol (ticker) | x starts 53, first line, y row-top+11.3→+23 (11.7pt cap-height) | **≈17pt Bold**, `#DBDBDB` |
| Subtitle (company name) | x starts 53 (same left edge), y row-top+32.7→+44 | **≈14–15pt Regular**, `#8C8C8C`; single line, truncates with no visible ellipsis at this width in samples shown |
| Exchange (e.g. "KRX") | right-aligned, right edge x=353, same y-band as symbol | **≈17pt Bold**, `#DBDBDB` |
| Category (e.g. "stock"/"dr") | right-aligned, right edge x=353, same y-band as subtitle | **≈14–15pt Regular**, `#8C8C8C` |
| Country/exchange flag | circle **18×18pt**, right edge x≈380.7, vertically centered at row center | raster flag image in circular mask |
| Selection border (compare-armed row only) | full-bleed rect x:0→402, y flush to row top/bottom (373.5–424) | **2pt stroke**, `#F2F2F2`-ish, square/near-square corners, drawn OVER the row (row bg `#1F1F1F` still visible inside) |

Left inset for icon = **20pt**; icon→text gap = **9pt** (icon right edge 44 → text left edge 53).
Right margin from flag/text column to screen edge ≈ **20–21pt**, symmetric with the 20pt left
inset — this 20pt margin is the master horizontal padding for the whole sheet.

---

### 2.2 Add-Symbol search sheet (`t-001`–`t-004`)

Overall: near-full-screen modal, own background **`#1A191C`** (a warm-tinted dark elevated gray,
NOT pure black — this is the key hierarchy difference vs. the Compare Symbols sheet, which sits
directly on `#000000`). A thin sliver of the presenting Watchlist (rounded top corners, slightly
different tone `#141316`–`#26252... `) peeks above the sheet, standard iOS layered-card modal
chrome — not custom UI, don't rebuild it pixel-for-pixel, just use a system `.sheet`/full-cover
presentation.

```
Status bar (0–59pt)
┌─ peeking parent sheet corner (system chrome, ~59–90pt) ───────────────────
├─ Search field (filled capsule) ───────────────────────────────────────────
│ box: x 16(rounded)/20(flat)–338(rounded)/335(flat), y 90.7–126.7 (36pt tall, capsule, r=18)
│ fill #262528–#282828 (flat, no stroke)
│ 🔍 icon x≈24–38, cursor "|" caret ≈x48-51 (gray #D4D4D4, NOT tinted blue)
│ placeholder "Use = to do math" from x≈57, ≈17pt regular, gray #808080
│ "Close" text button, x 342–385.3, y 102.3–115, ≈17–18pt, white #FFFFFF
├─ Category tabs (segmented, single row, horizontally scrollable) ─────────
│ pill "All" (selected): fill #282828, x 15–62.7, y 146–179.3 (47.7×33.3pt capsule)
│  "All" label: white #D4D4D4, centered in pill
│ "Stocks" "Funds" "Futures" "Forex…" (unselected): gray #7F7F7F, ≈16–17pt Bold
│  same y-band (cap 156–168.7), left-aligned starting x≈86.7, "Forex" clipped at right edge (more tabs likely scroll off-screen)
├─ Result rows (flat list, NO elevated row bg — same #1A191C as sheet) ────
│  row height 60pt, hairline #414141 1px between rows
│  row 1 = XAUUSD/Gold/OANDA/commodity cfd  (y 188–248)
│  row 2 = MNQ1!/Micro E-mini Nasdaq-100 Ind…/CME/futures (y 248–308)
│  … 6 rows visible total in t-004 (XAUUSD, MNQ1!, MNQ2!, MNQU2026, MNQZ2026, MNQH2027)
└─ System keyboard (QWERTY, dark) docked at bottom, no tab bar visible ─────
```

**Row anatomy (measured on row 1 "XAUUSD / Gold / OANDA / commodity cfd")**

| Element | Geometry | Typography / color |
|---|---|---|
| Row | height **60pt**, full-bleed | bg = sheet bg `#1A191C` (flat — no separate elevated row surface here) |
| Logo avatar | circle **36×36pt**, left edge x=16, right edge x=52, vertically centered in row | raster asset icon (e.g. gold-bars glyph on solid gold-brown circle `~#CF8D00`) |
| Symbol | x 65–135, y 200.7–213 (12.3pt cap) | **≈17pt Bold**, pure white `#FFFFFF` |
| Subtitle | x 64.7–95.7, y 222–233.3 | **≈14–15pt Regular**, gray `#858585` |
| Exchange (e.g. "OANDA"/"CME") | right-aligned, right edge x=333, same y-band as symbol | **≈17pt Bold**, white |
| Verification/type badge | circle **18×18pt**, left edge ≈328 (right after exchange text), vertically centered | OANDA: navy `#001E41` fill + white checkmark glyph ("verified/streaming" indicator). CME: navy-blue `#132640` fill + light-blue `#2F96C9` globe glyph ("exchange/futures" indicator) |
| Category (e.g. "commodity cfd"/"futures") | right-aligned, right edge x=333, same y-band as subtitle | **≈14–15pt Regular**, gray |
| "+" add button | glyph bbox **18×18pt**, x 365–383, vertically centered at row center | SF Symbol `plus`, light gray `#D5D5D5` (NOT white, NOT tinted) |

Left inset = 16pt (icon), icon→text gap ≈13pt, right margin to "+" glyph ≈19pt from screen edge —
same master ~20pt horizontal rhythm as the Compare Symbols sheet, just with a bigger (36pt vs
24pt) avatar and taller (60pt vs 52pt) row to make room for the badge.

**Vertical rhythm (top of sheet)**

| Gap | pt |
|---|---|
| status bar bottom (59) → search box top (90.7) | 31.7 |
| search box bottom (126.7) → tab pill top (146) | 19.3 |
| tab pill bottom (179.3) → row 1 icon top (200) | 20.7 |
| (no hairline between tabs and row 1 — divider only appears between subsequent rows) | — |

---

## 3. Component anatomy — reusable primitives

### 3.1 Search field — two competing styles observed
- **Outline/ghost style** (Compare Symbols): capsule, 1pt stroke ~`#5C5C5C`, transparent fill,
  height ≈40pt.
- **Filled style** (Add-Symbol): capsule, no stroke, fill `#262528`–`#282828`, height 36pt.
- Both: leading 🔍 (`magnifyingglass`, gray), placeholder ≈17pt regular gray, both support a
  blinking text caret rendered in flat gray (not the system accent/blue).
- Trailing dismiss control differs: Compare Symbols uses an "×" (`xmark`) icon top-right of the
  whole sheet (not inside the field); Add-Symbol uses a text "Close" button to the right of the
  field itself.
- Add-Symbol's placeholder literally reads **"Use = to do math"** — the search field doubles as
  an inline calculator (feature, see §5).

### 3.2 Category filter tabs (Add-Symbol sheet only; not present on Compare Symbols)
- Single-row, horizontally scrollable (content clipped at "Forex", implying more categories
  scroll off — TradingView's usual set also includes Crypto/Indices/Bonds/Economy, unconfirmed
  here).
- Selected tab = capsule pill, fill `#282828` (same token as the filled search field), label
  white `#D4D4D4`.
- Unselected tabs = plain text, no background, gray `#7F7F7F`.
- All tab labels ≈16–17pt Bold, cap-height measured 12.7pt.
- Pill height 33.3pt, horizontal pill padding ≈15pt each side around "All" text.

### 3.3 Result / recent-symbol row — two variants
| | Compare Symbols row | Add-Symbol row |
|---|---|---|
| Height | 52pt | 60pt |
| Row background | elevated `#1F1F1F` on black sheet | flat, same as sheet `#1A191C` |
| Avatar | 24pt circle | 36pt circle |
| Left inset | 20pt | 16pt |
| Symbol color | `#DBDBDB` | `#FFFFFF` (brighter) |
| Trailing accessory | country flag (18pt circle) | verification/exchange badge (18pt circle) + "+" add button (18pt glyph) |
| Selection affordance | 2pt full-bleed border when armed for compare | none seen (tap presumably adds + dismisses) |
| Divider | 1px `#3D3D3D` | 1px `#414141` |

Both rows share the same two-line-left / two-line-right text grid: bold primary line, gray
secondary line, secondary line right-aligned to match primary line's right edge.

### 3.4 Buttons
- **Close "×"** (Compare Symbols): SF Symbol `xmark`, ~14.3×14.3pt visible glyph, gray-white,
  top-right of sheet header.
- **"Close" text** (Add-Symbol): plain text button, white, ~17–18pt, right of search field.
- **"+" add** (Add-Symbol row): SF Symbol `plus`, 18×18pt, light gray `#D5D5D5`, right edge of row,
  minimum ~44×44pt tap target implied (glyph itself is small, tap area extends to row bounds).

### 3.5 Section header
- "RECENT SYMBOLS" (Compare Symbols only): all-caps, tracked, ≈11pt Semibold, gray `#8C8C8C`,
  20pt left inset matching the sheet's master margin. Add-Symbol sheet has **no equivalent
  header** above its default result list (no "Recent" or "Suggested" label visible) — its list
  appears to be a live/default query result, not a labeled recents section.

### 3.6 Persistent bottom tab bar (context, visible under Compare Symbols only)
5 equal-width segments (402/5 = 80.4pt each): **Watchlist** (bookmark glyph), **Chart** (TV
diamond glyph + red unread dot, ~6pt diameter, top-right of icon), **Explore** (compass glyph),
**Community** (two-person glyph), **Menu** (3-line hamburger). Icons ≈28pt, label ≈13pt Bold
white, 1px hairline separates the bar from content above it.

---

## 4. Interactions inferred from consecutive frames

- **IMG_2285** is a single still (not part of the t-NNN sequence) showing a mid-flow state: NVDA
  is already selected (bordered) while the sheet is still open — confirms Compare Symbols supports
  tapping additional rows to arm/disarm them for the chart overlay without closing the sheet (the
  border is a toggled selection state, not a momentary press state).
- **t-001 → t-002 → t-003 → t-004**: identical search sheet content and scroll position across all
  four frames (8 seconds of real time) — the only change is an iOS system notification banner
  appearing in t-002 and disappearing again by t-003. This means the user was idle on the default
  (empty-query) result list for several seconds; it is **not** evidence of a scroll or tab-switch
  interaction. The default list order (XAUUSD, MNQ1!, MNQ2!, MNQU2026, MNQZ2026, MNQH2027) is
  stable, suggesting it's a fixed "trending/suggested" set rather than personalized recents (no
  section header, unlike Compare Symbols' explicit "RECENT SYMBOLS").
- **t-004 → t-005**: the search sheet is fully gone and the Watchlist ("CHRIS" tab, "Core
  Holdings" section, "Love our app?" promo banner) is showing instead. Two seconds apart implies
  either (a) the user tapped "Close", or (b) tapped a row's "+" which both added the symbol and
  auto-dismissed the sheet back to the watchlist it was launched from. Given the row's "+" button
  exists specifically to add-without-navigating-away, (b) is the more consistent reading with the
  captioned "MNQ2 added to CHRIS watchlist" toast — even though that toast is not visible in the
  frame we captured (see open questions).
- **t-005 → t-007**: same Watchlist, scrolled further down past "Core Holdings" into a "GOLD
  SILVER MINERS" grouped section (XLC/XLY/XLI/XLE/XLB/XLRE/GDX) — an ordinary scroll, unrelated to
  search.
- Overall funnel implied: **Watchlist → tap "+" → Add-Symbol search sheet (full-screen,
  keyboard-up) → tap a result's "+" → sheet auto-dismisses → toast confirms addition → back on
  Watchlist, newly-added symbol presumably appended to the active list.**
- Compare Symbols funnel (separate entry point, likely from the Chart screen's compare/overlay
  tool): **tap compare → partial-height sheet with recents → tap a row → row becomes bordered
  (armed) → (presumably) tap again to add to chart / close** — not captured to completion in the
  supplied frames.

---

## 5. Features list (product capabilities visible)

- **Universal symbol search** across asset classes, filterable by category tab: All / Stocks /
  Funds / Futures / Forex (+ likely more, scrolled off-screen).
- **Inline calculator in search** — placeholder literally instructs "Use = to do math" (evaluate
  expressions from the search bar, a distinct TradingView feature beyond symbol lookup).
- **Recent symbols list** (Compare Symbols sheet), separate from the Add-Symbol sheet's default
  (unlabeled) suggested-results list.
- **Compare / overlay symbols on a chart** — multi-select rows (bordered/armed state) rather than
  single-tap-navigate.
- **Search by Symbol, ISIN, or CUSIP** (placeholder text on the Compare sheet) — beyond ticker
  search.
- **Add symbol directly to a specific watchlist** from search results via a per-row "+" button,
  with (implied) toast confirmation naming the destination watchlist ("MNQ2 added to CHRIS
  watchlist").
- **Per-result metadata density**: exchange, instrument type/category (stock/fund/futures
  contract month/commodity CFD/depositary-receipt "dr"), country flag, and a
  verification/data-feed badge (checkmark for a retail broker feed like OANDA, globe for an
  exchange like CME) — all surfaced directly in the row without opening the symbol.
- **Futures contract-month disambiguation** — continuous contracts (MNQ1!, MNQ2!) alongside
  explicit dated contracts (MNQU2026 "Sep 2026", MNQZ2026 "Dec 2026", MNQH2027 "Mar 2027") appear
  side-by-side in one flat result list.
- **Multiple simultaneous watchlists** with a horizontal picker (CHRIS / SECTOR ETF 美国… /
  STEVEN) — visible in the post-search context, relevant to where "add to watchlist" lands.
- **Social/community repost surfacing as a system push notification** (seen in t-002) — not a
  search feature, but shows TradingView pushes community content (X/Twitter reposts of trader
  commentary, e.g. a "@grok" account) as OS-level notifications even while mid-search.
- **Session/quote duality on the Watchlist** (visible in t-005/t-007, context only): each holding
  shows a live price + change, and a secondary moon-icon "after hours"/overnight price + change
  line beneath it.

---

## 6. Open questions (need live interaction to resolve)

1. **The actual "added to watchlist" toast** described in the t-007 caption was not present in
   either t-005 or t-007 as supplied — both show a plain scrolled Watchlist with no toast/snackbar
   visible. Either the toast appeared and disappeared entirely within the 2-second gap between
   captured frames, or the supplied frame numbering/description doesn't line up with the actual
   files (I flagged this rather than inventing a toast design). **Needs a live capture of the
   exact moment "+" is tapped** to spec the toast's position, duration, colors, and copy exactly.
2. Full list of category tabs beyond "All / Stocks / Funds / Futures / Forex…" (Crypto? Indices?
   Bonds? Economy?) is not confirmed — "Forex" is clipped at the right edge in every frame we have.
3. Whether tapping a row in the **Add-Symbol** sheet body (not the "+") navigates directly to the
   symbol/chart, vs. only the "+" adds-to-watchlist — not exercised in these frames.
4. Whether the Compare Symbols selection border toggles off on a second tap, and what completes
   the compare flow (a confirm button below the fold? swipe-down to apply?) — sheet bottom beyond
   y≈780pt was never shown mid-interaction.
5. Truncation behavior for the Add-Symbol sheet's subtitle: t-001 shows literal "…" ellipsis
   ("Micro E-mini Nasdaq-100 Ind…"), but only single-line — unconfirmed whether long instrument
   names ever wrap.
6. Exact corner radius of the sheet's own top corners (system default, estimated 12–16pt, not
   independently confirmed against Apple's `UISheetPresentationController` defaults for this iOS
   version).
7. Dark-mode-only confirmed — no light-mode frame supplied for either search surface, so the
   light-theme palette for these two screens is unspecified.
