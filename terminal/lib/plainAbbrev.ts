/**
 * Glance-tier expansions for abbreviations that used to ship as machine text
 * ("Nd", "vol>OI"). Numbers stay identical; only the unit words change.
 */

export function daysToExpiry(n: number, lang: "en" | "zh"): string {
  return lang === "zh" ? `${n} 天到期` : `${n} days to expiry`;
}

/** Short unabbreviated count for compact table cells ("3d" → "3 days" / "3 天"). */
export function daysHeld(n: number, lang: "en" | "zh"): string {
  return lang === "zh" ? `${n} 天` : `${n} days`;
}

export function volAboveOi(lang: "en" | "zh"): string {
  return lang === "zh" ? "成交量高于未平仓量" : "volume above open interest";
}
