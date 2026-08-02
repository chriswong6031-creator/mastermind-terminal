"use client";
/**
 * MatrixHeatCard — strike × expiry dealer heat (masterplan R1.4 + gap M-heatmap).
 *
 * The `matrix:{ROOT}` payload (options_structure.matrix/v1) has been fetched by this tab
 * since W2 and rendered only as a three-row extremes table — the grid itself, the chart
 * every category leader ships (MenthorQ Options→Heatmap, VS3D Position Grid), was never
 * drawn. This card draws it.
 *
 * FRAME: the "Net hedge" metric renders in the tab's one axis — dollars a continuously
 * hedged dealer transacts per +1% spot, i.e. MINUS the cell's gamma exposure — matching
 * `hedgeProfile` (lib/marketStructure.ts) exactly. Rendering raw GEX here would put two
 * opposite colourings of the same strike on one screen.
 *
 * NORMALISATION (R1.4, VS3D's trick): colour saturates at the 5–95th percentile of the
 * visible window, through a sqrt intensity curve — a single monster strike cannot wash
 * out the rest of the field, and the tail of small cells stays visible.
 *
 * COLOUR LAW: hedge cells are a transaction side → --flow-buy/--flow-sell (never flip
 * under html[data-updown="east"]). OI/Volume are magnitudes → single neutral ramp.
 * ΔOI build/unwind uses the structure tab's neutral pair (--brand-2/--ai), never
 * --up/--down.
 *
 * HONESTY: the tier chip follows the metric — signed metrics disclose Tier B, magnitude
 * metrics Tier A. One visible foot line; the rest of the explanation rides the ⓘ Tip.
 */

import React, { useMemo, useState } from "react";
import { MscCard, CardFoot } from "./MscCard";
import { makeMscT, type MscKey } from "./mscStrings";
import s from "./msc.module.css";
import type { Lang } from "@/lib/i18n";

/** Structural superset of gexLadder's GexMatrixCell — the payload carries all of these. */
interface HeatCell {
  strike: number;
  expiry: string;
  gex?: number | null;
  call_oi?: number | null;
  put_oi?: number | null;
  call_vol?: number | null;
  put_vol?: number | null;
  /** The builder publishes an OBJECT {call, put} (PIT-lagged ΔOI per leg). */
  delta_oi?: number | { call?: number | null; put?: number | null } | null;
}

export interface HeatMatrix {
  asof?: string;
  spot?: number | null;
  expiries?: string[];
  strikes?: number[];
  cells?: HeatCell[];
  /** Prod: the SESSION date; the top-level asof is the build timestamp. */
  _build_meta?: { asof_date?: string | null } | null;
}

type HeatMetric = "hedge" | "oi" | "vol" | "doi";

const METRICS: { key: HeatMetric; labelKey: MscKey; signed: boolean }[] = [
  { key: "hedge", labelKey: "hmMetricHedge", signed: true },
  { key: "oi", labelKey: "hmMetricOi", signed: false },
  { key: "vol", labelKey: "hmMetricVol", signed: false },
  { key: "doi", labelKey: "hmMetricDoi", signed: true },
];

/** Strike window each side of spot. ±8% is the session's tradable neighbourhood. */
const WINDOW_PCT = 8;
/** Row/column caps keep the grid readable; the foot discloses what was cut. */
const MAX_ROWS = 41;
const MAX_COLS = 14;
/** R1.4: colour saturates at this percentile of the visible field. */
const CLIP_PCTILE = 95;
const FLOOR_PCTILE = 5;

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/** ΔOI arrives as {call, put} from the builder (and the fixture); flatten to net. */
const numDoi = (v: HeatCell["delta_oi"]): number | null => {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const c = num(v.call);
  const p = num(v.put);
  return c == null && p == null ? null : (c ?? 0) + (p ?? 0);
};

function pctile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

/** Cell value in the chosen metric. null = not published, 0 = published zero. */
function cellValue(c: HeatCell, m: HeatMetric): number | null {
  switch (m) {
    case "hedge": {
      const g = num(c.gex);
      // matrix gex is WHOLE DOLLARS of exposure; the tab speaks $mn of hedge.
      return g == null ? null : g === 0 ? 0 : -g / 1e6;
    }
    case "oi": {
      const a = num(c.call_oi);
      const b = num(c.put_oi);
      return a == null && b == null ? null : (a ?? 0) + (b ?? 0);
    }
    case "vol": {
      const a = num(c.call_vol);
      const b = num(c.put_vol);
      return a == null && b == null ? null : (a ?? 0) + (b ?? 0);
    }
    case "doi":
      return numDoi(c.delta_oi);
  }
}

function fmtCell(v: number, m: HeatMetric): string {
  const a = Math.abs(v);
  const sign = v < 0 ? "−" : m === "hedge" || m === "doi" ? "+" : "";
  if (m === "hedge") {
    if (a >= 1000) return `${sign}${(a / 1000).toFixed(1)}B`;
    if (a >= 10) return `${sign}${a.toFixed(0)}M`;
    return `${sign}${a.toFixed(1)}M`;
  }
  if (a >= 1e6) return `${sign}${(a / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${sign}${(a / 1e3).toFixed(1)}K`;
  return `${sign}${a.toFixed(0)}`;
}

export function MatrixHeatCard({
  matrix,
  spot,
  callWall,
  putWall,
  lang,
}: {
  matrix: HeatMatrix | null | undefined;
  spot: number | null | undefined;
  callWall: number | null | undefined;
  putWall: number | null | undefined;
  lang: Lang;
}) {
  const t = makeMscT(lang);
  const [metric, setMetric] = useState<HeatMetric>("hedge");
  const signed = METRICS.find((m) => m.key === metric)?.signed ?? true;

  const grid = useMemo(() => {
    const cells = matrix?.cells;
    if (!Array.isArray(cells) || cells.length === 0) return null;

    const spotRef = num(matrix?.spot) ?? num(spot);
    const allStrikes = [...new Set(cells.map((c) => c.strike).filter((k) => Number.isFinite(k)))];
    if (allStrikes.length < 2) return null;

    // Session date: prod's top-level asof is the BUILD timestamp (Fri 23:00Z over a
    // Thursday chain) and prod grids carry ALREADY-EXPIRED expiries — dead columns
    // unless filtered against the session the cells actually describe.
    const sessionDate =
      (typeof matrix?._build_meta?.asof_date === "string" && matrix._build_meta.asof_date) ||
      (typeof matrix?.asof === "string" ? matrix.asof.slice(0, 10) : "");
    const allExps = [...new Set(cells.map((c) => c.expiry).filter(Boolean))]
      .sort()
      .filter((e) => !sessionDate || e.slice(0, 10) >= sessionDate);
    const exps = allExps.slice(0, MAX_COLS);
    const expSet = new Set(exps);

    // Strike buckets (VS3D's 5/10/25/50 idea, chosen automatically): prod ladders run
    // 281 strikes at $1 spacing — raw rows would either overflow or cover ±2% of spot.
    // Pick the smallest round bucket that fits the ±WINDOW_PCT window in ~MAX_ROWS.
    let bucket = 0;
    {
      const windowed = spotRef
        ? allStrikes.filter((k) => Math.abs(k - spotRef) / spotRef <= WINDOW_PCT / 100)
        : allStrikes;
      const src = windowed.length >= 5 ? windowed : allStrikes;
      // The ACTUAL span of the windowed ladder — a thin fixture grid must keep its
      // native resolution while a 281-strike prod ladder coarsens to round buckets.
      const span = Math.max(...src) - Math.min(...src);
      if (Number.isFinite(span) && span > 0) {
        const target = span / (MAX_ROWS - 1);
        bucket = [0.5, 1, 2.5, 5, 10, 25, 50, 100, 250].find((c) => c >= target) ?? 250;
      }
    }
    const toBucket = (k: number) => (bucket > 0 ? Math.round(k / bucket) * bucket : k);

    let strikes = spotRef
      ? [...new Set(allStrikes.filter((k) => Math.abs(k - spotRef) / spotRef <= WINDOW_PCT / 100).map(toBucket))]
      : [...new Set(allStrikes.map(toBucket))];
    if (strikes.length < 5) strikes = [...new Set(allStrikes.map(toBucket))];
    if (strikes.length > MAX_ROWS) {
      strikes = spotRef
        ? strikes.sort((a, b) => Math.abs(a - spotRef) - Math.abs(b - spotRef)).slice(0, MAX_ROWS)
        : strikes.slice(0, MAX_ROWS);
    }
    strikes.sort((a, b) => b - a); // ladder order: high strikes on top
    const strikeSet = new Set(strikes);

    // Aggregate raw fields into (bucket, expiry) so every metric sums coherently.
    const byKey = new Map<string, HeatCell>();
    const FIELDS = ["gex", "call_oi", "put_oi", "call_vol", "put_vol", "delta_oi"] as const;
    for (const c of cells) {
      if (!Number.isFinite(c.strike) || !expSet.has(c.expiry)) continue;
      const kb = toBucket(c.strike);
      if (!strikeSet.has(kb)) continue;
      const key = `${kb}|${c.expiry}`;
      let acc = byKey.get(key);
      if (!acc) {
        acc = { strike: kb, expiry: c.expiry };
        byKey.set(key, acc);
      }
      for (const f of FIELDS) {
        // delta_oi is an {call, put} object — flatten before summing.
        const v = f === "delta_oi" ? numDoi(c.delta_oi) : num(c[f]);
        if (v != null) {
          acc[f] = ((f === "delta_oi" ? numDoi(acc.delta_oi) : num(acc[f])) ?? 0) + v;
        }
      }
    }

    // Normalisation over the VISIBLE field only (the window is what the eye compares).
    const mags: number[] = [];
    for (const c of byKey.values()) {
      const v = cellValue(c, metric);
      if (v != null && v !== 0) mags.push(Math.abs(v));
    }
    const base = {
      strikes,
      exps,
      byKey,
      spotRef,
      bucket,
      // Walls land in the bucket that contains them, and only when visible.
      cw: callWall != null && strikeSet.has(toBucket(callWall)) ? toBucket(callWall) : null,
      pw: putWall != null && strikeSet.has(toBucket(putWall)) ? toBucket(putWall) : null,
      nAll: allStrikes.length,
      nExpAll: allExps.length,
    };
    if (!mags.length) return { ...base, scaleHi: 1, scaleLo: 0 };
    mags.sort((a, b) => a - b);
    const scaleHi = pctile(mags, CLIP_PCTILE) || mags[mags.length - 1];
    const scaleLo = signed ? 0 : pctile(mags, FLOOR_PCTILE);
    return { ...base, scaleHi, scaleLo };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matrix, spot, metric, signed, callWall, putWall]);

  const headRight = (
    <span style={CHIP_GROUP} role="group" aria-label={t("hmMetricAria")}>
      {METRICS.map((m) => (
        <button
          key={m.key}
          className={`obs-chip${metric === m.key ? " on" : ""}`}
          style={CHIP}
          aria-pressed={metric === m.key}
          onClick={() => setMetric(m.key)}
        >
          {t(m.labelKey)}
        </button>
      ))}
    </span>
  );

  return (
    <MscCard
      title={t("hmTitle")}
      info={t("hmLead")}
      tier={signed ? t("tierB") : t("tierA")}
      tierWhy={signed ? t("tierBWhy") : t("tierAWhy")}
      headRight={headRight}
      span={12}
    >
      {!grid ? (
        <CardFoot>{t("hmNone")}</CardFoot>
      ) : (
        <>
          <div className={s.heatScroll}>
            <table className={s.heatTable}>
              <thead>
                <tr>
                  <th />
                  {grid.exps.map((e) => (
                    <th key={e} scope="col">
                      {e.slice(5)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grid.strikes.map((k, i) => {
                  const next = grid.strikes[i + 1];
                  const spotBetween =
                    grid.spotRef != null && next != null && k >= grid.spotRef && next < grid.spotRef;
                  const isCw = grid.cw != null && k === grid.cw;
                  const isPw = grid.pw != null && k === grid.pw;
                  const spotBorder = spotBetween
                    ? ({ borderBottom: "1px dashed var(--text-2)" } as const)
                    : null;
                  return (
                    <tr key={k}>
                      <td
                        className={s.heatStrike}
                        style={{ ...(isCw || isPw ? { fontWeight: 700 } : null), ...spotBorder }}
                      >
                        {k.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        {isCw ? " ·CW" : isPw ? " ·PW" : ""}
                      </td>
                      {grid.exps.map((e) => {
                        const c = grid.byKey.get(`${k}|${e}`);
                        const v = c ? cellValue(c, metric) : null;
                        let bg = "transparent";
                        if (v != null && v !== 0) {
                          const a = Math.abs(v);
                          const t01 = signed
                            ? Math.min(1, a / (grid.scaleHi || 1))
                            : Math.min(1, Math.max(0, (a - grid.scaleLo) / ((grid.scaleHi - grid.scaleLo) || 1)));
                          const alpha = Math.max(4, Math.sqrt(t01) * 78);
                          const tone = !signed
                            ? "var(--brand-2)"
                            : metric === "doi"
                              ? v > 0
                                ? "var(--brand-2)"
                                : "var(--ai)"
                              : v > 0
                                ? "var(--flow-buy)"
                                : "var(--flow-sell)";
                          bg = `color-mix(in srgb, ${tone} ${alpha.toFixed(1)}%, transparent)`;
                        }
                        return (
                          <td key={e} style={{ background: bg, ...spotBorder }}>
                            {v == null || v === 0 ? "" : fmtCell(v, metric)}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <CardFoot>
            {t(metric === "hedge" ? "hmLegendHedge" : metric === "doi" ? "hmLegendDoi" : "hmLegendMag")}
            {" · "}
            {t("hmWindow")
              .replace("{p}", String(WINDOW_PCT))
              .replace("{n}", String(grid.strikes.length))
              .replace("{full}", String(grid.nAll))
              .replace("{e}", String(grid.exps.length))}
            {grid.bucket > 0 && grid.strikes.length < grid.nAll
              ? ` · ${t("hmBucket").replace("{b}", String(grid.bucket))}`
              : ""}
            {grid.nExpAll > grid.exps.length
              ? ` · ${t("hmMoreExp").replace("{n}", String(grid.nExpAll - grid.exps.length))}`
              : ""}
            {(callWall != null || putWall != null) ? ` · ${t("hmWalls")}` : ""}
            {grid.spotRef != null ? ` · ${t("hmSpotNote")}` : ""}
          </CardFoot>
        </>
      )}
    </MscCard>
  );
}

const CHIP_GROUP: React.CSSProperties = { display: "flex", gap: 3, flexWrap: "wrap" };
const CHIP: React.CSSProperties = { fontSize: 10, padding: "2px 7px" };
