import { describe, it, expect } from "vitest";
import { readFile } from "fs/promises";
import path from "path";
import { normalizePinProbability } from "@/components/gexdesk/MarketStateCard";

/**
 * Bug B6 — the GEX desk's PIN TARGET probability arrives on two scales:
 *   fixture / documented schema: `pin_target.probability`  0-100
 *   live gex_state payload:      `pin_probability`         0..1
 * The card multiplied by 100 unconditionally, so a 55% pin from the percent-scaled
 * producer rendered "5500% prob".
 *
 * Follow-up fix — the B6 guard replaced the unconditional ×100 with a VALUE-SHAPE
 * heuristic (raw <= 1 ? raw*100 : raw), which is wrong in exactly the direction that
 * matters: a PERCENT-scale value in (0, 1] — e.g. 1, meaning a 1% confidence read on a
 * far/weak magnet — was scaled to 100%, the maximum-confidence reading. The scale is a
 * property of the FIELD, never of the value, so the caller now says which field it read
 * (`"percent"` for `pin_target.probability`, `"fraction"` for `pin_probability`) and the
 * value-shape heuristic (`"auto"`) is reserved for an unforeseen third producer — and even
 * then it returns null rather than guess inside the ambiguous (0, 1] seam.
 */
describe("normalizePinProbability — per-field scale (percent | fraction)", () => {
  it('scale "fraction" (pin_probability, 0..1) always multiplies', () => {
    expect(normalizePinProbability(0.541, "fraction")).toBe(54);
    expect(normalizePinProbability(0.5, "fraction")).toBe(50);
    expect(normalizePinProbability(0, "fraction")).toBe(0);
    expect(normalizePinProbability(1, "fraction")).toBe(100);
  });

  it('scale "percent" (pin_target.probability, 0-100) never multiplies', () => {
    expect(normalizePinProbability(55, "percent")).toBe(55);
    expect(normalizePinProbability(54.1, "percent")).toBe(54);
    expect(normalizePinProbability(100, "percent")).toBe(100);
    expect(normalizePinProbability(0, "percent")).toBe(0);
  });

  it("REGRESSION: a PERCENT-scale value in (0,1] no longer gets multiplied into a false near-100% read", () => {
    // The exact failure mode: a low-confidence far-magnet reading of 1 (meaning 1%) or
    // 0.8 (meaning 0.8%) must render near-zero, not near-certain.
    const oldGuess = (raw: number) => Math.max(0, Math.min(100, Math.round(raw <= 1 ? raw * 100 : raw)));
    expect(oldGuess(1)).toBe(100); // proof of the old bug
    expect(oldGuess(0.8)).toBe(80); // proof of the old bug
    expect(normalizePinProbability(1, "percent")).toBe(1);
    expect(normalizePinProbability(0.8, "percent")).toBe(1); // rounds to 1%, not 80%
  });

  it("clamps out-of-range values instead of rendering them, on either scale", () => {
    expect(normalizePinProbability(180, "percent")).toBe(100);
    expect(normalizePinProbability(1e6, "percent")).toBe(100);
    expect(normalizePinProbability(1.8, "fraction")).toBe(100);
  });

  it("returns null for absent / unusable input so the card can print an em dash", () => {
    // Previously an absent probability fell through to a literal 0 and rendered
    // "0% prob" — a confident claim built out of missing data.
    expect(normalizePinProbability(null, "fraction")).toBeNull();
    expect(normalizePinProbability(undefined, "percent")).toBeNull();
    expect(normalizePinProbability(Number.NaN, "percent")).toBeNull();
    expect(normalizePinProbability(-0.2, "fraction")).toBeNull();
  });

  it("reads the committed gexstate fixture (documented as a fraction) as a plausible percentage", async () => {
    const raw = await readFile(
      path.join(process.cwd(), "public", "data", "gexstate_fixture.json"),
      "utf8"
    );
    const fx = JSON.parse(raw) as { pin_probability: number };
    const pct = normalizePinProbability(fx.pin_probability, "fraction");
    expect(pct).not.toBeNull();
    expect(pct!).toBeGreaterThan(0);
    expect(pct!).toBeLessThanOrEqual(100);
  });
});

describe('normalizePinProbability — scale "auto" (reserved for an unforeseen third producer)', () => {
  it("treats a value above 1 as already a percent (unambiguous)", () => {
    expect(normalizePinProbability(55)).toBe(55); // default is "auto"
    expect(normalizePinProbability(100, "auto")).toBe(100);
  });

  it("treats exactly 0 as 0 either way (unambiguous)", () => {
    expect(normalizePinProbability(0, "auto")).toBe(0);
  });

  it("NEVER GUESSES inside the ambiguous (0, 1] seam — returns null instead", () => {
    // A fraction-near-1 (near-certain) and a percent-near-0 (near-impossible) are
    // indistinguishable by value alone; guessing either way can be badly wrong, so an
    // unlabeled producer in this range is honestly "can't tell", not a silent pick.
    expect(normalizePinProbability(1, "auto")).toBeNull();
    expect(normalizePinProbability(0.541, "auto")).toBeNull();
    expect(normalizePinProbability(0.001, "auto")).toBeNull();
  });

  it("clamps and null-handles the same as the explicit scales", () => {
    expect(normalizePinProbability(180, "auto")).toBe(100);
    expect(normalizePinProbability(null, "auto")).toBeNull();
    expect(normalizePinProbability(Number.NaN, "auto")).toBeNull();
    expect(normalizePinProbability(-0.2, "auto")).toBeNull();
  });
});
