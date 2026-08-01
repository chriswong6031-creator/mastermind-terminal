"use client";
/**
 * QuadCards — Volland-parity wave 3 (docs/VOLLAND_PARITY_PLAN_2026-08-01.md §5 W3).
 *
 *   1. Floating strike   — the same book indexed by call-equivalent delta rather than by
 *      strike. A strike is a fixed price; a delta is a position relative to where the
 *      market actually is, so the 0.25-delta wing stays the same object week to week
 *      while "the 750 strike" quietly becomes something else.
 *   2. Cross-root screener — every root ranked against ITS OWN nine-year history on two
 *      axes: dealer gamma (does hedging dampen or amplify) and dealer vanna (does a vol
 *      move force hedging). Volland normalises across whatever is on screen; ranking
 *      against each root's own record is both more meaningful and immune to which roots
 *      happen to be included.
 *
 * SVG LAW (components/charts/svgChart.ts): measured 1:1 viewBox, padDomain over finite
 * values, niceTicks with step-derived precision, labels thinned by PIXEL GAP.
 *
 * COLOUR LAW: hedging is a transaction side, so --flow-buy/--flow-sell (which do not
 * invert under the East-Asian convention). Every readout names the side in words.
 */

import React, { useMemo, useRef, useState } from "react";
import { Tip } from "@/components/ui/Tip";
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

// ─── Card 1: floating strike ─────────────────────────────────────────────────────────

const FH = 160;
const FPAD = { l: 8, r: 52, t: 10, b: 22 };

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
    // The delta axis is bounded by definition — 0 to 1 — so it is drawn to its full
    // extent rather than to the occupied range. An empty wing IS the information.
    const sx = (v: number) => FPAD.l + v * innerW;
    const [y0, y1] = padDomain(Math.min(...ys), Math.max(...ys), {
      padFrac: 0.12,
      includeZero: true,
    });
    const sy = (v: number) => FPAD.t + innerH - ((v - y0) / (y1 - y0 || 1)) * innerH;
    return { sx, sy, ticks: niceTicks(y0, y1, 3) };
  }, [f.buckets, innerW, innerH]);

  return (
    <section style={{ ...CARD, gridColumn: "1 / -1" }}>
      <header style={CARD_HD}>
        <span className="obs-lbl">{t("fsTitle")}</span>
        <Tip label={t("tierBWhy")} side="top" size="card">
          <span style={TIER_CHIP} tabIndex={0}>{t("tierB")}</span>
        </Tip>
      </header>
      <p style={LEAD}>{t("fsLead")}</p>

      {f.buckets.length < 2 || !geom ? (
        <p style={FOOT}>{t("fsNone")}</p>
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
            {f.peak && (
              <span style={UNIT}>
                {t("fsPeak").replace("{b}", bucketLabel(f.peak))}
              </span>
            )}
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

          <p style={FOOT}>{t("fsLegend")}</p>
          <p style={FOOT}>{t("fsCoverage")}</p>
          <p style={FOOT}>{t("fsScale").replace("{v}", fmtMnMag(f.maxAbsMn))}</p>
        </>
      )}
    </section>
  );
}

// ─── Card 2: cross-root screener ─────────────────────────────────────────────────────

const QH = 260;
const QPAD = { l: 30, r: 12, t: 12, b: 26 };

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

  if (!b.rows.length) {
    return (
      <section style={{ ...CARD, gridColumn: "1 / -1" }}>
        <header style={CARD_HD}>
          <span className="obs-lbl">{t("qdTitle")}</span>
        </header>
        <p style={FOOT}>{t("qdNone")}</p>
      </section>
    );
  }

  return (
    <section style={{ ...CARD, gridColumn: "1 / -1" }}>
      <header style={CARD_HD}>
        <span className="obs-lbl">{t("qdTitle")}</span>
        <Tip label={t("qdTierWhy")} side="top" size="card">
          <span style={TIER_CHIP} tabIndex={0}>{t("tierB")}</span>
        </Tip>
      </header>
      <p style={LEAD}>{t("qdLead")}</p>

      <div ref={boxRef} style={{ width: "100%" }}>
        <svg width={W} height={QH} viewBox={`0 0 ${W} ${QH}`} role="img" aria-label={t("qdTitle")}>
          {/* Quadrant dividers at the median of each axis. */}
          <line x1={sx(50)} x2={sx(50)} y1={QPAD.t} y2={QPAD.t + innerH} stroke="var(--line-2)" strokeWidth={0.75} />
          <line x1={QPAD.l} x2={QPAD.l + innerW} y1={sy(50)} y2={sy(50)} stroke="var(--line-2)" strokeWidth={0.75} />
          {[0, 25, 50, 75, 100].map((p) => (
            <g key={p}>
              <text x={sx(p)} y={QH - 12} fill="var(--text-dim)" fontSize={9} textAnchor={p === 0 ? "start" : p === 100 ? "end" : "middle"}>
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
            return (
              <g key={r.root}>
                <circle
                  cx={x}
                  cy={y}
                  r={mine ? 4 : r.extreme ? 3 : 2.2}
                  fill={mine ? "var(--brand)" : r.extreme ? "var(--warn)" : "var(--text-dim)"}
                  opacity={mine ? 1 : r.extreme ? 0.9 : 0.5}
                />
                {(mine || r.extreme) && (
                  <text
                    x={x + 5}
                    y={y + 3}
                    fill={mine ? "var(--brand)" : "var(--text-2)"}
                    fontSize={9}
                    fontWeight={mine ? 700 : 500}
                  >
                    {r.root}
                  </text>
                )}
              </g>
            );
          })}
          <text x={QPAD.l + innerW / 2} y={QH - 1} fill="var(--text-dim)" fontSize={9} textAnchor="middle">
            {t("qdAxisX")}
          </text>
        </svg>
      </div>

      <div style={LEGEND_GRID}>
        {(Object.keys(QUADRANT_KEY) as Quadrant[]).map((q) => (
          <div key={q} style={LEGEND_CELL}>
            <span style={LEG_LBL}>{t(QUADRANT_KEY[q])}</span>
            <span style={LEG_VAL}>{b.counts[q]}</span>
          </div>
        ))}
      </div>

      {b.extremes.length > 0 && (
        <table style={TABLE}>
          <thead>
            <tr>
              <th style={TH}>{t("qdColRoot")}</th>
              <th style={{ ...TH, textAlign: "right" }}>{t("qdColGamma")}</th>
              <th style={{ ...TH, textAlign: "right" }}>{t("qdColVanna")}</th>
              <th style={TH}>{t("qdColRegime")}</th>
            </tr>
          </thead>
          <tbody>
            {b.extremes.slice(0, 8).map((r) => (
              <tr key={r.root}>
                <td style={{ ...TD, fontWeight: r.root === root ? 700 : 500 }}>{r.root}</td>
                <td style={{ ...TD, textAlign: "right" }}>
                  {r.gamma_pctile.toFixed(0)}
                  <span style={SUB}> · {r.gamma_bn == null ? "—" : fmtMn(r.gamma_bn * 1000)}</span>
                </td>
                <td style={{ ...TD, textAlign: "right" }}>
                  {r.vanna_pctile.toFixed(0)}
                  <span style={SUB}> · {r.vanna_bn == null ? "—" : fmtMn(r.vanna_bn * 1000)}</span>
                </td>
                <td style={TD}>{t(QUADRANT_KEY[r.quadrant])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p style={FOOT}>{t("qdLegend").replace("{n}", String(b.rows.length))}</p>
      {b.pctileWindowDays != null && (
        <p style={FOOT}>{t("qdWindow").replace("{d}", String(b.pctileWindowDays))}</p>
      )}
      {b.minHistoryDays != null && (
        <p style={FOOT}>
          {t("qdMinHistory").replace("{d}", String(b.minHistoryDays))}
          {b.skipped.length > 0
            ? ` ${t("qdSkipped").replace("{n}", String(b.skipped.length)).replace("{r}", b.skipped.slice(0, 6).join(", "))}`
            : ""}
        </p>
      )}
    </section>
  );
}

// ─── Styles (v5 tokens; mirrors HedgingCards / TrendCards) ──────────────────────────

const CARD: React.CSSProperties = {
  background: "var(--panel-2)",
  border: "1px solid var(--line)",
  borderRadius: "var(--r-tile)",
  padding: "9px 10px 10px",
  minWidth: 0,
};

const CARD_HD: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "space-between",
  gap: 8, marginBottom: 5,
};

const TIER_CHIP: React.CSSProperties = {
  fontSize: "var(--fs-micro)", letterSpacing: ".04em", textTransform: "uppercase",
  color: "var(--text-dim)", border: "1px solid var(--line-2)", borderRadius: 999,
  padding: "1px 6px", whiteSpace: "nowrap", cursor: "help",
};

const LEAD: React.CSSProperties = {
  margin: "0 0 8px", fontSize: 11, lineHeight: 1.45, color: "var(--muted)",
};

const CTRL_ROW: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 6,
};

const CHIP_GROUP: React.CSSProperties = { display: "flex", gap: 3 };

const CHIP: React.CSSProperties = { fontSize: 10, padding: "2px 7px" };

const UNIT: React.CSSProperties = {
  fontSize: "var(--fs-micro)", letterSpacing: ".03em", color: "var(--text-dim)",
  textTransform: "uppercase", marginLeft: "auto",
};

const LEGEND_GRID: React.CSSProperties = {
  display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
  gap: 6, margin: "6px 0 8px",
};

const LEGEND_CELL: React.CSSProperties = {
  display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 6,
};

const LEG_LBL: React.CSSProperties = {
  fontSize: "var(--fs-micro)", letterSpacing: ".04em", textTransform: "uppercase",
  color: "var(--text-dim)",
};

const LEG_VAL: React.CSSProperties = {
  fontSize: 13, fontWeight: 600, fontVariantNumeric: "tabular-nums",
};

const TABLE: React.CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: 11 };

const TH: React.CSSProperties = {
  textAlign: "left", fontWeight: 500, fontSize: "var(--fs-micro)", letterSpacing: ".04em",
  textTransform: "uppercase", color: "var(--text-dim)", padding: "3px 5px",
  borderBottom: "1px solid var(--line)",
};

const TD: React.CSSProperties = {
  padding: "3px 5px", color: "var(--text)", borderBottom: "1px solid var(--hairline)",
  fontVariantNumeric: "tabular-nums",
};

const SUB: React.CSSProperties = { color: "var(--text-dim)", fontSize: 10 };

const FOOT: React.CSSProperties = {
  margin: "0 0 4px", fontSize: 10, lineHeight: 1.5, color: "var(--muted)",
};
