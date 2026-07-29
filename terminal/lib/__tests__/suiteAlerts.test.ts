// suiteAlerts.test.ts — the suite-event alert plane (W3).
//
// `lib/suiteAlerts.ts` is the ONE shared source of truth for the browser condition builder, the
// alerts POST route's validation, and the Node firing sidecar. Three things are tested here:
//
//   1. CATALOG INTEGRITY vs the REAL registry. Every SUITE_ALERT_EVENTS row claims a {suite,
//      module, tier} and an event name. The suite and module are resolved against SUITE_DEFS,
//      the tier is compared to the OWNING module's registered tier (the POST route gates
//      entitlement off this number — a stale copy silently sells a pro module at insider), and
//      the event string is grepped out of the module's own source file, so a renamed/removed
//      event type cannot keep an alert in the picker that can never fire.
//   2. `validateSuiteCondition` — the accept/reject matrix the route depends on. It returns a
//      REASON STRING on failure and null on success; every branch is pinned.
//   3. `evalSuiteEvent` — the firing semantics: the created_at floor, the one-shot re-fire stamp,
//      the last-N-bars freshness window, the dir / minStrength filters, and the exact note
//      wording (the cron pastes it into user-visible mail — silent drift there is a regression).
//
// Everything is pure: no fixtures from disk except the module sources read for the grep, no
// wall clock, no randomness. Bar times are explicit epoch seconds.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

import {
  SUITE_ALERT_EVENTS,
  SUITE_EVENT_FRESH_BARS,
  evalSuiteEvent,
  suiteAlertEventDef,
  suiteAlertPreview,
  validateSuiteCondition,
  type SuiteAlertCondition,
} from "../suiteAlerts";
import { SUITE_DEFS, SUITE_ORDER } from "../suites/registry";
import type { SuiteEvent } from "../indicator-canvas/types";

// ─── helpers ──────────────────────────────────────────────────────────────────

const DAY = 86400;
/** Daily bar times: bar i closes at epoch DAY*(i+1) — every stamp is a clean date. */
const dayTimes = (n: number): number[] => Array.from({ length: n }, (_, i) => DAY * (i + 1));

const ev = (
  type: string,
  i: number,
  extra: Partial<SuiteEvent> = {},
): SuiteEvent => ({ type, dir: "bull", i, ...extra });

const cond = (o: Partial<SuiteAlertCondition> & { event: string; suite: string }): SuiteAlertCondition => ({
  type: "suite_event",
  ...o,
} as SuiteAlertCondition);

/** Recursively freeze — any accidental mutation of the inputs by the evaluator throws. */
function deepFreeze<T>(v: T): T {
  if (v && typeof v === "object") {
    for (const k of Object.keys(v as any)) deepFreeze((v as any)[k]);
    Object.freeze(v);
  }
  return v;
}

// ─── 1. catalog integrity against the real registry ───────────────────────────

const SUITES_DIR = join(__dirname, "..", "suites");

/**
 * `${suite}/${moduleKey}` -> the source file that declares that module, discovered by scanning the
 * suite directories for the `SuiteModuleDef` literal. Nothing is hardcoded: a module that moves
 * files keeps working, a module that disappears fails loudly.
 */
function moduleSourceMap(): Map<string, string> {
  const out = new Map<string, string>();
  for (const suite of readdirSync(SUITES_DIR)) {
    if (suite === "shared" || suite.endsWith(".ts")) continue;
    for (const f of readdirSync(join(SUITES_DIR, suite))) {
      if (!f.endsWith(".ts")) continue;
      const path = join(SUITES_DIR, suite, f);
      const m = readFileSync(path, "utf8").match(/export const \w+: SuiteModuleDef = \{\s*key: "(\w+)"/);
      if (m) out.set(`${suite}/${m[1]}`, path);
    }
  }
  return out;
}

describe("SUITE_ALERT_EVENTS catalog", () => {
  const SRC = moduleSourceMap();

  it("names a real suite and a real module for every alertable event", () => {
    expect(SUITE_ALERT_EVENTS.length).toBeGreaterThan(0);
    for (const d of SUITE_ALERT_EVENTS) {
      const suite = SUITE_DEFS[d.suite];
      expect(suite, `${d.event}: unknown suite "${d.suite}"`).toBeDefined();
      const mod = suite.modules.find((m) => m.key === d.module);
      expect(mod, `${d.event}: suite "${d.suite}" has no module "${d.module}"`).toBeDefined();
    }
  });

  it("copies each event's tier from the OWNING module's registry entry", () => {
    // The POST route gates entitlement on this field. A drifted copy sells a pro module cheap.
    for (const d of SUITE_ALERT_EVENTS) {
      const mod = SUITE_DEFS[d.suite].modules.find((m) => m.key === d.module)!;
      expect(d.tier, `${d.event}: catalog tier vs ${d.suite}/${d.module}`).toBe(mod.tier);
    }
  });

  it("resolves every event name inside its owning module's source", () => {
    for (const d of SUITE_ALERT_EVENTS) {
      const path = SRC.get(`${d.suite}/${d.module}`);
      expect(path, `${d.event}: no source file declares ${d.suite}/${d.module}`).toBeDefined();
      const src = readFileSync(path!, "utf8");
      expect(src.includes(`"${d.event}"`), `${d.event}: not emitted by ${path}`).toBe(true);
    }
  });

  it("keeps event ids, LEX keys and English names unique and non-empty", () => {
    const events = SUITE_ALERT_EVENTS.map((d) => d.event);
    expect(new Set(events).size, "duplicate event ids").toBe(events.length);
    const tkeys = SUITE_ALERT_EVENTS.map((d) => d.tkey);
    expect(new Set(tkeys).size, "duplicate LEX keys").toBe(tkeys.length);
    for (const d of SUITE_ALERT_EVENTS) {
      expect(d.en.length, `${d.event}: empty English name`).toBeGreaterThan(0);
      expect(/[一-鿿]/.test(d.en), `${d.event}: CJK in the English name`).toBe(false);
      expect(d.tkey.startsWith("suiteEv"), `${d.event}: LEX key convention`).toBe(true);
      expect(["free", "insider", "pro"]).toContain(d.tier);
      expect(typeof d.dirs).toBe("boolean");
      expect(typeof d.strength).toBe("boolean");
    }
  });

  it("stays a CURATED subset — the chatty chart-only types are deliberately absent", () => {
    const listed = new Set(SUITE_ALERT_EVENTS.map((d) => d.event));
    for (const t of ["ob_created", "fvg_created", "liq_created", "rsi_mid_cross", "macdx_phase", "pulse_dip"]) {
      expect(listed.has(t), `${t} became alertable — was that deliberate?`).toBe(false);
    }
    // ...and every suite that ships alertable events is a registered one
    for (const k of new Set(SUITE_ALERT_EVENTS.map((d) => d.suite))) {
      expect(SUITE_ORDER).toContain(k as any);
    }
  });

  it("resolves a def by event name and nothing else", () => {
    for (const d of SUITE_ALERT_EVENTS) expect(suiteAlertEventDef(d.event)).toEqual(d);
    expect(suiteAlertEventDef("not_an_event")).toBeNull();
    expect(suiteAlertEventDef("")).toBeNull();
  });

  it("carries a direction on every currently listed event", () => {
    // Pinned on purpose: the "carries no direction" reject branch is unreachable while this holds.
    // If a directionless event is ever added, this flips and the reject test below must gain a case.
    expect(SUITE_ALERT_EVENTS.filter((d) => !d.dirs).map((d) => d.event)).toEqual([]);
    // Four events are scored-free — those ARE reachable by the minStrength reject branch.
    expect(SUITE_ALERT_EVENTS.filter((d) => !d.strength).map((d) => d.event))
      .toEqual(["bos", "choch", "cisd"]);
  });

  it("contains no clock and no randomness", () => {
    const code = readFileSync(join(__dirname, "..", "suiteAlerts.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");
    expect(code.includes("Date.now")).toBe(false);
    expect(code.includes("Math.random")).toBe(false);
    // `new Date(...)` is allowed ONLY with an explicit epoch argument (stamp formatting).
    expect(code.match(/new Date\(\s*\)/g) ?? [], "clock-reading new Date()").toEqual([]);
  });
});

// ─── 2. validateSuiteCondition ────────────────────────────────────────────────

describe("validateSuiteCondition — accepts", () => {
  it("accepts the minimal well-formed condition for every catalog event", () => {
    for (const d of SUITE_ALERT_EVENTS) {
      expect(validateSuiteCondition({ type: "suite_event", suite: d.suite, event: d.event }), d.event).toBeNull();
    }
  });

  it("accepts both directions and the strength bounds on scored events", () => {
    const d = SUITE_ALERT_EVENTS.find((x) => x.strength)!;
    for (const dir of ["bull", "bear"] as const) {
      expect(validateSuiteCondition({ type: "suite_event", suite: d.suite, event: d.event, dir })).toBeNull();
    }
    for (const minStrength of [0, 1, 50, 99.5, 100]) {
      expect(
        validateSuiteCondition({ type: "suite_event", suite: d.suite, event: d.event, minStrength }),
        `minStrength=${minStrength}`,
      ).toBeNull();
    }
  });

  it("accepts a condition already carrying engine state", () => {
    expect(
      validateSuiteCondition({
        type: "suite_event", suite: "structure", event: "bos", dir: "bear", _se: { lastFiredT: 123 },
      }),
    ).toBeNull();
  });
});

describe("validateSuiteCondition — rejects", () => {
  const reject = (c: unknown, needle: string) => {
    const why = validateSuiteCondition(c);
    expect(why, `expected a rejection for ${JSON.stringify(c)}`).toBeTruthy();
    expect(why!, `reason for ${JSON.stringify(c)}`).toContain(needle);
  };

  it("rejects non-objects and the wrong condition type", () => {
    for (const c of [null, undefined, 42, "bos", true]) reject(c, "condition is not an object");
    reject({}, 'not "suite_event"');
    reject({ type: "price", suite: "structure", event: "bos" }, 'not "suite_event"');
  });

  it("rejects a missing or unknown event", () => {
    reject({ type: "suite_event", suite: "structure" }, "missing event");
    reject({ type: "suite_event", suite: "structure", event: "" }, "missing event");
    reject({ type: "suite_event", suite: "structure", event: 7 }, "missing event");
    reject({ type: "suite_event", suite: "structure", event: "ob_created" }, 'unknown suite event "ob_created"');
    reject({ type: "suite_event", suite: "structure", event: "BOS" }, "unknown suite event");
  });

  it("rejects a missing suite and a suite that does not own the event", () => {
    reject({ type: "suite_event", event: "bos" }, "missing suite");
    reject({ type: "suite_event", suite: "", event: "bos" }, "missing suite");
    reject(
      { type: "suite_event", suite: "trend", event: "bos" },
      'event "bos" belongs to suite "structure", not "trend"',
    );
    reject({ type: "suite_event", suite: "nope", event: "sfp" }, 'belongs to suite "structure"');
  });

  it("rejects a malformed direction", () => {
    for (const dir of ["up", "long", "BULL", "", 1, null]) {
      reject({ type: "suite_event", suite: "structure", event: "bos", dir }, 'dir must be "bull" or "bear"');
    }
  });

  it("rejects an out-of-range or non-numeric minStrength", () => {
    for (const minStrength of [-1, 101, NaN, Infinity, "50", null, {}]) {
      reject(
        { type: "suite_event", suite: "structure", event: "sfp", minStrength },
        "minStrength must be a number in 0..100",
      );
    }
  });

  it("rejects minStrength on an event that carries no score", () => {
    for (const e of ["bos", "choch", "cisd"]) {
      reject(
        { type: "suite_event", suite: "structure", event: e, minStrength: 50 },
        `event "${e}" carries no strength score`,
      );
    }
    reject(
      { type: "suite_event", suite: "structure", event: "bos", minStrength: 10 },
      'carries no strength score',
    );
  });
});

// ─── 3. evalSuiteEvent ────────────────────────────────────────────────────────

describe("evalSuiteEvent — freshness and the creation floor", () => {
  const T = dayTimes(10); // bars 0..9, bar i at DAY*(i+1)
  const BOS = cond({ suite: "structure", event: "bos" });

  it("fires on a matching event inside the freshness window that clears the floor", () => {
    const res = evalSuiteEvent(BOS, [ev("bos", 9, { p: 101.25 })], T, 0);
    expect(res.fired).toBe(true);
    expect(res.state).toEqual({ lastFiredT: T[9] });
    expect(res.value).toBe(101.25); // bos is unscored → the event price is the reported value
  });

  it("never fires off history older than the last SUITE_EVENT_FRESH_BARS bars", () => {
    expect(SUITE_EVENT_FRESH_BARS).toBe(3);
    const oldest = T.length - SUITE_EVENT_FRESH_BARS; // 7 — the first FRESH index
    for (let i = 0; i < T.length; i++) {
      const fired = evalSuiteEvent(BOS, [ev("bos", i)], T, 0).fired;
      expect(fired, `bar ${i}`).toBe(i >= oldest);
    }
  });

  it("stays silent over pre-creation history even when the event is fresh", () => {
    const events = [ev("bos", 9)];
    expect(evalSuiteEvent(BOS, events, T, T[9]).fired, "floor == the event bar").toBe(false);
    expect(evalSuiteEvent(BOS, events, T, T[9] + 1).fired, "floor after the event").toBe(false);
    expect(evalSuiteEvent(BOS, events, T, T[9] - 1).fired, "floor just before").toBe(true);
  });

  it("does not re-fire the same bar once _se.lastFiredT is stamped", () => {
    const first = evalSuiteEvent(BOS, [ev("bos", 8)], T, 0);
    expect(first.fired).toBe(true);
    const armed: SuiteAlertCondition = { ...BOS, _se: first.state };
    expect(evalSuiteEvent(armed, [ev("bos", 8)], T, 0).fired, "same event re-fired").toBe(false);
    // ...but a NEWER event on a later bar still fires
    const next = evalSuiteEvent(armed, [ev("bos", 8), ev("bos", 9)], T, 0);
    expect(next.fired).toBe(true);
    expect(next.state).toEqual({ lastFiredT: T[9] });
  });

  it("takes the NEWEST matching event when several are fresh", () => {
    const res = evalSuiteEvent(
      cond({ suite: "structure", event: "sfp" }),
      [ev("sfp", 7, { strength: 10 }), ev("sfp", 9, { strength: 88 }), ev("sfp", 8, { strength: 40 })],
      T,
      0,
    );
    expect(res.fired).toBe(true);
    expect(res.value).toBe(88);
    expect(res.state).toEqual({ lastFiredT: T[9] });
  });

  it("ignores foreign types, out-of-range indices, empty tapes and unknown events", () => {
    expect(evalSuiteEvent(BOS, [ev("choch", 9)], T, 0).fired).toBe(false);
    expect(evalSuiteEvent(BOS, [ev("bos", 10)], T, 0).fired, "index past the series").toBe(false);
    expect(evalSuiteEvent(BOS, [ev("bos", -1)], T, 0).fired).toBe(false);
    expect(evalSuiteEvent(BOS, [ev("bos", 8.5)], T, 0).fired, "fractional index").toBe(false);
    expect(evalSuiteEvent(BOS, [], T, 0).fired).toBe(false);
    expect(evalSuiteEvent(BOS, [ev("bos", 9)], [], 0).fired, "no bar times").toBe(false);
    expect(evalSuiteEvent({ ...BOS, event: "nope" }, [ev("nope", 9)], T, 0).fired).toBe(false);
    expect(evalSuiteEvent(BOS, [ev("bos", 9)], [...T.slice(0, 9), NaN], 0).fired, "NaN bar time").toBe(false);
  });

  it("is pure — it mutates neither the condition nor the event tape", () => {
    const c = deepFreeze<SuiteAlertCondition>({ ...BOS, _se: { lastFiredT: 1 } });
    const evs = deepFreeze([ev("bos", 9, { p: 5 })]);
    expect(() => evalSuiteEvent(c, evs as SuiteEvent[], T, 0)).not.toThrow();
    expect(evalSuiteEvent(c, evs as SuiteEvent[], T, 0)).toEqual(evalSuiteEvent(c, evs as SuiteEvent[], T, 0));
  });
});

describe("evalSuiteEvent — filters", () => {
  const T = dayTimes(10);

  it("honours the direction filter", () => {
    const bear = cond({ suite: "structure", event: "bos", dir: "bear" });
    expect(evalSuiteEvent(bear, [ev("bos", 9, { dir: "bull" })], T, 0).fired).toBe(false);
    expect(evalSuiteEvent(bear, [ev("bos", 9, { dir: "bear" })], T, 0).fired).toBe(true);
    // no filter = either direction
    const any = cond({ suite: "structure", event: "bos" });
    expect(evalSuiteEvent(any, [ev("bos", 9, { dir: "bear" })], T, 0).fired).toBe(true);
  });

  it("honours minStrength inclusively and rejects an unscored event", () => {
    const c = cond({ suite: "structure", event: "sfp", minStrength: 70 });
    expect(evalSuiteEvent(c, [ev("sfp", 9, { strength: 69.9 })], T, 0).fired).toBe(false);
    expect(evalSuiteEvent(c, [ev("sfp", 9, { strength: 70 })], T, 0).fired).toBe(true);
    expect(evalSuiteEvent(c, [ev("sfp", 9)], T, 0).fired, "no strength on the event").toBe(false);
    // the newest event fails the gate, an older fresh one passes it
    const res = evalSuiteEvent(c, [ev("sfp", 8, { strength: 90 }), ev("sfp", 9, { strength: 10 })], T, 0);
    expect(res.fired).toBe(true);
    expect(res.state).toEqual({ lastFiredT: T[8] });
  });
});

describe("evalSuiteEvent — the note the cron mails out", () => {
  const T = dayTimes(10);

  it("spells a scored, directional event exactly", () => {
    const res = evalSuiteEvent(
      cond({ suite: "structure", event: "sfp" }),
      [ev("sfp", 9, { dir: "bull", strength: 72.4, p: 90 })],
      T,
      0,
    );
    expect(res.note).toBe(
      "Swing failure pattern (SFP) (bullish), strength 72 on 1970-01-11 — structure suite, daily bars, module defaults",
    );
    expect(res.value).toBe(72); // rounded strength, not the price
  });

  it("omits the strength clause for an unscored event and reports its price", () => {
    const res = evalSuiteEvent(
      cond({ suite: "structure", event: "bos" }),
      [ev("bos", 9, { dir: "bear", strength: 99, p: 101.5 })],
      T,
      0,
    );
    expect(res.note).toBe(
      "Break of structure (BOS) (bearish) on 1970-01-11 — structure suite, daily bars, module defaults",
    );
    expect(res.value).toBe(101.5);
  });

  it("drops the direction clause for a neutral event and stamps intraday bars to the minute", () => {
    const times = [1699996400, 1699998200, 1700000000];
    const res = evalSuiteEvent(
      cond({ suite: "trend", event: "te_flip" }),
      [ev("te_flip", 2, { dir: "neutral", strength: 30 })],
      times,
      0,
    );
    expect(res.note).toBe(
      "Trend Engine flip, strength 30 on 2023-11-14 22:13 — trend suite, daily bars, module defaults",
    );
    expect(res.value).toBe(30);
  });

  it("never leaks CJK into the English note", () => {
    for (const d of SUITE_ALERT_EVENTS) {
      const res = evalSuiteEvent(
        cond({ suite: d.suite, event: d.event }),
        [ev(d.event, 9, { strength: 50, p: 1 })],
        T,
        0,
      );
      expect(res.fired, d.event).toBe(true);
      expect(/[一-鿿]/.test(res.note ?? ""), `${d.event}: CJK in the en note`).toBe(false);
      expect(res.note, d.event).toContain(d.en);
      expect(res.note, d.event).toContain(`${d.suite} suite`);
    }
  });

  it("returns no note, value or state when nothing fires", () => {
    expect(evalSuiteEvent(cond({ suite: "structure", event: "bos" }), [], T, 0)).toEqual({ fired: false });
  });
});

// ─── 4. suiteAlertPreview ─────────────────────────────────────────────────────

describe("suiteAlertPreview", () => {
  it("writes a plain-word line in both languages for every catalog event", () => {
    for (const d of SUITE_ALERT_EVENTS) {
      const c = cond({ suite: d.suite, event: d.event });
      const en = suiteAlertPreview(c, "en");
      const zh = suiteAlertPreview(c, "zh");
      expect(en.length, d.event).toBeGreaterThan(0);
      expect(en, d.event).toContain(d.en);
      expect(/[一-鿿]/.test(en), `${d.event}: CJK leaked into the en preview`).toBe(false);
      expect(/[一-鿿]/.test(zh), `${d.event}: zh preview has no CJK`).toBe(true);
      expect(zh, `${d.event}: zh preview is the en string`).not.toBe(en);
    }
  });

  it("folds the direction and the strength gate into the sentence", () => {
    const c = cond({ suite: "structure", event: "sfp", dir: "bull", minStrength: 70 });
    expect(suiteAlertPreview(c, "en")).toBe(
      "Alert me on a bullish Swing failure pattern (SFP) at strength ≥ 70 on the daily chart (module defaults)",
    );
    expect(suiteAlertPreview(c, "zh")).toContain("强度 ≥ 70");
    expect(suiteAlertPreview({ ...c, minStrength: 0 }, "en")).toContain("strength ≥ 0");
  });

  it("degrades honestly on an unknown event", () => {
    const bad = { type: "suite_event", suite: "structure", event: "nope" } as SuiteAlertCondition;
    expect(suiteAlertPreview(bad, "en")).toBe("Unknown suite event");
    expect(suiteAlertPreview(bad, "zh")).toBe("未知的套件事件");
  });
});
