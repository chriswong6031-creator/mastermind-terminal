"use client";
import { useEffect, useRef, useState } from "react";
import { useLang, useT } from "@/lib/i18n";
import { getJSON } from "@/lib/dataCache";
import {
  optAlertPreview,
  buildOptCondition,
  canonicalizeOptAlertIdentity,
  isMarketWideOptKind,
  normalizeOptAlertRoot,
  type OptKind,
  type OptParams,
} from "@/lib/optionsAlerts";
import {
  SUITE_ALERT_EVENTS,
  suiteAlertPreview,
  suiteSequencePreview,
  type SuiteAlertCondition,
  type SuiteAlertEventDef,
  type SuiteSequenceCondition,
} from "@/lib/suiteAlerts";
import { SUITE_DEFS } from "@/lib/suites/registry";
import { useEntitlement } from "@/lib/useEntitlement";

type Alert = { id: string; symbol: string; condition: any; active: boolean; created_at: string };

// ── suite-event catalog (lib/suiteAlerts.ts is the authority for events + tiers) ──
type Tier = "free" | "essential" | "pro";
type CatalogEvt = SuiteAlertEventDef;
const TIER_RANK: Record<Tier, number> = { free: 0, essential: 1, pro: 2 };
/** Unrecognized tier → "pro": an event never renders as free on a typo. */
const evtTier = (e: CatalogEvt): Tier => (e.tier === "free" || e.tier === "essential" ? e.tier : "pro");
/** Distinct suites in catalog order (the picker's first cascade step). */
const SUITE_KEYS = Array.from(new Set(SUITE_ALERT_EVENTS.map((e) => e.suite)));

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
  { v: "opt_wall_migration", tkey: "condOptWallMigration" },
  { v: "opt_sign_fragile", tkey: "condOptSignFragile" },
  { v: "opt_opex_concentration", tkey: "condOptOpex" },
  { v: "opt_premium_burst", tkey: "condOptBurst" },
  { v: "opt_0dte_spike", tkey: "condOpt0dte" },
  { v: "opt_surface_pocket", tkey: "condOptPocket" },
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
    // suite events + sequences: same treatment — one bilingual sentence from the bridge
    if (c?.type === "suite_event") return suiteAlertPreview(c, lang === "zh" ? "zh" : "en");
    if (c?.type === "suite_sequence") return suiteSequencePreview(c, lang === "zh" ? "zh" : "en");
    return JSON.stringify(c);
  };
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loaded, setLoaded] = useState(false);
  // 401 from the list endpoint means NO SESSION — a real signed-out state, not an empty list.
  // Coercing it to {alerts:[]} showed anon visitors the signed-in "no alerts yet" copy, which
  // reads as "you have none" when the truth is "we can't see yours".
  const [signedOut, setSignedOut] = useState(false);
  // two-step delete: first click arms the row, second confirms (touch + keyboard safe)
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [syms, setSyms] = useState<string[]>([]);
  const [sym, setSym] = useState("NVDA");
  const [ctype, setCtype] = useState("signal_buy");
  const [val, setVal] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // ── options-flow sub-form state ─────────────────────────────────────────────
  const [cat, setCat] = useState<"signal" | "options" | "suite">("signal"); // condition category
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
    k: 4,
    near_pct: 5,
  });
  // ── suite-event sub-form state ──────────────────────────────────────────────
  // Entitlement drives which catalog events are selectable. useEntitlement returns the free
  // default for a guest AND on any read failure, so the picker fails CLOSED by construction;
  // the route re-checks server-side against the billing authority (this is display only).
  const ent = useEntitlement(email);
  // ent.tier is already normalized by useEntitlement (legacy `insider` → `essential`).
  const userTier: Tier = ent.tier === "essential" || ent.tier === "pro" ? ent.tier : "free";
  const isLockedEvt = (e: CatalogEvt) => TIER_RANK[userTier] < TIER_RANK[evtTier(e)];
  const [suiteKey, setSuiteKey] = useState<string>(SUITE_KEYS[0] ?? "");
  const [suiteEvent, setSuiteEvent] = useState<string>(
    SUITE_ALERT_EVENTS.find((e) => e.suite === (SUITE_KEYS[0] ?? ""))?.event ?? "",
  );
  const [suiteDir, setSuiteDir] = useState<"any" | "bull" | "bear">("any");
  const [suiteMinStr, setSuiteMinStr] = useState("");
  // ── suite SEQUENCE sub-form state (W4b: "event A then event B within N bars") ──
  const [suiteMode, setSuiteMode] = useState<"single" | "seq">("single");
  const firstSuiteEvts = SUITE_ALERT_EVENTS.filter((e) => e.suite === (SUITE_KEYS[0] ?? ""));
  const [seqEventA, setSeqEventA] = useState<string>(firstSuiteEvts[0]?.event ?? "");
  const [seqEventB, setSeqEventB] = useState<string>((firstSuiteEvts[1] ?? firstSuiteEvts[0])?.event ?? "");
  const [seqDirA, setSeqDirA] = useState<"any" | "bull" | "bear">("any");
  const [seqDirB, setSeqDirB] = useState<"any" | "bull" | "bear">("any");
  const [seqMaxBars, setSeqMaxBars] = useState("10");
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
    // 401 = no session → render the signed-out state, never a fake empty list.
    fetch("/api/alerts")
      .then((r) => {
        if (r.status === 401) {
          if (alive) setSignedOut(true);
          return { alerts: [] };
        }
        return r.json();
      })
      .then((d) => { if (alive) setAlerts(d.alerts || []); })
      .catch(() => {})
      .finally(() => { if (alive) setLoaded(true); });
    // manifest via dataCache (dedup + SWR) + mounted guard — mirrors ScreenerView (batch 1).
    // onRevalidate so a symbol added by the latest ingest is selectable on the first load
    // after it lands, rather than only after this browser's cached manifest expires.
    const applySyms = (m: any) => { if (alive) setSyms(Object.keys(m?.symbols || {})); };
    getJSON("/data/manifest.json", { onRevalidate: applySyms }).then(applySyms).catch(() => {});
    // D1: prefill from ?sym= ?price= ?type= query params (set by terminal "Add alert" context menu).
    // The Options workflow guide uses the separate cat/root/kind contract so it can land directly
    // on a truthful, source-gated options condition without overloading the legacy signal fields.
    try {
      const sp = new URLSearchParams(window.location.search);
      const qSym = sp.get("sym"); const qPrice = sp.get("price"); const qType = sp.get("type");
      const qCat = sp.get("cat"); const qRoot = sp.get("root"); const qKind = sp.get("kind");
      const wantsOptionsPrefill = qCat === "options";
      const normalizedRoot = qRoot === null ? "SPY" : normalizeOptAlertRoot(qRoot);
      const normalizedKind = qKind && OPT_TYPES.some((c) => c.v === qKind) ? qKind as OptKind : null;
      // Treat cat/root/kind as one contract. A malformed root or kind must not leak into the
      // hidden options form while another category is visible, nor turn into a row the POST
      // boundary later rejects. Missing root/kind use the form's canonical SPY/gamma defaults.
      const validOptionsPrefill = wantsOptionsPrefill
        && normalizedRoot !== null
        && (qKind === null || normalizedKind !== null);
      queueMicrotask(() => {
        if (!alive) return;
        if (qSym) setSym(qSym);
        if (qType && COND_TYPES.some((c) => c.v === qType)) setCtype(qType);
        if (qPrice && parseFloat(qPrice) > 0) setVal(parseFloat(qPrice).toString());
        if (validOptionsPrefill) {
          setCat("options");
          setOptRoot(normalizedRoot);
          if (normalizedKind) setOptKind(normalizedKind);
        }
      });
      // strip the params so a reload doesn't re-prefill
      if (qSym || qPrice || qType || qCat || qRoot || qKind) {
        const u = new URL(window.location.href);
        ["sym", "price", "type", "cat", "root", "kind"].forEach((k) => u.searchParams.delete(k));
        window.history.replaceState({}, "", u.toString());
      }
    } catch {}
    return () => { alive = false; clearTimeout(gateTimer.current); };
  }, []);

  // The condition the CURRENT form would POST (drives the preview + create()).
  const optCondition = buildOptCondition(optKind, optRoot, optParams);
  const marketWideOpt = isMarketWideOptKind(optKind);
  const setP = (patch: Partial<OptParams>) => setOptParams((p) => ({ ...p, ...patch }));

  // ── suite cascade: suite → event → optional dir / min-strength ──────────────
  const suiteEvts = SUITE_ALERT_EVENTS.filter((e) => e.suite === suiteKey);
  const curEvt = suiteEvts.find((e) => e.event === suiteEvent) ?? suiteEvts[0] ?? null;
  const suiteHasLocked = suiteEvts.some(isLockedEvt);
  const curLocked = !!curEvt && isLockedEvt(curEvt);
  // Changing suite re-points the event at the first one this account can actually use,
  // and resets BOTH sequence steps (steps must share one suite). Changing step A alone
  // never resets B.
  const pickSuite = (k: string) => {
    setSuiteKey(k);
    const evts = SUITE_ALERT_EVENTS.filter((e) => e.suite === k);
    const usable = evts.filter((e) => !isLockedEvt(e));
    setSuiteEvent((usable[0] ?? evts[0])?.event ?? "");
    setSeqEventA((usable[0] ?? evts[0])?.event ?? "");
    setSeqEventB((usable[1] ?? usable[0] ?? evts[0])?.event ?? "");
  };
  // ── sequence cascade: step A + step B from the SAME suite, per-step optional dir ──
  const seqEvtA = suiteEvts.find((e) => e.event === seqEventA) ?? suiteEvts[0] ?? null;
  const seqEvtB = suiteEvts.find((e) => e.event === seqEventB) ?? suiteEvts[0] ?? null;
  const seqLocked = (!!seqEvtA && isLockedEvt(seqEvtA)) || (!!seqEvtB && isLockedEvt(seqEvtB));
  const seqBarsNum = Math.round(parseFloat(seqMaxBars));
  const seqCondition: SuiteSequenceCondition | null = seqEvtA && seqEvtB
    ? {
        type: "suite_sequence",
        suite: suiteKey,
        steps: [
          { event: seqEvtA.event, ...(seqEvtA.dirs && seqDirA !== "any" ? { dir: seqDirA } : {}) },
          { event: seqEvtB.event, ...(seqEvtB.dirs && seqDirB !== "any" ? { dir: seqDirB } : {}) },
        ],
        maxBarsBetween: Number.isFinite(seqBarsNum) ? Math.max(2, Math.min(50, seqBarsNum)) : 10,
      }
    : null;
  const minStrNum = parseFloat(suiteMinStr);
  const suiteCondition: SuiteAlertCondition | null = curEvt
    ? {
        type: "suite_event",
        suite: curEvt.suite,
        event: curEvt.event,
        ...(curEvt.dirs && suiteDir !== "any" ? { dir: suiteDir } : {}),
        ...(curEvt.strength && Number.isFinite(minStrNum)
          ? { minStrength: Math.max(0, Math.min(100, minStrNum)) }
          : {}),
      }
    : null;

  async function create() {
    if (busy) return;
    // account gate: options alerts require a free account (RLS 401s anyway, but nudge first)
    if (cat === "options" && !email) { showGate(t("gateOptAlert")); return; }
    // suite alerts: account first, then tier. Locked events are unselectable, so this is the
    // belt to that suspenders (and the route re-checks against the billing authority anyway).
    if (cat === "suite") {
      if (!email) { showGate(t("gateSuiteAlert")); return; }
      if (suiteMode === "seq") {
        if (!seqCondition) return;
        if (seqLocked) { setErr(t("suiteLockedHint")); return; }
      } else {
        if (!suiteCondition) return;
        if (curLocked) { setErr(t("suiteLockedHint")); return; }
      }
    }
    setBusy(true); setErr(null);
    try {
      let symbol: string;
      let condition: Record<string, unknown>;
      if (cat === "options") {
        const identity = canonicalizeOptAlertIdentity(optRoot, optCondition);
        if (!identity) {
          setErr(t("couldNotCreateAlert"));
          return;
        }
        ({ symbol, condition } = identity);
      } else if (cat === "suite") {
        symbol = sym;
        condition = suiteMode === "seq" ? seqCondition! : suiteCondition!;
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
    setConfirmDel(null);
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

  // Shared event-option list (single event picker + sequence step A/B pickers).
  // Locked events stay VISIBLE but disabled, tier chip inline — same honesty rule as the
  // indicator picker: never a silent absence.
  const suiteEvtOptions = suiteEvts.map((e) => {
    const locked = isLockedEvt(e);
    const label = t(e.tkey, e.en);
    return (
      <option key={e.event} value={e.event} disabled={locked}>
        {locked ? `${label} · ${evtTier(e) === "pro" ? "PRO" : "INSIDER"}` : label}
      </option>
    );
  });
  const dirSelect = (val: "any" | "bull" | "bear", set: (v: "any" | "bull" | "bear") => void, label: string) => (
    <select aria-label={label} value={val} onChange={(e) => set(e.target.value as "any" | "bull" | "bear")}>
      <option value="any">{t("suiteDirAny")}</option>
      <option value="bull">{t("suiteDirBull")}</option>
      <option value="bear">{t("suiteDirBear")}</option>
    </select>
  );

  return (
    <main className="main2"><div className="pg">
        <div className="pg-head"><h2>{t("signalRegimeAlerts")}</h2><span className="sub">{t("alertsSub")}</span></div>
        <div className="panel">
          <div className="ph">{t("newAlert")}</div>
          <div className="alert-form">
            {/* category picker: signal/regime (legacy 6) · options flow (5) · suite events (catalog) */}
            <select aria-label={t("newAlert")} value={cat} onChange={(e) => setCat(e.target.value as "signal" | "options" | "suite")}>
              <option value="signal">{t("condCatSignal")}</option>
              <option value="options">{t("condCatOptions")}</option>
              <option value="suite">{t("condCatSuite")}</option>
            </select>

            {cat === "suite" ? (
              <>
                <select aria-label={t("symbol")} value={sym} onChange={(e) => setSym(e.target.value)}>{symOptions.map((s) => <option key={s} value={s}>{s}</option>)}</select>
                <select aria-label={t("condCatSuite")} value={suiteKey} onChange={(e) => pickSuite(e.target.value)}>
                  {SUITE_KEYS.map((k) => {
                    const def = SUITE_DEFS[k];
                    return <option key={k} value={k}>{def ? (def.tkey ? t(def.tkey, def.label) : def.label) : k}</option>;
                  })}
                </select>
                {/* mode toggle: single event vs two-step sequence ("A then B within N bars") */}
                <select aria-label={t("condSuiteSeq")} value={suiteMode} onChange={(e) => setSuiteMode(e.target.value as "single" | "seq")}>
                  <option value="single">{t("suiteEventLabel")}</option>
                  <option value="seq">{t("condSuiteSeq")}</option>
                </select>
                {suiteMode === "single" ? (
                  <>
                    <select aria-label={t("suiteEventLabel")} value={curEvt?.event ?? ""} onChange={(e) => setSuiteEvent(e.target.value)}>
                      {suiteEvtOptions}
                    </select>
                    {curEvt?.dirs && dirSelect(suiteDir, setSuiteDir, t("suiteDir"))}
                    {curEvt?.strength && (
                      <label className="opt-field">{t("suiteMinStrength")}<input aria-label={t("suiteMinStrength")} type="number" step="5" min="0" max="100" value={suiteMinStr} onChange={(ev) => setSuiteMinStr(ev.target.value)} style={numStyle} /></label>
                    )}
                  </>
                ) : (
                  <>
                    <select aria-label={`${t("suiteEventLabel")} A`} value={seqEvtA?.event ?? ""} onChange={(e) => setSeqEventA(e.target.value)}>
                      {suiteEvtOptions}
                    </select>
                    {seqEvtA?.dirs && dirSelect(seqDirA, setSeqDirA, `${t("suiteDir")} A`)}
                    <span className="opt-field" style={{ color: "var(--muted)", fontSize: 12 }}>{t("suiteSeqThen")}</span>
                    <select aria-label={`${t("suiteEventLabel")} B`} value={seqEvtB?.event ?? ""} onChange={(e) => setSeqEventB(e.target.value)}>
                      {suiteEvtOptions}
                    </select>
                    {seqEvtB?.dirs && dirSelect(seqDirB, setSeqDirB, `${t("suiteDir")} B`)}
                    <label className="opt-field">{t("suiteSeqWithin")}<input aria-label={`${t("suiteSeqWithin")} ${t("suiteSeqBars")}`} type="number" step="1" min="2" max="50" value={seqMaxBars} onChange={(ev) => setSeqMaxBars(ev.target.value)} style={numStyle} />{t("suiteSeqBars")}</label>
                  </>
                )}
                {suiteHasLocked && (
                  <span className="opt-field" style={{ color: "var(--muted)", fontSize: 11.5, gap: 5 }} title={t("suiteLockedHint")}>
                    <svg viewBox="0 0 24 24" aria-hidden="true" style={{ width: 12, height: 12, stroke: "currentColor", fill: "none", strokeWidth: 1.8 }}>
                      <rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" />
                    </svg>
                    {t("suiteLockedHint")}
                  </span>
                )}
              </>
            ) : cat === "signal" ? (
              <>
                <select aria-label={t("symbol")} value={sym} onChange={(e) => setSym(e.target.value)}>{symOptions.map((s) => <option key={s} value={s}>{s}</option>)}</select>
                <select aria-label={t("newAlert")} value={ctype} onChange={(e) => setCtype(e.target.value)}>{COND_TYPES.map((c) => <option key={c.v} value={c.v}>{t(c.tkey)}</option>)}</select>
                {needsVal && <input aria-label={t("alertValue")} type="number" placeholder={t("alertValue")} value={val} onChange={(e) => setVal(e.target.value)} style={{ width: 110 }} />}
              </>
            ) : (
              <>
                {!marketWideOpt && (
                  <select aria-label={t("optRoot")} value={optRoot} onChange={(e) => setOptRoot(e.target.value)}>{rootOptions.map((s) => <option key={s} value={s}>{s}</option>)}</select>
                )}
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
                {optKind === "opt_wall_migration" && (
                  <>
                    <select aria-label={t("optWall")} value={optParams.wall} onChange={(e) => setP({ wall: e.target.value as "call" | "put" })}>
                      <option value="call">{t("optWallCall")}</option>
                      <option value="put">{t("optWallPut")}</option>
                    </select>
                    <label className="opt-field">{t("optMinMovePct")}<input aria-label={t("optMinMovePct")} type="number" step="0.1" min="0" value={optParams.min_move_pct ?? ""} onChange={(e) => setP({ min_move_pct: parseFloat(e.target.value) })} style={numStyle} /></label>
                  </>
                )}
                {optKind === "opt_sign_fragile" && (
                  <label className="opt-field">{t("optTiltPct")}<input aria-label={t("optTiltPct")} type="number" step="1" min="0" max="100" value={optParams.tilt_pct ?? ""} onChange={(e) => setP({ tilt_pct: parseFloat(e.target.value) })} style={numStyle} /></label>
                )}
                {optKind === "opt_opex_concentration" && (
                  <label className="opt-field">{t("optSharePct")}<input aria-label={t("optSharePct")} type="number" step="1" min="0" max="100" value={optParams.share_pct ?? ""} onChange={(e) => setP({ share_pct: parseFloat(e.target.value) })} style={numStyle} /></label>
                )}
                {optKind === "opt_surface_pocket" && (
                  <>
                    <label className="opt-field">{t("optPocketK")}<input aria-label={t("optPocketK")} type="number" step="0.5" min="1" value={optParams.k ?? ""} onChange={(e) => setP({ k: parseFloat(e.target.value) })} style={numStyle} /></label>
                    <label className="opt-field">{t("optNearPct")}<input aria-label={t("optNearPct")} type="number" step="1" min="1" max="50" value={optParams.near_pct ?? ""} onChange={(e) => setP({ near_pct: parseFloat(e.target.value) })} style={numStyle} /></label>
                  </>
                )}
              </>
            )}

            <button className="btn btn-primary" style={{ height: 34 }} onClick={create} disabled={busy}>{busy ? t("creating") : t("createAlert")}</button>
            {err && <span style={{ color: "var(--danger)", fontSize: 12.5 }}>{err}</span>}
          </div>
          {/* plain-word "what will fire" preview — options + suite events */}
          {cat === "options" && (
            <div className="opt-preview">
              <span className="opt-preview-lbl">{t("optWillFire")}</span>
              <span className="opt-preview-txt">{optAlertPreview(optCondition, lang === "zh" ? "zh" : "en")}</span>
            </div>
          )}
          {cat === "suite" && (suiteMode === "seq" ? seqCondition : suiteCondition) && (
            <div className="opt-preview">
              <span className="opt-preview-lbl">{t("optWillFire")}</span>
              <span className="opt-preview-txt">
                {suiteMode === "seq"
                  ? suiteSequencePreview(seqCondition!, lang === "zh" ? "zh" : "en")
                  : suiteAlertPreview(suiteCondition!, lang === "zh" ? "zh" : "en")}
              </span>
            </div>
          )}
        </div>
        <div className="panel">
          <div className="ph">{t("activeAlerts")}{!signedOut && <span className="sub">{alerts.length} {t("total")}</span>}</div>
          {!loaded && <div style={{ padding: "26px 15px", color: "var(--muted)", fontSize: 13 }}>{t("loadingAlerts")}</div>}
          {/* Signed out: say so plainly. "No alerts yet" would be a lie — we cannot see theirs. */}
          {loaded && signedOut && (
            <div className="alerts-signedout">
              <div className="alerts-signedout-h">{t("alertsSignedOutTitle")}</div>
              <p className="alerts-signedout-p">{t("alertsSignedOutBody")}</p>
              <a className="btn btn-primary" href="/login">{t("gateSignupCta")}</a>
            </div>
          )}
          {loaded && !signedOut && alerts.length === 0 && <div style={{ padding: "26px 15px", color: "var(--muted)", fontSize: 13 }}>{t("noAlertsYet")}</div>}
          {!signedOut && alerts.map((a) => {
            const trig = !a.active && a.condition?.triggered; // engine one-shot: fired -> disarmed + stamped
            const note = trig ? String(a.condition.triggered.note ?? "") : "";
            const tval = trig ? a.condition.triggered.value : null;
            return (
              <div key={a.id} className="arow">
                <span className={`dot${a.active ? "" : " off"}`} style={trig ? { background: "var(--signal)" } : undefined} />
                <span><span className="tk">{a.symbol}</span> <span className="cond">· {condText(a.condition)}</span></span>
                {trig ? <button className="btn" style={{ height: 26, fontSize: 11.5, justifySelf: "end" }} onClick={() => rearm(a.id)}>{t("rearm")}</button> : <span />}
                <span style={{ color: "var(--muted)", fontSize: 11.5 }}>{fmtDate(a.created_at)}</span>
                {trig ? (
                  <span style={{ color: "var(--signal)", fontSize: 11.5 }}>
                    {t("triggeredAt")} {fmtDate(a.condition.triggered.at)}
                  </span>
                ) : (
                  <span style={{ color: a.active ? "var(--up)" : "var(--muted)", fontSize: 11.5 }}>{a.active ? t("armed") : t("paused")}</span>
                )}
                <button className="icbtn" aria-label={t("remove")} onClick={() => setConfirmDel((c) => (c === a.id ? null : a.id))}><svg viewBox="0 0 24 24"><path d="M5 7h14M9 7V5h6v2M7 7l1 13h8l1-13" /></svg></button>
                {/* WHY it fired — was title=-only, invisible to touch and keyboard.
                    The note is composed server-side by ingest/alerts_engine.py and stored
                    as one English string, so it does NOT follow the UI language. Tagged
                    lang="en" so assistive tech reads it correctly in the ZH view; making
                    the engine emit a translated note is a separate contract change. */}
                {trig && note && (
                  <span className="arow-note" lang="en">{note}{tval != null ? ` · ${tval}` : ""}</span>
                )}
                {confirmDel === a.id && (
                  <span className="arow-confirm" role="group" aria-label={t("deleteAlertQ")}>
                    <span className="arow-confirm-q">{t("deleteAlertQ")}</span>
                    <button className="btn btn-danger" onClick={() => del(a.id)}>{t("deleteConfirm")}</button>
                    <button className="btn" onClick={() => setConfirmDel(null)}>{t("deleteCancel")}</button>
                  </span>
                )}
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
