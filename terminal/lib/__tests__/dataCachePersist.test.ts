/**
 * dataCachePersist.test.ts — unit tests for the IndexedDB persistence layer added
 * to lib/dataCache.ts (write-through / read-back) and lib/idbJsonStore.ts.
 *
 * Two tiers of coverage:
 *   A. PURE logic, no IDB at all — the size-estimation / eviction decision
 *      (estimatePersistBytes / shouldPersist) and the seed-freshness classifier
 *      (_seedDecision: "IDB result seeds memory with correct ts + normal rules").
 *   B. END-TO-END through a minimal in-memory fake `indexedDB` installed on
 *      globalThis, exercising the REAL getJSON / prefetch / idbGet / idbPut code
 *      paths — verifying a persisted record seeds memory with the PERSISTED ts.
 *
 * In the default vitest node env indexedDB is undefined (verified separately), so
 * these tests must install the fake themselves. Tier B is skipped structurally if
 * structuredClone is somehow unavailable.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  estimatePersistBytes,
  shouldPersist,
  PER_ROW_BYTES,
  MAX_RECORD_BYTES,
  isAvailable,
} from "../idbJsonStore";
import { _seedDecision, type SeedDecision } from "../dataCache";

// ───────────────────────────────────────────────────────────────────────────
// Tier A — pure decision logic (no IndexedDB required)
// ───────────────────────────────────────────────────────────────────────────

describe("idbJsonStore.estimatePersistBytes — cheap size estimate (no double stringify)", () => {
  it("estimates an array as length × PER_ROW_BYTES", () => {
    expect(estimatePersistBytes([])).toBe(0);
    expect(estimatePersistBytes(new Array(10).fill(0))).toBe(10 * PER_ROW_BYTES);
    expect(estimatePersistBytes(new Array(1000).fill({ o: 1, h: 2, l: 3, c: 4 }))).toBe(
      1000 * PER_ROW_BYTES,
    );
  });

  it("estimates a bars-wrapper object via its inner array", () => {
    expect(estimatePersistBytes({ bars: new Array(5).fill(0) })).toBe(5 * PER_ROW_BYTES);
    expect(estimatePersistBytes({ candles: new Array(7).fill(0) })).toBe(7 * PER_ROW_BYTES);
    expect(estimatePersistBytes({ rows: new Array(3).fill(0) })).toBe(3 * PER_ROW_BYTES);
  });

  it("returns null (no cheap estimate → persist unconditionally) for other shapes", () => {
    expect(estimatePersistBytes(null)).toBeNull();
    expect(estimatePersistBytes(undefined)).toBeNull();
    expect(estimatePersistBytes("a string")).toBeNull();
    expect(estimatePersistBytes(42)).toBeNull();
    expect(estimatePersistBytes({ intel: "x", score: 1 })).toBeNull(); // plain object, no inner array
  });
});

describe("idbJsonStore.shouldPersist — single-record 8MB safety cap decision", () => {
  it("rejects an array whose estimate exceeds MAX_RECORD_BYTES", () => {
    const overRows = Math.ceil(MAX_RECORD_BYTES / PER_ROW_BYTES) + 100;
    expect(shouldPersist(new Array(overRows).fill(0))).toBe(false);
  });

  it("accepts an array right at/under the cap", () => {
    const atRows = Math.floor(MAX_RECORD_BYTES / PER_ROW_BYTES); // estimate <= cap
    expect(shouldPersist(new Array(atRows).fill(0))).toBe(true);
    expect(shouldPersist([1, 2, 3])).toBe(true);
  });

  it("persists unconditionally when the value cannot be cheaply estimated (null estimate)", () => {
    expect(shouldPersist({ any: "object" })).toBe(true);
    expect(shouldPersist("string")).toBe(true);
    expect(shouldPersist(null)).toBe(true);
  });

  it("rejects a large bars-wrapper object via its inner array length", () => {
    const overRows = Math.ceil(MAX_RECORD_BYTES / PER_ROW_BYTES) + 1;
    expect(shouldPersist({ bars: new Array(overRows).fill(0) })).toBe(false);
  });
});

describe("dataCache._seedDecision — seed-with-persisted-ts freshness classifier", () => {
  const TTL = 60_000;

  it("classifies a within-ttl record as fresh (serve from disk, no network)", () => {
    expect(_seedDecision(1_000, 1_000 + 30_000, TTL, true)).toBe<SeedDecision>("fresh");
    expect(_seedDecision(1_000, 1_000 + 30_000, TTL, false)).toBe<SeedDecision>("fresh");
    // Freshness uses the PERSISTED ts, not now: a record persisted 1ms ago is fresh.
    expect(_seedDecision(1_000, 1_001, TTL, true)).toBe<SeedDecision>("fresh");
  });

  it("classifies an expired record as stale-swr when swr is on", () => {
    expect(_seedDecision(1_000, 1_000 + 90_000, TTL, true)).toBe<SeedDecision>("stale-swr");
  });

  it("classifies an expired record as refetch when swr is off", () => {
    expect(_seedDecision(1_000, 1_000 + 90_000, TTL, false)).toBe<SeedDecision>("refetch");
  });

  it("treats age === ttl as stale (strict age < ttl freshness boundary)", () => {
    expect(_seedDecision(0, TTL, TTL, true)).toBe<SeedDecision>("stale-swr");
    expect(_seedDecision(0, TTL, TTL, false)).toBe<SeedDecision>("refetch");
    // one ms under the boundary is fresh
    expect(_seedDecision(0, TTL - 1, TTL, true)).toBe<SeedDecision>("fresh");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Tier B — end-to-end through a minimal in-memory fake IndexedDB.
//
// Covers only the request surface dataCache/idbJsonStore actually use:
//   open + upgradeneeded(createObjectStore/createIndex),
//   transaction/objectStore, get, put, delete, clear, count,
//   index("ts").openCursor() (ascending).
// The fake is intentionally small; it validates the WIRING (seed memory with the
// persisted ts and apply freshness) against real code, not IDB spec conformance.
// ───────────────────────────────────────────────────────────────────────────

type Rec = { url: string; data: any; ts: number };

function makeFakeIndexedDB() {
  const data = new Map<string, Rec>();

  // Microtask-defer a request's success so on* handlers (assigned after the call
  // returns, exactly like real IDB) are already attached when they fire.
  function fire<T>(makeResult: () => T) {
    const req: any = { onsuccess: null, onerror: null, result: undefined };
    queueMicrotask(() => {
      try {
        req.result = makeResult();
        req.onsuccess && req.onsuccess({ target: req });
      } catch (e) {
        req.onerror && req.onerror({ target: req });
      }
    });
    return req;
  }

  function makeStore() {
    return {
      get: (url: string) => fire(() => data.get(url)),
      put: (rec: Rec) => fire(() => {
        data.set(rec.url, rec);
        return rec.url;
      }),
      delete: (url: string) => fire(() => {
        data.delete(url);
        return undefined;
      }),
      clear: () => fire(() => {
        data.clear();
        return undefined;
      }),
      count: () => fire(() => data.size),
      index: (_name: string) => ({
        openCursor: () => {
          // Ascending-by-ts cursor.
          const sorted = [...data.values()].sort((a, b) => a.ts - b.ts);
          let i = 0;
          const req: any = { onsuccess: null, onerror: null, result: undefined };
          const step = () => {
            queueMicrotask(() => {
              if (i >= sorted.length) {
                req.result = null;
                req.onsuccess && req.onsuccess({ target: req });
                return;
              }
              const rec = sorted[i];
              req.result = {
                value: rec,
                delete: () => data.delete(rec.url),
                continue: () => {
                  i++;
                  step();
                },
              };
              req.onsuccess && req.onsuccess({ target: req });
            });
          };
          step();
          return req;
        },
      }),
      createIndex: () => {},
    };
  }

  const db: any = {
    objectStoreNames: { contains: (_n: string) => true },
    createObjectStore: () => makeStore(),
    transaction: (_store: string, _mode?: string) => {
      const tx: any = { oncomplete: null, onerror: null, onabort: null, objectStore: () => makeStore() };
      // Resolve the transaction as complete after pending request microtasks.
      queueMicrotask(() => queueMicrotask(() => tx.oncomplete && tx.oncomplete({ target: tx })));
      return tx;
    },
    close: () => {},
    onversionchange: null,
  };

  return {
    _data: data,
    open: (_name: string, _version?: number) => {
      const req: any = { onupgradeneeded: null, onsuccess: null, onerror: null, onblocked: null, result: db };
      queueMicrotask(() => {
        req.onupgradeneeded && req.onupgradeneeded({ target: req });
        req.onsuccess && req.onsuccess({ target: req });
      });
      return req;
    },
  };
}

// Load dataCache/idbJsonStore FRESH per test with the fake installed, so the
// module-level open-promise cache starts clean each time.
async function freshModules() {
  vi.resetModules();
  const idb = await import("../idbJsonStore");
  const dc = await import("../dataCache");
  return { idb, dc };
}

describe("dataCache × idbJsonStore — end-to-end read-back through a fake IndexedDB", () => {
  let fake: ReturnType<typeof makeFakeIndexedDB>;
  const realIDB = (globalThis as any).indexedDB;
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    fake = makeFakeIndexedDB();
    (globalThis as any).indexedDB = fake;
  });

  afterEach(() => {
    if (realIDB === undefined) delete (globalThis as any).indexedDB;
    else (globalThis as any).indexedDB = realIDB;
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  it("isAvailable() reflects the injected indexedDB", async () => {
    const { idb } = await freshModules();
    expect(idb.isAvailable()).toBe(true);
  });

  it("getJSON serves FRESH persisted data from IDB on a full memory miss WITHOUT a network fetch", async () => {
    const { idb, dc } = await freshModules();
    const url = "/data/FRESHSYM.json";
    // Seed IDB directly with a fresh (just-now) record.
    await idb.idbPut(url, [{ o: 1, h: 2, l: 3, c: 4 }], Date.now());

    const fetchSpy = vi.fn(() => Promise.reject(new Error("network must not be called")));
    globalThis.fetch = fetchSpy as any;

    const out = await dc.getJSON(url);
    expect(out).toEqual([{ o: 1, h: 2, l: 3, c: 4 }]);
    expect(fetchSpy).not.toHaveBeenCalled();
    // Memory is now seeded → a second read is a pure memory hit.
    expect(dc.peek(url)).toEqual([{ o: 1, h: 2, l: 3, c: 4 }]);
  });

  it("seeds memory with the PERSISTED ts (not now): a stale IDB record serves stale + revalidates", async () => {
    const { idb, dc } = await freshModules();
    const url = "/data/STALESYM.json";
    const staleTs = Date.now() - 5 * 60_000; // 5 min old → beyond 60s ttl
    await idb.idbPut(url, [{ stale: true }], staleTs);

    // Background revalidation should fire exactly one network fetch returning new data.
    const fresh = [{ stale: false, fresh: true }];
    const fetchSpy = vi.fn(() =>
      Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(fresh) } as any),
    );
    globalThis.fetch = fetchSpy as any;

    // First call: served STALE from disk immediately (proves ts carried through:
    // had ts been rewritten to now, this would have been classified fresh and we
    // could not distinguish — so we assert the background fetch DID run).
    const out = await dc.getJSON(url);
    expect(out).toEqual([{ stale: true }]);

    // Let the fire-and-forget background revalidation settle.
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    // Memory now holds the revalidated data.
    expect(dc.peek(url)).toEqual(fresh);
  });

  it("write-through: a successful getJSON network fetch persists to IDB for the next reader", async () => {
    const { idb, dc } = await freshModules();
    const url = "/data/WRITETHRU.json";
    const payload = [{ a: 1 }, { a: 2 }];
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(payload) } as any),
    ) as any;

    const out = await dc.getJSON(url);
    expect(out).toEqual(payload);

    // Write-through is fire-and-forget; give it a tick, then read straight from IDB.
    await new Promise((r) => setTimeout(r, 20));
    const rec = await idb.idbGet(url);
    expect(rec).not.toBeNull();
    expect(rec!.data).toEqual(payload);
    expect(typeof rec!.ts).toBe("number");
  });

  it("oversized values are NOT written through (8MB single-record cap)", async () => {
    const { idb, dc } = await freshModules();
    const url = "/data/HUGE.json";
    const overRows = Math.ceil(MAX_RECORD_BYTES / PER_ROW_BYTES) + 10;
    const huge = new Array(overRows).fill({ o: 1 });
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(huge) } as any),
    ) as any;

    const out = await dc.getJSON(url);
    expect(Array.isArray(out)).toBe(true); // caller still gets the data
    await new Promise((r) => setTimeout(r, 20));
    // ...but nothing landed in IDB.
    expect(await idb.idbGet(url)).toBeNull();
  });

  it("invalidate(url) removes the IDB record (fire-and-forget)", async () => {
    const { idb, dc } = await freshModules();
    const url = "/data/DROPME.json";
    await idb.idbPut(url, [1, 2, 3], Date.now());
    expect(await idb.idbGet(url)).not.toBeNull();

    dc.invalidate(url);
    await new Promise((r) => setTimeout(r, 20));
    expect(await idb.idbGet(url)).toBeNull();
  });

  it("eviction sweep trims the store to RECORD_CAP oldest-first", async () => {
    const { idb } = await freshModules();
    // Put cap + a handful, with strictly increasing ts so 'oldest' is unambiguous.
    const total = idb.RECORD_CAP + 5;
    for (let i = 0; i < total; i++) {
      await idb.idbPut(`/data/E${i}.json`, [i], 1_000 + i);
    }
    // idbPut runs eviction only every EVICT_EVERY puts; force a deterministic sweep.
    await idb.evictIfNeeded();
    await new Promise((r) => setTimeout(r, 20));

    // The 5 oldest (E0..E4) should be gone; the newest should remain.
    expect(await idb.idbGet("/data/E0.json")).toBeNull();
    expect(await idb.idbGet(`/data/E${total - 1}.json`)).not.toBeNull();
    // Count is back at the cap.
    expect(fake._data.size).toBe(idb.RECORD_CAP);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Tier C — blocked / limbo IndexedDB whose open() NEVER settles.
//
// Regression guard for the live Chrome hang: a pending deleteDatabase from
// another tab, a stuck version upgrade, or storage pressure can leave
// indexedDB.open() hanging with NO success, error, or blocked event. The
// read-back await on getJSON/prefetch used to hang forever and blank the
// terminal. The fix (idbGet races its whole body against ~250ms, then LATCHES
// the store off) must make the terminal fall through to the network exactly as a
// cache miss — and never pay the timeout twice.
//
// Uses vitest fake timers so the ~250ms budget elapses instantly and
// deterministically (no real wall-clock wait).
// ───────────────────────────────────────────────────────────────────────────

function makeNeverSettlingIndexedDB() {
  // open() hands back a request object and then does NOTHING — no onsuccess,
  // no onerror, no onblocked is ever fired, mirroring a blocked/limbo IDB.
  let openCalls = 0;
  return {
    get openCalls() {
      return openCalls;
    },
    open: (_name: string, _version?: number) => {
      openCalls++;
      return { onupgradeneeded: null, onsuccess: null, onerror: null, onblocked: null, result: undefined };
    },
  };
}

describe("dataCache × idbJsonStore — blocked IDB whose open() never settles (timeout + latch)", () => {
  let neverDb: ReturnType<typeof makeNeverSettlingIndexedDB>;
  const realIDB = (globalThis as any).indexedDB;
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    vi.useFakeTimers();
    neverDb = makeNeverSettlingIndexedDB();
    (globalThis as any).indexedDB = neverDb;
  });

  afterEach(() => {
    vi.useRealTimers();
    if (realIDB === undefined) delete (globalThis as any).indexedDB;
    else (globalThis as any).indexedDB = realIDB;
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  it("(a) getJSON still resolves via the network when open() never settles — bounded, not hung", async () => {
    const { idb, dc } = await freshModules();
    (globalThis as any).indexedDB = neverDb; // re-install after resetModules
    const url = "/data/BLOCKED.json";
    const payload = [{ o: 1, h: 2, l: 3, c: 4 }];
    const fetchSpy = vi.fn(() =>
      Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(payload) } as any),
    );
    globalThis.fetch = fetchSpy as any;

    // Kick off the read-back. It will await idbGet, which parks on the ~250ms race.
    const p = dc.getJSON(url);

    // Drive fake time PAST the read timeout. With real IDB this open() never
    // fires, so only the timeout can unblock the race. advanceTimersByTimeAsync
    // also flushes the microtasks that carry the subsequent network fetch.
    await vi.advanceTimersByTimeAsync(idb.IDB_READ_TIMEOUT_MS + 5);

    const out = await p;
    expect(out).toEqual(payload); // data delivered via network, terminal not blank
    expect(fetchSpy).toHaveBeenCalledTimes(1); // fell through to network exactly as a miss
    expect(idb._isIdbDead()).toBe(true); // the store latched off on timeout
  });

  it("(b) the latch prevents a SECOND timeout stall: second call short-circuits, open() not re-invoked", async () => {
    const { idb, dc } = await freshModules();
    (globalThis as any).indexedDB = neverDb;
    const payload = [{ a: 1 }];
    const fetchSpy = vi.fn(() =>
      Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(payload) } as any),
    );
    globalThis.fetch = fetchSpy as any;

    // First call pays the timeout once and latches the store dead.
    const p1 = dc.getJSON("/data/FIRST.json");
    await vi.advanceTimersByTimeAsync(idb.IDB_READ_TIMEOUT_MS + 5);
    await p1;
    expect(idb._isIdbDead()).toBe(true);
    const opensAfterFirst = neverDb.openCalls;
    expect(opensAfterFirst).toBeGreaterThanOrEqual(1);

    // Second call, DIFFERENT url (full memory miss again). If the latch works it
    // must NOT open IDB and must NOT wait for a timeout — it resolves purely from
    // the network. Prove "no wait" two ways: (1) open() count is unchanged, and
    // (2) the promise resolves WITHOUT advancing the fake clock at all.
    const p2 = dc.getJSON("/data/SECOND.json");
    // Only flush microtasks (no timer advance) — a stalled call would still be
    // pending here because its 250ms timer hasn't been driven.
    await vi.advanceTimersByTimeAsync(0);
    const out2 = await p2;

    expect(out2).toEqual(payload);
    expect(neverDb.openCalls).toBe(opensAfterFirst); // latch skipped IDB entirely — no new open()
    expect(fetchSpy).toHaveBeenCalledTimes(2); // both served from network
  });

  it("(c) idbGet resolves null under the timeout and latches; a subsequent idbGet returns instantly", async () => {
    // Direct unit-level assertion on the store itself (no dataCache), pinning the
    // idbGet contract the read-back relies on.
    const { idb } = await freshModules();
    (globalThis as any).indexedDB = neverDb;

    const first = idb.idbGet("/data/X.json");
    await vi.advanceTimersByTimeAsync(idb.IDB_READ_TIMEOUT_MS + 5);
    expect(await first).toBeNull();
    expect(idb._isIdbDead()).toBe(true);
    const opensAfterFirst = neverDb.openCalls;

    // Latched: returns null immediately, opens nothing, needs no timer advance.
    const second = idb.idbGet("/data/Y.json");
    await vi.advanceTimersByTimeAsync(0);
    expect(await second).toBeNull();
    expect(neverDb.openCalls).toBe(opensAfterFirst);
  });

  it("(d) write-through put() is a no-op once the store is latched off", async () => {
    const { idb } = await freshModules();
    (globalThis as any).indexedDB = neverDb;

    // Latch it off via a timed-out read.
    const r = idb.idbGet("/data/Z.json");
    await vi.advanceTimersByTimeAsync(idb.IDB_READ_TIMEOUT_MS + 5);
    await r;
    expect(idb._isIdbDead()).toBe(true);
    const opensAfterRead = neverDb.openCalls;

    // A put must now short-circuit: it must not open IDB and must resolve (no-op).
    await idb.idbPut("/data/Z.json", [1, 2, 3], Date.now());
    await vi.advanceTimersByTimeAsync(0);
    expect(neverDb.openCalls).toBe(opensAfterRead); // put opened nothing
  });
});
