# Phase 2 Verdict — Market-Risk-Gated Exit Warnings: **KILL (display-only)**

Pre-registered 2026-07-07 (design + kill rule frozen *before* results — see
`PHASE2_PREREG.md`). Study ran on the real signal machinery; verdict adversarially
verified by 4 independent skeptics + synthesis. **Result: the market-risk *sensitivity
dial* (masterplan §4/§5 — modulating per-name ⚠/⛔ warnings by the tape) does NOT ship.**
The top-down tape is genuine display *context* (the chip — already live), not a per-name
warning modulator.

## The question
Does gating per-name exit-warning escalation (⚠ ARM / ⛔ CONFIRM) by the market-risk state
(HY-OAS de-risk) improve the warnings' predictive value for a real distribution drop, without
raising false alarms? (The masterplan §5 "raise per-name exit sensitivity when the market is
distributing.")

## Method — real machinery, held-out, causal
- **Events** = the REAL ARM→CONFIRM logic (`gc-lab/harness/x_exits.py`, immutable; the same
  code that produces prod's ⚠/⛔ side-channel): **220 US names, 107,338 events** (70,889 ARM +
  36,449 CONFIRM), full history.
- **Gate** = the validated HY-OAS de-risk leg: `credit_oas_roc` = causal 504-day percentile of
  the 21-day ROC of HY-OAS ≥ 0.90 (`engine/risk_radar.py`: lift 1.23×, 10-day lead). ~10.8% of days.
- **Held-out Half-B**, per-era (incl. 2022), pre-committed kill rule, three leak audits.

## Result — T1 fails → DISPLAY-ONLY

| Test (Half-B) | Outcome |
|---|---|
| T1a CONFIRM discrimination | *surface* pass: deep-giveback de-risk 0.209 vs calm 0.161, CI [0.025, 0.073] excl 0, era-stable |
| **Placebo / base-rate (the real kill)** | **CONFIRM-in-de-risk (0.209) is BELOW random-bar-in-de-risk (0.219).** The entire 4.8pp "edge" is the market-wide drawdown base rate during stress — the warning adds **no incremental predictive value** |
| T1c ARM false-alarm | **FAIL**: de-risk ARM events are *more* false-alarm-prone than calm (0.671 vs 0.666, p=0.68) — inverts the "escalate earlier in risk-off" premise (in stress, oversold ARM → violent bounce) |
| T2 gated policy | modest pass (+2.6pp recall, precision flat) — but the placebo confound implies this is base-rate, not signal |
| T3 2022 | pass (0.351 vs 0.270) — single era, n=600 |

**Kill rule (T1∧T2∧T3) not met → DISPLAY-ONLY.**

## Verification — 4 independent adversarial skeptics + synthesis
All four **confirmed**; **no forward-leak, no verdict-changing bug**. The gate was independently
reproduced (99.6% agreement); the 4/30 truncation-audit mismatches were reproduced and judged
benign 3D-bucket-boundary artifacts (the full-history computation defers an incomplete bucket to
t+1 — not look-ahead); the metric definitions are faithful to `x_exits` (three trivial,
correctly-scoped differences, none touching the verdict). Synthesis: `display_only_verdict_robust
= true`, `base_rate_confound_real = true`.

## What this establishes
The market gate discriminates deep-giveback **only because risk-off periods have more drawdowns**,
not because the per-name ⚠/⛔ warning is better-timed in them. This is another confirmation of the
program's core law (X1 validated; every mechanical early-exit killed; CPI price-state turn
prediction null; the name-level TOP-RISK gauge killed): **name-level technicals cannot see regime
tops, and modulating the per-name warning by the market state adds no value beyond the base rate
the market state already reflects.**

## Decision
- **SHIP: nothing new.** The display-only outcome is *already satisfied* — prod's `OracleDash`
  shows both the market-risk chip (the tape, fed by `ingest/pull_macro_risk.py`) and the ⚠/⛔
  warnings, side by side. Masterplan §5's top-down *display context* is live.
- **DO NOT SHIP** any tape-gated warning suppression/escalation — it would be a misleading
  base-rate effect dressed as signal.
- **Reopen only if** a market-state feature discriminates the warnings *above* the market base
  rate on held-out names (CONFIRM-in-de-risk > placebo-in-de-risk). This one does not.

## Artifacts
Frozen pre-registration: `PHASE2_PREREG.md`. Harness + results: `~/phase2-lab/`
(`phase2_study.py`, `phase2_events_cache.parquet` 107,338 events, `phase2_results.json`).
Reuses the immutable `gc-lab/harness/x_exits.py`. See [`SELL_SIDE_CASCADE_MASTERPLAN.md`](SELL_SIDE_CASCADE_MASTERPLAN.md)
§4/§5 and [`MARKET_RISK_BRIDGE_SCOPE.md`](MARKET_RISK_BRIDGE_SCOPE.md) Phase 2.
