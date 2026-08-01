"use client";
/**
 * VolHistoryPanel — Panel B: ATM IV over the last ~90 sessions.
 *
 * One line from history[].atm_iv (the ONLY real field in the live history rows —
 * iv_rank/close are null upstream). Finite-filtered per R7 with the series broken
 * at gaps; fewer than 10 finite points renders the honest empty state instead of
 * a misleading fragment. The 52-week hi/lo publish as scalars on the payload and
 * are drawn as dashed reference lines ONLY when they fall inside the padded
 * y-domain (a far-away extreme must not flatten the 90-day line into a band).
 */

import React, { useMemo, useRef } from "react";
import {
  useChartWidth, niceTicks, fmtTick, thinLabels, padDomain, MIN_CHART_H,
} from "@/components/charts/svgChart";
import type { Lang } from "@/lib/i18n";
import { makeVolT } from "./volStrings";
import type { VolHistoryRow } from "./volTypes";
import {
  finiteSegments, ProvenanceLine, PanelEmpty, PLOT_PAD, AXIS_TXT, REF_TXT,
} from "./volShared";

const H = MIN_CHART_H.axis; // 190 — labelled x-axis minimum (R4)

interface Pt { date: string; e: number; v: number }

export function VolHistoryPanel({
  history,
  iv52wHi,
  iv52wLo,
  lang,
}: {
  history: VolHistoryRow[] | undefined;
  iv52wHi: number | null | undefined;
  iv52wLo: number | null | undefined;
  lang: Lang;
}) {
  const t = makeVolT(lang);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const w = useChartWidth(boxRef);

  // Date-valid rows in ascending order; atm_iv stays raw here — segmentation
  // below decides what is drawable (R7: gaps break the line, never bridge).
  const rows = useMemo<Pt[]>(() => {
    const out: Pt[] = [];
    for (const r of history ?? []) {
      if (typeof r?.date !== "string") continue;
      const e = Date.parse(`${r.date.slice(0, 10)}T00:00:00Z`);
      if (!Number.isFinite(e)) continue;
      out.push({ date: r.date.slice(0, 10), e, v: Number(r.atm_iv) });
    }
    out.sort((a, b) => a.e - b.e);
    return out;
  }, [history]);

  const finite = useMemo(() => rows.filter((p) => Number.isFinite(p.v)), [rows]);

  // ── Empty gate — the wrapper (with the measure ref) is ALWAYS rendered. ──
  const drawable = finite.length >= 10;

  // Domains + scales (computed unconditionally — hooks can't hide behind the gate).
  const [y0, y1] = useMemo(() => {
    if (!drawable) return [0, 1] as [number, number];
    let lo = Infinity, hi = -Infinity;
    for (const p of finite) { if (p.v < lo) lo = p.v; if (p.v > hi) hi = p.v; }
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

  const { values: yTicks, step: yStep } = niceTicks(y0, y1, 4);
  const xLabels = useMemo(
    () => thinLabels(finite, (p) => xOf(p.e), 56),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [finite, w, e0, e1],
  );

  const segments = useMemo(() => finiteSegments(rows, (p) => p.v), [rows]);

  // Dashed 52w reference lines — only when inside the padded domain (spec).
  const refLines: { key: "hist52wHi" | "hist52wLo"; v: number }[] = [];
  if (drawable && iv52wHi != null && Number.isFinite(iv52wHi) && iv52wHi >= y0 && iv52wHi <= y1) {
    refLines.push({ key: "hist52wHi", v: iv52wHi });
  }
  if (drawable && iv52wLo != null && Number.isFinite(iv52wLo) && iv52wLo >= y0 && iv52wLo <= y1) {
    refLines.push({ key: "hist52wLo", v: iv52wLo });
  }

  return (
    <section className="fin-card" style={{ minWidth: 0 }}>
      <div className="fin-card-h">{t("histTitle")}</div>
      <div ref={boxRef} style={{ width: "100%", minWidth: 0 }}>
        {!drawable ? (
          <PanelEmpty title={t("histEmptyTitle")} why={t("histEmptyWhy")} minHeight={H} />
        ) : (
          <svg viewBox={`0 0 ${w} ${H}`} width={w} height={H} role="img" aria-label={t("histAria")}>
            {/* y grid + labels */}
            {yTicks.map((v) => (
              <g key={`y${v}`}>
                <line x1={PLOT_PAD.l} x2={w - PLOT_PAD.r} y1={yOf(v)} y2={yOf(v)} stroke="var(--grid)" />
                <text x={PLOT_PAD.l - 6} y={yOf(v) + 3} textAnchor="end" style={AXIS_TXT}>
                  {fmtTick(v, yStep)}%
                </text>
              </g>
            ))}
            {/* 52w reference lines (dashed, neutral) */}
            {refLines.map((r) => (
              <g key={r.key}>
                <line
                  x1={PLOT_PAD.l} x2={w - PLOT_PAD.r} y1={yOf(r.v)} y2={yOf(r.v)}
                  stroke="var(--muted)" strokeDasharray="4 3" strokeWidth={1}
                />
                <text x={w - PLOT_PAD.r - 2} y={yOf(r.v) - 3} textAnchor="end" style={REF_TXT}>
                  {t(r.key)}
                </text>
              </g>
            ))}
            {/* series — one path per finite run */}
            {segments.map((seg, i) => (
              <path
                key={i}
                d={seg.map((p, j) => `${j === 0 ? "M" : "L"}${xOf(p.e).toFixed(1)},${yOf(p.v).toFixed(1)}`).join("")}
                fill="none"
                stroke="var(--brand-2)"
                strokeWidth={1.6}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ))}
            {/* x labels — thinned by rendered pixel gap (R6) */}
            {xLabels.map((p) => (
              <text key={p.date} x={xOf(p.e)} y={H - 8} textAnchor="middle" style={AXIS_TXT}>
                {p.date.slice(5)}
              </text>
            ))}
          </svg>
        )}
      </div>
      <ProvenanceLine lang={lang} />
    </section>
  );
}
