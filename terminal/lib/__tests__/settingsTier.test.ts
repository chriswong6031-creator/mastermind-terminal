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
// the chart has to hold independently HERE. `essential` is the canonical tier;
// `insider` is its pre-rename name and is accepted inbound permanently. These pin
// that neither name ever reads as Free while the account is being charged.

describe("acsNormalizeTier", () => {
  it("aliases the pre-rename insider onto essential", () => {
    expect(acsNormalizeTier("insider")).toBe("essential");
  });

  it("passes every other tier through and defaults an absent one to free", () => {
    for (const tier of ["free", "essential", "pro", "unlimited"]) {
      expect(acsNormalizeTier(tier)).toBe(tier);
    }
    expect(acsNormalizeTier(undefined)).toBe("free");
    expect(acsNormalizeTier("")).toBe("free");
  });
});

describe("settings helpers on an Essential subscriber", () => {
  it("labels the plan as the paid tier, never Free", () => {
    expect(acsTierLabelKey("essential")).toBe("acsTierInsider");
  });

  it("resolves the price and feature tables, which are keyed by effective tier", () => {
    // SectionBilling looks these up with the normalized tier; an un-normalized
    // legacy `insider` key would miss both — no price line, and the FREE feature list.
    expect(ACS_PRICE[acsNormalizeTier("essential")]).toBe(ACS_PRICE.essential);
    expect(ACS_PLAN_FEATURES[acsNormalizeTier("essential")]).toBe(ACS_PLAN_FEATURES.essential);
    expect(ACS_PRICE.essential).toBeDefined();
    expect(ACS_PLAN_FEATURES.essential).toBeDefined();
  });

  it("offers the Pro upgrade CTA rather than the switch-to-annual fallthrough", () => {
    for (const interval of ["monthly", "annual", null]) {
      expect(acsUpgradeLabelKey("essential", interval)).toBe("acsUpgradePro");
    }
    // A live subscription change cannot run in the Terminal's own sheet.
    expect(acsUpgradeIsInApp("essential")).toBe(false);
  });
});

// ── The alias is a permanent inbound contract, not a migration step. A cached page or
//    an un-migrated payload can send `insider` at any point in the future; when it does,
//    the Billing tab must be indistinguishable from the canonical name's.
describe("legacy `insider` entitles identically to `essential` (alias parity)", () => {
  it("produces the same label, price, features, CTA and in-app decision", () => {
    expect(acsNormalizeTier("insider")).toBe(acsNormalizeTier("essential"));
    expect(acsTierLabelKey("insider")).toBe(acsTierLabelKey("essential"));
    expect(ACS_PRICE[acsNormalizeTier("insider")]).toBe(ACS_PRICE[acsNormalizeTier("essential")]);
    expect(ACS_PLAN_FEATURES[acsNormalizeTier("insider")]).toBe(
      ACS_PLAN_FEATURES[acsNormalizeTier("essential")],
    );
    for (const interval of ["monthly", "annual", null]) {
      expect(acsUpgradeLabelKey("insider", interval)).toBe(acsUpgradeLabelKey("essential", interval));
    }
    expect(acsUpgradeIsInApp("insider")).toBe(acsUpgradeIsInApp("essential"));
  });

  it("never reads a legacy payload as Free", () => {
    expect(acsNormalizeTier("insider")).not.toBe("free");
    expect(acsTierLabelKey("insider")).not.toBe("acsTierFree");
    expect(ACS_PLAN_FEATURES[acsNormalizeTier("insider")]).not.toBe(ACS_PLAN_FEATURES.free);
    expect(acsUpgradeIsInApp("insider")).toBe(false);
  });
});

describe("the other tiers are untouched by the rename", () => {
  it("keeps every existing label, CTA and in-app decision byte-identical", () => {
    const labels: Array<[string | undefined, string]> = [
      [undefined, "acsTierFree"],
      ["free", "acsTierFree"],
      ["essential", "acsTierInsider"],
      ["insider", "acsTierInsider"],
      ["pro", "acsTierPro"],
      ["unlimited", "acsTierPro"],
    ];
    for (const [tier, key] of labels) expect(acsTierLabelKey(tier)).toBe(key);

    expect(acsUpgradeLabelKey(undefined, null)).toBe("acsChoosePlan");
    expect(acsUpgradeLabelKey("free", null)).toBe("acsChoosePlan");
    expect(acsUpgradeLabelKey("essential", "monthly")).toBe("acsUpgradePro");
    expect(acsUpgradeLabelKey("pro", "monthly")).toBe("acsSwitchAnnual");
    expect(acsUpgradeLabelKey("pro", "annual")).toBeNull();
    expect(acsUpgradeLabelKey("unlimited", "monthly")).toBeNull();

    expect(acsUpgradeIsInApp(undefined)).toBe(true);
    expect(acsUpgradeIsInApp("free")).toBe(true);
    expect(acsUpgradeIsInApp("essential")).toBe(false);
    expect(acsUpgradeIsInApp("pro")).toBe(false);
  });
});
