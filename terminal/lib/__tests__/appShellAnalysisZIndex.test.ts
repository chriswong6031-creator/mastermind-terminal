// appShellAnalysisZIndex.test.ts — review ruling (PR #490, MAJOR item 3): the raised
// `.mobilebar` z-index that keeps the mobile "Menu" hamburger hit-testable above the
// Company Intelligence full-screen overlay must be SCOPED to the Analysis workspace, not a
// global chrome change — `.mobilebar` is the shared top bar for every AppShell route
// (Discover/Options/Scripts/Alerts/Portfolio/Admin), and only /analysis can render the
// colliding `.fin-pane--workspace` overlay (components/workspaces/AnalysisWorkspace.tsx).
//
// Source-scan style (matches lib/__tests__/suiteAlerts.test.ts): this repo has no React
// render-test harness for components/, so CSS/markup contracts are pinned by reading the
// real files, the same way the app ships them.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const GLOBALS_CSS = readFileSync(join(__dirname, "..", "..", "app", "globals.css"), "utf8");
const APP_SHELL_TSX = readFileSync(join(__dirname, "..", "..", "components", "chrome", "AppShell.tsx"), "utf8");

describe("AppShell analysis-only mobilebar z-index scoping", () => {
  it("keeps the shared .mobilebar rule at its historical z-index (every non-analysis route)", () => {
    const baseRule = GLOBALS_CSS.match(/(?<!\.analysis-shell )\.mobilebar\{[^}]*\}/);
    expect(baseRule, ".mobilebar base rule not found in globals.css").not.toBeNull();
    expect(baseRule![0]).toContain("z-index:30");
    expect(baseRule![0]).not.toContain("z-index:95");
  });

  it("raises .mobilebar above .fin-pane's overlay (z-index:90) ONLY inside .analysis-shell", () => {
    expect(GLOBALS_CSS).toMatch(/\.analysis-shell \.mobilebar\{z-index:95\}/);
  });

  it("AppShell applies the analysis-shell class only when the route is /analysis", () => {
    expect(APP_SHELL_TSX).toMatch(
      /className=\{`app2 obs obs-ambient\$\{path\.startsWith\("\/analysis"\) \? " analysis-shell" : ""\}`\}/
    );
  });
});
