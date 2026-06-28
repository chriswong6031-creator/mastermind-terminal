import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

const DATA = path.join(process.cwd(), "public", "data");
const readJson = async (f: string) => { try { return JSON.parse(await fs.readFile(path.join(DATA, f), "utf8")); } catch { return null; } };

// ---- tools the model can call (each reads the published data plane) ----
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
  if (!key) return NextResponse.json({ reply: "The AI copilot isn't configured (no model key). The deterministic read still works from the detail panel.", steps: [] });

  const convo: any[] = [{ role: "system", content: SYSTEM + (symbol ? ` The active chart symbol is ${symbol}.` : "") }, ...messages];
  const steps: { tool: string; args: any }[] = [];
  try {
    for (let i = 0; i < 5; i++) {
      const res = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: "deepseek-chat", messages: convo, tools: TOOLS, tool_choice: "auto", temperature: 0.3, max_tokens: 700 }),
      });
      if (!res.ok) return NextResponse.json({ reply: `Model error (${res.status}). Try again.`, steps });
      const data = await res.json();
      const msg = data.choices?.[0]?.message;
      if (!msg) return NextResponse.json({ reply: "No response from model.", steps });
      convo.push(msg);
      const calls = msg.tool_calls;
      if (!calls || !calls.length) return NextResponse.json({ reply: msg.content || "", steps });
      for (const call of calls) {
        let args: any = {}; try { args = JSON.parse(call.function.arguments || "{}"); } catch {}
        steps.push({ tool: call.function.name, args });
        const result = await runTool(call.function.name, args);
        convo.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
      }
    }
    return NextResponse.json({ reply: "(stopped after tool budget — ask a narrower question)", steps });
  } catch (e: any) {
    return NextResponse.json({ reply: `Copilot error: ${e?.message || "unknown"}.`, steps });
  }
}
