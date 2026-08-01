import { describe, expect, it } from "vitest";
import {
  ACS_PLAN_FEATURES,
  ACS_PRICE,
  acsNormalizeTier,
  acsTierLabelKey,
  acsUpgradeIsInApp,
  acsUpgradeLabelKey,
} from "@/components/settings/types";

// The account-settings panel keys off the RAW /api/me tier — app/api/me/route.ts
// pipes the billing gateway's payload through verbatim and the panel narrows
// nothing — so the raw→effective alias that lib/subscriptionTier.ts applies for
// the chart has to hold independently HERE. `essential` is the billing
// authority's new name for the `insider` entitlement; these pin that an
// Essential subscriber never reads as Free while being charged.

describe("acsNormalizeTier", () => {
  it("aliases essential onto insider", () => {
    expect(acsNormalizeTier("essential")).toBe("insider");
  });

  it("passes every other tier through and defaults an absent one to free", () => {
    for (const tier of ["free", "insider", "pro", "unlimited"]) {
      expect(acsNormalizeTier(tier)).toBe(tier);
    }
    expect(acsNormalizeTier(undefined)).toBe("free");
    expect(acsNormalizeTier("")).toBe("free");
  });
});

describe("settings helpers on an Essential subscriber", () => {
  it("labels the plan as Insider, never Free", () => {
    expect(acsTierLabelKey("essential")).toBe("acsTierInsider");
    expect(acsTierLabelKey("essential")).toBe(acsTierLabelKey("insider"));
  });

  it("resolves the price and feature tables, which are keyed by effective tier", () => {
    // SectionBilling looks these up with the normalized tier; an un-aliased
    // `essential` key would miss both — no price line, and the FREE feature list.
    expect(ACS_PRICE[acsNormalizeTier("essential")]).toBe(ACS_PRICE.insider);
    expect(ACS_PLAN_FEATURES[acsNormalizeTier("essential")]).toBe(ACS_PLAN_FEATURES.insider);
  });

  it("offers the Pro upgrade CTA rather than the switch-to-annual fallthrough", () => {
    for (const interval of ["monthly", "annual", null]) {
      expect(acsUpgradeLabelKey("essential", interval)).toBe("acsUpgradePro");
    }
    // A live subscription change cannot run in the Terminal's own sheet.
    expect(acsUpgradeIsInApp("essential")).toBe(false);
  });
});

describe("pre-rename tiers are untouched by the alias", () => {
  it("keeps every existing label, CTA and in-app decision byte-identical", () => {
    const labels: Array<[string | undefined, string]> = [
      [undefined, "acsTierFree"],
      ["free", "acsTierFree"],
      ["insider", "acsTierInsider"],
      ["pro", "acsTierPro"],
      ["unlimited", "acsTierPro"],
    ];
    for (const [tier, key] of labels) expect(acsTierLabelKey(tier)).toBe(key);

    expect(acsUpgradeLabelKey(undefined, null)).toBe("acsChoosePlan");
    expect(acsUpgradeLabelKey("free", null)).toBe("acsChoosePlan");
    expect(acsUpgradeLabelKey("insider", "monthly")).toBe("acsUpgradePro");
    expect(acsUpgradeLabelKey("pro", "monthly")).toBe("acsSwitchAnnual");
    expect(acsUpgradeLabelKey("pro", "annual")).toBeNull();
    expect(acsUpgradeLabelKey("unlimited", "monthly")).toBeNull();

    expect(acsUpgradeIsInApp(undefined)).toBe(true);
    expect(acsUpgradeIsInApp("free")).toBe(true);
    expect(acsUpgradeIsInApp("insider")).toBe(false);
    expect(acsUpgradeIsInApp("pro")).toBe(false);
  });
});
