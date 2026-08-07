import { describe, expect, it } from "vitest";

import {
  calculateAnchoredVwap,
  calculateFixedRangeVolumeProfile,
  calculateRegressionChannel,
  generateGhostFeed,
  type DrawingAnalyticsBar,
} from "@/lib/drawing-engine/analytics";

const bar = (
  index: number,
  close: number,
  overrides: Partial<DrawingAnalyticsBar> = {},
): DrawingAnalyticsBar => ({
  time: `2026-07-${String(index + 1).padStart(2, "0")}`,
  o: close,
  h: close,
  l: close,
  c: close,
  v: 1,
  ...overrides,
});

describe("drawing analytics", () => {
  it("fits a real least-squares trend and reports its Pearson correlation", () => {
    const result = calculateRegressionChannel([10, 12, 14, 16, 18].map((close, index) => bar(index, close)));

    expect(result).not.toBeNull();
    expect(result?.sampleCount).toBe(5);
    expect(result?.slope).toBeCloseTo(2, 12);
    expect(result?.start).toBeCloseTo(10, 12);
    expect(result?.end).toBeCloseTo(18, 12);
    expect(result?.standardDeviation).toBeCloseTo(0, 12);
    expect(result?.pearsonR).toBeCloseTo(1, 12);
    expect(result?.upperStart).toBeCloseTo(result?.start ?? 0, 12);
    expect(result?.lowerEnd).toBeCloseTo(result?.end ?? 0, 12);
  });

  it("builds symmetric regression bands from residual standard deviation", () => {
    const result = calculateRegressionChannel([10, 13, 13, 17, 18].map((close, index) => bar(index, close)));

    expect(result).not.toBeNull();
    expect(result?.standardDeviation).toBeGreaterThan(0);
    expect((result?.upperStart ?? 0) - (result?.start ?? 0)).toBeCloseTo(
      (result?.start ?? 0) - (result?.lowerStart ?? 0),
      12,
    );
    expect(result?.pearsonR).toBeGreaterThan(0.9);
  });

  it("calculates cumulative anchored VWAP and volume-weighted deviation bands", () => {
    const rows = [
      bar(0, 10, { h: 10, l: 10, v: 1 }),
      bar(1, 14, { h: 14, l: 14, v: 3 }),
      bar(2, 99, { h: 99, l: 99, v: 0 }),
    ];
    const result = calculateAnchoredVwap(rows);

    expect(result).toHaveLength(3);
    expect(result[0].vwap).toBe(10);
    expect(result[1].vwap).toBeCloseTo(13, 12);
    expect(result[1].standardDeviation).toBeCloseTo(Math.sqrt(3), 12);
    expect(result[1].upper[2]).toBeCloseTo(13 + 3 * Math.sqrt(3), 12);
    expect(result[1].lower[1]).toBeCloseTo(13 - 2 * Math.sqrt(3), 12);
    expect(result[2]).toMatchObject({
      vwap: result[1].vwap,
      standardDeviation: result[1].standardDeviation,
    });
  });

  it("allocates fixed-range profile volume by candle overlap and finds POC/value area", () => {
    const rows = [
      bar(0, 5, { l: 0, h: 10, v: 100 }),
      bar(1, 5, { l: 5, h: 5, v: 50 }),
    ];
    const result = calculateFixedRangeVolumeProfile(rows, 0, 10, 5, 0.7);

    expect(result).not.toBeNull();
    expect(result?.bins.map((bin) => bin.volume)).toEqual([20, 20, 70, 20, 20]);
    expect(result?.totalVolume).toBe(150);
    expect(result?.pocIndex).toBe(2);
    // Equal adjacent buckets expand lower first, making tie behavior stable.
    expect(result?.valueAreaLowIndex).toBe(0);
    expect(result?.valueAreaHighIndex).toBe(2);
  });

  it("counts only the portion of a candle represented by the selected price range", () => {
    const result = calculateFixedRangeVolumeProfile(
      [bar(0, 0, { l: -5, h: 5, v: 100 })],
      0,
      10,
      5,
    );

    expect(result?.totalVolume).toBeCloseTo(50, 12);
    expect(result?.bins.map((bin) => bin.volume)).toEqual([20, 20, 10, 0, 0]);
  });

  it("generates deterministic, valid synthetic ghost candles along the control path", () => {
    const history = Array.from({ length: 24 }, (_, index) => {
      const close = 100 + Math.sin(index / 3) * 2 + index * 0.15;
      return bar(index, close, { o: close - 0.2, h: close + 1.1, l: close - 1.1, v: 1_000 + index * 7 });
    });
    const first = generateGhostFeed(history, [103, 108, 105], 18);
    const second = generateGhostFeed(history, [103, 108, 105], 18);

    expect(first).toEqual(second);
    expect(first?.candles).toHaveLength(18);
    expect(first?.seed).toBeGreaterThan(0);
    expect(first?.candles[0].c).toBeCloseTo(103, 12);
    expect(first?.candles.at(-1)?.c).toBeCloseTo(105, 12);
    first?.candles.forEach((candle) => {
      expect(candle.h).toBeGreaterThanOrEqual(Math.max(candle.o, candle.c));
      expect(candle.l).toBeLessThanOrEqual(Math.min(candle.o, candle.c));
    });
  });

  it("inherits ghost-feed candle scale from realised volatility", () => {
    const lowVolatility = Array.from({ length: 20 }, (_, index) => bar(index, 100 + index * 0.01, {
      h: 100.1 + index * 0.01,
      l: 99.9 + index * 0.01,
    }));
    const highVolatility = Array.from({ length: 20 }, (_, index) => bar(index, 100 + (index % 2 ? 8 : -8), {
      h: 112,
      l: 88,
    }));

    expect(generateGhostFeed(highVolatility, [100, 105], 12)?.volatility).toBeGreaterThan(
      generateGhostFeed(lowVolatility, [100, 105], 12)?.volatility ?? Infinity,
    );
    expect(generateGhostFeed(lowVolatility, [100], 12)).toBeNull();
  });
});
