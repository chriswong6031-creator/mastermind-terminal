# QuantData Parity — Handoff & Renewed Build Plan (2026-08-02)

**For the session taking over the QuantData integration.** Written 2026-08-02 by the session
that ran the Market Structure Core (MSC) program through R2.4b, on operator instruction. This
doc supplements — does not replace — the program of record:
`docs/OPTIONS_SUPERINTELLIGENCE_MASTERPLAN_2026-07-31.md` (its **⚡ EXECUTION LEDGER is the
shared truth**; claim your lanes there in your first PR, per its coordination protocol).

---

## 1. Operator directives (2026-08-02 — these supersede older doc language)

1. **Full feature-parity clone of QuantData's features into our site, structured so ours is
   better than theirs in every regard.** Not "capability parity in our own idiom" — the old
   house-idiom conservatism is gone (see §2). Their layout, structure, IA and feature set are
   explicit build targets; where we deviate, it must be because ours is *better*, not
   because ours is *ours*.
2. **The intraday transition is a must.** The Terminal options estate is mostly intraday
   already (tape, tide, live flow poller); the whole system is transitioning intraday.
   Building new surfaces EOD-first is the wrong default — EOD is the fallback tier, not the
   product. (The nightly dealer-positioning plane — gex/hub builds — is the part still on
   EOD cadence; the U-CHAIN keystone below is what moves it.)
3. **Live data arrives ~2026-08-04/05** ("next 2-3 days"), timed with live marketing ads and
   real traffic. The new session must find out exactly which feed/tier was purchased and
   re-gate every data-gated item accordingly (R1 calibration, R4 alerts latency, R7,
   live-vs-delayed chrome). Record what was bought HERE and in the ⚡ ledger when known.
4. **No overlap** with what this session and the MSC sibling program already shipped —
   §4 and the collision table in §6 are the anti-overlap map.

## 2. Rescinded laws — do not re-import

Operator rescission, 2026-08-02 (also stamped in `terminal/AGENTS.md` and MSC masterplan §9):

- ~~"The design system is REAL and locked … house idiom wins"~~ — **RESCINDED.**
- ~~"paraphrase only — never copy their copy" as a design/feature constraint~~ — **RESCINDED.**

These sentences still appear in older audit files and possibly in stale session memories.
**Do not re-add them to any law file, and do not let them shape build decisions.** Per the
operator (2026-08-02 follow-up): the ONLY thing that stays out of the product is their
*logos/brand marks*. Text, assets, layout, structure, IA, feature semantics: fair game and
the target.

Terminal v5 tokens/primitives (`app/globals.css`) remain the shared *implementation base*
(theming, east-flip/zh safety, responsive plumbing) — use its tokens so surfaces stay
coherent, but structure follows QuantData-parity goals, not a house idiom.

## 3. Read before any work

1. `docs/OPTIONS_SUPERINTELLIGENCE_MASTERPLAN_2026-07-31.md` — the program: census (§1),
   gap matrix (§3), roadmap R0–R8 (§4), IA redesign (§5), Prophet architecture (§6),
   operating model (§7). **⚡ ledger at top = live status; claim lanes there.**
2. `docs/MARKET_STRUCTURE_CORE_MASTERPLAN_2026-08-01.md` — the sibling. Division of labour:
   QD program = "see every print, replay every minute" (tape, filters, playback, IA);
   MSC = "interpret what the whole inventory does to price." Its §5 ledger lists what MSC
   shipped (a lot landed 08-01/08-02 — see §4 below).
3. Memory ledgers: `options-suite-parity-program`, `market-structure-core-program`,
   `options-tabs-production-sweep-lessons` (the 2/10 lesson: designed grids, Tips-not-prose,
   prod payload shapes, 3-viewport/zh screenshots), `flow-fixture-family-authoring`,
   `prod-repo-is-stale`, `deploy-topology`, `git-flow-commit-pr-merge-habit`.
4. Open PR [#164](https://github.com/chriswong6031-creator/mastermind-terminal/pull/164)
   (flat sidebar IA, /research→/options) — **still open as of 2026-08-02 evening.** R5 must
   absorb or supersede it explicitly; do not build around it silently.

## 4. State of the estate (as of 2026-08-02 late evening) — do not rebuild these

**QD program:** R0 fully done (seal top-up, cadence fix, tape schema v2 capturing OPRA
conditions since 07-31, two-tier ON, U-CHAIN + Sunday gex-history lanes bootstrapped,
dead-man anchors, chain-heat relight, Prophet dormant wires, dated GEX-ladder replay live).
R3 partially done: Volatility tab, Structure/OI suite shipped.

**MSC program (sibling, shipped through 08-02 — includes surfaces a QD census would count):**
- `/options` tabs live: Options Tape · Flow Desk · Tide · Tickers · Options Screener ·
  Exposure (incl. the Matrix view, ex-PRISM) · Surface · Structure · Volatility · **Positioning** · Prophet.
- Positioning tab: exposure profile (spot-grid re-priced curve + flip), dealer heat
  strike×expiry (5–95 pctile), ranked gamma strikes, sign-robustness w*, hedge-flow grid,
  front-expiry book, **Level Report Card** (live graded hold-rates vs equidistant-mirror +
  prior-day nulls, interval-separation verdicts — macro #4229/#4336/#4346, terminal
  #321/#338/#340).
- Distribution: "Options Levels" chart overlay indicator (#326/#329), ticker-page
  dealer-positioning block + screener `msc_*` columns (#334), `gex_state/_index.json`
  cross-root aggregate (macro #4292; on R2 via the Mon 16:00 mirror).
- §8 alert conditions live on VPS cron: `opt_gamma_flip`, `opt_wall_migration`,
  `opt_sign_fragile`, `opt_opex_concentration` (#318) — R4 must *generalize*, not re-add.
- Index grading lane live on m1 (SPY/SPX/SPXW/QQQ/IWM/DIA; backfill queue drains one
  year/night to 2017; 2025 stocks year needs a requeue for null columns afterwards).

**Data plane facts:** m1 (`ssh m1`, ops checkout `/Users/chriswong/hub-ops-wt`, theta store
`/Users/chriswong/theta-ops-wt/data/thetadata_eod`) runs the option lanes via launchd;
R2 public bucket `pub-f7ffb4441c5f4ad983ca56ec7c651c61.r2.dev`; terminal deploy = git-gated
`/opt/terminal/terminal-build.sh` on `root@146.190.142.17` (merged master only; verify
`data-dpl-id`). Live flow poller `com.mastermind.liveflow` (current-day tape). U-CHAIN
snapshots accruing since 07-31 (`data/chain_snapshots/`).

## 5. Renewed build plan (priority order, with gates)

**W0 — day one (Mon 2026-08-03), before any building:**
- Run the **R0 verify gate**: live poller `meta.json` shows `delta_mode: time_window` +
  `two_tier: true`; confirm the first full session of captured OPRA conditions landed.
- Claim lanes in the ⚡ ledger; read PR #164 and record the absorb/supersede decision.
- Ask the operator which live-data feed was purchased (directive §1.3) and log it.

**W1 — R5 IA restructure, now unblocked and promoted.** With the design law rescinded and
the operator explicitly wanting QuantData-like structure, do the §5 IA redesign as the
*first* visible wave: tape-first, flow-centric organization; the 7-category IA; absorb #164.
Include the blind-spot surfaces (0DTE dashboard, largest-trades, chain browser, P/C history,
exp-vs-realized, export). This is the wave that answers "visually we aren't similar" —
front-load it. Side-by-side against the §1 census screen-by-screen; every QuantData screen
gets a named home in our IA or a written "ours is better because…" deviation note.

**W2 — R1 tape-truth classifier** (opens after the Monday gate): sweep/block/golden tiers,
5-tier side, per-trade greeks; calibrate against QuantData's UI before dropping the `~`
prefixes. With live data (§1.3) calibration can run against a live tape rather than replay.

**W3 — R2 keystone: intraday store + universal playback wrapper + 2017→ deep backfill.**
⚠️ **Shared keystone:** MSC's open R2.2 ("light U-CHAIN → 15-min intraday MSC frames,
intraday flip/wall migration, honest 0DTE") wants the same store. **Build the store/wrapper
ONCE in this program; MSC consumes frames from it.** Mark the MSC ledger's R2.2 as
"served by QD-R2" when you land it. This is also the operator's "intraday is a must"
directive made concrete — it moves the last EOD plane (dealer positioning) intraday.

**W4 — R3 remainder:** Statistics suite (buildable immediately — exchange codes retained);
Interval Map + Vol Drift (U-CHAIN accrual sufficient ~08-07); Exposure-matrix VEX/UNUSUAL-equivalent re-check
(verify vanna grids + 30d baseline, then light).

**W5 — R4 Filter Groups + alert generalization + filter bus.** Engine + Supabase persistence
can start against existing fields; the R1 enriched schema becomes its vocabulary when W2
lands. Generalize the §8 alert engine (`evaluate()` in the alerts lane) — four options
conditions already exist; do not create a parallel alerts path.

**R6 — Prophet superintelligence: joint design REQUIRED.** The masterplan is explicit: the
spine must be co-authored with MSC's signal layer so the two programs build ONE brain.
MSC's Prophet §7 is likewise open and flagged program-sized. Protocol: write the joint spine
design doc first (one PR, both masterplans updated), then build. Do not start unilaterally.

**R7 — dark pool / equities feed:** still the operator's spend decision (Polygon TRF vs
Databento) — *may be mooted or answered by the §1.3 live-data purchase; ask.*

**R8 — composability (My-Pages):** after R5, deliberately last.

## 6. Collision map (who owns what — check before building)

| Topic | QD program | MSC program | Owner |
|---|---|---|---|
| Intraday chain store + playback | R2 (keystone) | R2.2 U-CHAIN | **QD builds, MSC consumes** |
| Prophet spine | R6 | §7 | **Joint design doc first** |
| Alerts | R4 generalization | §8 conditions (shipped) | QD extends the ONE engine |
| Options IA / tab structure | R5 (+ PR #164) | Positioning tab lives inside it | QD owns IA; keep MSC tab content intact |
| Level/wall analytics, grades, gexstate, chart overlay | — | shipped (R2.4x, R3.x) | MSC; QD links to, never re-derives |
| Vol surfaces | R3 Volatility (shipped #287/#314) | R2.3 grammar (same PRs) | shared, done |
| Statistics suite / Interval Map / Vol Drift / tape tools | R3/R1 | — | QD |
| msc/v1 payload, pin calibration, pressure fields | — | R2.1 / R2.5 / R1.2-R1.3 | MSC (separate sessions) |

## 7. Laws that REMAIN in force (unchanged by the rescission)

- **Delivery chain (standing auth 2026-07-30):** commit → push → PR → CI → merge → git-gated
  deploy → live verify. Never leave work uncommitted; never rsync as a deploy.
- **Verification:** 1440×900 / 820×1180 / 390×844 + zh/EN leak checks
  (`npm run test:e2e:responsive`; known local flake families: drawing specs,
  company-intelligence, indicator-guides — CI is the arbiter). Fresh-incognito E2E for
  user-facing flows; artifacts in PR bodies.
- **Honesty tiering** (MSC masterplan §4.1): tier labels, no unfalsifiable claims, no fake
  LIVE chrome over delayed data. ⚠️ With the §1.3 live feed this *changes shape*: surfaces
  fed by a genuinely live stream may and should wear live chrome — re-gate per surface by
  actual feed basis (the quote-hub basis-labeling pattern), don't blanket-ban or blanket-allow.
- **Macro CI names test files** (two-halves law: run step in `.github/ci/legacy-jobs.yml` +
  trigger path in `.github/workflows/ci.yml`). Unnamed = never runs.
- **Terminal fixtures are gitignored by a local exclude glob** (`terminal/public/data/*.json`)
  — `git add -f` every fixture and confirm with `git ls-files` (grades_fixture.json shipped
  v1 *uncommitted* because of this; found 08-02).
- **Gesture-jank law (R3.3 lesson):** never ship a bulk row-sweep DOM commit on an async
  arrival — it can eat a phone double-tap (mobile-chart-chrome e2e catches it cold).
- Deploy/edge traps: EdgeOne caches prerendered pages ~1yr (purge needed) and caches
  /api/* 404s auth-blind; `BUILD_ID` is constant by design (verify via `data-dpl-id`);
  one Next dev server per project (kill zombies before e2e).
- Worktree/git law: fresh worktrees off `origin/master` (`claude/<task>` branches), never
  touch the primary checkout, never `codex/` branches, macro repo = same pattern off `main`.

## 8. Definition of done for the parity program

QuantData census §1 walked screen-by-screen with every capability marked
**have / have-better / gated(named gate)** — zero "missing" rows left, the IA reorganized
per §5 with #164 resolved, intraday store live and feeding both programs, and the live-data
tier wired with honest basis labels. Ledger flipped as you go, in the same PRs.

---

## 9. Continuation-session rulings (2026-08-03, appended by the taking-over session)

0. **P0 Tickers-drill crash — root-caused, fixed in this PR.** `volData.atm_iv.toFixed(1)`
   (OptionsHubView.tsx:2999) with only a root-match guard; the nightly contract
   legitimately ships `atm_iv: null` (`_empty_vol`, engine/options_hub.py, written and
   uploaded unconditionally) for thinly-covered roots, so any such name in the rail
   crashed the whole app to the root error boundary. Introduced by f6a6dc60 (#212) which
   dropped the old `* 100` null-coercion; invisible to tsc because the local `VolPayload`
   typed `atm_iv: number` (every other declaration in the repo is nullable) behind an
   `as unknown as` cast. Fix: sibling-chip honest-null idiom + type widened to
   `number | null`. Live-reproduced pre-fix and re-verified post-fix by injecting an
   `_empty_vol`-shaped `f=vol:` payload. Not caused by #334/#338/#340; fixture mode masks
   it (all three vol fixtures carry numeric atm_iv). No macro-side change needed — a null
   ATM IV is honest display-tier data; the terminal must guard.

1. **PR #164 — CLOSED as superseded (W0 item done).** Evidence: 295 commits stale,
   single-commit PR; master independently ships its entire intent (flat 7-item AppNav,
   every redirect incl. `/research→/options`); the one substantive design disagreement
   (Leaders/Radar home) is resolved on master in the §5-R5 direction (→ Discover), which
   #164 contradicted. Rebasing would re-litigate a settled design against the masterplan.
   Salvage check outstanding: #164's multi-watchlist pill switcher — not confirmed present
   on master's PortfolioView; if missing it is a small separate lane, not an R5 blocker.
2. **Exposure vs PRISM — operator's overlap complaint adjudicated by executing §5.3**
   (PRISM merges into Exposure). PRISM and gexdesk were same-commit siblings (PR #20)
   never differentiated; PRISM's charter lenses (VEX/UNUSUAL) never lit while Exposure
   shipped vanna/charm live; PRISM's MatrixGrid painted dealer GEX in price-direction
   tokens (inverts under zh east theme) with the opposite sign of MSC's MatrixHeatCard one
   tab away. Merge build: shared sign-correct matrix renderer (MSC conventions, PRISM's
   controls: 4|8 cols, scope, ±range, norm, Σ column, badges), Confluence + HeatSeeker
   ported, OiMoversRail dropped (duplicates Screener ΔOI preset), `?tab=prism` aliased to
   Exposure, `terminal/components/prism/` deleted after port.
2b. **Surface "bland chart" ruling** — the field is ALREADY a continuous gradient; the
   defect is raw day-max normalization (one outlier crushes the field;
   `gridMaxAbs` in `lib/surfaceContract.ts`). Fix = the 5–95 percentile normalization MSC
   already validated (R1.4/MatrixHeatCard), plus zero-new-data signal overlays consuming
   shipped payloads: walls/flip/EM lines (`lib/optionsLevels.ts`), regime chip
   (`lib/mscGlance.ts` over `gexstate:`), OI-Δ top-strike highlights (`oi_change:`), each
   with nightly "as of" provenance (no LIVE chrome). Palette/intensity-curve/contour work
   is NOT ours: pre-registered MSC R1.2 (still open) — do not build unilaterally.
   2nd-order-greek overlays stay gated on a U-CHAIN R2 publisher (none exists).
3. **Volatility/Structure whitespace** — root-caused (VRP's extra 4-tile KPI row vs 190px
   sibling charts; Structure's mixed fixed/dynamic pair heights). Fix per operator's own
   suggestion: equalize card totals (raise ATM-IV-History + Term, trim VRP; Structure row-1
   pair driven by one shared ladder-height calc, row-3 pair equalized).
4. **"Static fields" liveness read** — confirmed accurate and BY DESIGN (nightly EOD, one
   SWR fetch per root, honest "as of" chips, deliberately no LIVE chrome). The genuine fix
   is the W3/R2 intraday store keystone, not cosmetic polling; do not fake live chrome.
5. **Live-feed purchase (directive §1.3)** — still UNANSWERED as of this session; the
   operator has not yet named the feed/tier. Re-ask on next contact; R1 calibration basis,
   R4 alert latency, R7, and live-chrome re-gating all remain provisional until recorded
   here.
