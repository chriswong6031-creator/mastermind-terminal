/**
 * RadarStrip — Smart Money Radar.
 *
 * Surfaces top unusual_names from the feed payload, ranked by prem_z (descending).
 * Honest label: "unusual vs 252d baseline". No buy/sell assertion styling.
 *
 * Props:
 *   feed — FeedPayload (unusual_names array)
 *   lang — "en" | "zh"
 *
 * Presentational only — no fetching.
 */
"use client";
import { useMemo } from "react";
import { pick } from "../../lib/finFormat";
import type { Lang } from "../../lib/i18n";
import { FD } from "../../lib/flowdeskStrings";

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

/** Map a prem_z into a magnitude-based accent — no buy/sell color. */
function zAccent(z: number | null): string {
  if (z == null) return "var(--text-2)";
  if (z >= 3.5) return "var(--signal)";   // amber — notable magnitude
  if (z >= 2.5) return "var(--text)";
  return "var(--text-2)";
}

/** Bar width capped at z=5 for visual scale. */
function zBarWidth(z: number | null): number {
  if (z == null) return 0;
  return Math.min(100, Math.round((z / 5) * 100));
}

// ─── Component ────────────────────────────────────────────────────────────

const MAX_ROWS = 8;

export function RadarStrip({ feed, lang }: RadarStripProps) {
  const zh = lang === "zh";

  const rows = useMemo(() => {
    return [...feed.unusual_names]
      .sort((a, b) => {
        // null z goes last
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
    <section style={styles.strip} data-tut="flow-radar">
      {/* ── Header ── */}
      <div style={styles.header}>
        <span style={styles.title}>{pick(zh, FD.smartMoneyRadar.en, FD.smartMoneyRadar.zh)}</span>
        <span style={styles.note}>{note}</span>
      </div>

      {/* ── Column headers ── */}
      <div style={styles.colHead}>
        <span style={{ flex: "0 0 54px" }}>{pick(zh, "Ticker", "标的")}</span>
        <span style={{ flex: "0 0 40px", textAlign: "right" }}>z</span>
        <span style={{ flex: 1, textAlign: "right" }}>{pick(zh, "Gross Prem", "总权利金")}</span>
        <span style={{ flex: "0 0 38px", textAlign: "right" }}>{pick(zh, "C%", "认购%")}</span>
      </div>

      {/* ── Rows ── */}
      {rows.length === 0 && (
        <div style={styles.empty}>{pick(zh, "No unusual activity", "暂无异常活动")}</div>
      )}

      {rows.map((row) => (
        <RadarRow key={row.root} row={row} zh={zh} />
      ))}
    </section>
  );
}

// ─── RadarRow ─────────────────────────────────────────────────────────────

interface RadarRowProps {
  row: UnusualName;
  zh: boolean;
}

function RadarRow({ row, zh }: RadarRowProps) {
  const accent = zAccent(row.prem_z);
  const barW = zBarWidth(row.prem_z);
  const callPct = Math.round(row.call_prem_share * 100);
  const group = pick(zh, row.group, row.group_zh);

  return (
    <div style={styles.row}>
      {/* Ticker + group + z-bar */}
      <div style={{ flex: "0 0 54px", minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 650, color: "var(--text)" }}>{row.root}</div>
        <div style={{ fontSize: 10, color: "var(--muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {group}
        </div>
        {/* magnitude bar */}
        <div style={styles.barTrack}>
          <div style={{ ...styles.barFill, width: `${barW}%`, background: accent }} />
        </div>
      </div>

      {/* z-score */}
      <div style={{ flex: "0 0 40px", textAlign: "right", fontSize: 12, fontWeight: 600, color: accent, fontVariantNumeric: "tabular-nums" }}>
        {row.prem_z != null ? row.prem_z.toFixed(1) : "—"}
      </div>

      {/* Gross premium */}
      <div style={{ flex: 1, textAlign: "right", fontSize: 12, fontWeight: 600, color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
        {fmtPrem(row.gross_premium_today)}
      </div>

      {/* Call share */}
      <div style={{ flex: "0 0 38px", textAlign: "right", fontSize: 11, color: "var(--text-2)", fontVariantNumeric: "tabular-nums" }}>
        {callPct}%
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  strip: {
    borderBottom: "1px solid var(--line)",
    paddingBottom: 4,
  },
  header: {
    display: "flex",
    alignItems: "baseline",
    gap: 8,
    padding: "8px 12px 4px",
    flexWrap: "wrap",
  },
  title: {
    fontSize: 11,
    fontWeight: 700,
    color: "var(--text)",
    letterSpacing: "0.04em",
    textTransform: "uppercase",
  },
  note: {
    fontSize: 10,
    color: "var(--muted)",
    fontStyle: "italic",
  },
  colHead: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "2px 12px 4px",
    fontSize: 10,
    fontWeight: 600,
    color: "var(--muted)",
    fontVariantNumeric: "tabular-nums",
    borderBottom: "1px solid var(--line-2)",
  },
  row: {
    display: "flex",
    alignItems: "flex-start",
    gap: 6,
    padding: "5px 12px",
    borderBottom: "1px solid var(--line-2)",
    transition: "background var(--t)",
    cursor: "default",
  },
  barTrack: {
    height: 2,
    background: "var(--panel-3)",
    borderRadius: 1,
    marginTop: 4,
    overflow: "hidden",
    width: "100%",
  },
  barFill: {
    height: "100%",
    borderRadius: 1,
  },
  empty: {
    padding: "12px",
    fontSize: 11,
    color: "var(--muted)",
    textAlign: "center",
  },
};
