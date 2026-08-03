import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  PRESETS,
  PRESET_KEYS,
  THEME_METRICS,
  METRIC_VAR,
  DEFAULT_THEME,
  THEME_STORAGE_KEY,
  effectivePair,
  isHex,
  themeSignature,
  applySurfaceTheme,
  parseTheme,
  serializeTheme,
  loadTheme,
  saveTheme,
  nextThemeForPreset,
  type SurfaceTheme,
} from "@/components/surface/surfaceTheme";

// The suite runs in vitest's NODE environment (no jsdom in this repo — see
// heatSeries.test.ts "no document" case). These stubs give the two DOM surfaces the
// module actually touches: element.style set/removeProperty, and window.localStorage.

/** Minimal CSSStyleDeclaration stand-in that records inline custom properties. */
function styleStub() {
  const props = new Map<string, string>();
  const el = {
    style: {
      setProperty: (k: string, v: string) => void props.set(k, v),
      removeProperty: (k: string) => void props.delete(k),
      getPropertyValue: (k: string) => props.get(k) ?? "",
    },
  };
  return { el: el as unknown as HTMLElement, props };
}

/** In-memory Storage stand-in; `explode` simulates private-mode / quota failures. */
function storageStub(explode = false) {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => {
      if (explode) throw new Error("QuotaExceededError");
      map.set(k, v);
    },
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: () => null,
    length: 0,
  } as unknown as Storage;
}

describe("presets", () => {
  it("`default` is null — it inherits the directional tokens rather than freezing a hex", () => {
    // This is what keeps the East-Asian 红涨绿跌 flip alive on the default theme.
    expect(PRESETS.default).toBeNull();
  });

  it("exposes exactly four presets", () => {
    expect(PRESET_KEYS).toEqual(["default", "colorblind", "mono", "classic"]);
  });

  it("every non-default preset covers every metric with valid hex pairs", () => {
    for (const key of PRESET_KEYS) {
      const p = PRESETS[key];
      if (!p) continue;
      for (const m of THEME_METRICS) {
        expect(isHex(p[m].pos), `${key}.${m}.pos`).toBe(true);
        expect(isHex(p[m].neg), `${key}.${m}.neg`).toBe(true);
      }
    }
  });

  it("colorblind preset avoids a red/green divergent pair", () => {
    // blue/orange: the point of the preset is that pos and neg stay separable for
    // deuteranopia/protanopia viewers, for whom red/green is the ambiguous pair.
    expect(PRESETS.colorblind!.netprem).toEqual({ pos: "#3b82f6", neg: "#f59e0b" });
  });

  it("mono preset uses one neutral ramp so sign reads as lightness", () => {
    const { pos, neg } = PRESETS.mono!.netprem;
    const lum = (h: string) => {
      const n = Number.parseInt(h.slice(1), 16);
      return ((n >> 16) & 255) + ((n >> 8) & 255) + (n & 255);
    };
    expect(lum(pos)).toBeGreaterThan(lum(neg));
  });
});

describe("effectivePair", () => {
  it("returns null on the default preset (inherit CSS)", () => {
    expect(effectivePair(DEFAULT_THEME, "netprem")).toBeNull();
  });

  it("returns the preset pair for an explicit preset", () => {
    expect(effectivePair({ preset: "classic", custom: {} }, "netprem")).toEqual({
      pos: "#00c853",
      neg: "#ff1744",
    });
  });

  it("a custom override beats the preset", () => {
    const theme: SurfaceTheme = { preset: "classic", custom: { netprem: { pos: "#111111", neg: "#222222" } } };
    expect(effectivePair(theme, "netprem")).toEqual({ pos: "#111111", neg: "#222222" });
    // untouched metrics still follow the preset
    expect(effectivePair(theme, "vanna")).toEqual(PRESETS.classic!.vanna);
  });

  it("a custom override on top of `default` applies to that metric only", () => {
    const theme: SurfaceTheme = { preset: "default", custom: { vanna: { pos: "#abcdef", neg: "#fedcba" } } };
    expect(effectivePair(theme, "vanna")).toEqual({ pos: "#abcdef", neg: "#fedcba" });
    expect(effectivePair(theme, "netprem")).toBeNull();
  });

  it("ignores a malformed custom pair rather than injecting it", () => {
    const theme = {
      preset: "default",
      custom: { netprem: { pos: "red; background:url(x)", neg: "#fff" } },
    } as unknown as SurfaceTheme;
    expect(effectivePair(theme, "netprem")).toBeNull();
  });
});

describe("isHex", () => {
  it("accepts #rgb and #rrggbb", () => {
    expect(isHex("#fff")).toBe(true);
    expect(isHex("#26C281")).toBe(true);
  });
  it("rejects everything else (no unvalidated CSS reaches setProperty)", () => {
    for (const bad of ["red", "var(--up)", "#12", "#1234567", "rgb(1,2,3)", "", null, 5, undefined]) {
      expect(isHex(bad as unknown)).toBe(false);
    }
  });
});

describe("themeSignature", () => {
  it("is stable for equivalent themes and changes when a colour changes", () => {
    const a = themeSignature({ preset: "classic", custom: {} });
    const b = themeSignature({ preset: "classic", custom: {} });
    const c = themeSignature({ preset: "mono", custom: {} });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
  it("marks inherited metrics distinctly from coloured ones", () => {
    expect(themeSignature(DEFAULT_THEME)).toContain("netprem:~");
    expect(themeSignature({ preset: "mono", custom: {} })).not.toContain("netprem:~");
  });
  it("reflects a custom override", () => {
    const a = themeSignature({ preset: "mono", custom: {} });
    const b = themeSignature({ preset: "mono", custom: { charm: { pos: "#000", neg: "#fff" } } });
    expect(a).not.toBe(b);
  });
});

describe("applySurfaceTheme — writes/removes CSS custom properties", () => {
  it("sets every metric pair for an explicit preset", () => {
    const { el, props } = styleStub();
    applySurfaceTheme(el, { preset: "classic", custom: {} });
    expect(props.get(METRIC_VAR.netprem.pos)).toBe("#00c853");
    expect(props.get(METRIC_VAR.netprem.neg)).toBe("#ff1744");
    expect(props.get(METRIC_VAR.charm.pos)).toBe("#2979ff");
    expect(props.size).toBe(THEME_METRICS.length * 2);
  });

  it("REMOVES the properties for the default preset so the stylesheet default wins back", () => {
    const { el, props } = styleStub();
    applySurfaceTheme(el, { preset: "classic", custom: {} });
    expect(props.size).toBeGreaterThan(0);
    applySurfaceTheme(el, DEFAULT_THEME);
    // nothing inline → falls back to observatory.css (var(--up)/var(--down))
    expect(props.size).toBe(0);
  });

  it("switching presets replaces rather than accumulates", () => {
    const { el, props } = styleStub();
    applySurfaceTheme(el, { preset: "classic", custom: {} });
    applySurfaceTheme(el, { preset: "mono", custom: {} });
    expect(props.get(METRIC_VAR.netprem.pos)).toBe("#d8dbe3");
    expect(props.size).toBe(THEME_METRICS.length * 2);
  });

  it("writes only the overridden metric when the preset is default", () => {
    const { el, props } = styleStub();
    applySurfaceTheme(el, { preset: "default", custom: { vanna: { pos: "#abcdef", neg: "#fedcba" } } });
    expect(props.get(METRIC_VAR.vanna.pos)).toBe("#abcdef");
    expect(props.has(METRIC_VAR.netprem.pos)).toBe(false);
  });

  it("is a no-op on a null element (SSR / unmounted ref)", () => {
    expect(() => applySurfaceTheme(null, DEFAULT_THEME)).not.toThrow();
  });
});

describe("persistence", () => {
  const g = globalThis as unknown as { window?: unknown };
  const hadWindow = "window" in g;
  const prevWindow = g.window;

  beforeEach(() => {
    g.window = { localStorage: storageStub() };
  });
  afterEach(() => {
    if (hadWindow) g.window = prevWindow;
    else delete g.window;
  });

  it("survives serialize → parse unchanged", () => {
    const theme: SurfaceTheme = { preset: "mono", custom: { vanna: { pos: "#abcdef", neg: "#fedcba" } }, contrast: "raw" };
    expect(parseTheme(serializeTheme(theme))).toEqual(theme);
  });

  it("save → load round-trips through localStorage under the versioned key", () => {
    const theme: SurfaceTheme = { preset: "colorblind", custom: { charm: { pos: "#101010", neg: "#202020" } }, contrast: "balanced" };
    saveTheme(theme);
    expect(loadTheme()).toEqual(theme);
    const storage = (g.window as { localStorage: Storage }).localStorage;
    expect(storage.getItem(THEME_STORAGE_KEY)).toBeTruthy();
  });

  it("loads the default when nothing is stored", () => {
    expect(loadTheme()).toEqual(DEFAULT_THEME);
  });

  it("degrades to the default on malformed / hostile stored values", () => {
    expect(parseTheme(null)).toEqual(DEFAULT_THEME);
    expect(parseTheme("not json")).toEqual(DEFAULT_THEME);
    expect(parseTheme("[]")).toEqual(DEFAULT_THEME);
    // unknown preset name is dropped, not trusted
    expect(parseTheme('{"preset":"neon"}')).toEqual(DEFAULT_THEME);
  });

  it("strips a non-hex custom colour from stored state", () => {
    const hostile = '{"preset":"default","custom":{"netprem":{"pos":"url(javascript:1)","neg":"#fff"}}}';
    expect(parseTheme(hostile)).toEqual({ preset: "default", custom: {}, contrast: "balanced" });
  });

  it("keeps valid custom entries while dropping invalid siblings", () => {
    const mixed =
      '{"preset":"mono","custom":{"netprem":{"pos":"#111","neg":"#222"},"charm":{"pos":"nope","neg":"#333"}}}';
    expect(parseTheme(mixed)).toEqual({ preset: "mono", custom: { netprem: { pos: "#111", neg: "#222" } }, contrast: "balanced" });
  });

  // ── R1.4 contrast field — a SEPARATE persisted axis from preset/custom (intensity,
  // not hue). "Toggle states persist sanely": the SurfaceStylePopover Contrast toggle
  // rides the same THEME_STORAGE_KEY as the preset it sits beside in the popover.
  it("round-trips an explicit \"raw\" contrast through serialize → parse", () => {
    const theme: SurfaceTheme = { preset: "default", custom: {}, contrast: "raw" };
    expect(parseTheme(serializeTheme(theme)).contrast).toBe("raw");
  });

  it("degrades a missing contrast field (pre-R1.4 stored theme) to balanced", () => {
    const preR14 = '{"preset":"classic","custom":{}}';
    expect(parseTheme(preR14).contrast).toBe("balanced");
  });

  it("degrades an unknown contrast value to balanced, never trusting it", () => {
    expect(parseTheme('{"preset":"default","custom":{},"contrast":"extreme"}').contrast).toBe("balanced");
  });

  it("serializeTheme always writes an explicit contrast value, even when the input theme omits it", () => {
    const legacy = { preset: "default", custom: {} } as SurfaceTheme;
    expect(JSON.parse(serializeTheme(legacy)).contrast).toBe("balanced");
  });

  it("a blocked/full localStorage never breaks the pane", () => {
    g.window = { localStorage: storageStub(true) };
    expect(() => saveTheme({ preset: "mono", custom: {} })).not.toThrow();
  });
});

// F2: real tests of the extracted transform — the previous version of this suite
// re-implemented `{ preset: next, custom: {}, contrast: theme.contrast }` inline and
// asserted that literal against itself (a tautology that could never fail regardless of
// what SurfaceStylePopover's setPreset actually did). These call the exported function.
describe("nextThemeForPreset", () => {
  it("preset switch preserves the existing contrast choice", () => {
    // Regression guard: setPreset in SurfaceStylePopover used to construct a brand-new
    // theme object (`{ preset, custom: {} }`) that silently dropped `contrast`.
    const theme: SurfaceTheme = { preset: "classic", custom: {}, contrast: "raw" };
    expect(nextThemeForPreset(theme, "mono")).toEqual({ preset: "mono", custom: {}, contrast: "raw" });
  });

  it("preset switch clears hand-tuned per-metric overrides", () => {
    const theme: SurfaceTheme = {
      preset: "default",
      custom: { netprem: { pos: "#111111", neg: "#222222" } },
      contrast: "balanced",
    };
    expect(nextThemeForPreset(theme, "classic")).toEqual({ preset: "classic", custom: {}, contrast: "balanced" });
  });

  it("a legacy theme blob with no contrast field degrades to balanced", () => {
    const legacy = { preset: "classic", custom: {} } as SurfaceTheme;
    expect(nextThemeForPreset(legacy, "mono").contrast).toBe("balanced");
  });

  it("never trusts an unknown/hostile stored contrast value either", () => {
    const hostile = { preset: "classic", custom: {}, contrast: "extreme" } as unknown as SurfaceTheme;
    expect(nextThemeForPreset(hostile, "mono").contrast).toBe("balanced");
  });
});
