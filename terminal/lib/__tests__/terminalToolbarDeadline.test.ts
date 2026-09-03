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

    expect(source).toContain("export function createToolbarIntent()");
    // `TestInfo.duration` is the supported live elapsed-test clock in this Playwright version. The
    // former private `_startWallTime` probe is absent in ordinary runs, silently falling back to an
    // eight-second budget even when the enclosing test has ample real time left.
    expect(source).toContain("Date.now() - info.duration");
    expect(source).not.toContain("info._startWallTime");
    expect(source).toContain("Math.min(now + TOOLBAR_INVOCATION_BUDGET_MS, testBound)");
    expect(source).not.toContain("new WeakMap<Page, number>()");
    expect(source).not.toContain("toolbarDeadlines.get(page)");
    expect(source).not.toContain("toolbarDeadlines.set(page)");
    expect(source).not.toContain("toolbarDeadline(page)");
  });

  it("threads one explicit aggregate intent through every public toolbar operation", () => {
    // This catches the hosted 33597855125 defect: a composed toolbar journey could mint a new
    // twelve-second deadline at each exported call, even though the owning Playwright test has one
    // finite clock. Removing intent propagation or recreating a deadline at an exported boundary
    // must make this contract RED.
    const source = helperSource();

    expect(source).toContain("export type ToolbarIntent");
    expect(source).toContain("export function createToolbarIntent()");
    expect(source).toContain("const activeIntent = intent ?? createToolbarIntent();");
    expect(source).toContain("async function viaToolbar(page: Page, opts: ToolbarAction, intent: ToolbarIntent)");
    expect(source).toContain("export async function chooseToolbarSplit(page: Page, count: 1 | 2 | 4, intent?: ToolbarIntent)");
    expect(source).toContain("export async function openLayoutMenu(page: Page, intent?: ToolbarIntent)");
    expect(source).toContain("export async function toggleToolbarSync(page: Page, intent?: ToolbarIntent)");
    expect(source).toContain("export async function runToolbarDetector(page: Page, label: string, intent?: ToolbarIntent)");
    expect(source).not.toContain("function toolbarJourneyDeadline()");
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

  it("keeps every toolbar-local click actionable without waiting for impossible navigation", () => {
    const source = helperSource();

    expect(source).toContain("function clickLocalToolbarControl(");
    expect(source).toContain("target.click({ timeout, noWaitAfter: true })");
    // More, Back, Split, Workspaces, Sync, Replay and Detect are all local React controls.
    // Any new raw click would reintroduce Playwright's post-click navigation wait on one route.
    expect(source.match(/\.click\(/g) ?? []).toHaveLength(1);
    expect(source).not.toContain("force: true");
    expect(source).not.toContain("dispatchEvent(");
  });
});
