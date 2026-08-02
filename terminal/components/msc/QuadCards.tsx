"use client";
/**
 * QuadCards — delta-space book + cross-root screener (Volland-parity W3, rebuilt in the
 * 2026-08-01 production sweep).
 *
 * Sweep changes, each answering a defect the operator saw on production:
 *   • The screener's quadrant counts sat in a space-between legend row, so every count
 *     visually bound to the NEXT quadrant's label ("…VOL-SENSITIVE  10  AMPLIFY…" read as
 *     "10 AMPLIFY"). Counts now render INSIDE their own quadrant corner, on the plot.
 *   • The scatter was a full-width 260px void with 2px dots. It is now ~58% width beside
 *     its extremes table, 300px tall, dots sized to be seen, both axes titled.
 *   • The extremes table sat under the plot pushing the card past 600px; it sits beside
 *     the plot, with percentile and dollars as separate columns.
 *   • Delta-space chart to ≥190px (svgChart R4) with the ⓘ carrying the population note.
 *
 * SVG LAW (svgChart.ts R1–R9) and COLOUR LAW (--flow-buy/--flow-sell for transaction
 * sides; --warn for severity; never --up/--down) unchanged.
 */

import React, { useMemo, useRef, useState } from "react";
import { fmtMn, fmtMnMag } from "@/lib/gexLadder";
import { fmtTick, niceTicks, padDomain, useChartWidth } from "@/components/charts/svgChart";
import {
  bucketLabel,
  floatingStrike,
  quadBoard,
  type BucketGreek,
  type DeltaBucketRow,
  type QuadPayload,
  type Quadrant,
} from "@/lib/quadBoard";
import { makeMscT, type MscKey } from "./mscStrings";
import { MscCard, CardFoot, CardSpacer } from "./MscCard";
import type { Lang } from "@/lib/i18n";

const GREEKS: { key: BucketGreek; labelKey: MscKey }[] = [
  { key: "gamma", labelKey: "hgGamma" },
  { key: "delta", labelKey: "hgDelta" },
  { key: "vanna", labelKey: "hgVanna" },
  { key: "charm", labelKey: "hgCharm" },
];

const QUADRANT_KEY: Record<Quadrant, MscKey> = {
  amplify_volsens: "qdAmpVol",
  amplify_stable: "qdAmpStable",
  dampen_volsens: "qdDampVol",
  dampen_stable: "qdDampStable",
};

const sideColor = (v: number) =>
  v > 0 ? "var(--flow-buy)" : v < 0 ? "var(--flow-sell)" : "var(--text-dim)";

// ─── Card 1: the book in delta space ─────────────────────────────────────────────────

const FH = 192;
const FPAD = { l: 8, r: 52, t: 12, b: 20 };

export function FloatingStrikeCard({
  byDelta,
  lang,
}: {
  byDelta: readonly DeltaBucketRow[] | null | undefined;
  lang: Lang;
}) {
  const t = makeMscT(lang);
  const [greek, setGreek] = useState<BucketGreek>("gamma");
  const boxRef = useRef<HTMLDivElement | null>(null);
  const W = useChartWidth(boxRef, 640);

  const f = useMemo(() => floatingStrike(byDelta, greek), [byDelta, greek]);
  const innerW = Math.max(60, W - FPAD.l - FPAD.r);
  const innerH = FH - FPAD.t - FPAD.b;

  const geom = useMemo(() => {
    if (f.buckets.length < 2) return null;
    const ys = f.buckets.map((b) => b.hedgeMn);
    // The delta axis is bounded by definition — 0 to 1 — and is drawn to its full
    // extent. An empty wing IS the information: nobody owns those deltas.
    const sx = (v: number) => FPAD.l + v * innerW;
    const [y0, y1] = padDomain(Math.min(...ys), Math.max(...ys), {
      padFrac: 0.12,
      includeZero: true,
    });
    const sy = (v: number) => FPAD.t + innerH - ((v - y0) / (y1 - y0 || 1)) * innerH;
    return { sx, sy, ticks: niceTicks(y0, y1, 3) };
  }, [f.buckets, innerW, innerH]);

  return (
    <MscCard
      title={t("fsTitle")}
      info={`${t("fsLead")} ${t("fsCoverage")}`}
      tier={t("tierB")}
      tierWhy={t("tierBWhy")}
      headRight={
        f.peak ? <span style={UNIT}>{t("fsPeak").replace("{b}", bucketLabel(f.peak))}</span> : undefined
      }
      span={8}
    >
      {f.buckets.length < 2 || !geom ? (
        <CardFoot>{t("fsNone")}</CardFoot>
      ) : (
        <>
          <div style={CTRL_ROW}>
            <div style={CHIP_GROUP} role="group" aria-label={t("hgGreekAria")}>
              {GREEKS.map((g) => (
                <button
                  key={g.key}
                  className={`obs-chip${greek === g.key ? " on" : ""}`}
                  style={CHIP}
                  aria-pressed={greek === g.key}
                  onClick={() => setGreek(g.key)}
                >
                  {t(g.labelKey)}
                </button>
              ))}
            </div>
          </div>

          <div ref={boxRef} style={{ width: "100%" }}>
            <svg width={W} height={FH} viewBox={`0 0 ${W} ${FH}`} role="img" aria-label={t("fsTitle")}>
              {geom.ticks.values.map((tv) => (
                <g key={tv}>
                  <line
                    x1={FPAD.l} x2={FPAD.l + innerW} y1={geom.sy(tv)} y2={geom.sy(tv)}
                    stroke={tv === 0 ? "var(--line-2)" : "var(--hairline)"}
                    strokeWidth={tv === 0 ? 1 : 0.5}
                  />
                  <text x={FPAD.l + innerW + 6} y={geom.sy(tv) + 3} fill="var(--text-dim)" fontSize={9}>
                    {fmtTick(tv, geom.ticks.step)}
                  </text>
                </g>
              ))}
              {f.buckets.map((b) => {
                const y0 = geom.sy(0);
                const y = geom.sy(b.hedgeMn);
                const x = geom.sx(b.lo);
                const w = Math.max(1.5, geom.sx(b.hi) - x - 1);
                return (
                  <rect
                    key={b.lo}
                    x={x}
                    y={Math.min(y, y0)}
                    width={w}
                    height={Math.max(0.6, Math.abs(y - y0))}
                    fill={sideColor(b.hedgeMn)}
                    opacity={0.85}
                  />
                );
              })}
              {/* At-the-money is the 0.50-delta line, not a strike — the whole point of
                  this view is that it stays put while the strike beneath it moves. */}
              <line
                x1={geom.sx(0.5)} x2={geom.sx(0.5)} y1={FPAD.t} y2={FPAD.t + innerH}
                stroke="var(--text-2)" strokeWidth={1} strokeDasharray="3 3"
              />
              {[0, 0.25, 0.5, 0.75, 1].map((d) => (
                <text
                  key={d}
                  x={geom.sx(d)}
                  y={FH - 6}
                  fill="var(--text-dim)"
                  fontSize={9}
                  textAnchor={d === 0 ? "start" : d === 1 ? "end" : "middle"}
                >
                  {Math.round(d * 100)}Δ
                </text>
              ))}
            </svg>
          </div>

          <CardSpacer />
          <CardFoot>
            {t("fsLegend")} {t("fsScale").replace("{v}", fmtMnMag(f.maxAbsMn))}
          </CardFoot>
        </>
      )}
    </MscCard>
  );
}

// ─── Card 2: cross-root screener ─────────────────────────────────────────────────────

const QH = 300;
const QPAD = { l: 34, r: 14, t: 14, b: 30 };
const TABLE_MAX = 10;

export function QuadScreenerCard({
  quad,
  root,
  lang,
}: {
  quad: QuadPayload | null | undefined;
  /** The tab's committed root, highlighted in the scatter. */
  root: string;
  lang: Lang;
}) {
  const t = makeMscT(lang);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const W = useChartWidth(boxRef, 640);
  const b = useMemo(() => quadBoard(quad), [quad]);

  const innerW = Math.max(80, W - QPAD.l - QPAD.r);
  const innerH = QH - QPAD.t - QPAD.b;
  const sx = (p: number) => QPAD.l + (p / 100) * innerW;
  const sy = (p: number) => QPAD.t + innerH - (p / 100) * innerH;

  // Table rows: the committed root pinned first (when ranked), then the extremes.
  const tableRows = useMemo(() => {
    const mine = b.rows.find((r) => r.root === root);
    const rest = b.extremes.filter((r) => r.root !== root).slice(0, TABLE_MAX);
    return mine ? [mine, ...rest].slice(0, TABLE_MAX) : rest;
  }, [b, root]);

  if (!b.rows.length) {
    return (
      <MscCard title={t("qdTitle")} span={12}>
        <CardFoot>{t("qdNone")}</CardFoot>
      </MscCard>
    );
  }

  // Corner copy: x < 50 = hedging amplifies (dealer gamma low in its own record);
  // y ≥ 50 = a vol move forces hedging (vanna high). Counts live in their corner.
  const corners: { q: Quadrant; x: number; y: number; anchor: "start" | "end" }[] = [
    { q: "amplify_volsens", x: QPAD.l + 6, y: QPAD.t + 12, anchor: "start" },
    { q: "dampen_volsens", x: QPAD.l + innerW - 6, y: QPAD.t + 12, anchor: "end" },
    { q: "amplify_stable", x: QPAD.l + 6, y: QPAD.t + innerH - 6, anchor: "start" },
    { q: "dampen_stable", x: QPAD.l + innerW - 6, y: QPAD.t + innerH - 6, anchor: "end" },
  ];

  return (
    <MscCard
      title={t("qdTitle")}
      info={`${t("qdLead")} ${t("qdWindow").replace("{d}", String(b.pctileWindowDays ?? 252))}`}
      tier={t("tierB")}
      tierWhy={t("qdTierWhy")}
      span={12}
    >
      <div style={SPLIT}>
        <div ref={boxRef} style={SPLIT_CHART}>
          <svg width={W} height={QH} viewBox={`0 0 ${W} ${QH}`} role="img" aria-label={t("qdTitle")}>
            {/* Quadrant dividers at the median of each axis. */}
            <line x1={sx(50)} x2={sx(50)} y1={QPAD.t} y2={QPAD.t + innerH} stroke="var(--line-2)" strokeWidth={0.75} />
            <line x1={QPAD.l} x2={QPAD.l + innerW} y1={sy(50)} y2={sy(50)} stroke="var(--line-2)" strokeWidth={0.75} />
            <rect
              x={QPAD.l} y={QPAD.t} width={innerW} height={innerH}
              fill="none" stroke="var(--hairline)" strokeWidth={0.5}
            />

            {/* Quadrant names + counts, in their own corners (the misbinding fix). */}
            {corners.map((c) => (
              <text key={c.q} x={c.x} y={c.y} fontSize={8.5} fill="var(--text-dim)" textAnchor={c.anchor} opacity={0.9}>
                {t(QUADRANT_KEY[c.q])} · {b.counts[c.q]}
              </text>
            ))}

            {[0, 25, 50, 75, 100].map((p) => (
              <g key={p}>
                <text x={sx(p)} y={QH - 18} fill="var(--text-dim)" fontSize={9} textAnchor={p === 0 ? "start" : p === 100 ? "end" : "middle"}>
                  {p}
                </text>
                <text x={QPAD.l - 5} y={sy(p) + 3} fill="var(--text-dim)" fontSize={9} textAnchor="end">
                  {p}
                </text>
              </g>
            ))}

            {b.rows.map((r) => {
              const mine = r.root === root;
              const x = sx(r.gamma_pctile);
              const y = sy(r.vanna_pctile);
              // Narrow plots label only the committed root — seven extremes pinned
              // at the 98th–100th percentile shoulder-to-shoulder turn into an
              // unreadable smear at 390px; the table beside carries their names.
              const labelled = mine || (r.extreme && W >= 560);
              const flip = x > QPAD.l + innerW - 44;
              return (
                <g key={r.root}>
                  {mine && (
                    <circle cx={x} cy={y} r={7} fill="none" stroke="var(--brand)" strokeWidth={1} opacity={0.5} />
                  )}
                  <circle
                    cx={x}
                    cy={y}
                    r={mine ? 4 : r.extreme ? 3.25 : 2.75}
                    fill={mine ? "var(--brand)" : r.extreme ? "var(--warn)" : "var(--text-dim)"}
                    opacity={mine ? 1 : r.extreme ? 0.9 : 0.55}
                  />
                  {labelled && (
                    <text
                      x={flip ? x - 6 : x + 6}
                      y={y + 3}
                      fill={mine ? "var(--brand)" : "var(--text-2)"}
                      fontSize={9}
                      fontWeight={mine ? 700 : 500}
                      textAnchor={flip ? "end" : "start"}
                    >
                      {r.root}
                    </text>
                  )}
                </g>
              );
            })}

            <text x={QPAD.l + innerW / 2} y={QH - 4} fill="var(--text-dim)" fontSize={9} textAnchor="middle">
              {t("qdAxisX")}
            </text>
            <text
              x={0} y={0} fill="var(--text-dim)" fontSize={9} textAnchor="middle"
              transform={`translate(10 ${QPAD.t + innerH / 2}) rotate(-90)`}
            >
              {t("qdAxisY")}
            </text>
          </svg>
        </div>

        <div style={{ ...SPLIT_TABLE, overflowX: "auto" }}>
          {tableRows.length > 0 && (
            <table style={TABLE}>
              <thead>
                <tr>
                  <th style={TH}>{t("qdColRoot")}</th>
                  <th style={{ ...TH, textAlign: "right" }}>{t("qdColGammaPct")}</th>
                  <th style={{ ...TH, textAlign: "right" }}>{t("qdColGammaUsd")}</th>
                  <th style={{ ...TH, textAlign: "right" }}>{t("qdColVannaPct")}</th>
                  <th style={{ ...TH, textAlign: "right" }}>{t("qdColVannaUsd")}</th>
                  <th style={TH}>{t("qdColRegime")}</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((r) => {
                  const mine = r.root === root;
                  return (
                    <tr key={r.root} style={mine ? { background: "color-mix(in srgb, var(--brand) 7%, transparent)" } : undefined}>
                      <td style={{ ...TD, fontWeight: mine ? 700 : 500, color: mine ? "var(--brand)" : "var(--text)" }}>
                        {r.root}
                      </td>
                      <td style={{ ...TD, textAlign: "right" }}>{r.gamma_pctile.toFixed(0)}</td>
                      <td style={{ ...TD, textAlign: "right", color: "var(--text-2)" }}>
                        {r.gamma_bn == null ? "—" : fmtMn(r.gamma_bn * 1000)}
                      </td>
                      <td style={{ ...TD, textAlign: "right" }}>{r.vanna_pctile.toFixed(0)}</td>
                      <td style={{ ...TD, textAlign: "right", color: "var(--text-2)" }}>
                        {r.vanna_bn == null ? "—" : fmtMn(r.vanna_bn * 1000)}
                      </td>
                      <td style={{ ...TD, whiteSpace: "nowrap" }}>{t(QUADRANT_KEY[r.quadrant])}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <CardSpacer />
      <CardFoot>
        {t("qdFootMeta")
          .replace("{n}", String(b.rows.length))
          .replace("{d}", String(b.pctileWindowDays ?? 252))
          .replace("{m}", String(b.minHistoryDays ?? 250))}
        {b.skipped.length > 0
          ? ` · ${t("qdSkipped").replace("{n}", String(b.skipped.length)).replace("{r}", b.skipped.slice(0, 6).join(", "))}`
          : ""}
      </CardFoot>
    </MscCard>
  );
}

// ─── Local styles (v5 tokens) ────────────────────────────────────────────────────────

const CTRL_ROW: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 6,
};

const CHIP_GROUP: React.CSSProperties = { display: "flex", gap: 3, flexWrap: "wrap" };

const CHIP: React.CSSProperties = { fontSize: 10, padding: "2px 7px" };

const UNIT: React.CSSProperties = {
  fontSize: "var(--fs-micro)", letterSpacing: ".03em", color: "var(--text-dim)",
  textTransform: "uppercase", whiteSpace: "nowrap",
};

const SPLIT: React.CSSProperties = {
  display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-start", minWidth: 0,
};

const SPLIT_CHART: React.CSSProperties = { flex: "1 1 460px", minWidth: 320 };

const SPLIT_TABLE: React.CSSProperties = { flex: "1 1 340px", minWidth: 300 };

const TABLE: React.CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: 11 };

const TH: React.CSSProperties = {
  textAlign: "left", fontWeight: 500, fontSize: "var(--fs-micro)", letterSpacing: ".04em",
  textTransform: "uppercase", color: "var(--text-dim)", padding: "3px 5px",
  borderBottom: "1px solid var(--line)", whiteSpace: "nowrap",
};

const TD: React.CSSProperties = {
  padding: "3px 5px", color: "var(--text)", borderBottom: "1px solid var(--hairline)",
  fontVariantNumeric: "tabular-nums",
};
