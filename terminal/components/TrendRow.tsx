"use client";
import { useMemo } from "react";
import type { Bar } from "@/lib/fund";
import { computeTrendState, type TrendState } from "@/lib/trend";
import { useT } from "@/lib/i18n";

// Descriptive TREND lane, rendered as a single static row directly under the Oracle/Desk button.
// The state is a FACT about the moving-average structure (see lib/trend.ts). The old hover table
// of per-state forward-return base rates was removed as noise — the row states the read, nothing more.

const STATE_LABEL_KEY: Record<TrendState, string> = {
  UPTREND: "trendUptrend", PULLBACK: "trendPullback", RANGE: "trendRange", DOWNTREND: "trendDowntrend",
};
// Pill accent per state — green uptrend / red downtrend / muted otherwise (matches the approved mock).
function stateColor(s: TrendState): string {
  return s === "UPTREND" ? "var(--buy)" : s === "DOWNTREND" ? "var(--sell)" : "var(--text-2)";
}

export default function TrendRow({ bars }: { bars: Bar[] }) {
  const t = useT();
  const cur = useMemo(() => computeTrendState(bars || []), [bars]);
  if (!cur) return null; // insufficient history for a warm 200-day MA — render nothing

  const c = stateColor(cur);
  const muted = cur !== "UPTREND" && cur !== "DOWNTREND";
  const pillStyle: React.CSSProperties = muted
    ? { color: "var(--text-2)", background: "var(--panel-2)", borderColor: "var(--line)" }
    : { color: c, background: `color-mix(in srgb, ${c} 7%, transparent)`, borderColor: `color-mix(in srgb, ${c} 28%, transparent)` };

  return (
    <div className="trend-box">
      <div className="trend-row">
        <span className="trend-lbl">{t("trendLbl")}</span>
        <span className="trend-pill" style={pillStyle}>{t(STATE_LABEL_KEY[cur])}</span>
        <span className="trend-horizon">{t("trendHorizon")}</span>
      </div>
    </div>
  );
}
