import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { allocateToolbarStage } from "../../e2e/terminalToolbar";

function helperSource(): string {
  return readFileSync(
    path.resolve(process.cwd(), "e2e", "terminalToolbar.ts"),
    "utf8",
  );
}

describe("toolbar invocation deadline ownership", () => {
  it("does not cache one toolbar intent's deadline on a shared Page", () => {
    const source = helperSource();

    expect(source).toContain("function toolbarJourneyDeadline()");
    expect(source.match(/const deadline = toolbarJourneyDeadline\(\);/g) ?? [])
      .toHaveLength(3);
    expect(source).toContain("Math.min(now + TOOLBAR_INVOCATION_BUDGET_MS, testBound)");
    expect(source).not.toContain("new WeakMap<Page, number>()");
    expect(source).not.toContain("toolbarDeadlines.get(page)");
    expect(source).not.toContain("toolbarDeadlines.set(page)");
    expect(source).not.toContain("toolbarDeadline(page)");
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
    // Exact failure class from hosted trace 33498206724: the helper had roughly 5.4 seconds left,
    // requested a 5.5-second continuation reserve, returned a zero click timeout, and therefore
    // never clicked a visible/enabled More button. The bounded split must give both stages time.
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

  it("uses the proportional allocator for clicks and semantic observation", () => {
    const source = helperSource();

    expect(source).toContain("allocateToolbarStage(budgetRemaining(deadline), reserveAfterMs).currentMs");
    expect(source).toContain("const observationBudget = allocateToolbarStage(");
    expect(source).toContain("(remainingMenuActions + 1) * TOOLBAR_FOLLOWUP_ACTION_RESERVE_MS");
    expect(source).not.toContain("budgetRemaining(deadline) - reserveAfterMs");
    expect(source).not.toContain("return budgetRemaining(deadline);");
  });
});
