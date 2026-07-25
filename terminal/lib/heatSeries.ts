/**
 * heatSeries.ts — TradingView Lightweight-Charts v5 custom-series heatmap plugin.
 *
 * This is the "paint surface" renderer: an intraday exposure/premium field painted
 * BEHIND the price candles. Each bar carries a vertical stack of `cells` ({low, high,
 * amount}); the renderer paints the whole grid onto a tiny offscreen canvas at native
 * grid resolution (1 cell = 1 px), then blits it to the plot rect with high-quality
 * image smoothing. The browser's smooth upscale of the tiny grid IS the watercolor look
 * — there is deliberately NO blur filter (see RECON §3 / MASTERPLAN §3 Lane T).
 *
 * Algorithm mirrors quanted's decoded renderer (research/quanted_options/js_extracts):
 *   1. Over the visible range, collect the union of unique cell boundaries → sorted
 *      levels `p`; grid height g = p.length - 1, width h = #visible bars.
 *   2. createImageData(h, g); per pixel write cellShader(amount) parsed to RGBA bytes,
 *      y-flipped so the highest price sits at the top row.
 *   3. putImageData → the offscreen canvas; then in MEDIA (CSS-pixel) coordinate space,
 *      compute the plot rect from priceConverter(maxHigh..minLow) and the first/last bar
 *      x ± barSpacing/2, set imageSmoothingEnabled + quality='high', drawImage upscale.
 *
 * The shader (`heatShade`) is a PURE function exported for unit testing — its exact
 * two-band curve (sqrt ramp to hue, then over-expose toward white above 60% of day-max)
 * is the signature and is asserted at o = 0/0.3/0.6/0.8/1.0 in heatSeries.test.ts.
 *
 * Colors: pos/neg RGB triplets are resolved from CSS vars at mount (default --up/--down),
 * so the East-Asian red-up flip (html[data-updown="east"]) is honored — never a hardcoded
 * direction hex (DESIGN_OBSERVATORY §2). Per-metric pairs are scaffolded for the greeks.
 */

import type {
  ICustomSeriesPaneView,
  ICustomSeriesPaneRenderer,
  PaneRendererCustomData,
  CustomSeriesPricePlotValues,
  PriceToCoordinateConverter,
  CustomData,
  CustomSeriesOptions,
  Time,
  WhitespaceData,
} from "lightweight-charts";
import { customSeriesDefaultOptions } from "lightweight-charts";
import type { CanvasRenderingTarget2D } from "fancy-canvas";

// ─── RGB triplet helpers ────────────────────────────────────────────────────

export type Rgb = readonly [number, number, number];

/**
 * heatShade — the exact two-band diverging shader (see RECON §3, verbatim semantics).
 *
 * @param amount  signed cell value (e.g. net premium at a strike-minute)
 * @param maxAbs  max(|min|,|max|) over the field — the day-max used to normalize
 * @param pos     RGB triplet for positive amounts (from --up)
 * @param neg     RGB triplet for negative amounts (from --down)
 * @param W       opacity weight 0..1 (the pane opacity slider)
 * @returns an `rgba(r,g,b,a)` string
 *
 * Band 1 (o ≤ 0.6): sqrt-eased blend from the panel base to the full hue.
 * Band 2 (o > 0.6): over-expose toward white by up to 35% — the "hot core".
 * Alpha: 0.2 + 0.68·o^0.6, scaled by W. Empty field (maxAbs 0) → faint neutral wash.
 */
export function heatShade(
  amount: number,
  maxAbs: number,
  pos: Rgb,
  neg: Rgb,
  W: number,
): string {
  if (!maxAbs) return `rgba(30,30,35,${(0.2 * W).toFixed(3)})`;
  const o = Math.min(1, Math.abs(amount) / maxAbs);
  const c = amount >= 0 ? pos : neg;
  let r: number, g: number, b: number;
  if (o <= 0.6) {
    const e = Math.sqrt(o / 0.6);
    r = 30 + e * (c[0] - 30);
    g = 30 + e * (c[1] - 30);
    b = 35 + e * (c[2] - 35);
  } else {
    const e = ((o - 0.6) / 0.4) * 0.35;
    r = c[0] + (255 - c[0]) * e;
    g = c[1] + (255 - c[1]) * e;
    b = c[2] + (255 - c[2]) * e;
  }
  const a = (0.2 + 0.68 * Math.pow(o, 0.6)) * W;
  return `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${a.toFixed(3)})`;
}

/** Parse an `rgb()/rgba()` string to `[r,g,b,a255]`. Falls back to transparent black. */
export function parseRgba(s: string): [number, number, number, number] {
  const m = s.match(/rgba?\((\d+),\s*(\d+),\s*(\d+),?\s*([\d.]*)\)/);
  if (!m) return [0, 0, 0, 0];
  return [+m[1], +m[2], +m[3], Math.round((m[4] ? +m[4] : 1) * 255)];
}

/**
 * Parse a CSS color value to an RGB triplet. Supports `#rgb`, `#rrggbb`, and
 * `rgb()/rgba()`. Returns null when it can't be parsed (caller keeps its default).
 *
 * Used at mount to turn `getComputedStyle(...).getPropertyValue('--up')` into the
 * `pos`/`neg` triplets the shader needs. Re-resolve on theme / data-updown change.
 */
export function cssColorToRgb(raw: string): Rgb | null {
  const s = raw.trim();
  if (!s) return null;
  if (s[0] === "#") {
    let hex = s.slice(1);
    if (hex.length === 3) hex = hex.split("").map((ch) => ch + ch).join("");
    if (hex.length !== 6) return null;
    const n = Number.parseInt(hex, 16);
    if (Number.isNaN(n)) return null;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const m = s.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (m) return [+m[1], +m[2], +m[3]];
  return null;
}

/**
 * Resolve the pos/neg RGB pair for a metric from CSS custom properties.
 *   netprem, gamma (`gex`) → --up / --down (directional; East-Asian red-up flip aware).
 *   vanna → --metric-vanna-* (purple/orange), charm → --metric-charm-* (indigo/yellow):
 *   greek hues, NOT a bull/bear read, so they do not flip. Those pair vars are .obs-scoped
 *   (observatory.css), so pass the pane's .obs-scoped root as `at` to resolve them — falling
 *   back to documentElement (where --up/--down live) and then to the west defaults.
 * SSR-safe (returns sensible defaults with no document).
 */
export const METRIC_COLOR_VARS: Record<string, { pos: string; neg: string }> = {
  netprem: { pos: "--up", neg: "--down" },
  gamma: { pos: "--up", neg: "--down" },
  gex: { pos: "--up", neg: "--down" }, // `gex` is the gamma grid key in the snapshot store
  vanna: { pos: "--metric-vanna-pos", neg: "--metric-vanna-neg" },
  charm: { pos: "--metric-charm-pos", neg: "--metric-charm-neg" },
};

const DEFAULT_POS: Rgb = [38, 194, 129] as const; // --up west default
const DEFAULT_NEG: Rgb = [240, 86, 107] as const; // --down west default

export function resolveMetricColors(metric: string, at?: Element | null): { pos: Rgb; neg: Rgb } {
  const vars = METRIC_COLOR_VARS[metric] ?? METRIC_COLOR_VARS.netprem;
  if (typeof document === "undefined") return { pos: DEFAULT_POS, neg: DEFAULT_NEG };
  // Resolve against the pane's .obs-scoped element when given (so the greek pair vars
  // resolve), else :root (where --up/--down are defined).
  const el = at ?? document.documentElement;
  const cs = getComputedStyle(el);
  const pos = cssColorToRgb(cs.getPropertyValue(vars.pos)) ?? DEFAULT_POS;
  const neg = cssColorToRgb(cs.getPropertyValue(vars.neg)) ?? DEFAULT_NEG;
  return { pos, neg };
}

// ─── Series data + options ──────────────────────────────────────────────────

export interface HeatCell {
  low: number;
  high: number;
  amount: number;
}

/** One bar of the heat field: a time + its vertical stack of cells. */
export interface HeatData extends CustomData<Time> {
  time: Time;
  cells: HeatCell[];
}

export interface HeatSeriesOptions extends CustomSeriesOptions {
  /** Shader mapping a signed amount → rgba string. */
  cellShader: (amount: number) => string;
  /** Opacity weight 0..1 forwarded into the shader (redundant with cellShader's W;
   * kept so the plugin can be driven either way). */
  opacity: number;
}

export const heatSeriesDefaultOptions: HeatSeriesOptions = {
  ...customSeriesDefaultOptions,
  cellShader: () => "rgba(0,0,0,0)",
  opacity: 1,
  // The field is a background wash — never draw a price line or last-value label for it.
  priceLineVisible: false,
  lastValueVisible: false,
} as HeatSeriesOptions;

function isHeat(d: HeatData | WhitespaceData<Time>): d is HeatData {
  return Array.isArray((d as HeatData).cells) && (d as HeatData).cells.length > 0;
}

// ─── Renderer ───────────────────────────────────────────────────────────────

class HeatRenderer implements ICustomSeriesPaneRenderer {
  private _data: PaneRendererCustomData<Time, HeatData> | null = null;
  private _options: HeatSeriesOptions | null = null;
  private _offscreen: HTMLCanvasElement | OffscreenCanvas | null = null;

  update(
    data: PaneRendererCustomData<Time, HeatData>,
    options: HeatSeriesOptions,
  ): void {
    this._data = data;
    this._options = options;
  }

  destroy(): void {
    if (this._offscreen) {
      this._offscreen.width = 0;
      this._offscreen.height = 0;
      this._offscreen = null;
    }
    this._data = null;
    this._options = null;
  }

  draw(target: CanvasRenderingTarget2D, priceConverter: PriceToCoordinateConverter): void {
    const data = this._data;
    const options = this._options;
    if (!data || !options || !data.visibleRange) return;

    // MEDIA space: priceConverter returns CSS-pixel coords and the context is already
    // DPR-scaled, so we paint the upscaled field in CSS px (matches quanted's renderer).
    target.useMediaCoordinateSpace((scope) => {
      const ctx = scope.context;
      const { bars, barSpacing, visibleRange } = data;
      if (!visibleRange) return;
      const { from, to } = visibleRange;
      const h = to - from; // number of visible bars = grid width
      if (h <= 0) return;

      // 1. Collect the union of unique cell boundaries across visible bars.
      const boundarySet = new Set<number>();
      let minLow = Infinity;
      let maxHigh = -Infinity;
      for (let i = from; i < to; i++) {
        const bar = bars[i];
        const cells = bar?.originalData?.cells;
        if (!cells) continue;
        for (const cell of cells) {
          boundarySet.add(cell.low);
          boundarySet.add(cell.high);
          if (cell.low < minLow) minLow = cell.low;
          if (cell.high > maxHigh) maxHigh = cell.high;
        }
      }
      if (minLow >= maxHigh) return;

      const boundaries = [...boundarySet].sort((a, b) => a - b);
      const g = Math.max(1, boundaries.length - 1); // grid height (level count)

      // Boundary → row index (a cell spanning [low,high] fills the row for its `low`).
      const rowOf = new Map<number, number>();
      for (let i = 0; i < boundaries.length; i++) rowOf.set(boundaries[i], i);

      // 2. Native-resolution offscreen canvas (reused across frames when the size holds).
      if (!this._offscreen || this._offscreen.width !== h || this._offscreen.height !== g) {
        try {
          this._offscreen =
            typeof OffscreenCanvas !== "undefined"
              ? new OffscreenCanvas(h, g)
              : document.createElement("canvas");
        } catch {
          this._offscreen = document.createElement("canvas");
        }
        this._offscreen.width = h;
        this._offscreen.height = g;
      }
      const octx = this._offscreen.getContext("2d", { willReadFrequently: true }) as
        | CanvasRenderingContext2D
        | OffscreenCanvasRenderingContext2D
        | null;
      if (!octx) return;

      const img = octx.createImageData(h, g);
      const buf = img.data;
      for (let i = from; i < to; i++) {
        const bar = bars[i];
        const cells = bar?.originalData?.cells;
        if (!cells) continue;
        const col = i - from;
        for (const cell of cells) {
          const row = rowOf.get(cell.low);
          if (row === undefined || row >= g) continue;
          const yFlipped = g - 1 - row; // highest price at the top row
          const [r, gg, b, a] = parseRgba(options.cellShader(cell.amount));
          const px = (yFlipped * h + col) * 4;
          buf[px] = r;
          buf[px + 1] = gg;
          buf[px + 2] = b;
          buf[px + 3] = a;
        }
      }
      octx.putImageData(img, 0, 0);

      // 3. Blit the tiny grid to the plot rect with high-quality upscale.
      const first = bars[from];
      const last = bars[to - 1];
      if (!first || !last) return;
      const halfBar = barSpacing / 2;
      const xLeft = first.x - halfBar;
      const xRight = last.x + halfBar;
      const yHigh = priceConverter(maxHigh);
      const yLow = priceConverter(minLow);
      if (yHigh === null || yLow === null) return;
      const yTop = Math.min(yHigh, yLow);
      const height = Math.abs(yLow - yHigh);
      if (height <= 0 || xRight <= xLeft) return;

      const prevSmoothing = ctx.imageSmoothingEnabled;
      const prevQuality = ctx.imageSmoothingQuality;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(
        this._offscreen as CanvasImageSource,
        0,
        0,
        h,
        g,
        xLeft,
        yTop,
        xRight - xLeft,
        height,
      );
      ctx.imageSmoothingEnabled = prevSmoothing;
      ctx.imageSmoothingQuality = prevQuality;
    });
  }
}

// ─── Pane view ──────────────────────────────────────────────────────────────

/**
 * HeatSeries — the ICustomSeriesPaneView the chart consumes.
 *
 * Usage:
 *   const view = new HeatSeries();
 *   const series = chart.addCustomSeries(view, { cellShader, opacity });
 *   series.setData(bars);   // bars: { time, cells:[{low,high,amount}] }[]
 */
export class HeatSeries implements ICustomSeriesPaneView<Time, HeatData, HeatSeriesOptions> {
  private _renderer = new HeatRenderer();

  renderer(): ICustomSeriesPaneRenderer {
    return this._renderer;
  }

  update(
    data: PaneRendererCustomData<Time, HeatData>,
    options: HeatSeriesOptions,
  ): void {
    // Fold the conflation factor into barSpacing so wide zoom-outs still tile flush.
    this._renderer.update(
      {
        ...data,
        barSpacing: data.barSpacing * data.conflationFactor,
      } as PaneRendererCustomData<Time, HeatData>,
      options,
    );
  }

  priceValueBuilder(plotRow: HeatData): CustomSeriesPricePlotValues {
    if (!plotRow.cells || plotRow.cells.length === 0) return [0, 0, 0];
    let lo = Infinity;
    let hi = -Infinity;
    for (const c of plotRow.cells) {
      if (c.low < lo) lo = c.low;
      if (c.high > hi) hi = c.high;
    }
    return [lo, hi, (lo + hi) / 2];
  }

  isWhitespace(d: HeatData | WhitespaceData<Time>): d is WhitespaceData<Time> {
    return !isHeat(d);
  }

  defaultOptions(): HeatSeriesOptions {
    return heatSeriesDefaultOptions;
  }

  destroy(): void {
    this._renderer.destroy();
  }
}
