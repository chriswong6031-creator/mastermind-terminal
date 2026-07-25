"use client";
import { useEffect, useRef, useState } from "react";
import { useLang, useT } from "@/lib/i18n";
import { getJSON } from "@/lib/dataCache";
import {
  optAlertPreview,
  buildOptCondition,
  type OptKind,
  type OptParams,
} from "@/lib/optionsAlerts";

type Alert = { id: string; symbol: string; condition: any; active: boolean; created_at: string };

const COND_TYPES = [
  { v: "signal_buy", tkey: "condSignalBuy", cond: { type: "signal", target: "BUY" }, needsVal: false },
  { v: "signal_sell", tkey: "condSignalSell", cond: { type: "signal", target: "SELL" }, needsVal: false },
  { v: "regime_up", tkey: "condRegimeUp", cond: { type: "regime", target: "up" }, needsVal: false },
  { v: "price_above", tkey: "condPriceAbove", cond: { type: "price", op: "above" }, needsVal: true },
  { v: "price_below", tkey: "condPriceBelow", cond: { type: "price", op: "below" }, needsVal: true },
  { v: "rsi_below", tkey: "condRsiBelow", cond: { type: "rsi", op: "below" }, needsVal: true },
];

// Options-flow condition types (account-gated). Each maps to an OptKind + a param schema the
// form renders; the condition is built by buildOptCondition so the shape stays in sync with the
// pure evaluators + the Python engine.
const OPT_TYPES: { v: OptKind; tkey: string }[] = [
  { v: "opt_gamma_flip", tkey: "condOptGammaFlip" },
  { v: "opt_wall_touch", tkey: "condOptWall" },
  { v: "opt_premium_burst", tkey: "condOptBurst" },
  { v: "opt_0dte_spike", tkey: "condOpt0dte" },
];
// Index roots that always carry gex/gexstate structure payloads (the picker offers these plus the
// manifest symbols). SPY default.
const OPT_ROOTS = ["SPY", "QQQ", "IWM"];

export default function AlertsView({ email }: { email: string }) {
  const t = useT();
  const { lang } = useLang();
  const fmtDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString(lang === "zh" ? "zh-CN" : "en-US");
    } catch {
      return iso.slice(0, 10);
    }
  };
  const condText = (c: any) => {
    if (c?.type === "signal") return c.target === "BUY" ? t("condSignalBuy") : t("condSignalSell");
    if (c?.type === "regime") return t("condRegimeUp");
    if (c?.type === "price") return `${c.op === "above" ? t("condPriceAbove") : t("condPriceBelow")} ${c.value}`;
    if (c?.type === "rsi") return `${t("condRsiBelow")} ${c.value}`;
    // options-flow types: reuse the plain-word preview (already display-tier + bilingual)
    if (typeof c?.type === "string" && c.type.startsWith("opt_")) return optAlertPreview(c, lang === "zh" ? "zh" : "en");
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
  // ── options-flow sub-form state ─────────────────────────────────────────────
  const [cat, setCat] = useState<"signal" | "options">("signal"); // condition category
  const [optKind, setOptKind] = useState<OptKind>("opt_gamma_flip");
  const [optRoot, setOptRoot] = useState("SPY");
  const [optParams, setOptParams] = useState<OptParams>({
    band_pct: 0.05,
    within_pct: 0.25,
    wall: "call",
    window_min: 10,
    z: 2,
    leg: "ncp",
    share_pct: 55,
  });
  // ── anon gate toast (AlertsView is its own page, not under TerminalShell) ────
  const [gateNudge, setGateNudge] = useState<string | null>(null);
  const gateTimer = useRef<any>(null);
  const showGate = (msg: string) => {
    setGateNudge(msg);
    clearTimeout(gateTimer.current);
    gateTimer.current = setTimeout(() => setGateNudge(null), 5000);
  };

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
    return () => { alive = false; clearTimeout(gateTimer.current); };
  }, []);

  // The condition the CURRENT form would POST (drives the preview + create()).
  const optCondition = buildOptCondition(optKind, optRoot, optParams);
  const setP = (patch: Partial<OptParams>) => setOptParams((p) => ({ ...p, ...patch }));

  async function create() {
    if (busy) return;
    // account gate: options alerts require a free account (RLS 401s anyway, but nudge first)
    if (cat === "options" && !email) { showGate(t("gateOptAlert")); return; }
    setBusy(true); setErr(null);
    try {
      let symbol: string;
      let condition: Record<string, unknown>;
      if (cat === "options") {
        symbol = optRoot;
        condition = optCondition;
      } else {
        const ct = COND_TYPES.find((x) => x.v === ctype)!;
        symbol = sym;
        condition = { ...ct.cond, ...(ct.needsVal ? { value: parseFloat(val) || 0 } : {}) };
      }
      const r = await fetch("/api/alerts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbol, condition }) });
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
  // root picker: index roots first, then manifest symbols (deduped), current selection guaranteed present
  const rootOptions = Array.from(new Set([...OPT_ROOTS, ...syms, optRoot]));

  const numStyle = { width: 84 } as const;

  return (
    <main className="main2"><div className="pg">
        <div className="pg-head"><h2>{t("signalRegimeAlerts")}</h2><span className="sub">{t("alertsSub")}</span></div>
        <div className="panel">
          <div className="ph">{t("newAlert")}</div>
          <div className="alert-form">
            {/* category picker: signal/regime (legacy 6) vs options flow (4) */}
            <select aria-label={t("newAlert")} value={cat} onChange={(e) => setCat(e.target.value as "signal" | "options")}>
              <option value="signal">{t("condCatSignal")}</option>
              <option value="options">{t("condCatOptions")}</option>
            </select>

            {cat === "signal" ? (
              <>
                <select aria-label={t("symbol")} value={sym} onChange={(e) => setSym(e.target.value)}>{symOptions.map((s) => <option key={s} value={s}>{s}</option>)}</select>
                <select aria-label={t("newAlert")} value={ctype} onChange={(e) => setCtype(e.target.value)}>{COND_TYPES.map((c) => <option key={c.v} value={c.v}>{t(c.tkey)}</option>)}</select>
                {needsVal && <input aria-label={t("alertValue")} type="number" placeholder={t("alertValue")} value={val} onChange={(e) => setVal(e.target.value)} style={{ width: 110 }} />}
              </>
            ) : (
              <>
                <select aria-label={t("optRoot")} value={optRoot} onChange={(e) => setOptRoot(e.target.value)}>{rootOptions.map((s) => <option key={s} value={s}>{s}</option>)}</select>
                <select aria-label={t("condCatOptions")} value={optKind} onChange={(e) => setOptKind(e.target.value as OptKind)}>{OPT_TYPES.map((c) => <option key={c.v} value={c.v}>{t(c.tkey)}</option>)}</select>
                {/* type-specific params */}
                {optKind === "opt_gamma_flip" && (
                  <label className="opt-field">{t("optBandPct")}<input aria-label={t("optBandPct")} type="number" step="0.01" min="0" value={optParams.band_pct ?? ""} onChange={(e) => setP({ band_pct: parseFloat(e.target.value) })} style={numStyle} /></label>
                )}
                {optKind === "opt_wall_touch" && (
                  <>
                    <select aria-label={t("optWall")} value={optParams.wall} onChange={(e) => setP({ wall: e.target.value as "call" | "put" })}>
                      <option value="call">{t("optWallCall")}</option>
                      <option value="put">{t("optWallPut")}</option>
                    </select>
                    <label className="opt-field">{t("optWithinPct")}<input aria-label={t("optWithinPct")} type="number" step="0.05" min="0" value={optParams.within_pct ?? ""} onChange={(e) => setP({ within_pct: parseFloat(e.target.value) })} style={numStyle} /></label>
                  </>
                )}
                {optKind === "opt_premium_burst" && (
                  <>
                    <select aria-label={t("optLeg")} value={optParams.leg} onChange={(e) => setP({ leg: e.target.value as "ncp" | "npp" })}>
                      <option value="ncp">{t("optLegNcp")}</option>
                      <option value="npp">{t("optLegNpp")}</option>
                    </select>
                    <label className="opt-field">{t("optWindowMin")}<input aria-label={t("optWindowMin")} type="number" step="1" min="1" value={optParams.window_min ?? ""} onChange={(e) => setP({ window_min: parseFloat(e.target.value) })} style={numStyle} /></label>
                    <label className="opt-field">{t("optZ")}<input aria-label={t("optZ")} type="number" step="0.5" min="0" value={optParams.z ?? ""} onChange={(e) => setP({ z: parseFloat(e.target.value) })} style={numStyle} /></label>
                  </>
                )}
                {optKind === "opt_0dte_spike" && (
                  <label className="opt-field">{t("optSharePct")}<input aria-label={t("optSharePct")} type="number" step="1" min="0" max="100" value={optParams.share_pct ?? ""} onChange={(e) => setP({ share_pct: parseFloat(e.target.value) })} style={numStyle} /></label>
                )}
              </>
            )}

            <button className="btn btn-primary" style={{ height: 34 }} onClick={create} disabled={busy}>{busy ? t("creating") : t("createAlert")}</button>
            {err && <span style={{ color: "var(--danger)", fontSize: 12.5 }}>{err}</span>}
          </div>
          {/* plain-word "what will fire" preview — options only */}
          {cat === "options" && (
            <div className="opt-preview">
              <span className="opt-preview-lbl">{t("optWillFire")}</span>
              <span className="opt-preview-txt">{optAlertPreview(optCondition, lang === "zh" ? "zh" : "en")}</span>
            </div>
          )}
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
                <span style={{ color: "var(--muted)", fontSize: 11.5 }}>{fmtDate(a.created_at)}</span>
                {trig ? (
                  <span style={{ color: "var(--signal)", fontSize: 11.5 }} title={`${a.condition.triggered.note ?? ""}${a.condition.triggered.value != null ? ` · ${a.condition.triggered.value}` : ""}`}>
                    {t("triggeredAt")} {fmtDate(a.condition.triggered.at)}
                  </span>
                ) : (
                  <span style={{ color: a.active ? "var(--up)" : "var(--muted)", fontSize: 11.5 }}>{a.active ? t("armed") : t("paused")}</span>
                )}
                <button className="icbtn" onClick={() => del(a.id)} title={t("remove")}><svg viewBox="0 0 24 24"><path d="M5 7h14M9 7V5h6v2M7 7l1 13h8l1-13" /></svg></button>
              </div>
            );
          })}
        </div>
      </div>
      {/* anon register nudge — options alerts require a free account */}
      {gateNudge && (
        <div className="undo-toast" role="status" style={{ position: "fixed", bottom: 96, left: "50%", transform: "translateX(-50%)", background: "var(--panel-3)", border: "1px solid var(--line-3)", borderRadius: "var(--r-md)", padding: "8px 16px", fontSize: 12.5, color: "var(--text)", boxShadow: "0 8px 24px -8px rgba(0,0,0,.7)", zIndex: 51, display: "flex", alignItems: "center", gap: 12 }}>
          <span>{gateNudge}</span>
          <a href="/login" style={{ color: "var(--brand-2)", fontWeight: 700, textDecoration: "none", whiteSpace: "nowrap" }}>{t("gateSignupCta")}</a>
        </div>
      )}
    </main>
  );
}
