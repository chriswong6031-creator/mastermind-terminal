"use client";
/**
 * MaxPainPanel — the intrinsic-value curve for one expiration: total/call/put
 * writer payout per candidate settle strike, with the max-pain strike and
 * spot_ref drawn as reference lines.
 *
 * Max pain is a DESCRIPTIVE minimization over t-1 open interest, never a price
 * forecast — the strike chip carries that disclosure via Tip. Expiration chips
 * list only the expiries that carry a curve (the payload caps curves to the
 * nearest few; Max-Pain-by-expiration covers the rest one panel over). The
 * curve window is upstream (±20% of spot, argmin always included) — nothing is
 * re-trimmed here.
 */

import React, { useMemo, useRef, useState } from "react";
import {
  useChartWidth, niceTicks, fmtTick, thinLabels, padDomain,
} from "@/components/charts/svgChart";
import type { Lang } from "@/lib/i18n";
import { Tip } from "@/components/ui/Tip";
import { makeStructureT } from "./structureStrings";
import type { MaxPainExpRow } from "./structureTypes";
import {
  CALL_COLOR, PUT_COLOR, fmtMn, finiteSegments, ProvenanceLine, PanelEmpty,
  PLOT_PAD, AXIS_TXT, REF_TXT, NEUTRAL_CHIP, LEGEND_ITEM, LEGEND_SWATCH,
} from "./structureShared";

const H = 230;
const TOTAL_COLOR = "var(--brand)";

export function MaxPainPanel({
  expiries,
  spotRef,
  lang,
}: {
  expiries: MaxPainExpRow[] | undefined;
  spotRef: number | null | undefined;
  lang: Lang;
}) {
  const t = makeStructureT(lang);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const w = useChartWidth(boxRef);

  // Only expiries that carry a drawable curve appear as chips here.
  const exps = useMemo(
    () => (expiries ?? []).filter(
      (r) => typeof r?.exp === "string" && Array.isArray(r.curve) && r.curve.length >= 2,
    ),
    [expiries],
  );

  // Selection keyed to the expiration list it was made against (root switches
  // swap the list — a stale selection must fall back to the front expiration).
  const expsKey = useMemo(() => exps.map((r) => r.exp).join("|"), [exps]);
  const [sel, setSel] = useState<{ key: string; exp: string } | null>(null);
  const active =
    (sel && sel.key === expsKey ? exps.find((r) => r.exp === sel.exp) : undefined) ??
    exps[0] ?? null;

  const pts = useMemo(() => {
    const out = (active?.curve ?? [])
      .filter((p) => Number.isFinite(Number(p?.strike)))
      .map((p) => ({
        strike: Number(p.strike),
        call: Number(p.call_value_mn),
        put: Number(p.put_value_mn),
        total: Number(p.value_mn),
      }));
    out.sort((a, b) => a.strike - b.strike);
    return out;
  }, [active]);

  const drawable = pts.length >= 2;
  const maxPain = active?.max_pain ?? null;

  const [x0, x1] = useMemo(() => {
    if (!drawable) return [0, 1] as [number, number];
    return padDomain(pts[0].strike, pts[pts.length - 1].strike, { padFrac: 0.04 });
  }, [pts, drawable]);

  const [y0, y1] = useMemo(() => {
    if (!drawable) return [0, 1] as [number, number];
    let hi = -Infinity;
    for (const p of pts) {
      for (const v of [p.call, p.put, p.total]) {
        if (Number.isFinite(v) && v > hi) hi = v;
      }
    }
    return padDomain(0, Math.max(hi, 1e-6), { clampMin: 0, padFrac: 0.06 });
  }, [pts, drawable]);

  const plotW = Math.max(10, w - PLOT_PAD.l - PLOT_PAD.r);
  const plotH = H - PLOT_PAD.t - PLOT_PAD.b;
  const xOf = (k: number) => PLOT_PAD.l + ((k - x0) / Math.max(1e-9, x1 - x0)) * plotW;
  const yOf = (v: number) => PLOT_PAD.t + (1 - (v - y0) / Math.max(1e-9, y1 - y0)) * plotH;

  const { values: yTicks, step: yStep } = niceTicks(y0, y1, 4);
  const { values: xTickVals, step: xStep } = niceTicks(x0, x1, 6);
  const xTicks = useMemo(
    () => thinLabels(xTickVals, (v) => xOf(v), 48),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [xTickVals, w, x0, x1],
  );

  const legs = [
    { key: "total" as const, color: TOTAL_COLOR, label: t("legTotalValue"), width: 1.9 },
    { key: "call" as const, color: CALL_COLOR, label: t("legCallValue"), width: 1.3 },
    { key: "put" as const, color: PUT_COLOR, label: t("legPutValue"), width: 1.3 },
  ];

  const spotIn = spotRef != null && Number.isFinite(spotRef) && spotRef >= x0 && spotRef <= x1;
  const mpIn = maxPain != null && Number.isFinite(maxPain) && maxPain >= x0 && maxPain <= x1;

  return (
    <section className="fin-card" style={{ minWidth: 0 }}>
      <div className="fin-card-h" style={{ flexWrap: "wrap", rowGap: 6 }}>
        <span>{t("maxPainTitle")}</span>
        <span style={{ flex: 1 }} />
        {legs.map((l) => (
          <span key={l.key} style={LEGEND_ITEM}>
            <span style={{ ...LEGEND_SWATCH, background: l.color }} />{l.label}
          </span>
        ))}
      </div>
      {exps.length > 0 && (
        <div role="group" aria-label={t("maxPainExpAria")} style={CONTROLS_ROW}>
          {exps.map((r) => (
            <button
              key={r.exp}
              className={`chip${(active?.exp ?? "") === r.exp ? " on" : ""}`}
              style={EXP_CHIP}
              aria-pressed={(active?.exp ?? "") === r.exp}
              onClick={() => setSel({ key: expsKey, exp: r.exp })}
            >
              {r.exp}
            </button>
          ))}
          <span style={{ flex: 1 }} />
          {maxPain != null && (
            <Tip label={t("maxPainNote")} size="card">
              <button type="button" style={{ ...NEUTRAL_CHIP, cursor: "help" }}>
                {(spotRef != null && Number.isFinite(spotRef)
                  ? t("maxPainVsSpot").replace("{s}", spotRef.toFixed(2))
                  : t("maxPainStrike")
                ).replace("{k}", String(maxPain))}
              </button>
            </Tip>
          )}
        </div>
      )}
      <div ref={boxRef} style={{ width: "100%", minWidth: 0 }}>
        {!drawable ? (
          <PanelEmpty title={t("maxPainEmptyTitle")} why={t("maxPainEmptyWhy")} minHeight={H} />
        ) : (
          <svg viewBox={`0 0 ${w} ${H}`} width={w} height={H} role="img" aria-label={t("maxPainAria")}>
            {yTicks.map((v) => (
              <g key={`y${v}`}>
                <line x1={PLOT_PAD.l} x2={w - PLOT_PAD.r} y1={yOf(v)} y2={yOf(v)} stroke="var(--grid)" />
                <text x={PLOT_PAD.l - 6} y={yOf(v) + 3} textAnchor="end" style={AXIS_TXT}>
                  {fmtMn(v) === "—" ? fmtTick(v, yStep) : fmtMn(v)}
                </text>
              </g>
            ))}
            {xTicks.map((v) => (
              <text key={`x${v}`} x={xOf(v)} y={H - 8} textAnchor="middle" style={AXIS_TXT}>
                {fmtTick(v, xStep)}
              </text>
            ))}
            {/* reference lines under the series */}
            {mpIn && (
              <g>
                <line x1={xOf(maxPain as number)} x2={xOf(maxPain as number)} y1={PLOT_PAD.t} y2={H - PLOT_PAD.b}
                  stroke="var(--text-2)" strokeDasharray="4 3" strokeWidth={1.1} />
                <text x={xOf(maxPain as number) + 4} y={PLOT_PAD.t + 10} style={REF_TXT}>
                  {t("maxPainStrike").replace("{k}", String(maxPain))}
                </text>
              </g>
            )}
            {spotIn && (
              <g>
                <line x1={xOf(spotRef as number)} x2={xOf(spotRef as number)} y1={PLOT_PAD.t} y2={H - PLOT_PAD.b}
                  stroke="var(--muted)" strokeDasharray="2 3" strokeWidth={1} />
                <text x={xOf(spotRef as number) + 4} y={PLOT_PAD.t + 22} style={REF_TXT}>
                  {t("spotLabel")} {(spotRef as number).toFixed(2)}
                </text>
              </g>
            )}
            {legs.map((l) =>
              finiteSegments(pts, (p) => p[l.key]).map((seg, i) => (
                <path
                  key={`${l.key}${i}`}
                  d={seg.map((p, j) => `${j === 0 ? "M" : "L"}${xOf(p.strike).toFixed(1)},${yOf(p[l.key]).toFixed(1)}`).join("")}
                  fill="none" stroke={l.color} strokeWidth={l.width}
                  strokeLinejoin="round" strokeLinecap="round"
                />
              )),
            )}
          </svg>
        )}
      </div>
      <ProvenanceLine lang={lang} />
    </section>
  );
}

const CONTROLS_ROW: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  flexWrap: "wrap",
  marginBottom: 8,
};

const EXP_CHIP: React.CSSProperties = {
  height: 24,
  padding: "0 9px",
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: "0.02em",
  fontVariantNumeric: "tabular-nums",
};
