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
 * §5.3: that law, the grid construction and this markup now live in the shared
 * components/shared/StrikeExpiryMatrix — the Exposure desk's matrix view renders through
 * the SAME module, so the two surfaces can no longer paint one payload two ways (the
 * retired PRISM grid did exactly that). This card is the module's DEFAULT configuration;
 * nothing here may diverge from it without changing the shared defaults.
 *
 * HONESTY: the tier chip follows the metric — signed metrics disclose Tier B, magnitude
 * metrics Tier A. One visible foot line; the rest of the explanation rides the ⓘ Tip.
 */

import React, { useMemo, useState } from "react";
import { MscCard, CardFoot } from "./MscCard";
import { makeMscT, type MscKey } from "./mscStrings";
import s from "./msc.module.css";
import type { Lang } from "@/lib/i18n";
import {
  StrikeExpiryMatrix,
  buildMatrixGrid,
  isSignedMetric,
  DEFAULT_WINDOW_PCT,
  type MatrixMetric,
  type StrikeExpiryDoc,
} from "@/components/shared/StrikeExpiryMatrix";

/** The payload slice this card reads — re-exported from the shared module. */
export type HeatMatrix = StrikeExpiryDoc;

type HeatMetric = MatrixMetric;

const METRICS: { key: HeatMetric; labelKey: MscKey }[] = [
  { key: "hedge", labelKey: "hmMetricHedge" },
  { key: "oi", labelKey: "hmMetricOi" },
  { key: "vol", labelKey: "hmMetricVol" },
  { key: "doi", labelKey: "hmMetricDoi" },
];

/** Strike window each side of spot. ±8% is the session's tradable neighbourhood. */
const WINDOW_PCT = DEFAULT_WINDOW_PCT;

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
  const signed = isSignedMetric(metric);

  // Every knob left at its shared default — this card IS the default configuration.
  const grid = useMemo(
    () => buildMatrixGrid({ matrix, spot, callWall, putWall, metric }),
    [matrix, spot, metric, callWall, putWall]
  );

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
          <StrikeExpiryMatrix
            grid={grid}
            metric={metric}
            classes={{ scroll: s.heatScroll, table: s.heatTable, strike: s.heatStrike }}
          />
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
