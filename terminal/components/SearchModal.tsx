"use client";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useT } from "@/lib/i18n";
import { CMP_PALETTE } from "@/lib/compare";

type Row = { name: string; col: string; verdict: string | null; mkt?: string; zh?: string };
const isBuy = (v: string | null) => v === "BUY" || v === "REBUY";

// One dialog, two modes. "go" = jump to / add a symbol to the watchlist (the Cmd-K search).
// "compare" = a dedicated overlay picker: rows toggle the symbol onto the active chart, the dialog
// stays open so several can be layered, and the currently-overlaid symbols show as removable chips.
export default function SearchModal({ open, seed, manifest, inWatchlist, mode = "go", compare = [], active = "", onClose, onPick, onAdd, onToggleCompare }:
  {
    open: boolean; seed: string; manifest: Record<string, Row>; inWatchlist: Set<string>;
    mode?: "go" | "compare"; compare?: string[]; active?: string;
    onClose: () => void; onPick: (s: string) => void; onAdd: (s: string) => void; onToggleCompare?: (s: string) => void;
  }) {
  const t = useT();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open) { setQ(seed || ""); setSel(0); setTimeout(() => inputRef.current?.focus(), 10); } }, [open, seed]);

  // Defer the query so keystrokes are never blocked by filtering ~8 800-row manifest.
  const deferredQ = useDeferredValue(q);
  const cmp = mode === "compare";

  const results = useMemo(() => {
    const ql = deferredQ.trim().toLowerCase();
    return Object.entries(manifest)
      .filter(([s, r]) => (!cmp || s !== active) && (!ql || s.toLowerCase().includes(ql) || r.name.toLowerCase().includes(ql) || (!!r.zh && r.zh.toLowerCase().includes(ql))))
      .slice(0, 30);
  }, [deferredQ, manifest, cmp, active]);

  if (!open) return null;

  const added = compare.filter((c) => c !== active);

  function choose(sym: string) {
    if (cmp) onToggleCompare?.(sym);          // compare: toggle the overlay, keep the dialog open
    else { onPick(sym); onClose(); }          // go: jump to the symbol and close
  }
  function key(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
    else if (e.key === "Enter" && results[sel]) { choose(results[sel][0]); }
    else if (e.key === "Escape") onClose();
  }

  return (
    <div className="scrim" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`smodal${cmp ? " smodal-cmp" : ""}`} onClick={(e) => e.stopPropagation()}>
        {cmp && (
          <div className="scmp-h">
            <span className="scmp-t"><svg viewBox="0 0 24 24"><path d="M4 18l5-9 4 5 3-4 4 8" /></svg>{t("compareTitle")}</span>
            <span className="esc" onClick={onClose}>ESC</span>
          </div>
        )}
        <div className="sh">
          <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
          <input ref={inputRef} value={q} placeholder={cmp ? t("comparePlaceholder") : t("searchPlaceholder")} onChange={(e) => { setQ(e.target.value); setSel(0); }} onKeyDown={key} />
          {!cmp && <span className="esc">ESC</span>}
        </div>
        {cmp && added.length > 0 && (
          <div className="scmp-chips">
            {added.map((s, i) => (
              <span className="scmp-chip" key={s}><i style={{ background: CMP_PALETTE[i % CMP_PALETTE.length] }} />{s}
                <button title={t("remove")} onClick={() => onToggleCompare?.(s)}><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg></button></span>
            ))}
          </div>
        )}
        <div className="sres">
          {results.length === 0 && <div className="empty">{t("noSymbolMatch")} “{q}”.</div>}
          {results.map(([s, r], i) => {
            const buy = isBuy(r.verdict);
            const inCmp = cmp && compare.includes(s);
            const inWl = inWatchlist.has(s);
            return (
              <div key={s} className={`r${i === sel ? " sel" : ""}${inCmp ? " r-on" : ""}`} onMouseEnter={() => setSel(i)} onClick={() => choose(s)}>
                <span className="ic" style={{ background: r.col }}>{s[0]}</span>
                <div className="meta"><div className="tk">{s}</div><div className="nm">{r.name}{r.zh && r.zh !== r.name ? ` · ${r.zh}` : ""}</div></div>
                <div className="vr">
                  {r.mkt && <span className="mkt">{r.mkt}</span>}
                  {r.verdict && <span className="verd" style={{ color: buy ? "var(--buy)" : "var(--sell)", background: buy ? "rgba(38,194,129,.13)" : "rgba(240,86,107,.13)" }}>{r.verdict}</span>}
                  {cmp
                    ? <button className={`add cmp${inCmp ? " added" : ""}`} title={inCmp ? t("comparing") : t("addToCompare")} onClick={(e) => { e.stopPropagation(); onToggleCompare?.(s); }}>
                        {inCmp
                          ? <><svg viewBox="0 0 24 24"><path d="M4 12l5 5L20 6" /></svg>{t("comparingNow")}</>
                          : <><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>{t("addToCompare")}</>}
                      </button>
                    : <button className={`add${inWl ? " added" : ""}`} title={inWl ? t("inWatchlist") : t("addToWatchlist")} onClick={(e) => { e.stopPropagation(); onAdd(s); }}>
                        {inWl ? <svg viewBox="0 0 24 24"><path d="M4 12l5 5L20 6" /></svg> : <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>}
                      </button>}
                </div>
              </div>
            );
          })}
        </div>
        {cmp && <div className="scmp-foot">{t("compareHint")}</div>}
      </div>
    </div>
  );
}
