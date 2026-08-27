// ── Pure helpers for the W2-A workspace menu (TerminalShell.tsx wiring) ─────────────────────────
//
// Split out of TerminalShell.tsx so the mapping rules the menu depends on — "never show a raw
// failure code", "a row's openability is derived by the reader, never trusted blindly from the
// row's own stored schema tag" — are unit-testable without rendering the shell. No I/O, no React.
//
// Frozen contract: research/DEEPVUE_W2A_WORKSPACE_LAYOUT_CONTRACT_2026-08-26.md (Macro repo).
// Design spec: terminal/docs/W2A_WORKSPACE_UX_SPEC.md.

import { migrateLegacy } from "./workspaceMigrate";
import type { WorkspaceEnvelope } from "./workspaceLayout";
import type { RowState } from "@/components/LayoutMenu";

/**
 * Per-row read state (spec §1.1's `RowState`), derived the same way the actual LOAD path decides
 * openability — via `migrateLegacy`, not the server's `rowStateFor` (which answers a narrower
 * question: "is this row valid AS `workspace_layout.v1` right now"). A legacy `chart_layout_v1/v2`
 * row is fully loadable via migrate-on-write (freeze §6) and must never be marked blocked just
 * because it has not been saved in the new format yet — that would regress every layout saved
 * before this wave shipped. Genuinely unrecognized/future/over-floor payloads still block.
 */
export function workspaceRowState(config: unknown): RowState {
  const result = migrateLegacy(config);
  if (result.ok) return "ok";
  return result.code === "unsupported_floor" ? "unsupported_floor" : "unsupported_schema";
}

/** W1-C regression surface (freeze §7/§12): whether a loaded envelope's widget graph includes the
 *  Brain dock — the ONE fact that decides whether `<BrainWidget>` mounts. `getAiContext` and every
 *  other Brain prop are untouched by this wave; only membership is new. */
export function brainIncludedFromEnvelope(envelope: Pick<WorkspaceEnvelope, "widgets">): boolean {
  return envelope.widgets.some((w) => w.type === "brain");
}

export type WorkspaceOpOutcome =
  | { kind: "ok"; revision: number; id?: string }
  | { kind: "name_conflict" }
  | { kind: "stale_revision" }
  | { kind: "unauthenticated" }
  | { kind: "invalid_name" }
  | { kind: "not_found" }
  | { kind: "error" };

/** Maps an `/api/layouts` workspace-op response to a discriminated outcome — one place that knows
 *  the HTTP status/error-string vocabulary, so every caller (save/rename/duplicate/import) reasons
 *  about the same six shapes instead of re-deriving them. `id` (present on `save_workspace`'s
 *  response) lets the caller re-thread the ABA-fence identity (Amendment A3 ruling 5) after a
 *  create or a migrate-on-write conversion, when the row's uuid was not already known. */
export function parseWorkspaceOutcome(status: number, json: unknown): WorkspaceOpOutcome {
  const body = (json && typeof json === "object" ? json : {}) as { ok?: boolean; revision?: number; id?: string; error?: string };
  if (status === 200 && body.ok && typeof body.revision === "number") {
    return typeof body.id === "string" ? { kind: "ok", revision: body.revision, id: body.id } : { kind: "ok", revision: body.revision };
  }
  if (status === 401) return { kind: "unauthenticated" };
  if (status === 409 && body.error === "name_conflict") return { kind: "name_conflict" };
  if (status === 409 && body.error === "stale_revision") return { kind: "stale_revision" };
  if (status === 400 && body.error === "invalid_name") return { kind: "invalid_name" };
  if (status === 404) return { kind: "not_found" };
  return { kind: "error" };
}

/** Absolute local time, HH:MM, via the caller's locale — spec §2.2 GAP-2 resolution: the row
 *  carries only `updated_at` and no bilingual relative-time helper exists in this codebase, so the
 *  stale-revision fork states a fact ("saved 3:14 PM") rather than minting a new relative-time
 *  formatter. Never throws on a malformed/missing timestamp. */
export function absoluteLocalTime(iso: string | null | undefined, locale?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  try {
    return d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  } catch {
    return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  }
}

// Filesystem-hostile character set for the export filename law (spec §3.3): backslash, slash,
// colon, asterisk, question mark, quote, angle brackets, pipe, plus every ASCII control character.
// Built via fromCharCode (never a literal control byte in this source file) so the codepoints
// 0x00-0x1f never appear as raw bytes in the repo.
const ASCII_CONTROL_CHARS = Array.from({ length: 32 }, (_, i) => String.fromCharCode(i)).join("");
const FILENAME_UNSAFE_RE = new RegExp(`[\\\\/:*?"<>|${ASCII_CONTROL_CHARS}]+`, "g");

/** Export filename law (spec §3.3). Deliberately NOT `exportList`'s `replace(/[^\w.-]+/g,"_")`
 *  (`TerminalShell.tsx` watchlist export) — `\w` is ASCII-only, so a zh workspace name would export
 *  as `___.csv`. This strips only filesystem-hostile characters and keeps every script. */
export function safeWorkspaceFilename(name: string): string {
  const safe = name
    .replace(FILENAME_UNSAFE_RE, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
  return `${safe || "workspace"}.workspace.json`;
}

/** Every frozen §8 code an IMPORT can fail with, mapped to its plain-word i18n KEY (never a raw
 *  code — spec §2.2/§7 assertion 3). Callers pass the key through `t()`. */
export function importFailureKey(code: string | undefined): string {
  switch (code) {
    case "oversized_workspace": return "wsImportTooBig";
    case "too_many_widgets": return "wsImportTooManyPanels";
    case "unknown_widget_type": return "wsImportUnknownPanel";
    default: return "wsImportBad";
  }
}
