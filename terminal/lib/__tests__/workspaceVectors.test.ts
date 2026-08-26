// ── W1-C parity mechanism: Terminal's migration proven byte-identical to the Macro reference ────
//
// The fixtures here (`lib/__tests__/fixtures/workspace/*.json`) are copied BYTE-IDENTICAL from the
// Macro repo's `contracts/intelligence_workspace/fixtures/workspace_migration/` — the same vectors
// `engine/intelligence_workspace/workspace_layout.py`'s own test suite pins. The digest law:
// sha256 of each file's raw bytes, then sha256 over the concatenation of those per-file hex digests
// (sorted by filename) — reproduced verbatim from `tests/test_intelligence_workspace_workspace_layout.py`
// (Macro repo) `test_manifest_recomputes_to_the_pinned_vectors_digest`.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { migrateLegacy } from "../workspaceMigrate";
import type { FailureCode, WorkspaceEnvelope } from "../workspaceLayout";

const FIXTURES_DIR = fileURLToPath(new URL("./fixtures/workspace/", import.meta.url));

type ManifestEntry = { name: string; sha256: string };
type Manifest = { files: ManifestEntry[]; vectors_digest: string };

const manifest: Manifest = JSON.parse(readFileSync(`${FIXTURES_DIR}MANIFEST.json`, "utf8"));

/** Hard literal (frozen packet §SCOPE-item-1): a drift here means the fixtures no longer match the
 *  Macro-side pin, and MUST be investigated rather than updated to make the test pass. */
const PINNED_VECTORS_DIGEST = "4111f9d28c8043facc16dda6985a86b51fd9146e50608dc76aa118b0f33fdfb8";

type ValidVector = { input: unknown; expected: WorkspaceEnvelope };
type InvalidVector = { input: unknown; expected_code: FailureCode };

function loadVector(name: string): ValidVector | InvalidVector {
  return JSON.parse(readFileSync(`${FIXTURES_DIR}${name}`, "utf8"));
}

describe("MANIFEST digest — recomputes to the pinned literal", () => {
  it("every listed file's sha256 matches its recorded digest", () => {
    for (const row of manifest.files) {
      const digest = createHash("sha256").update(readFileSync(`${FIXTURES_DIR}${row.name}`)).digest("hex");
      expect(digest, row.name).toBe(row.sha256);
    }
  });

  it("lists every fixture file on disk and nothing extra", () => {
    const onDisk = new Set(readdirSync(FIXTURES_DIR).filter((f) => f !== "MANIFEST.json"));
    const listed = new Set(manifest.files.map((f) => f.name));
    expect(listed).toEqual(onDisk);
  });

  it("recomputes vectors_digest = sha256(join(sorted per-file sha256 hex strings)) and it equals the hard literal", () => {
    const entries = [...manifest.files].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    const recomputed = createHash("sha256")
      .update(entries.map((row) => row.sha256).join(""), "utf8")
      .digest("hex");
    expect(recomputed).toBe(manifest.vectors_digest);
    expect(manifest.vectors_digest).toBe(PINNED_VECTORS_DIGEST);
  });
});

const VALID_VECTOR_FILES = [
  "legacy_v0_bare.json",
  "legacy_v0_minimal.json",
  "chart_layout_v1_sparse.json",
  "chart_layout_v1_typical.json",
  "chart_layout_v2_sparse.json",
  "chart_layout_v2_full.json",
];

const INVALID_VECTOR_FILES = [
  "invalid_duplicate_widget_id.json",
  "invalid_floor_unsupported.json",
  "invalid_lane.json",
  "invalid_non_dict_input.json",
  "invalid_non_null_name.json",
  "invalid_oversized_workspace.json",
  "invalid_port.json",
  "invalid_too_many_widgets.json",
  "invalid_unknown_chart_config_key.json",
  "invalid_unknown_schema.json",
  "invalid_unknown_top_level_key.json",
  "invalid_unknown_widget_type.json",
];

describe("golden vectors — file inventory matches the frozen fixture set", () => {
  it("18 vectors total, none missed by either list", () => {
    expect(VALID_VECTOR_FILES.length + INVALID_VECTOR_FILES.length).toBe(18);
    const all = new Set([...VALID_VECTOR_FILES, ...INVALID_VECTOR_FILES]);
    const listed = new Set(manifest.files.map((f) => f.name));
    expect(all).toEqual(listed);
  });
});

describe.each(VALID_VECTOR_FILES)("migrateLegacy — valid vector %s", (file) => {
  const vector = loadVector(file) as ValidVector;

  it("deep-equals the pinned expected envelope", () => {
    const result = migrateLegacy(vector.input);
    expect(result).toEqual({ ok: true, envelope: vector.expected });
  });

  it("is deterministic — running it twice yields the identical envelope", () => {
    const first = migrateLegacy(vector.input);
    const second = migrateLegacy(vector.input);
    expect(first).toEqual(second);
    expect(first).toEqual({ ok: true, envelope: vector.expected });
  });
});

describe.each(INVALID_VECTOR_FILES)("migrateLegacy — invalid vector %s", (file) => {
  const vector = loadVector(file) as InvalidVector;

  it("fails with the exact expected_code", () => {
    const result = migrateLegacy(vector.input);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.code).toBe(vector.expected_code);
  });

  it("never throws and is deterministic on repeat", () => {
    expect(() => migrateLegacy(vector.input)).not.toThrow();
    const a = migrateLegacy(vector.input);
    const b = migrateLegacy(vector.input);
    expect(a).toEqual(b);
  });
});
