/**
 * Spot-check tests for withStoredHistory pure logic.
 * Run with: node terminal/components/__tests__/intradayStore.test.mjs
 * (No jest/vitest — plain node assert, same pattern as gexWindowRows.test.mjs)
 *
 * These tests exercise the merge/resample/dedup/RTH-filter paths without requiring a real
 * filesystem. We inline the pure logic here (rather than dynamically importing intradayStore
 * which uses node:fs via ESM) and verify the algorithms directly.
 */

import assert from "node:assert/strict";

// ── inline the pure helpers (same source as intradayShared.ts) ──────────────────────────────────
function tfMinutes(tf) {
  const m = /^(\d+)(m|h)$/.exec(tf);
  if (!m) return 0;
  const n = parseInt(m[1], 10) || 1;
  return m[2] === "h" ? n * 60 : n;
}

function resample(bars, minutes) {
  if (minutes <= 0 || bars.length === 0) return bars;
  const span = minutes * 60;
  const out = [];
  let cur = null, key = NaN;
  for (const b of bars) {
    const k = Math.floor(b[0] / span);
    if (k !== key) { if (cur) out.push(cur); key = k; cur = [k * span, b[1], b[2], b[3], b[4], b[5]]; }
    else { cur[2] = Math.max(cur[2], b[2]); cur[3] = Math.min(cur[3], b[3]); cur[4] = b[4]; cur[5] += b[5]; }
  }
  if (cur) out.push(cur);
  return out;
}

// ── inline the store-layer pure logic (same as intradayStore.ts) ────────────────────────────────
const RTH_START = 9 * 60 + 30, RTH_END = 16 * 60;
function storeBase(tf) {
  const mins = tfMinutes(tf);
  if (mins >= 60) return "1h";
  if (mins >= 5)  return "5m";
  return null;
}
const rthOK = (e) => { const m = (((e / 60) % 1440) + 1440) % 1440; return m >= RTH_START && m < RTH_END; };

// Extracted merge+dedup+cap from withStoredHistory (the part we can test without fs)
function mergeStoredAndLive(stored, tf, ext, live, HIST_CAP = 20000) {
  const base = storeBase(tf);
  if (!base) return live;                     // sub-5m: live only
  if (!stored.length) return live;

  const baseMin = base === "1h" ? 60 : 5;
  let hb = tfMinutes(tf) === baseMin ? stored : resample(stored, tfMinutes(tf));
  if (!ext && tf.endsWith("m")) hb = hb.filter((b) => rthOK(b[0]));

  const liveEp = new Set(live.map((b) => b[0]));
  const merged = [];
  for (const b of hb) if (!liveEp.has(b[0])) merged.push(b);
  for (const b of live) merged.push(b);
  merged.sort((a, b) => a[0] - b[0]);
  const out = [];
  let last = -1;
  for (const b of merged) { if (b[0] !== last) { out.push(b); last = b[0]; } }
  return out.slice(-HIST_CAP);
}

// ── helpers ──────────────────────────────────────────────────────────────────────────────────────
// Build a display-epoch for a given ET hour:min on an arbitrary trading day.
// We pick 2024-01-02 as our reference trading day.
const DAY = Math.floor(Date.UTC(2024, 0, 2) / 1000); // midnight UTC of the reference day
const etEpoch = (h, min) => DAY + h * 3600 + min * 60; // "display epoch" = UTC built from ET components

// 1h store bar at each whole ET hour from 01:00–23:00
function make1hStore(hoursArray) {
  return hoursArray.map((h) => [etEpoch(h, 0), 100 + h, 101 + h, 99 + h, 100 + h, 1000]);
}

// ── Tests ─────────────────────────────────────────────────────────────────────────────────────────

// 1. Sub-5m (1m/2m/3m) → live returned unchanged even with a non-empty stored array
{
  const stored = make1hStore([9, 10, 11]);
  const live = [[etEpoch(15, 0), 200, 201, 199, 200, 500]];
  const out = mergeStoredAndLive(stored, "1m", true, live);
  assert.deepEqual(out, live, "1m tf: store bypassed, live returned as-is");
}

// 2. 4h tf: storeBase → "1h"; 1h bars resample to 4h; live tail wins on overlap
{
  // four 1h bars: 08:00, 09:00, 10:00, 11:00 → should collapse into one 4h bucket (08:00 epoch)
  const stored = make1hStore([8, 9, 10, 11]);
  const live4hEpoch = Math.floor(etEpoch(8, 0) / (4 * 3600)) * (4 * 3600); // bucket boundary
  // resampled bar should start at the 4h bucket boundary
  const out = mergeStoredAndLive(stored, "4h", true, []);
  assert.equal(out.length, 1, "four 1h bars → one 4h bucket");
  assert.equal(out[0][0], live4hEpoch, "4h bucket epoch correct");
  // h values: 101+8=109, 101+9=110, 101+10=111, 101+11=112 → max = 112
  assert.equal(out[0][2], Math.max(101+8, 101+9, 101+10, 101+11), "4h high is max of 1h highs");
  assert.equal(out[0][5], 4000, "4h volume = sum of 1h volumes");
}

// 3. Live tail wins on epoch overlap (live bar replaces same-epoch store bar)
{
  const storeEp = etEpoch(10, 0);
  const stored = [[storeEp, 100, 101, 99, 100, 1000]];
  const live    = [[storeEp, 200, 202, 198, 201, 2000]]; // newer forming bar at same epoch
  const out = mergeStoredAndLive(stored, "1h", true, live);
  assert.equal(out.length, 1, "no dupe epochs");
  // live wins because liveEp set excludes that epoch from stored
  assert.equal(out[0][1], 200, "live bar open wins over store bar at same epoch");
}

// 4. RTH filter (ext=false, minute tf) strips pre/post-market bars
{
  const preMarket  = etEpoch(8, 0);   // 08:00 ET — before RTH_START=09:30
  const rthBar     = etEpoch(10, 0);  // 10:00 ET — in RTH
  const postMarket = etEpoch(17, 0);  // 17:00 ET — after RTH_END=16:00
  const stored = [
    [preMarket,  100, 101, 99, 100, 1000],
    [rthBar,     110, 111, 109, 110, 1000],
    [postMarket, 120, 121, 119, 120, 1000],
  ];
  const out = mergeStoredAndLive(stored, "5m", false, []);
  assert.equal(out.length, 1, "RTH filter keeps only in-hours bar");
  assert.equal(out[0][0], rthBar, "surviving bar is the 10:00 ET one");
}

// 5. ext=true with minute tf: all bars pass through unfiltered
{
  const stored = [
    [etEpoch(7, 0),  100, 101, 99, 100, 1000],
    [etEpoch(10, 0), 110, 111, 109, 110, 1000],
    [etEpoch(18, 0), 120, 121, 119, 120, 1000],
  ];
  const out = mergeStoredAndLive(stored, "5m", true, []);
  assert.equal(out.length, 3, "ext=true: all bars pass RTH filter");
}

// 6. ext filter does NOT apply to hourly tf (4h ends with 'h' not 'm')
{
  const stored = [
    [etEpoch(7, 0),  100, 101, 99, 100, 1000],
    [etEpoch(11, 0), 110, 111, 109, 110, 1000],
  ];
  const out = mergeStoredAndLive(stored, "4h", false, []); // ext=false but tf=4h
  assert.ok(out.length > 0, "4h tf: RTH filter not applied regardless of ext flag");
}

// 7. HIST_CAP slicing: only the last N bars are kept
{
  const stored = Array.from({ length: 100 }, (_, i) => [DAY + i * 3600, 100, 101, 99, 100, 1]);
  const out = mergeStoredAndLive(stored, "1h", true, [], 10);
  assert.equal(out.length, 10, "HIST_CAP=10 trims to last 10 bars");
  assert.equal(out[0][0], stored[90][0], "first bar after cap is the 91st stored bar");
}

// 8. Empty stored + empty live → empty output (no crash)
{
  const out = mergeStoredAndLive([], "1h", true, []);
  assert.deepEqual(out, [], "empty stored + empty live → []");
}

// 9. Dedup in merged output (store + live both have same epoch, should appear once)
{
  const ep = etEpoch(10, 0);
  const stored = [[ep, 100, 101, 99, 100, 1000], [ep, 100, 101, 99, 100, 1000]]; // dupe in store
  const out = mergeStoredAndLive(stored, "1h", true, []);
  assert.equal(out.length, 1, "duplicate epochs in store → single bar in output");
}

console.log("All intradayStore logic tests passed.");
