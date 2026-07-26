# OEU T-E — Terminal EOD context belt

Verification artifacts for the **EOD context belt**: the Structure strip, the Dark Pool
mini-panel, the vol-regime chip, and the Prophet contract structure receipt.

Captured from a fresh `FLOW_FIXTURE=1 PORT=3214 npm run dev` run at 1440×900, DPR 2,
via CDP (`Page.captureScreenshot` with an element clip). **Dark only** — the Terminal has
no light theme (`app/layout.tsx` pins `data-theme="dark"`; there is no `[data-theme=light]`
block in `globals.css` / `observatory.css`), so light variants do not exist for this repo.

## Structure strip — Exposure desk

| | |
|---|---|
| `01-structure-strip-en.png` | The belt on NVDA: call wall / put wall / gamma flip / expected move / max pain / IV percentile / OI confirmed, each stamped with **its own source store's** session, next to the Dark Pool panel. |
| `02-gex-desk-in-context-en.png` | The same belt in situ, under `GexSummaryBar` and above the ladder + Market State pane. Shows the two belts agreeing digit-for-digit on NVDA (150 / 120 / 130) while carrying different vintages. |
| `09-structure-cell-hover-en.png` | Tier-2 hover on the Expected-move cell — what the band is, and that it is positioning context, not a forecast. |
| `13-structure-strip-zh.png` | **ZH variant** of the strip. Every label, stamp and panel line translated; no EN leaks. |

Note in `01` / `02`: **MAX PAIN reads "not published"** for NVDA. Only the `gex_state`
structure snapshot carries max pain, and the fixture has no NVDA snapshot — so the cell goes
honestly absent while the wall/flip cells fall back to the ladder payload (disclosed on
hover as "from the ladder snapshot") and wear that store's date.

## Dark Pool mini-panel

| | |
|---|---|
| `03-darkpool-distribution-en.png` | MARA — "Distribution pressure · Watch for weakness", short-marked selling **Building ▲6pp**. |
| `04-darkpool-accumulation-en.png` | BLK — "Quiet accumulation · Watch — don't chase". |
| `05-darkpool-quiet-en.png` | NVDA — covered, but inside its normal range: **"Nothing unusual"**. A real answer, not an empty panel. |
| `06-absent-darkpool-not-covered-en.png` | **Absent state.** SPY is not in the FINRA off-exchange panel; the panel says which fact that is and why. |
| `14-darkpool-distribution-zh.png` / `15-absent-darkpool-not-covered-zh.png` | ZH variants of the tagged and absent states. |

Lean labels, stances and reads are the macro darkpool page's **own published copy**, carried
verbatim in both languages; the classification thresholds are macro's constants
(`engine/darkpool_context.py` → `lib/eodContext.ts`). The disclaimer — *positioning context,
not a trade call* — ships on the panel, not in a footnote.

## Vol-regime chip

| | |
|---|---|
| `07-vol-regime-chip-en.png` | The chip in the options-hub header: macro's own verdict wording. |
| `08-vol-regime-chip-hover-en.png` | Hover — macro's one-line read plus the cadence and session it speaks for. |
| `16-vol-regime-chip-zh.png` | ZH variant. |

## Prophet contract structure receipt

| | |
|---|---|
| `10-prophet-structure-receipt-en.png` | The receipt on the BA plan: *"Liquid contract · 3.8% spread · 8.6k OI · IV 44th pctile of its range"*. |
| `11-prophet-receipt-hover-en.png` | Tier-2 hover — macro's own full sentence, verbatim, including the prior-session OI vintage. |
| `12-absent-prophet-receipt-en.png` | **Absent state.** A contract whose plan carries no receipt says so, rather than staying silent (silence reads as "fine to trade"). |
| `17-prophet-structure-receipt-zh.png` | ZH variant. |
