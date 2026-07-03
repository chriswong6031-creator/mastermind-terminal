"use client";
/**
 * __smoke.tsx — FE1b render-sanity harness. Page-less component that uses EVERY
 * FinCharts primitive with fixture data, PLUS a null/empty case for each, so the
 * whole kit typechecks against its own frozen API. Not routed; not imported by
 * app code. FE2 lanes may delete this once they wire the real pages.
 */
import {
  Bars,
  StackedBars,
  LineSeries,
  ComboChart,
  Dumbbell,
  Donut,
  HalfGauge,
  Waterfall,
  CapitalStructure,
  YearOverlay,
  MiniTable,
  FinTip,
  useFinTip,
  type Series,
  type DumbbellPoint,
  type DonutSlice,
  type WaterfallStep,
  type YearPath,
  type MiniRow,
  type TipRow,
} from "./FinCharts";

const labels = ["'21", "'22", "'23", "'24", "'25"];
const rev: Series = { name: "Revenue", values: [1091, 1590, 2000, 2600, 3200], color: "var(--brand)" };
const ni: Series = { name: "Net income", values: [-262, -390, -202, 19, 58], color: "var(--up)" };
const margin: Series = { name: "Net margin %", values: [-24, -24.5, -10.1, 0.7, 1.8], color: "var(--warn)" };

const dumbbell: DumbbellPoint[] = [
  { label: "Q4 '25", actual: 0.84, estimate: 0.8 },
  { label: "Q1 '26", actual: 0.9, estimate: 0.86 },
  { label: "Q2 '26", actual: 0.88, estimate: 0.84 },
  { label: "Q3 '26", actual: 0.84, estimate: 0.8 },
  { label: "Q4 '26", actual: null, estimate: 1.08 },
];

const donut: DonutSlice[] = [
  { label: "Free float", value: 161.71, color: "var(--warn)" },
  { label: "Closely held", value: 0.25, color: "var(--muted)" },
];

const waterfall: WaterfallStep[] = [
  { label: "Revenue", value: 3200, total: true },
  { label: "COGS", value: -700 },
  { label: "Gross profit", value: 2500, total: true },
  { label: "Op expenses", value: -2400 },
  { label: "Op income", value: 100, total: true },
  { label: "Taxes", value: -42 },
  { label: "Net income", value: 58, total: true },
];

const years: YearPath[] = [
  { year: "2024", values: Array.from({ length: 52 }, (_, i) => 100 + i * 0.5), color: "var(--warn)" },
  { year: "2025", values: Array.from({ length: 52 }, (_, i) => 100 + Math.sin(i / 6) * 8), color: "var(--up)" },
  { year: "2026", values: Array.from({ length: 52 }, (_, i) => (i < 26 ? 100 + i * 0.9 : null)), color: "var(--brand)", current: true },
];

const rows: MiniRow[] = [
  { label: "Total revenue", values: [1091, 1590, 2000, 2600, 3200], change: [null, 45.7, 25.8, 30, 23], bold: true,
    children: [
      { label: "Channel partners", values: [960, 1400, 1780, 2300, 2830], depth: 1 },
      { label: "Direct customers", values: [131, 190, 220, 300, 370], depth: 1 },
    ] },
  { label: "Gross profit", values: [877, 1270, 1600, 2080, 2560] },
  { label: "Net income", values: [-262, -390, -202, 19, 58] },
];

const tipRows: TipRow[] = [{ label: "Revenue", value: "3.20 B", color: "var(--brand)" }];

/** Uses every primitive twice: populated fixture + null/empty state. */
export default function FinChartsSmoke() {
  const { tip } = useFinTip();
  const nullTip: TipRow[] = tipRows; // keep the import live
  return (
    <div className="fin-body">
      {/* populated */}
      <Bars labels={labels} series={[rev, ni]} zh={false} />
      <StackedBars labels={labels} series={[rev, ni]} />
      <LineSeries labels={labels} series={[margin]} markers dotted={["Net margin %"]} refLine={0} />
      <ComboChart labels={labels} bars={[rev, ni]} line={margin} />
      <Dumbbell points={dumbbell} />
      <Donut slices={donut} centerValue="161.71 M" centerLabel="Shares out" />
      <HalfGauge value={0.42} verdict="Buy" counts={{ sell: 3, neutral: 6, buy: 17 }} variant="tech" />
      <HalfGauge value={0.8} variant="analyst" />
      <Waterfall steps={waterfall} />
      <CapitalStructure marketCap={23820} debt={1860} cash={3540} />
      <YearOverlay paths={years} horizon={52} monthLabels={["Jan", "May", "Sep"]} />
      <MiniTable periods={labels} rows={rows} showChange cornerLabel="Metric" pageSize={3} />
      <FinTip tip={tip} />

      {/* null / empty states — must render .fin-empty, not crash */}
      <Bars labels={[]} series={[]} />
      <StackedBars labels={labels} series={[{ name: "x", values: [null, null] }]} />
      <LineSeries labels={labels} series={[]} />
      <ComboChart labels={labels} bars={[]} line={{ name: "x", values: [] }} />
      <Dumbbell points={[]} />
      <Donut slices={[]} />
      <HalfGauge value={null} />
      <Waterfall steps={[]} />
      <CapitalStructure marketCap={null} debt={null} cash={null} />
      <YearOverlay paths={[]} horizon={0} />
      <MiniTable periods={[]} rows={[]} />
      <span hidden>{nullTip.length}</span>
    </div>
  );
}
