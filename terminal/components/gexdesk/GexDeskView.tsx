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
import { useLang } from "@/lib/i18n";
import { makeGexT } from "./gexStrings";
import { GexSummaryBar } from "./GexSummaryBar";
import { StrikeLadder } from "./StrikeLadder";
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

// ─── Index ETF list (same blacklist as gex_spec §13) ─────────────────────────

const INDEX_ETFS = new Set([
  "SPY", "QQQ", "IWM", "DIA",
  "SPX", "NDX", "RUT", "VIX",
  "XSP", "XND", "SPXW", "RUTW",
]);

function isIndexProduct(root: string): boolean {
  return INDEX_ETFS.has(root.toUpperCase());
}

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
  const [gexPayload, setGexPayload]   = useState<GexPayload | null>(null);
  const [statePayload, setStatePayload] = useState<GexStatePayload | null>(null);
  const [selectedExpiry, setSelectedExpiry] = useState<string | null>(null);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Fetch functions ───────────────────────────────────────────────────────────

  const fetchGex = useCallback(
    async (root: string) => {
      if (document.visibilityState === "hidden") return;
      const data = await safeFetch<{ [key: string]: GexPayload }>(
        `/api/flow?f=gex:${root}`
      );
      if (data) {
        // The fixture returns a dict keyed by root; server may return either shape
        const payload: GexPayload | null =
          data[root] ?? (data as unknown as GexPayload) ?? null;
        if (payload) {
          setGexPayload(payload);
          setError(false);
        } else {
          setError(true);
        }
      } else {
        setError(true);
      }
    },
    []
  );

  const fetchGexState = useCallback(async (root: string) => {
    // FUTURE endpoint — handle gracefully when absent (404 / null)
    const data = await safeFetch<GexStatePayload>(
      `/api/flow?f=gexstate:${root}`
    );
    setStatePayload(data);
  }, []);

  // ── Load on ticker change ─────────────────────────────────────────────────────

  const loadTicker = useCallback(
    async (root: string) => {
      setLoading(true);
      setGexPayload(null);
      setStatePayload(null);
      setSelectedExpiry(null);
      setError(false);
      await Promise.all([fetchGex(root), fetchGexState(root)]);
      setLoading(false);
    },
    [fetchGex, fetchGexState]
  );

  // ── Polling ───────────────────────────────────────────────────────────────────

  useEffect(() => {
    void loadTicker(ticker);

    pollRef.current = setInterval(() => {
      void fetchGex(ticker);
      void fetchGexState(ticker);
    }, GEX_POLL_MS);

    // Hidden-tab deferral: fetches skip while document is hidden (harness/
    // backgrounded mounts). Load immediately when the tab becomes visible so
    // the ladder never sits empty waiting for the next poll tick.
    const onVis = () => {
      if (document.visibilityState === "visible") {
        void fetchGex(ticker);
        void fetchGexState(ticker);
      }
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

  const levels = {
    callWall: gexPayload?.call_wall ?? null,
    putWall: gexPayload?.put_wall ?? null,
    gammaFlip: gexPayload?.gamma_flip ?? null,
    hvl: gexPayload?.hvl ?? null,
  };

  // Format spot for display
  const spotStr =
    spot != null
      ? spot < 10
        ? spot.toFixed(3)
        : spot < 100
        ? spot.toFixed(2)
        : spot.toFixed(2)
      : "—";

  // Format asof for display
  let asofStr = "";
  if (asof) {
    try {
      asofStr = new Date(asof).toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "America/New_York",
      }) + " ET";
    } catch {
      asofStr = asof.slice(11, 16);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div style={DESK_OUTER} className="obs obs-ambient">

      {/* ── Controls bar ──────────────────────────────────────────────────── */}
      <div style={CONTROLS_BAR}>
        <div style={TICKER_GROUP}>
          <input
            style={TICKER_INPUT}
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value.toUpperCase())}
            onBlur={commitTicker}
            onKeyDown={handleKeyDown}
            placeholder={t("tickerPlaceholder")}
            aria-label={t("tickerInputLabel")}
            spellCheck={false}
            maxLength={12}
          />
          {spot != null && (
            <span style={SPOT_DISPLAY}>
              {spotStr}
            </span>
          )}
        </div>

        <div style={CONTROLS_RIGHT}>
          {asofStr && (
            <span style={ASOF_BADGE}>
              {t("asOf")} {asofStr}
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
          {loading && !gexPayload ? (
            <div style={LADDER_LOADING}>{t("loadingGex")}</div>
          ) : (
            <StrikeLadder
              strikes={gexPayload?.by_strike ?? []}
              spot={spot}
              levels={levels}
              byExpiry={gexPayload?.by_expiry ?? null}
              selectedExpiry={selectedExpiry}
              onSelectExpiry={setSelectedExpiry}
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
  width: 88,
  height: 30,
  padding: "0 10px",
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
  fontSize: 14,
  fontWeight: 700,
  color: "var(--text)",
  fontVariantNumeric: "tabular-nums",
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
