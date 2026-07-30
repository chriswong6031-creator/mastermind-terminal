import { billingAuth, BILLING_BASE } from "@/app/api/billing/gateway";
import { isPaidSubscriptionTier, normalizeSubscriptionTier } from "@/lib/subscriptionTier";

/**
 * Server-side entitlement checks against the AUTHORITY — macro-api
 * `user_entitlements` (written by app/billing.py from Stripe), surfaced via
 * `GET {BILLING_BASE}/api/me` → `{ tier, features }`.
 *
 * NOT `profiles.is_pro`: terminal/AGENTS.md flags that as a UI hint that can
 * drift from the real subscription (a paid user with a stale hint gets wrongly
 * blocked; an expired one wrongly allowed).
 *
 * All checks FAIL-CLOSED: no session / non-2xx / error → the restrictive answer,
 * so a paid surface is never served on uncertainty.
 */
type Entitlement = { tier: string; features: string[] };

async function fetchEntitlement(): Promise<Entitlement | null> {
  const auth = await billingAuth();
  if (!auth) return null;
  try {
    const r = await fetch(`${BILLING_BASE}/api/me`, {
      headers: { Authorization: `Bearer ${auth.token}`, Accept: "application/json" },
      cache: "no-store",
    });
    if (!r.ok) return null;
    const d = await r.json();
    return {
      tier: typeof d?.tier === "string" ? d.tier : "free",
      features: Array.isArray(d?.features) ? d.features : [],
    };
  } catch {
    return null;
  }
}

/** Live-options surface — the `terminal_live_options` feature (insider + pro, incl. trial). */
export async function hasLiveOptions(): Promise<boolean> {
  const e = await fetchEntitlement();
  return !!e && e.features.includes("terminal_live_options");
}

/**
 * Any PAID account (insider or pro, incl. 7-day trial). Used where the surface
 * isn't broken out as its own feature in config/plans.yml — e.g. Pine-script
 * save — matching the legacy `is_pro` boolean's "any paid" semantics. If a
 * surface should be pro-ONLY, gate on `tier === "pro"` instead.
 */
export async function isPaidTier(): Promise<boolean> {
  const e = await fetchEntitlement();
  return !!e && isPaidSubscriptionTier(e.tier);
}

/** Pro-equivalent account, including the billing authority's operator/comp `unlimited` tier. */
export async function isProTier(): Promise<boolean> {
  const e = await fetchEntitlement();
  return !!e && normalizeSubscriptionTier(e.tier) === "pro";
}
