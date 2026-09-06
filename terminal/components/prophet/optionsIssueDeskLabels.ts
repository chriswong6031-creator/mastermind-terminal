import type { IssueLifecycleState } from "./optionsIssueDeskTypes";

type Pair = readonly [en: string, zh: string];

const NOT_CLASSIFIED: Pair = ["Not classified", "未分类"];

export const APPROVE_REASONS = ["PORTFOLIO_FIT", "REGIME_ALIGNED", "EXECUTION_VERIFIED", "DIVERSIFICATION_FIT"] as const;
export const REJECT_REASONS = ["ABSTAIN", "REGIME_MISMATCH", "CORRELATION_CAP", "COOLDOWN", "EVENT_RISK", "EXECUTION_MISSING", "LIQUIDITY", "NO_EDGE"] as const;

export type ApproveReason = typeof APPROVE_REASONS[number];
export type RejectReason = typeof REJECT_REASONS[number];

export const LIFECYCLE_LABELS: { [K in IssueLifecycleState]: Pair } = {
  ISSUED: ["Issued", "已发布"],
  PARTIAL_ALLOWED: ["Partial position allowed", "允许部分建仓"],
  ARMED: ["Waiting for the trigger", "等待触发"],
  TRIGGERED: ["Triggered", "已触发"],
  MANAGED: ["Being managed", "管理中"],
  CLOSED: ["Closed", "已结束"],
  CANCELLED: ["Cancelled", "已取消"],
  INVALIDATED: ["Plan no longer valid", "计划已失效"],
};

export const EVENT_STATE_LABELS: { [K in IssueLifecycleState]: Pair } = {
  ISSUED: ["Issued", "已发布"],
  PARTIAL_ALLOWED: ["Partial position allowed", "允许部分建仓"],
  ARMED: ["Waiting for the trigger", "等待触发"],
  TRIGGERED: ["Triggered", "已触发"],
  MANAGED: ["Being managed", "管理中"],
  CLOSED: ["Closed", "已结束"],
  CANCELLED: ["Cancelled", "已取消"],
  INVALIDATED: ["Plan no longer valid", "计划已失效"],
};

export const APPROVE_REASON_LABELS: { [K in ApproveReason]: Pair } = {
  PORTFOLIO_FIT: ["Fits the portfolio", "符合组合要求"],
  REGIME_ALIGNED: ["Fits current market conditions", "符合当前市场环境"],
  EXECUTION_VERIFIED: ["Execution details verified", "执行细节已核实"],
  DIVERSIFICATION_FIT: ["Adds diversification", "有助于分散"],
};

export const REJECT_REASON_LABELS: { [K in RejectReason]: Pair } = {
  ABSTAIN: ["Choosing not to issue", "选择不发布"],
  REGIME_MISMATCH: ["Market conditions do not fit", "市场环境不匹配"],
  CORRELATION_CAP: ["Too similar to existing names", "与已有标的过于相似"],
  COOLDOWN: ["Still in a cooldown period", "仍在冷却期内"],
  EVENT_RISK: ["Event risk is too high", "事件风险过高"],
  EXECUTION_MISSING: ["Execution details are missing", "缺少执行细节"],
  LIQUIDITY: ["Liquidity is too thin", "流动性不足"],
  NO_EDGE: ["No clear advantage", "没有明显优势"],
};

const QUOTE_SOURCE_LABELS: Record<string, Pair> = {
  operator_attested_nbbo: ["Operator-attested best available quote", "操作员确认的最优买卖报价"],
};

function pickLabel(map: Record<string, Pair>, code: string, zh: boolean): string {
  const pair = map[code];
  if (!pair?.[0] || !pair[1]) return zh ? NOT_CLASSIFIED[1] : NOT_CLASSIFIED[0];
  return zh ? pair[1] : pair[0];
}

export function lifecycleLabel(code: string, zh: boolean): string {
  return pickLabel(LIFECYCLE_LABELS, code, zh);
}

export function eventStateLabel(code: string, zh: boolean): string {
  return pickLabel(EVENT_STATE_LABELS, code, zh);
}

export function approveReasonLabel(code: string, zh: boolean): string {
  return pickLabel(APPROVE_REASON_LABELS, code, zh);
}

export function rejectReasonLabel(code: string, zh: boolean): string {
  return pickLabel(REJECT_REASON_LABELS, code, zh);
}

export function reasonLabel(code: string, zh: boolean): string {
  return pickLabel({ ...APPROVE_REASON_LABELS, ...REJECT_REASON_LABELS }, code, zh);
}

export function quoteSourceLabel(code: string, zh: boolean): string {
  return pickLabel(QUOTE_SOURCE_LABELS, code, zh);
}

export function confirmActionLabel(kind: "approve" | "reject", symbol: string, zh: boolean): string {
  if (kind === "approve") return zh ? `为 ${symbol} 发布研究计划` : `Issue a research plan for ${symbol}`;
  return zh ? `拒绝 ${symbol} 提案` : `Reject the ${symbol} proposal`;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null;
}

function presentText(v: unknown): string | null {
  if (typeof v === "string") {
    const text = v.trim();
    return text && text !== "undefined" && text !== "null" ? text : null;
  }
  return typeof v === "number" && Number.isFinite(v) ? String(v) : null;
}

export type ReceiptDisplayField = {
  key: "contract" | "venue" | "quote_source" | "timestamp";
  label: string;
  value: string;
  kind: "text" | "time";
};

export function visibleReceiptFields(receipt: unknown, zh: boolean): ReceiptDisplayField[] {
  const root = asRecord(receipt);
  const option = asRecord(root?.option) ?? {};
  const fields: ReceiptDisplayField[] = [];
  const contract = presentText(option.occ_symbol);
  if (contract) fields.push({ key: "contract", label: zh ? "合约" : "Contract", value: contract, kind: "text" });
  const venue = presentText(option.venue) ?? presentText(root?.venue);
  if (venue) fields.push({ key: "venue", label: zh ? "交易场所" : "Venue", value: venue, kind: "text" });
  const quoteSource = presentText(option.quote_source);
  if (quoteSource) fields.push({ key: "quote_source", label: zh ? "报价来源" : "Quote source", value: quoteSourceLabel(quoteSource, zh), kind: "text" });
  const timestamp = presentText(option.quote_at);
  if (timestamp) fields.push({ key: "timestamp", label: zh ? "报价时间" : "Quote time", value: timestamp, kind: "time" });
  return fields;
}
