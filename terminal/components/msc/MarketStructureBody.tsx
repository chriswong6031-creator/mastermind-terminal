"use client";
/**
 * MarketStructureBody — the five Market Structure Core modules (Wave 1 / R0).
 *
 * Program of record: docs/MARKET_STRUCTURE_CORE_MASTERPLAN_2026-08-01.md §R0.
 * Every module is pure arithmetic (lib/marketStructure.ts) over two payloads that already
 * exist — `gex:{ROOT}` and `moves:{ROOT}`. No new f-param, no new builder, no new R2 key.
 *
 * PRESENTATION-ONLY: this component owns no fetching and no chrome. `PositioningView`
 * (the Positioning tab) supplies the payloads, the root picker and the as-of chip.
 *
 * WHY A TAB AND NOT A DRAWER ON THE EXPOSURE DESK: the first pass mounted this beside
 * ExposureExpiryDrawer in the desk's left column. Measured at 1440×900, that column is
 * ~296px tall (the summary bar, history strip and EOD belt take the rest), each drawer
 * slot is capped at 58%, and two flexShrink:0 slots overflow the column's clip — the body
 * rendered 136px tall against ~900px of content. The two preceding waves (Structure, then
 * Volatility) each took a tab for the same reason; this follows that precedent.
 *
 * HONESTY (masterplan §4.1):
 *   Tier A modules (topology, expected-move frame, expiry preview) ride on |Γ|·OI and
 *   market-quoted prices — they are labelled as convention-independent.
 *   Tier B modules (sign robustness, hedge-flow scenarios) inherit the payload's
 *   dealer-sign assumption; each carries the convention string and the sensitivity
 *   verdict, and the scenario grid names itself a LOCAL ESTIMATE everywhere it appears.
 *   No support/resistance claim ships in this wave — those need a live grade (R2.4).
 *
 * COLOUR LAW: hedge flow is a TRANSACTION SIDE ("dealers must buy the underlying"), not a
 * price direction, so it uses the --flow-buy/--flow-sell pair that globals.css reserves for
 * exactly that semantic and deliberately does NOT flip under html[data-updown="east"] — the
 * same reasoning the aggressor-volume tokens carry. Using --buy/--sell here would flip the
 * tint for a CN/HK viewer and invite the grid to be read as a price forecast, which it is
 * not. Severity (a fragile sign read, a sign flip on expiry) uses --warn, which never flips.
 *
 * No inline SVG here by design — every bar is a measured CSS width, so the svgChart law
 * has no surface to be violated on.
 */

import React, { useMemo } from "react";
import { Tip } from "@/components/ui/Tip";
import { fmtMn, fmtMnMag } from "@/lib/gexLadder";
import { buildMarketStructure, type MscMoves } from "@/lib/marketStructure";
import type { MarketStructure } from "@/lib/marketStructure";
import { makeMscT, type MscKey } from "./mscStrings";
import { HedgingByStrikeCard, TermStructureCard, DailyHedgingCard } from "./HedgingCards";
import { AggTrendCard, SpotVolCard, ExtremesCard } from "./TrendCards";
import { FloatingStrikeCard, QuadScreenerCard } from "./QuadCards";
import type { AggTrendPayload } from "@/lib/aggTrend";
import type { QuadPayload } from "@/lib/quadBoard";
import type { GexMatrix } from "@/lib/gexLadder";
import type { Lang } from "@/lib/i18n";
import type { GexPayload } from "@/components/gexdesk/GexDeskView";

interface Props {
  gex: GexPayload | null;
  /** `moves:{ROOT}` — the expected-move band + its containment calibration. Optional: */
  moves: MscMoves | null;
  /**
   * `agg:{ROOT}` — the whole-book exposure series (options_hub.aggtrend/v1), one row per
   * session back to 2017 for SPY and 2012 for QQQ. Optional and independently cadenced:
   * the two W2 history cards hide themselves when it is absent rather than the tab failing.
   */
  agg?: AggTrendPayload | null;
  /**
   * `matrix:{ROOT}` — the only store carrying strike AND expiry together, which is what
   * makes a per-horizon answer possible. Published for a subset of roots; the extremes
   * card reports itself unavailable rather than showing blanks when it is missing.
   */
  matrix?: GexMatrix | null;
  /**
   * `quad` — the cross-root positioning board (options_hub.quad/v1). One whole-file
   * artifact shared by every root, so it is fetched once and the committed root is
   * merely highlighted within it.
   */
  quad?: QuadPayload | null;
  /** The committed root, so the screener can mark where the reader already is. */
  root?: string;
  /**
   * Set once this surface gains dated replay (masterplan R2). The expected-move band is a
   * CURRENT-session read, so a caller replaying an archived ladder must pass `moves: null`
   * AND `archived: true` — the expected-move card then explains that the band did not
   * travel with the ladder, instead of silently pairing yesterday's structure with today's
   * band. Today's only caller (PositioningView) is live-only, so this stays false.
   */
  archived?: boolean;
  lang: Lang;
}

const pct = (v: number | null | undefined, dp = 1) =>
  v == null || !Number.isFinite(v) ? "—" : `${v >= 0 ? "" : "−"}${Math.abs(v).toFixed(dp)}%`;
const num = (v: number | null | undefined, dp = 2) =>
  v == null || !Number.isFinite(v) ? "—" : v.toFixed(dp);
const price = (v: number | null | undefined) =>
  v == null || !Number.isFinite(v)
    ? "—"
    : v.toLocaleString(undefined, { maximumFractionDigits: 2 });

export function MarketStructureBody({
  gex,
  moves,
  agg = null,
  matrix = null,
  quad = null,
  root = "",
  archived = false,
  lang,
}: Props) {
  const t = makeMscT(lang);

  const ms: MarketStructure | null = useMemo(() => {
    if (!gex?.by_strike?.length) return null;
    const withFull = gex as GexPayload & { by_strike_full_n?: number | null };
    return buildMarketStructure({
      byStrike: gex.by_strike,
      byExpiry: gex.by_expiry ?? null,
      byStrikeFullN: withFull.by_strike_full_n ?? null,
      spot: gex.spot_ref,
      levels: [
        { key: "call_wall", price: gex.call_wall },
        { key: "put_wall", price: gex.put_wall },
        { key: "flip", price: gex.gamma_flip },
        { key: "max_pain", price: gex.max_pain ?? null },
        { key: "magnet", price: gex.magnet ?? null },
      ],
      moves,
    });
  }, [gex, moves]);

  // The absolute-gamma strike is derived here, not published, so it joins the EM frame
  // after the fact rather than being threaded through the level list above.
  const emLevels = useMemo(() => {
    if (!ms) return [];
    const absK = ms.topology.absGammaStrike;
    if (absK == null || !Number.isFinite(gex?.spot_ref ?? NaN)) return ms.em.levels;
    if (ms.em.levels.some((l) => l.price === absK)) return ms.em.levels;
    const spot = gex!.spot_ref as number;
    const distEm =
      ms.em.emAbs1sig && ms.em.emAbs1sig > 0 ? Math.abs(absK - spot) / ms.em.emAbs1sig : null;
    return [
      ...ms.em.levels,
      {
        key: "abs_gamma",
        price: absK,
        distEm,
        distPct: ((absK - spot) / spot) * 100,
        side: (absK > spot ? "above" : absK < spot ? "below" : "at") as "above" | "below" | "at",
        reachable: distEm == null ? null : distEm <= 1.5,
      },
    ].sort((a, b) => (a.distEm ?? Infinity) - (b.distEm ?? Infinity));
  }, [ms, gex]);

  if (!ms) return <div style={EMPTY}>{t("noData")}</div>;

  return (
    <div id="msc-panel-body" style={BODY}>
      {ms.agg.windowed && (
        <div style={NOTE}>
          {t("windowed")
            .replace("{n}", String(ms.agg.nStrikes))
            .replace("{full}", String(ms.agg.nStrikesFull))}
        </div>
      )}

      <div style={GRID}>
        {/* Volland-parity W1: the hedging-requirement reframing leads, because it is the
            question every other card is a refinement of — "what must dealers trade?" */}
        <HedgingByStrikeCard byStrike={gex?.by_strike ?? null} spot={gex?.spot_ref ?? null} lang={lang} />
        <DailyHedgingCard agg={ms.agg} emPct1sig={ms.em.emPct1sig} lang={lang} />
        <TermStructureCard byExpiry={gex?.by_expiry ?? null} asof={gex?.asof ?? null} lang={lang} />
        <SignCard ms={ms} t={t} convention={gex?.convention ?? null} />
        <TopologyCard ms={ms} t={t} />
        <ScenarioCard ms={ms} t={t} />
        <EmCard ms={ms} t={t} levels={emLevels} archived={archived} />
        <ExpiryCard ms={ms} t={t} />
        {/* Volland-parity W2. History is independently cadenced from the nightly ladder,
            so each card is rendered only when its own payload arrived — a missing series
            hides one card rather than emptying the tab. Placed after the single-session
            cards because they answer "how does today compare", which only means something
            once the reader has seen today. */}
        {agg?.series?.length ? <AggTrendCard agg={agg} lang={lang} /> : null}
        {agg?.series?.length ? <SpotVolCard agg={agg} lang={lang} /> : null}
        <ExtremesCard
          matrix={matrix}
          spot={gex?.spot_ref ?? null}
          asof={gex?.asof ?? null}
          lang={lang}
        />
        {/* Volland-parity W3. Floating strike is per-root and rides the gex payload;
            the screener is one cross-root board and closes the tab by answering "and
            where does this ticker sit among everything else". */}
        <FloatingStrikeCard byDelta={gex?.by_delta ?? null} lang={lang} />
        {quad?.rows?.length ? <QuadScreenerCard quad={quad} root={root} lang={lang} /> : null}
      </div>
    </div>
  );
}

// ─── Shared card chrome ──────────────────────────────────────────────────────────────

function Card({
  title,
  tier,
  tierWhy,
  lead,
  wide,
  children,
}: {
  title: string;
  tier: string;
  tierWhy: string;
  lead?: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section style={{ ...CARD, ...(wide ? { gridColumn: "1 / -1" } : null) }}>
      <header style={CARD_HD}>
        <span className="obs-lbl">{title}</span>
        <Tip label={tierWhy} side="top" size="card">
          <span style={TIER_CHIP} tabIndex={0}>{tier}</span>
        </Tip>
      </header>
      {lead && <p style={LEAD}>{lead}</p>}
      {children}
    </section>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div style={STAT}>
      <span style={STAT_LBL}>{label}</span>
      <span style={{ ...STAT_VAL, ...(tone ? { color: tone } : null) }}>{value}</span>
    </div>
  );
}

type T = (k: MscKey) => string;

// ─── Module A — sign robustness (Tier B) ─────────────────────────────────────────────

function SignCard({ ms, t, convention }: { ms: MarketStructure; t: T; convention: string | null }) {
  const s = ms.sign;
  const fragile = s.verdict === "fragile";
  const verdictKey: MscKey =
    s.verdict === "robust" ? "signRobust" : s.verdict === "fragile" ? "signFragile" : "signUnknown";

  // The convention track runs w = −1 … +1. Our published convention sits at +1; the
  // critical weight is where net gamma would be zero. When w* falls outside the track the
  // marker is omitted and the copy says outright that nothing in range flips the read.
  const wStar = s.criticalWeight;
  const inRange = wStar != null && wStar >= -1 && wStar <= 1;
  const posOf = (w: number) => ((w + 1) / 2) * 100;

  return (
    <Card title={t("signTitle")} tier={t("tierB")} tierWhy={t("tierBWhy")} lead={t("signLead")}>
      <div style={ROW}>
        <div style={STAT}>
          <span style={STAT_LBL}>
            <Tip label={t("signTiltWhy")} side="top" size="card">
              <span tabIndex={0} style={HINT}>{t("signTilt")}</span>
            </Tip>
          </span>
          <span style={{ ...STAT_VAL, color: fragile ? "var(--warn)" : "var(--text)" }}>
            {s.tilt == null ? "—" : pct(s.tilt * 100)}
          </span>
        </div>
        <div style={STAT}>
          <span style={STAT_LBL}>
            <Tip label={t("signCriticalWhy")} side="top" size="card">
              <span tabIndex={0} style={HINT}>{t("signCritical")}</span>
            </Tip>
          </span>
          <span style={STAT_VAL}>{inRange ? num(wStar, 2) : t("signNoFlip")}</span>
        </div>
        <div style={STAT}>
          <span style={STAT_LBL}>{t("signVerdictLbl")}</span>
          <span style={{ ...STAT_VAL, color: fragile ? "var(--warn)" : "var(--text)" }}>
            {t(verdictKey)}
          </span>
        </div>
      </div>

      {/* Convention track: −1 … +1, our published convention pinned at +1. */}
      <div style={TRACK_WRAP} aria-hidden>
        <div style={TRACK}>
          <div style={{ ...TRACK_TICK, left: `${posOf(0)}%` }} />
          {inRange && (
            <div
              style={{
                ...TRACK_CRIT,
                left: `${posOf(wStar!)}%`,
                background: fragile ? "var(--warn)" : "var(--text-dim)",
              }}
            />
          )}
          <div style={{ ...TRACK_HERE, left: `${posOf(1)}%` }} />
        </div>
        <div style={TRACK_AXIS}>
          <span>{t("signWeightMinus1")}</span>
          <span>{t("signWeight0")}</span>
          <span style={{ color: "var(--text-2)" }}>{t("signWeightPlus1")}</span>
        </div>
      </div>

      <div style={SUB_LBL}>{t("signCurve")}</div>
      <ul style={CURVE_LIST}>
        {s.curve.map((p) => (
          <li key={p.w} style={CURVE_ROW}>
            <span style={CURVE_W}>{p.w > 0 ? `+${p.w}` : p.w === 0 ? "0" : `−${Math.abs(p.w)}`}</span>
            <span style={{ ...CURVE_V, color: p.netMn >= 0 ? "var(--text)" : "var(--text-2)" }}>
              {fmtMn(p.netMn)}
            </span>
          </li>
        ))}
      </ul>

      <p style={{ ...FOOT, color: fragile ? "var(--warn)" : "var(--muted)" }}>
        {fragile ? t("signFragileNote") : t("signRobustNote")}
      </p>
      {convention && (
        <p style={FOOT}>
          {t("signConventionLabel")}: {convention}
        </p>
      )}
    </Card>
  );
}

// ─── Module B — gamma topology (Tier A) ──────────────────────────────────────────────

function TopologyCard({ ms, t }: { ms: MarketStructure; t: T }) {
  const tp = ms.topology;
  if (tp.absGammaStrike == null) {
    return (
      <Card title={t("topoTitle")} tier={t("tierA")} tierWhy={t("tierAWhy")}>
        <p style={FOOT}>{t("topoNone")}</p>
      </Card>
    );
  }
  const top = tp.topStrikes;
  const maxAbs = top.length ? top[0].absMn : 1;

  return (
    <Card title={t("topoTitle")} tier={t("tierA")} tierWhy={t("tierAWhy")}>
      <div style={ROW}>
        <div style={STAT}>
          <span style={STAT_LBL}>
            <Tip label={t("topoAbsWhy")} side="top" size="card">
              <span tabIndex={0} style={HINT}>{t("topoAbsStrike")}</span>
            </Tip>
          </span>
          <span style={STAT_VAL}>{price(tp.absGammaStrike)}</span>
        </div>
        <Stat
          label={t("topoShare")}
          value={tp.concentrationShare == null ? "—" : pct(tp.concentrationShare * 100)}
        />
      </div>

      <div style={SUB_LBL}>{t("topoRanked")}</div>
      <table style={TABLE}>
        <thead>
          <tr>
            <th style={TH}>{t("topoColStrike")}</th>
            <th style={{ ...TH, textAlign: "right" }}>{t("topoColAbs")}</th>
            <th style={{ ...TH, textAlign: "right" }}>{t("topoColShare")}</th>
          </tr>
        </thead>
        <tbody>
          {top.map((s) => (
            <tr key={s.strike}>
              <td style={TD}>{price(s.strike)}</td>
              <td style={{ ...TD, textAlign: "right" }}>
                <span style={BAR_WRAP}>
                  <span
                    style={{ ...BAR, width: `${Math.max(2, (s.absMn / maxAbs) * 100)}%` }}
                  />
                </span>
                {fmtMnMag(s.absMn)}
              </td>
              <td style={{ ...TD, textAlign: "right", color: "var(--text-2)" }}>
                {pct(s.share * 100)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

// ─── Module C — hedge-flow scenario grid (Tier B) ────────────────────────────────────

function ScenarioCard({ ms, t }: { ms: MarketStructure; t: T }) {
  const g = ms.scenario;
  const scale = g.maxAbs > 0 ? g.maxAbs : 1;

  return (
    <Card
      title={t("scenTitle")}
      tier={t("tierB")}
      tierWhy={t("tierBWhy")}
      lead={t("scenLead")}
      wide
    >
      <div style={SCEN_SCROLL}>
        <table style={{ ...TABLE, minWidth: 420 }}>
          <thead>
            <tr>
              <th style={{ ...TH, whiteSpace: "nowrap" }}>
                {t("scenAxisVol")} \ {t("scenAxisSpot")}
              </th>
              {g.dsPct.map((ds) => (
                <th key={ds} style={{ ...TH, textAlign: "right" }}>
                  {ds > 0 ? `+${ds}` : ds}%
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {g.dVolPts.map((dv, i) => (
              <tr key={dv}>
                <th scope="row" style={{ ...TD, color: "var(--text-2)", whiteSpace: "nowrap" }}>
                  {dv > 0 ? `+${dv}` : dv} {t("scenVolUnit")}
                </th>
                {g.cells[i].map((v, j) => {
                  const a = Math.min(1, Math.abs(v) / scale);
                  const tone = v > 0 ? "var(--flow-buy)" : v < 0 ? "var(--flow-sell)" : "transparent";
                  return (
                    <td
                      key={g.dsPct[j]}
                      style={{
                        ...TD,
                        textAlign: "right",
                        // 0.30 ceiling keeps numerals legible over the tint at full scale.
                        background: v === 0 ? "transparent" : `color-mix(in srgb, ${tone} ${(a * 30).toFixed(1)}%, transparent)`,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {fmtMn(v)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={ROW}>
        <div style={STAT}>
          <span style={STAT_LBL}>
            <Tip label={t("scenCharmWhy")} side="top" size="card">
              <span tabIndex={0} style={HINT}>{t("scenCharm")}</span>
            </Tip>
          </span>
          <span
            style={{
              ...STAT_VAL,
              color:
                g.charmPerDayMn == null
                  ? "var(--text)"
                  : g.charmPerDayMn > 0
                    ? "var(--flow-buy)"
                    : g.charmPerDayMn < 0
                      ? "var(--flow-sell)"
                      : "var(--text)",
            }}
          >
            {g.charmPerDayMn == null ? "—" : fmtMn(g.charmPerDayMn)}
          </span>
        </div>
        <Stat label={t("scenUnit")} value={`± ${fmtMnMag(g.maxAbs)}`} />
      </div>

      <p style={FOOT}>{t("scenLegend")}</p>
      {!g.hasVanna && <p style={FOOT}>{t("scenNoVanna")}</p>}
      {!g.hasCharm && <p style={FOOT}>{t("scenNoCharm")}</p>}
      <p style={FOOT}>{t("scenDisclose")}</p>
    </Card>
  );
}

// ─── Module D — levels in expected-move units (Tier A) ───────────────────────────────

const LEVEL_LABEL: Record<string, MscKey> = {
  call_wall: "lvlCallWall",
  put_wall: "lvlPutWall",
  flip: "lvlFlip",
  abs_gamma: "lvlAbsGamma",
  max_pain: "lvlMaxPain",
  magnet: "lvlMagnet",
};

function EmCard({
  ms,
  t,
  levels,
  archived,
}: {
  ms: MarketStructure;
  t: T;
  levels: MarketStructure["em"]["levels"];
  archived: boolean;
}) {
  const em = ms.em;
  return (
    <Card title={t("emTitle")} tier={t("tierA")} tierWhy={t("tierAWhy")} lead={t("emLead")}>
      {!levels.length ? (
        <p style={FOOT}>{t("emNone")}</p>
      ) : (
        <table style={TABLE}>
          <thead>
            <tr>
              <th style={TH}>{t("emColLevel")}</th>
              <th style={{ ...TH, textAlign: "right" }}>{t("emColPrice")}</th>
              <th style={{ ...TH, textAlign: "right" }}>{t("emColDist")}</th>
              <th style={{ ...TH, textAlign: "right" }}>{t("emColEm")}</th>
            </tr>
          </thead>
          <tbody>
            {levels.map((l) => {
              const key = LEVEL_LABEL[l.key];
              return (
                <tr key={l.key}>
                  <td style={TD}>{key ? t(key) : l.key}</td>
                  <td style={{ ...TD, textAlign: "right" }}>{price(l.price)}</td>
                  <td style={{ ...TD, textAlign: "right", color: "var(--text-2)" }}>
                    {pct(l.distPct)}
                  </td>
                  <td style={{ ...TD, textAlign: "right" }}>
                    {l.distEm == null ? (
                      "—"
                    ) : (
                      <>
                        <span style={{ fontVariantNumeric: "tabular-nums" }}>
                          {num(l.distEm, 2)}
                        </span>
                        <span
                          style={{
                            ...EM_CHIP,
                            color: l.reachable ? "var(--text-2)" : "var(--text-dim)",
                          }}
                        >
                          {l.reachable ? t("emReachable") : t("emFar")}
                        </span>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {em.emPct1sig == null ? (
        <p style={FOOT}>{t(archived ? "emArchived" : "emNoBand")}</p>
      ) : (
        <>
          <p style={FOOT}>
            {t("emOneSigma")} {pct(em.emPct1sig, 2)}
            {em.horizonDays != null
              ? ` · ${t("emHorizon").replace("{d}", String(em.horizonDays))}`
              : ""}
          </p>
          {em.containedRate != null && em.nSessions != null && (
            <p style={FOOT}>
              {t("emCalib")
                .replace("{pct}", `${(em.containedRate * 100).toFixed(1)}%`)
                .replace("{n}", em.nSessions.toLocaleString())}
              {em.ci
                ? ` ${t("emCalibCi")
                    .replace("{lo}", `${(em.ci[0] * 100).toFixed(1)}%`)
                    .replace("{hi}", `${(em.ci[1] * 100).toFixed(1)}%`)}`
                : ""}
            </p>
          )}
        </>
      )}
    </Card>
  );
}

// ─── Module E — front expiry & the book after it (Tier A) ────────────────────────────

function ExpiryCard({ ms, t }: { ms: MarketStructure; t: T }) {
  const e = ms.expiry;
  if (!e.nExp) {
    return (
      <Card title={t("expTitle")} tier={t("tierA")} tierWhy={t("tierAWhy")}>
        <p style={FOOT}>{t("expNone")}</p>
      </Card>
    );
  }
  return (
    <Card title={t("expTitle")} tier={t("tierA")} tierWhy={t("tierAWhy")} lead={t("expLead")}>
      <div style={ROW}>
        <Stat label={t("expNext")} value={e.nextExp ?? "—"} />
        <div style={STAT}>
          <span style={STAT_LBL}>{t("expGammaShare")}</span>
          <span
            style={{ ...STAT_VAL, color: e.concentrated ? "var(--warn)" : "var(--text)" }}
          >
            {pct(e.gammaSharePct)}
          </span>
        </div>
        {e.deltaSharePct != null && (
          <Stat label={t("expDeltaShare")} value={pct(e.deltaSharePct)} />
        )}
      </div>

      <div style={ROW}>
        <Stat label={t("expCurrent")} value={fmtMn(e.currentNetMn)} />
        <Stat
          label={t("expAfter")}
          value={e.postExpiryNetMn == null ? "—" : fmtMn(e.postExpiryNetMn)}
          tone={e.signFlipsOnExpiry ? "var(--warn)" : undefined}
        />
      </div>

      {e.concentrated && (
        <Tip label={t("expConcentratedWhy")} side="top" size="card">
          <p style={{ ...FOOT, color: "var(--warn)" }} tabIndex={0}>
            {t("expConcentrated")}
          </p>
        </Tip>
      )}
      {e.signFlipsOnExpiry && (
        <Tip label={t("expSignFlipWhy")} side="top" size="card">
          <p style={{ ...FOOT, color: "var(--warn)" }} tabIndex={0}>
            {t("expSignFlip")}
          </p>
        </Tip>
      )}
      {e.postExpiryNetMn == null && <p style={FOOT}>{t("expNoAfter")}</p>}
    </Card>
  );
}

// ─── Styles (v5 tokens only) ─────────────────────────────────────────────────────────

const BODY: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const EMPTY: React.CSSProperties = {
  padding: "28px 12px",
  textAlign: "center",
  fontSize: 12,
  color: "var(--muted)",
};

const GRID: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(248px, 1fr))",
  gap: 8,
};

const CARD: React.CSSProperties = {
  background: "var(--panel-2)",
  border: "1px solid var(--line)",
  borderRadius: "var(--r-tile)",
  padding: "9px 10px 10px",
  minWidth: 0,
};

const CARD_HD: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  marginBottom: 5,
};

const TIER_CHIP: React.CSSProperties = {
  fontSize: "var(--fs-micro)",
  letterSpacing: ".04em",
  textTransform: "uppercase",
  color: "var(--text-dim)",
  border: "1px solid var(--line-2)",
  borderRadius: 999,
  padding: "1px 6px",
  whiteSpace: "nowrap",
  cursor: "help",
};

const LEAD: React.CSSProperties = {
  margin: "0 0 8px",
  fontSize: 11,
  lineHeight: 1.45,
  color: "var(--muted)",
};

const ROW: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 14,
  marginBottom: 8,
};

const STAT: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 1, minWidth: 0 };

const STAT_LBL: React.CSSProperties = {
  fontSize: "var(--fs-micro)",
  letterSpacing: ".04em",
  textTransform: "uppercase",
  color: "var(--text-dim)",
  whiteSpace: "nowrap",
};

const STAT_VAL: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  color: "var(--text)",
  fontVariantNumeric: "tabular-nums",
};

const HINT: React.CSSProperties = {
  borderBottom: "1px dotted var(--line-3)",
  cursor: "help",
};

const SUB_LBL: React.CSSProperties = {
  fontSize: "var(--fs-micro)",
  letterSpacing: ".04em",
  textTransform: "uppercase",
  color: "var(--text-dim)",
  margin: "2px 0 3px",
};

const TABLE: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 11,
};

const TH: React.CSSProperties = {
  textAlign: "left",
  fontWeight: 500,
  fontSize: "var(--fs-micro)",
  letterSpacing: ".04em",
  textTransform: "uppercase",
  color: "var(--text-dim)",
  padding: "3px 5px",
  borderBottom: "1px solid var(--line)",
};

const TD: React.CSSProperties = {
  padding: "3px 5px",
  color: "var(--text)",
  borderBottom: "1px solid var(--hairline)",
  fontVariantNumeric: "tabular-nums",
};

const BAR_WRAP: React.CSSProperties = {
  display: "inline-block",
  width: 42,
  height: 4,
  marginRight: 6,
  background: "var(--inset)",
  borderRadius: 2,
  overflow: "hidden",
  verticalAlign: "middle",
};

const BAR: React.CSSProperties = {
  display: "block",
  height: "100%",
  background: "var(--text-dim)",
};

const SCEN_SCROLL: React.CSSProperties = { overflowX: "auto", marginBottom: 8 };

const TRACK_WRAP: React.CSSProperties = { margin: "2px 0 8px" };

const TRACK: React.CSSProperties = {
  position: "relative",
  height: 6,
  background: "var(--inset)",
  border: "1px solid var(--line)",
  borderRadius: 3,
};

const TRACK_TICK: React.CSSProperties = {
  position: "absolute",
  top: -2,
  width: 1,
  height: 10,
  background: "var(--line-2)",
};

const TRACK_CRIT: React.CSSProperties = {
  position: "absolute",
  top: -3,
  width: 2,
  height: 12,
  borderRadius: 1,
  transform: "translateX(-1px)",
};

const TRACK_HERE: React.CSSProperties = {
  position: "absolute",
  top: -4,
  width: 2,
  height: 14,
  borderRadius: 1,
  background: "var(--brand-2)",
  transform: "translateX(-2px)",
};

const TRACK_AXIS: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 6,
  marginTop: 4,
  fontSize: "var(--fs-micro)",
  color: "var(--text-dim)",
};

const CURVE_LIST: React.CSSProperties = {
  display: "flex",
  listStyle: "none",
  margin: "0 0 8px",
  padding: 0,
  gap: 10,
  flexWrap: "wrap",
};

const CURVE_ROW: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 1 };

const CURVE_W: React.CSSProperties = {
  fontSize: "var(--fs-micro)",
  color: "var(--text-dim)",
  fontVariantNumeric: "tabular-nums",
};

const CURVE_V: React.CSSProperties = { fontSize: 11, fontVariantNumeric: "tabular-nums" };

const EM_CHIP: React.CSSProperties = {
  marginLeft: 5,
  fontSize: "var(--fs-micro)",
  letterSpacing: ".03em",
};

const NOTE: React.CSSProperties = { marginBottom: 2 };

const FOOT: React.CSSProperties = {
  margin: "0 0 4px",
  fontSize: 10,
  lineHeight: 1.5,
  color: "var(--muted)",
};
