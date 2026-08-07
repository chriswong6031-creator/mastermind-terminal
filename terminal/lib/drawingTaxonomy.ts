import type { DrawKind } from "@/lib/drawings";
import {
  DRAWING_TOOLS,
  DRAWING_TOOL_REGISTRY,
  getDrawingTool,
  isDrawingToolId,
  type DrawingToolGroupId,
  type RegisteredDrawingTool,
} from "@/lib/drawingTools";

/**
 * TradingView's mobile "Drawings" sheet taxonomy (measured on IMG_2366-68: Favorites · Tools ·
 * Trend lines · Gann and fibonacci · Patterns). It is a PRESENTATION grouping laid over the
 * canonical nine-family registry in lib/drawingTools.ts — no tool exists here that the engine
 * does not implement, and every registry tool lands in exactly one tab (no dead tiles, nothing
 * dropped). The registry stays the single source of truth for ids, labels, icons and behaviour.
 */
export type DrawingSheetCategoryId = "favorites" | "tools" | "trendlines" | "gannfib" | "patterns";

export type DrawingSheetCategory = {
  id: DrawingSheetCategoryId;
  /** LEX key (lib/i18n.tsx). */
  labelKey: string;
  /** Registry families this tab presents; empty for the recents-backed Favorites tab. */
  groups: readonly DrawingToolGroupId[];
};

export const DRAWING_SHEET_CATEGORIES: readonly DrawingSheetCategory[] = [
  { id: "favorites", labelKey: "drawCatFavorites", groups: [] },
  // Everything TV files under "Tools": positions/ranges, freehand, shapes, arrows, annotation, emoji.
  { id: "tools", labelKey: "drawCatTools", groups: ["forecasting", "freehand", "shapes", "arrows", "annotation", "emoji"] },
  { id: "trendlines", labelKey: "drawCatTrendLines", groups: ["lines"] },
  { id: "gannfib", labelKey: "drawCatGannFib", groups: ["fibonacci"] },
  { id: "patterns", labelKey: "drawCatPatterns", groups: ["patterns"] },
];

const CATEGORY_BY_GROUP = new Map<DrawingToolGroupId, DrawingSheetCategoryId>(
  DRAWING_SHEET_CATEGORIES.flatMap((category) =>
    category.groups.map((group) => [group, category.id] as const)),
);

/** The sheet tab a registry tool belongs to (Favorites is recents, never a tool's home). */
export function drawingSheetCategoryOf(id: unknown): DrawingSheetCategoryId | undefined {
  const groupId = getDrawingTool(id)?.groupId;
  return groupId ? CATEGORY_BY_GROUP.get(groupId) : undefined;
}

/** Registry tools presented by one tab, in registry order. Favorites resolves from recents. */
export function drawingSheetTools(category: DrawingSheetCategoryId): readonly RegisteredDrawingTool[] {
  if (category === "favorites") return [];
  const groups = DRAWING_SHEET_CATEGORIES.find((entry) => entry.id === category)?.groups ?? [];
  return DRAWING_TOOL_REGISTRY
    .filter((group) => groups.includes(group.id))
    .flatMap((group) => group.tools.map((tool) => ({ ...tool, groupId: group.id })));
}

// ── recently-used tools ("Favorites" tab, v1) ────────────────────────────────────────────────
// TV stars tools; v1 keeps the tab honest without a second favourites store by showing the last
// nine tools the user actually reached for. Distinct from the dock's own starred rotation
// (mm.drawing.favorites.v1) — that store belongs to the desktop rail.
export const DRAW_RECENTS_KEY = "mm.drawRecents";
export const DRAW_RECENTS_LIMIT = 9;

export function readDrawRecents(): DrawKind[] {
  try {
    const raw = JSON.parse(localStorage.getItem(DRAW_RECENTS_KEY) || "[]");
    if (!Array.isArray(raw)) return [];
    const seen = new Set<DrawKind>();
    for (const entry of raw) if (isDrawingToolId(entry)) seen.add(entry);
    return [...seen].slice(0, DRAW_RECENTS_LIMIT);
  } catch {
    return [];
  }
}

/** Most-recent-first, deduped, capped. Returns the new list so callers can set state from it. */
export function pushDrawRecent(id: unknown): DrawKind[] {
  if (!isDrawingToolId(id)) return readDrawRecents();
  const next = [id, ...readDrawRecents().filter((entry) => entry !== id)].slice(0, DRAW_RECENTS_LIMIT);
  try { localStorage.setItem(DRAW_RECENTS_KEY, JSON.stringify(next)); } catch {}
  return next;
}

// ── native bridge payload ────────────────────────────────────────────────────────────────────
/** {id,label,group} for every engine tool — the native Drawings sheet renders from THIS, so it
 *  never hardcodes an engine inventory (contract.ts ShellDrawTool). Labels are EN; native
 *  localizes through its own L10n keys. */
export const SHELL_DRAW_TOOLS: readonly { id: string; label: string; group: DrawingSheetCategoryId }[] =
  DRAWING_TOOLS.map((tool) => ({
    id: tool.id,
    label: tool.label,
    group: CATEGORY_BY_GROUP.get(tool.groupId) ?? "tools",
  }));
