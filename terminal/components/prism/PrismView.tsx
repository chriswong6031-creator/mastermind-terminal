"use client";
/**
 * PrismView — PRISM tab orchestrator.
 *
 * SINGLE mode: ticker input (default SPY), MatrixGrid + right rail
 *   (HeatSeekerCard + OiMoversRail).
 * CONFLUENCE mode: ConfluenceView (SPY + QQQ + IWM side-by-side).
 *
 * Data fetching:
 *   - Matrix: /api/flow?f=matrix:<ROOT> → options_structure.matrix/v1
 *   - GEX state: /api/flow?f=gexstate:<ROOT> → options_structure.gex_state/v1
 *     (hvl/magnet + levels supplement for PRISM level badges)
 *   - OI movers: /api/flow?f=oi → options_hub.oi_movers/v1
 *   All polled every ~60s (tab visible), 87s jitter avoided via no-op interval.
 *
 * Controls:
 *   - Ticker input (default SPY), commits on Enter/blur
 *   - SINGLE | CONFLUENCE mode toggle
 *   - DTE range chips: ≤7 / ≤30 / ≤90 / ALL
 *   - Normalization: GLOBAL | PER-COL
 *   - LensBar (GEX | OI | VOL | ΔOI; VEX + UNUSUAL disabled)
 *
 * HONESTY DOCTRINE:
 *   - GEX sign is assumed dealer-short convention — displayed in LensBar tooltip.
 *   - "descriptive — not a recommendation" on HeatSeeker pick.
 *   - VEX and UNUSUAL are rendered disabled with honest labels.
 *   - No "validated", "predictive", or asserted-direction copy.
 *   - Confluence is index-only; noted prominently.
 *
 * Integration note:
 *   The integrator wires this view into OptionsHubView.tsx under the "prism" tab.
 *   This component does NOT edit OptionsHubView.tsx (frozen; integrator handles).
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useLang } from "@/lib/i18n";
import { makePrismT } from "./prismStrings";
import { LensBar, type ActiveLens } from "./LensBar";
import { MatrixGrid, type MatrixCell, type MatrixLevels } from "./MatrixGrid";
import { HeatSeekerCard, type HeatSeekerPick } from "./HeatSeekerCard";
import { OiMoversRail, type OiMoverRow } from "./OiMoversRail";
import { ConfluenceView } from "./ConfluenceView";

// ─── Types ────────────────────────────────────────────────────────────────────

/** options_structure.matrix/v1 — what /api/flow?f=matrix:<ROOT> returns */
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

/** options_structure.gex_state/v1 (used for supplemental level info) */
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

/** options_hub.oi_movers/v1 */
interface OiPayload {
  schema: string;
  asof: string;
  movers: OiMoverRow[];
}

// ─── Mode / DTE types ─────────────────────────────────────────────────────────

type Mode = "single" | "confluence";
type DteRange = 7 | 30 | 90 | null; // null = ALL
type NormMode = "column" | "global";

// ─── Fetch helpers ────────────────────────────────────────────────────────────

async function safeFetch<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

const POLL_MS = 60_000;

// ─── Component ────────────────────────────────────────────────────────────────

export function PrismView() {
  const { lang } = useLang();
  const t = makePrismT(lang);

  // ── State ────────────────────────────────────────────────────────────────────
  const [ticker, setTicker]       = useState("SPY");
  const [inputVal, setInputVal]   = useState("SPY");
  const [mode, setMode]           = useState<Mode>("single");
  const [activeLens, setLens]     = useState<ActiveLens>("GEX");
  const [dteFilter, setDteFilter] = useState<DteRange>(30);
  const [norm, setNorm]           = useState<NormMode>("column");

  const [matrix, setMatrix]       = useState<MatrixPayload | null>(null);
  const [gexState, setGexState]   = useState<GexStatePayload | null>(null);
  const [oiPayload, setOiPayload] = useState<OiPayload | null>(null);

  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Fetch functions ───────────────────────────────────────────────────────────

  const fetchMatrix = useCallback(async (root: string): Promise<MatrixPayload | null> => {
    if (document.visibilityState === "hidden") return null;
    const data = await safeFetch<MatrixPayload | Record<string, MatrixPayload>>(
      `/api/flow?f=matrix:${root}`
    );
    if (!data) return null;
    // Server may return top-level dict keyed by root or the payload directly
    const payload: MatrixPayload | null =
      (data as Record<string, MatrixPayload>)[root] ??
      (data as unknown as MatrixPayload) ?? null;
    return payload;
  }, []);

  const fetchGexState = useCallback(async (root: string) => {
    const data = await safeFetch<GexStatePayload>(
      `/api/flow?f=gexstate:${root}`
    );
    setGexState(data);
  }, []);

  const fetchOi = useCallback(async () => {
    const data = await safeFetch<{ oi: OiPayload }>("/api/flow?f=oi");
    if (data?.oi) setOiPayload(data.oi);
  }, []);

  // ── Load on ticker change ─────────────────────────────────────────────────────

  const loadTicker = useCallback(
    async (root: string) => {
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

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticker, mode]);

  // ── OI poll (independent of ticker, same for any view) ───────────────────────

  useEffect(() => {
    void fetchOi();
    const id = setInterval(() => void fetchOi(), POLL_MS);
    return () => clearInterval(id);
  }, [fetchOi]);

  // ── Ticker input ──────────────────────────────────────────────────────────────

  const commitTicker = useCallback(() => {
    const root = inputVal.trim().toUpperCase();
    if (root && root !== ticker) {
      setTicker(root);
    }
  }, [inputVal, ticker]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") commitTicker();
    },
    [commitTicker]
  );

  // ── Derived: merged levels from matrix + gexstate ────────────────────────────

  const levels: MatrixLevels = {
    call_wall:   matrix?.levels?.call_wall  ?? gexState?.call_wall  ?? null,
    put_support: matrix?.levels?.put_support ?? gexState?.put_wall  ?? null,
    hvl:         matrix?.levels?.hvl        ?? gexState?.hvl        ?? gexState?.magnet ?? null,
    gamma_flip:  matrix?.levels?.gamma_flip ?? gexState?.gamma_flip ?? null,
    max_pain:    matrix?.levels?.max_pain   ?? null,
  };

  // Format asof
  let asofStr = "";
  if (matrix?.asof) {
    try {
      asofStr = new Date(matrix.asof).toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "America/New_York",
      }) + " ET";
    } catch {
      asofStr = matrix.asof.slice(11, 16);
    }
  }

  // ── OI movers filtered to current ticker in SINGLE mode ──────────────────────
  const tickerMovers: OiMoverRow[] =
    oiPayload?.movers.filter((m) => m.root === ticker) ?? [];

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div style={VIEW_OUTER}>

      {/* ── Controls bar ──────────────────────────────────────────────────── */}
      <div style={CONTROLS_BAR}>

        {/* Ticker input (only relevant in SINGLE mode) */}
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
            <span style={SPOT_DISPLAY}>
              {t("spotLabel")} {matrix.spot.toFixed(2)}
            </span>
          )}
        </div>

        {/* Mode toggle */}
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
            <span style={ASOF_BADGE}>{t("asOf")} {asofStr}</span>
          )}
          {loading && (
            <span style={STATUS_BADGE_LOADING}>{t("loading")}</span>
          )}
          {error && !loading && (
            <span style={STATUS_BADGE_ERROR}>{t("errorMatrix")}</span>
          )}
        </div>
      </div>

      {/* ── Lens bar ──────────────────────────────────────────────────────── */}
      <div style={LENS_BAR_ROW}>
        <LensBar activeLens={activeLens} onLens={setLens} lang={lang} />

        {/* DTE range chips */}
        <div style={DTE_CHIPS}>
          {([7, 30, 90, null] as DteRange[]).map((dte) => (
            <button
              key={String(dte)}
              style={{
                ...DTE_CHIP,
                ...(dteFilter === dte ? DTE_CHIP_ACTIVE : {}),
              }}
              onClick={() => setDteFilter(dte)}
              aria-pressed={dteFilter === dte}
            >
              {dte === 7
                ? t("dte7")
                : dte === 30
                ? t("dte30")
                : dte === 90
                ? t("dte90")
                : t("dteAll")}
            </button>
          ))}
        </div>

        {/* Normalization toggle (SINGLE mode only) */}
        {mode === "single" && (
          <div style={NORM_GROUP}>
            {(["column", "global"] as NormMode[]).map((n) => (
              <button
                key={n}
                style={{
                  ...NORM_BTN,
                  ...(norm === n ? NORM_BTN_ACTIVE : {}),
                }}
                onClick={() => setNorm(n)}
                aria-pressed={norm === n}
              >
                {n === "column" ? t("normColumn") : t("normGlobal")}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Honesty banner (GEX / DOI signed lenses) ─────────────────────── */}
      {(activeLens === "GEX" || activeLens === "DOI") && mode === "single" && (
        <div style={HONESTY_BANNER}>
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
                expiries={matrix.expiries}
                strikes={matrix.strikes}
                spot={matrix.spot}
                levels={levels}
                activeLens={activeLens}
                norm={norm}
                dteFilter={dteFilter}
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
  height: "100%",
  overflow: "hidden",
  background: "var(--bg)",
};

const CONTROLS_BAR: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "7px 14px",
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
  width: 84,
  height: 28,
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
  fontSize: 12,
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
  padding: "4px 10px",
  height: 28,
  background: "transparent",
  border: "none",
  color: "var(--text-2)",
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.06em",
  cursor: "pointer",
  transition: "background 0.1s, color 0.1s",
};

const MODE_BTN_ACTIVE: React.CSSProperties = {
  background: "rgba(77,130,255,0.15)",
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

const STATUS_BADGE_LOADING: React.CSSProperties = {
  fontSize: 9,
  color: "var(--brand-2)",
};

const STATUS_BADGE_ERROR: React.CSSProperties = {
  fontSize: 9,
  color: "var(--down)",
};

const LENS_BAR_ROW: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "5px 14px",
  borderBottom: "1px solid var(--line)",
  background: "var(--panel)",
  flexShrink: 0,
  flexWrap: "wrap",
};

const DTE_CHIPS: React.CSSProperties = {
  display: "flex",
  gap: 3,
  marginLeft: 6,
};

const DTE_CHIP: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 700,
  color: "var(--text-2)",
  background: "var(--panel-3)",
  border: "1px solid var(--line)",
  borderRadius: "var(--r-pill)",
  padding: "2px 7px",
  cursor: "pointer",
  letterSpacing: "0.03em",
  transition: "background 0.1s, border-color 0.1s, color 0.1s",
};

const DTE_CHIP_ACTIVE: React.CSSProperties = {
  color: "var(--brand-2)",
  borderColor: "var(--brand-2)",
  background: "rgba(77,130,255,0.12)",
};

const NORM_GROUP: React.CSSProperties = {
  display: "flex",
  marginLeft: "auto",
  border: "1px solid var(--line)",
  borderRadius: "var(--r-md)",
  overflow: "hidden",
};

const NORM_BTN: React.CSSProperties = {
  padding: "3px 8px",
  height: 24,
  background: "transparent",
  border: "none",
  color: "var(--text-2)",
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: "0.06em",
  cursor: "pointer",
  transition: "background 0.1s, color 0.1s",
};

const NORM_BTN_ACTIVE: React.CSSProperties = {
  background: "rgba(77,130,255,0.12)",
  color: "var(--brand-2)",
};

const HONESTY_BANNER: React.CSSProperties = {
  padding: "4px 14px",
  background: "rgba(157,134,255,0.06)",
  borderBottom: "1px solid rgba(157,134,255,0.14)",
  fontSize: 9,
  color: "rgba(157,134,255,0.85)",
  letterSpacing: "0.02em",
  flexShrink: 0,
};

const BODY_ROW: React.CSSProperties = {
  display: "flex",
  flex: 1,
  minHeight: 0,
  overflow: "hidden",
};

const MATRIX_PANE: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
};

const RIGHT_RAIL: React.CSSProperties = {
  width: 220,
  minWidth: 200,
  display: "flex",
  flexDirection: "column",
  borderLeft: "1px solid var(--line)",
  background: "var(--panel)",
  overflowY: "auto",
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
