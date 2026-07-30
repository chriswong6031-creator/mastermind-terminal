/** The chart's three effective entitlement levels. */
export type SubscriptionTier = "free" | "insider" | "pro";

/**
 * Normalize the billing authority's raw tier into the chart's effective tier.
 *
 * `unlimited` is the operator/complimentary form of Pro. Account settings already displayed it
 * as Pro; keeping the normalization here prevents picker, renderer, settings, and alerts from
 * independently disagreeing about the same entitlement.
 */
export function normalizeSubscriptionTier(value: unknown): SubscriptionTier {
  const tier = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (tier === "pro" || tier === "unlimited") return "pro";
  if (tier === "insider") return "insider";
  return "free";
}

export function isPaidSubscriptionTier(value: unknown): boolean {
  return normalizeSubscriptionTier(value) !== "free";
}
