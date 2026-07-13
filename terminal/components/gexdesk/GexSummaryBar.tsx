"use client";
/**
 * GexSummaryBar — horizontal strip of computed GEX key levels.
 *
 * MomoEdge parity (Pass 3): NET GEX, CALL WALL, PUT SUPPORT, HVL/MAGNET,
 * GAMMA FLIP, P/C RATIO, CALL OI, PUT OI.
 *
 * P/C RATIO and OI fields come from payload when present; omitted gracefully
 * when absent (never faked).
 *
 * HONESTY DOCTRINE: all values are display-only levels-map metrics. No directional
 * claims. Net GEX color (cyan/red) indicates sign only — not a signal.
 */

import React from "react";
import { makeGexT } from "./gexStrings";
import type { Lang } from "@/lib/i18n";
import type { GexPayload } from "./GexDeskView";

interface GexSummaryBarProps {
  payload: GexPayload | null;
  /** Extended statePayload fields available for Call OI / Put OI */
  callOI?: number | null;
  putOI?: number | null;
  lang: Lang;
}

function fmtGex(val: number | null | undefined): string {
  if (val == null || !Number.isFinite(val)) return "—";
  const abs = Math.abs(val);
  const sign = val >= 0 ? "+" : "-";
  if (abs >= 1) return `${sign}${abs.toFixed(2)}B`;
  if (abs >= 0.001) return `${sign}${(abs * 1000).toFixed(1)}M`;
  return `${sign}${(abs * 1e6).toFixed(0)}K`;
}

function fmtLevel(val: number | null | undefined): string {
  if (val == null || !Number.isFinite(val)) return "—";
  return val % 1 === 0 ? String(val) : val.toFixed(1);
}

function fmtRatio(val: number | null | undefined): string {
  if (val == null || !Number.isFinite(val)) return "—";
  return val.toFixed(2);
}

function fmtOI(val: number | null | undefined): string {
  if (val == null || !Number.isFinite(val)) return "—";
  const abs = Math.abs(val);
  if (abs >= 1_000_000) return `${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(abs / 1_000).toFixed(0)}K`;
  return String(Math.round(abs));
}

interface MetricCellProps {
  label: string;
  value: string;
  valueColor?: string;
  /** Subtle text shown after value, e.g. " +" or unit hint */
  suffix?: string;
}

function MetricCell({ label, value, valueColor, suffix }: MetricCellProps) {
  return (
    <div style={CELL}>
      <span style={CELL_LABEL}>{label}</span>
      <span style={{ ...CELL_VALUE, color: valueColor ?? "var(--text)" }}>
        {value}
        {suffix && value !== "—" && (
          <span style={{ fontSize: 10, opacity: 0.6, marginLeft: 2 }}>{suffix}</span>
        )}
      </span>
    </div>
  );
}

export function GexSummaryBar({ payload, callOI, putOI, lang }: GexSummaryBarProps) {
  const t = makeGexT(lang);

  if (!payload) {
    return (
      <div style={BAR_OUTER} data-tut="gex-summary">
        {[...Array(7)].map((_, i) => (
          <div key={i} style={{ ...CELL, opacity: 0.35 }}>
            <span style={CELL_LABEL}>{t("loading")}</span>
            <span style={CELL_VALUE}>—</span>
          </div>
        ))}
      </div>
    );
  }

  const netGexVal = payload.net_gex_bn;
  const netGexStr = fmtGex(netGexVal);
  const netGexColor =
    netGexVal == null
      ? "var(--muted)"
      : netGexVal >= 0
      ? "var(--brand-2)"
      : "var(--down)";

  // P/C OI ratio — from payload when present
  const pcRatioVal = payload.put_call_oi_ratio;
  const pcRatioStr = fmtRatio(pcRatioVal);
  const pcRatioColor =
    pcRatioVal != null
      ? pcRatioVal > 1
        ? "var(--down)"
        : "var(--up)"
      : "var(--text)";

  return (
    <div style={BAR_OUTER} data-tut="gex-summary">
      {/* 1. Net GEX — hero metric */}
      <MetricCell
        label={t("sumNetGex")}
        value={netGexStr}
        valueColor={netGexColor}
      />
      {/* 2. Call Wall */}
      <MetricCell
        label={t("sumCallWall")}
        value={fmtLevel(payload.call_wall)}
        valueColor="var(--brand-2)"
      />
      {/* 3. Put Support */}
      <MetricCell
        label={t("sumPutSupport")}
        value={fmtLevel(payload.put_wall)}
        valueColor="var(--down)"
      />
      {/* 4. HVL / Magnet */}
      <MetricCell
        label={t("sumMagnet")}
        value={fmtLevel(payload.hvl ?? payload.magnet)}
        valueColor="var(--signal)"
      />
      {/* 5. Gamma Flip */}
      <MetricCell
        label={t("sumFlip")}
        value={fmtLevel(payload.gamma_flip)}
        valueColor="var(--cat-2)"
      />
      {/* 6. P/C Ratio — omit gracefully when absent */}
      {pcRatioStr !== "—" && (
        <MetricCell
          label={t("sumPcOi")}
          value={pcRatioStr}
          valueColor={pcRatioColor}
        />
      )}
      {/* 7. Call OI — from caller (gexstate or extended payload) */}
      {callOI != null && (
        <MetricCell
          label={t("sumCallOI")}
          value={fmtOI(callOI)}
          valueColor="var(--brand-2)"
        />
      )}
      {/* 8. Put OI */}
      {putOI != null && (
        <MetricCell
          label={t("sumPutOI")}
          value={fmtOI(putOI)}
          valueColor="var(--down)"
        />
      )}
      {/* Max pain — if present */}
      {payload.max_pain != null && (
        <MetricCell
          label={t("sumMaxPain")}
          value={fmtLevel(payload.max_pain)}
        />
      )}
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const BAR_OUTER: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 0,
  borderBottom: "1px solid var(--line)",
  background: "var(--panel)",
  flexShrink: 0,
};

const CELL: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
  padding: "7px 14px",
  borderRight: "1px solid var(--line-2)",
  minWidth: 90,
};

const CELL_LABEL: React.CSSProperties = {
  fontSize: 10,
  color: "var(--muted)",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  fontWeight: 600,
  whiteSpace: "nowrap",
};

const CELL_VALUE: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  fontVariantNumeric: "tabular-nums",
  letterSpacing: "0.01em",
};
