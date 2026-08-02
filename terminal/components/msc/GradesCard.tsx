"use client";
/**
 * GradesCard — the LIVE Level Report Card (Market Structure Core R2.4 v1).
 *
 * The category's trust engines are static marketing artifacts (SpotGamma's 2018–24
 * hit-rate study); ours is recomputed nightly by the grading lane and published with
 * its null. The FIRST live run is the reason this card exists in exactly this shape:
 * across 15,490 graded single-name boards, no level role beat the coin-flip null under
 * the close-side hold test (call wall 49.0% [47.1–50.9], n=2,599). The card therefore
 * leads with the measured rate AND the verdict against the null — and when nothing
 * beats it, it says so plainly. That IS the differentiator: a grade you can audit.
 *
 * COVERAGE HONESTY: the grading lane covers single names. For an uncovered root
 * (SPY/SPX/QQQ today) the card shows the cross-universe aggregate, explicitly labelled
 * as universe context — never dressed as the root's own record.
 *
 * No support/resistance vocabulary anywhere — "held" is defined in the ⓘ and is a
 * measured frequency, not a recommendation.
 */

import React from "react";
import { makeMscT, type MscKey } from "./mscStrings";
import { MscCard, CardFoot, CardSpacer } from "./MscCard";
import type { Lang } from "@/lib/i18n";

export interface GradeRole {
  nodes?: number;
  touched?: number;
  scored?: number;
  held?: number;
  p_hold?: number | null;
  ci95?: [number, number] | null;
  beats_null?: boolean | null;
}

export interface GradesPayload {
  schema?: string;
  root?: string;
  asof?: string | null;
  window?: { since?: string | null; until?: string | null; sessions?: number | null } | null;
  boards?: { n?: number; wall_contained_rate?: number | null; band_contained_rate?: number | null } | null;
  roles?: Record<string, GradeRole> | null;
  flip?: { touched?: number; mean_abs_post_move_pct?: number | null } | null;
  coverage_note?: string | null;
}

const ROLE_ORDER: { key: string; labelKey: MscKey }[] = [
  { key: "call_wall", labelKey: "lvlCallWall" },
  { key: "put_wall", labelKey: "lvlPutWall" },
  { key: "anchor", labelKey: "gcAnchor" },
  { key: "cluster", labelKey: "gcCluster" },
  { key: "counter", labelKey: "gcCounter" },
  { key: "trapdoor", labelKey: "gcTrapdoor" },
  { key: "launchpad", labelKey: "gcLaunchpad" },
];

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const pct1 = (v: number | null | undefined) =>
  isNum(v) ? `${(v * 100).toFixed(1)}%` : "—";

export function GradesCard({
  rootGrades,
  universeGrades,
  root,
  lang,
}: {
  /** The committed root's own card, when the grading lane covers it. */
  rootGrades: GradesPayload | null;
  /** The cross-universe aggregate — context for uncovered roots. */
  universeGrades: GradesPayload | null;
  root: string;
  lang: Lang;
}) {
  const t = makeMscT(lang);
  const own = rootGrades && rootGrades.roles && Object.keys(rootGrades.roles).length > 0;
  const g = own ? rootGrades : universeGrades;
  if (!g || !g.roles || Object.keys(g.roles).length === 0) return null;

  const rows = ROLE_ORDER.filter((r) => g.roles?.[r.key]?.scored);
  const anyBeats = rows.some((r) => g.roles?.[r.key]?.beats_null === true);
  const boards = g.boards ?? {};
  const win = g.window ?? {};

  return (
    <MscCard
      title={own ? t("gcTitle").replace("{sym}", root) : t("gcTitleUniverse")}
      info={`${t("gcLead")} ${t("gcNull")}`}
      tier={t("tierMeasured")}
      tierWhy={t("gcTierWhy")}
      headRight={
        <span style={SCOPE_CHIP}>
          {own
            ? t("gcScopeRoot").replace("{n}", String(boards.n ?? "—"))
            : t("gcScopeUniverse").replace("{n}", String(boards.n ?? "—"))}
        </span>
      }
      span={12}
    >
      {!own && (
        <p style={COVERAGE}>
          {t("gcUncovered").replace("{sym}", root)}
        </p>
      )}

      <div style={SPLIT}>
        <div style={{ flex: "1 1 460px", minWidth: 320 }}>
          <table style={TABLE}>
            <thead>
              <tr>
                <th style={TH}>{t("gcColRole")}</th>
                <th style={{ ...TH, textAlign: "right" }}>{t("gcColTouches")}</th>
                <th style={{ ...TH, textAlign: "right" }}>{t("gcColHold")}</th>
                <th style={TH}>{t("gcColCi")}</th>
                <th style={TH}>{t("gcColNull")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const d = g.roles![r.key]!;
                const ci = Array.isArray(d.ci95) && d.ci95.length === 2 ? d.ci95 : null;
                const beats = d.beats_null === true;
                return (
                  <tr key={r.key}>
                    <td style={{ ...TD, whiteSpace: "nowrap" }}>{t(r.labelKey)}</td>
                    <td style={{ ...TD, textAlign: "right", color: "var(--text-2)" }}>
                      {d.scored ?? "—"}
                    </td>
                    <td style={{ ...TD, textAlign: "right", fontWeight: 600 }}>{pct1(d.p_hold)}</td>
                    <td style={TD}>
                      {/* CI whisker on a fixed 0–100% track with the null tick at 50 */}
                      <span style={CI_TRACK} aria-hidden>
                        <span style={CI_NULL_TICK} />
                        {ci && (
                          <span
                            style={{
                              ...CI_BAND,
                              left: `${(ci[0] * 100).toFixed(1)}%`,
                              width: `${Math.max(1.5, (ci[1] - ci[0]) * 100)}%`,
                              background: beats ? "var(--signal)" : "var(--text-dim)",
                            }}
                          />
                        )}
                      </span>
                      <span style={CI_TEXT}>
                        {ci ? `${(ci[0] * 100).toFixed(1)}–${(ci[1] * 100).toFixed(1)}%` : "—"}
                      </span>
                    </td>
                    <td style={{ ...TD, whiteSpace: "nowrap", color: beats ? "var(--signal)" : "var(--text-dim)" }}>
                      {beats ? t("gcBeats") : t("gcNoEdge")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div style={{ flex: "1 1 260px", minWidth: 220 }}>
          <div style={STAT_COL}>
            <Stat label={t("gcWallContained")} value={pct1(boards.wall_contained_rate)} />
            <Stat label={t("gcBandContained")} value={pct1(boards.band_contained_rate)} />
            <Stat
              label={t("gcFlipTouches")}
              value={
                g.flip?.touched != null
                  ? `${g.flip.touched}${isNum(g.flip?.mean_abs_post_move_pct) ? ` · ±${g.flip!.mean_abs_post_move_pct!.toFixed(2)}%` : ""}`
                  : "—"
              }
            />
            <Stat
              label={t("gcWindow")}
              value={
                win.since && win.until
                  ? `${String(win.since).slice(0, 10)} → ${String(win.until).slice(0, 10)}`
                  : "—"
              }
            />
          </div>
        </div>
      </div>

      <CardSpacer />
      <CardFoot>
        <span style={anyBeats ? undefined : { color: "var(--text-2)" }}>
          {anyBeats ? t("gcSomeBeat") : t("gcNoneBeat")}
        </span>
        {" · "}
        {t("gcRecomputed")}
      </CardFoot>
    </MscCard>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
      <span style={STAT_LBL}>{label}</span>
      <span style={STAT_VAL}>{value}</span>
    </div>
  );
}

// ─── styles (v5 tokens) ──────────────────────────────────────────────────────

const SPLIT: React.CSSProperties = {
  display: "flex", gap: 18, flexWrap: "wrap", alignItems: "flex-start", minWidth: 0,
};

const COVERAGE: React.CSSProperties = {
  margin: "0 0 8px", fontSize: 10.5, lineHeight: 1.45, color: "var(--warn)",
};

const SCOPE_CHIP: React.CSSProperties = {
  fontSize: "var(--fs-micro)", letterSpacing: ".04em", textTransform: "uppercase",
  color: "var(--text-dim)", border: "1px solid var(--line-2)", borderRadius: 999,
  padding: "1px 6px", whiteSpace: "nowrap",
};

const TABLE: React.CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: 11 };

const TH: React.CSSProperties = {
  textAlign: "left", fontWeight: 500, fontSize: "var(--fs-micro)", letterSpacing: ".04em",
  textTransform: "uppercase", color: "var(--text-dim)", padding: "3px 5px",
  borderBottom: "1px solid var(--line)", whiteSpace: "nowrap",
};

const TD: React.CSSProperties = {
  padding: "4px 5px", color: "var(--text)", borderBottom: "1px solid var(--hairline)",
  fontVariantNumeric: "tabular-nums",
};

const CI_TRACK: React.CSSProperties = {
  position: "relative", display: "inline-block", width: 96, height: 6,
  background: "var(--inset)", borderRadius: 3, verticalAlign: "middle",
  overflow: "hidden",
};

const CI_NULL_TICK: React.CSSProperties = {
  position: "absolute", left: "50%", top: 0, bottom: 0, width: 1,
  background: "var(--line-3)",
};

const CI_BAND: React.CSSProperties = {
  position: "absolute", top: 1, bottom: 1, borderRadius: 2, opacity: 0.9,
};

const CI_TEXT: React.CSSProperties = {
  marginLeft: 7, fontSize: 10, color: "var(--text-2)", fontVariantNumeric: "tabular-nums",
  whiteSpace: "nowrap",
};

const STAT_COL: React.CSSProperties = {
  display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
  gap: "10px 16px",
};

const STAT_LBL: React.CSSProperties = {
  fontSize: "var(--fs-micro)", letterSpacing: ".04em", textTransform: "uppercase",
  color: "var(--text-dim)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
};

const STAT_VAL: React.CSSProperties = {
  fontSize: 13, fontWeight: 600, color: "var(--text)", fontVariantNumeric: "tabular-nums",
};
