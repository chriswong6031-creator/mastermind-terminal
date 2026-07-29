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

/**
 * Categorical violet for the put side.
 *
 * `--cat-2` is the house categorical-2 token used across the options suite, but
 * it is NOT defined in globals.css (see report: repo-wide gap), so a bare
 * var(--cat-2) is invalid-at-computed-value-time and the put bar renders
 * invisible. The fallback defers to `--cat-2` the moment it is defined and
 * meanwhile resolves to the same violet the observatory already uses for the
 * ELITE tier / Prophet accent. Non-directional by design — never --up/--down.
 */
const TONE_PUT = "var(--cat-2, var(--code-fn))";

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
  return tone === "CALL_HEAVY" ? "var(--brand-2)" : TONE_PUT;
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
      <div className="num" style={styles.totalPrem}>{fmtPrem(total)}</div>

      {/* ── Split bar ── */}
      <div style={styles.splitRow}>
        <span className="num" style={{ ...styles.splitPct, color: "var(--brand-2)" }}>
          {callPct}% {pick(zh, "C", "认购")}
        </span>
        <div style={styles.barTrack}>
          <div style={{ ...styles.callBar, width: `${callPct}%` }} />
          <div style={{ ...styles.putBar, width: `${putPct}%` }} />
        </div>
        <span className="num" style={{ ...styles.splitPct, color: TONE_PUT, textAlign: "right" }}>
          {putPct}% {pick(zh, "P", "认沽")}
        </span>
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

      {/* Dead zone caption intentionally omitted — tone word "MIXED" is self-describing */}
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  gauge: {
    padding: "var(--sp-3)",
    borderBottom: "1px solid var(--line)",
    background: "var(--panel)",
    flexShrink: 0,
  },
  header: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: "var(--sp-2)",
    marginBottom: "var(--sp-2)",
  },
  label: {
    fontSize: "var(--fs-micro)",
    fontWeight: 700,
    color: "var(--muted)",
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    lineHeight: 1,
  },
  sessionPct: {
    fontSize: "var(--fs-micro)",
    color: "var(--muted)",
    fontFamily: "var(--font-num)",
    fontVariantNumeric: "tabular-nums",
  },
  // The desk's single largest numeral — hero step of the v6 ramp.
  totalPrem: {
    fontSize: "var(--fs-num-lg)",
    fontWeight: 700,
    color: "var(--text)",
    fontFamily: "var(--font-num)",
    fontVariantNumeric: "tabular-nums",
    letterSpacing: "-0.02em",
    lineHeight: 1.1,
    marginBottom: "var(--sp-2)",
  },
  splitRow: {
    display: "flex",
    alignItems: "center",
    gap: "var(--sp-2)",
    marginBottom: "var(--sp-3)",
  },
  splitPct: {
    fontSize: "var(--fs-micro)",
    fontFamily: "var(--font-num)",
    fontVariantNumeric: "tabular-nums",
    minWidth: 30,
  },
  barTrack: {
    flex: 1,
    height: 6,
    borderRadius: "var(--r-pill)",
    overflow: "hidden",
    display: "flex",
    background: "var(--panel-3)",
  },
  // Call/put bars are NON-directional on purpose (honesty doctrine): the brand
  // accent and the categorical violet, never --up/--down.
  callBar: {
    height: "100%",
    background: "var(--brand-2)",
    transition: "width 0.4s ease",
  },
  putBar: {
    height: "100%",
    background: TONE_PUT,
    transition: "width 0.4s ease",
  },
  statsRow: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: "var(--sp-2)",
  },
  statCell: {
    display: "flex",
    flexDirection: "column",
    gap: "var(--sp-1)",
  },
  statK: {
    fontSize: "var(--fs-micro)",
    color: "var(--text-2)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  statV: {
    fontSize: "var(--fs-ui)",
    fontWeight: 650,
    color: "var(--text)",
    fontFamily: "var(--font-num)",
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap",
  },
};
