/**
 * User-visible EN/ZH labels for Company Intelligence surfaces.
 * Unknown values render the neutral pair — never a raw slug or key.
 */

export type BilingualLabel = { en: string; zh: string };

export const NOT_CLASSIFIED: BilingualLabel = { en: "Not classified", zh: "未分类" };

export const EVENT_WORKSPACE_ATTRIBUTION: BilingualLabel = {
  en: "From the company event workspace",
  zh: "来自公司事件工作区",
};

export const TECHNICAL_DETAILS_SUMMARY: BilingualLabel = {
  en: "Show technical details",
  zh: "显示技术细节",
};

export const MANAGER_STYLE_KEYS = [
  "hedge_fund",
  "long_only",
  "quant",
  "activist",
  "index",
  "pension",
  "sovereign",
  "family_office",
  "bank",
  "insurance",
  "other",
  "quality_growth",
  "value",
  "compounder",
] as const;

export type ManagerStyle = (typeof MANAGER_STYLE_KEYS)[number];

export const MANAGER_STYLE_LABELS: Record<ManagerStyle, BilingualLabel> = {
  hedge_fund: { en: "Hedge fund", zh: "对冲基金" },
  long_only: { en: "Long-only", zh: "仅做多" },
  quant: { en: "Quantitative", zh: "量化" },
  activist: { en: "Activist", zh: "积极股东" },
  index: { en: "Index", zh: "指数" },
  pension: { en: "Pension", zh: "养老金" },
  sovereign: { en: "Sovereign wealth", zh: "主权财富" },
  family_office: { en: "Family office", zh: "家族办公室" },
  bank: { en: "Bank", zh: "银行" },
  insurance: { en: "Insurance", zh: "保险" },
  other: { en: "Other", zh: "其他" },
  quality_growth: { en: "Quality growth", zh: "质量成长" },
  value: { en: "Value", zh: "价值" },
  compounder: { en: "Compounder", zh: "复利成长" },
};

export const TYPED_ABSENCE_REASON_KEYS = [
  "no_source_document",
  "no_transcript",
  "no_primary_release",
  "no_span_addressable_evidence",
  "document_bytes_not_held",
  "scanned_image_no_text_layer",
  "unjoinable_filing_identity",
  "speaker_unresolvable",
  "slide_family_discontinued",
  "superseded_by_duplicate",
  "missing_basis",
  "missing_units",
  "missing_period",
  "missing_source",
] as const;

export type TypedAbsenceReason = (typeof TYPED_ABSENCE_REASON_KEYS)[number];

export const TYPED_ABSENCE_REASON_LABELS: Record<TypedAbsenceReason, BilingualLabel> = {
  no_source_document: { en: "No source document is available.", zh: "没有可用的来源文档。" },
  no_transcript: { en: "No transcript is available.", zh: "没有可用的电话会记录。" },
  no_primary_release: { en: "No primary release is available.", zh: "没有可用的主要发布。" },
  no_span_addressable_evidence: { en: "No line-level evidence can be addressed.", zh: "无法定位到逐行证据。" },
  document_bytes_not_held: { en: "The document bytes are not held.", zh: "未持有该文档的字节。" },
  scanned_image_no_text_layer: { en: "The scan has no text layer.", zh: "扫描件没有文本层。" },
  unjoinable_filing_identity: { en: "The filing identity cannot be joined.", zh: "无法关联该申报身份。" },
  speaker_unresolvable: { en: "The speaker cannot be resolved.", zh: "无法解析发言人。" },
  slide_family_discontinued: { en: "This slide family was discontinued.", zh: "该幻灯片系列已停用。" },
  superseded_by_duplicate: { en: "This record was superseded by a duplicate.", zh: "该记录已被重复项取代。" },
  missing_basis: { en: "The measurement basis is missing.", zh: "缺少计量口径。" },
  missing_units: { en: "The units are missing.", zh: "缺少单位。" },
  missing_period: { en: "The period is missing.", zh: "缺少期间。" },
  missing_source: { en: "The source is missing.", zh: "缺少来源。" },
};

/**
 * Topic tags are open-vocabulary free text from upstream
 * (see companyIntelligence.ts). Known fixture values use the bilingual map;
 * any other non-empty value is humanised for display.
 */
export const TOPIC_TAG_KEYS = [
  "demand",
  "data center",
  "data_center",
] as const;

export type TopicTag = (typeof TOPIC_TAG_KEYS)[number];

export const TOPIC_TAG_LABELS: Record<TopicTag, BilingualLabel> = {
  demand: { en: "Demand", zh: "需求" },
  "data center": { en: "Data center", zh: "数据中心" },
  data_center: { en: "Data center", zh: "数据中心" },
};

function pickLabel(zh: boolean, label: BilingualLabel): string {
  return zh ? label.zh : label.en;
}

/** Strict map lookup — unknown or empty → neutral pair. */
function lookup(map: Record<string, BilingualLabel>, raw: string, zh: boolean): string {
  const key = raw.trim().toLowerCase();
  if (!key) return pickLabel(zh, NOT_CLASSIFIED);
  return pickLabel(zh, map[key] ?? NOT_CLASSIFIED);
}

/**
 * Open-vocabulary fallback: trim, turn `_`/`-` into spaces, collapse
 * repeats, capitalise the first letter. Empty → null (caller uses
 * the neutral pair).
 */
function humaniseOpenVocabulary(raw: string): string | null {
  const spaced = raw.trim().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  if (!spaced) return null;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function lookupOrHumanise(map: Record<string, BilingualLabel>, raw: string, zh: boolean): string {
  const key = raw.trim().toLowerCase();
  if (!key) return pickLabel(zh, NOT_CLASSIFIED);
  const mapped = map[key];
  if (mapped) return pickLabel(zh, mapped);
  return humaniseOpenVocabulary(raw) ?? pickLabel(zh, NOT_CLASSIFIED);
}

export function managerStyleLabel(style: string, zh: boolean): string {
  return lookupOrHumanise(MANAGER_STYLE_LABELS, style, zh);
}

export function typedAbsenceReasonLabel(reason: string, zh: boolean): string {
  return lookup(TYPED_ABSENCE_REASON_LABELS, reason, zh);
}

export function topicTagLabel(tag: string, zh: boolean): string {
  return lookupOrHumanise(TOPIC_TAG_LABELS, tag, zh);
}
