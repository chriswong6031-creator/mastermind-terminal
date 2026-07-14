export interface Verdict {
  label: string;
  color: string;
  raw: string | null;
  /** small sub-line under the verdict: signal date + age (oracle) / data as-of date (desk) */
  sub?: string | null;
  /** true = too old (or undated) to render as a live opinion — the UI strips its visual authority */
  dim?: boolean;
  /** extra tooltip context: horizon label, signal price, lane disagreements */
  note?: string | null;
}

// A verdict older than this many calendar days (≈5 of the engine's 3-day bars) is history,
// not an opinion — it renders dimmed with its date instead of at full color strength.
export const ORACLE_STALE_DAYS = 21;

const DAY_MS = 86_400_000;

function ageDays(ts: string | null | undefined, now: number): number | null {
  if (!ts) return null;
  const t = Date.parse(ts);
  return Number.isFinite(t) ? Math.max(0, Math.floor((now - t) / DAY_MS)) : null;
}

function fmtDate(ts: string, zh: boolean): string {
  const t = Date.parse(ts);
  if (!Number.isFinite(t)) return ts;
  return new Date(t).toLocaleDateString(zh ? "zh-CN" : "en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** the per-ticker slice.json — only the fields the verdict reads */
interface OracleSlice {
  indicator?: {
    state?: { last_signal?: string | null } | null;
    signals?: Array<{ ts: string; type?: string; price?: number | null }> | null;
  } | null;
}

// Golden Oracle verdict for the rail card. Sources, in trust order:
//   1. slice.indicator — state.last_signal plus the dated signals[] marker: the engine's own
//      current stream, self-consistent with the chart markers;
//   2. manifest row.verdict (BUY/REBUY/ADD/SELL/CUT/TRIM) — undated, and the universe lane can
//      inherit it from an older run, so without a slice it renders dimmed as "undated".
// Either way this is a swing-timing overlay read (3D bars), never an investment view — the
// horizon rides along in `note` so the button tooltip says so.
export function oracleVerdict(v?: string | null, slice?: OracleSlice | null, zh = false, now: number = Date.now()): Verdict {
  const st = slice?.indicator?.state;
  const sigs = slice?.indicator?.signals;
  const last = Array.isArray(sigs) && sigs.length ? sigs[sigs.length - 1] : null;
  const raw0 = (st?.last_signal ?? v ?? null) as string | null;
  if (!raw0) return { label: "—", color: "var(--muted)", raw: null, sub: null, dim: false, note: null };
  const u = String(raw0).toUpperCase();
  const color = ["BUY", "REBUY", "ADD"].includes(u)
    ? "var(--buy)"
    : ["SELL", "CUT", "TRIM"].includes(u)
      ? "var(--sell)"
      : "var(--signal)";
  const age = st?.last_signal && last ? ageDays(last.ts, now) : null;
  const sub =
    age != null && last
      ? `${fmtDate(last.ts, zh)} · ${zh ? `${age}天前` : `${age}d ago`}`
      : zh ? "无日期" : "undated";
  const notes: string[] = [zh ? "3日K线摆动择时信号 — 非投资观点" : "swing-timing overlay on 3D bars — not an investment view"];
  if (age != null && last?.price != null) notes.push(`@ ${last.price}`);
  const mv = v ? String(v).toUpperCase() : null;
  if (mv && st?.last_signal && mv !== String(st.last_signal).toUpperCase())
    notes.push(zh ? `数据通道不一致（清单通道：${mv}）` : `data lanes disagree (screener lane: ${mv})`);
  return {
    label: u.charAt(0) + u.slice(1).toLowerCase(),
    color,
    raw: u,
    sub,
    dim: age == null || age > ORACLE_STALE_DAYS,
    note: notes.join(" · "),
  };
}

// Research Desk lean = intel.tape.ai_lean — the LIVE `cards`/`tape` schema.
// (The old intel.analysis.decision schema is deprecated and no longer populated.)
// ai_lean.dir is a deterministic band×entry mapping built upstream (pull_macro_intel.py), so the
// honest rendering re-derives intent from the fields shipped beside it:
//   - a BEAR whose only cause is band="low" (weak buy-readiness, e.g. entry="bounce_wait" =
//     "don't chase an unconfirmed bounce") is an entry-timing read, NOT a short call → "No setup";
//   - dir=BEAR keeps its red "Bearish" only for genuinely bearish entry states (exit/topping)
//     or legacy files that don't ship band/entry.
const EXIT_ENTRIES = new Set(["exit", "topping"]);

export function deskVerdict(intel: any, zh = false, now: number = Date.now()): Verdict {
  const lean = intel?.tape?.ai_lean;
  const dir = String(lean?.dir || "").toUpperCase();
  const band = String(lean?.band || "").toLowerCase();
  const entry = String(lean?.entry || "").toLowerCase();
  const asof = (intel?.tape?.asof ?? null) as string | null;
  const age = ageDays(asof, now);
  const sub = asof
    ? `${zh ? "数据截至" : "as of"} ${fmtDate(asof, zh)}${age != null ? ` · ${age}${zh ? "天" : "d"}` : ""}`
    : null;
  const score = typeof lean?.score === "number" ? lean.score : null;
  const notes: string[] = [];
  if (score != null) notes.push(zh ? `信心 ${score}/100` : `conviction ${score}/100`);

  if (dir === "BEAR" && band === "low" && !!entry && !EXIT_ENTRIES.has(entry)) {
    notes.unshift(zh ? "低买点评分（band=low）— 非做空观点" : "weak buy-readiness read (band=low) — not a short call");
    return { label: zh ? "无买点" : "No setup", color: "var(--muted)", raw: "NO_SETUP", sub, dim: false, note: notes.join(" · ") };
  }

  const aj = intel?.cards?.ai_judgment;
  if (dir === "BEAR" && aj?.verdict && /constructive|bullish|accumulate|leader/i.test(String(aj.verdict)))
    notes.push(zh ? "来源分歧：AI判断偏建设性" : `sources disagree: AI judgment reads "${aj.verdict}"`);

  const color = dir === "BULL" ? "var(--buy)" : dir === "BEAR" ? "var(--sell)" : "var(--signal)";
  const label =
    dir === "BULL" ? (zh ? "看多" : "Bullish")
      : dir === "BEAR" ? (zh ? "看空" : "Bearish")
        : (zh ? "中性" : "Neutral");
  return { label, color, raw: dir || null, sub, dim: false, note: notes.length ? notes.join(" · ") : null };
}
