import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import {
  buildAlertsView, monitorFor, foldOutbox, deliveryFor, ALERTS_COPY, copy,
  type RunReceipt, type OutboxRow, type Alert,
} from "../alertsView";

const NOW = Date.parse("2026-09-05T12:00:00Z");
const baseRun = (over: Partial<RunReceipt> = {}): RunReceipt => ({
  lane: "alerts_engine", run_id: "r1", started_at: "2026-09-05T11:58:00Z",
  concluded_at: "2026-09-05T11:59:00Z", outcome: "success",
  evaluated_n: 6, fired_n: 0, unevaluable_n: 0, source_asof: null,
  lane_cadence_budget_s: 300, error_class: null, ...over,
});

describe("monitorFor — calm requires proof-of-run", () => {
  it("stale success (older than budget+grace) -> degraded", () => {
    const run = baseRun({ concluded_at: "2026-09-05T11:00:00Z" }); // 60min old
    expect(monitorFor(run, "READ_OK", NOW)).toBe("degraded");
  });
  it("partial outcome -> degraded", () => {
    expect(monitorFor(baseRun({ outcome: "partial" }), "READ_OK", NOW)).toBe("degraded");
  });
  it("concluded_at null -> degraded", () => {
    expect(monitorFor(baseRun({ concluded_at: null }), "READ_OK", NOW)).toBe("degraded");
  });
  it("fresh success -> watching", () => {
    expect(monitorFor(baseRun(), "READ_OK", NOW)).toBe("watching");
  });
  it("READ_OK_ZERO -> never_ran, never calm", () => {
    expect(monitorFor(null, "READ_OK_ZERO", NOW)).toBe("never_ran");
  });
  it("READ_UNAVAILABLE -> unknown, never calm", () => {
    expect(monitorFor(baseRun(), "READ_UNAVAILABLE", NOW)).toBe("unknown");
  });
});

describe("lastAttemptAt / lastSuccessAt independence", () => {
  it("attempt present, success absent -> success field is the two-word null only", () => {
    const view = buildAlertsView({
      alerts: [], alertsState: "READ_OK_ZERO",
      run: baseRun({ outcome: "failure", concluded_at: null }), lastSuccessAt: null, runsState: "READ_OK",
      outbox: [], outboxState: "READ_OK_ZERO", now: NOW,
    });
    expect(view.lastAttemptAt).toBe("2026-09-05T11:58:00Z");
    expect(view.lastSuccessAt).toBeNull();
  });
});

const outboxRow = (over: Partial<OutboxRow> = {}): OutboxRow => ({
  alert_id: "a1", fire_event_id: "e1", status: "sent", attempts: 1,
  last_error: null, deliver_after: null, delivered_at: "2026-09-05T11:59:30Z",
  created_at: "2026-09-05T11:59:30Z", payload: {}, ...over,
});
const alert = (over: Partial<Alert> = {}): Alert => ({
  id: "a1", active: false, condition: { type: "price", triggered: true }, created_at: "2026-09-01T00:00:00Z", ...over,
});

describe("delivery law", () => {
  it("fired alert with no outbox row -> pending, never delivered", () => {
    const d = deliveryFor(alert(), "READ_OK", new Map());
    expect(d.delivery).toBe("pending");
  });
  it("outboxState READ_UNAVAILABLE -> unconfirmed, never sent", () => {
    const folded = foldOutbox([outboxRow()]);
    const d = deliveryFor(alert(), "READ_UNAVAILABLE", folded);
    expect(d.delivery).toBe("unconfirmed");
  });
  it("status sent with delivered_at null is NOT sent", () => {
    const folded = foldOutbox([outboxRow({ delivered_at: null })]);
    const d = deliveryFor(alert(), "READ_OK", folded);
    expect(d.delivery).not.toBe("sent");
  });
  it("duplicate rows sharing fire_event_id fold to one with foldedRows set", () => {
    const folded = foldOutbox([
      outboxRow({ created_at: "2026-09-05T11:59:00Z" }),
      outboxRow({ created_at: "2026-09-05T11:59:30Z" }),
    ]);
    const d = deliveryFor(alert(), "READ_OK", folded);
    expect(d.foldedRows).toBe(1);
  });
});

describe("coverage null vocabulary", () => {
  it("READ_NO_COVERAGE state distinct from a genuine zero", () => {
    const noCoverage = buildAlertsView({
      alerts: [], alertsState: "READ_NO_COVERAGE", run: baseRun(), lastSuccessAt: null,
      runsState: "READ_OK", outbox: [], outboxState: "READ_OK_ZERO", now: NOW,
    });
    const zero = buildAlertsView({
      alerts: [], alertsState: "READ_OK", run: baseRun(), lastSuccessAt: null,
      runsState: "READ_OK", outbox: [], outboxState: "READ_OK_ZERO", now: NOW,
    });
    expect(noCoverage.coverage.state).toBe("READ_NO_COVERAGE");
    expect(noCoverage.coverage.count).toBeNull();
    expect(zero.coverage.state).toBe("READ_OK");
    expect(zero.coverage.count).toBe(0);
  });
});

describe("cache ban (gate 3)", () => {
  it("alertsView.ts never reads mm.wls / dataCache / localStorage, and is deterministic under injected now", () => {
    const src = readFileSync(path.join(__dirname, "..", "alertsView.ts"), "utf8");
    expect(src).not.toMatch(/mm\.wls/);
    expect(src).not.toMatch(/dataCache/);
    expect(src).not.toMatch(/localStorage/);
    expect(src).not.toMatch(/Date\.now\(\)/);
    const a = buildAlertsView({ alerts: [], alertsState: "READ_OK_ZERO", run: null, lastSuccessAt: null, runsState: "READ_OK_ZERO", outbox: [], outboxState: "READ_OK_ZERO", now: NOW });
    const b = buildAlertsView({ alerts: [], alertsState: "READ_OK_ZERO", run: null, lastSuccessAt: null, runsState: "READ_OK_ZERO", outbox: [], outboxState: "READ_OK_ZERO", now: NOW });
    expect(a).toEqual(b);
  });
});

describe("copy table", () => {
  it("every key has a non-empty [en, zh] pair", () => {
    for (const [key, [en, zh]] of Object.entries(ALERTS_COPY)) {
      expect(en, `en for ${key}`).toBeTruthy();
      expect(zh, `zh for ${key}`).toBeTruthy();
    }
  });
  it("ZH strings carry no ASCII state-name letters (aside from interpolation braces)", () => {
    for (const [key, [, zh]] of Object.entries(ALERTS_COPY)) {
      const withoutVars = zh.replace(/\{[a-zA-Z]+\}/g, "");
      expect(/[A-Za-z]{3,}/.test(withoutVars), `${key}: ${zh}`).toBe(false);
    }
  });
  it("copy() substitutes variables", () => {
    expect(copy("degraded.body", "en", { t: "09:41" })).toContain("09:41");
    expect(copy("noCoverage.body", "zh", { n: 2 })).toContain("2");
  });
});
