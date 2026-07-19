"use client";

/**
 * ArcGauge — v6 primitive. Replaces every speedometer / rainbow / hard-edged
 * conic "retro odometer". A single open 240° SVG arc with a round terminal cap,
 * a faint track, ONE state color, a soft drop-shadow glow, and a mono numeral at
 * the center. The arc SWEEPS in on mount / value change (CSS transition on
 * stroke-dashoffset). prefers-reduced-motion kills the sweep.
 *
 * Law: the STATE picks the color — never a red→green gradient across the arc.
 *   bull → var(--up)   bear → var(--down)   warn → var(--signal)
 *   neutral → var(--text-2)  ("no signal" reads as grey, never red).
 * Directional states route through --up/--down so the East-Asian red-up flip
 * (html[data-updown="east"]) is honoured for free.
 *
 * Usage:
 *   <ArcGauge value={72} state="bull" label="Buy pressure" />
 *   <ArcGauge value={48} state="neutral" label="Insider" sublabel="routine only" />
 */

import { useEffect, useRef, useState } from "react";

export type ArcState = "bull" | "bear" | "warn" | "neutral";

export interface ArcGaugeProps {
  /** 0–100 fill of the 240° sweep. */
  value: number;
  state: ArcState;
  /** Outer diameter in px (default 120). */
  size?: number;
  label?: string;
  sublabel?: string;
  /** Show the center numeral (default true). */
  showValue?: boolean;
}

/** The visible arc spans 240° (a 120° gap at the bottom, symmetric). */
export const ARC_SWEEP_DEG = 240;

/** Map a semantic state to its single design-system color variable. */
export function arcStateColor(state: ArcState): string {
  switch (state) {
    case "bull": return "var(--up)";
    case "bear": return "var(--down)";
    case "warn": return "var(--signal)";
    case "neutral":
    default: return "var(--text-2)";
  }
}

/** Clamp an arbitrary input to a 0–100 gauge value (NaN → 0). */
export function clampArcValue(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

/**
 * Geometry for the arc stroke. Given the SVG radius, returns the dasharray
 * (length of the full 240° track) and the dashoffset for a 0–100 value
 * (offset shrinks as value grows → the fill sweeps clockwise from the left tip).
 */
export function arcGeometry(radius: number, value: number) {
  const full = 2 * Math.PI * radius;                 // full circle circumference
  const arcLen = full * (ARC_SWEEP_DEG / 360);       // length of the visible 240° track
  const pct = clampArcValue(value) / 100;
  const offset = arcLen * (1 - pct);                 // remaining (unfilled) length
  return { full, arcLen, offset };
}

export function ArcGauge({
  value,
  state,
  size = 120,
  label,
  sublabel,
  showValue = true,
}: ArcGaugeProps) {
  const v = clampArcValue(value);
  const color = arcStateColor(state);

  // Geometry. Stroke sits inside the box with padding = strokeWidth/2 + glow room.
  const stroke = Math.max(6, Math.round(size * 0.075));
  const pad = stroke / 2 + 4;
  const radius = size / 2 - pad;
  const cx = size / 2;
  const cy = size / 2;
  const { arcLen, offset } = arcGeometry(radius, v);

  // The 240° arc is centered at the bottom gap: start at 150°, sweep to 30°
  // (i.e. rotate the SVG so the gap is bottom-center). We draw a full-circle
  // <circle> and reveal 240° of it via dasharray; a -90° base rotation plus a
  // 60° start offset lands the gap symmetrically at the bottom.
  const rotation = 90 + (360 - ARC_SWEEP_DEG) / 2; // = 90 + 60 = 150°

  // Sweep-in: start collapsed (offset = full arc = empty) then transition to the
  // real offset on mount. prefers-reduced-motion → jump straight to final.
  const [drawn, setDrawn] = useState(false);
  const reduce = useRef(false);
  useEffect(() => {
    reduce.current =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce.current) { setDrawn(true); return; }
    const id = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(id);
  }, []);
  // Re-arm the sweep when the value changes materially (keeps the "arc grows to
  // the new reading" feel rather than snapping).
  useEffect(() => { if (reduce.current) setDrawn(true); }, [v]);

  const shownOffset = drawn || reduce.current ? offset : arcLen;

  return (
    <span
      className="arcg"
      style={{ width: size, display: "inline-flex", flexDirection: "column", alignItems: "center", gap: label ? 6 : 0 }}
      role="img"
      aria-label={`${label ? label + ": " : ""}${Math.round(v)} of 100`}
    >
      <span style={{ position: "relative", width: size, height: size * 0.82, display: "block" }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          style={{ position: "absolute", inset: 0, overflow: "visible" }}
        >
          <g transform={`rotate(${rotation} ${cx} ${cy})`}>
            {/* track — faint, non-directional */}
            <circle
              cx={cx}
              cy={cy}
              r={radius}
              fill="none"
              stroke="rgba(255,255,255,.07)"
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${arcLen} 9999`}
            />
            {/* progress — one state color, soft glow, animated sweep */}
            <circle
              cx={cx}
              cy={cy}
              r={radius}
              fill="none"
              stroke={color}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${arcLen} 9999`}
              strokeDashoffset={shownOffset}
              style={{
                transition: reduce.current
                  ? "none"
                  : "stroke-dashoffset 600ms var(--ease-out)",
                filter: `drop-shadow(0 0 5px color-mix(in srgb, ${color} 30%, transparent))`,
              }}
            />
          </g>
        </svg>
        {showValue && (
          <span
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 2,
              pointerEvents: "none",
            }}
          >
            <span
              className="num"
              style={{
                fontFamily: "var(--font-num)",
                fontWeight: 650,
                fontSize: Math.round(size * 0.26),
                letterSpacing: "-.01em",
                color: "var(--text)",
                lineHeight: 1,
              }}
            >
              {Math.round(v)}
            </span>
            {sublabel && (
              <span
                style={{
                  font: "600 var(--fs-micro)/1.2 var(--font-ui)",
                  letterSpacing: ".06em",
                  textTransform: "uppercase",
                  color: "var(--muted)",
                  maxWidth: size * 0.8,
                  textAlign: "center",
                }}
              >
                {sublabel}
              </span>
            )}
          </span>
        )}
      </span>
      {label && (
        <span
          style={{
            font: "600 var(--fs-micro)/1.2 var(--font-ui)",
            letterSpacing: ".08em",
            textTransform: "uppercase",
            color: "var(--muted)",
            textAlign: "center",
          }}
        >
          {label}
        </span>
      )}
    </span>
  );
}
