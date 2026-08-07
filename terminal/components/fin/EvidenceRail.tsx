"use client";

import { useEffect, useRef } from "react";
import { useLang } from "../../lib/i18n";
import { pick } from "../../lib/finFormat";
import type {
  CompanyIntelligenceEvent,
  CompanyIntelligenceSource,
} from "../../lib/companyIntelligence";

export type CompanyEvidenceKind = "summary" | "highlight" | "quote" | "metric";

export interface CompanyEvidenceSelection {
  id: string;
  kind: CompanyEvidenceKind;
  label: string;
  text: string;
  /** A deterministic cross-event calculation, deliberately separate from the source receipt. */
  derived_comparison?: string | null;
  source: CompanyIntelligenceSource | null;
}

export interface EvidenceRailProps {
  event: CompanyIntelligenceEvent;
  evidence: CompanyEvidenceSelection | null;
  open: boolean;
  overlay: boolean;
  onClose: () => void;
  onOpenTranscript: (id: string) => void;
}

function sourceLabel(kind: CompanyIntelligenceSource["kind"], zh: boolean): string {
  if (kind === "transcript") return pick(zh, "Call transcript", "电话会记录");
  if (kind === "score_overlay") return pick(zh, "Event analysis", "事件分析");
  return pick(zh, "Earnings history", "财报历史");
}

function sourceStatus(status: CompanyIntelligenceSource["status"] | undefined, zh: boolean): string {
  if (status === "present") return pick(zh, "Present", "可用");
  if (status === "metadata_only") return pick(zh, "Metadata only", "仅元数据");
  return pick(zh, "Missing", "缺失");
}

function transcriptId(source: CompanyIntelligenceSource | null): string | null {
  if (!source || source.kind !== "transcript" || !source.url) return null;
  const match = source.url.match(/\/(\d{4}Q[1-4])\.json\.gz(?:[?#].*)?$/);
  return match?.[1] ?? null;
}

function receiptValue(source: CompanyIntelligenceSource | null): string {
  if (!source?.receipt) return "";
  return source.receipt.source_hash || source.receipt.record_id || "";
}

export default function EvidenceRail({
  event,
  evidence,
  open,
  overlay,
  onClose,
  onOpenTranscript,
}: EvidenceRailProps) {
  const { lang } = useLang();
  const zh = lang === "zh";
  const closeRef = useRef<HTMLButtonElement>(null);
  const railRef = useRef<HTMLElement>(null);
  const txId = transcriptId(evidence?.source ?? null);
  const receipt = receiptValue(evidence?.source ?? null);
  const precision = evidence?.source?.citation_precision ?? "metadata";

  useEffect(() => {
    if (!open || !overlay) return;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        onClose();
        return;
      }
      if (event.key === "Tab" && railRef.current) {
        const focusable = [...railRef.current.querySelectorAll<HTMLElement>(
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
    return () => {
      window.removeEventListener("keydown", onKey, true);
    };
  }, [onClose, open, overlay]);

  return (
    <>
      <button
        className={`ci-evidence-scrim${open ? " open" : ""}`}
        aria-label={pick(zh, "Close evidence inspector", "关闭证据检查器")}
        aria-hidden={!open}
        onClick={onClose}
        tabIndex={open ? 0 : -1}
      />
      <aside
        ref={railRef}
        className={`ci-evidence${open ? " open" : ""}`}
        role={overlay ? "dialog" : "complementary"}
        aria-modal={overlay && open ? true : undefined}
        aria-label={pick(zh, "Evidence inspector", "证据检查器")}
        aria-hidden={!open}
        // On tablet/mobile the closed inspector remains in the DOM to preserve
        // its transition. `inert` makes that off-canvas tree impossible to tab
        // into or expose to assistive technology until the explicit open action.
        inert={!open}
      >
        <div className="ci-evidence-head">
          <div>
            <div className="fin-eyebrow">{pick(zh, "EVIDENCE", "证据")}</div>
            <h3>{pick(zh, "Event receipt", "事件凭证")}</h3>
          </div>
          <button
            ref={closeRef}
            className="ci-icon-button ci-evidence-close"
            onClick={onClose}
            aria-label={pick(zh, "Close evidence inspector", "关闭证据检查器")}
          >
            ×
          </button>
        </div>

        {evidence ? (
          <div className="ci-evidence-body">
            <div className="ci-evidence-kicker">
              <span className="fin-tag" style={{ "--c": "var(--brand-2)" } as React.CSSProperties}>
                {pick(zh, evidence.label, evidence.label)}
              </span>
              <span className="ci-event-code num">{event.fiscal_year}Q{event.fiscal_quarter}</span>
            </div>
            <blockquote>{evidence.text}</blockquote>

            {evidence.derived_comparison && (
              <div className="ci-evidence-derived" role="note">
                <span>{pick(zh, "DERIVED COMPARISON", "派生比较")}</span>
                <p>{evidence.derived_comparison}</p>
              </div>
            )}

            <div className="ci-receipt-card">
              <div className="ci-receipt-row">
                <span>{pick(zh, "Source family", "来源类别")}</span>
                <b>{evidence.source ? sourceLabel(evidence.source.kind, zh) : pick(zh, "Event record", "事件记录")}</b>
              </div>
              <div className="ci-receipt-row">
                <span>{pick(zh, "Coverage", "覆盖")}</span>
                <b>{evidence.source ? sourceStatus(evidence.source.status, zh) : pick(zh, "Metadata", "元数据")}</b>
              </div>
              <div className="ci-receipt-row">
                <span>{pick(zh, "Source material", "来源材料")}</span>
                <b>{precision === "document" ? pick(zh, "Document available", "文档可用") : pick(zh, "Metadata record", "元数据记录")}</b>
              </div>
              {evidence.source?.receipt?.source_date && (
                <div className="ci-receipt-row">
                  <span>{pick(zh, "Source date", "来源日期")}</span>
                  <time className="num" dateTime={evidence.source.receipt.source_date}>{evidence.source.receipt.source_date.slice(0, 10)}</time>
                </div>
              )}
              {receipt && (
                <div className="ci-receipt-hash">
                  <span>{pick(zh, "Receipt ID", "凭证编号")}</span>
                  <code title={receipt}>{receipt.length > 24 ? `${receipt.slice(0, 12)}…${receipt.slice(-8)}` : receipt}</code>
                </div>
              )}
            </div>

            <div className="ci-evidence-note" role="note">
              <span aria-hidden>i</span>
              <p>
                {evidence.source
                  ? pick(
                      zh,
                      evidence.derived_comparison
                        ? "This receipt covers the reported current-event value. The derived comparison above is separate and is not attributed to this source alone. Exact paragraph or source-span pinning is still pending."
                        : "This normalized field is attributed to the source family above. Exact paragraph or source-span pinning is still pending, so this is not presented as a line-level citation.",
                      evidence.derived_comparison
                        ? "本凭证仅覆盖所报告的当期事件数值。上方派生比较独立呈现，不会仅归属于该来源。精确到段落或来源片段的定位仍待补充。"
                        : "该标准化字段已归属于上方来源类别。精确到段落或来源片段的定位仍待补充，因此不会呈现为逐行引用。",
                    )
                  : pick(
                      zh,
                      "This item is retained at the event-record level. Exact field origin and source-span attribution are pending.",
                      "本条信息保留在事件记录层级；精确字段来源及来源片段归因仍待补充。",
                    )}
              </p>
            </div>

            <div className="ci-evidence-actions">
              {txId && (
                <button className="btn btn-primary" onClick={() => onOpenTranscript(txId)}>
                  {pick(zh, "Open transcript", "打开电话会")}
                </button>
              )}
              {evidence.source?.url?.startsWith("https://") && (
                <a className="btn btn-ghost" href={evidence.source.url} target="_blank" rel="noreferrer">
                  {pick(zh, "Open source", "打开来源")}
                </a>
              )}
            </div>
          </div>
        ) : (
          <div className="ci-evidence-empty">
            <div className="ci-evidence-orbit" aria-hidden><i /><i /><i /></div>
            <strong>{pick(zh, "Select a research claim", "选择研究观点")}</strong>
            <p>{pick(zh, "Its source state and receipt will appear here without obscuring the brief.", "来源状态与凭证将在此显示，同时保留事件简报上下文。")}</p>
          </div>
        )}
      </aside>
    </>
  );
}
