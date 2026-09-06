/**
 * D7 — Terminal may only tell a user a paid subscription started when billing authority supplied a
 * valid successful receipt (fix round 1: a receipt is EITHER a trial OR a no-trial active purchase
 * — e.g. `essential`, plans.yml trial_days: 0 — and both are genuine successes).
 *
 * The consumer checked `res.ok` and nothing else. It parsed whatever JSON arrived, took `trial_end`
 * if it happened to be a number, and called `onTrialStarted()` unconditionally — so the handoff's
 * counterexample, a bare
 *
 *     HTTP 200 {}
 *
 * was enough to reach "your trial is live", and StepDone then invented `now + 7 days` and printed
 * it as the first-charge date. A money surface claiming a subscription and naming a billing date on
 * the strength of an empty body.
 *
 * D7's first pass over-corrected: it accepted ONLY status="trialing", which refuses a real, charged,
 * no-trial purchase (Stripe answers status="active", trial_end=null for those) and tells the buyer
 * "you have not been charged" — false. This file pins both the fail-closed guard and the "active"
 * no-trial success as first-class outcomes.
 */
import { describe, it, expect } from "vitest";
import { parseSubscribeReceipt, isPlausibleTrialEnd, sanitizeStashTrial } from "@/lib/billingReceipt";

const VALID = {
  status: "trialing",
  subscription_id: "sub_1QabcdEFGH",
  trial_end: 1_787_000_000,   // 2026-08-26T…Z, a plausible epoch in SECONDS
};

describe("D7 — the frozen successful-trial contract is accepted", () => {
  it("a complete trialing receipt parses, and every field is carried through exactly", () => {
    const receipt = parseSubscribeReceipt(VALID);
    expect(receipt).toEqual({
      kind: "trial",
      subscriptionId: "sub_1QabcdEFGH",
      trialEnd: 1_787_000_000,
    });
  });

  it("extra fields the gateway may add do not break it", () => {
    expect(parseSubscribeReceipt({ ...VALID, customer_id: "cus_x", latest_invoice: null })).not.toBeNull();
  });
});

describe("D7 — a malformed 2xx is a FAILURE, not a started trial", () => {
  it("the handoff's counterexample: 200 {}", () => {
    expect(parseSubscribeReceipt({})).toBeNull();
  });

  it('200 {status:"trialing"} — status alone proves nothing', () => {
    expect(parseSubscribeReceipt({ status: "trialing" })).toBeNull();
  });

  it("a receipt missing the subscription id", () => {
    expect(parseSubscribeReceipt({ status: "trialing", trial_end: VALID.trial_end })).toBeNull();
  });

  it("a receipt missing the trial end", () => {
    expect(parseSubscribeReceipt({ status: "trialing", subscription_id: "sub_x" })).toBeNull();
  });

  it("an EMPTY or whitespace subscription id is not an id", () => {
    expect(parseSubscribeReceipt({ ...VALID, subscription_id: "" })).toBeNull();
    expect(parseSubscribeReceipt({ ...VALID, subscription_id: "   " })).toBeNull();
  });

  it("non-object bodies", () => {
    for (const body of [null, undefined, "", "trialing", 0, 42, [], [VALID], true]) {
      expect(parseSubscribeReceipt(body)).toBeNull();
    }
  });
});

describe("D7 — states that are NOT a successful purchase are never laundered into one", () => {
  // These are real Stripe subscription states. Each is a legitimate gateway answer and none of them
  // means a subscription successfully started, so none may produce a receipt.
  for (const status of ["incomplete", "incomplete_expired", "past_due", "canceled", "unpaid", "paused"]) {
    it(`status="${status}" is refused`, () => {
      expect(parseSubscribeReceipt({ ...VALID, status })).toBeNull();
    });
  }

  it("a missing or non-string status is refused", () => {
    expect(parseSubscribeReceipt({ subscription_id: "sub_x", trial_end: VALID.trial_end })).toBeNull();
    expect(parseSubscribeReceipt({ ...VALID, status: 1 })).toBeNull();
  });
});

describe("FIX-1 (BLOCKER-1) — a genuine no-trial purchase (e.g. essential, trial_days: 0) is accepted", () => {
  it('status="active", trial_end=null, a real subscription id -> a kind:"active" receipt, NOT null', () => {
    expect(parseSubscribeReceipt({ status: "active", subscription_id: "sub_x", trial_end: null }))
      .toEqual({ kind: "active", subscriptionId: "sub_x" });
  });

  it('status="active" with an empty/whitespace subscription id is still refused', () => {
    expect(parseSubscribeReceipt({ status: "active", subscription_id: "", trial_end: null })).toBeNull();
    expect(parseSubscribeReceipt({ status: "active", subscription_id: "   ", trial_end: null })).toBeNull();
  });

  it('status="active" ignores a bogus trial_end — it never needed one', () => {
    expect(parseSubscribeReceipt({ status: "active", subscription_id: "sub_x", trial_end: "garbage" }))
      .toEqual({ kind: "active", subscriptionId: "sub_x" });
  });

  it("trialing cases are unaffected: still require a plausible trial_end", () => {
    expect(parseSubscribeReceipt(VALID)).toEqual({ kind: "trial", subscriptionId: VALID.subscription_id, trialEnd: VALID.trial_end });
  });
});

describe("FIX-2 (MAJOR-1) — sanitizeStashTrial couples trialActive to a genuinely plausible trialEnd", () => {
  it("trialActive:true with trialEnd:null is downgraded to false/null", () => {
    expect(sanitizeStashTrial(true, null)).toEqual({ trialActive: false, trialEnd: null });
  });

  for (const bad of [0, -1, 1_787_000_000_000, NaN]) {
    it(`an implausible trialEnd (${bad}) forces trialActive false and trialEnd null`, () => {
      expect(sanitizeStashTrial(true, bad)).toEqual({ trialActive: false, trialEnd: null });
    });
  }

  it("a genuinely plausible pair survives unchanged", () => {
    expect(sanitizeStashTrial(true, 1_787_000_000)).toEqual({ trialActive: true, trialEnd: 1_787_000_000 });
  });

  it("trialActive:false always yields trialActive:false — trialEnd itself still passes through the same plausibility window", () => {
    expect(sanitizeStashTrial(false, 1_787_000_000)).toEqual({ trialActive: false, trialEnd: 1_787_000_000 });
    expect(sanitizeStashTrial(false, -1)).toEqual({ trialActive: false, trialEnd: null });
  });
});

describe("isPlausibleTrialEnd — exported so every reader shares the identical window", () => {
  it("accepts the window's edges and a real value; rejects out-of-window/non-numeric", () => {
    expect(isPlausibleTrialEnd(1_577_836_800)).toBe(true);
    expect(isPlausibleTrialEnd(4_102_444_800)).toBe(true);
    expect(isPlausibleTrialEnd(1_787_000_000)).toBe(true);
    expect(isPlausibleTrialEnd(0)).toBe(false);
    expect(isPlausibleTrialEnd(NaN)).toBe(false);
    expect(isPlausibleTrialEnd("1787000000")).toBe(false);
  });
});

describe("D7 — trial_end must be a plausible DATE, not merely a number", () => {
  it("rejects 0 and negatives (would render 1970)", () => {
    expect(parseSubscribeReceipt({ ...VALID, trial_end: 0 })).toBeNull();
    expect(parseSubscribeReceipt({ ...VALID, trial_end: -1 })).toBeNull();
  });

  it("rejects MILLISECONDS, which a bare typeof check would have accepted", () => {
    // 1_787_000_000_000 ms is the same instant as the valid value — but read as seconds it is the
    // year 58,600. This is the failure mode that makes `typeof x === "number"` insufficient on a
    // surface whose whole job is to name a billing date.
    expect(parseSubscribeReceipt({ ...VALID, trial_end: 1_787_000_000_000 })).toBeNull();
  });

  it("rejects NaN, Infinity and numeric strings", () => {
    expect(parseSubscribeReceipt({ ...VALID, trial_end: NaN })).toBeNull();
    expect(parseSubscribeReceipt({ ...VALID, trial_end: Infinity })).toBeNull();
    expect(parseSubscribeReceipt({ ...VALID, trial_end: "1787000000" })).toBeNull();
  });

  it("accepts the plausible window's edges", () => {
    expect(parseSubscribeReceipt({ ...VALID, trial_end: 1_577_836_800 })).not.toBeNull();  // 2020-01-01
    expect(parseSubscribeReceipt({ ...VALID, trial_end: 4_102_444_800 })).not.toBeNull();  // 2100-01-01
  });
});
