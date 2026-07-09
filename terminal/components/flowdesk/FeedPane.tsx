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
  useCallback, useEffect, useMemo, useRef, useState,
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

// ── v2 enrich types ──────────────────────────────────────────────────────────

/** Badge names from flow.enrich/v1 */
export type EnrichBadge =
  | "MULTI_LEG"
  | "LADDER"
  | "REPEAT_HITTER"
  | "SIZE_VS_OI"
  | "WHALE"
  | "FRESH"
  | "Z_OUTLIER"
  | "OI_CONFIRMED";

/** Per-event enrichment record */
export interface EnrichEvent {
  badges: EnrichBadge[];
  q_pctl: number;
  direction_discounted: boolean;
  /** why strings keyed as "BADGE_KEY" (EN) and "BADGE_KEY_zh" (ZH) */
  why: Record<string, string>;
}

export interface EnrichThresholds {
  elite_q: number;
  strong_q: number;
  high_q: number;
  medium_q: number;
}

/** Top-level enrich artifact (flow.enrich/v1) */
export interface EnrichPayload {
  schema?: string;
  asof: string;
  session_date?: string;
  thresholds: EnrichThresholds;
  /** keyed by event id */
  events: Record<string, EnrichEvent>;
  confirmed_yesterday?: { id: string; root: string; contract: string; oi_change: number }[];
}

/** Derive session_tier from q-score + enrich thresholds */
export function resolveSessionTier(
  q: number,
  premium: number,
  thresholds: EnrichThresholds,
): "ELITE" | "STRONG" | "HIGH" | "MEDIUM" | "BASE" {
  if (q >= thresholds.elite_q && premium >= 1_000_000) return "ELITE";
  if (q >= thresholds.strong_q) return "STRONG";
  if (q >= thresholds.high_q) return "HIGH";
  if (q >= thresholds.medium_q) return "MEDIUM";
  return "BASE";
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
      // v2: ELITE is session_tier-based (top 2% + premium ≥$1M).
      // Filtering happens in the pipeline via enrich data.
      // When enrich is absent, fall back to minPremium gate so preset is never vacuous.
      return {};
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
  enrich: EnrichPayload | null;
  lang: "en" | "zh";
  selectedId: string | null;
  onSelect: (ev: FlowEvent) => void;
  filters: FlowFilters;
  onFiltersChange: (next: FlowFilters) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function FeedPane({
  feed,
  enrich,
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

  // ── Feed virtualization — cap initial render; auto-load via IntersectionObserver ──
  const PAGE_SIZE = 200;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Reset visible count when filters/sort change so users always see newest/top results.
  // We compare a serialized key of the effective filter state.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [search, preset, sort, filters]);

  // Wire IntersectionObserver to sentinel so scrolling to the bottom auto-loads
  // the next page without requiring a button click.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleCount((n) => n + PAGE_SIZE);
        }
      },
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => io.disconnect();
  });

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

    const enrichEvents = enrich?.events ?? {};
    const thresholds = enrich?.thresholds ?? null;

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

    // ELITE preset: session_tier filter using enrich thresholds.
    // Uses session_tier EXCLUSIVELY (per spec §3: "UI uses session_tier exclusively").
    // Fallback when enrich absent: premium ≥$1M (so preset is never vacuous).
    if (preset === "ELITE") {
      if (thresholds) {
        events = events.filter((ev) => {
          const enrichEv: EnrichEvent | undefined = enrichEvents[ev.id];
          if (!enrichEv) return false;
          const { score } = computeFlowScore(ev);
          return score >= thresholds.elite_q && ev.premium >= 1_000_000;
        });
      } else {
        // Fallback: v1 behavior (no enrich)
        events = events.filter((ev) => ev.premium >= 1_000_000);
      }
    }

    // Badge flags — event must satisfy ALL checked badges (v1 client-derived)
    if (effectiveFilters.badges.size > 0) {
      events = events.filter((ev) => {
        for (const flag of effectiveFilters.badges) {
          switch (flag) {
            case "whale":   if (ev.premium < 1_000_000) return false; break;
            case "cluster": if (!ev.repeated) return false; break;
            case "sweep":   if (!(ev.n_prints >= 3 && ev.swept)) return false; break;
            case "unusual": if (ev.premium_z == null || ev.premium_z < 2) return false; break;
            case "block":   if (!(ev.n_prints === 1 && ev.size >= 5000)) return false; break;
            // v2 detection flags used in badges set fall through to detections filter
            default: break;
          }
        }
        return true;
      });
    }

    // Detections filter lens (v2) — show events that have ANY of the selected detections
    if (effectiveFilters.detections.size > 0 && enrich) {
      events = events.filter((ev) => {
        const enrichEv: EnrichEvent | undefined = enrichEvents[ev.id];
        if (!enrichEv) return false;
        const badgeSet = new Set(enrichEv.badges);
        for (const det of effectiveFilters.detections) {
          if (badgeSet.has(det)) return true;
        }
        return false;
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
  }, [feed, enrich, search, effectiveFilters, preset, sort]);

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
              : p === "ELITE"  ? (zh ? "精英 — 磁带前2%" : "Elite — top 2% of tape")
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

        {/* Cards — capped to visibleCount; sentinel triggers Load-more */}
        {filtered.slice(0, visibleCount).map((ev) => (
          <FlowCard
            key={ev.id}
            ev={ev}
            enrichEv={enrich?.events[ev.id] ?? null}
            lang={lang}
            selected={ev.id === selectedId}
            onSelect={onSelect}
          />
        ))}

        {/* Load-more sentinel — only shown when more cards exist beyond the cap */}
        {filtered.length > visibleCount && (
          <div
            ref={sentinelRef}
            style={LOAD_MORE_STYLE}
            // Span full grid width so it sits below the card grid, not in a column slot
            // grid-column: 1/-1 is set via the class in observatory.css
            className="obs-fd-load-more"
          >
            <button
              style={LOAD_MORE_BTN}
              onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
            >
              {zh
                ? `加载更多 — 已显示 ${visibleCount} / ${filtered.length}`
                : `Load more — showing ${visibleCount} of ${filtered.length}`}
            </button>
          </div>
        )}
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
    f.badges.size > 0 ||
    f.detections.size > 0
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

// ── Load-more sentinel ────────────────────────────────────────────────────────

const LOAD_MORE_STYLE: React.CSSProperties = {
  padding: "10px 0 4px",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
};

const LOAD_MORE_BTN: React.CSSProperties = {
  padding: "6px 16px",
  borderRadius: "var(--r-pill)",
  border: "1px solid var(--line-2)",
  background: "transparent",
  color: "var(--text-2)",
  font: "500 11px/1 var(--font-ui)",
  cursor: "pointer",
};
