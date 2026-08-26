// ── Deterministic legacy → `workspace_layout.v1` migration + runtime capture/apply bridge ──────
//
// Frozen contract: research/DEEPVUE_W2A_WORKSPACE_LAYOUT_CONTRACT_2026-08-26.md §6 (Macro repo).
// Reference implementation this module reproduces EXACTLY (byte-for-byte, digest-pinned):
// engine/intelligence_workspace/workspace_layout.py `migrate_legacy` (Macro repo). See
// `workspaceVectors.test.ts` for the golden-vector parity proof against
// `lib/__tests__/fixtures/workspace/*.json`.
//
// `workspaceToLayout`/`captureWorkspace` are the Terminal-side bridge to the EXISTING chart-layout
// contract (`lib/layoutConfig.ts`): a workspace's `chart` widget config IS a `NormalizedLayout`/
// `LayoutConfigV2` payload, one-for-one, so the chart pane grid keeps its current owner (contract
// §2/§7 — a workspace hosts widgets, it does not re-implement their state).

import {
  LAYOUT_SCHEMA_VERSION,
  captureLayoutConfig,
  type CompareCfgMap,
  type LayoutWorkspace,
  type NormalizedLayout,
  type ParamMap as LegacyParamMap,
} from "./layoutConfig";
import {
  CHART_CONFIG_FIELDS,
  CHART_FIELD_VALIDATORS,
  FLOOR_SUPPORTED,
  INVALID,
  SCHEMA,
  validateEnvelope,
  type ChartConfigField,
  type FailureCode,
  type MigrationProvenance,
  type MigrationSource,
  type Widget,
  type WorkspaceEnvelope,
} from "./workspaceLayout";

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export type MigrateResult =
  | { ok: true; envelope: WorkspaceEnvelope }
  | { ok: false; code: FailureCode };

/** Contract §6 recognizer table, rows 0-2. `null` when the shape is not one of the recognized
 *  legacy formats (row 4: fail-closed `unsupported_schema`, handled by the caller). */
function recognizeLegacy(config: Record<string, unknown>): { source: MigrationSource; sourceRevision: number | null } | null {
  const hasSchemaVersion = "schemaVersion" in config;
  const schemaVersion = config.schemaVersion;

  if ("active" in config && !hasSchemaVersion) return { source: "legacy_v0", sourceRevision: null };
  if ("panes" in config && (!hasSchemaVersion || schemaVersion === 1)) return { source: "chart_layout_v1", sourceRevision: 1 };
  if (hasSchemaVersion && schemaVersion === 2) return { source: "chart_layout_v2", sourceRevision: 2 };
  return null;
}

/**
 * Reference migration (contract §6): recognize an inbound legacy/native chart-layout shape and
 * produce the canonical `workspace_layout.v1` envelope, or a structured failure. Never throws.
 *
 * Claim semantics: ONLY present, correctly-typed chart fields enter the migrated widget config;
 * unclaimed fields are ABSENT (never null, never invented — this is why the "front half" is NOT a
 * blind delegation to `normalizeLayoutConfig`, whose read-boundary defaults *invent* `paneTfs`/
 * `split` for a bare `{active}` row; the Macro reference — and the digest-pinned golden vectors —
 * claim only what the legacy payload literally owned. See the module-level DEVIATIONS note in the
 * worker's final report.). `sync` defaults to `true` only when the source predates v2 AND `panes`
 * was claimed (verbatim contract rule) — v2 never gets an injected default.
 */
export function migrateLegacy(config: unknown): MigrateResult {
  if (!isRecord(config)) return { ok: false, code: "malformed_workspace" };

  if (config.schema === SCHEMA) {
    // Row 3: already-canonical — passes through validation unchanged.
    const result = validateEnvelope(config);
    if (result.ok) return { ok: true, envelope: { ...config } as WorkspaceEnvelope };
    return { ok: false, code: result.errors[0].code };
  }

  const recognized = recognizeLegacy(config);
  if (!recognized) return { ok: false, code: "unsupported_schema" };
  const { source, sourceRevision } = recognized;
  const version = source === "legacy_v0" ? 0 : source === "chart_layout_v1" ? 1 : 2;

  const claims: Record<string, unknown> = {};
  for (const field of CHART_CONFIG_FIELDS) {
    if (field in config) {
      const normalized = CHART_FIELD_VALIDATORS[field](config[field]);
      if (normalized !== INVALID) claims[field] = normalized;
    }
  }

  // Legacy scalar -> canonical array mappings (contract §6, v0/v1 only): only applied when the
  // canonical array field was not already directly claimed above, and never for v2 (which owns
  // `panes`/`paneTfs` natively and never carried the singular `active`/`tf` legacy keys).
  if (version < 2 && !("panes" in claims) && typeof config.active === "string") {
    const normalized = CHART_FIELD_VALIDATORS.panes([config.active]);
    if (normalized !== INVALID) claims.panes = normalized;
  }
  if (version < 2 && !("paneTfs" in claims) && typeof config.tf === "string") {
    const normalized = CHART_FIELD_VALIDATORS.paneTfs([config.tf]);
    if (normalized !== INVALID) claims.paneTfs = normalized;
  }

  // sync defaults true ONLY when version<2 AND panes claimed (verbatim).
  if (version < 2 && "panes" in claims && !("sync" in claims)) {
    claims.sync = true;
  }

  const envelope: WorkspaceEnvelope = {
    schema: SCHEMA,
    requires: { floor: FLOOR_SUPPORTED },
    revision: 1,
    name: null,
    link_groups: { primary_security: { entity_type: "security" } },
    widgets: [
      {
        id: "chart-main",
        type: "chart",
        semantic_lane: "primary",
        context_in: ["primary_security"],
        context_out: ["primary_security"],
        config: claims,
      },
    ],
    migration: { source, source_revision: sourceRevision },
  };
  return { ok: true, envelope };
}

function findChartWidget(envelope: WorkspaceEnvelope): Widget | undefined {
  return (
    envelope.widgets.find((w) => w.type === "chart" && w.semantic_lane === "primary") ??
    envelope.widgets.find((w) => w.type === "chart")
  );
}

function findBrainWidget(envelope: WorkspaceEnvelope): Widget | undefined {
  return envelope.widgets.find((w) => w.type === "brain");
}

/** Envelope chart widget config -> the existing `NormalizedLayout` claims shape, so the existing,
 *  UNMODIFIED `applyLayoutConfig` folds it onto the live workspace exactly as it folds any other
 *  saved layout (contract §7: the chart pane grid keeps its current owner). A field absent from the
 *  widget config claims nothing (`null`) — never re-interpreted as "reset to default". */
export function workspaceToLayout(envelope: WorkspaceEnvelope): NormalizedLayout {
  const widget = findChartWidget(envelope);
  const config: Record<string, unknown> = isRecord(widget?.config) ? widget.config : {};
  const claim = <T,>(field: ChartConfigField): T | null => (field in config ? (config[field] as T) : null);

  const rawLockedVLine = config.lockedVLine;
  const lockedVLine: string | null | undefined =
    typeof rawLockedVLine === "string" ? rawLockedVLine : rawLockedVLine === null ? null : undefined;

  return {
    schemaVersion: LAYOUT_SCHEMA_VERSION,
    panes: claim<string[]>("panes"),
    paneTfs: claim<string[]>("paneTfs"),
    split: claim<number>("split"),
    activePane: claim<number>("activePane"),
    sync: claim<boolean>("sync"),
    chartType: claim<string>("chartType"),
    inds: claim<string[]>("inds"),
    indParams: claim<LegacyParamMap>("indParams"),
    hidden: claim<string[]>("hidden"),
    compare: claim<string[]>("compare"),
    compareCfg: claim<CompareCfgMap>("compareCfg"),
    lockedVLine,
  };
}

export type CaptureWorkspaceInput = {
  /** Current runtime workspace state, in the shape the existing chart surface already holds. */
  layout: LayoutWorkspace;
  /** Whether the assistant (Brain) dock is part of the workspace being saved (contract §7). */
  brainIncluded: boolean;
  /** The envelope this save is layered over (an existing named workspace, if any) — widget ids and
   *  migration provenance are PRESERVED from it rather than re-minted (contract §2: "user-created
   *  widgets get ids minted once at creation and persisted thereafter"). Omit for a brand-new
   *  workspace (native creation: `migration = {source:"none", source_revision:null}`). */
  prior?: WorkspaceEnvelope;
};

/** Runtime capture -> canonical envelope. Chart widget config is exactly `captureLayoutConfig`'s
 *  output, re-validated field-by-field through the SAME frozen validators `migrateLegacy` uses (so
 *  a captured value that would fail cross-repo validation is never persisted un-claimed instead of
 *  rejected — see the lockedVLine type-mismatch note in the worker's final report: Terminal's live
 *  lockedVLine is a `string`, the frozen contract's chart-config validator accepts only
 *  `number | null`, so a live lockedVLine value is never carried into the captured config today). */
export function captureWorkspace(input: CaptureWorkspaceInput): WorkspaceEnvelope {
  const captured = captureLayoutConfig(input.layout) as unknown as Record<string, unknown>;
  const chartConfig: Record<string, unknown> = {};
  for (const field of CHART_CONFIG_FIELDS) {
    if (!(field in captured)) continue;
    const normalized = CHART_FIELD_VALIDATORS[field](captured[field]);
    if (normalized !== INVALID) chartConfig[field] = normalized;
  }

  const priorChart = input.prior ? findChartWidget(input.prior) : undefined;
  const priorBrain = input.prior ? findBrainWidget(input.prior) : undefined;

  const chartWidget: Widget = {
    id: priorChart?.id ?? "chart-main",
    type: "chart",
    semantic_lane: priorChart?.semantic_lane ?? "primary",
    context_in: priorChart?.context_in ?? ["primary_security"],
    context_out: priorChart?.context_out ?? ["primary_security"],
    config: chartConfig,
    ...(priorChart?.grid ? { grid: priorChart.grid } : {}),
  };

  const widgets: Widget[] = [chartWidget];
  if (input.brainIncluded) {
    widgets.push({
      id: priorBrain?.id ?? "brain-dock",
      type: "brain",
      semantic_lane: priorBrain?.semantic_lane ?? "dock",
      context_in: priorBrain?.context_in ?? ["primary_security"],
      context_out: priorBrain?.context_out ?? [],
      config: {},
    });
  }

  const migration: MigrationProvenance = input.prior?.migration ?? { source: "none", source_revision: null };
  const linkGroups = input.prior?.link_groups ?? { primary_security: { entity_type: "security" } };
  const revision = input.prior?.revision ?? 1;

  return {
    schema: SCHEMA,
    requires: { floor: FLOOR_SUPPORTED },
    revision,
    name: null,
    link_groups: linkGroups,
    widgets,
    migration,
  };
}
