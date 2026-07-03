#!/usr/bin/env bash
# One-command China + Hong Kong deep-data refresh for the Terminal intel panel.
#
# Runs on the Mac (needs the Macro Dashboard venv + TUSHARE_TOKEN in its .env, and the
# nightly-built site data at Macro Dashboard/site/{chinastockdata,hkstockdata}). It:
#   1. collects the deep Tushare/akshare parquets (financials, holders, 龙虎榜/block, HK deep)
#   2. rebuilds every CN/HK <SYM>.intel.json via the bridge
#   3. rsyncs the intel to the production VPS (content updates serve per-request — no restart)
#
# Usage:
#   ingest/refresh_cn_hk.sh                 # normal daily refresh (data content only)
#   ingest/refresh_cn_hk.sh --force-hk      # also re-fetch cached HK names (schema change / full)
#   ingest/refresh_cn_hk.sh --deploy        # + rebuild & restart the VPS (needed only if NEW symbols appeared)
#   ingest/refresh_cn_hk.sh --skip-collect  # rebuild intel from existing parquets + rsync (fast, no API)
#
# The upstream site data (Macro Dashboard site/*stockdata) is produced by the Macro Dashboard's
# own build — run that first if you want fresh decision/conviction for the engine-covered names.
set -uo pipefail

CA="/Users/chriswong/Documents/Cluade/charting-app"
MACRO="/Users/chriswong/Documents/Cluade/Macro Dashboard"
PY="$MACRO/.venv/bin/python"
KEY="$HOME/.ssh/macro_dashboard_deploy_v2"
VPS="root@146.190.142.17"
DATA="$CA/terminal/public/data"
ts() { date -u "+%Y-%m-%d %H:%M:%S"; }

FORCE_HK=""; DEPLOY=0; SKIP_COLLECT=0
for a in "$@"; do
  case "$a" in
    --force-hk) FORCE_HK="--force" ;;
    --deploy) DEPLOY=1 ;;
    --skip-collect) SKIP_COLLECT=1 ;;
    *) echo "unknown flag: $a"; exit 2 ;;
  esac
done

cd "$MACRO" || { echo "no Macro Dashboard dir"; exit 1; }
set -a; [ -f "$MACRO/.env" ] && . "$MACRO/.env"; set +a
if [ -z "${TUSHARE_TOKEN:-}" ]; then echo "[$(ts)] ERROR: TUSHARE_TOKEN missing in $MACRO/.env"; exit 1; fi

if [ "$SKIP_COLLECT" = "0" ]; then
  echo "[$(ts)] === CN deep collectors (fina_indicator/income + 龙虎榜/大宗 + top-holders) ==="
  "$PY" "$CA/ingest/collect_cn_deep.py" || echo "[$(ts)] WARN: collect_cn_deep exited $?"
  echo "[$(ts)] === HK deep collector (financials/analyst/profile/valuation) ==="
  "$PY" "$CA/ingest/collect_hk_deep.py" $FORCE_HK --workers 8 || echo "[$(ts)] WARN: collect_hk_deep exited $?"
fi

echo "[$(ts)] === rebuild CN/HK intel ==="
"$PY" "$CA/ingest/pull_cn_hk_intel.py" || { echo "[$(ts)] ERROR: bridge failed"; exit 1; }

echo "[$(ts)] === rsync CN/HK intel → VPS ==="
cd "$DATA" || exit 1
ls *.SS.intel.json *.SZ.intel.json *.HK.intel.json 2>/dev/null > /tmp/cnhk_intel_list.txt
N=$(wc -l < /tmp/cnhk_intel_list.txt | tr -d ' ')
rsync -az --files-from=/tmp/cnhk_intel_list.txt -e "ssh -i $KEY" ./ "$VPS:/opt/terminal/terminal/public/data/" \
  && echo "[$(ts)] rsync'd $N intel files"

if [ "$DEPLOY" = "1" ]; then
  echo "[$(ts)] === rebuild + restart terminal (picks up NEW symbol files) ==="
  ssh -i "$KEY" "$VPS" 'cd /opt/terminal/terminal && rm -rf .next && npm run build >/tmp/refresh-build.log 2>&1 && systemctl restart terminal && sleep 3 && systemctl is-active terminal' \
    && echo "[$(ts)] deployed"
else
  echo "[$(ts)] content updates serve per-request (no restart needed). Use --deploy only when NEW symbols were added."
fi
echo "[$(ts)] === refresh complete ($N intel files) ==="
