"use client";
/**
 * OiTimePanel — total call and put open interest per session (the ~18-month
 * oi_time history), two neutral lines on a shared zero-floored axis.
 *
 * Rows key by the OI report's session date; per the t-1 law each value is the
 * PRIOR session's positions — the shared provenance footer says so, and no
 * per-date claim beyond what the payload carries is made (R3 honesty rule).
 * Fewer than 10 finite sessions renders the honest empty instead of a
 * misleading fragment (the VolHistoryPanel convention).
 */

import React, { useMemo, useRef } from "react";
import {
  useChartWidth, niceTicks, thinLabels, padDomain, MIN_CHART_H,
} from "@/components/charts/svgChart";
import type { Lang } from "@/lib/i18n";
import { makeStructureT } from "./structureStrings";
import type { OiTimeRow } from "./structureTypes";
import {
  CALL_COLOR, PUT_COLOR, fmtOi, finiteSegments, ProvenanceLine, PanelEmpty,
  PLOT_PAD, AXIS_TXT, NEUTRAL_CHIP, LEGEND_ITEM, LEGEND_SWATCH,
} from "./structureShared";

const H = MIN_CHART_H.axis; // 190 — labelled x-axis minimum (R4)

interface Pt { date: string; e: number; call: number; put: number }

export function OiTimePanel({
  history,
  lang,
}: {
  history: OiTimeRow[] | undefined;
  lang: Lang;
}) {
  const t = makeStructureT(lang);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const w = useChartWidth(boxRef);

  const rows = useMemo<Pt[]>(() => {
    const out: Pt[] = [];
    for (const r of history ?? []) {
      if (typeof r?.date !== "string") continue;
      const e = Date.parse(`${r.date.slice(0, 10)}T00:00:00Z`);
      if (!Number.isFinite(e)) continue;
      out.push({ date: r.date.slice(0, 10), e, call: Number(r.call_oi), put: Number(r.put_oi) });
    }
    out.sort((a, b) => a.e - b.e);
    return out;
  }, [history]);

  const finite = useMemo(
    () => rows.filter((p) => Number.isFinite(p.call) || Number.isFinite(p.put)),
    [rows],
  );
  const drawable = finite.length >= 10;

  const [y0, y1] = useMemo(() => {
    if (!drawable) return [0, 1] as [number, number];
    let lo = Infinity, hi = -Infinity;
    for (const p of finite) {
      for (const v of [p.call, p.put]) {
        if (!Number.isFinite(v)) continue;
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
    }
    return padDomain(lo, hi, { clampMin: 0 });
  }, [finite, drawable]);

  const [e0, e1] = useMemo(() => {
    if (!drawable) return [0, 1] as [number, number];
    return [finite[0].e, finite[finite.length - 1].e] as [number, number];
  }, [finite, drawable]);

  const plotW = Math.max(10, w - PLOT_PAD.l - PLOT_PAD.r);
  const plotH = H - PLOT_PAD.t - PLOT_PAD.b;
  const xOf = (e: number) => PLOT_PAD.l + ((e - e0) / Math.max(1, e1 - e0)) * plotW;
  const yOf = (v: number) => PLOT_PAD.t + (1 - (v - y0) / Math.max(1e-9, y1 - y0)) * plotH;

  const { values: yTicks } = niceTicks(y0, y1, 4);
  const xLabels = useMemo(
    () => {
      // Pixel-thin, then drop consecutive labels that RENDER identically — on a
      // wide desktop 62px is under a month of sessions, so two kept labels can
      // fall in the same YY-MM (the R5 duplicate-tick failure, on a date axis).
      const kept = thinLabels(finite, (p) => xOf(p.e), 62);
      return kept.filter(
        (p, i) => i === 0 || p.date.slice(2, 7) !== kept[i - 1].date.slice(2, 7),
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [finite, w, e0, e1],
  );

  const callSegs = useMemo(() => finiteSegments(rows, (p) => p.call), [rows]);
  const putSegs = useMemo(() => finiteSegments(rows, (p) => p.put), [rows]);

  const pathOf = (seg: Pt[], leg: "call" | "put") =>
    seg.map((p, i) => `${i === 0 ? "M" : "L"}${xOf(p.e).toFixed(1)},${yOf(p[leg]).toFixed(1)}`).join("");

  const since = finite.length ? finite[0].date : null;

  return (
    <section className="fin-card" style={{ minWidth: 0 }}>
      <div className="fin-card-h" style={{ flexWrap: "wrap", rowGap: 6 }}>
        <span>{t("timeTitle")}</span>
        <span style={{ flex: 1 }} />
        <span style={LEGEND_ITEM}><span style={{ ...LEGEND_SWATCH, background: CALL_COLOR }} />{t("legCalls")}</span>
        <span style={LEGEND_ITEM}><span style={{ ...LEGEND_SWATCH, background: PUT_COLOR }} />{t("legPuts")}</span>
        {drawable && since && (
          <span style={NEUTRAL_CHIP}>
            {t("timeWindowCaption").replace("{n}", String(finite.length)).replace("{date}", since)}
          </span>
        )}
      </div>
      <div ref={boxRef} style={{ width: "100%", minWidth: 0 }}>
        {!drawable ? (
          <PanelEmpty title={t("timeEmptyTitle")} why={t("timeEmptyWhy")} minHeight={H} />
        ) : (
          <svg viewBox={`0 0 ${w} ${H}`} width={w} height={H} role="img" aria-label={t("timeAria")}>
            {yTicks.map((v) => (
              <g key={`y${v}`}>
                <line x1={PLOT_PAD.l} x2={w - PLOT_PAD.r} y1={yOf(v)} y2={yOf(v)} stroke="var(--grid)" />
                <text x={PLOT_PAD.l - 6} y={yOf(v) + 3} textAnchor="end" style={AXIS_TXT}>
                  {fmtOi(v)}
                </text>
              </g>
            ))}
            {callSegs.map((seg, i) => (
              <path key={`c${i}`} d={pathOf(seg, "call")} fill="none" stroke={CALL_COLOR}
                strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
            ))}
            {putSegs.map((seg, i) => (
              <path key={`p${i}`} d={pathOf(seg, "put")} fill="none" stroke={PUT_COLOR}
                strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
            ))}
            {xLabels.map((p) => (
              <text key={p.date} x={xOf(p.e)} y={H - 8} textAnchor="middle" style={AXIS_TXT}>
                {p.date.slice(2, 7)}
              </text>
            ))}
          </svg>
        )}
      </div>
      <ProvenanceLine lang={lang} />
    </section>
  );
}
