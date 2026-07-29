"use client";
/**
 * GeometryRail — the dossier's centerpiece: a vertical price LADDER.
 *
 * One price axis, levels docked as tinted cards on alternating sides, a gradient spine
 * running stop→target, and R-distance chips between consecutive levels.
 *
 * Ladder order is always stop-at-the-bottom, targets-at-the-top — for BEAR plans the
 * price axis is inverted so "up the ladder" always means "toward the target".
 *
 * HONESTY (D3 fix_spec 1):
 *   - Purely positional display — no forecast copy.
 *   - WIDE GEOMETRY guard: when R is a large fraction of entry, or T2 is a long stretch
 *     from it, the target cards de-emphasise (never hide) and a caption says the targets
 *     are projected from a structural base-low stop.
 *   - When the payload carries no last_price, the ladder says so instead of letting plan
 *     levels read as current prices.
 */

import { makeProphetT } from "./prophetStrings";
import type { Lang } from "@/lib/i18n";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GeometryPayload {
  /** R-multiples to stop (positive = above stop, negative = below) */
  dist_to_stop_r?: number | null;
  dist_to_t1_r?: number | null;
  horizon_pct_used?: number | null;
}

interface GeometryRailProps {
  direction: "BULL" | "BEAR";
  entry: number | null;
  stop: number | null;
  t1: number | null;
  t2?: number | null;
  last?: number | null;
  geometry?: GeometryPayload | null;
  lang: Lang;
}

// ── Wide-geometry guard ───────────────────────────────────────────────────────
//
// Thresholds are the D3 audit's: R wider than 12% of entry, or T2 stretched more than
// 35% from it, means the targets are 1.5R/3R projections off a structural base-low stop
// rather than anything the horizon can carry. Display-only — no payload change.

export const WIDE_R_PCT = 0.12;
export const WIDE_T2_STRETCH = 0.35;

export interface GeometryStretch {
  /** |entry − stop| in price terms */
  rAbs: number | null;
  /** R as a fraction of entry */
  rPct: number | null;
  /** |T2 − entry| as a fraction of entry */
  t2Stretch: number | null;
  /** true when either threshold trips */
  wide: boolean;
}

/** Shared by the ladder and the profit-taking table so one plan gets one verdict. */
export function geometryStretch(
  entry: number | null | undefined,
  stop: number | null | undefined,
  t2: number | null | undefined,
): GeometryStretch {
  const e = entry != null && entry > 0 ? entry : null;
  const rAbs = e != null && stop != null ? Math.abs(e - stop) : null;
  const rPct = e != null && rAbs != null ? rAbs / e : null;
  const t2Stretch = e != null && t2 != null ? Math.abs(t2 - e) / e : null;
  const wide =
    (rPct != null && rPct > WIDE_R_PCT) || (t2Stretch != null && t2Stretch > WIDE_T2_STRETCH);
  return { rAbs, rPct, t2Stretch, wide };
}

// ── Ladder geometry ───────────────────────────────────────────────────────────

type Side = "l" | "r";

interface LadderRow {
  key: string;
  label: string;
  price: number;
  color: string;
  side: Side;
  /** true position on the axis, 0 = bottom */
  truePct: number;
  /** display position after de-cluttering */
  pct: number;
  /** target rows dim under the wide-geometry guard */
  dim: boolean;
}

/**
 * Minimum vertical separation between two cards docked on the SAME side, in axis %.
 * A level card measures 38px and the track is 280px, so 16% (44.8px) is the first value
 * that cannot overlap. Keep these two constants in step with the ladder height in CSS.
 */
const MIN_GAP_PCT = 16;
/** A distance chip (14px) needs clear spine between two cards: 21% of 280px = 58.8px. */
const MIN_CHIP_GAP_PCT = 21;

/**
 * Push same-side cards apart so their labels never overlap. The dot on the spine keeps
 * the true position, so nudging a card never misstates where the level is.
 */
function declutter(rows: LadderRow[]): void {
  for (const side of ["l", "r"] as Side[]) {
    const lane = rows.filter((r) => r.side === side).sort((a, b) => a.pct - b.pct);
    for (let i = 1; i < lane.length; i++) {
      const prev = lane[i - 1];
      if (lane[i].pct - prev.pct < MIN_GAP_PCT) lane[i].pct = prev.pct + MIN_GAP_PCT;
    }
    const overflow = lane.length > 0 ? lane[lane.length - 1].pct - 100 : 0;
    if (overflow > 0) {
      for (const r of lane) r.pct = Math.max(0, r.pct - overflow);
      for (let i = 1; i < lane.length; i++) {
        const prev = lane[i - 1];
        if (lane[i].pct - prev.pct < MIN_GAP_PCT) lane[i].pct = prev.pct + MIN_GAP_PCT;
      }
    }
  }
}

// ── Component ──────────────────────────────────────────────────────────────────

export function GeometryRail({
  direction,
  entry,
  stop,
  t1,
  t2,
  last,
  geometry,
  lang,
}: GeometryRailProps) {
  const t = makeProphetT(lang);
  const isBear = direction === "BEAR";
  const stretch = geometryStretch(entry, stop, t2 ?? t1);

  // Sides are fixed by level so the eye learns one layout: risk on the left, the trade
  // and its targets on the right, targets stepping away from ENTRY.
  const raw: { key: string; label: string; price: number; color: string; side: Side; dim: boolean }[] = [];
  if (stop != null)  raw.push({ key: "stop",  label: t("stop"),  price: stop,  color: "var(--down)",   side: "l", dim: false });
  if (entry != null) raw.push({ key: "entry", label: t("entry"), price: entry, color: "var(--text-2)", side: "r", dim: false });
  if (last != null)  raw.push({ key: "last",  label: t("last"),  price: last,  color: "var(--obs-prophet-cyan)", side: "r", dim: false });
  if (t1 != null)    raw.push({ key: "t1",    label: t("t1"),    price: t1,    color: "var(--up)",     side: "l", dim: stretch.wide });
  if (t2 != null)    raw.push({ key: "t2",    label: t("t2"),    price: t2,    color: "color-mix(in srgb, var(--up) 70%, transparent)", side: "r", dim: stretch.wide });

  if (raw.length < 2) {
    return (
      <div className="obs-prophet-ladder-empty">
        <div className="obs-prophet-ladder-empty-t">{t("geometryEmpty")}</div>
        <div className="obs-prophet-ladder-empty-w">{t("geometryEmptyWhy")}</div>
      </div>
    );
  }

  const prices = raw.map((l) => l.price);
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const range = maxP - minP || 1;

  // Stop always sits at the bottom of the ladder: for BEAR the price axis inverts, so
  // "further up" reads as "further along the trade" in both directions.
  const positionPct = (price: number): number => {
    const rawPct = ((price - minP) / range) * 100;
    return isBear ? 100 - rawPct : rawPct;
  };

  const rows: LadderRow[] = raw.map((l) => {
    const p = positionPct(l.price);
    return { ...l, truePct: p, pct: p };
  });
  declutter(rows);

  const byPos = [...rows].sort((a, b) => a.pct - b.pct);

  // Distance chips: the gap between two neighbouring levels, in R units.
  const chips =
    stretch.rAbs != null && stretch.rAbs > 0
      ? byPos.slice(0, -1).flatMap((lo, i) => {
          const hi = byPos[i + 1];
          if (hi.pct - lo.pct < MIN_CHIP_GAP_PCT) return [];
          const r = Math.abs(hi.price - lo.price) / stretch.rAbs!;
          if (!Number.isFinite(r) || r < 0.05) return [];
          return [{ key: `${lo.key}-${hi.key}`, pct: (lo.pct + hi.pct) / 2, r }];
        })
      : [];

  const distStop = geometry?.dist_to_stop_r ?? null;
  const distT1 = geometry?.dist_to_t1_r ?? null;

  const wideBody = t("wideGeomBody")
    .replace("{r}", stretch.rAbs != null ? `$${stretch.rAbs.toFixed(2)}` : "—")
    .replace("{pct}", stretch.rPct != null ? (stretch.rPct * 100).toFixed(0) : "—");

  return (
    <div className="obs-prophet-ladder-wrap">
      <div className="obs-prophet-ladder" role="img" aria-label={ladderAria(byPos, t("geometryTitle"))}>
        <div className="obs-prophet-ladder-track">
          <div className="obs-prophet-ladder-spine" aria-hidden />

          {chips.map((c) => (
            <span key={c.key} className="obs-prophet-ladder-gap num" style={{ bottom: `${c.pct}%` }}>
              +{c.r.toFixed(2)}{t("rUnit")}
            </span>
          ))}

          {rows.map((r) => (
            <span
              key={`dot-${r.key}`}
              className="obs-prophet-ladder-dot"
              style={{ bottom: `${r.truePct}%`, "--c": r.color } as React.CSSProperties}
              aria-hidden
            />
          ))}

          {rows.map((r) => (
            <div
              key={r.key}
              className={`obs-prophet-lvl ${r.side === "l" ? "on-l" : "on-r"}${r.dim ? " dim" : ""}`}
              style={{ bottom: `${r.pct}%`, "--c": r.color } as React.CSSProperties}
            >
              <span className="obs-prophet-lvl-k">{r.label}</span>
              <span className="obs-prophet-lvl-v num">${r.price.toFixed(2)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Live R-distances — nested-shape payloads only; silent when absent. */}
      {(distStop != null || distT1 != null) && (
        <div className="obs-prophet-ladder-live">
          {distStop != null && (
            <span>
              <i>{t("stop")}</i>
              <b className="num">{distStop.toFixed(2)}{t("rUnit")}</b>
              <i>{t("distAway")}</i>
            </span>
          )}
          {distT1 != null && (
            <span>
              <i>{t("t1")}</i>
              <b className="num">{distT1.toFixed(2)}{t("rUnit")}</b>
              <i>{t("distAway")}</i>
            </span>
          )}
        </div>
      )}

      {stretch.wide && (
        <div className="obs-prophet-guard">
          <span className="fin-tag" style={{ "--c": "var(--warn)" } as React.CSSProperties}>
            {t("wideGeomTag")}
          </span>
          <p>{wideBody}</p>
        </div>
      )}

      <div className="fin-asof obs-prophet-ladder-asof">
        {last == null ? t("noLastNote") : t("ladderCaption")}
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** One spoken line for the whole ladder — screen readers get the levels, not the pixels. */
function ladderAria(rows: LadderRow[], title: string): string {
  const parts = rows.map((r) => `${r.label} ${r.price.toFixed(2)}`);
  return `${title}: ${parts.join(", ")}`;
}
