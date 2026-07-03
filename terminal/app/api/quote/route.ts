import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchQuotes } from "@/lib/intradaySources";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Live top-of-book quotes for the panel header AND the watchlist.
//   ?sym=SYM      → { sym, quote }                (single — the detail/header pane)
//   ?syms=A,B,C   → { quotes: { SYM: quote|null } } (batch — the whole watchlist, ONE source)
//   China A-share + Hong Kong → free Tencent snapshot (real-time A-share; ~15-min-delayed HK).
//   US + crypto               → localhost Quote Hub (live crypto via Coinbase; delayed-15m US via
//                               Polygon). Hub/Tencent down/timeout → quote:null → manifest EOD.
// `quote.basis` (LIVE | DELAYED_15M | EOD) flows through transparently for the frontend badge.

type Entry = { at: number; quote: any };
const CACHE = new Map<string, Entry>(); // per-symbol, shared by the single + batch paths
const TTL = 5_000; // real-time snapshot cadence; also bounds upstream call volume per symbol
const MAX_BATCH = 200; // a watchlist is normally < 50; cap to bound one poll's upstream fan-out

// Split requested symbols into fresh cache hits vs misses (the misses are fetched in one batch).
function readCache(syms: string[]): { hits: Record<string, any>; miss: string[] } {
  const now = Date.now();
  const hits: Record<string, any> = {};
  const miss: string[] = [];
  for (const s of syms) {
    const c = CACHE.get(s);
    if (c && now - c.at < TTL) hits[s] = c.quote;
    else miss.push(s);
  }
  return { hits, miss };
}

// Fetch the cache misses in one batched upstream call and write them back (null included, so a
// symbol with no live leg is cached as a miss too and doesn't get re-fetched every poll).
async function fillMisses(miss: string[]): Promise<Record<string, any>> {
  if (!miss.length) return {};
  const fresh = await fetchQuotes(miss);
  const at = Date.now();
  const out: Record<string, any> = {};
  for (const s of miss) { const q = fresh[s] ?? null; CACHE.set(s, { at, quote: q }); out[s] = q; }
  return out;
}

// Same auth switch as the rest of the app (TERMINAL_REQUIRE_AUTH=1). Only runs when we have a cache
// miss, so a fully-warm poll never pays the auth round-trip (bounds cost while login is disabled).
async function gate(): Promise<NextResponse | null> {
  if (process.env.TERMINAL_REQUIRE_AUTH === "1") {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  return null;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symsParam = (searchParams.get("syms") || "").trim();
  const sym = (searchParams.get("sym") || "").trim();

  // ── batch: the live watchlist (one poll for the header + every row) ──
  if (symsParam) {
    const want = Array.from(new Set(symsParam.split(",").map((s) => s.trim()).filter(Boolean))).slice(0, MAX_BATCH);
    if (!want.length) return NextResponse.json({ quotes: {} });
    const { hits, miss } = readCache(want);
    if (miss.length) { const denied = await gate(); if (denied) return denied; }
    try {
      const filled = await fillMisses(miss);
      return NextResponse.json({ quotes: { ...hits, ...filled } }, { headers: { "Cache-Control": "no-store" } });
    } catch {
      return NextResponse.json({ quotes: hits }, { headers: { "Cache-Control": "no-store" } }); // serve what we have
    }
  }

  // ── single: the detail/header pane (unchanged {sym, quote} contract) ──
  if (!sym) return NextResponse.json({ error: "bad params" }, { status: 400 });
  const { hits, miss } = readCache([sym]);
  if (!miss.length) return NextResponse.json({ sym, quote: hits[sym] ?? null });
  const denied = await gate(); if (denied) return denied;
  try {
    const filled = await fillMisses([sym]);
    return NextResponse.json({ sym, quote: filled[sym] ?? null }, { headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    return NextResponse.json({ sym, quote: null, error: e?.message || "fetch failed" });
  }
}
