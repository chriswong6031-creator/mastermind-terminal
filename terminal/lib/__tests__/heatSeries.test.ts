import { describe, it, expect } from "vitest";
import {
  heatShade,
  parseRgba,
  cssColorToRgb,
  resolveMetricColors,
  type Rgb,
} from "@/lib/heatSeries";

// west-theme defaults; the shader takes explicit triplets so tests are theme-independent.
const POS: Rgb = [38, 194, 129];
const NEG: Rgb = [240, 86, 107];

describe("heatShade — exact two-band curve (RECON §3 verbatim)", () => {
  // With maxAbs = 1 and W = 1, amount === o, so these pin the exact band math.
  it("o = 0 → faint neutral panel wash", () => {
    expect(heatShade(0, 1, POS, NEG, 1)).toBe("rgba(30,30,35,0.200)");
  });

  it("o = 0.3 (low band, sqrt ramp) — positive", () => {
    expect(heatShade(0.3, 1, POS, NEG, 1)).toBe("rgba(36,146,101,0.530)");
  });

  it("o = 0.6 (band boundary) reaches full hue exactly", () => {
    expect(heatShade(0.6, 1, POS, NEG, 1)).toBe("rgba(38,194,129,0.700)");
  });

  it("o = 0.8 (hot band) over-exposes toward white", () => {
    expect(heatShade(0.8, 1, POS, NEG, 1)).toBe("rgba(76,205,151,0.795)");
  });

  it("o = 1.0 (max) — brightest core", () => {
    expect(heatShade(1.0, 1, POS, NEG, 1)).toBe("rgba(114,215,173,0.880)");
  });

  it("negative amounts use the neg triplet (o = 0.3 and 0.8)", () => {
    expect(heatShade(-0.3, 1, POS, NEG, 1)).toBe("rgba(178,70,86,0.530)");
    expect(heatShade(-0.8, 1, POS, NEG, 1)).toBe("rgba(243,116,133,0.795)");
  });

  it("maxAbs = 0 → neutral wash scaled only by opacity W", () => {
    expect(heatShade(5, 0, POS, NEG, 1)).toBe("rgba(30,30,35,0.200)");
    expect(heatShade(5, 0, POS, NEG, 0.5)).toBe("rgba(30,30,35,0.100)");
  });

  it("opacity W scales alpha but not the RGB", () => {
    expect(heatShade(1, 1, POS, NEG, 0.5)).toBe("rgba(114,215,173,0.440)");
  });

  it("|amount| > maxAbs clamps to o = 1 (no overflow past white core)", () => {
    expect(heatShade(2, 1, POS, NEG, 1)).toBe("rgba(114,215,173,0.880)");
  });

  it("sign boundary: amount 0 is treated as positive (>= 0)", () => {
    // exactly 0 with maxAbs>0 → o=0 → panel base regardless of pos/neg (they blend to 0)
    expect(heatShade(0, 10, POS, NEG, 1)).toBe("rgba(30,30,35,0.200)");
  });
});

describe("parseRgba", () => {
  it("parses rgba with alpha to [r,g,b,a255]", () => {
    expect(parseRgba("rgba(114,215,173,0.880)")).toEqual([114, 215, 173, 224]);
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
    expect(a).toBe(Math.round(0.88 * 255));
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
