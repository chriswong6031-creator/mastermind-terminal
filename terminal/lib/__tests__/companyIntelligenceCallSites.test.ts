import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = (...parts: string[]) => readFileSync(join(__dirname, ...parts), "utf8");

const institutional = source("../../components/fin/CompanyInstitutionalContextCard.tsx");
const evidenceRail = source("../../components/fin/EvidenceRail.tsx");
const intelligencePage = source("../../components/fin/CompanyIntelligencePage.tsx");
const intelligenceV2 = source("../../components/fin/CompanyIntelligenceV2Current.tsx");
const themeCard = source("../../components/fin/CompanyThemeContextCard.tsx");
const stockAnalysis = source("../../components/StockAnalysis.tsx");

function withoutDataAttributes(src: string): string {
  return src
    .replace(/\sdata-[A-Za-z0-9-]+="[^"]*"/g, "")
    .replace(/\sdata-[A-Za-z0-9-]+='[^']*'/g, "")
    .replace(/\sdata-[A-Za-z0-9-]+=\{[^}]*\}/g, "");
}

describe("company intelligence call-site labels", () => {
  it("replaces the manager_style slug with managerStyleLabel", () => {
    expect(institutional).not.toContain("manager_style.replaceAll");
    expect(institutional).toContain("managerStyleLabel(");
  });

  it("replaces the typed-absence reason slug with typedAbsenceReasonLabel", () => {
    expect(evidenceRail).not.toContain("typed_absence.reason.replaceAll");
    expect(evidenceRail).toContain("typedAbsenceReasonLabel(");
  });

  it("labels topic tags and drops glance-tier event ids on both company intelligence pages", () => {
    for (const src of [intelligencePage, intelligenceV2]) {
      expect(src).not.toContain("<strong>{topic.tag}</strong>");
      expect(src).toContain("topicTagLabel(");
      expect(src).not.toContain("first_event_id} →");
    }
  });

  it("keeps event_workspace.v1 out of pick() and JSX text on the v2 page", () => {
    expect(withoutDataAttributes(intelligenceV2)).not.toContain("event_workspace.v1");
    expect(intelligenceV2).not.toMatch(/pick\([^)]*event_workspace\.v1/);
  });

  it("drops basket_id from the theme-card glance line", () => {
    expect(themeCard).not.toContain("{item.basket_id} ·");
  });

  it("glosses 龙虎榜 as Dragon-Tiger on StockAnalysis", () => {
    expect(stockAnalysis).toContain("Dragon-Tiger");
  });
});
