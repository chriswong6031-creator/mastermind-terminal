import { describe, it, expect } from "vitest";
import { createAiContextProvider } from "@/lib/aiContext";

// NOTE: placed under lib/__tests__/ (not lib/aiContext.test.ts) to match this repo's vitest
// include glob (vitest.config.ts: include: ["lib/__tests__/**/*.test.ts"]) — a suite outside
// that directory is never collected by `npm test`.

describe("createAiContextProvider — revision law (exactly once per logical transition)", () => {
  it("applying the same (symbol, tf) pair twice bumps the revision exactly once", () => {
    const p = createAiContextProvider();
    p.noteContextChange({ symbol: "AAOI", timeframe: "1D" });
    expect(p.getAiContext().context_revision).toBe(1);
    p.noteContextChange({ symbol: "AAOI", timeframe: "1D" }); // duplicate — no bump
    expect(p.getAiContext().context_revision).toBe(1);
  });

  it("a symbol change then a timeframe change bumps the revision twice", () => {
    const p = createAiContextProvider();
    p.noteContextChange({ symbol: "AAOI", timeframe: "1D" });
    expect(p.getAiContext().context_revision).toBe(1);
    p.noteContextChange({ symbol: "NVDA", timeframe: "1D" }); // symbol change
    expect(p.getAiContext().context_revision).toBe(2);
    p.noteContextChange({ symbol: "NVDA", timeframe: "1W" }); // tf change
    expect(p.getAiContext().context_revision).toBe(3);
  });

  it("re-applying the current pair after other calls is a no-op", () => {
    const p = createAiContextProvider();
    p.noteContextChange({ symbol: "AAOI", timeframe: "1D" });
    p.noteContextChange({ symbol: "NVDA", timeframe: "1D" });
    expect(p.getAiContext().context_revision).toBe(2);
    p.noteContextChange({ symbol: "NVDA", timeframe: "1D" }); // re-apply current pair
    p.noteContextChange({ symbol: "NVDA", timeframe: "1D" });
    expect(p.getAiContext().context_revision).toBe(2);
  });

  it("getAiContext calls alone never bump the revision — a read is not a transition", () => {
    const p = createAiContextProvider();
    p.noteContextChange({ symbol: "AAOI", timeframe: "1D" });
    const before = p.getAiContext().context_revision;
    p.getAiContext();
    p.getAiContext();
    p.getAiContext();
    expect(p.getAiContext().context_revision).toBe(before);
  });

  it("the revision never decreases, even back to a previously-seen pair", () => {
    const p = createAiContextProvider();
    p.noteContextChange({ symbol: "AAOI", timeframe: "1D" });
    p.noteContextChange({ symbol: "NVDA", timeframe: "1D" });
    p.noteContextChange({ symbol: "AAOI", timeframe: "1D" }); // back to the first pair
    expect(p.getAiContext().context_revision).toBe(3); // still a real transition — bumps again
    p.noteContextChange({ symbol: "AAOI", timeframe: "1D" }); // duplicate of the now-current pair
    expect(p.getAiContext().context_revision).toBe(3); // never decreases, and no spurious bump
  });
});

describe("createAiContextProvider — origin identity", () => {
  it("origin_id is stable across calls within one provider instance", () => {
    const p = createAiContextProvider();
    const a = p.getAiContext().origin_id;
    p.noteContextChange({ symbol: "AAOI", timeframe: "1D" });
    const b = p.getAiContext().origin_id;
    expect(b).toBe(a);
  });

  it("origin_id differs across two independent provider instances", () => {
    const p1 = createAiContextProvider();
    const p2 = createAiContextProvider();
    expect(p1.getAiContext().origin_id).not.toBe(p2.getAiContext().origin_id);
  });

  it("origin_id is <=64 chars (contract bound)", () => {
    const p = createAiContextProvider();
    expect(p.getAiContext().origin_id.length).toBeLessThanOrEqual(64);
  });
});

describe("createAiContextProvider — getAiContext shape (ai_context_client.v1)", () => {
  it("returns the exact contract shape with no active context yet", () => {
    const p = createAiContextProvider();
    const ctx = p.getAiContext();
    expect(ctx.schema).toBe("ai_context_client.v1");
    expect(typeof ctx.origin_id).toBe("string");
    expect(ctx.context_revision).toBe(0);
    expect(typeof ctx.captured_at).toBe("string");
    expect(() => new Date(ctx.captured_at).toISOString()).not.toThrow();
    expect(ctx.pinned).toEqual([]);
    expect(ctx.active).toBeNull();
    expect(ctx.ambient).toEqual({ symbol: undefined, timeframe: undefined, page: "terminal", panel: null });
  });

  it("reflects the active symbol/timeframe once a transition is noted", () => {
    const p = createAiContextProvider();
    p.noteContextChange({ symbol: "AAOI", timeframe: "1D" });
    const ctx = p.getAiContext();
    expect(ctx.active).toEqual({ type: "security", id: "AAOI" });
    expect(ctx.ambient).toEqual({ symbol: "AAOI", timeframe: "1D", page: "terminal", panel: null });
    expect(ctx.pinned).toEqual([]); // Terminal never builds a pin store — the widget owns pins
  });

  it("getAiContext returns a fresh object on every call (not a shared mutable reference)", () => {
    const p = createAiContextProvider();
    p.noteContextChange({ symbol: "AAOI", timeframe: "1D" });
    const a = p.getAiContext();
    const b = p.getAiContext();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });

  it("captured_at advances with the wall clock across getAiContext calls", async () => {
    const p = createAiContextProvider();
    const t1 = p.getAiContext().captured_at;
    await new Promise((r) => setTimeout(r, 2));
    const t2 = p.getAiContext().captured_at;
    expect(new Date(t2).getTime()).toBeGreaterThanOrEqual(new Date(t1).getTime());
  });
});
