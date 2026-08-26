import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { applyLayoutConfig, captureLayoutConfig, type LayoutWorkspace } from "../layoutConfig";
import { captureWorkspace, migrateLegacy, workspaceToLayout } from "../workspaceMigrate";
import { CHART_CONFIG_FIELDS, SCHEMA, validateEnvelope, type WorkspaceEnvelope } from "../workspaceLayout";

const FIXTURES_DIR = fileURLToPath(new URL("./fixtures/workspace/", import.meta.url));

type ValidVector = { input: unknown; expected: WorkspaceEnvelope };
const loadVector = (name: string): ValidVector => JSON.parse(readFileSync(`${FIXTURES_DIR}${name}`, "utf8"));

const VALID_VECTOR_FILES = [
  "legacy_v0_bare.json",
  "legacy_v0_minimal.json",
  "chart_layout_v1_sparse.json",
  "chart_layout_v1_typical.json",
  "chart_layout_v2_sparse.json",
  "chart_layout_v2_full.json",
];

/** A fully-populated baseline the "current" workspace supposedly held before a layout is applied.
 *  Every field is a value NO vector claims, so a claimed field surviving the round trip and an
 *  unclaimed field falling back to THIS exact value are unambiguous, distinguishable outcomes. */
const BASELINE: LayoutWorkspace = {
  panes: ["SPY"], paneTfs: ["1W"], split: 2, activePane: 0, sync: false,
  chartType: "line", inds: ["rsi14"], indParams: { rsi14: { period: 9 } },
  hidden: ["macd"], compare: ["QQQ"], compareCfg: { QQQ: { color: "red" } },
  lockedVLine: "baseline-marker",
};

describe("workspaceToLayout — conversion layer invents nothing", () => {
  // This is the direct, unambiguous half of the round-trip law: `workspaceToLayout` is a pure
  // read of the widget config into the existing `NormalizedLayout` claim shape. It must carry a
  // claimed field through EXACTLY as stored, and a field the envelope never claimed must come back
  // `null` (never a fabricated value) — checked BEFORE anything reaches `applyLayoutConfig`, whose
  // own (pre-existing, separately-tested) derived-default rules — e.g. an unclaimed `paneTfs`
  // defaulting to `"D"` per pane once `panes` IS claimed, or `compareCfg` being filtered down to the
  // claimed `compare` symbols — are a DIFFERENT, already-shipped law this packet does not re-litigate.
  it.each(VALID_VECTOR_FILES)("%s: NormalizedLayout carries every claim verbatim, nulls every absence", (file) => {
    const vector = loadVector(file);
    const chartWidget = vector.expected.widgets.find((w) => w.type === "chart");
    expect(chartWidget).toBeDefined();
    const claimedConfig = (chartWidget as { config: Record<string, unknown> }).config;
    const normalized = workspaceToLayout(vector.expected) as unknown as Record<string, unknown>;

    // No per-field CORRECTNESS exclusions anymore: Amendment A1 (2026-08-26, Macro commit
    // 8b4d326514f6) re-typed `lockedVLine` to `string | null` and `split` to the enum `{1,2,4}` —
    // both now match Terminal's real domain, so every field the vectors claim, including these
    // two, is expected to survive verbatim. (Pre-amendment, `lockedVLine`/`split` needed dedicated
    // KNOWN GAP tests — see the ALIGNED tests directly below, which now assert the corrected
    // behavior instead.)
    //
    // `lockedVLine`'s ABSENT-value sentinel is still special-cased here, but that is pre-existing,
    // unrelated `layoutConfig.ts` semantics, not an Amendment A1 artifact: `NormalizedLayout`
    // deliberately distinguishes "no claim" (`undefined`) from "explicitly cleared" (`null`) ONLY
    // for `lockedVLine` (see that file's `_INVALID`-sentinel-adjacent comment) — every other field
    // collapses "no claim" to `null` outright. `workspaceToLayout` mirrors that existing contract
    // rather than reinventing it.
    for (const field of CHART_CONFIG_FIELDS) {
      if (field in claimedConfig) {
        expect(normalized[field], `${file}: claimed field ${field}`).toEqual(claimedConfig[field]);
      } else if (field === "lockedVLine") {
        expect(normalized[field], `${file}: unclaimed lockedVLine must be undefined (no claim), not invented`).toBeUndefined();
      } else {
        expect(normalized[field], `${file}: unclaimed field ${field} must be null, never invented`).toBeNull();
      }
    }
  });

  it("ALIGNED (Amendment A1, was a KNOWN GAP): a string lockedVLine claim now survives workspaceToLayout as a real claim", () => {
    const vector = loadVector("chart_layout_v2_full.json");
    const chartWidget = vector.expected.widgets.find((w) => w.type === "chart") as { config: Record<string, unknown> };
    // Pre-amendment this vector claimed `lockedVLine: 1700000000` (a number) and NormalizedLayout
    // came back `undefined` (no claim) — the exact KNOWN GAP this worker flagged. Amendment A1
    // regenerated the vector with a realistic runtime value; the SAME `workspaceToLayout` code,
    // unchanged, now carries it through because the value is finally the type Terminal actually uses.
    expect(chartWidget.config.lockedVLine).toBe("2026-08-12T14:30:00Z");
    const normalized = workspaceToLayout(vector.expected);
    expect(normalized.lockedVLine).toBe("2026-08-12T14:30:00Z");
  });

  it("ALIGNED (Amendment A1, was a KNOWN GAP): a split claim within Terminal's real domain survives the full apply-then-capture pipeline unchanged", () => {
    const vector = loadVector("chart_layout_v2_full.json");
    const chartWidget = vector.expected.widgets.find((w) => w.type === "chart") as { config: Record<string, unknown> };
    // Pre-amendment this vector claimed `split: 50` (outside Terminal's {1,2,4} domain) and the
    // EXISTING `captureLayoutConfig` law silently corrected it downstream to `splitForPanes(4)`=4.
    // Amendment A1 regenerated the vector with `split: 2` (a value VALID_SPLITS actually contains),
    // so the full pipeline — unchanged code on both sides — now preserves it exactly.
    expect(chartWidget.config.split).toBe(2);
    const normalized = workspaceToLayout(vector.expected);
    expect(normalized.split).toBe(2);

    const applied = applyLayoutConfig(normalized, BASELINE);
    const recaptured = captureLayoutConfig(applied);
    expect(recaptured.split).toBe(2); // no correction needed — 2 was already in Terminal's domain
  });
});

describe("workspaceToLayout / applyLayoutConfig / captureLayoutConfig — apply-then-capture round trip", () => {
  // A hand-built envelope whose claimed values are all WITHIN Terminal's real domain (split ∈
  // {1,2,4}, lockedVLine as the string Terminal actually uses) — unlike chart_layout_v2_full.json
  // above, nothing here should be corrected downstream, so an exact-equality round trip is a fair,
  // meaningful proof of the full pipeline rather than the vector-set's two documented gaps.
  it("every claimed field survives verbatim through apply-then-capture; every unclaimed field takes the baseline", () => {
    const envelope: WorkspaceEnvelope = {
      schema: SCHEMA, requires: { floor: 1 }, revision: 7, name: null,
      link_groups: { primary_security: { entity_type: "security" } },
      widgets: [{
        id: "chart-main", type: "chart", semantic_lane: "primary",
        context_in: ["primary_security"], context_out: ["primary_security"],
        config: { panes: ["NVDA", "AMD"], split: 2, chartType: "candles", lockedVLine: "claimed-marker" },
      }],
      migration: { source: "none", source_revision: null },
    };

    const normalized = workspaceToLayout(envelope);
    const applied = applyLayoutConfig(normalized, BASELINE);
    const recaptured = captureLayoutConfig(applied) as unknown as Record<string, unknown>;

    expect(recaptured.panes).toEqual(["NVDA", "AMD"]);
    expect(recaptured.split).toBe(2);
    expect(recaptured.chartType).toBe("candles");
    expect(recaptured.lockedVLine).toBe("claimed-marker");
    // Unclaimed `sync`/`activePane` fall back to the baseline (never invented) — the fields NOT
    // entangled with the `panes`/`compare` derivation rules documented above.
    expect(recaptured.sync).toBe(BASELINE.sync);
    expect(recaptured.activePane).toBe(BASELINE.activePane);
  });

  it("a workspace with no chart widget at all normalizes to an all-absent claim (never throws)", () => {
    const envelope: WorkspaceEnvelope = {
      schema: SCHEMA, requires: { floor: 1 }, revision: 1, name: null,
      link_groups: {}, widgets: [{ id: "brain-dock", type: "brain", semantic_lane: "dock", context_in: [], context_out: [], config: {} }],
      migration: { source: "none", source_revision: null },
    };
    const normalized = workspaceToLayout(envelope);
    for (const field of CHART_CONFIG_FIELDS) {
      expect((normalized as unknown as Record<string, unknown>)[field] ?? null).toBeNull();
    }
  });
});

describe("captureWorkspace", () => {
  it("includes the brain widget iff brainIncluded is true", () => {
    const withBrain = captureWorkspace({ layout: BASELINE, brainIncluded: true });
    const withoutBrain = captureWorkspace({ layout: BASELINE, brainIncluded: false });
    expect(withBrain.widgets.some((w) => w.type === "brain")).toBe(true);
    expect(withoutBrain.widgets.some((w) => w.type === "brain")).toBe(false);
  });

  it("a brand-new capture (no prior) uses the conventional ids, floor/schema, and migration.source=none", () => {
    const envelope = captureWorkspace({ layout: BASELINE, brainIncluded: true });
    expect(envelope.schema).toBe(SCHEMA);
    expect(envelope.requires).toEqual({ floor: 1 });
    expect(envelope.name).toBeNull();
    expect(envelope.revision).toBe(1);
    expect(envelope.widgets.find((w) => w.type === "chart")?.id).toBe("chart-main");
    expect(envelope.widgets.find((w) => w.type === "brain")?.id).toBe("brain-dock");
    expect(envelope.migration).toEqual({ source: "none", source_revision: null });
    expect(validateEnvelope(envelope)).toEqual({ ok: true, errors: [] });
  });

  it("preserves prior widget ids and migration provenance when saving over an existing workspace", () => {
    const prior: WorkspaceEnvelope = {
      schema: SCHEMA, requires: { floor: 1 }, revision: 5, name: null,
      link_groups: { primary_security: { entity_type: "security" } },
      widgets: [
        { id: "custom-chart-id", type: "chart", semantic_lane: "primary", context_in: ["primary_security"], context_out: ["primary_security"], config: {} },
        { id: "custom-brain-id", type: "brain", semantic_lane: "dock", context_in: ["primary_security"], context_out: [], config: {} },
      ],
      migration: { source: "chart_layout_v2", source_revision: 2 },
    };
    const envelope = captureWorkspace({ layout: BASELINE, brainIncluded: true, prior });
    expect(envelope.widgets.find((w) => w.type === "chart")?.id).toBe("custom-chart-id");
    expect(envelope.widgets.find((w) => w.type === "brain")?.id).toBe("custom-brain-id");
    expect(envelope.migration).toEqual({ source: "chart_layout_v2", source_revision: 2 });
    expect(validateEnvelope(envelope)).toEqual({ ok: true, errors: [] });
  });

  it("never invents a phantom brain widget when re-saving without the dock, even with a brain-bearing prior", () => {
    const prior: WorkspaceEnvelope = {
      schema: SCHEMA, requires: { floor: 1 }, revision: 2, name: null,
      link_groups: { primary_security: { entity_type: "security" } },
      widgets: [
        { id: "chart-main", type: "chart", semantic_lane: "primary", context_in: ["primary_security"], context_out: ["primary_security"], config: {} },
        { id: "brain-dock", type: "brain", semantic_lane: "dock", context_in: ["primary_security"], context_out: [], config: {} },
      ],
      migration: { source: "none", source_revision: null },
    };
    const envelope = captureWorkspace({ layout: BASELINE, brainIncluded: false, prior });
    expect(envelope.widgets.some((w) => w.type === "brain")).toBe(false);
    expect(envelope.widgets).toHaveLength(1);
  });

  it("captures a fully-populated baseline into a valid, correctly-typed chart config", () => {
    const envelope = captureWorkspace({ layout: BASELINE, brainIncluded: false });
    const chart = envelope.widgets.find((w) => w.type === "chart") as { config: Record<string, unknown> };
    expect(chart.config.panes).toEqual(["SPY"]);
    expect(chart.config.compare).toEqual(["QQQ"]);
    expect(validateEnvelope(envelope)).toEqual({ ok: true, errors: [] });
  });
});

describe("migrateLegacy — direct sanity checks beyond the golden vectors", () => {
  it("never throws on a non-object input", () => {
    for (const hostile of [null, undefined, "x", 1, [], true]) {
      expect(() => migrateLegacy(hostile)).not.toThrow();
      expect(migrateLegacy(hostile).ok).toBe(false);
    }
  });

  it("is idempotent on an already-canonical workspace envelope (row 3 pass-through)", () => {
    const envelope: WorkspaceEnvelope = {
      schema: SCHEMA, requires: { floor: 1 }, revision: 4, name: null,
      link_groups: { primary_security: { entity_type: "security" } },
      widgets: [{ id: "chart-main", type: "chart", semantic_lane: "primary", context_in: ["primary_security"], context_out: ["primary_security"], config: { panes: ["AAPL"] } }],
      migration: { source: "none", source_revision: null },
    };
    const result = migrateLegacy(envelope);
    expect(result).toEqual({ ok: true, envelope });
  });
});
