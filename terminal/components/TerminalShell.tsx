"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useIsMobile } from "@/lib/useMediaQuery";
import MobileSheet from "@/components/ui/MobileSheet";
import { DndContext, PointerSensor, KeyboardSensor, useSensor, useSensors, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { restrictToVerticalAxis, restrictToParentElement } from "@dnd-kit/modifiers";
import { CSS as DndCSS } from "@dnd-kit/utilities";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandLockup, BrandMark } from "@/components/BrandMark";
import { AppNav } from "@/components/AppNav";
import MobileNav from "@/components/MobileNav";
import { type DetectCmd } from "@/components/ChartPanel";
import ChartPane from "@/components/ChartPane";
import ChartConductor from "@/components/ChartConductor";
import { intradayCapable } from "@/components/ChartPanel";
import { classify } from "@/lib/intradaySources";
import { type FinPage } from "@/components/fin/MegaPane";
import { getFund, getOpts, getBars, type Fund, type Bar } from "@/lib/fund";
import SearchModal, { FLAG_DEFAULT, FLAG_COLORS } from "@/components/SearchModal";
import IndicatorsModal from "@/components/IndicatorsModal";
import IndicatorSettings from "@/components/IndicatorSettings";
import IndicatorSource from "@/components/IndicatorSource";
import { allDefaults, indDefaults, withDefaults, IND_ORDER, IND_DEFS, isIndKey } from "@/lib/indicators";
import { useChartBus } from "@/lib/useChartBus";
import { isV2Envelope, type IndicatorSpec } from "@/lib/chartBus";
import SeasonalityCard from "@/components/SeasonalityCard";
// Code-split the conditionally-mounted heavies out of the /terminal first-paint bundle (task 9).
// TerminalShell is a Client Component, so ssr:false is allowed — none of these render on any SSR
// path (each mounts only when opened: paneOpen / signalsOpen / copilot toggle).
const MegaPane = dynamic(() => import("@/components/fin/MegaPane"), { ssr: false });
const OracleDash = dynamic(() => import("@/components/fin/OracleDash"), { ssr: false });
// BrainWidget mounts the production Mastermind Brain widget (mm_brain.js) — it renders null
// and only injects a cross-origin <script>, so ssr:false / dynamic isn't needed.
import BrainWidget from "@/components/BrainWidget";
import StockAnalysis from "@/components/StockAnalysis";
import SignalButton from "@/components/SignalButton";
import TrendRow from "@/components/TrendRow";
import { oracleVerdict, deskVerdict } from "@/lib/signalVerdict";
import { computeTrendState } from "@/lib/trend";
import { useLive } from "@/lib/live";
import { setPaneSync } from "@/lib/paneSync";
import { type Drawing, uid } from "@/lib/drawings";
import SettingsMenu from "@/components/SettingsMenu";
import { OnboardingProvider } from "@/components/onboarding/OnboardingProvider";
import DrawingSidebar from "@/components/DrawingSidebar";
import DayRange from "@/components/DayRange";
import { useT, useLang } from "@/lib/i18n";
import { useFromMacro, backToMacro } from "@/lib/originNav";
import { getJSON, prefetch, loadCoverage } from "@/lib/dataCache";
import { type CmpCfg, type CmpMode, defaultCmpCfg, cmpKey, isCmpKey, cmpSymOf } from "@/lib/compare";
import { isComposite, parseComposite, compositeQuote as calcCompositeQuote } from "@/lib/composite";
import { pushHistory } from "@/lib/searchHistory";
import CompareSettings from "@/components/CompareSettings";
import { listScripts, deleteScript as delScript, renameScript as renScript, enabledScriptIds, setEnabledScriptIds, pineParamStore, setPineParamStore, mergedParams, type UserScript } from "@/lib/userScripts";
import { type PineScript } from "@/components/ChartPanel";
import ChartTableView from "@/components/ChartTableView";
import ChartObjectTree, { type OTEntry } from "@/components/ChartObjectTree";
import { listTemplates, saveTemplate } from "@/lib/chartTemplates";

type Row ={ name: string; sec: string; col: string; mkt?: string; zh?: string; last: number; chg: number; open: number; high: number; low: number; vol: number; hi52: number; lo52: number; verdict: string | null; wr: number | null; pf: number | null; cagr: number | null; regimeBull: boolean | null };
type Manifest = { as_of: string | null; symbols: Record<string, Row> };

const fmt = (n: number | null | undefined, d = 2) => (n == null || !isFinite(n) ? "—" : n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }));
const vol = (v: number | null | undefined) => (v == null || !isFinite(v) ? "—" : v >= 1e9 ? (v / 1e9).toFixed(2) + "B" : v >= 1e6 ? (v / 1e6).toFixed(1) + "M" : String(v));
const chgStr = (c: number | null | undefined) => (c == null || !isFinite(c) ? "—" : (c >= 0 ? "+" : "") + fmt(c) + "%");

// Shallow equality over the UNION of both quotes' keys (a/b are the /api/quote entries, whose
// shape varies by asset class — last/chg/basis/vol/ts/prevClose/…). Returns true only when every
// field is identical, so setQuotes can keep the prior object reference and let React bail out
// on a no-op 6s poll. `null`/`undefined` are treated as "no quote".
function quoteEq(a: any, b: any): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (a[k] !== b[k]) return false;
  return true;
}

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
  // After-hours: when the hub emits an official EOD `close`, the row's LAST/CHG%
  // should reflect the completed session (the after-hours delta belongs in the
  // EXT column), NOT the raw AH-influenced `last`/`chg`. Mirrors the detail-pane
  // rule (officialClose ?? last; chg = (close - prevClose)/prevClose) so the
  // sidebar, header, and detail pane all agree.
  const officialClose = q.close;
  if (officialClose != null && isFinite(officialClose)) {
    base.last = officialClose;
    const prevClose = q.prevClose;
    if (prevClose != null && isFinite(prevClose) && prevClose !== 0) {
      base.chg = ((officialClose - prevClose) / prevClose) * 100;
    }
  }
  // Overnight (post-midnight-ET, pre-open): no new session prints exist, so chg
  // computes to a misleading 0.00%. The hub emits prevSessionChg ONLY in that
  // window — show the last completed session's move instead (TV semantics).
  if (q.prevSessionChg != null && isFinite(q.prevSessionChg)) {
    base.chg = q.prevSessionChg;
  }
  return base;
}

// Drag-sortable wrapper for a watchlist row. Whole-row draggable with a distance
// activation constraint so a plain click still selects (pick) and only a >6px drag
// starts a reorder. Lifted-row polish (opacity/shadow/scale) via isDragging.
function SortableWlRow({ sym, className, style, onClick, onMouseEnter, children }: {
  sym: string;
  className: string;
  style: React.CSSProperties;
  onClick: () => void;
  onMouseEnter: () => void;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: sym });
  return (
    <div
      ref={setNodeRef}
      // dnd-kit derives aria-describedby from a module counter that differs
      // between SSR and client — a benign, dev-only hydration mismatch.
      suppressHydrationWarning
      className={className}
      style={{
        ...style,
        transform: DndCSS.Transform.toString(transform),
        transition: transition ?? undefined,
        cursor: "grab",
        ...(isDragging
          ? { opacity: 0.96, zIndex: 30, position: "relative", background: "var(--panel-2)", boxShadow: "0 10px 28px rgba(0,0,0,.5)", cursor: "grabbing" }
          : {}),
      }}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      {...attributes}
      tabIndex={-1}
      {...listeners}
    >
      {children}
    </div>
  );
}
const CHART_TYPES = [["candles", "Candles"], ["heikin", "Heikin Ashi"], ["bars", "Bars"], ["line", "Line"], ["area", "Area"]];
const TF_GROUPS: [string, string[]][] = [["Minutes", ["1m", "5m", "15m", "30m"]], ["Hours", ["1h", "2h", "4h"]], ["Days", ["D", "2D", "3D"]], ["Weeks", ["W", "2W"]], ["Months", ["1M", "3M"]]];
// Daily-derived TFs are always functional. Intraday TFs (R12) go live for intraday-capable markets
// (us/crypto/cn/hk); .TO (ca) stays daily-only — its picker entries render disabled.
const DAILY_FUNCTIONAL = new Set(["D", "2D", "3D", "W", "2W", "1M", "3M"]);
const INTRADAY_FUNCTIONAL = ["1m", "5m", "15m", "30m", "1h", "2h", "4h"];
// Canonical chronological order for all TFs — used to sort the top-bar favourites list.
const TF_CANONICAL_ORDER = ["1m", "5m", "15m", "30m", "1h", "2h", "4h", "D", "2D", "3D", "W", "2W", "1M", "3M"];
const tfSortKey = (tf: string) => { const i = TF_CANONICAL_ORDER.indexOf(tf); return i < 0 ? 999 : i; };
function functionalSet(sym: string): Set<string> {
  const s = new Set(DAILY_FUNCTIONAL);
  if (intradayCapable(classify(sym))) for (const t of INTRADAY_FUNCTIONAL) s.add(t);
  return s;
}
// valid ?pane= deep-link targets (the MegaPane pages; "analyst" is an alias for forecast).
// "mastermind" was retired — its research read now lives in the OracleDash Research-Desk surface.
const VALID_PANES = new Set(["overview", "statements", "statistics", "dividends", "earnings", "revenue", "forecast", "analyst", "technicals", "seasonals", "insider", "lab"]);
const normalizePane = (pane: string): FinPage => (pane === "analyst" ? "forecast" : pane) as FinPage;
const load = (k: string, d: any) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };

// Guest drawings tier: login is disabled site-wide, so /api/drawings is a no-op for
// everyone and chart drawings were destroyed on symbol switch / reload. Persist them
// per-symbol in localStorage for guests instead.
const GUEST_DRAW_KEY = "mm.draw";
const readGuestDraw = (sym: string): Drawing[] => { try { const m = JSON.parse(localStorage.getItem(GUEST_DRAW_KEY) || "{}"); return Array.isArray(m[sym]) ? m[sym] : []; } catch { return []; } };
const writeGuestDraw = (sym: string, d: Drawing[]) => { try { const m = JSON.parse(localStorage.getItem(GUEST_DRAW_KEY) || "{}"); if (d && d.length) m[sym] = d; else delete m[sym]; localStorage.setItem(GUEST_DRAW_KEY, JSON.stringify(m)); } catch {} };

// drawing tools that accept a pre-draw color/width/dash style — still referenced by ChartPane/ChartPanel
// for the styleable-tool check; DrawingSidebar owns its own definition of this set now.
// kept for parity reference; not rendered in this component.
const DETECTORS: [string, string][] = [
  ["trendlines", "Auto trendlines"], ["fib", "Auto Fibonacci"], ["sr", "S/R strength heatmap"], ["mtfa", "Multi-timeframe S/R"], ["clear", "Clear detected"],
];
// translation key maps for the (otherwise hard-coded) toolbar/tool labels
const CT_TKEY: Record<string, string> = { candles: "ctCandles", heikin: "ctHeikin", bars: "ctBars", line: "ctLine", area: "ctArea" };
const TFG_TKEY: Record<string, string> = { Minutes: "tfMinutes", Hours: "tfHours", Days: "tfDays", Weeks: "tfWeeks", Months: "tfMonths" };
const DET_TKEY: Record<string, string> = { trendlines: "autoTrendlines", fib: "autoFib", sr: "srHeatmap", mtfa: "mtfSR", clear: "clearDetected" };

// watchlist column widths (px). The symbol column + every visible data column is user-resizable.
const DEFAULT_COLW: Record<string, number> = { sym: 132, last: 82, change: 84, changePct: 76, volume: 80, ext: 72 };
// item-26: ext = Extended Hours chg% vs close; dash when no ext print.
type WLSet = { tableView: boolean; cols: { last: boolean; changePct: boolean; change: boolean; volume: boolean; ext: boolean }; disp: string; logo: boolean; colW: Record<string, number> };
const DEFAULT_SET: WLSet = { tableView: true, cols: { last: true, changePct: true, change: false, volume: false, ext: true }, disp: "symbol", logo: true, colW: {} };

// ── Boot-trace helper (?boottrace=1) ────────────────────────────────────────
// Wraps performance.mark so profiling is zero-cost unless the flag is set.
// Each mark is also console.log'd with a wall-clock delta from the first mark
// so a DevTools recording isn't needed — just open the console.
// Kept in prod intentionally: useful for profiling mount/manifest/chart-paint spans.
const _btStart = typeof performance !== "undefined" ? performance.now() : 0;
function btMark(name: string) {
  if (typeof window === "undefined") return;
  if (!new URLSearchParams(window.location.search).has("boottrace")) return;
  const now = performance.now();
  try { performance.mark("bt:" + name); } catch {}
  // eslint-disable-next-line no-console
  console.log(`[boottrace] ${name} +${(now - _btStart).toFixed(1)}ms`);
}

export default function TerminalShell({ symbols, email, initialSymbol }: { symbols: { symbol: string; section: string }[]; email: string; initialSymbol?: string }) {
  const [man, setMan] = useState<Manifest | null>(null);
  // named watchlists — client-side + localStorage-backed so switching / creating lists works for guests
  // (no auth needed). The server-provided `symbols` seed becomes the "Default" list.
  const [lists, setLists] = useState<Record<string, { symbol: string; section: string }[]>>({ Default: symbols });
  const [activeList, setActiveList] = useState("Default");
  const [wlMenuOpen, setWlMenuOpen] = useState(false);
  const wl = lists[activeList] || [];
  const setWl = (updater: any) => setLists((l) => ({ ...l, [activeList]: typeof updater === "function" ? updater(l[activeList] || []) : updater }));
  // Drag-to-reorder sensors: 6px activation distance so clicks still select rows.
  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  // Reorder within a section only (Crypto rows stay with Crypto, etc). Order is the
  // wl array, which auto-persists to localStorage (mm.wls) via the existing effect.
  const onWlDragEnd = useCallback((e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setWl((prev: { symbol: string; section: string }[]) => {
      const from = prev.findIndex((x) => x.symbol === active.id);
      const to = prev.findIndex((x) => x.symbol === over.id);
      if (from < 0 || to < 0 || prev[from].section !== prev[to].section) return prev;
      return arrayMove(prev, from, to);
    });
  }, [activeList]);
  const seed0 = initialSymbol || symbols.find((s) => s.symbol === "NVDA")?.symbol || symbols[0]?.symbol || "NVDA";
  const [panes, setPanes] = useState<string[]>([seed0]);
  const [activePane, setActivePane] = useState(0);
  const [sync, setSync] = useState(true);
  const [split, setSplit] = useState(1);   // the split the user requested (panes.length may be smaller after dedup)
  const active = panes[activePane] ?? panes[0] ?? seed0;
  // Analytics: emit a ticker_view whenever the active chart symbol changes. The symbol is client
  // state (not a route), so the route tracker never sees it — fire a decoupled window event that
  // components/Tracker.tsx picks up. Fire-and-forget; never blocks the UI.
  useEffect(() => {
    if (!active) return;
    try { window.dispatchEvent(new CustomEvent("mm:track", { detail: { type: "ticker_view", ticker: active } })); } catch {}
  }, [active]);
  const [paneTfs, setPaneTfs] = useState<string[]>(["3D"]);   // one timeframe per pane — Terminal opens on 3D by default
  const tf = paneTfs[activePane] ?? paneTfs[0] ?? "D";        // the active pane's timeframe drives the toolbar
  const setTf = (t: string) => setPaneTfs((a) => { const n = [...a]; n[activePane] = t; return n; });
  // per-market functional TF set: daily-derived always; intraday TFs only for intraday-capable markets (R12)
  const FUNCTIONAL = useMemo(() => functionalSet(active), [active]);
  const [chartType, setChartType] = useState("candles");
  // Default-on indicators for new users: Moving Averages + Volume + MACD-RSI (TH_RSIMACD+) + Stochastic (CM_Stochastic_MTF).
  // item-28: Golden Oracle is OFF by default. A user's explicit saved indicator set (mm.inds)
  // is loaded below and left completely untouched.
  const [inds, setInds] = useState<Set<string>>(new Set(["ema", "vol", "macd", "stochrsi"]));
  const [hidden, setHidden] = useState<Set<string>>(new Set());                       // indicators the eye has hidden
  const [indParams, setIndParams] = useState<Record<string, any>>(allDefaults());      // per-indicator params (Settings dialog)
  const [settingsKey, setSettingsKey] = useState<string | null>(null);                 // indicator whose Settings dialog is open
  const [sourceKey, setSourceKey] = useState<string | null>(null);                     // indicator whose Source view is open
  // ── custom scripts (Pine): the user's saved scripts + which are ENABLED on the chart + param overrides ──
  const [scripts, setScripts] = useState<UserScript[]>([]);
  const [enabledIds, setEnabledIds] = useState<string[]>([]);                           // enabled script ids (persisted 'mm.pineOn')
  const [pineParams, setPineParamsState] = useState<Record<string, Record<string, any>>>({}); // per-script overrides ('mm.pineParams')
  const loggedIn = !!email;
  // id → script, in a ref so the legend callbacks (declared above the derivations) can look it up
  const scriptByIdRef = useRef<Record<string, UserScript>>({});
  const [favTF, setFavTF] = useState<string[]>(["D", "3D", "W", "1M"]);
  const [set, setSet] = useState<WLSet>(DEFAULT_SET);
  // ── F1 flags: symbol → color; persisted inside mm.wls additively (read below) ──
  const [flags, setFlags] = useState<Record<string, string>>({});
  const [lastFlagColor, setLastFlagColor] = useState<string>(FLAG_DEFAULT);
  // ── F3 add-symbol dialog mode (distinct from "go" search) ──
  const [addSymOpen, setAddSymOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false); const [seed, setSeed] = useState("");
  const [indOpen, setIndOpen] = useState(false);
  const [wlSetOpen, setWlSetOpen] = useState(false); const [tfOpen, setTfOpen] = useState(false); const [ctOpen, setCtOpen] = useState(false); const [snapOpen, setSnapOpen] = useState(false);
  const [replayOn, setReplayOn] = useState(false); const [replayIdx, setReplayIdx] = useState<number | null>(null); const [total, setTotal] = useState(0); const [playing, setPlaying] = useState(false); const [speed, setSpeed] = useState(1);
  const playRef = useRef<any>(null);
  // §7 state
  const [tool, setTool] = useState<string | null>(null);
  const [detectCmd, setDetectCmd] = useState<DetectCmd>(null);
  const [detectOpen, setDetectOpen] = useState(false);
  const [intel, setIntel] = useState<any>(null);
  const [layouts, setLayouts] = useState<any[]>([]); const [layoutOpen, setLayoutOpen] = useState(false); const [layoutName, setLayoutName] = useState("");
  const [livePx, setLivePx] = useState<number | null>(null);
  // symbol-keyed live top-of-book — ONE source for the header AND every watchlist row (via a single
  // batched /api/quote?syms= poll), so the detail pane and the watchlist can't disagree on a price.
  const [quotes, setQuotes] = useState<Record<string, any>>({});
  // item-26/27: symbol-keyed extended/overnight ext prints — polled from /api/ext-quote (separate
  // from the main quote poll so the Quote Hub lane surface stays clean). Each entry: { extPrice, extChg, extTs } | null.
  const [extQuotes, setExtQuotes] = useState<Record<string, { extPrice: number; extChg: number; extTs: number } | null>>({});
  const [slice, setSlice] = useState<any>(null);
  const [fund, setFund] = useState<Fund | null>(null);
  const [fundLoading, setFundLoading] = useState(true);   // true from symbol reset until getFund settles — MegaPane/ForecastPage skeleton gate
  const [opts, setOpts] = useState<any>(null);
  const [bars, setBars] = useState<Bar[]>([]);
  // MegaPane (in-shell fundamentals overlay) + OracleDash (Golden Oracle history) overlays
  const [paneOpen, setPaneOpen] = useState<FinPage | null>(null);
  const [signalsOpen, setSignalsOpen] = useState(false);
  const [magnet, setMagnet] = useState(false);
  // ── D1-D4: context-menu feature state ──────────────────────────────────────
  // D3: table view mode (replaces chart body)
  const [tableViewOpen, setTableViewOpen] = useState(false);
  // D4: object tree panel
  const [objectTreeOpen, setObjectTreeOpen] = useState(false);
  // D1: indicator value lookup by bar time — populated by the active ChartPane after each data load
  const [indRowsAt, setIndRowsAt] = useState<((barTime: string | number) => Record<string, number | null>) | null>(null);
  // B3: sub-pane count for mobile chart-body height formula (--subpanes CSS var)
  const [subPanes, setSubPanes] = useState(0);
  const onPaneCount = useCallback((n: number) => setSubPanes(n), []);
  // D2: chart templates — save-as modal
  const [tmplSaveOpen, setTmplSaveOpen] = useState(false);
  const [tmplSaveName, setTmplSaveName] = useState("");
  const [tmplSaveErr, setTmplSaveErr] = useState<string | null>(null);
  const [templates, setTemplates] = useState<import("@/lib/chartTemplates").ChartTemplate[]>([]);
  // D2: locked vertical line (bar time string | null); persists with the workspace save
  const [lockedVLine, setLockedVLine] = useState<string | null>(null);
  // D1: "remove all indicators" undo toast
  const [undoInds, setUndoInds] = useState<{ snapshot: Set<string>; timer: any } | null>(null);
  // ── Day Trade Mode (D lane §5) ────────────────────────────────────────────────
  const [dtm, setDtm] = useState(false);
  // Snapshot of pre-mode workspace fields restored on OFF
  type DtmSnapshot = { inds: string[]; indParams: Record<string, any>; tf: string; favTF: string[]; chartType: string; extHours: boolean };
  const dtmSnapshotRef = useRef<DtmSnapshot | null>(null);
  // set when the load effect restores mm.dtm=true, so the ?dtm=1 deep-link effect never races a
  // second toggleDtm (which would snapshot the already-in-mode workspace and break restore)
  const dtmBootRef = useRef(false);
  // set only by explicit user action (button/hotkey) inside toggleDtm — gates the on/off toast so
  // load-restores never fire a spurious toast (the persist effect burns dtmMounted before the toast
  // effect runs on mount, so a shared mount-guard cannot work here)
  const dtmUserRef = useRef(false);
  // Brief mode-change toast
  const [dtmToast, setDtmToast] = useState<string | null>(null);
  const dtmToastTimer = useRef<any>(null);

  // ── Free-tier gate ──────────────────────────────────────────────────────────
  // Anonymous visitors get MAX_ANON_IND active indicators and no watchlist; a
  // free account unlocks unlimited indicators + the watchlist. One toast nudge
  // with a Sign-up CTA (same /login idiom as onAuthRequired below).
  const MAX_ANON_IND = 3;
  const [gateNudge, setGateNudge] = useState<string | null>(null);
  const gateNudgeTimer = useRef<any>(null);
  const showGateNudge = useCallback((msg: string) => {
    setGateNudge(msg);
    clearTimeout(gateNudgeTimer.current);
    gateNudgeTimer.current = setTimeout(() => setGateNudge(null), 5000);
  }, []);
  // Enforce the indicator cap in ONE place: every mutation path (default set,
  // localStorage restore, templates, DTM presets, layouts, commands, undo) flows
  // through `inds`, so clamp here instead of guarding ~10 setInds call sites.
  // Silent — the manual add path (toggleInd) shows the nudge; bulk/load just cap.
  useEffect(() => {
    if (loggedIn || inds.size <= MAX_ANON_IND) return;
    setInds((s) => new Set([...s].slice(0, MAX_ANON_IND)));
  }, [inds, loggedIn]);
  // pre-draw style chosen BEFORE drawing (color/width/dash) — applied to each new line/arrow/box/HV drawing
  const [drawStyle, setDrawStyle] = useState<{ color: string; width: number; dash: "solid" | "dashed" | "dotted" }>({ color: "#4d82ff", width: 1.5, dash: "solid" });
  const [compare, setCompare] = useState<string[]>([]);
  const [compareCfg, setCompareCfg] = useState<Record<string, CmpCfg>>({});
  const [searchMode, setSearchMode] = useState<"go" | "compare">("go");
  const nonce = useRef(0);
  const wsMounted = useRef(false);
  const t = useT();
  const { lang } = useLang();
  const isMobile = useIsMobile();
  const navPath = usePathname();
  // ── urlSearch: window.location.search alternative to useSearchParams() ──────
  // TerminalShell is always dynamically-rendered (server-side, on demand) so the
  // implicit-Suspense prerender path that useSearchParams() triggers on static
  // routes (screener/alerts/flow) never applies here — AppNav already handles
  // that case with its own <Suspense> wrapper.  Using window.location.search
  // directly is simpler for this component: all reads happen inside useEffects
  // (client-side only) or in one JSX expression for the mobile nav active-key,
  // so there is no SSR mismatch.  popstate keeps it reactive for back/forward
  // navigations; same-route pushState/replaceState navigations that change
  // ?pane= or ?addScript= are handled by the mm:open-pane custom-event and the
  // cross-route remount respectively, so no popstate gap exists for current callers.
  // NOTE: future same-route router.push() that changes these params without a
  // matching custom event will NOT re-trigger this state; see nit in pass6-stall.
  const [urlSearch, setUrlSearch] = useState<string>("");
  useEffect(() => {
    btMark("shell-mount");  // first useEffect: React has committed the component
    // initialise on mount (no window on server); stay in sync via popstate
    setUrlSearch(window.location.search);
    const h = () => setUrlSearch(window.location.search);
    window.addEventListener("popstate", h);
    return () => window.removeEventListener("popstate", h);
  }, []);
  // mobile + fullscreen + expanded-analysis state
  const [fullChart, setFullChart] = useState(false);
  // SSR-consistent default; the persisted width is read after mount (below) so the server- and
  // client-rendered `--rail-w` style always agree on the first paint (no hydration mismatch).
  const [railW, setRailW] = useState<number>(360);
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
  const flushDrawings = useCallback((sym: string) => { clearTimeout(drawTimers.current[sym]); const d = drawPending.current[sym]; if (d) { delete drawPending.current[sym]; if (loggedIn) { fetch("/api/drawings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbol: sym, drawings: d }) }).catch(() => {}); } else { writeGuestDraw(sym, d); } } }, [loggedIn]);
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

  // manifest via dataCache (dedup + SWR) + mounted guard — mirrors ScreenerView (batch 1).
  // After the manifest loads, also warm the coverage index so uncovered symbols
  // never fire a network request for intel/fund/opts files.
  useEffect(() => { let alive = true; btMark("manifest-fetch-start"); getJSON("/data/manifest.json").then((m) => { if (alive && m) { btMark("manifest-fetch-done"); setMan(m); loadCoverage(Object.keys(m.symbols || {})); } }).catch(() => {}); return () => { alive = false; }; }, []);
  useEffect(() => {
    { const si = load("mm.inds", ["ema", "vol", "macd", "stochrsi"]) as string[]; setInds(new Set(si)); } setChartType(load("mm.ct", "candles")); setHidden(new Set(load("mm.indHidden", []))); { const savedP = load("mm.indParams", {}); const base = allDefaults(); for (const k of IND_ORDER) base[k] = withDefaults(k, savedP[k]); setIndParams(base); } setPaneTfs(["3D"]); setFavTF(load("mm.favtf", ["D", "3D", "W", "1M"])); { const sv = load("mm.set", {}); setSet({ ...DEFAULT_SET, ...sv, cols: { ...DEFAULT_SET.cols, ...(sv.cols || {}) }, colW: { ...(sv.colW || {}) } }); } setCompareCfg(load("mm.cmpCfg", {}));
    { const savedW = Number(localStorage.getItem("mm.railW")); if (Number.isFinite(savedW) && savedW) setRailW(Math.min(520, Math.max(300, savedW))); }
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
            if (typeof ws.lockedVLine === "string" || ws.lockedVLine === null) setLockedVLine(ws.lockedVLine);
          }
        }
      } catch {}
    }
    // Re-apply Day Trade Mode after workspace restore (§5 — apply mode on load regardless of deep-link).
    // Only the FLAG is flipped: the persisted workspace (mm.inds/mm.tf/…) already carries the in-mode
    // state, so re-applying the preset would be redundant. What MUST be rehydrated is the pre-mode
    // snapshot — otherwise a toggle-off after reload finds dtmSnapshotRef null and can never restore
    // the swing workspace (review blocker). dtmBootRef stops the ?dtm=1 effect from double-toggling.
    if (load("mm.dtm", false)) {
      dtmBootRef.current = true;
      const snap = load("mm.dtmSnapshot", null);
      if (snap && typeof snap === "object" && Array.isArray(snap.inds)) dtmSnapshotRef.current = snap as DtmSnapshot;
      // ?sym= deep-link sessions skip the workspace restore above, so the persisted in-mode tf never
      // loads — land such sessions on the mode's 5m instead of the daily default (mode is ON here).
      if (initialSymbol) setTimeout(() => setTf("5m"), 0);
      setTimeout(() => setDtm(true), 0);
    }
  }, []);
  // persist the workspace — but skip the mount-time write (no user intent) and never write during a
  // deep-link (?sym=) session, so following a Screener/Portfolio row can't clobber the saved layout.
  useEffect(() => {
    if (!wsMounted.current) { wsMounted.current = true; return; }
    if (!initialSymbol) localStorage.setItem("mm.ws", JSON.stringify({ panes, paneTfs, split, sync, activePane, lockedVLine }));
  }, [panes, paneTfs, split, sync, activePane, lockedVLine]);
  useEffect(() => { localStorage.setItem("mm.inds", JSON.stringify([...inds])); }, [inds]);
  // skip the mount-pass write (state is still the pre-load default) — otherwise a reload/discard
  // landing inside the mount→load window can permanently clobber the saved value with the default
  const hidMounted = useRef(false); const ipMounted = useRef(false); const cmpCfgMounted = useRef(false);
  const favTFMounted = useRef(false); const setMounted = useRef(false); const dtmMounted = useRef(false);
  useEffect(() => { if (!hidMounted.current) { hidMounted.current = true; return; } localStorage.setItem("mm.indHidden", JSON.stringify([...hidden])); }, [hidden]);
  useEffect(() => { if (!ipMounted.current) { ipMounted.current = true; return; } localStorage.setItem("mm.indParams", JSON.stringify(indParams)); }, [indParams]);
  useEffect(() => { if (!cmpCfgMounted.current) { cmpCfgMounted.current = true; return; } localStorage.setItem("mm.cmpCfg", JSON.stringify(compareCfg)); }, [compareCfg]);
  useEffect(() => { localStorage.setItem("mm.ct", JSON.stringify(chartType)); }, [chartType]);
  useEffect(() => { localStorage.setItem("mm.tf", JSON.stringify(tf)); }, [tf]);
  // mount-skip guard: the initial render has the default ["D","3D","W","1M"] loaded before the
  // useEffect at line ~213 runs setFavTF(load(...)). Without the guard, the first render fires
  // this effect with the default and clobbers the saved value before the load effect runs.
  useEffect(() => { if (!favTFMounted.current) { favTFMounted.current = true; return; } localStorage.setItem("mm.favtf", JSON.stringify(favTF)); }, [favTF]);
  useEffect(() => { if (!setMounted.current) { setMounted.current = true; return; } localStorage.setItem("mm.set", JSON.stringify(set)); }, [set]);
  useEffect(() => { if (!dtmMounted.current) { dtmMounted.current = true; return; } localStorage.setItem("mm.dtm", JSON.stringify(dtm)); }, [dtm]);
  // restore saved named watchlists (falls back to the server-seeded Default list)
  useEffect(() => {
    const saved = load("mm.wls", null);
    if (saved && saved.lists && typeof saved.lists === "object" && Object.keys(saved.lists).length) {
      // TRAP 1 (mount side): when signed in, RECONCILE the local Default against the server's
      // Default membership — do NOT wholesale-replace it. The server row only carries add/remove
      // (it knows MEMBERSHIP, not ORDER), and the /api/watchlist adds are fire-and-forget (they can
      // fail silently). A wholesale clobber would therefore destroy the user's local reorder AND
      // drop any local-only row whose add never reached the server. So we merge, preserving local
      // order and keeping local-only rows as user data:
      //   1. start from the local saved Default order;
      //   2. keep local rows that also exist on the server (local order + local section preserved);
      //   3. KEEP local-only rows too (offline/failed adds are user data — never dropped) and HEAL
      //      each by firing the idempotent POST {action:"add"} (fire-and-forget, matching the sync
      //      idiom at addSymbol/addToList) so the server catches up;
      //   4. APPEND server rows missing locally (adds from other devices) at the end, with their
      //      server section.
      let restored: Record<string, { symbol: string; section: string }[]>;
      if (loggedIn) {
        const localDefault: { symbol: string; section: string }[] = Array.isArray(saved.lists.Default) ? saved.lists.Default : [];
        const serverSyms = new Set(symbols.map((s) => s.symbol));
        const localSyms = new Set(localDefault.map((r) => r.symbol));
        // 2+3: keep every local row (present-on-server or local-only), local order + section intact.
        const reconciledDefault = [...localDefault];
        // heal local-only rows: fire the idempotent add so the server converges (fire-and-forget).
        for (const r of localDefault) {
          if (!serverSyms.has(r.symbol)) {
            fetch("/api/watchlist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "add", symbol: r.symbol, section: r.section }) }).catch(() => {});
          }
        }
        // 4: append server rows missing locally (other-device adds), with their server section.
        for (const s of symbols) {
          if (!localSyms.has(s.symbol)) reconciledDefault.push(s);
        }
        restored = { ...saved.lists, Default: reconciledDefault };
      } else {
        restored = saved.lists;
      }
      setLists(restored);
      setActiveList(saved.active && restored[saved.active] ? saved.active : (loggedIn ? "Default" : Object.keys(restored)[0]));
    }
    // F1 flags: stored alongside wls (additive — old saves without flags load fine)
    const savedFlags = load("mm.flags", {});
    if (savedFlags && typeof savedFlags === "object") setFlags(savedFlags);
    const savedLastColor = load("mm.lastFlagColor", FLAG_DEFAULT);
    if (typeof savedLastColor === "string") setLastFlagColor(savedLastColor);
    // Mount-only restore: loggedIn/symbols are read for the signed-in Default override but must NOT
    // re-trigger this (re-reading localStorage mid-session would clobber live edits; the guest→signin
    // transition is handled by the prevEmailRef effect below).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { if (Object.keys(lists).length) localStorage.setItem("mm.wls", JSON.stringify({ lists, active: activeList })); }, [lists, activeList]);
  // ── TRAP 1: guest → signed-in reconciliation (AuthSheet router.refresh delivers a real `email`
  //    + the server's Default symbols, but client `lists` was seeded from the guest state in the
  //    useState initializer and never re-seeds on its own; stale mm.wls also shadows the server list).
  //    Reconciliation: the SERVER wins for "Default" (overwrite with the fresh `symbols` prop);
  //    any extra lists the guest built are KEPT as local lists so nothing they made vanishes. Runs
  //    only on the "" → non-empty email edge, and only once (prevEmailRef guards re-refreshes). ──
  const prevEmailRef = useRef(email);
  useEffect(() => {
    const was = prevEmailRef.current;
    prevEmailRef.current = email;
    if (was === "" && email !== "") {
      setLists((l) => ({ ...l, Default: symbols }));   // server Default authoritative; guest extras preserved
      setActiveList("Default");
    }
  }, [email, symbols]);
  // persist flags separately (not inside mm.wls to avoid shape-breaking old saves)
  const flagsMounted = useRef(false);
  useEffect(() => { if (!flagsMounted.current) { flagsMounted.current = true; return; } localStorage.setItem("mm.flags", JSON.stringify(flags)); }, [flags]);
  // paneSync mirrors same-timeframe peers only — disable it entirely when the panes carry mixed timeframes
  // (the Sync button is rendered disabled in that case), so a stale sync=true can't silently half-work.
  useEffect(() => { setPaneSync(sync && panes.length > 1 && new Set(paneTfs.slice(0, panes.length)).size <= 1); }, [sync, panes.length, paneTfs]);
  // load drawings once per symbol that appears in a pane; don't clobber an in-flight local edit
  useEffect(() => {
    const now = new Set(panes);
    for (const sym of now) {
      if (drawLoaded.current.has(sym)) continue;
      drawLoaded.current.add(sym);
      if (loggedIn) {
        fetch(`/api/drawings?symbol=${sym}`).then((r) => r.json()).then((d) => {
          if (drawPending.current[sym] === undefined) setDrawStore((s) => (s[sym] !== undefined ? s : { ...s, [sym]: d.drawings || [] }));
        }).catch(() => { drawLoaded.current.delete(sym); });
      } else {
        const gd = readGuestDraw(sym);
        if (drawPending.current[sym] === undefined) setDrawStore((s) => (s[sym] !== undefined ? s : { ...s, [sym]: gd }));
      }
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
  }, [panes, flushDrawings, loggedIn]);
  useEffect(() => () => { for (const sym of Object.keys(drawPending.current)) flushDrawings(sym); }, [flushDrawings]);

  // per-symbol data for the rail.  Priority split:
  //   IMMEDIATE  — ohlc + slice share the chart's inflight fetch (dataCache dedup); getBars re-uses
  //                getOhlc so the chart's Effect 2 and the rail never issue two requests.
  //   DEFERRED   — intel / fund / opts are below-the-fold (only needed when rail cards or MegaPane
  //                are visible).  They are deferred via requestIdleCallback (rIC) / setTimeout so
  //                they never compete with the chart fetch in the network queue on first load.
  //                On symbol switch after first paint these fire immediately (rIC resolves quickly
  //                when the page is idle) — the user-visible delay is the same as before.
  useEffect(() => {
    let alive = true;
    setIntel(null); setLivePx(null); setSlice(null); setFund(null); setOpts(null); setBars([]); setFundLoading(true);
    // immediate: chart-shared OHLC and 6KB slice (signal verdict for the rail badge)
    getJSON(`/data/${active}.slice.json`).then((d) => { if (alive) setSlice(d); });
    getBars(active).then((b) => { if (alive) setBars(b); }).catch(() => {});
    // deferred: intel (~30-80KB), fund (~100-200KB), opts (~50-100KB) — not visible until user opens
    // the rail cards or MegaPane; deferring avoids competing with the chart's OHLC fetch on cold load.
    const useNativeRic = typeof requestIdleCallback !== "undefined";
    let cancelDeferred: () => void;
    if (useNativeRic) {
      const id = requestIdleCallback(() => {
        if (!alive) return;
        getJSON(`/data/${active}.intel.json`).then((d) => { if (alive) setIntel(d); });
        getFund(active).then((d) => { if (alive) setFund(d); }).catch(() => {}).finally(() => { if (alive) setFundLoading(false); });
        getOpts(active).then((d) => { if (alive) setOpts(d); }).catch(() => {});
      }, { timeout: 2000 });
      cancelDeferred = () => cancelIdleCallback(id);
    } else {
      const id = setTimeout(() => {
        if (!alive) return;
        getJSON(`/data/${active}.intel.json`).then((d) => { if (alive) setIntel(d); });
        getFund(active).then((d) => { if (alive) setFund(d); }).catch(() => {}).finally(() => { if (alive) setFundLoading(false); });
        getOpts(active).then((d) => { if (alive) setOpts(d); }).catch(() => {});
      }, 0);
      cancelDeferred = () => clearTimeout(id);
    }
    return () => {
      alive = false;
      cancelDeferred();
    };
  }, [active]);

  // ONE batched live-quote poll for the active symbol + every watchlist row. Symbol-keyed results
  // merge into `quotes`, so switching tickers never bleeds a stale quote and the header + watchlist
  // read the same numbers. A null entry (hub/Tencent down for that symbol) ages the key out after 3
  // consecutive misses (see quoteMissRef) so its badge reverts to grey and its row falls back to
  // manifest EOD — the old fallback invariant, minus the flap on a single slow upstream response.
  // F2: composite expressions expand their legs into the poll batch so compositeQuote() can sum them.
  const quoteSyms = useMemo(() => {
    const all: string[] = [];
    const activeLegs = parseComposite(active);
    if (activeLegs) all.push(...activeLegs); else all.push(active);
    for (const { symbol } of wl) {
      const legs = parseComposite(symbol);
      if (legs) all.push(...legs); else all.push(symbol);
    }
    // Movers bar shows the first 16 manifest symbols — include them in the batch so
    // mergeLive() can apply live quotes and the strip matches the watchlist numbers.
    // Bounded to 16 singles: negligible batch size impact.
    const moversSyms = Object.keys(man?.symbols || {}).slice(0, 16);
    all.push(...moversSyms);
    return Array.from(new Set(all)).filter(Boolean);
  }, [active, wl, man]);
  const quoteSymsKey = quoteSyms.join(",");
  // The polled symbol set lives in a ref so a rapid watchlist edit doesn't tear down + immediately
  // re-fire the interval (which bursts /api/quote). The interval is mounted ONCE and reads the ref;
  // key changes only schedule a single debounced fresh poll so back-to-back edits coalesce.
  const quoteSymsKeyRef = useRef(quoteSymsKey);
  quoteSymsKeyRef.current = quoteSymsKey;
  const quoteAliveRef = useRef(true);
  // Consecutive null polls per symbol. A null only evicts a previously-good quote after 3 misses
  // in a row (~18s at the 6s cadence): one aborted upstream chunk nulls every CN/HK symbol at
  // once, and hard-deleting on the first null flipped the whole board (header + watchlist +
  // pane cards) to Historical until the next good poll. Counted outside the setQuotes updater so
  // StrictMode double-invocation can't double-count.
  const quoteMissRef = useRef<Record<string, number>>({});
  const pollQuotes = useCallback(() => {
    if (typeof document !== "undefined" && document.hidden) return; // (b) don't poll a backgrounded tab
    const key = quoteSymsKeyRef.current;
    if (!key) return;
    fetch(`/api/quote?syms=${encodeURIComponent(key)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!quoteAliveRef.current || !d || !d.quotes) return;
        const misses = quoteMissRef.current;
        const drop = new Set<string>();
        for (const k of Object.keys(d.quotes)) {
          if (d.quotes[k]) delete misses[k];
          else if ((misses[k] = (misses[k] ?? 0) + 1) >= 3) { drop.add(k); delete misses[k]; }
        }
        setQuotes((prev) => {
          // (a) Unchanged-value suppression: only touch symbols whose quote actually changed,
          // reusing the prior object reference otherwise. If nothing changed, return `prev`
          // unchanged so React bails out and the whole pane grid / watchlist skips re-render.
          let changed = false;
          const n: Record<string, any> = { ...prev };
          for (const k of Object.keys(d.quotes)) {
            const q = d.quotes[k];
            if (q) { if (!quoteEq(prev[k], q)) { n[k] = q; changed = true; } }
            else if (drop.has(k) && k in n) { delete n[k]; changed = true; }
          }
          return changed ? n : prev;
        });
      })
      .catch(() => {});
  }, []);
  // stable 6s interval, mounted once. Pauses while the tab is hidden and fires an immediate
  // catch-up poll on re-show so a returning user sees fresh prices without waiting a full cycle.
  useEffect(() => {
    quoteAliveRef.current = true;
    const id = setInterval(pollQuotes, 6000);
    const onVis = () => { if (!document.hidden) pollQuotes(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { quoteAliveRef.current = false; clearInterval(id); document.removeEventListener("visibilitychange", onVis); };
  }, [pollQuotes]);
  // debounced fresh poll whenever the symbol set changes (rapid edits collapse to one fetch);
  // also prune miss counters for symbols that left the set so a re-added one starts at zero
  useEffect(() => {
    if (!quoteSymsKey) return;
    const cur = new Set(quoteSymsKey.split(","));
    for (const k of Object.keys(quoteMissRef.current)) if (!cur.has(k)) delete quoteMissRef.current[k];
    const id = setTimeout(pollQuotes, 250);
    return () => clearTimeout(id);
  }, [quoteSymsKey, pollQuotes]);

  // item-26/27: extended/overnight poll — US equities only. Always includes the active symbol
  // (pane-card secondary block, item-25) plus all watchlist US singles when the Ext column is on.
  // Runs at 30 s cadence (ext prints move slowly). Separate from main quote poll so the hub
  // lane surface (/api/quote route) stays untouched.
  const extSymsKey = useMemo(() => {
    const syms: string[] = [];
    // Always poll the active symbol for the pane-card secondary block (item-25)
    if (!isComposite(active) && classify(active) === "us") syms.push(active);
    // Add watchlist US singles when Ext column is enabled (item-26)
    if (set.cols.ext) {
      for (const { symbol } of wl) {
        if (!isComposite(symbol) && classify(symbol) === "us") syms.push(symbol);
      }
    }
    return syms.filter((v, i, a) => a.indexOf(v) === i).join(",");
  }, [wl, active, set.cols.ext]);
  const extSymsKeyRef = useRef(extSymsKey);
  extSymsKeyRef.current = extSymsKey;
  const extAliveRef = useRef(true);
  const pollExtQuotes = useCallback(() => {
    if (typeof document !== "undefined" && document.hidden) return; // don't poll a backgrounded tab
    const key = extSymsKeyRef.current;
    if (!key) return;
    fetch(`/api/ext-quote?syms=${encodeURIComponent(key)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!extAliveRef.current || !d?.quotes) return;
        setExtQuotes((prev) => {
          // reuse prior reference when every incoming ext quote is byte-identical
          let changed = false;
          const n: Record<string, any> = { ...prev };
          for (const k of Object.keys(d.quotes)) { if (!quoteEq(prev[k], d.quotes[k])) { n[k] = d.quotes[k]; changed = true; } }
          return changed ? n : prev;
        });
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    extAliveRef.current = true;
    const id = setInterval(pollExtQuotes, 30_000);
    const onVis = () => { if (!document.hidden) pollExtQuotes(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { extAliveRef.current = false; clearInterval(id); document.removeEventListener("visibilitychange", onVis); };
  }, [pollExtQuotes]);
  useEffect(() => {
    if (!extSymsKey) return;
    const id = setTimeout(pollExtQuotes, 500);
    return () => clearTimeout(id);
  }, [extSymsKey, pollExtQuotes]);

  useEffect(() => { fetch("/api/layouts").then((r) => r.json()).then((d) => setLayouts(d.layouts || [])).catch(() => {}); }, []);
  useEffect(() => {
    // Open the Brain widget. The script is deferred + cross-origin, so on early ?ai=1 deep-links
    // window.MMBrain may not exist yet — retry once after 800ms before giving up.
    const openBrain = () => {
      const b = (window as any).MMBrain;
      if (b?.open) { b.open(); return; }
      window.setTimeout(() => (window as any).MMBrain?.open?.(), 800);
    };
    window.addEventListener("mm:copilot", openBrain);
    try { if (new URLSearchParams(window.location.search).get("ai") === "1") openBrain(); } catch {}
    return () => window.removeEventListener("mm:copilot", openBrain);
  }, []);
  // shallow deep-link: ?pane=<page> opens the MegaPane on that page (MegaPane keeps the URL in sync
  // and strips ?pane= on close). Reactive so clicking ?pane= links while already on /terminal works.
  // Only OPEN when a valid pane is present — do NOT force-close when absent (MegaPane owns its close).
  useEffect(() => { const p = new URLSearchParams(urlSearch).get("pane"); if (p && VALID_PANES.has(p)) setPaneOpen(normalizePane(p)); }, [urlSearch]);
  // Direct open event — AppNav dispatches this on every click, so re-opening the SAME pane after a close
  // works even though MegaPane's replaceState strip is invisible to Next's router (searchParams stays stale).
  useEffect(() => { const h = (e: Event) => { const p = (e as CustomEvent).detail as string; if (p && VALID_PANES.has(p)) setPaneOpen(normalizePane(p)); }; window.addEventListener("mm:open-pane", h); return () => window.removeEventListener("mm:open-pane", h); }, []);
  // Direct close event — the left-rail "Chart" button dispatches this so it dismisses the research
  // MegaPane (routing to /terminal alone can't: effect above only OPENs on a valid ?pane=, and the
  // deep-link effect deliberately never force-closes). Mirrors MegaPane's own onClose.
  useEffect(() => { const h = () => setPaneOpen(null); window.addEventListener("mm:close-pane", h); return () => window.removeEventListener("mm:close-pane", h); }, []);
  // ChartPanel's intraday empty-state overlay dispatches mm:set-tf {tf} ("Back to Daily" → "D"). Mirror
  // the open-pane pattern: switch the ACTIVE pane's timeframe, guarded on its functional TF set.
  useEffect(() => { const h = (e: Event) => { const nt = (e as CustomEvent).detail?.tf as string | undefined; if (nt && FUNCTIONAL.has(nt)) setTf(nt); }; window.addEventListener("mm:set-tf", h); return () => window.removeEventListener("mm:set-tf", h); }, [FUNCTIONAL, activePane]);
  // ChartPanel's keyboard layer owns Alt+T/H/V/R/X/M + double-Esc but cannot set the shell-owned
  // tool state directly — it dispatches mm:set-tool {detail: toolId|null}; ids match DrawingSidebar.
  useEffect(() => {
    const TOOL_IDS = new Set(["trendline", "hline", "vline", "rect", "text", "measure", "arrow", "ray", "fib"]);
    const h = (e: Event) => { const id = (e as CustomEvent).detail as string | null; if (id === null || TOOL_IDS.has(id)) setTool(id); };
    window.addEventListener("mm:set-tool", h);
    return () => window.removeEventListener("mm:set-tool", h);
  }, []);
  // Broadcast the overlay's open/close so AppNav's left-rail "Analyst" highlight tracks the REAL pane
  // state (page name on open, null on close). The URL ?pane= is stripped via replaceState on close and
  // is invisible to Next's useSearchParams, so a URL-derived highlight would stay lit after closing.
  useEffect(() => { window.dispatchEvent(new CustomEvent("mm:pane-state", { detail: paneOpen })); }, [paneOpen]);

  // ── D1-D4 event handlers (wired from context menu custom events) ─────────────
  // Load chart templates on mount
  useEffect(() => { try { setTemplates(listTemplates()); } catch {} }, []);

  // Remove-all-indicators event (from D1 context menu)
  useEffect(() => {
    const h = (e: Event) => {
      const cnt = (e as CustomEvent).detail?.count as number;
      // snapshot current inds for undo
      setUndoInds((prev) => { if (prev?.timer) clearTimeout(prev.timer); const snap = new Set(inds); const timer = setTimeout(() => setUndoInds(null), 5000); return { snapshot: snap, timer }; });
      setInds(new Set());
    };
    window.addEventListener("mm:remove-all-inds", h);
    return () => window.removeEventListener("mm:remove-all-inds", h);
  }, [inds]);

  // Apply template event (from D2 context menu)
  useEffect(() => {
    const h = (e: Event) => {
      const id = (e as CustomEvent).detail?.id as string;
      const tmpl = templates.find((t) => t.id === id);
      if (!tmpl) return;
      setInds(new Set(tmpl.indicators));
      const base = allDefaults();
      for (const k of IND_ORDER) { if (tmpl.indParams[k]) base[k] = withDefaults(k, tmpl.indParams[k]); }
      setIndParams(base);
    };
    window.addEventListener("mm:apply-template", h);
    return () => window.removeEventListener("mm:apply-template", h);
  }, [templates]);

  // Save-template event (from D2 context menu)
  useEffect(() => {
    const h = () => { setTmplSaveName(""); setTmplSaveErr(null); setTmplSaveOpen(true); };
    window.addEventListener("mm:save-template", h);
    return () => window.removeEventListener("mm:save-template", h);
  }, []);

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
  // one-click multi-timeframe: the active symbol across D / 3D / W / 1M (drawings are shared per-symbol).
  // Clicking again while already in the MTF layout collapses back to a single pane on the active symbol.
  const isMtf = panes.length === 4 && panes.every((s) => s === active) && paneTfs.slice(0, 4).join(",") === "D,3D,W,1M";
  // paneSync only mirrors same-timeframe peers, and the single replay slider assumes one bar count: with
  // heterogeneous per-pane timeframes both are incoherent, so we disable Sync + replay in that case.
  const mixedTfs = panes.length > 1 && new Set(paneTfs.slice(0, panes.length)).size > 1;
  function mtfLayout() {
    if (isMtf) { setSplit(1); setPanes([active]); setPaneTfs([tf]); setActivePane(0); return; }
    const sym = active; setSplit(4); setPanes([sym, sym, sym, sym]); setPaneTfs(["D", "3D", "W", "1M"]); setActivePane(0);
  }
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

  // Snapshot keyboard shortcuts (guarded: not when an input/textarea has focus)
  //   ⌥⌘S  → Download image
  //   ⇧⌘S  → Copy image
  //   ⌥S   → Copy link (share)
  useEffect(() => {
    const dispatch = (action: string) => window.dispatchEvent(new CustomEvent("mm:snapshot", { detail: { action } }));
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea") return;
      if (e.altKey && e.metaKey && !e.shiftKey && e.key.toLowerCase() === "s") { e.preventDefault(); dispatch("download"); }
      else if (!e.altKey && e.metaKey && e.shiftKey && e.key.toLowerCase() === "s") { e.preventDefault(); dispatch("copy"); }
      else if (e.altKey && !e.metaKey && !e.shiftKey && e.key.toLowerCase() === "s") { e.preventDefault(); dispatch("share"); }
    };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, []);


  useEffect(() => {
    clearInterval(playRef.current);
    if (replayOn && playing && total) {
      playRef.current = setInterval(() => setReplayIdx((i) => { const n = (i ?? 0) + 1; if (n >= total - 1) { setPlaying(false); return total - 1; } return n; }), 700 / speed);
    }
    return () => clearInterval(playRef.current);
  }, [replayOn, playing, total, speed]);

  const closeAll = () => { setWlSetOpen(false); setTfOpen(false); setCtOpen(false); setDetectOpen(false); setLayoutOpen(false); setWlMenuOpen(false); setSnapOpen(false); };
  useEffect(() => { const h = () => closeAll(); window.addEventListener("click", h); return () => window.removeEventListener("click", h); }, []);

  const sections = useMemo(() => { const o: Record<string, string[]> = {}; wl.forEach((s) => { (o[s.section] ||= []).push(s.symbol); }); return o; }, [wl]);
  const inWl = useMemo(() => new Set(wl.map((s) => s.symbol)), [wl]);
  const activeIsComposite = isComposite(active);
  const activeLegs = activeIsComposite ? (parseComposite(active) ?? []) : [];
  const m = activeIsComposite ? undefined : man?.symbols?.[active];
  const liveQuote = activeIsComposite ? null : (quotes[active] ?? null);   // header/badge quote
  // F2: summed quote for composite symbols (legs fetched via expanded quoteSyms batch).
  // EOD fallback: when live Polygon quotes are absent (weekends / no NEXT_PUBLIC_LIVE key),
  // reconstruct per-leg {last, prevClose} from the manifest's EOD row (last + chg fields).
  // prevClose is derived as last / (1 + chg/100) so the summed chg% is meaningful.
  const compositeQ = useMemo(() => {
    if (!activeIsComposite || !activeLegs.length) return null;
    const legQuotes: Record<string, { last?: number; prevClose?: number } | null> = {};
    for (const leg of activeLegs) {
      const live = quotes[leg] ?? null;
      if (live && live.last != null) {
        legQuotes[leg] = live;
      } else {
        // Fall back to manifest EOD row.
        const eod = man?.symbols?.[leg];
        if (eod && eod.last != null) {
          const chgFrac = (eod.chg ?? 0) / 100;
          const prevClose = chgFrac !== -1 ? eod.last / (1 + chgFrac) : eod.last;
          legQuotes[leg] = { last: eod.last, prevClose };
        } else {
          legQuotes[leg] = null;
        }
      }
    }
    return calcCompositeQuote(activeLegs, legQuotes);
  }, [activeIsComposite, activeLegs, quotes, man]);

  // ── per-pane row fallback for composite symbols (docket punch item 3) ──────
  // ChartPane renders a pane-hd with price+chg derived from `row` (manifest row).
  // For composite syms, man?.symbols?.[sym] is always undefined → shows "—".
  // This array provides a minimal { col, last, chg } row for every pane: manifest
  // for singles, summed EOD/live composite quote for composites.
  const paneRows = useMemo(() => {
    return panes.map((sym) => {
      if (!isComposite(sym)) return man?.symbols?.[sym] as { col?: string; last?: number; chg?: number } | undefined;
      const legs = parseComposite(sym) ?? [];
      if (!legs.length) return undefined;
      const legQuotes: Record<string, { last?: number; prevClose?: number } | null> = {};
      for (const leg of legs) {
        const live = quotes[leg] ?? null;
        if (live && live.last != null) {
          legQuotes[leg] = live;
        } else {
          const eod = man?.symbols?.[leg];
          if (eod && eod.last != null) {
            const chgFrac = (eod.chg ?? 0) / 100;
            const prevClose = chgFrac !== -1 ? eod.last / (1 + chgFrac) : eod.last;
            legQuotes[leg] = { last: eod.last, prevClose };
          } else {
            legQuotes[leg] = null;
          }
        }
      }
      const cq = calcCompositeQuote(legs, legQuotes);
      if (!cq) return undefined;
      return { col: "#2962ff", last: cq.last, chg: cq.chg };
    });
  }, [panes, man, quotes]);

  // client-side trend state (same input TrendRow reads) powers the stance ladder when the
  // engine's last event is history — see signalVerdict.computeStance
  const trendState = useMemo(() => (bars.length >= 200 ? computeTrendState(bars) : null), [bars]);
  const ov = oracleVerdict(m?.verdict ?? null, slice, lang === "zh", Date.now(), trendState);
  const dv = deskVerdict(intel, lang === "zh");
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
  // AH semantics: when the hub emits `close` (official EOD) use it as the primary display price.
  // The `last` field may be a delayed AH print; expose it as a secondary line when it differs.
  const officialClose = liveQuote?.close as number | undefined;
  const ahPrint = liveQuote?.afterHours as number | undefined;
  // AH % change vs the official close (shown alongside ahPrint in the secondary line).
  const ahChg: number | null =
    ahPrint != null && officialClose != null && officialClose !== 0
      ? ((ahPrint - officialClose) / officialClose) * 100
      : null;
  // F2: for composites, use summed composite quote; for singles, use existing logic.
  const lastPx: number | undefined = activeIsComposite
    ? (compositeQ?.last ?? undefined)
    : (officialClose ?? liveQuote?.last ?? livePx ?? m?.last);
  const prevCloseForChg = liveQuote?.prevClose as number | undefined;
  const chgNow: number | null | undefined = activeIsComposite
    ? (compositeQ?.chg ?? null)
    : officialClose != null && prevCloseForChg != null && prevCloseForChg !== 0
      ? ((officialClose - prevCloseForChg) / prevCloseForChg) * 100
      : // Overnight: hub emits prevSessionChg only when no new session prints
        // exist — prefer it over the misleading 0.00% (TV semantics).
        ((liveQuote?.prevSessionChg as number | undefined) ?? liveQuote?.chg ?? m?.chg);

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
    if (!loggedIn) { showGateNudge(t("gateWatchlist")); return; }
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
  // Inline create used by the search-hub rail + add-to-list picker (no window.prompt — name is
  // supplied by the caller's inline input). Returns the created/normalized name, or null if the
  // name is empty/duplicate so the caller can keep its input open. Does NOT switch active list —
  // callers decide (the rail switches; the add-picker adds a symbol then switches).
  function createListNamed(raw: string): string | null {
    const name = raw.trim();
    if (!name || lists[name]) return null;
    setLists((l) => ({ ...l, [name]: [] }));
    return name;
  }
  // Add a symbol to a NAMED list (search-hub multi-list picker). Mirrors addSymbol's dedupe +
  // Default-only server sync, but targets an explicit list instead of the active one.
  function addToList(sym: string, listName: string) {
    if (!loggedIn) { showGateNudge(t("gateWatchlist")); return; }
    const sec = man?.symbols?.[sym]?.sec || "Watchlist";
    setLists((l) => {
      const cur = l[listName] || [];
      if (cur.some((x) => x.symbol === sym)) return l;
      return { ...l, [listName]: [...cur, { symbol: sym, section: sec }] };
    });
    if (listName === "Default") fetch("/api/watchlist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "add", symbol: sym, section: sec }) }).catch(() => {});
  }
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
  const toggleInd = (k: string) => {
    // Anon cap: toggling OFF is always fine; block ADDING past the cap + nudge.
    // Checked OUTSIDE the setInds updater (no setState side-effect in a reducer).
    if (!loggedIn && !inds.has(k) && inds.size >= MAX_ANON_IND) { showGateNudge(t("gateIndCap")); return; }
    setInds((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
  };
  const toggleCompare = useCallback((s: string, mode: CmpMode = "percent") => {
    if (s === active) return;
    if (compare.includes(s)) {
      setCompare((c) => c.filter((x) => x !== s));
      setCompareCfg((c) => { const n = { ...c }; delete n[s]; return n; });
      setHidden((h) => { if (!h.has(cmpKey(s))) return h; const n = new Set(h); n.delete(cmpKey(s)); return n; });
    } else if (compare.length < 4) {
      const idx = compare.length;
      setCompare((c) => [...c, s].slice(0, 4));
      setCompareCfg((c) => ({ ...c, [s]: defaultCmpCfg(idx, mode) }));
    }
  }, [active, compare]);
  // ── indicator legend actions (shared by the per-pane legend + its More menu) ──
  const toggleHidden = useCallback((k: string) => setHidden((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; }), []);
  const removeInd = useCallback((k: string) => {
    if (isCmpKey(k)) { toggleCompare(cmpSymOf(k)); return; }
    // a legend "remove" on a custom-script row disables the script rather than mutating the built-in set
    // Object-tree pine entries are keyed as "pine:<id>" — strip the prefix before the ref lookup
    const pineId = k.startsWith("pine:") ? k.slice(5) : k;
    if (scriptByIdRef.current[pineId]) { setEnabledIds((ids) => ids.filter((x) => x !== pineId)); setHidden((s) => { const n = new Set(s); n.delete(k); n.delete(pineId); return n.size === s.size ? s : n; }); return; }
    setInds((s) => { if (!s.has(k)) return s; const n = new Set(s); n.delete(k); return n; });
    setHidden((s) => { if (!s.has(k)) return s; const n = new Set(s); n.delete(k); return n; });
  }, [toggleCompare]);
  const setIndParam = useCallback((k: string, patch: Record<string, any>) => setIndParams((p) => ({ ...p, [k]: { ...withDefaults(k, p[k]), ...patch } })), []);
  const resetIndParam = useCallback((k: string) => setIndParams((p) => ({ ...p, [k]: indDefaults(k) })), []);
  const openSettings = useCallback((k: string) => setSettingsKey(k), []);

  // ── Day Trade Mode toggle (D lane §5) ─────────────────────────────────────────
  const showDtmToast = useCallback((msg: string) => {
    clearTimeout(dtmToastTimer.current);
    setDtmToast(msg);
    dtmToastTimer.current = setTimeout(() => setDtmToast(null), 2500);
  }, []);

  const toggleDtm = useCallback(() => {
    // Guard: don't toggle while an undo-inds op is pending (spec gotcha)
    if (undoInds) return;
    dtmUserRef.current = true;
    // All side effects live OUTSIDE the setDtm updater: setState-in-updater (setTf/setInds/…) and
    // the mm:set-eth dispatch (whose ChartPane listener patches settings synchronously) fire React's
    // "cannot update a component while rendering a different component" — updaters must stay pure.
    const next = !dtm;
    if (next) {
      // Snapshot current workspace before applying preset
      const chartSettings = (() => { try { return JSON.parse(localStorage.getItem("mm.chartSettings") || "{}"); } catch { return {}; } })();
      const snap: DtmSnapshot = {
        inds: [...inds],
        indParams: JSON.parse(JSON.stringify(indParams)),
        tf,
        favTF: [...favTF],
        chartType,
        extHours: !!(chartSettings?.extHours),
      };
      dtmSnapshotRef.current = snap;
      localStorage.setItem("mm.dtmSnapshot", JSON.stringify(snap));

      // Apply Day Trade Mode preset
      setTf("5m");
      setFavTF((prev2) => {
        const s = new Set(prev2);
        for (const t2 of ["1m", "5m", "15m", "1h"]) s.add(t2);
        return [...s].sort((a, b) => tfSortKey(a) - tfSortKey(b));
      });
      setInds(new Set(["ema", "svwap", "vol", "orb", "slevels", "rvol"]));
      setIndParams((p) => ({
        ...p,
        ema: { ...withDefaults("ema", p.ema), ma1Len: 9, ma2Len: 20, ma3On: false },
      }));
      // Dispatch ext-hours ON event (ChartPane listens for mm:set-eth)
      window.dispatchEvent(new CustomEvent("mm:set-eth", { detail: { on: true } }));
    } else {
      // Restore snapshot verbatim
      const snap = dtmSnapshotRef.current;
      if (snap) {
        setInds(new Set(snap.inds));
        setIndParams(snap.indParams);
        setTf(snap.tf);
        setFavTF(snap.favTF);
        setChartType(snap.chartType);
        // Restore ext-hours to snapshotted value
        window.dispatchEvent(new CustomEvent("mm:set-eth", { detail: { on: snap.extHours } }));
      }
      // else: missing snapshot → keep current state, just clear flag (spec: no-op restore)
    }
    setDtm(next);
  }, [undoInds, dtm, inds, indParams, tf, favTF, chartType]);

  // Show toast after dtm state settles — only for explicit user toggles (dtmUserRef), never for
  // load-restores. NOTE: dtmMounted cannot gate this — the persist effect (earlier in source order)
  // sets it true on the same mount commit before this effect runs.
  useEffect(() => {
    if (!dtmUserRef.current) return;
    dtmUserRef.current = false;
    showDtmToast(dtm ? t("dtmOn") : t("dtmOff"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dtm]);

  // ── Day Trade Mode hotkeys (§5): Alt+D toggle; Alt+1/2/3/4 quick-TF while in mode ──
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const target = e.target as HTMLElement;
      const tag = target?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea") return;
      if (target?.isContentEditable) return;
      if (!e.altKey) return;
      if (e.code === "KeyD") { e.preventDefault(); toggleDtm(); return; }
      if (dtm) {
        // Alt+1/2/3/4 — use e.code to survive keyboard layout differences
        if (e.code === "Digit1") { e.preventDefault(); setTf("1m"); return; }
        if (e.code === "Digit2") { e.preventDefault(); setTf("5m"); return; }
        if (e.code === "Digit3") { e.preventDefault(); setTf("15m"); return; }
        if (e.code === "Digit4") { e.preventDefault(); setTf("1h"); return; }
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [toggleDtm, dtm]);

  // ── custom-script wiring ──────────────────────────────────────────────────────────────────────
  // load scripts + enable-state + param overrides on mount (dual-tier: API for members, LS for guests)
  const scriptsLoadedRef = useRef(false);
  useEffect(() => {
    setEnabledIds(enabledScriptIds());
    setPineParamsState(pineParamStore());
    let alive = true;
    listScripts(loggedIn).then((list) => { if (alive) { setScripts(list); scriptsLoadedRef.current = true; } }).catch(() => { if (alive) scriptsLoadedRef.current = true; });
    return () => { alive = false; };
  }, [loggedIn]);
  // persist enable-state + overrides (both tiers use localStorage — mirrors mm.inds / mm.indParams).
  // skip the mount write so the pre-load default can't clobber the saved value.
  const pineOnMounted = useRef(false); const pinePMounted = useRef(false);
  useEffect(() => { if (!pineOnMounted.current) { pineOnMounted.current = true; return; } setEnabledScriptIds(enabledIds); }, [enabledIds]);
  useEffect(() => { if (!pinePMounted.current) { pinePMounted.current = true; return; } setPineParamStore(pineParams); }, [pineParams]);

  // ?addScript=<id> → enable that script on the chart, then strip the param (mirror ?pane consumption).
  // ONLY enable an id that resolves to a known script (saved_scripts / guest LS): the proprietary flagship
  // lives as a constant outside both stores, so its id can never render on a pane — enabling it would just
  // permanently pollute 'mm.pineOn' with an unrenderable id. Re-runs when `scripts` finishes loading so a
  // valid id that arrived before the async list resolved still gets enabled; once the list has loaded, an
  // id that still doesn't resolve is dropped (param stripped) instead of lingering.
  useEffect(() => {
    const id = new URLSearchParams(urlSearch).get("addScript");
    if (!id) return;
    const resolvable = !!scriptByIdRef.current[id];
    if (resolvable) setEnabledIds((ids) => (ids.includes(id) ? ids : [...ids, id]));
    else if (!scriptsLoadedRef.current) return;   // list not loaded yet — keep ?addScript= and retry after load
    try { const u = new URL(window.location.href); u.searchParams.delete("addScript"); window.history.replaceState({}, "", u.toString()); } catch {}
  }, [urlSearch, scripts]);

  // ?ind=key1,key2 → enable those built-in indicators on initial load only (does not fight user toggles).
  // Reactive on urlSearch (so it fires after window.location.search is read on mount). Unknown keys are
  // silently ignored. Strips ?ind= from the URL after applying so subsequent user toggles are not reset.
  useEffect(() => {
    const raw = new URLSearchParams(urlSearch).get("ind");
    if (!raw) return;
    const keys = raw.split(",").map((k) => k.trim()).filter(isIndKey);
    if (keys.length) setInds((prev) => { const next = new Set(prev); for (const k of keys) next.add(k); return next; });
    // Strip param so this only fires once (mirrors ?addScript= / ?pane= strip pattern)
    try { const u = new URL(window.location.href); u.searchParams.delete("ind"); window.history.replaceState({}, "", u.toString()); } catch {}
  }, [urlSearch]);

  // ?dtm=1 → activate Day Trade Mode after mount (same urlSearch pattern as ?ind=); strip after consume.
  // dtmBootRef guard: when mm.dtm=true was restored on load, the mode is already coming up — a second
  // toggleDtm here would snapshot the in-mode workspace as the "swing" snapshot and break restore.
  useEffect(() => {
    const raw = new URLSearchParams(urlSearch).get("dtm");
    if (raw !== "1") return;
    if (!dtm && !dtmBootRef.current) toggleDtm();
    try { const u = new URL(window.location.href); u.searchParams.delete("dtm"); window.history.replaceState({}, "", u.toString()); } catch {}
  }, [urlSearch, toggleDtm, dtm]);

  // derive the enabled PineScript[] (declared defaults + per-script overrides merged), passed to every pane
  const scriptById = useMemo(() => { const m: Record<string, UserScript> = {}; for (const s of scripts) m[s.id] = s; return m; }, [scripts]);
  scriptByIdRef.current = scriptById;
  const pineScripts = useMemo<PineScript[]>(
    () => enabledIds.map((id) => scriptById[id]).filter(Boolean).map((s) => ({ id: s.id, name: s.name, source: s.source, params: mergedParams(s, pineParams) })),
    [enabledIds, scriptById, pineParams]
  );
  const enabledSet = useMemo(() => new Set(enabledIds), [enabledIds]);
  const isPineKey = useCallback((k: string) => !!scriptById[k], [scriptById]);   // a legend key that is a known scriptId

  const toggleScript = useCallback((id: string) => setEnabledIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id])), []);
  const handleRenameScript = useCallback((id: string, name: string) => {
    const s = scriptById[id]; if (!s || !name.trim() || name.trim() === s.name) return;
    const nm = name.trim(); const prev = s.name;
    setScripts((list) => list.map((x) => (x.id === id ? { ...x, name: nm } : x)));   // optimistic
    // roll back on server failure (a logged-in non-Pro user hits the save 403 → renScript returns false),
    // otherwise the legend/modal keep an optimistic name that silently reverts on the next reload. Only
    // revert if the name is still the one we set (don't clobber a newer concurrent rename).
    renScript(loggedIn, { id, name: nm, source: s.source, params: s.params }).then((ok) => {
      if (!ok) setScripts((list) => list.map((x) => (x.id === id && x.name === nm ? { ...x, name: prev } : x)));
    });
  }, [scriptById, loggedIn]);
  const handleDeleteScript = useCallback((id: string) => {
    setScripts((list) => list.filter((x) => x.id !== id));
    setEnabledIds((ids) => ids.filter((x) => x !== id));
    setPineParamsState((p) => { if (!(id in p)) return p; const n = { ...p }; delete n[id]; return n; });
    // close this script's Settings dialog if it's open: once it leaves `scripts`, isPineKey(settingsKey)
    // flips false and the render would fall into the built-in <IndicatorSettings indKey={rawId}> branch —
    // a broken dialog titled with the raw id and no inputs. Clear it (settingsKey/sourceKey) instead.
    setSettingsKey((k) => (k === id ? null : k));
    setSourceKey((k) => (k === id ? null : k));
    void delScript(loggedIn, id);
  }, [loggedIn]);
  const setPineParam = useCallback((id: string, patch: Record<string, any>) => setPineParamsState((p) => ({ ...p, [id]: { ...(p[id] || {}), ...patch } })), []);
  // "Source code" on a legend row: a custom script opens the Pine editor (deep-linked); a built-in opens its read-only source view
  const openSource = useCallback((k: string) => { if (scriptById[k]) { window.location.href = `/scripts?id=${encodeURIComponent(k)}`; return; } setSourceKey(k); }, [scriptById]);
  // F1 flag management
  const setFlag = (sym: string, color: string) => {
    setFlags((f) => ({ ...f, [sym]: color }));
    setLastFlagColor(color);
    try { localStorage.setItem("mm.lastFlagColor", color); } catch {}
  };
  const removeFlag = (sym: string) => { setFlags((f) => { const n = { ...f }; delete n[sym]; return n; }); };

  const pick = (sym: string) => {
    // prefer the pane the user is viewing (matters in an MTF layout where one symbol fills several panes):
    // re-clicking the active symbol is a no-op rather than jumping focus to the first matching pane.
    const existing = panes[activePane] === sym ? activePane : panes.findIndex((s) => s === sym);
    if (existing >= 0 && existing !== activePane) setActivePane(existing);          // shown in a different pane → focus it (don't duplicate)
    else if (panes[activePane] !== sym) setPanes((p) => p.map((s, i) => (i === activePane ? sym : s)));
    setReplayOn(false); setReplayIdx(null); setPlaying(false); setCompare([]);
    // F3: record navigation in history ring buffer (skip composites — SearchModal filters
    // history via manifest keys, so composite exprs would silently vanish from the Recent list).
    if (!isComposite(sym)) pushHistory(sym);
  };
  const onSearchPick = (sym: string) => { if (searchMode === "compare") { toggleCompare(sym); } else pick(sym); };

  // ── Chart Bus v2 (CMX W1) ──────────────────────────────────────────────────────────────────
  // The v2 typed drawing/command vocabulary. v1 envelopes stay on handleBrainCommand below; a v:2
  // envelope routes here. The bus owns the in-memory per-symbol AI drawing layer, acks, and the
  // debounced state-mirror POST. capabilities report the REAL enums (kills hallucinated names).
  const sessionIndicators: IndicatorSpec[] = useMemo(
    () => [...inds].map((k) => ({ name: k, params: indParams[k] as Record<string, number> | undefined })),
    [inds, indParams],
  );
  const chartBus = useChartBus({
    activeSymbol: active,
    bars,
    capabilities: { tfs: TF_CANONICAL_ORDER, indicators: [...IND_ORDER] },
    sessionIndicators,
    currentTf: tf,
    // AI objects live in the bus's own store, never in drawStore — so drawStore[active] is purely the
    // user's own drawings (by:"user"). Enumerable, so we report them.
    userDrawings: drawStore[active] ?? [],
    setSymbol: (s) => pick(s),
    setTf: (t2) => setTf(t2),
    setIndicators: (specs) => {
      const keys = specs.map((s) => s.name).filter((k) => isIndKey(k) || scriptById[k]);
      setInds(new Set(keys));
      const withParams = specs.filter((s) => s.params && isIndKey(s.name));
      if (withParams.length) setIndParams((p) => { const n = { ...p }; for (const s of withParams) n[s.name] = { ...(n[s.name] || {}), ...s.params }; return n; });
    },
    // MVP: jump the chart to the range start via the existing mm:chart-jump consumer. A precise
    // setVisibleRange is a follow-up via the onChartApi seam (see PR body).
    setRange: (from) => { try { window.dispatchEvent(new CustomEvent("mm:chart-jump", { detail: { ts: from } })); } catch {} },
  });

  // Brain widget → chart command executor. Mirrors the retired CopilotPanel's FLAT single-command
  // contract EXACTLY ({action, symbol|tf|indicator+on|kind} at top level): every field is
  // type-guarded, toggle_indicator adds ONLY on an explicit on===true (a missing flag never
  // silently adds), and unknown/malformed actions are ignored gracefully.
  const handleBrainCommand = (j: any) => {
    // v2 envelope ({on:true, v:2, batch_id, seq, op, …}) → the typed Chart Bus. v1 falls through.
    if (isV2Envelope(j)) { chartBus.dispatchV2(j); return; }
    const action = typeof j?.action === "string" ? j.action : "";
    if (action === "set_symbol" && typeof j.symbol === "string") {
      pick(j.symbol);
    } else if (action === "set_timeframe" && typeof j.tf === "string") {
      setTf(j.tf);
    } else if (action === "toggle_indicator" && typeof j.indicator === "string") {
      const on = j.on === true; // explicit only — a missing flag never silently adds
      const indicator = j.indicator;
      if (on) setInds((s) => { const n = new Set(s); n.add(indicator); return n; });
      else setInds((s) => { const n = new Set(s); n.delete(indicator); return n; });
    } else if (action === "run_detection" && typeof j.kind === "string") {
      detect(j.kind);
    }
  };

  function saveLayout() { const name = layoutName.trim() || `Layout ${layouts.length + 1}`; const config = { panes, paneTfs, activePane, tf, chartType, inds: [...inds], favTF, compare, compareCfg, lockedVLine }; fetch("/api/layouts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, config }) }).then(() => fetch("/api/layouts").then((r) => r.json()).then((d) => setLayouts(d.layouts || []))); setLayoutName(""); }
  function loadLayout(l: any) { const c = l.config || {}; if (c.chartType) setChartType(c.chartType); if (c.inds) setInds(new Set(c.inds)); if (c.favTF) setFavTF(c.favTF); if (Array.isArray(c.compare)) setCompare(c.compare); if (c.compareCfg) setCompareCfg(c.compareCfg); if (typeof c.lockedVLine === "string" || c.lockedVLine === null) setLockedVLine(c.lockedVLine);
    if (Array.isArray(c.panes) && c.panes.length) {
      setPanes(c.panes); setActivePane(Math.min(c.activePane || 0, c.panes.length - 1)); setSplit(c.panes.length >= 4 ? 4 : c.panes.length >= 2 ? 2 : 1);
      setPaneTfs(Array.isArray(c.paneTfs) && c.paneTfs.length === c.panes.length ? c.paneTfs : c.panes.map(() => c.tf || "D"));   // back-compat: older layouts have a single tf
    } else if (c.active) { setPanes([c.active]); setActivePane(0); setSplit(1); setPaneTfs([c.tf || "D"]); }
    setLayoutOpen(false); }
  function delLayout(id: string) { fetch(`/api/layouts?id=${id}`, { method: "DELETE" }).then(() => setLayouts((ls) => ls.filter((x) => x.id !== id))); }

  const colList = (): [string, string][] => { const a: [string, string][] = [["last", t("colLast")]]; if (set.cols.change) a.push(["change", t("colChgShort")]); if (set.cols.changePct) a.push(["changePct", t("colChgPctShort")]); if (set.cols.volume) a.push(["volume", t("colVolShort")]); if (set.cols.ext) a.push(["ext", t("colExtShort")]); return a; };
  // item-26: ext column reads from extQuotes (separate poll); dash when closed or no ext print.
  const colVal = (sym: string, r: Row | undefined, key: string) => {
    if (!r) return "—";
    const u = r.chg >= 0;
    if (key === "last") return fmt(r.last, r.last < 10 ? 4 : 2);
    // $ change = last − prevClose. prevClose = last / (1 + chg%). The old
    // `last * chg/100` used the CURRENT price as the base, overstating the move
    // by a factor of (1 + chg%).
    if (key === "change") { const prev = r.chg > -100 ? r.last / (1 + r.chg / 100) : r.last; const d = r.last - prev; return (d >= 0 ? "+" : "") + fmt(d, 2); }
    if (key === "changePct") return (u ? "+" : "") + fmt(r.chg) + "%";
    if (key === "volume") return vol(r.vol);
    if (key === "ext") {
      const eq = extQuotes[sym];
      if (!eq || eq.extChg == null) return "—";
      const eu = eq.extChg >= 0;
      return (eu ? "+" : "") + fmt(eq.extChg) + "%";
    }
    return "";
  };
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
    <OnboardingProvider email={email}>
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
        <button className="ai" onClick={() => (window as any).MMBrain?.toggle()}><svg viewBox="0 0 24 24"><path d="M12 2l2.2 5.8L20 10l-5.8 2.2L12 18l-2.2-5.8L4 10l5.8-2.2z" /></svg>Mastermind AI</button>
        <SettingsMenu email={email} />
      </header>

      {/* ── mobile top bar + drawer (shared component) ── */}
      <MobileNav
        email={email}
        fromMacro={fromMacro}
        onBack={onBack}
        onOpenCopilot={() => (window as any).MMBrain?.open()}
        isTerminal
        activeKey={(() => {
          const pane = new URLSearchParams(urlSearch).get("pane");
          return (pane === "analyst" || pane === "forecast") ? "analyst" : "chart";
        })()}
      />
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
          <div className="ct on">{t("priceChart")}</div>
          <div className="tools">
            <div className="pophost">
              <div className="tftray">
                {[...favTF].sort((a, b) => tfSortKey(a) - tfSortKey(b)).map((tfi) => (
                  <button key={tfi} className={`tfbtn${tf === tfi ? " on" : ""}${!FUNCTIONAL.has(tfi) ? " dis" : ""}`} disabled={!FUNCTIONAL.has(tfi)} onClick={() => FUNCTIONAL.has(tfi) && setTf(tfi)}>{tfi}</button>
                ))}
                <button className="tfbtn tfbtn-edit" onClick={(e) => { e.stopPropagation(); const willOpen = !tfOpen; closeAll(); setTfOpen(willOpen); }} title={t("tfCustomize")}>
                  <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M2 10.5V12h1.5l5-5-1.5-1.5-5 5zM11.3 3.7a.9.9 0 0 0 0-1.3l-.7-.7a.9.9 0 0 0-1.3 0L8 3l2 2 1.3-1.3z" /></svg>
                </button>
              </div>
              {/* desktop TF grid (hidden on mobile via CSS) */}
              <div className={`tfgrid${tfOpen ? " show" : ""}`} onClick={(e) => e.stopPropagation()}>
                {TF_GROUPS.map(([g, items]) => (<div key={g}><div className="g">{t(TFG_TKEY[g])}</div>{items.map((tfi) => { const fn = FUNCTIONAL.has(tfi); const fav = favTF.includes(tfi);
                  return <div key={tfi} className={`it${tf === tfi ? " on" : ""}${fn ? "" : " dis"}`} onClick={() => { if (fn) { setTf(tfi); setTfOpen(false); } }}>
                    <span>{tfi}{!fn && <span style={{ color: "var(--text-dim)", marginLeft: 6, fontSize: 10 }}>{t("liveFeed")}</span>}</span>
                    <span className={`fav${fav ? " on" : ""}`} onClick={(e) => { e.stopPropagation(); setFavTF((f) => f.includes(tfi) ? f.filter((x) => x !== tfi) : [...f, tfi]); }}><svg viewBox="0 0 24 24"><path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z" /></svg></span>
                  </div>; })}</div>))}
              </div>
              {/* mobile TF bottom sheet */}
              {isMobile && (
                <MobileSheet open={tfOpen} onClose={() => setTfOpen(false)} title={t("tfSheetTitle")}>
                  {TF_GROUPS.map(([g, items]) => (
                    <div key={g}>
                      <div className="msheet-ghd">{t(TFG_TKEY[g])}</div>
                      {items.map((tfi) => {
                        const fn = FUNCTIONAL.has(tfi);
                        const fav = favTF.includes(tfi);
                        return (
                          <div key={tfi} className={`msheet-row${tf === tfi ? " on" : ""}${fn ? "" : ""}`} style={fn ? {} : { opacity: 0.45 }} onClick={() => { if (fn) { setTf(tfi); setTfOpen(false); } }}>
                            <span style={{ flex: 1 }}>{tfi}{!fn && <span style={{ color: "var(--text-dim)", marginLeft: 8, fontSize: 11 }}>{t("liveFeed")}</span>}</span>
                            <span className={`fav${fav ? " on" : ""}`} onClick={(e) => { e.stopPropagation(); setFavTF((f) => f.includes(tfi) ? f.filter((x) => x !== tfi) : [...f, tfi]); }} style={{ padding: "0 4px" }}><svg viewBox="0 0 24 24" width={16} height={16}><path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z" /></svg></span>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </MobileSheet>
              )}
            </div>
            <div className="pophost">
              <button className="tbtn" onClick={(e) => { e.stopPropagation(); const willOpen = !ctOpen; closeAll(); setCtOpen(willOpen); }}><svg viewBox="0 0 24 24"><path d="M6 4v16M6 8h3M14 4v16M14 9h3" /></svg>{t(CT_TKEY[chartType])}<span style={{ color: "var(--muted)" }}>▾</span></button>
              {/* desktop popover (hidden on mobile via CSS) */}
              <div className={`pop${ctOpen ? " show" : ""}`} style={{ top: 32, left: 0 }} onClick={(e) => e.stopPropagation()}>
                {CHART_TYPES.map(([k]) => <div key={k} className="set-row" style={chartType === k ? { color: "var(--brand-2)" } : {}} onClick={() => { setChartType(k); setCtOpen(false); }}>{t(CT_TKEY[k])}</div>)}
              </div>
              {/* mobile bottom sheet */}
              {isMobile && (
                <MobileSheet open={ctOpen} onClose={() => setCtOpen(false)} title={t("ctSheetTitle")}>
                  {CHART_TYPES.map(([k]) => (
                    <div key={k} className={`msheet-row${chartType === k ? " on" : ""}`} onClick={() => { setChartType(k); setCtOpen(false); }}>
                      {t(CT_TKEY[k])}
                      {chartType === k && <span style={{ marginLeft: "auto" }}>✓</span>}
                    </div>
                  ))}
                </MobileSheet>
              )}
            </div>
            <button className="tbtn" onClick={() => setIndOpen(true)}><svg viewBox="0 0 24 24" style={{ strokeWidth: 2 }}><path d="M5 12h14M12 5v14" /></svg>{t("indicators")}</button>
            <div className="seg tool-adv" title={t("splitLayout")}>{[1, 2, 4].map((n) => <button key={n} className={split === n ? "on" : ""} onClick={() => setGrid(n)}>{n}</button>)}</div>
            <button className={`tbtn tool-adv${isMtf ? " on" : ""}`} title={t("mtfTip")} onClick={mtfLayout}><svg viewBox="0 0 24 24"><path d="M3 13h4v8H3zM10 8h4v13h-4zM17 3h4v18h-4z" /></svg>{t("mtf")}</button>
            <button className={`tbtn dtm${dtm ? " on" : ""}`} title={t("dtmTip")} onClick={toggleDtm}><svg viewBox="0 0 24 24" style={{ width: 13, height: 13 }} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>{t("dtmBtn")}</button>
            {panes.length > 1 && <button className={`tbtn tool-adv${sync && !mixedTfs ? " on" : ""}`} disabled={mixedTfs} title={mixedTfs ? t("syncMixedTip") : t("syncTip")} onClick={() => setSync((s) => !s)}><svg viewBox="0 0 24 24"><path d="M4 7h11M4 7l3-3M4 7l3 3M20 17H9M20 17l-3-3M20 17l-3 3" /></svg>{t("sync")}</button>}
            <button
              className={`tbtn tool-adv${replayOn ? " on" : ""}`}
              title={mixedTfs && !replayOn ? t("replayMixedTip") : (replayOn ? t("replayExitTip") : t("replayTip"))}
              disabled={mixedTfs && !replayOn}
              onClick={() => {
                setReplayOn((on) => {
                  const next = !on;
                  if (next) setReplayIdx(Math.max(20, total - 80)); // seed like the reset control
                  setPlaying(false);
                  return next;
                });
              }}
            ><svg viewBox="0 0 24 24"><path d="M3 3v18M8 6l10 6-10 6V6z" /></svg>{t("replayBtn")}</button>
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
            <div className="pophost tool-adv">
              <button className="icbtn" title={t("snapshot")} onClick={(e) => { e.stopPropagation(); const willOpen = !snapOpen; closeAll(); setSnapOpen(willOpen); }}><svg viewBox="0 0 24 24"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg></button>
              <div className={`pop snap-pop${snapOpen ? " show" : ""}`} style={{ top: 36, right: 0, minWidth: 220 }} onClick={(e) => e.stopPropagation()}>
                <div className="menu-hd" style={{ padding: "7px 12px 5px", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: "var(--text-dim)", borderBottom: "1px solid var(--line)", marginBottom: 2 }}>{t("snapMenuTitle")}</div>
                <div className="menu-row" onClick={() => { setSnapOpen(false); window.dispatchEvent(new CustomEvent("mm:snapshot", { detail: { action: "download" } })); }}>
                  <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
                  {t("snapDownload")}<span style={{ marginLeft: "auto", opacity: 0.45, fontSize: 10 }}>⌥⌘S</span>
                </div>
                <div className="menu-row" onClick={() => { setSnapOpen(false); window.dispatchEvent(new CustomEvent("mm:snapshot", { detail: { action: "copy" } })); }}>
                  <svg viewBox="0 0 24 24"><path d="M8 17H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v3M11 21h8a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2z" /></svg>
                  {t("snapCopy")}<span style={{ marginLeft: "auto", opacity: 0.45, fontSize: 10 }}>⇧⌘S</span>
                </div>
                <div className="menu-row" onClick={() => { setSnapOpen(false); window.dispatchEvent(new CustomEvent("mm:snapshot", { detail: { action: "share" } })); }}>
                  <svg viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
                  {t("snapCopyLink")}<span style={{ marginLeft: "auto", opacity: 0.45, fontSize: 10 }}>⌥S</span>
                </div>
                <div className="menu-row" onClick={() => { setSnapOpen(false); window.dispatchEvent(new CustomEvent("mm:snapshot", { detail: { action: "tab" } })); }}>
                  <svg viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3" /></svg>
                  {t("snapTab")}
                </div>
              </div>
            </div>
            <button className={`icbtn chart-fs-btn${fullChart ? " on" : ""}`} title={fullChart ? t("exitFullscreen") : t("fullscreenChart")} onClick={() => setFullChart((f) => !f)}>
              {fullChart
                ? <svg viewBox="0 0 24 24"><path d="M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5" /></svg>
                : <svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M15 20h5v-5M9 20H4v-5" /></svg>}
            </button>
          </div>
        </div>

        {replayOn && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 14px", borderBottom: "1px solid var(--line)", background: "var(--bg)" }}>
            <button className="icbtn" title={t("replayReset")} aria-label={t("replayReset")} onClick={() => { setReplayIdx(Math.max(20, total - 80)); setPlaying(false); }}><svg viewBox="0 0 24 24"><path d="M11 19l-7-7 7-7M20 19l-7-7 7-7" /></svg></button>
            <button className="icbtn" disabled={mixedTfs} aria-label={t("replayPrev")} title={t("replayPrev")} onClick={() => setReplayIdx((i) => Math.max(20, (i ?? 0) - 1))}><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6" /></svg></button>
            <button className="icbtn" disabled={mixedTfs} aria-label={playing ? t("replayPause") : t("replayPlay")} title={mixedTfs ? t("replayMixedTip") : (playing ? t("replayPause") : t("replayPlay"))} onClick={() => setPlaying((p) => !p)}>{playing ? <svg viewBox="0 0 24 24"><path d="M6 4h4v16H6zM14 4h4v16h-4z" /></svg> : <svg viewBox="0 0 24 24" style={{ fill: "var(--signal)", stroke: "none" }}><path d="M6 4l14 8-14 8V4z" /></svg>}</button>
            <button className="icbtn" disabled={mixedTfs} aria-label={t("replayNext")} title={t("replayNext")} onClick={() => setReplayIdx((i) => Math.min(total - 1, (i ?? 0) + 1))}><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6" /></svg></button>
            <div className="seg" style={{ height: 26 }}>{[1, 2, 4].map((s) => <button key={s} className={speed === s ? "on" : ""} onClick={() => setSpeed(s)}>{s}x</button>)}</div>
            <input type="range" min={20} max={Math.max(21, total - 1)} value={replayIdx ?? total - 1} disabled={mixedTfs} title={mixedTfs ? t("replayMixedTip") : undefined} onChange={(e) => setReplayIdx(parseInt(e.target.value))} style={{ flex: 1, accentColor: "var(--brand)" }} />
            <span className="num" style={{ color: "var(--muted)", fontSize: 11.5, minWidth: 70, textAlign: "right" }}>{(replayIdx ?? total - 1) + 1} / {total}</span>
          </div>
        )}

        {/* ── MegaPane in-slot: on desktop (>860px via CSS) this fills the chart-pane area in-place,
             keeping the AppNav + watchlist rail mounted and interactive. On mobile the CSS reverts it
             to a full-screen fixed overlay (existing behavior). Ticker changes propagate automatically
             because `active` is the same symbol-selection state the chart uses. ── */}
        {paneOpen ? (
          <MegaPane
            sym={active}
            fund={fund}
            fundLoading={fundLoading}
            quote={liveQuote ? { last: lastPx ?? null } : null}
            bars={bars}
            page={paneOpen}
            onPage={(p) => setPaneOpen(p)}
            onClose={() => setPaneOpen(null)}
            name={nameOf(m) || active}
            mode="workspace"
            intel={intel}
          />
        ) : tableViewOpen ? (
          /* D3: Table view replaces the chart body */
          <ChartTableView
            symbol={active}
            timeframe={tf}
            bars={bars}
            indCols={[...inds].filter((k) => !hidden.has(k)).map((k) => {
              const def = (IND_DEFS as any)[k];
              return { key: k, label: def?.label ?? k, tag: def?.tag ?? k };
            })}
            indRowsAt={indRowsAt ?? undefined}
            onBack={() => setTableViewOpen(false)}
          />
        ) : (
          <div className="chart-body" style={{ "--subpanes": subPanes } as React.CSSProperties}>
            <DrawingSidebar
              tool={tool}
              magnet={magnet}
              drawStyle={drawStyle}
              onTool={(id) => setTool(id)}
              onMagnet={() => setMagnet((mg) => !mg)}
              onClear={() => detect("clearAll")}
              onDrawStyle={(patch) => setDrawStyle((s) => ({ ...s, ...patch }))}
            />
            <div className="pane-grid" data-n={panes.length}>
              {panes.map((sym, i) => (
                <ChartPane key={i} idx={i} symbol={sym} isActive={i === activePane} onActivate={setActivePane} row={paneRows[i]} tf={paneTfs[i] ?? "D"} chartType={chartType} inds={inds} tool={tool} drawStyle={drawStyle} detectCmd={detectCmd} compare={compare} compareCfg={compareCfg} magnet={magnet} replayIdx={replayOn ? replayIdx : null} onMeta={(mm) => setTotal(mm.total)} drawings={[...(drawStore[sym] ?? []), ...chartBus.aiDrawingsFor(sym)]} onDrawingsChange={(d) => setSymbolDrawings(sym, d.filter((x) => !x.id.startsWith("ai_")))} liveQuote={quotes[sym] ?? null} indParams={indParams} hidden={hidden} onToggleHidden={toggleHidden} onRemoveInd={removeInd} onOpenSettings={openSettings} onOpenSource={openSource} pineScripts={pineScripts} dayMode={dtm}
                  onAddAlert={(price) => { window.location.href = `/alerts?sym=${encodeURIComponent(active)}&price=${encodeURIComponent(price.toFixed(4))}&type=price_above`; }}
                  onTableView={() => setTableViewOpen(true)}
                  onObjectTree={() => setObjectTreeOpen((o) => !o)}
                  lockedVLine={lockedVLine}
                  onSetLockedVLine={(t2) => setLockedVLine(t2)}
                  onIndRowsAt={(fn) => setIndRowsAt(() => fn)}
                  onPaneCount={i === 0 ? onPaneCount : undefined}
                />
              ))}
            </div>
            {/* CMX W3: the Conductor overlay — narrates the Brain's chart work (orb + caption plate +
                step rail + ghost cursor + stroke animations). Absolute overlay spanning .chart-body;
                pointer-events:none except its own controls, so the chart stays usable underneath. */}
            <ChartConductor queue={chartBus.queue} count={chartBus.legend.count} />
            {/* CMX W1: AI drawing-layer legend chip — appears when the active symbol carries AI objects.
                Eye toggles hide/show all; the × clears the layer. Functional chrome, not the W3 theater. */}
            {chartBus.legend.count > 0 && (
              <div className="ai-chip" title={t("aiLayerTip")}>
                <span className="ai-dot" />
                <b>{t("aiLayer")}</b>
                <i className="ai-n">{chartBus.legend.count}</i>
                <button className={`ai-eye${chartBus.legend.hidden ? " off" : ""}`} onClick={chartBus.legend.toggleHidden} title={chartBus.legend.hidden ? t("aiShow") : t("aiHide")} aria-label={chartBus.legend.hidden ? t("aiShow") : t("aiHide")}>
                  {chartBus.legend.hidden
                    ? <svg viewBox="0 0 24 24"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" /><path d="M4 4l16 16" /></svg>
                    : <svg viewBox="0 0 24 24"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>}
                </button>
                <button className="ai-clear" onClick={chartBus.legend.clear} title={t("aiClear")} aria-label={t("aiClear")}>
                  <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg>
                </button>
              </div>
            )}
            {/* D4: Object Tree right-rail panel */}
            {objectTreeOpen && (
              <ChartObjectTree
                symbol={active}
                entries={[
                  // overlay indicators (price pane)
                  ...[...inds].filter((k) => {
                    const def = (IND_DEFS as any)[k];
                    return def && def.kind === "overlay";
                  }).map((k): OTEntry => {
                    const def = (IND_DEFS as any)[k];
                    return { key: k, label: def?.label ?? k, tag: def?.tag ?? k, kind: "overlay", hidden: hidden.has(k) };
                  }),
                  // pine scripts (all enabled ones — ChartPanel handles pane vs overlay distinction)
                  ...pineScripts.map((s): OTEntry => ({
                    key: "pine:" + s.id, label: s.name, kind: "overlay", hidden: hidden.has("pine:" + s.id),
                  })),
                  // sub-pane indicators
                  ...[...inds].filter((k) => {
                    const def = (IND_DEFS as any)[k];
                    return def && def.kind === "pane";
                  }).map((k): OTEntry => {
                    const def = (IND_DEFS as any)[k];
                    return { key: k, label: def?.label ?? k, tag: def?.tag ?? k, kind: "pane", hidden: hidden.has(k) };
                  }),
                ]}
                onEye={toggleHidden}
                onRemove={removeInd}
                onClose={() => setObjectTreeOpen(false)}
              />
            )}
          </div>
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
                <button title={t("addSymbol")} onClick={(e) => { e.stopPropagation(); setSeed(""); setAddSymOpen(true); }}><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg></button>
                <button title={t("settings")} onClick={(e) => { e.stopPropagation(); const willOpen = !wlSetOpen; closeAll(); setWlSetOpen(willOpen); }}><svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></svg></button>
              </div>
              <div className={`pop${wlSetOpen ? " show" : ""}`} style={{ top: 40, right: 6 }} onClick={(e) => e.stopPropagation()}>
                <div className="set-h"><b>{t("tableViewLabel")}</b><span className={`switch${set.tableView ? " on" : ""}`} onClick={() => setSet((s) => ({ ...s, tableView: !s.tableView }))} /></div>
                <div className="set-grp">{t("columns")}</div>
                {([["last", t("colLast")], ["change", t("colChange")], ["changePct", t("colChangePct")], ["volume", t("colVolume")]] as [string, string][]).map(([k, l]) => (
                  <div key={k} className={`set-row${(set.cols as any)[k] ? " on" : ""}`} onClick={() => setSet((s) => ({ ...s, cols: { ...s.cols, [k]: !(s.cols as any)[k] } }))}><span className="cbx"><svg viewBox="0 0 24 24"><path d="M4 12l5 5L20 6" /></svg></span>{l}</div>
                ))}
                {/* item-26: Extended Hours column — dash for composites/non-US/no print */}
                <div className="set-grp">{t("extColumns")}</div>
                <div className={`set-row${set.cols.ext ? " on" : ""}`} onClick={() => setSet((s) => ({ ...s, cols: { ...s.cols, ext: !s.cols.ext } }))}><span className="cbx"><svg viewBox="0 0 24 24"><path d="M4 12l5 5L20 6" /></svg></span>{t("colExt")}</div>
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
                <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={onWlDragEnd} modifiers={[restrictToVerticalAxis, restrictToParentElement]}>
                {Object.entries(sections).map(([sec, rows]) => (
                  <div key={sec}>
                    <div className="wl-sec" style={{ minWidth: wlMinW }}>{sec}</div>
                    <SortableContext items={rows} strategy={verticalListSortingStrategy}>
                    {rows.map((sym) => {
                      const isCompSym = isComposite(sym);
                      // For composite rows, derive summed quote from leg quotes with EOD fallback.
                      let r: ReturnType<typeof mergeLive> | undefined;
                      if (isCompSym) {
                        const legs = parseComposite(sym) ?? [];
                        const legQuotes: Record<string, { last?: number; prevClose?: number } | null> = {};
                        for (const leg of legs) {
                          const live = quotes[leg] ?? null;
                          if (live && live.last != null) {
                            legQuotes[leg] = live;
                          } else {
                            const eod = man?.symbols?.[leg];
                            if (eod && eod.last != null) {
                              const chgFrac = (eod.chg ?? 0) / 100;
                              const prevClose = chgFrac !== -1 ? eod.last / (1 + chgFrac) : eod.last;
                              legQuotes[leg] = { last: eod.last, prevClose };
                            } else {
                              legQuotes[leg] = null;
                            }
                          }
                        }
                        const cq = calcCompositeQuote(legs, legQuotes);
                        r = cq ? { name: sym, sec: "Composite", col: "#2962ff", mkt: "", zh: "", last: cq.last, chg: cq.chg, open: 0, high: 0, low: 0, vol: 0, hi52: 0, lo52: 0, verdict: null, wr: null, pf: null, cagr: null, regimeBull: null } : undefined;
                      } else {
                        r = mergeLive(man?.symbols?.[sym], quotes[sym]);
                      }
                      const u = (r?.chg ?? 0) >= 0; const nm = nameOf(r);
                      const primary = set.disp === "name" ? (nm || sym) : sym;
                      const secondary = set.disp === "both" ? nm : set.disp === "name" ? sym : (set.tableView ? "" : nm);
                      const flagColor = flags[sym];
                      return (
                        <SortableWlRow key={sym} sym={sym} className={`wl-row${sym === active ? " on" : ""}${set.tableView ? " tv" : ""}`} style={{ gridTemplateColumns: wlGrid, minWidth: wlMinW, height: set.tableView ? 32 : 46 }} onClick={() => pick(sym)} onMouseEnter={() => { if (!isCompSym) { prefetch(`/data/${sym}.json`); prefetch(`/data/${sym}.slice.json`); prefetch(`/data/${sym}.intel.json`); } }}>
                          {/* F1 flag slot — click to apply lastFlagColor; hover when already set shows palette */}
                          <WlFlagSlot sym={sym} color={flagColor} onSet={(c) => setFlag(sym, c)} onRemove={() => removeFlag(sym)} lastColor={lastFlagColor} />
                          <div className="s">{set.logo && !isCompSym && <span className="ic" style={{ background: r?.col || "#888", width: set.tableView ? 18 : 24, height: set.tableView ? 18 : 24 }}>{sym[0]}</span>}
                            {set.logo && isCompSym && <span className="ic" style={{ background: "#2962ff", width: set.tableView ? 18 : 24, height: set.tableView ? 18 : 24, fontSize: 7, fontWeight: 700, color: "#fff" }}>M</span>}
                            <span className="nm"><span className="tk">{isCompSym ? sym.split("+").slice(0, 2).join("+") + (sym.split("+").length > 2 ? "+…" : "") : primary}</span>{secondary && !isCompSym && <span className={set.tableView ? "tk-sub" : "sub"}>{secondary}</span>}</span></div>
                          {dataCols.map(([k]) => {
                            const isChg = k === "changePct" || k === "change";
                            const isExt = k === "ext";
                            const eq = isExt ? extQuotes[sym] : null;
                            const extUp = eq && eq.extChg != null ? eq.extChg >= 0 : null;
                            const cls = isChg ? (u ? "up" : "down") : isExt && extUp != null ? (extUp ? "up" : "down") : "";
                            return <span key={k} className={`c num ${cls}`}>{colVal(sym, r, k)}</span>;
                          })}
                          <span className="rm" title={t("remove")} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); removeSymbol(sym); }}><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg></span>
                        </SortableWlRow>
                      ); })}
                    </SortableContext>
                  </div>
                ))}
                </DndContext>
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
              {/* item-25: Overnight / extended-hours secondary price block (TV parity).
                  Shown ONLY when market is closed and we have an ext print.
                  Sources in priority order:
                    1. Hub-emitted afterHours field on the live quote (existing leg).
                    2. ext-quote poll result from /api/ext-quote (Yahoo grey fallback).
                  Disappears at market open (mktClosed gate) — TV's "Overnight via BOATS" mechanic.
                  We label by our actual source, never a borrowed brand. */}
              {(() => {
                if (!mktClosed) return null;
                // Prefer hub afterHours print; fall back to ext-quote poll
                const hubExt = ahPrint != null && ahPrint !== officialClose ? {
                  price: ahPrint,
                  chg: ahChg,
                  ts: null as number | null,
                  source: "hub",
                } : null;
                const pollExt = !isComposite(active) && classify(active) === "us"
                  ? extQuotes[active]
                  : null;
                const extData = hubExt ?? (pollExt ? {
                  price: pollExt.extPrice,
                  chg: pollExt.extChg,
                  ts: pollExt.extTs,
                  source: "ext-quote",
                } : null);
                if (!extData) return null;
                const { price, chg, ts } = extData;
                const eu = (chg ?? 0) >= 0;
                const tsStr = ts
                  ? new Date(ts * 1000).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })
                  : null;
                return (
                  <div className="ah-block">
                    <div className="ah-primary">
                      <span className="ah-moon" aria-hidden="true">☾</span>
                      <span className="num ah-price">{fmt(price, price < 10 ? 4 : 2)}</span>
                      <span className="ah-currency">USD</span>
                      {chg != null && (
                        <span className={`num ah-chg ${eu ? "up" : "down"}`}>{eu ? "+" : ""}{fmt(chg)}%</span>
                      )}
                    </div>
                    <div className="ah-meta">
                      <span>{t("overnight")}</span>
                      {tsStr && <span> · {t("extLastUpdate").replace("{time}", tsStr)}</span>}
                    </div>
                  </div>
                );
              })()}
            </div>
            <div className="detail-scroll">
              <div style={{ padding: "12px 12px 0" }}>
                <SignalButton oracle={ov} desk={dv} oracleLabel={t("goldenOracleLbl")} deskLabel={t("researchDeskLbl")} viewLabel={t("signalView")} onView={() => setSignalsOpen(true)} />
                <TrendRow bars={bars} />
              </div>
              {/* Seasonality is injected via beforeIv so it renders BETWEEN the Analyst gauge and Implied
                  Volatility (order: analysis → Seasonality → IV) rather than after the whole card. */}
              <StockAnalysis intel={intel} row={m} fund={fund} opts={opts} bars={bars} onOpenPane={(p) => setPaneOpen(p)} onOpenSignals={() => setSignalsOpen(true)}
                beforeIv={<div style={{ padding: 12 }}><SeasonalityCard symbol={active} onOpenPane={() => setPaneOpen("seasonals")} /></div>} />
              {/* ── bottom button group (after Seasonality): full analysis + Ask AI ── */}
              <div className="sa-btn-group">
                <button className="btn btn-primary" style={{ width: "100%", height: 38 }} onClick={() => setPaneOpen("overview")}>{t("openFullAnalysis")}</button>
                <button className="btn btn-ghost" style={{ width: "100%", height: 36 }} onClick={() => (window as any).MMBrain?.open()}>{t("askAIabout")} {active} →</button>
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

      <SearchModal open={searchOpen} seed={seed} manifest={(man?.symbols as any) || {}} inWatchlist={inWl} mode={searchMode} compare={compare} compareCfg={compareCfg} active={active}
        flags={flags} lastFlagColor={lastFlagColor}
        email={email}
        lists={Object.entries(lists).map(([name, syms]) => ({ name, count: syms.length, symbols: syms }))}
        activeList={activeList}
        onSwitchList={switchList}
        onCreateList={createListNamed}
        onAddToList={addToList}
        onClose={() => { setSearchOpen(false); setSearchMode("go"); }} onPick={onSearchPick} onAdd={addSymbol} onRemove={removeSymbol}
        onToggleCompare={(s: string, mode?: CmpMode) => toggleCompare(s, mode)} />
      {/* F3 Add Symbol dialog — mode="add" with trash+crosshair for members */}
      <SearchModal open={addSymOpen} seed="" manifest={(man?.symbols as any) || {}} inWatchlist={inWl} mode="add" active={active}
        flags={flags} lastFlagColor={lastFlagColor}
        onClose={() => setAddSymOpen(false)} onPick={pick} onAdd={addSymbol} onRemove={removeSymbol}
        onToggleCompare={(s: string, mode?: CmpMode) => toggleCompare(s, mode)} />
      <IndicatorsModal open={indOpen} active={inds} onClose={() => setIndOpen(false)} onToggle={toggleInd}
        scripts={scripts} enabled={enabledSet} onToggleScript={toggleScript} onRenameScript={handleRenameScript} onDeleteScript={handleDeleteScript} />
      {settingsKey && (isCmpKey(settingsKey)
        ? <CompareSettings sym={cmpSymOf(settingsKey)} cfg={compareCfg[cmpSymOf(settingsKey)] || defaultCmpCfg(0)} onChange={(patch) => setCompareCfg((c) => ({ ...c, [cmpSymOf(settingsKey)]: { ...(c[cmpSymOf(settingsKey)] || defaultCmpCfg(0)), ...patch } }))} onClose={() => setSettingsKey(null)} />
        : isPineKey(settingsKey)
          ? <IndicatorSettings indKey="pine" params={{}} onChange={() => {}}
              pine={{ name: scriptById[settingsKey].name, params: mergedParams(scriptById[settingsKey], pineParams) }}
              onPineChange={(patch) => setPineParam(settingsKey, patch)}
              onClose={() => setSettingsKey(null)} />
          : <IndicatorSettings indKey={settingsKey} params={indParams[settingsKey] || {}} onChange={(patch) => setIndParam(settingsKey, patch)} onClose={() => setSettingsKey(null)} onReset={() => resetIndParam(settingsKey)} />)}
      {sourceKey && <IndicatorSource indKey={sourceKey} onClose={() => setSourceKey(null)} />}
      <BrainWidget
        active={active}
        onCommand={handleBrainCommand}
        onAnnotate={(j) => annotateChart(j.symbol || active, j.annotations || [])}
        onAuthRequired={() => window.location.assign("/login")}
      />

      {/* ── Signals dashboard overlay (Golden Oracle scorecard · research read · signal history) ── */}
      {signalsOpen && (
        <OracleDash sym={active} row={m} slice={slice} intel={intel} bars={bars} zh={lang === "zh"} onClose={() => setSignalsOpen(false)} onJump={(ts: string) => { window.dispatchEvent(new CustomEvent("mm:chart-jump", { detail: { ts } })); setSignalsOpen(false); }} onOpenFull={() => { setSignalsOpen(false); setPaneOpen("overview"); }} />
      )}

      {/* ── D2 Save-template-as modal ─── */}
      {tmplSaveOpen && (
        <div className="tmpl-modal-bg" onClick={(e) => { if (e.target === e.currentTarget) setTmplSaveOpen(false); }}>
          <div className="tmpl-modal">
            <h3>{t("tmplSaveAs")}</h3>
            <input
              autoFocus
              placeholder={t("tmplNamePlaceholder")}
              value={tmplSaveName}
              onChange={(e) => { setTmplSaveName(e.target.value); setTmplSaveErr(null); }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (!tmplSaveName.trim()) { setTmplSaveErr(t("tmplNameRequired")); return; }
                  const existing = templates.find((x) => x.name === tmplSaveName.trim());
                  if (existing && !window.confirm(t("tmplOverwriteConfirm"))) return;
                  try {
                    saveTemplate(tmplSaveName.trim(), [...inds], indParams);
                    setTemplates(listTemplates());
                  } catch {}
                  setTmplSaveOpen(false);
                } else if (e.key === "Escape") setTmplSaveOpen(false);
              }}
            />
            {tmplSaveErr && <div style={{ color: "var(--danger)", fontSize: 12, marginBottom: 10 }}>{tmplSaveErr}</div>}
            <div className="tmpl-btns">
              <button className="btn" onClick={() => setTmplSaveOpen(false)}>{t("cancel")}</button>
              <button className="btn btn-primary" onClick={() => {
                if (!tmplSaveName.trim()) { setTmplSaveErr(t("tmplNameRequired")); return; }
                try {
                  saveTemplate(tmplSaveName.trim(), [...inds], indParams);
                  setTemplates(listTemplates());
                } catch {}
                setTmplSaveOpen(false);
              }}>{t("save")}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── D1 "remove all indicators" undo toast ─── */}
      {undoInds && (
        <div className="undo-toast" style={{ position: "fixed", bottom: 22, left: "50%", transform: "translateX(-50%)", background: "var(--panel-3)", border: "1px solid var(--line-3)", borderRadius: "var(--r-md)", padding: "8px 16px", fontSize: 12.5, color: "var(--text)", boxShadow: "0 8px 24px -8px rgba(0,0,0,.7)", zIndex: 50, display: "flex", alignItems: "center", gap: 10 }}>
          {t("allIndicatorsRemoved")}
          <button className="btn" style={{ height: 26, fontSize: 11.5 }} onClick={() => {
            if (undoInds) { clearTimeout(undoInds.timer); setInds(undoInds.snapshot); setUndoInds(null); }
          }}>{t("undo")}</button>
        </div>
      )}

      {/* ── Day Trade Mode brief toast ── (bottom 56 so a pending undo-toast at 22 never overlaps) */}
      {dtmToast && (
        <div className="undo-toast" style={{ position: "fixed", bottom: 56, left: "50%", transform: "translateX(-50%)", background: "var(--panel-3)", border: "1px solid var(--line-3)", borderRadius: "var(--r-md)", padding: "8px 16px", fontSize: 12.5, color: "var(--text)", boxShadow: "0 8px 24px -8px rgba(0,0,0,.7)", zIndex: 50, display: "flex", alignItems: "center", gap: 10 }}>
          {dtmToast}
        </div>
      )}

      {/* Free-tier register nudge — indicator cap / watchlist (anon only) */}
      {gateNudge && (
        <div className="undo-toast" role="status" style={{ position: "fixed", bottom: 96, left: "50%", transform: "translateX(-50%)", background: "var(--panel-3)", border: "1px solid var(--line-3)", borderRadius: "var(--r-md)", padding: "8px 16px", fontSize: 12.5, color: "var(--text)", boxShadow: "0 8px 24px -8px rgba(0,0,0,.7)", zIndex: 51, display: "flex", alignItems: "center", gap: 12 }}>
          <span>{gateNudge}</span>
          <a href="/login" style={{ color: "#4d82ff", fontWeight: 700, textDecoration: "none", whiteSpace: "nowrap" }}>{t("gateSignupCta")}</a>
        </div>
      )}

    </div>
    </OnboardingProvider>
  );
}

// ── F1 watchlist flag slot ─────────────────────────────────────────────────────
// A 4px wide left-edge band per row. Click unflagged → apply lastColor. Click flagged → toggle palette pop (re-click or click-outside to close).
// Note: useState/useEffect/useRef are already imported at the top of this module — reuse them directly.
function WlFlagSlot({ color, onSet, onRemove, lastColor }: { sym: string; color?: string; onSet: (c: string) => void; onRemove: () => void; lastColor: string }) {
  const [popOpen, setPopOpen] = useState(false);
  const t = useT();
  const PAL = FLAG_COLORS;
  // Click-outside: attach a window-level listener while the pop is open; the pop
  // itself calls e.stopPropagation() so clicks inside never reach this handler.
  useEffect(() => {
    if (!popOpen) return;
    const h = () => setPopOpen(false);
    window.addEventListener("click", h);
    return () => window.removeEventListener("click", h);
  }, [popOpen]);
  if (color) {
    return (
      <span
        className="wl-flag-slot wl-flag-slot--set"
        style={{ background: color }}
        title={t("flagSetColor")}
        onClick={(e) => { e.stopPropagation(); setPopOpen((v) => !v); }}
      >
        {popOpen && (
          <span className="wl-flag-pop" onClick={(e) => e.stopPropagation()}>
            {PAL.map((c) => (
              <span
                key={c}
                className={`wl-flag-dot${c === color ? " wl-flag-dot--sel" : ""}`}
                style={{ background: c, color: c }}
                onClick={(e) => { e.stopPropagation(); onSet(c); setPopOpen(false); }}
              />
            ))}
            <span className="wl-flag-rm" title={t("flagRemove")} onClick={(e) => { e.stopPropagation(); onRemove(); setPopOpen(false); }}>
              <svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></svg>
            </span>
          </span>
        )}
      </span>
    );
  }
  return (
    <span
      className="wl-flag-slot wl-flag-slot--empty"
      title={t("flagAdd")}
      onClick={(e) => { e.stopPropagation(); onSet(lastColor); }}
    />
  );
}
