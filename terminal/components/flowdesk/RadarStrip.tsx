/**
 * RadarStrip — Smart Money Radar.
 * Observatory restyle: obs-card glass panel, obs-lbl micro-labels.
 */
"use client";
import { useMemo } from "react";
import { pick } from "../../lib/finFormat";
import type { Lang } from "../../lib/i18n";
import { FD } from "../../lib/flowdeskStrings";
import { Tip } from "../ui/Tip";

// ─── Types ────────────────────────────────────────────────────────────────

interface UnusualName {
  root: string;
  group: string;
  group_zh: string;
  gross_premium_today: number;
  prem_z: number | null;
  baseline_source: string;
  n_obs: number;
  call_prem_share: number;
  top_contracts: { right: "C" | "P"; exp: string; strike: number; premium: number }[];
}

interface FeedPayload {
  unusual_names: UnusualName[];
  baseline_note?: { en: string; zh: string };
}

export interface RadarStripProps {
  feed: FeedPayload;
  lang: Lang;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function fmtPrem(v: number): string {
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

/** z-score → magnitude accent color (no buy/sell). */
function zAccent(z: number | null): string {
  if (z == null) return "var(--text-2)";
  if (z >= 3.5) return "var(--signal)";
  if (z >= 2.5) return "var(--text)";
  return "var(--text-2)";
}

/** Bar width capped at z=5 for visual scale. */
function zBarWidth(z: number | null): number {
  if (z == null) return 0;
  return Math.min(100, Math.round((z / 5) * 100));
}

const MAX_ROWS = 8;

// ─── Component ────────────────────────────────────────────────────────────

export function RadarStrip({ feed, lang }: RadarStripProps) {
  const zh = lang === "zh";

  const rows = useMemo(() => {
    return [...feed.unusual_names]
      .sort((a, b) => {
        const az = a.prem_z ?? -Infinity;
        const bz = b.prem_z ?? -Infinity;
        return bz - az;
      })
      .slice(0, MAX_ROWS);
  }, [feed.unusual_names]);

  const note = feed.baseline_note
    ? pick(zh, feed.baseline_note.en, feed.baseline_note.zh)
    : pick(zh, FD.radarBaseline.en, FD.radarBaseline.zh);

  return (
    <section className="obs-card obs-fd-radar obs-scroll" data-tut="flow-radar" style={{ borderRadius: 0, border: "none", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
      {/* Header */}
      <div className="obs-card-hd">
        <span className="obs-lbl">{pick(zh, FD.smartMoneyRadar.en, FD.smartMoneyRadar.zh)}</span>
        <span style={{ fontSize: 10, color: "var(--muted)", fontStyle: "italic" }}>{note}</span>
      </div>

      {/* Column headers */}
      <div className="obs-fd-radar-col-head">
        <span style={{ flex: "0 0 44px" }}>{pick(zh, "Ticker", "标的")}</span>
        <Tip label={pick(zh, "Premium z-score vs the 252-session baseline — higher = more unusual", "相对252个交易日基线的权利金 z 值 — 越高越异常")} side="top" size="card">
          <span style={{ flex: "0 0 38px", textAlign: "right", cursor: "help" }}>z</span>
        </Tip>
        <Tip label={pick(zh, "Gross options premium traded today (calls + puts)", "今日期权总权利金（认购+认沽）")} side="top" size="card">
          <span style={{ flex: 1, textAlign: "right", cursor: "help" }}>{pick(zh, "Gross Prem", "总权利金")}</span>
        </Tip>
        <Tip label={pick(zh, "Call premium as a share of total (call + put) premium", "认购权利金占总权利金（认购+认沽）的比例")} side="top" size="card">
          <span style={{ flex: "0 0 36px", textAlign: "right", cursor: "help" }}>{pick(zh, "C%", "认购%")}</span>
        </Tip>
      </div>

      {/* Rows */}
      {rows.length === 0 && (
        <div style={{ padding: "12px", fontSize: 11, color: "var(--muted)", textAlign: "center" }}>
          {pick(zh, "No unusual activity", "暂无异常活动")}
        </div>
      )}

      <div className="obs-fd-radar-rows obs-scroll">
        {rows.map((row) => <RadarRow key={row.root} row={row} zh={zh} />)}
      </div>
    </section>
  );
}

// ─── RadarRow ─────────────────────────────────────────────────────────────

function RadarRow({ row, zh }: { row: UnusualName; zh: boolean }) {
  const accent = zAccent(row.prem_z);
  const barW = zBarWidth(row.prem_z);
  const callPct = Math.round(row.call_prem_share * 100);
  const group = pick(zh, row.group, row.group_zh);

  return (
    <div className="obs-fd-radar-row">
      {/* Ticker + group */}
      <div style={{ flex: "0 0 44px", minWidth: 0 }}>
        <div className="obs-fd-radar-ticker">{row.root}</div>
        <div style={{ fontSize: 10, color: "var(--muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {group}
        </div>
        {/* Magnitude bar */}
        <div style={{ height: 2, background: "rgba(255,255,255,0.07)", borderRadius: 1, marginTop: 3, overflow: "hidden", width: "100%" }}>
          <div style={{ height: "100%", borderRadius: 1, background: accent, width: `${barW}%` }} />
        </div>
      </div>

      {/* z-score */}
      <div className="obs-fd-radar-z" style={{ color: accent }}>
        {row.prem_z != null ? row.prem_z.toFixed(1) : "—"}
      </div>

      {/* Gross premium */}
      <div className="obs-fd-radar-prem">{fmtPrem(row.gross_premium_today)}</div>

      {/* Call share */}
      <div style={{ flex: "0 0 36px", textAlign: "right", fontSize: 11, color: "var(--text-2)", fontVariantNumeric: "tabular-nums" }}>
        {callPct}%
      </div>
    </div>
  );
}
