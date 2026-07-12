#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# deploy_terminal.sh — ship the Mastermind Terminal (charting-app) to the VPS.
#
# WHAT: build locally, rsync .next + source to the box, atomic-swap, health-
# check, roll back on failure. This is the "live VPS push" half of the
# GitHub-PR + VPS-deploy workflow.
#
# THE HOUSE RULE (2026-07-05 rollback incident — ~15k lines of newer VPS work
# were wiped): agents historically hot-edit ON THE BOX, so the box can hold
# source that git does not. Deploying git->box then silently overwrites it.
# => This script REFUSES to deploy unless the box's live source matches the
#    git commit you are deploying (parity gate, step 0). If it aborts,
#    reconcile box->git first: rsync /opt/terminal/terminal source down,
#    commit as vps-truth-<date>, merge to master, then re-run.
#
# TOPOLOGY: Caddy :443 app.mastermind-x.com -> 127.0.0.1:3000 = terminal.service
#   (next start). /opt/terminal/terminal is a PLAIN FILE COPY, not a git checkout.
#   The Python /api backend (:8000) is a separate service — untouched here.
#
# USAGE:  scripts/deploy_terminal.sh           # build HEAD + deploy
#         DRY_RUN=1 scripts/deploy_terminal.sh # parity gate + build only, no swap
#   Run from any checkout of this repo; it deploys that checkout's HEAD.
#   Stop any local `next dev` first — it locks .next and breaks `next build`.
# ---------------------------------------------------------------------------
set -uo pipefail

SELF="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$SELF"                       # repo root (this script lives in <root>/scripts)
APP="$SRC/terminal"               # the Next.js app
BOX="root@146.190.142.17"
KEY="$HOME/.ssh/macro_dashboard_deploy_v2"
SSH="ssh -i $KEY -o BatchMode=yes -o ConnectTimeout=20"
DEST="/opt/terminal/terminal"
SVC="terminal.service"
# representative source files for the parity gate
MARKERS="lib/pine.ts components/TerminalShell.tsx app/terminal/page.tsx components/OptionsHubView.tsx"

log(){ echo "$(date '+%F %T') deploy_terminal: $*"; }

# never run on the box itself (this sentinel exists only there)
[ -f /opt/terminal/terminal-build.sh ] && { log "refusing to run on the VPS"; exit 2; }
[ -d "$APP" ] || { log "ABORT: no terminal/ under $SRC — run from a repo checkout"; exit 2; }

HEAD_SHA="$(git -C "$SRC" rev-parse --short HEAD 2>/dev/null || echo '?')"

# 0. PARITY GATE ------------------------------------------------------------
log "parity gate: box live source vs git HEAD ($HEAD_SHA) ..."
drift=0
for f in $MARKERS; do
  lh="$(git -C "$SRC" show "HEAD:terminal/$f" 2>/dev/null | shasum | awk '{print $1}')"
  bh="$($SSH "$BOX" "sha1sum $DEST/$f 2>/dev/null | cut -d' ' -f1" 2>/dev/null)"
  if [ -n "$bh" ] && [ "$lh" != "$bh" ]; then log "  DRIFT $f: git=$lh box=$bh"; drift=1; fi
done
if [ "$drift" = 1 ]; then
  log "ABORT: the box has source not in HEAD. Reconcile box->git first (rsync $DEST"
  log "       source down -> commit as vps-truth-<date> -> merge to master), then re-run."
  exit 1
fi
log "parity gate OK."

# 1. BUILD LOCALLY (the 1.9 GB box OOMs a Next build) -----------------------
pgrep -f "next dev" >/dev/null 2>&1 && log "WARNING: a local 'next dev' looks active — it locks .next; stop it if the build fails."
log "building $APP ..."
( cd "$APP" && rm -rf .next && npm run build ) || { log "ABORT: local build failed"; exit 1; }
[ -f "$APP/.next/BUILD_ID" ] || { log "ABORT: no .next/BUILD_ID after build"; exit 1; }
NEWID="$(cat "$APP/.next/BUILD_ID")"
log "built BUILD_ID=$NEWID"

[ "${DRY_RUN:-0}" = 1 ] && { log "DRY_RUN set — stopping before rsync/swap."; exit 0; }

# 2. RSYNC .next -> .next.new (staging), then SOURCE (coherence) -------------
# public/ EXCLUDED: the box owns the nightly-refreshed OHLC/data (clobbering =
# stale prices). .env* EXCLUDED: never clobber the box's prod Supabase key.
log "rsync .next -> $DEST/.next.new ..."
rsync -az --delete --exclude cache -e "$SSH" "$APP/.next/" "$BOX:$DEST/.next.new/" \
  || { log "ABORT: .next rsync failed (box unreachable?) — live site untouched"; exit 1; }
log "rsync source (excl node_modules/.env*/.next*/public/.git) ..."
rsync -az -e "$SSH" \
  --exclude '.git' --exclude 'node_modules' --exclude '.next' --exclude '.next.*' \
  --exclude 'public' --exclude '.env*' --exclude '.DS_Store' --exclude 'tsconfig.tsbuildinfo' \
  "$APP/" "$BOX:$DEST/" || { log "ABORT: source rsync failed — live site untouched"; exit 1; }

# 3. ATOMIC SWAP + RESTART (guarded by .next.new/BUILD_ID) ------------------
log "atomic swap + restart $SVC ..."
$SSH "$BOX" "cd $DEST && [ -f .next.new/BUILD_ID ] && systemctl stop $SVC \
  && rm -rf .next.bak && mv .next .next.bak && mv .next.new .next && systemctl start $SVC" \
  || { log "ABORT: swap failed on box (staged BUILD_ID missing?) — restarting prior build"; \
       $SSH "$BOX" "systemctl start $SVC" 2>/dev/null; exit 1; }

# 4. HEALTH CHECK (localhost on box; CF/edge bypassed) ----------------------
ok=0; code=000
for i in $(seq 1 10); do
  sleep 3
  code="$($SSH "$BOX" "curl -s -o /dev/null -w '%{http_code}' -m 6 http://127.0.0.1:3000/" 2>/dev/null)"
  [ "$code" = 200 ] && { ok=1; break; }
done
srv="$($SSH "$BOX" "cat $DEST/.next/BUILD_ID 2>/dev/null" 2>/dev/null)"
if [ "$ok" = 1 ] && [ "$srv" = "$NEWID" ]; then
  log "OK — $SVC healthy (200), serving BUILD_ID=$srv."
  log "NB house rule: also eyeball that a PREVIOUS distinctive feature still renders, not just a 200."
  exit 0
fi

# 5. ROLLBACK ---------------------------------------------------------------
log "FAILED health (http=$code serving=$srv wanted=$NEWID) — ROLLING BACK to .next.bak"
$SSH "$BOX" "cd $DEST && systemctl stop $SVC; if [ -d .next.bak ]; then rm -rf .next && mv .next.bak .next; fi; systemctl start $SVC"
log "rollback done — verify the site manually."
exit 1
