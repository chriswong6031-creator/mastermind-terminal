/**
 * InspectorPane — full field breakdown of a selected flow event.
 *
 * Props:
 *   event      — selected FlowEvent | null
 *   tickerCtx  — TickerPayload | null (per-ticker drill: minutes sparkline + top strikes)
 *   lang       — "en" | "zh"
 *
 * Displays:
 *   - All event fields in labelled rows
 *   - Score component bars from computeFlowScore(event).components
 *   - Soft-direction note with tick-rule caveat (honesty doctrine)
 *   - Top contracts from tickerCtx if available
 *   - Empty state: "Select a flow event"
 *
 * Presentational only — no fetching.
 */
"use client";
import { useMemo } from "react";
import { pick, fmtDate } from "../../lib/finFormat";
import type { Lang } from "../../lib/i18n";
import { computeFlowScore } from "../../lib/flowScore";
import { FD } from "../../lib/flowdeskStrings";

// ─── Types ────────────────────────────────────────────────────────────────

type Side = "~buy" | "~sell" | "mixed";

interface FlowEvent {
  id: string; ts: string; root: string; group: string; group_zh: string;
  right: "C" | "P"; exp: string; strike: number; dte: number;
  dte_bucket: string; mny_bucket: string; side: Side;
  n_prints: number; size: number; avg_price: number; premium: number;
  premium_z: number | null; baseline_source: string; vol_gt_oi: boolean | null;
  repeated: boolean; zerodte: boolean; signing_source: string; swept?: boolean;
}

interface TopContract {
  right: "C" | "P"; exp: string; strike: number; premium: number;
  vol: number; vol_gt_oi: boolean | null; close: number;
}

interface TickerPayload {
  root: string; group: string; group_zh: string;
  day: {
    gross: number; net_soft: number; call_share: number; n_events: number;
    prem_z: number | null; baseline_source: string | null;
  };
  minutes: { t: string; ncp: number; npp: number; vol: number }[];
  strikes: { strike: number; call_prem: number; put_prem: number; vol: number }[];
  expiries: { exp: string; call_prem: number; put_prem: number; vol: number }[];
  top_contracts: TopContract[];
}

export interface InspectorPaneProps {
  event: FlowEvent | null;
  tickerCtx: TickerPayload | null;
  lang: Lang;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function fmtPrem(v: number): string {
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

function fmtTs(ts: string): string {
  try {
    return new Date(ts).toLocaleTimeString("en-US", {
      hour: "2-digit", minute: "2-digit", second: "2-digit",
      timeZone: "America/New_York", hour12: false,
    }) + " ET";
  } catch {
    return ts;
  }
}

function fmtExp(exp: string): string {
  // "2026-07-18" → "Jul 18"
  return fmtDate(exp, { short: true });
}

function bool3(v: boolean | null | undefined): string {
  if (v == null) return "—";
  return v ? "Yes" : "No";
}

/** Soft direction label — never asserts NBBO-confirmed direction. */
function sideLean(side: Side, zh: boolean): string {
  if (side === "mixed") return pick(zh, "Mixed", "混合");
  if (side === "~buy")  return pick(zh, "~Buy lean", "~偏多");
  return pick(zh, "~Sell lean", "~偏空");
}

/** Tick-rule caveat — always shown alongside direction */
const TICK_CAVEAT_EN = "Tick-rule derived. No NBBO quote confirmed. Treat as soft heuristic only.";
const TICK_CAVEAT_ZH = "基于逐笔规则推断，未经NBBO报价验证，仅供参考。";

// ─── Component ────────────────────────────────────────────────────────────

export function InspectorPane({ event, tickerCtx, lang }: InspectorPaneProps) {
  const zh = lang === "zh";

  if (!event) {
    return (
      <div style={styles.pane}>
        <div style={styles.empty}>
          {pick(zh, FD.inspectorEmpty.en, FD.inspectorEmpty.zh)}
        </div>
      </div>
    );
  }

  return (
    <div style={styles.pane}>
      <EventDetail event={event} zh={zh} tickerCtx={tickerCtx} />
    </div>
  );
}

// ─── EventDetail ──────────────────────────────────────────────────────────

function EventDetail({ event, zh, tickerCtx }: { event: FlowEvent; zh: boolean; tickerCtx: TickerPayload | null }) {
  const { score, tier, components } = useMemo(
    // Cast dte_bucket to the scorer's union type — InspectorPane uses `string`
    // from its own FlowEvent definition; the scorer requires the narrower union.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    () => computeFlowScore(event as any),
    [event],
  );

  const contractLabel = `${event.root} ${event.strike}${event.right} ${fmtExp(event.exp)}`;

  return (
    <>
      {/* ── Contract header ── */}
      <div style={styles.contractHeader}>
        <span style={styles.contractLabel}>{contractLabel}</span>
        <span style={{ ...styles.tierBadge, background: tierBg(tier) }}>{tier}</span>
      </div>

      {/* ── Score bar ── */}
      <div style={styles.scoreBlock}>
        <div style={styles.scoreRow}>
          <span style={styles.scoreLabel}>{pick(zh, "Flow Score", "流量评分")}</span>
          <span style={{ ...styles.scoreVal, color: scoreColor(score) }}>{score}</span>
        </div>
        <div style={styles.scoreTrack}>
          <div style={{ ...styles.scoreFill, width: `${score}%`, background: scoreColor(score) }} />
        </div>

        {/* Score components */}
        <div style={styles.componentsBlock}>
          {components.map((c) => (
            <ComponentBar key={c.key} component={c} zh={zh} />
          ))}
        </div>
      </div>

      {/* ── Soft direction note ── */}
      <div style={styles.dirBlock}>
        <div style={styles.dirRow}>
          <span style={styles.fieldKey}>{pick(zh, "Direction lean", "方向倾向")}</span>
          <span style={styles.dirChip}>{sideLean(event.side, zh)}</span>
        </div>
        <div style={styles.dirCaveat}>
          {pick(zh, TICK_CAVEAT_EN, TICK_CAVEAT_ZH)}
        </div>
      </div>

      {/* ── Field breakdown ── */}
      <div style={styles.section}>
        <div style={styles.sectionLabel}>{pick(zh, "Event Fields", "事件字段")}</div>

        <FieldRow k={pick(zh, "Time (ET)", "时间(ET)")} v={fmtTs(event.ts)} />
        <FieldRow k={pick(zh, "Ticker", "标的")} v={event.root} />
        <FieldRow k={pick(zh, "Group", "板块")} v={pick(zh, event.group, event.group_zh)} />
        <FieldRow k={pick(zh, "Type", "期权类型")} v={event.right === "C" ? pick(zh, "Call", "认购") : pick(zh, "Put", "认沽")} />
        <FieldRow k={pick(zh, "Strike", "行权价")} v={`$${event.strike}`} />
        <FieldRow k={pick(zh, "Expiry", "到期日")} v={fmtExp(event.exp)} />
        <FieldRow k={pick(zh, "DTE", "剩余天数")} v={String(event.dte)} />
        <FieldRow k={pick(zh, "DTE Bucket", "到期分组")} v={event.dte_bucket} />
        <FieldRow k={pick(zh, "Moneyness", "价值类型")} v={event.mny_bucket} />
        <FieldRow k={pick(zh, "Size (contracts)", "合约数量")} v={event.size.toLocaleString()} />
        <FieldRow k={pick(zh, "Avg Price", "均价")} v={`$${event.avg_price.toFixed(2)}`} />
        <FieldRow k={pick(zh, "Premium", "权利金")} v={fmtPrem(event.premium)} />
        <FieldRow
          k={pick(zh, "Premium Z", "权利金Z值")}
          v={event.premium_z != null ? event.premium_z.toFixed(2) : "—"}
          note={event.baseline_source}
        />
        <FieldRow k={pick(zh, "Vol > OI", "成交量>持仓")} v={bool3(event.vol_gt_oi)} />
        <FieldRow k={pick(zh, "Repeated", "重复")} v={bool3(event.repeated)} />
        <FieldRow k={pick(zh, "Zero DTE", "零日到期")} v={bool3(event.zerodte)} />
        {event.swept != null && (
          <FieldRow k={pick(zh, "Swept", "扫货")} v={bool3(event.swept)} />
        )}
        <FieldRow k={pick(zh, "N Prints", "打印次数")} v={String(event.n_prints)} />
        <FieldRow k={pick(zh, "Signing", "签名来源")} v={event.signing_source} />
      </div>

      {/* ── Ticker context ── */}
      {tickerCtx && (
        <TickerContext ctx={tickerCtx} zh={zh} />
      )}
    </>
  );
}

// ─── ComponentBar ─────────────────────────────────────────────────────────

interface ScoreComponent {
  // flowScore exports `.key` (not `.name`); accept both for compat
  key?: string;
  name?: string;
  label?: string;
  label_zh?: string;
  value: number;   // 0-100 contribution
  weight: number;  // fraction of total score
}

function ComponentBar({ component, zh }: { component: ScoreComponent; zh: boolean }) {
  const id = component.key ?? component.name ?? "";
  const label = zh
    ? (component.label_zh || id)
    : (component.label || id);

  return (
    <div style={styles.compRow}>
      <span style={styles.compLabel}>{label}</span>
      <div style={styles.compTrack}>
        <div style={{
          ...styles.compFill,
          width: `${Math.min(100, component.value)}%`,
          opacity: 0.8,
        }} />
      </div>
      <span style={styles.compVal}>{component.value.toFixed(0)}</span>
    </div>
  );
}

// ─── TickerContext ─────────────────────────────────────────────────────────

function TickerContext({ ctx, zh }: { ctx: TickerPayload; zh: boolean }) {
  return (
    <div style={styles.section}>
      <div style={styles.sectionLabel}>
        {pick(zh, `${ctx.root} — Today`, `${ctx.root} — 今日`)}
      </div>
      <FieldRow k={pick(zh, "Gross Premium", "总权利金")} v={fmtPrem(ctx.day.gross)} />
      <FieldRow k={pick(zh, "Call Share", "认购占比")} v={`${Math.round(ctx.day.call_share * 100)}%`} />
      <FieldRow k={pick(zh, "Events", "事件数")} v={String(ctx.day.n_events)} />
      {ctx.day.prem_z != null && (
        <FieldRow k={pick(zh, "Day Prem Z", "日权利金Z")} v={ctx.day.prem_z.toFixed(2)} />
      )}

      {ctx.top_contracts.length > 0 && (
        <>
          <div style={{ ...styles.sectionLabel, marginTop: 8, marginBottom: 4 }}>
            {pick(zh, "Top Contracts", "主要合约")}
          </div>
          {ctx.top_contracts.slice(0, 5).map((c, i) => (
            <div key={i} style={styles.contractRow}>
              <span style={styles.contractRowLabel}>
                {`${c.right} ${c.strike} ${fmtExp(c.exp)}`}
              </span>
              <span style={styles.contractRowVal}>{fmtPrem(c.premium)}</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// ─── FieldRow ─────────────────────────────────────────────────────────────

function FieldRow({ k, v, note }: { k: string; v: string; note?: string }) {
  return (
    <div style={styles.fieldRow}>
      <span style={styles.fieldKey}>{k}</span>
      <span style={styles.fieldVal}>
        {v}
        {note && <span style={styles.fieldNote}> ({note})</span>}
      </span>
    </div>
  );
}

// ─── Score color helpers ───────────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 75) return "var(--signal)";
  if (score >= 50) return "var(--brand-2)";
  return "var(--text-2)";
}

function tierBg(tier: string): string {
  if (tier === "A" || tier === "S") return "rgba(232,179,57,0.18)";
  if (tier === "B") return "rgba(77,130,255,0.18)";
  return "rgba(90,97,111,0.15)";
}

// ─── Styles ───────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  pane: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    overflowY: "auto",
    background: "var(--panel)",
    borderLeft: "1px solid var(--line)",
    minWidth: 240,
    maxWidth: 320,
    flexShrink: 0,
  },
  empty: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    fontSize: 12,
    color: "var(--muted)",
    padding: 16,
    textAlign: "center",
  },
  contractHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 12px 6px",
    borderBottom: "1px solid var(--line-2)",
    gap: 8,
  },
  contractLabel: {
    fontSize: 13,
    fontWeight: 700,
    color: "var(--text)",
    fontVariantNumeric: "tabular-nums",
  },
  tierBadge: {
    fontSize: 10,
    fontWeight: 700,
    color: "var(--text)",
    borderRadius: "var(--r-pill)",
    padding: "2px 8px",
    letterSpacing: "0.05em",
  },
  scoreBlock: {
    padding: "8px 12px",
    borderBottom: "1px solid var(--line-2)",
  },
  scoreRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: 4,
  },
  scoreLabel: {
    fontSize: 10,
    fontWeight: 600,
    color: "var(--text-2)",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
  },
  scoreVal: {
    fontSize: 18,
    fontWeight: 700,
    fontVariantNumeric: "tabular-nums",
  },
  scoreTrack: {
    height: 4,
    background: "var(--panel-3)",
    borderRadius: 2,
    overflow: "hidden",
    marginBottom: 8,
  },
  scoreFill: {
    height: "100%",
    borderRadius: 2,
    transition: "width 0.3s ease",
  },
  componentsBlock: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  compRow: {
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  compLabel: {
    fontSize: 10,
    color: "var(--text-2)",
    flex: "0 0 90px",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  compTrack: {
    flex: 1,
    height: 3,
    background: "var(--panel-3)",
    borderRadius: 2,
    overflow: "hidden",
  },
  compFill: {
    height: "100%",
    background: "var(--brand-2)",
    borderRadius: 2,
    transition: "width 0.3s ease",
  },
  compVal: {
    fontSize: 10,
    color: "var(--text-2)",
    fontVariantNumeric: "tabular-nums",
    flex: "0 0 24px",
    textAlign: "right",
  },
  dirBlock: {
    padding: "8px 12px",
    borderBottom: "1px solid var(--line-2)",
  },
  dirRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  dirChip: {
    fontSize: 11,
    fontWeight: 650,
    color: "var(--text-2)",
    background: "var(--panel-3)",
    borderRadius: "var(--r-pill)",
    padding: "2px 8px",
  },
  dirCaveat: {
    fontSize: 10,
    color: "var(--muted)",
    fontStyle: "italic",
    lineHeight: 1.4,
  },
  section: {
    padding: "8px 12px",
    borderBottom: "1px solid var(--line-2)",
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: 600,
    color: "var(--muted)",
    letterSpacing: "0.07em",
    textTransform: "uppercase",
    marginBottom: 6,
  },
  fieldRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: 3,
    gap: 6,
  },
  fieldKey: {
    fontSize: 11,
    color: "var(--text-2)",
    flexShrink: 0,
  },
  fieldVal: {
    fontSize: 11,
    fontWeight: 600,
    color: "var(--text)",
    fontVariantNumeric: "tabular-nums",
    textAlign: "right",
    wordBreak: "break-all",
  },
  fieldNote: {
    fontWeight: 400,
    color: "var(--muted)",
    fontSize: 10,
  },
  contractRow: {
    display: "flex",
    justifyContent: "space-between",
    marginBottom: 3,
  },
  contractRowLabel: {
    fontSize: 11,
    color: "var(--text-2)",
    fontVariantNumeric: "tabular-nums",
  },
  contractRowVal: {
    fontSize: 11,
    fontWeight: 600,
    color: "var(--text)",
    fontVariantNumeric: "tabular-nums",
  },
};
