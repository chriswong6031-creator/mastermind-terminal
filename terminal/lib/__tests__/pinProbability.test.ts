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
 */
describe("normalizePinProbability — shape guard", () => {
  it("scales a 0..1 fraction up", () => {
    expect(normalizePinProbability(0.541)).toBe(54);
    expect(normalizePinProbability(0.5)).toBe(50);
    expect(normalizePinProbability(0)).toBe(0);
  });

  it("leaves an already-percent value alone (the 5500% bug)", () => {
    expect(normalizePinProbability(55)).toBe(55);
    expect(normalizePinProbability(54.1)).toBe(54);
    expect(normalizePinProbability(100)).toBe(100);
  });

  it("treats the 1.0 seam as 100% either way", () => {
    // A fraction of 1.0 and a percent of 1 are indistinguishable; 100% is the safe read
    // for a field whose producers both cap at their own maximum.
    expect(normalizePinProbability(1)).toBe(100);
  });

  it("clamps out-of-range values instead of rendering them", () => {
    expect(normalizePinProbability(180)).toBe(100);
    expect(normalizePinProbability(1e6)).toBe(100);
  });

  it("returns null for absent / unusable input so the card can print an em dash", () => {
    // Previously an absent probability fell through to a literal 0 and rendered
    // "0% prob" — a confident claim built out of missing data.
    expect(normalizePinProbability(null)).toBeNull();
    expect(normalizePinProbability(undefined)).toBeNull();
    expect(normalizePinProbability(Number.NaN)).toBeNull();
    expect(normalizePinProbability(-0.2)).toBeNull();
  });

  it("reads the committed gexstate fixture as a plausible percentage", async () => {
    const raw = await readFile(
      path.join(process.cwd(), "public", "data", "gexstate_fixture.json"),
      "utf8"
    );
    const fx = JSON.parse(raw) as { pin_probability: number };
    const pct = normalizePinProbability(fx.pin_probability);
    expect(pct).not.toBeNull();
    expect(pct!).toBeGreaterThan(0);
    expect(pct!).toBeLessThanOrEqual(100);
  });
});
