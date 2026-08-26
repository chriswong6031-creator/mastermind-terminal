// ── The versioned workspace layout contract (`workspace_layout.v1`) — TS mirror ────────────────
//
// Frozen contract: research/DEEPVUE_W2A_WORKSPACE_LAYOUT_CONTRACT_2026-08-26.md (Macro repo).
// Reference implementation Terminal proves against, field-for-field:
// engine/intelligence_workspace/workspace_layout.py (Macro repo). Golden vectors are digest-pinned
// in BOTH repos (`lib/__tests__/fixtures/workspace/`, see `workspaceVectors.test.ts`) — this is the
// W1-C parity mechanism (contract §10).
//
// This module is a pure transform of its arguments: no I/O, no network, no mutable module state.
// Every exported function is safe to call on hostile input without throwing (fail-closed).

import { createHash } from "node:crypto";
//
// A workspace HOSTS widgets whose own state lives elsewhere (drawings, watchlist, favTF, Day Trade
// Mode, alerts — contract §2 anti-duplication law, carried forward verbatim from `layoutConfig.ts`).
// It never becomes their canonical data owner.

export const SCHEMA = "workspace_layout.v1" as const;

// --- frozen vocabularies (contract §1-§8) -----------------------------------------------------

export const WIDGET_TYPES = ["chart", "brain"] as const;
export type WidgetType = (typeof WIDGET_TYPES)[number];

export const SEMANTIC_LANES = ["primary", "secondary", "rail", "dock"] as const;
export type SemanticLane = (typeof SEMANTIC_LANES)[number];

export const ENTITY_TYPES = ["security", "industry", "theme", "portfolio", "event"] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

export const MIGRATION_SOURCES = ["legacy_v0", "chart_layout_v1", "chart_layout_v2", "none", "import"] as const;
export type MigrationSource = (typeof MIGRATION_SOURCES)[number];

/** The complete frozen failure vocabulary (contract §8) — 16 codes, no more, no fewer. */
export const FAILURE_CODES = [
  "malformed_workspace", "unsupported_schema", "unsupported_floor",
  "unknown_widget_type", "invalid_widget_config", "duplicate_widget_id",
  "invalid_lane", "invalid_port", "name_conflict", "stale_revision",
  "store_unavailable", "unauthenticated", "not_found", "invalid_import",
  "oversized_workspace", "too_many_widgets",
] as const;
export type FailureCode = (typeof FAILURE_CODES)[number];

// --- frozen limits (contract §3) ----------------------------------------------------------------

export const MAX_WIDGETS = 12;
export const MAX_ENVELOPE_BYTES = 65536;
export const MAX_LINK_GROUPS = 8;
export const MAX_PORTS = 8;
export const FLOOR_SUPPORTED = 1;

/** The 12 chart-config fields owned verbatim by the existing Terminal chart-layout contract
 *  (contract §2). Order carries no schema meaning; it matches the Macro reference for readability. */
export const CHART_CONFIG_FIELDS = [
  "panes", "paneTfs", "split", "activePane", "sync", "chartType",
  "inds", "indParams", "hidden", "compare", "compareCfg", "lockedVLine",
] as const;
export type ChartConfigField = (typeof CHART_CONFIG_FIELDS)[number];

// --- shapes ---------------------------------------------------------------------------------

export type ParamMap = Record<string, Record<string, unknown>>;

export type ChartWidgetConfig = {
  panes?: string[]; paneTfs?: string[]; split?: number; activePane?: number; sync?: boolean;
  chartType?: string; inds?: string[]; indParams?: ParamMap; hidden?: string[];
  compare?: string[]; compareCfg?: Record<string, unknown>; lockedVLine?: string | null;
};

export type LinkGroup = { entity_type: EntityType };
export type WidgetGrid = { x: number; y: number; w: number; h: number };

export type Widget = {
  id: string;
  type: WidgetType;
  semantic_lane: SemanticLane;
  grid?: WidgetGrid;
  context_in: string[];
  context_out: string[];
  config: Record<string, unknown>;
};

export type MigrationProvenance = { source: MigrationSource; source_revision: number | null };

export type WorkspaceEnvelope = {
  schema: typeof SCHEMA;
  requires: { floor: number };
  revision: number;
  name: string | null;
  link_groups: Record<string, LinkGroup>;
  widgets: Widget[];
  migration: MigrationProvenance;
};

export type ValidationError = { code: FailureCode; path: string };
export type ValidationResult = { ok: true; errors: [] } | { ok: false; errors: ValidationError[] };

// --- internal helpers -------------------------------------------------------------------------

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);

const TOP_LEVEL_KEYS = new Set(["schema", "requires", "revision", "name", "link_groups", "widgets", "migration"]);
const WIDGET_KEYS = new Set(["id", "type", "semantic_lane", "grid", "context_in", "context_out", "config"]);
const GRID_KEYS = new Set(["x", "y", "w", "h"]);
const MIGRATION_KEYS = new Set(["source", "source_revision"]);
const LINK_GROUP_KEYS = new Set(["entity_type"]);

const WIDGET_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const LINK_GROUP_NAME_RE = /^[a-z][a-z0-9_]{0,31}$/;
const SYMBOL_RE = /^[A-Z0-9._:-]{1,12}$/;
const TIMEFRAME_RE = /^[A-Za-z0-9]{1,8}$/;
const CHART_TYPE_RE = /^[a-z][a-z0-9_]{0,31}$/;
const INDICATOR_ID_RE = /^[a-z][a-z0-9_]{0,31}$/;
const PARAM_KEY_RE = /^[A-Za-z0-9_]{1,32}$/;
// Amendment A1 (2026-08-26, Macro commit 8b4d326514f6): 1..64 chars, no ASCII control characters
// (0x00-0x1f, 0x7f) — mirrors the Macro reference's `_LOCKED_VLINE_RE` verbatim.
const LOCKED_VLINE_RE = /^[^\x00-\x1f\x7f]{1,64}$/;

/** Sentinel distinguishing "field present but wrong type/shape" (never claimed) from a
 *  legitimately-valid `null` value (e.g. `lockedVLine` explicitly cleared) — mirrors the Python
 *  reference's `_INVALID` object (contract §6 claim semantics). */
export const INVALID: unique symbol = Symbol("workspace-field-invalid");
type FieldResult<T> = T | typeof INVALID;

const isBoundedPrimitive = (value: unknown): boolean => {
  if (value === null || typeof value === "boolean") return true;
  if (typeof value === "number") return true;
  if (typeof value === "string") return value.length <= 64;
  return false;
};

function validateParamBlock(value: unknown, keyPattern: RegExp): FieldResult<ParamMap> {
  if (!isRecord(value) || Object.keys(value).length > 32) return INVALID;
  const out: ParamMap = {};
  for (const [key, sub] of Object.entries(value)) {
    if (!keyPattern.test(key)) return INVALID;
    if (!isRecord(sub) || Object.keys(sub).length > 16) return INVALID;
    const subOut: Record<string, unknown> = {};
    for (const [subKey, subVal] of Object.entries(sub)) {
      if (!PARAM_KEY_RE.test(subKey)) return INVALID;
      if (!isBoundedPrimitive(subVal)) return INVALID;
      subOut[subKey] = subVal;
    }
    out[key] = subOut;
  }
  return out;
}

function vPanes(value: unknown): FieldResult<string[]> {
  if (!Array.isArray(value) || value.length < 1 || value.length > 4) return INVALID;
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || !SYMBOL_RE.test(item)) return INVALID;
    out.push(item);
  }
  return out;
}

function vPaneTfs(value: unknown): FieldResult<string[]> {
  if (!Array.isArray(value) || value.length < 1 || value.length > 32) return INVALID;
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || !TIMEFRAME_RE.test(item)) return INVALID;
    out.push(item);
  }
  return out;
}

const VALID_SPLITS = [1, 2, 4] as const;

/** Amendment A1 (2026-08-26, Macro commit 8b4d326514f6): `split` is Terminal's discrete
 *  pane-split selector (`layoutConfig.ts` `VALID_SPLITS = [1,2,4]`), never a 0-100 percentage —
 *  the original freeze's `0..100` bound was an authoring error that would have rejected every
 *  real Terminal v2 layout using this field. */
function vSplit(value: unknown): FieldResult<number> {
  if (!isInt(value) || !(VALID_SPLITS as readonly number[]).includes(value)) return INVALID;
  return value;
}

function vActivePane(value: unknown): FieldResult<number> {
  if (!isInt(value) || value < 0 || value > 3) return INVALID;
  return value;
}

function vSync(value: unknown): FieldResult<boolean> {
  if (typeof value !== "boolean") return INVALID;
  return value;
}

function vChartType(value: unknown): FieldResult<string> {
  if (typeof value !== "string" || !CHART_TYPE_RE.test(value)) return INVALID;
  return value;
}

function vInds(value: unknown): FieldResult<string[]> {
  if (!Array.isArray(value) || value.length > 32) return INVALID;
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || !INDICATOR_ID_RE.test(item)) return INVALID;
    out.push(item);
  }
  return out;
}

function vIndParams(value: unknown): FieldResult<ParamMap> {
  return validateParamBlock(value, INDICATOR_ID_RE);
}

function vHidden(value: unknown): FieldResult<string[]> {
  return vInds(value);
}

function vCompare(value: unknown): FieldResult<string[]> {
  if (!Array.isArray(value) || value.length > 32) return INVALID;
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || !SYMBOL_RE.test(item)) return INVALID;
    out.push(item);
  }
  return out;
}

function vCompareCfg(value: unknown): FieldResult<ParamMap> {
  return validateParamBlock(value, SYMBOL_RE);
}

/** Amendment A1 (2026-08-26, Macro commit 8b4d326514f6): `lockedVLine` is `string | null` in the
 *  real Terminal runtime (`TerminalShell.tsx`/`ChartPanel.tsx` own it as a string key), never a
 *  number — the original freeze's `number | null` bound would have rejected every real Terminal v2
 *  layout that used it (this worker's own KNOWN GAP finding, ruled a real contract defect). */
function vLockedVLine(value: unknown): FieldResult<string | null> {
  if (value === null) return null;
  if (typeof value !== "string") return INVALID;
  if (!LOCKED_VLINE_RE.test(value)) return INVALID;
  return value;
}

/** Per-field validators, keyed by the frozen chart-config field name (contract §2). Exported so
 *  `workspaceMigrate.ts` can reuse the SAME claim semantics the Macro reference uses. */
export const CHART_FIELD_VALIDATORS: { [K in ChartConfigField]: (value: unknown) => FieldResult<unknown> } = {
  panes: vPanes,
  paneTfs: vPaneTfs,
  split: vSplit,
  activePane: vActivePane,
  sync: vSync,
  chartType: vChartType,
  inds: vInds,
  indParams: vIndParams,
  hidden: vHidden,
  compare: vCompare,
  compareCfg: vCompareCfg,
  lockedVLine: vLockedVLine,
};

function err(code: FailureCode, path: string): ValidationError {
  return { code, path };
}

function validateGrid(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  if (keys.length !== GRID_KEYS.size || !keys.every((k) => GRID_KEYS.has(k))) return false;
  return ["x", "y", "w", "h"].every((k) => {
    const v = (value as Record<string, unknown>)[k];
    return isInt(v) && v >= 0 && v <= 64;
  });
}

function validateWidgetConfig(widgetType: unknown, config: unknown, path: string): ValidationError[] {
  const errors: ValidationError[] = [];
  if (widgetType === "brain") {
    // Closed, no properties.
    if (!(isRecord(config) && Object.keys(config).length === 0)) errors.push(err("invalid_widget_config", path));
    return errors;
  }
  if (widgetType === "chart") {
    if (!isRecord(config)) {
      errors.push(err("invalid_widget_config", path));
      return errors;
    }
    for (const key of Object.keys(config)) {
      if (!(CHART_CONFIG_FIELDS as readonly string[]).includes(key)) {
        errors.push(err("invalid_widget_config", `${path}.${key}`));
      }
    }
    for (const [field, raw] of Object.entries(config)) {
      const validator = (CHART_FIELD_VALIDATORS as Record<string, (v: unknown) => FieldResult<unknown>>)[field];
      if (!validator) continue; // already reported as unknown above
      if (validator(raw) === INVALID) errors.push(err("invalid_widget_config", `${path}.${field}`));
    }
    return errors;
  }
  // Unknown widget type: `unknown_widget_type` is reported by the caller; config shape is not
  // independently meaningful for an unrecognized type.
  if (!isRecord(config)) errors.push(err("invalid_widget_config", path));
  return errors;
}

/** Validate a `workspace_layout.v1` envelope: schema shape AND the cross-field laws the JSON
 *  Schema alone cannot express (contract §1-§8). Never throws — every branch is a type/membership
 *  check on already-untrusted input, fail-closed on anything unexpected. */
export function validateEnvelope(obj: unknown): ValidationResult {
  const errors: ValidationError[] = [];

  if (!isRecord(obj)) {
    return { ok: false, errors: [err("malformed_workspace", "$")] };
  }

  for (const key of Object.keys(obj)) {
    if (!TOP_LEVEL_KEYS.has(key)) errors.push(err("malformed_workspace", `$.${key}`));
  }
  for (const key of TOP_LEVEL_KEYS) {
    if (!(key in obj)) errors.push(err("malformed_workspace", `$.${key}`));
  }

  const schema = obj.schema;
  if (schema !== SCHEMA) {
    errors.push(err("unsupported_schema", "$.schema"));
    // Nothing else here is safe to interpret as a workspace_layout.v1 object once the schema tag
    // itself disagrees.
    return { ok: false, errors };
  }

  const requires = obj.requires;
  if (!isRecord(requires) || Object.keys(requires).length !== 1 || !("floor" in requires)) {
    errors.push(err("malformed_workspace", "$.requires"));
  } else {
    const floor = requires.floor;
    if (!isInt(floor) || floor < 1) {
      errors.push(err("malformed_workspace", "$.requires.floor"));
    } else if (floor > FLOOR_SUPPORTED) {
      errors.push(err("unsupported_floor", "$.requires.floor"));
    }
  }

  const revision = obj.revision;
  if (!isInt(revision) || revision < 1) errors.push(err("malformed_workspace", "$.revision"));

  const name = obj.name;
  if (name !== null) errors.push(err("malformed_workspace", "$.name"));

  const linkGroups = obj.link_groups;
  const declaredGroups = new Set<string>();
  if (!isRecord(linkGroups)) {
    errors.push(err("malformed_workspace", "$.link_groups"));
  } else {
    const entries = Object.entries(linkGroups);
    if (entries.length > MAX_LINK_GROUPS) errors.push(err("malformed_workspace", "$.link_groups"));
    for (const [groupName, group] of entries) {
      if (!LINK_GROUP_NAME_RE.test(groupName)) {
        errors.push(err("malformed_workspace", `$.link_groups.${groupName}`));
        continue;
      }
      declaredGroups.add(groupName);
      if (!isRecord(group)) {
        errors.push(err("malformed_workspace", `$.link_groups.${groupName}`));
        continue;
      }
      const gKeys = Object.keys(group);
      if (gKeys.length !== LINK_GROUP_KEYS.size || !gKeys.every((k) => LINK_GROUP_KEYS.has(k))) {
        errors.push(err("malformed_workspace", `$.link_groups.${groupName}`));
        continue;
      }
      if (!(ENTITY_TYPES as readonly string[]).includes(group.entity_type as string)) {
        errors.push(err("malformed_workspace", `$.link_groups.${groupName}.entity_type`));
      }
    }
  }

  let widgets: unknown[] = [];
  const rawWidgets = obj.widgets;
  if (!Array.isArray(rawWidgets)) {
    errors.push(err("malformed_workspace", "$.widgets"));
  } else {
    widgets = rawWidgets;
    if (rawWidgets.length > MAX_WIDGETS) errors.push(err("too_many_widgets", "$.widgets"));
    else if (rawWidgets.length < 1) errors.push(err("malformed_workspace", "$.widgets"));
  }

  const seenIds = new Set<string>();
  widgets.forEach((widget, index) => {
    const path = `$.widgets[${index}]`;
    if (!isRecord(widget)) {
      errors.push(err("invalid_widget_config", path));
      return;
    }
    for (const key of Object.keys(widget)) {
      if (!WIDGET_KEYS.has(key)) errors.push(err("invalid_widget_config", `${path}.${key}`));
    }
    for (const key of ["id", "type", "semantic_lane", "context_in", "context_out", "config"]) {
      if (!(key in widget)) errors.push(err("invalid_widget_config", `${path}.${key}`));
    }

    const widgetId = widget.id;
    if (typeof widgetId !== "string" || !WIDGET_ID_RE.test(widgetId)) {
      errors.push(err("invalid_widget_config", `${path}.id`));
    } else {
      if (seenIds.has(widgetId)) errors.push(err("duplicate_widget_id", `${path}.id`));
      seenIds.add(widgetId);
    }

    const widgetType = widget.type;
    if (!(WIDGET_TYPES as readonly unknown[]).includes(widgetType)) {
      errors.push(err("unknown_widget_type", `${path}.type`));
    }

    const lane = widget.semantic_lane;
    if (!(SEMANTIC_LANES as readonly unknown[]).includes(lane)) {
      errors.push(err("invalid_lane", `${path}.semantic_lane`));
    }

    if ("grid" in widget && !validateGrid(widget.grid)) {
      errors.push(err("invalid_widget_config", `${path}.grid`));
    }

    for (const portKey of ["context_in", "context_out"] as const) {
      const ports = widget[portKey];
      if (!Array.isArray(ports) || ports.length > MAX_PORTS) {
        errors.push(err("invalid_widget_config", `${path}.${portKey}`));
        continue;
      }
      ports.forEach((groupName, portIndex) => {
        if (typeof groupName !== "string" || !LINK_GROUP_NAME_RE.test(groupName)) {
          errors.push(err("invalid_port", `${path}.${portKey}[${portIndex}]`));
        } else if (!declaredGroups.has(groupName)) {
          errors.push(err("invalid_port", `${path}.${portKey}[${portIndex}]`));
        }
      });
    }

    if ((WIDGET_TYPES as readonly unknown[]).includes(widgetType)) {
      errors.push(...validateWidgetConfig(widgetType, widget.config, `${path}.config`));
    }
  });

  const migration = obj.migration;
  if (!isRecord(migration)) {
    errors.push(err("malformed_workspace", "$.migration"));
  } else {
    const mKeys = Object.keys(migration);
    if (mKeys.length !== MIGRATION_KEYS.size || !mKeys.every((k) => MIGRATION_KEYS.has(k))) {
      errors.push(err("malformed_workspace", "$.migration"));
    } else {
      if (!(MIGRATION_SOURCES as readonly unknown[]).includes(migration.source)) {
        errors.push(err("malformed_workspace", "$.migration.source"));
      }
      const sourceRevision = migration.source_revision;
      if (sourceRevision !== null && !isInt(sourceRevision)) {
        errors.push(err("malformed_workspace", "$.migration.source_revision"));
      }
    }
  }

  try {
    const canonical = canonicalJson(obj);
    if (Buffer.byteLength(canonical, "utf8") > MAX_ENVELOPE_BYTES) {
      errors.push(err("oversized_workspace", "$"));
    }
  } catch {
    errors.push(err("malformed_workspace", "$"));
  }

  return errors.length === 0 ? { ok: true, errors: [] } : { ok: false, errors };
}

/** Recognizer for `isWorkspaceEnvelope`/`rowStateFor`: a structurally-valid, ok=true envelope. */
export function isWorkspaceEnvelope(config: unknown): config is WorkspaceEnvelope {
  return isRecord(config) && config.schema === SCHEMA && validateEnvelope(config).ok;
}

/** Per-row read state for the library list (contract §8/§9): a row that fails validation is never
 *  silently rendered as empty/healthy — it is marked so the menu can show a plain-word reason. */
export function rowStateFor(config: unknown): "ok" | "unsupported_floor" | "unsupported_schema" {
  if (!isRecord(config) || config.schema !== SCHEMA) return "unsupported_schema";
  const result = validateEnvelope(config);
  if (result.ok) return "ok";
  if (result.errors.some((e) => e.code === "unsupported_floor")) return "unsupported_floor";
  return "unsupported_schema";
}

/** Canonical (sorted-key, compact) JSON serialization — used for the size check above and for
 *  `envelopeDigest` below. Mirrors Python's `json.dumps(obj, sort_keys=True, separators=(",", ":"))`. */
export function canonicalJson(value: unknown): string {
  return stringifySorted(value);
}

/** `JSON.stringify` leaves non-ASCII characters as raw UTF-8; Python's canonical form uses
 *  `ensure_ascii=True` (every char outside `0x20..0x7e` becomes `\uXXXX`, astral characters as a
 *  UTF-16 surrogate pair — the same representation Python's encoder falls back to). Re-escaping
 *  post-hoc keeps the standard-JSON escaping `JSON.stringify` already got right (quotes, backslash,
 *  `\n`/`\t`/etc.) and only touches the bytes Python would additionally escape. */
function asciiSafeString(s: string): string {
  const quoted = JSON.stringify(s);
  let out = "";
  for (let i = 0; i < quoted.length; i++) {
    const code = quoted.charCodeAt(i);
    out += code > 0x7e ? `\\u${code.toString(16).padStart(4, "0")}` : quoted[i];
  }
  return out;
}

function stringifySorted(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("non-finite number is not JSON-serializable");
    return JSON.stringify(value);
  }
  if (typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "string") return asciiSafeString(value);
  if (Array.isArray(value)) return `[${value.map((v) => stringifySorted(v)).join(",")}]`;
  if (isRecord(value)) {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${asciiSafeString(k)}:${stringifySorted(value[k])}`).join(",")}}`;
  }
  throw new TypeError(`value of type ${typeof value} is not JSON-serializable`);
}

/** SHA-256 over the canonical serialization — the digest used to pin golden vectors and to prove
 *  this module byte-identical to the Macro reference (contract §10). Node-only (uses `node:crypto`);
 *  callers in this repo only ever run server-side or under vitest. */
export function envelopeDigest(envelope: unknown): string {
  return createHash("sha256").update(canonicalJson(envelope), "utf8").digest("hex");
}
