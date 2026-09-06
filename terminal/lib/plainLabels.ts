/** Bilingual display labels for values that used to leak raw keys onto the screen. */

export type PlainLang = "en" | "zh";

export function notClassified(lang: PlainLang): string {
  return lang === "zh" ? "未分类" : "Not classified";
}

export function regimeLabel(
  t: (key: any) => string,
  value: string | null | undefined,
  lang: PlainLang,
): string {
  if (value == null || value === "") return notClassified(lang);
  return t(`regime${value}`) || notClassified(lang);
}

export const TRUST_TIER_LABEL = {
  "event-edge": ["Event edge", "事件驱动"],
  technical: ["Technical", "技术面"],
  context: ["Context", "背景"],
  reversal: ["Reversal", "反转"],
  screen: ["Screen", "筛选"],
  validated: ["Reviewed", "已复核"],
} as const;

export type TrustTier = keyof typeof TRUST_TIER_LABEL;

export function trustTierLabel(value: string | null | undefined, lang: PlainLang): string {
  if (value == null || value === "") return notClassified(lang);
  const pair = TRUST_TIER_LABEL[value as TrustTier];
  if (!pair) return notClassified(lang);
  return lang === "zh" ? pair[1] : pair[0];
}

export const MACRO_DURATION_ZH: Record<string, string> = {
  "Long-duration": "长久期",
  "Short-duration": "短久期",
  "Duration-neutral": "久期中性",
};

export const MACRO_REGIME_ZH: Record<string, string> = {
  "rate headwind": "利率逆风",
  "rate tailwind": "利率顺风",
  "rate-neutral": "利率中性",
};

export const MACRO_INFLATION_ZH: Record<string, string> = {
  "Inflation hedge": "通胀对冲",
  "Negative inflation beta": "通胀负相关",
  "Inflation-neutral": "通胀中性",
};

export function macroChipLabel(
  en: string,
  zhMap: Record<string, string>,
  lang: PlainLang,
): string {
  if (lang === "zh") return zhMap[en] || en;
  return en;
}

export const PLAN_TIER_LABEL = {
  free: ["Free", "免费版"],
  essential: ["Essential", "Essential"],
  pro: ["Pro", "Pro"],
} as const;

export type PlanTier = keyof typeof PLAN_TIER_LABEL;

export function planTierLabel(value: string, lang: PlainLang): string {
  const pair = PLAN_TIER_LABEL[value as PlanTier];
  if (!pair) return notClassified(lang);
  return lang === "zh" ? pair[1] : pair[0];
}

export const CLASSIC_INDICATOR_CATEGORIES = [
  "Mastermind",
  "Trend",
  "Momentum",
  "Price Action",
  "Volume",
  "daytrade",
] as const;

export type ClassicIndicatorCategory = (typeof CLASSIC_INDICATOR_CATEGORIES)[number];

export const CLASSIC_CATEGORY_TKEY: Record<ClassicIndicatorCategory, string> = {
  Mastermind: "catMastermind",
  Trend: "catTrend",
  Momentum: "catMomentum",
  "Price Action": "catPriceAction",
  Volume: "catVolume",
  daytrade: "catDaytrade",
};

export function classicCategoryLabel(
  category: string,
  t: (key: string, fallback?: string) => string,
  lang: PlainLang,
): string {
  const tkey = (CLASSIC_CATEGORY_TKEY as Record<string, string>)[category];
  if (!tkey) return notClassified(lang);
  return t(tkey, "") || notClassified(lang);
}

export function mappedOrNeutral(mapped: string | undefined, lang: PlainLang): string {
  return mapped || notClassified(lang);
}
