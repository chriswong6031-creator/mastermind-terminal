"use client";
/**
 * LensBar — lens selector for the PRISM matrix.
 *
 * Active lenses: GEX | OI | VOL | ΔOI
 * Rendered-disabled with honest tooltips: VEX ("experimental — deferred"), UNUSUAL ("accruing baseline")
 *
 * Keyboard shortcuts: 1=GEX, 2=OI, 3=VOL, 4=ΔOI (matches spec §2.10 adapted to our 4 active lenses)
 *
 * ΔOI gets a small "PIT: OI[t-1]−OI[t-2]" caption below its button.
 *
 * HONESTY DOCTRINE:
 *   - VEX disabled because vanna data stability is unconfirmed (our_data_contracts §5).
 *   - UNUSUAL disabled because 30-day per-strike volume baseline must accrue before use.
 *   - Disabled states labeled honestly — not hidden.
 */

import React, { useEffect, useCallback } from "react";
import { makePrismT } from "./prismStrings";
import type { Lang } from "@/lib/i18n";

export type ActiveLens = "GEX" | "OI" | "VOL" | "DOI";

interface LensBarProps {
  activeLens: ActiveLens;
  onLens: (lens: ActiveLens) => void;
  lang: Lang;
}

const ACTIVE_LENSES: { key: ActiveLens; labelKey: "lensGex" | "lensOi" | "lensVol" | "lensDoi"; shortcut: string }[] = [
  { key: "GEX", labelKey: "lensGex", shortcut: "1" },
  { key: "OI",  labelKey: "lensOi",  shortcut: "2" },
  { key: "VOL", labelKey: "lensVol", shortcut: "3" },
  { key: "DOI", labelKey: "lensDoi", shortcut: "4" },
];

export function LensBar({ activeLens, onLens, lang }: LensBarProps) {
  const t = makePrismT(lang);

  // Keyboard shortcuts 1-4 for active lenses
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const lensMap: Record<string, ActiveLens> = {
        "1": "GEX", "2": "OI", "3": "VOL", "4": "DOI",
      };
      const next = lensMap[e.key];
      if (next) onLens(next);
    },
    [onLens]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div style={BAR_OUTER}>
      {/* Active lenses */}
      {ACTIVE_LENSES.map(({ key, labelKey, shortcut }) => {
        const isActive = activeLens === key;
        const isGex = key === "GEX";
        const isDoi = key === "DOI";
        return (
          <div key={key} style={LENS_WRAP}>
            <button
              style={{
                ...LENS_BTN,
                ...(isActive ? (isGex ? LENS_ACTIVE_GEX : LENS_ACTIVE_FLOW) : {}),
              }}
              onClick={() => onLens(key)}
              aria-label={`${t(labelKey)} (${shortcut})`}
              aria-pressed={isActive}
            >
              <span>{t(labelKey)}</span>
              <span style={SHORTCUT_HINT}>{shortcut}</span>
            </button>
            {isDoi && (
              <span style={DOI_CAPTION}>{t("doiCaption")}</span>
            )}
          </div>
        );
      })}

      {/* Divider */}
      <div style={DIVIDER} />

      {/* VEX — disabled, "experimental — deferred" */}
      <div style={LENS_WRAP}>
        <button style={LENS_BTN_DISABLED} disabled aria-disabled="true">
          <span>{t("lensVex")}</span>
        </button>
        {/* Visible caption instead of title= (CI-guarded against translated title=) */}
        <span style={DISABLED_CAPTION}>{t("lensVexDisabled")}</span>
      </div>

      {/* UNUSUAL — disabled, "accruing baseline" */}
      <div style={LENS_WRAP}>
        <button style={LENS_BTN_DISABLED} disabled aria-disabled="true">
          <span>{t("lensUnusual")}</span>
        </button>
        <span style={DISABLED_CAPTION}>{t("lensUnusualDisabled")}</span>
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const BAR_OUTER: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 4,
  padding: "0 14px",
  flexWrap: "wrap",
};

const LENS_WRAP: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 2,
};

const LENS_BTN: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 5,
  padding: "4px 10px",
  height: 28,
  background: "var(--panel-3)",
  border: "1px solid var(--line)",
  borderRadius: "var(--r-md)",
  color: "var(--text-2)",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.06em",
  cursor: "pointer",
  transition: "background 0.12s, border-color 0.12s, color 0.12s",
};

const LENS_ACTIVE_GEX: React.CSSProperties = {
  background: "rgba(77,130,255,0.15)",
  borderColor: "var(--brand-2)",
  color: "var(--brand-2)",
};

const LENS_ACTIVE_FLOW: React.CSSProperties = {
  background: "rgba(77,210,200,0.12)",
  borderColor: "rgba(77,210,200,0.7)",
  color: "rgb(77,210,200)",
};

const SHORTCUT_HINT: React.CSSProperties = {
  fontSize: 8,
  color: "var(--muted)",
  letterSpacing: "0.02em",
  fontWeight: 400,
};

const LENS_BTN_DISABLED: React.CSSProperties = {
  ...LENS_BTN,
  opacity: 0.38,
  cursor: "not-allowed",
  pointerEvents: "none",
};

const DISABLED_CAPTION: React.CSSProperties = {
  fontSize: 8,
  color: "var(--muted)",
  letterSpacing: "0.02em",
  textAlign: "center",
  maxWidth: 80,
  lineHeight: 1.2,
};

const DOI_CAPTION: React.CSSProperties = {
  fontSize: 8,
  color: "var(--muted)",
  letterSpacing: "0.02em",
  textAlign: "center",
  fontVariantNumeric: "tabular-nums",
};

const DIVIDER: React.CSSProperties = {
  width: 1,
  height: 28,
  background: "var(--line)",
  margin: "0 4px",
  alignSelf: "center",
};
