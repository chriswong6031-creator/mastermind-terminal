"use client";
/**
 * OiMoversRail — OI movers from /api/flow?f=oi payload.
 *
 * Reads options_hub.oi_movers/v1 shape (screener_fixture.json oi.movers[]).
 * Displays new strikes + big ΔOI, split call/put.
 * Limit 8 movers shown (matches prism_spec §6 limit).
 *
 * New-strike gate: oi_prev === 0 && oi >= 500 (spec §6 MIN_NEW_STRIKE_OI).
 * Mover gate: |d_oi| >= 200 && oi_prev >= 100 (spec §6 MIN_ABS_CHANGE, MIN_BASE_OI).
 * Deduplication: Set keyed by "${strike}|${side}" — first (highest) entry wins.
 *
 * No signing: direction words (call/put) describe the contract right, not asserted trade direction.
 *
 * Props:
 *   movers  — from OiPayload.movers (the oi endpoint array)
 *   lang    — "en" | "zh"
 */

import React, { useMemo } from "react";
import { makePrismT } from "./prismStrings";
import type { Lang } from "@/lib/i18n";

// ─── Types (matches screener_fixture.json oi.movers[] shape) ──────────────────

export interface OiMoverRow {
  root: string;
  right: "C" | "P";
  exp: string;
  strike: number;
  oi: number;
  oi_prev: number;
  d_oi: number;
  mid?: number | null;
}

interface ProcessedMover {
  root: string;
  right: "C" | "P";
  exp: string;
  strike: number;
  oi: number;
  oi_prev: number;
  d_oi: number;
  d_pct: number | null;
  isNew: boolean;
  mid?: number | null;
}

interface OiMoversRailProps {
  movers: OiMoverRow[];
  lang: Lang;
}

// ─── Constants (matches prism_spec §6) ────────────────────────────────────────

const MIN_NEW_STRIKE_OI = 500;
const MIN_ABS_CHANGE = 200;
const MIN_BASE_OI = 100;
const DISPLAY_LIMIT = 8;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtOi(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

function fmtDoi(n: number): string {
  const sign = n >= 0 ? "+" : "";
  if (Math.abs(n) >= 1_000) return `${sign}${(n / 1_000).toFixed(0)}K`;
  return `${sign}${n}`;
}

function fmtExpiry(exp: string): string {
  try {
    return exp.slice(5); // "07-18"
  } catch {
    return exp;
  }
}

function processMoverRows(rows: OiMoverRow[]): ProcessedMover[] {
  const seen = new Set<string>();
  const out: ProcessedMover[] = [];

  // Separate new strikes (oi_prev === 0) from movers
  const newStrikes = rows.filter(
    (r) => r.oi_prev === 0 && r.oi >= MIN_NEW_STRIKE_OI
  );
  const movers = rows.filter(
    (r) =>
      r.oi_prev !== 0 &&
      Math.abs(r.d_oi) >= MIN_ABS_CHANGE &&
      r.oi_prev >= MIN_BASE_OI
  );

  // New strikes first, sorted by oi descending
  const sortedNew = [...newStrikes].sort((a, b) => b.oi - a.oi);
  for (const r of sortedNew) {
    const key = `${r.strike}|${r.right}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...r, d_pct: null, isNew: true });
    if (out.length >= DISPLAY_LIMIT) return out;
  }

  // Movers sorted by |pct| descending, tie-break by |d_oi|
  const sortedMovers = [...movers].sort((a, b) => {
    const pa = a.oi_prev > 0 ? Math.abs(a.d_oi / a.oi_prev) : 0;
    const pb = b.oi_prev > 0 ? Math.abs(b.d_oi / b.oi_prev) : 0;
    if (Math.abs(pb - pa) > 0.001) return pb - pa;
    return Math.abs(b.d_oi) - Math.abs(a.d_oi);
  });

  for (const r of sortedMovers) {
    const key = `${r.strike}|${r.right}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const d_pct = r.oi_prev > 0 ? (r.d_oi / r.oi_prev) * 100 : null;
    out.push({ ...r, d_pct, isNew: false });
    if (out.length >= DISPLAY_LIMIT) break;
  }

  return out;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function OiMoversRail({ movers, lang }: OiMoversRailProps) {
  const t = makePrismT(lang);

  const processed = useMemo(() => processMoverRows(movers), [movers]);

  if (processed.length === 0) {
    return (
      <div className="obs-card" style={RAIL_OUTER}>
        <div className="obs-card-hd" style={RAIL_HEADER}>
          <span className="obs-lbl">{t("oiMoversTitle")}</span>
        </div>
        <div style={EMPTY_MSG}>{t("oiMoversEmpty")}</div>
      </div>
    );
  }

  return (
    <div className="obs-card" style={RAIL_OUTER}>
      <div className="obs-card-hd" style={RAIL_HEADER}>
        <span className="obs-lbl">{t("oiMoversTitle")}</span>
        <span className="num" style={RAIL_COUNT}>{processed.length}</span>
      </div>

      <div style={ROW_LIST}>
        {processed.map((m, i) => {
          const isCall = m.right === "C";
          const isUp = m.d_oi >= 0;
          const dirColor = isUp ? "var(--up)" : "var(--down)";

          return (
            <div key={`${m.root}-${m.strike}-${m.right}-${i}`} style={MOVER_ROW}>
              {/* Left: root + right + strike */}
              <div style={LEFT_COL}>
                <span style={ROOT_LABEL}>{m.root}</span>
                {/*
                  Call/put keep their existing NON-directional reading: the word names
                  the contract right, not an asserted trade direction — only the tint
                  formula changed (`--c` → `.obs-tag`), never the semantics.
                */}
                <span
                  className="obs-tag"
                  style={{
                    ...SIDE_CHIP,
                    "--c": isCall ? "var(--brand-2)" : "var(--down)",
                  } as React.CSSProperties}
                >
                  {isCall ? t("oiMoversCall") : t("oiMoversPut")}
                </span>
                <span className="num" style={STRIKE_LABEL}>{m.strike}</span>
                <span className="num" style={EXP_LABEL}>{fmtExpiry(m.exp)}</span>
              </div>

              {/* Right: NEW badge or ΔOI + pct */}
              <div style={RIGHT_COL}>
                {m.isNew ? (
                  <span
                    className="obs-tag"
                    style={{ ...NEW_BADGE, "--c": "var(--signal)" } as React.CSSProperties}
                  >
                    {t("oiMoversNew")}
                  </span>
                ) : (
                  <>
                    <span
                      className="obs-tag num"
                      style={{ ...DOI_VAL, "--c": dirColor } as React.CSSProperties}
                    >
                      {isUp ? t("oiMoversUp") : t("oiMoversDown")}{" "}
                      {fmtDoi(m.d_oi)}
                    </span>
                    {m.d_pct != null && (
                      <span className="num" style={{ ...PCT_LABEL, color: dirColor }}>
                        {m.d_pct >= 0 ? "+" : ""}{m.d_pct.toFixed(0)}%
                      </span>
                    )}
                  </>
                )}
                <span className="num" style={OI_LABEL}>{fmtOi(m.oi)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const RAIL_OUTER: React.CSSProperties = {
  overflow: "hidden",
};

const RAIL_HEADER: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
};

const RAIL_COUNT: React.CSSProperties = {
  fontSize: 9,
  color: "var(--muted)",
  background: "var(--panel-3)",
  borderRadius: "var(--r-pill)",
  padding: "0 6px",
  fontVariantNumeric: "tabular-nums",
};

const EMPTY_MSG: React.CSSProperties = {
  padding: "12px 10px",
  fontSize: 11,
  color: "var(--muted)",
  textAlign: "center",
};

const ROW_LIST: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
};

const MOVER_ROW: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "5px 10px",
  borderBottom: "1px solid var(--line-2)",
  gap: 8,
};

const LEFT_COL: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 5,
  flex: 1,
  minWidth: 0,
};

const RIGHT_COL: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 5,
  flexShrink: 0,
};

const ROOT_LABEL: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "var(--text)",
  letterSpacing: "0.03em",
};

/** Dense overrides for `.obs-tag` in a compact rail row. */
const SIDE_CHIP: React.CSSProperties = {
  fontSize: 8,
  fontWeight: 800,
  letterSpacing: "0.06em",
  padding: "2px 6px",
};

const STRIKE_LABEL: React.CSSProperties = {
  fontSize: 10,
  color: "var(--text-2)",
  fontVariantNumeric: "tabular-nums",
};

const EXP_LABEL: React.CSSProperties = {
  fontSize: 9,
  color: "var(--muted)",
  fontVariantNumeric: "tabular-nums",
};

const NEW_BADGE: React.CSSProperties = {
  fontSize: 8,
  fontWeight: 900,
  padding: "2px 7px",
  letterSpacing: "0.08em",
};

const DOI_VAL: React.CSSProperties = {
  fontSize: 9.5,
  fontWeight: 700,
  padding: "2px 7px",
  gap: 3,
};

const PCT_LABEL: React.CSSProperties = {
  fontSize: 9,
  fontVariantNumeric: "tabular-nums",
};

const OI_LABEL: React.CSSProperties = {
  fontSize: 9,
  color: "var(--muted)",
  fontVariantNumeric: "tabular-nums",
};
