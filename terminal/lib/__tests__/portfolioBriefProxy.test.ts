import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// Contract tests for the portfolio-brief proxy (app/api/portfolio-brief/route.ts).
//
// GET-only pass-through to the macro-api desk endpoint. With a valid Supabase session it
// injects Authorization: Bearer <token> and relays the upstream status + body VERBATIM
// (200 brief / 403 pro_required / 503). With NO session it 401s locally and never contacts
// the gateway (the panel treats 401 as "hidden"). The macro-api is the sole Pro authority,
// so this route does not gate on is_pro — it just relays.
//
// Same idiom as brainProxy.test.ts: mock @/lib/supabase/server for session presence,
// spy global.fetch to capture the outbound headers, distinct client IP per test so the
// module-global rate-limit buckets never bleed across cases.
// ─────────────────────────────────────────────────────────────────────────────

const H = vi.hoisted(() => {
  return {
    session: null as null | { access_token: string },
    user: null as null | { id: string },
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getSession: async () => ({ data: { session: H.session } }),
      getUser: async () => ({ data: { user: H.user } }),
    },
  }),
}));

import { GET } from "@/app/api/portfolio-brief/route";

type Captured = { url: string; init: RequestInit; headers: Record<string, string> };
let calls: Captured[];
let realFetch: typeof globalThis.fetch;

// Fake gateway: records the request and returns a configurable status + JSON body.
function installFetchSpy(status = 200, body: unknown = { schema: "portfolio_brief.v1" }) {
  realFetch = globalThis.fetch;
  calls = [];
  globalThis.fetch = vi.fn(async (url: any, init: any) => {
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries((init?.headers ?? {}) as Record<string, string>)) {
      headers[k.toLowerCase()] = v;
    }
    calls.push({ url: String(url), init: init ?? {}, headers });
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof globalThis.fetch;
}

let ipCounter = 0;
function req(extra: Record<string, string> = {}): Request {
  ipCounter += 1;
  const ip = `198.51.100.${ipCounter}`;
  return new Request("https://app.mastermind-x.com/api/portfolio-brief", {
    method: "GET",
    headers: { "cf-connecting-ip": ip, ...extra },
  });
}

function anon() {
  H.session = null;
  H.user = null;
}
function signedIn(token = "sess-token-abc") {
  H.session = { access_token: token };
  H.user = { id: "user-1" };
}

beforeEach(() => {
  installFetchSpy();
  anon();
});
afterEach(() => {
  globalThis.fetch = realFetch;
  vi.clearAllMocks();
});

describe("anonymous → local 401, gateway never contacted", () => {
  it("no session 401s without calling upstream", async () => {
    anon();
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(calls).toHaveLength(0);
  });
});

describe("signed-in → Bearer injected, upstream 200 relayed", () => {
  it("forwards Authorization: Bearer <token> to the desk endpoint and relays the brief", async () => {
    installFetchSpy(200, { schema: "portfolio_brief.v1", asof: "2026-07-23" });
    signedIn("sess-token-xyz");
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://mastermind-x.com/api/portfolio/brief");
    expect(calls[0].headers["authorization"]).toBe("Bearer sess-token-xyz");
    const body = await res.json();
    expect(body.schema).toBe("portfolio_brief.v1");
  });

  it("never forwards a client-supplied Authorization header — only the minted one", async () => {
    installFetchSpy(200, { schema: "portfolio_brief.v1" });
    signedIn("sess-token-real");
    const res = await GET(req({ authorization: "Bearer client-forged" }));
    expect(res.status).toBe(200);
    expect(calls[0].headers["authorization"]).toBe("Bearer sess-token-real");
  });
});

describe("status pass-through (macro-api is the Pro authority)", () => {
  it("relays a 403 pro_required verbatim (never gated locally)", async () => {
    installFetchSpy(403, { error: "pro_required", tier: "free" });
    signedIn();
    const res = await GET(req());
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toEqual({ error: "pro_required", tier: "free" });
  });

  it("relays a 503 artifact-unavailable verbatim", async () => {
    installFetchSpy(503, { error: "artifact_unavailable" });
    signedIn();
    const res = await GET(req());
    expect(res.status).toBe(503);
  });
});

describe("gateway unreachable → local 503 (book below is never blocked)", () => {
  it("a fetch throw becomes a 503, not a crash", async () => {
    realFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof globalThis.fetch;
    signedIn();
    const res = await GET(req());
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe("gateway_unreachable");
  });
});

describe("per-user cache: a second call within TTL is served from cache", () => {
  it("only the first signed-in call hits the gateway", async () => {
    installFetchSpy(200, { schema: "portfolio_brief.v1", asof: "2026-07-23" });
    signedIn("sess-cache-token");
    const r1 = await GET(req());
    const r2 = await GET(req());
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    // Second response is a cache hit — the gateway was contacted exactly once.
    expect(calls).toHaveLength(1);
    expect(r2.headers.get("x-brief-cache")).toBe("hit");
  });
});
