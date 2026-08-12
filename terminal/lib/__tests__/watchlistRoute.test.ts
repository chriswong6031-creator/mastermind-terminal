import { beforeEach, describe, expect, it, vi } from "vitest";

type Filter = { column: string; value: unknown };
type QueryRecord = {
  table: string;
  mode: "read" | "delete" | "update" | "insert" | "count";
  filters: Filter[];
  inFilter: Filter | null;
  values: Record<string, unknown> | null;
};

const H = vi.hoisted(() => ({
  user: { id: "user-1" } as { id: string } | null,
  watchlist: { id: "watchlist-1" } as { id: string } | null,
  existingSymbol: null as { id: string } | null,
  symbolCount: 3,
  mutationError: null as { message: string } | null,
  queries: [] as QueryRecord[],
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: vi.fn(async () => ({ data: { user: H.user } })),
    },
    from: vi.fn((table: string) => {
      const record: QueryRecord = {
        table,
        mode: "read",
        filters: [],
        inFilter: null,
        values: null,
      };
      H.queries.push(record);

      const result = () => {
        if (record.mode === "count") return { count: H.symbolCount, error: null };
        if (record.mode === "delete" || record.mode === "update") {
          return { error: H.mutationError };
        }
        return { error: null };
      };
      // Recursive fluent test double mirrors the Supabase query builder.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const query: any = {
        select: vi.fn((_fields: string, options?: { count?: string; head?: boolean }) => {
          if (options?.head) record.mode = "count";
          return query;
        }),
        eq: vi.fn((column: string, value: unknown) => {
          record.filters.push({ column, value });
          return query;
        }),
        in: vi.fn((column: string, value: unknown) => {
          record.inFilter = { column, value };
          return query;
        }),
        order: vi.fn(() => query),
        limit: vi.fn(() => query),
        delete: vi.fn(() => {
          record.mode = "delete";
          return query;
        }),
        update: vi.fn((values: Record<string, unknown>) => {
          record.mode = "update";
          record.values = values;
          return query;
        }),
        insert: vi.fn((values: Record<string, unknown>) => {
          record.mode = "insert";
          record.values = values;
          return query;
        }),
        single: vi.fn(async () => ({
          data: table === "watchlists" ? H.watchlist : null,
          error: null,
        })),
        maybeSingle: vi.fn(async () => ({ data: H.existingSymbol, error: null })),
        then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
          Promise.resolve(result()).then(resolve, reject),
      };
      return query;
    }),
  })),
}));

import { POST } from "@/app/api/watchlist/route";

const post = (body: Record<string, unknown>) => POST(new Request("https://x.test/api/watchlist", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
}));

const symbolQuery = (mode: QueryRecord["mode"]) =>
  H.queries.find((query) => query.table === "watchlist_symbols" && query.mode === mode);

beforeEach(() => {
  H.user = { id: "user-1" };
  H.watchlist = { id: "watchlist-1" };
  H.existingSymbol = null;
  H.symbolCount = 3;
  H.mutationError = null;
  H.queries = [];
  vi.clearAllMocks();
});

describe("POST /api/watchlist", () => {
  it("removes an authenticated batch with normalized, de-duplicated symbols", async () => {
    const response = await post({ action: "remove", symbols: [" aapl ", "MSFT", "AAPL"] });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(symbolQuery("delete")).toMatchObject({
      filters: [{ column: "watchlist_id", value: "watchlist-1" }],
      inFilter: { column: "symbol", value: ["AAPL", "MSFT"] },
    });
  });

  it("moves a symbol batch by updating its section", async () => {
    const response = await post({
      action: "move",
      symbols: ["9988.hk", "002716.sz"],
      section: " China Bottoms ",
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(symbolQuery("update")).toMatchObject({
      filters: [{ column: "watchlist_id", value: "watchlist-1" }],
      inFilter: { column: "symbol", value: ["9988.HK", "002716.SZ"] },
      values: { section: "China Bottoms" },
    });
  });

  it("moves symbols into the unsectioned root run", async () => {
    const response = await post({ action: "move", symbols: ["AAPL"], section: "" });

    expect(response.status).toBe(200);
    expect(symbolQuery("update")?.values).toEqual({ section: "" });
  });

  it("keeps the legacy single-symbol add contract", async () => {
    const response = await post({ action: "add", symbol: " nem ", section: "Miners" });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(symbolQuery("insert")?.values).toEqual({
      watchlist_id: "watchlist-1",
      symbol: "NEM",
      section: "Miners",
      position: 3,
    });
  });

  it("rejects malformed JSON and invalid batch input before writing", async () => {
    const malformed = await POST(new Request("https://x.test/api/watchlist", {
      method: "POST",
      body: "{not-json",
    }));
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toEqual({ error: "invalid JSON" });

    const invalidSection = await post({ action: "move", symbols: ["AAPL"], section: "\u0000bad" });
    expect(invalidSection.status).toBe(400);
    expect(await invalidSection.json()).toEqual({ error: "invalid section" });
    expect(H.queries.filter((query) => query.table === "watchlist_symbols")).toHaveLength(0);
  });

  it("rejects unsupported actions and plural add requests", async () => {
    const unsupported = await post({ action: "archive", symbol: "AAPL" });
    expect(unsupported.status).toBe(400);
    expect(await unsupported.json()).toEqual({ error: "unsupported action" });

    const pluralAdd = await post({ action: "add", symbols: ["AAPL", "MSFT"] });
    expect(pluralAdd.status).toBe(400);
    expect(await pluralAdd.json()).toEqual({ error: "add accepts one symbol" });
    expect(H.queries.some((query) => ["delete", "update", "insert"].includes(query.mode))).toBe(false);
  });

  it("rejects oversized batches instead of partially mutating them", async () => {
    const response = await post({ action: "remove", symbols: Array.from({ length: 501 }, (_, i) => `SYM${i}`) });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "symbol required or batch too large" });
    expect(H.queries.some((query) => ["delete", "update", "insert"].includes(query.mode))).toBe(false);
  });

  it("returns authentication and mutation failures", async () => {
    H.user = null;
    const unauthenticated = await post({ action: "remove", symbol: "AAPL" });
    expect(unauthenticated.status).toBe(401);

    H.user = { id: "user-1" };
    H.mutationError = { message: "database unavailable" };
    const failed = await post({ action: "move", symbol: "AAPL", section: "Core" });
    expect(failed.status).toBe(500);
    expect(await failed.json()).toEqual({ error: "watchlist update failed" });
  });
});
