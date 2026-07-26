# OEU T-B — multi-day replay, honest workspace time-travel, scrubber annotations

Verification artifacts for the T-B lane. Captured from a fresh `FLOW_FIXTURE=1` run of
`terminal/` at 1440×900 (DSF 2 → 2880×1800), dark theme, EN + ZH.

The fixture session is **2026-07-06**; `surface_dates_fixture.json` retains **2026-07-02** and
**2026-07-01** behind it, so the picker has real archived sessions to load.

| # | Shot | What it proves |
|---|------|----------------|
| 01 | `01-session-picker-open-en.png` | Session picker on the ReplayBar. "Today · LIVE" + the two archived sessions. The live session's own date (2026-07-06) is filtered out, so it can never appear twice. Scrubber rail shows OPEN / POWER HOUR / CLOSE. |
| 02 | `02-archived-session-badge-en.png` | 2026-07-02 loaded. LIVE badge replaced by `2026-07-02 · ARCHIVED SESSION`; the as-of stamp reads `15:56 ET · 5-min cadence · 2026-07-02`; Session Flow withdraws with its reason. |
| 03 | `03-session-flow-truncated-en.png` | Live session scrubbed back to 12:01 (frame 31/78). Field, candles AND session flow all stop at 12:01; the totals chips fall to the 12:01 values (CALLS $167.2M / PUTS $106.9M vs $334.2M / $304.4M at the head); footnote names the replay time. |
| 04 | `04-scrubber-session-bands-en.png` | Scrubbed to 15:26 — the handle sits inside the tinted power-hour band. Landmarks are positioned on the clock, not on frame index. |
| 05 | `05-eod-tag-gex-desk-en.png` | GEX desk with the workspace scrubbed off-head. `EOD structure — not replayed` on BOTH the ladder's walls row and the expiry drawer's header. The ladder still shows its true EOD as-of (Jul 10, 16:15 ET) — no fake truncation. |
| 06 | `06-archived-session-badge-zh.png` | ZH of 02. `2026-07-02 历史交易日`, withdrawal copy `盘中资金流仅覆盖当日`, bands `开盘 / 尾盘时段 / 收盘`. |
| 07 | `07-session-flow-truncated-zh.png` | ZH of 03. `今日 · 实时` picker, `已截断至回放时点 12:01 · 152 点`. |
| 08 | `08-eod-tag-gex-desk-zh.png` | ZH of 05. `收盘结构 — 不参与回放` in both places. |
| 09 | `09-tide-tab-session-flow-truncated-en.png` | The **Tide tab's** Session sub-view truncated by the **Surface tab's** scrubber — whole-workspace time travel across sibling tabs, via the replay bus. No `OptionsHubView` edit was needed. |

## Not shipped, deliberately

Macro-event markers (FOMC/CPI) are **not** on the rail. A dated macro calendar is reachable —
the macro repo publishes `feeds/event_calendar.json` to the same R2 bucket `lib/upstreams`
`R2_BASE` already reads (probed live: HTTP 200, per-event `{date, time_et, label, label_zh,
impact}`) — but it is a **forward** calendar (`horizon_days: 21`, earliest entry `asof + 1`).
The replay track only ever shows sessions that have already happened, so the overlap with a
forward-only feed is structurally empty, not merely rare. Marking events here needs a calendar
with history. Event dates are never hardcoded.
