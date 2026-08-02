import { describe, expect, it } from "vitest";
import { normalizeAnalysisSymbol } from "@/lib/analysisSymbol";

describe("analysis symbol grammar", () => {
  it("keeps conventional dotted, dashed, and index identifiers", () => {
    expect(normalizeAnalysisSymbol("brk.b")).toBe("BRK.B");
    expect(normalizeAnalysisSymbol("rds-a")).toBe("RDS-A");
    expect(normalizeAnalysisSymbol("^ndx")).toBe("^NDX");
  });

  it("does not treat malformed input as a company identifier", () => {
    for (const invalid of ["../NVDA", "NVDA/../../AAPL", "BRK..B", "^", "A B", "A?x=1", "A#note", "A\\B"]) {
      expect(normalizeAnalysisSymbol(invalid)).toBeNull();
    }
  });
});
