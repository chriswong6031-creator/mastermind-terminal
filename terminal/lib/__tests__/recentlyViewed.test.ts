import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  RECENTLY_VIEWED_KEY,
  RECENTLY_VIEWED_LIMIT,
  clearRecentlyViewed,
  getRecentlyViewed,
  prependRecentlyViewed,
  pushRecentlyViewed,
} from "@/lib/recentlyViewed";

function stubStorage() {
  const store = new Map<string, string>();
  (globalThis as unknown as { localStorage: unknown }).localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
  };
  return store;
}

describe("recentlyViewed", () => {
  let store: Map<string, string>;

  beforeEach(() => { store = stubStorage(); });
  afterEach(() => { delete (globalThis as unknown as { localStorage?: unknown }).localStorage; });

  it("stores the latest 100 unique chart views, most-recent first", () => {
    for (let i = 0; i < RECENTLY_VIEWED_LIMIT + 7; i++) pushRecentlyViewed(`sym${i}`);

    const viewed = getRecentlyViewed();
    expect(viewed).toHaveLength(100);
    expect(viewed[0]).toBe("SYM106");
    expect(viewed.at(-1)).toBe("SYM7");
  });

  it("moves a repeated symbol to the front and normalizes symbols", () => {
    expect(prependRecentlyViewed(["NVDA", " aapl ", "NVDA"], " aapl ")).toEqual(["AAPL", "NVDA"]);
  });

  it("does not relabel retired search history as recently viewed", () => {
    store.set("mm.searchHistory", JSON.stringify(["SEARCHED-ONLY"]));
    expect(getRecentlyViewed()).toEqual([]);
    expect(store.has(RECENTLY_VIEWED_KEY)).toBe(false);
  });

  it("clears only the recently viewed list", () => {
    store.set("mm.searchHistory", JSON.stringify(["LEGACY"]));
    pushRecentlyViewed("NVDA");
    clearRecentlyViewed();

    expect(getRecentlyViewed()).toEqual([]);
    expect(store.get("mm.searchHistory")).toBe(JSON.stringify(["LEGACY"]));
  });
});
