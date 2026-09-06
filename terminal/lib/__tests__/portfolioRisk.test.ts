import { describe, it, expect } from "vitest";
import {
  computePortfolioRisk,
  riskCopy,
  type ArtifactState,
  type RiskInputPosition,
} from "@/lib/portfolioRisk";

const pos = (ticker: string, shares: number | null, entryPrice: number | null, status: "open" | "closed" = "open"): RiskInputPosition =>
  ({ ticker, shares, entryPrice, status });

const read = (facts: Partial<{ sector: string | null; marketCap: number | null; thinlyTraded: boolean | null }>, ticker: string): ArtifactState =>
  ({ kind: "read", facts: { ticker, sector: null, marketCap: null, thinlyTraded: null, ...facts } });

// Fixture book: 6 open + 1 closed.
const FIXTURE: RiskInputPosition[] = [
  pos("AAA", 100, 100),   // cost 10,000
  pos("BBB", 50, 200),    // cost 10,000 (tie with AAA)
  pos("CCC", 10, 500),    // cost 5,000
  pos("DDD", 5, 400),     // cost 2,000
  pos("EEE", 1, 1000),    // cost 1,000
  pos("FFF", null, 50),   // unsized -> no_size
  pos("ZZZ", 1, 1, "closed"),
];

const FIXTURE_ARTIFACTS: Record<string, ArtifactState> = {
  AAA: read({ sector: "Information Technology", marketCap: 300e9, thinlyTraded: false }, "AAA"),
  BBB: read({ sector: "Health Care", marketCap: 5e9, thinlyTraded: false }, "BBB"),
  CCC: read({ sector: "Information Technology", marketCap: 1e9, thinlyTraded: true }, "CCC"),
  DDD: { kind: "locked" },
  EEE: read({ sector: null, marketCap: null, thinlyTraded: null }, "EEE"),
};

describe("computePortfolioRisk", () => {
  it("1: top1 and topNWeightPct exact to 1dp; closed position excluded", () => {
    const risk = computePortfolioRisk(FIXTURE, FIXTURE_ARTIFACTS);
    // sized total = 10000+10000+5000+2000+1000 = 28000
    expect(risk.concentration!.top1!.ticker).toBe("AAA"); // tie-break ticker asc vs BBB
    expect(risk.concentration!.top1!.weightPct).toBeCloseTo((10000 / 28000) * 100, 1);
    expect(risk.concentration!.topNWeightPct).toBeCloseTo(((10000 + 10000 + 5000) / 28000) * 100, 1);
    expect(risk.totalCost).toBeCloseTo(28000, 0);
  });

  it("2: unsized position excluded from denominators, gapped no_size, counted in total", () => {
    const risk = computePortfolioRisk(FIXTURE, FIXTURE_ARTIFACTS);
    expect(risk.counts.total).toBe(6); // 6 open (excludes the closed one)
    expect(risk.counts.sized).toBe(5);
    expect(risk.gaps.some((g) => g.ticker === "FFF" && g.reason === "no_size")).toBe(true);
  });

  it("3: sectors + sectorUncoveredPct === 100; sizes + sizeUncoveredPct === 100", () => {
    const risk = computePortfolioRisk(FIXTURE, FIXTURE_ARTIFACTS);
    const sectorSum = risk.sectors.reduce((a, s) => a + s.weightPct, 0) + risk.sectorUncoveredPct;
    expect(sectorSum).toBeCloseTo(100, 1);
    const sizeSum = risk.sizes.reduce((a, s) => a + s.weightPct, 0) + risk.sizeUncoveredPct;
    expect(sizeSum).toBeCloseTo(100, 1);
  });

  it("4: all thinlyTraded null -> liquidity === null (typed unread), never {thinPct:0}", () => {
    const allNullArtifacts: Record<string, ArtifactState> = {
      AAA: read({ sector: "Information Technology", marketCap: 300e9, thinlyTraded: null }, "AAA"),
      BBB: read({ sector: "Health Care", marketCap: 5e9, thinlyTraded: null }, "BBB"),
      CCC: read({ sector: "Information Technology", marketCap: 1e9, thinlyTraded: null }, "CCC"),
      DDD: read({ sector: "Energy", marketCap: 1e9, thinlyTraded: null }, "DDD"),
      EEE: read({ sector: "Energy", marketCap: 1e9, thinlyTraded: null }, "EEE"),
    };
    const risk = computePortfolioRisk(FIXTURE, allNullArtifacts);
    expect(risk.liquidity).toBeNull();
  });

  it("5: locked artifact yields page_locked, never no_page", () => {
    const risk = computePortfolioRisk(FIXTURE, FIXTURE_ARTIFACTS);
    expect(risk.gaps.some((g) => g.ticker === "DDD" && g.reason === "page_locked")).toBe(true);
    expect(risk.gaps.some((g) => g.ticker === "DDD" && g.reason === "no_page")).toBe(false);
  });

  it("6: fewer than 3 sized positions -> real topNCount; copy never says 'top 3'", () => {
    const small: RiskInputPosition[] = [pos("AAA", 1, 100), pos("BBB", 1, 50)];
    const risk = computePortfolioRisk(small, {
      AAA: read({ sector: "Energy" }, "AAA"),
      BBB: read({ sector: "Energy" }, "BBB"),
    });
    expect(risk.concentration!.topNCount).toBe(2);
    const copy = riskCopy(risk);
    const all = JSON.stringify(copy);
    expect(all.toLowerCase()).not.toContain("top 3");
  });

  it("7: deterministic tie-break — equal-weight names order by ticker ascending", () => {
    const tie: RiskInputPosition[] = [pos("ZED", 100, 100), pos("ABC", 100, 100)];
    const risk = computePortfolioRisk(tie, {});
    expect(risk.concentration!.top1!.ticker).toBe("ABC");
    const tieReversedInput: RiskInputPosition[] = [pos("ABC", 100, 100), pos("ZED", 100, 100)];
    const risk2 = computePortfolioRisk(tieReversedInput, {});
    expect(risk2.concentration!.top1!.ticker).toBe("ABC");
  });

  it("8: concentration fully populated when every artifact is unreadable", () => {
    const unreadable: Record<string, ArtifactState> = {
      AAA: { kind: "unreadable" }, BBB: { kind: "unreadable" }, CCC: { kind: "unreadable" },
      DDD: { kind: "unreadable" }, EEE: { kind: "unreadable" },
    };
    const risk = computePortfolioRisk(FIXTURE, unreadable);
    expect(risk.concentration).not.toBeNull();
    expect(risk.concentration!.top1!.ticker).toBe("AAA");
    expect(risk.sectors.length).toBe(0);
    expect(risk.sectorUncoveredPct).toBeCloseTo(100, 1);
  });

  it("9: EN/ZH parity — every Bilingual has non-empty en/zh, no CJK in en, zh differs from en", () => {
    const risk = computePortfolioRisk(FIXTURE, FIXTURE_ARTIFACTS);
    const copy = riskCopy(risk);
    const pairs: [string, string][] = [];
    const collect = (b: { en: string; zh: string } | null | undefined) => { if (b) pairs.push([b.en, b.zh]); };
    collect(copy.title); collect(copy.standing); collect(copy.basis); collect(copy.coverage);
    for (const card of copy.cards) { collect(card.label); collect(card.question); collect(card.value); collect(card.sub); collect(card.unread); }
    for (const row of copy.legend.flat()) collect(row.label);
    collect(copy.gapsSummary);
    for (const g of copy.gapLines) collect(g.text);
    const cjk = /[一-鿿]/;
    // A bare ticker symbol (e.g. "AAA") is legitimately identical in both languages — it is not a
    // translated sentence, so it is exempt from the "zh differs from en" check.
    const isBareTicker = (v: string) => /^[A-Z]{1,10}$/.test(v);
    for (const [en, zh] of pairs) {
      expect(en.length).toBeGreaterThan(0);
      expect(zh.length).toBeGreaterThan(0);
      expect(cjk.test(en)).toBe(false);
      if (!/^\d/.test(en) && !isBareTicker(en)) expect(en).not.toBe(zh);
    }
  });

  it("10: vocabulary ban — no emitted string matches the banned list", () => {
    const risk = computePortfolioRisk(FIXTURE, FIXTURE_ARTIFACTS);
    const copy = riskCopy(risk);
    const banned = [
      "score", "rank", "ranked", "target", "buy", "sell", "rebalance", "overweight",
      "underweight", "recommend", "suggested", "signal", "falsifier", "refuted",
      "证伪", "建议", "超配", "低配", "评分", "排名",
    ];
    // Two frozen section-7 phrases legitimately contain a banned substring in a NON-directive
    // sense and are exempted here rather than reworded (the copy itself is frozen spec text):
    //   "buy price" — the price you paid (a purchase-price noun, not a trade directive).
    //   "不是投资建议" — "...not investment advice", the required standing sentence; it uses 建议
    //   only to NEGATE giving advice, which is the opposite of recommending one.
    const blob = JSON.stringify(copy).toLowerCase()
      .split("buy price").join("purchase price")
      .split("不是投资建议").join("不是投资N/A");
    for (const term of banned) {
      expect(blob).not.toContain(term.toLowerCase());
    }
  });

  it("11: rounding — segments always sum to exactly 100% (largest-remainder allocation)", () => {
    const odd: RiskInputPosition[] = [
      pos("A1", 1, 33.33), pos("A2", 1, 33.33), pos("A3", 1, 33.34),
    ];
    const artifacts: Record<string, ArtifactState> = {
      A1: read({ sector: "Energy" }, "A1"),
      A2: read({ sector: "Materials" }, "A2"),
      A3: read({ sector: "Utilities" }, "A3"),
    };
    const risk = computePortfolioRisk(odd, artifacts);
    const total = risk.sectors.reduce((a, s) => a + s.weightPct, 0) + risk.sectorUncoveredPct;
    expect(total).toBeCloseTo(100, 5);
  });

  it("computable with zero artifacts read (artifact-independence of concentration)", () => {
    const risk = computePortfolioRisk(FIXTURE, {});
    expect(risk.concentration).not.toBeNull();
  });
});
