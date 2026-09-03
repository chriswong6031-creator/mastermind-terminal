import { describe, expect, it } from "vitest";
import {
  allocateToolbarStage,
  createToolbarIntent,
  createToolbarTestBound,
  executeToolbarStage,
  formatToolbarFailure,
  type ToolbarFailureReceipt,
} from "../../e2e/terminalToolbar";

describe("toolbar invocation deadline ownership", () => {
  it("caps a late toolbar intent at the caller-owned absolute test bound", () => {
    const bound = createToolbarTestBound({
      testStartedAtMs: 1_000,
      testTimeoutMs: 30_000,
    });

    expect(bound).toEqual({ deadline: 28_000 });
    expect(createToolbarIntent(bound, 21_000)).toEqual({ deadline: 28_000 });
    expect(createToolbarIntent(undefined, 21_000)).toEqual({ deadline: 29_000 });
  });

  it.each([0, undefined])(
    "ignores TestInfo.duration=%s because duration is not an elapsed-time input",
    (duration) => {
      const bound = createToolbarTestBound({
        testStartedAtMs: 1_000,
        testTimeoutMs: 30_000,
        duration,
      } as {
        testStartedAtMs: number;
        testTimeoutMs: number;
        duration?: number;
      });

      expect(createToolbarIntent(bound, 21_000)).toEqual({ deadline: 28_000 });
    },
  );

  it("does not let later sub-actions mint time beyond one shared test bound", () => {
    const bound = createToolbarTestBound({
      testStartedAtMs: 1_000,
      testTimeoutMs: 30_000,
    });

    const first = createToolbarIntent(bound, 21_000);
    const later = createToolbarIntent(bound, 26_000);
    const incorrectlyUnboundLater = createToolbarIntent(undefined, 26_000);

    expect(first.deadline).toBe(28_000);
    expect(later.deadline).toBe(28_000);
    expect(incorrectlyUnboundLater.deadline).toBe(34_000);
  });

  it("fails an insufficient multi-stage plan before invoking its first action", async () => {
    let clicks = 0;
    const result = await executeToolbarStage(
      { deadline: 28_000 },
      2,
      async () => { clicks += 1; },
      26_500,
    );

    expect(clicks).toBe(0);
    expect(result).toEqual({
      ok: false,
      code: "TOOLBAR_BUDGET_EXHAUSTED",
      budgetRemainingMs: 1_500,
    });
    if (result.ok) throw new Error("expected the insufficient plan to be rejected");

    const settledReceipt: ToolbarFailureReceipt = {
      what: "the Saved Layouts menu",
      mode: "overflow",
      revision: 7,
      settled: true,
      direct_visible: false,
      more_visible: true,
      more_enabled: true,
      overflow_open: false,
      done: false,
      budget_remaining_ms: 1_500,
      page_closed: false,
    };
    expect(formatToolbarFailure(result.code, settledReceipt)).toContain(
      'TOOLBAR_BUDGET_EXHAUSTED {"what":"the Saved Layouts menu","mode":"overflow","revision":7,"settled":true',
    );
  });

  it("invokes one action once when the complete remaining stage plan fits", async () => {
    const timeouts: number[] = [];
    const result = await executeToolbarStage(
      { deadline: 28_000 },
      2,
      async (timeout) => { timeouts.push(timeout); return "clicked"; },
      21_000,
    );

    expect(result).toEqual({ ok: true, value: "clicked" });
    expect(timeouts).toEqual([5_000]);
  });

  it("preserves the requested continuation reserve when the invocation can afford it", () => {
    expect(allocateToolbarStage(12_000, 5_500)).toEqual({
      currentMs: 6_500,
      futureMs: 5_500,
    });
    expect(allocateToolbarStage(8_000, 1_500)).toEqual({
      currentMs: 6_500,
      futureMs: 1_500,
    });
  });

  it("never lets an oversized future reserve suppress the current real action", () => {
    expect(allocateToolbarStage(5_400, 5_500)).toEqual({
      currentMs: 2_700,
      futureMs: 2_700,
    });
    expect(allocateToolbarStage(1, 5_500)).toEqual({
      currentMs: 1,
      futureMs: 0,
    });
    expect(allocateToolbarStage(0, 5_500)).toEqual({
      currentMs: 0,
      futureMs: 0,
    });
  });
});
