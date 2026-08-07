import { describe, it, expect } from "vitest";
import {
  marketOf, scoreSymbol, isSymbolVisible, readMarketPrefs, followedMarketSet,
  type FollowId, type MarketId, type MarketPrefs,
} from "../markets";
import MANIFEST from "./fixtures/manifestMarkets.json";

// Cross-market behaviour against REAL production manifest rows (venue strings and all), not
// hand-written ones. The fixture is a 37-symbol slice of the live app.mastermind-x.com manifest
// covering every group: NASDAQ/NYSE/AMEX/US, SSE/SZSE, HKEX, TSX, the international tail
// (United Kingdom / Japan / India / South Korea / Taiwan) and Crypto.
//
// Why this exists separately from markets.test.ts: the unit tests prove the rules, this proves the
// rules survive contact with the venue vocabulary the manifest actually ships.

type Row = { name?: string; mkt?: string; sec?: string; zh?: string };
const M = MANIFEST as Record<string, Row>;

// Mirrors SearchModal's pipeline: filter by `enabled`, rank with the followed-market boost set
// hoisted once (never rebuilt per row).
const search = (q: string, prefs: MarketPrefs) => {
  const ql = q.toLowerCase();
  const boosted = followedMarketSet(prefs.followed);
  return Object.entries(M)
    .filter(([s, r]) => isSymbolVisible(s, r, prefs))
    .map(([s, r]) => [s, scoreSymbol(s, r, ql, boosted)] as const)
    .filter(([, sc]) => sc >= 0)
    .sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)
    .map(([s]) => s);
};

const EVERY: MarketId[] = ["us", "cn", "hk", "ca", "intl", "crypto"];
const prefs = (followed: FollowId[], enabled: MarketId[] = EVERY): MarketPrefs =>
  ({ home: null, enabled, autoNarrowed: false, followed });
const ALL = prefs([]);

describe("classification over the real manifest", () => {
  it("assigns every fixture symbol to the expected group", () => {
    const got: Record<string, MarketId> = {};
    for (const [s, r] of Object.entries(M)) got[s] = marketOf(s, r);

    expect(got["NVDA"]).toBe("us");
    expect(got["JPM"]).toBe("us");
    expect(got["BHB"]).toBe("us");       // AMEX
    expect(got["SPY"]).toBe("us");       // mkt:"US", sec:"Funds"
    expect(got["600519.SS"]).toBe("cn");
    expect(got["002594.SZ"]).toBe("cn");
    expect(got["0700.HK"]).toBe("hk");
    expect(got["SHOP.TO"]).toBe("ca");
    expect(got["AZN.L"]).toBe("intl");
    expect(got["8035.T"]).toBe("intl");
    expect(got["2330.TW"]).toBe("intl");
    expect(got["005930.KS"]).toBe("intl");
    expect(got["BTC-USD"]).toBe("crypto");
  });

  it("classifies crypto from mkt alone, without relying on sec", () => {
    // The manifest sets both; a row carrying only mkt:"Crypto" must not fall through to intl.
    expect(marketOf("BTC-USD", { mkt: "Crypto" })).toBe("crypto");
  });

  it("leaves no fixture symbol unclassified", () => {
    for (const [s, r] of Object.entries(M)) {
      expect(["us", "cn", "hk", "ca", "intl", "crypto"]).toContain(marketOf(s, r));
    }
  });
});

describe("a US-following signup", () => {
  // The exact state readMarketPrefs produces for someone who ticked only "us" at onboarding.
  const usOnly = readMarketPrefs({ market_focus: ["us"] });

  it("starts with every market searchable", () => {
    for (const sym of ["600519.SS", "0700.HK", "SHOP.TO", "AZN.L", "8035.T"]) {
      expect(isSymbolVisible(sym, M[sym], usOnly)).toBe(true);
    }
  });

  it("still reaches US names and crypto", () => {
    expect(isSymbolVisible("NVDA", M["NVDA"], usOnly)).toBe(true);
    expect(isSymbolVisible("BTC-USD", M["BTC-USD"], usOnly)).toBe(true);
  });

  it("finds foreign-market companies by name", () => {
    expect(search("tencent", usOnly)).toEqual(["0700.HK"]);
    expect(search("moutai", usOnly)).toEqual(["600519.SS"]);
  });
});

describe("followed-market ranking", () => {
  it("reorders same-tier matches by the followed markets", () => {
    // "bank" matches several banks only through their NAME (same score tier), so the follow boost
    // is what decides their relative order. HDFCBANK.NS outranks all of them either way — "bank"
    // is inside its TICKER, a strictly better match — which is the intended precedence and the
    // reason the boost is smaller than one tier.
    const cnFirst = search("bank", prefs(["cn"]));
    const caFirst = search("bank", prefs(["ca"]));

    const rank = (list: string[], sym: string) => list.indexOf(sym);
    // Agricultural Bank of China (cn) vs Royal Bank of Canada (ca): each leads when it is followed.
    expect(rank(cnFirst, "601288.SS")).toBeLessThan(rank(cnFirst, "RY.TO"));
    expect(rank(caFirst, "RY.TO")).toBeLessThan(rank(caFirst, "601288.SS"));
  });

  it("promotes EVERY followed market over the ones the user does not follow", () => {
    // The point of retiring the single home market: a CN+CA user gets both banks ahead of the
    // US one, where the old rule could only ever promote one of them.
    const both = search("bank", prefs(["cn", "ca"]));
    const firstUs = both.findIndex((s) => marketOf(s, M[s]) === "us");
    expect(both.indexOf("601288.SS")).toBeLessThan(firstUs);
    expect(both.indexOf("RY.TO")).toBeLessThan(firstUs);
  });

  it("ranks a China user's A-share bank above the US bank for the same query", () => {
    const cn = search("bank", prefs(["cn"]));
    const firstCn = cn.findIndex((s) => marketOf(s, M[s]) === "cn");
    const firstUs = cn.findIndex((s) => marketOf(s, M[s]) === "us");
    expect(firstCn).toBeGreaterThanOrEqual(0);
    expect(firstUs).toBeGreaterThanOrEqual(0);
    expect(firstCn).toBeLessThan(firstUs);
  });

  it("maps a 'global' follow onto the international tail", () => {
    // "inc" is a NAME substring for Apple/Salesforce/Alphabet/Visa (us), Shopify (ca) and
    // Mitsubishi UFJ (Japan → intl): one score tier, so the boost alone decides the order.
    expect(search("inc", prefs(["global"]))[0]).toBe("8306.T");
    expect(search("inc", ALL)[0]).toBe("V");   // unfollowed, the shortest ticker wins the tie
  });

  it("never lets the follow boost beat an exact ticker the user typed", () => {
    // A China-following user typing NVDA gets NVDA, not a Chinese name.
    expect(search("nvda", prefs(["cn"]))[0]).toBe("NVDA");
    expect(search("aapl", prefs(["hk"]))[0]).toBe("AAPL");
  });

  it("ranks the exact ticker first even when other names contain the string", () => {
    expect(search("v", ALL)[0]).toBe("V");   // Visa, not every name containing "v"
  });
});

describe("search ordering is deterministic", () => {
  it("returns a stable order across repeated calls", () => {
    const a = search("a", ALL);
    const b = search("a", ALL);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(3);
  });
});
