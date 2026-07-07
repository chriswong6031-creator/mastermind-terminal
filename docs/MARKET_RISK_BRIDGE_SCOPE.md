# Market-Risk Bridge — Build Scope

Prepared 2026-07-07. Status: build scope (the "how" for
[`SELL_SIDE_CASCADE_MASTERPLAN.md`](SELL_SIDE_CASCADE_MASTERPLAN.md) §5, the top-down
cycle layer). Display-only; nothing executes.

## Goal

Pipe the Macro Dashboard's already-validated **market-risk state** (Risk Radar /
HY-OAS / NFCI de-risk legs) into the Terminal as (1) a **display chip** and (2) a
**per-name exit-sensitivity dial**. This is the market-level overlay both this program
and the GC-v2 session's *killed* name-level top-risk gauge concluded is required
("name-level technicals cannot see regime tops; the 2022 hole needs a market-level
overlay"). **Plumbing, not research** — the macro signal is validated; we transport
and display it.

## One-line topology

```
macro: data/market_state/latest.json  (schema market_state.v1, nightly)
       site/live/risk_state.json       (same schema, 60s intraday, PUBLICLY SERVED)
   │  fetch published JSON (mirror pull_macro_intel R2 pattern: custom UA, timeout, last-good fallback)
   ▼
terminal: ingest/pull_macro_risk.py  →  terminal/public/data/market_risk.json (market_risk/v1, trimmed + stale-gated)
   ▼
terminal: MarketRiskChip.tsx (display)  +  Phase-2 sensitivity dial into the D-cascade / ⚠⛔ warnings
```

## Source contract (`market_state.v1`) — verify exact fields against the live file at build time

Per macro-repo inspection, the artifact carries everything needed (do **not** create a
new macro artifact):

| field | use |
|---|---|
| `verdict` (`RISK_ON`/`MIXED`/`RISK_OFF`) | chip color + the coupling gate |
| `score` (0–100, lower = risk-off) | chip dial |
| `radar.gross` (0.60–1.0 exposure multiplier) | the **sensitivity dial** (Phase 2) |
| `radar.state` (`risk-on`…`caution`…`risk-off`), `radar.label_en` | chip subtitle |
| `components[]` (trend/risk/vol/breadth/liquidity/stress; HY-OAS Δ21d under `liquidity`) | chip expando + copilot |
| `asof` (SPY-close-gated), staleness markers | freshness gate |
| `is_display_only: true` | propagate — never let this originate a sell |

Cadence: nightly (~06:37 UTC) + 60s intraday during RTH; fail-closed past **2 trading
days** stale. HY-OAS leg (`credit_oas_roc`, 21d ROC >90th pct) is the validated Tier-A
credit lead (~1.23× lift, ~10 bd lead); NFCI is a secondary contributor — reflect that
weighting, don't over-claim NFCI.

## Phase 1 — display chip (buildable now, git-only, ~0.5 day)

Everything here exists in the current git tree; no dependency on the prod-only v2 code.

1. **`ingest/pull_macro_risk.py`** (new) — clone the structure of `ingest/pull_macro_intel.py`:
   - Fetch the published `risk_state.json` via HTTPS (env `MACRO_RISK_URL`, default the
     macro host; reuse the `_r2_fetch` custom-UA/timeout/last-good pattern). Fall back to
     nightly `market_state/latest.json` if the live file is absent.
   - Trim to **`market_risk/v1`**: `{schema, asof, verdict, score, gross, radar_state,
     label_en, components:[{key,label_en,score,tone,metrics}], stale, realtime}`.
   - **Stale-abstain gate** verbatim from `pull_macro_intel._is_stale`: past
     `MAX_STALE_DAYS` (trading-calendar) → `stale:true`, and **null the `gross` dial** so
     a stale tape cannot drive sensitivity (mirror of the intel bridge dropping `ai_lean`).
   - Write `terminal/public/data/market_risk.json` (single file, not per-symbol).
   - Wire into `ingest/terminal-refresh.sh` next to the `pull_macro_intel` call.
2. **`terminal/components/MarketRiskChip.tsx`** (new) — model on
   `terminal/components/SectorPulseChip.tsx`: color by `verdict`, show `score` + `radar`
   label + `asof`, a **stale badge** when `stale`, and an expando of the six component
   legs. Render in `TerminalShell` header (near the sector-pulse chip) and/or
   `components/fin/OracleDash.tsx`.
3. **Copilot context** — feed the trimmed state into `CopilotPanel` / `app/api/copilot`
   so the deterministic verdict reads market risk ("tape is RISK_OFF, de-risk 0.87×").
4. **Tests** — a `market_risk/v1` contract-conformance test + a stale-abstain test,
   modeled on `tests/test_intel_bridge.py` / `test_artifact_conformance.py`.

## Phase 2 — per-name sensitivity dial (design; BLOCKED on git↔prod reconciliation)

The per-name exit warnings (⚠ armed / ⛔ structure-break) and exit-pressure live in the
**deployed `confluence_v2.py` + OracleDash marker rendering, which are on prod but NOT in
git** (confirmed: `origin/master` has no `confluence_v2.py`). So this phase must land on
the reconciled v2 code, not the stale git v1.

**Mechanism (display-only, never a sell):** the market-risk `verdict`/`gross` shifts the
D-cascade escalation threshold by one step:

| tape | effect on per-name warnings |
|---|---|
| `RISK_ON` / gross ≥ 0.97 | conservative — full two-key stack required for ⛔ (today's behavior) |
| `MIXED` / caution | ⚠ arms one tier earlier; ⛔ unchanged |
| `RISK_OFF` / gross ≤ 0.78 | ⛔ escalates on a single structural key (C alone), and the chip turns the name's exit-pressure band up |
| stale | **no modulation** (abstain) — falls back to Phase-1 behavior |

This is exactly the "raise per-name exit sensitivity when the market is distributing"
from the masterplan §5 — the piece that makes 2022-type regime tops visible *per name*,
which name-level technicals alone could not see.

## Guardrails (house law)

- **Display-only end to end.** Propagate `is_display_only`. The chip and the dial change
  only *warnings*, never the scored exit. No auto-sell, no sizing, no order.
- **Stale-abstain is mandatory** (the intel bridge already sets this precedent — a stale
  lean is dropped, not shown live). A stale tape must not drive the dial.
- **`asof` always visible.** The user must see the tape's age; once-daily + SPY-gated.
- **Two-repo boundary.** Macro publishes; the Terminal reads. Do not reach into macro
  internals — consume only the published `market_state`/`risk_state` JSON.

## Phase-2 falsifier (pre-register before it modulates anything)

Replay: does risk-off-gated *earlier* ⛔ escalation reduce deep-giveback on held-out
names **without** a material rise in false exits vs the Phase-1 (un-modulated) warnings?
If not, the dial stays display-only context (the chip alone) and does not touch the
cascade. Metric: deep-giveback rescued vs false-alarm delta, per-name majority, 2022
specifically (the case that motivated the overlay).

## Dependencies / open items

1. **Confirm the published URL/mirror** for `risk_state.json` reachable from the Terminal
   deploy (the macro dashboard serves it to its own browser; pin the exact URL / R2 key).
2. **Phase 2 is gated on git↔prod reconciliation** of the v2 display code (or must be done
   directly on the prod `confluence_v2.py` + OracleDash). Phase 1 has no such dependency.
3. Effort: Phase 1 ≈ half a day (clone two existing files). Phase 2 ≈ 1–2 days once the v2
   code is reachable, plus the pre-registered replay before it modulates warnings.
