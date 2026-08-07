# Mastermind Installable Apps — Fable Execution Charter

**Prepared:** July 30, 2026  
**Primary orchestrator:** Claude Fable 5 in Claude Code  
**Repository:** `mastermind-terminal` / `/Users/chriswong/Documents/Cluade/charting-app`  
**Initial platforms:** iPhone, iPad, and macOS  
**Later platforms:** Windows, then Android  
**Product implementation:** the single responsive `terminal/` web application  
**Explicit alpha exclusion:** the Options suite and every Options route, API surface, navigation item, alert type, and native deep link

> This is an execution charter, not a request for another high-level plan. Fable should inspect the current `origin/master`, create bounded workstreams, implement the approved shared-shell architecture, test it, and carry each completed unit through the repository's delivery process.

## 1. Executive decision

Use Fable 5 as the accountable architecture and orchestration owner. Fable should delegate bounded implementation and verification tasks to the available Claude Code sessions, while retaining responsibility for architecture decisions, integration order, acceptance evidence, and release gates.

Do not create native copies of the Mastermind product. The responsive Next.js Terminal remains the only implementation of charts, analysis, data behavior, indicators, drawings, watchlists, portfolio logic, alerts, and product navigation. Native projects are thin, security-hardened operating-system shells around that product.

The selected shell architecture is:

1. Use **Electron for macOS and Windows**. One JavaScript/TypeScript desktop shell owns both desktop platforms and uses the same Chromium runtime family in which the desktop Terminal is validated.
2. Use **Capacitor for iPhone, iPad, and Android**. One web-first mobile shell owns all three mobile/tablet destinations.
3. Use Xcode to build, simulate, profile, sign, archive, and distribute the Capacitor iOS/iPadOS project.
4. Use Android Studio/Gradle to build and distribute the same Capacitor mobile project on Android.
5. Use Swift or Kotlin only for small Capacitor plug-ins when a capability cannot be supplied by the shared web layer or an audited existing plug-in.
6. Make iPad a first-class destination, not a scaled iPhone layout.
7. Architect all four platform targets now, but do not release all four at once.
8. Release the first alpha through TestFlight for iPhone/iPad and a private signed Electron macOS channel. Add Windows next. Add Android after mobile lifecycle and workflow behavior are stable.

This is deliberately a staged alpha. It is not a complete migration of every web feature.

## 2. Direct answers to the product questions

### Can iOS, iPadOS, and macOS all be built in Xcode?

Technically yes: Apple supports iPhone, iPad, and macOS destinations in one Xcode multiplatform app. It is not the recommended architecture here.

Putting macOS in SwiftUI would leave Windows in Electron and Android in another mobile host. That creates three shell families and two separate desktop implementations. The product UI would still be shared, so it would not create a full rewrite, but native menus, lifecycle, bridge adapters, release automation, crash handling, and shell tests would diverge unnecessarily.

Use Xcode for the iPhone/iPad build. Build the Mac app from the same Electron desktop project used for Windows. Electron's Mac release still uses Apple's signing and notarization tools, but its source and packaging remain shared with Windows.

### Should the Mac app use Xcode or Electron?

Use Electron for macOS and Windows.

TradingView's public Desktop release notes explicitly document Electron upgrades, including Electron 38. Electron itself is designed to maintain one JavaScript codebase for macOS and Windows. That matches Mastermind's requirement better than a SwiftUI Mac app.

This decision has three practical advantages:

- The Mac and PC chart run in the same Chromium shell family.
- Desktop windowing, tabs, menus, updates, deep links, downloads, and crash recovery are implemented once.
- Future desktop shell changes are made once and tested on Mac and Windows, while product changes still happen only in `terminal/`.

The cost is Electron's larger runtime and a strict security requirement around remote content and IPC. Those costs are manageable and are preferable to maintaining separate native Mac and Electron Windows hosts.

### What is actually maintained?

```text
1 product codebase     terminal/       all features and responsive UI
1 desktop shell        Electron        macOS + Windows
1 mobile shell         Capacitor       iPhone + iPad + Android
```

An ordinary feature update changes only `terminal/`. A desktop host update changes Electron once and is packaged for Mac and Windows. A mobile host update changes the Capacitor layer once, with small Swift or Kotlin adapters only when an OS capability differs. This is the lowest-duplication practical architecture for the requested four platforms.

### Should all four platform families launch at once?

No. Design the bridge and feature manifest for all four, but release in waves:

1. iPhone + iPad TestFlight and private macOS alpha
2. Windows private alpha
3. Android internal/closed testing
4. Public store releases after the web product and native shell contracts stabilize

Four simultaneous public launches would combine Apple signing and review, Windows signing and installer reputation, Android lifecycle/device fragmentation, and a new native bridge before any one release loop has stabilized.

### Should Fable or Codex own the build?

Fable should own this initiative because it is a multi-stage architecture and orchestration problem across a shared repository and multiple builder sessions. Codex remains useful as an implementation or independent verification worker when Fable delegates a bounded task.

Fable is not a replacement for Xcode. Xcode remains the source of truth for Apple builds, Simulator, XCTest/XCUITest, Instruments, signing, archives, and TestFlight. Apple now exposes Xcode build and project capabilities to external agents over MCP, so Fable in Claude Code can use Xcode directly after the bridge is configured.

## 3. Verified starting state

These facts were checked while preparing this charter:

- The clean baseline was `origin/master` at `20e15334` on July 30, 2026.
- Xcode 26.6 (`17F113`) is installed at `/Applications/Xcode.app`.
- The iOS 26.5 Simulator runtime is installed.
- Available simulators include iPhone 17 variants, iPad Pro 11/13-inch, iPad Air 11/13-inch, iPad mini, and base iPad.
- The active command-line developer directory is still `/Library/Developer/CommandLineTools`, so bare `xcodebuild` and `simctl` currently fail.
- Commands work when `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer` is supplied.
- Claude Code is installed and new enough to run Fable 5.
- Xcode's MCP server was not present in the Claude Code MCP list at the time of this export.
- `terminal/` already has a responsive Playwright suite configured for desktop, tablet, and mobile.
- The current responsive test checks basic shell visibility, mobile drawer opening, settings, timeframe sheet access, and horizontal overflow.
- The current `origin/master` mobile drawer does not yet prove a complete accessibility contract such as focus trapping/restoration, body-scroll locking, or Escape behavior.
- The current shared primary checkout contains extensive unrelated work from other sessions. It must not be modified or used as the native-app delivery branch.
- An earlier local cross-platform plan was found and used as context. This charter supersedes its Codex-ownership recommendation and turns the Apple architecture into an Xcode-first measured decision.

Fable must re-check the baseline SHA, open PRs, recently merged responsive changes, and worktree inventory before implementation. It must not assume uncommitted work in the shared primary checkout has shipped.

## 4. Repository rules Fable must preserve

These rules are non-negotiable even if a fresh worktree does not yet contain the latest root instruction file:

1. Read `AGENTS.md`, `terminal/AGENTS.md`, and `terminal/CLAUDE.md` before changing the application.
2. Read the project memory index and the delivery notes for git flow, production/repository lineage, and deploy topology.
3. Treat `/Users/chriswong/Documents/Cluade/Macro Dashboard` as the connected backend/dashboard repository where auth, subscription, data-contract, API, Caddy, or deployment work crosses that boundary.
4. Begin every unit from a freshly fetched `origin/master`.
5. Create worktrees only under `charting-app/.claude/worktrees/<task>/`.
6. Use fresh `claude/<task>` branches. Do not use `codex/` branches.
7. Do not modify the dirty shared primary checkout or use the repository-global stash.
8. Do not revive `feat/mobile-terminal-redesign` or the retired `charting-app-mobile` worktree.
9. `terminal/` remains the only product implementation for desktop, tablet, and mobile.
10. Native shell folders may contain lifecycle, security, packaging, bridge adapters, icons, entitlements, signing configuration, and OS integration. They may not contain a second implementation of product or chart logic.
11. Every user-facing Terminal change must pass the shared responsive suite at 1440×900, 820×1180, and 390×844.
12. A completed substantive change follows commit → push → PR → CI → merge → branch deletion → git-gated production deployment → live verification unless the owner explicitly places it on hold.
13. Never deploy a worktree directly. Production deploys merged `origin/master` through `/opt/terminal/terminal-build.sh`.
14. One worktree owns a file family at a time. Fable must prevent multiple agents from editing the same Xcode project file, bridge contract, or shared shell component concurrently.

## 5. Product architecture

### 5.1 One product, several hosts

```text
                         ┌──────────────────────────────┐
                         │ terminal/                    │
                         │ Next.js + React product      │
                         │ charts, research, state, UI  │
                         └──────────────┬───────────────┘
                                        │
                           typed platform contract
                                        │
                         ┌───────────────┴───────────────┐
                         │                               │
                         ▼                               ▼
            ┌────────────────────────┐      ┌────────────────────────┐
            │ Mobile shell           │      │ Desktop shell          │
            │ Capacitor              │      │ Electron               │
            │ iPhone, iPad, Android  │      │ macOS, Windows         │
            │ WebView + OS plug-ins  │      │ Chromium + narrow IPC  │
            └────────────────────────┘      └────────────────────────┘
```

All shells point to the same owned product origin and speak the same semantic bridge contract. They do not import chart calculations, indicator engines, options logic, API business rules, or route implementations.

### 5.2 Proposed repository shape

The exact names may change through an ADR, but the separation must remain:

```text
terminal/                         # only product implementation
  lib/platform/
    contract.ts                   # typed bridge types and capability negotiation
    webAdapter.ts                 # browser no-op/fallback implementation
    featureManifest.ts            # alpha exposure and shell compatibility

shells/
  mobile/
    capacitor.config.ts
    ios/                           # Xcode iPhone/iPad universal app
    android/                       # Android Studio/Gradle project
    plugins/                       # only narrow audited native adapters
    tests/
  desktop/
    src/main/
    src/preload/
    src/renderer-bootstrap/
    tests/

contracts/
  native-shell.v1.schema.json
  native-features.v1.json

docs/
  adr/
  native/
```

If repository policy prefers `apps/` instead of `shells/`, Fable may choose it in the ADR. The governing rule is that these folders are hosts and adapters, never alternate product implementations.

### 5.3 Hosted-product strategy

For the private alpha, the Capacitor and Electron shells should load only the owned HTTPS Terminal origin and include a bundled startup/offline/error surface.

This makes normal web changes available across platforms without rebuilding native UI. It also keeps the installer small and prevents the repository's large changing data plane from being packaged into each application.

The shell must:

- Allow only approved Mastermind origins.
- Open external domains in the system browser.
- Refuse arbitrary redirects, pop-ups, custom schemes, and bridge calls from untrusted origins.
- Show a useful native offline/maintenance/update-required screen instead of a blank web view.
- Persist only the minimum route/session state required for recovery.
- Negotiate bridge version and capabilities before exposing native actions.
- Keep the last compatible experience functional when the website deploys ahead of an installed shell.

Before a public App Store release, review the hosted strategy against the current App Review Guidelines. Apple requires meaningful app-like utility beyond a repackaged website and limits downloaded code that changes app functionality. The release should have real native value—deep links, secure auth return, share/export, notification handling, network and lifecycle recovery, keyboard/window integration—and its review notes must describe that value accurately.

## 6. The seamless cross-platform update system

The goal is not “port every web PR four times.” The goal is “deploy product behavior once; rebuild shells only when an operating-system contract changes.”

### 6.1 Three update lanes

| Lane | Examples | Delivery | Native rebuild? |
|---|---|---|---|
| Product/web | Chart behavior, indicators, research pages, responsive UI, data display, copy, most navigation | Normal `terminal/` PR and production deploy | No, if bridge contract and alpha manifest remain compatible |
| Bridge/capability | Share snapshot, push permission, secure auth return, deep-link shape, file export, native menu command | Contract PR plus relevant shell adapters | Yes for affected native platforms |
| Packaging/OS | Entitlements, privacy manifest, minimum OS, signing, store metadata, Electron runtime, installer/update feed | Platform release workflow | Yes |

Most future work should stay in the first lane.

### 6.2 Capability negotiation

The web application must never assume that an installed shell has the newest native feature.

At startup the shell provides a small immutable descriptor:

```json
{
  "platform": "ios",
  "shellVersion": "0.1.0",
  "bridgeVersion": 1,
  "capabilities": [
    "share.snapshot",
    "link.universal",
    "auth.system-browser",
    "network.status"
  ]
}
```

The web app:

- Detects the adapter.
- Enables only capabilities that are explicitly present.
- Provides a browser fallback where possible.
- Hides or disables unavailable native actions.
- Responds to a remotely served minimum-compatible-shell policy.
- Uses a remote kill switch for individual bridge features.
- Never receives raw filesystem, process, arbitrary URL, or general native execution access.

Example semantic calls:

```ts
platform.shareSnapshot({ png, symbol, timeframe });
platform.openExternal({ url });       // shell validates the allowlist
platform.beginSystemAuth({ provider });
platform.requestNotifications();
platform.haptic({ kind: "confirmation" });
```

Do not expose primitives such as `readFile(path)`, `exec(command)`, or `openAnyURL(value)`.

### 6.3 Native-impact classification

Add one required pull-request classification:

```text
native-impact: none | smoke | bridge | binary
```

- `none`: ordinary web change; responsive tests only plus normal browser coverage.
- `smoke`: UI or routing change that needs automated launch/workflow checks in existing shells but no native source change.
- `bridge`: contract or capability behavior changed; update affected adapters and compatibility tests.
- `binary`: signing, entitlements, OS SDK, packaging, or native implementation changed; produce a new native build.

This label can initially be a PR checklist and later become a required CI input.

### 6.4 What happens after a normal web feature ships

1. The developer changes `terminal/`.
2. CI runs type checking, unit tests, and the responsive Playwright suite.
3. Path and label rules determine whether native smoke tests are needed.
4. If `native-impact:none`, the feature deploys once to the web origin and appears in compatible shells.
5. If `native-impact:smoke`, CI also launches the current Apple simulator build and/or Electron test shell against the preview URL.
6. If a bridge capability is required, the web feature remains behind capability detection until the relevant binary is distributed.
7. Release notes are generated from PR labels and manifests; an agent does not need to reread a large prose changelog to infer compatibility.

### 6.5 Sweeps are for quality, not manual porting

Use:

- Automated browser responsive tests on every product PR.
- A small shell smoke suite on changes to routes, auth, chart interaction, global CSS, lifecycle, or the platform adapter.
- Nightly simulator smoke runs against current `master`.
- A weekly cross-platform regression run while alpha is active.
- A monthly physical-device and installed-binary audit, plus one before each public release.
- Immediate targeted device testing for gestures, keyboard, auth, notifications, background/resume, downloads, and OS permissions.

Do not wait months and then manually “translate” web features into native versions. Periodic sweeps verify compatibility; they should not reimplement the product.

## 7. Options exclusion

Options is not merely absent from the first marketing page. It is a formal alpha feature gate.

### 7.1 Required behavior

- No Options item in Apple, Windows, or Android alpha navigation.
- No native deep link to `/options`.
- No Options push category.
- No Options alert creation or notification payload.
- No Options bridge capability.
- No Options screenshots, store copy, onboarding selection, or release notes.
- No preloading Options bundles in the alpha shell.
- A direct attempt to open `/options` from an alpha shell returns to Chart or shows “Not available in this alpha.”
- Existing web Options functionality remains untouched and available according to its current web entitlement rules.

### 7.2 Feature-manifest representation

```json
{
  "options": {
    "web": true,
    "nativeAlpha": false,
    "deepLinks": false,
    "notifications": false,
    "minimumShellVersion": null
  }
}
```

Do not scatter `if (platform)` checks through product components. Centralize exposure in one feature manifest. Later, Options can be enabled through a deliberate ADR, acceptance suite, and release gate after the web suite is stable.

## 8. Alpha product scope

### Include

- Authentication and session recovery
- Chart launch with a known default symbol
- Symbol search and switch
- Core chart types and supported timeframes
- Essential indicators and parameter editing
- Essential drawings and editing/removal
- Compare overlay
- Compact watchlist
- Analysis/research overview
- Discover/screener
- Portfolio summary
- Non-Options alerts and alert deep links
- Language and market color convention
- Share/export chart snapshot
- Offline, maintenance, retry, and forced-upgrade states
- Native keyboard/menu affordances appropriate to each platform

### Exclude

- The complete Options suite
- Options Copilot tools and Options alerts
- Full Pine/script editor
- Strategy tester
- Broker connectivity and order entry
- Complex workspace migration
- Full multi-monitor synchronization
- Every desktop-only power workflow
- Offline historical-data bundles
- Plug-ins or arbitrary downloaded code
- A native rewrite of charts, indicators, analysis, or data logic

Existing web routes do not need to be deleted. The installable alpha simply exposes a smaller coherent product surface.

## 9. Mobile web parity gate

Native shells will amplify weaknesses in the responsive product. Fable must treat mobile web quality as Phase 0, not assume it is already equivalent to desktop.

### 9.1 Required audit surfaces

- Chart toolbar and advanced commands
- Symbol search and keyboard behavior
- Compare
- Indicator add/edit/remove
- Indicator legend actions without hover
- Drawing selection, styling, editing, and deletion
- Split-pane selection and active-pane operations
- Settings
- Analysis/research drawers and long pages
- Discover/screener tables and filters
- Portfolio
- Alerts
- Offline/error/empty/loading states
- Portrait, landscape, iPad compact width, iPad full screen, and desktop

### 9.2 Known baseline concerns to re-verify

- The current mobile navigation exposes the complete web navigation, including Options.
- The basic drawer test does not prove focus management, body-scroll locking, Escape close, or focus restoration.
- Some advanced interactions were historically hover-oriented.
- A single “no horizontal overflow” assertion is not sufficient evidence for touch reachability or keyboard safety.
- Existing responsive tests cover representative behavior but not the complete alpha workflow set.
- Uncommitted responsive work in the shared primary checkout is not part of `origin/master` until it lands through a PR.

### 9.3 Mobile parity definition

“Same quality” does not mean showing every desktop control at once. It means:

- Every alpha workflow is reachable and recoverable on touch.
- No critical action requires hover.
- Compact layouts prioritize the chart without hiding essential commands.
- iPad takes advantage of available space and supports pointer/keyboard use.
- No modal, sheet, menu, legend, or input is clipped by safe areas or the keyboard.
- State survives rotation, resize, background, and resume.
- Desktop behavior does not regress.

Every intentional responsive change must update the shared product and test suite together.

## 10. Shell validation prototypes and ADR

The shell families are selected: Capacitor for mobile/tablet and Electron for desktop. Fable should still build narrow prototypes before full packaging so the shared hosted-product and bridge assumptions are proven with the real chart.

### 10.1 Shared prototype workflow

Both shell families must implement:

1. Launch to the owned Terminal origin.
2. Display a native loading surface, then reveal the chart when visually ready.
3. Sign in or restore a test session.
4. Switch symbol.
5. Pan and pinch/zoom the chart.
6. Add and edit an indicator.
7. Create and edit a trendline.
8. Open analysis and return without losing chart state.
9. Export/share a chart snapshot.
10. Handle an external link safely.
11. Simulate offline launch and recovery.
12. Restore last route, symbol, and window/scene state after restart.

### 10.2 Capacitor mobile prototype

- One Capacitor project with iOS and Android platform folders
- Universal iPhone/iPad Xcode target
- Owned production/preview origin only
- Bundled startup/offline/update surface
- Strict origin and navigation policy
- Shared typed Capacitor plug-in contract
- Share and deep-link proof
- iPhone gesture, rotation, keyboard, and resume proof
- iPad Split View, Stage Manager, pointer, and keyboard proof
- Android project created early enough to prove the contract builds, but no public Android rollout yet

### 10.3 Electron desktop prototype

- Electron Forge
- One macOS/Windows project
- `contextIsolation: true`
- `nodeIntegration: false`
- sandbox enabled
- narrow validated preload API
- strict navigation/new-window/permission policy
- persisted bounds and route
- native menu and snapshot export proof

### 10.4 Validation criteria

Record measurements and evidence, not impressions:

| Gate | Capacitor iPhone/iPad | Electron Mac/Windows |
|---|---:|---:|
| Relevant shared workflows pass | Required | Required |
| Chart gestures/input | Touch, pencil, and pointer correct | Wheel, pointer, and keyboard correct |
| Startup surface | No blank view | No blank window |
| Interactive chart on normal connection | Target ≤ 2.5 s | Target ≤ 2.5 s |
| Auth/session restore | Pass | Pass |
| Snapshot share/export | Pass | Pass |
| Scene/window restore | Pass | Pass |
| WebView/renderer recovery | Pass | Pass |
| Strict origin and bridge security | Pass | Pass |
| Same project builds second platform | Android debug build | Windows CI package |

Commit the architecture and contract as `docs/adr/ADR-CROSS-PLATFORM-SHELLS.md`, including measurements, screenshots, test commands, rejected alternatives, and the rule that SwiftUI/Kotlin code is limited to narrow plug-ins.

## 11. Mobile/Apple implementation plan

### Phase A0 — toolchain and accounts

1. Point developer tools at full Xcode:

   ```bash
   sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer
   xcodebuild -version
   xcrun simctl list devices available
   ```

   If changing the global selection is intentionally deferred, prefix commands with:

   ```bash
   DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
   ```

2. Enable “Allow external agents to use Xcode tools” in Xcode Settings → Intelligence.
3. Connect Claude Code to Xcode:

   ```bash
   claude mcp add --transport stdio xcode -- xcrun mcpbridge
   claude mcp list
   ```

4. Open the generated Capacitor iOS workspace in Xcode before asking the external agent to use Xcode tools.
5. Confirm Apple Developer team, bundle identifiers, signing ownership, App Store Connect access, and support/privacy URLs.
6. Use placeholder bundle IDs only for local spikes. Do not publish with inferred owner credentials.

### Phase A1 — shared web contract

- Add platform adapter and browser fallback.
- Add shell bootstrap descriptor and JSON schema.
- Add feature manifest with Options disabled for native alpha.
- Add minimum-shell policy and per-capability kill switches.
- Add route allowlist and deep-link schema.
- Add native-impact PR classification.
- Add contract tests that do not require Xcode.

### Phase A2 — Capacitor mobile workspace

- Add Capacitor to the existing web-first project without moving product logic out of `terminal/`.
- Create the iOS and Android platform projects from the same Capacitor configuration.
- Configure the iOS target as a universal iPhone/iPad app.
- Use audited Capacitor plug-ins for standard OS capabilities.
- Create custom Swift/Kotlin plug-ins only for narrow semantic capabilities that are genuinely missing.
- Add bundled loading, offline, maintenance, and update-required states.
- Add strict owned-origin navigation.
- Add logging with tokens, cookies, and private payloads redacted.
- Add debug-only Web Inspector support.
- Add deterministic configuration for local, preview, staging, and production origins.
- Prove that `npx cap sync ios` and `npx cap sync android` are repeatable and never overwrite hand-maintained native changes unexpectedly.

### Phase A3 — lifecycle and state

- Cold launch
- Warm launch
- Background and resume
- Memory warning/recreation
- Network loss and recovery
- Rotation
- iPad resizing and multiple scenes if enabled
- Web-process termination and reload
- Route, symbol, timeframe, and safe workspace restoration
- No duplicate quote/feed subscriptions after resume

### Phase A4 — native value

- Universal links and approved custom deep-link fallback
- System-browser auth with PKCE and secure callback
- Share sheet for snapshots and research cards
- Native notification receipt and alert deep linking
- Network status
- A small set of intentional haptics on iPhone/iPad
- Native About, version, diagnostics, privacy, and support surfaces

### Phase A5 — iPad quality

Test at minimum:

- iPad mini portrait and landscape
- 11-inch iPad full screen
- 13-inch iPad full screen
- 1/3, 1/2, and 2/3 Split View widths where supported
- Stage Manager resizes
- Magic Keyboard/trackpad or simulated keyboard and pointer
- External keyboard shortcuts
- Search keyboard open/close
- Chart pinch, pan, crosshair, drawing drag, and context actions
- Rotation and background/resume during an active chart

Do not approve iPad merely because the universal binary launches.

### Phase A6 — TestFlight alpha

- XCTest and XCUITest green
- Instruments startup, memory, CPU, hangs, and network pass
- At least one physical iPhone and one physical iPad pass
- Archive from a clean checkout
- Signed iPhone/iPad build uploaded to TestFlight
- External TestFlight only after internal feedback and required beta review details
- Known-issues and rollback document
- Crash/performance telemetry active

### Phase D1 — Electron macOS alpha

- Scaffold one Electron Forge project intended for both macOS and Windows.
- Harden `BrowserWindow`, navigation, permissions, preload, and IPC.
- Add a bundled startup/offline/update surface.
- Restore window bounds, route, symbol, and timeframe.
- Add macOS menu commands and essential shortcuts.
- Add safe snapshot save/share and external-link handling.
- Add native notifications and alert deep links.
- Add update channel and rollback.
- Sign, enable the hardened runtime, and notarize.
- Publish through a private alpha channel.

## 12. Windows and Android plan

### Windows — Wave 2

Continue the same Electron desktop shell already used for macOS. Product UI, preload contract, renderer bootstrap, update logic, and most window behavior are shared; Windows-specific work stays in a small adapter/configuration layer.

Deliver:

- Signed installer
- Deep-link protocol registration
- Native notifications
- Safe file save/share
- Window and route restoration
- Update channel and rollback
- Windows 10/11 clean-VM tests
- SmartScreen/Defender validation
- Private alpha before Microsoft Store submission

### Android — Wave 3

Do not begin with a feature-complete Android rollout. Generate and compile the Capacitor Android project early so the shared plug-in contract stays portable, then complete Android behavior after iPhone/iPad lifecycle behavior stabilizes.

Deliver:

- The same Capacitor configuration and web product used by iPhone/iPad
- Android back-stack behavior
- Edge-to-edge system bars and keyboard resize
- Share, deep links, network state, and push
- Separate upload key and Play App Signing
- Handset and tablet release-build tests
- Internal/closed Play testing before public release

## 13. Quality and performance gates

### Shared product

- `npm run test:e2e:responsive` passes at 1440×900, 820×1180, and 390×844.
- No horizontal document overflow.
- No alpha workflow requires hover.
- No blank startup or unbounded retry loop.
- Auth expiration returns to a recoverable sign-in state.
- Deep links work from cold and warm launch.
- Resume refreshes stale data without duplicate subscriptions.
- An old compatible shell survives a new web deploy.
- A failing native capability can be remotely disabled without breaking the chart.
- Options remains absent from the installable alpha.

### iPhone

- Accepted layouts at 390×844 and representative smaller/larger devices.
- Portrait and landscape accepted separately.
- Main chart interactive within 2.5 seconds on normal Wi-Fi and 4 seconds under a defined throttled profile.
- Primary actions use approximately 44×44-point hit regions where appropriate.
- Keyboard does not permanently obscure search, auth, or settings.
- Gesture behavior remains smooth at the device refresh rate without repeated >200 ms main-thread stalls.
- Background termination recovers to a useful state.

### iPad

- Full-screen and multitasking widths pass.
- Pointer hover may enhance behavior but is never required.
- Keyboard shortcuts do not steal text-input commands.
- Stage Manager resize does not clip modals, chart tools, or legends.
- The app uses additional space productively rather than stretching the phone layout.

### macOS

- One-window alpha opens with real startup content.
- Menu commands and expected keyboard shortcuts work.
- External navigation always leaves the shell safely.
- Downloads/share/export use approved destinations.
- Window, route, symbol, and timeframe restore.
- Renderer/web-process recovery does not lose more state than documented.
- Signing, hardened runtime, and notarization pass.

### Security

- Only owned HTTPS/WSS origins load inside the privileged shell.
- Bridge messages validate origin, sender, method, and payload schema.
- No arbitrary code, command, filesystem, or URL bridge.
- Secrets and session material never enter logs.
- External auth uses the system browser where required.
- CSP and navigation policies are documented and tested.
- Electron, if selected, follows its official security checklist.
- Apple privacy manifest and permission descriptions match actual behavior.

## 14. How to show TradingView iOS mechanics to Fable

Use recordings as the canonical evidence and Computer Use as the exploratory supplement.

### Recommended reference package

For each workflow provide:

1. A 30–120 second screen recording
2. A timestamped action list
3. Screenshots of important states
4. The starting state
5. The purpose of the behavior
6. Acceptance criteria
7. Loading, empty, error, keyboard, rotation, background, and resume variants where relevant
8. A “do not copy” note for branding, icons, wording, proprietary content, and exact trade dress

Example workflow card:

```markdown
# TV-IOS-02 — Add and edit an indicator

Start:
- AAPL daily candlestick chart
- Portrait
- No modal open

Actions:
- 00:03 tap Indicators
- 00:05 search RSI
- 00:08 add RSI
- 00:11 open the RSI legend menu
- 00:13 open Settings
- 00:16 set length to 21
- 00:20 save and return

Expected mechanics:
- Search focuses immediately.
- Adding RSI preserves the chart range.
- Every action is touch reachable.
- Saving updates without a white flash or chart reset.
- Back returns to the prior chart state.

Do not copy:
- TradingView marks, icon assets, wording, colors, or exact visual composition.
```

### Recording versus live access

Use both, in this order:

1. Record the canonical workflow.
2. Write the workflow card.
3. Let Fable and the assigned builder inspect the recording repeatedly.
4. Use live screen sharing, iPhone Mirroring, Simulator, or Computer Use for unclear behavior and exploratory questions.
5. Record Mastermind executing the same workflow.
6. Compare mechanics and outcomes, not pixels or branding.

Recordings are the source of truth because they survive across agents and can become acceptance evidence. Live Computer Use is valuable, but the start state and precise timing are easier to lose.

### First reference set

Capture:

1. Launch and restore last chart
2. Search and change symbol
3. Change timeframe and chart type
4. Add/edit/hide/remove indicator
5. Draw/edit/style/remove trendline
6. Compare another symbol
7. Save/share chart snapshot
8. Open an alert deep link
9. Rotate and resume
10. iPad pointer/keyboard and multitasking behavior

Keep private account, broker, payment, and watchlist information out of recordings. Store raw third-party recordings in a private ignored reference directory; commit only the original workflow descriptions and Mastermind acceptance criteria unless rights permit otherwise.

## 15. Fable orchestration model

Fable is the one accountable integrator. Other sessions are workers, not independent architects.

### Workstreams

1. **Architecture and ADR owner** — Fable directly
2. **Responsive parity and workflow tests**
3. **Web platform contract and feature manifest**
4. **Capacitor iPhone/iPad shell and Xcode tests**
5. **Electron macOS/Windows shell**
6. **Security/App Review review**
7. **Release automation and telemetry**

Fable may run independent workstreams in parallel only when their file ownership does not overlap.

### Coordination rules

- Every worker receives the relevant repo rules and this charter.
- Every worker starts from current `origin/master` in a fresh compliant worktree.
- Each task has explicit owned files, output, tests, and stop conditions.
- Workers report commits and evidence to Fable.
- Fable reviews diffs before integration.
- The Xcode project file has one owner at a time.
- Shared bridge schemas have one owner at a time.
- No worker deploys a branch directly.
- Fable checks `origin/master..HEAD` before every PR to avoid stale bundled commits.
- Fable records decisions in ADRs, not only in chat memory.

### Token-efficiency rule

Use Fable for:

- Architecture
- Task decomposition
- Cross-workstream integration
- High-risk review
- Final acceptance

Delegate bounded mechanical implementation, test writing, packaging, and evidence collection where appropriate. Preserve context in small versioned contracts, ADRs, manifests, test fixtures, and workflow cards instead of repeatedly sending the whole repository history to every agent.

## 16. CI and release automation

### Product CI

- TypeScript check
- Unit tests
- Responsive Playwright suite
- Contract schema validation
- Feature-manifest validation
- Native-impact label validation
- Preview URL for shell smoke tests where feasible

### Apple CI

- Install/sync Capacitor dependencies
- Build iPhone Simulator
- Build iPad Simulator
- XCTest
- XCUITest smoke workflow
- Archive dry run on protected release branches
- Signing only in secured CI with appropriate credentials

### Desktop CI

- Lint/type/test
- Security configuration assertions
- macOS package
- Windows package on a Windows runner
- Signed release jobs only on protected release tags
- Smoke launch against staging

### Compatibility matrix

Maintain a small machine-readable file:

```json
{
  "webRelease": "2026.07.30",
  "bridgeVersion": 1,
  "minimumShell": {
    "ios": "0.1.0",
    "ipad": "0.1.0",
    "macos": "0.1.0",
    "windows": null,
    "android": null
  },
  "disabledCapabilities": [],
  "nativeAlphaFeatures": [
    "chart",
    "analysis",
    "discover",
    "portfolio",
    "alerts"
  ]
}
```

Generate human release notes from merged PR labels. Do not use prose release notes as the runtime compatibility source.

## 17. Rollout plan

### Wave 0 — responsive and contract foundation

- Audit current `origin/master`
- Land missing mobile/iPad parity
- Expand workflow-level responsive tests
- Add platform contract, manifest, and Options exclusion
- Capture TradingView reference workflows

### Wave 1 — Apple alpha

- Complete shell prototypes and cross-platform ADR
- Build iPhone/iPad from the Capacitor mobile project
- Build macOS from the Electron desktop project
- Internal TestFlight
- Private signed Mac distribution
- Collect performance, crash, and workflow feedback

### Wave 2 — Windows alpha

- Package the existing Electron desktop shell for Windows
- Sign and test installer
- Private distribution
- Reuse the same hosted product and bridge contract

### Wave 3 — Android alpha

- Complete the existing Capacitor Android target
- Closed testing
- Validate lifecycle, keyboard, back, push, and tablet

### Wave 4 — public releases

- Public App Store only after native utility and review readiness are proven
- Mac App Store versus direct notarized distribution decided separately
- Microsoft Store later if it improves trust/distribution
- Play production after closed-test quality gates
- Options remains excluded until its own readiness ADR is approved

## 18. First 72 hours for Fable

Fable should begin with these actions:

1. Read repository instructions and required memory notes in full.
2. Fetch `origin/master`, inspect current PRs, and identify any responsive work already landing.
3. Create a program ADR/index and task ownership map.
4. Confirm Xcode command-line selection and MCP connectivity.
5. Run the existing responsive suite and capture baseline evidence.
6. Audit the alpha workflows on 390×844, 820×1180, and 1440×900.
7. Land or queue the centralized native-alpha feature manifest with Options disabled.
8. Define `native-shell.v1` and its browser fallback.
9. Scaffold one Capacitor mobile project with iOS and Android targets; run the iPhone/iPad target in Xcode.
10. Scaffold one hardened Electron desktop project for macOS and Windows; run the macOS target.
11. Run the shared 12-workflow prototype suite.
12. Commit the cross-platform shell ADR and measurements.
13. Decompose full Wave 0/Wave 1 work into non-overlapping branches.
14. Report only the operator decisions that cannot be safely inferred: Apple Team, final bundle IDs, signing authority, telemetry vendor, and distribution account access.

Fable should not pause after creating a plan. It should proceed through the reversible local and repository work while credentials or product-owner decisions are pending.

## 19. Definition of first-alpha ready

The first iPhone, iPad, and Mac alpha is ready when:

- A clean build is reproducible from the repository.
- iPhone/iPad Capacitor and macOS Electron pass the same core workflow suite.
- A user can launch, authenticate, open a chart, switch symbol/timeframe, add an indicator and drawing, open analysis, share a snapshot, follow an alert deep link, and recover from offline launch.
- iPad full-screen and multitasking behavior is accepted.
- No Options entry, deep link, alert, bridge feature, store copy, or screenshot is present.
- No broad native API is exposed to web content.
- Old compatible shells survive ordinary web releases.
- Web-only changes do not require a native rebuild.
- Binary-impact changes are detected by the PR/release process.
- Crash and performance telemetry is active.
- TestFlight and Mac distribution artifacts are signed.
- Known issues, rollback, minimum-shell policy, and support path are documented.
- The work has completed the repository delivery chain and live web compatibility has been verified.

## 20. Operator inputs required before distribution

Fable can scaffold and test without these, but distribution eventually requires:

- Apple Developer Team and App Store Connect roles
- Final product name and bundle identifier family
- Signing and notarization certificates/permissions
- Privacy policy, support URL, and account-deletion URL
- Reviewer test account strategy
- Crash/performance telemetry choice and privacy treatment
- Windows code-signing approach
- Google Play account and signing ownership

Do not block architecture, contracts, tests, local builds, or unsigned simulator work while these are pending.

## 21. Primary references

- [Apple: Giving external agents access to Xcode](https://developer.apple.com/documentation/xcode/giving-external-agents-access-to-xcode)
- [Apple: App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Apple: TestFlight](https://developer.apple.com/testflight/)
- [Capacitor: Cross-platform native runtime for web apps](https://capacitorjs.com/docs)
- [Electron: Introduction and supported desktop model](https://www.electronjs.org/docs/latest/)
- [Electron: Security](https://www.electronjs.org/docs/latest/tutorial/security)
- [Electron: Packaging with Forge](https://www.electronjs.org/docs/latest/tutorial/tutorial-packaging)
- [TradingView Desktop release notes](https://www.tradingview.com/support/solutions/43000673888-tradingview-desktop-releases-and-release-notes/)
- [Anthropic: Claude Fable](https://www.anthropic.com/claude/fable)
- [Anthropic: Fable and model orchestration patterns](https://www.anthropic.com/webinars/building-on-the-claude-platform-claude-fable-5-and-model-orchestration-patterns)

## 22. Paste-in kickoff for a fresh Fable task

```text
You are the accountable Fable 5 architect and orchestrator for the Mastermind
installable-app initiative.

Read docs/FABLE_APP_BUILD_EXECUTION_CHARTER_2026-07-30.md in full, then read all
repository AGENTS.md/CLAUDE.md instructions and required project memory. Work only
from fresh origin/master worktrees under .claude/worktrees using claude/* branches.
Do not modify the dirty primary checkout.

Execute the charter; do not merely rewrite it. Preserve terminal/ as the only
product implementation. Native projects are thin hosts with typed capability
adapters. Options is excluded from every installable alpha surface.

Begin with the verified baseline audit, Xcode MCP/toolchain setup, mobile/iPad
parity gate, shared native-shell contract, the Capacitor iPhone/iPad prototype,
and the Electron macOS prototype. Preserve one Capacitor mobile shell for
iPhone/iPad/Android and one Electron desktop shell for macOS/Windows. Record the
architecture and measurements in an ADR. Delegate bounded, non-overlapping
workstreams where useful, but remain the single integrator and final acceptance
owner.

Carry each completed substantive unit through commit, push, PR, CI, merge,
git-gated deployment where applicable, and live verification according to the
repository rules. Ask the operator only for credentials, signing authority, or
irreversible product choices that cannot be inferred safely.
```
