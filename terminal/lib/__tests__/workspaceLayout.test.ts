import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CHART_CONFIG_FIELDS, ENTITY_TYPES, FAILURE_CODES, FLOOR_SUPPORTED, MAX_ENVELOPE_BYTES,
  MAX_LINK_GROUPS, MAX_PORTS, MAX_WIDGETS, MIGRATION_SOURCES, SCHEMA, SEMANTIC_LANES, WIDGET_TYPES,
  envelopeDigest, isWorkspaceEnvelope, rowStateFor, validateEnvelope,
} from "../workspaceLayout";

// A minimal, valid `workspace_layout.v1` envelope (chart-main + brain-dock, the frozen §7 proof
// pair). Every test below mutates a clone of this rather than re-deriving the shape.
function validEnvelope(): Record<string, unknown> {
  return {
    schema: SCHEMA,
    requires: { floor: 1 },
    revision: 1,
    name: null,
    link_groups: { primary_security: { entity_type: "security" } },
    widgets: [
      {
        id: "chart-main", type: "chart", semantic_lane: "primary",
        context_in: ["primary_security"], context_out: ["primary_security"],
        config: { panes: ["NVDA"], sync: true },
      },
      {
        id: "brain-dock", type: "brain", semantic_lane: "dock",
        context_in: ["primary_security"], context_out: [],
        config: {},
      },
    ],
    migration: { source: "none", source_revision: null },
  };
}

describe("frozen vocabularies — shape and cardinality (contract §1-§8)", () => {
  it("widget/lane/entity/migration vocabularies match the frozen list", () => {
    expect(WIDGET_TYPES).toEqual(["chart", "brain"]);
    expect(SEMANTIC_LANES).toEqual(["primary", "secondary", "rail", "dock"]);
    expect(ENTITY_TYPES).toEqual(["security", "industry", "theme", "portfolio", "event"]);
    expect(MIGRATION_SOURCES).toEqual(["legacy_v0", "chart_layout_v1", "chart_layout_v2", "none", "import"]);
  });

  it("exactly 16 failure codes, no more, no fewer", () => {
    expect(FAILURE_CODES).toHaveLength(16);
    expect(new Set(FAILURE_CODES).size).toBe(16);
  });

  it("frozen limits", () => {
    expect(MAX_WIDGETS).toBe(12);
    expect(MAX_ENVELOPE_BYTES).toBe(65536);
    expect(MAX_LINK_GROUPS).toBe(8);
    expect(MAX_PORTS).toBe(8);
    expect(FLOOR_SUPPORTED).toBe(1);
  });

  it("the 12 chart-config fields", () => {
    expect(CHART_CONFIG_FIELDS).toEqual([
      "panes", "paneTfs", "split", "activePane", "sync", "chartType",
      "inds", "indParams", "hidden", "compare", "compareCfg", "lockedVLine",
    ]);
  });
});

describe("validateEnvelope — accepts the canonical shape", () => {
  it("accepts the frozen §1 worked example verbatim", () => {
    const envelope = {
      schema: "workspace_layout.v1",
      requires: { floor: 1 },
      revision: 3,
      name: null,
      link_groups: { primary_security: { entity_type: "security" } },
      widgets: [
        {
          id: "chart-main", type: "chart", semantic_lane: "primary",
          grid: { x: 0, y: 0, w: 16, h: 18 },
          context_in: ["primary_security"], context_out: ["primary_security"],
          config: {
            panes: ["NVDA"], paneTfs: ["1D"], split: 50, activePane: 0,
            sync: true, chartType: "candles", inds: ["ema21"],
            indParams: {}, hidden: [], compare: [], compareCfg: {},
            lockedVLine: null,
          },
        },
        {
          id: "brain-dock", type: "brain", semantic_lane: "dock",
          context_in: ["primary_security"], context_out: [],
          config: {},
        },
      ],
      migration: { source: "chart_layout_v2", source_revision: 2 },
    };
    expect(validateEnvelope(envelope)).toEqual({ ok: true, errors: [] });
  });

  it("accepts secondary/rail lanes (valid-but-unconsumed in W2-A, contract §2)", () => {
    const e = validEnvelope();
    (e.widgets as Record<string, unknown>[])[1].semantic_lane = "rail";
    expect(validateEnvelope(e).ok).toBe(true);
  });

  it("accepts an optional grid within bounds", () => {
    const e = validEnvelope();
    (e.widgets as Record<string, unknown>[])[0].grid = { x: 0, y: 0, w: 64, h: 64 };
    expect(validateEnvelope(e).ok).toBe(true);
  });
});

describe("validateEnvelope — rejects with the frozen codes (cross-field laws)", () => {
  it("duplicate widget id", () => {
    const e = validEnvelope();
    (e.widgets as Record<string, unknown>[])[1].id = "chart-main";
    const r = validateEnvelope(e);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.errors.some((x) => x.code === "duplicate_widget_id")).toBe(true);
  });

  it("undeclared port ref", () => {
    const e = validEnvelope();
    (e.widgets as Record<string, unknown>[])[0].context_in = ["no_such_group"];
    const r = validateEnvelope(e);
    expect(!r.ok && r.errors.some((x) => x.code === "invalid_port")).toBe(true);
  });

  it("stored name must be null", () => {
    const e = validEnvelope();
    e.name = "My Workspace";
    const r = validateEnvelope(e);
    expect(!r.ok && r.errors.some((x) => x.code === "malformed_workspace" && x.path === "$.name")).toBe(true);
  });

  it("unsupported floor", () => {
    const e = validEnvelope();
    e.requires = { floor: 2 };
    const r = validateEnvelope(e);
    expect(!r.ok && r.errors.some((x) => x.code === "unsupported_floor")).toBe(true);
  });

  it("wrong schema literal", () => {
    const e = validEnvelope();
    e.schema = "workspace_layout.v2";
    const r = validateEnvelope(e);
    expect(!r.ok && r.errors[0].code).toBe("unsupported_schema");
  });

  it("closed shapes — unknown top-level key", () => {
    const e = validEnvelope();
    e.extra = "nope";
    const r = validateEnvelope(e);
    expect(!r.ok && r.errors.some((x) => x.code === "malformed_workspace")).toBe(true);
  });

  it("closed shapes — unknown widget key", () => {
    const e = validEnvelope();
    (e.widgets as Record<string, unknown>[])[0].extra = "nope";
    const r = validateEnvelope(e);
    expect(!r.ok && r.errors.some((x) => x.code === "invalid_widget_config")).toBe(true);
  });

  it("closed shapes — unknown chart config key", () => {
    const e = validEnvelope();
    ((e.widgets as Record<string, unknown>[])[0].config as Record<string, unknown>).zzz = 1;
    const r = validateEnvelope(e);
    expect(!r.ok && r.errors.some((x) => x.code === "invalid_widget_config")).toBe(true);
  });

  it("brain config must be exactly {}", () => {
    const e = validEnvelope();
    (e.widgets as Record<string, unknown>[])[1].config = { anything: 1 };
    const r = validateEnvelope(e);
    expect(!r.ok && r.errors.some((x) => x.code === "invalid_widget_config")).toBe(true);
  });

  it("too many widgets", () => {
    const e = validEnvelope();
    const widgets = e.widgets as Record<string, unknown>[];
    for (let i = 0; i < 11; i++) {
      widgets.push({ id: `extra-${i}`, type: "brain", semantic_lane: "dock", context_in: [], context_out: [], config: {} });
    }
    expect(widgets.length).toBe(13);
    const r = validateEnvelope(e);
    expect(!r.ok && r.errors[0].code).toBe("too_many_widgets");
  });

  it("zero widgets", () => {
    const e = validEnvelope();
    e.widgets = [];
    const r = validateEnvelope(e);
    expect(!r.ok && r.errors.some((x) => x.code === "malformed_workspace")).toBe(true);
  });

  it("unknown widget type", () => {
    const e = validEnvelope();
    (e.widgets as Record<string, unknown>[])[0].type = "table";
    const r = validateEnvelope(e);
    expect(!r.ok && r.errors.some((x) => x.code === "unknown_widget_type")).toBe(true);
  });

  it("invalid lane", () => {
    const e = validEnvelope();
    (e.widgets as Record<string, unknown>[])[0].semantic_lane = "primaryy";
    const r = validateEnvelope(e);
    expect(!r.ok && r.errors.some((x) => x.code === "invalid_lane")).toBe(true);
  });

  it("oversized workspace", () => {
    // Reuse the digest-pinned golden vector's own oversized `compareCfg` construction (32 symbols x
    // 16 params x 64-char values, ~106KB serialized) rather than re-deriving the byte count by hand.
    const fixture = JSON.parse(
      readFileSync(new URL("./fixtures/workspace/invalid_oversized_workspace.json", import.meta.url), "utf8"),
    ) as { input: Record<string, unknown> };
    const r = validateEnvelope(fixture.input);
    expect(!r.ok && r.errors.some((x) => x.code === "oversized_workspace")).toBe(true);
  });

  it("too many link_groups", () => {
    const e = validEnvelope();
    const groups: Record<string, unknown> = {};
    for (let i = 0; i < 9; i++) groups[`g${i}`] = { entity_type: "security" };
    e.link_groups = groups;
    const r = validateEnvelope(e);
    expect(r.ok).toBe(false);
  });
});

describe("validateEnvelope — hostile fuzz (never throws, always fails closed)", () => {
  const hostiles: unknown[] = [
    null, undefined, [], 1, "string", true, () => {}, Symbol("x"),
    { schema: "workspace_layout.v1" },
    { schema: "workspace_layout.v1", widgets: "not-an-array" },
    { schema: "workspace_layout.v1", widgets: [null, 1, "x", [], {}] },
  ];

  // A genuinely deep nesting bomb — proves no stack overflow / no throw on recursive structures.
  function nestedBomb(depth: number): unknown {
    let node: unknown = { leaf: true };
    for (let i = 0; i < depth; i++) node = { child: node };
    return node;
  }

  it.each(hostiles.map((h, i) => [i, h] as const))("hostile input #%i never throws", (_i, hostile) => {
    expect(() => validateEnvelope(hostile)).not.toThrow();
    const r = validateEnvelope(hostile);
    expect(r.ok).toBe(false);
  });

  it("a deeply nested bomb never throws and fails closed", () => {
    const bomb = nestedBomb(5000);
    expect(() => validateEnvelope(bomb)).not.toThrow();
    expect(validateEnvelope(bomb).ok).toBe(false);
  });

  it("a hostile widget config never throws", () => {
    const e = validEnvelope();
    (e.widgets as Record<string, unknown>[])[0].config = nestedBomb(500);
    expect(() => validateEnvelope(e)).not.toThrow();
  });

  it("unknown migration.source never throws and fails closed", () => {
    const e = validEnvelope();
    e.migration = { source: "from_the_future", source_revision: null };
    expect(() => validateEnvelope(e)).not.toThrow();
    expect(validateEnvelope(e).ok).toBe(false);
  });

  it("non-integer revision never throws and fails closed", () => {
    const e = validEnvelope();
    for (const bad of [1.5, "3", null, -1, 0, NaN, Infinity]) {
      e.revision = bad;
      expect(() => validateEnvelope(e)).not.toThrow();
      expect(validateEnvelope(e).ok).toBe(false);
    }
  });
});

describe("isWorkspaceEnvelope", () => {
  it("recognizes a valid canonical envelope", () => {
    expect(isWorkspaceEnvelope(validEnvelope())).toBe(true);
  });

  it("rejects a non-workspace config without throwing", () => {
    expect(isWorkspaceEnvelope({ schemaVersion: 2, panes: ["AAPL"] })).toBe(false);
    expect(isWorkspaceEnvelope(null)).toBe(false);
    expect(isWorkspaceEnvelope("nope")).toBe(false);
  });

  it("rejects a same-schema-tagged but structurally invalid payload", () => {
    const e = validEnvelope();
    e.revision = -1;
    expect(isWorkspaceEnvelope(e)).toBe(false);
  });
});

describe("rowStateFor — library row read state (contract §8/§9)", () => {
  it("ok for a valid envelope", () => {
    expect(rowStateFor(validEnvelope())).toBe("ok");
  });

  it("unsupported_floor for a floor above what this build supports", () => {
    const e = validEnvelope();
    e.requires = { floor: 2 };
    expect(rowStateFor(e)).toBe("unsupported_floor");
  });

  it("unsupported_schema for a non-workspace config", () => {
    expect(rowStateFor({ schemaVersion: 2, panes: ["AAPL"] })).toBe("unsupported_schema");
    expect(rowStateFor(null)).toBe("unsupported_schema");
    expect(rowStateFor("garbage")).toBe("unsupported_schema");
  });

  it("unsupported_schema (never crashes) for a structurally broken workspace-tagged payload", () => {
    const e = validEnvelope();
    e.widgets = "not-an-array";
    expect(() => rowStateFor(e)).not.toThrow();
    expect(rowStateFor(e)).toBe("unsupported_schema");
  });

  it("never renders a failure state as ok — a row is never silently healthy", () => {
    const brokenOnes = [
      { ...validEnvelope(), revision: -1 },
      { ...validEnvelope(), name: "not null" },
    ];
    for (const b of brokenOnes) expect(rowStateFor(b)).not.toBe("ok");
  });
});

describe("envelopeDigest", () => {
  it("is deterministic and key-order independent", () => {
    const a = { b: 1, a: 2 };
    const b = { a: 2, b: 1 };
    expect(envelopeDigest(a)).toBe(envelopeDigest(b));
    expect(envelopeDigest(a)).toBe(envelopeDigest(a));
  });

  it("never throws on hostile input and always returns a 64-char hex string", () => {
    for (const hostile of [null, undefined, [], 1, "x", validEnvelope()]) {
      let digest: string | undefined;
      expect(() => { digest = envelopeDigest(hostile); }).not.toThrow();
      expect(digest).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("differs for a materially different envelope", () => {
    const a = validEnvelope();
    const b = validEnvelope();
    b.revision = 999;
    expect(envelopeDigest(a)).not.toBe(envelopeDigest(b));
  });
});
