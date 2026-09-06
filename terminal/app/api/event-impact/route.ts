import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import {
  createFixtureDb,
  fixtureFaults,
  fixtureUserId,
  FIXTURE_FAULT_COOKIE,
  FIXTURE_STORE_COOKIE,
} from "@/lib/watchlistsFixtureDb";
import { readPositions, type PortfolioDb } from "@/lib/portfolio";
import { rateLimit, tooMany } from "@/lib/rateLimit";
import { joinEventImpact, type TouchedPosition } from "@/lib/eventImpact";

// Additive, GET-only, read-only route (B-F08-5, MO-PAID-028 / MO-DELTA-042). Joins the caller's
// OPEN holdings against the macro nightly's per-ticker event artifact and carries
// direction/mechanism/timeframe verbatim, printing "not stated" rather than inventing them (A7).
//
// `MACRO_DATA_BASE` lives here rather than in `lib/upstreams.ts` only because upstreams.ts is
// outside this packet's owned paths — fold it in as a follow-up.
const MACRO_DATA_BASE = process.env.MACRO_DATA_BASE || "https://www.mastermind-x.com";
const CTX_URL = `${MACRO_DATA_BASE}/data/portfolio_ctx.json`;
const TTL_MS = 900_000; // the artifact is a once-a-night bake
const FETCH_TIMEOUT_MS = 4_000;

export const runtime = "nodejs";

const isE2eFixture = () => process.env.TERMINAL_E2E_FIXTURE === "1";

// Duplicated from app/api/portfolio/route.ts:34-47 rather than imported — that file is not in
// this packet's owned paths, so its `resolveDb` shape is copied verbatim instead of refactored.
async function resolveDb(): Promise<{ db: PortfolioDb; userId: string } | null> {
  if (isE2eFixture()) {
    const jar = await cookies();
    const key = jar.get(FIXTURE_STORE_COOKIE)?.value || "default";
    return {
      db: createFixtureDb(key, fixtureFaults(jar.get(FIXTURE_FAULT_COOKIE)?.value)),
      userId: fixtureUserId(key),
    };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return { db: supabase as unknown as PortfolioDb, userId: user.id };
}

type CacheEntry = { data: unknown; ts: number };
let CTX_CACHE: CacheEntry | null = null;

async function fetchCtx(): Promise<{ data: unknown | null; error?: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(CTX_URL, {
      signal: ctrl.signal,
      headers: { "User-Agent": "mastermind-terminal/1.0" },
      cache: "no-store",
    });
    if (!res.ok) return { data: null, error: `HTTP ${res.status}` };
    try {
      return { data: await res.json() };
    } catch {
      return { data: null, error: "unparseable" };
    }
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return { data: null, error: aborted ? "timeout" : "unparseable" };
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(req: Request): Promise<Response> {
  const rl = rateLimit(req, { name: "event-impact" });
  if (!rl.ok) return tooMany(rl);

  const session = await resolveDb();
  if (!session) {
    return NextResponse.json({ state: "unauthenticated" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  const read = await readPositions(session.db, session.userId);
  const positions: readonly TouchedPosition[] | null = read.ok
    ? read.positions.map((p) => ({ id: p.id, ticker: p.ticker, shares: p.shares, status: p.status }))
    : null;

  const now = Date.now();
  let ctx: unknown | null = null;
  let ctxError: string | undefined;
  let stale = false;

  if (CTX_CACHE && now - CTX_CACHE.ts < TTL_MS) {
    ctx = CTX_CACHE.data;
  } else {
    const fetched = await fetchCtx();
    if (fetched.data !== null) {
      ctx = fetched.data;
      CTX_CACHE = { data: fetched.data, ts: now };
    } else if (CTX_CACHE) {
      // Upstream hiccup with a cached copy on hand: serve it, flagged stale — never served silently as fresh.
      ctx = CTX_CACHE.data;
      stale = true;
    } else {
      ctxError = fetched.error;
    }
  }

  const body = joinEventImpact({ positions, ctx, ctxError });
  const status = body.state === "holdings_unreadable" || body.state === "calendar_unreadable" ? 503 : 200;
  const payload = stale ? { ...body, stale: true } : body;
  return NextResponse.json(payload, { status, headers: { "Cache-Control": "no-store" } });
}
