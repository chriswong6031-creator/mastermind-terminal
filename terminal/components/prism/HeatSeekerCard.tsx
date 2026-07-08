"use client";
/**
 * HeatSeekerCard — renders the artifact's heat_seeker pick.
 *
 * Shows: strike / expiry / lens / standout_ratio / confidence
 * Carries verbatim disclaimer: "descriptive — not a recommendation"
 * Hidden (with honest empty copy) when pick is null.
 *
 * Reads entirely from the artifact's heat_seeker field — no client-side gate logic.
 *
 * HONESTY DOCTRINE:
 *   - Disclaimer is non-removable and verbatim from spec.
 *   - No "buy/sell" language; no asserted direction.
 *   - When null: honest empty copy "No standout pick — load is shared."
 */

import React from "react";
import { makePrismT } from "./prismStrings";
import type { Lang } from "@/lib/i18n";
import { RingGauge } from "@/components/ui/RingGauge";

function expDate(exp: string): string {
  return (exp || "").split(" ")[0].split("T")[0];
}

// ─── Type (matches options_structure.matrix/v1 heat_seeker field) ─────────────

export interface HeatSeekerPick {
  strike: number;
  expiry: string;
  lens: string;
  standout_ratio: number;
  confidence: number;
  note?: string;
}

interface HeatSeekerCardProps {
  pick: HeatSeekerPick | null;
  spot: number | null;
  lang: Lang;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtStrike(s: number): string {
  return s % 1 === 0 ? `$${s}` : `$${s.toFixed(1)}`;
}

function fmtExpiry(exp: string): string {
  // "2026-07-18" -> "Jul 18"
  try {
    const d = new Date(expDate(exp) + "T12:00:00Z");
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return exp.slice(5);
  }
}

function dteDays(exp: string): number {
  try {
    const now = Date.now();
    const ms = new Date(expDate(exp) + "T20:00:00Z").getTime();
    return Math.max(0, Math.round((ms - now) / 86_400_000));
  } catch {
    return 0;
  }
}

function spotPct(strike: number, spot: number): string {
  const pct = ((strike - spot) / spot) * 100;
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

function confBar(conf: number): React.ReactNode {
  const pct = Math.round(Math.min(1, Math.max(0, conf)) * 100);
  return (
    <div style={CONF_BAR_TRACK}>
      <div
        style={{
          ...CONF_BAR_FILL,
          width: `${pct}%`,
          background:
            pct >= 60
              ? "rgba(232,179,57,0.75)"
              : pct >= 30
              ? "rgba(77,130,255,0.65)"
              : "rgba(120,120,140,0.5)",
        }}
      />
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function HeatSeekerCard({ pick, spot, lang }: HeatSeekerCardProps) {
  // Engine one-shot payloads can carry an expired pick; never surface those.
  {
    const raw = pick?.expiry ? new Date(expDate(pick.expiry) + "T20:00:00Z").getTime() : NaN;
    if (!Number.isFinite(raw) || raw < Date.now()) {
      return null;
    }
  }

  const t = makePrismT(lang);

  if (!pick) {
    return (
      <div className="obs-card" style={CARD_NULL}>
        <span style={NULL_STAR}>☆</span>
        <span style={NULL_TEXT}>{t("heatSeekerNull")}</span>
      </div>
    );
  }

  const dte = dteDays(pick.expiry);
  const pct = spot != null ? spotPct(pick.strike, spot) : null;
  const confPct = Math.round(pick.confidence * 100);

  return (
    <div className="obs-card" style={CARD_OUTER}>
      {/* Header */}
      <div className="obs-card-hd" style={CARD_HEADER}>
        <span style={PICK_STAR}>★</span>
        <span className="obs-lbl" style={{ flex: 1 }}>{t("heatSeekerTitle")}</span>
        <span style={CARD_LENS}>{pick.lens}</span>
      </div>

      {/* Disclaimer — verbatim, non-removable, always amber */}
      <div className="obs-note" style={DISCLAIMER_NOTE}>
        {t("heatSeekerDisclaimer")}
      </div>

      {/* Confidence ring + pick cells */}
      <div style={PICK_BODY}>
        <RingGauge
          value={confPct}
          size="md"
          tone="auto"
          label={t("heatSeekerConf")}
        />
        <div style={PICK_GRID}>
          <div style={PICK_CELL}>
            <span className="obs-lbl">{t("heatSeekerStrike")}</span>
            <span className="num" style={PICK_VALUE}>
              {fmtStrike(pick.strike)}
              {pct != null && (
                <span style={PCT_FROM_SPOT}> {pct}</span>
              )}
            </span>
          </div>
          <div style={PICK_CELL}>
            <span className="obs-lbl">{t("heatSeekerExpiry")}</span>
            <span className="num" style={PICK_VALUE}>
              {fmtExpiry(pick.expiry)}
              <span style={DTE_CHIP}>{dte === 0 ? "0DTE" : `${dte}d`}</span>
            </span>
          </div>
          <div style={PICK_CELL}>
            <span className="obs-lbl">{t("heatSeekerRatio")}</span>
            <span className="num" style={PICK_VALUE}>{pick.standout_ratio.toFixed(2)}×</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const CARD_OUTER: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 0,
};

const CARD_NULL: React.CSSProperties = {
  alignItems: "center",
  justifyContent: "center",
  padding: "14px 12px",
  gap: 6,
  opacity: 0.6,
  display: "flex",
  flexDirection: "column",
};

const NULL_STAR: React.CSSProperties = {
  fontSize: 16,
  color: "var(--muted)",
};

const NULL_TEXT: React.CSSProperties = {
  fontSize: 11,
  color: "var(--muted)",
  textAlign: "center",
  lineHeight: 1.4,
};

const CARD_HEADER: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
};

const DISCLAIMER_NOTE: React.CSSProperties = {
  margin: "0 10px 0",
  padding: "6px 10px",
  borderRadius: 8,
  fontSize: 10,
  lineHeight: 1.4,
};

const PICK_BODY: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "10px 12px 12px",
};

const PICK_STAR: React.CSSProperties = {
  fontSize: 13,
  color: "rgba(232,179,57,0.9)",
};

const CARD_TITLE: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "var(--text)",
  letterSpacing: "0.04em",
  flex: 1,
};

const CARD_LENS: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 800,
  color: "var(--brand-2)",
  letterSpacing: "0.09em",
  background: "rgba(77,130,255,0.12)",
  border: "1px solid rgba(77,130,255,0.25)",
  borderRadius: 3,
  padding: "1px 5px",
};

const DISCLAIMER: React.CSSProperties = {
  fontSize: 9,
  color: "var(--muted)",
  fontStyle: "italic",
  letterSpacing: "0.01em",
};

const PICK_GRID: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "5px 8px",
};

const PICK_CELL: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 1,
};

const PICK_LABEL: React.CSSProperties = {
  fontSize: 8,
  color: "var(--muted)",
  letterSpacing: "0.06em",
  textTransform: "uppercase",
};

const PICK_VALUE: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: "var(--text)",
  fontVariantNumeric: "tabular-nums",
};

const PCT_FROM_SPOT: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 400,
  color: "var(--muted)",
  marginLeft: 2,
};

const DTE_CHIP: React.CSSProperties = {
  fontSize: 8,
  marginLeft: 4,
  color: "var(--muted)",
  background: "var(--panel-3)",
  border: "1px solid var(--line)",
  borderRadius: 3,
  padding: "0 3px",
};

const CONF_BAR_TRACK: React.CSSProperties = {
  height: 3,
  background: "var(--line-2)",
  borderRadius: 2,
  overflow: "hidden",
};

const CONF_BAR_FILL: React.CSSProperties = {
  height: "100%",
  borderRadius: 2,
  transition: "width 0.3s",
};
