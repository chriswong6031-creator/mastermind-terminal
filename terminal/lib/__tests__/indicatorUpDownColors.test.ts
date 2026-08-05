/**
 * Directional indicator colors follow the operator's Up/Down colors setting.
 *
 * lightweight-charts paints to canvas and cannot resolve var(--up)/var(--down), so the registry —
 * not CSS — is what decides whether Stoch RSI's crossover bars, the MACD histogram, the Ichimoku
 * cloud or the volume fills read green-up (west) or red-up (east, html[data-updown="east"]).
 *
 * The two properties that matter, and the only two worth defending:
 *   1. a param still holding a convention default MOVES with the setting;
 *   2. a color the user actually picked NEVER moves, in either direction.
 */
import { describe, it, expect, afterEach } from "vitest";
import { IND_DEFS, DIR_FIELDS, indDefaults, withDefaults, isEastUpDown } from "@/lib/indicators";

// The suite runs on the node environment (no jsdom in this repo) and the registry reads exactly one
// attribute off <html>, so a two-method stand-in is the whole DOM surface under test. Deleting it
// between cases also covers the SSR path, where `document` is genuinely absent.
let attr: string | null = null;
const g = globalThis as any;
const setUpDown = (v: "west" | "east") => {
  attr = v;
  g.document = { documentElement: { getAttribute: (n: string) => (n === "data-updown" ? attr : null) } };
};
afterEach(() => { attr = null; delete g.document; });

// The registry literals: west greens and their east (red) counterparts, web palette.
const WEST_GREEN = "#26c281", WEST_RED = "#f0566b";

describe("isEastUpDown", () => {
  it("is false with no attribute (SSR + the western default) and true only for east", () => {
    expect(isEastUpDown()).toBe(false);
    setUpDown("west"); expect(isEastUpDown()).toBe(false);
    setUpDown("east"); expect(isEastUpDown()).toBe(true);
  });
});

describe("directional defaults follow the setting", () => {
  it("west leaves the registry pair alone", () => {
    setUpDown("west");
    const p = indDefaults("stochrsi");
    expect(p.kCol).toBe(WEST_GREEN);
    expect(p.dCol).toBe(WEST_RED);
  });

  it("east swaps the pair, so %K rides the up hue in both conventions", () => {
    setUpDown("east");
    const p = indDefaults("stochrsi");
    expect(p.kCol).toBe(WEST_RED);
    expect(p.dCol).toBe(WEST_GREEN);
  });

  it("swaps every declared directional field of every indicator, alpha and notation intact", () => {
    for (const [key, fields] of Object.entries(DIR_FIELDS)) {
      for (const field of Object.keys(fields!)) {
        setUpDown("west");
        const west = indDefaults(key)[field];
        setUpDown("east");
        const east = indDefaults(key)[field];
        expect(west, `${key}.${field} west`).toBe((IND_DEFS as any)[key].defaults[field]);
        expect(east, `${key}.${field} east`).not.toBe(west);
        // only the RGB triple moves — an rgba() default keeps its alpha, a hex stays a hex
        const notation = (v: string) => (v.startsWith("#") ? `hex${v.length}` : v.slice(0, v.indexOf("(") + 1));
        expect(notation(String(east)), `${key}.${field} notation`).toBe(notation(String(west)));
        if (String(west).startsWith("rgba(")) {
          expect(String(east).split(",").pop(), `${key}.${field} alpha`).toBe(String(west).split(",").pop());
        }
      }
    }
  });

  it("re-normalizes a blob persisted under the OTHER convention (the flip is symmetric)", () => {
    setUpDown("east");
    expect(withDefaults("vol", { upCol: IND_DEFS.vol.defaults.upCol }).upCol)
      .toBe(indDefaults("vol").upCol);
    setUpDown("west");
    expect(withDefaults("vol", { upCol: indDefaults("vol").downCol }).upCol)
      .toBe(IND_DEFS.vol.defaults.upCol);
  });
});

describe("an explicit user color always wins over the setting", () => {
  it("keeps a custom hex under east", () => {
    setUpDown("east");
    expect(withDefaults("stochrsi", { kCol: "#00bcd4", dCol: "#d4ac0d" }))
      .toMatchObject({ kCol: "#00bcd4", dCol: "#d4ac0d" });
  });

  it("keeps a custom rgba under east", () => {
    setUpDown("east");
    expect(withDefaults("ichimoku", { spanACol: "rgba(77,130,255,0.18)" }).spanACol)
      .toBe("rgba(77,130,255,0.18)");
  });

  it("keeps a directional hue the user re-tinted — same family, different alpha", () => {
    setUpDown("east");
    expect(withDefaults("ribbon", { fillUp: "rgba(38,194,129,0.5)" }).fillUp)
      .toBe("rgba(38,194,129,0.5)");
  });
});

describe("non-directional colors are never touched", () => {
  it("leaves the RSI Stack palette and the σ-band colors alone under east", () => {
    setUpDown("east");
    const stack = indDefaults("rsistack"), vwap = indDefaults("svwap");
    expect(stack.col1).toBe(IND_DEFS.rsistack.defaults.col1);   // one of three lengths, not a direction
    expect(vwap.b3Col).toBe(IND_DEFS.svwap.defaults.b3Col);     // ±3σ magnitude, not a direction
  });

  it("leaves inputs, widths and _vis untouched", () => {
    setUpDown("east");
    const p = withDefaults("stochrsi", { length: 21 });
    expect(p.length).toBe(21);
    expect(p.smoothK).toBe(IND_DEFS.stochrsi.defaults.smoothK);
    expect(p.width).toBe(IND_DEFS.stochrsi.defaults.width);
    expect(p._vis.days.on).toBe(true);
  });
});
