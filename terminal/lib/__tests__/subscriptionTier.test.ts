import { describe, expect, it } from "vitest";
import { isPaidSubscriptionTier, normalizeSubscriptionTier } from "../subscriptionTier";

describe("normalizeSubscriptionTier", () => {
  it("keeps the public product tiers unchanged", () => {
    expect(normalizeSubscriptionTier("free")).toBe("free");
    expect(normalizeSubscriptionTier("insider")).toBe("insider");
    expect(normalizeSubscriptionTier("pro")).toBe("pro");
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
