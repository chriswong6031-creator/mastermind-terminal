"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useT } from "@/lib/i18n";
import { type UserScript } from "@/lib/userScripts";
import { SUITE_DEFS, SUITE_ORDER } from "@/lib/suites/registry";

const CATS: Record<string, { key: string; label: string; mm?: boolean; tkey?: string }[]> = {
  Mastermind: [{ key: "_oracle", label: "Golden Oracle Confluence", mm: true }],
  Trend: [{ key: "ema", label: "Moving Averages (EMA 20/50/200)" }, { key: "bb", label: "Bollinger Bands" }, { key: "vwap", label: "VWAP" }, { key: "rvwap", label: "Rolling VWAP (20)", tkey: "indRvwap" }, { key: "wvwap", label: "Weekly VWAP", tkey: "indWvwap" }, { key: "avwap", label: "Anchored VWAP", tkey: "indAvwap" }, { key: "macd", label: "MACD-RSI" }],
  Momentum: [{ key: "rsi", label: "RSI" }, { key: "stochrsi", label: "Stochastic RSI" }],
  "Price Action": [{ key: "gaps", label: "Gap Zones" }],
  Volume: [{ key: "vol", label: "Volume" }, { key: "vprofile", label: "Volume Profile", tkey: "indVprofile" }],
  // Day Trade suite — spec §2 order: overlays then panes
  daytrade: [
    { key: "svwap", label: "Session VWAP", tkey: "indSvwap" },
    { key: "orb", label: "Opening Range", tkey: "indOrb" },
    { key: "slevels", label: "Session Levels", tkey: "indSlevels" },
    { key: "pivots", label: "Pivot Points", tkey: "indPivots" },
    { key: "rvol", label: "Relative Volume", tkey: "indRvol" },
    { key: "ttmsq", label: "TTM Squeeze", tkey: "indTtmsq" },
    { key: "adx", label: "ADX", tkey: "indAdx" },
    { key: "cvd", label: "Est. CVD (approx)", tkey: "indCvd" },
  ],
};
const CAT_TKEY: Record<string, string> = { Mastermind: "catMastermind", Trend: "catTrend", Momentum: "catMomentum", "Price Action": "catPriceAction", Volume: "catVolume", daytrade: "catDaytrade" };
const MY_SCRIPTS = "__scripts__";   // synthetic category key for the My Scripts section
const PRO_SUITES = "__suites__";    // synthetic category key for the premium suites band

type Tier = "free" | "insider" | "pro";
const TIER_RANK: Record<Tier, number> = { free: 0, insider: 1, pro: 2 };
/** A suite is addable at the lowest tier that unlocks ANY of its modules; deeper modules lock in Settings. */
const suiteMinTier = (k: string): Tier => {
  const def = SUITE_DEFS[k]; if (!def) return "pro";
  let min: Tier = "pro";
  for (const m of def.modules) if (TIER_RANK[m.tier] < TIER_RANK[min]) min = m.tier;
  return min;
};
/** Highest module tier — shown on the row chip so the packaging reads honestly. */
const suiteTopTier = (k: string): Tier => {
  const def = SUITE_DEFS[k]; if (!def) return "pro";
  let top: Tier = "free";
  for (const m of def.modules) if (TIER_RANK[m.tier] > TIER_RANK[top]) top = m.tier;
  return top;
};

export default function IndicatorsModal({ open, active, onClose, onToggle, scripts = [], enabled, onToggleScript, onRenameScript, onDeleteScript, userTier = "free" }:
  { open: boolean; active: Set<string>; onClose: () => void; onToggle: (k: string) => void;
    scripts?: UserScript[]; enabled?: Set<string>; onToggleScript?: (id: string) => void; onRenameScript?: (id: string, name: string) => void; onDeleteScript?: (id: string) => void;
    userTier?: Tier }) {
  const t = useT();
  const [cat, setCat] = useState<string>(PRO_SUITES);
  const [renaming, setRenaming] = useState<string | null>(null);   // scriptId being inline-renamed
  const [draft, setDraft] = useState("");
  // close on Escape, matching SearchModal's behavior
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;

  const commitRename = (id: string) => { const nm = draft.trim(); if (nm) onRenameScript?.(id, nm); setRenaming(null); };

  return (
    <div className="scrim" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="imodal" onClick={(e) => e.stopPropagation()}>
        <div className="mh"><b>{t("indicatorsTitle")}</b><span className="x" onClick={onClose}>✕</span></div>
        <div className="ib">
          <div className="inav">
            <div className="grp">{t("library")}</div>
            <a className={`${cat === PRO_SUITES ? "on" : ""} mm`} onClick={() => setCat(PRO_SUITES)}>★ {t("catProSuites", "Pro Suites")}</a>
            {Object.keys(CATS).map((c) => <a key={c} className={`${cat === c ? "on" : ""}${c === "Mastermind" ? " mm" : ""}`} onClick={() => setCat(c)}>{t(CAT_TKEY[c] || c, c)}</a>)}
            <a className={cat === MY_SCRIPTS ? "on" : ""} onClick={() => setCat(MY_SCRIPTS)}>{t("myScripts")}</a>
          </div>
          <div className="ilist">
            {cat === MY_SCRIPTS ? (
              scripts.length === 0 ? (
                <div className="li-empty">
                  {t("noScriptsYet")} <Link href="/scripts" className="li-link" onClick={onClose}>{t("openPineEditor")}</Link>
                </div>
              ) : scripts.map((s) => { const on = !!enabled?.has(s.id);
                return (
                  <div key={s.id} className={`li${on ? " on" : ""}`}>
                    {renaming === s.id ? (
                      <input className="li-rename" autoFocus value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => { if (e.key === "Enter") commitRename(s.id); else if (e.key === "Escape") setRenaming(null); }}
                        onBlur={() => commitRename(s.id)} />
                    ) : (
                      <span className="li-nm" onClick={() => onToggleScript?.(s.id)}>{s.name}{s.locked && <span className="li-tag">{t("readOnly")}</span>}</span>
                    )}
                    <span className="li-acts" onClick={(e) => e.stopPropagation()}>
                      {!s.locked && <button className="li-ic" title={t("rename")} aria-label={t("rename")} onClick={() => { setDraft(s.name); setRenaming(s.id); }}>
                        <svg viewBox="0 0 24 24"><path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3M13.5 6.5l3 3" /></svg></button>}
                      <Link className="li-ic" href={`/scripts?id=${encodeURIComponent(s.id)}`} title={t("editScript")} aria-label={t("editScript")} onClick={onClose}>
                        <svg viewBox="0 0 24 24"><path d="M8 6l-5 6 5 6M16 6l5 6-5 6" /></svg></Link>
                      {!s.locked && <button className="li-ic del" title={t("delete")} aria-label={t("delete")} onClick={() => { if (window.confirm(t("deleteScriptConfirm"))) onDeleteScript?.(s.id); }}>
                        <svg viewBox="0 0 24 24"><path d="M5 7h14M9 7V5h6v2M7 7l1 13h8l1-13" /></svg></button>}
                      <span className="chk" onClick={() => onToggleScript?.(s.id)}><svg viewBox="0 0 24 24"><path d="M4 12l5 5L20 6" /></svg></span>
                    </span>
                  </div>
                ); })
            ) : cat === PRO_SUITES ? (
              SUITE_ORDER.map((k) => {
                const def = SUITE_DEFS[k]; if (!def) return null;
                const on = active.has(k);
                const locked = TIER_RANK[userTier] < TIER_RANK[suiteMinTier(k)];
                const top = suiteTopTier(k);
                return (
                  <div key={k} className={`li${on ? " on" : ""}${locked ? " li-locked" : ""}`}
                    onClick={() => { if (!locked) onToggle(k); }}
                    title={locked ? t("suiteLockedHint", "Included with a paid plan — upgrade to unlock") : undefined}>
                    <span className="mmdot" />{def.tkey ? t(def.tkey, def.label) : def.label}
                    <span className="li-tag" style={{ marginLeft: 6 }}>{top === "pro" ? "PRO" : "INSIDER"}</span>
                    <span className="li-mods">{def.modules.length} {t("suiteModulesWord", "modules")}</span>
                    {locked
                      ? <span className="li-lock" aria-label={t("suiteLockedHint", "Included with a paid plan — upgrade to unlock")}>
                          <svg viewBox="0 0 24 24" style={{ width: 13, height: 13, stroke: "currentColor", fill: "none", strokeWidth: 1.8 }}><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
                        </span>
                      : <span className="chk"><svg viewBox="0 0 24 24"><path d="M4 12l5 5L20 6" /></svg></span>}
                  </div>
                );
              })
            ) : CATS[cat].map((it) => { const on = active.has(it.key);
              return (
                <div key={it.key} className={`li${on ? " on" : ""}`} onClick={() => onToggle(it.key)}>
                  {it.mm && <span className="mmdot" />}{it.tkey ? t(it.tkey, it.label) : it.label}
                  <span className="chk"><svg viewBox="0 0 24 24"><path d="M4 12l5 5L20 6" /></svg></span>
                </div>
              ); })}
          </div>
        </div>
      </div>
    </div>
  );
}
