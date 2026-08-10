"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { Polygon } = require("../lib/polygon");
const { classifySession } = require("../lib/usSession");

describe("Polygon regular and extended quote lanes", () => {
  it("never classifies a weekend clock time as RTH", () => {
    const saturday = Date.UTC(2026, 7, 1, 14, 0); // 10:00 ET
    assert.equal(classifySession(saturday), "overnight");
  });

  it("routes premarket aggregates only to the extended feed", () => {
    const quotes = [];
    const extended = [];
    const polygon = new Polygon(
      { setQuote: (...args) => quotes.push(args), quotes: new Map() },
      "test-key",
      { ingest: (...args) => extended.push(args) },
    );
    const start = Date.UTC(2026, 6, 30, 13, 0); // 09:00 ET
    polygon._onAM({ ev: "AM", sym: "NVDA", o: 170, h: 171, l: 169, c: 170.5, v: 10, s: start, e: start + 59999 });

    assert.equal(quotes.length, 0, "premarket aggregate must not mutate the regular quote");
    assert.equal(extended.length, 1);
    assert.equal(extended[0][0], "NVDA");
    assert.equal(extended[0][1].session, "pre");
    assert.equal(extended[0][1].price, 170.5);
  });

  it("keeps RTH aggregates in the regular quote lane", () => {
    const quotes = [];
    const extended = [];
    const polygon = new Polygon(
      { setQuote: (...args) => quotes.push(args), quotes: new Map() },
      "test-key",
      { ingest: (...args) => extended.push(args) },
    );
    const start = Date.UTC(2026, 6, 30, 14, 0); // 10:00 ET
    polygon._onAM({ ev: "AM", sym: "NVDA", o: 172, h: 173, l: 171, c: 172.5, v: 20, s: start, e: start + 59999 });

    assert.equal(extended.length, 0);
    assert.equal(quotes.length, 1);
    assert.equal(quotes[0][1].last, 172.5);
    assert.equal(quotes[0][1].regularSession, "rth");
    assert.equal(quotes[0][1].regularSessionDate, "2026-07-30");
  });

  it("publishes measured one-second OHLC from the live A.* lane", () => {
    const quotes = [];
    const polygon = new Polygon(
      { setQuote: (...args) => quotes.push(args), quotes: new Map() },
      "test-key",
      { ingest: () => {} },
    );
    polygon.cluster = "live";
    const realNow = Date.now;
    const start = Date.UTC(2026, 6, 30, 14, 0, 7); // 10:00:07 ET
    Date.now = () => start + 1_050;
    try {
      polygon._onA({
        ev: "A", sym: "NVDA", o: 172, h: 172.4, l: 171.9, c: 172.25,
        v: 20, av: 12_345, op: 170, s: start, e: start + 999,
      });
    } finally {
      Date.now = realNow;
    }

    assert.equal(quotes.length, 1);
    assert.equal(quotes[0][1].basis, "REALTIME");
    assert.equal(quotes[0][1].last, 172.25);
    assert.equal(quotes[0][1].tickOpen, 172);
    assert.equal(quotes[0][1].tickHigh, 172.4);
    assert.equal(quotes[0][1].tickLow, 171.9);
    assert.equal(quotes[0][1].tickClose, 172.25);
    assert.equal(quotes[0][1].tickStartMs, start);
    assert.equal(quotes[0][1].asOfMs, start + 999);
    assert.equal(quotes[0][1].lagMs, 51);
  });

  it("subscribes A.* on live and AM.* on delayed without duplicate sockets", () => {
    const frames = [];
    const store = {
      setQuote: () => {}, quotes: new Map(),
      markSubscribed: () => {},
      manifest: { lastBySym: new Map() },
    };
    const polygon = new Polygon(store, "test-key", null);
    polygon._send = (frame) => frames.push(frame);

    polygon.cluster = "live";
    polygon.ensureSubscribed("AAPL");
    assert.equal(frames.at(-1).params, "A.AAPL");

    polygon.cluster = "delayed";
    polygon.ensureSubscribed("MSFT");
    assert.equal(frames.at(-1).params, "AM.MSFT");
  });
});
