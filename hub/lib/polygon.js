"use strict";
// Polygon US equities/ETF feed — delayed cluster by default, real-time when entitled.
//
// Verified live: auth_success then 'subscribed to: AM.AAPL' acks. AM = per-minute aggregate
// (delayed ~15 min on the delayed cluster). Contract §2: DYNAMIC per-symbol subs — subscribe on
// first request, LRU cap 500, unsubscribe after ~30 min idle. Day o/h/l/vol accumulated from AM;
// chg vs manifest prev-close.
//
// Cluster select: HUB_POLYGON_CLUSTER=live → wss://socket.polygon.io (basis LIVE). A key that
// is NOT real-time-entitled still gets auth_success there, then a status:"error" frame
// ("You don't have access real-time data…") — we demote to the delayed cluster for the rest of
// the process and reconnect, so a plan downgrade can never blank the US feed.
//
// AM message fields: ev=AM, sym, o, h, l, c, v, s(start ms), e(end ms).
// We key the day accumulator on the ET trading date (same formatter family as
// intradaySources.ts:etDisplay) so a UTC-midnight rollover doesn't reset the US day mid-session.
//
// NEVER logs the API key. auth_failed → mark unhealthy, US absent from /quotes (Next → manifest EOD),
// no crash.

const WebSocket = require("ws");
const log = require("./log");

const URL_LIVE = "wss://socket.polygon.io/stocks";
const URL_DELAYED = "wss://delayed.polygon.io/stocks";
const WANT_LIVE = process.env.HUB_POLYGON_CLUSTER === "live";
const LRU_CAP = 500;
const IDLE_UNSUB_MS = 30 * 60 * 1000; // 30 min
const SWEEP_INTERVAL_MS = 60 * 1000;
const MAX_BACKOFF_MS = 30 * 1000;
const MAX_PARAMS_PER_FRAME = 50; // batch subscribe/unsubscribe frames

// ET trading-date formatter (mirror of intradaySources.ts:etDisplay date components).
const ET_DATE_FMT = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric", month: "2-digit", day: "2-digit",
});
function etDate(ms) {
  const p = {};
  for (const part of ET_DATE_FMT.formatToParts(ms)) p[part.type] = part.value;
  return `${p.year}-${p.month}-${p.day}`;
}

class Polygon {
  constructor(store, apiKey) {
    this.store = store;
    this.apiKey = apiKey || "";
    // Effective cluster; starts from env, demoted (permanently for this process) on RT-denied.
    this.cluster = WANT_LIVE ? "live" : "delayed";
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
    try { ws = new WebSocket(this.cluster === "live" ? URL_LIVE : URL_DELAYED); } catch (e) {
      log.error("polygon ws construct failed", e.message); this._scheduleReconnect(); return;
    }
    this.ws = ws;
    this.authed = false;

    ws.on("open", () => {
      this.lastMsgAt = Date.now();
      log.info("polygon connected — authenticating", `cluster=${this.cluster}`);
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
      } else if (msg.status === "error" && this.cluster === "live" && /real.?time|not (?:authoriz|entitle)|access|subscri/i.test(msg.message || "")) {
        // RT entitlement denied arrives AFTER auth_success (not as auth_failed): demote to the
        // delayed cluster for the rest of the process and reconnect (close → _scheduleReconnect;
        // _replaySubs re-subscribes everything on the delayed socket). The match is deliberately
        // broad — free-text wording from a third party (Polygon → Massive rebrand in flight); a
        // false-positive demote only costs latency, a miss silently blanks the whole US feed.
        this.cluster = "delayed";
        log.error("polygon real-time denied — demoting to delayed cluster", msg.message || "");
        // Quotes already stamped LIVE must not linger overclaiming until their next AM bar.
        for (const q of this.store.quotes.values()) {
          if (q && q.source === "polygon-live") { q.source = "polygon-delayed"; q.basis = "DELAYED_15M"; q.live = false; }
        }
        try { this.ws.terminate(); } catch {}
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
    const endMs = Number(m.e) || Date.now();
    const date = etDate(endMs);

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

    const live = this.cluster === "live";
    this.store.setQuote(sym, {
      last: acc.last,
      open: acc.open,
      high: acc.high,
      low: acc.low,
      vol: acc.vol,
      ts: Math.floor(endMs / 1000),
      live,
      source: live ? "polygon-live" : "polygon-delayed",
      market: "us",
      basis: live ? "LIVE" : "DELAYED_15M",
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
    if (existing && String(existing.source || "").startsWith("polygon-") && existing.last != null) return;
    // Seed last = MANIFEST last (EOD close). setQuote derives prevClose from prevCloseBySym and
    // recomputes chg — reproducing the manifest's day-change (not a flat 0) until the first AM
    // bar lands, at which point the real delayed price/chg take over. Off-hours the header thus
    // keeps showing the session's ±% exactly like the pre-hub EOD fallback did.
    const manifestLast = this.store.manifest.lastBySym.get(sym);
    if (manifestLast == null) return;
    // Placeholder is EOD-derived, so it always carries the delayed labels even on the live
    // cluster — the first real AM bar upgrades it to LIVE; off-hours it never overclaims.
    this.store.setQuote(sym, {
      last: manifestLast,
      ts: Math.floor(Date.now() / 1000),
      live: false,
      source: "polygon-delayed",
      market: "us",
      basis: "DELAYED_15M",
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
      cluster: this.cluster,
      wantLive: WANT_LIVE,
      subs: this.subs.size,
      lruCap: LRU_CAP,
      lastMsgAt: this.lastMsgAt ? new Date(this.lastMsgAt).toISOString() : null,
      attempt: this.attempt,
    };
  }
}

module.exports = { Polygon, etDate };
