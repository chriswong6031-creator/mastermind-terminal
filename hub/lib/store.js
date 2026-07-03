"use strict";
// Central quote store + manifest-derived prev-close map.
//
// Contract §1 quote shape:
//   { sym, last, chg, prevClose?, open?, high?, low?, vol?, amount?, ts, live, source, market, basis }
//
// The manifest has NO prevClose field (verified against build_polygon_universe). We derive it:
//   US:     prevClose = manifestLast / (1 + manifestChg/100);  chg = (hubLast-prevClose)/prevClose*100
//   crypto: prevClose = open_24h (carried on the quote, not the manifest); chg vs open_24h
//
// AM/ticker messages that carry only o/h/l/c/v must NOT clobber source/basis/market set at
// subscribe time — setQuote merges partials.

const fs = require("fs");
const log = require("./log");

const STALE_EVICT_MS = 45 * 60 * 1000; // 45 min
const MANIFEST_CHECK_MIN_INTERVAL = 30 * 1000; // ≤1 stat/reparse per 30 s

class Store {
  constructor(manifestPath) {
    this.manifestPath = manifestPath;
    /** @type {Map<string, object>} SYM → quote object */
    this.quotes = new Map();
    this.manifest = {
      mtimeMs: 0,
      /** @type {Map<string, number>} SYM → derived prev-close */
      prevCloseBySym: new Map(),
      /** @type {Map<string, number>} SYM → manifest last (EOD close) */
      lastBySym: new Map(),
      /** @type {Set<string>} */
      syms: new Set(),
    };
    this.lastManifestCheck = 0;
    // Symbols currently held by a live subscription (crypto product list / polygon subs).
    // pruneIdle never evicts a subscribed symbol. Feeds register/unregister via markSubscribed.
    this.subscribed = new Set();
  }

  markSubscribed(sym, on) {
    if (on) this.subscribed.add(sym);
    else this.subscribed.delete(sym);
  }

  // Merge a partial quote into the existing entry. Never lets an AM-only payload
  // (o/h/l/c/v) erase source/basis/market. Stamps ts if absent, recomputes chg.
  setQuote(sym, partial) {
    const prev = this.quotes.get(sym) || { sym };
    const q = { ...prev, ...partial, sym };
    if (q.ts == null) q.ts = Math.floor(Date.now() / 1000);

    // Recompute chg from the best available prevClose.
    // Crypto carries its own prevClose (open_24h) on the partial. US derives from manifest.
    let prevClose = q.prevClose;
    if (prevClose == null) {
      const derived = this.manifest.prevCloseBySym.get(sym);
      if (derived != null) prevClose = derived;
    }
    if (prevClose != null && prevClose !== 0 && q.last != null) {
      q.prevClose = prevClose;
      q.chg = ((q.last - prevClose) / prevClose) * 100;
    } else if (q.chg == null) {
      q.chg = null;
    }

    this.quotes.set(sym, q);
    return q;
  }

  // Present entries only; missing syms are simply absent from the result.
  getQuotes(symList) {
    const out = {};
    for (const sym of symList) {
      const q = this.quotes.get(sym);
      if (q) out[sym] = q;
    }
    return out;
  }

  // Stat the manifest; on mtime change reparse and rebuild prevCloseBySym + syms.
  // Rate-limited to ≤1 stat per 30 s. Corrupt manifest → keep last-good, never throw.
  loadManifestIfStale(force) {
    const now = Date.now();
    if (!force && now - this.lastManifestCheck < MANIFEST_CHECK_MIN_INTERVAL) return;
    this.lastManifestCheck = now;

    let st;
    try {
      st = fs.statSync(this.manifestPath);
    } catch (e) {
      log.warn("manifest stat failed", this.manifestPath, e.message);
      return;
    }
    if (st.mtimeMs === this.manifest.mtimeMs) return;

    let raw;
    try {
      raw = fs.readFileSync(this.manifestPath, "utf8");
    } catch (e) {
      log.warn("manifest read failed", e.message);
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      log.warn("manifest parse failed — keeping last-good map", e.message);
      return;
    }

    const symsObj = parsed && parsed.symbols;
    if (!symsObj || typeof symsObj !== "object") {
      log.warn("manifest missing symbols object — keeping last-good map");
      return;
    }

    const prevCloseBySym = new Map();
    const lastBySym = new Map();
    const syms = new Set();
    for (const sym of Object.keys(symsObj)) {
      syms.add(sym);
      const row = symsObj[sym];
      if (!row || typeof row !== "object") continue;
      const last = typeof row.last === "number" ? row.last : null;
      const chg = typeof row.chg === "number" ? row.chg : null;
      if (last == null) continue;
      lastBySym.set(sym, last);
      // US derivation: prevClose = last / (1 + chg/100).
      // Guard null chg or chg ≈ -100 (denominator ≈ 0) → prevClose = last (chg falls out as 0).
      if (chg == null || Math.abs(1 + chg / 100) < 1e-6) {
        prevCloseBySym.set(sym, last);
      } else {
        prevCloseBySym.set(sym, last / (1 + chg / 100));
      }
    }

    this.manifest = { mtimeMs: st.mtimeMs, prevCloseBySym, lastBySym, syms };
    log.info("manifest reloaded", `symbols=${syms.size}`, `mtime=${new Date(st.mtimeMs).toISOString()}`);
  }

  // Evict entries older than STALE_EVICT_MS that are NOT currently subscribed.
  pruneIdle(now) {
    const cutoff = Math.floor((now - STALE_EVICT_MS) / 1000);
    let evicted = 0;
    for (const [sym, q] of this.quotes) {
      if (this.subscribed.has(sym)) continue;
      if (typeof q.ts === "number" && q.ts < cutoff) {
        this.quotes.delete(sym);
        evicted++;
      }
    }
    if (evicted) log.info("pruneIdle evicted", evicted, "stale entries");
    return evicted;
  }
}

module.exports = { Store, STALE_EVICT_MS };
