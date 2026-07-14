import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { recordEvents, type AnalyticsEventInput } from "@/lib/analyticsEvents";
import { clientIp, rateLimit, tooMany } from "@/lib/rateLimit";
import { readVisitor, setVisitorCookie } from "@/lib/visitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Open batch write path for first-party, site-wide analytics. Unauthenticated by design —
// anonymous visitors are the audience being measured. The client (components/Tracker.tsx here,
// and the macro theme.js beacon on mastermind-x.com) posts {events:[…]} via navigator.sendBeacon;
// the server stamps identity (mm_aid visitor cookie, logged-in user_id, IP, UA) and inserts the
// batch. Geolocation is NOT done here — a scheduled job (scripts/geo_enrich.py) backfills ip_geo
// off the hot path so a beacon never blocks on an external lookup.

const MAX_BATCH = 40;
const MAX_BODY = 16_384; // bytes — a beacon payload is small even when batched

const TYPES = new Set([
  "pageview", "route", "ticker_view", "search", "terminal_jump",
  "click", "scroll", "session_start", "heartbeat", "exit",
]);

const clamp = (s: string, n: number) => (s.length <= n ? s : [...s].slice(0, n).join(""));
const str = (v: unknown, n: number): string | null => {
  const s = v == null ? "" : String(v);
  return s ? clamp(s, n) : null;
};
const intOrNull = (v: unknown, lo: number, hi: number): number | null => {
  if (v == null || v === "") return null;
  const x = Math.trunc(Number(v));
  return Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : null;
};

export async function POST(req: NextRequest) {
  const rl = rateLimit(req, { name: "collect", max: 240 });
  if (!rl.ok) return tooMany(rl);

  const len = Number(req.headers.get("content-length"));
  if (Number.isFinite(len) && len > MAX_BODY) return new NextResponse(null, { status: 413 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  const raw = Array.isArray(body?.events) ? body.events : Array.isArray(body) ? body : [body];
  if (!raw.length) return new NextResponse(null, { status: 204 });

  // Best-effort logged-in identity (guest dev runs a stub Supabase URL — never let it throw).
  let user_id: string | null = null;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    user_id = user?.id ?? null;
  } catch {}

  const { anonId, mint } = readVisitor(req);
  const ip = clamp(clientIp(req), 64);
  const ua = clamp(req.headers.get("user-agent") || "", 256) || null;

  const rows: AnalyticsEventInput[] = [];
  for (const e of raw.slice(0, MAX_BATCH)) {
    const type = str(e?.type, 32);
    if (!type || !TYPES.has(type)) continue;

    let meta: Record<string, unknown> | null = null;
    if (e?.meta && typeof e.meta === "object" && !Array.isArray(e.meta)) {
      try {
        if (JSON.stringify(e.meta).length <= 2000) meta = e.meta;
      } catch {}
    }

    let client_ts: string | null = null;
    const t = Number(e?.t);
    if (Number.isFinite(t) && t > 0 && t < 4_102_444_800_000) client_ts = new Date(t).toISOString();

    rows.push({
      type,
      site: str(e?.site, 16) || "terminal",
      path: str(e?.path, 512),
      ref: str(e?.ref, 512),
      ticker: e?.ticker ? clamp(String(e.ticker).toUpperCase(), 64) : null,
      dwell_ms: intOrNull(e?.dwell_ms, 0, 86_400_000),
      scroll: intOrNull(e?.scroll, 0, 100),
      fp: str(e?.fp, 64),
      session_id: str(e?.sid, 64),
      visitor_id: anonId,
      user_id,
      ip,
      ua,
      client_ts,
      meta,
    });
  }

  await recordEvents(rows);

  const res = new NextResponse(null, { status: 204, headers: { "cache-control": "no-store" } });
  if (mint) setVisitorCookie(res, anonId);
  return res;
}
