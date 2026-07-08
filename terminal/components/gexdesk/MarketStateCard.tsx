"use client";
/**
 * MarketStateCard — renders the gex_state payload (options_structure.gex_state/v1).
 *
 * Shows:
 *   - 6-state regime chip (PIN / DRIFT / RANGE / TRANSITION / TREND / CASCADE)
 *   - One-line structural thesis per regime (our own honest text, not predictive)
 *   - Stability % + bar
 *   - Gravity direction + up/down pct
 *   - Pin target + probability (if present)
 *   - Cascade / upside trigger levels (if present)
 *   - Structural range
 *   - ALWAYS shows passport caveat chip
 *   - When gexstate absent → compact placeholder
 *
 * HONESTY DOCTRINE (non-negotiable):
 *   - Passport caveat chip is always visible.
 *   - Single-name near-constant note shown when is_index_product=false.
 *   - Regime theses are structural descriptions — not trade forecasts.
 *   - No "validated", "predictive", or direction-assertive copy.
 *
 * Props:
 *   statePayload  — FUTURE /api/flow?f=gexstate:<ROOT> (schema v1) | null
 *   isIndexProduct — whether the root is an index ETF (affects passport text)
 *   lang          — "en" | "zh"
 */

import React from "react";
import { makeGexT } from "./gexStrings";
import type { Lang } from "@/lib/i18n";
import { RingGauge } from "@/components/ui/RingGauge";

// ─── Schema (FUTURE gexstate/v1 — handle gracefully when absent) ─────────────

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
    confidence: number;           // 0-1
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
}

// ─── Regime colors (matching GEX spec §6) ─────────────────────────────────────

const REGIME_COLORS: Record<string, string> = {
  PIN:        "var(--up)",
  DRIFT:      "var(--brand-2)",
  RANGE:      "var(--brand-2)",
  TRANSITION: "var(--signal)",
  TREND:      "var(--down)",
  CASCADE:    "var(--down)",
  UNKNOWN:    "var(--muted)",
};

// ─── Component ────────────────────────────────────────────────────────────────

interface MarketStateCardProps {
  statePayload: GexStatePayload | null;
  isIndexProduct: boolean;
  lang: Lang;
}

export function MarketStateCard({
  statePayload,
  isIndexProduct,
  lang,
}: MarketStateCardProps) {
  const t = makeGexT(lang);

  // ── Passport caveat (always shown) ──────────────────────────────────────────
  const passportText = t("passportIndex");
  const singleNameNote = !isIndexProduct ? t("passportSingleName") : null;
  const gateNote = t("passportGate");

  if (!statePayload) {
    return (
      <div className="obs-card" style={CARD_OUTER} data-tut="gex-state-card">
        <div className="obs-card-hd" style={CARD_HEADER}>
          <span className="obs-lbl">{t("stateTitle")}</span>
        </div>
        <div style={PLACEHOLDER}>
          <span style={PLACEHOLDER_TEXT}>{t("stateComputing")}</span>
        </div>
        {/* Passport — always present */}
        <PassportBlock
          passportText={passportText}
          singleNameNote={singleNameNote}
          gateNote={gateNote}
        />
      </div>
    );
  }

  const state = statePayload.state;
  const regimeColor = REGIME_COLORS[state] ?? "var(--muted)";

  // Thesis key — keys in gexStrings are uppercased: thesisPIN, thesisDRIFT, etc.
  const thesisKey = (`thesis${state}` as Parameters<typeof t>[0]);
  // Fallback: use thesisUNKNOWN key if key not in table (TypeScript won't catch dynamic key)
  const thesisText = t(thesisKey) || t("thesisUNKNOWN");

  const regimeLabel = t(`regime${state}` as Parameters<typeof t>[0]) || state;

  const stabilityPct = Math.round(statePayload.stability_pct ?? 0);
  const volPct = 100 - stabilityPct;

  const gravity = statePayload.gravity;
  const gravDir =
    gravity.direction === "up"
      ? t("stateGravityUp")
      : gravity.direction === "down"
      ? t("stateGravityDown")
      : t("stateGravityNeutral");
  const gravColor =
    gravity.direction === "up"
      ? "var(--up)"
      : gravity.direction === "down"
      ? "var(--down)"
      : "var(--signal)";

  const pin = statePayload.pin_target;
  const cascade = statePayload.cascade_trigger;
  const upside = statePayload.upside_trigger;
  const range = statePayload.structural_range;

  const netGammaLabel =
    statePayload.net_gamma === "POSITIVE"
      ? t("stateGammaPos")
      : statePayload.net_gamma === "NEGATIVE"
      ? t("stateGammaNeg")
      : "—";
  const netGammaColor =
    statePayload.net_gamma === "POSITIVE"
      ? "var(--brand-2)"
      : statePayload.net_gamma === "NEGATIVE"
      ? "var(--down)"
      : "var(--muted)";

  return (
    <div className="obs-card" style={CARD_OUTER} data-tut="gex-state-card">
      {/* Header: title + regime chip */}
      <div className="obs-card-hd" style={CARD_HEADER}>
        <span className="obs-lbl">{t("stateTitle")}</span>
        <span style={{ ...REGIME_CHIP, color: regimeColor, borderColor: `${regimeColor}55` }}>
          {regimeLabel}
        </span>
      </div>

      {/* Thesis */}
      <div style={THESIS}>{thesisText}</div>

      {/* Stability ring (Observatory signature) */}
      <div style={STAB_RING_ROW}>
        <RingGauge
          value={stabilityPct}
          size="md"
          tone={statePayload.net_gamma === "POSITIVE" ? "brand" : statePayload.net_gamma === "NEGATIVE" ? "down" : "muted"}
          label={t("stateStability")}
        />
        <div style={STAB_META}>
          <div style={METRIC_ROW}>
            <span className="obs-lbl">{t("stateNetGamma")}</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: netGammaColor }}>{netGammaLabel}</span>
          </div>
          <div style={METRIC_ROW}>
            <span className="obs-lbl">{t("stateGravity")}</span>
            <span style={{ fontSize: 11, fontVariantNumeric: "tabular-nums" }}>
              <span style={{ color: gravColor, fontWeight: 600 }}>{gravDir}</span>
              {" "}
              <span className="num" style={{ color: "var(--text-2)", fontSize: 10 }}>
                +{gravity.up_pct}% / -{gravity.down_pct}%
              </span>
            </span>
          </div>
        </div>
      </div>

      <div className="obs-card-hr" />

      {/* Pin target */}
      <div style={METRIC_ROW_PAD}>
        <span className="obs-lbl">{t("statePinTarget")}</span>
        <span style={{ fontSize: 11, fontVariantNumeric: "tabular-nums" }}>
          {pin ? (
            <>
              <span className="num" style={{ color: "var(--cat-2)", fontWeight: 700 }}>
                {pin.strike % 1 === 0 ? pin.strike : pin.strike.toFixed(1)}
              </span>
              {" "}
              <span style={{ color: "var(--muted)", fontSize: 10 }}>
                {t("statePinProb")} {pin.probability}%
              </span>
            </>
          ) : (
            <span style={{ color: "var(--muted)" }}>{t("statePinNone")}</span>
          )}
        </span>
      </div>

      {/* Cascade trigger */}
      {cascade && cascade.confidence >= 0.4 && (
        <div style={METRIC_ROW_PAD}>
          <span className="obs-lbl">{t("stateCascadeTrigger")}</span>
          <span className="num" style={{ color: "var(--down)", fontWeight: 700, fontSize: 11 }}>
            {cascade.strike % 1 === 0 ? cascade.strike : cascade.strike.toFixed(1)}
          </span>
        </div>
      )}

      {/* Upside trigger */}
      {upside && upside.confidence >= 0.4 && (
        <div style={METRIC_ROW_PAD}>
          <span className="obs-lbl">{t("stateUpsideTrigger")}</span>
          <span className="num" style={{ color: "var(--up)", fontWeight: 700, fontSize: 11 }}>
            {upside.strike % 1 === 0 ? upside.strike : upside.strike.toFixed(1)}
          </span>
        </div>
      )}

      {/* Structural range */}
      {range && (
        <div style={METRIC_ROW_PAD}>
          <span className="obs-lbl">{t("stateRange")}</span>
          <span className="num" style={{ fontSize: 11, color: "var(--text-2)" }}>
            {range.low % 1 === 0 ? range.low : range.low.toFixed(1)}
            {" — "}
            {range.high % 1 === 0 ? range.high : range.high.toFixed(1)}
          </span>
        </div>
      )}

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
      <div className="obs-note" style={{ margin: "0 0 0 0", padding: "8px 10px", fontSize: 10, lineHeight: 1.5, borderRadius: 8 }}>
        {passportText}
        {singleNameNote && (
          <><br />{singleNameNote}</>
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
  borderRadius: 0,    // flush panel — .obs-card radius is overridden for side panel
  display: "flex",
  flexDirection: "column",
  minWidth: 220,
  width: 260,
  flexShrink: 0,
  overflowY: "auto",
};

const CARD_HEADER: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const REGIME_CHIP: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  border: "1px solid",
  borderRadius: "var(--r-pill)",
  padding: "2px 7px",
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

const THESIS: React.CSSProperties = {
  fontSize: 11,
  color: "var(--text-2)",
  lineHeight: 1.5,
  padding: "8px 14px",
  fontStyle: "italic",
};

/** Ring + meta side by side */
const STAB_RING_ROW: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 14,
  padding: "10px 14px",
};

const STAB_META: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  flex: 1,
  minWidth: 0,
};

const METRIC_ROW: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 6,
};

/** Padded metric row used below the separator */
const METRIC_ROW_PAD: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "4px 14px",
  gap: 8,
};

const PASSPORT_BLOCK: React.CSSProperties = {
  padding: "8px 10px",
  marginTop: "auto",
};
