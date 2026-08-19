/**
 * D1 — the search field's placeholder is a CAPABILITY PROMISE, and it has to be true.
 *
 * The placeholder used to read "Symbol, ISIN, or CUSIP" (and "代码、ISIN或CUSIP") while
 * scoreSymbol — the whole of the search ranking contract — only ever sees `sym`, `name`
 * (English), `zh`, `mkt` and `sec`. There is no ISIN or CUSIP field anywhere in it, so a user
 * who pasted an ISIN *because the product told them to* got "No match" from a feature that
 * does not exist. The data was not missing; the capability was.
 *
 * These tests pin both halves of the fix so they cannot drift apart again:
 *   1. the promise names only what is implemented (both languages), and
 *   2. everything it does promise genuinely resolves.
 *
 * If identifier lookup is ever built (it needs licensed first-party identifier data), the
 * right change is to extend scoreSymbol AND this test AND the copy together — re-adding the
 * words alone puts the lie straight back.
 */
import { describe, it, expect } from "vitest";
import { LEX } from "@/lib/i18n";
import { scoreSymbol } from "@/lib/markets";

const AAPL = { name: "Apple Inc.", zh: "苹果公司", mkt: "NASDAQ", sec: "Stock" };
// A real ISIN and CUSIP for Apple. They are inert here on purpose: even carried on the row,
// no search path can reach them.
const APPLE_ISIN = "us0378331005";
const APPLE_CUSIP = "037833100";

describe("D1 — search advertises only implemented identifiers", () => {
  it("the placeholder promises no identifier the engine cannot search, in EN and ZH", () => {
    const [en, zh] = LEX.searchInputPlaceholder;
    for (const copy of [en, zh]) {
      expect(copy).not.toMatch(/isin/i);
      expect(copy).not.toMatch(/cusip/i);
    }
    // …and still says what the field is for, rather than going blank.
    expect(en.trim().length).toBeGreaterThan(0);
    expect(zh.trim().length).toBeGreaterThan(0);
  });

  it("the ranking contract genuinely has no identifier field to match (why the copy changed)", () => {
    const rowWithIdentifiers = { ...AAPL, isin: APPLE_ISIN, cusip: APPLE_CUSIP };
    expect(scoreSymbol("AAPL", rowWithIdentifiers, APPLE_ISIN, null)).toBe(-1);
    expect(scoreSymbol("AAPL", rowWithIdentifiers, APPLE_CUSIP, null)).toBe(-1);
  });
});

describe("D1 — everything the placeholder still promises resolves", () => {
  it("exact ticker outranks every weaker match tier", () => {
    expect(scoreSymbol("AAPL", AAPL, "aapl", null)).toBe(1000);
  });

  it("ticker prefix matches", () => {
    expect(scoreSymbol("AAPL", AAPL, "aap", null)).toBeGreaterThan(0);
  });

  it("English company name matches by prefix and by substring", () => {
    expect(scoreSymbol("AAPL", AAPL, "apple", null)).toBeGreaterThan(0);
    expect(scoreSymbol("AAPL", AAPL, "inc", null)).toBeGreaterThan(0);
  });

  it("Chinese name matches regardless of display language", () => {
    expect(scoreSymbol("AAPL", AAPL, "苹果", null)).toBeGreaterThan(0);
  });

  it("a genuine non-match is still a non-match", () => {
    expect(scoreSymbol("AAPL", AAPL, "zzzzz", null)).toBe(-1);
  });
});
