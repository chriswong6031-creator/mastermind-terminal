"use client";
import { useT } from "@/lib/i18n";
import { washoutTurnRead } from "@/lib/washoutTurn";

export default function WashoutTurnRow({ wt, zh }: { wt?: unknown; zh: boolean }) {
  const t = useT();
  const read = washoutTurnRead(wt, zh);
  if (!read) return null;
  return (
    <div className="wt-box" data-state={read.state}
         style={{ ["--wt-c" as any]: read.turn ? "var(--buy)" : "var(--text-2)" }}>
      <div className="wt-row">
        <span className="wt-lbl">{t("wtLbl")}</span>
        <span className="wt-head">{read.head}</span>
      </div>
      <div className="wt-sub">{read.detail ? `${read.detail} · ${read.stance}` : read.stance}</div>
      <div className="wt-receipt">{read.receipt}</div>
    </div>
  );
}
