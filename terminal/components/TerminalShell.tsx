"use client";
import { useEffect, useMemo, useState } from "react";
import { BrandLockup } from "@/components/BrandMark";
import { AppNav } from "@/components/AppNav";
import ChartPanel from "@/components/ChartPanel";

type Row = { name: string; sec: string; col: string; last: number; chg: number; open: number; high: number; low: number; vol: number; hi52: number; lo52: number; verdict: string | null; wr: number | null; pf: number | null; cagr: number | null; regimeBull: boolean | null };
type Manifest = { as_of: string | null; symbols: Record<string, Row> };

const fmt = (n: number | null | undefined, d = 2) => (n == null || !isFinite(n) ? "—" : n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }));
const vol = (v: number) => (v >= 1e9 ? (v / 1e9).toFixed(2) + "B" : v >= 1e6 ? (v / 1e6).toFixed(1) + "M" : String(v));
const isBuy = (v: string | null) => v === "BUY" || v === "REBUY";

export default function TerminalShell({ symbols, email, initialSymbol }: { symbols: { symbol: string; section: string }[]; email: string; initialSymbol?: string }) {
  const [man, setMan] = useState<Manifest | null>(null);
  const firstWithData = symbols.find((s) => s.symbol === "NVDA")?.symbol || symbols[0]?.symbol || "NVDA";
  const [active, setActive] = useState(initialSymbol || firstWithData);

  useEffect(() => { fetch("/data/manifest.json").then((r) => r.json()).then(setMan).catch(() => {}); }, []);

  const sections = useMemo(() => {
    const o: Record<string, { symbol: string }[]> = {};
    symbols.forEach((s) => { (o[s.section] ||= []).push({ symbol: s.symbol }); });
    return o;
  }, [symbols]);

  const m = man?.symbols?.[active];
  const buy = isBuy(m?.verdict ?? null);

  return (
    <div className="app">
      {/* TOP BAR */}
      <header className="topbar">
        <BrandLockup />
        <div className="tdiv" />
        <div className="pair"><span className="dual"><i>{active[0]}</i><i>$</i></span><b>{active}</b>
          <svg className="car" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" /></svg></div>
        <div className="stats">
          <div className="stat"><span className="l">Last Price</span><span className="v big num">{fmt(m?.last, m && m.last < 10 ? 4 : 2)}</span></div>
          <div className="stat"><span className="l">24h Change</span><span className={`v num ${(m?.chg ?? 0) >= 0 ? "up" : "down"}`}>{(m?.chg ?? 0) >= 0 ? "+" : ""}{fmt(m?.chg)}%</span></div>
          <div className="stat"><span className="l">Volume</span><span className="v num">{m ? vol(m.vol) : "—"}</span></div>
          <div className="stat"><span className="l">Day High</span><span className="v num">{fmt(m?.high, m && m.last < 10 ? 4 : 2)}</span></div>
          <div className="stat"><span className="l">Day Low</span><span className="v num">{fmt(m?.low, m && m.last < 10 ? 4 : 2)}</span></div>
        </div>
        <div className="spacer" />
        <button className="ai"><svg viewBox="0 0 24 24"><path d="M12 2l2.2 5.8L20 10l-5.8 2.2L12 18l-2.2-5.8L4 10l5.8-2.2z" /></svg>Mastermind AI</button>
        <form action="/auth/signout" method="post"><button className="avatar" title={`${email} · sign out`}>{(email || "U")[0].toUpperCase()}</button></form>
      </header>

      <AppNav />

      {/* WORKSPACE */}
      <section className="workspace">
        <div className="chart-tabs">
          <div className="ct on">Price chart</div><div className="ct">Depth</div><div className="ct">Market info</div>
          <div className="tools">
            <div className="seg"><button>1H</button><button className="on">D</button><button className="on" style={{ color: "var(--brand-2)" }}>3D</button><button>W</button></div>
            <button className="tbtn"><svg viewBox="0 0 24 24" style={{ strokeWidth: 2 }}><path d="M5 12h14M12 5v14" /></svg>Indicators</button>
          </div>
        </div>
        <div className="chart-body">
          <div className="tooldock">
            {["M12 2v20M2 12h20", "M4 20L20 4", "M3 12h18", "M3 5h18M3 9h18M3 15h18M3 19h18", "M5 5h14M12 5v14"].map((d, i) => (
              <button key={i} className={i === 0 ? "on" : ""}><svg viewBox="0 0 24 24"><path d={d} /></svg></button>
            ))}
          </div>
          <ChartPanel symbol={active} key={active} />
        </div>
      </section>

      {/* RIGHT RAIL */}
      <aside className="rail">
        <div className="rail-tabs"><div className="t on">Watchlist</div><div className="t">Details</div><div className="t">Signals</div></div>
        <div className="rail-body">
          <div className="board wl-board">
            <div className="wl-bar">
              <button className="wl-select">Default <svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" /></svg></button>
              <div className="wl-acts">
                <button title="Add symbol"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg></button>
                <button title="Settings"><svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></svg></button>
              </div>
            </div>
            <div className="wl-cols"><span>Symbol</span><span>Last</span><span>Chg%</span></div>
            <div className="wl-list">
              {Object.entries(sections).map(([sec, rows]) => (
                <div key={sec}>
                  <div className="wl-sec">{sec}</div>
                  {rows.map(({ symbol }) => { const r = man?.symbols?.[symbol]; const u = (r?.chg ?? 0) >= 0;
                    return (
                      <div key={symbol} className={`wl-row${symbol === active ? " on" : ""}`} onClick={() => setActive(symbol)}>
                        <div className="s"><span className="ic" style={{ background: r?.col || "#888" }}>{symbol[0]}</span>
                          <span className="nm"><span className="tk">{symbol}</span><span className="sub">{r?.name || symbol}</span></span></div>
                        <span className="c num">{fmt(r?.last, (r?.last ?? 99) < 10 ? 4 : 2)}</span>
                        <span className={`c num ${u ? "up" : "down"}`}>{u ? "+" : ""}{fmt(r?.chg)}%</span>
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
                <div className="px"><b className="num">{fmt(m?.last, m && m.last < 10 ? 4 : 2)}</b>
                  <div className={`cg num ${(m?.chg ?? 0) >= 0 ? "up" : "down"}`}>{(m?.chg ?? 0) >= 0 ? "+" : ""}{fmt(m?.chg)}%</div></div></div>
              <div className="regime" style={m?.regimeBull ? {} : { color: "var(--warn)" }}>
                <i style={m?.regimeBull ? {} : { background: "var(--warn)" }} />
                {m?.regimeBull ? "Uptrend regime · above 200-EMA" : "Mixed regime · watch trend"}</div>
              <div className="kv"><span className="k">Open</span><span className="v">{fmt(m?.open, m && m.last < 10 ? 4 : 2)}</span></div>
              <div className="kv"><span className="k">Day Range</span><span className="v">{fmt(m?.low, m && m.last < 10 ? 4 : 2)} – {fmt(m?.high, m && m.last < 10 ? 4 : 2)}</span></div>
              <div className="kv"><span className="k">Volume</span><span className="v">{m ? vol(m.vol) : "—"}</span></div>
              <div className="kv"><span className="k">52W High</span><span className="v">{fmt(m?.hi52)} {m && <span className="down">{(((m.last - m.hi52) / m.hi52) * 100).toFixed(1)}%</span>}</span></div>
              <div className="kv"><span className="k">52W Low</span><span className="v">{fmt(m?.lo52)} {m && <span className="up">+{(((m.last - m.lo52) / m.lo52) * 100).toFixed(1)}%</span>}</span></div>
              <div className="mmcard" style={{ borderLeftColor: buy ? "var(--buy)" : "var(--sell)" }}>
                <div className="t"><svg viewBox="0 0 24 24"><path d="M12 2l2.2 5.8L20 10l-5.8 2.2L12 18l-2.2-5.8L4 10l5.8-2.2z" /></svg>Golden Oracle · Confluence</div>
                <div className="verdict"><b style={{ color: buy ? "var(--buy)" : "var(--sell)" }}>{m?.verdict || "—"}</b>
                  <span className="conf">backtested on {man?.as_of ? "6yr daily→3D" : "—"}</span></div>
                <div className="s2">
                  <div>Win rate<b>{m?.wr != null ? (m.wr * 100).toFixed(0) + "%" : "—"}</b></div>
                  <div>Profit factor<b>{m?.pf != null ? m.pf.toFixed(2) : "—"}</b></div>
                  <div>CAGR<b>{m?.cagr != null ? (m.cagr * 100).toFixed(1) + "%" : "—"}</b></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* TICKER */}
      <div className="ticker">
        <span className="lbl">Movers</span>
        {Object.entries(man?.symbols || {}).map(([s, r]) => { const u = r.chg >= 0; return (
          <span key={s} className="tk"><span className="s">{s.replace("-USD", "")}</span>
            <span className="p num">{fmt(r.last, r.last < 10 ? 3 : 2)}</span>
            <span className={`c num ${u ? "up" : "down"}`}>{u ? "+" : ""}{fmt(r.chg)}%</span></span>
        ); })}
      </div>
    </div>
  );
}
