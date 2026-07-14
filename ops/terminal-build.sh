#!/usr/bin/env bash
# GIT-GATED zero-downtime build for the Mastermind Terminal (Next.js).
#
# ┌────────────────────────────────────────────────────────────────────────────┐
# │  SOURCE OF TRUTH = origin/master (github.com/chriswong6031-creator/          │
# │  mastermind-terminal). This script builds ONLY committed master code.       │
# │  Working-tree edits under /opt/terminal/terminal are IGNORED and will be     │
# │  overwritten. TO GO LIVE:  commit -> open PR -> merge to master -> run this. │
# │  A direct rsync/scp of a working tree no longer deploys anything.            │
# └────────────────────────────────────────────────────────────────────────────┘
#
# AUTHORING SOURCE: ops/terminal-build.sh in the repo. The deployed copy at
# /opt/terminal/terminal-build.sh is installed from master by step 7 of every
# deploy (effective the NEXT run) — edit via PR, never in place on the box.
#
# One deploy ships TWO kinds of code from the same origin/master SHA (see DEPLOY.md):
#   1. the Next.js app: terminal/ -> staged build -> atomic .next swap
#   2. runtime code consumed by cron + systemd OUTSIDE the app:
#        ingest/ scripts/ config/ contracts/ hub/ signal_layer/
#                                                 (overlay, tracked files only)
#        ops/terminal-data     -> /usr/local/bin/terminal-data     (nightly cron)
#        ops/terminal-build.sh -> /opt/terminal/terminal-build.sh  (next deploy)
#      signal_layer/ synced since the 2026-07-10 reconciliation (box GC-v2 engine
#      committed, incl. confluence_v2.py) — master is canonical. See DEPLOY.md.
#
# Zero-downtime: builds into a staging tree, atomic-swaps `.next` only after the
# build verifies (BUILD_ID present); the live server keeps serving until the swap.
# Auto-rolls-back to the previous build if the new one fails its health check.
# If the deploy fails at any step, NOTHING moves — app AND runtime code stay put.
set -euo pipefail

APP=/opt/terminal/terminal
SRC=/opt/terminal/.gitsrc            # canonical git checkout (read-only deploy key: github-mmterminal)
TSRC="$SRC/terminal"
BRANCH=master
log(){ echo "[build] $*"; }

log "node $(node -v)"

# 0) GIT GATE — the ONLY code that gets built is origin/$BRANCH.
if [ ! -d "$SRC/.git" ]; then
  log "FATAL: canonical checkout missing. Create it once with:"
  log "  git clone --branch $BRANCH git@github-mmterminal:chriswong6031-creator/mastermind-terminal.git $SRC"
  exit 1
fi
log "fetching origin/$BRANCH ..."
git -C "$SRC" fetch -q origin "$BRANCH"
git -C "$SRC" reset -q --hard "origin/$BRANCH"
git -C "$SRC" clean -qfd
SHA=$(git -C "$SRC" rev-parse --short HEAD)
log "GIT-GATED: deploying origin/$BRANCH @ $SHA  (working-tree edits in $APP are IGNORED)"

# 1) deps — from the canonical lockfile. Reuse $APP/node_modules unless the lock changed.
if [ ! -d "$APP/node_modules" ] || ! cmp -s "$TSRC/package-lock.json" "$APP/package-lock.json" 2>/dev/null; then
  log "installing deps (npm ci) — lockfile changed"
  cp -f "$TSRC/package.json" "$TSRC/package-lock.json" "$APP/" 2>/dev/null || true
  ( cd "$APP" && npm ci || npm install )
else
  log "deps unchanged — skipping npm ci"
fi

# 2) stage: canonical terminal/ source + $APP runtime (node_modules/.env*/public/data — all gitignored)
STAGE=$(mktemp -d "$(dirname "$APP")/.stage.XXXXXX")
trap 'rm -rf "$STAGE"' EXIT
log "staging origin/$BRANCH:terminal in $STAGE"
rsync -a --delete \
  --exclude='.next' --exclude='node_modules' --exclude='.env' --exclude='.env.*' --exclude='public/data' \
  "$TSRC/" "$STAGE/"
cp -al "$APP/node_modules" "$STAGE/node_modules"     # hardlink copy: Turbopack rejects out-of-tree symlinks
cp -a "$APP/.env" "$STAGE/.env" 2>/dev/null || true
cp -a "$APP/.env.local" "$STAGE/.env.local" 2>/dev/null || true
mkdir -p "$STAGE/public"
cp -al "$APP/public/data" "$STAGE/public/data" 2>/dev/null || rsync -a "$APP/public/data/" "$STAGE/public/data/" 2>/dev/null || true

# 3) build into the staging tree — the slow part; live site stays up throughout.
log "next build (staging) ..."
( cd "$STAGE" && npm run build )

# 4) verify the new build is complete before touching anything live.
if [ ! -f "$STAGE/.next/BUILD_ID" ]; then
  log "BUILD FAILED (no BUILD_ID) — live site untouched, aborting"
  exit 1
fi
log "new build OK: BUILD_ID=$(cat "$STAGE/.next/BUILD_ID")"

# 5) atomic swap (rename within one filesystem is atomic).
rm -rf "$APP/.next.bak"
[ -d "$APP/.next" ] && mv "$APP/.next" "$APP/.next.bak"
mv "$STAGE/.next" "$APP/.next"
log "swapped .next (previous build kept as .next.bak)"

# 6) restart onto the complete build; auto-rollback if it doesn't come up.
systemctl restart terminal
sleep 6
if curl -fsS http://127.0.0.1:3000/ -o /dev/null -w "[build] localhost:3000 -> %{http_code}\n"; then
  log "health OK"
else
  log "post-restart health check FAILED — rolling back to previous .next.bak"
  if [ -d "$APP/.next.bak" ]; then
    rm -rf "$APP/.next.broken"
    mv "$APP/.next" "$APP/.next.broken"
    mv "$APP/.next.bak" "$APP/.next"
    systemctl restart terminal
    log "rolled back to previous build"
  fi
  exit 1
fi

# 7) RUNTIME-CODE SYNC — cron + systemd consume code from /opt/terminal/<dir> that is
#    NOT part of the Next.js app; without this step, merged changes to those files
#    silently never reach the box (bit on 2026-07-10: PR #74's pull_macro_intel.py).
#    OVERLAY semantics (git archive | tar -x): tracked files are overwritten with
#    master; box-only untracked files (runtime caches like ingest/hk_universe_cache.json,
#    zh_cache.json, .polygon_*.json and *.bak-* backups) are left alone. NEVER convert
#    this to rsync --delete — those caches exist ONLY on the box.
#    signal_layer/ synced since 2026-07-10: the box↔master divergence was reconciled
#    (box GC-v2 engine incl. confluence_v2.py committed; master's inverted golden_gate
#    kept) — origin/master is now canonical for it, like ingest/.
RUNTIME_PATHS="ingest scripts config contracts hub signal_layer"
hub_state(){ find /opt/terminal/hub -type f -not -path '*/node_modules/*' -print0 2>/dev/null | sort -z | xargs -0 sha256sum 2>/dev/null | sha256sum || true; }
HUB_BEFORE=$(hub_state)
LOCK_BEFORE=$(sha256sum /opt/terminal/hub/package-lock.json 2>/dev/null | cut -d' ' -f1 || true)
log "runtime sync <- origin/$BRANCH: $RUNTIME_PATHS"
git -C "$SRC" archive HEAD -- $RUNTIME_PATHS | tar -x -C /opt/terminal/

# quote-hub runs hub/hub.js as a systemd service — npm ci if the lockfile moved, and
# restart ONLY when hub/ actually changed (a restart briefly drops live WS clients).
LOCK_AFTER=$(sha256sum /opt/terminal/hub/package-lock.json 2>/dev/null | cut -d' ' -f1 || true)
if [ "$LOCK_BEFORE" != "$LOCK_AFTER" ]; then
  log "hub lockfile changed — npm ci"
  ( cd /opt/terminal/hub && npm ci --omit=dev || npm install --omit=dev )
fi
HUB_AFTER=$(hub_state)
if [ "$HUB_BEFORE" != "$HUB_AFTER" ]; then
  systemctl restart quote-hub
  log "quote-hub restarted (hub/ changed)"
else
  log "hub/ unchanged — quote-hub not restarted"
fi

# cron wrapper: crontab (30 21 * * *) runs /usr/local/bin/terminal-data; its authoring
# source is ops/terminal-data (ops/README.md). Installed via temp+rename so a mid-run
# nightly keeps executing its already-open copy.
install -m 0755 "$SRC/ops/terminal-data" /usr/local/bin/.terminal-data.new
mv -f /usr/local/bin/.terminal-data.new /usr/local/bin/terminal-data
log "installed ops/terminal-data -> /usr/local/bin/terminal-data"

# self-update: rename = new inode, so the currently-running instance is untouched;
# the new script takes effect on the NEXT deploy.
install -m 0755 "$SRC/ops/terminal-build.sh" /opt/terminal/.terminal-build.sh.new
mv -f /opt/terminal/.terminal-build.sh.new /opt/terminal/terminal-build.sh
log "installed ops/terminal-build.sh -> /opt/terminal/terminal-build.sh (effective next run)"

# 8) reflect canonical master into $APP source (so the on-box source == what is live/committed,
#    and any stray working-tree edits are cleared — enforcing 'master is the source of truth').
log "syncing $APP source <- origin/$BRANCH:terminal"
rsync -a --delete \
  --exclude='.next' --exclude='.next.bak' --exclude='.next.broken' --exclude='.stage.*' \
  --exclude='node_modules' --exclude='.env' --exclude='.env.*' --exclude='public/data' \
  "$TSRC/" "$APP/"

log "DONE — live = origin/$BRANCH @ $SHA (app + runtime code, git-gated, healthy)"
