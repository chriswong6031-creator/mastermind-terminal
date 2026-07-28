"use client";
/**
 * FiltersPanel — controlled filter bar for the Flow Desk center feed.
 *
 * All state lives in the parent (FeedPane). Props-driven, no internal state.
 * Matches fin.css / globals.css design tokens — no hardcoded colors.
 *
 * HONESTY DOCTRINE: "lean" is a soft tick-rule derivation; we do NOT offer a
 * directional green/red filter gate labeled "buy" / "sell" — the lean filter
 * uses neutral language ("~buy lean", "~sell lean") matching our field values.
 */

import type { DteBucket, MnyBucket, Side } from "./FeedPane";

// ── Filter shape ─────────────────────────────────────────────────────────────

/** v1 legacy badge flags (client-derived) */
export type LegacyBadgeFlag =
  | "whale"
  | "cluster"
  | "sweep"
  | "unusual"
  | "block";

/** v2 detection badge flags (from enrich artifact) */
export type DetectionFlag =
  | "MULTI_LEG"
  | "LADDER"
  | "REPEAT_HITTER"
  | "SIZE_VS_OI"
  | "WHALE"
  | "FRESH"
  | "Z_OUTLIER";

export type BadgeFlag = LegacyBadgeFlag | DetectionFlag;

export interface FlowFilters {
  /** C / P / "all" */
  right: "C" | "P" | "all";
  /** soft lean filter — "all" passes everything */
  lean: Side | "all";
  /** minimum flow score (0 = no filter) */
  minScore: 0 | 50 | 60 | 70 | 80 | 90;
  /** minimum premium in USD (0 = no filter) */
  minPremium: number;
  /** DTE bucket whitelist — empty = all */
  dteBuckets: DteBucket[];
  /** moneyness bucket whitelist — empty = all */
  mnyBuckets: MnyBucket[];
  /** v1 badge presence flags — only show events that have ALL checked badges */
  badges: Set<BadgeFlag>;
  /** v2 detection badge filter — show only events with ANY of these detections */
  detections: Set<DetectionFlag>;
}

export const DEFAULT_FILTERS: FlowFilters = {
  right: "all",
  lean: "all",
  minScore: 0,
  minPremium: 0,
  dteBuckets: [],
  mnyBuckets: [],
  badges: new Set(),
  detections: new Set(),
};

// ── Props ────────────────────────────────────────────────────────────────────

interface FiltersPanelProps {
  filters: FlowFilters;
  onFiltersChange: (next: FlowFilters) => void;
  lang: "en" | "zh";
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const DTE_OPTIONS: { key: DteBucket; label: string }[] = [
  { key: "0d",     label: "0DTE" },
  { key: "1_7d",   label: "1–7d" },
  { key: "8_30d",  label: "8–30d" },
  { key: "31_90d", label: "31–90d" },
  { key: "90p",    label: "90d+" },
];

const MNY_OPTIONS: { key: MnyBucket; label: string; zh: string }[] = [
  { key: "itm",      label: "ITM",      zh: "实值" },
  { key: "atm",      label: "ATM",      zh: "平值" },
  { key: "near_otm", label: "Near OTM", zh: "近虚值" },
  { key: "far_otm",  label: "Far OTM",  zh: "深虚值" },
];

const SCORE_OPTIONS: { v: FlowFilters["minScore"]; label: string }[] = [
  { v: 0,  label: "Any" },
  { v: 50, label: "50+" },
  { v: 60, label: "60+" },
  { v: 70, label: "70+" },
  { v: 80, label: "80+" },
  { v: 90, label: "90+ Elite" },
];

const PREMIUM_OPTIONS: { v: number; label: string; zh: string }[] = [
  { v: 0,       label: "Any",  zh: "不限" },
  { v: 100_000, label: "$100K+", zh: "$10万+" },
  { v: 250_000, label: "$250K+", zh: "$25万+" },
  { v: 500_000, label: "$500K+", zh: "$50万+" },
  { v: 1_000_000, label: "$1M+", zh: "$100万+" },
];

const BADGE_OPTIONS: { key: BadgeFlag; label: string; zh: string; tip: string }[] = [
  {
    key: "whale",
    label: "Whale",
    zh: "巨单",
    tip: "Premium ≥$1M (magnitude gate — reliable)",
  },
  {
    key: "cluster",
    label: "Cluster",
    zh: "集群",
    tip: "Repeat-root: multiple prints on the same underlying this session (repeat/multi-print flag — not a $ threshold)",
  },
  {
    key: "sweep",
    label: "Sweep",
    zh: "扫单",
    tip: "Multi-print heuristic — aggressor direction is unverified (no NBBO)",
  },
  {
    key: "unusual",
    label: "Unusual",
    zh: "异常",
    tip: "Premium activity is much higher than its typical level over the past trading year.",
  },
  {
    key: "block",
    label: "Block",
    zh: "大宗",
    tip: "Single-print size ≥ block threshold (exchange-reported; not direction-signed)",
  },
];

/** v2 detection badge filter options (from enrich artifact) */
const DETECTION_OPTIONS: { key: DetectionFlag; label: string; zh: string; tip: string }[] = [
  {
    key: "WHALE",
    label: "Whale",
    zh: "巨单",
    tip: "Single-event premium ≥$1M. Magnitude gate — reliable.",
  },
  {
    key: "MULTI_LEG",
    label: "Multi-leg",
    zh: "多腿策略",
    tip: "Spread detected: 2+ strikes, same root, ≤60s. Direction is DISCOUNTED — reads as spread, not naked.",
  },
  {
    key: "LADDER",
    label: "Ladder",
    zh: "梯形布局",
    tip: "Same root+right, ≥3 distinct strikes, same lean within 30 min — staged accumulation.",
  },
  {
    key: "REPEAT_HITTER",
    label: "Repeat",
    zh: "反复加仓",
    tip: "Same OCC contract in ≥3 separate events this session — conviction re-load.",
  },
  {
    key: "SIZE_VS_OI",
    label: "Size>OI",
    zh: "量超持仓",
    tip: "Event size ≥ 2× prior-day OI — new positioning that can't hide in existing interest.",
  },
  {
    key: "FRESH",
    label: "Fresh",
    zh: "新建仓",
    tip: "Vol > OI: new positioning, not recycled open interest.",
  },
  {
    key: "Z_OUTLIER",
    label: "Activity spike",
    zh: "活跃度飙升",
    tip: "Ticker-level premium activity is much higher than its typical level over the past trading year.",
  },
];

// ── Component ────────────────────────────────────────────────────────────────

export function FiltersPanel({ filters, onFiltersChange, lang }: FiltersPanelProps) {
  const zh = lang === "zh";

  function patch(partial: Partial<FlowFilters>) {
    onFiltersChange({ ...filters, ...partial });
  }

  function toggleDte(key: DteBucket) {
    const s = new Set(filters.dteBuckets);
    s.has(key) ? s.delete(key) : s.add(key);
    patch({ dteBuckets: [...s] });
  }

  function toggleMny(key: MnyBucket) {
    const s = new Set(filters.mnyBuckets);
    s.has(key) ? s.delete(key) : s.add(key);
    patch({ mnyBuckets: [...s] });
  }

  function toggleBadge(key: BadgeFlag) {
    const s = new Set(filters.badges);
    s.has(key) ? s.delete(key) : s.add(key);
    patch({ badges: s });
  }

  function toggleDetection(key: DetectionFlag) {
    const s = new Set(filters.detections);
    s.has(key) ? s.delete(key) : s.add(key);
    patch({ detections: s });
  }

  const isDirty =
    filters.right !== "all" ||
    filters.lean !== "all" ||
    filters.minScore !== 0 ||
    filters.minPremium !== 0 ||
    filters.dteBuckets.length > 0 ||
    filters.mnyBuckets.length > 0 ||
    filters.badges.size > 0 ||
    filters.detections.size > 0;

  return (
    <div style={PANEL_STYLE} data-tut="flow-filter-panel">
      {/* ── Type ── */}
      <FilterRow label={zh ? "类型" : "Type"}>
        <div className="fin-toggle">
          {(["all", "C", "P"] as const).map((v) => (
            <button
              key={v}
              className={filters.right === v ? "on" : ""}
              onClick={() => patch({ right: v })}
            >
              {v === "all" ? (zh ? "全部" : "All") : v === "C" ? (zh ? "认购" : "Call") : (zh ? "认沽" : "Put")}
            </button>
          ))}
        </div>
      </FilterRow>

      {/* ── Lean (soft direction) ── */}
      <FilterRow label={zh ? "倾向" : "Lean"}>
        <div className="fin-toggle">
          {([
            { v: "all",    en: "All",       zh: "全部" },
            { v: "~buy",   en: "~Buy lean", zh: "~买方" },
            { v: "~sell",  en: "~Sell lean", zh: "~卖方" },
            { v: "mixed",  en: "Mixed",      zh: "混合" },
          ] as const).map(({ v, en, zh: zl }) => (
            <button
              key={v}
              className={filters.lean === v ? "on" : ""}
              onClick={() => patch({ lean: v as Side | "all" })}
            >
              {zh ? zl : en}
            </button>
          ))}
        </div>
        {/* Honesty note: lean is tick-rule derived, not NBBO-verified */}
        <div style={CAVEAT_STYLE}>
          {zh
            ? "方向为tick规则推断，非NBBO确认"
            : "Direction is tick-rule heuristic — not NBBO-verified"}
        </div>
      </FilterRow>

      {/* ── Min Score ── */}
      <FilterRow label={zh ? "最低评分" : "Min score"}>
        <div className="fin-toggle">
          {SCORE_OPTIONS.map(({ v, label }) => (
            <button
              key={v}
              className={filters.minScore === v ? "on" : ""}
              onClick={() => patch({ minScore: v })}
            >
              {label}
            </button>
          ))}
        </div>
      </FilterRow>

      {/* ── Min Premium ── */}
      <FilterRow label={zh ? "最低权利金" : "Min premium"}>
        <div className="fin-toggle">
          {PREMIUM_OPTIONS.map(({ v, label, zh: zl }) => (
            <button
              key={v}
              className={filters.minPremium === v ? "on" : ""}
              onClick={() => patch({ minPremium: v })}
            >
              {zh ? zl : label}
            </button>
          ))}
        </div>
      </FilterRow>

      {/* ── DTE Buckets ── */}
      <FilterRow label={zh ? "到期天数" : "DTE"}>
        <div style={CHIP_ROW_STYLE}>
          {DTE_OPTIONS.map(({ key, label }) => {
            const on = filters.dteBuckets.includes(key);
            return (
              <button
                key={key}
                onClick={() => toggleDte(key)}
                style={chipStyle(on)}
              >
                {label}
              </button>
            );
          })}
        </div>
        {filters.dteBuckets.length === 0 && (
          <div style={CAVEAT_STYLE}>{zh ? "全部到期" : "All expirations"}</div>
        )}
      </FilterRow>

      {/* ── Moneyness ── */}
      <FilterRow label={zh ? "价性" : "Moneyness"}>
        <div style={CHIP_ROW_STYLE}>
          {MNY_OPTIONS.map(({ key, label, zh: zl }) => {
            const on = filters.mnyBuckets.includes(key);
            return (
              <button
                key={key}
                onClick={() => toggleMny(key)}
                style={chipStyle(on)}
              >
                {zh ? zl : label}
              </button>
            );
          })}
        </div>
      </FilterRow>

      {/* ── Badge Flags ── */}
      <FilterRow label={zh ? "标记" : "Badges"}>
        <div style={CHIP_ROW_STYLE}>
          {BADGE_OPTIONS.map(({ key, label, zh: zl, tip }) => {
            const on = filters.badges.has(key);
            return (
              <button
                key={key}
                onClick={() => toggleBadge(key)}
                style={chipStyle(on)}
                aria-label={tip}
                data-tip={tip}
              >
                {zh ? zl : label}
              </button>
            );
          })}
        </div>
        <div style={CAVEAT_STYLE}>
          {zh
            ? "Sweep为启发式，非经NBBO确认的买方/卖方"
            : "Sweep is heuristic — aggressor not NBBO-confirmed"}
        </div>
      </FilterRow>

      {/* ── Detections filter lens (v2 enrich badges) ── */}
      <FilterRow label={zh ? "检测信号" : "Detections"}>
        <div style={CHIP_ROW_STYLE}>
          {DETECTION_OPTIONS.map(({ key, label, zh: zl, tip }) => {
            const on = filters.detections.has(key);
            return (
              <button
                key={key}
                onClick={() => toggleDetection(key)}
                style={chipStyle(on)}
                aria-label={tip}
                data-tip={tip}
              >
                {zh ? zl : label}
              </button>
            );
          })}
        </div>
        <div style={CAVEAT_STYLE}>
          {zh
            ? "检测信号来自富集数据层；缺失文件时退化为v1行为，徽章隐藏。"
            : "Detections from enrich artifact; absent/stale → v1 behavior, badges hidden."}
        </div>
      </FilterRow>

      {/* ── Reset ── */}
      {isDirty && (
        <div style={{ marginTop: 6 }}>
          <button
            className="fin-pill"
            onClick={() => onFiltersChange({ ...DEFAULT_FILTERS, badges: new Set(), detections: new Set() })}
            style={{ fontSize: 11 }}
          >
            {zh ? "重置筛选" : "Reset filters"}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Sub-layout ────────────────────────────────────────────────────────────────

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={ROW_STYLE}>
      <div style={LABEL_STYLE}>{label}</div>
      <div style={{ minWidth: 0 }}>{children}</div>
    </div>
  );
}

// ── Styles (inline — no new CSS classes required) ────────────────────────────

const PANEL_STYLE: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
  padding: "10px 12px",
  background: "var(--panel)",
  borderBottom: "1px solid var(--line)",
};

const ROW_STYLE: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 5,
};

const LABEL_STYLE: React.CSSProperties = {
  font: "600 10.5px/1 var(--font-ui)",
  color: "var(--muted)",
  textTransform: "uppercase",
  letterSpacing: ".04em",
};

const CAVEAT_STYLE: React.CSSProperties = {
  font: "500 10px/1.35 var(--font-ui)",
  color: "var(--text-dim)",
  marginTop: 3,
};

const CHIP_ROW_STYLE: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 4,
};

function chipStyle(on: boolean): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    font: "600 10.5px/1 var(--font-ui)",
    color: on ? "var(--bg)" : "var(--text-2)",
    background: on ? "var(--text)" : "var(--panel-2)",
    border: `1px solid ${on ? "transparent" : "var(--line)"}`,
    borderRadius: "var(--r-pill)",
    padding: "5px 9px",
    cursor: "pointer",
    whiteSpace: "nowrap" as const,
    transition: "color var(--t), background var(--t), border-color var(--t)",
  };
}
