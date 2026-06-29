// Pine v6 interpreter — executes the parsed AST bar-by-bar over an OHLC series, the way Pine
// actually runs. Series live as per-bar arrays; `var` persists across bars; `expr[n]` reads
// history; `ta.*` calls keep per-call-site state. User functions bind their params as ALIASES
// to the caller's series (so `_src[1]` inside a function reads the real history of the argument).
//
// Deliberately tolerant: any unimplemented namespace call (table.*, label.*, fill, bgcolor, …)
// is a no-op returning `na` rather than throwing, so a large real-world script still runs and
// plots whatever it can. See index.ts for the public surface and what's deferred (MTF, tables).
import { Node, Stmt, Arg, parse } from "./parser";
import { PineSyntaxError } from "./lexer";
import { NA, NS_CONST, toCss, fmtNum, tfSeconds } from "./builtins";

export interface Bar { time: string; o: number; h: number; l: number; c: number; v: number; }

export type PlotKind = "line" | "histogram" | "columns" | "area" | "circles" | "cross" | "stepline";
export interface PinePlot { id: number; title: string; kind: PlotKind; overlay: boolean; linewidth: number; color: string; data: { time: string; value: number; color?: string }[]; }
export interface PineShape { time: string; position: "aboveBar" | "belowBar" | "inBar"; shape: "arrowUp" | "arrowDown" | "circle" | "square"; color: string; text?: string; overlay: boolean; }
export interface PineHline { price: number; color: string; title: string; style: string; overlay: boolean; }
export interface PineInput { title: string; type: string; value: any; }
export interface PineMeta { title: string; shorttitle?: string; overlay: boolean; }
export interface RunResult { meta: PineMeta; plots: PinePlot[]; shapes: PineShape[]; hlines: PineHline[]; inputs: PineInput[]; warnings: string[]; barCount: number; }

const isNa = (x: any) => x == null || (typeof x === "number" && isNaN(x));
const truthy = (x: any): boolean => { if (isNa(x)) return false; if (typeof x === "boolean") return x; if (typeof x === "number") return x !== 0; if (typeof x === "string") return x.length > 0; return !!x; };
const num = (x: any): number => (typeof x === "number" ? x : typeof x === "boolean" ? (x ? 1 : 0) : NA);

const NOOP_NS = new Set(["table", "array", "matrix", "map", "label", "line", "box", "linefill", "polyline", "strategy", "alert", "log", "chart", "ticker", "runtime", "request", "input_enum"]);
const NAMESPACES = new Set(["ta", "math", "input", "color", "str", "request", "timeframe", "barstate", "syminfo", "plot", "shape", "location", "size", "hline", "line", "barmerge", "display", "format", "position", "xloc", "yloc", "extend", "text", "scale", "math", "dayofweek", "currency", "table", "array", "matrix", "map", "label", "box", "strategy", "alert", "log", "chart", "ticker", "runtime", "session", "adjustment"]);
const MARKER_SHAPE: Record<string, PineShape["shape"]> = { triangleup: "arrowUp", arrowup: "arrowUp", labelup: "arrowUp", flag: "arrowUp", triangledown: "arrowDown", arrowdown: "arrowDown", labeldown: "arrowDown", circle: "circle", xcross: "square", cross: "square", square: "square", diamond: "square" };

interface Frame { path: string; params: Map<string, ParamBinding>; localNames: Set<string>; }
interface ParamBinding { alias?: { name: string; frame: Frame | null }; constVal?: any; }
interface Ctx { i: number; frame: Frame | null; scalars: Map<string, number> | null; depth: number; }

export function run(source: string, bars: Bar[], opts: { timeframe?: string; symbol?: string; params?: Record<string, any> } = {}): RunResult {
  const { body } = parse(source);
  const N = bars.length;
  const chartTf = opts.timeframe || "1D";
  const symbol = opts.symbol || "SYM";
  const params = opts.params || {};

  const globals = new Map<string, any[]>();
  const globalVars = new Set<string>();
  const varInited = new Set<string>();          // var decls that have run their one-time init
  const localStore = new Map<string, any[]>();  // function locals/vars, keyed `path|name`
  const localVarInit = new Set<string>();
  const taState = new Map<string, any>();        // per-call-site state for ta.* and friends
  const histStore = new Map<number, any[]>();    // recorded history for non-identifier index bases
  const funcs = new Map<string, { params: string[]; body: Stmt[]; localNames: Set<string> }>();

  const meta: PineMeta = { title: "Script", overlay: false };
  const plotAcc = new Map<number, PinePlot & { lastColor: string }>();
  const hlineAcc = new Map<number, PineHline>();
  const shapes: PineShape[] = [];
  const inputs: PineInput[] = [];
  let collectInputs = true;   // inputs are constant across bars — record them only on bar 0
  const warnings: string[] = [];
  const warned = new Set<string>();
  const warn = (m: string) => { if (!warned.has(m)) { warned.add(m); warnings.push(m); } };
  const MAX_SHAPES = 3000;

  // ── hoist user function definitions (so calls can precede defs) ──
  const collectLocals = (stmts: Stmt[], acc: Set<string>) => {
    for (const s of stmts) {
      if (s.t === "assign" && s.op === "=") { if (typeof s.target === "string") acc.add(s.target); else s.target.forEach((n) => acc.add(n)); }
      else if (s.t === "seq") collectLocals(s.items, acc);
      else if (s.t === "expr") collectLocalsNode(s.e, acc);
    }
  };
  const collectLocalsNode = (n: Node, acc: Set<string>) => {
    if (n.t === "for") { acc.add(n.vn); collectLocals(n.body, acc); }
    else if (n.t === "if") { collectLocals(n.then, acc); n.elifs.forEach((e) => collectLocals(e.body, acc)); if (n.els) collectLocals(n.els, acc); }
  };
  for (const s of body) if (s.t === "func") { const ln = new Set<string>(); collectLocals(s.body, ln); funcs.set(s.name, { params: s.params, body: s.body, localNames: ln }); }

  // ── builtin scalar series ──
  const builtinSeries = (name: string, j: number): any => {
    if (j < 0 || j >= N) return NA;
    const b = bars[j];
    switch (name) {
      case "close": return b.c; case "open": return b.o; case "high": return b.h; case "low": return b.l; case "volume": return b.v;
      case "hl2": return (b.h + b.l) / 2; case "hlc3": return (b.h + b.l + b.c) / 3; case "ohlc4": return (b.o + b.h + b.l + b.c) / 4;
      case "hlcc4": return (b.h + b.l + b.c + b.c) / 4; case "bar_index": return j; case "last_bar_index": return N - 1;
      case "time": case "time_close": return Date.parse(b.time + "T00:00:00Z");
      default: return undefined;
    }
  };
  const isBuiltinSeries = (name: string) => builtinSeries(name, 0) !== undefined;

  // ── name resolution ──
  function resolveGet(ctx: Ctx, name: string, offset: number): any {
    if (ctx.scalars && ctx.scalars.has(name)) return offset > 0 ? NA : ctx.scalars.get(name); // loop var
    if (ctx.frame) {
      const pb = ctx.frame.params.get(name);
      if (pb) { if (pb.alias) { const sub: Ctx = { i: ctx.i, frame: pb.alias.frame, scalars: null, depth: ctx.depth }; return resolveGet(sub, pb.alias.name, offset); } return offset > 0 ? NA : pb.constVal; }
      if (ctx.frame.localNames.has(name)) { const arr = localStore.get(ctx.frame.path + "|" + name); if (arr) { const idx = ctx.i - offset; return idx >= 0 ? (arr[idx] !== undefined ? arr[idx] : NA) : NA; } return NA; }
    }
    const g = globals.get(name);
    if (g) { const idx = ctx.i - offset; return idx >= 0 ? (g[idx] !== undefined ? g[idx] : NA) : NA; }
    if (isBuiltinSeries(name)) return builtinSeries(name, ctx.i - offset);
    if (NAMESPACES.has(name)) return name;   // bare namespace ref (member access reads it)
    warn(`undefined variable '${name}' (treated as na)`);
    return NA;
  }

  function assignName(ctx: Ctx, name: string, value: any, isVar: boolean, declare: boolean) {
    if (ctx.frame && (declare ? true : ctx.frame.localNames.has(name) || ctx.frame.params.has(name))) {
      const key = ctx.frame.path + "|" + name;
      let arr = localStore.get(key); if (!arr) { arr = []; localStore.set(key, arr); }
      ctx.frame.localNames.add(name); arr[ctx.i] = value; return;
    }
    let arr = globals.get(name); if (!arr) { arr = []; globals.set(name, arr); }
    if (isVar) globalVars.add(name);
    arr[ctx.i] = value;
  }

  // ── expression evaluation ──
  function evalNode(n: Node, ctx: Ctx): any {
    switch (n.t) {
      case "num": return n.v;
      case "str": return n.v;
      case "color": return n.v;
      case "bool": return n.v;
      case "na": return NA;
      case "id": return resolveGet(ctx, n.name, 0);
      case "member": return evalMember(n, ctx);
      case "index": {
        const off = Math.round(num(evalNode(n.idx, ctx)));
        if (n.base.t === "id") return resolveGet(ctx, n.base.name, off);
        const hid = (n.base as any).hid;
        const val = evalNode(n.base, ctx);
        if (hid != null) { let h = histStore.get(hid); if (!h) { h = []; histStore.set(hid, h); } h[ctx.i] = val; const idx = ctx.i - off; return idx >= 0 && h[idx] !== undefined ? h[idx] : NA; }
        return off === 0 ? val : NA;
      }
      case "unary": {
        if (n.op === "not") return !truthy(evalNode(n.e, ctx));
        const v = num(evalNode(n.e, ctx)); return n.op === "-" ? -v : v;
      }
      case "binary": return evalBinary(n, ctx);
      case "ternary": return truthy(evalNode(n.c, ctx)) ? evalNode(n.a, ctx) : evalNode(n.b, ctx);
      case "tuple": return n.items.map((it) => evalNode(it, ctx));
      case "call": return evalCall(n, ctx);
      case "if": return evalIf(n, ctx);
      case "for": return evalFor(n, ctx);
    }
  }

  function evalBinary(n: Extract<Node, { t: "binary" }>, ctx: Ctx): any {
    const op = n.op;
    if (op === "and") return truthy(evalNode(n.l, ctx)) && truthy(evalNode(n.r, ctx));
    if (op === "or") return truthy(evalNode(n.l, ctx)) || truthy(evalNode(n.r, ctx));
    const a = evalNode(n.l, ctx), b = evalNode(n.r, ctx);
    if (op === "+") { if (typeof a === "string" || typeof b === "string") return (isNa(a) ? "na" : String(a)) + (isNa(b) ? "na" : String(b)); }
    switch (op) {
      case "==": return isNa(a) || isNa(b) ? false : a === b;
      case "!=": return isNa(a) || isNa(b) ? false : a !== b;
      case "<": return isNa(a) || isNa(b) ? false : num(a) < num(b);
      case "<=": return isNa(a) || isNa(b) ? false : num(a) <= num(b);
      case ">": return isNa(a) || isNa(b) ? false : num(a) > num(b);
      case ">=": return isNa(a) || isNa(b) ? false : num(a) >= num(b);
    }
    const x = num(a), y = num(b);
    if (isNaN(x) || isNaN(y)) return NA;
    switch (op) { case "+": return x + y; case "-": return x - y; case "*": return x * y; case "/": return y === 0 ? NA : x / y; case "%": return y === 0 ? NA : x % y; }
    return NA;
  }

  function evalMember(n: Extract<Node, { t: "member" }>, ctx: Ctx): any {
    if (n.obj.t === "id") {
      const ns = n.obj.name, prop = n.prop;
      if (ns === "timeframe") { if (prop === "period") return chartTf; if (prop === "multiplier") return parseInt(chartTf) || 1; if (prop === "isdaily") return /D$/.test(chartTf); if (prop === "isweekly") return /W$/.test(chartTf); if (prop === "ismonthly") return /M$/.test(chartTf); if (prop === "isintraday") return tfSeconds(chartTf) < 86400; return NA; }
      if (ns === "barstate") { if (prop === "islast" || prop === "islastconfirmedhistory") return ctx.i === N - 1; if (prop === "isfirst") return ctx.i === 0; if (prop === "ishistory") return ctx.i < N - 1; if (prop === "isrealtime") return false; if (prop === "isnew" || prop === "isconfirmed") return true; return false; }
      if (ns === "syminfo") { if (prop === "tickerid" || prop === "ticker") return symbol; if (prop === "mintick") return 0.01; if (prop === "pointvalue") return 1; if (prop === "type") return "stock"; if (prop === "currency") return "USD"; return ""; }
      if (ns === "bar_index") return ctx.i;
      const tbl = NS_CONST[ns]; if (tbl && prop in tbl) return tbl[prop];
      return NA;
    }
    return NA; // nested member as a value isn't modeled
  }

  // ── calls ──
  function evalArgs(args: Arg[], ctx: Ctx) {
    const pos: any[] = []; const named: Record<string, any> = {};
    for (const a of args) { const v = evalNode(a.value, ctx); if (a.name) named[a.name] = v; else pos.push(v); }
    return { pos, named };
  }
  const pick = (pos: any[], named: Record<string, any>, idx: number, name: string) => (named[name] !== undefined ? named[name] : pos[idx]);

  function evalCall(n: Extract<Node, { t: "call" }>, ctx: Ctx): any {
    const callee = n.callee;
    if (callee.t === "member" && callee.obj.t === "id") return callNs(callee.obj.name, callee.prop, n, ctx);
    if (callee.t === "id") { if (funcs.has(callee.name)) return callUser(callee.name, n, ctx); return callGlobal(callee.name, n, ctx); }
    warn("unsupported call form"); return NA;
  }

  function callUser(name: string, n: Extract<Node, { t: "call" }>, ctx: Ctx): any {
    if (ctx.depth > 60) { warn("call depth exceeded"); return NA; }
    const fn = funcs.get(name)!;
    const childPath = ctx.frame ? ctx.frame.path + "/" + n.id : "/" + n.id;
    const frame: Frame = { path: childPath, params: new Map(), localNames: new Set(fn.localNames), };
    fn.params.forEach((pn, idx) => {
      const argNode = n.args[idx]?.value;
      if (argNode && argNode.t === "id") frame.params.set(pn, { alias: { name: argNode.name, frame: ctx.frame } });
      else frame.params.set(pn, { constVal: argNode ? evalNode(argNode, ctx) : NA });
    });
    const sub: Ctx = { i: ctx.i, frame, scalars: null, depth: ctx.depth + 1 };
    return execBlock(fn.body, sub);
  }

  function callNs(ns: string, method: string, n: Extract<Node, { t: "call" }>, ctx: Ctx): any {
    if (ns === "request" && method === "security") {
      // single-timeframe build: evaluate the requested series on the CHART timeframe (a true
      // higher-timeframe resample is deferred — see index.ts). arg order: (sym, tf, expr, …)
      return n.args[2] ? evalNode(n.args[2].value, ctx) : NA;
    }
    const { pos, named } = evalArgs(n.args, ctx);
    switch (ns) {
      case "ta": return taDispatch(method, pos, n, ctx);
      case "math": return mathDispatch(method, pos);
      case "color":
        if (method === "new") return toCss(pos[0], num(pos[1]));
        if (method === "rgb") return `rgba(${num(pos[0]) | 0}, ${num(pos[1]) | 0}, ${num(pos[2]) | 0}, ${pos[3] != null ? (100 - num(pos[3])) / 100 : 1})`;
        if (method === "from_gradient") return toCss(pos[3] ?? pos[4]);
        return NA;
      case "str":
        if (method === "tostring") return fmtNum(num(pos[0]), pos[1]);
        if (method === "format") { let s = String(pos[0] ?? ""); for (let k = 1; k < pos.length; k++) s = s.replace(`{${k - 1}}`, isNa(pos[k]) ? "na" : String(pos[k])); return s; }
        if (method === "length") return String(pos[0] ?? "").length;
        if (method === "tonumber") return parseFloat(pos[0]);
        if (method === "contains") return String(pos[0]).includes(String(pos[1]));
        if (method === "upper") return String(pos[0]).toUpperCase();
        if (method === "lower") return String(pos[0]).toLowerCase();
        return "";
      case "input": return inputDispatch(method, pos, named);
      case "timeframe":
        if (method === "in_seconds") return tfSeconds(pos[0] != null ? String(pos[0]) : chartTf);
        if (method === "change") return false;
        return NA;
      case "plot": return NA;
      default:
        if (NOOP_NS.has(ns)) return NA;
        warn(`unsupported ${ns}.${method}() (na)`); return NA;
    }
  }

  function inputDispatch(method: string, pos: any[], named: Record<string, any>): any {
    const def = pos[0];
    const title = named.title !== undefined ? named.title : (typeof pos[1] === "string" ? pos[1] : method);
    if (collectInputs) inputs.push({ title: String(title), type: method, value: def }); // dedupe: first bar only
    return def;
  }

  function callGlobal(name: string, n: Extract<Node, { t: "call" }>, ctx: Ctx): any {
    if (name === "indicator" || name === "strategy") { const { pos, named } = evalArgs(n.args, ctx); meta.title = String(pick(pos, named, 0, "title") ?? meta.title); if (named.shorttitle) meta.shorttitle = String(named.shorttitle); const ov = pick(pos, named, -1, "overlay"); meta.overlay = ov !== undefined ? truthy(ov) : name === "strategy"; return NA; }
    if (name === "plot") return doPlot(n, ctx);
    if (name === "plotshape" || name === "plotchar" || name === "plotarrow") return doPlotshape(n, ctx, name);
    if (name === "hline") return doHline(n, ctx);
    if (name === "nz") { const { pos } = evalArgs(n.args, ctx); return isNa(pos[0]) ? (pos[1] !== undefined ? pos[1] : 0) : pos[0]; }
    if (name === "na") { const { pos } = evalArgs(n.args, ctx); return isNa(pos[0]); }
    if (name === "fixnan") { const { pos } = evalArgs(n.args, ctx); const key = "#fix" + n.id; const st = taState.get(key) || { last: NA }; if (!isNa(pos[0])) st.last = pos[0]; taState.set(key, st); return st.last; }
    if (name === "fill" || name === "bgcolor" || name === "barcolor" || name === "alertcondition" || name === "alert" || name === "bgColor") return NA;
    if (name === "input") { const { pos, named } = evalArgs(n.args, ctx); return inputDispatch(typeof pos[0] === "boolean" ? "bool" : typeof pos[0] === "string" ? "string" : "float", pos, named); }
    if (name === "timestamp") return NA;
    if (NOOP_NS.has(name)) return NA;
    warn(`unsupported function '${name}()' (na)`); return NA;
  }

  // ── plot / plotshape / hline collectors ──
  function planeOverlay(force: any): boolean { return truthy(force) || meta.overlay; }
  function doPlot(n: Extract<Node, { t: "call" }>, ctx: Ctx): any {
    const { pos, named } = evalArgs(n.args, ctx);
    let acc = plotAcc.get(n.id);
    if (!acc) {
      const style = String(named.style ?? "line");
      const kind: PlotKind = style === "histogram" ? "histogram" : style === "columns" ? "columns" : style === "area" ? "area" : style === "circles" ? "circles" : style === "cross" ? "cross" : style === "stepline" ? "stepline" : "line";
      acc = { id: n.id, title: String(pick(pos, named, 1, "title") ?? `Plot ${plotAcc.size + 1}`), kind, overlay: planeOverlay(named.force_overlay), linewidth: num(named.linewidth) || 1, color: "#787b86", data: [], lastColor: "#787b86" };
      plotAcc.set(n.id, acc);
    }
    const v = num(pos[0]);
    const colArg = named.color !== undefined ? named.color : pick(pos, named, 2, "color");
    const css = colArg !== undefined ? toCss(colArg) : acc.lastColor;
    if (!isNa(v) && isFinite(v)) { acc.data.push({ time: bars[ctx.i].time, value: v, color: css }); acc.lastColor = css; acc.color = css; }
    return { __plot: n.id };
  }
  function doPlotshape(n: Extract<Node, { t: "call" }>, ctx: Ctx, fn: string): any {
    const { pos, named } = evalArgs(n.args, ctx);
    if (shapes.length >= MAX_SHAPES) return NA;
    if (!truthy(pos[0])) return NA;
    const styleRaw = String(named.style ?? (fn === "plotarrow" ? "arrowup" : "circle"));
    const loc = String(named.location ?? "abovebar");
    const position: PineShape["position"] = loc === "belowbar" || loc === "bottom" ? "belowBar" : loc === "absolute" ? "inBar" : "aboveBar";
    shapes.push({ time: bars[ctx.i].time, position, shape: MARKER_SHAPE[styleRaw] || "circle", color: toCss(named.color ?? "#787b86"), text: named.text != null ? String(named.text) : undefined, overlay: planeOverlay(named.force_overlay) });
    return NA;
  }
  function doHline(n: Extract<Node, { t: "call" }>, ctx: Ctx): any {
    const { pos, named } = evalArgs(n.args, ctx);
    const price = num(pos[0]); if (isNa(price)) return NA;
    hlineAcc.set(n.id, { price, color: toCss(named.color ?? "#787b86"), title: String(pick(pos, named, 1, "title") ?? "hline"), style: String(named.linestyle ?? "solid"), overlay: meta.overlay });
    return { __hline: n.id };
  }

  // ── ta.* (stateful, keyed per call-site) ──
  function taState_(n: Node, ctx: Ctx, init: () => any): any { const key = (ctx.frame ? ctx.frame.path : "") + "#" + (n as any).id; let s = taState.get(key); if (s === undefined) { s = init(); taState.set(key, s); } return s; }
  function rollingPush(buf: number[], v: number, len: number) { buf.push(v); if (buf.length > len) buf.shift(); }
  function winMax(buf: number[]): number { let m = -Infinity, any = false; for (const x of buf) if (!isNaN(x)) { m = Math.max(m, x); any = true; } return any ? m : NA; }
  function winMin(buf: number[]): number { let m = Infinity, any = false; for (const x of buf) if (!isNaN(x)) { m = Math.min(m, x); any = true; } return any ? m : NA; }

  function taDispatch(method: string, pos: any[], n: Extract<Node, { t: "call" }>, ctx: Ctx): any {
    const src = num(pos[0]);
    switch (method) {
      case "sma": { const len = Math.round(num(pos[1])); const s = taState_(n, ctx, () => ({ buf: [] as number[], count: 0 })); rollingPush(s.buf, src, len); s.count++; if (s.count < len) return NA; let sum = 0; for (const x of s.buf) { if (isNaN(x)) return NA; sum += x; } return sum / len; }
      case "ema": case "rma": { const len = Math.round(num(pos[1])); const k = method === "rma" ? 1 / len : 2 / (len + 1); const s = taState_(n, ctx, () => ({ prev: NA })); if (isNaN(src)) return s.prev; s.prev = isNaN(s.prev) ? src : k * src + (1 - k) * s.prev; return s.prev; }
      case "wma": { const len = Math.round(num(pos[1])); const s = taState_(n, ctx, () => ({ buf: [] as number[] })); rollingPush(s.buf, src, len); if (s.buf.length < len) return NA; let wsum = 0, w = 0; for (let i = 0; i < len; i++) { if (isNaN(s.buf[i])) return NA; const wt = i + 1; wsum += s.buf[i] * wt; w += wt; } return wsum / w; }
      case "rsi": { const len = Math.round(num(pos[1])); const s = taState_(n, ctx, () => ({ prev: NA, ag: 0, al: 0, c: 0, seeded: false })); if (isNaN(src)) return NA; if (isNaN(s.prev)) { s.prev = src; return NA; } const ch = src - s.prev; s.prev = src; const up = ch > 0 ? ch : 0, dn = ch < 0 ? -ch : 0; s.c++; if (s.c <= len) { s.ag += up; s.al += dn; if (s.c === len) { s.ag /= len; s.al /= len; s.seeded = true; return s.al === 0 ? 100 : 100 - 100 / (1 + s.ag / s.al); } return NA; } s.ag = (s.ag * (len - 1) + up) / len; s.al = (s.al * (len - 1) + dn) / len; return s.al === 0 ? 100 : 100 - 100 / (1 + s.ag / s.al); }
      case "macd": { const fast = Math.round(num(pos[1])), slow = Math.round(num(pos[2])), sig = Math.round(num(pos[3])); const s = taState_(n, ctx, () => ({ ef: NA, es: NA, esig: NA })); const kf = 2 / (fast + 1), ks = 2 / (slow + 1), kg = 2 / (sig + 1); if (!isNaN(src)) { s.ef = isNaN(s.ef) ? src : kf * src + (1 - kf) * s.ef; s.es = isNaN(s.es) ? src : ks * src + (1 - ks) * s.es; } const macd = s.ef - s.es; if (!isNaN(macd)) s.esig = isNaN(s.esig) ? macd : kg * macd + (1 - kg) * s.esig; return [macd, s.esig, macd - s.esig]; }
      case "stoch": { const hi = num(pos[1]), lo = num(pos[2]), len = Math.round(num(pos[3])); const s = taState_(n, ctx, () => ({ hb: [] as number[], lb: [] as number[] })); rollingPush(s.hb, hi, len); rollingPush(s.lb, lo, len); if (s.hb.length < len) return NA; const hh = winMax(s.hb), ll = winMin(s.lb); const rng = hh - ll; return rng <= 0 ? 0 : (100 * (src - ll)) / rng; }
      case "crossover": case "crossunder": case "cross": { const a = src, b = num(pos[1]); const s = taState_(n, ctx, () => ({ pa: NA, pb: NA })); const pa = s.pa, pb = s.pb; s.pa = a; s.pb = b; if (isNaN(a) || isNaN(b) || isNaN(pa) || isNaN(pb)) return false; const over = pa <= pb && a > b, under = pa >= pb && a < b; return method === "crossover" ? over : method === "crossunder" ? under : over || under; }
      case "highest": { const r = highLow(pos, n, ctx); return r.max; }
      case "lowest": { const r = highLow(pos, n, ctx); return r.min; }
      case "highestbars": { const r = highLow(pos, n, ctx); return r.maxBar; }
      case "lowestbars": { const r = highLow(pos, n, ctx); return r.minBar; }
      case "change": case "mom": { const len = pos[1] != null ? Math.round(num(pos[1])) : 1; const s = taState_(n, ctx, () => ({ buf: [] as number[] })); s.buf.push(src); if (s.buf.length > len + 1) s.buf.shift(); if (s.buf.length < len + 1) return NA; const past = s.buf[0]; return isNaN(past) || isNaN(src) ? NA : src - past; }
      case "barssince": { const s = taState_(n, ctx, () => ({ c: NA as number })); if (truthy(pos[0])) s.c = 0; else if (!isNaN(s.c)) s.c++; return s.c; }
      case "sum": { const len = Math.round(num(pos[1])); const s = taState_(n, ctx, () => ({ buf: [] as number[] })); rollingPush(s.buf, src, len); if (s.buf.length < len) return NA; let sum = 0; for (const x of s.buf) { if (isNaN(x)) return NA; sum += x; } return sum; }
      case "stdev": case "dev": { const len = Math.round(num(pos[1])); const s = taState_(n, ctx, () => ({ buf: [] as number[] })); rollingPush(s.buf, src, len); if (s.buf.length < len) return NA; const bf = s.buf as number[]; const m = bf.reduce((x: number, y: number) => x + y, 0) / len; if (method === "dev") return bf.reduce((x: number, y: number) => x + Math.abs(y - m), 0) / len; return Math.sqrt(bf.reduce((x: number, y: number) => x + (y - m) ** 2, 0) / len); }
      case "tr": case "atr": { const s = taState_(n, ctx, () => ({ pc: NA, prev: NA, c: 0 })); const b = bars[ctx.i]; const tr = isNaN(s.pc) ? b.h - b.l : Math.max(b.h - b.l, Math.abs(b.h - s.pc), Math.abs(b.l - s.pc)); s.pc = b.c; if (method === "tr") return tr; const len = Math.round(num(pos[0])) || 14; const k = 1 / len; s.c++; s.prev = isNaN(s.prev) ? tr : k * tr + (1 - k) * s.prev; return s.c < len ? NA : s.prev; }
      case "cci": { const len = Math.round(num(pos[1])); const s = taState_(n, ctx, () => ({ buf: [] as number[] })); rollingPush(s.buf, src, len); if (s.buf.length < len) return NA; const bf = s.buf as number[]; const m = bf.reduce((x: number, y: number) => x + y, 0) / len; const md = bf.reduce((x: number, y: number) => x + Math.abs(y - m), 0) / len; return md === 0 ? 0 : (src - m) / (0.015 * md); }
      case "rising": case "falling": { const len = Math.round(num(pos[1])); const s = taState_(n, ctx, () => ({ buf: [] as number[] })); s.buf.push(src); if (s.buf.length > len + 1) s.buf.shift(); if (s.buf.length < len + 1) return false; for (let i = 1; i < s.buf.length; i++) { if (method === "rising" && !(s.buf[i] > s.buf[i - 1])) return false; if (method === "falling" && !(s.buf[i] < s.buf[i - 1])) return false; } return true; }
      case "valuewhen": { const s = taState_(n, ctx, () => ({ vals: [] as number[] })); if (truthy(pos[0])) s.vals.unshift(num(pos[1])); const occ = Math.round(num(pos[2])) || 0; return s.vals[occ] !== undefined ? s.vals[occ] : NA; }
      default: warn(`unsupported ta.${method}() (na)`); return NA;
    }
  }
  function highLow(pos: any[], n: Node, ctx: Ctx) {
    // ta.highest(src,len) or ta.highest(len) using high/low builtins
    let srcv: number, len: number;
    if (pos.length >= 2) { srcv = num(pos[0]); len = Math.round(num(pos[1])); } else { len = Math.round(num(pos[0])); srcv = NA; }
    const s = taState_(n, ctx, () => ({ hb: [] as number[], lb: [] as number[], c: 0 }));
    const hv = pos.length >= 2 ? srcv : bars[ctx.i].h;
    const lv = pos.length >= 2 ? srcv : bars[ctx.i].l;
    rollingPush(s.hb, hv, len); rollingPush(s.lb, lv, len); s.c++;
    if (s.c < len) return { max: NA, min: NA, maxBar: NA, minBar: NA };
    let max = -Infinity, min = Infinity, maxIdx = 0, minIdx = 0;
    for (let i = 0; i < s.hb.length; i++) { if (s.hb[i] >= max) { max = s.hb[i]; maxIdx = i; } if (s.lb[i] <= min) { min = s.lb[i]; minIdx = i; } }
    const last = s.hb.length - 1;
    return { max, min, maxBar: -(last - maxIdx), minBar: -(last - minIdx) };
  }

  function mathDispatch(method: string, pos: any[]): any {
    const a = num(pos[0]), b = num(pos[1]);
    switch (method) {
      case "abs": return Math.abs(a); case "max": { let m = -Infinity; for (const x of pos) { const v = num(x); if (isNaN(v)) return NA; m = Math.max(m, v); } return m; }
      case "min": { let m = Infinity; for (const x of pos) { const v = num(x); if (isNaN(v)) return NA; m = Math.min(m, v); } return m; }
      case "round": return pos[1] != null ? +a.toFixed(Math.round(b)) : Math.round(a); case "floor": return Math.floor(a); case "ceil": return Math.ceil(a);
      case "sqrt": return Math.sqrt(a); case "pow": return Math.pow(a, b); case "exp": return Math.exp(a); case "log": return Math.log(a); case "log10": return Math.log10(a);
      case "sign": return Math.sign(a); case "avg": { let s = 0, c = 0; for (const x of pos) { const v = num(x); if (!isNaN(v)) { s += v; c++; } } return c ? s / c : NA; }
      case "sum": return a + b; case "todegrees": return (a * 180) / Math.PI; case "toradians": return (a * Math.PI) / 180;
      case "round_to_mintick": return a; default: warn(`unsupported math.${method}() (na)`); return NA;
    }
  }

  // ── statements / blocks ──
  function execBlock(stmts: Stmt[], ctx: Ctx): any {
    let last: any = NA;
    for (const s of stmts) last = execStmt(s, ctx);
    return last;
  }
  function execStmt(s: Stmt, ctx: Ctx): any {
    if (s.t === "func") return NA; // hoisted already
    if (s.t === "seq") return execBlock(s.items, ctx);
    if (s.t === "expr") return evalNode(s.e, ctx);
    // assign
    if (s.op === "=" && s.isVar) {
      const key = ctx.frame ? ctx.frame.path + "|var|" + s.target : "var|" + String(s.target);
      const inited = ctx.frame ? localVarInit.has(key) : varInited.has(key);
      if (inited) { if (ctx.frame) ctx.frame.localNames.add(s.target as string); else globalVars.add(s.target as string); return resolveGet(ctx, s.target as string, 0); }
      if (ctx.frame) localVarInit.add(key); else varInited.add(key);
    }
    let val = evalNode(s.value, ctx);
    if (s.op === "=" && typeof s.target === "string" && isInputCall(s.value) && params[s.target] !== undefined) val = coerce(params[s.target], val);
    if (Array.isArray(s.target)) { const arr = Array.isArray(val) ? val : [val]; s.target.forEach((nm, k) => assignName(ctx, nm, arr[k], s.isVar, s.op === "=")); }
    else assignName(ctx, s.target, val, s.isVar, s.op === "=");
    return val;
  }

  function evalIf(n: Extract<Node, { t: "if" }>, ctx: Ctx): any {
    if (truthy(evalNode(n.cond, ctx))) return execBlock(n.then, ctx);
    for (const e of n.elifs) if (truthy(evalNode(e.cond, ctx))) return execBlock(e.body, ctx);
    if (n.els) return execBlock(n.els, ctx);
    return NA;
  }
  function evalFor(n: Extract<Node, { t: "for" }>, ctx: Ctx): any {
    const from = Math.round(num(evalNode(n.from, ctx))), to = Math.round(num(evalNode(n.to, ctx)));
    const step = n.step ? Math.round(num(evalNode(n.step, ctx))) : (to >= from ? 1 : -1);
    const scalars = ctx.scalars ? new Map(ctx.scalars) : new Map<string, number>();
    const sub: Ctx = { i: ctx.i, frame: ctx.frame, scalars, depth: ctx.depth };
    let last: any = NA, guard = 0;
    if (step === 0) return NA;
    for (let v = from; step > 0 ? v <= to : v >= to; v += step) { if (++guard > 100000) { warn("for-loop iteration cap hit"); break; } scalars.set(n.vn, v); last = execBlock(n.body, sub); }
    return last;
  }

  const isInputCall = (node: Node): boolean => node.t === "call" && ((node.callee.t === "member" && node.callee.obj.t === "id" && node.callee.obj.name === "input") || (node.callee.t === "id" && node.callee.name === "input"));
  const coerce = (p: any, def: any): any => (typeof def === "number" ? Number(p) : typeof def === "boolean" ? (typeof p === "boolean" ? p : p === "true" || p === 1) : p);

  // ── the bar loop ──
  for (let i = 0; i < N; i++) {
    const ctx: Ctx = { i, frame: null, scalars: null, depth: 0 };
    if (i > 0) for (const name of globalVars) { const arr = globals.get(name)!; if (arr[i] === undefined) arr[i] = arr[i - 1]; }
    execBlock(body, ctx);
    collectInputs = false;
  }

  const plots = [...plotAcc.values()].map(({ lastColor, ...p }) => p);
  return { meta, plots, shapes, hlines: [...hlineAcc.values()], inputs, warnings, barCount: N };
}
