import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LayoutDbResult, LayoutQuery, LayoutRow } from "@/lib/layouts";

// HTTP contract for /api/layouts. The point of these assertions is that the four facts the old
// route flattened into `200 {layouts:[]}` / `{ok:true}` now leave the server as four different
// answers: 401 (sign in), 503 (the store is down), 409 (that name is taken), 404 (nothing deleted).

const H = vi.hoisted(() => ({
  user: null as { id: string } | null,
  results: [] as LayoutDbResult[],
}));

vi.mock("next/headers", () => ({ cookies: vi.fn(async () => ({ get: () => undefined })) }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: H.user } })) },
    from: vi.fn(() => {
      let index = 0;
      const next = (): LayoutDbResult => H.results[index++] ?? { data: [] };
      const q = {
        select: () => q,
        eq: () => q,
        order: () => q,
        insert: () => q,
        update: () => q,
        upsert: () => q,
        delete: () => q,
        maybeSingle: async () => { const r = next(); return r.error ? r : { data: (r.data as LayoutRow[] | undefined)?.[0] ?? null }; },
        then: (resolve: (v: LayoutDbResult) => unknown) => Promise.resolve(next()).then(resolve),
      } as unknown as LayoutQuery;
      return q;
    }),
  })),
}));

import { DELETE, GET, POST } from "@/app/api/layouts/route";

const OUTAGE: LayoutDbResult = { error: { code: "XX000", message: "connection reset" } };

const post = (body: Record<string, unknown>) => POST(new Request("https://x.test/api/layouts", {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
}));
const del = (id?: string) => DELETE(new Request(`https://x.test/api/layouts${id ? `?id=${id}` : ""}`, { method: "DELETE" }));

beforeEach(() => { H.user = { id: "user-1" }; H.results = []; vi.clearAllMocks(); });

describe("GET /api/layouts", () => {
  it("refuses a guest with 401 rather than an empty library", async () => {
    H.user = null;
    const r = await GET();
    expect(r.status).toBe(401);
    await expect(r.json()).resolves.toEqual({ error: "unauthenticated" });
  });

  it("reports a store failure as 503, not 200 []", async () => {
    H.results = [OUTAGE];
    const r = await GET();
    expect(r.status).toBe(503);
    await expect(r.json()).resolves.toEqual({ error: "layouts_unavailable" });
  });

  it("returns an authoritative empty list as 200", async () => {
    H.results = [{ data: [] }];
    const r = await GET();
    expect(r.status).toBe(200);
    await expect(r.json()).resolves.toEqual({ layouts: [] });
  });
});

describe("POST /api/layouts", () => {
  it("401s a guest", async () => {
    H.user = null;
    expect((await post({ name: "Swing", config: {} })).status).toBe(401);
  });

  it("400s an unusable name", async () => {
    const r = await post({ name: "  ", config: {} });
    expect(r.status).toBe(400);
    await expect(r.json()).resolves.toEqual({ error: "invalid_name" });
  });

  it("400s a body that is not JSON", async () => {
    const r = await POST(new Request("https://x.test/api/layouts", { method: "POST", body: "not json" }));
    expect(r.status).toBe(400);
  });

  it("503s a failed write instead of claiming ok", async () => {
    H.results = [OUTAGE];
    const r = await post({ name: "Swing", config: {} });
    expect(r.status).toBe(503);
    await expect(r.json()).resolves.toEqual({ error: "layouts_unavailable" });
  });

  it("409s a create onto a taken name so auto-naming can step past it", async () => {
    H.results = [{ data: [{ id: "existing" }] }];
    const r = await post({ name: "Layout 3", config: {}, mode: "create" });
    expect(r.status).toBe(409);
    await expect(r.json()).resolves.toEqual({ error: "name_taken" });
  });

  it("200s a real write", async () => {
    H.results = [{ data: [{ id: "L1" }] }];
    const r = await post({ name: "Swing", config: {} });
    expect(r.status).toBe(200);
    await expect(r.json()).resolves.toEqual({ ok: true, id: "L1" });
  });
});

describe("DELETE /api/layouts", () => {
  it("401s a guest", async () => {
    H.user = null;
    expect((await del("L1")).status).toBe(401);
  });

  it("503s a failed delete instead of claiming ok", async () => {
    H.results = [OUTAGE];
    const r = await del("L1");
    expect(r.status).toBe(503);
    await expect(r.json()).resolves.toEqual({ error: "layouts_unavailable" });
  });

  it("404s when nothing was deleted", async () => {
    H.results = [{ data: [] }];
    expect((await del("L1")).status).toBe(404);
    expect((await del()).status).toBe(404);
  });

  it("200s a real delete", async () => {
    H.results = [{ data: [{ id: "L1" }] }];
    const r = await del("L1");
    expect(r.status).toBe(200);
    await expect(r.json()).resolves.toEqual({ ok: true });
  });
});
