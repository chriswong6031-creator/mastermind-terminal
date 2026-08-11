import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const chartPanel = readFileSync(
  path.resolve(__dirname, "..", "..", "components", "ChartPanel.tsx"),
  "utf8",
);

// ── THE GUARD THAT ATE THE FIRST 700ms OF EVERY PAGE ──────────────────────────────────────────
//
// ChartPanel suppresses the synthetic mouse-ish move iOS emits after a touch by stamping
// `lastTouchTsRef` on touch pointerdown and skipping mouse moves within 700ms of it. The ref
// starts at 0 and `performance.now()` is measured from the page's TIME ORIGIN — so the ungated
// shape `performance.now() - lastTouchTsRef.current < 700` is unconditionally true for the first
// 700ms of every page load, with no touch involved. It shipped that way at both suppression
// sites: for a fresh load's first 700ms, the pane-hover path and the signal-marker tooltip path
// (PR #379) were dead. Found 2026-08-10 by the adversarial review of PR #387, whose
// indicator-canvas layer carries the corrected, gated shape (render.ts wireTooltipHitTest).
//
// ChartPanel is not unit-mountable, so the gate is pinned at the source level (per the
// indicatorCanvasPaneClip.test.ts precedent). The gated guard's BEHAVIOR is pinned in
// indicatorCanvasTooltip.test.ts ("hover is live in the first 700ms of the page's life…")
// against the indicator-canvas layer's identical, unit-mountable copy.

const GATED = "lastTouchTsRef.current > 0 && performance.now() - lastTouchTsRef.current < 700";
const WINDOW = "performance.now() - lastTouchTsRef.current < 700";
const count = (needle: string) => chartPanel.split(needle).length - 1;

describe("ChartPanel synthetic-post-touch hover guards", () => {
  it("keeps the start-at-0 premise the gate is built on", () => {
    expect(chartPanel).toContain("const lastTouchTsRef = useRef<number>(0)");
  });

  it("gates BOTH suppression sites — pane hover and signal-marker hover — on a touch having happened", () => {
    expect(count(GATED)).toBe(2);
  });

  it("leaves no ungated window behind", () => {
    // GATED contains WINDOW, so equal counts mean every 700ms window carries the gate; an
    // ungated copy anywhere — reverted or newly added — is a hover path dead-on-load again.
    expect(count(WINDOW)).toBe(count(GATED));
  });
});
