"use client";
import s from "./alerts.module.css";
import { copy, type DeliveryState } from "@/lib/alertsView";

export interface TimelineRow {
  id: string; time: string; subject: string; verdict: string;
  delivery: DeliveryState; foldedRows: number;
}

const CHIP_CLASS: Record<DeliveryState, string> = {
  sent: s.chipSent, failed: s.chipFailed, deferred: s.chipDeferred,
  pending: s.chipPending, suppressed: s.chipSuppressed, unconfirmed: s.chipUnconfirmed,
};

export default function AlertTimeline({
  rows, lang, onOpen,
}: { rows: TimelineRow[]; lang: "en" | "zh"; onOpen: (id: string) => void }) {
  return (
    <div className={s.module}>
      <div className={s.moduleHead}>
        <span>{lang === "zh" ? "自上次访问以来" : "Since you were here"}</span>
        {rows.length > 0 && <span className={s.moduleCount}>{rows.length} {lang === "zh" ? "条新" : "new"}</span>}
      </div>
      <div className={s.spine} data-alerts-state={rows.length ? "calm" : "calm-empty"}>
        {rows.map((r) => (
          <div
            key={r.id} className={s.row} role="button" tabIndex={0} data-delivery={r.delivery}
            onClick={() => onOpen(r.id)}
            onKeyDown={(e) => { if (e.key === "Enter") onOpen(r.id); }}
          >
            <span className={s.dot} />
            <span className={s.time}>{r.time}</span>
            <span className={s.subject}>{r.subject}</span>
            <span className={s.verdict}>{r.verdict}</span>
            <span className={`${s.chip} ${CHIP_CLASS[r.delivery]}`}>{copy(`delivery.${r.delivery}`, lang)}</span>
            {r.foldedRows > 0 && <span className={s.moduleCount}>{copy("folded.note", lang, { n: r.foldedRows })}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
