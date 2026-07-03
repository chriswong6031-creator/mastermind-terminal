"use client";
/**
 * MegaPane — the in-shell full-coverage fundamentals overlay (BUILD-SPEC R7/R8,
 * §3.4 FE2a). NOT a route: a fixed z-90 overlay above the workspace. Hosts ten
 * pages — the six TV "Financials" tabs (overview/statements/statistics/dividends/
 * earnings/revenue) plus sibling dashboards (forecast/technicals/seasonals) and
 * `mastermind` (the existing deep-analysis, so the old modal's content has a
 * real home).
 *
 * JUDGE-FIXED behaviors (R7):
 *   - scrim + pane at z-index 90 (fin.css foundation)
 *   - Esc closes: window keydown, capture:true + stopPropagation so it wins over
 *     ChartPanel/SearchModal Esc listeners. The TranscriptDrawer, when open, has
 *     its OWN capture handler that calls stopImmediatePropagation, AND this
 *     handler early-returns while a drawer is open — so Esc closes the drawer
 *     before the pane (belt-and-braces).
 *   - body scroll lock while open
 *   - shallow deep-link: ?pane=<page> synced via history.replaceState
 *
 * FE3 mounts this and passes {sym, fund, intel, row, slice, quote, bars}. Sibling
 * page components (FE2b/FE2c/FE2d) are imported by name — they land in parallel.
 */
import { useCallback, useEffect, useRef } from "react";
import { useLang } from "../../lib/i18n";
import { pick } from "../../lib/finFormat";
import type { Fund, Bar } from "../../lib/fund";

import OverviewPage from "./OverviewPage";
import StatementsPage from "./StatementsPage";
import StatisticsPage from "./StatisticsPage";
import DividendsPage from "./DividendsPage";
import EarningsPage from "./EarningsPage";
import RevenuePage from "./RevenuePage";
import ForecastPage from "./ForecastPage";
// Sibling dashboards land from FE2c in parallel; imports resolve at integration.
import TechnicalsPage from "./TechnicalsPage";
import SeasonalsPage from "./SeasonalsPage";
// mastermind page = the existing deep-analysis (FE3-owned file; imported read-only).
import StockAnalysis from "../StockAnalysis";
import TranscriptDrawer from "./TranscriptDrawer";
import { useState } from "react";

/** The ten hostable pages. First six share the Financials tab bar. */
export type FinPage =
  | "overview"
  | "statements"
  | "statistics"
  | "dividends"
  | "earnings"
  | "revenue"
  | "forecast"
  | "technicals"
  | "seasonals"
  | "mastermind";

/** The six pages that share the TV "Financials" tab pill bar. */
const FIN_TABS: FinPage[] = ["overview", "statements", "statistics", "dividends", "earnings", "revenue"];

const PAGE_LABELS: Record<FinPage, [string, string]> = {
  overview: ["Overview", "概览"],
  statements: ["Statements", "报表"],
  statistics: ["Statistics", "统计"],
  dividends: ["Dividends", "股息"],
  earnings: ["Earnings", "盈利"],
  revenue: ["Revenue", "营收"],
  forecast: ["Forecast", "预测"],
  technicals: ["Technicals", "技术面"],
  seasonals: ["Seasonals", "季节性"],
  mastermind: ["Full analysis", "深度分析"],
};

export interface MegaPaneProps {
  sym: string;
  fund: Fund | null;
  /** intel/v1 analysis blob for the mastermind page (any — StockAnalysis owns its shape). */
  intel?: any;
  /** research-desk row (mastermind hero context). */
  row?: any;
  /** signal slice (mastermind signal history / oracle context). */
  slice?: any;
  /** live/delayed quote (statistics Current column, forecast spot). */
  quote?: { last: number | null } | null;
  /** OHLC bars for forecast/technicals/seasonals (from getBars). */
  bars?: Bar[];
  /** Which page is showing. */
  page: FinPage;
  /** Change page (tab click or a section `›` jump). */
  onPage: (p: FinPage) => void;
  /** Close the whole pane (Esc / scrim / Back to chart). */
  onClose: () => void;
  /** Company display name for the header + transcript title. */
  name?: string | null;
}

export default function MegaPane({
  sym,
  fund,
  intel,
  row,
  slice,
  quote,
  bars = [],
  page,
  onPage,
  onClose,
  name,
}: MegaPaneProps) {
  const { lang } = useLang();
  const zh = lang === "zh";
  const [txId, setTxId] = useState<string | null>(null);
  // Read the current drawer state inside the (once-registered) Esc handler
  // without re-subscribing the window listener on every txId change.
  const txOpenRef = useRef(false);
  txOpenRef.current = txId != null;

  const displayName = name || fund?.ticker || sym;
  const initial = (displayName || sym).trim().charAt(0).toUpperCase();

  // ── Esc (capture + stopPropagation so we win over ChartPanel/SearchModal) ──
  // The TranscriptDrawer registers its own capture handler; when it's open it
  // calls stopImmediatePropagation so this never fires. Belt-and-braces: we also
  // early-return here whenever a drawer is open (regardless of listener order),
  // so Esc closes the drawer BEFORE the pane.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (txOpenRef.current) return; // drawer owns Esc while open
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true } as any);
  }, [onClose]);

  // ── body scroll lock while open ──
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // ── ?pane= deep-link sync (shallow, no navigation) ──
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("pane") !== page) {
      url.searchParams.set("pane", page);
      window.history.replaceState(window.history.state, "", url.toString());
    }
  }, [page]);
  // strip ?pane= on unmount so a reload after close doesn't reopen it
  useEffect(() => {
    return () => {
      if (typeof window === "undefined") return;
      const url = new URL(window.location.href);
      if (url.searchParams.has("pane")) {
        url.searchParams.delete("pane");
        window.history.replaceState(window.history.state, "", url.toString());
      }
    };
  }, []);

  const navigate = useCallback((p: FinPage) => onPage(p), [onPage]);

  const pageTitle = pick(zh, PAGE_LABELS[page][0], PAGE_LABELS[page][1]);

  return (
    <>
      <div className="fin-scrim" onClick={onClose} aria-hidden />
      <div className="fin-pane" role="dialog" aria-modal="true" aria-label={`${displayName} · ${pageTitle}`}>
        {/* ── header ── */}
        <div className="fin-head">
          <span className="fin-head-logo" aria-hidden>
            {initial}
          </span>
          <span className="fin-head-title">
            {displayName} <span className="fin-head-sub">· {pageTitle}</span>
          </span>
          <button className="fin-head-back" onClick={onClose}>
            <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden style={{ fill: "none", stroke: "currentColor", strokeWidth: 2 }}>
              <path d="M15 18l-6-6 6-6" />
            </svg>
            {pick(zh, "Back to chart", "返回图表")}
          </button>
        </div>

        {/* ── Financials tab pill bar (six tabs) ── */}
        <div className="fin-tabs" role="tablist">
          {FIN_TABS.map((t) => (
            <button
              key={t}
              className={"fin-tab" + (page === t ? " on" : "")}
              role="tab"
              aria-selected={page === t}
              onClick={() => onPage(t)}
            >
              {pick(zh, PAGE_LABELS[t][0], PAGE_LABELS[t][1])}
            </button>
          ))}
        </div>

        {/* ── body ── */}
        <div className="fin-body" key={page}>
          {page === "overview" && <OverviewPage sym={sym} fund={fund} name={displayName} onNavigate={navigate} />}
          {page === "statements" && (
            <StatementsPage sym={sym} fund={fund} name={displayName} onOpenTx={(id) => setTxId(id)} />
          )}
          {page === "statistics" && <StatisticsPage fund={fund} quote={quote} zh={zh} />}
          {page === "dividends" && <DividendsPage sym={sym} fund={fund} zh={zh} />}
          {page === "earnings" && <EarningsPage fund={fund} zh={zh} />}
          {page === "revenue" && <RevenuePage fund={fund} zh={zh} />}
          {page === "forecast" && <ForecastPage sym={sym} fund={fund} bars={bars} zh={zh} />}
          {page === "technicals" && <TechnicalsPage sym={sym} bars={bars} zh={zh} />}
          {page === "seasonals" && <SeasonalsPage sym={sym} bars={bars} zh={zh} />}
          {page === "mastermind" && (
            <div className="fin-mm-host">
              <StockAnalysis intel={intel} row={row} slice={slice} deep />
            </div>
          )}
        </div>
      </div>

      {/* ── transcript slide-in (own Esc handler above this pane's) ── */}
      {txId && <TranscriptDrawer sym={sym} id={txId} name={displayName} onClose={() => setTxId(null)} />}
    </>
  );
}
