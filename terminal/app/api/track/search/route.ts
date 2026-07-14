import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { recordSearchEvent } from "@/lib/searchEvents";
import { clientIp, rateLimit, tooMany } from "@/lib/rateLimit";
import { readVisitor, setVisitorCookie } from "@/lib/visitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Open write path for committed ticker searches (see lib/searchTrack.ts for the client
// beacon contract). Unauthenticated by design — guests are the audience being measured;
// identity is best-effort (user id if logged in, else the mm_aid anon cookie, else IP).
// The mm_aid cookie is minted/read via lib/visitor so its (domain) attributes stay identical
// to /api/collect — a single visitor id shared across the mastermind-x.com family.

// Codepoint-safe truncation: a plain .slice() by UTF-16 unit can split an astral char (emoji)
// into a lone surrogate, which Postgres rejects on insert — silently dropping the event, the
// exact failure the length clamp exists to prevent.
const clamp = (s: string, n: number) => (s.length <= n ? s : [...s].slice(0, n).join(""));

export async function POST(req: NextRequest) {
  const rl = rateLimit(req, { name: "track", max: 120 });
  if (!rl.ok) return tooMany(rl);

  // Reject oversized bodies before buffering/parsing: the field clamps only apply post-parse.
  const len = Number(req.headers.get("content-length"));
  if (Number.isFinite(len) && len > 4096) return NextResponse.json({ ok: false }, { status: 413 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const symbol = clamp(String(body?.symbol ?? "").trim().toUpperCase(), 64);
  if (!symbol) return NextResponse.json({ ok: false }, { status: 400 });
  const source = clamp(String(body?.source || ""), 32);
  const query = body?.query != null ? clamp(String(body.query).trim(), 128) || null : null;

  // Never let auth failures block tracking (guest dev runs a stub Supabase URL).
  let user_id: string | null = null;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    user_id = user?.id ?? null;
  } catch {}

  // Clamp attacker-controlled fields to the DB check constraints (≤64) so a hostile
  // cookie/XFF can't make the insert fail and silently drop the event. readVisitor already
  // clamps the incoming cookie to 64 and mints a fresh uuid when absent.
  const { anonId: anon_id, mint } = readVisitor(req);

  await recordSearchEvent({
    symbol,
    query,
    source,
    user_id,
    anon_id,
    ip: clamp(clientIp(req), 64),
    ua: clamp(req.headers.get("user-agent") || "", 256) || null,
  });

  const res = NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  if (mint) setVisitorCookie(res, anon_id);
  return res;
}
