"use client";
import s from "./alerts.module.css";
import { copy, type MonitorState } from "@/lib/alertsView";

function fmtTime(iso: string | null, lang: "en" | "zh"): string {
  if (!iso) return copy("null.notRecorded", lang);
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return copy("null.notRecorded", lang);
  return d.toLocaleTimeString(lang === "zh" ? "zh-CN" : "en-US", { hour: "2-digit", minute: "2-digit" });
}

export default function AnswerLine({
  monitor, lastAttemptAt, lastSuccessAt, coverageCount, lang,
}: {
  monitor: MonitorState; lastAttemptAt: string | null; lastSuccessAt: string | null;
  coverageCount: number | null; lang: "en" | "zh";
}) {
  const stanceClass = monitor === "watching" ? s.stanceWatching : monitor === "degraded" ? s.stanceDegraded : s.stanceMuted;
  const stanceText =
    monitor === "watching" ? copy("monitor.watching", lang)
    : monitor === "degraded" ? copy("monitor.degraded", lang, { t: fmtTime(lastSuccessAt, lang) })
    : monitor === "never_ran" ? copy("monitor.never_ran", lang)
    : copy("monitor.unknown", lang);

  return (
    <div className={s.answerLine} data-monitor-state={monitor}>
      <span className={`${s.stance} ${stanceClass}`}>{stanceText}</span>
      <span className={s.facts}>
        <span>{copy("fact.lastAttempt", lang)} <span className={s.factNum}>{fmtTime(lastAttemptAt, lang)}</span></span>
        <span>{copy("fact.lastSuccess", lang)} <span className={s.factNum}>{fmtTime(lastSuccessAt, lang)}</span></span>
      </span>
      <span className={s.coverage}>{coverageCount !== null ? coverageCount : copy("null.cannotRead", lang)}</span>
    </div>
  );
}
