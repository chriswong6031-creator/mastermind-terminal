"use client";
// Full functional per-indicator settings dialog, structured like TradingView: Inputs / Style /
// Visibility tabs. Every change applies live and is auto-persisted (TerminalShell writes indParams to
// localStorage), so settings survive across sessions. Cancel reverts to the snapshot taken on open;
// the "Defaults ▾" menu resets to the registry defaults. For the Pine custom script it edits the
// script's declared input() params instead.

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { IND_DEFS, withDefaults, isIndKey, defaultVis, VIS_UNITS, type IndField, type VisUnit, type VisRange } from "@/lib/indicators";
import { isSuiteKey, getSuiteDef, suiteDefaults } from "@/lib/suites/registry";
import type { SuiteField, SuiteModuleDef, SuiteTier } from "@/lib/indicator-canvas/types";
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

// ──────────────────────────────────────────────────────────── premium suites (module accordion)
// A suite is ONE picker entry whose modules toggle inside this dialog. Settings live in the same
// flat indParams[suiteKey] blob the classic path uses, with "<module>.<field>" keys, so snapshot /
// cancel-revert / persistence all keep working unchanged.

type Tier = "free" | "insider" | "pro";
const TIER_RANK: Record<Tier, number> = { free: 0, insider: 1, pro: 2 };
const TIER_LABEL: Record<SuiteTier, string> = { free: "FREE", insider: "INSIDER", pro: "PRO" };
// insider = brand accent, pro = the AI violet. Never up/down (tier is not a direction).
const TIER_COLOR: Record<SuiteTier, string> = { free: "var(--muted)", insider: "var(--brand-2)", pro: "var(--ai)" };

const SIZE_OPTS = [{ v: 0, label: "Tiny" }, { v: 1, label: "Small" }, { v: 2, label: "Normal" }, { v: 3, label: "Large" }];
const LINESTYLE_OPTS = [{ v: "solid", label: "Solid" }, { v: "dashed", label: "Dashed" }, { v: "dotted", label: "Dotted" }];
// select values may be numbers stored as numbers but compared to string-typed showIf/option values
const sameVal = (a: any, b: any) => a === b || (a != null && b != null && String(a) === String(b));

function SelectField({ value, options, onChange }: { value: any; options: Array<{ v: string | number; label: string }>; onChange: (v: any) => void }) {
  const cur = options.find((o) => sameVal(o.v, value)) ?? options[0];
  return (
    <select className="is-select" value={cur ? String(cur.v) : ""} onChange={(e) => { const o = options.find((x) => String(x.v) === e.target.value); if (o) onChange(o.v); }}>
      {options.map((o) => <option key={String(o.v)} value={String(o.v)}>{o.label}</option>)}
    </select>
  );
}

function SuiteRow({ f, val, onChange }: { f: SuiteField; val: any; onChange: (v: any) => void }) {
  const opts = f.type === "select" ? (f.options ?? [])
    : f.type === "size" ? (f.options ?? SIZE_OPTS)
      : f.type === "linestyle" ? (f.options ?? LINESTYLE_OPTS) : null;
  return (
    <>
      <div className="is-row">
        <span className="is-label">{f.label}</span>
        {f.type === "number" && <NumberField value={typeof val === "number" ? val : 0} min={f.min} max={f.max} step={f.step} onChange={onChange} />}
        {f.type === "color" && <ColorField value={String(val ?? "#888888")} onChange={onChange} />}
        {f.type === "bool" && <span className={`is-switch${val ? " on" : ""}`} onClick={() => onChange(!val)} role="switch" aria-checked={!!val} tabIndex={0}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onChange(!val); } }} />}
        {opts && opts.length > 0 && <SelectField value={val} options={opts} onChange={onChange} />}
      </div>
      {f.tip && <div className="is-tip">{f.tip}</div>}
    </>
  );
}

function ModuleSection({ m, values, locked, expanded, onToggle, onChange, onGuide, t }:
  { m: SuiteModuleDef; values: Record<string, any>; locked: boolean; expanded: boolean;
    onToggle: () => void; onChange: (patch: Record<string, any>) => void; onGuide?: () => void; t: (k: string, f?: string) => string }) {
  const on = !!values[`${m.key}.on`] && !locked;
  const setOn = () => { if (!locked) onChange({ [`${m.key}.on`]: !on }); };
  const shown = m.fields.filter((f) => !f.showIf || sameVal(values[`${m.key}.${f.showIf.key}`], f.showIf.eq));
  const unlockNote = m.tier === "pro" ? t("isSuiteUnlockPro", "Unlocks with PRO") : t("isSuiteUnlockInsider", "Unlocks with INSIDER");
  return (
    <div className={`is-mod${locked ? " locked" : ""}${on ? "" : " off"}`}>
      <div className="is-mod-h"
        role={locked ? undefined : "button"}
        tabIndex={locked ? undefined : 0}
        aria-expanded={locked ? undefined : expanded}
        onClick={locked ? undefined : onToggle}
        onKeyDown={locked ? undefined : (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(); } }}>
        <svg className="caret" viewBox="0 0 24 24" style={{ transform: expanded && !locked ? "rotate(90deg)" : "none" }}><path d="M9 5l7 7-7 7" /></svg>
        <span className="is-mod-name">{m.label}</span>
        <span className="is-modtag">{m.tag}</span>
        {onGuide && <button className="is-guide" title={t("guideOpen", "Guide")} aria-label={t("guideOpen", "Guide")}
          onClick={(e) => { e.stopPropagation(); onGuide(); }}>?</button>}
        {m.tier !== "free" && <span className="is-tier" style={{ "--c": TIER_COLOR[m.tier] } as CSSProperties}>{TIER_LABEL[m.tier]}</span>}
        {locked && <svg className="is-lock" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 11h12v9H6z" /><path d="M9 11V7.5a3 3 0 0 1 6 0V11" /></svg>}
        <span className={`is-switch${on ? " on" : ""}${locked ? " dis" : ""}`} role="switch" aria-checked={on}
          aria-disabled={locked || undefined} aria-label={m.label} tabIndex={locked ? -1 : 0}
          onClick={(e) => { e.stopPropagation(); setOn(); }}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); e.preventDefault(); setOn(); } }} />
      </div>
      {locked && <div className="is-locked-note">{unlockNote}</div>}
      {expanded && !locked && (
        <div className="is-mod-b">
          {shown.length
            ? shown.map((f) => <SuiteRow key={f.key} f={f} val={values[`${m.key}.${f.key}`]} onChange={(v) => onChange({ [`${m.key}.${f.key}`]: v })} />)
            : <div className="is-empty">{t("isEmptyNoInputs", "No inputs for this indicator.")}</div>}
        </div>
      )}
    </div>
  );
}

export default function IndicatorSettings({ indKey, params, onChange, pine, onPineChange, onClose, onReset, userTier = "free", onOpenGuide }:
  { indKey: string;
    params: Record<string, any>;
    onChange: (patch: Record<string, any>) => void;
    pine?: { name: string; params: Record<string, any> } | null;
    onPineChange?: (patch: Record<string, any>) => void;
    onClose: () => void;
    onReset?: () => void;
    onOpenGuide?: (suiteKey: string, moduleKey: string, moduleLabel: string) => void;
    userTier?: Tier;   // fail closed: unknown/absent entitlement = free
  }) {
  const t = useT();
  const [tab, setTab] = useState<"inputs" | "style" | "visibility">("inputs");
  const [defOpen, setDefOpen] = useState(false);
  // explicit user collapse/expand overrides per suite module; absent = default (expanded iff enabled + unlocked)
  const [modOpen, setModOpen] = useState<Record<string, boolean>>({});
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
  const suite = isSuiteKey(indKey) ? getSuiteDef(indKey) : null;
  const def = isIndKey(indKey) ? IND_DEFS[indKey] : null;
  const title = suite ? (suite.tkey ? t(suite.tkey, suite.label) : suite.label)
    : isPine ? (pine?.name || "Custom script") : def?.label || indKey;

  // effective suite values: registry defaults under whatever the user has saved (indParams may be
  // sparse — TerminalShell's withDefaults() has no entry for a suite key)
  const SV: Record<string, any> = suite ? { ...suiteDefaults(indKey), ...params } : {};
  const rank = TIER_RANK[userTier] ?? 0;
  const isLocked = (m: SuiteModuleDef) => rank < (TIER_RANK[m.tier] ?? 0);

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
          {tab === "inputs" && (suite ? (
            <div className="is-mods">
              {suite.modules.map((m) => {
                const locked = isLocked(m);
                return (
                  <ModuleSection key={m.key} m={m} values={SV} locked={locked}
                    expanded={!locked && (modOpen[m.key] ?? !!SV[`${m.key}.on`])}
                    onToggle={() => setModOpen((o) => ({ ...o, [m.key]: !(o[m.key] ?? !!SV[`${m.key}.on`]) }))}
                    onChange={onChange} t={t}
                    onGuide={onOpenGuide ? () => onOpenGuide(indKey, m.key, m.label) : undefined} />
                );
              })}
            </div>
          ) : isPine ? (
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

          {tab === "style" && (suite
            ? <div className="is-empty">{t("isSuiteStyleHint", "Suite styling lives with each module's inputs.")}</div>
            : def && styles.length
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
