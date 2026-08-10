import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ token: "operator-token", allowed: true }));
vi.mock("@/app/api/billing/gateway", () => ({ billingAuth: vi.fn(async () => state.token ? { token: state.token } : null) }));
vi.mock("@/lib/entitlement", () => ({ hasIssueDeskOperator: vi.fn(async () => state.allowed) }));
vi.mock("@/lib/upstreams", () => ({ ISSUE_DESK_API_BASE: "https://macro.test" }));
import { GET } from "@/app/api/options/issue-desk/route";
import { POST } from "@/app/api/options/issue-desk/reviews/route";

let realFetch: typeof globalThis.fetch;
beforeEach(() => { state.token = "operator-token"; state.allowed = true; realFetch = globalThis.fetch; });
afterEach(() => { globalThis.fetch = realFetch; vi.clearAllMocks(); });
const body = (extra: Record<string, unknown> = {}) => new Request("https://app.test/api/options/issue-desk/reviews", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ proposal_id: "oidp_1234567890abcdef12345678", proposal_revision: 1, action: "reject", reason_codes: ["ABSTAIN"], idempotency_key: "1234567890abcdef", ...extra }) });

describe("Issue Desk private proxies", () => {
  it("fails closed locally for missing authentication or operator authority", async () => {
    state.token = ""; expect((await GET()).status).toBe(401);
    state.token = "token"; state.allowed = false; expect((await POST(body())).status).toBe(403);
  });
  it("rejects malformed review bodies without calling Macro", async () => {
    const spy = globalThis.fetch = vi.fn() as unknown as typeof fetch;
    expect((await POST(body({ reason_codes: [] }))).status).toBe(422);
    expect(spy).not.toHaveBeenCalled();
  });
  it("preserves Macro conflict statuses and forwards its bearer/idempotency body", async () => {
    const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => { void input; void init; return new Response(JSON.stringify({ detail: "stale revision" }), { status: 409, headers: { "content-type": "application/json" } }); });
    globalThis.fetch = spy as unknown as typeof fetch;
    const response = await POST(body());
    expect(response.status).toBe(409); expect(response.headers.get("cache-control")).toBe("private, no-store");
    const [url, init] = spy.mock.calls[0]!;
    expect(url).toBe("https://macro.test/api/options/issue-desk/reviews"); expect((init!.headers as Record<string, string>).Authorization).toBe("Bearer operator-token"); expect(JSON.parse(String(init!.body))).toMatchObject({ idempotency_key: "1234567890abcdef" });
    expect(init!.redirect).toBe("error");
  });
  it("forwards raw duplicate-key JSON for Macro's strict decoder to reject", async () => {
    const raw = '{"proposal_id":"oidp_1234567890abcdef12345678","proposal_id":"oidp_1234567890abcdef12345678","proposal_revision":1,"action":"reject","reason_codes":["ABSTAIN"],"idempotency_key":"1234567890abcdef"}';
    const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => { void input; void init; return new Response('{"detail":"duplicate key"}', { status: 422, headers: { "content-type": "application/json" } }); });
    globalThis.fetch = spy as unknown as typeof fetch;
    const response = await POST(new Request("https://app.test/api/options/issue-desk/reviews", { method: "POST", headers: { "Content-Type": "application/json" }, body: raw }));
    expect(response.status).toBe(422); expect(spy.mock.calls[0]![1]!.body).toBe(raw);
  });
  it("maps unreachable Macro to 502", async () => {
    globalThis.fetch = vi.fn(async () => { throw new Error("down"); }) as unknown as typeof fetch;
    expect((await GET()).status).toBe(502);
  });
  it("never re-originates an upstream HTML response under the Terminal origin", async () => {
    globalThis.fetch = vi.fn(async () => new Response("<script>operatorSession()</script>", { status: 500, headers: { "content-type": "text/html" } })) as unknown as typeof fetch;
    const response = await GET();
    expect(response.status).toBe(502);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await response.text()).not.toContain("<script>");
  });
});
