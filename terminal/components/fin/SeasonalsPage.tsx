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
import { memo, useEffect, useMemo, useState } from "react";
import type { Bar } from "../../lib/fund";
import { fmtPct, pick } from "../../lib/finFormat";
import { buildYears, MONTHS_EN, MONTHS_ZH, type YearData } from "../../lib/seasonal";
import { SeasonalsChart } from "./SeasonalsChart";
import { AdvancedSeasonality } from "./AdvancedSeasonality";
import { Disclaimer } from "./ForecastPage";

interface SeasonalsPageProps {
  sym: string;
  bars?: Bar[];
  zh?: boolean;
}

export default memo(SeasonalsPage); // pure prop-driven page — skip re-render on the 6s live-quote poll
function SeasonalsPage({ sym, bars = [], zh = false }: SeasonalsPageProps) {
  const [view, setView] = useState<"chart" | "table">("chart");
  const years = useMemo(() => buildYears(bars), [bars]);

  // active-year selection (all on by default); reset when the symbol/years change
  const yearKey = years.map((y) => y.year).join(",");
  const [active, setActive] = useState<Set<string>>(() => new Set(years.map((y) => y.year)));
  useEffect(() => {
    setActive(new Set(years.map((y) => y.year)));
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
      {/* view toggle */}
      <div className="fin-toggle fin-seas-view">
        <button className={view === "chart" ? "on" : ""} onClick={() => setView("chart")}>
          {pick(zh, "Chart", "图表")}
        </button>
        <button className={view === "table" ? "on" : ""} onClick={() => setView("table")}>
          {pick(zh, "Table", "表格")}
        </button>
      </div>

      {view === "chart" ? (
        years.length === 0 ? (
          <div className="fin-empty">{pick(zh, "No data", "暂无数据")}</div>
        ) : (
          <>
            <div className="fin-sec">
              <SeasonalsChart years={years} active={active} onToggleYear={toggleYear} onSetActive={setActive} zh={zh} />
            </div>
            <AdvancedSeasonality years={years} active={active} zh={zh} />
          </>
        )
      ) : (
        <MonthlyGrid years={years} zh={zh} />
      )}

      <Disclaimer zh={zh} />
    </div>
  );
}

/* Monthly-returns grid: rows = years, cols = Jan…Dec + Year total, green/red cells. */
function MonthlyGrid({ years, zh }: { years: YearData[]; zh: boolean }) {
  if (years.length === 0) return <div className="fin-empty">{pick(zh, "No data", "暂无数据")}</div>;
  const months = zh ? MONTHS_ZH : MONTHS_EN;
  return (
    <div className="fin-sec fin-table-scroll">
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
          {years
            .slice()
            .reverse()
            .map((y) => (
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
  );
}
