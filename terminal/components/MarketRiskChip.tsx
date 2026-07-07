"use client";

/**
 * MarketRiskChip — top-down market-risk awareness chip (market_risk/v1).
 *
 * A compact header chip showing the macro Risk Radar / market-state verdict
 * (RISK_ON / MIXED / RISK_OFF), the 0-100 score, and the dominant radar scare. This
 * is the market-level overlay for the sell side (SELL_SIDE_CASCADE_MASTERPLAN §5):
 * the "is the market distributing?" context that sits beside the per-name signals —
 * the piece name-level technicals cannot see.
 *
 * DISPLAY-ONLY. Never a sell. Hidden entirely when the artifact is absent or has no
 * verdict; badged "stale" when the tape is older than the freshness window (a stale
 * read must not be shown as live). Fed by ingest/pull_macro_risk.py.
 *
 * verdict colours (design system tokens):
 *   RISK_ON  → --up   (green)
 *   MIXED    → --warn (orange)
 *   RISK_OFF → --sell (red)
 */
import { useLang } from "@/lib/i18n";

export type MarketRisk = {
  schema?: string;
  asof?: string | null;
  stale?: boolean;
  realtime?: boolean;
  verdict?: "RISK_ON" | "MIXED" | "RISK_OFF" | string | null;
  score?: number | null;
  color?: string | null;
  label_en?: string | null;
  label_zh?: string | null;
  headline_en?: string | null;
  headline_zh?: string | null;
  radar?: {
    state?: string | null;
    label_en?: string | null;
    label_zh?: string | null;
    top_score?: number | null;
  } | null;
  is_display_only?: boolean;
};

const VERDICT_COLOR: Record<string, string> = {
  RISK_ON:  "var(--up)",
  MIXED:    "var(--warn)",
  RISK_OFF: "var(--sell)",
};

const VERDICT_BG: Record<string, string> = {
  RISK_ON:  "rgba(38,194,129,.13)",
  MIXED:    "rgba(232,163,61,.13)",
  RISK_OFF: "rgba(240,86,107,.13)",
};

export default function MarketRiskChip({ risk }: { risk: MarketRisk | null | undefined }) {
  const lang = useLang();
  if (!risk || !risk.verdict) return null;

  const zh = lang === "zh";
  const v = String(risk.verdict);
  const color = VERDICT_COLOR[v] ?? "var(--muted)";
  const bg = VERDICT_BG[v] ?? "rgba(90,97,111,.13)";

  const label = (zh ? risk.label_zh : risk.label_en) || risk.label_en || v;
  const headline = (zh ? risk.headline_zh : risk.headline_en) || risk.headline_en || label;
  const radarLabel = risk.radar
    ? ((zh ? risk.radar.label_zh : risk.radar.label_en) || risk.radar.label_en)
    : null;

  return (
    <span
      className="mkt-risk"
      title={headline ?? undefined}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        padding: "3px 9px", borderRadius: 999, marginRight: 12,
        color, background: bg,
        fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", cursor: "default",
      }}
    >
      <i style={{ width: 7, height: 7, borderRadius: "50%", background: color, flex: "0 0 auto" }} />
      <b>{label}</b>
      {risk.score != null && (
        <span style={{ opacity: .8, fontVariantNumeric: "tabular-nums" }}>{risk.score}</span>
      )}
      {radarLabel && <span style={{ opacity: .7, fontWeight: 500 }}>· {radarLabel}</span>}
      {risk.stale && (
        <span style={{ opacity: .6, fontWeight: 500, fontSize: 10, textTransform: "uppercase", letterSpacing: ".3px" }}>
          {zh ? "已过期" : "stale"}
        </span>
      )}
    </span>
  );
}
