"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useT } from "@/lib/i18n";
import { type UserScript } from "@/lib/userScripts";

const CATS: Record<string, { key: string; label: string; mm?: boolean }[]> = {
  Mastermind: [{ key: "_oracle", label: "Golden Oracle Confluence", mm: true }],
  Trend: [{ key: "ema", label: "Moving Averages (EMA 20/50/200)" }, { key: "bb", label: "Bollinger Bands" }, { key: "vwap", label: "VWAP" }, { key: "macd", label: "MACD" }],
  Momentum: [{ key: "rsi", label: "RSI" }, { key: "stochrsi", label: "Stochastic RSI" }],
  Volume: [{ key: "vol", label: "Volume" }],
};
const CAT_TKEY: Record<string, string> = { Mastermind: "catMastermind", Trend: "catTrend", Momentum: "catMomentum", Volume: "catVolume" };
const MY_SCRIPTS = "__scripts__";   // synthetic category key for the My Scripts section

export default function IndicatorsModal({ open, active, onClose, onToggle, scripts = [], enabled, onToggleScript, onRenameScript, onDeleteScript }:
  { open: boolean; active: Set<string>; onClose: () => void; onToggle: (k: string) => void;
    scripts?: UserScript[]; enabled?: Set<string>; onToggleScript?: (id: string) => void; onRenameScript?: (id: string, name: string) => void; onDeleteScript?: (id: string) => void }) {
  const t = useT();
  const [cat, setCat] = useState("Mastermind");
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
            ) : CATS[cat].map((it) => { const on = active.has(it.key);
              return (
                <div key={it.key} className={`li${on ? " on" : ""}`} onClick={() => onToggle(it.key)}>
                  {it.mm && <span className="mmdot" />}{it.label}
                  <span className="chk"><svg viewBox="0 0 24 24"><path d="M4 12l5 5L20 6" /></svg></span>
                </div>
              ); })}
          </div>
        </div>
      </div>
    </div>
  );
}
