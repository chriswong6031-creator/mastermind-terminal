"use client";
/**
 * DetailPanel.tsx — per-name drill panel.
 *
 * HONESTY DOCTRINE:
 *   - Net premium: magnitude only (not labeled call/put directional).
 *   - Tone: uses the `tone` field (ΔOI-based, reliable) — explicitly labeled soft.
 *   - Divergence chip: shown only when price direction AND flow tone both exceed
 *     dead-zones (|chg| > 0.05, tone != "neutral") and disagree.
 *     Copy: "price/flow divergence — magnitude read" — no bull/bear assertion.
 *   - No "validated", "predictive", or directional buy/sell language.
 *   - GEX regime: not shown in this panel (deferred to ~Sept 2026 gate).
 */

import React from "react";
import { makeHeatmapT } from "@/lib/heatmapStrings";
import { RingGauge } from "@/components/ui/RingGauge";
import type { HeatmapTile, Layer } from "./types";

interface DetailPanelProps {
  tile: HeatmapTile | null;
  layer: Layer;
  lang: "en" | "zh";
  onClose: () => void;
}

export function DetailPanel({ tile, layer, lang, onClose }: DetailPanelProps) {
  const t = makeHeatmapT(lang);
  const zh = lang === "zh";

  if (!tile) return null;

  const chgColor = tile.chg1d >= 0 ? "var(--up)" : "var(--down)";
  const chgStr = `${tile.chg1d >= 0 ? "+" : ""}${tile.chg1d.toFixed(2)}%`;

  // Divergence: both sides must exceed dead-zones (0.05 threshold) and disagree
  const priceUp = tile.chg1d > 0.05;
  const priceDn = tile.chg1d < -0.05;
  const tonePos = tile.tone === "pos";
  const toneNeg = tile.tone === "neg";
  const isDivergent = tile.hasFlow &&
    tile.tone !== "neutral" &&
    ((priceUp && toneNeg) || (priceDn && tonePos));

  // Tone label + color
  const toneLabel = tile.tone === "pos" ? t("tonePos")
    : tile.tone === "neg" ? t("toneNeg")
    : t("toneNeutral");
  const toneColor = tile.tone === "pos" ? "var(--up)"
    : tile.tone === "neg" ? "var(--down)"
    : "var(--muted)";

  // score ring for chg1d: map +/-4% to 0-100 for visual
  const chgScore = Math.max(0, Math.min(100, Math.round(50 + tile.chg1d * 10)));
  const chgTone = tile.chg1d >= 0 ? "up" : "down";

  return (
    <div className="obs-card" style={PANEL_WRAP}>
      {/* Header */}
      <div style={PANEL_HEADER}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <RingGauge value={chgScore} size="sm" tone={chgTone} />
          <div>
            <span style={TICKER_LABEL}>{tile.ticker}</span>
            {isDivergent && (
              <span style={DIV_CHIP}>{t("detailDivChip")}</span>
            )}
          </div>
        </div>
        <button
          onClick={onClose}
          style={CLOSE_BTN}
          aria-label={t("detailClose")}
        >
          ×
        </button>
      </div>

      <div style={{ color: "var(--text-2)", fontSize: 11, padding: "0 14px 8px", lineHeight: 1.3 }}>
        {tile.name}
      </div>

      {/* Price section */}
      <div style={SECTION}>
        <div style={SECTION_HEADER}>{zh ? "价格" : "Price"}</div>
        <Row label={t("detailPrice")} value={`$${tile.price.toFixed(2)}`} />
        <Row label={t("detailChg")} value={chgStr} valueColor={chgColor} />
        {tile.hi52 != null && (
          <Row label={zh ? "52周高" : "52w High"} value={`$${tile.hi52.toFixed(2)}`} />
        )}
        {tile.lo52 != null && (
          <Row label={zh ? "52周低" : "52w Low"} value={`$${tile.lo52.toFixed(2)}`} />
        )}
        <div style={DATA_NOTE}>{t("dataNote")}</div>
      </div>

      {/* Flow section */}
      {tile.hasFlow ? (
        <div style={SECTION}>
          <div style={SECTION_HEADER}>
            {zh ? "资金流" : "Flow"}
            <span style={{ fontSize: 9, color: "var(--muted)", marginLeft: 6, fontWeight: 400, fontStyle: "italic" }}>
              {t("flowDirSoft")}
            </span>
          </div>

          {tile.netPremiumMn != null && (
            <Row
              label={t("detailFlowPrem")}
              value={`$${tile.netPremiumMn.toFixed(2)}M`}
              note={zh ? "仅规模" : "magnitude only"}
            />
          )}

          <Row
            label={t("detailTone")}
            value={toneLabel}
            valueColor={toneColor}
            note={t("detailToneSoft")}
          />

          {tile.netDoi != null && (
            <Row label={t("detailNetDoi")} value={tile.netDoi.toFixed(0)} />
          )}

          {tile.doiPc != null && (
            <Row label={t("detailDoiPc")} value={tile.doiPc.toFixed(2)} />
          )}

          {tile.zerodte != null && (
            <Row
              label={t("detailZeroDte")}
              value={`${(tile.zerodte * 100).toFixed(1)}%`}
            />
          )}

          {tile.freshContracts != null && (
            <Row label={t("detailFreshCt")} value={tile.freshContracts.toString()} />
          )}

          {tile.posLean != null && (
            <Row
              label={t("detailLean")}
              value={tile.posLean}
              note={zh ? "稀疏，软性" : "sparse, soft"}
            />
          )}

          {tile.flowAsof && (
            <div style={{ fontSize: 9, color: "var(--muted)", marginTop: 4, paddingTop: 4, borderTop: "1px solid rgba(255,255,255,0.07)" }}>
              {t("detailAsof")}: {tile.flowAsof}
            </div>
          )}

          {/* Divergence explanation */}
          {isDivergent && (
            <div className="obs-note" style={{ marginTop: 8, marginBottom: 0 }}>
              <span style={{ fontWeight: 600 }}>
                {t("detailDivChip")}
              </span>
              <div style={{ marginTop: 4, fontSize: 10, lineHeight: 1.5 }}>
                {t("detailDivNote")}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div style={SECTION}>
          <div style={{ fontSize: 11, color: "var(--muted)", fontStyle: "italic" }}>
            {t("detailNoFlow")}
          </div>
        </div>
      )}

      {/* Honesty footer */}
      <div style={HONESTY_FOOTER}>
        {t("displayOnly")}
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Row({
  label,
  value,
  valueColor,
  note,
}: {
  label: string;
  value: string;
  valueColor?: string;
  note?: string;
}) {
  return (
    <div style={ROW_WRAP}>
      <span style={ROW_LABEL}>{label}</span>
      <span style={{ ...ROW_VALUE, color: valueColor ?? "var(--text)" }}>
        {value}
        {note && (
          <span style={{ marginLeft: 4, fontSize: 9, color: "var(--muted)", fontStyle: "italic" }}>
            {note}
          </span>
        )}
      </span>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const PANEL_WRAP: React.CSSProperties = {
  // obs-card class provides background/border/radius
  borderRadius: 0,
  borderTop: "1px solid rgba(255,255,255,0.09)",
  borderLeft: "none",
  borderRight: "none",
  borderBottom: "none",
  overflow: "auto",
  flexShrink: 0,
  maxHeight: 380,
};

const PANEL_HEADER: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "10px 14px 6px",
  borderBottom: "1px solid rgba(255,255,255,0.07)",
};

const TICKER_LABEL: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
  color: "var(--text)",
};

const CLOSE_BTN: React.CSSProperties = {
  fontSize: 18,
  color: "var(--muted)",
  cursor: "pointer",
  padding: "0 4px",
  lineHeight: 1,
  background: "none",
  border: "none",
};

const DIV_CHIP: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  background: "color-mix(in srgb, var(--warn) 15%, transparent)",
  color: "var(--warn)",
  borderRadius: 6,
  padding: "2px 6px",
  marginLeft: 6,
};

const SECTION: React.CSSProperties = {
  padding: "8px 14px",
  borderBottom: "1px solid rgba(255,255,255,0.07)",
};

const SECTION_HEADER: React.CSSProperties = {
  fontSize: 10.5,
  fontWeight: 600,
  color: "var(--muted)",
  textTransform: "uppercase",
  letterSpacing: "0.1em",
  marginBottom: 6,
  display: "flex",
  alignItems: "center",
};

const ROW_WRAP: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "baseline",
  marginBottom: 4,
};

const ROW_LABEL: React.CSSProperties = {
  fontSize: 11,
  color: "var(--text-2)",
};

const ROW_VALUE: React.CSSProperties = {
  fontSize: 12,
  fontVariantNumeric: "tabular-nums",
};

const DATA_NOTE: React.CSSProperties = {
  fontSize: 9,
  color: "var(--muted)",
  fontStyle: "italic",
  marginTop: 4,
};

const HONESTY_FOOTER: React.CSSProperties = {
  padding: "6px 14px",
  fontSize: 9,
  color: "var(--muted)",
  fontStyle: "italic",
  textAlign: "center",
};
