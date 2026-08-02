"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLang } from "../../lib/i18n";
import { pick } from "../../lib/finFormat";
import {
  browserCompanySourceSearchAdapter,
  normalizeTranscriptLiteralPhrase,
  type CompanySourceCompareRequest,
  type CompanySourceSearchAdapter,
  type CompanySourceSearchEvent,
  type CompanySourceSearchResult,
  type CompanySourceSpan,
} from "../../lib/companySourceSearch";

type RequestPhase = "idle" | "loading" | "settled";

interface RequestState {
  phase: RequestPhase;
  result: CompanySourceSearchResult | null;
}

export interface TranscriptSearchWorkspaceProps {
  ticker: string;
  events: CompanySourceSearchEvent[];
  initialEventId: string;
  onOpenTranscript: (id: string) => void;
  /** Tests may inject the deterministic fixture adapter; production uses the BFF. */
  adapter?: CompanySourceSearchAdapter;
}

function highlightExact(text: string, needle: string): ReactNode {
  const target = needle.trim();
  if (!target) return text;
  const lower = text.toLocaleLowerCase();
  const targetLower = target.toLocaleLowerCase();
  const parts: ReactNode[] = [];
  let cursor = 0;
  let match = lower.indexOf(targetLower);
  while (match >= 0) {
    if (match > cursor) parts.push(text.slice(cursor, match));
    parts.push(<mark key={`${match}-${cursor}`}>{text.slice(match, match + target.length)}</mark>);
    cursor = match + target.length;
    match = lower.indexOf(targetLower, cursor);
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts.length ? parts : text;
}

function resultLabel(result: CompanySourceSearchResult, zh: boolean): string {
  if (result.state === "ready") return result.spans.length
    ? pick(zh, `${result.spans.length} 个精确命中`, `${result.spans.length} exact matches`)
    : pick(zh, "未找到精确命中", "No exact matches");
  if (result.state === "not_covered") return pick(zh, "尚未覆盖", "Not covered");
  if (result.state === "stale_revision") return pick(zh, "版本已过期", "Revision stale");
  return pick(zh, "请求未完成", "Request unavailable");
}

function stateCopy(result: CompanySourceSearchResult, zh: boolean): string {
  if (result.state === "not_covered") return result.message;
  if (result.state === "stale_revision") return result.message;
  if (result.state === "error") return result.message;
  if (result.spans.length === 0) {
    return pick(
      zh,
      "已在选定事件中进行精确字面匹配；没有段落包含该短语。系统没有扩展、改写或推断关联内容。",
      "The selected events were checked for this literal phrase. No segment contains it; no expansion, paraphrase, or inferred relevance was used.",
    );
  }
  return pick(zh, "每项均为带修订凭证的字面匹配。", "Every result is a literal match with a revision receipt.");
}

function EventName({ event, zh }: { event: CompanySourceSearchEvent; zh: boolean }) {
  return <>{event.label}{event.call_date ? <small>{event.call_date}</small> : null}{!event.transcript_id && <i title={pick(zh, "未关联已验证电话会正文", "No verified transcript body linked")}>!</i>}</>;
}

function ResultState({ result, zh, onRetry }: { result: CompanySourceSearchResult; zh: boolean; onRetry: () => void }) {
  const kind = result.state === "ready" ? result.spans.length ? "ready" : "empty" : result.state;
  return (
    <div className={`ci-ts-state ${kind}`} role={result.state === "error" ? "alert" : "status"}>
      <span className="ci-ts-state-mark" aria-hidden>{kind === "ready" ? "✓" : kind === "empty" ? "⌕" : kind === "stale_revision" ? "!" : "—"}</span>
      <div>
        <strong>{resultLabel(result, zh)}</strong>
        <p>{stateCopy(result, zh)}</p>
      </div>
      {result.state === "error" && result.retryable && <button className="btn btn-ghost" onClick={onRetry}>{pick(zh, "重试", "Retry")}</button>}
    </div>
  );
}

function SpanCard({
  span,
  phrase,
  zh,
  onOpenTranscript,
  onReceipt,
}: {
  span: CompanySourceSpan;
  phrase: string;
  zh: boolean;
  onOpenTranscript: (id: string) => void;
  onReceipt: (span: CompanySourceSpan, trigger: HTMLButtonElement) => void;
}) {
  return (
    <article className="ci-ts-span" data-span-id={span.span_id}>
      <header>
        <div className="ci-ts-span-identity">
          <span className={`ci-ts-section ${span.section}`}>{span.section === "qa" ? "Q&A" : span.section === "prepared" ? pick(zh, "陈述", "Prepared") : pick(zh, "未知段落", "Unclassified")}</span>
          <span className="ci-ts-segment num">{pick(zh, "段", "Segment")} {span.segment_index + 1}</span>
        </div>
        <div className="ci-ts-span-actions">
          <button className="ci-ts-link" onClick={() => onOpenTranscript(span.transcript_id)}>{pick(zh, "打开原文", "Open source")}</button>
          <button className="ci-ts-link" onClick={(event) => onReceipt(span, event.currentTarget)}>{pick(zh, "凭证", "Receipt")}</button>
        </div>
      </header>
      <div className="ci-ts-speaker">
        <strong>{span.speaker}</strong>
        {span.role && <span>{span.role}</span>}
      </div>
      <p>{highlightExact(span.excerpt, phrase)}</p>
      <footer><code>{span.transcript_id}</code><span>{span.receipt.verification === "verified" ? pick(zh, "已验证修订", "Verified revision") : pick(zh, "过期修订", "Stale revision")}</span></footer>
    </article>
  );
}

function ReceiptDialog({
  span,
  zh,
  onClose,
}: {
  span: CompanySourceSpan;
  zh: boolean;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const controls = [...dialogRef.current.querySelectorAll<HTMLElement>(
        'a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"])',
      )].filter((control) => !control.hasAttribute("hidden"));
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const receipt = span.receipt;
  return (
    <div className="ci-ts-dialog-wrap" role="presentation">
      <button className="ci-ts-dialog-scrim" aria-label={pick(zh, "关闭来源凭证", "Close source receipt")} onClick={onClose} />
      <aside ref={dialogRef} className="ci-ts-dialog" role="dialog" aria-modal="true" aria-labelledby="ci-ts-receipt-title">
        <header>
          <div>
            <span className="fin-eyebrow">{pick(zh, "不可变来源凭证", "IMMUTABLE SOURCE RECEIPT")}</span>
            <h3 id="ci-ts-receipt-title">{span.speaker} · {span.transcript_id}</h3>
          </div>
          <button ref={closeRef} className="ci-icon-button" onClick={onClose} aria-label={pick(zh, "关闭来源凭证", "Close source receipt")}>×</button>
        </header>
        <dl>
          <div><dt>{pick(zh, "验证状态", "Verification")}</dt><dd><span className={`ci-ts-verify ${receipt.verification}`}>{receipt.verification === "verified" ? pick(zh, "已验证", "Verified") : pick(zh, "版本已过期", "Revision stale")}</span></dd></div>
          <div><dt>{pick(zh, "索引版本", "Corpus revision")}</dt><dd><code>{receipt.revision_id}</code></dd></div>
          <div><dt>{pick(zh, "文档 SHA-256", "Document SHA-256")}</dt><dd><code>{receipt.document_sha256}</code></dd></div>
          <div><dt>{pick(zh, "段落坐标", "Segment coordinates")}</dt><dd><code>{span.segment_index}:{span.char_start}-{span.char_end}</code></dd></div>
          <div><dt>{pick(zh, "索引时间", "Indexed at")}</dt><dd><time dateTime={receipt.indexed_at}>{receipt.indexed_at.replace("T", " ").replace("Z", " UTC")}</time></dd></div>
          <div><dt>{pick(zh, "来源", "Source")}</dt><dd>{receipt.source_url ? <a href={receipt.source_url} target="_blank" rel="noreferrer">{receipt.source_label} ↗</a> : receipt.source_label}</dd></div>
        </dl>
        <p className="ci-ts-dialog-note">{pick(zh, "此窗口显示服务器签发的修订与坐标；Terminal 不生成、拼接或重新解释原始文本。", "This receipt exposes server-issued revision and coordinates; Terminal does not generate, join, or reinterpret source text.")}</p>
      </aside>
    </div>
  );
}

function compareColumns(
  result: CompanySourceSearchResult | null,
  left: string,
  right: string,
): [CompanySourceSpan[], CompanySourceSpan[]] {
  if (!result || (result.state !== "ready" && result.state !== "stale_revision")) return [[], []];
  return [result.spans.filter((span) => span.event_id === left), result.spans.filter((span) => span.event_id === right)];
}

export default function TranscriptSearchWorkspace({
  ticker,
  events,
  initialEventId,
  onOpenTranscript,
  adapter = browserCompanySourceSearchAdapter,
}: TranscriptSearchWorkspaceProps) {
  const { lang } = useLang();
  const zh = lang === "zh";
  const [phrase, setPhrase] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>(initialEventId ? [initialEventId] : []);
  const [search, setSearch] = useState<RequestState>({ phase: "idle", result: null });
  const [compare, setCompare] = useState<RequestState>({ phase: "idle", result: null });
  const [leftEventId, setLeftEventId] = useState(initialEventId || events[0]?.event_id || "");
  const [rightEventId, setRightEventId] = useState(events.find((event) => event.event_id !== initialEventId)?.event_id ?? "");
  const [receiptSpan, setReceiptSpan] = useState<CompanySourceSpan | null>(null);
  const receiptTriggerRef = useRef<HTMLButtonElement | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    setSelectedIds(initialEventId ? [initialEventId] : []);
    setLeftEventId(initialEventId || events[0]?.event_id || "");
    setRightEventId(events.find((event) => event.event_id !== initialEventId)?.event_id ?? "");
    setSearch({ phase: "idle", result: null });
    setCompare({ phase: "idle", result: null });
  }, [ticker, initialEventId, events]);

  const eventById = useMemo(() => new Map(events.map((event) => [event.event_id, event])), [events]);
  const normalizedPhrase = normalizeTranscriptLiteralPhrase(phrase);

  const toggleEvent = useCallback((eventId: string) => {
    setSelectedIds((current) => current.includes(eventId)
      // The control means "search these events", never an ambiguous empty
      // selection that silently broadens a reader's search to all history.
      ? (current.length === 1 ? current : current.filter((candidate) => candidate !== eventId))
      : [...current, eventId]);
  }, []);

  const runSearch = useCallback(async () => {
    const query = normalizeTranscriptLiteralPhrase(phrase);
    if (!query) {
      setSearch({ phase: "settled", result: { state: "error", ticker, query: "", message: "Enter a literal phrase to search.", retryable: false } });
      return;
    }
    const requestId = ++requestIdRef.current;
    setSearch({ phase: "loading", result: null });
    try {
      const result = await adapter.search({ ticker, phrase: query, event_ids: selectedIds });
      if (requestId === requestIdRef.current) setSearch({ phase: "settled", result });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (requestId === requestIdRef.current) setSearch({ phase: "settled", result: { state: "error", ticker, query, message: "Source search was interrupted.", retryable: true } });
    }
  }, [adapter, phrase, selectedIds, ticker]);

  const runCompare = useCallback(async () => {
    const query = normalizeTranscriptLiteralPhrase(phrase);
    if (!query || !leftEventId || !rightEventId || leftEventId === rightEventId) {
      setCompare({ phase: "settled", result: { state: "error", ticker, query: query ?? "", message: "Enter a literal phrase and select two different events to compare.", retryable: false } });
      return;
    }
    const requestId = ++requestIdRef.current;
    setCompare({ phase: "loading", result: null });
    const request: CompanySourceCompareRequest = {
      ticker,
      phrase: query,
      event_ids: [leftEventId, rightEventId],
      left_event_id: leftEventId,
      right_event_id: rightEventId,
    };
    try {
      const result = await adapter.compare(request);
      if (requestId === requestIdRef.current) setCompare({ phase: "settled", result });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (requestId === requestIdRef.current) setCompare({ phase: "settled", result: { state: "error", ticker, query, message: "Exact comparison was interrupted.", retryable: true } });
    }
  }, [adapter, leftEventId, phrase, rightEventId, ticker]);

  const openReceipt = useCallback((span: CompanySourceSpan, trigger: HTMLButtonElement) => {
    receiptTriggerRef.current = trigger;
    setReceiptSpan(span);
  }, []);
  const closeReceipt = useCallback(() => {
    setReceiptSpan(null);
    window.requestAnimationFrame(() => receiptTriggerRef.current?.focus());
  }, []);

  const [leftSpans, rightSpans] = compareColumns(compare.result, leftEventId, rightEventId);

  return (
    <section className="ci-ts-explorer" aria-labelledby="ci-ts-title">
      <header className="ci-ts-hero">
        <div>
          <span className="fin-eyebrow">{pick(zh, "修订绑定的文本发现", "REVISION-BOUND TEXT DISCOVERY")}</span>
          <h3 id="ci-ts-title">{pick(zh, "在电话会中找到准确出处", "Find exact words across calls")}</h3>
          <p>{pick(zh, "仅做字面短语匹配。结果携带段落、发言人、章节和不可变文档修订凭证；没有 AI 摘要或扩展匹配。", "Literal phrase matching only. Every result carries its segment, speaker, section, and immutable document receipt — no AI summary or expanded match.")}</p>
        </div>
        <span className="ci-ts-contract"><i />{pick(zh, "精确跨度 · 仅背景", "Exact spans · context only")}</span>
      </header>

      <form className="ci-ts-search" role="search" onSubmit={(event) => { event.preventDefault(); void runSearch(); }}>
        <label>
          <span className="fin-skel-sr">{pick(zh, "搜索准确短语", "Search exact phrase")}</span>
          <span aria-hidden>⌕</span>
          <input
            value={phrase}
            onChange={(event) => setPhrase(event.target.value)}
            placeholder={pick(zh, "输入短语，例如 “data center demand”", "Enter a phrase, e.g. “data center demand”")}
            spellCheck={false}
          />
          {phrase && <button type="button" onClick={() => { setPhrase(""); setSearch({ phase: "idle", result: null }); setCompare({ phase: "idle", result: null }); }} aria-label={pick(zh, "清除搜索", "Clear search")}>×</button>}
        </label>
        <button className="btn btn-primary" type="submit" disabled={search.phase === "loading"}>{search.phase === "loading" ? pick(zh, "正在搜索…", "Searching…") : pick(zh, "搜索准确短语", "Search exact phrase")}</button>
      </form>
      <p className="ci-ts-hint">{pick(zh, "可选引号用于标记短语；系统仍按精确字面文本匹配。", "Quotes are optional phrase delimiters; matching remains exact and literal.")}</p>

      <div className="ci-ts-filters" role="group" aria-label={pick(zh, "按事件筛选", "Filter by event")}>
        <div><span>{pick(zh, "搜索事件", "Search events")}</span><small>{pick(zh, "选择一个或多个", "Choose one or more")}</small></div>
        <div className="ci-ts-event-chips">
          {events.map((event) => {
            const selected = selectedIds.includes(event.event_id);
            return <button key={event.event_id} type="button" className={selected ? "on" : ""} aria-pressed={selected} onClick={() => toggleEvent(event.event_id)}><EventName event={event} zh={zh} /></button>;
          })}
        </div>
      </div>

      {search.phase === "loading" && <div className="ci-ts-loading" role="status" aria-live="polite"><span className="ci-ts-pulse" aria-hidden /><span>{pick(zh, "正在验证来源修订…", "Verifying source revisions…")}</span></div>}
      {search.phase === "settled" && search.result && <ResultState result={search.result} zh={zh} onRetry={() => void runSearch()} />}

      {search.result && search.result.state === "ready" && search.result.spans.length > 0 && (
        <div className="ci-ts-results" aria-label={pick(zh, "准确文本命中", "Exact text matches")}>
          {search.result.spans.map((span) => <SpanCard key={span.span_id} span={span} phrase={search.result!.query} zh={zh} onOpenTranscript={onOpenTranscript} onReceipt={openReceipt} />)}
        </div>
      )}

      <section className="ci-ts-compare" aria-labelledby="ci-ts-compare-title">
        <div className="ci-ts-compare-head">
          <div><span className="fin-eyebrow">{pick(zh, "叙事对比", "NARRATIVE COMPARE")}</span><h4 id="ci-ts-compare-title">{pick(zh, "并列查看两个事件中的相同短语", "Place the same phrase beside two events")}</h4></div>
          <span>{pick(zh, "无模型改写", "No model paraphrase")}</span>
        </div>
        <div className="ci-ts-compare-controls">
          <label><span>{pick(zh, "左侧事件", "Left event")}</span><select value={leftEventId} onChange={(event) => setLeftEventId(event.target.value)}>{events.map((event) => <option key={event.event_id} value={event.event_id}>{event.label} · {event.call_date}</option>)}</select></label>
          <span className="ci-ts-compare-swap" aria-hidden>⇄</span>
          <label><span>{pick(zh, "右侧事件", "Right event")}</span><select value={rightEventId} onChange={(event) => setRightEventId(event.target.value)}>{events.map((event) => <option key={event.event_id} value={event.event_id}>{event.label} · {event.call_date}</option>)}</select></label>
          <button className="btn btn-ghost" type="button" onClick={() => void runCompare()} disabled={compare.phase === "loading" || !normalizedPhrase}>{compare.phase === "loading" ? pick(zh, "正在比较…", "Comparing…") : pick(zh, "对比准确出处", "Compare exact excerpts")}</button>
        </div>

        {compare.phase === "settled" && compare.result && <ResultState result={compare.result} zh={zh} onRetry={() => void runCompare()} />}
        {compare.result?.state === "ready" && compare.result.spans.length > 0 && (
          <div className="ci-ts-compare-grid">
            {([leftEventId, rightEventId] as const).map((eventId, index) => {
              const event = eventById.get(eventId);
              const spans = index === 0 ? leftSpans : rightSpans;
              return <div className="ci-ts-compare-col" key={eventId}>
                <header><div><strong>{event?.label ?? eventId}</strong><small>{event?.call_date}</small></div><span className="num">{spans.length}</span></header>
                {spans.length ? spans.map((span) => <SpanCard key={span.span_id} span={span} phrase={compare.result!.query} zh={zh} onOpenTranscript={onOpenTranscript} onReceipt={openReceipt} />) : <div className="ci-ts-compare-empty">{pick(zh, "该事件没有此精确短语。", "This event contains no exact phrase match.")}</div>}
              </div>;
            })}
          </div>
        )}
        {compare.phase === "idle" && <p className="ci-ts-compare-prompt">{pick(zh, "输入一个准确短语，然后选择两个不同事件以并列比较原始片段。", "Enter an exact phrase, then select two different events to compare the raw excerpts side by side.")}</p>}
      </section>

      {receiptSpan && <ReceiptDialog span={receiptSpan} zh={zh} onClose={closeReceipt} />}
    </section>
  );
}
