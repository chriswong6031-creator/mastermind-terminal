import { describe, it, expect } from "vitest";
import {
  heatShade,
  parseRgba,
  cssColorToRgb,
  cellRowSpan,
  resolveMetricColors,
  timeInterpolation,
  type Rgb,
} from "@/lib/heatSeries";
import { buildHeatBars, type SurfaceFrame } from "@/lib/surfaceContract";
import type { Time } from "lightweight-charts";

// west-theme defaults; the shader takes explicit triplets so tests are theme-independent.
const POS: Rgb = [38, 194, 129];
const NEG: Rgb = [240, 86, 107];

describe("heatShade — two-band hue with transparent neutral cells", () => {
  // With maxAbs = 1 and W = 1, amount === o, so these pin the exact band math.
  it("o = 0 → transparent (no muddy session block)", () => {
    expect(heatShade(0, 1, POS, NEG, 1)).toBe("rgba(30,30,35,0.000)");
  });

  it("o = 0.3 (low band, sqrt ramp) — positive", () => {
    expect(heatShade(0.3, 1, POS, NEG, 1)).toBe("rgba(36,146,101,0.353)");
  });

  it("o = 0.6 (band boundary) reaches full hue exactly", () => {
    expect(heatShade(0.6, 1, POS, NEG, 1)).toBe("rgba(38,194,129,0.581)");
  });

  it("o = 0.8 (hot band) over-exposes toward white", () => {
    expect(heatShade(0.8, 1, POS, NEG, 1)).toBe("rgba(76,205,151,0.715)");
  });

  it("o = 1.0 (max) — brightest core", () => {
    expect(heatShade(1.0, 1, POS, NEG, 1)).toBe("rgba(114,215,173,0.840)");
  });

  it("negative amounts use the neg triplet (o = 0.3 and 0.8)", () => {
    expect(heatShade(-0.3, 1, POS, NEG, 1)).toBe("rgba(178,70,86,0.353)");
    expect(heatShade(-0.8, 1, POS, NEG, 1)).toBe("rgba(243,116,133,0.715)");
  });

  it("maxAbs = 0 → transparent regardless of opacity", () => {
    expect(heatShade(5, 0, POS, NEG, 1)).toBe("rgba(30,30,35,0.000)");
    expect(heatShade(5, 0, POS, NEG, 0.5)).toBe("rgba(30,30,35,0.000)");
  });

  it("opacity W scales alpha but not the RGB", () => {
    expect(heatShade(1, 1, POS, NEG, 0.5)).toBe("rgba(114,215,173,0.420)");
  });

  it("|amount| > maxAbs clamps to o = 1 (no overflow past white core)", () => {
    expect(heatShade(2, 1, POS, NEG, 1)).toBe("rgba(114,215,173,0.840)");
  });

  it("non-finite input fails transparent", () => {
    expect(heatShade(Number.NaN, 10, POS, NEG, 1)).toBe("rgba(30,30,35,0.000)");
    expect(heatShade(1, Number.POSITIVE_INFINITY, POS, NEG, 1)).toBe("rgba(30,30,35,0.000)");
  });
});

describe("parseRgba", () => {
  it("parses rgba with alpha to [r,g,b,a255]", () => {
    expect(parseRgba("rgba(114,215,173,0.840)")).toEqual([114, 215, 173, 214]);
  });
  it("parses rgb (no alpha) as opaque", () => {
    expect(parseRgba("rgb(38,194,129)")).toEqual([38, 194, 129, 255]);
  });
  it("returns transparent black on garbage", () => {
    expect(parseRgba("not-a-color")).toEqual([0, 0, 0, 0]);
  });
  it("round-trips a shader output", () => {
    const [r, g, b, a] = parseRgba(heatShade(1, 1, POS, NEG, 1));
    expect([r, g, b]).toEqual([114, 215, 173]);
    expect(a).toBe(Math.round(0.84 * 255));
  });
});

describe("timeInterpolation — observed x spacing is authoritative", () => {
  const samples = [10, 20, 80, 100];

  it("clamps outside the observed range", () => {
    expect(timeInterpolation(samples, 0)).toEqual({ left: 0, right: 0, mix: 0 });
    expect(timeInterpolation(samples, 120)).toEqual({ left: 3, right: 3, mix: 0 });
  });

  it("interpolates within the actual irregular gap", () => {
    expect(timeInterpolation(samples, 50)).toEqual({ left: 1, right: 2, mix: 0.5 });
    expect(timeInterpolation(samples, 15)).toEqual({ left: 0, right: 1, mix: 0.5 });
  });

  it("returns null when no observation can be located", () => {
    expect(timeInterpolation([], 10)).toBeNull();
    expect(timeInterpolation(samples, Number.NaN)).toBeNull();
  });
});

describe("cssColorToRgb", () => {
  it("parses #rrggbb", () => {
    expect(cssColorToRgb("#26c281")).toEqual([38, 194, 129]);
  });
  it("parses shorthand #rgb", () => {
    expect(cssColorToRgb("#0f0")).toEqual([0, 255, 0]);
  });
  it("parses rgb()", () => {
    expect(cssColorToRgb("rgb(240, 86, 107)")).toEqual([240, 86, 107]);
  });
  it("trims surrounding whitespace (getPropertyValue often leaves a leading space)", () => {
    expect(cssColorToRgb("  #f0566b ")).toEqual([240, 86, 107]);
  });
  it("returns null on unparseable input", () => {
    expect(cssColorToRgb("")).toBeNull();
    expect(cssColorToRgb("chartreuse")).toBeNull();
  });
});

describe("resolveMetricColors — SSR-safe defaults", () => {
  it("returns west defaults when document is undefined (node/vitest)", () => {
    // vitest node env has no document → falls back to the built-in west pair.
    const { pos, neg } = resolveMetricColors("netprem");
    expect(pos).toEqual([38, 194, 129]);
    expect(neg).toEqual([240, 86, 107]);
  });
  it("unknown metric falls back to the netprem (up/down) pair", () => {
    const a = resolveMetricColors("does-not-exist");
    const b = resolveMetricColors("netprem");
    expect(a).toEqual(b);
  });
});

// ─── B3: every grid row is written, on uniform AND non-uniform ladders ───────
// The renderer maps the union of visible cell boundaries to pixel rows. This mirrors
// that mapping in pure form and asserts full coverage — an unwritten row is a
// transparent stripe on screen.
describe("cellRowSpan — a cell fills its whole [low,high) band (B3)", () => {
  const rowOf = new Map<number, number>([
    [95, 0], [100, 1], [105, 2], [110, 3], [115, 4],
  ]);
  const g = 4; // boundaries - 1

  it("spans every row between its boundaries", () => {
    expect(cellRowSpan(rowOf, { low: 95, high: 100 }, g)).toEqual([0, 1]);
    // a band two rows tall (an interior boundary landed inside it)
    expect(cellRowSpan(rowOf, { low: 100, high: 110 }, g)).toEqual([1, 3]);
    expect(cellRowSpan(rowOf, { low: 95, high: 115 }, g)).toEqual([0, 4]);
  });

  it("degrades to a single row when `high` is not a known boundary", () => {
    expect(cellRowSpan(rowOf, { low: 100, high: 107 }, g)).toEqual([1, 2]);
  });

  it("returns null for an unknown or out-of-range `low`", () => {
    expect(cellRowSpan(rowOf, { low: 97, high: 100 }, g)).toBeNull();
    expect(cellRowSpan(rowOf, { low: 115, high: 120 }, g)).toBeNull(); // row 4 >= g
  });

  it("clamps the span to the grid height", () => {
    expect(cellRowSpan(rowOf, { low: 110, high: 115 }, 4)).toEqual([3, 4]);
  });
});

describe("heat grid coverage — no unpainted row for any ladder (B3)", () => {
  const anchor = (hhmm: string): Time => Number(hhmm.replace(":", "")) as unknown as Time;

  /** Replays the renderer's boundary-union → row-write pass; returns rows never written. */
  function unpaintedRows(frame: SurfaceFrame): number[] {
    const bars = buildHeatBars(frame, "netprem", anchor);
    const boundarySet = new Set<number>();
    for (const bar of bars) for (const c of bar.cells) { boundarySet.add(c.low); boundarySet.add(c.high); }
    const boundaries = [...boundarySet].sort((a, b) => a - b);
    const g = Math.max(1, boundaries.length - 1);
    const rowOf = new Map<number, number>();
    boundaries.forEach((b, i) => rowOf.set(b, i));
    const painted = new Set<number>();
    for (const c of bars[0].cells) {
      const span = cellRowSpan(rowOf, c, g);
      if (!span) continue;
      for (let r = span[0]; r < span[1]; r++) painted.add(r);
    }
    return Array.from({ length: g }, (_, i) => i).filter((r) => !painted.has(r));
  }

  const base = {
    spot: 110,
    time_steps: ["09:31", "09:41"],
    asof: "2026-07-06T13:31:00Z",
    cadence: "10-min",
    session_date: "2026-07-06",
  };

  it("covers every row on a NON-UNIFORM ladder", () => {
    const frame: SurfaceFrame = {
      ...base,
      price_levels: [100, 105, 110, 120, 130],
      grids: { netprem: [[1, 1], [2, 2], [3, 3], [4, 4], [5, 5]] },
    };
    expect(unpaintedRows(frame)).toEqual([]);
  });

  it("covers every row on a uniform ladder", () => {
    const frame: SurfaceFrame = {
      ...base,
      price_levels: [90, 95, 100, 105, 110],
      grids: { netprem: [[1, 1], [2, 2], [3, 3], [4, 4], [5, 5]] },
    };
    expect(unpaintedRows(frame)).toEqual([]);
  });

  it("covers every row on a wildly irregular ladder", () => {
    const frame: SurfaceFrame = {
      ...base,
      price_levels: [50, 51, 52, 60, 100, 101, 250],
      grids: { netprem: [[1, 1], [2, 2], [3, 3], [4, 4], [5, 5], [6, 6], [7, 7]] },
    };
    expect(unpaintedRows(frame)).toEqual([]);
  });
});
