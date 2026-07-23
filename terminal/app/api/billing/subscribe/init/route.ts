// POST /api/billing/subscribe/init → { client_secret, customer_id }
// Auth required. Creates (gateway-side) a SetupIntent for the chosen tier/interval.
// Upstream: 401 unauthed · 409 already-subscribed · 400 bad tier — all piped through.

export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { rateLimit, tooMany } from "@/lib/rateLimit";
import { billingAuth, forward, isTier, isInterval } from "../../gateway";

export async function POST(req: Request) {
  const rl = rateLimit(req, { name: "billing-init", max: 20 });
  if (!rl.ok) return tooMany(rl);

  const auth = await billingAuth();
  if (!auth) {
    return NextResponse.json({ error: "Please sign in first.", code: "unauthenticated" }, { status: 401 });
  }

  let body: any;
  try { body = await req.json(); } catch { body = {}; }
  const tier = body?.tier;
  const interval = body?.interval;
  if (!isTier(tier) || !isInterval(interval)) {
    return NextResponse.json({ error: "Invalid tier or interval." }, { status: 400 });
  }

  return forward("/api/billing/subscribe/init", {
    method: "POST",
    token: auth.token,
    body: { tier, interval },
    signal: req.signal,
  });
}
