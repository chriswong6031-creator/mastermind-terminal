import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { drawingPanelInstanceKey } from "@/lib/drawingOwnership";

describe("drawing renderer ownership lifecycle", () => {
  it("remounts an account renderer on a guest transition, cancelling a mid-drag transaction", () => {
    const accountDragRenderer = drawingPanelInstanceKey("account:a@example.com", "NVDA");
    const guestRenderer = drawingPanelInstanceKey("guest", "NVDA");

    expect(guestRenderer).not.toBe(accountDragRenderer);

    // Contract guard: the owner-aware identity must remain attached to the
    // imperative ChartPanel itself, whose unmount removes native drag listeners.
    const chartPane = readFileSync(
      path.resolve(__dirname, "..", "..", "components", "ChartPane.tsx"),
      "utf8",
    );
    const chartPanel = readFileSync(
      path.resolve(__dirname, "..", "..", "components", "ChartPanel.tsx"),
      "utf8",
    );
    expect(chartPane).toContain("key={drawingPanelInstanceKey(drawingOwnerKey, symbol)}");
    expect(chartPanel).toContain("if (dragCleanup) dragCleanup();");
    expect(chartPanel).toContain("dragCleanup = cleanupMeasure;");
  });

  it("keeps the same renderer identity for ordinary same-owner rerenders", () => {
    expect(drawingPanelInstanceKey("account:a@example.com", "NVDA"))
      .toBe(drawingPanelInstanceKey("account:a@example.com", "NVDA"));
  });
});
