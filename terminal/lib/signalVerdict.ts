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
  /** primary line is a STANCE (posture read from current regime state), not a signal event.
   *  Stances are descriptive nouns — never a Buy/Sell verb — and render in the stance style
   *  (no tint, hollow star) so they can't be mistaken for an evidence-cleared signal. */
  stance?: boolean;
  /** a real, dated engine event that is NOT in the scored lane (RECLAIM re-entry) — renders
   *  dated and colored but without full signal authority (hollow treatment). */
  soft?: boolean;
}

// A verdict older than this many calendar days (≈5 of the engine's 3-day bars) is history,
// not an opinion — it renders dimmed with its date instead of at full color strength.
export const ORACLE_STALE_DAYS = 21;

/** shared staleness test for manifest rows carrying `vts` (the scored verdict's date) —
 *  screener/search/portfolio pills demote to the .stale treatment past the threshold */
export function verdictIsStale(vts?: string | null, now: number = Date.now()): boolean {
  if (!vts) return false; // undated rows keep today's render; only a KNOWN old date demotes
  const t = Date.parse(vts);
  return Number.isFinite(t) && (now - t) / DAY_MS > ORACLE_STALE_DAYS;
}

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

/** trend state as computed client-side by lib/trend.ts (TrendRow already ships it) */
export type StanceTrend = "UPTREND" | "PULLBACK" | "RANGE" | "DOWNTREND" | null;

/** the per-ticker slice.json — only the fields the verdict reads */
interface OracleSlice {
  indicator?: {
    state?: {
      last_signal?: string | null;
      last_scored_signal?: string | null;
      last_scored_ts?: string | null;
      position_hint?: string | null;
      bars_since_signal?: number | null;
      /** deprecated misnomer: carries strong_bull (weekly+monthly bull & above 200d) */
      extended?: boolean | null;
      strong_bull?: boolean | null;
      /** the true Pine extendedNow (RSI>=70 or %K>=80) — absent on pre-2026-07-15 slices */
      overbought?: boolean | null;
      weeklyBull?: boolean | null;
      above200?: boolean | null;
    } | null;
    signals?: Array<{
      ts: string; type?: string; price?: number | null;
      quality?: string | null; quality_reason?: string | null; scored?: boolean | null;
    }> | null;
  } | null;
}

type OracleState = NonNullable<NonNullable<OracleSlice["indicator"]>["state"]>;
type OracleSignal = NonNullable<NonNullable<OracleSlice["indicator"]>["signals"]>[number];

const BUYISH = ["BUY", "REBUY", "ADD"];
const SELLISH = ["SELL", "CUT", "TRIM"];
// engine-flagged soft qualities: annotate the tooltip; regime_blocked additionally means
// "the engine refused this entry" — it must never anchor the verdict (contracts.py contract).
const SOFT_Q = new Set(["pending", "block", "regime_blocked"]);

function eventColor(u: string): string {
  return BUYISH.includes(u) || u === "RECLAIM"
    ? "var(--buy)"
    : SELLISH.includes(u)
      ? "var(--sell)"
      : "var(--signal)";
}

function eventLabel(u: string, zh: boolean): string {
  if (u === "RECLAIM") return zh ? "重新入场" : "Re-entry";
  return u.charAt(0) + u.slice(1).toLowerCase();
}

// ── the stance ladder — the Pine compTxt analog, from ALREADY-SHIPPED state fields ─────────
// Fires only when the effective event is stale/undated. Priority-ordered, first match wins.
// Direction words ride --up/--down (they flip correctly under zh east mode); caution rungs
// ride the non-flipping --warn/--signal per the severity-color law. No Buy/Sell verb ever.
export function computeStance(st: OracleState, trend: StanceTrend, zh: boolean): { label: string; color: string } | null {
  const pos = st.position_hint === "long" ? "long" : "flat";
  const sb = Boolean(st.strong_bull ?? st.extended);
  const ob = Boolean(st.overbought);
  const wb = Boolean(st.weeklyBull);
  const a2 = Boolean(st.above200);
  if (pos !== "long" && ob && (a2 || wb))
    return { label: zh ? "过热 — 勿追高" : "Extended — don't chase", color: "var(--warn)" };
  if (pos === "long" && ob)
    return { label: zh ? "持有 — 过热勿加仓" : "Hold — extended, don't add", color: "var(--warn)" };
  if (pos === "long" && sb)
    return { label: zh ? "持有 — 偏多" : "Hold — long bias", color: "var(--up)" };
  if (pos === "long")
    return { label: zh ? "持有 — 趋势转弱" : "Hold — trend weakening", color: "var(--signal)" };
  if (sb && (trend === "UPTREND" || trend === "PULLBACK"))
    return { label: zh ? "强势上行 — 等回调买点" : "Strong uptrend — awaiting pullback entry", color: "var(--up)" };
  if ((a2 && wb) || trend === "UPTREND")
    return { label: zh ? "上升趋势 — 等入场信号" : "Uptrend — awaiting entry signal", color: "var(--up)" };
  if (trend === "RANGE")
    return { label: zh ? "区间震荡 — 无优势" : "Range — no edge", color: "var(--text-2)" };
  if (trend === "DOWNTREND" || (!a2 && !wb))
    return { label: zh ? "下行趋势 — 观望" : "Downtrend — stand aside", color: "var(--down)" };
  return { label: zh ? "空仓 — 等待再入场" : "Flat — awaiting re-entry", color: "var(--text-2)" };
}

// Golden Oracle verdict for the rail card. Sources, in trust order:
//   1. slice.indicator.signals — the newest marker the engine did NOT refuse
//      (quality !== 'regime_blocked'): the dated verdict anchor. A fresh anchor renders as
//      the event (RECLAIM = soft/unscored authority); a stale/undated anchor demotes to the
//      sub-line echo and the primary becomes the STANCE from state (computeStance).
//   2. manifest row.verdict (scored lane) — undated fallback when there is no slice: dimmed.
// Either way this is a swing-timing overlay read (3D bars), never an investment view — the
// horizon rides along in `note` so the button tooltip says so.
export function oracleVerdict(
  v?: string | null,
  slice?: OracleSlice | null,
  zh = false,
  now: number = Date.now(),
  trend: StanceTrend = null,
): Verdict {
  const st = slice?.indicator?.state ?? null;
  const sigsRaw = slice?.indicator?.signals;
  const sigs: OracleSignal[] = Array.isArray(sigsRaw) ? sigsRaw : [];

  // effective event = newest marker the engine did not refuse (regime_blocked markers are
  // display artifacts of vetoed entries — contracts.py: "never treat as an entry").
  let eff: OracleSignal | null = null;
  let blockedTail: OracleSignal | null = null;
  for (let i = sigs.length - 1; i >= 0; i--) {
    const s = sigs[i];
    if (!s?.ts || !s?.type) continue;
    if (String(s.quality || "").toLowerCase() === "regime_blocked") {
      if (!eff && !blockedTail) blockedTail = s;   // remember a refused tail for the note
      continue;
    }
    eff = s;
    break;
  }

  const mv = v ? String(v).toUpperCase() : null;
  const scored = st?.last_scored_signal ? String(st.last_scored_signal).toUpperCase() : null;
  if (!eff && !scored && !mv)
    return { label: "—", color: "var(--muted)", raw: null, sub: null, dim: false, note: null };

  const horizon = zh ? "3日K线摆动择时信号 — 非投资观点" : "swing-timing overlay on 3D bars — not an investment view";
  const age = eff ? ageDays(eff.ts, now) : null;
  const effU = eff ? String(eff.type).toUpperCase() : null;
  const stale = age == null || age > ORACLE_STALE_DAYS;

  // ── fresh effective event: it IS the verdict (today's full-authority path) ──
  if (eff && effU && !stale) {
    const soft = effU === "RECLAIM";
    const notes: string[] = [horizon];
    if (eff.price != null) notes.push(`@ ${eff.price}`);
    const q = String(eff.quality || "").toLowerCase();
    if (soft) notes.push(zh ? "未计分再入场信号（不计入战绩）" : "unscored re-entry signal (not in the track record)");
    if (SOFT_Q.has(q) && !soft) notes.push(String(eff.quality_reason || q));
    else if (soft && eff.quality_reason) notes.push(String(eff.quality_reason));
    // lane-disagreement note only between the two SCORED lanes (a RECLAIM primary is
    // EXPECTED to differ from the scored manifest verdict — not a data fault).
    if (!soft && mv && mv !== effU) notes.push(zh ? `数据通道不一致（清单通道：${mv}）` : `data lanes disagree (screener lane: ${mv})`);
    return {
      label: eventLabel(effU, zh),
      color: eventColor(effU),
      raw: effU,
      sub: `${fmtDate(eff.ts, zh)} · ${age}${zh ? "天前" : "d ago"}`,
      dim: false,
      soft,
      note: notes.join(" · "),
    };
  }

  // ── stale or undated: the stance is the primary; the event demotes to a dated echo ──
  // Only when the state actually carries regime fields — a bare {last_signal} (legacy
  // shape) has nothing honest to stand on and keeps the dated/dimmed event render.
  const hasRegime = st != null && (st.position_hint !== undefined || st.strong_bull !== undefined
    || st.extended !== undefined || st.weeklyBull !== undefined || st.above200 !== undefined);
  if (st && hasRegime) {
    const stance = computeStance(st, trend, zh);
    if (stance) {
      const notes: string[] = [zh ? "姿态来自当前状态 — 非交易信号" : "stance from current regime state — not a trade signal", horizon];
      if (blockedTail) {
        notes.push(
          `${fmtDate(blockedTail.ts, zh)} ${eventLabel(String(blockedTail.type).toUpperCase(), zh)} ` +
          (zh ? "已拦截 — 非入场信号" : "blocked — not an entry"),
        );
      }
      const echoU = effU ?? scored ?? mv;
      const echo = eff && echoU
        ? `● ${eventLabel(echoU, zh)} · ${fmtDate(eff.ts, zh)}${age != null ? ` · ${age}${zh ? "天前" : "d ago"}` : ""}`
        : echoU
          ? `● ${eventLabel(echoU, zh)} · ${zh ? "无日期" : "undated"}`
          : null;
      if (eff?.price != null) notes.push(`${eventLabel(echoU!, zh)} @ ${eff.price}`);
      return {
        label: stance.label,
        color: stance.color,
        raw: echoU ?? null,
        sub: echo,
        dim: false,          // a stance is a CURRENT read — authority comes from the stance style
        stance: true,
        note: notes.join(" · "),
      };
    }
  }

  // ── no state to stand on: today's dated/dimmed (or undated) event render ──
  const u = effU ?? scored ?? mv!;
  const notes: string[] = [horizon];
  if (eff?.price != null) notes.push(`@ ${eff.price}`);
  if (mv && mv !== u) notes.push(zh ? `数据通道不一致（清单通道：${mv}）` : `data lanes disagree (screener lane: ${mv})`);
  return {
    label: eventLabel(u, zh),
    color: eventColor(u),
    raw: u,
    sub: eff ? `${fmtDate(eff.ts, zh)} · ${age}${zh ? "天前" : "d ago"}` : zh ? "无日期" : "undated",
    dim: true,
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
//     or legacy files that don't ship band/entry;
//   - dir=NEUTRAL with a known entry posture renders the POSTURE (await_confluence /
//     wait_pullback / bounce_wait) instead of a blank "Neutral" — the desk is an entry-timing
//     engine and its score is dip-entry READINESS (name_score.potential_score), labeled as such.
const EXIT_ENTRIES = new Set(["exit", "topping"]);

const ENTRY_POSTURE: Record<string, [string, string]> = {
  // entry status -> [en, zh] — descriptive posture, never a Buy/Sell verb
  await_confluence: ["Awaiting confluence", "等待共振触发"],
  wait_pullback: ["Wait for pullback", "等待回调"],
  bounce_wait: ["Bounce unconfirmed — wait", "反弹未确认 — 观望"],
};

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
  // symmetric staleness guard: a desk read older than the display threshold loses authority too
  const dim = age != null && age > ORACLE_STALE_DAYS;
  const notes: string[] = [];
  // honest label: the desk score is name_score.potential_score = dip-entry READINESS
  // (it structurally rewards washed-out names), NOT directional conviction.
  if (score != null) notes.push(zh ? `回调买点就绪度 ${score}/100` : `dip-entry readiness ${score}/100`);

  if (dir === "BEAR" && band === "low" && !EXIT_ENTRIES.has(entry)) {
    notes.unshift(zh ? "低买点评分（band=low）— 非做空观点" : "weak buy-readiness read (band=low) — not a short call");
    return { label: zh ? "无买点" : "No setup", color: "var(--muted)", raw: "NO_SETUP", sub, dim, note: notes.join(" · ") };
  }

  const aj = intel?.cards?.ai_judgment;
  if (dir === "BEAR" && aj?.verdict && /constructive|bullish|accumulate|leader/i.test(String(aj.verdict)))
    notes.push(zh ? "来源分歧：AI判断偏建设性" : `sources disagree: AI judgment reads "${aj.verdict}"`);

  // NEUTRAL with a known entry posture: render the posture, not a blank "Neutral" —
  // "Neutral" on a market leader reads as an opinion; "Awaiting confluence" is the truth.
  if ((dir === "NEUTRAL" || !dir) && ENTRY_POSTURE[entry]) {
    const [en, zhLbl] = ENTRY_POSTURE[entry];
    notes.push(zh ? "入场时机读数 — 非方向观点" : "entry-timing read — not a directional view");
    return { label: zh ? zhLbl : en, color: "var(--signal)", raw: dir || "NEUTRAL", sub, dim, note: notes.join(" · ") };
  }

  const color = dir === "BULL" ? "var(--buy)" : dir === "BEAR" ? "var(--sell)" : "var(--signal)";
  const label =
    dir === "BULL" ? (zh ? "看多" : "Bullish")
      : dir === "BEAR" ? (zh ? "看空" : "Bearish")
        : (zh ? "中性" : "Neutral");
  return { label, color, raw: dir || null, sub, dim, note: notes.length ? notes.join(" · ") : null };
}
