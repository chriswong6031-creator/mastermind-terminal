# TradingView iOS — Watchlist Surface: Pixel Spec, SUPPLEMENT 2

**Status: enrichment pass over `spec-watchlist.md` (pass-1), cross-checked against
`TV_PARITY_MASTER_SPEC.md` §1's token vocabulary.** This document does not restate
what pass-1 already got right (row grids, tab-pill anatomy, add-symbol sheet,
toast). It adds the states/features visible in 8 new **lossless** stills
(`z-001, z-016, z-017, z-018, z-019, z-020, z-021, z-022` — all confirmed
1206×2622px = 402×874pt @3x, so every hex below is trustworthy per the master
spec's §0.1 lossless-vs-video rule) and explicitly flags every place a fresh
measurement disagrees with pass-1 or the master spec.

All coordinates pt unless marked px. Method: PIL pixel sampling, boundary scans
column-by-column, and cap-height→font-size conversion at the master spec's
0.705 ratio.

---

## 0. Conflicts & corrections — read this first

| # | Claim in pass-1 / master spec | New measurement | Verdict |
|---|---|---|---|
| D1 | Small dash glyph after ticker seen "once… session/flat-state marker?" (pass-1 §6.6), only on `MNQ2!` | Present on **100% of rows** in z-001/z-019 (CBOE, XLV, IHI, IHE, LLY, MRK, JNJ, NOC, MCK, GILD, BMY, REGN, WM, MCD, APA, DVN, COIN) regardless of sign/asset class | **Not a session marker.** It's a universal per-row glyph. See §3.1 for the likely real reading (drag handle) |
| D2 | Pass-1 modeled `.watchlist3` (82pt, extended-hours line) as the default row for equities, `.symbol2` (60pt) only for futures without an extended quote | The **same CHRIS list, same symbols** (JNJ, MCK, GILD, BMY, MCD, etc. appear in both captures) renders as **60pt 2-line rows with zero extended-hours lines** in every z-0xx still | The 3-line/2-line choice is **not fixed per symbol/asset-class** — it's session-state-driven (extended-hours line only renders when an extended session actually has data "live" at capture time). Master spec's row-height table (§1.5) is still correct as two *possible* heights; pass-1's assumption of a stable per-symbol mapping is the thing to drop |
| D3 | Master §2.1 hairline list token `tvHairlineList` = `#414141` | z-001/z-019 inter-row dividers measure `(50,50,52)` ≈ **`#323234`**, consistently, across 10+ dividers | Genuine disagreement, but both the divider's 1px thinness and the fact it sits directly on `#000000` (max anti-alias blend) make sub-pixel drift the likely cause. Reporting as measured, **not** proposing a token change without a wider census |
| D4 | Master §2.2 close-button rule: circle-30pt only on `#1C1C1E` sheets; bare glyph only on `#000000` | "Create section" modal (z-022) is **`#000000`** background yet uses the **circle-30pt `#1C1C1E`-fill variant**, not a bare glyph | Rule is **incomplete, not wrong**: it holds for the symbol-detail / Compare-Symbols class of black surface, but small modal **dialogs** (as opposed to full black *pages*) default to the circle regardless of backdrop. Recommend keying the close-button variant to "is this a full-screen page or a compact dialog," not to background hex |
| D5 | Master §2.3 `TVSearchField` — only two variants exist, `.outline`/`.filled`, both capsules | "Create section" (z-022) uses a **third field style**: single-line, bottom-hairline-only, no capsule, no fill, no leading icon | Not a search field at all — it's a plain **naming/text-entry field**. Add as a distinct `TVTextField` primitive, don't force it into the search-field variant table |
| D6 | Master §1.3 type scale: "Sheet / page title 20pt Bold, ink 14.0–14.7" applies to *every* sheet + full-screen page title | "News by watchlist" page title measures **12.0pt ink → ≈17pt font**; the Watchlist tab's collapsed/compact title ("CHRIS", z-019) measures **12.67pt ink → ≈18pt font** | Both **smaller** than the 20pt token, consistently (~2–3pt short). These read as a **separate "compact nav title" tier (~17–18pt Bold)**, distinct from the modal "sheet title" tier (20pt). Needs a 5th lossless sample before promoting to a hard token, but two independent, consistent measurements is enough to flag |
| D7 | Master §1.3 primary text `tvText` = `#DBDBDB` "for row labels" universally | Row labels inside the **`•••` dropdown and Sort-by submenu** (z-016/z-017) measure **`#F6F6F6`/`#F7F7F7`** — distinctly brighter than `#DBDBDB` | Compact popup/dropdown-menu row labels are brighter than sheet-row labels. Treat as a context-specific exception, not a token replacement (sheet rows elsewhere still check out at `#DBDBDB`) |
| D8 | Master §2.9 `TVSectionCaption`: ALL CAPS, tracking +0.6, 11pt Semibold, `#8C8C8C` | The `•••` dropdown's group labels ("CHRIS", "Watchlists") are **mixed-case, not tracked, ≈ `#9E9EA4`**, in a visibly smaller/plainer style than any sheet caption | These are **not** `TVSectionCaption` instances. They're a plainer, one-off "menu group label" used only in this compact dropdown context — don't reuse the caption component here |
| D9 | Pass-1 §6.1 open question: "what does `•••` open?" — unresolved | **Resolved.** z-016: `Edit` / `Sort by ›` / `News by watchlist` / section "Watchlists" / `All watchlists` / `Create new list` | Closed. See §4 |
| D10 | Pass-1 §6.2 open question: swipe/long-press reorder? — unresolved | **Strongly implied, not yet proven.** The Sort-by menu's first entry is `Customized order` (z-017), and every row carries the same drag-handle-shaped glyph (D1) | Upgrade from "unknown" to "very likely, needs a live long-press-drag to confirm the exact gesture" |
| D11 | Master §4-A2: is Quick-Info vs Symbol Detail one surface or two? — unresolved | z-020's row context menu exposes **both `Open chart` and `Open symbol screen` as separate menu rows**, next to `Trade` and `Add alert` | **Partial resolution**: confirms ≥2 distinct, deliberately-separate navigation targets exist off one row (this is new evidence, not full proof `Open symbol screen` = pass-1's "Quick-Info" sheet — still needs a live tap to confirm which surface it lands on) |
| D12 | (new, not a prior claim) | Pass-1's "CORE HOLDINGS" / "GOLD SILVER MINERS" section headers were described as pre-existing content | z-020's context menu contains **`Add section above`**, and z-022 is the resulting **"Create section" modal** (name field + Create CTA) | Sections are **user-authored**, not server-curated groupings. Confirms pass-1 §4.8 in stronger form: this is a real, exposed feature, not an assumption |

---

## 1. Surface inventory (additions to pass-1's S1–S9)

| # | Surface | State | Frame |
|---|---|---|---|
| S10 | **Watchlist `•••` menu** | Compact dropdown anchored top-left, over the dimmed watchlist | z-016 |
| S11 | **Sort by — expanded inline** | Same dropdown, "Sort by" accordion-expands in place (chevron flips `›`→`⌄`), pushing "Watchlists" section off-frame | z-017 |
| S12 | **News by watchlist** | Full-screen pushed page (own back button + title), flag-color + watchlist-name filter chips, article feed | z-018 |
| S13 | **Watchlist row — long-press context menu** | Row "peeks" as an elevated `#1C1C1E` card above a 4-group action menu | z-020 |
| S14 | **Flag color picker** | Same context-menu card, `Flag` row expanded in place to 7 color options | z-021 |
| S15 | **Create section modal** | Full-screen black modal, single text field + primary CTA, native keyboard | z-022 |
| S16 | **CHRIS list, 2-line-row epoch** | Same underlying list as pass-1's S1/S2, captured at a different moment: every row (including ones pass-1 saw as 3-line) renders as 60pt 2-line; per-row flag ribbons visible (MCK/GILD/BMY, green) | z-001, z-019 |

S13/S14 are two states of **one** popup (long-press or `Flag ›` from it); same for S10/S11. Both popup families use the **same card chrome** (see §3.2).

---

## 2. Layout trees — measured geometry, typography, colors

### 2.1 S16 — CHRIS list re-capture (z-001, z-019): what's different from pass-1

Confirms pass-1's toolbar (y 67–96, `•••`/logo/`+`, all `#DBDBDB`) and tab-pill row
(y 110–143, `CHRIS` active pill) pixel-for-pixel — **when at the very top of
scroll**. New findings once scrolled:

**a) The tab-pill row is not always present — it's collapsible.**
z-001 (scrolled a little) still shows the full `CHRIS / SECTOR ETF 美国… / STEVEN`
pill row. z-019 (scrolled further) shows **no pill row at all** — the toolbar's
center content has switched from the TV brand mark to the **active list's own
name, "CHRIS,"** rendered as a compact title, and the row divider directly under
it is the **soft** list-hairline (`#323234`-ish), not the **bold** `#4A4A4A`
under-tab hairline seen in z-001. This is a large-title-style collapse: scroll
down far enough and the tab strip folds away, replaced by a compact inline
title, exactly like a `UINavigationBar` large-title→inline-title transition —
except what's collapsing is the *entire pill row*, not just a title. Confirmed
directionally consistent (same list, same symbol order — MRK/JNJ/NOC/MCK/GILD/BMY
appear as the *tail* of z-001's row order and the *head* of z-019's), so this is
one continuous list at two scroll depths, not two different lists.

**b) The header is a fixed overlay the list clips against, not a spacer.**
z-001's topmost visible row (CBOE) has its avatar **hard-clipped**: measured
navy-fill span is only **31.3pt of the normal 36pt** diameter (§3.1's avatar
token), with the icon's top edge landing almost exactly flush (0.3pt) against
the bold hairline at y=152.3pt — versus a normal ~12.3pt top-padding gap on every
other row in the same list (confirmed on MRK in z-019: icon spans 117.67→153.33pt
inside a 105.33→165.33pt row, i.e. a clean ~12pt pad top and bottom). **Read:**
the toolbar+tabs chrome is a fixed-position overlay; the list scrolls *underneath*
it and is clipped exactly at the chrome's bottom edge — it does not reserve
padding space the way a plain sticky-section-header would. Build this as a
`ZStack`/overlay with hard clipping, not as a `List` section header that pushes
content down.

**c) Row divider color, re-measured:** `(50,50,52)` on 10 consecutive dividers —
see D3.

### 2.2 S10 — `•••` dropdown menu (z-016)

Anchored top-left (not centered, not full width), presented over a dimmed
watchlist. Background `(34,34,35)`≈`#222223` (a hair lighter than `tvSheet`
`#1C1C1E` — likely the same token rendered with a translucent-material blur over
the dimmed list beneath it, not a new flat color).

```
Card: x 11.7–261.7pt (width 250pt), left-anchored under the "•••" button
┌─────────────────────────────────────┐  card top  y ≈ 103.3pt
│  CHRIS                              │  header/group-label, ≈30pt tall
├─────────────────────────────────────┤  y 133.3–133.7  (hairline)
│  Edit                          ✏️   │  44.4pt row
├─────────────────────────────────────┤  y 177.3–177.7
│  ›  Sort by                    ↓↑   │  44.0pt row
├─────────────────────────────────────┤  y 221.3–221.7
│  News by watchlist             🗎   │  ≈44–47pt row
│  (whitespace gap, no divider)       │
│  Watchlists                         │  header/group-label, ≈37pt tall
├─────────────────────────────────────┤  y 305.7–306.0
│  All watchlists                🔖   │  44pt row
├─────────────────────────────────────┤  y 349.7–350.0
│  Create new list               ➕   │  ≈41–44pt row
└─────────────────────────────────────┘  card bottom y ≈ 390.7–391.3pt
```

- Group labels ("CHRIS", "Watchlists"): mixed-case, `≈#9E9EA4` (measured
  `(158,158,164)` / `(154,156,162)`) — see D8. Not the sheet caption style.
- Row labels: `≈#F6F6F6` — see D7. 17–18pt-class size (visually matches other
  menu-row labels, not independently re-derived here).
- Icons, 20pt-ish ink, `#DBDBDB`-family: **Edit** = pencil; **Sort by** = a
  down-arrow-over-up-arrow glyph (`arrow.down.arrow.up`-style); **News by
  watchlist** = a document with a small flag/ribbon cut into its corner;
  **All watchlists** = a bookmark/list combo (document with horizontal rules +
  ribbon corner — near-identical glyph family to the News icon, differently
  proportioned); **Create new list** = plain `+`.
- No dividers between "News by watchlist" and the "Watchlists" group label —
  section break is whitespace-only, matching the master spec's "no full-bleed
  divider between logical groups, only between rows within a group" convention
  used elsewhere (§2.7).

### 2.3 S11 — Sort by, expanded in place (z-017)

Same card, "Sort by" row's chevron flips to `⌄` and the row list beneath it is
replaced (accordion, not a navigation push — the rest of the original `•••`
menu, e.g. "Watchlists", is presumably still below, just pushed off-frame).

```
⌄  Sort by                                   y 103.3–132.5   (29.2pt header)
   Customized order                          y 132.5–165.8   (33.3pt, no trailing icon)
   Symbol                            ↓A-Z     y 165.8–207.3   (41.5pt)
   Last price                        ↓≡       y 207.3–251.0   (43.7pt)
   Change                            ↓≡       y 251.0–295.0   (44.0pt)
   Change (%)                        ↓≡       y 295.0–339.0   (44.0pt)
   Flag                              ↓⚑       y 339.0–383.0   (44.0pt)
   Extended hours                    ↓≡       y 383.0–427.0   (44.0pt)
   Market cap                        ↓≡       y 427.0–471.0   (44.0pt)
   Volume                            ↓≡       y 471.0–515.0   (44.0pt)
```

- Steady-state row height **44.0pt** (8 of 9 rows land within 0.3pt of it).
- **`Customized order` is the odd one out**: shorter (33.3pt vs 44pt), dimmer
  text (`(116,117,116)`≈`#747574` — closer to master's `tvTextTertiary`
  `#6F6F6F` than to `tvTextSecondary`), and it's the only row **without** a
  trailing sort-direction glyph. Reads as "the non-numeric baseline state" —
  every other row pairs a `↓` direction arrow with a small type glyph (A-Z for
  Symbol, stacked lines for numeric fields, the flag icon for Flag). No
  checkmark or highlight marks which field is *currently* active — **open
  question**, see §6.
- All 8 numeric/text fields share one row template; `Flag` sorting existing as
  an option corroborates the Flag feature being a first-class, sortable
  row attribute, not a cosmetic-only marker.

### 2.4 S12 — News by watchlist (z-018)

Full-screen push (own back chevron + title, standard `#000000` page, tab bar
gone — this is a *page*, not a sheet).

```
‹ CHRIS                    News by watchlist            y 72.3–84.7pt title ink
                                                          (see D6 — ≈17pt, not 20pt)
[Red] [Blue] [Green]  (CHRIS)  SECTOR ETF 美…            y ≈103–137pt filter row
│
├─ icon(≈24pt) 19:35 · Jul 30 · CNBC TV18                gray timestamp row
│  Microsoft makes history by adding $450 billion         bold white headline,
│  to market cap after best day in 18 years                2–3 lines, wraps
│  (generous whitespace)
├─ icon  19:29 · Jul 30 · Reuters
│  Asia stocks surge, yen steals spotlight after
│  suspected intervention
├─ icon  19:28 · Jul 30 · Dow Jones Newswires
│  Bitcoin Falls as Investors Take Wait-And-See
│  Approach — Market Talk
… (article-icon-to-article-icon pitch ≈120pt, varies with headline length)
```

- **Filter row is a single horizontally-scrollable strip mixing two filter
  types**: 3 solid flag-color swatches, then `TVChip`-style watchlist-name
  pills. This means News-by-watchlist can filter by **flag color** and/or
  **specific watchlist**, not just by list — a feature pass-1 never saw.
- Flag swatches here are **solid-filled** (this is a *filter*, not the
  color-*picker* from S14 where only the active color is filled) — each
  measures **14.0pt wide × 17.3pt tall**, pitch 54pt center-to-center:
  - Red `#FF5252` (255,82,82)
  - Blue `#2979FF` (41,121,255)
  - Green `#81C784` (129,199,132)
- `CHRIS` pill: fill `(46,46,46)`=`#2E2E2E`, text `(219,219,219)`=`#DBDBDB` —
  an exact match for the master spec's `TVChip` selected state (§2.4). Pill
  measured height **34.0pt** (master token: 33pt — within rounding).
- News row: colorful square/circle source-icon, then a gray (`#8C8C8C`-family)
  13–15pt metadata line `HH:MM · Mon DD · Source`, then a bold white
  (`#DBDBDB`-or-brighter) headline at a size visually larger than standard
  row-primary text (reads ~19–20pt Bold, 2–3 lines, no truncation — this is a
  scrolling feed, not a fixed-height row list). No divider lines between
  articles; separation is whitespace only (~40pt+ gap).

### 2.5 S13 — Watchlist row long-press context menu (z-020)

Triggered on MCK (which has an active green flag). A "peek" card first — the
row re-rendered on an elevated `#1C1C1E` card (`(28,28,30)`, full 370pt content
width, ≈55.3pt tall — matches the master's 55.7pt compact-row token exactly) —
sits above the action menu, both dimmed-background-composited over the list.

```
┌ MCK  ⎯                                     865.51  ┐   peek card, #1C1C1E,
│ McKesson Corporation                −23.05 −2.59%  │   ≈55.3pt, w=370pt
└──────────────────────────────────────────────────────┘
┌─────────────────────────────────────┐  card x 16–266pt (w 250pt)
│ ›  Flag                        ▱    │  44pt  — group 1
│    Remove flag                 🏳  │  44pt  (filled GREEN flag icon: this
├─────────────────────────────────────┤          row's flag IS currently green)
│    Add section above           ▤    │  44pt  — group 2 (own group; the
├─────────────────────────────────────┤          user-section-creation entry)
│    Add alert                   ⏰➕  │  44pt  — group 3 starts
│    Trade                       ⤳    │  44pt
│    Open chart                  📁   │  44pt
│    Open symbol screen          📊   │  44pt
├─────────────────────────────────────┤
│    Remove                      🗑   │  44pt  red text + red icon — group 4
└─────────────────────────────────────┘
```

- **4 divider-separated groups**, exactly matching the master spec's "applied-
  indicator context menu" pattern (§3.5.13) reused here for watchlist rows:
  {Flag, Remove flag} · {Add section above} · {Add alert, Trade, Open chart,
  Open symbol screen} · {Remove}. An extra ~8pt gap (vs the standard ~0pt
  hairline-to-hairline) separates groups 2→3 specifically.
- Card background measured `(39,39,40)` here vs `(28,28,30)` for the peek card
  above it — both round to the `tvSheet`/`#1C1C1E` family; treat as one token,
  minor measurement noise from stacked translucency.
- `Remove flag`'s icon is **filled solid green** — first direct visual proof
  that a filled-vs-outline icon state is how "this row's current flag color" is
  communicated (see §3.3).

### 2.6 S14 — Flag color picker (z-021)

Same card, `Flag` row expanded to a header + 7 rows.

```
⌄  Flag                                    ▱ (outline, no color = "no selection made
                                                 at this level")           55.7pt header
   Red                                     ▱ red outline                  44.0pt
   Blue                                    ▱ blue outline                 44.0pt
   Green                                   🟩 SOLID FILL (currently active) 44.0pt
   Orange                                  ▱ orange outline                44.0pt
   Purple                                  ▱ purple outline                44.0pt
   Cyan                                    ▱ cyan outline                  44.0pt
   Pink                                    ▱ pink outline                  44.0pt
```

Header row **55.7pt** (identical to the master's `TVGhostButton`/compact-row
token, §2.11); the 7 color rows are **44.0pt** each (identical to the S10/S11
menu-row height — confirms 44pt as a real, reusable popup-menu row token
distinct from the sheet's 60pt `TVMenuRow`).

Measured swatch colors (all read as clean, named design-system colors — these
are Material Design hues, verbatim):

| Name | Hex | RGB |
|---|---|---|
| Red | `#FF5252` | 255,82,82 |
| Blue | `#2979FF` | 41,121,255 |
| Green | `#81C784` | 129,199,132 |
| Orange | `#FBC02D` | 251,192,45 |
| Purple | `#BA68C8` | 186,104,200 |
| Cyan | `#00E5FF` | 0,229,255 |
| Pink | `#F48FB1` | 244,143,177 |

### 2.7 S15 — Create section modal (z-022)

Full black modal (`#000000`), grabber, 30pt circle close button (D4), centered
20pt-class Bold title "Create section", single underlined text field (D5),
disabled-state primary CTA, native keyboard docked.

```
[grabber, centered, ≈8pt below top edge]
Create section                                 ×  (circle 29.7×29.7pt,
                                                     fill ≈#1C1C1F, glyph ≈#9899A0)
(blank space)
Section                                            placeholder, dim gray,
______________________________________             blinking cursor, bottom-
                                                    hairline only (#2B2B2B-ish)
(blank space)
┌────────────────────────────────────────┐
│               Create                    │  368pt wide, 37.3pt tall,
└────────────────────────────────────────┘  fill (127,127,127)=#7F7F7F — DISABLED
                                              state (text field empty)
[QWERTY keyboard, docked]
```

- Close button: circle **29.7×29.7pt** (≈30pt token), fill `≈#1C1C1F`
  (essentially `tvSheet` `#1C1C1E`), glyph `(152,152,159)`≈`#9898 9F` (close to
  master's `tvDismiss` `#A0A0A8`). See D4 for why this contradicts the
  surface-keyed close-button rule.
- Text field: **no capsule, no fill** — a plain baseline-underline input, the
  first non-`TVSearchField` text entry seen across both passes. See D5.
- CTA: **disabled fill `#7F7F7F`**, flat mid-gray, presumably swapping to the
  standard `TVPrimaryCTA` white-fill/black-label (§2.12) once text is entered —
  not observed enabled in this capture, but the disabled state itself is new,
  useful data (master spec's CTA component has no documented disabled state).
- This is the modal reached from S13's `Add section above` row — confirms the
  full loop: long-press a row → Add section above → name it → Create.

---

## 3. Component anatomy — new/refined metrics

### 3.1 Per-row trailing dash glyph (new component: likely a drag handle)

- Shape: fully-rounded horizontal capsule/pill.
- Size: **≈10.3pt wide × 4.0pt tall** (pixel-grid-confirmed on MRK's row,
  z-019; a coarser threshold scan overstates this to ~18–24pt wide by
  incidentally including antialiased ticker-letter edges — trust the tight
  ASCII-grid measurement).
- Color: `(140,140,140)` = **`#8C8C8C`** exactly — matches `tvTextSecondary`.
- Position: immediately trailing the ticker text on line 1, small (~6–8pt) gap
  after the last letter, vertically centered on the ticker's cap-height band.
- Present on **every row observed**, independent of sign, asset class, or flag
  state (CBOE, XLV, IHI, IHE, LLY, MRK, JNJ, NOC, MCK, GILD, BMY, REGN, WM, MCD,
  APA, DVN, COIN all carry it identically).
- **Best-supported reading**: a drag handle for manual reordering, corroborated
  by the Sort-by menu's `Customized order` being the first/default sort field
  (§2.3) — TV very likely supports drag-to-reorder only in that mode, and this
  glyph is its affordance. This **supersedes** pass-1's "session/flat-state
  marker?" guess (D1) — that guess doesn't survive contact with the "appears on
  every single row, all sessions, all signs" evidence. Still needs a live
  long-press-and-drag to fully confirm (§6).

### 3.2 Popup/dropdown menu card chrome (shared by S10/S11/S13/S14)

- Width **≈250pt**, left-anchored (not centered, not full-bleed) — either
  under the `•••` button (x 11.7–261.7pt) or near the tapped row (x 16–266pt);
  treat the anchor point as "near the trigger," not a fixed screen position.
- Background **`#1C1C1E`-family** (`tvSheet`), measured 28–39 in each channel
  across samples — the small spread is compositing/blur noise, not a second
  token.
- Row height **44.0pt** for standard action/option rows — a **new, distinct
  token** from the master's `TVMenuRow` (60pt, used in full-screen sheets like
  the Indicators picker) and `TVGhostButton` (55.7pt, used for compact action
  *buttons*). Header/expand rows (the un-numbered top row when a sub-list is
  showing, e.g. "Flag" or "Sort by" acting as their own header) measure
  **55.7pt** — reusing the `TVGhostButton` height, not the 44pt row height.
- Grouped by 1px hairlines within a group; an extra ~8pt gap (no visible extra
  divider, just more whitespace) separates logical groups — same "groups, not
  one flat list" idiom as the master's applied-indicator context menu.
- No sheet grabber, no title bar chrome on the *context-menu* variant (S13/S14)
  — it free-floats next to a "peek" card of the row it targets. The
  *toolbar-triggered* dropdown (S10/S11) has no peek card (nothing to preview)
  but is otherwise the same chrome.

### 3.3 Selection idiom #3: outline → solid fill (flag color)

The master spec (§1.6) documents two selection idioms (full inversion; chip
darkening). The Flag picker (S14) demonstrates a **third**: every unselected
color row renders its swatch as a **thin colored outline on a transparent
center**; the currently-active color renders as a **fully solid fill**. Add to
§1.6 as:

| Element | Unselected | Selected |
|---|---|---|
| Flag color swatch | outline only, transparent fill, colored stroke | solid fill, same hue |

### 3.4 Flag ribbon (row-level ownership indicator)

- Shape: a rectangle with a `<`-notch cut into its right edge — a flag/bookmark
  pennant, confirmed via pixel-grid crop (matches the icon glyph shape used in
  the Flag menu, §2.6).
- Position: **flush to the physical left screen edge** (x starts at 0), not
  inset with the row's normal 16pt content margin. Overlaps the avatar
  column's left edge.
- Size: **9.33pt wide × 13.67pt tall**, vertically centered on the row.
- Color (on-row, green): `(144,197,138)` ≈ `#90C58A` — slightly softer/lighter
  than the picker/filter's pure `#81C784` (§2.4/§2.6), likely from edge
  anti-aliasing against the adjacent avatar rather than a distinct token.
- Observed on MCK, GILD, BMY in the z-001/z-019 capture — a real, currently
  applied per-row attribute, not a demo-only state.

### 3.5 News-by-watchlist row

- Source icon: colorful square/circle, ≈24pt.
- Metadata line: `HH:MM · Mon DD · Source`, gray (`tvTextSecondary`-family),
  ≈13–15pt.
- Headline: bold, bright (brighter-than-`tvText`, consistent with the D7
  popup-menu brightness finding — worth re-checking whether *all* full-page
  push surfaces, not just popups, skew brighter than modal sheets), 2–3 lines,
  no truncation, ≈19–20pt.
- Row pitch ≈120pt center-to-center, but headline-length-dependent (not a
  fixed row height) — this is a natural-height feed, not a grid.
- No dividers between articles.

---

## 4. Navigation relationships (additions)

```
Watchlist (S1/S2/S16)
 ├─ tap "•••" (top-left) ──────────────► S10 •••-menu
 │                                        ├─ Edit ───────────► (list edit mode, not captured)
 │                                        ├─ Sort by › ──────► S11 (expands IN PLACE, accordion)
 │                                        ├─ News by watchlist ► S12 (full-screen PUSH, tab bar hidden)
 │                                        ├─ All watchlists ─► (not captured — likely a list-of-lists)
 │                                        └─ Create new list ► (not captured)
 │
 ├─ long-press a row ───────────────────► S13 row context menu
 │                                        ├─ Flag › ─────────► S14 flag color picker (expands IN PLACE)
 │                                        ├─ Remove flag
 │                                        ├─ Add section above ► S15 Create-section modal
 │                                        ├─ Add alert
 │                                        ├─ Trade
 │                                        ├─ Open chart ─────► (Chart tab, this symbol)
 │                                        ├─ Open symbol screen ► (a symbol-info surface — see D11)
 │                                        └─ Remove (destructive, red)
 │
 └─ tap a row (plain) ──────────────────► Symbol quote preview (pass-1 S6/S7) — UNCHANGED,
                                           still the tap target; distinct from "Open symbol screen"
```

Both `S10→S11` and `S13→S14` are **inline accordion expansions of the same
popup**, not a new sheet stacking on top (chevron rotates `›`→`⌄`, the rest of
the list underneath is replaced/pushed, the card's outer chrome doesn't
change). This is a distinct interaction pattern from the "sheet stacks on
sheet, previous sheet peeks" behavior the master spec documents for the
Analysis hub (§3.5.8) — don't build these popups as stacked sheets.

---

## 5. FEATURES — additions to pass-1's §5 list

- **Manual list reordering**, gated behind a `Customized order` sort mode, with
  a persistent per-row drag-handle-shaped glyph (inferred, see D10/§3.1).
- **8-field Sort by** (Symbol, Last price, Change, Change %, Flag, Extended
  hours, Market cap, Volume) plus the baseline Customized order — a real,
  fairly rich sort system, not just "sortable by price."
- **Per-symbol colored Flag** (7 colors: Red/Blue/Green/Orange/Purple/Cyan/
  Pink), settable from a row's context menu, shown as a small ribbon at the
  row's left edge, and itself a **sortable field** and a **News filter
  dimension**.
- **User-authored in-list sections** via `Add section above` → `Create
  section` modal — resolves how pass-1's "CORE HOLDINGS"/"GOLD SILVER MINERS"
  groupings actually get made.
- **Per-row quick actions**: Add alert, Trade, Open chart, Open symbol screen,
  Remove — all directly from a watchlist row's context menu, without opening
  the quote-preview sheet first.
- **List-level "Edit" mode** and **"All watchlists" list-of-lists** management,
  both reachable from the `•••` menu (neither captured in enough depth to spec
  further — see §6).
- **News by watchlist**: a dedicated full-screen news feed scoped to the
  current list, further filterable by **flag color** and/or a **specific named
  watchlist**, mixing both filter types in one horizontally scrollable chip
  row.
- **Collapsing header on scroll**: the toolbar+tab-pill block behaves like a
  large-title nav bar — pill row present near the top of scroll, fully
  collapses to a compact inline title (the active list's name) once scrolled
  further, with rows clipping hard against its underside rather than being
  padded away from it.

---

## 6. Open questions needing live interaction

1. **Collapse threshold.** Exactly how far must the list scroll before the
   tab-pill row collapses, and does scrolling back up restore it immediately
   or only at the very top? (§2.1b)
2. **Drag-to-reorder confirmation.** Does long-pressing the per-row dash glyph
   (§3.1) actually initiate a drag, and is it gated behind `Customized order`
   sort mode, or available regardless of current sort? Does the gesture work
   from anywhere on the row or only from the glyph itself?
3. **Active sort-field indicator.** None of the 9 rows in the Sort-by menu
   show a checkmark or highlight (§2.3) — how does the user tell which sort is
   currently applied? Does `Customized order`'s dim/short styling *mean*
   "currently active," or something else (e.g. "unavailable while another sort
   is applied")?
4. **`Flag` header row's own icon state.** In both S13 and S14 the top-level
   `Flag` row shows a plain white outline swatch even though the row already
   has a green flag applied (confirmed by `Remove flag`'s solid-green icon one
   row below it in S13). Is the header icon simply generic/non-reflective, or
   does it change under some other condition?
5. **`Open symbol screen` destination.** Does this land on the same
   quote-preview bottom sheet a plain row-tap opens (pass-1 S6/S7), or a third,
   fuller surface? This is the key data point for closing master-spec
   ambiguity A2 for good.
6. **`All watchlists` and `Edit`.** Neither was opened in this capture set.
   `All watchlists` is presumably a list-of-lists management screen; `Edit`
   presumably enters a per-row delete/reorder mode on the current list. Both
   need their own capture pass.
7. **News feed pagination/refresh.** Is "News by watchlist" a live feed
   (pull-to-refresh, infinite scroll) or a fixed recent-N snapshot?
8. **Multi-select on the flag/watchlist filter row (S12).** Can more than one
   flag color and/or more than one watchlist be active as a filter
   simultaneously, or is it single-select per group?
9. **D3's hairline hex.** Is `#323234` vs the master's `#414141` real drift or
   a second real token for *this specific* dense-numeric-row context? Needs a
   wider same-context census before deciding.
10. **D6's compact-title size.** Is ~17–18pt a stable "compact/pushed-page
    title" tier, or specific to these two captures? Needs 2–3 more lossless
    samples of pushed (non-modal) page titles to promote to a hard token.

---

## 7. Cross-reference to master spec tokens (what carried over unchanged)

Confirmed exact, no new data: `tvText #DBDBDB` (row content, non-menu
contexts), `tvHairline #4A4A4A` (bold under-tab divider), avatar **36pt**
circle, row **60pt** 2-line grid (§2.6 `.symbol2`), `TVChip` **33–34pt**
capsule + `#2E2E2E` selected fill, `TVPrimaryCTA` capsule shape and margins,
`TVSheetChrome` grabber and 20pt-title-on-modal-sheets rule (still holds for
sheets — only pushed *pages* deviate, D6), close-button circle diameter
**30pt** and glyph tone (`tvDismiss` family), sheet-background `tvSheet
#1C1C1E` family across every new popup surface.
