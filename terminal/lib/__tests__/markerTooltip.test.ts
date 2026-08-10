import { describe, expect, it } from "vitest";
import {
  hitTestMarkers, placeMarkerTip, isTapGesture,
  MARKER_HOVER_SLACK, MARKER_TAP_SLACK, type MarkerHit,
} from "../markerTooltip";

/** A ⊘ ring marker, roughly the real geometry: ~11px across, ~19px tall with the amber dot. */
const ring = (x: number, title = "ring"): MarkerHit =>
  ({ x, y: 100, w: 11, h: 19, title, t: title });
/** A BUY pill with its pointer triangle — the entry geometry, ~19×20. */
const pill = (x: number, title = "pill"): MarkerHit =>
  ({ x, y: 100, w: 19, h: 20, title, t: title });

describe("hitTestMarkers", () => {
  it("returns the marker under the point", () => {
    const boxes = [ring(50), pill(200)];
    expect(hitTestMarkers(boxes, 55, 110, 0)?.title).toBe("ring");
    expect(hitTestMarkers(boxes, 208, 110, 0)?.title).toBe("pill");
  });

  it("returns null off every marker", () => {
    expect(hitTestMarkers([ring(50)], 400, 110, 0)).toBeNull();
    expect(hitTestMarkers([ring(50)], 55, 400, 0)).toBeNull();
  });

  it("returns null when nothing is painted", () => {
    expect(hitTestMarkers([], 55, 110, MARKER_TAP_SLACK)).toBeNull();
  });

  it("misses just outside the box and hits once slack is allowed", () => {
    const boxes = [ring(50)];                 // x spans 50..61, y spans 100..119
    expect(hitTestMarkers(boxes, 63, 110, 0)).toBeNull();
    expect(hitTestMarkers(boxes, 63, 110, MARKER_HOVER_SLACK)?.title).toBe("ring");
  });

  it("grows a sub-touch-target marker into a tappable one", () => {
    // The reason MARKER_TAP_SLACK exists: an 11px ring is far under any usable touch target, so a
    // finger landing 9px off centre-edge must still open it. The hover slack must NOT be enough.
    const boxes = [ring(50)];
    expect(hitTestMarkers(boxes, 69, 110, MARKER_HOVER_SLACK)).toBeNull();
    expect(hitTestMarkers(boxes, 69, 110, MARKER_TAP_SLACK)?.title).toBe("ring");
  });

  it("resolves overlapping markers by centre distance, not by array order", () => {
    // Two fires on adjacent bars whose slack boxes overlap. Paint order is emitter ordering, so
    // resolving by "last one wins" would make the tooltip depend on it; the nearest centre is
    // what the reader is actually pointing at. Asserted BOTH ways round so the test cannot pass
    // by accidentally agreeing with the iteration order.
    const a = { ...ring(50), title: "a", t: "a" };
    const b = { ...ring(58), title: "b", t: "b" };
    expect(hitTestMarkers([a, b], 52, 110, MARKER_TAP_SLACK)?.title).toBe("a");
    expect(hitTestMarkers([b, a], 52, 110, MARKER_TAP_SLACK)?.title).toBe("a");
    expect(hitTestMarkers([a, b], 67, 110, MARKER_TAP_SLACK)?.title).toBe("b");
    expect(hitTestMarkers([b, a], 67, 110, MARKER_TAP_SLACK)?.title).toBe("b");
  });

  it("is coordinate-space agnostic — negative origins hit normally", () => {
    // ChartPanel measures in viewport coordinates, which go negative when the chart is scrolled
    // above the fold. Nothing in the hit test may assume a positive origin.
    const boxes = [{ x: -40, y: -30, w: 11, h: 19, title: "off", t: "off" }];
    expect(hitTestMarkers(boxes, -35, -20, 0)?.title).toBe("off");
  });
});

describe("placeMarkerTip", () => {
  const tip = { w: 260, h: 60 };
  const wrap = { w: 1000, h: 600 };

  it("offsets below-right of the anchor when there is room", () => {
    expect(placeMarkerTip({ x: 100, y: 100 }, tip, wrap)).toEqual({ left: 112, top: 114 });
  });

  it("flips to the left of the anchor rather than overflowing the right edge", () => {
    const p = placeMarkerTip({ x: 960, y: 100 }, tip, wrap);
    expect(p.left).toBe(960 - tip.w - 12);
    expect(p.left + tip.w).toBeLessThanOrEqual(wrap.w);
  });

  it("flips above the anchor rather than overflowing the bottom edge", () => {
    const p = placeMarkerTip({ x: 100, y: 580 }, tip, wrap);
    expect(p.top).toBeLessThan(580);
    expect(p.top + tip.h).toBeLessThanOrEqual(wrap.h);
  });

  it("keeps the whole tooltip inside the wrapper at every corner", () => {
    // A marker at the very edge of the pane must show its whole tooltip, not a sliver.
    for (const [x, y] of [[0, 0], [1000, 0], [0, 600], [1000, 600], [-20, -20]] as const) {
      const p = placeMarkerTip({ x, y }, tip, wrap);
      expect(p.left).toBeGreaterThanOrEqual(4);
      expect(p.top).toBeGreaterThanOrEqual(4);
      expect(p.left + tip.w).toBeLessThanOrEqual(wrap.w - 4);
      expect(p.top + tip.h).toBeLessThanOrEqual(wrap.h - 4);
    }
  });

  it("degrades to the pad rather than a negative offset when the tooltip exceeds the wrapper", () => {
    // A narrow mobile pane can be smaller than the tooltip's max-width. Clamping must not invert.
    const p = placeMarkerTip({ x: 100, y: 100 }, { w: 400, h: 60 }, { w: 300, h: 200 });
    expect(p.left).toBe(4);
    expect(p.top).toBeGreaterThanOrEqual(4);
  });
});

describe("isTapGesture", () => {
  const down = { x: 100, y: 100, t: 1000 };

  it("accepts a still, short press", () => {
    expect(isTapGesture(down, { x: 103, y: 102, t: 1120 })).toBe(true);
  });

  it("rejects a long press", () => {
    expect(isTapGesture(down, { x: 100, y: 100, t: 1400 })).toBe(false);
  });

  it("rejects a press that travelled — that gesture is a chart pan, not a tap", () => {
    // The load-bearing case: a drag STARTING on a marker belongs to the chart. If this returned
    // true, a pan would end by opening a tooltip over the pane the user just moved.
    expect(isTapGesture(down, { x: 160, y: 100, t: 1120 })).toBe(false);
  });

  it("uses the same thresholds as the chart's own double-tap detector", () => {
    // 300ms / 12px — kept identical so one gesture can never be a tap here and a drag there.
    expect(isTapGesture(down, { x: 100, y: 100, t: 1300 })).toBe(true);
    expect(isTapGesture(down, { x: 100, y: 100, t: 1301 })).toBe(false);
    expect(isTapGesture(down, { x: 112, y: 100, t: 1100 })).toBe(true);
    expect(isTapGesture(down, { x: 113, y: 100, t: 1100 })).toBe(false);
  });
});
