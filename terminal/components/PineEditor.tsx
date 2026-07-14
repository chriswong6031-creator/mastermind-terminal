"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BrandLockup } from "@/components/BrandMark";
import { AppNav } from "@/components/AppNav";
import MobileNav from "@/components/MobileNav";
import { compilePine, runPine, type Bar, type PineError } from "@/lib/pine-engine";

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

// Full diagnostics pass: real parse errors first; if the script parses, dry-run it over the
// synthetic series to surface what a parse can't see — unsupported builtins land in warnings[]
// (previously collected by the engine but never shown: the script dead-charted while the editor
// said "Compiled"), and runaway loops abort via the engine's run budget into errors[]. The tight
// budgetMs keeps a hostile script's cost on the editor's UI thread to ~1s instead of the default 3s.
function diagnose(src: string, params: Record<string, any>): { errors: PineError[]; warnings: string[] } {
  const c = compilePine(src);
  if (!c.ok) return { errors: c.errors, warnings: [] };
  const r = runPine(src, SYNTH_BARS, { timeframe: "1D", symbol: "SYNTH", params, budgetMs: 1000 });
  return { errors: r.ok ? [] : r.errors, warnings: r.result?.warnings ?? [] };
}

export default function PineEditor({ scripts, isPro, email }: { scripts: Script[]; isPro: boolean; email: string }) {
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
    const id = window.setTimeout(() => { const d = diagnose(src, params); setDiag(d.errors); setWarns(d.warnings); }, 300);
    return () => window.clearTimeout(id);
  }, [src, params]);
  const hasErrors = diag.length > 0;

  // Run/compile button: kick an immediate (non-debounced) recompile with brief "Compiling…" feedback.
  function compile() { setStatus("compiling"); const d = diagnose(src, params); setDiag(d.errors); setWarns(d.warnings); window.setTimeout(() => setStatus("idle"), 300); }

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

  const head = (
    <>
      <MobileNav email={email} />
      <header className="topbar">
        <BrandLockup /><div className="tdiv" /><span className="page-title">Pine Editor</span>
        {active && (
          <span className="pair pophost" style={{ marginLeft: 14, cursor: scripts.length > 1 ? "pointer" : "default" }}
            onClick={(e) => { e.stopPropagation(); if (scripts.length > 1) setPicker((p) => !p); }}>
            <b style={{ fontSize: 13 }}>{active.name}</b>
            <svg className="car" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" /></svg>
            {picker && (
              <div className="pop show" style={{ top: 38, left: 0 }} onClick={(e) => e.stopPropagation()}>
                {scripts.map((s, i) => (
                  <div key={s.id} className="menu-row" onClick={() => { setIdx(i); setPicker(false); }}>
                    {s.locked && <span style={{ marginRight: 6, color: "var(--brand-2)" }} title="proprietary · read-only">🔒</span>}{s.name}{i === idx && <span style={{ marginLeft: "auto", color: "var(--brand-2)" }}>●</span>}
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
          title={isLocked ? "The proprietary flagship already backs the chart's built-in BUY/SELL signals — it can't be added as a separate script" : hasErrors ? "Fix compile errors before adding to the chart" : "Add this script to the chart"}>Add to chart</button>
        <form action="/auth/signout" method="post" style={{ marginLeft: 10 }}><button className="avatar" title={`${email} · sign out`}>{(email || "U")[0].toUpperCase()}</button></form>
      </header>
      <AppNav />
    </>
  );
  const foot = <div className="ticker"><span className="lbl">Pine Editor</span><span style={{ color: "var(--text-2)" }}>{scripts.length} saved script{scripts.length === 1 ? "" : "s"} · runs against your Polygon data · golden-gated vs the Python oracle</span></div>;

  if (!active) {
    return (
      <div className="app2 pine">
        {head}
        <div className="pine-main">
          <div className="editor-pane" style={{ alignItems: "center", justifyContent: "center" }}>
            <div className="strat-empty">No scripts yet.<br />Saved Pine indicators will appear here.</div>
          </div>
        </div>
        {foot}
      </div>
    );
  }

  return (
    <div className="app2 pine">
      {head}
      <div className="pine-main">
        <div className="editor-pane">
          <div className="editor-head">
            <span>{active.name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}.pine</span>
            <span className="badge">PINE v6</span>
            {isLocked && <span className="badge" style={{ borderColor: "var(--brand-2)", color: "var(--brand-2)" }} title="Proprietary — protected source, editing disabled">🔒 PROPRIETARY</span>}
            <div className="editor-actions">
              <button className="tbtn" title="Run / compile" onClick={compile}><svg viewBox="0 0 24 24" style={{ fill: "var(--up)", stroke: "none" }}><path d="M5 3l14 9-14 9V3z" /></svg></button>
            </div>
          </div>
          <div className="editor">
            <div className="gutter">{lines.map((_, i) => <div key={i}>{i + 1}</div>)}</div>
            <div className="code-wrap">
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
            <h4>My Scripts</h4>
            {scripts.map((s, i) => (
              <div key={s.id} className={`script-row${i === idx ? " on" : ""}`} onClick={() => setIdx(i)}>
                <span className="si">{s.lang === "pine" ? "ƒ" : "λ"}</span>
                <span className="meta"><span>{s.name}</span><small>{s.locked ? "proprietary · read-only" : `${s.lang} · edited ${new Date(s.updated_at).toLocaleDateString()}`}</small></span>
                {s.locked && <svg width="11" height="11" viewBox="0 0 24 24" style={{ marginLeft: "auto", fill: "var(--brand-2)" }} aria-label="locked"><path d="M12 1a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2h-1V6a5 5 0 0 0-5-5zm3 8H9V6a3 3 0 0 1 6 0z" /></svg>}
              </div>
            ))}
          </div>
          {!isPro && <div className="gate"><b>Pro feature.</b> Free accounts can read &amp; experiment with scripts; saving custom indicators &amp; adding the proprietary Mastermind suite to charts requires <b>Pro</b>.</div>}
          <div className="side-sec">
            <h4>Inputs</h4>
            {inputs.length === 0 && <div style={{ color: "var(--muted)", fontSize: 12 }}>No inputs.</div>}
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
      {foot}
    </div>
  );
}
