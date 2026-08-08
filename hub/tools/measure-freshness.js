#!/usr/bin/env node
"use strict";
/**
 * measure-freshness — time the quote feed against the wall clock.
 *
 * WHY THIS IS A COMMITTED TOOL AND NOT A ONE-OFF SCRIPT.
 * The rule this repo now enforces is that nothing may be LABELLED real-time without a
 * measurement (lib/snapshot.js `verdict`, terminal/lib/feedFreshness.ts). A rule like that is
 * only as good as the ability to re-run its evidence: when the plan changes, when the vendor
 * re-tiers an endpoint, or when someone asks "is it actually live right now", the answer has to
 * be a fresh measurement rather than a memory of one. This prints that measurement.
 *
 * It also exists because the real-time verdict CANNOT be taken outside US market hours. The
 * feature was built on a Saturday; `verdict()` correctly returns `closed` and refuses to grade,
 * so the live-session numbers have to be collected on the next trading day by running this.
 *
 * USAGE
 *   POLYGON_API_KEY=… node hub/tools/measure-freshness.js [SYM…] [--rounds N] [--every S]
 *   HUB_PORT=3100     node hub/tools/measure-freshness.js --hub          # grade the running hub too
 *
 * WHAT IT MEASURES
 *   lag  = wall clock − the vendor's own timestamp on the print it just served.
 *   floor = the youngest lag across all symbols in a round. This is the discriminator: a
 *           15-minute-delayed plan cannot produce a print younger than 15 minutes for ANY
 *           symbol, so a floor of seconds is real-time and a floor of ~15 min is not. A single
 *           symbol's lag proves nothing on its own — an illiquid name goes minutes without
 *           trading on a perfectly live feed.
 *
 * Never prints the API key.
 */

const https = require("node:https");

const KEY = process.env.POLYGON_API_KEY || process.env.MASSIVE_API_KEY || "";
const argv = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};
const ROUNDS = parseInt(flag("--rounds", "5"), 10);
const EVERY_S = parseInt(flag("--every", "10"), 10);
const WANT_HUB = argv.includes("--hub");
const SYMS = argv.filter((a) => !a.startsWith("--") && !/^\d+$/.test(a));
const TICKERS = SYMS.length ? SYMS : ["AAPL", "MSFT", "NVDA", "SPY", "TSLA"];

function getJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 8000 }, (res) => {
      let b = "";
      res.on("data", (c) => { b += c; });
      res.on("end", () => { try { resolve(JSON.parse(b)); } catch (e) { reject(e); } });
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
  });
}

function localJson(path) {
  return new Promise((resolve, reject) => {
    require("node:http")
      .get({ host: "127.0.0.1", port: process.env.HUB_PORT || "3100", path, timeout: 3000 }, (res) => {
        let b = "";
        res.on("data", (c) => { b += c; });
        res.on("end", () => { try { resolve(JSON.parse(b)); } catch (e) { reject(e); } });
      })
      .on("error", reject);
  });
}

const etFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York", weekday: "short", hour12: false,
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit",
});
const et = (ms) => etFmt.format(new Date(ms));
const secs = (ms) => (ms / 1000).toFixed(1).padStart(9) + "s";

async function round(n) {
  const url =
    "https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers" +
    `?tickers=${TICKERS.join(",")}&apiKey=${KEY}`;
  const t0 = Date.now();
  const body = await getJson(url);
  const rtt = Date.now() - t0;
  const now = Date.now();
  const rows = (body && body.tickers) || [];

  let floor = null;
  const lines = [];
  for (const r of rows) {
    // lastTrade.t is NANOseconds. Getting this unit wrong is the single easiest way to
    // produce a confident, badly wrong freshness number.
    const tNs = r.lastTrade && Number(r.lastTrade.t);
    if (!tNs) { lines.push(`  ${String(r.ticker).padEnd(6)} no lastTrade block`); continue; }
    const printMs = tNs / 1e6;
    const lag = now - printMs;
    if (floor == null || lag < floor) floor = lag;
    lines.push(
      `  ${String(r.ticker).padEnd(6)} ${String(r.lastTrade.p).padStart(10)}   lag ${secs(lag)}   print ${et(printMs)} ET`,
    );
  }

  console.log(`\n── round ${n}/${ROUNDS}  ${et(now)} ET   (rtt ${rtt}ms)`);
  for (const l of lines) console.log(l);
  const verdict =
    floor == null ? "NO DATA"
      : floor <= 2 * 60_000 ? "REAL-TIME"
        : floor <= 20 * 60_000 ? "DELAYED"
          : "STALE / market closed";
  console.log(`  FLOOR ${floor == null ? "   n/a" : secs(floor)}   →  ${verdict}`);

  if (WANT_HUB) {
    try {
      const h = await localJson("/health");
      const v = (h.snapshotFeed && h.snapshotFeed.verdict) || {};
      console.log(
        `  hub verdict: tier=${v.tier} floorLagMs=${v.floorLagMs} session=${v.session} ` +
        `(realtime=${h.snapshotFeed && h.snapshotFeed.realtime}, cluster=${h.polygon && h.polygon.cluster})`,
      );
    } catch (e) {
      console.log(`  hub verdict: unreachable (${e.message})`);
    }
  }
  return floor;
}

(async () => {
  if (!KEY) { console.error("POLYGON_API_KEY / MASSIVE_API_KEY not set"); process.exit(1); }
  console.log(`measuring ${TICKERS.join(", ")} — ${ROUNDS} rounds, ${EVERY_S}s apart`);
  console.log(`now: ${et(Date.now())} ET`);
  console.log(
    "NOTE: a real-time verdict is only meaningful inside a US session (pre 04:00, rth 09:30,\n" +
    "      post to 20:00 ET, weekdays). Outside one there is nothing printing to measure.",
  );

  const floors = [];
  for (let i = 1; i <= ROUNDS; i++) {
    try { floors.push(await round(i)); } catch (e) { console.log(`  round ${i} failed: ${e.message}`); }
    if (i < ROUNDS) await new Promise((r) => setTimeout(r, EVERY_S * 1000));
  }

  const ok = floors.filter((f) => f != null);
  if (!ok.length) { console.log("\nno usable rounds"); return; }
  const best = Math.min(...ok);
  const worst = Math.max(...ok);
  console.log(
    `\n═══ ${ok.length} rounds — floor best ${secs(best)} / worst ${secs(worst)} ═══\n` +
    `VERDICT: ${best <= 2 * 60_000 ? "REAL-TIME (US stocks)" : best <= 20 * 60_000 ? "DELAYED" : "no live tape in this window"}`,
  );
})();
