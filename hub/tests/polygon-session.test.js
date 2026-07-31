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
});
