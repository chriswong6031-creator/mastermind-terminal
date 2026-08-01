# POLISH ROUND SPEC (2026-08-01)

Synthesis of 74 audit findings (IPAD-01…19, ANIM-01…24, CHART-01…15, SCREEN-01…07, SWEEP-*) into one
build contract. 66 findings survive as work; 8 are dropped (§5). Findings that share a root cause are
merged into a single item and carry all their ids.

---

## 0. Binding laws (apply to every item, no exceptions)

| # | Law | Enforcement |
|---|---|---|
| L1 | **All iOS UI derives from the measured spec** `docs/tv-parity/TV_PARITY_MASTER_SPEC.md`. No improvised design. A number not in the spec is an *invention* and must be registered in §4-A20 before it ships. | §4 A20 ledger |
| L2 | **Web changes are shell-scoped only.** Every CSS rule lands under `html[data-shell="app"]`; every JS branch behind `shellAxis()` / the `clean` flag. The public web app must render pixel-identically. | `terminal/e2e/shell-mode.spec.ts` + `npm run test:e2e:responsive` (from `terminal/`) |
| L3 | **Chart math and rendering stay in `terminal/`.** Native code is presentation and OS integration only — no indicator math, no candle drawing, no entitlement logic. | Review gate on `apps/ios/**` |
| L4 | **Simulator builds must ad-hoc sign** (`CODE_SIGN_IDENTITY="-"`), or the install fails `-34018`. | Build step |
| L5 | **iOS 26 tab bar**: the app owns its bar outright. Item A1 removes the system bar entirely, which retires the custom-overlay trick rather than extending it. | Item A1 |

### Verified corrections to the incoming findings

These were checked against the repo and the TV corpus during synthesis. Builders must use the
corrected facts, not the finding text.

- **CHART-01 confirmed by independent measurement.** `IMG_2321.PNG` at x=250 samples
  `(24,26,37)` at y=190 → `(19,22,33)` at y=2200 — monotonic, **lightest at top**. The delta spec
  already records this (`CHART_SURFACE_DELTA_SPEC.md:418`, "measured `#171B27` top / `#131723`
  bottom") but the shipped rule uses the arrow, not the measurement. The defect is real and is a
  documented internal contradiction.
- **CHART-02 confirmed both halves.** TV row y=700 across x 1010–1050 is uniform `(23,26,37)` — no
  price-scale border pixel. TV's time axis *does* keep a rule: x=300, y 2133–2135 = `(42,45,56)` =
  `#2A2D38`.
- **SCREEN-04 confirmed and re-filed.** TV's *selected* Chart tab is a white filled shield/badge
  containing black candles — not a solid variant of the bar-chart glyph. The finding pointed at
  `TVKit.swift:1549-1559`, which is `TVTabBarMetrics` (constants only); **the glyph table is in
  `MastermindTerminalApp.swift`** (`view(for:selected:)` ~:352). Ownership follows the real file.
- **IPAD-16 confirmed.** A case-insensitive grep for ipad/landscape/orientation/size class/tablet
  over all 912 lines of the master spec returns zero matches. The §4 ledger ends at A19.
- **IPAD-03 confirmed.** The only size-class read in the entire app is `ChartScreen.swift:14`.
- **SWEEP-FORCE-UNWRAP-002 downgraded P1 → P2.** Both unwraps exist (`AuthCore.swift:176` and `:179`,
  not 177/179) but both are provably safe — the URL is built from a static `AppConfig.supabaseURL`
  and the query items are percent-encoded. Hygiene, not a crash risk.
- **`terminal/` D-block has zero `@media` queries** (verified across lines 3426–3620), so CHART-09's
  premise holds exactly.

---

## 1. BUILDER A — `native-shell-ipad`

**Owns:** `apps/ios/MastermindTerminal/MastermindTerminalApp.swift`, `ChartScreen.swift`,
`ChartWebView.swift`, `WatchlistScreen.swift`, `ExploreScreen.swift`, `MenuScreen.swift`,
`SearchSheet.swift`, `PreviewSheet.swift`, `AnalysisHubSheet.swift`, `CommunityScreen.swift`,
`Assets.xcassets/**`, `apps/ios/MastermindTerminal.xcodeproj/project.pbxproj`,
`docs/tv-parity/TV_PARITY_MASTER_SPEC.md`, `docs/tv-parity/NATIVE_FEATURE_GAP_LEDGER.md`.

> **Dependency:** items A4, A6, A7, A9, A11 consume primitives that Builder B adds
> (`TVReadableWidth`, `TVWidthClass`, `TVPressStyle`, `TVAccountRow.trailingProgress`,
> `tvBadgeDot` transition). Builder B lands those as **additive API with defaults** first; Builder A
> merges after. Nothing in Builder B's set requires a Builder A file to compile.

### A1 — P0 · Kill the `TabView`; the app owns one bar
`IPAD-01, IPAD-02, IPAD-04, IPAD-13, IPAD-17, IPAD-19, ANIM-11`

**Files:** `MastermindTerminalApp.swift` (:80, :104–129, :133–139, :157, :192–199, :277–299,
:377–414), `ChartScreen.swift` (:86, :113–121).

Two tab bars render simultaneously on iPad. From iPadOS 18 a `TabView` built from `.tabItem` adopts
the **top floating capsule** placement, which `UITabBarAppearance` cannot reach — so
`TVTabBarChrome.apply()` neutralises nothing (measured: capsule 476.5 × 43.5 pt at y 32–75.5 pt,
labels only, system-blue selection despite `.clear` on icon/title/tint), while `TVRootTabBar` still
draws ours at the bottom. ~187 pt of tab chrome against the spec's 83 pt.

Mechanism:

1. Replace `RootTabsView`'s `TabView` with a plain container that keeps all five screens mounted:
   `ZStack { ForEach(AppModel.Tab.ordered) { screen($0).opacity(model.tab == $0 ? 1 : 0).allowsHitTesting(model.tab == $0).zIndex(model.tab == $0 ? 1 : 0) } }`.
2. Attach the real bar as `.safeAreaInset(edge: .bottom) { TVRootTabBar(...) }` — **not** a `ZStack`
   sibling. This is the single fix for IPAD-02: the RollerStrip is currently drawn *underneath*
   `TVRootTabBar` on iPad because the overlay relies on `TabView` reserving an equal bottom inset,
   and the top-capsule `TabView` reserves **zero**. Measured: strip at 1138.5–1190.2 pt, bar at
   1140.5–1210 pt — 2 pt survives.
3. Delete `TVTabBarChrome`, `TVSystemTabBarInert`, `TVSystemTabBarHidden` and both comment blocks at
   :196–199 and :380–383 (IPAD-17 — the claim that `UIDesignRequiresCompatibility` is unreachable
   from a generated Info.plist is **false**; `INFOPLIST_KEY_*` reaches it and the target already
   injects five at `project.pbxproj:191-195`. It is nonetheless a deprecating shim, which is why we
   own the bar instead. Delete the comments rather than correct them).
4. C25 minimize becomes `if !model.chromeMinimized` **inside the inset builder**, animated. This
   retires both the `.offset(y: TVTabBarMetrics.totalHeight)` trick and the double layout shift
   (IPAD-04: on iPad, hiding the "system" bar jumped the chart *up* ~118 pt while our bar slid
   *down* 83 pt).
5. **ANIM-11** — delete the implicit `.animation(.easeOut(duration: 0.22), value:)` at :139 so the
   single `withAnimation` at the mutation site owns the whole transaction; change the curve at both
   mutation sites (`ChartScreen.swift:118`, `MastermindTerminalApp.swift:157`) to
   `.spring(response: 0.34, dampingFraction: 0.92)`.
6. **IPAD-13** — `TVTabBarMetrics.totalHeight = 83` is `49 + 34` (iPhone home-indicator inset); iPad's
   is 20 pt (measured bar band = 69 pt), so the old offset over-travelled by 14 pt. Keep
   `contentHeight = 49` as the measured token; the inset rewrite removes `totalHeight` from the
   animation path entirely. Do not hardcode a second constant.
7. **Migration cost, same PR:** the five screens' `.onAppear`/`.onDisappear` QuoteTicker start/stop
   pairs (`WatchlistScreen.swift:62-63`, `ExploreScreen.swift:95-96`) must become
   `.onChange(of: model.tab)` or `.task(id: model.tab)` — otherwise every poller runs forever now
   that all screens stay mounted. **This is not optional.**
8. **IPAD-19** falls out for free: pushed `ShellWebScreen`s (`ExploreScreen.swift:366-382`) and
   Menu→About currently stack an inline nav bar *under* the capsule for four chrome bands. Prove it
   with the new captures in §3.

Do **not** take the `INFOPLIST_KEY_UIDesignRequiresCompatibility` fallback. It is recorded here only
so a future session does not rediscover it as a "simpler fix".

### A2 — P0 · Chart boot paints a skeleton, never a black flash
`ANIM-05, ANIM-24`

**Files:** `ChartScreen.swift` (:49–56, :64–83, :139, :257–307).

`LoadingCover` fills `Theme.bg` = `#000000` over the `#131722→#181B26` canvas gradient and is removed
in one frame with no transition — a black→navy cut. Replace with a `ChartSkeleton` drawn on the
**same gradient** (delete `Theme.bg.ignoresSafeArea()`; let the parent gradient show through): a
right-hand price-axis rail plus 3 stacked `RoundedRectangle(cornerRadius: 6).fill(Color.white.opacity(0.05))`
bands at the pane heights the chart will occupy, shimmered with `.phaseAnimator([0,1])` moving a
`LinearGradient` mask left→right over 1.2 s linear repeat.

Give it `.transition(.opacity)` and drive readiness through a `@State showsCover` written inside
`withAnimation(.easeOut(duration: 0.28))` from `.onChange(of: bridge.isReady)`. Do **not** edit
`ShellBridge.swift` — that file belongs to Builder B and the animation can be owned entirely here.

**ANIM-24:** give `ErrorCover` the same `.transition(.opacity)`, write `loadError` inside
`withAnimation(.easeOut(duration: 0.25))` at all three sites (:61, :71, :78), and replace
`ErrorCover`'s `Theme.bg.ignoresSafeArea()` (:282) with `Color.black.opacity(0.72)` so the chart
gradient stays visible behind the message.

### A3 — P1 · Chart gradient direction (native half)
`CHART-01` (native half; web half is C1)

**Files:** `ChartScreen.swift:52-56`, `ChartWebView.swift:41-43`.

The gradient runs darkest-at-top / lightest-at-bottom, so the *brightest* canvas row butts against
the pure-black toolbar — that is the visible seam. TV is the opposite. Swap to
`colors: [Theme.chartBgBottom, Theme.chartBg]` and set the WebView backdrop to the gradient's **top**
stop (`webView.backgroundColor = UIColor(Theme.chartBgBottom)`), which is what shows during first
paint. Update the §3.3.1 comment at :47-49, which currently states the inverted order as fact.

> Rejects the brief's "go pure-black TV skin" question: TV's chart canvas is navy, not black. Only
> TV's *symbol-detail sheet* chart is `#000000` (`IMG_2325.PNG`). The defect is direction, not hue.

### A4 — P1 · The regular-width content column (adoption)
`IPAD-03, IPAD-06, IPAD-07, IPAD-09, IPAD-11`

**Files:** `WatchlistScreen.swift` (:113–141, :188), `ExploreScreen.swift` (:101, :116),
`SearchSheet.swift` (:33–57, :99–117), `MenuScreen.swift` (:31, :76, :172).
**Consumes:** `TVReadableWidth`, `TVWidthClass` from Builder B (item B1).

Every screen is the 402 pt reference phone layout stretched to 834 pt. Wrap the following in
`TVReadableWidth`; change nothing else:

- **Watchlist** `rowsList` (:188) — currently 'BTC-USD' ink ends ~x 135 pt while its price starts
  ~x 735 pt, ~620 pt of dead middle. Keep hairline dividers **full-bleed** (TV keeps rules
  edge-to-edge while content is inset). **Do not invent columns** (sparkline, market cap) to fill the
  gap — that is anatomy the spec does not measure.
- **Watchlist header row** (:113) — keep the absolute-centre `ZStack`; it is correct and only needs a
  bounded container. `•••` at 32 pt / `+` at 19.3 pt keep their measured insets *within* the column.
- **Explore header** (:101, :116) — the bare `magnifyingglass` currently sits ~660 pt from its title.
- **Search** (`SearchSheet.swift:33`) — wrap the `VStack` (field, chips, rows share one centred
  column) so §2.2's 31.7 / 19.3 / 8.7 pt rhythm and the §2.6 `.symbol2` trailing grid survive. Keep
  the overlay itself full-bleed `Theme.panel2`. **Single list only** — no two-column result grid; TV's
  search is one list and there is no iPad capture to say otherwise.
- **Menu** root `VStack` (:31) — the §2 rhythm (25.3 / 8 / 44 / 57 pt) and the 44 pt `TVAccountRow`
  are all preserved; only the column narrows and centres.

The y-band regression on the headers (measured: first content row at y 115 pt) resolves itself once
A1 removes the capsule.

### A5 — P1 · Explore regular-width grids
`IPAD-08`

**Files:** `ExploreScreen.swift` (:28, :39, :138, :189, :211, :298).

`actionWidth 117.7 × 4 + 3 × 8.3 + 16` = 511.7 pt of 834; the `LazyHGrid` carousel ends ~485 pt. Both
are horizontal `ScrollView`s whose reason to scroll (the phone's 402 pt clip, spec2-explore §3.3's
"peek") has evaporated.

Branch on width class. **Regular:** action row becomes
`LazyVGrid(columns: [GridItem(.adaptive(minimum: 117.7, maximum: 160), spacing: 8.3)])`; carousel
becomes a non-scrolling `LazyVGrid(columns: .adaptive(minimum: 149.7))` inside `TVReadableWidth`,
preserving `cardHeight`, `cardGutter`, `cardRowGutter` and `ExploreColumnRule` **exactly**.
**Compact keeps today's code path byte-for-byte.** Column count → A20.

### A6 — P1 · Explore action row is the wrong primitive
`SCREEN-02`

**Files:** `ExploreScreen.swift` (:159–189).

The News/Calendar/Discover row ships as icon-over-label tiles measuring ~112 × 64 pt — `TVTile`
geometry (§3.5.6's Analysis-hub tool tile), where master spec **§3.8.2** calls for
"filled `#2E2E2E` capsule buttons, 13–14 pt labels". The correctly-built capsule row
(Equities/Crypto/Funds/Indices, ~31–34 pt) sits directly above it on the same screen, so the mismatch
is self-evident — the app has both patterns and used the wrong one.

Rebuild as `TVNavPill`/`TVChip`-style capsules, ~31–34 pt tall, single-line label, `Theme.pill` fill.
The **inventory** (News / Calendar / Discover / Analysis rather than TV's News / Calendar / Brokers)
is spec-sanctioned by §3.8.6 — do not change it; only the shape is wrong.

### A7 — P1 · Menu ships one promo card where the spec measures two
`SCREEN-03`

**Files:** `MenuScreen.swift` (:41, :206–221).
**Consumes:** `TVPromoCard` width cap from Builder B (item B7).

Master spec §3.7.3 and `spec2-menu-settings.md:83-88` both document **two** `TVPromoCard`s in a
2-column grid (subscription-manage + refer-a-friend), 181 pt cell, 8 pt gutter. `TVKit.swift:1499`
documents the 181 pt cell but the view uses `maxWidth: .infinity`, and MenuScreen instantiates one,
so it stretches to a 369.7 pt full-width block. The refer-a-friend card is absent with no
"not in this alpha" placeholder, unlike every other alpha gap on the screen.

Wrap `promoCard` in an `HStack` with a second `TVPromoCard`. Since no referral flow exists, ship it as
an explicit alpha placeholder using the same alert pattern already used elsewhere in `MenuScreen`.

### A8 — P1 · Selected Chart-tab glyph
`SCREEN-04`

**Files:** `MastermindTerminalApp.swift` (~:340–360, `view(for:selected:)` and the glyph pair table),
`Assets.xcassets/**`.

Verified against `IMG_2298.PNG`: TV's **selected** Chart tab is a white filled shield/badge
containing a small black two-candle glyph, with the red dot layered on top. The other four tabs are
outline white in the same frame. Ours renders a solid-filled 3-bar chart — an outline→solid variant,
which is what §1.10's law prescribes generally but is the wrong *base shape* here.

Add a custom `chart-tab-selected` imageset (SF Symbols has no shield-with-candles) and use it for the
Chart tab's selected state only. Keep the existing outline glyph for unselected and keep the red dot.
This resolves §4-A1r: the red dot **does** survive selection.

> The **unselected** shield is not captured in the corpus. Register that gap in the A-ledger (item
> A12); do not invent an outline shield this round.

### A9 — P1 · iPad sheets: detents are silently discarded
`IPAD-10`

**Files:** `WatchlistScreen.swift:78`, `AnalysisHubSheet.swift:90,107`, `PreviewSheet.swift:55,69,81`.

`presentationDetents` are honoured only when the presented sheet's horizontal size class is compact;
in iPad regular width SwiftUI falls back to a centred `.formSheet`. So symbol-detail's
`.fraction(0.91)` (spec-symbol-detail §2B: "top edge begins at ~y83 of the 874 pt reference device")
and the hub's `[.fraction(0.6), .large]` both collapse to a generic card — while `TVGrabber` still
paints the 36.7 × 5.3 pt drag handle on a surface with no drag-to-resize behind it.

Per width class: **compact unchanged**. **Regular** — present symbol-detail and the Analysis hub as a
`.fullScreenCover` with the same internal layout and an explicit Close control (preferred over
`.presentationSizing(.page)` for parity), and suppress `TVGrabber` when the surface is not
drag-dismissable. Re-derive `PreviewSheet.chartHeight` from the presented container height via
`GeometryReader`, anchored on the measured 430/874 ratio, instead of the 430 pt constant. → A20.

### A10 — P1 · Chart rotation rule is phone-only
`IPAD-05`

**Files:** `ChartScreen.swift` (:6–8 header contract, :86).

`if verticalSizeClass != .compact` is a phone-landscape test; iPad reports `.regular` in every
orientation and every Split View / Stage Manager configuration, so the branch is a constant `true`
and the landscape full-bleed contract never fires. iPad landscape (1210 × 834) keeps all chrome —
~187 pt of 834 (22%).

Replace with an explicit `isImmersiveChart`:
`UIDevice.current.userInterfaceIdiom == .phone ? verticalSizeClass == .compact : model.chromeMinimized`.
On iPad **do not auto-hide on rotation** — an 834 pt-tall landscape iPad has room for the strip.
The C25 minimize-rect becomes the single immersive verb on that idiom; persist its state per
orientation. → A20.

### A11 — P2 · Watchlist dropdown: popover in regular width, lighter scrim in compact
`IPAD-15, ANIM-15`

**Files:** `WatchlistScreen.swift` (:326–363, :371–455, :551–563).

Today: a 250 pt card hard-anchored at leading 11.7 / top 44.3 pt under a **55%-black scrim** that dims
an entire 834 × 1210 pt window, opening on a 0.12 s fade too fast to read as motion. TV's `•••`
popover (`t-096/t-097`) sits over an **undimmed** page.

- **Regular width:** present the identical `dropdownCard` content through
  `.popover(isPresented:attachmentAnchor:arrowEdge:)` anchored on the `•••` button, no scrim. Keep the
  accordion body (`rootMenu` / `sortBranch` / `editBranch` / `allListsBranch`) and all copy unchanged;
  the popover also replaces the fixed anchor with a real one. → A20.
- **Compact width:** keep the overlay, but drop the scrim to `Color.black.opacity(0.22)` (retain it as
  the tap-out target), change `.transition` at :348 to
  `.scale(scale: 0.92, anchor: .topLeading).combined(with: .opacity)`, replace all six
  `.easeOut(duration: 0.12)` calls with `.spring(response: 0.30, dampingFraction: 0.82)`, and add
  `.animation(.spring(response: 0.32, dampingFraction: 0.9), value: expanded)` on `dropdownCard` so
  its height interpolates instead of stepping.
- **SWEEP-COLOR-POPUP-ROWS:** keep `WLPopup`'s local `0xF6F6F6 / 0x9E9EA4 / 0x747574` and add a
  comment citing spec2-watchlist D7/D8 — these are spec-locked popup-specific colours that
  intentionally differ from the sheet/page tokens. Do **not** hoist them into `Theme`; a semantic
  token name invites someone to "adjust" a measured value.

### A12 — P1 · Open §4-A20 and the regular-width chapter
`IPAD-16, SCREEN-04 (unselected shield), SCREEN-05, SCREEN-06, SCREEN-07`

**Files:** `docs/tv-parity/TV_PARITY_MASTER_SPEC.md` (:367–399, :811, :889),
`docs/tv-parity/NATIVE_FEATURE_GAP_LEDGER.md`.

The standing build contract has no regular-width chapter, so every iPad decision in this round is an
unbacked extrapolation. §1.10 measures the bar on a single 402 × 874 device; the §4 ledger stops at
A19; there is **no TradingView iPad reference imagery in either corpus** (all 47 `IMG_*.PNG` are
iPhone).

1. Open **§4-A20 — iPad / regular-width anatomy**, framed like A12–A19 ("resolve by live
   screen-mirroring"), listing every §4 item of this spec.
2. Add a **§6 "Regular width"** chapter stating the conservative extrapolation law:
   (1) measured tokens — row heights, insets, type, radii, hairlines, tab pitch — **never** change
   with width; (2) only the content-column **width** and grid column **count** may adapt; (3) no new
   component, column or affordance may be introduced for iPad without a captured reference.
3. Add to the ledger, as evidence-acquisition (not build) items:
   - TradingView-for-iPad captures — blocks re-deriving every A20 number.
   - The **unselected** Chart-tab shield glyph (A8).
   - **§4-A15** stays open: the orange `D` badge's real trigger rule and per-row frequency are
     unconfirmed; our always-on-for-delayed-equities behaviour runs ahead of the evidence (SCREEN-07).
   - Note the two deliberate deviations so no future session re-files them as defects: the merged
     single search surface (SCREEN-05, TV keeps Add-Symbol §3.2.6 and Compare §3.2.9-11 visually
     distinct) and the crypto-forward category chip order (SCREEN-06, vs §3.2.4's
     All/Stocks/Funds/Futures/Forex).

### A13 — P2 · Decide the multitasking posture explicitly
`IPAD-14`

**Files:** `project.pbxproj` (:191–195, :207).

The target ships `TARGETED_DEVICE_FAMILY = "1,2"` with all four iPad orientations and no
`UIRequiresFullScreen`, so the app is fully resizable in Split View, Slide Over and Stage Manager —
down to ~320 pt. Fixed-pixel blocks that clip there: RollerStrip's non-scrolling leading block
(`13.3 + 83.4 + 54 = 150.7 pt` before the icon cluster's `GeometryReader` starts), the `•••` popup's
hard 250 pt, `PreviewSheet.chartHeight`'s hard 430 pt.

**Ship (a) for this alpha:** add `INFOPLIST_KEY_UIRequiresFullScreen = YES` so the geometry contract
stays "one window, one size class per orientation" — the honest choice while the regular-width
anatomy is unmeasured. Record the decision in the ledger. Do **not** ship (b) (flexible blocks)
silently; that is a second unmeasured layout. → A20.

### A14 — P2 · Adopt `TVPressStyle`, sheet hand-off, badge timing, sign-out, localisation
`ANIM-07 (call sites), ANIM-13 (call site), ANIM-19 (call site), ANIM-20 (call site), ANIM-23, SWEEP-L10N-VERSION, SWEEP-L10N-MATH-PREFIX, SWEEP-FORCE-UNWRAP-001`
**Consumes:** Builder B items B4, B6, B7.

- **ANIM-07 adoption** — replace `.buttonStyle(.plain)` with the new `TVPressStyle` at the 16 call
  sites in this builder's files: `WatchlistScreen.swift` :127, :140, :239, :307, :629, :672;
  `ExploreScreen.swift` :113, :159, :169, :302, :328; `MenuScreen.swift` :108, :146, :336;
  `PreviewSheet.swift` :112; `MastermindTerminalApp.swift` :268. Rows → `.row`, tiles/cards → `.tile`,
  bare icon buttons → `.glyph`. (Builder B covers the 15 sites inside `TVKit.swift`.)
- **ANIM-12** (`MastermindTerminalApp.swift`) — add `.sensoryFeedback(.selection, trigger: selection)`
  to `TVRootTabBar`'s body, `.buttonStyle(TVPressStyle(.glyph))` at :268, and
  `.contentTransition(.symbolEffect(.replace.offUp))` on the glyph at :355, wrapping
  `selection = item.tab` in `withAnimation(.easeOut(duration: 0.15))`.
- **ANIM-13 call site** (`ChartScreen.swift:103-106`) — present the hub first, clear the dot after it
  has covered the toolbar: `showAnalysisHub = true; Task { try? await Task.sleep(for: .milliseconds(350)); withAnimation(.easeOut(duration: 0.2)) { hubUnseen = false } }`.
- **ANIM-23** — stop racing the sheet dismiss. Hold `@State pendingChartSymbol`, set it alongside
  `preview = nil`, and switch to `.sheet(item:onDismiss:)` to call `model.openChart`. Same change at
  `AnalysisHubSheet.swift:100-104`.
- **ANIM-10 call sites** — route `.searchMode` writes through the animated `openSearch`/`closeSearch`
  helpers (`ChartScreen.swift:100`, `WatchlistScreen.swift:132,:294`, `ExploreScreen.swift:106,:203`).
- **ANIM-09** (`WatchlistScreen.swift`) — wrap `moveToTop` (:277), `remove` (:285), `sortField` (:416)
  and `activeIndex` (:158) in `withAnimation(.spring(response: 0.34, dampingFraction: 0.86))`; give
  `symbolRow` (:212–241) `.transition(.asymmetric(insertion: .opacity, removal: .opacity.combined(with: .move(edge: .leading))))`,
  moving row + hairline into one identified subview so they animate as a unit; add
  `.sensoryFeedback(.impact(weight: .light), trigger: symbols.count)` on `rowsList`.
- **ANIM-21** (`SearchSheet.swift`) — debounce the query into the list (`@State applied`,
  `.task(id: query)` with a 120 ms sleep), add `.animation(.easeOut(duration: 0.18), value: results)`
  on the `LazyVStack` and `.transition(.opacity.combined(with: .move(edge: .top)))` on `mathRow`.
- **ANIM-19 call site / ANIM-20 call site** (`MenuScreen.swift`) — add
  `.animation(.easeOut(duration: 0.15), value: signingOut)` at :264, pass `signingOut` into
  `TVAccountRow.trailingProgress`, and bind the language `Picker` (:291–295) through a proxy that
  writes inside `withAnimation(.easeInOut(duration: 0.18))`.
- **SWEEP-L10N-VERSION** (`MenuScreen.swift:312`) — `"\(AppConfig.marketingVersion) alpha"` hardcodes
  the suffix; wrap it in `L10n.t`. (Builder B adds the `zh` entry.)
- **SWEEP-L10N-MATH-PREFIX** (`SearchSheet.swift:202`) — `Text("= \(mathExpression)")` is
  untranslatable; route through an `L10n` key.
- **SWEEP-FORCE-UNWRAP-001** (`MenuScreen.swift:321`) — replace
  `URL(string: "https://logo.dev")!` with a validated non-optional constant or a `guard let`.

---

## 2. BUILDER B — `native-primitives-motion`

**Owns:** `apps/ios/MastermindTerminal/TVKit.swift`, `TVComponents.swift`, `RollerStrip.swift`,
`QuoteService.swift`, `ShellBridge.swift`, `Theme.swift`, `AuthCore.swift`, `KeychainStore.swift`,
`L10n.swift`, `SearchTracker.swift`, `WatchlistStore.swift`, `WatchlistSyncService.swift`,
`ManifestStore.swift`, `AppConfig.swift`.

> **Contract:** every primitive below ships as **additive API with defaults**, so Builder A's files
> compile against it unchanged before adoption. Builder B merges first.

### B1 — P1 · The adaptivity seam
`IPAD-03` (parent of IPAD-06/07/08/09/11/12)

**Files:** `TVKit.swift`.

Introduce **one** seam in TVKit rather than per-screen `if` statements:

- `enum TVWidthClass { case compact, regular }`, published into the environment from
  `@Environment(\.horizontalSizeClass)` at the root container.
- `TVReadableWidth` — `.frame(maxWidth: TVMetrics.readableWidth).frame(maxWidth: .infinity)` with
  `readableWidth = 704`.
- `TVGrid(columns:)` resolving 1 column in compact, 2–3 in regular.

Land the width class + `TVReadableWidth` **first**: capping row width alone fixes the dead-middle
class of defect on Watchlist, Search and Menu with no new visual language.
**`readableWidth = 704` is an invention → A20.**

### B2 — P0 · `TVWheelPicker` — the missing magnified wheel
`ANIM-01`

**Files:** `TVKit.swift`, `RollerStrip.swift`.

§2.19's floating magnified wheel is **not implemented at all** (`grep TVWheelPicker` → no matches);
`RollerStrip.swift:344-453 WheelColumn` renders nothing outside its own `width × 51.7` frame. So the
app's single most-used gesture has no visible affordance and reads as a twitchy label.

Add `TVWheelPicker` to TVKit and present it from `RollerStrip` as an
`.overlay(alignment: .bottom)` — **not** inside `WheelColumn`, which is `.clipped()` — gated on
`dragOrigin != nil`.

- Container: `RoundedRectangle(cornerRadius: 20, style: .continuous)`, 183 × 133 pt,
  `.background(.ultraThinMaterial).overlay(Color.black.opacity(0.55))`, offset
  `y: -(133/2 + RollerStrip.height/2 + 8)`, x-aligned to the wheel column's leading edge.
- Rows reuse the existing continuous `distance = CGFloat(index) - centre`; map `|distance|` →
  font `34 - 5*min(|d|,1) - 4*max(0,min(|d|-1,2))` pt Bold, opacity
  `1 - 0.35*min(|d|,1) - 0.3*max(0,min(|d|-1,2))`. Symbol variant prefixes `LogoCircle(size: 16.7)`
  at the same opacity. **Interval variant uses the long form** (`15 minutes / 1 hour / 2 hours`), not
  the toolbar's `15m` — per `t-012`/`t-014`.
- Present/dismiss with
  `.transition(.scale(scale: 0.9, anchor: .bottom).combined(with: .opacity))` driven by
  `withAnimation(.spring(response: 0.28, dampingFraction: 0.85))` around the `dragOrigin` write.

### B3 — P1 · The wheel gesture rewrite (one coherent change)
`ANIM-02, ANIM-03, ANIM-04, ANIM-17`

**Files:** `RollerStrip.swift` (:313–333, :380–407, :430–453).

These four findings all rewrite `WheelColumn`'s gesture path; implement as one change.

- **ANIM-02 — ghost calibration.** Measured on `IMG_2296.PNG` rows y2218–2373: ghost ink max 32/255
  vs centre 219/255 → ghost is **14.6%** of centre; ghost glyph width equals centre width → **no
  shrink**; cap-top pitch centre→ghost = 69 px = **23.0 pt**. Ours: 40% and 19 pt. Set
  `rowHeight = 23.0`, `ghostScale = 1.0`, `ghostOpacity = 0.146`; drop the now-dead `.scaleEffect` at
  :387. Change `.foregroundStyle(.white)` at :380 → `.foregroundStyle(Theme.text)` (`#DBDBDB` = the
  measured 219). With ghosts at 14.6% the mask no longer needs to hide a hard cut — shorten the fade
  stops at :394–404 to `0/0.02` and `0.98/1`. **Rewrite the C24 comment at :323-325**, which justifies
  `rowHeight = 19` on the old assumption; strip height stays 51.7 pt.
- **ANIM-03 — flick inertia.** `onEnded` (:438–444) drops the gesture dead and eases 0.18 s to the
  nearest detent. Compute
  `predicted = CGFloat(origin) - value.predictedEndTranslation.height / WheelMetrics.rowHeight`,
  clamp to `0...count-1`, then
  `withAnimation(.interpolatingSpring(stiffness: 180, damping: 26)) { commit(Int(predicted.rounded())) }`
  before clearing `dragOrigin`/`visualCentre`. Keep the `.easeOut(0.18)` at :407 **only** for
  programmatic `syncWheels()` moves by keying the implicit `.animation` on a separate `isSettling`
  flag rather than on `dragOrigin == nil`.
- **ANIM-04 — haptics.** `commit` (:447–452) allocates a fresh `UISelectionFeedbackGenerator` per
  detent and never calls `prepare()`, so ticks arrive late or drop during a fast drag. On the iOS 17
  deployment target (`project.pbxproj:148`), delete the manual generator and attach
  `.sensoryFeedback(.selection, trigger: selection)` to `WheelColumn`'s body — SwiftUI keeps the
  generator warm for the view's lifetime.
- **ANIM-17 — throttle the bridge, not the value.** Rolling across a 7-symbol watchlist currently
  issues 7 main-thread `evaluateJavaScript` chart loads while the finger is down. TV runs the chart
  one detent behind the wheel (`t-014`, `t-015`). Split visual commit from bridge commit: keep
  `selection` + haptic per detent, but route `onPick` through a trailing debounce —
  `flushTask?.cancel(); flushTask = Task { try? await Task.sleep(for: .milliseconds(120)); guard !Task.isCancelled else { return }; onPick(items[index]) }`
  — and in `onEnded` cancel the pending task and call `onPick` immediately for the final index. This
  preserves §3.3.9's "commits live" contract at the value level while collapsing 7 loads into 1–2.
  **Entirely inside `RollerStrip`** — `onPick` is a closure, so no `ChartScreen`/`ShellBridge` edit.
- **ANIM-22 — toolbar icons.** In `ToolbarIconStyle` (:313–317) add
  `.scaleEffect(configuration.isPressed ? 0.90 : 1)` and
  `.animation(.easeOut(duration: 0.12), value: configuration.isPressed)`. Move the haptic out of the
  `isPlaceholder` branch (:269–274) so the pencil (:131), `•••` (:146) and `ShareLink` (:183) — the
  icons that actually do something — also acknowledge; keep the `.soft` impact as the placeholder's
  distinct answer.

### B4 — P1 · `TVPressStyle` (definition)
`ANIM-07`

**Files:** `TVKit.swift`.

`.buttonStyle(.plain)` at 31 sites suppresses every default highlight, so no tappable surface in the
app has a pressed state. TV fills the pressed row lighter for the whole touch (`t-073`, `t-074`,
`t-078`, `t-079`, `t-080`, `t-097`).

Add:

```swift
struct TVPressStyle: ButtonStyle {
    enum Kind { case row, tile, glyph }
    // row  → Color.white.opacity(isPressed ? 0.07 : 0) background
    // tile → scaleEffect(isPressed ? 0.97 : 1)
    // glyph→ opacity(isPressed ? 0.45 : 1)
    // all  → .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
}
```

Adopt at the 15 `TVKit.swift` sites (:251, :354, :373, :443, :499, :545, :896, :969, :1023, :1157,
:1196, :1222, :1272, :1314, :1545). Builder A adopts the other 16.

### B5 — P1 · Live quotes: rolling digits + tick flash
`ANIM-08`

**Files:** `TVComponents.swift` (:75–83), `QuoteService.swift` (:57–87).

`QuoteService` replaces entries in the published dictionary wholesale every 6 s and `PriceStack`
renders both `Text`s with `.monospacedDigit()` but no transition, so lists read as a page that
reloads rather than a live surface.

Add `.contentTransition(.numericText())` and `.animation(.easeOut(duration: 0.25), value:)` to both
`Text`s. For the flash, hold `@State flash: Double?` in `PriceStack`, set it in
`.onChange(of: last) { old, new in flash = new > old ? 1 : -1; withAnimation(.easeOut(duration: 0.32)) { flash = nil } }`,
and render a `RoundedRectangle(cornerRadius: 3)` in `Theme.upFill`/`Theme.downFill` at 0.18 opacity
behind the price line. This automatically covers the hero price (`PriceStack(prominent: true)`) and
`TVSymbolRow`'s trailing stack.

### B6 — P1 · Chips, toast, badges, logos, search transition
`ANIM-06, ANIM-10 (definition), ANIM-13 (definition), ANIM-14, ANIM-16, ANIM-18, ANIM-19 (definition), ANIM-20 (definition)`

**Files:** `TVKit.swift`, `TVComponents.swift`.

- **ANIM-06 — toast must not dim.** `TVKit.swift:1470-1479` puts a `Color.black.opacity(0.45)` scrim
  under `TVToast` inside a hit-testing overlay for 1.8 s, so the search sheet goes dark and
  unresponsive mid-flow after adding a symbol. Measured: TV applies **zero** dim — `t-006` (card
  present) vs `t-004` (absent) read p99=254 / mean≈50.4 in the *same* list band and 254/81.9 vs
  81.8 in the keyboard band. Delete the scrim, add `.allowsHitTesting(false)` to the overlay `ZStack`
  (keep tap-to-dismiss by attaching `.onTapGesture` to the card itself), and replace the
  `.easeOut(duration: 0.18)` at :1481 with
  `.transition(.scale(scale: 0.88).combined(with: .opacity))` +
  `.animation(.spring(response: 0.30, dampingFraction: 0.80), value: toast)`.
- **ANIM-14 — chips.** `TVChip` (:424–446) draws a per-chip background with no animation, and
  `TVChipRow` (:449–471) has no `ScrollViewReader`, so the selection capsule teleports and an
  off-screen selection is simply invisible. Hoist the fill: `@Namespace chipNS` on `TVChipRow`, remove
  the per-chip `.background`, draw `Capsule().fill(Theme.pill).matchedGeometryEffect(id: "tvchip", in: chipNS)`
  behind the selected chip only, `.animation(.spring(response: 0.30, dampingFraction: 0.85), value: selectedIndex)`.
  Wrap in `ScrollViewReader` and add
  `.onChange(of: selectedIndex) { _, i in withAnimation(.easeOut(duration: 0.25)) { proxy.scrollTo(i, anchor: .center) } }`,
  tagging each chip `.id(index)`.
- **ANIM-13 definition** — inside `tvBadgeDot` (:1404–1414) give the dot
  `.transition(.scale(scale: 0.1).combined(with: .opacity))` and attach
  `.animation(.spring(response: 0.28, dampingFraction: 0.7), value: isVisible)`.
- **ANIM-16 — logos.** `LogoCircle` (`TVComponents.swift:46-60`) hard-swaps monogram→image and has no
  shared cache, so lists flicker row-by-row and re-fetch on every tab return. Rebuild as
  `ZStack { initialCircle; AsyncImage { … .transition(.opacity) } }` with
  `.animation(.easeOut(duration: 0.18), value: loaded)`. Configure
  `URLCache.shared = URLCache(memoryCapacity: 8<<20, diskCapacity: 64<<20)` **as a one-shot inside
  this file** (a `static let` initializer on `LogoCircle`) so the fade plays once per logo — do *not*
  edit `MastermindTerminalApp.init()`, which Builder A owns.
- **ANIM-18 — `TVSkeletonBlock(lines:thumb:)`** — rounded rects at `Color.white.opacity(0.05)`, r 8,
  with the same 1.2 s `.phaseAnimator` shimmer as A2. TV fills exactly this slot (`t-088` → `t-089`).
  Builder A overlays it on `PreviewSheet`'s two `InlineWebView`s.
- **ANIM-10 definition** — add an animated `closeSearch()` helper next to `openSearch` so all five
  call sites inherit `withAnimation(.easeOut(duration: 0.20))`, and change the surface transition to
  `.opacity.combined(with: .scale(scale: 1.03))`. Replace `SearchSheet.onAppear` focus with
  `.task { try? await Task.sleep(for: .milliseconds(40)); fieldFocused = true }` so the keyboard's
  0.25 s curve overlaps the fade instead of following it. *(The `AppModel` helper lives in
  `MastermindTerminalApp.swift` — coordinate: Builder B specifies, Builder A lands the helper and call
  sites in item A14.)*
- **ANIM-19 definition** — give `TVAccountRow` an optional `trailingProgress: Bool = false` rendering
  `ProgressView().controlSize(.small).tint(Theme.text2)` in the chevron slot.
- **ANIM-20 definition** — add `.contentTransition(.opacity)` to the language-bearing `Text`s in the
  shared primitives (`TVChip` :434, `TVMenuRow` :944, `TVAccountRow` :1002).

### B7 — P1 · `TVPromoCard` width cap
`SCREEN-03` (primitive half)

**Files:** `TVKit.swift` (:1499–1547).

The doc comment already specifies "2-column grid, 181 pt cell, 8 pt gutter, 16 pt margins" but the
view uses `.frame(maxWidth: .infinity)` at :1541. Cap to the 181 pt cell — `(370 − 8) / 2 ≈ 181` —
so the primitive matches its own contract. Builder A supplies the second card.

### B8 — P2 · Native hygiene
`SWEEP-PRINT-001, SWEEP-FORCE-UNWRAP-002, SWEEP-COLOR-EXCHANGE-BADGE, SWEEP-L10N-VERSION (table), SWEEP-L10N-MATH-PREFIX (table)`

- **`KeychainStore.swift:32,:49`** — unguarded `print("[mm] keychain …failed: \(status)")` ships to
  production console. Replace with `OSLog` at debug level, or remove.
- **`AuthCore.swift:176,:179`** — two force unwraps in `authRequest`. Both are provably safe (static
  `AppConfig.supabaseURL`; percent-encoded query items), so this is hygiene: convert `authRequest` to
  return `URLRequest?` behind a `guard let`, or add a comment stating the invariant. **P2, not P1.**
- **`TVKit.swift:910,:913`** — `TVExchangeBadge`'s `0x001E41 / 0x132640 / 0x2F96C9` are
  **spec-locked measured values** (independently confirmed by pixel sampling in SCREEN-05's
  evidence). Keep them local and add a comment citing §3.2.6. Do **not** hoist into `Theme` — a
  semantic token name invites adjustment of a measurement.
- **`L10n.swift`** — add `zh` entries for the new "alpha" and math-result keys Builder A introduces.

---

## 3. BUILDER C — `terminal-chart-skin`

**Owns:** `terminal/app/globals.css`, `terminal/components/ChartPanel.tsx`,
`terminal/components/ChartFrameBar.tsx`, `terminal/lib/indicators.ts`,
`terminal/lib/embed/theme.ts`, `terminal/app/embed/chart/EmbedChart.tsx`,
`terminal/e2e/shell-mode.spec.ts`.

> **L2 is the hard gate.** Every item below is shell-scoped or `clean`-gated. Run
> `npm run test:e2e:responsive` from `terminal/` before handing off; `shell-mode.spec.ts` asserts the
> `.app[data-shell="app"]` + `html[data-shell="app"]` markers, chrome absence, and a `chartFill > 0.97`
> floor that several of these items move.

### C1 — P1 · Reverse the canvas gradient
`CHART-01` (web half; native half is A3)

**File:** `globals.css:3450`.

`html[data-shell="app"] .pane{background:linear-gradient(180deg,#131722 0%,#181b26 100%)}` runs
darkest-top / lightest-bottom — the inverse of the measurement recorded three lines away in
`CHART_SURFACE_DELTA_SPEC.md:418`. Independently verified: TV samples `#181A25` at y=190 →
`#131621` at y=2200, monotonic.

Swap to `linear-gradient(180deg,#181b26 0%,#131722 100%)` and darken the bottom stop to TV's measured
`#131621`, so the chart's darkest row is the one adjacent to the black native chrome — which is the
seam this fixes. **No `:root` token changes**, so the browser web app is untouched. Correct the
delta-spec table's arrow in the same PR.

### C2 — P1 · Drop the price-scale border; lighten the time-axis rule
`CHART-02`

**File:** `ChartPanel.tsx:2571-2577` (verified: `rightPriceScale: { borderColor: t.line, … }`,
`borderVisible` defaults true).

We draw a 3-device-px `#23262F` rule the full height of the canvas between plot and price scale. TV
draws **none** (verified uniform `#171A25` across x 1010–1050 at y=700) — the axis labels float on the
canvas. TV *does* keep the horizontal time-axis rule, but lighter: `#2A2D38` vs our `#23262F`.

Shell-gate through the existing `shellAxis()` helper (`ChartPanel.tsx:345`):

```ts
rightPriceScale: { borderVisible: !shellAxis(), borderColor: t.line, scaleMargins: {…} },
timeScale:       { borderColor: shellAxis() ? "#2a2d38" : t.line, … }
```

**Verify** that the settings effects at ~:6456 and ~:6552 re-apply only `borderColor` and do not
clobber `borderVisible`; if they do, gate there too.

### C3 — P1 · Gridline / label pitch
`CHART-03` (coupled to C7's breakpoint)

**File:** `ChartPanel.tsx:2571`, plus the sub-pane scales near :4891.

Horizontal gridlines and price labels are ~1.4× denser than TV on phone; on iPad the canvas carries
**29** price labels and reads as graph paper. Measured pitch: ours 34 CSS px (iPhone) / 35 (iPad),
TV 47 CSS px. `CHART_SURFACE_DELTA_SPEC.md:419` already records "pitch 47pt" but only colour was
implemented.

lightweight-charts 5.2 exposes the control — `PriceScaleOptions.tickMarkDensity`
(**verified present** at `node_modules/lightweight-charts/dist/typings.d.ts:3814`, default 2.5,
consumed as `ceil(fontSize * tickMarkDensity)` = minimum label pitch).

```ts
tickMarkDensity: shellAxis()
  ? (matchMedia("(min-width:700px)").matches ? 4.6 : 3.9)
  : 2.5
```

12 px font × 3.9 = 47 CSS px = TV's measured pitch exactly. Apply the same value to every sub-pane
scale after pane creation (`chart.panes().forEach(p => p.priceScale("right").applyOptions({ tickMarkDensity }))`,
alongside the existing `paneScale()` call) so the oscillator panes match. Web keeps the library
default. **The 4.6 regular-width value is an invention → A20.**

### C4 — P1 · Shrink the volume band and restore its saturation
`CHART-04` (coupled to C5)

**Files:** `ChartPanel.tsx:846`, `lib/indicators.ts:70-71`.

`scaleMargins: { top: 0.78, bottom: 0 }` reserves **22%** of the price pane for volume, which paints
as a dense slab burying MA-200 and the watermark. TV's sliver is ~3.5%. The comment at
`indicators.ts:56-58` already diagnoses this and compensated with alpha instead of geometry — and the
delta spec measured ours at 17% when written, so it has *grown* to 22%.

- `scaleMargins: { top: shellAxis() ? 0.88 : 0.78, bottom: 0 }` → a 12% band.
- Because the alpha was explicitly a compensator for the oversized band, it must move with the
  geometry: raise `COL.upFill` / `COL.downFill` in `indicators.ts:70-71` from 0.45 → **0.70** for the
  `_SHELL` branch only. Leave `upHist`/`downHist`, `COL.faint` and the MACD-RSI colours alone — the
  other two documented deviations still stand. The web branch of every ternary is unchanged.

### C5 — P1 · Move the brand bug out of the volume slab
`CHART-05` (depends on C4)

**Files:** `ChartPanel.tsx:2593-2605` and the re-apply at :6562-6575, `globals.css` D-block.

`createTextWatermark(chart.panes()[0], { horzAlign: "left", vertAlign: "bottom" })` puts the shell
brand bug at the bottom-left of the **price** pane — i.e. inside the volume overlay — so ~80 volume
bars cross it; on iPad its leading glyph is also sheared at x≈3.5 CSS px.
`TextWatermarkOptions` has **no padding/offset field**, so the inset cannot be fixed through the
plugin, and C4's 12% band still overlaps it.

In shell mode stop using the plugin — pass `visible: !shellAxis()` at both sites — and append a DOM
brand bug beside the existing overlay layers (~:2610-2618):

```css
html[data-shell="app"] .mm-brandbug{
  position:absolute; left:12px; bottom:38px; z-index:1;
  font:700 13px/1 var(--font-ui); letter-spacing:.09em;
  color:rgba(219,219,219,.30); pointer-events:none;
}
```

`bottom:38px` clears the time axis; `z-index:1` puts it above the canvas so no series can overpaint
it. Web keeps the centred 48 px ghost wordmark untouched.

### C6 — P1 · Restore an OHLC readout via crosshair scrub
`CHART-06`

**Files:** `ChartPanel.tsx` (:2107, `reRegisterSync` ~:6079), `globals.css:3499-3502`.

D2 hid `.status-ohlc / .status-vol / .status-day` on the premise that TV shows OHLC only on scrub —
**but the scrub replacement was never built**, so the shell strictly lost information the web mobile
terminal shows at rest. Neither `subscribeCrosshairMove` handler (:4782, :6079) touches `statusRef`.

Add the scrub path: in `onCross`, look up the hovered bar by `p.time` in `barsRef.current`, write its
O/H/L/C into the existing `.status-ohlc` node via `textContent` (**do not re-render the whole
statusline** — that thrashes the logo `img`), and toggle
`statusRef.current.classList.toggle("is-scrub", p.time != null)`. Then replace the blanket hide:

```css
html[data-shell="app"] .statusline:not(.is-scrub) .status-ohlc{display:none}
html[data-shell="app"] .statusline.is-scrub .status-last,
html[data-shell="app"] .statusline.is-scrub .status-change{display:none}
```

Row B swaps to OHLC during the scrub and back on release. `.is-scrub` never appears on web.

### C7 — P1 · Regular-width branch for the D-block
`CHART-09` (shares C3's breakpoint)

**Files:** `globals.css` (end of D-block), `ChartPanel.tsx:2568`.

**Verified:** the entire D-block (lines 3426–3620) contains **zero** `@media` queries, so the iPad
chart renders phone type on an 834 pt canvas — 17 px identity, 12 px axis, 26 px legend chip. (Note
the chart's own `mobile` branch, `matchMedia("(max-width:860px)")` at `ChartPanel.tsx:553`, also fires
on iPad portrait at 834 pt.)

Append:

```css
@media (min-width:700px){
  html[data-shell="app"] .status-symbol-name{font-size:20px}
  html[data-shell="app"] .status-values{font-size:20px}
  html[data-shell="app"] .status-symbol-logo{width:20px;height:20px}
  html[data-shell="app"] .lg-collapse{height:30px;min-width:48px}
  html[data-shell="app"] .lg-cnt{font-size:15px}
  html[data-shell="app"] .lg-name{font-size:16px;max-width:280px}
  html[data-shell="app"] .cfb-gear{width:30px;height:30px}
}
```

Pair with `fontSize: shellAxis() && matchMedia("(min-width:700px)").matches ? 13 : 12` at :2568.
**Use the identical `min-width:700px` breakpoint in both files and in C3** so type and grid step
together. **The entire regular-width ramp is an invention → A20.**

### C8 — P1 · Bottom-right cluster: real settings glyph, no inert chip
`CHART-08`

**Files:** `globals.css` D-block, `ChartFrameBar.tsx:412-418, :427-430`.

(a) The settings glyph is drawn as `<circle r="2.2"/>` + eight straight radial strokes — at the
26 × 26 / 15 px svg size it is indistinguishable from a **brightness/sun** icon. (b) A permanently
disabled grey `ETH` chip shows on daily timeframes where extended hours are meaningless.

1. `html[data-shell="app"] .cfb-chip.dis{display:none}` — the inert chip disappears on daily/weekly
   and returns on intraday.
2. Replace the sun path with TV's hexagon nut:
   `<path d="M8 1.7 13.4 4.85v6.3L8 14.3 2.6 11.15v-6.3z"/><circle cx="8" cy="8" r="2.1"/>` on the same
   `fill=none stroke=currentColor strokeWidth=1.3` svg. The glyph is house-neutral so no shell gate is
   strictly required — **but under L2, gate it on the existing `shellMode` prop path** so the web
   render stays byte-identical.

### C9 — P2 · Settings-glyph hit target
`CHART-15`

**File:** `globals.css` D-block.

`.cfb-gear` is a 26 × 26 pt target — well under the 44 pt iOS minimum — and is the *only* chart-settings
entry point now that D1 removed the toolbar row.

```css
html[data-shell="app"] .cfb-gear{position:relative}
html[data-shell="app"] .cfb-gear::before{content:"";position:absolute;inset:-9px;border-radius:12px}
```

Do **not** add `min-height` to `.cfb-gear` itself — the same inflation trap is already documented for
`.lg-ic` at `globals.css:1995`.

### C10 — P2 · Bar-close countdown: move it, don't suppress it
`CHART-07`

**Files:** `globals.css:3577`, `ChartPanel.tsx` `renderPriceTag` (~:2579-2590).

`.mm-ptag-cd{display:none!important}` also overrides the user's `chartSettings.countdownVisible`
toggle, so the setting silently does nothing in the app. The D9 rationale assumed the countdown was
the size problem, but the badge already measures 19 CSS px against TV's 17 — it was never the outlier.

Keep `.mm-ptag-cd` as a **sibling** of `.mm-ptag` rather than a second line inside it, and replace the
hide with:

```css
html[data-shell="app"] .mm-ptag-cd{
  position:absolute; top:100%; right:0; margin-top:2px;
  font:700 10px/1 var(--font-num); color:#b1b5be; background:transparent;
}
```

**Critical:** `tagCd.style.display` is set **inline** by `renderPriceTag` (that is why the old rule
needed `!important`). The replacement must **not** set `display` at all, or it will fight the inline
value and break the `countdownVisible` gate in the other direction.

### C11 — P2 · Clean (sheet) mini chart parity
`CHART-10, CHART-11, CHART-12`

**Files:** `lib/embed/theme.ts:119-121`, `app/embed/chart/EmbedChart.tsx:173-176, :184-188, :202`.

All three are `clean`-gated, so only `?clean=1` consumers change — that is exactly the native preview
sheet. Every public embed keeps the house v5 look because it never passes the flag.

- **CHART-10 — candle colour split.** `CLEAN = { up: "#22AB94", down: "#F7525F" }` are TV's **text**
  tokens, while the Chart tab paints candles in the **fill** tokens (`#089981` / `#F23645`) — two
  visibly different greens for the same instrument in one app. Master spec §47-48 rules the other
  measurements "video drift" and assigns the fill pair to candles; the token table at §132-135 makes
  the split explicit (`tvUpFill` = up candles, `tvUpText` = positive change text). A colour census of
  `IMG_2325.PNG`'s plot (y900–1750) returns `#089981` at 34,392 px and `#F23645` at 25,040 px with
  `#22AB94`/`#F7525F` **absent from the candles entirely**. Change to `up: "#089981", down: "#F23645"`.
- **CHART-11 — gridlines.** `vertLines` is clean-gated but `horzLines` is not, so the sheet chart still
  rules every price label. TV's symbol sheet has zero gridlines. Change to
  `grid: { vertLines: { visible: !clean, color: pal.grid }, horzLines: { visible: !clean, color: pal.grid } }`.
- **CHART-12 — last-value badge.** `lastValueVisible: true` paints a filled badge that collides with
  the last candles and duplicates the price already in the sheet header. TV's sheet has none. Change
  to `lastValueVisible: !clean`.

> **Not in this round:** CHART-13 (floating in-plot integer labels, dropped — §5).

### C12 — P1 · Extend the shell-mode guard
(supports every C item)

**File:** `e2e/shell-mode.spec.ts`.

Add assertions so this round cannot silently regress:

- price-scale border absent in shell (`borderVisible` false) and present on web;
- `.mm-brandbug` present in shell / absent on web, and the LWC text watermark **not** visible in shell;
- `.statusline` shows no `.status-ohlc` at rest and does show it under `.is-scrub`;
- `.cfb-chip.dis` hidden on a daily timeframe, visible on intraday;
- the `chartFill > 0.97` floor still holds after C4/C5/C7 (**re-baseline the number in the same PR if
  the volume-band change moves it — do not delete the assertion**);
- the `min-width:700px` branch applies at the tablet project viewport only.

---

## 4. §4-A20 — iPad inventions made without TV reference

There is **no TradingView-for-iPad imagery in either corpus**; all 47 `IMG_*.PNG` are iPhone, and the
master spec's 912 lines contain zero iPad/orientation/size-class text. Every number below is a
**conservative extrapolation, not a measurement**, and must be re-derived once iPad captures exist.
Register all of them in §4-A20 and the gap ledger (item A12).

| # | Invention | Value / choice | Items |
|---|---|---|---|
| A20.1 | Readable content-column width | `TVMetrics.readableWidth = 704` pt (402 pt reference content scaled to iPad's 4:3 reading measure) | B1, A4 |
| A20.2 | Explore action-row grid | `LazyVGrid .adaptive(minimum: 117.7, maximum: 160)`, gutter 8.3 — column **count** derived, cell metrics measured | A5 |
| A20.3 | Explore carousel grid | `LazyVGrid .adaptive(minimum: 149.7)`, non-scrolling in regular width | A5 |
| A20.4 | Tab-bar content width | Bar content bounded to `5 × 80.4 = 402` pt and centred; fill `#040404` and `#4A4A4A` rule stay full-bleed. **Holding the measured 80.4 pt pitch is the conservative reading; widening the pitch would be pure invention** | A1 (IPAD-12) |
| A20.5 | Regular-width sheet presentation | `.fullScreenCover` substituted for `.presentationDetents`; `TVGrabber` suppressed when not drag-dismissable; `chartHeight` proportional on the measured 430/874 ratio | A9 |
| A20.6 | iPad rotation policy | iPad does **not** auto-hide chrome on rotation; C25 minimize becomes the sole immersive verb, state persisted per orientation | A10 |
| A20.7 | `•••` dropdown in regular width | `.popover` anchored on the button, no scrim (replaces the fixed leading 11.7 / top 44.3 anchor) | A11 |
| A20.8 | Compact-width scrim reduction | Watchlist dropdown scrim 0.55 → 0.22 (TV's popover is undimmed, but the phone overlay itself is measured) | A11 |
| A20.9 | Multitasking posture | `UIRequiresFullScreen = YES` for the alpha — one window, one size class per orientation | A13 |
| A20.10 | Web regular-width breakpoint | `min-width:700px`, used identically in `globals.css` and `ChartPanel.tsx` | C3, C7 |
| A20.11 | Regular-width type ramp | identity/values 20 px, logo 20 px, `.lg-collapse` 30 px, `.lg-cnt` 15 px, `.lg-name` 16 px, gear 30 px, axis font 13 px | C7 |
| A20.12 | Regular-width tick density | `tickMarkDensity: 4.6` (the compact 3.9 **is** measured — 12 × 3.9 = TV's 47 CSS px) | C3 |
| A20.13 | Volume band 12% | `scaleMargins.top 0.88` — TV's sliver measures ~3.5%; 12% is a deliberate midpoint, not a match | C4 |
| A20.14 | Brand-bug placement | `left:12px; bottom:38px` — chosen to clear the time axis, no TV measurement for the shell's own bug | C5 |
| A20.15 | **REJECTED this round** — chart-tab watchlist rail (IPAD-18) | A 320 pt trailing rail is an explicit invention ("TV keeps a left rail" is an assumption). Violates L1. Hold until iPad captures exist | §5 |
| A20.16 | **OPEN** — unselected Chart-tab shield | The *selected* shield is measured (`IMG_2298`); the unselected variant is uncaptured | A8, A12 |

---

## 5. Dropped findings

| id | Reason |
|---|---|
| `SWEEP-L10N-LOGO-ATTRIBUTION` | **Wrong.** `L10n.swift:7-8` documents the decision explicitly: "The Logo.dev attribution stays English in both languages on purpose: it is a brand credit, not product copy." Translating it would break the CDN's attribution requirement. |
| `SWEEP-COLOR-AVATAR-PLACEHOLDER` | **Already satisfied.** The finding's own fallback remedy ("add a code comment explaining why it bypasses the theme system") is already present at `MenuScreen.swift:181`. Hoisting a placeholder fill into a semantic token adds no value. |
| `SCREEN-05` | Not a defect — a product question the finding itself declines to answer ("confirm with product"). The single merged search surface is deliberate. Recorded as a ledger note in A12 instead. |
| `SCREEN-06` | Deliberate. Crypto-forward chip ordering matches this product's first-class crypto universe; the finding concedes "if deliberate, no action needed beyond a spec-doc note". Recorded in A12. |
| `SCREEN-07` | No code change proposed — it is an evidence-acquisition ask ("mirror a live TV session"), and no iPad/mixed-feed captures exist. Kept **open** as §4-A15 via A12 rather than built. |
| `CHART-14` | **Under-specified.** The finding disproves its own fix mid-sentence ("`color` is not applicable to a per-bar-coloured histogram") and falls back to a speculative zero-width `createPriceLine`. A second axis badge competing with the price badge needs a measurement first; the delta spec lists it as TV-only with no decision. |
| `CHART-13` | **Deferred, not rejected.** Reimplementing the price axis as absolutely-positioned DOM labels driven by `getVisibleRange()` is a large custom-axis build with real regression risk on a shipped sheet, for P2 value. Revisit after C11 lands. |
| `IPAD-18` | **Violates L1.** The finding labels itself an INVENTION with no TV reference. Recorded as A20.15 (explicitly rejected pending captures) rather than silently dropped. |

**Folded, not dropped** — these carry no separate work item because another item subsumes them:
`IPAD-17` → A1 (comments deleted with `TVTabBarChrome`); `IPAD-19` → A1 + §6 verification;
`IPAD-13` → A1; `ANIM-11` → A1; `SCREEN-01` → §6 verification.

---

## 6. Verification checklist

Every claim below must be provable from an artifact, not from a build log. **Ad-hoc sign all
simulator builds** (`CODE_SIGN_IDENTITY="-"`) or install fails `-34018`.

### 6.1 Fix the capture pipeline first (`SCREEN-01` — blocking)

The delivered `iphone-preview.png` was **byte-identical** (md5 `3041df58…`) to `iphone-chart.png`: it
showed the plain Chart tab, so an entire mandated comparison surface shipped with zero evidence. The
feature is wired correctly — `WatchlistScreen.swift:82-86` has a `-mmPreview SYM` headless hook — so
this is a broken flag in the capture script, not an app bug.

**Before any screenshot is judged:** pass `-mmPreview NVDA` when generating the preview fixture (or
wait for `.sheet(item:)` to finish presenting), and **assert every capture in the set has a distinct
md5**. A duplicate hash fails the round.

### 6.2 Required capture set

Both idioms, portrait **and** landscape: `chart`, `watchlist`, `explore`, `search`, `community`,
`menu`, `preview`, plus two **new** pushed-screen frames (`explore-discover`, `menu-about`) that the
set never had — which is why IPAD-19 went unseen.

### 6.3 What each screenshot must prove

| Artifact | Must prove | Guards |
|---|---|---|
| `ipad-*.png` (all five tabs) | **No floating capsule anywhere.** No chrome between the status bar and content; y-band of the first content row returns to the measured ~67–96 pt (was 115 pt). | A1 |
| `ipad-chart-bottom.png` crop | RollerStrip fully visible **above** the tab bar. Assert the strip's bottom hairline ≥ the bar's top hairline — add this to the pipeline so it cannot silently regress. | A1 |
| `iphone-chart-bottom.png` crop | Same assertion holds on iPhone (no regression from the inset rewrite). | A1 |
| `ipad-explore-discover.png`, `ipad-menu-about.png` | Exactly **three** bands: status bar → inline nav bar → content → our bottom bar. No fourth. | A1 / IPAD-19 |
| `ipad-watchlist.png` | Row symbol and price sit in one 704 pt centred column; dividers remain full-bleed edge-to-edge. | A4 |
| `ipad-explore.png` | No dead right half — action tiles and index cards tile the content column; no horizontal scrollers at 834 pt. | A5 |
| `ipad-search.png`, `ipad-menu.png` | Field/chips/rows and cards centred in one column; measured rhythms (31.7/19.3/8.7; 25.3/8/44/57) unchanged. | A4 |
| `ipad-chart.png` landscape | Chrome present (strip + bar), chart taller than baseline; C25 minimize is the only thing that hides it. | A10 |
| `iphone-explore.png` | News/Calendar/Discover render as ~31–34 pt capsules, visually consistent with the category row directly below. | A6 |
| `iphone-menu.png` | **Two** promo cards side by side at ~181 pt each with an 8 pt gutter. | A7 |
| `iphone-chart.png` tab bar crop | Selected Chart tab is the white shield with black candles + red dot — diffed against `IMG_2298.PNG`. | A8 |
| Boot capture (t≈0.1 s) | Skeleton on the **gradient**, never a black frame. Sample the canvas: it must never read `#000000` during boot. | A2 |
| `iphone-chart.png` gradient scan, column x=600 | Monotonic **light→dark** top to bottom; darkest row adjacent to the black chrome. Compare directly against the `IMG_2321.PNG` scan (`#181A25` → `#131621`). | A3 / C1 |
| `iphone-chart.png` row y=700, x 1010–1050 | Uniform canvas — **no** `#23262F` border pixel. Time-axis rule reads `#2A2D38`. | C2 |
| Price-scale label-run detection | ~47 CSS px pitch on iPhone; iPad label count drops well below 29. | C3 / C7 |
| Volume region crop | Band ≈12% of the price pane; MA-200 legible through it; **"MASTERMIND" not crossed by a single volume bar**. | C4 / C5 |
| Scrub capture (crosshair down / released) | OHLC visible during scrub, last/change restored on release; the statusline logo `img` must not flicker (proves `textContent`, not a re-render). | C6 |
| Wheel mid-drag capture | Floating 183 × 133 pt magnified panel above the strip, interval variant in **long form**; ghost rows barely visible (~15% of centre ink, no shrink, 23 pt pitch). Compare to `IMG_2296.PNG`. | B2 / B3 |
| Toast capture | Background list at **full brightness** — sample the list band and assert mean luminance matches the no-toast frame (TV method: `t-006` vs `t-004`). Touches pass through. | B6 |
| Press-state capture | Row under touch fills lighter. | B4 / A14 |
| `npm run test:e2e:responsive` (from `terminal/`) | **Green at 1440×900, 820×1180 and 390×844.** `shell-mode.spec.ts` passes with the C12 additions. | L2 |
| Web-vs-shell diff | `/terminal?symbol=NVDA` (no `shell=app`) renders **pixel-identically** to `origin/master` at all three viewports. Any diff is a P0 revert. | L2 |
| Default embed diff | `/embed/chart` **without** `?clean=1` unchanged; only `?clean=1` shows the fill-pair candles, no gridlines, no axis badge. | C11 |

### 6.4 Behavioural checks (not screenshot-provable)

- **Poller lifecycle (A1.7):** with all five screens mounted, instrument `QuoteService` and confirm
  exactly one tab's ticker is running after three tab switches. A leak here is the most likely
  regression from the container rewrite.
- **Wheel throttle (B3/ANIM-17):** log `evaluateJavaScript` calls while rolling across 7 symbols —
  must be 1–2, not 7.
- **Countdown toggle (C10):** flipping `chartSettings.countdownVisible` must actually show/hide the
  caption in the shell — the bug being fixed is that the setting was inert.
- **Delayed-`D` badge (A12):** unchanged this round; confirmed still gated on quote basis, and §4-A15
  recorded as open.

### 6.5 Delivery

Per the standing chain: commit → push → PR against `master` → CI → merge → deploy merged
`origin/master` via `/opt/terminal/terminal-build.sh` → verify on `https://app.mastermind-x.com`.
**Native binaries are build artifacts and are never deployed to the VPS**; only Builder C's changes
reach production web. Builder C's merge is what the deploy verifies — confirm the shell marker plus
one C-item behaviour (the reversed gradient is the cheapest live check) on the deployed site.
