#!/usr/bin/env bash
# Nightly Mastermind Terminal universe + price refresh (VPS /usr/local/bin/terminal-data).
#
# Builds the FULL multi-market manifest into a STAGING file (TERMINAL_MANIFEST) and
# ATOMICALLY swaps it over the live manifest.json only at the very end — so the live
# universe is NEVER reduced mid-run. This lets build_polygon_universe run (fresh
# flagship-34 verdicts + slices) without its 34-symbol baseline ever reaching live.
#
# Side benefit: the rebuild starts from build_polygon_universe's fresh manifest, so the
# universe is the CURRENT top-N each night (no unbounded additive drift; names that drop
# out are pruned from search — their watchlist rows + OHLC files still persist).
#
# FAILURE-GUARDED: if the staged rebuild ends below 80% of the live count, the swap is
# skipped and live is left untouched. Per-symbol OHLC/slice files write straight to the
# live dir (atomic per file). Logs to /var/log/terminal-data.log (cron 30 21 * * *).
set -u
cd /opt/terminal || exit 1
set -a; [ -f /opt/terminal/.env ] && . /opt/terminal/.env; set +a
export MACRO_REPO=/opt/macro
# pull_macro_intel reads the macro dashboard stockdata dir.
# Override via env var; default mirrors the VPS layout.
export MACRO_STOCKDATA="${MACRO_STOCKDATA:-/opt/macro/site/stockdata}"
PY=/opt/macro/.venv/bin/python
D=/opt/terminal/terminal/public/data
LIVE="$D/manifest.json"
STAGE="$D/manifest.staging.json"
export TERMINAL_MANIFEST="$STAGE"
ts(){ date -u "+%Y-%m-%d %H:%M:%S"; }
count(){ "$PY" -c "import json,sys;print(len(json.load(open(sys.argv[1]))['symbols']))" "$1" 2>/dev/null || echo 0; }
echo "[$(ts)] === terminal refresh start (staging) ==="

rm -f "$STAGE"
run(){ echo "[$(ts)] -> $*"; "$@" || echo "[$(ts)] WARN: '$*' exited $?"; }
# flagship 34 -> staging manifest + fresh real-OHLC/slices/verdicts (OHLC/slices go to live dir)
run "$PY" -m ingest.build_polygon_universe
# if build_polygon_universe produced nothing, fall back to the live manifest so we don't
# lose the rich flagship records (a later successful run re-prunes any drift)
[ -s "$STAGE" ] || cp -f "$LIVE" "$STAGE"
# expand base multi-market universe + China/HK/US OHLC from the macro deep stores
run "$PY" ingest/build_universe.py --ohlc all
# US -> ~3,000 (Polygon ref+snapshot) and HK -> ~500 (akshare turnover)
run "$PY" ingest/expand_universe.py
# bilingual Chinese names (china_search name_zh + akshare 名称)
run "$PY" ingest/enrich_zh.py
# fill OHLC for any name still missing one (expanded US via Polygon, HK/Canada via yfinance)
run "$PY" ingest/backfill_ohlc.py --market all
# pull macro dashboard intel bridge — ai_lean + freshness gate (#18 fix)
# runs AFTER the universe files are in place so intel covers the full symbol set
run "$PY" ingest/pull_macro_intel.py

NEW=$(count "$STAGE"); LIVEN=$(count "$LIVE")
MIN=$(( LIVEN * 80 / 100 )); [ "$MIN" -lt 1000 ] && MIN=1000
if [ "${NEW:-0}" -ge "$MIN" ]; then
  mv -f "$STAGE" "$LIVE"   # atomic rename — live flips to the full new universe in one step
  echo "[$(ts)] refresh OK: swapped in $NEW symbols (was $LIVEN)"
else
  echo "[$(ts)] GUARD: staged $NEW < min $MIN (live $LIVEN) — keeping live, discarding staging"
  rm -f "$STAGE"
fi
echo "[$(ts)] === terminal refresh done ==="
