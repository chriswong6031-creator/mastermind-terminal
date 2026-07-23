// Portfolio-brief proxy — GET-only pass-through to the macro-api desk endpoint
// (GET {GATEWAY}/api/portfolio/brief), mirroring the brain-gateway proxy pattern
// (app/api/brain/[...path]/route.ts). CSP blocks the browser from calling the gateway
// cross-origin, so the "Your book today" panel calls this same-origin route; here we
// verify the Supabase session and, when it exists, inject Authorization: Bearer <token>.
//
// AUTHORITY: the macro-api endpoint is the sole authority on the Pro entitlement (it
// checks the canonical Stripe-backed tier). We do NOT gate on `profiles.is_pro` here —
// that flag is only the terminal's initial-UI hint. This route forwards to the gateway
// and relays its status verbatim: 200 (brief), 403 {error:"pro_required",tier} (teaser),
// 503 (artifact unavailable). The one thing we short-circuit is a MISSING session: with
// no bearer to send there is nothing for the desk to key a per-user brief on, so we 401
// locally and never contact the gateway (the panel treats 401 as "hidden").
//
// Required env: BRAIN_GATEWAY_URL (default https://mastermind-x.com).

export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit, tooMany } from "@/lib/rateLimit";

const GATEWAY = process.env.BRAIN_GATEWAY_URL || "https://mastermind-x.com";
const UPSTREAM = `${GATEWAY}/api/portfolio/brief`;

// Optional tiny per-user cache: the brief is a once-a-day artifact, so a short TTL keeps
// tab-switches and re-mounts from re-hitting the gateway. Keyed by the access token
// (per-user, per-session). Bounded so a token churn can't grow it unboundedly.
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX = 500;
type CacheEntry = { at: number; status: number; body: string; contentType: string };
const cache = new Map<string, CacheEntry>();

function cacheGet(token: string): CacheEntry | null {
  const e = cache.get(token);
  if (!e) return null;
  if (Date.now() - e.at > CACHE_TTL_MS) {
    cache.delete(token);
    return null;
  }
  return e;
}

function cacheSet(token: string, entry: CacheEntry): void {
  // Only cache successful briefs — 403/503/errors must re-check on the next load so an
  // upgrade or a recovered artifact is reflected promptly.
  if (entry.status !== 200) return;
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(token, entry);
}

// Verify the session and return the access token, or null when there is no valid session.
// We NEVER read or forward a client-supplied Authorization header — the only Bearer this
// proxy sends is one minted here from the server-verified session.
async function sessionToken(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!session || !user) return null;
  return session.access_token;
}

export async function GET(req: Request) {
  const rl = rateLimit(req, { name: "portfolio-brief", max: 30 });
  if (!rl.ok) return tooMany(rl);

  const token = await sessionToken();
  // No session → nothing to key a per-user brief on. 401 locally; the panel hides itself.
  if (!token) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const hit = cacheGet(token);
  if (hit) {
    return new Response(hit.body, {
      status: hit.status,
      headers: {
        "Content-Type": hit.contentType,
        "Cache-Control": "private, no-store",
        "X-Brief-Cache": "hit",
      },
    });
  }

  try {
    const upstream = await fetch(UPSTREAM, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: req.signal,
    });
    const contentType =
      upstream.headers.get("content-type") || "application/json; charset=utf-8";
    const body = await upstream.text();
    cacheSet(token, { at: Date.now(), status: upstream.status, body, contentType });
    return new Response(body, {
      status: upstream.status,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, no-store",
        "X-Brief-Cache": "miss",
      },
    });
  } catch (e: any) {
    // Gateway unreachable — the panel renders one quiet "unavailable" line and the
    // Conviction Book below is never blocked. 503 keeps the panel's unavailable branch.
    return NextResponse.json(
      { error: "gateway_unreachable", detail: e?.message },
      { status: 503 },
    );
  }
}
