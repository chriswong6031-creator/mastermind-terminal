#!/bin/bash
# Install or refresh the user LaunchAgent that owns the nightly fund/transcript lane.
set -euo pipefail

OPS_ROOT="${MM_FUND_OPS_ROOT:-/Users/chriswong/fund-ops-wt}"
SOURCE_PLIST="$OPS_ROOT/ops/launchd/com.mastermind.fund.plist"
SOURCE_RUNNER="$OPS_ROOT/ops/nightly_fund.sh"
DEST_DIR="$HOME/Library/LaunchAgents"
DEST_PLIST="$DEST_DIR/com.mastermind.fund.plist"
LABEL="com.mastermind.fund"
DOMAIN="gui/$(id -u)"
RUN_NOW=0
CHECK_ONLY=0

usage() {
  echo "Usage: /bin/bash $0 [--check | --run-now]"
  echo "  --check    validate repo paths and plist syntax without changing launchd"
  echo "  --run-now  install, then kick off one refresh immediately"
}

for arg in "$@"; do
  case "$arg" in
    --run-now) RUN_NOW=1 ;;
    --check) CHECK_ONLY=1 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $arg" >&2; usage >&2; exit 2 ;;
  esac
done

if ! /usr/bin/git -C "$OPS_ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Missing standalone ops clone at $OPS_ROOT" >&2
  echo "Create it from mastermind-terminal master before installing the LaunchAgent." >&2
  exit 1
fi
if [ ! -f "$SOURCE_PLIST" ] || [ ! -f "$SOURCE_RUNNER" ]; then
  echo "Ops clone is missing the LaunchAgent plist or nightly runner; update $OPS_ROOT first." >&2
  exit 1
fi

/usr/bin/plutil -lint "$SOURCE_PLIST" >/dev/null
BRANCH="$(/usr/bin/git -C "$OPS_ROOT" symbolic-ref --quiet --short HEAD || true)"
HEAD_SHA="$(/usr/bin/git -C "$OPS_ROOT" rev-parse --short HEAD)"
if [ "$CHECK_ONLY" -eq 1 ]; then
  echo "OK: repo=$OPS_ROOT branch=${BRANCH:-detached} head=$HEAD_SHA"
  echo "OK: plist and runner are present; plist syntax is valid"
  exit 0
fi

if [ "$BRANCH" != "master" ]; then
  echo "$OPS_ROOT must be on master before installing (found ${BRANCH:-detached})." >&2
  exit 1
fi
# Refresh refs, then prove the installed runner/plist come from the current
# deployment revision.  We refuse to install stale or locally modified control
# code; generated data elsewhere in the ops clone is intentionally ignored.
/usr/bin/git -C "$OPS_ROOT" fetch origin master --quiet
LOCAL_HEAD="$(/usr/bin/git -C "$OPS_ROOT" rev-parse HEAD)"
REMOTE_HEAD="$(/usr/bin/git -C "$OPS_ROOT" rev-parse origin/master)"
if [ "$LOCAL_HEAD" != "$REMOTE_HEAD" ]; then
  echo "$OPS_ROOT is stale: HEAD=$LOCAL_HEAD origin/master=$REMOTE_HEAD" >&2
  echo "Update the dedicated ops clone, then rerun this bootstrap." >&2
  exit 1
fi
if ! /usr/bin/git -C "$OPS_ROOT" diff --quiet HEAD -- \
  ops/nightly_fund.sh ops/bootstrap_nightly_fund.sh ops/launchd/com.mastermind.fund.plist; then
  echo "Nightly control files have local modifications; refusing to install them." >&2
  exit 1
fi

/bin/mkdir -p "$DEST_DIR"
TMP_PLIST="$(/usr/bin/mktemp "$DEST_DIR/.com.mastermind.fund.XXXXXX")"
trap '/bin/rm -f "$TMP_PLIST"' EXIT
/usr/bin/install -m 0644 "$SOURCE_PLIST" "$TMP_PLIST"
/bin/mv "$TMP_PLIST" "$DEST_PLIST"

# Refreshing is idempotent.  bootout returns non-zero when the job was not
# installed, which is a healthy first-install state.
/bin/launchctl bootout "$DOMAIN/$LABEL" >/dev/null 2>&1 || true
/bin/launchctl bootstrap "$DOMAIN" "$DEST_PLIST"
/bin/launchctl enable "$DOMAIN/$LABEL"

if [ "$RUN_NOW" -eq 1 ]; then
  /bin/launchctl kickstart -k "$DOMAIN/$LABEL"
fi

echo "Installed $LABEL from $SOURCE_PLIST"
/bin/launchctl print "$DOMAIN/$LABEL" | /usr/bin/sed -n '1,36p'
echo "Log: /tmp/mm_fund_refresh.log"
