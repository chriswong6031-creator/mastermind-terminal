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

FULL_SHA="$(git -C "$SRC" rev-parse HEAD 2>/dev/null || echo '?')"
HEAD_SHA="${FULL_SHA:0:12}"

# next.config.ts is evaluated once during `next build` and again during
# `next start`.  The production service does not carry GIT_SHA in its
# environment, so the source sync must install the exact same immutable marker
# used by the build.  Preserve any checkout-local marker and restore it on exit;
# only the deployed source should retain this release identity.
DEPLOYMENT_MARKER="$APP/.deployment-id"
MARKER_BACKUP=""
if [ -f "$DEPLOYMENT_MARKER" ]; then
  MARKER_BACKUP="$(mktemp)"
  cp "$DEPLOYMENT_MARKER" "$MARKER_BACKUP"
fi
cleanup_deployment_marker(){
  if [ -n "$MARKER_BACKUP" ] && [ -f "$MARKER_BACKUP" ]; then
    mv -f "$MARKER_BACKUP" "$DEPLOYMENT_MARKER"
  else
    rm -f "$DEPLOYMENT_MARKER"
  fi
}
trap cleanup_deployment_marker EXIT

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
# Pin one full commit identity across build and runtime (version-skew protection
# + stale-chunk self-heal).  The following source rsync deliberately carries
# this gitignored marker to the box before the atomic build swap.
printf '%s\n' "$FULL_SHA" > "$DEPLOYMENT_MARKER"
( cd "$APP" && rm -rf .next && GIT_SHA="$FULL_SHA" NEXT_DEPLOYMENT_ID="$FULL_SHA" npm run build ) \
  || { log "ABORT: local build failed"; exit 1; }
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
  --exclude 'public' --exclude '.env*' --exclude '.deployment-id' \
  --exclude '.DS_Store' --exclude 'tsconfig.tsbuildinfo' \
  "$APP/" "$BOX:$DEST/" || { log "ABORT: source rsync failed — live site untouched"; exit 1; }
log "stage deployment identity -> $DEST/.deployment-id.new ..."
rsync -az -e "$SSH" "$DEPLOYMENT_MARKER" "$BOX:$DEST/.deployment-id.new" \
  || { log "ABORT: deployment-id rsync failed — live site untouched"; exit 1; }

# 3. ATOMIC SWAP + RESTART (guarded by .next.new/BUILD_ID) ------------------
# CHUNK-RETENTION CONTRACT (2026-07-19, options-crash fix): a deploy MUST keep the last 3 build
# generations' content-hashed `_next/static` chunks alive in the LIVE tree, because the /flow (and
# /,/screener,/alerts,/login) shells are served with `stale-while-revalidate=600` (next.config.ts):
# an edge/browser can hold a PRE-deploy document for up to ~900s and will request the OLD build's
# `_next/static/chunks/*`. If those hashes are gone, Turbopack throws "module factory is not
# available" (the reported Options crash). deploymentId (?dpl + skew reload) is the primary fix; this
# union is belt-and-suspenders so in-flight stale documents keep resolving until they self-reload.
#
# Retention model on the box:
#   .next            = LIVE (new build). Its static/ is UNIONed with up to 3 prior gens (cp -n).
#   .next.bak        = the immediately-prior FULL build — untouched, so step-5 ROLLBACK still
#                      restores it cleanly and byte-for-byte (rollback semantics unchanged).
#   .next.gen1/.gen2 = the two builds before that — kept ONLY as a source of old static chunks; we
#                      never boot them. Older than gen2 is purged.
# Ordering is: stop svc → rotate gen1←bak-of-last-time, gen2←gen1 → new .next.bak ← current .next →
# swap in new build → union prior static into live → start svc. Rollback restores .next.bak as before.
log "atomic swap + restart $SVC (keep 3 chunk generations) ..."
$SSH "$BOX" "cd $DEST && [ -f .next.new/BUILD_ID ] && [ -f .deployment-id.new ] \
  && systemctl stop $SVC \
  && rm -f .deployment-id.bak .deployment-id.absent \
  && { [ ! -f .deployment-id ] && : > .deployment-id.absent || cp -p .deployment-id .deployment-id.bak; } \
  && mv -f .deployment-id.new .deployment-id \
  && rm -rf .next.gen2 && { [ -d .next.gen1 ] && mv .next.gen1 .next.gen2 || true; } \
  && { [ -d .next.bak ] && cp -al .next.bak .next.gen1 2>/dev/null || cp -a .next.bak .next.gen1 || true; } \
  && rm -rf .next.bak && mv .next .next.bak && mv .next.new .next \
  && for g in .next.bak .next.gen1 .next.gen2; do [ -d \$g/static ] && cp -an \$g/static/. .next/static/ 2>/dev/null || true; done \
  && systemctl start $SVC" \
  || { log "ABORT: swap failed on box (staged BUILD_ID missing?) — restarting prior build"; \
       $SSH "$BOX" "cd $DEST; if [ -f .deployment-id.bak ]; then mv -f .deployment-id.bak .deployment-id; elif [ -f .deployment-id.absent ]; then rm -f .deployment-id; fi; rm -f .deployment-id.absent .deployment-id.new; systemctl start $SVC" 2>/dev/null; exit 1; }

# 4. HEALTH CHECK (localhost on box; CF/edge bypassed) ----------------------
ok=0; code=000
for i in $(seq 1 10); do
  sleep 3
  # /login intentionally redirects into Terminal's single onboarding surface.
  # Probe that public destination directly so a healthy redirect contract does
  # not trigger a false rollback after the new BUILD_ID is already serving.
  code="$($SSH "$BOX" "curl -s -o /dev/null -w '%{http_code}' -m 6 'http://127.0.0.1:3000/terminal?signin=1'" 2>/dev/null)"
  [ "$code" = 200 ] && { ok=1; break; }
done
srv="$($SSH "$BOX" "cat $DEST/.next/BUILD_ID 2>/dev/null" 2>/dev/null)"
if [ "$ok" = 1 ] && [ "$srv" = "$NEWID" ]; then
  $SSH "$BOX" "rm -f $DEST/.deployment-id.bak $DEST/.deployment-id.absent $DEST/.deployment-id.new" \
    || log "WARNING: could not clear deployment-id rollback files"
  log "OK — $SVC healthy (200), serving BUILD_ID=$srv."
  log "NB house rule: also eyeball that a PREVIOUS distinctive feature still renders, not just a 200."
  exit 0
fi

# 5. ROLLBACK ---------------------------------------------------------------
log "FAILED health (http=$code serving=$srv wanted=$NEWID) — ROLLING BACK to .next.bak"
$SSH "$BOX" "cd $DEST && systemctl stop $SVC; if [ -d .next.bak ]; then rm -rf .next && mv .next.bak .next; fi; if [ -f .deployment-id.bak ]; then mv -f .deployment-id.bak .deployment-id; elif [ -f .deployment-id.absent ]; then rm -f .deployment-id; fi; rm -f .deployment-id.absent .deployment-id.new; systemctl start $SVC"
log "rollback done — verify the site manually."
exit 1
