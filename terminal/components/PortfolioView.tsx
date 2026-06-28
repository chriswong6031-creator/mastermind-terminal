"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BrandLockup } from "@/components/BrandMark";
import { AppNav } from "@/components/AppNav";

type Row = { name: string; col: string; last: number; chg: number; verdict: string | null; wr: number | null; pf: number | null; cagr: number | null; regimeBull: boolean | null };
const fmt = (n: number | null | undefined, d = 2) => (n == null || !isFinite(n) ? "—" : n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }));
const isBuy = (v: string | null) => v === "BUY" || v === "REBUY";

export default function PortfolioView({ symbols, email }: { symbols: string[]; email: string }) {
  const router = useRouter();
  const [man, setMan] = useState<Record<string, Row>>({});
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { fetch("/data/manifest.json").then((r) => r.json()).then((m) => setMan(m.symbols || {})).catch(() => {}).finally(() => setLoaded(true)); }, []);

  const rows = symbols.map((s) => ({ sym: s, ...(man[s] || {} as Row) })).filter((r) => r.name);
  const buys = rows.filter((r) => isBuy(r.verdict));
  // a display-only "conviction tilt": weight bullish names by win-rate, normalize
  const tiltBase = buys.map((r) => ({ sym: r.sym, w: (r.wr || 0.5) }));
  const tiltSum = tiltBase.reduce((a, b) => a + b.w, 0) || 1;
  const tilt: Record<string, number> = {};
  tiltBase.forEach((t) => (tilt[t.sym] = t.w / tiltSum));

  const wrs = rows.filter((r) => r.wr != null).map((r) => r.wr!);
  const avgWr = wrs.length ? (wrs.reduce((a, b) => a + b, 0) / wrs.length) * 100 : 0;
  const dayPnl = rows.reduce((a, r) => a + (r.chg || 0), 0) / (rows.length || 1);

  return (
    <div className="app2">
      <header className="topbar">
        <BrandLockup /><div className="tdiv" /><span className="page-title">Portfolio</span>
        <div className="spacer" />
        <form action="/auth/signout" method="post"><button className="avatar" title={`${email} · sign out`}>{(email || "U")[0].toUpperCase()}</button></form>
      </header>
      <AppNav />
      <main className="main2"><div className="pg">
        <div className="pg-head"><h2>Conviction Book</h2><span className="sub">Display-only · paper. Your watchlist ranked by the Golden-Oracle confluence + regime — a suggested tilt, not advice.</span></div>
        <div className="kpis">
          <div className="kpi"><small>Names</small><b>{rows.length}</b></div>
          <div className="kpi"><small>Bullish signals</small><b className="up">{buys.length}</b></div>
          <div className="kpi"><small>Avg win rate</small><b>{avgWr.toFixed(0)}%</b></div>
          <div className="kpi"><small>Avg day move</small><b className={dayPnl >= 0 ? "up" : "down"}>{dayPnl >= 0 ? "+" : ""}{dayPnl.toFixed(2)}%</b></div>
        </div>
        <div className="panel">
          <div className="ph">Positions<span className="sub">click a row to open it in the chart</span></div>
          <table className="ptable">
            <thead><tr><th>Symbol</th><th>Last</th><th>Day</th><th>Signal</th><th>Regime</th><th>Win rate</th><th>Profit factor</th><th>CAGR</th><th>Suggested tilt</th></tr></thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={9} style={{ textAlign: "center", color: "var(--muted)", padding: "44px 16px", fontSize: 13, cursor: "default" }}>
                  {!loaded ? "Loading book…" : "No names in your watchlist yet."}
                </td></tr>
              )}
              {rows.map((r) => { const u = (r.chg || 0) >= 0; const buy = isBuy(r.verdict);
                return (
                  <tr key={r.sym} onClick={() => router.push(`/terminal?sym=${r.sym}`)}>
                    <td><div className="sym-cell"><span className="ic" style={{ background: r.col }}>{r.sym[0]}</span><div><div className="tk">{r.sym}</div><div className="nm">{r.name}</div></div></div></td>
                    <td>{fmt(r.last, r.last < 10 ? 4 : 2)}</td>
                    <td className={u ? "up" : "down"}>{u ? "+" : ""}{fmt(r.chg)}%</td>
                    <td>{r.verdict ? <span className={`pill ${buy ? "buy" : "sell"}`}>{r.verdict}</span> : "—"}</td>
                    <td><span className={`regchip ${r.regimeBull ? "up" : "warn"}`}>{r.regimeBull ? "Uptrend" : "Mixed"}</span></td>
                    <td>{r.wr != null ? (r.wr * 100).toFixed(0) + "%" : "—"}</td>
                    <td>{r.pf != null ? r.pf.toFixed(2) : "—"}</td>
                    <td>{r.cagr != null ? (r.cagr * 100).toFixed(1) + "%" : "—"}</td>
                    <td>{tilt[r.sym] ? <><b style={{ color: "var(--brand-2)" }}>{(tilt[r.sym] * 100).toFixed(0)}%</b><span className="bar"><i style={{ width: `${tilt[r.sym] * 100}%` }} /></span></> : <span style={{ color: "var(--text-dim)" }}>—</span>}</td>
                  </tr>
                ); })}
            </tbody>
          </table>
        </div>
      </div></main>
      <div className="ticker"><span className="lbl">Conviction Book</span><span style={{ color: "var(--text-2)" }}>{buys.length} bullish · tilt weighted by backtested win-rate · paper / display-only</span></div>
    </div>
  );
}
