"use client";
import s from "./alerts.module.css";

export interface WatchingRow { id: string; symbol: string; label: string; state: "armed" | "paused" }

export default function WatchingList({ rows, lang }: { rows: WatchingRow[]; lang: "en" | "zh" }) {
  return (
    <div className={s.module}>
      <div className={s.moduleHead}>
        <span>{lang === "zh" ? "正在为你监控" : "What we're watching for you"}</span>
        <span className={s.moduleCount}>{rows.length} {lang === "zh" ? "项条件" : "conditions"}</span>
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
