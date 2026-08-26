import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import EventEdgePop from "@/components/fin/EventEdgePop";
import EarningsPage from "@/components/fin/EarningsPage";
import OverviewPage from "@/components/fin/OverviewPage";
import type { Fund } from "@/lib/fund";
import { curateFundamentals } from "@/lib/copilotTools";

const anchor = {
  left: 0,
  top: 0,
  right: 0,
  bottom: 0,
  width: 0,
  height: 0,
  x: 0,
  y: 0,
  toJSON: () => ({}),
} as DOMRect;

function krusFund(nextDate: string): Fund {
  return {
    schema: "mastermind.fund/v1",
    ticker: "KRUS",
    earnings: { next_date: nextDate, q: [], fy: [] },
  } as unknown as Fund;
}

function renderSurfaces(nextDate: string) {
  const fund = krusFund(nextDate);
  return {
    earnings: renderToStaticMarkup(createElement(EarningsPage, { fund, sym: "KRUS" })),
    overview: renderToStaticMarkup(createElement(OverviewPage, { fund, sym: "KRUS", onNavigate: () => {} })),
    eventEdge: renderToStaticMarkup(createElement(EventEdgePop, {
      anchor,
      intel: { analysis: { analyst: { next_date: nextDate } } },
      onClose: () => {},
    })),
    ai: curateFundamentals({
      schema: "mastermind.fund/v1",
      ticker: "KRUS",
      earnings: { next_date: nextDate, q: [] },
    }),
  };
}

describe("next earnings consumer defense", () => {
  afterEach(() => vi.useRealTimers());

  it("keeps a stale KRUS date out of every surface that calls it next", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-26T12:00:00.000Z"));

    const surfaces = renderSurfaces("2026-08-25");

    expect(surfaces.earnings).not.toContain("Aug 25, 2026");
    expect(surfaces.overview).not.toContain("Aug 25, 2026");
    expect(surfaces.eventEdge).not.toContain("Aug 25");
    expect(surfaces.ai.next_earnings).toBeNull();
  });

  it("keeps a future KRUS date available to every next-earnings surface", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-26T12:00:00.000Z"));

    const surfaces = renderSurfaces("2026-09-15");

    expect(surfaces.earnings).toContain("Sep 15, 2026");
    expect(surfaces.overview).toContain("Sep 15, 2026");
    expect(surfaces.eventEdge).toContain("Sep 15");
    expect(surfaces.ai.next_earnings).toBe("2026-09-15");
  });

  it("keeps an impossible ISO-shaped legacy date out of every next surface", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-26T12:00:00.000Z"));

    const surfaces = renderSurfaces("2026-09-31");

    expect(surfaces.earnings).not.toContain("Oct 1, 2026");
    expect(surfaces.overview).not.toContain("Oct 1, 2026");
    expect(surfaces.eventEdge).not.toContain("Oct 1");
    expect(surfaces.ai.next_earnings).toBeNull();
  });
});
