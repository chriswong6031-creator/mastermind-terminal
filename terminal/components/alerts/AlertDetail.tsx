"use client";
import s from "./alerts.module.css";
import { copy, type DeliveryState, type ReadState, type ResolutionState } from "@/lib/alertsView";

export interface AlertDetailData {
  conditionText: string;
  // Ticker only — there is no portfolio/position join yet (F08 V2 owns true holding-coverage
  // mapping). `null` means the ticker itself could not be resolved, never a fabricated match.
  holdingSymbol: string | null;
  summaryPlain: string | null;
  conditionPlain: string | null;
  firedAt: string | null;
  armedAt: string;
  evidenceUrl: string | null;
  lastAttemptAt: string | null;
  lastAttemptState: ReadState;
  lastSuccessAt: string | null;
  lastSuccessState: ReadState;
  resolution: ResolutionState;
  delivery: DeliveryState;
  attempts: number;
  lastError: string | null;
  deliverAfter: string | null;
}

export default function AlertDetail({ data, lang, onClose }: { data: AlertDetailData; lang: "en" | "zh"; onClose: () => void }) {
  const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString(lang === "zh" ? "zh-CN" : "en-US") : copy("null.notRecorded", lang));
  const fmtState = (iso: string | null, state: ReadState) => {
    if (iso) return new Date(iso).toLocaleString(lang === "zh" ? "zh-CN" : "en-US");
    return copy(state === "READ_UNAVAILABLE" ? "null.cannotRead" : "null.notRecorded", lang);
  };
  return (
    <div className={s.detail} data-alerts-state="drillback" role="dialog" aria-label={lang === "zh" ? "警报详情" : "Alert detail"}>
      <button type="button" onClick={onClose}>{lang === "zh" ? "关闭" : "Close"}</button>
      <div className={s.detailFact}><span className={s.detailLabel}>{lang === "zh" ? "条件" : "Condition"}</span><span>{data.conditionText}</span></div>
      <div className={s.detailFact}>
        <span className={s.detailLabel}>{lang === "zh" ? "持仓" : "Holding"}</span>
        <span>{data.holdingSymbol ? <a href="/portfolio">{data.holdingSymbol}</a> : copy("null.notCovered", lang)}</span>
      </div>
      <div className={s.detailFact}><span className={s.detailLabel}>{lang === "zh" ? "发生了什么" : "What changed"}</span><span>{data.summaryPlain || data.conditionPlain || copy("null.notRecorded", lang)}</span></div>
      <div className={s.detailFact}><span className={s.detailLabel}>{lang === "zh" ? "时间线" : "Timeframe"}</span><span>{fmt(data.firedAt)} · {lang === "zh" ? "建立于" : "armed"} {fmt(data.armedAt)}</span></div>
      <div className={s.detailFact}>
        <span className={s.detailLabel}>{lang === "zh" ? "证据" : "Evidence"}</span>
        <span>{data.evidenceUrl ? <a href={data.evidenceUrl}>{lang === "zh" ? "查看证据" : "View evidence"}</a> : (lang === "zh" ? "无证据链接" : "no evidence link")}</span>
      </div>
      <div className={s.detailFact}><span className={s.detailLabel}>{copy("fact.lastAttempt", lang)}</span><span>{fmtState(data.lastAttemptAt, data.lastAttemptState)}</span></div>
      <div className={s.detailFact}><span className={s.detailLabel}>{copy("fact.lastSuccess", lang)}</span><span>{fmtState(data.lastSuccessAt, data.lastSuccessState)}</span></div>
      <div className={s.ceiling}>{copy("ceiling", lang)}</div>
      <div className={s.detailFact}><span className={s.detailLabel}>{lang === "zh" ? "解决状态" : "Resolution"}</span><span>{copy(`resolution.${data.resolution}`, lang)}</span></div>
      <div className={s.detailFact}><span className={s.detailLabel}>{lang === "zh" ? "投递结果" : "Delivery"}</span><span>{copy(`delivery.${data.delivery}`, lang)}</span></div>
      <details className={s.receiptDisclosure}>
        <summary>{lang === "zh" ? "回执" : "Receipt"}</summary>
        <div>{copy("receipt.attempts", lang)}: {data.attempts}</div>
        <div>{copy("receipt.lastError", lang)}: {data.lastError ?? copy("null.notRecorded", lang)}</div>
        <div>{copy("receipt.deliverAfter", lang)}: {data.deliverAfter ? fmt(data.deliverAfter) : copy("null.notRecorded", lang)}</div>
      </details>
    </div>
  );
}
