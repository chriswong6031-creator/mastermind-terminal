# RECLAIM re-entry lane — panel evidence (2026-07-15)

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

## Scored promotion (NOT in this PR — follow-up)

Promotion means: `FLAGSHIP_PARAMS` gains a `reclaim_lane` key (new `source_hash`
identity), the scored sim adopts `use_reclaim_entry=True`, manifest verdict/wr/pf and the
track record regenerate, and chart markers get the hollow re-entry glyph. Before doing it:

- **Exclude inverse/leveraged ETFs** — the worst per-name expectancies are structurally
  hostile to trend-reclaim semantics (SOXS −25%, SQQQ −21%, BITO −12%; decay instruments).
- Re-run the panel with the exclusion and re-adjudicate G1–G5.
- One PR train: params + regen + verify_publish + release note (public wr/pf will move).
