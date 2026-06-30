"use client";
// Full functional per-indicator settings dialog. For a built-in it renders the registry's Inputs +
// Style fields and writes them straight into the shared indParams (the chart re-runs live). For the
// Pine custom script it edits the script's declared input() params the same way the editor does.

import { useEffect } from "react";
import { IND_DEFS, withDefaults, isIndKey, type IndField } from "@/lib/indicators";

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

export default function IndicatorSettings({ indKey, params, onChange, pine, onPineChange, onClose, onReset }:
  { indKey: string;
    params: Record<string, any>;
    onChange: (patch: Record<string, any>) => void;
    pine?: { name: string; params: Record<string, any> } | null;
    onPineChange?: (patch: Record<string, any>) => void;
    onClose: () => void;
    onReset?: () => void;
  }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const isPine = indKey === "pine";
  const def = isIndKey(indKey) ? IND_DEFS[indKey] : null;
  const title = isPine ? (pine?.name || "Custom script") : def?.label || indKey;

  // Pine: edit declared inputs (numbers/bools) like the editor
  const pineEntries = isPine && pine ? Object.entries(pine.params) : [];
  const inputs = def ? def.fields.filter((f) => f.group === "inputs") : [];
  const styles = def ? def.fields.filter((f) => f.group === "style") : [];
  const P = def ? withDefaults(indKey, params) : params;

  return (
    <div className="scrim" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ind-set" onClick={(e) => e.stopPropagation()}>
        <div className="is-head"><b>{title}</b><span className="x" onClick={onClose} aria-label="Close">✕</span></div>
        <div className="is-body">
          {isPine ? (
            pineEntries.length === 0
              ? <div className="is-empty">This script declares no inputs.</div>
              : <div className="is-sec"><div className="is-sec-h">Inputs</div>
                  {pineEntries.map(([k, v]) => (
                    <div key={k} className="is-row">
                      <span className="is-label">{k}</span>
                      {typeof v === "boolean"
                        ? <span className={`is-switch${v ? " on" : ""}`} onClick={() => onPineChange?.({ [k]: !v })} role="switch" aria-checked={v} />
                        : typeof v === "number"
                          ? <NumberField value={v} step={Number.isInteger(v) ? 1 : 0.1} onChange={(nv) => onPineChange?.({ [k]: nv })} />
                          : <input className="is-text" value={String(v)} onChange={(e) => onPineChange?.({ [k]: e.target.value })} />}
                    </div>
                  ))}
                </div>
          ) : def ? (
            <>
              {inputs.length > 0 && <div className="is-sec"><div className="is-sec-h">Inputs</div>{inputs.map((f) => <Row key={f.key} f={f} val={P[f.key]} onChange={(v) => onChange({ [f.key]: v })} />)}</div>}
              {styles.length > 0 && <div className="is-sec"><div className="is-sec-h">Style</div>{styles.map((f) => <Row key={f.key} f={f} val={P[f.key]} onChange={(v) => onChange({ [f.key]: v })} />)}</div>}
            </>
          ) : <div className="is-empty">No settings for this item.</div>}
        </div>
        <div className="is-foot">
          {!isPine && onReset && <button className="btn btn-ghost" onClick={onReset}>Reset</button>}
          <div className="spacer" />
          <button className="ai" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
