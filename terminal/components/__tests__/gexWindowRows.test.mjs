/**
 * Lightweight node test for windowGexRows pure function.
 * Run with: node --experimental-vm-modules terminal/components/__tests__/gexWindowRows.test.mjs
 * (No jest/vitest dependency — the repo has no test runner configured.)
 */

import assert from "node:assert/strict";
import { windowGexRows } from "../../lib/windowGexRows.mjs";

// helper to build a row
const row = (strike) => ({ strike, gamma_net: 0, gamma_call: 0, gamma_put: 0, delta_net: 0, vanna_net: 0, charm_net: 0 });

// 1. Empty input → returns empty
{
  const result = windowGexRows([], 500, 0.10);
  assert.deepEqual(result, [], "empty input returns empty");
}

// 2. spotRef 0 → passthrough (guard against divide-by-zero)
{
  const rows = [row(100), row(200)];
  const result = windowGexRows(rows, 0, 0.10);
  assert.equal(result.length, 2, "spotRef=0 returns full list");
}

// 3. Normal ±10% window: spotRef=500 → lo=450, hi=550
{
  const rows = [row(400), row(450), row(500), row(550), row(600)];
  const result = windowGexRows(rows, 500, 0.10);
  assert.deepEqual(result.map((r) => r.strike), [450, 500, 550], "±10% window correct");
}

// 4. All rows in range → no filtering
{
  const rows = [row(495), row(500), row(505)];
  const result = windowGexRows(rows, 500, 0.10);
  assert.equal(result.length, 3, "all in-range rows kept");
}

// 5. Wide old-payload (470 rows): only near-spot rows returned
{
  const rows = Array.from({ length: 470 }, (_, i) => row(100 + i));
  const spotRef = 300;
  const result = windowGexRows(rows, spotRef, 0.10);
  // expect strikes in [270, 330]
  assert.ok(result.every((r) => r.strike >= 270 && r.strike <= 330), "470-row payload windowed to ±10%");
  assert.ok(result.length < 100, `windowed count ${result.length} well below 470`);
}

// 6. New windowed payload (≤160 rows, already within ±20%): ±10% sub-windows correctly
{
  const rows = Array.from({ length: 40 }, (_, i) => row(450 + i * 2.5)); // strikes 450..547.5
  const spotRef = 500;
  const result = windowGexRows(rows, spotRef, 0.10);
  assert.ok(result.every((r) => r.strike >= 450 && r.strike <= 550), "new payload sub-windowed correctly");
}

console.log("All windowGexRows tests passed.");
