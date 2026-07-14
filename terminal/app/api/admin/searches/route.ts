import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminGate";
import { listSearchEvents, resolveUserEmails, searchStats } from "@/lib/searchEvents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Owner-only read path for the search-tracking plane. Non-admins get 404 (not 401/403):
// the route's existence is not advertised.

export async function GET(req: Request) {
  const { admin } = await isAdminRequest();
  if (!admin) return NextResponse.json({ error: "not found" }, { status: 404 });

  const sp = new URL(req.url).searchParams;
  const limit = Math.min(500, Math.max(1, parseInt(sp.get("limit") || "", 10) || 100));
  const before = parseInt(sp.get("before") || "", 10);
  const symbol = (sp.get("symbol") || "").trim().toUpperCase();
  const source = (sp.get("source") || "").trim();
  const visitor = (sp.get("visitor") || "").trim();

  const events = await listSearchEvents({
    limit,
    beforeId: Number.isFinite(before) ? before : undefined,
    symbol: symbol || undefined,
    source: source || undefined,
    visitor: visitor || undefined,
  });
  const nextBefore = events.length === limit ? events[events.length - 1].id : null;
  const userMap = await resolveUserEmails(events.map((e) => e.user_id).filter(Boolean) as string[]);
  const stats = sp.get("stats") === "1" ? await searchStats() : null;

  return NextResponse.json(
    { events, nextBefore, userMap, ...(stats ? { stats } : {}) },
    { headers: { "cache-control": "no-store" } },
  );
}
