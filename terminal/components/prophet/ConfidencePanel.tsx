"use client";
/**
 * ConfidencePanel — the conviction column's verdict block.
 *
 * Fused verdict row (score · recommended verb) → stacked component mix → per-component
 * rows → change reason. The old 84px ring is gone: it spent the column's best real estate
 * repeating a number the verdict row already states at 34px.
 *
 * HONESTY DOCTRINE (non-negotiable):
 *   - Header VERBATIM: "Management confidence — trade state, not a pick rank"
 *   - Ceiling 92 is VISIBLE — the score is always shown against its cap.
 *   - No predictive language; no "validated".
 *   - Component bar tooltips are factual descriptions of what each measures.
 *   - Components absent from the payload say so — they never render as zeroes.
 *   - change_reason rendered verbatim (engine text).
 *   - recommended_action rendered verbatim with a translated label.
 */

import { useState } from "react";
import { makeProphetT } from "./prophetStrings";
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

/**
 * Stepped brand tints — one per component, in declaration order. The stack is a MIX, not
 * a sum: segment width is each component's share of the five scores, so the steps read as
 * "different component", never as "different quality".
 */
const SEGMENT_MIX = [92, 76, 60, 46, 34];

function segmentColor(i: number, negative: boolean): string {
  if (negative) return "color-mix(in srgb, var(--down) 62%, transparent)";
  const mix = SEGMENT_MIX[i] ?? 34;
  return `color-mix(in srgb, var(--brand-2) ${mix}%, transparent)`;
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

  const componentDefs: {
    key: keyof ConfidenceComponents;
    labelKey: Parameters<typeof t>[0];
    tipKey: Parameters<typeof t>[0];
  }[] = [
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
  const actionKey = recommended_action ? recommended_action.toLowerCase() : null;
  const actionDisplay = actionKey ? (actionMap[actionKey] ?? recommended_action) : null;

  const actionColor = actionKey === "exit" || actionKey === "invalidated"
    ? "var(--down)"
    : actionKey === "enter" || actionKey === "hold" || actionKey === "trail"
    ? "var(--up)"
    : "var(--text-2)";

  // Stacked mix — only the components the payload actually published.
  const present = components
    ? componentDefs
        .map((d, i) => ({ ...d, i, value: components[d.key] }))
        .filter((d): d is typeof d & { value: number } => typeof d.value === "number" && Number.isFinite(d.value))
    : [];
  const mixTotal = present.reduce((s, d) => s + Math.abs(d.value), 0);

  return (
    <div className="obs-prophet-verdictbox">
      {/* Fused verdict: score, ceiling and the verb it implies, on one baseline. */}
      <div className="obs-prophet-verdict">
        {confidence != null ? (
          <>
            <span className="obs-prophet-verdict-score num">{confidence.toFixed(0)}</span>
            <span className="obs-prophet-verdict-max num">/ {CEILING}</span>
          </>
        ) : (
          <span className="obs-prophet-verdict-none">{t("verdictNoScore")}</span>
        )}
        {actionDisplay && (
          <span
            className="obs-prophet-verdict-verb"
            style={{ "--c": actionColor } as React.CSSProperties}
          >
            · {actionDisplay}
          </span>
        )}
        {phaseDisplay && (
          <span className="obs-tag obs-prophet-verdict-phase">{phaseDisplay}</span>
        )}
      </div>

      <div className="fin-asof obs-prophet-ceil">
        <span>{t("confidenceCeil")}</span>
        <span aria-hidden>·</span>
        <span>{t("confidenceCeilNote")}</span>
      </div>

      {/* The doctrine sentence, kept verbatim where the score is read. */}
      <div className="obs-note obs-prophet-conv-note">{t("confidenceHeader")}</div>

      {/* Component mix — stacked bar + the rows that name every segment. */}
      {present.length > 0 && mixTotal > 0 ? (
        <div className="obs-prophet-mix">
          <div className="obs-prophet-mix-hd">
            <span className="fin-eyebrow">{t("componentMixLabel")}</span>
          </div>
          <div className="obs-prophet-mix-bar" aria-hidden>
            {present.map((d) => (
              <span
                key={d.key}
                style={{
                  width: `${(Math.abs(d.value) / mixTotal) * 100}%`,
                  background: segmentColor(d.i, d.value < 0),
                }}
              />
            ))}
          </div>
          <div className="obs-prophet-mix-cap">{t("componentMixCaption")}</div>
          <div className="obs-prophet-mix-rows">
            {present.map((d) => (
              <ComponentBar
                key={d.key}
                label={t(d.labelKey)}
                tooltip={t(d.tipKey)}
                value={d.value}
                color={segmentColor(d.i, d.value < 0)}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="obs-prophet-mix-absent">{t("componentsAbsent")}</div>
      )}

      {/* Change reason */}
      {change_reason && (
        <div className="obs-prophet-reason">
          <span className="k">{t("changeReasonLabel")}</span>
          <span>{change_reason}</span>
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
  color,
}: {
  label: string;
  tooltip: string;
  value: number | null;
  color: string;
}) {
  const [tipVisible, setTipVisible] = useState(false);
  const pct = value != null ? Math.max(0, Math.min(100, value)) : null;

  return (
    <div className="obs-prophet-comp">
      <span
        className="obs-prophet-comp-k"
        onMouseEnter={() => setTipVisible(true)}
        onMouseLeave={() => setTipVisible(false)}
        onFocus={() => setTipVisible(true)}
        onBlur={() => setTipVisible(false)}
        tabIndex={0}
        aria-label={tooltip}
      >
        {label}
        {tipVisible && <span className="obs-prophet-comp-tip">{tooltip}</span>}
      </span>
      <span className="obs-prophet-comp-track">
        {pct != null && (
          <span className="obs-prophet-comp-fill" style={{ width: `${pct}%`, background: color }} />
        )}
      </span>
      <span className="obs-prophet-comp-v num">{value != null ? value.toFixed(0) : "—"}</span>
    </div>
  );
}
