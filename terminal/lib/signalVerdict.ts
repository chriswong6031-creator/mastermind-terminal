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

// Research Desk verdict = the macro research-desk directional lean.
// Reads intel.tape.ai_lean.dir (BULL | BEAR | NEUTRAL) — the LIVE `cards`/`tape` schema.
// (The old intel.analysis.decision schema is deprecated and no longer populated.)
export function deskVerdict(intel: any, zh = false): Verdict {
  const dir = String(intel?.tape?.ai_lean?.dir || "").toUpperCase();
  const color = dir === "BULL" ? "var(--buy)" : dir === "BEAR" ? "var(--sell)" : "var(--signal)";
  const label =
    dir === "BULL" ? (zh ? "看多" : "Bullish")
      : dir === "BEAR" ? (zh ? "看空" : "Bearish")
        : (zh ? "中性" : "Neutral");
  return { label, color, raw: dir || null };
}
