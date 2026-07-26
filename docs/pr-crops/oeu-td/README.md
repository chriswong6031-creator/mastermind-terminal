# OEU T-D — options scanner belts, hot-pocket alert, AlertsView honesty

Captured against a fresh `FLOW_FIXTURE=1` dev server (`PORT=3212`, cleared `.next`), headless
Chrome at 1440×980 DPR 2, and 375×812 DPR 2 for the narrow shots. Language switched through
the app's own `mm:lang` channel, not by editing strings.

**One stub, disclosed:** the alerts *list* is auth-gated and this harness cannot sign in
(entering credentials is off-limits), so shots 10–13 serve `/api/alerts` from a canned payload
shaped exactly as the engine writes it (`ingest/alerts_engine.py` one-shot →
`active:false` + `condition.triggered{at,note,value}`). The component, CSS and i18n rendering
that payload are the real ones. Everything else — including the signed-out state in 08/09 —
is a genuine end-to-end pass with no workarounds.

| # | file | what it proves |
|---|---|---|
| 01 | `01-tape-belt-highlights-en.png` | Tape belt + Highlights. `INDEX SPY QQQ IWM │ SECTOR …` above the existing heat chips, then a **Highlights** row: *Biggest prints* (GLD $2.6M / TSLA $2.5M / MSFT $1.5M, ordered by `premium`) and *Repeat hitters* (MSFT ×20 / TSLA ×18 / META ×15, ordered by `n_prints` — a field the feed has always shipped and nothing rendered). Display-only ordering, no score. |
| 02 | `02-tape-belt-index-spy-filtered-en.png` | Index chip filters the table: 12 rows → the 1 SPY print, chip active, the existing drill header picks it up. |
| 03 | `03-tape-belt-sector-filtered-en.png` | Sector chip filters the same table: 12 → 4 Technology rows. Index and sector are mutually exclusive by construction. |
| 04 | `04-screener-belt-sector-filtered-en.png` | The belt on the Options Screener tab, sector applied (Top Premium → NVDA only). The sector half is hidden on ΔOI / Hot Contracts, whose rows carry no `group`. |
| 05 | `05-screener-belt-no-match-honest-en.png` | **The honesty fix.** Filtering Top Premium to SPY — which `unusual_names` does not carry — used to print *"No data yet this session"*, a false claim about the session. It now reads **"Nothing matches this filter."** with a Clear filter button. Same treatment on all six belt-filtered tables; ΔOI and Hot Contracts previously rendered a headers-only table with nothing at all. |
| 06 | `06-alerts-hot-pocket-create-en.png` | New alert type wired end-to-end: *A strike lights up hot* + `HEAT ×` / `NEAR SPOT %` params + the WILL FIRE preview. |
| 07 | `07-alerts-hot-pocket-create-zh.png` | Same in ZH — 某个行权价异常放量 / 热度倍数 / 接近平值 %, preview 当 SPY 平值附近（±5%）…. No EN leak. |
| 08 | `08-alerts-signed-out-en.png` | **Real signed-out state** from a genuine 401 on `/api/alerts`. Anon visitors used to get the signed-in *"No alerts yet — create one above"* copy, which says "you have none" when the truth is "we can't see yours". The `n total` counter is suppressed too. |
| 09 | `09-alerts-signed-out-zh.png` | The same state in ZH, fully translated. |
| 10 | `10-alerts-trigger-note-en.png` | **Why it fired is on the page.** The engine's note + value (`8.02`) used to live only in `title=` — invisible to touch and keyboard. |
| 11 | `11-alerts-delete-confirm-en.png` | Two-step delete: the trash icon arms an inline *Delete this alert? / Delete / Keep* instead of firing an irreversible optimistic delete on one click. |
| 12 | `12-alerts-trigger-note-delete-confirm-zh.png` | Both in ZH. **Known gap, visible here:** the trigger note itself stays English — it is composed server-side by `ingest/alerts_engine.py` and stored as one string, so it does not follow the UI language. Tagged `lang="en"` for assistive tech; a translated note needs an engine contract change (see the PR body). |
| 13 | `13-alerts-375px.png` | 375px alerts. The inherited draft reflowed the row into 3 columns and grid auto-placement dropped the created-date into the 22px dot column, where it overran the state cell (`7/5/20Triggered`, `7/4/2Armed`). Every cell is now placed explicitly; 0px horizontal overflow. |
| 14 | `14-tape-375px-belts-wrap.png` | 375px tape: index and sector belts wrap onto their own rows, captions take a full line, Highlights wraps into labelled groups. **0px overflow** on the document, the belt and the highlights row. |
| 15 | `15-tape-375px-index-filtered.png` | The belt still filters at 375px (12 → 1 row), no overflow. |
