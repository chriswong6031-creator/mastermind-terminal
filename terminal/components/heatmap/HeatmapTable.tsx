"use client";
/**
 * HeatmapTable.tsx — sortable tabular equivalent to the treemap.
 *
 * HONESTY DOCTRINE:
 *   - Net premium is magnitude only — not labeled directional.
 *   - Call share shown as ΔOI-derived doiPc, labeled "(~soft)".
 *   - Divergence: shown only when both sides exceed dead-zones AND disagree.
 *   - No "validated", predictive, or buy/sell copy.
 */

import React, { useMemo, useState } from "react";
import { makeHeatmapT } from "@/lib/heatmapStrings";
import { SECTOR_LABEL } from "./sectorMap";
import type { HeatmapTile, Layer } from "./types";

type SortKey = "ticker" | "chg1d" | "price" | "netPremiumMn" | "doiPc" | "tone" | "divergent";
type SortDir = "asc" | "desc";

interface HeatmapTableProps {
  tiles: HeatmapTile[];
  layer: Layer;
  selectedTicker: string | null;
  onSelect: (tile: HeatmapTile) => void;
  lang: "en" | "zh";
}

export function HeatmapTable({ tiles, layer, selectedTicker, onSelect, lang }: HeatmapTableProps) {
  const t = makeHeatmapT(lang);
  const zh = lang === "zh";

  const [sortKey, setSortKey] = useState<SortKey>(
    layer === "flow" ? "netPremiumMn" : "chg1d"
  );
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const sorted = useMemo(() => {
    return [...tiles].sort((a, b) => {
      let av: number | string = 0;
      let bv: number | string = 0;
      switch (sortKey) {
        case "ticker": av = a.ticker; bv = b.ticker; break;
        case "chg1d": av = a.chg1d; bv = b.chg1d; break;
        case "price": av = a.price; bv = b.price; break;
        case "netPremiumMn": av = a.netPremiumMn ?? -Infinity; bv = b.netPremiumMn ?? -Infinity; break;
        case "doiPc": av = a.doiPc ?? -Infinity; bv = b.doiPc ?? -Infinity; break;
        case "tone": {
          const toneOrder = { pos: 2, neutral: 1, neg: 0 } as Record<string, number>;
          av = toneOrder[a.tone ?? "neutral"] ?? 1;
          bv = toneOrder[b.tone ?? "neutral"] ?? 1;
          break;
        }
        case "divergent": {
          av = isDivergent(a) ? 1 : 0;
          bv = isDivergent(b) ? 1 : 0;
          break;
        }
      }
      if (typeof av === "string" && typeof bv === "string") {
        const cmp = av.localeCompare(bv);
        return sortDir === "asc" ? cmp : -cmp;
      }
      const cmp = (av as number) - (bv as number);
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [tiles, sortKey, sortDir]);

  function Th({ colKey, label }: { colKey: SortKey; label: string }) {
    const active = sortKey === colKey;
    return (
      <th
        onClick={() => handleSort(colKey)}
        style={{
          ...TH_STYLE,
          color: active ? "var(--text)" : "var(--muted)",
          cursor: "pointer",
        }}
      >
        {label}
        {active && <span style={{ marginLeft: 3 }}>{sortDir === "asc" ? "▲" : "▼"}</span>}
      </th>
    );
  }

  return (
    <div style={TABLE_WRAP}>
      {/* Data note */}
      <div style={DATA_NOTE_BAR}>
        <span>{t("dataNote")}</span>
        {layer === "flow" && (
          <span style={{ marginLeft: 10 }}>{t("flowDirSoft")}</span>
        )}
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={TABLE_STYLE}>
          <thead>
            <tr>
              <Th colKey="ticker" label={t("colTicker")} />
              <th style={TH_STYLE}>{t("colName")}</th>
              <th style={TH_STYLE}>{t("colSector")}</th>
              <Th colKey="price" label={t("colPrice")} />
              <Th colKey="chg1d" label={t("colChg")} />
              {layer === "flow" && (
                <>
                  <Th colKey="netPremiumMn" label={t("colPremium")} />
                  <Th colKey="doiPc" label={`${t("colDoi")} (~soft)`} />
                  <Th colKey="tone" label={t("colTone")} />
                  <Th colKey="divergent" label={t("colDivergence")} />
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {sorted.map(tile => (
              <TableRow
                key={tile.ticker}
                tile={tile}
                layer={layer}
                isSelected={selectedTicker === tile.ticker}
                onClick={onSelect}
                zh={zh}
              />
            ))}
          </tbody>
        </table>
      </div>

      {sorted.length === 0 && (
        <div style={{ padding: "24px", textAlign: "center", color: "var(--muted)", fontSize: 12 }}>
          {t("noData")}
        </div>
      )}

      <div style={TABLE_FOOTER}>
        {t("displayOnly")}
      </div>
    </div>
  );
}

// ─── TableRow ─────────────────────────────────────────────────────────────────

function isDivergent(tile: HeatmapTile): boolean {
  if (!tile.hasFlow || !tile.tone || tile.tone === "neutral") return false;
  const priceUp = tile.chg1d > 0.05;
  const priceDn = tile.chg1d < -0.05;
  const tonePos = tile.tone === "pos";
  const toneNeg = tile.tone === "neg";
  return (priceUp && toneNeg) || (priceDn && tonePos);
}

interface TableRowProps {
  tile: HeatmapTile;
  layer: Layer;
  isSelected: boolean;
  onClick: (tile: HeatmapTile) => void;
  zh: boolean;
}

function TableRow({ tile, layer, isSelected, onClick, zh }: TableRowProps) {
  const chgColor = tile.chg1d >= 0 ? "var(--up)" : "var(--down)";
  const chgStr = `${tile.chg1d >= 0 ? "+" : ""}${tile.chg1d.toFixed(2)}%`;
  const sectorLabel = SECTOR_LABEL[tile.sector] ?? tile.sector;
  const div = layer === "flow" ? isDivergent(tile) : false;

  const toneLabel = tile.tone === "pos" ? (zh ? "积极" : "pos")
    : tile.tone === "neg" ? (zh ? "消极" : "neg")
    : (zh ? "中性" : "neutral");
  const toneColor = tile.tone === "pos" ? "var(--up)"
    : tile.tone === "neg" ? "var(--down)"
    : "var(--muted)";

  return (
    <tr
      onClick={() => onClick(tile)}
      style={{
        ...ROW_STYLE,
        background: isSelected ? "var(--panel-2)" : undefined,
        cursor: "pointer",
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = "var(--panel-2)"; }}
      onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = isSelected ? "var(--panel-2)" : ""; }}
    >
      <td style={{ ...TD_STYLE, fontWeight: 700 }}>{tile.ticker}</td>
      <td style={{ ...TD_STYLE, color: "var(--text-2)", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {tile.name}
      </td>
      <td style={{ ...TD_STYLE, color: "var(--muted)", fontSize: 10 }}>{sectorLabel}</td>
      <td style={{ ...TD_STYLE, fontVariantNumeric: "tabular-nums" }}>${tile.price.toFixed(2)}</td>
      <td style={{ ...TD_STYLE, color: chgColor, fontVariantNumeric: "tabular-nums" }}>{chgStr}</td>
      {layer === "flow" && (
        <>
          <td style={{ ...TD_STYLE, fontVariantNumeric: "tabular-nums" }}>
            {tile.hasFlow && tile.netPremiumMn != null ? `$${tile.netPremiumMn.toFixed(1)}M` : "—"}
          </td>
          <td style={{ ...TD_STYLE, fontVariantNumeric: "tabular-nums", color: "var(--text-2)" }}>
            {tile.hasFlow && tile.doiPc != null ? tile.doiPc.toFixed(2) : "—"}
          </td>
          <td style={{ ...TD_STYLE, color: toneColor }}>
            {tile.hasFlow ? toneLabel : "—"}
          </td>
          <td style={TD_STYLE}>
            {div ? <span style={DIV_BADGE}>DIV</span> : <span style={{ color: "var(--muted)" }}>—</span>}
          </td>
        </>
      )}
    </tr>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const TABLE_WRAP: React.CSSProperties = {
  width: "100%",
  overflow: "hidden",
};

const DATA_NOTE_BAR: React.CSSProperties = {
  padding: "5px 12px",
  fontSize: 10,
  color: "var(--muted)",
  fontStyle: "italic",
  borderBottom: "1px solid var(--line-2)",
  display: "flex",
  flexWrap: "wrap",
  gap: 4,
};

const TABLE_STYLE: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 12,
  fontFamily: "var(--font-ui)",
};

const TH_STYLE: React.CSSProperties = {
  padding: "6px 10px",
  textAlign: "left",
  fontSize: 10,
  fontWeight: 600,
  color: "var(--muted)",
  borderBottom: "1px solid var(--line)",
  whiteSpace: "nowrap",
  letterSpacing: "0.04em",
  textTransform: "uppercase",
};

const ROW_STYLE: React.CSSProperties = {
  borderBottom: "1px solid var(--line-2)",
  transition: "background 80ms",
};

const TD_STYLE: React.CSSProperties = {
  padding: "6px 10px",
  fontSize: 12,
  color: "var(--text)",
};

const DIV_BADGE: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 700,
  background: "rgba(232,179,57,0.15)",
  color: "var(--warn)",
  borderRadius: 3,
  padding: "1px 4px",
};

const TABLE_FOOTER: React.CSSProperties = {
  padding: "6px 12px",
  fontSize: 9,
  color: "var(--muted)",
  fontStyle: "italic",
  textAlign: "center",
  borderTop: "1px solid var(--line-2)",
};
