import { describe, expect, it } from "vitest";
import { ISSUE_LIFECYCLE } from "@/components/prophet/optionsIssueDeskTypes";
import {
  APPROVE_REASONS,
  REJECT_REASONS,
  approveReasonLabel,
  confirmActionLabel,
  eventStateLabel,
  lifecycleLabel,
  reasonLabel,
  rejectReasonLabel,
  visibleReceiptFields,
} from "@/components/prophet/optionsIssueDeskLabels";

const UNKNOWN = "NOT_A_REAL_CODE";

function assertPlainPair(en: string, zh: string, raw: string) {
  expect(en.length).toBeGreaterThan(0);
  expect(zh.length).toBeGreaterThan(0);
  expect(en).not.toBe(raw);
  expect(zh).not.toBe(raw);
  expect(en).not.toContain("_");
  expect(zh).not.toContain("_");
  expect(en).not.toContain(raw);
  expect(zh).not.toContain(raw);
  expect(en.toLowerCase()).not.toContain("falsifier");
  expect(en.toLowerCase()).not.toContain("refuted");
  expect(zh).not.toContain("证伪");
}

describe("options issue desk labels", () => {
  it("gives every ISSUE_LIFECYCLE member a non-empty EN and ZH label", () => {
    for (const state of ISSUE_LIFECYCLE) {
      assertPlainPair(lifecycleLabel(state, false), lifecycleLabel(state, true), state);
      assertPlainPair(eventStateLabel(state, false), eventStateLabel(state, true), state);
    }
  });

  it("gives every APPROVE_REASONS member a non-empty EN and ZH label", () => {
    expect(APPROVE_REASONS).toEqual(["PORTFOLIO_FIT", "REGIME_ALIGNED", "EXECUTION_VERIFIED", "DIVERSIFICATION_FIT"]);
    for (const reason of APPROVE_REASONS) {
      assertPlainPair(approveReasonLabel(reason, false), approveReasonLabel(reason, true), reason);
      assertPlainPair(reasonLabel(reason, false), reasonLabel(reason, true), reason);
    }
  });

  it("gives every REJECT_REASONS member a non-empty EN and ZH label", () => {
    expect(REJECT_REASONS).toEqual(["ABSTAIN", "REGIME_MISMATCH", "CORRELATION_CAP", "COOLDOWN", "EVENT_RISK", "EXECUTION_MISSING", "LIQUIDITY", "NO_EDGE"]);
    for (const reason of REJECT_REASONS) {
      assertPlainPair(rejectReasonLabel(reason, false), rejectReasonLabel(reason, true), reason);
      assertPlainPair(reasonLabel(reason, false), reasonLabel(reason, true), reason);
    }
  });

  it("uses the prescribed plain-language wording for the named codes", () => {
    expect(lifecycleLabel("PARTIAL_ALLOWED", false)).toBe("Partial position allowed");
    expect(lifecycleLabel("PARTIAL_ALLOWED", true)).toBe("允许部分建仓");
    expect(reasonLabel("REGIME_MISMATCH", false)).toBe("Market conditions do not fit");
    expect(reasonLabel("REGIME_MISMATCH", true)).toBe("市场环境不匹配");
    expect(reasonLabel("NO_EDGE", false)).toBe("No clear advantage");
    expect(reasonLabel("NO_EDGE", true)).toBe("没有明显优势");
  });

  it("yields the neutral label for an unknown code and never echoes the raw code or an underscore", () => {
    const lookups = [lifecycleLabel, eventStateLabel, reasonLabel, approveReasonLabel, rejectReasonLabel];
    for (const lookup of lookups) {
      const en = lookup(UNKNOWN, false);
      const zh = lookup(UNKNOWN, true);
      expect(en).toBe("Not classified");
      expect(zh).toBe("未分类");
      expect(en).not.toContain("_");
      expect(zh).not.toContain("_");
      expect(en).not.toContain(UNKNOWN);
      expect(zh).not.toContain(UNKNOWN);
    }
  });

  it("names the confirm action in plain words and never mentions the proposal id", () => {
    expect(confirmActionLabel("approve", "LMT", false)).toBe("Issue a research plan for LMT");
    expect(confirmActionLabel("approve", "LMT", true)).toBe("为 LMT 发布研究计划");
    expect(confirmActionLabel("reject", "LMT", false)).toBe("Reject the LMT proposal");
    expect(confirmActionLabel("reject", "LMT", true)).toBe("拒绝 LMT 提案");
    expect(confirmActionLabel("approve", "LMT", false)).not.toContain("oidp_");
    expect(confirmActionLabel("reject", "LMT", false)).not.toMatch(/proposal_id/i);
  });

  it("surfaces labelled receipt fields when present and omits absent ones", () => {
    const fields = visibleReceiptFields({
      option: {
        occ_symbol: "LMT260918C00600000",
        quote_source: "operator_attested_nbbo",
        quote_at: "2026-08-08T21:16:00Z",
      },
    }, false);
    expect(fields.map((field) => field.key)).toEqual(["contract", "quote_source", "timestamp"]);
    expect(fields.find((field) => field.key === "contract")?.value).toBe("LMT260918C00600000");
    expect(fields.find((field) => field.key === "quote_source")?.label).toBe("Quote source");
    expect(fields.find((field) => field.key === "quote_source")?.value).not.toContain("_");
    expect(fields.find((field) => field.key === "quote_source")?.value).not.toBe("operator_attested_nbbo");
    expect(fields.find((field) => field.key === "timestamp")?.value).toBe("2026-08-08T21:16:00Z");
    expect(fields.some((field) => field.key === "venue")).toBe(false);
    expect(JSON.stringify(fields)).not.toContain("undefined");
    expect(JSON.stringify(fields)).not.toContain("null");

    const zh = visibleReceiptFields({
      option: { occ_symbol: "LMT260918C00600000", quote_source: "operator_attested_nbbo", quote_at: "2026-08-08T21:16:00Z" },
    }, true);
    expect(zh.find((field) => field.key === "contract")?.label).toBe("合约");
    expect(zh.find((field) => field.key === "quote_source")?.label).toBe("报价来源");
    expect(zh.find((field) => field.key === "timestamp")?.label).toBe("报价时间");

    expect(visibleReceiptFields({ option: { occ_symbol: "LMT260918C00600000" } }, false).map((field) => field.key)).toEqual(["contract"]);
    expect(visibleReceiptFields({}, false)).toEqual([]);
    expect(visibleReceiptFields(null, false)).toEqual([]);
    expect(visibleReceiptFields({ option: { occ_symbol: null, quote_source: undefined, venue: null } }, false)).toEqual([]);
  });
});
