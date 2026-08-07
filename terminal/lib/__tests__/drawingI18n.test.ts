import { afterEach, describe, expect, it } from "vitest";
import { DRAWING_TOOL_GROUPS } from "@/lib/drawingTools";
import { tPlain } from "@/lib/i18n";

const DRAWING_CHROME_KEYS = [
  "drawingToolbar",
  "drawingOpenGroupTools",
  "drawingGroupTools",
  "drawingDoubleClickKeepActive",
  "drawingStyleForTool",
  "drawingOpenStyle",
  "drawingColorValue",
  "drawingUseColor",
  "drawingUseWidth",
  "drawingUseDash",
  "drawingDashSolid",
  "drawingDashDashed",
  "drawingDashDotted",
  "drawingKeepActiveOn",
  "drawingKeepActiveOff",
  "drawingKeepActive",
  "drawingDisableKeepActive",
  "drawingMagnet",
  "drawingMagnetMode",
  "drawingMagnetCurrent",
  "drawingMagnetModeCurrent",
  "drawingMagnetOff",
  "drawingMagnetWeak",
  "drawingMagnetStrong",
  "drawingHistory",
  "drawingUndo",
  "drawingRedo",
  "drawingHide",
  "drawingShow",
  "drawingCountOne",
  "drawingCountMany",
  "drawingRemoveWithCount",
  "drawingRemoveAria",
  "drawingRemove",
  "drawingRemoveUser",
  "drawingRemoveDetected",
  "drawingRemoveAll",
  "drawingSelectionToolbar",
  "drawingDragProperties",
  "drawingCustomColor",
  "drawingCustomColorAria",
  "drawingDelete",
  "drawingLock",
  "drawingUnlock",
  "drawingDuplicate",
  "drawingMoreProperties",
  "drawingOpacity",
  "drawingFill",
  "drawingTextSizeOption",
] as const;

const globalRecord = globalThis as unknown as Record<string, unknown>;
const originalDocument = globalRecord.document;

function setDocumentLanguage(language: "en" | "zh") {
  globalRecord.document = {
    documentElement: {
      getAttribute: (key: string) => key === "data-lang" ? language : null,
    },
  };
}

afterEach(() => {
  if (originalDocument === undefined) delete globalRecord.document;
  else globalRecord.document = originalDocument;
});

describe("drawing registry i18n", () => {
  const registryKeys = [
    ...DRAWING_TOOL_GROUPS.map((group) => group.labelKey),
    ...DRAWING_TOOL_GROUPS.flatMap((group) => group.tools.map((tool) => tool.labelKey)),
    ...new Set(DRAWING_TOOL_GROUPS.flatMap((group) => group.tools.map((tool) => tool.sectionKey))),
  ];

  it("resolves every registry group and tool label in English", () => {
    setDocumentLanguage("en");
    for (const key of registryKeys) expect(tPlain(key), key).not.toBe(key);
  });

  it("resolves every registry group and tool label in Chinese", () => {
    setDocumentLanguage("zh");
    for (const key of registryKeys) {
      const chinese = tPlain(key);
      expect(chinese, key).not.toBe(key);
      setDocumentLanguage("en");
      expect(chinese, `${key} must not fall back to English`).not.toBe(tPlain(key));
      setDocumentLanguage("zh");
    }
  });
});

describe("drawing sidebar and selection-control i18n", () => {
  it("has English and Chinese copy for every new interaction key", () => {
    for (const key of DRAWING_CHROME_KEYS) {
      setDocumentLanguage("en");
      const english = tPlain(key);
      setDocumentLanguage("zh");
      const chinese = tPlain(key);
      expect(english, `missing English: ${key}`).not.toBe(key);
      expect(chinese, `missing Chinese: ${key}`).not.toBe(key);
      expect(chinese, `Chinese falls back to English: ${key}`).not.toBe(english);
    }
  });

  it("keeps generic and detector-only clearing semantically distinct", () => {
    setDocumentLanguage("en");
    expect(tPlain("clearDrawings")).toBe("Clear drawings");
    expect(tPlain("clearDetected")).toBe("Clear detected");
    expect(tPlain("drawingRemoveDetected")).toBe("Remove detected drawings");

    setDocumentLanguage("zh");
    expect(tPlain("clearDrawings")).toBe("清除图形");
    expect(tPlain("clearDetected")).toBe("清除识别");
    expect(tPlain("drawingRemoveDetected")).toBe("移除识别绘图");
  });
});
