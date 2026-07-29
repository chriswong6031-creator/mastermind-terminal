"use client";
/**
 * ProphetView — managed-pick desk for the Prophet tab.
 *
 * Layout (desktop) — THREE columns:
 *   LEFT   — the LEDGER: one slim row per plan, lifecycle rail, sort chips, SIGNALS/PERF
 *   CENTER — the DOSSIER: focus masthead → geometry ladder → thesis → stepper → profit plan
 *   RIGHT  — CONVICTION: fused verdict, component mix, R/R tiles, option overlay
 *
 * Narrow-width: CENTER and RIGHT stack vertically below LEFT.
 *
 * HONESTY DOCTRINE:
 *   - Masthead states the SOURCE, not just the cadence: these are factor-engine standouts,
 *     and options are context overlays that never generated the signal (D3 fix_spec 1).
 *   - Cadence chip: "nightly EOD — updates after close"
 *   - Authority: "display-only — forward ledger accruing"
 *   - Thesis rendered with "machine-generated from engine fields" caption
 *   - what_to_do_now rendered with "phase-keyed action guide — display only"
 *   - profit_plan rendered with "exit levels from engine geometry — display only", and
 *     de-emphasised when the wide-geometry guard trips
 *   - GAINERS sort is HIDDEN when no plan carries last_price (it would sort nothing)
 *   - No "validated", no predictive copy
 *   - Empty state: "No active prophecies — ledger accruing."
 *   - PERF sub-tab: placeholder only ("outcome ledger accruing")
 *   - Content blocks (what_to_do_now, profit_plan) hide gracefully when absent
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { flowGet } from "@/lib/flowClientCache";
import { useLang } from "@/lib/i18n";
import { makeProphetT } from "./prophetStrings";
import { SignalCard, phaseTone, planAsof, planConfidence, planPhase, planRecommendedAction } from "./SignalCard";
import type { PlanSummary } from "./SignalCard";
import { ConfidencePanel } from "./ConfidencePanel";
import type { ConfidenceComponents } from "./ConfidencePanel";
import { GeometryRail, geometryStretch } from "./GeometryRail";
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

/**
 * Masthead live dot gate: at least one mark in the feed is inside the RTH freshness
 * window. Outside that window the dot is absent rather than dimmed — a "live" light that
 * is on when nothing is live is the exact lie this desk is not allowed to tell.
 */
function marksAreFresh(marks: ProphetMarksPayload | null): boolean {
  const table = marks?.marks;
  if (!table) return false;
  const keys = Object.keys(table);
  if (keys.length === 0) return false;
  if (marks?._fixture === true) return true;
  const now = Date.now();
  for (const k of keys) {
    const ts = new Date(table[k].ts_utc).getTime();
    if (Number.isFinite(ts) && now - ts >= 0 && now - ts <= LIVE_MARK_WINDOW_MS) return true;
  }
  return false;
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

// ── Date formatting ───────────────────────────────────────────────────────────

function fmtDate(iso: string | null | undefined, lang: "en" | "zh"): string | null {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return iso.slice(0, 10) || null;
    return d.toLocaleDateString(lang === "zh" ? "zh-CN" : "en-US", {
      month: "short",
      day: "numeric",
      timeZone: "America/New_York",
    });
  } catch {
    return iso.slice(0, 10) || null;
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

  const plans = payload?.plans ?? [];
  // The producer publishes no last_price today, so a GAINERS sort would compare -Infinity
  // to -Infinity for every plan — a control that visibly does nothing. Gate it on data.
  const hasLastPrice = plans.some((p) => p.last_price != null);
  const effectiveSort: SortMode = sortMode === "gainers" && !hasLastPrice ? "new" : sortMode;
  const sortedPlans = sortPlans(plans, effectiveSort);
  const selected    = sortedPlans.find((p) => p.id === selectedId) ?? sortedPlans[0] ?? null;
  const activePlans = sortedPlans.filter((p) => planPhase(p) !== "invalidated").length;
  const marksFresh  = marksAreFresh(marks);
  const asofLabel   = fmtDate(payload?.asof, lang) ?? (lang === "zh" ? "等待更新" : "Awaiting close");

  // ── Render helpers ─────────────────────────────────────────────────────────

  function SortButton({ mode, label }: { mode: SortMode; label: string }) {
    return (
      <button
        className={`obs-chip obs-prophet-sort${sortMode === mode ? " on" : ""}`}
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
          {/* Provenance: the one line that stops an options-hub tab from implying its
              signals come from options flow. */}
          <p className="obs-prophet-source">{t("provenanceLine")}</p>
        </div>
        <div className="obs-prophet-status">
          <div className="obs-prophet-kpi">
            <span className="k">{t("mastheadActive")}</span>
            <b className="v num">{activePlans}</b>
          </div>
          <div className="obs-prophet-kpi">
            <span className="k">{t("mastheadFocus")}</span>
            <b className="v">{selected?.asset ?? "—"}</b>
          </div>
          <div className="obs-prophet-kpi">
            <span className="k">{t("mastheadUpdated")}</span>
            <b className="v num">{asofLabel}</b>
          </div>
          {marksFresh && (
            <div className="obs-prophet-kpi">
              <span className="k">{t("mastheadMarks")}</span>
              <b className="v">
                <span className="obs-live-dot" aria-hidden />
                {t("mastheadMarksLive")}
              </b>
            </div>
          )}
        </div>
      </header>

      <div className="obs-prophet-grid">
      {/* ── LEFT — the ledger ── */}
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
          <span className="obs-prophet-cadence">{t("cadenceLabel")}</span>
        </div>

        {subTab === "signals" && (
          <>
            <div className="obs-prophet-sortrow">
              <SortButton mode="new"     label={t("sortNew")} />
              <SortButton mode="best"    label={t("sortBest")} />
              {hasLastPrice && <SortButton mode="gainers" label={t("sortGainers")} />}
            </div>
            <div style={CARD_LIST} className="obs-scroll" role="listbox" aria-label={t("signalStreamTitle")}>
              {sortedPlans.length === 0 ? (
                <EmptyColumn t={t} />
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

      {/* ── CENTER — the dossier ── */}
      <div className="obs-card obs-prophet-pane obs-prophet-center" style={CENTER_PANE}>
        {!selected ? (
          <EmptyColumn t={t} center />
        ) : (
          <AnalysisPanel plan={selected} lang={lang} t={t} />
        )}
      </div>

      {/* ── RIGHT — conviction ── */}
      <div className="obs-card obs-prophet-pane obs-prophet-right" style={RIGHT_PANE}>
        {!selected ? (
          <EmptyColumn t={t} center />
        ) : (
          <ConfidenceColumn plan={selected} lang={lang} t={t} marks={marks} />
        )}
      </div>
      </div>
    </div>
  );
}

// ── EmptyColumn ───────────────────────────────────────────────────────────────
//
// An empty desk column has to say WHICH empty it is. All three columns are empty for
// the same reason — the nightly run published no plans — so they say the same thing
// instead of leaving the analysis panes looking merely unselected.

function EmptyColumn({
  t,
  center,
}: {
  t: ReturnType<typeof makeProphetT>;
  center?: boolean;
}) {
  return (
    <div style={center ? EMPTY_STATE_CENTER : EMPTY_STATE}>
      <div style={EMPTY_TITLE}>{t("noPlans")}</div>
      <div style={EMPTY_WHY}>{t("noPlansWhy")}</div>
    </div>
  );
}

// ── Band header ───────────────────────────────────────────────────────────────

function BandHead({
  label,
  caption,
  tag,
}: {
  label: string;
  caption?: string;
  tag?: React.ReactNode;
}) {
  return (
    <div className="obs-prophet-band-hd">
      <span className="obs-prophet-band-lbl">{label}</span>
      {tag}
      {caption && <span className="obs-prophet-band-cap">{caption}</span>}
    </div>
  );
}

// ── Thesis sentence split ─────────────────────────────────────────────────────
//
// The engine appends a dealer-positioning sentence to the thesis. It is options CONTEXT,
// not a driver of the pick, so it is lifted out of the prose into its own note instead of
// sitting mid-paragraph where it reads like a reason the signal fired.

const POSITIONING_HINTS = [
  "dealer", "open interest", "call wall", "put wall", "gamma", "positioning",
  "做市商", "未平仓", "持仓", "伽马", "看涨墙", "看跌墙",
];

/**
 * Sentence scanner that does not break on decimals: an ASCII terminator only ends a
 * sentence when whitespace follows it ("$290.00," never does; "…the level. Dealers…" does).
 */
function splitSentences(text: string): string[] {
  const out: string[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const cjkEnd = ch === "。" || ch === "！" || ch === "？";
    const asciiEnd = ch === "." || ch === "!" || ch === "?";
    if (!cjkEnd && !asciiEnd) continue;
    if (asciiEnd) {
      const next = text[i + 1];
      if (next !== undefined && !/\s/.test(next)) continue;
    }
    let j = i + 1;
    while (j < text.length && /\s/.test(text[j])) j++;
    out.push(text.slice(start, j));
    start = j;
  }
  if (start < text.length) out.push(text.slice(start));
  return out.filter((s) => s.trim().length > 0);
}

function splitPositioning(text: string): { body: string; note: string | null } {
  const parts = splitSentences(text);
  if (parts.length < 2) return { body: text, note: null };
  const idx = parts.findIndex((s) => {
    const low = s.toLowerCase();
    return POSITIONING_HINTS.some((h) => low.includes(h));
  });
  if (idx < 0) return { body: text, note: null };
  const note = parts[idx].trim();
  const body = parts.filter((_, i) => i !== idx).join("").trim();
  if (!body || !note) return { body: text, note: null };
  return { body, note };
}

// ── AnalysisPanel (CENTER column — the dossier) ───────────────────────────────

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

  const phase      = planPhase(plan);
  const state      = plan.state;
  const geometry   = state?.geometry ?? null;
  const t1 = plan.targets?.[0] ?? null;
  const t2 = plan.targets?.[1] ?? null;

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
  // Shared with SignalCard + ConfidencePanel — one phase, one colour, everywhere.
  const phaseColor = phaseTone(phase);

  // What-to-do-now from payload — prefer ZH variant when lang is zh.
  const whatToDo = (lang === "zh" && plan.what_to_do_now_zh?.length)
    ? plan.what_to_do_now_zh
    : plan.what_to_do_now;
  // Profit plan from payload — prefer ZH variant when lang is zh.
  const profitPlan = (lang === "zh" && plan.profit_plan_zh?.length)
    ? plan.profit_plan_zh
    : plan.profit_plan;
  // Thesis from payload — prefer ZH variant when lang is zh.
  const thesisRaw = (lang === "zh" && plan.thesis_zh) ? plan.thesis_zh : plan.thesis;
  const thesis = thesisRaw ? splitPositioning(thesisRaw) : null;

  const signalOn   = fmtDate(planAsof(plan), lang);
  const conviction = plan._conviction_score ?? null;
  // One verdict per plan, shared by the ladder and the profit table.
  const stretch = geometryStretch(plan.entry, plan.invalidation, t2 ?? t1);

  return (
    <div className="obs-scroll obs-prophet-analysis obs-prophet-stage">
      {/* ── Band 1 — focus masthead ── */}
      <div className="obs-prophet-focus">
        <div className="obs-prophet-focus-id">
          <span className="obs-prophet-focus-tkr">{plan.asset}</span>
          <span className="obs-tag" style={{ "--c": dirColor } as React.CSSProperties}>
            {isBear ? `▼ ${t("bear")}` : `▲ ${t("bull")}`}
          </span>
          {phaseLabel && (
            <span className="obs-tag" style={{ "--c": phaseColor } as React.CSSProperties}>
              {phaseLabel}
            </span>
          )}
        </div>
        {(signalOn || conviction != null) && (
          <div className="obs-prophet-focus-meta">
            {signalOn && (
              <span>{t("dossierSignalOn")} <b className="num">{signalOn}</b></span>
            )}
            {conviction != null && (
              <span>{t("dossierConviction")} <b className="num">{conviction.toFixed(0)}</b></span>
            )}
          </div>
        )}
        {/* Per-plan provenance — where this row came from, how often it moves, what it is. */}
        <div className="fin-asof obs-prophet-prov">
          <span>{t("provSource")}</span>
          <span aria-hidden>·</span>
          <span>{t("provCadence")}</span>
          <span aria-hidden>·</span>
          <span>{t("provAuthority")}</span>
        </div>
      </div>

      <div className="obs-card-hr" />

      {/* ── Band 2 — geometry ladder ── */}
      <section className="obs-prophet-band">
        <BandHead label={t("geometryTitle")} />
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
      </section>

      {/* ── Band 3 — thesis ── */}
      {thesis && (
        <>
          <div className="obs-card-hr" />
          <section className="obs-prophet-band">
            <BandHead label={t("thesisLabel")} caption={t("thesisCaption")} />
            <p className="obs-prophet-thesis">{thesis.body}</p>
            {thesis.note && (
              <div className="obs-note obs-prophet-positioning">
                <span className="obs-prophet-positioning-k">{t("positioningLabel")}</span>
                {thesis.note}
              </div>
            )}
          </section>
        </>
      )}

      {/* ── Band 4 — what to do now ── */}
      {whatToDo && whatToDo.length > 0 && (
        <>
          <div className="obs-card-hr" />
          <section className="obs-prophet-band">
            <BandHead
              label={t("briefLabel")}
              caption={t("briefCaption")}
              tag={
                <span className="fin-tag" style={{ "--c": "var(--muted)" } as React.CSSProperties}>
                  {t("tagDisplayOnly")}
                </span>
              }
            />
            <ol className="obs-prophet-steps">
              {whatToDo.map((line, i) => (
                <li key={i} className={`obs-prophet-step${i === 0 ? " is-now" : ""}`}>
                  <span className="obs-prophet-step-n num" aria-hidden>{i + 1}</span>
                  <span className="obs-prophet-step-t">{line}</span>
                </li>
              ))}
            </ol>
          </section>
        </>
      )}

      {/* ── Band 5 — profit-taking plan ── */}
      {profitPlan && profitPlan.length > 0 && (
        <>
          <div className="obs-card-hr" />
          <section className="obs-prophet-band">
            <BandHead
              label={t("profitPlanLabel")}
              caption={t("profitPlanCaption")}
              tag={stretch.wide ? (
                <span className="fin-tag" style={{ "--c": "var(--warn)" } as React.CSSProperties}>
                  {t("wideGeomTag")}
                </span>
              ) : undefined}
            />
            <div className="obs-prophet-ptable" role="table">
              <div className="obs-prophet-ptr obs-prophet-ptr-hd" role="row">
                <span role="columnheader">{t("profitColLevel")}</span>
                <span role="columnheader">{t("profitColAction")}</span>
                <span role="columnheader">{t("profitColStatus")}</span>
              </div>
              {profitPlan.map((row, i) => (
                <ProfitRow
                  key={i}
                  row={row}
                  t={t}
                  entry={plan.entry}
                  isBear={isBear}
                  wide={stretch.wide}
                />
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

// ── ProfitRow ─────────────────────────────────────────────────────────────────

function ProfitRow({
  row,
  t,
  entry,
  isBear,
  wide,
}: {
  row: NonNullable<PlanSummary["profit_plan"]>[number];
  t: ReturnType<typeof makeProphetT>;
  entry: number | null;
  isBear: boolean;
  wide: boolean;
}) {
  const statusColor =
    row.status === "DONE"    ? "var(--muted)" :
    row.status === "ACTIVE"  ? "var(--up)" :
    "var(--text-dim)";
  const statusLabel =
    row.status === "DONE"    ? t("profitStatusDone") :
    row.status === "ACTIVE"  ? t("profitStatusActive") :
    t("profitStatusPending");

  // A row tints by which side of entry its level sits on — the target side rides --up,
  // the risk side --down, so a stop row can never wear the colour of a win.
  const onTargetSide =
    row.level != null && entry != null
      ? (isBear ? row.level < entry : row.level > entry)
      : null;
  const levelColor =
    onTargetSide == null ? "var(--muted)" : onTargetSide ? "var(--up)" : "var(--down)";
  // Wide geometry de-emphasises the projected targets — visible, never hidden.
  const dim = row.status === "DONE" || (wide && onTargetSide === true);

  return (
    <div
      className={`obs-prophet-ptr${dim ? " dim" : ""}`}
      role="row"
      style={{ "--c": levelColor } as React.CSSProperties}
    >
      <span className="obs-prophet-ptr-lvl" role="cell">
        <b className="num">{row.level != null ? `$${row.level.toFixed(2)}` : "—"}</b>
        <i>{row.label}</i>
      </span>
      <span
        className="obs-prophet-ptr-act"
        role="cell"
        style={{ textDecoration: row.status === "DONE" ? "line-through" : "none" }}
      >
        {row.action}
      </span>
      <span className="obs-prophet-ptr-st" role="cell">
        <span className="fin-tag" style={{ "--c": statusColor } as React.CSSProperties}>
          {statusLabel}
        </span>
      </span>
    </div>
  );
}

// ── ConfidenceColumn (RIGHT column — conviction) ─────────────────────────────

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

  const riskAbs =
    plan.entry != null && plan.invalidation != null ? Math.abs(plan.entry - plan.invalidation) : null;
  const rewardAbs = plan.entry != null && t1 != null ? Math.abs(t1 - plan.entry) : null;
  const rrRatio: number | null =
    riskAbs != null && riskAbs > 0 && rewardAbs != null ? rewardAbs / riskAbs : null;
  const horizonPct = geometry?.horizon_pct_used ?? null;

  return (
    <div className="obs-scroll obs-prophet-confidence-column obs-prophet-conviction">
      <div className="fin-eyebrow obs-prophet-conv-eyebrow">{t("confidenceEyebrow")}</div>

      <ConfidencePanel
        confidence={confidence}
        components={components}
        phase={planPhase(plan)}
        change_reason={(state as { change_reason?: string | null } | null | undefined)?.change_reason ?? null}
        recommended_action={planRecommendedAction(plan)}
        lang={lang}
      />

      {/* R/R — two tiles, so risk and reward are read as two facts, not one ratio. */}
      {(riskAbs != null || rewardAbs != null) && (
        <div className="obs-prophet-rr">
          <div className="obs-prophet-rr-hd">
            <span className="fin-eyebrow">{t("rrLabel")}</span>
            {rrRatio != null && (
              <span className="fin-tag num" style={{ "--c": "var(--text-2)" } as React.CSSProperties}>
                {rrRatio.toFixed(2)}
              </span>
            )}
          </div>
          <div className="obs-prophet-rr-tiles">
            {riskAbs != null && (
              <div className="obs-prophet-tile" style={{ "--c": "var(--down)" } as React.CSSProperties}>
                <span className="k">{t("rrRiskTile")}</span>
                <b className="v num">${riskAbs.toFixed(2)}</b>
              </div>
            )}
            {rewardAbs != null && (
              <div className="obs-prophet-tile" style={{ "--c": "var(--up)" } as React.CSSProperties}>
                <span className="k">{t("rrRewardTile")}</span>
                <b className="v num">${rewardAbs.toFixed(2)}</b>
              </div>
            )}
          </div>
          {/* Horizon meter renders ONLY when the payload carries the number. */}
          {horizonPct != null && (
            <div className="obs-prophet-horizon">
              <div className="obs-prophet-horizon-hd">
                <span>{t("horizonMeter")}</span>
                <b className="num">{horizonPct.toFixed(0)}%</b>
              </div>
              <div className="obs-prophet-meter">
                <div
                  className="obs-prophet-meter-fill"
                  style={{ width: `${Math.max(0, Math.min(100, horizonPct))}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Option card — with live-mark overlay if fresh */}
      {plan.option_contract && (() => {
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
  // Wrap rather than squeeze: the cadence chip is a doctrine string that must not be
  // truncated, and at a 270px ledger it would otherwise crush the PERF tab.
  flexWrap: "wrap",
  borderBottom: "1px solid var(--hairline)",
  padding: "7px 10px",
  flexShrink: 0,
  gap: 6,
};

const CARD_LIST: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: "6px 8px",
};

const EMPTY_STATE: React.CSSProperties = {
  padding: "32px 16px",
  font: "500 12px/1.5 var(--font-ui)",
  color: "var(--muted)",
  textAlign: "center",
};

/* center-column variant: fills the pane and stacks title over the why-line */
const EMPTY_STATE_CENTER: React.CSSProperties = {
  ...EMPTY_STATE,
  flex: 1,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  padding: "48px 24px",
};

const EMPTY_TITLE: React.CSSProperties = {
  font: "600 14px/1.25 var(--font-ui)",
  color: "var(--text-2)",
};

const EMPTY_WHY: React.CSSProperties = {
  font: "500 11px/1.5 var(--font-ui)",
  color: "var(--muted)",
  maxWidth: 420,
  margin: "0 auto",
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
