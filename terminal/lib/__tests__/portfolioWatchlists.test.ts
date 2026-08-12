import { describe, expect, it } from "vitest";

import {
  buildServerPortfolioWatchlists,
  resolveActivePortfolioWatchlist,
  resolvePortfolioWatchlists,
} from "@/lib/portfolioWatchlists";

describe("portfolio watchlist source contract", () => {
  it("groups every owner-scoped server list in list and symbol position order", () => {
    expect(buildServerPortfolioWatchlists(
      [
        { id: "income", name: "Income", position: 2 },
        { id: "default", name: "Default", position: 0 },
        { id: "duplicate-name", name: "Default", position: 3 },
      ],
      [
        { watchlist_id: "default", symbol: "NVDA", position: 2 },
        { watchlist_id: "default", symbol: "AAPL", position: 0 },
        { watchlist_id: "default", symbol: "AAPL", position: 1 },
        { watchlist_id: "income", symbol: "QQQ", position: 0 },
        { watchlist_id: "not-owned", symbol: "SPY", position: 0 },
      ],
    )).toEqual([
      { id: "default", name: "Default", symbols: ["AAPL", "NVDA"] },
      { id: "income", name: "Income", symbols: ["QQQ"] },
    ]);
  });

  it("reconciles same-name local and server lists without dropping empty or local-only lists", () => {
    const resolved = resolvePortfolioWatchlists(
      [
        { id: "default", name: "Default", symbols: ["NVDA", "AAPL"] },
        { id: "income", name: "Income", symbols: ["QQQ"] },
      ],
      JSON.stringify({
        lists: {
          Default: [{ symbol: "AAPL", section: "Core" }, { symbol: "MSFT", section: "Core" }],
          Swing: [{ symbol: "TSLA", section: "Tactical" }],
          Empty: [],
        },
        active: "Swing",
        meta: { Swing: { sections: ["Tactical"], collapsed: [] } },
      }),
    );

    expect(resolved).toEqual({
      lists: [
        { id: "default", name: "Default", symbols: ["AAPL", "MSFT", "NVDA"] },
        { id: "local:Swing", name: "Swing", symbols: ["TSLA"] },
        { id: "local:Empty", name: "Empty", symbols: [] },
        { id: "income", name: "Income", symbols: ["QQQ"] },
      ],
      preferredActiveId: "local:Swing",
    });
  });

  it("W1b: a MIGRATED named list reads server-canonical; Default keeps the TRAP-1 local order", () => {
    const resolved = resolvePortfolioWatchlists(
      [
        { id: "default", name: "Default", symbols: ["NVDA", "AAPL"] },
        { id: "gold", name: "Gold Miners", symbols: ["NEM", "AEM"] },
      ],
      JSON.stringify({
        lists: {
          Default: [{ symbol: "AAPL", section: "Core" }],
          // Local order disagrees with the server's, and carries one row whose add has not
          // reached the server yet.
          "Gold Miners": [{ symbol: "AEM", section: "Miners" }, { symbol: "GOLD", section: "Miners" }],
        },
        active: "Gold Miners",
      }),
    );

    expect(resolved.lists).toEqual([
      // Default: the server knows MEMBERSHIP, not ORDER — local order still wins.
      { id: "default", name: "Default", symbols: ["AAPL", "NVDA"] },
      // Named list: server position wins for shared rows, local-only rows append after them.
      { id: "gold", name: "Gold Miners", symbols: ["NEM", "AEM", "GOLD"] },
    ]);
    expect(resolved.preferredActiveId).toBe("gold");
  });

  it("fails closed from malformed local state to server state", () => {
    const server = [{ id: "default", name: "Default", symbols: ["NVDA"] }];
    expect(resolvePortfolioWatchlists(server, "{not-json")).toEqual({
      lists: server,
      preferredActiveId: "default",
    });
    expect(resolvePortfolioWatchlists(server, JSON.stringify({ lists: { Broken: "NVDA" }, active: "Broken" }))).toEqual({
      lists: server,
      preferredActiveId: "default",
    });
  });

  it("renders one honest empty Default when neither source has a valid list", () => {
    expect(resolvePortfolioWatchlists([], null)).toEqual({
      lists: [{ id: "local:Default", name: "Default", symbols: [] }],
      preferredActiveId: "local:Default",
    });
  });
});

describe("portfolio watchlist selection", () => {
  it("keeps a valid current selection ahead of the stored preference", () => {
    const lists = [
      { id: "default", name: "Default", symbols: [] },
      { id: "local:Swing", name: "Swing", symbols: [] },
    ];
    expect(resolveActivePortfolioWatchlist(lists, "default", "local:Swing")).toBe("default");
  });

  it("falls back to the stored active list and then the first survivor", () => {
    const before = resolvePortfolioWatchlists([], JSON.stringify({
      lists: { Default: [], Swing: [{ symbol: "MSFT" }] },
      active: "Swing",
    }));
    const after = resolvePortfolioWatchlists([], JSON.stringify({
      lists: { Default: [] },
      active: "Missing",
    }));

    expect(before.preferredActiveId).toBe("local:Swing");
    expect(resolveActivePortfolioWatchlist(
      after.lists,
      before.preferredActiveId,
      after.preferredActiveId,
    )).toBe("local:Default");
    expect(resolveActivePortfolioWatchlist(after.lists, "missing", "also-missing")).toBe("local:Default");
  });

  it("returns a signed-in stale active name to Default even when a custom list is first", () => {
    const resolved = resolvePortfolioWatchlists(
      [{ id: "default", name: "Default", symbols: ["NVDA"] }],
      JSON.stringify({
        lists: { Swing: [{ symbol: "MSFT" }] },
        active: "Deleted",
      }),
    );

    expect(resolved.lists.map((list) => list.name)).toEqual(["Swing", "Default"]);
    expect(resolved.preferredActiveId).toBe("default");
  });
});
