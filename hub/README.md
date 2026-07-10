# Mastermind Quote Hub

Localhost-only (127.0.0.1:3100) WebSocket fan-out + REST quote server for the
Mastermind Terminal. Serves crypto (Coinbase/OKX) and delayed-US (Polygon AM feed)
quotes to the Next.js frontend via loopback proxy.

## VPS deploy path

```
/opt/terminal/hub/          ← working directory
  hub.js                    ← entry point
  lib/
    anchor.js               ← session-keyed prevClose resolution (new 2026-07-09)
    coinbase.js
    okx.js
    polygon.js
    store.js
    log.js
  package.json
  node_modules/             ← npm ci after deploy; ws only dependency
```

Env vars come from `/opt/terminal/.env` (EnvironmentFile in the unit):

| Var | Required | Notes |
|---|---|---|
| `POLYGON_API_KEY` | yes (US feed) | delayed cluster key |
| `MANIFEST_PATH` | optional | default `/opt/terminal/terminal/public/data/manifest.json` |
| `HUB_DATA_DIR` | optional | directory of per-symbol `<SYM>.json` files; default = dirname(MANIFEST_PATH) |
| `HUB_PORT` | optional | default 3100 |
| `HUB_DISABLE_US` | optional | set to `1` to disable the Polygon US feed |
| `HUB_DISABLE_CRYPTO` | optional | set to `1` to disable Coinbase/OKX |

## systemd unit

```ini
# /etc/systemd/system/quote-hub.service
[Unit]
Description=Mastermind Quote Hub (crypto + delayed-US fan-out)
After=network-online.target
Wants=network-online.target

[Service]
WorkingDirectory=/opt/terminal/hub
EnvironmentFile=/opt/terminal/.env
ExecStart=/usr/bin/node hub.js
Restart=always
RestartSec=3
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadOnlyPaths=/opt/terminal/terminal/public/data
PrivateTmp=true
MemoryMax=256M

[Install]
WantedBy=multi-user.target
```

Deploy steps (executed by the orchestrator, never in this build stage):

```bash
# 1. rsync hub/ to VPS
rsync -av hub/ root@146.190.142.17:/opt/terminal/hub/

# 2. install deps on VPS
ssh root@146.190.142.17 "cd /opt/terminal/hub && npm ci --omit=dev"

# 3. reload and restart
ssh root@146.190.142.17 "systemctl daemon-reload && systemctl restart quote-hub"
```

## prevClose / chg fix (2026-07-09)

**Root cause:** `manifest.json` baseline is stale all day — the nightly pipeline takes 4+
hours and atomically swaps the manifest only at the very end (~03:00 UTC). Hub was
deriving `prevClose = manifestLast / (1 + manifestChg/100)`, which when the manifest is
from yesterday produces the close two days ago as the anchor.

**Fix:** `lib/anchor.js` — `AnchorCache` keyed by `(sym, ET-session-date)`.

Resolution order:
1. **Daily file** `/opt/terminal/terminal/public/data/<SYM>.json` — last completed bar
   whose date is before today-ET. During RTH this is yesterday's close. After the daily
   file rolls (post-close), the second-to-last bar is yesterday and the last bar is today's
   official close (surfaced as `close` + optionally `afterHours`).
2. **Polygon REST** `/v2/aggs/ticker/<SYM>/prev` — cheap, one call per sym per session,
   cached in the AnchorCache entry.
3. **Manifest fallback** — last resort, emits `stale_anchor: true` on the quote.

The cache key includes the ET session date, so a process alive across a midnight boundary
gets a cache miss on the new key and re-resolves fresh — no TTL guessing.

## After-hours semantics

When the official session close is known (daily file has rolled):

- `close` — official EOD close price
- `afterHours` — present only when the delayed AM print differs from `close` by >$0.01
- `chg` — always vs `prevClose` (yesterday's close), not vs the AH print

The UI should show `close` as the primary price with a CLOSED badge, and `afterHours` as
a secondary subtle "AH <price>" line when present.

## HTTP API

```
GET /health
→ { ok, port, quotes, manifest:{path,mtime,symbols}, anchorCache:{size,dataDir},
    cryptoPrimary, coinbase, okx, polygon, ts }

GET /quotes?syms=NVDA,AAPL,BTC-USD
→ { NVDA: { sym, last, chg, prevClose, close?, afterHours?, open, high, low, vol,
             ts, live, source, market, basis, anchor_source, stale_anchor? }, ... }
```

`anchor_source` is one of `"daily_file"`, `"polygon_prev"`, `"manifest"`, `"quote_partial"`.
`stale_anchor: true` means the anchor fell back to the manifest and may lag one session.
