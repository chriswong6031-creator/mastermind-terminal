"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BrandLockup } from "@/components/BrandMark";
import { AppNav } from "@/components/AppNav";
import ChartPanel from "@/components/ChartPanel";
import SearchModal from "@/components/SearchModal";
import IndicatorsModal from "@/components/IndicatorsModal";
import CopilotPanel from "@/components/CopilotPanel";
import SeasonalityCard from "@/components/SeasonalityCard";
import SectorPulseChip, { type SectorPulse } from "@/components/SectorPulseChip";

type Row = { name: string; sec: string; col: string; last: number; chg: number; open: number; high: number; low: number; vol: number; hi52: number; lo52: number; verdict: string | null; wr: number | null; pf: number | null; cagr: number | null; regimeBull: boolean | null };
type Manifest = { as_of: string | null; symbols: Record<string, Row> };
type IntelData = { tape?: { stale?: boolean; sector_pulse?: SectorPulse } } | null;

const fmt = (n: number | null | undefined, d = 2) => (n == null || !isFinite(n) ? "—" : n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }));
const vol = (v: number) => (v >= 1e9 ? (v / 1e9).toFixed(2) + "B" : v >= 1e6 ? (v / 1e6).toFixed(1) + "M" : String(v));
const isBuy = (v: string | null) => v === "BUY" || v === "REBUY";
const CHART_TYPES = [["candles", "Candles"], ["heikin", "Heikin Ashi"], ["bars", "Bars"], ["line", "Line"], ["area", "Area"]];
const TF_GROUPS: [string, string[]][] = [["Minutes", ["1m", "5m", "15m", "30m"]], ["Hours", ["1h", "2h", "4h"]], ["Days", ["D", "3D"]], ["Weeks", ["W", "2W"]], ["Months", ["1M", "3M"]]];
const FUNCTIONAL = new Set(["D", "3D", "W", "1M"]);
const load = (k: string, d: any) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };

export default function TerminalShell({ symbols, email, initialSymbol }: { symbols: { symbol: string; section: string }[]; email: string; initialSymbol?: string }) {
  const router = useRouter();
  const [man, setMan] = useState<Manifest | null>(null);
  const [wl, setWl] = useState(symbols);
  const [active, setActive] = useState(initialSymbol || symbols.find((s) => s.symbol === "NVDA")?.symbol || symbols[0]?.symbol || "NVDA");
  const [tf, setTf] = useState("D");
  const [chartType, setChartType] = useState("candles");
  const [inds, setInds] = useState<Set<string>>(new Set(["ema", "rsi", "stochrsi"]));
  const [favTF, setFavTF] = useState<string[]>(["D", "3D", "W", "1M"]);
  const [set, setSet] = useState({ tableView: false, cols: { last: true, changePct: true, change: false, volume: false }, disp: "symbol", logo: true });
  // popovers / modals
  const [searchOpen, setSearchOpen] = useState(false); const [seed, setSeed] = useState("");
  const [indOpen, setIndOpen] = useState(false); const [copilot, setCopilot] = useState(false);
  const [wlSetOpen, setWlSetOpen] = useState(false); const [tfOpen, setTfOpen] = useState(false); const [ctOpen, setCtOpen] = useState(false);
  // replay
  const [replayOn, setReplayOn] = useState(false); const [replayIdx, setReplayIdx] = useState<number | null>(null); const [total, setTotal] = useState(0); const [playing, setPlaying] = useState(false); const [speed, setSpeed] = useState(1);
  const playRef = useRef<any>(null);

  useEffect(() => { fetch("/data/manifest.json").then((r) => r.json()).then(setMan).catch(() => {}); }, []);
  const [intel, setIntel] = useState<IntelData>(null);
  useEffect(() => {
    setIntel(null);
    fetch(`/data/${active}.intel.json`)
      .then((r) => { if (!r.ok) return null; return r.json(); })
      .then((d) => setIntel(d))
      .catch(() => setIntel(null));
  }, [active]);
  useEffect(() => { setInds(new Set(load("mm.inds", ["ema", "rsi", "stochrsi"]))); setChartType(load("mm.ct", "candles")); setTf(load("mm.tf", "D")); setFavTF(load("mm.favtf", ["D", "3D", "W", "1M"])); setSet(load("mm.set", { tableView: false, cols: { last: true, changePct: true, change: false, volume: false }, disp: "symbol", logo: true })); }, []);
  useEffect(() => { localStorage.setItem("mm.inds", JSON.stringify([...inds])); }, [inds]);
  useEffect(() => { localStorage.setItem("mm.ct", JSON.stringify(chartType)); }, [chartType]);
  useEffect(() => { localStorage.setItem("mm.tf", JSON.stringify(tf)); }, [tf]);
  useEffect(() => { localStorage.setItem("mm.favtf", JSON.stringify(favTF)); }, [favTF]);
  useEffect(() => { localStorage.setItem("mm.set", JSON.stringify(set)); }, [set]);

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

  // replay autoplay
  useEffect(() => {
    clearInterval(playRef.current);
    if (replayOn && playing && total) {
      playRef.current = setInterval(() => setReplayIdx((i) => { const n = (i ?? 0) + 1; if (n >= total - 1) { setPlaying(false); return total - 1; } return n; }), 700 / speed);
    }
    return () => clearInterval(playRef.current);
  }, [replayOn, playing, total, speed]);

  const closeAll = () => { setWlSetOpen(false); setTfOpen(false); setCtOpen(false); };
  useEffect(() => { const h = () => closeAll(); window.addEventListener("click", h); return () => window.removeEventListener("click", h); }, []);

  const sections = useMemo(() => { const o: Record<string, string[]> = {}; wl.forEach((s) => { (o[s.section] ||= []).push(s.symbol); }); return o; }, [wl]);
  const inWl = useMemo(() => new Set(wl.map((s) => s.symbol)), [wl]);
  const m = man?.symbols?.[active];
  const buy = isBuy(m?.verdict ?? null);

  async function addSymbol(sym: string) {
    const sec = man?.symbols?.[sym]?.sec || "Watchlist";
    if (!inWl.has(sym)) { setWl((w) => [...w, { symbol: sym, section: sec }]); await fetch("/api/watchlist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "add", symbol: sym, section: sec }) }); }
  }
  async function removeSymbol(sym: string) { setWl((w) => w.filter((s) => s.symbol !== sym)); await fetch("/api/watchlist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "remove", symbol: sym }) }); }
  const toggleInd = (k: string) => setInds((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const pick = (sym: string) => { setActive(sym); setReplayOn(false); setReplayIdx(null); setPlaying(false); };
  const colList = () => { const a: [string, string][] = [["last", "Last"]]; if (set.cols.change) a.push(["change", "Chg"]); if (set.cols.changePct) a.push(["changePct", "Chg%"]); if (set.cols.volume) a.push(["volume", "Vol"]); return a; };
  const colVal = (r: Row | undefined, key: string) => { if (!r) return "—"; const u = r.chg >= 0; if (key === "last") return fmt(r.last, r.last < 10 ? 4 : 2); if (key === "change") return (u ? "+" : "") + fmt(r.last * r.chg / 100, 2); if (key === "changePct") return (u ? "+" : "") + fmt(r.chg) + "%"; if (key === "volume") return vol(r.vol); return ""; };
  const wlGrid = `1fr ${colList().map(() => "1fr").join(" ")} 18px`;

  return (
    <div className="app">
      {/* TOP BAR */}
      <header className="topbar">
        <BrandLockup />
        <div className="tdiv" />
        <div className="pair" onClick={() => { setSeed(""); setSearchOpen(true); }}><span className="dual"><i>{active[0]}</i><i>$</i></span><b>{active}</b>
          <svg className="car" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" /></svg></div>
        <div className="stats">
          <div className="stat"><span className="l">Last Price</span><span className="v big num">{fmt(m?.last, m && m.last < 10 ? 4 : 2)}</span></div>
          <div className="stat"><span className="l">24h Change</span><span className={`v num ${(m?.chg ?? 0) >= 0 ? "up" : "down"}`}>{(m?.chg ?? 0) >= 0 ? "+" : ""}{fmt(m?.chg)}%</span></div>
          <div className="stat"><span className="l">Volume</span><span className="v num">{m ? vol(m.vol) : "—"}</span></div>
          <div className="stat"><span className="l">Day High</span><span className="v num">{fmt(m?.high, m && m.last < 10 ? 4 : 2)}</span></div>
          <div className="stat"><span className="l">Day Low</span><span className="v num">{fmt(m?.low, m && m.last < 10 ? 4 : 2)}</span></div>
        </div>
        <div className="spacer" />
        <button className="ai" onClick={() => setCopilot(true)}><svg viewBox="0 0 24 24"><path d="M12 2l2.2 5.8L20 10l-5.8 2.2L12 18l-2.2-5.8L4 10l5.8-2.2z" /></svg>Mastermind AI</button>
        <form action="/auth/signout" method="post"><button className="avatar" title={`${email} · sign out`}>{(email || "U")[0].toUpperCase()}</button></form>
      </header>

      <AppNav />

      {/* WORKSPACE */}
      <section className="workspace">
        <div className="chart-tabs">
          <div className="ct on">Price chart</div>
          <div className="tools">
            {/* timeframe favorites + dropdown */}
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
            <button className={`tbtn${replayOn ? "" : ""}`} style={replayOn ? { color: "var(--signal)" } : {}} onClick={() => { const on = !replayOn; setReplayOn(on); setPlaying(false); setReplayIdx(on ? Math.max(20, total - 40) : null); }}><svg viewBox="0 0 24 24"><path d="M5 3l14 9-14 9V3z" /></svg>Replay</button>
            <button className="icbtn" title="Snapshot" onClick={() => window.dispatchEvent(new CustomEvent("mm:snapshot"))}><svg viewBox="0 0 24 24"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg></button>
          </div>
        </div>

        {replayOn && (
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

        <div className="chart-body">
          <div className="tooldock">
            {["M12 2v20M2 12h20", "M4 20L20 4", "M3 12h18", "M3 5h18M3 9h18M3 15h18M3 19h18", "M4 6h16v12H4z", "M5 5h14M12 5v14"].map((d, i) => (
              <button key={i} className={i === 0 ? "on" : ""}><svg viewBox="0 0 24 24"><path d={d} /></svg></button>
            ))}
          </div>
          <ChartPanel symbol={active} chartType={chartType} indicators={inds} timeframe={tf} replayIdx={replayOn ? replayIdx : null} onMeta={(mm) => setTotal(mm.total)} key={active + tf + chartType} />
        </div>
      </section>

      {/* RIGHT RAIL */}
      <aside className="rail">
        <div className="rail-tabs"><div className="t on">Watchlist</div><div className="t">Details</div><div className="t">Signals</div></div>
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
                <div className="px"><b className="num">{fmt(m?.last, m && m.last < 10 ? 4 : 2)}</b><div className={`cg num ${(m?.chg ?? 0) >= 0 ? "up" : "down"}`}>{(m?.chg ?? 0) >= 0 ? "+" : ""}{fmt(m?.chg)}%</div></div></div>
              <div className="regime" style={m?.regimeBull ? {} : { color: "var(--warn)" }}><i style={m?.regimeBull ? {} : { background: "var(--warn)" }} />{m?.regimeBull ? "Uptrend regime · above 200-EMA" : "Mixed regime · watch trend"}</div>
              <SectorPulseChip pulse={intel?.tape?.stale ? undefined : intel?.tape?.sector_pulse} />
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
              <button className="btn btn-ghost" style={{ width: "100%", marginTop: 12, height: 34 }} onClick={() => setCopilot(true)}>Ask Mastermind AI about {active} →</button>
            </div>
            <SeasonalityCard symbol={active} />
          </div>
        </div>
      </aside>

      {/* TICKER */}
      <div className="ticker">
        <span className="lbl">Movers</span>
        {Object.entries(man?.symbols || {}).slice(0, 16).map(([s, r]) => { const u = r.chg >= 0; return (
          <span key={s} className="tk" style={{ cursor: "pointer" }} onClick={() => pick(s)}><span className="s">{s.replace("-USD", "")}</span><span className="p num">{fmt(r.last, r.last < 10 ? 3 : 2)}</span><span className={`c num ${u ? "up" : "down"}`}>{u ? "+" : ""}{fmt(r.chg)}%</span></span>
        ); })}
      </div>

      <SearchModal open={searchOpen} seed={seed} manifest={(man?.symbols as any) || {}} inWatchlist={inWl} onClose={() => setSearchOpen(false)} onPick={pick} onAdd={addSymbol} />
      <IndicatorsModal open={indOpen} active={inds} onClose={() => setIndOpen(false)} onToggle={toggleInd} />
      <CopilotPanel open={copilot} symbol={active} row={m} onClose={() => setCopilot(false)} />
    </div>
  );
}
