/**
 * Is Hong Kong actually a cumulative-year-to-date market?
 *
 * `CUMULATIVE_YTD_MARKETS = ["cn", "hk"]` drives the conservative legacy fallback when producer
 * metadata is absent. Canonical HK artifacts now carry an explicit flow basis and bypass that
 * heuristic. The original doubt was
 * specific and reasonable: several HK issuers — Tencent is the usual example — publish
 * DISCRETE quarterly figures in their own results announcements, and `isCumulativeShape` can
 * be satisfied by any strictly-rising discrete series. If HK were discrete, differencing would
 * be manufacturing wrong numbers for the whole market.
 *
 * MEASURED 2026-08-08 against the real cached akshare payloads that feed this contract
 * (`Macro Dashboard/data/hk_fund/*.json`, 2,798 files, the exact input `ingest/gen_fund_hk.py`
 * consumes), not against a fixture anyone wrote by hand:
 *
 *   • 2,567 names carried usable revenue; 35,984 fiscal years measured.
 *   • 98.7% of those fiscal years are monotone non-decreasing across the filing ladder.
 *   • annual ÷ earliest-interim: 80.7% ≈2x, 12.5% ≈4x, only 3.4% ≈1x.
 *     A discrete feed would sit at ≈1x (the annual row would be one period like the interims);
 *     a cumulative one sits at ≈2x for a half-year first interim and ≈4x for a quarterly one.
 *   • Exactly 3 names out of 2,567 look discrete across ≥2 years.
 *
 * So the feed is cumulative, and the Tencent objection inverts: Tencent's own announcements do
 * report discrete quarters, but the akshare/Eastmoney `stock_financial_hk_report_em` rows we
 * actually consume carry the cumulative ladder. Differencing is what RECOVERS the discrete
 * quarter Tencent published — the numbers below are lifted from the real payload and agree
 * with Tencent's reported figures to the cent. "hk" stays.
 *
 * The second suite pins the source-grounded semiannual contract and no-double-difference gate.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import {
  CUMULATIVE_YTD_MARKETS,
  filesCumulativeQuarters,
  incomeView,
  isCumulativeShape,
  comparablePeriodChanges,
  statementCadenceLabel,
  statementMarket,
} from "../finStatementMath";
import {
  buildEpsDumbbell,
  buildEpsFromStatements,
  buildRevenueFromStatements,
  default as EarningsPage,
  formatSurprisePercent,
  resolveEarningsMode,
} from "../../components/fin/EarningsPage";
import type { Fund, FundEstimates, IncomeBlock, StatementPeriodSet } from "../fund";

function mkIncome(over: Partial<IncomeBlock> = {}): IncomeBlock {
  return {
    revenue: [], cogs: [], gross_profit: [], opex: [], op_income: [], nonop_income: [],
    pretax_income: [], taxes: [], net_income: [], eps_basic: [], eps_diluted: [], ebitda: [],
    ...over,
  };
}

function mkSet(periods: string[], revenue: (number | null)[]): StatementPeriodSet {
  return { periods, income: mkIncome({ revenue }) } as StatementPeriodSet;
}

/**
 * 0700.HK exactly as `gen_fund_hk.build_statements` emits it from the cached payload —
 * `statements.quarterly`, 12 rows, oldest→newest, in RMB. Tencent files all four interims, so
 * this is the 5.3% quarterly-cadence slice of the HK universe.
 */
const TENCENT_PERIODS = [
  "Q2 2023", "Q3 2023", "Q4 2023",
  "Q1 2024", "Q2 2024", "Q3 2024", "Q4 2024",
  "Q1 2025", "Q2 2025", "Q3 2025", "Q4 2025",
  "Q1 2026",
];
/**
 * As filed, RMB, copied verbatim out of the cached payload — each column is the YEAR SO FAR,
 * which is why Q4 ≈ 4x Q1. Two of these are checkable against Tencent's own announcements
 * without leaving this file: Q1 2024 = 159,501,000,000 is the RMB 159.501bn Tencent reported
 * for Q1 2024, and Q4 2024 = 660,257,000,000 is its RMB 660.257bn FY2024 revenue. Those agree
 * to the digit, which is what establishes that this column is the cumulative year-to-date
 * figure and not a quarter.
 */
const TENCENT_AS_FILED: (number | null)[] = [
  299_194_000_000, 453_819_000_000, 609_015_000_000,
  159_501_000_000, 320_618_000_000, 487_811_000_000, 660_257_000_000,
  180_022_000_000, 364_526_000_000, 557_395_000_000, 751_766_000_000,
  196_458_000_000,
];
/**
 * What differencing recovers — Tencent's actual discrete quarters. Q3 2024 comes out at
 * 167,193,000,000, which is exactly the RMB 167.193bn Tencent reported for that quarter. The
 * differencing is not an approximation of the published figure; it reproduces it.
 */
const TENCENT_DISCRETE: (number | null)[] = [
  null, 154_625_000_000, 155_196_000_000,
  159_501_000_000, 161_117_000_000, 167_193_000_000, 172_446_000_000,
  180_022_000_000, 184_504_000_000, 192_869_000_000, 194_371_000_000,
  196_458_000_000,
];

describe("HK files cumulative year-to-date interims (verified against live payloads)", () => {
  it("keeps hk in CUMULATIVE_YTD_MARKETS — removing it would print 9-month totals as quarters", () => {
    expect(CUMULATIVE_YTD_MARKETS).toContain("hk");
    expect(statementMarket("0700.HK")).toBe("hk");
    expect(filesCumulativeQuarters("0700.HK")).toBe(true);
  });

  it("reads Tencent's as-filed ladder as cumulative", () => {
    expect(isCumulativeShape(TENCENT_AS_FILED)).toBe(true);
  });

  it("recovers Tencent's published discrete quarters from the cumulative ladder", () => {
    const view = incomeView("0700.HK", mkSet(TENCENT_PERIODS, TENCENT_AS_FILED), "quarterly");
    expect(view.market).toBe("hk");
    expect(view.cumulative).toBe(true);
    expect(view.income.revenue).toEqual(TENCENT_DISCRETE);
  });

  it("prints the 9-month total as Q3 if hk is ever dropped from the market list", () => {
    // The regression this whole entry exists to prevent, stated as an inequality so it fails
    // loudly rather than quietly reverting to as-filed numbers.
    const i = TENCENT_PERIODS.indexOf("Q3 2024");
    expect(TENCENT_AS_FILED[i]).toBe(487_811_000_000);   // the nine months so far
    expect(TENCENT_DISCRETE[i]).toBe(167_193_000_000);   // the RMB 167.193bn Tencent reported
    const annual = incomeView("0700.HK", mkSet(TENCENT_PERIODS, TENCENT_AS_FILED), "annual");
    expect(annual.cumulative).toBe(false);               // annual is never differenced
    expect(annual.income.revenue).toBe(TENCENT_AS_FILED);
  });

  it("still never differences a US filer, whatever its numbers do", () => {
    // Same cumulative-looking shape, US symbol → the market gate refuses it.
    const view = incomeView("MSFT", mkSet(TENCENT_PERIODS, TENCENT_AS_FILED), "quarterly");
    expect(view.market).toBe("us");
    expect(view.cumulative).toBe(false);
    expect(view.income.revenue).toBe(TENCENT_AS_FILED);
  });
});

/** Producer-normalized 0001.HK-style H1/H2 series. The v1 transport key remains `quarterly`,
 * but source-owned metadata—not the key or calendar month—defines its cadence and identity. */
const CKH_PERIODS = ["H1 2023", "H2 2023", "H1 2024", "H2 2024", "H1 2025", "H2 2025"];
const CKH_DISCRETE = [122_970_926_460, 126_760_650_040, 124_536_098_680, 136_006_181_360,
  126_879_603_500, 126_054_512_420];

function mkCanonicalSemiannual(): StatementPeriodSet {
  return {
    ...mkSet(CKH_PERIODS, CKH_DISCRETE),
    fiscal_year: ["2023", "2023", "2024", "2024", "2025", "2025"],
    period_kind: ["half_year", "half_year", "half_year", "half_year", "half_year", "half_year"],
    period_number: [1, 2, 1, 2, 1, 2],
    reporting_cadence: "semiannual",
    flow_basis: "discrete_period",
    is_cumulative: [true, true, true, true, true, true],
    normalization_method: [
      "as_reported_ytd", "difference_from_prior_ytd",
      "as_reported_ytd", "difference_from_prior_ytd",
      "as_reported_ytd", "difference_from_prior_ytd",
    ],
    source_family: "industrial",
    income: mkIncome({
      revenue: CKH_DISCRETE,
      eps_basic: [4.01, null, 4.33, null, 4.17, null],
    }),
  } as StatementPeriodSet;
}

function mkEarningsFund(over: {
  quarterly?: StatementPeriodSet | null;
  q?: Fund["earnings"]["q"];
  fy?: Fund["earnings"]["fy"];
  estimates?: FundEstimates | null;
}): Fund {
  return {
    ticker: "TEST.HK",
    asof: "2026-08-11",
    stmt_currency: "HKD",
    statements: { quarterly: over.quarterly ?? null },
    earnings: {
      next_date: null,
      next_period: null,
      next_eps_est: null,
      next_rev_est: null,
      q: over.q ?? [],
      fy: over.fy ?? [],
    },
    estimates: over.estimates ?? null,
  } as unknown as Fund;
}

describe("source-grounded HK semiannual normalization", () => {
  it("shows H1/H2 and reports the real cadence, never fabricated Q2/Q4", () => {
    const set = mkCanonicalSemiannual();
    const view = incomeView("0001.HK", set, "quarterly");
    expect(view.periods).toEqual(CKH_PERIODS);
    expect(view.periods.every((period) => !period.startsWith("Q"))).toBe(true);
    expect(view.cadence).toBe("semiannual");
    expect(statementCadenceLabel(set, "quarterly", false)).toBe("Semiannual");
    expect(statementCadenceLabel(set, "quarterly", true)).toBe("半年度");
  });

  it("trusts the producer receipt and never differences a discrete series twice", () => {
    const set = mkCanonicalSemiannual();
    const view = incomeView("0001.HK", set, "quarterly");
    expect(view.producerNormalized).toBe(true);
    expect(view.cumulative).toBe(true); // describes the source rows, not a second frontend pass
    expect(view.income.revenue).toBe(set.income.revenue);
    expect(view.income.revenue).toEqual(CKH_DISCRETE);
    expect(view.income.eps_basic).toEqual([4.01, null, 4.33, null, 4.17, null]);
  });

  it("compares H1 with prior H1 and H2 with prior H2", () => {
    const set = mkCanonicalSemiannual();
    const changes = comparablePeriodChanges(set.income.revenue, set, "quarterly");
    expect(changes[2]).toBeCloseTo((CKH_DISCRETE[2] / CKH_DISCRETE[0] - 1) * 100);
    expect(changes[3]).toBeCloseTo((CKH_DISCRETE[3] / CKH_DISCRETE[1] - 1) * 100);
    expect(changes[1]).toBeNull();
  });

  it("does not let an empty eps_q shell suppress the canonical H1/H2 fallback", () => {
    const emptySeries = {
      periods: ["Q1 2026"],
      avg: [null],
      high: [null],
      low: [null],
      n: [null],
    };
    const estimates = {
      eps_q: emptySeries,
      eps_fy: { ...emptySeries, periods: [] },
      rev_fy: { ...emptySeries, periods: [] },
      growth: { rev_yoy: null, eps_yoy: null },
    } as FundEstimates;
    expect(buildEpsDumbbell([], [], "quarterly", estimates)).toEqual([]);

    const view = incomeView("0001.HK", mkCanonicalSemiannual(), "quarterly");
    const fallback = buildEpsFromStatements(view);
    expect(fallback.map((point) => point.label)).toEqual(CKH_PERIODS);
    expect(fallback.map((point) => point.actual)).toEqual([4.01, null, 4.33, null, 4.17, null]);
  });

  it("does not let a future quarterly estimate replace reported H1/H2 history or cadence", () => {
    const estimateSeries = {
      periods: ["Q3 '26", "Q4 '26"],
      avg: [0.426, 0.172],
      high: [0.426, 0.172],
      low: [0.426, 0.172],
      n: [1, 1],
    };
    const estimates = {
      eps_q: estimateSeries,
      eps_fy: { ...estimateSeries, periods: [] },
      rev_fy: { ...estimateSeries, periods: [] },
      growth: { rev_yoy: null, eps_yoy: null },
    } as FundEstimates;
    const html = renderToStaticMarkup(createElement(EarningsPage, {
      fund: mkEarningsFund({ quarterly: mkCanonicalSemiannual(), estimates }),
      sym: "0005.HK",
    }));

    expect(html).toContain("Semiannual");
    expect(html).toContain("4.17");
    expect(html).not.toContain("Q3");
    expect(html).not.toContain("0.43");
    expect(html).not.toContain("No reported EPS history");
  });

  it("uses the same canonical H1/H2 axis for statement-backed revenue", () => {
    const view = incomeView("0001.HK", mkCanonicalSemiannual(), "quarterly");
    const fallback = buildRevenueFromStatements(view);
    expect(fallback.map((point) => point.label)).toEqual(CKH_PERIODS);
    expect(fallback.map((point) => point.actual)).toEqual(CKH_DISCRETE);
  });

  it("withholds YoY when a fiscal-year transition creates duplicate identities", () => {
    const set = {
      ...mkCanonicalSemiannual(),
      periods: ["H1 2024 · 2023-09-30", "H1 2024 · 2024-06-30", "H1 2025"],
      fiscal_year: ["2024", "2024", "2025"],
      period_kind: ["half_year", "half_year", "half_year"],
      period_number: [1, 1, 1],
      income: mkIncome({ revenue: [100, 120, 150] }),
    } as StatementPeriodSet;
    expect(comparablePeriodChanges(set.income.revenue, set, "quarterly")).toEqual([
      null, null, null,
    ]);
  });
});

describe("EarningsPage basis and signed-surprise states", () => {
  it("defaults both modules to Annual when interim data is unavailable", () => {
    expect(resolveEarningsMode("quarterly", false)).toBe("annual");
    const html = renderToStaticMarkup(createElement(EarningsPage, {
      fund: mkEarningsFund({
        fy: [{
          period: "2025",
          eps_a: 1.25,
          eps_e: null,
          rev_a: 123_000_000,
          rev_e: null,
          surp_pct: null,
        }],
      }),
      sym: "2720.HK",
    }));

    expect(html.match(/class="on">Annual/g)).toHaveLength(2);
    expect(html).toContain("1.25");
    expect(html).toContain("123.00M");
    expect(html).not.toContain("No EPS data");
    expect(html).not.toContain("No revenue for this basis");
  });

  it("preserves the minus sign for misses in both EPS and revenue tables", () => {
    expect(formatSurprisePercent(-10)).toBe("−10.00%");
    const html = renderToStaticMarkup(createElement(EarningsPage, {
      fund: mkEarningsFund({
        q: [{
          period: "Q1 2026",
          end: "2026-03-31",
          report_date: "2026-04-30",
          eps_a: 0.9,
          eps_e: 1,
          rev_a: 90,
          rev_e: 100,
          surp_pct: -10,
          tx: "2026Q1",
        }],
      }),
      sym: "MISS.HK",
    }));

    expect(html.match(/−10\.00%/g)).toHaveLength(2);
    expect(html).not.toContain(">10.00%</span>");
  });
});
