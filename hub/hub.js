"use strict";
// Mastermind Quote Hub — localhost-only crypto + delayed-US fan-out.
//
// Contract §2: 127.0.0.1:3100 only, own systemd unit, auto-restart.
//   GET /health  → feed states + map size + manifest mtime
//   GET /quotes?syms=CSV → {SYM:{...quote…}} (present entries only)
// Never public; Next routes proxy it.
//
// Feeds v1:
//   (a) crypto: Coinbase exchange ws-feed (keyless) primary, OKX fallback (one writer at a time)
//   (b) US: wss://delayed.polygon.io/stocks AM.* dynamic per-symbol subs, LRU 500, chg vs session anchor
//
// prevClose fix (2026-07-09): the manifest baseline is stale all day (swaps at ~03:00 UTC).
// An AnchorCache keyed by (sym, ET-session-date) resolves prevClose from:
//   (a) per-symbol daily file (last completed bar), (b) Polygon REST /v2/aggs/prev,
//   (c) manifest fallback with stale_anchor:true. The key rolls on ET-date change so a
//   long-running process CANNOT serve yesterday's anchor — cache miss forces re-resolve.
//
// Env kill-switches read at boot: HUB_DISABLE_US=1 / HUB_DISABLE_CRYPTO=1.

const http = require("node:http");
const path = require("node:path");

const log = require("./lib/log");
const { Store } = require("./lib/store");
const { AnchorCache } = require("./lib/anchor");
const { Coinbase } = require("./lib/coinbase");
const { OKX } = require("./lib/okx");
const { Polygon } = require("./lib/polygon");

const HOST = "127.0.0.1";
const PORT = parseInt(process.env.HUB_PORT || "3100", 10);
const MANIFEST_PATH =
  process.env.MANIFEST_PATH ||
  "/opt/terminal/terminal/public/data/manifest.json";
// Per-symbol daily files live next to the manifest.
const DATA_DIR =
  process.env.HUB_DATA_DIR ||
  path.dirname(MANIFEST_PATH);

const DISABLE_US = process.env.HUB_DISABLE_US === "1";
const DISABLE_CRYPTO = process.env.HUB_DISABLE_CRYPTO === "1";

const MAX_SYMS_PER_REQUEST = 200;
const FAILOVER_MS = 60 * 1000; // Coinbase down/backoff > 60s → OKX
const RECOVERY_SUSTAIN_MS = 60 * 1000; // Coinbase clean ack held 60s → drop OKX

// ── Feed coordinator: exactly one crypto feed writes at a time ──
const coordinator = { cryptoPrimary: "coinbase" };

// ── Anchor cache: session-date–keyed prevClose resolution ──
// Must be created before Store so getManifest can reference store.manifest.
let store; // forward ref needed for getManifest closure
const anchorCache = new AnchorCache({
  dataDir: DATA_DIR,
  apiKey: process.env.POLYGON_API_KEY || process.env.MASSIVE_API_KEY || "",
  getManifest: () => store ? store.manifest : null,
});

store = new Store(MANIFEST_PATH, anchorCache);
store.loadManifestIfStale(true); // force initial load at boot

let coinbase = null;
let okx = null;
let polygon = null;

// classify() taxonomy mirrored from intradaySources.ts — only crypto & us are served here.
function classify(sym) {
  if (/\.(SS|SZ)$/i.test(sym)) return "cn";
  if (/\.HK$/i.test(sym)) return "hk";
  if (/\.TO$/i.test(sym)) return "ca";
  if (/-USD$/i.test(sym)) return "crypto";
  return "us";
}

// ── Crypto failover supervisor ──
// Watches Coinbase health; promotes OKX when Coinbase is unhealthy past FAILOVER_MS, demotes it
// once Coinbase sustains a clean subscription for RECOVERY_SUSTAIN_MS.
let coinbaseUnhealthySince = 0;
function superviseCrypto() {
  if (DISABLE_CRYPTO || !coinbase || !okx) return;
  const now = Date.now();
  const cbHealthy = coinbase.isHealthy();

  if (!cbHealthy) {
    if (coinbaseUnhealthySince === 0) coinbaseUnhealthySince = now;
    if (now - coinbaseUnhealthySince >= FAILOVER_MS && coordinator.cryptoPrimary !== "okx") {
      coordinator.cryptoPrimary = "okx";
      log.warn("crypto failover → OKX primary (coinbase unhealthy >60s)");
      okx.start();
    }
  } else {
    coinbaseUnhealthySince = 0;
    // Coinbase healthy: if OKX is primary, only hand back once Coinbase is sustained-clean.
    if (coordinator.cryptoPrimary === "okx" && coinbase.recoveredFor(RECOVERY_SUSTAIN_MS)) {
      coordinator.cryptoPrimary = "coinbase";
      log.info("crypto recovered → coinbase primary; stopping OKX");
      okx.stop();
    }
  }
}

// ── HTTP handlers ──
function sendJSON(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(body);
}

function handleHealth(res) {
  const ok =
    (DISABLE_CRYPTO || (coinbase && coinbase.isConnected()) || (okx && okx.isConnected())) &&
    (DISABLE_US || (polygon && polygon.isHealthy()));
  sendJSON(res, 200, {
    ok: !!ok,
    port: PORT,
    quotes: store.quotes.size,
    manifest: {
      path: MANIFEST_PATH,
      mtime: store.manifest.mtimeMs ? new Date(store.manifest.mtimeMs).toISOString() : null,
      symbols: store.manifest.syms.size,
    },
    anchorCache: {
      size: anchorCache._cache.size,
      dataDir: DATA_DIR,
    },
    cryptoPrimary: coordinator.cryptoPrimary,
    coinbase: coinbase ? coinbase.health() : { disabled: DISABLE_CRYPTO },
    okx: okx ? okx.health() : { disabled: DISABLE_CRYPTO },
    polygon: polygon ? polygon.health() : { disabled: DISABLE_US },
    ts: Math.floor(Date.now() / 1000),
  });
}

function handleQuotes(res, url) {
  const raw = url.searchParams.get("syms") || "";
  let syms = raw.split(",").map((s) => s.trim()).filter(Boolean);
  if (syms.length === 0) return sendJSON(res, 200, {});
  if (syms.length > MAX_SYMS_PER_REQUEST) syms = syms.slice(0, MAX_SYMS_PER_REQUEST);

  // Lazily refresh manifest (rate-limited internally).
  store.loadManifestIfStale(false);

  const now = Date.now();

  // Ensure US syms are subscribed so a first-time request seeds a placeholder + starts the AM sub.
  // Also kick off async anchor resolution so the next request has a cache hit.
  if (!DISABLE_US && polygon && polygon.isHealthy()) {
    for (const sym of syms) {
      if (classify(sym) === "us") {
        polygon.ensureSubscribed(sym);
        // Fire-and-forget: resolve anchor so the cache is warm for the next request.
        anchorCache.resolve(sym, now).catch(() => {});
      }
    }
  }

  // crypto → served from map; us → served from map (placeholder or AM); cn/hk/ca → absent.
  const wanted = syms.filter((s) => {
    const m = classify(s);
    return m === "crypto" || m === "us";
  });
  const out = store.getQuotes(wanted);
  sendJSON(res, 200, out);
}

const server = http.createServer((req, res) => {
  // DNS-rebind defense: only accept loopback Host headers.
  const host = (req.headers.host || "").toLowerCase();
  const hostOk =
    host === `127.0.0.1:${PORT}` ||
    host === `localhost:${PORT}` ||
    host === "127.0.0.1" ||
    host === "localhost";
  if (!hostOk) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("forbidden");
    return;
  }

  let url;
  try {
    url = new URL(req.url, `http://${HOST}:${PORT}`);
  } catch {
    return sendJSON(res, 400, { error: "bad url" });
  }

  if (req.method !== "GET") return sendJSON(res, 405, { error: "method not allowed" });

  try {
    if (url.pathname === "/health") return handleHealth(res);
    if (url.pathname === "/quotes") return handleQuotes(res, url);
    return sendJSON(res, 404, { error: "not found" });
  } catch (e) {
    log.error("request handler error", url.pathname, e && e.message);
    return sendJSON(res, 500, { error: "internal" });
  }
});

// ── Boot sequence ──
function boot() {
  log.info(
    "hub booting",
    `port=${PORT}`,
    `manifest=${MANIFEST_PATH}`,
    `dataDir=${DATA_DIR}`,
    `disableUS=${DISABLE_US}`,
    `disableCrypto=${DISABLE_CRYPTO}`
  );

  if (!DISABLE_CRYPTO) {
    coinbase = new Coinbase(store, coordinator);
    okx = new OKX(store, coordinator);
    coinbase.start(); // OKX stays dormant until the supervisor promotes it
  } else {
    log.warn("HUB_DISABLE_CRYPTO=1 — crypto feeds off");
  }

  if (!DISABLE_US) {
    const apiKey = process.env.POLYGON_API_KEY || process.env.MASSIVE_API_KEY || "";
    polygon = new Polygon(store, apiKey);
    polygon.start(); // authenticates; no subs until first /quotes request
  } else {
    log.warn("HUB_DISABLE_US=1 — US feed off");
  }

  server.listen(PORT, HOST, () => {
    log.info("hub READY", `listening on ${HOST}:${PORT}`);
  });

  server.on("error", (e) => {
    log.error("http server error", e && e.message);
    process.exit(1);
  });

  // Background intervals: prune stale entries + supervise crypto failover + prune anchor cache.
  setInterval(() => store.pruneIdle(Date.now()), 60 * 1000);
  setInterval(superviseCrypto, 5 * 1000);
  setInterval(() => anchorCache.prune(Date.now()), 60 * 60 * 1000); // prune stale session keys hourly
}

// Never let an unhandled error take down the loopback service silently.
process.on("uncaughtException", (e) => {
  log.error("uncaughtException", e && e.stack ? e.stack.split("\n")[0] : String(e));
});
process.on("unhandledRejection", (e) => {
  log.error("unhandledRejection", e && e.message ? e.message : String(e));
});

boot();

module.exports = { classify }; // exported for potential test harnesses
