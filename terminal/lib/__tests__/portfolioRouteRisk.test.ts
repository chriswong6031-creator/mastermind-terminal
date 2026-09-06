// RED-first route tests (section 8) — written before the route edit, per packet procedure.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Force the fixture transport so GET/POST resolve without real Supabase.
process.env.TERMINAL_E2E_FIXTURE = "1";

vi.mock("@/lib/watchlistsFixtureDb", async () => {
  const actual = await vi.importActual<any>("@/lib/watchlistsFixtureDb");
  return actual;
});

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { GET } from "@/app/api/portfolio/route";
import {
  createFixtureDb,
  fixtureUserId,
  FIXTURE_STORE_COOKIE,
} from "@/lib/watchlistsFixtureDb";

vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));

function mockCookies(key: string) {
  const jar = new Map<string, { value: string }>();
  jar.set(FIXTURE_STORE_COOKIE, { value: key });
  return {
    get: (name: string) => jar.get(name),
  };
}

async function seedOpenPosition(key: string, ticker: string, shares: number, entryPrice: number) {
  const db = createFixtureDb(key, undefined);
  const userId = fixtureUserId(key);
  await db.from("portfolio_positions").insert({
    user_id: userId, ticker, shares, entry_price: entryPrice, status: "open",
  } as any);
}

describe("GET /api/portfolio — risk field (additive)", () => {
  const key = `risk-route-${Math.random().toString(36).slice(2)}`;

  beforeEach(async () => {
    const { cookies } = await import("next/headers");
    (cookies as any).mockResolvedValue(mockCookies(key));
    global.fetch = vi.fn(async (url: string) => {
      if (String(url).includes("LOCKED")) {
        // Observed live transport (2026-09-06): the regwall answers an anonymous fan-out with a
        // REAL 401 + `x-regwall: deny`, never a 200 — this must NOT be mocked as a soft 200.
        return new Response(
          JSON.stringify({ locked: true, reason: "authentication_required" }),
          { status: 401, headers: { "x-regwall": "deny" } },
        );
      }
      if (String(url).includes("MISSING")) {
        return new Response("not found", { status: 404 });
      }
      if (String(url).includes("TIMEOUT")) {
        throw new Error("aborted");
      }
      return new Response(JSON.stringify({ sector: "Energy", personality: { market_cap: 5e9 } }), { status: 200 });
    }) as any;
    await seedOpenPosition(key, "AAPL", 10, 100);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("1: keeps existing positions payload AND adds risk", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.positions)).toBe(true);
    expect(body.positions.length).toBeGreaterThan(0);
    expect(body.risk).toBeTruthy();
  });

  it("2: schema and weightBasis are pinned literals", async () => {
    const res = await GET();
    const body = await res.json();
    expect(body.risk.schema).toBe("portfolio_risk.v1");
    expect(body.risk.weightBasis).toBe("cost");
  });

  it("6: total artifact outage -> still 200, concentration populated, others typed-unread", async () => {
    global.fetch = vi.fn(async () => { throw new Error("network down"); }) as any;
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.risk.concentration).toBeTruthy();
    expect(body.risk.sectors.length).toBe(0);
  });

  it("4: unauthenticated -> 401 with no risk key", async () => {
    // Fixture accounts auto-provision on any key, so the ONLY genuine unauthenticated path is
    // the real (non-fixture) transport with no Supabase session. Flip the env off for exactly
    // this call and mock `createClient` to answer "no user" — a real RED-first assertion that
    // fails if the route ever stops gating on session presence.
    const prevFixture = process.env.TERMINAL_E2E_FIXTURE;
    delete process.env.TERMINAL_E2E_FIXTURE;
    const { createClient } = await import("@/lib/supabase/server");
    (createClient as any).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: null } }) },
    });
    try {
      const res = await GET();
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body).not.toHaveProperty("risk");
      expect(body).not.toHaveProperty("positions");
    } finally {
      if (prevFixture === undefined) delete process.env.TERMINAL_E2E_FIXTURE;
      else process.env.TERMINAL_E2E_FIXTURE = prevFixture;
    }
  });

  it("7: locked artifact (real 401 + x-regwall header) -> page_locked gap, not page_unreadable", async () => {
    await seedOpenPosition(key, "LOCKEDTICK", 5, 50);
    const res = await GET();
    const body = await res.json();
    const gap = body.risk.gaps.find((g: any) => g.ticker === "LOCKEDTICK");
    expect(gap).toBeTruthy();
    expect(gap.reason).toBe("page_locked");
  });

  it("8: artifact request carries no Cookie/Authorization/user id", async () => {
    const calls: any[] = [];
    global.fetch = vi.fn(async (url: string, init?: any) => {
      calls.push([url, init]);
      return new Response(JSON.stringify({ sector: "Energy" }), { status: 200 });
    }) as any;
    await GET();
    for (const [url, init] of calls) {
      expect(String(url)).not.toMatch(/cookie|authorization|user/i);
      // The route passes NO headers object at all on the artifact fan-out (verified against
      // route.ts's fetch call) — assert that directly so this fails the day a header is added,
      // rather than only re-checking an object that is vacuously empty either way.
      expect(init?.headers).toBeUndefined();
      const headers = init?.headers || {};
      expect(Object.keys(headers).map((h) => h.toLowerCase())).not.toContain("cookie");
      expect(Object.keys(headers).map((h) => h.toLowerCase())).not.toContain("authorization");
    }
  });
});
