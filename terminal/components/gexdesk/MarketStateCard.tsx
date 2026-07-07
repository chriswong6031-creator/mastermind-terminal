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
      <div style={CARD_OUTER} data-tut="gex-state-card">
        <div style={CARD_HEADER}>
          <span style={CARD_TITLE}>{t("stateTitle")}</span>
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
    <div style={CARD_OUTER} data-tut="gex-state-card">
      <div style={CARD_HEADER}>
        <span style={CARD_TITLE}>{t("stateTitle")}</span>
        <span style={{ ...REGIME_CHIP, color: regimeColor, borderColor: `${regimeColor}55` }}>
          {regimeLabel}
        </span>
      </div>

      {/* Thesis */}
      <div style={THESIS}>{thesisText}</div>

      {/* Net gamma badge */}
      <div style={METRIC_ROW}>
        <span style={METRIC_KEY}>{t("stateNetGamma")}</span>
        <span style={{ ...METRIC_VAL, color: netGammaColor }}>{netGammaLabel}</span>
      </div>

      {/* Stability bar */}
      <div style={METRIC_SECTION}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
          <span style={METRIC_KEY}>{t("stateStability")}</span>
          <span style={{ fontSize: 10, color: "var(--text-2)", fontVariantNumeric: "tabular-nums" }}>
            {stabilityPct}% · {volPct}% vol
          </span>
        </div>
        <div style={STAB_TRACK}>
          <div
            style={{
              ...STAB_FILL,
              width: `${stabilityPct}%`,
              background:
                statePayload.net_gamma === "POSITIVE"
                  ? "var(--brand-2)"
                  : statePayload.net_gamma === "NEGATIVE"
                  ? "rgba(240,86,107,0.6)"
                  : "var(--muted)",
            }}
          />
        </div>
      </div>

      {/* Gravity */}
      <div style={METRIC_ROW}>
        <span style={METRIC_KEY}>{t("stateGravity")}</span>
        <span style={{ fontSize: 11, fontVariantNumeric: "tabular-nums" }}>
          <span style={{ color: gravColor, fontWeight: 600 }}>{gravDir}</span>
          {" "}
          <span style={{ color: "var(--text-2)" }}>
            +{gravity.up_pct}% / -{gravity.down_pct}%
          </span>
        </span>
      </div>

      <div style={SEPARATOR} />

      {/* Pin target */}
      <div style={METRIC_ROW}>
        <span style={METRIC_KEY}>{t("statePinTarget")}</span>
        <span style={{ fontSize: 11, fontVariantNumeric: "tabular-nums" }}>
          {pin ? (
            <>
              <span style={{ color: "var(--cat-2)", fontWeight: 700 }}>
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

      {/* Cascade trigger (only if relevant state + confidence) */}
      {cascade && cascade.confidence >= 0.4 && (
        <div style={METRIC_ROW}>
          <span style={METRIC_KEY}>{t("stateCascadeTrigger")}</span>
          <span style={{ color: "var(--down)", fontWeight: 700, fontVariantNumeric: "tabular-nums", fontSize: 11 }}>
            {cascade.strike % 1 === 0 ? cascade.strike : cascade.strike.toFixed(1)}
          </span>
        </div>
      )}

      {/* Upside trigger */}
      {upside && upside.confidence >= 0.4 && (
        <div style={METRIC_ROW}>
          <span style={METRIC_KEY}>{t("stateUpsideTrigger")}</span>
          <span style={{ color: "var(--up)", fontWeight: 700, fontVariantNumeric: "tabular-nums", fontSize: 11 }}>
            {upside.strike % 1 === 0 ? upside.strike : upside.strike.toFixed(1)}
          </span>
        </div>
      )}

      {/* Structural range */}
      {range && (
        <div style={METRIC_ROW}>
          <span style={METRIC_KEY}>{t("stateRange")}</span>
          <span style={{ fontSize: 11, color: "var(--text-2)", fontVariantNumeric: "tabular-nums" }}>
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
      <div style={PASSPORT_CHIP}>{passportText}</div>
      {singleNameNote && (
        <div style={{ ...PASSPORT_CHIP, marginTop: 3 }}>{singleNameNote}</div>
      )}
      <div style={{ ...PASSPORT_CHIP, marginTop: 3, color: "var(--muted)", borderColor: "var(--line)" }}>
        {gateNote}
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const CARD_OUTER: React.CSSProperties = {
  background: "var(--panel)",
  borderLeft: "1px solid var(--line)",
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
  padding: "10px 12px 6px",
  borderBottom: "1px solid var(--line-2)",
};

const CARD_TITLE: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "var(--text)",
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  flex: 1,
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
  padding: "8px 12px",
  borderBottom: "1px solid var(--line-2)",
  fontStyle: "italic",
};

const METRIC_SECTION: React.CSSProperties = {
  padding: "7px 12px",
};

const METRIC_ROW: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "4px 12px",
  gap: 8,
};

const METRIC_KEY: React.CSSProperties = {
  fontSize: 10,
  color: "var(--muted)",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  fontWeight: 600,
  flexShrink: 0,
};

const METRIC_VAL: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.04em",
};

const STAB_TRACK: React.CSSProperties = {
  height: 4,
  background: "var(--panel-3)",
  borderRadius: 2,
  overflow: "hidden",
};

const STAB_FILL: React.CSSProperties = {
  height: "100%",
  borderRadius: 2,
  transition: "width 0.4s ease",
};

const SEPARATOR: React.CSSProperties = {
  height: 1,
  background: "var(--line-2)",
  margin: "4px 0",
};

const PASSPORT_BLOCK: React.CSSProperties = {
  padding: "8px 12px",
  borderTop: "1px solid var(--line-2)",
  marginTop: "auto",
};

const PASSPORT_CHIP: React.CSSProperties = {
  fontSize: 9,
  color: "var(--text-2)",
  fontWeight: 600,
  border: "1px solid var(--line-3)",
  borderRadius: "var(--r)",
  padding: "3px 7px",
  lineHeight: 1.4,
};
