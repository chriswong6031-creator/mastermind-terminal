"use strict";
// Polygon delayed US equities/ETF feed (wss://delayed.polygon.io/stocks).
//
// Verified live: auth_success then 'subscribed to: AM.AAPL' acks. AM = per-minute aggregate
// (delayed ~15 min). Contract §2: DYNAMIC per-symbol subs — subscribe on first request, LRU cap
// 500, unsubscribe after ~30 min idle. Day o/h/l/vol accumulated from AM; chg vs manifest prev-close.
//
// AM message fields (delayed cluster): ev=AM, sym, o, h, l, c, v, s(start ms), e(end ms).
// We key the day accumulator on the ET trading date (same formatter family as
// intradaySources.ts:etDisplay) so a UTC-midnight rollover doesn't reset the US day mid-session.
//
// NEVER logs the API key. auth_failed → mark unhealthy, US absent from /quotes (Next → manifest EOD),
// no crash.

const WebSocket = require("ws");
const log = require("./log");
const { classifySession, etDate } = require("./usSession");

const URL = "wss://delayed.polygon.io/stocks";
const LRU_CAP = 500;
const IDLE_UNSUB_MS = 30 * 60 * 1000; // 30 min
const SWEEP_INTERVAL_MS = 60 * 1000;
const MAX_BACKOFF_MS = 30 * 1000;
const MAX_PARAMS_PER_FRAME = 50; // batch subscribe/unsubscribe frames

class Polygon {
  constructor(store, apiKey, extFeed) {
    this.store = store;
    this.apiKey = apiKey || "";
    this.extFeed = extFeed || null;
    this.ws = null;
    this.authed = false;
    this.authFailed = false;
    this.attempt = 0;
    this.stopped = false;

    /** @type {Map<string,{lastReq:number, subscribedAt:number}>} insertion-ordered = LRU */
    this.subs = new Map();
    /** @type {Map<string,{date:string, open:number, high:number, low:number, vol:number, last:number}>} */
    this.dayAcc = new Map();

    this.reconnectTimer = null;
    this.sweepTimer = null;
    this.lastMsgAt = 0;
  }

  start() {
    this.stopped = false;
    this._connect();
    this.sweepTimer = setInterval(() => this._sweepIdle(), SWEEP_INTERVAL_MS);
  }

  stop() {
    this.stopped = true;
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    if (this.sweepTimer) { clearInterval(this.sweepTimer); this.sweepTimer = null; }
    if (this.ws) { try { this.ws.terminate(); } catch {} this.ws = null; }
    this.authed = false;
  }

  isAuthed() { return this.authed; }
  isHealthy() { return this.authed && !this.authFailed; }

  _backoffMs() {
    const base = Math.min(MAX_BACKOFF_MS, Math.pow(2, this.attempt) * 1000);
    const jitter = base * 0.2 * (Math.random() * 2 - 1);
    return Math.max(1000, Math.round(base + jitter));
  }

  _scheduleReconnect() {
    if (this.stopped || this.reconnectTimer) return;
    const wait = this._backoffMs();
    this.attempt++;
    log.every("polygon-reconnect", "WARN", "polygon reconnect in", `${wait}ms`, `attempt=${this.attempt}`);
    this.reconnectTimer = setTimeout(() => { this.reconnectTimer = null; this._connect(); }, wait);
  }

  _connect() {
    if (this.stopped) return;
    if (!this.apiKey) {
      log.error("polygon: POLYGON_API_KEY missing — US feed disabled");
      this.authFailed = true;
      return;
    }
    let ws;
    try { ws = new WebSocket(URL); } catch (e) {
      log.error("polygon ws construct failed", e.message); this._scheduleReconnect(); return;
    }
    this.ws = ws;
    this.authed = false;

    ws.on("open", () => {
      this.lastMsgAt = Date.now();
      log.info("polygon connected — authenticating");
      // NEVER let the key reach the logger: pass it only into the frame.
      try { ws.send(JSON.stringify({ action: "auth", params: this.apiKey })); } catch (e) {
        log.error("polygon auth send failed", e.message);
      }
    });

    ws.on("message", (buf) => {
      this.lastMsgAt = Date.now();
      let arr;
      try { arr = JSON.parse(buf.toString()); } catch { return; }
      if (!Array.isArray(arr)) arr = [arr];
      for (const msg of arr) this._onMessage(msg);
    });

    ws.on("error", (e) => log.every("polygon-error", "WARN", "polygon ws error", e && e.message));

    ws.on("close", (code) => {
      this.authed = false;
      log.every("polygon-close", "WARN", "polygon ws closed", `code=${code}`);
      this._scheduleReconnect();
    });
  }

  _onMessage(msg) {
    if (!msg) return;
    if (msg.ev === "status") {
      if (msg.status === "auth_success") {
        this.authed = true;
        this.authFailed = false;
        this.attempt = 0;
        log.info("polygon auth_success — replaying subs", `n=${this.subs.size}`);
        log.resetEvery("polygon-reconnect");
        this._replaySubs();
      } else if (msg.status === "auth_failed") {
        this.authFailed = true;
        this.authed = false;
        log.error("polygon auth_failed — US feed unhealthy (manifest EOD fallback)", msg.message || "");
      } else if (msg.status === "connected") {
        // handshake ack; wait for auth
      }
      // 'success' acks for subscribe/unsubscribe are informational; do not log the key (none present).
      return;
    }
    if (msg.ev === "AM") this._onAM(msg);
  }

  _onAM(m) {
    const sym = m.sym;
    if (!sym) return;
    const c = Number(m.c);
    if (!Number.isFinite(c)) return;
    const o = Number(m.o), h = Number(m.h), l = Number(m.l), v = Number(m.v);
    const startMs = Number(m.s) || Number(m.e) || Date.now();
    const endMs = Number(m.e) || Date.now();
    const session = classifySession(startMs);

    // Polygon's AM stream includes pre/post-market aggregates. Those prints are
    // a separate quote lane: they must never mutate regular LAST/OHLC/volume or
    // the daily candle. Feed them into ExtFeed as a delayed fallback instead.
    if (session !== "rth") {
      if (this.extFeed) {
        this.extFeed.ingest(sym, {
          price: c,
          ts: Math.floor(endMs / 1000),
          session,
          source: "polygon-delayed",
          basis: "DELAYED_15M",
        });
      }
      return;
    }

    const date = etDate(startMs);

    let acc = this.dayAcc.get(sym);
    if (!acc || acc.date !== date) {
      // ET-date rollover (or first AM of the day) → reset accumulator.
      acc = {
        date,
        open: Number.isFinite(o) ? o : c,
        high: Number.isFinite(h) ? h : c,
        low: Number.isFinite(l) ? l : c,
        vol: Number.isFinite(v) ? v : 0,
        last: c,
      };
    } else {
      if (Number.isFinite(h)) acc.high = Math.max(acc.high, h);
      if (Number.isFinite(l)) acc.low = Math.min(acc.low, l);
      if (Number.isFinite(v)) acc.vol += v;
      acc.last = c;
    }
    this.dayAcc.set(sym, acc);

    this.store.setQuote(sym, {
      last: acc.last,
      open: acc.open,
      high: acc.high,
      low: acc.low,
      vol: acc.vol,
      ts: Math.floor(endMs / 1000),
      live: false,
      source: "polygon-delayed",
      market: "us",
      basis: "DELAYED_15M",
      regularSessionDate: date,
      regularSession: "rth",
    });
  }

  // Ensure a symbol is subscribed; write a manifest-derived placeholder immediately so /quotes
  // never flashes empty in the ≤15-min pre-first-AM window.
  ensureSubscribed(sym) {
    const now = Date.now();
    const existing = this.subs.get(sym);
    if (existing) {
      existing.lastReq = now;
      // Re-insert to move to MRU end of insertion order.
      this.subs.delete(sym);
      this.subs.set(sym, existing);
      return;
    }

    // LRU-evict the least-recently-requested if at cap.
    while (this.subs.size >= LRU_CAP) {
      const oldestKey = this.subs.keys().next().value;
      if (oldestKey === undefined) break;
      this.subs.delete(oldestKey);
      this.store.markSubscribed(oldestKey, false);
      this._send({ action: "unsubscribe", params: `AM.${oldestKey}` });
      log.info("polygon LRU-evicted", oldestKey);
    }

    this.subs.set(sym, { lastReq: now, subscribedAt: now });
    this.store.markSubscribed(sym, true);
    this._writePlaceholder(sym);
    this._send({ action: "subscribe", params: `AM.${sym}` });
  }

  _writePlaceholder(sym) {
    // Only if we have no live entry yet: seed from the manifest so the header shows something.
    const existing = this.store.quotes.get(sym);
    if (existing && existing.source === "polygon-delayed" && existing.last != null) return;
    // Seed last = MANIFEST last (EOD close). setQuote derives prevClose from prevCloseBySym and
    // recomputes chg — reproducing the manifest's day-change (not a flat 0) until the first AM
    // bar lands, at which point the real delayed price/chg take over. Off-hours the header thus
    // keeps showing the session's ±% exactly like the pre-hub EOD fallback did.
    const manifestLast = this.store.manifest.lastBySym.get(sym);
    if (manifestLast == null) return;
    this.store.setQuote(sym, {
      last: manifestLast,
      ts: Math.floor(Date.now() / 1000),
      live: false,
      source: "polygon-delayed",
      market: "us",
      basis: "DELAYED_15M",
      regularSession: "closed",
    });
  }

  _replaySubs() {
    // Batch resubscribe on (re)auth, ≤50 params per frame.
    const syms = [...this.subs.keys()];
    for (let i = 0; i < syms.length; i += MAX_PARAMS_PER_FRAME) {
      const chunk = syms.slice(i, i + MAX_PARAMS_PER_FRAME);
      const params = chunk.map((s) => `AM.${s}`).join(",");
      this._send({ action: "subscribe", params });
    }
  }

  _sweepIdle() {
    const now = Date.now();
    const toUnsub = [];
    for (const [sym, meta] of this.subs) {
      if (now - meta.lastReq > IDLE_UNSUB_MS) toUnsub.push(sym);
    }
    for (let i = 0; i < toUnsub.length; i += MAX_PARAMS_PER_FRAME) {
      const chunk = toUnsub.slice(i, i + MAX_PARAMS_PER_FRAME);
      for (const s of chunk) { this.subs.delete(s); this.store.markSubscribed(s, false); }
      this._send({ action: "unsubscribe", params: chunk.map((s) => `AM.${s}`).join(",") });
    }
    if (toUnsub.length) log.info("polygon idle-swept", toUnsub.length, "subs (>30m idle)");
  }

  _send(frame) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.authed) return;
    try { this.ws.send(JSON.stringify(frame)); } catch (e) {
      log.warn("polygon send failed", e.message);
    }
  }

  health() {
    return {
      authed: this.authed,
      authFailed: this.authFailed,
      subs: this.subs.size,
      lruCap: LRU_CAP,
      lastMsgAt: this.lastMsgAt ? new Date(this.lastMsgAt).toISOString() : null,
      attempt: this.attempt,
    };
  }
}

module.exports = { Polygon, etDate };
