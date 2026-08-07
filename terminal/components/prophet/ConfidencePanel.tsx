"use client";
/**
 * ConfidencePanel — management-confidence arc + 5-component bars.
 *
 * HONESTY DOCTRINE (non-negotiable):
 *   - Header VERBATIM: "Management confidence — trade state, not a pick rank"
 *   - Ceiling 92 is VISIBLE — the arc stops visually at 92, and the cap label is shown.
 *   - No predictive language; no "validated".
 *   - Component bar tooltips are factual descriptions of what each measures.
 *   - change_reason rendered verbatim (engine text).
 *   - recommended_action rendered verbatim with a translated label.
 */

import { useState } from "react";
import { makeProphetT } from "./prophetStrings";
import { RingGauge } from "@/components/ui/RingGauge";
import type { Lang } from "@/lib/i18n";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ConfidenceComponents {
  validity:   number | null;
  progress:   number | null;
  pace:       number | null;
  retention:  number | null;
  overlay:    number | null;
}

interface ConfidencePanelProps {
  /** 0–92 — already capped at 92 by engine */
  confidence: number | null;
  components: ConfidenceComponents | null | undefined;
  phase: string | null | undefined;
  change_reason: string | null | undefined;
  recommended_action: string | null | undefined;
  lang: Lang;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CEILING = 92;

function barColor(val: number): string {
  if (val >= 70) return "var(--up)";
  if (val >= 40) return "var(--warn)";
  return "var(--down)";
}

// ── Component ──────────────────────────────────────────────────────────────────

export function ConfidencePanel({
  confidence,
  components,
  phase,
  change_reason,
  recommended_action,
  lang,
}: ConfidencePanelProps) {
  const t = makeProphetT(lang);

  const score = confidence ?? 0;

  const componentDefs: { key: keyof ConfidenceComponents; labelKey: Parameters<typeof t>[0]; tipKey: Parameters<typeof t>[0] }[] = [
    { key: "validity",  labelKey: "componentValidity",  tipKey: "componentTooltipValidity"  },
    { key: "progress",  labelKey: "componentProgress",  tipKey: "componentTooltipProgress"  },
    { key: "pace",      labelKey: "componentPace",      tipKey: "componentTooltipPace"      },
    { key: "retention", labelKey: "componentRetention", tipKey: "componentTooltipRetention" },
    { key: "overlay",   labelKey: "componentOverlay",   tipKey: "componentTooltipOverlay"   },
  ];

  // Phase label display
  const phaseDisplayMap: Record<string, string> = {
    pre_trigger:       t("phasePretrigger"),
    triggered_pre_t1:  t("phaseTriggered"),
    at_t1:             t("phaseAtT1"),
    between_t1_t2:     t("phaseBetweenT1T2"),
    at_t2:             t("phaseAtT2"),
    overtime:          t("phaseOvertime"),
    invalidated:       t("phaseInvalidated"),
  };
  const phaseDisplay = phase ? (phaseDisplayMap[phase] ?? phase) : null;

  // Action label display
  const actionMap: Record<string, string> = {
    wait:        t("actionWait"),
    enter:       t("actionEnter"),
    hold:        t("actionHold"),
    trim:        t("actionTrim"),
    trail:       t("actionTrail"),
    exit:        t("actionExit"),
    invalidated: t("actionInvalidated"),
  };
  const actionDisplay = recommended_action
    ? (actionMap[recommended_action.toLowerCase()] ?? recommended_action)
    : null;

  const actionColor = recommended_action === "exit" || recommended_action === "invalidated"
    ? "var(--down)"
    : recommended_action === "enter" || recommended_action === "hold" || recommended_action === "trail"
    ? "var(--up)"
    : "var(--text-2)";

  return (
    <div className="obs-card obs-prophet-confidence" style={PANEL_STYLE}>
      {/* Header — VERBATIM label required by spec */}
      <div style={HEADER}>
        <span style={HEADER_LABEL}>{t("confidenceHeader")}</span>
        {phaseDisplay && (
          <span style={PHASE_CHIP}>{phaseDisplay}</span>
        )}
      </div>

      {/* Ring gauge (lg) replaces SVG arc — cap-92 note preserved */}
      <div style={ARC_WRAPPER}>
        <RingGauge
          value={confidence != null ? score : 0}
          max={CEILING}
          size="lg"
          tone="auto"
        />
        {/* Ceiling note below ring */}
        <div style={CEIL_NOTE}>
          <span style={{ color: "var(--muted)", fontSize: 9 }}>{t("confidenceCeil")}</span>
          <span style={{ color: "var(--muted)", fontSize: 9, marginLeft: 4 }}>{t("confidenceCeilNote")}</span>
        </div>
        {/* Show raw score alongside scaled ring value */}
        {confidence != null && (
          <div style={{ fontSize: 11, color: "var(--text-2)", marginTop: 4 }}>
            <span className="num">{score.toFixed(0)}</span>
            <span style={{ color: "var(--muted)", fontSize: 9, marginLeft: 2 }}>/ {CEILING}</span>
          </div>
        )}
      </div>

      {/* Action chip */}
      {actionDisplay && (
        <div style={{ textAlign: "center", marginBottom: 10 }}>
          <span style={{ ...ACTION_CHIP, color: actionColor, borderColor: actionColor }}>
            {t("actionLabel")}: {actionDisplay}
          </span>
        </div>
      )}

      {/* Component bars */}
      {components && (
        <div style={BARS_WRAPPER}>
          {componentDefs.map(({ key, labelKey, tipKey }) => (
            <ComponentBar
              key={key}
              label={t(labelKey)}
              tooltip={t(tipKey)}
              value={components[key]}
            />
          ))}
        </div>
      )}

      {/* Change reason */}
      {change_reason && (
        <div style={REASON_BOX}>
          <span style={REASON_LABEL}>{t("changeReasonLabel")}: </span>
          <span style={REASON_TEXT}>{change_reason}</span>
        </div>
      )}
    </div>
  );
}

// ── ComponentBar ──────────────────────────────────────────────────────────────

function ComponentBar({
  label,
  tooltip,
  value,
}: {
  label: string;
  tooltip: string;
  value: number | null;
}) {
  const [tipVisible, setTipVisible] = useState(false);
  const pct = value != null ? Math.max(0, Math.min(100, value)) : null;

  return (
    <div style={{ marginBottom: 7 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
        <span
          style={{ ...BAR_LABEL, position: "relative", cursor: "help" }}
          onMouseEnter={() => setTipVisible(true)}
          onMouseLeave={() => setTipVisible(false)}
          aria-label={tooltip}
        >
          {label}
          {tipVisible && (
            <span style={BAR_TIP_STYLE}>{tooltip}</span>
          )}
        </span>
        <span style={BAR_VAL}>
          {pct != null ? `${pct.toFixed(0)}` : "—"}
        </span>
      </div>
      <div style={BAR_TRACK}>
        {pct != null && (
          <div
            style={{
              height: "100%",
              width: `${pct}%`,
              background: barColor(pct),
              borderRadius: "var(--r-pill)",
              transition: "width .35s ease",
            }}
          />
        )}
      </div>
    </div>
  );
}

// ── Style constants ───────────────────────────────────────────────────────────

// obs-card class provides glass background/border/radius
const PANEL_STYLE: React.CSSProperties = {
  padding: "12px 14px",
};

const HEADER: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 8,
  marginBottom: 10,
};

const HEADER_LABEL: React.CSSProperties = {
  font: "600 10px/1.3 var(--font-ui)",
  color: "var(--text-2)",
  maxWidth: 170,
};

const PHASE_CHIP: React.CSSProperties = {
  flexShrink: 0,
  font: "600 9.5px/1 var(--font-ui)",
  color: "var(--text-2)",
  border: "1px solid var(--line-2)",
  borderRadius: "var(--r-pill)",
  padding: "2px 7px",
  whiteSpace: "nowrap",
};

const ARC_WRAPPER: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  marginBottom: 8,
};

const CEIL_NOTE: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  marginTop: 4,
};

const ACTION_CHIP: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  font: "600 10px/1 var(--font-ui)",
  border: "1px solid",
  borderRadius: "var(--r-pill)",
  padding: "3px 9px",
};

const BARS_WRAPPER: React.CSSProperties = {
  marginTop: 8,
  paddingTop: 8,
  borderTop: "1px solid rgba(255,255,255,0.08)",
};

const BAR_LABEL: React.CSSProperties = {
  font: "500 10px/1 var(--font-ui)",
  color: "var(--text-2)",
};

const BAR_VAL: React.CSSProperties = {
  font: "600 10px/1 var(--font-num)",
  fontVariantNumeric: "tabular-nums",
  color: "var(--text)",
};

const BAR_TRACK: React.CSSProperties = {
  height: 4,
  background: "var(--line-2)",
  borderRadius: "var(--r-pill)",
  overflow: "hidden",
};

const BAR_TIP_STYLE: React.CSSProperties = {
  position: "absolute",
  top: "calc(100% + 5px)",
  left: 0,
  whiteSpace: "normal",
  maxWidth: 220,
  background: "var(--panel-3)",
  border: "1px solid var(--line-3)",
  borderRadius: "var(--r-md)",
  padding: "6px 9px",
  font: "500 10px/1.4 var(--font-ui)",
  color: "var(--text-2)",
  zIndex: 50,
  pointerEvents: "none",
  boxShadow: "var(--shadow-1)",
};

const REASON_BOX: React.CSSProperties = {
  marginTop: 10,
  paddingTop: 8,
  borderTop: "1px solid rgba(255,255,255,0.08)",
  font: "500 10px/1.45 var(--font-ui)",
  color: "var(--text-2)",
};

const REASON_LABEL: React.CSSProperties = {
  fontWeight: 600,
  color: "var(--muted)",
};

const REASON_TEXT: React.CSSProperties = {
  color: "var(--text-2)",
};
