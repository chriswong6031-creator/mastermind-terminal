"use client";
import {
  memo,
  useCallback, useEffect, useMemo, useRef, useState,
} from "react";
import dynamic from "next/dynamic";
import { BrandLockup } from "@/components/BrandMark";
import { AppNav } from "@/components/AppNav";
import { useLang, useT } from "@/lib/i18n";
import { abbrevSector } from "@/lib/sectorAbbrev";
import { windowGexRows } from "@/lib/windowGexRows.mjs";
import { flowGet, flowInvalidate, flowPrefetch } from "@/lib/flowClientCache";
import {
  createChart, LineSeries, AreaSeries,
  type IChartApi, type ISeriesApi,
} from "lightweight-charts";

// ── Code-split heavy tab sub-views (ssr:false — client-only, chart/canvas heavy) ──
// Each tab is lazy-loaded on first visit; subsequent switches are instant (keep-alive).
function TabSkeleton() {
  return <div className="fin-empty" role="status" style={{ color: "var(--muted)" }}>Loading…</div>;
}
const FlowDeskView = dynamic(
  () => import("@/components/flowdesk/FlowDeskView").then((m) => ({ default: m.FlowDeskView })),
  { ssr: false, loading: () => <TabSkeleton /> },
);
const GexDeskView = dynamic(
  () => import("@/components/gexdesk/GexDeskView").then((m) => ({ default: m.GexDeskView })),
  { ssr: false, loading: () => <TabSkeleton /> },
);
const PrismView = dynamic(
  () => import("@/components/prism/PrismView").then((m) => ({ default: m.PrismView })),
  { ssr: false, loading: () => <TabSkeleton /> },
);
const ProphetView = dynamic(
  () => import("@/components/prophet/ProphetView").then((m) => ({ default: m.ProphetView })),
  { ssr: false, loading: () => <TabSkeleton /> },
);

// ─── Tab definition ─────────────────────────────────────────────────────────

type TabKey = "prophet" | "desk" | "tape" | "tide" | "tickers" | "screener" | "vol" | "gex" | "prism" | "leaders";

const TABS: { key: TabKey; enKey: string; zhKey: string }[] = [
  { key: "prophet",  enKey: "tabProphet",  zhKey: "tabProphet" },
  { key: "desk",     enKey: "tabDesk",     zhKey: "tabDesk" },
  { key: "tape",     enKey: "tabTape",     zhKey: "tabTape" },
  { key: "tide",     enKey: "tabTide",     zhKey: "tabTide" },
  { key: "tickers",  enKey: "tabTickers",  zhKey: "tabTickers" },
  { key: "screener", enKey: "tabScreener", zhKey: "tabScreener" },
  // "vol" tab removed from bar — vol surface now lives in the Tickers tab right column
  { key: "gex",      enKey: "tabGex",      zhKey: "tabGex" },
  { key: "prism",    enKey: "tabPrism",    zhKey: "tabPrism" },
  { key: "leaders",  enKey: "tabLeaders",  zhKey: "tabLeaders" },
];

// ─── Types from feed contract ────────────────────────────────────────────────

type DteBucket = "0d" | "1_7d" | "8_30d" | "31_90d" | "90p";
type MnyBucket = "itm" | "atm" | "near_otm" | "far_otm";
type Side = "~buy" | "~sell" | "mixed";

interface FlowEvent {
  id: string; ts: string; root: string; group: string; group_zh: string;
  right: "C" | "P"; exp: string; strike: number; dte: number;
  dte_bucket: DteBucket; mny_bucket: MnyBucket; side: Side;
  n_prints: number; size: number; avg_price: number; premium: number;
  premium_z: number | null; baseline_source: string; vol_gt_oi: boolean | null;
  repeated: boolean; zerodte: boolean; signing_source: string;
  swept?: boolean;
}

interface UnusualName {
  root: string; group: string; group_zh: string;
  gross_premium_today: number; prem_z: number | null; baseline_source: string;
  n_obs: number; call_prem_share: number;
  top_contracts: { right: "C" | "P"; exp: string; strike: number; premium: number }[];
}

interface HeatGroup {
  group: string; group_zh: string; gross_premium: number;
  net_signed_premium_soft: number; call_prem_share: number; n_events: number;
  top: { root: string; premium: number }[];
}

interface FeedPayload {
  schema?: string; asof: string; session_date?: string; session_pct?: number;
  baseline_note?: { en: string; zh: string };
  events: FlowEvent[]; unusual_names: UnusualName[]; stale?: boolean;
}

interface HeatPayload {
  schema?: string; asof: string; groups: HeatGroup[]; stale?: boolean;
}

// Tide types
interface TideMinute { t: string; ncp: number; npp: number; gross: number; vol: number }
interface SpyPoint { t: string; px: number }
interface SectorTide {
  group: string; group_zh: string; ncp: number; npp: number; gross: number;
  minutes: { t: string; ncp: number; npp: number }[];
}
interface ImpactName { root: string; net_prem_soft: number; gross: number }
interface TidePayload {
  schema?: string; asof: string; session_date?: string;
  minutes: TideMinute[]; spy: SpyPoint[];
  sectors: SectorTide[]; top_net_impact: ImpactName[];
}

// DTE Tide
type DteMinute = { t: string; ncp: number; npp: number };
interface DteTidePayload {
  schema?: string; asof: string;
  buckets: Record<DteBucket, DteMinute[]>;
}

// Ticker drill
interface TickerMinute { t: string; ncp: number; npp: number; vol: number }
interface StrikeRow { strike: number; call_prem: number; put_prem: number; vol: number }
interface ExpiryRow { exp: string; call_prem: number; put_prem: number; vol: number }
interface TopContract {
  right: "C" | "P"; exp: string; strike: number; premium: number;
  vol: number; vol_gt_oi: boolean | null;
}
interface TickerPayload {
  schema?: string; asof: string; root: string; group: string; group_zh: string;
  day: {
    gross: number; net_soft: number; call_share: number; n_events: number;
    prem_z: number | null; baseline_source: string | null;
  };
  minutes: TickerMinute[]; strikes: StrikeRow[];
  expiries: ExpiryRow[]; top_contracts: TopContract[];
}

// ─── Screener types ──────────────────────────────────────────────────────────
interface OiMover {
  root: string; right: "C" | "P"; exp: string; strike: number;
  oi: number; oi_prev: number; d_oi: number; mid: number | null;
}
interface OiMoversPayload {
  schema?: string; asof: string; movers: OiMover[];
  coverage?: { n_days: number; universe_note?: string };
}
interface HotContract {
  root: string; right: "C" | "P"; exp: string; strike: number;
  premium: number; vol: number; oi_prev: number | null; vol_gt_oi: boolean | null; close: number;
}
interface HotPayload {
  schema?: string; asof: string;
  by_premium: HotContract[]; by_volume: HotContract[];
  coverage?: { n_days: number; universe_note?: string };
}

// ─── Vol types ───────────────────────────────────────────────────────────────
interface VolTerm { dte: number; exp: string; atm_iv: number }
interface VolSmilePoint { strike: number; call_iv: number; put_iv: number }
interface VolSmileExp { exp: string; points: VolSmilePoint[] }
interface VolHistPoint { date: string; iv_rank: number | null; atm_iv: number; close: number }
interface VolPayload {
  schema?: string; asof: string; root: string;
  iv_rank_252: number | null; atm_iv: number;
  iv_52w_hi: number; iv_52w_lo: number;
  rv20: number; vrp: number;
  spot_ref?: number;
  term: VolTerm[]; smile: VolSmileExp[]; history: VolHistPoint[];
  coverage: { n_days: number; since: string };
  /** Full-history rank fields — optional, absent on old payloads */
  iv_rank_all?: number | null;
  coverage_days_all?: number;
  since_all?: string;
}

// ─── GEX types ───────────────────────────────────────────────────────────────
interface GexStrikeRow {
  strike: number;
  gamma_net: number; gamma_call: number; gamma_put: number;
  delta_net: number; vanna_net: number; charm_net: number;
}
interface GexExpiryRow { exp: string; gamma_net: number; delta_net: number }
interface GexHistRow {
  date: string; net_gex_bn: number; gamma_flip: number | null;
  call_wall: number | null; put_wall: number | null; regime: string;
}
interface GexPayload {
  schema?: string; asof: string; root: string;
  spot_ref: number; net_gex_bn: number;
  gamma_flip: number | null; call_wall: number | null; put_wall: number | null;
  by_strike: GexStrikeRow[]; by_expiry: GexExpiryRow[];
  convention: string;
  /** Superset coverage shape: new payloads carry n_days+since; old payloads carry n_contracts+oi_date */
  coverage: {
    n_days?: number; since?: string;
    n_contracts?: number; oi_date?: string;
  };
  by_strike_full_n?: number;
  /** Last 30 sessions of GEX summary — optional, absent on old payloads */
  history?: GexHistRow[];
}

// ─── Leaders types ────────────────────────────────────────────────────────────
interface LeaderDeEscalation {
  earnings_window: boolean | null;
  vol_trade: boolean | null;
  protective_put: boolean | null;
  gamma_caution: boolean;
}

interface LeaderRow {
  ticker: string;
  as_of: string;
  signing_source: string;
  signing_note: string;
  recurrence_count: number | null;
  net_prem_norm_abs: number | null;
  days_since_inflection: number | null;
  flow_z: number | null;
  ts_breadth_count: number | null;
  zerodte_dominated: boolean;
  oi_confirmed: boolean;
  // Board A legs (tri-state: true=pass, false=fail, null=not scored)
  A1_flow_recur: boolean | null;
  A2_flow_z_hot: boolean | null;
  A3_oi_confirmed: boolean;
  A4_ts_breadth: boolean | null;
  A5_price_leader: boolean | null;
  A6_near_high: boolean | null;
  A7_vol_confirm: boolean | null;
  A8_not_trap: boolean | null;
  K_a: number;
  n_avail_a: number;
  // Board B legs
  B1_washout_recent: boolean | null;
  B2_oversold_osc: boolean | null;
  B3_turn_organ: boolean | null;
  B4_htf_cross_near: boolean | null;
  B5_flow_inflect: boolean | null;
  B6_oi_confirmed: boolean;
  B7_vol_confirm: boolean | null;
  B8_not_trap: boolean | null;
  K_b: number;
  n_avail_b: number;
  fire_a: boolean;
  fire_b: boolean;
  // Extra context
  stair_step_leader: boolean | null;
  failed_breakout_trap: boolean | null;
  mtf_upturn_state: string | null;
  gamma_regime: string;
  days_to_earnings: number | null;
  trailing_pe: number | null;
  mktcap_bn: number | null;
  rs_1m: number | null;
  high52w_prox: number | null;
  rel_volume: number | null;
  de_escalation: LeaderDeEscalation;
  // HTF oscillators
  stochrsi_2w_k: number | null;
  stochrsi_2w_d: number | null;
  stochrsi_2w_oversold: boolean | null;
  macd_2w_state: string | null;
  macd_2w_bars_to_cross: number | null;
  macd_2w_bars_since: number | null;
  htf_coverage: boolean;
}

interface LeadersColdStart {
  message?: string;
  required_for_recurrence?: number;
}

interface LeadersPayload {
  schema: string;
  as_of: string;
  stale: boolean;
  cold_start: boolean;
  cold_start_detail?: LeadersColdStart;
  direction_note?: string;
  coverage: {
    n_universe: number;
    n_flow_sessions: number;
    flow_z_live: boolean;
    tape_names: string[];
    n_etfs: number;
  };
  board_a: LeaderRow[];
  board_b: LeaderRow[];
  board_a_total: number;
}

// ─── Hub context types ────────────────────────────────────────────────────────
interface IndexGexEntry {
  regime: string; net_gex_bn: number;
  gamma_flip: number | null; dist_to_flip_pct: number | null;
}
interface CtxPayload {
  schema?: string; asof?: string;
  index_gex?: Record<string, IndexGexEntry>;
  fear_greed?: { dial: number; label_en: string; label_zh: string };
  sector_etf_flows?: Record<string, { d1: number; w1: number }>;
}

// ─── Ticker context types ─────────────────────────────────────────────────────
interface TctxPayload {
  asof?: string; history_n?: number;
  z?: {
    net_signed_premium_z252: number | null;
    zerodte_share_z252: number | null;
    short_dated_otm_call_share_z252: number | null;
    vol_gt_oi_share_z252: number | null;
    block_share_z252: number | null;
  };
}

// ─── OI-confirmed types ───────────────────────────────────────────────────────
interface OiConfEntry {
  root: string; right: "C" | "P"; exp: string; strike: number;
  prev_premium: number; delta_oi: number;
}
type OiConfPayload = OiConfEntry[];

// ─── Formatting helpers ──────────────────────────────────────────────────────

function fmtPremium(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtPremSigned(n: number): string {
  const s = n >= 0 ? "+" : "";
  return `${s}${fmtPremium(Math.abs(n))}`;
}

function fmtTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/New_York" });
  } catch { return iso.slice(11, 16); }
}

function fmtAsof(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: "America/New_York" });
  } catch { return iso; }
}

function isStale(iso: string): boolean {
  try { return Date.now() - new Date(iso).getTime() > 10 * 60 * 1000; } catch { return false; }
}

// Approx US regular-hours check in America/New_York (holidays not handled — used
// only to choose feed-status tone: an empty/stale tape during RTH means the live
// feed is stalled; outside RTH it's the expected intraday-only gap, not a fault).
function isUsMarketHoursNow(): boolean {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York", weekday: "short",
      hour: "2-digit", minute: "2-digit", hour12: false,
    }).formatToParts(new Date());
    const wd = parts.find((p) => p.type === "weekday")?.value ?? "";
    if (wd === "Sat" || wd === "Sun") return false;
    const hh = Number(parts.find((p) => p.type === "hour")?.value ?? "0") % 24;
    const mm = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
    const mins = hh * 60 + mm;
    return mins >= 9 * 60 + 30 && mins < 16 * 60;
  } catch { return false; }
}

function fmtContract(right: "C" | "P", exp: string, strike: number): string {
  const month = exp.slice(5, 7); const day = exp.slice(8, 10);
  return `${strike}${right} ${month}/${day}`;
}

function netToneGlyph(net: number): string {
  if (net > 0) return "~▲"; if (net < 0) return "~▼"; return "·";
}

/**
 * US-Eastern UTC offset (in hours, negative) for a given YYYY-MM-DD date.
 * DST-aware — computes the actual America/New_York offset via Intl instead of
 * hardcoding -04:00. Returns "-04:00" (EDT) or "-05:00" (EST) as a fixed-offset
 * suffix usable in an ISO timestamp string.
 */
function etOffsetSuffix(sessionDate: string): string {
  try {
    // Noon on the session date sidesteps DST-boundary edge cases at midnight.
    const noonUtc = new Date(`${sessionDate}T12:00:00Z`);
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York", hour12: false, timeZoneName: "shortOffset",
    }).formatToParts(noonUtc);
    const tzName = parts.find((p) => p.type === "timeZoneName")?.value ?? "";
    // tzName looks like "GMT-4" / "GMT-5"; normalize to "-0H:00".
    const m = tzName.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/);
    if (m) {
      const sign = m[1];
      const hh = m[2].padStart(2, "0");
      const mm = m[3] ?? "00";
      return `${sign}${hh}:${mm}`;
    }
  } catch {}
  return "-04:00"; // EDT fallback
}

// ─── Constants ───────────────────────────────────────────────────────────────

const PREM_FILTERS = [
  { label: "$100K", value: 100_000 }, { label: "$250K", value: 250_000 },
  { label: "$500K", value: 500_000 }, { label: "$1M", value: 1_000_000 },
  { label: "$5M", value: 5_000_000 },
];

const DTE_BUCKETS: { key: DteBucket; en: string; zh: string }[] = [
  { key: "0d", en: "0DTE", zh: "当日" }, { key: "1_7d", en: "1–7d", zh: "1–7天" },
  { key: "8_30d", en: "8–30d", zh: "8–30天" }, { key: "31_90d", en: "31–90d", zh: "31–90天" },
  { key: "90p", en: "90d+", zh: "90天+" },
];

const MNY_BUCKETS: { key: MnyBucket; en: string; zh: string }[] = [
  { key: "itm", en: "ITM", zh: "实值" }, { key: "atm", en: "ATM", zh: "平值" },
  { key: "near_otm", en: "Near OTM", zh: "近虚值" }, { key: "far_otm", en: "Far OTM", zh: "深虚值" },
];

const DTE_LABELS: Record<DteBucket, { en: string; zh: string }> = {
  "0d": { en: "0DTE", zh: "当日" },
  "1_7d": { en: "1–7d", zh: "1–7天" },
  "8_30d": { en: "8–30d", zh: "8–30天" },
  "31_90d": { en: "31–90d", zh: "31–90天" },
  "90p": { en: "90d+", zh: "90天+" },
};

// Presets: filter-state setters labeled as saved views.
type PresetKey = "large_buys" | "repeat" | "zerodte" | "puts_strength";
interface Preset {
  key: PresetKey; labelKey: string;
  apply: (set: FilterSetters) => void;
}
interface FilterSetters {
  setMinPrem: (v: number) => void;
  setDteBuckets: (v: Set<DteBucket>) => void;
  setMnyBuckets: (v: Set<MnyBucket>) => void;
  setSideFilter: (v: string) => void;
  setFlagFilter: (v: string) => void;
}
const PRESETS: Preset[] = [
  {
    key: "large_buys", labelKey: "presetLargeBuys",
    apply: ({ setMinPrem, setSideFilter, setDteBuckets, setMnyBuckets, setFlagFilter }) => {
      setMinPrem(1_000_000); setSideFilter("~buy");
      setDteBuckets(new Set()); setMnyBuckets(new Set()); setFlagFilter("");
    },
  },
  {
    key: "repeat", labelKey: "presetRepeat",
    apply: ({ setMinPrem, setSideFilter, setDteBuckets, setMnyBuckets, setFlagFilter }) => {
      setMinPrem(0); setSideFilter(""); setDteBuckets(new Set()); setMnyBuckets(new Set()); setFlagFilter("repeated");
    },
  },
  {
    key: "zerodte", labelKey: "preset0DTE",
    apply: ({ setMinPrem, setSideFilter, setDteBuckets, setMnyBuckets, setFlagFilter }) => {
      setMinPrem(0); setSideFilter(""); setDteBuckets(new Set(["0d"])); setMnyBuckets(new Set()); setFlagFilter("");
    },
  },
  {
    key: "puts_strength", labelKey: "presetPutsOnStrength",
    apply: ({ setMinPrem, setSideFilter, setDteBuckets, setMnyBuckets, setFlagFilter }) => {
      setMinPrem(0); setSideFilter("~buy"); setDteBuckets(new Set()); setMnyBuckets(new Set()); setFlagFilter("put_buy");
    },
  },
];

// ─── Small LWC chart wrapper (area series for NCP/NPP) ──────────────────────

function css(n: string): string {
  if (typeof document === "undefined") return "#888";
  return getComputedStyle(document.documentElement).getPropertyValue(n).trim();
}

interface TideChartProps {
  minutes: TideMinute[];
  spy: SpyPoint[];
  height: number;
  sessionDate?: string;
}

const TideChart = memo(function TideChart({ minutes, spy, height, sessionDate }: TideChartProps) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const ncpRef = useRef<ISeriesApi<"Area"> | null>(null);
  const nppRef = useRef<ISeriesApi<"Area"> | null>(null);
  const spyRef = useRef<ISeriesApi<"Line"> | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Unique x-axis: use integer index mapped to time string for intraday minute series
    // LWC v5 requires time in ascending order with no duplicates.
    const validMins = minutes.filter(
      (m, i, arr) => i === 0 || m.t !== arr[i - 1].t
    );
    if (validMins.length < 2) return;

    // Convert "HH:MM" to seconds-from-epoch for LWC. Anchor to the payload's
    // session_date with the DST-aware US-Eastern offset for that date.
    const date = sessionDate || new Date().toISOString().slice(0, 10);
    const etOff = etOffsetSuffix(date);
    const toTs = (hhmm: string) => {
      const [hh, mm] = hhmm.split(":").map(Number);
      return Math.floor(new Date(`${date}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00${etOff}`).getTime() / 1000);
    };

    const upColor = css("--up");
    const downColor = css("--down");
    const gridColor = css("--grid");
    const lineColor = css("--line");
    const textColor = css("--muted");
    const panel3 = css("--panel-3");
    const warnColor = css("--warn");

    if (chartRef.current) {
      try { chartRef.current.remove(); } catch {}
    }

    const chart = createChart(el, {
      width: el.clientWidth || 700,
      height: height,
      layout: {
        background: { color: "transparent" },
        textColor,
        fontSize: 10,
        attributionLogo: false,
      },
      grid: { vertLines: { color: gridColor }, horzLines: { color: gridColor } },
      crosshair: {
        vertLine: { color: "rgba(214,218,227,.3)", labelBackgroundColor: panel3 },
        horzLine: { color: "rgba(214,218,227,.3)", labelBackgroundColor: panel3 },
      },
      rightPriceScale: { borderColor: lineColor, scaleMargins: { top: 0.05, bottom: 0.05 } },
      timeScale: { borderColor: lineColor, timeVisible: true, secondsVisible: false },
    });
    chartRef.current = chart;

    const ncpData = validMins.map((m) => ({ time: toTs(m.t) as any, value: m.ncp / 1_000_000 }));
    const nppData = validMins.map((m) => ({ time: toTs(m.t) as any, value: m.npp / 1_000_000 }));

    const ncpS = chart.addSeries(AreaSeries, {
      lineColor: upColor,
      topColor: `${upColor}40`,
      bottomColor: `${upColor}05`,
      lineWidth: 1.5 as any,
      priceLineVisible: false,
      lastValueVisible: true,
      title: "NCP",
    });
    ncpS.setData(ncpData);
    ncpRef.current = ncpS;

    const nppS = chart.addSeries(AreaSeries, {
      lineColor: downColor,
      topColor: `${downColor}05`,
      bottomColor: `${downColor}30`,
      lineWidth: 1.5 as any,
      priceLineVisible: false,
      lastValueVisible: true,
      title: "NPP",
      invertFilledArea: true,
    });
    nppS.setData(nppData);
    nppRef.current = nppS;

    // SPY overlay on separate scale if provided
    if (spy.length > 0) {
      const spyData = spy
        .filter((s, i, arr) => i === 0 || s.t !== arr[i - 1].t)
        .map((s) => ({ time: toTs(s.t) as any, value: s.px }));
      const spyS = chart.addSeries(LineSeries, {
        color: warnColor,
        lineWidth: 1,
        priceScaleId: "spy",
        priceLineVisible: false,
        lastValueVisible: true,
        title: "SPY",
      });
      spyS.setData(spyData);
      chart.priceScale("spy").applyOptions({
        scaleMargins: { top: 0.7, bottom: 0.02 },
        borderColor: "transparent",
      });
      spyRef.current = spyS;
    }

    chart.timeScale().fitContent();

    const ro = new ResizeObserver(() => {
      if (el && chartRef.current) {
        chartRef.current.applyOptions({ width: el.clientWidth });
      }
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      try { chart.remove(); } catch {}
      chartRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minutes, spy, height, sessionDate]);

  return <div ref={ref} style={{ width: "100%", height }} />;
});

// ─── Sparkline SVG (sector mini-chart) ──────────────────────────────────────

const Sparkline = memo(function Sparkline({ data, color, width = 80, height = 30 }: {
  data: number[]; color: string; width?: number; height?: number;
}) {
  if (data.length < 2) return <span style={{ display: "inline-block", width, height }} />;
  const mn = Math.min(...data); const mx = Math.max(...data);
  const range = mx - mn || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - mn) / range) * (height - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} style={{ display: "block" }}>
      <polyline fill="none" stroke={color} strokeWidth="1.5" points={pts} />
    </svg>
  );
});

// ─── Method note popover ─────────────────────────────────────────────────────

function MethodNotePopover({ lang, t }: { lang: string; t: (k: string, fb?: string) => string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);
  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button
        className="chip"
        style={{ height: 24, fontSize: 11, gap: 4 }}
        onClick={() => setOpen((v) => !v)}
      >
        ℹ {t("tideMethodNote", "Method note")}
      </button>
      {open && (
        <div
          className="pop show"
          style={{
            top: "calc(100% + 6px)", left: 0, minWidth: 320, maxWidth: 400,
            padding: "12px 14px", fontSize: 12, lineHeight: 1.6, color: "var(--text-2)",
          }}
        >
          {t("tideMethodText", "")}
        </div>
      )}
    </div>
  );
}

// ─── Strike ladder SVG ───────────────────────────────────────────────────────

const StrikeLadder = memo(function StrikeLadder({ strikes, lang, spotRef }: { strikes: StrikeRow[]; lang: string; spotRef: number | null }) {
  const zh = lang === "zh";
  const ROW_H = 24;
  const LADDER_COLS = "52px 1fr 60px 1fr 52px";
  const [wide, setWide] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const sorted = useMemo(() => [...strikes].sort((a, b) => a.strike - b.strike), [strikes]);

  // ATM: exact spot when available, else premium-weighted mean strike.
  const spotExact = !!(spotRef && spotRef > 0);
  const atm = useMemo(() => {
    if (spotExact) return spotRef as number;
    if (!sorted.length) return 0;
    let num = 0, den = 0;
    for (const s of sorted) { const w = s.call_prem + s.put_prem; num += s.strike * w; den += w; }
    return den > 0 ? num / den : sorted[Math.floor(sorted.length / 2)].strike;
  }, [sorted, spotExact, spotRef]);

  // Global markers over ALL strikes.
  const callWall = useMemo(() => sorted.length ? sorted.reduce((m, s) => s.call_prem > m.call_prem ? s : m).strike : null, [sorted]);
  const putWall = useMemo(() => sorted.length ? sorted.reduce((m, s) => s.put_prem > m.put_prem ? s : m).strike : null, [sorted]);
  const totalCall = useMemo(() => sorted.reduce((a, s) => a + s.call_prem, 0), [sorted]);
  const totalPut = useMemo(() => sorted.reduce((a, s) => a + s.put_prem, 0), [sorted]);
  // Premium-weighted "max pain": strike minimising aggregate holder loss (premium as notional proxy).
  const maxPain = useMemo(() => {
    if (sorted.length < 3) return null;
    let best = sorted[0].strike, bestPain = Infinity;
    for (const cand of sorted) {
      let pain = 0;
      for (const s of sorted) {
        if (s.strike < cand.strike) pain += s.call_prem * (cand.strike - s.strike);
        else if (s.strike > cand.strike) pain += s.put_prem * (s.strike - cand.strike);
      }
      if (pain < bestPain) { bestPain = pain; best = cand.strike; }
    }
    return best;
  }, [sorted]);

  // Near window ±18% of ATM (fall back to full list if too sparse).
  const rows = useMemo(() => {
    if (wide || !atm) return sorted;
    const lo = atm * 0.82, hi = atm * 1.18;
    const w = sorted.filter((s) => s.strike >= lo && s.strike <= hi);
    return w.length >= 5 ? w : sorted;
  }, [sorted, wide, atm]);

  const maxVal = useMemo(() => Math.max(...rows.flatMap((s) => [s.call_prem, s.put_prem]), 1), [rows]);
  // Power-curve width so mid strikes stay visible next to the single premium wall.
  const barPct = (v: number) => (v <= 0 ? 0 : Math.max(2, Math.pow(v / maxVal, 0.6) * 100));
  const raw = (v: number) => (v <= 0 ? 0 : v / maxVal);

  const spotStrike = useMemo(() => (
    rows.length ? rows.reduce((c, s) => Math.abs(s.strike - atm) < Math.abs(c.strike - atm) ? s : c).strike : null
  ), [rows, atm]);

  // Auto-centre the ATM row on load / window change.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || spotStrike == null) return;
    const idx = rows.findIndex((s) => s.strike === spotStrike);
    if (idx < 0) return;
    el.scrollTop = Math.max(0, idx * ROW_H - el.clientHeight / 2 + ROW_H / 2);
  }, [rows, spotStrike]);

  if (!sorted.length) return null;

  const inspect = sorted.find((s) => s.strike === (hover ?? spotStrike)) ?? null;
  const moneyness = (k: number) => (atm ? ((k - atm) / atm) * 100 : 0);
  const fmtMoney = (k: number) => { const m = moneyness(k); return `${m >= 0 ? "+" : ""}${m.toFixed(1)}%`; };

  const Chip = ({ label, val, color }: { label: string; val: string; color: string }) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
      <span style={{ fontSize: 8.5, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".05em" }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 700, color, fontVariantNumeric: "tabular-nums" }}>{val}</span>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {/* Summary chips */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 14, flexWrap: "wrap" }}>
        <Chip label={spotExact ? (zh ? "现价" : "Spot") : (zh ? "约平值" : "ATM≈")} val={atm ? `$${atm.toFixed(atm < 50 ? 2 : 0)}` : "—"} color="var(--warn)" />
        {callWall != null && <Chip label={zh ? "认购墙" : "Call Wall"} val={`$${callWall}`} color="var(--up)" />}
        {putWall != null && <Chip label={zh ? "认沽墙" : "Put Wall"} val={`$${putWall}`} color="var(--down)" />}
        {maxPain != null && <Chip label={zh ? "最大痛点" : "Max Pain"} val={`$${maxPain}`} color="var(--text-2)" />}
        <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ fontSize: 10, color: "var(--muted)" }}>{rows.length}{rows.length !== sorted.length ? `/${sorted.length}` : ""}</span>
          <button className={`chip${!wide ? " on" : ""}`} style={{ height: 22, fontSize: 10 }} onClick={() => setWide(false)}>{zh ? "近档" : "Near"}</button>
          <button className={`chip${wide ? " on" : ""}`} style={{ height: 22, fontSize: 10 }} onClick={() => setWide(true)}>{zh ? "全档" : "All"}</button>
        </div>
      </div>

      {/* Inspector strip — hovered row, or spot when idle */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 11, minHeight: 18, color: "var(--text-2)", fontVariantNumeric: "tabular-nums" }}>
        {inspect ? (
          <>
            <span style={{ fontWeight: 700, color: "var(--text)" }}>${inspect.strike}</span>
            <span style={{ color: "var(--muted)" }}>{fmtMoney(inspect.strike)}</span>
            <span style={{ color: "var(--up)" }}>{zh ? "认购" : "C"} {fmtPremium(inspect.call_prem)}</span>
            <span style={{ color: "var(--down)" }}>{zh ? "认沽" : "P"} {fmtPremium(inspect.put_prem)}</span>
            <span style={{ color: "var(--muted)" }}>{zh ? "量" : "Vol"} {inspect.vol.toLocaleString("en-US")}</span>
          </>
        ) : <span style={{ color: "var(--muted)" }}>{zh ? "悬停查看行权价明细" : "Hover a strike for detail"}</span>}
      </div>

      {/* Column header — 5-col montage: [call $] [call bar] [strike] [put bar] [put $] */}
      <div style={{ display: "grid", gridTemplateColumns: LADDER_COLS, fontSize: 9.5, textTransform: "uppercase", letterSpacing: ".05em", color: "var(--muted)", padding: "0 2px", alignItems: "center" }}>
        <span />
        <span style={{ textAlign: "right", color: "var(--up)", fontWeight: 600, paddingRight: 4 }}>{zh ? "认购$" : "Call $"}</span>
        <span style={{ textAlign: "center" }}>{zh ? "行权价" : "Strike"}</span>
        <span style={{ textAlign: "left", color: "var(--down)", fontWeight: 600, paddingLeft: 4 }}>{zh ? "认沽$" : "Put $"}</span>
        <span />
      </div>

      {/* Ladder */}
      <div ref={scrollRef} className="obs-scroll" style={{ maxHeight: 440, overflowY: "auto", position: "relative" }}
        onMouseLeave={() => setHover(null)}>
        {rows.map((s) => {
          const isSpot = s.strike === spotStrike;
          const isCallWall = s.strike === callWall;
          const isPutWall = s.strike === putWall;
          const isPain = s.strike === maxPain;
          const cRaw = raw(s.call_prem), pRaw = raw(s.put_prem);
          const isHover = hover === s.strike;
          return (
            <div key={s.strike}
              onMouseEnter={() => setHover(s.strike)}
              style={{
                display: "grid", gridTemplateColumns: LADDER_COLS, alignItems: "center",
                height: ROW_H,
                background: isHover ? "var(--panel-2)" : isSpot ? "rgba(245,177,63,.07)" : "transparent",
                borderTop: isSpot ? "1px solid rgba(245,177,63,.35)" : "1px solid transparent",
                borderBottom: isSpot ? "1px solid rgba(245,177,63,.35)" : "1px solid transparent",
                transition: "background .12s ease",
              }}>
              {/* Call premium value */}
              <span style={{ fontSize: 9, color: "var(--up)", opacity: .85, textAlign: "right", paddingRight: 5, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", overflow: "hidden" }}>
                {s.call_prem > 0 ? fmtPremium(s.call_prem) : ""}
              </span>
              {/* Call bar track (grows left toward strike) */}
              <div style={{ display: "flex", justifyContent: "flex-end", overflow: "hidden" }}>
                <div style={{
                  width: `${barPct(s.call_prem)}%`, height: 12, borderRadius: "3px 0 0 3px", flexShrink: 0,
                  background: `linear-gradient(90deg, rgba(38,194,129,${(0.10 + 0.28 * cRaw).toFixed(3)}) 0%, rgba(38,194,129,${(0.4 + 0.5 * cRaw).toFixed(3)}) 100%)`,
                  boxShadow: isCallWall ? "inset 0 0 0 1px var(--up)" : "none",
                }} />
              </div>
              {/* Strike */}
              <div style={{ textAlign: "center", position: "relative" }}>
                <span style={{
                  fontSize: 11, fontWeight: isSpot ? 700 : 500,
                  color: isSpot ? "var(--warn)" : "var(--text-2)", fontVariantNumeric: "tabular-nums",
                }}>{s.strike}</span>
                {(isCallWall || isPutWall || isPain) && (
                  <span style={{
                    position: "absolute", top: "50%", left: "calc(100% - 3px)", transform: "translateY(-50%)",
                    width: 5, height: 5, borderRadius: "50%",
                    background: isPain ? "var(--text-2)" : isCallWall ? "var(--up)" : "var(--down)",
                  }} />
                )}
              </div>
              {/* Put bar track (grows right from strike) */}
              <div style={{ display: "flex", justifyContent: "flex-start", overflow: "hidden" }}>
                <div style={{
                  width: `${barPct(s.put_prem)}%`, height: 12, borderRadius: "0 3px 3px 0", flexShrink: 0,
                  background: `linear-gradient(90deg, rgba(240,86,107,${(0.4 + 0.5 * pRaw).toFixed(3)}) 0%, rgba(240,86,107,${(0.10 + 0.28 * pRaw).toFixed(3)}) 100%)`,
                  boxShadow: isPutWall ? "inset 0 0 0 1px var(--down)" : "none",
                }} />
              </div>
              {/* Put premium value */}
              <span style={{ fontSize: 9, color: "var(--down)", opacity: .85, textAlign: "left", paddingLeft: 5, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", overflow: "hidden" }}>
                {s.put_prem > 0 ? fmtPremium(s.put_prem) : ""}
              </span>
            </div>
          );
        })}
      </div>

      {/* Totals footer — call/put premium share */}
      {(totalCall + totalPut) > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ display: "flex", height: 6, borderRadius: 3, overflow: "hidden", background: "var(--panel-2)" }}>
            <div style={{ width: `${(totalCall / (totalCall + totalPut)) * 100}%`, background: "var(--up)" }} />
            <div style={{ width: `${(totalPut / (totalCall + totalPut)) * 100}%`, background: "var(--down)" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, fontVariantNumeric: "tabular-nums" }}>
            <span style={{ color: "var(--up)" }}>{zh ? "认购" : "Calls"} {fmtPremium(totalCall)} · {((totalCall / (totalCall + totalPut)) * 100).toFixed(0)}%</span>
            <span style={{ color: "var(--down)" }}>{((totalPut / (totalCall + totalPut)) * 100).toFixed(0)}% · {fmtPremium(totalPut)} {zh ? "认沽" : "Puts"}</span>
          </div>
        </div>
      )}
    </div>
  );
});

// ─── Expiry horizontal bars ───────────────────────────────────────────────────

function ExpiryBars({ expiries, lang }: { expiries: ExpiryRow[]; lang: string }) {
  if (!expiries.length) return null;
  const maxVal = Math.max(...expiries.flatMap((e) => [e.call_prem, e.put_prem])) || 1;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {expiries.map((e) => {
        const cw = Math.round((e.call_prem / maxVal) * 100);
        const pw = Math.round((e.put_prem / maxVal) * 100);
        const expShort = e.exp.slice(5); // MM-DD
        return (
          <div key={e.exp} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}>
            <span style={{ color: "var(--text-2)", fontVariantNumeric: "tabular-nums", width: 56, flexShrink: 0 }}>
              {expShort}
            </span>
            <div style={{ flex: 1, display: "flex", gap: 3, alignItems: "center" }}>
              <div style={{ height: 8, width: `${cw}%`, background: "rgba(38,194,129,.4)", borderRadius: 2, minWidth: 1 }} />
              <div style={{ height: 8, width: `${pw}%`, background: "rgba(240,86,107,.35)", borderRadius: 2, minWidth: 1 }} />
            </div>
            <span style={{ color: "var(--muted)", width: 60, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
              {fmtPremium(e.call_prem + e.put_prem)}
            </span>
          </div>
        );
      })}
      <div style={{ display: "flex", gap: 16, fontSize: 10, color: "var(--muted)", marginTop: 4 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ display: "inline-block", width: 10, height: 6, background: "rgba(38,194,129,.4)", borderRadius: 1 }} />
          {lang === "zh" ? "认购" : "Call"}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ display: "inline-block", width: 10, height: 6, background: "rgba(240,86,107,.35)", borderRadius: 1 }} />
          {lang === "zh" ? "认沽" : "Put"}
        </span>
      </div>
    </div>
  );
}

// ─── Minute net-prem chart (ticker drill, inline SVG) ──────────────────────

const MinuteNetChart = memo(function MinuteNetChart({ minutes, height = 80 }: { minutes: TickerMinute[]; height?: number }) {
  if (!minutes || minutes.length < 2) return null;
  const vals = minutes.map((m) => (m.ncp + m.npp) / 1_000_000);
  const mn = Math.min(...vals, 0); const mx = Math.max(...vals, 0);
  const range = mx - mn || 1;
  const W = 100; // viewBox width
  const pt = (i: number) => {
    const x = (i / (vals.length - 1)) * W;
    const y = height - ((vals[i] - mn) / range) * (height - 4) - 2;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  };
  const pts = vals.map((_, i) => pt(i)).join(" ");
  const zeroY = height - ((-mn) / range) * (height - 4) - 2;
  return (
    <svg viewBox={`0 0 ${W} ${height}`} width="100%" height={height} preserveAspectRatio="none" style={{ display: "block" }}>
      <line x1="0" y1={zeroY} x2={W} y2={zeroY} stroke="var(--line)" strokeWidth="0.5" strokeDasharray="2,2" />
      <polyline fill="none" stroke="var(--brand-2)" strokeWidth="1.2" points={pts} />
    </svg>
  );
});

// ─── Term structure chart (ATM IV vs DTE, dots + line) ──────────────────────

const TermStructureChart = memo(function TermStructureChart({ term }: { term: VolTerm[] }) {
  if (term.length < 2) return null;
  const dtes = term.map((p) => p.dte);
  const ivs = term.map((p) => p.atm_iv);
  const minDte = Math.min(...dtes); const maxDte = Math.max(...dtes);
  const minIv = Math.min(...ivs) * 0.98; const maxIv = Math.max(...ivs) * 1.02;
  const W = 400; const H = 120;
  const PAD = { l: 40, r: 12, t: 8, b: 24 };
  const cx = (dte: number) => PAD.l + ((dte - minDte) / (maxDte - minDte)) * (W - PAD.l - PAD.r);
  const cy = (iv: number) => PAD.t + (1 - (iv - minIv) / (maxIv - minIv)) * (H - PAD.t - PAD.b);
  const pts = term.map((p) => `${cx(p.dte).toFixed(1)},${cy(p.atm_iv).toFixed(1)}`).join(" ");
  const nTicks = 4;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: "block", overflow: "visible" }}>
      {/* Y axis ticks */}
      {Array.from({ length: nTicks + 1 }, (_, i) => {
        const iv = minIv + (i / nTicks) * (maxIv - minIv);
        const y = cy(iv);
        return (
          <g key={i}>
            <line x1={PAD.l - 4} y1={y} x2={W - PAD.r} y2={y} stroke="var(--line)" strokeWidth="0.5" />
            <text x={PAD.l - 6} y={y + 3} textAnchor="end" fill="var(--muted)" fontSize={9}>{(iv * 100).toFixed(0)}%</text>
          </g>
        );
      })}
      {/* Line */}
      <polyline fill="none" stroke="var(--brand-2)" strokeWidth="1.5" points={pts} />
      {/* Dots + DTE labels */}
      {term.map((p) => {
        const x = cx(p.dte); const y = cy(p.atm_iv);
        return (
          <g key={p.exp}>
            <circle cx={x} cy={y} r={3} fill="var(--brand-2)" />
            <text x={x} y={H - 6} textAnchor="middle" fill="var(--text-dim)" fontSize={9}>{p.dte}d</text>
          </g>
        );
      })}
    </svg>
  );
});

// ─── Smile chart (call_iv / put_iv vs strike, spot_ref vertical line) ────────

const SmileChart = memo(function SmileChart({ points, spotRef }: { points: VolSmilePoint[]; spotRef: number | null }) {
  if (points.length < 2) return null;
  const strikes = points.map((p) => p.strike);
  const allIvs = points.flatMap((p) => [p.call_iv, p.put_iv]);
  const minS = Math.min(...strikes); const maxS = Math.max(...strikes);
  const minIv = Math.min(...allIvs) * 0.98; const maxIv = Math.max(...allIvs) * 1.02;
  const W = 400; const H = 100;
  const PAD = { l: 36, r: 8, t: 6, b: 20 };
  const cx = (s: number) => PAD.l + ((s - minS) / (maxS - minS)) * (W - PAD.l - PAD.r);
  const cy = (iv: number) => PAD.t + (1 - (iv - minIv) / (maxIv - minIv)) * (H - PAD.t - PAD.b);
  const callPts = points.map((p) => `${cx(p.strike).toFixed(1)},${cy(p.call_iv).toFixed(1)}`).join(" ");
  const putPts = points.map((p) => `${cx(p.strike).toFixed(1)},${cy(p.put_iv).toFixed(1)}`).join(" ");
  const nTicks = 3;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: "block", overflow: "visible" }}>
      {Array.from({ length: nTicks + 1 }, (_, i) => {
        const iv = minIv + (i / nTicks) * (maxIv - minIv);
        const y = cy(iv);
        return (
          <g key={i}>
            <line x1={PAD.l} y1={y} x2={W - PAD.r} y2={y} stroke="var(--line)" strokeWidth="0.5" />
            <text x={PAD.l - 4} y={y + 3} textAnchor="end" fill="var(--muted)" fontSize={9}>{(iv * 100).toFixed(0)}%</text>
          </g>
        );
      })}
      {/* Spot reference vertical line */}
      {spotRef != null && spotRef >= minS && spotRef <= maxS && (
        <line
          x1={cx(spotRef)} y1={PAD.t} x2={cx(spotRef)} y2={H - PAD.b}
          stroke="var(--warn)" strokeWidth="1" strokeDasharray="3,2"
        />
      )}
      {/* Call IV line */}
      <polyline fill="none" stroke="var(--up)" strokeWidth="1.5" points={callPts} />
      {/* Put IV dashed line */}
      <polyline fill="none" stroke="var(--down)" strokeWidth="1.5" strokeDasharray="4,2" points={putPts} />
      {/* Strike labels (every other) */}
      {points.filter((_, i) => i % 3 === 0).map((p) => (
        <text key={p.strike} x={cx(p.strike)} y={H - 4} textAnchor="middle" fill="var(--text-dim)" fontSize={9}>{p.strike}</text>
      ))}
    </svg>
  );
});

// ─── IV Rank history sparkline ────────────────────────────────────────────────

const IvRankHistory = memo(function IvRankHistory({ history }: { history: VolHistPoint[] }) {
  const withRank = history.filter((h) => h.iv_rank != null);
  if (withRank.length < 2) return null;
  const vals = withRank.map((h) => h.iv_rank as number);
  const mn = 0; const mx = 100;
  const W = 100; const H = 60;
  const pt = (i: number) => {
    const x = (i / (vals.length - 1)) * W;
    const y = H - ((vals[i] - mn) / (mx - mn)) * (H - 6) - 2;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  };
  const pts = vals.map((_, i) => pt(i)).join(" ");
  // 50-line reference
  const ref50y = H - ((50 - mn) / (mx - mn)) * (H - 6) - 2;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" style={{ display: "block" }}>
      <line x1="0" y1={ref50y} x2={W} y2={ref50y} stroke="var(--line)" strokeWidth="0.5" strokeDasharray="2,2" />
      <polyline fill="none" stroke="var(--brand-2)" strokeWidth="1.2" points={pts} />
      <circle cx={(vals.length - 1) / (vals.length - 1) * W} cy={pt(vals.length - 1).split(",")[1]} r={2.5} fill="var(--brand-2)" />
    </svg>
  );
});

// ─── GEX 30-session history sparkline strip ──────────────────────────────────

const GexHistSparkline = memo(function GexHistSparkline({ history }: { history: GexHistRow[] }) {
  if (history.length < 2) return null;
  const vals = history.map((h) => h.net_gex_bn);
  const mn = Math.min(...vals); const mx = Math.max(...vals);
  const range = (mx - mn) || 1;
  const W = 100; const H = 40;
  const zeroY = H - ((-mn) / range) * (H - 6) - 2;
  const pts = vals.map((v, i) => {
    const x = (i / (vals.length - 1)) * W;
    const y = H - ((v - mn) / range) * (H - 6) - 2;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(" ");
  const last = history[history.length - 1];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <svg viewBox={`0 0 ${W} ${H}`} width={180} height={H} preserveAspectRatio="none" style={{ display: "block", flexShrink: 0 }}>
        <line x1="0" y1={zeroY} x2={W} y2={zeroY} stroke="var(--line)" strokeWidth="0.5" strokeDasharray="2,2" />
        <polyline fill="none" stroke="var(--brand-2)" strokeWidth="1.2" points={pts} />
        <circle cx={W} cy={pts.split(" ").pop()!.split(",")[1]} r={2.5} fill="var(--brand-2)" />
      </svg>
      {last.gamma_flip != null && (
        <span style={{ fontSize: 10, color: "var(--warn)", fontVariantNumeric: "tabular-nums" }}>
          flip {last.gamma_flip.toFixed(1)}
        </span>
      )}
      {last.call_wall != null && (
        <span style={{ fontSize: 10, color: "var(--text-2)", fontVariantNumeric: "tabular-nums" }}>
          call {last.call_wall.toFixed(1)}
        </span>
      )}
      {last.put_wall != null && (
        <span style={{ fontSize: 10, color: "var(--text-2)", fontVariantNumeric: "tabular-nums" }}>
          put {last.put_wall.toFixed(1)}
        </span>
      )}
    </div>
  );
});

// ─── GEX strike ladder (horizontal bars, net + call/put split) ────────────────

type GreekKey = "gamma" | "delta" | "vanna" | "charm";

function getGreekValues(row: GexStrikeRow, greek: GreekKey): { net: number; call: number; put: number } {
  switch (greek) {
    case "gamma": return { net: row.gamma_net, call: row.gamma_call, put: row.gamma_put };
    case "delta": return { net: row.delta_net, call: row.delta_net > 0 ? row.delta_net : 0, put: row.delta_net < 0 ? row.delta_net : 0 };
    case "vanna": return { net: row.vanna_net, call: row.vanna_net > 0 ? row.vanna_net : 0, put: row.vanna_net < 0 ? row.vanna_net : 0 };
    case "charm": return { net: row.charm_net, call: row.charm_net > 0 ? row.charm_net : 0, put: row.charm_net < 0 ? row.charm_net : 0 };
  }
}

const GexStrikeLadder = memo(function GexStrikeLadder({ rows, greek, spotRef, gammaFlip, callWall, putWall, lang }: {
  rows: GexStrikeRow[];
  greek: GreekKey;
  spotRef: number;
  gammaFlip: number | null;
  callWall: number | null;
  putWall: number | null;
  lang: string;
}) {
  const [wideMode, setWideMode] = useState(false);

  // Empty state — render bilingual pending message instead of null
  if (!rows.length) {
    return (
      <div style={{ padding: "20px 0", textAlign: "center", color: "var(--muted)", fontSize: 12 }}>
        {lang === "zh"
          ? "该标的夜间数据待更新"
          : "Nightly data pending for this root"}
      </div>
    );
  }

  // Client-side windowing: Near = ±10% of spot_ref; Wide = full payload
  const displayRows = wideMode ? rows : windowGexRows(rows, spotRef, 0.10);
  // If the windowed view is empty (e.g. very OTM spot_ref), fall back to full
  const visibleRows = displayRows.length > 0 ? displayRows : rows;

  const netVals = visibleRows.map((r) => getGreekValues(r, greek).net);
  const maxAbs = Math.max(...netVals.map(Math.abs), 0.001);
  const BAR_MAX = 120;
  const ROW_H = 28;
  const H = visibleRows.length * ROW_H + 30;
  const MID = BAR_MAX + 60; // center x

  // Closest strike to spot — computed once for the whole set (not per-row).
  const spotStrike = visibleRows.reduce((closest, r) =>
    Math.abs(r.strike - spotRef) < Math.abs(closest.strike - spotRef) ? r : closest
  ).strike;

  return (
    <div>
      {/* Near / Wide toggle */}
      <div style={{ display: "flex", gap: 6, marginBottom: 8, alignItems: "center" }}>
        <button
          className={`chip${!wideMode ? " on" : ""}`}
          style={{ height: 22, fontSize: 10 }}
          onClick={() => setWideMode(false)}
        >
          {lang === "zh" ? "近档 ±10%" : "Near ±10%"}
        </button>
        <button
          className={`chip${wideMode ? " on" : ""}`}
          style={{ height: 22, fontSize: 10 }}
          onClick={() => setWideMode(true)}
        >
          {lang === "zh" ? "全档" : "Wide"}
        </button>
        <span style={{ fontSize: 10, color: "var(--muted)", marginLeft: 4 }}>
          {visibleRows.length}{rows.length !== visibleRows.length ? `/${rows.length}` : ""} rows
        </span>
      </div>

      {/* SVG ladder — always bounded + scrollable so tall row sets don't over-scale */}
      <div style={{ maxHeight: 420, overflowY: "auto" }}>
        <svg viewBox={`0 0 ${MID * 2} ${H}`} width="100%" height={H} preserveAspectRatio="xMinYMin meet" style={{ display: "block" }}>
          {/* Column headers — neutral colors (not up/down) */}
          <text x={MID - 4} y={14} textAnchor="end" fill="var(--text-2)" fontSize={10} fontWeight={600}>
            {lang === "zh" ? "正值" : "+pos"}
          </text>
          <text x={MID + 60 + 4} y={14} textAnchor="start" fill="var(--text-2)" fontSize={10} fontWeight={600}>
            {lang === "zh" ? "负值" : "-neg"}
          </text>
          <text x={MID + 30} y={14} textAnchor="middle" fill="var(--muted)" fontSize={10}>
            {lang === "zh" ? "行权价" : "Strike"}
          </text>

          {visibleRows.map((row, i) => {
            const { net, call, put } = getGreekValues(row, greek);
            const y = 22 + i * ROW_H;
            const netW = Math.abs(net) / maxAbs * BAR_MAX;
            const callW = Math.abs(greek === "gamma" ? call : Math.max(call, 0)) / maxAbs * BAR_MAX;
            const putW = Math.abs(greek === "gamma" ? put : Math.abs(Math.min(put, 0))) / maxAbs * BAR_MAX;
            const isPos = net >= 0;

            // Markers — these remain correct within the windowed domain
            const isFlip = gammaFlip != null && row.strike === gammaFlip;
            const isCallWall = callWall != null && row.strike === callWall;
            const isPutWall = putWall != null && row.strike === putWall;

            return (
              <g key={row.strike}>
                {/* Net bar */}
                {isPos ? (
                  <rect x={MID - netW} y={y + 3} width={netW} height={ROW_H - 10}
                    fill="rgba(38,194,129,.35)" rx={2} />
                ) : (
                  <rect x={MID + 60} y={y + 3} width={netW} height={ROW_H - 10}
                    fill="rgba(240,86,107,.3)" rx={2} />
                )}
                {/* Call overlay (gamma only — call split) */}
                {greek === "gamma" && call > 0 && (
                  <rect x={MID - callW} y={y + 3} width={callW} height={ROW_H - 10}
                    fill="rgba(38,194,129,.15)" rx={2} />
                )}
                {/* Put overlay (gamma only — put split, grows right from center) */}
                {greek === "gamma" && put < 0 && (
                  <rect x={MID + 60} y={y + 3} width={putW} height={ROW_H - 10}
                    fill="rgba(240,86,107,.12)" rx={2} />
                )}
                {/* Strike label */}
                <text x={MID + 30} y={y + ROW_H / 2 + 2} textAnchor="middle"
                  fill="var(--text-2)" fontSize={11} fontWeight={row.strike === Math.round(spotRef) ? 700 : 400}>
                  {row.strike}
                </text>
                {/* Spot ref line */}
                {row.strike === spotStrike && (
                  <line x1={0} y1={y + ROW_H - 1} x2={MID * 2} y2={y + ROW_H - 1}
                    stroke="var(--warn)" strokeWidth="1" strokeDasharray="3,2" opacity={0.6} />
                )}
                {/* Marker labels */}
                {isFlip && (
                  <text x={MID * 2 - 4} y={y + 14} textAnchor="end" fill="var(--warn)" fontSize={9} fontWeight={600}>
                    {lang === "zh" ? "伽马翻转" : "flip"}
                  </text>
                )}
                {isCallWall && (
                  <text x={MID * 2 - 4} y={y + 14} textAnchor="end" fill="var(--warn)" fontSize={9} fontWeight={600}>
                    {lang === "zh" ? "认购集中" : "call concentration"}
                  </text>
                )}
                {isPutWall && (
                  <text x={MID * 2 - 4} y={y + 14} textAnchor="end" fill="var(--warn)" fontSize={9} fontWeight={600}>
                    {lang === "zh" ? "认沽集中" : "put concentration"}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
});

// ─── GEX by-expiry bars ──────────────────────────────────────────────────────

const GexExpiryBars = memo(function GexExpiryBars({ rows, greek, lang }: { rows: GexExpiryRow[]; greek: GreekKey; lang: string }) {
  if (!rows.length) return null;
  const getVal = (r: GexExpiryRow) => greek === "delta" ? r.delta_net : r.gamma_net;
  const maxAbs = Math.max(...rows.map((r) => Math.abs(getVal(r))), 0.001);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {rows.map((r) => {
        const v = getVal(r);
        const w = Math.round((Math.abs(v) / maxAbs) * 100);
        const isPos = v >= 0;
        return (
          <div key={r.exp} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}>
            <span style={{ color: "var(--text-2)", fontVariantNumeric: "tabular-nums", width: 56, flexShrink: 0 }}>{r.exp.slice(5)}</span>
            <div style={{ flex: 1, height: 8, borderRadius: 4, background: "var(--panel-3)", overflow: "hidden" }}>
              <div style={{
                height: "100%", width: `${w}%`,
                background: isPos ? "rgba(38,194,129,.5)" : "rgba(240,86,107,.45)",
                borderRadius: 4,
              }} />
            </div>
            <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600, color: isPos ? "var(--up)" : "var(--down)", width: 64, textAlign: "right" }}>
              {isPos ? "+" : ""}{v.toFixed(3)}
            </span>
          </div>
        );
      })}
      <div style={{ display: "flex", gap: 16, fontSize: 10, color: "var(--muted)", marginTop: 4 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ display: "inline-block", width: 10, height: 6, background: "rgba(38,194,129,.5)", borderRadius: 1 }} />
          {lang === "zh" ? "正值（认购端）" : "Positive (call-side)"}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ display: "inline-block", width: 10, height: 6, background: "rgba(240,86,107,.45)", borderRadius: 1 }} />
          {lang === "zh" ? "负值（认沽端）" : "Negative (put-side)"}
        </span>
      </div>
    </div>
  );
});

// ─── Screener preset key ──────────────────────────────────────────────────────
type ScreenerPreset = "top_prem" | "unusual_z" | "fresh" | "doi" | "zerodte" | "hot";

// ─── Top-level component ─────────────────────────────────────────────────────

export default function OptionsHubView() {
  const { lang, setLang } = useLang();
  const t = useT();

  // ── Tab state from URL ?tab= ──────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<TabKey>("tape");
  // Track which tabs have been visited so they stay mounted (keep-alive pattern).
  const [visitedTabs, setVisitedTabs] = useState<Set<TabKey>>(() => new Set<TabKey>(["tape"]));

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab") as TabKey | null;
    if (tab && TABS.some((tb) => tb.key === tab)) {
      setActiveTab(tab);
      setVisitedTabs((prev) => { const next = new Set(prev); next.add(tab); return next; });
    }
  }, []);

  function switchTab(tab: TabKey) {
    setActiveTab(tab);
    setVisitedTabs((prev) => { const next = new Set(prev); next.add(tab); return next; });
    const u = new URL(window.location.href);
    u.searchParams.set("tab", tab);
    window.history.replaceState({}, "", u.toString());
  }

  // ── Shared fetch: feed + heat (Tape tab) ─────────────────────────────────
  const [feed, setFeed] = useState<FeedPayload | null>(null);
  const [heat, setHeat] = useState<HeatPayload | null>(null);
  const [lastFeedTs, setLastFeedTs] = useState<string>("");
  const [fetchError, setFetchError] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Guard: skip setFeed when asof is unchanged (avoids re-running events useMemo
  // on poll ticks that return the same payload).
  const lastTapeAsofRef = useRef<string | null>(null);

  const doFetch = useCallback(async () => {
    if (document.visibilityState === "hidden") return;
    try {
      // Invalidate before polling so the recurring 45s interval always fetches
      // fresh data. flowGet's stale-while-revalidate TTL is 25s — shorter than
      // the poll interval — so without invalidation every poll hits the stale
      // branch and returns the previous cycle's data (the background revalidation
      // updates the cache but never pushes to setFeed/setHeat).
      flowInvalidate("feed");
      flowInvalidate("heat");
      const [fj, hj] = await Promise.all([
        flowGet("feed"),
        flowGet("heat"),
      ]);
      if (fj) {
        const d = fj as FeedPayload;
        setFetchError(false);
        // Skip re-render when asof is unchanged (same payload redelivered on quiet tape).
        // Producer contract assumed: asof advances with every new event batch; if the
        // backend returns new events under an unchanged asof they will be silently dropped.
        if (!d.asof || d.asof !== lastTapeAsofRef.current) {
          lastTapeAsofRef.current = d.asof ?? null;
          setFeed(d); setLastFeedTs(d.asof);
        }
      } else { setFetchError(true); }
      if (hj) setHeat(hj as HeatPayload);
    } catch { setFetchError(true); }
  }, []);

  // ── Tide fetch ────────────────────────────────────────────────────────────
  const [tideData, setTideData] = useState<TidePayload | null>(null);
  const [dteTide, setDteTide] = useState<DteTidePayload | null>(null);
  const [tideLoading, setTideLoading] = useState(false);

  const fetchTide = useCallback(async () => {
    if (tideData) return; // already loaded
    setTideLoading(true);
    try {
      const [td, dd] = await Promise.all([
        flowGet("tide"),
        flowGet("dte"),
      ]);
      if (td) setTideData(td as TidePayload);
      if (dd) setDteTide(dd as DteTidePayload);
    } catch {}
    setTideLoading(false);
  }, [tideData]);

  // ── Ticker drill ─────────────────────────────────────────────────────────
  const [tickerSearch, setTickerSearch] = useState("");
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [tickerData, setTickerData] = useState<TickerPayload | null>(null);
  const [tickerLoading, setTickerLoading] = useState(false);

  const fetchTicker = useCallback(async (root: string) => {
    setTickerLoading(true); setTickerData(null);
    try {
      const d = await flowGet(`ticker:${root}`);
      if (d) setTickerData(d as TickerPayload);
    } catch {}
    setTickerLoading(false);
  }, []);

  // ── Filter state (Tape tab) ───────────────────────────────────────────────
  const [minPrem, setMinPrem] = useState<number>(0);
  const [dteBuckets, setDteBuckets] = useState<Set<DteBucket>>(new Set());
  const [mnyBuckets, setMnyBuckets] = useState<Set<MnyBucket>>(new Set());
  const [groupFilter, setGroupFilter] = useState<string>("");
  const [drillTicker, setDrillTicker] = useState<string | null>(null);
  const [tapeTickerSearch, setTapeTickerSearch] = useState<string>("");
  const [sideFilter, setSideFilter] = useState<string>("");
  const [flagFilter, setFlagFilter] = useState<string>("");
  const [sortKey, setSortKey] = useState<"ts" | "premium">("ts");
  const [sortDir, setSortDir] = useState<1 | -1>(-1);
  const [showPresets, setShowPresets] = useState(false);
  const presetsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showPresets) return;
    const h = (e: MouseEvent) => { if (presetsRef.current && !presetsRef.current.contains(e.target as Node)) setShowPresets(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [showPresets]);

  // Initial fetch (unconditional — visibility guard applies only to polling).
  useEffect(() => {
    // Bypass visibility check on mount: the guard is relevant for background-tab polling,
    // not for the user actively opening the page.
    (async () => {
      try {
        // SWR: flowGet serves cache-first on revisits; blocking on first mount.
        const [fj, hj] = await Promise.all([
          flowGet("feed"),
          flowGet("heat"),
        ]);
        if (fj) {
          const d = fj as FeedPayload;
          setFetchError(false);
          lastTapeAsofRef.current = d.asof ?? null;
          setFeed(d); setLastFeedTs(d.asof);
        } else { setFetchError(true); }
        if (hj) setHeat(hj as HeatPayload);
      } catch { setFetchError(true); }
      // Warm secondary feeds in the background so first tab switches are fast.
      // manifest is 1.9MB and only used by ProphetView — skip the eager prefetch here;
      // it is prefetched lazily when the Prophet tab activates (see prophet useEffect below).
      flowPrefetch("tide");
      flowPrefetch("prophet_idx");
    })();
    pollRef.current = setInterval(doFetch, 45_000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch tide when tab is activated
  useEffect(() => {
    if (activeTab === "tide") fetchTide();
  }, [activeTab, fetchTide]);

  // Lazy-prefetch manifest only when Prophet tab activates (manifest is ~1.9MB —
  // prefetching it on every page mount wastes bandwidth for users who never visit Prophet).
  useEffect(() => {
    if (activeTab === "prophet") flowPrefetch("manifest");
  }, [activeTab]);

  // Fetch ticker data when selected; also sync vol surface for the merged right column.
  // The existing vol useEffect (below) triggers fetchVol when selectedVolRoot changes.
  useEffect(() => {
    if (selectedTicker) {
      fetchTicker(selectedTicker);
      // Sync vol root → triggers the existing vol useEffect which calls fetchVol
      setSelectedVolRoot(selectedTicker);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTicker]);

  // ── Filtered events (Tape) ────────────────────────────────────────────────
  const events = useMemo<FlowEvent[]>(() => {
    const all = feed?.events ?? [];
    return all.filter((e) => {
      if (minPrem > 0 && e.premium < minPrem) return false;
      if (dteBuckets.size > 0 && !dteBuckets.has(e.dte_bucket)) return false;
      if (mnyBuckets.size > 0 && !mnyBuckets.has(e.mny_bucket)) return false;
      const ag = drillTicker ? "" : groupFilter;
      if (ag && e.group !== ag) return false;
      if (drillTicker && e.root !== drillTicker) return false;
      const q = tapeTickerSearch.trim().toUpperCase();
      if (q && !e.root.includes(q)) return false;
      if (sideFilter && e.side !== sideFilter) return false;
      if (flagFilter === "repeated" && !e.repeated) return false;
      if (flagFilter === "put_buy" && !(e.right === "P" && e.side === "~buy")) return false;
      if (flagFilter === "swept" && !e.swept) return false;
      return true;
    }).sort((a, b) => {
      const va = sortKey === "ts" ? new Date(a.ts).getTime() : a.premium;
      const vb = sortKey === "ts" ? new Date(b.ts).getTime() : b.premium;
      return (va > vb ? 1 : va < vb ? -1 : 0) * sortDir;
    });
  }, [feed, minPrem, dteBuckets, mnyBuckets, groupFilter, drillTicker, tapeTickerSearch, sideFilter, flagFilter, sortKey, sortDir]);

  const drillUnusual = useMemo<UnusualName | null>(() => {
    if (!drillTicker) return null;
    return feed?.unusual_names.find((u) => u.root === drillTicker) ?? null;
  }, [feed, drillTicker]);

  function handleSort(k: "ts" | "premium") {
    if (sortKey === k) setSortDir((d) => (d === -1 ? 1 : -1));
    else { setSortKey(k); setSortDir(-1); }
  }

  function toggleDteMid() {
    const mid: DteBucket[] = ["8_30d", "31_90d"];
    const allOn = mid.every((b) => dteBuckets.has(b));
    setDteBuckets((prev) => {
      const next = new Set(prev);
      if (allOn) { mid.forEach((b) => next.delete(b)); } else { mid.forEach((b) => next.add(b)); }
      return next;
    });
  }
  const dteMidOn = ["8_30d", "31_90d"].every((b) => dteBuckets.has(b as DteBucket));
  const dataStale = (feed?.stale) || (lastFeedTs ? isStale(lastFeedTs) : false);
  const heatGroups = heat?.groups ?? [];
  const unusualNames = feed?.unusual_names ?? [];

  // ── Live-feed health — distinguish an outage/delay from a genuinely quiet tape
  // so an empty Tape/Tide isn't silently shown as "no events match these filters".
  const rawTapeCount = feed?.events?.length ?? 0;
  const marketOpenNow = isUsMarketHoursNow();
  const feedUnavailable = fetchError && !feed;        // couldn't load the feed at all
  const feedDelayed = !!feed && dataStale;            // have data, but it isn't fresh
  const feedProblem = feedUnavailable || (feedDelayed && marketOpenNow);
  const lastUpdatedLabel = lastFeedTs
    ? `${feed?.session_date ? feed.session_date + " · " : ""}${fmtAsof(lastFeedTs)} ET`
    : "";

  // Ticker search candidates from tide top_net_impact + unusual names
  const tickerCandidates: string[] = useMemo(() => {
    const set = new Set<string>();
    (tideData?.top_net_impact ?? []).forEach((n) => set.add(n.root));
    (feed?.unusual_names ?? []).forEach((n) => set.add(n.root));
    return Array.from(set).sort();
  }, [tideData, feed]);

  const filteredCandidates = tickerSearch.trim()
    ? tickerCandidates.filter((r) => r.includes(tickerSearch.toUpperCase()))
    : tickerCandidates.slice(0, 20);

  // ── Screener fetch ────────────────────────────────────────────────────────
  const [oiData, setOiData] = useState<OiMoversPayload | null>(null);
  const [hotData, setHotData] = useState<HotPayload | null>(null);
  const [screenerLoading, setScreenerLoading] = useState(false);

  const fetchScreener = useCallback(async () => {
    if (oiData && hotData) return;
    setScreenerLoading(true);
    try {
      const [od, hd] = await Promise.all([
        flowGet("oi"),
        flowGet("hot"),
      ]);
      if (od) setOiData(od as OiMoversPayload);
      if (hd) setHotData(hd as HotPayload);
    } catch {}
    setScreenerLoading(false);
  }, [oiData, hotData]);

  useEffect(() => {
    if (activeTab === "screener") fetchScreener();
  }, [activeTab, fetchScreener]);

  const [hotView, setHotView] = useState<"by_premium" | "by_volume">("by_premium");

  // ── Screener preset view state ────────────────────────────────────────────
  const [screenerPreset, setScreenerPreset] = useState<ScreenerPreset>("top_prem");
  // Sort state for screener preset tables
  const [scrSortKey, setScrSortKey] = useState<string>("");
  const [scrSortDir, setScrSortDir] = useState<1 | -1>(-1);

  function scrSort(key: string) {
    if (scrSortKey === key) setScrSortDir((d) => (d === -1 ? 1 : -1));
    else { setScrSortKey(key); setScrSortDir(-1); }
  }

  // ── Vol fetch ─────────────────────────────────────────────────────────────
  const [volSearch, setVolSearch] = useState("");
  const [selectedVolRoot, setSelectedVolRoot] = useState<string | null>(null);
  const [volData, setVolData] = useState<VolPayload | null>(null);
  const [volLoading, setVolLoading] = useState(false);

  // Vol root candidates from tide top_net_impact (or fallback list)
  const volCandidates: string[] = useMemo(() => {
    const from = tideData?.top_net_impact.map((x) => x.root) ?? [];
    const defaults = ["NVDA", "SPY", "QQQ", "AAPL", "TSLA"];
    const set = new Set([...from, ...defaults]);
    return Array.from(set).sort();
  }, [tideData]);

  const filteredVolCandidates = volSearch.trim()
    ? volCandidates.filter((r) => r.includes(volSearch.toUpperCase()))
    : volCandidates.slice(0, 20);

  const fetchVol = useCallback(async (root: string) => {
    setVolLoading(true); setVolData(null);
    try {
      const d = await flowGet(`vol:${root}`);
      if (d) setVolData(d as VolPayload);
    } catch {}
    setVolLoading(false);
  }, []);

  useEffect(() => {
    if (selectedVolRoot) fetchVol(selectedVolRoot);
  }, [selectedVolRoot, fetchVol]);

  // ── Hub context (ctx) fetch — consumed by Tide + GEX tabs, lazy on activate ──
  const [ctxData, setCtxData] = useState<CtxPayload | null>(null);
  const fetchCtx = useCallback(async () => {
    if (ctxData) return; // already loaded
    try {
      const d = await flowGet("ctx");
      if (d) setCtxData(d as CtxPayload);
    } catch {}
  }, [ctxData]);

  // ── OI-confirmed fetch — consumed by Tape tab only, lazy on activate ─────────
  const [oiConfData, setOiConfData] = useState<OiConfPayload>([]);
  const oiConfLoaded = useRef(false);
  const fetchOiConf = useCallback(async () => {
    if (oiConfLoaded.current) return; // already loaded
    oiConfLoaded.current = true;
    try {
      const raw = await flowGet("oiconf");
      if (raw) {
        // Payload is either an array directly or wrapped
        setOiConfData(Array.isArray(raw) ? raw as OiConfPayload : ((raw as Record<string, unknown>).confirmed as OiConfPayload ?? []));
      }
    } catch { oiConfLoaded.current = false; }
  }, []);
  // Membership set for O(1) per-row OI-confirmed lookup (avoids per-row .some())
  const oiConfSet = useMemo(
    () => new Set(oiConfData.map((oc) => `${oc.root}|${oc.right}|${oc.exp}|${oc.strike}`)),
    [oiConfData],
  );

  // ── Ticker context (tctx) fetch ───────────────────────────────────────────
  const [tctxData, setTctxData] = useState<TctxPayload | null>(null);
  const [tctxRoot, setTctxRoot] = useState<string | null>(null);
  const tctxFetch = useCallback(async (root: string) => {
    if (tctxRoot === root && tctxData) return;
    setTctxRoot(root); setTctxData(null);
    try {
      const d = await flowGet(`tctx:${root}`);
      if (d) setTctxData(d as TctxPayload);
    } catch {}
  }, [tctxRoot, tctxData]);

  // Lazy-load ctx (Tide + GEX) and oiconf (Tape) when their consuming tab activates
  useEffect(() => {
    if (activeTab === "tide" || activeTab === "gex") fetchCtx();
    if (activeTab === "tape") fetchOiConf();
  }, [activeTab, fetchCtx, fetchOiConf]);

  // Fetch tctx when ticker is selected
  useEffect(() => {
    if (selectedTicker) tctxFetch(selectedTicker);
  }, [selectedTicker, tctxFetch]);

  // ── GEX fetch ─────────────────────────────────────────────────────────────
  const [gexSearch, setGexSearch] = useState("");
  const [selectedGexRoot, setSelectedGexRoot] = useState<string | null>(null);
  const [gexData, setGexData] = useState<GexPayload | null>(null);
  const [gexLoading, setGexLoading] = useState(false);
  const [gexGreek, setGexGreek] = useState<GreekKey>("gamma");

  const gexCandidates: string[] = useMemo(() => {
    const from = tideData?.top_net_impact.map((x) => x.root) ?? [];
    const defaults = ["SPY", "QQQ", "NVDA", "AAPL", "TSLA"];
    const set = new Set([...from, ...defaults]);
    return Array.from(set).sort();
  }, [tideData]);

  const filteredGexCandidates = gexSearch.trim()
    ? gexCandidates.filter((r) => r.includes(gexSearch.toUpperCase()))
    : gexCandidates.slice(0, 20);

  const fetchGex = useCallback(async (root: string) => {
    setGexLoading(true); setGexData(null);
    try {
      const d = await flowGet(`gex:${root}`);
      if (d) setGexData(d as GexPayload);
    } catch {}
    setGexLoading(false);
  }, []);

  useEffect(() => {
    if (selectedGexRoot) fetchGex(selectedGexRoot);
  }, [selectedGexRoot, fetchGex]);

  // ── Leaders fetch ─────────────────────────────────────────────────────────
  const [leadersData, setLeadersData] = useState<LeadersPayload | null>(null);
  const [leadersLoading, setLeadersLoading] = useState(false);
  const [leadersError, setLeadersError] = useState(false);
  const [leadersBoard, setLeadersBoard] = useState<"a" | "b">("a");

  const fetchLeaders = useCallback(async () => {
    if (leadersData) return;
    setLeadersLoading(true); setLeadersError(false);
    try {
      const d = await flowGet("leaders");
      if (d) setLeadersData(d as unknown as LeadersPayload);
      else setLeadersError(true);
    } catch { setLeadersError(true); }
    setLeadersLoading(false);
  }, [leadersData]);

  useEffect(() => {
    if (activeTab === "leaders") fetchLeaders();
  }, [activeTab, fetchLeaders]);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="app2 obs obs-ambient">
      <header className="topbar">
        <BrandLockup />
        <div className="tdiv" />
        <span className="page-title">{t("flow", "Options")}</span>
        <div className="spacer" />
        {/* Live status area */}
        {(activeTab === "tape" || activeTab === "tide") && !feedUnavailable && !feedDelayed && (
          <span style={{ display: "flex", alignItems: "center", gap: 6, marginRight: 10, fontSize: 12, color: "var(--text-2)" }}>
            <span className="obs-live-dot" />
            {lang === "zh" ? "实时" : "Live"}
          </span>
        )}
        {lastFeedTs && (
          <span style={{ color: "var(--text-dim)", fontSize: 11, marginRight: 12 }}>
            {t("asOf", "as of")} {fmtAsof(lastFeedTs)}
            {dataStale && (
              <span style={{ marginLeft: 6, color: "var(--warn)", fontWeight: 600 }}>
                {lang === "zh" ? "延迟" : "delayed"}
              </span>
            )}
          </span>
        )}
        <button
          className="chip"
          style={{ marginLeft: 8 }}
          onClick={() => setLang(lang === "zh" ? "en" : "zh")}
          title={lang === "zh" ? "Switch to English" : "切换中文"}
        >
          {lang === "zh" ? "EN" : "中文"}
        </button>
      </header>

      <AppNav />

      <main className="main2" style={{ overflow: "hidden", display: "flex", flexDirection: "column" }}>

        {/* ── Tab bar (Observatory pill-nav) ── */}
        <div style={{ display: "flex", alignItems: "center", padding: "8px 14px", borderBottom: "1px solid var(--line)", flexShrink: 0, gap: 8 }}>
          <nav className="obs-pillnav" aria-label={lang === "zh" ? "期权工具选项卡" : "Options Hub tabs"}>
            {TABS.map((tb) => (
              <button
                key={tb.key}
                className={`obs-pillnav-tab${activeTab === tb.key ? " on" : ""}`}
                onClick={() => switchTab(tb.key)}
              >
                {lang === "zh"
                  ? t(tb.zhKey, tb.key)
                  : t(tb.enKey, tb.key)}
              </button>
            ))}
          </nav>
        </div>

        {/* ── Live-feed status banner (Tape + Tide are intraday-live) ── */}
        {(activeTab === "tape" || activeTab === "tide") && (feedUnavailable || feedDelayed) && (
          <div
            role="status"
            style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "6px 12px", fontSize: 12, fontWeight: 600, lineHeight: 1.4,
              borderBottom: "1px solid var(--border, #222)",
              color: feedProblem ? "var(--warn)" : "var(--text-dim)",
              background: feedProblem ? "color-mix(in srgb, var(--warn) 12%, transparent)" : "transparent",
            }}
          >
            <span aria-hidden>{feedProblem ? "⚠" : "◷"}</span>
            <span>
              {feedUnavailable
                ? (lang === "zh"
                    ? "实时期权流不可用 — 暂时无法连接数据源。"
                    : "Live options feed unavailable — can’t reach the data source right now.")
                : marketOpenNow
                ? (lang === "zh"
                    ? `实时期权流延迟 — 最近更新 ${lastUpdatedLabel}，盘口可能未在刷新。`
                    : `Live options feed delayed — last update ${lastUpdatedLabel}; the tape may not be refreshing.`)
                : (lang === "zh"
                    ? `市场休市 — 显示上一交易时段（${lastUpdatedLabel}）。实时盘口 9:30 ET 恢复。`
                    : `Market closed — showing the last session (${lastUpdatedLabel}). Live tape resumes at 9:30 ET.`)}
            </span>
          </div>
        )}

        {/* ── Tab content ── */}
        <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>

          {/* ═══ DESK TAB ══════════════════════════════════════════════════ */}
          {/* Keep-alive: stay mounted once visited so tab switches are instant. */}
          {visitedTabs.has("desk") && (
            <div style={{ flex: 1, overflow: "hidden", display: activeTab === "desk" ? "flex" : "none", flexDirection: "column", minHeight: 0 }}>
              <FlowDeskView />
            </div>
          )}

          {/* ═══ TAPE TAB ═══════════════════════════════════════════════════ */}
          {activeTab === "tape" && (
            <>
              {/* Heat strip */}
              <div className="flow-heat-strip">
                {heatGroups.length === 0 && !fetchError && (
                  <span style={{ color: "var(--muted)", fontSize: 12 }}>
                    {t("loadingHeat", "Loading group data…")}
                  </span>
                )}
                {heatGroups.map((g) => {
                  const glyph = netToneGlyph(g.net_signed_premium_soft);
                  const toneUp = g.net_signed_premium_soft > 0;
                  const toneDown = g.net_signed_premium_soft < 0;
                  const on = groupFilter === g.group && !drillTicker;
                  const gName = lang === "zh" ? g.group_zh : abbrevSector(g.group);
                  return (
                    <button
                      key={g.group}
                      className={`chip${on ? " on" : ""}`}
                      onClick={() => { setDrillTicker(null); setGroupFilter((f) => (f === g.group ? "" : g.group)); }}
                      style={{ gap: 5 }}
                    >
                      <span>{gName}</span>
                      <span style={{ color: "var(--text-2)", fontWeight: 700 }}>{fmtPremium(g.gross_premium)}</span>
                      <span style={{ color: toneUp ? "var(--up)" : toneDown ? "var(--down)" : "var(--muted)", fontWeight: 700, fontSize: 10 }}>
                        {glyph}
                      </span>
                    </button>
                  );
                })}
                {groupFilter && !drillTicker && (
                  <button className="chip" onClick={() => setGroupFilter("")} style={{ marginLeft: 4, color: "var(--muted)" }} aria-label={t("clearFilter")} title={t("clearFilter")}>✕</button>
                )}
              </div>

              {/* Filter bar */}
              <div className="flow-filter-bar">
                {/* Presets dropdown */}
                <div ref={presetsRef} style={{ position: "relative" }}>
                  <button className={`chip${showPresets ? " on" : ""}`} style={{ height: 26, fontSize: 11 }} onClick={() => setShowPresets((v) => !v)}>
                    {t("presets", "Presets")} ▾
                  </button>
                  {showPresets && (
                    <div className="pop show" style={{ top: "calc(100% + 5px)", left: 0, minWidth: 180 }}>
                      {PRESETS.map((p) => (
                        <button
                          key={p.key}
                          className="menu-row"
                          style={{ width: "100%" }}
                          onClick={() => {
                            p.apply({ setMinPrem, setDteBuckets, setMnyBuckets, setSideFilter, setFlagFilter });
                            setShowPresets(false);
                          }}
                        >
                          {t(p.labelKey, p.key)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Min premium */}
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span className="hub-cap">{t("minPrem", "Min prem")}</span>
                  <select
                    value={minPrem}
                    onChange={(e) => setMinPrem(Number(e.target.value))}
                    style={{ height: 28, padding: "0 8px", borderRadius: "var(--r-md)", background: "var(--inset)", border: "1px solid var(--line)", color: "var(--text)", font: "600 12px var(--font-ui)", cursor: "pointer" }}
                  >
                    <option value={0}>{t("anyPrem", "Any")}</option>
                    {PREM_FILTERS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </div>

                {/* DTE buckets */}
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span className="hub-cap">{t("dte", "DTE")}</span>
                  <button className={`chip${dteMidOn ? " on" : ""}`} style={{ height: 26, fontSize: 11 }} onClick={toggleDteMid} title={lang === "zh" ? "8–90天快选" : "8–90d preset"}>8–90d</button>
                  {DTE_BUCKETS.map((b) => (
                    <button
                      key={b.key}
                      className={`chip${dteBuckets.has(b.key) ? " on" : ""}`}
                      style={{ height: 26, fontSize: 11 }}
                      onClick={() => setDteBuckets((prev) => { const next = new Set(prev); if (next.has(b.key)) next.delete(b.key); else next.add(b.key); return next; })}
                    >
                      {lang === "zh" ? b.zh : b.en}
                    </button>
                  ))}
                </div>

                {/* Moneyness */}
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span className="hub-cap">{t("mny", "Mny")}</span>
                  {MNY_BUCKETS.map((b) => (
                    <button
                      key={b.key}
                      className={`chip${mnyBuckets.has(b.key) ? " on" : ""}`}
                      style={{ height: 26, fontSize: 11 }}
                      onClick={() => setMnyBuckets((prev) => { const next = new Set(prev); if (next.has(b.key)) next.delete(b.key); else next.add(b.key); return next; })}
                    >
                      {lang === "zh" ? b.zh : b.en}
                    </button>
                  ))}
                </div>

                {/* Ticker search */}
                <input
                  type="text"
                  placeholder={t("tapeTickerPlaceholder", "Ticker…")}
                  value={tapeTickerSearch}
                  onChange={(e) => { setTapeTickerSearch(e.target.value); setDrillTicker(null); }}
                  style={{ height: 28, padding: "0 10px", borderRadius: "var(--r-md)", background: "var(--inset)", border: "1px solid var(--line)", color: "var(--text)", font: "13px var(--font-ui)", width: 110 }}
                />

                {/* Reset */}
                {(minPrem > 0 || dteBuckets.size > 0 || mnyBuckets.size > 0 || groupFilter || tapeTickerSearch || drillTicker || sideFilter || flagFilter) && (
                  <button
                    className="chip"
                    style={{ marginLeft: 4, color: "var(--muted)", height: 26, fontSize: 11 }}
                    onClick={() => { setMinPrem(0); setDteBuckets(new Set()); setMnyBuckets(new Set()); setGroupFilter(""); setTapeTickerSearch(""); setDrillTicker(null); setSideFilter(""); setFlagFilter(""); }}
                  >
                    {t("tapeReset", "Reset")}
                  </button>
                )}
              </div>

              {/* Drill card */}
              {drillTicker && (
                <div className="flow-drill-card">
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontWeight: 700, fontSize: 15 }}>{drillTicker}</span>
                    {drillUnusual && (
                      <>
                        <span style={{ color: "var(--muted)", fontSize: 12 }}>{lang === "zh" ? drillUnusual.group_zh : drillUnusual.group}</span>
                        <span style={{ color: "var(--text-2)", fontSize: 12 }}>
                          {t("tapeRunningPrem", "Running prem")} <strong>{fmtPremium(drillUnusual.gross_premium_today)}</strong>
                        </span>
                        <span style={{ color: "var(--text-2)", fontSize: 12 }}>
                          {drillUnusual.prem_z != null ? `z=${drillUnusual.prem_z.toFixed(1)}` : t("tapeBaselineWarm", "baseline warming")}
                        </span>
                        {drillUnusual.top_contracts.length > 0 && (
                          <span style={{ color: "var(--muted)", fontSize: 11 }}>
                            {lang === "zh" ? "主力合约：" : "Top: "}
                            {drillUnusual.top_contracts.slice(0, 3).map((c, i) => (
                              <span key={i} style={{ marginRight: 8 }}>{fmtContract(c.right, c.exp, c.strike)} {fmtPremium(c.premium)}</span>
                            ))}
                          </span>
                        )}
                      </>
                    )}
                    <button className="chip" style={{ marginLeft: "auto", height: 24, fontSize: 11, color: "var(--muted)" }} onClick={() => setDrillTicker(null)} aria-label={t("clearFilter")} title={t("clearFilter")}>✕</button>
                  </div>
                </div>
              )}

              {/* Main body: table + unusual rail */}
              <div style={{ flex: 1, display: "flex", minHeight: 0, overflow: "hidden" }}>
                <div className="scr-table" style={{ flex: 1 }}>
                  {fetchError && !feed && (
                    <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
                      {lang === "zh" ? "数据暂时不可用，请稍后重试。" : "Feed unavailable — retrying…"}
                    </div>
                  )}
                  {!fetchError && !feed && (
                    <div className="fin-empty" role="status">{t("loading", "Loading…")}</div>
                  )}
                  {feed && (
                    <table className="scr" style={{ fontSize: 12 }}>
                      <thead>
                        <tr>
                          <th style={{ textAlign: "left", cursor: "pointer" }} className={sortKey === "ts" ? "sorted" : ""} onClick={() => handleSort("ts")}>
                            {t("colTime", "Time")} ET{sortKey === "ts" ? (sortDir === -1 ? " ↓" : " ↑") : ""}
                          </th>
                          <th style={{ textAlign: "left" }}>{t("colTicker", "Ticker")}</th>
                          <th style={{ textAlign: "left" }}>{t("colSector", "Sector")}</th>
                          <th>{t("colSide", "Side")}</th>
                          <th>{t("colCP", "C/P")}</th>
                          <th>{t("colContract", "Contract")}</th>
                          <th>{t("colDte", "DTE")}</th>
                          <th>{t("colMny", "Mny")}</th>
                          <th>{t("colSize", "Size")}</th>
                          <th style={{ cursor: "pointer" }} className={sortKey === "premium" ? "sorted" : ""} onClick={() => handleSort("premium")}>
                            {t("colPrem", "Prem")}{sortKey === "premium" ? (sortDir === -1 ? " ↓" : " ↑") : ""}
                          </th>
                          <th>{t("colFlags", "Flags")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {events.length === 0 && (
                          <tr className="empty-row">
                            <td colSpan={11} style={{ textAlign: "center", color: "var(--muted)", padding: "40px 16px", fontSize: 13 }}>
                              {rawTapeCount > 0
                                ? (lang === "zh" ? "暂无符合条件的记录。" : "No events match these filters.")
                                : feedDelayed && marketOpenNow
                                ? (lang === "zh" ? "实时盘口暂未刷新。" : "Live feed isn’t updating right now.")
                                : feedDelayed
                                ? (lang === "zh" ? "市场休市 — 实时盘口 9:30 ET 恢复。" : "Market closed — live tape resumes at 9:30 ET.")
                                : (lang === "zh" ? "本时段暂无异常期权流。" : "No unusual options flow yet this session.")}
                            </td>
                          </tr>
                        )}
                        {events.map((e) => {
                          const isBuy = e.side === "~buy"; const isSell = e.side === "~sell";
                          return (
                            <tr key={e.id} style={{ cursor: "pointer" }} onClick={() => setDrillTicker((d) => (d === e.root ? null : e.root))}>
                              <td style={{ textAlign: "left", fontVariantNumeric: "tabular-nums", color: "var(--text-dim)" }}>{fmtTime(e.ts)}</td>
                              <td style={{ textAlign: "left", fontWeight: 600 }}>{e.root}</td>
                              <td style={{ textAlign: "left", color: "var(--text-2)", fontSize: 11 }}>
                                {lang === "zh" ? e.group_zh : abbrevSector(e.group)}
                              </td>
                              <td>
                                <span className={isBuy ? "pill buy" : isSell ? "pill sell" : ""} style={!isBuy && !isSell ? { color: "var(--muted)", fontSize: 11 } : {}}>
                                  {e.side}
                                </span>
                              </td>
                              <td>
                                <span style={{ color: e.right === "C" ? "var(--up)" : "var(--down)", fontWeight: 700 }}>{e.right}</span>
                              </td>
                              <td style={{ fontVariantNumeric: "tabular-nums", color: "var(--text-2)" }}>{fmtContract(e.right, e.exp, e.strike)}</td>
                              <td>
                                <span className="flow-dte-chip">
                                  {lang === "zh" ? DTE_BUCKETS.find((b) => b.key === e.dte_bucket)?.zh ?? e.dte_bucket : DTE_BUCKETS.find((b) => b.key === e.dte_bucket)?.en ?? e.dte_bucket}
                                </span>
                              </td>
                              <td>
                                <span className="flow-mny-chip">
                                  {lang === "zh" ? MNY_BUCKETS.find((b) => b.key === e.mny_bucket)?.zh ?? e.mny_bucket : MNY_BUCKETS.find((b) => b.key === e.mny_bucket)?.en ?? e.mny_bucket}
                                </span>
                              </td>
                              <td style={{ fontVariantNumeric: "tabular-nums" }}>{e.size.toLocaleString("en-US")}</td>
                              <td style={{ fontVariantNumeric: "tabular-nums" }}>{fmtPremium(e.premium)}</td>
                              <td>
                                <span style={{ display: "flex", gap: 4, justifyContent: "flex-end", flexWrap: "wrap" }}>
                                  {e.zerodte && <span className="flow-flag-chip">{lang === "zh" ? "当日" : "0DTE"}</span>}
                                  {e.vol_gt_oi && <span className="flow-flag-chip">{lang === "zh" ? "量超持仓" : "vol>OI"}</span>}
                                  {e.repeated && <span className="flow-flag-chip">{lang === "zh" ? "重复" : "repeat"}</span>}
                                  {e.swept && <span className="flow-flag-chip" style={{ color: "var(--warn)", borderColor: "rgba(232,163,61,.4)" }}>{lang === "zh" ? "扫单" : "swept"}</span>}
                                  {oiConfSet.has(`${e.root}|${e.right}|${e.exp}|${e.strike}`) && (
                                    <span className="flow-flag-chip" style={{ color: "var(--brand-2)", borderColor: "rgba(41,98,255,.35)" }}>{t("tapeOiConfirmed", "OI-confirmed")}</span>
                                  )}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* Unusual names rail */}
                {unusualNames.length > 0 && (
                  <div className="flow-unusual-rail">
                    <div style={{ fontWeight: 700, fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 10 }}>
                      {lang === "zh" ? "异常活跃（启发式）" : "Notable Activity (Heuristic)"}
                    </div>
                    {unusualNames.map((u) => (
                      <button
                        key={u.root}
                        className={`flow-unusual-row${drillTicker === u.root ? " on" : ""}`}
                        onClick={() => setDrillTicker((d) => (d === u.root ? null : u.root))}
                      >
                        <span style={{ fontWeight: 700, fontSize: 13 }}>{u.root}</span>
                        <span style={{ color: "var(--text-2)", fontSize: 11, marginLeft: 4 }}>{lang === "zh" ? u.group_zh : u.group}</span>
                        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>
                          {fmtPremium(u.gross_premium_today)}{" "}
                          {u.prem_z != null ? `· z=${u.prem_z.toFixed(1)} (${u.baseline_source})` : `· ${t("tapeBaselineWarm", "baseline warming")}`}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* ═══ TIDE TAB ═══════════════════════════════════════════════════ */}
          {activeTab === "tide" && (
            <div style={{ flex: 1, overflow: "auto", padding: "16px 18px", display: "flex", flexDirection: "column", gap: 20 }}>
              {tideLoading && !tideData && (
                <div className="fin-empty" role="status">{t("loading", "Loading…")}</div>
              )}
              {tideData && (
                <>
                  {/* Hero chart header */}
                  <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 650, fontSize: 14 }}>{t("tideTitle", "Market Tide")}</span>
                    <div style={{ display: "flex", gap: 12, fontSize: 12, color: "var(--text-2)", marginLeft: 8 }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <span style={{ display: "inline-block", width: 14, height: 3, background: "var(--up)", borderRadius: 2 }} />
                        {lang === "zh" ? "净认购保费（~累计）" : "NCP (~cumulative)"}
                      </span>
                      <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <span style={{ display: "inline-block", width: 14, height: 3, background: "var(--down)", borderRadius: 2 }} />
                        {lang === "zh" ? "净认沽保费（~累计）" : "NPP (~cumulative)"}
                      </span>
                      {tideData.spy.length > 0 && (
                        <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                          <span style={{ display: "inline-block", width: 14, height: 3, background: "var(--warn)", borderRadius: 2 }} />
                          SPY
                        </span>
                      )}
                    </div>
                    <div style={{ marginLeft: "auto" }}>
                      <MethodNotePopover lang={lang} t={t} />
                    </div>
                  </div>

                  {/* Main tide chart — explicit height so LWC canvas isn't clipped */}
                  <div style={{ border: "1px solid var(--line)", borderRadius: "var(--r-lg)", background: "var(--panel)", padding: "12px 4px 4px", height: 240, boxSizing: "border-box" }}>
                    <TideChart minutes={tideData.minutes} spy={tideData.spy} height={216} sessionDate={tideData.session_date} />
                  </div>

                  {/* Sector tide grid */}
                  <div>
                    <div style={{ fontWeight: 650, fontSize: 13, marginBottom: 12 }}>{t("tideSectorTitle", "Sector Tide")}</div>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
                        gap: 10,
                      }}
                    >
                      {tideData.sectors.map((s) => {
                        const ncpVals = s.minutes.map((m) => m.ncp / 1_000_000);
                        const net = s.ncp + s.npp;
                        const toneUp = net > 0; const toneDown = net < 0;
                        const color = toneUp ? "var(--up)" : toneDown ? "var(--down)" : "var(--muted)";
                        return (
                          <button
                            key={s.group}
                            onClick={() => { switchTab("tape"); setGroupFilter(s.group); }}
                            style={{
                              border: "1px solid var(--line)", borderRadius: "var(--r-lg)",
                              background: "var(--panel)", padding: "10px 12px",
                              textAlign: "left", cursor: "pointer",
                              transition: "background var(--t), border-color var(--t)",
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--panel-2)")}
                            onMouseLeave={(e) => (e.currentTarget.style.background = "var(--panel)")}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                              <span style={{ fontWeight: 600, fontSize: 12 }}>
                                {lang === "zh" ? s.group_zh : abbrevSector(s.group)}
                              </span>
                              <span style={{ marginLeft: "auto", color, fontSize: 12, fontWeight: 700 }}>
                                {fmtPremSigned(net / 1_000_000)}M
                              </span>
                            </div>
                            <Sparkline data={ncpVals} color={color} width={120} height={28} />
                            {/* ETF flow chip from ctx — d1 creation/redemption proxy */}
                            {ctxData?.sector_etf_flows && ctxData.sector_etf_flows[s.group] != null && (() => {
                              const fl = ctxData.sector_etf_flows![s.group];
                              const pos = fl.d1 >= 0;
                              return (
                                <div style={{ fontSize: 10, color: pos ? "var(--up)" : "var(--down)", marginTop: 3, display: "flex", alignItems: "center", gap: 3 }}>
                                  <span style={{ color: "var(--text-dim)" }}>{t("tideEtfFlowProxy", "proxy")}</span>
                                  <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
                                    {pos ? "+" : ""}{fmtPremSigned(fl.d1)}
                                  </span>
                                </div>
                              );
                            })()}
                            <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 4 }}>
                              {lang === "zh" ? "点击筛选逐笔" : "click to filter Tape"}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Top net impact */}
                  <div>
                    <div style={{ fontWeight: 650, fontSize: 13, marginBottom: 12 }}>{t("tideImpactTitle", "Top Net Impact")}</div>
                    <div style={{ border: "1px solid var(--line)", borderRadius: "var(--r-lg)", background: "var(--panel)", overflow: "hidden" }}>
                      {(() => {
                        // Hoisted once — bar scale is the max |net_prem_soft| across the set.
                        const maxNet = Math.max(...tideData.top_net_impact.map((x) => Math.abs(x.net_prem_soft)), 1);
                        return tideData.top_net_impact.slice(0, 20).map((item, i) => {
                        const barW = Math.round((Math.abs(item.net_prem_soft) / maxNet) * 100);
                        const isPos = item.net_prem_soft >= 0;
                        return (
                          <div
                            key={item.root}
                            style={{
                              display: "grid", gridTemplateColumns: "60px 1fr 80px 80px",
                              gap: 10, alignItems: "center",
                              padding: "8px 14px", borderBottom: i < 19 ? "1px solid var(--line-2)" : "none",
                              fontSize: 12,
                            }}
                          >
                            <span style={{ fontWeight: 700 }}>{item.root}</span>
                            <div style={{ height: 8, borderRadius: 4, background: "var(--panel-3)", overflow: "hidden" }}>
                              <div
                                style={{
                                  height: "100%", width: `${barW}%`,
                                  background: isPos ? "rgba(38,194,129,.5)" : "rgba(240,86,107,.45)",
                                  borderRadius: 4,
                                }}
                              />
                            </div>
                            <span style={{ textAlign: "right", color: isPos ? "var(--up)" : "var(--down)", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                              {fmtPremSigned(item.net_prem_soft)}
                            </span>
                            <span style={{ textAlign: "right", color: "var(--text-2)", fontVariantNumeric: "tabular-nums" }}>
                              {fmtPremium(item.gross)}
                            </span>
                          </div>
                        );
                        });
                      })()}
                    </div>
                  </div>

                  {/* DTE Tide */}
                  {dteTide && (
                    <div>
                      <div style={{ fontWeight: 650, fontSize: 13, marginBottom: 12 }}>{t("tideDteTitle", "DTE Buckets")}</div>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
                          gap: 10,
                        }}
                      >
                        {(Object.keys(DTE_LABELS) as DteBucket[]).map((bk) => {
                          const mins = dteTide.buckets[bk] ?? [];
                          const vals = mins.map((m) => (m.ncp + m.npp) / 1_000_000);
                          const last = vals[vals.length - 1] ?? 0;
                          const color = last > 0 ? "var(--up)" : last < 0 ? "var(--down)" : "var(--muted)";
                          const lbl = lang === "zh" ? DTE_LABELS[bk].zh : DTE_LABELS[bk].en;
                          return (
                            <div
                              key={bk}
                              style={{
                                border: "1px solid var(--line)", borderRadius: "var(--r-lg)",
                                background: "var(--panel)", padding: "10px 12px",
                              }}
                            >
                              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                                <span style={{ fontWeight: 600, fontSize: 12 }}>{lbl}</span>
                                <span style={{ color, fontSize: 12, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                                  {fmtPremSigned(last)}M
                                </span>
                              </div>
                              <Sparkline data={vals} color={color} width={120} height={28} />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ═══ TICKERS TAB ════════════════════════════════════════════════
               Merged layout: ticker search sidebar + main area split:
                 LEFT col: intraday flow (minute chart + top contracts list)
                 RIGHT col: strike ladder (full width of column) + vol surface below
               The standalone "Vol" tab is removed from the tab bar; its content
               lives here to surface IV surface in the same per-ticker context.
          ═══════════════════════════════════════════════════════════════════ */}
          {activeTab === "tickers" && (
            <div style={{ flex: 1, overflow: "hidden", display: "flex", minHeight: 0 }}>
              {/* Left sidebar — ticker search + candidate list */}
              <div
                style={{
                  width: 180, flexShrink: 0, borderRight: "1px solid var(--line)",
                  display: "flex", flexDirection: "column", minHeight: 0,
                }}
              >
                <div style={{ padding: "10px 10px 8px" }}>
                  <input
                    type="text"
                    placeholder={lang === "zh" ? "搜索代码…" : "Search ticker…"}
                    value={tickerSearch}
                    onChange={(e) => setTickerSearch(e.target.value)}
                    style={{
                      width: "100%", height: 30, padding: "0 10px",
                      borderRadius: "var(--r-md)", background: "var(--inset)",
                      border: "1px solid var(--line)", color: "var(--text)",
                      font: "13px var(--font-ui)",
                    }}
                  />
                </div>
                <div style={{ flex: 1, overflow: "auto" }}>
                  {filteredCandidates.map((root) => {
                    const imp = tideData?.top_net_impact.find((x) => x.root === root);
                    const isPos = imp ? imp.net_prem_soft > 0 : null;
                    return (
                      <button
                        key={root}
                        onClick={() => setSelectedTicker(root)}
                        style={{
                          display: "flex", alignItems: "center", gap: 8,
                          width: "100%", padding: "8px 12px", textAlign: "left",
                          fontSize: 13, fontWeight: selectedTicker === root ? 700 : 400,
                          color: selectedTicker === root ? "var(--text)" : "var(--text-2)",
                          background: selectedTicker === root ? "rgba(41,98,255,.1)" : "none",
                          borderRadius: "var(--r)", cursor: "pointer",
                          transition: "background var(--t)",
                        }}
                        onMouseEnter={(e) => { if (selectedTicker !== root) e.currentTarget.style.background = "var(--panel-2)"; }}
                        onMouseLeave={(e) => { if (selectedTicker !== root) e.currentTarget.style.background = "none"; }}
                      >
                        {root}
                        {imp && (
                          <span style={{ marginLeft: "auto", fontSize: 11, color: isPos ? "var(--up)" : "var(--down)", fontVariantNumeric: "tabular-nums" }}>
                            {fmtPremSigned(imp.net_prem_soft)}
                          </span>
                        )}
                      </button>
                    );
                  })}
                  {filteredCandidates.length === 0 && (
                    <div style={{ padding: "20px 12px", color: "var(--muted)", fontSize: 12 }}>
                      {lang === "zh" ? "无结果" : "No results"}
                    </div>
                  )}
                </div>
              </div>

              {/* Main area — fills remaining width */}
              <div style={{ flex: 1, overflow: "auto", minWidth: 0 }}>
                {!selectedTicker && (
                  <div style={{ color: "var(--muted)", fontSize: 13, padding: "40px 0", textAlign: "center" }}>
                    {t("tickersSelectPrompt", "Select a ticker from the list or search above")}
                  </div>
                )}
                {selectedTicker && (tickerLoading && !tickerData) && (
                  <div className="fin-empty" role="status">{t("loading", "Loading…")}</div>
                )}
                {selectedTicker && tickerData && (
                  <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 14 }}>

                    {/* ── Header: ticker + spot ref + IV chips ── */}
                    <div style={{
                      display: "flex", alignItems: "center", flexWrap: "wrap", gap: 14,
                      borderBottom: "1px solid var(--line)", paddingBottom: 12,
                    }}>
                      <div>
                        <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".06em" }}>
                          {lang === "zh" ? tickerData.group_zh : abbrevSector(tickerData.group)}
                        </div>
                        <div style={{ fontWeight: 700, fontSize: 22, lineHeight: 1.1 }}>{tickerData.root}</div>
                      </div>
                      {/* Flow stats chips */}
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                        {[
                          { lk: "tickersDayGross", lb: "Day Gross", v: fmtPremium(tickerData.day.gross) },
                          { lk: "tickersNetSoft", lb: "Net", v: fmtPremSigned(tickerData.day.net_soft), color: tickerData.day.net_soft >= 0 ? "var(--up)" : "var(--down)" },
                          { lk: "tickersCallShare", lb: "Call%", v: `${(tickerData.day.call_share * 100).toFixed(1)}%`, color: tickerData.day.call_share > 0.5 ? "var(--up)" : "var(--down)" },
                          { lk: "tickersPremZ", lb: "Prem z", v: tickerData.day.prem_z != null ? tickerData.day.prem_z.toFixed(1) : (lang === "zh" ? "积累中" : "—") },
                        ].map((kv) => (
                          <div key={kv.lk} style={{ border: "1px solid var(--line)", borderRadius: "var(--r-md)", padding: "4px 10px", background: "var(--panel)" }}>
                            <div style={{ fontSize: 9, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".05em" }}>{t(kv.lk, kv.lb)}</div>
                            <div style={{ fontWeight: 650, fontSize: 13, color: (kv as any).color ?? "var(--text)", fontVariantNumeric: "tabular-nums" }}>{kv.v}</div>
                          </div>
                        ))}
                        {/* IV30 and IV rank chips from vol data */}
                        {volData && volData.root === selectedTicker && (
                          <>
                            <div style={{ border: "1px solid var(--line)", borderRadius: "var(--r-md)", padding: "4px 10px", background: "var(--panel)" }}>
                              <div style={{ fontSize: 9, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".05em" }}>{t("tickersAtmIv", "ATM IV")}</div>
                              <div style={{ fontWeight: 650, fontSize: 13, color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>{(volData.atm_iv * 100).toFixed(1)}%</div>
                            </div>
                            <div style={{ border: "1px solid var(--line)", borderRadius: "var(--r-md)", padding: "4px 10px", background: "var(--panel)" }}>
                              <div style={{ fontSize: 9, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".05em" }}>{t("tickersIvRank", "IV Rank")}</div>
                              <div style={{ fontWeight: 650, fontSize: 13, fontVariantNumeric: "tabular-nums",
                                color: volData.iv_rank_252 == null ? "var(--text-dim)"
                                  : volData.iv_rank_252 > 75 ? "var(--down)"
                                  : volData.iv_rank_252 > 50 ? "var(--warn)" : "var(--up)" }}>
                                {volData.iv_rank_252 != null ? volData.iv_rank_252.toFixed(0) : (lang === "zh" ? "积累中" : "—")}
                              </div>
                            </div>
                          </>
                        )}
                      </div>

                      {/* Tctx z-score chips */}
                      {tctxData && (() => {
                        const histN = tctxData.history_n ?? 0;
                        const minN = 20;
                        const warming = histN < minN;
                        const chips: { labelKey: string; label: string; zKey: keyof NonNullable<TctxPayload["z"]> }[] = [
                          { labelKey: "tctxNetPremZ", label: "Net z", zKey: "net_signed_premium_z252" },
                          { labelKey: "tctxVolGtOiShare", label: "vol>OI z", zKey: "vol_gt_oi_share_z252" },
                        ];
                        return chips.map((c) => {
                          const zVal = tctxData.z?.[c.zKey];
                          return (
                            <div key={c.zKey} style={{ border: "1px solid var(--line)", borderRadius: "var(--r-md)", padding: "4px 10px", background: "var(--panel)" }}>
                              <div style={{ fontSize: 9, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".05em" }}>{t(c.labelKey, c.label)}</div>
                              <div style={{ fontSize: 13, fontWeight: 650, fontVariantNumeric: "tabular-nums", color: "var(--text)" }}>
                                {warming || zVal == null
                                  ? <span style={{ fontSize: 10, color: "var(--text-dim)" }}>—</span>
                                  : `${zVal >= 0 ? "+" : ""}${zVal.toFixed(2)}`}
                              </div>
                            </div>
                          );
                        });
                      })()}
                    </div>

                    {/* ── Two-column body ── */}
                    <div style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 16,
                      alignItems: "start",
                    }}>

                      {/* LEFT: intraday flow */}
                      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                        <div style={{ fontWeight: 650, fontSize: 12, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: ".05em" }}>
                          {t("tickersIntraday", "Intraday Flow")}
                        </div>

                        {/* Minute net-premium chart */}
                        <div style={{ border: "1px solid var(--line)", borderRadius: "var(--r-lg)", background: "var(--panel)", padding: "10px 12px" }}>
                          <div style={{ fontWeight: 600, fontSize: 11, color: "var(--text-2)", marginBottom: 6 }}>
                            {t("tickersMinChart", "Minute Net Prem")}
                          </div>
                          <MinuteNetChart minutes={tickerData.minutes} height={80} />
                        </div>

                        {/* Top contracts list */}
                        {tickerData.top_contracts.length > 0 && (
                          <div style={{ border: "1px solid var(--line)", borderRadius: "var(--r-lg)", background: "var(--panel)", overflow: "hidden" }}>
                            <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--line)", fontWeight: 600, fontSize: 11, color: "var(--text-2)" }}>
                              {t("tickersTopContracts", "Top Contracts")}
                            </div>
                            <table className="scr" style={{ fontSize: 11 }}>
                              <thead>
                                <tr>
                                  <th style={{ textAlign: "left" }}>{t("colCP", "C/P")}</th>
                                  <th style={{ textAlign: "left" }}>{lang === "zh" ? "到期日" : "Exp"}</th>
                                  <th>{lang === "zh" ? "行权价" : "Strike"}</th>
                                  <th>{t("colPrem", "Prem")}</th>
                                  <th>{lang === "zh" ? "数量" : "Vol"}</th>
                                  <th>{lang === "zh" ? "标记" : "Flags"}</th>
                                </tr>
                              </thead>
                              <tbody>
                                {tickerData.top_contracts.map((c, i) => (
                                  <tr key={i}>
                                    <td style={{ textAlign: "left" }}>
                                      <span style={{ color: c.right === "C" ? "var(--up)" : "var(--down)", fontWeight: 700 }}>{c.right}</span>
                                    </td>
                                    <td style={{ textAlign: "left", fontVariantNumeric: "tabular-nums", color: "var(--text-2)" }}>{c.exp.slice(5)}</td>
                                    <td style={{ fontVariantNumeric: "tabular-nums" }}>{c.strike}</td>
                                    <td style={{ fontVariantNumeric: "tabular-nums" }}>{fmtPremium(c.premium)}</td>
                                    <td style={{ fontVariantNumeric: "tabular-nums" }}>{c.vol.toLocaleString("en-US")}</td>
                                    <td>
                                      {c.vol_gt_oi && (
                                        <span className="flow-flag-chip">{lang === "zh" ? "量超持仓" : "vol>OI"}</span>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}

                        {/* Expiry bars */}
                        {tickerData.expiries.length > 0 && (
                          <div style={{ border: "1px solid var(--line)", borderRadius: "var(--r-lg)", background: "var(--panel)", padding: "10px 12px" }}>
                            <div style={{ fontWeight: 600, fontSize: 11, color: "var(--text-2)", marginBottom: 8 }}>
                              {t("tickersExpBars", "By Expiry")}
                            </div>
                            <ExpiryBars expiries={tickerData.expiries} lang={lang} />
                          </div>
                        )}
                      </div>

                      {/* RIGHT: strike ladder + vol surface below */}
                      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                        <div style={{ fontWeight: 650, fontSize: 12, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: ".05em" }}>
                          {t("tickersStrikeLadder", "Strike Ladder")} · {t("tickersIvSurface", "Vol Surface")}
                        </div>

                        {/* Strike ladder — fills full column width */}
                        {tickerData.strikes.length > 0 && (
                          <div style={{ border: "1px solid var(--line)", borderRadius: "var(--r-lg)", background: "var(--panel)", padding: "10px 12px" }}>
                            <StrikeLadder
                              strikes={tickerData.strikes}
                              lang={lang}
                              spotRef={volData && volData.root === selectedTicker ? (volData.spot_ref ?? null) : null}
                            />
                          </div>
                        )}

                        {/* Vol surface: IV rank sparkline + term structure + skew */}
                        {volData && volData.root === selectedTicker && !volLoading && (
                          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

                            {/* IV rank history sparkline */}
                            {volData.history.length >= 2 && (
                              <div style={{ border: "1px solid var(--line)", borderRadius: "var(--r-lg)", background: "var(--panel)", padding: "10px 12px" }}>
                                <div style={{ fontWeight: 600, fontSize: 11, color: "var(--text-2)", marginBottom: 6 }}>
                                  {t("tickersIvRankHistory", "IV Rank History")}
                                </div>
                                <IvRankHistory history={volData.history} />
                              </div>
                            )}

                            {/* Term structure */}
                            {volData.term.length >= 2 && (
                              <div style={{ border: "1px solid var(--line)", borderRadius: "var(--r-lg)", background: "var(--panel)", padding: "10px 12px" }}>
                                <div style={{ fontWeight: 600, fontSize: 11, color: "var(--text-2)", marginBottom: 6 }}>
                                  {t("volTermTitle", "Term Structure")}
                                </div>
                                <TermStructureChart term={volData.term} />
                              </div>
                            )}

                            {/* Skew (first two expiries) */}
                            {volData.smile.length > 0 && (
                              <div style={{ border: "1px solid var(--line)", borderRadius: "var(--r-lg)", background: "var(--panel)", padding: "10px 12px" }}>
                                <div style={{ fontWeight: 600, fontSize: 11, color: "var(--text-2)", marginBottom: 6 }}>
                                  {t("volSmileTitle", "Volatility Smile")}
                                </div>
                                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                                  {volData.smile.slice(0, 2).map((se) => (
                                    <div key={se.exp}>
                                      <div style={{ fontSize: 10, color: "var(--text-dim)", marginBottom: 4 }}>
                                        {lang === "zh" ? "到期：" : "Exp: "}{se.exp}
                                      </div>
                                      <SmileChart points={se.points} spotRef={volData.spot_ref ?? null} />
                                    </div>
                                  ))}
                                </div>
                                <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 6, display: "flex", gap: 14 }}>
                                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                    <span style={{ display: "inline-block", width: 10, height: 2, background: "var(--up)" }} />
                                    {lang === "zh" ? "认购IV" : "Call IV"}
                                  </span>
                                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                    <span style={{ display: "inline-block", width: 10, height: 2, borderBottom: "1px dashed var(--down)" }} />
                                    {lang === "zh" ? "认沽IV" : "Put IV"}
                                  </span>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                        {volLoading && (
                          <div style={{ color: "var(--muted)", fontSize: 12, padding: "12px 0" }}>
                            {lang === "zh" ? "波动率数据加载中…" : "Loading vol surface…"}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ═══ SCREENER TAB ═══════════════════════════════════════════════
               Ranked insight views over data already fetched.
               Preset chips each render a sortable table; no new endpoints.
          ═══════════════════════════════════════════════════════════════════ */}
          {activeTab === "screener" && (
            <div style={{ flex: 1, overflow: "auto", padding: "14px 18px", display: "flex", flexDirection: "column", gap: 16 }}>
              {screenerLoading && !oiData && !hotData && !feed && (
                <div className="fin-empty" role="status">{t("loading", "Loading…")}</div>
              )}

              {/* Preset view chip bar */}
              {(feed || oiData || hotData) && (() => {
                type PresetDef = { key: ScreenerPreset; en: string; zh: string; needsFeed?: boolean; needsOi?: boolean; needsHot?: boolean };
                const PRESET_DEFS: PresetDef[] = [
                  { key: "top_prem",  en: "Top Premium",       zh: "保费最大",     needsFeed: true },
                  { key: "unusual_z", en: "Unusual (z)",        zh: "异常（z值）",  needsFeed: true },
                  { key: "fresh",     en: "Fresh Positioning",  zh: "新建仓位",     needsFeed: true },
                  { key: "doi",       en: "ΔOI Builds",         zh: "持仓增长",     needsOi: true },
                  { key: "zerodte",   en: "0DTE Heavy",         zh: "高0DTE占比",   needsFeed: true },
                  { key: "hot",       en: "Hot Contracts",      zh: "热门合约",     needsHot: true },
                ];
                // Filter out chips whose data isn't available
                const available = PRESET_DEFS.filter((p) =>
                  (p.needsFeed && feed) || (p.needsOi && oiData) || (p.needsHot && hotData)
                );
                return (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                    {available.map((p) => (
                      <button
                        key={p.key}
                        className={`chip${screenerPreset === p.key ? " on" : ""}`}
                        style={{ height: 28, fontSize: 12 }}
                        onClick={() => { setScreenerPreset(p.key); setScrSortKey(""); setScrSortDir(-1); }}
                      >
                        {lang === "zh" ? p.zh : p.en}
                      </button>
                    ))}
                    <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-dim)" }}>
                      {lang === "zh" ? "ETF品种覆盖，个股扩展中" : "ETF universe · single names expanding"}
                    </span>
                  </div>
                );
              })()}

              {/* ── Top Premium view — unusual_names sorted by gross_premium_today ── */}
              {screenerPreset === "top_prem" && feed && (() => {
                const rows = [...(feed.unusual_names ?? [])].sort((a, b) => {
                  if (scrSortKey === "gross") return (a.gross_premium_today - b.gross_premium_today) * scrSortDir;
                  if (scrSortKey === "z") return ((a.prem_z ?? -999) - (b.prem_z ?? -999)) * scrSortDir;
                  if (scrSortKey === "call_share") return (a.call_prem_share - b.call_prem_share) * scrSortDir;
                  // default: by gross descending
                  return b.gross_premium_today - a.gross_premium_today;
                });
                const hdr = (key: string, en: string, zh: string, tip?: string) => (
                  <th
                    style={{ cursor: "pointer" }}
                    className={scrSortKey === key ? "sorted" : ""}
                    onClick={() => scrSort(key)}
                    title={tip}
                  >
                    {lang === "zh" ? zh : en}{scrSortKey === key ? (scrSortDir === -1 ? " ↓" : " ↑") : ""}
                  </th>
                );
                return (
                  <div style={{ border: "1px solid var(--line)", borderRadius: "var(--r-lg)", background: "var(--panel)", overflow: "hidden" }}>
                    <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--line)", fontWeight: 650, fontSize: 13 }}>
                      {lang === "zh" ? "保费最大（今日）" : "Top Premium — Today"}
                    </div>
                    <div style={{ overflowX: "auto" }}>
                      <table className="scr" style={{ fontSize: 12 }}>
                        <thead>
                          <tr>
                            <th style={{ textAlign: "left" }}>{lang === "zh" ? "代码" : "Ticker"}</th>
                            <th style={{ textAlign: "left" }}>{t("screenerColSector", "Sector")}</th>
                            {hdr("gross", "Gross Prem", "总保费", "Total premium across all flow events today")}
                            {hdr("z", "Prem z", "保费z值", "z-score vs historical baseline (blank = baseline warming)")}
                            {hdr("call_share", "Call%", "认购占比", "Call premium share of total")}
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((u) => (
                            <tr key={u.root}
                              style={{ cursor: "pointer" }}
                              onClick={() => { switchTab("tickers"); setSelectedTicker(u.root); }}
                            >
                              <td style={{ textAlign: "left", fontWeight: 700 }}>{u.root}</td>
                              <td style={{ textAlign: "left", color: "var(--text-2)", fontSize: 11 }}>
                                {lang === "zh" ? u.group_zh : abbrevSector(u.group)}
                              </td>
                              <td style={{ fontVariantNumeric: "tabular-nums" }}>{fmtPremium(u.gross_premium_today)}</td>
                              <td style={{ fontVariantNumeric: "tabular-nums", color: u.prem_z != null && Math.abs(u.prem_z) > 2 ? "var(--warn)" : "var(--text)" }}>
                                {u.prem_z != null ? u.prem_z.toFixed(1) : <span style={{ color: "var(--text-dim)" }}>—</span>}
                              </td>
                              <td style={{ fontVariantNumeric: "tabular-nums", color: u.call_prem_share > 0.6 ? "var(--up)" : u.call_prem_share < 0.4 ? "var(--down)" : "var(--text)" }}>
                                {(u.call_prem_share * 100).toFixed(1)}%
                              </td>
                            </tr>
                          ))}
                          {rows.length === 0 && (
                            <tr><td colSpan={5} style={{ textAlign: "center", color: "var(--muted)", padding: "30px 0" }}>
                              {lang === "zh" ? "本时段暂无数据" : "No data yet this session"}
                            </td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                    <div style={{ padding: "6px 14px", fontSize: 10, color: "var(--text-dim)", borderTop: "1px solid var(--line)" }}>
                      {lang === "zh" ? "点击行跳转至个股详情。z值为启发式基线估算。" : "Click row to open Tickers drill. z-score is a heuristic baseline estimate."}
                    </div>
                  </div>
                );
              })()}

              {/* ── Unusual (z) view — sorted by prem_z descending ── */}
              {screenerPreset === "unusual_z" && feed && (() => {
                const rows = [...(feed.unusual_names ?? [])]
                  .filter((u) => u.prem_z != null)
                  .sort((a, b) => {
                    if (scrSortKey === "gross") return (a.gross_premium_today - b.gross_premium_today) * scrSortDir;
                    if (scrSortKey === "call_share") return (a.call_prem_share - b.call_prem_share) * scrSortDir;
                    // default: by |z| descending
                    return (Math.abs(b.prem_z ?? 0) - Math.abs(a.prem_z ?? 0)) * (scrSortKey === "z" ? scrSortDir : 1);
                  });
                const warming = (feed.unusual_names ?? []).filter((u) => u.prem_z == null);
                const hdr = (key: string, en: string, zh: string, tip?: string) => (
                  <th style={{ cursor: "pointer" }} className={scrSortKey === key ? "sorted" : ""} onClick={() => scrSort(key)} title={tip}>
                    {lang === "zh" ? zh : en}{scrSortKey === key ? (scrSortDir === -1 ? " ↓" : " ↑") : ""}
                  </th>
                );
                return (
                  <div style={{ border: "1px solid var(--line)", borderRadius: "var(--r-lg)", background: "var(--panel)", overflow: "hidden" }}>
                    <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--line)", fontWeight: 650, fontSize: 13, display: "flex", alignItems: "center", gap: 12 }}>
                      <span>{lang === "zh" ? "异常活跃（z值排序）" : "Unusual Activity — by z-score"}</span>
                      {warming.length > 0 && (
                        <span style={{ fontSize: 11, color: "var(--text-dim)" }}>
                          {lang === "zh" ? `${warming.length} 基线积累中（未显示）` : `${warming.length} warming baselines hidden`}
                        </span>
                      )}
                    </div>
                    <div style={{ overflowX: "auto" }}>
                      <table className="scr" style={{ fontSize: 12 }}>
                        <thead>
                          <tr>
                            <th style={{ textAlign: "left" }}>{lang === "zh" ? "代码" : "Ticker"}</th>
                            <th style={{ textAlign: "left" }}>{t("screenerColSector", "Sector")}</th>
                            {hdr("z", "Prem z", "保费z值", "Signed z-score: |z|>2 = unusual")}
                            {hdr("gross", "Gross", "总保费", "Total premium today")}
                            {hdr("call_share", "Call%", "认购占比")}
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((u) => {
                            const absZ = Math.abs(u.prem_z ?? 0);
                            return (
                              <tr key={u.root} style={{ cursor: "pointer" }} onClick={() => { switchTab("tickers"); setSelectedTicker(u.root); }}>
                                <td style={{ textAlign: "left", fontWeight: 700 }}>{u.root}</td>
                                <td style={{ textAlign: "left", color: "var(--text-2)", fontSize: 11 }}>
                                  {lang === "zh" ? u.group_zh : abbrevSector(u.group)}
                                </td>
                                <td style={{
                                  fontVariantNumeric: "tabular-nums", fontWeight: absZ > 2 ? 700 : 400,
                                  color: absZ > 3 ? "var(--warn)" : absZ > 2 ? "var(--text)" : "var(--text-2)",
                                }}>
                                  {(u.prem_z ?? 0) >= 0 ? "+" : ""}{(u.prem_z ?? 0).toFixed(1)}
                                </td>
                                <td style={{ fontVariantNumeric: "tabular-nums" }}>{fmtPremium(u.gross_premium_today)}</td>
                                <td style={{ fontVariantNumeric: "tabular-nums", color: u.call_prem_share > 0.6 ? "var(--up)" : u.call_prem_share < 0.4 ? "var(--down)" : "var(--text)" }}>
                                  {(u.call_prem_share * 100).toFixed(1)}%
                                </td>
                              </tr>
                            );
                          })}
                          {rows.length === 0 && (
                            <tr><td colSpan={5} style={{ textAlign: "center", color: "var(--muted)", padding: "30px 0" }}>
                              {lang === "zh" ? "基线积累中，暂无z值" : "Baselines warming — no z-scores yet"}
                            </td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                    <div style={{ padding: "6px 14px", fontSize: 10, color: "var(--text-dim)", borderTop: "1px solid var(--line)" }}>
                      {lang === "zh" ? "|z|>2 为统计显著（启发式）；点击行跳转详情。" : "|z|>2 = statistically notable (heuristic). Click row → Tickers drill."}
                    </div>
                  </div>
                );
              })()}

              {/* ── Fresh Positioning view — unusual_names with vol>OI flow count ── */}
              {screenerPreset === "fresh" && feed && (() => {
                // "Fresh" = vol>OI events per ticker today, from feed.events
                const freshCounts: Record<string, number> = {};
                const freshPrem: Record<string, number> = {};
                for (const ev of feed.events ?? []) {
                  if (ev.vol_gt_oi) {
                    freshCounts[ev.root] = (freshCounts[ev.root] ?? 0) + 1;
                    freshPrem[ev.root] = (freshPrem[ev.root] ?? 0) + ev.premium;
                  }
                }
                // Join with unusual_names for sector/group context
                const nameMap: Record<string, { group: string; group_zh: string }> = {};
                for (const u of feed.unusual_names ?? []) nameMap[u.root] = { group: u.group, group_zh: u.group_zh };

                const rows = Object.entries(freshCounts).map(([root, n]) => ({
                  root, n, prem: freshPrem[root] ?? 0,
                  group: nameMap[root]?.group ?? "",
                  group_zh: nameMap[root]?.group_zh ?? "",
                })).sort((a, b) => {
                  if (scrSortKey === "n") return (a.n - b.n) * scrSortDir;
                  if (scrSortKey === "prem") return (a.prem - b.prem) * scrSortDir;
                  return b.prem - a.prem;
                });
                const hdr = (key: string, en: string, zh: string, tip?: string) => (
                  <th style={{ cursor: "pointer" }} className={scrSortKey === key ? "sorted" : ""} onClick={() => scrSort(key)} title={tip}>
                    {lang === "zh" ? zh : en}{scrSortKey === key ? (scrSortDir === -1 ? " ↓" : " ↑") : ""}
                  </th>
                );
                return (
                  <div style={{ border: "1px solid var(--line)", borderRadius: "var(--r-lg)", background: "var(--panel)", overflow: "hidden" }}>
                    <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--line)", fontWeight: 650, fontSize: 13 }}>
                      {lang === "zh" ? "新建仓位（vol>OI 信号）" : "Fresh Positioning — vol > OI signals"}
                    </div>
                    <div style={{ overflowX: "auto" }}>
                      <table className="scr" style={{ fontSize: 12 }}>
                        <thead>
                          <tr>
                            <th style={{ textAlign: "left" }}>{lang === "zh" ? "代码" : "Ticker"}</th>
                            <th style={{ textAlign: "left" }}>{t("screenerColSector", "Sector")}</th>
                            {hdr("n", "Fresh hits", "新开仓次数", "Number of vol>OI events today")}
                            {hdr("prem", "Prem", "保费", "Total premium on vol>OI events")}
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((r) => (
                            <tr key={r.root} style={{ cursor: "pointer" }} onClick={() => { switchTab("tickers"); setSelectedTicker(r.root); }}>
                              <td style={{ textAlign: "left", fontWeight: 700 }}>{r.root}</td>
                              <td style={{ textAlign: "left", color: "var(--text-2)", fontSize: 11 }}>
                                {lang === "zh" ? r.group_zh : abbrevSector(r.group)}
                              </td>
                              <td style={{ fontVariantNumeric: "tabular-nums" }}>{r.n}</td>
                              <td style={{ fontVariantNumeric: "tabular-nums" }}>{fmtPremium(r.prem)}</td>
                            </tr>
                          ))}
                          {rows.length === 0 && (
                            <tr><td colSpan={4} style={{ textAlign: "center", color: "var(--muted)", padding: "30px 0" }}>
                              {lang === "zh" ? "本时段暂无 vol>OI 信号" : "No vol>OI signals this session"}
                            </td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                    <div style={{ padding: "6px 14px", fontSize: 10, color: "var(--text-dim)", borderTop: "1px solid var(--line)" }}>
                      {lang === "zh" ? "vol>OI 表示当日成交量超过昨日持仓，为新开仓信号（非确认）。" : "vol>OI means today's volume exceeds prior OI — a fresh-positioning signal (not confirmed)."}
                    </div>
                  </div>
                );
              })()}

              {/* ── ΔOI Builds view — oiData.movers ── */}
              {screenerPreset === "doi" && oiData && (() => {
                const rows = [...oiData.movers].sort((a, b) => {
                  if (scrSortKey === "doi") return (Math.abs(a.d_oi) - Math.abs(b.d_oi)) * scrSortDir;
                  if (scrSortKey === "oi") return (a.oi - b.oi) * scrSortDir;
                  if (scrSortKey === "mid") return ((a.mid ?? 0) - (b.mid ?? 0)) * scrSortDir;
                  // default: |ΔOI| desc
                  return Math.abs(b.d_oi) - Math.abs(a.d_oi);
                });
                const hdr = (key: string, en: string, zh: string, tip?: string) => (
                  <th style={{ cursor: "pointer" }} className={scrSortKey === key ? "sorted" : ""} onClick={() => scrSort(key)} title={tip}>
                    {lang === "zh" ? zh : en}{scrSortKey === key ? (scrSortDir === -1 ? " ↓" : " ↑") : ""}
                  </th>
                );
                return (
                  <div style={{ border: "1px solid var(--line)", borderRadius: "var(--r-lg)", background: "var(--panel)", overflow: "hidden" }}>
                    <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--line)", fontWeight: 650, fontSize: 13, display: "flex", alignItems: "center", gap: 12 }}>
                      <span>{lang === "zh" ? "持仓增长（ΔOI）" : "OI Builds — ΔOI"}</span>
                      <span style={{ fontSize: 11, color: "var(--text-dim)" }}>
                        {lang === "zh" ? "截至上一交易日" : "as of previous session"}
                      </span>
                    </div>
                    <div style={{ overflowX: "auto" }}>
                      <table className="scr" style={{ fontSize: 12 }}>
                        <thead>
                          <tr>
                            <th style={{ textAlign: "left" }}>{lang === "zh" ? "代码" : "Ticker"}</th>
                            <th style={{ textAlign: "left" }}>{lang === "zh" ? "认购/认沽" : "C/P"}</th>
                            <th style={{ textAlign: "left" }}>{lang === "zh" ? "到期日" : "Exp"}</th>
                            <th>{lang === "zh" ? "行权价" : "Strike"}</th>
                            {hdr("doi", "ΔOI", "持仓变动", "Open interest change (t-1 vs t-2)")}
                            {hdr("oi", "OI t-1", "持仓（前日）")}
                            {hdr("mid", "Mid", "中间价")}
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((m, i) => {
                            const isAdd = m.d_oi > 0;
                            return (
                              <tr key={i} style={{ cursor: "pointer" }} onClick={() => { switchTab("tickers"); setSelectedTicker(m.root); }}>
                                <td style={{ textAlign: "left", fontWeight: 700 }}>{m.root}</td>
                                <td style={{ textAlign: "left" }}>
                                  <span style={{ color: m.right === "C" ? "var(--up)" : "var(--down)", fontWeight: 700 }}>{m.right}</span>
                                </td>
                                <td style={{ textAlign: "left", color: "var(--text-2)", fontVariantNumeric: "tabular-nums" }}>{m.exp.slice(5)}</td>
                                <td style={{ fontVariantNumeric: "tabular-nums" }}>{m.strike}</td>
                                <td style={{ fontVariantNumeric: "tabular-nums", fontWeight: 700, color: isAdd ? "var(--up)" : "var(--down)" }}>
                                  {isAdd ? "+" : ""}{m.d_oi.toLocaleString("en-US")}
                                </td>
                                <td style={{ fontVariantNumeric: "tabular-nums" }}>{m.oi.toLocaleString("en-US")}</td>
                                <td style={{ fontVariantNumeric: "tabular-nums", color: "var(--text-2)" }}>
                                  {m.mid != null ? `$${m.mid.toFixed(2)}` : "—"}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div style={{ padding: "6px 14px", fontSize: 10, color: "var(--text-dim)", borderTop: "1px solid var(--line)" }}>
                      {lang === "zh" ? "ΔOI为前两个交易日持仓差值，不代表当日方向。" : "ΔOI = OI(t-1)−OI(t-2); does not imply direction of today's flow."}
                    </div>
                  </div>
                );
              })()}

              {/* ── 0DTE Heavy view — aggregate 0DTE premium per ticker ── */}
              {screenerPreset === "zerodte" && feed && (() => {
                // Aggregate 0DTE premium per ticker from feed events
                const zdPrem: Record<string, number> = {};
                const totalPrem: Record<string, number> = {};
                const nameMap2: Record<string, { group: string; group_zh: string }> = {};
                for (const ev of feed.events ?? []) {
                  totalPrem[ev.root] = (totalPrem[ev.root] ?? 0) + ev.premium;
                  if (ev.zerodte) zdPrem[ev.root] = (zdPrem[ev.root] ?? 0) + ev.premium;
                  nameMap2[ev.root] = { group: ev.group, group_zh: ev.group_zh };
                }
                const rows = Object.keys(zdPrem).map((root) => ({
                  root,
                  zd_prem: zdPrem[root],
                  zd_share: zdPrem[root] / (totalPrem[root] || 1),
                  group: nameMap2[root]?.group ?? "",
                  group_zh: nameMap2[root]?.group_zh ?? "",
                })).sort((a, b) => {
                  if (scrSortKey === "share") return (a.zd_share - b.zd_share) * scrSortDir;
                  if (scrSortKey === "prem") return (a.zd_prem - b.zd_prem) * scrSortDir;
                  return b.zd_prem - a.zd_prem;
                });
                const hdr = (key: string, en: string, zh: string, tip?: string) => (
                  <th style={{ cursor: "pointer" }} className={scrSortKey === key ? "sorted" : ""} onClick={() => scrSort(key)} title={tip}>
                    {lang === "zh" ? zh : en}{scrSortKey === key ? (scrSortDir === -1 ? " ↓" : " ↑") : ""}
                  </th>
                );
                return (
                  <div style={{ border: "1px solid var(--line)", borderRadius: "var(--r-lg)", background: "var(--panel)", overflow: "hidden" }}>
                    <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--line)", fontWeight: 650, fontSize: 13 }}>
                      {lang === "zh" ? "高0DTE占比" : "0DTE Heavy"}
                    </div>
                    <div style={{ overflowX: "auto" }}>
                      <table className="scr" style={{ fontSize: 12 }}>
                        <thead>
                          <tr>
                            <th style={{ textAlign: "left" }}>{lang === "zh" ? "代码" : "Ticker"}</th>
                            <th style={{ textAlign: "left" }}>{t("screenerColSector", "Sector")}</th>
                            {hdr("prem", "0DTE Prem", "0DTE保费", "Premium in 0DTE contracts today")}
                            {hdr("share", "0DTE%", "0DTE占比", "0DTE share of total flow premium")}
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((r) => (
                            <tr key={r.root} style={{ cursor: "pointer" }} onClick={() => { switchTab("tickers"); setSelectedTicker(r.root); }}>
                              <td style={{ textAlign: "left", fontWeight: 700 }}>{r.root}</td>
                              <td style={{ textAlign: "left", color: "var(--text-2)", fontSize: 11 }}>
                                {lang === "zh" ? r.group_zh : abbrevSector(r.group)}
                              </td>
                              <td style={{ fontVariantNumeric: "tabular-nums" }}>{fmtPremium(r.zd_prem)}</td>
                              <td style={{ fontVariantNumeric: "tabular-nums", color: r.zd_share > 0.5 ? "var(--warn)" : "var(--text)" }}>
                                {(r.zd_share * 100).toFixed(1)}%
                              </td>
                            </tr>
                          ))}
                          {rows.length === 0 && (
                            <tr><td colSpan={4} style={{ textAlign: "center", color: "var(--muted)", padding: "30px 0" }}>
                              {lang === "zh" ? "本时段暂无0DTE事件" : "No 0DTE events this session"}
                            </td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                    <div style={{ padding: "6px 14px", fontSize: 10, color: "var(--text-dim)", borderTop: "1px solid var(--line)" }}>
                      {lang === "zh" ? "0DTE=当日到期合约；高占比可能反映日内投机活动。" : "0DTE = same-day expiry contracts. High share may indicate intraday speculative activity."}
                    </div>
                  </div>
                );
              })()}

              {/* ── Hot Contracts view — hotData by_premium / by_volume ── */}
              {screenerPreset === "hot" && hotData && (
                <div style={{ border: "1px solid var(--line)", borderRadius: "var(--r-lg)", background: "var(--panel)", overflow: "hidden" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderBottom: "1px solid var(--line)" }}>
                    <span style={{ fontWeight: 650, fontSize: 13 }}>
                      {lang === "zh" ? "热门合约" : "Hot Contracts"}
                    </span>
                    <div style={{ display: "flex", gap: 4, marginLeft: "auto" }}>
                      <button
                        className={`chip${hotView === "by_premium" ? " on" : ""}`}
                        style={{ height: 26, fontSize: 11 }}
                        onClick={() => setHotView("by_premium")}
                      >
                        {t("screenerByPrem", "By Premium")}
                      </button>
                      <button
                        className={`chip${hotView === "by_volume" ? " on" : ""}`}
                        style={{ height: 26, fontSize: 11 }}
                        onClick={() => setHotView("by_volume")}
                      >
                        {t("screenerByVol", "By Volume")}
                      </button>
                    </div>
                  </div>
                  <div style={{ overflowX: "auto" }}>
                    <table className="scr" style={{ fontSize: 12 }}>
                      <thead>
                        <tr>
                          <th style={{ textAlign: "left" }}>{t("colTicker", "Ticker")}</th>
                          <th style={{ textAlign: "left" }}>{t("colRight", "C/P")}</th>
                          <th style={{ textAlign: "left" }}>{t("colExp", "Exp")}</th>
                          <th>{t("colStrike", "Strike")}</th>
                          <th>{t("colPrem", "Prem")}</th>
                          <th>{t("colVol", "Vol")}</th>
                          <th>{t("colClose", "Close")}</th>
                          <th>{t("colVolGtOi", "vol>OI")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(hotData[hotView] ?? []).map((c, i) => (
                          <tr key={i} style={{ cursor: "pointer" }} onClick={() => { switchTab("tickers"); setSelectedTicker(c.root); }}>
                            <td style={{ textAlign: "left", fontWeight: 700 }}>{c.root}</td>
                            <td style={{ textAlign: "left" }}>
                              <span style={{ color: c.right === "C" ? "var(--up)" : "var(--down)", fontWeight: 700 }}>{c.right}</span>
                            </td>
                            <td style={{ textAlign: "left", color: "var(--text-2)", fontVariantNumeric: "tabular-nums" }}>{c.exp.slice(5)}</td>
                            <td style={{ fontVariantNumeric: "tabular-nums" }}>{c.strike}</td>
                            <td style={{ fontVariantNumeric: "tabular-nums" }}>{fmtPremium(c.premium)}</td>
                            <td style={{ fontVariantNumeric: "tabular-nums" }}>{c.vol.toLocaleString("en-US")}</td>
                            <td style={{ fontVariantNumeric: "tabular-nums", color: "var(--text-2)" }}>{c.close.toFixed(2)}</td>
                            <td>
                              {c.vol_gt_oi && (
                                <span className="flow-flag-chip">{lang === "zh" ? "量超持仓" : "vol>OI"}</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ padding: "6px 14px", fontSize: 10, color: "var(--text-dim)", borderTop: "1px solid var(--line)" }}>
                    {lang === "zh" ? "ETF覆盖；仅供展示参考，非投资建议。" : "ETF universe. Display only — not investment advice."}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ═══ VOL TAB ════════════════════════════════════════════════════ */}
          {activeTab === "vol" && (
            <div style={{ flex: 1, overflow: "hidden", display: "flex", minHeight: 0 }}>
              {/* Sidebar */}
              <div style={{ width: 200, flexShrink: 0, borderRight: "1px solid var(--line)", display: "flex", flexDirection: "column", minHeight: 0 }}>
                <div style={{ padding: "10px 10px 8px" }}>
                  <input
                    type="text"
                    placeholder={lang === "zh" ? "搜索代码…" : "Search ticker…"}
                    value={volSearch}
                    onChange={(e) => setVolSearch(e.target.value)}
                    style={{ width: "100%", height: 30, padding: "0 10px", borderRadius: "var(--r-md)", background: "var(--inset)", border: "1px solid var(--line)", color: "var(--text)", font: "13px var(--font-ui)" }}
                  />
                </div>
                <div style={{ flex: 1, overflow: "auto" }}>
                  {filteredVolCandidates.map((root) => (
                    <button
                      key={root}
                      onClick={() => setSelectedVolRoot(root)}
                      style={{
                        display: "flex", alignItems: "center", gap: 8, width: "100%",
                        padding: "8px 12px", textAlign: "left", fontSize: 13,
                        fontWeight: selectedVolRoot === root ? 700 : 400,
                        color: selectedVolRoot === root ? "var(--text)" : "var(--text-2)",
                        background: selectedVolRoot === root ? "rgba(41,98,255,.1)" : "none",
                        borderRadius: "var(--r)", cursor: "pointer", transition: "background var(--t)",
                      }}
                      onMouseEnter={(e) => { if (selectedVolRoot !== root) e.currentTarget.style.background = "var(--panel-2)"; }}
                      onMouseLeave={(e) => { if (selectedVolRoot !== root) e.currentTarget.style.background = "none"; }}
                    >
                      {root}
                    </button>
                  ))}
                </div>
              </div>

              {/* Vol drill pane */}
              <div style={{ flex: 1, overflow: "auto", padding: "16px 18px" }}>
                {!selectedVolRoot && (
                  <div style={{ color: "var(--muted)", fontSize: 13, padding: "40px 0", textAlign: "center" }}>
                    {t("volRootPrompt", "Select a root to view volatility analytics")}
                  </div>
                )}
                {selectedVolRoot && volLoading && (
                  <div className="fin-empty" role="status">{t("loading", "Loading…")}</div>
                )}
                {selectedVolRoot && !volLoading && volData && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

                    {/* IV Rank hero */}
                    <div style={{ border: "1px solid var(--line)", borderRadius: "var(--r-lg)", background: "var(--panel)", padding: "18px 20px" }}>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 28, alignItems: "flex-start" }}>
                        {/* Big IV rank number — primary: 252d; secondary: full-history if available */}
                        <div>
                          <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>
                            {t("volIvRank", "IV Rank (252d)")}
                          </div>
                          {volData.iv_rank_252 != null ? (
                            <>
                              <div style={{ fontWeight: 700, fontSize: 36, lineHeight: 1, color: volData.iv_rank_252 > 75 ? "var(--down)" : volData.iv_rank_252 > 50 ? "var(--warn)" : "var(--up)" }}>
                                {volData.iv_rank_252.toFixed(1)}
                              </div>
                              <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 4 }}>
                                {lang === "zh" ? "分位（0–100）" : "percentile (0–100)"}
                              </div>
                              {/* Full-history rank, when present */}
                              {volData.iv_rank_all != null && (
                                <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 6, fontVariantNumeric: "tabular-nums" }}>
                                  {t("volIvRankFull", "full-history")}
                                  {volData.coverage_days_all != null
                                    ? ` (${Math.round(volData.coverage_days_all / 252)}y)`
                                    : ""}: <strong style={{ color: "var(--text-2)" }}>{volData.iv_rank_all.toFixed(1)}</strong>
                                  {volData.since_all && (
                                    <span style={{ color: "var(--text-dim)", marginLeft: 4 }}>since {volData.since_all}</span>
                                  )}
                                </div>
                              )}
                              {/* 52w range bar */}
                              <div style={{ marginTop: 10, width: 160 }}>
                                <div style={{ height: 6, borderRadius: 4, background: "var(--panel-3)", position: "relative", overflow: "visible" }}>
                                  <div style={{
                                    position: "absolute", left: 0, top: 0, height: "100%",
                                    width: `${volData.iv_rank_252}%`,
                                    background: volData.iv_rank_252 > 75 ? "var(--down)" : volData.iv_rank_252 > 50 ? "var(--warn)" : "var(--up)",
                                    borderRadius: 4,
                                  }} />
                                </div>
                                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--text-dim)", marginTop: 3 }}>
                                  <span>0</span>
                                  <span>100</span>
                                </div>
                              </div>
                            </>
                          ) : (
                            <div style={{ fontWeight: 600, fontSize: 15, color: "var(--muted)", marginTop: 4 }}>
                              {lang === "zh" ? "基线积累中" : "warming"}
                            </div>
                          )}
                        </div>

                        {/* Stat mini-cards */}
                        {[
                          { key: "volAtmIv", label: "ATM IV", v: (volData.atm_iv * 100).toFixed(1) + "%" },
                          { key: "vol52wHi", label: "52w Hi", v: (volData.iv_52w_hi * 100).toFixed(1) + "%" },
                          { key: "vol52wLo", label: "52w Lo", v: (volData.iv_52w_lo * 100).toFixed(1) + "%" },
                          { key: "volRv20", label: "RV (20d)", v: (volData.rv20 * 100).toFixed(1) + "%" },
                          { key: "volVrp", label: "VRP (IV-RV)", v: ((volData.vrp) * 100).toFixed(1) + "%", color: volData.vrp > 0 ? "var(--down)" : "var(--up)" },
                        ].map((kv) => (
                          <div key={kv.key}>
                            <div className="hub-sec">
                              {t(kv.key, kv.label)}
                            </div>
                            <div style={{ fontWeight: 650, fontSize: 15, color: (kv as any).color ?? "var(--text)", fontVariantNumeric: "tabular-nums" }}>
                              {kv.v}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Term structure chart */}
                    {volData.term.length >= 2 && (
                      <div className="hub-card">
                        <div className="hub-stat">
                          {t("volTermTitle", "Term Structure")}
                        </div>
                        <TermStructureChart term={volData.term} />
                      </div>
                    )}

                    {/* Volatility smile */}
                    {volData.smile.length > 0 && (
                      <div className="hub-card">
                        <div className="hub-stat">
                          {t("volSmileTitle", "Volatility Smile")}
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                          {volData.smile.slice(0, 2).map((se) => (
                            <div key={se.exp}>
                              <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 6 }}>
                                {lang === "zh" ? "到期：" : "Exp: "}{se.exp}
                              </div>
                              <SmileChart points={se.points} spotRef={volData.spot_ref ?? null} />
                            </div>
                          ))}
                        </div>
                        <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 8, display: "flex", gap: 16 }}>
                          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <span style={{ display: "inline-block", width: 10, height: 2, background: "var(--up)" }} />
                            {lang === "zh" ? "认购IV" : "Call IV"}
                          </span>
                          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <span style={{ display: "inline-block", width: 10, height: 2, borderBottom: "1px dashed var(--down)" }} />
                            {lang === "zh" ? "认沽IV" : "Put IV"}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* IV Rank history sparkline */}
                    {volData.history.length >= 2 && (
                      <div className="hub-card">
                        <div className="hub-stat">
                          {t("volHistTitle", "IV Rank History (90 sessions)")}
                        </div>
                        <IvRankHistory history={volData.history} />
                      </div>
                    )}

                    {/* Coverage */}
                    <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
                      {lang === "zh"
                        ? `数据覆盖：${volData.coverage.n_days} 天，起始 ${volData.coverage.since}`
                        : `Coverage: ${volData.coverage.n_days} days since ${volData.coverage.since}`}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ═══ GEX TAB ════════════════════════════════════════════════════ */}
          {/* Wave 2: replaced inline GEX panel with GexDeskView (see components/gexdesk/).
              Old inline code retained below as a comment so other waves can reference the
              GexStrikeLadder / GexExpiryBars / GexHistSparkline sub-components.
              ── OLD INLINE CODE PRESERVED (do not delete) ──────────────────────
              The inline GEX sidebar + drill pane that was here used:
                selectedGexRoot, gexData, gexLoading, gexGreek, gexSearch,
                gexCandidates, filteredGexCandidates, ctxData, fetchGex,
                GexStrikeLadder, GexExpiryBars, GexHistSparkline
              All those state vars / components are still defined above and remain available
              for any wave that imports or extends this file.
              ──────────────────────────────────────────────────────────────────── */}
          {visitedTabs.has("gex") && (
            <div style={{ flex: 1, overflow: "hidden", display: activeTab === "gex" ? "flex" : "none", minHeight: 0 }}>
              <GexDeskView />
            </div>
          )}

          {/* ═══ PRISM TAB ══════════════════════════════════════════════════ */}
          {visitedTabs.has("prism") && (
            <div style={{ flex: 1, overflow: "hidden", display: activeTab === "prism" ? "flex" : "none", minHeight: 0 }}>
              <PrismView />
            </div>
          )}

          {/* ═══ PROPHET TAB ════════════════════════════════════════════════ */}
          {visitedTabs.has("prophet") && (
            <div style={{ flex: 1, overflow: "hidden", display: activeTab === "prophet" ? "flex" : "none", minHeight: 0 }}>
              <ProphetView />
            </div>
          )}

          {/* ═══ LEADERS TAB ════════════════════════════════════════════════ */}
          {activeTab === "leaders" && (
            <div style={{ flex: 1, overflow: "auto", padding: "14px 16px" }}>
              {/* Loading */}
              {leadersLoading && !leadersData && (
                <div className="fin-empty" role="status" style={{ color: "var(--muted)" }}>
                  {t("loading", "Loading…")}
                </div>
              )}

              {/* Error / absent */}
              {leadersError && !leadersData && (
                <div style={{ padding: "40px 20px", textAlign: "center" }}>
                  <div style={{ fontSize: 14, color: "var(--text-2)", marginBottom: 8 }}>
                    {t("leadersAbsent", "Flow Leaders publishes after tonight's build")}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>
                    {lang === "zh" ? "数据每晚收盘后构建" : "Data builds nightly after market close"}
                  </div>
                </div>
              )}

              {leadersData && (() => {
                const cov = leadersData.coverage;
                // Render all rows as delivered — server already caps at 25 per board.
                // No client-side qualification filter: accruing rows (all legs null) render so the
                // board shows honestly. Chips/badges convey state. Sorted by K desc for signal rows.
                const boardARows = [...leadersData.board_a].sort((a, b) => b.K_a - a.K_a);
                const boardBRows = [...leadersData.board_b].sort((a, b) => b.K_b - a.K_b);
                const displayRows = leadersBoard === "a" ? boardARows : boardBRows;

                return (
                  <>
                    {/* ── Header strip ── */}
                    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, marginBottom: 10 }}>
                      <span style={{ fontSize: 11, color: "var(--text-dim)", fontVariantNumeric: "tabular-nums" }}>
                        {t("asOf", "as of")} {fmtAsof(leadersData.as_of)}
                      </span>
                      <span style={{ fontSize: 11, color: "var(--muted)" }}>
                        {lang === "zh"
                          ? `前 ${displayRows.length} / 共 ${cov.n_universe}`
                          : `top ${displayRows.length} of ${cov.n_universe}`}
                        {" · "}
                        {(() => {
                          const reqSessions = leadersData.cold_start_detail?.required_for_recurrence ?? 5;
                          return lang === "zh"
                            ? `会话 ${cov.n_flow_sessions}/${reqSessions}`
                            : `sessions ${cov.n_flow_sessions}/${reqSessions}`;
                        })()}
                      </span>
                      {leadersData.stale && (
                        <span style={{ fontSize: 11, color: "var(--warn)", fontWeight: 600 }}>
                          {t("leadersStale", "Snapshot from prior session")}
                        </span>
                      )}
                    </div>

                    {/* Cold-start banner */}
                    {leadersData.cold_start && (
                      <div style={{
                        padding: "8px 12px", borderRadius: "var(--r-md)",
                        background: "color-mix(in srgb, var(--warn) 10%, transparent)",
                        border: "1px solid color-mix(in srgb, var(--warn) 30%, transparent)",
                        fontSize: 12, color: "var(--warn)", marginBottom: 10,
                      }}>
                        {leadersData.cold_start_detail?.message
                          ?? (lang === "zh"
                            ? "基线建立中 — 今晚构建后发布"
                            : "Baseline building — publishes after tonight's nightly run")}
                      </div>
                    )}

                    {/* Direction note */}
                    {leadersData.direction_note && (
                      <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 10, fontStyle: "italic" }}>
                        {leadersData.direction_note}
                      </div>
                    )}

                    {/* ── Board toggle ── */}
                    <div style={{ display: "flex", gap: 6, marginBottom: 14, alignItems: "center" }}>
                      <button
                        className={`chip${leadersBoard === "a" ? " on" : ""}`}
                        style={{ height: 26, fontSize: 11 }}
                        onClick={() => setLeadersBoard("a")}
                      >
                        {t("leadersBoardALbl", "Flow Leadership")}
                      </button>
                      <button
                        className={`chip${leadersBoard === "b" ? " on" : ""}`}
                        style={{ height: 26, fontSize: 11 }}
                        onClick={() => setLeadersBoard("b")}
                      >
                        {t("leadersBoardBLbl", "Washout Turn")}
                      </button>
                    </div>

                    {/* ── Table ── */}
                    {displayRows.length === 0 ? (
                      <div style={{ padding: "30px 0", textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
                        {t("leadersNoQualifying", "No qualifying names yet — updates after tonight's build")}
                      </div>
                    ) : (
                      <div className="obs-scroll" style={{ overflowX: "auto" }}>
                        <table className="scr" style={{ fontSize: 12, minWidth: 680 }}>
                          <thead>
                            <tr>
                              <th style={{ textAlign: "left", minWidth: 60 }}>
                                {t("leadersColTicker", "Ticker")}
                              </th>
                              <th style={{ textAlign: "center", minWidth: 56 }}>
                                {leadersBoard === "a" ? t("leadersColRecur", "Recur") : t("leadersColDays", "Days")}
                              </th>
                              {leadersBoard === "a" && (
                                <th style={{ textAlign: "right", minWidth: 80 }}>
                                  {t("leadersNetPremNorm", "Net Prem / $bn cap (~)")}
                                </th>
                              )}
                              {leadersBoard === "a" && (
                                <th style={{ textAlign: "right", minWidth: 56 }}>
                                  {t("leadersFlowZ", "flow z")}
                                </th>
                              )}
                              <th style={{ textAlign: "center", minWidth: 80 }}>
                                {t("leadersKN", "K/N legs")}
                              </th>
                              {leadersBoard === "b" && (
                                <th style={{ textAlign: "left", minWidth: 120 }}>
                                  {t("leadersColOsc", "Oscillators")}
                                </th>
                              )}
                              <th style={{ textAlign: "left", minWidth: 140 }}>
                                {t("leadersColFlags", "Flags")}
                              </th>
                              <th style={{ textAlign: "left", minWidth: 80 }}>
                                {t("leadersColSource", "Source")}
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {displayRows.map((row) => {
                              const isA = leadersBoard === "a";
                              const K = isA ? row.K_a : row.K_b;
                              const nAvail = isA ? row.n_avail_a : row.n_avail_b;
                              const recur = isA ? row.recurrence_count : row.days_since_inflection;
                              // Leg definitions for Board A
                              const aLegs: [string, boolean | null][] = [
                                ["A1 flow recur", row.A1_flow_recur],
                                ["A2 flow z hot", row.A2_flow_z_hot],
                                ["A3 OI conf", row.A3_oi_confirmed as boolean | null],
                                ["A4 breadth", row.A4_ts_breadth],
                                ["A5 price lead", row.A5_price_leader],
                                ["A6 near high", row.A6_near_high],
                                ["A7 vol conf", row.A7_vol_confirm],
                                ["A8 not trap", row.A8_not_trap],
                              ];
                              const bLegs: [string, boolean | null][] = [
                                ["B1 washout", row.B1_washout_recent],
                                ["B2 oversold", row.B2_oversold_osc],
                                ["B3 turn", row.B3_turn_organ],
                                ["B4 HTF cross", row.B4_htf_cross_near],
                                ["B5 flow inflect", row.B5_flow_inflect],
                                ["B6 OI conf", row.B6_oi_confirmed as boolean | null],
                                ["B7 vol conf", row.B7_vol_confirm],
                                ["B8 not trap", row.B8_not_trap],
                              ];
                              const legs = isA ? aLegs : bLegs;
                              // Only legs that scored (not null)
                              const scoredLegs = legs.filter(([, v]) => v !== null);

                              const de = row.de_escalation;
                              const warnEarnings = de.earnings_window === true;
                              const warnVol = de.vol_trade === true;
                              const warnPut = de.protective_put === true;
                              const warnGamma = de.gamma_caution;

                              return (
                                <tr
                                  key={row.ticker}
                                  style={{ cursor: "pointer" }}
                                  onClick={() => {
                                    switchTab("tickers");
                                    setSelectedTicker(row.ticker);
                                  }}
                                >
                                  {/* Ticker */}
                                  <td style={{ fontWeight: 700, color: "var(--text)" }}>
                                    {row.ticker}
                                  </td>

                                  {/* Recur / Days */}
                                  <td style={{ textAlign: "center" }}>
                                    {recur !== null && recur !== undefined
                                      ? recur
                                      : (
                                        <span style={{ fontSize: 10, color: "var(--muted)", fontStyle: "italic" }}>
                                          {t("leadersAccruing", "accruing")}
                                        </span>
                                      )}
                                  </td>

                                  {/* Net prem norm (Board A only) — normalized ratio abs(net_premium_mn / mktcap_bn) */}
                                  {isA && (
                                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: "var(--text-2)" }}>
                                      {row.net_prem_norm_abs !== null && row.net_prem_norm_abs !== undefined
                                        ? `~${row.net_prem_norm_abs.toFixed(2)}`
                                        : <span style={{ color: "var(--muted)" }}>—</span>}
                                    </td>
                                  )}

                                  {/* Flow z (Board A only) */}
                                  {isA && (
                                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                                      {row.flow_z !== null && row.flow_z !== undefined
                                        ? (
                                          <span style={{
                                            display: "inline-block", padding: "1px 5px", borderRadius: 3,
                                            background: "var(--panel-3)", fontSize: 11,
                                            color: Math.abs(row.flow_z) >= 2 ? "var(--warn)" : "var(--text-2)",
                                          }}>
                                            {row.flow_z.toFixed(1)}
                                          </span>
                                        )
                                        : <span style={{ color: "var(--muted)" }}>—</span>}
                                    </td>
                                  )}

                                  {/* K/N chip cluster */}
                                  <td style={{ textAlign: "center" }}>
                                    <div style={{ display: "flex", gap: 2, justifyContent: "center", flexWrap: "wrap" }}>
                                      <span style={{
                                        fontSize: 11, fontWeight: 700,
                                        color: K >= 2 ? "var(--up)" : K >= 1 ? "var(--warn)" : "var(--muted)",
                                        marginRight: 3,
                                      }}>
                                        {K}/{nAvail}
                                      </span>
                                      {scoredLegs.map(([label, val]) => (
                                        <span
                                          key={label}
                                          title={label}
                                          style={{
                                            display: "inline-block", width: 8, height: 8,
                                            borderRadius: 2,
                                            background: val === true
                                              ? "var(--up)"
                                              : val === false
                                              ? "rgba(240,86,107,.4)"
                                              : "var(--panel-3)",
                                            border: "1px solid var(--line-3)",
                                          }}
                                        />
                                      ))}
                                    </div>
                                  </td>

                                  {/* Board B oscillators */}
                                  {!isA && (
                                    <td>
                                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
                                        {row.macd_2w_state && row.macd_2w_state !== "none" && (
                                          <span style={{
                                            fontSize: 10, padding: "1px 5px", borderRadius: 3,
                                            background: row.macd_2w_state === "crossed" ? "rgba(38,194,129,.2)" : "rgba(232,163,61,.15)",
                                            color: row.macd_2w_state === "crossed" ? "var(--up)" : "var(--warn)",
                                          }}>
                                            {row.macd_2w_state === "crossed"
                                              ? t("leadersMacdCrossed", `MACD ×${row.macd_2w_bars_since ?? ""}`).replace("{n}", String(row.macd_2w_bars_since ?? ""))
                                              : t("leadersMacdApproach", `MACD ~${row.macd_2w_bars_to_cross != null ? row.macd_2w_bars_to_cross.toFixed(1) + "b" : "?"}`).replace("{b}", row.macd_2w_bars_to_cross != null ? row.macd_2w_bars_to_cross.toFixed(1) + "b" : "?")}
                                          </span>
                                        )}
                                        {row.stochrsi_2w_oversold === true && (
                                          <span style={{ fontSize: 10, padding: "1px 5px", borderRadius: 3, background: "rgba(38,194,129,.15)", color: "var(--up)" }}>
                                            {t("leadersOversoldChip", "oversold")}
                                          </span>
                                        )}
                                        {row.htf_coverage && row.stochrsi_2w_k !== null && (
                                          <span style={{ fontSize: 10, color: "var(--muted)", fontVariantNumeric: "tabular-nums" }}>
                                            K{row.stochrsi_2w_k.toFixed(0)}
                                          </span>
                                        )}
                                      </div>
                                    </td>
                                  )}

                                  {/* Warn chips + 0DTE */}
                                  <td>
                                    <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                                      {warnEarnings && (
                                        <span style={{ fontSize: 10, padding: "1px 5px", borderRadius: 3, background: "rgba(240,86,107,.15)", color: "var(--down)" }}>
                                          {t("leadersWarnEarningsShort", "earns")}
                                        </span>
                                      )}
                                      {warnVol && (
                                        <span style={{ fontSize: 10, padding: "1px 5px", borderRadius: 3, background: "rgba(232,163,61,.15)", color: "var(--warn)" }}>
                                          {t("leadersWarnVolShort", "vol")}
                                        </span>
                                      )}
                                      {warnPut && (
                                        <span style={{ fontSize: 10, padding: "1px 5px", borderRadius: 3, background: "rgba(240,86,107,.12)", color: "var(--down)" }}>
                                          {t("leadersWarnPutShort", "put hedge")}
                                        </span>
                                      )}
                                      {warnGamma && (
                                        <span style={{ fontSize: 10, padding: "1px 5px", borderRadius: 3, background: "rgba(232,163,61,.12)", color: "var(--warn)" }}>
                                          {t("leadersWarnGammaShort", "gamma")}
                                        </span>
                                      )}
                                      {row.zerodte_dominated && (
                                        <span style={{ fontSize: 10, padding: "1px 5px", borderRadius: 3, background: "var(--panel-3)", color: "var(--text-dim)" }}>
                                          0DTE
                                        </span>
                                      )}
                                    </div>
                                  </td>

                                  {/* Source tag */}
                                  <td>
                                    <span style={{ fontSize: 10, color: "var(--muted)", fontStyle: "italic" }}>
                                      {row.signing_source === "minute_tick" ? "min" : row.signing_source}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* Per-source footnote */}
                    <div style={{ marginTop: 14, fontSize: 11, color: "var(--text-dim)", lineHeight: 1.6 }}>
                      {t("leadersFootnote", "Direction ~-soft (approximate). Sources: {sources}. All readings display-only — not investment advice.").replace("{sources}", leadersData.coverage.tape_names.join(", "))}
                    </div>
                  </>
                );
              })()}
            </div>
          )}

        </div>

        {/* ── Disclaimer ── */}
        <div className="flow-disclaimer">
          {lang === "zh"
            ? "标注与方向标签为启发式近似（~），仅供展示，不构成投资建议。"
            : "Notability and direction labels are heuristic and approximate (~). Display only — not investment advice."}
        </div>
      </main>
    </div>
  );
}
