/** The chart's three effective entitlement levels. */
export type SubscriptionTier = "free" | "essential" | "pro";

/**
 * Normalize the billing authority's raw tier into the chart's effective tier.
 *
 * `unlimited` is the operator/complimentary form of Pro. Account settings already displayed it
 * as Pro; keeping the normalization here prevents picker, renderer, settings, and alerts from
 * independently disagreeing about the same entitlement.
 *
 * `essential` is now the canonical name — both for the billing authority (/api/me emits it) and
 * for this union. `insider` was the old name for the SAME entitlement and stays ACCEPTED INBOUND
 * FOREVER: cached pages, `localStorage` `mm.devTier`, and the onboarding sessionStorage stash can
 * carry the old value indefinitely, and there is no migration that can reach them. Dropping the
 * alias would read those users as Free — the indicator picker fails OPEN on an unknown tier while
 * the chart renderer fails CLOSED, so the two would disagree mid-session.
 *
 * Inbound-only: nothing writes `insider` back out.
 */
export function normalizeSubscriptionTier(value: unknown): SubscriptionTier {
  const tier = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (tier === "pro" || tier === "unlimited") return "pro";
  if (tier === "essential" || tier === "insider") return "essential";
  return "free";
}

export function isPaidSubscriptionTier(value: unknown): boolean {
  return normalizeSubscriptionTier(value) !== "free";
}

/**
 * The dev-only `localStorage` tier override (`mm.devTier`), normalized.
 *
 * Lives here rather than inline in TerminalShell so the legacy-name tolerance is unit-testable
 * and stated ONCE. `mm.devTier` is written by hand on developer machines and is never migrated,
 * so a key set to `insider` before the rename must keep working indefinitely.
 *
 * Returns null for absent/unknown values AND for `"free"` — the override exists to raise the
 * tier past what `/api/me` reports, so "no override" and "free" are the same instruction.
 */
export function normalizeDevTierOverride(raw: unknown): Exclude<SubscriptionTier, "free"> | null {
  const tier = normalizeSubscriptionTier(raw);
  return tier === "free" ? null : tier;
}
