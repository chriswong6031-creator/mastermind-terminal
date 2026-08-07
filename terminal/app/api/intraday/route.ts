import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchIntraday, isIntradayTf, classify } from "@/lib/intradaySources";
import { isMacroSymbol } from "@/lib/macroSymbols";
import { withStoredHistory } from "@/lib/intradayStore";
import { filterBarsToSessionDate, type Bar6 } from "@/lib/intradayShared";
import { intradayFixture } from "@/lib/flowSource";
import { rateLimit, tooMany } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 15-min-delayed intraday OHLC for the chart. `fetchIntraday` returns the LIVE tail (Polygon for
// US/crypto incl. extended hours, Tencent for China/HK) — a short recent window. `withStoredHistory`
// (server-only; keeps node:fs out of the client-shared intradaySources) prepends the pre-stored deep
// history (public/data/intraday/<SYM>.<base>.json, Polygon 2021→now, 1h all US + 5m top-500).
// Bars: { t, tf, bars: [[epochSec, o, h, l, c, v], ...] } — same shape as /data/<SYM>.json.

type IntradayResponse = {
  t: string;
  tf: string;
  bars: Bar6[];
  source?: string;
  note?: string;
  error?: string;
  session_date?: string;
};
type Entry = { at: number; data: IntradayResponse };
const CACHE = new Map<string, Entry>();
const TTL = 45_000; // delayed data doesn't move faster than this; also bounds upstream call volume
const SESSION_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidSessionDate(date: string): boolean {
  if (!SESSION_DATE_RE.test(date)) return false;
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10) === date;
}

/**
 * Slice a cached deep-history response to one display-epoch session without mutating the
 * cache entry. The cache intentionally stays date-agnostic: one provider/store read can
 * serve the full chart and any single-session study during the same TTL.
 */
function responseForSession(data: IntradayResponse, date: string): IntradayResponse {
  if (!date) return data;
  const bars = Array.isArray(data.bars)
    ? filterBarsToSessionDate(data.bars as Bar6[], date)
    : [];
  return { ...data, bars, session_date: date };
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export async function GET(req: Request) {
  const rl = rateLimit(req, { name: "intraday" });
  if (!rl.ok) return tooMany(rl);
  const { searchParams } = new URL(req.url);
  const sym = (searchParams.get("sym") || "").trim();
  const tf = (searchParams.get("tf") || "").trim();
  const date = (searchParams.get("date") || "").trim();
  const ext = searchParams.get("ext") === "1"; // regular session by default; extended is explicit opt-in
  if (!sym || !isIntradayTf(tf) || (date && !isValidSessionDate(date))) {
    return NextResponse.json({ error: "bad params" }, { status: 400 });
  }

  // Dev fixture branch (FLOW_FIXTURE=1 only, never production): with no market-data key and an empty
  // history store the Surface pane paints its heat field over an empty price axis. intradayFixture
  // derives candles from the surface fixture's own spot_path — same synthetic price scale, same
  // ET-anchored epochs as the heat columns. Roots without a surface fixture return null and fall
  // through to the normal path unchanged. Placed ahead of the cache + the key-spending upstream
  // fetch so the fixture never warms (or reads) the shared cross-provider cache.
  if (process.env.FLOW_FIXTURE === "1") {
    const fx = await intradayFixture(sym, tf);
    if (fx?.length) {
      return NextResponse.json(responseForSession({ t: sym, tf, bars: fx, source: "fixture" }, date));
    }
  }

  // Resolve the provider basis (source + epoch convention) that WILL serve this symbol, and fold it
  // into the cache key. Today every provider emits the same market-local "display epoch"
  // (intradaySources.ts), but when a licensed UTC feed (DataBento) plugs in per-market, its bars are
  // basis:'utc' — a bare `sym|tf|ext` key would then serve a warm cross-provider / cross-basis entry
  // after an entitlement flip (databento-readiness audit, finding #6). Keying on source|basis makes
  // a provider cutover a cache MISS rather than a silent stale-bar hazard.
  // isMacroSymbol FIRST: a macro symbol falls through classify()'s "us" default, so a bare
  // classify() computed "polygon" for the ^/=F/=X symbols fetchIntraday actually serves from
  // Yahoo — the one thing this key exists to prevent. A cutover between those two providers
  // must be a cache MISS, and it only is if the key names the provider that will really serve.
  const market = classify(sym);
  const source = isMacroSymbol(sym)
    ? "yahoo-macro"
    : market === "ca" ? "none" : (market === "us" || market === "crypto") ? "polygon" : "tencent";
  const basis = "display"; // all current providers emit the display-epoch convention; UTC feeds bump this
  // serve a warm cache without re-auth (it's public market data); only a fresh upstream fetch is gated
  const ckey = `${sym}|${tf}|${ext ? 1 : 0}|${source}|${basis}`;
  const hit = CACHE.get(ckey);
  if (hit && Date.now() - hit.at < TTL) return NextResponse.json(responseForSession(hit.data, date));

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
  } catch (error: unknown) {
    liveErr = errorMessage(error, "fetch failed");
  }

  let bars: Bar6[];
  try {
    bars = await withStoredHistory(sym, tf, ext, live);
  } catch (error: unknown) {
    // store read failed entirely (unlikely; readStore swallows its own errors)
    if (hit) return NextResponse.json(responseForSession(hit.data, date));
    return NextResponse.json({ t: sym, tf, bars: [], error: errorMessage(error, "store error") });
  }

  if (bars.length === 0 && liveErr) {
    // nothing at all — propagate the live error; stale cache wins if present
    if (hit) return NextResponse.json(responseForSession(hit.data, date));
    return NextResponse.json({ t: sym, tf, bars: [], error: liveErr });
  }

  // bars available (store-backed or live); build response — include a note when live leg failed
  // so the client can label freshness without treating it as a hard error.
  const data: IntradayResponse = { t: sym, tf, bars };
  if (liveErr) data.note = "store-only: " + liveErr;
  CACHE.set(ckey, { at: Date.now(), data });
  return NextResponse.json(responseForSession(data, date), { headers: { "Cache-Control": "no-store" } });
}
