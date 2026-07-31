# Mastermind Terminal — iOS/iPadOS shell

Native SwiftUI host for the Terminal (masterplan: `docs/NATIVE_APPS_ALPHA_MASTERPLAN_2026-07-30.md`).
Presentation + OS integration only — product logic stays in `terminal/` (see the
"Native app shells" law in the repo root `AGENTS.md`).

- Chart tab hosts `https://app.mastermind-x.com/terminal?shell=app` in a WKWebView and speaks
  bridge v1 (`terminal/lib/platform/contract.ts`, `contracts/native-shell.v1.schema.json`).
- Route policy mirrors `contracts/native-features.v1.json` (`AppConfig.allowedRoutes`) — the
  Options suite and other excluded surfaces are blocked native-side.
- Universal iPhone/iPad target, min iOS 17, Swift 5 mode, generated Info.plist.

## Build & run (simulator; no signing needed)

```bash
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
xcodebuild -project apps/ios/MastermindTerminal.xcodeproj \
  -scheme MastermindTerminal \
  -destination 'platform=iOS Simulator,name=iPhone 17' \
  -derivedDataPath apps/ios/build \
  -configuration Debug CODE_SIGNING_ALLOWED=NO build
```

App bundle: `apps/ios/build/Build/Products/Debug-iphonesimulator/MastermindTerminal.app`.
Install/launch with `xcrun simctl` or the Claude Code iOS Simulator tools.

The `xcodeproj` uses the synchronized-folder format (objectVersion 77): everything under
`MastermindTerminal/` is in the target automatically — adding a Swift file needs no project edit.
One owner at a time for `project.pbxproj` (masterplan §8 rule).
