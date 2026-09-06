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
    // Review round 3, minor 3: the previous assertion pinned the exact template-literal source
    // (backtick spacing, quote style, ternary formatting) rather than the behavior it exists to
    // guard — an equivalent refactor of the same logic would fail it for no functional reason.
    // Assert the three facts that actually matter instead: the app2 root's className is a
    // template literal, it can contain "analysis-shell", and that inclusion is gated on
    // `path.startsWith("/analysis")` — however the expression around it is formatted.
    const rootClassName = APP_SHELL_TSX.match(/className=\{`[^`]*app2[^`]*`\}/);
    expect(rootClassName, "app2 root className template literal not found in AppShell.tsx").not.toBeNull();
    expect(rootClassName![0]).toContain("analysis-shell");
    expect(rootClassName![0]).toMatch(/path\.startsWith\(\s*["']\/analysis["']\s*\)/);
  });
});

describe("AppShell analysis-only fin-pane offset (review round 3, MAJOR 1)", () => {
  // Raising .mobilebar to z-index:95 (above) stopped it from being covered by .fin-pane's
  // z-index:90 overlay, but at <=860px .fin-pane--workspace falls back to .fin-pane's base
  // inset:0 (app/fin.css), so the pane's OWN header now painted directly under the mobilebar
  // instead of being covered by it. Fix: push the pane down by the mobilebar's own height so
  // the two never share the same strip of the viewport, independent of z-index. Assert the
  // offset is numerically tied to the mobilebar's real height (not just a matching literal) —
  // if .mobilebar's height ever changes, this fails instead of silently reopening the collision.
  it("offsets .analysis-shell .fin-pane--workspace by exactly .mobilebar's height, at <=860px", () => {
    const mobilebarBase = GLOBALS_CSS.match(/(?<!\.analysis-shell )\.mobilebar\{[^}]*\}/);
    expect(mobilebarBase, ".mobilebar base rule not found in globals.css").not.toBeNull();
    const mobilebarHeight = mobilebarBase![0].match(/height:(\d+)px/);
    expect(mobilebarHeight, ".mobilebar has no height:Npx declaration").not.toBeNull();

    const paneOffsetBlock = GLOBALS_CSS.match(
      /@media \(max-width:860px\)\{\s*\.analysis-shell \.fin-pane--workspace\{top:(\d+)px\}\s*\}/,
    );
    expect(
      paneOffsetBlock,
      ".analysis-shell .fin-pane--workspace top-offset rule not found inside @media (max-width:860px)",
    ).not.toBeNull();

    expect(Number(paneOffsetBlock![1])).toBe(Number(mobilebarHeight![1]));
  });

  it("does not touch .fin-pane--workspace outside .analysis-shell (every other AppShell route)", () => {
    expect(GLOBALS_CSS).not.toMatch(/(?<!\.analysis-shell )\.fin-pane--workspace\{top:\d+px\}/);
  });
});
