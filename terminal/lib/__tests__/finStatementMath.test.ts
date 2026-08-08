import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import {
  CUMULATIVE_YTD_MARKETS,
  cumulativeQuarterNote,
  discreteQuarters,
  filesCumulativeQuarters,
  incomeChartValues,
  incomeView,
  isCumulativeShape,
  opexExclCogs,
  statementMarket,
} from "../finStatementMath";
import { revenueHistory } from "../finStatements";
import type { Fund, IncomeBlock, StatementPeriodSet } from "../fund";

/**
 * MSFT-shaped quarterly revenue: 12 quarters, STRICTLY RISING, as US issuers actually report
 * them (each column is the quarter, not the year so far). This is the exact shape that armed
 * the defect — with ≥8 periods on file the old value-pattern detector reads ordinary secular
 * growth as "cumulative year-to-date" and differences the whole income statement, printing the
 * as-reported 82.9B quarter as 1.6B. Integers so equality is exact, not float-adjacent.
 */
const MSFT_REVENUE: (number | null)[] = [
  52_700_000_000, 56_500_000_000, 62_000_000_000, 65_600_000_000,
  69_600_000_000, 70_100_000_000, 76_400_000_000, 81_300_000_000,
  82_900_000_000, 84_500_000_000, 86_200_000_000, 89_000_000_000,
];
const Q_LABELS = [
  "Q1 '23", "Q2 '23", "Q3 '23", "Q4 '23",
  "Q1 '24", "Q2 '24", "Q3 '24", "Q4 '24",
  "Q1 '25", "Q2 '25", "Q3 '25", "Q4 '25",
];
/** What differencing WOULD produce — the fabricated column, kept as the thing US must not show. */
const MSFT_IF_DIFFERENCED: (number | null)[] = [
  52_700_000_000, 3_800_000_000, 5_500_000_000, 3_600_000_000,
  69_600_000_000, 500_000_000, 6_300_000_000, 4_900_000_000,
  82_900_000_000, 1_600_000_000, 1_700_000_000, 2_800_000_000,
];

function mkIncome(over: Partial<IncomeBlock> = {}): IncomeBlock {
  return {
    revenue: [], cogs: [], gross_profit: [], opex: [], op_income: [], nonop_income: [],
    pretax_income: [], taxes: [], net_income: [], eps_basic: [], eps_diluted: [], ebitda: [],
    ...over,
  };
}

function mkQuarterSet(over: Partial<StatementPeriodSet> = {}): StatementPeriodSet {
  return {
    periods: Q_LABELS,
    period_end: Q_LABELS.map(() => "2025-12-31"),
    income: mkIncome({ revenue: MSFT_REVENUE }),
    balance: {} as StatementPeriodSet["balance"],
    cashflow: {} as StatementPeriodSet["cashflow"],
    ...over,
  };
}

// ── F1 · the market gate ─────────────────────────────────────────────────────────────────

describe("statementMarket", () => {
  it("routes a symbol the same way the rest of the app does", () => {
    expect(statementMarket("MSFT")).toBe("us");
    expect(statementMarket("600519.SS")).toBe("cn");
    expect(statementMarket("0700.HK")).toBe("hk");
    expect(statementMarket("SHOP.TO")).toBe("ca");
    expect(statementMarket("VOD.L")).toBe("intl");
  });

  it("falls back to a market that never differences when the symbol is unknown", () => {
    expect(statementMarket(undefined)).toBe("us");
    expect(statementMarket("")).toBe("us");
    expect(filesCumulativeQuarters(undefined)).toBe(false);
  });
});

describe("filesCumulativeQuarters", () => {
  it("is true only for the markets that file cumulative year-to-date interims", () => {
    expect(CUMULATIVE_YTD_MARKETS).toEqual(["cn", "hk"]);
    expect(filesCumulativeQuarters("600519.SS")).toBe(true);
    expect(filesCumulativeQuarters("0700.HK")).toBe(true);
    for (const sym of ["MSFT", "NVDA", "AAPL", "SHOP.TO", "VOD.L", "BTC-USD"]) {
      expect(filesCumulativeQuarters(sym)).toBe(false);
    }
  });
});

describe("incomeView · a US issuer is never differenced", () => {
  const set = mkQuarterSet();

  it("leaves 12 rising quarters exactly as reported", () => {
    const view = incomeView("MSFT", set, "quarterly");
    expect(view.market).toBe("us");
    expect(view.cumulative).toBe(false);
    // The as-reported figures, not the fabricated ones.
    expect(view.income.revenue).toEqual(MSFT_REVENUE);
    expect(view.income.revenue[8]).toBe(82_900_000_000);
    expect(view.income.revenue).not.toEqual(MSFT_IF_DIFFERENCED);
    // Reference-identical: nothing copied it, so nothing can have rewritten it.
    expect(view.income.revenue).toBe(set.income.revenue);
  });

  it("stays as-reported even though the VALUES do look cumulative", () => {
    // The shape check alone still says "cumulative" — this is the whole point: the market gate
    // runs FIRST, so no growth pattern can turn differencing on for a US filer.
    expect(isCumulativeShape(MSFT_REVENUE)).toBe(true);
    expect(incomeView("MSFT", set, "quarterly").cumulative).toBe(false);
  });

  it("differences the identical series for a mainland-China issuer", () => {
    const view = incomeView("600519.SS", set, "quarterly");
    expect(view.market).toBe("cn");
    expect(view.cumulative).toBe(true);
    expect(view.income.revenue).toEqual(MSFT_IF_DIFFERENCED);
  });

  it("never differences an annual set, whatever the market", () => {
    expect(incomeView("600519.SS", set, "annual").cumulative).toBe(false);
    expect(incomeView("600519.SS", set, "annual").income.revenue).toBe(set.income.revenue);
  });

  it("normalizes every income field, not just the one it detected on", () => {
    const set2 = mkQuarterSet({
      income: mkIncome({
        revenue: MSFT_REVENUE,
        net_income: MSFT_REVENUE,
        eps_basic: MSFT_REVENUE,
        cogs: MSFT_REVENUE,
      }),
    });
    const cn = incomeView("600519.SS", set2, "quarterly");
    for (const k of ["revenue", "net_income", "eps_basic", "cogs"] as const) {
      expect(cn.income[k]).toEqual(MSFT_IF_DIFFERENCED);
    }
    const us = incomeView("MSFT", set2, "quarterly");
    for (const k of ["revenue", "net_income", "eps_basic", "cogs"] as const) {
      expect(us.income[k]).toEqual(MSFT_REVENUE);
    }
  });

  it("tolerates a period set that predates a contract field", () => {
    const thin = mkQuarterSet({ income: { revenue: MSFT_REVENUE } as IncomeBlock });
    expect(incomeView("MSFT", thin, "quarterly").income.ebitda).toEqual([]);
    expect(incomeView("MSFT", undefined, "quarterly").income.revenue).toEqual([]);
  });
});

// ── F1(a) · one basis per row, never a raw cell inside a differenced one ──────────────────

describe("discreteQuarters", () => {
  const labels = ["Q1 '25", "Q2 '25", "Q3 '25", "Q4 '25"];

  it("takes Q1 as-is and differences the rest of the fiscal year", () => {
    expect(discreteQuarters([100, 250, 400, 600], labels)).toEqual([100, 150, 150, 200]);
  });

  it("emits a genuine loss quarter as the negative it is", () => {
    // Cumulative net income legitimately FALLS in a loss-making quarter. Substituting the raw
    // year-to-date figure (the old `d >= 0 ? d : cur`) both hid the loss and put a cumulative
    // total in a row of discrete quarters.
    const out = discreteQuarters([100, 250, 180, 300], labels);
    expect(out).toEqual([100, 150, -70, 120]);
    expect(out[2]).not.toBe(180); // the raw cumulative value must not appear
  });

  it("shows a dash rather than a total when the cumulative base is unknown", () => {
    // Series opens mid-year: nothing to difference the first column against.
    expect(discreteQuarters([300, 420], ["Q3 '25", "Q4 '25"])).toEqual([null, 120]);
    // Fiscal year changes with no Q1 column — the new year's base was never filed here.
    expect(discreteQuarters([300, 420, 90], ["Q3 '25", "Q4 '25", "Q2 '26"])).toEqual([
      null, 120, null,
    ]);
  });

  it("propagates a null hole instead of reaching past it", () => {
    expect(discreteQuarters([100, null, 400, 600], labels)).toEqual([100, null, null, 200]);
  });
});

// ── F1(b) · the chart and the table read the SAME arrays ─────────────────────────────────

describe("incomeChartValues", () => {
  it("hands the chart the exact arrays the table prints", () => {
    for (const sym of ["MSFT", "600519.SS"]) {
      const view = incomeView(sym, mkQuarterSet(), "quarterly");
      const chart = incomeChartValues(view);
      // Reference equality, not just value equality: a surface that re-derived its own series
      // (the defect — chart plotted 82.9B while the table printed 1.6B) fails here.
      expect(chart.revenue).toBe(view.income.revenue);
      expect(chart.gross_profit).toBe(view.income.gross_profit);
      expect(chart.op_income).toBe(view.income.op_income);
      expect(chart.pretax_income).toBe(view.income.pretax_income);
      expect(chart.net_income).toBe(view.income.net_income);
    }
  });

  it("plots the differenced series on a cumulative-YTD name, never the raw one", () => {
    const set = mkQuarterSet();
    const chart = incomeChartValues(incomeView("600519.SS", set, "quarterly"));
    expect(chart.revenue).toEqual(MSFT_IF_DIFFERENCED);
    expect(chart.revenue).not.toBe(set.income.revenue);
  });

  it("is the only way StatementsPage can reach an income series", () => {
    // The value tests above prove the LIB keeps one series. This pins the WIRING: vitest
    // collects lib/__tests__ only (vitest.config.ts), so a component that went back to
    // reading `set.income` for its chart would otherwise pass every test while printing one
    // number and plotting another. Same idiom as indicatorPaneSeries.test.ts.
    const src = readFileSync(
      path.resolve(__dirname, "..", "..", "components", "fin", "StatementsPage.tsx"),
      "utf8",
    );
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(code).not.toMatch(/\bset\??\.income\b/);
    expect(code).toContain("incomeChartValues(view)");
    expect(code).toContain("incomeView(sym, set, aq)");
  });
});

// ── F1(c) · the disclosure names the market it is describing ─────────────────────────────

describe("cumulativeQuarterNote", () => {
  const set = mkQuarterSet();

  it("says nothing on a US issuer, however deep the history", () => {
    expect(cumulativeQuarterNote(incomeView("MSFT", set, "quarterly"), false)).toBeNull();
    expect(cumulativeQuarterNote(incomeView("MSFT", set, "quarterly"), true)).toBeNull();
  });

  it("names mainland China for a mainland-China filer", () => {
    const view = incomeView("600519.SS", set, "quarterly");
    expect(cumulativeQuarterNote(view, false)).toContain("mainland-China");
    expect(cumulativeQuarterNote(view, true)).toContain("中国内地");
    expect(cumulativeQuarterNote(view, false)).not.toContain("Hong Kong");
  });

  it("names Hong Kong for a Hong Kong filer", () => {
    const view = incomeView("0700.HK", set, "quarterly");
    expect(cumulativeQuarterNote(view, false)).toContain("Hong Kong");
    expect(cumulativeQuarterNote(view, true)).toContain("香港");
    expect(cumulativeQuarterNote(view, false)).not.toContain("mainland-China");
  });

  it("discloses the dashes the normalization introduces, in both languages", () => {
    const view = incomeView("600519.SS", set, "quarterly");
    expect(cumulativeQuarterNote(view, false)).toContain("dash");
    expect(cumulativeQuarterNote(view, true)).toContain("短横线");
  });
});

// ── F2 · "Operating expenses (excl. COGS)" is never a COGS-inclusive number ───────────────

describe("opexExclCogs", () => {
  // AAPL FY2025, the row that shipped at −158.8B before it was derived.
  const AAPL = mkIncome({
    revenue: [416_100_000_000],
    cogs: [220_900_000_000],
    gross_profit: [195_200_000_000],
    opex: [62_100_000_000],
    op_income: [133_100_000_000],
  });

  it("derives the reported figure instead of subtracting COGS from it", () => {
    expect(opexExclCogs(AAPL)).toEqual([62_100_000_000]);
    // `opex − cogs`, the shape this row used to render:
    expect(opexExclCogs(AAPL)[0]).not.toBe(-158_800_000_000);
  });

  it("still derives correctly when the raw field is the COGS-INCLUSIVE total", () => {
    // gen_fund_us's SECONDARY yfinance label for `opex` is "Total Expenses" (COGS + opex).
    const inc = mkIncome({ ...AAPL, opex: [283_000_000_000] });
    expect(opexExclCogs(inc)).toEqual([62_100_000_000]);
  });

  it("recovers the figure from revenue − COGS when gross profit itself is null", () => {
    // 416.1B − 220.9B − 133.1B = 62.1B — the same answer as gross_profit − op_income.
    const inc = mkIncome({ ...AAPL, gross_profit: [null] });
    expect(opexExclCogs(inc)).toEqual([62_100_000_000]);
  });

  it("shows a dash rather than shipping the raw total under an 'excl. COGS' label", () => {
    // Only the ambiguous raw field is available. It may be "Operating Expense" (already
    // exclusive) or "Total Expenses" (COGS-inclusive) and nothing in the payload says which —
    // so the honest answer is that we do not know, not a number that might be either.
    const inc = mkIncome({
      revenue: [null], cogs: [null], gross_profit: [null],
      opex: [283_000_000_000], op_income: [133_100_000_000],
    });
    expect(opexExclCogs(inc)).toEqual([null]);
  });

  it("is null wherever operating income is missing", () => {
    const inc = mkIncome({ ...AAPL, op_income: [null] });
    expect(opexExclCogs(inc)).toEqual([null]);
  });

  it("reads the normalized block, so a differenced statement cannot mix bases", () => {
    const set = mkQuarterSet({
      income: mkIncome({
        revenue: MSFT_REVENUE,
        gross_profit: MSFT_REVENUE,
        op_income: MSFT_REVENUE.map((v) => (v as number) / 2),
      }),
    });
    const view = incomeView("600519.SS", set, "quarterly");
    // gross_profit and op_income are both differenced before the subtraction, so the row is
    // half of the DIFFERENCED gross profit — not half of a year-to-date total.
    expect(view.opexExclCogs).toEqual(MSFT_IF_DIFFERENCED.map((v) => (v as number) / 2));
  });
});

// ── F3 · the Revenue tab and the Statements tab agree ────────────────────────────────────

describe("revenueHistory shares the Statements tab's normalization", () => {
  function mkFund(ticker: string, quarterly: StatementPeriodSet): Fund {
    return {
      ticker,
      statements: { annual: quarterly, quarterly },
    } as unknown as Fund;
  }

  it("prints the same quarter as the Statements tab for a cumulative-YTD name", () => {
    const set = mkQuarterSet();
    const fund = mkFund("600519.SS", set);
    const stmtValues = incomeView("600519.SS", set, "quarterly").income.revenue;
    expect(revenueHistory(fund, "quarterly").map((p) => p.value)).toEqual(stmtValues);
    // The raw column is what the tab used to show while Statements showed the differenced one.
    expect(revenueHistory(fund, "quarterly")[9].value).toBe(1_600_000_000);
    expect(revenueHistory(fund, "quarterly")[9].value).not.toBe(84_500_000_000);
  });

  it("prints the as-reported quarter for a US name", () => {
    const set = mkQuarterSet();
    const fund = mkFund("MSFT", set);
    expect(revenueHistory(fund, "quarterly").map((p) => p.value)).toEqual(MSFT_REVENUE);
    expect(revenueHistory(fund, "quarterly")[9].value).toBe(84_500_000_000);
  });
});
