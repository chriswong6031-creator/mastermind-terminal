"use client";
import s from "./alerts.module.css";
import { copy, type DeliveryState, type ResolutionState } from "@/lib/alertsView";

export interface AlertDetailData {
  conditionText: string;
  holdingSymbol: string | null;
  bookState: "READ_OK" | "READ_NO_COVERAGE";
  summaryPlain: string | null;
  conditionPlain: string | null;
  firedAt: string | null;
  armedAt: string;
  evidenceUrl: string | null;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  resolution: ResolutionState;
  delivery: DeliveryState;
  attempts: number;
  lastError: string | null;
  deliverAfter: string | null;
}

export default function AlertDetail({ data, lang, onClose }: { data: AlertDetailData; lang: "en" | "zh"; onClose: () => void }) {
  const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString(lang === "zh" ? "zh-CN" : "en-US") : copy("null.notRecorded", lang));
  return (
    <div className={s.detail} data-alerts-state="drillback" role="dialog" aria-label={lang === "zh" ? "警报详情" : "Alert detail"}>
      <button type="button" onClick={onClose}>{lang === "zh" ? "关闭" : "Close"}</button>
      <div className={s.detailFact}><span className={s.detailLabel}>{lang === "zh" ? "条件" : "Condition"}</span><span>{data.conditionText}</span></div>
      <div className={s.detailFact}>
        <span className={s.detailLabel}>{lang === "zh" ? "持仓" : "Holding"}</span>
        <span>{data.bookState === "READ_NO_COVERAGE" || !data.holdingSymbol ? copy("null.notCovered", lang) : <a href="/portfolio">{data.holdingSymbol}</a>}</span>
      </div>
      <div className={s.detailFact}><span className={s.detailLabel}>{lang === "zh" ? "发生了什么" : "What changed"}</span><span>{data.summaryPlain || data.conditionPlain || copy("null.notRecorded", lang)}</span></div>
      <div className={s.detailFact}><span className={s.detailLabel}>{lang === "zh" ? "时间线" : "Timeframe"}</span><span>{fmt(data.firedAt)} · {lang === "zh" ? "建立于" : "armed"} {fmt(data.armedAt)}</span></div>
      <div className={s.detailFact}>
        <span className={s.detailLabel}>{lang === "zh" ? "证据" : "Evidence"}</span>
        <span>{data.evidenceUrl ? <a href={data.evidenceUrl}>{lang === "zh" ? "查看证据" : "View evidence"}</a> : (lang === "zh" ? "无证据链接" : "no evidence link")}</span>
      </div>
      <div className={s.detailFact}><span className={s.detailLabel}>{copy("fact.lastAttempt", lang)}</span><span>{fmt(data.lastAttemptAt)}</span></div>
      <div className={s.detailFact}><span className={s.detailLabel}>{copy("fact.lastSuccess", lang)}</span><span>{fmt(data.lastSuccessAt)}</span></div>
      <div className={s.ceiling}>{copy("ceiling", lang)}</div>
      <div className={s.detailFact}><span className={s.detailLabel}>{lang === "zh" ? "解决状态" : "Resolution"}</span><span>{data.resolution}</span></div>
      <div className={s.detailFact}><span className={s.detailLabel}>{lang === "zh" ? "投递结果" : "Delivery"}</span><span>{copy(`delivery.${data.delivery}`, lang)}</span></div>
      <details className={s.receiptDisclosure}>
        <summary>{lang === "zh" ? "回执" : "Receipt"}</summary>
        <div>attempts: {data.attempts}</div>
        <div>last_error: {data.lastError ?? "—"}</div>
        <div>deliver_after: {data.deliverAfter ?? "—"}</div>
      </details>
    </div>
  );
}
