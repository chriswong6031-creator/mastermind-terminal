import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Extended/overnight prints for the watchlist Ext column + pane-card ☾ block.
//
// ARCHITECTURE RULING (Phase 8 merge gate): the QUOTE HUB owns all extended-hours
// data — one server-side singleton (Alpaca leg when keys present, keyless grey
// fallback otherwise) multiplexed across every user, with a shared LRU
// subscription budget. This route is a THIN PROXY over the hub's /quotes ext
// fields; it must never fetch upstream sources itself (an earlier draft polled
// Yahoo directly from this route — that forked the source of truth and bypassed
// the hub's LRU/session logic).
//
// Response shape (UI contract): { quotes: { SYM: { extPrice, extChg, extTs } | null } }

const HUB_PORT = process.env.HUB_PORT ?? "3100";
const MAX_SYMS = 100;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const syms = (searchParams.get("syms") || "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, MAX_SYMS);
  if (syms.length === 0) return NextResponse.json({ quotes: {} });

  const out: Record<string, { extPrice: number; extChg: number; extTs: number } | null> = {};
  for (const s of syms) out[s] = null;

  try {
    const r = await fetch(
      `http://127.0.0.1:${HUB_PORT}/quotes?syms=${encodeURIComponent(syms.join(","))}`,
      { cache: "no-store", signal: AbortSignal.timeout(1500) },
    );
    if (r.ok) {
      const j: any = await r.json();
      for (const s of syms) {
        const q = j?.[s];
        if (q && typeof q.extPrice === "number" && typeof q.extChg === "number") {
          out[s] = { extPrice: q.extPrice, extChg: q.extChg, extTs: q.extTs ?? q.ts ?? 0 };
        }
      }
    }
  } catch {
    // hub down/timeout → all-null (UI shows dashes; never a fake value)
  }
  return NextResponse.json({ quotes: out });
}
