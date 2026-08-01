import { describe, expect, it } from "vitest";
import { isPaidSubscriptionTier, normalizeSubscriptionTier } from "../subscriptionTier";

describe("normalizeSubscriptionTier", () => {
  it("keeps the public product tiers unchanged", () => {
    expect(normalizeSubscriptionTier("free")).toBe("free");
    expect(normalizeSubscriptionTier("insider")).toBe("insider");
    expect(normalizeSubscriptionTier("pro")).toBe("pro");
  });

  it("accepts `essential` as the billing authority's new name for Insider", () => {
    // Input widening only — the effective tier the chart reasons about stays `insider`,
    // so nothing downstream (picker, renderer, alerts, settings) sees a new value.
    expect(normalizeSubscriptionTier("essential")).toBe("insider");
    expect(normalizeSubscriptionTier(" ESSENTIAL ")).toBe("insider");
    expect(isPaidSubscriptionTier("essential")).toBe(true);
  });

  it("maps the billing authority's unlimited/comp tier to Pro", () => {
    expect(normalizeSubscriptionTier("unlimited")).toBe("pro");
    expect(normalizeSubscriptionTier(" UNLIMITED ")).toBe("pro");
    expect(isPaidSubscriptionTier("unlimited")).toBe(true);
  });

  it("fails closed for absent or unknown tiers", () => {
    for (const value of [null, undefined, "", "premium", 2]) {
      expect(normalizeSubscriptionTier(value)).toBe("free");
      expect(isPaidSubscriptionTier(value)).toBe(false);
    }
  });
});
