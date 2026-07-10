"use strict";
// Central quote store + manifest-derived prev-close map.
//
// Contract §1 quote shape:
//   { sym, last, chg, prevClose?, close?, afterHours?, open?, high?, low?, vol?,
//     amount?, ts, live, source, market, basis, anchor_source?, stale_anchor? }
//
// prevClose derivation (session-keyed, not manifest-derived):
//   US:     prevClose comes from AnchorCache — daily file → Polygon REST → manifest fallback.
//           chg = (hubLast - prevClose) / prevClose * 100.
//   crypto: prevClose = open_24h (carried on the quote, not the manifest); chg vs open_24h.
//
// After-hours semantics:
//   When the daily file has already rolled for today (post-close), setQuote receives the
//   AM-feed's delayed `last` as the live print. The anchor carries `close` (official EOD).
//   If the live print differs from close by >$0.01, we emit `afterHours` = live print.
//   The UI uses `close` as the primary display and `afterHours` as the secondary AH line.
//
// AM/ticker messages that carry only o/h/l/c/v must NOT clobber source/basis/market set at
// subscribe time — setQuote merges partials.

const fs = require("fs");
const log = require("./log");

const STALE_EVICT_MS = 45 * 60 * 1000; // 45 min
const MANIFEST_CHECK_MIN_INTERVAL = 30 * 1000; // ≤1 stat/reparse per 30 s
// Minimum $ difference between a delayed AH print and official close to emit afterHours.
const AH_MATERIALITY_THRESHOLD = 0.01;

class Store {
  /**
   * @param {string} manifestPath
   * @param {import('./anchor').AnchorCache} [anchorCache]
   */
  constructor(manifestPath, anchorCache) {
    this.manifestPath = manifestPath;
    this.anchorCache = anchorCache || null;
    /** @type {Map<string, object>} SYM → quote object */
    this.quotes = new Map();
    this.manifest = {
      mtimeMs: 0,
      /** @type {Map<string, number>} SYM → derived prev-close (manifest-derived, legacy) */
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
  //
  // When anchorCache is attached, prevClose comes from the session-keyed anchor (not the
  // manifest). The anchor also contributes close/afterHours for post-close sessions.
  setQuote(sym, partial, nowMs) {
    const now = nowMs != null ? nowMs : Date.now();
    const prev = this.quotes.get(sym) || { sym };
    const q = { ...prev, ...partial, sym };
    if (q.ts == null) q.ts = Math.floor(now / 1000);

    // ── prevClose resolution ──
    // Priority: (1) AnchorCache session-keyed entry, (2) partial carries its own prevClose
    // (crypto open_24h path), (3) manifest-derived legacy fallback.
    let prevClose = null;
    let anchorSource = null;
    let staleAnchor = false;

    if (this.anchorCache && q.market === "us") {
      const anchor = this.anchorCache.get(sym, now);
      if (anchor && anchor.prevClose != null) {
        prevClose = anchor.prevClose;
        anchorSource = anchor.anchor_source || "daily_file";
        staleAnchor = !!anchor.stale_anchor;

        // After-hours: anchor carries official close when today's daily bar is present.
        if (anchor.close != null) {
          q.close = anchor.close;
          // Overlay afterHours from the live AM print if it differs materially.
          const livePrint = q.last;
          if (livePrint != null && Math.abs(livePrint - anchor.close) > AH_MATERIALITY_THRESHOLD) {
            q.afterHours = livePrint;
          } else {
            // Live matches EOD — no AH divergence to surface.
            delete q.afterHours;
          }
        }
      }
    }

    // Crypto / non-US: partial may carry prevClose (open_24h).
    if (prevClose == null && q.prevClose != null) {
      prevClose = q.prevClose;
      anchorSource = anchorSource || "quote_partial";
    }

    // Manifest fallback (US only, last resort).
    if (prevClose == null) {
      const derived = this.manifest.prevCloseBySym.get(sym);
      if (derived != null) {
        prevClose = derived;
        anchorSource = "manifest";
        staleAnchor = true;
      }
    }

    if (prevClose != null && prevClose !== 0 && q.last != null) {
      q.prevClose = prevClose;
      q.chg = ((q.last - prevClose) / prevClose) * 100;
    } else if (q.chg == null) {
      q.chg = null;
    }

    if (anchorSource) q.anchor_source = anchorSource;
    if (staleAnchor) q.stale_anchor = true;
    else delete q.stale_anchor;

    this.quotes.set(sym, q);
    return q;
  }

  // Present entries only; missing syms are simply absent from the result.
  //
  // SERVE-TIME anchor re-derivation: quotes bake prevClose/chg at message time
  // (applyPartial). After hours NO new tape message arrives, so a quote built
  // during boot with the manifest fallback would keep its stale anchor forever.
  // Re-check the AnchorCache on every read and re-derive when a better entry
  // exists — the read path is what must be correct, not the write path.
  // nowMs is optional; defaults to Date.now(). Exposed for unit tests.
  getQuotes(symList, nowMs) {
    const out = {};
    const now = nowMs != null ? nowMs : Date.now();
    for (const sym of symList) {
      const q = this.quotes.get(sym);
      if (!q) continue;
      const anchor =
        this.anchorCache && q.market === "us" ? this.anchorCache.get(sym, now) : null;
      if (!anchor || anchor.prevClose == null || anchor.prevClose <= 0) {
        out[sym] = q;
        continue;
      }
      // Serve-time derivation (write-time is not enough: after hours no tape
      // message arrives, so applyPartial never re-runs on boot-built quotes):
      //   close          — anchor carries today's official close once the daily file rolls
      //   afterHours     — the delayed AM `last` when it differs materially from close
      //   chg            — the DAY's move: (close ?? last) vs prevClose
      //   prevSessionChg — last completed session's chg, shown when live session is absent
      //                    (overnight: no today-close, last ≈ prevClose within $0.01)
      const close =
        anchor.close != null && Number.isFinite(anchor.close) ? anchor.close : null;
      const ah =
        close != null &&
        typeof q.last === "number" &&
        Math.abs(q.last - close) > AH_MATERIALITY_THRESHOLD
          ? q.last
          : null;
      const dayRef = close != null ? close : typeof q.last === "number" ? q.last : null;
      const chg =
        dayRef != null ? ((dayRef - anchor.prevClose) / anchor.prevClose) * 100 : q.chg;

      // Overnight detection: no today-close yet AND live last is within $0.01 of prevClose.
      // In this window, chg computes to ~0.00% which is misleading. Surface prevSessionChg
      // (the last completed session's move) instead of the flat overnight placeholder.
      const isOvernight =
        close == null &&
        typeof q.last === "number" &&
        Math.abs(q.last - anchor.prevClose) <= AH_MATERIALITY_THRESHOLD;
      const prevSessionChg =
        isOvernight && anchor.prevSessionChg != null && Number.isFinite(anchor.prevSessionChg)
          ? anchor.prevSessionChg
          : null;

      const changed =
        anchor.prevClose !== q.prevClose ||
        q.close !== (close != null ? close : q.close) ||
        (ah != null ? q.afterHours !== ah : q.afterHours != null) ||
        chg !== q.chg ||
        (prevSessionChg != null ? q.prevSessionChg !== prevSessionChg : q.prevSessionChg != null);
      if (!changed) {
        out[sym] = q;
        continue;
      }
      const fresh = { ...q };
      fresh.prevClose = anchor.prevClose;
      fresh.chg = chg;
      if (close != null) fresh.close = close;
      if (ah != null) fresh.afterHours = ah;
      else delete fresh.afterHours;
      if (prevSessionChg != null) fresh.prevSessionChg = prevSessionChg;
      else delete fresh.prevSessionChg;
      fresh.anchor_source = anchor.anchor_source;
      if (anchor.stale_anchor) fresh.stale_anchor = true;
      else delete fresh.stale_anchor;
      this.quotes.set(sym, fresh); // persist so /health + later reads agree
      out[sym] = fresh;
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
      // Legacy US derivation: prevClose = last / (1 + chg/100).
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

module.exports = { Store, STALE_EVICT_MS, AH_MATERIALITY_THRESHOLD };
