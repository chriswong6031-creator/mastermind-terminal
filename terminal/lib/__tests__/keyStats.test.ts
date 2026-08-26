import { afterEach, describe, expect, it, vi } from "vitest";
import type { Bar, Fund } from "@/lib/fund";
import { buildKeyStatRows } from "@/lib/keyStats";

const pick = (en?: string | null) => en || "";

function fundFixture(): Fund {
  return {
    quote_currency: "HKD",
    stats: {
      mktcap: 13_429_081_088,
      shares_out: 7_993_501_161,
      float_shares: 4_119_470_852,
      beta: 0.912,
    },
    ratios: {
      current: {
        pe_ttm: 76.3,
        div_yield: 0.0221,
      },
    },
    dividends: {
      yield_ttm: 0.0221,
    },
    earnings: {
      next_date: null,
    },
  } as Fund;
}

describe("HK-compatible Key Stats", () => {
  it("surfaces currency-aware fundamentals alongside trading activity", () => {
    const bars = [
      { v: 10_000_000 },
      { v: 0 },
      { v: 14_540_000 },
    ] as Bar[];
    const byId = Object.fromEntries(
      buildKeyStatRows(fundFixture(), bars, pick).map((row) => [row.id, row.value]),
    );

    expect(byId["market-cap"]).toBe("HK$13.43B");
    expect(byId["pe-ttm"]).toBe("76.3×");
    expect(byId["dividend-yield"]).toBe("2.21%");
    expect(byId.beta).toBe("0.91");
    expect(byId.volume).toBe("14.54 M");
    expect(byId["average-volume"]).toBe("12.27 M");
    expect(byId["shares-outstanding"]).toBe("7.99 B");
    expect(byId["float-shares"]).toBe("4.12 B");
  });

  it("keeps unavailable fundamentals hidden instead of rendering fake dashes", () => {
    const rows = buildKeyStatRows(null, [{ v: 2_500_000 }] as Bar[], pick);
    expect(rows.map((row) => row.id)).toEqual(["volume", "average-volume"]);
  });
});

describe("next earnings temporal invariant", () => {
  afterEach(() => vi.useRealTimers());

  it("hides a KRUS-shaped past next earnings report instead of calling it next", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-26T12:00:00.000Z"));
    const fund = fundFixture();
    fund.earnings!.next_date = "2026-08-25";

    const rows = buildKeyStatRows(fund, [], pick);

    expect(rows.find((row) => row.id === "next-earnings")).toBeUndefined();
  });

  it("keeps a future next earnings report and its positive countdown", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-26T12:00:00.000Z"));
    const fund = fundFixture();
    fund.earnings!.next_date = "2026-09-15";

    const rows = buildKeyStatRows(fund, [], pick);

    expect(rows.find((row) => row.id === "next-earnings")).toEqual({
      id: "next-earnings",
      label: "Next earnings report",
      value: "In 20 days",
    });
  });

  it("hides an impossible ISO-shaped legacy next earnings date", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-26T12:00:00.000Z"));
    const fund = fundFixture();
    fund.earnings!.next_date = "2026-09-31";

    const rows = buildKeyStatRows(fund, [], pick);

    expect(rows.find((row) => row.id === "next-earnings")).toBeUndefined();
  });
});
