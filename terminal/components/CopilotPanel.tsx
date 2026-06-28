"use client";
import { useEffect, useRef, useState } from "react";
import { mdToHtml } from "@/lib/md";

type Row = { name: string; last: number; chg: number; verdict: string | null; wr: number | null; pf: number | null; cagr: number | null; regimeBull: boolean | null };
type Step = { tool: string; args: any };
type Msg = { role: "user" | "assistant"; content: string; steps?: Step[] };
const isBuy = (v: string | null) => v === "BUY" || v === "REBUY";

export default function CopilotPanel({ open, symbol, row, onClose }:
  { open: boolean; symbol: string; row: Row | undefined; onClose: () => void }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setMsgs([]); }, [symbol]);
  useEffect(() => { if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight; }, [msgs, busy]);

  async function send(text: string) {
    const t = text.trim(); if (!t || busy) return; setInput("");
    const next: Msg[] = [...msgs, { role: "user", content: t }];
    setMsgs(next); setBusy(true);
    try {
      const r = await fetch("/api/copilot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbol, messages: next.map((m) => ({ role: m.role, content: m.content })) }) });
      const ct = r.headers.get("content-type") || "";
      if (!r.body || !ct.includes("event-stream")) { const d = await r.json(); setMsgs((m) => [...m, { role: "assistant", content: d.reply || "(no reply)", steps: d.steps }]); setBusy(false); return; }
      setMsgs((m) => [...m, { role: "assistant", content: "", steps: [] }]);
      const apply = (fn: (l: Msg) => Msg) => setMsgs((m) => { const c = [...m]; c[c.length - 1] = fn(c[c.length - 1]); return c; });
      const reader = r.body.getReader(); const dec = new TextDecoder(); let buf = "";
      for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n"); buf = lines.pop() || "";
        for (const line of lines) {
          const s = line.trim(); if (!s.startsWith("data:")) continue;
          const data = s.slice(5).trim(); if (!data) continue;
          let j: any; try { j = JSON.parse(data); } catch { continue; }
          if (j.type === "token") apply((l) => ({ ...l, content: l.content + j.text }));
          else if (j.type === "step") apply((l) => ({ ...l, steps: [...(l.steps || []), { tool: j.tool, args: j.args }] }));
          else if (j.type === "error") apply((l) => ({ ...l, content: l.content + (l.content ? "\n\n" : "") + "_" + j.message + "_" }));
        }
      }
    } catch { setMsgs((m) => [...m, { role: "assistant", content: "Copilot unavailable right now." }]); }
    setBusy(false);
  }

  const v = row?.verdict || "—"; const buy = isBuy(v); const up = (row?.chg ?? 0) >= 0;
  const suggestions = [`Why is ${symbol} a ${v}?`, `How has this signal backtested?`, `What does the macro regime imply?`, `Find BUY setups in an uptrend regime`];

  return (
    <aside className={`copilot${open ? " open" : ""}`}>
      <div className="ch">
        <span className="mk"><svg viewBox="0 0 24 24"><path d="M12 2l2.2 5.8L20 10l-5.8 2.2L12 18l-2.2-5.8L4 10l5.8-2.2z" /></svg></span>
        <b>Mastermind AI</b><small>DEEPSEEK · TOOLS</small>
        <span className="x" onClick={onClose}>✕</span>
      </div>
      <div className="cbody" ref={bodyRef}>
        {msgs.length === 0 && (
          <div className="msg">
            <div className="hd"><b>{symbol}</b><span className="pill" style={{ color: buy ? "var(--buy)" : "var(--sell)", background: buy ? "rgba(38,194,129,.13)" : "rgba(240,86,107,.13)" }}>{v}</span></div>
            {row ? <p>{row.name} is on a <span className={buy ? "buy" : "sell"}>Golden-Oracle {v}</span>. Today {up ? "+" : ""}{(row.chg ?? 0).toFixed(2)}% at {row.last?.toLocaleString()}. Ask me anything — I can pull its quote, intel, backtest, or screen the universe.</p>
              : <p>Ask me about {symbol} — I can pull its quote, macro intel, strategy-tester result, or screen the whole universe for setups.</p>}
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`cmsg ${m.role}`}>
            {m.steps && m.steps.length > 0 && (
              <div className="steps">{m.steps.map((s, j) => <span key={j} className="step"><svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h10" /></svg>{s.tool}{s.args?.symbol ? ` · ${s.args.symbol}` : ""}</span>)}</div>
            )}
            {m.role === "assistant"
              ? (m.content ? <div className="bub md" dangerouslySetInnerHTML={{ __html: mdToHtml(m.content) }} /> : <div className="bub typing">Analyzing<span>…</span></div>)
              : <div className="bub">{m.content}</div>}
          </div>
        ))}
        {busy && msgs[msgs.length - 1]?.role !== "assistant" && <div className="cmsg assistant"><div className="bub typing">Analyzing<span>…</span></div></div>}
        {msgs.length === 0 && <div className="suggest">{suggestions.map((s, i) => <button key={i} onClick={() => send(s)}>{s}</button>)}</div>}
      </div>
      <div className="ask">
        <input value={input} placeholder={`Ask about ${symbol}…`} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") send(input); }} />
        <button className="send" onClick={() => send(input)}><svg viewBox="0 0 24 24"><path d="M3 11l18-8-8 18-2-7-8-3z" /></svg></button>
      </div>
    </aside>
  );
}
