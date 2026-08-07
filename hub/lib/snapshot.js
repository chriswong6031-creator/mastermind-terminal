"use strict";
// lib/snapshot.js — Polygon REST snapshot leg: today's session for symbols the
// streaming AM.* feed is not currently carrying.
//
// WHY THIS EXISTS (operator-reported 2026-08-07, SKY/Champion Homes):
//   The hub's only source of a current price was the Polygon `AM.*` WebSocket, and
//   subscriptions are idle-swept after 30 minutes (polygon.js) with the quote pruned
//   after 45 (store.js). Outside the flagship 37 — which fast_flagship re-demands every
//   5 minutes — that is the NORMAL state. With no live entry, polygon.js seeds a
//   placeholder from `manifest.last`, and the manifest is a NIGHTLY artifact: it carries
//   the PREVIOUS session's close all day. So a symbol you open after the close (or come
//   back to after 30 minutes) showed yesterday's close as if it were the quote —
//   SKY read 91.52 (2026-08-06) while the tape had closed at 94.66.
//
//   The same hole is what produced the flat "0.00%" during RTH: the placeholder's `last`
//   IS the daily file's last bar close, which is exactly what the AnchorCache resolves as
//   `prevClose`, so `(last - prevClose)` is a structural zero (see store.getQuotes).
//
//   Polygon's snapshot endpoint carries today's session on the plan we already hold:
//     day{o,h,l,c,v} + prevDay{c} + updated(ns)
//   which is the missing leg. `/v2/aggs/ticker/<SYM>/prev` can NOT serve this — it is
//   anchored to the previous session by definition and returns yesterday's bar.
//
// CONTRACT
//   demand(sym)      — queue a refresh (fire-and-forget, batched). Safe to call per request.
//   get(sym, nowMs)  — SYNCHRONOUS read for the quote-serve path; null when unusable.
//   stats()          — /health block.
//
// SAFETY
//   - No API key, or HUB_DISABLE_SNAPSHOT=1 → every method is an inert no-op and the
//     hub behaves exactly as it did before this file existed.
//   - `0 = MISSING` for an equity price (repo law): a zeroed `day` block — what Polygon
//     serves pre-open — is rejected, never published as a $0 print.
//   - A snapshot is only served for the CURRENT ET session date, derived from `updated`.
//     Yesterday's snapshot is never allowed to masquerade as today's.

const https = require("node:https");
const log = require("./log");
const { etDate } = require("./usSession");

// Per-symbol refresh interval. The delayed plan is 15 minutes behind, so polling faster
// buys nothing; 60s keeps a watchlist current without hammering the API.
const TTL_MS = 60 * 1000;
// Hard ceiling on serving a cached snapshot. If the REST leg dies, stop serving its data
// rather than pinning a stale session on every quote.
const MAX_AGE_MS = 30 * 60 * 1000;
// Polygon accepts a comma-separated ticker list; keep URLs well inside any length limit.
const CHUNK = 50;
// Coalescing window: one request cycle serves every symbol demanded by a single
// /quotes call (a 40-symbol watchlist becomes ONE upstream request, not 40).
const FLUSH_DELAY_MS = 120;

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

class SnapshotFeed {
  /**
   * @param {object} opts
   * @param {string} [opts.apiKey]
   * @param {boolean} [opts.disabled]
   * @param {number}  [opts.ttlMs]
   * @param {typeof httpGetJson} [opts.fetchJson] — injectable transport (tests)
   */
  constructor({ apiKey, disabled, ttlMs, fetchJson } = {}) {
    this.apiKey = apiKey || "";
    this.disabled = !!disabled || !this.apiKey;
    this.ttlMs = ttlMs != null ? ttlMs : TTL_MS;
    this._fetchJson = fetchJson || httpGetJson;

    /** @type {Map<string, {snap: object|null, ts: number}>} */
    this._cache = new Map();
    /** @type {Set<string>} */
    this._pending = new Set();
    this._timer = null;
    this._inflight = 0;
    this._errors = 0;
    this._lastOkAt = null;

    if (this.disabled) {
      log.info("snapshot feed disabled", apiKey ? "(HUB_DISABLE_SNAPSHOT)" : "(no API key)");
    }
  }

  /** Queue `sym` for refresh when its cached snapshot is missing or past its TTL. */
  demand(sym, nowMs) {
    if (this.disabled || !sym) return;
    const now = nowMs != null ? nowMs : Date.now();
    const hit = this._cache.get(sym);
    if (hit && now - hit.ts < this.ttlMs) return;
    this._pending.add(sym);
    if (this._timer) return;
    this._timer = setTimeout(() => {
      this._timer = null;
      this._flush().catch(() => {});
    }, FLUSH_DELAY_MS);
    if (this._timer.unref) this._timer.unref();
  }

  /**
   * Today's regular session for `sym`, or null.
   *
   * Null (→ caller keeps whatever it had) whenever the snapshot is absent, older than
   * MAX_AGE_MS, zeroed, or stamped with an ET date other than today's.
   *
   * @returns {{date:string, open:number|null, high:number|null, low:number|null,
   *            close:number, vol:number|null, prevClose:number|null, chg:number|null,
   *            ts:number}|null}
   */
  get(sym, nowMs) {
    if (this.disabled) return null;
    const hit = this._cache.get(sym);
    if (!hit || !hit.snap) return null;
    const now = nowMs != null ? nowMs : Date.now();
    if (now - hit.ts > MAX_AGE_MS) return null;
    // A snapshot from a previous session must never be served as the current one.
    if (hit.snap.date !== etDate(now)) return null;
    return hit.snap;
  }

  stats() {
    return {
      disabled: this.disabled,
      cacheSize: this._cache.size,
      pending: this._pending.size,
      inflight: this._inflight,
      errors: this._errors,
      lastOkAt: this._lastOkAt ? new Date(this._lastOkAt).toISOString() : null,
    };
  }

  // ── internal ──

  async _flush() {
    if (this.disabled || this._pending.size === 0) return;
    const syms = [...this._pending];
    this._pending.clear();

    for (let i = 0; i < syms.length; i += CHUNK) {
      const chunk = syms.slice(i, i + CHUNK);
      this._inflight++;
      try {
        const url =
          "https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers" +
          `?tickers=${chunk.map(encodeURIComponent).join(",")}&apiKey=${this.apiKey}`;
        const body = await this._fetchJson(url);
        const rows = (body && body.tickers) || [];
        const now = Date.now();
        const seen = new Set();
        for (const row of rows) {
          const sym = row && row.ticker;
          if (!sym) continue;
          seen.add(sym);
          this._cache.set(sym, { snap: parseSnapshot(row), ts: now });
        }
        // Cache the MISS too, so an unknown/unsupported ticker is not re-requested on
        // every 6s poll. get() returns null for a null snap exactly as for an absent one.
        for (const sym of chunk) {
          if (!seen.has(sym)) this._cache.set(sym, { snap: null, ts: now });
        }
        this._lastOkAt = now;
      } catch (e) {
        this._errors++;
        log.warn("snapshot fetch failed", chunk.length, "syms", (e && e.message) || e);
      } finally {
        this._inflight--;
      }
    }
  }
}

/**
 * Polygon snapshot row → our shape, or null when the row cannot be trusted.
 * Exported for unit tests; pure.
 */
function parseSnapshot(row) {
  if (!row || typeof row !== "object") return null;
  const day = row.day || {};
  const prev = row.prevDay || {};

  const close = num(day.c);
  // `0 = MISSING` for an equity price — Polygon zeroes the `day` block before the open.
  if (close == null || close <= 0) return null;

  // `updated` is nanoseconds since epoch. It is the only field that dates the snapshot,
  // and dating it is what stops yesterday's block being served as today's session.
  const updatedNs = num(row.updated);
  if (updatedNs == null || updatedNs <= 0) return null;
  const updatedMs = updatedNs / 1e6;

  const prevClose = num(prev.c);
  // ONE chg formula, matching store.setQuote — never Polygon's todaysChangePerc, so the
  // percentage can't drift from the one every other lane computes.
  const chg =
    prevClose != null && prevClose !== 0 ? ((close - prevClose) / prevClose) * 100 : null;

  const open = num(day.o);
  const high = num(day.h);
  const low = num(day.l);
  const vol = num(day.v);

  return {
    date: etDate(updatedMs),
    open: open != null && open > 0 ? open : null,
    high: high != null && high > 0 ? high : null,
    low: low != null && low > 0 ? low : null,
    close,
    vol,
    prevClose: prevClose != null && prevClose > 0 ? prevClose : null,
    chg,
    ts: Math.floor(updatedMs / 1000),
  };
}

function httpGetJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 8000 }, (res) => {
      let body = "";
      res.on("data", (c) => { body += c; });
      res.on("end", () => {
        try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("snapshot timeout")); });
  });
}

module.exports = { SnapshotFeed, parseSnapshot, TTL_MS, MAX_AGE_MS };
