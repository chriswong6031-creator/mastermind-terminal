"use client";
// Settings dialog for a compare symbol (opened from its legend row). Edits its line color and scale
// mode, and can remove it from the chart. Reuses the indicator-settings dialog styling.
import { useEffect } from "react";
import { type CompareItem, CMP_MODES, CMP_PALETTE } from "@/lib/compare";

export default function CompareSettings({ item, onChange, onClose, onRemove }:
  { item: CompareItem; onChange: (patch: Partial<CompareItem>) => void; onClose: () => void; onRemove: () => void }) {
  useEffect(() => { const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, [onClose]);
  const hex = /^#([0-9a-f]{6})$/i.test(item.color) ? item.color : "#888888";
  return (
    <div className="scrim" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ind-set" onClick={(e) => e.stopPropagation()}>
        <div className="is-head"><b>{item.sym}<span style={{ color: "var(--text-dim)", fontWeight: 500 }}> · compare</span></b><span className="x" onClick={onClose} aria-label="Close">✕</span></div>
        <div className="is-body">
          <div className="is-row">
            <span className="is-label">Line color</span>
            <span className="is-color">
              <span className="is-sw-cur" style={{ background: item.color }} />
              {CMP_PALETTE.map((s) => <button key={s} className={`is-sw${item.color === s ? " on" : ""}`} style={{ background: s }} title={s} onClick={() => onChange({ color: s })} />)}
              <input type="color" value={hex} onChange={(e) => onChange({ color: e.target.value })} aria-label="custom color" />
            </span>
          </div>
          <div className="is-sec-h">Scale</div>
          {CMP_MODES.map((m) => (
            <div key={m.key} className={`set-row${item.mode === m.key ? " on" : ""}`} style={{ padding: "8px 0" }} onClick={() => onChange({ mode: m.key })}>
              <span className="rdo" /><span><b style={{ color: "var(--text)", fontWeight: 550 }}>{m.label}</b><div style={{ color: "var(--text-dim)", fontSize: 11, marginTop: 2 }}>{m.hint}</div></span>
            </div>
          ))}
        </div>
        <div className="is-foot">
          <button className="btn btn-ghost" onClick={onRemove}>Remove from chart</button>
          <div className="spacer" />
          <button className="ai" onClick={onClose}>Ok</button>
        </div>
      </div>
    </div>
  );
}
