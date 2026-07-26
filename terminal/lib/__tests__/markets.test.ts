import { describe, it, expect } from "vitest";
import {
  marketOf, readMarketPrefs, defaultEnabledFor, toggleMarket, setHomeMarket,
  isSymbolVisible, scoreSymbol, serializeMarketPrefs, MARKET_IDS, type MarketPrefs,
} from "../markets";
import { classify } from "../intradayShared";

describe("marketOf — venue mapping", () => {
  it("maps the production manifest's venue strings to groups", () => {
    expect(marketOf("NVDA", { mkt: "NASDAQ" })).toBe("us");
    expect(marketOf("BRK-B", { mkt: "NYSE" })).toBe("us");
    expect(marketOf("600519.SS", { mkt: "SSE" })).toBe("cn");
    expect(marketOf("000001.SZ", { mkt: "SZSE" })).toBe("cn");
    expect(marketOf("0700.HK", { mkt: "HKEX" })).toBe("hk");
    expect(marketOf("SHOP.TO", { mkt: "TSX" })).toBe("ca");
  });

  it("routes UNMAPPED venues to intl, never silently to us", () => {
    // The manifest's long tail is country names, and new venues appear without code changes.
    for (const v of ["United Kingdom", "Japan", "India", "South Korea", "Taiwan", "Australia", "Sweden"]) {
      expect(marketOf("XXX", { mkt: v })).toBe("intl");
    }
  });

  it("lets sec=Crypto win over any venue", () => {
    expect(marketOf("BTC-USD", { mkt: "NASDAQ", sec: "Crypto" })).toBe("crypto");
  });

  it("falls back to symbol shape when mkt is absent", () => {
    expect(marketOf("AAPL", {})).toBe("us");
    expect(marketOf("BTC-USD", {})).toBe("crypto");
    expect(marketOf("600519.SS", {})).toBe("cn");
    expect(marketOf("0700.HK", {})).toBe("hk");
    expect(marketOf("SHOP.TO", {})).toBe("ca");
    expect(marketOf("7203.T", {})).toBe("intl");
    expect(marketOf("BP.L", {})).toBe("intl");
  });

  it("agrees with intradayShared.classify so data-routing and search cannot disagree", () => {
    // classify() has no `intl`/`ca`-suffix breadth, so only compare the markets it models.
    for (const sym of ["AAPL", "600519.SS", "000001.SZ", "0700.HK", "BTC-USD", "SHOP.TO"]) {
      expect(marketOf(sym, {})).toBe(classify(sym));
    }
  });
});

describe("defaultEnabledFor — the US-only-signup rule", () => {
  it("narrows a US-ONLY signup to US + crypto", () => {
    const r = defaultEnabledFor(["us"]);
    expect(r.enabled.sort()).toEqual(["crypto", "us"]);
    expect(r.autoNarrowed).toBe(true);
  });

  it("keeps crypto for a US-only signup — a US trader who holds BTC must not lose it", () => {
    expect(defaultEnabledFor(["us"]).enabled).toContain("crypto");
  });

  it("does NOT narrow China / HK / Canada signups", () => {
    for (const m of ["cn", "hk", "ca"] as const) {
      const r = defaultEnabledFor([m]);
      expect(r.enabled).toEqual([...MARKET_IDS]);
      expect(r.autoNarrowed).toBe(false);
    }
  });

  it("does not narrow a multi-market signup that includes the US", () => {
    expect(defaultEnabledFor(["us", "hk"]).autoNarrowed).toBe(false);
  });
});

describe("readMarketPrefs — legacy market_focus migration", () => {
  it("migrates a US-only signup and applies the narrowing", () => {
    const p = readMarketPrefs({ market_focus: ["us"] });
    expect(p.home).toBe("us");
    expect(p.enabled.sort()).toEqual(["crypto", "us"]);
    expect(p.autoNarrowed).toBe(true);
  });

  it("migrates a China signup with everything left on", () => {
    const p = readMarketPrefs({ market_focus: ["cn"] });
    expect(p.home).toBe("cn");
    expect(p.enabled).toEqual([...MARKET_IDS]);
    expect(p.autoNarrowed).toBe(false);
  });

  it("treats the onboarding 'global' chip as everything-on", () => {
    const p = readMarketPrefs({ market_focus: ["global"] });
    expect(p.enabled).toEqual([...MARKET_IDS]);
  });

  it("lets an explicit markets object WIN over a stale market_focus", () => {
    // Otherwise narrowing in settings would be reverted on next load by the signup-time array.
    const p = readMarketPrefs({
      market_focus: ["us"],
      markets: { home: "cn", enabled: ["cn", "hk"], autoNarrowed: false },
    });
    expect(p.home).toBe("cn");
    expect(p.enabled.sort()).toEqual(["cn", "hk"]);
  });

  it("degrades to everything-visible on absent or malformed metadata", () => {
    for (const meta of [null, undefined, {}, { market_focus: "nonsense" }, { market_focus: [] }] as const) {
      expect(readMarketPrefs(meta as never).enabled).toEqual([...MARKET_IDS]);
    }
  });

  it("never returns an empty enabled set even if metadata says so", () => {
    const p = readMarketPrefs({ markets: { home: "hk", enabled: [], autoNarrowed: false } });
    expect(p.enabled.length).toBeGreaterThan(0);
    expect(p.enabled).toContain("hk");
  });

  it("always keeps home inside enabled", () => {
    const p = readMarketPrefs({ markets: { home: "ca", enabled: ["us"], autoNarrowed: false } });
    expect(p.enabled).toContain("ca");
  });
});

describe("toggleMarket / setHomeMarket", () => {
  const base: MarketPrefs = { home: "us", enabled: ["us", "cn", "crypto"], autoNarrowed: true };

  it("refuses to disable the home market", () => {
    expect(toggleMarket(base, "us")).toBe(base);
  });

  it("refuses to empty the enabled set", () => {
    const one: MarketPrefs = { home: null, enabled: ["cn"], autoNarrowed: false };
    expect(toggleMarket(one, "cn")).toBe(one);
  });

  it("clears autoNarrowed once the user edits by hand — we stop explaining our own default", () => {
    expect(toggleMarket(base, "hk").autoNarrowed).toBe(false);
  });

  it("adds and removes non-home markets", () => {
    expect(toggleMarket(base, "hk").enabled).toContain("hk");
    expect(toggleMarket(base, "cn").enabled).not.toContain("cn");
  });

  it("pulls the new home into enabled when it was hidden", () => {
    const p = setHomeMarket({ home: "us", enabled: ["us"], autoNarrowed: true }, "hk");
    expect(p.enabled).toContain("hk");
    expect(p.home).toBe("hk");
  });

  it("round-trips through serialize → read unchanged", () => {
    const p: MarketPrefs = { home: "cn", enabled: ["cn", "hk", "crypto"], autoNarrowed: false };
    const back = readMarketPrefs(serializeMarketPrefs(p) as never);
    expect(back.home).toBe("cn");
    expect(back.enabled.sort()).toEqual(["cn", "crypto", "hk"]);
  });
});

describe("isSymbolVisible", () => {
  const usOnly: MarketPrefs = { home: "us", enabled: ["us", "crypto"], autoNarrowed: true };

  it("hides a disabled market's symbols entirely", () => {
    expect(isSymbolVisible("0700.HK", { mkt: "HKEX" }, usOnly)).toBe(false);
    expect(isSymbolVisible("600519.SS", { mkt: "SSE" }, usOnly)).toBe(false);
  });

  it("keeps enabled markets visible", () => {
    expect(isSymbolVisible("NVDA", { mkt: "NASDAQ" }, usOnly)).toBe(true);
    expect(isSymbolVisible("BTC-USD", { sec: "Crypto" }, usOnly)).toBe(true);
  });
});

describe("scoreSymbol — ranking", () => {
  const row = (name: string, mkt?: string, zh?: string) => ({ name, mkt, zh });

  it("ranks an exact ticker above a name substring (the old unranked bug)", () => {
    const exact = scoreSymbol("AA", row("Alcoa Corp", "NYSE"), "aa", null);
    const sub = scoreSymbol("XYZ", row("Aaron's Holdings", "NYSE"), "aa", null);
    expect(exact).toBeGreaterThan(sub);
  });

  it("prefers the shorter ticker among prefix matches", () => {
    const short = scoreSymbol("TS", row("Tenaris", "NYSE"), "ts", null);
    const long = scoreSymbol("TSLARIGHTS", row("Whatever", "NYSE"), "ts", null);
    expect(short).toBeGreaterThan(long);
  });

  it("boosts the home market on an otherwise equal match", () => {
    const home = scoreSymbol("0700.HK", row("Tencent", "HKEX"), "tencent", "hk");
    const away = scoreSymbol("TCEHY", row("Tencent ADR", "NASDAQ"), "tencent", "hk");
    expect(home).toBeGreaterThan(away);
  });

  it("does NOT let the home boost outrank what the user literally typed", () => {
    // A foreign EXACT ticker must still beat a home-market substring hit.
    const foreignExact = scoreSymbol("NVDA", row("NVIDIA", "NASDAQ"), "nvda", "cn");
    const homeSubstring = scoreSymbol("300750.SZ", row("CATL nvda-ish", "SZSE"), "nvda", "cn");
    expect(foreignExact).toBeGreaterThan(homeSubstring);
  });

  it("returns -1 for no match", () => {
    expect(scoreSymbol("NVDA", row("NVIDIA", "NASDAQ"), "zzzz", null)).toBe(-1);
  });

  it("matches Chinese names", () => {
    expect(scoreSymbol("600519.SS", row("Kweichow Moutai", "SSE", "贵州茅台"), "贵州", null)).toBeGreaterThan(0);
  });
});
