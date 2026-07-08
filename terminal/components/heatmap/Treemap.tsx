"use client";
/**
 * Treemap.tsx — squarified treemap in pure SVG/React (zero new npm deps).
 *
 * HONESTY DOCTRINE:
 *   - PRICE layer: color = %chg (1D real). Dead-zone |chg| < 0.10 → flat dark.
 *   - FLOW layer: color = tone field (pos/neg/neutral). Dead-zone = "neutral".
 *     Call-share dead-zone ±0.08 → "MIXED" gray (not used for color here —
 *     we use the `tone` field which is ΔOI-based and reliability-labeled).
 *   - Size = EQUAL / CAP (dollar-volume proxy, manifest has price×vol) / PREMIUM.
 *   - No directional buy/sell assertions anywhere in this component.
 *
 * DESIGN: Matches MomoEdge visual fidelity:
 *   - Sector blocks with dark header bands, abbrev label + avg chg.
 *   - Tiles: ticker bold centered, %chg below. Font scales with tile size.
 *   - Labels hidden below min size (same threshold as MomoEdge ~20×10).
 *   - Color ramp: stepped intensity gradient (t = min(|chg|/4, 1) — exact port).
 *   - Dead-zone: |chg| < 0.10 → near-black (no color bleed at flatline).
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import type { HeatmapTile, Layer, SizingMode, SectorBlock, TreemapNode, LayoutRect } from "./types";
import { SECTOR_LABEL, SECTOR_ORDER } from "./sectorMap";
import type { GicsSector } from "./types";

// ─── Color scales (ported from MomoEdge heatmap-widget.js priceTileColor / flowTileColor) ──

/** Price tile gradient. Dead-zone = |chg| < 0.10. Exact MomoEdge port. */
function priceColor(chg: number): { top: string; bot: string } {
  if (Math.abs(chg) < 0.10) {
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
 * Flow tile color using tone. Dead-zone = "neutral".
 * Saturation from netPremiumMn magnitude for visual density.
 * HONESTY: we never assert call/put direction from net_premium_mn magnitude.
 */
function flowColor(tone: "neg" | "neutral" | "pos" | undefined, premMn: number | undefined): { top: string; bot: string } {
  if (!tone || tone === "neutral") {
    return { top: "rgb(30,35,42)", bot: "rgb(22,26,32)" };
  }
  const t = Math.min(0.3 + Math.min((premMn ?? 0) / 50, 1) * 0.7, 1);
  if (tone === "pos") {
    return {
      top: `rgb(${Math.round(5 + t * 5)},${Math.round(35 + t * 156)},${Math.round(30 + t * 135)})`,
      bot: `rgb(${Math.round(3 + t * 3)},${Math.round(18 + t * 65)},${Math.round(16 + t * 55)})`,
    };
  }
  return {
    top: `rgb(${Math.round(40 + t * 215)},${Math.round(18 + t * 89)},${Math.round(18 + t * 89)})`,
    bot: `rgb(${Math.round(22 + t * 85)},${Math.round(10 + t * 35)},${Math.round(10 + t * 35)})`,
  };
}

// ─── Squarified treemap algorithm ─────────────────────────────────────────────

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

  const scale = (w * h) / totalValue;
  const areas = items.map(i => Math.max(i.value * scale, 1e-9));
  const short = Math.min(w, h);

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

function squarify(
  items: { value: number; tile: HeatmapTile }[],
  x: number, y: number, w: number, h: number
): TreemapNode[] {
  if (items.length === 0 || w <= 0 || h <= 0) return [];
  const totalValue = items.reduce((s, i) => s + i.value, 0);
  if (totalValue <= 0) {
    return squarify(items.map(i => ({ ...i, value: 1 })), x, y, w, h);
  }
  const sorted = [...items].sort((a, b) => b.value - a.value);
  const result: TreemapNode[] = [];
  squarifyRecurse(sorted, x, y, w, h, totalValue, result);
  return result;
}

// ─── Tile value function ──────────────────────────────────────────────────────

/**
 * Tile sizing:
 *   - "cap" → dollar-volume proxy (price × vol), falls back to equal if missing.
 *     min floor = 1 so no tile vanishes.
 *   - "premium" (flow layer) → abs(netPremiumMn), min 0.01.
 *   - "equal" → 1.
 *
 * NOTE: manifest lacks market_cap; dollar-volume (price×vol) is the documented
 * proxy and correlates well with cap rank for large/mid caps.
 * This will be superseded when nightly manifest injects mcap.
 */
function tileValue(tile: HeatmapTile, sizing: SizingMode, layer: Layer): number {
  if (sizing === "premium" && layer === "flow" && tile.hasFlow) {
    return Math.max(Math.abs(tile.netPremiumMn ?? 0), 0.01);
  }
  if (sizing === "cap") {
    // Dollar-volume proxy: price * vol. Floor at 1 so tiles with zero vol still render.
    const dv = (tile.price ?? 0) * (tile.vol ?? 0);
    return Math.max(dv, 1);
  }
  return 1;
}

// ─── Sector block layout ──────────────────────────────────────────────────────

const HEADER_H_BIG = 24;  // sector label band height when sector block is tall
const HEADER_H_MED = 14;  // compact header for medium blocks
const HEADER_H_SML = 8;   // minimal header for small blocks

function getHeaderH(blockH: number): number {
  if (blockH > 55) return HEADER_H_BIG;
  if (blockH > 35) return HEADER_H_MED;
  if (blockH > 20) return HEADER_H_SML;
  return 0;
}

function layoutSectors(
  tiles: HeatmapTile[],
  sizing: SizingMode,
  layer: Layer,
  canvasW: number,
  canvasH: number,
  gap: number = 1
): SectorBlock[] {
  const bySector: Partial<Record<GicsSector, HeatmapTile[]>> = {};
  for (const tile of tiles) {
    const s = tile.sector;
    if (!bySector[s]) bySector[s] = [];
    bySector[s]!.push(tile);
  }

  const sectorItems: { sector: GicsSector; tiles: HeatmapTile[]; value: number }[] = [];
  for (const sector of SECTOR_ORDER) {
    const ts = bySector[sector];
    if (!ts || ts.length === 0) continue;
    const value = ts.reduce((s, t) => s + tileValue(t, sizing, layer), 0);
    sectorItems.push({ sector, tiles: ts, value });
  }

  if (sectorItems.length === 0) return [];

  const totalValue = sectorItems.reduce((s, i) => s + i.value, 0);

  const sectorTmpItems = sectorItems.map(s => ({
    value: s.value,
    tile: { ticker: s.sector, name: s.sector, sector: s.sector, price: 0, chg1d: 0, hasFlow: false } as HeatmapTile,
  }));

  const sectorRects: LayoutRect[] = [];
  squarifyRecurse(sectorTmpItems, 0, 0, canvasW, canvasH, totalValue, sectorRects as unknown as TreemapNode[]);

  const blocks: SectorBlock[] = [];
  for (let i = 0; i < sectorItems.length; i++) {
    const rect = sectorRects[i];
    if (!rect) continue;
    const { sector, tiles: sectorTiles } = sectorItems[i];

    const hH = getHeaderH(rect.h);
    const innerX = rect.x + gap;
    const innerY = rect.y + hH + gap;
    const innerW = rect.w - gap * 2;
    const innerH = rect.h - hH - gap * 2;

    if (innerW < 4 || innerH < 4) {
      blocks.push({ x: rect.x, y: rect.y, w: rect.w, h: rect.h, sector, nodes: [] });
      continue;
    }

    const tileItems = sectorTiles.map(t => ({ value: tileValue(t, sizing, layer), tile: t }));
    // Sort descending so largest tiles anchor top-left (best readability).
    tileItems.sort((a, b) => b.value - a.value);
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

// ─── Sector avg-change for header color ──────────────────────────────────────

function sectorAvgChg(block: SectorBlock, layer: Layer): number {
  if (block.nodes.length === 0) return 0;
  if (layer === "price") {
    return block.nodes.reduce((s, n) => s + n.tile.chg1d, 0) / block.nodes.length;
  }
  // flow: average tone mapped to -1/0/+1
  const flowNodes = block.nodes.filter(n => n.tile.hasFlow);
  if (flowNodes.length === 0) return 0;
  return flowNodes.reduce((s, n) => {
    const v = n.tile.tone === "pos" ? 1 : n.tile.tone === "neg" ? -1 : 0;
    return s + v;
  }, 0) / flowNodes.length;
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

const MIN_TILE_AREA = 64;  // px² — below this tiles are not rendered (MomoEdge: ~20x8 ≈ 160; we use 64 to show more names)

export function Treemap({ tiles, layer, sizing, selectedTicker, onSelect, lang }: TreemapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState<{ w: number; h: number }>({ w: 900, h: 500 });
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    let timer: ReturnType<typeof setTimeout>;
    const ro = new ResizeObserver((entries) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const e = entries[0];
        if (e) setDims({ w: e.contentRect.width, h: e.contentRect.height });
      }, 120);
    });
    ro.observe(containerRef.current);
    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width > 0) setDims({ w: rect.width, h: rect.height });
    return () => { ro.disconnect(); clearTimeout(timer); };
  }, []);

  const blocks = layoutSectors(tiles, sizing, layer, dims.w, dims.h, 1);

  const handleMouseLeave = useCallback(() => setTooltip(null), []);

  const handleTileMouseEnter = useCallback((tile: HeatmapTile, cx: number, cy: number) => {
    setTooltip({ tile, cx, cy });
  }, []);

  const handleTileClick = useCallback((tile: HeatmapTile) => {
    setTooltip(null);
    onSelect(tile);
  }, [onSelect]);

  const zh = lang === "zh";

  // Pre-generate gradient ids for all tiles
  const gradId = useCallback((ticker: string) => {
    return `hm-g-${ticker.replace(/[^a-zA-Z0-9]/g, "_")}`;
  }, []);

  return (
    <div ref={containerRef} style={TREEMAP_CONTAINER} onMouseLeave={handleMouseLeave}>
      <svg width={dims.w} height={dims.h} style={{ display: "block" }}>
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
                  id={gradId(tile.ticker)}
                  x1="0" y1="0" x2="0" y2="1"
                >
                  <stop offset="0%" stopColor={colors.top} />
                  <stop offset="100%" stopColor={colors.bot} />
                </linearGradient>
              );
            })
          )}
        </defs>

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
  gradId: (ticker: string) => string;
  onTileMouseEnter: (tile: HeatmapTile, cx: number, cy: number) => void;
  onTileClick: (tile: HeatmapTile) => void;
  zh: boolean;
}

function SectorBlockGroup({
  block, layer, selectedTicker, gradId, onTileMouseEnter, onTileClick,
}: SectorBlockGroupProps) {
  const abbrev = SECTOR_LABEL[block.sector] ?? block.sector;
  const hH = getHeaderH(block.h);
  const avg = sectorAvgChg(block, layer);
  const avgColor = avg > 0 ? "var(--up)" : avg < 0 ? "var(--down)" : "rgba(148,163,184,0.6)";
  const big = block.h > 55 && block.w > 75;
  const med = !big && block.h > 30 && block.w > 40;

  return (
    <g>
      {/* Sector background */}
      <rect
        x={block.x}
        y={block.y}
        width={block.w}
        height={block.h}
        fill="rgba(255,255,255,0.003)"
        stroke={`rgba(${avg > 0 ? "0,200,83" : avg < 0 ? "255,23,68" : "148,163,184"},0.18)`}
        strokeWidth={1.2}
        rx={3}
      />

      {/* Sector header band */}
      {big && hH >= HEADER_H_BIG && (
        <>
          <rect
            x={block.x}
            y={block.y}
            width={block.w}
            height={hH}
            fill="rgba(0,0,0,0.45)"
            rx={3}
          />
          <line
            x1={block.x + 1}
            y1={block.y + hH}
            x2={block.x + block.w - 1}
            y2={block.y + hH}
            stroke={`rgba(148,163,184,0.15)`}
            strokeWidth={0.5}
          />
          <text
            x={block.x + 8}
            y={block.y + 10}
            fontSize={9}
            fontWeight={700}
            fill="#94a3b8"
            style={{ userSelect: "none", fontFamily: "var(--font-num, monospace)", letterSpacing: "0.06em" }}
          >
            {abbrev}
          </text>
          {block.nodes.length > 0 && (
            <text
              x={block.x + block.w - 6}
              y={block.y + 10}
              fontSize={9}
              fontWeight={700}
              fill={avgColor}
              textAnchor="end"
              style={{ userSelect: "none", fontFamily: "var(--font-num, monospace)" }}
            >
              {layer === "price"
                ? `${avg >= 0 ? "+" : ""}${avg.toFixed(1)}%`
                : `${avg >= 0 ? "+" : ""}${(avg * 100).toFixed(0)}%`
              }
            </text>
          )}
          {/* Breadth / leader sub-line */}
          <text
            x={block.x + 8}
            y={block.y + 19}
            fontSize={6}
            fill="rgba(255,255,255,0.18)"
            style={{ userSelect: "none", fontFamily: "var(--font-num, monospace)" }}
          >
            {block.nodes.length > 0 ? block.nodes[0].tile.ticker : ""}
          </text>
        </>
      )}

      {med && hH >= HEADER_H_MED && (
        <>
          <rect
            x={block.x}
            y={block.y}
            width={block.w}
            height={hH}
            fill="rgba(0,0,0,0.35)"
            rx={2}
          />
          <text
            x={block.x + 4}
            y={block.y + 9}
            fontSize={7}
            fontWeight={700}
            fill="#8b95a5"
            style={{ userSelect: "none", fontFamily: "var(--font-num, monospace)", letterSpacing: "0.04em" }}
          >
            {abbrev}
          </text>
          {block.nodes.length > 0 && (
            <text
              x={block.x + block.w - 4}
              y={block.y + 9}
              fontSize={7}
              fontWeight={600}
              fill={avgColor.replace("0.6)", "0.5)")}
              textAnchor="end"
              style={{ userSelect: "none", fontFamily: "var(--font-num, monospace)" }}
            >
              {layer === "price"
                ? `${avg >= 0 ? "+" : ""}${avg.toFixed(1)}%`
                : `${avg >= 0 ? "+" : ""}${(avg * 100).toFixed(0)}%`
              }
            </text>
          )}
        </>
      )}

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
            gradId={gradId(node.tile.ticker)}
            onMouseEnter={onTileMouseEnter}
            onClick={onTileClick}
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
}

function TileRect({ node, layer, isSelected, gradId, onMouseEnter, onClick }: TileRectProps) {
  const { x, y, w, h, tile } = node;

  // Font sizing — mirrors MomoEdge: tFs = min(w/4.5, h/2.2, 16), cFs = min(w/6, h/3.5, 12)
  const tFs = Math.min(w / 4.5, h / 2.2, 16);
  const cFs = Math.min(w / 6, h / 3.5, 12);

  // Show ticker if scaled width > 20 and height > 10 (MomoEdge threshold)
  const showTicker = (w * 1) > 20 && (h * 1) > 10;
  // Show value if enough room for two lines
  const showValue = (w * 1) > 26 && (h * 1) > 22;

  const chg1d = tile.chg1d ?? 0;
  const valueLabel = layer === "price"
    ? `${chg1d >= 0 ? "+" : ""}${chg1d.toFixed(1)}%`
    : tile.hasFlow && tile.netPremiumMn != null
      ? `$${tile.netPremiumMn.toFixed(1)}M`
      : "";

  return (
    <g
      onClick={() => onClick(tile)}
      onMouseEnter={(e) => {
        const svgEl = (e.target as SVGElement).closest("svg");
        if (!svgEl) return;
        const svgRect = svgEl.getBoundingClientRect();
        onMouseEnter(tile, e.clientX - svgRect.left, e.clientY - svgRect.top);
      }}
      style={{ cursor: "pointer" }}
    >
      <rect
        x={x + 0.3}
        y={y + 0.3}
        width={Math.max(0, w - 0.6)}
        height={Math.max(0, h - 0.6)}
        fill={`url(#${gradId})`}
        stroke={isSelected ? "var(--brand, #00e5ff)" : "rgba(255,255,255,0.02)"}
        strokeWidth={isSelected ? 2 : 0.2}
        rx={1.5}
      />

      {showTicker && (
        <text
          x={x + w / 2}
          y={y + h / 2 - (showValue ? cFs * 0.55 + 1 : 0)}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={tFs}
          fontWeight={700}
          fill="#f1f5f9"
          style={{ userSelect: "none", fontFamily: "var(--font-num, monospace)", pointerEvents: "none" }}
        >
          {tile.ticker}
        </text>
      )}

      {showValue && (
        <text
          x={x + w / 2}
          y={y + h / 2 + tFs * 0.55 + 1}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={cFs}
          fontWeight={600}
          fill="rgba(255,255,255,0.85)"
          style={{
            userSelect: "none",
            fontFamily: "var(--font-num, monospace)",
            fontVariantNumeric: "tabular-nums",
            pointerEvents: "none",
          }}
        >
          {valueLabel}
        </text>
      )}

      {/* "price only" badge on flow layer when no flow data */}
      {layer === "flow" && !tile.hasFlow && w > 36 && h > 16 && (
        <text
          x={x + w / 2}
          y={y + h - 5}
          textAnchor="middle"
          fontSize={7}
          fill="rgba(255,255,255,0.3)"
          style={{ userSelect: "none", fontFamily: "var(--font-ui)", pointerEvents: "none" }}
        >
          price
        </text>
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

  const left = Math.min(Math.max(4, cx + 12), canvasW - TIP_W - 4);
  const top  = cy + TIP_H > canvasH ? cy - TIP_H - 8 : cy + 16;

  const tipChg = tile.chg1d ?? 0;
  const chgColor = tipChg >= 0 ? "var(--up)" : "var(--down)";
  const chgStr = `${tipChg >= 0 ? "+" : ""}${tipChg.toFixed(2)}%`;

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
        background: "rgba(10,14,20,0.96)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 6,
        padding: "8px 10px",
        pointerEvents: "none",
        zIndex: 100,
        boxShadow: "0 6px 20px rgba(0,0,0,0.6)",
        fontSize: 11,
        fontFamily: "var(--font-ui)",
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span>{tile.ticker}</span>
        {isDivergent && (
          <span style={{ fontSize: 9, color: "var(--warn)", fontWeight: 600 }}>DIV</span>
        )}
        {layer === "flow" && tile.hasFlow && (
          <span style={{
            fontSize: 8, fontWeight: 600, padding: "1px 4px", borderRadius: 2,
            background: tile.tone === "pos" ? "rgba(0,191,165,0.1)" : tile.tone === "neg" ? "rgba(255,107,107,0.1)" : "rgba(148,163,184,0.1)",
            color: tile.tone === "pos" ? "var(--up)" : tile.tone === "neg" ? "var(--down)" : "var(--muted)",
          }}>
            {tile.tone ?? "—"}
          </span>
        )}
        {layer === "price" && (
          <span style={{ fontSize: 8, fontWeight: 600, padding: "1px 4px", borderRadius: 2,
            background: tipChg >= 0 ? "rgba(0,200,83,0.08)" : "rgba(255,23,68,0.08)",
            color: chgColor }}>
            {chgStr}
          </span>
        )}
      </div>
      <div style={{ color: "rgba(148,163,184,0.7)", marginBottom: 5, fontSize: 10 }}>{tile.name}</div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "3px 10px", fontSize: 10 }}>
        <span style={{ color: "#475569" }}>{zh ? "价格" : "Price"}</span>
        <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>${(tile.price ?? 0).toFixed(2)}</span>

        <span style={{ color: "#475569" }}>{zh ? "涨跌 1D" : "Chg 1D"}</span>
        <span style={{ textAlign: "right", color: chgColor, fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{chgStr}</span>

        {layer === "flow" && tile.hasFlow && (
          <>
            <span style={{ color: "#475569" }}>{zh ? "权利金" : "Premium"}</span>
            <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
              {tile.netPremiumMn != null ? `$${tile.netPremiumMn.toFixed(1)}M` : "—"}
            </span>

            {tile.doiPc != null && (
              <>
                <span style={{ color: "#475569" }}>ΔOI P/C</span>
                <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{tile.doiPc.toFixed(2)}</span>
              </>
            )}

            {isDivergent && (
              <div style={{ gridColumn: "1 / -1", marginTop: 4, padding: "3px 5px", background: "rgba(232,179,57,0.12)", borderRadius: 3, fontSize: 9, color: "var(--warn)", lineHeight: 1.4 }}>
                {zh ? "价格/流向背离 — 以规模为准" : "price/flow divergence — magnitude read"}
              </div>
            )}
            <div style={{ gridColumn: "1 / -1", marginTop: 3, fontSize: 9, color: "var(--muted)", fontStyle: "italic" }}>
              {zh ? "方向为软性读数" : "direction is soft"}
            </div>
          </>
        )}

        {layer === "flow" && !tile.hasFlow && (
          <div style={{ gridColumn: "1 / -1", color: "var(--muted)", fontSize: 9, fontStyle: "italic", marginTop: 4 }}>
            {zh ? "仅价格数据" : "price only"}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const TREEMAP_CONTAINER: React.CSSProperties = {
  position: "relative",
  width: "100%",
  height: "100%",
  overflow: "hidden",
  background: "#0c1018",
};
