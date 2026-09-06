"use client";
import { useEffect, useMemo, useState, useCallback, type ReactNode } from "react";
import s from "./alerts.module.css";
import AnswerLine from "./AnswerLine";
import AlertTimeline, { type TimelineRow } from "./AlertTimeline";
import WatchingList from "./WatchingList";
import CouldNotWatch from "./CouldNotWatch";
import AlertDetail, { type AlertDetailData } from "./AlertDetail";
import { NewAlertPanel } from "@/components/AlertsView";
import {
  buildAlertsView, conditionText, copy, ALERTS_CHANGED_EVENT,
  type Alert, type ReadState, type RunReceipt, type OutboxRow,
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

export default function AlertsCockpit({ email, children }: { email: string; children?: ReactNode }) {
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

  // The create form (NewAlertPanel below) and the separate existing-alerts management panel
  // (passed in as `children`, see page.tsx) are two independent AlertsView instances with two
  // independent `alerts` states — creating/re-arming/deleting there does not, on its own,
  // refresh this component's OWN read. Re-read whenever either one reports a change (major:
  // "see it in the list" required a page reload without this).
  useEffect(() => {
    const onChanged = () => { void load(); };
    window.addEventListener(ALERTS_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(ALERTS_CHANGED_EVENT, onChanged);
  }, [load]);

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
      // Minor: a fired-event payload's own plain-language description wins when present; the
      // fallback must describe the actual condition (conditionText), never the content-free
      // literal "Condition"/"条件" this used to render for every row lacking a payload.
      verdict: r.outboxRow?.payload?.condition_plain || conditionText(alert?.condition, alert?.symbol, L),
      delivery: r.delivery, foldedRows: r.foldedRows,
    };
  });

  const detail: AlertDetailData | null = useMemo(() => {
    if (!openId) return null;
    const row = view.rows.find((r) => r.alertId === openId);
    const alert = alerts?.find((a) => a.id === openId);
    if (!row || !alert) return null;
    return {
      conditionText: row.outboxRow?.payload?.condition_plain || conditionText(alert.condition, alert.symbol, L),
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

  // A successful read that found zero alerts is a definitive, known-good fact — there is nothing
  // to monitor, so the engine's own run health (fresh/stale/never-ran) is moot for THIS user. This
  // must outrank never-ran/degraded so a brand-new zero-alert account (the account most likely to
  // have no fresh run receipt yet) still gets the calm "add a watch" copy, never "Check again"
  // (major: B1 calm-zero copy was reachable only under monitor==="watching").
  const zeroAlerts = view.emptyAction === "add_watch" && !listUnavailable;

  // One state per screen: the spine's `data-cockpit-state` and the rendered explanatory module
  // below must always agree on which fact is being reported. Degraded (the engine's own run
  // health) outranks no-coverage (which symbols could be priced) because an unevaluable-symbol
  // count sourced from a STALE run cannot be trusted more than the staleness itself (minor: the
  // two used to disagree — spine said "no-coverage" while the visible paragraph said "degraded").
  const dataState: "unavailable" | "never-ran" | "no-coverage" | "degraded" | "calm-empty" | "calm" =
    view.monitor === "unknown" ? "unavailable"
    : listUnavailable ? "unavailable"
    : zeroAlerts ? "calm-empty"
    : view.monitor === "never_ran" ? "never-ran"
    : view.monitor === "degraded" ? "degraded"
    : (view.noCoverageCount ?? 0) > 0 ? "no-coverage"
    : timelineRows.length === 0 ? "calm-empty" : "calm";

  // Same precedence, expressed as booleans so each module's own render condition can never
  // disagree with `dataState` above (that disagreement — a "no-coverage" spine next to a visible
  // "degraded" paragraph — was minor: read-state overloading).
  const showNeverRan = dataState === "never-ran";
  const showDegraded = dataState === "degraded";

  const scrollToAddWatch = useCallback(() => {
    document.getElementById("alerts-manage")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  return (
    // `data-cockpit-state` (never `data-alerts-state`) — the existing-alerts management panel
    // (AlertsView.tsx, mounted below as `children`) already owns `data-alerts-state` for ITS
    // OWN facts ("unavailable"/"stale"/"empty"), predating this cockpit. Composing both on one
    // page under the SAME attribute name made `[data-alerts-state="unavailable"]` match two
    // unrelated elements at once — a real Playwright strict-mode violation that broke every
    // test in the pre-existing e2e/alerts-failure-states.spec.ts (CI red on this PR's head,
    // 2026-09-06). A distinct attribute name for the cockpit's OWN spine state keeps the two
    // vocabularies from colliding on a page that legitimately renders both.
    <main className="main2"><div className="pg" data-cockpit-state={dataState}>
      <AnswerLine
        monitor={view.monitor} lastAttemptAt={view.lastAttemptAt} lastAttemptState={view.lastAttemptState}
        lastSuccessAt={view.lastSuccessAt} lastSuccessState={view.lastSuccessState}
        coverageCount={view.coverage.count} lang={L}
      />
      {/* Every empty/degraded module below is exactly one calm paragraph + exactly one wired
          action, in a real button variant (btn-primary for a constructive action, btn-ghost for
          a recovery retry — never a bare `.btn` with only margin, which rendered as unstyled text
          at button metrics with no visible border or background). Priority order: an outright
          outage (monitor unknown, or the list read itself unavailable) always wins over the
          calmer "zero alerts"/"degraded"/"never ran" readings, because it is the least certain
          thing we can honestly say; a known-zero alert list then wins over engine-health readings
          because there is nothing to monitor either way (major: B1). */}
      {(view.monitor === "unknown" || listUnavailable) && (
        <div className={s.module} data-alerts-module="outage">
          <p className={s.calmBody}>{copy(view.monitor === "unknown" ? "outage.body" : "listUnavailable.body", L)}</p>
          <button type="button" className={`btn btn-ghost ${s.emptyAction}`} onClick={load}>{copy("outage.action", L)}</button>
        </div>
      )}
      {!listUnavailable && view.monitor !== "unknown" && zeroAlerts && (
        <div className={s.module} data-alerts-module="calm-empty">
          <p className={s.calmBody}>{copy("empty.calm.zero", L)}</p>
          {/* META-CEO ruling (round-2, B1 reach): calm-zero outranks never_ran/degraded so this
              module is reachable from a brand-new account, but engine health must not go silent
              — exactly one extra line, never the fuller never_ran/degraded paragraph (this
              account has nothing to monitor yet either way, so "Check again" would be moot). */}
          {(view.monitor === "never_ran" || view.monitor === "degraded") && (
            <p className={s.calmBody}>{copy(view.monitor === "never_ran" ? "empty.calm.zero.neverRan" : "empty.calm.zero.degraded", L)}</p>
          )}
          <button type="button" className={`btn btn-primary ${s.emptyAction}`} onClick={scrollToAddWatch}>{copy("empty.calm.action", L)}</button>
        </div>
      )}
      {showNeverRan && (
        <div className={s.module} data-alerts-module="never-ran">
          <p className={s.neverRanBody}>{copy("neverRan.body", L)}</p>
          <button type="button" className={`btn btn-ghost ${s.emptyAction}`} onClick={load}>{copy("neverRan.action", L)}</button>
        </div>
      )}
      {showDegraded && (
        <div className={s.module} data-alerts-module="degraded">
          <p className={s.degradedBody}>{copy("degraded.body", L, { t: view.lastSuccessAt ? new Date(view.lastSuccessAt).toLocaleTimeString(L === "zh" ? "zh-CN" : "en-US") : copy(view.lastSuccessState === "READ_UNAVAILABLE" ? "null.cannotRead" : "null.notRecorded", L) })}</p>
          <button type="button" className={`btn btn-ghost ${s.emptyAction}`} onClick={load}>{copy("degraded.action", L)}</button>
        </div>
      )}
      {dataState === "calm-empty" && !zeroAlerts && (
        <div className={s.module} data-alerts-module="calm-empty">
          <p className={s.calmBody}>{copy("empty.calm", L, { n: view.coverage.count ?? 0 })}</p>
          <button type="button" className={`btn btn-ghost ${s.emptyAction}`} onClick={scrollToAddWatch}>{copy("empty.calm.action", L)}</button>
        </div>
      )}
      <AlertTimeline rows={timelineRows} lang={L} onOpen={setOpenId} spineState={dataState} />
      <WatchingList
        rows={(alerts || []).filter((a) => a.active).map((a) => ({ id: a.id, symbol: a.symbol || "—", label: conditionText(a.condition, a.symbol, L), state: "armed" as const }))}
        unavailable={listUnavailable}
        lang={L}
      />
      <div id="alerts-manage" className={s.module} data-alerts-module="add-watch">
        <NewAlertPanel email={email} />
      </div>
      <CouldNotWatch count={view.noCoverageCount ?? 0} lang={L} />
      {/* The existing-alerts management panel (pause/re-arm/delete affordances) renders as a
          plain child HERE, inside this component's own single <main className="main2"><div
          className="pg"> — never as a second, sibling main2/pg on the page (that produced two
          disconnected page compositions) and never wrapped in an extra .pg of its own (a nested
          scroll container broke the deterministic e2e). See page.tsx for what is passed in. */}
      {children}
      {detail && <AlertDetail data={detail} lang={L} onClose={() => setOpenId(null)} />}
    </div></main>
  );
}
