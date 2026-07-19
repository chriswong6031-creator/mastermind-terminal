import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as parser from "../pine-engine/parser";
import { compile, runCompiled, runPine, type Bar } from "../pine-engine";
import { hashSource, barsToColumns, columnsToBars } from "../pine-engine/host-shared";

// Synthetic daily bars long enough for ta.* to warm up.
function genBars(n: number): Bar[] {
  const bars: Bar[] = [];
  const start = Date.UTC(2023, 0, 2);
  for (let i = 0; i < n; i++) {
    const c = 100 + Math.sin(i / 7) * 5 + i * 0.02;
    const o = c - 0.3, h = Math.max(o, c) + 1, l = Math.min(o, c) - 1;
    bars.push({ time: new Date(start + i * 86400000).toISOString().slice(0, 10), o, h, l, c, v: 1_000_000 });
  }
  return bars;
}

const SMA = ['//@version=6', 'indicator("S", overlay=true)', "plot(ta.sma(close, 10))", ""].join("\n");

describe("single parse — compile once, run the AST without re-parsing", () => {
  it("runPine() lexes+parses the source exactly ONCE (not twice)", () => {
    const spy = vi.spyOn(parser, "parse");
    runPine(SMA, genBars(40), {});
    expect(spy).toHaveBeenCalledTimes(1);   // was 2 before the split (index parsed, runtime re-parsed)
    spy.mockRestore();
  });

  it("compile() parses once; a subsequent runCompiled() does NOT parse again (AST reuse)", () => {
    const c = compile(SMA);
    expect(c.ok).toBe(true);
    expect(c.ast).toBeTruthy();
    const spy = vi.spyOn(parser, "parse");
    // three data-only re-runs off the same compiled AST — replay/live/param-edit pattern
    runCompiled(c.ast!, genBars(30), {});
    runCompiled(c.ast!, genBars(31), {});
    runCompiled(c.ast!, genBars(32), {});
    expect(spy).not.toHaveBeenCalled();   // AST reused → zero re-parses across data updates
    spy.mockRestore();
  });
});

describe("AST cache key by source hash", () => {
  it("hashSource is stable and distinguishes different sources", () => {
    expect(hashSource(SMA)).toBe(hashSource(SMA));
    expect(hashSource(SMA)).not.toBe(hashSource(SMA + "\nplot(close)"));
    expect(hashSource(SMA)).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe("plot() na → whitespace gap emission (LWC breaks the line)", () => {
  it("a line plot that goes na for a stretch emits whitespace points (time, no value) at the gap, not dropped points", () => {
    // plots the bar index while close>prev, else na → alternating valued/na line-series bars
    const src = [
      "//@version=6",
      'indicator("Gap", overlay=false)',
      "cond = close > close[1]",
      "plot(cond ? close : na)",
      "",
    ].join("\n");
    const bars = genBars(60);
    const out = runPine(src, bars, {});
    expect(out.ok).toBe(true);
    const plot = out.result!.plots[0];
    expect(plot.kind).toBe("line");
    // one point PER BAR (gaps included) — length equals bar count, unlike the old drop-na behavior
    expect(plot.data.length).toBe(bars.length);
    const gaps = plot.data.filter((d) => d.value === undefined);
    const valued = plot.data.filter((d) => d.value !== undefined);
    expect(gaps.length).toBeGreaterThan(0);          // some na bars → whitespace gap points
    expect(valued.length).toBeGreaterThan(0);        // some real values
    for (const g of gaps) { expect(typeof g.time).toBe("string"); expect(g.value).toBeUndefined(); }  // {time} only
  });

  it("a histogram plot omits na bars (discrete series — no whitespace filler)", () => {
    const src = [
      "//@version=6",
      'indicator("H", overlay=false)',
      "cond = close > close[1]",
      "plot(cond ? close : na, style=plot.style_histogram)",
      "",
    ].join("\n");
    const bars = genBars(60);
    const out = runPine(src, bars, {});
    const plot = out.result!.plots[0];
    expect(plot.kind).toBe("histogram");
    expect(plot.data.length).toBeLessThan(bars.length);        // na bars dropped, not gap-filled
    expect(plot.data.every((d) => d.value !== undefined)).toBe(true);
  });
});

describe("plotshape series-bool semantics", () => {
  it("plotshape with a FINITE numeric condition is a type error (warned, no per-bar markers)", () => {
    const src = ['//@version=6', 'indicator("N", overlay=true)', "plotshape(close, style=shape.circle)", ""].join("\n");
    const out = runPine(src, genBars(40), {});
    expect(out.ok).toBe(true);
    expect(out.result!.shapes.length).toBe(0);                 // did NOT fire on every non-zero bar
    expect(out.result!.warnings.some((w) => /series bool/.test(w))).toBe(true);
  });

  it("plotshape with a real boolean condition still fires markers", () => {
    const src = ['//@version=6', 'indicator("B", overlay=true)', "plotshape(close > close[1], style=shape.triangleup)", ""].join("\n");
    const out = runPine(src, genBars(40), {});
    expect(out.ok).toBe(true);
    expect(out.result!.shapes.length).toBeGreaterThan(0);
    expect(out.result!.warnings.some((w) => /series bool/.test(w))).toBe(false);
  });
});

describe("columnar bar packing round-trips (transferable worker payload)", () => {
  it("barsToColumns → columnsToBars reproduces the bars and lists transferable buffers", () => {
    const bars = genBars(12);
    const { payload, transfer } = barsToColumns(bars);
    expect(payload.n).toBe(12);
    expect(transfer.length).toBe(5);                            // o/h/l/c/v ArrayBuffers
    const back = columnsToBars(payload);
    expect(back).toEqual(bars);
  });
});

// ── worker host: cancellation/supersession + wall-budget preemption, via a stubbed Worker ─────────
describe("PineHost worker: supersession + budget error shape (stubbed Worker)", () => {
  let created: StubWorker[] = [];
  class StubWorker {
    onmessage: ((e: any) => void) | null = null;
    onerror: (() => void) | null = null;
    posted: any[] = [];
    terminated = false;
    replyWith: ((msg: any) => any) | null = null;   // if set, auto-reply to run/compile
    constructor(_url: any, _opts: any) { created.push(this); }
    postMessage(msg: any) {
      this.posted.push(msg);
      if (this.replyWith) { const r = this.replyWith(msg); if (r) queueMicrotask(() => this.onmessage?.({ data: r })); }
    }
    terminate() { this.terminated = true; }
  }

  beforeEach(() => {
    created = [];
    (globalThis as any).window = globalThis;
    (globalThis as any).Worker = StubWorker as any;
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    delete (globalThis as any).window;
    delete (globalThis as any).Worker;
    vi.resetModules();
  });

  it("hasWorker() true; a run that never replies resolves as budgetExceeded and terminates+respawns", async () => {
    const host = await import("../pine-engine/host");
    expect(host.hasWorker()).toBe(true);
    const h = host.createPineHost();
    expect(h.usingWorker).toBe(true);

    // this run's worker never replies → the wall-budget timer must fire
    const p = h.run({ slot: "s1", source: SMA, bars: genBars(10), budgetMs: 500 });
    await vi.advanceTimersByTimeAsync(600);
    const res = await p;
    expect(res.budgetExceeded).toBe(true);
    expect(res.ok).toBe(false);
    expect(res.errors[0].message).toMatch(/budget/);
    expect(created[0].terminated).toBe(true);   // worker was terminated on breach

    // next run respawns a fresh worker
    const w0 = created.length;
    void h.run({ slot: "s1", source: SMA, bars: genBars(10), budgetMs: 500 });
    expect(created.length).toBe(w0 + 1);
    h.dispose();
  });

  it("a newer run for the same slot supersedes the in-flight one (cancelled:true, no crosstalk)", async () => {
    const host = await import("../pine-engine/host");
    const h = host.createPineHost();
    const first = h.run({ slot: "same", source: SMA, bars: genBars(10), budgetMs: 5000 });
    const second = h.run({ slot: "same", source: SMA, bars: genBars(10), budgetMs: 5000 });
    const r1 = await first;
    expect(r1.cancelled).toBe(true);   // superseded
    expect(r1.result).toBeNull();
    // let the second one time out cleanly so no timer leaks into the next test
    await vi.advanceTimersByTimeAsync(6000);
    await second;
    h.dispose();
  });

  it("SSR/no-Worker → createPineHost() returns a sync host that still runs", async () => {
    delete (globalThis as any).Worker;
    vi.resetModules();
    const host = await import("../pine-engine/host");
    expect(host.hasWorker()).toBe(false);
    const h = host.createPineHost();
    expect(h.usingWorker).toBe(false);
    const r = await h.run({ slot: "x", source: SMA, bars: genBars(20) });
    expect(r.ok).toBe(true);
    expect(r.result!.plots.length).toBe(1);
  });
});
