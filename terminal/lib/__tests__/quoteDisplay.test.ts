import { describe, expect, it } from "vitest";
import { resolveRegularSessionDisplay, withRegularSessionDisplay } from "@/lib/quoteDisplay";

describe("regular-session quote display", () => {
  it("uses the live regular quote during RTH", () => {
    expect(resolveRegularSessionDisplay({ last: 201.25, chg: 3.18, prevClose: 195.04 })).toEqual({
      regularPrice: 201.25,
      regularChg: 3.18,
    });
  });

  it("pins the primary lane to the official close after hours", () => {
    expect(resolveRegularSessionDisplay({
      last: 204.8,
      chg: 5.0,
      close: 200.81,
      prevClose: 195.04,
    })).toEqual({
      regularPrice: 200.81,
      regularChg: ((200.81 - 195.04) / 195.04) * 100,
    });
  });

  it("keeps the completed session percentage before the next open", () => {
    expect(resolveRegularSessionDisplay({
      last: 195.04,
      chg: 0,
      prevClose: 195.04,
      prevSessionChg: 2.65,
    })).toEqual({ regularPrice: 195.04, regularChg: 2.65 });
  });

  it("replaces the A-share primary lane with the opening-auction price before 09:30", () => {
    expect(resolveRegularSessionDisplay({
      market: "cn",
      marketSession: "pre",
      last: 11.74,
      chg: 0,
      close: 11.74,
      prevClose: 11.74,
      auctionPrice: 11.90,
      auctionChg: 1.362862010221463,
    })).toEqual({ regularPrice: 11.90, regularChg: 1.362862010221463 });
  });

  it("never interprets a US pre-market print as an A-share auction", () => {
    expect(resolveRegularSessionDisplay({
      market: "us",
      marketSession: "pre",
      last: 200.81,
      chg: 2.96,
      auctionPrice: 205.00,
      auctionChg: 5.1,
    })).toEqual({ regularPrice: 200.81, regularChg: 2.96 });
  });

  it("never lets extended fields enter the primary lane", () => {
    const exposed = withRegularSessionDisplay({
      last: 200.81,
      chg: 2.96,
      extPrice: 199.79,
      extChg: -0.51,
      extSession: "post",
    });
    expect(exposed.regularPrice).toBe(200.81);
    expect(exposed.regularChg).toBe(2.96);
    expect(exposed.extPrice).toBe(199.79);
    expect(exposed.extChg).toBe(-0.51);
  });

  it("treats missing and invalid prices as absent", () => {
    expect(resolveRegularSessionDisplay({ last: 0, chg: Number.NaN, close: null })).toEqual({
      regularPrice: null,
      regularChg: null,
    });
  });
});
