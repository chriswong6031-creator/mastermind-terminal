"use client";
import { useEffect, useRef, useState } from "react";
import { mdToHtml } from "@/lib/md";
import { useLang, useT } from "@/lib/i18n";

type Row = { name: string; last: number; chg: number; verdict: string | null; wr: number | null; pf: number | null; cagr: number | null; regimeBull: boolean | null };
type Step = { tool: string; args: any };
type Msg = { role: "user" | "assistant"; content: string; steps?: Step[] };
const isBuy = (v: string | null) => v === "BUY" || v === "REBUY";

export default function CopilotPanel({ open, symbol, row, onClose, onAnnotate }:
  { open: boolean; symbol: string; row: Row | undefined; onClose: () => void; onAnnotate?: (symbol: string, annotations: any[]) => void }) {
  const t = useT();
  const { lang } = useLang();
  const zh = lang === "zh";
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const reqRef = useRef(0);              // request generation — invalidates in-flight streams
  const acRef = useRef<AbortController | null>(null);

  // symbol change / close / unmount: abort any in-flight stream and reset
  useEffect(() => { setMsgs([]); reqRef.current++; acRef.current?.abort(); setBusy(false); }, [symbol]);
  useEffect(() => { if (!open) { reqRef.current++; acRef.current?.abort(); } }, [open]);
  // floating, non-modal panel: dismiss on Escape or an outside click. The outside-click listener is added
  // on the next tick so the very click that opened the panel doesn't immediately close it again.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    const onDown = (e: MouseEvent) => { const el = panelRef.current; if (el && !el.contains(e.target as Node)) onClose(); };
    window.addEventListener("keydown", onKey);
    const id = window.setTimeout(() => window.addEventListener("mousedown", onDown), 0);
    return () => { window.removeEventListener("keydown", onKey); window.clearTimeout(id); window.removeEventListener("mousedown", onDown); };
  }, [open, onClose]);
  useEffect(() => () => { reqRef.current++; acRef.current?.abort(); }, []);
  // sticky-bottom autoscroll: only follow if the user is already near the bottom
  useEffect(() => { const el = bodyRef.current; if (!el) return; if (el.scrollHeight - el.scrollTop - el.clientHeight < 60) el.scrollTop = el.scrollHeight; }, [msgs, busy]);

  async function send(text: string) {
    const txt = text.trim(); if (!txt || busy) return; setInput("");
    const next: Msg[] = [...msgs, { role: "user", content: txt }];
    setMsgs(next); setBusy(true);
    const my = ++reqRef.current; acRef.current?.abort(); const ac = new AbortController(); acRef.current = ac;
    const apply = (fn: (l: Msg) => Msg) => setMsgs((m) => { if (!m.length) return m; const c = [...m]; c[c.length - 1] = fn(c[c.length - 1]); return c; });
    try {
      const lang = (typeof document !== "undefined" && document.documentElement.getAttribute("data-lang")) || "en";
      const r = await fetch("/api/copilot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbol, lang, messages: next.map((m) => ({ role: m.role, content: m.content })) }), signal: ac.signal });
      if (reqRef.current !== my) return;
      const ct = r.headers.get("content-type") || "";
      if (!r.body || !ct.includes("event-stream")) { const d = await r.json(); if (reqRef.current === my) setMsgs((m) => [...m, { role: "assistant", content: d.reply || "(no reply)", steps: d.steps }]); return; }
      setMsgs((m) => [...m, { role: "assistant", content: "", steps: [] }]);
      const reader = r.body.getReader(); const dec = new TextDecoder(); let buf = "";
      for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        if (reqRef.current !== my) { try { reader.cancel(); } catch {} break; }
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n"); buf = lines.pop() || "";
        for (const line of lines) {
          const s = line.trim(); if (!s.startsWith("data:")) continue;
          const data = s.slice(5).trim(); if (!data) continue;
          let j: any; try { j = JSON.parse(data); } catch { continue; }
          if (j.type === "token") apply((l) => ({ ...l, content: l.content + j.text }));
          else if (j.type === "step") apply((l) => ({ ...l, steps: [...(l.steps || []), { tool: j.tool, args: j.args }] }));
          else if (j.type === "annotate") onAnnotate?.(j.symbol || symbol, j.annotations || []);
          else if (j.type === "error") apply((l) => ({ ...l, content: l.content + (l.content ? "\n\n" : "") + "_" + j.message + "_" }));
        }
      }
    } catch {
      if (reqRef.current === my && !ac.signal.aborted) setMsgs((m) => [...m, { role: "assistant", content: t("copilotUnavailable") }]);
    } finally { if (reqRef.current === my) setBusy(false); }
  }

  const v = row?.verdict || "—"; const buy = isBuy(v); const up = (row?.chg ?? 0) >= 0;
  const rowName = (row as any)?.zh || row?.name || symbol;
  const suggestions = [
    t("sugWhyVerdict").replace("{sym}", symbol).replace("{v}", v),
    t("sugMarkSR"),
    t("sugBacktest"),
    t("sugFindBuys"),
  ];

  return (
    <aside ref={panelRef} className={`copilot${open ? " open" : ""}`}>
      <div className="ch">
        <span className="mk"><svg viewBox="0 0 24 24"><path d="M12 2l2.2 5.8L20 10l-5.8 2.2L12 18l-2.2-5.8L4 10l5.8-2.2z" /></svg></span>
        <b>{t("ai")}</b><small>DEEPSEEK · TOOLS</small>
        <span className="x" onClick={onClose}>✕</span>
      </div>
      <div className="cbody" ref={bodyRef}>
        {msgs.length === 0 && (
          <div className="msg">
            <div className="hd"><b>{symbol}</b><span className="pill" style={{ color: buy ? "var(--buy)" : "var(--sell)", background: buy ? "rgba(38,194,129,.13)" : "rgba(240,86,107,.13)" }}>{v}</span></div>
            {row
              ? (zh
                ? <p>{rowName} 当前为 <span className={buy ? "buy" : "sell"}>黄金神谕 {v}</span>。今日 {up ? "+" : ""}{(row.chg ?? 0).toFixed(2)}%，报 {row.last?.toLocaleString()}。问我任何问题 —— 我可以调取它的报价、情报、回测，或扫描全市场。</p>
                : <p>{rowName} is on a <span className={buy ? "buy" : "sell"}>Golden-Oracle {v}</span>. Today {up ? "+" : ""}{(row.chg ?? 0).toFixed(2)}% at {row.last?.toLocaleString()}. Ask me anything — I can pull its quote, intel, backtest, or screen the universe.</p>)
              : (zh
                ? <p>向我询问 {symbol} —— 我可以调取报价、宏观情报、回测结果，或扫描全市场寻找机会。</p>
                : <p>Ask me about {symbol} — I can pull its quote, macro intel, backtest result, or screen the whole universe for setups.</p>)}
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`cmsg ${m.role}`}>
            {m.steps && m.steps.length > 0 && (
              <div className="steps">{m.steps.map((s, j) => <span key={j} className="step"><svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h10" /></svg>{s.tool}{s.args?.symbol ? ` · ${s.args.symbol}` : ""}</span>)}</div>
            )}
            {m.role === "assistant"
              ? (m.content ? <div className="bub md" dangerouslySetInnerHTML={{ __html: mdToHtml(m.content) }} /> : <div className="bub typing">{t("analyzing")}<span>…</span></div>)
              : <div className="bub">{m.content}</div>}
          </div>
        ))}
        {busy && msgs[msgs.length - 1]?.role !== "assistant" && <div className="cmsg assistant"><div className="bub typing">{t("analyzing")}<span>…</span></div></div>}
        {msgs.length === 0 && <div className="suggest">{suggestions.map((s, i) => <button key={i} onClick={() => send(s)}>{s}</button>)}</div>}
      </div>
      <div className="ask">
        <input value={input} placeholder={`${t("askAbout")} ${symbol}…`} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") send(input); }} />
        <button className="send" onClick={() => send(input)}><svg viewBox="0 0 24 24"><path d="M3 11l18-8-8 18-2-7-8-3z" /></svg></button>
      </div>
    </aside>
  );
}
