import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { criticalTerminalDataUrls } from "../terminalBoot";

describe("Terminal critical boot path", () => {
  it("preloads the exact OHLC and slice resources awaited by ChartPanel", () => {
    expect(criticalTerminalDataUrls(" nvda ")).toEqual([
      "/data/NVDA.json",
      "/data/NVDA.slice.json",
    ]);
    expect(criticalTerminalDataUrls("BTC-USD")).toEqual([
      "/data/BTC-USD.json",
      "/data/BTC-USD.slice.json",
    ]);
    expect(criticalTerminalDataUrls("^GSPC")).toEqual([
      "/data/%5EGSPC.json",
      "/data/%5EGSPC.slice.json",
    ]);
  });

  it("never turns a composite or path-like value into a preload URL", () => {
    expect(criticalTerminalDataUrls("AAPL/MSFT")).toEqual([]);
    expect(criticalTerminalDataUrls("../secret")).toEqual([]);
    expect(criticalTerminalDataUrls("")).toEqual([]);
    expect(criticalTerminalDataUrls(null)).toEqual([]);
  });

  it("reveals the dashboard iframe only from the chart visual-ready bridge", () => {
    const root = path.resolve(process.cwd());
    const bridge = readFileSync(path.join(root, "components", "EmbeddedTerminalBridge.tsx"), "utf8");
    const chart = readFileSync(path.join(root, "components", "ChartPanel.tsx"), "utf8");
    expect(bridge).toContain('postToMacroDashboard("terminal:visual-ready"');
    expect(chart).toContain("announceTerminalVisualReady(symbol)");
    expect(chart).toContain('announceTerminalVisualReady(symbol, "empty")');
  });

  it("pins one deployment id across production build and runtime", () => {
    const root = path.resolve(process.cwd());
    const script = readFileSync(path.resolve(root, "..", "ops", "terminal-build.sh"), "utf8");
    const config = readFileSync(path.join(root, "next.config.ts"), "utf8");
    expect(script).toContain('FULL_SHA=$(git -C "$SRC" rev-parse HEAD)');
    expect(script).toContain('GIT_SHA="$FULL_SHA" NEXT_DEPLOYMENT_ID="$FULL_SHA" npm run build');
    expect(script).toContain('printf \'%s\\n\' "$FULL_SHA" > "$STAGE/.deployment-id"');
    expect(script).toContain('"$APP/.deployment-id"');
    expect(config).toContain('readFileSync(path.join(__dirname, ".deployment-id")');
    expect(config).not.toContain("`t${Date.now()}`");
  });
});
