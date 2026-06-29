// Pine v6 parser — turns the token stream into an AST. Recursive-descent statements +
// precedence-climbing expressions. Each call node gets a stable `id` (used by the interpreter
// to key per-call-site `ta.*` state); index bases that aren't plain identifiers get a `hid`
// (history id) so `expr[n]` history works for them too.
import { lex, Tok, PineSyntaxError } from "./lexer";

export type Node =
  | { t: "num"; v: number }
  | { t: "str"; v: string }
  | { t: "color"; v: string }
  | { t: "bool"; v: boolean }
  | { t: "na" }
  | { t: "id"; name: string; line: number }
  | { t: "member"; obj: Node; prop: string; hid?: number }
  | { t: "index"; base: Node; idx: Node }
  | { t: "call"; callee: Node; args: Arg[]; id: number; line: number; hid?: number }
  | { t: "unary"; op: string; e: Node }
  | { t: "binary"; op: string; l: Node; r: Node }
  | { t: "ternary"; c: Node; a: Node; b: Node }
  | { t: "tuple"; items: Node[]; hid?: number }
  | { t: "if"; cond: Node; then: Stmt[]; elifs: { cond: Node; body: Stmt[] }[]; els?: Stmt[] }
  | { t: "for"; vn: string; from: Node; to: Node; step?: Node; body: Stmt[] };

export interface Arg { name?: string; value: Node; }

export type Stmt =
  | { t: "assign"; target: string | string[]; isVar: boolean; op: "=" | ":="; value: Node; line: number }
  | { t: "func"; name: string; params: string[]; body: Stmt[]; line: number }
  | { t: "seq"; items: Stmt[]; line: number }   // `a = x, b = y` on one line
  | { t: "expr"; e: Node; line: number };

const TYPE_KW = new Set(["int", "float", "bool", "string", "color", "line", "label", "table", "box", "array", "matrix", "map", "linefill", "polyline", "chart", "const", "simple", "series"]);

export interface ParseResult { body: Stmt[]; callCount: number; histCount: number; }

export function parse(src: string): ParseResult {
  const toks = lex(src);
  let p = 0;
  let callId = 0, hid = 0;

  const peek = (o = 0) => toks[p + o];
  const at = (type: string, value?: string) => peek().type === type && (value === undefined || peek().value === value);
  const atId = (v: string) => peek().type === "id" && peek().value === v;
  const next = () => toks[p++];
  const err = (m: string): never => { const t = peek(); throw new PineSyntaxError(m, t.line, t.col); };
  const eat = (type: string, value?: string) => { if (!at(type, value)) err(`expected ${value ?? type} but got '${peek().value || peek().type}'`); return next(); };
  const skipNewlines = () => { while (at("newline")) next(); };

  function parseProgram(): Stmt[] {
    const body: Stmt[] = [];
    skipNewlines();
    while (!at("eof")) {
      if (at("indent") || at("dedent")) { next(); continue; } // defensive: shouldn't happen at top level
      body.push(parseStatement());
      skipNewlines();
    }
    return body;
  }

  // look ahead over the current logical line (to NEWLINE) for a top-level '=', ':=' or '=>'
  function classifyLine(): "assign" | "reassign" | "func" | "expr" {
    let depth = 0;
    for (let q = p; q < toks.length; q++) {
      const t = toks[q];
      if (t.type === "newline" || t.type === "eof") break;
      if (t.type === "op") {
        if (t.value === "(" || t.value === "[" || t.value === "{") depth++;
        else if (t.value === ")" || t.value === "]" || t.value === "}") depth--;
        else if (depth === 0) {
          if (t.value === "=>") return "func";
          if (t.value === "=") return "assign";
          if (t.value === ":=") return "reassign";
        }
      }
    }
    return "expr";
  }

  function parseStatement(): Stmt {
    if (atId("if")) return { t: "expr", e: parseIf(), line: peek().line };
    if (atId("for")) return { t: "expr", e: parseFor(), line: peek().line };
    const kind = classifyLine();
    if (kind === "func") return parseFunc();
    if (kind === "assign" || kind === "reassign") return parseAssign();
    const line = peek().line;
    const e = parseExpr();
    if (!at("eof")) eat("newline");
    return { t: "expr", e, line };
  }

  function parseAssign(): Stmt {
    const line = peek().line;
    const first = parseOneAssign();
    if (!at("op", ",")) { if (!at("eof")) eat("newline"); return first; }
    const items: Stmt[] = [first];
    while (at("op", ",")) { next(); items.push(parseOneAssign()); }
    if (!at("eof")) eat("newline");
    return { t: "seq", items, line };
  }

  // one `[var] [type] target op value` — without consuming the trailing newline
  function parseOneAssign(): Stmt {
    const line = peek().line;
    let isVar = false;
    if (atId("var") || atId("varip")) { isVar = true; next(); }
    let target: string | string[];
    if (at("op", "[")) {
      next(); const names: string[] = [];
      while (!at("op", "]")) { names.push(eat("id").value); if (at("op", ",")) next(); else break; }
      eat("op", "]"); target = names;
    } else {
      let first = eat("id").value;
      // typed decl:  <type> <name> =   (e.g. `float x = …`, `var bool armed = …`)
      if (TYPE_KW.has(first) && at("id")) first = eat("id").value;
      target = first;
    }
    const op = (at("op", ":=") ? eat("op", ":=") : eat("op", "=")).value as "=" | ":=";
    const value = parseExpr();
    return { t: "assign", target, isVar, op, value, line };
  }

  function parseFunc(): Stmt {
    const line = peek().line;
    const name = eat("id").value;
    eat("op", "(");
    const params: string[] = [];
    while (!at("op", ")")) {
      // params may carry a type prefix and/or a default — keep only the binding name
      let nm = eat("id").value;
      if (TYPE_KW.has(nm) && at("id")) nm = eat("id").value;
      if (at("op", "=")) { next(); parseExpr(); } // ignore default value
      params.push(nm);
      if (at("op", ",")) next(); else break;
    }
    eat("op", ")"); eat("op", "=>");
    let body: Stmt[];
    if (at("newline")) { eat("newline"); eat("indent"); body = parseBlock(); eat("dedent"); }
    else { const e = parseExpr(); if (!at("eof")) eat("newline"); body = [{ t: "expr", e, line }]; }
    return { t: "func", name, params, body, line };
  }

  function parseBlock(): Stmt[] {
    const body: Stmt[] = [];
    while (!at("dedent") && !at("eof")) {
      if (at("newline")) { next(); continue; }
      body.push(parseStatement());
    }
    return body;
  }

  function parseIf(): Node {
    eat("id", "if"); const cond = parseExpr();
    eat("newline"); eat("indent"); const then = parseBlock(); eat("dedent");
    const elifs: { cond: Node; body: Stmt[] }[] = []; let els: Stmt[] | undefined;
    while (atId("else")) {
      next();
      if (atId("if")) { next(); const c = parseExpr(); eat("newline"); eat("indent"); const b = parseBlock(); eat("dedent"); elifs.push({ cond: c, body: b }); }
      else { eat("newline"); eat("indent"); els = parseBlock(); eat("dedent"); break; }
    }
    return { t: "if", cond, then, elifs, els };
  }

  function parseFor(): Node {
    eat("id", "for"); const vn = eat("id").value; eat("op", "="); const from = parseExpr();
    eat("id", "to"); const to = parseExpr();
    let step: Node | undefined; if (atId("by")) { next(); step = parseExpr(); }
    eat("newline"); eat("indent"); const body = parseBlock(); eat("dedent");
    return { t: "for", vn, from, to, step, body };
  }

  // ── expressions ──
  function parseExpr(): Node { return parseTernary(); }
  function parseTernary(): Node {
    const c = parseOr();
    if (at("op", "?")) { next(); const a = parseTernary(); eat("op", ":"); const b = parseTernary(); return { t: "ternary", c, a, b }; }
    return c;
  }
  function parseOr(): Node { let l = parseAnd(); while (atId("or")) { next(); l = { t: "binary", op: "or", l, r: parseAnd() }; } return l; }
  function parseAnd(): Node { let l = parseNot(); while (atId("and")) { next(); l = { t: "binary", op: "and", l, r: parseNot() }; } return l; }
  function parseNot(): Node { if (atId("not")) { next(); return { t: "unary", op: "not", e: parseNot() }; } return parseCmp(); }
  function parseCmp(): Node {
    let l = parseAdd();
    while (at("op") && ["==", "!=", "<", "<=", ">", ">="].includes(peek().value)) { const op = next().value; l = { t: "binary", op, l, r: parseAdd() }; }
    return l;
  }
  function parseAdd(): Node { let l = parseMul(); while (at("op") && (peek().value === "+" || peek().value === "-")) { const op = next().value; l = { t: "binary", op, l, r: parseMul() }; } return l; }
  function parseMul(): Node { let l = parseUnary(); while (at("op") && ["*", "/", "%"].includes(peek().value)) { const op = next().value; l = { t: "binary", op, l, r: parseUnary() }; } return l; }
  function parseUnary(): Node { if (at("op") && (peek().value === "-" || peek().value === "+")) { const op = next().value; return { t: "unary", op, e: parseUnary() }; } return parsePostfix(); }

  function parsePostfix(): Node {
    let e = parsePrimary();
    for (;;) {
      if (at("op", ".")) { next(); const prop = eat("id").value; e = { t: "member", obj: e, prop }; }
      else if (at("op", "(")) { e = parseCall(e); }
      else if (at("op", "[")) {
        next(); const idx = parseExpr(); eat("op", "]");
        if (e.t !== "id") (e as any).hid = (e as any).hid ?? hid++;  // base needs recorded history
        e = { t: "index", base: e, idx };
      }
      else break;
    }
    return e;
  }

  function parseCall(callee: Node): Node {
    const line = peek().line; eat("op", "(");
    const args: Arg[] = [];
    while (!at("op", ")")) {
      if (at("id") && peek(1).type === "op" && peek(1).value === "=") { const name = next().value; next(); args.push({ name, value: parseExpr() }); }
      else args.push({ value: parseExpr() });
      if (at("op", ",")) next(); else break;
    }
    eat("op", ")");
    return { t: "call", callee, args, id: callId++, line };
  }

  function parsePrimary(): Node {
    const t = peek();
    if (t.type === "num") { next(); return { t: "num", v: parseFloat(t.value) }; }
    if (t.type === "str") { next(); return { t: "str", v: t.value }; }
    if (t.type === "color") { next(); return { t: "color", v: t.value }; }
    if (t.type === "id") {
      if (t.value === "true") { next(); return { t: "bool", v: true }; }
      if (t.value === "false") { next(); return { t: "bool", v: false }; }
      if (t.value === "na") { next(); return { t: "na" }; }
      if (t.value === "if") return parseIf();
      if (t.value === "for") return parseFor();
      next(); return { t: "id", name: t.value, line: t.line };
    }
    if (at("op", "(")) { next(); const e = parseExpr(); eat("op", ")"); return e; }
    if (at("op", "[")) {
      next(); const items: Node[] = [];
      while (!at("op", "]")) { items.push(parseExpr()); if (at("op", ",")) next(); else break; }
      eat("op", "]"); return { t: "tuple", items };
    }
    return err(`unexpected '${t.value || t.type}'`);
  }

  const body = parseProgram();
  return { body, callCount: callId, histCount: hid };
}
