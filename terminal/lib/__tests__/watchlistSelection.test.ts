import { describe, expect, it } from "vitest";

import {
  copyWatchlistSelection,
  moveWatchlistSelection,
  pruneWatchlistSelection,
  resolveWatchlistContextSelection,
  resolveWatchlistSelection,
} from "@/lib/watchlistSelection";

const visualOrder = ["AAPL", "MSFT", "NVDA", "AMD", "QQQ"];

describe("watchlist range and discontiguous selection", () => {
  it("selects an inclusive Shift range in visual order", () => {
    expect([...resolveWatchlistSelection({
      current: new Set(), anchor: "MSFT", target: "AMD", visualOrder,
      range: true, toggle: false,
    })]).toEqual(["MSFT", "NVDA", "AMD"]);
  });

  it("unions Cmd/Ctrl+Shift ranges and toggles nonconsecutive rows", () => {
    const toggled = resolveWatchlistSelection({
      current: new Set(["AAPL"]), anchor: "AAPL", target: "QQQ", visualOrder,
      range: false, toggle: true,
    });
    expect([...toggled]).toEqual(["AAPL", "QQQ"]);

    const union = resolveWatchlistSelection({
      current: toggled, anchor: "MSFT", target: "AMD", visualOrder,
      range: true, toggle: true,
    });
    expect([...union]).toEqual(["AAPL", "QQQ", "MSFT", "NVDA", "AMD"]);
  });

  it("keeps an existing selection on right-click and retargets an unselected row", () => {
    const selected = new Set(["AAPL", "NVDA"]);
    expect([...resolveWatchlistContextSelection(selected, "NVDA")]).toEqual(["AAPL", "NVDA"]);
    expect([...resolveWatchlistContextSelection(selected, "AMD")]).toEqual(["AMD"]);
  });

  it("clears bulk state for a plain navigation click and prunes removed rows", () => {
    expect(resolveWatchlistSelection({
      current: new Set(["AAPL", "NVDA"]), anchor: "AAPL", target: "MSFT", visualOrder,
      range: false, toggle: false,
    }).size).toBe(0);
    expect([...pruneWatchlistSelection(new Set(["AAPL", "NVDA"]), [
      { symbol: "NVDA", section: "Growth" },
    ])]).toEqual(["NVDA"]);
  });
});

describe("watchlist bulk mutations", () => {
  const rows = [
    { symbol: "AAPL", section: "Core" },
    { symbol: "MSFT", section: "Core" },
    { symbol: "NVDA", section: "Growth" },
    { symbol: "AMD", section: "Growth" },
    { symbol: "QQQ", section: "Funds" },
  ];

  it("moves selected rows to an existing section in visible order", () => {
    expect(moveWatchlistSelection(rows, new Set(["MSFT", "AMD"]), "Funds", visualOrder)).toEqual([
      { symbol: "AAPL", section: "Core" },
      { symbol: "NVDA", section: "Growth" },
      { symbol: "QQQ", section: "Funds" },
      { symbol: "MSFT", section: "Funds" },
      { symbol: "AMD", section: "Funds" },
    ]);
  });

  it("copies exactly the selected rows in visual order without mutating the source", () => {
    const copied = copyWatchlistSelection(rows, new Set(["QQQ", "AAPL", "NVDA"]), visualOrder);
    expect(copied).toEqual([
      { symbol: "AAPL", section: "Core" },
      { symbol: "NVDA", section: "Growth" },
      { symbol: "QQQ", section: "Funds" },
    ]);
    copied[0]!.section = "Changed";
    expect(rows[0]!.section).toBe("Core");
  });
});
