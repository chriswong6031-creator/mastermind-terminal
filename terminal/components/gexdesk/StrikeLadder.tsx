"use client";
/**
 * StrikeLadder — per-strike horizontal signed GEX bar chart.
 *
 * Layout: [strike label] [negative bar ◀ center ▶ positive bar] [gex value]
 * Strikes rendered descending (highest at top, matching GEX engine sort).
 * Key strike rows get colored badges (WALL / SUPPORT / MAGNET / FLIP).
 * Spot row highlighted amber.
 * Expiry filter chips shown when by-expiry data is present.
 * Hover tooltip with raw values.
 *
 * HONESTY DOCTRINE: bar direction (positive/negative) is the dealer-sign convention
 * — an assumption. Magnitude is the reliable read. The passport caveat is surfaced
 * in MarketStateCard (not repeated per-row).
 *
 * Props:
 *   strikes       — from GexPayload.by_strike (sorted descending by caller)
 *   spot          — current spot price for current-price row highlight
 *   levels        — { callWall, putWall, gammaFlip, hvl } for badge logic
 *   byExpiry      — optional expiry breakdown for filter chips
 *   lang          — "en" | "zh"
 */

import React, { useCallback, useRef, useState } from "react";
import { makeGexT } from "./gexStrings";
import type { Lang } from "@/lib/i18n";
import type { GexPayload } from "./GexDeskView";

// ─── Types ────────────────────────────────────────────────────────────────────

type StrikeRow = GexPayload["by_strike"][number];

interface Levels {
  callWall: number | null;
  putWall: number | null;
  gammaFlip: number | null;
  hvl: number | null;
}

interface TooltipData {
  strike: number;
  gamma_net: number;
  gamma_call: number;
  gamma_put: number;
  badge?: string;
  x: number;
  y: number;
}

interface StrikeLadderProps {
  strikes: StrikeRow[];
  spot: number | null;
  levels: Levels;
  byExpiry?: GexPayload["by_expiry"] | null;
  selectedExpiry: string | null;
  onSelectExpiry: (exp: string | null) => void;
  lang: Lang;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtGexVal(v: number): string {
  if (!Number.isFinite(v)) return "—";
  const sign = v >= 0 ? "+" : "-";
  const abs = Math.abs(v);
  if (abs >= 1) return `${sign}${abs.toFixed(2)}B`;
  if (abs >= 0.001) return `${sign}${(abs * 1000).toFixed(1)}M`;
  return `${sign}${(abs * 1e6).toFixed(0)}K`;
}

function fmtStrike(s: number): string {
  return s % 1 === 0 ? String(s) : s.toFixed(1);
}

function dteDays(expStr: string): number {
  try {
    const now = Date.now();
    const exp = new Date(expStr + "T20:00:00Z").getTime();
    return Math.max(0, Math.round((exp - now) / 86_400_000));
  } catch {
    return 0;
  }
}

function dteLabelStr(exp: string): string {
  const d = dteDays(exp);
  return d === 0 ? "0DTE" : `${d}d`;
}

/** Classify a strike row to a badge type */
function classifyBadge(
  s: StrikeRow,
  levels: Levels,
  step: number
): { tag: string; tone: "cyan" | "red" | "amber" | "purple" } | null {
  const { callWall, putWall, gammaFlip, hvl } = levels;
  const prox = step * 1.5;

  if (gammaFlip != null && Math.abs(s.strike - gammaFlip) < prox) {
    return { tag: "FLIP", tone: "purple" };
  }
  if (callWall != null && Math.abs(s.strike - callWall) < prox) {
    return { tag: "WALL", tone: "cyan" };
  }
  if (putWall != null && Math.abs(s.strike - putWall) < prox) {
    return { tag: "SUPPORT", tone: "red" };
  }
  if (hvl != null && Math.abs(s.strike - hvl) < prox) {
    return { tag: "MAGNET", tone: "amber" };
  }
  return null;
}

/** Estimate median step from sorted strikes */
function estimateStep(strikes: StrikeRow[]): number {
  if (strikes.length < 2) return 5;
  const sorted = [...strikes].sort((a, b) => a.strike - b.strike);
  const diffs = sorted
    .slice(1)
    .map((s, i) => s.strike - sorted[i].strike)
    .filter((d) => d > 0);
  if (diffs.length === 0) return 5;
  diffs.sort((a, b) => a - b);
  return diffs[Math.floor(diffs.length / 2)];
}

// ─── Component ────────────────────────────────────────────────────────────────

export function StrikeLadder({
  strikes,
  spot,
  levels,
  byExpiry,
  selectedExpiry,
  onSelectExpiry,
  lang,
}: StrikeLadderProps) {
  const t = makeGexT(lang);
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sort descending (highest strike at top)
  const sorted = [...strikes].sort((a, b) => b.strike - a.strike);

  const step = estimateStep(strikes);

  // Max |gamma_net| for bar scaling
  const maxAbs = sorted.reduce(
    (m, s) => Math.max(m, Math.abs(s.gamma_net)),
    0.001
  );

  // Current-price row: strike within step*0.6 of spot
  const spotThresh = step * 0.6;
  const currentStrike =
    spot != null
      ? sorted.reduce(
          (best, s) =>
            Math.abs(s.strike - spot) < Math.abs(best.strike - spot)
              ? s
              : best,
          sorted[0] ?? { strike: Infinity }
        )
      : null;
  const currentStrikeVal =
    currentStrike &&
    spot != null &&
    Math.abs(currentStrike.strike - spot) <= spotThresh
      ? currentStrike.strike
      : null;

  // Gamma flip insertion index (between two strikes straddling flip)
  const flipStrike = levels.gammaFlip;
  let flipInsertAfter: number | null = null;
  if (flipStrike != null) {
    for (let i = 0; i < sorted.length - 1; i++) {
      if (sorted[i].strike >= flipStrike && flipStrike > sorted[i + 1].strike) {
        flipInsertAfter = i;
        break;
      }
    }
  }

  const handleMouseEnter = useCallback(
    (s: StrikeRow, badge: string | undefined, e: React.MouseEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      setTooltip({
        strike: s.strike,
        gamma_net: s.gamma_net,
        gamma_call: s.gamma_call,
        gamma_put: s.gamma_put,
        badge,
        x: e.clientX - (rect?.left ?? 0) + 10,
        y: e.clientY - (rect?.top ?? 0) - 10,
      });
    },
    []
  );

  const handleMouseLeave = useCallback(() => setTooltip(null), []);

  if (sorted.length === 0) {
    return (
      <div style={LADDER_OUTER} data-tut="gex-ladder">
        <div style={LADDER_EMPTY}>{t("ladderNoData")}</div>
      </div>
    );
  }

  return (
    <div style={LADDER_OUTER} ref={containerRef} data-tut="gex-ladder">
      {/* ── Expiry filter chips ─────────────────────────────────────────────── */}
      {byExpiry && byExpiry.length > 0 && (
        <div style={EXPIRY_CHIPS_ROW}>
          <button
            className={`obs-chip${selectedExpiry === null ? " on" : ""}`}
            style={EXPIRY_CHIP_BASE}
            onClick={() => onSelectExpiry(null)}
          >
            {t("expiryAll")}
          </button>
          {byExpiry.map((e) => (
            <button
              key={e.exp}
              className={`obs-chip${selectedExpiry === e.exp ? " on" : ""}`}
              style={EXPIRY_CHIP_BASE}
              onClick={() => onSelectExpiry(e.exp)}
            >
              {e.exp.slice(5)}{" "}
              <span style={{ opacity: 0.6, fontSize: 9, marginLeft: 2 }}>
                {dteLabelStr(e.exp)}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* ── Column headers ──────────────────────────────────────────────────── */}
      <div style={COL_HEADER_ROW}>
        <span style={COL_STRIKE_HDR}>{t("ladderStrike")}</span>
        <span style={COL_BAR_HDR}>{t("ladderNetGex")}</span>
        <span style={COL_VAL_HDR}>{t("ladderNetGex")}</span>
      </div>

      {/* ── Zero-axis center line ────────────────────────────────────────────── */}
      <div style={CHART_BODY}>
        <div style={CENTER_LINE} />

        {/* ── Rows ─────────────────────────────────────────────────────────── */}
        {sorted.map((s, i) => {
          const badge = classifyBadge(s, levels, step);
          const isCurrent = s.strike === currentStrikeVal;
          const isPos = s.gamma_net >= 0;
          const pct = Math.abs(s.gamma_net) / maxAbs;
          const shaped = Math.pow(pct, 0.7);
          const barW = Math.max(shaped * 46, 2); // max 46% per half
          const isBig = pct > 0.35;

          return (
            <React.Fragment key={s.strike}>
              {/* Gamma flip divider line (inserted between straddling strikes) */}
              {flipInsertAfter === i - 1 && flipStrike != null && (
                <div style={FLIP_LINE} data-tut="gex-flip">
                  <span style={FLIP_LABEL}>{t("ladderFlipLine")}</span>
                  <div style={FLIP_GRADIENT} />
                  <span style={FLIP_PRICE}>{fmtStrike(flipStrike)}</span>
                </div>
              )}

              <div
                style={{
                  ...STRIKE_ROW,
                  ...(isCurrent ? CURRENT_ROW : {}),
                }}
                onMouseEnter={(e) =>
                  handleMouseEnter(s, badge?.tag, e)
                }
                onMouseLeave={handleMouseLeave}
              >
                {/* Strike price label + badge */}
                <div style={STRIKE_COL}>
                  <span
                    style={{
                      ...STRIKE_PRICE,
                      color: isCurrent
                        ? "var(--signal)"
                        : badge?.tone === "cyan"
                        ? "var(--brand-2)"
                        : badge?.tone === "red"
                        ? "var(--down)"
                        : badge?.tone === "amber"
                        ? "var(--signal)"
                        : badge?.tone === "purple"
                        ? "var(--cat-2)"
                        : "var(--text-2)",
                      fontWeight: isCurrent || badge ? 700 : 400,
                    }}
                  >
                    {fmtStrike(s.strike)}
                  </span>
                  {badge && (
                    <span
                      style={{
                        ...CLS_BADGE,
                        color:
                          badge.tone === "cyan"
                            ? "var(--brand-2)"
                            : badge.tone === "red"
                            ? "var(--down)"
                            : badge.tone === "amber"
                            ? "var(--signal)"
                            : "var(--cat-2)",
                        borderColor:
                          badge.tone === "cyan"
                            ? "rgba(77,130,255,0.35)"
                            : badge.tone === "red"
                            ? "rgba(240,86,107,0.35)"
                            : badge.tone === "amber"
                            ? "rgba(232,179,57,0.35)"
                            : "rgba(157,134,255,0.35)",
                      }}
                    >
                      {badge.tag}
                    </span>
                  )}
                </div>

                {/* Bar area (symmetric around center) */}
                <div style={BAR_AREA}>
                  {/* Negative side (right-anchored, grows left from center) */}
                  {!isPos && (
                    <div
                      style={{
                        ...BAR_NEG,
                        width: `${barW}%`,
                        opacity: isBig ? 1 : 0.82,
                      }}
                    />
                  )}
                  {/* Positive side (left-anchored, grows right from center) */}
                  {isPos && (
                    <div
                      style={{
                        ...BAR_POS,
                        width: `${barW}%`,
                        opacity: isBig ? 1 : 0.82,
                      }}
                    />
                  )}
                </div>

                {/* GEX value */}
                <span
                  className="num"
                  style={{
                    ...GEX_VAL,
                    color: isPos ? "var(--up)" : "var(--down)",
                  }}
                >
                  {fmtGexVal(s.gamma_net)}
                </span>
              </div>
            </React.Fragment>
          );
        })}

        {/* Gamma flip at the very bottom (if beyond all strikes) */}
        {flipInsertAfter === null &&
          flipStrike != null &&
          flipStrike < (sorted[sorted.length - 1]?.strike ?? Infinity) && (
            <div style={FLIP_LINE}>
              <span style={FLIP_LABEL}>{t("ladderFlipLine")}</span>
              <div style={FLIP_GRADIENT} />
              <span style={FLIP_PRICE}>{fmtStrike(flipStrike)}</span>
            </div>
          )}
      </div>

      {/* ── Tooltip ─────────────────────────────────────────────────────────── */}
      {tooltip && (
        <div
          style={{
            ...TOOLTIP,
            left: tooltip.x,
            top: tooltip.y,
          }}
        >
          <div style={TOOLTIP_TITLE}>
            ${fmtStrike(tooltip.strike)}
            {tooltip.badge && (
              <span style={{ marginLeft: 6, color: "var(--muted)" }}>
                {tooltip.badge}
              </span>
            )}
          </div>
          <div style={TOOLTIP_ROW}>
            <span style={TOOLTIP_KEY}>{t("tooltipNetGex")}</span>
            <span
              style={{
                color:
                  tooltip.gamma_net >= 0 ? "var(--brand-2)" : "var(--down)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {fmtGexVal(tooltip.gamma_net)}
            </span>
          </div>
          <div style={TOOLTIP_SEP} />
          <div style={TOOLTIP_ROW}>
            <span style={TOOLTIP_KEY}>{t("tooltipCallGex")}</span>
            <span style={{ color: "var(--brand-2)", fontVariantNumeric: "tabular-nums" }}>
              {fmtGexVal(tooltip.gamma_call)}
            </span>
          </div>
          <div style={TOOLTIP_ROW}>
            <span style={TOOLTIP_KEY}>{t("tooltipPutGex")}</span>
            <span style={{ color: "var(--down)", fontVariantNumeric: "tabular-nums" }}>
              {fmtGexVal(tooltip.gamma_put)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const LADDER_OUTER: React.CSSProperties = {
  position: "relative",
  flex: 1,
  minHeight: 0,
  overflowY: "auto",
  background: "var(--bg)",
};

const LADDER_EMPTY: React.CSSProperties = {
  padding: 24,
  color: "var(--muted)",
  fontSize: 12,
  textAlign: "center",
};

const EXPIRY_CHIPS_ROW: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 4,
  padding: "6px 10px",
  borderBottom: "1px solid var(--line-2)",
  background: "var(--panel)",
};

// Base overrides for .obs-chip in the compact ladder context (smaller than default)
const EXPIRY_CHIP_BASE: React.CSSProperties = {
  padding: "3px 8px",
  fontSize: 10,
  borderRadius: 8,
};

const COL_HEADER_ROW: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "96px 1fr 80px",
  padding: "3px 8px",
  borderBottom: "1px solid var(--line-2)",
  background: "var(--panel)",
  position: "sticky",
  top: 0,
  zIndex: 2,
};

const COL_STRIKE_HDR: React.CSSProperties = {
  fontSize: 9,
  color: "var(--muted)",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
};

const COL_BAR_HDR: React.CSSProperties = {
  fontSize: 9,
  color: "var(--muted)",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  textAlign: "center",
};

const COL_VAL_HDR: React.CSSProperties = {
  fontSize: 9,
  color: "var(--muted)",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  textAlign: "right",
};

const CHART_BODY: React.CSSProperties = {
  position: "relative",
};

const CENTER_LINE: React.CSSProperties = {
  position: "absolute",
  left: "calc(96px + 50%)",
  top: 0,
  bottom: 0,
  width: 1,
  background: "rgba(77,130,255,0.15)",
  pointerEvents: "none",
  zIndex: 1,
};

const STRIKE_ROW: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "96px 1fr 80px",
  alignItems: "center",
  height: 22,
  borderBottom: "1px solid var(--line-2)",
  cursor: "default",
  position: "relative",
  transition: "background 0.1s",
};

const CURRENT_ROW: React.CSSProperties = {
  background: "rgba(232,179,57,0.07)",
  borderTop: "1px solid rgba(232,179,57,0.22)",
  borderBottom: "1px solid rgba(232,179,57,0.22)",
};

const STRIKE_COL: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 4,
  padding: "0 8px",
  overflow: "hidden",
};

const STRIKE_PRICE: React.CSSProperties = {
  fontSize: 11,
  fontVariantNumeric: "tabular-nums",
  flexShrink: 0,
};

const CLS_BADGE: React.CSSProperties = {
  fontSize: 8,
  fontWeight: 800,
  letterSpacing: "0.07em",
  padding: "1px 4px",
  borderRadius: 3,
  border: "1px solid",
  flexShrink: 0,
};

const BAR_AREA: React.CSSProperties = {
  position: "relative",
  height: "100%",
  display: "flex",
  alignItems: "center",
};

const BAR_POS: React.CSSProperties = {
  position: "absolute",
  left: "50%",
  height: 12,
  borderRadius: "0 2px 2px 0",
  background: "linear-gradient(90deg, color-mix(in srgb, var(--brand) 45%, transparent), color-mix(in srgb, var(--brand) 85%, transparent))",
  transition: "width 0.35s cubic-bezier(.22,1,.36,1)",
  transformOrigin: "left",
};

const BAR_NEG: React.CSSProperties = {
  position: "absolute",
  right: "50%",
  height: 12,
  borderRadius: "2px 0 0 2px",
  background: "linear-gradient(270deg, color-mix(in srgb, var(--down) 45%, transparent), color-mix(in srgb, var(--down) 85%, transparent))",
  transition: "width 0.35s cubic-bezier(.22,1,.36,1)",
  transformOrigin: "right",
};

const GEX_VAL: React.CSSProperties = {
  fontSize: 10,
  fontVariantNumeric: "tabular-nums",
  fontWeight: 600,
  textAlign: "right",
  paddingRight: 8,
  letterSpacing: "0.01em",
};

const FLIP_LINE: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "3px 8px",
  height: 24,
  background: "rgba(157,134,255,0.08)",
  borderTop: "1px solid rgba(157,134,255,0.32)",
  borderBottom: "1px solid rgba(157,134,255,0.32)",
  zIndex: 2,
};

const FLIP_LABEL: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 900,
  color: "var(--cat-2)",
  letterSpacing: "0.18em",
  textTransform: "uppercase",
  flexShrink: 0,
};

const FLIP_GRADIENT: React.CSSProperties = {
  flex: 1,
  height: 1,
  background:
    "linear-gradient(90deg, rgba(157,134,255,0.6) 0%, rgba(157,134,255,0.05) 100%)",
};

const FLIP_PRICE: React.CSSProperties = {
  fontSize: 9,
  color: "var(--cat-2)",
  fontVariantNumeric: "tabular-nums",
  flexShrink: 0,
};

const TOOLTIP: React.CSSProperties = {
  position: "absolute",
  background: "var(--panel-2)",
  border: "1px solid var(--line-3)",
  borderRadius: "var(--r-md)",
  padding: "8px 10px",
  fontSize: 11,
  boxShadow: "var(--shadow-1)",
  pointerEvents: "none",
  zIndex: 100,
  minWidth: 150,
};

const TOOLTIP_TITLE: React.CSSProperties = {
  fontWeight: 700,
  marginBottom: 5,
  color: "var(--text)",
  fontVariantNumeric: "tabular-nums",
};

const TOOLTIP_ROW: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  marginTop: 2,
};

const TOOLTIP_KEY: React.CSSProperties = {
  color: "var(--muted)",
};

const TOOLTIP_SEP: React.CSSProperties = {
  height: 1,
  background: "var(--line-2)",
  margin: "4px 0",
};
