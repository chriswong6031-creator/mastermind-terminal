import { NextResponse } from "next/server";

// Extended / overnight quote endpoint (Phase 8, item 27).
// Returns the most recent extended-hours print for US equities, keyed by symbol.
// Shape: { quotes: { SYM: { extPrice, extChg, extTs } | null } }
//   extPrice — last ext print (number)
//   extChg   — % vs previous close (number)
//   extTs    — epoch seconds of the print (number)
//
// Source priority:
//   1. Alpaca streaming WS (server-side singleton, ≤30 dynamic subs) if ALPACA_API_KEY set.
//   2. Yahoo Finance grey endpoint — keyless, best-effort, may be blocked without notice.
//      We document its use honestly; no branded label.
//   3. Graceful no-op: returns null for all requested symbols (callers show "—").
//
// This route is separate from /api/quote so it never touches the sibling Quote Hub
// lane's surface (pass8-hub owns the /api/quote route and hub/ singleton).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ExtEntry = { extPrice: number; extChg: number; extTs: number };
type CacheEntry = { at: number; data: ExtEntry | null };

const CACHE = new Map<string, CacheEntry>();
const TTL = 20_000; // 20 s — ext prints move slowly

function readCache(syms: string[]): { hits: Record<string, ExtEntry | null>; miss: string[] } {
  const now = Date.now();
  const hits: Record<string, ExtEntry | null> = {};
  const miss: string[] = [];
  for (const s of syms) {
    const c = CACHE.get(s);
    if (c && now - c.at < TTL) hits[s] = c.data;
    else miss.push(s);
  }
  return { hits, miss };
}

function writeCache(sym: string, data: ExtEntry | null) {
  CACHE.set(sym, { at: Date.now(), data });
}

// ── Yahoo Finance grey fallback ────────────────────────────────────────────
// Uses the unofficial v7 crumb-free quoteType=… endpoint.
// Returns extPrice / extChg / extTs when Yahoo provides preMarketPrice or
// postMarketPrice fields. Graceful empty map on any error.
async function fetchYahooExt(syms: string[]): Promise<Record<string, ExtEntry | null>> {
  if (!syms.length) return {};
  try {
    const url =
      "https://query1.finance.yahoo.com/v7/finance/quote?symbols=" +
      encodeURIComponent(syms.join(",")) +
      "&fields=preMarketPrice,preMarketChange,preMarketTime,postMarketPrice,postMarketChange,postMarketTime,regularMarketPrice&corsDomain=finance.yahoo.com";
    const r = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        Accept: "application/json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    if (!r.ok) return {};
    const j: any = await r.json();
    const results: any[] = j?.quoteResponse?.result ?? [];
    const out: Record<string, ExtEntry | null> = {};
    for (const row of results) {
      const sym = (row.symbol as string | undefined)?.toUpperCase();
      if (!sym) continue;
      // Prefer pre-market when available (before open); otherwise post-market
      const preTs = row.preMarketTime as number | undefined;
      const postTs = row.postMarketTime as number | undefined;
      const nowSec = Math.floor(Date.now() / 1000);
      // Use the more-recent print (whichever has a timestamp within the last 12 h)
      const cutoff = nowSec - 12 * 3600;
      const preOk = preTs != null && preTs > cutoff && row.preMarketPrice != null;
      const postOk = postTs != null && postTs > cutoff && row.postMarketPrice != null;
      if (!preOk && !postOk) { out[sym] = null; continue; }
      const usePre = preOk && (!postOk || (preTs ?? 0) > (postTs ?? 0));
      const extPrice: number = usePre ? row.preMarketPrice : row.postMarketPrice;
      const extTs: number = usePre ? preTs! : postTs!;
      const regPx: number | undefined = row.regularMarketPrice;
      const extChg: number =
        regPx != null && regPx !== 0
          ? ((extPrice - regPx) / regPx) * 100
          : 0;
      out[sym] = { extPrice, extChg, extTs };
    }
    return out;
  } catch {
    return {};
  }
}

// ── Alpaca WS singleton ────────────────────────────────────────────────────
// Populated by a separate WS manager (pass8-hub lane owns the full singleton).
// Here we read from a module-level store that the hub can populate if it
// ever runs in the same Node process. For now this is a no-op stub.
const _alpacaStore: Record<string, ExtEntry> = {};

async function fetchAlpacaExt(syms: string[]): Promise<Record<string, ExtEntry | null>> {
  // Real Alpaca WS singleton lives in pass8-hub. Read the shared store if populated.
  if (!process.env.ALPACA_API_KEY) return {};
  const out: Record<string, ExtEntry | null> = {};
  for (const s of syms) out[s] = _alpacaStore[s] ?? null;
  return out;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symsParam = (searchParams.get("syms") || "").trim();
  if (!symsParam) return NextResponse.json({ quotes: {} });

  const want = Array.from(
    new Set(symsParam.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean))
  ).slice(0, 100);

  const { hits, miss } = readCache(want);
  if (!miss.length) return NextResponse.json({ quotes: hits }, { headers: { "Cache-Control": "no-store" } });

  // Try Alpaca first (if keyed), then Yahoo grey
  let fresh: Record<string, ExtEntry | null> = {};
  const alpaca = await fetchAlpacaExt(miss);
  const alpacaHit = miss.filter((s) => alpaca[s] != null);
  const alpacaMiss = miss.filter((s) => alpaca[s] == null);
  Object.assign(fresh, alpaca);
  if (alpacaMiss.length) {
    const yahoo = await fetchYahooExt(alpacaMiss);
    Object.assign(fresh, yahoo);
  }

  for (const s of miss) {
    const d = fresh[s] ?? null;
    writeCache(s, d);
    hits[s] = d;
  }

  // Mark any still-missing symbols as null in the cache so they don't re-hit every poll
  for (const s of miss) {
    if (!(s in hits)) { writeCache(s, null); hits[s] = null; }
  }

  return NextResponse.json({ quotes: hits }, { headers: { "Cache-Control": "no-store" } });
}
