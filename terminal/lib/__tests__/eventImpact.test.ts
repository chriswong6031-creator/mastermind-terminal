import { describe, it, expect } from "vitest";
import * as eventImpact from "@/lib/eventImpact";
import {
  joinEventImpact,
  presentCarried,
  presentPosition,
  presentUnjoinable,
  type TouchedPosition,
} from "@/lib/eventImpact";
import fs from "fs";
import path from "path";

const pos = (over: Partial<TouchedPosition> = {}): TouchedPosition => ({
  id: "p1",
  ticker: "AAPL",
  shares: 120,
  status: "open",
  ...over,
});

const baseCtx = (tickers: Record<string, unknown>) => ({
  schema: "portfolio_ctx.v1",
  asof: "2026-09-05",
  tickers,
});

describe("eventImpact join", () => {
  it("1. carries verbatim", () => {
    const ctx = baseCtx({
      AAPL: {
        earnings: {
          next: "2026-10-30",
          days_to: 5,
          direction: "Bullish setup, per source.",
          direction_zh: "来源称看涨。",
          mechanism: "Reaction via options gamma.",
          timeframe: "Over the next 5 sessions.",
        },
      },
    });
    const read = joinEventImpact({ positions: [pos()], ctx });
    expect(read.state).toBe("ok");
    if (read.state !== "ok") throw new Error("unreachable");
    const e = read.events[0];
    expect(presentCarried(e.direction, "en")).toBe("Bullish setup, per source.");
    expect(presentCarried(e.direction, "zh")).toBe("来源称看涨。");
    expect(presentCarried(e.mechanism, "en")).toBe("Reaction via options gamma.");
    expect(presentCarried(e.timeframe, "en")).toBe("Over the next 5 sessions.");
  });

  it("2b. realistic production coverage (MAJOR: case 1 alone is fixture-only)", () => {
    // Measured on the macro producer's live artifact (portfolio_ctx.v2, 2026-09-06, 4,359
    // tickers): only 8 tickers carry an `earnings` block at all, and across the WHOLE artifact
    // zero tickers carry direction/mechanism/timeframe. A normal book therefore either resolves
    // to no_events (no held ticker in the 8) or to "ok" with all three slots not-stated (a held
    // ticker is one of the 8, matching case "2. prints missing" above) — it never exercises the
    // all-three-populated shape in case "1. carries verbatim", which is a mechanism unit test
    // only and does not reflect what the artifact actually emits.
    const ctx = baseCtx({
      AAPL: { earnings: { next: "2026-10-30", days_to: 5 } }, // one of the ~8 covered tickers
      // MSFT, GOOGL and every other held ticker below carry no earnings block at all — this is
      // the common case for the other 4,351 tickers in the artifact.
    });
    const positions = [
      pos({ id: "p1", ticker: "AAPL" }),
      pos({ id: "p2", ticker: "MSFT" }),
      pos({ id: "p3", ticker: "GOOGL" }),
    ];
    const read = joinEventImpact({ positions, ctx });
    expect(read.state).toBe("ok");
    if (read.state !== "ok") throw new Error("unreachable");
    expect(read.heldTickers).toBe(3);
    expect(read.events).toHaveLength(1);
    const e = read.events[0];
    expect(e.ticker).toBe("AAPL");
    expect(e.direction.state).toBe("not_stated");
    expect(e.mechanism.state).toBe("not_stated");
    expect(e.timeframe.state).toBe("not_stated");
  });

  it("2c. realistic production coverage, no held ticker covered (MAJOR)", () => {
    // The other side of the same measured shape: a book whose tickers are all outside the ~8
    // covered ones resolves to no_events, not to a false "ok" with empty events.
    const ctx = baseCtx({ AAPL: { earnings: { next: "2026-10-30", days_to: 5 } } });
    const positions = [pos({ id: "p1", ticker: "MSFT" }), pos({ id: "p2", ticker: "GOOGL" })];
    const read = joinEventImpact({ positions, ctx });
    expect(read.state).toBe("no_events");
    if (read.state !== "no_events") throw new Error("unreachable");
    expect(read.heldTickers).toBe(2);
  });

  it("2. prints missing (acceptance 2)", () => {
    const ctx = baseCtx({ AAPL: { earnings: { next: "2026-10-30", days_to: 5 } } });
    const read = joinEventImpact({ positions: [pos()], ctx });
    expect(read.state).toBe("ok");
    if (read.state !== "ok") throw new Error("unreachable");
    const e = read.events[0];
    expect(e.direction.state).toBe("not_stated");
    expect(e.mechanism.state).toBe("not_stated");
    expect(e.timeframe.state).toBe("not_stated");
    expect(presentCarried(e.direction, "en")).toBe("Not stated in the source");
    expect(presentCarried(e.direction, "zh")).toBe("来源未说明");
  });

  it("3. never guesses a date", () => {
    const cases = [
      { next: null, days_to: 5 },
      { next: "2026-10-30", days_to: null },
      { next: "", days_to: 5 },
      { next: "2026-10-30", days_to: "soon" },
    ];
    for (const earnings of cases) {
      const ctx = baseCtx({ AAPL: { earnings } });
      const read = joinEventImpact({ positions: [pos()], ctx });
      expect(read.state === "no_events" || read.state === "no_holdings").toBe(true);
    }
  });

  it("4. open positions only", () => {
    const ctx = baseCtx({ AAPL: { earnings: { next: "2026-10-30", days_to: 5 } } });
    const closedOnly = joinEventImpact({ positions: [pos({ status: "closed" })], ctx });
    expect(closedOnly.state).toBe("no_holdings");
    const reopened = joinEventImpact({
      positions: [pos({ status: "closed" }), pos({ id: "p2", status: "open" })],
      ctx,
    });
    expect(reopened.state).toBe("ok");
    if (reopened.state === "ok") expect(reopened.events.length).toBe(1);
  });

  it("5. unsized position still touched", () => {
    const ctx = baseCtx({ AAPL: { earnings: { next: "2026-10-30", days_to: 5 } } });
    const read = joinEventImpact({ positions: [pos({ shares: null })], ctx });
    expect(read.state).toBe("ok");
    if (read.state !== "ok") throw new Error("unreachable");
    const p = read.events[0].positions[0];
    expect(p.shares).toBeNull();
    expect(presentPosition(p, "en")).toBe("Size not recorded");
    expect(presentPosition(p, "zh")).toBe("未记录持仓数量");
  });

  it("6. ordering is date-then-ticker", () => {
    const ctx = baseCtx({
      ZZZZ: { earnings: { next: "2026-09-10", days_to: 1 } },
      AAPL: { earnings: { next: "2026-11-01", days_to: 50 } },
    });
    const read = joinEventImpact({
      positions: [
        pos({ id: "big", ticker: "AAPL", shares: 10000 }),
        pos({ id: "small", ticker: "ZZZZ", shares: 1 }),
      ],
      ctx,
    });
    expect(read.state).toBe("ok");
    if (read.state !== "ok") throw new Error("unreachable");
    expect(read.events.map((e) => e.ticker)).toEqual(["ZZZZ", "AAPL"]);
  });

  it("7. no scorer can be added silently", () => {
    const allowlist = [
      "joinEventImpact",
      "presentCarried",
      "presentDaysUntil",
      "presentEventSentence",
      "presentPosition",
      "presentUnjoinable",
      "NOT_STATED",
      "UNJOINABLE_SOURCES",
    ].sort();
    expect(Object.keys(eventImpact).sort()).toEqual(allowlist);
  });

  it("8. typed unreadable states", () => {
    expect(joinEventImpact({ positions: null, ctx: {} }).state).toBe("holdings_unreadable");
    expect(joinEventImpact({ positions: [pos()], ctx: null }).state).toBe("calendar_unreadable");
    expect(
      joinEventImpact({ positions: [pos()], ctx: { schema: "something_else.v1" } }).state
    ).toBe("calendar_unreadable");
  });

  it("9. empty vs unreadable are distinct", () => {
    const ctxNoEvents = baseCtx({});
    const zeroHeld = joinEventImpact({ positions: [], ctx: ctxNoEvents });
    expect(zeroHeld.state).toBe("no_holdings");
    const noNamed = joinEventImpact({ positions: [pos()], ctx: ctxNoEvents });
    expect(noNamed.state).toBe("no_events");
    if (noNamed.state === "no_events") expect(noNamed.heldTickers).toBe(1);
  });

  it("10. unjoinable disclosure", () => {
    const read = joinEventImpact({ positions: [pos()], ctx: baseCtx({}) });
    if (read.state !== "no_events") throw new Error("unreachable");
    const en = presentUnjoinable(read.unjoinable, "en");
    const zh = presentUnjoinable(read.unjoinable, "zh");
    expect(en).toContain("macro release calendar");
    expect(en).toContain("index-review calendar");
    expect(zh).toContain("宏观数据发布日历");
    expect(zh).toContain("指数检讨日历");
  });

  it("11. single source of the missing string", () => {
    const file = fs.readFileSync(
      path.join(process.cwd(), "components", "EventImpactPanel.tsx"),
      "utf8"
    );
    expect(file.includes("Not stated in the source")).toBe(false);
    expect(file.includes("来源未说明")).toBe(false);
    const copyMatch = file.match(/const COPY: Record<string, \[string, string\]> = \{([\s\S]*?)\n\};/);
    expect(copyMatch).not.toBeNull();
    const body = copyMatch![1];
    const entries = [...body.matchAll(/\[\s*"([^"]*)"\s*,\s*"([^"]*)"\s*\]/g)];
    expect(entries.length).toBeGreaterThan(0);
    for (const [, en, zh] of entries) {
      expect(en.length).toBeGreaterThan(0);
      expect(zh.length).toBeGreaterThan(0);
    }
  });
});
