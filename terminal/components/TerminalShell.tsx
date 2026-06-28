"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BrandLockup } from "@/components/BrandMark";
import { AppNav } from "@/components/AppNav";
import { type DetectCmd } from "@/components/ChartPanel";
import ChartPane from "@/components/ChartPane";
import StrategyTester from "@/components/StrategyTester";
import SearchModal from "@/components/SearchModal";
import IndicatorsModal from "@/components/IndicatorsModal";
import CopilotPanel from "@/components/CopilotPanel";
import SeasonalityCard from "@/components/SeasonalityCard";
import { useLive } from "@/lib/live";

type Row = { name: string; sec: string; col: string; last: number; chg: number; open: number; high: number; low: number; vol: number; hi52: number; lo52: number; verdict: string | null; wr: number | null; pf: number | null; cagr: number | null; regimeBull: boolean | null };
type Manifest = { as_of: string | null; symbols: Record<string, Row> };

const fmt = (n: number | null | undefined, d = 2) => (n == null || !isFinite(n) ? "—" : n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }));
const vol = (v: number) => (v >= 1e9 ? (v / 1e9).toFixed(2) + "B" : v >= 1e6 ? (v / 1e6).toFixed(1) + "M" : String(v));
const isBuy = (v: string | null) => v === "BUY" || v === "REBUY";
const CHART_TYPES = [["candles", "Candles"], ["heikin", "Heikin Ashi"], ["bars", "Bars"], ["line", "Line"], ["area", "Area"]];
const TF_GROUPS: [string, string[]][] = [["Minutes", ["1m", "5m", "15m", "30m"]], ["Hours", ["1h", "2h", "4h"]], ["Days", ["D", "3D"]], ["Weeks", ["W", "2W"]], ["Months", ["1M", "3M"]]];
const FUNCTIONAL = new Set(["D", "3D", "W", "1M"]);
const load = (k: string, d: any) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };

// drawing tools for the (previously decorative) left dock
const TOOLS: [string, string][] = [
  ["cursor", "M12 2v20M2 12h20"], ["trendline", "M4 20L20 4"], ["ray", "M4 20L20 4M15 4h5v5"],
  ["hline", "M3 12h18"], ["rect", "M4 6h16v12H4z"], ["fib", "M3 5h18M3 9h18M3 15h18M3 19h18"],
  ["text", "M5 5h14M12 5v14"], ["measure", "M3 9h18v6H3zM7 9v6M11 9v6M15 9v6"], ["arrow", "M5 19L19 5M13 5h6v6"], ["vline", "M12 3v18"], ["erase", "M5 7h14M9 7V5h6v2M7 7l1 13h8l1-13"],
];
const DETECTORS: [string, string][] = [
  ["trendlines", "Auto trendlines"], ["fib", "Auto Fibonacci"], ["sr", "S/R strength heatmap"], ["mtfa", "Multi-timeframe S/R"], ["clear", "Clear detected"],
];
const CMP_COLORS = ["#e8a33d", "#9d86ff", "#19c2c2", "#f06bd0"];

export default function TerminalShell({ symbols, email, initialSymbol }: { symbols: { symbol: string; section: string }[]; email: string; initialSymbol?: string }) {
  const [man, setMan] = useState<Manifest | null>(null);
  const [wl, setWl] = useState(symbols);
  const seed0 = initialSymbol || symbols.find((s) => s.symbol === "NVDA")?.symbol || symbols[0]?.symbol || "NVDA";
  const [panes, setPanes] = useState<string[]>([seed0]);
  const [activePane, setActivePane] = useState(0);
  const active = panes[activePane] ?? panes[0] ?? seed0;
  const [tf, setTf] = useState("D");
  const [chartType, setChartType] = useState("candles");
  const [inds, setInds] = useState<Set<string>>(new Set(["ema", "rsi", "stochrsi"]));
  const [favTF, setFavTF] = useState<string[]>(["D", "3D", "W", "1M"]);
  const [set, setSet] = useState({ tableView: false, cols: { last: true, changePct: true, change: false, volume: false }, disp: "symbol", logo: true });
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
  const [slice, setSlice] = useState<any>(null);
  const [magnet, setMagnet] = useState(false);
  const [compare, setCompare] = useState<string[]>([]);
  const [searchMode, setSearchMode] = useState<"go" | "compare">("go");
  const nonce = useRef(0);

  useEffect(() => { fetch("/data/manifest.json").then((r) => r.json()).then(setMan).catch(() => {}); }, []);
  useEffect(() => { setInds(new Set(load("mm.inds", ["ema", "rsi", "stochrsi"]))); setChartType(load("mm.ct", "candles")); setTf(load("mm.tf", "D")); setFavTF(load("mm.favtf", ["D", "3D", "W", "1M"])); setSet(load("mm.set", { tableView: false, cols: { last: true, changePct: true, change: false, volume: false }, disp: "symbol", logo: true })); }, []);
  useEffect(() => { localStorage.setItem("mm.inds", JSON.stringify([...inds])); }, [inds]);
  useEffect(() => { localStorage.setItem("mm.ct", JSON.stringify(chartType)); }, [chartType]);
  useEffect(() => { localStorage.setItem("mm.tf", JSON.stringify(tf)); }, [tf]);
  useEffect(() => { localStorage.setItem("mm.favtf", JSON.stringify(favTF)); }, [favTF]);
  useEffect(() => { localStorage.setItem("mm.set", JSON.stringify(set)); }, [set]);

  // per-symbol intel/slice for the rail (drawings now live per-pane in ChartPane); layouts once
  useEffect(() => { let alive = true; setIntel(null); setLivePx(null); setSlice(null);
    fetch(`/data/${active}.intel.json`).then((r) => (r.ok ? r.json() : null)).then((d) => { if (alive) setIntel(d); }).catch(() => {});
    fetch(`/data/${active}.slice.json`).then((r) => (r.ok ? r.json() : null)).then((d) => { if (alive) setSlice(d); }).catch(() => {});
    return () => { alive = false; };   // ignore a stale GET for the prior symbol
  }, [active]);
  useEffect(() => { fetch("/api/layouts").then((r) => r.json()).then((d) => setLayouts(d.layouts || [])).catch(() => {}); }, []);
  useEffect(() => { const open = () => setCopilot(true); window.addEventListener("mm:copilot", open); try { if (new URLSearchParams(window.location.search).get("ai") === "1") setCopilot(true); } catch {} return () => window.removeEventListener("mm:copilot", open); }, []);

  const detect = (kind: any) => { setDetectCmd({ kind, nonce: ++nonce.current }); setDetectOpen(false); };
  function setGrid(n: number) {
    setPanes((p) => {
      if (n <= p.length) return p.slice(0, n);
      const used = new Set(p); const extra: string[] = [];
      for (const s of wl.map((x) => x.symbol)) { if (extra.length >= n - p.length) break; if (!used.has(s)) { extra.push(s); used.add(s); } }
      while (extra.length < n - p.length) extra.push(p[p.length - 1] || seed0);
      return [...p, ...extra];
    });
    setActivePane((a) => Math.min(a, n - 1));
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

  useEffect(() => {
    clearInterval(playRef.current);
    if (replayOn && playing && total) {
      playRef.current = setInterval(() => setReplayIdx((i) => { const n = (i ?? 0) + 1; if (n >= total - 1) { setPlaying(false); return total - 1; } return n; }), 700 / speed);
    }
    return () => clearInterval(playRef.current);
  }, [replayOn, playing, total, speed]);

  const closeAll = () => { setWlSetOpen(false); setTfOpen(false); setCtOpen(false); setDetectOpen(false); setLayoutOpen(false); };
  useEffect(() => { const h = () => closeAll(); window.addEventListener("click", h); return () => window.removeEventListener("click", h); }, []);

  const sections = useMemo(() => { const o: Record<string, string[]> = {}; wl.forEach((s) => { (o[s.section] ||= []).push(s.symbol); }); return o; }, [wl]);
  const inWl = useMemo(() => new Set(wl.map((s) => s.symbol)), [wl]);
  const m = man?.symbols?.[active];
  const buy = isBuy(m?.verdict ?? null);
  const lastPx = livePx ?? m?.last;

  async function addSymbol(sym: string) {
    const sec = man?.symbols?.[sym]?.sec || "Watchlist";
    if (!inWl.has(sym)) { setWl((w) => [...w, { symbol: sym, section: sec }]); await fetch("/api/watchlist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "add", symbol: sym, section: sec }) }); }
  }
  async function removeSymbol(sym: string) { setWl((w) => w.filter((s) => s.symbol !== sym)); await fetch("/api/watchlist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "remove", symbol: sym }) }); }
  const toggleInd = (k: string) => setInds((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const pick = (sym: string) => { setPanes((p) => p.map((s, i) => (i === activePane ? sym : s))); setReplayOn(false); setReplayIdx(null); setPlaying(false); setCompare([]); };
  const onSearchPick = (sym: string) => { if (searchMode === "compare") { if (sym !== active) setCompare((c) => (c.includes(sym) ? c : [...c, sym].slice(0, 4))); } else pick(sym); };

  function saveLayout() { const name = layoutName.trim() || `Layout ${layouts.length + 1}`; const config = { panes, activePane, tf, chartType, inds: [...inds], favTF, compare }; fetch("/api/layouts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, config }) }).then(() => fetch("/api/layouts").then((r) => r.json()).then((d) => setLayouts(d.layouts || []))); setLayoutName(""); }
  function loadLayout(l: any) { const c = l.config || {}; if (c.tf) setTf(c.tf); if (c.chartType) setChartType(c.chartType); if (c.inds) setInds(new Set(c.inds)); if (c.favTF) setFavTF(c.favTF); if (Array.isArray(c.compare)) setCompare(c.compare); if (Array.isArray(c.panes) && c.panes.length) { setPanes(c.panes); setActivePane(Math.min(c.activePane || 0, c.panes.length - 1)); } else if (c.active) { setPanes([c.active]); setActivePane(0); } setLayoutOpen(false); }
  function delLayout(id: string) { fetch(`/api/layouts?id=${id}`, { method: "DELETE" }).then(() => setLayouts((ls) => ls.filter((x) => x.id !== id))); }

  const colList = () => { const a: [string, string][] = [["last", "Last"]]; if (set.cols.change) a.push(["change", "Chg"]); if (set.cols.changePct) a.push(["changePct", "Chg%"]); if (set.cols.volume) a.push(["volume", "Vol"]); return a; };
  const colVal = (r: Row | undefined, key: string) => { if (!r) return "—"; const u = r.chg >= 0; if (key === "last") return fmt(r.last, r.last < 10 ? 4 : 2); if (key === "change") return (u ? "+" : "") + fmt(r.last * r.chg / 100, 2); if (key === "changePct") return (u ? "+" : "") + fmt(r.chg) + "%"; if (key === "volume") return vol(r.vol); return ""; };
  const wlGrid = `1fr ${colList().map(() => "1fr").join(" ")} 18px`;

  const ic = intel?.cards || {}; const itape = intel?.tape || {};
  const intelDir = (itape.ai_lean?.dir || "").toUpperCase();

  return (
    <div className="app">
      <header className="topbar">
        <BrandLockup />
        <div className="tdiv" />
        <div className="pair" onClick={() => { setSeed(""); setSearchOpen(true); }}><span className="dual"><i>{active[0]}</i><i>$</i></span><b>{active}</b>
          <svg className="car" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" /></svg></div>
        <div className="stats">
          <div className="stat"><span className="l">Last Price</span><span className="v big num">{fmt(lastPx, m && lastPx != null && lastPx < 10 ? 4 : 2)}</span></div>
          <div className="stat"><span className="l">24h Change</span><span className={`v num ${(m?.chg ?? 0) >= 0 ? "up" : "down"}`}>{(m?.chg ?? 0) >= 0 ? "+" : ""}{fmt(m?.chg)}%</span></div>
          <div className="stat"><span className="l">Volume</span><span className="v num">{m ? vol(m.vol) : "—"}</span></div>
          <div className="stat"><span className="l">Day High</span><span className="v num">{fmt(m?.high, m && m.last < 10 ? 4 : 2)}</span></div>
          <div className="stat"><span className="l">Day Low</span><span className="v num">{fmt(m?.low, m && m.last < 10 ? 4 : 2)}</span></div>
        </div>
        <span className={`livebadge${liveStatus === "live" ? " live" : ""}`} style={{ marginLeft: 16 }} title="Live feed activates with a real-time Polygon key (NEXT_PUBLIC_LIVE=1)"><i />{liveStatus === "live" ? "Live" : "Historical"}</span>
        <div className="spacer" />
        <button className="ai" onClick={() => setCopilot(true)}><svg viewBox="0 0 24 24"><path d="M12 2l2.2 5.8L20 10l-5.8 2.2L12 18l-2.2-5.8L4 10l5.8-2.2z" /></svg>Mastermind AI</button>
        <form action="/auth/signout" method="post"><button className="avatar" title={`${email} · sign out`}>{(email || "U")[0].toUpperCase()}</button></form>
      </header>

      <AppNav />

      <section className="workspace">
        <div className="chart-tabs">
          <div className={`ct${view === "price" ? " on" : ""}`} onClick={() => setView("price")}>Price chart</div>
          <div className={`ct${view === "strategy" ? " on" : ""}`} onClick={() => setView("strategy")}>Strategy tester</div>
          <div className="tools">
            <div className="seg pophost">
              {favTF.map((t) => <button key={t} className={tf === t ? "on" : ""} disabled={!FUNCTIONAL.has(t)} style={!FUNCTIONAL.has(t) ? { opacity: .4 } : {}} onClick={() => FUNCTIONAL.has(t) && setTf(t)}>{t}</button>)}
              <button onClick={(e) => { e.stopPropagation(); closeAll(); setTfOpen((o) => !o); }} style={{ padding: "0 6px" }}>▾</button>
              <div className={`tfgrid${tfOpen ? " show" : ""}`} onClick={(e) => e.stopPropagation()}>
                {TF_GROUPS.map(([g, items]) => (<div key={g}><div className="g">{g}</div>{items.map((t) => { const fn = FUNCTIONAL.has(t); const fav = favTF.includes(t);
                  return <div key={t} className={`it${tf === t ? " on" : ""}${fn ? "" : " dis"}`} onClick={() => { if (fn) { setTf(t); setTfOpen(false); } }}>
                    <span>{t}{!fn && <span style={{ color: "var(--text-dim)", marginLeft: 6, fontSize: 10 }}>live feed</span>}</span>
                    <span className={`fav${fav ? " on" : ""}`} onClick={(e) => { e.stopPropagation(); setFavTF((f) => f.includes(t) ? f.filter((x) => x !== t) : [...f, t]); }}><svg viewBox="0 0 24 24"><path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z" /></svg></span>
                  </div>; })}</div>))}
              </div>
            </div>
            <div className="pophost">
              <button className="tbtn" onClick={(e) => { e.stopPropagation(); closeAll(); setCtOpen((o) => !o); }}><svg viewBox="0 0 24 24"><path d="M6 4v16M6 8h3M14 4v16M14 9h3" /></svg>{CHART_TYPES.find((c) => c[0] === chartType)![1]}<span style={{ color: "var(--muted)" }}>▾</span></button>
              <div className={`pop${ctOpen ? " show" : ""}`} style={{ top: 32, left: 0 }} onClick={(e) => e.stopPropagation()}>
                {CHART_TYPES.map(([k, l]) => <div key={k} className="set-row" style={chartType === k ? { color: "var(--brand-2)" } : {}} onClick={() => { setChartType(k); setCtOpen(false); }}>{l}</div>)}
              </div>
            </div>
            <button className="tbtn" onClick={() => setIndOpen(true)}><svg viewBox="0 0 24 24" style={{ strokeWidth: 2 }}><path d="M5 12h14M12 5v14" /></svg>Indicators</button>
            <button className="tbtn" onClick={() => { setSearchMode("compare"); setSeed(""); setSearchOpen(true); }}><svg viewBox="0 0 24 24"><path d="M4 18l5-9 4 5 3-4 4 8" /></svg>Compare</button>
            <div className="seg" title="Split layout">{[1, 2, 4].map((n) => <button key={n} className={panes.length === n ? "on" : ""} onClick={() => setGrid(n)}>{n}</button>)}</div>
            <div className="pophost">
              <button className="tbtn" onClick={(e) => { e.stopPropagation(); closeAll(); setDetectOpen((o) => !o); }}><svg viewBox="0 0 24 24"><path d="M3 17l5-5 4 4 8-8" /></svg>Detect<span style={{ color: "var(--muted)" }}>▾</span></button>
              <div className={`pop${detectOpen ? " show" : ""}`} style={{ top: 32, left: 0, minWidth: 200 }} onClick={(e) => e.stopPropagation()}>
                {DETECTORS.map(([k, l]) => <div key={k} className="menu-row" onClick={() => detect(k)}><svg viewBox="0 0 24 24"><path d="M3 17l5-5 4 4 8-8" /></svg>{l}</div>)}
              </div>
            </div>
            <div className="pophost">
              <button className="tbtn" onClick={(e) => { e.stopPropagation(); closeAll(); setLayoutOpen((o) => !o); }}><svg viewBox="0 0 24 24"><path d="M4 5h16v14H4zM4 9h16M9 9v10" /></svg>Layouts<span style={{ color: "var(--muted)" }}>▾</span></button>
              <div className={`pop${layoutOpen ? " show" : ""}`} style={{ top: 32, right: 0, minWidth: 230 }} onClick={(e) => e.stopPropagation()}>
                <div className="menu-save"><input placeholder="Save current as…" value={layoutName} onChange={(e) => setLayoutName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") saveLayout(); }} /><button onClick={saveLayout}>Save</button></div>
                {layouts.length === 0 && <div className="menu-row" style={{ color: "var(--text-dim)" }}>No saved layouts</div>}
                {layouts.map((l) => <div key={l.id} className="menu-row" onClick={() => loadLayout(l)}>{l.name}<span className="rm" onClick={(e) => { e.stopPropagation(); delLayout(l.id); }}><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg></span></div>)}
              </div>
            </div>
            <button className="icbtn" title="Snapshot" onClick={() => window.dispatchEvent(new CustomEvent("mm:snapshot"))}><svg viewBox="0 0 24 24"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg></button>
          </div>
        </div>

        {view === "price" && compare.filter((c) => c !== active).length > 0 && (
          <div className="cmp-strip">
            <span className="cmp-lbl">Compare</span>
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
              {TOOLS.map(([id, d], i) => (
                <button key={id} className={(tool === id || (id === "cursor" && !tool)) ? "on" : ""} title={id} onClick={() => setTool(id === "cursor" ? null : id)}><svg viewBox="0 0 24 24"><path d={d} /></svg></button>
              ))}
              <button className={magnet ? "on" : ""} title="Magnet — snap to OHLC" onClick={() => setMagnet((mg) => !mg)}><svg viewBox="0 0 24 24"><path d="M6 4v7a6 6 0 0 0 12 0V4h-4v7a2 2 0 0 1-4 0V4z" /></svg></button>
              <div className="sp" />
              <button title="Clear detected" onClick={() => detect("clear")}><svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></svg></button>
            </div>
            <div className="pane-grid" data-n={panes.length}>
              {panes.map((sym, i) => (
                <ChartPane key={i} idx={i} symbol={sym} isActive={i === activePane} onActivate={setActivePane} row={man?.symbols?.[sym]} tf={tf} chartType={chartType} inds={inds} tool={tool} detectCmd={detectCmd} compare={compare} magnet={magnet} replayIdx={replayOn ? replayIdx : null} onMeta={(mm) => setTotal(mm.total)} />
              ))}
            </div>
          </div>
        ) : (
          <StrategyTester symbol={active} key={"strat" + active} />
        )}
      </section>

      <aside className="rail">
        <div className="rail-body">
          <div className="board wl-board">
            <div className="wl-bar pophost">
              <button className="wl-select">Default <svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" /></svg></button>
              <div className="wl-acts">
                <button title="Add symbol" onClick={(e) => { e.stopPropagation(); setSeed(""); setSearchOpen(true); }}><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg></button>
                <button title="Settings" onClick={(e) => { e.stopPropagation(); closeAll(); setWlSetOpen((o) => !o); }}><svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></svg></button>
              </div>
              <div className={`pop${wlSetOpen ? " show" : ""}`} style={{ top: 40, right: 6 }} onClick={(e) => e.stopPropagation()}>
                <div className="set-h"><b>Table view</b><span className={`switch${set.tableView ? " on" : ""}`} onClick={() => setSet((s) => ({ ...s, tableView: !s.tableView }))} /></div>
                <div className="set-grp">Columns</div>
                {([["last", "Last"], ["change", "Change"], ["changePct", "Change %"], ["volume", "Volume"]] as [string, string][]).map(([k, l]) => (
                  <div key={k} className={`set-row${(set.cols as any)[k] ? " on" : ""}`} onClick={() => setSet((s) => ({ ...s, cols: { ...s.cols, [k]: !(s.cols as any)[k] } }))}><span className="cbx"><svg viewBox="0 0 24 24"><path d="M4 12l5 5L20 6" /></svg></span>{l}</div>
                ))}
                <div className="set-grp">Symbol display</div>
                <div className={`set-row${set.logo ? " on" : ""}`} onClick={() => setSet((s) => ({ ...s, logo: !s.logo }))}><span className="cbx"><svg viewBox="0 0 24 24"><path d="M4 12l5 5L20 6" /></svg></span>Logo</div>
                {["symbol", "name"].map((d) => <div key={d} className={`set-row${set.disp === d ? " on" : ""}`} onClick={() => setSet((s) => ({ ...s, disp: d }))}><span className="rdo" />{d[0].toUpperCase() + d.slice(1)}</div>)}
              </div>
            </div>
            <div className="wl-cols" style={{ gridTemplateColumns: wlGrid }}><span>Symbol</span>{colList().map(([k, l]) => <span key={k}>{l}</span>)}<span /></div>
            <div className="wl-list">
              {Object.entries(sections).map(([sec, rows]) => (
                <div key={sec}>
                  <div className="wl-sec">{sec}</div>
                  {rows.map((sym) => { const r = man?.symbols?.[sym]; const u = (r?.chg ?? 0) >= 0; const label = set.disp === "name" ? (r?.name || sym) : sym;
                    return (
                      <div key={sym} className={`wl-row${sym === active ? " on" : ""}`} style={{ gridTemplateColumns: wlGrid, height: set.tableView ? 32 : 46 }} onClick={() => pick(sym)}>
                        <div className="s">{set.logo && <span className="ic" style={{ background: r?.col || "#888", width: set.tableView ? 18 : 24, height: set.tableView ? 18 : 24 }}>{sym[0]}</span>}
                          <span className="nm"><span className="tk">{label}</span>{!set.tableView && <span className="sub">{set.disp === "name" ? sym : (r?.name || "")}</span>}</span></div>
                        {colList().map(([k]) => <span key={k} className={`c num ${k === "changePct" || k === "change" ? (u ? "up" : "down") : ""}`}>{colVal(r, k)}</span>)}
                        <span className="rm" onClick={(e) => { e.stopPropagation(); removeSymbol(sym); }}><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg></span>
                      </div>
                    ); })}
                </div>
              ))}
            </div>
          </div>

          <div className="board detail-board">
            <div className="card">
              <div className="hd"><span className="ic" style={{ background: m?.col || "#76b900" }}>{active[0]}</span>
                <div><div className="nm">{m?.name || active}</div><div className="ex">{m?.sec || ""} · Polygon</div></div>
                <div className="px"><b className="num">{fmt(lastPx, m && lastPx != null && lastPx < 10 ? 4 : 2)}</b><div className={`cg num ${(m?.chg ?? 0) >= 0 ? "up" : "down"}`}>{(m?.chg ?? 0) >= 0 ? "+" : ""}{fmt(m?.chg)}%</div></div></div>
              <div className="regime" style={m?.regimeBull ? {} : { color: "var(--warn)" }}><i style={m?.regimeBull ? {} : { background: "var(--warn)" }} />{m?.regimeBull ? "Uptrend regime · above 200-EMA" : "Mixed regime · watch trend"}</div>
              <div className="kv"><span className="k">Open</span><span className="v">{fmt(m?.open, m && m.last < 10 ? 4 : 2)}</span></div>
              <div className="kv"><span className="k">Day Range</span><span className="v">{fmt(m?.low, m && m.last < 10 ? 4 : 2)} – {fmt(m?.high, m && m.last < 10 ? 4 : 2)}</span></div>
              <div className="kv"><span className="k">Volume</span><span className="v">{m ? vol(m.vol) : "—"}</span></div>
              <div className="kv"><span className="k">52W High</span><span className="v">{fmt(m?.hi52)} {m && <span className="down">{(((m.last - m.hi52) / m.hi52) * 100).toFixed(1)}%</span>}</span></div>
              <div className="kv"><span className="k">52W Low</span><span className="v">{fmt(m?.lo52)} {m && <span className="up">+{(((m.last - m.lo52) / m.lo52) * 100).toFixed(1)}%</span>}</span></div>
              <div className="mmcard" style={{ borderLeftColor: buy ? "var(--buy)" : "var(--sell)" }}>
                <div className="t"><svg viewBox="0 0 24 24"><path d="M12 2l2.2 5.8L20 10l-5.8 2.2L12 18l-2.2-5.8L4 10l5.8-2.2z" /></svg>Golden Oracle · Confluence</div>
                <div className="verdict"><b style={{ color: buy ? "var(--buy)" : "var(--sell)" }}>{m?.verdict || "—"}</b><span className="conf">backtested · 6yr daily→3D</span></div>
                <div className="s2"><div>Win rate<b>{m?.wr != null ? (m.wr * 100).toFixed(0) + "%" : "—"}</b></div><div>Profit factor<b>{m?.pf != null ? m.pf.toFixed(2) : "—"}</b></div><div>CAGR<b>{m?.cagr != null ? (m.cagr * 100).toFixed(1) + "%" : "—"}</b></div></div>
              </div>

              {intel && (
                <div className="intel">
                  <div className="ih"><svg viewBox="0 0 24 24" style={{ width: 13, height: 13, stroke: "var(--brand-2)", fill: "none", strokeWidth: 1.8 }}><path d="M12 2a7 7 0 0 1 7 7c0 3-2 4-2 6H7c0-2-2-3-2-6a7 7 0 0 1 7-7zM9 21h6" /></svg>Macro intel<span className="src">analyzer</span></div>
                  <div className={`verd${intelDir === "BULL" ? " bull" : intelDir === "BEAR" ? " bear" : ""}`}>
                    <b>{ic.ai_judgment?.verdict || "—"}</b>
                    {itape.conviction != null && <span className="sc">{Math.round(itape.conviction)}</span>}
                  </div>
                  <div className="ipills">
                    {itape.regime && <span className="ip"><i style={{ background: intelDir === "BEAR" ? "var(--down)" : "var(--up)" }} />{itape.regime}</span>}
                    {itape.gex_flip != null && <span className="ip"><i style={{ background: "var(--signal)" }} />Flip {Number(itape.gex_flip).toFixed(0)}</span>}
                    {ic.analyst?.est_chg_90d != null && <span className="ip"><i style={{ background: "var(--up)" }} />Rev +{Number(ic.analyst.est_chg_90d).toFixed(0)}%</span>}
                    {ic.smart_money?.trend && <span className="ip"><i style={{ background: ic.smart_money.trend === "accumulating" ? "var(--up)" : "var(--muted)" }} />{ic.smart_money.trend}</span>}
                    {itape.short_pct != null && <span className="ip"><i style={{ background: "var(--muted)" }} />Short {Number(itape.short_pct).toFixed(1)}%</span>}
                  </div>
                </div>
              )}

              {slice?.indicator?.signals?.length > 0 && (
                <div className="intel">
                  <div className="ih"><svg viewBox="0 0 24 24" style={{ width: 13, height: 13, stroke: "var(--brand-2)", fill: "none", strokeWidth: 1.8 }}><path d="M3 17l5-5 4 4 8-8" /></svg>Recent signals<span className="src">oracle</span></div>
                  <div className="sig-log">
                    {slice.indicator.signals.slice(-6).reverse().map((s: any, i: number) => { const b = s.type === "BUY" || s.type === "REBUY"; return (
                      <div className="sig-row" key={i}><span className={`sig-t ${b ? "buy" : "sell"}`}>{s.type}</span><span className="sig-d">{s.ts}</span><span className="sig-p num">{typeof s.price === "number" ? s.price.toFixed(2) : "—"}</span></div>
                    ); })}
                  </div>
                </div>
              )}

              <button className="btn btn-ghost" style={{ width: "100%", marginTop: 12, height: 34 }} onClick={() => setCopilot(true)}>Ask Mastermind AI about {active} →</button>
            </div>
            <SeasonalityCard symbol={active} />
          </div>
        </div>
      </aside>

      <div className="ticker">
        <span className="lbl">Movers</span>
        {Object.entries(man?.symbols || {}).slice(0, 16).map(([s, r]) => { const u = r.chg >= 0; return (
          <span key={s} className="tk" style={{ cursor: "pointer" }} onClick={() => pick(s)}><span className="s">{s.replace("-USD", "")}</span><span className="p num">{fmt(r.last, r.last < 10 ? 3 : 2)}</span><span className={`c num ${u ? "up" : "down"}`}>{u ? "+" : ""}{fmt(r.chg)}%</span></span>
        ); })}
      </div>

      <SearchModal open={searchOpen} seed={seed} manifest={(man?.symbols as any) || {}} inWatchlist={inWl} onClose={() => { setSearchOpen(false); setSearchMode("go"); }} onPick={onSearchPick} onAdd={addSymbol} />
      <IndicatorsModal open={indOpen} active={inds} onClose={() => setIndOpen(false)} onToggle={toggleInd} />
      <CopilotPanel open={copilot} symbol={active} row={m} onClose={() => setCopilot(false)} />
    </div>
  );
}
