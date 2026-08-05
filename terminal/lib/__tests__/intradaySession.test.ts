import { describe, expect, it } from "vitest";
import {
  filterBarsToSessionDate,
  filterUsEquitySession,
  resampleUsEquitySession,
  resampleSessionSegments,
  HK_SESSION_SEGMENTS,
  type Bar6,
} from "../intradayShared";

const day = Date.UTC(2026, 6, 30) / 1000;
const at = (hour: number, minute: number, value = hour * 100 + minute): Bar6 =>
  [day + hour * 3600 + minute * 60, value, value + 1, value - 1, value + 0.5, 10];

describe("US equity session routing", () => {
  it("keeps regular charts strictly inside 09:30–16:00 ET", () => {
    const bars = [at(4, 0), at(9, 29), at(9, 30), at(15, 59), at(16, 0), at(19, 59)];
    expect(filterUsEquitySession(bars, "regular").map((bar) => bar[0]))
      .toEqual([at(9, 30)[0], at(15, 59)[0]]);
  });

  it("keeps extended charts inside 04:00–20:00 ET", () => {
    const bars = [at(3, 59), at(4, 0), at(19, 59), at(20, 0)];
    expect(filterUsEquitySession(bars, "extended").map((bar) => bar[0]))
      .toEqual([at(4, 0)[0], at(19, 59)[0]]);
  });

  it("anchors regular hourly candles at 09:30 instead of mixing a 09:00 premarket bar", () => {
    const source = filterUsEquitySession([at(9, 0), at(9, 30), at(10, 0), at(10, 30)], "regular");
    const bars = resampleUsEquitySession(source, 60, "regular");
    expect(bars).toHaveLength(2);
    expect(bars[0][0]).toBe(at(9, 30)[0]);
    expect(bars[1][0]).toBe(at(10, 30)[0]);
    expect(bars[0][1]).toBe(at(9, 30)[1]);
  });
});

describe("Hong Kong session-segment resampling", () => {
  // One HKEX session of 1-minute prints: continuous trading 09:30–11:59 and 13:00–15:59, the single
  // lunch-boundary tick Tencent stamps at 12:00, and a closing-auction print at 16:02.
  const session: Bar6[] = [];
  for (let m = 9 * 60 + 30; m < 12 * 60; m++) session.push(at(Math.floor(m / 60), m % 60));
  session.push(at(12, 0));
  for (let m = 13 * 60; m < 16 * 60; m++) session.push(at(Math.floor(m / 60), m % 60));
  session.push(at(16, 2));

  it("anchors hourly candles to each segment open and folds the break and auction prints in", () => {
    const bars = resampleSessionSegments(session, 60, HK_SESSION_SEGMENTS);
    expect(bars.map((bar) => bar[0])).toEqual([
      at(9, 30)[0], at(10, 30)[0], at(11, 30)[0],   // morning: 09:30 open, 11:30 holds the 12:00 lunch tick
      at(13, 0)[0], at(14, 0)[0], at(15, 0)[0],     // afternoon: 15:00 holds the 16:02 auction print
    ]);
    // No stub candles: absolute-clock bucketing emitted 09:00, a one-print 12:00 and a 16:00 here.
    expect(bars.every((bar) => bar[5] > 10)).toBe(true);
  });

  it("emits exactly one four-hour candle per trading segment", () => {
    const bars = resampleSessionSegments(session, 240, HK_SESSION_SEGMENTS);
    expect(bars.map((bar) => bar[0])).toEqual([at(9, 30)[0], at(13, 0)[0]]);
    expect(bars[0][1]).toBe(at(9, 30)[1]);          // morning opens on the 09:30 print
    expect(bars[0][4]).toBe(at(12, 0)[4]);          // and closes on the last print before the break
    expect(bars[1][4]).toBe(at(16, 2)[4]);          // afternoon closes on the auction, like the daily bar
  });

  it("never lets a candle span the lunch break", () => {
    for (const minutes of [60, 120, 240]) {
      const bars = resampleSessionSegments(session, minutes, HK_SESSION_SEGMENTS);
      const afternoon = bars.find((bar) => bar[0] === at(13, 0)[0]);
      expect(afternoon, `${minutes}m should open a fresh candle at 13:00`).toBeDefined();
    }
  });

  it("keeps volume conserved across the session", () => {
    const total = session.reduce((sum, bar) => sum + bar[5], 0);
    for (const minutes of [60, 240]) {
      const bars = resampleSessionSegments(session, minutes, HK_SESSION_SEGMENTS);
      expect(bars.reduce((sum, bar) => sum + bar[5], 0)).toBe(total);
    }
  });
});

describe("single-session chart routing", () => {
  it("keeps the requested display-epoch date and excludes deep history", () => {
    const prior = Date.UTC(2026, 6, 29) / 1000;
    const next = Date.UTC(2026, 6, 31) / 1000;
    const bars: Bar6[] = [
      [prior + 15 * 3600, 1, 2, 0, 1, 10],
      at(9, 30),
      at(15, 59),
      [next + 9 * 3600 + 30 * 60, 1, 2, 0, 1, 10],
    ];
    expect(filterBarsToSessionDate(bars, "2026-07-30").map((bar) => bar[0]))
      .toEqual([at(9, 30)[0], at(15, 59)[0]]);
  });

  it("fails closed for a malformed date", () => {
    expect(filterBarsToSessionDate([at(9, 30)], "not-a-date")).toEqual([]);
  });
});
