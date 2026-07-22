import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// Contract tests for the Brain-gateway catch-all proxy
// (app/api/brain/[...path]/route.ts).
//
// The proxy verifies the Supabase session and, when it has one, injects
// `Authorization: Bearer <token>` for the co-located gateway. As of the guest-lane
// change, `GET me` and `POST stream` no longer 401 without a session — they forward
// WITHOUT any Authorization header and let the GATEWAY decide (guest mode on → tier
// "guest"; off → the gateway 401s and we relay that). Every other allowlisted path
// (`threads`, `threads/<id>`, `chart/state`) stays a proxy-side session-required 401.
//
// LOCATION NOTE: this file lives in lib/__tests__/ — terminal/vitest.config.ts includes
// ONLY "lib/__tests__/**/*.test.ts", so a colocated app/api/.../route.test.ts would never
// be collected (same constraint documented in lib/__tests__/lwcAdapter.test.ts).
//
// We mock @/lib/supabase/server to control session presence, and replace global.fetch
// with a spy that records the outbound RequestInit so we can assert exactly which headers
// cross the boundary to the gateway. rateLimit + next/server's NextResponse run for real
// (pure; Node 22 has native Request/Response). Each test uses a DISTINCT client IP so the
// module-global per-IP rate-limit buckets never bleed across cases.
// ─────────────────────────────────────────────────────────────────────────────

// The gateway trusts device headers only when they carry this secret. The route captures
// PROXY_SECRET at MODULE LOAD, and the `import` below is hoisted above top-level statements
// — so a plain `process.env.X = ...` here would run too late. Set it inside vi.hoisted (which
// runs before the hoisted imports) so PROXY_SECRET is non-empty when the route is evaluated.
vi.hoisted(() => {
  process.env.BRAIN_PROXY_SECRET = "test-secret";
});

// Controllable session state for the mocked Supabase server client. Tests flip
// H.session between a real-ish session and null (anonymous).
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

// Imported AFTER the mock + env are in place.
import { GET, POST } from "@/app/api/brain/[...path]/route";

// A recorded outbound call to the gateway.
type Captured = { url: string; init: RequestInit; headers: Record<string, string> };

let calls: Captured[];
let realFetch: typeof globalThis.fetch;

/** Fake gateway: records the request and returns a benign 200 JSON body. */
function installFetchSpy() {
  realFetch = globalThis.fetch;
  calls = [];
  globalThis.fetch = vi.fn(async (url: any, init: any) => {
    const headers: Record<string, string> = {};
    // route always passes a plain object for headers
    for (const [k, v] of Object.entries((init?.headers ?? {}) as Record<string, string>)) {
      headers[k.toLowerCase()] = v;
    }
    calls.push({ url: String(url), init: init ?? {}, headers });
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof globalThis.fetch;
}

let ipCounter = 0;
/** Build a Request with a UNIQUE client IP (own rate-limit bucket), an mm_aid cookie,
 *  and optional extra headers (e.g. a client-supplied Authorization we must never forward). */
function req(
  method: "GET" | "POST",
  extra: Record<string, string> = {},
  body?: string,
): Request {
  ipCounter += 1;
  const ip = `203.0.113.${ipCounter}`;
  const headers: Record<string, string> = {
    "cf-connecting-ip": ip, // both clientIp() (rateLimit) and mmIp() read this
    cookie: "mm_aid=aid-123; other=x",
    ...extra,
  };
  return new Request("https://app.mastermind-x.com/api/brain", {
    method,
    headers,
    body,
  });
}

const params = (...path: string[]) => ({ params: Promise.resolve({ path }) });

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

// ── Anonymous GUEST_OK paths: forwarded WITHOUT Authorization, device headers present ──

describe("anonymous guest lane: GET me", () => {
  it("forwards to the gateway with NO Authorization header, device identity attached", async () => {
    anon();
    const res = await GET(req("GET"), params("me"));

    // Reached the gateway (not a proxy-side 401) and relayed its 200.
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://mastermind-x.com/api/brain/me");

    // The absolute rule: no Authorization on a guest request.
    expect("authorization" in calls[0].headers).toBe(false);

    // Device-identity headers still ride along for the per-device guest pool.
    expect(calls[0].headers["x-mm-aid"]).toBe("aid-123");
    expect(calls[0].headers["x-mm-ip"]).toBe("203.0.113.1");
    expect(calls[0].headers["x-mm-proxy-secret"]).toBe("test-secret");
  });
});

describe("anonymous guest lane: POST stream", () => {
  it("forwards the body to the gateway with NO Authorization, device identity attached", async () => {
    anon();
    const payload = JSON.stringify({ q: "hello brain" });
    const res = await POST(
      req("POST", { "content-type": "application/json" }, payload),
      params("stream"),
    );

    expect(res.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://mastermind-x.com/api/brain/stream");
    expect(calls[0].init.method).toBe("POST");
    expect(calls[0].init.body).toBe(payload);

    expect("authorization" in calls[0].headers).toBe(false);
    expect(calls[0].headers["x-mm-aid"]).toBe("aid-123");
    expect(calls[0].headers["x-mm-ip"]).toBe("203.0.113.2");
    expect(calls[0].headers["content-type"]).toBe("application/json");
  });

  it("still enforces the body cap for guests (413 before any gateway call)", async () => {
    anon();
    // stream cap is 8MB; advertise more via content-length → rejected pre-fetch.
    const res = await POST(
      req("POST", { "content-length": String(9_000_000) }, "x"),
      params("stream"),
    );
    expect(res.status).toBe(413);
    expect(calls).toHaveLength(0);
  });
});

// A client-supplied Authorization must NEVER be forwarded (guest path → none at all).
describe("client-supplied Authorization is never laundered", () => {
  it("anonymous stream drops a client Authorization header entirely", async () => {
    anon();
    const res = await POST(
      req("POST", {
        "content-type": "application/json",
        authorization: "Bearer client-forged-token",
      }, "{}"),
      params("stream"),
    );
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect("authorization" in calls[0].headers).toBe(false);
  });
});

// ── Anonymous authed-only paths: proxy 401s locally; the gateway is NEVER contacted ──

describe("anonymous authed-only paths → local 401, never forwarded", () => {
  it("GET threads → 401, no gateway call", async () => {
    anon();
    const res = await GET(req("GET"), params("threads"));
    expect(res.status).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it("GET threads/<id> → 401, no gateway call", async () => {
    anon();
    const res = await GET(req("GET"), params("threads", "t_42"));
    expect(res.status).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it("POST chart/state → 401, no gateway call", async () => {
    anon();
    const res = await POST(
      req("POST", { "content-type": "application/json" }, "{}"),
      params("chart", "state"),
    );
    expect(res.status).toBe(401);
    expect(calls).toHaveLength(0);
  });
});

// ── Signed-in path unchanged: Bearer injected on every allowlisted path ──

describe("signed-in path: Bearer injected (unchanged behavior)", () => {
  it("GET me forwards Authorization: Bearer <token> + device headers", async () => {
    signedIn("sess-token-abc");
    const res = await GET(req("GET"), params("me"));
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0].headers["authorization"]).toBe("Bearer sess-token-abc");
    expect(calls[0].headers["x-mm-aid"]).toBe("aid-123");
  });

  it("GET threads (authed-only) forwards Bearer for a signed-in user", async () => {
    signedIn("sess-token-xyz");
    const res = await GET(req("GET"), params("threads"));
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://mastermind-x.com/api/brain/threads");
    expect(calls[0].headers["authorization"]).toBe("Bearer sess-token-xyz");
  });

  it("POST stream forwards Bearer + body for a signed-in user, and NEVER a client-supplied one", async () => {
    signedIn("sess-token-777");
    const payload = JSON.stringify({ q: "hi" });
    const res = await POST(
      req("POST", {
        "content-type": "application/json",
        authorization: "Bearer client-forged-token",
      }, payload),
      params("stream"),
    );
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(1);
    // The proxy's own session Bearer, not the client's forged one.
    expect(calls[0].headers["authorization"]).toBe("Bearer sess-token-777");
    expect(calls[0].init.body).toBe(payload);
  });
});

// ── Unknown paths still 404 (allowlist unchanged) ──

describe("allowlist unchanged: unknown paths 404 before auth", () => {
  it("GET some/other → 404, no gateway call, regardless of session", async () => {
    anon();
    const res = await GET(req("GET"), params("some", "other"));
    expect(res.status).toBe(404);
    expect(calls).toHaveLength(0);
  });
});
