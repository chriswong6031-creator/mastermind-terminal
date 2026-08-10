"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ChartPanel, { type DetectCmd, type LiveQuote, type PineScript } from "@/components/ChartPanel";
import ChartFrameBar, { DEFAULT_CHART_SETTINGS, type ChartSettings } from "@/components/ChartFrameBar";
import ChartSettingsModal from "@/components/ChartSettingsModal";
import { type Drawing } from "@/lib/drawings";
import { type CmpCfg } from "@/lib/compare";
import { type IChartApi } from "lightweight-charts";
import { classify, isIntradayTf } from "@/lib/intradaySources";
import AssetLogo from "@/components/AssetLogo";

const f = (n: number | null | undefined, d = 2) => (n == null || !isFinite(n) ? "—" : n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }));

const SETTINGS_KEY = "mm.chartSettings";
const load = (d: ChartSettings): ChartSettings => { try { const v = localStorage.getItem(SETTINGS_KEY); return v ? { ...d, ...JSON.parse(v) } : d; } catch { return d; } };

// One pane of the chart grid. Hand-drawn drawings are owned by TerminalShell (a shared per-symbol
// store) so multiple panes on the same symbol (an MTF layout) share one set. Auto-DETECTED drawings,
// by contrast, are computed against THIS pane's timeframe and are transient (never persisted), so they
// stay pane-local and are merged in only for this pane's own render.
export default function ChartPane({ idx, symbol, isActive, onActivate, row, tf, chartType, inds, tool, drawStyle, detectCmd, compare, compareCfg, magnet, replayIdx, onMeta, drawings, onDrawingsChange, liveQuote, indParams, hidden, onToggleHidden, onRemoveInd, onOpenSettings, onOpenSource, pineScripts,
  onAddAlert, onTableView, onObjectTree, lockedVLine, onSetLockedVLine, onIndRowsAt, dayMode: _dayMode }:
  { idx: number; symbol: string; isActive: boolean; onActivate: (i: number) => void; row?: { name?: string; zh?: string; sec?: string; mkt?: string; col?: string; last?: number; chg?: number } | null; tf: string; chartType: string; inds: Set<string>; tool: string | null; drawStyle?: { color: string; width: number; dash: "solid" | "dashed" | "dotted" }; detectCmd: DetectCmd; compare: string[]; compareCfg?: Record<string, CmpCfg>; magnet: boolean; replayIdx: number | null; onMeta: (m: { total: number }) => void; drawings: Drawing[]; onDrawingsChange: (d: Drawing[]) => void; liveQuote?: LiveQuote;
    indParams?: Record<string, any>; hidden?: Set<string>; onToggleHidden?: (key: string) => void; onRemoveInd?: (key: string) => void; onOpenSettings?: (key: string) => void; onOpenSource?: (key: string) => void; pineScripts?: PineScript[];
    onAddAlert?: (price: number) => void; onTableView?: () => void; onObjectTree?: () => void;
    lockedVLine?: string | null; onSetLockedVLine?: (t: string | null) => void;
    onIndRowsAt?: (fn: ((barTime: string | number) => Record<string, number | null>) | null) => void;
    /** Day Trade Mode — enables session shading, countdown, and stats strip (C lane wires the impl). */
    dayMode?: boolean;
  }) {
  const [auto, setAuto] = useState<Drawing[]>([]);
  const [chartSettings, setChartSettings] = useState<ChartSettings>(DEFAULT_CHART_SETTINGS);
  const [chartApi, setChartApi] = useState<IChartApi | null>(null);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [settingsModalTab, setSettingsModalTab] = useState<"symbol" | "status" | "scales" | "canvas" | "alerts" | "events">("scales");

  // Load persisted chart settings on mount
  useEffect(() => { setChartSettings(load(DEFAULT_CHART_SETTINGS)); }, []);
  // Listen for tab-switch events dispatched by ChartSettingsModal tab buttons
  useEffect(() => {
    const h = (e: Event) => {
      const tab = (e as CustomEvent).detail as string;
      if (["symbol", "status", "scales", "canvas", "alerts", "events"].includes(tab)) {
        setSettingsModalTab(tab as any);
      }
    };
    window.addEventListener("mm:settings-tab", h);
    return () => window.removeEventListener("mm:settings-tab", h);
  }, []);
  // Persist chart settings on change (skip initial mount)
  const settingsMounted = useRef(false);
  useEffect(() => {
    if (!settingsMounted.current) { settingsMounted.current = true; return; }
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(chartSettings)); } catch {}
  }, [chartSettings]);

  const patchSettings = useCallback((patch: Partial<ChartSettings>) => {
    setChartSettings((s) => ({ ...s, ...patch }));
  }, []);

  // Day Trade Mode: listen for mm:set-eth events dispatched by TerminalShell (D lane §5b interface contract).
  useEffect(() => {
    const h = (e: Event) => {
      const on = !!(e as CustomEvent).detail?.on;
      patchSettings({ extHours: on });
    };
    window.addEventListener("mm:set-eth", h);
    return () => window.removeEventListener("mm:set-eth", h);
  }, [patchSettings]);

  useEffect(() => { setAuto([]); }, [symbol, tf]);   // detection is timeframe-specific — reset on change
  const merged = useMemo(() => (auto.length ? [...drawings, ...auto] : drawings), [drawings, auto]);
  const handleChange = useCallback((d: Drawing[]) => {
    const hand: Drawing[] = [], au: Drawing[] = [];
    for (const x of d) (x.auto ? au : hand).push(x);
    setAuto(au);
    // only push hand-drawn changes to the shared store; skip the redundant write/PUT when only auto changed
    const sameHand = hand.length === drawings.length && hand.every((x, i) => x === drawings[i]);
    if (!sameHand) onDrawingsChange(hand);
  }, [drawings, onDrawingsChange]);
  const up = (row?.chg ?? 0) >= 0;
  const market = classify(symbol);
  const marketLabel = row?.mkt || (market === "us" && row?.sec === "Equities" ? "US Equities" : row?.sec);
  const extendedEligible = market === "us";
  const effectiveExtHours = extendedEligible && isIntradayTf(tf) && chartSettings.extHours;

  // ChartPanel consumes the same persisted schema as the modal. Keeping one object here means newly
  // added settings have storage and rendering infrastructure without another hand-maintained bridge.
  const panelSettings = useMemo(() => ({ ...chartSettings }), [chartSettings]);

  return (
    <div className={`pane${isActive ? " on" : ""}`} onPointerDownCapture={() => { if (!isActive) onActivate(idx); }}>
      <div className="pane-hd">
        <AssetLogo className="pic" symbol={symbol} name={row?.zh || row?.name} market={marketLabel} color={row?.col} size={18} />
        <b>{row?.zh || row?.name || symbol}</b>
        <span className="pane-tf">{tf}</span>
        <span className="px num">{f(row?.last, (row?.last ?? 99) < 10 ? 4 : 2)}</span>
        <span className={`cg num ${up ? "up" : "down"}`}>{up ? "+" : ""}{f(row?.chg)}%</span>
      </div>
      <ChartPanel
        symbol={symbol} chartType={chartType} indicators={inds} timeframe={tf}
        replayIdx={isActive ? replayIdx : null} onMeta={isActive ? onMeta : undefined}
        tool={isActive ? tool : null} drawStyle={drawStyle} drawings={merged}
        onDrawingsChange={handleChange} detectCmd={isActive ? detectCmd : null}
        compare={isActive ? compare.filter((c) => c !== symbol) : []} compareCfg={compareCfg}
        magnet={isActive ? magnet : false} isActive={isActive} syncId={idx}
        liveQuote={liveQuote} indParams={indParams} hidden={hidden}
        instrumentName={row?.zh || row?.name}
        instrumentMarket={marketLabel}
        instrumentColor={row?.col}
        onToggleHidden={onToggleHidden} onRemoveInd={onRemoveInd}
        onOpenSettings={onOpenSettings} onOpenSource={onOpenSource}
        pineScripts={pineScripts}
        chartSettings={panelSettings}
        onChartApi={setChartApi}
        extHours={effectiveExtHours}
        key={symbol}
        onAddAlert={isActive ? onAddAlert : undefined}
        onTableView={isActive ? onTableView : undefined}
        onObjectTree={isActive ? onObjectTree : undefined}
        onOpenSettingsModal={(tab) => { if (tab) setSettingsModalTab(tab as any); setSettingsModalOpen(true); }}
        lockedVLine={lockedVLine}
        onSetLockedVLine={onSetLockedVLine}
        onIndRowsAt={isActive ? onIndRowsAt : undefined}
        dayMode={_dayMode}
      />
      <ChartFrameBar
        timeframe={tf}
        chartApi={chartApi}
        settings={chartSettings}
        onSettings={patchSettings}
        extendedEligible={extendedEligible}
        onOpenSettingsModal={(tab) => {
          if (tab) setSettingsModalTab(tab as any);
          setSettingsModalOpen(true);
        }}
      />
      <ChartSettingsModal
        open={settingsModalOpen}
        tab={settingsModalTab}
        settings={chartSettings}
        onSettings={patchSettings}
        onClose={() => setSettingsModalOpen(false)}
        chartApi={chartApi}
        extendedEligible={extendedEligible}
        intraday={isIntradayTf(tf)}
      />
    </div>
  );
}
