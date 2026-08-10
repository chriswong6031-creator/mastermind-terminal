import { describe, expect, it } from "vitest";
import {
  formatWatchlistChange,
  formatWatchlistPrice,
  resolveWatchlistQuote,
} from "@/lib/watchlistQuote";

describe("resolveWatchlistQuote", () => {
  it("uses the live regular-session lane instead of the nightly manifest", () => {
    expect(resolveWatchlistQuote(
      { last: 184.2, chg: -0.4 },
      { regularPrice: 191.45, regularChg: 1.73, last: 194.8, chg: 3.5 },
    )).toEqual({ price: 191.45, change: 1.73, source: "quote" });
  });

  it("keeps the official close primary when a raw after-hours print is present", () => {
    expect(resolveWatchlistQuote(
      { last: 380, chg: 0 },
      { last: 421.14, chg: 7.84, close: 390.54, prevClose: 393.33 },
    )).toEqual({
      price: 390.54,
      change: expect.closeTo(-0.7093, 4),
      source: "quote",
    });
  });

  it("falls back to the manifest without labelling it as a quote", () => {
    expect(resolveWatchlistQuote({ last: 88.1, chg: -2.25 }, null))
      .toEqual({ price: 88.1, change: -2.25, source: "manifest" });
    expect(resolveWatchlistQuote(undefined, null))
      .toEqual({ price: null, change: null, source: "none" });
  });
});

describe("watchlist quote formatting", () => {
  it("uses compact exchange-style precision and signed percentage change", () => {
    expect(formatWatchlistPrice(191.45)).toBe("191.45");
    expect(formatWatchlistPrice(4.2)).toBe("4.2000");
    expect(formatWatchlistChange(1.73)).toBe("+1.73%");
    expect(formatWatchlistChange(-0.4)).toBe("-0.40%");
    expect(formatWatchlistPrice(null)).toBe("—");
  });
});
