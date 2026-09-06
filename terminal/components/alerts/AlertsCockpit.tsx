"use client";
import { useEffect, useMemo, useState, useCallback } from "react";
import s from "./alerts.module.css";
import AnswerLine from "./AnswerLine";
import AlertTimeline, { type TimelineRow } from "./AlertTimeline";
import WatchingList from "./WatchingList";
import CouldNotWatch from "./CouldNotWatch";
import AlertDetail, { type AlertDetailData } from "./AlertDetail";
import {
  buildAlertsView, copy, type Alert, type ReadState, type RunReceipt, type OutboxRow,
} from "@/lib/alertsView";
import { useLang } from "@/lib/i18n";

interface AlertsResp { alerts?: Alert[]; error?: string }
interface ReceiptsResp {
  run: RunReceipt | null; runs_state: ReadState; last_success_at: string | null;
  outbox?: OutboxRow[]; outbox_state: ReadState;
}

export default function AlertsCockpit({ email }: { email: string }) {
  const { lang } = useLang();
  const [alerts, setAlerts] = useState<Alert[] | null>(null);
  const [alertsState, setAlertsState] = useState<ReadState>("READ_UNAVAILABLE");
  const [receipts, setReceipts] = useState<ReceiptsResp | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/alerts");
      if (r.status === 401) { setAlertsState("READ_UNAVAILABLE"); return; }
      if (!r.ok) { setAlertsState("READ_UNAVAILABLE"); return; }
      const body: AlertsResp = await r.json();
      const rows = body.alerts || [];
      setAlerts(rows);
      setAlertsState(rows.length === 0 ? "READ_OK_ZERO" : "READ_OK");
    } catch { setAlertsState("READ_UNAVAILABLE"); }
    try {
      const rr = await fetch("/api/alerts/receipts");
      if (rr.ok) setReceipts(await rr.json());
      else setReceipts({ run: null, runs_state: "READ_UNAVAILABLE", last_success_at: null, outbox_state: "READ_UNAVAILABLE" });
    } catch {
      setReceipts({ run: null, runs_state: "READ_UNAVAILABLE", last_success_at: null, outbox_state: "READ_UNAVAILABLE" });
    }
  }, []);

  useEffect(() => { load(); }, [load]);


  // The four-state read vocabulary (freeze §5) is decided HERE, from the evaluator's own
  // `unevaluable_n` on the run receipt — never from a client-side probe against an unrelated
  // display route. This is the only place READ_NO_COVERAGE is produced.
  const effectiveAlertsState: ReadState = useMemo(() => {
    if (alertsState !== "READ_OK" && alertsState !== "READ_OK_ZERO") return alertsState;
    const unevalN = receipts?.run?.unevaluable_n ?? null;
    return unevalN !== null && unevalN > 0 ? "READ_NO_COVERAGE" : alertsState;
  }, [alertsState, receipts]);

  const view = useMemo(() => buildAlertsView({
    alerts, alertsState: effectiveAlertsState,
    run: receipts?.run ?? null, lastSuccessAt: receipts?.last_success_at ?? null,
    runsState: receipts?.runs_state ?? "READ_UNAVAILABLE",
    outbox: receipts?.outbox ?? [], outboxState: receipts?.outbox_state ?? "READ_UNAVAILABLE",
    now: Date.now(),
  }), [alerts, effectiveAlertsState, receipts]);

  const timelineRows: TimelineRow[] = view.rows.map((r) => {
    const alert = alerts?.find((a) => a.id === r.alertId);
    const t = r.outboxRow?.payload?.fired_at ? new Date(r.outboxRow.payload.fired_at).toLocaleTimeString(lang === "zh" ? "zh-CN" : "en-US", { hour: "2-digit", minute: "2-digit" }) : "—";
    return {
      id: r.alertId, time: t,
      subject: r.outboxRow?.payload?.ticker || alert?.symbol || "—",
      verdict: r.outboxRow?.payload?.condition_plain || (lang === "zh" ? "条件" : "Condition"),
      delivery: r.delivery, foldedRows: r.foldedRows,
    };
  });

  const detail: AlertDetailData | null = useMemo(() => {
    if (!openId) return null;
    const row = view.rows.find((r) => r.alertId === openId);
    const alert = alerts?.find((a) => a.id === openId);
    if (!row || !alert) return null;
    return {
      conditionText: row.outboxRow?.payload?.condition_plain || alert.condition?.type || "",
      holdingSymbol: alert.symbol ?? row.outboxRow?.payload?.ticker ?? null,
      bookState: view.coverage.state === "READ_NO_COVERAGE" ? "READ_NO_COVERAGE" : "READ_OK",
      summaryPlain: row.outboxRow?.payload?.summary_plain ?? null,
      conditionPlain: row.outboxRow?.payload?.condition_plain ?? null,
      firedAt: row.outboxRow?.payload?.fired_at ?? null,
      armedAt: alert.created_at,
      evidenceUrl: row.outboxRow?.payload?.evidence_url ?? null,
      lastAttemptAt: view.lastAttemptAt,
      lastSuccessAt: view.lastSuccessAt,
      resolution: alert.active ? "armed" : "resolved",
      delivery: row.delivery,
      attempts: row.outboxRow?.attempts ?? 0,
      lastError: row.outboxRow?.last_error ?? null,
      deliverAfter: row.outboxRow?.deliver_after ?? null,
    };
  }, [openId, view, alerts]);

  const dataState: "unavailable" | "never-ran" | "no-coverage" | "degraded" | "calm-empty" | "calm" =
    view.monitor === "unknown" ? "unavailable"
    : view.monitor === "never_ran" ? "never-ran"
    : view.coverage.state === "READ_NO_COVERAGE" ? "no-coverage"
    : view.monitor === "degraded" ? "degraded"
    : timelineRows.length === 0 ? "calm-empty" : "calm";

  return (
    <main className="main2"><div className="pg" data-alerts-state={dataState} data-email={email}>
      <AnswerLine
        monitor={view.monitor} lastAttemptAt={view.lastAttemptAt} lastSuccessAt={view.lastSuccessAt}
        coverageCount={view.coverage.count} lang={lang === "zh" ? "zh" : "en"}
      />
      {view.monitor === "degraded" && (
        <div className={s.module}>
          <p className={s.degradedBody}>{copy("degraded.body", lang === "zh" ? "zh" : "en", { t: view.lastSuccessAt ? new Date(view.lastSuccessAt).toLocaleTimeString() : copy("null.notRecorded", lang === "zh" ? "zh" : "en") })}</p>
          <button type="button" className={`btn ${s.emptyAction}`} onClick={load}>{copy("degraded.action", lang === "zh" ? "zh" : "en")}</button>
        </div>
      )}
      {view.monitor === "never_ran" && (
        <div className={s.module}><p className={s.neverRanBody}>{copy("neverRan.body", lang === "zh" ? "zh" : "en")}</p></div>
      )}
      {timelineRows.length === 0 && view.monitor === "watching" && (
        <div className={s.module}>
          <p className={s.calmBody}>{copy("empty.calm", lang === "zh" ? "zh" : "en", { n: view.coverage.count ?? 0 })}</p>
          <button type="button" className={`btn ${s.emptyAction}`}>{copy("empty.calm.action", lang === "zh" ? "zh" : "en")}</button>
        </div>
      )}
      <AlertTimeline rows={timelineRows} lang={lang === "zh" ? "zh" : "en"} onOpen={setOpenId} spineState={dataState} />
      <WatchingList
        rows={(alerts || []).filter((a) => a.active).map((a) => ({ id: a.id, symbol: a.symbol || "—", label: a.condition?.type || "", state: "armed" as const }))}
        lang={lang === "zh" ? "zh" : "en"}
      />
      <CouldNotWatch count={view.coverage.state === "READ_NO_COVERAGE" ? (view.noCoverageCount ?? 0) : 0} lang={lang === "zh" ? "zh" : "en"} />
      {detail && <AlertDetail data={detail} lang={lang === "zh" ? "zh" : "en"} onClose={() => setOpenId(null)} />}
    </div></main>
  );
}
