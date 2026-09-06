import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createFixtureDb, fixtureFaults, fixtureUserId, FIXTURE_FAULT_COOKIE, FIXTURE_STORE_COOKIE } from "@/lib/watchlistsFixtureDb";
import {
  createPosition,
  deletePosition,
  readPositions,
  updatePosition,
  type PortfolioDb,
  type Position,
} from "@/lib/portfolio";
import { computePortfolioRisk, type ArtifactState, type PortfolioRisk } from "@/lib/portfolioRisk";

// Owner-scoped portfolio-position API (W5).
//
// Deliberately the SAME shape as `app/api/watchlist/route.ts`: one GET for the whole owner-scoped
// inventory, one POST switching on `action`, the fixture transport behind `TERMINAL_E2E_FIXTURE`,
// and RLS as the authority with an explicit `user_id` filter underneath it. The packet allowed
// either a route or direct server-client writes; the route is what the codebase already proves,
// and it is the only shape a client component can call without shipping a service-role key.
//
// `user_id` is NEVER read from the request body. It comes from the session on every path, so a
// caller cannot file, edit or delete a position in somebody else's book — and `updatePosition` /
// `deletePosition` re-resolve ownership before issuing any statement, so a foreign id is a 404
// rather than a write that RLS silently drops.
//
// TWO-ORGANISMS LAW (UWP-R2): nothing here feeds a signal, score, ranker or alert. These rows are
// the user's own record of what they hold, read back to them.

const isE2eFixture = () => process.env.TERMINAL_E2E_FIXTURE === "1";

/** Fixture transport for the Playwright dev server; the real RLS'd client everywhere else. The
 *  fixture key is the SAME cookie the watchlist route uses, so one spec's account-shaped world
 *  holds both tables and the watchlist/portfolio isolation invariants are actually testable. */
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
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  return { db: supabase as unknown as PortfolioDb, userId: user.id };
}

const unauthenticated = () => NextResponse.json({ error: "unauthenticated" }, { status: 401 });
const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

/**
 * Every position the signed-in user holds, open and closed, oldest first.
 *
 * FOUR facts, four responses — 401 signed out · 200 with zero positions · 200 with positions ·
 * 503 store unreadable. The last one used to be indistinguishable from the second: the read
 * collapsed a Supabase error into `[]` one layer down, so this route answered "you hold nothing"
 * for an outage. On a holdings surface that is the worst available lie.
 */
// ── Artifact fan-out (W B-F08-4) — additive `risk` field on GET only ──
//
// Anonymous by construction: no cookie, no Authorization, no user id, no ticker list in a query
// string. A `{locked:true}` envelope is therefore an EXPECTED state (the artifact endpoint is
// auth-gated), never an error — and a total outage here must never degrade the `positions`
// response, which is why every failure is caught locally rather than allowed to reject GET.
const STOCKDATA_BASE = process.env.STOCKDATA_BASE || "https://www.mastermind-x.com";
const ARTIFACT_FANOUT_CAP = 60;
const ARTIFACT_CONCURRENCY = 8;
const ARTIFACT_TIMEOUT_MS = 2500;

async function fetchArtifact(ticker: string): Promise<ArtifactState> {
  try {
    const url = `${STOCKDATA_BASE}/stockdata/${encodeURIComponent(ticker.toUpperCase())}.json`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(ARTIFACT_TIMEOUT_MS),
      next: { revalidate: 900 },
    } as RequestInit);
    if (res.status === 404) return { kind: "missing" };
    // The regwall answers an anonymous fan-out with a REAL HTTP 401 (measured live,
    // 2026-09-06: `x-regwall: deny` + a `{"locked":true,...}` body) — never a 200. `res.ok`
    // is therefore false for the locked case, so the locked check must run BEFORE the
    // `!res.ok` short-circuit and must recognize 401 itself, not only a body flag a 401
    // response happens to carry.
    const body = await res.json().catch(() => null);
    const bodyLocked = !!body && typeof body === "object" && (body as { locked?: unknown }).locked === true;
    if (res.status === 401 || res.headers.get("x-regwall") === "deny" || bodyLocked) {
      return { kind: "locked" };
    }
    if (!res.ok) return { kind: "unreadable" };
    if (!body || typeof body !== "object") return { kind: "unreadable" };
    const personality = (body as { personality?: { market_cap?: unknown } }).personality;
    const sector = typeof (body as { sector?: unknown }).sector === "string" ? (body as { sector: string }).sector : null;
    const marketCap = typeof personality?.market_cap === "number" && Number.isFinite(personality.market_cap)
      ? personality.market_cap : null;
    // Liquidity: NO field named `thinly_traded` (or any liquidity flag) exists on the macro
    // per-ticker artifact today (verified: zero hits for thinly_traded/thin_liquidity/
    // liquidity_flag/is_thin across scripts/, engine/, site/ on origin/main, and the
    // fixture stockdata sample carries no such key). Reading a fabricated field name would
    // silently pass review while never being true in production, so this stays an honest,
    // permanent null until a real macro artifact field exists to read — printed as the
    // `no_thickness` gap on every sized position (see portfolioRisk.ts), never hidden.
    const thinlyTraded: boolean | null = null;
    return { kind: "read", facts: { ticker, sector, marketCap, thinlyTraded } };
  } catch {
    return { kind: "unreadable" };
  }
}

async function fetchArtifactsFor(tickers: readonly string[]): Promise<Record<string, ArtifactState>> {
  const unique = [...new Set(tickers)];
  const attempted = unique.slice(0, ARTIFACT_FANOUT_CAP);
  const overflow = unique.slice(ARTIFACT_FANOUT_CAP);
  const out: Record<string, ArtifactState> = {};
  for (const t of overflow) out[t] = { kind: "not_attempted" };

  let i = 0;
  async function worker() {
    while (i < attempted.length) {
      const idx = i++;
      const ticker = attempted[idx];
      out[ticker] = await fetchArtifact(ticker);
    }
  }
  await Promise.all(Array.from({ length: Math.min(ARTIFACT_CONCURRENCY, attempted.length || 1) }, worker));
  return out;
}

async function buildRisk(positions: readonly Position[]): Promise<PortfolioRisk> {
  const open = positions.filter((p) => p.status === "open");
  const tickers = open.map((p) => p.ticker);
  let artifacts: Record<string, ArtifactState> = {};
  try {
    artifacts = await fetchArtifactsFor(tickers);
  } catch {
    artifacts = {};
  }
  return computePortfolioRisk(
    positions.map((p) => ({ ticker: p.ticker, shares: p.shares, entryPrice: p.entryPrice, status: p.status })),
    artifacts,
  );
}

export async function GET() {
  const session = await resolveDb();
  if (!session) return unauthenticated();
  const read = await readPositions(session.db, session.userId);
  if (!read.ok) {
    console.error("portfolio GET failed:", read.error);
    return fail("portfolio unavailable", 503);
  }
  const risk = await buildRisk(read.positions);
  return NextResponse.json({ positions: read.positions, risk });
}

export async function POST(req: Request) {
  const session = await resolveDb();
  if (!session) return unauthenticated();
  const { db, userId } = session;

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return fail("invalid JSON", 400);
  const action = body.action;

  if (action === "create") {
    const result = await createPosition(db, userId, {
      ticker: body.ticker,
      shares: body.shares,
      entryPrice: body.entryPrice,
      entryDate: body.entryDate,
      notes: body.notes,
      status: body.status,
    });
    if (!result.ok) return fail(result.error || "position create failed", result.status || 500);
    return NextResponse.json({ ok: true, position: result.position });
  }

  // Every remaining action names ONE position. A missing id is a 400 (the caller is broken); an id
  // that is not this user's is a 404 — never a fallback to "their first position", which is the
  // portfolio-side version of the first-list soloism W1b retired.
  const positionId = typeof body.id === "string" ? body.id.trim() : "";
  if (!positionId) return fail("id required", 400);

  if (action === "update" || action === "close" || action === "reopen") {
    // `close`/`reopen` are status-only patches with their own names because they are distinct user
    // intents, not a generic edit — and because a close must provably leave shares, entry price and
    // notes alone (gate D: closing a position never touches anything else, including the watchlist).
    const patch = action === "update"
      ? {
        ticker: body.ticker,
        shares: body.shares,
        entryPrice: body.entryPrice,
        entryDate: body.entryDate,
        notes: body.notes,
        status: body.status,
      }
      : { status: action === "close" ? "closed" : "open" };
    const result = await updatePosition(db, userId, positionId, patch);
    if (!result.ok) return fail(result.error || "position update failed", result.status || 500);
    return NextResponse.json({ ok: true, position: result.position });
  }

  if (action === "delete") {
    const result = await deletePosition(db, userId, positionId);
    if (!result.ok) return fail(result.error || "position delete failed", result.status || 500);
    return NextResponse.json({ ok: true, deletedId: result.deletedId });
  }

  return fail("unsupported action", 400);
}
