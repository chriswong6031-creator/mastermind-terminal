import { describe, it, expect } from "vitest";
import { computeTrendState, computeTrendBacktest, TREND_STATES, FWD_LONG } from "../trend";
import type { Bar } from "../fund";

// ── synthetic bar builders ─────────────────────────────────────────────────────
function makeBars(closes: number[]): Bar[] {
  return closes.map((c, i) => ({ time: i, o: c, h: c, l: c, c, v: 0 }));
}
// inclusive linear ramp of n points from `from` to `to`
function ramp(from: number, to: number, n: number): number[] {
  if (n === 1) return [from];
  const step = (to - from) / (n - 1);
  return Array.from({ length: n }, (_, i) => from + step * i);
}

describe("computeTrendState — ex-ante MA-structure states", () => {
  it("returns null without a warm 200-day MA (<200 bars)", () => {
    expect(computeTrendState(makeBars(ramp(100, 200, 150)))).toBeNull();
  });

  it("a rising series is UPTREND (price>200MA, 50>200, 50 rising)", () => {
    expect(computeTrendState(makeBars(ramp(100, 400, 300)))).toBe("UPTREND");
  });

  it("a falling series is DOWNTREND (price<200MA, 50<200)", () => {
    expect(computeTrendState(makeBars(ramp(400, 100, 300)))).toBe("DOWNTREND");
  });

  it("a long rise then a shallow extended decline is PULLBACK (structure intact, 50 rolling)", () => {
    const closes = [...ramp(100, 400, 400), ...ramp(400, 380, 60).slice(1)];
    expect(computeTrendState(makeBars(closes))).toBe("PULLBACK");
  });

  it("a deep fall then a sharp recovery is RANGE (price back above 200MA, 50 still below)", () => {
    const closes = [...ramp(400, 100, 300), ...ramp(100, 200, 40).slice(1)];
    expect(computeTrendState(makeBars(closes))).toBe("RANGE");
  });
});

describe("computeTrendBacktest — forward-return base rates", () => {
  it("current state matches computeTrendState", () => {
    const bars = makeBars(ramp(100, 400, 300));
    expect(computeTrendBacktest(bars).current).toBe(computeTrendState(bars));
  });

  it("rising ramp: UPTREND dominates with positive forward returns and 100% win", () => {
    const bt = computeTrendBacktest(makeBars(ramp(100, 400, 320)));
    const up = bt.stats.UPTREND;
    expect(up.n).toBeGreaterThan(0);
    expect(up.fwd60Mean!).toBeGreaterThan(0);
    expect(up.fwd60Win).toBe(1); // every forward window is up in a monotone rise
  });

  it("falling ramp: DOWNTREND has negative forward returns and 0% win", () => {
    const bt = computeTrendBacktest(makeBars(ramp(400, 100, 320)));
    const dn = bt.stats.DOWNTREND;
    expect(dn.n).toBeGreaterThan(0);
    expect(dn.fwd60Mean!).toBeLessThan(0);
    expect(dn.fwd60Win).toBe(0);
  });

  it("insufficient history (<200+60): current null, every state n==0", () => {
    const bt = computeTrendBacktest(makeBars(ramp(100, 200, 150)));
    expect(bt.current).toBeNull();
    for (const s of TREND_STATES) expect(bt.stats[s].n).toBe(0);
  });

  it("empty state has null stats, not zeros or NaN", () => {
    const bt = computeTrendBacktest(makeBars(ramp(100, 400, 300)));
    for (const s of TREND_STATES) {
      const st = bt.stats[s];
      if (st.n === 0) {
        expect(st.fwd60Mean).toBeNull();
        expect(st.fwd60Win).toBeNull();
      } else {
        expect(Number.isFinite(st.fwd60Mean!)).toBe(true);
        expect(st.fwd60Win!).toBeGreaterThanOrEqual(0);
        expect(st.fwd60Win!).toBeLessThanOrEqual(1);
      }
    }
  });

  it("all four states are always present in stats", () => {
    const bt = computeTrendBacktest(makeBars(ramp(100, 400, 300)));
    expect(Object.keys(bt.stats).sort()).toEqual([...TREND_STATES].sort());
  });

  it("does not crash on empty or tiny input", () => {
    expect(computeTrendBacktest([]).current).toBeNull();
    expect(computeTrendState([])).toBeNull();
    expect(computeTrendBacktest(makeBars([1, 2, 3])).stats.UPTREND.n).toBe(0);
  });

  it("forward window respects FWD_LONG (n never counts the last FWD_LONG bars)", () => {
    const closes = ramp(100, 400, 300);
    const bt = computeTrendBacktest(makeBars(closes));
    const totalN = TREND_STATES.reduce((s, st) => s + bt.stats[st].n, 0);
    // classifiable bars start at index 199; last usable is length-1-FWD_LONG
    expect(totalN).toBe(Math.max(0, closes.length - FWD_LONG - 199));
  });
});
