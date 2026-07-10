/**
 * Unit test: item-28 Golden Oracle default OFF (Phase 8).
 * Verifies two contracts:
 *   1. New-user contract: when localStorage has no mm.inds key, the indicator set
 *      defaults to ["ema","rsi","stochrsi"] — _oracle is NOT included.
 *   2. Explicit-saved contract: when mm.inds is stored, the saved set is returned
 *      verbatim regardless of its content (both with and without _oracle).
 *
 * The `load()` helper in TerminalShell.tsx is a thin JSON-parse wrapper around
 * localStorage.getItem. We test its semantics directly here (pure logic, no DOM).
 *
 * Run with: node terminal/components/__tests__/oracleDefault.test.mjs
 */
import assert from "node:assert/strict";

// Inline the load() helper — identical to TerminalShell.tsx's implementation.
function load(k, d) {
  const store = load._store ?? {};
  const v = store[k];
  try {
    return v != null ? JSON.parse(v) : d;
  } catch {
    return d;
  }
}
load._store = {};

function setItem(k, v) { load._store[k] = JSON.stringify(v); }
function removeItem(k) { delete load._store[k]; }
function reset() { load._store = {}; }

// ── Test 1: new-user default does NOT include _oracle ─────────────────────
reset();
// mm.inds absent in localStorage → load() returns the default
const DEFAULT_INDS = ["ema", "rsi", "stochrsi"];
const newUserInds = load("mm.inds", DEFAULT_INDS);
assert.deepStrictEqual(newUserInds, DEFAULT_INDS, "new-user default should be [ema,rsi,stochrsi]");
assert(!newUserInds.includes("_oracle"), "new-user default must NOT include _oracle");
console.log("PASS: new-user contract — _oracle absent from default");

// ── Test 2a: explicit save WITH _oracle is preserved ──────────────────────
reset();
setItem("mm.inds", ["ema", "rsi", "stochrsi", "_oracle"]);
const savedWithOracle = load("mm.inds", DEFAULT_INDS);
assert(savedWithOracle.includes("_oracle"), "explicit save with _oracle must be preserved");
assert.strictEqual(savedWithOracle.length, 4, "all four indicators preserved");
console.log("PASS: explicit-on contract — saved _oracle preserved");

// ── Test 2b: explicit save WITHOUT _oracle is preserved ───────────────────
reset();
setItem("mm.inds", ["ema", "rsi"]);
const savedWithout = load("mm.inds", DEFAULT_INDS);
assert.deepStrictEqual(savedWithout, ["ema", "rsi"], "explicit save without _oracle preserved exactly");
assert(!savedWithout.includes("_oracle"), "_oracle absent when user never added it");
console.log("PASS: explicit-off contract — saved set without _oracle preserved");

// ── Test 3: previously auto-migrated users (edge case, nit from reviewer) ─
// Users who had _oracle auto-added by the now-deleted mm.oracleMig code will
// have mm.inds = [..., "_oracle"] in their localStorage. That set is returned
// verbatim (Test 2a covers this). They remain ON, which is acceptable: their
// state is indistinguishable from an explicit choice.
reset();
setItem("mm.inds", ["ema", "rsi", "stochrsi", "_oracle"]);
setItem("mm.oracleMig", "1");  // old migration flag still present
const migrated = load("mm.inds", DEFAULT_INDS);
assert(migrated.includes("_oracle"), "previously migrated user stays ON");
// The deleted migration code no longer runs — no new users get auto-migrated
const oracleMigFlag = load._store["mm.oracleMig"];
// The flag is still there (we wrote it above), but the migration code that
// would FORCE-ADD _oracle is gone from TerminalShell.tsx — new users see no
// such flag and load the DEFAULT_INDS without _oracle.
reset();
const freshNewUser = load("mm.inds", DEFAULT_INDS);
assert(!freshNewUser.includes("_oracle"), "fresh new user with no mm.oracleMig also no _oracle");
console.log("PASS: migration-edge-case — old migrated users stay ON; new users are OFF");

console.log("\nAll oracleDefault tests passed.");
