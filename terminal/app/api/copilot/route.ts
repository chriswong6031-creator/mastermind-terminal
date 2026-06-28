import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

const DATA = path.join(process.cwd(), "public", "data");
const readJson = async (f: string) => { try { return JSON.parse(await fs.readFile(path.join(DATA, f), "utf8")); } catch { return null; } };

const TOOLS = [
  { type: "function", function: { name: "get_quote", description: "Last price, % change, Golden-Oracle verdict (BUY/SELL), win-rate, profit-factor, CAGR and regime for a ticker.", parameters: { type: "object", properties: { symbol: { type: "string" } }, required: ["symbol"] } } },
  { type: "function", function: { name: "get_intel", description: "Macro analyzer intelligence for a ticker: AI verdict, conviction score, regime, gamma walls, analyst revisions, smart-money trend.", parameters: { type: "object", properties: { symbol: { type: "string" } }, required: ["symbol"] } } },
  { type: "function", function: { name: "get_backtest", description: "Strategy-tester result for a ticker: metrics (win rate, profit factor, CAGR, Sharpe, max drawdown, vs buy-hold) and trade count.", parameters: { type: "object", properties: { symbol: { type: "string" } }, required: ["symbol"] } } },
  { type: "function", function: { name: "screen", description: "Scan the universe. Optionally filter by verdict (BUY|SELL) and/or regime (bull|mixed). Returns up to 12 tickers ranked by win rate.", parameters: { type: "object", properties: { verdict: { type: "string" }, regime: { type: "string" } }, required: [] } } },
];

async function runTool(name: string, args: any): Promise<any> {
  const sym = (args?.symbol || "").toUpperCase();
  if (name === "get_quote") { const m = await readJson("manifest.json"); const r = m?.symbols?.[sym]; return r ? { symbol: sym, ...r } : { error: "unknown symbol" }; }
  if (name === "get_intel") { const i = await readJson(`${sym}.intel.json`); return i || { error: "no intel for symbol" }; }
  if (name === "get_backtest") { const b = await readJson(`${sym}.backtest.json`); return b ? { symbol: sym, metrics: b.metrics, n_trades: (b.trades || []).length, equity_mult: b.equity?.v?.slice(-1)[0], bh_total_return: b.equity?.bh_total_return } : { error: "no backtest" }; }
  if (name === "screen") {
    const m = await readJson("manifest.json"); const syms = m?.symbols || {};
    let rows = Object.entries<any>(syms).map(([s, r]) => ({ symbol: s, ...r }));
    if (args?.verdict) rows = rows.filter((r) => (r.verdict || "").toUpperCase() === args.verdict.toUpperCase() || (args.verdict.toUpperCase() === "BUY" && ["BUY", "REBUY"].includes((r.verdict || "").toUpperCase())));
    if (args?.regime) rows = rows.filter((r) => (args.regime.toLowerCase().startsWith("bull") ? r.regimeBull : !r.regimeBull));
    rows.sort((a, b) => (b.wr ?? 0) - (a.wr ?? 0));
    return { count: rows.length, results: rows.slice(0, 12).map((r) => ({ symbol: r.symbol, last: r.last, chg: r.chg, verdict: r.verdict, wr: r.wr, pf: r.pf, cagr: r.cagr, regimeBull: r.regimeBull })) };
  }
  return { error: "unknown tool" };
}

const SYSTEM = `You are Mastermind AI, the copilot inside an institutional charting terminal. You reason over a proprietary backtested confluence signal ("Golden Oracle"), a macro/regime read, and a strategy tester. Use the tools to ground every claim in real data — never invent numbers. Be concise, specific, and honest: the confluence is a timing/risk overlay, not a standalone return engine. Nothing is financial advice. When the user asks about a ticker, fetch its quote and intel before answering.`;

export async function POST(req: Request) {
  const key = process.env.DEEPSEEK_API_KEY;
  const base = process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com";
  const { messages = [], symbol } = await req.json();
  if (!key) return NextResponse.json({ reply: "The AI copilot isn't configured (no model key).", steps: [] });

  const convo: any[] = [{ role: "system", content: SYSTEM + (symbol ? ` The active chart symbol is ${symbol}.` : "") }, ...messages];
  const E = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (o: any) => { try { controller.enqueue(E.encode(`data: ${JSON.stringify(o)}\n\n`)); } catch {} };
      try {
        for (let iter = 0; iter < 6; iter++) {
          const res = await fetch(`${base}/chat/completions`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
            body: JSON.stringify({ model: "deepseek-chat", messages: convo, tools: TOOLS, tool_choice: "auto", temperature: 0.3, max_tokens: 900, stream: true }),
          });
          if (!res.ok || !res.body) { send({ type: "error", message: `Model error (${res.status})` }); break; }
          const reader = res.body.getReader(); const dec = new TextDecoder();
          let buf = "", content = "", finish: string | null = null; const calls: Record<number, { id: string; name: string; args: string }> = {};
          for (;;) {
            const { done, value } = await reader.read(); if (done) break;
            buf += dec.decode(value, { stream: true });
            const lines = buf.split("\n"); buf = lines.pop() || "";
            for (const line of lines) {
              const t = line.trim(); if (!t.startsWith("data:")) continue;
              const data = t.slice(5).trim(); if (!data || data === "[DONE]") continue;
              let j: any; try { j = JSON.parse(data); } catch { continue; }
              const ch = j.choices?.[0]; if (!ch) continue; const d = ch.delta || {};
              if (d.content) { content += d.content; send({ type: "token", text: d.content }); }
              if (d.tool_calls) for (const tc of d.tool_calls) { const i = tc.index ?? 0; const c = calls[i] || (calls[i] = { id: "", name: "", args: "" }); if (tc.id) c.id = tc.id; if (tc.function?.name) c.name = tc.function.name; if (tc.function?.arguments) c.args += tc.function.arguments; }
              if (ch.finish_reason) finish = ch.finish_reason;
            }
          }
          const tcs = Object.values(calls);
          if (finish === "tool_calls" || tcs.length) {
            convo.push({ role: "assistant", content: content || null, tool_calls: tcs.map((c) => ({ id: c.id, type: "function", function: { name: c.name, arguments: c.args } })) });
            for (const c of tcs) { let a: any = {}; try { a = JSON.parse(c.args || "{}"); } catch {} send({ type: "step", tool: c.name, args: a }); const result = await runTool(c.name, a); convo.push({ role: "tool", tool_call_id: c.id, content: JSON.stringify(result) }); }
            continue;
          }
          break; // got a final text answer
        }
      } catch (e: any) { send({ type: "error", message: e?.message || "copilot error" }); }
      finally { try { controller.enqueue(E.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`)); } catch {} controller.close(); }
    },
  });

  return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" } });
}
