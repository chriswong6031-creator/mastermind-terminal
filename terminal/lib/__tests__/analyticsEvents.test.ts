import { describe, it, expect, beforeAll, vi } from "vitest";

// Verify the write plane's dev fallback (in-memory ring when no service-role key), mirroring the
// searchEvents dev-ring behaviour. Stub the env BEFORE importing so createServiceClient() memoises
// null and recordEvents routes to the ring instead of hitting Supabase.
let recordEvents: (rows: any[]) => Promise<void>;
let __devRows: () => any[];

beforeAll(async () => {
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
  ({ recordEvents, __devRows } = await import("@/lib/analyticsEvents"));
});

describe("analyticsEvents write plane (dev ring)", () => {
  const row = (over: Record<string, unknown> = {}) => ({
    type: "pageview", site: "terminal", path: "/terminal", ref: null, ticker: null,
    dwell_ms: null, scroll: null, fp: null, session_id: "s1", visitor_id: "v1",
    user_id: null, ip: "1.2.3.4", ua: "test", client_ts: null, meta: null, ...over,
  });

  it("stores a batch in memory when no service key is present", async () => {
    const before = __devRows().length;
    await recordEvents([row(), row({ type: "ticker_view", ticker: "NVDA" })]);
    const rows = __devRows();
    expect(rows.length).toBe(before + 2);
    expect(rows[rows.length - 1].ticker).toBe("NVDA");
    expect(rows[rows.length - 1].visitor_id).toBe("v1");
  });

  it("is a no-op for an empty batch", async () => {
    const before = __devRows().length;
    await recordEvents([]);
    expect(__devRows().length).toBe(before);
  });
});
