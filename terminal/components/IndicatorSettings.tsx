"use client";
// Full functional per-indicator settings dialog, structured like TradingView: Inputs / Style /
// Visibility tabs. Every change applies live and is auto-persisted (TerminalShell writes indParams to
// localStorage), so settings survive across sessions. Cancel reverts to the snapshot taken on open;
// the "Defaults ▾" menu resets to the registry defaults. For the Pine custom script it edits the
// script's declared input() params instead.

import { useEffect, useRef, useState } from "react";
import { IND_DEFS, withDefaults, isIndKey, defaultVis, VIS_UNITS, type IndField, type VisUnit, type VisRange } from "@/lib/indicators";
import { useT } from "@/lib/i18n";

const SWATCHES = ["#4d82ff", "#26c281", "#f0566b", "#e8b339", "#e8a33d", "#9d86ff", "#19c2c2", "#d6dae3", "#868d9c", "#ff8a3d"];
const hexOf = (c: string) => (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c) ? c : "#888888");
// preserve any alpha the current color carries, so translucent fills (volume/MACD histograms) stay translucent
const alphaOf = (c: string) => { const m = /rgba?\([^)]*,\s*([\d.]+)\s*\)/i.exec(c); return m ? parseFloat(m[1]) : 1; };
const hexToRgba = (hex: string, a: number) => { let h = hex.replace("#", ""); if (h.length === 3) h = h.split("").map((x) => x + x).join(""); const n = parseInt(h, 16); const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255; return a >= 1 ? `#${h}` : `rgba(${r}, ${g}, ${b}, ${a})`; };

function NumberField({ value, min, max, step = 1, onChange }: { value: number; min?: number; max?: number; step?: number; onChange: (v: number) => void }) {
  const clamp = (v: number) => Math.max(min ?? -Infinity, Math.min(max ?? Infinity, +v.toFixed(4)));
  return (
    <span className="is-stepper">
      <button onClick={() => onChange(clamp(value - step))} aria-label="decrease">−</button>
      <input type="number" value={value} step={step} min={min} max={max} onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) onChange(clamp(v)); }} />
      <button onClick={() => onChange(clamp(value + step))} aria-label="increase">+</button>
    </span>
  );
}

function ColorField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const apply = (hex: string) => onChange(hexToRgba(hex, alphaOf(value)));
  return (
    <span className="is-color">
      <span className="is-sw-cur" style={{ background: value }} />
      {SWATCHES.map((s) => <button key={s} className={`is-sw${value === s ? " on" : ""}`} style={{ background: s }} title={s} onClick={() => apply(s)} />)}
      <input type="color" value={hexOf(value)} onChange={(e) => apply(e.target.value)} aria-label="custom color" />
    </span>
  );
}

function Row({ f, val, onChange }: { f: IndField; val: any; onChange: (v: any) => void }) {
  return (
    <div className="is-row">
      <span className="is-label">{f.label}</span>
      {f.type === "number" && <NumberField value={typeof val === "number" ? val : 0} min={f.min} max={f.max} step={f.step} onChange={onChange} />}
      {f.type === "color" && <ColorField value={String(val ?? "#888888")} onChange={onChange} />}
      {f.type === "bool" && <span className={`is-switch${val ? " on" : ""}`} onClick={() => onChange(!val)} role="switch" aria-checked={!!val} />}
    </div>
  );
}

// one interval-visibility row: enable checkbox + min / slider(max) / max
function VisRow({ label, unitMax, val, onChange }: { label: string; unitMax: number; val: VisRange; onChange: (patch: Partial<VisRange>) => void }) {
  const clampMin = (v: number) => Math.max(1, Math.min(val.max, Math.round(v)));
  const clampMax = (v: number) => Math.max(val.min, Math.min(unitMax, Math.round(v)));
  return (
    <div className="vis-row">
      <span className={`is-cbx${val.on ? " on" : ""}`} onClick={() => onChange({ on: !val.on })} role="checkbox" aria-checked={val.on}>
        <svg viewBox="0 0 24 24"><path d="M4 12l5 5L20 6" /></svg>
      </span>
      <span className="vis-name">{label}</span>
      <input className="vis-num" type="number" min={1} max={val.max} value={val.min} disabled={!val.on} onChange={(e) => { const v = parseInt(e.target.value); if (!isNaN(v)) onChange({ min: clampMin(v) }); }} />
      <input className="vis-slider" type="range" min={1} max={unitMax} value={val.max} disabled={!val.on} onChange={(e) => onChange({ max: clampMax(parseInt(e.target.value)) })} />
      <input className="vis-num" type="number" min={val.min} max={unitMax} value={val.max} disabled={!val.on} onChange={(e) => { const v = parseInt(e.target.value); if (!isNaN(v)) onChange({ max: clampMax(v) }); }} />
    </div>
  );
}

export default function IndicatorSettings({ indKey, params, onChange, pine, onPineChange, onClose, onReset }:
  { indKey: string;
    params: Record<string, any>;
    onChange: (patch: Record<string, any>) => void;
    pine?: { name: string; params: Record<string, any> } | null;
    onPineChange?: (patch: Record<string, any>) => void;
    onClose: () => void;
    onReset?: () => void;
  }) {
  const t = useT();
  const [tab, setTab] = useState<"inputs" | "style" | "visibility">("inputs");
  const [defOpen, setDefOpen] = useState(false);
  // snapshot the params at open so Cancel can revert this editing session (changes otherwise auto-save live)
  const snap = useRef(params);
  const pineSnap = useRef(pine?.params);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  useEffect(() => { if (!defOpen) return; const close = () => setDefOpen(false); window.addEventListener("click", close); return () => window.removeEventListener("click", close); }, [defOpen]);

  const isPine = indKey === "pine";
  const def = isIndKey(indKey) ? IND_DEFS[indKey] : null;
  const title = isPine ? (pine?.name || "Custom script") : def?.label || indKey;

  const pineEntries = isPine && pine ? Object.entries(pine.params) : [];
  const inputs = def ? def.fields.filter((f) => f.group === "inputs") : [];
  const styles = def ? def.fields.filter((f) => f.group === "style") : [];
  const P = def ? withDefaults(indKey, params) : params;
  const vis: Record<VisUnit, VisRange> = (P._vis as any) || defaultVis();
  const setVis = (unit: VisUnit, patch: Partial<VisRange>) => onChange({ _vis: { ...vis, [unit]: { ...vis[unit], ...patch } } });

  const cancel = () => {
    if (isPine) { /* revert pine inputs to the snapshot */ const cur = pine?.params || {}; const back: Record<string, any> = {}; for (const k of Object.keys(cur)) back[k] = (pineSnap.current as any)?.[k]; onPineChange?.(back); }
    else onChange(snap.current);   // snapshot has all fields → merge restores the open-time state
    onClose();
  };

  const TABS: ["inputs" | "style" | "visibility", string][] = [["inputs", t("isTabInputs", "Inputs")], ["style", t("isTabStyle", "Style")], ["visibility", t("isTabVisibility", "Visibility")]];

  return (
    <div className="scrim" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ind-set" onClick={(e) => e.stopPropagation()}>
        <div className="is-head"><b>{title}</b><span className="x" onClick={onClose} aria-label="Close">✕</span></div>
        <div className="is-tabs">
          {TABS.map(([k, l]) => <button key={k} className={`is-tab${tab === k ? " on" : ""}`} onClick={() => setTab(k)}>{l}</button>)}
        </div>
        <div className="is-body">
          {tab === "inputs" && (isPine ? (
            pineEntries.length === 0
              ? <div className="is-empty">{t("isEmptyNoInputsPine", "This script declares no inputs.")}</div>
              : pineEntries.map(([k, v]) => (
                <div key={k} className="is-row">
                  <span className="is-label">{k}</span>
                  {typeof v === "boolean"
                    ? <span className={`is-switch${v ? " on" : ""}`} onClick={() => onPineChange?.({ [k]: !v })} role="switch" aria-checked={v} />
                    : typeof v === "number"
                      ? <NumberField value={v} step={Number.isInteger(v) ? 1 : 0.1} onChange={(nv) => onPineChange?.({ [k]: nv })} />
                      : <input className="is-text" value={String(v)} onChange={(e) => onPineChange?.({ [k]: e.target.value })} />}
                </div>
              ))
          ) : def ? (
            inputs.length ? inputs.map((f) => <Row key={f.key} f={f} val={P[f.key]} onChange={(v) => onChange({ [f.key]: v })} />) : <div className="is-empty">{t("isEmptyNoInputs", "No inputs for this indicator.")}</div>
          ) : <div className="is-empty">{t("isEmptyNoSettings", "No settings for this item.")}</div>)}

          {tab === "style" && (def && styles.length
            ? styles.map((f) => <Row key={f.key} f={f} val={P[f.key]} onChange={(v) => onChange({ [f.key]: v })} />)
            : <div className="is-empty">{t("isEmptyNoStyle", "No style options.")}</div>)}

          {tab === "visibility" && (
            <div className="vis-list">
              <div className="vis-head">{t("isVisHead", "Show this indicator on these timeframes (daily-EOD data — minutes/hours are unavailable).")}</div>
              {VIS_UNITS.map((u) => <VisRow key={u.key} label={u.label} unitMax={u.max} val={vis[u.key]} onChange={(patch) => setVis(u.key, patch)} />)}
            </div>
          )}
        </div>
        <div className="is-foot">
          <div className="is-def pophost" onClick={(e) => e.stopPropagation()}>
            <button className="is-def-btn" onClick={() => setDefOpen((o) => !o)}>{t("isDefaults", "Defaults")} <svg viewBox="0 0 24 24" style={{ width: 12, height: 12, stroke: "currentColor", fill: "none", strokeWidth: 2, transform: defOpen ? "rotate(180deg)" : "none" }}><path d="M6 15l6-6 6 6" /></svg></button>
            {defOpen && <div className="is-def-menu">
              <div className="is-def-row" onClick={() => { setDefOpen(false); if (isPine) cancel(); else onReset?.(); }}>{t("isResetSettings", "Reset settings")}</div>
            </div>}
          </div>
          <div className="spacer" />
          <button className="btn btn-ghost" onClick={cancel}>{t("cancel", "Cancel")}</button>
          <button className="ai" onClick={onClose}>{t("isOk", "Ok")}</button>
        </div>
      </div>
    </div>
  );
}
