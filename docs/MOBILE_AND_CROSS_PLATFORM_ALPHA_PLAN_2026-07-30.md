# Mastermind Mobile and Cross-Platform Alpha Plan

**Date:** July 30, 2026  
**Status:** Architecture recommendation and execution plan  
**Scope:** Mobile web hardening, iOS, macOS, Windows, and Android  
**Explicit exclusion:** Options surfaces are not part of the alpha

## Executive decision

The mobile web application had a strong foundation, but it was not yet as robust as the desktop application. The immediate parity gaps have now been addressed in the existing web code: core desktop chart actions are reachable on touch, split panes can be selected, drawings are usable, indicator and pane menus work without hover, portrait and landscape layouts are deliberate, navigation behaves like an app, hit targets are larger, and the heatmap no longer renders a large blank block before its content.

For the installable products:

1. **Use Electron for macOS and Windows.** This is the closest match to the TradingView desktop approach. TradingView's own release notes identify Electron versions used by its desktop app.
2. **Use Capacitor for iOS and Android, but do not treat production iOS as a permanently remote website wrapper.** Capacitor gives us a native project, WebKit/Android WebView rendering, and a controlled bridge to native capabilities.
3. **Architect all four platforms now, but release them in waves.**
   - First user alpha: **macOS + iOS TestFlight**
   - Second user alpha: **Windows**
   - Third user alpha: **Android**
4. **Keep the current Next.js web application in place.** Do not move the whole application into native shells. The alpha gets a deliberately small product surface.
5. **Use Codex as the primary implementation owner in this repository, with Xcode as the Apple build, simulator, profiling, and signing environment.** Fable 5 can be a useful architecture/review advisor, but it should not be a second implementation owner editing the same work in parallel.

This sequence validates both shell families early—Electron and Capacitor—without multiplying signing, store review, device fragmentation, and support work across four simultaneous releases.

## What was found in the existing repository

I searched current documentation, hidden project notes, and Git history for an older Electron, Capacitor, iOS, Android, or native-shell plan. I did not find a surviving cross-platform blueprint.

The history does contain earlier mobile-web work, including:

- `687da219` — full mobile responsive overhaul and native-app-style UX
- `580e3690` and `0126fbe1` — TradingView-grade touch work
- `162d6c39` — mobile chart and gauge stabilization
- `85d44229` — mobile symbol-search home

Those changes explain why the starting mobile experience was already respectable. They were useful historical context, but they do not define an installable-app architecture.

## Mobile web audit: before this sweep

### What was already good

- The mobile chart rendered correctly and supported touch pan/zoom.
- The core financial-analysis content already adapted to a single column.
- Screener, portfolio, alerts, scripts, and the research view were broadly usable.
- The symbol search modal was already compact and functional.
- The app had an existing mobile header and navigation drawer.
- The desktop application remained the richer reference implementation.

### Material gaps

1. Advanced chart commands were hidden on mobile rather than made reachable.
2. Compare was available in the desktop header but not from the mobile chart header.
3. The drawing sidebar disappeared completely at the mobile breakpoint.
4. Multi-pane layouts rendered only the first pane, with no pane selector.
5. Indicator actions were designed around hover. Touch users could not reliably reach settings, source, remove, and more.
6. Pane actions appeared only after mouse hover.
7. The bottom chart range/settings row used desktop-scale targets near 20 px high.
8. Landscape reserved too little visible height for the chart.
9. Navigation lacked a persistent native-app-style quick surface.
10. The navigation drawer did not lock body scroll, restore focus, or close by Escape.
11. The heatmap root inherited an Observatory rule that changed its fixed drawer into a normal flex child, creating roughly 541 px of blank space before the heatmap.
12. The app metadata did not yet express native/PWA-safe status-bar, theme, format-detection, and keyboard viewport behavior.

## Mobile sweep implemented

### Chart parity

- Mobile compare button in the symbol bar
- Horizontally scrollable access to all advanced toolbar actions
- Touch drawing toggle and horizontal drawing dock
- Touch-accessible drawing tool flyouts and style controls
- Explicit mobile pane tabs for 2- and 4-pane workspaces
- Active-pane rendering instead of hard-coding the first pane
- Touch pointer selection for pane operations
- Persistent “More” action for indicator legends without requiring hover
- Viewport-clamped legend menus
- Larger range, calendar, extended-hours, adjustment, and chart-settings controls
- Mobile-safe chart toolbar popovers
- More chart space in portrait
- Single-row landscape toolbar, hidden landscape bottom bar, and a chart that fills the remaining viewport

### App navigation and accessibility

- Five-item native-style bottom navigation: Chart, Analyst, Screener, Portfolio, More
- Options deliberately omitted from the quick alpha navigation
- Full inventory remains in the drawer for the existing web product
- Drawer role and labels, Escape handling, initial focus, focus restoration, and body scroll lock
- Dedicated close button
- Settings menu labels and Escape handling
- Larger mobile header controls

### Layout and performance

- Safe-area handling for status bar, home indicator, and landscape insets
- `content-visibility` for long off-screen research sections
- Touch manipulation hints and reduced accidental delayed taps
- Repaired heatmap document flow
- Larger Observatory filter/search controls
- Apple web-app metadata, dark color scheme, theme color, disabled telephone detection, and keyboard-resizing viewport behavior

### Validation completed

- 390 × 844 phone portrait
- 844 × 390 phone landscape
- 768 × 1024 tablet
- 1280 × 900 desktop regression
- Drawing toggle, tool flyout, style selection
- Compare search and close control
- Advanced detector popover
- Split-pane creation and pane switching
- Drawer focus, scroll lock, Escape close, and focus restoration
- Screener navigation and overflow
- Heatmap content start and touch controls
- TypeScript check
- 167 passing automated tests, with 4 existing test TODOs
- Optimized Next.js production build

The repository-wide lint task remains red from a pre-existing baseline of 590 errors and 127 warnings across the broader application. This sweep should not be represented as fixing that unrelated backlog. New shell packages should begin with a clean strict lint baseline, and the existing application should initially use a changed-files lint gate.

## Why Electron is the right desktop choice

[TradingView's July 2026 desktop release history](https://www.tradingview.com/support/solutions/43000673888-tradingview-desktop-releases-and-release-notes/) documents its Electron upgrades, including Electron 38. TradingView describes its desktop product as the web platform plus desktop-only workspace behavior such as restored tabs, linked symbols and intervals, multi-monitor workflows, native notifications, and OS theme integration.

That is the model Mastermind should follow:

- Reuse the proven web application and chart rendering.
- Add a small, hardened desktop host.
- Keep OS integration in the host rather than leaking Node APIs into the web app.
- Add desktop-only value incrementally.

Electron is heavier than Tauri, but its Chromium behavior is closest to the browser environment in which the chart is already validated. For this alpha, compatibility and delivery speed matter more than minimizing the installer by tens of megabytes.

### Desktop alpha architecture

```text
Electron main process
  ├─ window lifecycle and persisted bounds
  ├─ deep links
  ├─ signed updates
  ├─ native notifications
  ├─ safe external-link handling
  └─ narrow, validated IPC
       │
       ▼
Sandboxed renderer
  ├─ contextIsolation: true
  ├─ nodeIntegration: false
  ├─ sandbox: true
  ├─ owned HTTPS origin only
  └─ current Mastermind web application
```

The [Electron security checklist](https://www.electronjs.org/docs/latest/tutorial/security) should be treated as a release gate:

- Load only HTTPS/WSS content.
- Disable Node integration in remote renderers.
- Enable context isolation and sandboxing.
- Apply a restrictive Content Security Policy.
- Allowlist navigation and new-window targets.
- Validate the sender and schema of every IPC message.
- Deny permissions by default.
- Never pass arbitrary URLs to `shell.openExternal`.
- Keep Electron current.
- Enable ASAR integrity/fuses where compatible.

Use [Electron Forge](https://www.electronjs.org/docs/latest/tutorial/tutorial-packaging), the tool recommended by the Electron project, for packaging. macOS releases require signing and notarization; Windows releases require a trusted signing certificate. Electron's built-in updater supports macOS and Windows, and macOS automatic updates require a signed app.

### Desktop remote-first decision

For the alpha, the renderer should load the owned production HTTPS application. Do not package the current Next.js server or all `terminal/public/data` files into Electron.

The current production build warns that a dynamic Copilot file pattern can match more than 15,000 public data files. Bundling the entire server/data tree would create a large, slow, and difficult-to-update desktop package.

Remote-first gives:

- Immediate web feature and data updates
- Small desktop shell updates
- No duplication of the Next.js server runtime
- One web product during the alpha

The native shell still needs a bundled offline/startup page so a network failure does not produce a blank Chromium window.

Later, if offline charts become a product requirement, add a versioned local asset/cache layer rather than embedding the whole server.

## Why Capacitor is the right mobile choice

[Capacitor](https://capacitorjs.com/docs) is designed to add iOS and Android projects to an existing web application while exposing native SDK features through a plugin bridge. It lets the chart remain web technology while native Swift/Kotlin code owns the operating-system boundary.

The default iOS path uses WKWebView/WebKit. Apple allows special alternative-engine entitlements in limited jurisdictions, but they are irrelevant to this product and would add major review and security complexity.

### Important iOS constraint

Apple's current [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) require an app to offer functionality, content, and UI beyond a repackaged website under Guideline 4.2. They also restrict downloaded code that changes application functionality under 2.5.2.

Therefore:

- A Capacitor `server.url` build that points directly at the website is acceptable for local development and an early TestFlight prototype.
- It should not be the permanent public-App-Store architecture.
- The public alpha should contain app-specific native behavior and a bundled, reviewed client surface or a clearly bounded remote-content strategy reviewed against Apple's rules.

### Recommended two-step iOS implementation

#### Step 1 — TestFlight shell prototype

- Capacitor iOS project
- Owned HTTPS origin only
- Native splash and offline state
- Safe-area and keyboard integration
- System share sheet for chart snapshots
- Deep links into symbol and analyst routes
- Secure authentication handoff
- Alert push-notification prototype
- Network resume/retry handling

This validates WKWebView chart behavior, cookies/auth, background/resume, keyboard, gestures, export/share, and device performance without first migrating the whole UI.

#### Step 2 — public-alpha client boundary

Extract only the alpha surface into a bundleable client package:

```text
packages/
  chart-core/          chart state, indicators, drawings, events
  app-contracts/       API request/response schemas and route contracts
  design-tokens/       colors, spacing, type, breakpoints
  native-bridge/       platform-neutral interface, web/electron/capacitor adapters

apps/
  web/                 existing Next.js product
  desktop/             Electron Forge shell
  mobile/              Capacitor + locally bundled client entry
```

The current Next application remains in place. Components are extracted only when the alpha needs them. This is a strangler pattern, not a rewrite.

Data, quotes, analysis, alerts, and account state stay remote. The installed mobile bundle contains UI behavior; the APIs remain independently deployable.

### Native features required for an app-like alpha

These are useful product capabilities, not decorative review bait:

- Universal links and custom deep links
- OS share sheet for snapshots and analyst cards
- Keychain/Keystore-backed auth material
- System-browser OAuth with PKCE and deep-link return
- Push notifications for price/signal alerts
- Native offline, maintenance, and forced-upgrade screens
- Network-state awareness and foreground-resume refresh
- Haptic confirmation for a small set of deliberate actions
- External-link allowlist
- Crash reporting and performance traces

Avoid broad native bridges. The web client should request a semantic action such as `shareChart(snapshot)` rather than receive raw access to the filesystem or arbitrary native APIs.

## Alpha product scope

The alpha is not the complete web application inside a shell.

### Include

- Sign in and session restore
- Chart with one active symbol by default
- Symbol search
- Core timeframes and chart types
- Essential indicators
- Core drawings
- Compare overlay
- Compact watchlist
- Analyst/research overview
- Screener
- Portfolio summary
- Alerts list and alert deep links
- Heatmap if it remains stable in the shell
- Settings, language, and up/down color convention
- Share snapshot
- Offline/retry/update states

### Desktop-only alpha conveniences

- One persisted window
- Restore last route, symbol, timeframe, and window bounds
- Native menu and keyboard shortcuts
- Deep-link handling
- Native notifications
- Download/save snapshot

### Exclude

- Options and options analytics
- Full Pine/script editor
- Strategy tester
- Full multi-window and multi-monitor workspace
- Cross-window symbol/crosshair synchronization
- Broker connectivity and trading
- Complex workspace/layout migration
- Every research subpage
- Offline historical-data bundles
- Plug-in marketplace or arbitrary remote code

Existing web features do not need to be deleted. The installable alpha simply does not expose all of them in its primary navigation.

## Rollout recommendation

### Do not publicly launch all four at once

Four simultaneous public releases create four independent sources of failure:

- Apple signing, notarization, TestFlight, and App Review
- Windows signing, installer reputation, Defender, and update feeds
- Android signing, back behavior, keyboard/system-bar fragmentation, and Play review
- A new native bridge and lifecycle model

It would also split feedback between desktop and mobile before either shell pattern is stable.

### Build all four into the architecture; release in three waves

#### Wave 0 — completed mobile-web readiness

- Mobile parity sweep
- Production build
- Device-sized browser QA
- Cross-platform architecture decision

#### Wave 1 — macOS + iOS TestFlight

Why this pairing:

- Both can be built and profiled on one properly configured Mac.
- It validates Electron and Capacitor, the two architecture families.
- The likely first testers are already in the Apple ecosystem.
- Signing and release work can use one Apple Developer team.

Deliverables:

- Signed/notarized macOS alpha
- iOS TestFlight alpha
- Shared shell contract and telemetry
- Documented auth/deep-link flows
- Reference workflow suite

#### Wave 2 — Windows

Start Windows packaging as soon as the Electron shell passes the macOS functional gate. Most renderer and main-process logic is shared; the remaining work is installer, signing, OS integration, update, and Windows-specific QA.

Publish Windows roughly one short release cycle after macOS rather than waiting for the mobile product to be complete.

#### Wave 3 — Android

Create the Android Capacitor project early so architecture choices stay portable, but delay user rollout until:

- iOS lifecycle/auth/push behavior is stable
- mobile workflow feedback has settled
- Android back, keyboard, system bars, downloads, and notification permission flows are explicitly implemented
- at least one handset and one tablet release build pass, as recommended by Android's publishing guidance

Google Play also requires apps to be stable, responsive, and meaningfully functional. New Google Play apps are distributed as signed Android App Bundles.

## Proposed execution sequence

The durations below describe engineering order and rough scope, not a delivery promise.

### Milestone 0 — product and account preflight, 2–3 working days

- Confirm product name and bundle identifiers
- Confirm owned production origin
- Confirm Apple Developer organization/team
- Confirm Microsoft/Windows signing approach
- Confirm Google Play developer account
- Define privacy policy, terms, financial disclaimer, support URL, and deletion flow
- Choose crash/telemetry service
- Define the exact alpha navigation and feature flags
- Inventory current auth providers and embedded-browser restrictions

### Milestone 1 — shell contracts, 3–5 working days

- Add `app-contracts` package
- Add `native-bridge` interfaces and no-op web adapter
- Add `isNativeShell`, platform, app version, and capability negotiation
- Add `/app-bootstrap` API for one compact startup payload
- Add deep-link route contract
- Add remote feature flags and minimum-shell-version response
- Add offline/maintenance/upgrade UX
- Add shell-specific CSP and owned-origin allowlist

### Milestone 2 — Electron macOS alpha, 5–7 working days

- Scaffold Electron Forge app
- Harden `BrowserWindow`
- Add local startup/offline page
- Add persisted bounds and last route
- Add system-browser auth/deep-link return
- Add native menu and essential shortcuts
- Add share/save snapshot bridge
- Add notifications
- Add update channel
- Sign and notarize
- Create a private alpha installer/feed

### Milestone 3 — Capacitor iOS TestFlight alpha, 7–10 working days after Xcode is ready

- Install and select full Xcode
- Install iOS Simulator runtimes
- Add Capacitor iOS project
- Verify chart gestures on small, standard, and large simulators
- Implement lifecycle and safe-area handling
- Implement native auth return
- Add share, deep links, network state, and push prototype
- Add privacy manifest and permission strings
- Add launch assets and app icon
- Run Instruments for startup, memory, and hangs
- Test on at least one physical iPhone
- Archive, sign, and publish to TestFlight

### Milestone 4 — Windows alpha, 4–6 working days

- Windows CI runner
- Squirrel/MSIX decision
- Code-sign installer
- Deep-link protocol registration
- Native notifications and file dialogs
- Update feed
- Defender/SmartScreen and clean-VM test
- Private alpha distribution
- Microsoft Store submission later, not required for the first private alpha

### Milestone 5 — Android alpha, 5–8 working days

- Add/sync Capacitor Android project
- Implement Android back-stack behavior
- Handle edge-to-edge system bars and keyboard resize
- Implement share, deep links, network state, and push
- Generate separate upload key and enroll in Play App Signing
- Test handset and tablet release builds
- Publish to internal/closed Play testing

## Performance and quality gates

### Shared

- No blank startup screen
- No unbounded retry loop
- No shell API exposed to arbitrary origins
- Auth expiration returns to a recoverable sign-in state
- Deep links work from cold and warm launch
- Background/resume refreshes stale quotes without duplicating subscriptions
- Crash-free sessions above 99.5% during alpha
- Feature flags can disable a failing native-only feature without breaking charts

### Mobile

- App chrome appears within 500 ms after WebView creation
- Main chart is interactive within 2.5 s on normal Wi-Fi and 4 s on a throttled mobile profile
- Chart gesture frame rate remains near device refresh with no repeated >200 ms main-thread stalls
- Primary hit regions are 44 × 44 points where the UI permits
- No horizontal document overflow
- Portrait and landscape have separate accepted layouts
- Keyboard never permanently obscures search or authentication controls
- Memory warnings and background termination recover safely

### Desktop

- First window becomes visible with a real startup/offline surface, not white Chromium
- A single chart window remains below an initial 350 MB working-set budget during normal alpha use
- Renderer crashes can be reloaded without losing last route/symbol
- Navigation outside owned origins opens in the system browser
- Update rollback path is documented
- macOS Intel and Apple Silicon artifacts if Intel support is retained
- Windows 10/11 x64 release validation

## Fable 5, Xcode agents, or Codex?

[Anthropic positions Fable 5](https://www.anthropic.com/claude/fable) as a frontier model for ambitious, long-running work. Anthropic's own orchestration guidance describes an advisor pattern in which Fable sets strategy and other models execute.

That makes Fable useful for:

- Reviewing architecture at milestone boundaries
- Challenging App Review and security assumptions
- Reviewing a large migration plan
- Examining a cross-platform failure after local evidence has been collected
- Independent release-readiness review

It does not make Fable an iOS framework or a replacement for Xcode.

[Xcode 27](https://developer.apple.com/xcode/) provides coding-agent integration, Simulator, XCTest/XCUIAutomation, Instruments, device management, signing, and distribution. Those tools are required regardless of which coding model writes Swift.

The current development Mac is not ready for iOS work:

- `/Applications/Xcode.app` is not installed
- `xcodebuild` points only at Command Line Tools and fails
- `simctl` is unavailable

### Recommended operating model

- **Codex:** primary repository owner, implementation, tests, browser checks, Electron/Capacitor integration, command-line Xcode builds once installed
- **Xcode:** simulator/device execution, signing, Instruments, XCTest, archives, TestFlight
- **Fable 5:** optional advisor/reviewer for difficult milestones, not a concurrent editor
- **Human:** product acceptance, credentials/signing authority, TradingView reference capture, store metadata, final release decisions

One agent should own each branch at a time. If Fable reviews, it should return findings or a patch for deliberate review; it should not modify the same native project while Codex is editing it.

## How to show TradingView mechanics to the builder

Use a repeatable evidence package rather than relying only on a live screen-share session.

### Best reference package

For each workflow, provide:

1. A short screen recording, ideally 30–120 seconds
2. A timestamped action list
3. A screenshot at each important state
4. A one-sentence explanation of why the behavior matters
5. Acceptance criteria
6. Edge states: loading, empty, error, keyboard, rotation, background/resume

Example:

```text
Workflow: Add an indicator and edit its parameters

Start:
- AAPL daily candlestick chart
- No modal open

Actions:
00:03 Tap Indicators
00:05 Search "RSI"
00:08 Tap RSI
00:11 Open RSI legend menu
00:13 Tap Settings
00:16 Change length to 21
00:20 Save

Expected mechanics:
- Search receives focus immediately
- Adding RSI does not reset chart range
- Settings open from a touch-accessible legend action
- Save updates the pane without a chart flash
- Back returns to the same chart position

Do not copy:
- TradingView branding, icons, wording, or exact visual trade dress
```

### Recording versus live computer use

**Primary source: recordings plus workflow cards.**

They are repeatable, can be replayed frame by frame, survive across sessions, and become acceptance-test evidence.

**Secondary source: live Computer Use.**

It is useful for exploratory questions and can inspect:

- TradingView Desktop directly on the Mac
- An iOS Simulator
- An iPhone shown through iPhone Mirroring or another Mac-visible capture surface, if the environment permits interaction

It is less suitable as the only source because the exact sequence, timing, and starting state are easy to lose.

Best combination:

1. Record the canonical workflow.
2. Write the expected mechanics.
3. Let the builder inspect the recording and implement it.
4. Use live screen share/Computer Use for unclear transitions.
5. Record Mastermind performing the same acceptance workflow.
6. Compare behavior, not pixels or branding.

### Recording tips

- Use a clean demo TradingView account with no private watchlists or broker credentials.
- Turn off notifications before recording.
- Use one workflow per clip.
- Narrate gestures or add captions; iOS screen recordings do not reliably communicate exact finger position.
- For gestures that matter, film the physical phone with a second camera or use a Mac-visible mirrored view with a pointer.
- Record portrait and landscape separately.
- Include at least one slow/offline/error case.
- Name files predictably: `TV-IOS-01-symbol-search.mov`, `TV-IOS-02-add-indicator.mov`.

## Release and store considerations

### iOS

- Apple Developer Program membership
- Bundle ID, App Store Connect record, privacy policy, support URL
- App privacy answers and privacy manifest
- Reviewer demo account
- Accurate financial-data disclaimers
- Native value beyond a web clipping
- TestFlight before public App Store
- Store review notes explaining the app-specific chart, alerts, sharing, deep links, and research functionality

### macOS

- Developer ID Application certificate
- Hardened runtime
- Signing and notarization
- Universal build if Intel remains supported
- Signed update feed
- Direct private download first; Mac App Store can be evaluated later

### Windows

- Organization code-signing certificate
- Signed installer/update artifacts
- Clean Windows VM validation
- Direct private distribution first
- Microsoft Store later through MSIX or a listed signed installer

### Android

- Stable application ID
- Separate upload key
- Play App Signing
- Android App Bundle
- Internal/closed testing
- Data Safety form, privacy policy, content disclosures

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---:|---|
| iOS judged a repackaged website | App rejection | Native utility, limited coherent alpha, bundled client boundary before public release, explicit review notes |
| Remote shell outage | Blank/unusable app | Bundled startup/offline surface, retry/backoff, cached last state, status endpoint |
| Web changes break old shells | Existing users fail | Capability negotiation, minimum shell version, backward-compatible bridge, remote kill switch |
| Electron remote-content compromise | Native execution risk | No Node integration, sandbox, context isolation, strict IPC/origin/navigation policy |
| Current app bundle/data is too large | Slow desktop package | Remote-first desktop; never package all `public/data`; API/data boundary |
| Auth fails in embedded contexts | Blocks launch | System-browser OAuth with PKCE and deep links; explicit cookie/storage tests |
| Android/iOS lifecycle divergence | State loss or duplicate feeds | Shared lifecycle contract plus platform adapters and resume tests |
| All-platform simultaneous release | Slow feedback and support overload | Wave releases with common architecture |
| Exact TradingView imitation | Legal/design risk | Copy workflow ideas, not protected branding, assets, text, or trade dress |
| Existing lint debt hides regressions | Lower confidence | Strict clean shell packages, changed-files lint gate, burn-down baseline separately |

## Definition of alpha-ready

The first macOS and iOS alpha is ready when:

- A new user can install, sign in, open a chart, change symbol/timeframe, add an indicator/drawing, open research, and recover from an offline launch.
- Deep links and app resume work.
- Chart gestures meet the performance gate on a physical iPhone.
- No options entry is present in alpha navigation.
- The shell exposes no broad native API.
- Builds are signed and repeatable from CI.
- Crash/performance reporting is active.
- A known-issues page and rollback process exist.
- The workflow acceptance suite passes on web, macOS, and iOS.

## Immediate next actions

1. Approve the rollout order: macOS + iOS, then Windows, then Android.
2. Install full Xcode and at least one iOS Simulator runtime.
3. Confirm Apple Developer Team and proposed bundle IDs.
4. Decide private-alpha distribution endpoints and telemetry provider.
5. Capture the first five TradingView reference workflows:
   - Symbol search and switch
   - Add/edit/remove indicator
   - Draw/edit/remove trendline
   - Save/share chart snapshot
   - Alert deep link into a chart
6. Scaffold `app-contracts`, `native-bridge`, `apps/desktop`, and `apps/mobile`.
7. Build the macOS and iOS shell spikes against the same acceptance workflows.

## Primary references

- [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Apple UI design hit-target guidance](https://developer.apple.com/design/tips/)
- [Xcode and Simulator](https://developer.apple.com/xcode/)
- [Xcode command-line tool reference](https://developer.apple.com/documentation/xcode/xcode-command-line-tool-reference)
- [Capacitor documentation](https://capacitorjs.com/docs)
- [Electron security checklist](https://www.electronjs.org/docs/latest/tutorial/security)
- [Electron Forge packaging tutorial](https://www.electronjs.org/docs/latest/tutorial/tutorial-packaging)
- [Electron code signing](https://www.electronjs.org/docs/latest/tutorial/code-signing)
- [Electron autoUpdater](https://www.electronjs.org/docs/latest/api/auto-updater/)
- [TradingView Desktop overview](https://www.tradingview.com/support/solutions/43000671618-what-is-tradingview-desktop/)
- [TradingView Desktop releases](https://www.tradingview.com/support/solutions/43000673888-tradingview-desktop-releases-and-release-notes/)
- [Google Play functionality and UX policy](https://support.google.com/googleplay/android-developer/answer/9898783)
- [Android publishing overview](https://developer.android.com/studio/publish/)
- [Android app signing](https://developer.android.com/studio/publish/app-signing)
- [Microsoft Store Win32/Electron distribution](https://learn.microsoft.com/en-us/windows/apps/distribute-through-store/how-to-distribute-your-win32-app-through-microsoft-store)
- [Claude Fable 5](https://www.anthropic.com/claude/fable)
