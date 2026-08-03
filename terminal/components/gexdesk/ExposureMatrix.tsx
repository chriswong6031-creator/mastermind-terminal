"use client";
/**
 * ExposureMatrix — the Exposure desk's strike × expiry matrix view (masterplan §5.3).
 *
 * This is where the retired PRISM tab's worthwhile half landed: the controls it did
 * better (expiry column count, 0DTE / ALL scope, strike window, per-column vs global
 * normalisation, the pinned Σ column, the level badges) now sit on the desk that
 * already owned the ladder, the levels and the gexstate feed.
 *
 * WHAT DID NOT COME ACROSS, and why:
 *   • PRISM's own grid renderer — it painted RAW gex on --up-rgb/--down-rgb, the
 *     opposite colouring of the same payload on the Positioning tab, and it inverted
 *     under html[data-updown="east"] on a quantity that is not a price direction.
 *     Both surfaces now render through components/shared/StrikeExpiryMatrix.
 *   • The GEX/VEX/UNUSUAL lens names — VEX and UNUSUAL were permanently disabled chips,
 *     and VEX is already a LIVE greek lens on this desk's ladder. The matrix speaks the
 *     Positioning card's metric set instead: net hedge / OI / volume / ΔOI.
 *   • OiMoversRail — a duplicate of the Screener tab's ΔOI Builds preset over the same
 *     flowGet("oi") payload. Not ported; the Screener owns that read.
 *
 * HONESTY: the matrix store is a NIGHTLY EOD snapshot. The provenance chip states the
 * session the CELLS describe — which is not always the ladder's session — and there is
 * deliberately no live chrome anywhere on this view.
 */

import React, { useMemo, useState } from "react";
import { makeGexT, type GexDeskKey } from "./gexStrings";
import type { Lang } from "@/lib/i18n";
import type { MatrixDoc } from "./matrixDoc";
import { MatrixConfluence } from "./MatrixConfluence";
import {
  StrikeExpiryMatrix,
  buildMatrixGrid,
  LEVEL_BADGE_COLORS,
  LEVEL_BADGE_ORDER,
  type LevelBadgeKey,
  type MatrixLevels,
  type MatrixMetric,
  type MatrixNorm,
  type MatrixScope,
} from "@/components/shared/StrikeExpiryMatrix";

// ─── Control vocabularies ─────────────────────────────────────────────────────

type Mode = "single" | "confluence";
type DteColCount = 4 | 8;
/** Strike window each side of spot, in PERCENT — comparable across roots, unlike a
 *  strike COUNT (PRISM's original), which meant ±40 dollars on SPY and ±200 on a
 *  $5-spaced name. */
type StrikeRangePct = 10 | 20 | 40;

const METRICS: { key: MatrixMetric; labelKey: GexDeskKey }[] = [
  { key: "hedge", labelKey: "mtxMetricHedge" },
  { key: "oi", labelKey: "mtxMetricOi" },
  { key: "vol", labelKey: "mtxMetricVol" },
  { key: "doi", labelKey: "mtxMetricDoi" },
];

const SCOPES: { key: MatrixScope; labelKey: GexDeskKey }[] = [
  { key: "default", labelKey: "scopeDefault" },
  { key: "0dte", labelKey: "scope0dte" },
  { key: "all", labelKey: "scopeAll" },
];

const RANGES: { key: StrikeRangePct; labelKey: GexDeskKey }[] = [
  { key: 10, labelKey: "range10" },
  { key: 20, labelKey: "range20" },
  { key: 40, labelKey: "range40" },
];

const NORMS: { key: MatrixNorm; labelKey: GexDeskKey }[] = [
  { key: "column", labelKey: "normColumn" },
  { key: "global", labelKey: "normGlobal" },
];

/** Row budget for the desk's matrix — roughly PRISM's ±40-strike depth. */
const DESK_MAX_ROWS = 81;

export interface ExposureMatrixProps {
  matrix: MatrixDoc | null;
  /** Merged levels — gexstate FIRST for the flip (see matrixDoc.mergeMatrixLevels). */
  levels: MatrixLevels;
  spot: number | null;
  /** Confluence mode refetches SPY/QQQ/IWM through the desk's own fetcher. */
  fetchMatrix: (root: string) => Promise<MatrixDoc | null>;
  lang: Lang;
}

export function ExposureMatrix({
  matrix,
  levels,
  spot,
  fetchMatrix,
  lang,
}: ExposureMatrixProps) {
  const t = makeGexT(lang);

  const [mode, setMode] = useState<Mode>("single");
  const [metric, setMetric] = useState<MatrixMetric>("hedge");
  const [scope, setScope] = useState<MatrixScope>("default");
  const [cols, setCols] = useState<DteColCount>(4);
  const [range, setRange] = useState<StrikeRangePct>(40);
  const [norm, setNorm] = useState<MatrixNorm>("column");

  // ALL scope widens the column budget and makes Σ the primary read (PRISM's rule).
  const effectiveCols: number = scope === "all" ? 8 : cols;

  const grid = useMemo(
    () =>
      buildMatrixGrid({
        matrix,
        spot,
        callWall: levels.call_wall,
        putWall: levels.put_support,
        metric,
        windowPct: range,
        maxRows: DESK_MAX_ROWS,
        maxCols: effectiveCols,
        normalization: norm,
        scope,
        withSigma: true,
      }),
    [matrix, spot, levels.call_wall, levels.put_support, metric, range, effectiveCols, norm, scope]
  );

  const badgeLabel = (k: LevelBadgeKey) => t(k);

  // Provenance: the session the CELLS describe. The desk's asof chip above speaks for
  // the gex ladder, which can run a different session than this store.
  const matrixSession = grid?.sessionDate || (matrix?.asof ?? "").slice(0, 10);

  return (
    <div style={OUTER}>
      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div style={TOOLBAR}>
        <div style={CHIP_GROUP} role="group" aria-label={t("mtxModeAria")}>
          {(["single", "confluence"] as Mode[]).map((m) => (
            <button
              key={m}
              className={`chip${mode === m ? " on" : ""}`}
              style={CHIP}
              aria-pressed={mode === m}
              onClick={() => setMode(m)}
            >
              {t(m === "single" ? "modeSingle" : "modeConfluence")}
            </button>
          ))}
        </div>

        <div style={SEP} />

        <div style={CHIP_GROUP} role="group" aria-label={t("mtxMetricAria")}>
          {METRICS.map((m) => (
            <button
              key={m.key}
              className={`chip${metric === m.key ? " on" : ""}`}
              style={CHIP}
              aria-pressed={metric === m.key}
              onClick={() => setMetric(m.key)}
            >
              {t(m.labelKey)}
            </button>
          ))}
        </div>

        {mode === "single" && (
          <>
            <div style={SEP} />

            <div style={CHIP_GROUP} role="group" aria-label={t("mtxColsAria")}>
              <span className="obs-lbl" style={GROUP_LBL}>{t("mtxColsLabel")}</span>
              {([4, 8] as DteColCount[]).map((n) => (
                <button
                  key={n}
                  className={`chip${cols === n && scope === "default" ? " on" : ""}`}
                  style={CHIP}
                  aria-pressed={cols === n && scope === "default"}
                  onClick={() => { setCols(n); setScope("default"); }}
                >
                  {n}
                </button>
              ))}
            </div>

            <div style={CHIP_GROUP} role="group" aria-label={t("mtxScopeAria")}>
              {SCOPES.map((sc) => (
                <button
                  key={sc.key}
                  className={`chip${scope === sc.key ? " on" : ""}`}
                  style={CHIP}
                  aria-pressed={scope === sc.key}
                  onClick={() => setScope(sc.key)}
                >
                  {t(sc.labelKey)}
                </button>
              ))}
            </div>

            <div style={SEP} />

            <div style={CHIP_GROUP} role="group" aria-label={t("mtxRangeAria")}>
              <span className="obs-lbl" style={GROUP_LBL}>{t("strikeRangeLabel")}</span>
              {RANGES.map((r) => (
                <button
                  key={r.key}
                  className={`chip${range === r.key ? " on" : ""}`}
                  style={CHIP}
                  aria-pressed={range === r.key}
                  onClick={() => setRange(r.key)}
                >
                  {t(r.labelKey)}
                </button>
              ))}
            </div>

            <div style={SEP} />

            <div style={CHIP_GROUP} role="group" aria-label={t("mtxNormAria")}>
              {NORMS.map((n) => (
                <button
                  key={n.key}
                  className={`chip${norm === n.key ? " on" : ""}`}
                  style={CHIP}
                  aria-pressed={norm === n.key}
                  onClick={() => setNorm(n.key)}
                >
                  {t(n.labelKey)}
                </button>
              ))}
            </div>
          </>
        )}

        {/* Provenance — nightly EOD, stated, with no live chrome anywhere near it. */}
        {mode === "single" && matrixSession && (
          <span style={PROV_CHIP} data-testid="matrix-asof">
            {t("mtxAsOfLabel")} <span className="num">{matrixSession}</span> · {t("mtxEodNote")}
          </span>
        )}
      </div>

      {/* ── Honesty banner (signed metrics only) ────────────────────────── */}
      {(metric === "hedge" || metric === "doi") && (
        <div className="obs-note" style={BANNER}>{t("magnitudeFirst")}</div>
      )}

      {/* ── Body ────────────────────────────────────────────────────────── */}
      {mode === "confluence" ? (
        <MatrixConfluence fetchMatrix={fetchMatrix} metric={metric} lang={lang} />
      ) : !grid ? (
        <div style={EMPTY}>{t("mtxNone")}</div>
      ) : (
        <>
          <StrikeExpiryMatrix
            grid={grid}
            metric={metric}
            variant="desk"
            levels={levels}
            badgeLabel={badgeLabel}
            showSigma
            sigmaAria={t("mtxSigmaAria")}
            spotLabel={t("levelSpot")}
            strikeLabel={t("colStrike")}
          />

          {/* Level-marker legend — the badge key, so a WALL/FLIP tag never needs decoding */}
          <div style={LEGEND_ROW}>
            <span className="obs-lbl">{t("legendTitle")}</span>
            {LEVEL_BADGE_ORDER.map((k) => (
              <span
                key={k}
                className="obs-tag"
                style={{ ...BADGE, "--c": LEVEL_BADGE_COLORS[k] } as React.CSSProperties}
              >
                {t(k)}
              </span>
            ))}
            <span
              className="obs-tag"
              style={{ ...BADGE, "--c": "var(--brand-2)" } as React.CSSProperties}
            >
              {t("levelSpot")}
            </span>
          </div>

          {/* Foot: what the colour means, and what the window cut. */}
          <div style={FOOT}>
            {t(metric === "hedge" ? "mtxHedgeLegend" : metric === "doi" ? "mtxDoiLegend" : "mtxMagLegend")}
            {" · "}
            {t("mtxWindow")
              .replace("{p}", String(range))
              .replace("{n}", String(grid.strikes.length))
              .replace("{full}", String(grid.nAll))
              .replace("{e}", String(grid.exps.length))}
            {grid.bucket > 0 && grid.strikes.length < grid.nAll
              ? ` · ${t("mtxBucket").replace("{b}", String(grid.bucket))}`
              : ""}
            {grid.nExpAll > grid.exps.length
              ? ` · ${t("mtxMoreExp").replace("{n}", String(grid.nExpAll - grid.exps.length))}`
              : ""}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const OUTER: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  background: "var(--bg)",
};

const TOOLBAR: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 4,
  padding: "5px 10px",
  borderBottom: "1px solid var(--line)",
  background: "var(--panel)",
  flexShrink: 0,
  flexWrap: "wrap",
};

const CHIP_GROUP: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 3,
};

const GROUP_LBL: React.CSSProperties = {
  marginRight: 2,
};

const CHIP: React.CSSProperties = {
  height: 22,
  padding: "0 8px",
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.03em",
};

const SEP: React.CSSProperties = {
  width: 1,
  height: 18,
  background: "var(--line)",
  margin: "0 3px",
  flexShrink: 0,
};

const PROV_CHIP: React.CSSProperties = {
  marginLeft: "auto",
  fontSize: 9,
  color: "var(--muted)",
  fontVariantNumeric: "tabular-nums",
  whiteSpace: "nowrap",
};

const BANNER: React.CSSProperties = {
  margin: 0,
  borderRadius: 0,
  borderLeft: "none",
  borderRight: "none",
  borderTop: "none",
  padding: "4px 10px",
  fontSize: 9,
  flexShrink: 0,
};

const LEGEND_ROW: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--sp-2)",
  flexWrap: "wrap",
  padding: "var(--sp-2) 10px",
  borderTop: "1px solid var(--line-2)",
  background: "var(--panel)",
  flexShrink: 0,
};

const BADGE: React.CSSProperties = {
  fontSize: 7.5,
  fontWeight: 800,
  letterSpacing: "0.06em",
  padding: "2px 5px",
  gap: 3,
};

const FOOT: React.CSSProperties = {
  padding: "4px 10px 6px",
  fontSize: 9,
  color: "var(--muted)",
  lineHeight: 1.5,
  borderTop: "1px solid var(--line-2)",
  background: "var(--panel)",
  flexShrink: 0,
};

const EMPTY: React.CSSProperties = {
  flex: 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 12,
  color: "var(--muted)",
  padding: "var(--sp-5)",
  textAlign: "center",
};
