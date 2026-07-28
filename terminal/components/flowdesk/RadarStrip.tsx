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

/** Turn the statistical score into a glanceable activity band. */
function activityBand(z: number | null, zh: boolean): string {
  if (z == null) return zh ? "积累中" : "Warming";
  const az = Math.abs(z);
  if (az >= 3) return zh ? "极异常" : "Extreme";
  if (az >= 2) return zh ? "很异常" : "Very high";
  if (az >= 1) return zh ? "偏高" : "Elevated";
  return zh ? "正常" : "Typical";
}

/** Payloads still carry an engine name; the UI explains it as a familiar time span. */
function readableBaseline(note: string): string {
  return note
    .replace(/EOD[-\s]?252/gi, "1-year")
    .replace(/252[-\s]?(session|day|trading day)s?/gi, "1-year")
    .replace(/\beod252\b/gi, "1-year");
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

  const rawNote = feed.baseline_note
    ? pick(zh, feed.baseline_note.en, feed.baseline_note.zh)
    : pick(zh, FD.radarBaseline.en, FD.radarBaseline.zh);
  const note = zh ? rawNote : readableBaseline(rawNote);

  return (
    <section className="obs-card obs-fd-radar obs-scroll" data-tut="flow-radar" style={{ borderRadius: 0, border: "none", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
      {/* Header */}
      <div className="obs-card-hd">
        <span className="obs-lbl">{pick(zh, FD.smartMoneyRadar.en, FD.smartMoneyRadar.zh)}</span>
        <span className="obs-fd-radar-note">{note}</span>
      </div>

      {/* Column headers */}
      <div className="obs-fd-radar-col-head">
        <span>{pick(zh, "Ticker", "标的")}</span>
        <Tip label={pick(zh, "How unusual today's premium is compared with roughly one trading year", "今日权利金相对约一年交易历史的异常程度")} side="top" size="card">
          <span style={{ textAlign: "right", cursor: "help" }}>{pick(zh, "Activity", "活跃度")}</span>
        </Tip>
        <Tip label={pick(zh, "Gross options premium traded today (calls + puts)", "今日期权总权利金（认购+认沽）")} side="top" size="card">
          <span style={{ textAlign: "right", cursor: "help" }}>{pick(zh, "Premium", "权利金")}</span>
        </Tip>
        <Tip label={pick(zh, "Call premium as a share of total (call + put) premium", "认购权利金占总权利金（认购+认沽）的比例")} side="top" size="card">
          <span style={{ textAlign: "right", cursor: "help" }}>{pick(zh, "Calls", "认购")}</span>
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
      <div className="obs-fd-radar-name">
        <div className="obs-fd-radar-ticker">{row.root}</div>
        <div className="obs-fd-radar-group">
          {group}
        </div>
        {/* Magnitude bar */}
        <div style={{ height: 2, background: "rgba(255,255,255,0.07)", borderRadius: 1, marginTop: 3, overflow: "hidden", width: "100%" }}>
          <div style={{ height: "100%", borderRadius: 1, background: accent, width: `${barW}%` }} />
        </div>
      </div>

      {/* Human-readable unusualness band; exact z remains in the accessible label. */}
      <div className="obs-fd-radar-z" style={{ color: accent }}>
        <Tip
          label={row.prem_z != null
            ? pick(zh, `${row.prem_z.toFixed(1)} standard deviations from its one-year norm`, `相对一年常态偏离 ${row.prem_z.toFixed(1)} 个标准差`)
            : pick(zh, "A full baseline is still building", "完整基线仍在积累")}
          side="top"
          size="card"
        >
          <span style={{ cursor: "help" }}>{activityBand(row.prem_z, zh)}</span>
        </Tip>
      </div>

      {/* Gross premium */}
      <div className="obs-fd-radar-prem">{fmtPrem(row.gross_premium_today)}</div>

      {/* Call share */}
      <div className="obs-fd-radar-call">
        {callPct}%
      </div>
    </div>
  );
}
