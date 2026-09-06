// Pure view model for the /alerts in-product surface (packet B-F08-3).
// No React, no fetch, no cache — every input arrives as an argument, including
// `now`, so this module is fully deterministic under test. See
// research/MARKET_ONTOLOGY_F08_ARCHITECTURE_FREEZE_2026-09-05.md §4/§5/§8.

export type ReadState = "READ_OK" | "READ_OK_ZERO" | "READ_NO_COVERAGE" | "READ_UNAVAILABLE";
export type MonitorState = "watching" | "degraded" | "never_ran" | "unknown";
export type DeliveryState = "sent" | "failed" | "deferred" | "pending" | "suppressed" | "unconfirmed";
export type ResolutionState = "open" | "resolved" | "armed" | "paused";

export const ALERT_ACTIONS = ["open", "evidence", "rearm", "delete"] as const;
export type AlertAction = (typeof ALERT_ACTIONS)[number];
export const LANE = "alerts_engine";
export const CALM_GRACE_S = 120; // budget (300) + grace = 420s

export interface RunReceipt {
  lane: string;
  run_id: string;
  started_at: string;
  concluded_at: string | null;
  outcome: "success" | "partial" | "failure" | null;
  evaluated_n: number | null;
  fired_n: number | null;
  unevaluable_n: number | null;
  source_asof: string | null;
  lane_cadence_budget_s: number;
  error_class: string | null;
}

export interface OutboxRow {
  alert_id: string;
  fire_event_id: string;
  status: DeliveryState | string;
  attempts: number;
  last_error: string | null;
  deliver_after: string | null;
  delivered_at: string | null;
  created_at: string;
  payload: {
    subject?: string;
    summary_plain?: string;
    ticker?: string;
    condition_plain?: string;
    evidence_url?: string | null;
    fired_at?: string;
  };
}

export interface Alert {
  id: string;
  active: boolean;
  condition: { type: string; triggered?: boolean; [k: string]: unknown };
  symbol?: string;
  created_at: string;
}

export interface AlertsView {
  monitor: MonitorState;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  coverage: { state: ReadState; count: number | null };
  rows: AlertRowView[];
  emptyAction: "add_watch" | "check_again" | null;
}

export interface AlertRowView {
  alertId: string;
  delivery: DeliveryState;
  foldedRows: number;
  outboxRow: OutboxRow | null;
}

function isFresh(run: RunReceipt, now: number): boolean {
  if (run.outcome !== "success" || run.concluded_at === null) return false;
  const concluded = Date.parse(run.concluded_at);
  if (Number.isNaN(concluded)) return false;
  const budget = (run.lane_cadence_budget_s ?? 300) + CALM_GRACE_S;
  return now - concluded <= budget * 1000;
}

export function monitorFor(run: RunReceipt | null, runsState: ReadState, now: number): MonitorState {
  if (runsState === "READ_UNAVAILABLE") return "unknown";
  if (runsState === "READ_OK_ZERO") return "never_ran";
  if (runsState === "READ_OK" && run && isFresh(run, now)) return "watching";
  return "degraded";
}

/** Fold outbox rows by fire_event_id, keeping the newest (by created_at) per id. */
export function foldOutbox(outbox: OutboxRow[]): Map<string, { row: OutboxRow; folded: number }> {
  const byEvent = new Map<string, OutboxRow[]>();
  for (const row of outbox) {
    const list = byEvent.get(row.fire_event_id) ?? [];
    list.push(row);
    byEvent.set(row.fire_event_id, list);
  }
  const out = new Map<string, { row: OutboxRow; folded: number }>();
  for (const [eventId, rows] of byEvent) {
    const newest = rows.slice().sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];
    out.set(eventId, { row: newest, folded: rows.length - 1 });
  }
  return out;
}

export function deliveryFor(
  alert: Alert,
  outboxState: ReadState,
  folded: Map<string, { row: OutboxRow; folded: number }>,
): { delivery: DeliveryState; foldedRows: number; outboxRow: OutboxRow | null } {
  if (outboxState === "READ_UNAVAILABLE") return { delivery: "unconfirmed", foldedRows: 0, outboxRow: null };
  const match = [...folded.values()].find((v) => v.row.alert_id === alert.id);
  const fired = !alert.active && alert.condition?.triggered === true;
  if (!match) {
    return fired ? { delivery: "pending", foldedRows: 0, outboxRow: null } : { delivery: "pending", foldedRows: 0, outboxRow: null };
  }
  const row = match.row;
  const status = row.status as DeliveryState;
  const delivery: DeliveryState =
    status === "sent" && row.delivered_at == null ? "pending" : (["sent", "failed", "deferred", "pending", "suppressed"].includes(status) ? status : "pending");
  return { delivery, foldedRows: match.folded, outboxRow: row };
}

export function buildAlertsView(input: {
  alerts: Alert[] | null;
  alertsState: ReadState;
  run: RunReceipt | null;
  lastSuccessAt: string | null;
  runsState: ReadState;
  outbox: OutboxRow[] | null;
  outboxState: ReadState;
  now: number;
}): AlertsView {
  const monitor = monitorFor(input.run, input.runsState, input.now);
  const folded = foldOutbox(input.outbox ?? []);
  const alerts = input.alerts ?? [];
  const rows: AlertRowView[] = alerts.map((a) => {
    const d = deliveryFor(a, input.outboxState, folded);
    return { alertId: a.id, delivery: d.delivery, foldedRows: d.foldedRows, outboxRow: d.outboxRow };
  });
  const emptyAction = input.alertsState === "READ_OK_ZERO" ? "add_watch" : monitor === "degraded" ? "check_again" : null;
  return {
    monitor,
    lastAttemptAt: input.run?.started_at ?? null,
    lastSuccessAt: input.lastSuccessAt,
    coverage: { state: input.alertsState, count: input.alertsState === "READ_OK" ? alerts.length : null },
    rows,
    emptyAction,
  };
}

// ── copy table (EN/ZH), frozen §4 ────────────────────────────────────────────
export const ALERTS_COPY: Record<string, [string, string]> = {
  "monitor.watching": ["Watching", "监控中"],
  "monitor.degraded": ["Monitoring degraded — last successful check {t}", "监控降级 —— 上次成功检查 {t}"],
  "monitor.never_ran": ["Not recorded", "尚无记录"],
  "monitor.unknown": ["Cannot confirm", "无法确认"],
  "fact.lastAttempt": ["Last check", "上次检查"],
  "fact.lastSuccess": ["Last successful check", "上次成功检查"],
  "null.notRecorded": ["not recorded", "尚无记录"],
  "null.notCovered": ["not covered", "未覆盖"],
  "null.cannotRead": ["cannot read", "无法读取"],
  "delivery.sent": ["Emailed you", "已发送邮件"],
  "delivery.pending": ["Waiting to send", "等待发送"],
  "delivery.deferred": ["Held for quiet hours", "静音时段暂缓"],
  "delivery.failed": ["Could not send", "发送失败"],
  "delivery.suppressed": ["Not sent — your settings", "未发送 —— 按你的设置"],
  "delivery.unconfirmed": ["Cannot confirm", "无法确认"],
  "empty.calm": ["No alerts since you were last here. We are still watching {n} conditions for you.", "自上次访问以来没有新警报，仍在为你监控 {n} 项条件。"],
  "empty.calm.action": ["Add a watch", "添加监控"],
  "degraded.body": ["We kept your conditions, but we cannot promise they were checked. The last successful check was {t}.", "你的条件仍在，但我们无法保证已被检查。上次成功检查是 {t}。"],
  "degraded.action": ["Check again", "重新检查"],
  "neverRan.body": ["We have not recorded a check yet. New conditions start being checked within about five minutes.", "我们尚未记录到任何检查。新建条件通常在约五分钟内开始检查。"],
  "noCoverage.body": ["We cannot read prices for {n} of your symbols, so those conditions were not checked.", "有 {n} 个代码我们读不到价格，这些条件未被检查。"],
  "folded.note": ["Duplicate rows folded ({n})", "已合并重复记录（{n}）"],
  "ceiling": ["Context and decision support — not advice.", "仅供参考与决策支持，非投资建议。"],
};

export function copy(key: string, lang: "en" | "zh", vars?: Record<string, string | number>): string {
  const pair = ALERTS_COPY[key];
  let text = pair ? pair[lang === "zh" ? 1 : 0] : key;
  if (vars) for (const [k, v] of Object.entries(vars)) text = text.replace(`{${k}}`, String(v));
  return text;
}
