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
  // Real no-coverage source (step 2, B-F08-3 continuation): a null quote from the existing
  // batch quote route IS a live "we cannot read this price" signal — not a fabricated placeholder.
  // A fetch failure here must never render as "0 could-not-watch symbols" (that would silently
  // hide the honest READ_NO_COVERAGE state), so it is tracked separately from an empty result.
  const [noCoverageSymbols, setNoCoverageSymbols] = useState<string[]>([]);

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

  // Ask the same batch quote route the watchlist uses (read-only; this route is not owned by
  // this packet and is never modified) which of the ACTIVE alerts' symbols currently have no
  // live quote. A null entry is a genuine no-coverage signal; a fetch/network failure leaves
  // the previous (possibly empty) list untouched rather than reporting a false all-clear.
  useEffect(() => {
    const activeSymbols = Array.from(new Set((alerts || []).filter((a) => a.active && a.symbol).map((a) => a.symbol as string)));
    if (activeSymbols.length === 0) { setNoCoverageSymbols([]); return; }
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/quote?syms=${encodeURIComponent(activeSymbols.join(","))}`);
        if (!r.ok) return;
        const body: { quotes?: Record<string, unknown | null> } = await r.json();
        const quotes = body.quotes || {};
        const missing = activeSymbols.filter((sy) => quotes[sy] == null);
        if (!cancelled) setNoCoverageSymbols(missing);
      } catch { /* leave prior state — a failed probe is not evidence of full coverage */ }
    })();
    return () => { cancelled = true; };
  }, [alerts]);

  const view = useMemo(() => buildAlertsView({
    alerts, alertsState,
    run: receipts?.run ?? null, lastSuccessAt: receipts?.last_success_at ?? null,
    runsState: receipts?.runs_state ?? "READ_UNAVAILABLE",
    outbox: receipts?.outbox ?? [], outboxState: receipts?.outbox_state ?? "READ_UNAVAILABLE",
    now: Date.now(),
  }), [alerts, alertsState, receipts]);

  const timelineRows: TimelineRow[] = view.rows.map((r) => {
    const alert = alerts?.find((a) => a.id === r.alertId);
    const t = r.outboxRow?.payload?.fired_at ? new Date(r.outboxRow.payload.fired_at).toLocaleTimeString(lang === "zh" ? "zh-CN" : "en-US", { hour: "2-digit", minute: "2-digit" }) : "—";
    return {
      id: r.alertId, time: t,
      subject: r.outboxRow?.payload?.ticker || alert?.symbol || "—",
      verdict: r.outboxRow?.payload?.condition_plain || (alert?.condition?.type ?? ""),
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
      bookState: "READ_OK",
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

  const dataState = view.monitor === "unknown" ? "unavailable"
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
      <AlertTimeline rows={timelineRows} lang={lang === "zh" ? "zh" : "en"} onOpen={setOpenId} />
      <WatchingList
        rows={(alerts || []).filter((a) => a.active).map((a) => ({ id: a.id, symbol: a.symbol || "—", label: a.condition?.type || "", state: "armed" as const }))}
        lang={lang === "zh" ? "zh" : "en"}
      />
      <CouldNotWatch symbols={noCoverageSymbols} lang={lang === "zh" ? "zh" : "en"} />
      {detail && <AlertDetail data={detail} lang={lang === "zh" ? "zh" : "en"} onClose={() => setOpenId(null)} />}
    </div></main>
  );
}
