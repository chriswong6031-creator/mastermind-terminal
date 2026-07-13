"use strict";
// lib/anchor.js — session prevClose anchor resolution for US equities.
//
// Root cause: the nightly pipeline rebuilds manifest.json over ~4 hours and ATOMICALLY
// swaps it only at the very end (~03:00 UTC). For the entire RTH session the manifest
// `last`/`chg` reflects YESTERDAY's close, so deriving prevClose = manifestLast /
// (1 + manifestChg/100) produces the close two days ago — an off-by-one-session error.
//
// Fix: key every anchor by (sym, session_date). The session_date is the ET calendar date
// for which this anchor is the "previous close" (i.e. the prior trading day). A process
// alive across a session boundary gets a cache MISS on the new key and re-resolves fresh.
//
// Resolution order (per brief §2):
//   (a) Per-symbol daily file — last completed bar whose date < today-ET (yesterday's
//       close during RTH; today's close after the daily file rolls for after-hours).
//   (b) Polygon REST /v2/aggs/ticker/<SYM>/prev — cheap, cache per session.
//   (c) Manifest-derived as last resort; emits stale_anchor:true.
//
// AH semantics (per brief §3): after market close on a session day where today's bar is
// already in the daily file, the returned object carries:
//   close      — the official session close (index 4 of the last bar)
//   afterHours — the latest delayed print when it differs from close by >$0.01
//   anchor_source — "daily_file" | "polygon_prev" | "manifest"
//
// All async I/O is fire-and-forget during the synchronous quote-serve path; callers that
// need accurate chg should await resolveAnchor() before emitting the quote.

const fs = require("fs");
const https = require("https");
const log = require("./log");

// ET date formatter — same logic as polygon.js:etDate.
const ET_DATE_FMT = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric", month: "2-digit", day: "2-digit",
});
function etDate(ms) {
  const p = {};
  for (const part of ET_DATE_FMT.formatToParts(ms)) p[part.type] = part.value;
  return `${p.year}-${p.month}-${p.day}`;
}

// Is now-ET inside regular trading hours (09:30–16:00)?
function isRTH(nowMs) {
  const d = new Date(nowMs);
  const et = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric", minute: "numeric", hour12: false,
  }).formatToParts(d);
  const p = {};
  for (const part of et) p[part.type] = Number(part.value);
  const mins = p.hour * 60 + p.minute;
  return mins >= 9 * 60 + 30 && mins < 16 * 60;
}

// Parse a daily-file bar array [date, open, high, low, close, vol].
function parseBar(b) {
  if (!Array.isArray(b) || b.length < 5) return null;
  return { date: b[0], open: b[1], high: b[2], low: b[3], close: b[4], vol: b[5] ?? 0 };
}

class AnchorCache {
  /**
   * @param {object} opts
   * @param {string} opts.dataDir   — directory containing <SYM>.json daily files
   * @param {string} opts.apiKey    — Polygon API key (may be empty → skip REST fallback)
   * @param {() => object} opts.getManifest — returns the current manifest object
   */
  constructor({ dataDir, apiKey, getManifest }) {
    this.dataDir = dataDir;
    this.apiKey = apiKey || "";
    this.getManifest = getManifest;

    // cache: Map< `${sym}::${sessionDate}` → { prevClose, close?, afterHours?, anchor_source, stale_anchor? } >
    // sessionDate = ET date for which this entry is the prevClose (today's ET date during the session).
    this._cache = new Map();
    // in-flight Polygon REST promises to avoid parallel requests for the same sym.
    this._inflight = new Map();
  }

  // Synchronous fast path: returns cached anchor for (sym, today-ET) or null.
  // Callers should call resolveAnchor() async if they need it fresh.
  get(sym, nowMs) {
    const key = `${sym}::${etDate(nowMs)}`;
    return this._cache.get(key) || null;
  }

  // Async: ensure anchor for (sym, today-ET) is resolved and return it.
  // Safe to call concurrently for the same sym — in-flight coalesces.
  async resolve(sym, nowMs) {
    const sessionDate = etDate(nowMs);
    const key = `${sym}::${sessionDate}`;
    const hit = this._cache.get(key);
    if (hit) return hit;

    // Coalesce concurrent resolves for the same key.
    if (this._inflight.has(key)) return this._inflight.get(key);

    const p = this._resolve(sym, sessionDate, nowMs).then((anchor) => {
      this._cache.set(key, anchor);
      this._inflight.delete(key);
      return anchor;
    }).catch((e) => {
      this._inflight.delete(key);
      log.warn("anchor.resolve error", sym, e && e.message);
      const fallback = this._manifestFallback(sym);
      this._cache.set(key, fallback);
      return fallback;
    });
    this._inflight.set(key, p);
    return p;
  }

  // Prune stale sessions (keys whose sessionDate != today-ET). Call hourly.
  prune(nowMs) {
    const today = etDate(nowMs);
    let pruned = 0;
    for (const k of this._cache.keys()) {
      if (!k.endsWith(`::${today}`)) { this._cache.delete(k); pruned++; }
    }
    if (pruned) log.info("anchor cache pruned", pruned, "stale sessions");
  }

  // ── Internal ──

  async _resolve(sym, sessionDate, nowMs) {
    // (a) Daily file
    const fromFile = await this._fromDailyFile(sym, sessionDate, nowMs);
    if (fromFile) return fromFile;

    // (b) Polygon REST
    if (this.apiKey) {
      const fromRest = await this._fromPolygonPrev(sym).catch(() => null);
      if (fromRest) return fromRest;
    }

    // (c) Manifest fallback
    return this._manifestFallback(sym);
  }

  async _fromDailyFile(sym, sessionDate, nowMs) {
    const fpath = `${this.dataDir}/${sym}.json`;
    let raw;
    try {
      raw = fs.readFileSync(fpath, "utf8");
    } catch {
      return null; // file absent
    }

    let data;
    try { data = JSON.parse(raw); } catch { return null; }

    const bars = (data && data.bars) || [];
    if (bars.length < 2) return null;

    // Find the last two usable bars.
    // "Last completed bar whose date < today-ET" = the bar immediately before today's bar.
    // If today's bar is already present (daily file rolled), prevClose = second-to-last bar's close;
    // if today's bar is absent (RTH, file hasn't rolled yet), prevClose = last bar's close.
    const parsedBars = bars.map(parseBar).filter(Boolean);
    if (parsedBars.length < 2) return null;

    const last = parsedBars[parsedBars.length - 1];
    const prev = parsedBars[parsedBars.length - 2];

    let prevClose, todayClose, afterHours, prevSessionChg;

    if (last.date === sessionDate) {
      // Today's bar is present in the file — post-close / after-hours scenario.
      // prevClose = second-to-last bar (yesterday).
      prevClose = prev.close;
      todayClose = last.close;
      // afterHours: only meaningful outside RTH. We don't have a live AH print in the
      // daily file itself (it only carries EOD close); callers inject the AM-feed last.
      // Emit close field so the caller can set afterHours from the live quote.
      afterHours = null; // will be overlaid by polygon.js AM last
      // prevSessionChg: today's bar is already the reference; compute vs yesterday.
      // (today's official close − yesterday's close) / yesterday's close × 100
      if (prevClose && Number.isFinite(prevClose) && prevClose !== 0) {
        prevSessionChg = (todayClose - prevClose) / prevClose * 100;
      }
    } else {
      // Daily file hasn't rolled for today yet (typical during RTH or overnight).
      // prevClose = last bar's close (= yesterday's close).
      prevClose = last.close;
      todayClose = null;
      // prevSessionChg: yesterday's move = (last bar − second-to-last bar) / second-to-last.
      // This is used by getQuotes overnight (no live session print) to show the last
      // completed session's change instead of a flat 0.00%.
      if (prev.close && Number.isFinite(prev.close) && prev.close !== 0) {
        prevSessionChg = (last.close - prev.close) / prev.close * 100;
      }
    }

    if (!prevClose || !Number.isFinite(prevClose)) return null;

    const anchor = { prevClose, anchor_source: "daily_file" };
    if (todayClose != null) { anchor.close = todayClose; }
    if (afterHours != null) { anchor.afterHours = afterHours; }
    if (prevSessionChg != null && Number.isFinite(prevSessionChg)) {
      anchor.prevSessionChg = prevSessionChg;
    }
    log.every(`anchor-${sym}`, "DEBUG", "anchor from daily_file", sym, `prevClose=${prevClose}`, `sessionDate=${sessionDate}`);
    return anchor;
  }

  async _fromPolygonPrev(sym) {
    return new Promise((resolve, reject) => {
      const url = `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(sym)}/prev?adjusted=true&apiKey=${this.apiKey}`;
      const req = https.get(url, { timeout: 5000 }, (res) => {
        let body = "";
        res.on("data", (c) => { body += c; });
        res.on("end", () => {
          try {
            const j = JSON.parse(body);
            const result = j && j.results && j.results[0];
            if (!result || !result.c) return resolve(null);
            const prevClose = result.c;
            if (!Number.isFinite(prevClose)) return resolve(null);
            resolve({ prevClose, anchor_source: "polygon_prev" });
          } catch (e) {
            resolve(null);
          }
        });
      });
      req.on("error", reject);
      req.on("timeout", () => { req.destroy(); reject(new Error("polygon prev timeout")); });
    });
  }

  _manifestFallback(sym) {
    const manifest = this.getManifest && this.getManifest();
    if (!manifest) return { prevClose: null, anchor_source: "manifest", stale_anchor: true };
    const prevCloseBySym = manifest.prevCloseBySym;
    if (!prevCloseBySym) return { prevClose: null, anchor_source: "manifest", stale_anchor: true };
    const prevClose = prevCloseBySym.get(sym) || null;
    return { prevClose, anchor_source: "manifest", stale_anchor: true };
  }
}

module.exports = { AnchorCache, etDate, isRTH };
