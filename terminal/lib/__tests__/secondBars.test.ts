// Second-resolution band (US equities, Massive "Stocks Advanced").
//
// The two tests that matter here pin defects that a green suite would otherwise never see:
//   1. `etDisplay` truncates to the minute. Stamping second bars with it collapses all 60 bars
//      of a minute onto one epoch, and fetchIntraday's ascending-unique pass then keeps exactly
//      ONE — a "1-second chart" that silently renders 1-minute data.
//   2. `tfMinutes` used to return 0 for any unrecognised timeframe. At "1s" that makes every
//      bucket-width consumer (`resample`, ChartPanel's `tfMinutes(tf) * 60` interval) divide by
//      or multiply by zero rather than fail loudly.

import { describe, it, expect } from "vitest";
import {
  SECOND_TFS, isSecondTf, isIntradayTf, tfSeconds, tfMinutes,
} from "@/lib/intradayShared";
import { etDisplay, etDisplaySec, etDateOf, etWallToUtcMs } from "@/lib/intradaySources";

describe("second timeframe taxonomy", () => {
  it("recognises the second band and keeps it inside 'intraday'", () => {
    for (const tf of SECOND_TFS) {
      expect(isSecondTf(tf), tf).toBe(true);
      // Every "is this an intraday chart" branch (session filter, live splice, axis) must say yes.
      expect(isIntradayTf(tf), tf).toBe(true);
    }
    expect(isSecondTf("1m")).toBe(false);
    expect(isSecondTf("D")).toBe(false);
  });

  it("measures every band in seconds", () => {
    expect(tfSeconds("1s")).toBe(1);
    expect(tfSeconds("30s")).toBe(30);
    expect(tfSeconds("5m")).toBe(300);
    expect(tfSeconds("4h")).toBe(14400);
    expect(tfSeconds("D")).toBe(0); // not an intraday tf — no width
  });

  it("returns a FRACTIONAL minute below a minute, never 0", () => {
    // The consumers multiply this by 60 to get a bucket width in seconds. A 0 here is a
    // degenerate bucket, not a small one.
    expect(tfMinutes("1s")).toBeCloseTo(1 / 60, 12);
    expect(tfMinutes("15s")).toBeCloseTo(0.25, 12);
    expect(tfMinutes("1s") * 60).toBe(1);
    expect(tfMinutes("30s") * 60).toBe(30);
    // Unchanged for the minute/hour band.
    expect(tfMinutes("5m")).toBe(5);
    expect(tfMinutes("2h")).toBe(120);
  });
});

describe("second-precision display epoch", () => {
  // 2026-08-07 09:30:00 EDT = 13:30:00Z. Display epoch = the ET wall clock read as if UTC.
  const base = Date.UTC(2026, 7, 7, 13, 30, 0);

  it("keeps seconds distinct — the whole reason etDisplay cannot be reused", () => {
    const a = etDisplaySec(base).epoch;
    const b = etDisplaySec(base + 1000).epoch;
    const c = etDisplaySec(base + 59_000).epoch;
    expect(b - a).toBe(1);
    expect(c - a).toBe(59);
    // The minute-precision helper collapses exactly these three onto one epoch.
    expect(etDisplay(base).epoch).toBe(etDisplay(base + 59_000).epoch);
  });

  it("emits the ET wall clock, not the UTC instant", () => {
    // 09:30:00 ET on 2026-08-07 → 2026-08-07T09:30:00Z as a display epoch.
    expect(etDisplaySec(base).epoch).toBe(Date.UTC(2026, 7, 7, 9, 30, 0) / 1000);
    expect(etDisplaySec(base).minOfDay).toBe(9 * 60 + 30);
  });
});

describe("etWallToUtcMs — session bounds without a timezone table", () => {
  it("resolves an EDT (summer) session open", () => {
    // 09:30 ET on 2026-08-07 is 13:30Z (UTC-4).
    expect(etWallToUtcMs("2026-08-07", 9 * 60 + 30)).toBe(Date.UTC(2026, 7, 7, 13, 30));
  });

  it("resolves an EST (winter) session open — the offset is derived, not assumed", () => {
    // 09:30 ET on 2026-01-15 is 14:30Z (UTC-5). A hard-coded -4 would be an hour out here,
    // which is how a "session window" silently starts before the open for four months a year.
    expect(etWallToUtcMs("2026-01-15", 9 * 60 + 30)).toBe(Date.UTC(2026, 0, 15, 14, 30));
  });

  it("resolves the extended-session bounds used by the fetcher", () => {
    expect(etWallToUtcMs("2026-08-07", 4 * 60)).toBe(Date.UTC(2026, 7, 7, 8, 0));   // 04:00 ET
    expect(etWallToUtcMs("2026-08-07", 20 * 60)).toBe(Date.UTC(2026, 7, 8, 0, 0));  // 20:00 ET
  });

  it("refuses an unparseable date rather than inventing a window", () => {
    expect(Number.isNaN(etWallToUtcMs("not-a-date", 570))).toBe(true);
  });
});

describe("etDateOf", () => {
  it("uses the ET calendar day, not the UTC one", () => {
    // 2026-08-08 01:00Z is still 2026-08-07 in New York (21:00 EDT). Getting this wrong is how a
    // session walk skips the session it is looking for.
    expect(etDateOf(Date.UTC(2026, 7, 8, 1, 0))).toBe("2026-08-07");
    expect(etDateOf(Date.UTC(2026, 7, 7, 14, 0))).toBe("2026-08-07");
  });
});
