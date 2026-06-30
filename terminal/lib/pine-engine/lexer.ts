// Pine v6 lexer — produces a token stream with explicit INDENT/DEDENT/NEWLINE tokens
// (Pine, like Python, is indentation-sensitive: function bodies and if/for blocks are
// indented). Newlines and indentation are suppressed while inside (), [] or {} so a call
// like indicator("…",\n   overlay=false) that wraps across lines reads as one logical line.

export type TokType = "num" | "str" | "color" | "id" | "op" | "newline" | "indent" | "dedent" | "eof";
export interface Tok { type: TokType; value: string; line: number; col: number; }

export class PineSyntaxError extends Error {
  constructor(message: string, public line: number, public col: number) { super(message); this.name = "PineSyntaxError"; }
}

// punctuation operators, longest first so := / == / => / <= / >= win over their prefixes
const OPS = ["==", "!=", "<=", ">=", ":=", "=>", "(", ")", "[", "]", "{", "}", ",", ".", ":", "?", "=", "+", "-", "*", "/", "%", "<", ">"];
const isIdStart = (c: string) => /[A-Za-z_]/.test(c);
const isIdPart = (c: string) => /[A-Za-z0-9_]/.test(c);
const isDigit = (c: string) => c >= "0" && c <= "9";
const isHex = (c: string) => /[0-9a-fA-F]/.test(c);

// tokens after which a line-ending newline is a continuation (the expression isn't finished)
// (note: `=>` is intentionally NOT here — `name() =>` ends a function header; its body follows
//  on the next, indented line.)
const CONT_AFTER = new Set(["+", "-", "*", "/", "%", "==", "!=", "<=", ">=", "<", ">", "=", ":=", "?", ":", "and", "or", "not"]);

// leading-operator continuation: a line whose first token is a binary/ternary operator continues the
// previous line (no valid Pine statement begins with one). `//` comment lines are excluded.
const LEADING_CONT = /^(==|!=|<=|>=|and\b|or\b|[-+*/%<>?:])/;
function startsWithContOp(text: string): boolean { const t = text.replace(/^[ \t]+/, ""); return t !== "" && !t.startsWith("//") && LEADING_CONT.test(t); }

export function lex(src: string): Tok[] {
  const out: Tok[] = [];
  const lines = src.split("\n");
  const indentStack: number[] = [0];
  let bracket = 0;             // depth of (), [], {} — newlines ignored while > 0
  let logicalToks: Tok[] = []; // tokens buffered for the current logical line
  let lineIndent = 0;          // indentation of the logical line's first physical line
  let starting = true;         // are we at the start of a new logical line?

  const flushLogical = () => {
    if (logicalToks.length === 0) { starting = true; return; }
    // emit INDENT / DEDENT before the line's content based on its leading indentation
    const top = indentStack[indentStack.length - 1];
    const ln = logicalToks[0].line, cl = logicalToks[0].col;
    if (lineIndent > top) { indentStack.push(lineIndent); out.push({ type: "indent", value: "", line: ln, col: cl }); }
    else if (lineIndent < top) {
      while (indentStack.length > 1 && indentStack[indentStack.length - 1] > lineIndent) {
        indentStack.pop(); out.push({ type: "dedent", value: "", line: ln, col: cl });
      }
      if (indentStack[indentStack.length - 1] !== lineIndent)
        throw new PineSyntaxError("inconsistent indentation", ln, cl);
    }
    for (const t of logicalToks) out.push(t);
    out.push({ type: "newline", value: "", line: logicalToks[logicalToks.length - 1].line, col: 0 });
    logicalToks = [];
    starting = true;
  };

  for (let li = 0; li < lines.length; li++) {
    const text = lines[li];
    const lineNo = li + 1;
    let col = 0;

    if (starting && bracket === 0) {
      // measure indentation (spaces/tabs) of a fresh logical line
      let ind = 0;
      while (col < text.length && (text[col] === " " || text[col] === "\t")) { ind += text[col] === "\t" ? 1 : 1; col++; }
      // blank or comment-only line — skip without affecting block structure
      const rest = text.slice(col);
      if (rest === "" || rest === "\r" || rest.startsWith("//")) continue;
      lineIndent = ind;
      starting = false;
    } else {
      // continuation line (inside brackets or after a continuing operator): skip leading ws
      while (col < text.length && (text[col] === " " || text[col] === "\t")) col++;
    }

    // tokenize the remainder of this physical line
    while (col < text.length) {
      const c = text[col];
      if (c === " " || c === "\t" || c === "\r") { col++; continue; }
      if (c === "/" && text[col + 1] === "/") break; // line comment

      // color literal #rrggbb or #rrggbbaa
      if (c === "#") {
        let j = col + 1, n = 0;
        while (j < text.length && isHex(text[j])) { j++; n++; }
        if (n === 3 || n === 6 || n === 8) { logicalToks.push({ type: "color", value: text.slice(col, j), line: lineNo, col: col + 1 }); col = j; continue; }
        throw new PineSyntaxError("malformed color literal", lineNo, col + 1);
      }
      // string literal — both "…" and '…'
      if (c === '"' || c === "'") {
        const quote = c; let j = col + 1, val = "";
        while (j < text.length && text[j] !== quote) {
          if (text[j] === "\\" && j + 1 < text.length) {
            const e = text[j + 1]; val += e === "n" ? "\n" : e === "t" ? "\t" : e; j += 2;
          } else { val += text[j]; j++; }
        }
        if (j >= text.length) throw new PineSyntaxError("unterminated string", lineNo, col + 1);
        logicalToks.push({ type: "str", value: val, line: lineNo, col: col + 1 }); col = j + 1; continue;
      }
      // number — 123, 1.5, .5, 1e6, 1.2e-3  (at most one '.', exponent only if real digits follow)
      if (isDigit(c) || (c === "." && isDigit(text[col + 1]))) {
        let j = col, seenDot = false;
        while (j < text.length && (isDigit(text[j]) || (text[j] === "." && !seenDot))) { if (text[j] === ".") seenDot = true; j++; }
        if (text[j] === "e" || text[j] === "E") { let k = j + 1; if (text[k] === "+" || text[k] === "-") k++; if (isDigit(text[k])) { j = k + 1; while (j < text.length && isDigit(text[j])) j++; } }
        logicalToks.push({ type: "num", value: text.slice(col, j), line: lineNo, col: col + 1 }); col = j; continue;
      }
      // identifier / keyword
      if (isIdStart(c)) {
        let j = col; while (j < text.length && isIdPart(text[j])) j++;
        logicalToks.push({ type: "id", value: text.slice(col, j), line: lineNo, col: col + 1 }); col = j; continue;
      }
      // operator / punctuation
      let matched = false;
      for (const o of OPS) {
        if (text.startsWith(o, col)) {
          if (o === "(" || o === "[" || o === "{") bracket++;
          else if (o === ")" || o === "]" || o === "}") bracket = Math.max(0, bracket - 1);
          logicalToks.push({ type: "op", value: o, line: lineNo, col: col + 1 }); col += o.length; matched = true; break;
        }
      }
      if (!matched) throw new PineSyntaxError(`unexpected character '${c}'`, lineNo, col + 1);
    }

    // end of physical line: continue the logical line if inside brackets, after a trailing operator,
    // or if the NEXT line begins with a binary/ternary operator (leading-operator wrap style)
    if (bracket > 0) continue;
    const last = logicalToks[logicalToks.length - 1];
    if (last && CONT_AFTER.has(last.value) && (last.type === "op" || last.type === "id")) continue;
    if (logicalToks.length && li + 1 < lines.length && startsWithContOp(lines[li + 1])) continue;
    flushLogical();
  }

  flushLogical();
  // close any open blocks at EOF
  while (indentStack.length > 1) { indentStack.pop(); out.push({ type: "dedent", value: "", line: lines.length, col: 0 }); }
  out.push({ type: "eof", value: "", line: lines.length, col: 0 });
  return out;
}
