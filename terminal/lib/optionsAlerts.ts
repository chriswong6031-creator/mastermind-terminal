/**
 * optionsAlerts.ts — canonical PURE evaluators for the options-flow alert family.
 *
 * NO I/O. These are the single source of truth for BOTH the browser (AlertsView
 * creation preview + condition builder) AND the Python firing engine
 * (ingest/alerts_engine.py ports the SAME algorithms — the pytest parity guard in
 * tests/test_alerts_options.py keeps the two from drifting).
 *
 * Contract for every evaluator: (condition, payload, priorState) -> EvalResult.
 *   fired === null  → "cannot evaluate" (missing/malformed payload). The caller LOGS
 *                     and NEVER disarms — a null is honest, not a miss.
 *   fired === true  → the condition is met; the engine applies the one-shot disarm.
 *   fired === false → armed, not met (or first observation just arming the state).
 * `nextState` is the per-condition state to persist back onto condition.* jsonb.
 *
 * Display-tier law: every `note` carries the payload's as-of + a cadence word and
 * uses NO "signal"/"buy"/"sell"/"validated" vocabulary — only "crosses"/"reaches"/
 * "unusual pace"/"map"/"level". The wall note says walls are EOD levels.
 */

export type GexState = {
  root?: string;
  spot?: number;
  gamma_flip?: number;
  call_wall?: number;
  put_wall?: number;
  asof?: string;
  authority_tier?: string;
  stale?: boolean;
};
export type GexPayload = {
  root?: string;
  spot_ref?: number;
  call_wall?: number;
  put_wall?: number;
  asof?: string;
};
export type TidePoint = { t: string; ncp: number; npp: number };
export type TidePayload = { minutes?: TidePoint[]; asof?: string; session_date?: string };
export type DtePayload = { buckets?: Record<string, { t: string; ncp: number; npp: number }[]>; asof?: string };
export type EvalResult = { fired: boolean | null; value: number | null; note: string; nextState: Record<string, unknown> };

const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const round = (x: number, dp = 2) => {
  const f = 10 ** dp;
  return Math.round(x * f) / f;
};
/** "as of {asof}" fragment; empty asof degrades to "as of unknown time" so the note is never dishonestly bare. */
const asOf = (asof?: string) => `as of ${asof && asof.length ? asof : "unknown time"}`;

// ─── (a) gamma-flip cross ───────────────────────────────────────────────────
// cond {type:"opt_gamma_flip", root, band_pct?}  — hysteresis on a dead-band so
// dead-band jitter never flips the side. First observation ARMS (never fires).
export type GammaFlipCond = { type: "opt_gamma_flip"; root?: string; band_pct?: number };

export function evalGammaFlipCross(
  cond: GammaFlipCond,
  gs: GexState | null | undefined,
  prev: Record<string, unknown> | null | undefined,
): EvalResult {
  const p = prev || {};
  const spot = gs?.spot;
  const flip = gs?.gamma_flip;
  if (!isNum(spot) || !isNum(flip)) {
    return { fired: null, value: null, note: "gamma-flip level unavailable", nextState: p };
  }
  const band = isNum(cond.band_pct) ? cond.band_pct : 0.05;
  const rawSide = spot >= flip ? "above" : "below";
  const priorSide = typeof p.side === "string" ? (p.side as string) : undefined;

  // Hysteresis: only ACCEPT a side change when spot has cleared the flip by more
  // than band_pct% of flip. Inside the dead-band, hold the prior confirmed side.
  const beyondBand = flip !== 0 && (Math.abs(spot - flip) / flip) * 100 > band;
  let confirmed: string;
  if (priorSide === undefined) confirmed = rawSide; // first obs: adopt raw, but don't fire
  else if (rawSide !== priorSide && beyondBand) confirmed = rawSide; // real cross
  else confirmed = priorSide; // within band, or same side → hold

  const nextState = { side: confirmed };
  // Fire ONCE per cross: confirmed flipped AND we had a prior confirmed side.
  if (priorSide !== undefined && confirmed !== priorSide) {
    const root = cond.root || gs?.root || "the underlying";
    const dir =
      confirmed === "above"
        ? `crossed above its gamma flip (${flip}) → long-gamma side`
        : `crossed below its gamma flip (${flip}) → short-gamma side`;
    const note = `${root} ${dir} · ${asOf(gs?.asof)}, intraday`;
    return { fired: true, value: spot, note, nextState };
  }
  return { fired: false, value: spot, note: "", nextState };
}

// ─── (b) wall proximity ──────────────────────────────────────────────────────
// cond {type:"opt_wall_touch", root, wall:"call"|"put", within_pct?}  — fires on
// ENTER (false->true). First observation arms (records inside, no fire) so an
// alert created while already near the wall does not fire on creation.
export type WallTouchCond = { type: "opt_wall_touch"; root?: string; wall?: "call" | "put"; within_pct?: number };

export function evalWallProximity(
  cond: WallTouchCond,
  gx: GexPayload | null | undefined,
  prev: Record<string, unknown> | null | undefined,
): EvalResult {
  const p = prev || {};
  const spot = gx?.spot_ref;
  const wallSide = cond.wall === "put" ? "put" : "call";
  const wall = wallSide === "put" ? gx?.put_wall : gx?.call_wall;
  if (!isNum(spot) || !isNum(wall) || wall === 0) {
    return { fired: null, value: null, note: "wall level unavailable", nextState: p };
  }
  const within = isNum(cond.within_pct) ? cond.within_pct : 0.25;
  const distPct = (Math.abs(spot - wall) / wall) * 100;
  const inside = distPct <= within;
  const priorInside = typeof p.inside === "boolean" ? (p.inside as boolean) : undefined;
  const nextState = { inside };

  // Fire only on a false->true transition (prev.inside explicitly false).
  if (inside && priorInside === false) {
    const root = cond.root || gx?.root || "the underlying";
    const note = `${root} within ${within}% of its ${wallSide} wall (${wall}) — EOD wall level · ${asOf(gx?.asof)}`;
    return { fired: true, value: spot, note, nextState };
  }
  return { fired: false, value: spot, note: "", nextState };
}

// ─── (c) premium burst ───────────────────────────────────────────────────────
// cond {type:"opt_premium_burst", root, leg:"ncp"|"npp", window_min?, z?}
// ncp/npp are CUMULATIVE → the honest slope is the per-minute delta. Trailing
// window slope vs the session delta distribution, z-scored.
export type PremiumBurstCond = {
  type: "opt_premium_burst";
  root?: string;
  leg?: "ncp" | "npp";
  window_min?: number;
  z?: number;
};

/**
 * Slope statistics for a CUMULATIVE series. Deltas d[i]=series[i]-series[i-1] are
 * the per-step slope; the trailing `window` deltas form the recent mean; ALL
 * deltas form the session distribution (population mean + std). Exposed so the
 * vitest can assert the z-math directly on synthetic series.
 */
export function sessionSlopeStats(
  series: number[],
  window: number,
): { recentMean: number; mean: number; std: number; z: number; n: number } {
  const deltas: number[] = [];
  for (let i = 1; i < series.length; i++) deltas.push(series[i] - series[i - 1]);
  const n = deltas.length;
  if (n === 0) return { recentMean: NaN, mean: NaN, std: NaN, z: NaN, n: 0 };
  const mean = deltas.reduce((a, b) => a + b, 0) / n;
  const variance = deltas.reduce((a, b) => a + (b - mean) * (b - mean), 0) / n; // population
  const std = Math.sqrt(variance);
  const w = Math.max(1, Math.min(window, n));
  const recentSlice = deltas.slice(n - w);
  const recentMean = recentSlice.reduce((a, b) => a + b, 0) / recentSlice.length;
  const z = std === 0 ? NaN : (recentMean - mean) / std;
  return { recentMean, mean, std, z, n };
}

export function evalPremiumBurst(
  cond: PremiumBurstCond,
  tide: TidePayload | null | undefined,
  prev: Record<string, unknown> | null | undefined,
): EvalResult {
  const p = prev || {};
  const leg = cond.leg === "npp" ? "npp" : "ncp";
  const windowMin = isNum(cond.window_min) ? cond.window_min : 10;
  const zThresh = isNum(cond.z) ? cond.z : 2;
  const mins = tide?.minutes;
  if (!Array.isArray(mins) || mins.length < windowMin + 2) {
    return { fired: null, value: null, note: "not enough tape for pace check", nextState: p };
  }
  const series: number[] = [];
  for (const m of mins) {
    const v = m?.[leg];
    if (!isNum(v)) return { fired: null, value: null, note: "not enough tape for pace check", nextState: p };
    series.push(v);
  }
  const stats = sessionSlopeStats(series, windowMin);
  if (!Number.isFinite(stats.std) || stats.std === 0) {
    return { fired: null, value: null, note: "flat tape", nextState: p };
  }
  const latestT = mins[mins.length - 1]?.t ?? "";
  // Fire-once per stamp: identical latest minute → do not refire on repeat eval.
  const fires = Math.abs(stats.z) >= zThresh;
  const alreadyFired = p.lastFiredT === latestT;
  const nextState: Record<string, unknown> = fires
    ? { lastFiredT: latestT, lastZ: round(stats.z, 2) }
    : { lastFiredT: p.lastFiredT, lastZ: p.lastZ };

  if (fires && !alreadyFired) {
    const root = cond.root || "the underlying";
    const legWord = leg === "npp" ? "net-put premium" : "net-call premium";
    const note = `${root} ${legWord} moving at an unusual pace (z ${stats.z.toFixed(1)}, last ${windowMin}m) · intraday tape ${asOf(tide?.asof)}`;
    return { fired: true, value: round(stats.z, 2), note, nextState };
  }
  return { fired: false, value: round(stats.z, 2), note: "", nextState };
}

// ─── (d) 0DTE share ──────────────────────────────────────────────────────────
// cond {type:"opt_0dte_spike", root, share_pct?}  — share of tracked net premium
// carried by the "0d" bucket at the latest common stamp. Missing 0d → null.
export type Zero0dteCond = { type: "opt_0dte_spike"; root?: string; share_pct?: number };

export function eval0dteShare(
  cond: Zero0dteCond,
  dte: DtePayload | null | undefined,
  prev: Record<string, unknown> | null | undefined,
): EvalResult {
  const p = prev || {};
  const buckets = dte?.buckets;
  if (!buckets || typeof buckets !== "object" || !Array.isArray(buckets["0d"])) {
    return { fired: null, value: null, note: "0DTE split unavailable", nextState: p };
  }
  const sharePct = isNum(cond.share_pct) ? cond.share_pct : 55;

  // Latest common stamp = the newest t present in EVERY bucket (honest cross-section).
  const bucketKeys = Object.keys(buckets).filter((k) => Array.isArray(buckets[k]));
  const stampSets = bucketKeys.map((k) => new Set(buckets[k].map((r) => r.t)));
  let common: string[] = stampSets.length ? [...stampSets[0]] : [];
  for (let i = 1; i < stampSets.length; i++) common = common.filter((t) => stampSets[i].has(t));
  if (common.length === 0) {
    return { fired: null, value: null, note: "0DTE split unavailable", nextState: p };
  }
  common.sort();
  const stamp = common[common.length - 1];

  const magAt = (rows: { t: string; ncp: number; npp: number }[]): number => {
    const row = rows.find((r) => r.t === stamp);
    if (!row) return 0;
    const ncp = isNum(row.ncp) ? Math.abs(row.ncp) : 0;
    const npp = isNum(row.npp) ? Math.abs(row.npp) : 0;
    return ncp + npp;
  };
  let total = 0;
  for (const k of bucketKeys) total += magAt(buckets[k]);
  const zeroMag = magAt(buckets["0d"]);
  if (total === 0) {
    return { fired: null, value: null, note: "0DTE split unavailable", nextState: p };
  }
  const share = (zeroMag / total) * 100;
  const fires = share >= sharePct;
  const alreadyFired = p.lastFiredT === stamp;
  const nextState: Record<string, unknown> = fires ? { lastFiredT: stamp } : { lastFiredT: p.lastFiredT };

  if (fires && !alreadyFired) {
    const root = cond.root || "the underlying";
    const note = `${root} 0DTE share ${share.toFixed(0)}% of tracked net premium · 10-min DTE tape ${asOf(dte?.asof)}`;
    return { fired: true, value: round(share, 1), note, nextState };
  }
  return { fired: false, value: round(share, 1), note: "", nextState };
}

// ─── UI helpers: creation preview + condition builder (shared with AlertsView) ──
export type OptKind = "opt_gamma_flip" | "opt_wall_touch" | "opt_premium_burst" | "opt_0dte_spike";

export type OptParams = {
  band_pct?: number;
  within_pct?: number;
  wall?: "call" | "put";
  window_min?: number;
  z?: number;
  leg?: "ncp" | "npp";
  share_pct?: number;
};

/**
 * Build the `{type, root, ...}` condition the POST sends. Only the fields each
 * type reads are included (opaque jsonb — the API route passes it through
 * unchanged). Numeric params are coerced; undefined params fall to evaluator
 * defaults, so an omitted field is still valid.
 */
export function buildOptCondition(kind: OptKind, root: string, params: OptParams): Record<string, unknown> {
  const r = (root || "SPY").toUpperCase();
  if (kind === "opt_gamma_flip") {
    const c: Record<string, unknown> = { type: kind, root: r };
    if (isNum(params.band_pct)) c.band_pct = params.band_pct;
    return c;
  }
  if (kind === "opt_wall_touch") {
    const c: Record<string, unknown> = { type: kind, root: r, wall: params.wall === "put" ? "put" : "call" };
    if (isNum(params.within_pct)) c.within_pct = params.within_pct;
    return c;
  }
  if (kind === "opt_premium_burst") {
    const c: Record<string, unknown> = { type: kind, root: r, leg: params.leg === "npp" ? "npp" : "ncp" };
    if (isNum(params.window_min)) c.window_min = params.window_min;
    if (isNum(params.z)) c.z = params.z;
    return c;
  }
  // opt_0dte_spike
  const c: Record<string, unknown> = { type: kind, root: r };
  if (isNum(params.share_pct)) c.share_pct = params.share_pct;
  return c;
}

/**
 * Plain-word "what will fire" for the creation preview. Reads the SAME condition
 * shape buildOptCondition emits. Display-tier: no banned vocabulary.
 */
export function optAlertPreview(cond: Record<string, unknown>, lang: "en" | "zh"): string {
  const zh = lang === "zh";
  const root = typeof cond.root === "string" && cond.root.length ? (cond.root as string) : "SPY";
  const type = cond.type;
  if (type === "opt_gamma_flip") {
    return zh ? `当 ${root} 上穿/下穿其 gamma 翻转位时提醒我` : `Alert me when ${root} crosses its gamma flip`;
  }
  if (type === "opt_wall_touch") {
    const wall = cond.wall === "put" ? "put" : "call";
    const within = isNum(cond.within_pct) ? (cond.within_pct as number) : 0.25;
    if (zh) {
      const wz = wall === "put" ? "看跌墙" : "看涨墙";
      return `当 ${root} 接近其${wz}（EOD 水平）${within}% 以内时提醒我`;
    }
    return `Alert me when ${root} comes within ${within}% of its ${wall} wall (EOD)`;
  }
  if (type === "opt_premium_burst") {
    const leg = cond.leg === "npp" ? "npp" : "ncp";
    if (zh) {
      const lw = leg === "npp" ? "看跌权利金" : "看涨权利金";
      return `当 ${root} 净${lw}以异常速度变动时提醒我`;
    }
    const lw = leg === "npp" ? "net-put premium" : "net-call premium";
    return `Alert me when ${root} ${lw} moves at an unusual pace`;
  }
  // opt_0dte_spike
  const share = isNum(cond.share_pct) ? (cond.share_pct as number) : 55;
  return zh ? `当 ${root} 0DTE 占比超过 ${share}% 时提醒我` : `Alert me when ${root} 0DTE share tops ${share}%`;
}
