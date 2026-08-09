/**
 * Is Hong Kong actually a cumulative-year-to-date market?
 *
 * `CUMULATIVE_YTD_MARKETS = ["cn", "hk"]` turns income differencing ON for every HK name, and
 * it shipped on the strength of a prose claim rather than a measurement. The doubt was
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
 * The second suite pins the part that is NOT fine — see its own comment.
 */
import { describe, it, expect } from "vitest";
import {
  CUMULATIVE_YTD_MARKETS,
  discreteQuarters,
  filesCumulativeQuarters,
  incomeView,
  isCumulativeShape,
  statementMarket,
} from "../finStatementMath";
import type { IncomeBlock, StatementPeriodSet } from "../fund";

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

/**
 * KNOWN DEFECT, pinned deliberately so it cannot drift silently — NOT an endorsement.
 *
 * The measurement above also found the cadence: 92.0% of HK fiscal years carry only TWO rows
 * (interim + annual). HK issuers mostly file SEMI-ANNUALLY, which `gen_fund_hk.py` already
 * knows — its `build_earnings` docstring says so in as many words — but `_q_label` still labels
 * every row by the calendar month of its period end, so a semi-annual filer's two rows become
 * "Q2" and "Q4" and land in `statements.quarterly`.
 *
 * Run end-to-end through the real 0001.HK (CK Hutchison) payload, that produces:
 *   • every H1 column → a DASH, because its cumulative base sits in the prior fiscal year
 *     (6 of 12 columns blank), and
 *   • every "Q4" column → FY − H1, which is H2: a SIX-MONTH figure under a quarter label.
 *
 * The dashes are the house stance working as intended (no number we cannot stand behind). The
 * "Q4" label on a half-year figure is not — it is a real mislabeling of a published financial
 * figure, and it reaches ~92% of HK names. Fixing it means changing the period LABELS the
 * generator emits (and therefore every HK fund.json), which is a figures-affecting change that
 * belongs in its own reviewed PR, not smuggled into this one. Pinned here so the next person
 * finds it already measured.
 */
const CKH_PERIODS = [
  "Q2 2020", "Q4 2020", "Q2 2021", "Q4 2021", "Q2 2022", "Q4 2022",
  "Q2 2023", "Q4 2023", "Q2 2024", "Q4 2024", "Q2 2025", "Q4 2025",
];
/** As filed, HKD, verbatim from the payload: H1 then FY, six times over — no Q1 or Q3 exists. */
const CKH_AS_FILED: (number | null)[] = [
  113_861_209_440, 224_209_529_440, 112_743_511_680, 229_620_507_200,
  112_336_048_020, 234_480_695_190, 122_970_926_460, 249_731_576_500,
  124_536_098_680, 260_542_280_040, 126_879_603_500, 252_934_115_920,
];

describe("semi-annual HK filers — current behaviour, pinned as a known defect", () => {
  it("has no Q1 or Q3 rows at all, only the H1 and FY filings", () => {
    const quarters = new Set(CKH_PERIODS.map((p) => p.slice(0, 2)));
    expect([...quarters].sort()).toEqual(["Q2", "Q4"]);
  });

  it("blanks every H1 column and labels every H2 figure as Q4", () => {
    const out = discreteQuarters(CKH_AS_FILED, CKH_PERIODS);

    // H1 rows: no cumulative base inside their own fiscal year → dash. Correct, if unhelpful.
    CKH_PERIODS.forEach((label, i) => {
      if (label.startsWith("Q2")) expect(out[i]).toBeNull();
    });
    expect(out.filter((v) => v === null)).toHaveLength(6);

    // "Q4" rows: FY − H1 = H2. Arithmetically right, but that is half a year under a
    // quarter label — 2024 shows 136.01B for what the label calls a single quarter.
    expect(out[CKH_PERIODS.indexOf("Q4 2024")]).toBe(260_542_280_040 - 124_536_098_680);
    expect(out[CKH_PERIODS.indexOf("Q4 2024")]).toBe(136_006_181_360);
  });

  it("routes through incomeView the same way, so the defect is not a discreteQuarters artefact", () => {
    const view = incomeView("0001.HK", mkSet(CKH_PERIODS, CKH_AS_FILED), "quarterly");
    expect(view.cumulative).toBe(true);
    expect(view.income.revenue[CKH_PERIODS.indexOf("Q2 2025")]).toBeNull();
    expect(view.income.revenue[CKH_PERIODS.indexOf("Q4 2025")]).toBe(
      252_934_115_920 - 126_879_603_500,
    );
  });
});
