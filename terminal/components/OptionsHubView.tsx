"use client";
import {
  useCallback, useEffect, useMemo, useRef, useState,
} from "react";
import { BrandLockup } from "@/components/BrandMark";
import { AppNav } from "@/components/AppNav";
import { useLang, useT } from "@/lib/i18n";
import {
  createChart, LineSeries, AreaSeries,
  type IChartApi, type ISeriesApi,
} from "lightweight-charts";

// ─── Tab definition ─────────────────────────────────────────────────────────

type TabKey = "tape" | "tide" | "tickers" | "screener" | "vol" | "gex";

const TABS: { key: TabKey; enKey: string; zhKey: string }[] = [
  { key: "tape",     enKey: "tabTape",     zhKey: "tabTape" },
  { key: "tide",     enKey: "tabTide",     zhKey: "tabTide" },
  { key: "tickers",  enKey: "tabTickers",  zhKey: "tabTickers" },
  { key: "screener", enKey: "tabScreener", zhKey: "tabScreener" },
  { key: "vol",      enKey: "tabVol",      zhKey: "tabVol" },
  { key: "gex",      enKey: "tabGex",      zhKey: "tabGex" },
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

function fmtContract(right: "C" | "P", exp: string, strike: number): string {
  const month = exp.slice(5, 7); const day = exp.slice(8, 10);
  return `${strike}${right} ${month}/${day}`;
}

function netToneGlyph(net: number): string {
  if (net > 0) return "~▲"; if (net < 0) return "~▼"; return "·";
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
}

function TideChart({ minutes, spy, height }: TideChartProps) {
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

    // Convert "HH:MM" to seconds-from-epoch for LWC. Use 2026-07-05 as session date.
    const toTs = (hhmm: string) => {
      const [hh, mm] = hhmm.split(":").map(Number);
      // ET offset: -04:00. Use UTC epoch for a fixed date.
      return Math.floor(new Date(`2026-07-05T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00-04:00`).getTime() / 1000);
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
  }, [minutes, spy, height]);

  return <div ref={ref} style={{ width: "100%", height }} />;
}

// ─── Sparkline SVG (sector mini-chart) ──────────────────────────────────────

function Sparkline({ data, color, width = 80, height = 30 }: {
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
}

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
          {lang === "zh" ? (t("tideMethodText", "") as any)[1] ?? "" : (t("tideMethodText", "") as any)[0] ?? t("tideMethodText", "")}
        </div>
      )}
    </div>
  );
}

// ─── Strike ladder SVG ───────────────────────────────────────────────────────

function StrikeLadder({ strikes, lang }: { strikes: StrikeRow[]; lang: string }) {
  if (!strikes.length) return null;
  const maxVal = Math.max(...strikes.flatMap((s) => [s.call_prem, s.put_prem])) || 1;
  const BAR_WIDTH = 120;
  const ROW_H = 28;
  const H = strikes.length * ROW_H + 28;

  return (
    <svg viewBox={`0 0 ${BAR_WIDTH * 2 + 80} ${H}`} width="100%" style={{ display: "block", maxHeight: 320, overflow: "visible" }}>
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
  );
}

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

function MinuteNetChart({ minutes, height = 80 }: { minutes: TickerMinute[]; height?: number }) {
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
}

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
      if (fr.ok) { const fj = await fr.json() as FeedPayload; setFeed(fj); setLastFeedTs(fj.asof); setFetchError(false); }
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
        if (fr.ok) { const fj = await fr.json() as FeedPayload; setFeed(fj); setLastFeedTs(fj.asof); setFetchError(false); }
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
        <div
          style={{
            display: "flex", alignItems: "center", gap: 0,
            borderBottom: "1px solid var(--line)", flexShrink: 0, padding: "0 16px",
            overflowX: "auto",
          }}
        >
          {TABS.map((tb) => (
            <button
              key={tb.key}
              onClick={() => switchTab(tb.key)}
              style={{
                height: 44, padding: "0 16px", fontWeight: 600, fontSize: 13,
                color: activeTab === tb.key ? "var(--text)" : "var(--muted)",
                borderBottom: `2px solid ${activeTab === tb.key ? "var(--brand)" : "transparent"}`,
                whiteSpace: "nowrap", cursor: "pointer",
                transition: "color 110ms, border-color 110ms",
              }}
            >
              {lang === "zh"
                ? t(tb.zhKey, tb.key)
                : t(tb.enKey, tb.key)}
            </button>
          ))}
        </div>

        {/* ── Tab content ── */}
        <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>

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
                  <button className="chip" onClick={() => setGroupFilter("")} style={{ marginLeft: 4, color: "var(--muted)" }}>✕</button>
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
                  <span style={{ color: "var(--muted)", fontSize: 11, whiteSpace: "nowrap" }}>{t("minPrem", "Min prem")}</span>
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
                  <span style={{ color: "var(--muted)", fontSize: 11, whiteSpace: "nowrap" }}>{t("dte", "DTE")}</span>
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
                  <span style={{ color: "var(--muted)", fontSize: 11, whiteSpace: "nowrap" }}>{t("mny", "Mny")}</span>
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
                  placeholder={lang === "zh" ? "代码筛选…" : "Ticker…"}
                  value={tapeTickerSearch}
                  onChange={(e) => { setTapeTickerSearch(e.target.value); setDrillTicker(null); }}
                  style={{ height: 28, padding: "0 10px", borderRadius: "var(--r-md)", background: "var(--inset)", border: "1px solid var(--line)", color: "var(--text)", font: "13px var(--font-ui)", outline: "none", width: 110 }}
                />

                {/* Reset */}
                {(minPrem > 0 || dteBuckets.size > 0 || mnyBuckets.size > 0 || groupFilter || tapeTickerSearch || drillTicker || sideFilter || flagFilter) && (
                  <button
                    className="chip"
                    style={{ marginLeft: 4, color: "var(--muted)", height: 26, fontSize: 11 }}
                    onClick={() => { setMinPrem(0); setDteBuckets(new Set()); setMnyBuckets(new Set()); setGroupFilter(""); setTapeTickerSearch(""); setDrillTicker(null); setSideFilter(""); setFlagFilter(""); }}
                  >
                    {lang === "zh" ? "重置" : "Reset"}
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
                          {lang === "zh" ? "运行保费" : "Running prem"} <strong>{fmtPremium(drillUnusual.gross_premium_today)}</strong>
                        </span>
                        <span style={{ color: "var(--text-2)", fontSize: 12 }}>
                          {drillUnusual.prem_z != null ? `z=${drillUnusual.prem_z.toFixed(1)}` : lang === "zh" ? "基线积累中" : "baseline warming"}
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
                    <button className="chip" style={{ marginLeft: "auto", height: 24, fontSize: 11, color: "var(--muted)" }} onClick={() => setDrillTicker(null)}>✕</button>
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
                    <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
                      {lang === "zh" ? "加载中…" : "Loading…"}
                    </div>
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
                              {lang === "zh" ? "暂无符合条件的记录。" : "No events match these filters."}
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
                          {u.prem_z != null ? `· z=${u.prem_z.toFixed(1)} (${u.baseline_source})` : lang === "zh" ? "· 基线积累中" : "· baseline warming"}
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
                <div style={{ color: "var(--muted)", fontSize: 13, padding: "32px 0" }}>{lang === "zh" ? "加载中…" : "Loading…"}</div>
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
                    <TideChart minutes={tideData.minutes} spy={tideData.spy} height={216} />
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
                      {tideData.top_net_impact.slice(0, 20).map((item, i) => {
                        const maxGross = Math.max(...tideData.top_net_impact.map((x) => x.gross));
                        const barW = Math.round((Math.abs(item.net_prem_soft) / Math.max(...tideData.top_net_impact.map((x) => Math.abs(x.net_prem_soft)))) * 100);
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
                      })}
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
                      font: "13px var(--font-ui)", outline: "none",
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
                  <div style={{ color: "var(--muted)", fontSize: 13, padding: "40px 0", textAlign: "center" }}>
                    {lang === "zh" ? "加载中…" : "Loading…"}
                  </div>
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
                        <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 4 }}>
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
                          <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 4 }}>
                            {t(kv.lk, kv.lb)}
                          </div>
                          <div style={{ fontWeight: 650, fontSize: 15, color: (kv as any).color ?? "var(--text)", fontVariantNumeric: "tabular-nums" }}>
                            {kv.v}
                          </div>
                        </div>
                      ))}
                    </div>

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
                        <div style={{ fontWeight: 600, fontSize: 12, color: "var(--text-2)", marginBottom: 10 }}>
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
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12, color: "var(--muted)" }}>
              <div style={{ fontSize: 13 }}>{t("screenerComingSoon", "Screener coming in next build (H2 analytics)")}</div>
              <div style={{ fontSize: 11 }}>{lang === "zh" ? "筛选器将在下一版本推出（H2分析）" : "OI movers, hot contracts, and chain screener arrive with the H2 analytics build."}</div>
            </div>
          )}

          {/* ═══ VOL TAB ════════════════════════════════════════════════════ */}
          {activeTab === "vol" && (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12, color: "var(--muted)" }}>
              <div style={{ fontSize: 13 }}>{t("volComingSoon", "Volatility analytics coming in next build (H2)")}</div>
              <div style={{ fontSize: 11 }}>{lang === "zh" ? "IV rank、期限结构、VRP 即将推出（H2）" : "IV rank, term structure, smile, and VRP surface in the H2 analytics build."}</div>
            </div>
          )}

          {/* ═══ GEX TAB ════════════════════════════════════════════════════ */}
          {activeTab === "gex" && (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12, color: "var(--muted)" }}>
              <div style={{ fontSize: 13 }}>{t("gexComingSoon", "GEX analytics coming in next build (H2)")}</div>
              <div style={{ fontSize: 11 }}>{lang === "zh" ? "Gamma敞口梯度（按行权价/到期日）即将推出" : "Gamma, delta, vanna, charm ladders by strike and expiry in the H2 analytics build."}</div>
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
