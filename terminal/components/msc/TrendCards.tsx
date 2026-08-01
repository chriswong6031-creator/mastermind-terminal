"use client";
/**
 * TrendCards — Volland-parity wave 2 (docs/VOLLAND_PARITY_PLAN_2026-08-01.md §5 W2).
 *
 * W1 answered "how big is the hedging requirement". These answer "how big **relative to
 * its own history**", which a single session can never answer.
 *
 *   1. Aggregate greek trend  — the whole-book series with its own p05–p95 band and
 *      today's percentile. Volland shows ~5 months; our store reaches 2017 (SPY) and
 *      2012 (QQQ), so the same chart spans Volmageddon, 2020 and 2022.
 *   2. Spot–vol relationship  — regress daily ATM-IV change on daily spot return, and
 *      grade today's vol move against what that move usually implies.
 *   3. Positioning extremes   — where gamma concentrates, split by horizon, from the
 *      one store that carries strike AND expiry together.
 *
 * THE PERCENTILE IS THE PRODUCT. The dealer-sign convention makes the *level* a Tier B
 * estimate; ranking today against its own history applies the same assumption to every
 * session, so a constant sign error largely cancels. Every card leads with the rank.
 *
 * SVG LAW (components/charts/svgChart.ts): measured 1:1 viewBox, padDomain over finite
 * values, niceTicks with step-derived precision, labels thinned by PIXEL GAP.
 *
 * COLOUR LAW: the trend line is --brand-2 (a series, not a transaction). The hedging
 * side tints stay --flow-buy/--flow-sell, which do not invert under the East-Asian
 * convention. Verdict words are always spelled out so colour is never load-bearing.
 */

import React, { useMemo, useRef, useState } from "react";
import { Tip } from "@/components/ui/Tip";
import { fmtTick, niceTicks, padDomain, thinLabels, useChartWidth } from "@/components/charts/svgChart";
import {
  decimate,
  extremes,
  spotVol,
  TREND_GREEKS,
  TREND_WINDOWS,
  trendSeries,
  type AggTrendPayload,
  type HorizonKey,
  type TrendGreek,
  type TrendWindowKey,
} from "@/lib/aggTrend";
import { makeMscT, type MscKey } from "./mscStrings";
import type { Lang } from "@/lib/i18n";

const H = 176;
const PAD = { l: 8, r: 56, t: 10, b: 20 };

const GREEK_KEY: Record<TrendGreek, MscKey> = {
  gamma: "hgGamma",
  delta: "hgDelta",
  vanna: "hgVanna",
  charm: "hgCharm",
  vega: "atVega",
};

const WINDOW_KEY: Record<TrendWindowKey, MscKey> = {
  "1y": "atWin1y",
  "3y": "atWin3y",
  all: "atWinAll",
};

const HORIZON_KEY: Record<HorizonKey, MscKey> = {
  near: "exNear",
  swing: "exSwing",
  far: "exFar",
};

/** $bn with a sign, for a series whose whole point is which side of zero it sits on. */
function fmtBnSigned(v: number | null | undefined): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return "—";
  const a = Math.abs(v);
  const digits = a >= 100 ? 0 : a >= 10 ? 1 : 2;
  return `${v < 0 ? "−" : "+"}$${a.toFixed(digits)}bn`;
}

function fmtPct(v: number | null | undefined, digits = 0): string {
  return typeof v === "number" && Number.isFinite(v) ? `${v.toFixed(digits)}%` : "—";
}

/** 12.5 → "12th", 1 → "1st". Ordinals read faster than "12.5th percentile". */
function ordinal(p: number | null | undefined): string {
  if (typeof p !== "number" || !Number.isFinite(p)) return "—";
  const n = Math.max(0, Math.min(100, Math.round(p)));
  const rem100 = n % 100;
  const rem10 = n % 10;
  const suffix =
    rem100 >= 11 && rem100 <= 13 ? "th" : rem10 === 1 ? "st" : rem10 === 2 ? "nd" : rem10 === 3 ? "rd" : "th";
  return `${n}${suffix}`;
}

// ─── Card 1: aggregate greek trend ───────────────────────────────────────────────────

export function AggTrendCard({
  agg,
  lang,
}: {
  agg: AggTrendPayload | null | undefined;
  lang: Lang;
}) {
  const t = makeMscT(lang);
  const [greek, setGreek] = useState<TrendGreek>("gamma");
  const [win, setWin] = useState<TrendWindowKey>("all");
  const boxRef = useRef<HTMLDivElement | null>(null);
  const W = useChartWidth(boxRef, 640);

  const ts = useMemo(() => trendSeries(agg, greek, win), [agg, greek, win]);
  const stats = ts.stats;
  const hasData = ts.points.length > 1 && stats != null;

  const innerW = Math.max(60, W - PAD.l - PAD.r);
  const innerH = H - PAD.t - PAD.b;

  const geom = useMemo(() => {
    if (!hasData) return null;
    const ys = ts.points.map((p) => p.v);
    // Zero is unioned in: which side of zero the book sits on is the headline fact,
    // and a domain that excludes it would hide a regime change entirely.
    const [y0, y1] = padDomain(Math.min(...ys), Math.max(...ys), {
      padFrac: 0.08,
      includeZero: true,
    });
    const n = ts.points.length;
    const sx = (i: number) => PAD.l + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
    const sy = (v: number) => PAD.t + innerH - ((v - y0) / (y1 - y0 || 1)) * innerH;
    // One min/max pair per pixel column. Keeps every extreme at its own date while
    // cutting a 2,400-point nine-year series to what the plot can actually resolve —
    // at 390px that would otherwise be seven points per pixel.
    const drawn = decimate(ts.points, Math.max(1, Math.round(innerW)));
    // Date labels thinned by PIXEL GAP at their mapped positions, per the chart law —
    // a series can be 252 or 3,558 points long and i % n would collide at one of them.
    const labels = thinLabels(
      ts.points.map((p, i) => ({ x: sx(i), label: p.d.slice(0, 7) })),
      (l) => l.x,
      54,
    );
    return { y0, y1, sx, sy, ticks: niceTicks(y0, y1, 4), labels, drawn };
  }, [ts, hasData, innerW, innerH]);

  const unit = agg?.units?.[greek];

  return (
    <section style={{ ...CARD, gridColumn: "1 / -1" }}>
      <header style={CARD_HD}>
        <span className="obs-lbl">{t("atTitle")}</span>
        <Tip label={t("atTierWhy")} side="top" size="card">
          <span style={TIER_CHIP} tabIndex={0}>{t("tierB")}</span>
        </Tip>
      </header>
      <p style={LEAD}>{t("atLead")}</p>

      <div style={CTRL_ROW}>
        <div style={CHIP_GROUP} role="group" aria-label={t("hgGreekAria")}>
          {TREND_GREEKS.map((g) => (
            <button
              key={g}
              className={`obs-chip${greek === g ? " on" : ""}`}
              style={CHIP}
              aria-pressed={greek === g}
              onClick={() => setGreek(g)}
            >
              {t(GREEK_KEY[g])}
            </button>
          ))}
        </div>
        <div style={CHIP_GROUP} role="group" aria-label={t("atWinAria")}>
          {TREND_WINDOWS.map((w) => (
            <button
              key={w.key}
              className={`obs-chip${win === w.key ? " on" : ""}`}
              style={CHIP}
              aria-pressed={win === w.key}
              onClick={() => setWin(w.key)}
            >
              {t(WINDOW_KEY[w.key])}
            </button>
          ))}
        </div>
        {unit && <span style={UNIT}>{unit}</span>}
      </div>

      {!hasData ? (
        <div style={EMPTY_SM}>{t("atNone")}</div>
      ) : (
        <>
          <div style={STAT_ROW}>
            <div style={STAT}>
              <span style={LEG_LBL}>{t("atToday")}</span>
              <span style={{ ...LEG_VAL, color: stats.last != null && stats.last < 0 ? "var(--flow-sell)" : "var(--flow-buy)" }}>
                {fmtBnSigned(stats.last)}
              </span>
            </div>
            <div style={STAT}>
              <span style={LEG_LBL}>{t("atRank")}</span>
              <span style={{ ...LEG_VAL, fontWeight: 700 }}>{ordinal(stats.pctile)}</span>
            </div>
            <div style={STAT}>
              <span style={LEG_LBL}>{t("atTypical")}</span>
              <span style={LEG_VAL}>{fmtBnSigned(stats.p50)}</span>
            </div>
            <div style={STAT}>
              <span style={LEG_LBL}>{t("atRange")}</span>
              <span style={LEG_VAL}>
                {fmtBnSigned(stats.p05)} … {fmtBnSigned(stats.p95)}
              </span>
            </div>
          </div>

          <div ref={boxRef} style={{ width: "100%" }}>
            {geom && (
              <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t("atTitle")}>
                {/* p05–p95 reference band: the "is this normal" answer, drawn not stated. */}
                <rect
                  x={PAD.l}
                  y={geom.sy(stats.p95)}
                  width={innerW}
                  height={Math.max(0.5, geom.sy(stats.p05) - geom.sy(stats.p95))}
                  fill="var(--brand-2)"
                  opacity={0.09}
                />
                <line
                  x1={PAD.l} x2={PAD.l + innerW}
                  y1={geom.sy(stats.p50)} y2={geom.sy(stats.p50)}
                  stroke="var(--text-dim)" strokeWidth={0.75} strokeDasharray="4 4"
                />
                {geom.ticks.values.map((tv) => (
                  <g key={tv}>
                    <line
                      x1={PAD.l} x2={PAD.l + innerW} y1={geom.sy(tv)} y2={geom.sy(tv)}
                      stroke={tv === 0 ? "var(--line-2)" : "var(--hairline)"}
                      strokeWidth={tv === 0 ? 1 : 0.5}
                    />
                    <text x={PAD.l + innerW + 6} y={geom.sy(tv) + 3} fill="var(--text-dim)" fontSize={9}>
                      {fmtTick(tv, geom.ticks.step)}
                    </text>
                  </g>
                ))}
                <polyline
                  fill="none"
                  stroke="var(--brand-2)"
                  strokeWidth={1.25}
                  points={geom.drawn.map((p) => `${geom.sx(p.i)},${geom.sy(p.v)}`).join(" ")}
                />
                <circle
                  cx={geom.sx(ts.points.length - 1)}
                  cy={geom.sy(ts.points[ts.points.length - 1].v)}
                  r={2.5}
                  fill="var(--brand)"
                />
                {geom.labels.map((l) => {
                  // A centre-anchored label at either end hangs half outside the viewBox
                  // and renders clipped ("2024-07" reads as "24-07"). Anchoring by edge
                  // proximity keeps the text inside without guessing its pixel width.
                  const anchor =
                    l.x - PAD.l < 20 ? "start" : PAD.l + innerW - l.x < 20 ? "end" : "middle";
                  return (
                    <text
                      key={l.x}
                      x={l.x}
                      y={H - 6}
                      fill="var(--text-dim)"
                      fontSize={9}
                      textAnchor={anchor}
                    >
                      {l.label}
                    </text>
                  );
                })}
              </svg>
            )}
          </div>

          <p style={FOOT}>
            {t("atCoverage")
              .replace("{n}", String(ts.n))
              .replace("{since}", ts.since ?? "—")}
            {ts.truncated ? ` ${t("atTruncated")}` : ""}
          </p>
          <p style={FOOT}>{t("atBandLegend")}</p>
        </>
      )}
    </section>
  );
}

// ─── Card 2: spot–vol relationship ───────────────────────────────────────────────────

export function SpotVolCard({
  agg,
  lang,
}: {
  agg: AggTrendPayload | null | undefined;
  lang: Lang;
}) {
  const t = makeMscT(lang);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const W = useChartWidth(boxRef, 320);
  const sv = useMemo(() => spotVol(agg?.series, 252), [agg]);

  const CH = 132;
  const CPAD = { l: 8, r: 34, t: 8, b: 18 };
  const innerW = Math.max(40, W - CPAD.l - CPAD.r);
  const innerH = CH - CPAD.t - CPAD.b;

  const geom = useMemo(() => {
    if (sv.points.length < 2) return null;
    const xs = sv.points.map((p) => p.x);
    const ys = sv.points.map((p) => p.y);
    const [x0, x1] = padDomain(Math.min(...xs), Math.max(...xs), { padFrac: 0.06, includeZero: true });
    const [y0, y1] = padDomain(Math.min(...ys), Math.max(...ys), { padFrac: 0.06, includeZero: true });
    const sx = (v: number) => CPAD.l + ((v - x0) / (x1 - x0 || 1)) * innerW;
    const sy = (v: number) => CPAD.t + innerH - ((v - y0) / (y1 - y0 || 1)) * innerH;
    return { x0, x1, y0, y1, sx, sy, ticks: niceTicks(y0, y1, 3) };
  }, [sv.points, innerW, innerH]);

  const verdictKey: MscKey =
    sv.verdict === "overvixed" ? "svOver"
      : sv.verdict === "undervixed" ? "svUnder"
      : sv.verdict === "inline" ? "svInline"
      : "svUnknown";

  return (
    <section style={CARD}>
      <header style={CARD_HD}>
        <span className="obs-lbl">{t("svTitle")}</span>
        <Tip label={t("svTierWhy")} side="top" size="card">
          <span style={TIER_CHIP} tabIndex={0}>{t("tierMeasured")}</span>
        </Tip>
      </header>
      <p style={LEAD}>{t("svLead")}</p>

      {sv.beta == null ? (
        <p style={FOOT}>{t("svNone").replace("{n}", String(sv.n))}</p>
      ) : (
        <>
          <div style={STAT_ROW}>
            <div style={STAT}>
              <span style={LEG_LBL}>{t("svBeta")}</span>
              <span style={LEG_VAL}>{sv.beta.toFixed(2)}</span>
            </div>
            <div style={STAT}>
              <span style={LEG_LBL}>{t("svR2")}</span>
              <span style={LEG_VAL}>{fmtPct((sv.r2 ?? 0) * 100)}</span>
            </div>
            <div style={STAT}>
              <span style={LEG_LBL}>{t("svVerdict")}</span>
              <span
                style={{
                  ...LEG_VAL,
                  fontWeight: 700,
                  color:
                    sv.verdict === "overvixed" ? "var(--warn)"
                      : sv.verdict === "undervixed" ? "var(--signal)"
                      : "var(--text)",
                }}
              >
                {t(verdictKey)}
              </span>
            </div>
          </div>

          {/* Overvixed ↔ undervixed dial. A bounded scalar reads faster on a track than
              as a number — the one Volland design idea that genuinely earns its pixels. */}
          {sv.gauge != null && (
            <div style={GAUGE_WRAP} aria-label={t("svGaugeAria")}>
              <div style={GAUGE_TRACK}>
                <div style={{ ...GAUGE_MID }} />
                <div
                  style={{
                    ...GAUGE_NEEDLE,
                    left: `${((sv.gauge + 1) / 2) * 100}%`,
                    background:
                      sv.verdict === "overvixed" ? "var(--warn)"
                        : sv.verdict === "undervixed" ? "var(--signal)"
                        : "var(--text-2)",
                  }}
                />
              </div>
              <div style={GAUGE_ENDS}>
                <span>{t("svUnder")}</span>
                <span>{t("svOver")}</span>
              </div>
            </div>
          )}

          <div ref={boxRef} style={{ width: "100%" }}>
            {geom && (
              <svg width={W} height={CH} viewBox={`0 0 ${W} ${CH}`} role="img" aria-label={t("svTitle")}>
                {geom.ticks.values.map((tv) => (
                  <g key={tv}>
                    <line
                      x1={CPAD.l} x2={CPAD.l + innerW} y1={geom.sy(tv)} y2={geom.sy(tv)}
                      stroke={tv === 0 ? "var(--line-2)" : "var(--hairline)"}
                      strokeWidth={tv === 0 ? 1 : 0.5}
                    />
                    <text x={CPAD.l + innerW + 4} y={geom.sy(tv) + 3} fill="var(--text-dim)" fontSize={8}>
                      {fmtTick(tv, geom.ticks.step)}
                    </text>
                  </g>
                ))}
                {geom.x0 < 0 && geom.x1 > 0 && (
                  <line
                    x1={geom.sx(0)} x2={geom.sx(0)} y1={CPAD.t} y2={CPAD.t + innerH}
                    stroke="var(--line-2)" strokeWidth={1}
                  />
                )}
                {sv.points.map((p, i) => (
                  <circle
                    key={`${p.x}-${p.y}-${i}`}
                    cx={geom.sx(p.x)}
                    cy={geom.sy(p.y)}
                    r={1.4}
                    fill="var(--text-dim)"
                    opacity={0.55}
                  />
                ))}
                {/* the fitted line across the plotted x-domain */}
                <line
                  x1={geom.sx(geom.x0)}
                  y1={geom.sy((sv.intercept ?? 0) + sv.beta * geom.x0)}
                  x2={geom.sx(geom.x1)}
                  y2={geom.sy((sv.intercept ?? 0) + sv.beta * geom.x1)}
                  stroke="var(--brand-2)"
                  strokeWidth={1.25}
                />
                {sv.lastReturnPct != null && sv.lastIvChangePts != null && (
                  <circle
                    cx={geom.sx(sv.lastReturnPct)}
                    cy={geom.sy(sv.lastIvChangePts)}
                    r={3}
                    fill="none"
                    stroke="var(--brand)"
                    strokeWidth={1.5}
                  />
                )}
              </svg>
            )}
          </div>

          <p style={FOOT}>
            {t("svToday")
              .replace("{r}", fmtPct(sv.lastReturnPct, 2))
              .replace("{a}", (sv.lastIvChangePts ?? 0).toFixed(2))
              .replace("{p}", (sv.predictedPts ?? 0).toFixed(2))}
          </p>
          <p style={FOOT}>{t("svLegend").replace("{n}", String(sv.n))}</p>
        </>
      )}
    </section>
  );
}

// ─── Card 3: positioning extremes by horizon ─────────────────────────────────────────

export function ExtremesCard({
  matrix,
  spot,
  asof,
  lang,
}: {
  matrix: { spot?: number | null; cells?: { strike: number; expiry: string; gex: number | null }[] } | null | undefined;
  spot: number | null | undefined;
  asof: string | null | undefined;
  lang: Lang;
}) {
  const t = makeMscT(lang);
  const ex = useMemo(() => extremes(matrix, spot, asof), [matrix, spot, asof]);

  return (
    <section style={CARD}>
      <header style={CARD_HD}>
        <span className="obs-lbl">{t("exTitle")}</span>
        <Tip label={t("exTierWhy")} side="top" size="card">
          <span style={TIER_CHIP} tabIndex={0}>{t("tierB")}</span>
        </Tip>
      </header>
      <p style={LEAD}>{t("exLead")}</p>

      {!ex.available ? (
        <p style={FOOT}>{t("exNone")}</p>
      ) : (
        <>
          <table style={TABLE}>
            <thead>
              <tr>
                <th style={TH}>{t("exColHorizon")}</th>
                <th style={{ ...TH, textAlign: "right" }}>{t("exColBelow")}</th>
                <th style={{ ...TH, textAlign: "right" }}>{t("exColAbove")}</th>
              </tr>
            </thead>
            <tbody>
              {ex.rows.map((r) => (
                <tr key={r.horizon}>
                  <td style={TD}>{t(HORIZON_KEY[r.horizon])}</td>
                  <td style={{ ...TD, textAlign: "right", color: r.cells === 0 ? "var(--text-dim)" : "var(--flow-sell)" }}>
                    {r.cells === 0 ? t("exUnknown") : r.support == null ? t("exNoWall") : r.support}
                  </td>
                  <td style={{ ...TD, textAlign: "right", color: r.cells === 0 ? "var(--text-dim)" : "var(--flow-buy)" }}>
                    {r.cells === 0 ? t("exUnknown") : r.resistance == null ? t("exNoWall") : r.resistance}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={FOOT}>{t("exLegend")}</p>
          <p style={FOOT}>{t("exDisclose")}</p>
        </>
      )}
    </section>
  );
}

// ─── Styles (v5 tokens; mirrors HedgingCards) ───────────────────────────────────────

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

const STAT_ROW: React.CSSProperties = {
  display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 8,
};

const STAT: React.CSSProperties = {
  display: "flex", flexDirection: "column", gap: 1, minWidth: 0,
};

const LEG_LBL: React.CSSProperties = {
  fontSize: "var(--fs-micro)", letterSpacing: ".04em", textTransform: "uppercase",
  color: "var(--text-dim)", whiteSpace: "nowrap",
};

const LEG_VAL: React.CSSProperties = {
  fontSize: 13, fontWeight: 600, fontVariantNumeric: "tabular-nums",
};

const GAUGE_WRAP: React.CSSProperties = { margin: "2px 0 9px" };

const GAUGE_TRACK: React.CSSProperties = {
  position: "relative", height: 6, borderRadius: 999,
  background: "var(--inset)", border: "1px solid var(--line-2)",
};

const GAUGE_MID: React.CSSProperties = {
  position: "absolute", left: "50%", top: -2, bottom: -2, width: 1,
  background: "var(--line-2)",
};

const GAUGE_NEEDLE: React.CSSProperties = {
  position: "absolute", top: -3, width: 3, height: 12, borderRadius: 2,
  transform: "translateX(-50%)",
};

const GAUGE_ENDS: React.CSSProperties = {
  display: "flex", justifyContent: "space-between", marginTop: 3,
  fontSize: "var(--fs-micro)", letterSpacing: ".04em", textTransform: "uppercase",
  color: "var(--text-dim)",
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

const EMPTY_SM: React.CSSProperties = {
  padding: "24px 8px", textAlign: "center", fontSize: 11, color: "var(--muted)",
};

const FOOT: React.CSSProperties = {
  margin: "0 0 4px", fontSize: 10, lineHeight: 1.5, color: "var(--muted)",
};
