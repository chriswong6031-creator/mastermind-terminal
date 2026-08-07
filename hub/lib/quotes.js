"use strict";
// lib/quotes.js — symbol routing + GET /quotes response assembly.
//
// Extracted from hub.js so the response CONTRACT is unit-testable: hub.js boots an
// HTTP server and starts feed timers at require() time, so it can never be imported
// by a test. Everything here is pure apart from the injected feed objects.
//
// RESPONSE CONTRACT (unchanged by the macro merge):
//   flat { SYM: { ...quote } } — present entries only, missing symbols simply absent.
//
// ROUTING
//   daily-only (FRED series ids)     → NOTHING. No feed, no placeholder, absent from the
//                                       response so the caller serves the manifest EOD row.
//   macro (=F, =X, ^INDEX, DX-Y.NYB) → MacroFeed, which owns its own prevClose/chg
//                                       and never touches the Store or AnchorCache.
//   crypto (-USD) / us               → Store (+ ExtFeed merge for US outside RTH).
//   cn / hk / ca                     → not served (absent from the response).

const { isMacroSymbol } = require("./macrofeed");

/**
 * FRED series that print ONCE A DAY and have no live leg on this box at all.
 *
 * Bare series ids match neither isMacroSymbol nor any classify() branch, so they fell through
 * to "us" and were treated as US equities: a Polygon `AM.DFII10` subscription (one of 500 LRU
 * slots on a ticker Polygon does not carry), one of the 30 SHARED Alpaca/Webull ext slots, and
 * — worst — a store placeholder served as source "polygon-delayed" / basis "DELAYED_15M" /
 * ts:now. That is a 15-minute-freshness claim on a once-a-day print, and ChartPanel's
 * spliceDaily turned it into a synthetic flat bar dated today.
 *
 * Served from NOWHERE instead. Absent from /quotes → the terminal falls back to the manifest's
 * real daily close.
 *
 * KEEP IN SYNC with terminal/lib/macroSymbols.ts DAILY_ONLY — adding a FRED series means adding
 * it to BOTH routers (see the pointer beside _FRED_RATES in ingest/macro_catalog.py).
 */
const DAILY_ONLY = new Set(["DFII10", "DFII5", "T10YIE", "T5YIE"]);

/**
 * True when sym is a daily-print-only series with no live leg.
 * @param {string} sym
 * @returns {boolean}
 */
function isDailyOnlySymbol(sym) {
  if (!sym || typeof sym !== "string") return false;
  return DAILY_ONLY.has(sym.trim().toUpperCase());
}

/**
 * Market taxonomy, mirrored from intradaySources.ts. Only crypto & us are served
 * from the Store; macro symbols are routed by isMacroSymbol BEFORE this is consulted
 * (a bare `CL=F` or `^GSPC` would otherwise fall through to "us").
 *
 * @param {string} sym
 * @returns {'cn'|'hk'|'ca'|'crypto'|'us'}
 */
function classify(sym) {
  if (/\.(SS|SZ)$/i.test(sym)) return "cn";
  if (/\.HK$/i.test(sym)) return "hk";
  if (/\.TO$/i.test(sym)) return "ca";
  if (/-USD$/i.test(sym)) return "crypto";
  return "us";
}

/**
 * Run the per-request DEMAND pass: subscribe/warm every leg that will be asked to answer.
 *
 * Lives here rather than in hub.js so the routing it encodes is unit-testable — requiring
 * hub.js boots an HTTP server and every feed timer. hub.js calls this and nothing else.
 *
 * @param {string[]} syms
 * @param {number} nowMs
 * @param {object} deps
 * @param {object} [deps.polygon]      Polygon feed (US only)
 * @param {object} [deps.anchorCache]  AnchorCache, warmed fire-and-forget
 * @param {object} [deps.extFeed]      ExtFeed (US only)
 * @param {object} [deps.macroFeed]    MacroFeed (macro only)
 * @param {boolean} [deps.disableUS]   HUB_DISABLE_US
 */
function applyDemand(syms, nowMs, deps = {}) {
  const { polygon, anchorCache, extFeed, macroFeed, snapshotFeed, disableUS } = deps;
  if (!Array.isArray(syms)) return;
  for (const sym of syms) {
    // Daily-only FRED series have NO leg here: not Polygon (no such ticker), not the ext feed
    // (a once-a-day print has no extended session), not the macro feed. Demanding one only
    // burns a shared LRU slot — 500 for Polygon, 30 for ext, both global across all users.
    if (isDailyOnlySymbol(sym)) continue;
    if (isMacroSymbol(sym)) {
      // macro → MacroFeed only. Polygon has no futures/index/FX entitlement here and the
      // AnchorCache has no daily file for them.
      if (macroFeed) macroFeed.demand(sym);
      continue;
    }
    if (classify(sym) !== "us") continue;
    // The REST snapshot leg is demanded for EVERY US symbol, independent of the Polygon
    // WebSocket's health and of `disableUS`: it is precisely the symbols the stream is not
    // carrying — idle-swept, LRU-evicted, or never yet delivered a bar — that would
    // otherwise fall back to the nightly manifest and show the previous session.
    if (snapshotFeed) snapshotFeed.demand(sym, nowMs);
    if (disableUS || !polygon || !polygon.isHealthy()) continue;
    polygon.ensureSubscribed(sym);
    // Fire-and-forget: resolve the anchor so the cache is warm for the next request.
    if (anchorCache) anchorCache.resolve(sym, nowMs).catch(() => {});
    // Demand ext subscription (LRU tracking, no-op when the feed is disabled or in RTH).
    if (extFeed) extFeed.demand(sym);
  }
}

/**
 * Assemble the /quotes response for a symbol list.
 *
 * @param {string[]} syms
 * @param {number} nowMs
 * @param {object} deps
 * @param {object} [deps.store]      Store instance (crypto + us)
 * @param {object} [deps.macroFeed]  MacroFeed instance
 * @param {object} [deps.extFeed]    ExtFeed instance, forwarded to store.getQuotes
 * @returns {Object<string,object>} flat { SYM: quote }
 */
function buildQuotesResponse(syms, nowMs, deps = {}) {
  const { store, macroFeed, extFeed, snapshotFeed } = deps;
  const out = {};
  if (!Array.isArray(syms) || syms.length === 0) return out;

  const storeSyms = [];
  const macroSyms = [];
  for (const sym of syms) {
    // Never served — and specifically never served the Store's manifest-derived placeholder,
    // which would stamp a once-a-day FRED print with ts:now and basis DELAYED_15M.
    if (isDailyOnlySymbol(sym)) continue;
    if (isMacroSymbol(sym)) {
      macroSyms.push(sym);
      continue;
    }
    const m = classify(sym);
    if (m === "crypto" || m === "us") storeSyms.push(sym);
  }

  if (store && storeSyms.length) {
    const served = store.getQuotes(storeSyms, nowMs, extFeed, snapshotFeed);
    for (const sym of Object.keys(served)) out[sym] = served[sym];
  }

  // Macro quotes come straight from the feed — they carry prevClose/chg/basis
  // themselves and are never written into the Store.
  if (macroFeed && macroSyms.length) {
    const served = macroFeed.getAll(macroSyms, nowMs);
    for (const sym of Object.keys(served)) out[sym] = served[sym];
  }

  return out;
}

module.exports = {
  classify,
  isMacroSymbol,
  isDailyOnlySymbol,
  DAILY_ONLY,
  applyDemand,
  buildQuotesResponse,
};
