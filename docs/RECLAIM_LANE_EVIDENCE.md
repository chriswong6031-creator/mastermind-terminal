# RECLAIM re-entry lane — panel evidence (2026-07-15) + scored promotion (2026-07-16)

## Why this lane exists

The 2026-07-15 Mag7 diagnosis (owner directive) verified two structural holes in the
GC-v2 entry grammar — both instances of **one-shot gate evaluation**: a gate verdict is
computed on the cross bar and never re-visited, so a point-in-time-correct veto becomes a
permanent miss.

1. **Trend-reclaim hole** — after a SELL there are exactly two paths back to a BUY (fresh
   3D RSI-MACD cross with RSI<65 *on the cross bar*, or the 3-bar REBUY window). Both are
   structurally closed on a V-recovery. AAPL: the only bull cross of the Jun–Jul rally
   printed on the 2026-07-13 bar with 3D RSI 69.5 → killed by the (validated) RSI gate;
   price +8.6% from the Jun-8 SELL with zero green markers.
2. **Block-repair hole** — `bear_block`'s three legs were factually TRUE when META's
   2026-07-06 BUY fired @603 (200d ≈ 640). The legs repaired **one 3D bar later**
   (2026-07-09 @657, price +13% since) and the engine had no re-fire path.

The fix is a **repair grammar**, not gate loosening: `confluence_v2.reclaim_events`
emits `RECLAIM` events (kinds `reclaim` / `block_repair`), debounced
(`RECLAIM_DEBOUNCE_BARS=4` — without it AAPL re-fires 2026-06-10, one bar after the SELL,
and rides the −9% drawdown the SELL correctly dodged; `REPAIR_WINDOW_BARS=8`).
All validated gates (`BUY_RSI_MAX=65`, `bear_block`, `REV_BARS`, `CONF_W`, no-cut exits)
stay verbatim; `confluence.py` is untouched.

## Ship tier

**Display lane** (this PR): `RECLAIM` markers with `scored:false`,
`quality: reclaim|block_repair` — excluded from the scored position walk
(`contracts._state`), the manifest verdict, and wr/pf. The UI renders them hollow
("Re-entry", never the solid BUY star) with an explicit "unscored" annotation.

## Panel run (gates fixed in `signal_layer/reclaim_lab.py` before the run)

`python3 -m signal_layer.reclaim_lab` — full-IPO-history bars for every manifest
verdict-carrying name (n=91), `backtest.run_backtest(use_reclaim_entry=True)` vs the
GC-v2 no-cut baseline. Exit stream byte-identical in both arms.

| Gate | Threshold | Result | Pass |
|---|---|---|---|
| G1 expectancy | pooled reclaim-trade exp > 0 AND median per-name ≥ 0 | **+11.3%** pooled / **+6.3%** median (n=1,220 trades) | ✅ |
| G2 non-inferiority | median variant/baseline total-return ratio ≥ 0.95× | **1.33×** | ✅ |
| G3 2022 bull-trap falsifier | 2022-entered reclaim trades exp > −2% | **−1.5%** (n=74) | ✅ |
| G4 breadth + drawdown | ≥55% names improved; median max_dd delta ≤ +2pp | **80.2%**; dd **−0.4pp** (shallower) | ✅ |
| G5 sample | ≥150 reclaim trades | **1,220** | ✅ |

Median per-name WR 56.1% → 58.6%. 90/91 names produced reclaim trades (median 13).

**Verdict: PROMOTE-CANDIDATE** — the lane is eligible for scored promotion.

## Scored promotion — SHIPPED 2026-07-16

### Decay-instrument exclusion (precondition)

Trend-reclaim semantics assume a spot asset. On decay instruments the price path is
dominated by structural drift (daily-rebalance leverage/inverse compounding, futures
roll), so "close back above the sell level" is a statement about the decay schedule, not
the trend. The exclusion is a symbol **class**, not a loser list — leveraged long is
excluded alongside inverse (same rebalance arithmetic), futures rollers alongside both:

- Rule: `confluence_v2.reclaim_excluded` (curated flagship set + fund-name pattern for
  future additions; the name rule never applies to equities).
- Manifest classification field: `build_polygon_universe` stamps `cls: "decay"` on the
  row, so downstream consumers read a field instead of keeping private lists.
- Excluded (panel): BITO, SOXL, SOXS, SPXL, SQQQ, TQQQ, USO, VXX (n=8). Note this
  removes positive-expectancy names too (TQQQ/SOXL) — class honesty over cherry-picking.
- One exclusion for the WHOLE lane: display events (`build_v2` emits no reclaims) and
  the scored sim (`use_reclaim_entry=False`) alike.

### Panel re-run with the exclusion (2026-07-16, n=91, same fixed gates)

`python3 -m signal_layer.reclaim_lab` — same protocol as above; the variant arm is the
promoted config (reclaim entries everywhere except the 8 decay-class names, which run
baseline and stay in the panel denominators).

| Gate | Threshold | Result | Pass |
|---|---|---|---|
| G1 expectancy | pooled > 0 AND median per-name ≥ 0 | **+10.6%** pooled / **+6.3%** median (n=1,156) | ✅ |
| G2 non-inferiority | median variant/baseline ratio ≥ 0.95× | **1.30×** | ✅ |
| G3 2022 bull-trap falsifier | 2022-entered exp > −2% | **−1.07%** (n=73; was −1.5%) | ✅ |
| G4 breadth + drawdown | ≥55% names improved; median dd delta ≤ +2pp | **83.5%** (was 80.2%); dd **0.0pp** | ✅ |
| G5 sample | ≥150 reclaim trades | **1,156** | ✅ |

Median per-name WR 56.1% → 58.6%. **Verdict: PROMOTE-CANDIDATE → PROMOTED.**

### What promotion changed (one PR train)

- `FLAGSHIP_PARAMS` gained `reclaim_lane` → **new `source_hash`/`spec_hash` identity**
  (pre/post docs are distinct; published wr/pf never mix lanes).
- Scored sim: `run_backtest(use_reclaim_entry=True)` at every production emission
  (`build_polygon_universe`, plus a lane guard in `regen_flagship_slices` that recomputes
  any lane-stale backtest artifact and patches manifest wr/pf/cagr in lockstep).
  Trades carry `entry_kind` for per-lane attribution.
- Chart: RECLAIM markers render from the SLICE (the client Pine has no repair lane) as a
  hollow dashed "RE-ENTRY" pill — never the solid BUY star.
- UNCHANGED by design: the verdict lane. RECLAIM markers stay `scored:false` — no
  position-walk / manifest-verdict authority; `confluence.py`, `BUY_RSI_MAX`,
  `bear_block`, `REV_BARS`, `CONF_W` and the no-cut exit stream are untouched.

### Release note

Public backtest metrics (manifest `wr`/`pf`/`cagr`, `<SYM>.backtest.json`, the track
record) MOVE with the first post-merge regeneration: the traded sim now takes reclaim /
block-repair re-entries (panel medians: WR +2.5pp, total-return ratio 1.30×). Verdicts
do not move — the stance lane is unchanged.
