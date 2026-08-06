// Weekly washout-turn dual-read — the counter-read that sits BESIDE the trailing Oracle/Desk
// verdicts, never instead of them. Reference miss: MCD's weekly momentum crossed up from the
// 6.3rd depth percentile on 2026-07-31 while the card still read "Sell · Jul 23" + "Bounce
// unconfirmed — wait"; nothing on the card consumed the weekly grain.
//
// The state is computed upstream (macro engine/washout_turn.py) and forwarded by the bridge
// under intel.tape.washout_turn (ingest/pull_macro_intel.py). This module ONLY formats it.
// Copy law: watch vocabulary throughout — an early turn is a window, not a call. No Buy/Sell
// verb, no "validated", no falsifier/refutation language on a front-facing surface. The
// receipt is a VISIBLE muted line (never a tooltip): depth percentile plus the prior-turn
// base rates, or the plain-word thin-history disclosure when there aren't enough of them.

export type WashoutState = "WASHOUT_TURN" | "TURN_WATCH";

export interface WashoutTurnRead {
  state: WashoutState;
  /** state === "WASHOUT_TURN" — the row's tint rides this (turn = --buy, watch = --text-2) */
  turn: boolean;
  head: string;
  /** the crossed-up sentence — turn only; a watch has no dated cross to state yet */
  detail: string | null;
  stance: string;
  /** visible receipt: depth + prior-turn medians (or the thin-history disclosure), plus a
   *  data-through suffix once the source stops moving */
  receipt: string;
}

const DAY_MS = 86_400_000;
// A weekly read is refreshed nightly; past three calendar days the row states its as-of date
// rather than implying the depth/median receipt was measured today.
const STALE_DAYS = 3;
// Fewer prior turns than this and the medians are noise — the receipt says so in plain words
// instead of printing a summary nobody should lean on (matches the upstream MIN events = 8).
const MIN_EVENTS = 8;

const VALID_STATES: ReadonlySet<string> = new Set(["WASHOUT_TURN", "TURN_WATCH"]);
// data_through must be a bare calendar day. A time component, a number, or a garbled string
// all mean "we cannot honestly date this receipt" — the suffix is dropped, never echoed.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** a real, finite number. The bridge rounds and omits, but this row renders whatever the tape
 *  hands it: a hand-rolled or half-migrated block can still carry NaN, Infinity, "11", or {},
 *  and `!= null` waves every one of those through into the sentence. */
function isNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** the trimmed tape.washout_turn block — only the fields the read consumes */
interface WashoutTurnBlock {
  state?: unknown;
  since?: unknown;
  depth_pctile?: unknown;
  data_through?: unknown;
  history?: { n?: unknown; med_13w?: unknown; med_26w?: unknown } | null;
}

/** Format the weekly washout-turn block for the rail card.
 *
 * Returns null — never throws — when the block is absent, not an object, or carries a state
 * outside the two the row knows how to speak about. A caller that gets null renders nothing.
 */
export function washoutTurnRead(
  wt: unknown,
  zh: boolean,
  now: number = Date.now(),
): WashoutTurnRead | null {
  if (!wt || typeof wt !== "object") return null;
  const w = wt as WashoutTurnBlock;
  const state = w.state;
  if (typeof state !== "string" || !VALID_STATES.has(state)) return null;
  const turn = state === "WASHOUT_TURN";

  // Every interpolation site is guarded, not nullish-coalesced: `since: 0` / `false` / `[]` are
  // all non-null and would render as "since 0" / "since false" / "since ". The row's contract is
  // that a hostile block still reads as one of the pinned forms — never NaN, [object Object],
  // undefined, or an impossible date.
  const since = typeof w.since === "string" && w.since ? w.since : "—";
  const head = turn
    ? (zh ? "洗盘转向" : "Washout turn")
    : (zh ? "深部筑底 — 动能回升中" : "Deep base — momentum curling up");
  const detail = turn
    ? (zh ? `周线动能自深部上穿 · 起于 ${since}` : `weekly momentum crossed up from a deep base · since ${since}`)
    : null;
  const stance = zh
    ? "观察 — 转向初期；窗口而非定论"
    : "watch — early turn; windows, not certainties";

  // ── receipt ──────────────────────────────────────────────────────────────────
  const dp = isNum(w.depth_pctile) ? w.depth_pctile : "—";
  const hist = w.history;
  const rawN = hist?.n;
  const n = isNum(rawN) ? rawN : 0;   // an uncountable n is 0 prior turns, never "NaN"
  const med13 = hist?.med_13w;
  const med26 = hist?.med_26w;
  const summarizable = n >= MIN_EVENTS && isNum(med13) && isNum(med26);
  let receipt = summarizable
    ? (zh
      ? `深度：自身历史最低 ${dp}% · 类似转向 n=${n}：13周中位 ${med13}% · 26周中位 ${med26}%`
      : `depth: bottom ${dp}% of own history · similar turns n=${n}: 13w median ${med13}% · 26w median ${med26}%`)
    : (zh
      ? `深度：自身历史最低 ${dp}% · 历史样本不足（n=${n}）`
      : `depth: bottom ${dp}% of own history · too few prior turns to summarize (n=${n})`);

  const dt = w.data_through;
  if (typeof dt === "string" && DATE_RE.test(dt)) {
    const t = Date.parse(`${dt}T00:00:00Z`);
    // Round-trip guard: Date.parse does NOT reject an out-of-range day — "2026-02-30" rolls
    // forward to Mar 2 and comes back finite, and the suffix would then print a date that
    // never existed. A day that does not re-format to itself is not a date we can quote.
    // (Order is load-bearing: new Date(NaN).toISOString() throws, so the finite check is first.)
    if (Number.isFinite(t)
        && new Date(t).toISOString().slice(0, 10) === dt
        && now - t > STALE_DAYS * DAY_MS) {
      receipt += zh ? ` · 数据截至 ${dt}` : ` · data through ${dt}`;
    }
  }

  return { state: state as WashoutState, turn, head, detail, stance, receipt };
}
