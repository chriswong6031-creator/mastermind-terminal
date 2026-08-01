/**
 * theme.ts — the embed widget's palette, derived verbatim from the Terminal's locked v5 design
 * tokens (app/globals.css) so an embedded chart reads as the SAME product as the Terminal.
 *
 * Candle up/down are IDENTICAL across themes (brand recognition). Only the surface/text/grid
 * neutrals flip between dark and light. `transparent` mode zeroes the page + chart background so
 * the parent's frosted-glass card shows through (LWC layout.background = 'transparent').
 */

import type { ThemeName } from "./chartData";

export interface EmbedPalette {
  /** Page background (behind the chart). "transparent" when transparent=1. */
  pageBg: string;
  /** Chart plot-area background passed to LWC layout.background.color. */
  chartBg: string;
  text: string;
  textDim: string;
  muted: string;
  grid: string;
  axisLine: string;
  crosshair: string;
  crosshairLabelBg: string;
  /** Candle + volume up/down — house v5, identical in both themes. */
  up: string;
  down: string;
  /** Muted volume tints (candles' color at low alpha) so the histogram never fights the price. */
  volUp: string;
  volDown: string;
  /** SMA overlay colors — deliberately muted so overlays stay demoted under the candles. */
  sma50: string;
  sma200: string;
  brand: string;
  /** Chip / control surface + border on the header. */
  chipBg: string;
  chipActiveBg: string;
  chipBorder: string;
  /** Skeleton shimmer base + highlight. */
  skelBase: string;
  skelHi: string;
}

const CANDLE_UP = "#26c281";
const CANDLE_DOWN = "#f0566b";
// SMA overlays: muted amber (50) + muted steel-blue (200). Distinct from the candle greens/reds
// and from the #2962ff brand so all four lines stay legible together.
const SMA_50 = "#e8a33d";
const SMA_200 = "#6f8fd6";

const DARK: EmbedPalette = {
  pageBg: "#0a0b0e",
  chartBg: "#131722",
  text: "#d6dae3",
  textDim: "#717a8e",
  muted: "#9ba3b4",
  grid: "rgba(255,255,255,.045)",
  axisLine: "#23262f",
  crosshair: "rgba(214,218,227,.32)",
  crosshairLabelBg: "#1f222b",
  up: CANDLE_UP,
  down: CANDLE_DOWN,
  volUp: "rgba(38,194,129,.34)",
  volDown: "rgba(240,86,107,.34)",
  sma50: SMA_50,
  sma200: SMA_200,
  brand: "#4d82ff",
  chipBg: "rgba(255,255,255,.04)",
  chipActiveBg: "rgba(77,130,255,.16)",
  chipBorder: "rgba(255,255,255,.09)",
  skelBase: "rgba(255,255,255,.035)",
  skelHi: "rgba(255,255,255,.08)",
};

const LIGHT: EmbedPalette = {
  pageBg: "#ffffff",
  chartBg: "#fbfcfe",
  text: "#1a1d24",
  textDim: "#6b7280",
  muted: "#4a5160",
  grid: "rgba(15,23,42,.06)",
  axisLine: "#e3e7ee",
  crosshair: "rgba(26,29,36,.28)",
  crosshairLabelBg: "#2a2e38",
  up: CANDLE_UP,
  down: CANDLE_DOWN,
  volUp: "rgba(38,194,129,.30)",
  volDown: "rgba(240,86,107,.30)",
  sma50: "#c9821f",
  sma200: "#4d6fc0",
  brand: "#2962ff",
  chipBg: "rgba(15,23,42,.04)",
  chipActiveBg: "rgba(41,98,255,.12)",
  chipBorder: "rgba(15,23,42,.10)",
  skelBase: "rgba(15,23,42,.04)",
  skelHi: "rgba(15,23,42,.08)",
};

/**
 * CLEAN — the TV symbol-sheet mini-chart palette, measured off the reference stills in
 * docs/tv-parity/spec-symbol-detail.md (§0 global palette + §2B chart plot area).
 *
 * Deliberately DIFFERENT from the house v5 candles above: TV's sheet chart runs a brighter
 * teal/red pair (#22AB94 / #F7525F) on a quiet canvas — no vertical gridlines, ~5% white
 * horizontals, #B1B5BE axis text, no scale borders. Only reachable via ?clean=1; the default
 * widget (and every existing embed) keeps the house palette byte-for-byte.
 */
export interface CleanOverlay {
  /** Measured TV bull/bear (spec §0). */
  up: string;
  down: string;
  /** Axis tick text (spec §2B right price axis + time ticks). */
  axisText: string;
  /** Horizontal gridline wash — verticals are switched off entirely. */
  grid: string;
  /** The dashed prior-session-close rule TV draws across the plot. */
  priorClose: string;
}

export const CLEAN: CleanOverlay = {
  up: "#22AB94",
  down: "#F7525F",
  axisText: "#B1B5BE",
  grid: "rgba(255,255,255,.05)",
  priorClose: "rgba(180,185,195,.5)",
};

/**
 * palette — resolve the effective palette for a theme + transparent flag.
 * `clean` (opt-in, ?clean=1) swaps the candle/axis/grid neutrals for the measured TV
 * mini-chart values; every other consumer is untouched because it never passes the flag.
 */
export function palette(theme: ThemeName, transparent: boolean, clean = false): EmbedPalette {
  const base0 = theme === "light" ? LIGHT : DARK;
  const base = clean
    ? { ...base0, up: CLEAN.up, down: CLEAN.down, muted: CLEAN.axisText, grid: CLEAN.grid }
    : base0;
  if (!transparent) return base;
  // Transparent mode: the parent's glass card is the background. Zero both page + chart bg.
  return { ...base, pageBg: "transparent", chartBg: "transparent" };
}
