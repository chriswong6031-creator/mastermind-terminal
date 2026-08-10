import { describe, expect, it } from "vitest";
import {
  LABEL_HEIGHT,
  LABEL_MIN_GAP,
  RAIL_HEIGHT,
  geometryPricePositionPct,
  geometryProgressSegment,
  layoutGeometryLabelCenters,
} from "@/components/prophet/GeometryRail";

function sorted(values: number[]): number[] {
  return [...values].sort((a, b) => a - b);
}

describe("Prophet geometry label collision layout", () => {
  it("keeps BULL and BEAR plans on one real price axis", () => {
    expect(geometryPricePositionPct(90, 90, 110)).toBe(0);
    expect(geometryPricePositionPct(100, 90, 110)).toBe(0.5);
    expect(geometryPricePositionPct(110, 90, 110)).toBe(1);
  });

  it("fills progress only for favorable BULL and BEAR movement", () => {
    expect(geometryProgressSegment("BULL", 40, 60)).toEqual({ startPct: 40, filledPct: 20 });
    expect(geometryProgressSegment("BULL", 60, 40)).toEqual({ startPct: 60, filledPct: 0 });
    expect(geometryProgressSegment("BEAR", 60, 40)).toEqual({ startPct: 40, filledPct: 20 });
    expect(geometryProgressSegment("BEAR", 40, 60)).toEqual({ startPct: 40, filledPct: 0 });
  });

  it("separates identical ENTRY and LAST centers around their shared price", () => {
    const placed = layoutGeometryLabelCenters([70, 70]);
    expect(placed[1] - placed[0]).toBeGreaterThanOrEqual(LABEL_MIN_GAP);
    expect((placed[0] + placed[1]) / 2).toBeCloseTo(70);
  });

  it("lays out a five-label price cluster within the fixed rail", () => {
    const placed = sorted(layoutGeometryLabelCenters([68, 69, 70, 71, 72]));
    expect(placed[0]).toBeGreaterThanOrEqual(LABEL_HEIGHT / 2);
    expect(placed.at(-1)).toBeLessThanOrEqual(RAIL_HEIGHT - LABEL_HEIGHT / 2);
    for (let index = 1; index < placed.length; index++) {
      expect(placed[index] - placed[index - 1]).toBeGreaterThanOrEqual(LABEL_MIN_GAP - 0.001);
    }
  });

  it("is deterministic and preserves the caller's level order", () => {
    const desired = [133, 8, 70, 70, 22];
    const first = layoutGeometryLabelCenters(desired);
    expect(layoutGeometryLabelCenters(desired)).toEqual(first);
    expect(first[0]).toBeGreaterThan(first[1]);
    expect(first[2]).toBeLessThan(first[3]);
  });

  it("reduces its gap safely when the rail cannot fit the requested spacing", () => {
    const placed = sorted(layoutGeometryLabelCenters([0, 0, 0, 0, 0], 40, 20, 5));
    expect(placed[0]).toBeGreaterThanOrEqual(5);
    expect(placed.at(-1)).toBeLessThanOrEqual(35);
    for (let index = 1; index < placed.length; index++) {
      expect(placed[index] - placed[index - 1]).toBeCloseTo(7.5);
    }
  });
});
