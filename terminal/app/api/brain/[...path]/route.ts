// Brain-gateway catch-all proxy — the Mastermind Brain widget (mm_brain.js) calls
// /api/brain/* same-origin with credentials:'include' and NO Authorization header (the
// Terminal has no window.MDXAuth). This route verifies the Supabase session and injects
// the Bearer for the gateway, streaming the response body straight through.
//
// This is a TIGHT allowlist, not a generic open proxy. Only the exact paths the widget
// needs are forwarded; everything else 404s. The static /api/brain/me route.ts takes
// precedence over this catch-all in Next.js routing and is left in place.
//
// Required env: BRAIN_GATEWAY_URL (default https://mastermind-x.com; VPS co-located http://127.0.0.1:8000)
// The gateway expects Authorization: Bearer <supabase access token> and does its own tier/quota checks.

export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit, tooMany } from "@/lib/rateLimit";

const GATEWAY = process.env.BRAIN_GATEWAY_URL || "https://mastermind-x.com";

// Allowlist of forwarded upstream paths, keyed by HTTP method. `stream` is the only POST;
// `me` / `threads` / `threads/<id>` are GET reads. A thread id is a single path segment
// (no slashes) so `threads/abc/../secret` can never slip through.
type Method = "GET" | "POST";
function resolvePath(method: Method, segs: string[]): string | null {
  const joined = segs.join("/");
  if (method === "POST") {
    return joined === "stream" ? "stream" : null;
  }
  // GET
  if (joined === "me" || joined === "threads") return joined;
  if (segs.length === 2 && segs[0] === "threads") {
    const id = segs[1];
    // single, non-empty, path-safe segment only
    if (id && !id.includes("/") && !id.includes("..")) return `threads/${id}`;
    return null;
  }
  return null;
}

// Identity forwarding for the co-located gateway's device-linked free-credit pool.
// The gateway trusts x-mm-aid / x-mm-ip ONLY when they carry BRAIN_PROXY_SECRET — a
// source-IP check is insufficient because the gateway sits behind Caddy on 127.0.0.1,
// so ALL public traffic appears local. We forward the visitor's first-party mm_aid
// cookie, their real client IP, and the shared secret. All empty-safe.
const PROXY_SECRET = process.env.BRAIN_PROXY_SECRET || "";
function mmAid(req: Request): string {
  const m = (req.headers.get("cookie") || "").match(/(?:^|;\s*)mm_aid=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : "";
}
function mmIp(req: Request): string {
  for (const k of ["eo-client-ip", "cf-connecting-ip", "true-client-ip"]) {
    const v = (req.headers.get(k) || "").trim();
    if (v) return v;
  }
  return (req.headers.get("x-forwarded-for") || "").split(",")[0].trim();
}
function idHeaders(req: Request): Record<string, string> {
  const h: Record<string, string> = { "x-mm-aid": mmAid(req), "x-mm-ip": mmIp(req) };
  if (PROXY_SECRET) h["x-mm-proxy-secret"] = PROXY_SECRET;
  return h;
}

// Verify the session and return the access token, or a 401 Response to relay.
async function authOrReject(): Promise<
  { token: string } | { error: Response }
> {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!session || !user) {
    return {
      error: NextResponse.json(
        { error: "unauthenticated" },
        { status: 401 },
      ),
    };
  }
  return { token: session.access_token };
}

// SSE / JSON pass-through: relay upstream status + body untouched. Streaming bodies
// (the /stream SSE) flow straight through with no buffering.
function relay(upstream: Response): Response {
  const ct =
    upstream.headers.get("content-type") ||
    "application/json; charset=utf-8";
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "Content-Type": ct,
      "Cache-Control": "no-cache, no-transform",
    },
  });
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const rl = rateLimit(req, { name: "brain", max: 60 });
  if (!rl.ok) return tooMany(rl);

  const { path = [] } = await params;
  const upstreamPath = resolvePath("GET", path);
  if (!upstreamPath) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const auth = await authOrReject();
  if ("error" in auth) return auth.error;

  try {
    const upstream = await fetch(`${GATEWAY}/api/brain/${upstreamPath}`, {
      headers: { Authorization: `Bearer ${auth.token}`, ...idHeaders(req) },
      signal: req.signal,
    });
    return relay(upstream);
  } catch (e: any) {
    return NextResponse.json(
      { error: "Gateway unreachable", detail: e?.message },
      { status: 502 },
    );
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const rl = rateLimit(req, { name: "brain", max: 60 });
  if (!rl.ok) return tooMany(rl);

  const { path = [] } = await params;
  const upstreamPath = resolvePath("POST", path);
  if (!upstreamPath) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const auth = await authOrReject();
  if ("error" in auth) return auth.error;

  // Forward the raw body; the gateway validates the contract. Preserve the client's
  // Content-Type (defaults to JSON) so the gateway parses it correctly.
  // Body cap: text turns are ~2KB and vision turns carry up to 4 downscaled images
  // (~500KB each as data URIs) — 8MB is generous headroom while still bounding what
  // an abusive client can make this proxy buffer.
  const contentType = req.headers.get("content-type") || "application/json";
  const cl = req.headers.get("content-length");
  if (cl && /^\d+$/.test(cl) && parseInt(cl, 10) > 8_000_000) {
    return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  }
  const body = await req.text();
  if (body.length > 8_000_000) {
    return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  }

  try {
    const upstream = await fetch(`${GATEWAY}/api/brain/${upstreamPath}`, {
      method: "POST",
      headers: {
        "Content-Type": contentType,
        Authorization: `Bearer ${auth.token}`,
        ...idHeaders(req),
      },
      body,
      signal: req.signal,
    });
    return relay(upstream);
  } catch (e: any) {
    return NextResponse.json(
      { error: "Gateway unreachable", detail: e?.message },
      { status: 502 },
    );
  }
}
