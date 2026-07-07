"use client";
/**
 * MatrixGrid — strike rows × expiry cols heat matrix for PRISM.
 *
 * Color normalization: PER-COLUMN (each expiry column normalized to its own max).
 * Global norm is also supported via the norm prop.
 *
 * Cell color per lens:
 *   GEX  — signed diverging (green = positive/call-dominant, red = negative/put-dominant)
 *   OI   — sequential cyan (call or put OI, always ≥0)
 *   VOL  — sequential cyan
 *   DOI  — signed diverging (positive = added, negative = removed)
 *
 * Color intensity: quantile-based tiers (5 tiers, q20/q40/q60/q80 breakpoints),
 * matching prism_spec §4. Cells below P_FAINT (q75) are near-transparent.
 *
 * Level badges on their strike rows (WALL/SUPPORT/FLIP/MAGNET/MAX PAIN).
 * Spot separator line between rows straddling spot.
 *
 * Hover tooltip: ALL raw cell values + GEX formula unit line ("$ gamma per 1% move — dealer-sign assumed").
 * Keyboard 1/2/3/4 lens switching is handled in LensBar (not re-wired here).
 *
 * Props:
 *   cells       — from MatrixPayload.cells
 *   expiries    — ordered list from MatrixPayload.expiries
 *   strikes     — ordered list (desc) from MatrixPayload.strikes
 *   spot        — MatrixPayload.spot
 *   levels      — MatrixPayload.levels
 *   activeLens  — which lens to color
 *   norm        — "column" (default) | "global"
 *   dteFilter   — max DTE to include (null = all)
 *   lang        — "en" | "zh"
 */

import React, { useMemo, useState, useCallback, useRef } from "react";
import { makePrismT } from "./prismStrings";
import type { ActiveLens } from "./LensBar";
import type { Lang } from "@/lib/i18n";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MatrixCell {
  strike: number;
  expiry: string;
  gex: number | null;
  call_oi: number | null;
  put_oi: number | null;
  call_vol: number | null;
  put_vol: number | null;
  delta_oi?: { call: number | null; put: number | null } | null;
  unusual?: { ratio: number; samples: number; side: string } | null;
}

export interface MatrixLevels {
  call_wall?: number | null;
  put_support?: number | null;
  hvl?: number | null;
  gamma_flip?: number | null;
  max_pain?: number | null;
}

interface TooltipData {
  strike: number;
  expiry: string;
  cell: MatrixCell;
  x: number;
  y: number;
}

interface MatrixGridProps {
  cells: MatrixCell[];
  expiries: string[];
  strikes: number[];
  spot: number | null;
  levels: MatrixLevels;
  activeLens: ActiveLens;
  norm?: "column" | "global";
  dteFilter?: number | null;
  lang: Lang;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtStrike(s: number): string {
  return s % 1 === 0 ? String(s) : s.toFixed(1);
}

function fmtExpShort(exp: string): string {
  // "2026-07-18" -> "7/18"
  try {
    const parts = exp.split("-");
    return `${parseInt(parts[1])}/${parseInt(parts[2])}`;
  } catch {
    return exp.slice(5);
  }
}

function dteDays(exp: string): number {
  try {
    const now = Date.now();
    const ms = new Date(exp + "T20:00:00Z").getTime();
    return Math.max(0, Math.round((ms - now) / 86_400_000));
  } catch {
    return 0;
  }
}

function fmtVal(v: number | null | undefined, lens: ActiveLens): string {
  if (v == null || !Number.isFinite(v)) return "—";
  if (lens === "GEX") {
    const sign = v >= 0 ? "+" : "-";
    const abs = Math.abs(v);
    if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(1)}B`;
    if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
    if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(0)}K`;
    return `${sign}$${abs.toFixed(0)}`;
  }
  // OI / VOL / DOI in contracts
  const sign = v >= 0 ? "+" : "-";
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(0)}K`;
  return `${sign}${abs.toFixed(0)}`;
}

function fmtRaw(n: number | null | undefined): string {
  if (n == null) return "—";
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(Math.round(n));
}

/** Extract the display value for a cell under the active lens */
function cellValue(cell: MatrixCell, lens: ActiveLens): number | null {
  switch (lens) {
    case "GEX": return cell.gex ?? null;
    case "OI":  return (cell.call_oi ?? 0) + (cell.put_oi ?? 0);
    case "VOL": return (cell.call_vol ?? 0) + (cell.put_vol ?? 0);
    case "DOI": return (cell.delta_oi?.call ?? 0) + (cell.delta_oi?.put ?? 0);
  }
}

/** Quantile-based intensity tiers (prism_spec §4) */
function computeTierBreaks(mags: number[]): [number, number, number, number] {
  const sorted = [...mags].filter((v) => v > 0).sort((a, b) => a - b);
  if (sorted.length === 0) return [0, 0, 0, 0];
  const q = (p: number) => sorted[Math.floor(p * sorted.length)] ?? 0;
  return [q(0.20), q(0.40), q(0.60), q(0.80)];
}

function magnitudeOf(v: number | null): number {
  return v == null ? 0 : Math.abs(v);
}

function tier(mag: number, breaks: [number, number, number, number]): 0 | 1 | 2 | 3 | 4 | 5 {
  if (mag <= 0) return 0;
  if (mag < breaks[0]) return 1;
  if (mag < breaks[1]) return 2;
  if (mag < breaks[2]) return 3;
  if (mag < breaks[3]) return 4;
  return 5;
}

/** Cell background color for a given tier and lens/sign */
function cellBg(
  value: number | null,
  t5: 0 | 1 | 2 | 3 | 4 | 5,
  lens: ActiveLens
): string {
  if (t5 === 0) return "transparent";

  // For signed lenses (GEX, DOI): green = positive, red = negative
  if (lens === "GEX" || lens === "DOI") {
    const isPos = (value ?? 0) >= 0;
    const alphas = [0, 0.06, 0.14, 0.26, 0.44, 0.70];
    const a = alphas[t5];
    return isPos
      ? `rgba(77,210,120,${a})`   // green for positive (call-dominant / OI added)
      : `rgba(240,86,107,${a})`;  // red for negative (put-dominant / OI removed)
  }

  // Sequential cyan for OI / VOL
  const alphas = [0, 0.07, 0.15, 0.27, 0.45, 0.72];
  return `rgba(77,210,200,${alphas[t5]})`;
}

/** Classify a strike to a level badge */
type BadgeInfo = { tag: string; tone: "cyan" | "red" | "amber" | "purple" | "orange" };

function strikeBadge(strike: number, levels: MatrixLevels, step: number): BadgeInfo | null {
  const prox = step * 1.2;
  const { gamma_flip, call_wall, put_support, hvl, max_pain } = levels;

  if (gamma_flip != null && Math.abs(strike - gamma_flip) < prox) {
    return { tag: "FLIP", tone: "purple" };
  }
  if (call_wall != null && Math.abs(strike - call_wall) < prox) {
    return { tag: "WALL", tone: "cyan" };
  }
  if (put_support != null && Math.abs(strike - put_support) < prox) {
    return { tag: "SUPPORT", tone: "red" };
  }
  if (hvl != null && Math.abs(strike - hvl) < prox) {
    return { tag: "MAGNET", tone: "amber" };
  }
  if (max_pain != null && Math.abs(strike - max_pain) < prox) {
    return { tag: "MAX PAIN", tone: "orange" };
  }
  return null;
}

function estimateStep(strikes: number[]): number {
  if (strikes.length < 2) return 5;
  const sorted = [...strikes].sort((a, b) => a - b);
  const diffs = sorted.slice(1).map((s, i) => s - sorted[i]).filter((d) => d > 0);
  if (diffs.length === 0) return 5;
  diffs.sort((a, b) => a - b);
  return diffs[Math.floor(diffs.length / 2)];
}

function badgeColor(tone: BadgeInfo["tone"]): string {
  switch (tone) {
    case "cyan":   return "var(--brand-2)";
    case "red":    return "var(--down)";
    case "amber":  return "var(--signal)";
    case "purple": return "var(--cat-2)";
    case "orange": return "rgba(240,140,60,0.9)";
  }
}

function badgeBorder(tone: BadgeInfo["tone"]): string {
  switch (tone) {
    case "cyan":   return "rgba(77,130,255,0.35)";
    case "red":    return "rgba(240,86,107,0.35)";
    case "amber":  return "rgba(232,179,57,0.35)";
    case "purple": return "rgba(157,134,255,0.35)";
    case "orange": return "rgba(240,140,60,0.3)";
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function MatrixGrid({
  cells,
  expiries,
  strikes,
  spot,
  levels,
  activeLens,
  norm = "column",
  dteFilter = null,
  lang,
}: MatrixGridProps) {
  const t = makePrismT(lang);
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);

  // Build a cell lookup map
  const cellMap = useMemo(() => {
    const m = new Map<string, MatrixCell>();
    for (const c of cells) {
      m.set(`${c.strike}|${c.expiry}`, c);
    }
    return m;
  }, [cells]);

  // Filter expiries by DTE
  const filteredExpiries = useMemo(() => {
    if (!dteFilter) return expiries;
    return expiries.filter((e) => dteDays(e) <= dteFilter);
  }, [expiries, dteFilter]);

  // Sort strikes descending (highest at top)
  const sortedStrikes = useMemo(
    () => [...strikes].sort((a, b) => b - a),
    [strikes]
  );

  // Find spot row (nearest strike to spot)
  const spotStrike = useMemo(() => {
    if (spot == null || sortedStrikes.length === 0) return null;
    return sortedStrikes.reduce((best, s) =>
      Math.abs(s - spot) < Math.abs(best - spot) ? s : best
    );
  }, [spot, sortedStrikes]);

  const step = useMemo(() => estimateStep(sortedStrikes), [sortedStrikes]);

  // Compute per-column (or global) tier breaks per lens
  const tierBreaks = useMemo(() => {
    if (norm === "global") {
      // One set of breaks across all cells
      const mags = cells
        .map((c) => magnitudeOf(cellValue(c, activeLens)))
        .filter((v) => v > 0);
      const breaks = computeTierBreaks(mags);
      const out = new Map<string, [number, number, number, number]>();
      for (const exp of filteredExpiries) {
        out.set(exp, breaks);
      }
      return out;
    }
    // Per-column
    const out = new Map<string, [number, number, number, number]>();
    for (const exp of filteredExpiries) {
      const mags = sortedStrikes
        .map((s) => {
          const c = cellMap.get(`${s}|${exp}`);
          return c ? magnitudeOf(cellValue(c, activeLens)) : 0;
        })
        .filter((v) => v > 0);
      out.set(exp, computeTierBreaks(mags));
    }
    return out;
  }, [cells, filteredExpiries, sortedStrikes, cellMap, activeLens, norm]);

  // Find spot separator row index (insert below the row where strike >= spot and next is < spot)
  const spotSepAfterIdx = useMemo(() => {
    if (spot == null) return null;
    for (let i = 0; i < sortedStrikes.length - 1; i++) {
      if (sortedStrikes[i] >= spot && sortedStrikes[i + 1] < spot) {
        return i;
      }
    }
    return null;
  }, [sortedStrikes, spot]);

  const handleMouseEnter = useCallback(
    (strike: number, expiry: string, e: React.MouseEvent) => {
      const c = cellMap.get(`${strike}|${expiry}`);
      if (!c) return;
      const rect = containerRef.current?.getBoundingClientRect();
      setTooltip({
        strike,
        expiry,
        cell: c,
        x: e.clientX - (rect?.left ?? 0) + 12,
        y: e.clientY - (rect?.top ?? 0) - 8,
      });
    },
    [cellMap]
  );

  const handleMouseLeave = useCallback(() => setTooltip(null), []);

  if (filteredExpiries.length === 0 || sortedStrikes.length === 0) {
    return (
      <div style={GRID_OUTER}>
        <div style={EMPTY_MSG}>{t("noDataMatrix")}</div>
      </div>
    );
  }

  return (
    <div style={GRID_OUTER} ref={containerRef}>
      <div style={{ overflowX: "auto", overflowY: "auto", flex: 1, minHeight: 0 }}>
        <table style={TABLE}>
          <thead>
            <tr>
              {/* Strike header cell */}
              <th style={TH_STRIKE}>{t("colStrike")}</th>
              {/* Level badge header cell */}
              <th style={TH_BADGE} />
              {/* Expiry column headers */}
              {filteredExpiries.map((exp) => {
                const dte = dteDays(exp);
                return (
                  <th key={exp} style={TH_EXP}>
                    <div style={EXP_HEADER_WRAP}>
                      <span style={EXP_DATE}>{fmtExpShort(exp)}</span>
                      <span style={EXP_DTE}>
                        {dte === 0 ? "0DTE" : `${dte}d`}
                      </span>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sortedStrikes.map((strike, rowIdx) => {
              const isSpot = strike === spotStrike;
              const badge = strikeBadge(strike, levels, step);
              const spotPctStr =
                spot != null
                  ? `${((strike - spot) / spot * 100).toFixed(1)}%`
                  : null;

              return (
                <React.Fragment key={strike}>
                  {/* Spot separator line */}
                  {rowIdx === (spotSepAfterIdx ?? -1) + 1 && spot != null && (
                    <tr style={{ height: 0 }}>
                      <td
                        colSpan={2 + filteredExpiries.length}
                        style={SPOT_SEPARATOR}
                      >
                        <div style={SPOT_SEP_LINE}>
                          <span style={SPOT_SEP_LABEL}>
                            {t("levelSpot")} {spot.toFixed(2)}
                          </span>
                        </div>
                      </td>
                    </tr>
                  )}

                  <tr
                    style={{
                      ...STRIKE_ROW,
                      ...(isSpot ? SPOT_ROW : {}),
                    }}
                  >
                    {/* Strike cell */}
                    <td style={TD_STRIKE}>
                      <span
                        style={{
                          ...STRIKE_NUM,
                          color: isSpot
                            ? "var(--signal)"
                            : badge
                            ? badgeColor(badge.tone)
                            : "var(--text-2)",
                          fontWeight: isSpot || badge ? 700 : 400,
                        }}
                      >
                        {fmtStrike(strike)}
                      </span>
                      {spotPctStr && (
                        <span style={SPOT_PCT}>{spotPctStr}</span>
                      )}
                    </td>

                    {/* Badge cell */}
                    <td style={TD_BADGE}>
                      {badge && (
                        <span
                          style={{
                            ...BADGE,
                            color: badgeColor(badge.tone),
                            borderColor: badgeBorder(badge.tone),
                          }}
                        >
                          {badge.tag}
                        </span>
                      )}
                    </td>

                    {/* Data cells */}
                    {filteredExpiries.map((exp) => {
                      const cell = cellMap.get(`${strike}|${exp}`);
                      const v = cell ? cellValue(cell, activeLens) : null;
                      const mag = magnitudeOf(v);
                      const breaks = tierBreaks.get(exp) ?? [0, 0, 0, 0];
                      const t5 = tier(mag, breaks);
                      const bg = cellBg(v, t5, activeLens);
                      const displayText = fmtVal(v, activeLens);

                      return (
                        <td
                          key={exp}
                          style={{
                            ...TD_CELL,
                            background: bg,
                          }}
                          onMouseEnter={(e) =>
                            cell && handleMouseEnter(strike, exp, e)
                          }
                          onMouseLeave={handleMouseLeave}
                        >
                          {t5 >= 2 && (
                            <span
                              style={{
                                ...CELL_TEXT,
                                color:
                                  activeLens === "GEX" || activeLens === "DOI"
                                    ? (v ?? 0) >= 0
                                      ? "rgba(100,230,150,0.95)"
                                      : "rgba(240,120,130,0.95)"
                                    : "rgba(77,210,200,0.95)",
                              }}
                            >
                              {displayText}
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Hover tooltip */}
      {tooltip && (
        <div
          style={{
            ...TOOLTIP,
            left: Math.min(tooltip.x, (containerRef.current?.clientWidth ?? 400) - 210),
            top: tooltip.y,
          }}
        >
          <div style={TIP_TITLE}>
            ${fmtStrike(tooltip.strike)} · {fmtExpShort(tooltip.expiry)}{" "}
            <span style={TIP_DTE}>
              {dteDays(tooltip.expiry) === 0 ? "0DTE" : `${dteDays(tooltip.expiry)}d`}
            </span>
          </div>
          <div style={TIP_SEP} />
          <TipRow label={t("tipCallOi")} value={fmtRaw(tooltip.cell.call_oi)} />
          <TipRow label={t("tipPutOi")} value={fmtRaw(tooltip.cell.put_oi)} />
          <TipRow label={t("tipCallVol")} value={fmtRaw(tooltip.cell.call_vol)} />
          <TipRow label={t("tipPutVol")} value={fmtRaw(tooltip.cell.put_vol)} />
          <TipRow
            label={t("tipNetGex")}
            value={fmtVal(tooltip.cell.gex ?? null, "GEX")}
            highlight={
              (tooltip.cell.gex ?? 0) >= 0 ? "var(--brand-2)" : "var(--down)"
            }
          />
          {tooltip.cell.delta_oi && (
            <TipRow
              label={t("tipDoi")}
              value={fmtVal(
                (tooltip.cell.delta_oi.call ?? 0) + (tooltip.cell.delta_oi.put ?? 0),
                "DOI"
              )}
            />
          )}
          <div style={TIP_SEP} />
          {/* Formula unit line — verbatim from spec */}
          <div style={TIP_FORMULA}>{t("gexFormulaUnit")}</div>
        </div>
      )}
    </div>
  );
}

// ─── Tooltip row helper ────────────────────────────────────────────────────────

function TipRow({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: string;
}) {
  return (
    <div style={TIP_ROW}>
      <span style={TIP_KEY}>{label}</span>
      <span style={{ ...TIP_VAL, ...(highlight ? { color: highlight } : {}) }}>
        {value}
      </span>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const GRID_OUTER: React.CSSProperties = {
  position: "relative",
  flex: 1,
  minHeight: 0,
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  background: "var(--bg)",
};

const EMPTY_MSG: React.CSSProperties = {
  flex: 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 12,
  color: "var(--muted)",
};

const TABLE: React.CSSProperties = {
  borderCollapse: "collapse",
  width: "100%",
  fontSize: 10,
  fontVariantNumeric: "tabular-nums",
};

const TH_STRIKE: React.CSSProperties = {
  position: "sticky",
  left: 0,
  zIndex: 3,
  background: "var(--panel)",
  padding: "4px 8px",
  borderBottom: "1px solid var(--line)",
  fontSize: 9,
  color: "var(--muted)",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  textAlign: "left",
  minWidth: 70,
  fontWeight: 600,
};

const TH_BADGE: React.CSSProperties = {
  position: "sticky",
  left: 70,
  zIndex: 3,
  background: "var(--panel)",
  padding: "4px 4px",
  borderBottom: "1px solid var(--line)",
  minWidth: 68,
};

const TH_EXP: React.CSSProperties = {
  padding: "4px 8px",
  borderBottom: "1px solid var(--line)",
  borderLeft: "1px solid var(--line-2)",
  textAlign: "center",
  minWidth: 72,
  background: "var(--panel)",
};

const EXP_HEADER_WRAP: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 1,
};

const EXP_DATE: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: "var(--text-2)",
  fontVariantNumeric: "tabular-nums",
};

const EXP_DTE: React.CSSProperties = {
  fontSize: 8,
  color: "var(--muted)",
};

const STRIKE_ROW: React.CSSProperties = {
  transition: "background 0.08s",
};

const SPOT_ROW: React.CSSProperties = {
  background: "rgba(232,179,57,0.05)",
  outline: "1px solid rgba(232,179,57,0.18)",
};

const TD_STRIKE: React.CSSProperties = {
  position: "sticky",
  left: 0,
  zIndex: 2,
  background: "var(--bg)",
  padding: "3px 8px",
  borderBottom: "1px solid var(--line-2)",
  whiteSpace: "nowrap",
};

const TD_BADGE: React.CSSProperties = {
  position: "sticky",
  left: 70,
  zIndex: 2,
  background: "var(--bg)",
  padding: "3px 4px",
  borderBottom: "1px solid var(--line-2)",
  borderRight: "1px solid var(--line-2)",
};

const STRIKE_NUM: React.CSSProperties = {
  fontSize: 11,
  fontVariantNumeric: "tabular-nums",
  display: "block",
};

const SPOT_PCT: React.CSSProperties = {
  fontSize: 8,
  color: "var(--muted)",
  display: "block",
};

const BADGE: React.CSSProperties = {
  fontSize: 7,
  fontWeight: 900,
  letterSpacing: "0.07em",
  padding: "1px 3px",
  borderRadius: 2,
  border: "1px solid",
  display: "inline-block",
  whiteSpace: "nowrap",
};

const TD_CELL: React.CSSProperties = {
  padding: "0 4px",
  height: 20,
  borderBottom: "1px solid var(--line-2)",
  borderLeft: "1px solid var(--line-2)",
  textAlign: "center",
  cursor: "default",
  transition: "background 0.1s",
  verticalAlign: "middle",
};

const CELL_TEXT: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 600,
  fontVariantNumeric: "tabular-nums",
  letterSpacing: "-0.02em",
};

const SPOT_SEPARATOR: React.CSSProperties = {
  padding: 0,
  height: 0,
};

const SPOT_SEP_LINE: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  height: 18,
  borderTop: "2px solid rgba(232,179,57,0.45)",
  background: "rgba(232,179,57,0.04)",
  paddingLeft: 8,
};

const SPOT_SEP_LABEL: React.CSSProperties = {
  fontSize: 8,
  color: "var(--signal)",
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  fontVariantNumeric: "tabular-nums",
};

// ── Tooltip ─────────────────────────────────────────────────────────────────

const TOOLTIP: React.CSSProperties = {
  position: "absolute",
  background: "var(--panel-2)",
  border: "1px solid var(--line-3)",
  borderRadius: "var(--r-md)",
  padding: "8px 10px",
  fontSize: 11,
  boxShadow: "var(--shadow-1)",
  pointerEvents: "none",
  zIndex: 100,
  minWidth: 200,
};

const TIP_TITLE: React.CSSProperties = {
  fontWeight: 700,
  color: "var(--text)",
  marginBottom: 5,
  fontVariantNumeric: "tabular-nums",
};

const TIP_DTE: React.CSSProperties = {
  fontSize: 9,
  color: "var(--muted)",
  fontWeight: 400,
  marginLeft: 4,
};

const TIP_SEP: React.CSSProperties = {
  height: 1,
  background: "var(--line-2)",
  margin: "4px 0",
};

const TIP_ROW: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  marginTop: 2,
};

const TIP_KEY: React.CSSProperties = {
  color: "var(--muted)",
};

const TIP_VAL: React.CSSProperties = {
  color: "var(--text)",
  fontVariantNumeric: "tabular-nums",
  fontWeight: 600,
};

const TIP_FORMULA: React.CSSProperties = {
  fontSize: 9,
  color: "var(--muted)",
  fontStyle: "italic",
  marginTop: 2,
};
