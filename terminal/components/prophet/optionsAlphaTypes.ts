/**
 * Canonical display contract for the options-originated Prophet shadow lane.
 *
 * The browser does not infer picks, direction, trajectory, or Macro authority.
 * It only normalizes the producer's published evidence into absent-safe UI data.
 */

export type JsonRecord = Record<string, unknown>;

export const OPTIONS_ALPHA_SCHEMA = "options.prophet_shadow/v1";
export const OPTIONS_ALPHA_OUTCOME_HORIZONS = ["1h", "eod", "1d", "3d", "5d", "10d", "expiry"] as const;
const OPTIONS_ALPHA_ENGINES = new Set(["plab_flow_leader", "plab_flow_washout"]);
const OPTIONS_ALPHA_FIRE_LANES = new Set(["flow_leader", "flow_washout"]);
const OPTIONS_ALPHA_SIGNING_SOURCES = new Set(["tape", "minute_tick", "minute_bar", "bar"]);
const OPTIONS_ALPHA_GAMMA_REGIMES = new Set(["long", "short"]);
export const OPTIONS_ALPHA_WATCH_LIMIT = 12;
export const OPTIONS_ALPHA_FRESHNESS_HOURS = 30;
export const OPTIONS_ALPHA_CLOCK_SKEW_MINUTES = 5;

export type OptionsAlphaFireLane = "flow_leader" | "flow_washout";
export type OptionsAlphaWatchLane = OptionsAlphaFireLane;
export type OptionsAlphaSigningSource = "tape" | "minute_tick" | "minute_bar" | "bar";
export type OptionsAlphaGammaRegime = "long" | "short";
export type OptionsAlphaOutcomeHorizon = typeof OPTIONS_ALPHA_OUTCOME_HORIZONS[number];

export interface OptionsAlphaExecution {
  status: "withheld";
  executable: false;
  contract: {
    occ_symbol: null;
    right: null;
    strike: null;
    expiry: null;
  };
  entry: {
    type: null;
    price: null;
    quote_at: null;
  };
  stop: null;
  targets: [];
  take_profit_management: null;
  reason: string | null;
}

export interface OptionsAlphaOpportunity {
  symbol: string;
  lane: OptionsAlphaFireLane;
  engine_id: string;
  source_rank: number | null;
  fire_date: string | null;
  decision_at: string | null;
  available_at: string | null;
  sector: string | null;
  close_at_fire: number | null;
  why: string[];
  signing_source: OptionsAlphaSigningSource | null;
  source_signing_reliable: boolean;
  authority: "display_only";
  direction_reliable: false;
  execution: OptionsAlphaExecution;
}

export interface OptionsAlphaObservations {
  recurrence_count: number | null;
  net_prem_norm_abs: number | null;
  flow_z: number | null;
  days_since_inflection: number | null;
  oi_confirmed: boolean | null;
  zerodte_dominated: boolean | null;
  gamma_regime: OptionsAlphaGammaRegime | null;
  K_a: number | null;
  n_avail_a: number | null;
  K_b: number | null;
  n_avail_b: number | null;
}

export interface OptionsAlphaWatchCandidate {
  order: number | null;
  symbol: string;
  decision_at: string | null;
  available_at: string | null;
  lanes: OptionsAlphaWatchLane[];
  source_positions: {
    board_a: number | null;
    board_b: number | null;
  };
  fire_lanes: OptionsAlphaFireLane[];
  signing_source: OptionsAlphaSigningSource | null;
  source_signing_reliable: boolean | null;
  direction_reliable: false;
  observations: OptionsAlphaObservations;
  de_escalation: JsonRecord;
}

export interface ReadinessNode extends JsonRecord {
  status?: string;
  reason?: string;
  note?: string;
  available?: boolean;
  ready?: boolean;
  pass?: boolean;
  context_available?: boolean;
  promotion_ready?: boolean;
}

export interface OptionsAlphaReadiness {
  components: {
    information: ReadinessNode | null;
    positioning: ReadinessNode | null;
    execution: ReadinessNode | null;
    flow_leaders: ReadinessNode | null;
    pick_lab: ReadinessNode | null;
    signed_flow: ReadinessNode | null;
    flow_forward_ledgers: ReadinessNode | null;
  };
  gates: {
    source_freshness: ReadinessNode | null;
    source_alignment: ReadinessNode | null;
    signing: ReadinessNode | null;
    forward_sample: ReadinessNode | null;
    trajectory_calibration: ReadinessNode | null;
  };
}

export interface ForwardLedgerBook extends JsonRecord {
  engine_id: string;
  name_en: string | null;
  name_zh: string | null;
  n_fires: number;
  n_open: number;
  h5_n: number;
  h21_n: number;
  n_distinct_fire_dates: number;
  months_span: number | null;
  status: string | null;
  authority: "display_only";
}

export interface OptionsAlphaPitProvenance {
  clock: "UTC" | null;
  decision_at_required_for_issued_portfolio: boolean;
  decision_at_status: string | null;
  available_at_status: string | null;
  source_available_at: {
    flow_leaders: string | null;
    pick_lab: string | null;
  };
  promotion_ready: false;
  reason: string | null;
}

export interface OptionsAlphaSelectionPolicy {
  style: "abstention_first" | null;
  stage: string | null;
  target_batch_size: { min: number | null; max: number | null };
  cadence: string | null;
  abstention_allowed: boolean;
  capacity_enforced_by_projection: false;
  capacity_breach: boolean;
  reason: string | null;
}

export interface OptionsAlphaPortfolioBoundary {
  current_stage: "research_fire" | null;
  operator_reviewed_issue_desk: false;
  issued_model_portfolio: false;
  managed_positions: false;
  reason: string | null;
}

export interface OptionsAlphaEventAccrualBook {
  engine_id: string;
  n_fires: number | null;
  n_open: number | null;
  n_distinct_fire_dates: number | null;
}

export interface OptionsAlphaOutcomeBook {
  engine_id: string;
  n: number | null;
  status: string | null;
}

export interface OptionsAlphaOutcomeAccrual {
  instrumented: boolean;
  status: string | null;
  authority: "descriptive_only" | "none";
  books: OptionsAlphaOutcomeBook[];
  reason: string | null;
  pit_exact: boolean | null;
}

export interface OptionsAlphaAccrual {
  events: {
    unit: string | null;
    books: OptionsAlphaEventAccrualBook[];
    published_now: number | null;
    timestamp_coverage: {
      n_published: number | null;
      n_exact_decision_at: number | null;
      n_exact_available_at: number | null;
    };
    authority: "display_only";
  } | null;
  outcomes: {
    unit: string | null;
    separate_from_event_accrual: boolean;
    horizons: Record<OptionsAlphaOutcomeHorizon, OptionsAlphaOutcomeAccrual>;
  };
}

export interface OptionsAlphaKonsekiContext {
  expected_schema: "konseki.market_memory/v1";
  connected: boolean;
  authority: "context_only";
  weight: 0;
  may_rank: false;
  may_gate: false;
  may_size: false;
  decision_at: string | null;
  available_at: string | null;
  receipt: {
    memory_id: string | null;
    context_tags: string[];
  } | null;
  reason: string | null;
}

export interface OptionsAlphaPayload {
  schema: string | null;
  as_of: string | null;
  built_at: string | null;
  decision_at: string | null;
  available_at: string;
  pit_provenance: OptionsAlphaPitProvenance | null;
  authority: "display_only";
  mode: "shadow";
  stale: boolean;
  stale_reason: string | null;
  selection_policy: OptionsAlphaSelectionPolicy;
  portfolio_boundary: OptionsAlphaPortfolioBoundary;
  opportunities: OptionsAlphaOpportunity[];
  watchlist: OptionsAlphaWatchCandidate[];
  readiness: OptionsAlphaReadiness;
  direction: {
    reliable: false;
    value: null;
    bar_sources_reliable: boolean | null;
    tape_sources_reliable: boolean | null;
    reason: string | null;
  };
  trajectory: {
    status: string | null;
    take_profit: null;
    time_to_target: null;
    exit_window: null;
    reason: string | null;
  };
  forward_ledgers: {
    source_artifact: string | null;
    books: ForwardLedgerBook[];
    incremental_options_attribution: {
      available: false;
      reason: string | null;
    };
  };
  accrual: OptionsAlphaAccrual;
  context_inputs: {
    konseki_market_memory: OptionsAlphaKonsekiContext;
  };
  macro_feedback: {
    enabled: boolean;
    weight: number | null;
    mode: string | null;
    reason: string | null;
  };
  provenance: JsonRecord;
  method_note: string | null;
}

function isRecord(value: unknown): value is JsonRecord {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function record(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function number(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function nonnegativeInteger(value: unknown): number | null {
  const parsed = number(value);
  return parsed != null && Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function bool(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function utcTimestamp(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const candidate = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(candidate)) return null;
  return Number.isFinite(Date.parse(candidate)) ? candidate : null;
}

function hasRequiredV1Shape(root: JsonRecord): boolean {
  const requiredRootObjects = [
    root.pit_provenance,
    root.selection_policy,
    root.portfolio_boundary,
    root.readiness,
    root.direction,
    root.trajectory,
    root.forward_ledgers,
    root.accrual,
    root.context_inputs,
    root.macro_feedback,
    root.provenance,
  ];
  if (
    !Array.isArray(root.opportunities)
    || !Array.isArray(root.watchlist)
    || requiredRootObjects.some((item) => !isRecord(item))
  ) return false;

  const pit = record(root.pit_provenance);
  const selection = record(root.selection_policy);
  const readiness = record(root.readiness);
  const forward = record(root.forward_ledgers);
  const accrualRoot = record(root.accrual);
  const events = record(accrualRoot.events);
  const outcomes = record(accrualRoot.outcomes);
  const horizons = record(outcomes.horizons);
  const contextInputs = record(root.context_inputs);
  if (
    !isRecord(pit.source_available_at)
    || !isRecord(selection.target_batch_size)
    || !isRecord(readiness.components)
    || !isRecord(readiness.gates)
    || !Array.isArray(forward.books)
    || !isRecord(forward.incremental_options_attribution)
    || !Array.isArray(events.books)
    || !isRecord(events.timestamp_coverage)
    || !isRecord(outcomes.horizons)
    || !isRecord(contextInputs.konseki_market_memory)
  ) return false;

  return OPTIONS_ALPHA_OUTCOME_HORIZONS.every((horizon) => {
    const cell = horizons[horizon];
    return isRecord(cell) && Array.isArray(cell.books);
  });
}

export function optionsAlphaDistinctFireDates(
  events: OptionsAlphaAccrual["events"],
): number | null {
  if (!events || events.books.length === 0) return null;
  if (new Set(events.books.map((book) => book.engine_id)).size !== events.books.length) return null;
  const counts = events.books.map((book) => book.n_distinct_fire_dates);
  if (counts.some((count) => count == null || !Number.isInteger(count) || count < 0)) return null;
  return counts.reduce<number>((sum, count) => sum + (count as number), 0);
}

export function optionsAlphaEvidenceIsAged(
  availableAt: string,
  nowMs = Date.now(),
): boolean {
  const availableMs = Date.parse(availableAt);
  if (!Number.isFinite(availableMs)) return true;
  if (availableMs - nowMs > OPTIONS_ALPHA_CLOCK_SKEW_MINUTES * 60 * 1000) return true;
  if (nowMs <= availableMs) return false;
  if (nowMs - availableMs > 7 * 24 * 60 * 60 * 1000) return true;

  // The producer is an EOD research artifact. Count UTC weekday time so a
  // Friday close does not become misleadingly stale during the weekend. The
  // server-side source gates remain the authority for exchange holidays.
  let cursor = availableMs;
  let elapsedWeekdayMs = 0;
  while (cursor < nowMs) {
    const cursorDate = new Date(cursor);
    const nextMidnight = Date.UTC(
      cursorDate.getUTCFullYear(),
      cursorDate.getUTCMonth(),
      cursorDate.getUTCDate() + 1,
    );
    const segmentEnd = Math.min(nowMs, nextMidnight);
    const day = cursorDate.getUTCDay();
    if (day !== 0 && day !== 6) elapsedWeekdayMs += segmentEnd - cursor;
    cursor = segmentEnd;
  }
  return elapsedWeekdayMs > OPTIONS_ALPHA_FRESHNESS_HOURS * 60 * 60 * 1000;
}

export function optionsAlphaFlowDisplayValue(
  value: number | null,
  sourceSigningReliable: boolean | null,
): number | null {
  if (value == null) return null;
  return sourceSigningReliable === true ? value : Math.abs(value);
}

function strings(value: unknown): string[] {
  if (typeof value === "string" && value.trim()) return [value.trim()];
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => typeof item === "string" && item.trim() ? [item.trim()] : []);
}

function enumText<T extends string>(value: unknown, allowed: Set<string>): T | null {
  const parsed = text(value);
  return parsed && allowed.has(parsed) ? parsed as T : null;
}

function enumStrings<T extends string>(value: unknown, allowed: Set<string>): T[] {
  return strings(value).flatMap((item) => allowed.has(item) ? [item as T] : []);
}

function readinessNode(value: unknown): ReadinessNode | null {
  const item = record(value);
  return Object.keys(item).length ? item as ReadinessNode : null;
}

function withheldExecution(value: unknown): OptionsAlphaExecution {
  const item = record(value);
  return {
    // Wave 0 cannot become executable through a payload flip. Promotion needs
    // a new reviewed schema and a separate contract-selection lifecycle.
    status: "withheld",
    executable: false,
    contract: { occ_symbol: null, right: null, strike: null, expiry: null },
    entry: { type: null, price: null, quote_at: null },
    stop: null,
    targets: [],
    take_profit_management: null,
    reason: text(item.reason),
  };
}

function opportunity(value: unknown, rootAvailableAt: string): OptionsAlphaOpportunity | null {
  const item = record(value);
  const symbol = text(item.symbol);
  const engineId = text(item.engine_id);
  const lane = enumText<OptionsAlphaFireLane>(item.lane, OPTIONS_ALPHA_FIRE_LANES);
  const decisionAt = utcTimestamp(item.decision_at);
  const availableAt = utcTimestamp(item.available_at);
  // A v1 opportunity is a Pick Lab-admitted fire, not an arbitrary row that
  // happens to have a ticker. Unknown/missing engines fail closed as watch-only
  // upstream evidence and never render as an Options Alpha fire.
  if (
    !symbol
    || !engineId
    || !OPTIONS_ALPHA_ENGINES.has(engineId)
    || !lane
    || (engineId === "plab_flow_leader" && lane !== "flow_leader")
    || (engineId === "plab_flow_washout" && lane !== "flow_washout")
    || text(item.authority) !== "display_only"
    || !("decision_at" in item)
    || !availableAt
    || (item.decision_at !== null && !decisionAt)
    || (decisionAt != null && Date.parse(availableAt) < Date.parse(decisionAt))
    || Date.parse(availableAt) > Date.parse(rootAvailableAt)
  ) return null;
  return {
    symbol: symbol.toUpperCase(),
    lane,
    engine_id: engineId,
    source_rank: number(item.source_rank),
    fire_date: text(item.fire_date),
    decision_at: decisionAt,
    available_at: availableAt,
    sector: text(item.sector),
    close_at_fire: number(item.close_at_fire),
    why: strings(item.why),
    signing_source: enumText<OptionsAlphaSigningSource>(
      item.signing_source,
      OPTIONS_ALPHA_SIGNING_SOURCES,
    ),
    source_signing_reliable: item.source_signing_reliable === true,
    authority: "display_only",
    // Direction is intentionally unavailable on this lane even if a malformed
    // producer row claims otherwise. Publishing a direction would cross the fence.
    direction_reliable: false,
    execution: withheldExecution(item.execution),
  };
}

function observations(value: unknown): OptionsAlphaObservations {
  const item = record(value);
  return {
    recurrence_count: number(item.recurrence_count),
    net_prem_norm_abs: number(item.net_prem_norm_abs),
    flow_z: number(item.flow_z),
    days_since_inflection: number(item.days_since_inflection),
    oi_confirmed: bool(item.oi_confirmed),
    zerodte_dominated: bool(item.zerodte_dominated),
    gamma_regime: enumText<OptionsAlphaGammaRegime>(item.gamma_regime, OPTIONS_ALPHA_GAMMA_REGIMES),
    K_a: number(item.K_a),
    n_avail_a: number(item.n_avail_a),
    K_b: number(item.K_b),
    n_avail_b: number(item.n_avail_b),
  };
}

function watchCandidate(value: unknown, rootAvailableAt: string): OptionsAlphaWatchCandidate | null {
  const item = record(value);
  const symbol = text(item.symbol);
  const decisionAt = utcTimestamp(item.decision_at);
  const availableAt = utcTimestamp(item.available_at);
  if (
    !symbol
    || !("decision_at" in item)
    || !availableAt
    || (item.decision_at !== null && !decisionAt)
    || (decisionAt != null && Date.parse(availableAt) < Date.parse(decisionAt))
    || Date.parse(availableAt) > Date.parse(rootAvailableAt)
  ) return null;
  return {
    order: number(item.order),
    symbol: symbol.toUpperCase(),
    decision_at: decisionAt,
    available_at: availableAt,
    lanes: enumStrings<OptionsAlphaWatchLane>(item.lanes, OPTIONS_ALPHA_FIRE_LANES),
    source_positions: {
      board_a: number(record(item.source_positions).board_a),
      board_b: number(record(item.source_positions).board_b),
    },
    fire_lanes: enumStrings<OptionsAlphaFireLane>(item.fire_lanes, OPTIONS_ALPHA_FIRE_LANES),
    signing_source: enumText<OptionsAlphaSigningSource>(item.signing_source, OPTIONS_ALPHA_SIGNING_SOURCES),
    source_signing_reliable: bool(item.source_signing_reliable),
    direction_reliable: false,
    observations: observations(item.observations),
    de_escalation: record(item.de_escalation),
  };
}

function ledgerBook(value: unknown): ForwardLedgerBook | null {
  const item = record(value);
  const engineId = text(item.engine_id);
  if (
    !engineId
    || !OPTIONS_ALPHA_ENGINES.has(engineId)
    || text(item.authority) !== "display_only"
  ) return null;
  const name = record(item.name);
  const nestedHorizons = isRecord(item.horizons) && Object.keys(item.horizons).length > 0
    ? item.horizons
    : null;
  const horizonN = (value: unknown): number | null => {
    if (typeof value === "number") return nonnegativeInteger(value);
    const row = record(value);
    for (const key of ["n", "n_graded", "n_closed", "count"] as const) {
      if (key in row) return nonnegativeInteger(row[key]);
    }
    return null;
  };
  let h5N: number | null;
  let h21N: number | null;
  if (nestedHorizons) {
    const requiredHorizons = ["h5", "h10", "h21", "h63"] as const;
    const parsedHorizons = Object.entries(nestedHorizons).map(([key, row]) => [key, horizonN(row)] as const);
    if (
      !requiredHorizons.every((key) => key in nestedHorizons)
      || parsedHorizons.some(([, count]) => count == null)
    ) return null;
    h5N = horizonN(nestedHorizons.h5);
    h21N = horizonN(nestedHorizons.h21);
  } else {
    // Preserve the reviewed legacy projection while applying the same count
    // invariant. New producer artifacts use the four nested horizon books.
    h5N = nonnegativeInteger(item.h5_n);
    h21N = nonnegativeInteger(item.h21_n);
  }
  const nFires = nonnegativeInteger(item.n_fires);
  const nOpen = nonnegativeInteger(item.n_open);
  const nDistinctFireDates = nonnegativeInteger(item.n_distinct_fire_dates);
  if (nFires == null || nOpen == null || nDistinctFireDates == null || h5N == null || h21N == null) {
    return null;
  }
  return {
    engine_id: engineId,
    name_en: text(item.name_en) ?? text(name.en),
    name_zh: text(item.name_zh) ?? text(name.zh),
    n_fires: nFires,
    n_open: nOpen,
    h5_n: h5N,
    h21_n: h21N,
    n_distinct_fire_dates: nDistinctFireDates,
    months_span: number(item.months_span),
    status: text(item.status),
    authority: "display_only",
  };
}

function pitProvenance(value: unknown): OptionsAlphaPitProvenance | null {
  const item = record(value);
  if (!Object.keys(item).length) return null;
  const sources = record(item.source_available_at);
  return {
    clock: text(item.clock) === "UTC" ? "UTC" : null,
    decision_at_required_for_issued_portfolio:
      bool(item.decision_at_required_for_issued_portfolio) === true,
    decision_at_status: text(item.decision_at_status),
    available_at_status: text(item.available_at_status),
    source_available_at: {
      flow_leaders: utcTimestamp(sources.flow_leaders),
      pick_lab: utcTimestamp(sources.pick_lab),
    },
    // No v1 receipt can promote itself into an issued portfolio.
    promotion_ready: false,
    reason: text(item.reason),
  };
}

function selectionPolicy(value: unknown): OptionsAlphaSelectionPolicy {
  const item = record(value);
  const batch = record(item.target_batch_size);
  return {
    style: text(item.style) === "abstention_first" ? "abstention_first" : null,
    stage: text(item.stage),
    target_batch_size: { min: number(batch.min), max: number(batch.max) },
    cadence: text(item.cadence),
    abstention_allowed: bool(item.abstention_allowed) === true,
    // The projection preserves every governed fire. It cannot quietly enforce
    // a future model-portfolio capacity policy in the browser.
    capacity_enforced_by_projection: false,
    capacity_breach: bool(item.capacity_breach) === true,
    reason: text(item.reason),
  };
}

function portfolioBoundary(value: unknown): OptionsAlphaPortfolioBoundary {
  const item = record(value);
  return {
    current_stage: text(item.current_stage) === "research_fire" ? "research_fire" : null,
    operator_reviewed_issue_desk: false,
    issued_model_portfolio: false,
    managed_positions: false,
    reason: text(item.reason),
  };
}

function eventAccrualBook(value: unknown): OptionsAlphaEventAccrualBook | null {
  const item = record(value);
  const engineId = text(item.engine_id);
  if (!engineId || !OPTIONS_ALPHA_ENGINES.has(engineId)) return null;
  return {
    engine_id: engineId,
    n_fires: nonnegativeInteger(item.n_fires),
    n_open: nonnegativeInteger(item.n_open),
    n_distinct_fire_dates: nonnegativeInteger(item.n_distinct_fire_dates),
  };
}

function outcomeBook(value: unknown): OptionsAlphaOutcomeBook | null {
  const item = record(value);
  const engineId = text(item.engine_id);
  const n = nonnegativeInteger(item.n);
  if (!engineId || !OPTIONS_ALPHA_ENGINES.has(engineId) || n == null) return null;
  return { engine_id: engineId, n, status: text(item.status) };
}

function outcomeAccrual(value: unknown): OptionsAlphaOutcomeAccrual {
  const item = record(value);
  const rawBooks = Array.isArray(item.books) ? item.books : [];
  const books = list(rawBooks, outcomeBook);
  const instrumented = bool(item.instrumented) === true
    && text(item.authority) === "descriptive_only"
    && rawBooks.length > 0
    && books.length === rawBooks.length
    && new Set(books.map((book) => book.engine_id)).size === books.length;
  return {
    instrumented,
    status: text(item.status),
    authority: instrumented ? "descriptive_only" : "none",
    books: instrumented ? books : [],
    reason: text(item.reason),
    pit_exact: bool(item.pit_exact),
  };
}

function accrual(value: unknown): OptionsAlphaAccrual {
  const item = record(value);
  const events = record(item.events);
  const outcomes = record(item.outcomes);
  const horizons = record(outcomes.horizons);
  const eventCoverage = record(events.timestamp_coverage);
  const eventAuthorityOk = text(events.authority) === "display_only";
  const rawEventBooks = Array.isArray(events.books) ? events.books : [];
  const parsedEventBooks = list(rawEventBooks, eventAccrualBook);
  return {
    events: eventAuthorityOk ? {
      unit: text(events.unit),
      books: parsedEventBooks.length === rawEventBooks.length ? parsedEventBooks : [],
      published_now: nonnegativeInteger(events.published_now),
      timestamp_coverage: {
        n_published: nonnegativeInteger(eventCoverage.n_published),
        n_exact_decision_at: nonnegativeInteger(eventCoverage.n_exact_decision_at),
        n_exact_available_at: nonnegativeInteger(eventCoverage.n_exact_available_at),
      },
      authority: "display_only",
    } : null,
    outcomes: {
      unit: text(outcomes.unit),
      separate_from_event_accrual: bool(outcomes.separate_from_event_accrual) === true,
      horizons: Object.fromEntries(
        OPTIONS_ALPHA_OUTCOME_HORIZONS.map((horizon) => [horizon, outcomeAccrual(horizons[horizon])]),
      ) as Record<OptionsAlphaOutcomeHorizon, OptionsAlphaOutcomeAccrual>,
    },
  };
}

function konsekiContext(
  value: unknown,
  rootDecisionAt: string | null,
  rootAvailableAt: string,
): OptionsAlphaKonsekiContext {
  const item = record(value);
  const decisionAt = utcTimestamp(item.decision_at);
  const availableAt = utcTimestamp(item.available_at);
  const receipt = record(item.receipt);
  const memoryId = text(receipt.memory_id);
  const connected = bool(item.connected) === true
    && text(item.expected_schema) === "konseki.market_memory/v1"
    && text(item.authority) === "context_only"
    && number(item.weight) === 0
    && bool(item.may_rank) === false
    && bool(item.may_gate) === false
    && bool(item.may_size) === false
    && decisionAt !== null
    && availableAt !== null
    && memoryId !== null
    && Date.parse(availableAt) >= Date.parse(decisionAt)
    && Date.parse(availableAt) <= Date.parse(rootAvailableAt)
    && (rootDecisionAt == null || Date.parse(availableAt) <= Date.parse(rootDecisionAt));
  return {
    expected_schema: "konseki.market_memory/v1",
    connected,
    authority: "context_only",
    weight: 0,
    may_rank: false,
    may_gate: false,
    may_size: false,
    decision_at: connected ? decisionAt : null,
    available_at: connected ? availableAt : null,
    receipt: connected ? {
      memory_id: memoryId,
      context_tags: strings(receipt.context_tags),
    } : null,
    reason: text(item.reason),
  };
}

function list<T>(value: unknown, parse: (item: unknown) => T | null): T[] {
  return Array.isArray(value) ? value.flatMap((item) => {
    const parsed = parse(item);
    return parsed == null ? [] : [parsed];
  }) : [];
}

function forwardLedgerBooks(value: unknown): ForwardLedgerBook[] {
  const books = list(value, ledgerBook);
  return new Set(books.map((book) => book.engine_id)).size === books.length ? books : [];
}

/** Parse the public artifact without manufacturing missing evidence. */
export function normalizeOptionsAlphaPayload(value: unknown): OptionsAlphaPayload | null {
  const root = record(value);
  const availableAt = utcTimestamp(root.available_at);
  const decisionAt = utcTimestamp(root.decision_at);
  const rootAccrual = record(root.accrual);
  const rootOutcomes = record(rootAccrual.outcomes);
  // Do not reinterpret an error envelope, stale predecessor, or future schema
  // as this reviewed display contract. A new schema needs an explicit parser.
  if (
    text(root.schema) !== OPTIONS_ALPHA_SCHEMA
    || text(root.authority) !== "display_only"
    || text(root.mode) !== "shadow"
    || !hasRequiredV1Shape(root)
    || !availableAt
    || !("decision_at" in root)
    || (root.decision_at !== null && !decisionAt)
    || (decisionAt != null && Date.parse(availableAt) < Date.parse(decisionAt))
    || bool(rootOutcomes.separate_from_event_accrual) !== true
  ) return null;
  const readiness = record(root.readiness);
  const components = record(readiness.components);
  const gates = record(readiness.gates);
  const direction = record(root.direction);
  const trajectory = record(root.trajectory);
  const forward = record(root.forward_ledgers);
  const attribution = record(forward.incremental_options_attribution);
  const feedback = record(root.macro_feedback);
  const contextInputs = record(root.context_inputs);

  return {
    schema: text(root.schema),
    as_of: text(root.as_of),
    built_at: text(root.built_at),
    decision_at: decisionAt,
    available_at: availableAt,
    pit_provenance: pitProvenance(root.pit_provenance),
    // The first shipped lane is permanently display/shadow on the client. Any
    // future authority promotion must update this reviewed contract explicitly.
    authority: "display_only",
    mode: "shadow",
    stale: bool(root.stale) === true || optionsAlphaEvidenceIsAged(availableAt),
    stale_reason: text(root.stale_reason) ?? text(root.staleReason),
    selection_policy: selectionPolicy(root.selection_policy),
    portfolio_boundary: portfolioBoundary(root.portfolio_boundary),
    opportunities: list(root.opportunities, (item) => opportunity(item, availableAt)),
    watchlist: list(root.watchlist, (item) => watchCandidate(item, availableAt)),
    readiness: {
      components: {
        information: readinessNode(components.information),
        positioning: readinessNode(components.positioning),
        execution: readinessNode(components.execution),
        flow_leaders: readinessNode(components.flow_leaders),
        pick_lab: readinessNode(components.pick_lab),
        signed_flow: readinessNode(components.signed_flow),
        flow_forward_ledgers: readinessNode(components.flow_forward_ledgers),
      },
      gates: {
        source_freshness: readinessNode(gates.source_freshness),
        source_alignment: readinessNode(gates.source_alignment),
        signing: readinessNode(gates.signing),
        forward_sample: readinessNode(gates.forward_sample),
        trajectory_calibration: readinessNode(gates.trajectory_calibration),
      },
    },
    direction: {
      reliable: false,
      value: null,
      bar_sources_reliable: bool(direction.bar_sources_reliable),
      tape_sources_reliable: bool(direction.tape_sources_reliable),
      reason: text(direction.reason),
    },
    trajectory: {
      status: "withheld",
      take_profit: null,
      time_to_target: null,
      exit_window: null,
      reason: text(trajectory.reason),
    },
    forward_ledgers: {
      source_artifact: text(forward.source_artifact),
      books: forwardLedgerBooks(forward.books),
      incremental_options_attribution: {
        // Incremental attribution is not a v1 authority surface. A producer
        // flip must not let this reviewed shadow client imply otherwise.
        available: false,
        reason: text(attribution.reason),
      },
    },
    accrual: accrual(root.accrual),
    context_inputs: {
      konseki_market_memory: konsekiContext(
        contextInputs.konseki_market_memory,
        decisionAt,
        availableAt,
      ),
    },
    macro_feedback: {
      // This first UI contract is intentionally hard-fenced. A later authority
      // promotion requires a reviewed client contract, not a surprise payload flip.
      enabled: false,
      weight: 0,
      mode: text(feedback.mode),
      reason: text(feedback.reason),
    },
    provenance: record(root.provenance),
    method_note: text(root.method_note),
  };
}

/** Human-readable evidence from a readiness node; null remains honestly absent. */
export function readinessDetail(node: ReadinessNode | null): string | null {
  if (!node) return null;
  return text(node.reason) ?? text(node.note) ?? text(node.detail) ?? text(node.message);
}

export function readinessStatus(node: ReadinessNode | null): string | null {
  if (!node) return null;
  // Machine-readable booleans are the authority boundary. A contradictory
  // producer label such as {status:"ready", ready:false} must fail closed.
  if (node.available === false || node.context_available === false) return "unavailable";
  if (node.ready === false || node.pass === false) {
    const why = `${text(node.reason) ?? ""} ${text(node.note) ?? ""}`.toLowerCase();
    return /sample|accru|history|calibrat|pending/.test(why) ? "building_history" : "blocked";
  }
  if (node.context_available === true && node.promotion_ready === false) return "shadow_only";
  if (node.promotion_ready === false) return "shadow_only";
  const explicit = text(node.status);
  if (explicit) return explicit;
  if (node.ready === true || node.pass === true) return "ready";
  if (node.available === true || node.context_available === true) return "measured";
  return null;
}

/** Preserve upstream rank/order while keeping the Prophet desk compact. */
export function compactOptionsWatchlist(
  rows: OptionsAlphaWatchCandidate[],
  limit = OPTIONS_ALPHA_WATCH_LIMIT,
): OptionsAlphaWatchCandidate[] {
  return rows.slice(0, Math.max(0, Math.trunc(limit)));
}
