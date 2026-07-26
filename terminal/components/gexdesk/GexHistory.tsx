/**
 * GexHistory.tsx — descriptive 30-session net-GEX history strip for the Exposure Desk.
 *
 * Surfaces the GexPayload `history[]` (net_gex_bn + gamma_flip per session) that we
 * already compute from the EOD greek surface but never rendered. This is the first
 * slice of "playback on the EOD data we own" — a display-only structural trend, NOT a
 * signal. Obeys the gexStrings honesty doctrine: no directional/predictive framing, the
 * line is a neutral brand color (sign is not price-direction), regime is intentionally
 * omitted (single-name regime is near-constant, disclosed in MarketStateCard).
 */
import React, { memo } from "react";
import type { Lang } from "@/lib/i18n";
import { makeGexT } from "./gexStrings";
import type { GexPayload } from "./GexDeskView";

const WRAP: React.CSSProperties = {
  display: "flex", flexDirection: "column", gap: 6,
  padding: "8px 12px", border: "1px solid var(--line)", borderRadius: 8,
  background: "var(--surface-1)",
};
const HEADER: React.CSSProperties = { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 };
const LABEL: React.CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", color: "var(--text-2)", textTransform: "uppercase" };
const SESSIONS: React.CSSProperties = { fontSize: 10, color: "var(--text-3)", fontVariantNumeric: "tabular-nums" };
const ROW: React.CSSProperties = { display: "flex", alignItems: "center", gap: 14 };
const STATS: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 2, flexShrink: 0, minWidth: 96 };
const STAT: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: 8, fontSize: 11 };
const STAT_K: React.CSSProperties = { color: "var(--text-3)" };
const STAT_V: React.CSSProperties = { fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "var(--text-1)" };
const RANGE: React.CSSProperties = { fontSize: 10, color: "var(--text-3)", fontVariantNumeric: "tabular-nums" };

export const GexHistory = memo(function GexHistory({
  history,
  lang,
}: {
  history: GexPayload["history"];
  lang: Lang;
}) {
  const t = makeGexT(lang);
  const rows = (history ?? []).filter((h) => h.net_gex_bn != null);
  if (rows.length < 2) return null;

  const vals = rows.map((h) => h.net_gex_bn);
  const mn = Math.min(...vals, 0);
  const mx = Math.max(...vals, 0);
  const range = mx - mn || 1;
  const W = 240;
  const H = 40;
  const px = (i: number) => (i / (rows.length - 1)) * W;
  const py = (v: number) => H - ((v - mn) / range) * (H - 6) - 3;
  const zeroY = py(0);
  const pts = rows.map((h, i) => `${px(i).toFixed(1)},${py(h.net_gex_bn).toFixed(1)}`).join(" ");
  const last = rows[rows.length - 1];
  const first = rows[0];
  const fmtBn = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}`;

  return (
    <div style={WRAP} className="obs">
      <div style={HEADER}>
        <span style={LABEL}>{t("gexHistTitle")}</span>
        <span style={SESSIONS}>{rows.length} {t("gexHistSessions")}</span>
      </div>
      <div style={ROW}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          height={H}
          preserveAspectRatio="none"
          style={{ display: "block", flex: 1, minWidth: 120 }}
          role="img"
          aria-label={t("gexHistAria")}
        >
          <line x1="0" y1={zeroY} x2={W} y2={zeroY} stroke="var(--line)" strokeWidth="0.6" strokeDasharray="2,2" />
          <polyline fill="none" stroke="var(--brand-2)" strokeWidth="1.4" points={pts} />
          <circle cx={W} cy={py(last.net_gex_bn)} r={2.6} fill="var(--brand-2)" />
        </svg>
        <div style={STATS}>
          <span style={STAT}>
            <span style={STAT_K}>{t("gexHistLatest")}</span>
            <span style={STAT_V}>{fmtBn(last.net_gex_bn)}</span>
          </span>
          {last.gamma_flip != null && (
            <span style={STAT}>
              <span style={STAT_K}>{t("gexHistFlip")}</span>
              <span style={{ ...STAT_V, color: "var(--warn)" }}>{last.gamma_flip.toFixed(1)}</span>
            </span>
          )}
        </div>
      </div>
      <div style={RANGE}>
        {first.date}{" → "}{last.date}
      </div>
    </div>
  );
});
