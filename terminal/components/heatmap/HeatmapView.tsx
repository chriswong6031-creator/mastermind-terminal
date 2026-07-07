"use client";
/**
 * HeatmapView.tsx — dual-layer market heatmap orchestrator.
 *
 * Data sources:
 *   - Manifest (price): /api/flow?f=manifest → manifest.json (34 names, nightly)
 *   - Flow index:        /api/flow?f=flow_idx → flow_idx.json (EOD, ΔOI-based)
 *
 * HONESTY DOCTRINE:
 *   - 1D timeframe is REAL (nightly Polygon manifest.chg).
 *   - 1W/1M/YTD are DISABLED ("accruing") — no OHLC on broader universe yet.
 *   - Flow direction is SOFT — magnitude headlines, dead-zone classifiers.
 *   - Breadth strip: advancers/decliners real; call-share dead-zone ±0.08 → "MIXED".
 *   - GEX regime: regime passport caveat shown visibly (display-only, ~Sept 2026 gate).
 *   - Single-name GEX regime note surfaced in the regime caveat banner.
 *   - No "validated" or predictive copy anywhere.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useLang } from "@/lib/i18n";
import { makeHeatmapT } from "@/lib/heatmapStrings";
import { Treemap } from "./Treemap";
import { HeatmapTable } from "./HeatmapTable";
import { DetailPanel } from "./DetailPanel";
import { getSector } from "./sectorMap";
import type {
  HeatmapTile,
  Layer,
  View,
  SizingMode,
  Timeframe,
  ManifestPayload,
  FlowIdxPayload,
  FlowIdxRow,
  GicsSector,
} from "./types";
import { SECTOR_LABEL, SECTOR_ORDER } from "./sectorMap";

// ─── Constants ────────────────────────────────────────────────────────────────

const POLL_MS = 60_000; // 1-minute poll; data is nightly but keeps cache fresh

// Call-share dead-zone: |doiPc - 0.5| < 0.08 → "MIXED"
const CALL_SHARE_DEAD = 0.08;

// ─── Data fetching ────────────────────────────────────────────────────────────

async function safeFetch<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

// ─── Data join: manifest + flow_idx → HeatmapTile[] ──────────────────────────

function buildTiles(
  manifest: ManifestPayload | null,
  flowIdx: FlowIdxPayload | null
): HeatmapTile[] {
  if (!manifest) return [];

  // Index flow by ticker
  const flowMap: Record<string, FlowIdxRow> = {};
  if (flowIdx) {
    // The flow_idx payload may be { rows: [...] } or flat object
    const rows: FlowIdxRow[] = Array.isArray((flowIdx as Record<string, unknown>).rows)
      ? ((flowIdx as Record<string, unknown>).rows as FlowIdxRow[])
      : [];
    for (const row of rows) {
      if (row.key) flowMap[row.key.toUpperCase()] = row;
    }
  }

  const tiles: HeatmapTile[] = [];
  for (const [ticker, sym] of Object.entries(manifest.symbols)) {
    const flow = flowMap[ticker.toUpperCase()];
    const sector: GicsSector = getSector(ticker);

    const tile: HeatmapTile = {
      ticker,
      name: sym.name,
      sector,
      price: sym.last,
      chg1d: sym.chg,
      vol: sym.vol,
      hi52: sym.hi52,
      lo52: sym.lo52,
      hasFlow: false,
    };

    if (flow) {
      tile.hasFlow = true;
      tile.flowAsof = flow.asof;
      tile.netPremiumMn = flow.net_premium_mn;
      tile.tone = flow.tone;
      tile.netDoi = flow.net_doi;
      tile.doiPc = flow.doi_pc;
      tile.zerodte = flow.zerodte_share;
      tile.freshContracts = flow.fresh_contracts;
      tile.posLean = flow.positioning_lean;
      tile.signedPc = flow.signed_pc;
      tile.verdict = flow.verdict;
    }

    tiles.push(tile);
  }

  return tiles;
}

// ─── Breadth strip computations ───────────────────────────────────────────────

interface BreadthStats {
  advancers: number;
  decliners: number;
  total: number;
  totalPremiumMn: number;
  callShareClass: "CALL-HEAVY" | "PUT-HEAVY" | "MIXED";
  callSharePct: number | null;  // null if no flow data
  priceMode: "BULLISH" | "BEARISH" | "MIXED";
}

function computeBreadth(tiles: HeatmapTile[]): BreadthStats {
  const advancers = tiles.filter(t => t.chg1d > 0).length;
  const decliners = tiles.filter(t => t.chg1d < 0).length;
  const total = tiles.length;

  const flowTiles = tiles.filter(t => t.hasFlow);
  const totalPremiumMn = flowTiles.reduce((s, t) => s + (t.netPremiumMn ?? 0), 0);

  // Call share: use doiPc (P/C ratio; call share = 1 / (1 + doiPc) approximation)
  // doiPc is put/call ΔOI ratio — call-heavy = low doiPc
  // We compute the fraction of tiles with positive tone as a proxy
  const flowWithTone = flowTiles.filter(t => t.tone && t.tone !== "neutral");
  const posCount = flowWithTone.filter(t => t.tone === "pos").length;
  const callSharePct = flowWithTone.length > 0 ? posCount / flowWithTone.length : null;

  let callShareClass: BreadthStats["callShareClass"] = "MIXED";
  if (callSharePct != null) {
    const dev = callSharePct - 0.5;
    if (dev > CALL_SHARE_DEAD) callShareClass = "CALL-HEAVY";
    else if (dev < -CALL_SHARE_DEAD) callShareClass = "PUT-HEAVY";
    else callShareClass = "MIXED";
  }

  const breadthPct = total > 0 ? advancers / total : 0;
  const avgChg = tiles.length > 0 ? tiles.reduce((s, t) => s + t.chg1d, 0) / tiles.length : 0;
  let priceMode: BreadthStats["priceMode"] = "MIXED";
  if (breadthPct >= 0.60 && avgChg > 0.2) priceMode = "BULLISH";
  else if (breadthPct <= 0.40 && avgChg < -0.2) priceMode = "BEARISH";

  return { advancers, decliners, total, totalPremiumMn, callShareClass, callSharePct, priceMode };
}

// ─── Sector chip data ─────────────────────────────────────────────────────────

interface SectorChipData {
  sector: GicsSector;
  label: string;
  avgChg: number;
  count: number;
}

function computeSectorChips(tiles: HeatmapTile[]): SectorChipData[] {
  const bySector: Partial<Record<GicsSector, HeatmapTile[]>> = {};
  for (const t of tiles) {
    if (!bySector[t.sector]) bySector[t.sector] = [];
    bySector[t.sector]!.push(t);
  }
  return SECTOR_ORDER.flatMap(s => {
    const ts = bySector[s];
    if (!ts || ts.length === 0) return [];
    const avgChg = ts.reduce((a, t) => a + t.chg1d, 0) / ts.length;
    return [{ sector: s, label: SECTOR_LABEL[s] ?? s, avgChg, count: ts.length }];
  });
}

// ─── HeatmapView ─────────────────────────────────────────────────────────────

export function HeatmapView() {
  const { lang } = useLang();
  const t = makeHeatmapT(lang);
  const zh = lang === "zh";

  // ── Data state ──────────────────────────────────────────────────────────────
  const [manifest, setManifest] = useState<ManifestPayload | null>(null);
  const [flowIdx, setFlowIdx]   = useState<FlowIdxPayload | null>(null);
  const [loadingManifest, setLoadingManifest] = useState(true);
  const [loadingFlow,     setLoadingFlow]     = useState(true);
  const [flowError,       setFlowError]       = useState(false);

  // ── UI state ─────────────────────────────────────────────────────────────────
  const [layer,     setLayer]     = useState<Layer>("price");
  const [view,      setView]      = useState<View>("map");
  const [sizing,    setSizing]    = useState<SizingMode>("equal");
  const [timeframe] = useState<Timeframe>("1D");  // only 1D enabled in v1
  const [sectorFilt, setSectorFilt] = useState<GicsSector | null>(null);
  const [search,    setSearch]    = useState("");
  const [selected,  setSelected]  = useState<HeatmapTile | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Fetch manifest ────────────────────────────────────────────────────────────
  // Primary: /api/flow?f=manifest (integrator wires this in route.ts)
  // Fallback: /data/manifest.json (static public file, always present)
  const fetchManifest = useCallback(async () => {
    let data = await safeFetch<ManifestPayload>("/api/flow?f=manifest");
    if (!data) {
      data = await safeFetch<ManifestPayload>("/data/manifest.json");
    }
    if (data) {
      setManifest(data);
    }
    setLoadingManifest(false);
  }, []);

  // ── Fetch flow index ──────────────────────────────────────────────────────────
  // Primary: /api/flow?f=flow_idx (integrator wires this in route.ts)
  // Fallback: /data/flow_idx.json (VPS-mirrored from GitHub Pages via pull_macro_intel)
  // Tertiary: direct GitHub Pages URL (may hit CORS in some environments)
  const fetchFlow = useCallback(async () => {
    let data = await safeFetch<FlowIdxPayload>("/api/flow?f=flow_idx");
    if (!data) {
      data = await safeFetch<FlowIdxPayload>("/data/flow_idx.json");
    }
    if (data) {
      setFlowIdx(data);
      setFlowError(false);
    } else {
      // Flow index unavailable — heatmap degrades gracefully to price-only
      setFlowError(true);
    }
    setLoadingFlow(false);
  }, []);

  // ── Mount ─────────────────────────────────────────────────────────────────────
  useEffect(() => {
    void fetchManifest();
    void fetchFlow();

    pollRef.current = setInterval(() => {
      void fetchManifest();
      void fetchFlow();
    }, POLL_MS);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Layer change: auto-select sizing ─────────────────────────────────────────
  const handleLayerChange = useCallback((l: Layer) => {
    setLayer(l);
    setSizing(l === "flow" ? "premium" : "equal");
    setSelected(null);
  }, []);

  // ── Build tiles ───────────────────────────────────────────────────────────────
  const allTiles = buildTiles(manifest, flowIdx);

  // Filter by sector + search
  const tiles = allTiles.filter(tile => {
    if (sectorFilt && tile.sector !== sectorFilt) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!tile.ticker.toLowerCase().includes(q) && !tile.name.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const breadth = computeBreadth(allTiles);
  const sectorChips = computeSectorChips(allTiles);

  const isLoading = loadingManifest;

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div style={OUTER}>

      {/* ═══ GEX REGIME CAVEAT BANNER (HONESTY DOCTRINE) ═════════════════════ */}
      <div style={REGIME_BANNER}>
        <span style={{ color: "var(--warn)", fontWeight: 600, marginRight: 6 }}>
          {zh ? "注意" : "NOTE"}
        </span>
        {t("regimeCaveat")}
      </div>

      {/* ═══ BREADTH STRIP ════════════════════════════════════════════════════ */}
      <div style={BREADTH_STRIP}>
        {/* Mode label */}
        <div style={BREADTH_MODE}>
          <span style={{
            fontWeight: 700,
            color: layer === "price"
              ? (breadth.priceMode === "BULLISH" ? "var(--up)" : breadth.priceMode === "BEARISH" ? "var(--down)" : "var(--warn)")
              : (breadth.callShareClass === "CALL-HEAVY" ? "var(--up)" : breadth.callShareClass === "PUT-HEAVY" ? "var(--down)" : "var(--warn)"),
          }}>
            {layer === "price"
              ? (breadth.priceMode === "BULLISH" ? t("bullish") : breadth.priceMode === "BEARISH" ? t("bearish") : t("mixed"))
              : (breadth.callShareClass === "CALL-HEAVY" ? t("callHeavy") : breadth.callShareClass === "PUT-HEAVY" ? t("putHeavy") : t("mixedZone"))
            }
          </span>
        </div>

        <div style={BREADTH_SEP} />

        {/* Advancers / decliners */}
        <div style={BREADTH_ITEM}>
          <span style={{ color: "var(--muted)" }}>{t("advancers")}</span>
          <span style={{ color: "var(--up)", fontVariantNumeric: "tabular-nums", marginLeft: 4 }}>
            {breadth.advancers}
          </span>
          <span style={{ color: "var(--muted)", margin: "0 3px" }}>/</span>
          <span style={{ color: "var(--down)", fontVariantNumeric: "tabular-nums" }}>
            {breadth.decliners}
          </span>
          <span style={{ color: "var(--muted)", marginLeft: 3 }}>
            ({breadth.total > 0 ? Math.round(breadth.advancers / breadth.total * 100) : 0}%)
          </span>
        </div>

        {/* Total flow premium */}
        {breadth.totalPremiumMn > 0 && (
          <>
            <div style={BREADTH_SEP} />
            <div style={BREADTH_ITEM}>
              <span style={{ color: "var(--muted)" }}>{t("totalPremium")}</span>
              <span style={{ fontVariantNumeric: "tabular-nums", marginLeft: 4 }}>
                ${breadth.totalPremiumMn.toFixed(1)}M
              </span>
              <span style={{ fontSize: 9, color: "var(--muted)", fontStyle: "italic", marginLeft: 4 }}>
                {zh ? "仅规模" : "magnitude only"}
              </span>
            </div>
          </>
        )}

        {/* Call-share with dead-zone label */}
        {breadth.callSharePct != null && (
          <>
            <div style={BREADTH_SEP} />
            <div style={BREADTH_ITEM}>
              <span style={{ color: "var(--muted)" }}>{t("callShare")}</span>
              <span style={{ fontVariantNumeric: "tabular-nums", marginLeft: 4 }}>
                {Math.round(breadth.callSharePct * 100)}%
              </span>
              {breadth.callShareClass === "MIXED" && (
                <span style={{ fontSize: 9, color: "var(--muted)", fontStyle: "italic", marginLeft: 4 }}>
                  ({t("mixedZone")})
                </span>
              )}
            </div>
          </>
        )}

        <div style={{ flex: 1 }} />

        {/* Data note */}
        <div style={{ fontSize: 10, color: "var(--muted)", fontStyle: "italic", alignSelf: "center" }}>
          {t("dataNote")}
        </div>
      </div>

      {/* ═══ CONTROLS ROW ════════════════════════════════════════════════════ */}
      <div style={CONTROLS_ROW}>
        {/* Layer toggle */}
        <ToggleGroup>
          <ToggleBtn active={layer === "price"} onClick={() => handleLayerChange("price")}>
            {t("layerPrice")}
          </ToggleBtn>
          <ToggleBtn active={layer === "flow"} onClick={() => handleLayerChange("flow")}>
            {t("layerFlow")}
          </ToggleBtn>
        </ToggleGroup>

        <div style={CTRL_SEP} />

        {/* View toggle */}
        <ToggleGroup>
          <ToggleBtn active={view === "map"} onClick={() => setView("map")}>
            {t("viewMap")}
          </ToggleBtn>
          <ToggleBtn active={view === "table"} onClick={() => setView("table")}>
            {t("viewTable")}
          </ToggleBtn>
        </ToggleGroup>

        <div style={CTRL_SEP} />

        {/* Sizing (map view only) */}
        {view === "map" && (
          <>
            <ToggleGroup>
              <ToggleBtn active={sizing === "equal"} onClick={() => setSizing("equal")}>
                {t("sizeEqual")}
              </ToggleBtn>
              {layer === "flow" && (
                <ToggleBtn active={sizing === "premium"} onClick={() => setSizing("premium")}>
                  {t("sizePremium")}
                </ToggleBtn>
              )}
              {/* CAP sizing deferred */}
              <ToggleBtn active={false} disabled onClick={() => {}}>
                {t("sizeCapDeferred")}
              </ToggleBtn>
            </ToggleGroup>
            <div style={CTRL_SEP} />
          </>
        )}

        {/* Timeframe (1D only; others disabled with accruing note) */}
        <ToggleGroup>
          <ToggleBtn active={timeframe === "1D"} onClick={() => {}}>
            {t("tf1D")}
          </ToggleBtn>
          <ToggleBtn active={false} disabled onClick={() => {}} tooltipText={t("tfAccruingTip")}>
            {t("tf1W")}
          </ToggleBtn>
          <ToggleBtn active={false} disabled onClick={() => {}} tooltipText={t("tfAccruingTip")}>
            {t("tf1M")}
          </ToggleBtn>
          <ToggleBtn active={false} disabled onClick={() => {}} tooltipText={t("tfAccruingTip")}>
            {t("tfYTD")}
          </ToggleBtn>
        </ToggleGroup>

        <div style={{ flex: 1 }} />

        {/* Search */}
        <input
          type="text"
          placeholder={t("searchPlaceholder")}
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={SEARCH_INPUT}
          aria-label={t("searchPlaceholder")}
        />
      </div>

      {/* ═══ SECTOR CHIPS ════════════════════════════════════════════════════ */}
      <div style={SECTOR_CHIPS_ROW}>
        <SectorChip
          label={t("sectorAll")}
          active={sectorFilt === null}
          avgChg={null}
          onClick={() => setSectorFilt(null)}
        />
        {sectorChips.map(sc => (
          <SectorChip
            key={sc.sector}
            label={sc.label}
            active={sectorFilt === sc.sector}
            avgChg={sc.avgChg}
            onClick={() => setSectorFilt(prev => prev === sc.sector ? null : sc.sector)}
          />
        ))}
      </div>

      {/* ═══ FLOW SOFT DISCLAIMER (flow layer only) ══════════════════════════ */}
      {layer === "flow" && !flowError && !loadingFlow && (
        <div style={FLOW_NOTE_BAR}>
          {t("toneSoftNote")}
        </div>
      )}

      {flowError && (
        <div style={FLOW_ERR_BAR}>
          {t("noFlowData")}
        </div>
      )}

      {/* ═══ MAIN CANVAS ═════════════════════════════════════════════════════ */}
      <div style={CANVAS_AREA}>
        {isLoading ? (
          <LoadingState t={t} />
        ) : tiles.length === 0 ? (
          <EmptyState t={t} />
        ) : view === "map" ? (
          <Treemap
            tiles={tiles}
            layer={layer}
            sizing={sizing}
            selectedTicker={selected?.ticker ?? null}
            onSelect={setSelected}
            lang={lang}
          />
        ) : (
          <HeatmapTable
            tiles={tiles}
            layer={layer}
            selectedTicker={selected?.ticker ?? null}
            onSelect={setSelected}
            lang={lang}
          />
        )}
      </div>

      {/* ═══ DETAIL PANEL ════════════════════════════════════════════════════ */}
      {selected && (
        <DetailPanel
          tile={selected}
          layer={layer}
          lang={lang}
          onClose={() => setSelected(null)}
        />
      )}

    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ToggleGroup({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "flex", gap: 2 }}>{children}</div>;
}

function ToggleBtn({
  active, disabled, onClick, children, tooltipText,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  tooltipText?: string;
}) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        padding: "4px 9px",
        fontSize: 11,
        fontWeight: 600,
        borderRadius: 4,
        background: active ? "var(--brand)" : "var(--panel-3)",
        color: active ? "#fff" : disabled ? "var(--muted)" : "var(--text-2)",
        border: "none",
        cursor: disabled ? "not-allowed" : "pointer",
        letterSpacing: "0.03em",
        opacity: disabled ? 0.6 : 1,
      }}
      // aria-label is used instead of title= for accessibility and CI compliance
      aria-label={tooltipText}
    >
      {children}
    </button>
  );
}

function SectorChip({
  label, active, avgChg, onClick,
}: {
  label: string;
  active: boolean;
  avgChg: number | null;
  onClick: () => void;
}) {
  const chgColor = avgChg == null ? undefined
    : avgChg > 0 ? "var(--up)" : avgChg < 0 ? "var(--down)" : "var(--muted)";

  return (
    <button
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "3px 8px",
        fontSize: 10,
        fontWeight: 600,
        borderRadius: 999,
        background: active ? "var(--brand)" : "var(--panel-3)",
        color: active ? "#fff" : "var(--text-2)",
        border: "none",
        cursor: "pointer",
        whiteSpace: "nowrap",
        letterSpacing: "0.04em",
      }}
    >
      {label}
      {avgChg != null && (
        <span style={{ color: active ? "rgba(255,255,255,0.8)" : chgColor, fontVariantNumeric: "tabular-nums" }}>
          {avgChg >= 0 ? "+" : ""}{avgChg.toFixed(1)}%
        </span>
      )}
    </button>
  );
}

function LoadingState({ t }: { t: (k: Parameters<ReturnType<typeof makeHeatmapT>>[0]) => string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--muted)", fontSize: 13 }}>
      {t("loadingHeatmap")}
    </div>
  );
}

function EmptyState({ t }: { t: (k: Parameters<ReturnType<typeof makeHeatmapT>>[0]) => string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--muted)", fontSize: 13 }}>
      {t("noData")}
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const OUTER: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  height: "100%",
  overflow: "hidden",
  background: "var(--bg)",
  fontFamily: "var(--font-ui)",
};

const REGIME_BANNER: React.CSSProperties = {
  padding: "5px 14px",
  fontSize: 10,
  color: "var(--muted)",
  fontStyle: "italic",
  borderBottom: "1px solid var(--line-2)",
  background: "rgba(232,179,57,0.04)",
  lineHeight: 1.5,
  flexShrink: 0,
};

const BREADTH_STRIP: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 0,
  padding: "5px 12px",
  borderBottom: "1px solid var(--line)",
  background: "var(--panel)",
  flexShrink: 0,
  flexWrap: "wrap",
  rowGap: 4,
};

const BREADTH_MODE: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: "0.04em",
};

const BREADTH_SEP: React.CSSProperties = {
  width: 1,
  height: 16,
  background: "var(--line)",
  margin: "0 10px",
  flexShrink: 0,
};

const BREADTH_ITEM: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  fontSize: 11,
  color: "var(--text)",
};

const CONTROLS_ROW: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: "6px 12px",
  borderBottom: "1px solid var(--line)",
  background: "var(--panel)",
  flexShrink: 0,
  flexWrap: "wrap",
  rowGap: 4,
};

const CTRL_SEP: React.CSSProperties = {
  width: 1,
  height: 20,
  background: "var(--line)",
  flexShrink: 0,
};

const SECTOR_CHIPS_ROW: React.CSSProperties = {
  display: "flex",
  gap: 4,
  padding: "5px 12px",
  borderBottom: "1px solid var(--line-2)",
  background: "var(--panel)",
  overflowX: "auto",
  flexShrink: 0,
};

const FLOW_NOTE_BAR: React.CSSProperties = {
  padding: "4px 14px",
  fontSize: 9,
  color: "var(--muted)",
  fontStyle: "italic",
  borderBottom: "1px solid var(--line-2)",
  flexShrink: 0,
};

const FLOW_ERR_BAR: React.CSSProperties = {
  padding: "4px 14px",
  fontSize: 10,
  color: "var(--warn)",
  borderBottom: "1px solid var(--line-2)",
  flexShrink: 0,
};

const CANVAS_AREA: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflow: "hidden",
  position: "relative",
};

const SEARCH_INPUT: React.CSSProperties = {
  height: 28,
  padding: "0 10px",
  borderRadius: 4,
  background: "var(--inset)",
  border: "1px solid var(--line)",
  color: "var(--text)",
  fontSize: 11,
  outline: "none",
  width: 140,
  fontFamily: "var(--font-ui)",
};
