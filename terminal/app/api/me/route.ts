// GET /api/me → { tier, features, status, current_period_end }
// Auth required upstream, but this proxy softens the unauthed case: guests get a
// free default at 200 (not 401) so the UI can render entitlement without a branch.

export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { billingAuth, forward } from "../billing/gateway";

const GUEST_DEFAULT = { tier: "free", features: [] as string[], status: "none" };

export async function GET(req: Request) {
  const auth = await billingAuth();
  if (!auth) return NextResponse.json(GUEST_DEFAULT, { status: 200 });
  return forward("/api/me", { method: "GET", token: auth.token, signal: req.signal });
}
