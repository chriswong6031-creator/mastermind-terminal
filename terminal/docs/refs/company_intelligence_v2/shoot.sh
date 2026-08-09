#!/usr/bin/env bash
# Screenshot every reference composition at the three responsive-law breakpoints
# (AGENTS.md: 1440x900 desktop, 820x1180 tablet, 390x844 mobile).
#
#   ./shoot.sh
#
# Uses the chrome-headless-shell that Playwright already installed for the E2E
# suite, so this adds no dependency.
set -euo pipefail
cd "$(dirname "$0")"

SHELL_BIN="${CHROME_HEADLESS_SHELL:-$HOME/Library/Caches/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-mac-arm64/chrome-headless-shell}"
[ -x "$SHELL_BIN" ] || { echo "chrome-headless-shell not found at $SHELL_BIN" >&2; exit 1; }

mkdir -p shots
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

shoot() { # file  label  W  H
  "$SHELL_BIN" --headless --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
    --virtual-time-budget=1500 --window-size="$3,$4" \
    --screenshot="shots/$2.png" "file://$PWD/$1" --user-data-dir="$TMP" >/dev/null 2>&1
}

for f in *.html; do
  [ "$f" = "index.html" ] && continue
  base="${f%.html}"
  shoot "$f" "${base}@1440" 1440 900
  shoot "$f" "${base}@820"  820 1180
  shoot "$f" "${base}@390"  390 844
  echo "shot $base"
done
echo "wrote $(ls shots/*.png | wc -l | tr -d ' ') screenshots to shots/"
