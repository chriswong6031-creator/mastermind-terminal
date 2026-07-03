"use client";

/**
 * SectorPulseChip — compact sector-rotation awareness line.
 *
 * Renders a single line inside the detail card showing the sector theme name,
 * a coloured heat chip, and the rank string.  Hidden entirely when intel is
 * absent, null, or stale (sector_pulse field is simply not present in those
 * cases per the bridge contract).
 *
 * heat colours (design system tokens):
 *   heating → --up       (green)   — momentum accelerating
 *   hot     → --signal   (amber)   — at peak heat
 *   cooling → --warn     (orange)  — momentum fading
 *   broken  → --sell     (red)     — theme broken
 *   idle    → --muted    (grey)    — no direction
 */

export type SectorPulse = {
  theme_id?: string;
  theme_name?: string;
  heat: "heating" | "hot" | "cooling" | "broken" | "idle";
  label?: string;
  reco?: string;
  rank?: number;
  n_themes?: number;
  rank_delta_5d?: number;
  as_of?: string;
};

const HEAT_COLOR: Record<SectorPulse["heat"], string> = {
  heating: "var(--up)",
  hot:     "var(--signal)",
  cooling: "var(--warn)",
  broken:  "var(--sell)",
  idle:    "var(--muted)",
};

const HEAT_BG: Record<SectorPulse["heat"], string> = {
  heating: "rgba(38,194,129,.13)",
  hot:     "rgba(232,179,57,.13)",
  cooling: "rgba(232,163,61,.13)",
  broken:  "rgba(240,86,107,.13)",
  idle:    "rgba(90,97,111,.13)",
};

export default function SectorPulseChip({ pulse }: { pulse: SectorPulse | null | undefined }) {
  if (!pulse || !pulse.heat) return null;

  const color = HEAT_COLOR[pulse.heat] ?? "var(--muted)";
  const bg    = HEAT_BG[pulse.heat]    ?? "rgba(90,97,111,.13)";
  const label = pulse.heat.charAt(0).toUpperCase() + pulse.heat.slice(1);

  const rankStr = pulse.rank != null && pulse.n_themes != null
    ? `#${pulse.rank} of ${pulse.n_themes}`
    : pulse.rank != null
    ? `#${pulse.rank}`
    : null;

  const deltaStr = pulse.rank_delta_5d != null && pulse.rank_delta_5d !== 0
    ? (pulse.rank_delta_5d < 0 ? `▲${Math.abs(pulse.rank_delta_5d)}` : `▼${pulse.rank_delta_5d}`)
    : null;

  return (
    <div className="sp-row">
      <span className="sp-name">{pulse.theme_name ?? pulse.theme_id ?? "Sector theme"}</span>
      <span className="sp-chip" style={{ color, background: bg }}>{label}</span>
      {rankStr && <span className="sp-rank">{rankStr}</span>}
      {deltaStr && (
        <span className="sp-delta" style={{ color: pulse.rank_delta_5d! < 0 ? "var(--up)" : "var(--sell)" }}>
          {deltaStr}
        </span>
      )}
    </div>
  );
}
