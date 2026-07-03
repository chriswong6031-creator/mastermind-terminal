// Compare symbols modeled as pseudo-indicators. A compare item plots another symbol on the active
// chart and behaves like an indicator in the legend (hide / recolor / change scale mode / remove).
// Its visibility is tracked in the SAME `hidden` Set the built-in indicators use, keyed by cmpKey(),
// so ChartPanel's applyHidden() flips it without any special-casing.

export type CmpMode = "pct" | "price" | "pane";
export type CompareItem = { sym: string; color: string; mode: CmpMode };

// distinct, legible line colors handed out in order as symbols are added
export const CMP_PALETTE = ["#e8a33d", "#9d86ff", "#19c2c2", "#f06bd0", "#4d82ff", "#26c281"];

export const cmpKey = (sym: string) => `cmp:${sym}`;
export const isCmpKey = (k: string) => k.startsWith("cmp:");
export const cmpSym = (k: string) => k.slice(4);

export const CMP_MODES: { key: CmpMode; label: string; hint: string }[] = [
  { key: "pct", label: "Same % scale", hint: "Overlaid on the price pane, rebased to % so both move on one axis" },
  { key: "price", label: "New price scale", hint: "Overlaid on the price pane with its own independent price axis" },
  { key: "pane", label: "New pane", hint: "Plotted in its own sub-pane below the chart" },
];

export const nextCmpColor = (items: CompareItem[]) => {
  const used = new Set(items.map((c) => c.color));
  return CMP_PALETTE.find((c) => !used.has(c)) || CMP_PALETTE[items.length % CMP_PALETTE.length];
};
