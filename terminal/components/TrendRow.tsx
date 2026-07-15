"use client";
import { useMemo, useState } from "react";
import type { Bar } from "@/lib/fund";
import { computeTrendBacktest, TREND_STATES, type TrendState } from "@/lib/trend";
import { useT } from "@/lib/i18n";

// Descriptive TREND lane, rendered as a single container directly under the Oracle/Desk button.
// The state row is always visible; hovering (or clicking) reveals the per-state forward-return base
// rates in the SAME container. See lib/trend.ts + docs/ORACLE_DESK_DIAGNOSIS_2026-07-14.md (step 4).

const STATE_LABEL_KEY: Record<TrendState, string> = {
  UPTREND: "trendUptrend", PULLBACK: "trendPullback", RANGE: "trendRange", DOWNTREND: "trendDowntrend",
};
// Pill accent per state — green uptrend / red downtrend / muted otherwise (matches the approved mock).
function stateColor(s: TrendState): string {
  return s === "UPTREND" ? "var(--buy)" : s === "DOWNTREND" ? "var(--sell)" : "var(--text-2)";
}
function pct1(x: number | null): string {
  if (x == null) return "—";
  return `${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(1)}%`;
}
// Edge is a small signed deviation; only paint it green/red when it's meaningful, else keep it muted
// so a ~0 edge reads honestly as "no edge" rather than a strong call.
function edgeColor(x: number | null): string {
  if (x == null || Math.abs(x) < 1) return "var(--text-2)";
  return x > 0 ? "var(--buy)" : "var(--sell)";
}

export default function TrendRow({ bars }: { bars: Bar[] }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const bt = useMemo(() => computeTrendBacktest(bars || []), [bars]);
  const cur = bt.current;
  if (!cur) return null; // insufficient history for a warm 200-day MA — render nothing

  const c = stateColor(cur);
  const muted = cur !== "UPTREND" && cur !== "DOWNTREND";
  const pillStyle: React.CSSProperties = muted
    ? { color: "var(--text-2)", background: "var(--panel-2)", borderColor: "var(--line)" }
    : { color: c, background: `color-mix(in srgb, ${c} 7%, transparent)`, borderColor: `color-mix(in srgb, ${c} 28%, transparent)` };

  return (
    <div
      className={"trend-box" + (open ? " trend-box--open" : "")}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      tabIndex={0}
      role="button"
      aria-haspopup="true"
      aria-expanded={open}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onClick={() => setOpen((o) => !o)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen((o) => !o); } }}
    >
      <div className="trend-row">
        <span className="trend-lbl">{t("trendLbl")}</span>
        <span className="trend-pill" style={pillStyle}>{t(STATE_LABEL_KEY[cur])}</span>
        <span className="trend-horizon">{t("trendHorizon")}</span>
      </div>
      {open && (
        <div className="trend-tbl" role="tooltip">
          <span className="trend-th">{t("trendColState")}</span>
          <span className="trend-th trend-num">n</span>
          <span className="trend-th trend-num">{t("trendColEdge60")}</span>
          {TREND_STATES.map((s) => {
            const st = bt.stats[s];
            const isCur = s === cur;
            return (
              <TrendStatRow key={s}
                label={t(STATE_LABEL_KEY[s])} n={st.n}
                edge={pct1(st.fwd60Excess)} edgeColor={edgeColor(st.fwd60Excess)}
                isCur={isCur} curColor={stateColor(s)} />
            );
          })}
        </div>
      )}
    </div>
  );
}

function TrendStatRow({ label, n, edge, edgeColor, isCur, curColor }: {
  label: string; n: number; edge: string; edgeColor: string; isCur: boolean; curColor: string;
}) {
  const cls = "trend-td" + (isCur ? " trend-td--cur" : "");
  const labelStyle = isCur ? { color: curColor, fontWeight: 500 } : undefined;
  return (
    <>
      <span className={cls} style={labelStyle}>{label}</span>
      <span className={cls + " trend-num"}>{n || "—"}</span>
      <span className={cls + " trend-num"} style={{ color: n ? edgeColor : "var(--text-2)" }}>{n ? edge : "—"}</span>
    </>
  );
}
