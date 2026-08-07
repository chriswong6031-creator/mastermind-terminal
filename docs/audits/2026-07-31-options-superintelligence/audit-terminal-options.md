# Mastermind Terminal — Options Suite Front-to-Back Audit

Audited worktree: `/Users/chriswong/Documents/Cluade/charting-app/.claude/worktrees/terminal-chinese-text-crypto-323a48/terminal`
Date: 2026-07-31. Read-only audit; line anchors refer to files as of branch `claude/quantdata-terminal-options-gaps-33ceb8` (base 5b653977).

---

## 0. Route & entitlement topology

| Route | File | Gate |
|---|---|---|
| `/options` | `app/(shell)/options/page.tsx` (27 lines) | Server-side `hasLiveOptions()` (macro-api `terminal_live_options` feature via `/api/me`; `lib/entitlement.ts:149-153`); non-entitled → `<OptionsPaywall/>`; `FLOW_FIXTURE=1` exempt (L25) |
| `/discover` | `app/(shell)/discover/page.tsx` | Signed-in only (`SignupGate` for guests, L22); hosts Stock Screener, Heatmap, Leaders, Radar |
| `/api/flow` | `app/api/flow/route.ts` | Same `hasLiveOptions()` gate (L29-34), rate-limited, 403 `pro_required` |
| `/api/flow/stream` | `app/api/flow/stream/route.ts` | Same gate at connection open (L48-50) |

Redirect layer (`next.config.*` ~L123-179): `/screener → /discover?tab=screener`, `/heatmap → /discover?tab=heatmap`, `/research → /options`, `/flow?tab=leaders → /discover?tab=leaders`, `/flow?tab=radar → /discover?tab=radar`, all other `/flow` (incl. `?tab=tape/desk/tide/tickers/vol/gex/prism/prophet`) `→ /options` with query passthrough. The Options suite is excluded from native app shells per `AGENTS.md` (feature manifest + webview route policy), web untouched.

Paywall: `components/OptionsPaywall.tsx` — v5-idiom card, `Insider · Pro` eyebrow, 4 feature bullets (`opwF1..F4` LEX keys), CTA opens onboarding signup with `plan:"insider"`.

---

## 1. The `/options` workspace shell

### 1.1 `components/workspaces/OptionsWorkspace.tsx` (150 lines)
- Renders ONE sub-nav (`WorkspaceTabs`) above `OptionsHubView` run **controlled** (`activeTab`+`onTab`, `hideTabStrip`).
- Tab registry (L52-62): `tape · desk · tide · tickers · vol · gex · surface · prism · prophet` (page keys → LEX label keys `wtOptionsTape/wtFlowDesk/wtTide/wtTickers/wtOptionsScreener/wtGex/tabSurface/wtPrism/wtProphet`).
- Key mapping `HUB_KEY` (L32-43): page `vol` **and** legacy `screener` both → hub `screener` (the Options Screener). The old standalone "vol" surface was folded into Tickers.
- URL state: `?tab=` written shallowly via `window.history.replaceState` (L104-116), deliberately avoiding `useSearchParams` CSR bailout; seeded client-side on mount (L83-100).
- Escape hatches on mount: `?tab=leaders|radar` → `window.location.replace('/discover?tab=…')` (L87-90); `?tab=fundamentals` → `/analysis` (L93-96).
- Hub-internal drills (e.g. Screener row → Tickers) sync the URL through `onHubTab` (L123-130) so a copied URL reproduces the screen.

### 1.2 `components/chrome/WorkspaceTabs.tsx` (121 lines)
Pure controlled pill-nav primitive (`.obs-pillnav` idiom): `role=tablist`, roving tabindex, ←/→ wrap, Home/End (L61-90). i18n via LEX `t()` with optional `zhLabel` override that only applies when the dict misses (L52-59). Shared by Discover/Options/Automate.

---

## 2. OptionsHubView — the hub engine (`components/OptionsHubView.tsx`, 4,599 lines)

`TabKey` (L81): `prophet | desk | tape | tide | tickers | screener | gex | surface | prism | leaders | radar`. Heavy tabs code-split `ssr:false` (L33-77): FlowDeskView, GexDeskView, SurfaceView, SessionFlowPane, PrismView, ProphetView, TideChart (`components/TideChartLazy.tsx` — the hub's only `lightweight-charts` consumer). Keep-alive: visited tabs stay mounted `display:none` (desk L2195, gex L3773, surface L3780, prism L3787, prophet L3794).

Controlled/uncontrolled dual mode + `allowedTabs` restriction (L1450-1533); `tickers` implicitly allowed whenever `leaders`/`radar` is (Discover drill contract, L1475-1480). Header row (L2106-2156): internal pill strip (suppressed under /options), `VolRegimeChip` when acting as a hub (`stripTabs.length>1`, L2113), "Live" dot + as-of + `delayed` chip for Tape/Tide. Status banner (L2159-2185) distinguishes unavailable / delayed-during-RTH / market-closed via `isUsMarketHoursNow()` (L520-533; holidays not handled — noted in code). Global footer disclaimer (L4590-4595): "heuristic and approximate (~) … not investment advice."

Shared data spine inside the hub:
- `feed` — **SSE, unconditional** (`useFlowStream("feed")`, L1542); also drives cross-tab consumers (unusual_names → ticker candidates) and freshness chrome.
- `heat` — 45 s poll with `flowInvalidate` first (L1548-1651), visibility-gated.
- `tide` — SSE **only while the Tide tab is active** (`activeTab === "tide" ? "tide" : null`, L1566); the hook keeps the last payload after leaving.
- Lazy on-activation fetches: `dte` once (L1573-1579), `ctx` for Tide+GEX (L1966-1970), `oiconf` for Tape (L1934-1952), screener `oi`+`hot` (L1812-1828), `leaders` (L2014-2027), `radar` (L2035-2048); prefetch warms `prophet_idx`+`manifest` on Prophet activation and `tide` on Desk activation (L1666-1669).
- i18n: LEX tuples in `lib/i18n.tsx` (`useT`/`useLang`) for everything rendered inline in this file.

### 2.1 TAPE tab (inline, L2202-2583)
- **Renders**: index/sector chip belt (SPY/QQQ/IWM via `drillTicker`; sector chips from `heat.groups` via `groupFilter` — mutually exclusive, L2207-2250); "Highlights" belt (3 biggest prints + 3 top repeat-hitters, display-only ordering, L1755-1765 + L2254-2280); filter bar (presets dropdown, min-premium select $100K–$5M, DTE bucket chips + 8–90d quick-toggle, moneyness chips, ticker text filter, reset, L2283-2371); drill card for the selected root with running premium / activity band / top contracts (L2374-2400); the tape table (Time·Ticker·Sector·Side·C/P·Contract·DTE·Mny·Size·Prem·Flags — column order load-bearing for ≤640 px nth-child hiding, L2057); Activity-Leaders rail (`unusual_names`, L2541-2563); provenance footer with shown/total print counts (L2566-2581).
- **Data**: `f=feed` via SSE (scored server-side with `flowScore` — see §8); `f=heat` 45 s poll; `f=oiconf` one-shot (OI-confirmed flag per contract, O(1) set lookup L1949-1952).
- **Cadence**: SSE push-on-change; skeleton table with per-column shimmer widths while awaiting first frame (L557-558, L2420-2448).
- **Controls**: sort by time/premium; 4 presets (`large_buys`, `repeat`, `zerodte`, `puts_strength`, L592-618); windowed rendering 150 rows + IntersectionObserver infinite scroll (L1711-1724); typed-ticker settle tracking → `trackSearch(…, "flow-tape")` after 1.2 s (L1624-1629).
- **Empty/honesty**: four-way empty copy — filters exclude / feed stalled during RTH / market closed / genuinely quiet (L2453-2483); feed-unavailable card (L2405-2416); flags rendered: 0DTE, vol>OI, repeat, swept, OI-confirmed.
- **Limitations visible in code**: direction is `~`-soft everywhere ("direction ~inferred"); `session_pct` unused here; `swept` optional field.

### 2.2 TIDE tab (inline, L2586-2825)
- **Renders**: hero LWC chart of cumulative NCP/NPP + SPY overlay (`TideChart`, 216 px, L2649-2652) OR the quanted-style Session Flow pane sub-view (toggle L2629-2642); sector-tide card grid with sparklines + ETF-flow proxy chip (from `ctx.sector_etf_flows` keyed by SPDR ETF via `SECTOR_ETF` map L480-489); Top Net Impact ranked bars (top 20, legend explains green/red, L2724-2782); DTE-bucket tide cards with own as-of line (L2785-2821); Market-Tide tutorial launcher (coach module 7, L652-668).
- **Data/cadence**: `f=tide` SSE while active (fixes an old never-refresh poll bug, comment L1560-1567); `f=dte` one-shot; `f=ctx` lazy.
- **Controls**: Tide|Session sub-toggle; sector card click → Tape with `groupFilter` set.
- **Empty/honesty**: stream-error vs loading split (L2590-2605); its own freshness clock (`tideAsof`), never the tape's (L1773-1793); DTE section prints its own as-of ("its own cut").

### 2.3 TICKERS tab (inline, L2834-3183)
- **Renders**: left sidebar candidate list + search; main drill: header chips (Day Gross / Net / Call% / Activity band + ATM IV + IV Rank from vol payload + tctx z-band chips), provenance line fusing live intraday cut with nightly vol build date (L3016-3027); LEFT column — MinuteNetChart (SVG, svgChart-compliant, L914-962), Top Contracts table, ExpiryBars; RIGHT column — premium **StrikeLadder** (hub-local, L672-867: spot/ATM≈, call/put walls = max premium strike, premium-weighted max pain, near ±18%/all toggle, hover inspector, totals share bar) and the folded-in **Vol Surface** (IvRankHistory sparkline 0-100 fixed domain, TermStructureChart log-DTE ATM IV, SmileChart first-2-expiries with missing-quote gap segmentation + gapped-strike count, L3118-3169).
- **Data**: `f=ticker:{ROOT}` (guards on `payload.day`, L1587-1596), `f=vol:{ROOT}` (normalized via `normalizeVolUnits`), `f=tctx:{ROOT}` (z-scores warm-gated at history_n < 20 → "—", L2992-3013). One-shot per selection, no poll.
- **Controls**: ticker search — **session-scoped**: candidates = tide `top_net_impact` ∪ feed `unusual_names` only (L1796-1805), honest empty explains this (L2886-2902).
- **Limitations**: candidate list depends on `tideData`, which only populates once the Tide tab has been visited (tide SSE keyed on active tab) — before that, only `unusual_names` seed the list. Vol data is nightly; drill is intraday — provenance discloses both.

### 2.4 SCREENER tab — "Options Screener", URL `?tab=vol` (inline, L3189-3759)
- **Renders**: pinned filter head (preset chips + index/sector belt + per-preset provenance; head capped `40svh` for mobile, L3195-3320) over ONE scroll region with six preset tables:
  - `top_prem` — unusual_names by gross premium (L3349-3412)
  - `unusual_z` — by |prem_z| with "N warming baselines hidden" (L3415-3484)
  - `fresh` — per-root vol>OI event counts+premium from feed.events (L3487-3552)
  - `doi` — ΔOI builds from `f=oi` (nightly; "ΔOI = OI(t-1)−OI(t-2)" footnote, L3555-3620)
  - `zerodte` — 0DTE premium/share per root (L3623-3688)
  - `hot` — hot contracts by premium|volume from `f=hot` (nightly, L3691-3756)
- **Data/cadence**: feed (SSE, shared) + `oi`/`hot` fetched once on tab activation (L1812-1828). Rows click-through to Tickers drill (`switchTab("tickers")`).
- **Empty/honesty**: `scrEmptyRow` distinguishes belt-filtered-to-zero (with unfiltered count + clear button) from session-empty, from nightly-not-run, from market-closed (L1846-1896); coverage banner "ETF universe · single names expanding" (L3243); per-preset provenance says intraday vs nightly-close (L3294-3317).

### 2.5 GEX tab → GexDeskView; SURFACE → SurfaceView; PRISM → PrismView; PROPHET → ProphetView — thin keep-alive mounts (L3773-3798). See §3-6.

### 2.6 LEADERS tab (inline, L3800-4138) — *rendered only under Discover*
- **Renders**: header (as-of, top-N of universe, sessions n/required, stale chip), cold-start banner, board toggle **Flow Leadership (A)** / **Washout Turn (B)**, table with recurrence/days, net-prem-per-$bn-cap, flow-activity band, K/N leg chip clusters (8 tri-state legs per board), Board-B oscillator chips (2W MACD/StochRSI), de-escalation warn chips (earnings/vol/put-hedge/gamma/0DTE), signing-source tag; sources footnote.
- **Data**: `f=leaders` one-shot on activation (nightly artifact `flowleaders/leaders.json`).
- **Empty/honesty**: "publishes after tonight's build" absent state (L3811-3820); accruing rows render with "accruing" markers; server caps 25/board.

### 2.7 RADAR tab (inline, L4143-4586) — *rendered only under Discover*
- **Renders**: lifecycle board grouped by state (CROWDED→LEADERSHIP→BREAKAWAY→CATALYST_WINDOW→QUIET_ACCUMULATION→SUPPRESSED→FAILED→NONE, L4182-4186), regime banner with chips (dispersion/corr/Zweig etc.), coverage line with revision-uncovered hover, per-row evidence tri-state chip dots, de-escalations, fire badges (watch-window / onset entry), 2W/2D oscillator chips, NONE toggle, Handoff Watch pairs, Re-rating Watch table, honest footnote ("4H data for select names only; null-honest elsewhere").
- **Data**: `f=radar` one-shot (nightly `leaderradar/radar.json`); UTC as-of shown raw.

### 2.8 Dead/orphaned code inside OptionsHubView
- **Old inline GEX desk deliberately preserved** (comment block L3761-3772 "do not delete"): `GexStrikeLadder` (L1234-1376), `GexExpiryBars` (L1380-1420), `GexHistSparkline` (L1182-1219), plus live state/fetch plumbing `gexSearch/selectedGexRoot/gexData/gexLoading/gexGreek/gexCandidates/fetchGex` (L1977-2006). `setSelectedGexRoot` is never called by any UI → the fetch can never fire; ~400 lines of unreachable render code plus `GexHistRow/GexPayload` hub-local types shadowing gexdesk's own.
- `GexHistSparkline` still uses `preserveAspectRatio="none"` (L1197) — a chart-law violation, tolerated only because it is unreachable.
- Leaders/Radar types + render (~1,300 lines incl. L241-425 types) live in this file although the tabs are only ever mounted from Discover.

---

## 3. FlowDeskView — the Flow Desk (`components/flowdesk/`, ~3.4k lines)

`FlowDeskView.tsx` (611): three-pane MomoEdge-parity desk.
- **Layout**: LEFT `FlowGauge` (session premium split, dead-zone ±8pp → "MIXED", no bull/bear styling) + `WatchlistRail` (session overview, per-ticker chips, localStorage `flowdesk.watchlist`, L95-109) + `RadarStrip` ("Smart Money Radar" over unusual_names); CENTER `FeedPane`; RIGHT `ChainHeatRail` + `InspectorPane` (`has-sel` hands height to inspector, L576).
- **Data/cadence**: `feed` — shared SSE (L296, LIVE badge honest because intraday); `tide` 60 s poll (L92, L333-337); `chainheat` 45 s poll (L93); `enrich` (3.2 MB tier/detection artifact) deferred to `requestIdleCallback` then 5-min poll, 16 h stale gate with fixture exemption (L345-421). All polls visibility-gated.
- **FeedPane.tsx** (816): presentational; view presets `ALL | ELITE | WHALES | 0DTE | SWEEPS` + sort persisted in localStorage `flowdesk.views` (L227-250); v1 client-derived badges with v2 enrich-tier fallback logic (`normalizeEnrichPayload`).
- **FiltersPanel.tsx** (459): controlled slide-in; lean filter uses neutral "~buy lean/~sell lean" language (honesty doctrine header).
- **InspectorPane.tsx** (409): pinned identity hero (ticker·contract·premium·ring·tier) outside the scroller; 2-col KV grid; amber tick-rule caveat; fetches nothing (parent fetches `ticker:{root}` on selection, guarded on `.day`, L367-373).
- **ChainHeatRail** (inline L146-282): campaigns from `f=chainheat` sorted by cumulative premium (≥ threshold_mn, default $3M); per-campaign lean (accumulation/distribution/contested — never buy/sell), alert count, span, first-seen ET, ask-share bar.
- **Tutorial**: auto-prompts once per browser (`flowdesk.tutorial.seen`, 1.5 s delay, L503-526); `TutorialOverlay` module system.
- **i18n**: `lib/flowdeskStrings.ts` (368 lines) via `makeFlowT(lang)` — its own string table, not LEX.
- **Honesty**: header doctrine "rank/color by MAGNITUDE, never by asserted direction" (L17-19).

---

## 4. Exposure/GEX desk (`components/gexdesk/`, ~4.8k lines)

`GexDeskView.tsx` (791):
- **Layout**: controls bar (ticker input + native `<datalist>` autocomplete of ~37 roots + 7 quick-pick chips + spot + as-of/staleness) → `GexSummaryBar` → `GexHistory` strip → `EodContextBelt` → two-pane body: LEFT `GexGuide` + By-Strike/By-Expiration toggle + `StrikeLadder`|`ExpiryBars` + `ExposureExpiryDrawer` (contained in left column with 58% height cap — layout-thrash fix documented L555-572, L746-758); RIGHT `MarketStateCard`.
- **Data**: `f=gex:{ticker}` — **SSE transport** (L184-190) but data is EOD-nightly, so deliberately **no LIVE badge** (comment L180-184); `f=gexstate:{ticker}` 60 s poll + visibilitychange refresh (L198-238); `f=matrix:{ticker}` one-shot (the only strike×expiry store; absent for many roots → lens reports itself unavailable).
- **Controls**: greek lens GEX/DEX/VEX/CHEX (`by_strike` carries all four; walls/flip suppressed for non-gamma — "not defined per-greek", L326-332); expiry lens All / 0DTE / All−0DTE / single expiration (owned here so both ladder and summary bar scope together, L169-177); Near/Wide strike windows in ladder.
- **Honesty gates**: gamma_flip dropped when > ±20% from spot ("bogus flip" guard L264-270); matrix-vs-gex session agreement (`matrixSessionsAgree`) darkens every narrow lens rather than mixing sessions (L299-311); scoped Net GEX discloses covered-strike count (L321-324); as-of shows date + "last session"/"{n}d old" chip (L344-366).
- **StrikeLadder.tsx** (1,519): signed exposure bars, NET|CALL/PUT split (gamma only), level badges WALL/SUPPORT/MAGNET/FLIP, spot row, flip divider, NOW|LADDER-MAX normalizers, matrix-driven per-strike expiry lens with em-dash for uncovered strikes, compact grid <420 px. Replay-aware via `EodReplayTag`/`offHead` (does not truncate — EOD store).
- **GexHistory.tsx** (313): scrubbable session scrubber over `history[]` (net GEX, flip, walls, regime per session) — "playback on the EOD data we already own"; γ-polarity chip always rides level+Δ+trend (regime-dynamics law); neutral colors (GEX sign is convention). svgChart-compliant (R1-R9 documented in header).
- **MarketStateCard.tsx** (996): renders `options_structure.gex_state/v1` — regime chip + thesis, stability ring, γ-polarity / hedge pressure / pin target, structural range bar, what-if-flip-breaks scenarios, always-visible passport caveat + single-name near-constant note.
- **ExpiryBars / ExposureExpiryDrawer**: net per-expiry bars; drawer adds bubble term-structure view; labelled Net-only, EOD, wears `EodReplayTag` while the workspace scrubber is off-head.
- **Empty states**: missing single-name snapshot named as a **coverage** gap ("nightly build re-pulls index anchors first" — matches memory `gex-single-name-pipeline`: keepalive scheduler only re-pulls 22 ETF anchors), L516-527.
- **i18n**: `gexStrings.ts` (394) via `makeGexT`.

## 4b. EOD context belt (`components/eodcontext/`, ~1.1k lines)
- `EodContextBelt.tsx` (127): one row = `StructureStrip` + `DarkPoolMini` for the desk's root. gex_state + ladder payload arrive as props; belt fetches only what it introduces: `darkpool` + `oiconf` whole-universe once, `moves:{ROOT}` + `vol:{ROOT}` per ticker.
- `StructureStrip.tsx` (274): walls/flip/expected-move/max-pain/IV-percentile/OI-confirmation; **every value stamped with its own store's session date**; ladder fallback disclosed on hover; "not published" never zero.
- `DarkPoolMini.tsx` (352): tagged / quiet / absent tri-state (absent split into not-covered vs artifact-missing); macro's verbatim lean vocabulary; EOD vintage stamped.
- `VolRegimeChip.tsx` (124): pass-through of macro `vol/regime.json` `game_plan` verdict; loading→renders nothing, absent→dim "unavailable" chip. Mounted in the hub header (OptionsHubView L2113-2136).
- i18n: `eodStrings.ts` (176).

---

## 5. PRISM matrix (`components/prism/`, ~3.4k lines)

`PrismView.tsx` (711):
- **Modes**: SINGLE (ticker matrix + right rail `HeatSeekerCard` + `OiMoversRail`) | CONFLUENCE (`ConfluenceView` SPY+QQQ+IWM).
- **Data/cadence**: `f=matrix:{root}` + `f=gexstate:{root}` on ticker change + 60 s poll; `f=oi` 60 s poll; hidden-tab guard with visibilitychange retry (L169-219). Cells-less payload → null → placeholder (fixture honest-empty convention, L142-151).
- **Controls**: ticker input; SINGLE|CONFLUENCE toggle; DTE column count 4|8; scope DEFAULT|0DTE|ALL (0DTE = dte<1 client-side, ALL emphasizes Σ column); strike range ±10|±20|±40; normalization PER-COL|GLOBAL; `LensBar` GEX|OI|VOL|ΔOI with keyboard 1-4, VEX + UNUSUAL rendered **disabled with honest tooltips** ("experimental — deferred", "accruing baseline"); ΔOI carries "PIT: OI[t-1]−OI[t-2]" caption.
- **MatrixGrid.tsx** (1,043): strike rows × expiry cols heat matrix; Σ pinned column; spot row highlight; quantile 5-tier intensity; level badges WALL/SUPPORT/FLIP/MAGNET/MAX PAIN; hover tooltip with raw values + formula unit.
- **Levels merge**: matrix.levels → gexstate fallbacks per level (L243-249).
- **HeatSeekerCard.tsx** (310): artifact's `heat_seeker` pick verbatim; `confidence` is a 0..1 **number** — tier strings read as malformed/absent (memory `flow-fixture-family-authoring` fix #218); non-removable "descriptive — not a recommendation".
- **OiMoversRail.tsx** (325): new-strike gate `oi_prev===0 && oi>=500`; mover gate `|d_oi|>=200 && oi_prev>=100`; limit 8; dedupe by strike|side.
- **ConfluenceView.tsx** (564): three matrices independently fetched, strikes normalized to fixed %-from-spot bands ±2.4% in 0.4 steps (13 rows); alignment chips when gexstate levels land within 0.5% across ≥2 indices; "index-only, descriptive" notes.
- **Honesty**: `magnitudeFirst` banner for GEX/ΔOI lenses; stale as-of shows date + age chip (L251-277).
- **i18n**: `prismStrings.ts` (232) via `makePrismT`.

---

## 6. Surface tab + replay spine (`components/surface/` + `lib/replayEngine.ts`, ~4.0k lines)

`SurfaceView.tsx` (427):
- **Roots**: hard-coded `SURFACE_ROOTS = ["SPY","QQQ","IWM"]` (L51); free-text input tells the truth for anything else ("no surface for X yet" state, L326-339).
- **Views**: single field | 2×2 quad (netprem/gex/vanna/charm) under ONE `ReplayProvider` + `SurfaceSyncProvider` (shared crosshair); quad candle interval 1/5/15/30 m; style popover (theme persisted, applied as inline CSS vars during render — effect-ordering bug documented L187-194); session-scoped pinned-strike chips.
- **Multi-day replay**: `surface_dates:{ROOT}` sessions index fetched per root (L170-185); picker rendered only when archived sessions exist; `ReplayProvider` re-keyed by `root:view:sessionDate`.
- **SessionFlowPane** mounted under the scrubber (collapsible; withdraws for archived sessions since tide is live-only).

`SurfacePane.tsx` (1,221):
- **Data**: `surface_idx:{ROOT}` (or `surface_idx_at:{ROOT}:{DATE}`) seeds replay stamps **once per root/session** (L385-400 — no poll, no SSE; see IA-11); `surface:{ROOT}:{STAMP}` / `surface_at:…` per scrubbed frame (server-truncated realized-so-far grids); `matrix:{ROOT}` for the strike-evolution modal's expiry breakdown; `/api/intraday?sym&tf&date` candles for the loaded session.
- **Rendering**: LWC candles over a custom `HeatSeries` premium-flow field; one price scale anchored to the candle extent with Fit price / Fit strikes; shader colors resolved from `--up/--down` with MutationObserver theme tracking; metric fallback to netprem when a greek is absent (quad cells exempt — they show "accruing", L421-429).
- `StrikeEvolutionModal.tsx` (401): per-strike intraday metric line with NOW marker (replay-aware by construction) + expiry breakdown at NOW; Esc/focus-trap.

`lib/replayEngine.ts` (305, pure/unit-tested): reducer (setStamps head-follow semantics, togglePlay-restarts-at-head), speeds 1/2/4/8× (700 ms base tick), keymap Home/End/Space/←/→, `sessionBands` scrubber annotations (open 09:30 marker; power-hour span gated on reaching 15:00; close marker gated on CLOSE_GRACE_MIN=10; clock-interpolated not frame-interpolated); forward-only macro calendar documented as why FOMC/CPI markers were NOT shipped (L170-183); engagement tracker fixing focusin-leak + listener-accumulation bugs (L241-305).

`replayContext.tsx` (143): `atHead` vs `live` split (archived head ≠ present) — everything present-only keys off `live`; publishes position to `replayBus`.
`replayBus.ts` (113): workspace-wide broadcast of POSITION only; subscribers decide honesty locally — intraday panes truncate, EOD stores tag `offHead` via `EodReplayTag`, live-only payloads withdraw when `archived`. Single-publisher contract with remount-safe release.
`ReplayBar.tsx` (378): session `<select>` (Today · LIVE + archived dates), transport ⏮◀▶⏭, speeds, scrubber with band rail (annotation strip above track — deliberately not overlaid, precision honesty comment L110-113), frame counter, LIVE/archived badge.
i18n: `surfaceStrings.ts` (281).

---

## 7. Prophet surfaces (`components/prophet/`, ~2.9k lines)

Grep: prophet references confined to `components/prophet/*`, `OptionsHubView` (tab mount + prefetch), `OptionsWorkspace` (tab registry), `lib/flowSource.ts` (f-params), `lib/i18n.tsx` (tab label), `components/flowdesk/FlowGauge.tsx` (comment only). No other app surface renders Prophet.

`ProphetView.tsx` (1,081):
- **Layout**: LEFT alert stream (`SignalCard`s, sort NEW|BEST|GAINERS, sub-tabs SIGNALS|PERF) · CENTER analysis (phase, `GeometryRail`, WHAT TO DO NOW, PROFIT TAKING PLAN, SIGNAL THESIS) · RIGHT `ConfidencePanel` (arc gauge + component bars + R/R) + `OptionCard`.
- **Data**: `f=prophet_idx` (nightly factor-engine plan index) fetched once per mount with AbortController (L195-215); `f=prophet_marks` polled 30 s (L219-231) — live option marks keyed by derived OCC symbol (`toOccSymbol` L61-70), 20-min freshness window (L72-94), fixture `_fixture` override.
- **Honesty** (header L13-26): masthead names the factor engine (options hub does not imply options origination); "nightly EOD — updates after close" cadence chip; "display-only — forward ledger accruing" authority chip; machine-generated thesis caption; GAINERS hidden until producer publishes `last_price`; PERF sub-tab is a placeholder ("outcome ledger accruing"); empty state "No active prophecies — ledger accruing."
- i18n: `prophetStrings.ts` (259).

---

## 8. Data plumbing

### 8.1 `lib/flowSource.ts` (674) — complete f-param inventory

`isValidF` (L49-81) accepts:

**Whole-file keys**: `feed`, `heat`, `meta`, `tide`, `dte`, `oi`, `hot`, `ctx`, `oiconf`, `chainheat`, `darkpool`, `volregime`, `manifest`, `flow_idx`, `prophet_idx`, `prophet_marks`, `enrich`, `leaders`, `radar`.

**Parameterized**: `ticker:{ROOT}`, `vol:{ROOT}`, `gex:{ROOT}`, `moves:{ROOT}`, `tctx:{ROOT}`, `gexstate:{ROOT}`, `matrix:{ROOT}`, `surface_idx:{ROOT}`, `surface:{ROOT}:{STAMP}`, and the multi-day replay family `surface_dates:{ROOT}`, `surface_idx_at:{ROOT}:{DATE}`, `surface_at:{ROOT}:{DATE}:{STAMP}` (dated `_at:` prefixes are disjoint by construction — 12th char `_` vs `:`; matched before the shorter today-prefixes in `backendPath`, L107-123).

**Backend paths** (`backendPath` L89-132, Python hub at `FLOW_BACKEND` = `FLOW_API_BASE` || `http://127.0.0.1:8000`): `/api/flow/{tide|dte|meta|chainheat|manifest|flow_idx|enrich|leaders|radar}`, `/api/flow/ticker/{R}`, `/api/flow/surface/{R}/…`, `/api/hub/{vol|gex|moves|tctx|gexstate|matrix}/{R}`, `/api/hub/{oi|hot|ctx|oiconf|darkpool|volregime|prophet|prophet_marks}`; default `/api/flow/{f}`.

**R2 keys** (`r2Key` L135-180, bucket `https://pub-f7ffb4441c5f4ad983ca56ec7c651c61.r2.dev`): `live_flow/*` (feed default `live_flow/{f}_current.json`, tide/dte/chain-heat `_current`, `tickers/{R}.json`, `surface/{R}/…`, `manifest.json`, `flow_idx.json`, `prophet_marks.json`, `enrich_current.json`), `options_hub/*` (vol/gex/moves/tickers_ctx/oi_movers/hot_contracts/context/oi_confirmed), `options_structure/{gex_state|matrix}/{R}.json`, `prophet/index.json`, `flowleaders/leaders.json`, `leaderradar/radar.json`, root-level `darkpool/eod.json` + `vol/regime.json`.

**Upstream resolution** (`tryFetchUpstream` L625-654): Python backend → R2 mirror → (flow_idx only) GitHub-Pages `chriswong6031-creator.github.io/macro/flow/index.json`; `manifest` is a local file read only. 3 s abort timeout, UA `mastermind-feed/1.0`, `cache: no-store`.

**Server-side scoring** (`attachFlowScores` L205-227): proprietary `flow_score_v1` computed server-only on `feed` events; only `{score, tier, components:[{key,label,value}]}` reach the client (SECURITY.md — weights never in bundle); malformed events fail-soft to zero score.

**Fixture logic** (`FLOW_FIXTURE=1`, `fixtureFor` L270-528): per-key JSON files under `public/data/*_fixture.json`. Root-keyed fixtures (`ticker:`, `vol:`, `gex:`, `moves:`, `tctx:`, `matrix:`) return `{}` for unknown roots — **honest-empty, never first-key/SPY substitution** (each branch documents the wrong-root hazard it removed); `gexstate:` additionally supports a single-root fixture that answers only its declared root (L377-388). Surface family: one canonical full-day session per root **re-dated** onto each date the sessions fixture lists; dates not listed are refused (`fixtureHasSession`); frame fetches truncate `time_steps` + grids to the requested stamp (replay = realized-so-far, L453-488). `intradayFixture` (L572-618) synthesizes deterministic candles from the surface fixture's own `spot_path` (fmix32 hash wiggle, dev-only, gated in `/api/intraday`, explicitly kept out of `public/data/intraday/`).

### 8.2 `/api/flow` GET (`app/api/flow/route.ts`, 104)
Rate-limited (`name:"flow"`); entitlement 403; invalid f → 400; **every** response `Cache-Control: no-store` including errors (EdgeOne auth-blind-404-cache defense, comment L38-44, memory `edge-caches-api-404s`); in-memory per-process cache TTL 30 s with stale-while-revalidate (`stale:true` flag added, L85) + single in-flight revalidation per key (L86-102).

### 8.3 `/api/flow/stream` SSE (`app/api/flow/stream/route.ts`, 144)
- `dynamic="force-dynamic"`, `runtime="nodejs"`. Per-connection loop: initial `loadFlowFresh(f)` snapshot pushed immediately; then **15 s server-side poll** pushing only when the change signature flips — `signature()` = `(asof|asof_utc|session_date|ts) + ":" + JSON.stringify(data).length` (L33-39); 20 s comment heartbeat; `retry: 10000` reconnect hint; abort-signal cleanup.
- Headers: `no-store` **without** `no-transform` — a documented decision to keep Next's `compression` gzip active (2,002,874 B raw / 100,435 B gzipped feed frame; Next flushes the compressor per chunk so push latency survives, L115-138); `X-Accel-Buffering: no`.
- Cost note: each connection runs its own upstream poll + stringify; mitigated client-side by per-key connection sharing.

### 8.4 `lib/flowStream.ts` (180) — client half
Module-level registry keys ONE `EventSource` per f-value; first subscriber opens, last closes; late joiners get the last frame synchronously (v7b perf fix for hub+desk double `feed` connections). On error: publishes `{live:false,error:true}`; EventSource auto-reconnects; after 3 consecutive errors starts a `flowGet` polling fallback (default 30 s) which stops when SSE recovers. Key-switch clears data to avoid stale-ladder flash (L162-177). Consumers: `feed` (hub tape + Flow Desk), `tide` (Tide tab, SurfaceView), `gex:{root}` (GEX desk).

### 8.5 `lib/flowClientCache.ts`
`flowGet(f)` — 25 s TTL stale-while-revalidate over `/api/flow?f=…`, in-flight dedupe, never pins null. `flowPrefetch`, `flowInvalidate` (used by the hub's heat poll since 45 s poll > 25 s TTL).

---

## 9. HeatmapView + /discover heatmap (`components/heatmap/`, ~2.4k lines)

- Mounted at `Discover › Heatmap` via `HeatmapPageRoot` (chrome-free body; `/heatmap` URL survives via redirect). NOT part of /options, but consumes the options-flow plane.
- **Data**: `f=manifest` (nightly price manifest, ~34 names — universe honesty in header) + `f=flow_idx` (EOD ΔOI-based flow index; `/data/flow_idx.json` VPS fallback, L311-317); joined into tiles. 60 s poll ("data is nightly but keeps cache fresh", L43). Intraday overlay: top-N tiles re-anchored via `/api/quote` every 5 min (L44, L346-371), batch cap 100.
- **Renders**: dual-layer squarified `Treemap` (PRICE = binned 1D %chg with ±0.05 dead-zone; FLOW = signed net premium, sign→hue soft / magnitude→brightness, |$M|<0.3 dim neutral), size EQUAL/CAP/PREMIUM; `HeatmapTable` sortable equivalent; `DetailPanel` per-name drill (divergence chip only when both price and flow exceed dead-zones; GEX regime deferred "~Sept 2026 gate"); breadth strip (advancers/decliners real; call-share dead-zone ±0.08 → MIXED).
- **Honesty**: 1D real; 1W/1M/YTD **disabled "accruing"**; no directional buy/sell copy.
- Caveat from memory: prerendered /heatmap-style pages are EdgeOne-cached ~1 yr (`terminal-static-pages-edgeone-cache`) — bare-URL staleness is a deploy-time concern.

Discover shell (`DiscoverWorkspace.tsx`, 86): tabs screener·heatmap·leaders·radar; Leaders/Radar reuse OptionsHubView via `DiscoverFlowMounts` single-tab embeds (`allowedTabs:["leaders"]` etc., local controlled state so the drill never writes `?tab=tickers` onto the Discover URL) with a **nonce-remount hack** (re-clicking the active tab re-keys the mount because the hub's internal drill state cannot otherwise be reset, L45-49).

---

## 10. Update-cadence matrix (one line per surface)

| Surface | Transport | Cadence |
|---|---|---|
| Tape feed | SSE `feed` | server 15 s watch, push-on-change; client fallback poll 30 s |
| Tape heat belt | poll | 45 s (invalidate+get) |
| Tape oiconf | one-shot | per session mount |
| Tide | SSE `tide` (active-tab only) | push-on-change |
| DTE tide | one-shot | first Tide activation |
| Tickers drill (ticker/vol/tctx) | one-shot | per selection |
| Screener oi/hot | one-shot | first activation (nightly data) |
| Flow Desk feed | SSE `feed` (shared conn) | push-on-change |
| Flow Desk tide / chainheat / enrich | poll | 60 s / 45 s / idle-then-5-min |
| GEX ladder | SSE `gex:{root}` | push-on-change (EOD data — transport upgrade only) |
| gexstate | poll | 60 s + visibilitychange |
| GEX matrix | one-shot | per root |
| EOD belt (darkpool/oiconf) | one-shot | mount |
| EOD belt (moves/vol) | one-shot | per root |
| PRISM matrix/gexstate/oi | poll | 60 s |
| Surface index (stamps) | **one-shot** | per root/session mount — no live follow |
| Surface frame | one-shot per scrub | flowGet 25 s SWR |
| Prophet index | one-shot | per mount (nightly) |
| Prophet marks | poll | 30 s (20-min freshness window) |
| Leaders / Radar | one-shot | per activation (nightly) |
| Heatmap | poll | 60 s + 5-min quote overlay |

---

## 11. i18n inventory

Seven parallel string systems: LEX tuples in `lib/i18n.tsx` (hub inline tabs, WorkspaceTabs labels, paywall) plus six per-desk tables each with its own `makeXT(lang)` factory — `lib/flowdeskStrings.ts`, `components/gexdesk/gexStrings.ts`, `components/prism/prismStrings.ts`, `components/prophet/prophetStrings.ts`, `components/surface/surfaceStrings.ts`, `components/eodcontext/eodStrings.ts`. In addition, OptionsHubView carries hundreds of inline `lang === "zh" ? … : …` ternaries (Tape/Tide/Tickers/Screener/Leaders/Radar bodies) that bypass both systems. Radar regime chip labels are described as "condition identifiers, not UI prose" yet do carry zh translations (L4237-4244).

---

## 12. Information-architecture problems observed

1. **`?tab=vol` naming trap.** The URL key `vol` renders the tab labelled "Options Screener" (hub key `screener`), while an actual vol surface lives inside the Tickers tab. Three names (vol / screener / Options Screener) across two surfaces; `?tab=screener` is a second alias. Historic residue of folding the standalone Vol tab (OptionsWorkspace L22-27).
2. **Tape vs Flow Desk duplication.** Two full-featured views of the same `feed` SSE stream (table vs cards) with two disjoint filter systems, two preset systems (hub PRESETS vs FeedPane ALL/ELITE/WHALES/0DTE/SWEEPS), two "unusual names" rails (Activity Leaders vs Smart Money Radar), and a watchlist that exists only on the Desk. A user must learn which affordance lives where; nothing cross-links the two tabs.
3. **~400 lines of unreachable GEX code preserved in OptionsHubView** (L1234-1420 + state L1977-2006, comment "do not delete" L3761-3772). `setSelectedGexRoot` is never invoked, so `fetchGex` can never fire; the retained `GexHistSparkline` even violates the SVG chart law (`preserveAspectRatio="none"`, L1197). Dead weight in an already 4,599-line monolith.
4. **Leaders/Radar are orphans of the Options file.** Their ~1,300 lines of types+render live in OptionsHubView but the tabs are unreachable at /options (force-redirected) and only mount from Discover through single-tab embeds plus a nonce remount hack (DiscoverWorkspace L45-49) to un-stick the internal Tickers drill. They are equity-leadership boards fed by nightly artifacts — conceptually Discover surfaces implemented as options-hub tabs.
5. **Three unrelated "strike ladder" idioms**: hub-local premium StrikeLadder (Tickers, L672-867 — computes its own walls/max-pain from session premium), gexdesk StrikeLadder (dealer exposure with gexstate levels), PRISM MatrixGrid strike rows (with a *third* levels source: matrix.levels→gexstate fallback). The same words (Call Wall, Max Pain) can show different numbers on different tabs with different provenance; only the EOD belt discloses cross-store disagreement.
6. **Expiry term structure rendered three ways on one desk**: GEX By-Expiration view (ExpiryBars), ExposureExpiryDrawer (bubbles+bars over the same by_expiry payload), and the ladder's matrix-driven expiry lens — plus the hub Tickers tab's own premium ExpiryBars. Overlapping reads, distinct controls.
7. **Session Flow pane double-homed** (Tide sub-toggle + Surface tab) by design — reasonable, but the Tide tab's twin doesn't advertise the replay coupling that only becomes active when Surface publishes to the bus.
8. **Tickers candidate list depends on visiting Tide first**: `tickerCandidates` = tide top_net_impact ∪ unusual_names (L1796-1805), but `tide` SSE only subscribes while the Tide tab is active — cold-landing on Tickers offers only unusual_names. Same for `gexCandidates` (dead code anyway). A universe search (the manifest exists) is absent by design but unexplained relative to GEX desk's free-input + datalist approach.
9. **Screener presets straddle two cadences invisibly at the chip level** (intraday feed-derived vs nightly oi/hot). The provenance line below says which, but the chips themselves don't distinguish live from EOD — the sector belt silently disappears for nightly views (handled honestly, L1837-1845, but a cadence tag on the chips would carry the fact upward).
10. **fmtPremium & friends re-implemented per module** (OptionsHubView, flowdesk, gexdesk, prism, heatmap each carry a variant) alongside seven i18n systems — consistency debt rather than user-facing, but it makes vocabulary drift (e.g. "认购/看涨") easy.
11. **Surface replay never follows the live session while mounted**: the stamp index is fetched once per root/session (SurfacePane L385-400; no interval, no SSE, and keep-alive prevents a remount on tab return). During RTH the "LIVE" badge marks the head of a stamp list frozen at mount time; new upstream frames only appear after switching root/view/session. The engine even has `setStamps` head-follow semantics built for a growing index (replayEngine L76-87) — the poller is simply missing.
12. **The GEX desk's SSE is a transport mismatch**: an EventSource + 15 s server poll over a nightly EOD payload per root (GexDeskView L184-190). Honest (no LIVE badge) but wasteful — the connection re-checks a file that changes once a day, and every root switch opens a new stream key.
13. **Hub tab keys vs page keys diverge invisibly**: `PAGE_KEY` maps `leaders/radar → "tape"` "never shown here" (OptionsWorkspace L71-75) — a silent mis-highlight if the redirect contract ever regresses.
14. **Chain-heat exists only on the Flow Desk** right rail; the Tape (same audience, same feed) has no path to campaign aggregation, and `chainheat` never appears on any other surface.
15. **OptionsHubView is a 4,599-line monolith**: five full tab bodies inline (Tape/Tide/Tickers/Screener/Leaders/Radar) while four others are properly extracted — the asymmetry concentrates cross-tab state (28 useState/useRef clusters) and makes the file the merge hot-spot of the whole suite.

---

## 13. Known limitations visible in code (roll-up)

- Direction is heuristic everywhere (`~buy/~sell`, tick-rule caveats); enforced by honesty-doctrine headers in every desk.
- GEX/gexstate/matrix/vol/oi/hot/moves/darkpool/volregime/leaders/radar/prophet_idx are **nightly EOD**; only feed/tide/chainheat/enrich/prophet_marks are intraday. Memory `options-suite-parity-program` ("our live flow is really hourly") pre-dates the SSE spine; the tape now pushes on change but remains upstream-cadence-bound.
- Single-name GEX coverage gap (nightly keepalive re-pulls 22 ETF anchors first — `gexNoSnapshotWhy`, memory `gex-single-name-pipeline`).
- Surface materialized for SPY/QQQ/IWM only; matrix store exists "only for some roots"; matrix can run a session behind gex (lens goes dark rather than mixing).
- Heatmap universe 34 names, 1D only; 1W/1M/YTD disabled accruing.
- Screener ΔOI/Hot = ETF universe, "single names expanding".
- PRISM VEX + UNUSUAL lenses disabled-with-reasons; confluence index-only.
- Prophet PERF ledger not built ("outcome ledger accruing"); GAINERS hidden until `last_price` published.
- tctx z-chips warm-gated (history_n < 20); unusual-activity z hidden while baseline accrues.
- Replay: current-day only + retained archived sessions per R2 retention; no macro-event markers (forward-only calendar, documented replayEngine L170-183).
- `isUsMarketHoursNow` ignores market holidays (tone-only impact, noted at L518-519).
