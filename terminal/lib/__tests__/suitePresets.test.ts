import { describe, expect, it } from "vitest";
import { SUITE_DEFS, SUITE_ORDER } from "../suites/registry";
import {
  DEFAULT_SUITE_PRESET,
  SUITE_PRESET_IDS,
  applySuitePresetParams,
  matchSuitePreset,
  matchesSuitePreset,
  resolveSuitePreset,
  suitePresetsFor,
  validateSuitePresets,
} from "../suites/presets";

const TIER_RANK = { free: 0, essential: 1, pro: 2 } as const;

describe("progressive suite presets", () => {
  it("covers every suite with three stable, bilingual, progressively broader recipes", () => {
    expect(() => validateSuitePresets()).not.toThrow();

    for (const suiteKey of SUITE_ORDER) {
      const suite = SUITE_DEFS[suiteKey];
      const presets = suitePresetsFor(suiteKey);
      expect(presets.map((preset) => preset.id)).toEqual([...SUITE_PRESET_IDS]);
      expect(resolveSuitePreset(suiteKey)?.id).toBe(DEFAULT_SUITE_PRESET[suiteKey]);

      let previous = new Set<string>();
      let previousTier = -1;
      for (const preset of presets) {
        expect(preset.suiteKey).toBe(suiteKey);
        expect(preset.name.en.trim().length).toBeGreaterThan(0);
        expect(preset.name.zh.trim().length).toBeGreaterThan(0);
        expect(preset.description.en.trim().length).toBeGreaterThan(0);
        expect(preset.description.zh.trim().length).toBeGreaterThan(0);
        expect(new Set(preset.modules).size).toBe(preset.modules.length);
        for (const moduleKey of preset.modules) {
          expect(suite.modules.some((moduleDef) => moduleDef.key === moduleKey)).toBe(true);
        }
        for (const moduleKey of previous) expect(preset.modules).toContain(moduleKey);
        previous = new Set(preset.modules);

        const actualTier = suite.modules
          .filter((moduleDef) => preset.modules.includes(moduleDef.key))
          .reduce(
            (highest, moduleDef) =>
              TIER_RANK[moduleDef.tier] > TIER_RANK[highest] ? moduleDef.tier : highest,
            "free" as keyof typeof TIER_RANK,
          );
        expect(preset.minTier).toBe(actualTier);
        expect(TIER_RANK[preset.minTier]).toBeGreaterThanOrEqual(previousTier);
        previousTier = TIER_RANK[preset.minTier];
      }

      expect(new Set(presets.at(-1)?.modules)).toEqual(
        new Set(suite.modules.map((moduleDef) => moduleDef.key)),
      );
    }
  });

  it("makes the readable Market Structure-only recipe the Structure Core default", () => {
    expect(DEFAULT_SUITE_PRESET.structure).toBe("focused");
    expect(resolveSuitePreset("structure")?.modules).toEqual(["ms"]);
    expect(resolveSuitePreset("structure", "workflow")?.modules).toEqual(["ms", "fvg", "pd"]);
  });

  it("changes only module master toggles while preserving every customized field", () => {
    const before = {
      "ms.on": false,
      "ob.on": true,
      "ob.showLast": 11,
      "ob.showInternals": true,
      "fvg.thresholdATR": 0.72,
      "future.experimental": "preserve-me",
      unownedMetadata: { nested: true },
    };
    const snapshot = { ...before };
    const next = applySuitePresetParams("structure", "focused", before);

    expect(before).toEqual(snapshot);
    for (const moduleDef of SUITE_DEFS.structure.modules) {
      expect(next[`${moduleDef.key}.on`], moduleDef.key).toBe(moduleDef.key === "ms");
    }
    expect(next["ob.showLast"]).toBe(11);
    expect(next["ob.showInternals"]).toBe(true);
    expect(next["fvg.thresholdATR"]).toBe(0.72);
    expect(next["future.experimental"]).toBe("preserve-me");
    expect(next.unownedMetadata).toBe(before.unownedMetadata);
  });

  it("matches exact effective selections and reports manual or legacy mixes as Custom", () => {
    for (const suiteKey of SUITE_ORDER) {
      for (const preset of suitePresetsFor(suiteKey)) {
        const applied = applySuitePresetParams(suiteKey, preset.id, { customField: 7 });
        expect(matchesSuitePreset(suiteKey, preset.id, applied)).toBe(true);
        expect(matchSuitePreset(suiteKey, applied)?.id).toBe(preset.id);

        const manual = { ...applied };
        // Every later recipe is a strict superset of the focused recipe, so removing the first
        // selected module cannot accidentally become another named profile.
        manual[`${preset.modules[0]}.on`] = false;
        expect(matchSuitePreset(suiteKey, manual)).toBeNull();
      }
    }

    // Sparse params use the registered legacy defaults. Structure's legacy trio is intentionally
    // not rewritten or mislabeled as the new Market-Structure-only default.
    expect(matchSuitePreset("structure", undefined)).toBeNull();
  });

  it("treats stale suite or preset ids as data-preserving no-ops", () => {
    const before = { "ms.on": false, keep: "yes" };
    const unknownPreset = applySuitePresetParams("structure", "retired-profile", before);
    const unknownSuite = applySuitePresetParams("retired-suite", "focused", before);

    expect(unknownPreset).toEqual(before);
    expect(unknownSuite).toEqual(before);
    expect(unknownPreset).not.toBe(before);
    expect(unknownSuite).not.toBe(before);
    expect(resolveSuitePreset("structure", "retired-profile")).toBeNull();
    expect(resolveSuitePreset("retired-suite", "focused")).toBeNull();
    expect(suitePresetsFor("retired-suite")).toEqual([]);
  });
});
