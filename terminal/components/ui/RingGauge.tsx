"use client";

/**
 * RingGauge — Observatory primitive
 *
 * Conic-gradient score/confidence ring.  All colors derive from the locked
 * v5 design-system CSS tokens so the East-Asian red-up flip
 * (html[data-updown="east"]) is honoured automatically.
 *
 * Usage:
 *   <RingGauge value={91} size="md" />
 *   <RingGauge value={84} size="sm" tone="up" />
 *   <RingGauge value={37} size="lg" tone="down" label="Score" />
 *   <RingGauge value={71} size="sm" tone="auto" />   ← default
 *
 * tone="auto" maps by value:
 *   ≥70  → brand   (strong)
 *   ≥50  → up      (positive)
 *   ≥30  → muted   (neutral)
 *   <30  → down    (weak / negative)
 *
 * Sizes:
 *   sm   34px outer / 26px inner  — inline in list rows
 *   md   46px outer / 36px inner  — cards, inspector sub-stats
 *   lg   84px outer / 66px inner  — inspector hero ring
 *
 * Styles live in observatory.css (.obs-ring, .obs-ring--{size}, .obs-ring--{tone}).
 */

export type RingTone = "brand" | "up" | "down" | "muted" | "auto";
export type RingSize = "sm" | "md" | "lg";

export interface RingGaugeProps {
  /** Score or confidence value — displayed as-is */
  value: number;
  /** Scale for the ring FILL (e.g. 92 for capped confidence). Display number is unaffected. */
  max?: number;
  /** Visual size variant */
  size?: RingSize;
  /**
   * Color tone. "auto" (default) picks brand/up/muted/down by value.
   * Directional tones (up/down) map to var(--up)/var(--down) which
   * respect the East-Asian red-up flip.
   */
  tone?: RingTone;
  /** Optional micro-label rendered above the ring when supplied */
  label?: string;
}

function resolveAutoTone(value: number): Exclude<RingTone, "auto"> {
  if (value >= 70) return "brand";
  if (value >= 50) return "up";
  if (value >= 30) return "muted";
  return "down";
}

export function RingGauge({ value, max = 100, size = "sm", tone = "auto", label }: RingGaugeProps) {
  // The DISPLAYED number is always the true value; `max` only scales the fill.
  // (A confidence of 68 with a 92 cap must read "68", never a normalized 74.)
  const displayValue = isNaN(value) ? 0 : Math.max(0, Math.round(value));
  const fillPct = isNaN(value) || max <= 0
    ? 0
    : Math.max(0, Math.min(100, Math.round((value / max) * 100)));
  const resolvedTone: Exclude<RingTone, "auto"> =
    tone === "auto" ? resolveAutoTone(fillPct) : tone;

  const ring = (
    <span
      className={`obs-ring obs-ring--${size} obs-ring--${resolvedTone}`}
      style={{ "--pct": `${fillPct}%` } as React.CSSProperties}
      aria-label={`${displayValue} out of ${max}`}
      role="img"
    >
      <span className="obs-ring-inner">
        <span className="obs-ring-value num">{displayValue}</span>
      </span>
    </span>
  );

  if (!label) return ring;

  return (
    <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
      <span className="obs-lbl">{label}</span>
      {ring}
    </span>
  );
}
