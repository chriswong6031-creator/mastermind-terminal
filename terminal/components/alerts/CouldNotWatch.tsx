"use client";
import s from "./alerts.module.css";
import { copy } from "@/lib/alertsView";

export default function CouldNotWatch({ symbols, lang }: { symbols: string[]; lang: "en" | "zh" }) {
  if (symbols.length === 0) return null;
  return (
    <div className={s.module} data-alerts-state="no-coverage">
      <div className={s.moduleHead}>
        <span>{lang === "zh" ? "今天未能监控的内容" : "What we could not watch today"}</span>
        <span className={s.moduleCount}>{symbols.length} {lang === "zh" ? "个来源" : "sources"}</span>
      </div>
      <p className={s.noCoverageBody}>{copy("noCoverage.body", lang, { n: symbols.length })}</p>
      <div className={s.row}>
        <span className={s.subject}>{lang === "zh" ? "价格" : "Prices for"} {symbols.join(", ")}</span>
        <span className={s.verdict}>{copy("null.notCovered", lang)}</span>
      </div>
    </div>
  );
}
