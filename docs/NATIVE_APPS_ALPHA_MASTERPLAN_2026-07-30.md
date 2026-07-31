# Mastermind Native Apps — Alpha Masterplan (iPhone / iPad / macOS)

**Date:** 2026-07-30
**Author:** Claude Fable 5 (architecture + orchestration owner)
**Supersedes in part:** `docs/FABLE_APP_BUILD_EXECUTION_CHARTER_2026-07-30.md` (Codex charter). The charter's
delivery discipline, security posture, options exclusion, and wave sequencing are retained. Its **mobile shell
choice (Capacitor) is replaced** by a native SwiftUI shell — rationale in §2. Its macOS choice (Electron) is
confirmed.
**Status:** awaiting operator review before implementation.

---

## 1. Executive summary

Ship two installable alpha apps that members can download, without duplicating the product:

| Target | Shell | What the user sees |
|---|---|---|
| iPhone + iPad | **Native SwiftUI app** (`apps/ios/`) — TradingView-style tab UI; native Watchlist/Search/Markets/Menu; the chart itself is the existing web chart embedded via `WKWebView` in a new chrome-less "shell mode" | A real iOS app that feels like TradingView's, powered by our terminal |
| macOS | **Electron** (`apps/desktop/`) — hardened wrapper loading `https://app.mastermind-x.com` desktop UI as-is | The full desktop Terminal in a signed, notarized Mac app |
| Windows | Same Electron project, packaged later | Wave 2 — not in this alpha |
| Android | Deferred; reuses the same web contract (shell mode + bridge + JSON APIs) | Wave 3 — not in this alpha |

Core principle (unchanged from the charter): **`terminal/` stays the only implementation of charts, indicators,
drawings, analysis, and business logic.** Native code is presentation + OS integration only.

The alpha is deliberately small: chart, search, watchlist, markets overview, auth, share/snapshot via the web
chart's existing exporter. **No Options anywhere in the native apps. No alerts UI, no portfolio, no push
notifications, no Pine editor, no broker, no auto-update** — all deferred (§7).

---

## 2. The shell decision (the question asked)

### macOS → Electron (charter confirmed)

- The desktop Terminal is developed and E2E-tested in Chromium (Playwright). Electron ships that same engine —
  zero engine-porting risk for the canvas chart stack.
- The same project is the Windows app in Wave 2; one desktop shell forever.
- TradingView Desktop itself is Electron — the exact product pattern we're following.
- A SwiftUI/WKWebView Mac app would be smaller (~5 MB vs ~150 MB) but runs the desktop layout on Safari's
  engine (untested surface), and Windows would still need Electron later → two desktop shells. Rejected.
- Mac Catalyst (iPad app on Mac) shows the mobile layout on desktop — wrong product. Rejected.

### iPhone/iPad → Native SwiftUI, not Capacitor (charter overridden)

The charter chose Capacitor because it assumed the installable app should show our existing responsive mobile
web UI. The operator's requirement is different: **the iOS app should look and navigate like TradingView's
mobile app**, which is better than our current mobile web UI, while the web app's UI stays as-is.

That requirement changes the calculus:

1. A Capacitor wrapper of today's mobile web UI fails the requirement outright — it would just be our current
   mobile site in an app frame.
2. Making Capacitor look like TradingView would mean building a second, TV-style mobile web UI inside
   `terminal/` — the exact "separate mobile implementation" this repo retired once already
   (`feat/mobile-terminal-redesign`, see `docs/RESPONSIVE_APP_ARCHITECTURE.md`).
3. TradingView's own mobile apps are **native shells around their web chart engine** — native tab bar,
   watchlist, search, sheets; web-rendered chart. That is precisely the architecture proposed here, and it is
   the reason their app feels the way it does (native scroll physics, native keyboard, native sheets).
4. Native surfaces give the App Store submission real "native value" (guideline 4.2 minimum-functionality),
   which a pure webview wrapper risks failing at public-release time.
5. Toolchain is ready: Xcode 26.6 + iOS 26.5 simulators verified on this Mac, and Claude Code has an iOS
   Simulator MCP (build + drive + screenshot) wired into this environment.

**Cost accepted:** SwiftUI doesn't port to Android. Wave 3 Android will be its own thin shell (Kotlin/Compose
or Capacitor — decided then) against the **same web contract**, which is where the real reuse lives: shell
mode, the JS bridge, the feature manifest, and the published JSON APIs are platform-neutral.

**Boundary law (amends the "one responsive Terminal" rule; lands in `AGENTS.md` with slice S0):**

> Native app code under `apps/` may implement *presentation and OS integration only*: navigation chrome,
> lists/sheets rendering data fetched from published Terminal HTTP APIs (`/api/*`, `/data/*`), OS features
> (share, keychain, haptics), and WebView hosting of Terminal routes. It must never re-implement chart
> rendering, indicator/signal math, entitlement logic, or any analysis; those live only in `terminal/` and
> its backends. If a native screen needs data that no API provides, add the API to `terminal/` first.

---

## 3. Verified starting state (2026-07-30)

- `origin/master` @ `b2f2abaa` (this plan's base). Charter committed at `f4f45cf4`.
- Xcode 26.6 (17F113) at `/Applications/Xcode.app`; `xcode-select` still points at CommandLineTools, so all
  commands need `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer` until the owner runs
  `sudo xcode-select --switch` (not required to start).
- Simulators available: iPhone 17 / Pro / Pro Max / Air / 17e, iPad Pro 11″/13″ (M5), iPad Air 11″/13″ (M4),
  iPad mini (A17 Pro), iPad (A16). iOS Simulator MCP (build/control/screenshot) available in-session.
- Node v26.5.0 on this Mac (Electron toolchain OK). VPS still builds the web on node 20 — desktop shell builds
  happen on this Mac/CI, never on the VPS.
- 43 TradingView iPhone reference screenshots inventoried (`IMG_2179–2221`, sampled in detail; kept locally,
  **not** committed — see §5.1 "do not copy" rule).
- Deploy chain unchanged: web changes ship via PR → CI → merge → `/opt/terminal/terminal-build.sh` →
  live verify. Native binaries are *artifacts*, never deployed to the VPS.

Repo recon (verified against `b2f2abaa`, not memory):

- Route map: chart workspace at `/terminal` (already accepts `?sym=` server-side — deep links work today);
  non-chart workspaces `/analysis` `/discover` `/portfolio` `/alerts` `/options` `/scripts` under an
  `app/(shell)/` chrome group (`components/chrome/AppShell`); a lightweight **`/embed/chart` widget route
  already exists** (`symbol/range/theme/lang/transparent` params, robots-noindex, built to be iframed).
- Auth: `@supabase/ssr` **cookie sessions** (host-only auth cookies on the app origin, custom chunked cookie
  adapter in `lib/supabase/cookies.ts`).
- Symbol search: fully client-side over `/data/manifest.json` (~1.9 MB; `SearchModal` + `lib` scoring,
  one-language `displayName` law, category browse). No server search API exists or is needed.
- Watchlists: Supabase RLS tables `watchlists` + `watchlist_symbols` (multi-list schema with sections and
  positions); the web's `/api/watchlist` is POST add/remove on the user's first list; reads go through the
  Supabase client directly.
- Playwright: Chromium-only, three viewport projects (desktop 1440×900 / tablet 820×1180 / mobile 390×844).
  There is no WebKit lane in CI — the iOS Simulator pass in S2 is the WebKit lane.

## 4. Architecture

```
                    ┌───────────────────────────────────────────┐
                    │ terminal/  (Next.js, the ONLY product)    │
                    │ chart · indicators · analysis · APIs      │
                    │ + shell mode (?shell=app) + bridge v1     │
                    │ + native feature manifest                 │
                    └──────┬──────────────────┬─────────────────┘
                           │                  │
              WKWebView (chart, analysis,     │ full desktop site
              heatmap/screener embeds)        │
                           │                  │
        ┌──────────────────┴───┐        ┌─────┴──────────────────┐
        │ apps/ios  (SwiftUI)  │        │ apps/desktop (Electron)│
        │ native: tabs, watch- │        │ hardened window, menus,│
        │ list, search, quotes,│        │ shortcuts, restore,    │
        │ sheets, auth, share  │        │ sign + notarize        │
        └──────────────────────┘        └────────────────────────┘
```

### 4.1 Shell mode (`?shell=app`) — one small web PR

A query param read client-side by the Terminal shell, applied to `/terminal` and to the `(shell)` workspace
routes the app embeds (`/discover`, `/analysis`). Distinct from the existing `/embed/chart` widget: that stays
the tiny read-only mini-chart (reused as-is by the native preview sheet); shell mode is the **full** chart
workspace minus global chrome:

- Hides global chrome: top bar, app nav/drawer, footer, marketing surfaces. Keeps the chart and the chart's
  own toolbars/sheets (timeframes, indicators, drawings, compare, settings) — so the full chart feature set is
  available on day one with zero native re-implementation.
- Applies safe-area insets and locks document overscroll (no rubber-banding behind the chart).
- Boots the JS bridge (below) when `window.webkit.messageHandlers.mm` (iOS) is present.
- Same param serves the iOS embeds of `/heatmap`, `/screener`, analysis surfaces — native back-chrome, web
  content.

### 4.2 Bridge v1 (deliberately tiny)

Web → native (`postMessage`): `ready`, `symbolChanged {sym}`, `stateChanged {tf, chartType}` (for restore),
`openExternal {url}`.
Native → web (`evaluateJavaScript` on a stable `window.__mmShell` API): `setSymbol(sym)`, `setLang(lang)`,
`restoreState({sym, tf})`, `setSession({access_token, refresh_token})` (auth handoff, §4.4).

No filesystem, no exec, no arbitrary URL loading, no generic eval surface. Contract typed in
`terminal/lib/platform/contract.ts` + JSON schema in `contracts/native-shell.v1.schema.json`. The browser gets
a no-op adapter, so nothing changes for normal web users.

### 4.3 Native data plane (already exists — read-only reuse)

Native screens consume only what the web already uses; **no new backend for the alpha**:

- `/data/manifest.json` — symbol universe for native search + watchlist quote rows (cached on device,
  refreshed on launch; served compressed).
- Per-symbol `/data/<SYM>.*.json` (OHLC/fund/intel families) — preview-sheet stats + desk read.
- `/api/quote`, `/api/intraday`, `/api/ext-quote` — live-ish prices at the web's cadence and entitlements.
- `/embed/chart` — the existing widget renders the preview sheet's mini-chart (zero new chart code).
- Watchlists — Supabase RLS tables via `supabase-swift` (the same access path the web's browser client uses);
  the web's `/api/watchlist` stays untouched.
- Search tracking — native fires the web's existing tracking endpoint on committed searches so the owner
  Search Log keeps seeing app users (payload contract copied in S3).

Native search ranking is a deliberately simple prefix/contains scorer over the manifest (per-language display
fields + category chips honoring the one-language law and category-browse rule). The web's full `scoreSymbol`
ranking is not duplicated; if the simple ranking feels off during alpha we revisit — it is presentation-layer,
not business logic.

### 4.4 Auth

Web sessions are `@supabase/ssr` **cookies**, so the handoff is designed around the web's own auth code
rather than forging cookie formats from native:

1. Native login screen → `supabase-swift` `signInWithPassword` (same project, same providers) → session in
   Keychain; powers native RLS reads (watchlists) and the member badge.
2. Webview handoff: once shell mode reports `ready`, native calls `__mmShell.setSession({access_token,
   refresh_token})`; the page runs `supabase.auth.setSession(...)`, and the web's cookie adapter persists its
   own cookies inside the webview's store. No token ever rides a URL; the bridge only accepts it from the
   native process. Sign-out clears Keychain + webview website data.
3. Guest mode: the terminal already serves a guest workspace, so the app works logged out; login lives in
   the Menu tab.

Entitlement display reads the same claims the web uses; the native app never computes entitlements.

### 4.5 Feature manifest — Options exclusion as configuration

`terminal/lib/platform/featureManifest.ts` (+ mirrored JSON for the shells):

```json
{ "chart": true, "search": true, "watchlist": true, "markets": true,
  "analysis": true, "discover": true,
  "options": false, "alerts": false, "portfolio": false,
  "scripts": false, "admin": false, "broker": false }
```

(Keys mirror the actual route map: `/discover` is today's screener/heatmap hub; there are no separate
`/screener` `/heatmap` routes anymore.)

Enforced in three places: iOS never renders excluded destinations; the WKWebView navigation policy blocks
`/options` (and every excluded route) with a native "Not in this alpha" notice; Electron's allowlist does the
same. No `if (platform)` scatter in product components.

## 5. iOS app spec (TradingView-derived)

Reference: the 43-screenshot set. We copy **mechanics and layout logic, not trade dress**: no TV marks, icons,
exact wording, or visual composition. Mastermind keeps its own identity — Terminal v5 dark palette, existing
brand color conventions (incl. the zh red/green flip law via the web embeds).

### 5.1 Structure — 4 tabs (TV has 5; we drop Community)

**Tab bar: Watchlist · Chart · Markets · Menu**

1. **Watchlist (native list)**
   - Named lists switcher (horizontal chips, like TV's `CHRIS / SECTOR ETF / STEVEN` row); `+` opens native
     Search; `⋯` list management (create/rename/delete).
   - Rows: symbol, display name (one-language law — `displayName(row, lang)` exactly like the web; never
     `name · zh`), price, change, change% (red/green per market convention). Quotes poll while visible.
   - Tap row → **Symbol preview sheet** (below). Long-press → context menu: Open chart · Remove ·
     Move to top. (TV extras — flags, sections, Add alert, Trade — deferred.)
   - Storage: signed-in → the user's Supabase watchlists via RLS (`watchlists`/`watchlist_symbols`, the same
     rows the web sees; the schema already supports multiple lists). Guest → local lists on device.

2. **Symbol preview sheet** (native; TV's tap-through from watchlist)
   - Header: name, symbol · market, live price, change; range chips `1D 5D 1M 3M 1Y All`.
   - Mini-chart = the **existing `/embed/chart` widget** in a small webview (`symbol/range/theme/lang`
     params; it already fetches its own bars and handles ranges). Swift Charts is the fallback only if
     widget-in-sheet performance disappoints in S4.
   - Key stats rows from existing fund/manifest JSONs (mcap, P/E, volume, sector/industry — whatever the data
     already has; no new pipeline).
   - One compact Mastermind-native block TV can't have: the Research-Desk read (verdict + drivers/cautions)
     from the existing intel JSON, clearly labeled as research, not a trade signal.
   - Primary button: **Open full chart** → Chart tab with that symbol.

3. **Chart (WKWebView, the product's chart)**
   - Loads the Terminal chart route in `?shell=app` mode; the web chart's own toolbars provide timeframes,
     chart types, indicators (add/edit/settings incl. Inputs/Style/Visibility — parity already exists on the
     web), drawings, compare, snapshot export.
   - Native thin header: symbol pill (tap → native Search sheet) + add-to-watchlist star. Rotation to
     landscape hides the native header (full-bleed chart, TV behavior).
   - Bridge keeps native header ↔ web chart in sync both directions; state (symbol/TF) is restored on
     relaunch via `restoreState`.
   - Webview stays mounted across tab switches (no reload cost); page-crash / load-failure → native retry
     surface.

4. **Markets (native + web embeds)** — TV "Explore" analog, minimal
   - Native index strip: SPY · QQQ · DIA · IWM · BTC · ETH cards (quotes from existing endpoints, mini
     sparkline via the embed widget or manifest spark data — cheapest wins in S4).
   - Rows pushing shell-mode web screens: **Discover** (the screener/heatmap hub) and **Analysis**.
     News/calendar/movers: deferred.

5. **Menu (native)** — TV's Menu analog
   - Account card: signed-out → Sign in; signed-in → email + plan badge, Sign out.
   - Language EN/中文 (drives native strings via a LEX-style tuple table AND the webview via `setLang` — same
     source of truth as the web's i18n pref).
   - About (version/build), Support link, Privacy link, "Back to website" link. Debug pane (origin switcher,
     bridge log) in dev builds only.

### 5.2 iPad

Same app, adaptive: `NavigationSplitView` with Watchlist sidebar + Chart detail in regular width; tab bar in
compact width. Gate for alpha: full-screen portrait/landscape correct on 11″ and 13″, 1/2 Split View usable,
no clipped sheets, hardware-keyboard basics (⌘F search, arrows in lists). Stage-Manager polish beyond that:
deferred.

### 5.3 Explicitly deferred iOS items

TV mechanics we will NOT build in alpha: alert creation (incl. the draggable price-line keypad), flags/
sections, news feeds, Minds/Ideas/Community, Forecast/Technicals gauge sheets, options chain (excluded
suite), bonds/ETF holder sheets, multi-layout save/open, bar replay, broker/Trade, widgets, watch app,
push notifications.

## 6. macOS app spec (Electron)

- **Electron Forge + TypeScript**, latest stable Electron. One `BrowserWindow` → production origin
  (desktop UI unchanged; no shell mode needed on desktop).
- Hardening (Electron security checklist, asserted by tests in the shell repo):
  `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, minimal preload (app version only for
  alpha), `setWindowOpenHandler` → system browser, `will-navigate` allowlist = owned origins only,
  permission-request handler default-deny, no `file://` product pages.
- Native menu + shortcuts (About, Hide, Quit, Reload, Actual Size/Zoom, Full Screen, minimal Edit/Window
  menus so copy/paste and ⌘W/⌘M behave); window bounds + last route/symbol restored across launches;
  offline/load-failure → bundled retry page.
- Signing: Developer ID Application cert, hardened runtime, notarization via `notarytool`; DMG + ZIP makers.
  Distributed from the members/landing page. **Auto-update deferred** (members re-download during alpha;
  `electron-updater` + a feed comes with the Windows wave).
- Windows Wave 2 reuses this project: add maker + Windows signing decision then; nothing in alpha may import
  macOS-only assumptions into the shared main/preload code.

## 7. Alpha scope (tightened from the charter)

**In:** guest + signed-in sessions · chart with full existing web chart toolset (TFs, types, indicators,
drawings, compare, snapshot/share) · native symbol search (category chips, one-language law, search logging
preserved server-side) · native watchlists + quotes · symbol preview sheet · Markets tab (indices + Discover/
Analysis embeds) · language toggle · offline/error/retry states · iPad adaptive layout · macOS menus/
shortcuts/restore · signed + notarized artifacts.

**Out (deferred, in rough later-priority order):** alerts UI · portfolio · push notifications · options suite
(hard-excluded per manifest) · flow desk · Pine editor · strategy tester · broker/trading · auto-update ·
Android/Windows · widgets/watch · offline data bundles · deep links/universal links (nice-to-have; add with
push in beta) · telemetry vendor (alpha uses TestFlight crash reports + MetricKit only).

Rationale: the web product is still evolving; anything ported now that gets revamped later is wasted build.
The chart-in-webview strategy means web-side improvements flow into the app with **zero native rebuilds**
unless the bridge contract changes.

## 8. Delivery slices

Every slice: fresh worktree off `origin/master`, `claude/<task>` branch, PR → CI → merge; web slices also
deploy + live-verify per the standing chain. One owner per file family (the Xcode project, the bridge
contract, and the Electron main process each have exactly one owner at a time).

| # | Scope | Contents | Exit gate |
|---|---|---|---|
| S0 | docs/governance | This plan merged; `AGENTS.md` boundary amendment; `design_refs/tv-ios/` gitignored | PR merged |
| S1 | web (`terminal/`) | `?shell=app` mode; bridge v1 + contract types/schema; `setSession` auth handoff; excluded-route nav policy; feature manifest; responsive spec covers shell mode | `npm run test:e2e:responsive` green at 1440×900 / 820×1180 / 390×844; deployed + live-verified with `?shell=app` |
| S2 | iOS scaffold | Xcode project (SwiftUI, universal, min iOS 17), 4-tab shell, Terminal-v5-derived theme tokens, Chart tab webview loads prod in shell mode (guest) | Simulator: iPhone 17 + iPad Pro 11″ boot to interactive chart |
| S3 | iOS search + watchlist | Native search sheet (categories, recents, language law), watchlist lists + quotes, bridge symbol sync | Search→chart ≤1 s in sim; watchlist survives relaunch |
| S4 | iOS preview + markets | Symbol preview sheet (embed-widget mini-chart, key stats, desk read), Markets tab (index cards + Discover/Analysis embeds) | All data from existing endpoints; no new backend |
| S5 | iOS auth + menu | Native Supabase login, Keychain session, webview session injection, Menu tab, language toggle | Guest→login→pro badge→embedded chart authed, verified in sim |
| S6 | iOS lifecycle + iPad + tests | Offline/retry, resume/rotation state restore, webview crash recovery, iPad split view, XCUITest smoke (launch→search→chart→watchlist), physical-device pass | Gates in §9; XCUITest green locally |
| S7 | Desktop scaffold | Electron Forge TS, hardened window, allowlist, menus/shortcuts, bounds+route restore, offline page, security assertions | Launches to live site; nav escape attempts blocked; restore works |
| S8 | Desktop packaging | Developer ID signing, hardened runtime, notarize, DMG/ZIP | Notarized DMG installs + launches on a clean Mac |
| S9 | Distribution | App Store Connect record + TestFlight upload; members "Apps" section on the landing (Macro Dashboard repo); download links live | Operator-gated (needs §10 inputs) |

Sequencing: S0+S1 first (S1 blocks everything iOS). S2–S6 proceed serially (same owner). S7–S8 can run in
parallel with S3+. S9 last. Estimated effort: **10–14 focused sessions**; the calendar long-pole is Apple
Developer Program enrollment/review, which §10 asks the operator to start now.

## 9. Acceptance gates (alpha-ready)

Shared: no Options surface reachable in any native alpha (nav, search results open preview-only, webview
route-block verified) · no blank startup; every failure state has a native retry · a normal web deploy does
not require app rebuilds · excluded-route block and bridge validated by tests.

iPhone: cold launch → interactive chart ≤ 2.5 s on Wi-Fi (≤ 4 s throttled) · gestures (pan/pinch/crosshair/
drawing-drag) smooth, no repeated >200 ms main-thread stalls · rotation + background/resume preserve symbol/
TF/route · keyboard never permanently obscures search/login · touch targets ≥ ~44 pt.

iPad: §5.2 gate. macOS: §6 — menus/shortcuts/restore/notarization all pass on a clean machine; renderer
crash recovers without losing more than the documented state.

Security: only owned origins in privileged contexts; bridge validates origin + message schema; no secrets in
logs; system-browser auth where applicable; Electron checklist + iOS ATS defaults enforced.

## 10. Operator inputs needed (start now, none block S0–S8 scaffolding)

1. **Apple Developer Program** membership (US$99/yr) + App Store Connect access for TestFlight; whether an
   account already exists.
2. **App display name + bundle ID family** — proposal: "Mastermind Terminal", `com.mastermindx.terminal`
   (iOS) / `com.mastermindx.terminal.desktop` (macOS).
3. **Developer ID Application certificate** authority for Mac signing (same Apple account).
4. **Guest mode in alpha builds:** recommended ON (matches the public web). Confirm, or request members-only.
5. **TestFlight audience:** internal testers only vs. public TestFlight link on the members page.
6. Support + privacy URLs to show in the apps (existing site pages are fine).

## 11. Open items folded into slices (no operator action needed)

- Whether the chart route needs a lighter first-paint path for the webview (only if S2 misses the 2.5 s
  gate; candidate: skip non-chart panels in shell mode).
- WebKit chart smoke: the embedded chart runs on WebKit (all iOS webviews do). Mobile Safari users already
  exercise this today, but CI is Chromium-only — S2's first job is a simulator pass to catch any
  WebKit-specific chart bug early.
- Manifest size on cellular (~1.9 MB, compressed on the wire): device-cache with conditional refresh in S3;
  only revisit (server-side slim manifest) if real-device profiling flags it.
