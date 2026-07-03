"use client";
/**
 * TranscriptDrawer — right slide-in over the MegaPane hosting an earnings-call
 * transcript (BUILD-SPEC §3.4 FE2a, spec/statements-transcript.md §7).
 *
 * Loads via getTx(sym, id). Speaker name+role bold, spoken text normal weight.
 * Its OWN Esc handler registers on `window` with capture + stopPropagation so it
 * closes the drawer BEFORE MegaPane's Esc (which would close the whole pane).
 * Loading + error states; absence of a transcript = the doc-icon never renders
 * upstream, so we only get here for real ids — but the fetch can still miss.
 */
import { useEffect, useState } from "react";
import { useLang } from "../../lib/i18n";
import { pick, fmtDate } from "../../lib/finFormat";
import { getTx, type Transcript } from "../../lib/fund";

export interface TranscriptDrawerProps {
  sym: string;
  /** defeatbeta fiscal id, e.g. "2026Q3". */
  id: string;
  /** Company display name for the title fallback. */
  name?: string | null;
  onClose: () => void;
}

export default function TranscriptDrawer({ sym, id, name, onClose }: TranscriptDrawerProps) {
  const { lang } = useLang();
  const zh = lang === "zh";
  const [tx, setTx] = useState<Transcript | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");

  // load transcript
  useEffect(() => {
    let alive = true;
    setState("loading");
    setTx(null);
    getTx(sym, id)
      .then((t) => {
        if (!alive) return;
        if (t) {
          setTx(t);
          setState("ok");
        } else {
          setState("error");
        }
      })
      .catch(() => alive && setState("error"));
    return () => {
      alive = false;
    };
  }, [sym, id]);

  // OWN Esc handler — capture phase + stopImmediatePropagation so it wins over
  // MegaPane's SAME-target (window/capture) Esc listener. stopPropagation alone
  // does NOT stop sibling listeners on the same target, so Esc would otherwise
  // reach MegaPane's handler and close the whole pane (belt: MegaPane also
  // early-returns while a drawer is open).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true } as any);
  }, [onClose]);

  // title: prefer the transcript's own title; else compose from name + period
  const title =
    tx?.title ||
    `${name || sym}${tx?.period ? `, ${pick(zh, "Earnings", "财报电话会")}, ${tx.period}` : ""}`;

  return (
    <>
      <div className="fin-drawer-scrim" onClick={onClose} aria-hidden />
      <aside className="fin-drawer fin-tx-drawer" role="dialog" aria-modal="true" aria-label={title}>
        <div className="fin-drawer-h">
          <div className="fin-tx-head">
            <div className="fin-tx-crumb">{pick(zh, "Documents", "文档")}</div>
            <div className="fin-tx-title">{title}</div>
            {tx?.date && <div className="fin-tx-date">{fmtDate(tx.date)}</div>}
          </div>
          <button className="x" onClick={onClose} aria-label={pick(zh, "Close", "关闭")}>
            ×
          </button>
        </div>
        <div className="fin-drawer-body fin-tx-body">
          {state === "loading" && (
            <div className="fin-tx-status">{pick(zh, "Loading transcript…", "正在加载记录…")}</div>
          )}
          {state === "error" && (
            <div className="fin-tx-status">
              {pick(zh, "Transcript unavailable for this period.", "该期无可用记录。")}
            </div>
          )}
          {state === "ok" && tx && (
            <>
              <div className="fin-tx-section">{pick(zh, "Call transcript", "电话会记录")}</div>
              {tx.segments.length === 0 && (
                <div className="fin-tx-status">{pick(zh, "Empty transcript.", "记录为空。")}</div>
              )}
              {tx.segments.map((s, i) => (
                <p className="fin-tx-seg" key={i}>
                  <b className="fin-tx-speaker">
                    {s.speaker}
                    {s.role ? ` (${s.role})` : ""}:
                  </b>{" "}
                  <span className="fin-tx-text">{s.text}</span>
                </p>
              ))}
            </>
          )}
        </div>
      </aside>
    </>
  );
}
