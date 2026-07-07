/**
 * FlowGauge — session-level flow summary gauge.
 *
 * Shows: total premium, call vs put premium split bar, P/C ratio, one-word tone.
 *
 * DEAD ZONE: |call_share - 0.5| < 0.08 → tone = "MIXED" (/ "混合").
 * No bull/bear assertion styling — colors are magnitude-neutral.
 *
 * Props derived from feed events; no fetching.
 */
"use client";
import { useMemo } from "react";
import { pick } from "../../lib/finFormat";
import type { Lang } from "../../lib/i18n";
import { FD } from "../../lib/flowdeskStrings";

// ─── Types ────────────────────────────────────────────────────────────────

interface FlowEvent {
  right: "C" | "P";
  premium: number;
}

interface FeedPayload {
  events: FlowEvent[];
  session_pct?: number;
}

export interface FlowGaugeProps {
  feed: FeedPayload;
  lang: Lang;
}

// ─── Constants ────────────────────────────────────────────────────────────

/** Dead zone: call share within 8pp of 0.5 → MIXED, no directional label. */
const DEAD_ZONE = 0.08;

// ─── Helpers ──────────────────────────────────────────────────────────────

function fmtPrem(v: number): string {
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

type Tone = "CALL_HEAVY" | "PUT_HEAVY" | "MIXED";

function deriveTone(callShare: number): Tone {
  if (Math.abs(callShare - 0.5) < DEAD_ZONE) return "MIXED";
  return callShare > 0.5 ? "CALL_HEAVY" : "PUT_HEAVY";
}

function toneLabel(tone: Tone, zh: boolean): string {
  if (tone === "MIXED")      return pick(zh, "MIXED",      "混合");
  if (tone === "CALL_HEAVY") return pick(zh, "CALL-HEAVY", "认购偏重");
  return pick(zh, "PUT-HEAVY", "认沽偏重");
}

/** Tone uses the brand accent (not up/down) — magnitude-only signal, no bull/bear assertion. */
function toneColor(tone: Tone): string {
  if (tone === "MIXED") return "var(--text-2)";
  // Both call-heavy and put-heavy are signaled in the same brand-accent spectrum —
  // we deliberately avoid green/red here per honesty doctrine.
  return tone === "CALL_HEAVY" ? "var(--brand-2)" : "var(--cat-2)";
}

// ─── Component ────────────────────────────────────────────────────────────

export function FlowGauge({ feed, lang }: FlowGaugeProps) {
  const zh = lang === "zh";

  const { total, callPrem, putPrem, callShare, pc, tone } = useMemo(() => {
    let callPrem = 0;
    let putPrem = 0;
    for (const ev of feed.events) {
      if (ev.right === "C") callPrem += ev.premium;
      else putPrem += ev.premium;
    }
    const total = callPrem + putPrem;
    const callShare = total > 0 ? callPrem / total : 0.5;
    const pc = callPrem > 0 ? putPrem / callPrem : null;
    const tone = deriveTone(callShare);
    return { total, callPrem, putPrem, callShare, pc, tone };
  }, [feed.events]);

  const callPct = Math.round(callShare * 100);
  const putPct = 100 - callPct;
  const sessionPct = feed.session_pct != null ? Math.round(feed.session_pct * 100) : null;

  return (
    <div style={styles.gauge} data-tut="flow-gauge">
      {/* ── Header ── */}
      <div style={styles.header}>
        <span style={styles.label}>{pick(zh, FD.sessionGauge.en, FD.sessionGauge.zh)}</span>
        {sessionPct != null && (
          <span style={styles.sessionPct}>
            {pick(zh, `Session ${sessionPct}% elapsed`, `交易日已过 ${sessionPct}%`)}
          </span>
        )}
      </div>

      {/* ── Total premium (big number) ── */}
      <div style={styles.totalPrem}>{fmtPrem(total)}</div>

      {/* ── Split bar ── */}
      <div style={styles.splitRow}>
        <span style={{ fontSize: 10, color: "var(--brand-2)", minWidth: 28 }}>{callPct}% C</span>
        <div style={styles.barTrack}>
          <div style={{ ...styles.callBar, width: `${callPct}%` }} />
          <div style={{ ...styles.putBar, width: `${putPct}%` }} />
        </div>
        <span style={{ fontSize: 10, color: "var(--cat-2)", minWidth: 28, textAlign: "right" }}>{putPct}% P</span>
      </div>

      {/* ── Stats row ── */}
      <div style={styles.statsRow}>
        <div style={styles.statCell}>
          <div style={styles.statK}>{pick(zh, "Call Prem", "认购金额")}</div>
          <div style={styles.statV}>{fmtPrem(callPrem)}</div>
        </div>
        <div style={styles.statCell}>
          <div style={styles.statK}>{pick(zh, "Put Prem", "认沽金额")}</div>
          <div style={styles.statV}>{fmtPrem(putPrem)}</div>
        </div>
        <div style={styles.statCell}>
          <div style={styles.statK}>{pick(zh, "P/C Ratio", "认沽认购比")}</div>
          <div style={styles.statV}>{pc != null ? pc.toFixed(2) : "—"}</div>
        </div>
        <div style={styles.statCell}>
          <div style={styles.statK}>{pick(zh, "Tone", "倾向")}</div>
          <div style={{ ...styles.statV, color: toneColor(tone) }}>
            {toneLabel(tone, zh)}
          </div>
        </div>
      </div>

      {/* ── Dead zone disclosure ── */}
      {tone === "MIXED" && (
        <div style={styles.deadNote}>
          {pick(
            zh,
            `Dead zone: |call% − 50%| < ${DEAD_ZONE * 100}pp → MIXED`,
            `无效区: |认购% − 50%| < ${DEAD_ZONE * 100}pp → 混合`
          )}
        </div>
      )}
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  gauge: {
    padding: "10px 12px",
    borderBottom: "1px solid var(--line)",
    background: "var(--panel)",
  },
  header: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  label: {
    fontSize: 10,
    fontWeight: 700,
    color: "var(--muted)",
    letterSpacing: "0.07em",
    textTransform: "uppercase",
  },
  sessionPct: {
    fontSize: 10,
    color: "var(--muted)",
  },
  totalPrem: {
    fontSize: 24,
    fontWeight: 700,
    color: "var(--text)",
    fontVariantNumeric: "tabular-nums",
    lineHeight: 1.1,
    marginBottom: 8,
  },
  splitRow: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    marginBottom: 10,
  },
  barTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
    display: "flex",
    background: "var(--panel-3)",
  },
  callBar: {
    height: "100%",
    background: "var(--brand-2)",
    transition: "width 0.4s ease",
  },
  putBar: {
    height: "100%",
    background: "var(--cat-2)",
    transition: "width 0.4s ease",
  },
  statsRow: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: 8,
  },
  statCell: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },
  statK: {
    fontSize: 10,
    color: "var(--text-2)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  statV: {
    fontSize: 12,
    fontWeight: 650,
    color: "var(--text)",
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap",
  },
  deadNote: {
    marginTop: 6,
    fontSize: 10,
    color: "var(--muted)",
    fontStyle: "italic",
  },
};
