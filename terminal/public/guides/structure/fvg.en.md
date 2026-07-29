# Fair Value Gaps

A fair value gap is a price area that got skipped: three candles where the middle one moved so fast its range was never properly traded. Price often comes back to fill it.

## What you see

- **Tinted box extending right** — the gap. Up-coloured was left by a fast move up (a possible support shelf); down-coloured by a fast move down.
- **Grey band inside the box with a chip like "62% filled"** — how much of the gap price has already traded back through. 0% is untouched, 100% means it is done and the box disappears.
- **Dashed line across the box** — the point of control: the price where the heaviest of the three candles traded, or simply the midpoint. The natural reaction level.
- **Small triangle above or below the third candle** — a gap just formed here.
- **Triangle pointing into the box from underneath or above** — price came back and touched the point of control.
- **Dashed box labelled "iFVG"** — an inverted gap: a whole candle body closed through it, so its role flipped. A failed bullish gap becomes a ceiling.
- **Hover any chip or triangle** — size, fill percentage, age in bars and the point-of-control price.

## How to trade it

1. Take gaps only with the wider trend. A bullish gap under a market making higher highs is a pullback area, not a reversal bet.
2. Prefer fresh gaps — under about 50% filled — and ones at least half an ATR tall. Tiny gaps fill by accident.
3. Wait for price to reach the dashed line and for a candle to close back out of the gap your way.
4. Enter on that close; stop just beyond the far edge. If the gap fills completely, the idea was wrong.
5. Target the swing the fast move started from, and take part off there.
6. If "iFVG" appears on your gap, the level failed. Close the trade — that zone now works against you.

**When not to use this:** on charts crowded with overlapping boxes, typically low timeframes in choppy sessions. When everything is a gap, nothing is.

## Settings

**Detection**
- *Min Gap Size (ATR)* — ignore imbalances smaller than this multiple of recent average range.
- *Type* — show all gaps, or only bullish or only bearish ones.
- *Hide Overlapped* — skip a new gap that mostly sits inside an open gap on the same side.
- *Inversion (iFVG)* — when a full candle body closes through a gap, flip its role instead of deleting it.

**Display**
- *Show Last* — how many still-open gaps stay on the chart.
- *POC Line* — off, at the highest-volume price of the three forming candles, or at the midpoint.
- *Extend* — draw each box to the right edge, or stop it 20 bars after it formed.
- *Signals* — which triangles print: creation, retest, both, or none.

## Signals & alerts

- **fvg_created** — a new gap formed. Strength scales with gap size relative to ATR.
- **fvg_retest** — price returned to the point of control. The alert carries how much is still unfilled: 90% is a far fresher level than 20%.
- **ifvg** — a gap was closed through by a full candle body and has flipped sides.

Retests are limited to one per gap every 5 bars, so a slow grind through a zone won't spam you.
