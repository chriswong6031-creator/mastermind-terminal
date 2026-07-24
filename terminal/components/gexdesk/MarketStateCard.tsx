"use client";
/**
 * MarketStateCard — renders the gex_state payload (options_structure.gex_state/v1).
 *
 * Pass 3 (MomoEdge parity) — right rail density:
 *   MARKET STATE: regime chip (large colored label) + thesis line
 *   STABILITY: ring gauge
 *   Three metric blocks exactly matching MomoEdge spirit:
 *     γ POLARITY  — LONG/SHORT γ DOMINANT + net dealer gamma regime caption + dominance %
 *     HEDGE PRESSURE — HIGH/LOW + size of dealer hedging flow caption + |net γ| value
 *     PIN TARGET — strike + probability, or — when null
 *   Structural range bar: horizontal track put-support → call-wall, spot marker,
 *     flip marker, gradient fill.
 *   WHAT-IF-FLIP-BREAKS scenario boxes.
 *   Passport .obs-note (always at bottom).
 *
 * HONESTY DOCTRINE (non-negotiable):
 *   - Passport caveat chip is always visible.
 *   - Single-name near-constant note shown when is_index_product=false.
 *   - Regime theses are structural descriptions — not trade forecasts.
 *   - No "validated", "predictive", or direction-assertive copy.
 *   - Computed values (γ dominance %, hedge pressure threshold) documented inline.
 *
 * Props:
 *   statePayload  — /api/flow?f=gexstate:<ROOT> (schema v1) | null
 *   gexPayload    — main GEX payload (for structural range bar and what-if)
 *   isIndexProduct — whether the root is an index ETF
 *   lang          — "en" | "zh"
 */

import React, { useMemo } from "react";
import { makeGexT } from "./gexStrings";
import type { Lang } from "@/lib/i18n";
import type { GexPayload } from "./GexDeskView";
import { RingGauge } from "@/components/ui/RingGauge";
import { Tip } from "@/components/ui/Tip";

// ─── Schema (gexstate/v1) ────────────────────────────────────────────────────

export interface GexStatePayload {
  schema: "options_structure.gex_state/v1";
  asof: string;
  root: string;
  state: "PIN" | "DRIFT" | "RANGE" | "TRANSITION" | "TREND" | "CASCADE" | "UNKNOWN";
  stability_pct: number;          // 0-100
  net_gamma: "POSITIVE" | "NEGATIVE" | "UNKNOWN";
  gravity: {
    up_pct: number;
    down_pct: number;
    direction: "up" | "down" | "neutral";
  };
  pin_target?: {
    strike: number;
    probability: number;          // 0-100
  } | null;
  cascade_trigger?: {
    strike: number;
    confidence: number;
  } | null;
  upside_trigger?: {
    strike: number;
    confidence: number;
  } | null;
  structural_range?: {
    low: number;
    high: number;
  } | null;
  is_index_product: boolean;
  // Extended fields from richer fixture (tolerated-optional)
  net_gex_bn?: number | null;
  gamma_flip?: number | null;
  dist_to_flip_pct?: number | null;   // spot's % distance from the flip level (signed: + = spot above flip)
  call_wall?: number | null;
  put_wall?: number | null;
  magnet?: number | null;
  spot?: number | null;
  // LIVE-schema aliases (options_structure.gex_state/v1 as published) — the card
  // was written against the fixture's field names; these are the real ones.
  gamma_regime?: GexStatePayload["state"];
  pin_probability?: number | null;      // 0..1 fraction (fixture pin_target.probability is 0-100)
  gravity_direction?: "up" | "down" | "neutral";
  gravity_up_pct?: number | null;
}

// ─── Regime colors ────────────────────────────────────────────────────────────

const REGIME_COLORS: Record<string, string> = {
  PIN:        "var(--up)",
  DRIFT:      "var(--brand-2)",
  RANGE:      "var(--brand-2)",
  TRANSITION: "var(--signal)",
  TREND:      "var(--down)",
  CASCADE:    "var(--down)",
  UNKNOWN:    "var(--muted)",
};

// ─── Derived metrics ──────────────────────────────────────────────────────────

/**
 * γ POLARITY: dominance % = posGex / (posGex + |negGex|) * 100
 * Derived from by_strike in gexPayload (not statePayload).
 * Returns { pct: number, isLong: boolean } or null when insufficient data.
 */
function computeGammaPolarity(
  strikes: GexPayload["by_strike"]
): { pct: number; isLong: boolean } | null {
  if (!strikes || strikes.length === 0) return null;
  let posSum = 0;
  let negSum = 0;
  for (const s of strikes) {
    if (s.gamma_net > 0) posSum += s.gamma_net;
    else negSum += Math.abs(s.gamma_net);
  }
  const total = posSum + negSum;
  if (total <= 0) return null;
  const pct = (posSum / total) * 100;
  return { pct, isLong: pct >= 50 };
}

/**
 * HEDGE PRESSURE: HIGH when |net_gex_bn| > threshold (0.5B), LOW otherwise.
 * Threshold documented here — not externally validated.
 */
const HEDGE_PRESSURE_HIGH_THRESHOLD_BN = 0.5;

function computeHedgePressure(netGexBn: number | null | undefined): {
  level: "HIGH" | "LOW";
  absVal: number | null;
} {
  if (netGexBn == null || !Number.isFinite(netGexBn)) {
    return { level: "LOW", absVal: null };
  }
  const absVal = Math.abs(netGexBn);
  return {
    level: absVal >= HEDGE_PRESSURE_HIGH_THRESHOLD_BN ? "HIGH" : "LOW",
    absVal,
  };
}

function fmtBn(val: number | null): string {
  if (val == null) return "";
  if (val >= 1) return `${val.toFixed(2)}B`;
  if (val >= 0.001) return `${(val * 1000).toFixed(1)}M`;
  return `${(val * 1e6).toFixed(0)}K`;
}

function fmtLevel(val: number | null | undefined): string {
  if (val == null || !Number.isFinite(val)) return "—";
  return val % 1 === 0 ? String(val) : val.toFixed(1);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/**
 * StructuralRangeBar: horizontal track from put_wall→call_wall with
 * spot marker and flip marker. Gradient fill (teal positive side / neutral).
 */
function StructuralRangeBar({
  low,
  high,
  spot,
  flip,
}: {
  low: number;
  high: number;
  spot: number | null;
  flip: number | null;
}) {
  const range = high - low;
  if (range <= 0) return null;

  const spotPct =
    spot != null
      ? Math.max(0, Math.min(100, ((spot - low) / range) * 100))
      : null;
  const flipPct =
    flip != null
      ? Math.max(0, Math.min(100, ((flip - low) / range) * 100))
      : null;

  return (
    <div style={RANGE_BAR_WRAP}>
      <div style={RANGE_BAR_LABELS}>
        <span style={RANGE_BAR_LBL}>{fmtLevel(low)}</span>
        <span style={{ ...RANGE_BAR_LBL, opacity: 0.5 }}>PUT SUPP</span>
        <span style={{ ...RANGE_BAR_LBL, opacity: 0.5 }}>CALL WALL</span>
        <span style={{ ...RANGE_BAR_LBL, textAlign: "right" }}>
          {fmtLevel(high)}
        </span>
      </div>
      <div style={RANGE_BAR_TRACK}>
        {/* Gradient fill: from put_wall to flip = negative tint, flip to call_wall = positive tint */}
        {flipPct != null ? (
          <>
            <div
              style={{
                ...RANGE_BAR_FILL_NEG,
                width: `${flipPct}%`,
              }}
            />
            <div
              style={{
                ...RANGE_BAR_FILL_POS,
                left: `${flipPct}%`,
                width: `${100 - flipPct}%`,
              }}
            />
          </>
        ) : (
          <div style={{ ...RANGE_BAR_FILL_POS, width: "100%" }} />
        )}
        {/* Flip marker */}
        {flipPct != null && (
          <div
            style={{
              ...RANGE_BAR_MARKER,
              left: `${flipPct}%`,
              background: "var(--cat-2)",
              boxShadow: "0 0 6px var(--cat-2)",
            }}
          />
        )}
        {/* Spot marker */}
        {spotPct != null && (
          <div
            style={{
              ...RANGE_BAR_MARKER,
              left: `${spotPct}%`,
              background: "var(--signal)",
              boxShadow: "0 0 6px var(--signal)",
              height: 14,
              top: -3,
            }}
          />
        )}
      </div>
      {/* Sub-labels: FLIP and SPOT positions */}
      <div style={{ position: "relative", height: 14 }}>
        {flipPct != null && (
          <span
            style={{
              ...RANGE_BAR_SUB_LBL,
              left: `${Math.min(flipPct, 85)}%`,
              color: "var(--cat-2)",
            }}
          >
            FLIP
          </span>
        )}
        {spotPct != null && (
          <span
            style={{
              ...RANGE_BAR_SUB_LBL,
              left: `${Math.min(spotPct, 85)}%`,
              color: "var(--signal)",
              marginTop: 0,
            }}
          >
            SPOT
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * WhatIfFlipBreaks: 3 scenario boxes at put_support, flip, call_wall.
 */
function WhatIfFlipBreaks({
  low,
  flip,
  high,
}: {
  low: number | null;
  flip: number | null;
  high: number | null;
}) {
  if (low == null && flip == null && high == null) return null;
  return (
    <div style={WHATIF_WRAP}>
      <span style={WHATIF_TITLE}>WHAT IF FLIP BREAKS?</span>
      <div style={WHATIF_BOXES}>
        {low != null && (
          <div style={WHATIF_BOX}>
            <span style={{ ...WHATIF_BOX_VAL, color: "var(--down)" }}>
              {fmtLevel(low)}
            </span>
            <span style={WHATIF_BOX_LBL}>PUT SUPP</span>
          </div>
        )}
        {flip != null && (
          <div style={{ ...WHATIF_BOX, borderColor: "rgba(157,134,255,0.25)" }}>
            <span style={{ ...WHATIF_BOX_VAL, color: "var(--cat-2)" }}>
              {fmtLevel(flip)}
            </span>
            <span style={WHATIF_BOX_LBL}>FLIP</span>
          </div>
        )}
        {high != null && (
          <div style={WHATIF_BOX}>
            <span style={{ ...WHATIF_BOX_VAL, color: "var(--brand-2)" }}>
              {fmtLevel(high)}
            </span>
            <span style={WHATIF_BOX_LBL}>CALL WALL</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface MarketStateCardProps {
  statePayload: GexStatePayload | null;
  gexPayload?: GexPayload | null;
  isIndexProduct: boolean;
  lang: Lang;
}

export function MarketStateCard({
  statePayload,
  gexPayload,
  isIndexProduct,
  lang,
}: MarketStateCardProps) {
  const t = makeGexT(lang);

  const passportText = t("passportIndex");
  const singleNameNote = !isIndexProduct ? t("passportSingleName") : null;
  const gateNote = t("passportGate");

  // Derived: γ polarity from gex payload strikes
  const gammaPolarity = useMemo(
    () => computeGammaPolarity(gexPayload?.by_strike ?? []),
    [gexPayload?.by_strike]
  );

  // Derived: hedge pressure
  const netGexBn = statePayload?.net_gex_bn ?? gexPayload?.net_gex_bn ?? null;
  const hedgePressure = useMemo(
    () => computeHedgePressure(netGexBn),
    [netGexBn]
  );

  // Level sources: prefer statePayload fields (richer), fall back to gexPayload
  const callWall = statePayload?.call_wall ?? gexPayload?.call_wall ?? null;
  const putWall = statePayload?.put_wall ?? gexPayload?.put_wall ?? null;
  const flipLevel = statePayload?.gamma_flip ?? gexPayload?.gamma_flip ?? null;
  const spotRef = statePayload?.spot ?? gexPayload?.spot_ref ?? null;

  if (!statePayload) {
    return (
      <div className="obs-card obs-scroll" style={CARD_OUTER} data-tut="gex-state-card">
        <div className="obs-card-hd" style={CARD_HEADER}>
          <span className="obs-lbl">{t("stateTitle")}</span>
        </div>
        <div style={PLACEHOLDER}>
          <span style={PLACEHOLDER_TEXT}>{t("stateComputing")}</span>
        </div>
        <PassportBlock
          passportText={passportText}
          singleNameNote={singleNameNote}
          gateNote={gateNote}
        />
      </div>
    );
  }

  // Normalize live schema → the fields this card renders. Live gexstate publishes
  // gamma_regime / net_gex_bn-sign / magnet+pin_probability; the card was written
  // against the fixture's state / net_gamma / pin_target{} (blank hero otherwise).
  const state = statePayload.state ?? statePayload.gamma_regime ?? "UNKNOWN";
  const netGamma: "POSITIVE" | "NEGATIVE" | "UNKNOWN" =
    statePayload.net_gamma ?? (netGexBn != null ? (netGexBn >= 0 ? "POSITIVE" : "NEGATIVE") : "UNKNOWN");
  const regimeColor = REGIME_COLORS[state] ?? "var(--muted)";
  const thesisKey = (`thesis${state}` as Parameters<typeof t>[0]);
  const thesisText = t(thesisKey) || t("thesisUNKNOWN");
  const regimeLabel = t(`regime${state}` as Parameters<typeof t>[0]) || state;

  const stabilityPct = Math.round(statePayload.stability_pct ?? 0);

  // Distance from spot to the gamma-flip level, % of spot — how close we are to a
  // long-γ ↔ short-γ regime change (the most actionable dealer-positioning read).
  // Prefer the published field; else derive it. Signed: + = spot above flip.
  const distToFlipPct = statePayload.dist_to_flip_pct
    ?? (spotRef != null && flipLevel != null && spotRef !== 0
        ? ((spotRef - flipLevel) / spotRef) * 100
        : null);

  const pin = statePayload.pin_target ?? (statePayload.magnet != null
    ? { strike: statePayload.magnet, probability: statePayload.pin_probability != null ? Math.round(statePayload.pin_probability * 100) : 0 }
    : null);

  const range = statePayload.structural_range ?? (
    callWall != null && putWall != null
      ? { low: putWall, high: callWall }
      : null
  );

  return (
    <div className="obs-card" style={CARD_OUTER} data-tut="gex-state-card">
      {/* ── Header: title + regime chip ─────────────────────────────────────── */}
      <div className="obs-card-hd" style={CARD_HEADER}>
        <span className="obs-lbl">{t("stateTitle")}</span>
        <span
          style={{
            ...REGIME_CHIP,
            color: regimeColor,
            borderColor: `${regimeColor}55`,
          }}
        >
          {regimeLabel}
        </span>
      </div>

      {/* Large state label */}
      <div style={{ ...STATE_HERO, color: regimeColor }}>{state}</div>

      {/* Thesis */}
      <div style={THESIS}>{thesisText}</div>

      {/* ── Stability ring ──────────────────────────────────────────────────── */}
      <div style={STAB_ROW}>
        <RingGauge
          value={stabilityPct}
          size="md"
          tone={
            netGamma === "POSITIVE"
              ? "brand"
              : netGamma === "NEGATIVE"
              ? "down"
              : "muted"
          }
          label={t("stateStability")}
        />
        <div style={STAB_META}>
          <div style={STAB_STAT}>
            <span className="obs-lbl">{t("stateNetGamma")}</span>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color:
                  netGamma === "POSITIVE"
                    ? "var(--brand-2)"
                    : netGamma === "NEGATIVE"
                    ? "var(--down)"
                    : "var(--muted)",
              }}
            >
              {netGamma === "POSITIVE"
                ? t("stateGammaPos")
                : netGamma === "NEGATIVE"
                ? t("stateGammaNeg")
                : "—"}
            </span>
          </div>
          <div style={STAB_STAT}>
            <span className="obs-lbl">{t("stateStability")}</span>
            <span className="num" style={{ fontSize: 11, color: "var(--text-2)" }}>
              {stabilityPct}%
            </span>
          </div>
          {distToFlipPct != null && (
            <div style={STAB_STAT}>
              <Tip label={t("stateDistToFlipTip")} side="left" size="card">
                <span className="obs-lbl" style={{ cursor: "help" }}>{t("stateDistToFlip")}</span>
              </Tip>
              <span className="num" style={{ fontSize: 11, color: "var(--text-2)", fontWeight: 700 }}>
                {Math.abs(distToFlipPct).toFixed(2)}%{" "}
                <span style={{ color: "var(--muted)", fontWeight: 400 }}>
                  {distToFlipPct >= 0 ? t("stateAboveFlip") : t("stateBelowFlip")}
                </span>
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="obs-card-hr" />

      {/* ── Structural range bar ─────────────────────────────────────────────── */}
      {range && (
        <div style={SECTION_PAD}>
          <span className="obs-lbl">{t("stateRange")}</span>
          <StructuralRangeBar
            low={range.low}
            high={range.high}
            spot={spotRef}
            flip={flipLevel}
          />
        </div>
      )}

      {/* ── What-if flip breaks ──────────────────────────────────────────────── */}
      <div style={SECTION_PAD}>
        <WhatIfFlipBreaks
          low={putWall}
          flip={flipLevel}
          high={callWall}
        />
      </div>

      <div className="obs-card-hr" />

      {/* ── γ POLARITY block ─────────────────────────────────────────────────── */}
      <div style={METRIC_BLOCK}>
        <span className="obs-lbl">γ POLARITY</span>
        <div style={METRIC_BLOCK_BODY}>
          <span
            style={{
              ...METRIC_BLOCK_HERO,
              color:
                gammaPolarity == null
                  ? "var(--muted)"
                  : gammaPolarity.isLong
                  ? "var(--up)"
                  : "var(--down)",
            }}
          >
            {gammaPolarity == null
              ? "—"
              : gammaPolarity.isLong
              ? "LONG γ DOMINANT"
              : "SHORT γ DOMINANT"}
          </span>
          <span style={METRIC_BLOCK_CAPTION}>Net dealer gamma regime.</span>
          {gammaPolarity != null && (
            <span
              className="num"
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: gammaPolarity.isLong ? "var(--up)" : "var(--down)",
              }}
            >
              {gammaPolarity.pct.toFixed(0)}%
            </span>
          )}
        </div>
      </div>

      <div className="obs-card-hr" />

      {/* ── HEDGE PRESSURE block ─────────────────────────────────────────────── */}
      <div style={METRIC_BLOCK}>
        <span className="obs-lbl">HEDGE PRESSURE</span>
        <div style={METRIC_BLOCK_BODY}>
          <span
            style={{
              ...METRIC_BLOCK_HERO,
              color:
                hedgePressure.level === "HIGH"
                  ? "var(--signal)"
                  : "var(--up)",
            }}
          >
            {hedgePressure.level}
          </span>
          <span style={METRIC_BLOCK_CAPTION}>
            Size of dealer hedging flow.
          </span>
          {hedgePressure.absVal != null && (
            <span
              className="num"
              style={{ fontSize: 10, color: "var(--muted)" }}
            >
              |net γ| {fmtBn(hedgePressure.absVal)}
            </span>
          )}
        </div>
      </div>

      <div className="obs-card-hr" />

      {/* ── PIN TARGET block ─────────────────────────────────────────────────── */}
      <div style={METRIC_BLOCK}>
        <span className="obs-lbl">PIN TARGET</span>
        <div style={METRIC_BLOCK_BODY}>
          {pin ? (
            <>
              <span
                className="num"
                style={{ ...METRIC_BLOCK_HERO, color: "var(--cat-2)" }}
              >
                {fmtLevel(pin.strike)}
              </span>
              <span style={METRIC_BLOCK_CAPTION}>
                Strike dealers pin toward.
              </span>
              <span
                className="num"
                style={{ fontSize: 10, color: "var(--muted)" }}
              >
                {pin.probability}% prob
              </span>
            </>
          ) : (
            <span style={{ fontSize: 12, color: "var(--muted)" }}>—</span>
          )}
        </div>
      </div>

      {/* Passport (always at bottom) */}
      <PassportBlock
        passportText={passportText}
        singleNameNote={singleNameNote}
        gateNote={gateNote}
      />
    </div>
  );
}

// ─── Passport block ───────────────────────────────────────────────────────────

function PassportBlock({
  passportText,
  singleNameNote,
  gateNote,
}: {
  passportText: string;
  singleNameNote: string | null;
  gateNote: string;
}) {
  return (
    <div style={PASSPORT_BLOCK}>
      <div
        className="obs-note"
        style={{
          margin: 0,
          padding: "8px 10px",
          fontSize: 10,
          lineHeight: 1.5,
          borderRadius: 8,
        }}
      >
        {passportText}
        {singleNameNote && (
          <>
            <br />
            {singleNameNote}
          </>
        )}
        <br />
        <span style={{ opacity: 0.7 }}>{gateNote}</span>
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const CARD_OUTER: React.CSSProperties = {
  borderLeft: "1px solid rgba(255,255,255,0.09)",
  borderRadius: 0,
  display: "flex",
  flexDirection: "column",
  minWidth: 300,
  width: 340,
  flexShrink: 0,
  overflowY: "auto",
  scrollbarWidth: "thin" as const,
  scrollbarColor: "rgba(255,255,255,0.13) transparent",
};

const CARD_HEADER: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const REGIME_CHIP: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 800,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  border: "1px solid",
  borderRadius: "var(--r-pill)",
  padding: "2px 7px",
  marginLeft: "auto",
};

const STATE_HERO: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 900,
  letterSpacing: "0.05em",
  padding: "4px 14px 0",
  lineHeight: 1.1,
  textTransform: "uppercase",
};

const THESIS: React.CSSProperties = {
  fontSize: 10.5,
  color: "var(--text-2)",
  lineHeight: 1.5,
  padding: "6px 14px 10px",
  fontStyle: "italic",
};

const STAB_ROW: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "8px 14px",
};

const STAB_META: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 5,
  flex: 1,
  minWidth: 0,
};

const STAB_STAT: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 4,
};

const SECTION_PAD: React.CSSProperties = {
  padding: "8px 14px 4px",
};

const METRIC_BLOCK: React.CSSProperties = {
  padding: "8px 14px",
};

const METRIC_BLOCK_BODY: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
  marginTop: 4,
};

const METRIC_BLOCK_HERO: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 800,
  letterSpacing: "0.04em",
  lineHeight: 1.2,
};

const METRIC_BLOCK_CAPTION: React.CSSProperties = {
  fontSize: 9.5,
  color: "var(--muted)",
  lineHeight: 1.4,
};

// Structural range bar
const RANGE_BAR_WRAP: React.CSSProperties = {
  marginTop: 6,
};

const RANGE_BAR_LABELS: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "auto 1fr 1fr auto",
  gap: 2,
  marginBottom: 3,
};

const RANGE_BAR_LBL: React.CSSProperties = {
  fontSize: 9,
  color: "var(--muted)",
  fontVariantNumeric: "tabular-nums",
};

const RANGE_BAR_TRACK: React.CSSProperties = {
  position: "relative",
  height: 8,
  background: "rgba(255,255,255,0.06)",
  borderRadius: 4,
  overflow: "hidden",
};

const RANGE_BAR_FILL_POS: React.CSSProperties = {
  position: "absolute",
  top: 0,
  bottom: 0,
  background:
    "linear-gradient(90deg, rgba(77,130,255,0.18), rgba(77,130,255,0.38))",
};

const RANGE_BAR_FILL_NEG: React.CSSProperties = {
  position: "absolute",
  left: 0,
  top: 0,
  bottom: 0,
  background:
    "linear-gradient(90deg, rgba(240,86,107,0.18), rgba(240,86,107,0.12))",
};

const RANGE_BAR_MARKER: React.CSSProperties = {
  position: "absolute",
  width: 2,
  height: 8,
  top: 0,
  transform: "translateX(-50%)",
  borderRadius: 1,
};

const RANGE_BAR_SUB_LBL: React.CSSProperties = {
  position: "absolute",
  top: 0,
  fontSize: 8,
  fontWeight: 700,
  letterSpacing: "0.06em",
  transform: "translateX(-50%)",
};

// What-if boxes
const WHATIF_WRAP: React.CSSProperties = {
  marginTop: 4,
};

const WHATIF_TITLE: React.CSSProperties = {
  fontSize: 8.5,
  fontWeight: 700,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: "var(--muted)",
  display: "block",
  marginBottom: 5,
};

const WHATIF_BOXES: React.CSSProperties = {
  display: "flex",
  gap: 4,
};

const WHATIF_BOX: React.CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 2,
  padding: "5px 4px",
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: "var(--r-sm, 6px)",
};

const WHATIF_BOX_VAL: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 800,
  fontVariantNumeric: "tabular-nums",
  lineHeight: 1,
};

const WHATIF_BOX_LBL: React.CSSProperties = {
  fontSize: 7.5,
  color: "var(--muted)",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  textAlign: "center",
};

const PLACEHOLDER: React.CSSProperties = {
  flex: 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
};

const PLACEHOLDER_TEXT: React.CSSProperties = {
  fontSize: 11,
  color: "var(--muted)",
  fontStyle: "italic",
  textAlign: "center",
  lineHeight: 1.5,
};

const PASSPORT_BLOCK: React.CSSProperties = {
  padding: "8px 10px",
  marginTop: "auto",
};
