"use client";
import { useEffect, useRef, useState } from "react";
import { mdToHtml } from "@/lib/md";
import { useLang, useT } from "@/lib/i18n";

type Row = { name: string; last: number; chg: number; verdict: string | null; wr: number | null; pf: number | null; cagr: number | null; regimeBull: boolean | null };

type Citation = string; // URL strings from the gateway

type QuotaInfo = { lane: "fast" | "pro"; remaining: number; limit: number; period: string };

type MetaEvent = { type: "meta"; lane: "fast" | "pro"; model: string; thread_id: string | null; quota: QuotaInfo };

type Step = { tool: string; args: any; cmd?: string };
type Msg = { role: "user" | "assistant"; content: string; steps?: Step[]; citations?: Citation[] };

const isBuy = (v: string | null) => v === "BUY" || v === "REBUY";

const LANE_KEY = "copilot_lane";

function getLaneLabel(lane: "fast" | "pro"): string {
  return lane === "pro" ? "PRO" : "FAST";
}

export default function CopilotPanel({ open, symbol, row, tf, indicators, onClose, onAnnotate, onSetSymbol, onSetTimeframe, onToggleIndicator, onRunDetection }:
  { open: boolean; symbol: string; row: Row | undefined; tf?: string; indicators?: string[]; onClose: () => void; onAnnotate?: (symbol: string, annotations: any[]) => void; onSetSymbol?: (sym: string) => void; onSetTimeframe?: (tf: string) => void; onToggleIndicator?: (indicator: string, on: boolean) => void; onRunDetection?: (kind: string) => void }) {
  const t = useT();
  const { lang } = useLang();
  const zh = lang === "zh";

  // lane state persisted in localStorage
  const [lane, setLane] = useState<"fast" | "pro">(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(LANE_KEY);
      if (stored === "pro" || stored === "fast") return stored;
    }
    return "fast";
  });

  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  // gateway thread continuity
  const [threadId, setThreadId] = useState<string | null>(null);
  // quota from last meta event
  const [quota, setQuota] = useState<QuotaInfo | null>(null);
  // error code for special-cased renders
  const [errorCode, setErrorCode] = useState<"unauthenticated" | "quota_exhausted" | null>(null);
  // Deep Research mode toggle (Pro only — derived from quota.limit > 0 after first meta)
  const [researchMode, setResearchMode] = useState(false);
  // whether the user is pro-eligible (quota.limit > 0); starts false until first meta event
  const [isProEligible, setIsProEligible] = useState(false);

  const bodyRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const reqRef = useRef(0);
  const acRef = useRef<AbortController | null>(null);

  // symbol change / close / unmount: abort in-flight stream and reset
  useEffect(() => { setMsgs([]); setThreadId(null); setQuota(null); setErrorCode(null); reqRef.current++; acRef.current?.abort(); setBusy(false); }, [symbol]);
  useEffect(() => { if (!open) { reqRef.current++; acRef.current?.abort(); } }, [open]);

  // floating panel: dismiss on Escape or outside click
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    const onDown = (e: MouseEvent) => { const el = panelRef.current; if (el && !el.contains(e.target as Node)) onClose(); };
    window.addEventListener("keydown", onKey);
    const id = window.setTimeout(() => window.addEventListener("mousedown", onDown), 0);
    return () => { window.removeEventListener("keydown", onKey); window.clearTimeout(id); window.removeEventListener("mousedown", onDown); };
  }, [open, onClose]);
  useEffect(() => () => { reqRef.current++; acRef.current?.abort(); }, []);

  // sticky-bottom autoscroll
  useEffect(() => { const el = bodyRef.current; if (!el) return; if (el.scrollHeight - el.scrollTop - el.clientHeight < 60) el.scrollTop = el.scrollHeight; }, [msgs, busy]);

  // Pro-eligibility for the Deep Research toggle — probe quotas when the panel opens
  // (parity with the dashboard, which gates the toggle on quotas.pro.limit>0).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch("/api/brain/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d?.quotas?.pro?.limit > 0) setIsProEligible(true); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [open]);

  function switchLane(next: "fast" | "pro") {
    setLane(next);
    if (typeof window !== "undefined") localStorage.setItem(LANE_KEY, next);
  }

  function clearThread() {
    reqRef.current++;
    acRef.current?.abort();
    setMsgs([]);
    setThreadId(null);
    setQuota(null);
    setErrorCode(null);
    setBusy(false);
  }

  async function send(text: string) {
    const txt = text.trim(); if (!txt || busy) return; setInput("");
    setErrorCode(null);
    const next: Msg[] = [...msgs, { role: "user", content: txt }];
    setMsgs(next); setBusy(true);
    const my = ++reqRef.current; acRef.current?.abort(); const ac = new AbortController(); acRef.current = ac;
    const apply = (fn: (l: Msg) => Msg) => setMsgs((m) => { if (!m.length) return m; const c = [...m]; c[c.length - 1] = fn(c[c.length - 1]); return c; });

    // Build the stateless-fallback history from PRIOR turns only — the current turn is
    // carried by the top-level `message` field, so it must NOT be duplicated here (use
    // `msgs`, the pre-append list, not `next`). The gateway owns thread memory via thread_id.
    const statelessHistory = msgs.map((m) => ({ role: m.role, content: m.content }));

    try {
      const effectiveLane = researchMode ? "pro" : lane;
      const r = await fetch("/api/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: txt,
          lane: effectiveLane,
          mode: researchMode ? "research" : "chat",
          thread_id: threadId ?? undefined,
          history: threadId ? undefined : statelessHistory, // only send when no thread yet
          context: { symbol, page: "terminal" },
        }),
        signal: ac.signal,
      });
      if (reqRef.current !== my) return;

      // Handle non-stream error responses
      if (r.status === 401) { setErrorCode("unauthenticated"); setBusy(false); return; }
      if (r.status === 402) { setErrorCode("quota_exhausted"); setBusy(false); return; }

      const ct = r.headers.get("content-type") || "";
      if (!r.body || !ct.includes("event-stream")) {
        const d = await r.json().catch(() => ({} as any));
        if (reqRef.current === my) {
          if (d.quota_exhausted) { setErrorCode("quota_exhausted"); }
          else { setMsgs((m) => [...m, { role: "assistant", content: d.error || "(no reply)" }]); }
        }
        return;
      }

      setMsgs((m) => [...m, { role: "assistant", content: "", steps: [], citations: [] }]);
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

          if (j.type === "meta") {
            const meta: MetaEvent = j;
            if (meta.thread_id) setThreadId(meta.thread_id);
            if (meta.quota) {
              setQuota(meta.quota);
              // Fallback reveal: a completed PRO-lane turn proves eligibility even if the
              // /api/brain/me probe failed. Do NOT flip on a fast-lane limit (every user has one).
              if (meta.quota.limit > 0 && meta.quota.lane === "pro") setIsProEligible(true);
            }
          } else if (j.type === "delta") {
            apply((l) => ({ ...l, content: l.content + j.text }));
          } else if (j.type === "tool") {
            apply((l) => ({ ...l, steps: [...(l.steps || []), { tool: j.name, args: {} }] }));
          } else if (j.type === "annotate") {
            onAnnotate?.(j.symbol || symbol, j.annotations || []);
          } else if (j.type === "command") {
            // FLAT single-command contract (mirrors 'annotate'): the event itself carries
            // action + the field(s) at top level — {type:'command', action:'set_symbol', symbol:'NVDA'}.
            const action = typeof j.action === "string" ? j.action : "";
            if (action === "set_symbol" && typeof j.symbol === "string") {
              onSetSymbol?.(j.symbol);
              apply((l) => ({ ...l, steps: [...(l.steps || []), { tool: "set_symbol", args: { symbol: j.symbol }, cmd: t("cmdSetSymbol").replace("{sym}", j.symbol) }] }));
            } else if (action === "set_timeframe" && typeof j.tf === "string") {
              onSetTimeframe?.(j.tf);
              apply((l) => ({ ...l, steps: [...(l.steps || []), { tool: "set_timeframe", args: { tf: j.tf }, cmd: t("cmdSetTimeframe").replace("{tf}", j.tf) }] }));
            } else if (action === "toggle_indicator" && typeof j.indicator === "string") {
              const on = j.on === true;   // explicit only — a missing flag never silently adds
              onToggleIndicator?.(j.indicator, on);
              const label = on ? t("cmdToggleIndicatorOn") : t("cmdToggleIndicatorOff");
              apply((l) => ({ ...l, steps: [...(l.steps || []), { tool: "toggle_indicator", args: { indicator: j.indicator, on }, cmd: label.replace("{ind}", j.indicator) }] }));
            } else if (action === "run_detection" && typeof j.kind === "string") {
              onRunDetection?.(j.kind);
              apply((l) => ({ ...l, steps: [...(l.steps || []), { tool: "run_detection", args: { kind: j.kind }, cmd: t("cmdRunDetection").replace("{kind}", j.kind) }] }));
            }
            // unknown / malformed command actions are ignored gracefully
          } else if (j.type === "done") {
            if (j.quota) setQuota(j.quota);
            if (j.citations && Array.isArray(j.citations) && j.citations.length > 0) {
              apply((l) => ({ ...l, citations: j.citations }));
            }
          } else if (j.type === "error") {
            apply((l) => ({ ...l, content: l.content + (l.content ? "\n\n" : "") + "_" + j.message + "_" }));
          }
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

  // Header label: "MASTERMIND AI · FAST" / "· PRO"
  // Research mode forces the Pro lane for the turn — reflect that in the header.
  const headerLabel = `MASTERMIND AI · ${getLaneLabel(researchMode ? "pro" : lane)}`;
  const quotaStr = quota ? t("quotaLeft").replace("{n}", String(quota.remaining)) : "";

  return (
    <aside ref={panelRef} className={`copilot${open ? " open" : ""}`}>
      <div className="ch">
        <span className="mk"><svg viewBox="0 0 24 24"><path d="M12 2l2.2 5.8L20 10l-5.8 2.2L12 18l-2.2-5.8L4 10l5.8-2.2z" /></svg></span>
        <b>{t("ai")}</b>
        <small>{headerLabel}</small>
        {quotaStr && <small className="quota-badge">{quotaStr}</small>}
        {/* New chat button — only show when there's a conversation */}
        {msgs.length > 0 && (
          <button className="new-chat" onClick={clearThread} title={t("newChat")}>
            <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>
          </button>
        )}
        <span className="x" onClick={onClose}>✕</span>
      </div>

      {/* Lane toggle: Fast / Pro pills in the composer row */}
      <div className="lane-toggle">
        <button
          className={`lane-pill${lane === "fast" ? " active" : ""}`}
          onClick={() => switchLane("fast")}
        >{t("laneFast")}</button>
        <button
          className={`lane-pill${lane === "pro" ? " active" : ""}`}
          onClick={() => switchLane("pro")}
        >{t("lanePro")}</button>
        {isProEligible && (
          <button
            className={`lane-pill research-pill${researchMode ? " active" : ""}`}
            title={t("deepResearchTip")}
            onClick={() => setResearchMode((v) => !v)}
          >🔬 {t("deepResearch")}</button>
        )}
      </div>

      <div className="cbody" ref={bodyRef}>
        {/* Unauthenticated state */}
        {errorCode === "unauthenticated" && (
          <div className="copilot-notice">{t("signInPrompt")}</div>
        )}
        {/* Quota exhausted state */}
        {errorCode === "quota_exhausted" && (
          <div className="copilot-notice">
            {t("upgradePrompt")}{" "}
            <a href="https://mastermind-x.com/plans.html" target="_blank" rel="noreferrer">{t("upgradeLinkLabel")}</a>
          </div>
        )}

        {msgs.length === 0 && !errorCode && (
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
              <div className="steps">{m.steps.map((s, j) => (
                <span key={j} className={`step${s.cmd ? " step-cmd" : ""}`}>
                  <svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h10" /></svg>
                  {s.cmd ?? (s.tool + (s.args?.symbol ? ` · ${s.args.symbol}` : ""))}
                </span>
              ))}</div>
            )}
            {m.role === "assistant"
              ? (m.content ? <div className="bub md" dangerouslySetInnerHTML={{ __html: mdToHtml(m.content) }} /> : <div className="bub typing">{researchMode ? t("researching") : t("analyzing")}<span>…</span></div>)
              : <div className="bub">{m.content}</div>}
            {/* Citations rendered as small links */}
            {m.role === "assistant" && m.citations && m.citations.length > 0 && (
              <div className="citations">
                <span className="cit-label">{t("citationsLabel")}:</span>
                {m.citations.map((url, ci) => {
                  let host = url;
                  try { host = new URL(url).hostname.replace(/^www\./, ""); } catch {}
                  return (
                    <a key={ci} href={url} target="_blank" rel="noreferrer" className="cit-link">{host}</a>
                  );
                })}
              </div>
            )}
          </div>
        ))}

        {busy && msgs[msgs.length - 1]?.role !== "assistant" && (
          <div className="cmsg assistant"><div className="bub typing">{researchMode ? t("researching") : t("analyzing")}<span>…</span></div></div>
        )}
        {msgs.length === 0 && !errorCode && (
          <div className="suggest">{suggestions.map((s, i) => <button key={i} onClick={() => send(s)}>{s}</button>)}</div>
        )}
      </div>

      <div className="ask">
        <input
          value={input}
          placeholder={`${t("askAbout")} ${symbol}…`}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") send(input); }}
        />
        <button className="send" onClick={() => send(input)}>
          <svg viewBox="0 0 24 24"><path d="M3 11l18-8-8 18-2-7-8-3z" /></svg>
        </button>
      </div>
    </aside>
  );
}
