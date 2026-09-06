// @vitest-environment jsdom
//
// Component render test for EventImpactPanel (MAJOR: acceptance 2 was unexercised at the render
// level — case 2/11 in eventImpact.test.ts only assert the pure presentCarried() helper and
// regex the source file, never React output). This mounts the real component with react-dom and
// asserts the rendered DOM text, not the source text.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import React, { act } from "react";
import type { EventImpactRead } from "@/lib/eventImpact";

vi.mock("@/lib/i18n", () => ({
  useLang: () => ({ lang: "en", setLang: () => {} }),
}));

const fetchMock = vi.fn();

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function renderWith(body: EventImpactRead, status = 200) {
  fetchMock.mockResolvedValue(new Response(JSON.stringify(body), { status }));
  const { default: EventImpactPanel } = await import("@/components/EventImpactPanel");
  root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(EventImpactPanel, { positions: [], holdingsUnreadable: false }));
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("EventImpactPanel render (acceptance 2)", () => {
  it("renders 'not stated' text for a direction the source never carried", async () => {
    const body: EventImpactRead = {
      state: "ok",
      asof: "2026-09-05",
      heldTickers: 1,
      unjoinable: [],
      events: [
        {
          eventId: "earnings|AAPL|2026-10-30",
          kind: "earnings",
          ticker: "AAPL",
          date: "2026-10-30",
          daysUntil: 5,
          positions: [{ id: "p1", ticker: "AAPL", shares: 10, status: "open" }],
          direction: { state: "not_stated" },
          mechanism: { state: "not_stated" },
          timeframe: { state: "not_stated" },
          sourcePath: "/data/portfolio_ctx.json",
        },
      ],
    };
    await renderWith(body);
    const slot = container.querySelector('[data-slot="direction"]');
    expect(slot?.getAttribute("data-stated")).toBe("0");
    expect(slot?.textContent).toContain("Not stated in the source");
    expect(container.textContent).not.toMatch(/bullish|bearish|neutral/i);
  });

  it("renders the carried verbatim text when the source states it", async () => {
    const body: EventImpactRead = {
      state: "ok",
      asof: "2026-09-05",
      heldTickers: 1,
      unjoinable: [],
      events: [
        {
          eventId: "earnings|AAPL|2026-10-30",
          kind: "earnings",
          ticker: "AAPL",
          date: "2026-10-30",
          daysUntil: 5,
          positions: [{ id: "p1", ticker: "AAPL", shares: 10, status: "open" }],
          direction: { state: "stated", text: "Guidance raise expected", textZh: null },
          mechanism: { state: "not_stated" },
          timeframe: { state: "not_stated" },
          sourcePath: "/data/portfolio_ctx.json",
        },
      ],
    };
    await renderWith(body);
    const slot = container.querySelector('[data-slot="direction"]');
    expect(slot?.getAttribute("data-stated")).toBe("1");
    expect(slot?.textContent).toContain("Guidance raise expected");
  });

  it("renders a plain typed sentence, not a blank panel, when the calendar is unreadable", async () => {
    await renderWith({ state: "calendar_unreadable", detail: "bad schema" });
    expect(container.querySelector('[data-testid="event-impact-calendar-unreadable"]')).toBeTruthy();
  });

  it("renders a stale disclosure when the route served a cached-past-outage copy", async () => {
    const body: EventImpactRead = {
      state: "no_events",
      asof: "2026-09-05",
      heldTickers: 1,
      unjoinable: [],
      stale: true,
    };
    await renderWith(body);
    expect(container.querySelector('[data-testid="event-impact-stale"]')).toBeTruthy();
  });

  it("renders a typed sentence, not a blank panel, on a 401 from the route", async () => {
    await renderWith({ state: "unauthenticated" }, 401);
    expect(container.querySelector('[data-testid="event-impact-unauthenticated"]')).toBeTruthy();
  });
});
