# spec2-menu-settings.md — TradingView iOS "Menu" tab (profile / settings root)

Source: **one** lossless still, `z-014.png` (1206×2622 px @3x = 402×874 pt). No other
frame in the capture set touches this surface, so per the task brief this document is
the sole source of truth for it — every reachable child screen (Settings, Messages,
public profile, subscription management, Refer-a-friend, Help Center, About, Rate-us,
Sign-out confirmation) is un-photographed and listed under §6 as an open question, not
guessed at.

All pixel measurements below are exact `PIL.Image.getpixel` reads on the lossless PNG
(flat regions, zero JPEG/H.264 noise), converted `pt = px / 3`. Where a measurement
disagrees with `TV_PARITY_MASTER_SPEC.md`, the master file's token is quoted and the
delta is called out explicitly rather than silently folded in — see the "⚠️ DELTA"
callouts inline and the roll-up in §0.

Reused verbatim from the master spec (not re-derived here): tab-bar anatomy (§1.10),
`TVHairline` colour, `TVTile` corner-radius solve method, surface-tier law (§1.2),
type-scale derivation method (ink ÷ 0.705).

---

## 0. Deltas vs. `TV_PARITY_MASTER_SPEC.md` — read this first

| # | Master token | Measured on this screen | Verdict |
|---|---|---|---|
| D1 | `tvTile` fill `#2C2C2E` (44,44,46) | Profile card + both promo cards: flat **`#2E2E2E`** (46,46,46) everywhere sampled | **New token, not `tvTile`.** Call it `tvCard`. Uniform-gray (no blue tint) vs `tvTile`'s faint blue tint. 2-unit delta is outside PNG-noise (source is flat, lossless). |
| D2 | `tvHairline` = 1 pt (3 px) | Every divider on this screen (list rows, tab bar) is **exactly 1 px = 0.33 pt** in the source image — confirmed by row-by-row scan, not a rounding artefact | **This screen's dividers are 3× thinner than the master's measured hairline.** Colour is identical (`#4A4A4A`, exact). Likely a genuine per-screen inconsistency in the real app (thin list rules vs. thick sheet rules), not a measurement error — flag for live-mirror confirmation (§6). |
| D3 | "No pure white for text" (C13) | `kriske0119` username ink is flat **`#FFFFFF`**, sustained across every sampled column, not `#DBDBDB` | Real exception to C13, alongside the already-documented toolbar/hero cases. Add "profile display name" to the pure-white allow-list. |
| D4 | Row secondary line = `tvTextSecondary #8C8C8C` | Promo-card **subtitle** ("Manage your subscription", "Share what you love") measures flat **`#DBDBDB`** — same colour as its own title line, differentiated only by weight/size, not colour | Genuine exception. The stat-row labels ("Published"/"Followers"/"Following") on the *same screen* DO use `#8C8C8C` — so the dimming rule is real, just not applied to promo-card subtitles. |
| D5 | `tvDownText #F7525F` for red text/labels | "Sign out" label **and** its icon both measure flat **`#F23645`** (`tvDownFill`, the fill/badge token) | This row uses the fill red for text, not the text red. Either the text/fill split has an exception for destructive actions, or master's C2 split needs a third context rule. |
| D6 | `tvTextInverse #0F0F0F` | "PREMIUM" badge glyphs measure flat **`#000000`**, not `#0F0F0F` | Minor — likely within design tolerance, but not literally the token value. |
| D7 | `TVMenuRow` height 60 pt (§2.7, sourced from the Indicators picker) | This screen's plain rows (Rate us / Help Center / About / Sign out) pitch at **44 pt** divider-to-divider | Not a contradiction — different screen, confirms master's own note that 60 pt is specific to the Indicators-picker context. This screen needs its **own** row token: `TVAccountRow`, 44 pt. |
| D8 | A1 (open, master §4) — tab-bar selection signal | On this screen (Menu tab active), the **Watchlist** tab glyph is a plain **outline** bookmark (3 horizontal lines, no fill) | **Resolves half of A1.** The "filled bookmark" seen in the master's Watchlist-tab captures is therefore the *selected* state, not a permanent property of that glyph — TradingView's tab bar **does** carry a selection signal after all, at least for Watchlist, conveyed by fill-vs-outline, not colour. The other four tabs' selected states remain unphotographed (still open). |
| D9 | — (new observation) | Card-corner chevrons (profile card, promo cards) measure `#8C8C8C` (`tvTextSecondary`); the plain-list trailing chevron (About row) measures `#707070`/`(112,112,112)` — closer to `tvTextTertiary #6F6F6F` | Two different chevron-tint contexts, not documented anywhere in the master file. |

---

## 1. Surface inventory

Only one surface/state was captured. Listed with its reachable-but-unphotographed
children (never rendered in this capture set):

| Surface | Captured? | Trigger |
|---|---|---|
| **S1 — Menu tab root ("Account home")** | ✅ `z-014.png` | Tab bar → Menu |
| S1a — Settings | ❌ not captured | tap hexagon/gear icon, top-right |
| S1b — Messages / inbox | ❌ not captured | tap speech-bubble icon, top-right |
| S1c — Public profile page | ❌ not captured | tap anywhere on the profile card (whole-card chevron) |
| S1d — Manage subscription | ❌ not captured | tap "You're Premium" card |
| S1e — Refer a friend / share sheet | ❌ not captured | tap "Refer a friend" card |
| S1f — Rate us (likely App Store review sheet, OS-level) | ❌ not captured | tap "Rate us" row |
| S1g — Help Center (likely in-app browser / Safari) | ❌ not captured | tap "Help Center" row |
| S1h — About | ❌ not captured | tap "About" row (has a chevron, confirmed push/present target) |
| S1i — Sign-out confirmation (alert or immediate action?) | ❌ not captured | tap "Sign out" |

S1 is a **full-screen tab page** (tab bar visible, own tvBlack `#000000` background,
no sheet grabber) — per master §1.2 rule 1: "full-screen page that replaces context."

---

## 2. Layout tree — S1 "Menu tab root", top → bottom

Screen: 402 × 874 pt. Background **`#000000`** (`tvBlack`) full-bleed, confirmed at
every sampled gap region.

```
y 0–~68 pt     [iOS status bar — OBSCURED in this capture by a screen-recording
                overlay (green "recording" pill + app-icon watermark]. Not app UI.
                True status-bar height not independently measurable from this frame.]

y ~68–87 pt    UTILITY ICON ROW  (no title, no back button)
               ├─ message/chat icon   x 304.7–323.3 pt   →  §3.1
               └─ gear/settings icon  x 362.0–382.0 pt   →  §3.1
               both right-aligned inside the 20 pt margin (gear right edge = 402−20)

  gap ≈ 25.3 pt (measured 76 px; nearest master token s6=24pt, +1.3pt slack)

y 112.3–238.7 pt   PROFILE CARD (126.3 pt tall, full detail in §3.2)
               fill `tvCard #2E2E2E` ⚠️D1, radius ≈12pt, x 16–386 pt (370 pt wide)
               whole card is one tap target → chevron at top-right, x 355.3–360.7pt

  gap = 8 pt exactly (matches master s2 token)

y 246.7–344.3 pt   PROMO CARD ROW — two cards, 2-col grid (§3.3)
               "You're Premium"     x 16–197 pt   (181 pt wide)
               "Refer a friend"     x 205–386 pt  (181 pt wide)
               gutter 8 pt, margins 16 pt — matches master's 2-col TVTile grid
               (180.7 pt cell / 8.3 pt gutter) almost exactly, despite 97.7pt height
               vs. the 72pt tool-tile height — same grid, taller card.

  gap = 44 pt (measured 132 px — see D7; no section caption in this gap, confirmed
  by full-width ink scan, zero pixels above bg)

y 388.3–508+ pt   ACCOUNT LIST — section 1, three rows, `TVAccountRow` 44pt (§3.4)
               "Rate us"       (icon + label, NO chevron)
               ── 1px/0.33pt divider `#4A4A4A`, x 54–400 pt ⚠️D2 ──
               "Help Center"   (icon + label, NO chevron)
               ── divider ──
               "About"         (icon + label, chevron present)
               ── divider ──

  gap ≈ 57 pt (section break — whitespace-only, per master's TVMenuRow convention)

y ~565–584 pt   ACCOUNT LIST — section 2, single row
               "Sign out"  — icon + label, both `#F23645` ⚠️D5, own divider below

y ~600–~874 pt  Empty `#000000` — confirmed zero ink pixels anywhere in this band
               (no version/build string, no footer) → §6 open question

y 791.0 pt      Tab-bar hairline (exact match to master §1.10)
y 791.3–874 pt  TAB BAR — Watchlist · Chart · Explore · Community · Menu (§3.5)
               Menu is the active tab; shows NO unique highlight vs. the other four.
```

---

## 3. Component anatomy

### 3.1 Utility icon row (new — not in master spec)

Two bare (no background, no circle) icon buttons, right-aligned under the status bar,
no divider beneath, no title/back-button alongside them.

| | Message / chat icon | Settings / gear icon |
|---|---|---|
| bbox (px) | 914–970 × 205–261 | 1086–1146 × 207–259 |
| bbox (pt) | 304.7–323.3 × 68.3–87.0 | 362.0–382.0 × 69.0–86.3 |
| ink size | ≈18.7 × 18.7 pt | ≈20.0 × 17.3 pt |
| shape | speech-bubble outline, 2 horizontal lines inside, small tail bottom-left | hexagon outline with a small circle centred inside — a stylised "nut", not a gear-tooth glyph |
| nearest SF Symbol | `message` / `bubble.left` (inexact — TV's has 2 lines not 3, plus the tail) | none exact; closest built-in is `hexagon` + a manually inset `circle`, or treat as a fully custom vector |
| colour | `#DBDBDB` (`tvText`) | `#DBDBDB` (`tvText`) |
| right inset | — | 20 pt from screen edge (1206−1146=60px) — matches master `s5` |
| gap between icons | 116 px = 38.7 pt | |

### 3.2 Profile card

Single card, `tvCard #2E2E2E` fill, ≈12 pt corner radius (circle-fit solve, consistent
with master's tvTile radius method — this is the one place D1's colour delta does NOT
carry over to radius).

| Element | Geometry (pt) | Style |
|---|---|---|
| Card bounds | x 16–386 (370 wide) × y 112.3–238.7 (126.3 tall) | fill `#2E2E2E`, r≈12pt |
| Chevron (top-right, whole-card affordance) | x 355.3–360.7 × y 134.7–145.3 | `#8C8C8C`, ≈5.3×10.7pt ink |
| Avatar | x 32–78 × y 128.3–174.3 → **46×46 pt square**, rounded (r≈8pt, softer than the card's own 12pt) | fill flat **`#666080`** (102,96,128) — a muted indigo/gray placeholder, not a semantic token; letter "K" centred, flat **`#FFFFFF`**, Bold, ink ≈ 26–28pt equiv. |
| Username "kriske0119" | left edge x 95pt, ink y 130.7–144.7pt (digit-only ink height 12.0pt) | **flat `#FFFFFF`** ⚠️D3, weight Bold/Heavy, size ≈18pt by ink÷0.705 (12.0/0.705=17.0, rounds to the 18pt "row primary (menu rows)" family) |
| "PREMIUM" badge | x 94–168.3 × y 154.3–174.0 → **74.3 × 19.7 pt** | fill flat **`#DBDBDB`**; **flag/ribbon shape**: left edge is a rounded rect, right edge cuts on a diagonal — top-right corner sits ≈7.7pt further right than the bottom-right corner (measured Δx=23px over Δy=51px ⇒ ≈24° off vertical). Label "PREMIUM" flat **`#000000`** ⚠️D6, Bold, all-caps, ≈13pt, tight/no visible extra tracking beyond normal caps spacing. |
| Stats row (3 equal columns) | numbers: y ink 194.0–204.7 (11.0pt ink ⇒ ≈17pt Bold); labels: y ink 210.7–219.3 (9.0pt ink ⇒ ≈13pt Semibold) | numbers `#DBDBDB` (219,219,219, exact); labels `#8C8C8C` (140,140,140, exact) — this is the "expected" secondary-text tier, in direct contrast with D4's promo-card exception |
| — column left edges | col1 "0"/"Published" x=33pt; col2 "2"/"Followers" x=174pt; col3 "1"/"Following" x=313pt | ≈140pt pitch between columns — reads as 3 equal-width flex columns across the card's content width, not fixed-offset |
| — number↔label vertical gap | ink-to-ink ≈6pt | |
| — avatar-top → card-top inset | 16pt (both x and y) | matches card's own 16pt margin |
| — badge-bottom → stat-row-top gap | 20pt (582−522=60px) | matches master `s5` exactly |

### 3.3 Promo card (new component — "TVPromoCard", not in master's `TVTile` family)

Two cards, same 2-column grid math as master's `TVTile` 2-col (180.7pt cell / 8.3pt
gutter / 16pt margin — measured here as 181pt / 8pt / 16pt, within rounding), but a
**taller, 3-line anatomy** (icon+chevron header row, then title, then subtitle) vs.
`TVTile`'s icon-over-label. Do not conflate the two components.

| Metric | Value |
|---|---|
| Card size | 181 × 97.7 pt (measured 543×293px) |
| Fill | `#2E2E2E` (`tvCard`, same as profile card — ⚠️D1) |
| Corner radius | ≈12pt (same circle-fit as `tvTile`) |
| Gutter between the two cards | 8 pt exactly |
| Outer margins | 16 pt (both sides) |
| Icon inset (from card's own left/top edge) | ≈20pt left, ≈14pt top |
| Icon ink size | card1 (plan glyph) ≈16.7×15.7pt; card2 (person+arrow) ≈20.7×18.7pt — sizes vary per glyph, not on a fixed grid |
| Card1 icon | slanted-parallelogram outline ("plan/membership" mark) — **no SF Symbol equivalent**, custom vector |
| Card2 icon | person silhouette + diagonal arrow (invite/refer mark) — nearest SF Symbol is a composite of `person` + `arrow.up.right`, no single built-in match |
| Chevron (top-right of each card) | ≈5.3×10.7pt ink, colour `#8C8C8C` (`tvTextSecondary`) — right inset ≈25.3pt from the card's own right edge (bigger than the icon's left inset; not symmetric) |
| Title ("You're Premium" / "Refer a friend") | ink height 11.3pt (cap-only, measured on "You'r") ⇒ ≈17pt, weight **Bold** (thick strokes, distinctly heavier than the row labels in §3.4), colour flat **`#DBDBDB`** |
| Subtitle ("Manage your subscription" / "Share what you love") | ink height 9.33pt (incl. descenders) ⇒ ≈15pt Regular, colour flat **`#DBDBDB`** ⚠️D4 — **NOT** dimmed to `#8C8C8C` despite being visually/semantically a "subtitle" |
| Title→subtitle gap | ≈10.7pt | |
| Icon/chevron-row → title gap | ≈21.7pt | |
| Subtitle → card-bottom padding | ≈13.7pt | |

### 3.4 `TVAccountRow` — the plain list row (new token; NOT `TVMenuRow`)

Used for: Rate us, Help Center, About, Sign out. Full-bleed on the `#000000` page
background (no row/card fill of its own).

| Metric | Value |
|---|---|
| Row height (divider-to-divider pitch) | **44 pt** ⚠️D7 (not master's 60pt `TVMenuRow` — that token is specific to the Indicators-picker screen) |
| Icon left inset | ≈18.3pt (measured 55px; master's `TVMenuRow` analog uses 20pt — within noise, treat as 20pt) |
| Icon ink size | ≈19.3×19.3pt (Rate-us icon measured 58×57px) — matches master's "20pt ink in menu rows" family |
| Label left edge | 55.3pt (166px) | 
| Label size/weight | ink height 12.0pt (digit/cap-only) ⇒ ≈18pt, weight looks Bold/Semibold (same family as the username in §3.2) |
| Label colour | `#DBDBDB` for Rate us / Help Center / About; **`#F23645`** for Sign out ⚠️D5 |
| Trailing chevron | present **only on "About"** (Rate us and Help Center have none — these are presumably external/action rows, not navigational pushes) |
| Chevron size/inset (About) | ink ≈4.7×24pt... actually ≈4.7pt wide × 24px=8pt — measured bbox 1115–1129 × 1450–1474px ⇒ 4.7×8pt ink; right inset from screen edge = 25.7pt |
| Chevron colour (About) | **`#707070`** (112,112,112) ⚠️D9 — closer to `tvTextTertiary #6F6F6F` than to the card-chevron's `#8C8C8C` |
| Divider | 1px = **0.33pt** ⚠️D2, colour `#4A4A4A` (exact `tvHairline` hex), left-inset to x=54pt (aligned to label, not icon), right edge ≈2pt short of the true screen edge (essentially flush) |
| Row grouping | Rate us / Help Center / About form one section (3 rows, 2 internal dividers + 1 trailing divider); Sign out is its own section, separated by ≈57pt of plain whitespace, no caption text in the gap |
| Sign-out icon | door outline with a leftward arrow through it (logout glyph) — nearest SF Symbol `rectangle.portrait.and.arrow.right`, horizontally mirrored | colour `#F23645`, same as its label |

### 3.5 Tab bar

Matches `TV_PARITY_MASTER_SPEC.md` §1.10 pixel-for-pixel on this frame — hairline at
y=791.0pt exactly, background `#040404`, all 5 labels/icons flat `#DBDBDB`
((219,219,219) on Watchlist/Menu labels, (209,212,220) on the Chart icon — within
antialiasing noise of the same token).

New finding this pass (see D8): **with Menu as the active tab, the Watchlist tab's
bookmark glyph renders as a plain 3-line outline, not filled.** Confirmed by direct
zoom — no fill, uniform `#DBDBDB` stroke only. This means the "filled bookmark" seen
in the master spec's own Watchlist-tab captures is very likely that tab's **selected**
state, not a fixed property of the icon. The master's A1 ambiguity ("is there any
selection signal at all?") should be updated: **yes, for Watchlist, fill vs. outline.**
The other four tabs' selected variants remain unphotographed — still open (§6).

Chart tab retains its red notification dot (`#F23645`, ⌀≈5.5pt, top-right of the
icon, exact token match). Community tab shows **no** dot in this capture (dot is
therefore state-dependent/unread-count-dependent, consistent with master's note).

---

## 4. Navigation relationships

```
Tab bar → Menu (this surface, S1, full-screen page, tab bar persists)
S1
 ├─ tap message icon      → S1b Messages/inbox  [target type unknown: sheet or push?]
 ├─ tap gear icon         → S1a Settings         [target type unknown]
 ├─ tap profile card      → S1c Public profile   [whole-card tap target, own chevron]
 ├─ tap "You're Premium"  → S1d Manage subscription
 ├─ tap "Refer a friend"  → S1e Refer-a-friend / share sheet
 ├─ tap "Rate us"         → S1f likely SKStoreReviewController / App Store, NOT
 │                           an in-app screen (no chevron ⇒ consistent with an
 │                           external/system action rather than a push)
 ├─ tap "Help Center"     → S1g likely in-app browser (no chevron here either —
 │                           inconsistent with "About" which does chevron+push;
 │                           needs live-tap confirmation, see §6)
 ├─ tap "About"           → S1h About screen (has chevron ⇒ confirmed push/present)
 └─ tap "Sign out"        → S1i unknown: could be immediate action or a
                             confirm-alert first (destructive-red styling suggests
                             at minimum a system alert is likely, per iOS HIG norms)
```

No sheet is presented anywhere in this capture — S1 is a plain full-screen tab page,
consistent with master §1.2 rule 1.

---

## 5. FEATURES — every product capability visible in this surface

1. **Signed-in identity display**: avatar-initial placeholder, username, membership
   tier badge ("PREMIUM").
2. **Social/creator stats**: Published (chart/idea count), Followers, Following —
   all zero/low here (0/2/1), implying this is a consumer account, not a publisher.
3. **Whole-card navigation to a public profile page** (top-right chevron on the
   profile card as the only visual affordance; the entire card is presumably tappable).
4. **Subscription management entry point** ("You're Premium" / "Manage your
   subscription") — a dedicated promo card, not buried in a list row.
5. **Referral program entry point** ("Refer a friend" / "Share what you love").
6. **In-app messaging/inbox** (top utility icon — unconfirmed target).
7. **Settings** (top utility icon, gear/hexagon — unconfirmed target, but this is
   presumably where the bulk of "menu-settings" configuration actually lives, and
   it is completely unphotographed in this pass).
8. **App Store review prompt** ("Rate us").
9. **Help Center / support access**.
10. **About screen** (likely app version, legal, licenses — chevron confirms it's a
    real navigable destination).
11. **Sign out** — destructive, red, isolated as its own section at the bottom.
12. No footer/build-number/version string is visible anywhere on this screen in
    this capture (confirmed via full-width pixel scan of the empty region below
    Sign out) — if TradingView shows one, it's either below a fold not captured,
    on the About screen instead, or genuinely absent from this tab's root.

---

## 6. Open questions needing live interaction

1. **What does tapping the gear icon actually open?** This is presumably the real
   "Settings" surface implied by this task's "menu-settings" naming, and it has
   zero photographic coverage. High priority to capture before building.
2. **What does the message icon open?** Direct messages inbox vs. notifications
   vs. something else.
3. **Sign-out confirmation**: immediate sign-out vs. a confirm alert/action sheet.
4. **Why do "Rate us" and "Help Center" have no trailing chevron while "About"
   does?** Confirm whether this is a deliberate "external action = no chevron"
   convention (Rate us → App Store, Help Center → browser) vs. an inconsistency,
   and confirm Help Center's actual presentation (in-app Safari vs. push).
5. **Divider thickness (D2)**: is 0.33pt on this screen a real, intentional
   difference from the 1pt hairline used elsewhere, or a rendering/DPI artefact
   specific to this screen's list style? Needs a same-device comparison against
   another hairline-bearing screen at identical zoom.
6. **Tab-bar selection signal (D8) for the other four tabs**: confirmed for
   Watchlist (fill vs. outline). Chart/Explore/Community/Menu need the same
   before/after comparison — tap into each tab and screenshot, per master A1.
7. **Is there a version/build string anywhere on this tab** (scrolled off, on
   the About page, or truly absent)?
8. **Promo-card subtitle colour (D4)**: confirm this isn't specific to a "Premium
   member" account state — a non-premium account's card content (likely an
   upsell "Go Premium" card instead of "You're Premium") may use the normal
   dimmed-secondary convention; re-check on a free-tier account if available.
9. **Status bar**: fully obscured by a screen-recording overlay in this capture;
   no clean status-bar reference exists for this surface specifically (though
   the master spec has clean status bars from other screens that should transfer).
