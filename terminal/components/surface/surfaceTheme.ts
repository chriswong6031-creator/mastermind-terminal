/**
 * surfaceTheme.ts — the surface field's colour engine: per-metric positive/negative
 * pairs, a small set of presets, and localStorage persistence.
 *
 * HOW IT DRIVES THE SHADER
 *   lib/heatSeries `resolveMetricColors(metric, at)` reads the pair from CSS custom
 *   properties (METRIC_COLOR_VARS) resolved against a given element. This module writes
 *   those same properties as inline style on the surface root, so a theme change is a
 *   CSS-variable write plus a shader re-apply — no chart teardown, no remount.
 *
 * THE DEFAULT PRESET IS NOT A COLOUR
 *   `default` REMOVES the inline overrides so the properties fall back to their
 *   observatory.css definitions, which are `var(--up)` / `var(--down)` for the
 *   directional metrics (net premium, gamma). That is what keeps the East-Asian
 *   红涨绿跌 flip working — the field follows the directional tokens rather than a
 *   frozen hex. Picking an explicit palette is opting out of that flip, by choice.
 *
 * Pure + DOM-free except `applySurfaceTheme` (which takes the element), so the preset
 * table, persistence and serialization are unit-testable.
 */

/** Metric keys the field can paint. `gex` is the gamma grid's key in the snapshot store. */
export const THEME_METRICS = ["netprem", "gex", "vanna", "charm"] as const;
export type ThemeMetric = (typeof THEME_METRICS)[number];

export interface ColorPair {
  pos: string;
  neg: string;
}
export type SurfacePalette = Record<ThemeMetric, ColorPair>;

export type PresetKey = "default" | "colorblind" | "mono" | "classic";
export const PRESET_KEYS: PresetKey[] = ["default", "colorblind", "mono", "classic"];

export interface SurfaceTheme {
  preset: PresetKey;
  /** Per-metric overrides layered ON TOP of the preset (a custom picker edit). */
  custom: Partial<SurfacePalette>;
}

export const DEFAULT_THEME: SurfaceTheme = { preset: "default", custom: {} };

/**
 * Preset palettes. `default` is intentionally null — it means "inherit the theme's
 * directional tokens" (see the module note), not a hard-coded pair.
 *
 *   colorblind — blue/orange: the standard deuteranopia- and protanopia-safe divergent
 *                pair; red/green is exactly the pair those viewers cannot separate.
 *   mono       — one neutral ramp, light vs dark: the field reads as MAGNITUDE, with
 *                sign carried by lightness. For printing and for viewers who want the
 *                candles to be the only coloured thing on the pane.
 *   classic    — saturated terminal green/red.
 */
export const PRESETS: Record<PresetKey, SurfacePalette | null> = {
  default: null,
  colorblind: {
    netprem: { pos: "#3b82f6", neg: "#f59e0b" },
    gex: { pos: "#3b82f6", neg: "#f59e0b" },
    vanna: { pos: "#8b5cf6", neg: "#eab308" },
    charm: { pos: "#0ea5e9", neg: "#fb923c" },
  },
  mono: {
    netprem: { pos: "#d8dbe3", neg: "#5a6070" },
    gex: { pos: "#d8dbe3", neg: "#5a6070" },
    vanna: { pos: "#cfd3dd", neg: "#4e5464" },
    charm: { pos: "#c6cad6", neg: "#464c5c" },
  },
  classic: {
    netprem: { pos: "#00c853", neg: "#ff1744" },
    gex: { pos: "#00c853", neg: "#ff1744" },
    vanna: { pos: "#aa00ff", neg: "#ff6d00" },
    charm: { pos: "#2979ff", neg: "#ffd600" },
  },
};

/** CSS custom-property names per metric — must match lib/heatSeries METRIC_COLOR_VARS. */
export const METRIC_VAR: Record<ThemeMetric, ColorPair> = {
  netprem: { pos: "--metric-netprem-pos", neg: "--metric-netprem-neg" },
  gex: { pos: "--metric-gamma-pos", neg: "--metric-gamma-neg" },
  vanna: { pos: "--metric-vanna-pos", neg: "--metric-vanna-neg" },
  charm: { pos: "--metric-charm-pos", neg: "--metric-charm-neg" },
};

/**
 * The effective pair for a metric: a custom override wins over the preset; a preset of
 * `default` (or a metric the preset omits) resolves to null = "inherit the CSS default".
 */
export function effectivePair(theme: SurfaceTheme, metric: ThemeMetric): ColorPair | null {
  const custom = theme.custom?.[metric];
  if (custom && isHex(custom.pos) && isHex(custom.neg)) return custom;
  const preset = PRESETS[theme.preset];
  return preset ? preset[metric] : null;
}

/** #rgb / #rrggbb only — the pickers emit hex and we never inject unvalidated CSS. */
export function isHex(v: unknown): v is string {
  return typeof v === "string" && /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v);
}

/**
 * A short signature of the theme's rendered effect. SurfacePane keys its colour
 * re-resolve effect on this, so a no-op edit doesn't churn the chart.
 */
export function themeSignature(theme: SurfaceTheme): string {
  return THEME_METRICS.map((m) => {
    const p = effectivePair(theme, m);
    return p ? `${m}:${p.pos}/${p.neg}` : `${m}:~`;
  }).join("|");
}

/**
 * The theme as a React inline-style object of custom properties.
 *
 * Preferred over `applySurfaceTheme` for the live surface: rendering the properties puts
 * them on the DOM during commit, BEFORE any effect runs. Setting them from an effect races
 * the panes, which re-resolve their colours in their own (child-first) effects and would
 * read the previous palette.
 *
 * Metrics resolving to null are simply absent, so the stylesheet default —
 * var(--up)/var(--down) for the directional metrics — applies as usual.
 */
export function surfaceThemeVars(theme: SurfaceTheme): Record<string, string> {
  const out: Record<string, string> = {};
  for (const metric of THEME_METRICS) {
    const pair = effectivePair(theme, metric);
    if (!pair) continue;
    out[METRIC_VAR[metric].pos] = pair.pos;
    out[METRIC_VAR[metric].neg] = pair.neg;
  }
  return out;
}

/**
 * Write the theme onto an element as inline custom properties. Metrics resolving to
 * null have their property REMOVED so the stylesheet default (var(--up)/var(--down) for
 * the directional metrics) takes over again. Imperative counterpart of
 * `surfaceThemeVars`, kept for non-React callers and covered by the same tests.
 */
export function applySurfaceTheme(el: HTMLElement | null, theme: SurfaceTheme): void {
  if (!el) return;
  for (const metric of THEME_METRICS) {
    const vars = METRIC_VAR[metric];
    const pair = effectivePair(theme, metric);
    if (pair) {
      el.style.setProperty(vars.pos, pair.pos);
      el.style.setProperty(vars.neg, pair.neg);
    } else {
      el.style.removeProperty(vars.pos);
      el.style.removeProperty(vars.neg);
    }
  }
}

// ─── Persistence ─────────────────────────────────────────────────────────────

export const THEME_STORAGE_KEY = "mm.surface.theme.v1";

/**
 * Parse a stored theme defensively: an unknown preset, a non-hex colour, or any
 * malformed shape degrades to the default rather than throwing or injecting CSS.
 */
export function parseTheme(raw: string | null): SurfaceTheme {
  if (!raw) return DEFAULT_THEME;
  try {
    const o = JSON.parse(raw) as Partial<SurfaceTheme>;
    const preset = PRESET_KEYS.includes(o?.preset as PresetKey) ? (o.preset as PresetKey) : "default";
    const custom: Partial<SurfacePalette> = {};
    const src = (o?.custom ?? {}) as Record<string, unknown>;
    for (const metric of THEME_METRICS) {
      const pair = src[metric] as ColorPair | undefined;
      if (pair && isHex(pair.pos) && isHex(pair.neg)) custom[metric] = { pos: pair.pos, neg: pair.neg };
    }
    return { preset, custom };
  } catch {
    return DEFAULT_THEME;
  }
}

export function serializeTheme(theme: SurfaceTheme): string {
  return JSON.stringify({ preset: theme.preset, custom: theme.custom ?? {} });
}

/** SSR-safe read (returns the default with no window). */
export function loadTheme(): SurfaceTheme {
  if (typeof window === "undefined") return DEFAULT_THEME;
  try {
    return parseTheme(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return DEFAULT_THEME;
  }
}

/** SSR-safe write; a full/blocked quota must never break the pane. */
export function saveTheme(theme: SurfaceTheme): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, serializeTheme(theme));
  } catch {
    /* private mode / quota — the theme just doesn't persist */
  }
}
