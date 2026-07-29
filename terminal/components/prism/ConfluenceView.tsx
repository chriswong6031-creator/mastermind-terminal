"use client";
/**
 * ConfluenceView — SPY + QQQ + IWM side-by-side aligned GEX matrix.
 *
 * Fetches matrix for SPY, QQQ, IWM independently.
 * Normalizes strikes to % from spot in fixed PR_CONF_BANDS buckets (prism_spec §11):
 *   [-2.4, -2.0, -1.6, -1.2, -0.8, -0.4, 0, +0.4, +0.8, +1.2, +1.6, +2.0, +2.4]
 *   (13 rows, each maps nearest actual strike to its % offset)
 *
 * Lens is the parent's activeLens but GEX is the primary confluence lens.
 * Alignment chips: when flip/wall/support levels from gexstate land within 0.5%
 * across >= 2 indices, a chip appears in an "alignment" column.
 *
 * HONESTY DOCTRINE:
 *   - "descriptive — not a recommendation" note on the panel header.
 *   - "Index-only, descriptive" note under the alignment legend.
 *   - No "signal" language; alignment = structural observation.
 *   - Sign is assumed dealer-convention, caveated via magnitudeFirst banner.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { makePrismT } from "./prismStrings";
import type { ActiveLens } from "./LensBar";
import type { Lang } from "@/lib/i18n";
import type { MatrixPayload } from "./PrismView";

// ─── Constants (prism_spec §11 PR_CONF_BANDS) ─────────────────────────────────

const PR_CONF_BANDS = [2.4, 2.0, 1.6, 1.2, 0.8, 0.4, 0, -0.4, -0.8, -1.2, -1.6, -2.0, -2.4];

const CONF_INDICES = ["SPY", "QQQ", "IWM"] as const;
type ConfIndex = typeof CONF_INDICES[number];

const ALIGNMENT_THRESHOLD = 0.5; // % — levels within this are "aligned"

// ─── Types ────────────────────────────────────────────────────────────────────

interface ConfluenceViewProps {
  fetchMatrix: (root: string) => Promise<MatrixPayload | null>;
  activeLens: ActiveLens;
  lang: Lang;
}

interface IndexData {
  payload: MatrixPayload | null;
  loading: boolean;
  error: boolean;
}

interface BucketRow {
  pct: number;          // % offset (e.g. +1.2, 0.0, -0.8)
  values: Record<ConfIndex, number | null>;  // GEX sum per index for nearest strike
  nearestStrikes: Record<ConfIndex, number | null>;
}

/** prismStrings keys for the five structural level markers (shared with MatrixGrid). */
type LevelKey = "levelFlip" | "levelWall" | "levelSupport" | "levelMagnet";

interface AlignmentChip {
  pct: number;
  level: LevelKey;
  indices: ConfIndex[];
  count: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function nearestBucket(pct: number): number {
  let best = PR_CONF_BANDS[0];
  let bestDist = Infinity;
  for (const b of PR_CONF_BANDS) {
    const d = Math.abs(pct - b);
    if (d < bestDist) { bestDist = d; best = b; }
  }
  return best;
}

function fmtPct(p: number): string {
  const sign = p >= 0 ? "+" : "";
  return `${sign}${p.toFixed(1)}%`;
}

function fmtGex(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const sign = v >= 0 ? "+" : "-";
  const abs = Math.abs(v);
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(0)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

function computeBucketRows(payloads: Record<ConfIndex, MatrixPayload | null>): BucketRow[] {
  return PR_CONF_BANDS.map((band) => {
    const values: Record<ConfIndex, number | null> = { SPY: null, QQQ: null, IWM: null };
    const nearestStrikes: Record<ConfIndex, number | null> = { SPY: null, QQQ: null, IWM: null };

    for (const idx of CONF_INDICES) {
      const payload = payloads[idx];
      if (!payload?.cells || payload.spot == null) continue;
      const spot = payload.spot;

      // Find the actual strike nearest this band's pct offset
      let bestStrike: number | null = null;
      let bestDist = Infinity;
      for (const s of payload.strikes) {
        const strikePct = ((s - spot) / spot) * 100;
        const d = Math.abs(strikePct - band);
        if (d < bestDist) { bestDist = d; bestStrike = s; }
      }
      if (bestStrike == null || bestDist > 0.8) continue; // tolerance 0.8%

      nearestStrikes[idx] = bestStrike;

      // Sum GEX for this strike across all expiries (near-term only, use first expiry)
      const firstExp = payload.expiries[0];
      if (!firstExp) continue;
      const cell = payload.cells.find(
        (c) => c.strike === bestStrike && c.expiry === firstExp
      );
      values[idx] = cell?.gex ?? null;
    }

    return { pct: band, values, nearestStrikes };
  });
}

function detectAlignments(payloads: Record<ConfIndex, MatrixPayload | null>): AlignmentChip[] {
  const chips: AlignmentChip[] = [];
  // `label` is a prismStrings key so the chip text is bilingual, never baked English.
  const levelTypes: { key: keyof MatrixPayload["levels"]; label: LevelKey }[] = [
    { key: "gamma_flip",   label: "levelFlip" },
    { key: "call_wall",    label: "levelWall" },
    { key: "put_support",  label: "levelSupport" },
    { key: "hvl",          label: "levelMagnet" },
  ];

  for (const { key, label } of levelTypes) {
    const pcts: { idx: ConfIndex; pct: number }[] = [];
    for (const idx of CONF_INDICES) {
      const p = payloads[idx];
      if (!p || !p.levels || p.spot == null) continue;
      const levelVal = p.levels[key];
      if (levelVal == null) continue;
      const pct = ((levelVal - p.spot) / p.spot) * 100;
      pcts.push({ idx, pct });
    }

    if (pcts.length < 2) continue;

    const pctValues = pcts.map((x) => x.pct);
    const spread = Math.max(...pctValues) - Math.min(...pctValues);
    if (spread > ALIGNMENT_THRESHOLD) continue;

    const avgPct = pctValues.reduce((a, b) => a + b, 0) / pctValues.length;
    const bucket = nearestBucket(avgPct);

    chips.push({
      pct: bucket,
      level: label,
      indices: pcts.map((x) => x.idx),
      count: pcts.length,
    });
  }

  return chips;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ConfluenceView({ fetchMatrix, activeLens, lang }: ConfluenceViewProps) {
  const t = makePrismT(lang);

  const [data, setData] = useState<Record<ConfIndex, IndexData>>({
    SPY: { payload: null, loading: true, error: false },
    QQQ: { payload: null, loading: true, error: false },
    IWM: { payload: null, loading: true, error: false },
  });

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchAll = useCallback(async () => {
    const results = await Promise.all(
      CONF_INDICES.map(async (idx) => {
        const payload = await fetchMatrix(idx);
        return { idx, payload };
      })
    );
    setData((prev) => {
      const next = { ...prev };
      for (const { idx, payload } of results) {
        next[idx] = { payload, loading: false, error: payload == null };
      }
      return next;
    });
  }, [fetchMatrix]);

  useEffect(() => {
    void fetchAll();
    pollRef.current = setInterval(() => void fetchAll(), 60_000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchAll]);

  const anyLoading = CONF_INDICES.some((idx) => data[idx].loading);
  const payloads: Record<ConfIndex, MatrixPayload | null> = {
    SPY: data.SPY.payload,
    QQQ: data.QQQ.payload,
    IWM: data.IWM.payload,
  };

  const bucketRows = computeBucketRows(payloads);
  const alignments = detectAlignments(payloads);

  // Max abs GEX across all cells for color scaling
  const allGex = bucketRows.flatMap((r) =>
    CONF_INDICES.map((idx) => Math.abs(r.values[idx] ?? 0))
  ).filter((v) => v > 0);
  const maxGex = allGex.length > 0 ? Math.max(...allGex) : 1;

  // Signed fill rides the --up-rgb / --down-rgb triplets so the East-Asian red-up
  // flip (html[data-updown="east"]) repaints the confluence grid with it.
  function cellColor(v: number | null): string {
    if (v == null) return "transparent";
    const intensity = Math.min(1, Math.abs(v) / maxGex);
    const a = 0.08 + intensity * 0.55;
    return v >= 0
      ? `rgba(var(--up-rgb),${a.toFixed(2)})`
      : `rgba(var(--down-rgb),${a.toFixed(2)})`;
  }

  // Build alignment map: band -> AlignmentChip[]
  const alignMap = new Map<number, AlignmentChip[]>();
  for (const chip of alignments) {
    const existing = alignMap.get(chip.pct) ?? [];
    existing.push(chip);
    alignMap.set(chip.pct, existing);
  }

  return (
    <div style={CONF_OUTER}>
      {/* Header */}
      <div style={CONF_HEADER}>
        <span style={CONF_TITLE}>{t("confluenceTitle")}</span>
        <span style={CONF_NOTE}>{t("descriptiveOnly")}</span>
        {anyLoading && <span style={LOADING_CHIP}>{t("loading")}</span>}
      </div>

      {/* Honesty banner — same amber `.obs-note` the SINGLE-mode matrix uses */}
      <div className="obs-note" style={HONESTY_BANNER}>
        {t("magnitudeFirst")}
      </div>

      {/* Spot prices row */}
      <div style={SPOT_ROW_HEADER}>
        <div style={LABEL_COL}>
          <span className="obs-lbl">{t("colSpotPct")}</span>
        </div>
        {CONF_INDICES.map((idx) => {
          const spot = payloads[idx]?.spot;
          return (
            <div key={idx} style={IDX_COL_HEADER}>
              <span style={IDX_LABEL}>{idx}</span>
              {spot != null && (
                <span className="num" style={IDX_SPOT}>{spot.toFixed(2)}</span>
              )}
            </div>
          );
        })}
        <div style={ALIGN_COL_HEADER}>
          <span className="obs-lbl" style={ALIGN_HDR_TEXT}>{t("confluenceAligned")}</span>
        </div>
      </div>

      {/* Matrix rows */}
      <div style={MATRIX_BODY}>
        {bucketRows.map((row) => {
          const isSpot = row.pct === 0;
          const chips = alignMap.get(row.pct) ?? [];
          const hasAlignment = chips.length > 0;

          return (
            <div
              key={row.pct}
              style={{
                ...BUCKET_ROW,
                ...(isSpot ? SPOT_BAND : {}),
                ...(hasAlignment ? ALIGNED_BAND : {}),
              }}
            >
              {/* % label */}
              <div style={LABEL_COL}>
                <span
                  className="num"
                  style={{
                    ...PCT_LABEL,
                    color: isSpot ? "var(--signal)" : "var(--text-2)",
                    fontWeight: isSpot ? 700 : 400,
                  }}
                >
                  {isSpot ? t("spotLabel") : fmtPct(row.pct)}
                </span>
              </div>

              {/* GEX cells per index */}
              {CONF_INDICES.map((idx) => {
                const v = row.values[idx];
                const strike = row.nearestStrikes[idx];
                return (
                  <div
                    key={idx}
                    style={{
                      ...IDX_CELL,
                      background: cellColor(v),
                    }}
                  >
                    <span
                      className="num"
                      style={{
                        ...CELL_VAL,
                        color:
                          v == null
                            ? "var(--muted)"
                            : v >= 0
                            ? "color-mix(in srgb, #fff 26%, var(--up))"
                            : "color-mix(in srgb, #fff 26%, var(--down))",
                      }}
                    >
                      {fmtGex(v)}
                    </span>
                    {strike != null && (
                      <span className="num" style={STRIKE_HINT}>${strike}</span>
                    )}
                  </div>
                );
              })}

              {/* Alignment column */}
              <div style={ALIGN_COL}>
                {chips.map((chip, ci) => (
                  <span
                    key={ci}
                    className="obs-tag"
                    style={{
                      ...ALIGN_CHIP,
                      "--c": chip.count >= 3 ? "var(--up)" : "var(--brand-2)",
                    } as React.CSSProperties}
                  >
                    {chip.count >= 3 ? t("confluence3of3") : t("confluence2of3")}
                    {" "}
                    {t(chip.level)}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* No alignment notice */}
      {alignments.length === 0 && !anyLoading && (
        <div style={NO_ALIGNMENT}>{t("confluenceEmpty")}</div>
      )}

      {/* Note */}
      <div style={CONF_FOOTNOTE}>
        {t("confluenceNote")}
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const CONF_OUTER: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  flex: 1,
  minHeight: 0,
  overflow: "hidden",
  background: "var(--bg)",
};

const CONF_HEADER: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "8px 14px",
  borderBottom: "1px solid var(--line)",
  background: "var(--panel)",
  flexShrink: 0,
};

const CONF_TITLE: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: "var(--text)",
  letterSpacing: "0.06em",
};

const CONF_NOTE: React.CSSProperties = {
  fontSize: 9,
  color: "var(--muted)",
  fontStyle: "italic",
};

const LOADING_CHIP: React.CSSProperties = {
  marginLeft: "auto",
  fontSize: 9,
  color: "var(--brand-2)",
};

/** `.obs-note` supplies the amber tint; this only flattens it into the header stack. */
const HONESTY_BANNER: React.CSSProperties = {
  margin: 0,
  borderRadius: 0,
  borderLeft: "none",
  borderRight: "none",
  borderTop: "none",
  padding: "5px 14px",
  fontSize: 9,
  letterSpacing: "0.02em",
  flexShrink: 0,
};

const SPOT_ROW_HEADER: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "72px 1fr 1fr 1fr 120px",
  gap: 0,
  borderBottom: "1px solid var(--line)",
  background: "var(--panel)",
  flexShrink: 0,
};

const LABEL_COL: React.CSSProperties = {
  padding: "5px 8px",
  display: "flex",
  alignItems: "center",
};

const IDX_COL_HEADER: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  padding: "5px 4px",
  borderLeft: "1px solid var(--line-2)",
};

const IDX_LABEL: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  color: "var(--text)",
  letterSpacing: "0.06em",
};

const IDX_SPOT: React.CSSProperties = {
  fontSize: 9,
  color: "var(--muted)",
  fontVariantNumeric: "tabular-nums",
};

const ALIGN_COL_HEADER: React.CSSProperties = {
  padding: "5px 8px",
  borderLeft: "1px solid var(--line)",
  display: "flex",
  alignItems: "center",
};

/** Type comes from `.obs-lbl`; only the dense size override stays inline. */
const ALIGN_HDR_TEXT: React.CSSProperties = {
  fontSize: 8.5,
  lineHeight: 1.25,
};

const MATRIX_BODY: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  minHeight: 0,
};

const BUCKET_ROW: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "72px 1fr 1fr 1fr 120px",
  borderBottom: "1px solid var(--line-2)",
  minHeight: 24,
  height: 24,
};

const SPOT_BAND: React.CSSProperties = {
  background: "color-mix(in srgb, var(--signal) 6%, transparent)",
  borderTop: "1px solid color-mix(in srgb, var(--signal) 22%, transparent)",
  borderBottom: "1px solid color-mix(in srgb, var(--signal) 22%, transparent)",
};

const ALIGNED_BAND: React.CSSProperties = {
  background: "color-mix(in srgb, var(--brand-2) 4%, transparent)",
};

const PCT_LABEL: React.CSSProperties = {
  fontSize: 10,
  fontVariantNumeric: "tabular-nums",
  letterSpacing: "0.01em",
};

const IDX_CELL: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  padding: "2px 4px",
  borderLeft: "1px solid var(--line-2)",
  gap: 1,
};

const CELL_VAL: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  fontVariantNumeric: "tabular-nums",
};

const STRIKE_HINT: React.CSSProperties = {
  fontSize: 7,
  color: "var(--muted)",
  fontVariantNumeric: "tabular-nums",
};

const ALIGN_COL: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  justifyContent: "center",
  padding: "2px 6px",
  borderLeft: "1px solid var(--line)",
  gap: 2,
};

/**
 * Dense override for `.obs-tag` in a 24px band row. The tint itself rides `--c`:
 * 3/3 alignment = var(--up), 2/3 = var(--brand-2).
 */
const ALIGN_CHIP: React.CSSProperties = {
  fontSize: 7.5,
  fontWeight: 800,
  letterSpacing: "0.04em",
  padding: "2px 6px",
  gap: 3,
};

const NO_ALIGNMENT: React.CSSProperties = {
  padding: "10px 14px",
  fontSize: 11,
  color: "var(--muted)",
  textAlign: "center",
};

const CONF_FOOTNOTE: React.CSSProperties = {
  padding: "6px 14px",
  fontSize: 9,
  color: "var(--muted)",
  borderTop: "1px solid var(--line-2)",
  fontStyle: "italic",
  flexShrink: 0,
};
