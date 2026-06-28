"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import ChartPanel, { type DetectCmd } from "@/components/ChartPanel";
import { type Drawing } from "@/lib/drawings";

const f = (n: number | null | undefined, d = 2) => (n == null || !isFinite(n) ? "—" : n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }));

// One pane of the chart grid. Each pane owns its symbol's drawings (load + debounced
// save with the same stale-GET / flush-on-switch guards as the single-chart path).
export default function ChartPane({ idx, symbol, isActive, onActivate, row, tf, chartType, inds, tool, detectCmd, compare, magnet, replayIdx, onMeta }:
  { idx: number; symbol: string; isActive: boolean; onActivate: (i: number) => void; row?: { col?: string; last?: number; chg?: number } | null; tf: string; chartType: string; inds: Set<string>; tool: string | null; detectCmd: DetectCmd; compare: string[]; magnet: boolean; replayIdx: number | null; onMeta: (m: { total: number }) => void }) {
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const saveT = useRef<any>(null);
  const pending = useRef<{ sym: string; drawings: Drawing[] } | null>(null);
  const flush = useCallback(() => { clearTimeout(saveT.current); const p = pending.current; if (p) { pending.current = null; fetch("/api/drawings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbol: p.sym, drawings: p.drawings }) }).catch(() => {}); } }, []);
  useEffect(() => { let alive = true; setDrawings([]); fetch(`/api/drawings?symbol=${symbol}`).then((r) => r.json()).then((d) => { if (alive && pending.current === null) setDrawings(d.drawings || []); }).catch(() => {}); return () => { alive = false; flush(); }; }, [symbol, flush]);
  const onChange = useCallback((d: Drawing[]) => { setDrawings(d); pending.current = { sym: symbol, drawings: d }; clearTimeout(saveT.current); saveT.current = setTimeout(flush, 600); }, [symbol, flush]);
  const up = (row?.chg ?? 0) >= 0;
  return (
    <div className={`pane${isActive ? " on" : ""}`} onPointerDownCapture={() => { if (!isActive) onActivate(idx); }}>
      <div className="pane-hd">
        <span className="pic" style={{ background: row?.col || "#888" }}>{symbol[0]}</span>
        <b>{symbol}</b>
        <span className="px num">{f(row?.last, (row?.last ?? 99) < 10 ? 4 : 2)}</span>
        <span className={`cg num ${up ? "up" : "down"}`}>{up ? "+" : ""}{f(row?.chg)}%</span>
      </div>
      <ChartPanel symbol={symbol} chartType={chartType} indicators={inds} timeframe={tf} replayIdx={isActive ? replayIdx : null} onMeta={isActive ? onMeta : undefined} tool={isActive ? tool : null} drawings={drawings} onDrawingsChange={onChange} detectCmd={isActive ? detectCmd : null} compare={isActive ? compare.filter((c) => c !== symbol) : []} magnet={isActive ? magnet : false} isActive={isActive} syncId={idx} key={symbol + tf + chartType} />
    </div>
  );
}
