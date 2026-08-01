/** The chart's three effective entitlement levels. */
export type SubscriptionTier = "free" | "insider" | "pro";

/**
 * Normalize the billing authority's raw tier into the chart's effective tier.
 *
 * `unlimited` is the operator/complimentary form of Pro. Account settings already displayed it
 * as Pro; keeping the normalization here prevents picker, renderer, settings, and alerts from
 * independently disagreeing about the same entitlement.
 *
 * `essential` is the billing authority's new name for the SAME entitlement as `insider` — the
 * macro-side rename lands after this tolerance. Accepting it here (INPUT widening only; the
 * SubscriptionTier union and every output stay `insider`) means an Essential subscriber never
 * reads as Free, which is what would otherwise happen: the indicator picker fails OPEN on an
 * unknown tier while the chart renderer fails CLOSED, so the two would disagree mid-session.
 */
export function normalizeSubscriptionTier(value: unknown): SubscriptionTier {
  const tier = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (tier === "pro" || tier === "unlimited") return "pro";
  if (tier === "insider" || tier === "essential") return "insider";
  return "free";
}

export function isPaidSubscriptionTier(value: unknown): boolean {
  return normalizeSubscriptionTier(value) !== "free";
}
