"use client";
import { useState } from "react";
import { track } from "@/lib/analytics";

type Row = { name: string; last: number; chg: number; verdict: string | null; wr: number | null; pf: number | null; cagr: number | null; regimeBull: boolean | null };
const isBuy = (v: string | null) => v === "BUY" || v === "REBUY";
const pct = (n: number | null | undefined, d = 0) => (n == null ? "—" : (n * 100).toFixed(d) + "%");

export default function CopilotPanel({ open, symbol, row, onClose }:
  { open: boolean; symbol: string; row: Row | undefined; onClose: () => void }) {
  const v = row?.verdict || "—";
  const buy = isBuy(v);
  const up = (row?.chg ?? 0) >= 0;
  const [q, setQ] = useState("");
  // No live AI backend yet — this records that the user asked (and what), so we
  // can size copilot demand before building the answer pipeline.
  const ask = (query: string, kind: "suggestion" | "freeform") => track("copilot-query", { symbol, query, kind });
  const submit = () => { const query = q.trim(); if (!query) return; ask(query, "freeform"); setQ(""); };
  const read = !row ? "Loading…" : buy
    ? `momentum and trend align for a long here — the RSI-MACD crossed up with the higher-timeframe trend confirming and price holding its trend gate.`
    : `the signal is defensive — momentum has rolled over relative to the higher timeframe. Historically the engine sits out or cuts here rather than chasing; wait for a fresh BUY confluence.`;

  return (
    <aside className={`copilot${open ? " open" : ""}`}>
      <div className="ch">
        <span className="mk"><svg viewBox="0 0 24 24"><path d="M12 2l2.2 5.8L20 10l-5.8 2.2L12 18l-2.2-5.8L4 10l5.8-2.2z" /></svg></span>
        <b>Mastermind AI</b><small>OPUS 4.8</small>
        <span className="x" onClick={onClose}>✕</span>
      </div>
      <div className="cbody">
        <div className="msg">
          <div className="hd"><b>{symbol}</b><span className="pill" style={{ color: buy ? "var(--buy)" : "var(--sell)", background: buy ? "rgba(38,194,129,.13)" : "rgba(240,86,107,.13)" }}>{v}</span></div>
          {row && <>
            <p>{row.name} is on a <span className={buy ? "buy" : "sell"}>Golden-Oracle {v}</span>: {read}</p>
            <p style={{ marginTop: 9 }}>Macro regime reads <b>{row.regimeBull ? "uptrend" : "mixed"}</b> — price is <b>{row.regimeBull ? "above" : "near/below"}</b> the 200-EMA. Today {symbol} is <span className={up ? "buy" : "sell"}>{up ? "+" : ""}{(row.chg ?? 0).toFixed(2)}%</span> at {row.last?.toLocaleString()}.</p>
            <div className="stats3">
              <div><b>{pct(row.wr)}</b><small>Win rate</small></div>
              <div><b>{row.pf != null ? row.pf.toFixed(2) : "—"}</b><small>Profit factor</small></div>
              <div><b>{pct(row.cagr, 1)}</b><small>CAGR</small></div>
            </div>
            <p style={{ fontSize: 12, color: "var(--muted)" }}>Honest read: the confluence is a <b>timing / risk overlay</b>, not a standalone return engine — its edge is real but front-loaded, and backtested on ~6yr of 3D bars from Polygon. Not advice.</p>
          </>}
        </div>
        <div className="suggest">
          <button onClick={() => ask(`Why is ${symbol} a ${v}?`, "suggestion")}>Why is {symbol} a {v}?</button>
          <button onClick={() => ask("How has this signal performed historically?", "suggestion")}>How has this signal performed historically?</button>
          <button onClick={() => ask("What does the macro regime imply for this name?", "suggestion")}>What does the macro regime imply for this name?</button>
          <button onClick={() => ask("Find me BUY setups with uptrend regime", "suggestion")}>Find me BUY setups with uptrend regime →</button>
        </div>
      </div>
      <div className="ask">
        <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") submit(); }} placeholder="Ask Mastermind about this setup…" />
        <button className="send" onClick={submit}><svg viewBox="0 0 24 24"><path d="M3 11l18-8-8 18-2-7-8-3z" /></svg></button>
      </div>
    </aside>
  );
}
