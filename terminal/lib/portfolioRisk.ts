// Portfolio shape readout — pure computation + all bilingual copy (B-F08-4).
//
// TWO-ORGANISMS LAW (UWP-R2): this module never scores, ranks, or recommends. It describes the
// COMPOSITION of the user's own book — concentration, industry weight, company-size weight, and
// how much sits in thinly traded names — from the positions the user already owns and the macro
// per-ticker artifacts, read-only. No React, no fetch: every I/O concern (the artifact fan-out)
// lives in the route; this file is unit-testable without a DOM or a network.
//
// Weight basis is COST (shares * entryPrice), not live market value — see the frozen note in the
// packet: the route has no live price (that join is client-side), so weights are stated as "what
// you paid" rather than implied as market value. `weightBasis` rides the payload as a literal so a
// future market-value version is a schema bump, never a silent redefinition.

export type Lang = "en" | "zh";
export interface Bilingual { en: string; zh: string }

/** The ONLY fields this readout reads out of a macro per-ticker artifact. */
export interface TickerFacts {
  ticker: string;
  sector: string | null;
  marketCap: number | null;
  thinlyTraded: boolean | null;
}

/** One artifact read, as a typed state. `locked` is a real state, not a failure. */
export type ArtifactState =
  | { kind: "read"; facts: TickerFacts }
  | { kind: "missing" }
  | { kind: "locked" }
  | { kind: "unreadable" }
  | { kind: "not_attempted" };

export type GapReason =
  | "no_size" | "no_page" | "page_locked" | "page_unreadable"
  | "no_industry" | "no_company_size" | "no_thickness" | "too_many_positions";

export type SizeBucket = "very_large" | "large" | "medium" | "small" | "very_small";

export interface RiskInputPosition {
  ticker: string; shares: number | null; entryPrice: number | null;
  status: "open" | "closed";
}

export interface PortfolioRisk {
  schema: "portfolio_risk.v1";
  weightBasis: "cost";
  counts: { total: number; sized: number; read: number };
  totalCost: number | null;
  concentration: {
    top1: { ticker: string; weightPct: number } | null;
    topNCount: number;
    topNWeightPct: number | null;
    topNames: string[];
  } | null;
  sectors: { key: string; label: Bilingual; weightPct: number }[];
  sectorUncoveredPct: number;
  sizes: { bucket: SizeBucket; weightPct: number }[];
  sizeUncoveredPct: number;
  liquidity: { thinPct: number; thinNames: string[]; readCount: number } | null;
  gaps: { ticker: string; reason: GapReason }[];
}

// ── frozen 11-entry GICS EN/ZH map (section 3.4) ──
const GICS_ZH: Record<string, string> = {
  "Information Technology": "信息技术",
  "Health Care": "医疗保健",
  "Financials": "金融",
  "Consumer Discretionary": "非必需消费",
  "Communication Services": "通信服务",
  "Industrials": "工业",
  "Consumer Staples": "必需消费",
  "Energy": "能源",
  "Utilities": "公用事业",
  "Real Estate": "房地产",
  "Materials": "材料",
};

function sectorLabel(sector: string): Bilingual {
  const zh = GICS_ZH[sector];
  // Unmapped value: fall back to the artifact's own EN string in BOTH languages — never a raw
  // slug, and never a blocked render.
  return zh ? { en: sector, zh } : { en: sector, zh: sector };
}

/** Company-size band edges, PRINTED on the surface so no threshold is hidden (section 3.4). */
export function sizeBucketOf(marketCap: number): SizeBucket {
  if (marketCap >= 200e9) return "very_large";
  if (marketCap >= 10e9) return "large";
  if (marketCap >= 2e9) return "medium";
  if (marketCap >= 300e6) return "small";
  return "very_small";
}

const SIZE_BAND_LABEL: Record<SizeBucket, Bilingual> = {
  very_large: { en: "Very large ($200B and up)", zh: "超大型（2000亿美元以上）" },
  large: { en: "Large ($10B-$200B)", zh: "大型（100亿-2000亿美元）" },
  medium: { en: "Medium ($2B-$10B)", zh: "中型（20亿-100亿美元）" },
  small: { en: "Small ($300M-$2B)", zh: "小型（3亿-20亿美元）" },
  very_small: { en: "Very small (under $300M)", zh: "微型（3亿美元以下）" },
};
const SIZE_ORDER: SizeBucket[] = ["very_large", "large", "medium", "small", "very_small"];

function artifactGapReason(kind: Exclude<ArtifactState["kind"], "read">): GapReason {
  if (kind === "missing") return "no_page";
  if (kind === "locked") return "page_locked";
  if (kind === "not_attempted") return "too_many_positions";
  return "page_unreadable";
}

/** Largest-remainder rounding to 1 decimal so a set of weights that individually round to e.g.
 *  99.9 or 100.1 still sums to EXACTLY 100.0 — a stacked bar can never show a phantom sliver or
 *  overflow (test: rounding). `weights` may include a trailing "uncovered" weight. */
export function allocatePercentages(weights: readonly number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (!(sum > 0)) return weights.map(() => 0);
  const scaled = weights.map((w) => (Math.max(0, w) / sum) * 1000);
  const floors = scaled.map(Math.floor);
  const already = floors.reduce((a, b) => a + b, 0);
  let remainder = Math.round(1000 - already);
  const order = scaled
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);
  const result = [...floors];
  for (let k = 0; k < remainder && k < order.length; k++) result[order[k].i] += 1;
  return result.map((v) => v / 10);
}

function isFiniteNum(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

export function computePortfolioRisk(
  positions: readonly RiskInputPosition[],
  artifacts: Readonly<Record<string, ArtifactState>>,
): PortfolioRisk {
  const open = positions.filter((p) => p.status === "open");
  const gaps: { ticker: string; reason: GapReason }[] = [];

  type Sized = { ticker: string; cost: number };
  const sized: Sized[] = [];
  for (const p of open) {
    const cost = isFiniteNum(p.shares) && isFiniteNum(p.entryPrice) ? p.shares * p.entryPrice : null;
    if (cost == null || !(cost > 0)) {
      gaps.push({ ticker: p.ticker, reason: "no_size" });
      continue;
    }
    sized.push({ ticker: p.ticker, cost });
  }

  const totalCost = sized.length ? sized.reduce((a, s) => a + s.cost, 0) : null;
  const pctOf = (cost: number) => (totalCost && totalCost > 0 ? (cost / totalCost) * 100 : 0);

  // ── concentration — NEVER depends on an artifact ──
  let concentration: PortfolioRisk["concentration"] = null;
  if (sized.length > 0 && totalCost) {
    const bySize = [...sized].sort((a, b) => (b.cost - a.cost) || a.ticker.localeCompare(b.ticker));
    const top1 = bySize[0];
    const topNCount = Math.min(3, bySize.length);
    const topN = bySize.slice(0, topNCount);
    const topNCost = topN.reduce((a, s) => a + s.cost, 0);
    concentration = {
      top1: { ticker: top1.ticker, weightPct: Math.round(pctOf(top1.cost) * 10) / 10 },
      topNCount,
      topNWeightPct: Math.round(pctOf(topNCost) * 10) / 10,
      topNames: topN.map((s) => s.ticker),
    };
  }

  // ── industries / size / liquidity — per sized position, artifact-gated ──
  let readCount = 0;
  const sectorCostByKey = new Map<string, number>();
  const sectorLabelByKey = new Map<string, Bilingual>();
  let sectorUncoveredCost = 0;
  const sizeCostByBucket = new Map<SizeBucket, number>();
  let sizeUncoveredCost = 0;
  let liquidityReadCost = 0;
  let liquidityReadCount = 0;
  let thinCost = 0;
  const thinNames: string[] = [];

  for (const s of sized) {
    const state = artifacts[s.ticker] ?? { kind: "missing" as const };
    if (state.kind !== "read") {
      gaps.push({ ticker: s.ticker, reason: artifactGapReason(state.kind) });
      sectorUncoveredCost += s.cost;
      sizeUncoveredCost += s.cost;
      continue;
    }
    readCount += 1;
    const facts = state.facts;

    if (facts.sector == null) {
      gaps.push({ ticker: s.ticker, reason: "no_industry" });
      sectorUncoveredCost += s.cost;
    } else {
      const key = facts.sector;
      sectorCostByKey.set(key, (sectorCostByKey.get(key) ?? 0) + s.cost);
      if (!sectorLabelByKey.has(key)) sectorLabelByKey.set(key, sectorLabel(key));
    }

    if (facts.marketCap == null) {
      gaps.push({ ticker: s.ticker, reason: "no_company_size" });
      sizeUncoveredCost += s.cost;
    } else {
      const bucket = sizeBucketOf(facts.marketCap);
      sizeCostByBucket.set(bucket, (sizeCostByBucket.get(bucket) ?? 0) + s.cost);
    }

    if (facts.thinlyTraded == null) {
      gaps.push({ ticker: s.ticker, reason: "no_thickness" });
    } else {
      liquidityReadCost += s.cost;
      liquidityReadCount += 1;
      if (facts.thinlyTraded) {
        thinCost += s.cost;
        thinNames.push(s.ticker);
      }
    }
  }

  // sectors: covered entries desc by weight, plus the uncovered share on the same shared scale.
  const sectorKeys = [...sectorCostByKey.keys()].sort(
    (a, b) => (sectorCostByKey.get(b)! - sectorCostByKey.get(a)!) || a.localeCompare(b),
  );
  const sectorAlloc = allocatePercentages([...sectorKeys.map((k) => sectorCostByKey.get(k)!), sectorUncoveredCost]);
  const sectors = sectorKeys.map((k, i) => ({ key: k, label: sectorLabelByKey.get(k)!, weightPct: sectorAlloc[i] }));
  const sectorUncoveredPct = totalCost ? sectorAlloc[sectorAlloc.length - 1] : 0;

  const sizeBucketsPresent = SIZE_ORDER.filter((b) => sizeCostByBucket.has(b))
    .sort((a, b) => (sizeCostByBucket.get(b)! - sizeCostByBucket.get(a)!));
  const sizeAlloc = allocatePercentages([...sizeBucketsPresent.map((b) => sizeCostByBucket.get(b)!), sizeUncoveredCost]);
  const sizes = sizeBucketsPresent.map((b, i) => ({ bucket: b, weightPct: sizeAlloc[i] }));
  const sizeUncoveredPct = totalCost ? sizeAlloc[sizeAlloc.length - 1] : 0;

  const liquidity = liquidityReadCount > 0
    ? {
      thinPct: totalCost ? Math.round(pctOf(thinCost) * 10) / 10 : 0,
      thinNames: thinNames.slice(0, 8),
      readCount: liquidityReadCount,
    }
    : null;

  return {
    schema: "portfolio_risk.v1",
    weightBasis: "cost",
    counts: { total: open.length, sized: sized.length, read: readCount },
    totalCost,
    concentration,
    sectors,
    sectorUncoveredPct,
    sizes,
    sizeUncoveredPct,
    liquidity,
    gaps,
  };
}

// ─────────────────────────────────────── copy (section 7) ───────────────────────────────────────

const T_TITLE: Bilingual = { en: "What your holdings look like", zh: "你的持仓是什么样子" };
const T_STANDING: Bilingual = { en: "Research view of your holdings, not advice.", zh: "这是对你持仓的研究性说明，不是投资建议。" };
const T_BASIS: Bilingual = { en: "Weighed by what you paid.", zh: "按你的买入成本加权。" };
const T_COVERAGE: Bilingual = { en: "Read {read} of {total} holdings.", zh: "{total} 个持仓中读到 {read} 个。" };

const T_C1_LABEL: Bilingual = { en: "Biggest holding", zh: "最大的一笔持仓" };
const T_C1_Q: Bilingual = { en: "How much of your money sits in one name", zh: "有多少钱押在同一只股票上" };
const T_C1_VALUE: Bilingual = { en: "{pct}%", zh: "{pct}%" };
const T_C1_SUB: Bilingual = { en: "Your {n} biggest hold {pct}% together.", zh: "最大的 {n} 笔合计占 {pct}%。" };
const T_C1_UNREAD: Bilingual = { en: "No holding has both a share count and a buy price yet.", zh: "还没有持仓同时记录了数量和买入价。" };

const T_C2_LABEL: Bilingual = { en: "Industries", zh: "行业分布" };
const T_C2_Q: Bilingual = { en: "Where your money sits by industry", zh: "你的钱分布在哪些行业" };

const T_C3_LABEL: Bilingual = { en: "Company size", zh: "公司规模" };
const T_C3_Q: Bilingual = { en: "How much sits in big companies versus small ones", zh: "有多少放在大公司、有多少放在小公司" };

const T_C4_LABEL: Bilingual = { en: "How easily it trades", zh: "买卖是否顺畅" };
const T_C4_Q: Bilingual = { en: "How much sits in names that trade thinly", zh: "有多少放在成交清淡的股票上" };
const T_C4_VALUE: Bilingual = { en: "{pct}% of what you paid sits in {n} thinly traded names.", zh: "按成本计，有 {pct}% 放在 {n} 只成交清淡的股票上。" };
const T_C4_UNREAD: Bilingual = { en: "We cannot read this yet - none of your holdings data pages say how thinly they trade.", zh: "暂时读不到 - 你的持仓数据页都没有说明成交是否清淡。" };

const T_UNCOVERED: Bilingual = { en: "Not covered yet", zh: "尚未覆盖" };
const T_GAPS_SUMMARY: Bilingual = { en: "{n} holdings we could not fully read", zh: "有 {n} 个持仓没能完整读取" };

const GAP_REASON_COPY: Record<GapReason, Bilingual> = {
  no_size: { en: "no share count or buy price on record", zh: "没有记录数量或买入价" },
  no_page: { en: "no data page yet", zh: "还没有数据页" },
  page_locked: { en: "its data page needs you signed in on the main site", zh: "该数据页需要在主站登录后才能读取" },
  page_unreadable: { en: "its data page did not answer", zh: "该数据页没有响应" },
  no_industry: { en: "its data page does not name an industry", zh: "数据页没有写明行业" },
  no_company_size: { en: "its data page does not give a company size", zh: "数据页没有给出公司规模" },
  no_thickness: { en: "its data page does not say how thinly it trades", zh: "数据页没有说明成交是否清淡" },
  too_many_positions: { en: "we read your first 60 holdings this time", zh: "本次只读取了前 60 个持仓" },
};

function fill(b: Bilingual, vars: Record<string, string>): Bilingual {
  const sub = (s: string) => Object.entries(vars).reduce((acc, [k, v]) => acc.split(`{${k}}`).join(v), s);
  return { en: sub(b.en), zh: sub(b.zh) };
}

const fmtPct = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export function riskCopy(risk: PortfolioRisk): {
  title: Bilingual; standing: Bilingual; basis: Bilingual; coverage: Bilingual;
  cards: { key: "concentration" | "industries" | "size" | "thickness";
    label: Bilingual; question: Bilingual; value: Bilingual | null;
    sub: Bilingual | null; unread: Bilingual | null }[];
  legend: { key: string; label: Bilingual; weightPct: number; covered: boolean }[][];
  gapsSummary: Bilingual | null;
  gapLines: { ticker: string; text: Bilingual }[];
} {
  const c = risk.concentration;
  const card1 = c
    ? {
      key: "concentration" as const,
      label: T_C1_LABEL, question: T_C1_Q,
      value: fill(T_C1_VALUE, { pct: fmtPct(c.top1!.weightPct) }),
      sub: fill(T_C1_SUB, { n: String(c.topNCount), pct: fmtPct(c.topNWeightPct ?? 0) }),
      unread: null,
    }
    : { key: "concentration" as const, label: T_C1_LABEL, question: T_C1_Q, value: null, sub: null, unread: T_C1_UNREAD };

  const card2 = {
    key: "industries" as const, label: T_C2_LABEL, question: T_C2_Q,
    value: null, sub: null,
    unread: risk.sectors.length ? null : { en: "Nothing readable yet.", zh: "暂时没有可读的数据。" },
  };
  const card3 = {
    key: "size" as const, label: T_C3_LABEL, question: T_C3_Q,
    value: null, sub: null,
    unread: risk.sizes.length ? null : { en: "Nothing readable yet.", zh: "暂时没有可读的数据。" },
  };
  const liq = risk.liquidity;
  const card4 = liq
    ? {
      key: "thickness" as const, label: T_C4_LABEL, question: T_C4_Q,
      value: fill(T_C4_VALUE, { pct: fmtPct(liq.thinPct), n: String(liq.thinNames.length) }),
      sub: null, unread: null,
    }
    : { key: "thickness" as const, label: T_C4_LABEL, question: T_C4_Q, value: null, sub: null, unread: T_C4_UNREAD };

  const T_REST: Bilingual = { en: "Rest of your book", zh: "其余持仓" };
  const legend0 = c
    ? [
      { key: c.top1!.ticker, label: { en: c.top1!.ticker, zh: c.top1!.ticker }, weightPct: c.top1!.weightPct, covered: true },
      { key: "rest", label: T_REST, weightPct: Math.round((100 - c.top1!.weightPct) * 10) / 10, covered: true },
    ]
    : [];
  const legend1 = [
    ...risk.sectors.map((s) => ({ key: s.key, label: s.label, weightPct: s.weightPct, covered: true })),
    ...(risk.sectorUncoveredPct > 0 ? [{ key: "uncovered", label: T_UNCOVERED, weightPct: risk.sectorUncoveredPct, covered: false }] : []),
  ];
  const legend2 = [
    ...risk.sizes.map((s) => ({ key: s.bucket, label: SIZE_BAND_LABEL[s.bucket], weightPct: s.weightPct, covered: true })),
    ...(risk.sizeUncoveredPct > 0 ? [{ key: "uncovered", label: T_UNCOVERED, weightPct: risk.sizeUncoveredPct, covered: false }] : []),
  ];

  const distinctGapTickers = new Set(risk.gaps.map((g) => g.ticker));
  const gapsSummary = distinctGapTickers.size
    ? fill(T_GAPS_SUMMARY, { n: String(distinctGapTickers.size) })
    : null;
  const gapLines = risk.gaps.map((g) => ({ ticker: g.ticker, text: GAP_REASON_COPY[g.reason] }));

  return {
    title: T_TITLE, standing: T_STANDING, basis: T_BASIS,
    coverage: fill(T_COVERAGE, { read: String(risk.counts.read), total: String(risk.counts.total) }),
    cards: [card1, card2, card3, card4],
    legend: [legend0, legend1, legend2, []],
    gapsSummary, gapLines,
  };
}
