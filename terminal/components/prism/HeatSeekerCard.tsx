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
  strike: number | null;
  expiry: string;
  lens: string;
  standout_ratio: number | null;
  /**
   * A 0..1 FRACTION, never a "low"/"medium"/"high" tier. The builder
   * (macro `engine/options_matrix.py` `_heat_seeker`) emits
   * `round(min(1, (standout_ratio - 1) / 3), 2)`, and the contract dataclass
   * `MatrixHeatSeeker.confidence` is `float | None` — so absent is legal, but a
   * string never is. A tier string means a malformed payload: it reads as absent
   * rather than being mapped to an invented number.
   */
  confidence: number | null;
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

/** The contract's `float | None` fields arrive as null in real payloads. */
function finite(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * Confidence fraction → ring percent, or null when there is no usable number.
 *
 * Returning null (rather than 0) is load-bearing: RingGauge maps a NaN value to a
 * displayed "0" in the weak/"down" tone, so an unusable confidence would render as
 * a confident-looking reading of zero instead of showing nothing.
 */
export function heatSeekerConfPct(confidence: unknown): number | null {
  const n = finite(confidence);
  if (n === null) return null;
  return Math.round(Math.min(1, Math.max(0, n)) * 100);
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
  const strike = finite(pick.strike);
  const ratio = finite(pick.standout_ratio);
  const pct = spot != null && strike != null ? spotPct(strike, spot) : null;
  const above = spot != null && strike != null ? strike >= spot : null;
  const confPct = heatSeekerConfPct(pick.confidence);

  return (
    <div className="obs-card" style={CARD_OUTER}>
      {/* Header */}
      <div className="obs-card-hd" style={CARD_HEADER}>
        <span style={PICK_STAR}>★</span>
        <span className="obs-lbl" style={{ flex: 1 }}>{t("heatSeekerTitle")}</span>
        <span className="obs-tag" style={CARD_LENS}>{pick.lens}</span>
      </div>

      {/* Disclaimer — verbatim, non-removable, always amber */}
      <div className="obs-note" style={DISCLAIMER_NOTE}>
        {t("heatSeekerDisclaimer")}
      </div>

      {/*
        One number, one reason: the STRIKE is the pick and carries the headline;
        its distance from spot is the direction tag; the standout ratio is the single
        reason the strike was chosen; everything else drops to one muted line below.
        Confidence is a 0..1 engine fraction — the ring shows it as a percent.
      */}
      <div style={PICK_BODY}>
        <div style={HEADLINE_COL}>
          <div style={HEADLINE_ROW}>
            <span className="num" style={HEADLINE_VALUE}>
              {strike != null ? fmtStrike(strike) : "—"}
            </span>
            {pct != null && (
              <span
                className="obs-tag num"
                style={{
                  ...DIR_TAG,
                  "--c": above ? "var(--up)" : "var(--down)",
                } as React.CSSProperties}
                aria-label={`${pct} ${t("heatSeekerFromSpot")}`}
              >
                {pct}
              </span>
            )}
          </div>
          <div style={REASON_ROW}>
            <span className="obs-lbl">{t("heatSeekerRatio")}</span>
            <span className="num" style={REASON_VALUE}>
              {ratio != null ? `${ratio.toFixed(2)}×` : "—"}
            </span>
          </div>
        </div>
        {confPct != null && (
          <RingGauge
            value={confPct}
            size="sm"
            tone="auto"
            label={t("heatSeekerConfUnit")}
          />
        )}
      </div>

      {/* Metadata — one muted line, never competing with the headline */}
      <div style={META_LINE}>
        {t("heatSeekerExpiry")}{" "}
        <span className="num">
          {fmtExpiry(pick.expiry)} · {dte === 0 ? "0DTE" : `${dte}d`}
        </span>
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
  borderRadius: "var(--r-tile)",
  fontSize: 10,
  lineHeight: 1.4,
};

const PICK_BODY: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "var(--sp-3)",
  padding: "10px 12px 8px",
};

const PICK_STAR: React.CSSProperties = {
  fontSize: 13,
  color: "var(--signal)",
};

/** `.obs-tag` supplies the tint; only the dense metrics stay inline. */
const CARD_LENS: React.CSSProperties = {
  "--c": "var(--brand-2)",
  fontSize: 9,
  fontWeight: 800,
  letterSpacing: "0.09em",
  padding: "2px 7px",
} as React.CSSProperties;

const HEADLINE_COL: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--sp-2)",
  minWidth: 0,
};

const HEADLINE_ROW: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--sp-2)",
  flexWrap: "wrap",
};

/** The pick itself — the one number the card exists to show. */
const HEADLINE_VALUE: React.CSSProperties = {
  fontSize: "var(--fs-num)",
  fontWeight: 750,
  color: "var(--text)",
  letterSpacing: "-.01em",
  lineHeight: 1,
};

const DIR_TAG: React.CSSProperties = {
  fontSize: 9.5,
  fontWeight: 700,
  padding: "2px 7px",
};

const REASON_ROW: React.CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  gap: 6,
};

const REASON_VALUE: React.CSSProperties = {
  fontSize: "var(--fs-emph)",
  fontWeight: 700,
  color: "var(--text-2)",
};

/** Everything that is not the pick or its reason lives on this one line. */
const META_LINE: React.CSSProperties = {
  padding: "0 12px 11px",
  fontSize: 10,
  color: "var(--muted)",
  letterSpacing: "0.02em",
};
