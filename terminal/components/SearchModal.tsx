"use client";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useT } from "@/lib/i18n";
import { CMP_PALETTE, CmpMode, CmpCfg } from "@/lib/compare";
import { parseComposite, compositeExpr, validateLegs } from "@/lib/composite";
import { getHistory } from "@/lib/searchHistory";

type Row = { name: string; col: string; verdict: string | null; mkt?: string; zh?: string };
const isBuy = (v: string | null) => v === "BUY" || v === "REBUY";

// TV flag palette — 6 fixed hex colors matching the spec.
export const FLAG_COLORS = [
  "#f23645", // red
  "#2962ff", // blue (TV default)
  "#089981", // green
  "#f8b500", // yellow
  "#9c27b0", // purple
  "#00bcd4", // cyan
];
export const FLAG_DEFAULT = "#2962ff";

// One dialog, two modes.
// "go"      = Symbol search: jump to / add symbol. Supports composites + history.
// "compare" = Compare overlay picker.
// "add"     = Add Symbol dialog (per S5): has remove-from-watchlist + go-to-symbol instead of +.
export default function SearchModal({
  open, seed, manifest, inWatchlist, mode = "go", compare = [], active = "",
  flags = {}, lastFlagColor = FLAG_DEFAULT,
  onClose, onPick, onAdd, onRemove, onToggleCompare, compareCfg,
}: {
  open: boolean; seed: string; manifest: Record<string, Row>; inWatchlist: Set<string>;
  mode?: "go" | "compare" | "add"; compare?: string[]; active?: string;
  flags?: Record<string, string>;       // sym → flag color (empty = no flag)
  lastFlagColor?: string;
  onClose: () => void; onPick: (s: string) => void;
  onAdd: (s: string) => void;
  onRemove?: (s: string) => void;
  onToggleCompare?: (s: string, mode?: CmpMode) => void;
  compareCfg?: Record<string, CmpCfg>;
}) {
  const t = useT();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const [choosing, setChoosing] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQ(seed || "");
      setSel(0);
      setChoosing(null);
      setHistory(getHistory());
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open, seed]);

  const deferredQ = useDeferredValue(q);
  const cmp = mode === "compare";
  const isAdd = mode === "add";

  // Parse query as composite expression.
  const compositeLegs = useMemo(() => {
    const legs = parseComposite(deferredQ.trim().toUpperCase());
    if (!legs) return null;
    const validation = validateLegs(legs, manifest);
    return { legs, valid: validation.valid, unknown: (validation as any).unknown as string[] | undefined };
  }, [deferredQ, manifest]);

  const results = useMemo(() => {
    const ql = deferredQ.trim().toLowerCase();
    if (!ql) return [];
    return Object.entries(manifest)
      .filter(([s, r]) => (!cmp || s !== active) && (s.toLowerCase().includes(ql) || r.name.toLowerCase().includes(ql) || (!!r.zh && r.zh.toLowerCase().includes(ql))))
      .slice(0, 30);
  }, [deferredQ, manifest, cmp, active]);

  // History rows when no query (most recent first, filtered against manifest).
  const historyResults = useMemo((): [string, Row][] => {
    if (deferredQ.trim()) return [];
    return history
      .filter((s) => manifest[s])
      .map((s) => [s, manifest[s]] as [string, Row])
      .slice(0, 30);
  }, [deferredQ, history, manifest]);

  const showHistory = !deferredQ.trim();
  const displayRows: [string, Row][] = showHistory ? historyResults : results;

  // Default highlight: if active symbol not in watchlist → pre-select it; else 0.
  const defaultSel = useMemo(() => {
    if (showHistory && !inWatchlist.has(active)) {
      const idx = historyResults.findIndex(([s]) => s === active);
      return idx >= 0 ? idx : 0;
    }
    return 0;
  }, [showHistory, active, inWatchlist, historyResults]);

  useEffect(() => {
    if (open) setSel(defaultSel);
  }, [open, defaultSel, showHistory]);

  if (!open) return null;

  const added = compare.filter((c) => c !== active);

  // Composite first-row candidate (F2): valid composite → synthetic row shown first.
  const showCompositeRow = !cmp && !isAdd && compositeLegs !== null && compositeLegs.valid;
  const compositeExprStr = compositeLegs ? compositeExpr(compositeLegs.legs) : null;

  function choose(sym: string, shiftKey = false) {
    if (cmp) {
      if (compare.includes(sym)) { onToggleCompare?.(sym); }
      else { setChoosing(sym); }
    } else if (isAdd) {
      if (inWatchlist.has(sym)) {
        // Already in watchlist — go to it.
        onPick(sym);
        onClose();
      } else {
        onAdd(sym);
        if (shiftKey) onClose();
      }
    } else {
      // "go" mode: navigate + optionally add.
      onPick(sym);
      if (shiftKey) {
        onAdd(sym);
      }
      onClose();
    }
  }

  // Total selectable row count (composite row + display rows).
  const totalRows = (showCompositeRow ? 1 : 0) + displayRows.length;

  function key(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, totalRows - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
    else if (e.key === "Enter") {
      e.preventDefault();
      const shift = e.shiftKey;
      if (showCompositeRow && sel === 0 && compositeExprStr) {
        choose(compositeExprStr, shift);
      } else {
        const idx = showCompositeRow ? sel - 1 : sel;
        const row = displayRows[idx];
        if (row) choose(row[0], shift);
        else if (isAdd && !inWatchlist.has(active)) {
          onAdd(active);
          if (shift) onClose();
        }
      }
    }
    else if (e.key === "Escape") onClose();
  }

  const titleKey = isAdd ? "addSymbolTitle" : "searchTitle";
  const placeholderKey = "searchInputPlaceholder";

  return (
    <div className="scrim" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`smodal${cmp ? " smodal-cmp" : ""}${isAdd ? " smodal-add" : ""}`} onClick={(e) => e.stopPropagation()}>
        {/* Header with title */}
        <div className="smodal-title-bar">
          <span className="smodal-title">{t(titleKey)}</span>
          <span className="esc" onClick={onClose}>ESC</span>
        </div>

        {cmp && (
          <div className="scmp-h">
            <span className="scmp-t">
              <svg viewBox="0 0 24 24"><path d="M4 18l5-9 4 5 3-4 4 8" /></svg>
              {t("compareTitle")}
            </span>
          </div>
        )}

        {/* Search input */}
        <div className="sh">
          <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
          <input
            ref={inputRef}
            value={q}
            placeholder={cmp ? t("comparePlaceholder") : t(placeholderKey)}
            onChange={(e) => { setQ(e.target.value); setSel(0); }}
            onKeyDown={key}
          />
          {/* keyboard icon (decorative, per S4) */}
          <span className="sh-kbd" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="2" y="6" width="20" height="13" rx="2" />
              <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 14h.01M9 14h6M18 14h.01" />
            </svg>
          </span>
        </div>

        {/* Compare mode chips */}
        {cmp && added.length > 0 && (
          <div className="scmp-chips">
            {added.map((s, i) => {
              const chipColor = compareCfg?.[s]?.color ?? CMP_PALETTE[i % CMP_PALETTE.length];
              return (
                <span className="scmp-chip" key={s}>
                  <i style={{ background: chipColor }} />{s}
                  <button title={t("remove")} onClick={() => onToggleCompare?.(s)}>
                    <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg>
                  </button>
                </span>
              );
            })}
          </div>
        )}

        {/* Filter chips (structural, non-functional in v1) */}
        {!cmp && (
          <div className="s-chips">
            {["All","Stocks","Funds","Futures","Forex","Crypto","Indices","Bonds","Economy","Options"].map((label, i) => (
              <button key={label} className={`s-chip${i === 0 ? " on" : ""}`}>{label}</button>
            ))}
          </div>
        )}

        {/* Results */}
        <div className="sres">
          {/* Composite first row (F2) */}
          {showCompositeRow && compositeExprStr && (
            <div
              className={`r r-composite${sel === 0 ? " sel" : ""}`}
              onMouseEnter={() => setSel(0)}
              onClick={(e) => choose(compositeExprStr, e.shiftKey)}
            >
              <span className="ic ic-composite">[M]</span>
              <div className="meta">
                <div className="tk">{compositeLabel(compositeExprStr)}</div>
                <div className="nm">{compositeExprStr}</div>
              </div>
              <div className="vr">
                <span className="mkt">{t("compositeType")}</span>
                {/* Flag indicator if basket is in watchlist */}
                {inWatchlist.has(compositeExprStr) && (
                  <span className="s-flag-dot" style={{ background: flags[compositeExprStr] || "#888" }} />
                )}
                {isAdd && inWatchlist.has(compositeExprStr)
                  ? <WlMemberActions sym={compositeExprStr} t={t} onRemove={onRemove} onGo={() => { onPick(compositeExprStr); onClose(); }} />
                  : !isAdd && <button className={`add${inWatchlist.has(compositeExprStr) ? " added" : ""}`}
                      title={inWatchlist.has(compositeExprStr) ? t("inWatchlist") : t("addToWatchlist")}
                      onClick={(e) => { e.stopPropagation(); onAdd(compositeExprStr); }}>
                      {inWatchlist.has(compositeExprStr)
                        ? <svg viewBox="0 0 24 24"><path d="M4 12l5 5L20 6" /></svg>
                        : <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>}
                    </button>
                }
              </div>
            </div>
          )}

          {/* Invalid composite warning */}
          {compositeLegs && !compositeLegs.valid && compositeLegs.unknown && (
            <div className="sres-warn">
              {t("compositeInvalid").replace("{syms}", compositeLegs.unknown.join(", "))}
            </div>
          )}

          {/* History header */}
          {showHistory && historyResults.length > 0 && (
            <div className="sres-section-hd">{t("searchRecentHeader")}</div>
          )}

          {/* Empty state */}
          {!showCompositeRow && displayRows.length === 0 && !showHistory && (
            <div className="empty">{t("noSymbolMatch")} "{q}".</div>
          )}
          {showHistory && historyResults.length === 0 && (
            <div className="empty">{t("searchHistoryEmpty")}</div>
          )}

          {displayRows.map(([s, r], i) => {
            const rowSel = showCompositeRow ? i + 1 : i;
            const buy = isBuy(r.verdict);
            const inCmp = cmp && compare.includes(s);
            const inWl = inWatchlist.has(s);
            const flagColor = flags[s];
            return (
              <div
                key={s}
                className={`r${rowSel === sel ? " sel" : ""}${inCmp ? " r-on" : ""}`}
                onMouseEnter={() => setSel(rowSel)}
                onClick={(e) => choose(s, e.shiftKey)}
              >
                {/* Left flag bar for watchlist members (F1 color) */}
                {inWl && (
                  <span
                    className={`s-flag-bar${flagColor ? " s-flag-bar--set" : ""}`}
                    style={flagColor ? { background: flagColor } : {}}
                  />
                )}
                <span className="ic" style={{ background: r.col }}>{s[0]}</span>
                <div className="meta">
                  <div className="tk">{s}</div>
                  <div className="nm">{r.name}{r.zh && r.zh !== r.name ? ` · ${r.zh}` : ""}</div>
                </div>
                <div className="vr">
                  {r.mkt && <span className="mkt">{r.mkt}</span>}
                  {r.verdict && (
                    <span className="verd" style={{ color: buy ? "var(--buy)" : "var(--sell)", background: buy ? "rgba(38,194,129,.13)" : "rgba(240,86,107,.13)" }}>
                      {r.verdict}
                    </span>
                  )}
                  {cmp
                    ? <div className={"cmp-add-wrap" + (inCmp ? " is-added" : choosing === s ? " is-choosing" : "")}>
                        <button className="cmp-add-idle add cmp" title={t("addToCompare")} onClick={(e) => { e.stopPropagation(); setChoosing(s); }}>
                          <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>{t("addToCompare")}
                        </button>
                        <div className="cmp-seg">
                          <button className="cmp-seg-half" onClick={(e) => { e.stopPropagation(); onToggleCompare?.(s, "price"); setChoosing(null); }}>{t("cmpPrice")}</button>
                          <span className="cmp-seg-div" />
                          <button className="cmp-seg-half" onClick={(e) => { e.stopPropagation(); onToggleCompare?.(s, "percent"); setChoosing(null); }}>{t("cmpPercent")}</button>
                        </div>
                        <button className="cmp-add-done add cmp added" title={t("comparing")} onClick={(e) => { e.stopPropagation(); onToggleCompare?.(s); }}>
                          <svg viewBox="0 0 24 24"><path d="M4 12l5 5L20 6" /></svg>{t("comparingNow")}
                        </button>
                      </div>
                    : isAdd
                      ? inWl
                        ? <WlMemberActions sym={s} t={t} onRemove={onRemove} onGo={() => { onPick(s); onClose(); }} />
                        : <button className="add" title={t("addToWatchlist")} onClick={(e) => { e.stopPropagation(); onAdd(s); if (e.shiftKey) onClose(); }}>
                            <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>
                          </button>
                      : <button
                          className={`add${inWl ? " added" : ""}`}
                          title={inWl ? t("inWatchlist") : t("addToWatchlist")}
                          onClick={(e) => { e.stopPropagation(); onAdd(s); }}>
                          {inWl
                            ? <svg viewBox="0 0 24 24"><path d="M4 12l5 5L20 6" /></svg>
                            : <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>}
                        </button>
                  }
                </div>
              </div>
            );
          })}
        </div>

        {cmp && <div className="scmp-foot">{t("compareHint")}</div>}

        {/* F3 footer hint for "add" mode (per S5) */}
        {isAdd && (
          <div className="smodal-hint">{t("shiftClickHint")}</div>
        )}
      </div>
    </div>
  );
}

// Inline sub-component: the trash + crosshair button pair for watchlist member rows in Add Symbol mode (S5).
function WlMemberActions({ sym, t, onRemove, onGo }: { sym: string; t: (k: string) => string; onRemove?: (s: string) => void; onGo?: () => void }) {
  return (
    <div className="s-wl-acts">
      {onRemove && (
        <button
          className="s-wl-act s-wl-remove"
          title={t("removeFromWatchlist")}
          onClick={(e) => { e.stopPropagation(); onRemove(sym); }}
        >
          <svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></svg>
        </button>
      )}
      {onGo && (
        <button
          className="s-wl-act s-wl-go"
          title={t("goToSymbol")}
          onClick={(e) => { e.stopPropagation(); onGo(); }}
        >
          <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M12 8v4l3 3" /><path d="M12 3v2M12 19v2M3 12H1M23 12h-2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" strokeWidth="1.2" /></svg>
        </button>
      )}
    </div>
  );
}

// compositeLabel helper used inline above — need to import from composite.ts.
function compositeLabel(expr: string): string {
  const legs = expr.split("+");
  if (legs.length <= 3) return legs.join("+");
  return legs.slice(0, 3).join("+") + "+…";
}
