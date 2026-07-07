"use client";
import {
  memo,
  useCallback, useEffect, useMemo, useRef, useState,
} from "react";
import { BrandLockup } from "@/components/BrandMark";
import { AppNav } from "@/components/AppNav";
import { useLang, useT } from "@/lib/i18n";
import { windowGexRows } from "@/lib/windowGexRows.mjs";
import {
  createChart, LineSeries, AreaSeries,
  type IChartApi, type ISeriesApi,
} from "lightweight-charts";
import { FlowDeskView } from "@/components/flowdesk/FlowDeskView";
import { GexDeskView } from "@/components/gexdesk/GexDeskView";
import { PrismView } from "@/components/prism/PrismView";
import { ProphetView } from "@/components/prophet/ProphetView";

// ─── Tab definition ─────────────────────────────────────────────────────────

type TabKey = "prophet" | "desk" | "tape" | "tide" | "tickers" | "screener" | "vol" | "gex" | "prism";

const TABS: { key: TabKey; enKey: string; zhKey: string }[] = [
  { key: "prophet",  enKey: "tabProphet",  zhKey: "tabProphet" },
  { key: "desk",     enKey: "tabDesk",     zhKey: "tabDesk" },
  { key: "tape",     enKey: "tabTape",     zhKey: "tabTape" },
  { key: "tide",     enKey: "tabTide",     zhKey: "tabTide" },
  { key: "tickers",  enKey: "tabTickers",  zhKey: "tabTickers" },
  { key: "screener", enKey: "tabScreener", zhKey: "tabScreener" },
  { key: "vol",      enKey: "tabVol",      zhKey: "tabVol" },
  { key: "gex",      enKey: "tabGex",      zhKey: "tabGex" },
  { key: "prism",    enKey: "tabPrism",    zhKey: "tabPrism" },
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

const StrikeLadder = memo(function StrikeLadder({ strikes, lang }: { strikes: StrikeRow[]; lang: string }) {
  if (!strikes.length) return null;
  const maxVal = Math.max(...strikes.flatMap((s) => [s.call_prem, s.put_prem])) || 1;
  const BAR_WIDTH = 120;
  const ROW_H = 28;
  const H = strikes.length * ROW_H + 28;

  return (
    <div style={{ maxHeight: 320, overflowY: "auto" }}>
      <svg viewBox={`0 0 ${BAR_WIDTH * 2 + 80} ${H}`} width="100%" height={H} preserveAspectRatio="xMinYMin meet" style={{ display: "block" }}>
        {/* Column headers */}
        <text x={BAR_WIDTH - 4} y={14} textAnchor="end" fill="var(--up)" fontSize={10} fontWeight={600}>
          {lang === "zh" ? "认购" : "Call"}
        </text>
        <text x={BAR_WIDTH + 80 + 4} y={14} textAnchor="start" fill="var(--down)" fontSize={10} fontWeight={600}>
          {lang === "zh" ? "认沽" : "Put"}
        </text>
        <text x={BAR_WIDTH + 40} y={14} textAnchor="middle" fill="var(--muted)" fontSize={10}>
          {lang === "zh" ? "行权价" : "Strike"}
        </text>
        {strikes.map((s, i) => {
          const y = 24 + i * ROW_H;
          const callW = (s.call_prem / maxVal) * BAR_WIDTH;
          const putW = (s.put_prem / maxVal) * BAR_WIDTH;
          return (
            <g key={s.strike}>
              {/* Call bar (grows left) */}
              <rect x={BAR_WIDTH - callW} y={y + 4} width={callW} height={ROW_H - 8}
                fill="rgba(38,194,129,.25)" rx={2} />
              {/* Put bar (grows right) */}
              <rect x={BAR_WIDTH + 80} y={y + 4} width={putW} height={ROW_H - 8}
                fill="rgba(240,86,107,.2)" rx={2} />
              {/* Strike label */}
              <text x={BAR_WIDTH + 40} y={y + ROW_H / 2 + 4} textAnchor="middle"
                fill="var(--text-2)" fontSize={11}>
                {s.strike}
              </text>
            </g>
          );
        })}
      </svg>
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

// ─── Top-level component ─────────────────────────────────────────────────────

export default function OptionsHubView() {
  const { lang, setLang } = useLang();
  const t = useT();

  // ── Tab state from URL ?tab= ──────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<TabKey>("tape");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab") as TabKey | null;
    if (tab && TABS.some((tb) => tb.key === tab)) setActiveTab(tab);
  }, []);

  function switchTab(tab: TabKey) {
    setActiveTab(tab);
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

  const doFetch = useCallback(async () => {
    if (document.visibilityState === "hidden") return;
    try {
      const [fr, hr] = await Promise.all([
        fetch("/api/flow?f=feed", { cache: "no-store" }),
        fetch("/api/flow?f=heat", { cache: "no-store" }),
      ]);
      if (fr.ok) { const fj = await fr.json() as FeedPayload; setFeed(fj); setLastFeedTs(fj.asof); setFetchError(false); } else { setFetchError(true); }
      if (hr.ok) { const hj = await hr.json() as HeatPayload; setHeat(hj); }
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
      const [tr, dr] = await Promise.all([
        fetch("/api/flow?f=tide", { cache: "no-store" }),
        fetch("/api/flow?f=dte", { cache: "no-store" }),
      ]);
      if (tr.ok) setTideData(await tr.json() as TidePayload);
      if (dr.ok) setDteTide(await dr.json() as DteTidePayload);
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
      const r = await fetch(`/api/flow?f=ticker:${root}`, { cache: "no-store" });
      if (r.ok) setTickerData(await r.json() as TickerPayload);
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
        const [fr, hr] = await Promise.all([
          fetch("/api/flow?f=feed", { cache: "no-store" }),
          fetch("/api/flow?f=heat", { cache: "no-store" }),
        ]);
        if (fr.ok) { const fj = await fr.json() as FeedPayload; setFeed(fj); setLastFeedTs(fj.asof); setFetchError(false); } else { setFetchError(true); }
        if (hr.ok) { const hj = await hr.json() as HeatPayload; setHeat(hj); }
      } catch { setFetchError(true); }
    })();
    pollRef.current = setInterval(doFetch, 45_000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch tide when tab is activated
  useEffect(() => {
    if (activeTab === "tide") fetchTide();
  }, [activeTab, fetchTide]);

  // Fetch ticker data when selected
  useEffect(() => {
    if (selectedTicker) fetchTicker(selectedTicker);
  }, [selectedTicker, fetchTicker]);

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
      const [or, hr] = await Promise.all([
        fetch("/api/flow?f=oi", { cache: "no-store" }),
        fetch("/api/flow?f=hot", { cache: "no-store" }),
      ]);
      if (or.ok) setOiData(await or.json() as OiMoversPayload);
      if (hr.ok) setHotData(await hr.json() as HotPayload);
    } catch {}
    setScreenerLoading(false);
  }, [oiData, hotData]);

  useEffect(() => {
    if (activeTab === "screener") fetchScreener();
  }, [activeTab, fetchScreener]);

  const [hotView, setHotView] = useState<"by_premium" | "by_volume">("by_premium");

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
      const r = await fetch(`/api/flow?f=vol:${root}`, { cache: "no-store" });
      if (r.ok) setVolData(await r.json() as VolPayload);
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
      const r = await fetch("/api/flow?f=ctx", { cache: "no-store" });
      if (r.ok) setCtxData(await r.json() as CtxPayload);
    } catch {}
  }, [ctxData]);

  // ── OI-confirmed fetch — consumed by Tape tab only, lazy on activate ─────────
  const [oiConfData, setOiConfData] = useState<OiConfPayload>([]);
  const oiConfLoaded = useRef(false);
  const fetchOiConf = useCallback(async () => {
    if (oiConfLoaded.current) return; // already loaded
    oiConfLoaded.current = true;
    try {
      const r = await fetch("/api/flow?f=oiconf", { cache: "no-store" });
      if (r.ok) {
        const raw = await r.json();
        // Payload is either an array directly or wrapped
        setOiConfData(Array.isArray(raw) ? raw : (raw.confirmed ?? []));
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
      const r = await fetch(`/api/flow?f=tctx:${root}`, { cache: "no-store" });
      if (r.ok) setTctxData(await r.json() as TctxPayload);
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
      const r = await fetch(`/api/flow?f=gex:${root}`, { cache: "no-store" });
      if (r.ok) setGexData(await r.json() as GexPayload);
    } catch {}
    setGexLoading(false);
  }, []);

  useEffect(() => {
    if (selectedGexRoot) fetchGex(selectedGexRoot);
  }, [selectedGexRoot, fetchGex]);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="app2">
      <header className="topbar">
        <BrandLockup />
        <div className="tdiv" />
        <span className="page-title">{t("flow", "Options")}</span>
        <div className="spacer" />
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

        {/* ── Tab bar ── */}
        <div className="hub-tab-bar">
          {TABS.map((tb) => (
            <button
              key={tb.key}
              className={`hub-tab${activeTab === tb.key ? " on" : ""}`}
              onClick={() => switchTab(tb.key)}
            >
              {lang === "zh"
                ? t(tb.zhKey, tb.key)
                : t(tb.enKey, tb.key)}
            </button>
          ))}
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
          {activeTab === "desk" && <FlowDeskView />}

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
                  const gName = lang === "zh" ? g.group_zh : g.group;
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
                                {lang === "zh" ? e.group_zh : e.group}
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
                                {lang === "zh" ? s.group_zh : s.group}
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

          {/* ═══ TICKERS TAB ════════════════════════════════════════════════ */}
          {activeTab === "tickers" && (
            <div style={{ flex: 1, overflow: "hidden", display: "flex", minHeight: 0 }}>
              {/* Sidebar */}
              <div
                style={{
                  width: 200, flexShrink: 0, borderRight: "1px solid var(--line)",
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

              {/* Drill pane */}
              <div style={{ flex: 1, overflow: "auto", padding: "16px 18px" }}>
                {!selectedTicker && (
                  <div style={{ color: "var(--muted)", fontSize: 13, padding: "40px 0", textAlign: "center" }}>
                    {t("tickersSelectPrompt", "Select a ticker from the list or search above")}
                  </div>
                )}
                {selectedTicker && tickerLoading && (
                  <div className="fin-empty" role="status">{t("loading", "Loading…")}</div>
                )}
                {selectedTicker && !tickerLoading && tickerData && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                    {/* Day stats card */}
                    <div
                      style={{
                        display: "flex", flexWrap: "wrap", gap: 20,
                        border: "1px solid var(--line)", borderRadius: "var(--r-lg)",
                        background: "var(--panel)", padding: "14px 18px",
                      }}
                    >
                      <div>
                        <div className="hub-sec">
                          {lang === "zh" ? tickerData.group_zh : tickerData.group}
                        </div>
                        <div style={{ fontWeight: 700, fontSize: 22 }}>{tickerData.root}</div>
                      </div>
                      {[
                        { lk: "tickersDayGross", lb: "Day Gross", v: fmtPremium(tickerData.day.gross) },
                        { lk: "tickersNetSoft", lb: "Net (~soft)", v: fmtPremSigned(tickerData.day.net_soft), color: tickerData.day.net_soft >= 0 ? "var(--up)" : "var(--down)" },
                        { lk: "tickersCallShare", lb: "Call Share", v: `${(tickerData.day.call_share * 100).toFixed(1)}%`, color: tickerData.day.call_share > 0.5 ? "var(--up)" : "var(--down)" },
                        {
                          lk: "tickersPremZ", lb: "Prem z", v: tickerData.day.prem_z != null ? tickerData.day.prem_z.toFixed(1) : (lang === "zh" ? "基线积累中" : "baseline warming"),
                        },
                      ].map((kv) => (
                        <div key={kv.lk}>
                          <div className="hub-sec">
                            {t(kv.lk, kv.lb)}
                          </div>
                          <div style={{ fontWeight: 650, fontSize: 15, color: (kv as any).color ?? "var(--text)", fontVariantNumeric: "tabular-nums" }}>
                            {kv.v}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Tctx percentile chip row */}
                    {tctxData && (() => {
                      const histN = tctxData.history_n ?? 0;
                      const minN = 20;
                      const warming = histN < minN;
                      const chips: { labelKey: string; label: string; zKey: keyof NonNullable<TctxPayload["z"]> }[] = [
                        { labelKey: "tctxNetPremZ", label: "Net prem z", zKey: "net_signed_premium_z252" },
                        { labelKey: "tctxZerodteShare", label: "0DTE share z", zKey: "zerodte_share_z252" },
                        { labelKey: "tctxOtmCallShare", label: "OTM call share z", zKey: "short_dated_otm_call_share_z252" },
                        { labelKey: "tctxVolGtOiShare", label: "vol>OI share z", zKey: "vol_gt_oi_share_z252" },
                        { labelKey: "tctxBlockShare", label: "Block share z", zKey: "block_share_z252" },
                      ];
                      return (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                          {chips.map((c) => {
                            const zVal = tctxData.z?.[c.zKey];
                            return (
                              <div key={c.zKey} style={{ border: "1px solid var(--line)", borderRadius: "var(--r-md)", padding: "6px 10px", background: "var(--panel)", minWidth: 110 }}>
                                <div style={{ fontSize: 9, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 3 }}>
                                  {t(c.labelKey, c.label)}
                                </div>
                                <div style={{ fontSize: 13, fontWeight: 650, fontVariantNumeric: "tabular-nums", color: "var(--text)" }}>
                                  {warming || zVal == null
                                    ? <span style={{ fontSize: 10, color: "var(--text-dim)" }}>{t("tctxBaseline", "baseline warming")} {histN}/{minN}</span>
                                    : `${zVal >= 0 ? "+" : ""}${zVal.toFixed(2)}`
                                  }
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}

                    {/* Minute net prem chart */}
                    <div style={{ border: "1px solid var(--line)", borderRadius: "var(--r-lg)", background: "var(--panel)", padding: "12px 14px" }}>
                      <div style={{ fontWeight: 600, fontSize: 12, color: "var(--text-2)", marginBottom: 8 }}>
                        {t("tickersMinChart", "Minute Net Prem")}
                      </div>
                      <MinuteNetChart minutes={tickerData.minutes} height={80} />
                    </div>

                    {/* Strike ladder */}
                    {tickerData.strikes.length > 0 && (
                      <div style={{ border: "1px solid var(--line)", borderRadius: "var(--r-lg)", background: "var(--panel)", padding: "12px 14px" }}>
                        <div style={{ fontWeight: 600, fontSize: 12, color: "var(--text-2)", marginBottom: 8 }}>
                          {t("tickersStrikeLadder", "Strike Ladder")}
                        </div>
                        <StrikeLadder strikes={tickerData.strikes} lang={lang} />
                      </div>
                    )}

                    {/* Expiry bars */}
                    {tickerData.expiries.length > 0 && (
                      <div style={{ border: "1px solid var(--line)", borderRadius: "var(--r-lg)", background: "var(--panel)", padding: "12px 14px" }}>
                        <div className="hub-stat">
                          {t("tickersExpBars", "By Expiry")}
                        </div>
                        <ExpiryBars expiries={tickerData.expiries} lang={lang} />
                      </div>
                    )}

                    {/* Top contracts */}
                    {tickerData.top_contracts.length > 0 && (
                      <div style={{ border: "1px solid var(--line)", borderRadius: "var(--r-lg)", background: "var(--panel)", overflow: "hidden" }}>
                        <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--line)", fontWeight: 600, fontSize: 12, color: "var(--text-2)" }}>
                          {t("tickersTopContracts", "Top Contracts")}
                        </div>
                        <table className="scr" style={{ fontSize: 12 }}>
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
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ═══ SCREENER TAB ═══════════════════════════════════════════════ */}
          {activeTab === "screener" && (
            <div style={{ flex: 1, overflow: "auto", padding: "16px 18px", display: "flex", flexDirection: "column", gap: 20 }}>
              {screenerLoading && !oiData && !hotData && (
                <div className="fin-empty" role="status">{t("loading", "Loading…")}</div>
              )}

              {/* Coverage banner when small */}
              {(oiData || hotData) && (
                <div style={{ fontSize: 11, color: "var(--text-dim)", background: "rgba(41,98,255,.06)", border: "1px solid rgba(41,98,255,.18)", borderRadius: "var(--r-md)", padding: "6px 12px" }}>
                  {lang === "zh" ? "ETF品种覆盖；个股覆盖扩展中" : "ETF universe; single names expanding"}
                </div>
              )}

              {/* Hot Contracts card */}
              {hotData && (
                <div style={{ border: "1px solid var(--line)", borderRadius: "var(--r-lg)", background: "var(--panel)", overflow: "hidden" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderBottom: "1px solid var(--line)" }}>
                    <span style={{ fontWeight: 650, fontSize: 14 }}>
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
                          <tr key={i}>
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
                </div>
              )}

              {/* OI Movers card */}
              {oiData && (
                <div style={{ border: "1px solid var(--line)", borderRadius: "var(--r-lg)", background: "var(--panel)", overflow: "hidden" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderBottom: "1px solid var(--line)" }}>
                    <span style={{ fontWeight: 650, fontSize: 14 }}>
                      {lang === "zh" ? "持仓异动" : "OI Movers"}
                    </span>
                    <span style={{ fontSize: 11, color: "var(--text-dim)", marginLeft: 4 }}>
                      {lang === "zh" ? "截至上一交易日" : "as of previous session"}
                    </span>
                  </div>
                  <div style={{ overflowX: "auto" }}>
                    <table className="scr" style={{ fontSize: 12 }}>
                      <thead>
                        <tr>
                          <th style={{ textAlign: "left" }}>{t("colTicker", "Ticker")}</th>
                          <th style={{ textAlign: "left" }}>{t("colRight", "C/P")}</th>
                          <th style={{ textAlign: "left" }}>{t("colExp", "Exp")}</th>
                          <th>{t("colStrike", "Strike")}</th>
                          <th>{t("colOi", "OI (t-1)")}</th>
                          <th>{t("colOiPrev", "OI (t-2)")}</th>
                          <th>{t("colDOi", "ΔOI")}</th>
                          <th>{t("colMid", "Mid")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {oiData.movers.map((m, i) => {
                          const isAdd = m.d_oi > 0;
                          return (
                            <tr key={i}>
                              <td style={{ textAlign: "left", fontWeight: 700 }}>{m.root}</td>
                              <td style={{ textAlign: "left" }}>
                                <span style={{ color: m.right === "C" ? "var(--up)" : "var(--down)", fontWeight: 700 }}>{m.right}</span>
                              </td>
                              <td style={{ textAlign: "left", color: "var(--text-2)", fontVariantNumeric: "tabular-nums" }}>{m.exp.slice(5)}</td>
                              <td style={{ fontVariantNumeric: "tabular-nums" }}>{m.strike}</td>
                              <td style={{ fontVariantNumeric: "tabular-nums" }}>{m.oi.toLocaleString("en-US")}</td>
                              <td style={{ fontVariantNumeric: "tabular-nums", color: "var(--text-dim)" }}>{m.oi_prev.toLocaleString("en-US")}</td>
                              <td style={{ fontVariantNumeric: "tabular-nums", fontWeight: 700, color: isAdd ? "var(--up)" : "var(--down)" }}>
                                {isAdd ? "+" : ""}{m.d_oi.toLocaleString("en-US")}
                              </td>
                              <td style={{ fontVariantNumeric: "tabular-nums", color: "var(--text-2)" }}>
                                {m.mid != null ? `$${m.mid.toFixed(2)}` : "—"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
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
          {activeTab === "gex" && (
            <div style={{ flex: 1, overflow: "hidden", display: "flex", minHeight: 0 }}>
              <GexDeskView />
            </div>
          )}

          {/* ═══ PRISM TAB ══════════════════════════════════════════════════ */}
          {activeTab === "prism" && (
            <div style={{ flex: 1, overflow: "hidden", display: "flex", minHeight: 0 }}>
              <PrismView />
            </div>
          )}

          {/* ═══ PROPHET TAB ════════════════════════════════════════════════ */}
          {activeTab === "prophet" && (
            <div style={{ flex: 1, overflow: "hidden", display: "flex", minHeight: 0 }}>
              <ProphetView />
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
