"use client";
/**
 * ForecastPage — the TradingView "Forecast" dashboard (BUILD-SPEC §3.4 FE2c,
 * spec/forecast.md). Two sibling tabs:
 *   - "Price target": price-history line + forward fan to mean/high/low targets,
 *     summary sentence, analyst-rating HalfGauge + distribution bars, then EPS &
 *     Revenue reported/estimate Bars (with FORECAST hatch) + surprise MiniTable.
 *   - "Actuals and estimates": estimate-fan LineSeries + statement pills +
 *     Actual/Avg/High/Low/#estimates MiniTable from fund.estimates.
 *
 * JUDGE-FIXED constraints honored here:
 *   - The forecast fan spans current-FY→next-FY ONLY (fund.estimates carries
 *     exactly 2 FY periods; §1.1). We never invent a third estimate period.
 *   - Price-history line comes from the `bars` prop (getBars) — never a raw fetch.
 *   - CN (fund.estimates == null / fund.analyst == null) renders the analyst
 *     empty-state, surfacing fund.guidance as a company-guidance chip when present.
 *
 * Standalone page: default export, receives narrow props; MegaPane wires them.
 * Everything null-guarded (fund=null, bars=[]).
 */
import { useMemo, useState } from "react";
import type { Fund } from "../../lib/fund";
import type { Bar } from "../../lib/fund";
import {
  fmtNum,
  fmtPct,
  fmtCur,
  pick,
  signColor,
} from "../../lib/finFormat";
import {
  Bars,
  LineSeries,
  HalfGauge,
  MiniTable,
  type Series,
  type MiniRow,
} from "./FinCharts";

interface ForecastPageProps {
  sym: string;
  fund: Fund | null;
  bars?: Bar[];
  zh?: boolean;
}

/* rating_label / dist → gauge reading in [-1, 1] (weighted mean of buckets). */
function analystReading(dist: NonNullable<Fund["analyst"]>["dist"]): number | null {
  const w = dist.strongBuy * 1 + dist.buy * 0.5 + dist.hold * 0 + dist.sell * -0.5 + dist.strongSell * -1;
  const n = dist.strongBuy + dist.buy + dist.hold + dist.sell + dist.strongSell;
  return n > 0 ? w / n : null;
}

/* signed % of a target vs the current price, formatted with explicit sign + color. */
function upsidePct(target: number | null, cur: number | null): number | null {
  if (target == null || cur == null || cur === 0) return null;
  return (target - cur) / cur;
}

/* currency-aware money axis: big → K/M/B, small → 2dp. */
function moneyFmt(ccy: string | null | undefined) {
  return (v: number) => fmtCur(v, ccy);
}

export default function ForecastPage({ sym, fund, bars = [], zh = false }: ForecastPageProps) {
  const [tab, setTab] = useState<"target" | "actuals">("target");
  const [epsFreq, setEpsFreq] = useState<"A" | "Q">("A");
  const [revFreq, setRevFreq] = useState<"A" | "Q">("A");
  const [stmt, setStmt] = useState<"income" | "balance" | "cashflow">("income");

  const ccy = fund?.quote_currency ?? "USD";
  const est = fund?.estimates ?? null;
  const analyst = fund?.analyst ?? null;

  // Live/last price from the price-history line (last finite close).
  const lastPrice = useMemo(() => {
    for (let i = bars.length - 1; i >= 0; i--) if (isFinite(bars[i]?.c)) return bars[i].c;
    return null;
  }, [bars]);

  return (
    <div className="fin-fc">
      {/* sibling tab bar */}
      <div className="fin-toggle fin-fc-tabs">
        <button className={tab === "target" ? "on" : ""} onClick={() => setTab("target")}>
          {pick(zh, "Price target", "目标价")}
        </button>
        <button className={tab === "actuals" ? "on" : ""} onClick={() => setTab("actuals")}>
          {pick(zh, "Actuals and estimates", "实际与预期")}
        </button>
      </div>

      {tab === "target" ? (
        <PriceTargetTab
          sym={sym}
          fund={fund}
          bars={bars}
          lastPrice={lastPrice}
          ccy={ccy}
          analyst={analyst}
          est={est}
          epsFreq={epsFreq}
          setEpsFreq={setEpsFreq}
          revFreq={revFreq}
          setRevFreq={setRevFreq}
          zh={zh}
        />
      ) : (
        <ActualsTab fund={fund} est={est} stmt={stmt} setStmt={setStmt} ccy={ccy} zh={zh} />
      )}

      <Disclaimer zh={zh} />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * TAB A — Price target
 * ───────────────────────────────────────────────────────────────────────── */

function PriceTargetTab({
  fund,
  bars,
  lastPrice,
  ccy,
  analyst,
  est,
  epsFreq,
  setEpsFreq,
  revFreq,
  setRevFreq,
  zh,
}: {
  sym: string;
  fund: Fund | null;
  bars: Bar[];
  lastPrice: number | null;
  ccy: string;
  analyst: Fund["analyst"];
  est: Fund["estimates"];
  epsFreq: "A" | "Q";
  setEpsFreq: (f: "A" | "Q") => void;
  revFreq: "A" | "Q";
  setRevFreq: (f: "A" | "Q") => void;
  zh: boolean;
}) {
  const target = analyst?.target ?? null;
  const mean = target?.mean ?? null;
  const high = target?.high ?? null;
  const low = target?.low ?? null;
  const nTargets = target?.n ?? null;

  const avgUp = upsidePct(mean, lastPrice);

  return (
    <>
      <div className="fin-grid2 fin-fc-top">
        {/* left: price-target header + fan */}
        <div className="fin-card">
          <div className="fin-fc-lbl">{pick(zh, "Price target", "目标价")}</div>
          {mean != null ? (
            <>
              <div className="fin-fc-price">
                {fmtNum(mean)} <span className="fin-fc-ccy">{ccy}</span>
              </div>
              {avgUp != null && (
                <div className="fin-fc-chg">
                  {lastPrice != null && (
                    <span style={{ color: signColor(mean - lastPrice) }}>
                      {fmtNum(mean - lastPrice, { decimals: 2 })}
                    </span>
                  )}
                  <span style={{ color: signColor(avgUp) }}>{fmtPct(avgUp, { sign: true })}</span>
                </div>
              )}
              {nTargets != null && high != null && low != null && (
                <div className="fin-fc-summary">
                  {pick(
                    zh,
                    `The ${nTargets} analysts offering 1-year price forecasts have a max estimate of ${fmtNum(high)} and a min estimate of ${fmtNum(low)}.`,
                    `提供1年价格预测的 ${nTargets} 位分析师，最高目标价 ${fmtNum(high)}，最低目标价 ${fmtNum(low)}。`,
                  )}
                </div>
              )}
              <PriceFan bars={bars} cur={lastPrice} mean={mean} high={high} low={low} ccy={ccy} zh={zh} />
            </>
          ) : (
            <AnalystEmpty fund={fund} zh={zh} />
          )}
        </div>

        {/* right: analyst rating gauge + distribution */}
        <div className="fin-card">
          <div className="fin-sec-h">{pick(zh, "Analyst rating", "分析师评级")}</div>
          {analyst ? (
            <AnalystRating analyst={analyst} zh={zh} />
          ) : (
            <AnalystEmpty fund={fund} zh={zh} />
          )}
        </div>
      </div>

      {/* EPS section */}
      <EstimateBarSection
        title="EPS"
        titleZh="每股收益"
        kind="eps"
        fund={fund}
        est={est}
        freq={epsFreq}
        setFreq={setEpsFreq}
        ccy={ccy}
        zh={zh}
      />

      {/* Revenue section */}
      <EstimateBarSection
        title="Revenue"
        titleZh="营收"
        kind="rev"
        fund={fund}
        est={est}
        freq={revFreq}
        setFreq={setRevFreq}
        ccy={ccy}
        zh={zh}
      />
    </>
  );
}

/* Price history line (from bars) + a 2-period forward fan to mean/high/low. */
function PriceFan({
  bars,
  cur,
  mean,
  high,
  low,
  ccy,
  zh,
}: {
  bars: Bar[];
  cur: number | null;
  mean: number | null;
  high: number | null;
  low: number | null;
  ccy: string;
  zh: boolean;
}) {
  // Trailing ~2y of dailies, sampled to ≤120 points for a clean SVG path.
  const hist = useMemo(() => {
    const tail = bars.slice(-504);
    if (tail.length === 0) return { labels: [] as string[], values: [] as (number | null)[] };
    const step = Math.max(1, Math.ceil(tail.length / 120));
    const pts = tail.filter((_, i) => i % step === 0 || i === tail.length - 1);
    return {
      labels: pts.map((b) => String(b.time).slice(0, 7)),
      values: pts.map((b) => b.c),
    };
  }, [bars]);

  if (hist.values.length === 0 || mean == null) {
    return null;
  }

  // Fan: the historical line, plus three forward series that begin at `cur`
  // (the anchor) and end at high / mean / low over TWO synthetic forward slots
  // (current-FY → next-FY, per the judge-fixed 2-period rule).
  const n = hist.values.length;
  const anchor = cur ?? hist.values[n - 1] ?? mean;
  const pad: (number | null)[] = new Array(n - 1).fill(null);
  const labels = [...hist.labels, pick(zh, "1Y FORECAST", "1年预测"), ""];

  const histSeries: Series = {
    name: pick(zh, "Price", "价格"),
    values: [...hist.values, null, null],
    color: "var(--brand)",
  };
  const fan: Series[] = [];
  if (high != null) fan.push({ name: pick(zh, "Max", "最高"), values: [...pad, anchor, null, high], color: "var(--up)" });
  fan.push({ name: pick(zh, "Average", "平均"), values: [...pad, anchor, null, mean], color: "var(--warn)" });
  if (low != null) fan.push({ name: pick(zh, "Min", "最低"), values: [...pad, anchor, null, low], color: "var(--down)" });

  return (
    <div className="fin-fc-fanwrap">
      <LineSeries
        labels={labels}
        series={[histSeries, ...fan]}
        fmtY={(v) => fmtNum(v)}
        vw={420}
        vh={220}
        zh={zh}
        noLegend
      />
      {/* end brackets: Max / Avg / Current / Min */}
      <div className="fin-fc-brackets">
        {high != null && <Bracket label={pick(zh, "Max", "最高")} pct={upsidePct(high, cur)} price={high} tone="up" zh={zh} />}
        <Bracket label={pick(zh, "Avg", "平均")} pct={upsidePct(mean, cur)} price={mean} tone="avg" zh={zh} />
        {cur != null && <Bracket label={pick(zh, "Current", "当前")} pct={null} price={cur} tone="cur" zh={zh} />}
        {low != null && <Bracket label={pick(zh, "Min", "最低")} pct={upsidePct(low, cur)} price={low} tone="down" zh={zh} />}
      </div>
    </div>
  );
}

function Bracket({
  label,
  pct,
  price,
  tone,
  zh,
}: {
  label: string;
  pct: number | null;
  price: number | null;
  tone: "up" | "avg" | "cur" | "down";
  zh: boolean;
}) {
  return (
    <div className={"fin-fc-bracket t-" + tone}>
      <span className="lbl">
        {label}
        {pct != null && <span className="pct">{fmtPct(pct, { sign: true })}</span>}
      </span>
      <span className="val">{fmtNum(price)}</span>
    </div>
  );
}

function AnalystRating({ analyst, zh }: { analyst: NonNullable<Fund["analyst"]>; zh: boolean }) {
  const dist = analyst.dist;
  const reading = analystReading(dist);
  const total = dist.strongBuy + dist.buy + dist.hold + dist.sell + dist.strongSell;
  const maxCount = Math.max(dist.strongBuy, dist.buy, dist.hold, dist.sell, dist.strongSell, 1);
  const rows: { label: string; labelZh: string; count: number; tone: string }[] = [
    { label: "Strong buy", labelZh: "强烈买入", count: dist.strongBuy, tone: "up" },
    { label: "Buy", labelZh: "买入", count: dist.buy, tone: "up2" },
    { label: "Hold", labelZh: "持有", count: dist.hold, tone: "neu" },
    { label: "Sell", labelZh: "卖出", count: dist.sell, tone: "neu" },
    { label: "Strong sell", labelZh: "强烈卖出", count: dist.strongSell, tone: "neu" },
  ];
  return (
    <>
      <div className="fin-sec-cap">
        {pick(
          zh,
          `Based on ${total} analysts giving stock ratings in the past 3 months.`,
          `基于过去3个月 ${total} 位分析师的评级。`,
        )}
      </div>
      <HalfGauge value={reading} verdict={ratingWord(analyst.rating_label, reading, zh)} variant="analyst" size={220} zh={zh} />
      <div className="fin-fc-dist">
        {rows.map((r) => (
          <div className="fin-fc-dist-row" key={r.label}>
            <span className="lbl">{pick(zh, r.label, r.labelZh)}</span>
            <span className="track">
              <span className={"bar t-" + r.tone} style={{ width: `${(r.count / maxCount) * 100}%` }} />
            </span>
            <span className="cnt">{r.count}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function ratingWord(label: string | null, reading: number | null, zh: boolean): string {
  if (label) {
    if (!zh) return label;
    const map: Record<string, string> = {
      "Strong buy": "强烈买入",
      Buy: "买入",
      Hold: "持有",
      Neutral: "中性",
      Sell: "卖出",
      "Strong sell": "强烈卖出",
    };
    return map[label] ?? label;
  }
  return "";
}

/* CN / no-coverage empty state; surfaces company guidance chip when present. */
function AnalystEmpty({ fund, zh }: { fund: Fund | null; zh: boolean }) {
  const g = fund?.guidance ?? null;
  return (
    <div className="fin-empty fin-fc-analyst-empty">
      <div>{pick(zh, "No analyst coverage", "暂无分析师覆盖")}</div>
      {g && (
        <div className="fin-fc-guidance">
          <span className="chip">{g.type}</span>
          <span className="txt">
            {pick(zh, "Company guidance", "公司业绩预告")}
            {g.chg_min != null && g.chg_max != null && (
              <> · {fmtPct(g.chg_min / 100, { sign: true })}…{fmtPct(g.chg_max / 100, { sign: true })}</>
            )}
            {g.period && <> · {g.period}</>}
          </span>
        </div>
      )}
    </div>
  );
}

/* ── EPS / Revenue clustered-bar section (Reported vs Estimate + FORECAST) ── */

function EstimateBarSection({
  title,
  titleZh,
  kind,
  fund,
  est,
  freq,
  setFreq,
  ccy,
  zh,
}: {
  title: string;
  titleZh: string;
  kind: "eps" | "rev";
  fund: Fund | null;
  est: Fund["estimates"];
  freq: "A" | "Q";
  setFreq: (f: "A" | "Q") => void;
  ccy: string;
  zh: boolean;
}) {
  // Actuals from fund.earnings (fy annual / q quarterly); forecast tail from estimates.
  const built = useMemo(() => buildEstimateRows(kind, fund, est, freq), [kind, fund, est, freq]);
  const reportedColor = kind === "eps" ? "var(--brand)" : "var(--warn)";
  const fmtV = kind === "eps" ? (v: number) => fmtNum(v, { decimals: 2 }) : moneyFmt(ccy);

  const barSeries: Series[] = [
    { name: pick(zh, "Reported", "实际"), values: built.reported, color: reportedColor },
    { name: pick(zh, "Estimate", "预期"), values: built.estimate, color: "var(--text-2)" },
  ];

  const rows: MiniRow[] = [
    { label: pick(zh, "Reported", "实际"), values: built.reported, fmt: fmtV },
    { label: pick(zh, "Estimate", "预期"), values: built.estimate, fmt: fmtV },
    {
      label: pick(zh, "Surprise", "超预期"),
      values: built.surprise,
      fmt: (v) => fmtPct(v, { alreadyPct: true, sign: true }),
    },
  ];

  return (
    <div className="fin-sec">
      <div className="fin-fc-sec-head">
        <div className="fin-sec-h">{pick(zh, title, titleZh)}</div>
        <div className="fin-toggle">
          <button className={freq === "A" ? "on" : ""} onClick={() => setFreq("A")}>{pick(zh, "Annual", "年度")}</button>
          <button className={freq === "Q" ? "on" : ""} onClick={() => setFreq("Q")}>{pick(zh, "Quarterly", "季度")}</button>
        </div>
      </div>
      {built.labels.length === 0 ? (
        <div className="fin-empty">{pick(zh, "No estimate data", "暂无预期数据")}</div>
      ) : (
        <>
          <Bars labels={built.labels} series={barSeries} fmtY={kind === "eps" ? (v) => fmtNum(v, { decimals: 2 }) : (v) => fmtNum(v)} vw={520} vh={190} zh={zh} height={200} />
          <MiniTable
            periods={built.labels}
            rows={rows}
            fmt={fmtV}
            pageSize={10}
            zh={zh}
            cornerLabel={pick(zh, `Currency: ${ccy}`, `货币：${ccy}`)}
          />
        </>
      )}
    </div>
  );
}

/**
 * buildEstimateRows — align reported actuals to forward estimates on a shared
 * period axis. Actuals come from fund.earnings; the forward tail (estimate-only
 * columns) comes from fund.estimates and spans EXACTLY the 2 estimate periods
 * the contract carries (current-FY→next-FY, or the 2 forward quarters).
 */
function buildEstimateRows(
  kind: "eps" | "rev",
  fund: Fund | null,
  est: Fund["estimates"],
  freq: "A" | "Q",
) {
  const labels: string[] = [];
  const reported: (number | null)[] = [];
  const estimate: (number | null)[] = [];

  const pickA = (r: { eps_a?: number | null; rev_a?: number | null }) => (kind === "eps" ? r.eps_a ?? null : r.rev_a ?? null);
  const pickE = (r: { eps_e?: number | null; rev_e?: number | null }) => (kind === "eps" ? r.eps_e ?? null : r.rev_e ?? null);

  if (freq === "A") {
    for (const fy of fund?.earnings?.fy ?? []) {
      labels.push(fy.period);
      reported.push(pickA(fy));
      estimate.push(pickE(fy));
    }
  } else {
    for (const q of fund?.earnings?.q ?? []) {
      labels.push(q.period);
      reported.push(pickA(q));
      estimate.push(pickE(q));
    }
  }

  // Forward tail: the estimate periods that aren't already present as actuals.
  // Revenue has FY estimates only (no quarterly estimate series in the contract).
  const fwd = kind === "eps"
    ? (freq === "A" ? est?.eps_fy : est?.eps_q)
    : (freq === "A" ? est?.rev_fy : null);
  if (fwd) {
    fwd.periods.forEach((p, i) => {
      if (labels.includes(p)) {
        // patch estimate onto an existing (actual) column
        const idx = labels.indexOf(p);
        if (estimate[idx] == null) estimate[idx] = fwd.avg[i] ?? null;
      } else {
        labels.push(p);
        reported.push(null);
        estimate.push(fwd.avg[i] ?? null);
      }
    });
  }

  const surprise = reported.map((r, i) => {
    const e = estimate[i];
    if (r == null || e == null || e === 0) return null;
    return ((r - e) / Math.abs(e)) * 100;
  });

  return { labels, reported, estimate, surprise };
}

/* ─────────────────────────────────────────────────────────────────────────
 * TAB B — Actuals and estimates
 * ───────────────────────────────────────────────────────────────────────── */

function ActualsTab({
  fund,
  est,
  stmt,
  setStmt,
  ccy,
  zh,
}: {
  fund: Fund | null;
  est: Fund["estimates"];
  stmt: "income" | "balance" | "cashflow";
  setStmt: (s: "income" | "balance" | "cashflow") => void;
  ccy: string;
  zh: boolean;
}) {
  const built = useMemo(() => buildActualsTable(fund, est, stmt), [fund, est, stmt]);

  // Top chart plots the EPS estimate fan (Actual / Average / High / Low).
  const chart = useMemo(() => {
    if (!est) return null;
    const fy = est.eps_fy;
    // actual years from earnings.fy + the 2 estimate years
    const actLabels: string[] = [];
    const actual: (number | null)[] = [];
    for (const r of fund?.earnings?.fy ?? []) {
      actLabels.push(r.period);
      actual.push(r.eps_a ?? null);
    }
    const labels = [...actLabels];
    fy.periods.forEach((p) => {
      if (!labels.includes(p)) labels.push(p + " E");
    });
    const actualPadded = new Array(labels.length).fill(null) as (number | null)[];
    actual.forEach((v, i) => (actualPadded[i] = v));
    const avg = new Array(labels.length).fill(null) as (number | null)[];
    const high = new Array(labels.length).fill(null) as (number | null)[];
    const low = new Array(labels.length).fill(null) as (number | null)[];
    fy.periods.forEach((p, i) => {
      const li = labels.indexOf(p + " E") >= 0 ? labels.indexOf(p + " E") : labels.indexOf(p);
      if (li >= 0) {
        avg[li] = fy.avg[i] ?? null;
        high[li] = fy.high[i] ?? null;
        low[li] = fy.low[i] ?? null;
      }
    });
    // bridge Average to the last actual so the cone connects
    const lastActIdx = actual.map((v, i) => (v != null ? i : -1)).filter((i) => i >= 0).pop();
    if (lastActIdx != null && lastActIdx >= 0 && avg[lastActIdx] == null) avg[lastActIdx] = actual[lastActIdx];
    return {
      labels,
      series: [
        { name: pick(zh, "Actual", "实际"), values: actualPadded, color: "var(--brand)" },
        { name: pick(zh, "Average", "平均"), values: avg, color: "var(--warn)" },
        { name: pick(zh, "High", "最高"), values: high, color: "var(--up)" },
        { name: pick(zh, "Low", "最低"), values: low, color: "var(--down)" },
      ] as Series[],
    };
  }, [fund, est, zh]);

  if (!est) {
    return (
      <div className="fin-sec">
        <AnalystEmpty fund={fund} zh={zh} />
      </div>
    );
  }

  return (
    <>
      {chart && (
        <div className="fin-sec">
          <LineSeries
            labels={chart.labels}
            series={chart.series}
            fmtY={(v) => fmtNum(v, { decimals: 2 })}
            dotted={[pick(zh, "Average", "平均")]}
            vw={640}
            vh={220}
            zh={zh}
          />
        </div>
      )}
      <div className="fin-fc-sec-head">
        <div className="fin-toggle">
          <button className={stmt === "income" ? "on" : ""} onClick={() => setStmt("income")}>{pick(zh, "Income statement", "利润表")}</button>
          <button className={stmt === "balance" ? "on" : ""} onClick={() => setStmt("balance")}>{pick(zh, "Balance sheet", "资产负债表")}</button>
          <button className={stmt === "cashflow" ? "on" : ""} onClick={() => setStmt("cashflow")}>{pick(zh, "Cash flow", "现金流量表")}</button>
        </div>
      </div>
      <MiniTable
        periods={built.periods}
        rows={built.rows}
        fmt={(v) => fmtNum(v)}
        pageSize={8}
        zh={zh}
        cornerLabel={pick(zh, `Currency: ${ccy}`, `货币：${ccy}`)}
      />
    </>
  );
}

/**
 * buildActualsTable — the estimates table: an expandable EPS group
 * (Actual/Average/High/Low/# estimates) plus collapsed statement line-item rows.
 * Estimate detail only exists for EPS + revenue (the only estimate series); other
 * rows show actuals and `—` for the ` E` columns.
 */
function buildActualsTable(fund: Fund | null, est: Fund["estimates"], stmt: "income" | "balance" | "cashflow") {
  const fyEarn = fund?.earnings?.fy ?? [];
  const actualLabels = fyEarn.map((r) => r.period);
  const estPeriods = est?.eps_fy.periods ?? [];
  const periods: string[] = [...actualLabels];
  estPeriods.forEach((p) => {
    if (!periods.includes(p)) periods.push(p + " E");
  });

  const alignEst = (series: { periods: string[]; avg: (number | null)[]; high: (number | null)[]; low: (number | null)[]; n: (number | null)[] } | undefined, key: "avg" | "high" | "low" | "n") => {
    const out = new Array(periods.length).fill(null) as (number | null)[];
    if (!series) return out;
    series.periods.forEach((p, i) => {
      const li = periods.indexOf(p + " E") >= 0 ? periods.indexOf(p + " E") : periods.indexOf(p);
      if (li >= 0) out[li] = (series[key] as (number | null)[])[i] ?? null;
    });
    return out;
  };

  const actualEps = new Array(periods.length).fill(null) as (number | null)[];
  fyEarn.forEach((r, i) => (actualEps[i] = r.eps_a ?? null));

  const rows: MiniRow[] = [];

  // Expandable EPS group.
  rows.push({
    label: pick(false, "Earnings per share", "每股收益"),
    values: actualEps,
    bold: true,
    fmt: (v) => fmtNum(v, { decimals: 2 }),
    children: [
      { label: "Actual", values: actualEps, depth: 1, fmt: (v) => fmtNum(v, { decimals: 2 }) },
      { label: "Average", values: alignEst(est?.eps_fy, "avg"), depth: 1, fmt: (v) => fmtNum(v, { decimals: 2 }) },
      { label: "High", values: alignEst(est?.eps_fy, "high"), depth: 1, fmt: (v) => fmtNum(v, { decimals: 2 }) },
      { label: "Low", values: alignEst(est?.eps_fy, "low"), depth: 1, fmt: (v) => fmtNum(v, { decimals: 2 }) },
      { label: "# estimates", values: alignEst(est?.eps_fy, "n"), depth: 1, fmt: (v) => fmtNum(v, { decimals: 0 }) },
    ],
  });

  // Statement line items (actuals only; ` E` columns show —).
  const ann = fund?.statements?.annual;
  const alignActual = (series: (number | null)[] | undefined) => {
    const out = new Array(periods.length).fill(null) as (number | null)[];
    if (!series || !ann) return out;
    ann.periods.forEach((p, i) => {
      const li = periods.indexOf(p);
      if (li >= 0) out[li] = series[i] ?? null;
    });
    return out;
  };

  const lineItems: [string, (number | null)[] | undefined][] =
    stmt === "income"
      ? [
          ["Total revenue", ann?.income.revenue],
          ["Cost of goods sold", ann?.income.cogs],
          ["Gross profit", ann?.income.gross_profit],
          ["Operating income", ann?.income.op_income],
          ["Pretax income", ann?.income.pretax_income],
          ["EBITDA", ann?.income.ebitda],
          ["Net income", ann?.income.net_income],
        ]
      : stmt === "balance"
        ? [
            ["Total assets", ann?.balance.assets],
            ["Total liabilities", ann?.balance.liabilities],
            ["Total equity", ann?.balance.equity],
            ["Total debt", ann?.balance.debt],
            ["Cash & equivalents", ann?.balance.cash],
            ["Net debt", ann?.balance.net_debt],
          ]
        : [
            ["Operating cash flow", ann?.cashflow.cfo],
            ["Investing cash flow", ann?.cashflow.cfi],
            ["Financing cash flow", ann?.cashflow.cff],
            ["Capital expenditure", ann?.cashflow.capex],
            ["Free cash flow", ann?.cashflow.fcf],
          ];

  for (const [name, series] of lineItems) {
    rows.push({ label: name, values: alignActual(series) });
  }

  return { periods, rows };
}

/* ─────────────────────────────────────────────────────────────────────────
 * shared footer
 * ───────────────────────────────────────────────────────────────────────── */

export function Disclaimer({ zh }: { zh: boolean }) {
  return (
    <div className="fin-sec fin-disclaimer">
      <div className="fin-sec-h">{pick(zh, "Disclaimer", "免责声明")}</div>
      <p>
        {pick(
          zh,
          "This is not investment advice and doesn't take into account your personal circumstances. It isn't a recommendation to buy, sell, or hold any asset. Always do your own research.",
          "本内容不构成投资建议，也未考虑您的个人情况。它不是对任何资产的买入、卖出或持有的推荐。请始终自行研究。",
        )}
      </p>
    </div>
  );
}
