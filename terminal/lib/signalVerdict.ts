export interface Verdict {
  label: string;
  color: string;
  raw: string | null;
}

// Golden Oracle verdict from manifest row.verdict (BUY/REBUY/ADD/SELL/CUT/TRIM/null)
export function oracleVerdict(v?: string | null): Verdict {
  if (!v) return { label: "—", color: "var(--muted)", raw: null };
  const u = v.toUpperCase();
  const color = ["BUY", "REBUY", "ADD"].includes(u)
    ? "var(--buy)"
    : ["SELL", "CUT", "TRIM"].includes(u)
      ? "var(--sell)"
      : "var(--signal)";
  return { label: u.charAt(0) + u.slice(1).toLowerCase(), color, raw: u };
}

// Research Desk verdict from intel.analysis.decision {verb, verb_zh, tone}. tone: "go"|"stop"|other
export function deskVerdict(
  decision?: { verb?: string | null; verb_zh?: string | null; tone?: string | null } | null,
  zh = false
): Verdict {
  const tone = (decision?.tone || "").toLowerCase();
  const color =
    tone === "go"
      ? "var(--buy)"
      : tone === "stop"
        ? "var(--sell)"
        : "var(--signal)";
  const verb = (zh ? decision?.verb_zh || decision?.verb : decision?.verb) || "";
  const label = verb
    ? verb.charAt(0).toUpperCase() + verb.slice(1)
    : tone === "go"
      ? zh
        ? "看多"
        : "Bullish"
      : tone === "stop"
        ? zh
          ? "看空"
          : "Bearish"
        : zh
          ? "中性"
          : "Neutral";
  return { label, color, raw: tone || null };
}
