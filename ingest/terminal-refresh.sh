#!/usr/bin/env bash
# Nightly Mastermind Terminal universe + price refresh (VPS /usr/local/bin/terminal-data).
#
# Builds the FULL multi-market manifest into a STAGING file (TERMINAL_MANIFEST) and
# ATOMICALLY swaps it over the live manifest.json only at the very end — so the live
# universe is NEVER reduced mid-run. This lets build_polygon_universe run (fresh
# flagship-37 verdicts + slices) without its 37-symbol baseline ever reaching live.
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
# pull_macro_intel reads the macro dashboard stockdata dir. site/stockdata left git on
# 2026-07-01 (R2 migration), so the sparse checkout at /opt/macro no longer materialises
# it — the bridge now mirrors the public R2 bucket into this dir before reading (D7 fix
# 2026-07-04). Override via env var; default mirrors the VPS layout.
export MACRO_STOCKDATA="${MACRO_STOCKDATA:-/opt/macro/site/stockdata}"
PY=/opt/macro/.venv/bin/python
D=/opt/terminal/terminal/public/data
LIVE="$D/manifest.json"
STAGE="$D/manifest.staging.json"
export TERMINAL_MANIFEST="$STAGE"
ts(){ date -u "+%Y-%m-%d %H:%M:%S"; }
count(){ "$PY" -c "import json,sys;print(len(json.load(open(sys.argv[1]))['symbols']))" "$1" 2>/dev/null || echo 0; }

# ── flock: prevents concurrent fast_flagship runs from racing the nightly swap ──
# The open fd keeps /tmp/terminal-data.lock PRESENT for the entire run — this is the
# presence-signal that fast_flagship.py checks (§5: nightly hard-skip on file exists).
# Place AFTER ts() is defined so the lock-held log line can use it.
LOCKFILE=/tmp/terminal-data.lock
exec 9>"$LOCKFILE" || exit 1
flock -n 9 || { echo "[$(ts)] another terminal-data holds the lock — exit"; exit 0; }
trap 'rm -f "$LOCKFILE"' EXIT

echo "[$(ts)] === terminal refresh start (staging) ==="

rm -f "$STAGE"
run(){ echo "[$(ts)] -> $*"; "$@" || echo "[$(ts)] WARN: '$*' exited $?"; }
# flagship 37 -> staging manifest + fresh real-OHLC/slices/verdicts (OHLC/slices go to live dir)
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
# broad-universe confluence slices: every non-flagship symbol with OHLC gets a slim
# <SYM>.slice.json so the chart confluence indicator renders on it (flagship 37 keep
# their precise build_polygon_universe slices). Runs after all OHLC is in place.
run "$PY" ingest/gen_slices_all.py
# artifact freshness conformance (audit #9): consume the dashboard's exported manifest and
# WARN on any stale handoff artifact per its trading-calendar cadence (the per-symbol intel
# bridge below still abstains on individual stale files; this surfaces board/regime staleness).
run "$PY" -m ingest.artifact_conformance
# pull macro dashboard intel bridge — R2 stockdata sync + ai_lean + freshness gate.
# Runs AFTER the universe files are in place so intel covers the full symbol set.
run "$PY" ingest/pull_macro_intel.py
# pull macro dashboard market-risk state — one global market_risk.json for the header
# chip (top-down tape). Reads $MACRO_RISK_URL (the web-served risk_state.json) when set,
# else the local macro checkout. Display-only; a stale tape is flagged, never a sell.
run "$PY" ingest/pull_macro_risk.py

NEW=$(count "$STAGE"); LIVEN=$(count "$LIVE")
MIN=$(( LIVEN * 80 / 100 )); [ "$MIN" -lt 1000 ] && MIN=1000
if [ "${NEW:-0}" -ge "$MIN" ]; then
  mv -f "$STAGE" "$LIVE"   # atomic rename — live flips to the full new universe in one step
  echo "[$(ts)] refresh OK: swapped in $NEW symbols (was $LIVEN)"
  # gc_orphans: archive disk files whose symbol is no longer in the manifest.
  # DISABLED until the dry-run report matches the expected ~540 orphans (§0.10 / judge ruling).
  # Enable by un-commenting the line below after verifying: python ingest/gc_orphans.py --dry-run
  # run "$PY" ingest/gc_orphans.py
else
  echo "[$(ts)] GUARD: staged $NEW < min $MIN (live $LIVEN) — keeping live, discarding staging"
  rm -f "$STAGE"
fi
echo "[$(ts)] === terminal refresh done ==="
