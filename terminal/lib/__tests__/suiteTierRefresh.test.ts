import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const chartPanel = readFileSync(
  path.resolve(__dirname, "..", "..", "components", "ChartPanel.tsx"),
  "utf8",
);

describe("premium-suite entitlement refresh", () => {
  it("rebuilds module panes when the asynchronously resolved user tier changes", () => {
    const effectStart = chartPanel.indexOf("const tierMounted = useRef(false)");
    const effectEnd = chartPanel.indexOf("}, [userTier]);", effectStart);
    expect(effectStart).toBeGreaterThan(-1);
    expect(effectEnd).toBeGreaterThan(effectStart);

    const effect = chartPanel.slice(effectStart, effectEnd);
    expect(effect).toContain("rebuildIndicators()");
    expect(effect).toContain("applyHidden()");
    expect(effect).toContain("renderRef.current()");
    expect(effect).toContain("measureRef.current()");
  });
});
