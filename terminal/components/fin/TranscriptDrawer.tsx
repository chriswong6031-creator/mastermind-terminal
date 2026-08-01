"use client";

import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLang } from "../../lib/i18n";
import { fmtDate, pick } from "../../lib/finFormat";
import { getTx, transcriptBodyUrl, type Transcript, type TxSegment } from "../../lib/fund";

export interface TranscriptDrawerProps {
  sym: string;
  id: string;
  name?: string | null;
  onClose: () => void;
}

type Section = "all" | "prepared" | "qa";
interface TranscriptLoad {
  key: string;
  transcript: Transcript | null;
  error: boolean;
}

function findQaStart(segments: TxSegment[]): number | null {
  const qaPattern = /question(?:-and-answer|s and answers|s)?/i;
  for (let i = 0; i < segments.length; i += 1) {
    const segment = segments[i];
    if (segment.role.trim().toLowerCase() === "analyst") return i;
    if (
      (segment.role.trim().toLowerCase() === "operator" || segment.speaker.trim().toLowerCase() === "operator")
      && qaPattern.test(segment.text)
    ) return i;
  }
  return null;
}

function highlighted(text: string, query: string) {
  const needle = query.trim();
  if (!needle) return text;
  const lower = text.toLowerCase();
  const target = needle.toLowerCase();
  const parts: ReactNode[] = [];
  let cursor = 0;
  let match = lower.indexOf(target);
  while (match >= 0) {
    parts.push(text.slice(cursor, match));
    parts.push(<mark key={`${match}-${cursor}`}>{text.slice(match, match + needle.length)}</mark>);
    cursor = match + needle.length;
    match = lower.indexOf(target, cursor);
  }
  parts.push(text.slice(cursor));
  return parts;
}

export default function TranscriptDrawer({ sym, id, name, onClose }: TranscriptDrawerProps) {
  const { lang } = useLang();
  const zh = lang === "zh";
  const [retryNonce, setRetryNonce] = useState(0);
  const requestKey = `${sym}:${id}:${retryNonce}`;
  const [load, setLoad] = useState<TranscriptLoad>({ key: "", transcript: null, error: false });
  const [query, setQuery] = useState("");
  const [section, setSection] = useState<Section>("all");
  const [speaker, setSpeaker] = useState("all");
  const [copied, setCopied] = useState<string | null>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    let alive = true;
    getTx(sym, id, { retryNonce })
      .then((transcript) => {
        if (!alive) return;
        setLoad({ key: requestKey, transcript, error: !transcript });
      })
      .catch(() => alive && setLoad({ key: requestKey, transcript: null, error: true }));
    return () => {
      alive = false;
    };
  }, [sym, id, requestKey, retryNonce]);

  useEffect(() => {
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    return () => returnFocusRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopImmediatePropagation();
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key === "Tab" && drawerRef.current) {
        const focusable = [...drawerRef.current.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])',
        )].filter((element) => !element.hasAttribute("hidden"));
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (!first || !last) return;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const loading = load.key !== requestKey;
  const state: "loading" | "ok" | "error" = loading ? "loading" : load.error ? "error" : "ok";
  const tx = loading ? null : load.transcript;
  const qaStart = useMemo(() => tx ? findQaStart(tx.segments) : null, [tx]);
  const speakers = useMemo(() => tx
    ? [...new Set(tx.segments.map((segment) => segment.speaker.trim()).filter(Boolean))].sort()
    : [], [tx]);
  const filtered = useMemo(() => {
    if (!tx) return [];
    const needle = query.trim().toLowerCase();
    return tx.segments
      .map((segment, index) => ({ segment, index }))
      .filter(({ segment, index }) => {
        if (section === "prepared" && qaStart !== null && index >= qaStart) return false;
        if (section === "qa" && (qaStart === null || index < qaStart)) return false;
        if (speaker !== "all" && segment.speaker !== speaker) return false;
        if (!needle) return true;
        return `${segment.speaker} ${segment.role} ${segment.text}`.toLowerCase().includes(needle);
      });
  }, [qaStart, query, section, speaker, tx]);
  const firstVisibleQa = qaStart === null
    ? null
    : filtered.find(({ index }) => index >= qaStart)?.index ?? null;

  const title = tx?.title || `${name || sym} · ${id}`;
  const rawUrl = transcriptBodyUrl(sym, id);

  async function copyText(value: string, key: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      window.setTimeout(() => setCopied((current) => current === key ? null : current), 1600);
    } catch {
      setCopied(null);
    }
  }

  async function copyDeepLink() {
    const url = new URL(window.location.href);
    url.searchParams.set("pane", "transcripts");
    if (url.pathname.startsWith("/analysis")) url.searchParams.set("page", "transcripts");
    url.searchParams.set("tx", id);
    await copyText(url.toString(), "link");
  }

  return (
    <>
      <div className="fin-drawer-scrim" onClick={onClose} aria-hidden />
      <aside ref={drawerRef} className="fin-drawer fin-tx-drawer" role="dialog" aria-modal="true" aria-labelledby="fin-tx-drawer-title">
        <div className="fin-drawer-h fin-tx-drawer-head">
          <div className="fin-tx-head">
            <div className="fin-tx-crumb">{pick(zh, "TRANSCRIPT · DEFEATBETA CORPUS", "电话会 · DEFEATBETA 语料库")}</div>
            <div className="fin-tx-title" id="fin-tx-drawer-title">{title}</div>
            <div className="fin-tx-head-meta">
              {tx?.date && <time dateTime={tx.date}>{fmtDate(tx.date)}</time>}
              {tx?.period && <span>{tx.period}</span>}
              <span>{id}</span>
            </div>
          </div>
          <button ref={closeRef} className="x" onClick={onClose} aria-label={pick(zh, "Close transcript", "关闭电话会")}>
            ×
          </button>
        </div>

        {state === "ok" && tx && (
          <div className="fin-tx-toolbar">
            <label className="fin-tx-search fin-tx-search--drawer">
              <span aria-hidden>⌕</span>
              <span className="fin-skel-sr">{pick(zh, "Search transcript", "搜索电话会")}</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={pick(zh, "Search this call", "搜索本次电话会")} />
              {query && <button onClick={() => setQuery("")} aria-label={pick(zh, "Clear search", "清除搜索")}>×</button>}
            </label>
            <div className="fin-tx-toolbar-row">
              <div className="fin-tx-filters" role="group" aria-label={pick(zh, "Call section", "电话会部分")}>
                {(["all", "prepared", "qa"] as Section[]).map((value) => (
                  <button
                    key={value}
                    className={section === value ? "on" : ""}
                    onClick={() => setSection(value)}
                    disabled={value === "qa" && qaStart === null}
                    aria-pressed={section === value}
                  >
                    {value === "all" ? pick(zh, "All", "全部") : value === "prepared" ? pick(zh, "Prepared", "陈述") : "Q&A"}
                  </button>
                ))}
              </div>
              <label className="fin-tx-speaker-filter">
                <span>{pick(zh, "Speaker", "发言人")}</span>
                <select value={speaker} onChange={(event) => setSpeaker(event.target.value)}>
                  <option value="all">{pick(zh, "All speakers", "全部发言人")}</option>
                  {speakers.map((value) => <option value={value} key={value}>{value}</option>)}
                </select>
              </label>
            </div>
            <div className="fin-tx-sourcebar">
              <span aria-live="polite">{filtered.length} / {tx.segments.length} {pick(zh, "segments", "段")}</span>
              <span className="fin-tx-source-actions">
                {rawUrl && <a href={rawUrl} target="_blank" rel="noreferrer">{pick(zh, "Source file", "源文件")} ↗</a>}
                <button onClick={copyDeepLink}>{copied === "link" ? pick(zh, "Copied", "已复制") : pick(zh, "Copy link", "复制链接")}</button>
              </span>
            </div>
          </div>
        )}

        <div className="fin-drawer-body fin-tx-body">
          {state === "loading" && (
            <div role="status" aria-busy="true">
              <span className="fin-skel-sr">{pick(zh, "Loading transcript…", "正在加载记录…")}</span>
              <div className="fin-skel fin-skel-rows fin-tx-seg" aria-hidden />
              <div className="fin-skel fin-skel-rows fin-tx-seg" aria-hidden />
            </div>
          )}
          {state === "error" && (
            <div className="fin-empty fin-empty-lg fin-tx-error" role="alert">
              <div className="fin-empty-title">{pick(zh, "Transcript unavailable", "无可用记录")}</div>
              <div className="fin-empty-why">
                {pick(
                  zh,
                  `The ${id} archive entry could not be fetched or did not pass document validation.`,
                  `${id} 档案条目无法获取或未通过文档验证。`,
                )}
              </div>
              <button className="fin-tx-retry" onClick={() => setRetryNonce(Date.now())}>{pick(zh, "Retry document", "重试文档")}</button>
            </div>
          )}
          {state === "ok" && tx && tx.segments.length === 0 && (
            <div className="fin-empty fin-empty-lg" role="status">
              <div className="fin-empty-title">{pick(zh, "Empty transcript", "记录为空")}</div>
              <div className="fin-empty-why">{pick(zh, "The validated document carries no spoken segments.", "经验证的文档不含任何发言段落。")}</div>
            </div>
          )}
          {state === "ok" && tx && tx.segments.length > 0 && filtered.length === 0 && (
            <div className="fin-empty fin-empty-lg" role="status">
              <div className="fin-empty-title">{pick(zh, "No matching segments", "无匹配段落")}</div>
              <div className="fin-empty-why">{pick(zh, "Clear a filter or search for another phrase.", "请清除筛选或搜索其他词语。")}</div>
            </div>
          )}
          {state === "ok" && tx && filtered.map(({ segment, index }) => (
            <Fragment key={index}>
              {firstVisibleQa === index && <div className="fin-tx-section" id="fin-tx-qa">{pick(zh, "Questions & answers", "问答环节")}</div>}
              <article className="fin-tx-seg" data-segment={index + 1}>
                <header>
                  <span>
                    <b className="fin-tx-speaker">{highlighted(segment.speaker || pick(zh, "Unknown speaker", "未知发言人"), query)}</b>
                    {segment.role && (
                      <em title={pick(
                        zh,
                        "Role inferred by Mastermind from source text; not independently verified.",
                        "角色由 Mastermind 根据来源文本推断，未经独立核验。",
                      )}>
                        {pick(zh, "inferred", "推断")} · {highlighted(segment.role, query)}
                      </em>
                    )}
                  </span>
                  <button
                    onClick={() => copyText(`${segment.speaker}${segment.role ? ` (${segment.role})` : ""}: ${segment.text}`, `segment-${index}`)}
                    aria-label={pick(zh, `Copy segment ${index + 1}`, `复制第 ${index + 1} 段`)}
                  >
                    {copied === `segment-${index}` ? "✓" : "⧉"}
                  </button>
                </header>
                <p className="fin-tx-text">{highlighted(segment.text, query)}</p>
              </article>
            </Fragment>
          ))}
        </div>
      </aside>
    </>
  );
}
