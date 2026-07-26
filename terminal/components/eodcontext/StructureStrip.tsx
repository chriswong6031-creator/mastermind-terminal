"use client";
/**
 * StructureStrip — the settled-close structure belt (OEU T-E).
 *
 * WHY IT EXISTS
 *   The Terminal's options suite is live; the macro estate settles options structure at the
 *   close and publishes it nightly. Before this lane the two never appeared together, so a
 *   reader had to leave the desk to learn where the close left the walls. This strip brings
 *   that context in — and, because mixing cadences is exactly how a surface starts lying,
 *   it wears its vintage on every single value rather than once in a footer.
 *
 * WHAT IT IS NOT
 *   Not a second summary bar. GexSummaryBar reads the LADDER payload and re-scopes with the
 *   expiry lens; this strip reads the STRUCTURE SNAPSHOT (gex_state) plus the expected-move
 *   band and the IV percentile, none of which the ladder carries. The two stores can be a
 *   session apart — when they are, the per-cell stamps say so instead of hiding it.
 *
 * HONESTY DOCTRINE
 *   - Every value stamped with its OWN source store's session date. Never the wall clock.
 *   - A cell with no value prints "not published", never a zero and never a borrowed number.
 *   - When gex_state can't answer and the ladder payload can, the cell discloses the
 *     fallback on hover — a silent fallback across two sessions is a lie by omission.
 *   - No forecast language. Walls, flip and max pain are descriptive levels; the expected
 *     move is a priced band, not a target.
 */

import React from "react";
import { makeEodT } from "./eodStrings";
import type { EodKey } from "./eodStrings";
import { Tip } from "@/components/ui/Tip";
import type { Lang } from "@/lib/i18n";
import {
  buildStructureCells,
  fmtEodDay,
  structureIsEmpty,
  type StructureCell,
  type StructureCellKey,
  type StructureGex,
  type StructureGexState,
  type MovesPayload,
  type OiConfPayload,
  type OiConfRow,
  type VolPayload,
} from "@/lib/eodContext";

interface StructureStripProps {
  root: string;
  gexState: StructureGexState | null;
  gex: StructureGex | null;
  moves: MovesPayload | null;
  vol: VolPayload | null;
  oiConf: OiConfPayload | OiConfRow[] | null;
  lang: Lang;
}

const LABEL_KEY: Record<StructureCellKey, EodKey> = {
  callWall: "cellCallWall",
  putWall: "cellPutWall",
  flip: "cellFlip",
  expMove: "cellExpMove",
  maxPain: "cellMaxPain",
  ivPct: "cellIvPct",
  oiConf: "cellOiConf",
};

const TIP_KEY: Record<StructureCellKey, EodKey> = {
  callWall: "tipCallWall",
  putWall: "tipPutWall",
  flip: "tipFlip",
  expMove: "tipExpMove",
  maxPain: "tipMaxPain",
  ivPct: "tipIvPct",
  oiConf: "tipOiConf",
};

/**
 * Cell tones. Walls and flip match GexSummaryBar's palette digit-for-digit so the two
 * belts read as one system. Every directional tone is a TOKEN (--up/--down), so the
 * zh 红涨绿跌 convention flips by theme rather than by hardcoded colour.
 */
const TONE: Partial<Record<StructureCellKey, string>> = {
  callWall: "var(--brand-2)",
  putWall: "var(--down)",
  flip: "var(--cat-2)",
  expMove: "var(--signal)",
};

export function StructureStrip({
  root, gexState, gex, moves, vol, oiConf, lang,
}: StructureStripProps) {
  const t = makeEodT(lang);
  const cells = buildStructureCells({ gexState, gex, moves, vol, oiConf, root });
  const empty = structureIsEmpty(cells);

  return (
    <section style={OUTER} aria-label={t("beltAria")}>
      <div style={ID_COL}>
        <span style={ID_TITLE}>{t("beltTitle")}</span>
        {/* Cadence boundary, stated in chrome — the #205 "not replayed" tag idiom. */}
        <span style={ID_TAG}>
          <span style={ID_DOT} aria-hidden />
          {t("beltTag")}
        </span>
      </div>

      {empty ? (
        <p style={EMPTY_NOTE}>{t("beltEmpty")}</p>
      ) : (
        <div style={CELLS}>
          {cells.map((c) => (
            <Cell key={c.key} cell={c} lang={lang} />
          ))}
        </div>
      )}
    </section>
  );
}

function Cell({ cell, lang }: { cell: StructureCell; lang: Lang }) {
  const t = makeEodT(lang);
  const day = fmtEodDay(cell.vintage, lang);
  const stamp = day
    ? t("eodStamp").replace("{d}", day)
    : cell.value !== null
      ? t("eodStampNone")
      : null;

  // Tier-2 hover: what the number means, plus the fallback disclosure when the structure
  // snapshot could not answer and the ladder payload did.
  const tipText =
    t(TIP_KEY[cell.key]) +
    (cell.source === "gex" ? ` — ${t("srcFallback")}.` : "");

  return (
    <Tip label={tipText} size="card">
      <div style={CELL} tabIndex={0}>
        <span style={CELL_LABEL}>{t(LABEL_KEY[cell.key])}</span>
        <span
          style={{
            ...CELL_VALUE,
            color: cell.value === null ? "var(--muted)" : (TONE[cell.key] ?? "var(--text)"),
          }}
        >
          {cell.value ?? t("cellAbsent")}
          {cell.value !== null && cell.detail && (
            <span style={CELL_DETAIL}>{cell.detail}</span>
          )}
        </span>
        {/* The vintage stamp is not decoration: it is what makes a settled number honest
            beside a live one, and the stores it comes from do not always agree. */}
        <span style={CELL_STAMP}>
          {cell.value === null ? t("cellAbsentNote") : stamp}
        </span>
      </div>
    </Tip>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const OUTER: React.CSSProperties = {
  display: "flex",
  alignItems: "stretch",
  flex: "1 1 520px",
  minWidth: 0,
  gap: 0,
};

const ID_COL: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  gap: 4,
  padding: "7px 14px 7px 14px",
  borderRight: "1px solid var(--line-2)",
  flexShrink: 0,
};

const ID_TITLE: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.09em",
  textTransform: "uppercase",
  color: "var(--text-2)",
  whiteSpace: "nowrap",
};

const ID_TAG: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  fontSize: 9.5,
  fontWeight: 600,
  letterSpacing: "0.03em",
  color: "var(--muted)",
  padding: "1px 7px",
  border: "1px dashed var(--line)",
  borderRadius: 5,
  whiteSpace: "nowrap",
};

const ID_DOT: React.CSSProperties = {
  width: 5,
  height: 5,
  borderRadius: "50%",
  background: "var(--signal)",
  flexShrink: 0,
};

const CELLS: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  flex: 1,
  minWidth: 0,
};

const CELL: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
  padding: "7px 13px",
  borderRight: "1px solid var(--line-2)",
  /* Grow to share the belt evenly rather than leaving a dead gutter before the Dark Pool
     panel; the floor keeps a cell readable when the row wraps on a narrow viewport. */
  flex: "1 1 auto",
  minWidth: 104,
  outline: "none",
};

const CELL_LABEL: React.CSSProperties = {
  fontSize: 9.5,
  color: "var(--muted)",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  fontWeight: 600,
  whiteSpace: "nowrap",
};

const CELL_VALUE: React.CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  gap: 5,
  fontSize: 13,
  fontWeight: 700,
  fontVariantNumeric: "tabular-nums",
  letterSpacing: "0.01em",
  lineHeight: 1.15,
};

const CELL_DETAIL: React.CSSProperties = {
  fontSize: 9.5,
  fontWeight: 600,
  color: "var(--text-dim)",
  whiteSpace: "nowrap",
};

const CELL_STAMP: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 600,
  letterSpacing: "0.03em",
  color: "var(--text-dim)",
  whiteSpace: "nowrap",
};

const EMPTY_NOTE: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  flex: 1,
  margin: 0,
  padding: "9px 14px",
  fontSize: 11,
  lineHeight: 1.5,
  color: "var(--muted)",
};
