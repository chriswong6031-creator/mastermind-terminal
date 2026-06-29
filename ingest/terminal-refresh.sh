#!/usr/bin/env bash
# Nightly Mastermind Terminal universe + price refresh (VPS /usr/local/bin/terminal-data).
#
# Rebuilds the FULL multi-market manifest (~5,250 symbols) + OHLC from the macro
# parquet stores + Polygon/akshare/yfinance — REPLACING the old build_polygon_universe
# cron, which produced only 34 symbols and reverted the live universe.
#
# FAILURE-GUARDED: backs up the current manifest first; if the rebuild collapses to
# < 80% of the previous symbol count (akshare/Polygon outage, corrupt mid-write), it
# restores the backup so the live universe is never degraded. Logs to
# /var/log/terminal-data.log (cron 30 21 * * *).
set -u
cd /opt/terminal || exit 1
set -a; [ -f /opt/terminal/.env ] && . /opt/terminal/.env; set +a
export MACRO_REPO=/opt/macro
PY=/opt/macro/.venv/bin/python
D=/opt/terminal/terminal/public/data
MAN="$D/manifest.json"
ts(){ date -u "+%Y-%m-%d %H:%M:%S"; }
echo "[$(ts)] === terminal refresh start ==="

[ -f "$MAN" ] && cp -f "$MAN" "$MAN.prev"

run(){ echo "[$(ts)] -> $*"; "$@" || echo "[$(ts)] WARN: '$*' exited $?"; }
# NOTE: build_polygon_universe is intentionally NOT run — it rewrites the manifest from
# its hardcoded 34-symbol META, which would briefly collapse the live universe mid-run.
# build_universe loads the EXISTING manifest and only grows/refreshes it, so the live
# universe never dips below full. (Flagship-34 verdict/slice freshness — what
# build_polygon_universe gave — is deferred "live signals" work; revisit with atomic staging.)
# base multi-market universe + China/HK/US OHLC from the macro deep stores
run "$PY" ingest/build_universe.py --ohlc all
# US -> ~3,000 (Polygon ref+snapshot) and HK -> ~500 (akshare turnover)
run "$PY" ingest/expand_universe.py
# bilingual Chinese names (china_search name_zh + akshare 名称)
run "$PY" ingest/enrich_zh.py
# fill OHLC for any name still missing one (expanded US via Polygon, HK/Canada via yfinance)
run "$PY" ingest/backfill_ohlc.py --market all

count(){ "$PY" -c "import json,sys;print(len(json.load(open(sys.argv[1]))['symbols']))" "$1" 2>/dev/null || echo 0; }
NEW=$(count "$MAN"); PREV=$(count "$MAN.prev")
MIN=$(( PREV * 80 / 100 )); [ "$MIN" -lt 1000 ] && MIN=1000
if [ "${NEW:-0}" -lt "$MIN" ]; then
  echo "[$(ts)] GUARD TRIPPED: new=$NEW prev=$PREV min=$MIN — restoring previous manifest"
  [ -f "$MAN.prev" ] && cp -f "$MAN.prev" "$MAN"
else
  echo "[$(ts)] refresh OK: $NEW symbols (prev $PREV)"
fi
rm -f "$MAN.prev"
echo "[$(ts)] === terminal refresh done ==="
