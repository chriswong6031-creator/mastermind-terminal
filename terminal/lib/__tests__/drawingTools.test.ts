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
  FREEHAND_DRAWING_KINDS,
  MEASUREMENT_DRAWING_KINDS,
  MULTI_POINT_DRAWING_KINDS,
  SINGLE_POINT_DRAWING_KINDS,
  TWO_POINT_DRAWING_KINDS,
  drawingToolAcceptsPersistedPointCount,
  drawingToolFromShortcut,
  drawingToolSupports,
  getDrawingTool,
  isDrawingToolId,
} from "@/lib/drawingTools";

describe("drawing tool registry", () => {
  it("is the exact 99-tool, nine-group documented universe", () => {
    expect(DRAWING_TOOL_GROUPS.map((group) => [group.id, group.tools.length])).toEqual([
      ["lines", 17],
      ["fibonacci", 15],
      ["patterns", 14],
      ["forecasting", 12],
      ["freehand", 3],
      ["shapes", 9],
      ["arrows", 17],
      ["annotation", 10],
      ["emoji", 2],
    ]);
    expect(DRAWING_TOOL_GROUPS).toHaveLength(9);
    expect(DRAWING_TOOLS).toHaveLength(99);
    expect(DRAW_KINDS).toHaveLength(99);
  });

  it("covers every durable DrawKind exactly once", () => {
    expect([...DRAWING_TOOL_IDS].sort()).toEqual([...DRAW_KINDS].sort());
    expect(new Set(DRAWING_TOOL_IDS).size).toBe(DRAWING_TOOL_IDS.length);
    expect(new Set(DRAW_KINDS).size).toBe(DRAW_KINDS.length);
    expect(DRAWING_TOOLS).toHaveLength(DRAW_KINDS.length);

    for (const group of DRAWING_TOOL_GROUPS) {
      expect(group.iconPath.length).toBeGreaterThan(0);
      expect(group.label.length).toBeGreaterThan(0);
      expect(group.labelKey.length).toBeGreaterThan(0);
      expect(group.tools.length).toBeGreaterThan(0);
      for (const tool of group.tools) {
        expect(tool.iconPath.length).toBeGreaterThan(0);
        expect(tool.label.length).toBeGreaterThan(0);
        expect(tool.labelKey.length).toBeGreaterThan(0);
        expect(tool.section.length).toBeGreaterThan(0);
        expect(tool.sectionKey.length).toBeGreaterThan(0);
        expect(tool.capabilities.length).toBeGreaterThan(0);
        expect(tool.defaults.color.length).toBeGreaterThan(0);
        expect(tool.defaults.width).toBeGreaterThan(0);
        expect(["solid", "dashed", "dotted"]).toContain(tool.defaults.dash);
        expect(tool.defaults.opacity).toBeGreaterThanOrEqual(0);
        expect(tool.defaults.opacity).toBeLessThanOrEqual(1);
        expect(DRAWING_TOOL_BY_ID[tool.id].groupId).toBe(group.id);
      }
    }
  });

  it("declares valid one/two/fixed/variable/freehand creation contracts", () => {
    expect(
      SINGLE_POINT_DRAWING_KINDS.size
      + TWO_POINT_DRAWING_KINDS.size
      + MULTI_POINT_DRAWING_KINDS.size
      + FREEHAND_DRAWING_KINDS.size,
    ).toBe(99);

    for (const tool of DRAWING_TOOLS) {
      const { creation } = tool;
      expect(creation.minPoints).toBeGreaterThan(0);
      expect(creation.maxPoints).toBeGreaterThanOrEqual(creation.minPoints);
      if (typeof creation.pointCount === "number") {
        expect(creation.minPoints).toBe(creation.pointCount);
        expect(creation.maxPoints).toBe(creation.pointCount);
      } else {
        expect(creation.maxPoints).toBeGreaterThan(creation.minPoints);
      }
      if (creation.mode === "one-point") {
        expect(creation).toMatchObject({ gesture: "point", pointCount: 1, finish: "immediate" });
      } else if (creation.mode === "two-point") {
        expect(creation).toMatchObject({ gesture: "drag", pointCount: 2, finish: "pointerup" });
      } else if (creation.mode === "fixed-multi") {
        expect(creation).toMatchObject({ gesture: "multi-click", finish: "immediate" });
      } else if (creation.mode === "variable-multi") {
        expect(creation).toMatchObject({ gesture: "multi-click", pointCount: "variable", finish: "double-click" });
      } else {
        expect(creation).toMatchObject({ mode: "freehand", gesture: "drag", pointCount: "variable", finish: "pointerup" });
      }
      if (creation.semanticPointCount !== undefined) {
        expect(creation.semanticPointCount).toBeGreaterThanOrEqual(creation.minPoints);
      }
    }

    expect([...FREEHAND_DRAWING_KINDS].sort()).toEqual(["brush", "highlighter"]);
    expect(DRAWING_TOOL_BY_ID.path.creation).toMatchObject({
      mode: "variable-multi",
      gesture: "multi-click",
      pointCount: "variable",
      minPoints: 2,
      maxPoints: 64,
      finish: "double-click",
    });
    expect(DRAWING_TOOL_BY_ID.polyline.creation.mode).toBe("variable-multi");
    expect(DRAWING_TOOL_BY_ID.arrowmarker.creation.mode).toBe("one-point");
    expect(DRAWING_TOOL_BY_ID.ellipse.creation.pointCount).toBe(3);
    expect(DRAWING_TOOL_BY_ID.image.creation.pointCount).toBe(2);
    expect(DRAWING_TOOL_BY_ID.longposition.creation).toMatchObject({
      mode: "two-point",
      pointCount: 2,
      semanticPointCount: 3,
    });
    expect(DRAWING_TOOL_BY_ID.shortposition.creation.semanticPointCount).toBe(3);
    expect(DRAWING_TOOL_BY_ID.burj.creation.semanticPointCount).toBe(3);
    expect(DRAWING_TOOL_BY_ID.xabcd.creation.pointCount).toBe(5);
    expect(DRAWING_TOOL_BY_ID.headandshoulders.creation.pointCount).toBe(7);
  });

  it("accepts materialized semantic handles in the durable point array", () => {
    const semanticTools = DRAWING_TOOLS
      .filter((tool) => tool.creation.semanticPointCount !== undefined)
      .map((tool) => [tool.id, tool.creation.semanticPointCount] as const);

    expect(Object.fromEntries(semanticTools)).toEqual({
      longposition: 3,
      shortposition: 3,
      curve: 3,
      doublecurve: 4,
      divergence: 4,
      journey: 6,
      fork: 5,
      threepaths: 5,
      burj: 3,
    });

    for (const [kind, semanticPointCount] of semanticTools) {
      expect(semanticPointCount).toBeGreaterThan(DRAWING_TOOL_BY_ID[kind].creation.maxPoints);
      expect(drawingToolAcceptsPersistedPointCount(kind, semanticPointCount!)).toBe(true);
      expect(drawingToolAcceptsPersistedPointCount(kind, semanticPointCount! + 1)).toBe(false);
    }

    expect(drawingToolAcceptsPersistedPointCount("trendline", 2)).toBe(true);
    expect(drawingToolAcceptsPersistedPointCount("trendline", 3)).toBe(false);
    expect(drawingToolAcceptsPersistedPointCount("not-a-tool", 2)).toBe(false);
  });

  it("derives styling and semantic capability sets", () => {
    expect([...EXTENDABLE_DRAWING_KINDS].sort()).toEqual(["extendedline", "horizontalray", "ray"]);
    expect(FILLABLE_DRAWING_KINDS.has("gannbox")).toBe(true);
    expect(FILLABLE_DRAWING_KINDS.has("rotatedrect")).toBe(true);
    expect(MEASUREMENT_DRAWING_KINDS.has("infoline")).toBe(true);
    expect(MEASUREMENT_DRAWING_KINDS.has("dateandpricerange")).toBe(true);
    expect(drawingToolSupports("rect", "fill")).toBe(true);
    expect(drawingToolSupports("trendline", "fill")).toBe(false);
    expect(DRAWING_TOOL_BY_ID.highlighter.defaults).toMatchObject({ width: 8, opacity: 0.28 });
    expect(DRAWING_TOOL_BY_ID.fib.defaults.dash).toBe("dashed");
  });

  it("separates editable copy from calculated labels and declares pane anchors", () => {
    expect(
      DRAWING_TOOLS.filter((tool) => tool.capabilities.includes("textInput")).map((tool) => tool.id),
    ).toEqual([
      "text", "anchoredtext", "note", "anchorednote", "callout",
      "pricenote", "signpost", "comment",
    ]);
    expect(DRAWING_TOOL_BY_ID.pricelabel.capabilities).not.toContain("textInput");
    expect(DRAWING_TOOL_BY_ID.anchoredvwap.capabilities).not.toContain("textInput");
    expect(DRAWING_TOOL_BY_ID.anchoredtext.creation.anchorSpace).toBe("pane");
    expect(DRAWING_TOOL_BY_ID.anchorednote.creation.anchorSpace).toBe("pane");
  });

  it("provides safe lookup/type guards", () => {
    expect(isDrawingToolId("channel")).toBe(true);
    expect(isDrawingToolId("brush")).toBe(true);
    expect(isDrawingToolId("not-a-tool")).toBe(false);
    expect(getDrawingTool("channel")?.label).toBe("Parallel Line");
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
  it("keeps existing bindings and adds the documented OpenMarket defaults", () => {
    expect(DRAWING_SHORTCUT_BY_CODE).toEqual({
      KeyT: "trendline",
      KeyJ: "ray",
      KeyH: "hline",
      KeyV: "vline",
      KeyC: "crossline",
      KeyF: "fib",
      KeyR: "rect",
      KeyX: "text",
      KeyN: "note",
      KeyM: "measure",
    });
  });

  it("requires the exact modifier chord", () => {
    expect(drawingToolFromShortcut({ code: "KeyT", altKey: true })).toBe("trendline");
    expect(drawingToolFromShortcut({ code: "KeyT" })).toBeNull();
    expect(drawingToolFromShortcut({ code: "KeyT", altKey: true, shiftKey: true })).toBeNull();
    expect(drawingToolFromShortcut({ code: "KeyR", altKey: true })).toBeNull();
    expect(drawingToolFromShortcut({ code: "KeyR", altKey: true, shiftKey: true })).toBe("rect");
    expect(drawingToolFromShortcut({ code: "KeyA", altKey: true })).toBeNull();
  });
});

describe("drawing normalization and migration", () => {
  it("continues to normalize every kind persisted before the 99-tool expansion", () => {
    const legacyKinds = [
      "trendline", "ray", "extendedline", "hline", "horizontalray", "vline", "crossline",
      "arrow", "channel", "rect", "ellipse", "triangle", "path", "fib", "xabcd", "text",
      "measure", "longposition", "shortposition", "pricerange", "daterange",
    ] as const;
    const normalized = normalizeDrawings(legacyKinds.map((kind, index) => ({
      id: `legacy-${kind}`,
      kind,
      points: [{ t: String(index + 1), p: index + 100 }],
    })));

    expect(normalized.map((drawing) => drawing.kind)).toEqual(legacyKinds);
    expect(normalized.find((drawing) => drawing.kind === "path")).toMatchObject({
      id: "legacy-path",
      kind: "path",
      points: [{ t: "13", p: 112 }],
    });
  });

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
      { id: "bad-kind", kind: "not-a-tool", points: [{ t: "1", p: 1 }] },
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
