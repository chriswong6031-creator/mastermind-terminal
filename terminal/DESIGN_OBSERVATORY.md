# Observatory Design System

Layer on top of the locked Mastermind Terminal v5 design system (`app/globals.css`).
Everything here is `.obs`-scoped so the chart app (`/terminal`) is pixel-identical.

---

## 1. Scope and import order

```
globals.css → fin.css → observatory.css   (layout.tsx global imports)
```

All Observatory additions live in `app/observatory.css` under `.obs` scope.
Surface builders add `obs` (and optionally `obs-ambient`) to their page root.

---

## 2. Directional color law (MANDATORY)

**Never hardcode bull-green or bear-red.**

The app supports the East-Asian red-up convention (`html[data-updown="east"]`),
which swaps `--up` and `--down`.  Every directional color must use:

```css
/* correct */
color: var(--up);
color: var(--down);
background: color-mix(in srgb, var(--up) 12%, transparent);

/* FORBIDDEN */
color: #26c281;     /* hardcoded green */
color: #f0566b;     /* hardcoded red */
```

This applies in TSX inline styles too — use CSS variable strings, not hex.

---

## 3. Token reference (from globals.css v5)

| Token | Value | Notes |
|---|---|---|
| `--brand` | `#2962ff` | Primary blue (NOT the mockup's `#5B6CFF`) |
| `--brand-2` | `#4d82ff` | Lighter brand for text on dark |
| `--up` | `#26c281` west / `#f0566b` east | Bullish — ALWAYS use token |
| `--down` | `#f0566b` west / `#26c281` east | Bearish — ALWAYS use token |
| `--signal` | `#e8b339` | Amber accent (non-directional) |
| `--warn` | `#e8a33d` | Warning amber |
| `--text` | `#d6dae3` | Primary text |
| `--text-2` | `#868d9c` | Secondary text |
| `--muted` | `#5a616f` | Tertiary / labels |
| `--panel` | `#0d0f13` | Panel background (used for ring inner disc) |
| `--font-ui` | Inter family | UI text |
| `--font-num` | Inter family | Numerals — **always** pair with `tabular-nums` (Inter's default figures are proportional, and the `font:` shorthand resets `font-variant-numeric`) |
| `--font-code` | JetBrains Mono | Code/character-cell surfaces only — Pine editor, gutters, console, source dumps. Never numerals |

---

## 4. Primitives — class / component API

### 4.1 `.obs-ambient`
Place on the page surface root. Adds two fixed radial gradients (brand top-left,
up top-right) as a `::before` pseudo-element. Children get `position:relative; z-index:1`.

```tsx
<div className="app2 obs obs-ambient">…</div>
```

### 4.2 `.obs-card`
Glass panel.  Use for any card surface.

```tsx
<div className="obs-card">
  <div className="obs-card-hd">
    <span className="obs-lbl">Session</span>
    <span className="obs-lbl" style={{ color: "var(--muted)" }}>nightly + live</span>
  </div>
  <div className="obs-card-hr" />
  …content…
</div>
```

States: `.obs-card:hover` → border brightens. `.obs-card.sel` → brand tint + shadow.

### 4.3 `.obs-lbl`
Micro-label.  10.5px, 600 weight, 0.1em letterspacing, uppercase, `var(--muted)`.
Always place above its value; pair values with `.num` for tabular figures.

```tsx
<div>
  <span className="obs-lbl">Premium</span>
  <b className="num" style={{ fontSize: 17 }}>$2.94B</b>
</div>
```

### 4.4 `.obs-chip` / `.obs-chip.on`
Filter chip.  Inactive = ghost border.  Active = brand fill + inset ring.

```tsx
<button className={`obs-chip${active ? " on" : ""}`} onClick={toggle}>
  Score 70+
</button>
```

### 4.5 `.obs-pillnav` + `.obs-pillnav-tab` + `.obs-pillnav-tab.on`
Tab strip with a rounded container and brand-tinted active fill.

```tsx
<nav className="obs-pillnav">
  {TABS.map(t => (
    <button
      key={t.key}
      className={`obs-pillnav-tab${active === t.key ? " on" : ""}`}
      onClick={() => setActive(t.key)}
    >
      {t.label}
    </button>
  ))}
</nav>
```

### 4.6 `.obs-note`
Amber honesty panel for doctrine microcopy and display-only disclaimers.

```tsx
<div className="obs-note">
  Lean is tick-rule derived — magnitude is the reliable read.
  Display-only; forward ledger accruing.
</div>
```

### 4.7 `.obs-live-dot`
Green pulsing dot for "live" status.  Color = `var(--up)` (East-Asian flip aware).

```tsx
<span className="obs-live-dot" />
```

### 4.7b `.obs-tag` (v7)
The universal one-var tint chip (mirrors `.fin-tag`; macro-framework formula).
Set the base color per state — east-mode flip rides the token automatically.

```tsx
<span className="obs-tag" style={{ "--c": "var(--up)" } as React.CSSProperties}>Calls</span>
```

### 4.7c `.obs-asof` (v7)
Provenance row under a data section: source + as-of; add `<span className="dot"/>`
when the feed is live.

```tsx
<div className="obs-asof"><span className="dot" />Live tape · as of 14:32 ET</div>
```

### 4.8 `.num`
Already defined in `globals.css`.  Re-exported here as a reminder: use on every
numeral element, together with `var(--font-num)`.  Numerals are set in the UI
grotesque, so `tabular-nums` — not a fixed advance — is what holds columns in line.

---

## 5. `<RingGauge>` component

**File:** `components/ui/RingGauge.tsx`

```tsx
import { RingGauge } from "@/components/ui/RingGauge";

// Small ring in a list row
<RingGauge value={92} size="sm" />

// Medium ring in a card
<RingGauge value={84} size="md" tone="up" />

// Large inspector hero ring
<RingGauge value={91} size="lg" tone="brand" label="Score" />

// Auto tone by value (default)
<RingGauge value={71} size="sm" tone="auto" />
```

**Props:**

| Prop | Type | Default | Notes |
|---|---|---|---|
| `value` | `number` | required | 0–100; clamped + rounded |
| `size` | `"sm" \| "md" \| "lg"` | `"sm"` | 34 / 46 / 84 px outer |
| `tone` | `"brand" \| "up" \| "down" \| "muted" \| "auto"` | `"auto"` | `auto`: ≥70→brand, ≥50→up, ≥30→muted, <30→down |
| `label` | `string` | — | Optional micro-label above the ring |

**Auto-tone mapping** (value thresholds):

| Value | Tone | CSS var |
|---|---|---|
| ≥ 70 | brand | `var(--brand)` |
| 50–69 | up | `var(--up)` — East-Asian aware |
| 30–49 | muted | `var(--muted)` |
| < 30 | down | `var(--down)` — East-Asian aware |

Styles come entirely from `.obs-ring*` classes in `observatory.css`.
The conic-gradient is driven by `--pct` set as an inline CSS custom property.

---

## 6. Shell integration: OptionsHubView

The hub root has `obs obs-ambient` added:

```tsx
<div className="app2 obs obs-ambient">
```

The legacy `hub-tab-bar` + `hub-tab` underline tab row is replaced with
`obs-pillnav` + `obs-pillnav-tab` wrapped in a `<nav>` for accessibility.
Tab switching logic is unchanged.

A live-dot status indicator appears in the topbar when `tape` or `tide` tabs
are active and the feed is healthy.

---

## 7. Extension rules for surface builders

1. Add `obs-card` to every glass panel surface — never set glass styles directly.
2. Use `.obs-lbl` for ALL section headers and KV labels on Observatory surfaces.
3. Use `<RingGauge>` for every score / confidence ring — no hand-coded conic-gradients.
4. Use `.obs-chip` for filter chips; `.obs-pillnav` for tab navigation.
5. Use `.obs-note` for any "display-only / accruing" disclaimer text.
6. Run `color-mix(in srgb, var(--up) …%, transparent)` for tinted up/down backgrounds — never hex.
7. Do not put new Observatory selectors in `globals.css` — `observatory.css` only.
