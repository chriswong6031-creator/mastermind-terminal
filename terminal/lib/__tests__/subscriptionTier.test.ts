import { describe, expect, it } from "vitest";
import {
  isPaidSubscriptionTier,
  normalizeDevTierOverride,
  normalizeSubscriptionTier,
} from "../subscriptionTier";

describe("normalizeSubscriptionTier", () => {
  it("keeps the public product tiers unchanged", () => {
    expect(normalizeSubscriptionTier("free")).toBe("free");
    expect(normalizeSubscriptionTier("essential")).toBe("essential");
    expect(normalizeSubscriptionTier("pro")).toBe("pro");
  });

  it("accepts the pre-rename `insider` as an alias of `essential` — permanently", () => {
    // NOT a transitional shim. A cached page, a `mm.devTier` written before the rename,
    // and an onboarding sessionStorage stash can all carry `insider` indefinitely, and no
    // migration can reach any of them. Dropping this alias reads a paying subscriber as
    // Free — the picker fails OPEN on an unknown tier while the renderer fails CLOSED, so
    // the two disagree mid-session.
    expect(normalizeSubscriptionTier("insider")).toBe("essential");
    expect(normalizeSubscriptionTier(" INSIDER ")).toBe("essential");
    expect(isPaidSubscriptionTier("insider")).toBe(true);
  });

  it("entitles an `insider` payload identically to an `essential` one (alias parity)", () => {
    // The parity claim in one assertion: every observable output of the two names matches.
    expect(normalizeSubscriptionTier("insider")).toBe(normalizeSubscriptionTier("essential"));
    expect(isPaidSubscriptionTier("insider")).toBe(isPaidSubscriptionTier("essential"));
    for (const raw of ["insider", "INSIDER", " Insider ", "essential", "ESSENTIAL", " Essential "]) {
      expect(normalizeSubscriptionTier(raw)).toBe("essential");
      expect(isPaidSubscriptionTier(raw)).toBe(true);
    }
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

// TerminalShell reads `localStorage.mm.devTier` through this on mount. Developer machines
// set that key BY HAND and nothing migrates it, so a value written before the rename must
// keep working forever — a dev whose override silently stopped applying would debug a
// phantom entitlement bug.
describe("normalizeDevTierOverride (localStorage mm.devTier)", () => {
  it("still honours a pre-rename `insider` override", () => {
    expect(normalizeDevTierOverride("insider")).toBe("essential");
    expect(normalizeDevTierOverride(" INSIDER ")).toBe("essential");
  });

  it("treats the legacy and canonical names identically (alias parity)", () => {
    expect(normalizeDevTierOverride("insider")).toBe(normalizeDevTierOverride("essential"));
  });

  it("honours the canonical names", () => {
    expect(normalizeDevTierOverride("essential")).toBe("essential");
    expect(normalizeDevTierOverride("pro")).toBe("pro");
    expect(normalizeDevTierOverride("unlimited")).toBe("pro");
  });

  it("returns null for absent, unknown, or free values so the real entitlement wins", () => {
    // `free` is not an override: the key exists to raise the tier above what /api/me
    // reports, and returning "free" would let a stale key MASK a real subscription.
    for (const raw of [null, undefined, "", "free", "premium", 2]) {
      expect(normalizeDevTierOverride(raw)).toBeNull();
    }
  });
});
