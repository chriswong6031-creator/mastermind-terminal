"use client";
/**
 * OiLadderPanel — call/put open interest per strike as a diverging horizontal
 * ladder (puts leftward, calls rightward from a shared center axis).
 *
 * Rows come pre-windowed from the payload (±20% of spot_ref, cap 160 — the gex
 * ladder law); the header chip discloses the trim via by_strike_full_n. The
 * y-axis is strike-VALUE-mapped (not row-index), so uneven strike grids render
 * at their true positions and labels thin by pixel gap (R6). spot_ref draws as
 * a dashed reference line when it falls inside the plotted strike range.
 */

import React, { useMemo, useRef } from "react";
import { useChartWidth, niceTicks, fmtTick, thinLabels, padDomain } from "@/components/charts/svgChart";
import type { Lang } from "@/lib/i18n";
import { makeStructureT } from "./structureStrings";
import type { OiStrikeRow } from "./structureTypes";
import {
  CALL_COLOR, PUT_COLOR, fmtOi, ProvenanceLine, PanelEmpty,
  AXIS_TXT, REF_TXT, NEUTRAL_CHIP, LEGEND_ITEM, LEGEND_SWATCH,
} from "./structureShared";

const PAD = { l: 52, r: 14, t: 16, b: 22 } as const;

export function OiLadderPanel({
  byStrike,
  byStrikeFullN,
  spotRef,
  lang,
}: {
  byStrike: OiStrikeRow[] | undefined;
  byStrikeFullN: number | undefined;
  spotRef: number | null | undefined;
  lang: Lang;
}) {
  const t = makeStructureT(lang);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const w = useChartWidth(boxRef);

  const rows = useMemo(() => {
    const out = (byStrike ?? [])
      .filter((r) => Number.isFinite(Number(r?.strike)))
      .map((r) => ({
        strike: Number(r.strike),
        call: Math.max(0, Number(r.call_oi) || 0),
        put: Math.max(0, Number(r.put_oi) || 0),
      }));
    out.sort((a, b) => a.strike - b.strike);
    return out;
  }, [byStrike]);

  const drawable = rows.length >= 3;

  // Height scales with row count so dense ladders stay readable (capped).
  const H = Math.max(220, Math.min(440, rows.length * 7 + PAD.t + PAD.b));

  const [k0, k1] = useMemo(() => {
    if (!drawable) return [0, 1] as [number, number];
    return padDomain(rows[0].strike, rows[rows.length - 1].strike, { padFrac: 0.03 });
  }, [rows, drawable]);

  const maxOi = useMemo(
    () => rows.reduce((m, r) => Math.max(m, r.call, r.put), 0),
    [rows],
  );

  const plotH = H - PAD.t - PAD.b;
  const plotW = Math.max(10, w - PAD.l - PAD.r);
  const cx = PAD.l + plotW / 2;
  const halfW = plotW / 2 - 6;
  const yOf = (k: number) => PAD.t + (1 - (k - k0) / Math.max(1e-9, k1 - k0)) * plotH;
  const lenOf = (v: number) => (maxOi > 0 ? (v / maxOi) * halfW : 0);

  // Bar thickness from the tightest strike gap in PIXELS (uneven grids stay honest).
  const barH = useMemo(() => {
    if (rows.length < 2) return 6;
    let minGap = Infinity;
    for (let i = 1; i < rows.length; i++) {
      const g = Math.abs(yOf(rows[i].strike) - yOf(rows[i - 1].strike));
      if (g > 0 && g < minGap) minGap = g;
    }
    return Math.max(1.5, Math.min(7, minGap * 0.72));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, H, k0, k1]);

  const yLabels = useMemo(
    () => thinLabels(rows, (r) => -yOf(r.strike), 16).slice().reverse(),
    // thinLabels wants ascending xOf; y grows downward, hence the negation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, H, k0, k1],
  );

  const { values: xTickVals } = niceTicks(0, maxOi, 2);
  // Strike label precision derives from the STRIKE grid's own tightest step
  // (R5) — never from the OI axis, whose step is in contracts.
  const strikeStep = useMemo(() => {
    if (rows.length < 2) return 1;
    let s = Infinity;
    for (let i = 1; i < rows.length; i++) s = Math.min(s, rows[i].strike - rows[i - 1].strike);
    return Number.isFinite(s) && s > 0 ? s : 1;
  }, [rows]);
  const spotIn = spotRef != null && Number.isFinite(spotRef) && spotRef >= k0 && spotRef <= k1;

  const trimmed = (byStrikeFullN ?? 0) > rows.length;

  return (
    <section className="fin-card" style={{ minWidth: 0 }}>
      <div className="fin-card-h" style={{ flexWrap: "wrap", rowGap: 6 }}>
        <span>{t("ladderTitle")}</span>
        <span style={{ flex: 1 }} />
        <span style={LEGEND_ITEM}><span style={{ ...LEGEND_SWATCH, background: PUT_COLOR }} />{t("legPuts")}</span>
        <span style={LEGEND_ITEM}><span style={{ ...LEGEND_SWATCH, background: CALL_COLOR }} />{t("legCalls")}</span>
        {trimmed && (
          <span style={NEUTRAL_CHIP}>
            {t("ladderWindowChip")
              .replace("{n}", String(rows.length))
              .replace("{full}", String(byStrikeFullN))}
          </span>
        )}
      </div>
      <div ref={boxRef} style={{ width: "100%", minWidth: 0 }}>
        {!drawable ? (
          <PanelEmpty title={t("ladderEmptyTitle")} why={t("ladderEmptyWhy")} minHeight={220} />
        ) : (
          <svg viewBox={`0 0 ${w} ${H}`} width={w} height={H} role="img" aria-label={t("ladderAria")}>
            {/* magnitude grid, mirrored around the center axis */}
            {xTickVals.filter((v) => v > 0).map((v) => (
              <g key={`g${v}`}>
                <line x1={cx + lenOf(v)} x2={cx + lenOf(v)} y1={PAD.t} y2={H - PAD.b} stroke="var(--grid)" />
                <line x1={cx - lenOf(v)} x2={cx - lenOf(v)} y1={PAD.t} y2={H - PAD.b} stroke="var(--grid)" />
                <text x={cx + lenOf(v)} y={H - 8} textAnchor="middle" style={AXIS_TXT}>{fmtOi(v)}</text>
                <text x={cx - lenOf(v)} y={H - 8} textAnchor="middle" style={AXIS_TXT}>{fmtOi(v)}</text>
              </g>
            ))}
            <line x1={cx} x2={cx} y1={PAD.t} y2={H - PAD.b} stroke="var(--line-3)" />
            {/* bars */}
            {rows.map((r) => {
              const y = yOf(r.strike);
              return (
                <g key={r.strike}>
                  {r.put > 0 && (
                    <rect x={cx - lenOf(r.put)} y={y - barH / 2} width={lenOf(r.put)} height={barH}
                      fill={PUT_COLOR} opacity={0.85} rx={1} />
                  )}
                  {r.call > 0 && (
                    <rect x={cx} y={y - barH / 2} width={lenOf(r.call)} height={barH}
                      fill={CALL_COLOR} opacity={0.85} rx={1} />
                  )}
                </g>
              );
            })}
            {/* strike labels, pixel-gap thinned */}
            {yLabels.map((r) => (
              <text key={`l${r.strike}`} x={PAD.l - 6} y={yOf(r.strike) + 3} textAnchor="end" style={AXIS_TXT}>
                {fmtTick(r.strike, strikeStep)}
              </text>
            ))}
            {/* spot reference — the label gets a panel-colour backing rect so it
                stays legible over the longest call bar around the spot strike. */}
            {spotIn && (
              <g>
                <line x1={PAD.l} x2={w - PAD.r} y1={yOf(spotRef as number)} y2={yOf(spotRef as number)}
                  stroke="var(--muted)" strokeDasharray="4 3" strokeWidth={1} />
                <rect
                  x={w - PAD.r - 92} y={yOf(spotRef as number) - 13} width={92} height={12}
                  fill="var(--panel, #14161a)" opacity={0.82} rx={2}
                />
                <text x={w - PAD.r - 2} y={yOf(spotRef as number) - 3} textAnchor="end" style={REF_TXT}>
                  {t("spotLabel")} {(spotRef as number).toFixed(2)}
                </text>
              </g>
            )}
          </svg>
        )}
      </div>
      <ProvenanceLine lang={lang} />
    </section>
  );
}
