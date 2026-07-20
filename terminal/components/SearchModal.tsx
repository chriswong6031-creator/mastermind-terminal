"use client";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useT } from "@/lib/i18n";
import { CMP_PALETTE, CmpMode, CmpCfg } from "@/lib/compare";
import { parseComposite, compositeExpr, validateLegs } from "@/lib/composite";
import { getHistory } from "@/lib/searchHistory";
import { trackSearch } from "@/lib/searchTrack";
import { verdictIsStale } from "@/lib/signalVerdict";
import AuthSheet from "@/components/AuthSheet";

type Row = { name: string; col: string; verdict: string | null; vts?: string | null; mkt?: string; zh?: string; sec?: string };
type ListInfo = { name: string; count: number; symbols: { symbol: string; section: string }[] };
const isBuy = (v: string | null) => v === "BUY" || v === "REBUY" || v === "RECLAIM";

// Asset-class → search-tab mapping. `sec` in the manifest is the asset class
// (Equities / Funds / Crypto / …); anything unmapped (incl. stocks) falls under "Stocks".
const CAT_OF: Record<string, string> = { Funds: "Funds", Crypto: "Crypto", Indices: "Indices", Bonds: "Bonds", Futures: "Futures", Forex: "Forex", Economy: "Economy", Options: "Options" };
// The manifest tags ETFs as "Equities" today, so a pure `sec` map would file SPY/QQQ under
// Stocks. This explicit ticker set routes the common broad-market/sector ETFs into "Funds" so
// that category has real coverage (and lights up instead of rendering disabled). Heuristics
// beyond this fixed set are intentionally out of scope — extend the set, don't guess.
const FUND_TICKERS = new Set(["SPY", "QQQ", "IWM", "DIA", "SOXL", "GLD", "TLT"]);
const tabOf = (sym: string, sec?: string): string => (FUND_TICKERS.has(sym) ? "Funds" : (sec && CAT_OF[sec]) || "Stocks");

// Category tab order + their i18n keys (bilingual labels — no hardcoded English in JSX).
const CATS: { id: string; key: string }[] = [
  { id: "All", key: "catAll" }, { id: "Stocks", key: "catStocks" }, { id: "Crypto", key: "catCrypto" },
  { id: "Forex", key: "catForex" }, { id: "Futures", key: "catFutures" }, { id: "Funds", key: "catFunds" },
  { id: "Indices", key: "catIndices" }, { id: "Bonds", key: "catBonds" }, { id: "Economy", key: "catEconomy" },
  { id: "Options", key: "catOptions" },
];

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
// "go"      = Symbol search / watchlist home. Two macro-states: HOME (empty + unfocused) shows the
//             active watchlist; SEARCH (focused or typing) shows category-filtered results. The chip
//             row morphs in place between the two vocabularies (watchlist chips ⇄ category tabs) —
//             its geometry never moves. Supports composites + history.
// "compare" = Compare overlay picker.
// "add"     = Add Symbol dialog (per S5): has remove-from-watchlist + go-to-symbol instead of +.
export default function SearchModal({
  open, seed, manifest, inWatchlist, mode = "go", compare = [], active = "",
  flags = {}, lastFlagColor = FLAG_DEFAULT,
  email, lists = [], activeList = "", onSwitchList, onCreateList, onAddToList,
  onClose, onPick, onAdd, onRemove, onToggleCompare, compareCfg,
}: {
  open: boolean; seed: string; manifest: Record<string, Row>; inWatchlist: Set<string>;
  mode?: "go" | "compare" | "add"; compare?: string[]; active?: string;
  flags?: Record<string, string>;       // sym → flag color (empty = no flag)
  lastFlagColor?: string;
  email?: string;                        // "" = anonymous guest; non-empty = signed in
  lists?: ListInfo[];                    // all watchlists (name + count + symbols)
  activeList?: string;                   // name of the active list
  onSwitchList?: (name: string) => void;
  onCreateList?: (name: string) => string | null;   // returns created name, or null on empty/dup
  onAddToList?: (sym: string, listName: string) => void;
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
  const [cat, setCat] = useState("All");   // selected asset-class tab
  const [focused, setFocused] = useState(false);       // input focus drives HOME ⇄ SEARCH
  const [railCreating, setRailCreating] = useState(false);   // inline "+ New list" input open
  const [railName, setRailName] = useState("");
  const [picker, setPicker] = useState<string | null>(null);  // symbol whose add-to-list picker is open
  const [pickerUp, setPickerUp] = useState(false);            // flip picker above the row when no room below
  const [pickerNew, setPickerNew] = useState(false);          // inline "new list" inside the picker
  const [pickerNewName, setPickerNewName] = useState("");
  const [justAdded, setJustAdded] = useState<{ sym: string; list: string } | null>(null);  // inline confirm
  const [authMode, setAuthMode] = useState<"signin" | "signup" | null>(null);   // AuthSheet
  const inputRef = useRef<HTMLInputElement>(null);
  const railInputRef = useRef<HTMLInputElement>(null);
  const pickerNewRef = useRef<HTMLInputElement>(null);
  const addedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (open) {
      setQ(seed || "");
      setSel(0);
      setChoosing(null);
      setCat("All");
      setHistory(getHistory());
      setFocused(false);
      setRailCreating(false); setRailName("");
      setPicker(null); setPickerUp(false); setPickerNew(false); setPickerNewName("");
      setJustAdded(null); setAuthMode(null);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open, seed]);

  useEffect(() => { if (railCreating) setTimeout(() => railInputRef.current?.focus(), 10); }, [railCreating]);
  useEffect(() => { if (pickerNew) setTimeout(() => pickerNewRef.current?.focus(), 10); }, [pickerNew]);
  useEffect(() => () => { if (addedTimer.current) clearTimeout(addedTimer.current); }, []);

  const deferredQ = useDeferredValue(q);
  const cmp = mode === "compare";
  const isAdd = mode === "add";
  const signedIn = !!email;

  // "go" mode home vs search: SEARCH when the input has focus OR the query is non-empty; HOME otherwise.
  // Only "go" mode has a home — compare/add are always in their search body.
  const searchState = mode !== "go" || focused || q.trim() !== "" ? "search" : "home";
  const isHome = searchState === "home";

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
      .filter(([s, r]) => (!cmp || s !== active) && (cat === "All" || tabOf(s, r.sec) === cat) && (s.toLowerCase().includes(ql) || r.name.toLowerCase().includes(ql) || (!!r.zh && r.zh.toLowerCase().includes(ql))))
      .slice(0, 30);
  }, [deferredQ, manifest, cmp, active, cat]);

  // History rows when no query (most recent first, filtered against manifest).
  const historyResults = useMemo((): [string, Row][] => {
    if (deferredQ.trim()) return [];
    return history
      .filter((s) => manifest[s] && (cat === "All" || tabOf(s, manifest[s].sec) === cat))
      .map((s) => [s, manifest[s]] as [string, Row])
      .slice(0, 30);
  }, [deferredQ, history, manifest, cat]);

  // Which asset-class tabs actually have symbols in the universe (others render disabled).
  const availCats = useMemo(() => { const s = new Set<string>(); for (const [sym, r] of Object.entries(manifest)) s.add(tabOf(sym, r.sec)); return s; }, [manifest]);

  const showHistory = !deferredQ.trim();
  const displayRows: [string, Row][] = showHistory ? historyResults : results;

  // Active list's symbols joined against the manifest (HOME body). Symbols missing from the
  // manifest still render (neutral placeholder) — never silently dropped.
  const activeListSyms = useMemo(() => lists.find((l) => l.name === activeList)?.symbols ?? [], [lists, activeList]);

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

  // M1: self-dismiss the AuthSheet once sign-in lands. On success AuthSheet fires router.refresh(),
  // which re-runs the server component and delivers a real `email` — but a returning (already
  // provisioned) user gets no navigation, so nothing else closes the sheet: it would sit stuck on
  // its busy state over the now-signed-in hub. Close it the moment `signedIn` flips true.
  useEffect(() => { if (signedIn) setAuthMode(null); }, [signedIn]);

  if (!open) return null;

  const added = compare.filter((c) => c !== active);

  // Composite first-row candidate (F2): valid composite → synthetic row shown first.
  const showCompositeRow = !cmp && !isAdd && compositeLegs !== null && compositeLegs.valid;
  const compositeExprStr = compositeLegs ? compositeExpr(compositeLegs.legs) : null;

  const track = (sym: string) => trackSearch(sym, cmp ? "chart-compare" : isAdd ? "watchlist-add" : "chart-search", q.trim() || undefined);

  // Fire the transient "Added to {list}" inline confirmation on a result row.
  function flashAdded(sym: string, list: string) {
    setJustAdded({ sym, list });
    if (addedTimer.current) clearTimeout(addedTimer.current);
    addedTimer.current = setTimeout(() => setJustAdded(null), 1500);
  }

  // Add button on a SEARCH result row. One list → add directly + inline confirm. Many → open picker.
  function handleAdd(sym: string, rowEl?: HTMLElement | null) {
    track(sym);
    if (lists.length <= 1) {
      onAdd(sym);
      flashAdded(sym, lists[0]?.name || activeList || "Watchlist");
    } else {
      // Flip the picker upward when the row is in the lower part of the scroll area, so the popover
      // (which lives inside the overflow:auto .sres) isn't clipped at the bottom.
      const scroller = rowEl?.closest(".sres") as HTMLElement | null;
      if (rowEl && scroller) {
        const rr = rowEl.getBoundingClientRect(), sr = scroller.getBoundingClientRect();
        const roomBelow = sr.bottom - rr.bottom;
        setPickerUp(roomBelow < 180 && (rr.top - sr.top) > roomBelow);   // ~picker height; flip if tighter below
      } else setPickerUp(false);
      setPicker(sym); setPickerNew(false); setPickerNewName("");
    }
  }

  function commitRailCreate() {
    const created = onCreateList?.(railName);
    if (created) { onSwitchList?.(created); setRailCreating(false); setRailName(""); }
  }
  function commitPickerCreate(sym: string) {
    const created = onCreateList?.(pickerNewName);
    if (created) { onAddToList?.(sym, created); flashAdded(sym, created); setPicker(null); setPickerNew(false); setPickerNewName(""); }
  }

  function choose(sym: string, shiftKey = false) {
    // Compare mode isn't committed here — a row click only opens the price/% chooser (or removes
    // an existing overlay). The actual commit is the segment button, which tracks itself. So only
    // log go/add commits here; compare logging lives on the cmp-seg-half handlers.
    if (!cmp) track(sym);
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
          track(active);
          onAdd(active);
          if (shift) onClose();
        }
      }
    }
    else if (e.key === "Escape") onClose();
  }

  const titleKey = isAdd ? "addSymbolTitle" : "searchTitle";
  const placeholderKey = "searchInputPlaceholder";

  // Render one symbol row with the shared `.r` anatomy (used by SEARCH results, history, and the
  // HOME active-list body). `withAdd` shows the + / confirm button (SEARCH only).
  function symRow(s: string, r: Row | undefined, rowSel: number, withAdd: boolean) {
    const buy = r ? isBuy(r.verdict) : false;
    const inWl = inWatchlist.has(s);
    const flagColor = flags[s];
    const confirming = justAdded?.sym === s;
    return (
      <div
        key={s}
        className={`r${rowSel === sel ? " sel" : ""}`}
        onMouseEnter={() => setSel(rowSel)}
        onClick={(e) => choose(s, e.shiftKey)}
      >
        {inWl && (
          <span
            className={`s-flag-bar${flagColor ? " s-flag-bar--set" : ""}`}
            style={flagColor ? { background: flagColor } : {}}
          />
        )}
        {r ? (
          <span className="ic" style={{ background: r.col }}>{s[0]}</span>
        ) : (
          <span className="ic ic-plain">{s[0]}</span>
        )}
        <div className="meta">
          <div className="tk">{s}</div>
          <div className="nm">{r ? `${r.name}${r.zh && r.zh !== r.name ? ` · ${r.zh}` : ""}` : s}</div>
        </div>
        <div className="vr">
          {r?.mkt && <span className="mkt">{r.mkt}</span>}
          {r?.verdict && (
            <span
              className={"verd" + (verdictIsStale(r.vts) ? " stale" : "")}
              title={r.vts ? `${r.verdict} · ${r.vts}` : undefined}
              style={{ color: buy ? "var(--buy)" : "var(--sell)", background: `color-mix(in srgb, ${buy ? "var(--buy)" : "var(--sell)"} 13%, transparent)` }}
            >
              {r.verdict}
            </span>
          )}
          {withAdd && (
            confirming
              ? <span className="s-added-note"><svg viewBox="0 0 24 24"><path d="M4 12l5 5L20 6" /></svg>{t("addedToList").replace("{list}", justAdded!.list)}</span>
              : <button
                  className={`add${inWl ? " added" : ""}`}
                  title={inWl ? t("inWatchlist") : t("addToWatchlist")}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={(e) => { e.stopPropagation(); handleAdd(s, (e.currentTarget as HTMLElement).closest(".r") as HTMLElement | null); }}>
                  {inWl
                    ? <svg viewBox="0 0 24 24"><path d="M4 12l5 5L20 6" /></svg>
                    : <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>}
                </button>
          )}
        </div>
        {/* Add-to-list picker popover (F, multi-list) — anchored under the row. */}
        {picker === s && (
          <div className={`s-pick${pickerUp ? " s-pick-up" : ""}`} onClick={(e) => e.stopPropagation()}>
            <div className="s-pick-hd">{t("chooseListHd")}</div>
            {lists.map((l) => {
              const has = l.symbols.some((x) => x.symbol === s);
              return (
                <button key={l.name} className={`s-pick-row${has ? " has" : ""}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { if (!has) { onAddToList?.(s, l.name); flashAdded(s, l.name); } setPicker(null); }}>
                  <span className="s-pick-nm">{l.name}</span>
                  <span className="s-pick-ct">{l.count}</span>
                  {has && <svg viewBox="0 0 24 24" className="s-pick-ck"><path d="M4 12l5 5L20 6" /></svg>}
                </button>
              );
            })}
            {pickerNew ? (
              <div className="s-pick-new">
                <input ref={pickerNewRef} value={pickerNewName} placeholder={t("newListPlaceholder")}
                  onChange={(e) => setPickerNewName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitPickerCreate(s); } else if (e.key === "Escape") { e.preventDefault(); setPickerNew(false); setPickerNewName(""); } }} />
                <button className="s-pick-ok" title={t("saveListName")} onMouseDown={(e) => { e.preventDefault(); commitPickerCreate(s); }}><svg viewBox="0 0 24 24"><path d="M4 12l5 5L20 6" /></svg></button>
              </div>
            ) : (
              <button className="s-pick-row s-pick-add" onMouseDown={(e) => e.preventDefault()} onClick={() => setPickerNew(true)}>
                <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>{t("newListInline")}
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="scrim" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`smodal${cmp ? " smodal-cmp" : ""}${isAdd ? " smodal-add" : ""}${mode === "go" ? " smodal-hub" : ""}`} onClick={(e) => e.stopPropagation()}>
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
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
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

        {/* THE MORPHING RAIL — same geometry, two vocabularies (signature).
            HOME: watchlist chips + "+ New list". SEARCH: category-filter tabs. */}
        {!cmp && (
          isHome ? (
            // n1: the HOME rail is a watchlist SWITCHER (buttons navigate between lists), not a
            // tabset selecting panels — so no role="tablist"/role="tab" here (that would be a lie to
            // AT). The SEARCH category filters below ARE tabs and keep their tablist/tab roles.
            <div className="s-chips s-rail">
              {lists.map((l) => (
                <button key={l.name} className={`s-lchip${l.name === activeList ? " on" : ""}`}
                  onClick={() => onSwitchList?.(l.name)}>
                  {l.name}<span className="s-lchip-ct">{l.count}</span>
                </button>
              ))}
              {railCreating ? (
                <span className="s-lnew-input">
                  <input ref={railInputRef} value={railName} placeholder={t("newListPlaceholder")}
                    onChange={(e) => setRailName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitRailCreate(); } else if (e.key === "Escape") { e.preventDefault(); setRailCreating(false); setRailName(""); } }} />
                  <button className="s-lnew-ok" title={t("saveListName")} onMouseDown={(e) => { e.preventDefault(); commitRailCreate(); }}><svg viewBox="0 0 24 24"><path d="M4 12l5 5L20 6" /></svg></button>
                  <button className="s-lnew-x" title={t("cancelListName")} onMouseDown={(e) => { e.preventDefault(); setRailCreating(false); setRailName(""); }}><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
                </span>
              ) : (
                <button className="s-lchip s-lchip-new" onClick={() => setRailCreating(true)}>
                  <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>{t("newListChip")}
                </button>
              )}
            </div>
          ) : (
            <div className="s-chips" role="tablist">
              {CATS.map(({ id, key }) => {
                const enabled = id === "All" || availCats.has(id);
                return (
                  <button key={id} className={`s-chip${id === cat ? " on" : ""}`} disabled={!enabled}
                    role="tab" aria-selected={id === cat}
                    style={enabled ? undefined : { opacity: 0.35, cursor: "default" }}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => { if (enabled) { setCat(id); setSel(0); } }}>{t(key)}</button>
                );
              })}
            </div>
          )
        )}

        {/* BODY */}
        {isHome ? (
          <div className="sres s-home">
            {/* Anonymous CTA card (Part D) — above the (still functional) guest rail/body. */}
            {!signedIn && (
              <div className="s-cta">
                <div className="s-cta-txt">
                  <div className="s-cta-title">{t("ctaTitle")}</div>
                  <div className="s-cta-body">{t("ctaBody")}</div>
                </div>
                <button className="s-cta-primary" onMouseDown={(e) => e.preventDefault()} onClick={() => setAuthMode("signup")}>{t("ctaSignup")}</button>
                <button className="s-cta-link" onMouseDown={(e) => e.preventDefault()} onClick={() => setAuthMode("signin")}>{t("ctaSignin")}</button>
              </div>
            )}
            {/* Eyebrow: active list name + count (quiet TV register). */}
            <div className="s-home-eyebrow">
              <span className="s-home-name">{activeList}</span>
              <span className="s-home-count">{activeListSyms.length}</span>
            </div>
            {activeListSyms.length === 0 ? (
              <div className="s-empty-list">
                <div>{t("emptyWatchlist")}</div>
                <button className="s-empty-nudge" onClick={() => inputRef.current?.focus()}>{t("emptyListNudge")}</button>
              </div>
            ) : (
              activeListSyms.map((it, i) => symRow(it.symbol, manifest[it.symbol], i, false))
            )}
          </div>
        ) : (
          /* SEARCH / compare / add body */
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
                  {inWatchlist.has(compositeExprStr) && (
                    <span className="s-flag-dot" style={{ background: flags[compositeExprStr] || "#888" }} />
                  )}
                  {isAdd && inWatchlist.has(compositeExprStr)
                    ? <WlMemberActions sym={compositeExprStr} t={t} onRemove={onRemove} onGo={() => { onPick(compositeExprStr); onClose(); }} />
                    : !isAdd && <button className={`add${inWatchlist.has(compositeExprStr) ? " added" : ""}`}
                        title={inWatchlist.has(compositeExprStr) ? t("inWatchlist") : t("addToWatchlist")}
                        onClick={(e) => { e.stopPropagation(); track(compositeExprStr); onAdd(compositeExprStr); }}>
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

            {/* Type-to-search hint (F): only when there is no history to show and no query yet. */}
            {!cmp && !isAdd && showHistory && historyResults.length === 0 && (
              <div className="s-type-hint">{t("typeToSearch")}</div>
            )}

            {/* Empty state */}
            {!showCompositeRow && displayRows.length === 0 && !showHistory && (
              <div className="empty">{t("noSymbolMatch")} "{q}".</div>
            )}
            {(cmp || isAdd) && showHistory && historyResults.length === 0 && (
              <div className="empty">{t("searchHistoryEmpty")}</div>
            )}

            {displayRows.map(([s, r], i) => {
              const rowSel = showCompositeRow ? i + 1 : i;
              // compare/add modes keep their bespoke row actions; go mode uses the shared symRow w/ add.
              if (!cmp && !isAdd) return symRow(s, r, rowSel, true);
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
                      <span
                        className={"verd" + (verdictIsStale(r.vts) ? " stale" : "")}
                        title={r.vts ? `${r.verdict} · ${r.vts}` : undefined}
                        style={{ color: buy ? "var(--buy)" : "var(--sell)", background: `color-mix(in srgb, ${buy ? "var(--buy)" : "var(--sell)"} 13%, transparent)` }}
                      >
                        {r.verdict}
                      </span>
                    )}
                    {cmp
                      ? <div className={"cmp-add-wrap" + (inCmp ? " is-added" : choosing === s ? " is-choosing" : "")}>
                          <button className="cmp-add-idle add cmp" title={t("addToCompare")} onClick={(e) => { e.stopPropagation(); setChoosing(s); }}>
                            <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>{t("addToCompare")}
                          </button>
                          <div className="cmp-seg">
                            <button className="cmp-seg-half" onClick={(e) => { e.stopPropagation(); track(s); onToggleCompare?.(s, "price"); setChoosing(null); }}>{t("cmpPrice")}</button>
                            <span className="cmp-seg-div" />
                            <button className="cmp-seg-half" onClick={(e) => { e.stopPropagation(); track(s); onToggleCompare?.(s, "percent"); setChoosing(null); }}>{t("cmpPercent")}</button>
                          </div>
                          <button className="cmp-add-done add cmp added" title={t("comparing")} onClick={(e) => { e.stopPropagation(); onToggleCompare?.(s); }}>
                            <svg viewBox="0 0 24 24"><path d="M4 12l5 5L20 6" /></svg>{t("comparingNow")}
                          </button>
                        </div>
                      : inWl
                        ? <WlMemberActions sym={s} t={t} onRemove={onRemove} onGo={() => { onPick(s); onClose(); }} />
                        : <button className="add" title={t("addToWatchlist")} onClick={(e) => { e.stopPropagation(); track(s); onAdd(s); if (e.shiftKey) onClose(); }}>
                            <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>
                          </button>
                    }
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {cmp && <div className="scmp-foot">{t("compareHint")}</div>}

        {/* F3 footer hint for "add" mode (per S5) */}
        {isAdd && (
          <div className="smodal-hint">{t("shiftClickHint")}</div>
        )}

        {/* AuthSheet layered over the body (Part E). Keyed on mode so switching CTA buttons
            remounts with the right initial mode (no initialMode→state sync effect needed). */}
        {authMode && <AuthSheet key={authMode} initialMode={authMode} onClose={() => setAuthMode(null)} />}
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
