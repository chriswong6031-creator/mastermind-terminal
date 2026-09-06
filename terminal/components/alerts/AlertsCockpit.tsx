"use client";
import { useEffect, useMemo, useState, useCallback } from "react";
import s from "./alerts.module.css";
import AnswerLine from "./AnswerLine";
import AlertTimeline, { type TimelineRow } from "./AlertTimeline";
import WatchingList from "./WatchingList";
import CouldNotWatch from "./CouldNotWatch";
import AlertDetail, { type AlertDetailData } from "./AlertDetail";
import { NewAlertPanel } from "@/components/AlertsView";
import {
  buildAlertsView, copy, type Alert, type ReadState, type RunReceipt, type OutboxRow,
} from "@/lib/alertsView";
import { useLang } from "@/lib/i18n";

interface AlertsResp { alerts?: Alert[]; error?: string }
interface ReceiptsResp {
  run: RunReceipt | null; runs_state: ReadState; last_success_at: string | null;
  last_success_state?: ReadState; outbox?: OutboxRow[]; outbox_state: ReadState;
}

const UNAVAILABLE_RECEIPTS: ReceiptsResp = {
  run: null, runs_state: "READ_UNAVAILABLE", last_success_at: null,
  last_success_state: "READ_UNAVAILABLE", outbox_state: "READ_UNAVAILABLE",
};

export default function AlertsCockpit({ email }: { email: string }) {
  const { lang } = useLang();
  const L = lang === "zh" ? "zh" : "en";
  const [alerts, setAlerts] = useState<Alert[] | null>(null);
  const [alertsState, setAlertsState] = useState<ReadState>("READ_UNAVAILABLE");
  const [receipts, setReceipts] = useState<ReceiptsResp | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/alerts");
      if (r.status === 401) { setAlertsState("READ_UNAVAILABLE"); setAlerts(null); }
      else if (!r.ok) { setAlertsState("READ_UNAVAILABLE"); setAlerts(null); }
      else {
        const body: AlertsResp = await r.json();
        const rows = body.alerts || [];
        setAlerts(rows);
        setAlertsState(rows.length === 0 ? "READ_OK_ZERO" : "READ_OK");
      }
    } catch { setAlertsState("READ_UNAVAILABLE"); setAlerts(null); }
    try {
      const rr = await fetch("/api/alerts/receipts");
      setReceipts(rr.ok ? await rr.json() : UNAVAILABLE_RECEIPTS);
    } catch {
      setReceipts(UNAVAILABLE_RECEIPTS);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // `alertsState` (the raw /api/alerts read) is passed straight through — never overloaded with
  // the evaluator's "some symbols unpriced" signal. READ_NO_COVERAGE is not a real output of this
  // read; the "could not price N symbols" fact is `noCoverageCount` below, sourced only from the
  // run receipt's own `unevaluable_n`, and rendered by CouldNotWatch as its own module. Folding it
  // into alertsState previously nulled a perfectly-known list count and printed "watching 0
  // conditions" whenever any symbol was unpriced (major: read-state overloading).
  const view = useMemo(() => buildAlertsView({
    alerts, alertsState,
    run: receipts?.run ?? null, lastSuccessAt: receipts?.last_success_at ?? null,
    lastSuccessState: receipts?.last_success_state ?? "READ_UNAVAILABLE",
    runsState: receipts?.runs_state ?? "READ_UNAVAILABLE",
    outbox: receipts?.outbox ?? [], outboxState: receipts?.outbox_state ?? "READ_UNAVAILABLE",
    now: Date.now(),
  }), [alerts, alertsState, receipts]);

  const timelineRows: TimelineRow[] = view.rows.map((r) => {
    const alert = alerts?.find((a) => a.id === r.alertId);
    const t = r.outboxRow?.payload?.fired_at ? new Date(r.outboxRow.payload.fired_at).toLocaleTimeString(L === "zh" ? "zh-CN" : "en-US", { hour: "2-digit", minute: "2-digit" }) : "—";
    return {
      id: r.alertId, time: t,
      subject: r.outboxRow?.payload?.ticker || alert?.symbol || "—",
      verdict: r.outboxRow?.payload?.condition_plain || (L === "zh" ? "条件" : "Condition"),
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
      // Holding resolution is by ticker only — there is no portfolio/position join yet (F08 V2
      // owns true holding-coverage mapping). `null` means the ticker itself could not be
      // established, in which case the honest answer is "not covered", never a guess.
      holdingSymbol: alert.symbol ?? row.outboxRow?.payload?.ticker ?? null,
      summaryPlain: row.outboxRow?.payload?.summary_plain ?? null,
      conditionPlain: row.outboxRow?.payload?.condition_plain ?? null,
      firedAt: row.outboxRow?.payload?.fired_at ?? null,
      armedAt: alert.created_at,
      evidenceUrl: row.outboxRow?.payload?.evidence_url ?? null,
      lastAttemptAt: view.lastAttemptAt,
      lastAttemptState: view.lastAttemptState,
      lastSuccessAt: view.lastSuccessAt,
      lastSuccessState: view.lastSuccessState,
      // A disarmed (fired) alert is "open" — unacknowledged — never "resolved": nothing in this
      // data model records that a person has seen or dismissed it (major: two-way guess collapsed
      // a fired-but-unseen alert into a false "Resolved" label).
      resolution: alert.active ? "armed" : "open",
      delivery: row.delivery,
      attempts: row.outboxRow?.attempts ?? 0,
      lastError: row.outboxRow?.last_error ?? null,
      deliverAfter: row.outboxRow?.deliver_after ?? null,
    };
  }, [openId, view, alerts]);

  // The raw list read failing is a DIFFERENT fact from the run/outbox reads failing — either can
  // happen independently (they are separate tables/routes). Both are honestly "we don't know",
  // never a fabricated calm zero (blocker: nulls printed as zero).
  const listUnavailable = alertsState === "READ_UNAVAILABLE";

  const dataState: "unavailable" | "never-ran" | "no-coverage" | "degraded" | "calm-empty" | "calm" =
    view.monitor === "unknown" ? "unavailable"
    : listUnavailable ? "unavailable"
    : view.monitor === "never_ran" ? "never-ran"
    : (view.noCoverageCount ?? 0) > 0 ? "no-coverage"
    : view.monitor === "degraded" ? "degraded"
    : timelineRows.length === 0 ? "calm-empty" : "calm";

  const scrollToAddWatch = useCallback(() => {
    document.getElementById("alerts-manage")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  return (
    <main className="main2"><div className="pg" data-alerts-state={dataState}>
      <AnswerLine
        monitor={view.monitor} lastAttemptAt={view.lastAttemptAt} lastAttemptState={view.lastAttemptState}
        lastSuccessAt={view.lastSuccessAt} lastSuccessState={view.lastSuccessState}
        coverageCount={view.coverage.count} lang={L}
      />
      {/* Every empty/degraded module below is exactly one calm paragraph + exactly one wired
          action. Priority order: an outright outage (monitor unknown, or the list read itself
          unavailable) always wins over the calmer "degraded"/"never ran" readings, because it is
          the least certain thing we can honestly say. */}
      {(view.monitor === "unknown" || listUnavailable) && (
        <div className={s.module} data-alerts-module="outage">
          <p className={s.calmBody}>{copy(view.monitor === "unknown" ? "outage.body" : "listUnavailable.body", L)}</p>
          <button type="button" className={`btn ${s.emptyAction}`} onClick={load}>{copy("outage.action", L)}</button>
        </div>
      )}
      {view.monitor !== "unknown" && !listUnavailable && view.monitor === "never_ran" && (
        <div className={s.module} data-alerts-module="never-ran">
          <p className={s.neverRanBody}>{copy("neverRan.body", L)}</p>
          <button type="button" className={`btn ${s.emptyAction}`} onClick={load}>{copy("neverRan.action", L)}</button>
        </div>
      )}
      {view.monitor !== "unknown" && !listUnavailable && view.monitor === "degraded" && (
        <div className={s.module} data-alerts-module="degraded">
          <p className={s.degradedBody}>{copy("degraded.body", L, { t: view.lastSuccessAt ? new Date(view.lastSuccessAt).toLocaleTimeString(L === "zh" ? "zh-CN" : "en-US") : copy(view.lastSuccessState === "READ_UNAVAILABLE" ? "null.cannotRead" : "null.notRecorded", L) })}</p>
          <button type="button" className={`btn ${s.emptyAction}`} onClick={load}>{copy("degraded.action", L)}</button>
        </div>
      )}
      {view.monitor === "watching" && !listUnavailable && timelineRows.length === 0 && (
        <div className={s.module} data-alerts-module="calm-empty">
          <p className={s.calmBody}>{copy("empty.calm", L, { n: view.coverage.count ?? 0 })}</p>
          <button type="button" className={`btn ${s.emptyAction}`} onClick={scrollToAddWatch}>{copy("empty.calm.action", L)}</button>
        </div>
      )}
      <AlertTimeline rows={timelineRows} lang={L} onOpen={setOpenId} spineState={dataState} />
      <WatchingList
        rows={(alerts || []).filter((a) => a.active).map((a) => ({ id: a.id, symbol: a.symbol || "—", label: a.condition?.type || "", state: "armed" as const }))}
        unavailable={listUnavailable}
        lang={L}
      />
      <div id="alerts-manage" className={s.module} data-alerts-module="add-watch">
        <NewAlertPanel email={email} />
      </div>
      <CouldNotWatch count={view.noCoverageCount ?? 0} lang={L} />
      {detail && <AlertDetail data={detail} lang={L} onClose={() => setOpenId(null)} />}
    </div></main>
  );
}
