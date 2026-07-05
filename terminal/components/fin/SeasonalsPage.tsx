"use client";
/**
 * SeasonalsPage — the TradingView "Seasonals" dashboard (BUILD-SPEC §3.4 FE2c,
 * spec/tech-seasonals.md). Built entirely from the daily `bars` prop:
 *   - Per-year paths (last ~8y) overlaid on a shared Jan→Dec horizon, rendered by
 *     the FinCharts <YearOverlay> (which owns Percent/Regular, the dotted Average,
 *     the year-range slider, and the right-edge year/value labels).
 *   - A chart / table toggle. The table view is the monthly-returns grid
 *     (year × month %, green/red cells, a full-year column).
 *
 * Null-safe: bars=[] → empty state for both views.
 */
import { memo, useMemo, useState } from "react";
import type { Bar } from "../../lib/fund";
import { fmtPct, pick } from "../../lib/finFormat";
import { YearOverlay, type YearPath } from "./FinCharts";
import { Disclaimer } from "./ForecastPage";

interface SeasonalsPageProps {
  sym: string;
  bars?: Bar[];
  zh?: boolean;
}

const HORIZON = 252; // calendar trading-day positions Jan→Dec
const MAX_YEARS = 8;
const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_ZH = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];

// Fixed per-year color mapping (spec §5 Seasonals).
const YEAR_COLORS: Record<string, string> = {
  "2018": "#2dd4bf",
  "2019": "#22d3ee",
  "2020": "#22c55e",
  "2021": "#eab308",
  "2022": "#ef4444",
  "2023": "#60a5fa",
  "2024": "#f97316",
  "2025": "#a3e635",
};

interface YearData {
  year: string;
  // per-position price and cumulative % (index 0..HORIZON-1)
  price: (number | null)[];
  monthlyRet: (number | null)[]; // 12 entries, month %
  isCurrent: boolean;
}

/** Group daily bars by calendar year; resample each to a HORIZON-length grid. */
function buildYears(bars: Bar[]): YearData[] {
  if (bars.length === 0) return [];
  const byYear = new Map<string, Bar[]>();
  for (const b of bars) {
    const yr = String(b.time).slice(0, 4);
    if (!byYear.has(yr)) byYear.set(yr, []);
    byYear.get(yr)!.push(b);
  }
  const years = Array.from(byYear.keys()).sort();
  const recent = years.slice(-MAX_YEARS);
  const curYear = years[years.length - 1];

  return recent.map((yr) => {
    const arr = byYear.get(yr)!.slice().sort((a, b) => String(a.time).localeCompare(String(b.time)));
    // resample the year's closes onto a HORIZON grid (linear index map)
    const price: (number | null)[] = new Array(HORIZON).fill(null);
    const n = arr.length;
    for (let i = 0; i < HORIZON; i++) {
      const frac = HORIZON <= 1 ? 0 : i / (HORIZON - 1);
      const srcIdx = Math.round(frac * (n - 1));
      // only fill up to the last available trading day (partial current year)
      if (srcIdx < n) price[i] = arr[srcIdx].c;
    }
    // truncate the current (partial) year at its real coverage
    if (yr === curYear && n > 0) {
      const cover = Math.round(((n - 1) / Math.max(1, dayOfYearSpan(arr))) * HORIZON);
      const cut = Math.min(HORIZON, Math.max(1, cover));
      for (let i = cut; i < HORIZON; i++) price[i] = null;
    }

    // monthly returns: last close of month vs last close of prior month (first month vs year open)
    const monthLast: (number | null)[] = new Array(12).fill(null);
    const monthFirst: (number | null)[] = new Array(12).fill(null);
    for (const b of arr) {
      const m = parseInt(String(b.time).slice(5, 7), 10) - 1;
      if (m < 0 || m > 11) continue;
      if (monthFirst[m] == null) monthFirst[m] = b.o ?? b.c;
      monthLast[m] = b.c;
    }
    const monthlyRet: (number | null)[] = new Array(12).fill(null);
    for (let m = 0; m < 12; m++) {
      const close = monthLast[m];
      if (close == null) continue;
      // prior reference = previous month's last close, else this month's first
      let prevRef: number | null = null;
      for (let k = m - 1; k >= 0; k--) {
        if (monthLast[k] != null) {
          prevRef = monthLast[k];
          break;
        }
      }
      if (prevRef == null) prevRef = monthFirst[m];
      if (prevRef != null && prevRef !== 0) monthlyRet[m] = (close / prevRef - 1) * 100;
    }

    return { year: yr, price, monthlyRet, isCurrent: yr === curYear };
  });
}

/** Approximate how far into the year the last bar sits (0..1 of Jan1→Dec31). */
function dayOfYearSpan(arr: Bar[]): number {
  const last = arr[arr.length - 1];
  const dt = new Date(String(last.time).slice(0, 10) + "T00:00:00Z");
  const start = Date.UTC(dt.getUTCFullYear(), 0, 1);
  const end = Date.UTC(dt.getUTCFullYear(), 11, 31);
  return Math.max(1, Math.round((dt.getTime() - start) / 86400000)) / Math.round((end - start) / 86400000);
}

export default memo(SeasonalsPage);   // pure prop-driven page — skip re-render on the 6s live-quote poll
function SeasonalsPage({ sym, bars = [], zh = false }: SeasonalsPageProps) {
  const [view, setView] = useState<"chart" | "table">("chart");
  const years = useMemo(() => buildYears(bars), [bars]);

  const paths: YearPath[] = years.map((y) => ({
    year: y.year,
    values: y.price,
    color: YEAR_COLORS[y.year] ?? undefined,
    current: y.isCurrent,
  }));

  const monthLabels = useMemo(() => {
    // sparse month labels along the horizon (12 evenly-spaced)
    return (zh ? MONTHS_ZH : MONTHS_EN);
  }, [zh]);

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
        <div className="fin-sec">
          <YearOverlay paths={paths} horizon={HORIZON} monthLabels={monthLabels} vw={840} vh={420} zh={zh} />
        </div>
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
  // full-year return = compounded monthly
  const yearTotal = (mr: (number | null)[]) => {
    let acc = 1;
    let any = false;
    for (const v of mr) {
      if (v != null) {
        acc *= 1 + v / 100;
        any = true;
      }
    }
    return any ? (acc - 1) * 100 : null;
  };
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
            .map((y) => {
              const tot = yearTotal(y.monthlyRet);
              return (
                <tr className="fin-row" key={y.year}>
                  <th className="fin-cell fin-cell-sticky" scope="row">{y.year}</th>
                  {y.monthlyRet.map((v, i) => (
                    <td key={i} className={"fin-cell fin-cell-num fin-seas-cell " + (v == null ? "" : v >= 0 ? "up" : "down")}>
                      {v == null ? "—" : fmtPct(v / 100, { sign: true, decimals: 1 })}
                    </td>
                  ))}
                  <td className={"fin-cell fin-cell-num fin-seas-cell b " + (tot == null ? "" : tot >= 0 ? "up" : "down")}>
                    {tot == null ? "—" : fmtPct(tot / 100, { sign: true, decimals: 1 })}
                  </td>
                </tr>
              );
            })}
        </tbody>
      </table>
    </div>
  );
}
