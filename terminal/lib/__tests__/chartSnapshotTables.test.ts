import { describe, expect, it } from "vitest";
import type { TableSpec } from "@/lib/indicator-canvas/types";
import {
  paintSnapshotTables,
  type SnapshotTablePaintOptions,
} from "@/lib/chartSnapshotTables";

type Call = { method: string; args: unknown[]; alpha: number; fillStyle: unknown; font: string };

function mockContext(charWidth = 6): CanvasRenderingContext2D & { calls: Call[] } {
  const calls: Call[] = [];
  const state = {
    globalAlpha: 1,
    fillStyle: "#000",
    strokeStyle: "#000",
    lineWidth: 1,
    font: "",
    textAlign: "left",
    textBaseline: "alphabetic",
  };
  const target: Record<string, unknown> = {
    calls,
    measureText: (text: string) => ({ width: Array.from(text).length * charWidth }),
  };
  for (const method of ["save", "restore", "beginPath", "roundRect", "rect", "clip", "fill", "stroke", "fillRect", "fillText"]) {
    target[method] = (...args: unknown[]) => {
      calls.push({
        method,
        args,
        alpha: state.globalAlpha,
        fillStyle: state.fillStyle,
        font: state.font,
      });
    };
  }
  for (const key of Object.keys(state)) {
    Object.defineProperty(target, key, {
      get: () => state[key as keyof typeof state],
      set: (value) => { (state as Record<string, unknown>)[key] = value; },
    });
  }
  return target as unknown as CanvasRenderingContext2D & { calls: Call[] };
}

const palette = {
  panel: "#10131a",
  line: "#303642",
  text: "#f4f6fb",
  text2: "#c5cad4",
  textDim: "#747d8e",
  muted: "#8992a3",
};

const options: SnapshotTablePaintOptions = {
  outputWidth: 1200,
  outputHeight: 800,
  chartBodyTop: 52,
  scale: 1,
  palette,
  fonts: { ui: "Inter", numeric: "JetBrains Mono" },
};

function table(id: string, pos: TableSpec["pos"] = "tr", compact = false): TableSpec {
  return {
    id,
    pos,
    compact,
    title: `Title ${id}`,
    columns: [{ key: "state", label: "State" }, { key: "score", label: "Score", num: true }],
    rows: [{
      label: "Trend",
      cells: [
        { text: "Bullish", color: "#33d6a6", bg: "#33d6a6", bold: true },
        { text: "8.5", fade: 1 },
      ],
    }],
    footnote: "Confirmed chart bars",
  };
}

describe("paintSnapshotTables", () => {
  it("uses last-writer-wins, stable id order, and live corner stacking", () => {
    const ctx = mockContext();
    const layouts = paintSnapshotTables(ctx, [
      { ...table("z", "tl"), title: "old" },
      table("b", "tl"),
      table("a", "tl"),
      { ...table("z", "tl"), title: "new" },
      table("right", "br"),
    ], options);

    expect(layouts.map((layout) => layout.id)).toEqual(["a", "b", "z", "right"]);
    expect(layouts[0].x).toBe(8);
    expect(layouts[0].y).toBe(116); // chart body (52) + desktop TL clearance (64)
    expect(layouts[1].y).toBeGreaterThan(layouts[0].y + layouts[0].height);
    const right = layouts.at(-1)!;
    expect(right.x + right.width).toBe(1192);
    expect(right.y + right.height).toBe(792);

    const text = ctx.calls.filter((call) => call.method === "fillText").map((call) => call.args[0]);
    expect(text).toContain("NEW");
    expect(text).not.toContain("OLD");
  });

  it("draws titles, headers, rows, footnotes, tint, bold, fade, and numeric alignment", () => {
    const ctx = mockContext();
    const layouts = paintSnapshotTables(ctx, [table("dash")], options);
    expect(layouts).toHaveLength(1);

    const fills = ctx.calls.filter((call) => call.method === "fillText");
    expect(fills.map((call) => call.args[0])).toEqual([
      "TITLE DASH", "STATE", "SCORE", "Trend", "Bullish", "8.5", "Confirmed chart bars",
    ]);
    expect(fills.find((call) => call.args[0] === "Bullish")?.font).toContain("700");
    expect(fills.find((call) => call.args[0] === "Bullish")?.fillStyle).toBe("#33d6a6");
    expect(fills.find((call) => call.args[0] === "8.5")?.alpha).toBeCloseTo(0.95 * 0.35);
    expect(ctx.calls.some((call) => call.method === "fill" && call.fillStyle === "#33d6a6" && call.alpha === 0.95 * 0.14)).toBe(true);
  });

  it("uses compact metrics and scales every layout measurement into output pixels", () => {
    const regularCtx = mockContext();
    const compactCtx = mockContext();
    const regular = paintSnapshotTables(regularCtx, [table("regular")], options)[0];
    const compact = paintSnapshotTables(compactCtx, [table("compact", "tr", true)], options)[0];
    expect(compact.height).toBeLessThan(regular.height);

    const scaledCtx = mockContext(12);
    const scaled = paintSnapshotTables(scaledCtx, [table("scaled")], {
      ...options,
      outputWidth: 2400,
      outputHeight: 1600,
      chartBodyTop: 104,
      scale: 2,
    })[0];
    expect(scaled.x + scaled.width).toBe(2384);
    expect(scaled.y).toBe(120); // header 104 + 8 CSS px at 2x
    expect(scaled.height).toBeCloseTo(regular.height * 2);
  });

  it("safely truncates overlong Unicode text to the card width", () => {
    const ctx = mockContext(14);
    const long = table("long");
    long.title = "🚀".repeat(100);
    long.rows[0].label = "Extremely long dashboard label";
    long.rows[0].cells[0].text = "Long bullish state that cannot possibly fit";
    const [layout] = paintSnapshotTables(ctx, [long], {
      ...options,
      outputWidth: 300,
    });

    expect(layout.width).toBeLessThanOrEqual(260);
    const rendered = ctx.calls
      .filter((call) => call.method === "fillText")
      .map((call) => String(call.args[0]));
    expect(rendered.some((value) => value.endsWith("…"))).toBe(true);
    expect(rendered.some((value) => value.includes("\ud83d") && !value.includes("🚀"))).toBe(false);
  });
});
