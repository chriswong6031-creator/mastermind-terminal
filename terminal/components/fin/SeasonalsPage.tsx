"use client";
/**
 * SeasonalsPage — the TradingView-style "Seasonals" dashboard, built entirely
 * from the daily `bars` prop.
 *   Chart view: <SeasonalsChart> (interactive multi-year overlay — hover-date
 *     crosshair, month separators, per-year toggles, drag-to-select span stats)
 *     followed by <AdvancedSeasonality> (the analytics deck).
 *   Table view: the monthly-returns grid (year × month %, green/red cells).
 * The active-year Set is owned here so the chart and the analytics stay in sync.
 *
 * Null-safe: bars=[] → empty state for both views.
 */
import { memo, useEffect, useMemo, useState, type CSSProperties } from "react";
import type { Bar } from "../../lib/fund";
import { fmtPct, pick } from "../../lib/finFormat";
import {
  buildYears,
  median,
  monthlyStats,
  MONTHS_EN,
  MONTHS_ZH,
  SEAS_WINDOWS,
  DEFAULT_SEAS_WINDOW,
  windowActiveSet,
  type SeasWindow,
  type YearData,
} from "../../lib/seasonal";
import { SeasonalsChart } from "./SeasonalsChart";
import { AdvancedSeasonality } from "./AdvancedSeasonality";
import { RegimeOutlook } from "./RegimeOutlook";
import { Disclaimer } from "./ForecastPage";

interface SeasonalsPageProps {
  sym: string;
  bars?: Bar[];
  zh?: boolean;
}

export default memo(SeasonalsPage); // pure prop-driven page — skip re-render on the 6s live-quote poll
const WIN_LS_KEY = "mm.seas.win";
function readWindow(): SeasWindow {
  if (typeof window === "undefined") return DEFAULT_SEAS_WINDOW;
  const v = window.localStorage.getItem(WIN_LS_KEY);
  return (SEAS_WINDOWS as string[]).includes(v ?? "") ? (v as SeasWindow) : DEFAULT_SEAS_WINDOW;
}

function SeasonalsPage({ sym, bars = [], zh = false }: SeasonalsPageProps) {
  const [view, setView] = useState<"chart" | "table">("chart");
  const years = useMemo(() => buildYears(bars), [bars]);

  // lookback window (persisted). SeasonalsPage only mounts inside the ssr:false
  // MegaPane, so a lazy initializer reading localStorage is hydration-safe.
  const [win, setWin] = useState<SeasWindow>(readWindow);
  const setWindow = (w: SeasWindow) => {
    setWin(w);
    if (typeof window !== "undefined") window.localStorage.setItem(WIN_LS_KEY, w);
    setActive(windowActiveSet(years, w)); // re-seed the active set to the new window
  };

  // active-year selection — seeded from the window (last N complete years + YTD),
  // NOT all-history; re-seeds when the symbol/years or window change. Per-year
  // chips can toggle any year on top of this.
  const yearKey = years.map((y) => y.year).join(",");
  const [active, setActive] = useState<Set<string>>(() => windowActiveSet(years, DEFAULT_SEAS_WINDOW));
  useEffect(() => {
    setActive(windowActiveSet(years, win));
  }, [yearKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleYear = (yr: string) =>
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(yr)) next.delete(yr);
      else next.add(yr);
      return next;
    });

  return (
    <div className="fin-seas">
      {/* section header — brand rail + hairline rule over the whole seasonal read.
          No eyebrow: the tab is already titled "Seasonals" (doctrine: never echo it). */}
      <div className="fin-seas-hdr">
        <div className="fin-sec-h fin-rail fin-rule" style={{ "--rail": "var(--brand)" } as CSSProperties}>
          {view === "chart"
            ? pick(zh, "Multi-year overlay", "多年叠加")
            : pick(zh, "Monthly returns by year", "逐年月度收益")}
        </div>
      </div>

      {/* header: view toggle + lookback window (the epistemics control) */}
      <div className="fin-seas-head">
        <div className="fin-toggle fin-seas-view">
          <button className={view === "chart" ? "on" : ""} onClick={() => setView("chart")}>
            {pick(zh, "Chart", "图表")}
          </button>
          <button className={view === "table" ? "on" : ""} onClick={() => setView("table")}>
            {pick(zh, "Table", "表格")}
          </button>
        </div>
        <WindowSeg win={win} onSet={setWindow} zh={zh} />
      </div>

      {view === "chart" ? (
        years.length === 0 ? (
          <div className="fin-empty">{pick(zh, "No daily price history loaded for this symbol yet.", "该标的尚未加载日线历史数据。")}</div>
        ) : (
          <>
            <div className="fin-sec">
              <SeasonalsChart years={years} active={active} onToggleYear={toggleYear} onSetActive={setActive} zh={zh} />
            </div>
            <AdvancedSeasonality years={years} active={active} win={win} zh={zh} />
            <RegimeOutlook sym={sym} zh={zh} />
          </>
        )
      ) : (
        // key on the window so the 'show all' expander resets when it changes
        <MonthlyGrid key={win} years={years} active={active} win={win} zh={zh} />
      )}

      <Disclaimer zh={zh} />
    </div>
  );
}

/* Segmented lookback control — 5Y | 10Y | 15Y | Max. Changing it re-seeds the
   active-year set, so every panel + the table follow the chosen sample. */
function WindowSeg({ win, onSet, zh }: { win: SeasWindow; onSet: (w: SeasWindow) => void; zh: boolean }) {
  const label = (w: SeasWindow) => (w === "max" ? pick(zh, "Max", "全部") : `${w}Y`);
  return (
    <div className="fin-toggle fin-seas-win" role="group" aria-label={pick(zh, "Lookback window", "回溯窗口")}>
      {SEAS_WINDOWS.map((w) => (
        <button key={w} className={win === w ? "on" : ""} onClick={() => onSet(w)} aria-pressed={win === w}>
          {label(w)}
        </button>
      ))}
    </div>
  );
}

/* Monthly-returns grid: rows = years, cols = Jan…Dec + Year total, green/red
   cells. Capped to the lookback window (the active-year set) with a 'show all'
   expander, plus a bold per-month Median + hit-rate footer over the window. */
function MonthlyGrid({ years, active, win, zh }: { years: YearData[]; active: Set<string>; win: SeasWindow; zh: boolean }) {
  // remounted (via key={win}) when the window changes, so this starts collapsed
  const [showAll, setShowAll] = useState(false);

  if (years.length === 0) return <div className="fin-empty">{pick(zh, "No daily price history loaded for this symbol yet.", "该标的尚未加载日线历史数据。")}</div>;
  const months = zh ? MONTHS_ZH : MONTHS_EN;

  const windowed = years.filter((y) => active.has(y.year));
  const shown = showAll ? years : windowed;
  const rows = shown.slice().reverse();
  const hiddenCount = years.length - windowed.length;

  // per-month aggregate over the windowed rows: median return + hit-rate (% up).
  const ms = monthlyStats(windowed, (yr) => active.has(yr));
  const fyVals = windowed.map((y) => y.yearRet).filter((v): v is number => v != null && isFinite(v));
  const yrMedian = median(fyVals);
  const yrUp = fyVals.filter((v) => v > 0).length;
  const winLabel = win === "max" ? pick(zh, "all years", "全部年份") : pick(zh, `last ${win} yrs`, `近${win}年`);

  return (
    <div className="fin-sec">
      <div className="fin-table-scroll">
        <table className="fin-table fin-seas-grid">
          <thead>
            <tr>
              <th className="fin-cell fin-cell-sticky">{pick(zh, "Year", "年份")}</th>
              {months.map((m) => (
                <th key={m} className="fin-cell fin-cell-num">{m}</th>
              ))}
              <th className="fin-cell fin-cell-num">{pick(zh, "Year", "全年")}</th>
            </tr>
          </thead>
          <tbody>
            {/* aggregate: median + hit-rate over the window (glance-tier summary) */}
            <tr className="fin-row fin-seas-aggrow">
              <th className="fin-cell fin-cell-sticky" scope="row">{pick(zh, "Median", "中位")}</th>
              {ms.map((s, i) => (
                <td key={i} className={"fin-cell fin-cell-num fin-seas-cell " + (s.median == null ? "" : s.median >= 0 ? "up" : "down")}>
                  {s.median == null ? "—" : fmtPct(s.median / 100, { sign: true, decimals: 1 })}
                </td>
              ))}
              <td className={"fin-cell fin-cell-num fin-seas-cell b " + (yrMedian == null ? "" : yrMedian >= 0 ? "up" : "down")}>
                {yrMedian == null ? "—" : fmtPct(yrMedian / 100, { sign: true, decimals: 1 })}
              </td>
            </tr>
            <tr className="fin-row fin-seas-aggrow fin-seas-hitrow">
              <th className="fin-cell fin-cell-sticky" scope="row">{pick(zh, "Hit rate", "胜率")}</th>
              {ms.map((s, i) => (
                <td key={i} className="fin-cell fin-cell-num fin-seas-cell dim">
                  {s.n === 0 ? "—" : `${Math.round((s.wr ?? 0) * 100)}%`}
                </td>
              ))}
              <td className="fin-cell fin-cell-num fin-seas-cell b dim">
                {fyVals.length === 0 ? "—" : `${Math.round((yrUp / fyVals.length) * 100)}%`}
              </td>
            </tr>
            {rows.map((y) => (
              <tr className="fin-row" key={y.year}>
                <th className="fin-cell fin-cell-sticky" scope="row">{y.year}</th>
                {y.monthlyRet.map((v, i) => (
                  <td key={i} className={"fin-cell fin-cell-num fin-seas-cell " + (v == null ? "" : v >= 0 ? "up" : "down")}>
                    {v == null ? "—" : fmtPct(v / 100, { sign: true, decimals: 1 })}
                  </td>
                ))}
                <td className={"fin-cell fin-cell-num fin-seas-cell b " + (y.yearRet == null ? "" : y.yearRet >= 0 ? "up" : "down")}>
                  {y.yearRet == null ? "—" : fmtPct(y.yearRet / 100, { sign: true, decimals: 1 })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="fin-seas-tablefoot">
        <span className="fin-seas-tablescope">{pick(zh, `Median · hit rate over ${winLabel}`, `中位 · 胜率（${winLabel}）`)}</span>
        {!showAll && hiddenCount > 0 && (
          <button className="fin-seas-showall" onClick={() => setShowAll(true)}>
            {pick(zh, `Show all ${years.length} years`, `显示全部 ${years.length} 年`)}
          </button>
        )}
        {showAll && hiddenCount > 0 && (
          <button className="fin-seas-showall" onClick={() => setShowAll(false)}>
            {pick(zh, `Back to ${winLabel}`, `返回${winLabel}`)}
          </button>
        )}
      </div>
    </div>
  );
}
