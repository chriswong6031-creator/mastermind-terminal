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
import { flowGet } from "../../lib/flowClientCache";
import { useFlowStream } from "../../lib/flowStream";
import { useLang } from "../../lib/i18n";
import { makeFlowT } from "../../lib/flowdeskStrings";
import { WatchlistRail } from "./WatchlistRail";
import { RadarStrip } from "./RadarStrip";
import { FlowGauge } from "./FlowGauge";
import { FeedPane, type FlowEvent, type FeedPayload, type EnrichPayload, normalizeEnrichPayload } from "./FeedPane";
import { InspectorPane } from "./InspectorPane";
import { DEFAULT_FILTERS, type FlowFilters } from "./FiltersPanel";
import { TutorialOverlay } from "../tutorial/TutorialOverlay";

const TUTORIAL_KEY = "flowdesk.tutorial";
/** Written the moment the auto-prompt fires so it never re-fires on future visits,
 *  independent of whether the user completes a module (which writes TUTORIAL_KEY). */
const TUTORIAL_SEEN_KEY = "flowdesk.tutorial.seen";
const AUTO_PROMPT_DELAY_MS = 1500;

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
    const f = new URL(url, "http://x").searchParams.get("f") ?? url;
    const data = await flowGet(f);
    return (data as T) ?? null;
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
      <div className="obs-card obs-fd-chain obs-scroll" data-tut="chain-heat">
        <div className="obs-card-hd">
          <span className="obs-lbl">{t("chainHeatTitle")}</span>
        </div>
        <div className="obs-fd-chain-empty">{t("chainHeatLoading")}</div>
      </div>
    );
  }

  const campaigns = [...data.campaigns].sort(
    (a, b) => b.total_premium_mn - a.total_premium_mn
  );

  const threshold = data.threshold_mn ?? 3;
  const note = zh ? (data.note_zh ?? "") : (data.note_en ?? "");

  return (
    <div className="obs-card obs-fd-chain obs-scroll" data-tut="chain-heat">
      <div className="obs-card-hd">
        <span className="obs-lbl">{t("chainHeatTitle")}</span>
        <span className="obs-lbl" style={{ color: "var(--muted)" }}>
          {zh ? `≥$${threshold}M` : `≥$${threshold}M cumul`}
        </span>
      </div>

      {note && <div className="obs-fd-chain-note">{note}</div>}

      {campaigns.length === 0 && (
        <div className="obs-fd-chain-empty">{t("chainHeatEmpty")}</div>
      )}

      {campaigns.map((c, idx) => (
        <ChainCampaignRow key={c.option_symbol} campaign={c} zh={zh} t={t} firstCampaign={idx === 0} />
      ))}
    </div>
  );
}

function ChainCampaignRow({
  campaign,
  zh,
  t,
  firstCampaign,
}: {
  campaign: ChainHeatCampaign;
  zh: boolean;
  t: (key: Parameters<ReturnType<typeof makeFlowT>>[0]) => string;
  firstCampaign?: boolean;
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
    <div className="obs-fd-chain-row" {...(firstCampaign ? { "data-tut": "chain-heat-campaign" } : {})}>
      {/* Row 1: ticker / type / strike / premium */}
      <div className="obs-fd-chain-row1">
        <span className="obs-fd-chain-ticker">{campaign.ticker}</span>
        <span className={`obs-fd-chain-cp ${isCall ? "call" : "put"}`}>
          {campaign.type}
        </span>
        <span className="obs-fd-chain-strike">${campaign.strike} · {campaign.expiry.slice(5)}</span>
        <span className="obs-fd-chain-prem num" style={{ color: isBig ? "var(--signal)" : "var(--text)" }}>
          {premStr}
        </span>
      </div>

      {/* Row 2: lean chip + caveat */}
      <div className="obs-fd-chain-row2">
        <span
          className="obs-fd-chain-lean"
          style={{ color: isContested ? "var(--muted)" : "var(--text-2)" }}
        >
          {leanLabel}
        </span>
        <span className="obs-fd-chain-caveat">{t("chainHeatLeanNote")}</span>
      </div>

      {/* Row 3: stats */}
      <div className="obs-fd-chain-stats">
        <span>
          <span className="obs-fd-chain-stat-key">{t("chainHeatAlertCt")}</span>
          {" "}{campaign.alert_count}
        </span>
        <span>
          <span className="obs-fd-chain-stat-key">{t("chainHeatSpan")}</span>
          {" "}{campaign.span_minutes}m
        </span>
        <span>
          <span className="obs-fd-chain-stat-key">{t("chainHeatFirstSeen")}</span>
          {" "}{firstSeenStr}
        </span>
      </div>

      {/* Ask share bar */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
          <span className="obs-fd-chain-stat-key">{t("chainHeatAskShare")}</span>
          <span className="num" style={{ fontSize: 10, color: "var(--text-2)" }}>{askBarW}%</span>
        </div>
        <div className="obs-fd-chain-askbar-track">
          <div className="obs-fd-chain-askbar-fill" style={{ width: `${askBarW}%` }} />
        </div>
      </div>
    </div>
  );
}

// ─── FlowDeskView ─────────────────────────────────────────────────────────────

export function FlowDeskView() {
  const { lang } = useLang();

  // ── Data state ──────────────────────────────────────────────────────────────
  // The order-flow tape rides the SSE live spine (push) instead of a 30s poll; the
  // hook falls back to flowGet polling if SSE is unavailable, so this is never worse
  // than before. feedLive drives the toolbar LIVE badge — honest here because this is
  // session-intraday order flow (unlike the EOD gex desk). The SSE endpoint already
  // pushes only on change (asof+size signature), so the old client-side asof dedup is
  // no longer needed.
  const { data: feed, live: feedLive } = useFlowStream<FeedPayload>("feed");
  const [tide,      setTide]      = useState<TidePayload | null>(null);
  const [chainHeat, setChainHeat] = useState<ChainHeatPayload | null>(null);
  const [enrich,    setEnrich]    = useState<EnrichPayload | null>(null);


  // ── Selection state ──────────────────────────────────────────────────────────
  const [selectedEvent, setSelectedEvent] = useState<FlowEvent | null>(null);
  const [tickerCtx,     setTickerCtx]     = useState<TickerPayload | null>(null);

  // Stable reference so React.memo on FlowCard does not re-render all 200 cards
  // when the selection changes (an inline arrow at the JSX call site creates a new
  // reference on every render).
  const handleSelect = useCallback((ev: FlowEvent) => {
    setSelectedEvent((prev) => prev?.id === ev.id ? null : ev);
  }, []);

  // ── Watchlist ────────────────────────────────────────────────────────────────
  const [watchlist, setWatchlist] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    return loadWatchlist();
  });

  // ── Filters ──────────────────────────────────────────────────────────────────
  const [filters, setFilters] = useState<FlowFilters>(DEFAULT_FILTERS);

  // ── Tutorial ─────────────────────────────────────────────────────────────────
  const [tutOpen, setTutOpen] = useState(false);
  const autoPromptRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Polling refs ─────────────────────────────────────────────────────────────
  const tideTimerRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const chainTimerRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const enrichTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Fetch functions ──────────────────────────────────────────────────────────

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

  /** Fetch enrich artifact — fail-soft (absent/stale → null → v1 fallback in UI)
   *
   * Stale rule: asof >16h old → treat as absent (v1 fallback, tier chips hidden).
   * Exception: source === "fixture" → skip stale gate (dev mode fixture data
   * carries a fixed historical asof but is always current for UI testing).
   * Live stale artifacts are detected by the route emitting `stale: true`.
   */
  const fetchEnrich = useCallback(async () => {
    if (document.visibilityState === "hidden") return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = await safeFetch<any>("/api/flow?f=enrich");
    if (!raw) return;
    let normalized: EnrichPayload;
    try { normalized = normalizeEnrichPayload(raw); } catch { return; }
    const src = (raw as Record<string, unknown>).source as string | undefined;
    if (src === "fixture") { setEnrich(normalized); return; }
    const asof = normalized.asof ? new Date(normalized.asof).getTime() : 0;
    const ageH = asof > 0 ? (Date.now() - asof) / 3_600_000 : 0;
    if (ageH > 16) { setEnrich(null); return; }
    setEnrich(normalized);
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      // feed is streamed via useFlowStream — bootstrap only the still-polled feeds.
      const [ti, ch, en] = await Promise.all([
        safeFetch<TidePayload>("/api/flow?f=tide"),
        safeFetch<ChainHeatPayload>("/api/flow?f=chainheat"),
        safeFetch<any>("/api/flow?f=enrich"),
      ]);
      if (ti) setTide(ti);
      if (ch) setChainHeat(ch);
      // Enrich: stale check (same logic as fetchEnrich callback)
      if (en) {
        let normalizedEn: EnrichPayload | null = null;
        try { normalizedEn = normalizeEnrichPayload(en); } catch { /* ignore */ }
        if (normalizedEn) {
          const src = (en as Record<string, unknown>).source as string | undefined;
          if (src === "fixture") {
            setEnrich(normalizedEn);
          } else {
            const asof = normalizedEn.asof ? new Date(normalizedEn.asof).getTime() : 0;
            const ageH = asof > 0 ? (Date.now() - asof) / 3_600_000 : 0;
            if (ageH <= 16) setEnrich(normalizedEn);
          }
        }
      }
    })();

    tideTimerRef.current   = setInterval(fetchTide,      TIDE_POLL_MS);
    chainTimerRef.current  = setInterval(fetchChainHeat, CHAIN_POLL_MS);
    // Enrich polls at 5-min cadence (offset from feed)
    enrichTimerRef.current = setInterval(fetchEnrich, 5 * 60_000);

    return () => {
      if (tideTimerRef.current)   clearInterval(tideTimerRef.current);
      if (chainTimerRef.current)  clearInterval(chainTimerRef.current);
      if (enrichTimerRef.current) clearInterval(enrichTimerRef.current);
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

  // ── Auto-prompt tutorial exactly once per browser (gate on seen flag) ────────
  // We check TUTORIAL_SEEN_KEY (not TUTORIAL_KEY) so that a user who opens and
  // then closes/skips the overlay without completing a module is still marked as
  // having seen the auto-prompt and does not see it again on the next /flow visit.
  useEffect(() => {
    let alreadySeen = false;
    try {
      alreadySeen = localStorage.getItem(TUTORIAL_SEEN_KEY) !== null;
    } catch {}
    if (!alreadySeen) {
      // Mark as seen immediately — before the timeout fires — so that even if the
      // component unmounts before the delay elapses the flag is persisted.
      try {
        localStorage.setItem(TUTORIAL_SEEN_KEY, "1");
      } catch {}
      autoPromptRef.current = setTimeout(() => {
        setTutOpen(true);
      }, AUTO_PROMPT_DELAY_MS);
    }
    return () => {
      if (autoPromptRef.current) clearTimeout(autoPromptRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="obs obs-ambient obs-flowdesk">

      {/* ═══ LEFT RAIL (FlowGauge strip + WatchlistRail + Smart Money Radar) ═ */}
      <div className="obs-fd-left">
        {/* FlowGauge — slim strip pinned at top of left rail */}
        <FlowGauge feed={feedForGauge} lang={lang} />

        {/* WatchlistRail — compacted rings (26px) + tighter rows */}
        {feedForWatchlist && (
          <WatchlistRail
            feed={feedForWatchlist}
            tide={tide}
            lang={lang}
            watchlist={watchlist}
            onToggleTicker={handleToggleTicker}
            onPickTicker={handlePickTicker}
            onOpenTutorial={() => setTutOpen(true)}
          />
        )}
        {!feedForWatchlist && <div style={RAIL_LOADING} />}

        {/* Smart Money Radar — fills remaining left-rail height, obs-scroll inside */}
        {feedForRadar.unusual_names.length > 0 && (
          <RadarStrip feed={feedForRadar} lang={lang} />
        )}
      </div>

      {/* ═══ CENTER — feed ONLY (toolbar + card grid) ════════════════════════ */}
      <div className="obs-fd-center">
        {/* FeedPane takes full center column height */}
        <FeedPane
          feed={feed}
          live={feedLive}
          enrich={enrich}
          lang={lang}
          selectedId={selectedEvent?.id ?? null}
          onSelect={handleSelect}
          filters={filters}
          onFiltersChange={setFilters}
        />
      </div>

      {/* ═══ RIGHT RAIL — Chain Heat FIRST, then Inspector ═══════════════════ */}
      <div className="obs-fd-right">
        {/* Chain Heat Rail — top of right column, scrollable */}
        <ChainHeatRail data={chainHeat} lang={lang} />

        {/* Inspector — slim one-line hint when nothing selected; full view on click */}
        <InspectorPane
          event={selectedEvent}
          tickerCtx={tickerCtx}
          enrichEv={selectedEvent ? (enrich?.events[selectedEvent.id] ?? null) : null}
          lang={lang}
        />
      </div>

      {/* Tutorial overlay (portal-like; renders above everything) */}
      {tutOpen && (
        <TutorialOverlay
          open={tutOpen}
          onClose={() => setTutOpen(false)}
        />
      )}

    </div>
  );
}

// ─── Layout styles ────────────────────────────────────────────────────────────

const RAIL_LOADING: React.CSSProperties = {
  height: "100%",
  background: "var(--panel)",
};

// ChainHeat styles moved to observatory.css (.obs-fd-chain-*)
