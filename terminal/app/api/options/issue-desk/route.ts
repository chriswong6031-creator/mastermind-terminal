import { NextResponse } from "next/server";
import { billingAuth } from "@/app/api/billing/gateway";
import { hasIssueDeskOperator } from "@/lib/entitlement";
import { ISSUE_DESK_API_BASE } from "@/lib/upstreams";

const NO_STORE = { "Cache-Control": "private, no-store", Vary: "Authorization", "X-Content-Type-Options": "nosniff" };
const UPSTREAM_PATH = "/api/options/issue-desk";

async function operatorToken(): Promise<string | null> {
  const auth = await billingAuth();
  if (!auth) return null;
  return (await hasIssueDeskOperator()) ? auth.token : "";
}

async function proxy(path: string, init: RequestInit): Promise<Response> {
  try {
    const upstream = await fetch(`${ISSUE_DESK_API_BASE}${path}`, {
      ...init,
      cache: "no-store",
      redirect: "error",
      headers: {
        Accept: "application/json",
        ...(init.headers ?? {}),
      },
    });
    const body = await upstream.text().catch(() => "");
    if (!upstream.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
      return NextResponse.json({ error: "invalid_upstream_response" }, { status: 502, headers: NO_STORE });
    }
    return new Response(body, {
      status: upstream.status,
      headers: {
        "Content-Type": "application/json",
        ...NO_STORE,
      },
    });
  } catch {
    return NextResponse.json({ error: "issue_desk_unavailable" }, { status: 502, headers: NO_STORE });
  }
}

/** Private operator read.  The published options evidence endpoints are not a
 * substitute for this queue: it contains mutable review authority and is never
 * fetched from R2 or through /api/flow. */
export async function GET(): Promise<Response> {
  const token = await operatorToken();
  if (token === null) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });
  if (!token) return NextResponse.json({ error: "forbidden" }, { status: 403, headers: NO_STORE });
  return proxy(UPSTREAM_PATH, { headers: { Authorization: `Bearer ${token}` } });
}
