/**
 * Spot-check for the Pine → chart translate layer's assumptions (ChartPanel's buildAllPine path).
 * Run with: node terminal/components/__tests__/pineRender.test.mjs
 *
 * Unlike the other *.test.mjs (which inline pure logic), the Pine engine is a multi-file TS module
 * with extensionless imports, so we load it through jiti (already a dependency) rather than node's
 * type-stripping (which can't resolve `./parser`). We assert the exact RunResult shape ChartPanel's
 * render path depends on:
 *   • runPine(source, bars, opts) → { ok, errors, result }
 *   • result.meta.overlay              → routes to the price pane vs a sub-pane
 *   • result.plots[i].{kind,overlay,color,linewidth,data[{time,value,color?}]}  → series translation
 *   • result.inputs / params override  → the override key is the input's ASSIGNMENT VAR, not its title
 *   • compilePine returns line/col diagnostics for the editor console
 * If the engine's output shape ever drifts from these, this test fails loudly and the render path
 * (or the engine) must be fixed to match.
 */
import assert from "node:assert/strict";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { moduleCache: true });
const { runPine, compilePine } = await jiti.import("../../lib/pine-engine/index.ts");
const { SAMPLE_MACD } = await jiti.import("../../lib/pine.ts");

// synthetic daily bars ("YYYY-MM-DD" time keys, as the daily chart feeds the engine)
function synthBars(n = 80) {
  const bars = []; let p = 100;
  for (let i = 0; i < n; i++) {
    p += Math.sin(i / 5) * 2;
    const d = new Date(Date.UTC(2024, 0, 1 + i)).toISOString().slice(0, 10);
    bars.push({ time: d, o: p, h: p + 1, l: p - 1, c: p + 0.5, v: 1000 + i });
  }
  return bars;
}

let passed = 0;
const ok = (name, fn) => { fn(); passed++; console.log("  ✓", name); };

const bars = synthBars();

// ── 1. SAMPLE_MACD runs clean, is non-overlay, and yields 3 plots (2 line + 1 histogram) ──
const out = runPine(SAMPLE_MACD, bars, { timeframe: "1D", symbol: "TEST", params: {} });
ok("runPine SAMPLE_MACD is ok with no errors", () => {
  assert.equal(out.ok, true);
  assert.deepEqual(out.errors, []);
  assert.ok(out.result, "result present");
});
ok("meta.overlay=false → MACD routes to a sub-pane", () => {
  assert.equal(out.result.meta.overlay, false);
});
ok("plots: 3 total, kinds = [line, line, histogram], overlay=false, full data", () => {
  const plots = out.result.plots;
  assert.equal(plots.length, 3);
  assert.deepEqual(plots.map((p) => p.kind), ["line", "line", "histogram"]);
  for (const p of plots) {
    assert.equal(p.overlay, false, "each plot overlay=false");
    assert.equal(typeof p.color, "string");
    assert.ok(p.color.length > 0, "plot has a color the swatch/series reads");
    assert.equal(typeof p.linewidth, "number");
    assert.equal(p.data.length, bars.length, "one point per bar");
    // the render path filters non-finite; sample a mid-bar point's shape
    const pt = p.data[60];
    assert.equal(typeof pt.time, "string");
    assert.equal(typeof pt.value, "number");
  }
});
ok("histogram plot carries per-bar colors (HistogramSeries path)", () => {
  const hist = out.result.plots.find((p) => p.kind === "histogram");
  assert.ok(hist.data.some((d) => typeof d.color === "string" && d.color.length > 0), "at least one per-bar color");
});

// ── 2. inputs are title-keyed for DISPLAY, but the param OVERRIDE key is the assignment var ──
ok("inputs report the input TITLE (display) — 'Fast'/'Slow'/'Signal'", () => {
  const titles = out.result.inputs.map((i) => i.title);
  assert.deepEqual(titles, ["Fast", "Slow", "Signal"]);
});
ok("param override keys on the assignment VAR ('fast'), NOT the title ('Fast')", () => {
  const base = runPine(SAMPLE_MACD, bars, { params: {} }).result.plots[0].data[60].value;
  const byVar = runPine(SAMPLE_MACD, bars, { params: { fast: 5 } }).result.plots[0].data[60].value;
  const byTitle = runPine(SAMPLE_MACD, bars, { params: { Fast: 5 } }).result.plots[0].data[60].value;
  assert.notEqual(byVar, base, "overriding by var name changes the MACD math");
  assert.equal(byTitle, base, "overriding by title name is a no-op (confirms the key contract)");
  // → this is why the shell drives overrides + the Settings dialog from script.params (var-keyed),
  //   and never from result.inputs[].title.
});

// ── 3. overlay script: meta.overlay=true, hline + plotshape shapes surface for the price-pane path ──
const OV_SRC = [
  "//@version=6",
  'indicator("OV Test", overlay=true)',
  'len = input.int(20, "Length")',
  "basis = ta.sma(close, len)",
  "plot(basis, color=color.blue, linewidth=2)",
  'hline(0, "Zero")',
  "plotshape(ta.crossover(close, basis), style=shape.triangleup, location=location.belowbar, color=color.green)",
  "",
].join("\n");
const ov = runPine(OV_SRC, bars, { params: {} });
ok("overlay script: meta.overlay=true, plot overlay=true, hline + shapes present", () => {
  assert.equal(ov.ok, true);
  assert.equal(ov.result.meta.overlay, true);
  assert.equal(ov.result.plots.length, 1);
  assert.equal(ov.result.plots[0].overlay, true);
  assert.equal(ov.result.plots[0].linewidth, 2);
  assert.equal(ov.result.hlines.length, 1);
  assert.equal(ov.result.hlines[0].price, 0);
  assert.ok(ov.result.shapes.length >= 1, "at least one marker");
  const sh = ov.result.shapes[0];
  assert.ok(["aboveBar", "belowBar", "inBar"].includes(sh.position), "marker position is a LWC position");
  assert.ok(["arrowUp", "arrowDown", "circle", "square"].includes(sh.shape), "marker shape is a LWC shape");
});

// ── 4. compilePine surfaces line/col diagnostics for the editor console ──
ok("compilePine: clean source → ok:true, no errors", () => {
  const r = compilePine(SAMPLE_MACD);
  assert.equal(r.ok, true);
  assert.deepEqual(r.errors, []);
});
ok("compilePine: broken source → ok:false with a located error", () => {
  const r = compilePine('//@version=6\nindicator("X"\nplot(close)\n');   // unclosed paren
  assert.equal(r.ok, false);
  assert.ok(r.errors.length >= 1);
  const e = r.errors[0];
  assert.equal(typeof e.line, "number");
  assert.equal(typeof e.col, "number");
  assert.equal(typeof e.message, "string");
});

// ── 5. a throwing/garbage script never throws out of runPine (render path catches per-script) ──
ok("garbage source is reported via errors, never thrown", () => {
  const r = runPine("this is not (pine at all ][", bars, {});
  assert.equal(r.ok, false);
  assert.ok(r.errors.length >= 1);
  assert.equal(r.result, null);
});

console.log(`\npineRender: ${passed} checks passed`);
