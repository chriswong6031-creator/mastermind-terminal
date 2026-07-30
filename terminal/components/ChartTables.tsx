"use client";
// ChartTables — corner-anchored DOM dashboards over the chart (premium suites, W3).
//
// Renders the TableSpec[] a suite bundle emitted (types.ts §chart tables) as positioned cards
// inside ChartPanel's `.chart-wrap` (position:relative), as a sibling of <ChartOverlays>. Never
// SVG/canvas: a dashboard is text in a grid, and DOM text stays crisp, selectable-adjacent and
// ellipsis-capable at every DPR — the SVG layer would have to re-measure every glyph each frame.
//
// Contract notes honored here:
//   • one table per id, LAST writer wins (a module recomputing its table replaces it, never stacks);
//   • tables sharing a corner stack vertically in STABLE id order — the same set of ids always
//     lands in the same visual order, so a value never jumps rows between frames;
//   • colors/bg arrive already resolved from design tokens by the host (ctx.colors) — this file
//     invents no hue, it only applies the fin-tag tint formula in CSS.
//
// Pointer law: the corner stacks are pointer-events:none and shrink to their content, so a chart
// drag that starts anywhere outside a card rect is untouched; only the card itself takes input, and
// only so its hover state and per-cell `tip` (title attr) can fire.
//
// Pure render — no effects, no refs, no state, no wall-clock. Same props → same DOM.

import type { CSSProperties } from "react";
import type { TableSpec } from "@/lib/indicator-canvas/types";

const CORNERS = ["tl", "tr", "bl", "br"] as const;
type Corner = (typeof CORNERS)[number];

/** 0..1 recency fade → opacity lerp 1..0.35 (0 = fresh/bright, 1 = oldest still-legible). */
function fadeOpacity(fade: number): number {
  const f = fade < 0 ? 0 : fade > 1 ? 1 : fade;
  return 1 - f * 0.65;
}

function Card({ spec }: { spec: TableSpec }) {
  const cols = spec.columns || [];
  const rows = spec.rows || [];
  const hasHead = cols.some((c) => !!c.label);
  return (
    <div className={"ct-card" + (spec.compact ? " is-compact" : "")}>
      {spec.title ? <div className="ct-title">{spec.title}</div> : null}
      <table className="ct-tbl">
        <colgroup>
          <col className="ct-col-lbl" />
          {cols.map((c, ci) => (
            <col key={`${c.key}:${ci}`} />
          ))}
        </colgroup>
        {hasHead && (
          <thead>
            <tr className="ct-hrow">
              <th className="ct-hcell" />
              {cols.map((c, ci) => (
                <th key={`${c.key}:${ci}`} className={"ct-hcell" + (c.num ? " is-num" : "")}>
                  {c.label || ""}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {rows.map((r, ri) => (
            <tr className="ct-row" key={ri}>
              <th scope="row" className="ct-lbl" title={r.label}>
                {r.label}
              </th>
              {cols.map((c, ci) => {
                const cell = (r.cells || [])[ci];
                const numCls = c.num ? " is-num" : "";
                if (!cell) return <td key={`${c.key}:${ci}`} className={"ct-cell" + numCls} />;
                const st: CSSProperties = {};
                if (cell.color) st.color = cell.color;
                if (cell.bg) (st as Record<string, string>)["--ct-c"] = cell.bg;
                if (cell.bold) st.fontWeight = 700;
                if (typeof cell.fade === "number" && cell.fade > 0) st.opacity = fadeOpacity(cell.fade);
                return (
                  <td
                    key={`${c.key}:${ci}`}
                    className={"ct-cell" + numCls + (cell.bg ? " has-bg" : "")}
                    style={st}
                    title={cell.tip || undefined}
                  >
                    {cell.text}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {spec.footnote ? <div className="ct-foot">{spec.footnote}</div> : null}
    </div>
  );
}

export default function ChartTables({ tables }: { tables: TableSpec[] }) {
  if (!tables || tables.length === 0) return null;

  // one table per id, last writer wins
  const byId = new Map<string, TableSpec>();
  for (const t of tables) {
    if (!t || !t.id) continue;
    byId.set(t.id, t);
  }
  if (byId.size === 0) return null;

  const buckets: Record<Corner, TableSpec[]> = { tl: [], tr: [], bl: [], br: [] };
  byId.forEach((t) => {
    const pos: Corner = (CORNERS as readonly string[]).includes(t.pos) ? (t.pos as Corner) : "tr";
    buckets[pos].push(t);
  });
  // stable order by id — same ids ⇒ same stacking, frame after frame
  for (const c of CORNERS) buckets[c].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  return (
    <>
      {CORNERS.map((c) =>
        buckets[c].length ? (
          <div key={c} className={`ct-corner ct-corner-${c}`}>
            {buckets[c].map((t) => (
              <Card key={t.id} spec={t} />
            ))}
          </div>
        ) : null
      )}
    </>
  );
}
