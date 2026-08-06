# washout-turn-chip crops

Captured against a fresh `next dev` server (worktree, port 3299), Chromium via Playwright at
DPR 2, guest mode. Element crops of the rail card stack (`SignalButton` + `TrendRow` +
`WashoutTurnRow`). The Terminal is dark-only by construction (`data-theme="dark"` hardcoded,
no light tokens exist anywhere in globals.css/fin.css — the repo's crop precedent,
`docs/pr-crops/oracle-known-date/`, is likewise all-dark), so there is no light-theme cell.
Fixture data = real `engine/washout_turn.py` output (macro PR #4657 head) computed off the
macro repo's deep `data/stocks` store, injected as the trimmed bridge shape into dev intel
files (not committed).

| # | file | proves |
|---|---|---|
| 01 | `01-desktop-en-dark-mcd-washout-turn.png` | WASHOUT_TURN full form (MCD, the miss case): green sentence-case pill beside the Bearish desk + DOWNTREND rows — the dual-read; receipt with n=36 medians + `data through` disclosure |
| 02 | `02-desktop-zh-east-dark-mcd-washout-turn.png` | zh copy verbatim + east-mode 红涨绿跌 flip working through the tokens: 洗盘转向 pill RED while 下降趋势 pill GREEN |
| 03 | `03-desktop-en-dark-nflx-turn-watch.png` | TURN_WATCH: neutral pill, no dated detail line (no cross yet), stance + receipt only |
| 04 | `04-desktop-en-dark-dash-thin-history.png` | thin-history disclosure: `too few prior turns to summarize (n=1)` with the depth receipt kept |
| 05 | `05-desktop-en-dark-aapl-absent.png` | absent state: no WEEKLY row at all; Oracle/Desk/TREND rows byte-identical to master's rendering |
| 06 | `06-tablet-en-dark-mcd-washout-turn.png` | 820×1180 tablet rendering |
| 07 | `07-mobile-en-dark-mcd-washout-turn.png` | 390×844 mobile rendering (the floating movers FAB grazing the receipt is the pre-existing fixed-position button any scrolled card content passes under — not introduced by this change) |
