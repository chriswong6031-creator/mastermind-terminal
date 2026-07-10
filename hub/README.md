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
| `ALPACA_API_KEY` | optional | Alpaca free plan key — enables overnight/ext ws feed |
| `ALPACA_API_SECRET` | optional | Alpaca free plan secret |
| `EXT_FEED_DISABLE` | optional | set to `1` to disable the entire ext-hours feed |

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

## Extended-hours feed (ext fields)

`lib/extfeed.js` adds extended/overnight trade data as a secondary block alongside the primary quote.

**Session windows (ET):**

| Window | Identifier | Coverage |
|---|---|---|
| Pre-market | `pre` | 04:00–09:30 ET |
| Regular trading hours | `rth` | 09:30–16:00 ET — ext fields suppressed |
| Post-market | `post` | 16:00–20:00 ET |
| Overnight | `overnight` | 20:00–04:00 ET (Blue Ocean ATS) |

**Feed selection (automatic):**

| Mode | Condition | Coverage |
|---|---|---|
| Alpaca overnight ws | `ALPACA_API_KEY` + `ALPACA_API_SECRET` set | All ext windows; true overnight via `v1beta1/overnight` feed (UNCONFIRMED — entitlement depends on Alpaca plan; contact Alpaca support to verify) |
| Yahoo unofficial fallback | No Alpaca keys (or Alpaca auth fails) | Pre-market + post-market only (04:00–09:30, 16:00–20:00 ET); no true overnight |

> **Note:** The 30-symbol free-plan websocket cap and overnight feed entitlement on Alpaca's
> Basic (free) plan are not confirmed in Alpaca's primary public documentation. Both may require
> a paid plan. If `ALPACA_API_KEY` / `ALPACA_API_SECRET` are set but auth returns 402/403, the
> hub automatically falls back to the keyless Yahoo leg for pre/post windows.

**Multi-user note:** The hub is a singleton. The 30-symbol LRU budget is shared across ALL users. A
`/quotes` request for symbol X from any user advances X to MRU. The oldest symbol is unsubscribed when
the cap is exceeded. This is intentional: the hub is a loopback fan-out, not a per-user socket pool.

**Ext fields on US quotes (outside RTH only):**

```
extPrice     number   — latest ext trade price
extChg       number|null — (extPrice − closeRef) / closeRef × 100; closeRef = officialClose when daily file has rolled, else prevClose (prior-session close); null only when neither is available
extTs        number   — Unix seconds of the ext bar
extSession   string   — 'pre' | 'post' | 'overnight'
extSource    string   — 'alpaca_overnight' | 'yahoo_unofficial'
```

These fields are absent (never emitted) during RTH. They are also stripped if the cached ext print ages past 90 minutes.

## HTTP API

```
GET /health
→ { ok, port, quotes, manifest:{path,mtime,symbols}, anchorCache:{size,dataDir},
    cryptoPrimary, coinbase, okx, polygon, extFeed, ts }

GET /quotes?syms=NVDA,AAPL,BTC-USD
→ { NVDA: { sym, last, chg, prevClose, close?, afterHours?, open, high, low, vol,
             ts, live, source, market, basis, anchor_source, stale_anchor?,
             extPrice?, extChg?, extTs?, extSession?, extSource? }, ... }
```

`anchor_source` is one of `"daily_file"`, `"polygon_prev"`, `"manifest"`, `"quote_partial"`.
`stale_anchor: true` means the anchor fell back to the manifest and may lag one session.

**Sample /quotes response with ext fields (AAPL, pre-market window):**

```json
{
  "AAPL": {
    "sym": "AAPL",
    "last": 316.22,
    "chg": 0.9,
    "prevClose": 313.39,
    "close": 316.22,
    "open": 310.5, "high": 316.53, "low": 308.16, "vol": 44882363,
    "ts": 1783627200,
    "live": false,
    "source": "polygon-delayed",
    "market": "us",
    "basis": "DELAYED_15M",
    "anchor_source": "daily_file",
    "extPrice": 314.5,
    "extChg": -0.5443,
    "extTs": 1783671300,
    "extSession": "pre",
    "extSource": "yahoo_unofficial"
  }
}
```
