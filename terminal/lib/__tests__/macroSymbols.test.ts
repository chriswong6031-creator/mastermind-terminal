import { describe, it, expect } from "vitest";
import { isMacroSymbol, macroKind } from "../macroSymbols";
import { classify } from "../intradayShared";
import { marketOf } from "../markets";

describe("isMacroSymbol — shape routing", () => {
  it("claims indices, rates, futures, FX and the dollar index", () => {
    for (const s of ["^GSPC", "^VIX", "^TNX", "^HSI", "GC=F", "CL=F", "ES=F", "EURUSD=X", "USDCNH=X", "DX-Y.NYB"]) {
      expect(isMacroSymbol(s), s).toBe(true);
    }
  });

  it("does NOT claim equities, ETFs, or crypto — they keep their existing live legs", () => {
    for (const s of ["NVDA", "SPY", "BRK-B", "BTC-USD", "0700.HK", "600519.SS", "SHOP.TO", "AZN.L"]) {
      expect(isMacroSymbol(s), s).toBe(false);
    }
  });

  it("leaves mainland-China indices on the Tencent leg", () => {
    // These match the A-share pattern and Tencent serves indices under the same sh/sz codes, so
    // routing them to the delayed Yahoo leg would DOWNGRADE a live quote.
    for (const s of ["000001.SS", "000300.SS", "399001.SZ", "399006.SZ"]) {
      expect(isMacroSymbol(s), s).toBe(false);
      expect(classify(s)).toBe("cn");
    }
  });

  it("classifies kinds, filing benchmark yields apart from price indices", () => {
    expect(macroKind("^GSPC")).toBe("index");
    expect(macroKind("^VIX")).toBe("index");
    expect(macroKind("^TNX")).toBe("rate");
    expect(macroKind("^TYX")).toBe("rate");
    expect(macroKind("GC=F")).toBe("future");
    expect(macroKind("EURUSD=X")).toBe("fx");
    expect(macroKind("DX-Y.NYB")).toBe("fx");
    expect(macroKind("NVDA")).toBe(null);
  });
});

describe("macro symbols under the market filter", () => {
  it("files each index with the market it belongs to, so switching a market off hides it", () => {
    // An index is part of a market like any listed name — a user who turned Hong Kong off
    // should not still see the Hang Seng.
    expect(marketOf("^HSI", { mkt: "HKEX", sec: "Indices" })).toBe("hk");
    expect(marketOf("000300.SS", { mkt: "SSE", sec: "Indices" })).toBe("cn");
    expect(marketOf("^GSPTSE", { mkt: "TSX", sec: "Indices" })).toBe("ca");
    expect(marketOf("^GSPC", { mkt: "US", sec: "Indices" })).toBe("us");
    expect(marketOf("^N225", { mkt: "Japan", sec: "Indices" })).toBe("intl");
  });

  it("keeps FX and commodities with US, the market a US-only user has on", () => {
    // They belong to no single exchange; stranding them in `intl` would hide gold and the
    // dollar index from exactly the trader most likely to want them.
    expect(marketOf("DX-Y.NYB", { mkt: "US", sec: "Forex" })).toBe("us");
    expect(marketOf("GC=F", { mkt: "US", sec: "Futures" })).toBe("us");
  });

  it("routes the added crypto majors to the crypto group", () => {
    expect(marketOf("DOGE-USD", { mkt: "Crypto", sec: "Crypto" })).toBe("crypto");
  });
});
