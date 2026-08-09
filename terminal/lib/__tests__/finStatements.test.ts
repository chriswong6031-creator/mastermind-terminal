import { describe, it, expect } from "vitest";
import {
  historySpan,
  revenueCoverage,
  revenueHistory,
  vendorGapNotice,
} from "../finStatements";
import type { Fund, StatementPeriodSet } from "../fund";

/** Minimal period set; only the fields the helpers read need to be real. */
function mkSet(over: Partial<StatementPeriodSet> = {}): StatementPeriodSet {
  return {
    periods: ["2019", "2020", "2021", "2022"],
    period_end: ["2019-12-31", "2020-12-31", "2021-12-31", "2022-12-31"],
    income: { revenue: [100, 200, 250, 300] } as StatementPeriodSet["income"],
    balance: {} as StatementPeriodSet["balance"],
    cashflow: {} as StatementPeriodSet["cashflow"],
    ...over,
  };
}

function mkFund(annual: StatementPeriodSet, quarterly?: StatementPeriodSet): Fund {
  return {
    statements: { annual, quarterly: quarterly ?? mkSet() },
  } as unknown as Fund;
}

describe("vendorGapNotice", () => {
  const gaps = { income: ["ebitda"], balance: ["cash", "debt", "net_debt"], cashflow: ["capex", "fcf"] };

  it("names the gapped rows and the period the full row set resumes", () => {
    const set = mkSet({
      vendor_gaps: gaps,
      src_by_period: ["massive", "massive", "yfinance", "yfinance"],
    });
    const n = vendorGapNotice(set, "balance", false);
    expect(n).not.toBeNull();
    expect(n!.rows).toEqual(["Cash & equivalents", "Total debt", "Net debt"]);
    expect(n!.fullFrom).toBe("2021");
    expect(n!.vendorPeriods).toBe(2);
  });

  it("scopes the notice to the statement on screen", () => {
    const set = mkSet({ vendor_gaps: gaps, src_by_period: ["massive", "massive", "yfinance", "yfinance"] });
    expect(vendorGapNotice(set, "income", false)!.rows).toEqual(["EBITDA"]);
    expect(vendorGapNotice(set, "cashflow", false)!.rows).toEqual([
      "Capital expenditure",
      "Free cash flow",
    ]);
  });

  it("localises the row names", () => {
    const set = mkSet({ vendor_gaps: gaps, src_by_period: ["massive", "yfinance", "yfinance", "yfinance"] });
    expect(vendorGapNotice(set, "cashflow", true)!.rows).toEqual(["资本支出", "自由现金流"]);
  });

  it("stays silent when no period is vendor-only — nothing to disclose", () => {
    const set = mkSet({ vendor_gaps: gaps, src_by_period: ["yfinance", "yfinance", "yfinance", "yfinance"] });
    expect(vendorGapNotice(set, "balance", false)).toBeNull();
  });

  it("treats a merged period as fully covered, not as a gap", () => {
    // "yfinance+massive" means the vendor only filled holes in a row that still carries the
    // richer yfinance fields — disclosing a gap there would be wrong.
    const set = mkSet({ vendor_gaps: gaps, src_by_period: ["yfinance+massive", "yfinance", "yfinance", "yfinance"] });
    expect(vendorGapNotice(set, "balance", false)).toBeNull();
  });

  it("degrades on files that predate the backfill (optional fields absent)", () => {
    expect(vendorGapNotice(mkSet(), "income", false)).toBeNull();
    expect(vendorGapNotice(mkSet({ vendor_gaps: gaps }), "income", false)).toBeNull();
    expect(vendorGapNotice(undefined, "income", false)).toBeNull();
  });
});

describe("historySpan", () => {
  it("reports count and endpoints", () => {
    expect(historySpan(mkSet())).toEqual({ count: 4, first: "2019", last: "2022" });
  });

  it("is null on an empty or missing set", () => {
    expect(historySpan(mkSet({ periods: [] }))).toBeNull();
    expect(historySpan(undefined)).toBeNull();
  });
});

describe("revenueHistory", () => {
  it("returns the series oldest→newest with YoY from the prior year", () => {
    const pts = revenueHistory(mkFund(mkSet()), "annual");
    expect(pts.map((p) => p.period)).toEqual(["2019", "2020", "2021", "2022"]);
    expect(pts[0].yoy).toBeNull(); // no prior period
    expect(pts[1].yoy).toBeCloseTo(100, 6); // 100 → 200
    expect(pts[2].yoy).toBeCloseTo(25, 6); // 200 → 250
  });

  it("compares quarterly against the same quarter a year back, not the prior quarter", () => {
    // Rising every quarter but flat year-over-year: a lag-1 comparison would report growth.
    const q = mkSet({
      periods: ["Q1 '21", "Q2 '21", "Q3 '21", "Q4 '21", "Q1 '22"],
      period_end: ["2021-03-31", "2021-06-30", "2021-09-30", "2021-12-31", "2022-03-31"],
      income: { revenue: [10, 20, 30, 40, 10] } as StatementPeriodSet["income"],
    });
    const pts = revenueHistory(mkFund(mkSet(), q), "quarterly");
    expect(pts[4].yoy).toBeCloseTo(0, 6);
    expect(pts[3].yoy).toBeNull(); // fewer than 4 prior quarters
  });

  it("keeps null holes as slots and refuses a YoY across them", () => {
    const set = mkSet({ income: { revenue: [100, null, 250, 300] } as StatementPeriodSet["income"] });
    const pts = revenueHistory(mkFund(set), "annual");
    expect(pts).toHaveLength(4);
    expect(pts[1].value).toBeNull();
    expect(pts[1].yoy).toBeNull();
    expect(pts[2].yoy).toBeNull(); // prior period is a hole
    expect(pts[3].yoy).toBeCloseTo(20, 6);
  });

  it("refuses a YoY against a zero base rather than emitting Infinity", () => {
    const set = mkSet({ income: { revenue: [0, 50, 60, 70] } as StatementPeriodSet["income"] });
    expect(revenueHistory(mkFund(set), "annual")[1].yoy).toBeNull();
  });

  it("is empty for a symbol with no statements", () => {
    expect(revenueHistory(null, "annual")).toEqual([]);
    expect(revenueHistory({} as Fund, "annual")).toEqual([]);
  });
});

describe("revenueCoverage", () => {
  it("counts only periods carrying a real figure", () => {
    const set = mkSet({ income: { revenue: [100, null, 250, null] } as StatementPeriodSet["income"] });
    expect(revenueCoverage(revenueHistory(mkFund(set), "annual"))).toBe(2);
    expect(revenueCoverage([])).toBe(0);
  });
});
