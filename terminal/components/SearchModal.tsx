"use client";
import { useEffect, useRef, useState } from "react";

type Row = { name: string; col: string; verdict: string | null; mkt?: string };
const isBuy = (v: string | null) => v === "BUY" || v === "REBUY";

export default function SearchModal({ open, seed, manifest, inWatchlist, onClose, onPick, onAdd }:
  { open: boolean; seed: string; manifest: Record<string, Row>; inWatchlist: Set<string>; onClose: () => void; onPick: (s: string) => void; onAdd: (s: string) => void }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open) { setQ(seed || ""); setSel(0); setTimeout(() => inputRef.current?.focus(), 10); } }, [open, seed]);
  if (!open) return null;

  const ql = q.trim().toLowerCase();
  const results = Object.entries(manifest).filter(([s, r]) => !ql || s.toLowerCase().includes(ql) || r.name.toLowerCase().includes(ql)).slice(0, 30);

  function key(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
    else if (e.key === "Enter" && results[sel]) { onPick(results[sel][0]); onClose(); }
    else if (e.key === "Escape") onClose();
  }

  return (
    <div className="scrim" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="smodal" onClick={(e) => e.stopPropagation()}>
        <div className="sh">
          <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
          <input ref={inputRef} value={q} placeholder="Search symbol or company…" onChange={(e) => { setQ(e.target.value); setSel(0); }} onKeyDown={key} />
          <span className="esc">ESC</span>
        </div>
        <div className="sres">
          {results.length === 0 && <div className="empty">No supported symbol matches “{q}”.</div>}
          {results.map(([s, r], i) => { const added = inWatchlist.has(s); const buy = isBuy(r.verdict);
            return (
              <div key={s} className={`r${i === sel ? " sel" : ""}`} onMouseEnter={() => setSel(i)} onClick={() => { onPick(s); onClose(); }}>
                <span className="ic" style={{ background: r.col }}>{s[0]}</span>
                <div><div className="tk">{s}</div><div className="nm">{r.name}</div></div>
                <div className="vr">
                  {r.mkt && <span className="mkt">{r.mkt}</span>}
                  {r.verdict && <span className="verd" style={{ color: buy ? "var(--buy)" : "var(--sell)", background: buy ? "rgba(38,194,129,.13)" : "rgba(240,86,107,.13)" }}>{r.verdict}</span>}
                  <button className={`add${added ? " added" : ""}`} title={added ? "In watchlist" : "Add to watchlist"} onClick={(e) => { e.stopPropagation(); onAdd(s); }}>
                    {added ? <svg viewBox="0 0 24 24"><path d="M4 12l5 5L20 6" /></svg> : <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>}
                  </button>
                </div>
              </div>
            ); })}
        </div>
      </div>
    </div>
  );
}
