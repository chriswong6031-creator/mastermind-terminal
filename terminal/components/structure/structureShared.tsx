"use client";
/**
 * structureShared — helpers shared by the Structure (OI) tab's panels.
 *
 * Chart panels build strictly on components/charts/svgChart.ts (hygiene rules
 * R1–R9 live there); this module carries the structure-local conventions:
 * the per-panel provenance footer (which BAKES IN the OI t-1 timing law — the
 * one disclosure every panel must carry), compact OI-count formatting, the
 * neutral two-leg palette, and the shared axis/chip styles.
 *
 * OI is NON-DIRECTIONAL: calls/puts use the same neutral pair as the vol
 * smile (--brand-2 / --ai), never --up/--down (which flip in zh mode).
 */

import React from "react";
import type { Lang } from "@/lib/i18n";
import { getStructureStr } from "./structureStrings";

export const CALL_COLOR = "var(--brand-2)";
export const PUT_COLOR = "var(--ai)";

/** Compact count formatting for OI numbers (24,013 → 24.0K; 1,204,500 → 1.2M). */
export function fmtOi(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const a = Math.abs(v);
  const sign = v < 0 ? "−" : "";
  if (a >= 1e9) return `${sign}${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${sign}${(a / 1e6).toFixed(2)}M`;
  if (a >= 1e4) return `${sign}${(a / 1e4 >= 10 ? (a / 1e3).toFixed(0) : (a / 1e3).toFixed(1))}K`;
  return `${sign}${a.toLocaleString("en-US")}`;
}

/** Signed ΔOI formatting (keeps the explicit +/− the change table reads by). */
export function fmtDelta(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v > 0 ? "+" : v < 0 ? "−" : ""}${fmtOi(Math.abs(v))}`;
}

/** $mn value formatting for the intrinsic-payout axis. */
export function fmtMn(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const a = Math.abs(v);
  if (a >= 1000) return `${(v / 1000).toFixed(1)}bn`;
  return `${v.toFixed(a >= 100 ? 0 : 1)}mn`;
}

/** Consecutive runs of rows whose mapped value is finite (R7: break, don't bridge). */
export function finiteSegments<T>(rows: T[], valueOf: (r: T) => number): T[][] {
  const segs: T[][] = [];
  let cur: T[] = [];
  for (const r of rows) {
    if (Number.isFinite(valueOf(r))) {
      cur.push(r);
    } else if (cur.length) {
      segs.push(cur);
      cur = [];
    }
  }
  if (cur.length) segs.push(cur);
  return segs;
}

/** Nightly-EOD + t-1-law provenance footer, one per panel (the law is baked in). */
export function ProvenanceLine({ lang }: { lang: Lang }) {
  return <div style={PROV_LINE}>{getStructureStr(lang, "provenance")}</div>;
}

const PROV_LINE: React.CSSProperties = {
  marginTop: 10,
  paddingTop: 6,
  borderTop: "1px solid var(--line-2)",
  fontSize: 10,
  color: "var(--text-dim)",
  letterSpacing: "0.03em",
};

/** Shared plot paddings + text styles for the SVG panels. */
export const PLOT_PAD = { l: 52, r: 14, t: 12, b: 24 } as const;

export const AXIS_TXT: React.CSSProperties = {
  fontSize: 10,
  fill: "var(--muted)",
  fontVariantNumeric: "tabular-nums",
};

export const REF_TXT: React.CSSProperties = {
  fontSize: 9,
  fill: "var(--muted)",
  fontVariantNumeric: "tabular-nums",
};

/** Neutral structure/disclosure chip (OI is non-directional — never --up/--down). */
export const NEUTRAL_CHIP: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  height: 20,
  padding: "0 8px",
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.05em",
  color: "var(--text-2)",
  background: "var(--panel-2)",
  border: "1px solid var(--line-3)",
  borderRadius: "var(--r-pill)",
  whiteSpace: "nowrap",
};

export const LEGEND_ITEM: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  fontSize: 10.5,
  fontWeight: 500,
  color: "var(--text-2)",
};

export const LEGEND_SWATCH: React.CSSProperties = {
  width: 12,
  height: 3,
  borderRadius: 2,
  display: "inline-block",
};

/** Two-line honest empty body used inside every panel (title + why). */
export function PanelEmpty({ title, why, minHeight }: { title: string; why: string; minHeight: number }) {
  return (
    <div className="fin-empty" style={{ minHeight, flexDirection: "column", gap: 6 }}>
      <div className="fin-empty-title">{title}</div>
      <div className="fin-empty-why">{why}</div>
    </div>
  );
}
