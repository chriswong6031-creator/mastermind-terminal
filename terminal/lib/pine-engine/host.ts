// Pine host — the integration API for ChartPanel (chart execution) and PineEditor (diagnostics).
// It runs the engine in a terminateable Web Worker so a heavy/hostile script never blocks the UI,
// and gives the consumer three guarantees the raw engine can't:
//
//   1. CANCELLATION / SUPERSESSION — runs are addressed by a `slot` (e.g. a scriptId). Kicking off a
//      new run for a slot supersedes any in-flight run for that slot: the old promise resolves with
//      { cancelled: true } and its result is dropped, so a stale worker reply never paints over a
//      newer one. (The host also stamps an epoch per slot; the consumer should still guard on it.)
//   2. PER-RUN WALL BUDGET — each run arms a timer; on breach the host worker.terminate()s (real
//      preemption — the cooperative in-engine budget can't stop a tight non-looping hot path) and
//      auto-respawns a fresh worker, resolving the run with { budgetExceeded: true } + an error.
//   3. AST CACHE BY SOURCE HASH — compile(source) returns an astId (source hash); the worker caches
//      the parsed AST under it, so data-only re-runs (replay ticks, live splices, param edits) pass
//      astId and skip re-parsing entirely. This is the layer the future ChartPanel integration reuses
//      to run one compiled script across many data updates.
//
// SSR / no-Worker: `hasWorker()` is false during SSR and in test/jsdom without a Worker; callers
// should fall back to runPineSync()/compilePine() (both re-exported below). The host is lazily
// constructed so importing this module never touches `Worker` at module-eval time.
import { compilePine, runPine, type PineError, type RunResult, type Bar } from "./index";
import { hashSource, barsToColumns } from "./host-shared";

export type { Bar } from "./runtime";
export type { PineError, RunResult } from "./index";

export interface PineCompileResult { ok: boolean; errors: PineError[]; astId: string | null; cancelled?: boolean; }
export interface PineResult {
  ok: boolean;
  errors: PineError[];
  result: RunResult | null;
  cancelled?: boolean;      // superseded by a newer run for the same slot (result discarded)
  budgetExceeded?: boolean; // wall-budget breach → worker was terminated + respawned
  astId?: string;
}

export interface RunRequest {
  slot: string;                 // supersession key (e.g. scriptId). A new run for this slot cancels the prior one.
  source: string;               // always provided so the worker can (re)compile if the astId isn't cached
  astId?: string;               // if known (from a prior compile()), lets the worker skip re-parsing
  bars: Bar[];
  inputs?: Record<string, any>; // param overrides (keyed on the input's assignment var — see pineRender test)
  opts?: { timeframe?: string; symbol?: string };
  budgetMs?: number;            // per-run wall budget (default DEFAULT_RUN_BUDGET_MS)
}

const DEFAULT_RUN_BUDGET_MS = 1500;

// True when a real Web Worker is available (browser, not SSR, not a bare jsdom without Worker).
export function hasWorker(): boolean {
  return typeof window !== "undefined" && typeof Worker !== "undefined";
}

// ── synchronous fallback (tests, SSR, no-Worker) ─────────────────────────────────────────────────
export function runPineSync(req: Pick<RunRequest, "source" | "bars" | "inputs" | "opts" | "budgetMs">): PineResult {
  const astId = hashSource(req.source);
  const out = runPine(req.source, req.bars, { ...(req.opts || {}), params: req.inputs || {}, budgetMs: req.budgetMs ?? DEFAULT_RUN_BUDGET_MS });
  return { ok: out.ok, errors: out.errors, result: out.result, astId };
}
export function compilePineSync(source: string): PineCompileResult {
  const c = compilePine(source);
  return { ok: c.ok, errors: c.errors, astId: c.ok ? hashSource(source) : null };
}

interface Pending {
  reqId: number;
  slot: string;
  kind: "compile" | "run";
  resolve: (r: any) => void;
  timer: ReturnType<typeof setTimeout> | null;
  budgetMs: number;
}

export interface PineHost {
  compile(source: string): Promise<PineCompileResult>;
  run(req: RunRequest): Promise<PineResult>;
  evict(source: string): void;   // drop one script's cached AST (e.g. on script delete)
  clear(): void;                 // drop the whole worker AST cache
  dispose(): void;               // terminate the worker + reject all pending
  readonly usingWorker: boolean;
}

class WorkerHost implements PineHost {
  private worker: Worker | null = null;
  private pending = new Map<number, Pending>();
  private slotReq = new Map<string, number>();   // slot → the reqId of its currently in-flight run
  private nextId = 1;
  private disposed = false;
  readonly usingWorker = true;

  private spawn(): Worker {
    // Bundled worker — Turbopack/webpack resolve `new URL('./worker.ts', import.meta.url)` to a real
    // worker chunk (Next 16 supports this; see AGENTS.md / turbopack docs on new Worker()).
    const w = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    w.onmessage = (e: MessageEvent) => this.onMessage(e.data);
    w.onerror = () => this.onWorkerError();
    return w;
  }
  private ensure(): Worker { if (!this.worker) this.worker = this.spawn(); return this.worker; }

  private onMessage(data: any) {
    if (!data || typeof data.reqId !== "number") return;
    const p = this.pending.get(data.reqId);
    if (!p) return;               // stale (superseded/terminated) — ignore
    this.settle(p, () => {
      if (data.kind === "compiled") return { ok: data.ok, errors: data.errors, astId: data.astId } as PineCompileResult;
      return { ok: data.ok, errors: data.errors, result: data.result, astId: p && (data.astId ?? undefined) } as PineResult;
    });
  }

  // A worker-level error (uncaught throw in the worker) kills the worker — respawn and fail every
  // pending request so no promise hangs.
  private onWorkerError() {
    const err: PineError = { line: 0, col: 0, message: "pine worker crashed", phase: "runtime" };
    this.failAll({ ok: false, errors: [err], result: null });
    this.respawn();
  }

  private settle(p: Pending, build: () => any) {
    if (p.timer) clearTimeout(p.timer);
    this.pending.delete(p.reqId);
    if (this.slotReq.get(p.slot) === p.reqId) this.slotReq.delete(p.slot);
    p.resolve(build());
  }

  private failAll(payload: PineResult | PineCompileResult) {
    for (const p of this.pending.values()) { if (p.timer) clearTimeout(p.timer); p.resolve(payload); }
    this.pending.clear();
    this.slotReq.clear();
  }

  // Terminate the current worker (used on budget breach) and drop it; next request respawns. Any
  // still-pending requests are NOT auto-failed here — the caller that triggered the terminate resolves
  // its own request with budgetExceeded, and other pendings are re-driven onto the fresh worker below.
  private respawn() {
    if (this.worker) { try { this.worker.terminate(); } catch { /* noop */ } this.worker = null; }
  }

  compile(source: string): Promise<PineCompileResult> {
    if (this.disposed) return Promise.resolve(compilePineSync(source));
    const reqId = this.nextId++;
    const w = this.ensure();
    return new Promise<PineCompileResult>((resolve) => {
      // compile shares the diagnostics "slot": a new compile supersedes the previous (debounced typing)
      const slot = "@compile";
      const prev = this.slotReq.get(slot);
      if (prev != null) { const pp = this.pending.get(prev); if (pp) this.settle(pp, () => ({ ok: false, errors: [], astId: null, cancelled: true })); }
      const p: Pending = { reqId, slot, kind: "compile", resolve, timer: null, budgetMs: 0 };
      this.pending.set(reqId, p); this.slotReq.set(slot, reqId);
      w.postMessage({ kind: "compile", reqId, source });
    });
  }

  run(req: RunRequest): Promise<PineResult> {
    if (this.disposed) return Promise.resolve(runPineSync(req));
    const reqId = this.nextId++;
    const budgetMs = req.budgetMs ?? DEFAULT_RUN_BUDGET_MS;
    const w = this.ensure();
    return new Promise<PineResult>((resolve) => {
      // Supersede any in-flight run for this slot: resolve it as cancelled, drop its reply.
      const prev = this.slotReq.get(req.slot);
      if (prev != null) { const pp = this.pending.get(prev); if (pp) this.settle(pp, () => ({ ok: false, errors: [], result: null, cancelled: true })); }

      const p: Pending = { reqId, slot: req.slot, kind: "run", resolve, timer: null, budgetMs };
      // Per-run wall budget: on breach, terminate + respawn the worker and resolve this run as
      // budgetExceeded. Terminating drops every OTHER pending reply too, so re-arm them isn't
      // attempted — they'll be resolved as budgetExceeded as well (a runaway poisons the batch;
      // the consumer re-runs). This is the real preemption the cooperative in-engine budget can't give.
      p.timer = setTimeout(() => {
        if (!this.pending.has(reqId)) return;
        this.respawn();
        const budgetErr: PineError = { line: 0, col: 0, message: `script exceeded the ${budgetMs}ms run budget (cancelled)`, phase: "runtime" };
        // resolve every currently-pending request as budget-exceeded (the terminated worker will never reply)
        for (const q of Array.from(this.pending.values())) {
          if (q.timer) clearTimeout(q.timer);
          this.pending.delete(q.reqId);
          if (this.slotReq.get(q.slot) === q.reqId) this.slotReq.delete(q.slot);
          q.resolve({ ok: false, errors: [budgetErr], result: null, budgetExceeded: true } as PineResult);
        }
      }, budgetMs);

      this.pending.set(reqId, p); this.slotReq.set(req.slot, reqId);
      const { payload, transfer } = barsToColumns(req.bars);
      w.postMessage({ kind: "run", reqId, astId: req.astId, source: req.source, bars: payload, inputs: req.inputs || {}, opts: req.opts || {} }, transfer);
    });
  }

  evict(source: string) { if (this.worker) this.worker.postMessage({ kind: "evict", astId: hashSource(source) }); }
  clear() { if (this.worker) this.worker.postMessage({ kind: "clear" }); }

  dispose() {
    this.disposed = true;
    this.failAll({ ok: false, errors: [], result: null, cancelled: true });
    if (this.worker) { try { this.worker.terminate(); } catch { /* noop */ } this.worker = null; }
  }
}

// Synchronous host: same surface, runs on the main thread. Used when no Worker exists (SSR/tests) so
// consumers can hold ONE PineHost reference and not branch on the environment. No cancellation/budget
// preemption (a sync run can't be interrupted) — the engine's cooperative budget still applies.
class SyncHost implements PineHost {
  readonly usingWorker = false;
  compile(source: string): Promise<PineCompileResult> { return Promise.resolve(compilePineSync(source)); }
  run(req: RunRequest): Promise<PineResult> { return Promise.resolve(runPineSync(req)); }
  evict(): void { /* no worker cache to evict */ }
  clear(): void { /* no worker cache */ }
  dispose(): void { /* nothing to tear down */ }
}

// Create a host bound to the current environment: a real worker host in the browser, a sync host in
// SSR/tests. Callers construct one per surface (chart, editor) and dispose() on unmount.
export function createPineHost(): PineHost {
  return hasWorker() ? new WorkerHost() : new SyncHost();
}
