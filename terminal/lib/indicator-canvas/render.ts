// IndicatorCanvas renderer — draws a SuiteRenderBundle's Prim[] into the chart's indicator SVG
// overlay. APPEND-ONLY: the caller clears the layer each frame (ChartPanel renderIndOverlays
// pattern); renderPrims builds everything in one DocumentFragment and appends once.
//
// Coordinate rules (for module authors):
//   • x = CoordMapper.xi(barIndex) — valid off-screen; XRef "right" = m.W. y = m.y(price).
//   • Culling: a prim whose entire x-extent falls outside [-40, m.W+40] px is skipped, as is any
//     prim with minPxPerBar > m.barW. Any null/NaN coordinate skips that prim (or that point,
//     for multi-point kinds — clouds/gradlines break the run and resume after the gap).
//   • Clamping: zone/bgshade rect x-edges are clamped to [-40, m.W+40]; line endpoints are
//     clamped to the same window with y linearly interpolated so the slope is preserved.
//   • Z-order: stable sort by (z ?? 0); "bgshade" is always forced behind everything else.
//   • Alpha clamps: zone fill ≤0.18, bgshade ≤0.10. NaN/Infinity numbers never render.
//   • Colors pass through verbatim (CSS var() tokens); alpha is applied via *-opacity
//     attributes, never by baking rgba() literals.
// Tooltips: elements carrying tooltipId get pointer-events:auto (the layer itself is none) and
// drive one shared ".ic-tip" HTML div inside the chart wrapper (svgEl.parentElement).

import type {
  Prim, ZonePrim, LinePrim, PolyPrim, CloudPrim, GradLinePrim, LabelPrim, MarkerPrim,
  ProfilePrim, BgShadePrim, XRef, CoordMapper, SuiteRenderBundle, TooltipDef,
} from "./types";

const NS = "http://www.w3.org/2000/svg";
const CULL_PAD = 40;

// -------------------------------------------------------------------------------- tiny helpers

function mk(tag: string, attrs: Record<string, string | number>): SVGElement {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, String(attrs[k]));
  return e;
}

function fin(v: number | null | undefined): v is number {
  return typeof v === "number" && isFinite(v);
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Width estimate without getBBox: ~0.62em per char (perf bar forbids layout reads). */
function estTextW(text: string, fs: number): number {
  return text.length * fs * 0.62;
}

/** Mostly digits/symbols → numeral font (tabular), else UI font. */
function fontFor(text: string): string {
  let numish = 0;
  for (let i = 0; i < text.length; i++) {
    if ("0123456789.,%+-−–:/$ ▲▼✓×".indexOf(text[i]) >= 0) numish++;
  }
  return numish >= text.length / 2 ? "var(--font-num)" : "var(--font-ui)";
}

function isCapsTag(text: string): boolean {
  return /[A-Z]/.test(text) && !/[a-z]/.test(text);
}

// ------------------------------------------------------------------------------ tooltip plumbing

/** Per-wrapper tooltip defs, refreshed by every renderPrims call. */
const TIP_DEFS = new WeakMap<HTMLElement, Map<string, TooltipDef>>();

/**
 * Create (once) the shared tooltip div inside the chart wrapper. Idempotent. The wrapper must be
 * a positioned element (chart wrappers are position:relative).
 */
export function ensureTooltipHost(wrap: HTMLElement): void {
  if (wrap.querySelector(":scope > .ic-tip")) return;
  const tip = document.createElement("div");
  tip.className = "ic-tip";
  tip.style.cssText =
    "position:absolute;left:0;top:0;display:none;z-index:6;pointer-events:none;max-width:260px;" +
    "background:var(--pop-bg,rgba(24,26,32,.96));border:1px solid var(--line-3);" +
    "border-radius:var(--r-md);padding:6px 9px;font:11px/1.45 var(--font-ui);color:var(--text);" +
    "white-space:nowrap;box-shadow:0 8px 24px rgba(0,0,0,.45)";
  wrap.appendChild(tip);
}

function fillTip(tip: HTMLElement, def: TooltipDef): void {
  while (tip.firstChild) tip.removeChild(tip.firstChild);
  const title = document.createElement("div");
  title.style.cssText = "font-weight:700;display:flex;align-items:center;gap:6px;margin-bottom:3px";
  if (def.accent) {
    const sw = document.createElement("span");
    sw.style.cssText = `width:8px;height:8px;border-radius:2px;flex:none;background:${def.accent}`;
    title.appendChild(sw);
  }
  title.appendChild(document.createTextNode(def.title));
  tip.appendChild(title);
  for (const r of def.rows) {
    const row = document.createElement("div");
    row.style.cssText = "display:flex;justify-content:space-between;gap:14px;font-size:10.5px";
    const k = document.createElement("span");
    k.style.color = "var(--muted)";
    k.textContent = r.k;
    const v = document.createElement("span");
    v.style.cssText =
      `font-family:var(--font-num);font-variant-numeric:tabular-nums;color:${r.color || "var(--text)"}`;
    v.textContent = r.v;
    row.appendChild(k); row.appendChild(v);
    tip.appendChild(row);
  }
}

function placeTip(tip: HTMLElement, wrap: HTMLElement, ev: MouseEvent): void {
  const wr = wrap.getBoundingClientRect();
  const tw = tip.offsetWidth, th = tip.offsetHeight;
  let x = ev.clientX - wr.left + 12, y = ev.clientY - wr.top + 14;
  if (x + tw > wr.width - 4) x = ev.clientX - wr.left - tw - 12;
  if (y + th > wr.height - 4) y = ev.clientY - wr.top - th - 10;
  tip.style.left = `${clamp(x, 4, Math.max(4, wr.width - tw - 4))}px`;
  tip.style.top = `${clamp(y, 4, Math.max(4, wr.height - th - 4))}px`;
}

/**
 * Wire an SVG element to the shared tooltip. Looks up the TooltipDef by id from the defs map the
 * last renderPrims call stored for this element's chart wrapper (renderPrims calls this itself
 * for every prim carrying a tooltipId — modules never need to).
 */
export function bindTooltip(el: Element, tooltipId: string): void {
  (el as SVGElement).setAttribute("pointer-events", "auto");
  (el as SVGElement).setAttribute("data-ic-tip", tooltipId);
  const onEnter = (ev: Event) => {
    const svg = el.closest("svg");
    const wrap = svg?.parentElement;
    if (!wrap) return;
    const def = TIP_DEFS.get(wrap)?.get(tooltipId);
    if (!def) return;
    ensureTooltipHost(wrap);
    const tip = wrap.querySelector(":scope > .ic-tip") as HTMLElement | null;
    if (!tip) return;
    fillTip(tip, def);
    tip.style.display = "block";
    placeTip(tip, wrap, ev as MouseEvent);
  };
  const onMove = (ev: Event) => {
    const wrap = el.closest("svg")?.parentElement;
    const tip = wrap?.querySelector(":scope > .ic-tip") as HTMLElement | null;
    if (wrap && tip && tip.style.display !== "none") placeTip(tip, wrap, ev as MouseEvent);
  };
  const onLeave = () => {
    const tip = el.closest("svg")?.parentElement?.querySelector(":scope > .ic-tip") as HTMLElement | null;
    if (tip) tip.style.display = "none";
  };
  el.addEventListener("mouseenter", onEnter);
  el.addEventListener("mousemove", onMove);
  el.addEventListener("mouseleave", onLeave);
}

// ---------------------------------------------------------------------------------- coordinates

function xOf(m: CoordMapper, i: XRef): number | null {
  if (i === "right") return m.W;
  const x = m.xi(i);
  return fin(x) ? x : null;
}

/** Entirely outside the padded viewport window → cull. */
function xVisible(m: CoordMapper, xa: number, xb: number): boolean {
  const lo = Math.min(xa, xb), hi = Math.max(xa, xb);
  return hi >= -CULL_PAD && lo <= m.W + CULL_PAD;
}

// ------------------------------------------------------------------------------- prim renderers

function drawZone(f: DocumentFragment, z: ZonePrim, m: CoordMapper): Element | null {
  const xa = xOf(m, z.i1), xb = xOf(m, z.i2);
  const ya = m.y(z.p1), yb = m.y(z.p2);
  if (!fin(xa) || !fin(xb) || !fin(ya) || !fin(yb)) return null;
  if (!xVisible(m, xa, xb)) return null;
  const x1 = clamp(Math.min(xa, xb), -CULL_PAD, m.W + CULL_PAD);
  const x2 = clamp(Math.max(xa, xb), -CULL_PAD, m.W + CULL_PAD);
  const y1 = Math.min(ya, yb), y2 = Math.max(ya, yb);
  const w = x2 - x1, h = y2 - y1;
  if (!(w > 0) || !(h >= 0)) return null;
  const g = mk("g", {});
  const rect = mk("rect", {
    x: x1, y: y1, width: w, height: Math.max(h, 0.5),
    fill: z.fill, "fill-opacity": clamp(z.fillAlpha ?? 0.10, 0, 0.18),
  });
  if (z.radius) rect.setAttribute("rx", String(z.radius));
  if (z.stroke && !z.edges) {
    rect.setAttribute("stroke", z.stroke);
    rect.setAttribute("stroke-width", String(z.strokeW ?? 1));
    if (z.dash) rect.setAttribute("stroke-dasharray", z.dash);
  }
  g.appendChild(rect);
  if (z.stroke && z.edges) {
    const seg: Record<string, [number, number, number, number]> = {
      top: [x1, y1, x2, y1], bottom: [x1, y2, x2, y2],
      left: [x1, y1, x1, y2], right: [x2, y1, x2, y2],
    };
    for (const e of z.edges) {
      const s = seg[e]; if (!s) continue;
      const ln = mk("line", {
        x1: s[0], y1: s[1], x2: s[2], y2: s[3],
        stroke: z.stroke, "stroke-width": z.strokeW ?? 1, "vector-effect": "non-scaling-stroke",
      });
      if (z.dash) ln.setAttribute("stroke-dasharray", z.dash);
      g.appendChild(ln);
    }
  }
  if (z.midline) {
    const ym = m.y((z.p1 + z.p2) / 2);
    if (fin(ym)) {
      g.appendChild(mk("line", {
        x1, y1: ym, x2, y2: ym,
        stroke: z.midline.color, "stroke-width": 1,
        "stroke-dasharray": z.midline.dash ?? "4 3", "vector-effect": "non-scaling-stroke",
      }));
    }
  }
  f.appendChild(g);
  return g;
}

function drawLine(f: DocumentFragment, l: LinePrim, m: CoordMapper): Element | null {
  const xa = xOf(m, l.a.i), xb = xOf(m, l.b.i);
  const ya = m.y(l.a.p), yb = m.y(l.b.p);
  if (!fin(xa) || !fin(xb) || !fin(ya) || !fin(yb)) return null;
  if (!xVisible(m, xa, xb)) return null;
  // Clamp x to the padded window, interpolating y so the slope survives the clamp.
  let X1 = xa, Y1 = ya, X2 = xb, Y2 = yb;
  const lo = -CULL_PAD, hi = m.W + CULL_PAD;
  if (X1 !== X2) {
    const slope = (Y2 - Y1) / (X2 - X1);
    const cl = (x: number, y: number, cx: number): [number, number] => [cx, y + (cx - x) * slope];
    if (X1 < lo) [X1, Y1] = cl(X1, Y1, lo); else if (X1 > hi) [X1, Y1] = cl(X1, Y1, hi);
    if (X2 < lo) [X2, Y2] = cl(X2, Y2, lo); else if (X2 > hi) [X2, Y2] = cl(X2, Y2, hi);
  }
  const ln = mk("line", {
    x1: X1, y1: Y1, x2: X2, y2: Y2,
    stroke: l.color, "stroke-width": l.w ?? 1, "vector-effect": "non-scaling-stroke",
  });
  if (l.dash) ln.setAttribute("stroke-dasharray", l.dash);
  if (l.alpha != null) ln.setAttribute("opacity", String(clamp(l.alpha, 0, 1)));
  f.appendChild(ln);
  return ln;
}

function drawPoly(f: DocumentFragment, p: PolyPrim, m: CoordMapper): Element | null {
  if (p.pts.length < 2) return null;
  let d = "", pen = false, minX = Infinity, maxX = -Infinity;
  for (const pt of p.pts) {
    const x = m.xi(pt.i), y = m.y(pt.p);
    if (!fin(x) || !fin(y)) { pen = false; continue; } // gap: break the path, resume after
    d += (pen ? "L" : "M") + `${x} ${y}`;
    pen = true;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
  }
  if (!d || !xVisible(m, minX, maxX)) return null;
  const path = mk("path", {
    d, fill: "none", stroke: p.color, "stroke-width": p.w ?? 1,
    "stroke-linejoin": "round", "vector-effect": "non-scaling-stroke",
  });
  if (p.dash) path.setAttribute("stroke-dasharray", p.dash);
  if (p.alpha != null) path.setAttribute("opacity", String(clamp(p.alpha, 0, 1)));
  f.appendChild(path);
  return path;
}

function drawCloud(f: DocumentFragment, c: CloudPrim, m: CoordMapper): Element | null {
  const n = Math.min(c.upper.length, c.lower.length);
  if (n < 2) return null;
  const alpha = clamp(c.fillAlpha ?? 0.12, 0, 0.5);
  const fallback = (c.segColors && c.segColors[0]) || "var(--brand-2)";
  const g = mk("g", {});
  // Precompute px points; null coords break color runs.
  const px: Array<[number, number, number] | null> = new Array(n);
  for (let i = 0; i < n; i++) {
    const x = m.xi(c.upper[i].i), yu = m.y(c.upper[i].p), yl = m.y(c.lower[i].p);
    px[i] = fin(x) && fin(yu) && fin(yl) ? [x, yu, yl] : null;
  }
  // Merge consecutive same-color segments into one polygon (node economy).
  let s = 0;
  while (s < n - 1) {
    if (!px[s]) { s++; continue; }
    const color = (c.segColors && c.segColors[s]) || fallback;
    let e = s + 1;
    while (
      e < n - 1 && px[e] &&
      ((c.segColors && c.segColors[e]) || fallback) === color
    ) e++;
    if (!px[e]) { s = e + 1; continue; } // run must end on a valid point
    const seg = px.slice(s, e + 1) as Array<[number, number, number]>;
    if (xVisible(m, seg[0][0], seg[seg.length - 1][0])) {
      let pts = "";
      for (let i = 0; i < seg.length; i++) pts += `${seg[i][0]},${seg[i][1]} `;
      for (let i = seg.length - 1; i >= 0; i--) pts += `${seg[i][0]},${seg[i][2]} `;
      g.appendChild(mk("polygon", { points: pts.trimEnd(), fill: color, "fill-opacity": alpha, stroke: "none" }));
    }
    s = e;
  }
  if (!g.firstChild) return null;
  f.appendChild(g);
  return g;
}

function drawGradLine(f: DocumentFragment, gl: GradLinePrim, m: CoordMapper): Element | null {
  const n = gl.pts.length;
  if (n < 2) return null;
  const fallback = gl.colors[0] || "var(--brand-2)";
  const g = mk("g", {});
  const px: Array<[number, number] | null> = new Array(n);
  for (let i = 0; i < n; i++) {
    const x = m.xi(gl.pts[i].i), y = m.y(gl.pts[i].p);
    px[i] = fin(x) && fin(y) ? [x, y] : null;
  }
  // Merge consecutive same-color segments into single <path>s.
  let s = 0;
  while (s < n - 1) {
    if (!px[s]) { s++; continue; }
    const color = gl.colors[s] || fallback;
    let e = s + 1;
    while (e < n - 1 && px[e] && (gl.colors[e] || fallback) === color) e++;
    if (!px[e]) { s = e + 1; continue; }
    const first = px[s] as [number, number], last = px[e] as [number, number];
    if (xVisible(m, first[0], last[0])) {
      let d = `M${first[0]} ${first[1]}`;
      for (let i = s + 1; i <= e; i++) { const p = px[i] as [number, number]; d += `L${p[0]} ${p[1]}`; }
      const glAttrs: Record<string, string | number> = {
        d, fill: "none", stroke: color, "stroke-width": gl.w ?? 1.5,
        "stroke-linejoin": "round", "stroke-linecap": "round", "vector-effect": "non-scaling-stroke",
      };
      if (gl.dash) glAttrs["stroke-dasharray"] = gl.dash;
      if (gl.alpha != null && gl.alpha < 1) glAttrs["stroke-opacity"] = Math.max(0, gl.alpha);
      g.appendChild(mk("path", glAttrs));
    }
    s = e;
  }
  if (!g.firstChild) return null;
  f.appendChild(g);
  return g;
}

function drawLabel(f: DocumentFragment, lb: LabelPrim, m: CoordMapper): Element | null {
  const x = xOf(m, lb.i), y = m.y(lb.p);
  if (!fin(x) || !fin(y) || !lb.text) return null;
  if (!xVisible(m, x, x)) return null;
  const fs = clamp(lb.fs ?? 10, 8, 20);
  const tw = estTextW(lb.text, fs);
  const padX = lb.style === "chip" ? 3 : lb.style === "bare" ? 0 : 6;
  const padY = lb.style === "chip" ? 3 : lb.style === "bare" ? 0 : 3;
  const bw = tw + padX * 2, bh = fs + padY * 2;
  const gap = 6;
  // Box center from placement, then user offsets.
  let cx = x, cy = y;
  switch (lb.place) {
    case "above": cy = y - gap - bh / 2; break;
    case "below": cy = y + gap + bh / 2; break;
    case "left": cx = x - gap - bw / 2; break;
    case "right": cx = x + gap + bw / 2; break;
    case "center": break;
  }
  cx += lb.dxPx ?? 0; cy += lb.dyPx ?? 0;
  const g = mk("g", {});
  if (lb.style !== "bare") {
    const bx = cx - bw / 2, by = cy - bh / 2;
    if (lb.style === "pill") {
      const bg = mk("rect", { x: bx, y: by, width: bw, height: bh, rx: bh / 2, fill: lb.bg ?? lb.color });
      if (!lb.bg) bg.setAttribute("fill-opacity", "0.14");
      g.appendChild(bg);
      if (lb.pointer && (lb.place === "above" || lb.place === "below")) {
        const dir = lb.place === "above" ? 1 : -1; // triangle points back at (i,p)
        const yEdge = cy + (bh / 2) * dir;
        g.appendChild(mk("path", {
          d: `M${cx - 4} ${yEdge}L${cx + 4} ${yEdge}L${cx} ${yEdge + 4 * dir}Z`,
          fill: lb.bg ?? lb.color, ...(lb.bg ? {} : { "fill-opacity": 0.14 }),
        }));
      }
    } else { // tag / chip — fin-tag formula in SVG
      if (lb.style === "chip") {
        g.appendChild(mk("rect", { x: bx, y: by, width: bw, height: bh, rx: 4, fill: "var(--panel-2)" }));
      }
      g.appendChild(mk("rect", {
        x: bx, y: by, width: bw, height: bh, rx: 4,
        fill: lb.color, "fill-opacity": 0.12,
        stroke: lb.color, "stroke-opacity": 0.30, "stroke-width": 1,
      }));
    }
  }
  const txt = mk("text", {
    x: cx, y: cy, "text-anchor": "middle", "dominant-baseline": "central",
    fill: lb.color, "font-size": fs, "font-weight": lb.bold ? 700 : 600,
    "font-family": fontFor(lb.text),
  }) as SVGTextElement;
  txt.style.fontVariantNumeric = "tabular-nums";
  if (isCapsTag(lb.text) && (lb.style === "tag" || lb.style === "chip")) {
    txt.setAttribute("letter-spacing", ".04em");
  }
  txt.textContent = lb.text;
  g.appendChild(txt);
  f.appendChild(g);
  return g;
}

function drawMarker(f: DocumentFragment, mk_: MarkerPrim, m: CoordMapper): Element | null {
  const x = m.xi(mk_.i), y = m.y(mk_.p);
  if (!fin(x) || !fin(y)) return null;
  if (!xVisible(m, x, x)) return null;
  let s = mk_.size ?? 5;
  if (m.barW < 4) s = Math.min(s, 3); // autoscale down when zoomed way out
  const fill = mk_.fill;
  const alpha = mk_.alpha != null ? clamp(mk_.alpha, 0, 1) : null;
  let el: SVGElement;
  switch (mk_.shape) {
    case "diamond":
      el = mk("path", { d: `M${x} ${y - s}L${x + s} ${y}L${x} ${y + s}L${x - s} ${y}Z`, fill });
      break;
    case "tri-up":
      el = mk("path", { d: `M${x} ${y - s}L${x + s} ${y + s}L${x - s} ${y + s}Z`, fill });
      break;
    case "tri-down":
      el = mk("path", { d: `M${x} ${y + s}L${x + s} ${y - s}L${x - s} ${y - s}Z`, fill });
      break;
    case "circle":
      el = mk("circle", { cx: x, cy: y, r: s, fill });
      break;
    case "square":
      el = mk("rect", { x: x - s, y: y - s, width: s * 2, height: s * 2, fill });
      break;
    case "x":
      el = mk("path", {
        d: `M${x - s} ${y - s}L${x + s} ${y + s}M${x + s} ${y - s}L${x - s} ${y + s}`,
        fill: "none", stroke: fill, "stroke-width": 1.5, "stroke-linecap": "round",
      });
      break;
    case "arrow-up":
      el = mk("path", {
        d: `M${x} ${y - s}L${x - s} ${y}M${x} ${y - s}L${x + s} ${y}M${x} ${y - s}L${x} ${y + s}`,
        fill: "none", stroke: fill, "stroke-width": 1.5, "stroke-linecap": "round", "stroke-linejoin": "round",
      });
      break;
    case "arrow-down":
      el = mk("path", {
        d: `M${x} ${y + s}L${x - s} ${y}M${x} ${y + s}L${x + s} ${y}M${x} ${y + s}L${x} ${y - s}`,
        fill: "none", stroke: fill, "stroke-width": 1.5, "stroke-linecap": "round", "stroke-linejoin": "round",
      });
      break;
    case "triple-lines": { // three 8px-wide lines stacked 3px apart (oscillator buy/sell)
      el = mk("path", {
        d: `M${x - 4} ${y - 3}H${x + 4}M${x - 4} ${y}H${x + 4}M${x - 4} ${y + 3}H${x + 4}`,
        fill: "none", stroke: fill, "stroke-width": 1.5, "stroke-linecap": "round",
      });
      break;
    }
    default:
      return null;
  }
  if (mk_.stroke && mk_.shape !== "x" && mk_.shape !== "arrow-up" && mk_.shape !== "arrow-down" && mk_.shape !== "triple-lines") {
    el.setAttribute("stroke", mk_.stroke);
    el.setAttribute("stroke-width", "1");
  }
  if (alpha != null) el.setAttribute("opacity", String(alpha));
  f.appendChild(el);
  return el;
}

function drawProfile(f: DocumentFragment, pr: ProfilePrim, m: CoordMapper): Element | null {
  const maxPx = pr.maxPx ?? 120;
  let anchorX: number, dir: 1 | -1, capPx = maxPx;
  if (pr.side === "right") {
    anchorX = m.W; dir = -1;
  } else {
    if (!pr.box) return null;
    const bx1 = xOf(m, pr.box.i1), bx2 = xOf(m, pr.box.i2);
    if (!fin(bx1) || !fin(bx2)) return null;
    if (!xVisible(m, bx1, bx2)) return null;
    anchorX = Math.min(bx1, bx2); dir = 1;
    capPx = Math.min(maxPx, Math.abs(bx2 - bx1)); // bars capped to box width
  }
  const g = mk("g", {});
  for (const bin of pr.bins) {
    if (!fin(bin.p1) || !fin(bin.p2) || !fin(bin.frac)) continue;
    const y1 = m.y(bin.p1), y2 = m.y(bin.p2);
    if (!fin(y1) || !fin(y2)) continue;
    const yT = Math.min(y1, y2), hRaw = Math.abs(y2 - y1);
    const h = hRaw > 2 ? hRaw - 1 : hRaw; // 1px gap between bins when there's room
    if (h <= 0) continue;
    const len = clamp(bin.frac, 0, 1) * capPx;
    if (len < 0.5) continue;
    const bx = dir === -1 ? anchorX - len : anchorX;
    g.appendChild(mk("rect", {
      x: bx, y: yT, width: len, height: h,
      fill: bin.color, "fill-opacity": bin.alpha != null ? clamp(bin.alpha, 0, 1) : 0.55,
    }));
    if (bin.overlayFrac != null && bin.overlayColor) {
      const oLen = clamp(bin.overlayFrac, 0, 1) * capPx;
      if (oLen >= 0.5) {
        const ox = dir === -1 ? anchorX - oLen : anchorX;
        g.appendChild(mk("rect", {
          x: ox, y: yT, width: oLen, height: h,
          fill: bin.overlayColor, "fill-opacity": 0.75,
        }));
      }
    }
    if (bin.label && h >= 8) {
      const tipX = dir === -1 ? anchorX - len - 3 : anchorX + len + 3;
      const txt = mk("text", {
        x: tipX, y: yT + h / 2,
        "text-anchor": dir === -1 ? "end" : "start", "dominant-baseline": "central",
        fill: "var(--muted)", "font-size": 8.5, "font-family": "var(--font-num)",
      }) as SVGTextElement;
      txt.style.fontVariantNumeric = "tabular-nums";
      txt.textContent = bin.label;
      g.appendChild(txt);
    }
  }
  if (!g.firstChild) return null;
  f.appendChild(g);
  return g;
}

function drawBgShade(f: DocumentFragment, b: BgShadePrim, m: CoordMapper): Element | null {
  const xa = xOf(m, b.i1), xb = xOf(m, b.i2);
  if (!fin(xa) || !fin(xb)) return null;
  if (!xVisible(m, xa, xb)) return null;
  const x1 = clamp(Math.min(xa, xb), -CULL_PAD, m.W + CULL_PAD);
  const x2 = clamp(Math.max(xa, xb), -CULL_PAD, m.W + CULL_PAD);
  if (x2 - x1 <= 0) return null;
  const rect = mk("rect", {
    x: x1, y: 0, width: x2 - x1, height: m.H,
    fill: b.color, "fill-opacity": clamp(b.alpha, 0, 0.10),
  });
  f.appendChild(rect);
  return rect;
}

// ------------------------------------------------------------------------------------ entry point

/**
 * Draw every prim in the bundle into svgEl. APPEND-ONLY — the caller clears the layer each frame.
 * Builds a DocumentFragment and appends once. Prims are stable-sorted by (z ?? 0) with bgshade
 * forced behind everything. Prims with tooltipId get pointer-events:auto and drive the shared
 * ".ic-tip" host inside svgEl's parent wrapper.
 */
export function renderPrims(svgEl: SVGSVGElement, bundle: SuiteRenderBundle, m: CoordMapper): void {
  const prims = bundle.prims;
  if (!prims.length) return;
  const wrap = svgEl.parentElement;
  if (wrap) {
    TIP_DEFS.set(wrap, bundle.tooltips);
    if (bundle.tooltips.size) ensureTooltipHost(wrap);
  }

  // Stable z-sort; bgshade always behind (Array.prototype.sort is spec-stable).
  const sorted = prims.slice().sort((a, b) => {
    const ba = a.kind === "bgshade" ? 0 : 1, bb = b.kind === "bgshade" ? 0 : 1;
    if (ba !== bb) return ba - bb;
    return (a.z ?? 0) - (b.z ?? 0);
  });

  const frag = document.createDocumentFragment();
  for (const p of sorted) {
    if (p.minPxPerBar != null && m.barW < p.minPxPerBar) continue; // density gate
    let el: Element | null = null;
    switch (p.kind) {
      case "bgshade": el = drawBgShade(frag, p, m); break;
      case "zone": el = drawZone(frag, p, m); break;
      case "cloud": el = drawCloud(frag, p, m); break;
      case "line": el = drawLine(frag, p, m); break;
      case "poly": el = drawPoly(frag, p, m); break;
      case "gradline": el = drawGradLine(frag, p, m); break;
      case "profile": el = drawProfile(frag, p, m); break;
      case "marker": el = drawMarker(frag, p, m); break;
      case "label": el = drawLabel(frag, p, m); break;
    }
    if (el) {
      const tid = (p as { tooltipId?: string }).tooltipId;
      if (tid && bundle.tooltips.has(tid)) bindTooltip(el, tid);
    }
  }
  svgEl.appendChild(frag);
}
