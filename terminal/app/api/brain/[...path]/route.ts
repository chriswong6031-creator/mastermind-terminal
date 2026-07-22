// Brain-gateway catch-all proxy — the Mastermind Brain widget (mm_brain.js) calls
// /api/brain/* same-origin with credentials:'include' and NO Authorization header (the
// Terminal has no window.MDXAuth). This route verifies the Supabase session and, when it
// has one, injects the Bearer for the gateway, streaming the response body straight through.
//
// This is a TIGHT allowlist, not a generic open proxy. Only the exact paths the widget
// needs are forwarded; everything else 404s. Thread rename (PATCH) and delete (DELETE)
// target `threads/<id>` ONLY and are session-required — never guest-eligible.
//
// GUEST LANE: the gateway has an admin-toggled guest mode (a free Fast lane, N/day per
// device cookie+IP). For `GET me` and `POST stream` ONLY, a missing/invalid session no
// longer 401s here — we forward WITHOUT any Authorization header and let the GATEWAY be
// the sole authority: guest mode on → it serves tier "guest"; off → it 401s itself and we
// pass that through unchanged. The device-identity headers (x-mm-aid / x-mm-ip /
// x-mm-proxy-secret) still ride along so the gateway can meter the per-device pool, and
// the rate limit + body caps still apply. All other paths stay session-required 401s.
//
// Required env: BRAIN_GATEWAY_URL (default https://mastermind-x.com; VPS co-located http://127.0.0.1:8000)
// The gateway expects Authorization: Bearer <supabase access token> and does its own tier/quota checks.

export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit, tooMany } from "@/lib/rateLimit";

const GATEWAY = process.env.BRAIN_GATEWAY_URL || "https://mastermind-x.com";

// Allowlist of forwarded upstream paths, keyed by HTTP method. `stream` is the only POST;
// `me` / `threads` / `threads/<id>` are GET reads; `threads/<id>` is also the ONLY
// PATCH (rename) and DELETE target. A thread id is a single path segment (no slashes) so
// `threads/abc/../secret` can never slip through.
type Method = "GET" | "POST" | "PATCH" | "DELETE";

// `threads/<id>` where <id> is a single, non-empty, path-safe segment — the sole
// per-thread target, shared by GET (read) / PATCH (rename) / DELETE. Returns the joined
// upstream path or null.
function threadIdPath(segs: string[]): string | null {
  if (segs.length === 2 && segs[0] === "threads") {
    const id = segs[1];
    if (id && !id.includes("/") && !id.includes("..")) return `threads/${id}`;
  }
  return null;
}

function resolvePath(method: Method, segs: string[]): string | null {
  const joined = segs.join("/");
  if (method === "POST") {
    // `stream` = SSE chat turn; `chart/state` = the Chart Bus v2 state-mirror POST (CMX W1) —
    // a small JSON body carrying the terminal's chart session + drawing acks for the gateway.
    if (joined === "stream" || joined === "chart/state") return joined;
    return null;
  }
  // PATCH (rename) and DELETE target a single thread and nothing else.
  if (method === "PATCH" || method === "DELETE") return threadIdPath(segs);
  // GET
  if (joined === "me" || joined === "threads") return joined;
  return threadIdPath(segs);
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

// Upstream paths served through the gateway's guest lane: `GET me` and `POST stream` ONLY.
// For these, a missing/invalid session is forwarded (no Authorization) so the gateway can
// decide; every other allowlisted path stays session-required.
const GUEST_OK = new Set(["me", "stream"]);

// Verify the session and return the access token, or null when there is no valid session.
// The caller decides what null means per path. We NEVER read or forward a client-supplied
// Authorization header — the only Bearer this proxy sends is one minted here from the
// server-verified session.
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

// Resolve auth for a resolved upstream path: return the outbound headers to attach
// (device identity always; Authorization only when we hold a token), or a 401 Response to
// relay when the path requires a session and none is present. Anonymous callers to a
// GUEST_OK path get device headers but NO Authorization — the gateway does the rest.
async function authHeaders(
  req: Request,
  upstreamPath: string,
): Promise<{ headers: Record<string, string> } | { error: Response }> {
  const token = await sessionToken();
  if (!token && !GUEST_OK.has(upstreamPath)) {
    return {
      error: NextResponse.json({ error: "unauthenticated" }, { status: 401 }),
    };
  }
  const headers: Record<string, string> = { ...idHeaders(req) };
  if (token) headers.Authorization = `Bearer ${token}`;
  return { headers };
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

  const auth = await authHeaders(req, upstreamPath);
  if ("error" in auth) return auth.error;

  try {
    const upstream = await fetch(`${GATEWAY}/api/brain/${upstreamPath}`, {
      headers: auth.headers,
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

  const auth = await authHeaders(req, upstreamPath);
  if ("error" in auth) return auth.error;

  // Forward the raw body; the gateway validates the contract. Preserve the client's
  // Content-Type (defaults to JSON) so the gateway parses it correctly.
  // Body cap: text turns are ~2KB and vision turns carry up to 4 downscaled images
  // (~500KB each as data URIs) — 8MB is generous headroom while still bounding what
  // an abusive client can make this proxy buffer.
  const contentType = req.headers.get("content-type") || "application/json";
  // Path-specific body caps: the chat `stream` carries vision data URIs (up to ~8MB); the Chart Bus
  // `chart/state` mirror is a small JSON session snapshot — cap it tight at 64KB.
  const maxBody = upstreamPath === "chart/state" ? 64_000 : 8_000_000;
  const cl = req.headers.get("content-length");
  if (cl && /^\d+$/.test(cl) && parseInt(cl, 10) > maxBody) {
    return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  }
  const body = await req.text();
  if (body.length > maxBody) {
    return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  }

  try {
    const upstream = await fetch(`${GATEWAY}/api/brain/${upstreamPath}`, {
      method: "POST",
      headers: { "Content-Type": contentType, ...auth.headers },
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

// PATCH = rename a thread. Target is `threads/<id>` ONLY and it is session-required — it is
// NOT in GUEST_OK, so an anonymous caller gets a proxy-side 401 and the gateway is never
// contacted. The body carries just the new title, so the cap is tight (4KB).
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const rl = rateLimit(req, { name: "brain", max: 60 });
  if (!rl.ok) return tooMany(rl);

  const { path = [] } = await params;
  const upstreamPath = resolvePath("PATCH", path);
  if (!upstreamPath) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const auth = await authHeaders(req, upstreamPath);
  if ("error" in auth) return auth.error;

  // Rename payload is a tiny JSON `{ title }` — cap at 4KB. Reject on advertised
  // content-length first, then on the actual body length.
  const contentType = req.headers.get("content-type") || "application/json";
  const maxBody = 4_000;
  const cl = req.headers.get("content-length");
  if (cl && /^\d+$/.test(cl) && parseInt(cl, 10) > maxBody) {
    return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  }
  const body = await req.text();
  if (body.length > maxBody) {
    return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  }

  try {
    const upstream = await fetch(`${GATEWAY}/api/brain/${upstreamPath}`, {
      method: "PATCH",
      headers: { "Content-Type": contentType, ...auth.headers },
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

// DELETE = remove a thread. Target is `threads/<id>` ONLY and session-required (NOT in
// GUEST_OK → anonymous callers get a proxy-side 401, gateway never contacted). No body.
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const rl = rateLimit(req, { name: "brain", max: 60 });
  if (!rl.ok) return tooMany(rl);

  const { path = [] } = await params;
  const upstreamPath = resolvePath("DELETE", path);
  if (!upstreamPath) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const auth = await authHeaders(req, upstreamPath);
  if ("error" in auth) return auth.error;

  try {
    const upstream = await fetch(`${GATEWAY}/api/brain/${upstreamPath}`, {
      method: "DELETE",
      headers: auth.headers,
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
