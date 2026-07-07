# Sell-Side Cascade — Timing Cycle Tops Without Selling Winners Early

Prepared 2026-07-07. Status: research + design handoff. **Additive document only.**
No scoring, sizing, trade execution, or sell authority is granted here. The product
is display-only / paper (README: "nothing executes orders").

Companion to Codex's `research/SELL_EXIT_RECONCILIATION_MASTERPLAN_BY_CODEX.md`
(Macro Dashboard repo). Codex reasoned from first principles + outside literature;
this document reconciles that with the Terminal's **own already-run bake-offs** and
the live `signal_layer/confluence.py` semantics, and adds the cycle-timing layer the
owner asked for.

---

## 0. Executive ruling

**The owner asked to "time tops in cycles." The evidence — including our own
validated results — says the request, taken literally as a per-name mechanical
top-caller, is the wrong tool, and that a different tool solves the actual pain.**

The stated pain is "it's easy to sell out early." That is two different problems
wearing one sentence:

1. **Selling too early** = a mechanical sell fires during a *healthy markup*. This is
   a defect we can fix *today* with a change we have **already validated but not
   shipped** (drop the `revSell` cut from the scored exit → **+48% expectancy**, §2).
2. **"Finding the top"** = exiting near the real cycle high instead of 40% below it.
   This cannot be done as a *point* from a name's own price/oscillator state — every
   mechanical version we have tested died, and the cycle-turn prediction program
   (CPI) returned null on price-state gates (§2, §3). But a cycle top is a **process
   (distribution)** with detectable, *systemic* footprints, and the aggregate tops
   before individual names. That is timeable — as **context that raises exit
   sensitivity**, not as a per-name trigger.

**Verdict.** Do not build a sell-side mirror of the T1–T4 buy cascade. Build:

- **(A) Ship the validated fix first** — remove `revSell` from the scored exit, keep
  it as a *display* CUT-caution. This alone removes most early sells (§2, §9-step-0).
- **(B) A Distribution Cascade `D1–D4`** — a *graded* sell-side ladder that mirrors
  T1–T4 in *shape* but inverts its *philosophy*: where a buy tier escalates a
  **command to act**, a distribution tier escalates only a **risk role on an action
  ladder** (`hold → tighten → trim → exit-review`), and **higher tiers require more
  independent evidence, not less** (§4). Display-only until it clears the entry-grade
  gauntlet.
- **(C) A top-down cycle-distribution gauge** — breadth divergence, sector-rotation
  TOPPING breadth, credit/liquidity de-risk legs, CPI hazard — computed at the
  market/sector level, where these signals actually *lead*, and used to raise the
  per-name cascade's sensitivity (§5). This is the literal "time tops in cycles" part.

In one line: **let confluence buy bottom-up; let distribution be managed top-down;
never let one oscillator print be a sell.**

---

## 1. The problem, stated in our own code

`signal_layer/confluence.py` emits four events on the 3D bar and two regime gates.
The strategy *as traded* (`simulate(fixed=True)`, the live "two fixes"):

```
enter = (CB | revBuy) & ~bear_block
exit_ = (CS & ~strong_bull) | revSell
```

- `CS` — oscillator SELL (RSI-MACD bear cross, confirmed, while recently extended).
  **Already suppressed in a `strong_bull`** (`w_bull & mo_bull & above200`). So the
  code *already* holds through oscillator tops in a confirmed bull. Good instinct.
- `revSell` — the fast-reversal **CUT**: `macd_bear & bars_since(CB) ≤ 3`. Fires
  **ungated** — a BUY that wobbles within 3 bars is cut. This is the primary
  early-sell engine, and it fires *regardless of trend*.

**Two structural facts fall out of this:**

1. The buy side is a **graded, tiered cascade** (T1–T4 confluence grading, applied in
   the Macro `engine/signal_gate`/`canon` and carried in `golden_signals.json`;
   `is_buyable = T1/T2/T3`). The sell side is an **ungraded binary** (`CS`/`revSell`).
   *The asymmetry in the code mirrors the asymmetry in the market.* The fix is to give
   the sell side a graded cascade too — but graded by **evidence stacked**, mapped to
   an **action ladder**, not a price threshold.
2. The one place the code got the sell side right is the `& ~strong_bull` guard —
   proof the owner already intuits the anti-early-sell principle. We generalize that
   guard into a full **Trend-Integrity veto axis** (§4, Axis A).

---

## 2. What the evidence already settles — do not re-derive

Everything below is from bake-offs already run on this exact system (Terminal GC-lab,
2026-07-06) or the Macro engine. These are load-bearing priors; the design must obey
them.

### 2.1 The validated fix (unshipped)
**X1 "no-cut": remove `revSell` as a scored exit.** Full US panel (n=207,
full-history), next-bar fills:

| metric | live (with cut) | X1 no-cut | Δ |
|---|---:|---:|---:|
| Win rate | 51.4% | 56.5% | **+5.1pp** |
| Expectancy | +0.0695 | +0.1032 | **+48%** |
| Profit factor | 3.15 | 3.86 | +0.71 |
| Shake-outs | 11.1% | 3.9% | **−65%** |
| 2022 expectancy | +0.012 | +0.045 | improves |

Better expectancy on **201/207 names**; Half-B holdout holds (+43% exp). Cost the
owner must accept: giveback p50 6.0→6.9%, holds ~2× longer, ~−20% trades. Forward move
after the *dropped* cuts: p50 +1.2% / p75 +5.3% — i.e. the cuts were **manufacturing
whipsaw**. Keep `revBuy` re-entry; render `revSell` as a *caution dot*, not a sell.

**This is step 0 of any sell-side work. It directly answers "easy to sell out early."**

### 2.2 Every mechanical early-exit we tested is dead
| rule | result | why |
|---|---|---|
| X3 profit-armed trailing (EMA8/Chandelier, arm ≥+5% MFE) | **KILL** −60/−67% expectancy | truncates mid-trend winners (AMZN 336d +14.5% → 70d +5.6%) |
| XV1 symmetric bear-block exit | **KILL** −20% exp, 2022 *negative* | the state marks capitulation zones; exiting locks the drawdown |
| XV2 ARM→CONFIRM harvest exit | **KILL as exit** −70% exp | but genuinely harvests deep-giveback → ships as *display* ⚠⛔ (§4, Axis C) |
| TV partial trim @ MFE≥30% (f=0.25 / 0.50) | **NO-PROMOTE / KILL** −8% / −15.8% exp | trims the +51.5%-expectancy winners; 2022 gave *zero* protection (no +30% winners in a bear) |

**The law, confirmed four independent ways: expectancy lives in the long-hold right
tail; any mechanical early-exit rule dies.** The v5 cross-section (Macro
`diagnose_v5_exits.py`, EXIT_GRID_1) says the same: EMA8/13/21/Chandelier as
*replacement* sells fail the joint DD+capture gate (~35% of names vs a pre-committed
70% floor), even though EMA8 rescues the deepest-DD quartile (72% improved,
−18.1% vs −25%). **"Drawdown is an entry problem, not an exit problem."**

### 2.3 What *does* carry signal — but only as display
| signal | evidence | use |
|---|---|---|
| **X5 distribution-zone** (2D bear cross while 3D k/d≥75, OR 3D stoch bear from k≥80) | **76.5% of trades warned before exit**, lead **p50 37 sessions**, giveback saved p50 3.6pp, FA 46% | zone caution ⚠ — never "sell" |
| **XV2 structure-break-while-extended** | deep-giveback rate 0.066→0.019, **94/104 names**, 2022 cut 8.4× | trim/exit-review candidate ⛔ (display) |
| **Sector regime** (11 SPDRs, 1998–2026) | SELL **−1.24%** exc63 / 40% hit / n=169; TOPPING **−0.11%** / 48% / n=2335; EXTENDED **+0.06%** / 50% (neutral) | **oscillator "TOPPING" ≈ noise; only confirmed SELL + rotation carries a thin edge** |
| **Credit/liquidity de-risk** (anticipation overlay) | confluence long/flat maxDD **−49.5→−39.5** at *same* Sharpe; `m_hy_oas`, `m_nfci` = GO legs | market-level exposure dial (§5) |
| **EXIT_CROWDING L1–L4** (options footprint) | L1–L3 blocked on thetadata; L4 **ACCRUE** (single 3-mo era, wrong-sign interim) | future key, not yet usable (§4, Axis E) |

### 2.4 Cycle-turn prediction from price is null (the humility check)
The CPI program (Macro) ran the full battery: position→return (KG-1), risk-sizing
(BC-1, **0/48**), directional labels (CC-2 negative), turn precision (CC-3
0.075–0.23 vs 0.5 null). **All null.** Only a **hazard model (4/6 cells)** and a
**next-phase softmax (TR-1)** pass — both **DISPLAY-class, explicitly not tradeable**.
Adding **breadth as a hazard covariate was *harmful*** (FT-1, ΔBrier −0.0056 on
down/1m); credit likewise (FT-2, 0/6, 4 harmful). Conclusion the house already drew:
**tops are recognized as a process underway, not predicted as a point from price.**

> This is the single most important guardrail. It does **not** say breadth/credit are
> useless — FT tried them as *additive predictors of a hazard model*. It says: use
> them as **display-class context that changes an action bias**, not as a gate that
> claims to call the turn. §5 respects this boundary exactly.

---

## 3. First principles — why the sell side is not the buy side inverted

The T1–T4 buy cascade works because a **bottom is a point-like repair event**:
capitulation is fast and violent, and its evidences *converge in time* — washout
exhausted **and** reclaim **and** RS repair **and** the weekly tide turning, all
within a few bars. A momentum-confluence cross catches that convergence.

A **top is a distribution process, not a point**:

| property | bottom | top | consequence |
|---|---|---|---|
| shape in time | **point** (fast panic) | **range** (slow distribution) | a cross-detector works at bottoms, misfires at tops |
| what momentum means | exhaustion = the signal | overbought = the *fuel* of the bull | oscillator SELL is *noise* here (TOPPING base rate −0.11%) |
| evidence timing | **converges** | **accrues non-synchronously** while price still makes highs | you need *stacked* evidence over a window, not one print |
| locus | **idiosyncratic** (each name bottoms on its own capitulation) | **systemic** (most names top near one cycle turn; the index leads) | **flip the data flow** |

The last row is the sharpest consequence and the core design idea:

> **The buy funnel is bottom-up (name confluence → sector context). The sell funnel
> should be top-down (market/sector cycle distribution → name-level exit
> escalation).**

We already have the seed of this: the Subsector Confluence desk's `headwind_warn` —
"a name whose own gate fires but its subsector is TOPPING/SELL" — is a validated
*don't-chase-distributed-leadership* edge. That is the top-down sell funnel in
miniature. §5 generalizes it.

---

## 4. The Distribution Cascade `D1–D4`

A per-position state, graded by **how many independent evidence axes agree**, gated by
trend integrity, mapped to an **action ladder**. Mirrors T1–T4 in shape; inverts it in
philosophy.

### 4.1 The six evidence axes (each a "key")

| axis | question | primitives (validated / source) | role |
|---|---|---|---|
| **A · Trend integrity** | is the trend healthy enough to ignore heat? | `strong_bull` (live), Kaufman efficiency-ratio, EMA8 slope, above200 | **VETO / suppressor** — strong ⇒ demote every other axis |
| **B · Oscillator exhaustion** | is momentum hot? | `CS`, `stoch_roll`/`rsi_roll`, X5 zone | weakest key — **alone ⇒ D1 only, never exit** |
| **C · Structure break** | did price structure actually break? | fresh EMA8/21 breach + failed reclaim, lower high, weekly-bull loss, 200DMA loss (XV2 ⛔) | **primary escalation key** |
| **D · Distribution character** | is supply overwhelming demand? | RS-vs-SPY rollover (sector_signals), volume character, bearish divergence | confirmation key |
| **E · Crowding/exhaustion** | did late demand become forward risk? | EXIT_CROWDING L1–L4 (call-share, IV blowout, P/C-OI collapse, ETF-flow) | future key — **ACCRUE, not usable yet** |
| **F · Systemic cycle context** | is the *market* distributing? | §5 gauge (breadth divergence, sector TOPPING breadth, credit de-risk, CPI hazard) | **top-down multiplier** on sensitivity |

### 4.2 The tiers and the action ladder

**Two-key rule:** anything above "watch" requires **≥2 axes from different families**
(a structural key *and* an independent confirmation). Oscillator heat (B) is never a
key on its own. Trend integrity (A) can *demote* any tier by one step.

| tier | trigger (evidence stack) | action bias | authority |
|---|---|---|---|
| **D0 · hold** | no evidence beyond noise | hold | display |
| **D1 · cooldown** | B only, A intact | hold ("historically ~half resolve up") | display |
| **D2 · tighten** | B + one soft context (early D, or F=sector TOPPING), A intact | tighten mental stop | display |
| **D3 · trim** | **C** (structure break) **+** (D or F), while extended (big MFE) — the XV2 ⛔ event | partial de-risk candidate | **shadow until gauntleted** |
| **D4 · exit-review** | **C + independent confirmation** (weekly-bull loss + RS rollover; or C + F breadth divergence + E crowding) | review closing the position | **forbidden as auto-sell until separately evidence-cleared** |
| **hard-risk exit** | catastrophic stop / major support loss / thesis break — the *legitimate* core of `revSell` | exit | risk mandate, **not alpha**; exits alone |

This directly inverts the failure mode. Today: one `revSell` print → CUT. In the
cascade: oscillator heat → **D1 hold**. A sell only escalates as *independent
structural and systemic evidence stacks* — which, by construction, happens **later and
closer to the real distribution top** than an oscillator cross does.

### 4.3 Re-entry regret is a first-class output
Every D3/D4 emits `{reentry_condition, cooldown_until, repair_watch, last_exit_reason}`.
The existing `revBuy` is the re-entry primitive. Selling a bull-market winner and never
re-entering is the most expensive failure; the ladder must be **reversible by design**.

---

## 5. The top-down cycle layer (the literal "time tops in cycles")

Computed once at the **market and sector level**, published as context, and used to set
each name's cascade **sensitivity** (how much name-level evidence D3/D4 require). This
is where cycle-top timing actually lives, because these signals *lead* and are
*systemic* — exactly where CPI's null on *per-name price-state* does **not** apply.

**Legs (all display-class; F is a *sensitivity dial*, never a per-name trigger):**

1. **Breadth divergence** — % of universe above 200DMA / making new 52w highs *rolling
   over while the index makes new highs*. The classic cycle-top tell; it leads price.
   ⚠ **Honesty flag:** CPI found breadth *as an additive hazard predictor* harmful
   (FT-1). This leg is a **different use** (a display-class divergence flag that raises
   trim sensitivity), and it therefore **must be pre-registered and validated on its
   own**, not assumed. Until then it is a chart annotation, not a dial input.
2. **Sector-rotation distribution** — count of the 11 SPDRs in TOPPING/SELL; late-cycle
   leadership (defensives/energy leading tech). Validated rotation edge; `headwind_warn`
   already ships this per-name.
3. **Credit / liquidity de-risk** — `m_hy_oas` widening, `m_nfci` tightening. Validated
   as de-risk legs (maxDD −49.5→−39.5 at same Sharpe). The market-level exposure dial.
4. **CPI hazard / next-phase** — the 4/6 hazard cells + TR-1 softmax, *as published
   display-class probabilities*. Cycle-phase context, never a trade trigger.

**Mechanism:** when the top-down gauge reads "distribution regime," a name needs
*less* idiosyncratic evidence to reach D3/D4 (e.g. C alone can promote); in a clean
broad bull, D3/D4 demand the full two-key stack and A suppresses aggressively. This is
the reconciliation: **you time the top at the aggregate and let it tune the exits on
the names — you never ask a single stock's oscillator to call its own top.**

---

## 6. Two refinements worth a pre-registered test

Both respect the kills in §2.2; both are falsifiable.

1. **Giveback-triggered, not MFE-triggered, trim.** TV-trim died because it trimmed on
   *being up ≥30%* — it capped the winners. A different trigger: trim only after price
   **gives back X% *from its peak* AND structure breaks (C)**. XV2 shows the
   giveback-harvest is real (0.066→0.019). This lets winners run and acts only once the
   top is *confirmed rolling*, the opposite of capping. **Test:** does giveback-trim
   beat X1-no-cut on deep-giveback rate *without* costing right-tail expectancy?
2. **Asymmetric confirmation windows.** Bottoms are points → the buy side anticipates
   (CONF_W=8). Tops are ranges → the sell side should **confirm over a longer window**
   and require *price* confirmation (lower high + breach + failed reclaim), not
   oscillator anticipation. **Test:** widen the sell confirmation window; measure
   false-exit regret vs deep-giveback rescued.

---

## 7. Terminal integration

Product is display-only; this fits natively.

- **Do not overload the marker stream.** Keep `CB/CS/revBuy/revSell` markers as-is (but
  render `revSell` as a *caution dot* once §9-step-0 ships). Add a **side-channel
  per-ticker artifact** `exit_trim_state.v1` (Codex's schema is good): `action_bias`,
  `exit_pressure` (0–100, display), `roles`, `trend_integrity`, `trail`,
  `position_lifecycle` (bars-since-entry, MFE/MAE, giveback), `escalation_keys`.
- **New "Exit & Trim" panel** beside Last Signals: current action bias, role chips
  (cooldown / structure-break / distribution / crowding / systemic), trend integrity
  (strong/fragile/broken), and *"what would escalate this"* keys.
- **Distinct glyphs by authority:** trade markers = existing triangles/✕; display exit
  flags = shield/amber dot; trim-watch = half amber; re-entry-watch = hollow green
  circle. The visual language must make "display-only" unmistakable — never let a
  cascade flag read as an evidence-cleared sell.
- **Market context strip** for the §5 gauge (breadth/rotation/credit/hazard), so the
  per-name sensitivity is legible to the user.

---

## 8. Validation discipline — house law, non-negotiable

The house has been burned by backtest-only confidence (the regime router looked great
on hand examples, failed cross-sectionally). Therefore:

- **Everything ships display-only first.** D1/D2 and the §5 gauge can stay display
  forever and still be valuable.
- **Hard sell authority (D3 trim, D4 exit) must clear the same gauntlet as entries:**
  held-out cross-section (Half-B), next-bar fills, and a **pre-committed joint
  DD+capture floor** (the 70% floor that killed the v5 exits).
- **Metrics:** avoided MAE, foregone MFE, false-exit regret, re-entry regret,
  deep-giveback rate, capture retention, and **expectancy (the binding killer in every
  prior kill)**.
- **Baselines:** live `revSell` exit; **X1-no-cut** (the real bar to beat); display
  EMA8 tail flag; hold(21)/hold(63)/hold(126) clocks.
- **Shadow ledger:** accrue each role *prospectively* before any promotion.

### Falsifiers (pre-commit; demote on any)
- D3/D4 cannot beat **X1-no-cut** expectancy on held-out names → **display-only
  forever** (this is the *expected* base case, per §2.2 — say so plainly).
- `cooldown`/D1 does not reduce false sells or re-entry regret vs baseline.
- The §5 breadth-divergence leg fails its own pre-registration (given FT-1) → it stays
  a chart annotation, out of the sensitivity dial.
- Role labels too sparse to be useful, or the UI makes users read display flags as
  cleared sells.

---

## 9. Build path (ranked)

0. **Ship X1 no-cut** (validated, +48% expectancy, unshipped). Drop `revSell` from the
   scored exit in the traded path; keep `revBuy`; render `revSell` as caution dot; add
   X5 ⚠ and XV2 ⛔ as display markers. *Highest ROI, lowest risk, needs only owner
   go + VPS coordination.* Re-stage the GC-v2 backend (prior stage was in volatile
   `/tmp`). **This step alone is most of the answer to the owner's complaint.**
1. **`exit_trim.py` (pure, display-only)** — trend integrity (A), structure break (C),
   oscillator role (B), timebox, action ladder. No external data. Emits
   `exit_trim_state.v1` side-channel + the Exit & Trim panel.
2. **Top-down cycle gauge (§5)** — market/sector artifact feeding per-name sensitivity;
   reuse `sector_signals` TOPPING breadth + `m_hy_oas`/`m_nfci` + CPI hazard. Breadth
   divergence leg gated behind its own pre-registration.
3. **Shadow ledger + pre-registered replay** for D3/D4 → promote *nothing* to hard
   authority until it earns it against X1-no-cut.
4. Distribution character (D) and crowding (E) legs as they accrue/validate.

---

## 10. Honest expected outcome

The most likely truthful result, given four prior kills and a null cycle-prediction
program, is: **the durable wins are (0) the validated `revSell` removal and (C) a
display-only, top-down-aware Exit & Trim layer that stops the system from reading
bull-market heat as a sell and flags the *real* distribution process 20–40 sessions
before the deep giveback.** A new *auto-sell* that beats buy-and-hold's right tail is
unlikely and must not be assumed. That is not a failure — it is the same lesson the buy
side already learned (near-low + fresh-cross was a drawdown reducer, not alpha).

**One sentence:** Stop hunting the perfect sell print; ship the validated early-sell
removal, and build a graded, reversible, top-down-aware Distribution Cascade that lets
winners compound and escalates to trim/exit only when structural, distributional, and
*systemic-cycle* evidence agree — timing tops as a process at the aggregate, not as a
point on each chart.
