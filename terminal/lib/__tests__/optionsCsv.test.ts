import { describe, expect, it } from "vitest";
import {
  OPTIONS_TAPE_CSV_COLUMNS,
  OPTIONS_TAPE_EXPORT_SCHEMA,
  buildOptionsTapeCsv,
  buildOptionsTapeCsvFilename,
  serializeCsv,
  serializeCsvCell,
  type OptionsTapeCsvEvent,
} from "@/lib/optionsCsv";

const baseEvent: OptionsTapeCsvEvent = {
  id: "e001",
  ts: "2026-07-05T15:40:12Z",
  root: "NVDA",
  group: "Technology",
  group_zh: "科技",
  right: "C",
  exp: "2026-07-18",
  strike: 160,
  dte: 13,
  dte_bucket: "8_30d",
  mny_bucket: "atm",
  side: "~buy",
  n_prints: 12,
  size: 2500,
  avg_price: 4.8,
  premium: 1_200_000,
  premium_z: 3.1,
  baseline_source: "z252",
  vol_gt_oi: true,
  repeated: false,
  zerodte: false,
  signing_source: "tape",
};

const metadata = {
  feedSchema: "live_flow.feed/v1",
  sessionDate: "2026-07-05",
  feedAsof: "2026-07-05T15:42:00Z",
  displayStale: true,
} as const;

describe("Options Tape CSV", () => {
  it("uses RFC-4180 quoting, CRLF records, a final CRLF, and a UTF-8 BOM", () => {
    expect(serializeCsv([
      ["plain", "comma,value", 'a "quote"', "line\nbreak"],
      ["next", null, false, 0],
    ])).toBe('\uFEFFplain,"comma,value","a ""quote""","line\nbreak"\r\nnext,,false,0\r\n');
  });

  it("hardens spreadsheet strings without corrupting numeric negatives", () => {
    expect(serializeCsvCell("=SUM(A1:A2)")).toBe("'=SUM(A1:A2)");
    expect(serializeCsvCell("  +cmd")).toBe("'  +cmd");
    expect(serializeCsvCell("\uFEFF@cmd")).toBe("'\uFEFF@cmd");
    expect(serializeCsvCell("\tcmd")).toBe("'\tcmd");
    expect(serializeCsvCell("  \rcommand")).toBe('"\'  \rcommand"');
    expect(serializeCsvCell(-42.5)).toBe("-42.5");
    expect(serializeCsvCell(-0)).toBe("0");
    expect(serializeCsvCell(Number.POSITIVE_INFINITY)).toBe("");
  });

  it("emits a fixed contract with explicit display-only and inferred-direction metadata", () => {
    const csv = buildOptionsTapeCsv([baseEvent, { ...baseEvent, id: "e002", side: "~sell" }], metadata);
    const lines = csv.slice(1).split("\r\n");

    expect(lines[0]).toBe(OPTIONS_TAPE_CSV_COLUMNS.join(","));
    expect(lines[1]).toContain(`${OPTIONS_TAPE_EXPORT_SCHEMA},display_only,tilde_inferred`);
    expect(lines[1]).toContain("live_flow.feed/v1,2026-07-05,2026-07-05T15:42:00Z,true");
    expect(lines[1]).toContain(",~buy,");
    expect(lines[2]).toContain(",~sell,");
    expect(lines[1]).toContain(",true,false,false,,tape");
  });

  it("preserves the caller's full filtered/sorted collection beyond the 150-row DOM window", () => {
    const events = Array.from({ length: 175 }, (_, index): OptionsTapeCsvEvent => ({
      ...baseEvent,
      id: `event-${String(index).padStart(3, "0")}`,
      premium: 1_200_000 - index,
    }));

    const first = buildOptionsTapeCsv(events, metadata);
    const second = buildOptionsTapeCsv(events, metadata);
    const lines = first.slice(1).split("\r\n");

    expect(first).toBe(second);
    expect(lines).toHaveLength(177); // header + 175 rows + final empty segment
    expect(lines[1]).toContain(",event-000,");
    expect(lines[175]).toContain(",event-174,");
    expect(lines[176]).toBe("");
  });

  it("builds deterministic, filesystem-safe filenames from feed metadata only", () => {
    expect(buildOptionsTapeCsvFilename(metadata)).toBe(
      "mastermind-options-tape_2026-07-05_20260705T154200Z.csv",
    );
    expect(buildOptionsTapeCsvFilename({ sessionDate: "../../=session", feedAsof: "@bad/asof" })).toBe(
      "mastermind-options-tape_session_bad-asof.csv",
    );
    expect(buildOptionsTapeCsvFilename({ sessionDate: null, feedAsof: null })).toBe(
      "mastermind-options-tape_unknown-session_unknown-asof.csv",
    );
  });
});
