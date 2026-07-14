#!/bin/bash
# nightly_fund.sh — durable, codex-independent nightly Terminal fundamentals refresh.
#
# ── TCC LAW (macOS launchd) ──────────────────────────────────────────────────
# launchd (Aqua session) jobs are DENIED open-for-read on ANYTHING under
# ~/Documents/: bash exec of a script there dies "Operation not permitted"
# (exit 126), and plain file reads / git-metadata reads fail the same way.
# Counterintuitively, exec of *binaries* and *writes* under ~/Documents/ are
# allowed — probed empirically 2026-07-06 on the Mac Studio. The same failure
# hit com.macro.thetadata-backfill and com.mastermind.liveflow before their
# relocations. Therefore this lane lives ENTIRELY outside ~/Documents/:
#
#   DEPLOY   /Users/chriswong/fund-ops-wt     standalone clone of
#                                             chriswong6031-creator/mastermind-terminal (master)
#                                             — this script + ingest/ code + terminal/public/data
#   ENGINE   /Users/chriswong/fund-engine-wt  standalone sparse+shallow clone of
#                                             chriswong6031-creator/macro (main), cone dirs:
#                                             engine lib config data/edgar data/finra
#                                             data/sec_insider data/stock_fundamentals
#                                             site/factordata
#                                             EDGAR parquets + factors.json + factor_betas.json
#                                             are git-TRACKED, so the nightly reset refreshes
#                                             code AND data together.
#   FUNDSRC  /Users/chriswong/fund-src        panels() stockdata output + yfinance us_fund
#                                             cache (passed to ingest via MACRO_ROOT)
#   PY       /Users/chriswong/fund-venv       dedicated venv (numpy/pandas/pyarrow/PyYAML/
#                                             yfinance/requests pinned to the Macro Dashboard
#                                             .venv versions that produced the last good run)
#
# RECREATE THE LANE (if any piece is missing):
#   git clone --filter=blob:none --depth 1 --single-branch --branch main --no-checkout \
#       https://github.com/chriswong6031-creator/macro.git /Users/chriswong/fund-engine-wt
#   cd /Users/chriswong/fund-engine-wt && git sparse-checkout init --cone && \
#       git sparse-checkout set engine lib config data/edgar data/finra data/sec_insider \
#       data/stock_fundamentals site/factordata && git checkout main
#   git clone https://github.com/chriswong6031-creator/mastermind-terminal.git /Users/chriswong/fund-ops-wt
#   /opt/homebrew/Caskroom/miniconda/base/bin/python -m venv /Users/chriswong/fund-venv
#   /Users/chriswong/fund-venv/bin/pip install "numpy==2.4.6" "pandas==3.0.3" \
#       "pyarrow==24.0.0" "PyYAML==6.0.3" "yfinance==1.4.1" "requests==2.34.2"
#   mkdir -p /Users/chriswong/fund-src   # caches rebuild themselves on first run
#
# Flow: self-update DEPLOY (exec-once) → refresh ENGINE clone → panels() EV stockdata →
# gentle yfinance collect (incremental, --stale-days 3) → gen_fund_us → rsync data-only
# to the VPS. Safety gates abort BEFORE any deploy if EV coverage collapses or AAPL EV
# is null (never ship bad data).
#
# Loaded via ~/Library/LaunchAgents/com.mastermind.fund.plist. Log: /tmp/mm_fund_refresh.log
set -u
ENGINE="/Users/chriswong/fund-engine-wt"
FUNDSRC="/Users/chriswong/fund-src"
DEPLOY="/Users/chriswong/fund-ops-wt"
PY="/Users/chriswong/fund-venv/bin/python"
KEY="$HOME/.ssh/macro_dashboard_deploy_v2"
VPS="root@146.190.142.17"; VPS_DATA="/opt/terminal/terminal/public/data"
LOG="/tmp/mm_fund_refresh.log"
DATA="$DEPLOY/terminal/public/data"
ts(){ date "+%Y-%m-%dT%H:%M:%S%z"; }

# -1. self-update the deploy clone, then exec the (possibly fresher) script exactly once.
#     exec re-reads the file whole, so an in-place update never corrupts a running bash.
if [ "${1:-}" != "--post-update" ]; then
  git -C "$DEPLOY" fetch origin master --quiet 2>>"$LOG" && git -C "$DEPLOY" reset --hard origin/master --quiet 2>>"$LOG" \
    || echo "[$(ts)] WARN: deploy self-update failed — using current code" >> "$LOG"
  exec /bin/bash "$DEPLOY/ops/nightly_fund.sh" --post-update
fi

echo "[$(ts)] ===== nightly fund refresh start =====" >> "$LOG"

# 0. keep the engine clone on latest main (EV code + tracked EDGAR/factors data).
git -C "$ENGINE" fetch --depth 1 origin main --quiet 2>>"$LOG" && git -C "$ENGINE" reset --hard origin/main --quiet 2>>"$LOG" \
  || echo "[$(ts)] WARN: engine git update failed — using current code" >> "$LOG"

# 1. refresh EV-bearing stockdata via panels() (SAFETY GATE: abort if EV coverage collapses).
"$PY" - <<PYEOF >> "$LOG" 2>&1
import os, sys, json
from pathlib import Path
os.chdir("$ENGINE"); sys.path.insert(0, "$ENGINE")
from engine.stock_fundamentals import panels
out = panels()
dest = Path("$FUNDSRC/site/stockdata"); dest.mkdir(parents=True, exist_ok=True)
for t, p in out.items():
    (dest / f"{t}.json").write_text(json.dumps(p))
ev = sum(1 for p in out.values()
         if (((p.get("valuation") or {}).get("ev_to_sales") or {}).get("v")) is not None)
print(f"panels: {len(out)} written, {ev} with EV")
assert ev > 500, f"EV coverage too low ({ev}) — aborting before deploy"
PYEOF
if [ $? -ne 0 ]; then echo "[$(ts)] ABORT: panels/EV step failed — no deploy" >> "$LOG"; exit 1; fi

# 2. gentle, incremental yfinance collect + gen (reads EV stockdata via MACRO_ROOT).
export MACRO_ROOT="$FUNDSRC"
"$PY" "$DEPLOY/ingest/collect_us_fund.py" --workers 2 --stale-days 3 --delay 2.0 5.0 >> "$LOG" 2>&1 \
  || echo "[$(ts)] WARN: collect had per-name errors (continuing)" >> "$LOG"
"$PY" "$DEPLOY/ingest/gen_fund_us.py" >> "$LOG" 2>&1 \
  || { echo "[$(ts)] ABORT: gen_fund_us failed — no deploy" >> "$LOG"; exit 1; }

# 3. SAFETY GATE: AAPL EV must be non-null post-gen, else do not deploy.
AEV=$("$PY" -c "import json;print(json.load(open('$DATA/AAPL.fund.json')).get('ratios',{}).get('current',{}).get('ev_sales'))" 2>/dev/null)
if [ "$AEV" = "None" ] || [ -z "$AEV" ]; then
  echo "[$(ts)] ABORT: AAPL ev_sales null post-gen — no deploy" >> "$LOG"; exit 1; fi

# 4. rsync data-only to the VPS (never touches the app).
ls "$DATA"/*.fund.json 2>/dev/null | xargs -n1 basename > /tmp/mm_fund_list.txt
N=$(wc -l < /tmp/mm_fund_list.txt | tr -d ' ')
rsync -az -e "ssh -i $KEY -o StrictHostKeyChecking=accept-new -o ConnectTimeout=25" \
  --files-from=/tmp/mm_fund_list.txt "$DATA/" "$VPS:$VPS_DATA/" >> "$LOG" 2>&1 \
  && echo "[$(ts)] rsync OK — $N fund.json (AAPL ev_sales=$AEV)" >> "$LOG" \
  || echo "[$(ts)] rsync FAILED" >> "$LOG"
echo "[$(ts)] ===== nightly fund refresh done =====" >> "$LOG"
