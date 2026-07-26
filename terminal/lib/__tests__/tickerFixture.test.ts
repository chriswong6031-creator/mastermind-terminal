// Ticker-drill fixture (live_flow.ticker/v1) — the data plane behind the Options Hub
// Tickers tab and the Flow Desk inspector KV grid.
//
// Two things are locked here:
//   1. HONEST EMPTY. fixtureFor("ticker:<ROOT>") for a root the fixture does not carry
//      must return {} — never the first key's payload. The old first-key fallback served
//      NVDA's whole day panel under any unknown root's selection (header said "NVDA"
//      while QQQ/GLD was selected), which is exactly the wrong-root hazard the gex:/
//      moves:/gexstate: branches already refuse. Consumers gate on payload.day, so {}
//      lands in the drill's "no data" state, same as a prod 503 for a missing root.
//   2. ENTRY INTEGRITY. Every root the fixture carries is a full renderable drill:
//      390 minutes, day.net_soft exactly equal to the final cumulative ncp+npp (the
//      minute chart and the day stat must agree), and top_contracts that reference only
//      listed strikes/expiries. A future entry authored by hand that breaks one of
//      these renders as a subtly wrong drill, not an error — so the shape is asserted.
import { describe, it, expect } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { fixtureFor } from "@/lib/flowSource";

const TICKER_FIXTURE = path.join(process.cwd(), "public", "data", "ticker_fixture.json");

type Minute = { t: string; ncp: number; npp: number; vol: number };
type TickerEntry = {
  schema: string;
  root: string;
  group: string;
  group_zh: string;
  day: { gross: number; net_soft: number; call_share: number; n_events: number };
  minutes: Minute[];
  strikes: { strike: number; call_prem: number; put_prem: number; vol: number }[];
  expiries: { exp: string; call_prem: number; put_prem: number; vol: number }[];
  top_contracts: { right: "C" | "P"; exp: string; strike: number; premium: number }[];
};

const loadAll = async () =>
  JSON.parse(await fs.readFile(TICKER_FIXTURE, "utf8")) as Record<string, TickerEntry>;

describe("fixtureFor ticker: — root keying", () => {
  it("serves QQQ's own drill for ticker:QQQ (the Tickers tab's cold-start index root)", async () => {
    const doc = (await fixtureFor("ticker:QQQ")) as TickerEntry;
    expect(doc.root).toBe("QQQ");
    expect(doc.schema).toBe("live_flow.ticker/v1");
    expect(doc.group).toBe("Index ETF");
    expect(doc.group_zh).toBe("指数ETF");
    expect(doc.day).toBeTruthy();
  });

  it("returns an honest empty for an unknown root — never the first key's payload", async () => {
    // GLD sits on the flow_fixture unusual board (so it IS selectable on the Tickers
    // tab cold) but has no drill entry; it must get {}, not NVDA's day panel.
    const doc = await fixtureFor("ticker:GLD");
    expect(doc).toEqual({});
    expect((doc as { day?: unknown }).day).toBeUndefined();
  });
});

describe("ticker fixture — entry integrity (every root)", () => {
  it("each entry is a full renderable drill keyed by its own root", async () => {
    const all = await loadAll();
    expect(Object.keys(all)).toContain("QQQ");
    for (const [key, e] of Object.entries(all)) {
      expect(e.root, key).toBe(key);
      expect(e.schema, key).toBe("live_flow.ticker/v1");
      expect(e.minutes, key).toHaveLength(390);
      expect(e.minutes[0].t, key).toBe("09:30");
      expect(e.minutes[389].t, key).toBe("15:59");
      // The day stat and the minute chart must tell the same story: net_soft is the
      // final cumulative net call + net put premium, exactly.
      const last = e.minutes[389];
      expect(e.day.net_soft, key).toBe(last.ncp + last.npp);
      for (const m of e.minutes) {
        expect(Number.isInteger(m.ncp) && Number.isInteger(m.npp), `${key} ${m.t}`).toBe(true);
        expect(m.vol, `${key} ${m.t}`).toBeGreaterThanOrEqual(50);
        expect(m.vol, `${key} ${m.t}`).toBeLessThanOrEqual(800);
      }
      // Ladder and expiry bars: the drill's cross-references resolve within the entry.
      const strikeSet = new Set(e.strikes.map((s) => s.strike));
      const expSet = new Set(e.expiries.map((x) => x.exp));
      expect(e.strikes.length, key).toBeGreaterThan(0);
      expect(e.expiries.length, key).toBeGreaterThan(0);
      for (const c of e.top_contracts) {
        expect(strikeSet.has(c.strike), `${key} tc strike ${c.strike}`).toBe(true);
        expect(expSet.has(c.exp), `${key} tc exp ${c.exp}`).toBe(true);
        expect(c.right === "C" || c.right === "P", key).toBe(true);
        expect(c.premium, key).toBeGreaterThan(0);
      }
    }
  });
});
