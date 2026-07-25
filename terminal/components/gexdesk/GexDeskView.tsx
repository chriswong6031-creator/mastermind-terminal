"use client";
/**
 * GexDeskView — GEX desk surface (Wave 2, MomoEdge parity).
 *
 * Layout:
 *   Top    — ticker input + spot price + asof badge
 *   Second — GexSummaryBar (Net GEX / Call Wall / Put Support / Magnet / Flip / etc.)
 *   Body   — two-pane:
 *              Left  — GexGuide (color legend + collapsible how-to-read) + StrikeLadder
 *              Right — MarketStateCard (regime + state metrics + passport)
 *
 * State owned here:
 *   - ticker (default "SPY")
 *   - gexPayload (from /api/flow?f=gex:<ROOT>)
 *   - statePayload (from /api/flow?f=gexstate:<ROOT> — FUTURE endpoint, handled gracefully)
 *   - selectedExpiry (expiry filter chip)
 *   - polling interval (~60s)
 *
 * HONESTY DOCTRINE:
 *   - GEX levels are a LEVELS MAP, display-only until forward-vol gate (~Sept 2026).
 *   - Dealer-sign is an assumption; magnitude is the reliable read.
 *   - Single-name regime is near-constant — disclosed in MarketStateCard passport.
 *   - No "validated", "predictive", or asserted-direction copy anywhere.
 *
 * Integration note:
 *   The integrator wires this view into OptionsHubView.tsx under the "gex" tab.
 *   The f-param routing (/api/flow?f=gex:<ROOT>) is handled by the existing route.ts.
 *   This component codes against those endpoints; the integrator adds the tab entry.
 */

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { flowGet } from "@/lib/flowClientCache";
import { useFlowStream } from "@/lib/flowStream";
import { useLang } from "@/lib/i18n";
import { trackSearch } from "@/lib/searchTrack";
import { makeGexT } from "./gexStrings";
import type { GexDeskKey } from "./gexStrings";
import { GexSummaryBar } from "./GexSummaryBar";
import { StrikeLadder } from "./StrikeLadder";
import { ExpiryBars } from "./ExpiryBars";
import { MarketStateCard } from "./MarketStateCard";
import type { GexStatePayload } from "./MarketStateCard";
import { GexGuide } from "./GexGuide";

// ─── Types ────────────────────────────────────────────────────────────────────

/** Payload from /api/flow?f=gex:<ROOT> (matches gex_fixture.json schema) */
export interface GexPayload {
  schema: string;
  asof: string;
  root: string;
  spot_ref: number | null;
  net_gex_bn: number | null;
  gamma_flip: number | null;
  call_wall: number | null;
  put_wall: number | null;
  by_strike: {
    strike: number;
    gamma_net: number;
    gamma_call: number;
    gamma_put: number;
    delta_net?: number;
    vanna_net?: number;
    charm_net?: number;
  }[];
  by_expiry?: {
    exp: string;
    gamma_net: number;
    delta_net?: number;
  }[];
  // Optional extended fields (may come from richer server payload)
  hvl?: number | null;
  magnet?: number | null;
  max_pain?: number | null;
  put_call_oi_ratio?: number | null;
  iv30?: number | null;
  convention?: string;
  coverage?: { n_days: number; since: string };
  history?: {
    date: string;
    net_gex_bn: number;
    gamma_flip: number | null;
    call_wall: number | null;
    put_wall: number | null;
    regime: string;
  }[];
}

/**
 * Greek exposure lens. The GEX payload's `by_strike` rows already carry
 * `delta_net`/`vanna_net`/`charm_net` alongside `gamma_net` (built upstream by the
 * Cboe gex_engine) — this switches which one the ladder renders. Walls/flip are a
 * gamma-only overlay, suppressed for the other lenses (see `ladderLevels` below).
 */
export type GreekLens = "gamma" | "delta" | "vanna" | "charm";

const GREEK_LENSES: { key: GreekLens; labelKey: GexDeskKey; fullKey: GexDeskKey }[] = [
  { key: "gamma", labelKey: "greekGamma", fullKey: "greekGammaFull" },
  { key: "delta", labelKey: "greekDelta", fullKey: "greekDeltaFull" },
  { key: "vanna", labelKey: "greekVanna", fullKey: "greekVannaFull" },
  { key: "charm", labelKey: "greekCharm", fullKey: "greekCharmFull" },
];

// ─── Index ETF list (same blacklist as gex_spec §13) ─────────────────────────

const INDEX_ETFS = new Set([
  "SPY", "QQQ", "IWM", "DIA",
  "SPX", "NDX", "RUT", "VIX",
  "XSP", "XND", "SPXW", "RUTW",
]);

function isIndexProduct(root: string): boolean {
  return INDEX_ETFS.has(root.toUpperCase());
}

// One-click quick picks next to the ticker box (indices first, then the most
// liquid single names). The full autocomplete list backs the native <datalist>
// dropdown — a zero-dependency "instant search" without loading the 1.9MB manifest.
const GEX_QUICK_ROOTS = ["SPY", "QQQ", "IWM", "NVDA", "TSLA", "META", "AAPL"];
const GEX_AUTOCOMPLETE_ROOTS = [
  "SPY", "QQQ", "IWM", "DIA", "SPX", "NDX", "RUT",
  "NVDA", "TSLA", "AAPL", "META", "AMZN", "MSFT", "GOOGL", "GOOG", "AMD", "NFLX",
  "AVGO", "MU", "PLTR", "COIN", "SMCI", "MSTR", "BABA", "INTC", "CRM", "ORCL",
  "QCOM", "ARM", "MARA", "SOFI", "UBER", "DIS", "BA", "JPM", "XLF", "XLE", "GLD",
];

// ─── Polling ──────────────────────────────────────────────────────────────────

const GEX_POLL_MS = 60_000;

async function safeFetch<T>(url: string): Promise<T | null> {
  try {
    const f = new URL(url, "http://x").searchParams.get("f") ?? url;
    const data = await flowGet(f);
    return (data as T) ?? null;
  } catch {
    return null;
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function GexDeskView() {
  const { lang } = useLang();
  const t = makeGexT(lang);

  // ── State ────────────────────────────────────────────────────────────────────
  const [ticker, setTicker]           = useState("SPY");
  const [inputVal, setInputVal]       = useState("SPY");
  const [greek, setGreek]             = useState<GreekLens>("gamma");
  const [view, setView]               = useState<"strike" | "expiry">("strike");
  const [statePayload, setStatePayload] = useState<GexStatePayload | null>(null);
  const [selectedExpiry, setSelectedExpiry] = useState<string | null>(null);
  // Per-strike-per-expiry cells for the ladder hover breakdown (optional, best-effort).
  const [matrixCells, setMatrixCells] = useState<{ strike: number; expiry: string; gex: number }[] | null>(null);

  // GEX payload now arrives over the SSE live spine (push) instead of a 60s poll;
  // the hook falls back to flowGet polling if SSE is unavailable, so this is never
  // worse than before. NOTE: gex data is EOD-nightly — the live connection is a
  // transport upgrade, not live data, so there is deliberately NO "LIVE" badge here;
  // the asof staleness chip remains the honest source of truth on freshness.
  const { data: gexRaw, error: gexErr } =
    useFlowStream<Record<string, unknown>>(`gex:${ticker}`);
  // Fixture returns the payload directly; prod may key it by root — unwrap either shape.
  const gexPayload: GexPayload | null = gexRaw
    ? (((gexRaw as Record<string, unknown>)[ticker] as GexPayload | undefined) ??
       (gexRaw as unknown as GexPayload))
    : null;
  const loading = gexRaw === null && !gexErr;
  const error = gexErr && gexRaw === null;

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Fetch functions ───────────────────────────────────────────────────────────

  const fetchGexState = useCallback(async (root: string) => {
    // FUTURE endpoint — handle gracefully when absent (404 / null)
    const data = await safeFetch<GexStatePayload>(
      `/api/flow?f=gexstate:${root}`
    );
    setStatePayload(data);
  }, []);

  // ── GEX-state feed (market-state card) ─────────────────────────────────────────
  // The gex ladder payload rides the SSE hook above; this separate low-churn feed
  // (gexstate) stays on the light poll and resets on ticker change.

  // Matrix cells feed the ladder hover top-3 expiry breakdown. Best-effort: the payload
  // (options_structure.matrix) exists only for some roots — absent → breakdown just omitted.
  const fetchMatrix = useCallback(async (root: string) => {
    const data = await safeFetch<{ cells?: { strike: number; expiry: string; gex: number }[] }>(
      `/api/flow?f=matrix:${root}`
    );
    setMatrixCells(Array.isArray(data?.cells) ? data!.cells! : null);
  }, []);

  useEffect(() => {
    setStatePayload(null);
    setSelectedExpiry(null);
    setMatrixCells(null);
    void fetchGexState(ticker);
    void fetchMatrix(ticker);

    pollRef.current = setInterval(() => void fetchGexState(ticker), GEX_POLL_MS);

    // Hidden-tab deferral: refresh on becoming visible so the card isn't stale.
    const onVis = () => {
      if (document.visibilityState === "visible") void fetchGexState(ticker);
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      document.removeEventListener("visibilitychange", onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticker]);

  // ── Input handlers ────────────────────────────────────────────────────────────

  const commitTicker = useCallback(() => {
    const root = inputVal.trim().toUpperCase();
    if (root && root !== ticker) {
      trackSearch(root, "gex-desk", inputVal.trim() || undefined);
      setTicker(root);
    }
  }, [inputVal, ticker]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") commitTicker();
    },
    [commitTicker]
  );

  // ── Derived values ────────────────────────────────────────────────────────────

  const spot = gexPayload?.spot_ref ?? null;
  const asof = gexPayload?.asof ?? null;

  const isIndex = isIndexProduct(ticker);

  // Guard a nonsense gamma_flip: the builder's zero-crossing detection sometimes
  // returns a strike far from spot (e.g. 285 vs spot 748). If the flip is outside
  // ±20% of spot it isn't a real dealer flip — drop it rather than draw a bogus line.
  const rawFlip = gexPayload?.gamma_flip ?? null;
  const gammaFlip = rawFlip != null && spot != null && spot > 0 && Math.abs(rawFlip - spot) / spot <= 0.20
    ? rawFlip
    : null;
  const levels = {
    callWall: gexPayload?.call_wall ?? null,
    putWall: gexPayload?.put_wall ?? null,
    gammaFlip,
    hvl: gexPayload?.hvl ?? null,
  };

  // Walls / flip are gamma-specific constructs. When a non-gamma lens is active,
  // suppress them so the ladder never draws a gamma "WALL"/"SUPPORT"/"FLIP" tag over a
  // DEX/VEX/CHEX view (that would be misleading — those levels aren't defined per-greek).
  const ladderLevels =
    greek === "gamma"
      ? levels
      : { callWall: null, putWall: null, gammaFlip: null, hvl: null };

  // Format spot for display
  const spotStr =
    spot != null
      ? spot < 10
        ? spot.toFixed(3)
        : spot < 100
        ? spot.toFixed(2)
        : spot.toFixed(2)
      : "—";

  // Format asof — show the DATE + a staleness chip, not just the time, so a stale
  // GEX snapshot (options-hub is EOD-nightly) reads honestly instead of looking live.
  let asofStr = "";
  let asofStale = false;
  let asofAgeStr = "";
  if (asof) {
    try {
      const d = new Date(asof);
      asofStr = d.toLocaleString("en-US", {
        weekday: "short", month: "short", day: "numeric",
        hour: "2-digit", minute: "2-digit", hour12: false,
        timeZone: "America/New_York",
      }) + " ET";
      const etDay = (dt: Date) => dt.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
      const ageDays = Math.round((Date.parse(etDay(new Date())) - Date.parse(etDay(d))) / 86_400_000);
      if (ageDays > 0) {
        asofStale = true;
        asofAgeStr = ageDays <= 1 ? t("lastSession") : t("daysOld").replace("{n}", String(ageDays));
      }
    } catch {
      asofStr = asof.slice(0, 16).replace("T", " ");
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div style={DESK_OUTER} className="obs obs-ambient">

      {/* ── Controls bar ──────────────────────────────────────────────────── */}
      <div style={CONTROLS_BAR}>
        <div style={TICKER_GROUP}>
          <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="var(--muted)" strokeWidth="2"
              style={{ position: "absolute", left: 8, pointerEvents: "none" }}>
              <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" strokeLinecap="round" />
            </svg>
            <input
              style={TICKER_INPUT}
              list="gex-roots"
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value.toUpperCase())}
              onBlur={commitTicker}
              onKeyDown={handleKeyDown}
              placeholder={t("tickerPlaceholder")}
              aria-label={t("tickerInputLabel")}
              spellCheck={false}
              maxLength={12}
            />
            <datalist id="gex-roots">
              {GEX_AUTOCOMPLETE_ROOTS.map((r) => <option key={r} value={r} />)}
            </datalist>
          </div>
          {/* Quick picks — the "dropdown options" the desk was missing */}
          <div style={{ display: "flex", gap: 4 }}>
            {GEX_QUICK_ROOTS.map((r) => (
              <button
                key={r}
                className={`chip${ticker === r ? " on" : ""}`}
                style={{ height: 24, fontSize: 11, fontWeight: 700, letterSpacing: "0.03em" }}
                onClick={() => { if (r !== ticker) trackSearch(r, "gex-desk"); setInputVal(r); setTicker(r); }}
              >
                {r}
              </button>
            ))}
          </div>
          {spot != null && (
            <span style={SPOT_DISPLAY}>
              {spotStr}
            </span>
          )}
        </div>

        {/* Greek exposure lens — GEX / DEX / VEX / CHEX. Switches which per-strike
            greek the ladder renders from the by_strike payload (data already present). */}
        <div style={GREEK_GROUP} role="group" aria-label={t("greekLensAria")}>
          {GREEK_LENSES.map((g) => (
            <button
              key={g.key}
              className={`chip${greek === g.key ? " on" : ""}`}
              style={GREEK_CHIP}
              aria-pressed={greek === g.key}
              aria-label={t(g.fullKey)}
              onClick={() => setGreek(g.key)}
            >
              {t(g.labelKey)}
            </button>
          ))}
        </div>

        <div style={CONTROLS_RIGHT}>
          {greek !== "gamma" && (
            <span style={LENS_NOTE}>{t("greekLensNote")}</span>
          )}
          {asofStr && (
            <span style={asofStale ? { ...ASOF_BADGE, color: "var(--warn)" } : ASOF_BADGE}>
              {t("asOf")} {asofStr}
              {asofStale && <span style={{ marginLeft: 5, fontWeight: 600 }}>· {asofAgeStr}</span>}
            </span>
          )}
          {loading && (
            <span style={LOADING_BADGE}>{t("loading")}</span>
          )}
          {error && !loading && (
            <span style={ERROR_BADGE}>
              {t("errorGex")}
            </span>
          )}
        </div>
      </div>

      {/* ── Summary bar ──────────────────────────────────────────────────── */}
      <GexSummaryBar
        payload={gexPayload}
        callOI={(statePayload as unknown as Record<string, number | null | undefined>)?.call_oi ?? null}
        putOI={(statePayload as unknown as Record<string, number | null | undefined>)?.put_oi ?? null}
        lang={lang}
      />

      {/* ── Body (two-pane) ──────────────────────────────────────────────── */}
      <div style={BODY_ROW}>

        {/* ── Left pane: Guide + Ladder ─────────────────────────────────── */}
        <div style={LEFT_PANE}>
          <GexGuide lang={lang} />
          {/* Exposure axis: By Strike (ladder) / By Expiration (bars). The by_expiry
              series is already in the payload — previously used only as a filter. */}
          <div style={VIEW_TOGGLE_ROW} role="group" aria-label={t("viewAria")}>
            <button
              className={`chip${view === "strike" ? " on" : ""}`}
              style={VIEW_CHIP}
              aria-pressed={view === "strike"}
              onClick={() => setView("strike")}
            >
              {t("viewByStrike")}
            </button>
            <button
              className={`chip${view === "expiry" ? " on" : ""}`}
              style={VIEW_CHIP}
              aria-pressed={view === "expiry"}
              onClick={() => setView("expiry")}
            >
              {t("viewByExpiry")}
            </button>
          </div>
          {loading && !gexPayload ? (
            <div style={LADDER_LOADING}>{t("loadingGex")}</div>
          ) : view === "strike" ? (
            <StrikeLadder
              strikes={gexPayload?.by_strike ?? []}
              spot={spot}
              levels={ladderLevels}
              greek={greek}
              byExpiry={gexPayload?.by_expiry ?? null}
              selectedExpiry={selectedExpiry}
              onSelectExpiry={setSelectedExpiry}
              lang={lang}
              netGexBn={gexPayload?.net_gex_bn ?? null}
              history={gexPayload?.history ?? null}
              matrixCells={matrixCells}
            />
          ) : (
            <ExpiryBars
              byExpiry={gexPayload?.by_expiry ?? null}
              greek={greek}
              lang={lang}
            />
          )}
        </div>

        {/* ── Right pane: Market state ──────────────────────────────────── */}
        <MarketStateCard
          statePayload={statePayload}
          gexPayload={gexPayload}
          isIndexProduct={isIndex}
          lang={lang}
        />
      </div>
    </div>
  );
}

// ─── Layout styles ────────────────────────────────────────────────────────────

const DESK_OUTER: React.CSSProperties = {
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
  gap: 12,
  padding: "8px 14px",
  borderBottom: "1px solid var(--line)",
  background: "var(--panel)",
  flexShrink: 0,
};

const TICKER_GROUP: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
};

const TICKER_INPUT: React.CSSProperties = {
  width: 118,
  height: 30,
  padding: "0 10px 0 26px",
  background: "var(--inset)",
  border: "1px solid var(--line)",
  borderRadius: "var(--r-md)",
  color: "var(--text)",
  fontSize: 13,
  fontWeight: 700,
  textAlign: "left",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  outline: "none",
  fontVariantNumeric: "tabular-nums",
};

const SPOT_DISPLAY: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  color: "var(--text)",
  fontVariantNumeric: "tabular-nums",
};

const GREEK_GROUP: React.CSSProperties = {
  display: "flex",
  gap: 4,
  alignItems: "center",
};

const GREEK_CHIP: React.CSSProperties = {
  height: 24,
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.04em",
};

const LENS_NOTE: React.CSSProperties = {
  fontSize: 10,
  color: "var(--muted)",
  fontStyle: "italic",
};

const VIEW_TOGGLE_ROW: React.CSSProperties = {
  display: "flex",
  gap: 4,
  padding: "6px 8px",
  borderBottom: "1px solid var(--line)",
  flexShrink: 0,
};

const VIEW_CHIP: React.CSSProperties = {
  height: 24,
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: "0.02em",
};

const CONTROLS_RIGHT: React.CSSProperties = {
  marginLeft: "auto",
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const ASOF_BADGE: React.CSSProperties = {
  fontSize: 10,
  color: "var(--muted)",
  fontVariantNumeric: "tabular-nums",
};

const LOADING_BADGE: React.CSSProperties = {
  fontSize: 10,
  color: "var(--brand-2)",
};

const ERROR_BADGE: React.CSSProperties = {
  fontSize: 10,
  color: "var(--down)",
};

const BODY_ROW: React.CSSProperties = {
  display: "flex",
  flex: 1,
  minHeight: 0,
  overflow: "hidden",
  flexWrap: "wrap",   /* responsive: right rail wraps below at ~1100px */
  alignItems: "stretch",
};

const LEFT_PANE: React.CSSProperties = {
  flex: "1 1 0px",
  minWidth: 480,       /* ladder gets all remaining space above 480px */
  minHeight: 0,        /* allow flex shrink past content height */
  alignSelf: "stretch",/* fill BODY_ROW track height */
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  maxHeight: "100%",   /* cap at BODY_ROW cross-axis height in wrapping flex */
};

const LADDER_LOADING: React.CSSProperties = {
  flex: 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 12,
  color: "var(--muted)",
};
