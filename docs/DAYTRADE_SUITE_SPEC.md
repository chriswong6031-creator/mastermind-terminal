# Day Trade Suite — build spec (2026-07-10, Fable program)

Intraday day-trading indicator suite + one-click **Day Trade Mode** for the Terminal
(Next.js + lightweight-charts v5). Everything here is **display-tier descriptive** — no
buy/sell signals, no scores. Adjudicated from 5 research lanes + 4 code-reader maps.

## 0. Laws (violations = review reject)

- **Directional colors**: only `var(--up)` / `var(--down)` (East-Asian flip `html[data-updown=east]` must keep working). Non-directional palettes (squeeze tiers, level classes) use existing tokens (`--signal`, `--warn`, `--brand-2`, `--muted`, `--text-2`).
- **i18n**: every static UI string via `lib/i18n.tsx` LEX `[EN, ZH]` + `useT()`. No EN-only strings in JSX.
- **One time-type per series** (LWC law): intraday bars carry NUMERIC epoch (market-local display-epoch); never mix with `'YYYY-MM-DD'` strings in one `setData` array.
- **Nulls not NaN**: warmup/missing = `null`; follow `indicatorMath.ts` conventions.
- **New math lives in `lib/intradayMath.ts`** (NEW file) — do NOT touch `lib/indicatorMath.ts` (parity-fixture coupled) or `signal_layer/confluence.py` (golden, frozen).
- **ChartPanel.tsx (2799 lines) / TerminalShell.tsx (1602)**: many small Edits, never whole-file Writes.
- **localStorage persist effects**: use the mount-skip ref guard pattern (see `hidMounted`, TerminalShell.tsx:311-322). All reads inside useEffect (SSR/hydration law).
- **No order execution, no P&L, no news feed** — charting/analytics only.
- **Naming**: no proprietary-guru vocabulary; numeric reference labels only. CVD must carry the honest "approx" label everywhere it renders.

## 1. Session math foundation (`lib/intradayMath.ts`)

Bars: `{ time:number(display-epoch sec), o,h,l,c,v }`, chronological. Display-epoch =
market-local wall-clock reinterpreted as UTC (US→ET, CN/HK→UTC+8, crypto→UTC).

```ts
export const minOfDay = (t:number) => Math.floor(t/60) % 1440;
export const dayKey   = (t:number) => Math.floor(t/86400);
export function sessionOpenMin(market:'us'|'cn'|'hk'|'crypto'|'ca'): number {
  return market==='crypto' ? 0 : 570;           // 09:30 local for us/cn/hk
}
// Contiguous index ranges per display-day: [{ start, end, day }]
export function sessionSlices(bars:Bar[]): {start:number; end:number; day:number}[]
```

RTH for US = minOfDay ∈ [570, 960). Premarket = < 570 (only present when ext=1).
CN/HK lunch gaps need no special handling (cumulative math just skips absent bars).
All functions must tolerate: partial first session (window starts mid-day), missing
bars, half-days, zero-volume bars, `h===l` bars.

Functions (all pure, null-padded to `bars.length`):

| fn | signature (defaults) | notes |
|---|---|---|
| `sessionVwap` | `(bars, market, includePm=false, mults=[1,2,3])` → `{vwap, bands: {up:[], dn:[]}[] }` | Reset each `dayKey`. Skip bars with `minOfDay < openMin` when `!includePm` (emit null). tp=(h+l+c)/3. σ²=Σ(v·tp²)/Σv − vwap²; clamp ≥0. v≤0 bars contribute 0. |
| `openingRange` | `(bars, market, rangeMin=15, exts=[1,2])` → per-session `{day, hi, lo, mid, startIdx, endIdx, sessionEndIdx, exts:{k,up,dn}[]}[]` | Window = bars with minOfDay ∈ [openMin, openMin+rangeMin). Locked after window. Skip sessions with no window bars. |
| `rvolSeries` | `(bars, market, baselineSessions=10)` → `{cum:(number\|null)[], slot:(number\|null)[], sessionsUsed:number}` | Slot key = minOfDay. Baseline = mean cum-vol / mean bar-vol at same slot over prior sessions (exclude current). If sessionsUsed < 3 → all null (caller shows honest note). Current session values only need today's slots; prior-session slots averaged from available sessions (missing slot → fewer samples, fine). |
| `ttmSqueeze` | `(bars, len=20, bbMult=2, kcMults=[1,1.5,2], momLen=20)` → `{mom:(number\|null)[], squeeze:(0\|1\|2\|3\|null)[]}` | BB = SMA ± bbMult·stdev(pop, ÷N — match ChartPanel inline convention and say so in a comment). KC = SMA ± mult·RMA(TR,len). squeeze tier = highest k index where BBwidth < KCwidth(k) (3 = tightest 1.0×KC), 0 = none. mom = linreg slope-fit value: linear regression over `close − ((hh(len)+ll(len))/2 + sma(close,len))/2` window len, evaluated at last point. |
| `adx` | `(bars, len=10)` → `{adx, diPlus, diMinus}` | Wilder DMI via existing-style RMA. |
| `cvdApprox` | `(bars)` → `(number\|null)[]` | Session-reset cumulative Σ v·((c−l)−(h−c))/(h−l); if h===l use sign(c−prevClose)·v (0 for first bar). |
| `pivotLevels` | `(pd:{h,l,c}, mode:'classic'\|'camarilla'\|'fib')` → `{key,label,value}[]` | Classic: PP,R1-R3,S1-S3. Camarilla: R1-R4,S1-S4 (C±(H−L)·1.1/{12,6,4,2}). Fib: PP±{0.382,0.618,1.0}(H−L). |
| `sessionLevels` | `(bars, market, daily:{time:string,h,l,c}[])` → `{key,label,value}[]` | PDH/PDL/PDC from last COMPLETED daily bar strictly before current session's date; PWH/PWL from prior ISO week's daily bars; Open = first bar with minOfDay ≥ openMin today; PMH/PML = today's bars with minOfDay < openMin (US only; omit when none). |

Unit tests (`lib/__tests__/intradayMath.test.ts`, vitest): synthetic multi-session
fixtures (3+ sessions, 5m grid, ET display-epochs incl. premarket bars), plus pathology
cases: partial first session, h===l bars, zero volume, session with <baseline sessions,
lunch-gap (CN-style 09:30–11:30 + 13:00–15:00 grid), crypto UTC day roll. Assert:
session VWAP resets exactly at open bar; bands symmetric & ≥0 σ; ORB locks and ignores
premarket; RVOL=1.0 exactly when today's tape equals baseline; ADX ∈ [0,100];
CVD resets per session; pivots match hand-computed values.

## 2. New indicator registry keys (8)

Add to `IndKey` union + `IND_ORDER` + `IND_DEFS` (lib/indicators.ts), `CATS` in
`IndicatorsModal.tsx` under a NEW category `daytrade` (i18n label: `['Day Trading','日内交易']`
via CAT_TKEY). Every def gets honest pseudo-Pine `source` with a `// DISPLAY-TIER DESCRIPTIVE`
header (existing pattern).

Overlays (price pane):

1. **`svwap` — Session VWAP** `tag:'sVWAP'`. Defaults: `{includePm:false, showB1:true, showB2:true, showB3:false, m1:1, m2:2, m3:3, col:'#e8b339', b1Col:'rgba(77,130,255,0.55)', b2Col:'rgba(232,163,61,0.5)', b3Col:'rgba(240,86,107,0.45)', width:1.6, fill:true}`. VWAP solid; bands dashed (lineStyle 2), σ3 dotted; optional translucent fill ±1σ (SVG polygon like ichimoku cloud, `fillCol:'rgba(77,130,255,0.06)'`). **Band series set `autoscaleInfoProvider: () => null`** (VWAP line itself stays in autoscale). Intraday-only (see §4).
2. **`orb` — Opening Range** `tag:'OR'`. Defaults: `{rangeMin:15, showMid:true, ext1On:true, ext1:1, ext2On:true, ext2:2, boxCol:'rgba(232,179,57,0.10)', lineCol:'#e8a33d', width:1}`. Pure SVG (indOverlayRef + renderIndOverlays, volbox pattern): shaded box over the range window, solid ORH/ORL rays to session end, dashed mid + dashed extensions. Draw for EVERY session in view. SVG text labels `ORH/ORL/±1x/±2x` at ray right ends, 9px, `--text-2`. Intraday-only.
3. **`slevels` — Session Levels** `tag:'Levels'`. Defaults: `{pdh:true,pdl:true,pdc:true,open:true,pmh:true,pml:true,pwh:false,pwl:false, pdCol:'#4d82ff', pdcCol:'#e8a33d', pmCol:'#e8b339', pwCol:'#8b93a3', openCol:'#d6dae3'}`. Implement as `createPriceLine`s on the price series (accum pattern): PDH/PDL solid w1, PDC dashed, PMH/PML dashed, Open dotted, PWH/PWL dotted faint. Titles are the level keys (`PDH`…). PriceLines don't affect autoscale — good. Daily bars via `dataCache.getOhlc(sym)` (client cache); PM levels omitted silently when no premarket bars. Intraday-only.
4. **`pivots` — Pivot Points** `tag:'Pivots'`. Defaults: `{mode:0 /*0=classic,1=camarilla,2=fib*/, extra:false /*R3/S3(+R4/S4 cam)*/, ppCol:'#d6dae3', rCol:'rgba(240,86,107,0.65)', sCol:'rgba(38,194,129,0.65)'}` — NOTE r/s colors are non-directional class colors here, still route through up/down vars: use `var(--down)`-derived for R and `var(--up)`-derived for S at render time, not hardcoded hex (compute from CSS var at build like ribbon candles do — if impractical in priceLine colors, read the resolved var off `getComputedStyle(document.documentElement)`). createPriceLine set, dashed, PP heavier. Intraday-only.

Sub-panes (SUBPANE_ORDER append: `'rvol','ttmsq','adx','cvd'` after `'accum'`):

5. **`rvol` — Relative Volume** `tag:'RVOL'`. Defaults: `{baseline:10, lineCol:'#e8b339', histCol:'rgba(139,147,163,0.45)', width:1.6}`. HistogramSeries = slot-RVOL (muted), LineSeries = cumulative RVOL, priceLine at 1.0 (dashed, `--muted`). Legend value chip shows `2.4×` colored by tier (<1 muted, 1–1.5 text, 1.5–2 warn, ≥2 up) — tier coloring in legend only, pane stays calm. When `sessionsUsed<3`: series empty + legend shows `insufficient history (n<3)` amber note (honest null; mirror the pine intraday-error row pattern). Intraday-only.
6. **`ttmsq` — TTM Squeeze** `tag:'Squeeze'`. Defaults: `{len:20, bbMult:2, momLen:20, showDots:true}`. HistogramSeries momentum: rising-above-0 `var(--up)`, falling-above-0 lighter up-alpha, below-0 mirror with `var(--down)` (4 shades via alpha, colors resolved from CSS vars). Squeeze dots on zero line via priceLine? NO — dots = small SVG circles at y(0) per bar (indSvgRef layer): tier0 `--muted`, tier1 `#e8a33d`, tier2 `#e8734d`, tier3 `#f0566b` (non-directional intensity ramp — allowed). Works on ALL timeframes (incl. daily).
7. **`adx` — ADX** `tag:'ADX'`. Defaults: `{len:10, showDi:false, col:'#4d82ff', width:1.4}`. LineSeries + hlines 20/25 (priceLines dashed). Optional +DI/−DI lines (up/down vars). All timeframes.
8. **`cvd` — Session CVD (approx)** `tag:'Est. CVD'`. Defaults: `{}` (style only: `upCol/dnCol` via up/down vars). Use LWC **BaselineSeries** at 0. Legend label MUST read `Est. CVD (OHLCV approx)`; source stub carries the disclaimer: approximated from close-position-in-range; requires tick/bid-ask data for true CVD. Intraday-only. Default OFF everywhere (not in day-mode preset).

## 3. ChartPanel integration (per the engine reader's checklist)

For each key: `buildX()` (overlay after line ~636 zone, panes after `buildAccum`),
register in `buildAllIndicators`, `updateAllIndicators`, Effect-3 incremental
add/remove (`OVERLAY_KEYS` + sub-pane branch), `rebuildPaneMeta` (overlay literal
array line ~736 + SUBPANE_ORDER handles panes), SVG work in `renderIndOverlays`
(orb box/rays, svwap ±1σ fill, ttmsq dots use indSvgRef in the render pass).
vprofile/volbox precedent: SVG-only builders return `[]` and stash in `indOverlayRef`.

**Session shading** (mode feature, not a registry key): new `lib/sessionShading.ts` —
LWC v5 `ISeriesPrimitive` attached to the candle series when `sessionShade` prop true
AND tf is intraday AND market has sessions (skip crypto): drawBackground rects
(zOrder 'bottom') tinting bars with minOfDay<570 `rgba(232,179,57,0.045)` and ≥960
`rgba(77,130,255,0.045)`. Weekend/holiday gaps need no handling (no bars → no tint).

**Countdown-to-bar-close** (mode feature): small HTML chip absolutely positioned
top-right of price pane: `MM:SS` to current bar close. Current bar open = last bar
time (display-epoch): remaining = intervalSec − (nowMarketLocalSec − barOpen); derive
nowMarketLocal via Intl (`America/New_York` / `Asia/Shanghai` / UTC for crypto) —
reuse the ET_FMT/partsToEpoch approach (intradaySources.ts:53-63). Text `--text-2`,
turns `--warn` under 30s. Hidden when market closed (remaining >

 intervalSec) or tf not intraday. 1s setInterval, mounted only in day mode.

**New ChartPanel/ChartPane props** (C owns ChartPane.tsx thread-through):
`dayMode?: boolean` — enables session shading + countdown + stats strip render.

**Day Stats Strip** (new `components/DayStatsStrip.tsx`, rendered by ChartPanel when
`dayMode && isIntraday`, slim row pinned above chart, Observatory micro-label style):
Gap% (open vs PDC, signed, up/down color) · RVOL (from rvolSeries cum last value)
· Range used % (today range / 14-day daily ATR) · Δ VWAP % (last vs session VWAP,
signed) · HOD / LOD (num font) · session badge `PRE/RTH/AH/CLOSED` + ET clock (1s tick).
All labels i18n. Wraps to horizontal scroll under 900px. Data: intraday rows +
`dataCache.getOhlc` daily bars — compute inside the component from props
`{bars, market, quote?}` (pure; unit-testable helpers exported).

## 4. Intraday-only gating

`svwap/orb/slevels/pivots/rvol/cvd` are meaningless on daily bars. In `buildX`, if tf
not intraday → build nothing; `rebuildPaneMeta` legend row shows amber note
`Intraday timeframes only` (reuse the pine `Not available on intraday timeframes`
error-row mechanism at line ~749, inverted). The IndicatorsModal entries stay
clickable always (discoverability), row simply shows the note on daily.

## 5. Day Trade Mode (TerminalShell — D lane)

State: `dtm:boolean` in TerminalShell, persisted `mm.dtm` (mount-skip guard).
Snapshot key `mm.dtmSnapshot`.

Toggle ON: snapshot `{inds:[...], indParams, tf, favTF, chartType}` → apply:
- `setTf('5m')`; `setFavTF(['1m','5m','15m','1h'])` (merge-preserve user extras);
- `setInds(new Set(['ema','svwap','vol','orb','slevels','rvol']))`;
- `setIndParams` overlay: `ema:{ma1Len:9, ma2Len:20, ma3On:false}` merged over user's (snapshot restores);
- MACD stays off by default; if user adds it in-mode, leave their params alone (fast presets documented in the modal source stubs, not forced);
- ext-hours: force ON while in mode (coordinate with ChartFrameBar's existing eth state — read its state mechanism first; if eth lives in ChartFrameBar localStorage/state, lift or dispatch a CustomEvent `mm:set-eth {on:true}` handled there, restoring prior value on exit);
- `dayMode` prop → panes (session shading + countdown + stats strip).

Toggle OFF: restore snapshot verbatim (including eth). Missing snapshot → no-op restore (keep current), clear flag. Mode flag re-applies on load (after workspace restore, skip when `?sym=` deep-link path skipped restore — apply mode anyway, snapshot untouched).

Button: in `.chart-tabs .tools` between MTF and Sync (TerminalShell.tsx:1091-1092):
`<button className={"tbtn dtm" + (dtm ? " on" : "")}>` label `DAY` (i18n `['Day','日内']`),
lightning-bolt or sunrise glyph optional. Active style: amber pill — `.tbtn.dtm.on{
background:rgba(232,179,57,.16); color:var(--signal); border-color:rgba(232,179,57,.35)}`
(new rule in globals.css; do NOT rely on color alone — label stays visible). Tooltip
`Day Trade Mode (Alt+D)`.

Hotkeys (global keydown listener in TerminalShell, skip when target is input/textarea/
contenteditable): `Alt+D` toggle mode; while in mode `Alt+1/2/3/4` → 1m/5m/15m/1h.
`?dtm=1` deep link param → mode ON after mount (same urlSearch pattern, strip after consume).

Deep-link + `?ind=` continue to work (mode preset is a starting point, user can add/remove).

### 5b. C↔D interface contract (FIXED — code to this exactly)

- `extHours` lives in per-pane `ChartSettings` (ChartPane.tsx state, persisted to
  localStorage `mm.chartSettings`, patched via `patchSettings`).
- **C lane**: ChartPane accepts new prop `dayMode?: boolean`, threads it to ChartPanel
  (which uses it for session shading + countdown + DayStatsStrip). ChartPane also adds a
  `useEffect` window listener for CustomEvent `mm:set-eth` → `patchSettings({ extHours: !!(e.detail?.on) })`.
- **D lane**: TerminalShell passes `dayMode={dtm}` at its ChartPane render callsite
  (TerminalShell.tsx, D-owned). On mode ON: snapshot `extHours` by reading localStorage
  `mm.chartSettings` (JSON, `.extHours`, default false), then
  `window.dispatchEvent(new CustomEvent('mm:set-eth', { detail: { on: true } }))`.
  On mode OFF: dispatch the same event with the snapshotted value.
- D does not touch ChartPane.tsx/ChartPanel.tsx; C does not touch TerminalShell.tsx.
- ChartFrameBar.tsx needs NO changes (its chip reflects settings state automatically).

## 6. i18n keys (B lane adds ALL at once; C/D only consume)

`dtmBtn:['Day','日内']`, `dtmTip:['Day Trade Mode (Alt+D)','日内交易模式 (Alt+D)']`,
`dtmOn:['Day Trade mode on','已开启日内模式']`, `dtmOff:['Day Trade mode off','已退出日内模式']`,
`catDaytrade:['Day Trading','日内交易']`, `indSvwap:['Session VWAP','日内均价 VWAP']`,
`indOrb:['Opening Range','开盘区间']`, `indSlevels:['Session Levels','关键价位']`,
`indPivots:['Pivot Points','枢轴点']`, `indRvol:['Relative Volume','相对成交量']`,
`indTtmsq:['TTM Squeeze','挤压动能']`, `indAdx:['ADX','趋势强度 ADX']`,
`indCvd:['Est. CVD (approx)','估算累计成交量差(近似)']`,
`dsGap:['Gap','跳空']`, `dsRvol:['RVOL','相对量']`, `dsRange:['Range used','振幅消耗']`,
`dsVwapD:['Δ VWAP','偏离VWAP']`, `dsHod:['HOD','日高']`, `dsLod:['LOD','日低']`,
`dsPre:['PRE','盘前']`, `dsRth:['RTH','盘中']`, `dsAh:['AH','盘后']`, `dsClosed:['CLOSED','休市']`,
`intradayOnly:['Intraday timeframes only','仅限日内周期']`,
`rvolNoBase:['insufficient history (n<3)','历史数据不足 (n<3)']`.
(Exact final key list may grow; keep the `dtm/ds/ind` prefixes.)

## 7. File ownership (parallel-safety)

- **B (foundation)**: `lib/intradayMath.ts` (new), `lib/__tests__/intradayMath.test.ts` (new), `lib/indicators.ts`, `components/IndicatorsModal.tsx`, `lib/i18n.tsx` (ALL new keys in ONE pass), `lib/sessionShading.ts` (new).
- **C (chart)**: `components/ChartPanel.tsx`, `components/ChartPane.tsx`, `components/DayStatsStrip.tsx` (new) + `components/DayStatsStrip.module.css` (new, CSS Module — strip/countdown/badge styles live HERE, not globals.css), countdown chip.
- **D (shell)**: `components/TerminalShell.tsx`, `app/globals.css` (ONLY the `.tbtn.dtm.on` rule), `components/ChartFrameBar.tsx` needs NO changes (§5b).
- Nobody touches: `lib/indicatorMath.ts`, `signal_layer/`, pine-engine.

## 8. Verification gates (all must pass before PR)

1. `npm test` (all vitest incl. new intradayMath suite) + `npx tsc --noEmit` (repo has NO CI — these are the only gates; `next.config.ts` ignoreBuildErrors hides type errors from the build, so tsc is mandatory).
2. Browser (dev server, REAL data): AAPL 5m ext-on — day mode ON: session VWAP resets at 09:30 each day, bands sane, ORB box per session, levels labeled, RVOL pane numeric, strip values sane vs manual calc; screenshot. 600519.SS 5m (lunch gap): no NaN artifacts across the gap; screenshot. Daily TF: intraday-only indicators show the amber note, ttmsq/adx render, existing indicators unchanged; screenshot. Mode OFF: exact restore of prior workspace. East-Asian flip + ZH lang + ~390px width: strip scrolls, nothing broken; screenshots.
3. Console: zero errors on all above.
4. `node components/__tests__/*.mjs` still pass (untouched but run them).
