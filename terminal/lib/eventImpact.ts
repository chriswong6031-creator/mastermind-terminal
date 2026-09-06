// Event → affected positions join (MO-PAID-028) + honest carry of direction/mechanism/timeframe
// (MO-DELTA-042). Pure module: no fetch, no fs, no React, no Date.now() — `daysUntil` is carried
// verbatim from the artifact, never recomputed from a clock.
//
// The macro nightly bakes ONE compact per-ticker context blob at
// https://www.mastermind-x.com/data/portfolio_ctx.json (scripts/build_portfolio_ctx.py in the
// macro repo). This module joins that artifact's `earnings` block against the user's OPEN
// holdings only. Two other published calendars (event_windows/snapshot.json,
// factordata/hk_catalyst_calendar.json) carry no ticker field and therefore CANNOT be joined —
// joining them would be the Terminal inventing an affected-position claim the source never made
// (the exact A7 violation this packet exists to prevent). They are disclosed in plain words via
// `UNJOINABLE_SOURCES` instead.
//
// TWO-ORGANISMS LAW (UWP-R2, see PortfolioView.tsx): nothing here feeds a signal, score, ranker
// or alert. The LLM never originates direction (A7) — direction/mechanism/timeframe are CARRIED
// from the artifact when present and printed "not stated" when absent. There is no fallback
// source, no derived word, no default.

export type Lang = "en" | "zh";

/** A field the SOURCE either stated or did not. There is no third case and no default. */
export type Carried =
  | { readonly state: "stated"; readonly text: string; readonly textZh: string | null }
  | { readonly state: "not_stated" };

export interface TouchedPosition {
  readonly id: string;
  readonly ticker: string;
  readonly shares: number | null; // null = unsized, a legal state (PortfolioView.tsx)
  readonly status: "open" | "closed";
}

export interface EventTouch {
  readonly eventId: string; // `${kind}|${ticker}|${date}` — stable, no hashing
  readonly kind: "earnings"; // the only kind any published artifact keys by ticker today
  readonly ticker: string;
  readonly date: string; // verbatim ISO yyyy-mm-dd from the artifact
  readonly daysUntil: number; // verbatim `days_to` — NEVER recomputed from a clock
  readonly positions: readonly TouchedPosition[];
  readonly direction: Carried;
  readonly mechanism: Carried;
  readonly timeframe: Carried;
  readonly sourcePath: "/data/portfolio_ctx.json";
}

/** A calendar we publish that carries no ticker field, so it CANNOT be joined. */
export interface UnjoinableSource {
  readonly path: string;
  readonly reason: "no_ticker_field";
  readonly labelEn: string;
  readonly labelZh: string;
}

export type EventImpactRead =
  | { readonly state: "holdings_unreadable" }
  | { readonly state: "calendar_unreadable"; readonly detail: string }
  | { readonly state: "no_holdings" }
  | {
      readonly state: "no_events";
      readonly asof: string;
      readonly heldTickers: number;
      readonly unjoinable: readonly UnjoinableSource[];
    }
  | {
      readonly state: "ok";
      readonly asof: string;
      readonly heldTickers: number;
      readonly events: readonly EventTouch[];
      readonly unjoinable: readonly UnjoinableSource[];
    };

export const NOT_STATED: Readonly<Record<Lang, string>> = {
  en: "Not stated in the source",
  zh: "来源未说明",
};

export const UNJOINABLE_SOURCES: readonly UnjoinableSource[] = [
  {
    path: "/event_windows/snapshot.json",
    reason: "no_ticker_field",
    labelEn: "the macro release calendar",
    labelZh: "宏观数据发布日历",
  },
  {
    path: "/factordata/hk_catalyst_calendar.json",
    reason: "no_ticker_field",
    labelEn: "the index-review calendar",
    labelZh: "指数检讨日历",
  },
];

function trimmedStringOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

function readCarried(block: Record<string, unknown>, key: string): Carried {
  const text = trimmedStringOrNull(block[key]);
  if (text === null) return { state: "not_stated" };
  const zh = trimmedStringOrNull(block[`${key}_zh`]);
  return { state: "stated", text, textZh: zh };
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function joinEventImpact(input: {
  positions: readonly TouchedPosition[] | null;
  ctx: unknown | null;
  ctxError?: string;
}): EventImpactRead {
  const { positions, ctx, ctxError } = input;

  // 1. No book, no story.
  if (positions === null) return { state: "holdings_unreadable" };

  // 2. Wrong or missing schema is unreadable, never partially trusted.
  if (
    !isPlainObject(ctx) ||
    typeof (ctx as Record<string, unknown>).schema !== "string" ||
    !((ctx as Record<string, unknown>).schema as string).startsWith("portfolio_ctx.")
  ) {
    return { state: "calendar_unreadable", detail: ctxError || "bad schema" };
  }
  const ctxObj = ctx as Record<string, unknown>;

  // 3. Open positions only, distinct uppercased tickers.
  const openPositions = positions.filter(
    (p) => p.status === "open" && trimmedStringOrNull(p.ticker) !== null
  );
  const heldTickerSet = new Set(openPositions.map((p) => p.ticker.trim().toUpperCase()));
  const heldTickers = heldTickerSet.size;

  // 4. Nothing held, nothing to say.
  if (heldTickers === 0) return { state: "no_holdings" };

  const asof = typeof ctxObj.asof === "string" ? ctxObj.asof : "";
  const tickersBlock = isPlainObject(ctxObj.tickers) ? ctxObj.tickers : {};

  const events: EventTouch[] = [];
  for (const ticker of Array.from(heldTickerSet).sort()) {
    const tickerBlock = tickersBlock[ticker];
    if (!isPlainObject(tickerBlock)) continue;
    const earnings = tickerBlock.earnings;
    if (!isPlainObject(earnings)) continue;

    // 5. Emit only when `next` is a non-empty trimmed string AND `days_to` is a finite number >= 0.
    const next = trimmedStringOrNull(earnings.next);
    const daysTo = earnings.days_to;
    if (next === null || typeof daysTo !== "number" || !Number.isFinite(daysTo) || daysTo < 0) {
      continue;
    }

    const touchedPositions = openPositions
      .filter((p) => p.ticker.trim().toUpperCase() === ticker)
      .map((p) => ({ ...p }));

    events.push({
      eventId: `earnings|${ticker}|${next}`,
      kind: "earnings",
      ticker,
      date: next,
      daysUntil: daysTo,
      positions: touchedPositions,
      // 6. Direction/mechanism/timeframe read ONLY from these three keys. No fallback, no default.
      direction: readCarried(earnings, "direction"),
      mechanism: readCarried(earnings, "mechanism"),
      timeframe: readCarried(earnings, "timeframe"),
      sourcePath: "/data/portfolio_ctx.json",
    });
  }

  // 7. Sort: date ascending, then ticker ascending. The only two sort keys.
  events.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return a.ticker < b.ticker ? -1 : a.ticker > b.ticker ? 1 : 0;
  });

  // 8/9.
  if (events.length === 0) {
    return { state: "no_events", asof, heldTickers, unjoinable: UNJOINABLE_SOURCES };
  }
  return { state: "ok", asof, heldTickers, events, unjoinable: UNJOINABLE_SOURCES };
}

export function presentCarried(c: Carried, lang: Lang): string {
  if (c.state === "not_stated") return NOT_STATED[lang];
  if (lang === "zh" && c.textZh) return c.textZh;
  return c.text;
}

export function presentDaysUntil(n: number, lang: Lang): string {
  if (n === 0) return lang === "zh" ? "就在今天" : "Today";
  if (n === 1) return lang === "zh" ? "明天" : "Tomorrow";
  return lang === "zh" ? `还有 ${n} 天` : `In ${n} days`;
}

export function presentEventSentence(e: EventTouch, lang: Lang): string {
  return lang === "zh"
    ? `${e.ticker} 将于 ${e.date} 公布财报。`
    : `${e.ticker} reports earnings on ${e.date}.`;
}

export function presentPosition(p: TouchedPosition, lang: Lang): string {
  if (p.shares === null) return lang === "zh" ? "未记录持仓数量" : "Size not recorded";
  return lang === "zh" ? `你持有 ${p.shares} 股` : `You hold ${p.shares} shares`;
}

export function presentUnjoinable(u: readonly UnjoinableSource[], lang: Lang): string {
  const list = u.map((s) => (lang === "zh" ? s.labelZh : s.labelEn)).join(lang === "zh" ? "、" : ", ");
  return lang === "zh"
    ? `我们发布的另外两份日历不会点名个别持仓，因此未在此列出：${list}。`
    : `Two calendars we publish don't name individual holdings, so they aren't listed here: ${list}.`;
}
