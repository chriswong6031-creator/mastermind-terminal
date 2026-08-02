"use client";
/**
 * OiExpiryPanel — call/put open interest per upcoming expiration, grouped
 * vertical bars. Reads the max_pain payload's expiries[] rows (they carry
 * call_oi/put_oi per exp — this panel IS "OI by expiration"; no second fetch).
 *
 * The x-axis is categorical (one slot per expiration, near-dated first — DTE
 * spacing would crush the weeklies into one column); labels thin by RENDERED
 * pixel gap (R6), never by index. The expiries list is capped upstream; the
 * header chip discloses the cap via expiries_full_n.
 */

import React, { useMemo, useRef } from "react";
import { useChartWidth, niceTicks } from "@/components/charts/svgChart";
import type { Lang } from "@/lib/i18n";
import { makeStructureT } from "./structureStrings";
import type { MaxPainExpRow } from "./structureTypes";
import {
  CALL_COLOR, PUT_COLOR, fmtOi, ProvenanceLine, PanelEmpty,
  PLOT_PAD, AXIS_TXT, NEUTRAL_CHIP, LEGEND_ITEM, LEGEND_SWATCH,
} from "./structureShared";

const H = 210;

export function OiExpiryPanel({
  expiries,
  expiriesFullN,
  lang,
}: {
  expiries: MaxPainExpRow[] | undefined;
  expiriesFullN: number | undefined;
  lang: Lang;
}) {
  const t = makeStructureT(lang);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const w = useChartWidth(boxRef);

  const rows = useMemo(() => {
    const out = (expiries ?? [])
      .filter((r) => typeof r?.exp === "string")
      .map((r) => ({
        exp: r.exp,
        dte: Number(r.dte),
        call: Math.max(0, Number(r.call_oi) || 0),
        put: Math.max(0, Number(r.put_oi) || 0),
      }));
    out.sort((a, b) => a.dte - b.dte);
    return out;
  }, [expiries]);

  const drawable = rows.length >= 1;
  const maxOi = rows.reduce((m, r) => Math.max(m, r.call, r.put), 0);

  const plotW = Math.max(10, w - PLOT_PAD.l - PLOT_PAD.r);
  const plotH = H - PLOT_PAD.t - PLOT_PAD.b;
  const slotW = drawable ? plotW / rows.length : plotW;
  const barW = Math.max(1.5, Math.min(14, slotW * 0.32));
  const xOf = (i: number) => PLOT_PAD.l + (i + 0.5) * slotW;
  const hOf = (v: number) => (maxOi > 0 ? (v / maxOi) * plotH : 0);

  const { values: yTicks } = niceTicks(0, maxOi, 3);

  // Pixel-gap label thinning over slot centers (R6).
  const labeled = useMemo(() => {
    const kept: number[] = [];
    let lastX = -Infinity;
    rows.forEach((_, i) => {
      const x = xOf(i);
      if (x - lastX >= 56) { kept.push(i); lastX = x; }
    });
    return new Set(kept);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, w]);

  const capped = (expiriesFullN ?? 0) > rows.length;

  return (
    <section className="fin-card" style={{ minWidth: 0 }}>
      <div className="fin-card-h" style={{ flexWrap: "wrap", rowGap: 6 }}>
        <span>{t("expiryTitle")}</span>
        <span style={{ flex: 1 }} />
        <span style={LEGEND_ITEM}><span style={{ ...LEGEND_SWATCH, background: CALL_COLOR }} />{t("legCalls")}</span>
        <span style={LEGEND_ITEM}><span style={{ ...LEGEND_SWATCH, background: PUT_COLOR }} />{t("legPuts")}</span>
        {capped && (
          <span style={NEUTRAL_CHIP}>
            {t("expiryCapNote")
              .replace("{n}", String(rows.length))
              .replace("{full}", String(expiriesFullN))}
          </span>
        )}
      </div>
      <div ref={boxRef} style={{ width: "100%", minWidth: 0 }}>
        {!drawable ? (
          <PanelEmpty title={t("expiryEmptyTitle")} why={t("expiryEmptyWhy")} minHeight={H} />
        ) : (
          <svg viewBox={`0 0 ${w} ${H}`} width={w} height={H} role="img" aria-label={t("expiryAria")}>
            {yTicks.map((v) => (
              <g key={`y${v}`}>
                <line x1={PLOT_PAD.l} x2={w - PLOT_PAD.r} y1={PLOT_PAD.t + plotH - hOf(v)} y2={PLOT_PAD.t + plotH - hOf(v)} stroke="var(--grid)" />
                <text x={PLOT_PAD.l - 6} y={PLOT_PAD.t + plotH - hOf(v) + 3} textAnchor="end" style={AXIS_TXT}>
                  {fmtOi(v)}
                </text>
              </g>
            ))}
            {rows.map((r, i) => (
              <g key={r.exp}>
                <rect x={xOf(i) - barW - 1} y={PLOT_PAD.t + plotH - hOf(r.call)} width={barW} height={hOf(r.call)}
                  fill={CALL_COLOR} opacity={0.85} rx={1} />
                <rect x={xOf(i) + 1} y={PLOT_PAD.t + plotH - hOf(r.put)} width={barW} height={hOf(r.put)}
                  fill={PUT_COLOR} opacity={0.85} rx={1} />
                {labeled.has(i) && (
                  <text x={xOf(i)} y={H - 8} textAnchor="middle" style={AXIS_TXT}>
                    {/* Cross-year expiries keep their year (matches MaxPainTimePanel). */}
                    {r.exp.slice(0, 4) === rows[0]?.exp.slice(0, 4) ? r.exp.slice(5) : r.exp.slice(2)}
                  </text>
                )}
              </g>
            ))}
          </svg>
        )}
      </div>
      <ProvenanceLine lang={lang} />
    </section>
  );
}
