# Phase 2 Pre-Registration — Market-Risk-Gated Exit Warnings

FROZEN before any results are computed. Design + kill rule locked. No tuning to
in-sample beauty. Mirrors the GC-lab / X1 house discipline (held-out, causal, era-split,
pre-committed kill).

## Question
Does conditioning the per-name exit-warning escalation (⚠ ARM / ⛔ CONFIRM) on the
MARKET-RISK state improve the warnings' predictive value for a real distribution drop,
WITHOUT materially raising false alarms — i.e., is the masterplan §5 top-down sensitivity
dial justified by data, or does it ship display-only?

## Fixed inputs (immutable — reuse, do not re-derive)
- **Warning events** = the REAL logic in `~/phase2-lab/gc-lab/harness/x_exits.py`
  (immutable): `_arm_event_daily_stream(close, di)` for ⚠ ARM; the CONFIRM condition from
  `build_arm_confirm_overlay` (while ARMED ≤15 sessions of a fresh ARM, daily close < last
  CONFIRMED radius-3 swing low) extracted as a raw ⛔ CONFIRM daily event stream (NOT tied
  to a trade). Constants verbatim: ARM_K3_MIN=75, ARM_KSHIFT_MIN=80, ARMED_WINDOW=15,
  PIVOT_RADIUS=3. Indicator math = the oracle `signal_layer.confluence`.
- **Panel** = macro `data/stocks/*.parquet` US names (the same panel as X1). Half-A (even
  index over sorted panel) = discovery; **Half-B (odd index) = HELD-OUT confirmation.**
- **Market-risk gate (validated, causal, historical)** — DE-RISK ACTIVE on date t ⟺
  `credit_oas_roc(t) ≥ 0.90`, where `credit_oas_roc` = causal **504-day rolling percentile**
  of the **21-day rate-of-change** of HY-OAS (`data/fred/BAMLH0A0HYM2.parquet`, 1996→). This
  is THE validated de-risk leg (`engine/risk_radar.py`: lift 1.23×, 10-day lead, era-robust).
  Secondary robustness gates (report but do not gate the verdict on): `regime_history.parquet`
  quad ∈ {Q3,Q4} (deteriorating), and NFCI z-score > 0.
  The gate is a MARKET series (same for every name on a date); join by date. Causal only —
  no value on t uses data after t.

## Forward outcome per event (causal; reuse x_exits definitions)
For each ARM and each CONFIRM event at date t (event close c_t), over forward window K=63
sessions, compute the SAME path metrics `x_exits._attach_post_exit` uses, treating t as the
reference bar (uses only t+1..t+K):
- **deep_giveback_fwd**: gave back ≥20% from the forward in-window peak (a real drop followed).
- **false_alarm_fwd (premature)**: within 20 sessions close reaches ≥ c_t·1.02 BEFORE ever
  closing ≤ c_t·0.95 (price rallied — the warning was wrong/early).
Also report `fwd_min_ret_63` (min close/c_t − 1 over the window) as a continuous check.

## Pre-committed tests (frozen) — all evaluated on HELD-OUT Half-B
- **T1 discrimination.** Among CONFIRM events: is `deep_giveback_fwd` rate HIGHER when
  DE-RISK ACTIVE vs calm, by a margin whose bootstrap CI excludes 0, AND era-stable (holds
  outside 2022 too — not a single-era artifact)? AND among ARM events: is `false_alarm_fwd`
  rate HIGHER when calm than when de-risk active? (Justifies "escalate earlier in risk-off,
  require more evidence in calm.")
- **T2 policy.** Compare the **market-gated warning** {de-risk → treat ARM as actionable;
  calm → require CONFIRM} vs **baseline** {always require CONFIRM} for flagging the deep-
  giveback events: does the gated policy catch MORE true deep-giveback events (higher recall)
  at NON-materially-worse precision (false-alarm rate ↑ ≤ a pre-set 5pp), on Half-B?
- **T3 2022.** The gated policy must ALSO improve deep-giveback catch in 2022 specifically
  (the motivating index-distribution case), not just pooled.

## KILL RULE (pre-committed)
Promotion to a real warning-MODULATION requires **T1 ∧ T2 ∧ T3 all pass on Half-B.**
If ANY fails → the coupling ships **DISPLAY-ONLY** (the chip shows the tape next to the
warning; it does NOT change when/whether the warning fires). This is the expected base case
given the program's prior (every mechanical early-exit died; name-level top-calling is null).

## Leak audits (must pass or results void)
1. **Truncation audit**: recompute ARM/CONFIRM on `close[:t+1]` for a sample of event dates;
   the event flags at t must be identical to the full-history computation (causal).
2. **Gate causality**: `credit_oas_roc(t)` uses only HY-OAS ≤ t (504d trailing percentile,
   21d ROC). Positive control: shifting the gate forward by +21 sessions must CHANGE results
   (confirms the gate carries date-specific info, not a constant).
3. **Forward metric**: uses only t+1..t+K. Positive control: a random-date placebo event set
   must show ~panel-base rates (no spurious discrimination).

## Deliverables
`~/phase2-lab/phase2_study.py` (the harness, reusing x_exits) + `phase2_results.json`
(per-bucket rates with n, Half-A vs Half-B, per-era incl. 2022, the three leak audits, the
T1/T2/T3 verdicts vs the kill rule). Report numbers, not adjectives.
