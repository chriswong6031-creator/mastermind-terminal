"use client";
/**
 * ProphetView — managed-pick desk for the Prophet tab.
 *
 * Layout (desktop):
 *   Left  — signal stream (list of SignalCards, sort controls, SIGNALS / PERF sub-tabs)
 *   Right — selected signal detail:
 *             top  → ticker header + direction badge + phase chip + honesty chips
 *             mid  → ConfidencePanel (arc + components + reason)
 *             bot  → GeometryRail (price levels + R-distances)
 *                  → OptionCard (hidden if null)
 *                  → Thesis + brief (machine-generated caption)
 *                  → PERF sub-tab placeholder
 *
 * State owned here:
 *   - raw fetch payload from /api/flow?f=prophet_idx
 *   - selectedId (which plan is loaded in right pane)
 *   - sort mode (new | best | gainers)
 *   - activeSubTab (signals | perf)
 *   - fetch error / loading
 *
 * HONESTY DOCTRINE:
 *   - Cadence chip: "nightly EOD — updates after close"
 *   - Authority chip: "display-only — forward ledger accruing"
 *   - Thesis rendered with "machine-generated from engine fields" caption
 *   - No "validated", no predictive copy
 *   - Empty state: "No active prophecies — ledger accruing."
 *   - PERF sub-tab: placeholder only ("outcome ledger accruing")
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useLang } from "@/lib/i18n";
import { makeProphetT } from "./prophetStrings";
import { SignalCard } from "./SignalCard";
import type { PlanSummary } from "./SignalCard";
import { ConfidencePanel } from "./ConfidencePanel";
import type { ConfidenceComponents } from "./ConfidencePanel";
import { GeometryRail } from "./GeometryRail";
import { OptionCard } from "./OptionCard";

// ── API payload types ─────────────────────────────────────────────────────────

interface ProphetIndexPayload {
  asof: string;
  cadence?: string;
  plans: PlanSummary[];
}

type SortMode = "new" | "best" | "gainers";
type SubTab   = "signals" | "perf";

// ── Sort helpers ──────────────────────────────────────────────────────────────

function sortPlans(plans: PlanSummary[], mode: SortMode): PlanSummary[] {
  const copy = [...plans];
  switch (mode) {
    case "new":
      // newest issuance first
      return copy.sort((a, b) => new Date(b.asof).getTime() - new Date(a.asof).getTime());
    case "best":
      // highest management_confidence first
      return copy.sort((a, b) => {
        const ca = a.state?.management_confidence ?? 0;
        const cb = b.state?.management_confidence ?? 0;
        return cb - ca;
      });
    case "gainers":
      // best live P&L vs plan first
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
  const abortRef = useRef<AbortController | null>(null);

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/flow?f=prophet_idx", { signal: ctrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: ProphetIndexPayload = await res.json();
      setPayload(data);
      // Auto-select first plan if none selected
      if (data.plans?.length > 0) {
        setSelectedId((id) => id ?? data.plans[0].id);
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setError((err as Error).message ?? "fetch error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    return () => abortRef.current?.abort();
  }, [fetchData]);

  // ── Derived ────────────────────────────────────────────────────────────────

  const plans       = payload?.plans ?? [];
  const sortedPlans = sortPlans(plans, sortMode);
  const selected    = sortedPlans.find((p) => p.id === selectedId) ?? sortedPlans[0] ?? null;

  // ── Render helpers ─────────────────────────────────────────────────────────

  function SortButton({ mode, label }: { mode: SortMode; label: string }) {
    return (
      <button
        style={{
          ...SORT_BTN,
          background: sortMode === mode ? "var(--brand)" : "var(--panel-2)",
          color: sortMode === mode ? "#fff" : "var(--text-2)",
          borderColor: sortMode === mode ? "var(--brand)" : "var(--line)",
        }}
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
    <div style={OUTER}>
      {/* ── LEFT — signal stream ── */}
      <div style={LEFT_PANE}>
        {/* Sub-tabs */}
        <div style={SUBTAB_ROW}>
          <SubTabButton tab="signals" label={t("tabSignals")} active={subTab} set={setSubTab} />
          <SubTabButton tab="perf"    label={t("tabPerf")}    active={subTab} set={setSubTab} />
          <div style={{ flex: 1 }} />
          {/* Cadence + authority chips */}
          <span style={INFO_CHIP}>{t("cadenceLabel")}</span>
        </div>

        {subTab === "signals" && (
          <>
            {/* Sort controls */}
            <div style={SORT_ROW}>
              <SortButton mode="new"     label={t("sortNew")} />
              <SortButton mode="best"    label={t("sortBest")} />
              <SortButton mode="gainers" label={t("sortGainers")} />
            </div>

            {/* Signal cards */}
            <div style={CARD_LIST}>
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

      {/* ── RIGHT — selected signal detail ── */}
      <div style={RIGHT_PANE}>
        {!selected ? (
          <div style={FULL_CENTER}>{t("noPlans")}</div>
        ) : (
          <SelectedDetail plan={selected} lang={lang} t={t} />
        )}
      </div>
    </div>
  );
}

// ── SelectedDetail sub-component ──────────────────────────────────────────────

function SelectedDetail({
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
  const dirBg    = isBear ? "rgba(240,86,107,.15)" : "rgba(38,194,129,.15)";

  const state      = plan.state;
  const confidence = state?.management_confidence ?? null;
  const components = (state as { components?: ConfidenceComponents } | null | undefined)?.components ?? null;
  const geometry   = state?.geometry ?? null;

  const t1 = plan.targets?.[0] ?? null;
  const t2 = plan.targets?.[1] ?? null;

  // Simple R/R from entry/stop/t1 prices
  const rrRatio: number | null =
    plan.entry != null && plan.invalidation != null && t1 != null
      ? Math.abs(t1 - plan.entry) / Math.abs(plan.entry - plan.invalidation)
      : null;

  return (
    <div style={DETAIL_SCROLL}>
      {/* Ticker header */}
      <div style={DETAIL_HEADER}>
        <span style={DETAIL_TICKER}>{plan.asset}</span>
        <span style={{ ...DIR_BADGE, background: dirBg, color: dirColor }}>
          {isBear ? `▼ ${t("bear")}` : `▲ ${t("bull")}`}
        </span>
        {/* Authority chip */}
        <span style={AUTH_CHIP}>{t("authorityLabel")}</span>
      </div>

      {/* Confidence panel */}
      <div style={{ marginBottom: 10 }}>
        <ConfidencePanel
          confidence={confidence}
          components={components}
          phase={state?.phase ?? null}
          change_reason={(state as { change_reason?: string | null } | null | undefined)?.change_reason ?? null}
          recommended_action={state?.recommended_action ?? null}
          lang={lang}
        />
      </div>

      {/* Geometry rail */}
      <div style={{ marginBottom: 10 }}>
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

      {/* Option card */}
      {plan.option_contract && (
        <div style={{ marginBottom: 10 }}>
          <OptionCard contract={plan.option_contract} lang={lang} />
        </div>
      )}

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

      {/* Thesis */}
      {(plan as unknown as { thesis?: string | null }).thesis && (
        <div style={THESIS_BOX}>
          <div style={THESIS_HEADER}>
            <span style={SECTION_LABEL}>{t("thesisLabel")}</span>
            <span style={THESIS_CAPTION}>{t("thesisCaption")}</span>
          </div>
          <p style={THESIS_TEXT}>{(plan as unknown as { thesis: string }).thesis}</p>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function SubTabButton({
  tab,
  label,
  active,
  set,
}: {
  tab: SubTab;
  label: string;
  active: SubTab;
  set: (t: SubTab) => void;
}) {
  const isActive = tab === active;
  return (
    <button
      style={{
        ...SUBTAB_BTN,
        color: isActive ? "var(--text)" : "var(--text-2)",
        borderBottom: isActive ? "2px solid var(--brand)" : "2px solid transparent",
      }}
      onClick={() => set(tab)}
    >
      {label}
    </button>
  );
}

// ── Style constants ───────────────────────────────────────────────────────────

const OUTER: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "320px 1fr",
  gap: 12,
  height: "100%",
  minHeight: 0,
  overflow: "hidden",
};

const LEFT_PANE: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  background: "var(--panel)",
  border: "1px solid var(--line)",
  borderRadius: "var(--r-lg)",
};

const RIGHT_PANE: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  minHeight: 0,
};

const SUBTAB_ROW: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  borderBottom: "1px solid var(--line)",
  padding: "0 10px",
  flexShrink: 0,
  gap: 4,
};

const SUBTAB_BTN: React.CSSProperties = {
  background: "none",
  border: "none",
  borderBottom: "2px solid transparent",
  padding: "9px 8px 7px",
  font: "600 11px/1 var(--font-ui)",
  cursor: "pointer",
  transition: "color var(--t)",
};

const SORT_ROW: React.CSSProperties = {
  display: "flex",
  gap: 4,
  padding: "8px 10px",
  flexShrink: 0,
  borderBottom: "1px solid var(--line-2)",
};

const SORT_BTN: React.CSSProperties = {
  font: "600 9.5px/1 var(--font-ui)",
  border: "1px solid",
  borderRadius: "var(--r-pill)",
  padding: "4px 9px",
  cursor: "pointer",
  transition: "background var(--t), color var(--t)",
};

const CARD_LIST: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: "6px 8px",
};

const INFO_CHIP: React.CSSProperties = {
  font: "500 9px/1 var(--font-ui)",
  color: "var(--muted)",
  border: "1px solid var(--line-2)",
  borderRadius: "var(--r-pill)",
  padding: "2px 6px",
  whiteSpace: "nowrap",
  margin: "6px 0",
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

const DETAIL_SCROLL: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: "12px 14px",
};

const DETAIL_HEADER: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  marginBottom: 12,
  flexWrap: "wrap",
};

const DETAIL_TICKER: React.CSSProperties = {
  font: "700 18px/1 var(--font-ui)",
  color: "var(--text)",
};

const DIR_BADGE: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  font: "700 11px/1 var(--font-ui)",
  borderRadius: "var(--r-pill)",
  padding: "4px 9px",
};

const AUTH_CHIP: React.CSSProperties = {
  marginLeft: "auto",
  font: "500 9.5px/1 var(--font-ui)",
  color: "var(--muted)",
  border: "1px solid var(--line-2)",
  borderRadius: "var(--r-pill)",
  padding: "3px 8px",
  whiteSpace: "nowrap",
};

const RR_ROW: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  flexWrap: "wrap",
  padding: "8px 12px",
  background: "var(--panel)",
  border: "1px solid var(--line)",
  borderRadius: "var(--r-md)",
  marginBottom: 10,
};

const RR_LABEL: React.CSSProperties = {
  font: "600 10px/1 var(--font-ui)",
  color: "var(--text-2)",
};

const RR_VAL: React.CSSProperties = {
  font: "700 13px/1 var(--font-num)",
  color: "var(--text)",
};

const RR_SUB: React.CSSProperties = {
  font: "500 10px/1 var(--font-ui)",
  color: "var(--muted)",
};

const THESIS_BOX: React.CSSProperties = {
  background: "var(--panel)",
  border: "1px solid var(--line)",
  borderRadius: "var(--r-lg)",
  padding: "10px 12px",
  marginBottom: 10,
};

const THESIS_HEADER: React.CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  marginBottom: 7,
  gap: 8,
  flexWrap: "wrap",
};

const SECTION_LABEL: React.CSSProperties = {
  font: "600 10px/1 var(--font-ui)",
  color: "var(--text-2)",
  textTransform: "uppercase",
  letterSpacing: ".06em",
};

const THESIS_CAPTION: React.CSSProperties = {
  font: "500 9px/1 var(--font-ui)",
  color: "var(--muted)",
  fontStyle: "italic",
};

const THESIS_TEXT: React.CSSProperties = {
  font: "500 11px/1.6 var(--font-ui)",
  color: "var(--text-2)",
  margin: 0,
  whiteSpace: "pre-wrap",
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
