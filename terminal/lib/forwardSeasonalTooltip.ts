import { fmtPct, pick } from "./finFormat";

export interface ForwardSeasonalWindow {
  dir: "bull" | "bear";
  expected_move: number;
  typical_move?: number | null;
  win_rate: number | null;
  n: number;
  n_eff?: number;
  lo?: number | null;
  hi?: number | null;
  evidence_score?: number;
  confidence?: "low" | "medium" | "high";
}

export interface ForwardSeasonalTooltipRow {
  label: string;
  value: string;
  color?: string;
}

const pct = (value: number | null | undefined) =>
  fmtPct(value, { alreadyPct: true, sign: true, decimals: 1 });

const winRate = (value: number | null | undefined) =>
  value == null ? "—" : `${Math.round(value * 100)}%`;

function effectiveYears(window: ForwardSeasonalWindow): string {
  if (window.n_eff == null) return String(window.n);
  return Number.isInteger(window.n_eff) ? String(window.n_eff) : window.n_eff.toFixed(1);
}

/**
 * A timeline hover should summarize the selected interval, not expand every
 * half-month bucket that was combined to create it. Keeping this list bounded
 * prevents a multi-month window from turning into a 10–15 row tooltip.
 */
export function forwardSeasonalTooltipRows(
  window: ForwardSeasonalWindow,
  zh = false,
): ForwardSeasonalTooltipRow[] {
  const confidence = window.confidence ?? "low";
  const confidenceLabel =
    confidence === "high"
      ? pick(zh, "High", "高")
      : confidence === "medium"
        ? pick(zh, "Medium", "中")
        : pick(zh, "Low", "低");
  const rows: ForwardSeasonalTooltipRow[] = [
    {
      label: pick(zh, "Typical move", "典型涨跌"),
      value: pct(window.typical_move ?? window.expected_move),
      color: window.dir === "bull" ? "var(--up)" : "var(--down)",
    },
    {
      label: pick(zh, "Positive years", "上涨年份"),
      value: winRate(window.win_rate),
      color: "var(--text-2)",
    },
  ];

  if (window.lo != null && window.hi != null) {
    rows.push({
      label: pick(zh, "Middle range", "中间区间"),
      value: `${pct(window.lo)} … ${pct(window.hi)}`,
      color: "var(--muted)",
    });
  }

  rows.push(
    {
      label: pick(zh, "Support", "支持度"),
      value: window.evidence_score == null
        ? confidenceLabel
        : `${confidenceLabel} · ${window.evidence_score}/100`,
      color:
        confidence === "high"
          ? "var(--brand-2)"
          : confidence === "medium"
            ? "var(--text-2)"
            : "var(--muted)",
    },
    {
      label: pick(zh, "Effective years", "有效年份"),
      value: effectiveYears(window),
      color: "var(--text-2)",
    },
  );

  return rows;
}
