// Pure view model for the /alerts in-product surface (packet B-F08-3).
// No React, no fetch, no cache — every input arrives as an argument, including
// `now`, so this module is fully deterministic under test. See
// research/MARKET_ONTOLOGY_F08_ARCHITECTURE_FREEZE_2026-09-05.md §4/§5/§8.

export type ReadState = "READ_OK" | "READ_OK_ZERO" | "READ_NO_COVERAGE" | "READ_UNAVAILABLE";
export type MonitorState = "watching" | "degraded" | "never_ran" | "unknown";
export type DeliveryState = "sent" | "failed" | "deferred" | "pending" | "suppressed" | "unconfirmed";
export type ResolutionState = "open" | "resolved" | "armed" | "paused";

export const LANE = "alerts_engine";
export const CALM_GRACE_S = 120; // budget (300) + grace = 420s

// Fired when this page's create/re-arm/delete actions succeed, so every AlertsView instance
// mounted on the same page (the cockpit's inline create form and the separate existing-alerts
// management panel are two independent component instances with two independent `alerts`
// states) re-reads the list instead of only the instance that made the write. Same-tab only —
// this is a same-page composition wire, never cross-tab sync.
export const ALERTS_CHANGED_EVENT = "mm:alerts-changed";

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

// The evaluator (ingest/alerts_engine.py Supa.fire) stamps `triggered` as an OBJECT — {at, value,
// note} — never a bare boolean. `true` is kept as an accepted shape too (fixtures/back-compat),
// but the object shape is the one production alerts actually carry; see deliveryFor's `fired` gate.
export type TriggeredEvidence = { at: string; value?: number; note?: string };

export interface Alert {
  id: string;
  active: boolean;
  condition: { type: string; triggered?: TriggeredEvidence | boolean; [k: string]: unknown };
  symbol?: string;
  created_at: string;
}

export interface AlertsView {
  monitor: MonitorState;
  lastAttemptAt: string | null;
  lastAttemptState: ReadState;
  lastSuccessAt: string | null;
  lastSuccessState: ReadState;
  coverage: { state: ReadState; count: number | null };
  noCoverageCount: number | null;
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

// Statuses this surface can render, mapped onto mailer.STATUSES (freeze §8: no parallel
// enum). `skipped_no_smtp` is a terminal non-delivery (config problem, never retried) and
// must never masquerade as "pending" / in-flight. An unrecognized mailer status is an HONEST
// unknown, never a fabricated negative verdict — it maps to "unconfirmed", not "failed".
const KNOWN_DELIVERY: Record<string, DeliveryState> = {
  sent: "sent", failed: "failed", deferred: "deferred", pending: "pending",
  suppressed: "suppressed", skipped_no_smtp: "suppressed", queued: "pending",
};

/** True only for the production evidence shape the evaluator actually stamps (an object with a
 * string `at`), or the plain-boolean shape kept for fixtures/back-compat. Anything else (absent,
 * false, malformed) is honestly "not fired". */
function isTriggered(triggered: Alert["condition"]["triggered"]): boolean {
  if (triggered === true) return true;
  return typeof triggered === "object" && triggered !== null && typeof triggered.at === "string";
}

export function deliveryFor(
  alert: Alert,
  outboxState: ReadState,
  folded: Map<string, { row: OutboxRow; folded: number }>,
): { delivery: DeliveryState; foldedRows: number; outboxRow: OutboxRow | null; fired: boolean } {
  // An alert can have MULTIPLE fire events (re-armed, fired again), each its own folded group —
  // pick the newest one by created_at, never whichever the Map happens to iterate first. A plain
  // `.find()` here was caller-order dependent (only correct because the route sorts descending),
  // which is not a purity guarantee this module can make about its own input.
  const matches = [...folded.values()].filter((v) => v.row.alert_id === alert.id);
  const match = matches.length
    ? matches.reduce((newest, cur) => (Date.parse(cur.row.created_at) > Date.parse(newest.row.created_at) ? cur : newest))
    : undefined;
  if (outboxState === "READ_UNAVAILABLE") {
    // No receipt table to consult at all (e.g. migration 0013 not yet applied). The only
    // remaining signal is the alert's own `condition.triggered` stamp — but re-arming an alert
    // (app/api/alerts/route.ts PATCH) DELETES that stamp, so this fallback can under-report a
    // re-armed alert's earlier fire. That is the honest limit of "receipts unavailable", never a
    // fabricated confirmation, and is why `delivery` here is always "unconfirmed".
    return { delivery: "unconfirmed", foldedRows: 0, outboxRow: null, fired: isTriggered(alert.condition?.triggered) };
  }
  if (!match) {
    // Receipts ARE readable but none exist for this alert yet (fired and awaiting its outbox
    // row, or fired-then-immediately-rearmed before one was ever created).
    return { delivery: "pending", foldedRows: 0, outboxRow: null, fired: isTriggered(alert.condition?.triggered) };
  }
  const row = match.row;
  const status = row.status as string;
  const delivery: DeliveryState =
    status === "sent" && row.delivered_at == null ? "pending" : (KNOWN_DELIVERY[status] ?? "unconfirmed");
  // A receipt existing at all IS the fired fact — independent of the alert's CURRENT `active`
  // flag, which only reflects whether it has since been re-armed. Gating `fired` on
  // `!alert.active` made a fired alert's own delivery outcome vanish from the timeline the
  // instant it was re-armed (major: recent activity derived from `!alert.active`, not from the
  // receipt that is the actual source of truth for "this fired and here is what happened").
  return { delivery, foldedRows: match.folded, outboxRow: row, fired: true };
}

export function buildAlertsView(input: {
  alerts: Alert[] | null;
  alertsState: ReadState;
  run: RunReceipt | null;
  lastSuccessAt: string | null;
  lastSuccessState?: ReadState;
  runsState: ReadState;
  outbox: OutboxRow[] | null;
  outboxState: ReadState;
  now: number;
}): AlertsView {
  const monitor = monitorFor(input.run, input.runsState, input.now);
  const folded = foldOutbox(input.outbox ?? []);
  const alerts = input.alerts ?? [];
  // Only alerts that have actually FIRED get a delivery-timeline row — an alert that has never
  // fired has no delivery outcome and must not render one. "Fired" is decided in deliveryFor by
  // receipt existence (or, absent readable receipts, condition.triggered), never by the alert's
  // current `active` flag — an alert stays in the timeline after re-arm as long as its receipt
  // still exists (major: recent activity derived from `!alert.active`).
  const rows: AlertRowView[] = alerts
    .map((a) => ({ a, d: deliveryFor(a, input.outboxState, folded) }))
    .filter(({ d }) => d.fired)
    .map(({ a, d }) => ({ alertId: a.id, delivery: d.delivery, foldedRows: d.foldedRows, outboxRow: d.outboxRow }));

  // `input.alertsState` is the frozen four-state read vocabulary (§5), decided by the caller —
  // this view model never invents READ_NO_COVERAGE from a fabricated signal, it only ever
  // reports what the caller determined. `unevaluable_n` on the run receipt is the AUTHORITATIVE
  // upstream signal callers should use to decide READ_NO_COVERAGE (never a client quote probe).
  const emptyAction = input.alertsState === "READ_OK_ZERO" ? "add_watch" : monitor === "degraded" ? "check_again" : null;
  return {
    monitor,
    lastAttemptAt: input.run?.started_at ?? null,
    lastAttemptState: input.runsState,
    lastSuccessAt: input.lastSuccessAt,
    lastSuccessState: input.lastSuccessState ?? "READ_UNAVAILABLE",
    coverage: {
      state: input.alertsState,
      // A successful read with zero rows IS a count of 0, not an unknown — READ_OK_ZERO is
      // just as much "the read succeeded" as READ_OK with rows (blocker: a zero-alert user's
      // successful, empty read rendered "cannot read" instead of an honest 0).
      count: input.alertsState === "READ_OK" || input.alertsState === "READ_OK_ZERO" ? alerts.length : null,
    },
    // Distinct from `coverage.count` (which is an honest null, not a number, when coverage
    // is degraded) — this is the "how many symbols could we not evaluate" fact for the
    // CouldNotWatch module, sourced only from the evaluator's own run receipt.
    noCoverageCount: input.run?.unevaluable_n ?? null,
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
  "coverage.label": ["tracked", "条被跟踪"],
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
  "empty.calm.zero": ["You are not watching anything yet.", "你还没有设置任何监控。"],
  "empty.calm.action": ["Add a watch", "添加监控"],
  "degraded.body": ["We kept your conditions, but we cannot promise they were checked. The last successful check was {t}.", "你的条件仍在，但我们无法保证已被检查。上次成功检查是 {t}。"],
  "degraded.action": ["Check again", "重新检查"],
  "neverRan.body": ["We have not recorded a check yet. New conditions start being checked within about five minutes.", "我们尚未记录到任何检查。新建条件通常在约五分钟内开始检查。"],
  "neverRan.action": ["Check again", "重新检查"],
  "outage.body": ["We cannot confirm monitoring right now. Try again in a few minutes.", "我们暂时无法确认监控状态，请几分钟后再试。"],
  "outage.action": ["Retry", "重试"],
  "listUnavailable.body": ["We could not confirm your alert list just now. Try again in a few minutes.", "我们刚才无法确认你的警报列表，请几分钟后再试。"],
  "noCoverage.body": ["We cannot read prices for {n} of your symbols, so those conditions were not checked.", "有 {n} 个代码我们读不到价格，这些条件未被检查。"],
  "folded.note": ["Duplicate rows folded ({n})", "已合并重复记录（{n}）"],
  "resolution.armed": ["Armed — still watching", "已启用 —— 仍在监控"],
  "resolution.resolved": ["Resolved", "已解决"],
  "resolution.open": ["Open", "待处理"],
  "resolution.paused": ["Paused", "已暂停"],
  "receipt.attempts": ["Send attempts", "发送尝试次数"],
  "receipt.lastError": ["Last error", "最近错误"],
  "receipt.deliverAfter": ["Held until", "延迟至"],
  "ceiling": ["Context and decision support — not advice.", "仅供参考与决策支持，非投资建议。"],
  // condition.<type> — plain-language fallback labels for every condition type the evaluator
  // (ingest/alerts_engine.py) and the suite/options lanes can emit. Used only when no
  // fired-event payload (`condition_plain`) is available; never a raw type slug ("price",
  // "opt_gamma_flip", ...) rendered straight to a user (major: raw condition slugs).
  "condition.signal": ["Signal condition", "信号条件"],
  "condition.regime": ["Trend regime condition", "趋势状态条件"],
  "condition.price": ["Price crosses a level", "价格触及设定水平"],
  "condition.rsi": ["RSI condition", "相对强弱指数条件"],
  "condition.suite_event": ["Signal-suite event", "信号套件事件"],
  "condition.suite_sequence": ["Signal-suite sequence", "信号套件序列"],
  "condition.opt_gamma_flip": ["Options gamma-flip level", "期权伽马翻转水平"],
  "condition.opt_wall_touch": ["Options wall touch", "期权墙触及"],
  "condition.opt_wall_migration": ["Options wall migration", "期权墙迁移"],
  "condition.opt_sign_fragile": ["Options gamma sign fragile", "期权伽马符号脆弱"],
  "condition.opt_opex_concentration": ["Options expiry concentration", "期权到期集中度"],
  "condition.opt_premium_burst": ["Options premium burst", "期权权利金激增"],
  "condition.opt_0dte_spike": ["Same-day-expiry options spike", "当日到期期权异动"],
  "condition.opt_surface_pocket": ["Options surface pocket", "期权曲面异常点"],
  "condition.unknown": ["Condition", "条件"],
};

export function copy(key: string, lang: "en" | "zh", vars?: Record<string, string | number>): string {
  const pair = ALERTS_COPY[key];
  let text = pair ? pair[lang === "zh" ? 1 : 0] : key;
  if (vars) for (const [k, v] of Object.entries(vars)) text = text.split(`{${k}}`).join(String(v));
  return text;
}

/**
 * Plain-language description of an alert's condition, for the drillback detail view when no
 * fired-event payload (`condition_plain`) is available. Never returns a raw type slug (major:
 * raw condition slugs) — an unrecognized type falls back to the honest generic "Condition".
 * For a price condition with a known operator/threshold, describes it in words: symbol + plain
 * operator + threshold (e.g. "NVDA price above 200" / "NVDA 价格高于 200").
 */
export function conditionText(
  condition: { type?: string; op?: string; value?: number } | null | undefined,
  symbol: string | undefined,
  lang: "en" | "zh",
): string {
  if (!condition || typeof condition.type !== "string") return copy("condition.unknown", lang);
  if (condition.type === "price" && (condition.op === "above" || condition.op === "below") && typeof condition.value === "number") {
    const sym = symbol ? `${symbol} ` : "";
    if (lang === "zh") return `${sym}价格${condition.op === "above" ? "高于" : "低于"} ${condition.value}`;
    return `${sym}price ${condition.op} ${condition.value}`;
  }
  const key = `condition.${condition.type}`;
  return ALERTS_COPY[key] ? copy(key, lang) : copy("condition.unknown", lang);
}
