# washout-override-entry crops

The **TAKEN** class — the live enter-mask conditional ratified at the 25% notch (Macro
Dashboard `research/BLOCKED_ENTRY_CONDITIONAL_PREREG.md` §5, `…RATIFICATION_PACKET_2026-08-10.md`
§2/§4). Sibling set to `docs/pr-crops/washout-override/`, which shows the same mechanism in its
DISPLAY state — a qualifying fire that stays refused. Read the two side by side: same amber, two
different verdicts, and nothing borrowed between the geometries.

Captured by `terminal/e2e/washout-override.spec.ts` ("a TAKEN washout override renders as an
ordinary entry, outlined amber") against a fresh `next dev` server (worktree, port 3199),
Chromium via Playwright, desktop 1440×900, guest mode. The Terminal is dark-only by
construction (no `[data-theme]` branch exists in globals.css/fin.css — same as the
`oracle-known-date` and `washout-override` precedents), so there is no light-theme cell; both
LANGUAGES are covered instead. The zh pass is a second load with `mm.lang` already saved — the
returning-zh-user path, since the settings avatar the tablet suite clicks is mobilebar-only.

Fixture: the UEC/`uranium_miners` shape from the packet (peer-median −38.8% from 252d highs,
the one live in-cohort exemplar), emitted as `quality:"override_take"` + `tier:"quality"` +
`score:71` with no `blocked` flag, on a slice stamped `signal_era:"gc_v2_wo1"`.

| file | proves |
|---|---|
| `desktop-washout-take-en-card.png` | the Golden Oracle card: ordinary green **Buy** verdict (the mask took it), ONE amber disclosure line under it, `LATEST QUALITY: Washout override` in amber beside `TIER: Quality` / `SCORE 71` — a graded entry, not a null-tier refusal — and a green **BUY** badge in Signal history |
| `desktop-washout-take-zh-card.png` | the same card fully localized: 买入 · 深度洗盘例外入场 — 铀矿商板块距高点 −38% · 最新质量 深度洗盘例外 · 级别 优质 |
| `desktop-washout-take-en-rail.png` | the collapsed rail: green "Buy", dated — the refusal's amber "Entry trigger — regime-blocked" card is gone, because this is no longer a refusal |
| `desktop-washout-take-zh-rail.png` | the same rail in zh (买入) |
| `desktop-washout-take-en-marker.png` | the chart marker crop: the ordinary solid ★ entry pill with its `Q` tier badge, **outlined amber** — full entry geometry, no ring, no slash, nothing dimmed |
| `desktop-washout-take-zh-marker.png` | the marker in the zh session (geometry is language-independent; included so the pair is complete) |
| `desktop-washout-take-en-chart.png` · `…-zh-chart.png` | the marker in situ on the price series, for scale |

Assertions the spec pins alongside these shots (so the crops cannot drift from the contract):
amber is the resolved `--signal` token on both the outline and the disclosure line; the marker
group contains **zero** `circle[fill="none"]` ring-slashes; the hover reads "washout override
entry … the regime gate would refuse this; most still stop out" and never "not an entry"; and
the rail tooltip carries the taken lead clause, never the refused one.
