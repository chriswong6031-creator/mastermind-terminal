// RED-first (round-2 review MAJOR 3): restore caching on the artifact fetch, keyed by
// (ticker, cookie), 15-minute window, single-flight dedupe for concurrent reads.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { getCachedArtifact, resetArtifactCache } from "@/lib/artifactCache";
import type { ArtifactState } from "@/lib/portfolioRisk";

beforeEach(() => {
  resetArtifactCache();
  vi.useRealTimers();
});

const READ = (n: number): ArtifactState => ({
  kind: "read",
  facts: { ticker: "AAPL", sector: "Energy", marketCap: n, thinlyTraded: null },
});

describe("getCachedArtifact", () => {
  it("N reloads for the same (ticker, cookie) inside the window produce ONE upstream fetch", async () => {
    const fetcher = vi.fn(async () => READ(1));
    for (let i = 0; i < 5; i++) {
      const v = await getCachedArtifact("AAPL", "sb-x=1", fetcher);
      expect(v).toEqual(READ(1));
    }
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("single-flight: N concurrent reloads for the same key while the first fetch is in flight also produce ONE upstream fetch", async () => {
    let resolveFetch: (v: ArtifactState) => void = () => {};
    const fetcher = vi.fn(
      () => new Promise<ArtifactState>((resolve) => { resolveFetch = resolve; }),
    );
    const calls = Array.from({ length: 8 }, () => getCachedArtifact("AAPL", "sb-x=1", fetcher));
    // Give the microtask queue a turn so every call has had a chance to check the cache/inflight
    // map before the upstream fetch resolves.
    await Promise.resolve();
    resolveFetch(READ(2));
    const results = await Promise.all(calls);
    expect(fetcher).toHaveBeenCalledTimes(1);
    for (const r of results) expect(r).toEqual(READ(2));
  });

  it("a different cookie for the SAME ticker is a different cache entry — never cross-caller leakage", async () => {
    const fetcher = vi.fn(async () => READ(1));
    await getCachedArtifact("AAPL", "sb-caller-a=1", fetcher);
    await getCachedArtifact("AAPL", "sb-caller-b=2", fetcher);
    await getCachedArtifact(
      "AAPL",
      null, // anonymous — also its own partition, distinct from either signed-in caller
      fetcher,
    );
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("expires after the TTL window — a stale entry is refetched", async () => {
    vi.useFakeTimers();
    try {
      const fetcher = vi.fn(async () => READ(1));
      await getCachedArtifact("AAPL", "sb-x=1", fetcher);
      vi.advanceTimersByTime(15 * 60 * 1000 + 1);
      await getCachedArtifact("AAPL", "sb-x=1", fetcher);
      expect(fetcher).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not cache forever within the window boundary — well inside 15 minutes it still hits cache", async () => {
    vi.useFakeTimers();
    try {
      const fetcher = vi.fn(async () => READ(1));
      await getCachedArtifact("AAPL", "sb-x=1", fetcher);
      vi.advanceTimersByTime(14 * 60 * 1000);
      await getCachedArtifact("AAPL", "sb-x=1", fetcher);
      expect(fetcher).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
