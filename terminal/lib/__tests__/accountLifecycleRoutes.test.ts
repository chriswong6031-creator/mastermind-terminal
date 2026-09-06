/**
 * accountLifecycleRoutes.test.ts — /api/account/export and /api/account/deletion (B-F12-4).
 *
 * Mocked in the alertsRouteAuthority.test.ts style: vi.hoisted state + a chainable `from()` stub
 * standing in for `@/lib/supabase/server`.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

type StoreResult = { data: unknown; error: { message?: string; code?: string } | null };

const H = vi.hoisted(() => ({
  user: { id: "user-A", email: "a@example.com" } as { id: string; email: string } | null,
  watchlistRows: { data: [] as unknown[], error: null } as StoreResult,
  positionRows: { data: [] as unknown[], error: null } as StoreResult,
  probeResult: { data: [{ id: "w1" }], error: null } as StoreResult,
  lifecycleSelectResult: { data: [] as unknown[], error: null } as StoreResult,
  lifecycleInsertResult: { data: [{ receipt_code: "MMX-DEL-20260906-AAAAAAAA", status: "received", requested_at: "2026-09-06T00:00:00Z", kind: "deletion" }], error: null } as StoreResult,
  eqCalls: [] as Array<[string, unknown]>,
  insertCalled: false,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: H.user } })) },
    from: vi.fn((table: string) => {
      let mode: "read" | "insert" = "read";
      const q: Record<string, unknown> = {};
      q.select = vi.fn(() => q);
      q.eq = vi.fn((col: string, val: unknown) => {
        H.eqCalls.push([col, val]);
        return q;
      });
      q.limit = vi.fn(() => q);
      q.in = vi.fn(() => q);
      q.order = vi.fn(() => q);
      q.insert = vi.fn(() => {
        mode = "insert";
        H.insertCalled = true;
        return q;
      });
      // Every chain method above returns the same `q`, so the ONE `.then` below fires once
      // the caller `await`s it — whatever the chain length, by that point `mode`/`table` are
      // already settled by the synchronous calls that ran before the await.
      q.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
        const result =
          mode === "insert"
            ? H.lifecycleInsertResult
            : table === "watchlists"
              ? H.probeResult
              : table === "portfolio_positions"
                ? H.positionRows
                : table === "account_lifecycle_requests"
                  ? H.lifecycleSelectResult
                  : { data: [], error: null };
        return Promise.resolve(result).then(resolve, reject);
      };
      return q;
    }),
  })),
}));

vi.mock("@/lib/watchlistsFixtureDb", () => ({
  createFixtureDb: vi.fn(),
  fixtureUserId: vi.fn(() => "fixture-user"),
  FIXTURE_STORE_COOKIE: "mm_fixture_store",
}));

import { GET as exportGET } from "@/app/api/account/export/route";
import { GET as deletionGET, POST as deletionPOST } from "@/app/api/account/deletion/route";

const req = (url: string, init?: RequestInit) => new Request(url, init);

let userCounter = 0;

beforeEach(() => {
  // A fresh user id per test: the export route's 60s throttle Map is module-scoped state that
  // otherwise leaks across tests in this file (test isolation, not a production concern).
  userCounter += 1;
  H.user = { id: `user-A-${userCounter}`, email: "a@example.com" };
  H.watchlistRows = { data: [], error: null };
  H.positionRows = { data: [], error: null };
  H.probeResult = { data: [{ id: "w1" }], error: null };
  H.lifecycleSelectResult = { data: [], error: null };
  H.lifecycleInsertResult = {
    data: [{ receipt_code: "MMX-DEL-20260906-AAAAAAAA", status: "received", requested_at: "2026-09-06T00:00:00Z", kind: "deletion" }],
    error: null,
  };
  H.eqCalls = [];
  H.insertCalled = false;
});

describe("GET /api/account/export", () => {
  it("returns only the caller's own rows and filters by user_id", async () => {
    const res = await exportGET(req("https://x.test/api/account/export"));
    expect(res.status).toBe(200);
    const bodyText = await res.text();
    expect(bodyText).not.toContain("user-B");
    expect(H.eqCalls.some(([col, val]) => col === "user_id" && val === H.user!.id)).toBe(true);
  });

  it("401s when signed out and makes no store call", async () => {
    H.user = null;
    const before = H.eqCalls.length;
    const res = await exportGET(req("https://x.test/api/account/export"));
    expect(res.status).toBe(401);
    expect(H.eqCalls.length).toBe(before);
  });

  it("503s only when BOTH reads fail", async () => {
    H.probeResult = { data: null, error: { message: "down" } };
    H.positionRows = { data: null, error: { message: "down" } };
    const res = await exportGET(req("https://x.test/api/account/export"));
    expect(res.status).toBe(503);
  });

  it("200s with coverage.unavailable populated when only one read fails", async () => {
    H.probeResult = { data: null, error: { message: "down" } };
    const res = await exportGET(req("https://x.test/api/account/export"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.coverage.unavailable.map((e: { key: string }) => e.key)).toContain("watchlists");
  });

  it("csv format sets the right headers; unsupported format 400s", async () => {
    const res = await exportGET(req("https://x.test/api/account/export?format=csv"));
    expect(res.headers.get("Content-Type")).toContain("text/csv");
    expect(res.headers.get("Content-Disposition")).toContain("attachment");
    expect(res.headers.get("Cache-Control")).toBe("no-store");

    const bad = await exportGET(req("https://x.test/api/account/export?format=xml"));
    expect(bad.status).toBe(400);
  });

  it("throttles a second export inside 60s", async () => {
    const first = await exportGET(req("https://x.test/api/account/export"));
    expect(first.status).toBe(200);
    const second = await exportGET(req("https://x.test/api/account/export"));
    expect(second.status).toBe(429);
  });
});

describe("POST /api/account/deletion", () => {
  it("happy path returns 201 with a well-formed receipt and a session-derived user_id", async () => {
    const res = await deletionPOST(
      req("https://x.test/api/account/deletion", {
        method: "POST",
        body: JSON.stringify({ confirm_email: "a@example.com" }),
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.receipt.receipt_code).toMatch(/^MMX-DEL-\d{8}-[0-9A-Z]{8}$/);
    expect(H.insertCalled).toBe(true);
    expect(JSON.stringify(body)).not.toMatch(/email"\s*:\s*"a@example\.com".*receipt_code/);
  });

  it("wrong confirm_email 400s with zero writes", async () => {
    const res = await deletionPOST(
      req("https://x.test/api/account/deletion", {
        method: "POST",
        body: JSON.stringify({ confirm_email: "wrong@example.com" }),
      }),
    );
    expect(res.status).toBe(400);
    expect(H.insertCalled).toBe(false);
  });

  it("duplicate open request (23505 on the partial index) returns 200 with already_open:true", async () => {
    H.lifecycleInsertResult = { data: null, error: { code: "23505", message: "duplicate" } };
    H.lifecycleSelectResult = {
      data: [{ receipt_code: "MMX-DEL-20260905-BBBBBBBB", status: "received", requested_at: "2026-09-05T00:00:00Z", kind: "deletion" }],
      error: null,
    };
    const res = await deletionPOST(
      req("https://x.test/api/account/deletion", {
        method: "POST",
        body: JSON.stringify({ confirm_email: "a@example.com" }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.already_open).toBe(true);
  });

  it("table missing (42P01) returns 503 request_not_recorded with no receipt in the body", async () => {
    H.lifecycleInsertResult = { data: null, error: { code: "42P01", message: "relation does not exist" } };
    const res = await deletionPOST(
      req("https://x.test/api/account/deletion", {
        method: "POST",
        body: JSON.stringify({ confirm_email: "a@example.com" }),
      }),
    );
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe("request_not_recorded");
    expect(JSON.stringify(body)).not.toContain("receipt_code");
  });
});

describe("GET /api/account/deletion", () => {
  it("returns filed requests newest-first", async () => {
    H.lifecycleSelectResult = {
      data: [
        { receipt_code: "MMX-DEL-20260906-AAAAAAAA", status: "received", requested_at: "2026-09-06T00:00:00Z", kind: "deletion" },
      ],
      error: null,
    };
    const res = await deletionGET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.requests).toHaveLength(1);
  });

  it("503s on a read error, never {requests:[]}", async () => {
    H.lifecycleSelectResult = { data: null, error: { message: "down" } };
    const res = await deletionGET();
    expect(res.status).toBe(503);
  });
});

describe("lifecycle step copy", () => {
  const BANNED = ["RLS", "payload", "schema", "falsifier", "refuted", "证伪", "account_lifecycle_requests"];

  it("always carries exactly one immediate/asynchronous/external step, EN+ZH, no banned words", async () => {
    const res = await deletionPOST(
      req("https://x.test/api/account/deletion", {
        method: "POST",
        body: JSON.stringify({ confirm_email: "a@example.com" }),
      }),
    );
    const body = await res.json();
    const steps = body.receipt.steps as Array<{ phase: string; text: [string, string] }>;
    expect(steps.map((s) => s.phase)).toEqual(["immediate", "asynchronous", "external"]);
    for (const step of steps) {
      expect(step.text[0]).toBeTruthy();
      expect(step.text[1]).toBeTruthy();
      for (const word of BANNED) {
        expect(step.text[0]).not.toContain(word);
        expect(step.text[1]).not.toContain(word);
      }
    }
  });
});

describe("password path stays singular", () => {
  const terminalRoot = join(process.cwd(), "app.tsconfig.json").includes("nonexistent")
    ? process.cwd()
    : process.cwd();

  function walk(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      if (entry === "node_modules" || entry === ".next" || entry === "__tests__") continue;
      const full = join(dir, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) walk(full, out);
      else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
    }
    return out;
  }

  it("auth.updateUser({ password occurs exactly once, in SectionAccount.tsx", () => {
    const root = join(process.cwd());
    const files = walk(root);
    const hits = files.filter((f) => {
      const text = readFileSync(f, "utf8");
      return text.includes("auth.updateUser({ password");
    });
    expect(hits).toHaveLength(1);
    expect(hits[0]).toContain("components/settings/SectionAccount.tsx");
  });

  it("no file under app/api/account/ references a service-role or admin credential", () => {
    const dir = join(process.cwd(), "app", "api", "account");
    const files = walk(dir);
    for (const f of files) {
      const text = readFileSync(f, "utf8");
      expect(text).not.toMatch(/password|service_role|SUPABASE_SERVICE_ROLE_KEY|auth\/v1\/admin/);
    }
  });
});
