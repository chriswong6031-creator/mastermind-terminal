import { describe, expect, it } from "vitest";
import {
  filterBarsToSessionDate,
  filterUsEquitySession,
  resampleUsEquitySession,
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
