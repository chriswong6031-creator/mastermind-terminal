/**
 * The SS_WIZARD read boundary must be TOTAL: a signup tab keeps its sessionStorage
 * stash across deploys, so rehydration can meet any historical (or corrupted)
 * shape. A partial stash once crashed the whole onboarding sheet into the error
 * boundary — `prefs: {}` survived the old `?? emptyPrefs` (present, just missing
 * its arrays) and the rail AccountCard read `market_focus.length` off undefined.
 *
 * Contract under test: normalizeWizardStash(anything) is either null ("no usable
 * stash" — start fresh) or a COMPLETE WizardStash with every field known-good,
 * including the W1→W2 step remap that used to live privately in OnboardingSheet.
 */
import { describe, it, expect } from "vitest";
import {
  normalizeWizardStash, normalizeOnboardPrefs,
  STEP_ACCOUNT, STEP_PLAN, STEP_BILLING, STEP_DONE,
  type WizardStash,
} from "@/components/onboarding/types";

const validStash: WizardStash = {
  step: STEP_PLAN,
  firstName: "Ada",
  lastName: "Lovelace",
  email: "ada@example.com",
  prefs: { market_focus: ["us", "hk"], trade_types: ["options"], theme_pref: "light" },
  plan: "essential",
  period: "monthly",
  confirmPending: true,
  trialActive: true,
  trialEnd: 1790000000,
};

describe("normalizeWizardStash — the crash repro", () => {
  it("a stash whose prefs object lost its arrays rehydrates complete (the /options error-boundary bug)", () => {
    const out = normalizeWizardStash({
      step: 3, firstName: "A", lastName: "B", email: "a@b.c", prefs: {},
      plan: "free", period: "annual", confirmPending: false, trialActive: false, trialEnd: null,
    });
    expect(out).toEqual({
      step: STEP_PLAN, firstName: "A", lastName: "B", email: "a@b.c",
      prefs: { market_focus: [], trade_types: [], theme_pref: "dark" },
      plan: "free", period: "annual", confirmPending: false, trialActive: false, trialEnd: null,
    });
  });
});

describe("normalizeWizardStash — totality", () => {
  it("passes a complete valid stash through unchanged", () => {
    expect(normalizeWizardStash(validStash)).toEqual(validStash);
  });

  it("returns null for non-object roots — no stash beats a fabricated one", () => {
    for (const junk of [null, undefined, "", "wizard", 42, true, ["step", 3]]) {
      expect(normalizeWizardStash(junk)).toBeNull();
    }
  });

  it("coerces every garbage-typed field to its known-good default", () => {
    expect(normalizeWizardStash({
      step: "three", firstName: 1, lastName: null, email: {}, prefs: "nope",
      plan: "enterprise", period: "biweekly", confirmPending: "yes", trialActive: 1, trialEnd: "soon",
    })).toEqual({
      step: STEP_ACCOUNT, firstName: "", lastName: "", email: "",
      prefs: { market_focus: [], trade_types: [], theme_pref: "dark" },
      plan: "pro", period: "annual", confirmPending: false, trialActive: false, trialEnd: null,
    });
  });

  it("an empty object yields a complete step-1 stash, not a partial one", () => {
    const out = normalizeWizardStash({});
    expect(out?.step).toBe(STEP_ACCOUNT);
    expect(out?.prefs.market_focus).toEqual([]);
    expect(out?.prefs.trade_types).toEqual([]);
  });

  it("folds the pre-rename `insider` plan onto essential (read-tolerance is forever)", () => {
    expect(normalizeWizardStash({ ...validStash, plan: "insider" })?.plan).toBe("essential");
  });

  it("keeps a finite trialEnd and rejects a non-finite one", () => {
    expect(normalizeWizardStash({ ...validStash, trialEnd: 1790000000 })?.trialEnd).toBe(1790000000);
    expect(normalizeWizardStash({ ...validStash, trialEnd: Infinity })?.trialEnd).toBeNull();
  });
});

describe("normalizeWizardStash — W1→W2 step remap", () => {
  // W1 stashes (no trialActive/trialEnd fields) used step 4 as Done.
  const w1 = { step: 4, firstName: "A", lastName: "B", email: "a@b.c", prefs: {}, period: "annual", confirmPending: false };

  it("a W1 step-4 stash on a paid plan lands on the new Billing step", () => {
    expect(normalizeWizardStash({ ...w1, plan: "pro" })?.step).toBe(STEP_BILLING);
    expect(normalizeWizardStash({ ...w1, plan: "insider" })?.step).toBe(STEP_BILLING);
  });

  it("a W1 step-4 stash on the free plan lands on Done", () => {
    expect(normalizeWizardStash({ ...w1, plan: "free" })?.step).toBe(STEP_DONE);
  });

  it("a W2 stash keeps its step, clamped to Done", () => {
    expect(normalizeWizardStash({ ...validStash, step: 99 })?.step).toBe(STEP_DONE);
    expect(normalizeWizardStash({ ...validStash, step: STEP_BILLING })?.step).toBe(STEP_BILLING);
  });

  it("floors a fractional step so SOME step pane renders instead of none", () => {
    expect(normalizeWizardStash({ ...validStash, step: 3.7 })?.step).toBe(STEP_PLAN);
  });
});

describe("normalizeOnboardPrefs", () => {
  it("keeps valid prefs, including the non-default themes", () => {
    for (const theme of ["light", "auto"] as const) {
      expect(normalizeOnboardPrefs({ market_focus: ["us"], trade_types: ["crypto"], theme_pref: theme }))
        .toEqual({ market_focus: ["us"], trade_types: ["crypto"], theme_pref: theme });
    }
  });

  it("filters non-string members and rejects non-array shapes", () => {
    expect(normalizeOnboardPrefs({ market_focus: ["us", 5, null], trade_types: "options", theme_pref: "neon" }))
      .toEqual({ market_focus: ["us"], trade_types: [], theme_pref: "dark" });
  });

  it("returns fresh arrays each call — a caller mutating one result cannot poison the next", () => {
    normalizeOnboardPrefs(null).market_focus.push("poison");
    expect(normalizeOnboardPrefs(null).market_focus).toEqual([]);
  });
});
