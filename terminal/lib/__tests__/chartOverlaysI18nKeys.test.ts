import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const KEYS = [
  "lgShow",
  "lgHide",
  "lgSettings",
  "lgRemove",
  "lgMore",
  "pmMovePaneUp",
  "pmMovePaneDown",
  "pmCollapsePane",
  "pmRestorePane",
  "pmMaximizePane",
] as const;

describe("chart overlay i18n keys", () => {
  it("defines each legend/pane key as a two-element [EN, ZH] pair in i18n.tsx", () => {
    const src = fs.readFileSync(path.join(__dirname, "..", "i18n.tsx"), "utf8");
    for (const key of KEYS) {
      const pair = new RegExp(`${key}: \\["[^"]+", "[^"]+"\\]`);
      expect(src, key).toMatch(pair);
    }
  });

  it("has no hardcoded Latin aria-label in ChartOverlays.tsx", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "..", "..", "components", "ChartOverlays.tsx"),
      "utf8",
    );
    expect(src).not.toMatch(/aria-label="[A-Za-z]/);
  });
});
