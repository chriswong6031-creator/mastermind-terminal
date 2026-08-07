# Washout-Reversal lane — panel evidence (2026-08-02)

Protocol, grammar, variants and gates were locked in `docs/PREREG_WASHOUT_REVERSAL.md`
BEFORE any panel ran (same-commit train). Harness: `signal_layer/washout_lab.py` on top of
the production sim (`backtest.run_backtest`, `extra_entries` lab hook; exits byte-identical
to the shipped no-cut stream, baseline = production `use_reclaim_entry=True`). Trades still
open at panel end are marked-to-last (RECLAIM protocol). Stores end ~2026-07-08/09.

## US tuning panel — 225 full-history names (macro `data/stocks`)

All four runnable variants (E-E NOT-RUN: no sector-cohort store on the lab host):

| Variant | n trades | pooled exp | median per-name | 2022 exp (n) | ratio | breadth | all gates |
|---|---|---|---|---|---|---|---|
| E-A raw | 1,427 | **+6.9%** | +5.5% | **+6.7%** (104) | 1.165× | 72.6% | ✅ (both halves) |
| **E-B hold** | 758 | **+7.7%** | +5.8% | **+4.2%** (64) | 1.106× | 68.3% | ✅ (both halves) |
| E-C divergence | 138 | +14.7% | +4.6% | — (9) | 1.071× | 67.7% | ❌ G5 sample |
| E-D 2W-turn | 54 | +8.5% | +4.3% | — (3) | 1.024× | 58.0% | ❌ G5 sample |

Selection per prereg (best Half-A pooled expectancy): **E-B** (+7.6% Half-A vs +5.4% E-A).
Half-B confirmation: **all six gates pass** (pooled +7.9%, 2022 +2.7%, ratio ≥0.95×,
breadth 68%+, dd delta 0.0, G6 added-fires positive).

The 2022 falsifier deserves emphasis: trades ENTERED in 2022 were *positive* in both
variants and both halves. The washout context (−35% drawdown / ≥3-month monthly-oversold
dwell + oversold visit) is a far narrower cut than the raw `bear_block` CB pool that
killed every earlier bear-regime entry study — the depth requirement excludes the early-
bear "buy the first dip" fires that made 2022 lethal.

## CN confirmation panel — 1,554 names (confirm-only; never used for selection)

E-B only:

| Cohort | n trades | pooled exp | median per-name | 2022 exp (n) | ratio | breadth | gates |
|---|---|---|---|---|---|---|---|
| all | 4,369 | +6.0% | +0.95% | +6.7% (465) | 1.031× | **54.5%** | 5/6 — **G4 breadth FAIL** (bar 55%) |
| half A | 2,086 | +5.0% | +0.9% | +8.2% (234) | 1.033× | 55.4% | 6/6 |
| half B | 2,283 | +7.0% | +1.0% | +5.2% (231) | 1.023× | 53.7% | 5/6 (G4) |

Pooled CN expectancy and the 2022 falsifier are healthy, but per-name medians are an
order of magnitude weaker than US (+0.95% vs +5.8%) and breadth sits a hair under the
55% bar — CN washout returns concentrate in fewer names. Per the prereg's no-re-cut
rule the CN miss stands as measured.

## Verdict (per prereg §4/§5)

- **US: PROMOTE-CANDIDATE** — E-B is eligible for the scored washout lane
  (`FLAGSHIP_PARAMS["washout_lane"]`, new spec-hash identity, distinct hollow glyph),
  **pending operator go**. Not flipped in this train.
- **CN: NOT confirmed for scored promotion** (G4). CN ships the Prophet
  `reversal_watch` measurement shelf only (prereg §5.4) — clearly-labeled watch tier,
  logged under `board_definition="cn_reversal_watch_v1"`, grading vs CSI300 accrues as
  the forward evidence for any future CN promotion attempt.
- E-C (divergence) is a strikingly high-expectancy small-sample lane (+14.7% pooled) —
  ACCRUE status; it may be re-examined only as its own pre-registered follow-up.

Full per-name rows: `washout_us.json` / `washout_cn.json` (session scratchpad; numbers
above are the durable record). 600547.SS ground truth: the 2026-07-01 blocked BUY at the
washout low is an E-A trigger on the CN store's grid (2026-07-03 bar); its E-B
confirmation was still pending at store end — the live lane would have surfaced it as
watch-tier the following bar.
