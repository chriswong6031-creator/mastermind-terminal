/**
 * GexHistory.tsx — scrubbable net-GEX history strip for the Exposure Desk.
 *
 * Slice 1 surfaced the GexPayload `history[]` (net_gex_bn + gamma_flip + walls + regime per
 * session) as a static sparkline. Slice 2 turns it into a SESSION SCRUBBER: hover / drag /
 * arrow keys move a cursor across sessions and read out that session's settled structure
 * (net-GEX, gamma-flip, call/put walls, γ-polarity) with the per-session change. This is
 * "playback on the EOD data we already own" — every value is a real archived session, no
 * reconstruction, no empty states.
 *
 * Honesty / regime-dynamics doctrine:
 *   - The γ-polarity chip never stands alone — it always rides next to the net value (level),
 *     its Δ vs the prior session (velocity), and the sparkline shape (trend).
 *   - The net line + selected dot are a neutral brand color: GEX sign is a dealer-convention
 *     ASSUMPTION, not price direction, so a rising net-GEX is not "bullish" → the Δ arrow is
 *     neutral too (never var(--up)/var(--down)).
 *   - Display-only. Full by-strike ladders per past date are a separate follow-on (needs the
 *     macro EOD-surface backfill); this slice plays back the scalar structure we already ship.
 */
import React, { memo, useState } from "react";
import type { Lang } from "@/lib/i18n";
import { makeGexT } from "./gexStrings";
import type { GexPayload } from "./GexDeskView";

const WRAP: React.CSSProperties = {
  display: "flex", flexDirection: "column", gap: 9,
  padding: "11px 14px 12px", border: "1px solid var(--line)", borderRadius: 12,
  background: "linear-gradient(180deg, color-mix(in srgb, var(--brand) 4%, var(--panel)), var(--surface-1))",
};
const HEADER: React.CSSProperties = { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 };
const LABEL: React.CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", color: "var(--text-2)", textTransform: "uppercase" };
const HEADER_RIGHT: React.CSSProperties = { display: "flex", alignItems: "baseline", gap: 8 };
const SESSIONS: React.CSSProperties = { fontSize: 10, color: "var(--text-3)", fontVariantNumeric: "tabular-nums" };
const HINT: React.CSSProperties = { fontSize: 10, color: "var(--text-3)", opacity: 0.8 };
const ROW: React.CSSProperties = { display: "flex", alignItems: "stretch", gap: 18 };
const TRACK: React.CSSProperties = { display: "block", flex: 1, minWidth: 300, cursor: "ew-resize", outlineOffset: 2, touchAction: "none" };
const READOUT: React.CSSProperties = {
  display: "grid", gridTemplateColumns: "1fr", alignContent: "center", gap: 4,
  flexShrink: 0, width: 210, padding: "8px 10px",
  border: "1px solid var(--line-2)", borderRadius: 9, background: "rgba(255,255,255,.025)",
};
const READOUT_HEAD: React.CSSProperties = { display: "flex", alignItems: "baseline", gap: 6, marginBottom: 1 };
const RDATE: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: "var(--text-1)", fontVariantNumeric: "tabular-nums" };
const NOW_BADGE: React.CSSProperties = {
  fontSize: 9, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase",
  color: "var(--brand-2)", border: "1px solid var(--brand-2)", borderRadius: 4, padding: "0 4px", lineHeight: "13px",
};
const STAT: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, fontSize: 11 };
const STAT_K: React.CSSProperties = { color: "var(--text-3)" };
const STAT_V: React.CSSProperties = { fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "var(--text-1)" };
const DELTA: React.CSSProperties = { marginLeft: 6, color: "var(--text-3)", fontSize: 10, fontWeight: 600, fontVariantNumeric: "tabular-nums" };
const REGIME_V: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 4, fontWeight: 700, fontSize: 11, color: "var(--text-1)" };
const SHIFT_DOT: React.CSSProperties = { color: "var(--warn)", fontSize: 12, lineHeight: 1 };
const RANGE: React.CSSProperties = { fontSize: 10, color: "var(--text-3)", fontVariantNumeric: "tabular-nums" };

/** Level formatter: drop a trailing ".0" on round strikes, else one decimal. */
const fmtLvl = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
const fmtBn = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}`;

export const GexHistory = memo(function GexHistory({
  history,
  lang,
}: {
  history: GexPayload["history"];
  lang: Lang;
}) {
  const t = makeGexT(lang);
  const rows = (history ?? []).filter((h) => h && h.net_gex_bn != null);
  // `null` selection resolves to the latest session, so the strip reads "now" at rest and a
  // pointer-leave (setSel(null)) returns there. Hooks run before the length guard below.
  const [sel, setSel] = useState<number | null>(null);
  if (rows.length < 2) return null;

  const lastIdx = rows.length - 1;
  const selIdx = sel == null ? lastIdx : Math.max(0, Math.min(sel, lastIdx));
  const cur = rows[selIdx];
  const prev = selIdx > 0 ? rows[selIdx - 1] : null;
  const dNet = prev ? cur.net_gex_bn - prev.net_gex_bn : null;
  const isNow = selIdx === lastIdx;

  const vals = rows.map((h) => h.net_gex_bn);
  const mn = Math.min(...vals, 0);
  const mx = Math.max(...vals, 0);
  const range = mx - mn || 1;
  const W = 720;
  const H = 88;
  const px = (i: number) => (i / lastIdx) * W;
  const py = (v: number) => H - ((v - mn) / range) * (H - 6) - 3;
  const zeroY = py(0);
  const pts = rows.map((h, i) => `${px(i).toFixed(1)},${py(h.net_gex_bn).toFixed(1)}`).join(" ");
  const areaPts = `0,${zeroY.toFixed(1)} ${pts} ${W},${zeroY.toFixed(1)}`;

  const pick = (clientX: number, el: SVGSVGElement) => {
    const r = el.getBoundingClientRect();
    const frac = r.width ? (clientX - r.left) / r.width : 0;
    return Math.max(0, Math.min(lastIdx, Math.round(frac * lastIdx)));
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    let n = selIdx;
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") n = selIdx - 1;
    else if (e.key === "ArrowRight" || e.key === "ArrowUp") n = selIdx + 1;
    else if (e.key === "Home") n = 0;
    else if (e.key === "End") n = lastIdx;
    else return;
    e.preventDefault();
    setSel(Math.max(0, Math.min(lastIdx, n)));
  };

  const regimeLabel = (r: string) => {
    const k = (r || "").toLowerCase();
    if (k === "long" || k === "positive" || k === "long-gamma") return t("gexHistRegimeLong");
    if (k === "short" || k === "negative" || k === "short-gamma") return t("gexHistRegimeShort");
    return t("gexHistRegimeFlat");
  };
  const regimeShifted = !!prev && prev.regime !== cur.regime;

  return (
    <div style={WRAP} className="obs obs-gex-history">
      <div style={HEADER}>
        <span style={LABEL}>{t("gexHistTitle")}</span>
        <span style={HEADER_RIGHT}>
          <span style={HINT}>{t("gexHistScrubHint")}</span>
          <span style={SESSIONS}>{rows.length} {t("gexHistSessions")}</span>
        </span>
      </div>

      <div style={ROW} className="obs-gex-history-row">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          height={H}
          preserveAspectRatio="none"
          style={TRACK}
          role="slider"
          tabIndex={0}
          aria-label={t("gexHistAria")}
          aria-valuemin={0}
          aria-valuemax={lastIdx}
          aria-valuenow={selIdx}
          aria-valuetext={`${cur.date} · ${fmtBn(cur.net_gex_bn)}B`}
          onPointerMove={(e) => setSel(pick(e.clientX, e.currentTarget))}
          onPointerDown={(e) => { e.currentTarget.focus(); setSel(pick(e.clientX, e.currentTarget)); }}
          onPointerLeave={() => setSel(null)}
          onKeyDown={onKeyDown}
        >
          <defs>
            <linearGradient id="gex-history-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--brand-2)" stopOpacity="0.26" />
              <stop offset="100%" stopColor="var(--brand-2)" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75].map((p) => (
            <line
              key={p}
              x1="0"
              y1={H * p}
              x2={W}
              y2={H * p}
              stroke="rgba(255,255,255,.055)"
              strokeWidth="0.7"
            />
          ))}
          {/* zero reference */}
          <line x1="0" y1={zeroY} x2={W} y2={zeroY} stroke="var(--line-3)" strokeWidth="0.9" strokeDasharray="4,4" />
          <polygon points={areaPts} fill="url(#gex-history-fill)" />
          {/* net-GEX trend (neutral brand — sign is a dealer-convention assumption, not direction) */}
          <polyline fill="none" stroke="var(--brand-2)" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" points={pts} />
          {/* scrub cursor + selected session */}
          <line x1={px(selIdx)} y1="0" x2={px(selIdx)} y2={H} stroke="var(--brand-2)" strokeWidth="1" strokeOpacity="0.48" />
          <circle cx={px(selIdx)} cy={py(cur.net_gex_bn)} r={4.2} fill="var(--panel)" stroke="var(--brand-2)" strokeWidth="2.2" />
          {/* faint marker on the latest point when the cursor is parked in the past */}
          {!isNow && <circle cx={px(lastIdx)} cy={py(rows[lastIdx].net_gex_bn)} r={1.8} fill="none" stroke="var(--brand-2)" strokeWidth="0.8" strokeOpacity="0.6" />}
        </svg>

        <div style={READOUT} className="obs-gex-history-readout">
          <div style={READOUT_HEAD}>
            <span style={RDATE}>{cur.date}</span>
            {isNow && <span style={NOW_BADGE}>{t("gexHistNow")}</span>}
          </div>
          <span style={STAT}>
            <span style={STAT_K}>{t("sumNetGex")}</span>
            <span style={STAT_V}>
              {fmtBn(cur.net_gex_bn)}B
              {dNet != null && Math.abs(dNet) >= 0.05 && (
                <span style={DELTA}>{dNet > 0 ? "▲" : "▼"}{Math.abs(dNet).toFixed(1)}</span>
              )}
            </span>
          </span>
          {cur.gamma_flip != null && (
            <span style={STAT}>
              <span style={STAT_K}>{t("gexHistFlip")}</span>
              <span style={{ ...STAT_V, color: "var(--warn)" }}>{fmtLvl(cur.gamma_flip)}</span>
            </span>
          )}
          {cur.call_wall != null && (
            <span style={STAT}>
              <span style={STAT_K}>{t("sumCallWall")}</span>
              <span style={STAT_V}>{fmtLvl(cur.call_wall)}</span>
            </span>
          )}
          {cur.put_wall != null && (
            <span style={STAT}>
              <span style={STAT_K}>{t("sumPutSupport")}</span>
              <span style={STAT_V}>{fmtLvl(cur.put_wall)}</span>
            </span>
          )}
          <span style={STAT}>
            <span style={STAT_K}>{t("stateRegimeLabel")}</span>
            <span style={REGIME_V}>
              {regimeShifted && <span style={SHIFT_DOT} role="img" aria-label={t("gexHistShift")}>•</span>}
              {regimeLabel(cur.regime)}
            </span>
          </span>
        </div>
      </div>

      <div style={RANGE}>
        {rows[0].date}{" → "}{rows[lastIdx].date}
      </div>
    </div>
  );
});
