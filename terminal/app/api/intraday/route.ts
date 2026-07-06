import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchIntraday, isIntradayTf } from "@/lib/intradaySources";
import { withStoredHistory } from "@/lib/intradayStore";
import type { Bar6 } from "@/lib/intradayShared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 15-min-delayed intraday OHLC for the chart. `fetchIntraday` returns the LIVE tail (Polygon for
// US/crypto incl. extended hours, Tencent for China/HK) — a short recent window. `withStoredHistory`
// (server-only; keeps node:fs out of the client-shared intradaySources) prepends the pre-stored deep
// history (public/data/intraday/<SYM>.<base>.json, Polygon 2021→now, 1h all US + 5m top-500).
// Bars: { t, tf, bars: [[epochSec, o, h, l, c, v], ...] } — same shape as /data/<SYM>.json.

type Entry = { at: number; data: any };
const CACHE = new Map<string, Entry>();
const TTL = 45_000; // delayed data doesn't move faster than this; also bounds upstream call volume

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sym = (searchParams.get("sym") || "").trim();
  const tf = (searchParams.get("tf") || "").trim();
  const ext = searchParams.get("ext") !== "0"; // extended hours on by default (US only)
  if (!sym || !isIntradayTf(tf)) return NextResponse.json({ error: "bad params" }, { status: 400 });

  // serve a warm cache without re-auth (it's public market data); only a fresh upstream fetch is gated
  const ckey = `${sym}|${tf}|${ext ? 1 : 0}`;
  const hit = CACHE.get(ckey);
  if (hit && Date.now() - hit.at < TTL) return NextResponse.json(hit.data);

  // a fresh fetch spends our paid Polygon key. Open while login is disabled (the 45s cache above
  // already bounds upstream call volume); re-gated with the rest of the app via TERMINAL_REQUIRE_AUTH=1.
  if (process.env.TERMINAL_REQUIRE_AUTH === "1") {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  // Always consult the on-disk store even when the live leg fails (missing key, 429, network).
  // The store holds up to 20 000 bars (2021→now) so 4h/1h can serve fully from it with no key.
  let live: Bar6[] = [];
  let liveErr: string | undefined;
  try {
    live = await fetchIntraday(sym, tf, ext);
  } catch (e: any) {
    liveErr = e?.message || "fetch failed";
  }

  let bars: Bar6[];
  try {
    bars = await withStoredHistory(sym, tf, ext, live);
  } catch (e: any) {
    // store read failed entirely (unlikely; readStore swallows its own errors)
    if (hit) return NextResponse.json(hit.data);
    return NextResponse.json({ t: sym, tf, bars: [], error: e?.message || "store error" });
  }

  if (bars.length === 0 && liveErr) {
    // nothing at all — propagate the live error; stale cache wins if present
    if (hit) return NextResponse.json(hit.data);
    return NextResponse.json({ t: sym, tf, bars: [], error: liveErr });
  }

  // bars available (store-backed or live); build response — include a note when live leg failed
  // so the client can label freshness without treating it as a hard error.
  const data: Record<string, any> = { t: sym, tf, bars };
  if (liveErr) data.note = "store-only: " + liveErr;
  CACHE.set(ckey, { at: Date.now(), data });
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}
