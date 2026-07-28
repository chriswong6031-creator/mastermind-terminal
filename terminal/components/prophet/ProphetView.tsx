"use client";
/**
 * ProphetView — managed-pick desk for the Prophet tab.
 *
 * Layout (desktop) — THREE columns, matching competitor reference quality:
 *   LEFT   — Alert stream (signal cards, sort controls, SIGNALS/PERF sub-tabs)
 *   CENTER — Analysis: ticker header + phase + geometry rail + WHAT TO DO NOW
 *             + PROFIT TAKING PLAN + SIGNAL THESIS
 *   RIGHT  — Confidence Index: arc gauge + component bars + R/R + option card
 *
 * Narrow-width: CENTER and RIGHT stack vertically below LEFT.
 *
 * HONESTY DOCTRINE:
 *   - Cadence chip: "nightly EOD — updates after close"
 *   - Authority chip: "display-only — forward ledger accruing"
 *   - Thesis rendered with "machine-generated from engine fields" caption
 *   - what_to_do_now rendered with "phase-keyed action guide — display only"
 *   - profit_plan rendered with "exit levels from engine geometry — display only"
 *   - No "validated", no predictive copy
 *   - Empty state: "No active prophecies — ledger accruing."
 *   - PERF sub-tab: placeholder only ("outcome ledger accruing")
 *   - Content blocks (what_to_do_now, profit_plan) hide gracefully when absent
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { flowGet } from "@/lib/flowClientCache";
import { useLang } from "@/lib/i18n";
import { makeProphetT } from "./prophetStrings";
import { SignalCard, planAsof, planConfidence, planPhase, planRecommendedAction } from "./SignalCard";
import type { PlanSummary } from "./SignalCard";
import { ConfidencePanel } from "./ConfidencePanel";
import type { ConfidenceComponents } from "./ConfidencePanel";
import { GeometryRail } from "./GeometryRail";
import { OptionCard } from "./OptionCard";
import type { LiveMark } from "./OptionCard";

// ── API payload types ─────────────────────────────────────────────────────────

interface ProphetIndexPayload {
  asof?: string | null;
  cadence?: string;
  plans: PlanSummary[];
}

interface ProphetMarksPayload {
  schema?: string;
  asof_utc?: string;
  session_date?: string;
  /** Fixture-mode flag: treat all marks as fresh regardless of ts_utc */
  _fixture?: boolean;
  marks?: Record<string, LiveMark>;
}

// ── OCC symbol derivation ─────────────────────────────────────────────────────
// Format: {ticker padded to 6 chars}{YYMMDD}{C|P}{strike×1000 padded to 8 digits}
// e.g. BA + 2026-09-18 + C + 220 → "BA      260918C00220000"

function toOccSymbol(ticker: string, right: string, expiry: string, strike: number): string {
  const root = ticker.toUpperCase().padEnd(6, " ");
  // expiry: "YYYY-MM-DD" → "YYMMDD"
  const yy = expiry.slice(2, 4);
  const mm = expiry.slice(5, 7);
  const dd = expiry.slice(8, 10);
  const cp = right.toUpperCase() === "C" || right.toUpperCase() === "CALL" ? "C" : "P";
  const sk = String(Math.round(strike * 1000)).padStart(8, "0");
  return `${root}${yy}${mm}${dd}${cp}${sk}`;
}

const LIVE_MARK_WINDOW_MS = 20 * 60 * 1000; // 20 min

function resolveliveMark(
  marks: ProphetMarksPayload | null,
  ticker: string,
  right: string,
  expiry: string,
  strike: number,
): { mark: LiveMark | null; forced: boolean } {
  if (!marks?.marks) return { mark: null, forced: false };
  const occ = toOccSymbol(ticker, right, expiry, strike);
  const m = marks.marks[occ] ?? null;
  if (!m) return { mark: null, forced: false };
  const forced = marks._fixture === true;
  if (!forced) {
    // Must be within 20 min
    try {
      const age = Date.now() - new Date(m.ts_utc).getTime();
      if (age < 0 || age > LIVE_MARK_WINDOW_MS) return { mark: null, forced: false };
    } catch { return { mark: null, forced: false }; }
  }
  return { mark: m, forced };
}

type SortMode = "new" | "best" | "gainers";
type SubTab   = "signals" | "perf";

// ── Sort helpers ──────────────────────────────────────────────────────────────

function sortPlans(plans: PlanSummary[], mode: SortMode): PlanSummary[] {
  const copy = [...plans];
  switch (mode) {
    case "new":
      return copy.sort((a, b) => {
        const ta = new Date(planAsof(a)).getTime();
        const tb = new Date(planAsof(b)).getTime();
        const fa = Number.isFinite(ta) ? ta : 0;
        const fb = Number.isFinite(tb) ? tb : 0;
        return fb - fa;
      });
    case "best":
      return copy.sort((a, b) => {
        const ca = planConfidence(a) ?? 0;
        const cb = planConfidence(b) ?? 0;
        return cb - ca;
      });
    case "gainers":
      return copy.sort((a, b) => {
        const pnl = (p: PlanSummary) => {
          if (p.last_price == null || p.entry == null || p.entry === 0) return -Infinity;
          const raw = (p.last_price - p.entry) / p.entry * 100;
          return p.direction === "BEAR" ? -raw : raw;
        };
        return pnl(b) - pnl(a);
      });
  }
}

// ── Component ──────────────────────────────────────────────────────────────────

export function ProphetView() {
  const { lang } = useLang();
  const t = makeProphetT(lang);

  const [payload,     setPayload]     = useState<ProphetIndexPayload | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [selectedId,  setSelectedId]  = useState<string | null>(null);
  const [sortMode,    setSortMode]    = useState<SortMode>("new");
  const [subTab,      setSubTab]      = useState<SubTab>("signals");
  const [marks,       setMarks]       = useState<ProphetMarksPayload | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    if (abortRef.current) { abortRef.current.abort(); }
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    setError(null);
    try {
      const data = await flowGet("prophet_idx") as ProphetIndexPayload | null;
      if (ctrl.signal.aborted) return;
      if (!data) throw new Error("fetch error");
      setPayload(data);
      if (data.plans?.length > 0) {
        setSelectedId((id) => id ?? data.plans[0].id);
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setError((err as Error).message ?? "fetch error");
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  }, []);

  // Fetch live marks (prophet_marks.json) — separate from prophet_idx so it can
  // refresh independently every ~30s without re-fetching the full plan index.
  const fetchMarks = useCallback(async () => {
    try {
      const d = await flowGet("prophet_marks");
      if (d) setMarks(d as ProphetMarksPayload);
    } catch { /* silent — absent marks → EOD fallback */ }
  }, []);

  useEffect(() => {
    fetchData();
    fetchMarks();
    const poll = setInterval(fetchMarks, 30_000);
    return () => { abortRef.current?.abort(); clearInterval(poll); };
  }, [fetchData, fetchMarks]);

  // ── Derived ────────────────────────────────────────────────────────────────

  const plans       = payload?.plans ?? [];
  const sortedPlans = sortPlans(plans, sortMode);
  const selected    = sortedPlans.find((p) => p.id === selectedId) ?? sortedPlans[0] ?? null;
  const activePlans = sortedPlans.filter((p) => planPhase(p) !== "invalidated").length;
  const asofLabel = (() => {
    if (!payload?.asof) return lang === "zh" ? "等待更新" : "Awaiting close";
    try {
      return new Date(payload.asof).toLocaleDateString(lang === "zh" ? "zh-CN" : "en-US", {
        month: "short",
        day: "numeric",
        timeZone: "America/New_York",
      });
    } catch {
      return payload.asof.slice(0, 10);
    }
  })();

  // ── Render helpers ─────────────────────────────────────────────────────────

  function SortButton({ mode, label }: { mode: SortMode; label: string }) {
    return (
      <button
        className={`obs-chip${sortMode === mode ? " on" : ""}`}
        style={SORT_CHIP_STYLE}
        onClick={() => setSortMode(mode)}
      >
        {label}
      </button>
    );
  }

  // ── Full-pane states ───────────────────────────────────────────────────────

  if (loading && !payload) {
    return <div style={FULL_CENTER}>{t("loading")}</div>;
  }

  if (error && !payload) {
    return (
      <div style={FULL_CENTER}>
        <div style={{ color: "var(--down)", marginBottom: 10 }}>{t("error")}</div>
        <button style={RETRY_BTN} onClick={fetchData}>{t("retry")}</button>
      </div>
    );
  }

  // ── Layout ─────────────────────────────────────────────────────────────────

  return (
    <div className="obs obs-ambient obs-prophet">
      <header className="obs-prophet-masthead">
        <div className="obs-prophet-orb" aria-hidden>
          <span>✦</span>
        </div>
        <div className="obs-prophet-brand">
          <span className="obs-prophet-eyebrow">{t("mastheadEyebrow")}</span>
          <div className="obs-prophet-title-row">
            <h2>{t("tabProphet")}</h2>
            <span>{t("tabSubtitle")}</span>
          </div>
        </div>
        <div className="obs-prophet-status">
          <div className="obs-prophet-stat">
            <span>{t("mastheadActive")}</span>
            <b>{activePlans}</b>
          </div>
          <div className="obs-prophet-stat">
            <span>{t("mastheadFocus")}</span>
            <b>{selected?.asset ?? "—"}</b>
          </div>
          <div className="obs-prophet-stat">
            <span>{t("mastheadUpdated")}</span>
            <b>{asofLabel}</b>
          </div>
        </div>
      </header>

      <div className="obs-prophet-grid">
      {/* ── LEFT — alert stream ── */}
      <div className="obs-card obs-prophet-pane obs-prophet-left" style={LEFT_PANE}>
        {/* Sub-tabs */}
        <div style={SUBTAB_ROW}>
          <nav className="obs-pillnav" style={{ padding: "3px", gap: 2 }}>
            <button
              className={`obs-pillnav-tab${subTab === "signals" ? " on" : ""}`}
              style={{ padding: "5px 12px", fontSize: 12 }}
              onClick={() => setSubTab("signals")}
            >{t("tabSignals")}</button>
            <button
              className={`obs-pillnav-tab${subTab === "perf" ? " on" : ""}`}
              style={{ padding: "5px 12px", fontSize: 12 }}
              onClick={() => setSubTab("perf")}
            >{t("tabPerf")}</button>
          </nav>
          <div style={{ flex: 1 }} />
          <span style={INFO_CHIP}>{t("cadenceLabel")}</span>
        </div>

        {subTab === "signals" && (
          <>
            <div style={SORT_ROW}>
              <SortButton mode="new"     label={t("sortNew")} />
              <SortButton mode="best"    label={t("sortBest")} />
              <SortButton mode="gainers" label={t("sortGainers")} />
            </div>
            <div style={CARD_LIST} className="obs-scroll">
              {sortedPlans.length === 0 ? (
                <div style={EMPTY_STATE}>{t("noPlans")}</div>
              ) : (
                sortedPlans.map((plan) => (
                  <SignalCard
                    key={plan.id}
                    plan={plan}
                    lang={lang}
                    selected={plan.id === selected?.id}
                    onSelect={(p) => setSelectedId(p.id)}
                  />
                ))
              )}
            </div>
          </>
        )}

        {subTab === "perf" && (
          <div style={PERF_PLACEHOLDER}>
            <div style={PERF_TITLE}>{t("perfPlaceholderTitle")}</div>
            <div style={PERF_BODY}>{t("perfPlaceholderBody")}</div>
          </div>
        )}
      </div>

      {/* ── CENTER — analysis ── */}
      <div className="obs-card obs-prophet-pane obs-prophet-center" style={CENTER_PANE}>
        {!selected ? (
          <div style={FULL_CENTER}>{t("noPlans")}</div>
        ) : (
          <AnalysisPanel plan={selected} lang={lang} t={t} />
        )}
      </div>

      {/* ── RIGHT — confidence index ── */}
      <div className="obs-card obs-prophet-pane obs-prophet-right" style={RIGHT_PANE}>
        {!selected ? (
          <div style={FULL_CENTER}>{t("noPlans")}</div>
        ) : (
          <ConfidenceColumn plan={selected} lang={lang} t={t} marks={marks} />
        )}
      </div>
      </div>
    </div>
  );
}

// ── AnalysisPanel (CENTER column) ─────────────────────────────────────────────

function AnalysisPanel({
  plan,
  lang,
  t,
}: {
  plan: PlanSummary;
  lang: "en" | "zh";
  t: ReturnType<typeof makeProphetT>;
}) {
  const isBear   = plan.direction === "BEAR";
  const dirColor = isBear ? "var(--down)" : "var(--up)";
  const dirBg    = isBear
    ? "color-mix(in srgb, var(--down) 15%, transparent)"
    : "color-mix(in srgb, var(--up) 15%, transparent)";

  const phase      = planPhase(plan);
  const state      = plan.state;
  const geometry   = state?.geometry ?? null;
  const t1 = plan.targets?.[0] ?? null;
  const t2 = plan.targets?.[1] ?? null;

  // Phase chip colors
  const phaseMap: Record<string, string> = {
    pre_trigger:       t("phasePretrigger"),
    triggered_pre_t1:  t("phaseTriggered"),
    at_t1:             t("phaseAtT1"),
    between_t1_t2:     t("phaseBetweenT1T2"),
    at_t2:             t("phaseAtT2"),
    overtime:          t("phaseOvertime"),
    invalidated:       t("phaseInvalidated"),
  };
  const phaseLabel = phase ? (phaseMap[phase] ?? phase) : null;
  const phaseColor = phase === "invalidated"
    ? "var(--down)"
    : phase?.includes("t1") || phase?.includes("t2")
    ? "var(--up)"
    : phase === "triggered_pre_t1"
    ? "var(--warn)"
    : "var(--text-2)";

  // What-to-do-now from payload — prefer ZH variant when lang is zh.
  const whatToDo = (lang === "zh" && plan.what_to_do_now_zh?.length)
    ? plan.what_to_do_now_zh
    : plan.what_to_do_now;
  // Profit plan from payload — prefer ZH variant when lang is zh.
  const profitPlan = (lang === "zh" && plan.profit_plan_zh?.length)
    ? plan.profit_plan_zh
    : plan.profit_plan;
  // Thesis from payload — prefer ZH variant when lang is zh.
  const _planAny = plan as unknown as { thesis?: string | null; thesis_zh?: string | null };
  const thesis = (lang === "zh" && _planAny.thesis_zh) ? _planAny.thesis_zh : _planAny.thesis;

  return (
    <div style={ANALYSIS_SCROLL} className="obs-scroll obs-prophet-analysis">
      {/* ── Ticker header ── */}
      <div style={ANALYSIS_HEADER}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={ANALYSIS_TICKER}>{plan.asset}</span>
          <span style={{ ...DIR_BADGE, background: dirBg, color: dirColor }}>
            {isBear ? `▼ ${t("bear")}` : `▲ ${t("bull")}`}
          </span>
          {phaseLabel && (
            <span style={{ ...PHASE_BADGE, color: phaseColor, borderColor: `${phaseColor}44` }}>
              {phaseLabel}
            </span>
          )}
        </div>
        <span style={AUTH_CHIP}>{t("authorityLabel")}</span>
      </div>

      {/* ── Trade geometry price rail ── */}
      <div style={{ marginBottom: 14 }}>
        <GeometryRail
          direction={plan.direction}
          entry={plan.entry}
          stop={plan.invalidation}
          t1={t1}
          t2={t2}
          last={plan.last_price ?? null}
          geometry={geometry}
          lang={lang}
        />
      </div>

      {/* ── WHAT TO DO NOW ── */}
      {whatToDo && whatToDo.length > 0 && (
        <div style={SECTION_BOX} className="obs-prophet-section obs-prophet-section-primary">
          <div style={SECTION_HDR_ROW}>
            <span style={SECTION_LABEL}>{t("briefLabel")}</span>
            <span style={SECTION_CAPTION}>{t("briefCaption")}</span>
          </div>
          <ol style={BULLET_LIST}>
            {whatToDo.map((line, i) => (
              <li key={i} style={BULLET_ITEM}>
                <span style={BULLET_NUMBER}>{i + 1}</span>
                <span style={BULLET_TEXT}>{line}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* ── PROFIT TAKING PLAN ── */}
      {profitPlan && profitPlan.length > 0 && (
        <div style={SECTION_BOX} className="obs-prophet-section">
          <div style={SECTION_HDR_ROW}>
            <span style={SECTION_LABEL}>{t("profitPlanLabel")}</span>
            <span style={SECTION_CAPTION}>{t("profitPlanCaption")}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {profitPlan.map((row, i) => (
              <ProfitRow key={i} row={row} t={t} />
            ))}
          </div>
        </div>
      )}

      {/* ── SIGNAL THESIS ── */}
      {thesis && (
        <div style={SECTION_BOX} className="obs-prophet-section">
          <div style={SECTION_HDR_ROW}>
            <span style={SECTION_LABEL}>{t("thesisLabel")}</span>
            <span style={SECTION_CAPTION}>{t("thesisCaption")}</span>
          </div>
          <p style={THESIS_TEXT}>{thesis}</p>
        </div>
      )}
    </div>
  );
}

// ── ProfitRow ─────────────────────────────────────────────────────────────────

function ProfitRow({
  row,
  t,
}: {
  row: NonNullable<PlanSummary["profit_plan"]>[number];
  t: ReturnType<typeof makeProphetT>;
}) {
  const statusColor =
    row.status === "DONE"    ? "var(--muted)" :
    row.status === "ACTIVE"  ? "var(--up)" :
    "var(--text-dim)";
  const statusLabel =
    row.status === "DONE"    ? t("profitStatusDone") :
    row.status === "ACTIVE"  ? t("profitStatusActive") :
    t("profitStatusPending");

  return (
    <div style={PROFIT_ROW}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
        {/* Level chip */}
        <span style={{ ...PROFIT_LEVEL, opacity: row.status === "DONE" ? 0.5 : 1 }}>
          {row.level != null ? `$${row.level.toFixed(2)}` : "—"}
        </span>
        {/* Label badge */}
        <span style={PROFIT_LABEL_BADGE}>{row.label}</span>
        {/* Action text */}
        <span style={{ ...PROFIT_ACTION, textDecoration: row.status === "DONE" ? "line-through" : "none", opacity: row.status === "DONE" ? 0.45 : 1 }}>
          {row.action}
        </span>
      </div>
      {/* Status chip */}
      <span style={{ ...STATUS_CHIP, color: statusColor, borderColor: `${statusColor}55` }}>
        {statusLabel}
      </span>
    </div>
  );
}

// ── ConfidenceColumn (RIGHT column) ──────────────────────────────────────────

function ConfidenceColumn({
  plan,
  lang,
  t,
  marks,
}: {
  plan: PlanSummary;
  lang: "en" | "zh";
  t: ReturnType<typeof makeProphetT>;
  marks: ProphetMarksPayload | null;
}) {
  const state      = plan.state;
  const confidence = planConfidence(plan);
  const components = (state as { components?: ConfidenceComponents } | null | undefined)?.components ?? null;
  const geometry   = state?.geometry ?? null;

  const t1 = plan.targets?.[0] ?? null;

  const rrRatio: number | null =
    plan.entry != null && plan.invalidation != null && t1 != null
      ? Math.abs(t1 - plan.entry) / Math.abs(plan.entry - plan.invalidation)
      : null;

  return (
    <div style={CONFIDENCE_SCROLL} className="obs-scroll obs-prophet-confidence-column">
      {/* Section label */}
      <div style={CONF_HDR}>
        <span style={CONF_HDR_LABEL}>{t("confidenceTitle")}</span>
      </div>

      {/* Confidence panel (arc + bars) */}
      <div style={{ marginBottom: 10 }}>
        <ConfidencePanel
          confidence={confidence}
          components={components}
          phase={planPhase(plan)}
          change_reason={(state as { change_reason?: string | null } | null | undefined)?.change_reason ?? null}
          recommended_action={planRecommendedAction(plan)}
          lang={lang}
        />
      </div>

      {/* R/R at entry */}
      {rrRatio != null && (
        <div style={RR_ROW}>
          <span style={RR_LABEL}>{t("rrLabel")}</span>
          <span style={RR_VAL}>{rrRatio.toFixed(2)}</span>
          {plan.entry != null && plan.invalidation != null && (
            <>
              <span style={RR_SUB}>
                {t("rrRisk")}: ${Math.abs(plan.entry - plan.invalidation).toFixed(2)}
              </span>
              {t1 != null && (
                <span style={RR_SUB}>
                  {t("rrReward")}: ${Math.abs(t1 - plan.entry).toFixed(2)}
                </span>
              )}
            </>
          )}
        </div>
      )}

      {/* Option card — with live-mark overlay if fresh */}
      {plan.option_contract && (
        <div style={{ marginBottom: 10 }}>
          {(() => {
            const oc = plan.option_contract;
            const right = oc.right ?? (oc.type?.toUpperCase() === "PUT" ? "P" : "C");
            const { mark, forced } = resolveliveMark(
              marks, plan.asset, right, oc.expiry, oc.strike
            );
            return (
              <OptionCard
                contract={oc}
                lang={lang}
                liveMark={mark}
                liveMarkForced={forced}
              />
            );
          })()}
        </div>
      )}
    </div>
  );
}

// ── Style constants ───────────────────────────────────────────────────────────

const LEFT_PANE: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  minWidth: 0,
};

const CENTER_PANE: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  minWidth: 0,
};

const RIGHT_PANE: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  minWidth: 0,
};

const SUBTAB_ROW: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  borderBottom: "1px solid rgba(255,255,255,0.07)",
  padding: "7px 10px",
  flexShrink: 0,
  gap: 6,
};

const SORT_ROW: React.CSSProperties = {
  display: "flex",
  gap: 4,
  padding: "8px 10px",
  flexShrink: 0,
  borderBottom: "1px solid rgba(255,255,255,0.07)",
};

const SORT_CHIP_STYLE: React.CSSProperties = {
  padding: "4px 10px",
  fontSize: 10,
  borderRadius: 8,
};

const CARD_LIST: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: "6px 8px",
};

const INFO_CHIP: React.CSSProperties = {
  font: "500 9px/1 var(--font-ui)",
  color: "var(--muted)",
  border: "1px solid rgba(255,255,255,0.09)",
  borderRadius: "var(--r-pill)",
  padding: "2px 6px",
  whiteSpace: "nowrap",
};

const EMPTY_STATE: React.CSSProperties = {
  padding: "32px 16px",
  font: "500 12px/1.5 var(--font-ui)",
  color: "var(--muted)",
  textAlign: "center",
};

const PERF_PLACEHOLDER: React.CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  padding: "32px 24px",
  textAlign: "center",
  gap: 12,
};

const PERF_TITLE: React.CSSProperties = {
  font: "600 13px/1 var(--font-ui)",
  color: "var(--text-2)",
};

const PERF_BODY: React.CSSProperties = {
  font: "500 11px/1.6 var(--font-ui)",
  color: "var(--muted)",
  maxWidth: 260,
};

// ── Analysis panel styles ─────────────────────────────────────────────────────

const ANALYSIS_SCROLL: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: "12px 14px",
};

const ANALYSIS_HEADER: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 8,
  marginBottom: 14,
  flexWrap: "wrap",
};

const ANALYSIS_TICKER: React.CSSProperties = {
  font: "750 28px/1 var(--font-ui)",
  color: "var(--text)",
  letterSpacing: ".01em",
};

const DIR_BADGE: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  font: "700 11px/1 var(--font-ui)",
  borderRadius: "var(--r-pill)",
  padding: "4px 9px",
};

const PHASE_BADGE: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  font: "600 10px/1 var(--font-ui)",
  border: "1px solid",
  borderRadius: "var(--r-pill)",
  padding: "3px 8px",
  whiteSpace: "nowrap",
};

const AUTH_CHIP: React.CSSProperties = {
  flexShrink: 0,
  font: "500 9px/1 var(--font-ui)",
  color: "var(--muted)",
  border: "1px solid rgba(255,255,255,0.09)",
  borderRadius: "var(--r-pill)",
  padding: "3px 7px",
  whiteSpace: "nowrap",
  marginLeft: "auto",
};

const SECTION_BOX: React.CSSProperties = {
  background: "linear-gradient(145deg, rgba(255,255,255,.045), rgba(255,255,255,.018))",
  border: "1px solid rgba(255,255,255,0.095)",
  borderRadius: 14,
  padding: "14px 15px",
  marginBottom: 12,
  boxShadow: "inset 0 1px 0 rgba(255,255,255,.035)",
};

const SECTION_HDR_ROW: React.CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  marginBottom: 9,
  gap: 8,
  flexWrap: "wrap",
};

const SECTION_LABEL: React.CSSProperties = {
  font: "600 10.5px/1 var(--font-ui)",
  color: "var(--text-2)",
  textTransform: "uppercase",
  letterSpacing: ".10em",
};

const SECTION_CAPTION: React.CSSProperties = {
  font: "500 9px/1 var(--font-ui)",
  color: "var(--muted)",
  fontStyle: "italic",
};

const BULLET_LIST: React.CSSProperties = {
  margin: 0,
  padding: 0,
  listStyle: "none",
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const BULLET_ITEM: React.CSSProperties = {
  display: "flex",
  gap: 10,
  alignItems: "flex-start",
};

const BULLET_NUMBER: React.CSSProperties = {
  flexShrink: 0,
  width: 20,
  height: 20,
  borderRadius: "50%",
  background: "rgba(var(--brand-rgb, 100 160 255) / 0.18)",
  border: "1px solid rgba(var(--brand-rgb, 100 160 255) / 0.30)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  font: "700 10px/1 var(--font-ui)",
  color: "var(--brand)",
};

const BULLET_TEXT: React.CSSProperties = {
  font: "500 12px/1.55 var(--font-ui)",
  color: "var(--text-2)",
};

const PROFIT_ROW: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "9px 10px",
  background: "rgba(255,255,255,0.035)",
  border: "1px solid rgba(255,255,255,0.07)",
  borderRadius: "var(--r-md)",
};

const PROFIT_LEVEL: React.CSSProperties = {
  font: "700 13px/1 var(--font-num)",
  fontVariantNumeric: "tabular-nums",
  color: "var(--text)",
  minWidth: 72,
};

const PROFIT_LABEL_BADGE: React.CSSProperties = {
  font: "600 9.5px/1 var(--font-ui)",
  color: "var(--brand)",
  background: "rgba(var(--brand-rgb, 100 160 255) / 0.12)",
  borderRadius: "var(--r-sm)",
  padding: "2px 6px",
  whiteSpace: "nowrap",
};

const PROFIT_ACTION: React.CSSProperties = {
  font: "500 11px/1.4 var(--font-ui)",
  color: "var(--text-2)",
  flex: 1,
};

const STATUS_CHIP: React.CSSProperties = {
  flexShrink: 0,
  font: "600 9.5px/1 var(--font-ui)",
  border: "1px solid",
  borderRadius: "var(--r-pill)",
  padding: "3px 8px",
  whiteSpace: "nowrap",
};

const THESIS_TEXT: React.CSSProperties = {
  font: "500 11.5px/1.65 var(--font-ui)",
  color: "var(--text-2)",
  margin: 0,
  whiteSpace: "pre-wrap",
};

// ── Confidence column styles ──────────────────────────────────────────────────

const CONFIDENCE_SCROLL: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: "12px 12px",
};

const CONF_HDR: React.CSSProperties = {
  marginBottom: 10,
  paddingBottom: 8,
  borderBottom: "1px solid rgba(255,255,255,0.08)",
};

const CONF_HDR_LABEL: React.CSSProperties = {
  font: "600 10.5px/1 var(--font-ui)",
  color: "var(--text-2)",
  textTransform: "uppercase",
  letterSpacing: ".10em",
};

const RR_ROW: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
  padding: "8px 10px",
  background: "rgba(255,255,255,0.033)",
  border: "1px solid rgba(255,255,255,0.09)",
  borderRadius: "var(--r-md)",
  marginBottom: 10,
};

const RR_LABEL: React.CSSProperties = {
  font: "600 10px/1 var(--font-ui)",
  color: "var(--text-2)",
};

const RR_VAL: React.CSSProperties = {
  font: "700 14px/1 var(--font-num)",
  fontVariantNumeric: "tabular-nums",
  color: "var(--text)",
};

const RR_SUB: React.CSSProperties = {
  font: "500 10px/1 var(--font-ui)",
  color: "var(--muted)",
};

const FULL_CENTER: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  height: "100%",
  font: "500 12px/1.5 var(--font-ui)",
  color: "var(--muted)",
};

const RETRY_BTN: React.CSSProperties = {
  font: "600 11px/1 var(--font-ui)",
  color: "var(--text-2)",
  background: "var(--panel-2)",
  border: "1px solid var(--line)",
  borderRadius: "var(--r-md)",
  padding: "7px 14px",
  cursor: "pointer",
};
