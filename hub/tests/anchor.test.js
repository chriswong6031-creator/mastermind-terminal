"use strict";
// Unit tests for lib/anchor.js — session-date rolling and resolution order.
// Run with: node --test tests/anchor.test.js   (Node ≥ 18 built-in test runner)
// Or via:   npm test  (from hub/ directory)

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { AnchorCache, etDate, isRTH } = require("../lib/anchor");

// ── Helpers ──

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "hub-anchor-test-"));
}

/** Write a minimal per-symbol daily file with the given bars. */
function writeDailyFile(dir, sym, bars) {
  const data = { bars };
  fs.writeFileSync(path.join(dir, `${sym}.json`), JSON.stringify(data), "utf8");
}

/** Build a bar array [date, open, high, low, close, vol]. */
function bar(date, close, open = close * 0.99) {
  return [date, open, close * 1.01, open * 0.99, close, 1_000_000];
}

// ── etDate helper ──

describe("etDate", () => {
  it("formats a UTC timestamp into ET YYYY-MM-DD", () => {
    // 2026-07-09 14:00 UTC = 10:00 ET (EDT = UTC-4) → 2026-07-09
    const ms = Date.UTC(2026, 6, 9, 14, 0, 0);
    assert.equal(etDate(ms), "2026-07-09");
  });

  it("handles midnight UTC boundary (00:00 UTC = 20:00 ET previous day)", () => {
    // 2026-07-10 00:00 UTC = 2026-07-09 20:00 ET
    const ms = Date.UTC(2026, 6, 10, 0, 0, 0);
    assert.equal(etDate(ms), "2026-07-09");
  });
});

// ── isRTH helper ──

describe("isRTH", () => {
  it("returns true at 10:00 ET", () => {
    // 2026-07-09 14:00 UTC = 10:00 ET
    assert.equal(isRTH(Date.UTC(2026, 6, 9, 14, 0)), true);
  });
  it("returns false at 17:00 ET (after close)", () => {
    // 2026-07-09 21:00 UTC = 17:00 ET
    assert.equal(isRTH(Date.UTC(2026, 6, 9, 21, 0)), false);
  });
  it("returns false at 09:00 ET (pre-market)", () => {
    // 2026-07-09 13:00 UTC = 09:00 ET
    assert.equal(isRTH(Date.UTC(2026, 6, 9, 13, 0)), false);
  });
});

// ── AnchorCache.get / resolve — session-date rolling ──

describe("AnchorCache session-date rolling", () => {
  let tmpDir;
  let cache;
  // "yesterday" and "today" in ET
  const YESTERDAY = "2026-07-08";
  const TODAY = "2026-07-09";
  // A timestamp that is 14:00 UTC on 2026-07-09 → 10:00 ET (RTH, TODAY)
  const NOW_RTH = Date.UTC(2026, 6, 9, 14, 0);
  // A timestamp that is 14:00 UTC on 2026-07-10 → 10:00 ET on 2026-07-10 (next session)
  const NOW_NEXT_SESSION = Date.UTC(2026, 6, 10, 14, 0);

  before(() => {
    tmpDir = makeTmpDir();
    // Write NVDA daily file: last bar is YESTERDAY (daily not yet rolled for TODAY)
    writeDailyFile(tmpDir, "NVDA", [
      bar("2026-07-07", 196.93),
      bar(YESTERDAY, 204.12),
    ]);
    cache = new AnchorCache({
      dataDir: tmpDir,
      apiKey: "", // no REST fallback in tests
      getManifest: () => ({
        prevCloseBySym: new Map([["NVDA", 195.0]]), // stale manifest value
      }),
    });
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("cache miss on fresh key", () => {
    assert.equal(cache.get("NVDA", NOW_RTH), null);
  });

  it("resolves prevClose from daily file (yesterday's close)", async () => {
    const anchor = await cache.resolve("NVDA", NOW_RTH);
    assert.equal(anchor.anchor_source, "daily_file");
    // prevClose should be YESTERDAY's close = 204.12, NOT the manifest's 195.0
    assert.equal(anchor.prevClose, 204.12);
    assert.equal(anchor.stale_anchor, undefined);
  });

  it("cache hit on second call (same session)", () => {
    const hit = cache.get("NVDA", NOW_RTH);
    assert.notEqual(hit, null);
    assert.equal(hit.prevClose, 204.12);
  });

  it("cache MISS on new session date (key rolls)", () => {
    // Simulate process still running next day
    const hit = cache.get("NVDA", NOW_NEXT_SESSION);
    assert.equal(hit, null, "should be a cache miss after session-date change");
  });

  it("resolves fresh anchor for new session", async () => {
    // Write a new daily file where TODAY is the last bar (daily rolled)
    writeDailyFile(tmpDir, "NVDA", [
      bar(YESTERDAY, 204.12),
      bar("2026-07-09", 202.78),
    ]);
    const anchor = await cache.resolve("NVDA", NOW_NEXT_SESSION);
    assert.equal(anchor.anchor_source, "daily_file");
    // For next session (2026-07-10), prevClose = close of 2026-07-09 bar
    // The file has last bar = 2026-07-09, prev bar = YESTERDAY
    // Since last.date (2026-07-09) < sessionDate (2026-07-10), prevClose = last.close
    assert.equal(anchor.prevClose, 202.78);
  });

  it("prune removes stale session keys", () => {
    cache.prune(NOW_NEXT_SESSION); // prune using NEXT_SESSION as "today"
    // The key for TODAY session should be gone (it's yesterday relative to NEXT_SESSION)
    const oldHit = cache.get("NVDA", NOW_RTH);
    assert.equal(oldHit, null, "old session key should be pruned");
    // The key for NEXT_SESSION should still be present
    const newHit = cache.get("NVDA", NOW_NEXT_SESSION);
    assert.notEqual(newHit, null, "current session key should survive prune");
  });
});

// ── AnchorCache — daily file rolled (post-close) ──

describe("AnchorCache daily file rolled for today", () => {
  let tmpDir;
  let cache;
  const SESSION_DATE = "2026-07-09";
  // 21:00 UTC = 17:00 ET — after close
  const NOW_AFTERHOURS = Date.UTC(2026, 6, 9, 21, 0);

  before(() => {
    tmpDir = makeTmpDir();
    // File has today's bar (daily rolled post-close)
    writeDailyFile(tmpDir, "NVDA", [
      bar("2026-07-08", 204.12),
      bar(SESSION_DATE, 202.78),
    ]);
    cache = new AnchorCache({
      dataDir: tmpDir,
      apiKey: "",
      getManifest: () => ({ prevCloseBySym: new Map() }),
    });
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("prevClose = yesterday's close (second-to-last bar) when today's bar is present", async () => {
    const anchor = await cache.resolve("NVDA", NOW_AFTERHOURS);
    assert.equal(anchor.anchor_source, "daily_file");
    assert.equal(anchor.prevClose, 204.12, "prevClose should be yesterday's close");
    assert.equal(anchor.close, 202.78, "close should be today's official close");
  });
});

// ── AnchorCache — manifest fallback when no daily file ──

describe("AnchorCache manifest fallback", () => {
  let tmpDir;
  let cache;
  const NOW = Date.UTC(2026, 6, 9, 14, 0);

  before(() => {
    tmpDir = makeTmpDir();
    // No daily file written for AAPL
    cache = new AnchorCache({
      dataDir: tmpDir,
      apiKey: "",
      getManifest: () => ({
        prevCloseBySym: new Map([["AAPL", 308.0]]),
      }),
    });
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("falls back to manifest when daily file is absent", async () => {
    const anchor = await cache.resolve("AAPL", NOW);
    assert.equal(anchor.anchor_source, "manifest");
    assert.equal(anchor.prevClose, 308.0);
    assert.equal(anchor.stale_anchor, true);
  });
});

// ── AnchorCache — NVDA stale-manifest case (the bug scenario) ──

describe("AnchorCache — NVDA bug scenario", () => {
  // Scenario: manifest stuck at 07-07 (last=196.93, chg=0.71).
  // Manifest-derived prevClose = 196.93 / 1.0071 ≈ 195.54 (WRONG: two sessions stale).
  // Daily file has 07-08 close = 204.12.
  // Correct prevClose for the 07-09 session = 204.12.

  let tmpDir;
  let cache;
  const NOW = Date.UTC(2026, 6, 9, 14, 0); // 2026-07-09 10:00 ET

  before(() => {
    tmpDir = makeTmpDir();
    writeDailyFile(tmpDir, "NVDA", [
      bar("2026-07-07", 196.93),
      bar("2026-07-08", 204.12),
    ]);
    const staleManifestPrevClose = 196.93 / (1 + 0.71 / 100); // ≈ 195.54
    cache = new AnchorCache({
      dataDir: tmpDir,
      apiKey: "",
      getManifest: () => ({
        prevCloseBySym: new Map([["NVDA", staleManifestPrevClose]]),
      }),
    });
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("serves 204.12 (not ~195.54) as prevClose for NVDA on 2026-07-09", async () => {
    const anchor = await cache.resolve("NVDA", NOW);
    assert.equal(anchor.anchor_source, "daily_file");
    assert.equal(anchor.prevClose, 204.12);
    // Verify the manifest fallback would have been wrong
    const manifestFallback = 196.93 / (1 + 0.71 / 100);
    assert.notEqual(anchor.prevClose, manifestFallback, "must NOT equal the stale manifest prevClose");
  });
});

// ── Store integration — setQuote uses anchor ──

describe("Store.setQuote uses AnchorCache prevClose", () => {
  const { Store } = require("../lib/store");

  let tmpDir;
  let cache;
  let store;
  const NOW = Date.UTC(2026, 6, 9, 14, 0); // 2026-07-09 10:00 ET

  before(async () => {
    tmpDir = makeTmpDir();
    writeDailyFile(tmpDir, "NVDA", [
      bar("2026-07-07", 196.93),
      bar("2026-07-08", 204.12),
    ]);

    // Write a manifest file (needed by Store constructor)
    const manifestPath = path.join(tmpDir, "manifest.json");
    fs.writeFileSync(manifestPath, JSON.stringify({
      as_of: "2026-07-07",
      symbols: {
        NVDA: { last: 196.93, chg: 0.71 },
      },
    }));

    cache = new AnchorCache({
      dataDir: tmpDir,
      apiKey: "",
      getManifest: () => store ? store.manifest : null,
    });

    store = new Store(manifestPath, cache);
    store.loadManifestIfStale(true);

    // Pre-warm the anchor
    await cache.resolve("NVDA", NOW);
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("chg is computed vs 204.12 (daily file), not vs stale manifest-derived prevClose", () => {
    // Simulate AM bar arriving: NVDA last = 202.00
    const q = store.setQuote("NVDA", { last: 202.00, market: "us" }, NOW);
    // Expected chg = (202.00 - 204.12) / 204.12 * 100 ≈ -1.039%
    const expectedChg = (202.00 - 204.12) / 204.12 * 100;
    assert.ok(q.chg != null, "chg must be set");
    assert.ok(Math.abs(q.chg - expectedChg) < 0.001, `chg=${q.chg} expected ≈ ${expectedChg}`);
    assert.equal(q.anchor_source, "daily_file");
    assert.equal(q.prevClose, 204.12);
    // The stale manifest would have given prevClose ≈ 195.54, chg ≈ +3.31% — totally wrong
    const stalePrevClose = 196.93 / (1 + 0.71 / 100);
    const staleChg = (202.00 - stalePrevClose) / stalePrevClose * 100;
    assert.ok(Math.abs(q.chg - staleChg) > 2, "chg must differ materially from the stale-manifest value");
  });
});
