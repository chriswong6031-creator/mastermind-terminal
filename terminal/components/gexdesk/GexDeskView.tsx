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
  useMemo,
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
import { GexHistory } from "./GexHistory";
import { ExposureExpiryDrawer } from "./ExposureExpiryDrawer";
import { MarketStateCard } from "./MarketStateCard";
import type { GexStatePayload } from "./MarketStateCard";
import { GexGuide } from "./GexGuide";
import { EodContextBelt } from "@/components/eodcontext/EodContextBelt";
import {
  LENS_ALL,
  matrixExpiryCoverage,
  matrixLensByStrike,
  matrixSessionsAgree,
  type ExpiryLens,
  type GexMatrix,
} from "@/lib/gexLadder";

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
  // Expiry lens — All / 0DTE / All−0DTE / one expiration. Owned here because BOTH the
  // ladder and the summary bar have to be scoped by it (it used to be ladder-local state
  // with no consumer at all: a dead control).
  const [lens, setLens] = useState<ExpiryLens>(LENS_ALL);
  // options_structure.matrix — the ONLY store carrying strike × expiry together, so it is
  // what makes the lens real. Best-effort: it exists only for some roots (and can run a
  // different session than the gex payload) — absent → the lens reports itself unavailable.
  const [matrix, setMatrix] = useState<GexMatrix | null>(null);

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

  // Matrix cells feed the expiry lens AND the ladder hover top-3 expiry breakdown.
  // Best-effort: the payload (options_structure.matrix) exists only for some roots —
  // absent → the lens goes dark with a reason and the breakdown is simply omitted.
  const fetchMatrix = useCallback(async (root: string) => {
    const data = await safeFetch<GexMatrix>(`/api/flow?f=matrix:${root}`);
    setMatrix(Array.isArray(data?.cells) ? data : null);
  }, []);

  useEffect(() => {
    setStatePayload(null);
    setLens(LENS_ALL);
    setMatrix(null);
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

  // ── Expiry lens plumbing ─────────────────────────────────────────────────────
  // The gex payload gives per-STRIKE (all expiries) and per-EXPIRY (all strikes); only
  // the matrix carries the two axes crossed. So: All reads by_strike; every narrower lens
  // is summed out of the matrix here, once, and handed to both consumers below.
  //
  // Both matrix reads are anchored to the GEX payload's own as-of, never the wall clock —
  // an EOD snapshot's "0DTE" is a property of the snapshot's session, not of today.
  const matrixCells = useMemo(
    () => (Array.isArray(matrix?.cells)
      ? matrix.cells.filter((c): c is { strike: number; expiry: string; gex: number } =>
          c.gex != null && Number.isFinite(c.gex))
      : null),
    [matrix]
  );

  const ladderStrikes = useMemo(
    () => (gexPayload?.by_strike ?? []).map((s) => s.strike),
    [gexPayload?.by_strike]
  );

  // Honesty gate: the matrix and the gex payload disagree on which session they describe
  // by more than a routine cadence gap — the documented "two weeks behind" drift (see
  // lib/gexLadder.ts). Treat the matrix as covering nothing so every narrow-lens control
  // goes dark (existing honest-unavailable state) instead of letting the user select a
  // lens that would sum — or mislabel 0DTE — across two different sessions.
  const matrixSessionOk = matrixSessionsAgree(matrix?.asof, asof);

  // Which expiries the matrix can actually answer for THIS ladder (see lib/gexLadder.ts —
  // it demands a real strike overlap, so two stores on different sessions read as "no
  // coverage" rather than producing a ladder of dashes).
  const lensCoverage = useMemo(
    () => (matrixSessionOk ? matrixExpiryCoverage(matrix, ladderStrikes) : new Set<string>()),
    [matrix, ladderStrikes, matrixSessionOk]
  );

  const lensValues = useMemo(
    () => matrixLensByStrike(matrix, lens, asof),
    [matrix, lens, asof]
  );

  // Strike-window disclosure for the summary bar's scoped Net GEX (bug: the hero used to
  // swap strike universe under a narrow lens while naming only the expiry scope). N of the
  // ladder's own strikes the lens actually covers, out of the ladder's full strike count.
  const lensCoveredStrikeCount = useMemo(
    () => ladderStrikes.filter((k) => lensValues.covered.has(k)).length,
    [ladderStrikes, lensValues]
  );

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
          {/* Quick picks — the "dropdown options" the desk was missing. Wraps so the tail
              of the list stays reachable on a phone instead of clipping past the edge. */}
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
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
          <span className="obs-lbl" style={{ marginRight: 2 }}>{t("greekLensAria")}</span>
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
        lens={lens}
        lensNetMn={lensValues.cellCount > 0 ? lensValues.totalMn : null}
        lensCoveredStrikes={lensCoveredStrikeCount}
        lensTotalStrikes={ladderStrikes.length}
        lang={lang}
      />

      {/* ── GEX history strip — net-GEX trend over recent sessions, from the EOD
             surface we already own (first slice of historical playback) ────── */}
      <GexHistory history={gexPayload?.history} lang={lang} />

      {/* ── EOD context belt (OEU T-E) ───────────────────────────────────────
          Settled-close structure + off-exchange positioning for the SAME root, sitting
          between the live-transport summary bar and the ladder. It reads different stores
          than the bar above it (gex_state, options_hub/moves, options_hub/vol) and stamps
          every value with that store's own session, so the cadence boundary between the
          desk's live spine and macro's nightly close is visible rather than assumed. */}
      <EodContextBelt
        root={ticker}
        gexState={statePayload}
        gex={gexPayload}
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
          {/* Ladder region — the ONLY part of the left column that flexes. It owns its own
              overflow, so the drawer below can expand without pushing anything out of the
              desk (and, crucially, without changing the RIGHT column's height at all). */}
          <div style={LADDER_REGION}>
            {loading && !gexPayload ? (
              <div style={LADDER_LOADING}>{t("loadingGex")}</div>
            ) : error && !gexPayload ? (
              /* Honest empty: the nightly options build re-pulls index anchors first, so a
                 missing single name is a COVERAGE gap, not a broken desk. Name which one it
                 is instead of leaving a bare "could not load". */
              <div style={LADDER_EMPTY}>
                <div style={LADDER_EMPTY_TITLE}>{t("gexNoSnapshot")}</div>
                <div style={LADDER_EMPTY_WHY}>
                  {t("gexNoSnapshotWhy").replace("{sym}", ticker)}
                </div>
              </div>
            ) : view === "strike" ? (
              <StrikeLadder
                strikes={gexPayload?.by_strike ?? []}
                spot={spot}
                levels={ladderLevels}
                greek={greek}
                byExpiry={gexPayload?.by_expiry ?? null}
                lens={lens}
                onLens={setLens}
                lensValues={lensValues}
                lensCoverage={lensCoverage}
                asOf={asof}
                matrixAsOf={matrix?.asof ?? null}
                lang={lang}
                netGexBn={gexPayload?.net_gex_bn ?? null}
                matrixCells={matrixCells}
              />
            ) : (
              <ExpiryBars
                byExpiry={gexPayload?.by_expiry ?? null}
                greek={greek}
                asOf={asof}
                lang={lang}
              />
            )}
          </div>

          {/* ── Exposure-by-Expiry term-structure drawer (RECON §4.5) ──────────
              CONTAINMENT: the drawer lives INSIDE the left column, below the ladder it
              annotates. It used to be a sibling of BODY_ROW in the desk's outer column,
              which meant opening it stole height from the whole two-pane row: the Market
              State card was squeezed until its own overflow:auto kicked in, the user
              scrolled inside it, and collapsing the drawer left that scrollTop parked —
              the card came back "pushed up" with its header off-screen and no obvious way
              to recover. Scoped here, expanding/collapsing can only ever re-flow the
              ladder (which has its own internal scroll and self-restores), and the right
              column's height never changes. */}
          <div style={XDRAWER_SLOT}>
            <ExposureExpiryDrawer
              byExpiry={gexPayload?.by_expiry ?? null}
              greek={greek}
              asOf={gexPayload?.asof ?? null}
              lang={lang}
            />
          </div>
        </div>

        {/* ── Right pane: Market state ──────────────────────────────────────
            An independent min-height:0 / overflow-y:auto region (see CARD_OUTER in
            MarketStateCard) — it derives its scroll geometry from BODY_ROW's height alone,
            never from what the left column is doing. */}
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
  gap: "var(--sp-3)",
  padding: "var(--sp-2) var(--sp-4)",
  borderBottom: "1px solid var(--line)",
  background: "var(--panel)",
  flexShrink: 0,
  /* On a phone the ticker box + 7 quick picks + 4 greek chips overflowed the bar and the
     tail was simply unreachable (no scroll, no wrap). Wrapping keeps every control on the
     surface at 375px and is a no-op on desktop, where it all fits on one line. */
  flexWrap: "wrap",
};

const TICKER_GROUP: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  flexWrap: "wrap",
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
  gap: 5,
  alignItems: "center",
  padding: "3px 5px 3px 9px",
  border: "1px solid var(--line)",
  borderRadius: "var(--r-md)",
  background: "var(--inset)",
};

const GREEK_CHIP: React.CSSProperties = {
  height: 30,
  minWidth: 50,
  padding: "0 11px",
  fontSize: 11.5,
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
  /* Ladder gets all remaining space above 480px, but never demands more room than the
     viewport has: a hard 480 forced a horizontal scrollbar (and ~117px of usable bar
     column) on a 375px phone. min() keeps the desktop floor and drops it on narrow ones —
     the ladder itself switches to its compact grid below 420px. */
  minWidth: "min(480px, 100%)",
  minHeight: 0,        /* allow flex shrink past content height */
  alignSelf: "stretch",/* fill BODY_ROW track height */
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  maxHeight: "100%",   /* cap at BODY_ROW cross-axis height in wrapping flex */
};

/**
 * The flexing part of the left column. Everything above it (guide, view toggle) and below it
 * (the expiry drawer) is flex-shrink:0, so this is the single region that gives up room when
 * the drawer opens — and it clips internally rather than pushing the desk taller.
 */
const LADDER_REGION: React.CSSProperties = {
  flex: "1 1 0px",
  minHeight: 0,
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
};

/**
 * Height budget for the expanded drawer INSIDE the left column. Without a cap a tall drawer
 * on a short viewport would drive the ladder region to 0 and then overflow the column itself
 * — the same failure this fix removes, one level down. 58% leaves the ladder a usable band at
 * every viewport height; the drawer body scrolls inside whatever it is given.
 */
const XDRAWER_SLOT: React.CSSProperties = {
  flexShrink: 0,
  minHeight: 0,
  maxHeight: "58%",
  display: "flex",
  flexDirection: "column",
};

const LADDER_LOADING: React.CSSProperties = {
  flex: 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "var(--fs-ui)",
  color: "var(--muted)",
};

const LADDER_EMPTY: React.CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: "var(--sp-2)",
  padding: "var(--sp-6) var(--sp-5)",
  textAlign: "center",
};

const LADDER_EMPTY_TITLE: React.CSSProperties = {
  fontSize: "var(--fs-body)",
  fontWeight: 700,
  color: "var(--text-2)",
};

const LADDER_EMPTY_WHY: React.CSSProperties = {
  fontSize: "var(--fs-label)",
  color: "var(--muted)",
  lineHeight: 1.5,
  maxWidth: 380,
};
