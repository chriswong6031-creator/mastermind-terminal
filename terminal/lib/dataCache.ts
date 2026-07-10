/**
 * dataCache.ts — client-side JSON cache for Terminal data files.
 *
 * CONTRACT (§0.2, §3 of BUILD-SPEC):
 *   - SINGLE AUTHOR: frontend agent.  ChartPanel + TerminalShell are pure consumers.
 *   - Provides getJSON/prefetch/peek/invalidate/getOhlc/getSlice/getSliceAndOhlc.
 *   - Inflight-request deduplication (collapse double slice fetch).
 *   - TTL = 60 s, stale-while-revalidate by default.
 *   - Never stores null responses — on null/error the key is evicted so the next call retries.
 *   - LRU cap ~400 entries.
 *   - SSR-safe: prefetch is a no-op on the server; getJSON works (no window APIs needed).
 */

type Entry = { data: any; ts: number; inflight: Promise<any> | null };

const store = new Map<string, Entry>();

// In-session 404 negative cache: a URL that 404'd is never re-fetched in the same
// session (across ALL call sites). This eliminates the "KRUS.intel.json fetched
// dozens of times" pattern where dataCache evicts the null entry on each !r.ok
// response so the next symbol switch or watchlist hover re-requests it.
// TTL = session lifetime (never evicted while the tab is open).
const neg404 = new Set<string>();

export interface GetOpts {
  ttl?: number;   // milliseconds; default 60_000
  swr?: boolean;  // stale-while-revalidate; default true
}

const DEFAULT_TTL = 60_000;

// ── LRU eviction: delete the oldest entry when the store exceeds 400 items ──
function evictOldest(): void {
  if (store.size <= 400) return;
  // Map iteration order is insertion order; first item is oldest.
  const first = store.keys().next().value;
  if (first !== undefined) store.delete(first);
}

// ── Touch an entry (move to end = most-recently-used) ──
function touch(url: string, entry: Entry): void {
  store.delete(url);
  store.set(url, entry);
}

// ── Core fetch: issues the request, writes/evicts on settle ──
function doFetch(url: string, entry: Entry): Promise<any> {
  const inflight: Promise<any> = fetch(url)
    .then((r) => {
      if (r.ok) return r.json();
      // Only permanently suppress on true 404/410 (resource does not exist).
      // 5xx / 429 / network errors are transient — let the entry evict so the
      // next call retries, which is strictly better than the pre-D2 behaviour.
      if (r.status === 404 || r.status === 410) neg404.add(url);
      return null;
    })
    .catch(() => null)
    .then((data) => {
      // Only commit if this specific inflight is still the one registered.
      const current = store.get(url);
      if (current && current.inflight === inflight) {
        if (data === null || data === undefined) {
          // Never pin null — clear the key so the next call retries.
          // (neg404 prevents the URL from being refetched in-session.)
          store.delete(url);
        } else {
          const committed: Entry = { data, ts: Date.now(), inflight: null };
          touch(url, committed);
        }
      }
      return data;
    });

  entry.inflight = inflight;
  store.delete(url);
  store.set(url, entry);
  evictOldest();
  return inflight;
}

/**
 * getJSON — the core cache primitive.
 *
 * Algorithm:
 *   0. In-session 404 → return null immediately (never refetch).
 *   1. Inflight request present → return it (deduplication).
 *   2. Fresh (now - ts < ttl) → return cached data immediately.
 *   3. Stale + swr=true → kick off background revalidate; return stale data.
 *   4. Otherwise → fetch synchronously (caller awaits).
 */
export async function getJSON(url: string, opts?: GetOpts): Promise<any> {
  // 0. In-session 404 negative cache — never re-request a URL that returned !r.ok.
  if (neg404.has(url)) return null;

  const ttl = opts?.ttl ?? DEFAULT_TTL;
  const swr = opts?.swr ?? true;
  const now = Date.now();

  const entry = store.get(url);

  if (entry) {
    // 1. Deduplicate in-flight requests.
    if (entry.inflight !== null) {
      return entry.inflight;
    }

    const age = now - entry.ts;

    // 2. Fresh — serve from cache.
    if (age < ttl) {
      touch(url, entry);
      return Promise.resolve(entry.data);
    }

    // 3. Stale + swr — serve stale, revalidate in background.
    if (swr) {
      // Schedule background revalidation (microtask so the stale data is
      // returned to the caller before the fetch starts).
      const staleData = entry.data;
      const bgEntry: Entry = { data: staleData, ts: entry.ts, inflight: null };
      doFetch(url, bgEntry); // fire-and-forget
      return Promise.resolve(staleData);
    }
  }

  // 4. Miss or expired (swr=false): blocking fetch.
  const fresh: Entry = { data: null, ts: 0, inflight: null };
  return doFetch(url, fresh);
}

/**
 * prefetch — warm the cache without blocking the caller.
 * No-op on the server (SSR-safe).
 */
export function prefetch(url: string, opts?: GetOpts): void {
  if (typeof window === "undefined") return;
  // Don't prefetch URLs that already 404'd this session.
  if (neg404.has(url)) return;

  const ttl = opts?.ttl ?? DEFAULT_TTL;
  const now = Date.now();
  const entry = store.get(url);

  // Already in-flight or fresh — nothing to do.
  if (entry) {
    if (entry.inflight !== null) return;
    if (now - entry.ts < ttl) return;
  }

  const fresh: Entry = { data: entry?.data ?? null, ts: entry?.ts ?? 0, inflight: null };
  doFetch(url, fresh);
}

/**
 * peek — synchronous cache read; undefined if not cached.
 */
export function peek(url: string): any | undefined {
  const entry = store.get(url);
  return entry?.data;
}

/**
 * invalidate — remove one key (or all keys if url is omitted).
 * Also clears the 404 negative-cache entry so the URL can be re-requested.
 */
export function invalidate(url?: string): void {
  if (url === undefined) {
    store.clear();
    neg404.clear();
  } else {
    store.delete(url);
    neg404.delete(url);
  }
}

/** Test/HMR hook — expose the 404 negative cache for test assertions. */
export function _neg404Has(url: string): boolean {
  return neg404.has(url);
}

export function _clearNeg404(): void {
  neg404.clear();
}

// ── Convenience helpers ──

// ── Coverage index ──────────────────────────────────────────────────────────
//
// coverage.json is written by scripts/build_data_coverage.py after each ingest
// run. When present the client uses it to pre-seed the neg404 cache so a symbol
// outside the deep-coverage universe never generates a network request at all.
//
// Shape: { intel: string[], fund: string[], opts: string[], ohlc: string[] }
//
// When absent (local dev before the first ingest, or the script hasn't run yet)
// we fall back gracefully — the runtime neg404 cache still prevents repeat 404s
// within a session.
let coverageLoaded = false;

/**
 * loadCoverage — fetch coverage.json once per session and pre-seed neg404 for
 * any symbol×suffix combination NOT listed as covered.  Call from a useEffect
 * in TerminalShell with the current manifest symbol list.
 *
 * Idempotent: subsequent calls before the first resolves are no-ops; calls after
 * it resolves are also no-ops (coverageLoaded flag).
 */
let coverageInflight: Promise<void> | null = null;
export function loadCoverage(manifestSymbols: string[]): void {
  if (typeof window === "undefined") return;   // SSR-safe
  if (coverageLoaded || coverageInflight) return;

  const SUFFIXES: Record<string, string> = {
    intel: ".intel.json",
    fund:  ".fund.json",
    opts:  ".opts.json",
  };

  // Maximum age (ms) we trust coverage.json for pre-seeding.
  // If coverage is stale we fall back to runtime-only neg404, which is safe.
  const COVERAGE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

  coverageInflight = fetch("/data/coverage.json")
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null)
    .then((cov) => {
      coverageLoaded = true;
      if (!cov || typeof cov !== "object") return;   // absent or malformed → no-op

      // Freshness gate (MAJOR-2): stale coverage.json can permanently suppress URLs
      // whose files were added after the last ingest run.  Only pre-seed neg404 when
      // coverage.as_of is recent enough to be trusted.
      if (typeof cov.as_of === "string") {
        const covAge = Date.now() - new Date(cov.as_of).getTime();
        if (covAge > COVERAGE_MAX_AGE_MS) return;  // stale → skip pre-seeding; runtime neg404 still works
      }

      for (const [key, suffix] of Object.entries(SUFFIXES)) {
        const covered = new Set<string>(Array.isArray(cov[key]) ? cov[key] : []);
        // Pre-seed neg404 for every manifest symbol NOT in this coverage list.
        for (const sym of manifestSymbols) {
          if (!covered.has(sym)) {
            neg404.add(`/data/${sym}${suffix}`);
          }
        }
      }
    });
}

/** Test hook — reset coverage state between tests. */
export function _resetCoverage(): void {
  coverageLoaded = false;
  coverageInflight = null;
}

/** Fetch a symbol's OHLC file: /data/<sym>.json */
export function getOhlc(sym: string): Promise<any> {
  return getJSON("/data/" + sym + ".json");
}

/** Fetch a symbol's slice file: /data/<sym>.slice.json */
export function getSlice(sym: string): Promise<any> {
  return getJSON("/data/" + sym + ".slice.json");
}

/**
 * getSliceAndOhlc — parallel fetch with shared inflight deduplication.
 * ChartPanel calls this; if TerminalShell already triggered getSlice,
 * the slice request collapses onto the same inflight Promise.
 */
export async function getSliceAndOhlc(sym: string): Promise<{ ohlc: any; slice: any }> {
  const [ohlc, slice] = await Promise.all([getOhlc(sym), getSlice(sym)]);
  return { ohlc, slice };
}

/**
 * getCompositeOhlc — fetch multiple leg OHLC files in parallel.
 * Returns an array aligned with the `legs` input.
 * Legs with missing data resolve as null.
 */
export async function getCompositeOhlc(legs: string[]): Promise<(any | null)[]> {
  return Promise.all(legs.map((leg) => getOhlc(leg).catch(() => null)));
}
