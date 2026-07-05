"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import ChartPanel, { type DetectCmd, type LiveQuote } from "@/components/ChartPanel";
import { type Drawing } from "@/lib/drawings";

const f = (n: number | null | undefined, d = 2) => (n == null || !isFinite(n) ? "—" : n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }));

// One pane of the chart grid. Hand-drawn drawings are owned by TerminalShell (a shared per-symbol
// store) so multiple panes on the same symbol (an MTF layout) share one set. Auto-DETECTED drawings,
// by contrast, are computed against THIS pane's timeframe and are transient (never persisted), so they
// stay pane-local and are merged in only for this pane's own render.
export default function ChartPane({ idx, symbol, isActive, onActivate, row, tf, chartType, inds, tool, drawStyle, detectCmd, compare, magnet, replayIdx, onMeta, drawings, onDrawingsChange, liveQuote, indParams, hidden, onToggleHidden, onRemoveInd, onOpenSettings, onOpenSource }:
  { idx: number; symbol: string; isActive: boolean; onActivate: (i: number) => void; row?: { col?: string; last?: number; chg?: number } | null; tf: string; chartType: string; inds: Set<string>; tool: string | null; drawStyle?: { color: string; width: number; dash: "solid" | "dashed" | "dotted" }; detectCmd: DetectCmd; compare: string[]; magnet: boolean; replayIdx: number | null; onMeta: (m: { total: number }) => void; drawings: Drawing[]; onDrawingsChange: (d: Drawing[]) => void; liveQuote?: LiveQuote;
    indParams?: Record<string, any>; hidden?: Set<string>; onToggleHidden?: (key: string) => void; onRemoveInd?: (key: string) => void; onOpenSettings?: (key: string) => void; onOpenSource?: (key: string) => void }) {
  const [auto, setAuto] = useState<Drawing[]>([]);
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
  return (
    <div className={`pane${isActive ? " on" : ""}`} onPointerDownCapture={() => { if (!isActive) onActivate(idx); }}>
      <div className="pane-hd">
        <span className="pic" style={{ background: row?.col || "#888" }}>{symbol[0]}</span>
        <b>{symbol}</b>
        <span className="pane-tf">{tf}</span>
        <span className="px num">{f(row?.last, (row?.last ?? 99) < 10 ? 4 : 2)}</span>
        <span className={`cg num ${up ? "up" : "down"}`}>{up ? "+" : ""}{f(row?.chg)}%</span>
      </div>
      <ChartPanel symbol={symbol} chartType={chartType} indicators={inds} timeframe={tf} replayIdx={isActive ? replayIdx : null} onMeta={isActive ? onMeta : undefined} tool={isActive ? tool : null} drawStyle={drawStyle} drawings={merged} onDrawingsChange={handleChange} detectCmd={isActive ? detectCmd : null} compare={isActive ? compare.filter((c) => c !== symbol) : []} magnet={isActive ? magnet : false} isActive={isActive} syncId={idx} liveQuote={liveQuote} indParams={indParams} hidden={hidden} onToggleHidden={onToggleHidden} onRemoveInd={onRemoveInd} onOpenSettings={onOpenSettings} onOpenSource={onOpenSource} key={symbol + tf + chartType} />
    </div>
  );
}
