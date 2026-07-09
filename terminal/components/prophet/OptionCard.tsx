"use client";
/**
 * OptionCard — displays the option sub-card for a Prophet plan.
 *
 * Hidden (returns null) when option_contract is null/absent.
 *
 * HONESTY DOCTRINE:
 *   - "EOD mark" freshness chip — never claims live quote.
 *   - No predictive language; no "validated".
 *   - Entry premium is plan-time snapshot; EOD mark is EOD only.
 */

import { useState } from "react";
import { makeProphetT } from "./prophetStrings";
import type { Lang } from "@/lib/i18n";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface OptionContractPayload {
  /** "CALL" | "PUT" or "C" | "P" — both accepted */
  type?: string;
  /** "C" | "P" — alternative to type */
  right?: string;
  strike: number;
  expiry: string;
  entry_premium: number | null;
  /** EOD mark — present only when engine has an EOD price */
  eod_mark?: number | null;
}

/** Live intraday mark sourced from prophet_marks.json */
export interface LiveMark {
  bid: number;
  ask: number;
  mid: number;
  last: number;
  ts_utc: string;
}

interface OptionCardProps {
  contract: OptionContractPayload | null | undefined;
  lang: Lang;
  /** When present and fresh (≤20 min RTH), shown tagged LIVE instead of EOD mark. */
  liveMark?: LiveMark | null;
  /** Set true in fixture/dev mode to bypass freshness check */
  liveMarkForced?: boolean;
}

// ── Component ──────────────────────────────────────────────────────────────────

// ── Live-mark freshness check ─────────────────────────────────────────────────

const LIVE_WINDOW_MS = 20 * 60 * 1000; // 20 min

function isMarkFresh(mark: LiveMark, forced: boolean): boolean {
  if (forced) return true;
  try {
    const age = Date.now() - new Date(mark.ts_utc).getTime();
    return age >= 0 && age <= LIVE_WINDOW_MS;
  } catch { return false; }
}

export function OptionCard({ contract, lang, liveMark, liveMarkForced }: OptionCardProps) {
  const t = makeProphetT(lang);
  const zh = lang === "zh";
  const [tipKey, setTipKey] = useState<string | null>(null);

  if (!contract) return null;

  // Accept both "CALL"/"PUT" and "C"/"P" in type; also fall back to "right" field.
  const typeStr = (contract.type ?? contract.right ?? "").toUpperCase();
  const isCall = typeStr === "CALL" || typeStr === "C";
  const typeColor = isCall ? "var(--up)" : "var(--down)";
  const typeBg   = isCall
    ? "color-mix(in srgb, var(--up) 15%, transparent)"
    : "color-mix(in srgb, var(--down) 15%, transparent)";
  const typeLabel = isCall ? t("optionCall") : t("optionPut");

  const hasPrem = contract.entry_premium != null;
  const hasEod  = contract.eod_mark != null;

  // Live mark: prefer if present and fresh during RTH
  const isLive = liveMark != null && isMarkFresh(liveMark, liveMarkForced ?? false);
  const displayMark: number | null = isLive ? liveMark!.mid : (hasEod ? contract.eod_mark! : null);
  const hasDisplayMark = displayMark != null;

  const pnlPct = hasPrem && hasDisplayMark && contract.entry_premium! > 0
    ? ((displayMark! - contract.entry_premium!) / contract.entry_premium!) * 100
    : null;

  return (
    <div className="obs-card" style={CARD_STYLE}>
      {/* Header row */}
      <div style={HEADER_ROW}>
        <span style={DIAMOND}>◆</span>
        <span style={TITLE_STYLE}>{t("optionCardTitle")}</span>
        {/* Freshness chip: LIVE (green) or EOD (muted) */}
        {isLive && (
          <span
            style={LIVE_CHIP}
            onMouseEnter={() => setTipKey("live")}
            onMouseLeave={() => setTipKey(null)}
            aria-label={zh ? "盘中实时报价" : "Intraday live quote"}
          >
            {zh ? "实时" : "LIVE"}
            {tipKey === "live" && (
              <span style={TIP_STYLE}>
                {zh
                  ? "盘中实时中间价 — 20分钟内更新"
                  : "Intraday mid-price — updated within 20 min"}
              </span>
            )}
          </span>
        )}
        {!isLive && hasDisplayMark && (
          <span
            style={EOD_CHIP}
            onMouseEnter={() => setTipKey("eod")}
            onMouseLeave={() => setTipKey(null)}
            aria-label={t("optionEodMark")}
          >
            {t("optionEodMark")}
            {tipKey === "eod" && (
              <span style={TIP_STYLE}>
                {zh
                  ? "EOD收盘标记 — 非实时报价"
                  : "EOD mark — not a live quote"}
              </span>
            )}
          </span>
        )}
      </div>

      {/* Fields grid */}
      <div style={GRID_STYLE}>
        {/* Type */}
        <Field label={t("optionType")}>
          <span style={{ ...CHIP_BASE, background: typeBg, color: typeColor, fontWeight: 700 }}>
            {typeLabel}
          </span>
        </Field>

        {/* Strike */}
        <Field label={t("optionStrike")}>
          <span style={VAL_STYLE}>${contract.strike.toFixed(2)}</span>
        </Field>

        {/* Expiry */}
        <Field label={t("optionExpiry")}>
          <span style={VAL_STYLE}>{contract.expiry}</span>
        </Field>

        {/* Entry premium */}
        {hasPrem && (
          <Field label={t("optionPremEntry")}>
            <span style={VAL_STYLE}>${contract.entry_premium!.toFixed(2)}</span>
          </Field>
        )}

        {/* Current mark (LIVE mid or EOD) + P&L */}
        {hasDisplayMark && (
          <Field label={isLive ? (zh ? "实时中间价" : "Live mid") : t("optionEodMark")}>
            <span style={VAL_STYLE}>
              ${displayMark!.toFixed(2)}
              {pnlPct != null && (
                <span
                  style={{
                    marginLeft: 5,
                    color: pnlPct >= 0 ? "var(--up)" : "var(--down)",
                    fontSize: 10,
                    fontWeight: 600,
                  }}
                >
                  {pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(1)}%
                </span>
              )}
            </span>
          </Field>
        )}
        {/* Bid/ask spread when live mark present */}
        {isLive && liveMark && (
          <Field label={zh ? "买/卖" : "Bid/Ask"}>
            <span style={{ ...VAL_STYLE, color: "var(--text-2)" }}>
              ${liveMark.bid.toFixed(2)} / ${liveMark.ask.toFixed(2)}
            </span>
          </Field>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={FIELD_STYLE}>
      <span style={FIELD_LABEL}>{label}</span>
      <span style={FIELD_VAL}>{children}</span>
    </div>
  );
}

// ── Style constants ───────────────────────────────────────────────────────────

// obs-card provides glass background/border/radius
const CARD_STYLE: React.CSSProperties = {
  marginTop: 8,
  padding: "9px 11px",
};

const HEADER_ROW: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  marginBottom: 8,
};

const DIAMOND: React.CSSProperties = {
  color: "#19c2c2",
  fontSize: 11,
};

const TITLE_STYLE: React.CSSProperties = {
  font: "600 11px/1 var(--font-ui)",
  color: "var(--text-2)",
  flex: 1,
};

const EOD_CHIP: React.CSSProperties = {
  position: "relative",
  display: "inline-flex",
  alignItems: "center",
  font: "500 9.5px/1 var(--font-ui)",
  color: "var(--muted)",
  border: "1px solid var(--line-2)",
  borderRadius: "var(--r-pill)",
  padding: "2px 6px",
  cursor: "help",
};

const LIVE_CHIP: React.CSSProperties = {
  position: "relative",
  display: "inline-flex",
  alignItems: "center",
  gap: 3,
  font: "600 9.5px/1 var(--font-ui)",
  color: "var(--up)",
  border: "1px solid color-mix(in srgb, var(--up) 40%, transparent)",
  borderRadius: "var(--r-pill)",
  padding: "2px 6px",
  cursor: "help",
};

const TIP_STYLE: React.CSSProperties = {
  position: "absolute",
  bottom: "calc(100% + 5px)",
  right: 0,
  whiteSpace: "nowrap",
  background: "var(--panel-3)",
  border: "1px solid var(--line-3)",
  borderRadius: "var(--r-md)",
  padding: "5px 8px",
  font: "500 10px/1.4 var(--font-ui)",
  color: "var(--text-2)",
  zIndex: 50,
  pointerEvents: "none",
  boxShadow: "var(--shadow-1)",
};

const GRID_STYLE: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "6px 16px",
};

const FIELD_STYLE: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
};

const FIELD_LABEL: React.CSSProperties = {
  font: "500 9.5px/1 var(--font-ui)",
  color: "var(--muted)",
};

const FIELD_VAL: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
};

const VAL_STYLE: React.CSSProperties = {
  font: "600 11.5px/1 var(--font-num)",
  color: "var(--text)",
};

const CHIP_BASE: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  font: "600 10px/1 var(--font-ui)",
  borderRadius: "var(--r-pill)",
  padding: "3px 7px",
  whiteSpace: "nowrap",
};
