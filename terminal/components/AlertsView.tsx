"use client";
import { useEffect, useState } from "react";
import { BrandLockup } from "@/components/BrandMark";
import { AppNav } from "@/components/AppNav";
import { useT } from "@/lib/i18n";
import { getJSON } from "@/lib/dataCache";

type Alert = { id: string; symbol: string; condition: any; active: boolean; created_at: string };

const COND_TYPES = [
  { v: "signal_buy", tkey: "condSignalBuy", cond: { type: "signal", target: "BUY" }, needsVal: false },
  { v: "signal_sell", tkey: "condSignalSell", cond: { type: "signal", target: "SELL" }, needsVal: false },
  { v: "regime_up", tkey: "condRegimeUp", cond: { type: "regime", target: "up" }, needsVal: false },
  { v: "price_above", tkey: "condPriceAbove", cond: { type: "price", op: "above" }, needsVal: true },
  { v: "price_below", tkey: "condPriceBelow", cond: { type: "price", op: "below" }, needsVal: true },
  { v: "rsi_below", tkey: "condRsiBelow", cond: { type: "rsi", op: "below" }, needsVal: true },
];

export default function AlertsView({ email }: { email: string }) {
  const t = useT();
  const condText = (c: any) => {
    if (c?.type === "signal") return c.target === "BUY" ? t("condSignalBuy") : t("condSignalSell");
    if (c?.type === "regime") return t("condRegimeUp");
    if (c?.type === "price") return `${c.op === "above" ? t("condPriceAbove") : t("condPriceBelow")} ${c.value}`;
    if (c?.type === "rsi") return `${t("condRsiBelow")} ${c.value}`;
    return JSON.stringify(c);
  };
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [syms, setSyms] = useState<string[]>([]);
  const [sym, setSym] = useState("NVDA");
  const [ctype, setCtype] = useState("signal_buy");
  const [val, setVal] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    // 401 = no session — treat as empty list (calm, no console error).
    fetch("/api/alerts").then((r) => r.status === 401 ? { alerts: [] } : r.json()).then((d) => { if (alive) setAlerts(d.alerts || []); }).catch(() => {}).finally(() => { if (alive) setLoaded(true); });
    // manifest via dataCache (dedup + SWR) + mounted guard — mirrors ScreenerView (batch 1).
    getJSON("/data/manifest.json").then((m) => { if (alive) setSyms(Object.keys(m?.symbols || {})); }).catch(() => {});
    // D1: prefill from ?sym= ?price= ?type= query params (set by terminal "Add alert" context menu)
    try {
      const sp = new URLSearchParams(window.location.search);
      const qSym = sp.get("sym"); const qPrice = sp.get("price"); const qType = sp.get("type");
      if (qSym) setSym(qSym);
      if (qType && COND_TYPES.some((c) => c.v === qType)) setCtype(qType);
      if (qPrice && parseFloat(qPrice) > 0) setVal(parseFloat(qPrice).toString());
      // strip the params so a reload doesn't re-prefill
      if (qSym || qPrice || qType) { const u = new URL(window.location.href); ["sym","price","type"].forEach((k) => u.searchParams.delete(k)); window.history.replaceState({}, "", u.toString()); }
    } catch {}
    return () => { alive = false; };
  }, []);

  async function create() {
    if (busy) return;
    setBusy(true); setErr(null);
    try {
      const ct = COND_TYPES.find((x) => x.v === ctype)!;
      const condition = { ...ct.cond, ...(ct.needsVal ? { value: parseFloat(val) || 0 } : {}) };
      const r = await fetch("/api/alerts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbol: sym, condition }) });
      const d = await r.json().catch(() => ({}));
      if (d.alert) { setAlerts((a) => [d.alert, ...a]); setVal(""); }
      else setErr(d.error || t("couldNotCreateAlert"));
    } catch {
      setErr(t("alertNetErr"));
    } finally {
      setBusy(false);
    }
  }
  async function rearm(id: string) {
    try {
      const r = await fetch("/api/alerts", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      const d = await r.json().catch(() => ({}));
      if (d.alert) setAlerts((a) => a.map((x) => (x.id === id ? d.alert : x)));
      else setErr(d.error || t("couldNotRearm"));
    } catch {
      setErr(t("couldNotRearm"));
    }
  }
  async function del(id: string) {
    const removed = alerts.find((x) => x.id === id);
    setAlerts((a) => a.filter((x) => x.id !== id));     // optimistic
    try {
      const r = await fetch(`/api/alerts?id=${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error();
    } catch {
      // re-insert ONLY the failed item (functional update preserves any concurrent deletes)
      if (removed) setAlerts((a) => (a.some((x) => x.id === removed.id) ? a : [removed, ...a]));
      setErr(t("couldNotDeleteAlert"));
    }
  }
  const needsVal = COND_TYPES.find((x) => x.v === ctype)?.needsVal;
  // the manifest may not have loaded yet (or may omit the default) — keep the selected symbol selectable
  const symOptions = syms.length ? (syms.includes(sym) ? syms : [sym, ...syms]) : [sym];

  return (
    <div className="app2">
      <header className="topbar">
        <BrandLockup /><div className="tdiv" /><span className="page-title">{t("pageAlerts")}</span>
        <div className="spacer" />
        <form action="/auth/signout" method="post"><button className="avatar" title={`${email} · sign out`}>{(email || "U")[0].toUpperCase()}</button></form>
      </header>
      <AppNav />
      <main className="main2"><div className="pg">
        <div className="pg-head"><h2>{t("signalRegimeAlerts")}</h2><span className="sub">{t("alertsSub")}</span></div>
        <div className="panel">
          <div className="ph">{t("newAlert")}</div>
          <div className="alert-form">
            <select aria-label={t("symbol")} value={sym} onChange={(e) => setSym(e.target.value)}>{symOptions.map((s) => <option key={s} value={s}>{s}</option>)}</select>
            <select aria-label={t("newAlert")} value={ctype} onChange={(e) => setCtype(e.target.value)}>{COND_TYPES.map((c) => <option key={c.v} value={c.v}>{t(c.tkey)}</option>)}</select>
            {needsVal && <input aria-label={t("alertValue")} type="number" placeholder={t("alertValue")} value={val} onChange={(e) => setVal(e.target.value)} style={{ width: 110 }} />}
            <button className="btn btn-primary" style={{ height: 34 }} onClick={create} disabled={busy}>{busy ? t("creating") : t("createAlert")}</button>
            {err && <span style={{ color: "var(--danger)", fontSize: 12.5 }}>{err}</span>}
          </div>
        </div>
        <div className="panel">
          <div className="ph">{t("activeAlerts")}<span className="sub">{alerts.length} {t("total")}</span></div>
          {!loaded && <div style={{ padding: "26px 15px", color: "var(--muted)", fontSize: 13 }}>{t("loadingAlerts")}</div>}
          {loaded && alerts.length === 0 && <div style={{ padding: "26px 15px", color: "var(--muted)", fontSize: 13 }}>{t("noAlertsYet")}</div>}
          {alerts.map((a) => {
            const trig = !a.active && a.condition?.triggered; // engine one-shot: fired -> disarmed + stamped
            return (
              <div key={a.id} className="arow">
                <span className={`dot${a.active ? "" : " off"}`} style={trig ? { background: "var(--signal)" } : undefined} />
                <span><span className="tk">{a.symbol}</span> <span className="cond">· {condText(a.condition)}</span></span>
                {trig ? <button className="btn" style={{ height: 26, fontSize: 11.5, justifySelf: "end" }} onClick={() => rearm(a.id)}>{t("rearm")}</button> : <span />}
                <span style={{ color: "var(--muted)", fontSize: 11.5 }}>{new Date(a.created_at).toLocaleDateString()}</span>
                {trig ? (
                  <span style={{ color: "var(--signal)", fontSize: 11.5 }} title={`${a.condition.triggered.note ?? ""}${a.condition.triggered.value != null ? ` · ${a.condition.triggered.value}` : ""}`}>
                    {t("triggeredAt")} {new Date(a.condition.triggered.at).toLocaleDateString()}
                  </span>
                ) : (
                  <span style={{ color: a.active ? "var(--up)" : "var(--muted)", fontSize: 11.5 }}>{a.active ? t("armed") : t("paused")}</span>
                )}
                <button className="icbtn" onClick={() => del(a.id)} title={t("remove")}><svg viewBox="0 0 24 24"><path d="M5 7h14M9 7V5h6v2M7 7l1 13h8l1-13" /></svg></button>
              </div>
            );
          })}
        </div>
      </div></main>
      <div className="ticker"><span className="lbl">{t("pageAlerts")}</span></div>
    </div>
  );
}
