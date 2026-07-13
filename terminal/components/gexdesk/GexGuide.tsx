"use client";
/**
 * GexGuide — collapsible HOW-TO-READ drawer for the GEX Desk.
 *
 * Content adapted from gex_ui_spec.md §8 and gex_FEATURE_SPEC.md §4.2, but
 * rewritten to OUR epistemics:
 *   - Sign is the dealer convention (an assumption), magnitude is the reliable read.
 *   - Levels are structural descriptions, not forecasts.
 *   - Single-name GEX regime fragility is disclosed.
 *   - No "validated", "predictive", or directional trade-signal language.
 *
 * Layout: collapsed = color legend dots only.
 *         expanded = 4-column grid of concept cards.
 */

import React, { useState } from "react";
import { makeGexT } from "./gexStrings";
import type { Lang } from "@/lib/i18n";

interface GexGuideProps {
  lang: Lang;
}

interface ConceptCard {
  dot: string;
  termKey: Parameters<ReturnType<typeof makeGexT>>[0];
  bodyKey: Parameters<ReturnType<typeof makeGexT>>[0];
}

const CONCEPT_CARDS: ConceptCard[] = [
  { dot: "var(--brand-2)",  termKey: "guideGexTerm",         bodyKey: "guideGexBody" },
  { dot: "var(--brand-2)",  termKey: "guideCallWallTerm",    bodyKey: "guideCallWallBody" },
  { dot: "var(--down)",     termKey: "guidePutSupportTerm",  bodyKey: "guidePutSupportBody" },
  { dot: "var(--signal)",   termKey: "guideMagnetTerm",      bodyKey: "guideMagnetBody" },
  { dot: "var(--cat-2)",    termKey: "guideFlipTerm",        bodyKey: "guideFlipBody" },
  { dot: "var(--text-2)",   termKey: "guideRegimeTerm",      bodyKey: "guideRegimeBody" },
  { dot: "var(--muted)",    termKey: "guideDealerSignTerm",  bodyKey: "guideDealerSignBody" },
];

const LEGEND_DOTS: { color: string; labelKey: Parameters<ReturnType<typeof makeGexT>>[0] }[] = [
  { color: "var(--brand-2)",  labelKey: "ladderNetGex" },
  { color: "var(--down)",     labelKey: "sumPutSupport" },
  { color: "var(--signal)",   labelKey: "sumMagnet" },
  { color: "var(--cat-2)",    labelKey: "sumFlip" },
];

export function GexGuide({ lang }: GexGuideProps) {
  const t = makeGexT(lang);
  const [open, setOpen] = useState(false);

  return (
    <div style={GUIDE_OUTER}>
      {/* ── Collapsed legend + toggle ─────────────────────────────────────── */}
      <div style={LEGEND_ROW}>
        {/* Color dots */}
        <div style={DOTS_ROW}>
          {LEGEND_DOTS.map((d) => (
            <span key={d.labelKey} style={DOT_ITEM}>
              <span style={{ ...DOT, background: d.color }} />
              <span style={DOT_LABEL}>{t(d.labelKey)}</span>
            </span>
          ))}
        </div>

        {/* Toggle button */}
        <button
          style={TOGGLE_BTN}
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          {open ? t("guideToggleClose") : t("guideToggleOpen")}
        </button>
      </div>

      {/* ── Expanded concept cards ────────────────────────────────────────── */}
      {open && (
        <div style={CARDS_GRID}>
          {CONCEPT_CARDS.map((c) => (
            <div key={c.termKey} style={CONCEPT_CARD}>
              <div style={CONCEPT_HEADER}>
                <span style={{ ...CONCEPT_DOT, background: c.dot }} />
                <span style={CONCEPT_TERM}>{t(c.termKey)}</span>
              </div>
              <p style={CONCEPT_BODY}>{t(c.bodyKey)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const GUIDE_OUTER: React.CSSProperties = {
  borderTop: "1px solid var(--line-2)",
  background: "var(--panel)",
  flexShrink: 0,
};

const LEGEND_ROW: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  padding: "5px 12px",
  gap: 12,
  flexWrap: "wrap",
};

const DOTS_ROW: React.CSSProperties = {
  display: "flex",
  gap: 10,
  flex: 1,
  flexWrap: "wrap",
  alignItems: "center",
};

const DOT_ITEM: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 4,
};

const DOT: React.CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: "50%",
  flexShrink: 0,
};

const DOT_LABEL: React.CSSProperties = {
  fontSize: 10,
  color: "var(--text-2)",
};

const TOGGLE_BTN: React.CSSProperties = {
  fontSize: 10,
  color: "var(--brand-2)",
  background: "none",
  border: "none",
  cursor: "pointer",
  padding: "2px 0",
  letterSpacing: "0.04em",
  fontWeight: 600,
  flexShrink: 0,
  whiteSpace: "nowrap",
};

const CARDS_GRID: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
  gap: 8,
  padding: "8px 12px 12px",
  borderTop: "1px solid var(--line-2)",
};

const CONCEPT_CARD: React.CSSProperties = {
  background: "var(--panel-2)",
  border: "1px solid var(--line)",
  borderRadius: "var(--r-md)",
  padding: "8px 10px",
};

const CONCEPT_HEADER: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  marginBottom: 5,
};

const CONCEPT_DOT: React.CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: "50%",
  flexShrink: 0,
};

const CONCEPT_TERM: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "var(--text)",
};

const CONCEPT_BODY: React.CSSProperties = {
  fontSize: 10,
  color: "var(--text-2)",
  lineHeight: 1.5,
  margin: 0,
};
