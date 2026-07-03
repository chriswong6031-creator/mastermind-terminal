import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchIntraday, isIntradayTf } from "@/lib/intradaySources";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 15-min-delayed intraday OHLC for the chart. Proxies our paid Polygon key (US/crypto, incl.
// extended hours) and free Tencent klines (China/HK) server-side, so no key ever reaches the browser.
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
  // already bounds upstream call volume to ~1 fetch per symbol/tf/ext); re-gated with the rest of the
  // app via TERMINAL_REQUIRE_AUTH=1 — the same switch as the page gate.
  if (process.env.TERMINAL_REQUIRE_AUTH === "1") {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  try {
    const bars = await fetchIntraday(sym, tf, ext);
    const data = { t: sym, tf, bars };
    CACHE.set(ckey, { at: Date.now(), data });
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    if (hit) return NextResponse.json(hit.data); // serve stale on an upstream hiccup
    return NextResponse.json({ t: sym, tf, bars: [], error: e?.message || "fetch failed" });
  }
}
