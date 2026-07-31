"use client";
/**
 * MatrixGrid — strike rows × expiry cols heat matrix for PRISM.
 *
 * DESIGN TARGETS (MomoEdge parity pass):
 *   - ONE ROW PER CELL: each cell is a single compact value line; cell height ~22-26px.
 *     No two-line fat cells.
 *   - DTE-count toggle: 4 expiries (default, spacious) | 8 expiries (tighter).
 *     Rendered as chip buttons in the toolbar row.
 *   - Strike-range toggle: ±10 | ±20 | ±40 (default) strikes centered on spot.
 *     The broad default fills a full-height workspace; narrower views remain one click away.
 *   - Σ All column pinned at the right: sum/net across all visible expiries per strike.
 *   - Spot row: highlighted with var(--brand-2) teal chip showing spot price.
 *
 * Color normalization: PER-COLUMN (each expiry col) or GLOBAL.
 *
 * Cell color per lens:
 *   GEX  — signed diverging (green = positive/call-dominant, red = negative/put-dominant)
 *   OI   — sequential cyan (total OI)
 *   VOL  — sequential cyan (total VOL)
 *   DOI  — signed diverging (positive = added, negative = removed)
 *
 * Intensity: quantile-based 5-tier system matching prism_spec §4.
 * Level badges on strike rows (WALL/SUPPORT/FLIP/MAGNET/MAX PAIN).
 *
 * Hover tooltip: raw cell values + formula unit line.
 *
 * Props:
 *   cells          — MatrixPayload.cells
 *   expiries       — ordered list from MatrixPayload.expiries
 *   strikes        — ordered list (desc) from MatrixPayload.strikes
 *   spot           — MatrixPayload.spot
 *   levels         — MatrixPayload.levels
 *   activeLens     — which lens to color
 *   norm           — "column" | "global"
 *   dteColCount    — 4 | 8 — how many expiry columns to show (default 4)
 *   strikeRange    — 10 | 20 | 40 — strikes each side of spot (default 40)
 *   lang           — "en" | "zh"
 */

import React, { useMemo, useState, useCallback, useRef, useEffect } from "react";
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
  /** Number of expiry columns to show (4 = spacious, 8 = tighter). Default 4. */
  dteColCount?: 4 | 8;
  /** Strikes each side of spot (±10, ±20, ±40). Default 40. */
  strikeRange?: 10 | 20 | 40;
  lang: Lang;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtStrike(s: number): string {
  return s % 1 === 0 ? String(s) : s.toFixed(1);
}

function fmtExpShort(exp: string): string {
  try {
    const parts = expDate(exp).split("-");
    return `${parseInt(parts[1])}/${parseInt(parts[2])}`;
  } catch {
    return exp.slice(5);
  }
}

function expDate(exp: string): string {
  return (exp || "").split(" ")[0].split("T")[0];
}

function dteDays(exp: string): number {
  try {
    const now = Date.now();
    const ms = new Date(expDate(exp) + "T20:00:00Z").getTime();
    if (!Number.isFinite(ms)) return -1;
    return Math.round((ms - now) / 86_400_000);
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

function cellValue(cell: MatrixCell, lens: ActiveLens): number | null {
  switch (lens) {
    case "GEX": return cell.gex ?? null;
    case "OI":  return (cell.call_oi ?? 0) + (cell.put_oi ?? 0);
    case "VOL": return (cell.call_vol ?? 0) + (cell.put_vol ?? 0);
    case "DOI": return (cell.delta_oi?.call ?? 0) + (cell.delta_oi?.put ?? 0);
  }
}

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

/**
 * Heat fill. Signed lenses ride the --up-rgb / --down-rgb triplets so the
 * East-Asian red-up flip (html[data-updown="east"]) repaints the whole matrix;
 * the unsigned lenses (OI / VOL) ride the neutral brand accent because a
 * magnitude-only reading must never look directional.
 */
function cellBg(
  value: number | null,
  t5: 0 | 1 | 2 | 3 | 4 | 5,
  lens: ActiveLens
): string {
  if (t5 === 0) return "transparent";

  if (lens === "GEX" || lens === "DOI") {
    const isPos = (value ?? 0) >= 0;
    const alphas = [0, 0.06, 0.14, 0.26, 0.44, 0.70];
    const a = alphas[t5];
    return isPos
      ? `rgba(var(--up-rgb),${a})`
      : `rgba(var(--down-rgb),${a})`;
  }

  const pcts = [0, 7, 15, 27, 45, 72];
  return `color-mix(in srgb, var(--brand-2) ${pcts[t5]}%, transparent)`;
}

function cellTextColor(value: number | null, lens: ActiveLens, t5: number): string {
  if (t5 === 0) return "var(--text-3)";
  if (lens === "GEX" || lens === "DOI") {
    return (value ?? 0) >= 0
      ? "color-mix(in srgb, #fff 26%, var(--up))"
      : "color-mix(in srgb, #fff 26%, var(--down))";
  }
  return "color-mix(in srgb, #fff 26%, var(--brand-2))";
}

/** `tagKey` is a prismStrings key — the badge text is bilingual, never baked English. */
type BadgeInfo = {
  tagKey: "levelFlip" | "levelWall" | "levelSupport" | "levelMagnet" | "levelMaxPain";
  tone: "brand" | "down" | "signal" | "ai" | "neutral";
};

function strikeBadge(strike: number, levels: MatrixLevels, step: number): BadgeInfo | null {
  const prox = step * 1.2;
  const { gamma_flip, call_wall, put_support, hvl, max_pain } = levels;

  if (gamma_flip != null && Math.abs(strike - gamma_flip) < prox) {
    return { tagKey: "levelFlip", tone: "ai" };
  }
  if (call_wall != null && Math.abs(strike - call_wall) < prox) {
    return { tagKey: "levelWall", tone: "brand" };
  }
  if (put_support != null && Math.abs(strike - put_support) < prox) {
    return { tagKey: "levelSupport", tone: "down" };
  }
  if (hvl != null && Math.abs(strike - hvl) < prox) {
    return { tagKey: "levelMagnet", tone: "signal" };
  }
  if (max_pain != null && Math.abs(strike - max_pain) < prox) {
    return { tagKey: "levelMaxPain", tone: "neutral" };
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

/**
 * One token per tone — `.obs-tag` derives the badge's fill and ring from it, so a
 * badge can never drift out of the palette. (`--cat-2` used to sit here for FLIP and
 * is defined nowhere: the property fell back to inherit, so FLIP rendered untinted.)
 */
function badgeColor(tone: BadgeInfo["tone"]): string {
  switch (tone) {
    case "brand":   return "var(--brand-2)";
    case "down":    return "var(--down)";
    case "signal":  return "var(--signal)";
    case "ai":      return "var(--ai)";
    case "neutral": return "var(--text-2)";
  }
}

/** The five level markers, in badge precedence order — drives the legend under the grid. */
const LEGEND_ITEMS: BadgeInfo[] = [
  { tagKey: "levelFlip",    tone: "ai" },
  { tagKey: "levelWall",    tone: "brand" },
  { tagKey: "levelSupport", tone: "down" },
  { tagKey: "levelMagnet",  tone: "signal" },
  { tagKey: "levelMaxPain", tone: "neutral" },
];

// ─── Component ────────────────────────────────────────────────────────────────

export function MatrixGrid({
  cells,
  expiries,
  strikes,
  spot,
  levels,
  activeLens,
  norm = "column",
  dteColCount = 4,
  strikeRange = 40,
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

  // Filter expiries: only non-expired ones, then cap at dteColCount
  const filteredExpiries = useMemo(() => {
    const nonExpired = expiries.filter((e) => {
      const d = dteDays(e);
      return d >= 0;
    });
    return nonExpired.slice(0, dteColCount);
  }, [expiries, dteColCount]);

  // Sort all strikes descending
  const allStrikes = useMemo(
    () => [...strikes].sort((a, b) => b - a),
    [strikes]
  );

  // Spot strike = nearest strike to spot
  const spotStrike = useMemo(() => {
    if (spot == null || allStrikes.length === 0) return null;
    return allStrikes.reduce((best, s) =>
      Math.abs(s - spot) < Math.abs(best - spot) ? s : best
    );
  }, [spot, allStrikes]);

  // Apply strike range: take ±strikeRange strikes centered on spotStrike
  const sortedStrikes = useMemo(() => {
    if (spotStrike == null) return allStrikes.slice(0, strikeRange * 2 + 1);

    const spotIdx = allStrikes.indexOf(spotStrike);
    if (spotIdx < 0) return allStrikes.slice(0, strikeRange * 2 + 1);

    const start = Math.max(0, spotIdx - strikeRange);
    const end = Math.min(allStrikes.length, spotIdx + strikeRange + 1);
    return allStrikes.slice(start, end);
  }, [allStrikes, spotStrike, strikeRange]);

  const step = useMemo(() => estimateStep(sortedStrikes), [sortedStrikes]);

  // Compute per-column (or global) tier breaks
  const tierBreaks = useMemo(() => {
    if (norm === "global") {
      const mags = cells
        .map((c) => magnitudeOf(cellValue(c, activeLens)))
        .filter((v) => v > 0);
      const breaks = computeTierBreaks(mags);
      const out = new Map<string, [number, number, number, number]>();
      for (const exp of filteredExpiries) {
        out.set(exp, breaks);
      }
      // Also for Σ column
      out.set("__sigma__", breaks);
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
    // Σ column uses global breaks (aggregate of all visible cells)
    const sigMags = sortedStrikes.flatMap((s) =>
      filteredExpiries.map((e) => {
        const c = cellMap.get(`${s}|${e}`);
        return c ? magnitudeOf(cellValue(c, activeLens)) : 0;
      })
    ).filter((v) => v > 0);
    out.set("__sigma__", computeTierBreaks(sigMags));
    return out;
  }, [cells, filteredExpiries, sortedStrikes, cellMap, activeLens, norm]);

  // Σ (sum) value per strike across all visible expiries
  const sigmaByStrike = useMemo(() => {
    const m = new Map<number, number>();
    for (const strike of sortedStrikes) {
      let total = 0;
      let hasAny = false;
      for (const exp of filteredExpiries) {
        const c = cellMap.get(`${strike}|${exp}`);
        const v = c ? cellValue(c, activeLens) : null;
        if (v != null && Number.isFinite(v)) {
          total += v;
          hasAny = true;
        }
      }
      m.set(strike, hasAny ? total : 0);
    }
    return m;
  }, [sortedStrikes, filteredExpiries, cellMap, activeLens]);

  // Spot separator: insert below the row where strike >= spot and next row < spot
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

  // Auto-scroll spot row to the center of the matrix pane when strike range changes.
  // Only fires when the content overflows (normally the 40-depth default); at 10/20
  // it is a no-op because
  // scrollTop clamped to 0 equals the already-visible position.
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller || spotStrike == null) return;
    // Find the spot row index in sortedStrikes (descending order)
    const spotIdx = sortedStrikes.indexOf(spotStrike);
    if (spotIdx < 0) return;
    // Row height: 24px data row + 1px border. Header row ~36px. Separator ~2px.
    const HEADER_H = 36;
    const ROW_H = 25; // 24px cell + 1px border
    const spotTop = HEADER_H + spotIdx * ROW_H;
    const target = spotTop - scroller.clientHeight / 2 + ROW_H / 2;
    scroller.scrollTop = Math.max(0, target);
  }, [sortedStrikes, spotStrike, strikeRange]);

  if (filteredExpiries.length === 0 || sortedStrikes.length === 0) {
    return (
      <div style={GRID_OUTER}>
        <div style={EMPTY_MSG}>{t("noDataMatrix")}</div>
      </div>
    );
  }

  const sigmaBreaks = tierBreaks.get("__sigma__") ?? [0, 0, 0, 0];

  return (
    <div style={GRID_OUTER} ref={containerRef}>
      <div ref={scrollRef} style={{ overflowX: "auto", overflowY: "auto", flex: 1, minHeight: 0 }} className="obs-scroll">
        <table style={TABLE}>
          <thead>
            <tr>
              {/* Strike header */}
              <th className="obs-lbl" style={TH_STRIKE}>{t("colStrike")}</th>
              {/* Level badge header */}
              <th style={TH_BADGE} />
              {/* Expiry column headers */}
              {filteredExpiries.map((exp) => {
                const dte = dteDays(exp);
                const isMonthly = (() => {
                  try {
                    const d = new Date(expDate(exp));
                    return d.getDay() === 5 && d.getDate() >= 15 && d.getDate() <= 21;
                  } catch { return false; }
                })();
                return (
                  <th key={exp} style={TH_EXP}>
                    <div style={EXP_HEADER_WRAP}>
                      <span style={EXP_DATE}>
                        {fmtExpShort(exp)}
                        {isMonthly && <span style={MONTHLY_DOT} title="">·</span>}
                      </span>
                      <span style={EXP_DTE}>
                        {dte === 0 ? "0DTE" : `${dte}d`}
                      </span>
                    </div>
                  </th>
                );
              })}
              {/* Σ All column */}
              <th style={TH_SIGMA}>Σ</th>
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
              const sigmaVal = sigmaByStrike.get(strike) ?? null;
              const sigmaMag = magnitudeOf(sigmaVal ?? null);
              const sigmaT5 = tier(sigmaMag, sigmaBreaks);
              const sigmaBg = cellBg(sigmaVal, sigmaT5, activeLens);
              const sigmaText = fmtVal(sigmaVal, activeLens);

              return (
                <React.Fragment key={strike}>
                  {/* Spot separator line — inserted BEFORE the first row below spot */}
                  {rowIdx === (spotSepAfterIdx ?? -1) + 1 && spot != null && (
                    <tr style={{ height: 0 }}>
                      <td
                        colSpan={2 + filteredExpiries.length + 1}
                        style={SPOT_SEPARATOR}
                      />
                    </tr>
                  )}

                  <tr
                    style={{
                      ...STRIKE_ROW,
                      ...(isSpot ? SPOT_ROW : {}),
                    }}
                  >
                    {/* Strike label cell */}
                    <td style={{
                      ...TD_STRIKE,
                      background: isSpot ? SPOT_TINT : "var(--bg)",
                    }}>
                      {isSpot ? (
                        // Spot row: brand-tinted chip carrying the live spot price
                        <div style={SPOT_CHIP_WRAP}>
                          <span className="num" style={SPOT_CHIP_LABEL}>
                            {fmtStrike(strike)}
                          </span>
                          {spot != null && (
                            <span className="obs-tag num" style={SPOT_PRICE_CHIP}>
                              {spot.toFixed(2)}
                            </span>
                          )}
                        </div>
                      ) : (
                        <div style={STRIKE_WRAP}>
                          <span
                            className="num"
                            style={{
                              ...STRIKE_NUM,
                              color: badge
                                ? badgeColor(badge.tone)
                                : "var(--text-2)",
                              fontWeight: badge ? 700 : 400,
                            }}
                          >
                            {fmtStrike(strike)}
                          </span>
                          {spotPctStr && (
                            <span className="num" style={SPOT_PCT}>{spotPctStr}</span>
                          )}
                        </div>
                      )}
                    </td>

                    {/* Badge cell */}
                    <td style={{
                      ...TD_BADGE,
                      background: isSpot ? SPOT_TINT : "var(--bg)",
                    }}>
                      {badge && (
                        <span
                          className="obs-tag"
                          style={{ ...BADGE, "--c": badgeColor(badge.tone) } as React.CSSProperties}
                        >
                          {t(badge.tagKey)}
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
                      const textColor = cellTextColor(v, activeLens, t5);
                      const showText = t5 >= 1 && v != null && v !== 0;

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
                          {showText && (
                            <span
                              className="num"
                              style={{
                                ...CELL_TEXT,
                                color: textColor,
                                opacity: t5 === 1 ? 0.55 : 1,
                              }}
                            >
                              {displayText}
                            </span>
                          )}
                        </td>
                      );
                    })}

                    {/* Σ All cell */}
                    <td
                      style={{
                        ...TD_SIGMA,
                        background: sigmaBg,
                      }}
                    >
                      {sigmaT5 >= 1 && sigmaVal != null && sigmaVal !== 0 && (
                        <span
                          className="num"
                          style={{
                            ...CELL_TEXT,
                            color: cellTextColor(sigmaVal, activeLens, sigmaT5),
                            opacity: sigmaT5 === 1 ? 0.55 : 1,
                            fontWeight: 700,
                          }}
                        >
                          {sigmaText}
                        </span>
                      )}
                    </td>
                  </tr>
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Level-marker legend — the badge key, so a WALL/FLIP tag never needs decoding */}
      <div style={LEGEND_ROW}>
        <span className="obs-lbl">{t("legendTitle")}</span>
        {LEGEND_ITEMS.map((item) => (
          <span
            key={item.tagKey}
            className="obs-tag"
            style={{ ...BADGE, "--c": badgeColor(item.tone) } as React.CSSProperties}
          >
            {t(item.tagKey)}
          </span>
        ))}
        <span
          className="obs-tag"
          style={{ ...BADGE, "--c": "var(--brand-2)" } as React.CSSProperties}
        >
          {t("levelSpot")}
        </span>
      </div>

      {/* Hover tooltip */}
      {tooltip && (
        <div
          style={{
            ...TOOLTIP,
            left: Math.min(tooltip.x, (containerRef.current?.clientWidth ?? 400) - 210),
            top: Math.max(8, tooltip.y),
          }}
        >
          <div className="num" style={TIP_TITLE}>
            ${fmtStrike(tooltip.strike)}{" "}
            <span style={TIP_EXP}>{fmtExpShort(tooltip.expiry)}</span>{" "}
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
            /* Matches the grid's own signed fill: positive reads up, negative reads
               down. (It used to read brand-blue for positive, which said "neutral"
               about the exact number the cell had just painted green.) */
            highlight={
              (tooltip.cell.gex ?? 0) >= 0 ? "var(--up)" : "var(--down)"
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
          <div style={TIP_FORMULA}>{t(
            activeLens === "GEX" ? "gexFormulaUnit"
            : activeLens === "OI" ? "oiFormulaUnit"
            : activeLens === "VOL" ? "volFormulaUnit"
            : "doiFormulaUnit"
          )}</div>
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
      <span className="obs-lbl">{label}</span>
      <span className="num" style={{ ...TIP_VAL, ...(highlight ? { color: highlight } : {}) }}>
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

/** Type/colour come from `.obs-lbl` — only geometry stays inline. */
const TH_STRIKE: React.CSSProperties = {
  position: "sticky",
  top: 0,
  left: 0,
  zIndex: 4,
  background: "var(--panel)",
  padding: "4px 8px",
  borderBottom: "1px solid var(--line)",
  textAlign: "left",
  minWidth: 62,
};

const TH_BADGE: React.CSSProperties = {
  position: "sticky",
  top: 0,
  left: 62,
  zIndex: 4,
  background: "var(--panel)",
  padding: "4px 4px",
  borderBottom: "1px solid var(--line)",
  minWidth: 56,
};

const TH_EXP: React.CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 3,
  padding: "3px 6px",
  borderBottom: "1px solid var(--line)",
  borderLeft: "1px solid var(--line-2)",
  textAlign: "center",
  minWidth: 62,
  background: "var(--panel)",
};

const TH_SIGMA: React.CSSProperties = {
  padding: "3px 6px",
  borderBottom: "1px solid var(--line)",
  borderLeft: "2px solid var(--line)",
  textAlign: "center",
  minWidth: 66,
  background: "var(--panel)",
  fontSize: 10,
  color: "var(--brand-2)",
  fontWeight: 800,
  letterSpacing: "0.04em",
  position: "sticky",
  top: 0,
  right: 0,
  zIndex: 4,
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

const MONTHLY_DOT: React.CSSProperties = {
  color: "var(--brand-2)",
  marginLeft: 2,
  fontSize: 12,
  lineHeight: 0,
  verticalAlign: "middle",
};

// ── Row styles ───────────────────────────────────────────────────────────────

const STRIKE_ROW: React.CSSProperties = {
  transition: "background 0.06s",
};

/** Spot row: subtle brand ambient */
const SPOT_ROW: React.CSSProperties = {
  outline: "1px solid color-mix(in srgb, var(--brand-2) 28%, transparent)",
};

/** Sticky first/second column fill on the spot row (keeps them opaque while scrolling). */
const SPOT_TINT = "color-mix(in srgb, var(--brand-2) 6%, var(--bg))";

// ── Strike cell ──────────────────────────────────────────────────────────────

const TD_STRIKE: React.CSSProperties = {
  position: "sticky",
  left: 0,
  zIndex: 2,
  padding: "0 6px",
  borderBottom: "1px solid var(--line-2)",
  height: 24,
  verticalAlign: "middle",
  whiteSpace: "nowrap",
};

const STRIKE_WRAP: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 4,
};

const STRIKE_NUM: React.CSSProperties = {
  fontSize: 11,
  fontVariantNumeric: "tabular-nums",
};

const SPOT_PCT: React.CSSProperties = {
  fontSize: 8,
  color: "var(--muted)",
};

/** Spot row strike cell: teal chip pattern */
const SPOT_CHIP_WRAP: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 4,
};

const SPOT_CHIP_LABEL: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "var(--brand-2)",
  fontVariantNumeric: "tabular-nums",
};

/** Spot price chip — `.obs-tag` supplies the tint; only the dense metrics are inline. */
const SPOT_PRICE_CHIP: React.CSSProperties = {
  "--c": "var(--brand-2)",
  fontSize: 8,
  fontWeight: 700,
  padding: "1px 5px",
  letterSpacing: "0.01em",
} as React.CSSProperties;

// ── Badge cell ───────────────────────────────────────────────────────────────

const TD_BADGE: React.CSSProperties = {
  position: "sticky",
  left: 62,
  zIndex: 2,
  padding: "0 4px",
  borderBottom: "1px solid var(--line-2)",
  borderRight: "1px solid var(--line-2)",
  height: 24,
  verticalAlign: "middle",
};

/** Dense override for `.obs-tag` inside a 24px matrix row (and in the legend). */
const BADGE: React.CSSProperties = {
  fontSize: 7.5,
  fontWeight: 800,
  letterSpacing: "0.06em",
  padding: "2px 5px",
  gap: 3,
};

/** Legend strip under the grid — the level-badge key. */
const LEGEND_ROW: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--sp-2)",
  flexWrap: "wrap",
  padding: "var(--sp-2) 14px",
  borderTop: "1px solid var(--line-2)",
  background: "var(--panel)",
  flexShrink: 0,
};

// ── Data cells ───────────────────────────────────────────────────────────────

/** Standard data cell — the key "one row" constraint: height 24px, single line */
const TD_CELL: React.CSSProperties = {
  padding: "0 5px",
  height: 24,
  borderBottom: "1px solid var(--line-2)",
  borderLeft: "1px solid var(--line-2)",
  textAlign: "center",
  cursor: "default",
  transition: "background 0.08s",
  verticalAlign: "middle",
  whiteSpace: "nowrap",
};

/** Σ All column cell — pinned right, slightly heavier left border */
const TD_SIGMA: React.CSSProperties = {
  ...TD_CELL,
  borderLeft: "2px solid var(--line)",
  position: "sticky",
  right: 0,
  zIndex: 2,
  background: "var(--panel)",
  textAlign: "center",
};

const CELL_TEXT: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  fontVariantNumeric: "tabular-nums",
  letterSpacing: "-0.01em",
};

// ── Spot separator (thin brand accent line) ──────────────────────────────────

const SPOT_SEPARATOR: React.CSSProperties = {
  padding: 0,
  height: 2,
  background: "color-mix(in srgb, var(--brand-2) 45%, transparent)",
};

// ── Tooltip ──────────────────────────────────────────────────────────────────

const TOOLTIP: React.CSSProperties = {
  position: "absolute",
  background: "var(--panel-2)",
  border: "1px solid var(--line-3)",
  borderRadius: "var(--r-tile)",
  padding: "10px 12px",
  fontSize: 11,
  boxShadow: "var(--shadow-2)",
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

const TIP_EXP: React.CSSProperties = {
  color: "var(--text-2)",
  fontWeight: 600,
};

const TIP_DTE: React.CSSProperties = {
  fontSize: 9,
  color: "var(--muted)",
  fontWeight: 400,
  marginLeft: 3,
};

const TIP_SEP: React.CSSProperties = {
  height: 1,
  background: "var(--line-2)",
  margin: "4px 0",
};

const TIP_ROW: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "baseline",
  gap: 12,
  marginTop: 3,
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
