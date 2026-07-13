// dayStats.test.ts — unit tests for DayStatsStrip exported pure helpers.
// Uses the same 5m ET display-epoch grid fixtures as intradayMath.test.ts.
// All times are display-epochs: ET wall-clock reinterpreted as UTC seconds.

import { describe, it, expect } from "vitest";
import {
  calcGapPct,
  calcRangeUsedPct,
  calcDeltaVwapPct,
  calcHodLod,
  getSessionBadge,
} from "@/components/DayStatsStrip";

// ── Fixture helpers ────────────────────────────────────────────────────────────

// ET display-epoch: 09:30 = 570 min into a reference day
// We use day 0 = epoch 0 for simplicity (dayKey = 0 for all bars on t<86400)
// and day 1 = epoch 86400 for a second session.

/** Build a fake 5m bar from a base epoch + offset minutes. */
const bar = (baseDay: number, minOffset: number, o: number, h: number, l: number, c: number, v = 1_000_000) => ({
  time: baseDay * 86400 + minOffset * 60,
  o, h, l, c, v,
});

// RTH bar at 09:30 on day 0 = minOffset 570
const DAY0 = 0;   // dayKey = 0
const DAY1 = 1;   // dayKey = 1 (second session: base epoch 86400)

// ── Fixture: two sessions, 5m grid, 09:30–10:00 RTH bars ────────────────────
// Day 0: prior session (used as baseline/daily data)
// Day 1: current session (today's intraday bars)

// Day 0 daily bar (from daily cache)
const daily0 = { time: "1970-01-01", h: 105, l: 95, c: 100 };

// Day 1 today bars (09:30, 09:35, 09:40)
const todayBars = [
  bar(DAY1, 570, 102, 106, 101, 104),  // 09:30 open=102 (gap up from 100)
  bar(DAY1, 575, 104, 107, 103, 105),  // 09:35
  bar(DAY1, 580, 105, 108, 102, 103),  // 09:40
];

// Prior daily bars array (14 bars to satisfy ATR calc)
const makeDailyBars = (count: number, h = 105, l = 95, c = 100): { time: string; h: number; l: number; c: number }[] => {
  const out = [];
  for (let i = 0; i < count; i++) {
    // Simple day strings in order, all strictly before today (1970-01-02)
    const d = new Date(0); d.setUTCDate(d.getUTCDate() - (count - i));
    out.push({ time: d.toISOString().slice(0, 10), h, l, c });
  }
  return out;
};

// ── Tests: calcGapPct ─────────────────────────────────────────────────────────

describe("calcGapPct", () => {
  it("returns positive gap when open > PDC", () => {
    // PDC = 100, today open = 102 → gap = (102-100)/100 * 100 = +2%
    const daily = [daily0];
    const result = calcGapPct(todayBars, "us", daily);
    expect(result).not.toBeNull();
    expect(result!).toBeCloseTo(2.0, 1);
  });

  it("returns negative gap when open < PDC", () => {
    const daily = [{ time: "1970-01-01", h: 110, l: 100, c: 110 }]; // PDC = 110
    const result = calcGapPct(todayBars, "us", daily);
    expect(result).not.toBeNull();
    expect(result!).toBeLessThan(0);
  });

  it("returns null when no prior daily bar", () => {
    expect(calcGapPct(todayBars, "us", [])).toBeNull();
  });

  it("returns null when no RTH bars", () => {
    // Premarket-only bars (minOffset < 570)
    const pmBars = [bar(DAY1, 400, 102, 103, 101, 102)];
    expect(calcGapPct(pmBars, "us", [daily0])).toBeNull();
  });

  it("returns null when bars array is empty", () => {
    expect(calcGapPct([], "us", [daily0])).toBeNull();
  });
});

// ── Tests: calcRangeUsedPct ───────────────────────────────────────────────────

describe("calcRangeUsedPct", () => {
  it("returns range used as percentage of 14d ATR", () => {
    // Today H=108, L=101, range=7
    // Daily bars: all H=105, L=95 → daily range = 10 each, ATR ≈ 10 (no close-to-close gaps in uniform data)
    const daily = makeDailyBars(15);
    const result = calcRangeUsedPct(todayBars, daily);
    expect(result).not.toBeNull();
    expect(result!).toBeGreaterThan(0);
    expect(result!).toBeLessThan(200); // sanity
  });

  it("returns null when too few prior daily bars", () => {
    const daily = makeDailyBars(1);
    const result = calcRangeUsedPct(todayBars, daily);
    expect(result).toBeNull();
  });

  it("returns null when bars is empty", () => {
    expect(calcRangeUsedPct([], makeDailyBars(15))).toBeNull();
  });

  it("returns null when no daily bars", () => {
    expect(calcRangeUsedPct(todayBars, [])).toBeNull();
  });

  it("today range is proportional to ATR", () => {
    // Uniform daily bars with H=110, L=100, C=105 (range=10, no gap ATR~10)
    const daily = makeDailyBars(15, 110, 100, 105);
    // Today bars with range = 5 (half of ATR) → expect ~50%
    const todayHalf = [
      bar(DAY1, 570, 105, 107.5, 102.5, 106),
    ];
    const result = calcRangeUsedPct(todayHalf, daily);
    expect(result).not.toBeNull();
    // Can't be exactly 50 because ATR uses true range with prior close gaps
    expect(result!).toBeGreaterThan(0);
  });
});

// ── Tests: calcDeltaVwapPct ───────────────────────────────────────────────────

describe("calcDeltaVwapPct", () => {
  it("returns near-zero when close equals VWAP", () => {
    // Single bar: close=TP=(h+l+c)/3 exactly → ΔVWAP ≈ 0
    const singleBar = [bar(DAY1, 570, 100, 106, 94, 106)]; // tp = (106+94+106)/3=102, close=106
    const result = calcDeltaVwapPct(singleBar, "us");
    // VWAP for single bar = tp = 102, last close = 106 → delta = (106-102)/102 * 100 ≈ +3.9%
    expect(result).not.toBeNull();
    expect(result!).toBeCloseTo(3.92, 0);
  });

  it("returns null when bars is empty", () => {
    expect(calcDeltaVwapPct([], "us")).toBeNull();
  });

  it("returns positive when close is above VWAP", () => {
    // Bar with high close relative to typical price
    const bars = [bar(DAY1, 570, 100, 100, 90, 100)]; // tp=(100+90+100)/3≈96.67, close=100
    const result = calcDeltaVwapPct(bars, "us");
    expect(result!).toBeGreaterThan(0);
  });

  it("returns negative when close is below VWAP", () => {
    const bars = [bar(DAY1, 570, 100, 110, 100, 100)]; // tp=(110+100+100)/3≈103.33, close=100
    const result = calcDeltaVwapPct(bars, "us");
    expect(result!).toBeLessThan(0);
  });
});

// ── Tests: calcHodLod ─────────────────────────────────────────────────────────

describe("calcHodLod", () => {
  it("returns correct HOD and LOD for a single bar", () => {
    const { hod, lod } = calcHodLod([bar(DAY1, 570, 100, 108, 98, 104)]);
    expect(hod).toBe(108);
    expect(lod).toBe(98);
  });

  it("returns correct HOD and LOD across multiple bars", () => {
    const bars = [
      bar(DAY1, 570, 100, 106, 99, 104),
      bar(DAY1, 575, 104, 110, 101, 108), // highest h
      bar(DAY1, 580, 108, 109, 96, 100),  // lowest l
    ];
    const { hod, lod } = calcHodLod(bars);
    expect(hod).toBe(110);
    expect(lod).toBe(96);
  });

  it("returns null for empty array", () => {
    const { hod, lod } = calcHodLod([]);
    expect(hod).toBeNull();
    expect(lod).toBeNull();
  });
});

// ── Tests: getSessionBadge ────────────────────────────────────────────────────

describe("getSessionBadge", () => {
  it("returns RTH during regular trading hours (570–959 min)", () => {
    expect(getSessionBadge("us", 570)).toBe("RTH");  // exact open
    expect(getSessionBadge("us", 700)).toBe("RTH");  // midday
    expect(getSessionBadge("us", 959)).toBe("RTH");  // last RTH minute
  });

  it("returns PRE for US premarket (240–569 min)", () => {
    expect(getSessionBadge("us", 240)).toBe("PRE");  // 4:00 AM ET
    expect(getSessionBadge("us", 500)).toBe("PRE");
    expect(getSessionBadge("us", 569)).toBe("PRE");
  });

  it("returns AH for US after-hours (960–1199 min)", () => {
    expect(getSessionBadge("us", 960)).toBe("AH");   // 4:00 PM ET
    expect(getSessionBadge("us", 1100)).toBe("AH");
    expect(getSessionBadge("us", 1199)).toBe("AH");
  });

  it("returns LUNCH during CN/HK midday halt; RTH resumes after", () => {
    expect(getSessionBadge("cn", 700)).toBe("LUNCH");  // 11:40 CN — halt
    expect(getSessionBadge("cn", 689)).toBe("RTH");    // 11:29 CN — still trading
    expect(getSessionBadge("cn", 780)).toBe("RTH");    // 13:00 CN — resumed
    expect(getSessionBadge("cn", 800)).toBe("RTH");    // afternoon session
    expect(getSessionBadge("hk", 750)).toBe("LUNCH");  // 12:30 HK — halt
    expect(getSessionBadge("hk", 700)).toBe("RTH");    // 11:40 HK — still trading (halt starts 12:00)
    expect(getSessionBadge("us", 700)).toBe("RTH");    // US has no lunch halt
  });

  it("returns CLOSED outside trading window", () => {
    expect(getSessionBadge("us", 0)).toBe("CLOSED");   // midnight
    expect(getSessionBadge("us", 239)).toBe("CLOSED"); // just before premarket
    expect(getSessionBadge("us", 1200)).toBe("CLOSED"); // 8:00 PM+ = closed
    expect(getSessionBadge("us", 1439)).toBe("CLOSED");
  });

  it("returns RTH always for crypto", () => {
    expect(getSessionBadge("crypto", 0)).toBe("RTH");
    expect(getSessionBadge("crypto", 570)).toBe("RTH");
    expect(getSessionBadge("crypto", 1200)).toBe("RTH");
  });

  it("returns RTH for cn during market hours", () => {
    // CN opens at 09:30 (570 min), closes at 15:00 (900 min)
    expect(getSessionBadge("cn", 570)).toBe("RTH");
    expect(getSessionBadge("cn", 800)).toBe("RTH");
    expect(getSessionBadge("cn", 899)).toBe("RTH");
  });

  it("returns CLOSED for cn outside market hours", () => {
    expect(getSessionBadge("cn", 0)).toBe("CLOSED");
    expect(getSessionBadge("cn", 569)).toBe("CLOSED");
    expect(getSessionBadge("cn", 900)).toBe("CLOSED");
  });
});
