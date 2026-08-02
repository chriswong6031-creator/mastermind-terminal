/**
 * deriveVrpSeries — the VRP regime band's derived series (Volatility tab R2.3).
 *
 * The properties that fail silently: an annualisation slip (√252 vs 252), a
 * window off-by-one, and gap rows read as returns.
 */
import { describe, expect, it } from "vitest";
import { deriveVrpSeries } from "@/components/vol/VolVrpPanel";
import type { AggTrendPayload } from "@/lib/aggTrend";

const day = (i: number) => new Date(Date.UTC(2026, 0, 2) + i * 86_400_000).toISOString().slice(0, 10);

function mkAgg(rows: { s?: number; iv?: number }[]): AggTrendPayload {
  return {
    schema: "options_hub.aggtrend/v1",
    root: "SPY",
    series: rows.map((r, i) => ({ d: day(i), ...r })),
    n_days: rows.length,
  } as AggTrendPayload;
}

describe("deriveVrpSeries", () => {
  it("recovers a known constant-vol VRP", () => {
    // Alternating ±1% daily moves → per-day log-return stdev ≈ 0.01005 →
    // rv20 ≈ 0.01005·√252 ≈ 15.96%. IV pinned at 20% → VRP ≈ +4.0 pts.
    const rows: { s: number; iv: number }[] = [];
    let s = 100;
    for (let i = 0; i < 80; i++) {
      rows.push({ s, iv: 0.2 });
      s = i % 2 === 0 ? s * 1.01 : s / 1.01;
    }
    const out = deriveVrpSeries(mkAgg(rows));
    expect(out.length).toBeGreaterThan(40);
    const last = out[out.length - 1].v;
    expect(last).toBeGreaterThan(3.2);
    expect(last).toBeLessThan(4.8);
  });

  it("skips sessions whose 20-day window contains a spot gap", () => {
    const rows: { s?: number; iv?: number }[] = [];
    let s = 100;
    for (let i = 0; i < 60; i++) {
      rows.push(i === 30 ? { iv: 0.2 } : { s, iv: 0.2 });
      s = s * 1.001;
    }
    const out = deriveVrpSeries(mkAgg(rows));
    // no VRP point may be emitted for any session whose rv20 window spans i=30
    const dates = new Set(out.map((p) => p.d));
    for (let i = 30; i < 51; i++) expect(dates.has(day(i))).toBe(false);
    expect(out.length).toBeGreaterThan(0); // sessions before and after still emit
  });

  it("is empty on absent or short input", () => {
    expect(deriveVrpSeries(null)).toEqual([]);
    expect(deriveVrpSeries(mkAgg([{ s: 100, iv: 0.2 }]))).toEqual([]);
  });
});
