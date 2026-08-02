"use client";
/**
 * ProfileCard — the exposure profile: net dealer gamma RE-PRICED across a spot grid
 * (masterplan §4.2 `profile`, R1.1's UI half).
 *
 * This is the category's flagship chart — SpotGamma, MenthorQ and VS3D all lead with
 * exposure as a FUNCTION of spot — and until this card we published exposure only AT
 * spot. The curve arrives from the macro engine's ±25% grid re-pricing
 * (gex_engine.gamma_profile), the SAME evaluation that produces the published flip,
 * so the curve and the crossing cannot disagree.
 *
 * COLOUR LAW: net gamma is a REGIME, not a transaction side — the line is neutral
 * --brand-2 and the two half-planes carry regime WORDS ("dealers dampen/amplify"),
 * never --flow-buy/--flow-sell (those belong to hedge trades) and never --up/--down.
 * Regime words bind to the SIGN of the curve, not to which side of the flip spot
 * sits — a put-heavy book can be short gamma above its own flip.
 *
 * SVG LAW (svgChart.ts R1–R9): measured 1:1 viewBox, padDomain over finite values,
 * niceTicks with step-derived precision, x labels thinned by pixel gap, ≥190px.
 *
 * Fail-open: hides its body when the payload has no profile (pre-2026-08-02 payloads,
 * iv-sparse chains) — the foot says why rather than the card vanishing silently.
 */

import React, { useMemo, useRef } from "react";
import { fmtTick, niceTicks, padDomain, thinLabels, useChartWidth } from "@/components/charts/svgChart";
import { makeMscT } from "./mscStrings";
import { MscCard, CardFoot, CardSpacer } from "./MscCard";
import type { GexPayload } from "@/components/gexdesk/GexDeskView";
import type { Lang } from "@/lib/i18n";

const H = 224;
const PAD = { l: 8, r: 56, t: 14, b: 22 };

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export function ProfileCard({
  gex,
  lang,
}: {
  gex: GexPayload | null;
  lang: Lang;
}) {
  const t = makeMscT(lang);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const W = useChartWidth(boxRef, 640);

  const p = gex?.profile;
  const spot = gex?.spot_ref ?? null;

  const data = useMemo(() => {
    if (!p || !Array.isArray(p.grid) || !Array.isArray(p.gamma_bn)) return null;
    const pts: { x: number; y: number }[] = [];
    const n = Math.min(p.grid.length, p.gamma_bn.length);
    for (let i = 0; i < n; i++) {
      const x = p.grid[i];
      const y = p.gamma_bn[i];
      if (isNum(x) && isNum(y)) pts.push({ x, y });
    }
    return pts.length >= 11 ? pts : null;
  }, [p]);

  const innerW = Math.max(60, W - PAD.l - PAD.r);
  const innerH = H - PAD.t - PAD.b;

  const geom = useMemo(() => {
    if (!data) return null;
    const xs = data.map((d) => d.x);
    const ys = data.map((d) => d.y);
    const [x0, x1] = padDomain(Math.min(...xs), Math.max(...xs), { padFrac: 0.01 });
    // Zero is ALWAYS in — the whole point of the curve is where it crosses.
    let [y0, y1] = padDomain(Math.min(...ys), Math.max(...ys), { padFrac: 0.1, includeZero: true });
    y0 = Math.min(y0, 0);
    y1 = Math.max(y1, 0);
    const sx = (v: number) => PAD.l + ((v - x0) / (x1 - x0 || 1)) * innerW;
    const sy = (v: number) => PAD.t + innerH - ((v - y0) / (y1 - y0 || 1)) * innerH;
    const xTicksRaw = niceTicks(x0, x1, 8);
    const xt = thinLabels(
      xTicksRaw.values.map((v) => ({ x: sx(v), v })),
      (l) => l.x,
      56,
    );
    return { x0, x1, y0, y1, sx, sy, yTicks: niceTicks(y0, y1, 4), xt, xStep: xTicksRaw.step };
  }, [data, innerW, innerH]);

  // The crossing nearest spot is THE flip; other crossings render as minor ticks.
  const crossings = useMemo(
    () => (Array.isArray(p?.crossings) ? p.crossings.filter(isNum) : []),
    [p],
  );
  const flip = useMemo(() => {
    if (!crossings.length) return null;
    return isNum(spot)
      ? crossings.reduce((a, b) => (Math.abs(b - spot) < Math.abs(a - spot) ? b : a))
      : crossings[0];
  }, [crossings, spot]);

  return (
    <MscCard
      title={t("pfTitle")}
      info={t("pfLead")}
      tier={t("tierB")}
      tierWhy={t("tierBWhy")}
      headRight={<span style={UNIT}>{t("pfUnit")}</span>}
      span={8}
    >
      {!data || !geom ? (
        <CardFoot>{t("pfNone")}</CardFoot>
      ) : (
        <>
          <div ref={boxRef} style={{ width: "100%" }}>
            <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t("pfTitle")}>
              {/* Regime half-planes — words bound to the SIGN of the curve. */}
              <text x={PAD.l + 4} y={geom.sy(0) - 6} fontSize={8.5} fill="var(--text-dim)" opacity={0.85}>
                {t("pfDampen")}
              </text>
              <text x={PAD.l + 4} y={geom.sy(0) + 12} fontSize={8.5} fill="var(--text-dim)" opacity={0.85}>
                {t("pfAmplify")}
              </text>

              {geom.yTicks.values.map((tv) => (
                <g key={tv}>
                  <line
                    x1={PAD.l} x2={PAD.l + innerW} y1={geom.sy(tv)} y2={geom.sy(tv)}
                    stroke={tv === 0 ? "var(--line-2)" : "var(--hairline)"}
                    strokeWidth={tv === 0 ? 1.25 : 0.5}
                  />
                  <text x={PAD.l + innerW + 6} y={geom.sy(tv) + 3} fill="var(--text-dim)" fontSize={9}>
                    {fmtTick(tv, geom.yTicks.step)}
                  </text>
                </g>
              ))}
              {geom.xt.map((l) => (
                <text
                  key={l.v}
                  x={l.x}
                  y={H - 6}
                  fill="var(--text-dim)"
                  fontSize={9}
                  textAnchor={l.x - PAD.l < 20 ? "start" : PAD.l + innerW - l.x < 20 ? "end" : "middle"}
                >
                  {fmtTick(l.v, geom.xStep)}
                </text>
              ))}

              <polyline
                fill="none"
                stroke="var(--brand-2)"
                strokeWidth={1.6}
                strokeLinejoin="round"
                points={data.map((d) => `${geom.sx(d.x)},${geom.sy(d.y)}`).join(" ")}
              />

              {/* secondary crossings first, so the flip's marker sits on top */}
              {crossings
                .filter((c) => c !== flip && c > geom.x0 && c < geom.x1)
                .map((c) => (
                  <circle key={c} cx={geom.sx(c)} cy={geom.sy(0)} r={2} fill="var(--text-dim)" opacity={0.7} />
                ))}
              {flip != null && flip > geom.x0 && flip < geom.x1 && (
                <g>
                  <line
                    x1={geom.sx(flip)} x2={geom.sx(flip)} y1={PAD.t} y2={PAD.t + innerH}
                    stroke="var(--warn)" strokeWidth={0.9} strokeDasharray="2 3"
                  />
                  <circle cx={geom.sx(flip)} cy={geom.sy(0)} r={3} fill="var(--warn)" />
                  <text
                    x={geom.sx(flip) + (geom.sx(flip) > PAD.l + innerW * 0.75 ? -5 : 5)}
                    y={PAD.t + innerH - 6}
                    fontSize={9}
                    fill="var(--warn)"
                    textAnchor={geom.sx(flip) > PAD.l + innerW * 0.75 ? "end" : "start"}
                  >
                    {t("lvlFlip")} {flip.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </text>
                </g>
              )}

              {isNum(spot) && spot > geom.x0 && spot < geom.x1 && (
                <g>
                  <line
                    x1={geom.sx(spot)} x2={geom.sx(spot)} y1={PAD.t} y2={PAD.t + innerH}
                    stroke="var(--text-2)" strokeWidth={1} strokeDasharray="3 3"
                  />
                  <text x={geom.sx(spot) + 4} y={PAD.t + 9} fontSize={9} fill="var(--text-2)">
                    {t("hgSpot")}
                  </text>
                </g>
              )}

              {/* wall ticks on the price axis */}
              {[
                { v: gex?.call_wall, label: "CW" },
                { v: gex?.put_wall, label: "PW" },
              ]
                .filter((m) => isNum(m.v) && (m.v as number) > geom.x0 && (m.v as number) < geom.x1)
                .map((m) => (
                  <g key={m.label}>
                    <line
                      x1={geom.sx(m.v as number)} x2={geom.sx(m.v as number)}
                      y1={PAD.t + innerH - 8} y2={PAD.t + innerH}
                      stroke="var(--text-dim)" strokeWidth={1}
                    />
                    {/* Label only when the plot is wide enough that CW/PW cannot
                        collide with each other or the flip label (seen at 390px). */}
                    {W >= 520 && (
                      <text x={geom.sx(m.v as number) + 2} y={PAD.t + innerH - 10} fontSize={8} fill="var(--text-dim)">
                        {m.label}
                      </text>
                    )}
                  </g>
                ))}
            </svg>
          </div>

          <CardSpacer />
          <CardFoot>
            {t("pfLegend").replace("{p}", String(p?.span_pct ?? 25))}
            {crossings.length > 1 ? ` · ${t("pfMulti").replace("{n}", String(crossings.length))}` : ""}
          </CardFoot>
        </>
      )}
    </MscCard>
  );
}

const UNIT: React.CSSProperties = {
  fontSize: "var(--fs-micro)",
  letterSpacing: ".03em",
  color: "var(--text-dim)",
  textTransform: "uppercase",
  whiteSpace: "nowrap",
};
