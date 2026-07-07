"use client";
/**
 * FlowDeskView — three-pane MomoEdge-parity options flow desk.
 *
 * Layout:
 *   Left  — WatchlistRail (session overview + watchlist chips)
 *   Center — FlowGauge strip + RadarStrip + FiltersPanel (slide-in) + FeedPane
 *   Right  — InspectorPane + ChainHeatRail
 *
 * State owned here:
 *   - feed / tide / chainHeat polling (~30s via setInterval)
 *   - selectedEvent for inspector
 *   - tickerCtx fetch (on selection)
 *   - watchlist (localStorage "flowdesk.watchlist")
 *   - filters (passed down to FeedPane → FiltersPanel)
 *
 * HONESTY DOCTRINE: rank/color by MAGNITUDE, never by asserted direction.
 * Direction is surfaced only as a soft "lean" chip with tooltip.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useLang } from "../../lib/i18n";
import { makeFlowT } from "../../lib/flowdeskStrings";
import { WatchlistRail } from "./WatchlistRail";
import { RadarStrip } from "./RadarStrip";
import { FlowGauge } from "./FlowGauge";
import { FeedPane, type FlowEvent, type FeedPayload } from "./FeedPane";
import { InspectorPane } from "./InspectorPane";
import { DEFAULT_FILTERS, type FlowFilters } from "./FiltersPanel";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TideMinute { t: string; ncp: number; npp: number; gross: number; vol: number }
interface TidePayload {
  schema?: string; asof: string; session_date?: string;
  minutes: TideMinute[];
  spy: { t: string; px: number }[];
  sectors: unknown[]; top_net_impact: unknown[];
}

interface TickerPayload {
  schema?: string; asof: string; root: string; group: string; group_zh: string;
  day: {
    gross: number; net_soft: number; call_share: number; n_events: number;
    prem_z: number | null; baseline_source: string | null;
  };
  minutes: { t: string; ncp: number; npp: number; vol: number }[];
  strikes: { strike: number; call_prem: number; put_prem: number; vol: number }[];
  expiries: { exp: string; call_prem: number; put_prem: number; vol: number }[];
  top_contracts: {
    right: "C" | "P"; exp: string; strike: number; premium: number;
    vol: number; vol_gt_oi: boolean | null; close: number;
  }[];
}

interface ChainHeatCampaign {
  option_symbol: string;
  ticker: string;
  type: "CALL" | "PUT";
  strike: number;
  expiry: string;
  dte: number;
  total_premium_mn: number;
  alert_count: number;
  span_minutes: number;
  first_seen: string;
  ask_share: number;
  lean: "accumulation" | "distribution" | "contested";
  direction_reliability: string;
  authority_tier: string;
  note?: string;
}

interface ChainHeatPayload {
  schema?: string; asof: string; session_date?: string;
  threshold_mn?: number;
  note_en?: string; note_zh?: string;
  campaigns: ChainHeatCampaign[];
}

// ─── Polling constants ────────────────────────────────────────────────────────

const FEED_POLL_MS   = 30_000;
const TIDE_POLL_MS   = 60_000;
const CHAIN_POLL_MS  = 45_000;

const WATCHLIST_KEY = "flowdesk.watchlist";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function loadWatchlist(): string[] {
  try {
    const raw = localStorage.getItem(WATCHLIST_KEY);
    if (raw) return JSON.parse(raw) as string[];
  } catch {}
  return [];
}

function saveWatchlist(list: string[]) {
  try { localStorage.setItem(WATCHLIST_KEY, JSON.stringify(list)); } catch {}
}

async function safeFetch<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) return null;
    return await r.json() as T;
  } catch {
    return null;
  }
}

// ─── ChainHeatRail ────────────────────────────────────────────────────────────

interface ChainHeatRailProps {
  data: ChainHeatPayload | null;
  lang: "en" | "zh";
}

function ChainHeatRail({ data, lang }: ChainHeatRailProps) {
  const zh = lang === "zh";
  const t = makeFlowT(lang);

  if (!data) {
    return (
      <div style={CHAIN_RAIL}>
        <div style={CHAIN_HEADER}>
          <span style={CHAIN_TITLE}>{t("chainHeatTitle")}</span>
        </div>
        <div style={CHAIN_LOADING}>{t("chainHeatLoading")}</div>
      </div>
    );
  }

  const campaigns = [...data.campaigns].sort(
    (a, b) => b.total_premium_mn - a.total_premium_mn
  );

  const threshold = data.threshold_mn ?? 3;
  const note = zh ? (data.note_zh ?? "") : (data.note_en ?? "");

  return (
    <div style={CHAIN_RAIL}>
      <div style={CHAIN_HEADER}>
        <span style={CHAIN_TITLE}>{t("chainHeatTitle")}</span>
        <span style={CHAIN_SUBTITLE}>{zh ? `≥$${threshold}M` : `≥$${threshold}M cumul`}</span>
      </div>

      {note && <div style={CHAIN_NOTE}>{note}</div>}

      {campaigns.length === 0 && (
        <div style={CHAIN_EMPTY}>{t("chainHeatEmpty")}</div>
      )}

      {campaigns.map((c) => (
        <ChainCampaignRow key={c.option_symbol} campaign={c} zh={zh} t={t} />
      ))}
    </div>
  );
}

function ChainCampaignRow({
  campaign,
  zh,
  t,
}: {
  campaign: ChainHeatCampaign;
  zh: boolean;
  t: (key: Parameters<ReturnType<typeof makeFlowT>>[0]) => string;
}) {
  const isCall = campaign.type === "CALL";
  const isContested = campaign.lean === "contested";

  // Lean label (soft, never buy/sell assertion)
  const leanLabel = campaign.lean === "accumulation"
    ? t("chainHeatLeanAccum")
    : campaign.lean === "distribution"
    ? t("chainHeatLeanDist")
    : t("chainHeatContested");

  // Premium magnitude formatting
  const premStr = `$${campaign.total_premium_mn.toFixed(1)}M`;
  const isBig = campaign.total_premium_mn >= 10;

  // Ask share bar width
  const askBarW = Math.round(campaign.ask_share * 100);

  // First-seen time (ET)
  let firstSeenStr = "";
  try {
    firstSeenStr = new Date(campaign.first_seen).toLocaleTimeString("en-US", {
      hour: "2-digit", minute: "2-digit", hour12: false,
      timeZone: "America/New_York",
    }) + " ET";
  } catch {
    firstSeenStr = campaign.first_seen.slice(11, 16);
  }

  return (
    <div style={CHAIN_ROW}>
      {/* Ticker + contract type */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
        <span style={CHAIN_TICKER}>{campaign.ticker}</span>
        <span style={{ ...CHAIN_CP_BADGE, color: isCall ? "var(--brand-2)" : "var(--cat-2)" }}>
          {campaign.type}
        </span>
        <span style={CHAIN_STRIKE}>${campaign.strike} · {campaign.expiry.slice(5)}</span>
        <span style={{ ...CHAIN_PREM, color: isBig ? "var(--signal)" : "var(--text)" }}>
          {premStr}
        </span>
      </div>

      {/* Lean chip — neutral color, not buy/sell assertion */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
        <span
          style={{
            ...CHAIN_LEAN_CHIP,
            color: isContested ? "var(--muted)" : "var(--text-2)",
          }}
          // No title= attribute (CI-guarded: no translated text in title=)
        >
          {leanLabel}
        </span>
        <span style={CHAIN_CAVEAT}>{t("chainHeatLeanNote")}</span>
      </div>

      {/* Stats row */}
      <div style={CHAIN_STATS}>
        <span style={CHAIN_STAT_ITEM}>
          <span style={CHAIN_STAT_KEY}>{t("chainHeatAlertCt")}</span>
          {" "}{campaign.alert_count}
        </span>
        <span style={CHAIN_STAT_ITEM}>
          <span style={CHAIN_STAT_KEY}>{t("chainHeatSpan")}</span>
          {" "}{campaign.span_minutes}m
        </span>
        <span style={CHAIN_STAT_ITEM}>
          <span style={CHAIN_STAT_KEY}>{t("chainHeatFirstSeen")}</span>
          {" "}{firstSeenStr}
        </span>
      </div>

      {/* Ask share bar */}
      <div style={{ marginTop: 4 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
          <span style={CHAIN_STAT_KEY}>{t("chainHeatAskShare")}</span>
          <span style={{ fontSize: 10, color: "var(--text-2)", fontVariantNumeric: "tabular-nums" }}>
            {askBarW}%
          </span>
        </div>
        <div style={CHAIN_BAR_TRACK}>
          <div style={{ ...CHAIN_BAR_FILL, width: `${askBarW}%` }} />
        </div>
      </div>
    </div>
  );
}

// ─── FlowDeskView ─────────────────────────────────────────────────────────────

export function FlowDeskView() {
  const { lang } = useLang();

  // ── Data state ──────────────────────────────────────────────────────────────
  const [feed,      setFeed]      = useState<FeedPayload | null>(null);
  const [tide,      setTide]      = useState<TidePayload | null>(null);
  const [chainHeat, setChainHeat] = useState<ChainHeatPayload | null>(null);

  // ── Selection state ──────────────────────────────────────────────────────────
  const [selectedEvent, setSelectedEvent] = useState<FlowEvent | null>(null);
  const [tickerCtx,     setTickerCtx]     = useState<TickerPayload | null>(null);

  // ── Watchlist ────────────────────────────────────────────────────────────────
  const [watchlist, setWatchlist] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    return loadWatchlist();
  });

  // ── Filters ──────────────────────────────────────────────────────────────────
  const [filters, setFilters] = useState<FlowFilters>(DEFAULT_FILTERS);

  // ── Polling refs ─────────────────────────────────────────────────────────────
  const feedTimerRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const tideTimerRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const chainTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Fetch functions ──────────────────────────────────────────────────────────

  const fetchFeed = useCallback(async () => {
    if (document.visibilityState === "hidden") return;
    const data = await safeFetch<FeedPayload>("/api/flow?f=feed");
    if (data) setFeed(data);
  }, []);

  const fetchTide = useCallback(async () => {
    if (document.visibilityState === "hidden") return;
    const data = await safeFetch<TidePayload>("/api/flow?f=tide");
    if (data) setTide(data);
  }, []);

  const fetchChainHeat = useCallback(async () => {
    if (document.visibilityState === "hidden") return;
    const data = await safeFetch<ChainHeatPayload>("/api/flow?f=chainheat");
    if (data) setChainHeat(data);
  }, []);

  const fetchTickerCtx = useCallback(async (root: string) => {
    setTickerCtx(null);
    const data = await safeFetch<TickerPayload>(`/api/flow?f=ticker:${root}`);
    if (data) setTickerCtx(data);
  }, []);

  // ── Mount: initial fetch + polling ───────────────────────────────────────────

  useEffect(() => {
    // Initial fetches (bypass visibility guard on mount)
    void (async () => {
      const [f, ti, ch] = await Promise.all([
        safeFetch<FeedPayload>("/api/flow?f=feed"),
        safeFetch<TidePayload>("/api/flow?f=tide"),
        safeFetch<ChainHeatPayload>("/api/flow?f=chainheat"),
      ]);
      if (f)  setFeed(f);
      if (ti) setTide(ti);
      if (ch) setChainHeat(ch);
    })();

    feedTimerRef.current  = setInterval(fetchFeed,      FEED_POLL_MS);
    tideTimerRef.current  = setInterval(fetchTide,      TIDE_POLL_MS);
    chainTimerRef.current = setInterval(fetchChainHeat, CHAIN_POLL_MS);

    return () => {
      if (feedTimerRef.current)  clearInterval(feedTimerRef.current);
      if (tideTimerRef.current)  clearInterval(tideTimerRef.current);
      if (chainTimerRef.current) clearInterval(chainTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Ticker context fetch on event selection ───────────────────────────────────

  useEffect(() => {
    if (selectedEvent) {
      void fetchTickerCtx(selectedEvent.root);
    } else {
      setTickerCtx(null);
    }
  }, [selectedEvent, fetchTickerCtx]);

  // ── Watchlist handlers ────────────────────────────────────────────────────────

  const handleToggleTicker = useCallback((root: string) => {
    setWatchlist((prev) => {
      const next = prev.includes(root)
        ? prev.filter((t) => t !== root)
        : [...prev, root];
      saveWatchlist(next);
      return next;
    });
  }, []);

  const handlePickTicker = useCallback((root: string) => {
    // Selecting a ticker from the watchlist selects its most recent event (latest timestamp)
    if (!feed) return;
    const eventsForRoot = feed.events.filter((ev) => ev.root === root);
    if (eventsForRoot.length === 0) return;
    // Pick the event with the latest timestamp
    const ev = eventsForRoot.reduce((best, cur) =>
      new Date(cur.ts) > new Date(best.ts) ? cur : best
    );
    setSelectedEvent(ev);
  }, [feed]);

  // ── WatchlistRail needs typed unusual_names ────────────────────────────────────

  const feedForWatchlist = feed
    ? {
        ...feed,
        unusual_names: (feed.unusual_names ?? []) as {
          root: string;
          gross_premium_today: number;
          prem_z: number | null;
          call_prem_share: number;
        }[],
      }
    : null;

  // ── FlowGauge needs feed with typed events ────────────────────────────────────

  const feedForGauge = feed ?? { events: [], session_pct: undefined };

  // ── RadarStrip needs feed with typed unusual_names ────────────────────────────

  const feedForRadar = feed
    ? {
        unusual_names: (feed.unusual_names ?? []) as {
          root: string;
          group: string;
          group_zh: string;
          gross_premium_today: number;
          prem_z: number | null;
          baseline_source: string;
          n_obs: number;
          call_prem_share: number;
          top_contracts: { right: "C" | "P"; exp: string; strike: number; premium: number }[];
        }[],
        baseline_note: feed.baseline_note,
      }
    : { unusual_names: [], baseline_note: undefined };

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div style={DESK_OUTER}>

      {/* ═══ LEFT RAIL (WatchlistRail) ════════════════════════════════════════ */}
      <div style={LEFT_COL}>
        {feedForWatchlist && (
          <WatchlistRail
            feed={feedForWatchlist}
            tide={tide}
            lang={lang}
            watchlist={watchlist}
            onToggleTicker={handleToggleTicker}
            onPickTicker={handlePickTicker}
          />
        )}
        {!feedForWatchlist && <div style={RAIL_LOADING} />}
      </div>

      {/* ═══ CENTER (FlowGauge + RadarStrip + FeedPane) ══════════════════════ */}
      <div style={CENTER_COL}>
        {/* FlowGauge strip — always shown; empty feed renders $0 gracefully */}
        <FlowGauge feed={feedForGauge} lang={lang} />

        {/* RadarStrip — show only if unusual_names populated */}
        {feedForRadar.unusual_names.length > 0 && (
          <RadarStrip feed={feedForRadar} lang={lang} />
        )}

        {/* FeedPane — feed + filters + events */}
        <div style={FEED_COL}>
          <FeedPane
            feed={feed}
            lang={lang}
            selectedId={selectedEvent?.id ?? null}
            onSelect={(ev) => setSelectedEvent((prev) =>
              prev?.id === ev.id ? null : ev
            )}
            filters={filters}
            onFiltersChange={setFilters}
          />
        </div>
      </div>

      {/* ═══ RIGHT RAIL (InspectorPane + ChainHeatRail) ══════════════════════ */}
      <div style={RIGHT_COL}>
        {/* Inspector — shown whenever an event is selected */}
        <InspectorPane
          event={selectedEvent}
          tickerCtx={tickerCtx}
          lang={lang}
        />

        {/* Chain Heat Rail */}
        <ChainHeatRail data={chainHeat} lang={lang} />
      </div>

    </div>
  );
}

// ─── Layout styles ────────────────────────────────────────────────────────────

const DESK_OUTER: React.CSSProperties = {
  display: "flex",
  flexDirection: "row",
  height: "100%",
  overflow: "hidden",
  background: "var(--bg)",
};

const LEFT_COL: React.CSSProperties = {
  width: 184,
  flexShrink: 0,
  overflowY: "auto",
  borderRight: "1px solid var(--line)",
};

const CENTER_COL: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
  overflowY: "hidden",
};

const FEED_COL: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflowY: "auto",
};

const RIGHT_COL: React.CSSProperties = {
  width: 300,
  flexShrink: 0,
  borderLeft: "1px solid var(--line)",
  overflowY: "auto",
  display: "flex",
  flexDirection: "column",
};

const RAIL_LOADING: React.CSSProperties = {
  height: "100%",
  background: "var(--panel)",
};

// ─── ChainHeatRail styles ─────────────────────────────────────────────────────

const CHAIN_RAIL: React.CSSProperties = {
  borderTop: "1px solid var(--line)",
  background: "var(--panel)",
  flex: "0 0 auto",
};

const CHAIN_HEADER: React.CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  gap: 8,
  padding: "8px 12px 4px",
  borderBottom: "1px solid var(--line-2)",
};

const CHAIN_TITLE: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "var(--text)",
  letterSpacing: "0.04em",
  textTransform: "uppercase",
};

const CHAIN_SUBTITLE: React.CSSProperties = {
  fontSize: 10,
  color: "var(--muted)",
};

const CHAIN_NOTE: React.CSSProperties = {
  fontSize: 10,
  color: "var(--muted)",
  fontStyle: "italic",
  padding: "4px 12px",
  borderBottom: "1px solid var(--line-2)",
  lineHeight: 1.4,
};

const CHAIN_LOADING: React.CSSProperties = {
  padding: "12px",
  fontSize: 11,
  color: "var(--muted)",
  textAlign: "center",
};

const CHAIN_EMPTY: React.CSSProperties = {
  padding: "12px",
  fontSize: 11,
  color: "var(--muted)",
  textAlign: "center",
  fontStyle: "italic",
};

const CHAIN_ROW: React.CSSProperties = {
  padding: "8px 12px",
  borderBottom: "1px solid var(--line-2)",
};

const CHAIN_TICKER: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: "var(--text)",
};

const CHAIN_CP_BADGE: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  background: "var(--panel-3)",
  borderRadius: "var(--r-pill)",
  padding: "1px 5px",
};

const CHAIN_STRIKE: React.CSSProperties = {
  fontSize: 11,
  color: "var(--text-2)",
  fontVariantNumeric: "tabular-nums",
  flex: 1,
};

const CHAIN_PREM: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  fontVariantNumeric: "tabular-nums",
};

const CHAIN_LEAN_CHIP: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  background: "var(--panel-3)",
  borderRadius: "var(--r-pill)",
  padding: "2px 6px",
};

const CHAIN_CAVEAT: React.CSSProperties = {
  fontSize: 10,
  color: "var(--muted)",
  fontStyle: "italic",
};

const CHAIN_STATS: React.CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  marginTop: 4,
};

const CHAIN_STAT_ITEM: React.CSSProperties = {
  fontSize: 10,
  color: "var(--text-2)",
  fontVariantNumeric: "tabular-nums",
};

const CHAIN_STAT_KEY: React.CSSProperties = {
  color: "var(--muted)",
};

const CHAIN_BAR_TRACK: React.CSSProperties = {
  height: 3,
  background: "var(--panel-3)",
  borderRadius: 2,
  overflow: "hidden",
};

const CHAIN_BAR_FILL: React.CSSProperties = {
  height: "100%",
  background: "var(--brand-2)",
  borderRadius: 2,
  transition: "width 0.3s ease",
};
