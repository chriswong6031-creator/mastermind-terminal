"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import MegaPane, { FIN_PAGES as FIN_PAGE_LIST, type FinPage } from "@/components/fin/MegaPane";
import { getFund, getBars, type Fund, type Bar } from "@/lib/fund";
import { getJSON } from "@/lib/dataCache";
import { useLang } from "@/lib/i18n";

/**
 * Analysis workspace composer (Wave-2 IA) — the `/analysis` body.
 *
 * Promotes the in-chart Fundamentals dashboard (components/fin/MegaPane) to its
 * own route. MegaPane already supports standalone rendering via mode="workspace"
 * (no scrim, no scroll-lock, positioned by .fin-pane--workspace CSS which is a
 * flex:1 child of a flex-column parent — see app/fin.css:947). This composer
 * supplies the two things TerminalShell supplies around it: (1) a per-symbol data
 * load (intel/fund/bars/quote) and (2) symbol + sub-page context.
 *
 * ── URL state (shallow, window.history.replaceState — the app-router idiom that
 *    avoids the useSearchParams CSR-bailout, per Discover/Research composers) ──
 *   ?symbol=<TICKER>  the active symbol (default NVDA). Changing it rewrites the
 *                     param so a copied /analysis URL reproduces the view.
 *   ?page=<FinPage>   the active sub-page (default overview). Validated against
 *                     FIN_PAGES on mount; MegaPane's onPage updates it.
 *   NB: MegaPane ALSO writes ?pane=<page> internally (its own legacy deep-link,
 *   unchanged here). It carries the same value as our ?page= — harmless mirror.
 *
 * ── Data load ── replicates TerminalShell's per-symbol loader (TerminalShell.tsx
 *    ~576-605): on symbol change, reset (intel/fund/bars/quote → null/[], fundLoading
 *    → true) then fetch. Race-guarded by an `alive` flag captured per effect run so a
 *    fast symbol switch can't apply stale data. Deviation: TerminalShell defers the
 *    below-the-fold intel/fund/opts behind requestIdleCallback so they don't compete
 *    with the chart's cold-load OHLC fetch in the network queue. There is no chart
 *    fetch on this standalone route, so we fetch immediately — simpler, same result.
 *    (`opts` is not fetched: MegaPane never reads it.)
 */

const FIN_PAGES = new Set<FinPage>(FIN_PAGE_LIST);
const DEFAULT_SYMBOL = "NVDA";
const DEFAULT_PAGE: FinPage = "overview";
// Light live-quote refresh; matches the /api/quote snapshot cadence (TTL 5s). We
// poll a touch slower to avoid needless load on a single-symbol page.
const QUOTE_REFRESH_MS = 15_000;

export default function AnalysisWorkspace() {
  const { lang } = useLang();
  const router = useRouter();

  const [sym, setSym] = useState<string>(DEFAULT_SYMBOL);
  const [page, setPage] = useState<FinPage>(DEFAULT_PAGE);

  const [intel, setIntel] = useState<any | null>(null);
  const [fund, setFund] = useState<Fund | null>(null);
  const [fundLoading, setFundLoading] = useState(true);
  const [bars, setBars] = useState<Bar[]>([]);
  const [last, setLast] = useState<number | null>(null);

  // ── seed sym + page from the URL on mount (client-only; no useSearchParams) ──
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const rawSym = (q.get("symbol") || "").trim().toUpperCase();
    if (rawSym) setSym(rawSym);
    const rawPage = q.get("page") as FinPage | null;
    if (rawPage && FIN_PAGES.has(rawPage)) setPage(rawPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Shared shallow-URL writer — set a search param without navigating (dodges the
  // useSearchParams CSR-bailout, matching the Discover/Research composers).
  const writeParam = useCallback((key: string, value: string) => {
    const u = new URL(window.location.href);
    if (u.searchParams.get(key) === value) return;
    u.searchParams.set(key, value);
    window.history.replaceState(null, "", u.toString());
  }, []);

  // ── symbol change → rewrite ?symbol= shallowly ──
  useEffect(() => {
    writeParam("symbol", sym);
  }, [sym, writeParam]);

  // ── sub-page change (MegaPane onPage) → state + ?page= shallowly ──
  const onPage = useCallback((p: FinPage) => {
    setPage(p);
    writeParam("page", p);
  }, [writeParam]);

  // ── per-symbol data load (see header note; mirrors TerminalShell ~576-605) ──
  useEffect(() => {
    let alive = true;
    setIntel(null); setFund(null); setBars([]); setLast(null); setFundLoading(true);
    getJSON(`/data/${sym}.intel.json`).then((d) => { if (alive) setIntel(d); }).catch(() => {});
    getBars(sym).then((b) => { if (alive) setBars(b); }).catch(() => {});
    getFund(sym)
      .then((d) => { if (alive) setFund(d); })
      .catch(() => {})
      .finally(() => { if (alive) setFundLoading(false); });
    return () => { alive = false; };
  }, [sym]);

  // ── live quote (single symbol): initial fetch + light refresh, race-guarded ──
  // MegaPane consumes only quote.last (Statistics "Current" column, forecast spot),
  // so we extract quotes[sym].last from /api/quote?syms=<SYM> and pass { last }.
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch(`/api/quote?syms=${encodeURIComponent(sym)}`, { cache: "no-store" });
        if (!r.ok) return;
        const j = await r.json();
        const px = j?.quotes?.[sym]?.last;
        if (alive) setLast(typeof px === "number" ? px : null);
      } catch { /* transient — keep last good */ }
    };
    load();
    const id = window.setInterval(load, QUOTE_REFRESH_MS);
    return () => { alive = false; window.clearInterval(id); };
  }, [sym]);

  // ── symbol-switch input: uppercases + commits on Enter (see file note) ──
  // v1 uses a minimal input rather than SearchModal: SearchModal requires manifest,
  // flags, lists, email and ~8 callbacks (see its props) — genuinely heavy to wire
  // for a symbol pick. The input is the blessed v1 fallback.
  const [draft, setDraft] = useState("");
  const commitDraft = useCallback(() => {
    const next = draft.trim().toUpperCase();
    if (next && next !== sym) setSym(next);
    setDraft("");
  }, [draft, sym]);

  // ── onClose (workspace) → jump to the chart for this symbol ──
  const onClose = useCallback(() => {
    router.push(`/terminal?symbol=${encodeURIComponent(sym)}`);
  }, [router, sym]);

  const zh = lang === "zh";

  return (
    // Root IS the (shell) .app2 grid cell (like DiscoverWorkspace). Flex-column so
    // MegaPane's .fin-pane--workspace (flex:1) fills the remaining height below the
    // header row. On ≤860px MegaPane's CSS reverts to a fixed full-screen overlay.
    <div className="main2 ws-shell" style={{ overflow: "hidden", display: "flex", flexDirection: "column" }}>
      {/* header row — matches the workspace tab-strip header padding + border */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", borderBottom: "1px solid var(--line)", flexShrink: 0 }}>
        <span style={{ fontWeight: 600, fontSize: 13, letterSpacing: 0.2 }} aria-label={zh ? "当前标的" : "Current symbol"}>{sym}</span>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value.toUpperCase())}
          onKeyDown={(e) => { if (e.key === "Enter") commitDraft(); }}
          onBlur={commitDraft}
          placeholder={zh ? "切换标的…" : "Change symbol…"}
          aria-label={zh ? "切换标的" : "Change symbol"}
          spellCheck={false}
          autoCapitalize="characters"
          autoCorrect="off"
          style={{
            width: 140, height: 26, padding: "0 8px", fontSize: 12,
            textTransform: "uppercase", color: "var(--fg)", background: "var(--bg)",
            border: "1px solid var(--line)", borderRadius: 4, outline: "none",
          }}
        />
      </div>

      <MegaPane
        sym={sym}
        fund={fund}
        fundLoading={fundLoading}
        quote={{ last }}
        bars={bars}
        page={page}
        onPage={onPage}
        onClose={onClose}
        // name omitted: MegaPane resolves its own header via fund?.ticker || sym
        // (TerminalShell feeds a manifest name we don't load; the fallback is correct).
        mode="workspace"
        intel={intel}
      />
    </div>
  );
}
