#!/usr/bin/env bash
# STUB — this file is NOT the nightly refresh script. Do not edit logic here.
#
# ⚠️ THERE ARE TWO REAL COPIES, NOT ONE. /usr/local/bin/terminal-data (cron 30 21 * * * on
# root@146.190.142.17) is installed by BOTH of these, and the LAST WRITER WINS:
#
#     ops/terminal-data                  (THIS repo) <- installed by step 7 of EVERY
#                                                       /opt/terminal/terminal-build.sh deploy,
#                                                       so it wins most often in practice
#     macro app/deploy/terminal-refresh.sh           <- installed by macro
#                                                       app/deploy/terminal-data-setup.sh, which
#                                                       only runs when someone runs it
#
# An earlier revision of this stub called the macro copy "the single canonical source". That was
# wrong: ops/terminal-data overwrites it on every deploy. A pass added to only one copy vanishes
# at the next deploy or setup run — how the macro rows kept disappearing from the nightly
# (2026-07-27) and how the crypto OHLC pass nearly did (2026-07-28).
#
#     => EDIT BOTH, IN THE SAME PR, AND DIFF THEM BEFORE MERGING.
#
# Macro checkout: /Users/chriswong/Documents/Cluade/Macro Dashboard (checkouts go stale — verify
# against origin/main). Macro PR #2378 (2026-07-12) added the vendoring.
#
# History: this repo's copy (and its rsynced descendants /opt/terminal/ingest/ and
# /opt/terminal/.gitsrc/ingest/) rotted behind the live wrapper — missing the 07-10/11
# Phase-1 shrink-restore guard, regen_flagship_slices, and the refresh_ohlc /
# refresh_ohlc_intl / hydrate passes — and stale copies like this have clobbered the
# live universe before (see the 2026-07-11 manifest 8,740->34 incident). Reduced to a
# pointer so there is exactly one source of truth.
echo "terminal-refresh.sh: STUB, not the refresh script. TWO real copies install /usr/local/bin/terminal-data: ops/terminal-data (this repo, reinstalled by every terminal-build.sh deploy) and macro app/deploy/terminal-refresh.sh (installed by macro terminal-data-setup.sh). Edit BOTH. Aborting." >&2
exit 64
