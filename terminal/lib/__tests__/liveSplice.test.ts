import { describe, it, expect } from "vitest";
import { spliceDaily } from "@/components/ChartPanel";
import { parseTencentFields } from "@/lib/intradaySources";

// Regression: at the China market open, Tencent's premarket call-auction snapshot reports
// open/high/low = 0 (the session hasn't resolved yet). The live-bar splice used to accept the 0
// as the bar's open and draw a synthetic candle from $0 up to the last close — a giant spike on
// every China chart. Guard: a non-positive open/high/low is MISSING, not a real price.

// Build a Tencent "~"-delimited field record with the offsets the parser reads
// (3=last 4=prevClose 5=open 6=vol 30=ts 32=chg% 33=high 34=low 37=amount).
function tencentRecord(o: Partial<Record<number, string>>): string[] {
  const f = new Array(40).fill("0");
  f[0] = "1"; f[1] = "TestCo"; f[2] = "000729";
  for (const k of Object.keys(o)) f[+k] = o[+k as unknown as number]!;
  return f;
}

describe("parseTencentFields — premarket zero open/high/low", () => {
  it("nulls out 0 open/high/low but keeps the real last", () => {
    const rec = tencentRecord({ 3: "11.74", 4: "11.74", 5: "0.00", 33: "0.00", 34: "0.00", 30: "20260721091500", 32: "0.00" });
    const q = parseTencentFields("000729.SZ", "cn", rec)!;
    expect(q).not.toBeNull();
    expect(q.last).toBe(11.74);
    expect(q.open).toBeNull();
    expect(q.high).toBeNull();
    expect(q.low).toBeNull();
  });

  it("passes real open/high/low through untouched once the session prints", () => {
    const rec = tencentRecord({ 3: "12.20", 4: "11.74", 5: "11.90", 33: "12.35", 34: "11.85", 30: "20260721100000", 32: "3.92" });
    const q = parseTencentFields("000729.SZ", "cn", rec)!;
    expect(q.open).toBe(11.90);
    expect(q.high).toBe(12.35);
    expect(q.low).toBe(11.85);
  });
});

describe("spliceDaily — no $0 spike from a zero-open premarket quote", () => {
  const daily = [
    { time: "2026-07-17", o: 11.5, h: 12.0, l: 11.3, c: 11.74, v: 1000 },
    { time: "2026-07-18", o: 11.74, h: 12.1, l: 11.6, c: 11.9, v: 1200 },
  ];

  it("APPEND (new session): a 0 open falls back to last, never anchors the bar at $0", () => {
    const out = spliceDaily(daily, { last: 11.74, open: 0, high: 0, low: 0, vol: 0 }, "2026-07-21");
    expect(out.length).toBe(3);
    const bar = out[out.length - 1];
    expect(bar.time).toBe("2026-07-21");
    expect(bar.o).toBe(11.74);   // NOT 0
    expect(bar.l).toBe(11.74);   // NOT 0
    expect(bar.l).toBeGreaterThan(0);
    expect(bar.c).toBe(11.74);
  });

  it("PATCH (same session): a 0 low does not drag the bar's low to $0", () => {
    const out = spliceDaily(daily, { last: 11.95, open: 0, high: 0, low: 0 }, "2026-07-18");
    expect(out.length).toBe(2);
    const bar = out[out.length - 1];
    expect(bar.l).toBe(11.6);    // original low preserved, NOT 0
    expect(bar.c).toBe(11.95);
    expect(bar.h).toBe(12.1);
  });

  it("a 0 (or missing) last is not spliceable at all", () => {
    expect(spliceDaily(daily, { last: 0, open: 11.9 }, "2026-07-21")).toBe(daily);
  });

  it("valid quotes still splice exactly as before", () => {
    const out = spliceDaily(daily, { last: 12.2, open: 11.9, high: 12.35, low: 11.85, vol: 500 }, "2026-07-21");
    const bar = out[out.length - 1];
    expect(bar).toEqual({ time: "2026-07-21", o: 11.9, h: 12.35, l: 11.85, c: 12.2, v: 500 });
  });
});
