import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

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

  it("preserves effect and follow-up budgets after the one real click", () => {
    const source = helperSource();

    expect(source).toContain("TOOLBAR_FOLLOWUP_ACTION_RESERVE_MS");
    expect(source).toContain("TOOLBAR_EFFECT_SETTLE_MS + reserveAfterMs");
    expect(source).toContain("budgetRemaining(deadline) - reserveAfterMs");
    expect(source).toContain("(remainingMenuActions + 1) * TOOLBAR_FOLLOWUP_ACTION_RESERVE_MS");
    expect(source).not.toContain("return budgetRemaining(deadline);");
  });
});
