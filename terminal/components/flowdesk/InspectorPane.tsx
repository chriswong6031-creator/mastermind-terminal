/**
 * InspectorPane — full field breakdown of a selected flow event.
 * Observatory restyle: obs-card glass shell, lg RingGauge hero, kv-grid,
 * amber obs-note for direction caveat.
 *
 * HONESTY DOCTRINE (unchanged):
 *  - Direction shown as soft "lean" chip only
 *  - Tick-rule caveat in amber obs-note
 *  - No "validated" claims
 */
"use client";
import { useMemo } from "react";
import { pick, fmtDate } from "../../lib/finFormat";
import type { Lang } from "../../lib/i18n";
import { computeFlowScore } from "../../lib/flowScore";
import { FD, getFlowStr } from "../../lib/flowdeskStrings";
import { RingGauge } from "../ui/RingGauge";
import type { EnrichEvent } from "./FeedPane";

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
  enrichEv: EnrichEvent | null;
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
  return fmtDate(exp, { short: true });
}

function bool3(v: boolean | null | undefined, zh: boolean): string {
  if (v == null) return "—";
  return v ? pick(zh, "Yes", "是") : pick(zh, "No", "否");
}

function sideLean(side: Side, zh: boolean): string {
  if (side === "mixed") return pick(zh, "Mixed", "混合");
  if (side === "~buy")  return pick(zh, "~Buy lean", "~偏多");
  return pick(zh, "~Sell lean", "~偏空");
}

const TICK_CAVEAT_EN = "Lean is tick-rule derived — magnitude is the reliable read. Display-only; forward ledger accruing.";
const TICK_CAVEAT_ZH = "方向倾向基于逐笔规则推断——大小才是可靠的读取。仅供参考；前瞻账本累积中。";

// ─── Component ────────────────────────────────────────────────────────────

export function InspectorPane({ event, tickerCtx, enrichEv, lang }: InspectorPaneProps) {
  const zh = lang === "zh";

  if (!event) {
    return (
      <div className="obs-card obs-fd-inspector" data-tut="flow-inspector">
        <div className="obs-insp-empty">
          {pick(zh, FD.inspectorEmpty.en, FD.inspectorEmpty.zh)}
        </div>
      </div>
    );
  }

  return (
    <div className="obs-card obs-fd-inspector" data-tut="flow-inspector">
      {/* obs-insp-body is a capped internal scroller so the inspector never
          starves Chain Heat above it in the right rail */}
      <div className="obs-insp-body obs-scroll">
        <EventDetail event={event} zh={zh} tickerCtx={tickerCtx} enrichEv={enrichEv} />
      </div>
    </div>
  );
}

// ─── EventDetail ──────────────────────────────────────────────────────────

function EventDetail({ event, zh, tickerCtx, enrichEv }: { event: FlowEvent; zh: boolean; tickerCtx: TickerPayload | null; enrichEv: EnrichEvent | null }) {
  const rawScore = useMemo(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    () => computeFlowScore(event as any),
    [event],
  );
  const score = isNaN(rawScore.score) ? 0 : rawScore.score;
  const { tier, components } = rawScore;

  const contractLabel = `${event.root} ${event.strike}${event.right} ${fmtExp(event.exp)}`;
  const premStr = fmtPrem(event.premium);

  return (
    <>
      {/* ── Header ── */}
      <div className="obs-insp-head">
        <span className="obs-insp-head-ticker">{event.root}</span>
        <span className="obs-insp-head-ct">{event.strike}{event.right} · {fmtExp(event.exp)} · {premStr}</span>
        <span
          className="obs-insp-tier"
          style={{ background: tierBg(tier), color: "var(--text)" }}
        >
          {tier}
        </span>
      </div>
      <div className="obs-card-hr" />

      {/* ── Big ring + component bars ── */}
      <div className="obs-insp-bigring-row">
        <RingGauge value={score} size="lg" tone="auto" />
        <div className="obs-insp-comp-bars">
          {components.map((c) => (
            <ComponentBar key={c.key} component={c} zh={zh} />
          ))}
        </div>
      </div>
      <div className="obs-card-hr" />

      {/* ── KV grid (spot / IV / OI / etc) — shown when tickerCtx available ── */}
      {tickerCtx && (
        <>
          <div className="obs-insp-kvgrid">
            <div>
              <span className="obs-lbl">{pick(zh, "Gross", "总权利金")}</span>
              <span className="obs-insp-kv-val num">{fmtPrem(tickerCtx.day.gross)}</span>
            </div>
            <div>
              <span className="obs-lbl">{pick(zh, "Call%", "认购%")}</span>
              <span className="obs-insp-kv-val num">{Math.round(tickerCtx.day.call_share * 100)}%</span>
            </div>
            <div>
              <span className="obs-lbl">{pick(zh, "Events", "事件数")}</span>
              <span className="obs-insp-kv-val num">{tickerCtx.day.n_events}</span>
            </div>
            {tickerCtx.day.prem_z != null && (
              <div>
                <span className="obs-lbl">{pick(zh, "Day Z", "日Z值")}</span>
                <span className="obs-insp-kv-val num">{tickerCtx.day.prem_z.toFixed(2)}</span>
              </div>
            )}
          </div>
          <div className="obs-card-hr" />
        </>
      )}

      {/* ── Direction lean + amber honesty note ── */}
      <div className="obs-insp-dir-block">
        <span className="obs-lbl">{pick(zh, "Direction lean", "方向倾向")}</span>
        <span className="obs-insp-dir-chip">{sideLean(event.side, zh)}</span>
        {enrichEv?.direction_discounted && (
          <span style={{ marginLeft: 8, fontSize: 10, color: "var(--muted)" }}>
            {zh ? "（价差 — 方向不可靠）" : "(spread — direction unreliable)"}
          </span>
        )}
      </div>
      <div className="obs-note">{pick(zh, TICK_CAVEAT_EN, TICK_CAVEAT_ZH)}</div>

      {/* ── Detections section (v2 enrich badges with why strings) ── */}
      {enrichEv && enrichEv.badges.length > 0 && (
        <div className="obs-insp-section">
          <div className="obs-insp-section-label">
            {pick(zh, "Detections", "检测信号")}
          </div>
          {enrichEv.badges.map((badge) => {
            const whyKey = zh ? `${badge}_zh` : badge;
            const whyStr = enrichEv.why?.[whyKey] ?? enrichEv.why?.[badge] ?? "";
            return (
              <div key={badge} style={DETECTION_ROW_STYLE}>
                <span style={DETECTION_BADGE_STYLE}>{badge.replace(/_/g, "-")}</span>
                {whyStr && (
                  <span style={DETECTION_WHY_STYLE}>{whyStr}</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Event field breakdown ── */}
      <div className="obs-insp-section">
        <div className="obs-insp-section-label">{pick(zh, "Event Fields", "事件字段")}</div>

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
        <FieldRow
          k={pick(zh, "Vol > OI", "成交量>持仓")}
          v={event.vol_gt_oi == null
            ? "—"
            : event.vol_gt_oi
              ? getFlowStr(zh ? "zh" : "en", "inspectorVolGtOiYes")
              : getFlowStr(zh ? "zh" : "en", "inspectorVolGtOiNo")}
        />
        <FieldRow k={pick(zh, "Repeated", "重复")} v={bool3(event.repeated, zh)} />
        <FieldRow k={pick(zh, "Zero DTE", "零日到期")} v={bool3(event.zerodte, zh)} />
        {event.swept != null && (
          <FieldRow k={pick(zh, "Swept", "扫货")} v={bool3(event.swept, zh)} />
        )}
        <FieldRow k={pick(zh, "N Prints", "打印次数")} v={String(event.n_prints)} />
        <FieldRow k={pick(zh, "Signing", "签名来源")} v={event.signing_source} />
      </div>

      {/* ── Ticker context (top contracts) ── */}
      {tickerCtx && tickerCtx.top_contracts.length > 0 && (
        <div className="obs-insp-section">
          <div className="obs-insp-section-label">
            {pick(zh, `${tickerCtx.root} — Top Contracts`, `${tickerCtx.root} — 主要合约`)}
          </div>
          {tickerCtx.top_contracts.slice(0, 5).map((c, i) => (
            <div key={i} className="obs-insp-contract-row">
              <span className="obs-insp-field-key">
                {`${c.right} ${c.strike} ${fmtExp(c.exp)}`}
              </span>
              <span className="obs-insp-field-val num">{fmtPrem(c.premium)}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ─── ComponentBar ─────────────────────────────────────────────────────────

interface ScoreComponent {
  key: string;
  label?: string;
  label_zh?: string;
  value: number;
  weight: number;
}

function ComponentBar({ component, zh }: { component: ScoreComponent; zh: boolean }) {
  const id = component.key ?? "";
  const label = zh
    ? (component.label_zh || id)
    : (component.label || id);

  return (
    <div className="obs-insp-crow">
      <span>{label}</span>
      <div className="obs-insp-track">
        <i className="obs-insp-track-fill" style={{ width: `${Math.min(100, component.value)}%` }} />
      </div>
      <span className="obs-insp-crow-val num">{isNaN(component.value) ? "—" : component.value.toFixed(0)}</span>
    </div>
  );
}

// ─── FieldRow ─────────────────────────────────────────────────────────────

function FieldRow({ k, v, note }: { k: string; v: string; note?: string }) {
  return (
    <div className="obs-insp-field-row">
      <span className="obs-insp-field-key">{k}</span>
      <span className="obs-insp-field-val">
        {v}
        {note && <span className="obs-insp-field-note"> ({note})</span>}
      </span>
    </div>
  );
}

// ─── Tier background helpers ───────────────────────────────────────────────

function tierBg(tier: string): string {
  if (tier === "ELITE")  return "rgba(157,134,255,0.15)";
  if (tier === "STRONG") return "rgba(232,163,61,0.13)";
  if (tier === "HIGH")   return "rgba(77,130,255,0.13)";
  if (tier === "MEDIUM") return "rgba(134,141,156,0.1)";
  return "rgba(90,97,111,0.08)";
}

// ─── Detection row styles ──────────────────────────────────────────────────

const DETECTION_ROW_STYLE: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
  padding: "5px 0",
  borderBottom: "1px solid var(--line-2)",
};

const DETECTION_BADGE_STYLE: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 800,
  letterSpacing: "0.06em",
  color: "var(--brand-2)",
  textTransform: "uppercase" as const,
};

const DETECTION_WHY_STYLE: React.CSSProperties = {
  fontSize: 10.5,
  color: "var(--text-2)",
  lineHeight: 1.4,
};
