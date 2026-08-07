# portfolio-brief-panel crops

**FIXTURE-RENDERED — none of these show live data or a real user's book.** Captured against a
fresh `next dev` server (worktree, port 3212), Chromium via Playwright, element crops of
`.pbrief`. The Terminal is dark-only by construction (`data-theme="dark"` hardcoded in
`app/layout.tsx`, no light tokens exist in globals.css/fin.css — same as the
`docs/pr-crops/washout-turn-chip/` and `docs/pr-crops/oracle-known-date/` precedent), so
there is no light-theme cell.

No credentials were used. A local-only harness page mounted `<PortfolioBriefPanel />` inside
the real `(shell)` chrome and the real `.main2 > .pg` geometry that `/portfolio` uses (so the
crop widths are production-faithful: 1440 − 60px nav rail − 40px `.pg` padding = 1340), and
the panel's own `GET /api/portfolio-brief` was intercepted per state:

| state | intercepted response |
|---|---|
| 200 | the committed fixture `lib/__tests__/fixtures/portfolio_brief/concentrated_semis.json` — **sample data, not a real book** |
| 403 | `{"error":"pro_required","tier":"free"}` |
| 503 | `{"error":"artifact_unavailable"}` |
| loading | request never settles, so the shimmer stays on screen |

The harness page and capture spec were deleted before commit; only these PNGs ship. The
**401 state has no crop because it renders nothing** (`kind:"hidden"` → the component returns
`null`) — and on current master `/portfolio` gates guests with `<SignupGate>` before
`PortfolioView` mounts at all, so 401 is now only an expired-session edge case.

Viewports are the repo's three contract sizes (1440×900 / 820×1180 / 390×844). The 200 state
is shown at all three; the other states at desktop + mobile.

| # | file | proves |
|---|---|---|
| 01 | `01-desktop-1440-en-dark-brief-200.png` | 200 EN: headline carries the panel; the `--brand-2` **reading spine** runs down the body with a notch per section label; `as of 2026-07-23 · by cost basis` meta. **Sections render in canonical order (exposure → signals → earnings → filings) although the fixture deliberately stores them exposure → earnings → signals → filings — the crop is the sorter proving itself.** Honest-null `No desk coverage yet for: FOO` from `book.uncovered` |
| 02 | `02-desktop-1440-zh-dark-brief-200.png` | 200 ZH: every string is the zh half of the wire pair + zh LEX chrome, no EN leakage; `截至 … · 按成本权重`; honest-null as `以下标的暂无研究台覆盖：FOO` |
| 03 | `03-tablet-820-en-dark-brief-200.png` | 820×1180 tablet rendering, spine and notches intact |
| 04 | `04-tablet-820-zh-dark-brief-200.png` | tablet ZH |
| 05 | `05-mobile-390-en-dark-brief-200.png` | 390×844 mobile: the `@media(max-width:500px)` rule drops `.pbrief-meta` onto its own row, shrinks the headline to 16px and tightens the body's left padding; no horizontal overflow |
| 06 | `06-mobile-390-zh-dark-brief-200.png` | mobile ZH reflow |
| 07 | `07-desktop-1440-en-dark-teaser-403.png` | 403 teaser EN: plain what-it-is line, `Sample` tag, one **blurred** sample line (no real data — it is a LEX string, and `filter:blur(4px)` + `user-select:none` + `aria-hidden`), understated upsell. No urgency, no dark pattern, no buy/sell CTA |
| 08 | `08-desktop-1440-zh-dark-teaser-403.png` | 403 teaser ZH |
| 09 | `09-mobile-390-en-dark-teaser-403.png` | 403 teaser at mobile |
| 10 | `10-mobile-390-zh-dark-teaser-403.png` | 403 teaser at mobile, ZH |
| 11 | `11-desktop-1440-en-dark-unavailable-503.png` | 503: one quiet line, panel chrome only — nothing alarming, and the Conviction Book below is never blocked |
| 12 | `12-desktop-1440-zh-dark-unavailable-503.png` | 503 ZH |
| 13 | `13-mobile-390-en-dark-unavailable-503.png` | 503 at mobile |
| 14 | `14-mobile-390-zh-dark-unavailable-503.png` | 503 at mobile, ZH |
| 15 | `15-desktop-1440-en-dark-loading-skeleton.png` | loading: shimmer skeleton keeps the spine and the eyebrow so the panel does not pop in. `@media(prefers-reduced-motion:reduce)` sets `animation:none` on `.pbrief-sk` (rule present in `globals.css`; the crop is a still frame either way) |
| 16 | `16-desktop-1440-zh-dark-loading-skeleton.png` | loading ZH (eyebrow localized) |
| 17 | `17-mobile-390-en-dark-loading-skeleton.png` | loading at mobile |
| 18 | `18-mobile-390-zh-dark-loading-skeleton.png` | loading at mobile, ZH |
