"use client";
/**
 * Treemap.tsx — squarified treemap in pure SVG/React (zero new npm deps).
 *
 * HONESTY DOCTRINE:
 *   - PRICE layer: color = %chg (1D real). Dead-zone |chg| < 0.10 → flat dark.
 *   - FLOW layer: color = tone field (pos/neg/neutral). Dead-zone = "neutral".
 *     Call-share dead-zone ±0.08 → "MIXED" gray (not used for color here —
 *     we use the `tone` field which is ΔOI-based and reliability-labeled).
 *   - Size = EQUAL (v1); CAP deferred (no mcap in manifest); PREMIUM = flow netPremiumMn.
 *   - No directional buy/sell assertions anywhere in this component.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import type { HeatmapTile, Layer, SizingMode, SectorBlock, TreemapNode, LayoutRect } from "./types";
import { SECTOR_LABEL, SECTOR_ORDER } from "./sectorMap";
import type { GicsSector } from "./types";

// ─── Color scales ─────────────────────────────────────────────────────────────

/** Price tile gradient stop colors. Dead-zone = |chg| < 0.10 */
function priceColor(chg: number): { top: string; bot: string } {
  const DEAD = 0.10;
  if (Math.abs(chg) < DEAD) {
    return { top: "rgb(24,28,36)", bot: "rgb(16,20,26)" };
  }
  const t = Math.min(Math.abs(chg) / 4, 1);
  const t2 = t * t;
  if (chg > 0) {
    return {
      top: `rgb(${Math.round(5 + t * 3)},${Math.round(25 + t2 * 175)},${Math.round(15 + t2 * 68)})`,
      bot: `rgb(${Math.round(3 + t * 2)},${Math.round(12 + t2 * 80)},${Math.round(8 + t2 * 30)})`,
    };
  }
  return {
    top: `rgb(${Math.round(40 + t2 * 215)},${Math.round(8 + t * 15)},${Math.round(12 + t2 * 56)})`,
    bot: `rgb(${Math.round(20 + t2 * 95)},${Math.round(5 + t * 8)},${Math.round(8 + t2 * 24)})`,
  };
}

/**
 * Flow tile color. Uses `tone` field (ΔOI-based, reliable for direction).
 * Dead-zone = "neutral" → gray.
 * HONESTY: we never assert call/put direction from net_premium_mn magnitude.
 */
function flowColor(tone: "neg" | "neutral" | "pos" | undefined, premMn: number | undefined): { top: string; bot: string } {
  if (!tone || tone === "neutral") {
    return { top: "rgb(30,35,42)", bot: "rgb(22,26,32)" };
  }
  // Saturation from premium magnitude (soft — just for visual density)
  const mag = Math.min((premMn ?? 0) / 50, 1);  // saturates at $50M
  const t = 0.3 + mag * 0.7;  // min 0.3 so color is always visible
  if (tone === "pos") {
    return {
      top: `rgb(${Math.round(5 + t * 5)},${Math.round(35 + t * 156)},${Math.round(30 + t * 135)})`,
      bot: `rgb(${Math.round(3 + t * 3)},${Math.round(18 + t * 65)},${Math.round(16 + t * 55)})`,
    };
  }
  // tone === "neg"
  return {
    top: `rgb(${Math.round(40 + t * 215)},${Math.round(18 + t * 89)},${Math.round(18 + t * 89)})`,
    bot: `rgb(${Math.round(22 + t * 85)},${Math.round(10 + t * 35)},${Math.round(10 + t * 35)})`,
  };
}

// ─── Squarified treemap algorithm ─────────────────────────────────────────────

/**
 * Squarify layout. Standard Bruls/Wijk/van Wijk algorithm.
 * items: array of { value, tile }
 * Returns array of { x, y, w, h, tile }.
 */
function squarify(
  items: { value: number; tile: HeatmapTile }[],
  x: number, y: number, w: number, h: number
): TreemapNode[] {
  if (items.length === 0 || w <= 0 || h <= 0) return [];

  const totalValue = items.reduce((s, i) => s + i.value, 0);
  if (totalValue <= 0) {
    // equal area fallback
    return squarify(items.map(i => ({ ...i, value: 1 })), x, y, w, h);
  }

  // Canonical precondition: descending by value.
  const sorted = [...items].sort((a, b) => b.value - a.value);
  const result: TreemapNode[] = [];
  squarifyRecurse(sorted, x, y, w, h, totalValue, result);
  return result;
}

// Worst aspect ratio of a row: s = row's total scaled area, mx/mn = largest/
// smallest scaled area in the row, short = length of the side the row spans.
// (Bruls, Huizing & van Wijk, "Squarified Treemaps", eq. for worst().)
function worstAspect(s: number, mx: number, mn: number, short: number): number {
  const s2 = s * s;
  const short2 = short * short;
  return Math.max((short2 * mx) / s2, s2 / (short2 * mn));
}

function squarifyRecurse(
  items: { value: number; tile: HeatmapTile }[],
  x: number, y: number, w: number, h: number,
  totalValue: number,
  result: TreemapNode[]
): void {
  if (items.length === 0 || w <= 0.5 || h <= 0.5 || totalValue <= 0) return;
  if (items.length === 1) {
    result.push({ x, y, w, h, tile: items[0].tile });
    return;
  }

  // Scale values so they sum to the rect's area.
  const scale = (w * h) / totalValue;
  const areas = items.map(i => Math.max(i.value * scale, 1e-9));
  const short = Math.min(w, h);

  // Grow the row while the worst aspect ratio keeps improving.
  let count = 1;
  let sum = areas[0];
  let mx = areas[0];
  let mn = areas[0];
  let worst = worstAspect(sum, mx, mn, short);
  for (let i = 1; i < areas.length; i++) {
    const nSum = sum + areas[i];
    const nMx = Math.max(mx, areas[i]);
    const nMn = Math.min(mn, areas[i]);
    const nWorst = worstAspect(nSum, nMx, nMn, short);
    if (nWorst <= worst) {
      count = i + 1; sum = nSum; mx = nMx; mn = nMn; worst = nWorst;
    } else {
      break;
    }
  }

  // Lay the row along the shorter side; its thickness fills the longer side.
  const thick = sum / short;
  const isWide = w >= h;
  let pos = isWide ? y : x;
  for (let i = 0; i < count; i++) {
    const len = areas[i] / thick;
    if (isWide) {
      result.push({ x, y: pos, w: thick, h: len, tile: items[i].tile });
    } else {
      result.push({ x: pos, y, w: len, h: thick, tile: items[i].tile });
    }
    pos += len;
  }

  const rest = items.slice(count);
  const restTotal = rest.reduce((s, i) => s + i.value, 0);
  if (isWide) {
    squarifyRecurse(rest, x + thick, y, w - thick, h, restTotal, result);
  } else {
    squarifyRecurse(rest, x, y + thick, w, h - thick, restTotal, result);
  }
}

// ─── Tile value function ──────────────────────────────────────────────────────

function tileValue(tile: HeatmapTile, sizing: SizingMode, layer: Layer): number {
  if (sizing === "premium" && layer === "flow" && tile.hasFlow) {
    return Math.max(tile.netPremiumMn ?? 0, 0.01);  // min to keep tile visible
  }
  // equal or cap (cap deferred, treated as equal in v1)
  return 1;
}

// ─── Sector block layout ──────────────────────────────────────────────────────

/**
 * Lay out sector blocks first, then tiles within each block.
 * Sectors sized by their aggregate tile value.
 */
function layoutSectors(
  tiles: HeatmapTile[],
  sizing: SizingMode,
  layer: Layer,
  canvasW: number,
  canvasH: number,
  gap: number = 2
): SectorBlock[] {
  // Group by sector
  const bySector: Partial<Record<GicsSector, HeatmapTile[]>> = {};
  for (const tile of tiles) {
    const s = tile.sector;
    if (!bySector[s]) bySector[s] = [];
    bySector[s]!.push(tile);
  }

  // Build sector items sorted by SECTOR_ORDER, then by value desc
  const sectorItems: { sector: GicsSector; tiles: HeatmapTile[]; value: number }[] = [];
  for (const sector of SECTOR_ORDER) {
    const ts = bySector[sector];
    if (!ts || ts.length === 0) continue;
    const value = ts.reduce((s, t) => s + tileValue(t, sizing, layer), 0);
    sectorItems.push({ sector, tiles: ts, value });
  }

  if (sectorItems.length === 0) return [];

  const totalValue = sectorItems.reduce((s, i) => s + i.value, 0);

  // Squarify sector blocks
  const sectorTmpItems = sectorItems.map(s => ({
    value: s.value,
    tile: { ticker: s.sector, name: s.sector, sector: s.sector, price: 0, chg1d: 0, hasFlow: false } as HeatmapTile,
  }));

  const HEADER_H = 18; // sector label header height

  const sectorRects: LayoutRect[] = [];
  squarifyRecurse(sectorTmpItems, 0, 0, canvasW, canvasH, totalValue, sectorRects as unknown as TreemapNode[]);

  const blocks: SectorBlock[] = [];
  for (let i = 0; i < sectorItems.length; i++) {
    const rect = sectorRects[i];
    if (!rect) continue;
    const { sector, tiles: sectorTiles } = sectorItems[i];

    // Inner canvas for tiles (below sector header, with gap)
    const innerX = rect.x + gap;
    const innerY = rect.y + HEADER_H + gap;
    const innerW = rect.w - gap * 2;
    const innerH = rect.h - HEADER_H - gap * 2;

    if (innerW < 4 || innerH < 4) {
      // Too small — still include block but no inner tiles
      blocks.push({ x: rect.x, y: rect.y, w: rect.w, h: rect.h, sector, nodes: [] });
      continue;
    }

    // Lay out tiles within sector
    const tileItems = sectorTiles.map(t => ({ value: tileValue(t, sizing, layer), tile: t }));
    const nodes = squarify(tileItems, innerX, innerY, innerW, innerH);

    blocks.push({ x: rect.x, y: rect.y, w: rect.w, h: rect.h, sector, nodes });
  }

  return blocks;
}

// ─── Tooltip ──────────────────────────────────────────────────────────────────

interface TooltipState {
  tile: HeatmapTile;
  cx: number;
  cy: number;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface TreemapProps {
  tiles: HeatmapTile[];
  layer: Layer;
  sizing: SizingMode;
  selectedTicker: string | null;
  onSelect: (tile: HeatmapTile) => void;
  lang: "en" | "zh";
}

// ─── Component ────────────────────────────────────────────────────────────────

const MIN_TILE_AREA = 64; // px² — tiles below this area are not rendered

export function Treemap({ tiles, layer, sizing, selectedTicker, onSelect, lang }: TreemapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState<{ w: number; h: number }>({ w: 900, h: 500 });
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  // ResizeObserver — 120ms debounce
  useEffect(() => {
    if (!containerRef.current) return;
    let timer: ReturnType<typeof setTimeout>;
    const ro = new ResizeObserver((entries) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const e = entries[0];
        if (e) {
          setDims({ w: e.contentRect.width, h: e.contentRect.height });
        }
      }, 120);
    });
    ro.observe(containerRef.current);
    // Initial measure
    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width > 0) setDims({ w: rect.width, h: rect.height });
    return () => { ro.disconnect(); clearTimeout(timer); };
  }, []);

  // Compute layout
  const blocks = layoutSectors(tiles, sizing, layer, dims.w, dims.h, 2);

  const handleMouseLeave = useCallback(() => setTooltip(null), []);

  const handleTileMouseEnter = useCallback((tile: HeatmapTile, cx: number, cy: number) => {
    setTooltip({ tile, cx, cy });
  }, []);

  const handleTileClick = useCallback((tile: HeatmapTile) => {
    setTooltip(null);
    onSelect(tile);
  }, [onSelect]);

  const zh = lang === "zh";

  // Gradient id cache
  const gradId = useCallback((ticker: string, type: "top" | "bot") => {
    return `hm-grad-${ticker.replace(/[^a-zA-Z0-9]/g, "_")}-${type}`;
  }, []);

  return (
    <div ref={containerRef} style={TREEMAP_CONTAINER} onMouseLeave={handleMouseLeave}>
      <svg
        width={dims.w}
        height={dims.h}
        style={{ display: "block", overflow: "visible" }}
      >
        {/* Define gradients for each tile */}
        <defs>
          {blocks.flatMap(block =>
            block.nodes.map(node => {
              const tile = node.tile;
              const colors = layer === "price"
                ? priceColor(tile.chg1d)
                : flowColor(tile.tone, tile.netPremiumMn);
              return (
                <linearGradient
                  key={`grad-${tile.ticker}`}
                  id={gradId(tile.ticker, "top")}
                  x1="0" y1="0" x2="0" y2="1"
                >
                  <stop offset="0%" stopColor={colors.top} />
                  <stop offset="100%" stopColor={colors.bot} />
                </linearGradient>
              );
            })
          )}
        </defs>

        {/* Sector blocks */}
        {blocks.map(block => (
          <SectorBlockGroup
            key={block.sector}
            block={block}
            layer={layer}
            selectedTicker={selectedTicker}
            gradId={gradId}
            onTileMouseEnter={handleTileMouseEnter}
            onTileClick={handleTileClick}
            zh={zh}
          />
        ))}
      </svg>

      {/* Hover tooltip */}
      {tooltip && (
        <HoverTooltip tooltip={tooltip} layer={layer} canvasW={dims.w} canvasH={dims.h} zh={zh} />
      )}
    </div>
  );
}

// ─── SectorBlockGroup ─────────────────────────────────────────────────────────

interface SectorBlockGroupProps {
  block: SectorBlock;
  layer: Layer;
  selectedTicker: string | null;
  gradId: (ticker: string, type: "top" | "bot") => string;
  onTileMouseEnter: (tile: HeatmapTile, cx: number, cy: number) => void;
  onTileClick: (tile: HeatmapTile) => void;
  zh: boolean;
}

function SectorBlockGroup({
  block, layer, selectedTicker, gradId, onTileMouseEnter, onTileClick, zh,
}: SectorBlockGroupProps) {
  const label = SECTOR_LABEL[block.sector] ?? block.sector;

  return (
    <g>
      {/* Sector background */}
      <rect
        x={block.x}
        y={block.y}
        width={block.w}
        height={block.h}
        fill="var(--panel)"
        stroke="var(--line)"
        strokeWidth={1}
        rx={3}
      />

      {/* Sector header label */}
      <text
        x={block.x + 6}
        y={block.y + 13}
        fontSize={10}
        fontWeight={700}
        fill="var(--muted)"
        style={{ letterSpacing: "0.05em", userSelect: "none", fontFamily: "var(--font-ui)" }}
      >
        {label}
      </text>

      {/* Tiles */}
      {block.nodes.map(node => {
        const area = node.w * node.h;
        if (area < MIN_TILE_AREA) return null;
        return (
          <TileRect
            key={node.tile.ticker}
            node={node}
            layer={layer}
            isSelected={selectedTicker === node.tile.ticker}
            gradId={gradId(node.tile.ticker, "top")}
            onMouseEnter={onTileMouseEnter}
            onClick={onTileClick}
            zh={zh}
          />
        );
      })}
    </g>
  );
}

// ─── TileRect ─────────────────────────────────────────────────────────────────

interface TileRectProps {
  node: TreemapNode;
  layer: Layer;
  isSelected: boolean;
  gradId: string;
  onMouseEnter: (tile: HeatmapTile, cx: number, cy: number) => void;
  onClick: (tile: HeatmapTile) => void;
  zh: boolean;
}

function TileRect({ node, layer, isSelected, gradId, onMouseEnter, onClick, zh: _zh }: TileRectProps) {
  const { x, y, w, h, tile } = node;
  const PAD = 3;

  // Label: ticker + value
  const chg1d = tile.chg1d ?? 0;
  const valueLabel = layer === "price"
    ? `${chg1d >= 0 ? "+" : ""}${chg1d.toFixed(2)}%`
    : tile.netPremiumMn != null
      ? `$${tile.netPremiumMn.toFixed(1)}M`
      : "";

  const showTicker = w > 28 && h > 16;
  const showValue  = w > 40 && h > 28;

  // "price only" badge on flow layer when no flow data
  const showPriceOnly = layer === "flow" && !tile.hasFlow && w > 36 && h > 16;

  // Volume spike indicator (price layer)
  const showVolSpike = layer === "price" && tile.vol != null && w > 20 && h > 16;
  const isVolSpike = false; // vol/prev_vol not in manifest v1; placeholder

  return (
    <g
      onClick={() => onClick(tile)}
      onMouseEnter={(e) => {
        const svgEl = (e.target as SVGElement).closest("svg");
        if (!svgEl) return;
        const svgRect = svgEl.getBoundingClientRect();
        const cx = e.clientX - svgRect.left;
        const cy = e.clientY - svgRect.top;
        onMouseEnter(tile, cx, cy);
      }}
      style={{ cursor: "pointer" }}
    >
      <rect
        x={x + 1}
        y={y + 1}
        width={w - 2}
        height={h - 2}
        fill={`url(#${gradId})`}
        stroke={isSelected ? "var(--brand-2)" : "var(--line-2)"}
        strokeWidth={isSelected ? 2 : 0.5}
        rx={2}
      />

      {showTicker && (
        <text
          x={x + PAD + 2}
          y={y + PAD + 11}
          fontSize={Math.min(11, Math.max(9, w / 5))}
          fontWeight={700}
          fill="rgba(255,255,255,0.92)"
          style={{ userSelect: "none", fontFamily: "var(--font-ui)" }}
          clipPath={`inset(0 0 0 0)`}
        >
          {tile.ticker}
        </text>
      )}

      {showValue && (
        <text
          x={x + PAD + 2}
          y={y + PAD + 24}
          fontSize={Math.min(10, Math.max(8, w / 6))}
          fill="rgba(255,255,255,0.72)"
          style={{ userSelect: "none", fontFamily: "var(--font-num)", fontVariantNumeric: "tabular-nums" }}
        >
          {valueLabel}
        </text>
      )}

      {showPriceOnly && (
        <text
          x={x + PAD + 2}
          y={y + h - 5}
          fontSize={8}
          fill="rgba(255,255,255,0.4)"
          style={{ userSelect: "none", fontFamily: "var(--font-ui)" }}
        >
          price
        </text>
      )}

      {showVolSpike && isVolSpike && (
        <rect x={x + w - 7} y={y + h - 7} width={5} height={5} fill="var(--brand-2)" rx={1} />
      )}
    </g>
  );
}

// ─── HoverTooltip ─────────────────────────────────────────────────────────────

interface HoverTooltipProps {
  tooltip: TooltipState;
  layer: Layer;
  canvasW: number;
  canvasH: number;
  zh: boolean;
}

function HoverTooltip({ tooltip, layer, canvasW, canvasH, zh }: HoverTooltipProps) {
  const { tile, cx, cy } = tooltip;
  const TIP_W = 180;
  const TIP_H = layer === "flow" ? 230 : 170;

  // Clamp position
  const left = Math.min(cx + 12, canvasW - TIP_W - 4);
  const top  = cy + TIP_H > canvasH ? cy - TIP_H - 8 : cy + 16;

  const tipChg = tile.chg1d ?? 0;
  const chgColor = tipChg >= 0 ? "var(--up)" : "var(--down)";
  const chgStr = `${tipChg >= 0 ? "+" : ""}${tipChg.toFixed(2)}%`;

  // Divergence: price up + tone neg, or price down + tone pos
  const priceUp = tile.chg1d >= 0.05;
  const priceDn = tile.chg1d <= -0.05;
  const tonePos = tile.tone === "pos";
  const toneNeg = tile.tone === "neg";
  const isDivergent = tile.hasFlow && ((priceUp && toneNeg) || (priceDn && tonePos));

  return (
    <div
      style={{
        position: "absolute",
        left,
        top,
        width: TIP_W,
        background: "var(--panel-2)",
        border: "1px solid var(--line-3)",
        borderRadius: 6,
        padding: "8px 10px",
        pointerEvents: "none",
        zIndex: 100,
        boxShadow: "var(--shadow-1)",
        fontSize: 11,
        fontFamily: "var(--font-ui)",
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>
        {tile.ticker}
        {isDivergent && (
          <span style={{ marginLeft: 6, fontSize: 9, color: "var(--warn)", fontWeight: 600 }}>
            DIV
          </span>
        )}
      </div>
      <div style={{ color: "var(--text-2)", marginBottom: 5, fontSize: 10 }}>{tile.name}</div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
        <span style={{ color: "var(--muted)" }}>{zh ? "价格" : "Price"}</span>
        <span style={{ fontVariantNumeric: "tabular-nums" }}>${(tile.price ?? 0).toFixed(2)}</span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
        <span style={{ color: "var(--muted)" }}>{zh ? "涨跌" : "Chg 1D"}</span>
        <span style={{ color: chgColor, fontVariantNumeric: "tabular-nums" }}>{chgStr}</span>
      </div>

      {layer === "flow" && tile.hasFlow && (
        <>
          <div style={{ borderTop: "1px solid var(--line-2)", margin: "5px 0" }} />
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
            <span style={{ color: "var(--muted)" }}>{zh ? "权利金" : "Premium"}</span>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>
              {tile.netPremiumMn != null ? `$${tile.netPremiumMn.toFixed(1)}M` : "—"}
            </span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
            <span style={{ color: "var(--muted)" }}>{zh ? "倾向" : "Tone"}</span>
            <span style={{ color: tile.tone === "pos" ? "var(--up)" : tile.tone === "neg" ? "var(--down)" : "var(--muted)" }}>
              {tile.tone ?? "—"}
            </span>
          </div>
          {tile.doiPc != null && (
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
              <span style={{ color: "var(--muted)" }}>ΔOI P/C</span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>{(tile.doiPc ?? 0).toFixed(2)}</span>
            </div>
          )}
          {isDivergent && (
            <div style={{ marginTop: 4, padding: "3px 5px", background: "rgba(232,179,57,0.12)", borderRadius: 3, fontSize: 9, color: "var(--warn)", lineHeight: 1.4 }}>
              {zh ? "价格/流向背离 — 以规模为准" : "price/flow divergence — magnitude read"}
            </div>
          )}
          <div style={{ marginTop: 5, fontSize: 9, color: "var(--muted)", fontStyle: "italic" }}>
            {zh ? "方向为软性读数" : "direction is soft"}
          </div>
        </>
      )}

      {layer === "flow" && !tile.hasFlow && (
        <div style={{ color: "var(--muted)", fontSize: 9, fontStyle: "italic", marginTop: 4 }}>
          {zh ? "仅价格数据" : "price only"}
        </div>
      )}
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const TREEMAP_CONTAINER: React.CSSProperties = {
  position: "relative",
  width: "100%",
  height: "100%",
  overflow: "hidden",
};
