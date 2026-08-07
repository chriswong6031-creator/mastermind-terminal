// HeatSeeker confidence — one convention, producer-side.
// (§5.3 moved the card from the retired PRISM tab into the Exposure desk's right rail.)
//
// `options_structure.matrix/v1` heat_seeker.confidence is a 0..1 FRACTION, not a
// "low"/"medium"/"high" tier. The builder (macro `engine/options_matrix.py`
// `_heat_seeker`) emits `round(min(1, (standout_ratio - 1) / 3), 2)` and the contract
// dataclass `MatrixHeatSeeker.confidence` types it `float | None`.
//
// matrix_fixture.json shipped `"medium"`, which HeatSeekerCard multiplied by 100 into
// NaN. That NaN never surfaced as NaN: RingGauge's own `isNaN` guard turns it into a
// displayed "0" in the weak/"down" tone, so under FLOW_FIXTURE=1 the card showed a
// confident-looking Confidence ring reading ZERO. Two things are locked here:
//
//   1. FIXTURE FIDELITY. The fixture's heat_seeker must be what the builder would emit
//      for its own standout_ratio — numeric, in range, and carrying the verbatim note
//      that the upstream `validate_matrix` rejects the payload without.
//   2. HONEST ABSENCE. The card's coercion returns null (ring omitted) for every
//      unusable confidence, including a tier string. A tier is a malformed payload, so
//      it must read as absent — mapping it onto an invented 0.33/0.6/0.85 would put a
//      fabricated number under a "Confidence" label, the same failure class as the
//      first-key fixture fallbacks retired in #216.
import { describe, it, expect } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { heatSeekerConfPct } from "@/components/gexdesk/HeatSeekerCard";

const MATRIX_FIXTURE = path.join(process.cwd(), "public", "data", "matrix_fixture.json");

// Verbatim from the contract; upstream `validate_matrix` errors on any other value.
const CONTRACT_NOTE = "descriptive — not a recommendation";

/** The builder's formula — engine/options_matrix.py `_heat_seeker`. */
const producerConfidence = (ratio: number) =>
  Math.round(Math.min(1, (ratio - 1) / 3) * 100) / 100;

type HeatSeeker = {
  strike: number;
  expiry: string;
  lens: string;
  standout_ratio: number;
  confidence: number;
  note: string;
};

const loadMatrix = async () =>
  JSON.parse(await fs.readFile(MATRIX_FIXTURE, "utf8")) as Record<
    string,
    { heat_seeker: HeatSeeker | null }
  >;

describe("matrix_fixture heat_seeker — builder contract", () => {
  it("types confidence as a 0..1 number on every entry, never a tier string", async () => {
    const all = await loadMatrix();
    const roots = Object.keys(all);
    expect(roots.length).toBeGreaterThan(0);

    for (const root of roots) {
      const hs = all[root].heat_seeker;
      if (!hs) continue; // null is a legal payload — no standout cell cleared the gates
      expect(typeof hs.confidence, `${root}.confidence type`).toBe("number");
      expect(Number.isFinite(hs.confidence), `${root}.confidence finite`).toBe(true);
      expect(hs.confidence, `${root}.confidence lower bound`).toBeGreaterThanOrEqual(0);
      expect(hs.confidence, `${root}.confidence upper bound`).toBeLessThanOrEqual(1);
    }
  });

  it("derives confidence from standout_ratio exactly as the builder does", async () => {
    const all = await loadMatrix();
    for (const [root, doc] of Object.entries(all)) {
      const hs = doc.heat_seeker;
      if (!hs) continue;
      expect(typeof hs.standout_ratio, `${root}.standout_ratio type`).toBe("number");
      // A hand-authored fixture that drifts off the formula would model a payload the
      // builder cannot produce (SPY: ratio 3.1 → 0.7).
      expect(hs.confidence, `${root} confidence vs formula`).toBeCloseTo(
        producerConfidence(hs.standout_ratio),
        10
      );
      // Below the builder's _MIN_CONFIDENCE the pick is dropped, never emitted weak.
      expect(hs.confidence, `${root} clears _MIN_CONFIDENCE`).toBeGreaterThanOrEqual(0.15);
    }
  });

  it("carries the verbatim contract note that validate_matrix enforces", async () => {
    const all = await loadMatrix();
    for (const [root, doc] of Object.entries(all)) {
      if (!doc.heat_seeker) continue;
      expect(doc.heat_seeker.note, `${root}.note`).toBe(CONTRACT_NOTE);
    }
  });

  it("renders a real ring from the fixture — not the NaN-swallowed zero", async () => {
    const all = await loadMatrix();
    const spy = all.SPY?.heat_seeker;
    expect(spy).toBeTruthy();
    expect(heatSeekerConfPct(spy!.confidence)).toBe(70);
  });
});

describe("heatSeekerConfPct — honest absence", () => {
  it("scales a 0..1 fraction to whole ring percent", () => {
    expect(heatSeekerConfPct(0.7)).toBe(70);
    expect(heatSeekerConfPct(0)).toBe(0);
    expect(heatSeekerConfPct(1)).toBe(100);
    expect(heatSeekerConfPct(0.155)).toBe(16); // rounds, never truncates
  });

  it("clamps an out-of-range fraction into the ring's domain", () => {
    expect(heatSeekerConfPct(1.4)).toBe(100);
    expect(heatSeekerConfPct(-0.2)).toBe(0);
  });

  it("returns null for a null/absent confidence — the contract allows float | None", () => {
    expect(heatSeekerConfPct(null)).toBeNull();
    expect(heatSeekerConfPct(undefined)).toBeNull();
  });

  it("returns null for a tier string instead of inventing a number", () => {
    // The original bug. 0.6-for-"medium" would be a fabricated reading under a
    // "Confidence" label; absent is the only honest render of a malformed payload.
    for (const tier of ["low", "medium", "high", ""]) {
      expect(heatSeekerConfPct(tier), tier || "(empty)").toBeNull();
    }
    // Numeric-looking strings are still not the contract's type.
    expect(heatSeekerConfPct("0.7")).toBeNull();
  });

  it("returns null for non-finite numbers rather than a zero ring", () => {
    expect(heatSeekerConfPct(Number.NaN)).toBeNull();
    expect(heatSeekerConfPct(Infinity)).toBeNull();
    expect(heatSeekerConfPct(-Infinity)).toBeNull();
  });
});
