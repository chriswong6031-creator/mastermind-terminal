#!/usr/bin/env bash
# Daily Polygon refresh — rebuilds terminal/public/data/*.json + manifest.json
# (OHLC + per-symbol confluence backtest + Golden-Oracle verdicts).
#
# Cron (weekdays ~18:10 ET, after the US close):
#   10 18 * * 1-5  /Users/chriswong/Documents/Cluade/charting-app/ingest/refresh.sh >> /tmp/mm_refresh.log 2>&1
#
# Pass symbols to refresh a subset, else the full universe.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a
PY="${MACRO_VENV:-/Users/chriswong/Documents/Cluade/Macro Dashboard/.venv/bin/python}"
echo "[refresh] $(date) — rebuilding Polygon universe…"
"$PY" ingest/build_polygon_universe.py "$@"
# artifact freshness conformance (audit #9): consume the dashboard's exported manifest and
# WARN on any stale handoff artifact per its trading-calendar cadence. Non-fatal here (the
# per-symbol intel bridge already abstains on stale files); exit 2 only surfaces staleness.
echo "[refresh] $(date) — artifact freshness conformance…"
"$PY" -m ingest.artifact_conformance || echo "[refresh] WARN: stale macro artifacts (see above)"
echo "[refresh] $(date) — pulling macro intel bridge…"
"$PY" ingest/pull_macro_intel.py "$@"
echo "[refresh] done."
