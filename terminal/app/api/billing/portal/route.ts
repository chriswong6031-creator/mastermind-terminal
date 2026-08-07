// GET /api/billing/portal → { url } — a Stripe customer-portal session for the
// signed-in user (payment method, invoices, cancellation).
//
// Thin proxy, same shape as the sibling billing routes: validate the Supabase
// session, forward with the user's access token, pipe the gateway's status and
// JSON straight back. All Stripe secret-key logic lives in the gateway.
//
// The 404 is LOAD-BEARING and must not be smoothed over: the gateway returns it
// when the account has no Stripe customer at all (a comp / lifetime grant), and
// the settings panel turns that into "this account has no Stripe billing" rather
// than a "please try again" that could never succeed.

export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { rateLimit, tooMany } from "@/lib/rateLimit";
import { billingAuth, forward } from "../gateway";

export async function GET(req: Request) {
  const rl = rateLimit(req, { name: "billing-portal", max: 20 });
  if (!rl.ok) return tooMany(rl);

  const auth = await billingAuth();
  if (!auth) {
    return NextResponse.json(
      { error: "Please sign in first.", code: "unauthenticated" },
      { status: 401 },
    );
  }

  return forward("/api/billing/portal", { method: "GET", token: auth.token, signal: req.signal });
}
