// POST /api/billing/subscribe/complete → { status, subscription_id, trial_end }
// Auth required. Called after Stripe confirmSetup() succeeds; the gateway attaches
// the payment method and starts the 7-day trial subscription.
// Upstream: 400 SI-not-succeeded/foreign · 409 already-subscribed — piped through.

export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { rateLimit, tooMany } from "@/lib/rateLimit";
import { billingAuth, forward, isTier, isInterval } from "../../gateway";

export async function POST(req: Request) {
  const rl = rateLimit(req, { name: "billing-complete", max: 20 });
  if (!rl.ok) return tooMany(rl);

  const auth = await billingAuth();
  if (!auth) {
    return NextResponse.json({ error: "Please sign in first.", code: "unauthenticated" }, { status: 401 });
  }

  let body: any;
  try { body = await req.json(); } catch { body = {}; }
  const setupIntentId = body?.setup_intent_id;
  const tier = body?.tier;
  const interval = body?.interval;
  if (typeof setupIntentId !== "string" || !setupIntentId) {
    return NextResponse.json({ error: "Missing setup_intent_id." }, { status: 400 });
  }
  if (!isTier(tier) || !isInterval(interval)) {
    return NextResponse.json({ error: "Invalid tier or interval." }, { status: 400 });
  }

  return forward("/api/billing/subscribe/complete", {
    method: "POST",
    token: auth.token,
    body: { setup_intent_id: setupIntentId, tier, interval },
    signal: req.signal,
  });
}
