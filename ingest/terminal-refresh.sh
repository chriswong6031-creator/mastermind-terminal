#!/usr/bin/env bash
# STUB — this file is NOT the nightly refresh script anymore. Do not edit logic here.
#
# The single canonical source for the VPS nightly refresh (/usr/local/bin/terminal-data,
# cron 30 21 * * * on root@146.190.142.17) is the MACRO repo:
#
#     app/deploy/terminal-refresh.sh        <- edit THIS one
#
# vendored there and installed by app/deploy/terminal-data-setup.sh (macro PR #2378,
# merged 2026-07-12). Local checkout: /Users/chriswong/Documents/Cluade/Macro Dashboard
# (checkouts go stale — verify against origin/main).
#
# History: this repo's copy (and its rsynced descendants /opt/terminal/ingest/ and
# /opt/terminal/.gitsrc/ingest/) rotted behind the live wrapper — missing the 07-10/11
# Phase-1 shrink-restore guard, regen_flagship_slices, and the refresh_ohlc /
# refresh_ohlc_intl / hydrate passes — and stale copies like this have clobbered the
# live universe before (see the 2026-07-11 manifest 8,740->34 incident). Reduced to a
# pointer so there is exactly one source of truth.
echo "terminal-refresh.sh: STUB, not the refresh script. Canonical source: macro repo app/deploy/terminal-refresh.sh (installed as /usr/local/bin/terminal-data by app/deploy/terminal-data-setup.sh). Aborting." >&2
exit 64
