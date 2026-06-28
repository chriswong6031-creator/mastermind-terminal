"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BrandLockup } from "@/components/BrandMark";
import { AppNav } from "@/components/AppNav";

type Row = { sym: string; name: string; sec: string; col: string; last: number; chg: number; vol: number; verdict: string | null; wr: number | null; pf: number | null; cagr: number | null; regimeBull: boolean | null };
const fmt = (n: number | null | undefined, d = 2) => (n == null || !isFinite(n) ? "—" : n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }));
const vol = (v: number) => (v >= 1e9 ? (v / 1e9).toFixed(2) + "B" : v >= 1e6 ? (v / 1e6).toFixed(1) + "M" : String(v));
const isBuy = (v: string | null) => v === "BUY" || v === "REBUY";

export default function ScreenerView({ email }: { email: string }) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [asOf, setAsOf] = useState<string>("");
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState(false);
  const [verdict, setVerdict] = useState<"all" | "buy" | "sell">("all");
  const [sec, setSec] = useState<"all" | "Equities" | "Crypto">("all");
  const [uptrend, setUptrend] = useState(false);
  const [sort, setSort] = useState<{ k: keyof Row; dir: 1 | -1 }>({ k: "cagr", dir: -1 });

  useEffect(() => {
    fetch("/data/manifest.json")
      .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then((m) => {
        setAsOf(m.as_of || "");
        setRows(Object.entries(m.symbols || {}).map(([sym, r]: any) => ({ sym, ...r })));
        setLoaded(true);
      })
      .catch(() => { setErr(true); setLoaded(true); });
  }, []);

  const view = useMemo(() => {
    let v = rows.filter((r) =>
      (verdict === "all" || (verdict === "buy" ? isBuy(r.verdict) : !isBuy(r.verdict) && r.verdict)) &&
      (sec === "all" || r.sec === sec) &&
      (!uptrend || r.regimeBull));
    v = [...v].sort((a, b) => {
      const x = a[sort.k], y = b[sort.k];
      if (x == null) return 1; if (y == null) return -1;
      return (x > y ? 1 : x < y ? -1 : 0) * sort.dir;
    });
    return v;
  }, [rows, verdict, sec, uptrend, sort]);

  const nBuy = rows.filter((r) => isBuy(r.verdict)).length;
  const nSell = rows.filter((r) => r.verdict && !isBuy(r.verdict)).length;
  const wrs = rows.filter((r) => r.wr != null).map((r) => r.wr!);
  const avgWr = wrs.length ? (wrs.reduce((a, b) => a + b, 0) / wrs.length) * 100 : 0;

  function th(k: keyof Row, label: string) {
    const on = sort.k === k;
    return <th className={on ? "sorted" : ""} onClick={() => setSort((s) => ({ k, dir: s.k === k && s.dir === -1 ? 1 : -1 }))}>{label}{on ? (sort.dir === -1 ? " ↓" : " ↑") : ""}</th>;
  }

  return (
    <div className="app2">
      <header className="topbar">
        <BrandLockup /><div className="tdiv" /><span className="page-title">Screener</span>
        <div className="spacer" />
        <span className="scr-stat"><span><b>{view.length}</b> matches</span><span><b className="up">{nBuy}</b> buy</span><span><b className="down">{nSell}</b> sell</span><span>avg WR <b>{avgWr.toFixed(0)}%</b></span></span>
        <form action="/auth/signout" method="post" style={{ marginLeft: 14 }}><button className="avatar" title={`${email} · sign out`}>{(email || "U")[0].toUpperCase()}</button></form>
      </header>
      <AppNav />
      <main className="main2">
        <div className="scr-filters">
          <span className="chip on" style={{ cursor: "default" }} title="This scan is powered by the Golden Oracle confluence">
            <svg width="13" height="13" viewBox="0 0 24 24" style={{ fill: "var(--brand-2)" }}><path d="M12 2l2.2 5.8L20 10l-5.8 2.2L12 18l-2.2-5.8L4 10l5.8-2.2z" /></svg>Golden Oracle</span>
          <button className={`chip${verdict === "all" ? " on" : ""}`} onClick={() => setVerdict("all")}>Any signal</button>
          <button className={`chip${verdict === "buy" ? " on" : ""}`} onClick={() => setVerdict("buy")}>BUY</button>
          <button className={`chip${verdict === "sell" ? " on" : ""}`} onClick={() => setVerdict("sell")}>SELL</button>
          <button className={`chip${uptrend ? " on" : ""}`} onClick={() => setUptrend((u) => !u)}>Uptrend regime</button>
          <button className={`chip${sec === "Equities" ? " on" : ""}`} onClick={() => setSec((s) => s === "Equities" ? "all" : "Equities")}>Equities</button>
          <button className={`chip${sec === "Crypto" ? " on" : ""}`} onClick={() => setSec((s) => s === "Crypto" ? "all" : "Crypto")}>Crypto</button>
          <span style={{ marginLeft: "auto", color: "var(--text-dim)", fontSize: 11 }}>Scan as of {asOf} · Polygon · backtested 6yr→3D</span>
        </div>
        <div className="scr-table">
          <table className="scr">
            <thead><tr>
              {th("sym", "Symbol")}{th("last", "Last")}{th("chg", "Chg%")}{th("verdict", "Signal")}
              <th onClick={() => setSort((s) => ({ k: "regimeBull", dir: s.k === "regimeBull" && s.dir === -1 ? 1 : -1 }))} className={sort.k === "regimeBull" ? "sorted" : ""}>Regime</th>
              {th("wr", "Win rate")}{th("pf", "Profit factor")}{th("cagr", "CAGR")}{th("vol", "Volume")}
            </tr></thead>
            <tbody>
              {view.length === 0 && (
                <tr><td colSpan={9} style={{ textAlign: "center", color: "var(--muted)", padding: "44px 16px", fontSize: 13, cursor: "default" }}>
                  {!loaded ? "Loading scan…" : err ? "Could not load the scan." : "No symbols match these filters."}
                </td></tr>
              )}
              {view.map((r) => { const u = r.chg >= 0; const buy = isBuy(r.verdict);
                return (
                  <tr key={r.sym} onClick={() => router.push(`/terminal?sym=${r.sym}`)}>
                    <td><div className="sym-cell"><span className="ic" style={{ background: r.col }}>{r.sym[0]}</span><div><div className="tk">{r.sym}</div><div className="nm">{r.name}</div></div></div></td>
                    <td>{fmt(r.last, r.last < 10 ? 4 : 2)}</td>
                    <td className={u ? "up" : "down"}>{u ? "+" : ""}{fmt(r.chg)}%</td>
                    <td>{r.verdict ? <span className={`pill ${buy ? "buy" : "sell"}`}>{r.verdict}</span> : "—"}</td>
                    <td><span className={`regchip ${r.regimeBull ? "up" : "warn"}`}>{r.regimeBull ? "Uptrend" : "Mixed"}</span></td>
                    <td>{r.wr != null ? (r.wr * 100).toFixed(0) + "%" : "—"}</td>
                    <td>{r.pf != null ? r.pf.toFixed(2) : "—"}</td>
                    <td>{r.cagr != null ? <>{(r.cagr * 100).toFixed(1)}%<span className="bar"><i style={{ width: `${Math.max(2, Math.min(100, r.cagr * 250))}%` }} /></span></> : "—"}</td>
                    <td className="num" style={{ color: "var(--text-2)" }}>{vol(r.vol)}</td>
                  </tr>
                ); })}
            </tbody>
          </table>
        </div>
      </main>
      <div className="ticker"><span className="lbl">Golden Oracle scan</span><span style={{ color: "var(--text-2)" }}>{nBuy} BUY · {nSell} SELL · {rows.length} symbols · click a row to open it in the chart</span></div>
    </div>
  );
}
