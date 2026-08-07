# Chart Surface Delta Spec — shell mode (`?shell=app`) → TradingView mobile parity

**Status:** implementable delta list. Build items **in the numbered order** — later items assume
earlier ones landed (D0 in particular is a hard prerequisite for D5/D6/D7).

**Scope law:** every rule in this document is scoped to the native shell. The browser web app
(`/terminal` without `?shell=app`) must be **byte-identical in rendered pixels** to today. Any
change that cannot be scoped is called out explicitly and given a web-neutral default.

**Measurement basis.** All px below are **CSS px == pt** (the WebView renders 402pt wide at
DPR 3, so device px ÷ 3 = CSS px). "Ours" is measured from
`scratchpad/tvshots/live-chart.png` / `live-preview.png` (1206×2622). "TV" is measured from
`/Users/chriswong/Downloads/tradingview/IMG_2321.PNG` and `IMG_2323.PNG` (1206×2622,
Display-P3 → sRGB converted before sampling — raw `getpixel` on those files is wrong).

**Headline geometry win.** Ours spends **46.3pt** on a web toolbar row and **26pt** on a bottom
range row that TV does not have at all. Deleting both from the flow returns **72.3pt of chart
height — 8.7% of the 832pt WebView** — and is the single biggest contributor to the "made by a
high schooler" read.

---

## Vertical band comparison (device px, top-of-webview = 186)

| Band | Ours (live-chart.png) | TV (IMG_2321) |
|---|---|---|
| Web toolbar row | 186 → 325 (**46.3pt**) `.chart-tabs` | *absent* |
| Identity / quote header | 326 → 470, **one clipped row** | 186 → 340, **two rows**, overlays canvas |
| Legend-count chip row | 480 → 563 | 345 → 421 |
| Chart paint | 470 → 2140 | 340 → 2130 |
| Time axis | 2060 → 2140 | 2130 → 2217 |
| Bottom range row | 2140 → 2218 (**26pt**) `.chart-frame-bar` | *absent* |
| Native toolbar | 2218 → 2372 | 2218 → 2372 |

---

# D0 — Root-level shell marker (prerequisite, **JS**, risk: low)

**Why this is item zero.** `ChartPanel.readTokens()` reads
`getComputedStyle(document.documentElement).getPropertyValue(...)` (`components/ChartPanel.tsx:68`).
The existing shell marker lives on the `.app` **div**, not on `<html>` — so a `.shell-app { --up: … }`
override is **invisible to the chart engine**. Every CSS-variable retheme below therefore requires a
marker on `<html>`, applied **before the first chart-create effect runs**.

There is already a pre-paint precedent: `LOCALE_INIT` in `app/layout.tsx:32-40` sets
`data-updown` / `data-lang` on `document.documentElement` inside a `<head>` script. Extend it.

**File:** `terminal/app/layout.tsx`, inside the `LOCALE_INIT` template literal, appended before the
closing `}catch(e){}})();`:

```js
  var sp=new URLSearchParams(location.search);
  if(sp.get('shell')==='app'){
    document.documentElement.setAttribute('data-shell','app');
    if(sp.get('tray')==='1') document.documentElement.setAttribute('data-tray','1');
  }
```

**Canonical selectors used by every CSS rule below**

| Selector | Meaning |
|---|---|
| `html[data-shell="app"]` | native shell, both modes |
| `html[data-shell="app"]:not([data-tray])` | full Chart tab |
| `html[data-shell="app"][data-tray="1"]` | embedded symbol-preview sheet |

**Cascade placement.** All CSS in this document goes in **one new block appended at the very end of
`terminal/app/globals.css`** (currently 3385 lines) under the banner
`/* ═══ TV chart-surface parity — native shell only (D1–D12) ═══ */`. It must sit after the existing
`.shell-app` block (3082-3103) *and* after the Drawing-Studio `@media (max-width:860px)` blocks
(~3308) so source order backs up the specificity. Every selector below is ≥(0,2,0), which already
outranks the ≤860px phone rules — the EOF placement is belt-and-braces.

**Do not** remove or edit the existing `.shell-app` rules; `data-shell` on `<html>` is additive.

**Verify:** `document.documentElement.dataset.shell === "app"` is true *before* the first
`chart-create` mark in `?boottrace=1`.

---

# D1 — Delete the web toolbar row from the chart surface (**CSS**, risk: medium)

### Ours
`.chart-tabs` (`components/TerminalShell.tsx:2587`, `app/globals.css:212` + phone block 1949-1958):
a full-bleed 46.3pt row, bg `#0A0B0E`, 1px `#23262f` bottom border, containing

- a **one-tab tab bar** — `.ct.on` "Price chart", 13px/600 `#d6dae3`, with a 2px `#2962ff`
  underline (measured: ink y 237-265, underline x 18-242). A tab strip with exactly one tab and
  a selected-state underline is the single loudest "desktop app squeezed onto a phone" tell.
- `.tbtn` "Candles ▾", "+ Indicators", "⚡ Day" — 12px/600 `#9ba3b4`, 34px tall.

### TV
No web-owned top chrome whatsoever. Canvas starts at y=186, immediately under the status bar; all
persistent controls live in the **native** bottom toolbar (which we already have at parity) and in
two on-canvas affordances at Row C (the `⌄ 9` chip and the purple sync disc).

### Target (full Chart tab)
`.chart-tabs` leaves the flex flow and becomes a **transparent, right-aligned control cluster
floating on Row C** of the canvas — the same y-band as the legend-count chip, mirroring TV's
"controls float over the plot, no chrome bar" language. The `Price chart` tab is removed. Labels are
**kept** (not icon-only): `+ Indicators` is the app's only indicator-management entry and must stay
self-describing.

Measured budget at 402pt: chip ~45pt on the left + cluster ~205pt on the right = 250pt of 402pt.

### CSS

```css
/* D1 — no toolbar row: the three surviving controls float on Row C of the canvas.
   .workspace is position:relative (globals.css:1880), so the absolute box lands on the chart. */
html[data-shell="app"]:not([data-tray]) .chart-tabs{
  position:absolute; top:56px; right:0; left:auto; z-index:8;
  height:28px; padding:0 10px 0 0; gap:6px;
  background:transparent; border-bottom:0;
  overflow:visible; pointer-events:none;
}
html[data-shell="app"]:not([data-tray]) .chart-tabs .ct{display:none}
html[data-shell="app"]:not([data-tray]) .chart-tabs .tools{
  margin-left:0; gap:6px; pointer-events:auto;
}
/* control pills: TV's translucent-over-canvas idiom, not a filled toolbar button */
html[data-shell="app"] .chart-tabs .tbtn{
  height:28px; min-height:28px; padding:0 9px; gap:5px;
  border-radius:7px;
  background:rgba(6,9,14,.5);
  border:1px solid #3d3d3d;
  color:#dbdbdb;
  font:600 11.5px/1 var(--font-ui);
  text-shadow:0 1px 3px rgba(0,0,0,.7);
}
html[data-shell="app"] .chart-tabs .tbtn svg{width:14px;height:14px;stroke-width:1.9}
html[data-shell="app"] .chart-tabs .tbtn:hover,
html[data-shell="app"] .chart-tabs .tbtn:active{background:rgba(6,9,14,.82);color:#fff}
/* "Day" active state: keep the amber semantic, drop the extra border box */
html[data-shell="app"] .chart-tabs .tbtn.dtm.on{
  background:rgba(232,179,57,.20); border-color:rgba(232,179,57,.55); color:var(--signal);
}
/* the ▾ affordance on the chart-type button is noise at this size */
html[data-shell="app"] .chart-tabs .tbtn>span{display:none}
```

**Risk / watch-outs**

- `.chart-tabs` hosts `.pophost` popovers and `MobileSheet` portals. `MobileSheet` renders
  `position:fixed` (globals.css `.msheet`), so it is unaffected. Desktop `.pop` / `.tfgrid` are
  already `display:none!important` at ≤860px — keep it that way.
- `pointer-events:none` on the container + `auto` on `.tools` means the empty left half of the
  overlay row does not steal chart pans. **This is load-bearing** — without it the absolute box
  spans the full width and eats a 28pt horizontal strip of chart gestures.
- The phone rule `.chart-tabs{overflow-x:auto}` is overridden to `visible` above; the cluster must
  never scroll.

---

# D2 — Two-row identity/quote header (**CSS + 3-line JS**, risk: medium)

### Ours
`.statusline` (`components/ChartPanel.tsx:6690`, CSS `globals.css:271-278`) is a **single 12px flex
row**: logo(⌀19.3pt) · `NVIDIA Corp · 3D · NASDAQ` · live-dot · `O 193.45 H 201.97 L 191.5…`
— and it is **clipped by the viewport**: measured ink runs to x=1206 with `C`, the % change and
`Vol` entirely off-screen behind the price scale. The user therefore has **no price and no change
anywhere on the chart surface** except a 78px axis badge. Ink height 32px (12px font),
name colour `#d6dae3`, `.mut` labels `#717a8e`.

### TV (measured, IMG_2321)
Two rows, no backing surface, both overlaying the canvas gradient:

| | content | metrics |
|---|---|---|
| Row A | logo · company name | logo ⌀16.7pt at x=10pt; name ink 46px→**17px Medium**, `#B1B5BE`; ink y 210-262 |
| Row B | `At close:` + price + Δ + (Δ%) | `At close:` `#B1B5BE`; **price AND Δ are both `#079881`** (the *fill* hex, not `tvUpText`) — measured 2820 px of `#079881` across the whole run; ink y 291-326 → **17px Bold** |

Left inset 10pt, top inset 8pt.

### Target
Row A = logo + identity. Row B = last price + bar change, both painted in the up/down **fill** hex.
OHLC is dropped at rest (TV shows OHLC only on crosshair scrub). Nothing may clip.

### JS (`components/ChartPanel.tsx`, inside `paintStatus`, lines 2095-2097)

Three edits, all additive; the web renders identically because the two new elements are
`display:none` by default.

```ts
// was: if (showOHLC) valuesHtml += `<span class="mut">O</span><b>${f(last.o)}</b>…`;
if (showOHLC) valuesHtml += `<span class="status-ohlc"><span class="mut">O</span><b>${f(last.o)}</b><span class="mut">H</span><b>${f(last.h)}</b><span class="mut">L</span><b>${f(last.l)}</b><span class="mut">C</span><b>${f(last.c)}</b></span>`;
// NEW — shell-only last price (hidden on web by the base rule below):
valuesHtml += `<b class="status-last">${f(last.c)}</b>`;
if (showBarChange) valuesHtml += `<b class="status-change ${u ? "up" : "down"}">${u ? "+" : ""}${f(ch)} (${u ? "+" : ""}${cp.toFixed(2)}%)</b>`;
```

Also wrap volume and day-change so they can be hidden as a unit:

```ts
if (showVolumeRef.current) valuesHtml += `<span class="status-vol"><span class="mut">Vol</span><b>…</b></span>`;
… valuesHtml += `<span class="status-day"><span class="mut">Day</span><b class="…">…</b></span>`;
```

And make the Golden-Oracle chip token-derived so it tracks the shell palette
(`components/ChartPanel.tsx:2133`, byte-identical output on web):

```ts
w.style.background  = `color-mix(in srgb, ${buy ? t.buy : t.sell} 12%, transparent)`;
w.style.borderColor = `color-mix(in srgb, ${buy ? t.buy : t.sell} 30%, transparent)`;
```

### CSS

```css
/* D2a — web-neutral default for the new element (zero pixel change on web) */
.status-last{display:none}

/* D2b — shell: stack Row A over Row B; .mm chips ride to the right of Row B, bottom-aligned,
   so the Row-C band below never moves when the oracle chip mounts. */
html[data-shell="app"] .statusline{
  align-items:flex-end; gap:8px; padding:8px 12px 0;
  font-size:17px; max-width:100%;
}
html[data-shell="app"] .statusline>span:first-child{
  flex:0 1 auto; min-width:0;
  flex-direction:column; align-items:flex-start; gap:2px;
}
html[data-shell="app"] .status-identity{gap:8px; max-width:calc(100vw - 24px)}
html[data-shell="app"] .status-symbol-logo{width:17px;height:17px;font-size:8px}
html[data-shell="app"] .status-symbol-name{
  font:500 17px/1.25 var(--font-ui); color:#b1b5be; letter-spacing:-.01em;
}
html[data-shell="app"] .status-market-dot{width:6px;height:6px}
html[data-shell="app"] .status-values{gap:6px; font:700 17px/1.25 var(--font-num); font-variant-numeric:tabular-nums}
/* Row B: OHLC / Vol / Day are scrub-only data on TV — suppressed at rest */
html[data-shell="app"] .status-ohlc,
html[data-shell="app"] .status-vol,
html[data-shell="app"] .status-day{display:none}
html[data-shell="app"] .status-last{display:inline; font:700 17px/1.25 var(--font-num); font-variant-numeric:tabular-nums}
/* TV chart-tab exception (master spec §6 C1): price AND change use the up/down FILL hex here,
   not the softer text token used on symbol-detail. */
html[data-shell="app"] .statusline .status-last,
html[data-shell="app"] .statusline .status-change.up{color:var(--up)}
html[data-shell="app"] .statusline .status-change.down{color:var(--down)}
html[data-shell="app"] .statusline .status-last{color:inherit}
html[data-shell="app"] .status-values:has(.status-change.up) .status-last{color:var(--up)}
html[data-shell="app"] .status-values:has(.status-change.down) .status-last{color:var(--down)}
html[data-shell="app"] .statusline .status-change{margin-left:0; font-weight:700}
/* oracle / replay / detail chips: quieter, aligned to Row B's baseline */
html[data-shell="app"] .statusline .mm{font:600 9.5px/1 var(--font-ui); padding:3px 7px; flex:none}
```

**Note on `:has()`** — Safari 15.4+/iOS 16+, well inside the shell's iOS 17+ floor. If the builder
prefers to avoid it, drop the two `:has()` rules and instead emit the up/down class on
`.status-last` in `paintStatus` (`<b class="status-last ${u?"up":"down"}">`), then style
`.status-last.up{color:var(--up)}`. Either is acceptable; pick one, not both.

**Width proof at 402pt:** Row A = 12 + 17 + 8 + name + 8 + 6 + 12 → name budget **339pt**; the
worst measured identity string (`NVIDIA Corp · 3D · NASDAQ`, 17px Medium) is ~205pt. Row B =
`200.75` (57pt) + 6 + `+5.71 (+2.93%)` (110pt) = 173pt, leaving 205pt for the `.mm` chips. Both fit
with `.status-symbol-name` keeping its existing `text-overflow:ellipsis` as the backstop.

---

# D3 — Legend-count chip → TV's outlined ghost pill (**CSS**, risk: low)

| | Ours | TV |
|---|---|---|
| box | 51 × 28pt | **42.3 × 25.7pt** |
| fill | `rgba(6,9,14,.5)` → renders `#0C1018` (a solid dark plate) | **transparent** (canvas shows through) |
| border | none | **1px `#3D3D3D`** |
| radius | 6px | ~7px |
| glyph/digit | 13px chevron + 11.5px `#9ba3b4` | chevron + digit **`#DBDBDB` Bold**, digit ~13px |
| y position | top 49px (`.lg-block:first-child{padding-top:11px}` + JS `legendTop = p.top + 38`) | top 53pt |

```css
html[data-shell="app"] .lg-collapse{
  height:26px; min-width:42px; padding:0 10px; gap:6px;
  border-radius:7px;
  background:transparent; border:1px solid #3d3d3d;
  color:#dbdbdb;
}
html[data-shell="app"] .lg-collapse:hover,
html[data-shell="app"] .lg-collapse:active{background:rgba(6,9,14,.55); color:#fff}
html[data-shell="app"] .lg-collapse svg{width:15px;height:15px;stroke-width:2.2}
html[data-shell="app"] .lg-cnt{font:700 13px/1 var(--font-num); color:#dbdbdb; padding:0; font-variant-numeric:tabular-nums}
/* Row C alignment: price-pane legend block drops below the new two-row header.
   `.lg-block:first-child` matches EVERY pane's block (each is the first child of its own
   wrapper div, ChartOverlays.tsx:177) — so target the price pane's wrapper explicitly.
   ChartPanel.tsx:1683 pushes `__price__` first, so `>div:first-child` is the price pane. */
html[data-shell="app"]:not([data-tray]) .chart-overlays>div:first-child .lg-block{padding-top:18px}
html[data-shell="app"][data-tray="1"] .chart-overlays>div:first-child .lg-block{padding-top:0}
```

`legendTop(price) = 38` + `padding-top:18` = **56px**, matching D1's control-cluster `top:56px` and
TV's 53pt. Tray mode has no header rows, so `padding-top:0` → chip at 38px.

---

# D4 — Legend rows → plateless TV overlay text (**CSS**, risk: medium)

### Ours
`.lg-row` at ≤860px: 28px tall, `border-radius:5px`, and a **dark plate painted via an inline
`style` attribute** (`ChartOverlays.tsx:190`: `background: rgba(6,9,14, backgroundOpacity*0.0054)`
→ `rgba(6,9,14,.378)` at the default 70). `.lg-name` 13px/550 `var(--text)`. Hidden rows
`opacity:.66`. Block `gap:3px`.

### TV (measured, IMG_2323)
**No backing plate at all** — the study names are translucent overlay text directly on the candles.
Row pitch **78 device px = 26pt**; ink 50px → **~19-20px Semibold**. Visible `#B1B5BE`, hidden
`#575757` + trailing eye-slash. Selected row becomes a near-full-width pill:
fill `#0F0F0F`, **1px `#1748CC`** border (measured — noticeably darker/more saturated than the
master spec's `tvSelectAccent #3D7BFF`; trust the pixel).

### Target + deliberate deviation
Plate removed; TV's colours and 26pt pitch adopted. Name font set to **15px, not TV's 19-20px** —
our labels carry parameter suffixes TV's do not (`Stochastic RSI (14, 14, 3, 3)` vs `Stoch RSI`), and
19px at our label lengths overruns 402pt before the ellipsis can help. 15px + a 190pt clamp keeps
the whole stack inside the pane.

```css
/* the inline style attribute on .lg-row means !important is REQUIRED to kill the plate */
html[data-shell="app"] .lg-row{
  height:26px; padding:0; gap:8px;
  background:transparent!important; border-color:transparent; border-radius:0;
  max-width:calc(100vw - 96px);
}
html[data-shell="app"] .lg-name{
  font:600 15px/1 var(--font-ui); color:#b1b5be; max-width:190px;
  text-shadow:0 1px 3px rgba(0,0,0,.8);
}
html[data-shell="app"] .lg-row.is-hidden{opacity:1}
html[data-shell="app"] .lg-row.is-hidden .lg-name{color:#575757; font-weight:600}
html[data-shell="app"] .lg-row.is-hidden .lg-ic.eye{color:#dbdbdb}
html[data-shell="app"] .lg-block{gap:0}
/* armed (= TV "selected indicator") — the ONE state that keeps a surface */
html[data-shell="app"] .lg-row.is-armed{
  background:#0f0f0f!important; border:1px solid #1748cc; border-radius:8px;
  padding:0 4px 0 9px; height:30px;
}
html[data-shell="app"] .lg-row.is-armed .lg-name{color:#dbdbdb; text-shadow:none}
html[data-shell="app"] .lg-ic{width:26px;height:26px;color:#dbdbdb}
html[data-shell="app"] .lg-ic svg,html[data-shell="app"] .lg-ic .lgsvg{width:18px;height:18px}
```

**Watch-out:** the `::before{inset:-8px}` hit-area expander on `.lg-ic` (globals.css:2220) is
untouched — the ≥40pt tap target survives. Do not add a `min-height` floor to `.lg-ic`; it inflates
the icons out of the row (documented at globals.css:1995).

---

# D5 — Indicator value badges: kill the series-name pill (**JS**, risk: low)

### Ours (measured)
The stoch pane paints **four** filled chips and the MACD pane **five**:

| chip | box | fill |
|---|---|---|
| `%D` name chip | 58 × 16.7pt (x 750-924) | `#F0566B` |
| `31.12` value chip | 44 × 16.7pt | `#F0566B` |
| `%K` / `24.76` | same | `#26C281` |
| `signal` / `−2.32` | same | `#D4AC0D` |
| `MACD-RSI` / `−2.84` | same | `#00BCD4` |

These are **canvas-drawn by lightweight-charts**, not DOM — LWC's `PriceAxisView` renders a
*second* filled label for the series `title` whenever `title` is set alongside
`lastValueVisible`. There is no CSS hook.

### TV (measured, IMG_2323)
One small pill per plot, **value only, no name chip** — `1.17 / 0.6012 / 0.5670 / −2.19 / −2.91`
stacked on `TH_RSIMACD+`. Pill height **51 device px = 17pt** — i.e. *identical to ours*. The
loudness is 100% the duplicate name chip (which our DOM legend already carries) plus the palette
(D6), not the pill size. **Do not change `layout.fontSize`.**

### JS — `components/ChartPanel.tsx`

Add next to `readTokens` (~line 343):

```ts
/** Native shell renders TV-parity axis chips: the VALUE pill only. LWC draws a second filled
 *  label for a series `title`, which duplicates the DOM legend and triples the axis ink.
 *  Web is unchanged. (D5) */
const shellAxis = () =>
  typeof document !== "undefined" && document.documentElement.getAttribute("data-shell") === "app";
const axTitle = (s: string) => (shellAxis() ? "" : s);
```

Wrap **every** `title:` on a series that also carries `lastValueVisible: true` — the full,
exhaustive call-site list (line numbers as of this spec):

| line | current | becomes |
|---|---|---|
| 843 | `title: "RSI"` | `title: axTitle("RSI")` |
| 862 | `title: "%K"` | `title: axTitle("%K")` |
| 863 | `title: "%D"` | `title: axTitle("%D")` |
| 886 | `title: "MACD-RSI"` / `title: "signal"` | `axTitle(...)` both |
| 1176 | `title` (variable) | `title: axTitle(title)` |
| 1185 | `` title: `RVWAP ${p.length}` `` | `` title: axTitle(`RVWAP ${p.length}`) `` |
| 1194 | `title: "WVWAP"` | `axTitle("WVWAP")` |
| 1219-1221 | `` title: `RSI${p.lenN}` `` ×3 | `axTitle(...)` ×3 |
| 1234 | `title: "Accum%"` | `axTitle("Accum%")` |
| 1399, 1414 | `title: "RVOL"` | `axTitle("RVOL")` |
| 1474 | `title: "ADX"` | `axTitle("ADX")` |
| 1484, 1486 | `title: "+DI"` / `"-DI"` | `axTitle(...)` |
| 1504 | `title: "Est. CVD"` | `axTitle("Est. CVD")` |

`axTitle` must be evaluated at `addSeries` time (it is), and D0 guarantees the attribute is set
before the first chart-create effect.

**Risk:** LWC treats `title: ""` as "no title label" — verified behaviour, not a hack. Threshold
`createPriceLine`s already set `axisLabelVisible:false` (lines 845/866/888/1224/1478), so no new
axis ink appears.

---

# D6 — Candle / volume / MA / oscillator palette (**CSS vars + one JS table**, risk: low)

### Measured
| token | ours | TV |
|---|---|---|
| bull | `#26c281` (lime) | **`#089981`** (teal) |
| bear | `#f0566b` (salmon) | **`#F23645`** |
| chart bg | flat `#131722` | **vertical gradient `#181B26` (top) → `#131722` (bottom)** (measured `#171B27` top / `#131723` bottom — lightest at TOP, darkest row abuts the chrome; arrow corrected 2026-08-01, C1) |
| gridline | `#1C202B` on bg (Δ9) = `rgba(255,255,255,.04)` | `#232732` on bg (Δ12) ≈ **`rgba(255,255,255,.055)`**, pitch 47pt |
| axis text | `#717A8E`, ink 23px | **`#B1B5BE`**, ink 23px (same size) |
| ref badge | — | `#2961FF` |
| volume last-value badge | — | `#EF5350` (a genuinely distinct, softer red from `#F23645`) |

### 6a — CSS variables (`<html>`-scoped so `readTokens()` sees them)

```css
/* D6a — TV-measured up/down. Must sit AFTER html[data-updown="east"] (globals.css:111),
   and must provide the flipped variant, or CN/HK users lose red-up. */
html[data-shell="app"]{
  --up:#089981; --down:#f23645;
  --buy:#089981; --sell:#f23645;
  --up-rgb:8,153,129; --down-rgb:242,54,69;
  --chart-axis-text:#b1b5be;
  --chart-grid:rgba(255,255,255,.055);
}
html[data-shell="app"][data-updown="east"],
html[data-shell="app"][data-red-up="true"]{
  --up:#f23645; --down:#089981;
  --buy:#f23645; --sell:#089981;
  --up-rgb:242,54,69; --down-rgb:8,153,129;
}
/* canvas gradient — LWC's layout.background is transparent, so the CSS surface shows through */
html[data-shell="app"] .pane{background:linear-gradient(180deg,#131722 0%,#181b26 100%)}
```

and, in the `:root` block (`globals.css:5-16`), two **new tokens whose defaults reproduce today
exactly** (zero web pixel change):

```css
  --chart-axis-text:#717a8e;              /* == today's --muted, read by ChartPanel.readTokens */
  --chart-grid:rgba(255,255,255,.04);     /* == today's --grid */
```

### 6b — `readTokens` reads the new tokens (**JS**, `components/ChartPanel.tsx:344`)

```ts
type Tokens = { …; grid: string; axis: string; mut: string; … };
const readTokens = (): Tokens => ({
  …,
  grid: css("--chart-grid") || css("--grid"),
  axis: css("--chart-axis-text") || css("--muted"),
  mut:  css("--muted"),                       // unchanged — still used by signal markers (2816/2869)
  …,
});
```

Then swap **only the three axis-text call sites** from `mut` → `axis` (leave 1611/2308/2816/2869 on
`mut`):

- `2531`: `layout: { …, textColor: t.axis, fontSize: 12, … }` — also raise `11` → `12` so the
  creation options match the settings effect and the axis does not reflow one frame after mount.
- `6399`: `textColor: settings.scaleTextColor || t.axis`
- `6481`: `textColor: chartSettings.scaleTextColor || tokens.axis`

Grid call sites (`2532`, `6400`, `6489-6490`) keep reading `tokens.grid`, which now resolves through
`--chart-grid`.

### 6c — Indicator default colours (**JS**, `terminal/lib/indicators.ts:52-58`)

The `COL` table is plain hex, not token-backed, so volume / MA / stoch do **not** follow 6a. Replace
the table with a shell-gated one. Module scope is safe: D0's pre-paint script runs before any bundle
executes, and these values never reach SSR'd HTML (no hydration risk).

```ts
// TV-parity palette for the native shell only (docs/tv-parity, measured). Web keeps locked v5.
const _SHELL = typeof document !== "undefined"
  && document.documentElement.getAttribute("data-shell") === "app";
const COL = {
  warn: "#e8a33d",
  link: _SHELL ? "#2962ff" : "#4d82ff",
  faint: _SHELL ? "rgba(177,181,190,0.38)" : "rgba(214,218,227,0.5)",
  up:   _SHELL ? "#089981" : "#26c281",
  down: _SHELL ? "#f23645" : "#f0566b",
  gold: "#e8b339", yellow: "#f5c518",
  upFill:   _SHELL ? "rgba(8,153,129,0.45)"  : "rgba(38,194,129,0.4)",
  downFill: _SHELL ? "rgba(242,54,69,0.45)"  : "rgba(240,86,107,0.4)",
  upHist:   _SHELL ? "rgba(8,153,129,0.55)"  : "rgba(38,194,129,0.5)",
  downHist: _SHELL ? "rgba(242,54,69,0.55)"  : "rgba(240,86,107,0.5)",
  bbBand: "rgba(77,130,255,0.55)", bbBasis: "rgba(214,218,227,0.45)",
};
```

**Three deliberate, documented deviations from the raw TV measurement — do not "fix" them:**

1. **Volume stays at 0.45 alpha**, not TV's measured 100% saturation. TV's volume sliver occupies
   ~5% of the price pane; ours occupies ~17% (measured: bars span y 1000-1140 of a 326-1140 pane).
   At our geometry, full saturation is ~3× TV's ink and reads *louder*, which is the opposite of the
   goal. Hue is matched exactly; alpha is the compensator.
2. **`COL.faint` (MA-200) drops from `rgba(214,218,227,0.5)` to `rgba(177,181,190,0.38)`.** In the
   live screenshot the 200-MA is the brightest single line on the chart — brighter than the candles.
   TV's only MA is a thin `#2962FF`-family blue.
3. **MACD-RSI `#00bcd4` / `#d4ac0d` are left alone.** TV's own oscillator pills measure cyan/yellow
   in the same family (`1.17` cyan, `0.6012` yellow); the loudness was the name chips (D5), not the
   hues. Changing them would be churn without a measurement behind it.

---

# D7 — Axis text + gridlines (**JS+CSS, covered by D6**, risk: low)

Ours and TV render the **same 23-device-px axis ink** — the difference is purely colour
(`#717A8E` → `#B1B5BE`, +54% luminance) and grid alpha (`.04` → `.055`). Both land via D6a/D6b.

**Explicitly out of scope, with reason:** TV bolds the "round number" price-scale labels (measured
`121.50` bold vs `121.70` regular — **same `#B1B5BE` hex**, only the stroke weight differs; the
master spec's "near-`#FAFAFA`" claim is wrong and must not be carried over). lightweight-charts
exposes no per-label font-weight hook, so this is a renderer-level gap. Log it in the parity ledger;
do **not** invent a second, brighter gray token to fake it — that reproduces a bug, not the design.

---

# D8 — Bottom range row: **hide** (**CSS**, risk: low)

**Decision: hide `.chart-frame-bar` from the flow and keep only the chart-settings gear (+ ETH chip)
as a floating bottom-right cluster** — TV's Chart tab has no range selector, no clock and no session
chip at all (the `1D 5D 1M…` row exists *only* on symbol-detail), and TV *does* put a settings
hexagon at exactly the bottom-right of the time axis, which is where our gear already lives.

| element | ours | action |
|---|---|---|
| `.cfb-range` ×9 (`1D…All`) + `.cfb-cal` | 26pt row, `#717a8e` 10.5px | **hidden** — duplicates the native TF roller |
| `.cfb-clock` `01:22:33` + `.cfb-tz` `UTC-7` | 10.5px | **hidden** — TV has no clock on the Chart tab |
| `.cfb-chip-adj` (`ADJ`, permanently inert) | 18pt chip | **hidden** — it is a no-op control |
| `.cfb-chip` (`ETH`) | 18pt chip | **kept**, promoted to 20pt |
| `.cfb-gear` | 20×20 | **kept**, promoted to 26×26, `#b1b5be` — this is TV's hexagon slot |

```css
html[data-shell="app"] .chart-frame-bar{
  position:absolute; right:0; bottom:0; left:auto; z-index:7;
  height:26px; padding:0 4px 0 8px; gap:6px;
  background:transparent; border-top:0; pointer-events:none;
}
html[data-shell="app"] .cfb-left,
html[data-shell="app"] .cfb-clock,
html[data-shell="app"] .cfb-tz,
html[data-shell="app"] .cfb-chip-adj{display:none}
html[data-shell="app"] .cfb-right{gap:7px; pointer-events:auto}
html[data-shell="app"] .cfb-chip{height:20px; padding:0 7px; font:700 10px/1 var(--font-num)}
html[data-shell="app"] .cfb-gear{width:26px; height:26px; color:#b1b5be}
html[data-shell="app"] .cfb-gear svg{width:15px; height:15px}
```

`.chart-frame-bar` lives inside `.pane` (`components/ChartPane.tsx:151`), which is
`position:relative; overflow:hidden` — so `bottom:0;right:0` lands on the bottom-right of the pane,
over the right end of the time axis, exactly like TV. Going `position:absolute` removes it from the
flex column, which is where the **26pt of reclaimed chart** comes from. The gear popup
(`.cfb-gear-host` → `.qsg`) already opens upward inside `.pane`; its clipping behaviour is unchanged.

---

# D9 — Last-price axis badge: single line (**JS + CSS**, risk: low)

### Ours
A custom DOM tag (`components/ChartPanel.tsx:2579-2590`, inline styles, **no classNames**):
`NVDA` chip + a two-line `200.75` / `2d 12h` block. Measured **78 device px = 26pt tall** — the
tallest object on the price scale.

### TV
`BABA` chip + `121.64`, **51 device px = 17pt, single line**. The two-line variant appears only when
a bar is scrubbed.

### Change
Add classNames to the three inline-styled elements so CSS can reach them (the `cssText` strings are
unchanged, so web renders identically):

```ts
priceTag.className = "mm-ptag";        // line 2580
tagSym.className   = "mm-ptag-sym";    // line 2581
tagVal.className   = "mm-ptag-val";    // line 2583
tagPrice.className = "mm-ptag-px";     // line 2585
tagCd.className    = "mm-ptag-cd";     // line 2587
```

```css
/* `tagCd.style.display` is set inline by renderPriceTag → !important is required */
html[data-shell="app"] .mm-ptag-cd{display:none!important}
html[data-shell="app"] .mm-ptag-px{font:700 12px/1.25 var(--font-num)}
html[data-shell="app"] .mm-ptag-sym{font:700 11px/1 var(--font-num)}
```

**Accepted loss:** the bar-close countdown is unavailable in the shell (the CSS wins over the
`chartSettings.countdownVisible` toggle). It remains on web and desktop. Rationale: TV's Chart-tab
badge is single-line, and a 26pt badge on a 17pt-badge axis is the most conspicuous size outlier on
the whole surface.

---

# D10 — Watermark: brand bug, not ghost text (**JS**, risk: low)

Ours: `createTextWatermark` (`ChartPanel.tsx:2549-2562`, re-applied 6505-6519) — `"Mastermind
Terminal"`, `fontSize:48`, `rgba(214,218,227,0.04)`, **centered behind the candles** (visible in
`live-chart.png` around x 280-500, y 630-660). TV: a small `TV` logo bug, bottom-left of the lowest
pane, low-opacity white.

Both call sites take the same shell gate (`shellAxis()` from D5):

```ts
const wmShell = shellAxis();
createTextWatermark(pane, {
  visible: true,
  horzAlign: wmShell ? "left"   : "center",
  vertAlign: wmShell ? "bottom" : "center",
  lines: [{
    text: wmShell ? "MASTERMIND" : "Mastermind Terminal",
    color: chartSettings?.watermarkColor || (wmShell ? "rgba(214,218,227,0.13)" : "rgba(214,218,227,0.04)"),
    fontSize: wmShell ? 20 : 48,
    fontStyle: "bold",
    fontFamily: "var(--font-ui, system-ui, sans-serif)",
  }],
});
```

---

# D11 — Tray mode (`?tray=1`, symbol-preview sheet) (**CSS**, risk: medium)

### Ours (measured, `live-preview.png`)
The native sheet header already renders logo · `NVIDIA Corp` · `NVDA · NASDAQ` · `200.61 USD` ·
`+5.71 +2.93%`. Immediately below it the WebView repeats **the same identity** in `.statusline`
(`NVIDIA Corp · 3D · NASDAQ · O H L`), and the toolbar row shows
`Price chart │ D 3D W 1M ✎ │ Candles ▾` with **`Candles` clipped at the right edge** and
`+ Indicators` / `Day` scrolled entirely off-screen. That is the crowding the operator flagged.

### Target
One time control, zero duplicated identity, all three controls reachable without scrolling.

- `.chart-tabs` **stays in the flex flow** (a floating overlay would collide with the short chart) at
  **36px**, no tab, no border, no blue underline.
- `.tftray` stays (existing `.shell-app[data-tray="1"]` rule at globals.css:3097) — it *is* tray
  mode's TF control.
- Chart-type / Indicators / Day become **icon-only 32×32** pills, right-aligned.
- The whole `.statusline` text is suppressed (pure duplicate of the sheet header 30pt above); the
  `.mm` oracle chip survives because it is information the sheet header does not carry.
- The frame bar takes D8's treatment unchanged; the range row is *not* restored, because the TF
  tray already owns time in this sheet and two time controls in a half-sheet is the crowding fault.

```css
html[data-shell="app"][data-tray="1"] .chart-tabs{
  height:36px; padding:0 8px; gap:4px;
  border-bottom:0; background:transparent; overflow-x:auto;
}
html[data-shell="app"][data-tray="1"] .chart-tabs .ct{display:none}
html[data-shell="app"][data-tray="1"] .chart-tabs .tools{margin-left:auto; gap:4px}
html[data-shell="app"][data-tray="1"] .tfbtn{
  height:32px; min-height:32px; min-width:32px; padding:0 8px;
  font:700 12.5px/1 var(--font-num); color:#8b90a0; font-variant-numeric:tabular-nums;
}
html[data-shell="app"][data-tray="1"] .tfbtn.on{color:#2962ff}
html[data-shell="app"][data-tray="1"] .tfbtn-edit{min-width:30px; padding:0 6px}
/* icon-only controls (font-size:0 collapses the text node; svg is sized by attribute) */
html[data-shell="app"][data-tray="1"] .chart-tabs .tbtn{
  width:32px; height:32px; min-height:32px; padding:0; gap:0;
  font-size:0; justify-content:center;
}
html[data-shell="app"][data-tray="1"] .chart-tabs .tbtn svg{width:16px;height:16px}
/* identity is the sheet header's job in tray mode */
html[data-shell="app"][data-tray="1"] .statusline>span:first-child{display:none}
html[data-shell="app"][data-tray="1"] .statusline{padding:6px 10px 0; gap:6px}
```

**Width proof at 402pt** with the default `favTF = ["D","3D","W","1M"]`
(`TerminalShell.tsx:438`): 8 + (4 × 32) + 30 (pencil) + auto-gap + (3 × 32) + (6 × 4 gaps) + 8 =
**318pt of 402pt**. No scroll. `overflow-x:auto` is retained purely as the backstop for a user who
has favourited more than five timeframes.

---

# D12 — Housekeeping (**CSS**, risk: low)

```css
/* one chart per shell surface — the split header can never be meaningful here */
html[data-shell="app"] .pane-hd{display:none}
/* the pane separator is a desktop drag affordance; at 402pt it reads as a stray divider */
html[data-shell="app"]{--pane-sep:#232732; --pane-sep-h:#3d4250}
/* no page bounce behind the canvas */
html[data-shell="app"]{overscroll-behavior:none; background:#131722}
```

**Known gap, no action this wave:** in shell + phone there is currently **no fullscreen toggle** —
`.chart-fs-float` is JSX-gated out (`TerminalShell.tsx:2580`) and `.chart-fs-btn` is CSS-hidden at
≤860px (globals.css:1960). This is correct for TV parity (TV's expand icon lives in the native
bottom toolbar, which we already ship — visible at the far right of `live-chart.png`). Confirm the
native `⤢` is wired; if it is not, that is a native-side ticket, not a web one.

---

# Summary of files touched

| file | items | kind |
|---|---|---|
| `terminal/app/layout.tsx` | D0 | 5-line addition to `LOCALE_INIT` |
| `terminal/app/globals.css` | D1-D4, D6a, D8, D9, D11, D12 | 2 new `:root` tokens + one appended block at EOF |
| `terminal/components/ChartPanel.tsx` | D2 (paintStatus), D5 (`axTitle` ×16), D6b (`readTokens` + 3 sites), D9 (classNames), D10 (watermark) | JS |
| `terminal/lib/indicators.ts` | D6c | `COL` table |

No changes to `ChartOverlays.tsx`, `ChartFrameBar.tsx`, `ChartPane.tsx`, or `TerminalShell.tsx`'s
JSX — every layout move above is achieved by CSS on existing markup.

---

# E2E assertions to pin in `terminal/e2e/shell-mode.spec.ts`

Add a `test.describe("TV chart-surface parity (shell)")` block. Run under the **mobile** project
(390×844) plus the existing tablet/desktop projects, and add a second URL constant
`const TRAY_URL = "/terminal?symbol=NVDA&shell=app&tray=1";`.

### A. Root marker + token plumbing (guards D0/D6 — the silent-failure mode)
```ts
await expect(page.locator("html[data-shell='app']")).toHaveCount(1);
const tok = await page.evaluate(() => {
  const g = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  return { up: g("--up"), down: g("--down"), axis: g("--chart-axis-text"), grid: g("--chart-grid") };
});
expect(tok.up).toBe("#089981");
expect(tok.down).toBe("#f23645");
expect(tok.axis).toBe("#b1b5be");
expect(tok.grid).toBe("rgba(255,255,255,.055)");
// web must NOT be retouched
await page.goto("/terminal?symbol=NVDA");
expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--up").trim())).toBe("#26c281");
```

### B. Toolbar row is gone from the flow, controls survive (D1)
```ts
const tabs = page.locator(".chart-tabs");
expect(await tabs.evaluate(el => getComputedStyle(el).position)).toBe("absolute");
await expect(page.locator(".chart-tabs .ct")).toBeHidden();
await expect(page.locator(".chart-tabs .indicator-library-trigger")).toBeVisible();
await page.locator(".chart-tabs .indicator-library-trigger").click();
await expect(page.locator("#indicator-library-dialog")).toBeVisible();   // the ONLY indicator entry
// no chart height is consumed above the canvas
const wrapTop = await page.locator(".chart-wrap").first().evaluate(el => el.getBoundingClientRect().top);
expect(wrapTop).toBeLessThanOrEqual(2);
```

### C. Chart reclaims both bands (D1 + D8)
```ts
const fill = await page.evaluate(() => {
  const b = document.querySelector(".chart-body")!.getBoundingClientRect();
  return b.height / window.innerHeight;
});
expect(fill).toBeGreaterThan(0.97);       // was >0.8 before this wave
expect(await page.locator(".chart-frame-bar").evaluate(el => getComputedStyle(el).position)).toBe("absolute");
await expect(page.locator(".cfb-left")).toBeHidden();
await expect(page.locator(".cfb-clock")).toBeHidden();
await expect(page.locator(".cfb-gear")).toBeVisible();
```

### D. Header is two rows, nothing clips (D2)
```ts
const col = page.locator(".statusline > span").first();
expect(await col.evaluate(el => getComputedStyle(el).flexDirection)).toBe("column");
await expect(page.locator(".status-ohlc")).toBeHidden();
await expect(page.locator(".status-last")).toBeVisible();
const nameSize = await page.locator(".status-symbol-name").evaluate(el => getComputedStyle(el).fontSize);
expect(parseFloat(nameSize)).toBeCloseTo(17, 0);
// no element in the header may cross the viewport edge
const rightMost = await page.evaluate(() => Math.max(
  ...[...document.querySelectorAll(".statusline *")].map(e => e.getBoundingClientRect().right)));
expect(rightMost).toBeLessThanOrEqual(window.innerWidth);
```

### E. Legend chip + rows (D3 + D4)
```ts
const chip = page.locator(".lg-collapse");
const cs = await chip.evaluate(el => { const s = getComputedStyle(el);
  return { bg: s.backgroundColor, bw: s.borderTopWidth, bc: s.borderTopColor, h: s.height, top: el.getBoundingClientRect().top }; });
expect(cs.bg).toBe("rgba(0, 0, 0, 0)");
expect(cs.bw).toBe("1px");
expect(cs.bc).toBe("rgb(61, 61, 61)");
expect(parseFloat(cs.h)).toBeCloseTo(26, 0);
expect(cs.top).toBeGreaterThan(50);            // clears the two-row header
await chip.click();                            // expand
const row = page.locator(".lg-row").first();
expect(await row.evaluate(el => getComputedStyle(el).backgroundColor)).toBe("rgba(0, 0, 0, 0)");  // plate killed despite inline style
expect(await page.locator(".lg-name").first().evaluate(el => getComputedStyle(el).color)).toBe("rgb(177, 181, 190)");
```

### F. Axis chips carry no series-name pill (D5)
```ts
// LWC has no DOM for axis labels — assert at the option layer instead.
const titles = await page.evaluate(() => (window as any).__mmChartSeriesTitles?.() ?? null);
// If no debug hook exists, assert the source instead in a unit test:
//   expect(ChartPanelSource).not.toMatch(/lastValueVisible: true, title: "(?!\s*")/)
// Preferred: add a dev-only hook in ChartPanel that returns every series' options().title.
expect(titles?.every((t: string) => t === "")).toBe(true);
```
> Builder note: add the `__mmChartSeriesTitles` hook behind `process.env.NODE_ENV !== "production"`
> in `ChartPanel`, returning `panesMeta.current.flatMap(m => …series.options().title)`. Without it
> this assertion cannot be written against a canvas renderer, and D5 would ship untested.

### G. Price badge is single-line (D9)
```ts
await expect(page.locator(".mm-ptag-cd")).toBeHidden();
const tagH = await page.locator(".mm-ptag").evaluate(el => el.getBoundingClientRect().height);
expect(tagH).toBeLessThanOrEqual(20);          // TV measures 17pt
```

### H. Tray mode: no crowding, no duplicate identity (D11)
```ts
await page.goto(TRAY_URL);
await expect(page.locator(".chart-tabs .tftray")).toBeVisible();
await expect(page.locator(".statusline > span").first()).toBeHidden();
// every toolbar control is inside the viewport — nothing clipped, no scroll needed
const overflowPx = await page.locator(".chart-tabs").evaluate(el => el.scrollWidth - el.clientWidth);
expect(overflowPx).toBeLessThanOrEqual(0);
for (const sel of [".chart-tabs .indicator-library-trigger", ".chart-tabs .tbtn.dtm"]) {
  const r = await page.locator(sel).evaluate(el => el.getBoundingClientRect().right);
  expect(r).toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth));
}
```

### I. Web-parity guard (the scope law)
```ts
// Every rule above must be inert without ?shell=app.
await page.goto("/terminal?symbol=NVDA");
expect(await page.locator(".chart-tabs").evaluate(el => getComputedStyle(el).position)).not.toBe("absolute");
await expect(page.locator(".chart-tabs .ct")).toBeVisible();
await expect(page.locator(".cfb-left")).toBeVisible();
await expect(page.locator(".status-last")).toBeHidden();
expect(await page.locator(".lg-collapse").evaluate(el => getComputedStyle(el).borderTopWidth)).toBe("1px");
expect(await page.locator(".lg-collapse").evaluate(el => getComputedStyle(el).borderTopColor)).toBe("rgba(0, 0, 0, 0)");
```

### J. No regressions to the existing shell contract
The current `shell-mode.spec.ts` assertions must all still pass, with **one intentional change**:
`chartFill` moves from `> 0.8` to `> 0.97`. Update that literal in the same PR and note why.
