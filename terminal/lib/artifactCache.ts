import type { ArtifactState } from "@/lib/portfolioRisk";

// Round-2 review MAJOR 3: restores caching on the per-ticker macro artifact fetch, WITHOUT the
// ambiguity that made the previous pass remove it. `route.ts` used to rely on Next's own fetch
// Data Cache (`next: { revalidate: 900 }`); once every fetch started carrying a per-caller
// session cookie, that cache's key was an unverified bet — either it folds request headers in
// (unbounded near-zero-hit-rate entries, one per session token) or it doesn't (one caller's
// locked/unlocked result served to a different caller for up to 15 minutes). Rather than guess,
// this module owns its OWN cache, keyed explicitly by (ticker, a digest of the caller's cookie),
// so two different callers — or the same caller signed out vs signed in — can never share an
// entry, and single-flight dedupe means N concurrent reloads for the SAME key never fire more
// than one upstream fetch while the first is still in flight.
//
// The cookie is never stored verbatim — only a fixed-length, non-reversible digest — so a cache
// entry can never leak a session token even if this process's memory were inspected.

const TTL_MS = 15 * 60 * 1000;

interface Entry {
  value: ArtifactState;
  expiresAt: number;
}

const store = new Map<string, Entry>();
const inflight = new Map<string, Promise<ArtifactState>>();

function cookieDigest(cookieHeader: string | null): string {
  if (!cookieHeader) return "anon";
  // A small, fast, non-cryptographic digest is sufficient — this is a cache-partitioning key,
  // never a security boundary (the boundary is "never store the cookie itself").
  let hash = 0;
  for (let i = 0; i < cookieHeader.length; i++) {
    hash = (Math.imul(31, hash) + cookieHeader.charCodeAt(i)) | 0;
  }
  return `c${hash}`;
}

function keyOf(ticker: string, cookieHeader: string | null): string {
  return `${ticker.toUpperCase()}::${cookieDigest(cookieHeader)}`;
}

/**
 * Read-through, single-flight cache for one artifact read. Returns an unexpired cached value
 * when one exists; otherwise calls `fetcher` — at most once per key even when several callers
 * race for the same (ticker, cookie) while the first call is still in flight — and remembers
 * whatever it resolves to (including a `locked`/`missing`/`unreadable` state, which is itself a
 * meaningful, cacheable fact) for `TTL_MS`.
 */
export async function getCachedArtifact(
  ticker: string,
  cookieHeader: string | null,
  fetcher: () => Promise<ArtifactState>,
): Promise<ArtifactState> {
  const key = keyOf(ticker, cookieHeader);
  const now = Date.now();

  const hit = store.get(key);
  if (hit && hit.expiresAt > now) return hit.value;

  const pending = inflight.get(key);
  if (pending) return pending;

  const promise = fetcher()
    .then((value) => {
      store.set(key, { value, expiresAt: Date.now() + TTL_MS });
      return value;
    })
    .finally(() => {
      inflight.delete(key);
    });
  inflight.set(key, promise);
  return promise;
}

/** Test-only: clears every cached and in-flight entry. Without this, unit tests that reuse the
 *  same ticker across `it` blocks with different mocked upstream responses would silently read
 *  back an earlier test's cached value instead of exercising their own mock. */
export function resetArtifactCache(): void {
  store.clear();
  inflight.clear();
}
