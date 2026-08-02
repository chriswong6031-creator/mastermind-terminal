"use client";
/**
 * MaxPainTimePanel — the max-pain strike per upcoming expiration ("Max
 * Pain/Time"), a dotted step series over the expiries[] rows, with spot_ref as
 * a dashed reference when it falls inside the strike domain.
 *
 * X is DTE-value-mapped (a 1-day gap between weeklies and a 90-day gap to a
 * LEAP render at their true distances — never index-spaced); labels thin by
 * rendered pixel gap (R6). Strikes on Y with padDomain (R7).
 */

import React, { useMemo, useRef } from "react";
import {
  useChartWidth, niceTicks, fmtTick, thinLabels, padDomain, MIN_CHART_H,
} from "@/components/charts/svgChart";
import type { Lang } from "@/lib/i18n";
import { makeStructureT } from "./structureStrings";
import type { MaxPainExpRow } from "./structureTypes";
import {
  ProvenanceLine, PanelEmpty, PLOT_PAD, AXIS_TXT, REF_TXT,
} from "./structureShared";

const H = MIN_CHART_H.axis;
const SERIES_COLOR = "var(--brand-2)";

interface Pt { exp: string; dte: number; k: number }

export function MaxPainTimePanel({
  expiries,
  spotRef,
  lang,
}: {
  expiries: MaxPainExpRow[] | undefined;
  spotRef: number | null | undefined;
  lang: Lang;
}) {
  const t = makeStructureT(lang);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const w = useChartWidth(boxRef);

  const pts = useMemo<Pt[]>(() => {
    const out: Pt[] = [];
    for (const r of expiries ?? []) {
      const k = Number(r?.max_pain);
      const dte = Number(r?.dte);
      if (typeof r?.exp !== "string" || !Number.isFinite(k) || !Number.isFinite(dte)) continue;
      out.push({ exp: r.exp, dte, k });
    }
    out.sort((a, b) => a.dte - b.dte);
    return out;
  }, [expiries]);

  const drawable = pts.length >= 2;

  const [x0, x1] = useMemo(() => {
    if (!drawable) return [0, 1] as [number, number];
    return padDomain(pts[0].dte, pts[pts.length - 1].dte, { padFrac: 0.05 });
  }, [pts, drawable]);

  const [y0, y1] = useMemo(() => {
    if (!drawable) return [0, 1] as [number, number];
    let lo = Infinity, hi = -Infinity;
    for (const p of pts) { if (p.k < lo) lo = p.k; if (p.k > hi) hi = p.k; }
    // Union spot into the domain when close (it is the read the panel exists
    // for); a far-away spot must not flatten the series (VolHistory convention).
    if (spotRef != null && Number.isFinite(spotRef) && hi > lo) {
      const span = hi - lo;
      if (spotRef > lo - span && spotRef < hi + span) {
        lo = Math.min(lo, spotRef); hi = Math.max(hi, spotRef);
      }
    }
    return padDomain(lo, hi);
  }, [pts, drawable, spotRef]);

  const plotW = Math.max(10, w - PLOT_PAD.l - PLOT_PAD.r);
  const plotH = H - PLOT_PAD.t - PLOT_PAD.b;
  const xOf = (d: number) => PLOT_PAD.l + ((d - x0) / Math.max(1e-9, x1 - x0)) * plotW;
  const yOf = (v: number) => PLOT_PAD.t + (1 - (v - y0) / Math.max(1e-9, y1 - y0)) * plotH;

  const { values: yTicks, step: yStep } = niceTicks(y0, y1, 4);
  const xLabels = useMemo(
    () => thinLabels(pts, (p) => xOf(p.dte), 56),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pts, w, x0, x1],
  );

  const spotIn = spotRef != null && Number.isFinite(spotRef) && spotRef >= y0 && spotRef <= y1;

  return (
    <section className="fin-card" style={{ minWidth: 0 }}>
      <div className="fin-card-h">{t("maxPainTimeTitle")}</div>
      <div ref={boxRef} style={{ width: "100%", minWidth: 0 }}>
        {!drawable ? (
          <PanelEmpty title={t("maxPainTimeEmptyTitle")} why={t("maxPainTimeEmptyWhy")} minHeight={H} />
        ) : (
          <svg viewBox={`0 0 ${w} ${H}`} width={w} height={H} role="img" aria-label={t("maxPainTimeAria")}>
            {yTicks.map((v) => (
              <g key={`y${v}`}>
                <line x1={PLOT_PAD.l} x2={w - PLOT_PAD.r} y1={yOf(v)} y2={yOf(v)} stroke="var(--grid)" />
                <text x={PLOT_PAD.l - 6} y={yOf(v) + 3} textAnchor="end" style={AXIS_TXT}>
                  {fmtTick(v, yStep)}
                </text>
              </g>
            ))}
            {spotIn && (
              <g>
                <line x1={PLOT_PAD.l} x2={w - PLOT_PAD.r} y1={yOf(spotRef as number)} y2={yOf(spotRef as number)}
                  stroke="var(--muted)" strokeDasharray="4 3" strokeWidth={1} />
                <text x={w - PLOT_PAD.r - 2} y={yOf(spotRef as number) - 3} textAnchor="end" style={REF_TXT}>
                  {t("spotLabel")} {(spotRef as number).toFixed(2)}
                </text>
              </g>
            )}
            <path
              d={pts.map((p, i) => `${i === 0 ? "M" : "L"}${xOf(p.dte).toFixed(1)},${yOf(p.k).toFixed(1)}`).join("")}
              fill="none" stroke={SERIES_COLOR} strokeWidth={1.6}
              strokeLinejoin="round" strokeLinecap="round"
            />
            {pts.map((p) => (
              <circle key={p.exp} cx={xOf(p.dte)} cy={yOf(p.k)} r={2.4} fill={SERIES_COLOR} />
            ))}
            {xLabels.map((p) => (
              <text key={p.exp} x={xOf(p.dte)} y={H - 8} textAnchor="middle" style={AXIS_TXT}>
                {/* Cross-year expiries keep their year — a bare "03-19" after
                    "12-18" reads as out of order on a DTE-mapped axis. */}
                {p.exp.slice(0, 4) === pts[0]?.exp.slice(0, 4) ? p.exp.slice(5) : p.exp.slice(2)}
              </text>
            ))}
          </svg>
        )}
      </div>
      <ProvenanceLine lang={lang} />
    </section>
  );
}
