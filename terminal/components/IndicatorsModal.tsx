"use client";
import { useState } from "react";

const CATS: Record<string, { key: string; label: string; mm?: boolean }[]> = {
  Mastermind: [{ key: "_oracle", label: "Golden Oracle Confluence", mm: true }, { key: "_score", label: "Confluence Score", mm: true }, { key: "_regime", label: "Sniper Regime", mm: true }],
  Trend: [{ key: "ema", label: "Moving Averages (EMA 20/50/200)" }, { key: "bb", label: "Bollinger Bands" }, { key: "vwap", label: "VWAP" }, { key: "macd", label: "MACD" }],
  Momentum: [{ key: "rsi", label: "RSI" }, { key: "stochrsi", label: "Stochastic RSI" }],
  Volume: [{ key: "vol", label: "Volume" }],
};

export default function IndicatorsModal({ open, active, onClose, onToggle }:
  { open: boolean; active: Set<string>; onClose: () => void; onToggle: (k: string) => void }) {
  const [cat, setCat] = useState("Mastermind");
  if (!open) return null;
  return (
    <div className="scrim" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="imodal" onClick={(e) => e.stopPropagation()}>
        <div className="mh"><b>Indicators, metrics &amp; strategies</b><span className="x" onClick={onClose}>✕</span></div>
        <div className="ib">
          <div className="inav">
            <div className="grp">Library</div>
            {Object.keys(CATS).map((c) => <a key={c} className={`${cat === c ? "on" : ""}${c === "Mastermind" ? " mm" : ""}`} onClick={() => setCat(c)}>{c}</a>)}
          </div>
          <div className="ilist">
            {CATS[cat].map((it) => { const on = it.mm ? true : active.has(it.key); const locked = it.mm;
              return (
                <div key={it.key} className={`li${on ? " on" : ""}`} onClick={() => { if (!locked) onToggle(it.key); }}>
                  {it.mm && <span className="mmdot" />}{it.label}
                  {locked ? <span className="lk" title="Always on (proprietary)"><svg width="13" height="13" viewBox="0 0 24 24" style={{ fill: "currentColor" }}><path d="M12 1a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2h-1V6a5 5 0 0 0-5-5zm3 8H9V6a3 3 0 0 1 6 0z" /></svg></span>
                    : <span className="chk"><svg viewBox="0 0 24 24"><path d="M4 12l5 5L20 6" /></svg></span>}
                </div>
              ); })}
          </div>
        </div>
      </div>
    </div>
  );
}
