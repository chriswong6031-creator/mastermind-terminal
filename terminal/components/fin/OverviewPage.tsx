"use client";
/**
 * OverviewPage — the TradingView "Financials · Overview" tab (BUILD-SPEC §3.4
 * FE2a, spec/overview-page.md). Sections top→bottom:
 *   Key facts · About (Show more) · Ownership donut + Capital structure ·
 *   Valuation (P/S line, A/Q) · Growth & Profitability (Performance combo +
 *   Revenue→profit waterfall, A/Q) · Revenue breakdown (2 donuts, R6 empty) ·
 *   Estimates (Revenue + Earnings dot charts) · Dividends strip · Financial
 *   health (Debt bars + Position bars).
 *
 * Major section headers carry a `›` that jumps to a sibling financials tab via
 * onNavigate(page). Everything is null-guarded — a section renders `—` / a
 * `.fin-empty` instead of crashing when its slice of `fund` is absent.
 */
import { useState } from "react";
import { useLang } from "../../lib/i18n";
import { pick, fmtNum, fmtPct, fmtDate, currencySymbol } from "../../lib/finFormat";
import type { Fund, StatementPeriodSet } from "../../lib/fund";
import type { FinPage } from "./MegaPane";
import {
  Donut,
  CapitalStructure,
  LineSeries,
  ComboChart,
  Waterfall,
  Dumbbell,
  Bars,
  type Series,
  type DonutSlice,
  type WaterfallStep,
  type DumbbellPoint,
} from "./FinCharts";

export interface OverviewPageProps {
  sym: string;
  fund: Fund | null;
  name?: string | null;
  onNavigate: (page: FinPage) => void;
}

type AQ = "annual" | "quarterly";

/* section header with optional `›` jump to a sibling tab */
function SecH({
  title,
  cap,
  page,
  onNavigate,
}: {
  title: string;
  cap?: string;
  page?: FinPage;
  onNavigate?: (p: FinPage) => void;
}) {
  const clickable = !!page && !!onNavigate;
  return (
    <>
      <div
        className={"fin-sec-h" + (clickable ? " link" : "")}
        onClick={clickable ? () => onNavigate!(page!) : undefined}
        role={clickable ? "button" : undefined}
        tabIndex={clickable ? 0 : undefined}
      >
        <span>{title}</span>
        {clickable && <span className="chev">›</span>}
      </div>
      {cap && <div className="fin-sec-cap">{cap}</div>}
    </>
  );
}

export default function OverviewPage({ sym, fund, name, onNavigate }: OverviewPageProps) {
  const { lang } = useLang();
  const zh = lang === "zh";
  const [showMore, setShowMore] = useState(false);
  const [valAQ, setValAQ] = useState<AQ>("annual");
  const [perfAQ, setPerfAQ] = useState<AQ>("annual");
  const [wfAQ, setWfAQ] = useState<AQ>("annual");
  const [healthAQ, setHealthAQ] = useState<AQ>("annual");

  const cur = fund?.quote_currency || "USD";
  const curSuffix = ` ${cur}`;
  const fmtV = (v: number) => fmtNum(v) + curSuffix;

  if (!fund) {
    return (
      <div className="fin-empty fin-empty-lg" role="status">
        <div className="fin-empty-title">{pick(zh, "No fundamentals yet", "暂无基本面数据")}</div>
        <div>
          {pick(
            zh,
            `Fundamental data for ${sym} hasn't been collected yet.`,
            `${sym} 的基本面数据尚未采集。`,
          )}
        </div>
      </div>
    );
  }

  const p = fund.profile;
  const s = fund.stats;
  const r = fund.ratios;
  const ann = fund.statements?.annual;
  const qtr = fund.statements?.quarterly;

  // ── Key facts ──
  const facts: { k: string; v: string; ext?: string }[] = [
    { k: pick(zh, "Market capitalization", "市值"), v: fmtNum(s?.mktcap) },
    {
      k: pick(zh, "Dividend yield (indicated)", "股息率（指示）"),
      v: fund.dividends?.yield_ttm != null ? fmtPct(fund.dividends.yield_ttm) : "—",
    },
    {
      k: pick(zh, "Price to earnings ratio (TTM)", "市盈率（TTM）"),
      v: r?.current?.pe_ttm != null ? fmtNum(r.current.pe_ttm) : "—",
    },
    {
      k: pick(zh, "Basic EPS (TTM)", "基本每股收益（TTM）"),
      v: latestEps(ann) != null ? fmtNum(latestEps(ann)!) : "—",
    },
    { k: pick(zh, "Founded", "成立"), v: p?.founded || "—" },
    {
      k: pick(zh, "Employees", "员工人数"),
      v: s == null || p?.employees == null ? "—" : Math.round(p.employees).toLocaleString("en-US"),
    },
    { k: pick(zh, "Sector", "板块"), v: p?.sector || "—" },
    {
      k: pick(zh, "Website", "网站"),
      v: p?.website ? domainOf(p.website) : "—",
      ext: p?.website || undefined,
    },
  ];

  // ── About ──
  const desc = p?.description || "";
  const CLAMP = 320;
  const clamped = desc.length > CLAMP && !showMore ? desc.slice(0, CLAMP).replace(/\s+\S*$/, "") + "…" : desc;

  // ── Ownership ──
  const totalShares = s?.shares_out ?? null;
  const freePct = fund.ownership?.free_float_pct ?? null;
  const heldPct = fund.ownership?.closely_held_pct ?? null;
  const ownSlices: DonutSlice[] =
    totalShares != null && (freePct != null || heldPct != null)
      ? [
          {
            label: pick(zh, "Free float shares", "自由流通股"),
            value: freePct != null ? totalShares * freePct : 0,
            color: "var(--warn)",
          },
          {
            label: pick(zh, "Closely held shares", "内部持股"),
            value: heldPct != null ? totalShares * heldPct : Math.max(0, totalShares - (freePct ?? 0) * totalShares),
            color: "var(--muted)",
          },
        ].filter((x) => x.value > 0)
      : [];

  // ── Valuation: P/S per period ──
  const valSet = valAQ === "annual" ? ann : qtr;
  const psLabels = valSet?.periods ?? [];
  const psSeries: Series[] = [
    { name: "P/S", values: computePS(valSet, s?.mktcap ?? null), color: "var(--brand)" },
  ];

  // ── Performance combo (revenue bars + net income bars + net margin line) ──
  const perfSet = perfAQ === "annual" ? ann : qtr;
  const perfLabels = perfSet?.periods ?? [];
  const perfBars: Series[] = [
    { name: pick(zh, "Revenue", "营收"), values: perfSet?.income?.revenue ?? [], color: "var(--brand)" },
    { name: pick(zh, "Net income", "净利润"), values: perfSet?.income?.net_income ?? [], color: "var(--up)" },
  ];
  const perfLine: Series = {
    name: pick(zh, "Net margin %", "净利率 %"),
    values: (perfSet?.income?.revenue ?? []).map((rev, i) => {
      const ni = perfSet?.income?.net_income?.[i];
      return rev && ni != null ? (ni / rev) * 100 : null;
    }),
    color: "var(--warn)",
  };

  // ── Revenue → profit conversion waterfall (latest period) ──
  const wfSet = wfAQ === "annual" ? ann : qtr;
  const wfIdx = lastFiniteIdx(wfSet?.income?.revenue);
  const wfSteps: WaterfallStep[] = wfIdx == null ? [] : buildWaterfall(wfSet!, wfIdx, zh);

  // ── Revenue breakdown (R6: empty unless fund.segments present) ──
  const seg = fund.segments;

  // ── Estimates: revenue + earnings actual-vs-estimate ──
  const revDots: DumbbellPoint[] = (fund.earnings?.fy ?? []).map((f) => ({
    label: f.period,
    actual: f.rev_a,
    estimate: f.rev_e,
  }));
  const epsDots: DumbbellPoint[] = (fund.earnings?.fy ?? []).map((f) => ({
    label: f.period,
    actual: f.eps_a,
    estimate: f.eps_e,
  }));

  // ── Financial health: debt/fcf/cash bars + position bars ──
  const hSet = healthAQ === "annual" ? ann : qtr;
  const hLabels = hSet?.periods ?? [];
  const debtBars: Series[] = [
    { name: pick(zh, "Debt", "债务"), values: hSet?.balance?.debt ?? [], color: "var(--down)" },
    { name: pick(zh, "Free cash flow", "自由现金流"), values: hSet?.cashflow?.fcf ?? [], color: "var(--up)" },
    { name: pick(zh, "Cash & equivalents", "现金及等价物"), values: hSet?.balance?.cash ?? [], color: "var(--brand)" },
  ];
  const posIdx = lastFiniteIdx(hSet?.balance?.assets_st);
  const posBars: Series[] =
    posIdx == null
      ? []
      : [
          {
            name: pick(zh, "Assets", "资产"),
            values: [hSet!.balance.assets_st[posIdx], hSet!.balance.assets_lt[posIdx]],
            color: "var(--brand)",
          },
          {
            name: pick(zh, "Liabilities", "负债"),
            values: [hSet!.balance.liab_st[posIdx], hSet!.balance.liab_lt[posIdx]],
            color: "var(--up)",
          },
        ];
  const posLabels = [pick(zh, "Short term", "短期"), pick(zh, "Long term", "长期")];

  return (
    <div className="fin-ov">
      {/* ── KEY FACTS ── */}
      <section className="fin-sec">
        <SecH title={pick(zh, "Key facts", "关键数据")} />
        <div className="fin-grid4">
          {facts.map((f, i) => (
            <div className="fin-fact" key={i}>
              <span className="k">{f.k}</span>
              {f.ext ? (
                <a className="v fin-fact-link" href={f.ext} target="_blank" rel="noopener noreferrer">
                  {f.v} ↗
                </a>
              ) : (
                <span className="v">{f.v}</span>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── ABOUT ── */}
      {desc && (
        <section className="fin-sec">
          <SecH title={pick(zh, "About", "公司简介")} />
          <p className="fin-about">
            {clamped}
            {desc.length > CLAMP && (
              <button className="fin-showmore" onClick={() => setShowMore((v) => !v)}>
                {showMore ? pick(zh, "Show less", "收起") : pick(zh, "Show more", "展开")}
              </button>
            )}
          </p>
        </section>
      )}

      {/* ── OWNERSHIP + CAPITAL STRUCTURE ── */}
      <section className="fin-sec">
        <div className="fin-grid2">
          <div className="fin-card">
            <div className="fin-card-h">{pick(zh, "Ownership", "股权结构")}</div>
            {ownSlices.length > 0 ? (
              <Donut
                slices={ownSlices}
                centerValue={fmtNum(totalShares)}
                centerLabel={pick(zh, "Shares out", "总股本")}
                fmtV={fmtNum}
                zh={zh}
              />
            ) : (
              <div className="fin-empty">{pick(zh, "No ownership data", "暂无股权数据")}</div>
            )}
          </div>
          <div className="fin-card">
            <div className="fin-card-h">{pick(zh, "Capital structure", "资本结构")}</div>
            <CapitalStructure
              marketCap={s?.mktcap ?? null}
              debt={latestFinite(ann?.balance?.debt) ?? latestFinite(qtr?.balance?.debt)}
              cash={latestFinite(ann?.balance?.cash) ?? latestFinite(qtr?.balance?.cash)}
              fmtV={fmtV}
              zh={zh}
            />
          </div>
        </div>
      </section>

      {/* ── VALUATION ── */}
      <section className="fin-sec">
        <SecH
          title={pick(zh, "Valuation", "估值")}
          cap={pick(zh, "Fundamental metrics to determine fair value of the stock", "用于判断股票公允价值的基本面指标")}
          page="statistics"
          onNavigate={onNavigate}
        />
        <div className="fin-card">
          <div className="fin-card-h">
            {pick(zh, "Valuation ratios", "估值比率")} <AQToggle v={valAQ} onChange={setValAQ} zh={zh} />
          </div>
          <LineSeries labels={psLabels} series={psSeries} fmtY={(v) => fmtNum(v)} markers zh={zh} height={190} />
        </div>
      </section>

      {/* ── GROWTH & PROFITABILITY ── */}
      <section className="fin-sec">
        <SecH
          title={pick(zh, "Growth and Profitability", "增长与盈利能力")}
          cap={pick(zh, "Company's recent performance and margins", "公司近期业绩与利润率")}
          page="statements"
          onNavigate={onNavigate}
        />
        <div className="fin-grid2">
          <div className="fin-card">
            <div className="fin-card-h">
              {pick(zh, "Performance", "业绩表现")} <AQToggle v={perfAQ} onChange={setPerfAQ} zh={zh} />
            </div>
            <ComboChart
              labels={perfLabels}
              bars={perfBars}
              line={perfLine}
              fmtBar={fmtNum}
              fmtLine={(v) => fmtPct(v, { alreadyPct: true })}
              zh={zh}
              height={200}
            />
          </div>
          <div className="fin-card">
            <div className="fin-card-h">
              {pick(zh, "Revenue to profit conversion", "营收到利润转换")}{" "}
              <AQToggle v={wfAQ} onChange={setWfAQ} zh={zh} />
            </div>
            {wfSteps.length > 0 ? (
              <Waterfall steps={wfSteps} fmtY={fmtNum} zh={zh} height={210} />
            ) : (
              <div className="fin-empty">{pick(zh, "No income statement", "暂无利润表")}</div>
            )}
          </div>
        </div>
      </section>

      {/* ── REVENUE BREAKDOWN (R6 empty state) ── */}
      <section className="fin-sec">
        <SecH
          title={pick(zh, "Revenue breakdown", "收入构成")}
          cap={pick(zh, "Revenue streams and regions a business earns money from", "企业收入来源与地区分布")}
          page="revenue"
          onNavigate={onNavigate}
        />
        {seg && (seg.by_source || seg.by_country) ? (
          <div className="fin-grid2">
            {seg.by_source && (
              <div className="fin-card">
                <div className="fin-card-h">{pick(zh, "By source/business", "按业务")}</div>
                <Donut slices={segToSlices(seg.by_source)} fmtV={fmtV} zh={zh} />
              </div>
            )}
            {seg.by_country && (
              <div className="fin-card">
                <div className="fin-card-h">{pick(zh, "By country", "按地区")}</div>
                <Donut slices={segToSlices(seg.by_country)} fmtV={fmtV} zh={zh} />
              </div>
            )}
          </div>
        ) : (
          <div className="fin-empty">
            {pick(
              zh,
              "Segment breakdown is not available for this company.",
              "该公司暂无分部收入构成数据。",
            )}
          </div>
        )}
      </section>

      {/* ── ESTIMATES ── */}
      <section className="fin-sec">
        <SecH
          title={pick(zh, "Estimates", "预测")}
          cap={pick(zh, "Revenue and Earnings forecasts and estimates accuracy", "营收与盈利预测及预测准确度")}
          page="earnings"
          onNavigate={onNavigate}
        />
        <div className="fin-grid2">
          <div className="fin-card">
            <div className="fin-card-h">{pick(zh, "Revenue", "营收")}</div>
            {revDots.some((d) => d.actual != null || d.estimate != null) ? (
              <Dumbbell points={revDots} fmtY={fmtNum} zh={zh} height={200} />
            ) : (
              <div className="fin-empty">{pick(zh, "No revenue estimates", "暂无营收预测")}</div>
            )}
          </div>
          <div className="fin-card">
            <div className="fin-card-h">
              {pick(zh, "Earnings", "盈利")}
              {fund.earnings?.next_date && (
                <span className="fin-next-lbl">
                  {pick(zh, "Next:", "下次:")} {fmtDate(fund.earnings.next_date)}
                </span>
              )}
            </div>
            {epsDots.some((d) => d.actual != null || d.estimate != null) ? (
              <Dumbbell points={epsDots} fmtY={(v) => fmtNum(v, { decimals: 2 })} zh={zh} height={200} />
            ) : (
              <div className="fin-empty">{pick(zh, "No earnings estimates", "暂无盈利预测")}</div>
            )}
          </div>
        </div>
      </section>

      {/* ── DIVIDENDS ── */}
      <section className="fin-sec">
        <SecH
          title={pick(zh, "Dividends", "股息")}
          cap={pick(zh, "Dividend yield, history and sustainability", "股息率、历史及可持续性")}
          page="dividends"
          onNavigate={onNavigate}
        />
        {fund.dividends?.never_paid || (fund.dividends?.events ?? []).length === 0 ? (
          <div className="fin-card fin-div-empty">
            <svg className="fin-div-glyph" viewBox="0 0 24 24" aria-hidden>
              <circle cx="12" cy="12" r="9" />
              <path d="M5 5l14 14" />
            </svg>
            <div>
              <div className="fin-div-empty-t">{pick(zh, "No dividends", "无股息")}</div>
              <div className="fin-div-empty-s">
                {pick(
                  zh,
                  `${sym} has never paid dividends and has no current plans to do so.`,
                  `${sym} 从未派发股息，目前也无相关计划。`,
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="fin-grid3">
            <div className="fin-fact">
              <span className="k">{pick(zh, "Yield (TTM)", "股息率（TTM）")}</span>
              <span className="v">{fund.dividends.yield_ttm != null ? fmtPct(fund.dividends.yield_ttm) : "—"}</span>
            </div>
            <div className="fin-fact">
              <span className="k">{pick(zh, "Payout ratio", "派息率")}</span>
              <span className="v">
                {fund.dividends.payout_ratio != null ? fmtPct(fund.dividends.payout_ratio) : "—"}
              </span>
            </div>
            <div className="fin-fact">
              <span className="k">{pick(zh, "Last ex-date", "最近除息日")}</span>
              <span className="v">{fmtDate(fund.dividends.events[fund.dividends.events.length - 1]?.ex)}</span>
            </div>
          </div>
        )}
      </section>

      {/* ── FINANCIAL HEALTH ── */}
      <section className="fin-sec">
        <SecH
          title={pick(zh, "Financial health", "财务健康")}
          cap={pick(zh, "Financial position and solvency of the company", "公司财务状况与偿债能力")}
          page="statistics"
          onNavigate={onNavigate}
        />
        <div className="fin-grid2">
          <div className="fin-card">
            <div className="fin-card-h">
              {pick(zh, "Debt level and coverage", "债务水平与覆盖")}{" "}
              <AQToggle v={healthAQ} onChange={setHealthAQ} zh={zh} />
            </div>
            <Bars labels={hLabels} series={debtBars} fmtY={fmtNum} zh={zh} height={200} />
          </div>
          <div className="fin-card">
            <div className="fin-card-h">{pick(zh, "Financial position analysis", "财务状况分析")}</div>
            {posBars.length > 0 ? (
              <Bars labels={posLabels} series={posBars} fmtY={fmtNum} zh={zh} height={200} />
            ) : (
              <div className="fin-empty">{pick(zh, "No balance sheet", "暂无资产负债表")}</div>
            )}
          </div>
        </div>
      </section>

      <div className="fin-ov-cur">
        {pick(zh, "Values in", "计价货币")} {currencySymbol(cur) || cur} · {cur}
      </div>
    </div>
  );
}

/* ── A/Q toggle ── */
function AQToggle({ v, onChange, zh }: { v: AQ; onChange: (a: AQ) => void; zh: boolean }) {
  return (
    <span className="fin-toggle fin-aq">
      <button className={v === "annual" ? "on" : ""} onClick={() => onChange("annual")}>
        {pick(zh, "Annual", "年度")}
      </button>
      <button className={v === "quarterly" ? "on" : ""} onClick={() => onChange("quarterly")}>
        {pick(zh, "Quarterly", "季度")}
      </button>
    </span>
  );
}

/* ── helpers ── */
function domainOf(url: string): string {
  try {
    return new URL(url.startsWith("http") ? url : "https://" + url).hostname.replace(/^www\./, "");
  } catch {
    return url.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  }
}

function latestFinite(arr?: (number | null)[]): number | null {
  if (!arr) return null;
  for (let i = arr.length - 1; i >= 0; i--) if (arr[i] != null && isFinite(arr[i] as number)) return arr[i];
  return null;
}

function lastFiniteIdx(arr?: (number | null)[]): number | null {
  if (!arr) return null;
  for (let i = arr.length - 1; i >= 0; i--) if (arr[i] != null && isFinite(arr[i] as number)) return i;
  return null;
}

function latestEps(set?: StatementPeriodSet): number | null {
  return latestFinite(set?.income?.eps_basic);
}

/** P/S per period: mktcap held constant (only current mktcap known) / revenue[i]. */
function computePS(set: StatementPeriodSet | undefined, mktcap: number | null): (number | null)[] {
  if (!set || mktcap == null) return set?.periods.map(() => null) ?? [];
  return set.income.revenue.map((rev) => (rev && rev > 0 ? mktcap / rev : null));
}

function buildWaterfall(set: StatementPeriodSet, i: number, zh: boolean): WaterfallStep[] {
  const inc = set.income;
  const g = (a: (number | null)[]) => (a?.[i] != null && isFinite(a[i] as number) ? (a[i] as number) : null);
  const rev = g(inc.revenue);
  if (rev == null) return [];
  const cogs = g(inc.cogs);
  const gp = g(inc.gross_profit);
  const opex = g(inc.opex);
  const opInc = g(inc.op_income);
  const nonop = g(inc.nonop_income);
  const taxes = g(inc.taxes);
  const ni = g(inc.net_income);
  const steps: WaterfallStep[] = [{ label: pick(zh, "Revenue", "营收"), value: rev, total: true }];
  if (cogs != null) steps.push({ label: pick(zh, "COGS", "成本"), value: -Math.abs(cogs) });
  if (gp != null) steps.push({ label: pick(zh, "Gross profit", "毛利"), value: gp, total: true });
  if (opex != null && cogs != null) steps.push({ label: pick(zh, "Op expenses", "营业费用"), value: -Math.abs(opex - cogs) });
  else if (opex != null) steps.push({ label: pick(zh, "Op expenses", "营业费用"), value: -Math.abs(opex) });
  if (opInc != null) steps.push({ label: pick(zh, "Op income", "营业利润"), value: opInc, total: true });
  if (nonop != null) steps.push({ label: pick(zh, "Non-op & other", "营业外及其他"), value: nonop });
  if (taxes != null) steps.push({ label: pick(zh, "Taxes & other", "税项及其他"), value: -Math.abs(taxes) });
  if (ni != null) steps.push({ label: pick(zh, "Net income", "净利润"), value: ni, total: true });
  return steps;
}

function segToSlices(seg: { periods: string[]; series: { name: string; values: (number | null)[] }[] }): DonutSlice[] {
  const last = seg.periods.length - 1;
  return seg.series
    .map((s) => ({ label: s.name, value: (s.values?.[last] ?? 0) as number }))
    .filter((s) => s.value != null && isFinite(s.value) && s.value > 0);
}
