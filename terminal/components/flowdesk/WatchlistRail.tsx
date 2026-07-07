/**
 * WatchlistRail — market-overview block + per-ticker watchlist chips.
 *
 * Props:
 *   feed        — FeedPayload (events + unusual_names)
 *   tide        — TidePayload (session totals for overview block)
 *   lang        — "en" | "zh"
 *   watchlist   — string[] managed by parent (localStorage key 'flowdesk.watchlist')
 *   onToggleTicker — add/remove a ticker from the watchlist
 *   onPickTicker   — select a ticker to drill into
 *
 * Presentational only — no fetching.
 */
"use client";
import { useMemo } from "react";
import { pick, fmtNum } from "../../lib/finFormat";
import type { Lang } from "../../lib/i18n";
import { computeFlowScore } from "../../lib/flowScore";
import { FD } from "../../lib/flowdeskStrings";

// ─── Shared feed/tide shape (mirrors OptionsHubView type defs) ─────────────

interface FlowEvent {
  id: string; ts: string; root: string; group: string; group_zh: string;
  right: "C" | "P"; exp: string; strike: number; dte: number;
  dte_bucket: string; mny_bucket: string; side: string;
  n_prints: number; size: number; avg_price: number; premium: number;
  premium_z: number | null; baseline_source: string; vol_gt_oi: boolean | null;
  repeated: boolean; zerodte: boolean; signing_source: string; swept?: boolean;
}
interface TideMinute { t: string; ncp: number; npp: number; gross: number; vol: number }
interface TidePayload {
  schema?: string; asof: string; session_date?: string;
  minutes: TideMinute[];
  spy: { t: string; px: number }[];
  sectors: unknown[]; top_net_impact: unknown[];
}
interface FeedPayload {
  schema?: string; asof: string; session_date?: string; session_pct?: number;
  baseline_note?: { en: string; zh: string };
  events: FlowEvent[];
  unusual_names: { root: string; gross_premium_today: number; prem_z: number | null; call_prem_share: number }[];
  stale?: boolean;
}

export interface WatchlistRailProps {
  feed: FeedPayload;
  tide: TidePayload | null;
  lang: Lang;
  watchlist: string[];
  onToggleTicker: (root: string) => void;
  onPickTicker: (root: string) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function fmtPrem(v: number): string {
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

function fmtPct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

// ─── Component ────────────────────────────────────────────────────────────

export function WatchlistRail({ feed, tide, lang, watchlist, onToggleTicker, onPickTicker }: WatchlistRailProps) {
  const zh = lang === "zh";

  // --- Session overview from tide ---
  const overview = useMemo(() => {
    if (!tide || !tide.minutes.length) {
      // Fallback: derive from feed events
      let callPrem = 0; let putPrem = 0;
      for (const ev of feed.events) {
        if (ev.right === "C") callPrem += ev.premium;
        else putPrem += ev.premium;
      }
      const total = callPrem + putPrem;
      return { total, callPrem, putPrem, callShare: total > 0 ? callPrem / total : 0.5 };
    }
    let callPrem = 0; let putPrem = 0;
    for (const m of tide.minutes) { callPrem += m.ncp; putPrem += m.npp; }
    const total = callPrem + putPrem;
    return { total, callPrem, putPrem, callShare: total > 0 ? callPrem / total : 0.5 };
  }, [feed.events, tide]);

  const pc = overview.putPrem > 0
    ? (overview.callPrem / overview.putPrem).toFixed(2)
    : "—";

  // --- Best score per ticker (from today's feed events) ---
  const tickerBestScore = useMemo(() => {
    const map: Record<string, number> = {};
    for (const ev of feed.events) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { score } = computeFlowScore(ev as any);
      if (!(ev.root in map) || score > map[ev.root]) map[ev.root] = score;
    }
    return map;
  }, [feed.events]);

  const watchlistTickers = watchlist.filter((t) => t in tickerBestScore);

  return (
    <aside style={styles.rail}>
      {/* ── Session overview ── */}
      <div style={styles.section}>
        <div style={styles.sectionLabel}>{pick(zh, FD.sessionOverview.en, FD.sessionOverview.zh)}</div>

        <div style={styles.statRow}>
          <span style={styles.statKey}>{pick(zh, "Total Premium", "总权利金")}</span>
          <span style={styles.statVal}>{fmtPrem(overview.total)}</span>
        </div>
        <div style={styles.statRow}>
          <span style={styles.statKey}>{pick(zh, "Call / Put", "认购/认沽")}</span>
          <span style={styles.statVal}>
            {fmtPrem(overview.callPrem)} / {fmtPrem(overview.putPrem)}
          </span>
        </div>
        <div style={styles.statRow}>
          <span style={styles.statKey}>{pick(zh, "Call Share", "认购占比")}</span>
          <span style={styles.statVal}>{fmtPct(overview.callShare)}</span>
        </div>
        <div style={styles.statRow}>
          <span style={styles.statKey}>{pick(zh, "P/C Ratio", "认沽认购比")}</span>
          <span style={styles.statVal}>{pc}</span>
        </div>

        {/* Call share bar */}
        <div style={styles.barTrack}>
          <div
            style={{
              ...styles.barFill,
              width: `${Math.round(overview.callShare * 100)}%`,
              background: "var(--brand-2)",
            }}
          />
        </div>
        <div style={styles.barLabels}>
          <span style={{ color: "var(--brand-2)", fontSize: 10 }}>C</span>
          <span style={{ color: "var(--text-2)", fontSize: 10 }}>P</span>
        </div>
      </div>

      {/* ── Watchlist ── */}
      <div style={styles.section}>
        <div style={styles.sectionLabel}>{pick(zh, FD.watchlist.en, FD.watchlist.zh)}</div>

        {watchlist.length === 0 && (
          <div style={styles.empty}>{pick(zh, "Click a ticker to watch", "点击标的加入观察")}</div>
        )}

        {watchlist.map((root) => {
          const score = tickerBestScore[root] ?? null;
          const inFeed = root in tickerBestScore;
          return (
            <WatchChip
              key={root}
              root={root}
              score={score}
              inFeed={inFeed}
              zh={zh}
              onPick={() => onPickTicker(root)}
              onRemove={() => onToggleTicker(root)}
            />
          );
        })}

        {/* Suggest unwatched tickers that have feed events today (max 5) */}
        {watchlistTickers.length === 0 && (
          <div style={{ marginTop: 8 }}>
            <div style={{ ...styles.sectionLabel, marginBottom: 4 }}>
              {pick(zh, "Active today", "今日活跃")}
            </div>
            {Object.entries(tickerBestScore)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 5)
              .map(([root, score]) => (
                <WatchChip
                  key={root}
                  root={root}
                  score={score}
                  inFeed
                  zh={zh}
                  onPick={() => onPickTicker(root)}
                  onRemove={() => onToggleTicker(root)}
                  isWatch={false}
                />
              ))}
          </div>
        )}
      </div>
    </aside>
  );
}

// ─── WatchChip ────────────────────────────────────────────────────────────

interface WatchChipProps {
  root: string;
  score: number | null;
  inFeed: boolean;
  zh: boolean;
  onPick: () => void;
  onRemove: () => void;
  isWatch?: boolean;
}

function WatchChip({ root, score, inFeed, zh, onPick, onRemove, isWatch = true }: WatchChipProps) {
  const scoreColor = score == null
    ? "var(--text-2)"
    : score >= 75 ? "var(--signal)"
    : score >= 50 ? "var(--text)"
    : "var(--text-2)";

  return (
    <div style={styles.chip}>
      <button style={styles.chipMain} onClick={onPick}>
        <span style={styles.chipTicker}>{root}</span>
        {score != null && (
          <span style={{ ...styles.chipScore, color: scoreColor }}>{score}</span>
        )}
        {!inFeed && (
          <span style={styles.chipInactive}>{pick(zh, "no events", "无事件")}</span>
        )}
      </button>
      {isWatch && (
        <button style={styles.chipRemove} onClick={onRemove} aria-label="Remove">
          ×
        </button>
      )}
      {!isWatch && (
        <button style={styles.chipAdd} onClick={onRemove} aria-label="Watch">
          +
        </button>
      )}
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  rail: {
    width: 180,
    flexShrink: 0,
    background: "var(--panel)",
    borderRight: "1px solid var(--line)",
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: 0,
  },
  section: {
    padding: "10px 10px 8px",
    borderBottom: "1px solid var(--line-2)",
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: 600,
    color: "var(--muted)",
    letterSpacing: "0.07em",
    textTransform: "uppercase",
    marginBottom: 8,
  },
  statRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: 4,
    gap: 4,
  },
  statKey: {
    fontSize: 11,
    color: "var(--text-2)",
    whiteSpace: "nowrap",
  },
  statVal: {
    fontSize: 11,
    fontWeight: 600,
    color: "var(--text)",
    fontVariantNumeric: "tabular-nums",
    textAlign: "right",
  },
  barTrack: {
    height: 4,
    background: "var(--panel-3)",
    borderRadius: 2,
    marginTop: 8,
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    borderRadius: 2,
    transition: "width 0.3s ease",
  },
  barLabels: {
    display: "flex",
    justifyContent: "space-between",
    marginTop: 2,
  },
  chip: {
    display: "flex",
    alignItems: "center",
    marginBottom: 4,
    borderRadius: "var(--r)",
    border: "1px solid var(--line-2)",
    background: "var(--panel-2)",
    overflow: "hidden",
  },
  chipMain: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "5px 7px",
    cursor: "pointer",
    background: "none",
    border: "none",
    minWidth: 0,
  },
  chipTicker: {
    fontSize: 12,
    fontWeight: 650,
    color: "var(--text)",
    flexShrink: 0,
  },
  chipScore: {
    fontSize: 11,
    fontWeight: 600,
    fontVariantNumeric: "tabular-nums",
    marginLeft: "auto",
  },
  chipInactive: {
    fontSize: 10,
    color: "var(--muted)",
    marginLeft: "auto",
  },
  chipRemove: {
    padding: "0 7px",
    fontSize: 14,
    color: "var(--muted)",
    cursor: "pointer",
    background: "none",
    border: "none",
    borderLeft: "1px solid var(--line-2)",
    alignSelf: "stretch",
    display: "flex",
    alignItems: "center",
  },
  chipAdd: {
    padding: "0 7px",
    fontSize: 14,
    color: "var(--brand-2)",
    cursor: "pointer",
    background: "none",
    border: "none",
    borderLeft: "1px solid var(--line-2)",
    alignSelf: "stretch",
    display: "flex",
    alignItems: "center",
  },
  empty: {
    fontSize: 11,
    color: "var(--muted)",
    padding: "4px 0",
  },
};
