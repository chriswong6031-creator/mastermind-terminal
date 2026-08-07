import { describe, it, expect } from "vitest";
import { isMacroSymbol, macroKind, macroDisplayTz, macroOnEtAxis } from "../macroSymbols";
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

/** Every index whose session runs on a clock other than US Eastern. */
const INTL = [
  "^N225", "^KS11", "^TWII", "^HSI", "^HSCE", "^FTSE",
  "^GDAXI", "^FCHI", "^STOXX50E", "^BSESN", "^AXJO",
];

describe("macroDisplayTz — which wall clock a symbol's intraday axis runs on", () => {
  // The chart's display epoch is the market-local wall clock read AS IF it were UTC. Stamping a
  // Nikkei bar with the ET reading plotted the Tokyo session at 20:00–02:00 on its own axis.
  //
  // Spelled out longhand rather than looped over the source map: this list is the SYNC PIN
  // against _INDICES in ingest/macro_catalog.py — an international index added there with no
  // timezone here should fail a test, not silently render in US Eastern time.
  it("maps every international index to its home zone", () => {
    expect(macroDisplayTz("^N225")).toBe("Asia/Tokyo");
    expect(macroDisplayTz("^KS11")).toBe("Asia/Seoul");
    expect(macroDisplayTz("^TWII")).toBe("Asia/Taipei");
    expect(macroDisplayTz("^HSI")).toBe("Asia/Hong_Kong");
    expect(macroDisplayTz("^HSCE")).toBe("Asia/Hong_Kong");
    expect(macroDisplayTz("^FTSE")).toBe("Europe/London");
    expect(macroDisplayTz("^GDAXI")).toBe("Europe/Berlin");
    expect(macroDisplayTz("^FCHI")).toBe("Europe/Paris");
    expect(macroDisplayTz("^STOXX50E")).toBe("Europe/Amsterdam");
    expect(macroDisplayTz("^BSESN")).toBe("Asia/Kolkata");
    expect(macroDisplayTz("^AXJO")).toBe("Australia/Sydney");
  });

  it("defaults US indices, yields, FX and futures to Eastern time", () => {
    // ^GSPTSE is deliberately UNMAPPED, not overlooked: Toronto trades the same Eastern wall
    // clock as New York (09:30–16:00), so the TSX composite belongs on the ET axis.
    for (const s of ["^GSPC", "^VIX", "^TNX", "GC=F", "ES=F", "EURUSD=X", "DX-Y.NYB", "^GSPTSE"]) {
      expect(macroDisplayTz(s), s).toBe("America/New_York");
      expect(macroOnEtAxis(s), s).toBe(true);
    }
  });

  it("reports every international index as OFF the ET axis, so US session bands stay off it", () => {
    // macroOnEtAxis is the precondition ChartPanel checks before painting US RTH shading; a
    // `true` here would tint arbitrary slices of the Tokyo or London session.
    for (const s of INTL) expect(macroOnEtAxis(s), s).toBe(false);
  });

  it("names only real IANA zones", () => {
    // A typo'd zone must fail HERE, not throw a RangeError inside the intraday fetch in prod.
    for (const s of INTL) {
      expect(() => new Intl.DateTimeFormat("en-US", { timeZone: macroDisplayTz(s) }), s).not.toThrow();
    }
  });

  it("looks up trim- and case-insensitively", () => {
    expect(macroDisplayTz("^n225")).toBe("Asia/Tokyo");
    expect(macroDisplayTz(" ^N225 ")).toBe("Asia/Tokyo");
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
