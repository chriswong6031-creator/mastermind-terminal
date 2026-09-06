"use client";
import s from "./alerts.module.css";
import { copy, conditionsWord } from "@/lib/alertsView";

export interface WatchingRow { id: string; symbol: string; label: string; state: "armed" | "paused" }

// `unavailable` means the underlying /api/alerts read itself failed — a genuinely different fact
// from "you have zero alerts". Printing "0 conditions" for both is the fabricated-zero bug this
// prop exists to prevent: an honest unknown must never look like a confirmed empty list.
export default function WatchingList({ rows, lang, unavailable }: { rows: WatchingRow[]; lang: "en" | "zh"; unavailable?: boolean }) {
  return (
    <div className={s.module}>
      <div className={s.moduleHead}>
        <span>{lang === "zh" ? "正在为你监控" : "What we're watching for you"}</span>
        {/* Minor 2 (round-3 review): "1 conditions" — EN needs singular/plural agreement. */}
        <span className={s.moduleCount}>{unavailable ? copy("null.cannotRead", lang) : `${rows.length} ${conditionsWord(rows.length, lang)}`}</span>
      </div>
      <div>
        {rows.map((r) => (
          <div key={r.id} className={s.row}>
            <span className={s.subject}>{r.symbol}</span>
            <span className={s.verdict}>{r.label}</span>
            <span className={s.moduleCount}>{r.state === "armed" ? (lang === "zh" ? "已启用" : "Armed") : (lang === "zh" ? "已暂停" : "Paused")}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
