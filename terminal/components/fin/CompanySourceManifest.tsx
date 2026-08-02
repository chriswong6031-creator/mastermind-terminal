"use client";

import { useLang } from "../../lib/i18n";
import { pick } from "../../lib/finFormat";
import type {
  CompanyIntelligenceEvent,
  CompanyIntelligenceSource,
} from "../../lib/companyIntelligence";

export interface CompanySourceManifestProps {
  event: CompanyIntelligenceEvent;
  onOpenTranscript: (id: string) => void;
  compact?: boolean;
}

function label(kind: CompanyIntelligenceSource["kind"], zh: boolean): string {
  if (kind === "transcript") return pick(zh, "Earnings call transcript", "财报电话会记录");
  if (kind === "score_overlay") return pick(zh, "Structured event analysis", "结构化事件分析");
  return pick(zh, "Historical earnings record", "历史财报记录");
}

function note(source: CompanyIntelligenceSource, zh: boolean): string {
  if (source.status === "present" && source.kind === "transcript") {
    return pick(zh, "Normalized call body available", "标准化电话会正文可用");
  }
  if (source.status === "present") return pick(zh, "Source-backed event record", "具备来源支持的事件记录");
  if (source.status === "metadata_only") return pick(zh, "Metadata retained; raw source is not linked", "已保留元数据；尚未关联原始来源");
  return pick(zh, "Not available for this event", "本事件暂无此来源");
}

function statusLabel(source: CompanyIntelligenceSource, zh: boolean): string {
  if (source.status === "present") return pick(zh, "Present", "可用");
  if (source.status === "metadata_only") return pick(zh, "Metadata only", "仅元数据");
  return pick(zh, "Missing", "缺失");
}

function txId(url: string | null): string | null {
  const match = url?.match(/\/(\d{4}Q[1-4])\.json\.gz(?:[?#].*)?$/);
  return match?.[1] ?? null;
}

export default function CompanySourceManifest({ event, onOpenTranscript, compact = false }: CompanySourceManifestProps) {
  const { lang } = useLang();
  const zh = lang === "zh";

  return (
    <ul className={`ci-source-list${compact ? " compact" : ""}`} aria-label={pick(zh, "Event sources", "事件来源")}>
      {event.sources.map((source, index) => {
        const id = txId(source.url);
        const color = source.status === "present" ? "var(--up)" : source.status === "metadata_only" ? "var(--warn)" : "var(--muted)";
        return (
          <li key={`${source.kind}:${index}`}>
            <span className="ci-source-icon" style={{ "--ci-source": color } as React.CSSProperties} aria-hidden>
              {source.kind === "transcript" ? "T" : source.kind === "score_overlay" ? "◇" : "H"}
            </span>
            <span className="ci-source-copy">
              <strong>{label(source.kind, zh)}</strong>
              <small>{note(source, zh)}</small>
            </span>
            <span className="ci-source-state">
              <span className="fin-tag" style={{ "--c": color } as React.CSSProperties}>{statusLabel(source, zh)}</span>
              {!compact && id && <button onClick={() => onOpenTranscript(id)}>{pick(zh, "Read", "阅读")} ›</button>}
              {!compact && source.url?.startsWith("https://") && (
                <a href={source.url} target="_blank" rel="noreferrer">{pick(zh, "Open", "打开")} ↗</a>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
