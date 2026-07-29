import { describe, it, expect } from "vitest";
import {
  marketOf, readMarketPrefs, defaultEnabledFor, toggleMarket, setFollowedMarkets,
  isSymbolVisible, scoreSymbol, serializeMarketPrefs, displayName, MARKET_IDS,
  FOLLOW_IDS, sanitizeFollowed, followedMarketSet, homeFromFollowed, marketToFollow,
  type FollowId, type MarketId, type MarketPrefs,
} from "../markets";
import { classify } from "../intradayShared";

/** MarketPrefs literal without repeating `followed: []` in every fixture. */
const P = (p: Partial<MarketPrefs>): MarketPrefs =>
  ({ home: null, enabled: [...MARKET_IDS], autoNarrowed: false, followed: [], ...p });

/** The 4th scoreSymbol argument, spelled the way callers build it. */
const boost = (...f: FollowId[]) => followedMarketSet(f);

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

describe("toggleMarket", () => {
  const base = P({ home: "us", enabled: ["us", "cn", "crypto"], autoNarrowed: true });

  it("refuses to disable the home market", () => {
    expect(toggleMarket(base, "us")).toBe(base);
  });

  it("refuses to empty the enabled set", () => {
    const one = P({ home: null, enabled: ["cn"] });
    expect(toggleMarket(one, "cn")).toBe(one);
  });

  it("clears autoNarrowed once the user edits by hand — we stop explaining our own default", () => {
    expect(toggleMarket(base, "hk").autoNarrowed).toBe(false);
  });

  it("adds and removes non-home markets", () => {
    expect(toggleMarket(base, "hk").enabled).toContain("hk");
    expect(toggleMarket(base, "cn").enabled).not.toContain("cn");
  });

  it("leaves the follow list alone — visibility and follows are separate choices", () => {
    const p = P({ home: "us", enabled: ["us", "crypto"], followed: ["us", "hk"] });
    expect(toggleMarket(p, "hk").followed).toEqual(["us", "hk"]);
  });

  it("round-trips through serialize → read unchanged", () => {
    const p = P({ home: "cn", enabled: ["cn", "hk", "crypto"], followed: ["cn"] });
    const back = readMarketPrefs({ ...serializeMarketPrefs(p), market_focus: p.followed } as never);
    expect(back.home).toBe("cn");
    expect(back.enabled.sort()).toEqual(["cn", "crypto", "hk"]);
    expect(back.followed).toEqual(["cn"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Followed markets — the `market_focus` contract shared with the macro dashboard.
// Operator ruling (2026-07-29): the single HOME market is retired. Search boosts every
// market the user follows; `markets.home` survives only as a derived compat field.
// ─────────────────────────────────────────────────────────────────────────────
describe("sanitizeFollowed", () => {
  it("keeps the macro vocabulary verbatim, INCLUDING 'global' (never 'intl')", () => {
    expect(sanitizeFollowed(["us", "cn", "hk", "ca", "global"])).toEqual([...FOLLOW_IDS]);
  });

  it("dedupes and preserves pick order", () => {
    expect(sanitizeFollowed(["hk", "us", "hk"])).toEqual(["hk", "us"]);
  });

  it("drops unknown ids and non-strings instead of poisoning the list", () => {
    expect(sanitizeFollowed(["us", "crypto", "moon", 7, null, { a: 1 }])).toEqual(["us"]);
  });

  it("normalizes the spellings older onboarding generations wrote", () => {
    expect(sanitizeFollowed(["China", " canada ", "international"])).toEqual(["cn", "ca", "global"]);
    expect(sanitizeFollowed(["intl"])).toEqual(["global"]);
  });

  it("returns [] for anything that is not an array", () => {
    for (const junk of [null, undefined, "us", 3, {}]) expect(sanitizeFollowed(junk)).toEqual([]);
  });
});

describe("followedMarketSet — the global→intl mapping", () => {
  it("maps 'global' to the intl bucket and the rest 1:1", () => {
    expect([...followedMarketSet(["global"])]).toEqual(["intl"]);
    expect([...followedMarketSet(["us", "hk"])].sort()).toEqual(["hk", "us"]);
  });

  it("never boosts crypto — it is an asset class, not a market you follow", () => {
    expect(followedMarketSet([...FOLLOW_IDS]).has("crypto")).toBe(false);
  });

  it("is empty for an empty / absent list", () => {
    expect(followedMarketSet([]).size).toBe(0);
    expect(followedMarketSet(null).size).toBe(0);
  });

  it("round-trips a market back to its follow id", () => {
    expect(marketToFollow("intl")).toBe("global");
    expect(marketToFollow("hk")).toBe("hk");
    expect(marketToFollow("crypto")).toBe(null);
    expect(marketToFollow(null)).toBe(null);
  });
});

describe("readMarketPrefs — the followed read path", () => {
  it("reads market_focus even when an explicit markets object is present", () => {
    // markets wins for home/enabled; market_focus is still the live follow list.
    const p = readMarketPrefs({
      market_focus: ["hk", "global"],
      markets: { home: "cn", enabled: ["cn", "hk"], autoNarrowed: false },
    });
    expect(p.followed).toEqual(["hk", "global"]);
    expect(p.enabled.sort()).toEqual(["cn", "hk"]);
  });

  it("falls back to [home] — mapped back to the macro vocabulary — when market_focus is absent", () => {
    expect(readMarketPrefs({ markets: { home: "hk", enabled: ["hk"], autoNarrowed: false } }).followed).toEqual(["hk"]);
    expect(readMarketPrefs({ markets: { home: "intl", enabled: ["intl"], autoNarrowed: false } }).followed).toEqual(["global"]);
  });

  it("follows nothing when there is no market_focus and no home", () => {
    expect(readMarketPrefs({ markets: { home: null, enabled: ["us"], autoNarrowed: false } }).followed).toEqual([]);
    expect(readMarketPrefs(null).followed).toEqual([]);
    expect(readMarketPrefs({ market_focus: ["nonsense"] }).followed).toEqual([]);
  });

  it("keeps 'global' followed even though it produces no home", () => {
    const p = readMarketPrefs({ market_focus: ["global"] });
    expect(p.followed).toEqual(["global"]);
    expect(p.home).toBe(null);
  });

  it("carries the signup follow list through the legacy migration branch", () => {
    expect(readMarketPrefs({ market_focus: ["us", "hk"] }).followed).toEqual(["us", "hk"]);
  });
});

describe("setFollowedMarkets — what gets written back", () => {
  const narrowed = P({ home: "us", enabled: ["us", "crypto"], autoNarrowed: true, followed: ["us"] });

  it("derives home from the first followed COUNTRY", () => {
    expect(homeFromFollowed(["hk", "us"])).toBe("hk");
    expect(setFollowedMarkets(narrowed, ["hk", "us"]).home).toBe("hk");
  });

  it("derives a NULL home when only 'global' is followed — global is not a country", () => {
    expect(homeFromFollowed(["global"])).toBe(null);
    expect(setFollowedMarkets(narrowed, ["global"]).home).toBe(null);
  });

  it("skips 'global' to reach the first real country", () => {
    expect(homeFromFollowed(["global", "ca"])).toBe("ca");
  });

  it("derives a NULL home from an empty list", () => {
    expect(setFollowedMarkets(narrowed, []).home).toBe(null);
  });

  it("does NOT rederive enabled from the follows — that is a Terminal-only choice", () => {
    // The macro dashboard DOES rewrite enabled here. We deliberately diverge: a user who narrowed
    // their searchable universe must not have it rewritten by editing an unrelated list.
    const next = setFollowedMarkets(narrowed, ["us", "cn", "hk"]);
    expect(next.enabled.sort()).toEqual(["crypto", "us"]);
    expect(next.autoNarrowed).toBe(true);   // the narrowing did not change, so neither does its explanation
  });

  it("still pulls the derived home into enabled — a hidden home would strand the user", () => {
    expect(setFollowedMarkets(narrowed, ["hk"]).enabled).toContain("hk");
  });

  it("sanitizes what it is handed", () => {
    expect(setFollowedMarkets(narrowed, ["us", "us", "moon"]).followed).toEqual(["us"]);
  });

  it("serializes to the exact pair of fields the macro dashboard reads", () => {
    const next = setFollowedMarkets(narrowed, ["hk", "global"]);
    expect({ market_focus: next.followed, ...serializeMarketPrefs(next) }).toEqual({
      market_focus: ["hk", "global"],
      markets: { home: "hk", enabled: ["us", "hk", "crypto"], autoNarrowed: true },
    });
  });
});

describe("isSymbolVisible", () => {
  const usOnly = P({ home: "us", enabled: ["us", "crypto"], autoNarrowed: true });

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

  it("boosts a followed market on an otherwise equal match", () => {
    const followed = scoreSymbol("0700.HK", row("Tencent", "HKEX"), "tencent", boost("hk"));
    const away = scoreSymbol("TCEHY", row("Tencent ADR", "NASDAQ"), "tencent", boost("hk"));
    expect(followed).toBeGreaterThan(away);
  });

  it("boosts EVERY followed market, not just the first — the retired home-market rule", () => {
    const both = boost("hk", "us");
    const hk = scoreSymbol("0700.HK", row("Tencent", "HKEX"), "tencent", both);
    const us = scoreSymbol("TCEHY", row("Tencent ADR", "NASDAQ"), "tencent", both);
    const cn = scoreSymbol("600519.SS", row("Tencent-ish", "SSE"), "tencent", both);
    expect(hk).toBe(us);               // following both means neither is demoted
    expect(hk).toBeGreaterThan(cn);    // an unfollowed market still is
  });

  it("maps a 'global' follow onto the intl bucket", () => {
    const g = boost("global");
    const intl = scoreSymbol("AZN.L", row("AstraZeneca bank", "United Kingdom"), "bank", g);
    const us = scoreSymbol("JPM", row("JPMorgan bank", "NYSE"), "bank", g);
    expect(intl).toBeGreaterThan(us);
    // "global" is a follow id, never a MarketId — a raw 'global' set must boost nothing.
    expect(scoreSymbol("AZN.L", row("AstraZeneca bank", "United Kingdom"), "bank", new Set(["global"] as unknown as MarketId[])))
      .toBe(scoreSymbol("JPM", row("JPMorgan bank", "NYSE"), "bank", null));
  });

  it("never boosts crypto, even for a user who follows everything", () => {
    const all = followedMarketSet([...FOLLOW_IDS]);
    expect(scoreSymbol("BTC-USD", row("Bitcoin", undefined), "bitcoin", all))
      .toBe(scoreSymbol("BTC-USD", row("Bitcoin", undefined), "bitcoin", null));
  });

  it("does NOT let the follow boost outrank what the user literally typed", () => {
    // A foreign EXACT ticker must still beat a followed-market substring hit. +60 has to stay
    // below the tightest tier gap (ticker-substring 400 → name-substring 200).
    const foreignExact = scoreSymbol("NVDA", row("NVIDIA", "NASDAQ"), "nvda", boost("cn"));
    const followedSubstring = scoreSymbol("300750.SZ", row("CATL nvda-ish", "SZSE"), "nvda", boost("cn"));
    expect(foreignExact).toBeGreaterThan(followedSubstring);
    expect(followedSubstring - scoreSymbol("300750.SZ", row("CATL nvda-ish", "SZSE"), "nvda", null)).toBe(60);
  });

  it("treats an absent / empty boost set as no personalization at all", () => {
    const plain = scoreSymbol("0700.HK", row("Tencent", "HKEX"), "tencent", null);
    expect(scoreSymbol("0700.HK", row("Tencent", "HKEX"), "tencent")).toBe(plain);
    expect(scoreSymbol("0700.HK", row("Tencent", "HKEX"), "tencent", boost())).toBe(plain);
  });

  it("returns -1 for no match", () => {
    expect(scoreSymbol("NVDA", row("NVIDIA", "NASDAQ"), "zzzz", null)).toBe(-1);
  });

  it("matches Chinese names", () => {
    expect(scoreSymbol("600519.SS", row("Kweichow Moutai", "SSE", "贵州茅台"), "贵州", null)).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// displayName — the language pick every row-rendering surface shares.
//
// The bug this replaces: every surface rendered `zh || name`, which prefers Chinese
// UNCONDITIONALLY. An English user looking at the watchlist, the screener, the portfolio
// table or a chart pane header saw "WTI原油" on a row whose `name` plainly read "WTI Crude
// Oil" — and every A-share and HK name the same way. The fix is one shared helper, so a
// component cannot drift back to preferring one language on its own.
// ─────────────────────────────────────────────────────────────────────────────
describe("displayName — language-aware row names", () => {
  const both = { name: "WTI Crude Oil", zh: "WTI原油" };

  it("shows the English name in English and the Chinese name in Chinese", () => {
    expect(displayName(both, "en")).toBe("WTI Crude Oil");
    expect(displayName(both, "zh")).toBe("WTI原油");
  });

  it("falls back to the other language rather than rendering a blank", () => {
    // Most US equities carry no zh; a handful of rows carry only zh.
    expect(displayName({ name: "NVIDIA" }, "zh")).toBe("NVIDIA");
    expect(displayName({ zh: "贵州茅台" }, "en")).toBe("贵州茅台");
  });

  it("returns an empty string for a missing row or a row with neither name", () => {
    expect(displayName(undefined, "en")).toBe("");
    expect(displayName(null, "zh")).toBe("");
    expect(displayName({}, "en")).toBe("");
    expect(displayName({ name: "", zh: "" }, "zh")).toBe("");
  });

  it("treats any non-'zh' language as the English branch", () => {
    // The Lang union is en|zh today; an unknown value must not silently flip to Chinese.
    expect(displayName(both, "")).toBe("WTI Crude Oil");
    expect(displayName(both, "fr")).toBe("WTI Crude Oil");
  });
});
