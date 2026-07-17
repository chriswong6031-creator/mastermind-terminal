import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit, tooMany } from "@/lib/rateLimit";
import { isIndKey } from "@/lib/indicators";
import { verdictIsStale } from "@/lib/signalVerdict";
import { COPILOT_TOOLS, execTool, getManifestRow, SYMBOL_RE } from "@/lib/copilotTools";

// Timeframe tokens are short digit+unit strings ("5m", "2h", "D", "3D", "2W", "1M"...) — shape-match
// instead of a literal list so a TF added to TerminalShell's picker can't silently drop out of the
// chart context. Prompt-context only; never touches the filesystem.
const TF_RE = /^\d{0,3}[a-zA-Z]{1,2}$/;

const SYSTEM = `You are Mastermind AI, the copilot inside an institutional charting terminal. You reason over a proprietary backtested confluence signal ("Golden Oracle"), a macro/regime read, and a strategy tester. Use the tools to ground every claim in real data — never invent numbers. Be concise, specific, and honest: the confluence is a timing/risk overlay, not a standalone return engine. Nothing is financial advice.
Your tools cover every data surface for a ticker — prefer them over guessing:
- get_price_summary: last/chg, today's range, 52wk, trailing returns, ATR, 200-DMA distance.
- get_technicals: TV-style Summary/Osc/MA verdicts, RSI/MACD/ADX/Stoch, classic pivots, Supertrend, Bollinger.
- get_signals: Golden-Oracle state, last 3 signals, condensed backtest, staleness.
- get_options_summary: IV term + skew, and dealer gamma (net GEX, flip, call/put walls).
- get_fundamentals: valuation, margins (already %-labeled), earnings vs estimates, analyst targets.
- get_insiders: Insider Power score/signal/net dollars.
- get_intel: research-desk AI judgment, conviction, key levels, smart money.
- get_market_state: market-wide risk + macro regime (not per-ticker).
- screen: universe scan by verdict/regime.
When the user asks about a ticker, fetch its price summary and signals before answering; add other surfaces only as the question needs them. If a tool returns no_data, say that surface isn't available — never substitute a guess. When they ask you to mark/draw levels on the chart, fetch the data first (get_price_summary gives day & 52-week highs/lows; get_options_summary gives gamma walls; get_intel gives key levels), then call annotate_chart with those real prices — and say one line about what you drew.`;

export async function POST(req: Request) {
  // Tighter than DEFAULT_MAX: each POST fans out up to 6 paid model completions — 30/min/IP is
  // ample for a chat UI while capping scripted abuse (auth alone is weak: signup is open).
  const rl = rateLimit(req, { name: "copilot", max: 30 });
  if (!rl.ok) return tooMany(rl);

  // auth-gate (defense in depth; the copilot UI lives behind the /terminal guard)
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ reply: "Please sign in to use the copilot.", steps: [] }, { status: 401 });

  const key = process.env.DEEPSEEK_API_KEY;
  const base = process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com";
  const body = await req.json().catch(() => ({} as any));
  // sanitize client input: only {role:user|assistant, content:string}; cap count + size; drop any forged system/tool turns
  const symbol = typeof body?.symbol === "string" ? body.symbol.slice(0, 24) : "";
  const lang = body?.lang === "zh" ? "zh" : "en";
  // chart context from the client — both fields are UNTRUSTED, sanitized to safe shapes (prompt
  // context only). isIndKey covers the built-ins; _oracle/_lab are real pane keys outside IND_DEFS.
  const tf = typeof body?.tf === "string" && TF_RE.test(body.tf) ? body.tf : "";
  const indicators: string[] = (Array.isArray(body?.indicators) ? body.indicators : [])
    .filter((k: any) => typeof k === "string" && (isIndKey(k) || k === "_oracle" || k === "_lab"))
    .slice(0, 12);
  const messages = (Array.isArray(body?.messages) ? body.messages : [])
    .filter((m: any) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-30)
    .map((m: any) => ({ role: m.role, content: m.content.slice(0, 8000) }));
  if (!key) return NextResponse.json({ reply: "The AI copilot isn't configured (no model key).", steps: [] });

  // compact chart-context line: active symbol + tf + visible indicators + the manifest row's
  // last/chg/verdict (cheap — module-cached manifest), so trivial questions need zero tool calls
  let chartCtx = "";
  if (symbol) {
    chartCtx = ` The active chart symbol is ${symbol}${tf ? ` on the ${tf} timeframe` : ""}${indicators.length ? ` with indicators: ${indicators.join(", ")}` : ""}.`;
    if (SYMBOL_RE.test(symbol)) {
      const row = await getManifestRow(symbol.toUpperCase()).catch(() => null);
      const last = typeof row?.last === "number" ? row.last : null;
      const chg = typeof row?.chg === "number" ? row.chg : null;
      // The verdict must stay DATED (vts) — the old get_quote enforced this so the model never
      // asserts an old call as current; the >21d staleness rule mirrors lib/signalVerdict.
      let verdictCtx = "";
      if (row?.verdict) {
        const vts = typeof row.vts === "string" ? row.vts : null;
        const staleNote = !vts || verdictIsStale(vts, Date.now()) ? " — historical, NOT a current call" : "";
        verdictCtx = `, Golden-Oracle verdict ${row.verdict}${vts ? ` (as of ${vts}${staleNote})` : ` (undated${staleNote})`}`;
      }
      if (last != null) chartCtx += ` Manifest snapshot: last ${last}${chg != null ? ` (${chg >= 0 ? "+" : ""}${chg.toFixed(2)}%)` : ""}${verdictCtx}.`;
    }
  }

  const convo: any[] = [{ role: "system", content: SYSTEM + chartCtx + (lang === "zh" ? " Respond in 简体中文 (Simplified Chinese); keep ticker symbols, numbers and the signal names (BUY/SELL/CUT/RE-BUY, Golden Oracle) as-is." : "") }, ...messages];
  const E = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (o: any) => { try { controller.enqueue(E.encode(`data: ${JSON.stringify(o)}\n\n`)); } catch {} };
      try {
        for (let iter = 0; iter < 6; iter++) {
          const res = await fetch(`${base}/chat/completions`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
            body: JSON.stringify({ model: "deepseek-chat", messages: convo, tools: COPILOT_TOOLS, tool_choice: "auto", temperature: 0.3, max_tokens: 900, stream: true }),
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
            for (const c of tcs) {
              let a: any = {}; try { a = JSON.parse(c.args || "{}"); } catch {}
              send({ type: "step", tool: c.name, args: a });
              if (c.name === "annotate_chart") {
                // client-executed tool: stream the levels to the browser to draw on the active chart
                const anns = (Array.isArray(a?.annotations) ? a.annotations : []).filter((x: any) => x && Number.isFinite(x.price)).slice(0, 12);
                send({ type: "annotate", symbol, annotations: anns });
                convo.push({ role: "tool", tool_call_id: c.id, content: JSON.stringify({ ok: true, placed: anns.length }) });
              } else {
                const result = await execTool(c.name, a); convo.push({ role: "tool", tool_call_id: c.id, content: JSON.stringify(result) });
              }
            }
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
