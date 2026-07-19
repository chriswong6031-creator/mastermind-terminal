import { describe, it, expect } from "vitest";
import { buildCapStructRows } from "../../components/fin/FinCharts";

// Smoke test for the capital-structure bridge data mapping (pure logic).
// Guards the accounting identity EV = market cap + debt − cash, the row order /
// keys / labels, the non-directional grammar (+ / − / =), and the outline-notch
// on the cash row. The visual component is a thin render over these rows.

describe("buildCapStructRows — EV bridge mapping", () => {
  const mcap = 3_000_000_000_000; // $3.0T market cap
  const debt = 100_000_000_000; //  $100B debt
  const cash = 60_000_000_000; //   $60B cash

  it("produces four rows in mcap → debt → cash → EV order with stable keys", () => {
    const rows = buildCapStructRows(mcap, debt, cash, null, false);
    expect(rows.map((r) => r.key)).toEqual(["mcap", "debt", "cash", "ev"]);
  });

  it("derives EV = market cap + debt − cash when ev is omitted", () => {
    const rows = buildCapStructRows(mcap, debt, cash, null, false);
    const ev = rows.find((r) => r.key === "ev")!;
    expect(ev.value).toBe(mcap + debt - cash); // 3.04T
  });

  it("prefers an explicit ev when supplied", () => {
    const explicit = 3_050_000_000_000;
    const rows = buildCapStructRows(mcap, debt, cash, explicit, false);
    expect(rows.find((r) => r.key === "ev")!.value).toBe(explicit);
  });

  it("stores cash as a NEGATIVE contribution (it subtracts from EV)", () => {
    const rows = buildCapStructRows(mcap, debt, cash, null, false);
    expect(rows.find((r) => r.key === "cash")!.value).toBe(-cash);
  });

  it("carries the +/−/= grammar and marks the cash row as an outline notch", () => {
    const rows = buildCapStructRows(mcap, debt, cash, null, false);
    expect(rows.map((r) => r.op)).toEqual(["", "+", "−", "="]);
    expect(rows.find((r) => r.key === "cash")!.outline).toBe(true);
    expect(rows.filter((r) => r.key !== "cash").every((r) => !r.outline)).toBe(true);
  });

  it("uses non-directional tokens only — never --up/--down (east-flip safe)", () => {
    const rows = buildCapStructRows(mcap, debt, cash, null, false);
    for (const r of rows) {
      expect(r.color).not.toMatch(/--up|--down/);
    }
    expect(rows.find((r) => r.key === "debt")!.color).toBe("var(--warn)");
    expect(rows.find((r) => r.key === "mcap")!.color).toBe("var(--brand)");
  });

  it("scales bar fractions to the largest absolute magnitude (share of EV)", () => {
    const rows = buildCapStructRows(mcap, debt, cash, null, false);
    // EV (3.04T) is the largest magnitude → frac 1; market cap slightly under.
    const ev = rows.find((r) => r.key === "ev")!;
    const mc = rows.find((r) => r.key === "mcap")!;
    const c = rows.find((r) => r.key === "cash")!;
    expect(ev.frac).toBe(1);
    expect(mc.frac).toBeCloseTo(mcap / ev.value, 6);
    expect(c.frac).toBeCloseTo(cash / ev.value, 6);
    for (const r of rows) {
      expect(r.frac).toBeGreaterThanOrEqual(0);
      expect(r.frac).toBeLessThanOrEqual(1);
    }
  });

  it("localizes labels (zh) without changing structure", () => {
    const en = buildCapStructRows(mcap, debt, cash, null, false);
    const zh = buildCapStructRows(mcap, debt, cash, null, true);
    expect(zh.map((r) => r.key)).toEqual(en.map((r) => r.key));
    expect(zh.find((r) => r.key === "ev")!.label).toBe("企业价值");
    expect(en.find((r) => r.key === "ev")!.label).toBe("Enterprise value");
  });

  it("treats absent debt/cash as zero (guards degrade gracefully)", () => {
    const rows = buildCapStructRows(mcap, 0, 0, null, false);
    expect(rows.find((r) => r.key === "ev")!.value).toBe(mcap);
    expect(rows.find((r) => r.key === "debt")!.frac).toBe(0);
    expect(rows.find((r) => r.key === "cash")!.frac).toBe(0);
  });
});
