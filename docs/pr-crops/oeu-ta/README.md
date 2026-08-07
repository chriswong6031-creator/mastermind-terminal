# OEU T-A — GEX desk verification crops

All captured against a fresh `FLOW_FIXTURE=1` dev server (`/options?tab=gex`, SPY), Chrome
at 1440×900 (DPR 2) except the two narrow shots at 375×780. Zero manual workarounds: the
only interactions are the desk's own controls.

| # | file | what it proves |
|---|---|---|
| 01 | `01-ladder-all-expirations.png` | Baseline. All-expiry aggregate from `by_strike`; bars now use `--up`/`--down` so a positive bar and its positive number share one hue; values read `$mn` correctly (`+1.35B`, `+898.8M`), not the old `B`-labelled `$mn`. |
| 02 | `02-ladder-0dte.png` | **Expiry lens is live.** 0DTE only: every ladder value recomputed from the per strike×expiry snapshot, `NET GEX` scoped to `+1.04B` and tagged `0DTE`, the level cells tagged `ALL EXP`, bar scale rebased to `±189.7M`, and the coverage line `40/46 strikes covered · 2026-07-10`. |
| 03 | `03-ladder-single-expiry-2026-07-17.png` | A single named expiration — a third, visibly different ladder (`759` leads at `+209.9M`, where 0DTE leads at `758`). |
| 04 | `04-ladder-uncovered-strikes-dash.png` | **The honest dash.** Strikes 790/795/800 sit outside the per-expiry snapshot's window → `—` with no bar. 785 is covered but has no cell for this expiry → a real `0`. Neither borrows the aggregate. |
| 05 | `05-ladder-call-put-split.png` | Net \| Call/Put toggle, drawn from the payload's real `gamma_call`/`gamma_put` columns (all-expiry gamma — the only cut the feed splits by side). Put bars dominate below the flip, calls above. |
| 06 | `06-tooltip-fixed-layer-at-pane-edge.png` | **Tooltip clip fixed.** Hovering the ladder's LAST row: the popover renders on the `.obs-surf-pop` fixed layer and spills over the scale footer, the drawer header and the page footer. The old `position:absolute` inside `overflow:hidden` sliced all of that off. |
| 07 | `07-market-state-card-zh.png` | MarketStateCard in ZH — every former English literal translated (结构区间 / 看跌墙 / 看涨墙 / 翻转 / 现价 / 若翻转位失守? / 伽马极性 / 多头伽马主导 / 对冲压力 / 锁定目标), and the B6 guard rendering `54% 概率` from a `0.541` fraction instead of `5410%`. |
| 08 | `08-ladder-zh.png` | Ladder in ZH — lens控件, level tags, scale chips and the coverage line all translated; no EN leak. |
| 09 | `09-narrow-375px-top.png` | 375px: every control reachable (ticker + all 7 quick picks + 4 greek chips wrap instead of clipping), summary bar wraps, **0px horizontal overflow**. |
| 10 | `10-narrow-375px-ladder.png` | 375px ladder body on the compact grid — ~230px of bar column (was ~117px), short level tags, spot row centred. |
| 11 | `11-lens-unavailable-no-matrix.png` | Honest unavailable state on a root with no usable per-expiry snapshot: *"per-expiration split not available for this ticker — ladder stays all-expiry"*. The control goes dark with a reason rather than silently showing the aggregate under a lens label. |
| 12 | `12-lens-gamma-only-note-dex.png` | Same, for a non-gamma greek: the per strike×expiry store carries gamma only, so DEX/VEX/CHEX say so instead of filtering something they cannot filter. |
