import { billingAuth, BILLING_BASE } from "@/app/api/billing/gateway";

/**
 * Server-side "can this caller use live options?" check.
 *
 * The entitlement AUTHORITY is macro-api's `user_entitlements` (written by
 * app/billing.py from Stripe events), surfaced via `GET {BASE}/api/me` as
 * `{ tier, features, ... }`. Options is the **`terminal_live_options`** feature
 * (config/plans.yml — granted to insider + pro, INCLUDING the 7-day trial).
 *
 * This deliberately does NOT read `profiles.is_pro`: per terminal/AGENTS.md that
 * is a UI hint only and can drift from the real subscription (a paid user whose
 * hint is stale would be wrongly blocked; an expired user wrongly allowed).
 *
 * Fail-closed: no session, a non-2xx from the gateway, or any error → false, so
 * the paid surface is never served on uncertainty.
 */
export async function hasLiveOptions(): Promise<boolean> {
  const auth = await billingAuth();
  if (!auth) return false;
  try {
    const r = await fetch(`${BILLING_BASE}/api/me`, {
      headers: { Authorization: `Bearer ${auth.token}`, Accept: "application/json" },
      cache: "no-store",
    });
    if (!r.ok) return false;
    const d = await r.json();
    return Array.isArray(d?.features) && d.features.includes("terminal_live_options");
  } catch {
    return false;
  }
}
