"use client";
import { useEffect, useState } from "react";
import { BrandLockup } from "@/components/BrandMark";
import { AppNav } from "@/components/AppNav";

type Alert = { id: string; symbol: string; condition: any; active: boolean; created_at: string };

const COND_TYPES = [
  { v: "signal_buy", label: "Golden Oracle flips to BUY", cond: { type: "signal", target: "BUY" }, needsVal: false },
  { v: "signal_sell", label: "Golden Oracle flips to SELL", cond: { type: "signal", target: "SELL" }, needsVal: false },
  { v: "regime_up", label: "Regime flips to Uptrend", cond: { type: "regime", target: "up" }, needsVal: false },
  { v: "price_above", label: "Price crosses above", cond: { type: "price", op: "above" }, needsVal: true },
  { v: "price_below", label: "Price crosses below", cond: { type: "price", op: "below" }, needsVal: true },
  { v: "rsi_below", label: "RSI crosses below", cond: { type: "rsi", op: "below" }, needsVal: true },
];
function condText(c: any) {
  if (c?.type === "signal") return `Golden Oracle flips to ${c.target}`;
  if (c?.type === "regime") return `Regime flips to ${c.target === "up" ? "Uptrend" : c.target}`;
  if (c?.type === "price") return `Price crosses ${c.op} ${c.value}`;
  if (c?.type === "rsi") return `RSI crosses ${c.op} ${c.value}`;
  return JSON.stringify(c);
}

export default function AlertsView({ email }: { email: string }) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [syms, setSyms] = useState<string[]>([]);
  const [sym, setSym] = useState("NVDA");
  const [ctype, setCtype] = useState("signal_buy");
  const [val, setVal] = useState("");

  useEffect(() => {
    fetch("/api/alerts").then((r) => r.json()).then((d) => setAlerts(d.alerts || []));
    fetch("/data/manifest.json").then((r) => r.json()).then((m) => setSyms(Object.keys(m.symbols))).catch(() => {});
  }, []);

  async function create() {
    const t = COND_TYPES.find((x) => x.v === ctype)!;
    const condition = { ...t.cond, ...(t.needsVal ? { value: parseFloat(val) || 0 } : {}) };
    const r = await fetch("/api/alerts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbol: sym, condition }) });
    const d = await r.json();
    if (d.alert) { setAlerts((a) => [d.alert, ...a]); setVal(""); }
  }
  async function del(id: string) {
    await fetch(`/api/alerts?id=${id}`, { method: "DELETE" });
    setAlerts((a) => a.filter((x) => x.id !== id));
  }
  const needsVal = COND_TYPES.find((x) => x.v === ctype)?.needsVal;

  return (
    <div className="app2">
      <header className="topbar">
        <BrandLockup /><div className="tdiv" /><span className="page-title">Alerts</span>
        <div className="spacer" />
        <form action="/auth/signout" method="post"><button className="avatar" title={`${email} · sign out`}>{(email || "U")[0].toUpperCase()}</button></form>
      </header>
      <AppNav />
      <main className="main2"><div className="pg">
        <div className="pg-head"><h2>Alerts</h2><span className="sub">Signal &amp; regime-aware — alert me when MY confluence aligns. Evaluated on each data refresh (historical feed).</span></div>
        <div className="panel">
          <div className="ph">New alert</div>
          <div className="alert-form">
            <select value={sym} onChange={(e) => setSym(e.target.value)}>{syms.map((s) => <option key={s} value={s}>{s}</option>)}</select>
            <select value={ctype} onChange={(e) => setCtype(e.target.value)}>{COND_TYPES.map((c) => <option key={c.v} value={c.v}>{c.label}</option>)}</select>
            {needsVal && <input type="number" placeholder="value" value={val} onChange={(e) => setVal(e.target.value)} style={{ width: 110 }} />}
            <button className="btn btn-primary" style={{ height: 34 }} onClick={create}>Create alert</button>
          </div>
        </div>
        <div className="panel">
          <div className="ph">Active alerts<span className="sub">{alerts.length} total</span></div>
          {alerts.length === 0 && <div style={{ padding: "26px 15px", color: "var(--muted)", fontSize: 13 }}>No alerts yet — create one above. Try “Golden Oracle flips to BUY” on NVDA.</div>}
          {alerts.map((a) => (
            <div key={a.id} className="arow">
              <span className={`dot${a.active ? "" : " off"}`} />
              <span><span className="tk">{a.symbol}</span> <span className="cond">· {condText(a.condition)}</span></span>
              <span />
              <span style={{ color: "var(--muted)", fontSize: 11.5 }}>{new Date(a.created_at).toLocaleDateString()}</span>
              <span style={{ color: a.active ? "var(--up)" : "var(--muted)", fontSize: 11.5 }}>{a.active ? "Armed" : "Paused"}</span>
              <button className="icbtn" onClick={() => del(a.id)} title="Delete"><svg viewBox="0 0 24 24"><path d="M5 7h14M9 7V5h6v2M7 7l1 13h8l1-13" /></svg></button>
            </div>
          ))}
        </div>
      </div></main>
      <div className="ticker"><span className="lbl">Alerts</span><span style={{ color: "var(--text-2)" }}>Signal/regime-cross alerts fire on each Polygon refresh · live intraday triggers arrive with the live feed</span></div>
    </div>
  );
}
