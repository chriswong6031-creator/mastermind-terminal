import type { TableSpec } from "@/lib/indicator-canvas/types";

type Corner = "tl" | "tr" | "bl" | "br";

export interface SnapshotTablePalette {
  panel: string;
  line: string;
  text: string;
  text2: string;
  textDim: string;
  muted: string;
}

export interface SnapshotTableFonts {
  ui: string;
  numeric: string;
}

export interface SnapshotTablePaintOptions {
  /** Final canvas width, in output pixels. */
  outputWidth: number;
  /** Final canvas height, in output pixels. */
  outputHeight: number;
  /** Output pixels per chart CSS pixel (normally the snapshot DPR). */
  scale: number;
  /** Y coordinate at which the chart body starts, in output pixels. */
  chartBodyTop: number;
  palette: SnapshotTablePalette;
  fonts: SnapshotTableFonts;
}

export interface SnapshotTableLayout {
  id: string;
  pos: Corner;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface CardMetrics {
  spec: TableSpec;
  pos: Corner;
  width: number;
  height: number;
  padX: number;
  padY: number;
  cellPad: number;
  titleHeight: number;
  titleGap: number;
  headHeight: number;
  rowHeight: number;
  footGap: number;
  footLineHeight: number;
  footLines: string[];
  labelWidth: number;
  columnWidths: number[];
}

const CORNERS: readonly Corner[] = ["tl", "tr", "bl", "br"];
const CARD_OPACITY = 0.95;

function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function fadeOpacity(value: number): number {
  return 1 - clamp(value, 0, 1) * 0.65;
}

function font(weight: number, size: number, family: string): string {
  return `${weight} ${size}px ${family}`;
}

function textWidth(ctx: CanvasRenderingContext2D, value: string): number {
  return ctx.measureText(value).width;
}

function truncate(
  ctx: CanvasRenderingContext2D,
  value: string,
  maxWidth: number,
): string {
  if (!value || maxWidth <= 0) return "";
  if (textWidth(ctx, value) <= maxWidth) return value;
  const ellipsis = "…";
  if (textWidth(ctx, ellipsis) > maxWidth) return "";
  const chars = Array.from(value);
  let lo = 0;
  let hi = chars.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (textWidth(ctx, `${chars.slice(0, mid).join("")}${ellipsis}`) <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return `${chars.slice(0, lo).join("")}${ellipsis}`;
}

function wrapAnywhere(
  ctx: CanvasRenderingContext2D,
  value: string,
  maxWidth: number,
): string[] {
  if (!value) return [];
  if (maxWidth <= 0) return [""];
  const lines: string[] = [];

  const pushOversized = (token: string): string => {
    let current = "";
    for (const char of Array.from(token)) {
      const next = current + char;
      if (current && textWidth(ctx, next) > maxWidth) {
        lines.push(current);
        current = char;
      } else {
        current = next;
      }
    }
    return current;
  };

  let current = "";
  for (const token of value.trim().split(/\s+/u)) {
    const next = current ? `${current} ${token}` : token;
    if (textWidth(ctx, next) <= maxWidth) {
      current = next;
      continue;
    }
    if (current) lines.push(current);
    current = textWidth(ctx, token) <= maxWidth ? token : pushOversized(token);
  }
  if (current || lines.length === 0) lines.push(current);
  return lines;
}

function fitColumns(natural: number[], minimum: number[], target: number): number[] {
  const widths = natural.slice();
  const naturalTotal = widths.reduce((sum, value) => sum + value, 0);
  if (naturalTotal < target && widths.length) {
    const extra = (target - naturalTotal) / widths.length;
    return widths.map((value) => value + extra);
  }
  if (naturalTotal <= target) return widths;

  const excess = naturalTotal - target;
  const shrinkable = widths.reduce((sum, value, index) => sum + Math.max(0, value - minimum[index]), 0);
  if (shrinkable > 0) {
    widths.forEach((value, index) => {
      const room = Math.max(0, value - minimum[index]);
      const reduction = Math.min(room, excess * (room / shrinkable));
      widths[index] -= reduction;
    });
  }

  let total = widths.reduce((sum, value) => sum + value, 0);
  if (total > target && total > 0) {
    const ratio = target / total;
    for (let index = 0; index < widths.length; index++) widths[index] *= ratio;
  }
  total = widths.reduce((sum, value) => sum + value, 0);
  if (widths.length && total < target) widths[widths.length - 1] += target - total;
  return widths;
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, Math.min(radius, width / 2, height / 2));
}

function normalizeTables(tables: readonly TableSpec[]): Record<Corner, TableSpec[]> {
  const byId = new Map<string, TableSpec>();
  for (const table of tables || []) {
    if (!table?.id) continue;
    byId.set(table.id, table);
  }
  const buckets: Record<Corner, TableSpec[]> = { tl: [], tr: [], bl: [], br: [] };
  byId.forEach((table) => {
    const pos: Corner = CORNERS.includes(table.pos as Corner) ? table.pos as Corner : "tr";
    buckets[pos].push(table);
  });
  for (const corner of CORNERS) {
    buckets[corner].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  }
  return buckets;
}

function measureCard(
  ctx: CanvasRenderingContext2D,
  spec: TableSpec,
  pos: Corner,
  scale: number,
  maxCardWidth: number,
  maxCardHeight: number,
  fonts: SnapshotTableFonts,
): CardMetrics {
  const compact = !!spec.compact;
  const padX = (compact ? 6 : 8) * scale;
  const padY = (compact ? 4 : 8) * scale;
  const cellPad = (compact ? 3 : 4) * scale;
  const titleHeight = spec.title ? (compact ? 12 : 12.5) * scale : 0;
  const titleGap = spec.title ? (compact ? 2 : 4) * scale : 0;
  const hasHead = (spec.columns || []).some((column) => !!column.label);
  const headHeight = hasHead ? (compact ? 12.5 : 15.5) * scale : 0;
  const rowHeight = (compact ? 13.5 : 17) * scale;
  const footGap = spec.footnote ? 4 * scale : 0;
  const footLineHeight = 14 * scale;
  const columns = spec.columns || [];
  const rows = spec.rows || [];

  ctx.font = font(500, (compact ? 10 : 11) * scale, fonts.ui);
  const labelNatural = Math.max(
    34 * scale,
    ...rows.map((row) => textWidth(ctx, row.label || "") + 2 * cellPad),
  );
  const columnNatural = columns.map((column, columnIndex) => {
    ctx.font = font(700, 10 * scale, fonts.ui);
    let widest = textWidth(ctx, (column.label || "").toUpperCase());
    ctx.font = font(600, (compact ? 10 : 12.5) * scale, fonts.numeric);
    for (const row of rows) {
      const cell = (row.cells || [])[columnIndex];
      if (cell) widest = Math.max(widest, textWidth(ctx, cell.text || ""));
    }
    return Math.max(28 * scale, widest + 2 * cellPad);
  });

  ctx.font = font(700, 10 * scale, fonts.ui);
  const titleNatural = spec.title ? textWidth(ctx, spec.title.toUpperCase()) + 2 * cellPad : 0;
  ctx.font = font(500, 10 * scale, fonts.ui);
  const footNatural = spec.footnote ? textWidth(ctx, spec.footnote) + 2 * cellPad : 0;
  const tableNatural = labelNatural + columnNatural.reduce((sum, value) => sum + value, 0);
  const innerLimit = Math.max(1, maxCardWidth - 2 * padX);
  const innerWidth = Math.min(innerLimit, Math.max(tableNatural, titleNatural, footNatural));
  const fitted = fitColumns(
    [labelNatural, ...columnNatural],
    [20 * scale, ...columnNatural.map(() => 18 * scale)],
    innerWidth,
  );

  ctx.font = font(500, 10 * scale, fonts.ui);
  const footLines = spec.footnote
    ? wrapAnywhere(ctx, spec.footnote, Math.max(1, innerWidth - 2 * cellPad))
    : [];
  const naturalHeight =
    2 * padY +
    titleHeight + titleGap +
    headHeight +
    rows.length * rowHeight +
    footGap + footLines.length * footLineHeight;

  return {
    spec,
    pos,
    width: Math.min(maxCardWidth, innerWidth + 2 * padX),
    height: Math.min(maxCardHeight, naturalHeight),
    padX,
    padY,
    cellPad,
    titleHeight,
    titleGap,
    headHeight,
    rowHeight,
    footGap,
    footLineHeight,
    footLines,
    labelWidth: fitted[0] || 0,
    columnWidths: fitted.slice(1),
  };
}

function drawCard(
  ctx: CanvasRenderingContext2D,
  card: CardMetrics,
  x: number,
  y: number,
  scale: number,
  palette: SnapshotTablePalette,
  fonts: SnapshotTableFonts,
): void {
  const { spec } = card;
  const columns = spec.columns || [];
  const rows = spec.rows || [];
  const radius = 10 * scale;

  ctx.save();
  roundedRect(ctx, x, y, card.width, card.height, radius);
  ctx.clip();
  ctx.globalAlpha = CARD_OPACITY;
  ctx.fillStyle = palette.panel;
  ctx.fillRect(x, y, card.width, card.height);
  ctx.strokeStyle = palette.line;
  ctx.lineWidth = Math.max(1, scale);
  roundedRect(ctx, x + ctx.lineWidth / 2, y + ctx.lineWidth / 2, card.width - ctx.lineWidth, card.height - ctx.lineWidth, radius);
  ctx.stroke();

  let cursorY = y + card.padY;
  const innerX = x + card.padX;
  const innerWidth = card.width - 2 * card.padX;
  ctx.textBaseline = "middle";

  if (spec.title) {
    ctx.font = font(700, 10 * scale, fonts.ui);
    ctx.fillStyle = palette.muted;
    ctx.textAlign = "left";
    ctx.fillText(
      truncate(ctx, spec.title.toUpperCase(), Math.max(0, innerWidth - 2 * card.cellPad)),
      innerX + card.cellPad,
      cursorY + card.titleHeight / 2,
    );
    cursorY += card.titleHeight + card.titleGap;
  }

  if (card.headHeight) {
    let cellX = innerX + card.labelWidth;
    ctx.font = font(700, 10 * scale, fonts.ui);
    ctx.fillStyle = palette.textDim;
    for (let index = 0; index < columns.length; index++) {
      const width = card.columnWidths[index] || 0;
      const label = (columns[index].label || "").toUpperCase();
      ctx.textAlign = columns[index].num ? "right" : "left";
      const available = Math.max(0, width - 2 * card.cellPad);
      const tx = columns[index].num ? cellX + width - card.cellPad : cellX + card.cellPad;
      ctx.fillText(truncate(ctx, label, available), tx, cursorY + card.headHeight / 2);
      cellX += width;
    }
    cursorY += card.headHeight;
  }

  for (const row of rows) {
    const midY = cursorY + card.rowHeight / 2;
    ctx.globalAlpha = CARD_OPACITY;
    ctx.font = font(500, (spec.compact ? 10 : 11) * scale, fonts.ui);
    ctx.fillStyle = palette.text2;
    ctx.textAlign = "left";
    ctx.fillText(
      truncate(ctx, row.label || "", Math.max(0, card.labelWidth - 2 * card.cellPad)),
      innerX + card.cellPad,
      midY,
    );

    let cellX = innerX + card.labelWidth;
    for (let index = 0; index < columns.length; index++) {
      const width = card.columnWidths[index] || 0;
      const cell = (row.cells || [])[index];
      if (cell) {
        if (cell.bg) {
          ctx.globalAlpha = CARD_OPACITY * 0.14;
          ctx.fillStyle = cell.bg;
          roundedRect(
            ctx,
            cellX,
            cursorY + Math.max(1, scale),
            width,
            Math.max(0, card.rowHeight - 2 * Math.max(1, scale)),
            4 * scale,
          );
          ctx.fill();
          ctx.globalAlpha = CARD_OPACITY * 0.28;
          ctx.strokeStyle = cell.bg;
          ctx.lineWidth = Math.max(1, scale);
          ctx.stroke();
        }
        ctx.globalAlpha = CARD_OPACITY *
          (typeof cell.fade === "number" && cell.fade > 0 ? fadeOpacity(cell.fade) : 1);
        ctx.font = font(cell.bold ? 700 : 600, (spec.compact ? 10 : 12.5) * scale, fonts.numeric);
        ctx.fillStyle = cell.color || palette.text;
        ctx.textAlign = columns[index].num ? "right" : "left";
        const available = Math.max(0, width - 2 * card.cellPad);
        const tx = columns[index].num ? cellX + width - card.cellPad : cellX + card.cellPad;
        ctx.fillText(truncate(ctx, cell.text || "", available), tx, midY);
      }
      cellX += width;
    }
    cursorY += card.rowHeight;
  }

  if (spec.footnote && card.footLines.length) {
    cursorY += card.footGap;
    ctx.globalAlpha = CARD_OPACITY;
    ctx.font = font(500, 10 * scale, fonts.ui);
    ctx.fillStyle = palette.textDim;
    ctx.textAlign = "left";
    for (const line of card.footLines) {
      ctx.fillText(
        truncate(ctx, line, Math.max(0, innerWidth - 2 * card.cellPad)),
        innerX + card.cellPad,
        cursorY + card.footLineHeight / 2,
      );
      cursorY += card.footLineHeight;
    }
  }
  ctx.restore();
}

/**
 * Paint the DOM-backed ChartTables dashboards into a snapshot canvas.
 *
 * Dimensions and chartBodyTop are final output pixels. Style measurements are CSS pixels
 * multiplied by `scale`, so callers can pass the same DPR used for the rest of the snapshot.
 * The returned rects are useful for diagnostics and deterministic tests.
 */
export function paintSnapshotTables(
  ctx: CanvasRenderingContext2D,
  tables: readonly TableSpec[],
  options: SnapshotTablePaintOptions,
): SnapshotTableLayout[] {
  const outputWidth = Math.max(0, finite(options.outputWidth, 0));
  const outputHeight = Math.max(0, finite(options.outputHeight, 0));
  const scale = Math.max(0.1, finite(options.scale, 1));
  const chartBodyTop = clamp(finite(options.chartBodyTop, 0), 0, outputHeight);
  const bodyHeight = outputHeight - chartBodyTop;
  if (!ctx || !tables?.length || outputWidth <= 0 || bodyHeight <= 0) return [];

  const edge = 8 * scale;
  const cssWidth = outputWidth / scale;
  const gap = (cssWidth <= 860 ? 6 : 8) * scale;
  const topLeftClearance = (cssWidth <= 860 ? 30 : 64) * scale;
  const maxCardWidth = Math.max(
    1,
    Math.min(
      (cssWidth <= 860 ? Math.min(cssWidth * 0.56, 220) : 260) * scale,
      outputWidth - 2 * edge,
    ),
  );
  const maxCardHeight = Math.max(1, bodyHeight - 2 * edge);
  const buckets = normalizeTables(tables);
  const layouts: SnapshotTableLayout[] = [];

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, chartBodyTop, outputWidth, bodyHeight);
  ctx.clip();

  for (const corner of CORNERS) {
    const cards = buckets[corner].map((spec) =>
      measureCard(ctx, spec, corner, scale, maxCardWidth, maxCardHeight, options.fonts),
    );
    if (!cards.length) continue;
    const groupHeight = cards.reduce((sum, card) => sum + card.height, 0) + gap * (cards.length - 1);
    let y = corner[0] === "b"
      ? outputHeight - edge - groupHeight
      : chartBodyTop + (corner === "tl" ? topLeftClearance : edge);

    for (const card of cards) {
      const x = corner[1] === "r" ? outputWidth - edge - card.width : edge;
      layouts.push({ id: card.spec.id, pos: card.pos, x, y, width: card.width, height: card.height });
      drawCard(ctx, card, x, y, scale, options.palette, options.fonts);
      y += card.height + gap;
    }
  }

  ctx.restore();
  return layouts;
}
