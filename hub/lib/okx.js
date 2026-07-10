"use strict";
// OKX public ws — FALLBACK crypto feed. Only ONE crypto feed writes at a time (the coordinator's
// cryptoPrimary flag). Triggered when Coinbase is down / backoff exceeds FAILOVER_MS (60s) or on
// 3 consecutive Coinbase auth/sub errors. instId maps BTC-USD → BTC-USDT (USDT proxy; honest
// source label "okx"). chg derived from OKX open24h. Stops when Coinbase recovers (clean ack
// sustained ≥60s), handoff owned by the coordinator.

const WebSocket = require("ws");
const log = require("./log");

const URL = "wss://ws.okx.com:8443/ws/v5/public";
const PING_INTERVAL_MS = 20 * 1000;
const PONG_DEADLINE_MS = 10 * 1000;
const IDLE_WATCHDOG_MS = 30 * 1000;
const MAX_BACKOFF_MS = 30 * 1000;

// BTC-USD → BTC-USDT ; keep a reverse map so we can restamp product_id back to the -USD symbol.
function toInst(sym) {
  // sym is like BTC-USD ; OKX instId is BTC-USDT
  const base = sym.replace(/-USD$/i, "");
  return `${base}-USDT`;
}
function fromInst(instId) {
  const base = instId.replace(/-USDT$/i, "");
  return `${base}-USD`;
}

class OKX {
  constructor(store, feedCoordinator) {
    this.store = store;
    this.coord = feedCoordinator;
    this.ws = null;
    this.instIds = [];
    this.attempt = 0;
    this.stopped = true; // OKX starts stopped; coordinator turns it on for failover
    this.connected = false;
    this.lastMsgAt = 0;

    this.pingTimer = null;
    this.pongTimer = null;
    this.watchdogTimer = null;
    this.reconnectTimer = null;
  }

  _instIds() {
    const out = [];
    for (const sym of this.store.manifest.syms) {
      if (sym.endsWith("-USD")) out.push(toInst(sym));
    }
    return out;
  }

  start() {
    if (!this.stopped) return;
    this.stopped = false;
    log.warn("okx fallback ACTIVATED");
    this._connect();
  }

  stop() {
    if (this.stopped) return;
    this.stopped = true;
    log.info("okx fallback stopped");
    this._clearTimers();
    if (this.ws) { try { this.ws.terminate(); } catch {} this.ws = null; }
    this.connected = false;
  }

  isConnected() { return this.connected; }

  _clearTimers() {
    for (const t of [this.pingTimer, this.pongTimer, this.watchdogTimer, this.reconnectTimer]) {
      if (t) clearTimeout(t) || clearInterval(t);
    }
    this.pingTimer = this.pongTimer = this.watchdogTimer = this.reconnectTimer = null;
  }

  _backoffMs() {
    const base = Math.min(MAX_BACKOFF_MS, Math.pow(2, this.attempt) * 1000);
    const jitter = base * 0.2 * (Math.random() * 2 - 1);
    return Math.max(1000, Math.round(base + jitter));
  }

  _scheduleReconnect() {
    if (this.stopped || this.reconnectTimer) return;
    const wait = this._backoffMs();
    this.attempt++;
    log.every("okx-reconnect", "WARN", "okx reconnect in", `${wait}ms`, `attempt=${this.attempt}`);
    this.reconnectTimer = setTimeout(() => { this.reconnectTimer = null; this._connect(); }, wait);
  }

  _connect() {
    if (this.stopped) return;
    this._clearTimers();
    this.instIds = this._instIds();
    if (this.instIds.length === 0) { this._scheduleReconnect(); return; }

    let ws;
    try { ws = new WebSocket(URL); } catch (e) {
      log.error("okx ws construct failed", e.message); this._scheduleReconnect(); return;
    }
    this.ws = ws;
    this.connected = false;

    ws.on("open", () => {
      this.connected = true;
      this.attempt = 0;
      this.lastMsgAt = Date.now();
      log.info("okx connected", `insts=${this.instIds.length}`);
      log.resetEvery("okx-reconnect");
      this._subscribe();
      this._startHeartbeat();
      this._armWatchdog();
    });

    ws.on("message", (buf) => {
      this.lastMsgAt = Date.now();
      const s = buf.toString();
      if (s === "pong") { if (this.pongTimer) { clearTimeout(this.pongTimer); this.pongTimer = null; } return; }
      let msg; try { msg = JSON.parse(s); } catch { return; }
      this._onMessage(msg);
    });

    ws.on("error", (e) => log.every("okx-error", "WARN", "okx ws error", e && e.message));

    ws.on("close", (code) => {
      this.connected = false;
      this._clearTimers();
      log.every("okx-close", "WARN", "okx ws closed", `code=${code}`);
      this._scheduleReconnect();
    });
  }

  _subscribe() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const args = this.instIds.map((instId) => ({ channel: "tickers", instId }));
    try { this.ws.send(JSON.stringify({ op: "subscribe", args })); } catch (e) {
      log.warn("okx subscribe send failed", e.message);
    }
  }

  _onMessage(msg) {
    if (msg.event === "error") { log.warn("okx feed error", msg.msg || msg.code || ""); return; }
    if (!msg.data || !Array.isArray(msg.data)) return;
    if (this.coord && this.coord.cryptoPrimary !== "okx") return; // only primary writes

    for (const d of msg.data) {
      if (!d.instId) continue;
      const sym = fromInst(d.instId);
      const last = Number(d.last);
      if (!Number.isFinite(last)) continue;
      const open24h = Number(d.open24h);
      const prevClose = Number.isFinite(open24h) && open24h !== 0 ? open24h : null;
      this.store.setQuote(sym, {
        last,
        prevClose,
        open: Number.isFinite(open24h) ? open24h : null,
        high: Number.isFinite(Number(d.high24h)) ? Number(d.high24h) : null,
        low: Number.isFinite(Number(d.low24h)) ? Number(d.low24h) : null,
        vol: Number.isFinite(Number(d.vol24h)) ? Number(d.vol24h) : null,
        ts: d.ts ? Math.floor(Number(d.ts) / 1000) : Math.floor(Date.now() / 1000),
        live: true,
        source: "okx",
        market: "crypto",
        basis: "LIVE",
      });
    }
  }

  _startHeartbeat() {
    // OKX wants a literal "ping" text frame; server replies "pong".
    this.pingTimer = setInterval(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      try { this.ws.send("ping"); } catch {}
      if (this.pongTimer) clearTimeout(this.pongTimer);
      this.pongTimer = setTimeout(() => {
        log.warn("okx pong timeout — terminating");
        try { this.ws.terminate(); } catch {}
      }, PONG_DEADLINE_MS);
    }, PING_INTERVAL_MS);
  }

  _armWatchdog() {
    this.watchdogTimer = setInterval(() => {
      if (!this.connected) return;
      if (Date.now() - this.lastMsgAt > IDLE_WATCHDOG_MS) {
        log.warn("okx idle watchdog fired — terminating");
        try { this.ws.terminate(); } catch {}
      }
    }, IDLE_WATCHDOG_MS / 2);
  }

  health() {
    return {
      active: !this.stopped,
      connected: this.connected,
      insts: this.instIds.length,
      lastMsgAt: this.lastMsgAt ? new Date(this.lastMsgAt).toISOString() : null,
    };
  }
}

module.exports = { OKX };
