"use client";
/**
 * PutCallHistoryPanel — the R5 put/call open-interest history surface.
 *
 * It reuses StructureView's existing one-shot options_hub.oi_time/v1 payload;
 * no endpoint, fetch, or producer is added. The one derivation is put OI divided
 * by call OI. Bad denominators remain gaps, and the shared footer preserves the
 * nightly EOD / t-1 timing law.
 */

import React, { useMemo, useRef } from "react";
import {
  fmtTick, MIN_CHART_H, niceTicks, padDomain, thinLabels, useChartWidth,
} from "@/components/charts/svgChart";
import type { Lang } from "@/lib/i18n";
import {
  selectPutCallOiHistory,
  summarizePutCallOiHistory,
  type PutCallOiHistoryPoint,
} from "@/lib/optionsPutCallHistory";
import { makeStructureT } from "./structureStrings";
import type { OiTimeRow } from "./structureTypes";
import {
  AXIS_TXT, finiteSegments, LEGEND_ITEM, LEGEND_SWATCH, NEUTRAL_CHIP,
  PanelEmpty, PLOT_PAD, ProvenanceLine, REF_TXT,
} from "./structureShared";

const H = MIN_CHART_H.axis;
const RATIO_COLOR = "var(--brand-2)";

function fmtRatio(value: number | null): string {
  return value == null || !Number.isFinite(value) ? "—" : value.toFixed(2);
}

function Receipt({ label, value, marker }: { label: string; value: string; marker: string }) {
  return (
    <span style={RECEIPT} data-options-pc-oi-receipt={marker}>
      <span style={RECEIPT_LABEL}>{label}</span>
      <strong style={RECEIPT_VALUE}>{value}</strong>
    </span>
  );
}

export function PutCallHistoryPanel({
  history,
  lang,
  sourceSchema,
  oiDate,
}: {
  history: OiTimeRow[] | undefined;
  lang: Lang;
  sourceSchema?: string;
  oiDate?: string;
}) {
  const t = makeStructureT(lang);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const w = useChartWidth(boxRef);
  const points = useMemo(() => selectPutCallOiHistory(history), [history]);
  const summary = useMemo(() => summarizePutCallOiHistory(points), [points]);
  const finite = useMemo(
    () => points.filter(
      (point): point is PutCallOiHistoryPoint & { ratio: number } =>
        typeof point.ratio === "number" && Number.isFinite(point.ratio),
    ),
    [points],
  );
  const drawable = finite.length >= 10;

  const [y0, y1] = useMemo(() => {
    if (!drawable || summary.low == null || summary.high == null) return [0, 1] as [number, number];
    return padDomain(summary.low, summary.high, { clampMin: 0 });
  }, [drawable, summary.high, summary.low]);
  const [e0, e1] = useMemo(() => {
    if (!drawable) return [0, 1] as [number, number];
    return [finite[0].epoch, finite[finite.length - 1].epoch] as [number, number];
  }, [drawable, finite]);

  const plotW = Math.max(10, w - PLOT_PAD.l - PLOT_PAD.r);
  const plotH = H - PLOT_PAD.t - PLOT_PAD.b;
  const xOf = (epoch: number) => PLOT_PAD.l + ((epoch - e0) / Math.max(1, e1 - e0)) * plotW;
  const yOf = (ratio: number) => PLOT_PAD.t + (1 - (ratio - y0) / Math.max(1e-9, y1 - y0)) * plotH;
  const { values: yTicks, step: yStep } = niceTicks(y0, y1, 4);
  const xLabels = useMemo(() => {
    const kept = thinLabels(finite, (point) => xOf(point.epoch), 62);
    return kept.filter(
      (point, index) => index === 0 || point.date.slice(2, 7) !== kept[index - 1].date.slice(2, 7),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [e0, e1, finite, w]);
  const segments = useMemo(
    () => finiteSegments(points, (point) => point.ratio ?? Number.NaN),
    [points],
  );
  const pathOf = (segment: PutCallOiHistoryPoint[]) => segment.map((point, index) => (
    `${index === 0 ? "M" : "L"}${xOf(point.epoch).toFixed(1)},${yOf(point.ratio!).toFixed(1)}`
  )).join("");
  const equalOiInDomain = drawable && y0 <= 1 && y1 >= 1;
  const latest = summary.latest;

  return (
    <section
      className="fin-card"
      style={{ minWidth: 0 }}
      data-options-pc-oi-history="r5-v1"
      data-options-source-contract={sourceSchema || "options_hub.oi_time/v1"}
      data-options-authority="display_only"
      data-options-oi-timing={oiDate || "t-1"}
      data-options-derivation="put_oi/call_oi"
    >
      <div className="fin-card-h" style={{ flexWrap: "wrap", rowGap: 6 }}>
        <span>{t("pcHistoryTitle")}</span>
        <span style={{ flex: 1 }} />
        <span style={LEGEND_ITEM}>
          <span style={{ ...LEGEND_SWATCH, background: RATIO_COLOR }} />
          {t("pcHistoryLegend")}
        </span>
        <span style={NEUTRAL_CHIP}>{t("pcHistoryFormula")}</span>
      </div>

      {drawable && latest && summary.low != null && summary.high != null && (
        <div style={RECEIPTS} aria-label={t("pcHistoryReceiptsAria")}>
          <Receipt label={t("pcHistoryLatest")} value={fmtRatio(latest.ratio)} marker="latest" />
          <Receipt
            label={t("pcHistoryRange")}
            value={`${fmtRatio(summary.low)}–${fmtRatio(summary.high)}`}
            marker="range"
          />
          <Receipt
            label={t("pcHistorySessions")}
            value={summary.validSessionCount.toLocaleString("en-US")}
            marker="sessions"
          />
        </div>
      )}

      <div ref={boxRef} style={{ width: "100%", minWidth: 0 }}>
        {!drawable ? (
          <PanelEmpty title={t("pcHistoryEmptyTitle")} why={t("pcHistoryEmptyWhy")} minHeight={H} />
        ) : (
          <svg viewBox={`0 0 ${w} ${H}`} width={w} height={H} role="img" aria-label={t("pcHistoryAria")}>
            {yTicks.map((value) => (
              <g key={`y${value}`}>
                <line x1={PLOT_PAD.l} x2={w - PLOT_PAD.r} y1={yOf(value)} y2={yOf(value)} stroke="var(--grid)" />
                <text x={PLOT_PAD.l - 6} y={yOf(value) + 3} textAnchor="end" style={AXIS_TXT}>
                  {fmtTick(value, yStep)}
                </text>
              </g>
            ))}
            {equalOiInDomain && (
              <g>
                <line
                  x1={PLOT_PAD.l}
                  x2={w - PLOT_PAD.r}
                  y1={yOf(1)}
                  y2={yOf(1)}
                  stroke="var(--muted)"
                  strokeDasharray="4 4"
                  opacity={0.72}
                />
                <text x={w - PLOT_PAD.r} y={yOf(1) - 4} textAnchor="end" style={REF_TXT}>
                  {t("pcHistoryEqualOi")}
                </text>
              </g>
            )}
            {segments.map((segment, index) => (
              <path
                key={`ratio-${index}`}
                d={pathOf(segment)}
                fill="none"
                stroke={RATIO_COLOR}
                strokeWidth={1.8}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ))}
            {latest?.ratio != null && (
              <circle cx={xOf(latest.epoch)} cy={yOf(latest.ratio)} r={3.2} fill={RATIO_COLOR} />
            )}
            {xLabels.map((point) => (
              <text key={point.date} x={xOf(point.epoch)} y={H - 8} textAnchor="middle" style={AXIS_TXT}>
                {point.date.slice(2, 7)}
              </text>
            ))}
          </svg>
        )}
      </div>
      <div style={NOTE}>{t("pcHistoryNote")}</div>
      <ProvenanceLine lang={lang} />
    </section>
  );
}

const RECEIPTS: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 7,
  padding: "9px 10px 0",
};

const RECEIPT: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "baseline",
  gap: 7,
  minWidth: 0,
  padding: "5px 8px",
  border: "1px solid var(--line-2)",
  borderRadius: "var(--r-md)",
  background: "var(--panel-2)",
};

const RECEIPT_LABEL: React.CSSProperties = {
  color: "var(--muted)",
  fontSize: 10,
  whiteSpace: "nowrap",
};

const RECEIPT_VALUE: React.CSSProperties = {
  color: "var(--text)",
  fontSize: 11,
  fontVariantNumeric: "tabular-nums",
  whiteSpace: "nowrap",
};

const NOTE: React.CSSProperties = {
  marginTop: 4,
  color: "var(--muted)",
  fontSize: 10,
  lineHeight: 1.45,
};
