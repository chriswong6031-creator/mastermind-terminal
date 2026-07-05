"use client";
// "Compare symbols" dialog. Search the universe and add a symbol to the active chart in one of three
// scale modes (Same % scale / New price scale / New pane). Added symbols are listed at the top with a
// checkmark that turns into an ✕ on hover for one-click removal. Stays open so several can be added.
import { useEffect, useRef, useState } from "react";
import { type CompareItem, type CmpMode, CMP_MODES } from "@/lib/compare";

type Row = { name: string; col: string; verdict: string | null; mkt?: string; zh?: string };

export default function CompareModal({ open, seed, manifest, added, active, onClose, onAdd, onRemove }:
  { open: boolean; seed: string; manifest: Record<string, Row>; added: CompareItem[]; active: string;
    onClose: () => void; onAdd: (sym: string, mode: CmpMode) => void; onRemove: (sym: string) => void }) {
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open) { setQ(seed || ""); setTimeout(() => inputRef.current?.focus(), 10); } }, [open, seed]);
  useEffect(() => { if (!open) return; const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, [open, onClose]);
  if (!open) return null;

  const addedSet = new Set(added.map((c) => c.sym));
  const ql = q.trim().toLowerCase();
  const results = Object.entries(manifest)
    .filter(([s, r]) => s !== active && (!ql || s.toLowerCase().includes(ql) || r.name.toLowerCase().includes(ql) || (!!r.zh && r.zh.toLowerCase().includes(ql))))
    .slice(0, 40);

  return (
    <div className="scrim" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="cmpmodal" onClick={(e) => e.stopPropagation()}>
        <div className="ch"><b>Compare symbols</b><span className="x" onClick={onClose}>✕</span></div>
        <div className="sh">
          <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
          <input ref={inputRef} value={q} placeholder="Symbol or company…" onChange={(e) => setQ(e.target.value)} />
          <span className="esc" onClick={onClose}>ESC</span>
        </div>
        <div className="cmpbody">
          {added.length > 0 && (
            <div className="cmp-added">
              <div className="cmp-grp">Added symbols</div>
              {added.map((c) => { const r = manifest[c.sym]; const mode = CMP_MODES.find((m) => m.key === c.mode);
                return (
                  <div className="cmp-r is-added" key={c.sym}>
                    <span className="ic" style={{ background: c.color, color: "#04130a" }}>{c.sym[0]}</span>
                    <div className="meta"><div className="tk">{c.sym}</div><div className="nm">{r?.name || ""}</div></div>
                    <span className="cmp-mode">{mode?.label}</span>
                    <button className="cmp-ck" title="Remove from chart" onClick={() => onRemove(c.sym)} aria-label="Remove">
                      <svg className="ck-on" viewBox="0 0 24 24"><path d="M4 12l5 5L20 6" /></svg>
                      <svg className="ck-off" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg>
                    </button>
                  </div>
                ); })}
            </div>
          )}
          <div className="cmp-res">
            {results.length === 0 && <div className="empty">No supported symbol matches “{q}”.</div>}
            {results.map(([s, r]) => { const isAdded = addedSet.has(s);
              return (
                <div className={`cmp-r${isAdded ? " in" : ""}`} key={s}>
                  <span className="ic" style={{ background: r.col }}>{s[0]}</span>
                  <div className="meta"><div className="tk">{s}</div><div className="nm">{r.name}{r.mkt ? ` · ${r.mkt}` : ""}</div></div>
                  {isAdded
                    ? <span className="cmp-mode in"><svg viewBox="0 0 24 24"><path d="M4 12l5 5L20 6" /></svg>Added</span>
                    : <span className="cmp-acts">{CMP_MODES.map((m) => <button key={m.key} title={m.hint} onClick={() => onAdd(s, m.key)}>{m.label}</button>)}</span>}
                </div>
              ); })}
          </div>
        </div>
      </div>
    </div>
  );
}
