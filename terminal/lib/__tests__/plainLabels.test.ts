import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CLASSIC_CATEGORY_TKEY,
  CLASSIC_INDICATOR_CATEGORIES,
  MACRO_DURATION_ZH,
  MACRO_INFLATION_ZH,
  MACRO_REGIME_ZH,
  PLAN_TIER_LABEL,
  TRUST_TIER_LABEL,
  classicCategoryLabel,
  macroChipLabel,
  mappedOrNeutral,
  notClassified,
  planTierLabel,
  regimeLabel,
  trustTierLabel,
} from "@/lib/plainLabels";

function assertBilingual(pair: readonly [string, string], key: string) {
  expect(pair[0].trim(), `${key} EN`).not.toBe("");
  expect(pair[1].trim(), `${key} ZH`).not.toBe("");
}

describe("notClassified", () => {
  it("returns the bilingual neutral label and never the input key", () => {
    expect(notClassified("en")).toBe("Not classified");
    expect(notClassified("zh")).toBe("未分类");
    expect(notClassified("en")).not.toBe("event-edge");
    expect(notClassified("zh")).not.toBe("event-edge");
  });
});

describe("regimeLabel", () => {
  it("uses the lex hit when the translator returns a label", () => {
    const t = (key: string) => (key === "regimePIN" ? "Pin" : "");
    expect(regimeLabel(t, "PIN", "en")).toBe("Pin");
  });

  it("unknown regime never returns the raw value", () => {
    const miss = () => "";
    expect(regimeLabel(miss, "NOTAREGIME", "en")).toBe(notClassified("en"));
    expect(regimeLabel(miss, "NOTAREGIME", "zh")).toBe(notClassified("zh"));
    expect(regimeLabel(miss, "NOTAREGIME", "en")).not.toBe("NOTAREGIME");
    expect(regimeLabel(miss, "NOTAREGIME", "zh")).not.toBe("NOTAREGIME");
  });
});

describe("TRUST_TIER_LABEL", () => {
  it("every mapped tier has a non-empty EN and ZH label", () => {
    for (const [key, pair] of Object.entries(TRUST_TIER_LABEL)) {
      assertBilingual(pair, key);
    }
  });

  it("unknown trust tier never returns the raw value", () => {
    expect(trustTierLabel("not-a-tier", "en")).toBe(notClassified("en"));
    expect(trustTierLabel("not-a-tier", "zh")).toBe(notClassified("zh"));
    expect(trustTierLabel("not-a-tier", "en")).not.toBe("not-a-tier");
  });
});

describe("macro EN→ZH maps", () => {
  it("every duration / regime / inflation EN value has a non-empty ZH label", () => {
    for (const [key, zh] of Object.entries(MACRO_DURATION_ZH)) {
      expect(key.trim(), "duration EN").not.toBe("");
      expect(zh.trim(), `${key} ZH`).not.toBe("");
    }
    for (const [key, zh] of Object.entries(MACRO_REGIME_ZH)) {
      expect(key.trim(), "regime EN").not.toBe("");
      expect(zh.trim(), `${key} ZH`).not.toBe("");
    }
    for (const [key, zh] of Object.entries(MACRO_INFLATION_ZH)) {
      expect(key.trim(), "inflation EN").not.toBe("");
      expect(zh.trim(), `${key} ZH`).not.toBe("");
    }
  });

  it("zh uses the map and falls back to the EN prose, never a key", () => {
    expect(macroChipLabel("Duration-neutral", MACRO_DURATION_ZH, "en")).toBe("Duration-neutral");
    expect(macroChipLabel("Duration-neutral", MACRO_DURATION_ZH, "zh")).toBe(MACRO_DURATION_ZH["Duration-neutral"]);
    expect(macroChipLabel("Unmapped prose", MACRO_DURATION_ZH, "zh")).toBe("Unmapped prose");
    expect(macroChipLabel("Unmapped prose", MACRO_DURATION_ZH, "zh")).not.toBe("duration_en");
  });
});

describe("PLAN_TIER_LABEL", () => {
  it("every plan tier has a non-empty EN and ZH label", () => {
    for (const key of ["free", "essential", "pro"] as const) {
      assertBilingual(PLAN_TIER_LABEL[key], key);
    }
  });

  it("unknown plan tier never returns the raw value", () => {
    expect(planTierLabel("enterprise", "en")).toBe(notClassified("en"));
    expect(planTierLabel("enterprise", "zh")).toBe(notClassified("zh"));
    expect(planTierLabel("enterprise", "en")).not.toBe("enterprise");
  });
});

describe("classic indicator categories", () => {
  it("every category that can reach the library has a tkey", () => {
    for (const category of CLASSIC_INDICATOR_CATEGORIES) {
      expect(CLASSIC_CATEGORY_TKEY[category].trim(), category).not.toBe("");
    }
  });

  it("covers every CATS key in IndicatorsModal", () => {
    const src = readFileSync(join(__dirname, "../../components/IndicatorsModal.tsx"), "utf8");
    const block = src.match(/const CATS: Record<string, ClassicIndicator\[\]> = \{([\s\S]*?)\n\};/);
    expect(block).not.toBeNull();
    const keys = [...block![1].matchAll(/^\s+(?:(\w+)|"([^"]+)"):/gm)].map((m) => m[1] ?? m[2]);
    expect(keys.sort()).toEqual([...CLASSIC_INDICATOR_CATEGORIES].sort());
  });

  it("unmapped category never returns the raw key", () => {
    const echo = (key: string, fallback?: string) => fallback ?? key;
    expect(classicCategoryLabel("not-a-category", echo, "en")).toBe(notClassified("en"));
    expect(classicCategoryLabel("not-a-category", echo, "zh")).toBe(notClassified("zh"));
    expect(classicCategoryLabel("not-a-category", echo, "en")).not.toBe("not-a-category");
  });
});

describe("mappedOrNeutral", () => {
  it("missing map entries use the neutral label, never the raw slug", () => {
    expect(mappedOrNeutral(undefined, "en")).toBe(notClassified("en"));
    expect(mappedOrNeutral(undefined, "zh")).toBe(notClassified("zh"));
    expect(mappedOrNeutral("TECH", "en")).toBe("TECH");
  });
});
