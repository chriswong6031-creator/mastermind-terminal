"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { BrandLockup, BrandMark } from "@/components/BrandMark";
import { AppNav } from "@/components/AppNav";
import { type DetectCmd } from "@/components/ChartPanel";
import ChartPane from "@/components/ChartPane";
import { intradayCapable } from "@/components/ChartPanel";
import { classify } from "@/lib/intradaySources";
import MegaPane, { type FinPage } from "@/components/fin/MegaPane";
import OracleDash from "@/components/fin/OracleDash";
import { getFund, getOpts, getBars, type Fund, type Bar } from "@/lib/fund";
import StrategyTester from "@/components/StrategyTester";
import SearchModal from "@/components/SearchModal";
import IndicatorsModal from "@/components/IndicatorsModal";
import IndicatorSettings from "@/components/IndicatorSettings";
import IndicatorSource from "@/components/IndicatorSource";
import { allDefaults, indDefaults, withDefaults, IND_ORDER } from "@/lib/indicators";
import CopilotPanel from "@/components/CopilotPanel";
import SeasonalityCard from "@/components/SeasonalityCard";
import StockAnalysis from "@/components/StockAnalysis";
import { useLive } from "@/lib/live";
import { setPaneSync } from "@/lib/paneSync";
import { type Drawing, uid } from "@/lib/drawings";
import SettingsMenu from "@/components/SettingsMenu";
import DayRange from "@/components/DayRange";
import { useT, useLang } from "@/lib/i18n";
import { useFromMacro, backToMacro } from "@/lib/originNav";
import { getJSON, prefetch } from "@/lib/dataCache";

const MNAV: [string, string, string][] = [
  ["/terminal", "Chart", "M3 17l5-6 4 3 4-7 5 9"],
  ["/screener", "Screener", "RECT"],
  ["/scripts", "Scripts", "M8 7l-5 5 5 5M16 7l5 5-5 5"],
  ["/portfolio", "Portfolio", "M21 12a9 9 0 1 1-9-9v9z"],
  ["/alerts", "Alerts", "M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"],
];

type Row = { name: string; sec: string; col: string; mkt?: string; zh?: string; last: number; chg: number; open: number; high: number; low: number; vol: number; hi52: number; lo52: number; verdict: string | null; wr: number | null; pf: number | null; cagr: number | null; regimeBull: boolean | null };
type Manifest = { as_of: string | null; symbols: Record<string, Row> };

const fmt = (n: number | null | undefined, d = 2) => (n == null || !isFinite(n) ? "—" : n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }));
const vol = (v: number | null | undefined) => (v == null || !isFinite(v) ? "—" : v >= 1e9 ? (v / 1e9).toFixed(2) + "B" : v >= 1e6 ? (v / 1e6).toFixed(1) + "M" : String(v));
const chgStr = (c: number | null | undefined) => (c == null || !isFinite(c) ? "—" : (c >= 0 ? "+" : "") + fmt(c) + "%");

// Overlay a live quote's price fields onto the EOD manifest row (live wins when present; a missing
// live field — e.g. a US placeholder that has no volume yet — keeps the manifest value). Used so the
// watchlist rows + movers tape render the SAME live prices the header already shows.
function mergeLive(r: Row | undefined, q: any): Row | undefined {
  if (!q) return r;
  const base: any = { ...(r || {}) };
  for (const k of ["last", "chg", "open", "high", "low", "vol"]) {
    const v = q[k];
    if (v != null && isFinite(v)) base[k] = v;
  }
  return base;
}
const isBuy = (v: string | null) => v === "BUY" || v === "REBUY";
const CHART_TYPES = [["candles", "Candles"], ["heikin", "Heikin Ashi"], ["bars", "Bars"], ["line", "Line"], ["area", "Area"]];
const TF_GROUPS: [string, string[]][] = [["Minutes", ["1m", "5m", "15m", "30m"]], ["Hours", ["1h", "2h", "4h"]], ["Days", ["D", "3D"]], ["Weeks", ["W", "2W"]], ["Months", ["1M", "3M"]]];
// Daily-derived TFs are always functional. Intraday TFs (R12) go live for intraday-capable markets
// (us/crypto/cn/hk); .TO (ca) stays daily-only — its picker entries render disabled.
const DAILY_FUNCTIONAL = new Set(["D", "3D", "W", "2W", "1M", "3M"]);
const INTRADAY_FUNCTIONAL = ["1m", "5m", "15m", "30m", "1h", "2h", "4h"];
function functionalSet(sym: string): Set<string> {
  const s = new Set(DAILY_FUNCTIONAL);
  if (intradayCapable(classify(sym))) for (const t of INTRADAY_FUNCTIONAL) s.add(t);
  return s;
}
// valid ?pane= deep-link targets (the ten MegaPane pages)
const VALID_PANES = new Set(["overview", "statements", "statistics", "dividends", "earnings", "revenue", "forecast", "analyst", "technicals", "seasonals", "mastermind"]);
const normalizePane = (pane: string): FinPage => (pane === "analyst" ? "forecast" : pane) as FinPage;
const load = (k: string, d: any) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };

// drawing tools for the (previously decorative) left dock
const TOOLS: [string, string][] = [
  ["cursor", "M12 2v20M2 12h20"], ["trendline", "M4 20L20 4"], ["arrow", "M5 19L19 5M13 5h6v6"],
  ["hline", "M3 12h18"], ["rect", "M4 6h16v12H4z"], ["fib", "M3 5h18M3 9h18M3 15h18M3 19h18"],
  ["text", "M5 5h14M12 5v14"], ["measure", "M3 9h18v6H3zM7 9v6M11 9v6M15 9v6"], ["vline", "M12 3v18"], ["erase", "M7 21l-4.3-4.3a2.4 2.4 0 0 1 0-3.4l9.6-9.6a2.4 2.4 0 0 1 3.4 0l5.6 5.6a2.4 2.4 0 0 1 0 3.4L13 21M22 21H7M5 11l9 9"],
];
// drawing tools that accept a pre-draw color/width/dash style (arrow: no dash)
const STYLEABLE = new Set(["trendline", "arrow", "rect", "hline", "vline"]);
const DETECTORS: [string, string][] = [
  ["trendlines", "Auto trendlines"], ["fib", "Auto Fibonacci"], ["sr", "S/R strength heatmap"], ["mtfa", "Multi-timeframe S/R"], ["clear", "Clear detected"],
];
const CMP_COLORS = ["#e8a33d", "#9d86ff", "#19c2c2", "#f06bd0"];

// translation key maps for the (otherwise hard-coded) toolbar/tool labels
const CT_TKEY: Record<string, string> = { candles: "ctCandles", heikin: "ctHeikin", bars: "ctBars", line: "ctLine", area: "ctArea" };
const TFG_TKEY: Record<string, string> = { Minutes: "tfMinutes", Hours: "tfHours", Days: "tfDays", Weeks: "tfWeeks", Months: "tfMonths" };
const DET_TKEY: Record<string, string> = { trendlines: "autoTrendlines", fib: "autoFib", sr: "srHeatmap", mtfa: "mtfSR", clear: "clearDetected" };
const TOOL_TKEY: Record<string, string> = { cursor: "toolCursor", trendline: "toolTrendline", ray: "toolRay", hline: "toolHline", rect: "toolRect", fib: "toolFib", text: "toolText", measure: "toolMeasure", arrow: "toolArrow", vline: "toolVline", erase: "toolErase" };

// watchlist column widths (px). The symbol column + every visible data column is user-resizable.
const DEFAULT_COLW: Record<string, number> = { sym: 132, last: 82, change: 84, changePct: 76, volume: 80 };
type WLSet = { tableView: boolean; cols: { last: boolean; changePct: boolean; change: boolean; volume: boolean }; disp: string; logo: boolean; colW: Record<string, number> };
const DEFAULT_SET: WLSet = { tableView: true, cols: { last: true, changePct: true, change: false, volume: false }, disp: "symbol", logo: true, colW: {} };

export default function TerminalShell({ symbols, email, initialSymbol }: { symbols: { symbol: string; section: string }[]; email: string; initialSymbol?: string }) {
  const [man, setMan] = useState<Manifest | null>(null);
  // named watchlists — client-side + localStorage-backed so switching / creating lists works for guests
  // (no auth needed). The server-provided `symbols` seed becomes the "Default" list.
  const [lists, setLists] = useState<Record<string, { symbol: string; section: string }[]>>({ Default: symbols });
  const [activeList, setActiveList] = useState("Default");
  const [wlMenuOpen, setWlMenuOpen] = useState(false);
  const wl = lists[activeList] || [];
  const setWl = (updater: any) => setLists((l) => ({ ...l, [activeList]: typeof updater === "function" ? updater(l[activeList] || []) : updater }));
  const seed0 = initialSymbol || symbols.find((s) => s.symbol === "NVDA")?.symbol || symbols[0]?.symbol || "NVDA";
  const [panes, setPanes] = useState<string[]>([seed0]);
  const [activePane, setActivePane] = useState(0);
  const [sync, setSync] = useState(true);
  const [split, setSplit] = useState(1);   // the split the user requested (panes.length may be smaller after dedup)
  const active = panes[activePane] ?? panes[0] ?? seed0;
  const [paneTfs, setPaneTfs] = useState<string[]>(["3D"]);   // one timeframe per pane — Terminal opens on 3D by default
  const tf = paneTfs[activePane] ?? paneTfs[0] ?? "D";        // the active pane's timeframe drives the toolbar
  const setTf = (t: string) => setPaneTfs((a) => { const n = [...a]; n[activePane] = t; return n; });
  // per-market functional TF set: daily-derived always; intraday TFs only for intraday-capable markets (R12)
  const FUNCTIONAL = useMemo(() => functionalSet(active), [active]);
  const [chartType, setChartType] = useState("candles");
  const [inds, setInds] = useState<Set<string>>(new Set(["ema", "rsi", "stochrsi"]));
  const [hidden, setHidden] = useState<Set<string>>(new Set());                       // indicators the eye has hidden
  const [indParams, setIndParams] = useState<Record<string, any>>(allDefaults());      // per-indicator params (Settings dialog)
  const [settingsKey, setSettingsKey] = useState<string | null>(null);                 // indicator whose Settings dialog is open
  const [sourceKey, setSourceKey] = useState<string | null>(null);                     // indicator whose Source view is open
  const [favTF, setFavTF] = useState<string[]>(["D", "3D", "W", "1M"]);
  const [set, setSet] = useState<WLSet>(DEFAULT_SET);
  const [searchOpen, setSearchOpen] = useState(false); const [seed, setSeed] = useState("");
  const [indOpen, setIndOpen] = useState(false); const [copilot, setCopilot] = useState(false);
  const [wlSetOpen, setWlSetOpen] = useState(false); const [tfOpen, setTfOpen] = useState(false); const [ctOpen, setCtOpen] = useState(false);
  const [replayOn, setReplayOn] = useState(false); const [replayIdx, setReplayIdx] = useState<number | null>(null); const [total, setTotal] = useState(0); const [playing, setPlaying] = useState(false); const [speed, setSpeed] = useState(1);
  const playRef = useRef<any>(null);
  // §7 state
  const [view, setView] = useState<"price" | "strategy">("price");
  const [tool, setTool] = useState<string | null>(null);
  const [detectCmd, setDetectCmd] = useState<DetectCmd>(null);
  const [detectOpen, setDetectOpen] = useState(false);
  const [intel, setIntel] = useState<any>(null);
  const [layouts, setLayouts] = useState<any[]>([]); const [layoutOpen, setLayoutOpen] = useState(false); const [layoutName, setLayoutName] = useState("");
  const [livePx, setLivePx] = useState<number | null>(null);
  // symbol-keyed live top-of-book — ONE source for the header AND every watchlist row (via a single
  // batched /api/quote?syms= poll), so the detail pane and the watchlist can't disagree on a price.
  const [quotes, setQuotes] = useState<Record<string, any>>({});
  const [slice, setSlice] = useState<any>(null);
  const [fund, setFund] = useState<Fund | null>(null);
  const [opts, setOpts] = useState<any>(null);
  const [bars, setBars] = useState<Bar[]>([]);
  // MegaPane (in-shell fundamentals overlay) + OracleDash (Golden Oracle history) overlays
  const [paneOpen, setPaneOpen] = useState<FinPage | null>(null);
  const [signalsOpen, setSignalsOpen] = useState(false);
  const [magnet, setMagnet] = useState(false);
  // pre-draw style chosen BEFORE drawing (color/width/dash) — applied to each new line/arrow/box/HV drawing
  const [drawStyle, setDrawStyle] = useState<{ color: string; width: number; dash: "solid" | "dashed" | "dotted" }>({ color: "#4d82ff", width: 1.5, dash: "solid" });
  const [compare, setCompare] = useState<string[]>([]);
  const [searchMode, setSearchMode] = useState<"go" | "compare">("go");
  const nonce = useRef(0);
  const wsMounted = useRef(false);
  const t = useT();
  const { lang } = useLang();
  const navPath = usePathname();
  const searchParams = useSearchParams();
  // mobile + fullscreen + expanded-analysis state
  const [fullChart, setFullChart] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [railW, setRailW] = useState<number>(() => {
    if (typeof window === "undefined") return 360;
    const saved = Number(localStorage.getItem("mm.railW"));
    return Number.isFinite(saved) ? Math.min(520, Math.max(300, saved)) : 360;
  });
  // only surface a "back" affordance when the user actually arrived from the Macro Dashboard — for direct
  // visitors a back button would just throw them onto whatever unrelated site they were last on.
  const { fromMacro, macroHref } = useFromMacro();
  const onBack = useCallback(() => backToMacro(macroHref), [macroHref]);
  // shared per-symbol drawing store (lifted out of ChartPane so multiple panes on the same
  // symbol share one set instead of clobbering each other through the replace-all PUT)
  const [drawStore, setDrawStore] = useState<Record<string, Drawing[]>>({});
  const drawLoaded = useRef<Set<string>>(new Set());
  const drawPending = useRef<Record<string, Drawing[]>>({});
  const drawTimers = useRef<Record<string, any>>({});
  const prevPaneSyms = useRef<Set<string>>(new Set());
  const flushDrawings = useCallback((sym: string) => { clearTimeout(drawTimers.current[sym]); const d = drawPending.current[sym]; if (d) { delete drawPending.current[sym]; fetch("/api/drawings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbol: sym, drawings: d }) }).catch(() => {}); } }, []);
  const setSymbolDrawings = useCallback((sym: string, d: Drawing[]) => { setDrawStore((s) => ({ ...s, [sym]: d })); drawPending.current[sym] = d; clearTimeout(drawTimers.current[sym]); drawTimers.current[sym] = setTimeout(() => flushDrawings(sym), 600); }, [flushDrawings]);
  // copilot → chart: convert AI-suggested price levels into drawings appended to the symbol's store
  const annotateChart = useCallback((sym: string, anns: any[]) => {
    if (!Array.isArray(anns) || !anns.length) return;
    const today = new Date().toISOString().slice(0, 10);
    const col: Record<string, string> = { support: "var(--up)", resistance: "var(--down)", target: "var(--signal)", level: "var(--brand-2)", note: "var(--brand-2)" };
    const add: Drawing[] = anns.filter((a) => a && Number.isFinite(a.price)).map((a) =>
      a.type === "note"
        ? { id: uid(), kind: "text", points: [{ t: today, p: a.price }], text: a.label || "note", color: col.note, fontSize: 13 }
        : { id: uid(), kind: "hline", points: [{ t: today, p: a.price }], color: col[a.type] || col.level, dash: "dashed", meta: { label: a.label || `${a.type} · ${a.price}` } });
    // base on the synchronously-updated pending ref first (covers the post-edit-pre-commit window and lets
    // back-to-back annotate events accumulate), falling back to the latest committed store (drawStore must
    // stay in deps so the closure sees the freshest committed value — not a mount-time snapshot)
    if (add.length) setSymbolDrawings(sym, [...(drawPending.current[sym] ?? drawStore[sym] ?? []), ...add]);
  }, [drawStore, setSymbolDrawings]);

  useEffect(() => { fetch("/data/manifest.json").then((r) => r.json()).then(setMan).catch(() => {}); }, []);
  useEffect(() => {
    setInds(new Set(load("mm.inds", ["ema", "rsi", "stochrsi"]))); setChartType(load("mm.ct", "candles")); setHidden(new Set(load("mm.indHidden", []))); { const savedP = load("mm.indParams", {}); const base = allDefaults(); for (const k of IND_ORDER) base[k] = withDefaults(k, savedP[k]); setIndParams(base); } setPaneTfs(["3D"]); setFavTF(load("mm.favtf", ["D", "3D", "W", "1M"])); setSet({ ...DEFAULT_SET, ...load("mm.set", DEFAULT_SET) });
    // restore the saved multi-pane workspace — but a deep-link (?sym=) always wins
    if (!initialSymbol) {
      try {
        const ws = load("mm.ws", null);
        if (ws && Array.isArray(ws.panes)) {
          const pairs = ws.panes.map((s: string, i: number) => [s, ws.paneTfs?.[i] ?? "3D"]).filter(([s]: any) => symbols.some((x) => x.symbol === s));
          if (pairs.length) {
            // a single chart always opens on the 3D default; genuine multi-pane layouts (e.g. MTF) keep their saved per-pane timeframes
            setPanes(pairs.map((p: any) => p[0])); setPaneTfs(pairs.length === 1 ? ["3D"] : pairs.map((p: any) => p[1]));
            setSplit([1, 2, 4].includes(ws.split) ? ws.split : (pairs.length >= 4 ? 4 : pairs.length >= 2 ? 2 : 1));
            setActivePane(Math.min(ws.activePane || 0, pairs.length - 1));
            if (typeof ws.sync === "boolean") setSync(ws.sync);
          }
        }
      } catch {}
    }
  }, []);
  // persist the workspace — but skip the mount-time write (no user intent) and never write during a
  // deep-link (?sym=) session, so following a Screener/Portfolio row can't clobber the saved layout.
  useEffect(() => {
    if (!wsMounted.current) { wsMounted.current = true; return; }
    if (!initialSymbol) localStorage.setItem("mm.ws", JSON.stringify({ panes, paneTfs, split, sync, activePane }));
  }, [panes, paneTfs, split, sync, activePane]);
  useEffect(() => { localStorage.setItem("mm.inds", JSON.stringify([...inds])); }, [inds]);
  // skip the mount-pass write (state is still the pre-load default) — otherwise a reload/discard
  // landing inside the mount→load window can permanently clobber the saved value with the default
  const hidMounted = useRef(false); const ipMounted = useRef(false);
  useEffect(() => { if (!hidMounted.current) { hidMounted.current = true; return; } localStorage.setItem("mm.indHidden", JSON.stringify([...hidden])); }, [hidden]);
  useEffect(() => { if (!ipMounted.current) { ipMounted.current = true; return; } localStorage.setItem("mm.indParams", JSON.stringify(indParams)); }, [indParams]);
  useEffect(() => { localStorage.setItem("mm.ct", JSON.stringify(chartType)); }, [chartType]);
  useEffect(() => { localStorage.setItem("mm.tf", JSON.stringify(tf)); }, [tf]);
  useEffect(() => { localStorage.setItem("mm.favtf", JSON.stringify(favTF)); }, [favTF]);
  useEffect(() => { localStorage.setItem("mm.set", JSON.stringify(set)); }, [set]);
  // restore saved named watchlists (falls back to the server-seeded Default list)
  useEffect(() => {
    const saved = load("mm.wls", null);
    if (saved && saved.lists && typeof saved.lists === "object" && Object.keys(saved.lists).length) {
      setLists(saved.lists);
      setActiveList(saved.active && saved.lists[saved.active] ? saved.active : Object.keys(saved.lists)[0]);
    }
  }, []);
  useEffect(() => { if (Object.keys(lists).length) localStorage.setItem("mm.wls", JSON.stringify({ lists, active: activeList })); }, [lists, activeList]);
  useEffect(() => { setPaneSync(sync && panes.length > 1); }, [sync, panes.length]);
  // load drawings once per symbol that appears in a pane; don't clobber an in-flight local edit
  useEffect(() => {
    const now = new Set(panes);
    for (const sym of now) {
      if (drawLoaded.current.has(sym)) continue;
      drawLoaded.current.add(sym);
      fetch(`/api/drawings?symbol=${sym}`).then((r) => r.json()).then((d) => {
        if (drawPending.current[sym] === undefined) setDrawStore((s) => (s[sym] !== undefined ? s : { ...s, [sym]: d.drawings || [] }));
      }).catch(() => { drawLoaded.current.delete(sym); });
    }
    // a symbol that left every pane: flush its pending save, then evict its cache + load-guard so a
    // later re-visit re-fetches fresh server state (restores the old per-mount refetch behavior)
    for (const sym of prevPaneSyms.current) {
      if (now.has(sym)) continue;
      flushDrawings(sym);
      drawLoaded.current.delete(sym);
      setDrawStore((s) => { if (s[sym] === undefined) return s; const n = { ...s }; delete n[sym]; return n; });
    }
    prevPaneSyms.current = now;
  }, [panes, flushDrawings]);
  useEffect(() => () => { for (const sym of Object.keys(drawPending.current)) flushDrawings(sym); }, [flushDrawings]);

  // per-symbol intel/slice/fund/bars for the rail (drawings now live per-pane in ChartPane); layouts once.
  // getFund is negative-cached (long-tail 404s don't storm); getBars shares the chart's OHLC fetch.
  useEffect(() => { let alive = true; setIntel(null); setLivePx(null); setSlice(null); setFund(null); setOpts(null); setBars([]);
    getJSON(`/data/${active}.intel.json`).then((d) => { if (alive) setIntel(d); });
    getJSON(`/data/${active}.slice.json`).then((d) => { if (alive) setSlice(d); });
    getFund(active).then((d) => { if (alive) setFund(d); }).catch(() => {});
    getOpts(active).then((d) => { if (alive) setOpts(d); }).catch(() => {});
    getBars(active).then((b) => { if (alive) setBars(b); }).catch(() => {});
    return () => { alive = false; };   // ignore a stale fetch for the prior symbol
  }, [active]);

  // ONE batched live-quote poll for the active symbol + every watchlist row. Symbol-keyed results
  // merge into `quotes`, so switching tickers never bleeds a stale quote and the header + watchlist
  // read the same numbers. A null entry (hub/Tencent down for that symbol) is deleted so its badge
  // reverts to grey and its row falls back to manifest EOD — preserving the old fallback invariant.
  const quoteSyms = useMemo(
    () => Array.from(new Set([active, ...wl.map((x) => x.symbol)])).filter(Boolean),
    [active, wl]
  );
  const quoteSymsKey = quoteSyms.join(",");
  useEffect(() => {
    if (!quoteSymsKey) return;
    let alive = true;
    const poll = () => fetch(`/api/quote?syms=${encodeURIComponent(quoteSymsKey)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive || !d || !d.quotes) return;
        setQuotes((prev) => {
          const n = { ...prev };
          for (const k of Object.keys(d.quotes)) { const q = d.quotes[k]; if (q) n[k] = q; else delete n[k]; }
          return n;
        });
      })
      .catch(() => {});
    poll();
    const id = setInterval(poll, 6000);
    return () => { alive = false; clearInterval(id); };
  }, [quoteSymsKey]);
  useEffect(() => { fetch("/api/layouts").then((r) => r.json()).then((d) => setLayouts(d.layouts || [])).catch(() => {}); }, []);
  useEffect(() => { const open = () => setCopilot(true); window.addEventListener("mm:copilot", open); try { if (new URLSearchParams(window.location.search).get("ai") === "1") setCopilot(true); } catch {} return () => window.removeEventListener("mm:copilot", open); }, []);
  // shallow deep-link: ?pane=<page> opens the MegaPane on that page (MegaPane keeps the URL in sync
  // and strips ?pane= on close). Reactive so clicking ?pane= links while already on /terminal works.
  // Only OPEN when a valid pane is present — do NOT force-close when absent (MegaPane owns its close).
  useEffect(() => { const p = searchParams.get("pane"); if (p && VALID_PANES.has(p)) setPaneOpen(normalizePane(p)); }, [searchParams]);
  // Direct open event — AppNav dispatches this on every click, so re-opening the SAME pane after a close
  // works even though MegaPane's replaceState strip is invisible to Next's router (searchParams stays stale).
  useEffect(() => { const h = (e: Event) => { const p = (e as CustomEvent).detail as string; if (p && VALID_PANES.has(p)) setPaneOpen(normalizePane(p)); }; window.addEventListener("mm:open-pane", h); return () => window.removeEventListener("mm:open-pane", h); }, []);
  // Broadcast the overlay's open/close so AppNav's left-rail "Analyst" highlight tracks the REAL pane
  // state (page name on open, null on close). The URL ?pane= is stripped via replaceState on close and
  // is invisible to Next's useSearchParams, so a URL-derived highlight would stay lit after closing.
  useEffect(() => { window.dispatchEvent(new CustomEvent("mm:pane-state", { detail: paneOpen })); }, [paneOpen]);

  const detect = (kind: any) => { setDetectCmd({ kind, nonce: ++nonce.current }); setDetectOpen(false); };
  function setGrid(n: number) {
    setSplit(n);
    let next: string[];
    if (n <= panes.length) { next = panes.slice(0, n); }
    else {
      const used = new Set(panes); const extra: string[] = [];
      // only UNIQUE symbols — never duplicate a symbol across panes (two panes on one symbol
      // would own separate drawing stores and clobber each other via the replace-all PUT)
      for (const s of wl.map((x) => x.symbol)) { if (panes.length + extra.length >= n) break; if (!used.has(s)) { extra.push(s); used.add(s); } }
      next = [...panes, ...extra];   // may be < n if the watchlist can't supply enough unique symbols
    }
    setPanes(next);
    // keep one timeframe per pane; new panes inherit the active pane's timeframe
    setPaneTfs((tfs) => next.map((_, i) => tfs[i] ?? tf));
    setActivePane((a) => Math.min(a, next.length - 1));
  }
  // one-click multi-timeframe: the active symbol across D / 3D / W / 1M (drawings are shared per-symbol)
  function mtfLayout() { const sym = active; setSplit(4); setPanes([sym, sym, sym, sym]); setPaneTfs(["D", "3D", "W", "1M"]); setActivePane(0); }
  const onTick = useCallback((p: number) => setLivePx(p), []);
  const liveStatus = useLive(active, onTick);

  // type-anywhere → search; Ctrl/Cmd+K
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea") return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setSeed(""); setSearchOpen(true); return; }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (!searchOpen && e.key.length === 1 && /[a-zA-Z0-9]/.test(e.key)) { setSeed(e.key); setSearchOpen(true); }
    };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, [searchOpen]);

  useEffect(() => {
    clearInterval(playRef.current);
    if (replayOn && playing && total) {
      playRef.current = setInterval(() => setReplayIdx((i) => { const n = (i ?? 0) + 1; if (n >= total - 1) { setPlaying(false); return total - 1; } return n; }), 700 / speed);
    }
    return () => clearInterval(playRef.current);
  }, [replayOn, playing, total, speed]);

  const closeAll = () => { setWlSetOpen(false); setTfOpen(false); setCtOpen(false); setDetectOpen(false); setLayoutOpen(false); setWlMenuOpen(false); };
  useEffect(() => { const h = () => closeAll(); window.addEventListener("click", h); return () => window.removeEventListener("click", h); }, []);

  const sections = useMemo(() => { const o: Record<string, string[]> = {}; wl.forEach((s) => { (o[s.section] ||= []).push(s.symbol); }); return o; }, [wl]);
  const inWl = useMemo(() => new Set(wl.map((s) => s.symbol)), [wl]);
  const m = man?.symbols?.[active];
  const liveQuote = quotes[active] ?? null;   // header/badge quote = the active symbol's entry in the shared map
  const buy = isBuy(m?.verdict ?? null);
  // ── unified signal hierarchy ──────────────────────────────────────────────
  // Every ticker used to show three competing verdicts (Oracle · conviction · timing).
  // We keep the Oracle as the single PRIMARY (only backtested) verdict and demote the
  // intel-desk conviction + entry-timing to clearly-labelled SUPPORTING dimensions that
  // answer different questions. Read straight from the live intel `cards` schema.
  const oracleView = useMemo(() => {
    const c = intel?.cards || {};
    const conv = c.conviction || {};
    const aj = c.ai_judgment || {};
    const convScore: number | null = typeof conv.score === "number" ? conv.score : null;
    const sell = m?.verdict === "SELL" || m?.verdict === "CUT";
    // conflict = the backtested trade signal is bearish but the research thesis reads strong;
    // this is the exact case that confuses first-time users (e.g. NVDA SELL @ conviction 96).
    const conflict = sell && convScore != null && convScore >= 60;
    return {
      convScore,
      convBand: conv.band as string | undefined,
      timing: (aj.gloss || aj.verdict) as string | undefined,   // plain-language "act now?" line
      conflict,
    };
  }, [intel, m?.verdict]);
  // live quote (China/HK) wins over the WS tick and the manifest EOD row for both price and % change
  const lastPx = liveQuote?.last ?? livePx ?? m?.last;
  const chgNow = liveQuote?.chg ?? m?.chg;

  // ── market-closed chip ──────────────────────────────────────────────────────
  // Recomputes every minute via setInterval (no holiday calendar — see risks).
  const [mktClosed, setMktClosed] = useState(false);
  useEffect(() => {
    const isCrypto = m?.sec === "Crypto" || active.endsWith("-USD");
    function compute() {
      if (isCrypto) { setMktClosed(false); return; }
      const mkt = m?.mkt ?? "";
      // Known per-market sessions (local open/close HH:MM + IANA timezone).
      // Unlisted markets: show no chip rather than wrong status.
      const US = { tz: "America/New_York", open: "09:30", close: "16:00" };
      const sessions: Record<string, { tz: string; open: string; close: string }> = {
        NASDAQ: US, NYSE: US, AMEX: US, ARCA: US, BATS: US,   // manifest carries the exchange name for US rows
        HKEX: { tz: "Asia/Hong_Kong",  open: "09:30", close: "16:00" },
        KRX:  { tz: "Asia/Seoul",      open: "09:00", close: "15:30" },
        TSE:  { tz: "Asia/Tokyo",      open: "09:00", close: "15:30" },
        LSE:  { tz: "Europe/London",   open: "08:00", close: "16:30" },
        XETRA:{ tz: "Europe/Berlin",   open: "09:00", close: "17:30" },
      };
      const sess = mkt ? sessions[mkt] : US;
      if (!sess) { setMktClosed(false); return; }  // unknown market → no chip
      const now = new Date();
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: sess.tz, hour: "numeric", minute: "2-digit",
        weekday: "short", hour12: false,
      }).formatToParts(now);
      const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
      const wd = get("weekday");          // "Mon" "Tue" … "Sat" "Sun"
      const hh = parseInt(get("hour"), 10);
      const mm = parseInt(get("minute"), 10);
      const isWeekend = wd === "Sat" || wd === "Sun";
      const [oh, om] = sess.open.split(":").map(Number);
      const [ch, cm] = sess.close.split(":").map(Number);
      const nowMin = hh * 60 + mm;
      const openMin = oh * 60 + om;
      const closeMin = ch * 60 + cm;
      const isOpen = !isWeekend && nowMin >= openMin && nowMin < closeMin;
      setMktClosed(!isOpen);
    }
    compute();
    const id = setInterval(compute, 60_000);
    return () => clearInterval(id);
  }, [active, m?.sec, m?.mkt]);
  // ────────────────────────────────────────────────────────────────────────────

  async function addSymbol(sym: string) {
    const sec = man?.symbols?.[sym]?.sec || "Watchlist";
    if (!inWl.has(sym)) {
      setWl((w: any[]) => [...w, { symbol: sym, section: sec }]);
      // only the server-backed Default list syncs upstream; custom lists live client-side
      if (activeList === "Default") fetch("/api/watchlist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "add", symbol: sym, section: sec }) }).catch(() => {});
    }
  }
  async function removeSymbol(sym: string) {
    setWl((w: any[]) => w.filter((s) => s.symbol !== sym));
    if (activeList === "Default") fetch("/api/watchlist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "remove", symbol: sym }) }).catch(() => {});
  }
  // watchlist management (client-side; guests get real switch/create/rename/delete via localStorage)
  function switchList(name: string) { if (lists[name]) setActiveList(name); setWlMenuOpen(false); }
  function newList() {
    const name = (typeof window !== "undefined" ? window.prompt(t("newWatchlistPrompt")) : "")?.trim();
    setWlMenuOpen(false);
    if (!name || lists[name]) return;
    setLists((l) => ({ ...l, [name]: [] })); setActiveList(name);
  }
  function renameList(name: string) {
    const next = (typeof window !== "undefined" ? window.prompt(t("renameWatchlistPrompt"), name) : "")?.trim();
    if (!next || next === name || lists[next]) return;
    setLists((l) => { const n: Record<string, { symbol: string; section: string }[]> = {}; for (const k of Object.keys(l)) n[k === name ? next : k] = l[k]; return n; });
    setActiveList((a) => (a === name ? next : a));
  }
  function deleteList(name: string) {
    if (Object.keys(lists).length <= 1) return;
    if (typeof window !== "undefined" && !window.confirm(t("deleteWatchlistConfirm"))) return;
    setLists((l) => { const n = { ...l }; delete n[name]; return n; });
    if (activeList === name) setActiveList(Object.keys(lists).filter((k) => k !== name)[0] || "Default");
  }
  const toggleInd = (k: string) => setInds((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
  // ── indicator legend actions (shared by the per-pane legend + its More menu) ──
  const toggleHidden = useCallback((k: string) => setHidden((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; }), []);
  const removeInd = useCallback((k: string) => {
    setInds((s) => { if (!s.has(k)) return s; const n = new Set(s); n.delete(k); return n; });
    setHidden((s) => { if (!s.has(k)) return s; const n = new Set(s); n.delete(k); return n; });
  }, []);
  const setIndParam = useCallback((k: string, patch: Record<string, any>) => setIndParams((p) => ({ ...p, [k]: { ...withDefaults(k, p[k]), ...patch } })), []);
  const resetIndParam = useCallback((k: string) => setIndParams((p) => ({ ...p, [k]: indDefaults(k) })), []);
  const openSettings = useCallback((k: string) => setSettingsKey(k), []);
  const openSource = useCallback((k: string) => setSourceKey(k), []);
  const pick = (sym: string) => {
    // prefer the pane the user is viewing (matters in an MTF layout where one symbol fills several panes):
    // re-clicking the active symbol is a no-op rather than jumping focus to the first matching pane.
    const existing = panes[activePane] === sym ? activePane : panes.findIndex((s) => s === sym);
    if (existing >= 0 && existing !== activePane) setActivePane(existing);          // shown in a different pane → focus it (don't duplicate)
    else if (panes[activePane] !== sym) setPanes((p) => p.map((s, i) => (i === activePane ? sym : s)));
    setReplayOn(false); setReplayIdx(null); setPlaying(false); setCompare([]);
  };
  const onSearchPick = (sym: string) => { if (searchMode === "compare") { if (sym !== active) setCompare((c) => (c.includes(sym) ? c : [...c, sym].slice(0, 4))); } else pick(sym); };

  function saveLayout() { const name = layoutName.trim() || `Layout ${layouts.length + 1}`; const config = { panes, paneTfs, activePane, tf, chartType, inds: [...inds], favTF, compare }; fetch("/api/layouts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, config }) }).then(() => fetch("/api/layouts").then((r) => r.json()).then((d) => setLayouts(d.layouts || []))); setLayoutName(""); }
  function loadLayout(l: any) { const c = l.config || {}; if (c.chartType) setChartType(c.chartType); if (c.inds) setInds(new Set(c.inds)); if (c.favTF) setFavTF(c.favTF); if (Array.isArray(c.compare)) setCompare(c.compare);
    if (Array.isArray(c.panes) && c.panes.length) {
      setPanes(c.panes); setActivePane(Math.min(c.activePane || 0, c.panes.length - 1)); setSplit(c.panes.length >= 4 ? 4 : c.panes.length >= 2 ? 2 : 1);
      setPaneTfs(Array.isArray(c.paneTfs) && c.paneTfs.length === c.panes.length ? c.paneTfs : c.panes.map(() => c.tf || "D"));   // back-compat: older layouts have a single tf
    } else if (c.active) { setPanes([c.active]); setActivePane(0); setSplit(1); setPaneTfs([c.tf || "D"]); }
    setLayoutOpen(false); }
  function delLayout(id: string) { fetch(`/api/layouts?id=${id}`, { method: "DELETE" }).then(() => setLayouts((ls) => ls.filter((x) => x.id !== id))); }

  const colList = (): [string, string][] => { const a: [string, string][] = [["last", t("colLast")]]; if (set.cols.change) a.push(["change", t("colChgShort")]); if (set.cols.changePct) a.push(["changePct", t("colChgPctShort")]); if (set.cols.volume) a.push(["volume", t("colVolShort")]); return a; };
  const colVal = (r: Row | undefined, key: string) => { if (!r) return "—"; const u = r.chg >= 0; if (key === "last") return fmt(r.last, r.last < 10 ? 4 : 2); if (key === "change") return (u ? "+" : "") + fmt(r.last * r.chg / 100, 2); if (key === "changePct") return (u ? "+" : "") + fmt(r.chg) + "%"; if (key === "volume") return vol(r.vol); return ""; };
  // resizable columns: symbol track + each visible data track carries an explicit px width
  const colw = (k: string) => set.colW?.[k] ?? DEFAULT_COLW[k] ?? 80;
  const dataCols = colList();
  const wlGrid = `${colw("sym")}px ${dataCols.map(([k]) => colw(k) + "px").join(" ")} 18px`;
  const wlMinW = colw("sym") + dataCols.reduce((s, [k]) => s + colw(k), 0) + 18 + (dataCols.length + 1) * 8;
  const nameOf = (r?: Row) => (r?.zh || r?.name || "");   // Chinese stocks carry a `zh` proper name
  const startResize = (key: string, e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    const startX = e.clientX, startW = colw(key);
    const move = (ev: MouseEvent) => { const w = Math.max(44, Math.round(startW + (ev.clientX - startX))); setSet((s) => ({ ...s, colW: { ...s.colW, [key]: w } })); };
    const up = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); document.body.classList.remove("col-resizing"); };
    window.addEventListener("mousemove", move); window.addEventListener("mouseup", up); document.body.classList.add("col-resizing");
  };
  const startRailResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX, startW = railW;
    let latest = railW;
    const move = (ev: MouseEvent) => {
      latest = Math.min(520, Math.max(300, startW - (ev.clientX - startX)));
      setRailW(latest);
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      document.body.classList.remove("rail-resizing");
      localStorage.setItem("mm.railW", String(latest));
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    document.body.classList.add("rail-resizing");
  };

  return (
    <div className={`app${fullChart ? " fs" : ""}`} style={{ ["--rail-w" as any]: `${railW}px` }}>
      <header className="topbar">
        {fromMacro
          ? <button className="brand-back" onClick={onBack} title={t("backToDashboard")} aria-label={t("backToDashboard")}>
              <span className="bb-chev"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6" /></svg></span>
              <BrandMark />
              <span className="wm"><b>MASTERMIND</b><small>← {t("dashboard")}</small></span>
            </button>
          : <BrandLockup />}
        <div className="tdiv" />
        <div className="pair" onClick={() => { setSeed(""); setSearchMode("go"); setSearchOpen(true); }}><span className="dual"><i>{active[0]}</i><i>$</i></span><b>{active}</b>
          <svg className="car" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" /></svg></div>
        <button className="cmp-btn" title={t("compareTitle")} onClick={(e) => { e.stopPropagation(); setSearchMode("compare"); setSeed(""); setSearchOpen(true); }}>
          <svg viewBox="0 0 24 24"><path d="M4 18l5-9 4 5 3-4 4 8" /></svg>
          <span>{t("compare")}</span>
          {compare.filter((c) => c !== active).length > 0 && <i className="cmp-badge">{compare.filter((c) => c !== active).length}</i>}
        </button>
        <div className="stats">
          <div className="stat"><span className="l">{t("lastPrice")}</span><span className="v big num">{fmt(lastPx, m && lastPx != null && lastPx < 10 ? 4 : 2)}</span></div>
          <div className="stat"><span className="l">{t("change24h")}</span><span className={`v num ${(chgNow ?? 0) >= 0 ? "up" : "down"}`}>{chgStr(chgNow)}</span></div>
          <div className="stat"><span className="l">{t("volume")}</span><span className="v num">{m ? vol(m.vol) : "—"}</span></div>
          <DayRange low={liveQuote?.low ?? m?.low} high={liveQuote?.high ?? m?.high} last={lastPx} open={liveQuote?.open ?? m?.open} variant="bar" />
        </div>
        {(() => {
          const basis = liveQuote?.basis ?? (liveStatus === "live" ? "LIVE" : "EOD");
          const badgeCls = basis === "LIVE" ? "livebadge live" : basis === "DELAYED_15M" ? "livebadge delayed" : "livebadge";
          const badgeLbl = basis === "LIVE" ? t("live") : basis === "DELAYED_15M" ? t("delayed15m") : t("historical");
          return <span className={badgeCls} style={{ marginLeft: 16 }} title={t("liveTip")}><i />{badgeLbl}</span>;
        })()}
        <div className="spacer" />
        <button className="ai" onClick={() => setCopilot(true)}><svg viewBox="0 0 24 24"><path d="M12 2l2.2 5.8L20 10l-5.8 2.2L12 18l-2.2-5.8L4 10l5.8-2.2z" /></svg>Mastermind AI</button>
        <SettingsMenu email={email} />
      </header>

      {/* ── mobile top bar — left slot: a prominent "Back to Dashboard" button when the user came from the
           Macro Dashboard, otherwise the menu button. When Back claims the left, the menu moves into the
           right cluster so the hamburger always has a home. ── */}
      <div className={`mobilebar${fromMacro ? " from-macro" : ""}`}>
        {fromMacro
          ? <button className="m-back-prom breathe" onClick={onBack} aria-label={t("backToDashboard")}><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6" /></svg><span>{t("dashboard")}</span></button>
          : <button className="m-ic" onClick={() => setDrawer(true)} aria-label="Menu"><svg viewBox="0 0 24 24"><path d="M3 6h18M3 12h18M3 18h18" /></svg></button>}
        <span className="m-brand"><BrandMark size={22} /><b>MASTERMIND</b></span>
        <div className="m-right">
          {fromMacro && <button className="m-ic" onClick={() => setDrawer(true)} aria-label="Menu"><svg viewBox="0 0 24 24"><path d="M3 6h18M3 12h18M3 18h18" /></svg></button>}
          <button className="m-ic" onClick={() => setCopilot(true)} aria-label="Mastermind AI"><svg viewBox="0 0 24 24" style={{ fill: "var(--brand-2)", stroke: "none" }}><path d="M12 2l2.2 5.8L20 10l-5.8 2.2L12 18l-2.2-5.8L4 10l5.8-2.2z" /></svg></button>
          <SettingsMenu email={email} />
        </div>
      </div>
      {/* ── mobile symbol bar (tap → search) ── */}
      <div className="m-symbar" onClick={() => { setSeed(""); setSearchOpen(true); }}>
        <span className="m-sym"><span className="ic" style={{ background: m?.col || "#76b900" }}>{active[0]}</span><b>{active}</b><svg className="car" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" /></svg></span>
        <span className="m-px"><b className="num">{fmt(lastPx, m && lastPx != null && lastPx < 10 ? 4 : 2)}</b><span className={`cg num ${(chgNow ?? 0) >= 0 ? "up" : "down"}`}>{chgStr(chgNow)}</span></span>
      </div>

      <AppNav />

      <section className="workspace">
        <button className={`chart-fs-float${fullChart ? " on" : ""}`} title={fullChart ? t("exitFullscreen") : t("fullscreenChart")} onClick={() => setFullChart((f) => !f)}>
          {fullChart
            ? <svg viewBox="0 0 24 24"><path d="M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5" /></svg>
            : <svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M15 20h5v-5M9 20H4v-5" /></svg>}
        </button>
        <div className="chart-tabs">
          <div className={`ct${view === "price" ? " on" : ""}`} onClick={() => setView("price")}>{t("priceChart")}</div>
          <div className={`ct${view === "strategy" ? " on" : ""}`} onClick={() => setView("strategy")}>{t("strategyTester")}</div>
          <div className="tools">
            <div className="pophost">
              <div className="seg">
                {favTF.map((t) => <button key={t} className={tf === t ? "on" : ""} disabled={!FUNCTIONAL.has(t)} style={!FUNCTIONAL.has(t) ? { opacity: .4 } : {}} onClick={() => FUNCTIONAL.has(t) && setTf(t)}>{t}</button>)}
                <button onClick={(e) => { e.stopPropagation(); const willOpen = !tfOpen; closeAll(); setTfOpen(willOpen); }} style={{ padding: "0 6px" }}>▾</button>
              </div>
              <div className={`tfgrid${tfOpen ? " show" : ""}`} onClick={(e) => e.stopPropagation()}>
                {TF_GROUPS.map(([g, items]) => (<div key={g}><div className="g">{t(TFG_TKEY[g])}</div>{items.map((tfi) => { const fn = FUNCTIONAL.has(tfi); const fav = favTF.includes(tfi);
                  return <div key={tfi} className={`it${tf === tfi ? " on" : ""}${fn ? "" : " dis"}`} onClick={() => { if (fn) { setTf(tfi); setTfOpen(false); } }}>
                    <span>{tfi}{!fn && <span style={{ color: "var(--text-dim)", marginLeft: 6, fontSize: 10 }}>{t("liveFeed")}</span>}</span>
                    <span className={`fav${fav ? " on" : ""}`} onClick={(e) => { e.stopPropagation(); setFavTF((f) => f.includes(tfi) ? f.filter((x) => x !== tfi) : [...f, tfi]); }}><svg viewBox="0 0 24 24"><path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z" /></svg></span>
                  </div>; })}</div>))}
              </div>
            </div>
            <div className="pophost">
              <button className="tbtn" onClick={(e) => { e.stopPropagation(); const willOpen = !ctOpen; closeAll(); setCtOpen(willOpen); }}><svg viewBox="0 0 24 24"><path d="M6 4v16M6 8h3M14 4v16M14 9h3" /></svg>{t(CT_TKEY[chartType])}<span style={{ color: "var(--muted)" }}>▾</span></button>
              <div className={`pop${ctOpen ? " show" : ""}`} style={{ top: 32, left: 0 }} onClick={(e) => e.stopPropagation()}>
                {CHART_TYPES.map(([k]) => <div key={k} className="set-row" style={chartType === k ? { color: "var(--brand-2)" } : {}} onClick={() => { setChartType(k); setCtOpen(false); }}>{t(CT_TKEY[k])}</div>)}
              </div>
            </div>
            <button className="tbtn" onClick={() => setIndOpen(true)}><svg viewBox="0 0 24 24" style={{ strokeWidth: 2 }}><path d="M5 12h14M12 5v14" /></svg>{t("indicators")}</button>
            <div className="seg tool-adv" title={t("splitLayout")}>{[1, 2, 4].map((n) => <button key={n} className={split === n ? "on" : ""} onClick={() => setGrid(n)}>{n}</button>)}</div>
            <button className="tbtn tool-adv" title={t("mtfTip")} onClick={mtfLayout}><svg viewBox="0 0 24 24"><path d="M3 13h4v8H3zM10 8h4v13h-4zM17 3h4v18h-4z" /></svg>{t("mtf")}</button>
            {panes.length > 1 && <button className={`tbtn tool-adv${sync ? " on" : ""}`} title={t("syncTip")} onClick={() => setSync((s) => !s)}><svg viewBox="0 0 24 24"><path d="M4 7h11M4 7l3-3M4 7l3 3M20 17H9M20 17l-3-3M20 17l-3 3" /></svg>{t("sync")}</button>}
            <div className="pophost tool-adv">
              <button className="tbtn" onClick={(e) => { e.stopPropagation(); const willOpen = !detectOpen; closeAll(); setDetectOpen(willOpen); }}><svg viewBox="0 0 24 24"><path d="M3 17l5-5 4 4 8-8" /></svg>{t("detect")}<span style={{ color: "var(--muted)" }}>▾</span></button>
              <div className={`pop${detectOpen ? " show" : ""}`} style={{ top: 32, left: 0, minWidth: 200 }} onClick={(e) => e.stopPropagation()}>
                {DETECTORS.map(([k]) => <div key={k} className="menu-row" onClick={() => detect(k)}><svg viewBox="0 0 24 24"><path d="M3 17l5-5 4 4 8-8" /></svg>{t(DET_TKEY[k])}</div>)}
              </div>
            </div>
            <div className="pophost tool-adv">
              <button className="tbtn" onClick={(e) => { e.stopPropagation(); const willOpen = !layoutOpen; closeAll(); setLayoutOpen(willOpen); }}><svg viewBox="0 0 24 24"><path d="M4 5h16v14H4zM4 9h16M9 9v10" /></svg>{t("layouts")}<span style={{ color: "var(--muted)" }}>▾</span></button>
              <div className={`pop${layoutOpen ? " show" : ""}`} style={{ top: 32, right: 0, minWidth: 230 }} onClick={(e) => e.stopPropagation()}>
                <div className="menu-save"><input placeholder={t("saveCurrentAs")} value={layoutName} onChange={(e) => setLayoutName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") saveLayout(); }} /><button onClick={saveLayout}>{t("save")}</button></div>
                {layouts.length === 0 && <div className="menu-row" style={{ color: "var(--text-dim)" }}>{t("noSavedLayouts")}</div>}
                {layouts.map((l) => <div key={l.id} className="menu-row" onClick={() => loadLayout(l)}>{l.name}<span className="rm" onClick={(e) => { e.stopPropagation(); delLayout(l.id); }}><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg></span></div>)}
              </div>
            </div>
            <button className="icbtn tool-adv" title={t("snapshot")} onClick={() => window.dispatchEvent(new CustomEvent("mm:snapshot"))}><svg viewBox="0 0 24 24"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg></button>
            <button className={`icbtn chart-fs-btn${fullChart ? " on" : ""}`} title={fullChart ? t("exitFullscreen") : t("fullscreenChart")} onClick={() => setFullChart((f) => !f)}>
              {fullChart
                ? <svg viewBox="0 0 24 24"><path d="M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5" /></svg>
                : <svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M15 20h5v-5M9 20H4v-5" /></svg>}
            </button>
          </div>
        </div>

        {view === "price" && compare.filter((c) => c !== active).length > 0 && (
          <div className="cmp-strip">
            <span className="cmp-lbl">{t("compare")}</span>
            {compare.filter((c) => c !== active).map((cs, i) => (
              <span className="cmp-chip" key={cs}><i style={{ background: CMP_COLORS[i % CMP_COLORS.length] }} />{cs}<button title="Remove" onClick={() => setCompare((c) => c.filter((x) => x !== cs))}>✕</button></span>
            ))}
          </div>
        )}

        {replayOn && view === "price" && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 14px", borderBottom: "1px solid var(--line)", background: "var(--bg)" }}>
            <button className="icbtn" title="Reset" onClick={() => { setReplayIdx(Math.max(20, total - 80)); setPlaying(false); }}><svg viewBox="0 0 24 24"><path d="M11 19l-7-7 7-7M20 19l-7-7 7-7" /></svg></button>
            <button className="icbtn" onClick={() => setReplayIdx((i) => Math.max(20, (i ?? 0) - 1))}><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6" /></svg></button>
            <button className="icbtn" onClick={() => setPlaying((p) => !p)}>{playing ? <svg viewBox="0 0 24 24"><path d="M6 4h4v16H6zM14 4h4v16h-4z" /></svg> : <svg viewBox="0 0 24 24" style={{ fill: "var(--signal)", stroke: "none" }}><path d="M6 4l14 8-14 8V4z" /></svg>}</button>
            <button className="icbtn" onClick={() => setReplayIdx((i) => Math.min(total - 1, (i ?? 0) + 1))}><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6" /></svg></button>
            <div className="seg" style={{ height: 26 }}>{[1, 2, 4].map((s) => <button key={s} className={speed === s ? "on" : ""} onClick={() => setSpeed(s)}>{s}x</button>)}</div>
            <input type="range" min={20} max={Math.max(21, total - 1)} value={replayIdx ?? total - 1} onChange={(e) => setReplayIdx(parseInt(e.target.value))} style={{ flex: 1, accentColor: "var(--brand)" }} />
            <span className="num" style={{ color: "var(--muted)", fontSize: 11.5, minWidth: 70, textAlign: "right" }}>{(replayIdx ?? total - 1) + 1} / {total}</span>
          </div>
        )}

        {view === "price" ? (
          <div className="chart-body">
            <div className="tooldock">
              {TOOLS.map(([id, d]) => (
                <button key={id} className={(tool === id || (id === "cursor" && !tool)) ? "on" : ""} title={t(TOOL_TKEY[id] || id, id)} onClick={() => setTool(id === "cursor" ? null : id)}><svg viewBox="0 0 24 24"><path d={d} /></svg></button>
              ))}
              <button className={magnet ? "on" : ""} title={t("magnetTip")} onClick={() => setMagnet((mg) => !mg)}><svg viewBox="0 0 24 24"><path d="M6 4v7a6 6 0 0 0 12 0V4h-4v7a2 2 0 0 1-4 0V4z" /></svg></button>
              <div className="sp" />
              <button title={t("clearDrawings")} onClick={() => detect("clearAll")}><svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></svg></button>
            </div>
            {tool && STYLEABLE.has(tool) && (
              <div className="draw-style-pop" onPointerDown={(e) => e.stopPropagation()}>
                {["#4d82ff", "#26c281", "#f0566b", "#e8b339", "#d6dae3"].map((c) => (
                  <button key={c} className={`dsp-sw${drawStyle.color === c ? " on" : ""}`} style={{ background: c }} title={c} onClick={() => setDrawStyle((s) => ({ ...s, color: c }))} />
                ))}
                <span className="dsp-sep" />
                {[1.5, 2.5, 4].map((w) => (
                  <button key={w} className={`dsp-w${drawStyle.width === w ? " on" : ""}`} title={`${w}px`} onClick={() => setDrawStyle((s) => ({ ...s, width: w }))}><i style={{ height: Math.max(1, Math.round(w)) }} /></button>
                ))}
                {tool !== "arrow" && <span className="dsp-sep" />}
                {tool !== "arrow" && (["solid", "dashed", "dotted"] as const).map((dk) => (
                  <button key={dk} className={`dsp-d${drawStyle.dash === dk ? " on" : ""}`} title={dk} onClick={() => setDrawStyle((s) => ({ ...s, dash: dk }))}><svg viewBox="0 0 20 12"><path d={dk === "solid" ? "M2 6h16" : dk === "dashed" ? "M2 6h4M8 6h4M14 6h4" : "M2 6h.5M6 6h.5M10 6h.5M14 6h.5M18 6h.5"} /></svg></button>
                ))}
              </div>
            )}
            <div className="pane-grid" data-n={panes.length}>
              {panes.map((sym, i) => (
                <ChartPane key={i} idx={i} symbol={sym} isActive={i === activePane} onActivate={setActivePane} row={man?.symbols?.[sym]} tf={paneTfs[i] ?? "D"} chartType={chartType} inds={inds} tool={tool} drawStyle={drawStyle} detectCmd={detectCmd} compare={compare} magnet={magnet} replayIdx={replayOn ? replayIdx : null} onMeta={(mm) => setTotal(mm.total)} drawings={drawStore[sym] ?? []} onDrawingsChange={(d) => setSymbolDrawings(sym, d)} liveQuote={quotes[sym] ?? null} indParams={indParams} hidden={hidden} onToggleHidden={toggleHidden} onRemoveInd={removeInd} onOpenSettings={openSettings} onOpenSource={openSource} />
              ))}
            </div>
          </div>
        ) : (
          <StrategyTester symbol={active} key={"strat" + active} />
        )}
      </section>

      <div className="rail-resizer" role="separator" aria-orientation="vertical" aria-label="Resize sidebar" onMouseDown={startRailResize}><span /></div>
      <aside className="rail">
        <div className="rail-body">
          <div className="board wl-board">
            <div className="wl-bar pophost">
              <button className="wl-select" onClick={(e) => { e.stopPropagation(); const willOpen = !wlMenuOpen; closeAll(); setWlMenuOpen(willOpen); }}>{activeList} <svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" /></svg></button>
              <div className={`pop wl-lists${wlMenuOpen ? " show" : ""}`} style={{ top: 40, left: 6, minWidth: 210 }} onClick={(e) => e.stopPropagation()}>
                <div className="set-grp">{t("watchlists")}</div>
                {Object.keys(lists).map((name) => (
                  <div key={name} className={`set-row wl-list-row${name === activeList ? " on" : ""}`} onClick={() => switchList(name)}>
                    <span className="cbx"><svg viewBox="0 0 24 24"><path d="M4 12l5 5L20 6" /></svg></span>
                    <span className="wl-list-nm">{name}</span>
                    <span className="wl-list-ct">{lists[name].length}</span>
                    <span className="wl-list-ic" title={t("renameWatchlist")} onClick={(e) => { e.stopPropagation(); renameList(name); }}><svg viewBox="0 0 24 24"><path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3M13.5 6.5l3 3" /></svg></span>
                    {Object.keys(lists).length > 1 && <span className="wl-list-ic del" title={t("deleteWatchlist")} onClick={(e) => { e.stopPropagation(); deleteList(name); }}><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg></span>}
                  </div>
                ))}
                <div className="menu-row wl-new" onClick={() => newList()}><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>{t("newWatchlist")}</div>
              </div>
              <div className="wl-acts">
                <button title={t("addSymbol")} onClick={(e) => { e.stopPropagation(); setSeed(""); setSearchOpen(true); }}><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg></button>
                <button title={t("settings")} onClick={(e) => { e.stopPropagation(); const willOpen = !wlSetOpen; closeAll(); setWlSetOpen(willOpen); }}><svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></svg></button>
              </div>
              <div className={`pop${wlSetOpen ? " show" : ""}`} style={{ top: 40, right: 6 }} onClick={(e) => e.stopPropagation()}>
                <div className="set-h"><b>{t("tableViewLabel")}</b><span className={`switch${set.tableView ? " on" : ""}`} onClick={() => setSet((s) => ({ ...s, tableView: !s.tableView }))} /></div>
                <div className="set-grp">{t("columns")}</div>
                {([["last", t("colLast")], ["change", t("colChange")], ["changePct", t("colChangePct")], ["volume", t("colVolume")]] as [string, string][]).map(([k, l]) => (
                  <div key={k} className={`set-row${(set.cols as any)[k] ? " on" : ""}`} onClick={() => setSet((s) => ({ ...s, cols: { ...s.cols, [k]: !(s.cols as any)[k] } }))}><span className="cbx"><svg viewBox="0 0 24 24"><path d="M4 12l5 5L20 6" /></svg></span>{l}</div>
                ))}
                <div className="set-grp">{t("symbolDisplay")}</div>
                <div className={`set-row${set.logo ? " on" : ""}`} onClick={() => setSet((s) => ({ ...s, logo: !s.logo }))}><span className="cbx"><svg viewBox="0 0 24 24"><path d="M4 12l5 5L20 6" /></svg></span>{t("logo")}</div>
                {([["symbol", t("dispSymbol")], ["name", t("dispName")], ["both", t("dispBoth")]] as [string, string][]).map(([d, l]) => <div key={d} className={`set-row${set.disp === d ? " on" : ""}`} onClick={() => setSet((s) => ({ ...s, disp: d }))}><span className="rdo" />{l}</div>)}
              </div>
            </div>
            <div className="wl-scroll">
              <div className="wl-cols" style={{ gridTemplateColumns: wlGrid, minWidth: wlMinW }}>
                <span className="wl-col">{t("symbol")}<i className="wl-rz" title={t("resizeCol")} onMouseDown={(e) => startResize("sym", e)} /></span>
                {dataCols.map(([k, l]) => <span key={k} className="wl-col"><span className="wl-col-l">{l}</span><i className="wl-rz" title={t("resizeCol")} onMouseDown={(e) => startResize(k, e)} /></span>)}
                <span />
              </div>
              <div className="wl-list">
                {Object.entries(sections).map(([sec, rows]) => (
                  <div key={sec}>
                    <div className="wl-sec" style={{ minWidth: wlMinW }}>{sec}</div>
                    {rows.map((sym) => { const r = mergeLive(man?.symbols?.[sym], quotes[sym]); const u = (r?.chg ?? 0) >= 0; const nm = nameOf(r);
                      const primary = set.disp === "name" ? (nm || sym) : sym;
                      const secondary = set.disp === "both" ? nm : set.disp === "name" ? sym : (set.tableView ? "" : nm);
                      return (
                        <div key={sym} className={`wl-row${sym === active ? " on" : ""}${set.tableView ? " tv" : ""}`} style={{ gridTemplateColumns: wlGrid, minWidth: wlMinW, height: set.tableView ? 32 : 46 }} onClick={() => pick(sym)} onMouseEnter={() => { prefetch(`/data/${sym}.json`); prefetch(`/data/${sym}.slice.json`); prefetch(`/data/${sym}.intel.json`); }}>
                          <div className="s">{set.logo && <span className="ic" style={{ background: r?.col || "#888", width: set.tableView ? 18 : 24, height: set.tableView ? 18 : 24 }}>{sym[0]}</span>}
                            <span className="nm"><span className="tk">{primary}</span>{secondary && <span className={set.tableView ? "tk-sub" : "sub"}>{secondary}</span>}</span></div>
                          {dataCols.map(([k]) => <span key={k} className={`c num ${k === "changePct" || k === "change" ? (u ? "up" : "down") : ""}`}>{colVal(r, k)}</span>)}
                          <span className="rm" title={t("remove")} onClick={(e) => { e.stopPropagation(); removeSymbol(sym); }}><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg></span>
                        </div>
                      ); })}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="board detail-board">
            {/* detail-hd: flex-wrap 2-row — top: icon+name, bottom: big price + status chip */}
            <div className="detail-hd">
              <span className="ic" style={{ background: m?.col || "#76b900" }}>{active[0]}</span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="nm">{nameOf(m) || active}</div>
                <div className="ex">{active}{(m?.mkt || m?.sec) ? ` · ${m?.mkt || m?.sec}` : ""}</div>
              </div>
              {/* ex-btn is order:1 → stays in the top row at right via margin-left:auto.
                  Opens MegaPane overview (OURS) — prod's standalone analysis modal was superseded. */}
              <button className="ex-btn" title={t("openFullAnalysis")} onClick={() => setPaneOpen("overview")}><svg viewBox="0 0 24 24"><path d="M4 14v6h6M20 10V4h-6M14 10l6-6M10 14l-6 6" /></svg></button>
              {/* price row: order:2 → wraps below name row (width:100% in CSS) */}
              <div className="px">
                <b className="num">{fmt(lastPx, m && lastPx != null && lastPx < 10 ? 4 : 2)}</b>
                <span className={`cg num ${(chgNow ?? 0) >= 0 ? "up" : "down"}`}>{chgStr(chgNow)}</span>
                {mktClosed && <span className="mkt-closed">{t("marketClosed")}</span>}
              </div>
            </div>
            <div className="detail-scroll">
              <div style={{ padding: "12px 12px 0" }}>
                {/* ── Golden Oracle → compact clickable chip. The full scorecard (verdict · WR/PF/CAGR ·
                    supporting reads · signal history) now lives in the Signals dashboard. ── */}
                <button className="mm-chip" style={{ borderLeftColor: buy ? "var(--buy)" : "var(--sell)" }} onClick={() => setSignalsOpen(true)} title={t("goldenOracle")}>
                  <svg viewBox="0 0 24 24"><path d="M12 2l2.2 5.8L20 10l-5.8 2.2L12 18l-2.2-5.8L4 10l5.8-2.2z" /></svg>
                  <span className="mm-chip-lbl">{t("goldenOracle")}</span>
                  <span className="mm-chip-verdict" style={{ color: buy ? "var(--buy)" : "var(--sell)" }}>{m?.verdict || "—"}</span>
                  <svg className="mm-chip-car" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6" /></svg>
                </button>
              </div>
              <StockAnalysis intel={intel} row={m} slice={slice} fund={fund} opts={opts} bars={bars} onExpand={() => setPaneOpen("overview")} onOpenPane={(p) => setPaneOpen(p)} onOpenSignals={() => setSignalsOpen(true)} />
              <div style={{ padding: 12 }}><SeasonalityCard symbol={active} onOpenPane={() => setPaneOpen("seasonals")} /></div>
              {/* ── bottom button group (after Seasonality): full analysis + Ask AI ── */}
              <div className="sa-btn-group">
                <button className="btn btn-primary" style={{ width: "100%", height: 38 }} onClick={() => setPaneOpen("overview")}>{t("openFullAnalysis")}</button>
                <button className="btn btn-ghost" style={{ width: "100%", height: 36 }} onClick={() => setCopilot(true)}>{t("askAIabout")} {active} →</button>
              </div>
            </div>
          </div>
        </div>
      </aside>

      <div className="ticker">
        <span className="lbl">{t("movers")}</span>
        <div className="tk-marquee">
          {/* two identical runs so the -50% translate loops seamlessly (see .tk-marquee in globals.css) */}
          <div className="tk-track">
            {[0, 1].map((dup) => (
              <div className="tk-run" key={dup} aria-hidden={dup === 1 || undefined}>
                {Object.entries(man?.symbols || {}).slice(0, 16).map(([s, r0]) => { const r = mergeLive(r0, quotes[s])!; const u = r.chg >= 0; return (
                  <span key={s} className="tk" style={{ cursor: "pointer" }} onClick={() => pick(s)}><span className="s">{s.replace("-USD", "")}</span><span className="p num">{fmt(r.last, r.last < 10 ? 3 : 2)}</span><span className={`c num ${u ? "up" : "down"}`}>{u ? "+" : ""}{fmt(r.chg)}%</span></span>
                ); })}
              </div>
            ))}
          </div>
        </div>
      </div>

      <SearchModal open={searchOpen} seed={seed} manifest={(man?.symbols as any) || {}} inWatchlist={inWl} mode={searchMode} compare={compare} active={active}
        onClose={() => { setSearchOpen(false); setSearchMode("go"); }} onPick={onSearchPick} onAdd={addSymbol}
        onToggleCompare={(s: string) => setCompare((c) => c.includes(s) ? c.filter((x) => x !== s) : (s !== active ? [...c, s].slice(0, 4) : c))} />
      <IndicatorsModal open={indOpen} active={inds} onClose={() => setIndOpen(false)} onToggle={toggleInd} />
      {settingsKey && <IndicatorSettings indKey={settingsKey} params={indParams[settingsKey] || {}} onChange={(patch) => setIndParam(settingsKey, patch)} onClose={() => setSettingsKey(null)} onReset={() => resetIndParam(settingsKey)} />}
      {sourceKey && <IndicatorSource indKey={sourceKey} onClose={() => setSourceKey(null)} />}
      <CopilotPanel open={copilot} symbol={active} row={m} onClose={() => setCopilot(false)} onAnnotate={annotateChart} />

      {/* ── MegaPane: in-shell full-coverage fundamentals overlay (replaces the old .sa-modal) ── */}
      {paneOpen && (
        <MegaPane
          sym={active}
          fund={fund}
          intel={intel}
          row={m}
          slice={slice}
          quote={liveQuote ? { last: lastPx ?? null } : null}
          bars={bars}
          page={paneOpen}
          onPage={(p) => setPaneOpen(p)}
          onClose={() => setPaneOpen(null)}
          name={nameOf(m) || active}
        />
      )}

      {/* ── Signals dashboard overlay (Golden Oracle scorecard · research read · signal history) ── */}
      {signalsOpen && (
        <OracleDash sym={active} row={m} slice={slice} intel={intel} bars={bars} zh={lang === "zh"} onClose={() => setSignalsOpen(false)} onJump={(ts: string) => { window.dispatchEvent(new CustomEvent("mm:chart-jump", { detail: { ts } })); setSignalsOpen(false); }} />
      )}

      {/* ── mobile nav drawer ── */}
      <div className={`m-drawer-scrim${drawer ? " open" : ""}`} onClick={() => setDrawer(false)} />
      <div className={`m-drawer${drawer ? " open" : ""}`}>
        <div className="m-drawer-h"><BrandLockup /></div>
        <nav className="m-nav">
          {MNAV.map(([href, label, d]) => (
            <Link key={href} href={href} className={navPath === href || (href === "/terminal" && navPath.startsWith("/terminal")) ? "on" : ""} onClick={() => setDrawer(false)}>
              {d === "RECT"
                ? <svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>
                : <svg viewBox="0 0 24 24"><path d={d} /></svg>}
              {label}
            </Link>
          ))}
          <button onClick={() => { setDrawer(false); setCopilot(true); }}>
            <svg viewBox="0 0 24 24" style={{ fill: "var(--brand-2)", stroke: "none" }}><path d="M12 2l2.2 5.8L20 10l-5.8 2.2L12 18l-2.2-5.8L4 10l5.8-2.2z" /></svg>
            Mastermind AI
          </button>
        </nav>
        <div className="m-drawer-ft"><SettingsMenu email={email} /></div>
      </div>
    </div>
  );
}
