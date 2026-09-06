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
  rows, lang, onOpen, spineState,
}: { rows: TimelineRow[]; lang: "en" | "zh"; onOpen: (id: string) => void; spineState: "calm" | "calm-empty" | "degraded" | "unavailable" | "no-coverage" | "never-ran" }) {
  return (
    <div className={s.module}>
      <div className={s.moduleHead}>
        {/* Not anchored to a last-visit timestamp yet (Major 4) — "recent activity" makes
            no claim about when the account last looked, unlike "new"/"since you were here". */}
        <span>{lang === "zh" ? "近期活动" : "Recent activity"}</span>
        {rows.length > 0 && <span className={s.moduleCount}>{rows.length} {lang === "zh" ? "条" : "shown"}</span>}
      </div>
      <div className={s.spine} data-alerts-state={spineState}>
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
