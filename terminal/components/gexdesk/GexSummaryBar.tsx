"use client";
/**
 * GexSummaryBar — horizontal strip of computed GEX key levels.
 *
 * Displays: Net GEX, Call Wall, Put Support, Magnet/HVL, Max Pain, P/C OI, IV30,
 * Gamma Flip. Fields are omitted gracefully when absent in the payload.
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

function fmtPct(val: number | null | undefined): string {
  if (val == null || !Number.isFinite(val)) return "—";
  return `${(val * 100).toFixed(1)}%`;
}

interface MetricCellProps {
  label: string;
  value: string;
  valueColor?: string;
}

function MetricCell({ label, value, valueColor }: MetricCellProps) {
  return (
    <div style={CELL}>
      <span style={CELL_LABEL}>{label}</span>
      <span style={{ ...CELL_VALUE, color: valueColor ?? "var(--text)" }}>
        {value}
      </span>
    </div>
  );
}

export function GexSummaryBar({ payload, lang }: GexSummaryBarProps) {
  const t = makeGexT(lang);

  if (!payload) {
    return (
      <div style={BAR_OUTER} data-tut="gex-summary">
        {[...Array(6)].map((_, i) => (
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
      ? "var(--brand-2)"   // cyan-ish: positive gamma (dealer-sign convention)
      : "var(--down)";     // red: negative gamma

  const flipStr = fmtLevel(payload.gamma_flip);

  // Put-call OI ratio — payload may not have it; gracefully absent
  const pcOiStr = payload.put_call_oi_ratio != null
    ? fmtRatio(payload.put_call_oi_ratio)
    : "—";

  const iv30Str = payload.iv30 != null ? fmtPct(payload.iv30) : "—";

  return (
    <div style={BAR_OUTER} data-tut="gex-summary">
      <MetricCell
        label={t("sumNetGex")}
        value={netGexStr}
        valueColor={netGexColor}
      />
      <MetricCell
        label={t("sumCallWall")}
        value={fmtLevel(payload.call_wall)}
        valueColor="var(--brand-2)"
      />
      <MetricCell
        label={t("sumPutSupport")}
        value={fmtLevel(payload.put_wall)}
        valueColor="var(--down)"
      />
      <MetricCell
        label={t("sumMagnet")}
        value={fmtLevel(payload.hvl ?? payload.magnet)}
        valueColor="var(--signal)"
      />
      <MetricCell
        label={t("sumFlip")}
        value={flipStr}
        valueColor="var(--cat-2)"   // purple
      />
      {payload.max_pain != null && (
        <MetricCell
          label={t("sumMaxPain")}
          value={fmtLevel(payload.max_pain)}
        />
      )}
      {pcOiStr !== "—" && (
        <MetricCell
          label={t("sumPcOi")}
          value={pcOiStr}
          valueColor={
            payload.put_call_oi_ratio != null && payload.put_call_oi_ratio > 1
              ? "var(--down)"
              : "var(--up)"
          }
        />
      )}
      {iv30Str !== "—" && (
        <MetricCell
          label={t("sumIv30")}
          value={iv30Str}
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
