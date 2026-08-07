"use client";
/**
 * GeometryRail — positional price rail showing STOP / ENTRY / LAST / T1 / T2.
 *
 * Bull layout (bottom→top):  STOP < ENTRY < LAST < T1 < T2
 * Bear layout (top→bottom):  STOP > ENTRY > LAST > T1 (inverted for BEAR)
 *
 * Distances are expressed in R-units (multiples of ENTRY→STOP distance).
 * When geometry.dist_to_stop_r and dist_to_t1_r are present they are used;
 * otherwise raw price levels are compared.
 *
 * HONESTY: purely positional display — no forecast copy.
 */

import { makeProphetT } from "./prophetStrings";
import type { Lang } from "@/lib/i18n";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GeometryPayload {
  /** R-multiples to stop (positive = above stop, negative = below) */
  dist_to_stop_r?: number | null;
  dist_to_t1_r?: number | null;
  horizon_pct_used?: number | null;
}

interface GeometryRailProps {
  direction: "BULL" | "BEAR";
  entry: number | null;
  stop: number | null;
  t1: number | null;
  t2?: number | null;
  last?: number | null;
  geometry?: GeometryPayload | null;
  lang: Lang;
}

export const WIDE_R_PCT = 0.12;
export const WIDE_T2_STRETCH = 0.35;

export interface GeometryStretch {
  rAbs: number | null;
  rPct: number | null;
  t2Stretch: number | null;
  wide: boolean;
}

/**
 * Large structural stops can make mechanically projected targets look like
 * forecasts. Keep the audit guard independent of the visual layout.
 */
export function geometryStretch(
  entry: number | null | undefined,
  stop: number | null | undefined,
  t2: number | null | undefined,
): GeometryStretch {
  const e = entry != null && entry > 0 ? entry : null;
  const rAbs = e != null && stop != null ? Math.abs(e - stop) : null;
  const rPct = e != null && rAbs != null ? rAbs / e : null;
  const t2Stretch = e != null && t2 != null ? Math.abs(t2 - e) / e : null;
  const wide =
    (rPct != null && rPct > WIDE_R_PCT) ||
    (t2Stretch != null && t2Stretch > WIDE_T2_STRETCH);
  return { rAbs, rPct, t2Stretch, wide };
}

// ── Component ──────────────────────────────────────────────────────────────────

export function GeometryRail({
  direction,
  entry,
  stop,
  t1,
  t2,
  last,
  geometry,
  lang,
}: GeometryRailProps) {
  const t = makeProphetT(lang);
  const isBear = direction === "BEAR";
  const stretch = geometryStretch(entry, stop, t2 ?? t1);

  // Collect all defined price levels for rail scaling
  const levels: {
    label: string;
    price: number;
    color: string;
    isLast?: boolean;
    isTarget?: boolean;
  }[] = [];

  if (stop != null)  levels.push({ label: t("stop"),  price: stop,  color: "var(--down)" });
  if (entry != null) levels.push({ label: t("entry"), price: entry, color: "var(--text-2)" });
  if (last != null)  levels.push({ label: t("last"),  price: last,  color: "var(--obs-prophet-cyan)", isLast: true });
  if (t1 != null)    levels.push({ label: t("t1"),    price: t1,    color: "var(--up)", isTarget: true });
  if (t2 != null)    levels.push({ label: t("t2"),    price: t2,    color: "color-mix(in srgb,var(--up) 60%,transparent)", isTarget: true });

  if (levels.length < 2) {
    return (
      <div style={EMPTY_STYLE}>
        {t("geometryEmpty")}
      </div>
    );
  }

  const prices = levels.map((l) => l.price);
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const range = maxP - minP || 1;

  // For BEAR, top of rail = highest price (STOP), bottom = T1
  // For BULL, bottom of rail = STOP, top = T1/T2
  const positionPct = (price: number): number => {
    const raw = (price - minP) / range; // 0=bottom, 1=top
    return isBear ? 1 - raw : raw;      // invert for bear
  };

  // Sort levels by vertical position (lowest pct = bottom)
  const sorted = [...levels].sort((a, b) => positionPct(a.price) - positionPct(b.price));

  const hasGeom = geometry != null;
  const distStop = hasGeom ? geometry!.dist_to_stop_r : null;
  const distT1   = hasGeom ? geometry!.dist_to_t1_r   : null;
  const horizPct = hasGeom ? geometry!.horizon_pct_used : null;
  const wideBody = t("wideGeomBody")
    .replace("{r}", stretch.rAbs != null ? `$${stretch.rAbs.toFixed(2)}` : "—")
    .replace("{pct}", stretch.rPct != null ? (stretch.rPct * 100).toFixed(0) : "—");

  return (
    <div className="obs-card obs-prophet-geometry" style={WRAPPER}>
      <div style={TITLE_ROW}>
        <span style={SECTION_LABEL}>{t("geometryTitle")}</span>
        {/* R/R summary */}
        {distStop != null && distT1 != null && distStop > 0 && (
          <span style={RR_CHIP}>
            R/R {(distT1 / distStop).toFixed(2)}
          </span>
        )}
      </div>

      {/* ── Rail ── */}
      <div style={{ display: "flex", gap: 12, alignItems: "stretch" }}>
        {/* Vertical bar */}
        <div style={RAIL_BAR}>
          {sorted.map((lv) => {
            const pct = positionPct(lv.price) * 100;
            return (
              <div
                key={lv.label}
                style={{
                  position: "absolute",
                  bottom: `${pct}%`,
                  left: 0,
                  right: 0,
                  height: lv.isLast ? 3 : 2,
                  background: lv.color,
                  borderRadius: 2,
                  transform: "translateY(50%)",
                  opacity: stretch.wide && lv.isTarget ? 0.55 : 1,
                }}
                aria-label={`${lv.label} ${lv.price.toFixed(2)}`}
              />
            );
          })}
          {/* Filled progress toward T1 */}
          {entry != null && last != null && t1 != null && (() => {
            const entryPct = positionPct(entry) * 100;
            const lastPct  = positionPct(last)  * 100;
            const filled   = Math.max(0, Math.min(100, lastPct - entryPct));
            const start    = Math.min(entryPct, lastPct);
            return (
              <div
                style={{
                  position: "absolute",
                  bottom: `${start}%`,
                  left: "30%",
                  width: "40%",
                  height: `${filled}%`,
                  background: isBear
                    ? "color-mix(in srgb, var(--down) 18%, transparent)"
                    : "color-mix(in srgb, var(--up) 18%, transparent)",
                  borderRadius: 2,
                  transition: "height .3s",
                }}
              />
            );
          })()}
        </div>

        {/* Labels column */}
        <div style={{ flex: 1, position: "relative", minHeight: RAIL_HEIGHT }}>
          {sorted.map((lv) => {
            const pct = positionPct(lv.price) * 100;
            return (
              <div
                key={lv.label}
                style={{
                  position: "absolute",
                  bottom: `${pct}%`,
                  left: 0,
                  transform: "translateY(50%)",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  opacity: stretch.wide && lv.isTarget ? 0.55 : 1,
                }}
              >
                <span style={{ font: "600 9.5px/1 var(--font-ui)", color: lv.color, minWidth: 38 }}>
                  {lv.label}
                </span>
                <span style={{ font: "600 11px/1 var(--font-num)", fontVariantNumeric: "tabular-nums", color: "var(--text)" }}>
                  ${lv.price.toFixed(2)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {stretch.wide && (
        <div className="obs-note" style={WIDE_NOTE}>
          <span className="obs-tag" style={{ "--c": "var(--warn)" } as React.CSSProperties}>
            {t("wideGeomTag")}
          </span>
          <span>{wideBody}</span>
        </div>
      )}

      {/* ── Stat rows below rail ── */}
      <div style={STAT_ROWS}>
        {distStop != null && (
          <StatRow
            label={t("stop") + " " + t("distAway")}
            value={`${distStop.toFixed(2)}${t("rUnit")}`}
            valueColor="var(--down)"
          />
        )}
        {distT1 != null && (
          <StatRow
            label={t("t1") + " " + t("distAway")}
            value={`${distT1.toFixed(2)}${t("rUnit")}`}
            valueColor="var(--up)"
          />
        )}
        {horizPct != null && (
          <StatRow
            label={t("horizonPct")}
            value={`${horizPct.toFixed(0)}%`}
            valueColor="var(--text-2)"
          />
        )}
      </div>

      <div style={ASOF_NOTE}>
        {last == null ? t("noLastNote") : t("ladderCaption")}
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatRow({ label, value, valueColor }: { label: string; value: string; valueColor: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5 }}>
      <span style={{ font: "500 10px/1 var(--font-ui)", color: "var(--muted)" }}>{label}</span>
      <span style={{ font: "600 10.5px/1 var(--font-num)", fontVariantNumeric: "tabular-nums", color: valueColor }}>{value}</span>
    </div>
  );
}

// ── Style constants ───────────────────────────────────────────────────────────

const RAIL_HEIGHT = 140;

// obs-card provides glass background/border/radius
const WRAPPER: React.CSSProperties = {
  padding: "10px 12px",
};

const TITLE_ROW: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: 10,
};

const SECTION_LABEL: React.CSSProperties = {
  font: "600 10px/1 var(--font-ui)",
  color: "var(--text-2)",
  textTransform: "uppercase",
  letterSpacing: ".06em",
};

const RR_CHIP: React.CSSProperties = {
  font: "600 9.5px/1 var(--font-num)",
  fontVariantNumeric: "tabular-nums",
  color: "var(--text-2)",
  border: "1px solid var(--line-2)",
  borderRadius: "var(--r-pill)",
  padding: "2px 7px",
};

const RAIL_BAR: React.CSSProperties = {
  position: "relative",
  width: 8,
  minHeight: RAIL_HEIGHT,
  background: "var(--line-2)",
  borderRadius: 4,
  flexShrink: 0,
};

const STAT_ROWS: React.CSSProperties = {
  marginTop: 10,
  paddingTop: 10,
  borderTop: "1px solid rgba(255,255,255,0.08)",
};

const WIDE_NOTE: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 8,
  marginTop: 10,
  padding: "8px 10px",
  font: "500 10px/1.45 var(--font-ui)",
};

const ASOF_NOTE: React.CSSProperties = {
  marginTop: 8,
  font: "500 9.5px/1.4 var(--font-ui)",
  color: "var(--muted)",
};

const EMPTY_STYLE: React.CSSProperties = {
  padding: "12px 0",
  font: "500 11px/1.4 var(--font-ui)",
  color: "var(--muted)",
  textAlign: "center",
};
