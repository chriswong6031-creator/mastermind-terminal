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
