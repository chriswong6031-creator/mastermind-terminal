// searchTrack.ts — client-side fire-and-forget beacon for committed ticker searches.
//
// CONTRACT: trackSearch(symbol, source, query?) posts one event to /api/track/search.
// Never throws, never blocks navigation (keepalive), silently no-ops on SSR.
// The server stamps time/user/anon-cookie/IP — the client sends only what it typed.
//
// Dedupe: the same symbol+source within 5s collapses to one event (Enter + click double-fires,
// re-renders). A NEW symbol always logs.

const recent = new Map<string, number>();
const DEDUPE_MS = 5_000;

export function trackSearch(symbol: string, source: string, query?: string): void {
  if (typeof window === "undefined") return;
  const sym = (symbol || "").trim().toUpperCase().slice(0, 64);
  if (!sym) return;

  const now = Date.now();
  const key = `${sym}|${source}`;
  const last = recent.get(key);
  if (last && now - last < DEDUPE_MS) return;
  recent.set(key, now);
  if (recent.size > 200) {
    for (const [k, t] of recent) if (now - t > DEDUPE_MS) recent.delete(k);
  }

  try {
    void fetch("/api/track/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ symbol: sym, source, query: query?.trim().slice(0, 128) || undefined }),
      keepalive: true,
      credentials: "same-origin",
    }).catch(() => {});
  } catch {
    /* tracking must never break the app */
  }
}
