# Gamma-flip defect — root-cause analysis and fix spec

**Date:** 2026-08-01
**Scope:** `options_hub/gex/{ROOT}.json` publishes an implausible `gamma_flip`.
**Repo under analysis:** `Macro Dashboard` @ `origin/main` = `19fc7977a747b1c2bb029320e917cb8c799f9971`
(all line refs below are against that tree; read via `git show origin/main:<path>`).
**Method:** read-only source review + numeric reproduction against the real per-strike
chain snapshot `data/polygon_gex/chains/2026-07-09.parquet`.

---

## 0. Verdict (one paragraph)

`engine/options_hub.py::_find_gamma_flip` does **not** compute a gamma flip. It computes the
zero-crossing of the **running partial sum of dealer gamma across the strike ladder**, with all
gammas frozen at *today's* spot, over an **unwindowed** strike range. The real gamma flip is the
**hypothetical spot price `S*` at which the whole book's net dealer gamma, re-priced at `S*`,
equals zero** — which is what `engine/gex_engine.py::_gamma_flip` computes via a ±25% spot-grid
re-evaluation, and which is what reaches `options_structure/gex_state/{ROOT}.json` through
`gex_model.build_model`. The two are different mathematical objects; agreement between them would
be a coincidence. The hypothesis in the brief — *"nearest zero-crossing of the CUMULATIVE
net-GEX-by-strike series"* — is **CONFIRMED verbatim**, including the `min(|c − spot|)` tiebreak.
All five reported symptoms (SPY, QQQ, SPX, NVDA, IWM-null) are the **same single bug** presenting
in three regimes determined by the sign of total net GEX and the depth of the strike ladder.

---

## 1. `engine/options_hub.py` — the defective path

### 1.1 The call site — `compute_gex`, line 537

`compute_gex` is defined at **line 406**. By the time it reaches the flip it has already built a
fully-prepared per-contract frame `g`:

| built at | column | meaning |
|---|---|---|
| L470 | `g["K"]` | strike, float |
| L469 | `g["is_call"]` | `right.upper() == "C"` |
| L473-475 | `g["T"]` | years to expiry, `clip(lower=0)` |
| L476-477 | `g["iv"]` | `implied_vol` as a **decimal fraction** (confirmed: L392 multiplies by 100 for display; L433 `_MIN_IV = 0.005`) |
| L459/L464 | `g["oi_prev"]` | OI[t-1], merged and filtered to `> 0` |
| L501 | `g["_gamma"]` | feed gamma, BS-filled where absent (L481-500) |
| L508 | `g["_net_gex"]` | `sign * _gamma * oi_prev * MULT * spot² * PM` |

`MULT = 100.0`, `PM = 0.01` (L50-51). Then:

```python
536	    # ── gamma flip (nearest zero-crossing of cumulative net_gex across strikes) ──
537	    gamma_flip = _find_gamma_flip(g, spot)
```

and it is emitted unmodified at **L616**, `"gamma_flip": _f(gamma_flip)`.

Note what is **already true at L537**: every input `gex_engine._gamma_flip` needs — `K`, `T`, `iv`,
`oi`, `is_call` — is present on `g`. There is no data gap. This is purely a wrong-estimator bug.

### 1.2 The defective function — lines 647-672, verbatim

```python
647	def _find_gamma_flip(g: pd.DataFrame, spot: float) -> float | None:
648	    """Gamma flip = nearest zero-crossing of cumulative net_gex sorted by strike.
649	
650	    Returns None if no crossing found (always on one side of gamma regime boundary).
651	    Mirrors gex_engine._gamma_flip but uses pre-computed per-row _net_gex.
652	    """
653	    by_k = (g.groupby("K")["_net_gex"]
654	             .sum()
655	             .sort_index()
656	             .reset_index())
657	    if len(by_k) < 4:
658	        return None
659	
660	    # cumulative sum from lowest strike upward
661	    by_k["cum"] = by_k["_net_gex"].cumsum()
662	    crossings = []
663	    arr = by_k["cum"].to_numpy(float)
664	    ks  = by_k["K"].to_numpy(float)
665	    for i in range(len(arr) - 1):
666	        if arr[i] == 0.0 or (arr[i] < 0) != (arr[i + 1] < 0):
667	            y0, y1, x0, x1 = arr[i], arr[i + 1], ks[i], ks[i + 1]
668	            cross = x0 - y0 * (x1 - x0) / (y1 - y0) if (y1 - y0) != 0 else x0
669	            crossings.append(float(cross))
670	    if not crossings:
671	        return None
672	    return min(crossings, key=lambda c: abs(c - spot))
```

**The docstring's claim on L651 — "Mirrors gex_engine._gamma_flip" — is factually false.** It is
the load-bearing error: it told every subsequent reader the two were equivalent, so nobody checked.

### 1.3 Step-by-step: what it actually computes

1. **L653-656** — collapse per-contract `_net_gex` to one value per strike, ascending by strike.
   Each value is that strike's dealer gamma **evaluated at the current spot**.
2. **L661** — `cumsum()` from the *lowest* strike upward. Define
   `C(K) = Σ_{k ≤ K} netGEX(k)` — the running total of the book's gamma contribution from the
   bottom of the ladder up to `K`.
3. **L665-669** — record every strike interval where `C` changes sign, linearly interpolating.
4. **L672** — return whichever crossing is nearest spot.

`C(K)` is a **statement about how gamma is distributed across the strike ladder**, not about price.
Its zero-crossing answers *"at which strike does the running total of dealer gamma flip sign?"* —
a question with no financial meaning. Three structural consequences:

- **Its terminal value is fixed.** `C(K_max) = net_gex_bn × 1e9` — the book's total. So the
  existence and location of any crossing is dictated by the **sign of total net GEX**, not by price.
- **It is monotone-dominated by the put mass.** Deep-OTM puts sit at low strikes with `sign = −1`.
  `C` therefore descends through the put region and only recovers if calls out-mass them in total.
- **It is unwindowed.** Unlike `gex_engine._window` (±25% strikes, ≤365 DTE), `_find_gamma_flip`
  ingests the **entire** ladder. For SPY the ThetaData greeks book runs hundreds of dollars below
  spot; in that deep tail both deep-OTM puts and deep-ITM calls carry gamma ≈ 0, so `C` **meanders
  microscopically around zero**, manufacturing a cluster of numerically-real but economically-void
  crossings — the "275" family.

### 1.4 Why a put-heavy book drives the result far from spot

Walk `C(K)` left-to-right for a put-heavy index book:

| ladder region | contributions | `C(K)` behaviour |
|---|---|---|
| deep tail (K ≪ spot) | γ ≈ 0, mixed signs | meanders around 0 → **spurious crossings** |
| below spot | large negative (put γ) | descends steeply, decisively negative |
| around/above spot | positive (call γ) | climbs back |
| ladder top | — | ends at `net_gex_bn × 1e9` |

Put-heavy ⇒ `net_gex_bn < 0` ⇒ **`C` never returns to zero after the put mass**. Therefore the
only surviving crossings are the deep-tail noise ones, and `min(|c − spot|)` picks the **highest**
of them — still 60%+ below spot. That is SPY 275.0 and QQQ 249.8 exactly.

Corroborating detail: SPY 275.0 / 741.69 = **0.371**; QQQ 249.8 / 683.55 = **0.365**. Two different
books landing on near-identical *fractions* of spot is the fingerprint of a scale-free ladder
property (where the deep tail ends), not of any price-relevant level.

### 1.5 Numeric reproduction (real chain, both algorithms side by side)

Ran both estimators over `data/polygon_gex/chains/2026-07-09.parquet` (columns
`K, T, is_call, oi, iv, gamma, spot`), with the same BS gamma fallback `options_hub` uses:

```
ROOT     spot    net_gex_bn   HUB flip    off%  |  ENGINE flip   off%  |  Kmin
SPY    745.40      -3.273        null     null  |     748.56    +0.4   |   525
QQQ    711.44      -2.510        null     null  |     723.78    +1.7   |   500
IWM    293.48      -2.812        null     null  |     303.37    +3.4   |   210
NVDA   204.12      +1.103      199.52     -2.3  |     188.53    -7.6   |   144
```

Two things are proven here:

- **Negative net GEX ⇒ the cumulative series never recrosses zero.** SPY/QQQ/IWM return `null`
  on this ladder because Polygon's `Kmin` (525 for SPY, −30% from spot) is **not deep enough** to
  contain the noise tail. This is the IWM-null mechanism, reproduced.
- **Positive net GEX ⇒ exactly one crossing**, landing where the cumulative integral turns
  positive (199.52) rather than at the true zero-gamma spot (188.53). This is the NVDA/SPX
  mechanism, reproduced.

To confirm the SPY-275 case specifically, the SPY ladder was extended down to K=150 with a
realistic deep-OTM-put / deep-ITM-call tail (the ThetaData greeks book `options_hub` reads is far
deeper than Polygon's):

```
SPY spot=745.40  net_gex_bn=-3.276  ladder K=[150..965]
  HUB    (cumsum-by-strike, no window) flip = 379.96  -> -49.0% from spot
  ENGINE (±25% spot grid re-eval)      flip = 748.56  ->  +0.4% from spot
  crossings found by HUB (8): [150.1, 167.7, 260.3, 266.2, 330.2, 340.8, 369.5, 380.0]
```

**Eight crossings, every one of them in the deep tail, none within 49% of spot.** The published
SPY 275.0 sits squarely inside that cluster. Mechanism confirmed end to end.

---

## 2. `engine/gex_engine.py` — the correct method

### 2.1 `_gamma_flip`, lines 43-70, verbatim

```python
43	def _gamma_flip(c: pd.DataFrame, S: float, cfg: dict):
44	    """Zero-gamma spot via a ±25% spot grid reevaluation (clone of
45	    collectors/deribit._gamma_flip, with the equity multiplier + r/q). ABOVE flip =
46	    net long gamma (dealers dampen / pin); BELOW = net short (dealers amplify).
47	    Returns (flip, signed dist-to-flip %, regime)."""
48	    g = c.dropna(subset=["K", "T", "iv"])
49	    if len(g) < 20 or not (S > 0):
50	        return None, None, None
51	    K = g["K"].to_numpy(float); T = g["T"].to_numpy(float)
52	    sig = g["iv"].to_numpy(float); oi = g["oi"].to_numpy(float)
53	    sgn = np.where(g["is_call"].to_numpy(bool), 1.0, -1.0)
54	    r, q, mult, pm = cfg["r"], cfg["q"], cfg["contract_multiplier"], cfg["pct_move"]
55	    sqrtT = np.sqrt(T)
56	    grid = S * np.linspace(0.75, 1.25, 101)
57	    net = np.empty(len(grid))
58	    for i, Sx in enumerate(grid):
59	        d1 = (np.log(Sx / K) + (r - q + 0.5 * sig * sig) * T) / (sig * sqrtT)
60	        gamma = np.exp(-q * T) * np.exp(-0.5 * d1 * d1) / SQRT2PI / (Sx * sig * sqrtT)
61	        net[i] = float(np.sum(sgn * gamma * oi * mult * Sx * Sx * pm))
62	    flips = []
63	    for i in range(len(grid) - 1):
64	        if net[i] == 0.0 or (net[i] < 0) != (net[i + 1] < 0):
65	            x0, x1, y0, y1 = grid[i], grid[i + 1], net[i], net[i + 1]
66	            flips.append(x0 - y0 * (x1 - x0) / (y1 - y0) if y1 != y0 else x0)
67	    if not flips:
68	        return None, None, ("long" if net[len(grid) // 2] >= 0 else "short")
69	    flip = min(flips, key=lambda f: abs(f - S))
70	    return float(flip), round(100.0 * (S - flip) / S, 2), ("long" if S >= flip else "short")
```

**The decisive difference is L58-61.** For each of 101 hypothetical spots `Sx` spanning
`[0.75S, 1.25S]`, it **re-prices Black-Scholes gamma for every contract at `Sx`** and sums the
*whole* book. `net[i]` is the book's total gamma if spot were `Sx`. Its zero-crossing is, by
construction, the price at which dealers flip from net-long to net-short gamma. The `options_hub`
version never re-prices anything — it uses gammas frozen at today's spot and merely partitions
them by strike.

Also note **L60 recomputes gamma from `(K, T, iv, Sx)` and ignores any feed `gamma` column
entirely.** This is required (feed gamma is only valid at today's spot) and has a consequence for
the fix — see §5.4.

### 2.2 Inputs / outputs / caller contract

**Inputs**
- `c: pd.DataFrame` with columns `K` (strike), `T` (years to expiry), `iv` (**decimal** vol,
  strictly > 0), `oi` (open interest), `is_call` (bool). `expiry` optional.
- `S: float` — current spot, must be `> 0`.
- `cfg: dict` — needs `r`, `q`, `contract_multiplier`, `pct_move`. `DEFAULTS` (L28-32) supply
  `r=0.0, q=0.0, contract_multiplier=100.0, pct_move=0.01`.

**Outputs** — the 3-tuple `(flip, dist_to_flip_pct, regime)`:
- `flip: float | None` — the zero-gamma spot level.
- `dist_to_flip_pct: float | None` — **signed**, `100·(S − flip)/S`, 2dp. Positive = spot above flip.
- `regime: str | None` — `"long"` / `"short"`. **Non-null even when `flip` is None** (L68), which
  is how a no-crossing book still reports a regime.

**Caller contract (mandatory).** `_gamma_flip` performs **no windowing of its own** — it trusts
the caller. `gex_engine.compute_gex` windows first at **L145** via `_window` (L35-40):

```python
35	def _window(chain: pd.DataFrame, S: float, cfg: dict) -> pd.DataFrame:
36	    w = cfg["strike_window_pct"]
37	    maxT = cfg["max_expiry_days"] / 365.0
38	    return chain[(chain["T"] > 0) & (chain["T"] <= maxT)
39	                 & chain["K"].between(S * (1 - w), S * (1 + w))
40	                 & (chain["iv"] > 0) & (chain["oi"] > 0)].copy()
```

then calls `flip, dist, regime = _gamma_flip(c, spot, cf)` at **L165**. A caller that skips
`_window` will pass rows with `iv <= 0` or `T <= 0` and get `NaN`/`inf` in `d1` at L59.
**`_window` is part of the contract, not an optimisation.**

Additional hard gate: **L49, `len(g) < 20` returns `(None, None, None)`** — the windowed frame must
retain ≥20 rows with non-null `K`/`T`/`iv`.

---

## 3. `engine/gex_state.py` — why its value is sane

`gex_state` **does not compute a flip at all.** It reads one that was computed upstream by the
correct method. `compute_gex_state` (L538) does exactly this at **L591-594**:

```python
591	    # ── gamma flip ────────────────────────────────────────────────────────────
592	    gamma_flip = summary.get("gamma_flip")
593	    dist_to_flip_pct = summary.get("dist_to_flip_pct")  # signed % (spot-flip)/spot*100
594	    flip_known = gamma_flip is not None and gamma_flip > 0
```

and emits it verbatim at **L656-657**:

```python
656	        "gamma_flip": float(gamma_flip) if gamma_flip is not None else None,
657	        "dist_to_flip_pct": float(dist_to_flip_pct) if dist_to_flip_pct is not None else None,
```

The `summary` it reads is `gex_model.build_model`'s output. `gex_model` (L35) imports
`from engine.gex_engine import compute_gex`, calls it at **L732-736**, and copies the flip through
at **L747**:

```python
747	        "gamma_flip": _f(base.get("gamma_flip")), "dist_to_flip_pct": _f(base.get("dist_to_flip_pct")),
```

**So the provenance chain is:**

```
gex_state.gamma_flip
  ← gex_model.build_model summary L747
    ← gex_engine.compute_gex L165
      ← gex_engine._gamma_flip  (±25% SPOT-GRID RE-EVALUATION)   ✅ correct

options_hub gex/{ROOT}.json gamma_flip
  ← options_hub.compute_gex L537
    ← options_hub._find_gamma_flip  (CUMSUM ACROSS STRIKES)      ❌ wrong object
```

Two builders, two estimators, one shared field name. That is the whole defect.

**Independent confirmation from the stored record.** `data/polygon_gex/summary_{ROOT}.parquet` is
written by the `gex_engine`/`gex_model` path. Its `gamma_flip` column is sane on every name:

| root | date | spot | gamma_flip | distance |
|---|---|---|---|---|
| SPY | 2026-07-09 | 745.40 | 747.83 | +0.33% |
| QQQ | 2026-07-09 | 711.44 | 722.50 | +1.55% |
| IWM | 2026-07-09 | 293.48 | 302.95 | +3.23% |

Every value within a few percent of spot, across the whole date range — never the 60% excursions
the hub payload publishes.

### 3.1 The same payload is internally self-contradictory

This is worth calling out as a distinct, user-visible symptom. `options_hub/gex/{ROOT}.json`
carries a `history[]` array attached by `_attach_gex_history` (nightly L409-415), sourced from
`load_gex_history_v2` (`options_hub.py` L1255-1297) — which reads
`data/polygon_gex/summary_{ROOT}.parquet`, i.e. **the correct grid-method values** (L1292:
`"gamma_flip": _f(_row_val(row, "gamma_flip"))`).

So a single JSON object today contains:
- top-level `gamma_flip` = 275.0 (cumsum method, wrong), and
- `history[-1].gamma_flip` ≈ 748 (grid method, right).

The terminal renders both — `GexSummaryBar.tsx:198` shows the top-level, `GexHistory.tsx:353-356`
shows the history row — so the desk can display two contradictory flips simultaneously. **Fixing
`_find_gamma_flip` also resolves this inconsistency**, because both will then be the same estimator.

### 3.2 A downstream workaround already exists (evidence the defect was felt, not diagnosed)

`terminal/components/gexdesk/GexDeskView.tsx:336-342` in the charting-app repo:

```ts
336	  // Guard a nonsense gamma_flip: the builder's zero-crossing detection sometimes
337	  // returns a strike far from spot (e.g. 285 vs spot 748). If the flip is outside
338	  // ±20% of spot it isn't a real dealer flip — drop it rather than draw a bogus line.
339	  const rawFlip = activePayload?.gamma_flip ?? null;
340	  const gammaFlip = rawFlip != null && spot != null && spot > 0 && Math.abs(rawFlip - spot) / spot <= 0.20
341	    ? rawFlip
342	    : null;
```

Someone already hit this ("285 vs spot 748") and patched the **symptom** at the render layer. Note
the consequence: on the Gex Desk, SPY/QQQ currently render **no flip line at all** (silently
suppressed), while SPX (16.7% away) and NVDA (12.6% away) **pass the ±20% filter and render the
wrong level as if it were real** — the most dangerous of the three outcomes. This client guard
should be removed *after* the server fix (§5.6), not before.

---

## 4. IWM-null and SPX-subtle — same bug or different?

**Same bug. One root cause, three presentations**, selected by (a) the sign of total net GEX and
(b) whether the ladder is deep enough to contain a noise tail. Because `C(K_max) = net_gex_bn·1e9`
is pinned, the sign of the total *fully determines* the topology of the crossing set.

| case | sign of net GEX | deep tail present? | `C(K)` behaviour | result | example |
|---|---|---|---|---|---|
| **A — grossly wrong** | negative | yes | never recrosses after put mass; only tail-noise crossings survive | flip lands in the tail, 60%+ from spot | **SPY 275.0** (spot 741.69), **QQQ 249.8** (spot 683.55) |
| **B — null** | negative | no | `C` goes negative on the first strike and never returns → `crossings == []` → **L670-671 returns None** | `null` | **IWM** |
| **C — subtly wrong** | positive | irrelevant | `C` dips through the put mass then recovers; crosses **once**, wherever the integral turns positive | flip drifts to a plausible-looking but wrong level | **SPX 8676.93** (spot 7437.63), **NVDA 219.55** (spot 195.04) |

Both A and B were reproduced directly (§1.5): the same SPY book returns `null` on a shallow ladder
(Kmin=525) and 379.96 on a deep one (Kmin=150) — **the only variable changed was ladder depth.**
That is decisive proof that null and grossly-wrong are the same defect, not two.

**On SPX specifically.** Case C explains why it is *subtly* rather than grossly wrong, and why it
lands **above both walls**: `call_wall` is the heaviest positive-gamma strike above spot
(`compute_gex` L551), i.e. where the *density* peaks; the cumulative integral only turns positive
some distance **past** that density peak. A flip above the call wall is thus the expected
signature of case C — and is itself a cheap invariant to assert in tests (§5.7).

**Case C is the most dangerous.** Case B publishes `null` (honest absence). Case A is so absurd the
client guard catches it. Case C produces a number that survives every guard and reads as credible —
16.7% and 12.6% are exactly the range a real flip could plausibly occupy in a stressed book.

---

## 5. FIX SPEC

### 5.1 Function to call

`engine.gex_engine._gamma_flip(c, S, cfg) -> (flip, dist_to_flip_pct, regime)`.

Do **not** write a fourth implementation. There are already three
(`gex_engine._gamma_flip`, `gex_model.gamma_profile` L113-143, `options_hub._find_gamma_flip`) plus
a fallback (`levels_engine._flip_from_rows` L137-167) — and that proliferation is what allowed a
wrong one to ship undetected. Route to the canonical one and delete the duplicate.

Recommendation: promote `_gamma_flip` to a public `gamma_flip(...)` in `gex_engine` (keeping
`_gamma_flip` as an alias for existing internal callers) so `options_hub` is not importing a
private symbol across module boundaries.

### 5.2 Exact call site to change

`engine/options_hub.py` **L536-537**. Replace:

```python
    # ── gamma flip (nearest zero-crossing of cumulative net_gex across strikes) ──
    gamma_flip = _find_gamma_flip(g, spot)
```

with a call that (1) projects `g` to the engine's column contract, (2) applies the
`gex_engine._window` filter, and (3) delegates. Sketch:

```python
    # ── gamma flip: zero-gamma SPOT via ±25% grid re-evaluation ──────────────
    # Delegated to engine.gex_engine so options_hub and gex_state publish the
    # SAME estimator. The previous local cumsum-across-strikes helper computed a
    # different object entirely (see docs/audits/2026-08-01-.../gamma-flip-defect-rca.md).
    from engine.gex_engine import DEFAULTS as _GEX_DEFAULTS, _gamma_flip as _engine_flip
    from engine.gex_engine import _window as _engine_window

    _chain = pd.DataFrame({
        "K":       g["K"].astype(float),
        "T":       g["T"].astype(float),
        "iv":      g["iv"].astype(float),
        "oi":      g["oi_prev"].astype(float),
        "is_call": g["is_call"].astype(bool),
    })
    _cfg = {**_GEX_DEFAULTS, "contract_multiplier": MULT, "pct_move": PM}
    gamma_flip, dist_to_flip_pct, gamma_regime = _engine_flip(
        _engine_window(_chain, spot, _cfg), spot, _cfg
    )
```

Then delete `_find_gamma_flip` (L647-672) and its import in `tests/test_options_hub.py:39`.

### 5.3 Required vs available columns

| engine needs | available on `g` at L537? | source |
|---|---|---|
| `K` | ✅ | L470 |
| `T` (years) | ✅ | L473-475, already `clip(lower=0)` |
| `iv` (**decimal**) | ✅ | L476-477 — already decimal, no conversion |
| `oi` | ✅ as `oi_prev` | L459; already `> 0`-filtered at L464 |
| `is_call` (bool) | ✅ | L469 |

**No new data is needed and no new I/O is introduced.** `_window` is a pure row filter.

### 5.4 Unit / scale conversions

- **`iv` — none required.** Already a decimal fraction on both sides. *Verify this per-root before
  merge*: a percent-scaled `iv` (e.g. `45.0` for 45%) would drive `d1 → 0` and `gamma → 0` at
  L59-60, silently producing a garbage flip rather than an error. Cheap assertion:
  `0 < iv.median() < 3.0`.
- **`MULT`/`PM` — none required.** `options_hub` `MULT=100.0, PM=0.01` (L50-51) are identical to
  `gex_engine.DEFAULTS` (L29). Pass them explicitly anyway so a future divergence is caught.
- **`r`/`q`** — `gex_engine.DEFAULTS` uses `r=0.0, q=0.0`; `options_hub`'s BS fallback (L492) calls
  `_bs_greeks(spot, K, T, iv, call)` with defaulted rates, so this is already consistent. Keep 0/0
  to match `gex_state` exactly; changing them would desync the two builders again.
- **Column rename only:** `oi_prev → oi`. Zero numeric transformation.
- **⚠️ Semantic change worth flagging:** the grid method **ignores the feed `gamma` column** (§2.1)
  and recomputes BS gamma from `(K, T, iv, Sx)`. So `implied_vol` becomes load-bearing for the flip
  where previously feed gamma was. Roots whose greeks tier is sparse on `implied_vol` will lose rows
  to `_window`'s `iv > 0` filter and may fall under the `len < 20` gate (L49) → flip becomes `None`.
  **This is a correctness improvement** (an honest null beats a fabricated level), but it will move
  some roots from "wrong number" to `null`. Expect and monitor it; do not treat it as a regression.

### 5.5 Additive payload upgrade (recommended, low risk)

`_gamma_flip` returns `dist_to_flip_pct` and `regime` for free. The
`options_hub.gex/v1` payload (L610-626) currently carries **neither**. Emit both:

```python
        "gamma_flip": _f(gamma_flip),
        "dist_to_flip_pct": _f(dist_to_flip_pct, 4),   # NEW — signed, + = spot above flip
        "gamma_regime": gamma_regime,                   # NEW — "long" / "short"
```

Purely additive; no consumer reads a field that does not yet exist. Two payoffs:

1. It removes client-side re-derivation. `MarketStateCard.tsx:441-444` currently falls back to
   `((spotRef - flipLevel) / spotRef) * 100` when `dist_to_flip_pct` is absent — publishing it makes
   the terminal's number identical to the engine's by construction.
2. `regime` is non-null even when `flip` is None (L68), so IWM-style nulls still get a regime read
   instead of a blank cell.

Sign convention is **`100·(spot − flip)/spot`, positive = spot above flip** — matches
`gex_state.py:593`'s comment and `MarketStateCard.tsx:72`. Do not invert it.

### 5.6 What could break — full blast radius

| surface | risk | assessment |
|---|---|---|
| **`history[]` back-compat** | **None.** `history[]` comes from `summary_{ROOT}.parquet` via `load_gex_history_v2` (L1255-1297) — an independent store already on the grid method. Shape, field names, ordering all untouched. | ✅ **Improves.** Removes the §3.1 self-contradiction: top-level and `history[-1]` will finally agree. |
| **`gex_state` reconciliation** | Both builders converge on one estimator. Residual differences remain: `gex_state` runs off the **Cboe** chain, `options_hub` off **ThetaData greeks ⋈ OI[t-1]**, so different vintages/universes → small legitimate deltas. | ✅ **Improves.** Do **not** assert exact equality in tests — assert both land within a few % of their own spot. |
| **`dist_to_flip_pct` (terminal)** | `StockAnalysis.tsx:792`, `MarketStateCard.tsx:441` read it. Neither reads it from the options_hub gex payload today (the field does not exist there). | ✅ Safe. §5.5 is strictly additive. |
| **`GexDeskView.tsx:336-342` ±20% guard** | Once the server is correct the guard is dead code — but it is also **harmless** and a genuine backstop. | ⚠️ **Leave in place for the first deploy.** Remove only after ≥5 sessions of verified-sane output. Removing it in the same change forfeits the safety net exactly when it is most needed. |
| **`levels_engine`** | L226 prefers `payload["gamma_flip"]` and only recomputes via `_flip_from_rows` (L137-167) when absent — and that fallback **replicates the same cumsum bug**, with `min(crossings)` (L167, the *lowest* crossing, worse than the hub's nearest-to-spot). Its docstring L141 repeats the same false "mirrors" claim. | ⚠️ **Separate defect on the same root cause.** Fixing `options_hub` means `levels_engine` receives good values on the primary path, so this becomes latent rather than live. Fix in the same wave; do not let the docstring survive. |
| **`vex_engine._find_vex_flip` (L46-54)** | Identical cumsum-across-strikes construction, and L48 explicitly says *"Mirrors options_hub._find_gamma_flip's convention for VEX."* `vex_flip` (L120, L152) is therefore **broken the same way**. | ⚠️ **Sibling defect, out of scope here.** Flag it: fixing gex without vex leaves a wrong `vex_flip` shipping beside a corrected `gamma_flip`. |
| **Tests** | `tests/test_options_hub.py:39` imports `_find_gamma_flip` → **import error** if deleted. `test_gamma_flip_returns_number_or_none` (L412) is a shape test → survives. `test_no_crossing_returns_none` (L420-436) uses an all-calls book → net gamma positive at every grid point → still `None` → survives. | Update the import; both assertions hold. `tests/test_gamma_flip.py` tests `collectors.deribit._gamma_flip` — unaffected. |
| **`_gex_publish_decision`** (nightly L549-585) | Gates purely on `by_strike` non-empty. Never inspects `gamma_flip`. | ✅ No interaction. |
| **Performance** | 101 grid points × full windowed book per root. `_window` cuts to ±25% strikes / ≤365 DTE first, and it is vectorised NumPy over ~101 iterations. | ✅ Negligible; `gex_engine` already runs this for the entire board nightly. |

### 5.7 Regression guards to add with the fix

These are the assertions whose absence let this ship. Add them as tests, not just monitoring:

1. **Proximity invariant** — for any index/ETF root, `|flip − spot| / spot < 0.10`, else `flip is None`.
   Would have caught SPY (63%), QQQ (64%), SPX (16.7%), NVDA (12.6%) on day one.
2. **Wall-ordering invariant** — `put_wall ≤ flip ≤ call_wall` when all three are non-null. This is
   the case-C signature from §4 and catches the *subtle* failures the proximity check might tolerate.
3. **Cross-builder reconciliation** — for roots present in both, assert
   `options_hub.gamma_flip` and `gex_state.gamma_flip` are within ~2% of each other. Near-equality,
   never exact (different feeds/vintages — see the `gex_state` row above).
4. **IV-scale assertion** — `0 < iv.median() < 3.0` before the flip call (§5.4).
5. **Estimator-equivalence test** — one fixture chain, assert `options_hub.compute_gex`'s flip
   equals `gex_engine.compute_gex`'s flip. This is the test that makes a future re-divergence
   impossible, and is the single highest-value item on this list.

---

## 6. Archived `gex_history` snapshots — is a backfill needed?

**Yes. Every dated snapshot carries the bad top-level flip.**

`options_hub/gex_history/{ROOT}/{DATE}.json` is a **verbatim copy of the full gex payload**, not a
reduced projection. Two writers, both routed through the defective `compute_gex`:

1. **Nightly** — `build_root` (nightly L407) calls `compute_gex`, and the same object is written to
   `_gex_history_relpath(root, gex_payload)` → `f"gex_history/{root}/{asof}.json"` (L588-610).
2. **Self-heal** — `_heal_gex_history` (L756-800) explicitly re-runs the identical path at **L785**:

```python
785	            payload = compute_gex(greeks_d, oi_d, d, root)
786	            if not payload.get("by_strike"):
787	                continue
788	            if hist:
789	                payload = _attach_gex_history(payload, hist)
790	            payload = _trim_history_to(payload, d)
791	            payload["self_healed"] = True
792	            rel = f"gex_history/{root}/{d}.json"
```

Its own docstring (L761-762) confirms: *"Same compute path as the nightly that failed to run"*.
So healed snapshots are **equally wrong** — and note the self-heal runs on demand, meaning
**new bad snapshots can still be minted for past dates after the fix lands** unless the repair is
deployed alongside it.

**Scope of a repair backfill:**

- **Objects:** every `options_hub/gex_history/{ROOT}/{DATE}.json` on R2 since **2026-07-16**
  (per the brief), × all published roots. Enumerate with `_list_gex_history_dates` (L688-712),
  which already lists R2 keys under `f"{R2_PREFIX}gex_history/{root}/"`.
- **Fields to rewrite:** `gamma_flip` only (plus `dist_to_flip_pct` / `gamma_regime` if §5.5 is
  adopted). `by_strike`, `by_expiry`, `net_gex_bn`, walls, `coverage` are all **unaffected** — the
  defect is isolated to one scalar. This keeps the repair narrow and low-risk.
- **Mechanism:** `_heal_gex_history` is already the right machine. Once `compute_gex` is fixed,
  a repair pass = force-re-heal each dated key. Requires the ThetaData greeks + OI store to still
  answer for those dates; `_heal_gex_history` already skips silently where it cannot (L782-783),
  so coverage gaps degrade honestly rather than writing empties.
- **Stamping:** these are *corrections*, not gap-fills. `self_healed: true` (L791) does not
  distinguish them. Add a distinct marker — e.g. `"flip_repaired": "2026-08-01"` — so a consumer
  can tell a corrected snapshot from an originally-correct one, and so the repair is idempotent.
- **`history[]` inside each snapshot:** already sane (grid-method, from the parquet). Leave it
  alone. Post-repair, top-level and `history[]` will agree — which is itself a **verification
  signal**: a repaired snapshot whose top-level flip still diverges from `history[-1].gamma_flip`
  by more than a few percent did not repair correctly.

**Sequencing.** Fix `compute_gex` → verify a nightly produces sane flips for SPY/QQQ/SPX/NVDA/IWM →
*then* run the backfill. Backfilling first would re-mint bad values through the unfixed path.

---

## 7. Summary of defects found

| # | defect | location | severity |
|---|---|---|---|
| 1 | `gamma_flip` computed as cumsum-across-strikes instead of zero-gamma spot | `engine/options_hub.py:647-672`, called L537 | **live, user-facing** |
| 2 | Flip computed over an **unwindowed** ladder → deep-tail noise crossings | same (no `_window` equivalent) | **live**, root of the SPY/QQQ cases |
| 3 | False docstring "Mirrors gex_engine._gamma_flip" blocked detection | `engine/options_hub.py:651` | documentation, high blast radius |
| 4 | Same-payload self-contradiction: top-level vs `history[]` | `options_hub` L537 vs L1292 | live, visible on the desk |
| 5 | `levels_engine._flip_from_rows` replicates the bug (+ `min(crossings)`, worse) | `engine/levels_engine.py:137-167` | latent fallback |
| 6 | `vex_engine._find_vex_flip` replicates the bug for `vex_flip` | `engine/vex_engine.py:46-54` | **live sibling**, out of scope |
| 7 | Archived `gex_history` snapshots carry the bad flip since 2026-07-16 | R2 `options_hub/gex_history/**` | needs backfill |
| 8 | No proximity / wall-ordering / cross-builder invariant in tests | `tests/test_options_hub.py:412-436` | why it shipped |
