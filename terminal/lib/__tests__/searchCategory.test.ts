import { describe, it, expect } from "vitest";
import { categoryBrowse, tabOf, BROWSE_CAP, type CatRow } from "@/lib/searchCategory";
import { DEFAULT_PREFS, type MarketPrefs } from "@/lib/markets";

// ─────────────────────────────────────────────────────────────────────────────
// The bug this covers: the search dialog rendered results only for a non-empty query, and
// search HISTORY otherwise. So selecting the "Crypto" tab and typing nothing showed whichever
// coins happened to be in RECENT — two of them — while 24 crypto rows sat in the manifest. It
// read as "this category has almost nothing in it" (reported 2026-07-27) rather than "type to
// search". A category tab now browses its category.
// ─────────────────────────────────────────────────────────────────────────────

const crypto = (sym: string): [string, CatRow] => [sym, { name: sym, sec: "Crypto", mkt: "Crypto" }];
const equity = (sym: string, mcap?: number): [string, CatRow] =>
  [sym, { name: sym, sec: "Equities", mkt: "NASDAQ", mcap }];

function manifest(...entries: [string, CatRow][]): Record<string, CatRow> {
  return Object.fromEntries(entries);
}

describe("tabOf — asset class to search tab", () => {
  it("maps the manifest asset class onto its tab", () => {
    expect(tabOf("BTC-USD", "Crypto")).toBe("Crypto");
    expect(tabOf("^GSPC", "Indices")).toBe("Indices");
    expect(tabOf("CL=F", "Futures")).toBe("Futures");
  });

  it("files anything unmapped — including equities — under Stocks", () => {
    expect(tabOf("NVDA", "Equities")).toBe("Stocks");
    expect(tabOf("WEIRD", "SomethingNew")).toBe("Stocks");
    expect(tabOf("WEIRD", undefined)).toBe("Stocks");
  });

  it("routes the known broad-market ETFs to Funds despite their Equities tag", () => {
    expect(tabOf("SPY", "Equities")).toBe("Funds");
    expect(tabOf("QQQ", "Equities")).toBe("Funds");
  });
});

describe("categoryBrowse — what an empty query shows under a category tab", () => {
  it("lists the category's symbols", () => {
    const m = manifest(crypto("BTC-USD"), crypto("ETH-USD"), crypto("DOGE-USD"), equity("NVDA"));
    expect(categoryBrowse(m, "Crypto")).toEqual(["BTC-USD", "ETH-USD", "DOGE-USD"]);
  });

  it("lists nothing for the All tab — that state is history plus the type-to-search hint", () => {
    const m = manifest(crypto("BTC-USD"), equity("NVDA"));
    expect(categoryBrowse(m, "All")).toEqual([]);
    expect(categoryBrowse(m, "")).toEqual([]);
  });

  it("excludes symbols already rendered in RECENT so nothing is listed twice", () => {
    const m = manifest(crypto("BTC-USD"), crypto("ETH-USD"), crypto("SOL-USD"));
    expect(categoryBrowse(m, "Crypto", { exclude: ["BTC-USD", "ETH-USD"] })).toEqual(["SOL-USD"]);
  });

  it("orders by market cap where the manifest carries one", () => {
    const m = manifest(equity("SMALL", 1e9), equity("HUGE", 4e12), equity("MID", 5e11));
    expect(categoryBrowse(m, "Stocks")).toEqual(["HUGE", "MID", "SMALL"]);
  });

  it("keeps manifest order for rows with no market cap, after the ranked ones", () => {
    // Macro/crypto rows carry no mcap and arrive in catalog order, which macro_catalog.py keeps
    // liquidity-ranked — so BTC/ETH lead the Crypto tab without a second ranking rule here.
    const m = manifest(crypto("BTC-USD"), crypto("ETH-USD"), crypto("SOL-USD"));
    expect(categoryBrowse(m, "Crypto")).toEqual(["BTC-USD", "ETH-USD", "SOL-USD"]);
  });

  it("ignores a non-positive or non-numeric market cap rather than sorting it to the top", () => {
    const m = manifest(equity("ZERO", 0), equity("REAL", 1e9), ["NAN", { sec: "Equities", mcap: NaN }]);
    expect(categoryBrowse(m, "Stocks")[0]).toBe("REAL");
  });

  it("caps the listing — the query is what narrows a big category", () => {
    const many = Array.from({ length: BROWSE_CAP + 25 }, (_, i) => crypto(`C${i}-USD`));
    expect(categoryBrowse(manifest(...many), "Crypto")).toHaveLength(BROWSE_CAP);
    expect(categoryBrowse(manifest(...many), "Crypto", { cap: 5 })).toHaveLength(5);
  });

  it("hides symbols from markets the user switched off, once prefs have loaded", () => {
    const prefs: MarketPrefs = { ...DEFAULT_PREFS, enabled: ["us"], home: "us" };
    const m = manifest(crypto("BTC-USD"), equity("NVDA"));
    expect(categoryBrowse(m, "Crypto", { marketPrefs: prefs, prefsReady: true })).toEqual([]);
    expect(categoryBrowse(m, "Stocks", { marketPrefs: prefs, prefsReady: true })).toEqual(["NVDA"]);
  });

  it("hides nothing before the account answers, so the first paint never drops a live market", () => {
    const prefs: MarketPrefs = { ...DEFAULT_PREFS, enabled: ["us"], home: "us" };
    const m = manifest(crypto("BTC-USD"));
    expect(categoryBrowse(m, "Crypto", { marketPrefs: prefs, prefsReady: false })).toEqual(["BTC-USD"]);
  });

  it("is stable across calls for rows sharing a market cap", () => {
    const m = manifest(equity("BBB", 1e9), equity("AAA", 1e9), equity("CCC", 1e9));
    expect(categoryBrowse(m, "Stocks")).toEqual(["AAA", "BBB", "CCC"]);
  });
});
