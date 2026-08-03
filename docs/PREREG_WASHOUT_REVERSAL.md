# PREREG — Washout-Reversal entry lane (2026-08-02)

Pre-registration for a new entry lane that can fire **while `bear_block` is TRUE**.
Locked before any panel run, in the `PREREG_RECLAIM` / `RECLAIM_LANE_EVIDENCE` format.
Program law recap that binds this document:

- **bear_block itself is do-not-loosen** (Mag7 sanctioned program, 2026-07-15; the 2022
  falsifier is the reason it exists). This lane is a *separate grammar* — the classic
  confluence lane and its gates stay byte-identical.
- **Score-not-gate** (3× confirmed: COILED, KEEPER, recipe): whatever passes ships as a
  distinctly-glyphed lane with its own identity, never as a silent widening of BUY.
- **Display promotion only on gate pass** (RECLAIM precedent): markers may dark-ship
  `scored:false` behind a flag, but no scored/verdict authority until the gates below pass
  and the operator says go.

## 1. Why this lane

600547.SS diagnosis (2026-08-02, [bear-block-washout-entry-gap]): the engine fired a
textbook CB at the washout low (2026-07-01 @ ¥25.89) and emitted it `regime_blocked`.
Every recovery path (trend-reclaim, block-repair, keeper counter-trend rule) *also*
requires above-200/weekly-bull, so a name that crashed far below its 200dMA cannot emit a
scored entry until price rallies ~30–40% — the entire bottom is structurally unownable.
This is the third instance of the one-shot-gate disease (RECLAIM_LANE_EVIDENCE §Why), but
unlike the Mag7 V-recovery holes, the washout case needs entries **inside** the bear
regime, which is exactly where the 2022 falsifier lives. Hence: full pre-registration,
not a repair grammar.

Prior art that motivates the candidate grammar: COILED (macro engine/coiled.py,
sector-cohort washout × bull divergence; OOS clean-liftoff +7.5pp, stop-outs −5.6pp) —
the one validated route to earlier entries; EV1's failure teaches that the trigger must
remain the production CB, not T2-style anticipation fires.

## 2. Detection grammar (frozen)

All series on the production 3D grid, computed by the production `confluence.compute_signals`
internals — no new indicator math.

**Washout context (`washed`, all required):**
- W1 `bear_block[i]` is TRUE (this lane exists only where the classic lane cannot fire);
- W2 drawdown: close ≤ −35% from the trailing 252-session high, **OR** monthly (1M-grid)
  StochRSI-D < 20 dwell ≥ 3 monthly bars;
- W3 oversold visit: 3D StochRSI-D dipped < 20 within the last `CONF_W`(8) 3D bars
  (the existing `b1_from_os` leg — a washout that never got oversold isn't a washout).

**Reversal trigger:** the production CB fires on bar i (macd_bull ∧ recent_b1 ∧
confirm_bull ∧ rsi14<65) with `washed[i]` — i.e. exactly the markers today stamped
`regime_blocked`, filtered to washout context.

**Pre-registered confirmation variants (the full menu; nothing else may be tried):**
- **E-A** raw: trigger alone.
- **E-B** hold: + next-3D-bar close > trigger close (keeper's reclaim-and-hold leg,
  entry at bar i+1 close — the confirmation delay is priced).
- **E-C** divergence: + bull divergence at the low (price lower low vs 3D RSI-MACD
  higher low over look=12 — COILED's divergence leg, single-name form).
- **E-D** 2W turn: + 2W StochRSI K crosses above D from K<20 within the last 4 3D bars.
- **E-E** cohort: E-B ∧ sector-cohort washout share ≥ 40% (the terminal's shipped
  2W-StochRSI cohort leg, `v2_cohort_cache`); names with no resolvable cohort are
  excluded from this variant's panel rather than defaulted.

**Exit arm:** the production no-cut v2 exit stream, byte-identical to the shipped
`backtest.py` (`use_cut_exit=False`). No exit surgery (closed lane, 4× confirmed). Note
honestly: below the 200d `strong_bull` is always False so **every** CS exits; the lane is
evaluated under exactly that handicap. Trades still open at panel end are marked-to-last
(the RECLAIM protocol).

## 3. Panels and split

- **Tuning panel:** the macro repo US full-history parquet store (`data/stocks`),
  Half-A/Half-B split by ticker hash exactly as GC-lab; variants compared on Half-A,
  the single promoted variant confirmed on Half-B untouched.
- **OOS confirmation panel (confirm-only, never tuned on):** CN A-share store
  (`Macro Dashboard/data/china_stocks`, ≥1,400 names). CN results cannot rescue a
  US-failed variant; a US-passed variant failing CN gates ships US-only with the CN
  exclusion release-noted.
- No fills earlier than each name's 90th 3D bar (production warm-up); known_ts/fill
  conventions identical to production F0.

## 4. Gates (all must pass on the promoted variant; Half-B + pooled)

| Gate | Threshold |
|---|---|
| G1 expectancy | pooled washout-trade exp > 0 AND median per-name ≥ 0 |
| G2 non-inferiority | median (variant ∪ baseline)/baseline total-return ratio ≥ 0.95× |
| G3 **2022 falsifier** | trades ENTERED in 2022: pooled exp > −2% AND stop@63 exp > −4% — this is the gate the lane exists to threaten; a miss kills the lane, no re-cuts |
| G4 breadth + drawdown | ≥55% of names with ≥1 trade improved vs baseline; median max-dd delta ≤ +2pp |
| G5 sample | ≥150 washout trades on the promoted variant (Half-A+B pooled) |
| G6 added-fires decomposition | the ADDED trades alone (not pooled with baseline) satisfy G1 — the EV1 lesson: pooled numbers can hide a losing added-cohort |

Failure handling: variants may only be compared on the menu above; the best Half-A
variant is the single promotion candidate; if it fails Half-B or CN confirm, the lane is
**display-only forever** (RECLAIM P3's expected base case) and this doc gets the numbers
appended as the tombstone.

## 5. Ship tiers

1. **Lab evidence** (this prereg + `signal_layer/washout_lab.py` run) — numbers appended
   below, artifacts under `docs/` like RECLAIM_LANE_EVIDENCE.
2. **Display lane** (only after the lab run, regardless of pass/fail if signal-shaped
   honesty allows): `WASHOUT_REV` markers `scored:false`, hollow distinct glyph, emitted
   behind `FLAGSHIP_PARAMS["washout_lane"]` (default False until operator go). A blocked
   CB in washout context additionally carries `washout_context: true` so the frontend can
   say "washout-reversal candidate — regime-blocked" instead of the bare blocked note.
3. **Scored promotion**: all six gates + operator go; new spec-hash identity; manifest
   verdict may then read the lane (same mechanics as RECLAIM promotion).
4. **Prophet China `reversal_watch` lane** (independent of scored promotion — it is a
   *measurement surface*, not a buy claim): CN board names failing `signal.eligible`
   solely on trend/regime legs, with W1–W3 + E-B true, surface in a clearly-labeled
   watch shelf and are **logged to the track store** with `lane="reversal_watch"` so the
   ledger grades them vs CSI300 exactly like featured picks. The shelf ships with its
   null expectation printed (single-name hold-rate ≈ coin-flip law; reversal trust tier
   is "validated but high-variance, not a buy list"). The logged cohort becomes the
   forward evidence for (3) on the CN side.

## 6. DO-NOTs

- No loosening of `bear_block`, `BUY_RSI_MAX`, keeper, recipe vetoes, or exits in the
  classic lane; `confluence.py` untouched (golden-gate parity artifact).
- No variant outside §2's menu; no threshold tuning after seeing Half-B or CN numbers.
- No Prophet featured/buy-lane admission from this lane regardless of gates — featured
  admission has its own program.
- CN panel never used for variant selection.

## 7. Status ledger

- 2026-08-02: prereg locked, then run same-session (`signal_layer/washout_lab.py`).
  Results in `docs/WASHOUT_REVERSAL_EVIDENCE.md`: US **E-B PROMOTE-CANDIDATE** (all six
  gates, both halves; 2022 falsifier POSITIVE both variants); CN **G4 breadth fail**
  (54.5% vs 55%) → CN stays watch-tier (`reversal_watch` shelf, §5.4). E-C/E-D
  sample-starved (ACCRUE). E-E NOT-RUN (no cohort store on the lab host). Scored
  promotion NOT executed — awaiting operator go per §5.3.
