import { describe, expect, it } from "vitest";
import { SUITE_DEFS } from "@/lib/suites/registry";
import {
  SYSTEM_GUIDE_IDS,
  SYSTEM_GUIDE_LIST,
  getSystemGuide,
  isSystemGuideId,
  loadSystemGuide,
} from "@/lib/guides/systems/registry";

const ENGLISH_SECTIONS = [
  "## System map",
  "## Reading order",
  "## Timeframe roles",
  "## Clean-first recipe",
  "## Setup → trigger → invalidation → management",
  "## False-positive guardrails",
  "## Signals & alerts",
] as const;

const CHINESE_SECTIONS = [
  "## 系统地图",
  "## 阅读顺序",
  "## 周期角色",
  "## 清爽起步方案",
  "## 准备 → 触发 → 失效 → 管理",
  "## 假信号防线",
  "## 信号与提醒",
] as const;

describe("system learning guides", () => {
  it("keeps a stable, bilingual playbook descriptor for every suite", () => {
    expect(SYSTEM_GUIDE_IDS).toEqual([
      "system:structure",
      "system:trend",
      "system:pulse",
      "system:rsix",
      "system:macdx",
    ]);
    expect(SYSTEM_GUIDE_LIST.map(({ id }) => id)).toEqual(SYSTEM_GUIDE_IDS);

    for (const descriptor of SYSTEM_GUIDE_LIST) {
      const suite = SUITE_DEFS[descriptor.suiteKey];
      const validModuleKeys = new Set(suite.modules.map(({ key }) => key));

      expect(descriptor.id).toBe(`system:${descriptor.suiteKey}`);
      expect(descriptor.title.en.trim().length).toBeGreaterThan(0);
      expect(descriptor.title.zh.trim().length).toBeGreaterThan(0);
      expect(descriptor.summary.en.trim().length).toBeGreaterThan(20);
      expect(descriptor.summary.zh.trim().length).toBeGreaterThan(8);
      expect(descriptor.moduleKeys).toEqual(suite.modules.map(({ key }) => key));
      expect(new Set(descriptor.workflow.map(({ id }) => id)).size).toBe(
        descriptor.workflow.length,
      );

      for (const stage of descriptor.workflow) {
        expect(stage.title.en.trim().length).toBeGreaterThan(0);
        expect(stage.title.zh.trim().length).toBeGreaterThan(0);
        expect(stage.summary.en.trim().length).toBeGreaterThan(20);
        expect(stage.summary.zh.trim().length).toBeGreaterThan(8);
        expect(stage.moduleKeys.length).toBeGreaterThan(0);
        expect(stage.moduleKeys.every((key) => validModuleKeys.has(key))).toBe(true);
      }
    }

    expect(isSystemGuideId("system:trend")).toBe(true);
    expect(isSystemGuideId("trend")).toBe(false);
    expect(getSystemGuide("system:missing")).toBeNull();
  });

  it("lazy-loads complete English and Chinese documents without fallback", async () => {
    for (const id of SYSTEM_GUIDE_IDS) {
      const [english, chinese] = await Promise.all([
        loadSystemGuide(id, "en"),
        loadSystemGuide(id, "zh"),
      ]);

      expect(english, `${id} English`).not.toBeNull();
      expect(chinese, `${id} Chinese`).not.toBeNull();
      expect(english?.fellBack, `${id} English fallback`).toBe(false);
      expect(chinese?.fellBack, `${id} Chinese fallback`).toBe(false);
      expect(english?.text.startsWith("# ")).toBe(true);
      expect(chinese?.text.startsWith("# ")).toBe(true);

      for (const section of ENGLISH_SECTIONS) {
        expect(english?.text, `${id} missing ${section}`).toContain(section);
      }
      for (const section of CHINESE_SECTIONS) {
        expect(chinese?.text, `${id} missing ${section}`).toContain(section);
      }
      expect(english?.text.match(/^## /gm)).toHaveLength(ENGLISH_SECTIONS.length);
      expect(chinese?.text.match(/^## /gm)).toHaveLength(CHINESE_SECTIONS.length);
    }

    await expect(loadSystemGuide("system:missing", "en")).resolves.toBeNull();
  });
});
