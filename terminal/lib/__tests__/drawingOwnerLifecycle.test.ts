import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { drawingPanelInstanceKey } from "@/lib/drawingOwnership";

const source = (...parts: string[]) => readFileSync(path.resolve(__dirname, "..", "..", ...parts), "utf8");

describe("drawing renderer ownership lifecycle", () => {
  it("remounts an account renderer on a guest transition, cancelling a mid-drag transaction", () => {
    const accountDragRenderer = drawingPanelInstanceKey("account:a@example.com");
    const guestRenderer = drawingPanelInstanceKey("guest");

    expect(guestRenderer).not.toBe(accountDragRenderer);

    // Contract guard: the owner-aware identity must remain attached to the
    // imperative ChartPanel itself, whose unmount removes native drag listeners.
    const chartPane = source("components", "ChartPane.tsx");
    const chartPanel = source("components", "ChartPanel.tsx");
    expect(chartPane).toContain("key={drawingPanelInstanceKey(drawingOwnerKey)}");
    expect(chartPanel).toContain("if (dragCleanup) dragCleanup();");
    expect(chartPanel).toContain("dragCleanup = cleanupMeasure;");
  });

  it("keeps the same renderer identity for ordinary same-owner rerenders", () => {
    expect(drawingPanelInstanceKey("account:a@example.com"))
      .toBe(drawingPanelInstanceKey("account:a@example.com"));
  });

  it("keeps the renderer alive across a symbol change so the chart never blanks", () => {
    // Keying on the symbol destroyed the canvas on every ticker change. The renderer must now
    // survive it — which puts the burden on ChartPanel to end the transaction the unmount used
    // to end, and on ChartPane to dim the outgoing chart until the new one has painted.
    const chartPanel = source("components", "ChartPanel.tsx");
    const chartPane = source("components", "ChartPane.tsx");
    expect(chartPanel).toContain("cancelPendingDrawingRef.current?.();");
    expect(chartPanel).toContain("clearDrawingSelectionRef.current?.();");
    expect(chartPane).toContain("mm:terminal-visual-ready");
    expect(chartPane).toContain("is-swapping");
  });
});
