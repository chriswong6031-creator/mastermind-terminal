import { describe, expect, it } from "vitest";
import { buildEventMarkers, parseChartEvents } from "../chartEvents";

describe("chart corporate events", () => {
  const fund = {
    earnings: { q: [{ report_date: "2026-07-25", period: "Q2 2026", eps_a: 2.1, eps_e: 2, surp_pct: 5 }] },
    dividends: {
      events: [{ ex: "2026-07-24", amount: 0.91, pay: "2026-08-10" }],
      splits: [{ date: "2026-07-23", ratio: "3:1" }],
    },
  };

  it("honors each event visibility preference", () => {
    const events = parseChartEvents(fund, { showEarnings: true, showDividends: false, showSplits: true });
    expect(events.map((event) => event.kind)).toEqual(["split", "earnings"]);
  });

  it("snaps weekend events to a real trading bar without inventing x-axis data", () => {
    const events = parseChartEvents(fund, { showEarnings: true, showDividends: true, showSplits: true });
    const bars = [{ time: "2026-07-23" }, { time: "2026-07-24" }, { time: "2026-07-27" }];
    const built = buildEventMarkers(events, bars);
    const earnings = built.markers.find((marker) => marker.text === "E");
    expect(earnings?.time).toBe("2026-07-24");
    expect(built.byId.get(earnings?.id ?? "")?.period).toBe("Q2 2026");
  });
});
