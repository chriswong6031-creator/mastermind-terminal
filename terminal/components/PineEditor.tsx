"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useT } from "@/lib/i18n";
import { useRouter, useSearchParams } from "next/navigation";
import { type Bar, type PineError } from "@/lib/pine-engine";
import { createPineHost, type PineHost } from "@/lib/pine-engine/host";

type Script = { id: string; name: string; source: string; lang: string; params: Record<string, any>; updated_at: string; locked?: boolean };

// lightweight Pine highlighter — single-pass tokenizer (string | comment | namespace.fn | keyword |
// number), so each token is classified exactly once. Gaps between tokens are HTML-escaped; strings &
// comments are matched FIRST so a // or digit inside them is never re-tokenized.
function esc(s: string) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
const TOKEN = /("(?:[^"\\]|\\.)*"?)|(\/\/.*)|\b(ta|math|request|input|str|array|color|shape|location|plot|syminfo)\.([A-Za-z_]\w*)|\b(indicator|strategy|input|plot|plotshape|and|or|not|true|false|if|else|for|var)\b|\b(\d+\.?\d*)\b/g;
function hl(line: string) {
  let out = "", last = 0, m: RegExpExecArray | null;
  TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(line)) !== null) {
    if (m.index > last) out += esc(line.slice(last, m.index));
    const [full, str, com, ns, fn, kw, num] = m;
    if (str != null) out += `<span class="st">${esc(str)}</span>`;
    else if (com != null) out += `<span class="cm">${esc(com)}</span>`;
    else if (ns != null) out += `<span class="fn">${esc(ns)}.${esc(fn)}</span>`;
    else if (kw != null) out += `<span class="kw">${kw}</span>`;
    else if (num != null) out += `<span class="nu">${num}</span>`;
    else out += esc(full);
    last = m.index + full.length;
    if (full.length === 0) TOKEN.lastIndex++;   // guard against a zero-width match looping
  }
  if (last < line.length) out += esc(line.slice(last));
  return out;
}

// Deterministic synthetic OHLC (~130 daily bars of a sine-on-drift walk) for the diagnostics
// dry-run below: enough history for typical ta.* lengths (14/20/50) to warm up, and grouping up
// to weekly/monthly still leaves bars for request.security. Deterministic so warnings don't
// flicker between recompiles.
const SYNTH_BARS: Bar[] = (() => {
  const out: Bar[] = []; let c = 100;
  const d0 = Date.UTC(2025, 0, 1);
  for (let i = 0; i < 130; i++) {
    const o = c; c = Math.max(5, c + Math.sin(i / 9) * 2 + Math.sin(i / 23) * 3 + 0.15);
    out.push({ time: new Date(d0 + i * 86400000).toISOString().slice(0, 10), o, h: Math.max(o, c) + 1.2, l: Math.min(o, c) - 1.2, c, v: 1_000_000 + (i % 7) * 50_000 });
  }
  return out;
})();

type Diag = { errors: PineError[]; warnings: string[] };

// Full diagnostics pass, now OFF the UI thread via the Pine host's Web Worker (host.compile for the
// authoritative parse errors that place the gutter/line markers, host.run for the dry-run warnings
// a parse can't see — unsupported builtins that would otherwise dead-chart while the editor said
// "Compiled"). Both go through the same host `slot` so a keystroke supersedes the previous in-flight
// diagnostics run (terminateable — a mid-type recompile cancels the previous one), and the per-run
// wall budget preempts a runaway. SSR/no-Worker falls back to a synchronous host transparently.
async function diagnose(host: PineHost, src: string, params: Record<string, any>): Promise<Diag> {
  const c = await host.compile(src);
  if (c.cancelled) return { errors: [], warnings: [] };
  if (!c.ok) return { errors: c.errors, warnings: [] };
  const r = await host.run({ slot: DIAG_SLOT, source: src, astId: c.astId ?? undefined, bars: SYNTH_BARS, inputs: params, opts: { timeframe: "1D", symbol: "SYNTH" }, budgetMs: 1000 });
  if (r.cancelled) return { errors: [], warnings: [] };
  return { errors: r.ok ? [] : r.errors, warnings: r.result?.warnings ?? [] };
}
const DIAG_SLOT = "@diag";   // shared supersession slot for editor diagnostics (compile + dry-run)

// Code-layer font metrics (must mirror .code / .code-wrap textarea in globals.css: 12.5px/1.65
// var(--font-code) — JetBrains Mono — 12px top pad, 14px left pad) so the error line-tint +
// column caret register exactly over the highlighted source. This is why the editor stays on
// --font-code and never --font-num: the caret math needs a fixed character advance.
const LINE_H = 12.5 * 1.65;        // px per line
const COL_W = 12.5 * 0.6;          // px per mono char (JetBrains Mono advance ≈ 0.6em)

export default function PineEditor({ scripts, isPro, email }: { scripts: Script[]; isPro: boolean; email: string }) {
  const t = useT();
  const router = useRouter();
  const searchParams = useSearchParams();
  // ?id=<scriptId> deep-links a specific script (from the terminal legend "Source code" / "Edit"); fall
  // back to the first script when absent or unknown.
  const initialIdx = (() => { const id = searchParams.get("id"); if (!id) return 0; const i = scripts.findIndex((s) => s.id === id); return i >= 0 ? i : 0; })();
  const [idx, setIdx] = useState(initialIdx);
  const active = scripts[idx];
  const [src, setSrc] = useState(active?.source || "");
  const [params, setParams] = useState<Record<string, any>>(active?.params || {});
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "compiling" | "err">("idle");
  const [picker, setPicker] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  // One Pine host (Web Worker in the browser, sync fallback under SSR/tests) for the editor's
  // lifetime — diagnostics run off the UI thread through it and it's torn down on unmount.
  const hostRef = useRef<PineHost | null>(null);
  if (hostRef.current === null) hostRef.current = createPineHost();
  useEffect(() => () => { hostRef.current?.dispose(); hostRef.current = null; }, []);

  // switching scripts resets the editable buffers to that script's stored source/params
  useEffect(() => { setSrc(active?.source || ""); setParams(active?.params || {}); setStatus("idle"); setPicker(false); }, [idx, active?.id]);
  // close the script picker on any outside click
  useEffect(() => { if (!picker) return; const close = () => setPicker(false); window.addEventListener("click", close); return () => window.removeEventListener("click", close); }, [picker]);

  const lines = useMemo(() => src.split("\n"), [src]);   // mirror the textarea 1:1 (incl. a trailing empty line)
  const inputs = Object.entries(params);
  const isLocked = !!active?.locked;   // proprietary indicator — viewable + runnable, never editable
  const dirty = !isLocked && !!active && (src !== active.source || JSON.stringify(params) !== JSON.stringify(active.params));

  // Real compile diagnostics via the Pine engine (parse errors + dry-run runtime warnings, see
  // diagnose() above), debounced ~300ms so we don't re-run on every keystroke.
  const [diag, setDiag] = useState<PineError[]>([]);
  const [warns, setWarns] = useState<string[]>([]);
  useEffect(() => {
    let alive = true;
    const id = window.setTimeout(() => {
      const host = hostRef.current; if (!host) return;
      diagnose(host, src, params).then((d) => { if (alive) { setDiag(d.errors); setWarns(d.warnings); } });
    }, 300);
    return () => { alive = false; window.clearTimeout(id); };
  }, [src, params]);
  const hasErrors = diag.length > 0;
  // First parse error, mapped to its 1-based line so the gutter/code layers can decorate it.
  const errAt = diag.find((e) => e.phase === "parse" && e.line > 0) ?? (diag[0]?.line ? diag[0] : null);
  const errLine = errAt?.line ?? 0;

  // Run/compile button: kick an immediate (non-debounced) recompile with brief "Compiling…" feedback.
  function compile() {
    const host = hostRef.current; if (!host) return;
    setStatus("compiling");
    diagnose(host, src, params).then((d) => { setDiag(d.errors); setWarns(d.warnings); window.setTimeout(() => setStatus("idle"), 300); });
  }

  // Save the current buffer. Returns the saved id (existing id on success, null on failure). Locked
  // scripts and non-Pro users can't save — but the proprietary/locked script is still addable to the
  // chart from its stable id (no save needed), handled in addToChart().
  async function save(): Promise<string | null> {
    if (!isPro || !active || isLocked) return null;
    setStatus("saving");
    const r = await fetch("/api/scripts/save", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: active.id, name: active.name, source: src, params }) }).catch(() => null);
    const ok = !!(r && r.ok);
    setStatus(ok ? "saved" : "err");
    setTimeout(() => setStatus("idle"), 2200);
    if (!ok) return null;
    try { const d = await r!.json(); return (d?.id as string) || active.id; } catch { return active.id; }
  }

  // "Add to chart": persist any dirty editable buffer first (so the terminal loads the latest source),
  // then deep-link the terminal with ?addScript=<id> (TerminalShell enables it on the active chart).
  // Disabled when the script has compile errors OR when the script is the locked/proprietary flagship:
  // that indicator lives only as a constant (never in saved_scripts / guest LS), so the terminal can't
  // resolve its id and would silently drop it from the chart — so we don't offer the action for it.
  async function addToChart() {
    if (!active || hasErrors || isLocked) return;
    let id = active.id;
    if (dirty) { const saved = await save(); if (!saved) return; id = saved; }
    router.push(`/terminal?addScript=${encodeURIComponent(id)}`);
  }

  function step(k: string, dir: 1 | -1) {
    setParams((p) => {
      const v = p[k];
      if (typeof v === "boolean") return { ...p, [k]: dir > 0 };
      if (typeof v === "number") return { ...p, [k]: Math.max(0, +(v + dir).toFixed(4)) };
      return p;
    });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (isLocked) return;
    if (e.key === "Tab") {
      e.preventDefault();
      const ta = e.currentTarget, s = ta.selectionStart, en = ta.selectionEnd;
      setSrc(src.slice(0, s) + "  " + src.slice(en));
      requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = s + 2; });
    }
  }

  // Content-only toolbar. The app chrome (BrandLockup / AppNav / MobileNav / lang
  // toggle) is now owned by AppShell (app/(shell)/layout.tsx); this bar keeps the
  // Pine-specific controls (script picker, Pro lock, Save, Add to chart) that used
  // to share the topbar and renders them inside .main2 per the shell doctrine.
  const head = (
    <>
      <header className="topbar pine-topbar">
        <span className="page-title">{t("peTitle")}</span>
        {active && (
          <span className="pair pophost" style={{ marginLeft: 14, cursor: scripts.length > 1 ? "pointer" : "default" }}
            onClick={(e) => { e.stopPropagation(); if (scripts.length > 1) setPicker((p) => !p); }}>
            <b style={{ fontSize: 13 }}>{active.name}</b>
            <svg className="car" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" /></svg>
            {picker && (
              <div className="pop show" style={{ top: 38, left: 0 }} onClick={(e) => e.stopPropagation()}>
                {scripts.map((s, i) => (
                  <div key={s.id} className="menu-row" onClick={() => { setIdx(i); setPicker(false); }}>
                    {s.locked && <span style={{ marginRight: 6, color: "var(--brand-2)" }} title={t("peReadOnly")}>🔒</span>}{s.name}{i === idx && <span style={{ marginLeft: "auto", color: "var(--brand-2)" }}>●</span>}
                  </div>
                ))}
              </div>
            )}
          </span>
        )}
        <div className="spacer" />
        {!isPro && !isLocked && <span className="lock"><svg width="11" height="11" viewBox="0 0 24 24" style={{ fill: "currentColor" }}><path d="M12 1a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2h-1V6a5 5 0 0 0-5-5zm3 8H9V6a3 3 0 0 1 6 0z" /></svg>Pro</span>}
        {isLocked ? (
          <span className="lock" style={{ marginLeft: 10 }} title="Proprietary Mastermind indicator — view & add to chart, editing is disabled">
            <svg width="11" height="11" viewBox="0 0 24 24" style={{ fill: "currentColor" }}><path d="M12 1a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2h-1V6a5 5 0 0 0-5-5zm3 8H9V6a3 3 0 0 1 6 0z" /></svg>Proprietary · read-only
          </span>
        ) : (
          <button className="btn btn-ghost" style={{ height: 32, marginLeft: 10 }} onClick={save} disabled={!isPro || !active}
            title={!isPro ? "Saving custom indicators requires Pro" : undefined}>
            {status === "saving" ? "Saving…" : status === "saved" ? "Saved ✓" : status === "err" ? "Error" : dirty ? "Save changes" : "Save"}
          </button>
        )}
        <button className="ai" style={{ marginLeft: 6 }} onClick={addToChart} disabled={!active || hasErrors || isLocked}
          title={isLocked ? t("peLockedAddTip") : hasErrors ? t("peFixErrorsTip") : t("peAddTip")}>{t("peAddToChart")}</button>
      </header>
    </>
  );

  if (!active) {
    return (
      <main className="main2 pine">
        {head}
        <div className="pine-main" style={{ flex: 1 }}>
          <div className="editor-pane" style={{ alignItems: "center", justifyContent: "center" }}>
            <div className="pine-empty">{t("peNoScripts")}<br />{t("peNoScriptsSub")}</div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="main2 pine">
      {head}
      <div className="pine-main" style={{ flex: 1 }}>
        <div className="editor-pane">
          <div className="editor-head">
            <span>{active.name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}.pine</span>
            <span className="badge">PINE v6</span>
            {isLocked && <span className="badge" style={{ borderColor: "var(--brand-2)", color: "var(--brand-2)" }} title={t("peProtected")}>🔒 {t("peProprietaryBadge")}</span>}
            <div className="editor-actions">
              <button className="tbtn" title={t("peRun")} onClick={compile}><svg viewBox="0 0 24 24" style={{ fill: "var(--up)", stroke: "none" }}><path d="M5 3l14 9-14 9V3z" /></svg></button>
            </div>
          </div>
          <div className="editor">
            {/* gutter: a red dot marks the errored line so the eye lands on it without reading the console */}
            <div className="gutter">{lines.map((_, i) => (
              <div key={i} style={errLine === i + 1 ? { position: "relative", color: "var(--down)" } : undefined}>
                {errLine === i + 1 && <span aria-hidden style={{ position: "absolute", left: -3, top: "50%", transform: "translateY(-50%)", width: 5, height: 5, borderRadius: "50%", background: "var(--down)" }} />}
                {i + 1}
              </div>
            ))}</div>
            <div className="code-wrap">
              {/* error decoration layer: a full-width line tint on the errored line + a column caret at
                  the reported col:line. LINE_H/COL_W mirror the .code font metrics (12.5px/1.65 mono,
                  14px left pad) so the markers register exactly over the highlighted code. */}
              {errLine > 0 && (
                <div aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 1 }}>
                  <div style={{ position: "absolute", left: 0, right: 0, top: 12 + (errLine - 1) * LINE_H, height: LINE_H, background: "rgba(var(--down-rgb),.10)", borderLeft: "2px solid var(--down)" }} />
                  {errAt && errAt.col > 0 && (
                    <div style={{ position: "absolute", top: 12 + (errLine - 1) * LINE_H + LINE_H - 3, left: 14 + Math.max(0, errAt.col - 1) * COL_W, width: COL_W + 2, height: 2, background: "var(--down)", boxShadow: "0 0 0 1px rgba(var(--down-rgb),.35)" }} />
                  )}
                </div>
              )}
              <div className="code">{lines.map((ln, i) => <div key={i} dangerouslySetInnerHTML={{ __html: hl(ln) || "&nbsp;" }} />)}</div>
              <textarea ref={taRef} value={src} spellCheck={false} aria-label={`${active.name} source`} readOnly={isLocked}
                onChange={(e) => { if (!isLocked) setSrc(e.target.value); }} onKeyDown={onKeyDown} />
            </div>
          </div>
          <div className="console">
            {status === "compiling" ? (
              <div><span className="k">Compiling {active.name}…</span></div>
            ) : hasErrors ? (
              <>
                <div><span style={{ color: "var(--down)" }}>✗ {diag.length} error{diag.length === 1 ? "" : "s"}</span> <span className="k">· {lines.length} lines</span></div>
                {diag.map((e, i) => (
                  <div key={i}><span style={{ color: "var(--down)" }}>{e.line ? `line ${e.line}${e.col ? `:${e.col}` : ""}` : e.phase}</span> <span className="k">· {e.message}</span></div>
                ))}
              </>
            ) : (
              <>
                {warns.length > 0 ? (
                  // engine warnings (unsupported builtins etc.) — the script runs but affected series are na
                  <>
                    <div><span style={{ color: "var(--warn)" }}>✓ Compiled with {warns.length} warning{warns.length === 1 ? "" : "s"}</span> <span className="k">· {lines.length} lines, 0 errors{dirty ? " · unsaved changes" : ""}</span></div>
                    {warns.map((w, i) => (
                      <div key={i}><span style={{ color: "var(--warn)" }}>warn</span> <span className="k">· {w}</span></div>
                    ))}
                  </>
                ) : (
                  <div><span className="ok">✓ Compiled successfully</span> <span className="k">· {lines.length} lines, 0 errors{dirty ? " · unsaved changes" : ""}</span></div>
                )}
                <div><span className="k">{active.name} · {inputs.length} input{inputs.length === 1 ? "" : "s"} · ready to add to chart</span></div>
              </>
            )}
          </div>
        </div>
        <div className="pine-side">
          <div className="side-sec">
            <h4>{t("peMyScripts")}</h4>
            {scripts.map((s, i) => (
              <div key={s.id} className={`script-row${i === idx ? " on" : ""}`} onClick={() => setIdx(i)}>
                <span className="si">{s.lang === "pine" ? "ƒ" : "λ"}</span>
                <span className="meta"><span>{s.name}</span><small>{s.locked ? "proprietary · read-only" : `${s.lang} · edited ${new Date(s.updated_at).toLocaleDateString()}`}</small></span>
                {s.locked && <svg width="11" height="11" viewBox="0 0 24 24" style={{ marginLeft: "auto", fill: "var(--brand-2)" }} aria-label="locked"><path d="M12 1a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2h-1V6a5 5 0 0 0-5-5zm3 8H9V6a3 3 0 0 1 6 0z" /></svg>}
              </div>
            ))}
          </div>
          {!isPro && <div className="gate"><b>{t("peProFeature")}</b> {t("peProGateBody")} <b>Pro</b>.</div>}
          <div className="side-sec">
            <h4>Inputs</h4>
            {inputs.length === 0 && <div style={{ color: "var(--muted)", fontSize: 12 }}>{t("peNoInputs")}</div>}
            {inputs.map(([k]) => (
              <div key={k} className="inp-row"><span>{k}</span>
                <span className="stepper">
                  <button onClick={() => step(k, -1)} aria-label={`decrease ${k}`}>−</button>
                  <b>{String(params[k])}</b>
                  <button onClick={() => step(k, 1)} aria-label={`increase ${k}`}>+</button>
                </span></div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
