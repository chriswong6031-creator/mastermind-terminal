"use client";
/**
 * PrismView — PRISM tab orchestrator.
 *
 * SINGLE mode: ticker input (default SPY), MatrixGrid + right rail
 *   (HeatSeekerCard + OiMoversRail).
 * CONFLUENCE mode: ConfluenceView (SPY + QQQ + IWM side-by-side).
 *
 * Controls (MomoEdge parity):
 *   - Ticker input, commits on Enter/blur
 *   - SINGLE | CONFLUENCE mode toggle
 *   - DTE column count: 4 | 8 (default 4 = spacious; 8 = tighter)
 *   - Expiry scope: DEFAULT | 0DTE | ALL
 *   - Strike range: ±10 | ±20 | ±40 (default ±10, centered on spot, no scroll)
 *   - Normalization: PER-COL | GLOBAL
 *   - LensBar (GEX | OI | VOL | ΔOI; VEX + UNUSUAL disabled)
 *
 * HONESTY DOCTRINE:
 *   - GEX sign is assumed dealer-short convention — displayed in LensBar tooltip.
 *   - "descriptive — not a recommendation" on HeatSeeker pick.
 *   - VEX and UNUSUAL are rendered disabled with honest labels.
 *   - No "validated", "predictive", or asserted-direction copy.
 *   - Confluence is index-only; noted prominently.
 */

import React, { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { useLang } from "@/lib/i18n";
import { makePrismT } from "./prismStrings";
import { LensBar, type ActiveLens } from "./LensBar";
import { MatrixGrid, type MatrixCell, type MatrixLevels } from "./MatrixGrid";
import { HeatSeekerCard, type HeatSeekerPick } from "./HeatSeekerCard";
import { OiMoversRail, type OiMoverRow } from "./OiMoversRail";
import { ConfluenceView } from "./ConfluenceView";
import { flowGet } from "@/lib/flowClientCache";
import { trackSearch } from "@/lib/searchTrack";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MatrixPayload {
  schema: string;
  asof: string;
  root: string;
  spot: number;
  expiries: string[];
  strikes: number[];
  cells: MatrixCell[];
  levels: MatrixLevels;
  heat_seeker: HeatSeekerPick | null;
  authority_tier?: string;
}

interface GexStatePayload {
  root?: string;
  spot?: number;
  call_wall?: number | null;
  put_wall?: number | null;
  gamma_flip?: number | null;
  magnet?: number | null;
  hvl?: number | null;
  max_pain?: number | null;
}

interface OiPayload {
  schema: string;
  asof: string;
  movers: OiMoverRow[];
}

// ─── Mode / control types ─────────────────────────────────────────────────────

type Mode = "single" | "confluence";
/** 0DTE scope: only expirations with dte < 1. ALL scope: all, showing only Σ column. */
type ScopeMode = "default" | "0dte" | "all";
type DteColCount = 4 | 8;
type StrikeRange = 10 | 20 | 40;
type NormMode = "column" | "global";

// ─── Fetch helpers ────────────────────────────────────────────────────────────

async function safeFetch<T>(url: string): Promise<T | null> {
  try {
    const f = new URL(url, "http://x").searchParams.get("f") ?? url;
    const data = await flowGet(f);
    return (data as T) ?? null;
  } catch {
    return null;
  }
}

const POLL_MS = 60_000;

// ─── Expiry date helpers ──────────────────────────────────────────────────────

function expDate(exp: string): string {
  return (exp || "").split(" ")[0].split("T")[0];
}

function dteDays(exp: string): number {
  try {
    const now = Date.now();
    const ms = new Date(expDate(exp) + "T20:00:00Z").getTime();
    if (!Number.isFinite(ms)) return -1;
    return Math.round((ms - now) / 86_400_000);
  } catch {
    return 0;
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PrismView() {
  const { lang } = useLang();
  const t = makePrismT(lang);

  // ── State ────────────────────────────────────────────────────────────────────
  const [ticker, setTicker]             = useState("SPY");
  const [inputVal, setInputVal]         = useState("SPY");
  const [mode, setMode]                 = useState<Mode>("single");
  const [activeLens, setLens]           = useState<ActiveLens>("GEX");
  const [scope, setScope]               = useState<ScopeMode>("default");
  const [dteColCount, setDteColCount]   = useState<DteColCount>(4);
  const [strikeRange, setStrikeRange]   = useState<StrikeRange>(10);
  const [norm, setNorm]                 = useState<NormMode>("column");

  const [matrix, setMatrix]             = useState<MatrixPayload | null>(null);
  const [gexState, setGexState]         = useState<GexStatePayload | null>(null);
  const [oiPayload, setOiPayload]       = useState<OiPayload | null>(null);

  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Fetch functions ───────────────────────────────────────────────────────────

  const fetchMatrix = useCallback(async (root: string): Promise<MatrixPayload | null> => {
    if (document.visibilityState === "hidden") return null;
    const data = await safeFetch<MatrixPayload | Record<string, MatrixPayload>>(
      `/api/flow?f=matrix:${root}`
    );
    if (!data) return null;
    const payload: MatrixPayload | null =
      (data as Record<string, MatrixPayload>)[root] ??
      (data as unknown as MatrixPayload) ?? null;
    // A payload without a cells array — the fixture's honest {} for an unknown root, or a
    // malformed upstream doc — must resolve to null: MatrixGrid iterates cells/strikes
    // unconditionally, and null is what routes to the desk's placeholder states, the same
    // place a prod 503 for a missing-matrix root lands (GexDeskView convention).
    if (!Array.isArray(payload?.cells)) return null;
    return payload;
  }, []);

  const fetchGexState = useCallback(async (root: string) => {
    const data = await safeFetch<GexStatePayload>(`/api/flow?f=gexstate:${root}`);
    setGexState(data);
  }, []);

  const fetchOi = useCallback(async () => {
    // /api/flow?f=oi returns the OiPayload FLAT (has `movers`) — both the fixture
    // (screener_fixture.oi) and prod (R2 options_hub/oi_movers.json). The old
    // `{ oi: ... }` wrapper never existed, so the rail rendered empty forever.
    const data = await safeFetch<OiPayload & { oi?: OiPayload }>("/api/flow?f=oi");
    const payload = data?.oi ?? data;
    if (payload?.movers) setOiPayload(payload);
  }, []);

  // ── Load on ticker change ─────────────────────────────────────────────────────

  const loadTicker = useCallback(
    async (root: string) => {
      // If the tab is hidden at mount time (e.g. cmd-click open, session restore),
      // fetchMatrix returns null immediately via its own visibility guard — that null
      // is NOT a real failure. Skip the load silently; the visibilitychange handler
      // below will retry once the tab is foregrounded.
      if (document.visibilityState === "hidden") return;
      setLoading(true);
      setMatrix(null);
      setError(false);
      const [payload] = await Promise.all([
        fetchMatrix(root),
        fetchGexState(root),
        fetchOi(),
      ]);
      if (payload) {
        setMatrix(payload);
      } else {
        setError(true);
      }
      setLoading(false);
    },
    [fetchMatrix, fetchGexState, fetchOi]
  );

  // ── Polling ───────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (mode !== "single") return;
    void loadTicker(ticker);

    pollRef.current = setInterval(() => {
      void fetchMatrix(ticker).then((p) => p && setMatrix(p));
      void fetchGexState(ticker);
    }, POLL_MS);

    // If the tab was hidden at mount, loadTicker returned early without data.
    // Retry the full load when the tab is foregrounded while matrix is still null.
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        setMatrix((prev) => { if (prev === null) void loadTicker(ticker); return prev; });
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      document.removeEventListener("visibilitychange", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticker, mode]);

  useEffect(() => {
    void fetchOi();
    const id = setInterval(() => void fetchOi(), POLL_MS);
    return () => clearInterval(id);
  }, [fetchOi]);

  // ── Ticker input ──────────────────────────────────────────────────────────────

  const commitTicker = useCallback(() => {
    const root = inputVal.trim().toUpperCase();
    if (root && root !== ticker) { trackSearch(root, "prism-desk", inputVal.trim() || undefined); setTicker(root); }
  }, [inputVal, ticker]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") commitTicker();
    },
    [commitTicker]
  );

  // ── Derived: merged levels from matrix + gexstate ────────────────────────────

  const levels: MatrixLevels = {
    call_wall:   matrix?.levels?.call_wall   ?? gexState?.call_wall  ?? null,
    put_support: matrix?.levels?.put_support ?? gexState?.put_wall   ?? null,
    hvl:         matrix?.levels?.hvl         ?? gexState?.hvl        ?? gexState?.magnet ?? null,
    gamma_flip:  matrix?.levels?.gamma_flip  ?? gexState?.gamma_flip ?? null,
    max_pain:    matrix?.levels?.max_pain    ?? null,
  };

  // Format asof — show the DATE (not just the time) plus a staleness hint, so a
  // Friday snapshot viewed on Saturday reads honestly as last-session data rather
  // than a bare "as of 16:59" that silently drops the day.
  let asofStr = "";
  let asofStale = false;   // asof is on a prior ET calendar day
  let asofAgeStr = "";     // "last session" / "{n}d old"
  if (matrix?.asof) {
    try {
      const d = new Date(String(matrix.asof).replace(" ", "T"));
      asofStr = d.toLocaleString("en-US", {
        weekday: "short", month: "short", day: "numeric",
        hour: "2-digit", minute: "2-digit", hour12: false,
        timeZone: "America/New_York",
      }) + " ET";
      // ET calendar-day age (days between the asof date and today, in ET).
      const etDay = (dt: Date) => dt.toLocaleDateString("en-CA", { timeZone: "America/New_York" }); // YYYY-MM-DD
      const asofDay = etDay(d);
      const todayDay = etDay(new Date());
      const ageDays = Math.round((Date.parse(todayDay) - Date.parse(asofDay)) / 86_400_000);
      if (ageDays > 0) {
        asofStale = true;
        asofAgeStr = ageDays <= 1 ? t("lastSession") : t("daysOld").replace("{n}", String(ageDays));
      }
    } catch {
      asofStr = matrix.asof.slice(0, 16).replace("T", " ");
    }
  }

  // ── OI movers filtered to current ticker in SINGLE mode ──────────────────────
  const tickerMovers: OiMoverRow[] =
    oiPayload?.movers.filter((m) => m.root === ticker) ?? [];

  // ── Scope → effective expiries list ──────────────────────────────────────────
  //
  // "default" → pass expiries as-is; MatrixGrid caps at dteColCount
  // "0dte"    → filter to dte < 1; MatrixGrid caps at dteColCount
  // "all"     → all expiries (Σ column is the primary read; MatrixGrid still shows cols)
  //
  const effectiveExpiries = useMemo((): string[] => {
    if (!matrix?.expiries) return [];
    if (scope === "0dte") {
      const zeroDte = matrix.expiries.filter((e) => dteDays(e) < 1);
      return zeroDte.length > 0 ? zeroDte : matrix.expiries.slice(0, 1);
    }
    return matrix.expiries;
  }, [matrix, scope]);

  // In ALL scope we show more columns but emphasize Σ
  const effectiveDteColCount: DteColCount = scope === "all" ? 8 : dteColCount;

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div style={VIEW_OUTER} className="obs obs-ambient">

      {/* ── Controls bar ──────────────────────────────────────────────────── */}
      <div style={CONTROLS_BAR}>

        {/* Ticker input */}
        <div style={TICKER_GROUP}>
          <input
            style={{
              ...TICKER_INPUT,
              opacity: mode === "confluence" ? 0.4 : 1,
              pointerEvents: mode === "confluence" ? "none" : "auto",
            }}
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value.toUpperCase())}
            onBlur={commitTicker}
            onKeyDown={handleKeyDown}
            placeholder={t("tickerPlaceholder")}
            aria-label={t("tickerLabel")}
            spellCheck={false}
            maxLength={12}
            disabled={mode === "confluence"}
          />
          {matrix?.spot != null && mode === "single" && (
            <span className="num" style={SPOT_DISPLAY}>
              {t("spotLabel")} {matrix.spot.toFixed(2)}
            </span>
          )}
        </div>

        {/* SINGLE | CONFLUENCE mode toggle */}
        <div style={MODE_TOGGLE}>
          {(["single", "confluence"] as Mode[]).map((m) => (
            <button
              key={m}
              style={{
                ...MODE_BTN,
                ...(mode === m ? MODE_BTN_ACTIVE : {}),
              }}
              onClick={() => setMode(m)}
              aria-pressed={mode === m}
            >
              {m === "single" ? t("modeSingle") : t("modeConfluence")}
            </button>
          ))}
        </div>

        {/* Right: asof + status */}
        <div style={CONTROLS_RIGHT}>
          {asofStr && mode === "single" && (
            <span className="num" style={asofStale ? ASOF_BADGE_STALE : ASOF_BADGE}>
              {t("asOf")} {asofStr}
              {asofStale && <span style={{ marginLeft: 5, fontWeight: 600 }}>· {asofAgeStr}</span>}
            </span>
          )}
          {loading && <span style={STATUS_LOADING}>{t("loading")}</span>}
          {error && !loading && <span style={STATUS_ERROR}>{t("errorMatrix")}</span>}
        </div>
      </div>

      {/* ── Secondary toolbar: lens + DTE count + scope + range + norm ─── */}
      {mode === "single" && (
        <div style={TOOLBAR_ROW}>

          {/* LensBar */}
          <LensBar activeLens={activeLens} onLens={setLens} lang={lang} />

          {/* Separator */}
          <div style={TOOLBAR_SEP} />

          {/* DTE column count: 4 | 8 — default scoped */}
          <div style={CHIP_GROUP}>
            {([4, 8] as DteColCount[]).map((n) => (
              <button
                key={n}
                className={`obs-chip${dteColCount === n && scope === "default" ? " on" : ""}`}
                style={CHIP_SM}
                onClick={() => { setDteColCount(n); setScope("default"); }}
                aria-pressed={dteColCount === n && scope === "default"}
              >
                {n}
              </button>
            ))}
          </div>

          {/* Scope: DEFAULT | 0DTE | ALL */}
          <div style={CHIP_GROUP}>
            {(["default", "0dte", "all"] as ScopeMode[]).map((s) => (
              <button
                key={s}
                className={`obs-chip${scope === s ? " on" : ""}`}
                style={CHIP_SM}
                onClick={() => setScope(s)}
                aria-pressed={scope === s}
              >
                {s === "default" ? t("scopeDefault") : s === "0dte" ? t("scope0dte") : t("scopeAll")}
              </button>
            ))}
          </div>

          {/* Separator */}
          <div style={TOOLBAR_SEP} />

          {/* Strike range: ±10 | ±20 | ±40 (centered on spot) */}
          <div style={CHIP_GROUP}>
            {([10, 20, 40] as StrikeRange[]).map((r) => (
              <button
                key={r}
                className={`obs-chip${strikeRange === r ? " on" : ""}`}
                style={CHIP_SM}
                onClick={() => setStrikeRange(r)}
                aria-pressed={strikeRange === r}
              >
                {r === 10 ? t("range10") : r === 20 ? t("range20") : t("range40")}
              </button>
            ))}
          </div>

          {/* Separator */}
          <div style={TOOLBAR_SEP} />

          {/* Normalization: PER-COL | GLOBAL */}
          <div style={CHIP_GROUP}>
            {(["column", "global"] as NormMode[]).map((n) => (
              <button
                key={n}
                className={`obs-chip${norm === n ? " on" : ""}`}
                style={CHIP_SM}
                onClick={() => setNorm(n)}
                aria-pressed={norm === n}
              >
                {n === "column" ? t("normColumn") : t("normGlobal")}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Honesty banner ────────────────────────────────────────────────── */}
      {(activeLens === "GEX" || activeLens === "DOI") && mode === "single" && (
        <div className="obs-note" style={HONESTY_BANNER_OBS}>
          {t("magnitudeFirst")}
        </div>
      )}

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      {mode === "confluence" ? (
        <ConfluenceView
          fetchMatrix={fetchMatrix}
          activeLens={activeLens}
          lang={lang}
        />
      ) : (
        <div style={BODY_ROW}>

          {/* ── Left: matrix ──────────────────────────────────────────── */}
          <div style={MATRIX_PANE}>
            {loading && !matrix ? (
              <div style={CENTER_PLACEHOLDER}>{t("loadingMatrix")}</div>
            ) : error ? (
              <div style={CENTER_PLACEHOLDER}>{t("errorMatrix")}</div>
            ) : !matrix ? (
              <div style={CENTER_PLACEHOLDER}>{t("noData")}</div>
            ) : (
              <MatrixGrid
                cells={matrix.cells}
                expiries={effectiveExpiries}
                strikes={matrix.strikes}
                spot={matrix.spot}
                levels={levels}
                activeLens={activeLens}
                norm={norm}
                dteColCount={effectiveDteColCount}
                strikeRange={strikeRange}
                lang={lang}
              />
            )}
          </div>

          {/* ── Right rail ────────────────────────────────────────────── */}
          <div style={RIGHT_RAIL}>
            <HeatSeekerCard
              pick={matrix?.heat_seeker ?? null}
              spot={matrix?.spot ?? null}
              lang={lang}
            />
            <div style={RAIL_DIVIDER} />
            <OiMoversRail
              movers={tickerMovers}
              lang={lang}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Layout styles ────────────────────────────────────────────────────────────

const VIEW_OUTER: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  flex: 1,
  height: "100%",
  overflow: "hidden",
  background: "var(--bg)",
};

const CONTROLS_BAR: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "6px 14px",
  borderBottom: "1px solid var(--line)",
  background: "var(--panel)",
  flexShrink: 0,
  flexWrap: "wrap",
};

const TICKER_GROUP: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const TICKER_INPUT: React.CSSProperties = {
  width: 78,
  height: 26,
  padding: "0 8px",
  background: "var(--inset)",
  border: "1px solid var(--line)",
  borderRadius: "var(--r-md)",
  color: "var(--text)",
  fontSize: 13,
  fontWeight: 700,
  textAlign: "center",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  outline: "none",
  fontVariantNumeric: "tabular-nums",
};

const SPOT_DISPLAY: React.CSSProperties = {
  fontSize: 11,
  color: "var(--text-2)",
  fontVariantNumeric: "tabular-nums",
  fontWeight: 600,
};

const MODE_TOGGLE: React.CSSProperties = {
  display: "flex",
  border: "1px solid var(--line)",
  borderRadius: "var(--r-md)",
  overflow: "hidden",
};

const MODE_BTN: React.CSSProperties = {
  padding: "3px 10px",
  height: 26,
  background: "transparent",
  border: "none",
  color: "var(--text-2)",
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.06em",
  cursor: "pointer",
  transition: "background 0.1s, color 0.1s",
};

/** Brand-tinted active state (foundation recipe), not a flat fill. */
const MODE_BTN_ACTIVE: React.CSSProperties = {
  background: "color-mix(in srgb, var(--brand) 17%, transparent)",
  boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--brand) 36%, transparent)",
  color: "var(--brand-2)",
};

const CONTROLS_RIGHT: React.CSSProperties = {
  marginLeft: "auto",
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const ASOF_BADGE: React.CSSProperties = {
  fontSize: 9,
  color: "var(--muted)",
  fontVariantNumeric: "tabular-nums",
};

// Amber when the snapshot is from a prior session (weekend / >1 day old) — makes
// "not today" explicit instead of silently dropping the date.
const ASOF_BADGE_STALE: React.CSSProperties = {
  fontSize: 9,
  color: "var(--warn)",
  fontVariantNumeric: "tabular-nums",
};

const STATUS_LOADING: React.CSSProperties = {
  fontSize: 9,
  color: "var(--brand-2)",
};

const STATUS_ERROR: React.CSSProperties = {
  fontSize: 9,
  color: "var(--down)",
};

/** Secondary toolbar row: all PRISM-specific controls */
const TOOLBAR_ROW: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 4,
  padding: "4px 14px",
  borderBottom: "1px solid var(--line)",
  background: "var(--panel)",
  flexShrink: 0,
  flexWrap: "wrap",
  minHeight: 36,
};

const TOOLBAR_SEP: React.CSSProperties = {
  width: 1,
  height: 20,
  background: "var(--line)",
  margin: "0 4px",
  flexShrink: 0,
};

const CHIP_GROUP: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 3,
};

const CHIP_LABEL_SM: React.CSSProperties = {
  fontSize: 8,
  color: "var(--muted)",
  letterSpacing: "0.05em",
  textTransform: "uppercase",
  marginRight: 2,
};

/** Compact chip override for the toolbar row */
const CHIP_SM: React.CSSProperties = {
  padding: "2px 8px",
  fontSize: 9,
  borderRadius: 6,
  height: 22,
};

const HONESTY_BANNER_OBS: React.CSSProperties = {
  margin: 0,
  borderRadius: 0,
  borderLeft: "none",
  borderRight: "none",
  borderTop: "none",
  padding: "4px 14px",
  fontSize: 9,
  flexShrink: 0,
};

const BODY_ROW: React.CSSProperties = {
  display: "flex",
  flex: 1,
  minHeight: 0,
  overflow: "hidden",
  flexWrap: "wrap",  /* responsive: right rail wraps below at ~1100px */
};

const MATRIX_PANE: React.CSSProperties = {
  flex: 1,
  minWidth: 540,     /* matrix absorbs all space above this threshold */
  minHeight: 0,      /* flex shrink guard for column-flex parent */
  /* In the row-flex BODY_ROW, height is determined by the flex line, not the
     cross-axis constraint. maxHeight:100% caps MATRIX_PANE at BODY_ROW's
     definite height so the internal scroll container is properly bounded. */
  maxHeight: "100%",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
};

const RIGHT_RAIL: React.CSSProperties = {
  width: 320,
  minWidth: 280,
  display: "flex",
  flexDirection: "column",
  borderLeft: "1px solid var(--line)",
  background: "var(--panel)",
  overflowY: "auto",
  scrollbarWidth: "thin" as const,
  scrollbarColor: "rgba(255,255,255,0.13) transparent",
  padding: 8,
} as React.CSSProperties;

const RAIL_DIVIDER: React.CSSProperties = {
  height: 8,
};

const CENTER_PLACEHOLDER: React.CSSProperties = {
  flex: 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 12,
  color: "var(--muted)",
};
