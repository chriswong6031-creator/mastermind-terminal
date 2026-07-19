import { describe, it, expect } from "vitest";
import type { Bar } from "../fund";
import {
  buildYears,
  windowActiveSet,
  windowYears,
  MAX_YEARS,
  DEFAULT_SEAS_WINDOW,
  type SeasWindow,
} from "../seasonal";

// ─────────────────────────────────────────────────────────────────────────────
// Bar fixtures — a synthetic daily series with FULL calendar-year control.
// We emit the last trading day of every month (enough for monthlyRet, which is
// close-to-close between month-lasts) plus a Jan-open bar where a distinct
// open matters for the January-definition test.
// ─────────────────────────────────────────────────────────────────────────────

const bar = (time: string, c: number, o = c): Bar => ({ time, o, h: c, l: c, c, v: 1 });

/** One bar per month (day 28) at the given close, for a full calendar year. */
function yearBars(year: number, closes: number[]): Bar[] {
  return closes.map((c, m) => bar(`${year}-${String(m + 1).padStart(2, "0")}-28`, c));
}

/** A flat year: every month closes at `level`. */
function flatYear(year: number, level: number): Bar[] {
  return yearBars(year, new Array(12).fill(level));
}

describe("windowYears / MAX_YEARS wiring", () => {
  it("MAX_YEARS is 10 (the default cap, wired — no longer dead)", () => {
    expect(MAX_YEARS).toBe(10);
    expect(DEFAULT_SEAS_WINDOW).toBe("10");
    expect(windowYears(DEFAULT_SEAS_WINDOW)).toBe(10);
  });
  it("presets map to their span; max is Infinity", () => {
    expect(windowYears("5")).toBe(5);
    expect(windowYears("15")).toBe(15);
    expect(windowYears("max")).toBe(Infinity);
  });
});

describe("windowActiveSet — default active window", () => {
  // 15 complete years (2008..2022) + a partial current year (2023).
  const bars: Bar[] = [];
  for (let y = 2008; y <= 2022; y++) bars.push(...flatYear(y, 100));
  bars.push(...yearBars(2023, [100, 101, 102, 103, 104, 105])); // partial: Jan..Jun only
  const years = buildYears(bars);
  const isCurrent = years[years.length - 1];

  it("marks the last year as the current (partial) year", () => {
    expect(isCurrent.year).toBe("2023");
    expect(isCurrent.isCurrent).toBe(true);
  });

  it("10Y default keeps last 10 COMPLETE years + the current YTD (11 total)", () => {
    const set = windowActiveSet(years, "10");
    expect(set.size).toBe(11); // 2013..2022 (10 complete) + 2023 (current)
    expect(set.has("2023")).toBe(true); // current year always included
    expect(set.has("2013")).toBe(true); // 10th-most-recent complete year
    expect(set.has("2012")).toBe(false); // 11th-back complete year excluded
    expect(set.has("2008")).toBe(false); // deep history excluded
  });

  it("5Y keeps last 5 complete + current (6 total)", () => {
    const set = windowActiveSet(years, "5");
    expect(set.size).toBe(6);
    expect(set.has("2018")).toBe(true);
    expect(set.has("2017")).toBe(false);
  });

  it("Max returns every year (complete + current)", () => {
    const set = windowActiveSet(years, "max");
    expect(set.size).toBe(years.length); // all 16
    expect(set.has("2008")).toBe(true);
  });
});

describe("windowActiveSet — edge: young listing shorter than the window", () => {
  // Only 3 complete years + a partial current year.
  const bars: Bar[] = [];
  for (let y = 2021; y <= 2023; y++) bars.push(...flatYear(y, 50));
  bars.push(...yearBars(2024, [50, 51, 52])); // partial current
  const years = buildYears(bars);

  it("returns all available years when there are fewer complete years than the window", () => {
    const set = windowActiveSet(years, "10");
    expect(set.size).toBe(years.length); // 4 (nothing to drop)
    expect(set.has("2021")).toBe(true);
    expect(set.has("2024")).toBe(true);
  });
});

describe("windowActiveSet — edge: exactly the window length", () => {
  // Exactly 10 complete years + current.
  const bars: Bar[] = [];
  for (let y = 2014; y <= 2023; y++) bars.push(...flatYear(y, 10));
  bars.push(...yearBars(2024, [10, 11])); // partial current
  const years = buildYears(bars);

  it("keeps all 10 complete years + current when count == window", () => {
    const set = windowActiveSet(years, "10");
    expect(set.size).toBe(11);
    expect(set.has("2014")).toBe(true); // oldest complete year retained
    expect(set.has("2024")).toBe(true);
  });
});

describe("windowActiveSet — edge: all history complete (no partial current year)", () => {
  // 12 complete years, last one is also the "current" (buildYears marks the
  // max year current regardless of partiality).
  const bars: Bar[] = [];
  for (let y = 2010; y <= 2021; y++) bars.push(...flatYear(y, 5));
  const years = buildYears(bars);

  it("treats the most-recent year as current and windows the rest", () => {
    const set = windowActiveSet(years, "5");
    // 5 complete (2016..2020) + current (2021) → 6
    expect(set.has("2021")).toBe(true);
    expect(set.has("2016")).toBe(true);
    expect(set.has("2015")).toBe(false);
  });

  it("empty bars → empty set", () => {
    expect(windowActiveSet(buildYears([]), "10").size).toBe(0);
  });
});

describe("buildYears — January return uses prior-Dec close (not intra-Jan open→close)", () => {
  // 2020: flat at 100 all year → Dec 2020 close = 100.
  // 2021: opens the year with a different Jan OPEN (90) but Jan CLOSE = 110;
  //       remaining months flat at 110.
  const bars: Bar[] = [
    ...flatYear(2020, 100),
    // Jan 2021: open 90, close 110 (a distinct open so the two definitions differ)
    bar("2021-01-28", 110, 90),
    ...yearBars(2021, [0, 110, 110, 110, 110, 110, 110, 110, 110, 110, 110, 110]).slice(1),
  ];
  const years = buildYears(bars);
  const y2021 = years.find((y) => y.year === "2021")!;

  it("Jan 2021 return = Jan close / prev-Dec close − 1 = 110/100 − 1 = +10%", () => {
    // OLD (buggy) definition would be 110/90 − 1 ≈ +22.2% (intra-January move).
    expect(y2021.monthlyRet[0]).toBeCloseTo(10, 5);
  });

  it("Feb..Dec unchanged: Feb 2021 = 110/110 − 1 = 0%", () => {
    expect(y2021.monthlyRet[1]).toBeCloseTo(0, 5);
  });

  it("first-ever year (no prior Dec) falls back to Jan open so the series still starts", () => {
    // 2020 is the first year → no prevDec; Jan uses its own open (100/100 = 0%).
    const y2020 = years.find((y) => y.year === "2020")!;
    expect(y2020.monthlyRet[0]).toBeCloseTo(0, 5);
  });

  it("full-year compound now includes the Dec→Jan gap (true full-year return)", () => {
    // 2021 compound: +10% in Jan, 0% after → ~+10%.
    expect(y2021.yearRet).toBeCloseTo(10, 4);
  });
});

describe("buildYears — full history is always emitted (windowing is a UI default)", () => {
  const bars: Bar[] = [];
  for (let y = 1990; y <= 2023; y++) bars.push(...flatYear(y, 1));
  const years = buildYears(bars);
  it("keeps every calendar year so per-year chips remain toggleable", () => {
    expect(years.length).toBe(2023 - 1990 + 1); // 34 years, uncapped
    expect(years[0].year).toBe("1990");
  });
  it("but the default active window narrows it to MAX_YEARS + current", () => {
    const set = windowActiveSet(years, DEFAULT_SEAS_WINDOW as SeasWindow);
    expect(set.size).toBe(MAX_YEARS + 1); // 10 complete + current
  });
});
