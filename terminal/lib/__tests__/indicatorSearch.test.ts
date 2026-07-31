import { describe, expect, it } from "vitest";
import {
  normalizeIndicatorSearch,
  rankIndicatorSearch,
  type IndicatorSearchDocument,
} from "@/lib/indicatorSearch";

type Value = { kind: string };

const doc = (
  id: string,
  primary: string,
  order: number,
  options: {
    aliases?: readonly string[];
    metadata?: readonly string[];
    kind?: string;
  } = {},
): IndicatorSearchDocument<Value> => ({
  id,
  primary,
  aliases: options.aliases,
  metadata: options.metadata,
  order,
  value: { kind: options.kind ?? id },
});

const ids = (documents: readonly IndicatorSearchDocument<Value>[], query: string): string[] =>
  rankIndicatorSearch(documents, query).map(({ document }) => document.id);

describe("normalizeIndicatorSearch", () => {
  it("folds case and whitespace", () => {
    expect(normalizeIndicatorSearch(" \n  MaCd\t RSI   ")).toBe("macd rsi");
  });

  it("makes punctuation, hyphens, and slashes equivalent to spaces", () => {
    expect(normalizeIndicatorSearch("MACD-RSI")).toBe("macd rsi");
    expect(normalizeIndicatorSearch("MACD / RSI")).toBe("macd rsi");
    expect(normalizeIndicatorSearch("MACD_RSI")).toBe("macd rsi");
  });

  it("normalizes Unicode compatibility forms and strips diacritics", () => {
    expect(normalizeIndicatorSearch("  Crème／Brûlée  ")).toBe("creme brulee");
  });

  it("retains Chinese search terms", () => {
    expect(normalizeIndicatorSearch("价格／止盈")).toBe("价格 止盈");
  });
});

describe("rankIndicatorSearch", () => {
  it("matches case-insensitively across punctuation-normalized primary labels", () => {
    const documents = [doc("macd-rsi", "MACD-RSI Confluence", 0)];
    expect(ids(documents, "  macd / RSI ")).toEqual(["macd-rsi"]);
  });

  it("finds the common module aliases users actually type", () => {
    const documents = [
      doc("structure", "Structure Toolkit", 0, {
        aliases: ["TP1", "iFVG", "order block", "golden pocket", "CVD", "止盈"],
      }),
    ];

    for (const query of ["tp1", "IFVG", "order block", "golden-pocket", "cvd", "止盈"]) {
      expect(ids(documents, query), query).toEqual(["structure"]);
    }
  });

  it("matches normalized diacritics in either the query or document", () => {
    const documents = [doc("deviation", "Déviation Follow-Through", 0)];
    expect(ids(documents, "deviation")).toEqual(["deviation"]);
    expect(ids([doc("creme", "Creme Signal", 0)], "crème")).toEqual(["creme"]);
  });

  it("is independent of query-token order", () => {
    const documents = [
      doc("rsi-div", "RSI Divergence", 1),
      doc("rsi", "RSI Ultimate", 0),
    ];
    const forward = rankIndicatorSearch(documents, "rsi div");
    const reverse = rankIndicatorSearch(documents, "div rsi");

    expect(forward.map(({ document }) => document.id)).toEqual(["rsi-div"]);
    expect(reverse.map(({ document }) => document.id)).toEqual(["rsi-div"]);
    expect(reverse.map(({ score }) => score)).toEqual(forward.map(({ score }) => score));
  });

  it("ranks exact, primary-prefix, alias, and metadata matches by signal quality", () => {
    const documents = [
      doc("metadata", "Flow Notes", 0, { metadata: ["delta"] }),
      doc("alias-prefix", "Volume Engine", 1, { aliases: ["DeltaWave"] }),
      doc("primary-prefix", "DeltaWave", 2),
      doc("alias-exact", "Volume Delta Toolkit", 3, { aliases: ["delta"] }),
      doc("primary-exact", "Delta", 4),
    ];

    expect(ids(documents, "delta")).toEqual([
      "primary-exact",
      "alias-exact",
      "primary-prefix",
      "alias-prefix",
      "metadata",
    ]);
  });

  it("uses AND semantics for every distinct query token", () => {
    const documents = [
      doc("confirmed", "RSI Divergence", 0, { metadata: ["volume confirmed"] }),
      doc("plain-rsi", "RSI Ultimate", 1),
      doc("plain-volume", "Volume Profile", 2),
    ];

    expect(ids(documents, "rsi volume")).toEqual(["confirmed"]);
    expect(ids(documents, "rsi pocket")).toEqual([]);
  });

  it("accepts one-edit typos only for long Latin tokens and keeps them low-ranked", () => {
    const documents = [
      doc("fuzzy-primary", "Divergence Engine", 0),
      doc("literal-metadata", "Signal Notes", 1, { metadata: ["divergnce"] }),
      doc("short", "Trend", 2),
    ];
    const results = rankIndicatorSearch(documents, "divergnce");

    expect(results.map(({ document }) => document.id)).toEqual([
      "literal-metadata",
      "fuzzy-primary",
    ]);
    expect(results[0].score).toBeGreaterThan(results[1].score);
    expect(ids(documents, "trnd")).toEqual([]);
  });

  it("never applies typo tolerance to CJK tokens", () => {
    const documents = [doc("targets", "止盈目标区域", 0)];
    expect(ids(documents, "止盈指标区域")).toEqual([]);
    expect(ids(documents, "止盈目标区域")).toEqual(["targets"]);
  });

  it("uses original order as the stable tie-breaker", () => {
    const documents = [
      doc("third", "Flow Signal", 30),
      doc("first", "Flow Signal", 10),
      doc("second", "Flow Signal", 20),
    ];

    expect(ids(documents, "flow")).toEqual(["first", "second", "third"]);
    expect(ids(documents, "flow")).toEqual(["first", "second", "third"]);
  });

  it("returns each stable id once, keeping its best candidate and earliest exact tie", () => {
    const documents = [
      doc("duplicate", "Delta Notes", 0, { kind: "weaker" }),
      doc("duplicate", "Delta", 5, { kind: "best" }),
      doc("tie", "Delta", 6, { kind: "first" }),
      doc("tie", "Delta", 6, { kind: "second" }),
    ];
    const results = rankIndicatorSearch(documents, "delta");

    expect(results.map(({ document }) => document.id)).toEqual(["duplicate", "tie"]);
    expect(
      results.find(({ document }) => document.id === "duplicate")?.document.value.kind,
    ).toBe("best");
    expect(
      results.find(({ document }) => document.id === "tie")?.document.value.kind,
    ).toBe("first");
    expect(new Set(results.map(({ document }) => document.id)).size).toBe(results.length);
  });

  it("returns no results for an empty normalized query", () => {
    expect(rankIndicatorSearch([doc("rsi", "RSI", 0)], " \n / - ")).toEqual([]);
  });
});
