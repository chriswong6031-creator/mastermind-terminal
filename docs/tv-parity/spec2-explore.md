# spec2-explore.md — TradingView iOS "Explore" tab

**Single reference screenshot:** `tvzip-flat/z-015.png` (1206×2622 px @3x = 402×874 pt,
lossless PNG). This tab had **zero coverage in pass 1** — everything below is derived
fresh from this one frame. Where a pass-1 `TV_PARITY_MASTER_SPEC.md` token is confirmed
by measurement here, I say "match." Where my pixel measurement disagrees, I say so
explicitly and give the raw evidence rather than silently adopting either number.

All pixel coordinates below are **raw @3x pixel values from `z-015.png`**; pt = px ÷ 3.
Crops referenced (all under `tvspec/explore_crops/`) were generated with PIL for this
pass and are not separately delivered — they exist only to support the measurements
below.

---

## 0. Capture caveat — read this before trusting the top ~150px

The top of the frame (y 0–~180px, ~0–60pt) is **not TradingView UI**. It is the
control chrome of whatever screen-mirroring/casting tool produced this capture:

- A wide pill (not a Dynamic-Island shape) containing a green circular glyph
  (mirroring/cast icon).
- A separate circular app icon (gradient "Heyan"-labelled artwork) — a third-party
  screen-mirroring app's own icon, sitting where iOS would show nothing.
- A Wi-Fi glyph and a **green rounded "37⚡" badge** standing in for the normal iOS
  battery indicator.

This matches the standing memory note that these captures come from a **mirroring
pipeline** ("Mirror can't flick wheel-pickers"). Consequences for this spec:

- **The real iOS status bar (time/signal/Wi-Fi/battery) for the Explore tab is
  unverified** — it's obscured by mirroring chrome, not literally absent from the
  app. Assume standard iOS status bar and do not build anything from the pixels
  in that band.
- Fine hairline widths measured elsewhere in this frame (§3, card divider) may be
  thinned by the mirroring pipeline's own scaling/resampling. I flag every such
  measurement individually below rather than asserting a new global hairline token.
- Everything from y≈180px down (the search glyph onward) reads as genuine app
  content and is measured normally.

---

## 1. Surface inventory

Only **one surface** is visible in this capture: the Explore tab root, at rest,
scrolled to the top, "Stocks" implicitly the first category pill. No sheet, no
scrolled state, no tapped/selected state, no second screenshot to cross-check
against. Everything under §6 that depends on a second state is an open question.

Inferred-but-unconfirmed destinations (icons/rows imply a target, but no capture
shows the pushed screen): News list, Calendar, Brokers directory, a per-category
markets screen (tap a pill), a per-index detail/quote screen (tap a card), a full
News list (tap "Top Stories" chevron or any headline row).

---

## 2. Top-to-bottom layout tree

Page background is **pure `#000000` (`tvBlack`)** edge-to-edge — confirmed by direct
sample at multiple empty points (e.g. `(300,460)` between action buttons → `(0,0,0)`).
No separate nav-bar surface; the title and controls float directly on the black
canvas, consistent with the master spec's "black full-screen page" tier.

| Element | y-range (px @3x) | Height | Notes |
|---|---|---|---|
| *(mirroring chrome — ignore)* | 0–180 | — | §0 |
| Search glyph | 205–263 | 58px / 19.3pt | top-right |
| "Explore" title | 337–408 (cap) | 71px cap / 23.7pt | large title |
| News / Calendar / Brokers buttons | 481–672 | 191px / 63.7pt | 3 fixed columns |
| Category pill row | 722–816 | 94px / 31.3pt | horizontally scrollable |
| Index-card grid, row 1 | ~893–1218 | ~310px / 103.3pt | horizontally scrollable, 2 rows move together |
| Index-card grid, row 2 | ~1290–1614 | ~310px / 103.3pt | same column widths as row 1 |
| "Top Stories" header | 1739–1796 (+chevron) | 57px / 19pt | chevron → full news list |
| News row 1 (META) | 1874–2119 | variable (3-line headline) | avatar+timestamp+headline |
| News row 2 (MSFT) | 2231–2622 (cut off) | variable | same anatomy, truncated by viewport |
| Tab bar hairline | 2373 | 1px | see §3.9 caveat |
| Tab bar | 2374–2622 | 249px / **83pt** | matches master token exactly |

### 2.1 Search glyph
- Bounding box x 1087–1145, y 205–263 → **58×58px ≈ 19.3×19.3pt**, bare
  `magnifyingglass`, no button chrome, colour `#DBDBDB` (`tvText`).
- Right inset from screen edge: 1206–1145 = 61px = **20.3pt** ≈ matches master's
  20pt black-page margin for this one element specifically (contrast with §2.2 —
  everything else on this page uses 16pt, see below).
- No visible search *field* — this is icon-only, presumably pushing a dedicated
  search screen. Not the same component as `TVSearchField`.

### 2.2 "Explore" title
- Capital "E" ink band y 337–408 = **71px cap-height = 23.67pt**.
- Converting at the master's own 0.705 cap-ratio: 23.67 ÷ 0.705 ≈ **33.6pt → 34pt**.
- Cross-check: "Top Stories" (§2.7) capital "T" measures 41px/13.67pt cap-height →
  34pt-title/20pt-header ink ratio predicts 20 × (71/41) = 34.6pt. Both paths land
  on **34pt**, which is exactly iOS's stock `UINavigationBar` **large-title** size —
  this reads as the system large title, not the master's 20pt custom sheet-title
  token. ⚠️ **New finding, not in master spec**: tab-root pages apparently use the
  *system* 34pt large title, distinct from the 20pt custom title used on sheets.
- Weight: visually much heavier/blockier than plain SF Pro Bold — thick, slightly
  condensed strokes (see `title_zoom.png`). Read as **Heavy/Black**, not Bold.
  Possibly a custom display cut; flagged open in §6.
- Colour: `(219,219,219)` = **`#DBDBDB` (`tvText`)** exact match, not pure white.
- Left edge of "E": x=53px=17.7pt. See §2.2a on margins.
- Gap from search glyph bottom (263) to title cap-top (337): 74px = **24.7pt**.

### 2.2a Margin correction vs. master spec
Master §1.4 states black full-screen pages use a **20pt** side inset. Measured
across every left-aligned element on this specific page:

| Element | Left edge (px) | pt |
|---|---|---|
| "Explore" title ("E") | 53 | 17.7 |
| News/Calendar/Brokers row | 48 | **16.0** |
| Category pill row | 52 | 17.3 |
| Index-card grid | 48 | **16.0** |
| News-row avatar | 49 | 16.3 |

The title's apparent 17.7pt is glyph side-bearing noise around a true **16pt**
frame edge (confirmed by the two hard geometric measurements — button row and card
grid both land on exactly 48px). **Correction: the Explore tab root uses the 16pt
"tool-sheet" margin, not the 20pt margin master's §1.4 assigns to black full-screen
pages.** Right margin cross-checks the same figure: the non-scrolling button row's
right edge sits at 1206−1157=49px=16.3pt, matching the left side.

---

## 3. Component anatomy

### 3.1 News / Calendar / Brokers action row
Three fixed (non-scrolling) equal-width square buttons — the only row on this page
confirmed NOT horizontally scrollable (3×117.7pt + 2×8.3pt gutters + 2×16pt margins
already sums to the full 402pt width, no partial 4th button peeks at the edge).

- **Button box:** 353px × 191px = **117.7pt × 63.7pt**, fill flat `(46,46,46)` =
  **`#2E2E2E`** — this is the master's `tvPill` token (§1.1), previously documented
  only for "segmented-pill/chip/capsule fill on symbol-detail surfaces." **New
  usage confirmed:** also used for large square action tiles directly on a
  `tvBlack` tab-root page, not only inside a sheet/detail surface.
- **Gutter** between buttons: 25px = **8.3pt** (button1 right 401 → button2 left
  426), matching the master's `s2`/2-col-gutter token (8.3pt) exactly, reused here
  for a 3-up row.
- **Corner radius:** curve spans ~30px vertically / ~45px horizontally from the
  measured top-left inflection — asymmetric, consistent with an iOS `.continuous`
  (squircle) corner rather than a true circular arc. Nominal radius ≈ **10–12pt**
  continuous; can't resolve to a single exact figure from a raster corner alone.
- **Icon:** bbox 62×58px ≈ **20.7×19.3pt**, centred horizontally in the button,
  top inset from button top ≈ 36px = **12pt**. Colour `#DBDBDB`.
- **Label:** "News"/"Calendar"/"Brokers", ink height 28px = 9.33pt →
  **≈13–14pt Bold**, `#DBDBDB`, centred, ~12pt gap below icon, ~11pt bottom pad.
  ⚠️ See §3.3 disagreement note — this ink is identical to the pill-row ink and
  notably smaller than the master's 17pt `TVChip` label token.

### 3.2 Category pill row (Stocks / Crypto / Futures / Forex / Bonds / …)
Horizontally scrollable. Visible: **Stocks, Crypto, Futures, Forex, Bonds**, plus
25px (8.3pt) of a **6th pill clipped at the right screen edge** — confirms more
categories exist off-screen (partially resolves master's open question A7, though
the 6th name itself is still unread).

- **Pill fill:** flat `(46,46,46)` = **`#2E2E2E`**, same `tvPill` token as §3.1.
- **Pill height:** fill band 722–816px = 94px ≈ **31.3pt** (master's `TVChip`
  token says 33pt — within measurement tolerance, no real disagreement).
- **Capsule shape**, no border.
- **Gutter between pills:** consistently **33px = 11.0pt** (Stocks→Crypto,
  Crypto→Futures, Futures→Forex, Forex→Bonds, Bonds→6th, all identical to the
  pixel). Not quite master's 8.3/9pt gutter tokens — a distinct, slightly larger
  gap specific to this chip row.
- **No selection tint of any kind was observed** — "Stocks" (the presumed default/
  active category, since the cards below are all indices) renders in the exact
  same `#2E2E2E` fill as every other pill, at every y sampled. Either (a) this
  chip row genuinely carries no persistent selection state (each is a one-shot
  navigation trigger, not a filter toggle), or (b) selection is shown some other
  way this static frame doesn't capture. Flagged in §6.
- **Label ink:** "Stocks" full-word bbox height 30px = 10pt → **≈14pt Bold**,
  `#DBDBDB`. ⚠️ **Disagreement with master's `TVChip` token** (§2.4: 17pt Bold,
  ink 12.7pt). Measured ink here (10pt) and in the action-row labels (9.33pt,
  §3.1) both independently converge on ~13–14pt, not 17pt. Either this specific
  screen uses a smaller type step than the Watchlist tab chips master measured,
  or master's 17pt figure should be revisited. I'm reporting both measurements
  rather than picking a winner — recommend a same-pipeline re-measure of both
  screens before deciding.

### 3.3 Index-card grid ("Markets overview" carousel)
**Not a static 2-column grid** — it is a **2-row × N-column horizontally-scrolling
carousel**. Evidence: two full rows are visible simultaneously (S&P 500/Dow 30/
Nasdaq-Composite-partial on row 1; Nasdaq 100/US 2000/NYSE-partial on row 2), and
the 3rd column is identically clipped at the same x in both rows — a 2D grid that
pans together, not two independent single-row carousels.

**Cards are borderless.** There is **no enclosing rounded-rect border and no fill
panel** — confirmed by scanning the flat top edge of a card (x=272, y 880–915):
pure `(0,0,0)` the entire way, no stroke at any brightness. What looks like a
card "edge" is only the **vertical divider between columns** (see below); cards
have no drawn top or bottom edge and no background fill distinct from the page.

- **Card content width:** 449px = **149.7pt**. Two cards + one internal gutter
  measured edge-to-edge: 48→497 (card1), 522→971 (card2) — both exactly 449px.
- **Column gutter:** 25px = **8.3pt** — exactly the master's 2-col tile gutter
  token, reused here for a scrolling carousel rather than a static grid.
- **Row gutter (vertical):** row1 bottom ≈1218 → row2 top ≈1304 = 86px ≈ **28.7pt**.
- **Card content height:** ≈310px ≈ **103.3pt** (measured on both rows identically).
- **Left/page margin:** 48px = **16pt** (see §2.2a).
- **Divider between cards:** a **single-pixel-wide** (1px @3x = **0.33pt**) vertical
  line, colour `(46,46,46)` = `#2E2E2E`, with a soft **opacity fade-in/out over
  ~24–26px (~8pt)** at both its top and bottom rather than a hard-edged cap.
  ⚠️ **Disagreement with master's hairline tokens**: this is neither
  `tvHairline` (#4A4A4A, 1pt) nor any documented divider — it's dimmer, thinner,
  and uniquely soft-edged. Given §0's mirroring-pipeline caveat, treat the exact
  sub-pixel width with caution, but the *colour* (`#2E2E2E`, not `#4A4A4A`) and
  the *fade* (not a hard-capped hairline) are both clean, repeatable findings.
- **Right-edge peek:** the 3rd column is visible from x=996 to the screen edge
  (1206) = 210px = **70pt of a 149.7pt card**, a deliberate ~47%-card peek that
  signals continued horizontal content — consistent with the app's chip-row
  peek convention (master §2.4) extended to a 2D card carousel.

**Card internal anatomy** (measured on the S&P 500 card, offsets from card content
top ≈ y900):

| Element | y (px) | Detail |
|---|---|---|
| Badge circle | 901–960 (⌀59px=**19.7pt**) | left inset 24px=8pt from card edge |
| Ticker/name text | 914–947 | left edge x=146 (badge-right + 15px/5pt gap) |
| Price digits | 986–1021 (ink 35px=**11.7pt**→~17pt Bold) | `#DBDBDB` |
| Unit suffix ("POINT"/"USD") | 992–1017 (ink 25px=**8.3pt**→~13pt) | **same `#DBDBDB` colour as the price**, not dimmed |
| Change % + "today" | 1052–1088 (ink 28–31px→~13–14pt) | **both** in `(34,171,148)` = **`#22AB94`** (`tvUpText`) |
| Sparkline (area chart) | ~1117–1218, gradient fade to ~1244 | full-bleed left, ~4.3pt right inset for the end-dot |

- **Badge colours are per-instrument, not from the shared semantic palette** —
  new tokens, not previously documented anywhere:
  - S&P 500: `(196,22,46)` = `#C4162E`
  - Dow 30: `(19,163,215)` = `#13A3D7`
  - Nasdaq 100: `(0,145,186)` = `#0091BA`
  - US 2000 (small-cap): `(81,23,50)` = `#511732`
  - Nasdaq Composite / NYSE Composite use a **brand-mark glyph** (an "N"-style
    logotype / "NYSE" wordmark) inside the disc instead of a number.
- **Badge label:** white bold numerals (500/30/100/2000) or the brand mark,
  small (~10pt ink), centred.
- **"D" delayed-data flag:** bare orange glyph, no background chip — colour
  `(245,124,0)` = **`#F57C00`**. Confirmed present on **S&P 500** and **Dow 30**
  only; absent on Nasdaq 100, US 2000, and (as far as visible) NYSE. This matches
  and extends the master spec's already-documented "orange D delayed-data badge"
  (previously only seen on watchlist rows) to the Explore index cards.
- **Trailing dash after the name** ("S&P 500 **-**", "Dow 30 **-**",
  "Nasdaq 100 **-**"): a plain flat hyphen glyph, **not** an ellipsis. By
  contrast "US 2000 sm**…**" truncates with a real 3-dot ellipsis. Since
  "Nasdaq 100" is short enough to fit its card with room to spare, the dash
  cannot be a truncation artifact of the *name* — it looks like a fixed
  placeholder/separator glyph appended to every card regardless of name length,
  with the orange "D" (when present) appended immediately after it. Left as an
  open question in §6 rather than asserting a firm rule.
- **Sparkline:** teal `#22AB94` line over a matching low-opacity gradient fill,
  vertical gradient fading toward transparent near the card bottom; a small
  filled dot (~5pt, same `#22AB94`/`#F23645` polarity colour) marks the series'
  current/last value at the line's terminal point. The **US 2000 card's chart
  occupies only about a third of the card's width** (data starts partway across)
  — this is a content artifact (sparse intraday series), not a fixed layout rule;
  don't hard-code a shorter chart width as a design token.

### 3.4 "Top Stories" section header
- Text "Top Stories" + trailing `›` chevron, x 50–420.
- Capital "T" cap-height 41px = **13.67pt** → 13.67÷0.705 ≈ **19.4pt → 20pt Bold**,
  matching the master's "Section header (in-content) 20pt Bold" token exactly.
  Colour `#DBDBDB`.
- Chevron: x 402–420 = 18px = **6pt** wide, separated from the text by a 26px/
  **8.7pt** gap — smaller than the master's `›` token (7.3pt) but in the same
  family; treat as the same `TVMenuRow`-style chevron.
- Gap from card-grid content end (~1614, including the sparkline's fade tail to
  ~1644) to this header's cap-top (1739): **~95–125px (32–42pt)**, i.e. a bigger
  section break than either of master's `s6` (24pt) or `s7` (30pt) section-gap
  tokens. No confirmed page-indicator dots exist in this gap — the carousel's
  scrollability is communicated purely by the card peek (§3.3), not a dot control.

### 3.5 News list row
Two rows visible (META, MSFT-cut-off); anatomy fully measurable on the first.

- **Source-logo avatar:** circle, ⌀51px = **17pt**, left inset 49px = **16.3pt**
  (confirms the page's 16pt margin again).
- **Timestamp/date/source line:** "00:20 · Jul 30 · TradingView", left edge
  x=128 (28px/9.3pt gap from avatar), ink height 28px = 9.33pt → **≈13pt**,
  colour `(140,140,140)` = **exact match to `tvTextSecondary` `#8C8C8C`.**
- **Headline:** up to 3 lines observed ("META: Meta Stock Falls 7.5% as
  Investors / Fret Over More Expenses. Earnings Were a / Miss."). Capital "M"
  ink 35px = 11.67pt → **≈17pt Bold**, colour `(219,219,219)` = exact
  `#DBDBDB`/`tvText` match. **Line pitch 60px = 20pt** (measured identically
  between all 3 lines — clean, repeatable).
- **Row height is content-driven, not fixed** — the visible row (3-line
  headline) spans avatar-top-to-next-avatar-top = 357px = **119pt**, but this
  will vary per headline length. Do not encode 119pt as a row-height token;
  encode the *internal* spacings instead:
  - avatar-bottom → headline-top: 38px = **12.7pt**
  - headline-bottom → next-row avatar-top: 112px = **37.3pt**
- **No divider between news rows** — confirmed pure black across the entire gap
  (sampled at x=600 through the full inter-row span). Matches the app-wide
  "whitespace-only separation, no dividers in menu-style lists" pattern (master
  §2.7).

### 3.6 Tab bar (cross-check against master §1.10/§2.20)
- Hairline at y=2373, tab-bar fill begins immediately after. Colour of the
  hairline itself measured `(74,74,74)` = **exact `#4A4A4A` match**. ⚠️ Width:
  only **1 raw px** (0.33pt) shows the transitional colour in this capture, well
  under the master's documented 3px/1pt. Given §0's mirroring-pipeline caveat,
  I read this as the capture thinning a genuine 1pt hairline rather than a real
  0.33pt token — **not** proposing a new hairline-width token off this one frame.
- Tab-bar fill colour: `(4,4,4)`/`(5,5,5)` ≈ **exact `#040404` (`tvChrome`) match**.
- **Total tab-bar height: 2622−2373 = 249px = exactly 83pt** — exact match to
  master's §1.10 total.
- **Bottom safe-area/home-indicator band:** label ink bottom (~2513) to screen
  bottom (2622) = 109px = **36.3pt**, matching master's 36pt token exactly.
- **All five labels render identical `#DBDBDB`** — sampled dominant colour for
  Watchlist/Chart/Explore/Community/Menu labels all return exactly
  `(219,219,219)`. No label-level selection signal, confirming master's claim
  for the *label*.

### 3.7 ⚠️ New finding: tab-bar SELECTED-icon treatment (resolves master's open question A1)
Master §1.10/§1.6/§4-A1 flagged tab-bar active-state as the top blocking
ambiguity, concluding (from frames that never showed Explore active) "no visual
state at all." **This capture shows Explore active, and it is visually distinct:**

- The compass glyph sits inside a **solid filled circular disc**, ⌀ measured
  67–68px = **22.3–22.7pt**, centred on the tab column exactly where the bare
  icon sits on the other four tabs.
- **Disc fill colour:** `(219,219,219)` = **exactly `#DBDBDB` (`tvText`)** — i.e.
  the disc is filled with the *same* colour every unselected icon is drawn in.
- **Icon-on-disc colour:** the compass glyph itself renders in the tab bar's own
  near-black background tone (sampled ~`(13,13,13)`), i.e. it is **knocked out**
  of the disc rather than drawn on top of it.
- **Disc size ≈ icon frame size**, not an oversized pill: cross-checked against
  the unselected Chart icon's own bounding box (70×68px) on the same frame —
  near-identical. This is a tight "invert this icon's own square," not a bigger
  background pill.
- **The label stays plain `#DBDBDB`, unstyled** (§3.6) — selection is carried
  **entirely by the icon**, never by the label.

**This is exactly the app's documented "selection = full inversion" law (master
§1.6)**, just never previously observed applied to the tab bar itself. Recommend
updating master §1.6's tab-bar row from "no visual state at all" to "icon-only
full inversion inside a disc sized to the icon's own frame," and closing A1 with
this evidence (though confirming it holds on the *other four* tabs when *they're*
active still needs a live check — see §6).

---

## 4. Navigation relationships

```
Explore (tab root, this spec)
├─ search glyph (top-right) ─────────────► [unconfirmed: dedicated search screen]
├─ "News" button ─────────────────────────► [unconfirmed: News tab/list]
├─ "Calendar" button ─────────────────────► [unconfirmed: economic calendar]
├─ "Brokers" button ──────────────────────► [unconfirmed: broker directory]
├─ category pill (Stocks/Crypto/…) ───────► [unconfirmed: filters the page? pushes a per-category markets list?]
├─ index card (tap) ──────────────────────► [unconfirmed: index quote/detail — likely the "Symbol detail" surface from spec-symbol-detail.md]
├─ "Top Stories ›" ────────────────────────► [unconfirmed: full news list, same headline anatomy]
└─ news headline row (tap) ───────────────► [unconfirmed: article view]
```

No relationship above is confirmed by a second captured screen — this tab's
entire outbound navigation graph is inferred from affordance alone (chevron,
button styling, row tappability convention elsewhere in the app). All are listed
as open questions in §6.

Inbound: reached via the 5-tab bar's "Explore" item (§3.7), compass icon, always
third of five, `#DBDBDB`, no dot badge observed on it in this capture (contrast
with Chart/Community, which do carry a red dot per master's documented pattern).

---

## 5. FEATURES — every product capability visible in this surface

1. **Global search** entry point (icon-only, top-right of Explore).
2. **News hub** shortcut (dedicated button, distinct from the inline "Top Stories"
   preview below).
3. **Economic calendar** shortcut.
4. **Broker directory / "compare brokers"** shortcut — a monetization/affiliate
   surface, not a data feature.
5. **Asset-class category filter** (Stocks/Crypto/Futures/Forex/Bonds/+more,
   scrollable) sitting above the markets carousel.
6. **Global market-indices dashboard**: a 2-row, horizontally-scrolling carousel
   of major index cards (S&P 500, Dow 30, Nasdaq Composite, Nasdaq 100, US 2000,
   NYSE Composite, +more off-screen), each showing:
   - live/delayed price + unit (points vs USD, i.e. it mixes index-point and
     cash/ETF-style instru­ments in one rail),
   - percent change with a "today" qualifier,
   - an intraday sparkline with a current-value dot,
   - a per-instrument colour-coded identity badge (number or logo mark),
   - a conditional **orange "D" delayed-data flag** per instrument (feature already
     known from Watchlist; here proven to also apply at the index/market level).
7. **Inline "Top Stories" news feed** embedded directly in Explore (not just a
   link out) — source-attributed (logo + timestamp + source name), multi-line
   headlines, with a "see all" chevron to a fuller list.
8. Implicit **horizontal-scroll-as-navigation** used twice on one screen (category
   pills, index carousel) with no page-indicator dots — scroll affordance is
   communicated purely by partial-card/partial-pill peeking at the trailing edge.

---

## 6. Open questions needing live interaction

**B1 (blocking for pills).** Do the category pills (Stocks/Crypto/Futures/Forex/
Bonds/…) filter the index carousel and/or the news feed below, or does tapping
one push a whole new "category markets" screen? No visual selection state was
observed on any pill in this static frame — need to tap one and screenshot the
result.

**B2 (blocking for cards).** What does tapping an index card open — the
`spec-symbol-detail.md` sheet, a dedicated "index detail" screen, or something
Explore-specific? Also: is the carousel **paged** (snaps to card boundaries) or
free-scrolling? Screenshot mid-drag to check.

**B3.** What is the full category-pill inventory beyond Stocks/Crypto/Futures/
Forex/Bonds? At least one more pill is clipped at the right edge. (Extends
master's A7.)

**B4.** What is the full index-carousel inventory beyond the 6 visible cards
(S&P 500, Dow 30, Nasdaq Composite, Nasdaq 100, US 2000, NYSE Composite)? Scroll
right and re-capture.

**B5.** What is the meaning of the trailing "-" glyph after index names that
clearly aren't truncated ("Nasdaq 100 -")? Is it a fixed static separator that
always precedes an optional "D" flag, a placeholder for an unloaded field, or
something else? Compare against a wider set of cards, ideally one with more than
one trailing flag, to disambiguate from the real ellipsis-truncation case
("US 2000 sm…").

**B6.** Does the 34pt "Explore" title collapse into a small centred nav-bar title
on scroll (standard iOS large-title behaviour), and if so, does the search glyph
move/restyle with it? Needs a mid-scroll screenshot.

**B7.** Confirm §3.7's tab-selection-inversion finding holds for the *other* four
tabs when *they're* the active one (this capture only shows Explore active).
Directly closes master's A1 if consistent.

**B8.** What triggers the News/Calendar/Brokers buttons — do they push full
screens, or present sheets? And is the News button's destination the same list
as "Top Stories ›", or a superset/different feed?

**B9.** Real font identity of the 34pt "Explore" title — stock SF Pro Heavy/Black
at a condensed tracking, or a custom TradingView display face? Needs Accessibility
Inspector / live font-name check, per the same limitation master's A14 already
notes for the hero price.

**B10.** Exact corner-radius value for the News/Calendar/Brokers buttons — my
raster-corner measurement only bounds it to "~10–12pt continuous," not an exact
figure (§3.1).

**B11.** True width/colour of the index-card column divider (§3.3) once measured
from a non-mirrored capture — is it really a sub-hairline `#2E2E2E` fade, or is
that an artifact of this specific capture pipeline (§0)?

---

## 7. Summary of confirmed master-spec matches (no action needed)

For completeness — these measured exactly onto existing master tokens, so no
spec change is implied by them: `tvText` #DBDBDB (title, prices, headlines, tab
labels, disc fill), `tvTextSecondary` #8C8C8C (timestamps), `tvUpText` #22AB94
(all green figures), `tvHairline` #4A4A4A colour (tab-bar rule), `tvChrome`
#040404 (tab-bar fill), `tvPill` #2E2E2E (action buttons + pills — new context,
same token), the 83pt total tab-bar height, the 36pt home-indicator band, the
8.3pt tile/card gutter, and the 20pt Bold in-content section-header size
("Top Stories").
