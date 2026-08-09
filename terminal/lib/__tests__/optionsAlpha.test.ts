import { describe, expect, it } from "vitest";
import { backendPath, fixtureFor, isValidF, r2Key, upstreamSourceOrder } from "@/lib/flowSource";
import { makeProphetT } from "@/components/prophet/prophetStrings";
import {
  OPTIONS_ALPHA_OUTCOME_HORIZONS,
  normalizeOptionsAlphaPayload,
  compactOptionsWatchlist,
  optionsAlphaDistinctFireDates,
  optionsAlphaEvidenceIsAged,
  optionsAlphaFlowDisplayValue,
  readinessStatus,
} from "@/components/prophet/optionsAlphaTypes";

const emptyOutcomeHorizons = () => Object.fromEntries(
  OPTIONS_ALPHA_OUTCOME_HORIZONS.map((horizon) => [horizon, {
    instrumented: false,
    authority: "none",
    books: [],
  }]),
);

const validRoot = () => ({
  schema: "options.prophet_shadow/v1",
  authority: "display_only",
  mode: "shadow",
  decision_at: null,
  available_at: "2026-08-08T12:00:00.123456Z",
  pit_provenance: { source_available_at: {} },
  selection_policy: { target_batch_size: {} },
  portfolio_boundary: {},
  opportunities: [],
  watchlist: [],
  readiness: { components: {}, gates: {} },
  direction: {},
  trajectory: {},
  forward_ledgers: { books: [], incremental_options_attribution: {} },
  accrual: {
    events: {
      authority: "display_only",
      books: [],
      timestamp_coverage: {},
    },
    outcomes: {
      separate_from_event_accrual: true,
      horizons: emptyOutcomeHorizons(),
    },
  },
  context_inputs: { konseki_market_memory: {} },
  macro_feedback: {},
  provenance: {},
});

const validLedgerBook = (engine_id = "plab_flow_leader") => ({
  engine_id,
  authority: "display_only",
  n_fires: 4,
  n_open: 1,
  n_distinct_fire_dates: 3,
  horizons: {
    h5: { n: 3 },
    h10: { n: 2 },
    h21: { n: 1 },
    h63: { n: 0 },
  },
});

describe("Options Alpha transport", () => {
  it("pins the shadow index to its own backend and R2 object", () => {
    expect(isValidF("options_prophet_idx")).toBe(true);
    expect(backendPath("options_prophet_idx")).toBe("/api/hub/options_prophet");
    expect(r2Key("options_prophet_idx")).toBe("options_prophet/index.json");
    expect(r2Key("options_prophet_idx")).not.toBe(r2Key("prophet_idx"));
    expect(upstreamSourceOrder("options_prophet_idx")).toEqual(["r2", "backend"]);
    expect(upstreamSourceOrder("prophet_idx")).toEqual(["backend", "r2"]);
  });

  it("serves a complete options-originated fixture", async () => {
    const payload = normalizeOptionsAlphaPayload(await fixtureFor("options_prophet_idx"));
    expect(payload?.schema).toBe("options.prophet_shadow/v1");
    expect(payload?.opportunities[0]?.symbol).toBe("NVDA");
    expect(payload?.opportunities[0]?.lane).toBe("flow_leader");
    expect(payload?.opportunities[0]?.source_signing_reliable).toBe(false);
    expect(payload?.opportunities[0]).toMatchObject({
      decision_at: null,
      available_at: "2026-08-07T21:19:00Z",
      execution: { status: "withheld", executable: false, stop: null, targets: [] },
    });
    expect(payload?.watchlist).toHaveLength(2);
    expect(payload?.watchlist[0]).toMatchObject({
      lanes: ["flow_leader"],
      signing_source: "tape",
      source_signing_reliable: false,
      observations: { gamma_regime: "long" },
      source_positions: { board_a: 2, board_b: null },
    });
    expect(payload?.watchlist[0]?.de_escalation.gamma_caution).toBe(true);
    expect(payload?.readiness.components.information).not.toBeNull();
    expect(payload?.forward_ledgers.books[0]).toMatchObject({
      name_en: "Flow Leader",
      name_zh: "资金流领先",
      h5_n: 0,
      h21_n: 0,
    });
    expect(payload).toMatchObject({
      decision_at: null,
      available_at: "2026-08-07T21:20:00.123456Z",
      pit_provenance: { clock: "UTC", promotion_ready: false },
      selection_policy: { style: "abstention_first", capacity_enforced_by_projection: false },
      portfolio_boundary: {
        operator_reviewed_issue_desk: false,
        issued_model_portfolio: false,
        managed_positions: false,
      },
      accrual: {
        events: { authority: "display_only", published_now: 1 },
        outcomes: { separate_from_event_accrual: true },
      },
      context_inputs: {
        konseki_market_memory: { connected: false, authority: "context_only", weight: 0 },
      },
    });
    expect(payload?.accrual.outcomes.horizons["5d"]).toMatchObject({
      instrumented: true,
      authority: "descriptive_only",
      pit_exact: false,
    });
  });
});

describe("Options Alpha authority fences", () => {
  it("never promotes direction, trajectory, or Macro weight from a payload flip", () => {
    const root = validRoot();
    const payload = normalizeOptionsAlphaPayload({
      ...root,
      opportunities: [],
      direction: { reliable: true, value: "up" },
      trajectory: { status: "ready", take_profit: 123, time_to_target: "2d", exit_window: "close" },
      forward_ledgers: {
        ...root.forward_ledgers,
        incremental_options_attribution: { available: true },
      },
      macro_feedback: { enabled: true, weight: 0.75, mode: "live" },
      watchlist: [{
        symbol: "aaa",
        decision_at: null,
        available_at: "2026-08-08T11:59:00Z",
        direction_reliable: true,
        de_escalation: {},
      }],
    });
    expect(payload?.direction).toMatchObject({ reliable: false, value: null });
    expect(payload?.trajectory).toMatchObject({ status: "withheld", take_profit: null, time_to_target: null, exit_window: null });
    expect(payload?.forward_ledgers.incremental_options_attribution.available).toBe(false);
    expect(payload?.macro_feedback).toMatchObject({ enabled: false, weight: 0 });
    expect(payload).toMatchObject({ authority: "display_only", mode: "shadow" });
    expect(payload?.watchlist[0]?.direction_reliable).toBe(false);
  });

  it("recognizes direct readiness without mistaking context for promotion", () => {
    expect(readinessStatus({ context_available: true, promotion_ready: false })).toBe("shadow_only");
    expect(readinessStatus({ pass: true })).toBe("ready");
    expect(readinessStatus({ ready: false, reason: "Forward sample is still accruing" })).toBe("building_history");
    expect(readinessStatus({ context_available: true, promotion_ready: false, ready: false, reason: "History is accruing" })).toBe("building_history");
    expect(readinessStatus({ ready: false, reason: "Required source is missing" })).toBe("blocked");
    expect(readinessStatus({ status: "ready", ready: false, reason: "Required source is missing" })).toBe("blocked");
    expect(readinessStatus({ status: "ready", pass: false, reason: "Sample is accruing" })).toBe("building_history");
    expect(readinessStatus({ status: "ready", available: false })).toBe("unavailable");
  });

  it("preserves producer order while dropping malformed symbol-less rows", () => {
    const payload = normalizeOptionsAlphaPayload({
      ...validRoot(),
      opportunities: [
        { symbol: "bbb", lane: "flow_leader", engine_id: "plab_flow_leader", authority: "display_only", decision_at: null, available_at: "2026-08-08T11:59:00Z" },
        { no_symbol: true, lane: "flow_leader", engine_id: "plab_flow_leader", authority: "display_only" },
        { symbol: "aaa", lane: "flow_washout", engine_id: "plab_flow_washout", authority: "display_only", decision_at: null, available_at: "2026-08-08T11:59:00Z" },
        { symbol: "fake", lane: "flow_leader", engine_id: "unregistered_engine", authority: "display_only" },
        { symbol: "crossed", lane: "flow_washout", engine_id: "plab_flow_leader", authority: "display_only" },
        { symbol: "live", lane: "flow_leader", engine_id: "plab_flow_leader", authority: "production" },
        {
          symbol: "reversed",
          lane: "flow_leader",
          engine_id: "plab_flow_leader",
          authority: "display_only",
          decision_at: "2026-08-08T12:01:00Z",
          available_at: "2026-08-08T12:00:00Z",
        },
      ],
      watchlist: [
        { order: 2, symbol: "ccc", decision_at: null, available_at: "2026-08-08T11:59:00Z", de_escalation: {} },
        { order: 1, symbol: "aaa", decision_at: null, available_at: "2026-08-08T11:59:00Z", de_escalation: {} },
      ],
    });
    expect(payload?.opportunities.map((row) => row.symbol)).toEqual(["BBB", "AAA"]);
    expect(payload?.watchlist.map((row) => row.symbol)).toEqual(["CCC", "AAA"]);
  });

  it("drops child rows with malformed or post-artifact PIT clocks", () => {
    const payload = normalizeOptionsAlphaPayload({
      ...validRoot(),
      opportunities: [
        { symbol: "OK", lane: "flow_leader", engine_id: "plab_flow_leader", authority: "display_only", decision_at: null, available_at: "2026-08-08T12:00:00Z" },
        { symbol: "BADDEC", lane: "flow_leader", engine_id: "plab_flow_leader", authority: "display_only", decision_at: "not-utc", available_at: "2026-08-08T12:00:00Z" },
        { symbol: "FUTURE", lane: "flow_leader", engine_id: "plab_flow_leader", authority: "display_only", decision_at: null, available_at: "2026-08-08T12:00:01Z" },
      ],
      watchlist: [
        { symbol: "WATCHOK", decision_at: null, available_at: "2026-08-08T12:00:00Z" },
        { symbol: "WATCHBAD", decision_at: "not-utc", available_at: "2026-08-08T12:00:00Z" },
        { symbol: "WATCHFUTURE", decision_at: null, available_at: "2026-08-08T12:00:01Z" },
      ],
    });
    expect(payload?.opportunities.map((row) => row.symbol)).toEqual(["OK"]);
    expect(payload?.watchlist.map((row) => row.symbol)).toEqual(["WATCHOK"]);
  });

  it("caps the rendered watchlist without re-ranking the upstream order", () => {
    const payload = normalizeOptionsAlphaPayload({
      ...validRoot(),
      watchlist: Array.from({ length: 15 }, (_, index) => ({
        order: index + 1,
        symbol: `T${index}`,
        decision_at: null,
        available_at: "2026-08-08T11:59:00Z",
        de_escalation: {},
      })),
    });
    const compact = compactOptionsWatchlist(payload?.watchlist ?? []);
    expect(compact).toHaveLength(12);
    expect(compact.map((row) => row.symbol)).toEqual(Array.from({ length: 12 }, (_, index) => `T${index}`));
  });

  it("fails closed on error envelopes and unreviewed schemas", () => {
    expect(normalizeOptionsAlphaPayload({ detail: "upstream failed" })).toBeNull();
    expect(normalizeOptionsAlphaPayload({ ...validRoot(), schema: "options.prophet_shadow/v2" })).toBeNull();
    expect(normalizeOptionsAlphaPayload({
      ...validRoot(),
      authority: "rank_macro",
    })).toBeNull();
    expect(normalizeOptionsAlphaPayload({
      ...validRoot(),
      mode: "live",
    })).toBeNull();
    expect(normalizeOptionsAlphaPayload({
      schema: "options.prophet_shadow/v1",
      mode: "shadow",
      decision_at: null,
      available_at: "2026-08-08T12:00:00Z",
    })).toBeNull();
    expect(normalizeOptionsAlphaPayload({ ...validRoot(), available_at: "2026-08-08 12:00" })).toBeNull();
    expect(normalizeOptionsAlphaPayload({ ...validRoot(), decision_at: "2026-08-08T12:00:00" })).toBeNull();
    expect(normalizeOptionsAlphaPayload({
      ...validRoot(),
      decision_at: "2026-08-08T12:01:00Z",
      available_at: "2026-08-08T12:00:00Z",
    })).toBeNull();
    const missingDecision = validRoot() as Record<string, unknown>;
    delete missingDecision.decision_at;
    expect(normalizeOptionsAlphaPayload(missingDecision)).toBeNull();
  });

  it("rejects incomplete v1 roots, missing canonical collections, and merged accrual", () => {
    for (const key of [
      "pit_provenance",
      "selection_policy",
      "portfolio_boundary",
      "readiness",
      "direction",
      "trajectory",
      "forward_ledgers",
      "accrual",
      "context_inputs",
      "macro_feedback",
      "provenance",
      "opportunities",
      "watchlist",
    ]) {
      const incomplete = validRoot() as Record<string, unknown>;
      delete incomplete[key];
      expect(normalizeOptionsAlphaPayload(incomplete), key).toBeNull();
    }

    const root = validRoot();
    expect(normalizeOptionsAlphaPayload({
      ...root,
      forward_ledgers: { incremental_options_attribution: {} },
    })).toBeNull();
    expect(normalizeOptionsAlphaPayload({
      ...root,
      accrual: { ...root.accrual, events: { ...root.accrual.events, books: undefined } },
    })).toBeNull();
    expect(normalizeOptionsAlphaPayload({
      ...root,
      accrual: {
        ...root.accrual,
        outcomes: { ...root.accrual.outcomes, separate_from_event_accrual: false },
      },
    })).toBeNull();
    const missingSeparation = { ...root.accrual.outcomes } as Record<string, unknown>;
    delete missingSeparation.separate_from_event_accrual;
    expect(normalizeOptionsAlphaPayload({
      ...root,
      accrual: { ...root.accrual, outcomes: missingSeparation },
    })).toBeNull();
    expect(normalizeOptionsAlphaPayload({
      ...root,
      accrual: {
        ...root.accrual,
        outcomes: {
          ...root.accrual.outcomes,
          horizons: {
            ...root.accrual.outcomes.horizons,
            "1h": { instrumented: false, authority: "none" },
          },
        },
      },
    })).toBeNull();
  });

  it("does not manufacture accrual totals from absent or malformed books", () => {
    const root = validRoot();
    const withOutcomeBooks = (books: unknown[]) => normalizeOptionsAlphaPayload({
      ...root,
      accrual: {
        ...root.accrual,
        outcomes: {
          ...root.accrual.outcomes,
          horizons: {
            ...root.accrual.outcomes.horizons,
            "5d": {
              instrumented: true,
              authority: "descriptive_only",
              books,
            },
          },
        },
      },
    });

    const governed = withOutcomeBooks([
      { engine_id: "plab_flow_leader", n: 0 },
      { engine_id: "plab_flow_washout", n: 3 },
    ]);
    expect(governed?.accrual.outcomes.horizons["5d"]).toMatchObject({
      instrumented: true,
      authority: "descriptive_only",
      books: [{ n: 0 }, { n: 3 }],
    });

    for (const books of [
      [],
      [{ engine_id: "plab_flow_leader" }],
      [{ engine_id: "plab_flow_leader", n: -1 }],
      [{ engine_id: "plab_flow_leader", n: 1.5 }],
      [{ engine_id: "plab_flow_leader", n: Number.NaN }],
      [{ engine_id: "unknown", n: 2 }],
      [{ engine_id: "plab_flow_leader", n: 2 }, { engine_id: "unknown", n: 2 }],
      [{ engine_id: "plab_flow_leader", n: 2 }, { engine_id: "plab_flow_leader", n: 3 }],
    ]) {
      expect(withOutcomeBooks(books)?.accrual.outcomes.horizons["5d"]).toMatchObject({
        instrumented: false,
        authority: "none",
        books: [],
      });
    }

    const withEventBooks = (books: unknown[]) => normalizeOptionsAlphaPayload({
      ...root,
      accrual: {
        ...root.accrual,
        events: { ...root.accrual.events, books },
      },
    })?.accrual.events ?? null;
    expect(optionsAlphaDistinctFireDates(withEventBooks([]))).toBeNull();
    expect(optionsAlphaDistinctFireDates(withEventBooks([
      { engine_id: "plab_flow_leader", n_distinct_fire_dates: null },
    ]))).toBeNull();
    expect(optionsAlphaDistinctFireDates(withEventBooks([
      { engine_id: "plab_flow_leader", n_distinct_fire_dates: -1 },
    ]))).toBeNull();
    expect(optionsAlphaDistinctFireDates(withEventBooks([
      { engine_id: "plab_flow_leader", n_distinct_fire_dates: 1.5 },
    ]))).toBeNull();
    expect(optionsAlphaDistinctFireDates(withEventBooks([
      { engine_id: "plab_flow_leader", n_distinct_fire_dates: 0 },
      { engine_id: "plab_flow_washout", n_distinct_fire_dates: 2 },
    ]))).toBe(2);
    expect(optionsAlphaDistinctFireDates(withEventBooks([
      { engine_id: "plab_flow_leader", n_distinct_fire_dates: 2 },
      { engine_id: "unknown", n_distinct_fire_dates: 2 },
    ]))).toBeNull();
    expect(optionsAlphaDistinctFireDates(withEventBooks([
      { engine_id: "plab_flow_leader", n_distinct_fire_dates: 1 },
      { engine_id: "plab_flow_leader", n_distinct_fire_dates: 2 },
    ]))).toBeNull();
  });

  it("drops nested rows that cross their display-only authority fence", () => {
    const root = validRoot();
    const payload = normalizeOptionsAlphaPayload({
      ...root,
      opportunities: [
        { symbol: "OK", lane: "flow_leader", engine_id: "plab_flow_leader", authority: "display_only", decision_at: null, available_at: "2026-08-08T11:59:00Z" },
        { symbol: "NOAUTH", lane: "flow_leader", engine_id: "plab_flow_leader" },
        { symbol: "LIVE", lane: "flow_washout", engine_id: "plab_flow_washout", authority: "live" },
      ],
      forward_ledgers: {
        ...root.forward_ledgers,
        books: [
          {
            ...validLedgerBook(),
            horizons: {
              h5: { n_graded: 3 },
              h10: { n: 2 },
              h21: { n: 1 },
              h63: { n: 0 },
            },
          },
          { engine_id: "plab_flow_washout", authority: "ranking" },
          { engine_id: "unknown", authority: "display_only" },
        ],
      },
    });
    expect(payload?.opportunities.map((row) => row.symbol)).toEqual(["OK"]);
    expect(payload?.forward_ledgers.books).toHaveLength(1);
    expect(payload?.forward_ledgers.books[0]).toMatchObject({
      engine_id: "plab_flow_leader",
      authority: "display_only",
      h5_n: 3,
    });
  });

  it("exposes only uniquely governed forward ledger books with integer counts", () => {
    const root = validRoot();
    const booksFor = (books: unknown[]) => normalizeOptionsAlphaPayload({
      ...root,
      forward_ledgers: { ...root.forward_ledgers, books },
    })?.forward_ledgers.books;

    expect(booksFor([
      validLedgerBook(),
      validLedgerBook("plab_flow_washout"),
    ])).toHaveLength(2);

    const base = validLedgerBook();
    for (const malformed of [
      { ...base, n_fires: -1 },
      { ...base, n_open: 1.5 },
      { ...base, n_distinct_fire_dates: Number.NaN },
      { ...base, horizons: { ...base.horizons, h10: { n: -1 } } },
      { ...base, horizons: { ...base.horizons, h63: { n: 1.5 } } },
      { ...base, horizons: { h5: { n: 3 }, h10: { n: 2 }, h21: { n: 1 } } },
      { ...base, horizons: { ...base.horizons, h99: { n: -1 } } },
    ]) {
      expect(booksFor([malformed])).toEqual([]);
      expect(booksFor([validLedgerBook("plab_flow_washout"), malformed])?.map((book) => book.engine_id))
        .toEqual(["plab_flow_washout"]);
    }

    expect(booksFor([{
      engine_id: "plab_flow_leader",
      authority: "display_only",
      n_fires: 2,
      n_open: 1,
      n_distinct_fire_dates: 2,
      h5_n: 1,
      h21_n: 0,
    }])).toMatchObject([{ h5_n: 1, h21_n: 0 }]);

    expect(booksFor([
      validLedgerBook(),
      { ...validLedgerBook(), n_fires: 5 },
      validLedgerBook("plab_flow_washout"),
    ])).toEqual([]);
  });

  it("preserves transport staleness for an explicit UI warning", () => {
    const payload = normalizeOptionsAlphaPayload({
      ...validRoot(),
      stale: true,
      stale_reason: "upstream refresh failed",
    });
    expect(payload).toMatchObject({ stale: true, stale_reason: "upstream refresh failed" });
    expect(optionsAlphaEvidenceIsAged(
      "2026-08-10T12:00:00Z",
      Date.parse("2026-08-11T18:00:01Z"),
    )).toBe(true);
    expect(optionsAlphaEvidenceIsAged(
      "2026-08-10T12:00:00Z",
      Date.parse("2026-08-11T17:59:59Z"),
    )).toBe(false);
    expect(optionsAlphaEvidenceIsAged(
      "2026-08-07T21:00:00Z",
      Date.parse("2026-08-10T15:00:00Z"),
    )).toBe(false);
    expect(optionsAlphaEvidenceIsAged(
      "2026-08-08T12:10:01Z",
      Date.parse("2026-08-08T12:00:00Z"),
    )).toBe(true);
  });

  it("removes an unreliable signed-flow direction while preserving reliable flow", () => {
    expect(optionsAlphaFlowDisplayValue(-0.721, false)).toBe(0.721);
    expect(optionsAlphaFlowDisplayValue(-0.721, null)).toBe(0.721);
    expect(optionsAlphaFlowDisplayValue(-0.721, true)).toBe(-0.721);
    expect(optionsAlphaFlowDisplayValue(null, false)).toBeNull();
  });

  it("accepts only production enum values and preserves signing reliability", () => {
    const payload = normalizeOptionsAlphaPayload({
      ...validRoot(),
      opportunities: [
        { symbol: "A", lane: "flow_leader", engine_id: "plab_flow_leader", authority: "display_only", decision_at: null, available_at: "2026-08-08T11:59:00Z" },
        { symbol: "OLD", lane: "A", engine_id: "plab_flow_leader", authority: "display_only" },
      ],
      watchlist: ["tape", "minute_tick", "minute_bar", "bar"].map((signing_source, index) => ({
        symbol: `B${index}`,
        decision_at: null,
        available_at: "2026-08-08T11:59:00Z",
        lanes: ["flow_leader", "flow_washout", "A"],
        source_positions: { board_a: 3, board_b: 1 },
        fire_lanes: ["flow_washout", "B"],
        signing_source,
        source_signing_reliable: false,
        observations: { gamma_regime: "short" },
      })),
    });
    expect(payload?.opportunities.map((row) => row.symbol)).toEqual(["A"]);
    expect(payload?.watchlist[0]).toMatchObject({
      lanes: ["flow_leader", "flow_washout"],
      fire_lanes: ["flow_washout"],
      signing_source: "tape",
      source_signing_reliable: false,
      decision_at: null,
      available_at: "2026-08-08T11:59:00Z",
      source_positions: { board_a: 3, board_b: 1 },
      observations: { gamma_regime: "short" },
    });
    expect(payload?.watchlist.map((row) => row.signing_source))
      .toEqual(["tape", "minute_tick", "minute_bar", "bar"]);

    const en = makeProphetT("en");
    const zh = makeProphetT("zh");
    expect([
      en("optionsLaneFlowLeader"),
      en("optionsLaneFlowWashout"),
      en("optionsSigningMinuteTick"),
      en("optionsSigningMinuteBar"),
      en("optionsSigningTape"),
      en("optionsSigningBar"),
    ]).toEqual(["Flow Leader", "Flow Washout", "Minute tick", "Minute bar", "Tape only", "Bar only"]);
    expect([zh("optionsLaneFlowLeader"), zh("optionsLaneFlowWashout"), zh("optionsGammaShort")])
      .toEqual(["资金流领先", "资金流洗盘", "短伽马"]);
  });

  it("hard-fences portfolio, execution, outcome, and Konseki authority flips", () => {
    const root = validRoot();
    const payload = normalizeOptionsAlphaPayload({
      ...root,
      portfolio_boundary: {
        current_stage: "live_portfolio",
        operator_reviewed_issue_desk: true,
        issued_model_portfolio: true,
        managed_positions: true,
      },
      opportunities: [{
        symbol: "SAFE",
        lane: "flow_leader",
        engine_id: "plab_flow_leader",
        authority: "display_only",
        decision_at: null,
        available_at: "2026-08-08T11:59:00Z",
        execution: {
          status: "ready",
          executable: true,
          contract: { occ_symbol: "SAFE260101C00100000", strike: 100, expiry: "2026-01-01" },
          entry: { type: "limit", price: 2.5 },
          stop: 1,
          targets: [4],
          take_profit_management: "sell",
        },
      }],
      accrual: {
        ...root.accrual,
        events: {
          ...root.accrual.events,
          authority: "rank_macro",
          books: [{ engine_id: "plab_flow_leader", n_fires: 9 }],
        },
        outcomes: {
          ...root.accrual.outcomes,
          horizons: {
            ...root.accrual.outcomes.horizons,
            "5d": {
              instrumented: true,
              authority: "rank_macro",
              books: [{ engine_id: "plab_flow_leader", n: 9 }],
            },
          },
        },
      },
      context_inputs: {
        konseki_market_memory: {
          expected_schema: "konseki.market_memory/v1",
          connected: true,
          authority: "ranking",
          weight: 1,
          may_rank: true,
          may_gate: true,
          may_size: true,
          available_at: "2026-08-08T12:00:00Z",
          receipt: { memory_id: "unsafe", context_tags: ["risk-on"] },
        },
      },
    });
    expect(payload?.portfolio_boundary).toMatchObject({
      current_stage: null,
      operator_reviewed_issue_desk: false,
      issued_model_portfolio: false,
      managed_positions: false,
    });
    expect(payload?.opportunities[0]?.execution).toMatchObject({
      status: "withheld",
      executable: false,
      contract: { occ_symbol: null, right: null, strike: null, expiry: null },
      entry: { type: null, price: null, quote_at: null },
      stop: null,
      targets: [],
      take_profit_management: null,
    });
    expect(payload?.accrual.events).toBeNull();
    expect(payload?.accrual.outcomes.horizons["5d"]).toMatchObject({
      instrumented: false,
      authority: "none",
      books: [],
    });
    expect(payload?.context_inputs.konseki_market_memory).toMatchObject({
      connected: false,
      authority: "context_only",
      weight: 0,
      may_rank: false,
      may_gate: false,
      may_size: false,
      receipt: null,
    });
  });

  it("requires a complete, time-ordered Konseki receipt before calling it connected", () => {
    const contextRoot = {
      ...validRoot(),
      decision_at: "2026-08-08T12:02:00Z",
      available_at: "2026-08-08T12:03:00Z",
    };
    const baseContext = {
      expected_schema: "konseki.market_memory/v1",
      connected: true,
      authority: "context_only",
      weight: 0,
      may_rank: false,
      may_gate: false,
      may_size: false,
      decision_at: "2026-08-08T12:00:00Z",
      available_at: "2026-08-08T12:01:00Z",
      receipt: { memory_id: "km-1", context_tags: ["risk-on"] },
    };
    const connected = normalizeOptionsAlphaPayload({
      ...contextRoot,
      context_inputs: { konseki_market_memory: baseContext },
    });
    expect(connected?.context_inputs.konseki_market_memory).toMatchObject({
      connected: true,
      decision_at: "2026-08-08T12:00:00Z",
      available_at: "2026-08-08T12:01:00Z",
      receipt: { memory_id: "km-1" },
    });

    for (const unsafe of [
      { ...baseContext, decision_at: null },
      { ...baseContext, decision_at: "not-a-utc-clock" },
      { ...baseContext, available_at: "2026-08-08 12:01" },
      { ...baseContext, receipt: { memory_id: null, context_tags: [] } },
      {
        ...baseContext,
        decision_at: "2026-08-08T12:02:00Z",
        available_at: "2026-08-08T12:01:00Z",
      },
      { ...baseContext, available_at: "2026-08-08T12:02:01Z" },
    ]) {
      const payload = normalizeOptionsAlphaPayload({
        ...contextRoot,
        context_inputs: { konseki_market_memory: unsafe },
      });
      expect(payload?.context_inputs.konseki_market_memory).toMatchObject({
        connected: false,
        decision_at: null,
        available_at: null,
        receipt: null,
      });
    }

    const beyondRootAvailability = normalizeOptionsAlphaPayload({
      ...validRoot(),
      context_inputs: {
        konseki_market_memory: {
          ...baseContext,
          decision_at: "2026-08-08T12:00:00Z",
          available_at: "2026-08-08T12:00:01Z",
        },
      },
    });
    expect(beyondRootAvailability?.context_inputs.konseki_market_memory.connected).toBe(false);
  });
});
