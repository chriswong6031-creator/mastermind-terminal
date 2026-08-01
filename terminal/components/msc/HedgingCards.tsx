"use client";
/**
 * HedgingCards — Volland-parity wave 1 (docs/VOLLAND_PARITY_PLAN_2026-08-01.md §5 W1).
 *
 * THE REFRAMING: every greek renders on ONE axis — the dollars of underlying a continuously
 * hedged dealer must transact. Gamma, vanna, charm and delta all collapse to "dealers buy /
 * dealers sell $X". We already published every input; we were showing the greek and asking
 * the reader to do the translation.
 *
 * Three cards:
 *   1. Hedging requirement by strike — histogram + the anchored cumulative profile.
 *   2. Term structure — the same requirement per expiration, banded by the GAP between
 *      expirations (so a dense 0DTE cluster and a lone LEAPS read differently at a glance).
 *   3. Today's hedging — the gamma leg scaled by the ticker's OWN one-sigma expected move
 *      rather than a nominal 1%, so the number means "on a typical day".
 *
 * SVG LAW (components/charts/svgChart.ts): 1:1 measured viewBox, never
 * preserveAspectRatio="none", domains via padDomain over finite values, value ticks from
 * niceTicks with precision from the step, and axis labels thinned by PIXEL GAP — never i % n
 * on a value-mapped axis.
 *
 * COLOUR LAW: this is a transaction side, so --flow-buy/--flow-sell (which do not invert
 * under the East-Asian convention), never --up/--down. Every readout says "buy"/"sell" in
 * words so the colour is never load-bearing on its own.
 */

import React, { useMemo, useRef, useState } from "react";
import { Tip } from "@/components/ui/Tip";
import { fmtMn, fmtMnMag } from "@/lib/gexLadder";
import {
  hedgeProfile,
  termStructure,
  dailyHedging,
  type AggregateResult,
  type HedgeGreek,
  type MscExpiryRow,
  type MscStrikeRow,
  type TenorBand,
} from "@/lib/marketStructure";
import { fmtTick, niceTicks, padDomain, useChartWidth } from "@/components/charts/svgChart";
import { makeMscT, type MscKey } from "./mscStrings";
import type { Lang } from "@/lib/i18n";

type T = (k: MscKey) => string;

const H = 168;
const PAD = { l: 8, r: 52, t: 10, b: 22 };

const GREEKS: { key: HedgeGreek; labelKey: MscKey }[] = [
  { key: "gamma", labelKey: "hgGamma" },
  { key: "delta", labelKey: "hgDelta" },
  { key: "vanna", labelKey: "hgVanna" },
  { key: "charm", labelKey: "hgCharm" },
];

const BAND_COLOR: Record<TenorBand, string> = {
  daily: "var(--warn)",
  weekly: "var(--signal)",
  monthly: "var(--brand-2)",
  quarterly: "var(--brand)",
  annual: "var(--code-fn)",
};

const BAND_KEY: Record<TenorBand, MscKey> = {
  daily: "bandDaily",
  weekly: "bandWeekly",
  monthly: "bandMonthly",
  quarterly: "bandQuarterly",
  annual: "bandAnnual",
};

const sideColor = (v: number) =>
  v > 0 ? "var(--flow-buy)" : v < 0 ? "var(--flow-sell)" : "var(--text-dim)";

// ─── Card 1: hedging requirement by strike ───────────────────────────────────────────

export function HedgingByStrikeCard({
  byStrike,
  spot,
  lang,
}: {
  byStrike: readonly MscStrikeRow[] | null | undefined;
  spot: number | null | undefined;
  lang: Lang;
}) {
  const t = makeMscT(lang);
  const [greek, setGreek] = useState<HedgeGreek>("gamma");
  const [view, setView] = useState<"bars" | "profile">("bars");
  const boxRef = useRef<HTMLDivElement | null>(null);
  const W = useChartWidth(boxRef, 640);

  const p = useMemo(() => hedgeProfile(byStrike, greek, spot), [byStrike, greek, spot]);
  const series = view === "bars"
    ? p.rows.map((r) => ({ x: r.strike, y: r.hedgeMn }))
    : p.cumulative.map((c) => ({ x: c.strike, y: c.cumMn }));

  const hasData = series.length > 1;
  const innerW = Math.max(60, W - PAD.l - PAD.r);
  const innerH = H - PAD.t - PAD.b;

  const geom = useMemo(() => {
    if (!hasData) return null;
    const xs = series.map((s) => s.x).filter(Number.isFinite);
    const ys = series.map((s) => s.y).filter(Number.isFinite);
    if (!xs.length || !ys.length) return null;
    const [x0, x1] = padDomain(Math.min(...xs), Math.max(...xs), { padFrac: 0.02 });
    // Hedging flips sign, so zero is a meaningful reference and is always unioned in.
    const [y0, y1] = padDomain(Math.min(...ys), Math.max(...ys), {
      padFrac: 0.12,
      includeZero: true,
    });
    const sx = (v: number) => PAD.l + ((v - x0) / (x1 - x0 || 1)) * innerW;
    const sy = (v: number) => PAD.t + innerH - ((v - y0) / (y1 - y0 || 1)) * innerH;
    const ticks = niceTicks(y0, y1, 3);
    return { x0, x1, y0, y1, sx, sy, ticks };
  }, [series, hasData, innerW, innerH]);

  return (
    <section style={{ ...CARD, gridColumn: "1 / -1" }}>
      <header style={CARD_HD}>
        <span className="obs-lbl">{t("hgTitle")}</span>
        <Tip label={t("tierBWhy")} side="top" size="card">
          <span style={TIER_CHIP} tabIndex={0}>{t("tierB")}</span>
        </Tip>
      </header>
      <p style={LEAD}>{t("hgLead")}</p>

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
        <div style={CHIP_GROUP} role="group" aria-label={t("hgViewAria")}>
          {(["bars", "profile"] as const).map((v) => (
            <button
              key={v}
              className={`obs-chip${view === v ? " on" : ""}`}
              style={CHIP}
              aria-pressed={view === v}
              onClick={() => setView(v)}
            >
              {t(v === "bars" ? "hgViewBars" : "hgViewProfile")}
            </button>
          ))}
        </div>
        <span style={UNIT}>{t("hgPerUnit").replace("{u}", t(perUnitKey(p.perUnit)))}</span>
      </div>

      <div ref={boxRef} style={{ width: "100%" }}>
        {!hasData || !geom ? (
          <div style={EMPTY_SM}>{t("hgNoLens")}</div>
        ) : (
          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t("hgTitle")}>
            {geom.ticks.values.map((tv) => (
              <g key={tv}>
                <line
                  x1={PAD.l} x2={PAD.l + innerW} y1={geom.sy(tv)} y2={geom.sy(tv)}
                  stroke={tv === 0 ? "var(--line-2)" : "var(--hairline)"}
                  strokeWidth={tv === 0 ? 1 : 0.5}
                />
                <text
                  x={PAD.l + innerW + 6} y={geom.sy(tv) + 3}
                  fill="var(--text-dim)" fontSize={9}
                >
                  {fmtTick(tv, geom.ticks.step)}
                </text>
              </g>
            ))}

            {view === "bars"
              ? series.map((s) => {
                  const y0 = geom.sy(0);
                  const y = geom.sy(s.y);
                  const bw = Math.max(1, Math.min(6, innerW / Math.max(series.length, 1) - 1));
                  return (
                    <rect
                      key={s.x}
                      x={geom.sx(s.x) - bw / 2}
                      y={Math.min(y, y0)}
                      width={bw}
                      height={Math.max(0.6, Math.abs(y - y0))}
                      fill={sideColor(s.y)}
                      opacity={0.85}
                    />
                  );
                })
              : (
                <polyline
                  fill="none"
                  stroke="var(--brand-2)"
                  strokeWidth={1.5}
                  points={series.map((s) => `${geom.sx(s.x)},${geom.sy(s.y)}`).join(" ")}
                />
              )}

            {Number.isFinite(spot ?? NaN) && (spot as number) > geom.x0 && (spot as number) < geom.x1 && (
              <>
                <line
                  x1={geom.sx(spot as number)} x2={geom.sx(spot as number)}
                  y1={PAD.t} y2={PAD.t + innerH}
                  stroke="var(--text-2)" strokeWidth={1} strokeDasharray="3 3"
                />
                <text
                  x={geom.sx(spot as number) + 4} y={PAD.t + 9}
                  fill="var(--text-2)" fontSize={9}
                >
                  {t("hgSpot")}
                </text>
              </>
            )}
          </svg>
        )}
      </div>

      <p style={FOOT}>{t("hgLegend")}</p>
      {view === "profile" && (
        <p style={FOOT}>{t(p.anchored ? "hgAnchored" : "hgUnanchored")}</p>
      )}
      {hasData && <p style={FOOT}>{t("hgScale").replace("{v}", fmtMnMag(view === "bars" ? p.maxAbsMn : p.maxAbsCumMn))}</p>}
    </section>
  );
}

function perUnitKey(u: string): MscKey {
  return u === "1% spot" ? "unitSpot"
    : u === "1 vol point" ? "unitVol"
    : u === "1 day" ? "unitDay"
    : "unitPosition";
}

// ─── Card 2: term structure ──────────────────────────────────────────────────────────

export function TermStructureCard({
  byExpiry,
  asof,
  lang,
}: {
  byExpiry: readonly MscExpiryRow[] | null | undefined;
  asof: string | null | undefined;
  lang: Lang;
}) {
  const t = makeMscT(lang);
  const ts = useMemo(() => termStructure(byExpiry, "gamma", asof), [byExpiry, asof]);
  const nodes = ts.nodes;
  const max = ts.maxAbsMn || 1;

  const bandsPresent = useMemo(() => {
    const s = new Set<TenorBand>();
    for (const n of nodes) if (n.band) s.add(n.band);
    return [...s];
  }, [nodes]);

  return (
    <section style={CARD}>
      <header style={CARD_HD}>
        <span className="obs-lbl">{t("tsTitle")}</span>
        <Tip label={t("tierBWhy")} side="top" size="card">
          <span style={TIER_CHIP} tabIndex={0}>{t("tierB")}</span>
        </Tip>
      </header>
      <p style={LEAD}>{t("tsLead")}</p>

      {!nodes.length ? (
        <p style={FOOT}>{t("tsNone")}</p>
      ) : (
        <>
          <table style={TABLE}>
            <thead>
              <tr>
                <th style={TH}>{t("tsColExp")}</th>
                <th style={{ ...TH, textAlign: "right" }}>{t("tsColDte")}</th>
                <th style={{ ...TH, textAlign: "right" }}>{t("tsColHedge")}</th>
                <th style={{ ...TH, textAlign: "right" }}>{t("tsColCum")}</th>
              </tr>
            </thead>
            <tbody>
              {nodes.slice(0, 12).map((n) => (
                <tr key={n.exp}>
                  <td style={TD}>
                    <span
                      style={{
                        display: "inline-block", width: 3, height: 10, marginRight: 6,
                        borderRadius: 1, verticalAlign: "middle",
                        background: n.band ? BAND_COLOR[n.band] : "transparent",
                      }}
                      aria-hidden
                    />
                    {n.exp}
                  </td>
                  <td style={{ ...TD, textAlign: "right", color: "var(--text-2)" }}>
                    {n.dte == null ? "—" : `${n.dte}d`}
                  </td>
                  <td style={{ ...TD, textAlign: "right", color: sideColor(n.hedgeMn) }}>
                    {fmtMn(n.hedgeMn)}
                  </td>
                  <td style={{ ...TD, textAlign: "right", color: "var(--text-2)" }}>
                    {fmtMn(n.cumMn)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {nodes.length > 12 && (
            <p style={FOOT}>{t("tsMore").replace("{n}", String(nodes.length - 12))}</p>
          )}
          {bandsPresent.length > 0 && (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 4 }}>
              {bandsPresent.map((b) => (
                <span key={b} style={{ ...FOOT, margin: 0, display: "flex", alignItems: "center", gap: 4 }}>
                  <span
                    style={{ width: 3, height: 9, borderRadius: 1, background: BAND_COLOR[b] }}
                    aria-hidden
                  />
                  {t(BAND_KEY[b])}
                </span>
              ))}
            </div>
          )}
          <p style={FOOT}>{t("tsBandWhy")}</p>
          <p style={FOOT}>{t("tsGammaOnly")}</p>
        </>
      )}
    </section>
  );
}

// ─── Card 3: today's hedging ─────────────────────────────────────────────────────────

export function DailyHedgingCard({
  agg,
  emPct1sig,
  lang,
}: {
  agg: AggregateResult;
  emPct1sig: number | null;
  lang: Lang;
}) {
  const t = makeMscT(lang);
  const d = useMemo(() => dailyHedging(agg, emPct1sig), [agg, emPct1sig]);

  const legs: { key: MscKey; v: number | null; note: string }[] = [
    { key: "dhSpot", v: d.fromSpotMn, note: d.emPct == null ? "" : `±${d.emPct.toFixed(2)}%` },
    { key: "dhVol", v: d.fromVolMn, note: d.volPts == null ? "" : `+${d.volPts} pt` },
    { key: "dhTime", v: d.fromTimeMn, note: t("dhOneDay") },
  ];

  return (
    <section style={CARD}>
      <header style={CARD_HD}>
        <span className="obs-lbl">{t("dhTitle")}</span>
        <Tip label={t("tierBWhy")} side="top" size="card">
          <span style={TIER_CHIP} tabIndex={0}>{t("tierB")}</span>
        </Tip>
      </header>
      <p style={LEAD}>{t("dhLead")}</p>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {legs.map((l) => (
          <div key={l.key} style={LEG_ROW}>
            <span style={LEG_LBL}>
              {t(l.key)}
              {l.note && <span style={{ color: "var(--text-dim)", marginLeft: 5 }}>{l.note}</span>}
            </span>
            <span style={{ ...LEG_VAL, color: l.v == null ? "var(--text-dim)" : sideColor(l.v) }}>
              {l.v == null ? t("dhAbsent") : fmtMn(l.v)}
            </span>
          </div>
        ))}
        <div style={{ ...LEG_ROW, borderTop: "1px solid var(--line)", paddingTop: 5 }}>
          <span style={{ ...LEG_LBL, color: "var(--text-2)" }}>{t("dhTotal")}</span>
          <span style={{ ...LEG_VAL, fontWeight: 700, color: d.totalMn == null ? "var(--text-dim)" : sideColor(d.totalMn) }}>
            {d.totalMn == null ? "—" : fmtMn(d.totalMn)}
          </span>
        </div>
      </div>

      <p style={FOOT}>{t("dhLegend")}</p>
      <p style={FOOT}>{t("dhDisclose")}</p>
    </section>
  );
}

// ─── Styles (v5 tokens; mirrors MarketStructureBody) ────────────────────────────────

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

const LEG_ROW: React.CSSProperties = {
  display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10,
};

const LEG_LBL: React.CSSProperties = {
  fontSize: "var(--fs-micro)", letterSpacing: ".04em", textTransform: "uppercase",
  color: "var(--text-dim)",
};

const LEG_VAL: React.CSSProperties = {
  fontSize: 13, fontWeight: 600, fontVariantNumeric: "tabular-nums",
};

const EMPTY_SM: React.CSSProperties = {
  padding: "24px 8px", textAlign: "center", fontSize: 11, color: "var(--muted)",
};

const FOOT: React.CSSProperties = {
  margin: "0 0 4px", fontSize: 10, lineHeight: 1.5, color: "var(--muted)",
};
