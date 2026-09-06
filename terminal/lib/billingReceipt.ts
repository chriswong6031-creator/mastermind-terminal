/**
 * The subscribe receipt contract (D7 + fix round 1).
 *
 * `/api/billing/subscribe/complete` answers `{ status, subscription_id, trial_end }`. The Terminal
 * consumer checked `res.ok` and NOTHING else: it parsed whatever JSON arrived, took `trial_end` if
 * it happened to be a number, and called `onTrialStarted()` unconditionally. `HTTP 200 {}` was
 * therefore enough to move a user to "your trial is live" — and StepDone, handed a null date,
 * invented `now + 7 days` and printed it as the first-charge date.
 *
 * So on a money surface the product could tell a user a paid trial had started, and name a billing
 * date, on the strength of a response that said nothing at all.
 *
 * D7's original fix over-corrected: it recognized ONLY `status === "trialing"` as a success, which
 * is wrong for any tier configured with no trial (macro `config/plans.yml` `essential: trial_days:
 * 0`) — Stripe answers `status: "active", trial_end: null` for a genuine, successful, no-trial
 * purchase, and the trialing-only guard refused it, telling a charged customer "you have not been
 * charged" with no way forward. This parser recognizes BOTH successful shapes and discriminates
 * them, so a caller can route each to truthful copy instead of collapsing one into "malformed".
 *
 * Validation is deliberately strict. If the gateway's success contract intentionally changes, the
 * producer and this consumer change together, with both sides' tests — which is the point of
 * freezing it here.
 */

/**
 * A verified successful subscribe outcome. Every field is proven, so callers need no further
 * guards — they only need to branch on `kind`.
 */
export type SubscribeReceipt =
  | {
      kind: "trial";
      subscriptionId: string;
      /** Epoch SECONDS of the first charge. Validated as a plausible date, not merely `typeof number`. */
      trialEnd: number;
    }
  | {
      kind: "active";
      subscriptionId: string;
    };

// Sanity window for an epoch-seconds trial end: 2020-01-01 .. 2100-01-01. This is not pedantry.
// A gateway that answered in MILLISECONDS would sail through a bare `typeof === "number"` check and
// render a first-charge date tens of thousands of years out; a 0 or a negative would render 1970.
// Both are "a number", and neither is a billing date.
const MIN_TRIAL_END = 1_577_836_800; // 2020-01-01T00:00:00Z
const MAX_TRIAL_END = 4_102_444_800; // 2100-01-01T00:00:00Z

/** Exported so every other reader of a trial-end epoch (e.g. a persisted wizard stash) applies the
 *  identical window rather than a looser ad hoc check. */
export function isPlausibleTrialEnd(value: unknown): value is number {
  return typeof value === "number"
    && Number.isFinite(value)
    && value >= MIN_TRIAL_END
    && value <= MAX_TRIAL_END;
}

/**
 * Parse a `subscribe/complete` body into a verified receipt, or `null`.
 *
 * `null` means "do not claim anything happened" — the caller must stay on Billing and offer a
 * retry, never advance to Done. There is deliberately no partial-credit return: a receipt missing
 * any required field cannot support a user-facing claim about money.
 */
export function parseSubscribeReceipt(body: unknown): SubscribeReceipt | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;

  const subscriptionId = typeof b.subscription_id === "string" ? b.subscription_id.trim() : "";
  if (!subscriptionId) return null;

  // The successful trial state: requires a plausible trial_end, exactly as before.
  if (b.status === "trialing") {
    if (!isPlausibleTrialEnd(b.trial_end)) return null;
    return { kind: "trial", subscriptionId, trialEnd: b.trial_end };
  }

  // The successful NO-TRIAL state (e.g. `essential`, plans.yml trial_days: 0): Stripe returns the
  // subscription's real status, "active", with trial_end: null. This is a genuine, charged
  // purchase — it must not be refused as "malformed" just because it carries no trial date.
  if (b.status === "active") {
    return { kind: "active", subscriptionId };
  }

  // Everything else — "incomplete", "past_due", "canceled", "unpaid", "paused", missing/non-string
  // status — is a real Stripe state that is NOT a successful purchase, and must not be laundered
  // into one.
  return null;
}

/**
 * Re-validate a `{trialActive, trialEnd}` pair read from a persisted client-side stash (the wizard
 * survives a client-tree remount via `sessionStorage`). The stash is a second, unguarded input into
 * the same "your trial is live" UI claim the network receipt above guards — it must be held to the
 * identical fail-closed standard: `trialActive` may only be true when `trialEnd` is a genuinely
 * plausible epoch, and the two fields are coupled so one can never survive without the other.
 */
export function sanitizeStashTrial(
  trialActive: boolean,
  trialEnd: number | null,
): { trialActive: boolean; trialEnd: number | null } {
  const plausibleEnd = trialEnd !== null && isPlausibleTrialEnd(trialEnd) ? trialEnd : null;
  return { trialActive: trialActive === true && plausibleEnd !== null, trialEnd: plausibleEnd };
}
