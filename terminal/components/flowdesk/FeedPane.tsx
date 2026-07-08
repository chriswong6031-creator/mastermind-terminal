"use client";
/**
 * FeedPane — center feed pane for the Flow Desk.
 *
 * Presentational only — no fetching, no global state.
 * All filtering, sorting, and view-preset persistence happens here.
 * LocalStorage key: 'flowdesk.views' (view preset + sort).
 *
 * HONESTY DOCTRINE: rank by MAGNITUDE and score tier; direction is a soft lean
 * chip with tooltip — never green/red assertion. See FlowCard.tsx for badge
 * derivation; see FiltersPanel for lean-filter labeling.
 */

import {
  useCallback, useEffect, useMemo, useState,
} from "react";
import { FlowCard } from "./FlowCard";
import { FiltersPanel, DEFAULT_FILTERS } from "./FiltersPanel";
import type { FlowFilters } from "./FiltersPanel";
import { computeFlowScore } from "@/lib/flowScore";

// ── Re-export shared types so FlowCard / FiltersPanel import from one place ──

export type DteBucket = "0d" | "1_7d" | "8_30d" | "31_90d" | "90p";
export type MnyBucket = "itm" | "atm" | "near_otm" | "far_otm";
export type Side = "~buy" | "~sell" | "mixed";

/** Single flow event from feed_current.json `events[]` */
export interface FlowEvent {
  id: string;
  ts: string;
  root: string;
  group: string;
  group_zh: string;
  right: "C" | "P";
  exp: string;
  strike: number;
  dte: number;
  dte_bucket: DteBucket;
  mny_bucket: MnyBucket;
  side: Side;
  n_prints: number;
  size: number;
  avg_price: number;
  premium: number;
  premium_z: number | null;
  baseline_source: string;
  vol_gt_oi: boolean | null;
  repeated: boolean;
  zerodte: boolean;
  signing_source: string;
  swept?: boolean;
  // Optional enriched fields (may be absent on older feed payloads)
  oi?: number | null;
  iv?: number | null;
  spot?: number | null;
}

/** Top-level feed payload */
export interface FeedPayload {
  schema?: string;
  asof: string;
  session_date?: string;
  session_pct?: number;
  baseline_note?: { en: string; zh: string };
  events: FlowEvent[];
  unusual_names?: unknown[];
  stale?: boolean;
}

// ── View presets ──────────────────────────────────────────────────────────────

type ViewPreset = "ALL" | "ELITE" | "WHALES" | "0DTE" | "SWEEPS";

interface PersistedPrefs {
  preset: ViewPreset;
  sort: SortMode;
}

const STORAGE_KEY = "flowdesk.views";

type SortMode = "NEW" | "SCORE";

function loadPrefs(): PersistedPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as PersistedPrefs;
  } catch {
    // localStorage unavailable (SSR / private mode) — use defaults
  }
  return { preset: "ALL", sort: "NEW" };
}

function savePrefs(p: PersistedPrefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    // ignore
  }
}

// ── Preset → filter overrides ─────────────────────────────────────────────────

function presetFilters(preset: ViewPreset): Partial<FlowFilters> {
  switch (preset) {
    case "ELITE":
      return { minScore: 90 };
    case "WHALES":
      // Whale = premium >= $1M; we use minPremium gate as a proxy
      return { minPremium: 1_000_000 };
    case "0DTE":
      return { dteBuckets: ["0d"] };
    case "SWEEPS":
      return { badges: new Set(["sweep" as const]) };
    default:
      return {};
  }
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface FeedPaneProps {
  feed: FeedPayload | null;
  lang: "en" | "zh";
  selectedId: string | null;
  onSelect: (ev: FlowEvent) => void;
  filters: FlowFilters;
  onFiltersChange: (next: FlowFilters) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function FeedPane({
  feed,
  lang,
  selectedId,
  onSelect,
  filters,
  onFiltersChange,
}: FeedPaneProps) {
  const zh = lang === "zh";

  // Persist preset + sort across page loads
  const [prefs, setPrefs] = useState<PersistedPrefs>(() => loadPrefs());

  const { preset, sort } = prefs;

  function updatePrefs(next: Partial<PersistedPrefs>) {
    const merged = { ...prefs, ...next };
    setPrefs(merged);
    savePrefs(merged);
  }

  // Ticker search
  const [search, setSearch] = useState("");

  // FiltersPanel open/close
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Merge preset overrides into the base filter set
  const effectiveFilters = useMemo<FlowFilters>(() => {
    const over = presetFilters(preset);
    return {
      ...filters,
      ...over,
      // badge merge: union of base + preset
      badges: new Set([
        ...filters.badges,
        ...(over.badges ?? []),
      ]),
    };
  }, [filters, preset]);

  // Filter + sort pipeline (pure derivation from props — no internal state)
  const filtered = useMemo(() => {
    if (!feed) return [];
    let events = feed.events;

    // Ticker search
    const q = search.trim().toUpperCase();
    if (q) {
      events = events.filter((ev) => ev.root.includes(q));
    }

    // Right (C/P)
    if (effectiveFilters.right !== "all") {
      events = events.filter((ev) => ev.right === effectiveFilters.right);
    }

    // Lean
    if (effectiveFilters.lean !== "all") {
      events = events.filter((ev) => ev.side === effectiveFilters.lean);
    }

    // Min premium
    if (effectiveFilters.minPremium > 0) {
      events = events.filter((ev) => ev.premium >= effectiveFilters.minPremium);
    }

    // DTE buckets
    if (effectiveFilters.dteBuckets.length > 0) {
      const s = new Set(effectiveFilters.dteBuckets);
      events = events.filter((ev) => s.has(ev.dte_bucket));
    }

    // Moneyness buckets
    if (effectiveFilters.mnyBuckets.length > 0) {
      const s = new Set(effectiveFilters.mnyBuckets);
      events = events.filter((ev) => s.has(ev.mny_bucket));
    }

    // Min score — compute on the fly; not expensive (computeFlowScore is pure/cheap)
    if (effectiveFilters.minScore > 0) {
      events = events.filter((ev) => {
        const { score } = computeFlowScore(ev);
        return score >= effectiveFilters.minScore;
      });
    }

    // Badge flags — event must satisfy ALL checked badges
    if (effectiveFilters.badges.size > 0) {
      events = events.filter((ev) => {
        const { score } = computeFlowScore(ev);
        for (const flag of effectiveFilters.badges) {
          switch (flag) {
            case "whale":   if (ev.premium < 1_000_000) return false; break;
            case "cluster": if (!ev.repeated) return false; break;
            case "sweep":   if (!(ev.n_prints >= 3 && ev.swept)) return false; break;
            case "unusual": if (ev.premium_z == null || ev.premium_z < 2) return false; break;
            case "block":   if (!(ev.n_prints === 1 && ev.size >= 5000)) return false; break;
          }
        }
        return true;
      });
    }

    // Sort
    if (sort === "SCORE") {
      events = [...events].sort((a, b) => {
        const sa = computeFlowScore(a).score;
        const sb = computeFlowScore(b).score;
        return sb - sa;
      });
    } else {
      // NEW: newest-first (feed is already newest-first from the poller, but re-sort for safety)
      events = [...events].sort(
        (a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime()
      );
    }

    return events;
  }, [feed, search, effectiveFilters, sort]);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="obs-fd-feed-wrap">
      {/* ── Toolbar ── */}
      <div className="obs-fd-toolbar">
        {/* N SIGNALS count */}
        <div className="obs-fd-count">
          <span style={{ color: "var(--signal)", fontWeight: 700 }}>
            {filtered.length}
          </span>{" "}
          {zh ? "信号" : "SIGNALS"}
          {feed?.stale && (
            <span style={{ marginLeft: 6, color: "var(--warn)", fontSize: 10 }}>
              {zh ? "数据较旧" : "STALE"}
            </span>
          )}
        </div>

        {/* Ticker search */}
        <input
          type="text"
          placeholder={zh ? "搜索标的…" : "Search ticker…"}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="obs-fd-search"
          maxLength={12}
          spellCheck={false}
        />

        {/* Sort toggle — reuse fin-toggle (unchanged) */}
        <div className="fin-toggle">
          <button
            className={sort === "NEW" ? "on" : ""}
            onClick={() => updatePrefs({ sort: "NEW" })}
          >
            {zh ? "最新" : "NEW"}
          </button>
          <button
            className={sort === "SCORE" ? "on" : ""}
            onClick={() => updatePrefs({ sort: "SCORE" })}
          >
            {zh ? "评分" : "SCORE"}
          </button>
        </div>

        {/* Filters toggle */}
        <button
          className="obs-chip"
          onClick={() => setFiltersOpen((v) => !v)}
          aria-expanded={filtersOpen}
          style={{ fontSize: 11, padding: "5px 12px" }}
        >
          {zh ? "筛选" : "Filters"}
          {isFiltersDirty(filters) && (
            <span style={FILTER_DOT_STYLE} />
          )}
        </button>
      </div>

      {/* ── View presets ── */}
      <div className="obs-fd-preset-bar">
        {(["ALL", "ELITE", "WHALES", "0DTE", "SWEEPS"] as ViewPreset[]).map((p) => (
          <button
            key={p}
            className={`obs-chip${preset === p ? " on" : ""}`}
            onClick={() => updatePrefs({ preset: p })}
            style={{ fontSize: 11, padding: "5px 12px" }}
          >
            {p === "ALL"    ? (zh ? "全部" : "ALL")
              : p === "ELITE"  ? (zh ? "精英 90+" : "ELITE 90+")
              : p === "WHALES" ? (zh ? "巨单" : "WHALES")
              : p === "0DTE"   ? "0DTE"
              : (zh ? "扫单" : "SWEEPS")}
          </button>
        ))}
      </div>

      {/* ── FiltersPanel ── */}
      {filtersOpen && (
        <FiltersPanel
          filters={filters}
          onFiltersChange={onFiltersChange}
          lang={lang}
        />
      )}

      {/* ── Feed list ── */}
      <div className="obs-fd-list obs-scroll" data-tut="flow-feed">
        {/* Loading state */}
        {feed === null && <LoadingState zh={zh} />}

        {/* Empty state */}
        {feed !== null && filtered.length === 0 && (
          <EmptyState zh={zh} hasFilters={isFiltersDirty(effectiveFilters) || search.length > 0} />
        )}

        {/* Cards */}
        {filtered.map((ev) => (
          <FlowCard
            key={ev.id}
            ev={ev}
            lang={lang}
            selected={ev.id === selectedId}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}

// ── Empty / loading states ────────────────────────────────────────────────────

function LoadingState({ zh }: { zh: boolean }) {
  return (
    <div style={EMPTY_STYLE}>
      <div style={EMPTY_ICON}>⋯</div>
      <div style={EMPTY_HEAD}>
        {zh ? "加载中…" : "Loading feed…"}
      </div>
    </div>
  );
}

function EmptyState({ zh, hasFilters }: { zh: boolean; hasFilters: boolean }) {
  return (
    <div style={EMPTY_STYLE}>
      <div style={EMPTY_ICON}>◌</div>
      <div style={EMPTY_HEAD}>
        {hasFilters
          ? (zh ? "无符合条件的信号" : "No signals match your filters")
          : (zh ? "暂无信号" : "No signals yet")}
      </div>
      {!hasFilters && (
        <div style={EMPTY_BODY}>
          {zh
            ? "此列表基于当日RTH（美东时间9:30–16:00）盘中期权流数据，每约120秒轮询一次。开盘后信号将逐步出现。"
            : "This feed is session-based — it populates from live options prints during US regular trading hours (09:30–16:00 ET) and polls every ~120 s. Signals appear as the session progresses."}
        </div>
      )}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isFiltersDirty(f: FlowFilters): boolean {
  return (
    f.right !== "all" ||
    f.lean !== "all" ||
    f.minScore !== 0 ||
    f.minPremium !== 0 ||
    f.dteBuckets.length > 0 ||
    f.mnyBuckets.length > 0 ||
    f.badges.size > 0
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
// Layout moved to observatory.css (.obs-fd-*)

const FILTER_DOT_STYLE: React.CSSProperties = {
  display: "inline-block",
  width: 5,
  height: 5,
  borderRadius: "50%",
  background: "var(--brand)",
  marginLeft: 4,
  verticalAlign: "middle",
};

const EMPTY_STYLE: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 10,
  padding: "48px 24px",
  textAlign: "center",
};

const EMPTY_ICON: React.CSSProperties = {
  fontSize: 28,
  color: "var(--text-dim)",
  lineHeight: 1,
};

const EMPTY_HEAD: React.CSSProperties = {
  font: "600 13px/1.3 var(--font-ui)",
  color: "var(--text-2)",
};

const EMPTY_BODY: React.CSSProperties = {
  font: "500 11.5px/1.55 var(--font-ui)",
  color: "var(--muted)",
  maxWidth: 320,
};
