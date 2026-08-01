import { describe, expect, it } from "vitest";
import { DRAW_KINDS } from "@/lib/drawings";
import {
  DEFAULT_FIBONACCI_LEVELS,
  DRAWING_RENDERER_FAMILY,
  FIBONACCI_LEVEL_SLOTS,
  materializeSemanticPoints,
} from "@/lib/drawing-engine/geometry";

describe("drawing geometry contracts", () => {
  it("has an explicit renderer family for every registered drawing kind", () => {
    expect(Object.keys(DRAWING_RENDERER_FAMILY).sort()).toEqual([...DRAW_KINDS].sort());
    expect(new Set(Object.values(DRAWING_RENDERER_FAMILY)).size).toBeGreaterThan(15);
  });

  it("keeps eleven defaults inside the settings-ready Fibonacci slots", () => {
    expect(DEFAULT_FIBONACCI_LEVELS).toHaveLength(11);
    expect(FIBONACCI_LEVEL_SLOTS).toHaveLength(24);
    expect(DEFAULT_FIBONACCI_LEVELS.every((level) => FIBONACCI_LEVEL_SLOTS.includes(level))).toBe(true);
  });

  it("materializes economical gestures into editable semantic handles", () => {
    const times = ["1", "2", "3", "4", "5"];
    const anchors = [{ t: "1", p: 100 }, { t: "5", p: 112 }];
    expect(materializeSemanticPoints("longposition", anchors, times, 2)).toHaveLength(3);
    expect(materializeSemanticPoints("curve", anchors, times, 2)).toHaveLength(3);
    expect(materializeSemanticPoints("doublecurve", anchors, times, 2)).toHaveLength(4);
    expect(materializeSemanticPoints("divergence", anchors, times, 2)).toHaveLength(4);
    expect(materializeSemanticPoints("journey", anchors, times, 2)).toHaveLength(6);
    expect(materializeSemanticPoints("fork", anchors, times, 2)).toHaveLength(5);
    expect(materializeSemanticPoints("threepaths", anchors, times, 2)).toHaveLength(5);
    expect(materializeSemanticPoints("burj", anchors, times, 2)).toHaveLength(3);
  });
});
