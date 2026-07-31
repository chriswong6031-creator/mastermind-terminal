import { describe, expect, it } from "vitest";
import {
  DRAW_KINDS,
  DRAWING_SCHEMA_VERSION,
  MAX_DRAWINGS_PER_SYMBOL,
  normalizeDrawing,
  normalizeDrawingUpdate,
  normalizeDrawings,
} from "@/lib/drawings";
import {
  DRAWING_SHORTCUT_BY_CODE,
  DRAWING_TOOL_BY_ID,
  DRAWING_TOOL_GROUPS,
  DRAWING_TOOL_IDS,
  DRAWING_TOOLS,
  EXTENDABLE_DRAWING_KINDS,
  FILLABLE_DRAWING_KINDS,
  MEASUREMENT_DRAWING_KINDS,
  MULTI_POINT_DRAWING_KINDS,
  SINGLE_POINT_DRAWING_KINDS,
  TWO_POINT_DRAWING_KINDS,
  drawingToolFromShortcut,
  drawingToolSupports,
  getDrawingTool,
  isDrawingToolId,
} from "@/lib/drawingTools";

describe("drawing tool registry", () => {
  it("covers every durable DrawKind exactly once", () => {
    expect([...DRAWING_TOOL_IDS].sort()).toEqual([...DRAW_KINDS].sort());
    expect(new Set(DRAWING_TOOL_IDS).size).toBe(DRAWING_TOOL_IDS.length);
    expect(DRAWING_TOOLS).toHaveLength(DRAW_KINDS.length);

    for (const group of DRAWING_TOOL_GROUPS) {
      expect(group.iconPath.length).toBeGreaterThan(0);
      expect(group.tools.length).toBeGreaterThan(0);
      for (const tool of group.tools) {
        expect(tool.iconPath.length).toBeGreaterThan(0);
        expect(tool.label.length).toBeGreaterThan(0);
        expect(DRAWING_TOOL_BY_ID[tool.id].groupId).toBe(group.id);
      }
    }
  });

  it("exposes creation cardinality as reusable sets", () => {
    expect([...SINGLE_POINT_DRAWING_KINDS].sort()).toEqual(
      ["crossline", "hline", "horizontalray", "text", "vline"],
    );
    expect([...TWO_POINT_DRAWING_KINDS].sort()).toEqual(
      ["arrow", "daterange", "ellipse", "extendedline", "fib", "measure", "pricerange", "ray", "rect", "trendline"],
    );
    expect([...MULTI_POINT_DRAWING_KINDS].sort()).toEqual(
      ["channel", "longposition", "shortposition", "triangle", "xabcd"],
    );
    expect(DRAWING_TOOL_BY_ID.path.creation).toMatchObject({
      gesture: "drag",
      pointCount: "variable",
      minPoints: 2,
      maxPoints: 64,
      finish: "pointerup",
    });
    expect(DRAWING_TOOL_BY_ID.xabcd.creation.pointCount).toBe(5);
  });

  it("derives styling and semantic capability sets", () => {
    expect([...EXTENDABLE_DRAWING_KINDS].sort()).toEqual(["extendedline", "horizontalray", "ray"]);
    expect([...FILLABLE_DRAWING_KINDS].sort()).toEqual(
      ["channel", "daterange", "ellipse", "fib", "longposition", "measure", "pricerange", "rect", "shortposition", "triangle"],
    );
    expect([...MEASUREMENT_DRAWING_KINDS].sort()).toEqual(
      ["daterange", "longposition", "measure", "pricerange", "shortposition"],
    );
    expect(drawingToolSupports("rect", "fill")).toBe(true);
    expect(drawingToolSupports("trendline", "fill")).toBe(false);
  });

  it("provides safe lookup/type guards", () => {
    expect(isDrawingToolId("channel")).toBe(true);
    expect(isDrawingToolId("brush")).toBe(false);
    expect(getDrawingTool("channel")?.label).toBe("Parallel Channel");
    expect(getDrawingTool(null)).toBeUndefined();
  });
});

describe("interactive drawing normalization", () => {
  it("structurally shares untouched drawings and style-only anchor arrays", () => {
    const raw = Array.from({ length: 3 }, (_, index) => ({
      id: `path-${index}`,
      kind: "path",
      source: "user",
      color: "#4d82ff",
      points: Array.from({ length: 64 }, (__, point) => ({ t: String(point), p: point + index })),
    }));
    const previous = normalizeDrawings(raw);
    const incoming = [previous[0], { ...previous[1], color: "#f0566b" }, previous[2]];
    const next = normalizeDrawingUpdate(incoming, previous);

    expect(next[0]).toBe(previous[0]);
    expect(next[2]).toBe(previous[2]);
    expect(next[1]).not.toBe(previous[1]);
    expect(next[1].points).toBe(previous[1].points);
    expect(next[1].color).toBe("#f0566b");
  });

  it("rejects an over-cap update without evicting an existing drawing", () => {
    const previous = normalizeDrawings(Array.from({ length: MAX_DRAWINGS_PER_SYMBOL + 1 }, (_, index) => ({
      id: `line-${index}`,
      kind: "hline",
      points: [{ t: "2026-01-01", p: index }],
    })));
    const accepted = previous.slice(0, MAX_DRAWINGS_PER_SYMBOL);
    const next = normalizeDrawingUpdate(previous, accepted);
    expect(next).toBe(accepted);
    expect(next).toHaveLength(MAX_DRAWINGS_PER_SYMBOL);
    expect(next[0].id).toBe("line-0");
  });
});

describe("drawing shortcuts", () => {
  it("keeps the six existing advertised shortcuts in the canonical registry", () => {
    expect(DRAWING_SHORTCUT_BY_CODE).toEqual({
      KeyT: "trendline",
      KeyH: "hline",
      KeyV: "vline",
      KeyR: "rect",
      KeyX: "text",
      KeyM: "measure",
    });
  });

  it("requires the exact modifier chord", () => {
    expect(drawingToolFromShortcut({ code: "KeyT", altKey: true })).toBe("trendline");
    expect(drawingToolFromShortcut({ code: "KeyT" })).toBeNull();
    expect(drawingToolFromShortcut({ code: "KeyT", altKey: true, shiftKey: true })).toBeNull();
    expect(drawingToolFromShortcut({ code: "KeyA", altKey: true })).toBeNull();
  });
});

describe("drawing normalization and migration", () => {
  it("migrates a legacy manual drawing without losing style or coordinates", () => {
    const normalized = normalizeDrawing({
      id: " legacy ",
      kind: "trendline",
      points: [{ t: 1_700_000_000, p: 100 }, { t: "1700000060", p: 101 }],
      color: " #22c55e ",
      width: 2,
      dash: "dashed",
    }, 7);

    expect(normalized).toEqual({
      id: "legacy",
      kind: "trendline",
      points: [{ t: "1700000000", p: 100 }, { t: "1700000060", p: 101 }],
      schemaVersion: DRAWING_SCHEMA_VERSION,
      source: "user",
      locked: false,
      hidden: false,
      z: 7,
      opacity: 1,
      extend: "none",
      color: "#22c55e",
      width: 2,
      dash: "dashed",
    });
  });

  it("maps legacy auto and AI conventions onto source while retaining auto compatibility", () => {
    expect(normalizeDrawing({
      id: "detected",
      kind: "hline",
      points: [{ t: "1", p: 10 }],
      auto: true,
    })).toMatchObject({ source: "detector", auto: true });

    expect(normalizeDrawing({
      id: "ai_42",
      kind: "text",
      points: [{ t: "1", p: 10 }],
      text: "AI note",
    })).toMatchObject({ source: "ai", auto: true });

    expect(normalizeDrawing({
      id: "ai-meta",
      kind: "hline",
      points: [{ t: "1", p: 10 }],
      meta: { by: "ai", confidence: 0.8 },
    })).toMatchObject({ source: "ai", auto: true, meta: { by: "ai", confidence: 0.8 } });
  });

  it("preserves new durable fields and constrains unsafe numeric style values", () => {
    expect(normalizeDrawing({
      id: "new-shape",
      kind: "extendedline",
      points: [{ t: "1", p: 10 }, { t: "2", p: 11 }],
      source: "user",
      locked: true,
      hidden: true,
      z: 3.9,
      fillColor: "#fff",
      fillOpacity: -2,
      opacity: 8,
      width: 100,
      fontSize: 3,
      extend: "not-valid",
    })).toMatchObject({
      schemaVersion: DRAWING_SCHEMA_VERSION,
      source: "user",
      locked: true,
      hidden: true,
      z: 3,
      fillColor: "#fff",
      fillOpacity: 0,
      opacity: 1,
      width: 20,
      fontSize: 8,
      extend: "both",
    });
  });

  it("filters malformed records and preserves collection order", () => {
    const normalized = normalizeDrawings([
      { id: "bad-kind", kind: "brush", points: [{ t: "1", p: 1 }] },
      { id: "first", kind: "horizontalray", points: [{ t: "2", p: 2 }] },
      { id: "bad-point", kind: "hline", points: [{ t: "", p: Number.NaN }] },
      { id: "second", kind: "rect", points: [{ t: "3", p: 3 }, { t: "4", p: 4 }], z: 99 },
    ]);

    expect(normalized.map((drawing) => drawing.id)).toEqual(["first", "second"]);
    expect(normalized.map((drawing) => drawing.z)).toEqual([1, 99]);
    expect(normalized[0].extend).toBe("right");
    expect(normalizeDrawings({})).toEqual([]);
  });
});
