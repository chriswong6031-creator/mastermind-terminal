"""Signal layer — the TRUSTED math of the charting container.

Everything Opus and the stock-picker eventually reason over is produced here, in
Python, where the user's Pine logic is already faithfully ported. The browser
chart computes indicators for *display*; this layer computes them for *record*
and emits the versioned data contracts (see ``contracts.py``).

Modules
-------
confluence    GOLDEN ORACLE — verbatim copy of the macro repo's faithful Pine
              port. Never edited here; it is what every engine is diffed against.
backtest      Tier-1 ``run_backtest`` — promotes ``confluence.simulate`` and ADDS
              the metrics the contract needs (Sharpe/Sortino/CAGR/Calmar/exposure)
              + structured per-trade records + costs.
contracts     Emitters for ``mastermind.indicator/v1`` and ``backtest_result/v1``,
              plus ``model_slice`` (the projection that strips raw arrays before
              anything reaches the model — the cost/context guardrail, §4/§7 D9).
golden_gate   Parity harness: diff any candidate indicator engine against the
              oracle; fail loudly on divergence (the trust layer Opus needs).
"""

# ── THE SIGNAL-ERA FENCE ────────────────────────────────────────────────────────
# Lives at the package root because it is neither the contract's nor the override
# module's private property: ``contracts`` stamps it on every emission and
# ``washout_override`` stamps it on every forward-ledger row, and one definition is
# what keeps those two records poolable with each other and with nothing else.
#
# WHY A FENCE AT ALL (prereg §4 / ratification packet §4.2, Macro Dashboard
# research/BLOCKED_ENTRY_CONDITIONAL_PREREG.md): ``gc_v2_wo1`` changes what the engine
# ENTERS — a ``bear_block``-vetoed CB/revBuy whose thematic-basket peers sit at or below
# the ratified notch is now TAKEN. That is a different rule, so its trades are a
# different track record. Pooling gc_v2 and gc_v2_wo1 events would measure neither.
# Mirrors the macro repo's ``hk_prophet_v2`` BOARD_DEFINITION pattern: a module-level
# constant, asserted in tests, changed only by a deliberate era bump.
#
# ``gc_v2_wo2`` (this build) bumps it again for the SECOND waiver in the same family —
# Arm T of the reclaim-veto conditional (Macro Dashboard research/
# RECLAIM_VETO_CONDITIONAL_PREREG.md §4/§5, RATIFIED 2026-08-10 at the 25% notch): the
# KEEPER now waives its counter-trend RECLAIM leg for a fire whose name qualifies in the
# washout state, emitting ``reclaim_override_take``. It again changes what the engine
# ENTERS, so it is again a different rule and again a different track record. wo1 and wo2
# trades are never pooled with each other or with gc_v2.
#
# RELIEVABLE ONLY (the adjudicated boundary, prereg §5): the waiver reaches a fire whose
# next-bar HOLD leg PASSED and whose 200-reclaim leg failed. A hold-leg failure (the
# HL 2026-06-16 shape) stays blocked — relaxing it is a DIFFERENT construction with its own
# prereg, named here as the honest boundary rather than shipped around.
#
# READ RULE for artifacts already in the wild: the field is ADDITIVE, so an emission or
# ledger row carrying NO era is pre-fence and reads as ``SIGNAL_ERA_PRE``. Never default
# a missing era to the current one — that is exactly the pooling the fence exists to stop.
SIGNAL_ERA_PRE = "gc_v2"        # every emission before the washout-override enter mask
SIGNAL_ERA = "gc_v2_wo2"        # this build: + the keeper's counter-trend reclaim waiver

# The eras in which the washout-override ENTER MASK was live. A ledger row minted under any
# of them recorded a real entry made by a real rule, so it REPLAYS as the entry it was —
# the fence forbids POOLING the eras' results, not honouring an entry a past era took. (A
# pre-fence display row carries no era at all and still fails closed; see
# ``washout_override.WashoutStamper.override_for``.) Grading reads each row's own ``era``.
ERAS_WITH_ENTER_MASK = frozenset({"gc_v2_wo1", "gc_v2_wo2"})

# The eras in which the KEEPER's reclaim waiver was live. Strictly narrower than the set
# above: the class did not exist before wo2, so a row that predates it can never replay as
# one no matter what else it carries.
ERAS_WITH_RECLAIM_WAIVER = frozenset({"gc_v2_wo2"})

__all__ = ["SIGNAL_ERA", "SIGNAL_ERA_PRE",
           "ERAS_WITH_ENTER_MASK", "ERAS_WITH_RECLAIM_WAIVER"]
