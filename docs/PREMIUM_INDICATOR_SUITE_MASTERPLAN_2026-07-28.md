# Premium Indicator Suite Masterplan — absorbing the BigBeluga / PhantomFlow moat

**Date:** 2026-07-28 · **Status:** research complete, decisions proposed, build not started
**Sources:** full BigBeluga docs sweep (docs.bigbeluga.com — 49 pages fetched as markdown), PhantomFlow site + guide, TradingView reference scripts, deep audit of our pine engine / indicator registry / chart stack.

---

## 1. Executive summary

**Verdict: yes — everything both vendors sell is reverse-engineerable, and most of it is easier than it looks.** Both products are TradingView Pine overlays built from ~15 well-known public techniques (pivot structure, ATR bands, volume binning, divergence pivots) composed well and *styled exceptionally*. BigBeluga's docs describe every module's mechanics, visuals, settings, and defaults in enough detail to reimplement without ever seeing their code. PhantomFlow's 8-feature "Core" is a strict subset of BigBeluga's Market Core Pro + one trend band + one ribbon oscillator.

**The strategic decision (§5): build these as native TypeScript toolkit indicators, not as Pine scripts and not as Python.** Three reasons, argued in full below: (1) our Pine engine cannot draw *any* of the required visuals today — boxes, labels, lines, fills, tables, and arrays are all silent no-ops; (2) an interpreted client-side Pine script ships its **source text to every browser** — the exact moat leak we're trying to prevent (PhantomFlow's own weakness: they email the source, which is why knockoffs exist); (3) native modules ride the SVG/canvas overlay primitives that **already render exactly these shapes** for our built-ins. The Pine engine still gets fixed — as a separate track for *user* custom scripts (§9), reusing the same new render primitives.

**Product shape:** not 40 checkbox indicators (our own competitive assessment warns breadth is a vanity metric) but **four flagship "toolkit" super-indicators** with module toggles, mirroring how BigBeluga packages theirs — plus a settings-system upgrade (§7), an in-Terminal guide system with our own screenshots (§10), and alert-engine integration that TradingView structurally cannot match (§8.4).

Estimated effort: ~1.5 weeks of platform enablers, then each suite ships in 1–2 week waves; PhantomFlow-parity arrives free inside waves 1–2.

---

## 2. What they sell (research findings)

### 2.1 BigBeluga — packaging & pricing

- **Pricing:** $66.47/mo · $149/qtr · $469/yr · **$1,999 lifetime**. All plans: Market Core Pro™, Market Waves Pro™, Nautilus Oscillator Pro™, Ultimate RSI + MACD suites, SMC backtester, Sonar AI extension. Lifetime adds Market Echo Screener™ + Strategy Builder Pro. Delivery = invite-only TradingView scripts. ~97k TradingView followers.
- **Docs:** GitBook at docs.bigbeluga.com. Full index at `docs.bigbeluga.com/llms.txt`; **every page is fetchable as raw markdown by appending `.md`**, and every screenshot is at `https://docs.bigbeluga.com/files/<id>` (IDs catalogued per module in the research transcript). This makes spec extraction and future re-checks trivial.
- **Structure: 3 flagship toolkits (each ONE TradingView indicator containing many toggleable modules), 2 oscillator suites, 2 screeners, 2 backtesters, 1 browser extension** — ≈ 51 documented modules total.

### 2.2 BigBeluga module inventory (condensed; full details in research transcript)

**Market Core Pro™** (SMC overlay toolkit — doc root `/main-toolkits/market-core-pro-tm/`):
| Module | Core mechanics documented | Signature visuals |
|---|---|---|
| Order Blocks | 3 detection engines (Volume / Price Action / "Beluga Peak" exhaustion); grades Weak/Balanced/High/Strong; mitigation by Touch/Wicks/Close/Average; Breaker Blocks; Macro (HTF) blocks | Zone boxes with buy%/sell% ratio bars, delta label, total-volume share %, rating bar, state chip (BALANCED/HIGH), midline |
| Market Structure | Internal + Swing dual engines; BOS / CHoCH / **CISD** (failed break + aggressive flip); Dynamic Mode; projections | Structure lines + tags, delta-volume diamonds at swings (hover: volume, relative strength, break quality, time-to-break), zigzag mapping, HH/HL/LH/LL labels with %chg, strong/weak H&L, DT/DB ("+DT/+DB"), structure-colored candles |
| Fair Value Gap | 3-candle imbalance; fill-% tracking; in-gap POC (max-vol or mean); in-gap mini volume profile; **iFVG** inversion on body close-through; MTF sourcing; ATR threshold | Boxes extending right, gray partial-fill overlay + %, POC line, glow fill, creation/retest arrows |
| Swing Failure Pattern | Sweep of swing + reclaim; **Volume Strength 0–100%** score; >50% = "+SFP"; MS-trend filtering; deviation zones | Arrow markers + orange "+SFP" tag, tooltips, invalidated-SFP dashed lines |
| Support & Resistance | Pivot-cluster levels ranked by reaction strength; sensitivity + strength filters | Level lines with optional buffer zones; reversal vs breakout event coloring |
| Money Flow Profile | Price-binned profile over N bars: per-bin **delta**, **money flow $**, **Level Strength %**; POC by selectable metric; VA 70% + VAH/VAL; delta gauge | Right-side segmented bars (buy-green/sell-blue), live orange bin, strength-% heat column |
| HTF Volume Footprint | Per-session (1D default) volume-at-price with buy overlay; POC; VA; session summary candle | Wide horizontal bars per session, orange POC line across chart |
| MTF Highs & Lows | Prev Day/Week/Month H/L/Mid rays | Color-coded per TF (D green, W yellow, M blue) |
| Chart Patterns | Auto channels, wedges (+ measured targets), H&S (threshold %), auto trendlines | "Break Up / ▲+ Strong Break Up / Break Down / ▼+ Strong Break Down" labels |
| Liquidity Concepts | 6 sub-modules: Grabs (wick sweeps), Buyside/Sellside zones, Dynamic Liquidity Map, **Liquidity HeatMap** (gradient lines, auto-remove on cross), right-side Liquidity Profile, Liquidity Bubbles (volume-tiered sizes) | Gradient-faded heat lines with % labels, bubbles at pivots |
| Price Action Concept | Auto fib ranges: OTE 61.8–78.6, **Golden Pocket 61.8–65**, Premium/Discount/Equilibrium | Striped premium (red) / discount (green) regions + level labels |
| Session Opening | NY/London/Asia/custom opening-range channel + breakout signals | Session zone + ORB channel + break markers |
| Alerts | One `alert()` stream carrying **23 event types**, each filterable All/Bull/Bear; **Custom Alert sequencer**: steps 1–5, max-bars-between-steps window, external-source condition | Gray tracking line, orange completion square |

**Market Waves Pro™** (trend overlay toolkit — `/main-toolkits/market-waves-pro-tm/`):
| Module | Mechanics | Visuals |
|---|---|---|
| Trend Signals | Sensitivity-driven flip engine; tiers: Standard / **Power+** / Power Bottom+/Top+ (post-extreme); Smart-Bands retests; cross-filter by FlowTrend/ActionWave/TrendMagnet; **Auto-Optimization backtests last 2000 bars** and applies best sensitivity; TP engine: Dynamic (up to 6 ATR-scaled TPs) / Fixed TP1-3% / off; SL fixed %/trailing | Triangles ± "+", TP target lines with completion checkmarks, adaptive bands + gradient shadow |
| Flow Trend | Volatility-adaptive trend follower, HTF sourcing option, retest bands | Turn triangles with price labels, two-step shadow cloud |
| ActionWave | Macro dual-band filter | Green/purple bands, yellow weakness circles |
| TrendMagnet | Trend band that **flattens in consolidation** (range filter); "Magnet Bar" triple-line strength scanner top/bottom; Scalp/Normal/Macro modes | Band + orange exhaustion clusters |
| VectorShift | Expansion-isolating trail; re-entry tracker (⇡/⇣ on clean band close) | Cyan/orange slope line, flat dashed yellow in ranges |
| Candle Coloring | 4 modes: Trend / Momentum (aqua = weakening) / Trend×Volume / **Momentum×Volume heat** | Saturation scaled by relative volume |
| Voltix Bands | Volatility envelope; retest triangles; slope-colored dotted midline | Intensity glow on overextension |
| Candlestick Patterns | 18 classical patterns **gated by market phase + volume confirmation** | Abbreviated labels (HM, EG, 3WS…) + pattern volume |
| Market Dashboard | On-chart table: Volatility %, Consolidation 0–10, Rating (StrongBuy…StrongSell), Optimal Sensitivity, Trend Score −10…+10, Pressure (delta) −10…+10, **MTF Trend + MTF Reversal rows** (5m…1D), selectable MTF source | Positioned table, green/red cells |

**Nautilus Oscillator Pro™** (`/main-toolkits/nautilus-oscillator-pro-tm/`): flagship oscillator wave with **4-color state coding** (purple = down→up transition, green = rising below midline, blue = rising above midline, red = OB/OS decaying), companion "gapped" smoother line + gap fill; TrendSync momentum bars (orange at exhaustion peaks); 10X outlier-day highlights; Volume Mapping (±volume dominance bars); Nautilus Map (day separators); Money Flow (MFI + divergences); **Volume Flow (CVD-as-oscillator around zero)**; 4-class divergence detection (regular + hidden, multi-divergence stacking); rich signal set (triple-line buy/sell, dip diamonds, peak markers, gapped-cross diamonds inside extremes); **Signals Dashboard across 6 timeframes**; Scalper/Day/Swing profiles.

**Ultimate RSI Suite** (`/ultimate-suite/ultimate-rsi-suite/`): color-adaptive RSI + smoothing MA (5 types), gradient OB/OS fills (65/35 defaults), in-zone reversal signals, **Deviation +1/+2 follow-through levels** (volatility-projected, alertable), neutral-band-gated crossover dots, regular + hidden divergences (lookback 10), RSI Channels (Bollinger/Keltner/Donchian on RSI) with breakout dots, MTF dashboard with recency fade, full condition alerts.

**Ultimate MACD Suite** (`/ultimate-suite/ultimate-macd-suite/`): **MACD normalized to −100…+100** (10/20/9 defaults, per-line MA type), HeatMap or Rising/Falling gradient modes, extreme-zone-only cross signals, divergences (1-bar confirm), intensity-graded histogram with "+" flip markers, phase-locked Trend squares, MTF dashboard.

**Screeners:** Market Echo (Waves modules × watchlist, TP1–TP6 progression) and SMC Screener (14 symbols × MS/OB/FVG/SFP/Liquidity states). **Backtesters:** strategy wrappers over toolkit signals with entry/exit builders + optimization. **Sonar AI:** browser extension (order book, whale alerts, AI S/R) — out of scope; overlaps what our Terminal already does natively.

### 2.3 PhantomFlow — full picture

- **Product:** ONE indicator suite ("Phantom Flow Core"), **$149 one-time**, delivered as **Pine source pasted from an email** into TradingView's editor (confirmed on their guide — this is why public knockoffs exist; their moat is marketing, not protection).
- **8 Core features (verbatim from guide):** Market Structure (BOS/CHoCH) · Order Blocks · Fair Value Gaps · Premium/Discount Zones · Multi-timeframe Levels (D/W/M) · Equal Highs/Lows (liquidity) · **Phantom Shift** ("ATR-based trend bands with Buy/Sell signals and color-coded background") · **Phantom Oscillator** ("MA ribbon with momentum columns and diamond signals").
- **Chart language:** green/red background+ribbon = trend bias; B/S labels = structure shifts; boxes = OBs; stripes = premium/discount; green/yellow diamonds = momentum starting; oscillator background states green (strong bull) / yellow (fast bear) / orange (bear slowing, possible reversal) / red (strong bear confirmed). All visuals individually toggleable.
- **Strategies taught:** Pullback-into-Zone (bg+ribbon aligned → label prints → enter at OB/discount pullback, stop outside zone, 2R target), Ribbon Bounce, Instant Breakout.
- **Conclusion: PhantomFlow ⊂ our plan.** Every feature maps to a module we're building for BigBeluga parity; "Phantom Shift" and "Phantom Oscillator" become styling presets of our trend engine and ribbon oscillator.

### 2.4 The three reference links you asked me to check

1. **PhantomFlow V4.1 Gold (tradingview.com/script/hOXtxBUU…)** — ✅ live, open-source, by `alexneeley1987`. **Not the real PhantomFlow** — an unrelated XAUUSD trend/continuation script (swing structure + dual EMA + HTF bias + prev-day/week levels; lime/fuchsia entry candles). Usable only as generic prior art.
2. **Phantom Trend Cloud (tradingview.com/script/5LGQFStB…)** — ✅ live, open-source, by `WillyAlgoTrader`. Unrelated to the product; decent technique reference: **HMA midline + ATR adaptive envelope, retest-zone signals with volume/RSI/ADX/HTF filters and a 0–100 composite quality score** (a pattern worth stealing for our signal-quality chips).
3. **Scribd "New Pine Mitigation Unique"** — ⚠️ unverifiable by automation: Scribd serves a CAPTCHA wall (which I don't bypass). Title implies a pasted order-block/mitigation Pine source. Open it manually if curious; nothing in our plan depends on it.

---

## 3. Legal & moat hygiene (read before building)

Reimplementing **ideas and methods** from public documentation is clean — algorithms and indicator concepts are not copyrightable, and neither vendor's docs are under NDA. But four rules keep us clean and actually *strengthen* the moat:

1. **No verbatim source.** We never had their gated code; the two open-source lookalikes above are reference-only — we write our own implementations.
2. **No copied doc text.** Guide prose gets rewritten from scratch (we planned to anyway — theirs reads clunky; ours should be simpler, §10).
3. **No copied screenshots.** Do **not** import BigBeluga's images into our Terminal. Beyond copyright, their screenshots show *their* chart chrome and would look alien in our UI. Instead we generate our own screenshots from our own implementations (scripted capture, §10) — pixel-consistent with our theme and always up to date. Their images remain our *private build-time reference* for visual fidelity, which is fair use of a public doc during development.
4. **No trademarked names.** "BigBeluga", "Nautilus™", "Market Core Pro™", "PhantomFlow" never appear in product, code, or marketing. Our own line naming in §6.
5. **The moat mechanics:** their weakness is that TradingView vendors must hand users runnable Pine (invite-only at best, emailed source at worst). Ours is stronger *only if we never ship source*: computations live in the minified app bundle, signals feed our server-side alert engine and screener, and guides/data integration make the copy incomplete even if someone reimplements the math. This is exactly why §5 rejects client-side Pine as the substrate for the premium suite.

---

## 4. Where we stand today (codebase audit summary)

Full detail with file:line references in the audit transcript; what matters for decisions:

**Pine engine (`terminal/lib/pine-engine/`, 1,082 LOC, real lexer→parser→interpreter, Pine v6 subset):**
- Genuinely implemented: 25 `ta.*` functions, plots/plotshape/hline, `var` persistence, history `[n]`, user functions, **a real `request.security`** (HTF resample + script re-run), input passthrough, 2s/3s budgets.
- **Fatal for premium visuals:** `box.*`, `label.*`, `line.*`, `table.*`, `array.*`, `fill()`, `bgcolor()`, `barcolor()`, `alertcondition()` are ALL **silent no-ops** (`runtime.ts:44,380`) — a pasted SMC script says "✓ compiled" and draws nothing. This *is* the "very buggy" perception: silence instead of honesty.
- Also missing: `ta.pivothigh/pivotlow` (the SMC primitive), arrays entirely, real `color.from_gradient` (stub returns an endpoint), per-bar line colors (collapse to one color), `varip` ≡ `var`, no worker isolation (runs on the UI thread), one smoke test only.
- Settings for Pine scripts: input metadata (`options/min/max/step/group/tooltip`) is **discarded**; the params UI renders the stored defaults blob by `typeof` → bool/number/text only; override keys (variable name) vs `inputs[]` keys (title) are incompatible.
- Editor is a raw `<textarea>` with regex highlighting; no autocomplete.

**Built-in indicator platform:**
- Clean registry pattern exists: `lib/indicators.ts` (25 `IndDef`s: key/label/kind/defaults/fields/source), math split into `lib/indicatorMath.ts` + `lib/intradayMath.ts` (tested), rendering hand-written per indicator inside the 3,433-line `ChartPanel.tsx`.
- Settings modal supports exactly three field types (number/color/bool) + per-TF visibility; enums are faked as magic numbers ("0=classic, 1=camarilla…"). Persistence: `mm.inds` / `mm.indParams` / `mm.indHidden`.
- **The renderer already draws every premium shape somewhere:** clouds with state-flip polygons (Ichimoku), state-colored ribbons, right-side profile bars + POC/VA lines (vprofile), time-bounded price boxes + rays + text labels (ORB, volbox), σ-band fills (sVWAP), pill-with-pointer labels + pulse animation (Oracle badges), rect/fib drawing zones, and one proven **Canvas `ISeriesPrimitive`** (sessionShading.ts) for background painting. What's missing: a *generic* API over these (each is hardcoded), per-bar-colored line series, and any on-chart table.
- Modal drift: 9 of 25 registry indicators aren't listed in the picker — the registry/UI seam needs care as we scale.
- Chart-engine P0 (MastermindChart abstraction) is **not on this branch** (worktree/branches only); plan must not depend on it, but the primitive layer below is designed to slot into it later.
- Existing overlap to reuse: supertrend, ribbon, ichimoku, vprofile, orb, slevels, pivots, ttmsq, adx, cvd(approx), rvol, avwap, volbox, gaps — many premium modules are **upgrades, not green-field**.
- Real advantages TradingView can't match: our **server-side alert engine** (5-min VPS cron, one-shot semantics), our screener pages, our data plane (full-IPO history, intraday store, CN/HK coverage), and Supabase-gated Pro entitlements already live.

---

## 5. Decision: implementation substrate

**Chosen: native TypeScript modules on a new shared "IndicatorCanvas" primitive layer.** Pine and Python were seriously considered; here is the honest comparison:

| | Native TS (chosen) | Pine on our engine | Python precompute |
|---|---|---|---|
| Can draw OB boxes/labels/structure today | ✅ primitives exist in SVG layer | ❌ needs arrays + 6 object namespaces first (~3–6 wks of interpreter work before indicator #1) | ❌ server images/series only |
| Performance | ✅ compiled, O(n) passes | ⚠️ interpreted per bar, UI thread | ✅ but round-trip per settings change |
| Settings interactivity | ✅ instant recompute | ✅ (after input-metadata fix) | ❌ seconds-latency, offline-fragile |
| **Moat / source secrecy** | ✅ minified bundle; no script text | ❌ **Pine source ships to every browser as a string** — extractable and pasteable straight back into TradingView | ✅ server-side |
| Fit with alerts/screener | ✅ same TS math runs in Node cron | ⚠️ engine embeddable server-side but heavier | ✅ |
| Dev speed per indicator | ✅ fastest once primitives exist | slow until engine matures | fast math, dead UX |

The Pine instinct was right about one thing — TradingView parity of *settings-driven customization*. We keep that by making every module schema-driven (§7), which is what Pine `input()` really gives users. And the Pine engine is **not abandoned**: §9 upgrades it for user-authored scripts, reusing the same primitive layer this plan builds — one renderer serves both worlds. Python remains what it already is here: the substrate for heavy precomputed layers (Golden Oracle) — not for interactive indicators.

**Common misconception, settled (owner Q&A 2026-07-28):** native TS does **not** mean precomputing indicator values into the database or backfilling anything. TS modules run **client-side in the browser on the same candle arrays the chart already loads** — recomputed on the fly on every symbol/timeframe/settings change, exactly the runtime model Pine has on TradingView (which is also client-side over loaded bars). Zero new server compute, zero pipeline work, fully live. The only server-side use of the same TS math is optional and additive: the alert-engine cron re-running signal checks (§7.3) and future screener columns.

---

## 6. Product architecture — four flagship suites

Branding proposal (final names are a marketing call; requirements: ours, non-infringing, consistent): **the "Mastermind Pro" line**, Pro-tier gated.

1. **Structure Core** (overlay toolkit; ≈ Market Core Pro + PhantomFlow SMC features)
   Modules: Order Blocks · Market Structure · Fair Value Gaps · Liquidity Suite · Swing Failure · Smart S/R · Premium/Discount + Golden Pocket · MTF Levels · Session Open Range · Money Flow Profile · HTF Footprint · Auto Patterns.
2. **Trend Waves** (overlay toolkit; ≈ Market Waves Pro + Phantom Shift)
   Modules: Trend Engine (signals + tiers + auto-optimize + TP/SL ladder) · Flow Band · Range Magnet · Vector Trail · Volatility Bands · Candle Painter (4 modes) · Pattern Candles (18, phase-gated) · Market Dashboard (on-chart table).
3. **Pulse Oscillator** (pane; ≈ Nautilus + Phantom Oscillator)
   Modules: Pulse wave (4-state coloring + gapped companion line) · Momentum Sync bars · Volume Mapping · Money Flow (MFI) · CVD Flow · Divergence engine (4 classes + stacking) · Signal set (buy/sell lines, dip/peak diamonds, extreme crosses) · MTF Signals Dashboard · Outlier-day map.
4. **RSI Ultimate & MACD Ultimate** (pane pair; upgrades of our existing `rsi`/`macd`)
   RSI: adaptive coloring, smoothing MA, gradient OB/OS, zone signals, deviation +1/+2 follow-through, divergences, RSI channels (BB/KC/Donchian), MTF dashboard. MACD: ±100 normalization, gradient modes, extreme-cross signals, divergences, histogram flips, phase-locked trend squares, MTF dashboard.

Packaging rules learned from BigBeluga: each suite is ONE entry in the indicator picker with **master module toggles** (not 40 list entries); every signal feeds the alert bridge; screener columns come later from the same state machines. PhantomFlow's entire product = Structure Core presets + Trend Waves "Shift" preset + Pulse "Ribbon" preset → we get a "simple mode" story for beginners free of charge (their marketing insight worth copying: one-glance simplicity sells; our default presets should be conservative and readable, with depth behind toggles).

**Scope commitment (clarified 2026-07-28): we are taking the ENTIRE catalog — all ~45 modules across both vendors — not a top-4 subset.** "Four suites" is the packaging shape, exactly as BigBeluga ships (their "Market Core Pro" is one indicator containing 12 modules); waves W1–W5 (§12) enumerate every module including the Signals/MTF dashboards, Market Dashboard, screener columns, and the custom alert sequencer. Two picker-UX consequences:
- **Featured section:** the indicator picker gets a "⭐ Pro Suites" band at top showcasing the four flagships (with preview thumbnails), while every module remains individually discoverable — picker search should match module names ("order blocks", "FVG") and deep-link into the owning suite with that module toggled on.
- **Tier gating (proposal — final split is a product call):** map suites to the existing free/insider/pro entitlements to create upgrade ladders: **Free** = current 25 built-ins + Candle Painter (taste of the premium visual language) + MTF Levels; **Insider** = Trend Waves + RSI Ultimate + MACD Ultimate + basic Structure Core modules (Market Structure, FVG) with conservative "Show Last" caps; **Pro** = everything — full Structure Core (order blocks with volume internals, liquidity suite, SFP, profiles), Pulse Oscillator, all dashboards, screener columns, alert bridge + sequencer, auto-optimization. Gating is per-module (entitlement flag in the module schema), so marketing can re-slice without code changes; locked modules render as teaser rows with an upgrade CTA, never as silent absences.

---

## 7. Platform enablers (build these first, ~1.5 weeks)

**7.1 IndicatorCanvas — one declarative draw-list API over the existing overlay stack.** Modules emit primitives; ONE generic renderer draws them (replacing per-indicator hardcoded builders for new work):
- `zone(box)` — time-anchored price rects: fill/border/rounded corners, extend-right, midline, mitigation states (SVG rect — exists in ORB/volbox code today).
- `ray/line/level` — styles, gradient intensity, auto-remove-on-cross semantics.
- `cloud(polyline pair)` — per-segment state coloring + gradient fills (exists in Ichimoku/ribbon code).
- `label(pill)` — text + pointer + badge + hover tooltip (exists in Oracle badge code); collision-nudging for stacked structure tags.
- `marker(shape)` — diamonds/triangles/circles/crosses with sizes (createSeriesMarkers today caps at 4 shapes; SVG path set gives us the full vocabulary).
- `profileBars` — right-anchored or box-internal histograms (exists in vprofile code).
- `bgShade(columns)` — trend background tinting via the proven `sessionShading.ts` Canvas primitive pattern.
- `candlePaint(per-bar colors)` — LWC candlestick per-bar color/border/wick (natively supported; zero new tech).
- `gradientLine(per-segment colors)` — the one true gap: per-bar-colored line/wave. Implement as segmented SVG polyline in the overlay (Ichimoku already does per-segment polygons; same trick) — no LWC custom-series work needed for v1.
- `chartTable(spec)` — dashboards as absolutely-positioned **React DOM** over the chart (corner-anchored, drag-snappable). Better than canvas tables in every way (fonts, tooltips, a11y) and trivial with our stack.
- Culling/perf: draw only visible range, cap live objects per module (their docs do the same — "Show Last: 6"), memoize compute per (symbol, tf, params-hash) as `runPineMemo` already does.

**7.2 Settings v2 (the "robust settings" requirement).** Extend `IndField` with: `select` (labeled options — kills the "0=classic, 1=camarilla" hack), `source` (open/high/low/close/hl2/hlc3/ohlc4), `timeframe`, `session`, `size` (Tiny…Huge), `linestyle`, `text`, and `group` upgrades: collapsible module sections with **master on/off switches**, tooltips per field, per-field reset, and **presets** (e.g. Scalper / Day / Swing — BigBeluga's trading-profiles idea). The modal keeps Inputs/Style/Visibility tabs; existing persistence (`mm.indParams`, `withDefaults` backfill) works unchanged. Also fix picker/registry drift (generate the modal from `IND_DEFS` categories instead of a hand-list).

**7.3 Signal→Alert bridge.** Every suite emits typed events (`ob_touch`, `bos`, `choch`, `fvg_retest`, `sfp`, `trend_flip`, `tp_hit`, `divergence`, …). Feed them to (a) an on-chart event log/tooltip layer, and (b) **our server-side alert engine** — extend `evaluate()` with these condition types so alerts run every 5 minutes server-side with one-shot semantics. This is a headline differentiator: BigBeluga burns one TradingView alert slot per chart; our users get real push/email alerts per symbol × condition with no slot limit. (Their "Custom Alert 1–5 step sequencer" is a fast-follow: a small state machine over the same event stream.)

**7.4 Data honesty.** Volume-split metrics (delta, buy/sell %) are approximations on EOD bars (candle-geometry split; intraday store where we have it). Follow the quote-hub precedent: a small basis chip in tooltips ("delta: intraday-derived" / "approx from daily bars"). Never present approximated delta as tick data. Directional colors must use the locale-aware pair (the `--up`/`--down` zh flip law applies to every green/red visual in these suites).

---

## 8. Reverse-engineering specs (per module)

Algorithm sketches — enough to implement without their code. Each module also gets: IndDef schema (settings from §2 tables), visual spec (their screenshots as reference → our tokens), guide page, alert events, tests (math parity + snapshot).

### 8.1 Structure Core
- **Pivots (shared primitive):** rolling `pivotHigh/pivotLow(len)` — port of `findPivots` in `lib/drawings.ts`, upgraded with confirmation-bar semantics. Everything below consumes it.
- **Market Structure:** internal (len≈5) + swing (len≈50) pivot chains. Uptrend: close > last swing-high ⇒ **BOS**; close < last higher-low ⇒ **CHoCH**. **CISD** = break whose impulse is fully retraced within k bars on opposing above-average delta ⇒ "failed delivery" flip label. Swing diamonds: net delta percentile at pivot (green/red/yellow) with tooltip {volume, rel-strength vs prior break, break quality, bars-to-break}. Zigzag mapping = polyline over confirmed swings (dashed live leg). HH/HL/LH/LL + %chg labels. Strong/weak H&L: swept (wick-through) = weak. DT/DB: two swings within threshold% (default 0.3) + neckline break; "+" variant completes on opposite-color candle. Structure Candles = candlePaint by internal-trend state.
- **Order Blocks:** on confirmed impulse (BOS or range expansion > k·ATR with volume percentile > p), the **last opposing candle** before the impulse becomes the block (body or full range, setting). Grade = f(volume percentile, delta sign/magnitude, impulse size, freshness) → Weak/Balanced/High/Strong chip. Volume internals: split block-formation volume into buy/sell (intraday store when available, else candle-geometry estimate) → ratio bars + delta ± label + share-of-recent-blocks %. Mitigation modes Touch/Wick/Close/Average → dim → remove. **Breaker**: close-through flips role (support↔resistance), restyled. **Macro**: same detector on resampled HTF bars (`resampleBars` exists). Detection presets map to theirs: Volume (volume-percentile gate), Price Action (structure-break gate), Peak (exhaustion: impulse into OB/OS oscillator extreme).
- **FVG:** bullish gap when `low[0] > high[2]` (mirror for bearish), min size vs ATR threshold. Track fill % from subsequent trade-through; gray the filled fraction. POC inside gap: max-volume price from formation bars (or mean mode). **iFVG**: full-body close-through flips zone role + label. Optional in-gap mini profile (3–5 bins). MTF mode via resample. Signals: creation arrow + retest arrow (edge / POC / re-entry).
- **Liquidity Suite:** Equal H/L = ≥2 pivots within ATR-tolerance → liquidity line, gradient intensity by touch count + volume; **Grab** = wick exceeds level by ≥ s·ATR then closes back (triangle marker). HeatMap = lines from reversal pivots, intensity by formation volume, faded→vibrant with accumulation, removed on cross. Bubbles = pivot markers sized by volume-percentile tier (20/40/60/80%). Sell/Buyside zones = banded areas above/below from pivot clusters (Adjusted vs Extreme anchor). Right-side Liquidity Profile = reversal-weighted volume-at-price histogram.
- **SFP:** sweep of swing + close reclaim within same/next bar; Volume Strength = percentile(sweep-bar volume) blended with reclaim speed → 0–100% chip; >threshold ⇒ "+SFP". Filter modes: none / with-structure-trend / counter-trend. Deviation zone = band from sweep extreme to reclaim level, dashed after first touch.
- **Smart S/R:** cluster pivots into levels (bin width = ATR fraction); score = touches × mean reaction (k-bar forward return) × recency decay; Sensitivity = pivot len + tolerance; Strength = min touch count. Distinct restyle on break (breakout event) vs hold (reversal event).
- **Premium/Discount + Golden Pocket:** range = last confirmed swing pair (len setting, default 5); equilibrium 50%; premium/discount stripes; fib overlays 61.8/65 (golden pocket) and 78.6 (OTE bound), auto-flipped by trend direction.
- **MTF Levels:** prev D/W/M H/L/Mid rays — mostly exists (`slevels`/`pivots`); restyle + unify.
- **Session Open Range:** exists (`orb`); add NY/London/Asia presets + custom window + break signals.
- **Money Flow Profile:** upgrade `vprofile`: per-bin delta split, money-flow $ (Σ price×vol), Level Strength % (normalized to max bin), POC-by-metric (MoneyFlow / Delta+ / Delta− / Strength), VA 70% + VAH/VAL lines, live-bin highlight, strength heat column, bottom delta gauge.
- **HTF Footprint:** per-session volume-at-price columns (needs intraday store on daily charts; on intraday charts, bin chart bars): total bar + buy overlay, POC ray, dashed VA, session summary candle in left margin. Ship where data supports it; hide honestly elsewhere.
- **Auto Patterns:** channels/wedges from regression over pivot sets (parallel vs converging slope test); measured-move targets = range height projected from break; H&S = 3-peak template with threshold%; auto trendlines exist (`autoTrendlines`) — add break labels ("Break Up", "▲+ Strong Break Up" on volume percentile) + alerts.

### 8.2 Trend Waves
- **Trend Engine:** core flip = ATR trailing band family (supertrend exists; add sensitivity mapping ≈ ATR mult × period), tiers: flip = Signal; flip + momentum percentile > p ⇒ **Signal+**; flip after oscillator extreme ⇒ Power Bottom/Top. Retests = band touches post-flip. **Auto-Optimize:** grid-search sensitivity over last 2000 bars maximizing net profit & win rate (client-side, memoized — cheap at our bar counts, and our full-IPO history beats their window). **TP/SL:** dynamic ladder TP1–6 at k·ATR or swing projections with ✓ completion marks; fixed % mode; trailing SL. This module + bgShade + B/S pill labels **is** PhantomFlow's "Phantom Shift" preset.
- **Flow Band:** smoothed adaptive band (HMA/KAMA midline ± dynamic ATR, HTF-sourceable) with turn triangles + price labels + two-layer shadow cloud; retest markers. (The WillyAlgoTrader cloud validates this shape: HMA + ATR envelope + quality-scored retests — adopt the 0–100 quality chip.)
- **Range Magnet:** range-filter band: if |close − band| < filter ⇒ band flat (range mode); else trail. Bottom/top "magnet bars" = short horizontal strength lines stacked at recent extremes; orange when slope decays (exhaustion). Modes Scalp/Normal/Macro = param triplets.
- **Vector Trail:** impulse-following trail that only ratchets on expansion bars (body > k·ATR); flat dashed in balance; ⇡/⇣ re-entry arrows on clean closes beyond trail after pullback.
- **Volatility Bands:** mid MA ± k·smoothed ATR with expansion memory; outside-band glow intensity; retest triangles on re-entry; slope-colored dotted midline.
- **Candle Painter:** 4 modes (trend state / momentum state with aqua-weakening / each × relative-volume saturation). Pure candlePaint.
- **Pattern Candles:** 18 classical detectors, gated: only print in the phase where they mean something (retracement vs trend per Structure state) + volume confirmation; abbreviated labels + aggregate pattern volume.
- **Market Dashboard:** chartTable: Volatility % (ATR percentile), Consolidation 0–10 (BBW/ADX compression percentile), Rating (weighted vote of modules), Optimal Sensitivity (from auto-optimize), Trend Score −10…+10, Pressure −10…+10 (delta percentile), MTF Trend + MTF Reversal rows (resampled module states; source selectable).

### 8.3 Pulse Oscillator
- **Wave:** double-smoothed momentum composite (e.g., TSI/stoch-RSI hybrid tuned to their state semantics), normalized; **4-state coloring** exactly per their doc (purple transition-up, green rising-below-mid, blue rising-above-mid, red extreme-decay) via gradientLine; companion "gapped" longer smoothing + gap fill. Profiles Scalper/Day/Swing = period presets.
- **Signals:** triple-line buy (oversold reversal) / sell (overbought roll) markers; **dip diamonds** (in-trend slope decay); peak markers at wave extremes; gapped-cross diamonds only inside OB/OS; all alertable.
- **Divergence engine:** shared 4-class detector (regular/hidden × bull/bear) comparing price pivots vs oscillator pivots (lookback default 10), multi-divergence stacking counter. Reused by RSI/MACD/MFI/CVD.
- **Volume Mapping:** ± dominance columns from delta estimate; **CVD Flow:** `cvdApprox` z-normalized around zero with bright/dark expansion shading; **Money Flow:** MFI + divergences; **Outlier days:** volume+range z-score > k highlights; day separators.
- **MTF Signals Dashboard:** chartTable, 6 configurable TFs × rows {signals, divs, hidden divs, extremes, sync, MFI state, CVD state}, recency fade, tooltips.

### 8.4 RSI/MACD Ultimate
- **RSI:** per §2 spec — smoothing MA (5 types), gradient OB/OS fills (65/35), in-zone reversal triangles (optional price-chart mirror), **Deviation +1/+2** = ATR-scaled follow-through levels projected from signal bar (dashed after touch), neutral-band-gated MA-cross dots, divergences, RSI channels (BB/KC/Donchian over RSI) with break dots, MTF dashboard, full alert set.
- **MACD:** normalize MACD & signal to ±100 (rolling-window minmax or ATR-scaled tanh — calibrate visually), 10/20/9 defaults, per-line MA type, HeatMap vs Rising/Falling gradient modes, extreme-only cross triangles, divergences (1-bar confirm), ± histogram with intensity grading + "+" flip markers, phase-locked trend squares, MTF dashboard.

---

## 9. Pine engine fix track (user scripts — parallel, smaller)

The premium suite doesn't ride Pine, but the editor is a shipped feature whose current behavior ("compiles ✓, renders nothing") reads as broken. Staged fixes, cheapest-first, reusing §7 primitives:

- **P1 — Honesty (day):** move the silent no-op namespaces to loud warnings; editor banner: "this script uses box/label/table — not yet supported". Kills the "buggy" perception immediately.
- **P2 — High-value correctness (days):** capture full `input()` metadata (options/min/max/step/group/tooltip) and key overrides consistently by variable name → settings UI gains real dropdowns/clamps/groups for user scripts via Settings v2; wire `fill()`/`bgcolor()`/`barcolor()` + per-bar plot colors into IndicatorCanvas (`cloud`/`bgShade`/`candlePaint`/`gradientLine`); real `color.from_gradient`; add `ta.pivothigh/pivotlow`, `ta.vwma/hma/vwap/linreg/bb/kc`.
- **P3 — Object model (week+):** arrays (+`for…in`), then `box/label/line/table` namespaces emitting IndicatorCanvas draw-lists. At that point most public open-source SMC scripts genuinely run.
- **P4 — Hardening:** Web Worker isolation with cancellation (competitive-assessment recommendation), conformance corpus vs TradingView outputs, editor autocomplete.

---

## 10. Guides inside the Terminal

- **Content model:** one markdown doc per module (`terminal/public/guides/<suite>/<module>.md` or a typed TS map): What it shows · How it works (plain language) · How to trade it (their strategy content re-taught in simpler words — e.g. PhantomFlow's pullback recipe generalizes well) · Every setting explained · Alert events. Written by us from scratch; BigBeluga's docs are the outline reference, never the text.
- **Screenshots:** OUR renders. A capture script loads a fixture symbol/timeframe per module with curated settings and screenshots the chart (the PNG-export path already exists in ChartPanel) → consistent, theme-matched, regenerable on every restyle. This beats importing their images on looks alone — and avoids the copyright problem entirely.
- **Surface:** "?" icon in each settings section + legend context menu → side "Guide" panel (same pattern as existing side panels), deep-linked per module; i18n en/zh per house i18n law.
- **Bonus:** guide pages double as SEO/landing content for the premium tier.

---

## 11. UI/UX doctrine (making them masterpieces)

Their visual DNA, translated to ours: deep-dark canvas, one saturated duotone per suite (their teal/purple), **gradient = intensity** everywhere (heat lines, OB/OS fills, recency fades in dashboards), rounded stat chips on zones (state word + tiny numbers), tooltips that answer "how strong / how fresh / how big", hard cap on simultaneous objects (Show Last N defaults small), everything toggleable, sane defaults that look good instantly.

Our implementation rules: all colors from fin.css/globals tokens (no bare hex; the `--sp-*`/`--shadow-*` undefined-token trap applies), directional pairs locale-aware (zh flip), text at our type scale, hover/tooltips through one shared overlay tooltip component, animations subtle (the Oracle pulse is the ceiling), mobile: dashboards collapse to chips, zones render but labels thin out (wave3 mobile overhaul patterns apply). Per-module acceptance: side-by-side against their reference screenshot — ours must look *at least* as premium in our own language, not a pixel clone of theirs.

---

## 12. Roadmap

| Wave | Scope | Effort |
|---|---|---|
| **W0 — Platform** | IndicatorCanvas primitives + Settings v2 field types/groups/presets + signal-event bus + guide panel skeleton + Pine P1 honesty patch | ~1.5 wk |
| **W1 — Structure Core v1** | Pivot primitive, Market Structure (BOS/CHoCH/labels/zigzag/candles), Order Blocks (volume mode + mitigation + chips), FVG (+iFVG), Premium/Discount+OTE, MTF levels restyle; guides + alerts for each | 1–2 wk |
| **W2 — Trend Waves v1** | Trend Engine + TP/SL ladder + bgShade + B/S pills (**= PhantomFlow Shift parity**), Volatility Bands, Candle Painter, Flow Band; auto-optimize; guides+alerts | 1–1.5 wk |
| **W3 — Pulse + Ultimate panes** | Pulse wave + signals + divergence engine (**= Phantom Oscillator parity**), RSI Ultimate, MACD Ultimate; MTF dashboards (chartTable) | 1.5 wk |
| **W4 — Structure Core v2** | Liquidity Suite, SFP, Smart S/R, Money Flow Profile upgrade, Session ORB presets, breaker/macro OBs, CISD, DT/DB | 1–1.5 wk |
| **W5 — Ecosystem** | Market Dashboard, screener columns from suite states, custom alert sequencer, HTF footprint (data-gated), auto patterns, Pine P2/P3 | ongoing |

Every wave ships user-visible value + its guides; PhantomFlow full parity lands by end of W3; BigBeluga effective parity (ex-backtesters/extension) by W5. Backtester equivalent later folds into the existing StrategyTester surface.

## 13. Risks & open items

- **Tuning without their code:** docs give mechanics + defaults but not exact formulas (e.g., Nautilus smoothing, "rating" weights). Mitigation: calibrate visually against their public screenshots per module; where ambiguous, prefer the standard technique and our own judgment — we owe similarity of *value*, not of internals.
- **Volume-split honesty** on EOD data (§7.4) — basis chips, intraday store where present.
- **ChartPanel scale:** 3.4k lines already; IndicatorCanvas must be a separate module with ChartPanel only hosting it, or we compound the monolith. Chart-engine program (P1 rewire) remains compatible — primitives sit behind one interface either way.
- **Perf ceiling:** dozens of live SVG objects × long histories — enforce visible-range culling + object caps from day one.
- **Entitlement:** suites are Pro-gated client-side today; if moat pressure grows, heaviest math can move behind an API later without UX change.
- **Naming/marketing** final pass needed before launch (§6 names are placeholders).
- Scribd reference remains unverified (CAPTCHA) — irrelevant to execution.

## 13.1 BigBeluga's free open-source corpus (clarified)

BigBeluga also publishes hundreds of **free, open-source indicators** on their TradingView profile (their marketing funnel; source visible to anyone). These are NOT import candidates for the Terminal — they're TradingView Pine, mostly simpler cousins/experiments around the paid modules. Their value to us: free, legitimate **implementation references** revealing the house rendering techniques (gradient layering, box/label lifecycle management, `table.new` dashboard patterns, glow effects) and algorithm choices behind the premium suite. A technique-mining pass over this corpus feeds the visual design bible (companion doc below); we study patterns and re-express them in our SVG/Canvas primitives — we do not port their code.

## 14. Source index (for future sessions)

- **Companion doc: `docs/PREMIUM_INDICATOR_VISUAL_DESIGN_BIBLE_2026-07-28.md`** — per-module visual specs written from direct study of every doc screenshot (element inventories, approx palettes, label microcopy, states, adaptation notes) + open-source technique mining. Read it alongside §8 before implementing any module.

- BigBeluga docs index: `https://docs.bigbeluga.com/llms.txt` (append `.md` to any page URL for raw markdown; images at `/files/<id>`) — per-module image-ID lists captured in the 2026-07-28 research transcript.
- PhantomFlow: `https://getphantomflow.com/` + `/guide` (client-rendered; use browser, not plain fetch).
- Reference scripts: TV `hOXtxBUU` (gold knockoff, open-source), TV `5LGQFStB` (HMA/ATR cloud + quality score, open-source), Scribd `895042785` (CAPTCHA-walled, unverified).
- Codebase anchors: `terminal/lib/pine-engine/` (engine), `terminal/lib/indicators.ts` (registry), `terminal/lib/indicatorMath.ts` + `intradayMath.ts` (math), `terminal/components/ChartPanel.tsx` (render/SVG stack, `renderIndOverlays`), `terminal/components/IndicatorSettings.tsx` (settings UI), `terminal/lib/sessionShading.ts` (canvas primitive template), `terminal/lib/drawings.ts` (`findPivots`).
