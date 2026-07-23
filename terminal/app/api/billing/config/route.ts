// GET /api/billing/config → Stripe publishable key for Elements.
// No auth needed — the publishable key is public by design. Plain forward.
// The gateway returns 503 (piped through) when billing is not yet configured.

export const runtime = "nodejs";

import { forward } from "../gateway";

export async function GET(req: Request) {
  return forward("/api/billing/config", { method: "GET", signal: req.signal });
}
