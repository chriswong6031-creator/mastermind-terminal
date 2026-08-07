import { describe, expect, it } from "vitest";
import {
  moduleScopedReset,
  moduleScopedSnapshot,
  resolveIndicatorSettingsModule,
} from "@/components/IndicatorSettings";
import { suiteDefaults } from "@/lib/suites/registry";

describe("module-first IndicatorSettings helpers", () => {
  it("resolves qualified ids and legacy suite + module targets without accepting ambiguous bare ids", () => {
    expect(resolveIndicatorSettingsModule("suite:pulse/sig")?.id).toBe("suite:pulse/sig");
    expect(resolveIndicatorSettingsModule("pulse", "sig")?.id).toBe("suite:pulse/sig");
    expect(resolveIndicatorSettingsModule("pulse", { suiteKey: "rsix", moduleKey: "div" })?.id)
      .toBe("suite:rsix/div");
    expect(resolveIndicatorSettingsModule("sig")).toBeNull();
  });

  it("captures and resets only the selected module's prefixed fields", () => {
    const entry = resolveIndicatorSettingsModule("suite:pulse/sig");
    expect(entry).not.toBeNull();
    const moduleDef = entry!.module;
    const firstField = moduleDef.fields[0];
    const siblingKey = "wave.smooth";
    const values = {
      ...suiteDefaults("pulse"),
      [siblingKey]: 999,
      [`${moduleDef.key}.${firstField.key}`]: 123,
    };

    const snapshot = moduleScopedSnapshot(moduleDef, values);
    const reset = moduleScopedReset(moduleDef);

    expect(snapshot[`${moduleDef.key}.${firstField.key}`]).toBe(123);
    expect(snapshot).not.toHaveProperty(`${moduleDef.key}.on`);
    expect(snapshot).not.toHaveProperty(siblingKey);
    expect(reset).not.toHaveProperty(`${moduleDef.key}.on`);
    expect(reset).not.toHaveProperty(siblingKey);
    expect(Object.keys(snapshot).every((key) => key.startsWith(`${moduleDef.key}.`))).toBe(true);
    expect(Object.keys(reset).every((key) => key.startsWith(`${moduleDef.key}.`))).toBe(true);
  });
});
