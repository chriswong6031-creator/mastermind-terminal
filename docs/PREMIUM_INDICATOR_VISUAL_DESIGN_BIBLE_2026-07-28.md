# Premium Indicator Visual Design Bible

**Date:** 2026-07-28 · **Companion to:** `docs/PREMIUM_INDICATOR_SUITE_MASTERPLAN_2026-07-28.md` (read that first for mechanics, architecture, and roadmap; this doc is the *visual* contract).

**What this is:** per-module visual specifications written from direct multimodal study of the vendor's public documentation screenshots (every image downloaded and examined at pixel level), plus a technique-mining pass over BigBeluga's free open-source TradingView corpus. When a wave from the masterplan roadmap picks up a module, the implementing session reads that module's section here and must hit or beat this bar.

**How to use each section:** "Element inventory" and "Color system" define what to build; "Adaptation notes" override vendor styling where our system disagrees. Absolute rules that beat anything below: colors come from our design tokens (never hardcoded vendor hexes; no bare `--sp-*`/`--shadow-*`), directional green/red pairs use the locale-aware up/down tokens (zh flip), typography from our type scale, tooltips through the shared overlay tooltip component. Reference image URLs are listed per module so any session can re-fetch the originals (signed GitBook URLs may expire — if so, re-derive from the doc page HTML per the recipe in the masterplan source index).

**Provenance & hygiene:** vendor screenshots are private build-time reference only — they are never shipped, embedded, or committed to this repo. Our guides use screenshots of OUR implementations.

---

---



# PART I — Structure Core visual references (SMC toolkit)

## Order Blocks — visual spec
**Source doc:** https://docs.bigbeluga.com/main-toolkits/market-core-pro-tm/order-blocks - **Images studied:** 12 of 19

**Reference image URLs:**
- hero: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252F0ZM4wemaBXAoVAgvaiLb%252Fimage.png%3Falt%3Dmedia%26token%3Dc1f0a5a7-8a03-4018-967e-f0bc882c5879&width=768&dpr=3&quality=100&sign=ccc6795b&sv=2
- bull-bar: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FgjYACM8NGAf4CBrOZp6c%252Fimage.png%3Falt%3Dmedia%26token%3Ddd2f99db-2ac9-4b16-a706-ee240d8974cd&width=768&dpr=3&quality=100&sign=32e91f90&sv=2
- bear-bar: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FqND5Fd9xDt3waPWghsZP%252Fimage.png%3Falt%3Dmedia%26token%3Dd2f34571-e4c2-4515-8549-a059c5eee17c&width=768&dpr=3&quality=100&sign=6acc823a&sv=2
- rating-score: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FXyFJ8MRrr1bWrSsRapPD%252Fimage.png%3Falt%3Dmedia%26token%3D35e29dca-18fd-4043-899c-b905fb579043&width=768&dpr=3&quality=100&sign=fa7638e5&sv=2
- total-volume: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252Fs4MARsFPLRe6l8Bm4rzt%252Fimage.png%3Falt%3Dmedia%26token%3Dd431b71f-041c-4a22-ab88-ddfe94812de5&width=768&dpr=3&quality=100&sign=147351c6&sv=2
- delta-volume: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FVLAXVTeIMVvbvcOBR1W8%252Fimage.png%3Falt%3Dmedia%26token%3D76ab9db6-0584-45fa-9af0-fca6c848601c&width=768&dpr=3&quality=100&sign=ec5ad2f6&sv=2
- volume-mode: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252F4IRlKE0etW5SQWzDfHPH%252Fimage.png%3Falt%3Dmedia%26token%3D56270656-f861-44c1-b301-7c7522c5b708&width=768&dpr=3&quality=100&sign=912b7f8f&sv=2
- beluga-peak: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FyZHOwME3HcqdfuIcxFUL%252Fimage.png%3Falt%3Dmedia%26token%3D70ccd6d9-3eaa-436e-ab2a-0699acceeaba&width=768&dpr=3&quality=100&sign=9d1f9128&sv=2
- categorization: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FnvozmVuVWMUN7NlrCaqC%252Fimage.png%3Falt%3Dmedia%26token%3D3a51b424-d1af-4878-aad8-8f377a5e99b4&width=768&dpr=3&quality=100&sign=5f3235b1&sv=2
- bullish-breaker: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FJZX9CWeV78p7Goy4ftZR%252Fimage.png%3Falt%3Dmedia%26token%3Dd2fd1e25-351f-4eff-9e5e-ced0a6f4c9d2&width=768&dpr=3&quality=100&sign=675767b6&sv=2
- bearish-breaker: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252F5zv8B2YFredXHjTnCFht%252Fimage.png%3Falt%3Dmedia%26token%3D06c3b6e0-2253-4887-9be3-e0b6b4c5a03b&width=768&dpr=3&quality=100&sign=8c7e1973&sv=2
- macro: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FuYt7s2evmWclPGbIyii1%252Fimage.png%3Falt%3Dmedia%26token%3D386f8770-ea03-422b-8e39-dea5ad547cba&width=768&dpr=3&quality=100&sign=588e60ac&sv=2

**Canvas anatomy:** Dark-navy chart (bg #10131c), TV-style candles (bull #089981, bear #f23645). Each Order Block is a full-height horizontal band anchored at its origin candle and extended to the right chart edge. Inside: left-anchored volume-ratio bars grow rightward from the origin; a dotted midline (mean) carries a tier label; the right ~20% is a two-column metrics table split by 1px vertical separators and terminated by a thick accent "spine" at the chart edge. Breaker Blocks are a separate plainer family: filled dashed-border rectangle with a text label only.

**Element inventory:**
- Band fill: near-transparent direction tint — bearish resolves over bg to #241837 (violet, ~10-14% alpha), bullish #0f1f2e (cyan, ~8-10%).
- Boundaries: outer-extreme edge (top if bearish, bottom if bullish) is ~2px solid accent; opposite edge a faint hairline; short vertical accent tick at the band's left origin.
- Midline: 1px dotted, dimmed accent, full band width; tier label sits on it left of the table.
- Sell bar (upper half): ~4-5px capsule, violet #a92cce; label right of bar end, 11px, same color: "▼ 86.75%".
- Buy bar (lower half): cyan ≈#1cb3cc–#31add8: "▲ 87.31%".
- Score bar (optional, at midline): royal blue #187bd1: "▶ 100.00%", "▶ 22.00%".
- Metrics col 1: raw sell top (violet) / raw buy bottom (cyan): "877" / "134"; K-notation "2.945K".
- Metrics col 2: total+share top "954 (54.77%)", "1.011K (36.72%)"; signed delta bottom "-604", "588", "-2.714K". Share % recomputes over visible blocks (same block: 54.77% with 2 shown, 34.66% with 3).
- Right spine: ~4px solid accent bar spanning band height.
- Tier label: caps "WEAK" / "BALANCED" / "HIGH" / "STRONG"; two sizes — small grey ~10px ≈#9aa0ae, or large white bold ~28px (Show Details size setting).
- Breaker Block: rect from flip point to right edge; bull fill #0e322a, 1px dashed border #607671; bear fill #341c24, dashes #77686d; pale-grey ~20px label "Breaker Block" inside, right-of-center. No bars/table.

**Color system:** violet #a92cce = sell/bearish; cyan ≈#22b8d5 = buy/bullish; royal blue #187bd1 = score. Pixel-verified text rules: total = block-direction color; delta = sign color (positive cyan, negative violet); raw rows = side colors. Breakers use a muted second pair (green #0e322a / maroon #341c24). Flat fills everywhere; no gradients observed.

**States & variants:** Bull vs bear = mirrored accents + which boundary is emphasized. Tiers differ by label text only — no color/thickness change. Direction is structural, not dominant-side (a bullish STRONG block showed 92.73% sell yet cyan accents). Macro mode = identical anatomy, denser, zoomed-out, K-notation. Calc modes (Volume / Price Action / Beluga Peak) change placement not styling; no Beluga-specific inner marker visually verified. Mitigated/filled styling: not visually verified.

**Interaction affordances visible:** none — no tooltips or hover chips in any shot (white boxes/arrows are doc annotations).

**Adaptation notes for our terminal:**
- Map violet/cyan to aggressor-side tokens (buyVol/sellVol), NOT our locale-aware up/down pair (zh flips red/green); keep them distinct from candle colors, as the vendor does.
- Encode the verified rules: total = direction token, delta = sign token; cap band fills at ~15% alpha so candles stay readable.
- Consider tinting tier labels (vendor's all-grey tiers waste a channel); keep the right-edge spine — strongest glanceable direction cue.
- Mobile: the wide metrics table won't fit; collapse to spine + tier + share %, full metrics on tap.
- Clamp bar origins to the viewport (blocks can originate off-screen left) with a cut indicator.
- Keep Breakers quiet: desaturated fill + dashed border so they never compete with active OBs.

---

## Market Structure — visual spec
**Source doc:** https://docs.bigbeluga.com/main-toolkits/market-core-pro-tm/market-structure - **Images studied:** 12 of 18 (skipped: red-diamond mirror, 2nd neutral-diamond example, standard DB/DT, swing-PC% zoom, settings dialog)

**Reference image URLs:**
- https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FvCcdtn0mvMg5AeSUi9ZZ%252Fimage.png%3Falt%3Dmedia%26token%3Dc1b7610e-9efb-4fe1-9d1d-a8996910491b&width=768&dpr=3&quality=100&sign=798f1897&sv=2 — BOS-hero
- https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252F2CKGiHfGj7qFE751DQVo%252Fimage.png%3Falt%3Dmedia%26token%3Df33c672d-1ce5-4a87-97c5-f8adfb363352&width=768&dpr=3&quality=100&sign=94ad532f&sv=2 — CHoCH-cycle
- https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FtR3s8pBG8SlqvyMh97Kg%252Fimage.png%3Falt%3Dmedia%26token%3D5edee7d1-eb0b-4a64-ba08-051425a0228e&width=768&dpr=3&quality=100&sign=296de140&sv=2 — neutral-diamond
- https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252Fu7eGRIuibttUDhVlfR1R%252Fimage.png%3Falt%3Dmedia%26token%3D3bff5f5a-a19d-40bb-8ee9-8eb4eed5fa33&width=768&dpr=3&quality=100&sign=a3fc1cf7&sv=2 — tooltip
- https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FqcUykAVo9wGFPaksyUIm%252Fimage.png%3Falt%3Dmedia%26token%3D3ddfc710-4beb-485b-87dd-5071d1201387&width=768&dpr=3&quality=100&sign=956ea9c0&sv=2 — projection
- https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252Fb50n9VW6OlKQwagSxwq0%252Fimage.png%3Falt%3Dmedia%26token%3D4df56576-2ccb-4a4a-b73b-b861bf9c8696&width=768&dpr=3&quality=100&sign=3b56633c&sv=2 — CISD
- https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252F6oBUwlmVIJKCgfYfCGqz%252Fimage.png%3Falt%3Dmedia%26token%3D72409706-5056-47bc-8d0e-dc91c6963bad&width=768&dpr=3&quality=100&sign=ffea914&sv=2 — dashboard
- https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FBNFk7fZNEmuCsNLSO6gz%252Fimage.png%3Falt%3Dmedia%26token%3Dc6d2abc1-1634-4844-b34c-6fe357cb629a&width=768&dpr=3&quality=100&sign=a92cc12a&sv=2 — zigzag
- https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FZYcxpswAldSnteCRMwsm%252Fimage.png%3Falt%3Dmedia%26token%3Dcdfc614b-2288-4b63-b2de-83f4bd368e13&width=768&dpr=3&quality=100&sign=4ed7deaf&sv=2 — strong/weak
- https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FxDoMmECtEAOqB5v4b11t%252Fimage.png%3Falt%3Dmedia%26token%3D6762d8e4-44ed-4c2c-ba97-fd3b41ae0e9e&width=768&dpr=3&quality=100&sign=a7df8d6c&sv=2 — trend-candles
- https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252Fi4tO65lxmbD85PhCTQyo%252Fimage.png%3Falt%3Dmedia%26token%3D4889d09a-79b5-4a45-aa2e-931617cdb21a&width=768&dpr=3&quality=100&sign=1aa366fd&sv=2 — +DB/+DT
- https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FPlVniTx4yt4OLLYDDjbQ%252Fimage.png%3Falt%3Dmedia%26token%3D4d95869f-8700-45fc-8f72-e05cd9e8d7a1&width=768&dpr=3&quality=100&sign=a3bd98bf&sv=2 — swing-labels

**Canvas anatomy:** Dark-navy chart (bg #10131c), TradingView-default candles (#089981 up / #f23645 down), no visible grid. Each swing origin carries a delta-volume diamond; a horizontal level line runs from it to the breaking candle, its tiny caps label ("BOS"/"CHoCH") above high-side lines, below low-side. Pending levels project to the right edge; zigzag legs join wick extremes beneath; MTF dashboard floats mid-right; Strong/Weak labels sit in the right margin.

**Element inventory:**
- Delta diamond: rotated square ~18-22 px, translucent fill + 1.5-2 px brighter same-hue border, centered on the swing extreme, wick showing through. Fill/edge: green #087c49/#3ddc84-ish; olive #83742d/#b4a830; dark-red #883237/brighter red.
- BOS line: 1 px dashed, swing to break bar; "BOS" ~9-10 px caps #d8d8d8. Bull teal #089981; bear pink-magenta; neutral-gray #9598a1 variant also seen (internal/config).
- CHoCH line: solid 1.5-2 px; labels "CHoCH"/"CHoCh". Bull teal; bear reads crimson→violet, ~#852275 at the break end.
- Projection (pending): line to right edge, direction-colored label at the far end — teal "BOS" over gray dashes; magenta "CHOCH" under a thin pale solid line. Confirmed labels stay white.
- CISD box: translucent tint over the failed leg (bear #321822 ≈ red @ ~12%; bull #0e2825), one solid edge at the flip level (bear bottom #c52f3d; bull top bright green); "-CISD" red + ▼ lower-right; "+CISD" #00e46c + ▲ beneath.
- Hover tooltip: charcoal #3d3d3d panel, ~4 px radius, borderless; bold white "BoS"; ~14 px rounded swatch #4bc68b + "Bullish Volume"; rows "→ Time to Break | 15", "→ Relative Strength | 0.52x", "→ Break Quality | Weak" — all #f2f2f2, values column-aligned after gray "|". ("15 bars, 15h" chip = TV measure-tool annotation, not module chrome.)
- MTF dashboard: 2-col grid of #121827 cells with ~3 px bg gaps; header "MTF Structure" #b2b5be; rows "15m/1H/4H/1D" #b2b5be + bold caps status.
- Mapping zigzag: 1-1.5 px solid wick-to-wick legs, up #00e46c, down #cc1878; forming leg dashed green.
- Swing labels: bare ~12 px text "HH"/"LL" #cfcfd0, "HL" #14c0a5, "LH" #b73a3a; "PC %" line documented, not visually verified.
- Double top/bottom: thin side-colored verticals at both extremes, joined by a sloped dotted connector — orange ~#c47a28 tops, dim teal ~#249084 bottoms; "+DT"/"+DB" white outside ("DT"/"DB" not visually verified).
- Strong/weak levels: "Strong High" #0daf71 thick ~4 px line, green label; "Weak Low" #c9125e thin ~2 px, magenta label; a full-width gray dashed #959699 level also present.
- Structure candles: full candle recolor — bull teal #089981, bear violet ~#6c35c0.

**Color system:** bg #10131c. Bull ramp #089981 → #0cab87/#14c0a5 text → #00e46c/#0daf71 accents. Bear structure = magenta-violet ramp #852275 → #b72ca0/#cc1878/#c9125e, deliberately distinct from candle red #f23645 (candles, CISD-bear, DT verticals). Neutral #9598a1 lines, #d8d8d8-#f2f2f2 text. Diamond fills = delta state; violet #6c35c0 = bearish structure-candle.

**States & variants:** BOS dashed vs CHoCH solid; confirmed (line ends at break, white label) vs pending (projected, colored label); bull teal vs bear magenta-violet; diamond fill = strong-buy/strong-sell/exhausted delta; Strong thick-green vs Weak thin-magenta; "+" prefix = strong DB/DT; forming zigzag leg dashed; MTF rows BULLISH teal / BEARISH magenta.

**Interaction affordances visible:** hover tooltip on diamonds (MS-rating breakdown); dashboard display-only; projected lines pitched as pre-alert levels (docs).

**Adaptation notes for our terminal:**
- Map bull/bear structure onto our locale-aware up/down token pair, copying their key trick: structure lines get a hue lane separate from candles (violet-magenta vs candle red) — use shifted variants of our pair so levels never blend in.
- Keep dash-vs-solid (BOS/CHoCH) and white-vs-colored labels (confirmed/pending); both survive recoloring and colorblind modes.
- Diamonds: translucent fill + bright border works on dark bg; add a light-theme variant; neutral yellow → warn token.
- Tooltip and MTF panel use our surface/border/radius tokens; keep the pipe-aligned value column.
- Mobile: diamond = tap target (>=32 px hit area); below ~360 px drop line labels; collapse MTF grid to one strip.
- Omit their doc-annotation arrows and measure chips.

---

# 03 — Fair Value Gap & Swing Failure Pattern (BigBeluga Market Core Pro) — visual spec

All hexes below were pixel-sampled from the downloaded PNGs (local copies in
`../img/03-fvg-sfp/`). Chart background in every shot: `#10131c` (one FVG shot uses `#1b141d`).
Candles: TradingView classic `#089981` up / `#f23645` down; the FVG hero shot uses a
`#673ab7` purple / `#089981` teal candle theme.

## Fair Value Gap — visual spec
**Source doc:** https://docs.bigbeluga.com/main-toolkits/market-core-pro-tm/fair-value-gap - **Images studied:** 7 of 13
**Reference image URLs:**
- hero: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FLwYuiygVd2VlW43sKcMu%252Fimage.png%3Falt%3Dmedia%26token%3D82f6fe40-1ee9-4344-8000-78ead953a85a&width=768&dpr=3&quality=100&sign=b76e256b&sv=2
- partial-fill: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FiHcS9lFRD6DhJkgvOce1%252Fimage.png%3Falt%3Dmedia%26token%3Dba660828-dd66-4fcc-866f-6b20b316d08c&width=768&dpr=3&quality=100&sign=d94c2cff&sv=2
- volume-delta: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FLIkhWedzE2R2RwVmqYSl%252Fimage.png%3Falt%3Dmedia%26token%3D2ecdd2be-1e78-440e-b6d6-880cdc68e44f&width=768&dpr=3&quality=100&sign=fa873b9b&sv=2
- poc-line: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FSk2QJ6ofLTWXYa9tusoF%252Fimage.png%3Falt%3Dmedia%26token%3Db012fe7c-da9f-4818-aba4-ea1daf54f898&width=768&dpr=3&quality=100&sign=b9e5de5d&sv=2
- volume-profile: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252F9gXp4wFnDO70llgncIhU%252Fimage.png%3Falt%3Dmedia%26token%3D529b5ed5-9269-4e14-bb54-e75f268203f1&width=768&dpr=3&quality=100&sign=f7d1439f&sv=2
- inversion: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FlNyrIWZJv80aDQ0MjbR3%252Fimage.png%3Falt%3Dmedia%26token%3D38cc385e-b2b9-4f65-9c59-cdccb6bbafd6&width=768&dpr=3&quality=100&sign=169da9d8&sv=2
- signals: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FcgPQJ26uZdpz6qWgTwDc%252Fimage.png%3Falt%3Dmedia%26token%3Daac59b66-16b6-4aae-bf43-eb13ff02b4fe&width=768&dpr=3&quality=100&sign=38d77972&sv=2

**Canvas anatomy:** Each FVG is a sharp-cornered horizontal rectangle spanning the 3-candle imbalance, left edge anchored at the creation candle, extending right well past the last bar (fixed "Extension"). Inside a zone, stacked left-to-right/top-to-bottom: a horizontal volume-profile histogram hugging the left edge; a translucent gray "filled" band covering the price-traversed fraction (band stops at the current bar, shorter than the box); a gold dashed POC line spanning the box with a delta-volume label riding its right end; a white filled-% label at the box's top-right corner. Inverted FVGs re-render as opaque flat bands with a centered label. Tiny dotted-arrow signal glyphs float above/below creation candles.

**Element inventory:**
- Zone box: rectangle, 0 corner radius, 1px solid border in module color (bearish border rendered `#731d22` ≈ `#f23645` @ ~45%; bullish border edge `#174854`). Fill nearly transparent: bullish renders `#12252f`, bearish `#25151d` over `#10131c` (≈8–12% opacity module color). Unfilled interior in the partial-fill shot is bare background.
- Filled band ("Fill Glow"): neutral gray overlay ≈ `#787b86` @ 30–40% (renders `#3a363f`/`#322e38`/`#4c434c`), covers the filled fraction of the zone height, extends only to the current bar. Label: filled percent, white `#dbdbdb` ~11px regular, right-aligned at band's top-right — exact strings seen: "48.25%", "24.56%", "32.39%".
- POC line: 1px dashed, muted gold `#b3a622` (bright pixels `#c69511`) — long ~6–8px dashes. Positioned at highest-volume price (off-center) or mean (centered). Note: at 1x it reads as white; it is gold.
- POC/delta label: rides the dashed line at its right end, ~11px: positive volume bright green `#00e676` ("5.314K", "17.618K", "16.384K", "6.619K"); negative bright red `#ff5252` ("-1.233K", "-5.379K", "-1.171K", "25.908K" — leading dash of the line can read as a minus). In the partial-fill shot the delta label sits at the box's far right edge instead (no POC shown).
- Volume profile: horizontal bars anchored to the box's LEFT edge, rows ~2–3px with ~1px gaps, width ∝ volume (max ~60% box width), module color @ ~35–45% (`#502026` red bars, `#0f4b3e`–`#1c4a3a` green bars).
- iFVG box: opaque flat band, no visible border; bullish/positive variant deep navy `#132d41`, bearish/negative variant dark brown `#382a1c`; centered label white `#dbdbdb` ~11px: "iFVG: +61.577K", "iFVG: -422".
- Right-edge mini labels (inversion shot): per-zone red `#ff5252` ~10px values at each bearish box's right edge, vertically centered: "-107", "-183", "-544", "-476".
- Created-signal glyph: ~18px dotted-tail arrow (3 square dots + solid chevron head). Bullish-FVG-created = red `#f23645` arrow pointing DOWN, above the zone/candle; bearish-FVG-created = green `#01d770` arrow pointing UP, below (color follows arrow direction, inverse of zone bias). Retest signal: not visually verified (image not downloaded).
- White chunky up-arrow next to "5.314K" in the volume-delta shot matches the docs' annotation arrows elsewhere — likely doc annotation, not indicator chrome.

**Color system:** bull zone `#089981`-family teal (fill ~10%, border ~40%, profile ~40%); bear zone `#f23645`-family red (same opacity ramp); neutral filled-gray `#787b86`; POC gold `#b3a622`; delta green `#00e676` / red `#ff5252`; iFVG navy `#132d41` (+) vs brown `#382a1c` (−); label white `#dbdbdb`. No gradients — all flat fills.

**States & variants:** active (tinted box + border, full-height clear interior) → partially filled (gray band grows over it + % label) → inverted (breached: whole zone re-rendered navy/brown opaque with "iFVG:" momentum label) . Bullish vs bearish differ only by hue. Higher-timeframe zones documented but not visually verified (timeframe image not downloaded).

**Interaction affordances visible:** none — all data is drawn on-canvas; no tooltips/hover chrome in any FVG shot.

**Adaptation notes for our terminal:**
- Map teal/red to our locale-aware up/down token pair (zh flips red/green semantics); gray filled-band and gold POC should be dedicated neutral + accent tokens, not literal hexes.
- Keep the three-opacity ramp per side (fill ≈10%, border ≈40%, profile bars ≈40%) rather than three separate colors — it derives cleanly from one token.
- iFVG navy/brown is a second hue pair; simpler for us: reuse up/down tokens at full opacity with a distinct pattern (e.g. denser fill) + the "iFVG:" label.
- On mobile, drop volume-profile bars and mini right-edge labels below a width breakpoint; keep box + % label + POC only.
- Delta labels ride the POC dash and can collide with it — render label with a 2px background knockout of the line.
- Clamp box extension so labels stay inside the viewport; their fixed long extension wastes mobile width.

## Swing Failure Pattern — visual spec
**Source doc:** https://docs.bigbeluga.com/main-toolkits/market-core-pro-tm/swing-failure-pattern - **Images studied:** 6 of 10
**Reference image URLs:**
- bullish: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FA5YFLt8fPBnO6NKk0JlV%252Fimage.png%3Falt%3Dmedia%26token%3Dd2c9481e-5953-4a5f-b920-86c32b8a5fd7&width=768&dpr=3&quality=100&sign=ba442e79&sv=2
- bearish: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FKSxQkKPbg9lZvTt4sm7A%252Fimage.png%3Falt%3Dmedia%26token%3D10d7be99-3c13-4e2a-a631-07729130744d&width=768&dpr=3&quality=100&sign=1124b3b0&sv=2
- plus-sfp: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252Fkg0eP0f0q0QstN4rClHh%252Fimage.png%3Falt%3Dmedia%26token%3Dcf72cc27-a1b0-4b63-8b72-e2fb02a607a9&width=768&dpr=3&quality=100&sign=7a4b09c0&sv=2
- tooltip-hud: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252Fx7nSC9EEgfWgR5t0elYq%252Fimage.png%3Falt%3Dmedia%26token%3Db19c8b1c-cbbe-450a-af0d-728c62f32fb4&width=768&dpr=3&quality=100&sign=aa4828b3&sv=2
- threshold-filter: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FhfWHqxcnwsxI55nXIbm6%252Fimage.png%3Falt%3Dmedia%26token%3Dbf544da0-d018-4556-8047-e7e30b164962&width=768&dpr=3&quality=100&sign=38955469&sv=2
- invalidated: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FHsjWgXE7CBSIEOQeSh2A%252Fimage.png%3Falt%3Dmedia%26token%3Da984fc89-de6b-4f92-bf23-7d54450cf680&width=768&dpr=3&quality=100&sign=cd7d3e88&sv=2

**Canvas anatomy:** Each SFP is a three-part mark at the sweep wick: (1) a 1px solid horizontal level line at the swept swing high/low, running from the origin swing bar to the sweep bar, with a short (~6px) perpendicular tick at the origin end forming an "L"-bracket into the swing candle; (2) a small solid triangle just beyond the wick tip pointing back AT the wick (▼ above a swept high, ▲ below a swept low); (3) a text label outside the triangle (triangle always sits between text and price). Invalidated setups degrade to bare dashed neutral lines. A hover tooltip card floats above the marker.

**Element inventory:**
- Level line: 1px solid, module color — bullish `#4caf50`, bearish `#f23645`, high-volume tier orange `#ff9800`. Length varies from a few bars to hundreds (long sweeps keep the line, e.g. the full-width green line in the tooltip shot). At 1x these thin lines can read as gray — pixel-verified they are the module colors. Two prior swing highs swept by one wick each get their own connecting line (plus-sfp shot).
- Marker triangle: solid filled, ~8×11px, same color as its line/label: `#4caf50` ▲, `#f23645` ▼, `#ff9800` for the "+" tier.
- Label text: ~10–12px bold sans, same color, exact strings: "SFP" and "+ SFP" (plus sign, space, SFP). Bearish stack top→bottom: label, ▼, wick; bullish stack: wick, ▲, label.
- Invalidated level: dashed 1px neutral line, white/gray core `#ffffff`→`#787b86` at low opacity, ~4px dashes; runs from origin swing to the breach bar; triangle and label are removed (only the dashed line remains).
- Tooltip HUD: solid dark-gray card `#3d3d3d`, corner radius ~8px, small triangular tail bottom-left pointing to the marker, padding ~12–14px, 3 left-aligned lines of `#f2f2f2` ~13px text: "+ Bearish" / "Swing Failure Pattern" / "Volume Strength: 77.87%".
- Settings fragment shown in threshold shot ("Threshold %" input "50" with ⓘ) is doc chrome, not chart rendering.
- Deviation Area zones (settings table: levels "200%, 250%", solid/dashed style, fill): not visually verified.

**Color system:** bull `#4caf50`, bear `#f23645`, high-volume/warn `#ff9800`, invalidated neutral `#787b86` (dashed), tooltip surface `#3d3d3d` + text `#f2f2f2`, background `#10131c`. Flat colors, no gradients. Docs confirm bull/bear colors are user-configurable.

**States & variants:** bullish vs bearish = mirrored geometry + green/red hue. Volume Strength > 50% upgrades everything (label "+ SFP", triangle, level line) to orange — a strict tier, not a blend. Threshold filter simply hides sub-threshold marks (threshold shot shows an orange-only chart). Valid = solid colored line + marker; invalidated = gray dashed line only, kept as historical context.

**Interaction affordances visible:** hover tooltip on active markers (the only hover chrome in either module); nothing else interactive.

**Adaptation notes for our terminal:**
- Colors → tokens: bull/bear to our locale-aware up/down pair; `#ff9800` tier to our warn/accent token; invalidated gray to a muted-foreground token.
- The three-part stack (line + triangle + outside label) is the signature — keep exact ordering (triangle adjacent to price) so bullish/bearish read instantly at a glance.
- Render "+ SFP" tier as the same glyphs recolored, not a new glyph set; tier = one color swap.
- Mobile: keep triangle + line, drop the "SFP" text below a density breakpoint; tooltip becomes tap-to-toggle (persistent chip) since hover doesn't exist on touch.
- Long invalidated dashed lines clutter fast — cap retained invalidated marks (their "Show Last" idea) and fade them ~50%.
- Draw level lines above candles but below markers; 1px hairlines vanish on hi-DPI if alpha-composited — snap to device pixels.

---

# 04 — Support & Resistance + Money Flow Profile (BigBeluga Market Core Pro visual spec)

All hexes below were pixel-sampled from the downloaded PNGs (local copies in `specs/img/04-sr-moneyflow/`). Chart background in every shot: `#10131c`; candles up `#089981`, down `#f23645` (TradingView dark defaults). White block arrows / zig-zag path lines seen in shots are docs annotations, NOT indicator output.

## Support and Resistance — visual spec
**Source doc:** https://docs.bigbeluga.com/main-toolkits/market-core-pro-tm/support-and-resistance - **Images studied:** 3 of 4 (4th is a settings dialog, skipped)
**Reference image URLs:**
- reversal — https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252F3Rz2DK3KcS5q7LqmjP74%252Fimage.png%3Falt%3Dmedia%26token%3D9c06a329-61ee-4b3d-88f5-36208a738a22&width=768&dpr=3&quality=100&sign=c2456e48&sv=2
- breakout-up — https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FpdaKq7ngAM09WpC9baOJ%252Fimage.png%3Falt%3Dmedia%26token%3Dfbf7a55f-c644-49a4-96dc-493e6609b2bb&width=768&dpr=3&quality=100&sign=ff22d289&sv=2
- break-down — https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FPKKld6SBd8oWYvmDI74f%252Fimage.png%3Falt%3Dmedia%26token%3Dcafc3dc5-1155-46f5-9458-476810ecd10d&width=768&dpr=3&quality=100&sign=382414ac&sv=2

**Canvas anatomy:** 3–5 horizontal S/R "zones" span the FULL chart width edge-to-edge, over/under a normal candle series. Resistance zones (crimson-rose) sit above price, support zones (teal) below. The topmost and bottommost levels carry a price label pill pinned at the right edge (near the price axis): resistance pill sits ABOVE its zone, support pill BELOW its zone — always on the side away from price.

**Element inventory:**
- Level zone (the only chart primitive): a solid 2px center line at the level price, flanked symmetrically by a translucent buffer fill ~8px above and below (the "Level Buffer" setting), closed by 1px outer edge lines at reduced opacity (~35–40%). Measured stack (resistance): edge `#5f1735` → fill `#3c152a` (= `#e91e63` at ~20% over bg) → center `#e91e63` 2px → fill → edge. Support: edge `#0b6e61` → fill `#0f2e30` (= `#089981` at ~20%) → center `#089981` 2px. Square ends, no dashes, full-width.
- Label pill (optional, "Label" toggle): solid rounded rect (~5px radius, ~30px tall), white ~12px sans text, with a small triangular tail on its lower-left (resistance) / upper-left (support) corner pointing at the line — TradingView "label" shape. Microcopy exactly: "Higher Level : 1.05329" on `#e91e63`, "Lower Level : 1.01766" on `#089981` (spaces around the colon; 5-decimal FX price).
- Docs-only annotations: solid white block arrows marking touches, white zig-zag path with arrowhead for breakout direction — do not implement.

**Color system:** resistance/bear `#e91e63` (rose-magenta, deliberately distinct from the `#f23645` down-candle red); support/bull `#089981` (same hue as up-candles); fills = same hue at ~20% opacity, edges ~35–40%; label text white.

**States & variants:** In the reversal and breakout-up shots, zones above price are rose and zones below are teal. In the break-down shot ALL three zones render rose after price closes below the lowest one — consistent with each level being reclassified by which side price currently is on, with the whole full-width band recolored (whole-band repaint, no per-segment split). No mitigated/faded state observed; broken levels simply flip color. Label pills only on the extreme (highest/lowest) levels.

**Interaction affordances visible:** none (no tooltips/hover chrome in any shot).

**Adaptation notes for our terminal:**
- Map rose→`--down`-family accent and teal→`--up`-family tokens rather than hardcoding; keep the level hue slightly offset from candle colors (as they do) so zones read as levels, not candles. Remember zh locale flips up/down colors — classify semantically (resistance/support), not by literal red/green.
- Rebuild the zone as line+band with opacity ramp (center 100%, band 20%, edges 38%); expose buffer width in price units.
- Right-anchored label pill with side-aware tail; keep the "<Higher|Lower> Level : <price>" text but localize.
- On mobile, drop the outer edge lines below ~1.5px density and shorten labels to the bare price.

## Money Flow Profile — visual spec
**Source doc:** https://docs.bigbeluga.com/main-toolkits/market-core-pro-tm/money-flow-profile - **Images studied:** 9 of 15 (skipped: settings dialog, standalone strength-column shot, 2nd VaH/VaL shot, 3 gauge close-ups — gauge verified inside the VaH/VaL frame)
**Reference image URLs:**
- hero — https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FK0M2bnyoQZicT2Xo1VpS%252Fimage.png%3Falt%3Dmedia%26token%3D6f3862d1-e434-44d7-acde-742ddeceeab1&width=768&dpr=3&quality=100&sign=ac8c80f6&sv=2
- bins — https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FitfpbcRxEQY5pKdEnc4q%252Fimage.png%3Falt%3Dmedia%26token%3D201fa25c-bed0-4de2-925a-7255d231a7f0&width=768&dpr=3&quality=100&sign=eb10c495&sv=2
- orange-bin — https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FsGaSnLYnW53zDCoQFcAn%252Fimage.png%3Falt%3Dmedia%26token%3Dfcc5589a-502c-458a-a9cf-5586f8f35d83&width=768&dpr=3&quality=100&sign=8d02ae94&sv=2
- mf-poc — https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252Fmm4JkAv76T2tuDFoKgun%252Fimage.png%3Falt%3Dmedia%26token%3Dc940e2b2-b0cb-45ea-b56f-96a0b997d77b&width=768&dpr=3&quality=100&sign=a03d3ac4&sv=2
- delta-plus — https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FixTyEWQCRNtdY9d8v4m0%252Fimage.png%3Falt%3Dmedia%26token%3D9d1185a8-ec0c-4e9a-9325-26261a1f5387&width=768&dpr=3&quality=100&sign=cdd4f42&sv=2
- delta-minus — https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FNtwCTjgluDgOpE2VYlm8%252Fimage.png%3Falt%3Dmedia%26token%3Dd5897b5f-9694-4e64-a1c0-9d56e7aef9f5&width=768&dpr=3&quality=100&sign=6607111a&sv=2
- level100 — https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FY4syHLaN7ZxnR8O5COTO%252Fimage.png%3Falt%3Dmedia%26token%3D2dda5df0-c4ca-4f99-ad93-4703e529c862&width=768&dpr=3&quality=100&sign=5af9ba87&sv=2
- vah-val+gauge — https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FRbpNopkYXAqJqg4jSUkO%252Fimage.png%3Falt%3Dmedia%26token%3D07db6acf-339a-474f-9129-3258d9fb75c7&width=768&dpr=3&quality=100&sign=fdef91b0&sv=2
- heatmap — https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252F0RbLrceODnp5YL6e3fey%252Fimage.png%3Falt%3Dmedia%26token%3D0e132800-a11b-46a2-960b-ae234e317369&width=768&dpr=3&quality=100&sign=ec4ea1e5&sv=2

**Canvas anatomy:** Four zones. (1) LEFT edge: a one-cell-wide "Level Strength %" column, one cell per price bin. (2) Center: candles. (3) RIGHT of the visible candles: a two-sided horizontal profile split by a 1px light vertical spine (`#dbdbdb`) — Money Flow bars grow LEFT from the spine (toward price), Volume-delta bars grow RIGHT. Column headers above: "◂ Money" / "Volume ▸" (variant: "<Money | Volume>"). (4) Overlays: a maroon POC band spanning the full chart width at one bin's price; 1px `#dbdbdb` VaH/VaL lines full-width; a horizontal Delta gauge bottom-center. Rows are ~24–28px tall flat rectangles, square corners, ~2px gap.

**Element inventory:**
- Money bar (left side): single cyan hue, lightness ramps with value — largest `#3597c5`→mid `#3b7693`→small `#1e445b` (muted variant `#418faf`; brightest `#4eadd3`). Label inside bar at spine end, white bold ~11px: "$ 34.15B", "$ 181.281M", "$ 0"; tiny bars show dim gray label outside ("$ 38.384M").
- Volume-delta bar (right side): positive = green `#09846f` (bright large-bar variant `#2caa65`), negative = blue `#326dc6` (extreme bars lighten toward `#4eadd3`). Label inside at spine end, white: "+ 163.173K", "- 51.085K", "+ 665", "- 0" (variant style unsigned positives: "30.187K", "-17.649K", "523", "0"). Bar-less text row when value ≈ 0 ("- 917").
- Active (currently filling) bin: volume bar turns solid orange `#c26700`, and that row's money label text turns orange `#ff9900` ("$ 96.11M", "$ 1.877B", "+ 333", "- 126.322K").
- Strength column cell: steel-blue fill ramping with % — `#234154` (0%) → `#2d7da4` → 100% cell solid bright `#4eadd3`; white centered text "0%", "30%", "86%" or 2-decimal "72.00%"; font size grows with % (86/100% rows visibly larger). The 100% cell reads letter-spaced "1 0 0 % >" (variant "100% ▶"). Column header: "▸ % ◂" or two-line "Levels / Strength %".
- POC band: full-chart-width horizontal band ~24px tall (one bin), flat dark-maroon fill `#2d131c` with 1px `#736369` top/bottom edges; centered light-gray ~11px label naming the metric: "Money Flow 181.281M $", "Delta 31.701K", "Delta -16.479K", "Level 100.00%".
- Accent money labels: red `#ff5252` ("$ 61.754M") and green `#4caf50` ("$ 33.02M") on isolated rows — semantics not documented on-page (likely Delta−/Delta+ secondary POC flags); render support recommended, trigger rule "not visually verified".
- VaH/VaL: 1px solid `#dbdbdb` full-width lines; plain white text "VaH" / "VaL" centered near the line (no pill).
- Delta gauge (bottom center): ~14px-tall track `#393b42` spanning ~2/3 chart width; endpoint captions "-100%" (gray-blue) and "+100%" (green); a cyan `#4eadd3` fill segment left of center for the negative reading with a deeper `#2962ff` sub-segment; white readout "-15.00%" above the fill; small white triangle pointer + white caption "Delta" centered below. Positive-state styling: not visually verified (skipped gauge close-ups).

**Color system:** bull/positive `#09846f`–`#2caa65` green ramp; bear/negative `#326dc6`→`#4eadd3` blue ramp (NOT red — blue is this module's bear color); capital intensity = cyan lightness ramp `#1e445b`→`#4eadd3`; live/active `#c26700` bar + `#ff9900` text; POC `#2d131c` maroon band; structure lines `#dbdbdb`; heat/strength ramp `#213d4e`→`#35708a` translucent steel-cyan.
**States & variants:** green vs blue delta bins; idle vs orange live bin; POC band per metric (Money Flow / Delta+ / Delta− / Level 100%); Heat Map mode projects each row's strength as a full-width translucent stripe behind the candles (`#213d4e` mid → `#35708a` at 100%, nothing at 0%); two label dialects (signed hero style vs unsigned compact style); Location setting shifts the whole profile block nearer/farther from price.
**Interaction affordances visible:** none — all values are painted labels, no tooltips or hover chrome.
**Adaptation notes for our terminal:**
- Their bear color is BLUE: map green→`--up`-token, blue→a neutral "sell-flow" token (NOT our locale-flipped down color) or delta bars will collide with CN red-up convention; keep orange=live, maroon=POC as dedicated tokens.
- Unify the two label dialects into one (signed, thin-space, tabular numerals); keep "$" money prefix + B/M/K compaction.
- Render the profile as an overlay layer right-anchored to the viewport (their "Location" presets), spine + headers included; clip bars, never the labels.
- Font-size-by-strength in the % column is cheap and highly legible — keep it, but clamp to 2 sizes on mobile and drop the % column below ~360px width.
- POC band label should sit above the band edge on dense charts to avoid candle collision; consider making VaH/VaL dashed to disambiguate from crosshair.
- Gauge works as a detachable footer widget; keep readout precision at 2 decimals.

---

# Visual spec — HTF Volume Footprint, MTF Highs & Lows, Session Opening

All three modules render on the TradingView dark theme: background `#10131c`, up-candles `#089981`, down-candles `#f23645`, neutral chrome gray `#787b86`, label text white `#dbdbdb`. Hexes below were pixel-sampled from the vendor screenshots. Chunky white block arrows and gray measurement chips ("16 bars, 1h 20m / Vol 1.77K", "597.76 (0.71%) 59,776", "Buy Volume % of the POC", "Delta Volume of the HTF period") appearing in some shots are docs annotations, NOT indicator elements.

## HTF Volume Footprint — visual spec
**Source doc:** https://docs.bigbeluga.com/main-toolkits/market-core-pro-tm/htf-volume-footprint - **Images studied:** 5 of 6 (skipped: settings dialog)
**Reference image URLs:**
- hero: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252F7PdemrvweggphHpJbPzn%252Fimage.png%3Falt%3Dmedia%26token%3Dcfb0e36e-d431-4830-943e-62688f1da11d&width=768&dpr=3&quality=100&sign=b8718c3e&sv=2
- profile: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FIfKdCzPkeEG19jldBSOc%252Fimage.png%3Falt%3Dmedia%26token%3Dbd440e44-01b7-4879-8b76-abd6f84fc184&width=768&dpr=3&quality=100&sign=f2c7f246&sv=2
- poc: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FL5v9tb16GX0ToYhfFGVI%252Fimage.png%3Falt%3Dmedia%26token%3D6bf6fe90-9b6b-4106-8ab8-88786e695800&width=768&dpr=3&quality=100&sign=cde34642&sv=2
- valuearea: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FSngoJRZccm1RChbDqBMs%252Fimage.png%3Falt%3Dmedia%26token%3D1bd8bf94-7b13-4f8a-8627-8100b49bdb01&width=768&dpr=3&quality=100&sign=51a6dc68&sv=2
- summarycandle: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FMwV4ySrZpECbjZXJnEvx%252Fimage.png%3Falt%3Dmedia%26token%3Dc01cc63c-0d63-40fc-9fd7-9f5972bfea44&width=768&dpr=3&quality=100&sign=34476e7a&sv=2

**Canvas anatomy:** Each HTF session (e.g. one daily bar viewed on intraday) gets a horizontal volume profile anchored at the session's FIRST bar: a vertical baseline at session start with rows extending rightward over that session's own candles. Left of the baseline sits a synthetic "session summary candle" (drawn over the tail of the prior session) with a numeric delta label to its left. POC / VAH / VAL / High-Low lines shoot rightward from the profile and terminate at that session's last bar (the live session's lines run to the chart's right edge). Hero shows 4 consecutive daily sessions, each with its own profile, candle, and lines.

**Element inventory:**
- Profile rows: horizontal bars, one per price bin (~25–40 bins/session), row height ~14–16 px at doc zoom with ~1–2 px gaps; square ends, no stroke. Two-layer render from the shared left baseline: total-volume bar in indigo (base `#435bc7`, drawn translucent — reads `#2e3f82` over bg) with the buy-volume overlay in teal `#089981` on top, so visible teal = buy share, remaining visible indigo tail = sell share. Docs: longest bar auto-scales to a max width of 30 bars. Opacity varies between shots (one shot shows dimmer teal `#0e3435`) — treat fill alpha as configurable.
- POC row % labels: on the widest row only, two white ~11 px labels: buy% sitting on/near the teal segment, sell% on the indigo tail, e.g. "45%  55%", "56%  44%", "38%  62%", "73%  27%" (always sum to 100; shown even when the POC line itself is toggled off).
- POC line: solid orange `#ff7300`, ~3 px, starting flush at the right tip of the POC bar ("no gaps" per docs) and extending to session end / right edge.
- Value Area (VAH/VAL): two 1 px white `#dbdbdb` dashed lines (short ~4 px dashes) spanning profile → session end, framing the configurable 70% zone.
- Session High/Low ("HL" toggle): 1 px solid gray `#787b86` lines at session extremes, spanning the session width.
- Session summary candle: opaque body ~8–14 bars wide; vertically split — indigo `#435bc7` sell segment ON TOP, teal `#089981` buy segment BELOW, heights proportional to the labeled percentages. Centered white two-line labels: "Sell 44%" on indigo, "56% Buy" on teal (also seen: "Sell 66%"/"34% Buy", "Sell 51%"/"49% Buy", "Sell 48%"/"52% Buy", "Sell 53%"/"47% Buy", "Sell 46%"/"54% Buy"). Thin opaque `#435bc7` wick line spans the full session high→low through the body.
- Delta volume label: white text left of the body at the split height; format: signed, K-suffixed with 3 decimals ≥1000, plain integer below — "-7.138K", "-2.086K", "-843", "-463", "-356", "640", "1.011K", "3.32K".

**Color system:** indigo `#435bc7` = total/sell side; teal `#089981` = buy side (deliberately identical to the up-candle teal); orange `#ff7300` = POC; white `#dbdbdb` dashed = value area; gray `#787b86` = session H/L; bg `#10131c`. No gradients — flat fills, translucency on profile bars only.
**States & variants:** Buyer- vs seller-dominance is conveyed by segment lengths/heights plus the % labels, not by restyling. Historical sessions render identically to the live one (live lines extend to right edge). Toggles produce presence/absence states: POC on/off, VA on/off (with % input), HL on/off. No mitigated/filled states.
**Interaction affordances visible:** none in-chart (annotation chips in the shots are docs callouts). Settings imply variants only.
**Adaptation notes for our terminal:**
- Map teal→our locale-aware "up/buy" token and indigo→a dedicated "passive/total-volume" token (NOT the down color: sell share here is structural, not a loss state); POC→accent-warning/orange token; VA→foreground-muted.
- Keep the buy overlay the same hue as up-candles as BigBeluga does — it makes the profile read instantly; ensure the pair still contrasts in zh locale where up/down flips.
- Render profiles behind candles (candles overprint bars in every shot).
- Clamp profile width to ~30 bars and scale row count with pane height; on mobile drop row gaps below ~6 px row height and hide the POC % labels before hiding the summary-candle labels.
- Delta label formatting: reuse our existing K/M compact-number util; keep sign.

## MTF Highs and Lows — visual spec
**Source doc:** https://docs.bigbeluga.com/main-toolkits/market-core-pro-tm/mtf-highs-and-lows - **Images studied:** 4 of 7 (skipped: settings dialog; "Support and Resistance" and "BreakOut" example shots not downloaded — not visually verified)
**Reference image URLs:**
- day: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FgHtUnuCGpwwhIXctdtxj%252Fimage.png%3Falt%3Dmedia%26token%3D46ef44b9-1da6-4e45-a068-d106920838ab&width=768&dpr=3&quality=100&sign=a8442f61&sv=2
- week: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252Fk4AqdvWCE87nqfVpcSsl%252Fimage.png%3Falt%3Dmedia%26token%3Db415837e-9e5b-42eb-98e8-e7257d64715c&width=768&dpr=3&quality=100&sign=29ae7d8b&sv=2
- month: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FqSe63vuCoyNvYz3Yzjyy%252Fimage.png%3Falt%3Dmedia%26token%3D0dc30ca1-0839-45f5-bef4-626f608d8ff4&width=768&dpr=3&quality=100&sign=30a8f8aa&sv=2
- midrange: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FO7UsehUw3xrT9aIA3Fn4%252Fimage.png%3Falt%3Dmedia%26token%3D193e0d90-d2a4-45be-bca7-9d30bee2c71c&width=768&dpr=3&quality=100&sign=a606b48b&sv=2

**Canvas anatomy:** Extremely minimal overlay: per enabled timeframe, three horizontal lines — previous period High, Low, and auto-computed Mid-Range — each starting at the bar where that extreme printed in the previous period and extending right across the whole chart, ending with a plain text label in the right margin past the last candle. Nothing else is drawn; the chart stays uncluttered.

**Element inventory:**
- Level lines: 1 px solid (settings allow dashed/dotted + width, but every shot shows 1 px solid). Left endpoint = the anchor bar of the previous period's high/low (mid starts where computable); right endpoint = right edge of pane.
- Labels: plain text, no chip/background/border, same color as the line, ~11 px, vertically centered on the line, sitting in the right margin. Exact microcopy: "Prev-D-High", "Mid-D-Range", "Prev-D-Low", "Prev-W-High", "Mid-W-Range", "Prev-W-Low", "Prev-M-High", "Mid-M-Range", "Prev-M-Low" (pattern: `Prev-{D|W|M}-{High|Low}` / `Mid-{D|W|M}-Range`).
- Mid-Range line: identical styling to High/Low in all shots — differentiate only by label.
- White rectangles in the "Mid-Range" shot are docs annotations highlighting consolidation, not indicator chrome.

**Color system:** one hue per timeframe, uniform across its three lines and labels — Day bright green `#53dd6c`; Week yellow `#d5d11a` (thin-line antialiasing renders it ~`#a9a71b`); Month royal blue `#1041d3`. All colors user-customizable per settings; no gradients, no fills.
**States & variants:** timeframe on/off toggles; mid-line display toggle per row; line style/width options (solid seen only — dashed/dotted not visually verified). No break/mitigation restyle: after price crosses a level the line continues unchanged (visible in the Week shot where price trades through Prev-W-High). Docs frame usage states (support/resistance, breakout, mid-range balance) via examples, not styling changes.
**Interaction affordances visible:** none — static lines and labels.
**Adaptation notes for our terminal:**
- Encode timeframe→hue as tokens (e.g. `level.daily`, `level.weekly`, `level.monthly`) rather than the literal green/yellow/blue; avoid our up/down pair here entirely since these are neutral structural levels (critical for zh locale flip).
- Keep labels chip-less but add a subtle bg-colored halo/stroke for legibility over candles; on mobile move labels inside the pane right-aligned (our right margin is thinner than TV's) and abbreviate to "P-D-H" style only below ~360 px width.
- Consider dimming a line after price closes beyond it (improvement over vendor: they leave broken levels identical, which costs scanability).
- The yellow `#d5d11a` fails contrast on light theme — theme-pair each timeframe hue.

## Session Opening — visual spec
**Source doc:** https://docs.bigbeluga.com/main-toolkits/market-core-pro-tm/session-opening - **Images studied:** 3 of 6 (skipped: 3 settings/dropdown frames; those are the page's only other figures)
**Reference image URLs:**
- zone: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FKumHOQWc1J0yxGP1rNRW%252Fimage.png%3Falt%3Dmedia%26token%3D602ef1ea-5ac9-45cf-a9db-53ab9961dc98&width=768&dpr=3&quality=100&sign=76658fbd&sv=2
- channels: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FOBiDxZcs5RdzaQ5U77J1%252Fimage.png%3Falt%3Dmedia%26token%3D530e8741-ac7d-4c34-8890-a868b2f9d49f&width=768&dpr=3&quality=100&sign=a4d46851&sv=2
- signals: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252Fda1495zLYapmEwOUZC0P%252Fimage.png%3Falt%3Dmedia%26token%3De2e8868d-6dcb-4a68-ac41-27445d9c5f0f&width=768&dpr=3&quality=100&sign=36de3a41&sv=2

**Canvas anatomy:** For each configured market open (NY/London/Asia/custom), a full-height translucent green vertical band marks the opening window. From the session open, a horizontal "opening range" box spans the window's high→low and extends right THROUGH the zone and onward until the next session's zone begins (the live one runs to the right edge). Small colored dots print on bars that break out of the box. Multiple historical zone+channel pairs coexist when History is on.

**Element inventory:**
- Session zone: full-pane-height rectangle, uniform translucent forest-green fill rendering `#18372b` over the `#10131c` bg (≈ green `#0b3a24` @ ~35–45%); no visible border lines; width = configured start→end window ("The width of the zone dynamically adjusts based on the Start & End Time").
- Opening Range Channel: one box from range high to range low. Boundary chrome: 1 px gray `#787b86`-family lines at the top (range high), bottom (range low), and a faint gray mid-line at the vertical midpoint. Fill is a single vertical gradient: navy glow peaking just under the high line (~`#1a2a33`), fading to near-bg at the midpoint (~`#11141c`), then warming into maroon peaking just above the low line (~`#311d1f`). Reads as "resistance-blue upper half / support-red lower half".
- Breakout signal dots: small filled circles (~8–10 px) with a soft glow, centered on the breakout bar at/just inside the broken boundary. Up-break = muted cyan `#57b4ba` above/at the box top; down-break = hot orange-red `#fe4f2d` at the box lower half. No text, no arrows (white block arrows in shots are docs annotations).
- Channel persistence: previous session's box ends exactly where the next zone starts; zones repeat at the session cadence.

**Color system:** zone green (user-customizable "Session Color") = time context; channel gradient navy `#1a2a33` (upper/resistance) → bg → maroon `#311d1f` (lower/support) framed by neutral gray `#787b86` hairlines; signals: cyan `#57b4ba` = bullish break, orange-red `#fe4f2d` = bearish break. Note the vendor deliberately avoids the candle green/red for fills — both halves are desaturated so candles stay dominant.
**States & variants:** live channel (extends to right edge, still growing) vs historical (fixed span, identical styling); History off hides past pairs; Signals toggle hides dots; zone color customizable per session preset. Up vs down breaks differ ONLY by dot color and side. No mitigated/filled restyling.
**Interaction affordances visible:** none — all static; measurement tooltips in shots are TradingView tools, not the indicator.
**Adaptation notes for our terminal:**
- Tokenize: zone→`session.fill` (per-market hue optional), channel halves→semantic `resistance`/`support` tints, dots→locale-aware up/down signal pair (vendor's cyan/orange-red is a good template for zh-safe signals since it avoids literal green/red).
- Implement the channel as one gradient-filled rect + 3 hairlines; cheap and matches the vendor exactly.
- Full-height zone fills are expensive to over-draw on mobile — render at low alpha behind grid, and cap visible history (their History toggle) to ~3 sessions on phones.
- Add hover/tap on a dot to show break time+price (vendor has nothing — easy upgrade).
- Keep dots off-path of price by 1–2 px so they never occlude the breakout candle's close.

---

# 06 — Chart Patterns & Liquidity Concepts (BigBeluga Market Core Pro) — visual spec

Studied from vendor doc screenshots on a near-black chart background (~#0c0f16, no visible gridlines; TradingView-default sans-serif labels; mint-teal up candles ~#2ebd85, red down candles ~#f6465d). White circles / block arrows / large curved white arrows seen in some shots are docs annotations, not indicator chrome, except where noted.

## Chart Patterns — visual spec
**Source doc:** https://docs.bigbeluga.com/main-toolkits/market-core-pro-tm/chart-patterns - **Images studied:** 7 of 13 (12 chart figures + 1 settings shot; skipped near-duplicate bearish twins + settings)
**Reference image URLs:**
- ascending-channel https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FY67wxkHCv7ZOowVaQhSW%252Fimage.png%3Falt%3Dmedia%26token%3Ddb525fa4-2bcd-4762-b7b7-5a880b9c0b09&width=768&dpr=3&quality=100&sign=88f77fca&sv=2
- breakup-label https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252Fl4YaFrz6vHGyUmxDOXTe%252Fimage.png%3Falt%3Dmedia%26token%3Dd66a357d-147c-4c7e-98bf-e0581d19c5fa&width=768&dpr=3&quality=100&sign=891634fc&sv=2
- channel-target-down https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FQC7n0W91rDntgTZjoxV6%252Fimage.png%3Falt%3Dmedia%26token%3D2a3034c4-a6ff-49bf-90ae-a659559dacf0&width=768&dpr=3&quality=100&sign=36e6e718&sv=2
- rising-wedge https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252F7lKdFXj6TCE0mAiGcLY3%252Fimage.png%3Falt%3Dmedia%26token%3D181a6c0a-791a-4d5c-83d5-afc399cdd675&width=768&dpr=3&quality=100&sign=34ad3ecf&sv=2
- wedge-target-up https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FtexjnBg2fYD2iqXLAUkz%252Fimage.png%3Falt%3Dmedia%26token%3Da0cf11b6-a32e-4f99-91cb-fe315edf44aa&width=768&dpr=3&quality=100&sign=cddba32e&sv=2
- head-shoulders https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252F5yotl2u5U08MRZl656wg%252Fimage.png%3Falt%3Dmedia%26token%3D7cc09208-2a46-4aa3-9dbb-c667f14f3878&width=768&dpr=3&quality=100&sign=9e02a5b1&sv=2
- trendline-breakout https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FxZyQMqc6OGO6l9nKGLYc%252Fimage.png%3Falt%3Dmedia%26token%3D1e8d57ab-098f-425a-927e-a38edd2b0aca&width=768&dpr=3&quality=100&sign=e1361bb1&sv=2

**Canvas anatomy:** Patterns are drawn directly over candles as filled polygons. A channel is a parallelogram with vertical left/right end caps: solid resistance line on top, solid support line on bottom, translucent fill between, and a thin dashed midline at 50% of channel height. Wedges are the same but converging to an apex (fill is a triangle with a vertical left cap). Breakout labels sit just outside the broken boundary at the breakout bar; target callouts project to the right of the pattern into empty future space. H&S overlays a labeled triangle silhouette on the topping area. Trend lines connect two swing pivots and extend forward as a dashed ray.

**Element inventory:**
- Channel/wedge resistance (upper) line: solid crimson-rose ~#f23655, ~2px, role-colored (stays red even in ascending channels).
- Channel/wedge support (lower) line: solid teal ~#2abda8, ~2px.
- Pattern fill: translucent slate-white, ~rgba(160,175,200,0.10) (reads as #1a2029 panel over the background); vertical straight edges at pattern start/end.
- Channel midline: 1px dashed white/gray ~rgba(255,255,255,0.55), dash ~4/4.
- Breakout label, bullish: text "BreakUp" (one word) in green ~#5ce087, ~11-12px, below price at the breakout bar, with a small solid green up-triangle centered ABOVE the text (triangle nearest price).
- Breakout label, bearish: text "BreakDn" in red ~#f6465d above price, small solid red down-triangle BELOW the text.
- Target projection: from the breakout bar a 1px dashed white vertical measurement line spans exactly one pattern height beyond the break; at its end a solid white ~1px horizontal line runs right (~15-20 bars), terminating in a filled dot ~8px — green dot for an up target, red for a down target — followed by white bold ~11px label "Target: 74692.7281" (4-decimal price).
- Head & Shoulders: dashed light-gray neckline through the pattern lows, extended slightly past RS; thin (~1px) light-gray solid lines outline LS→Head→RS peaks; triangle area filled translucent white ~8%; labels "LS", "Head", "RS" in light gray ~12px above each peak; thick white curved projection arrow (~3px, open arrowhead) sweeping down-right after RS — part of the doc image, plausibly decorative.
- Trend line: solid amber ~#f5a623, ~2-3px, connecting two pivot highs; both anchor pivots highlighted by translucent amber glow dots ~20px (~25% opacity); beyond the second pivot the line continues as an amber dashed ray of the same slope.
- Trend-line breakout marker: small solid green up-triangle below the breakout bar plus a tiny green "+" glyph beneath it (the documented "▲+ Strong Break Up"); docs table also defines "▲ Break Up", "▼ Break Down", "▼+ Strong Break Down" (bearish variants not visually verified).
- Rising-wedge support break shows a small translucent dark-red dot at the break bar (low emphasis).

**Color system:** bull/support = teal ~#2abda8; bear/resistance = rose ~#f23655; signal text green ~#5ce087 / red ~#f6465d; neutral chrome (fills, midline, necklines, targets) = white/slate at 8-55% alpha; trend lines = amber ~#f5a623 family.
**States & variants:** Direction is encoded by label text + triangle orientation + dot color, not by restyling the pattern (boundaries keep fixed role colors in all four channel/wedge shots). Active pattern = fill + solid boundaries; after breakout the drawing stays and gains label + target. Strong vs standard breakout = added "+" glyph. Settings expose Small/Medium/Big calculation periods (no visual difference shown) and per-role color pickers.
**Interaction affordances visible:** none (no tooltips/hover chrome in any shot).
**Adaptation notes for our terminal:**
- Map to tokens: resistance→our down/danger token, support→our up token, amber trendline→accent-warn; keep labels on our locale-aware up/down pair (zh flips red/green semantics — never hardcode).
- Keep the role-colored (not direction-colored) boundary convention; it reads instantly and halves the palette.
- Render fills at <=12% alpha over dark and light themes; derive from token with alpha, not baked hexes.
- "BreakUp"/"BreakDn" + triangle is a compact, i18n-fragile microcopy — externalize strings; keep triangle-nearest-price rule.
- Target: reuse our price-label formatting (tick-size decimals, not fixed 4dp); dot+line+text at 1px scales poorly on mobile — bump hit area and font to >=11px, allow label collapse to dot-only when cramped.
- H&S curved arrow: drop it (decorative); keep neckline + LS/Head/RS labels.

## Liquidity Concepts — visual spec
**Source doc:** https://docs.bigbeluga.com/main-toolkits/market-core-pro-tm/liquidity-concepts - **Images studied:** 8 of 12 (11 chart figures + 1 settings; skipped reversal-wicks shot, duplicate map shot, single-tone profile shot)
**Reference image URLs:**
- grab-up https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252Fb0cpjx3tFxYrrZktEhAB%252Fimage.png%3Falt%3Dmedia%26token%3D3907cace-7a70-45eb-b874-ca23f40dcf1e&width=768&dpr=3&quality=100&sign=2bf4420a&sv=2
- grab-down https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252Fa4O1U89HVoICG75kSVbp%252Fimage.png%3Falt%3Dmedia%26token%3D6abd36d8-8ef7-4fd6-9de2-3b8bca5d864e&width=768&dpr=3&quality=100&sign=a5dbd801&sv=2
- buyside-sellside https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FWppqnIpIYpW9wv709ZKb%252Fimage.png%3Falt%3Dmedia%26token%3D468fcf3e-020a-49e4-a183-29eb9288cf60&width=768&dpr=3&quality=100&sign=f99dd4f5&sv=2
- zone-pct-closeup https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FkvbCY0vkozuxl0KA2acz%252Fimage.png%3Falt%3Dmedia%26token%3D3ff54e37-3d51-4dbc-bcc2-5b9254e8b00b&width=768&dpr=3&quality=100&sign=21200fe0&sv=2
- liquidity-map https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FXqk8nm7Z2uCUC28ycWwC%252Fimage.png%3Falt%3Dmedia%26token%3D5b63d512-6835-46bf-804d-c032132a5137&width=768&dpr=3&quality=100&sign=e6c6328d&sv=2
- heatmap https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252F4JN2yCoKzGhloz07aF9V%252Fimage.png%3Falt%3Dmedia%26token%3D4d46cad9-8b9f-485e-97b1-5acd1850e0d8&width=768&dpr=3&quality=100&sign=a7581461&sv=2
- profile-tooltip https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FCEAhcSErKp0TDWr3kLOa%252Fimage.png%3Falt%3Dmedia%26token%3D9ce06ff2-6e9d-40bf-9a48-164cb133f1b1&width=768&dpr=3&quality=100&sign=c68d0f&sv=2
- bubbles https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FZxFWilz9N2BQuHWl75YP%252Fimage.png%3Falt%3Dmedia%26token%3Dffbe18df-d4a5-49f9-b113-dcf8b531d618&width=768&dpr=3&quality=100&sign=1364c362&sv=2

**Canvas anatomy:** Four sub-features over candles. (1) Liquidity Grab: a small outlined box hugging the 1-3 candles that formed the swept pivot, a thin horizontal level line from that pivot extending right to the sweeping wick, and a triangle marker on the sweep bar. (2) Buyside/Sellside: two wide zone rectangles — sellside band anchored under a swept high at top of screen, buyside band above a swept low — running from pivot to the current bar, with dotted line extensions continuing to the price scale and a text+percent label at the right edge. (3) Dynamic Liquidity Map: dozens of horizontal rays from historical reversal points to the right edge (blue family above price, green family below), each ending in a tiny % label at the right margin; a two-tone horizontal profile histogram hugs the right edge with a "Total" footer. (4) Bubbles: translucent circles centered on pivot highs/lows, sized by volume tier.

**Element inventory:**
- Grab (bullish/continuation-up): amber ~#ff9800 1px outlined box around the swept prior high candles (slightly darkened fill), 1px amber level line to the sweep bar, small solid amber up-triangle BELOW the sweep bar.
- Grab (bearish): same anatomy in steel blue ~#3b6fd4; small blue down-triangle ABOVE the sweep bar. (Both colors user-configurable per settings.)
- Sellside zone: fill translucent maroon ~rgba(160,45,30,0.30); solid red-orange top edge ~#e5462f ~1-2px at the swept-high level; zone depth = wick depth; right edge stops at current bar; the top level continues right as a red DOTTED 1px line to the scale; label "Sellside - 35%" (also "Sellside - 56%") in red ~11px sitting above the dotted line, right-aligned.
- Buyside zone: mirrored in green — fill ~rgba(30,120,70,0.25), solid green bottom edge ~#22a06b, dotted green extension, label "Buyside - 64%" / "Buyside - 43%" below the line. Percent = side strength.
- Heatmap rays: 1-2px horizontal lines; above price a blue intensity ramp (faint navy ~#1e3a6e → steel blue ~#2f6db8 → bright cyan-blue ~#3ea6e8); below price a green ramp (dark forest ~#1e5c3a → green ~#2f9e5f → bright lime ~#a8d84a); the single strongest level is a thicker (~3px) salmon-red ~#ff4d5a line spanning the full pane.
- Ray % labels: tiny ~9px right-margin text per ray, colored to match its ray ("57%", "78%", "100%"). The red max level gets an off-scale callout "◄ 100% | +67% | -33%" (another shot: "◄ 100% | +71% | -29%") in salmon — total plus buy/sell delta split.
- Profile: per-price-bin horizontal bars, two segments end-to-end — teal ~#2aa89a buy segment and navy ~#27497a sell segment; length ∝ resting liquidity; chart-side % label per notable bin (green ~10px); footer label "Total" in white.
- Tooltip (on hovering a profile label): flat dark-charcoal rectangle ~#2a2e39, white ~12px text, two rows: "Buy Volume +67%" / "Sell Volume -33%".
- Bubbles: borderless circles at ~50-60% opacity in four size tiers (docs: Tiny 20-40%, Small 40-60%, Normal 60-80%, Huge 80%+ volume intensity); colors reuse the map ramps (navy/blue/cyan and green/lime); Normal+ bubbles carry a centered 2-decimal label "100.00%", "81.24%", "61.21%" (~10px, white on dark hues, dark on lime).

**Color system:** buyside/bull = green ramp to lime; sellside/bear = blue ramp to cyan (zones use red/green instead: sellside red ~#e5462f, buyside green ~#22a06b); "liquidity explosion"/max = salmon-red ~#ff4d5a; grab signals amber (bull) vs steel-blue (bear). Intensity everywhere = brightness ramp, dark→vivid, 4 stops (configurable palette per settings).
**States & variants:** rays exist only while unmitigated — price crossing removes them (mitigation is deletion, no faded state shown); zone percents update per side strength; bubble tier = size + brighter hue; strongest node promoted to red + callout.
**Interaction affordances visible:** hover tooltip on profile labels (Buy/Sell % breakdown); everything else static.
**Adaptation notes for our terminal:**
- Their blue-vs-green side coding conflicts with our locale-aware up/down pair — map sellside ramp to our down-token ramp and buyside to up-token ramp, keeping a separate neutral-hot token (their salmon) for the 100% node; never hardcode lime/cyan.
- Amber/steel-blue grab markers are a third color axis; consider collapsing to our up/down tokens with distinct glyphs (▲ sweep-up / ▼ sweep-down) to save palette budget.
- Cap ray count and label density on mobile (their right margin shows 40+ 9px labels — illegible at phone DPR); show labels only >=50% intensity, full set on tap/zoom.
- Implement mitigation as removal + optional short fade-out animation; keeps their "clean map" property.
- Profile belongs in an overlay layer pinned to the pane's right edge with its own hover/tap tooltip; reuse our formatter for "+67% / -33%" signed pairs.
- Zone labels "Sellside - NN%" read well; keep format but localize the words and keep percent integer.

---

# 07 — Price Action Concept (BigBeluga Market Core Pro)

## Price Action Concept — visual spec
**Source doc:** https://docs.bigbeluga.com/main-toolkits/market-core-pro-tm/price-action-concept - **Images studied:** 8 of 12 (skipped: settings dialog; Premium-Zone / Discount-Zone / Entry-Zone-Below shots, which repeat the styling captured in the hero/equilibrium/entry images)
**Reference image URLs:** (index = figure order on page)
- fib levels hero — https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FjpnryrCZIrqG1AW13xps%252Fimage.png%3Falt%3Dmedia%26token%3De89097cd-f7e1-4d6e-afe5-68a3d6532efc&width=768&dpr=3&quality=100&sign=9be98be&sv=2
- uptrend — https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FeMNj6WIIRuS1ziUEJhfD%252Fimage.png%3Falt%3Dmedia%26token%3D3b02ea58-bdd8-40c9-9a9f-d2b52c623fe0&width=768&dpr=3&quality=100&sign=c0d084cd&sv=2
- downtrend — https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FTdjsPYEh1hYhvHxfx5j5%252Fimage.png%3Falt%3Dmedia%26token%3De497e388-c045-428f-93b9-13ac2fe22b17&width=768&dpr=3&quality=100&sign=622cb32f&sv=2
- labels closeup — https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FRIvjDCKK8XUA89pfExLG%252Fimage.png%3Falt%3Dmedia%26token%3D9eb87cda-bf14-4b51-b775-af97ae791096&width=768&dpr=3&quality=100&sign=4f0b510&sv=2
- goldenpocket — https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252Fz0CBAa2xjhiLSUKvh7vV%252Fimage.png%3Falt%3Dmedia%26token%3D46182ac1-17b0-45fb-96a4-33145bc63049&width=768&dpr=3&quality=100&sign=12cee8bf&sv=2
- premdisc-hero — https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252Fxtwon0txsbiI8YXrXeOm%252Fimage.png%3Falt%3Dmedia%26token%3D7354c7c3-08dd-4fa1-89f6-e19861c92db5&width=768&dpr=3&quality=100&sign=f71c3a6f&sv=2
- equilibrium — https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252Fzgd86trWxu4LH0XLTXZa%252Fimage.png%3Falt%3Dmedia%26token%3D543fbc99-e1f6-409b-8594-820a602618fb&width=768&dpr=3&quality=100&sign=17bc6393&sv=2
- entryzone-above — https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FPhGOd5DGcdcou16hhyaS%252Fimage.png%3Falt%3Dmedia%26token%3Dd8dd757e-47a7-4837-a117-59aa65c2b139&width=768&dpr=3&quality=100&sign=6eb8b6b3&sv=2

Local copies: /private/tmp/claude-501/-Users-chriswong-Documents-Cluade-charting-app/4efc3e7e-13c7-40a7-a091-5fb8f5049d43/scratchpad/specs/img/07-price-action/ (price-action-{0..9}-*.png; urls.txt has all 12 signed URLs)

**Canvas anatomy:** Two overlays on a near-black blue-gray canvas (#10131c–#13161f) with TradingView-default candles (bull #089981, bear #f23645, wicks = body color). (a) **Fibonacci Ranges + OTE:** an auto-anchored retracement spanning the last impulse; five full-width horizontal lines (0 / 50 / 61.8 / 78.6 / 100%) run from the range-origin bar rightward, extending well past the last candle; a shaded OTE band fills 61.8–78.6%; a gray dashed diagonal connects the 100% anchor to the 0% anchor; a small triangle marks the range origin at the OTE edge. On each break of a range extreme a new range is drawn; older ranges persist with lines+fill but **without labels** — only the newest range carries % labels. In a downtrend the whole stack inverts (0% at the swing low). (b) **Premium & Discount:** four horizontal band strips over the same range — thin "Premium" strip hugging the range high, thin "Discount" strip at the range low, a slim gray "Equilibrium" strip at the 50% midpoint, and a taller "Entry Zone" box on the trend side of equilibrium (below it in an uptrend, above in a downtrend). All bands share the same left edge (range origin) and a common right edge slightly past the last candle; candles render on top of the fills.

**Element inventory:**
- Fib level lines: 1px solid; 0%/100% neutral gray #787b86; 50% green #4caf50; 61.8% teal #00897b; 78.6% cyan #00bcd4 (visually the brightest/heaviest, reads ~2px). Lines start at the range-origin bar and project right past price into empty space.
- Level labels: monospace ~11px, text color = line color, format exactly `"61.80% (166.16)"`, `"78.60% (19.1)"`, `"100.00% (116,225.63)"` — 2-decimal percent, price in parentheses, thousands separators. Label sits near the right terminus **on** the line; the line is interrupted behind the text (background-colored gap, no chip box), short line stub continues past it.
- OTE band: fill sampled #131f29 over #10131c bg (≈ teal at 6–8% alpha) between 61.8% and 78.6%; italic monospace label `"OTE"` in cyan (#00bcd4-family), placed inside the band right-of-center.
- Golden Pocket band: solid muted-gold fill sampled #423721 (≈ gold #c9a53f at ~30–35% alpha) occupying 61.8%–65% on the OTE side of the 61.8 line, full range width; the 61.8 label renders over it. No separate "Golden Pocket" text label seen (not visually verified).
- Trend connector: gray (#787b86-family) 1px dashed diagonal from 100% anchor to 0% anchor of the active range.
- Origin marker: small solid triangle at the left edge of the OTE band — up-triangle #00e676 (uptrend) / down-triangle #f23645 (downtrend), ~8–10px.
- Premium strip: slim full-width rectangle (~20–24px on doc renders) solid dark maroon #3d1e26 (≈ #f23645 at ~18% alpha); centered caption `"Premium"` floating just above it in very dim red (#3b1e25 text peaks, ≈40% of band hue).
- Discount strip: same geometry in dark green #0d3a2d (≈ #089981 at ~20% alpha); centered caption `"Discount"` just below it, dim green (#0d382c).
- Equilibrium strip: slim gray band, fill #242630 with 1px #343640 edges; plain right-side external label `"Equilibrium"` in light gray #b2b5be, small sans-serif (~12px), no chip.
- Entry Zone box: ~4× taller than the equilibrium strip; same fill #242630 + 1px #343640 border; a dashed #343740 horizontal midline through its center; right-side external label `"Entry Zone"` in #b2b5be.
- Doc-only annotations (do NOT implement): white block arrows, big white curved swoosh arrows, white rectangle callouts around zones.

**Color system:** bull/positive #089981 (marker accent #00e676); bear/negative #f23645; neutral structure gray #787b86 (labels #b2b5be, bright text #d1d4dc); fib ramp toward depth: 50% #4caf50 → 61.8% #00897b → 78.6% #00bcd4 (green→teal→cyan = deeper retracement); gold #c9a53f-family reserved for Golden Pocket; zone fills are the accent hue at ~6–20% alpha over the dark canvas; no gradients anywhere — flat fills only.

**States & variants:** Uptrend: 0% at range high, OTE + Entry Zone below the midpoint, green up-triangle; Downtrend: mirrored (0% at low, OTE/Entry above midpoint, red down-triangle). Percent→color mapping is fixed regardless of direction. Active range = full labels; superseded ranges = lines+fills only, labels dropped. Docs also mention user-configurable premium/discount colors ("green for discount, red for premium, dark for neutral"). No mitigated/filled state exists for this module.

**Interaction affordances visible:** none — no tooltips, buttons, or hover chips appear in any screenshot; the overlay is purely painted chrome.

**Adaptation notes for our terminal:**
- Map to tokens: bull=--up, bear=--down (locale-aware flip!), fib gray=--muted-line, label text=--text-secondary; keep the green→teal→cyan depth ramp as three dedicated `fib-50/fib-618/fib-786` tokens since it is semantic (retracement depth), not up/down.
- Because our zh locale flips up/down colors, do NOT reuse --up/--down for Premium/Discount strips; give them their own `premium`/`discount` tokens (docs allow recoloring anyway).
- Render zone fills at low alpha (≤20%) behind candles and interrupt level lines behind label text — matching their no-chip label style keeps the chart quiet.
- Keep labels only on the newest range and drop them on superseded ranges; that detail is what stops the stacked-ranges view (uptrend/downtrend shots) from becoming unreadable.
- Mobile: right-projected line stubs + right-edge labels collide with the price axis on narrow screens — anchor labels to the line's right end with an inset margin, and consider hiding 50% label + captions below ~480px width.
- The "OTE" and "Premium/Discount" captions should scale with a density setting; at our compact sizes an 11px monospace label is the floor.

---



# PART II — Trend Waves visual references

# 08 — Trend Signals & Flow Trend (Market Waves Pro [BigBeluga]) — visual spec

Chart baseline in every screenshot: near-black navy background (~#0b1120), candles teal-green up (~#0ecb81) / red down (~#f6465d), no gridlines visible.

## Trend Signals — visual spec
**Source doc:** https://docs.bigbeluga.com/main-toolkits/market-waves-pro-tm/trend-signals - **Images studied:** 10 of 17

**Reference image URLs:**
- hero (band + power-bottom badge + settings): https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FEqMY6TqsNdfhPEGivw40%252Fimage.png%3Falt%3Dmedia%26token%3D031fdc37-6718-4b2c-9c4d-a2bec58be1db&width=768&dpr=3&quality=100&sign=fd378bc7&sv=2
- standard-signals: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FgUpUUFDswuAYSHvVNTWJ%252Fimage.png%3Falt%3Dmedia%26token%3D467bd409-1397-447a-b65e-6b61326f7407&width=768&dpr=3&quality=100&sign=1f24bfa&sv=2
- power-signals-plus: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FRbir4YnjccopK5kyRovD%252Fimage.png%3Falt%3Dmedia%26token%3De11d0233-6229-429e-8099-5549fff8fd24&width=768&dpr=3&quality=100&sign=71676d72&sv=2
- power-bottom-bull: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252Fa9s3AqXBVj1LLdMRZ6uO%252Fimage.png%3Falt%3Dmedia%26token%3Df9968675-eff4-4fdd-9df5-eaca2527ea79&width=768&dpr=3&quality=100&sign=c9a6fd0a&sv=2
- power-top-bear: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FHTk1rXrBN8n8YYHHfRe1%252Fimage.png%3Falt%3Dmedia%26token%3D71d63358-b83f-4693-ae82-2515f24e672a&width=768&dpr=3&quality=100&sign=341e6e7d&sv=2
- smart-bands: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252Ff5FhJCQnAbNfMs0fSJze%252Fimage.png%3Falt%3Dmedia%26token%3D971d3f8b-a509-41b3-ae06-cb64977a7f15&width=768&dpr=3&quality=100&sign=e2a8208c&sv=2
- bullish-retest: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FY5gSuBACljOibbweYJts%252Fimage.png%3Falt%3Dmedia%26token%3D892674f9-af00-4353-97b2-855cf9e220ad&width=768&dpr=3&quality=100&sign=6207df1&sv=2
- bearish-retest: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FMkkDM3bGFsURzfjcqcx2%252Fimage.png%3Falt%3Dmedia%26token%3D60d3d31c-a137-4de7-bc78-76f28f8abbd8&width=768&dpr=3&quality=100&sign=e2458ce2&sv=2
- dynamic-take-profit: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252F9WDWB42Jb7xw3Ho6FtrR%252Fimage.png%3Falt%3Dmedia%26token%3D85fe18dc-984a-489a-ab53-2bb850ad3c57&width=768&dpr=3&quality=100&sign=1a539f4f&sv=2
- trailing-stop-loss: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FM4ARblGUOH16dYyszVun%252Fimage.png%3Falt%3Dmedia%26token%3D4c5ed7ba-7286-4dc2-90d3-216aa8d99aac&width=768&dpr=3&quality=100&sign=1585fbf8&sv=2

**Canvas anatomy:** A single "Smart Band" ribbon hugs the trend side of price — below price and rising during uptrends (green family), above price and falling during downtrends (red family). Signal badges print at trend flips: bullish badges float below the swing low, bearish above the swing high, each with a tail pointing at price. Tiny "※" retest glyphs sit just outside the band (below a green band, above a red band). Trade-management chrome (TP text labels, trailing-SL staircase with shaded risk zone) anchors at the signal bar and extends right.

**Element inventory:**
- Smart Band ribbon: two polylines with translucent fill; the outer edge (side away from price) carries the bright ~1.5–2px stroke in trend color, inner edge dimmer. Band pinches to a sharp vertex at each trend flip, then widens with momentum. Interior fill ~35–60% opacity, gradient running ALONG the ribbon: bull interior dark green → dark blue-teal (~#0d4a42 → #16424e); bear interior dark maroon (~#571622). During momentum stalls the interior hue slides toward olive/amber (~#6e5a1e) while the edge keeps trend color — momentum fade is painted inside the ribbon.
- Signal badges: rounded-rect tag ~1.3:1, corner radius ≈25% of height, with a small centered triangular tail (~6px) on the price-facing edge (tail up on bullish badges below price; tail down on bearish badges above price). Glyph centered, ~60% cap height.
  - Standard bull: green badge (~#00c47a) with dark ▲. Standard bear: deep-pink badge (~#e0316e) with white "▼".
  - Power Signals+: identical badges, glyph "▲+" / "▼+".
  - Power Bottom+: golden badge (~#f5c93f), dark "▲+". Power Top+: violet badge (~#a04ef6), white "▼+".
- Retest glyphs: ~8–10px dotted-asterisk "※" — green (~#2fbf71) below the green band = bullish retest; amber (~#c9862d) above the red band = bearish retest. No box, no text.
- Take Profit (Dynamic): bare text labels "TP1" "TP2" "TP3" "TP4" (docs: up to 6), no box or leader line, bright green (~#4ade80) floating just above the swing high that tagged the level; after a bearish signal the short-trade "TP1" prints amber/gold below the swing low.
- Take Profit (Fixed): docs describe target lines + completion checkmarks — not visually verified.
- Trailing Stop Loss (short trade shown): red ~1.5px stepped line above price ratcheting only downward; terminal microcopy "SL" in small red text at the line's right end; horizontal white/gray dashed line at entry price; translucent maroon fill (~#3a0f18 at ~40%) between the entry dash and the SL staircase (risk zone). Fixed SL static line — not visually verified.

**Color system:** bull ramp #00e07a edge → #0d4a42/#16424e fills; bear ramp #f8334a (orange-red #ff5b3a at fresh legs) → #571622 fill; stall accent olive/amber #6e5a1e blended into fills; badge accents: green #00c47a (bull), pink #e0316e (bear), gold #f5c93f (exhaustion bottom), violet #a04ef6 (exhaustion top); risk red #f23645. Gradients are longitudinal (along trend), not vertical.

**States & variants:** bull/bear = mirrored geometry + green/red family; standard vs power tier = "+" suffix on the same badge; exhaustion-reversal tier = gold/violet recolor of the badge; retest = tiny asterisk, never a badge; TP progression = TP1..TPn text appearing as levels fill; trailing SL steps only in trade direction; stalls = amber interior fade while edge color holds. Badge size scales via setting (Tiny→Huge; "Normal" shown).

**Interaction affordances visible:** none — everything is painted chart chrome; screenshots include the TradingView settings dialog but no tooltips or hover chips.

**Adaptation notes for our terminal:**
- Map to semantic tokens: signal.bull / signal.bear ride our locale-aware up/down pair (zh flips red/green); keep gold (exhaustion-bottom) and violet (exhaustion-top) as fixed accent tokens independent of locale.
- Render the ribbon as two polylines + gradient fill; encode momentum fade by interpolating fill hue toward a warn token — cheaper and clearer than extra glyphs.
- Keep the badge tail-toward-price convention; it disambiguates direction at a glance and survives small sizes.
- On mobile, drop retest asterisks below ~6px density and thin band edge to 1px; badges need ≥24px touch target if tappable.
- The trailing-SL staircase + entry dash + shaded risk zone is the highest-value pattern to copy faithfully; use our dashed-line token for entry and a 30–40% alpha down-color fill.
- Prefer our chip component for TP labels but keep their no-leader-line float above/below the triggering swing.

## Flow Trend — visual spec
**Source doc:** https://docs.bigbeluga.com/main-toolkits/market-waves-pro-tm/flow-trend - **Images studied:** 4 of 5 (5th figure is the settings panel — skipped)

**Reference image URLs:**
- hero: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252Fr50mNmFEP5iunVAkvD2q%252Fimage.png%3Falt%3Dmedia%26token%3D2fbeb072-5278-41d0-97ac-ee2cfb21743e&width=768&dpr=3&quality=100&sign=7e4d85c1&sv=2
- flip-signals: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FiEEP5OFu75phlLhA6JaU%252Fimage.png%3Falt%3Dmedia%26token%3Dbd8e9327-831c-4889-85bf-1b575dedd694&width=768&dpr=3&quality=100&sign=5e7cc0d5&sv=2
- retest-signals: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252Fh2FyTNYYzrTN0iFlEGlE%252Fimage.png%3Falt%3Dmedia%26token%3D6c1e73b5-0be7-4a08-a6ec-48d6a1c2caee&width=768&dpr=3&quality=100&sign=8d0d7e0b&sv=2
- HTF-timeframes: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FstJ2SR4pkNEcMpd22lHz%252Fimage.png%3Falt%3Dmedia%26token%3Deed8aeb8-1632-4ff3-910d-b6fdf2647eed&width=768&dpr=3&quality=100&sign=4e3dac85&sv=2

**Canvas anatomy:** A wide two-layer "cloud" ribbon rides one side of price: green-teal cloud BELOW price in uptrends, purple cloud ABOVE price in downtrends. The cloud's far edge (bottom for bull, top for bear) is a bright stroked line; toward price sit two stacked translucent fill layers (the "two step shadow cloud"). At a trend flip the old cloud terminates and the new one begins with a VERTICAL cliff at the flip bar; a small solid triangle plus a price-value text label prints beyond the vertex. Retest chevrons hug the bright edge.

**Element inventory:**
- Cloud edge line: ~1.5–2px smooth curve; bull ~#2ee6a8 spring green, bear ~#8b5cf6 violet. In HTF mode the edge renders as visible stair-steps (no smoothing).
- Fill layer 1 (adjacent to edge): saturated dark fill — bull ~#14503f, bear ~#3b2072.
- Fill layer 2 (price side): dimmer/deeper — bull ~#0e2f2a, bear ~#241650. Combined cloud is far wider than Trend Signals' Smart Band (~30–50px at widest in shots).
- Flip signal: small solid triangle (~8px) at the cliff x-position — bull ▲ below the cloud start with green price text beneath it ("105,092.28", "99,515.98" formats: thousands comma + 2 decimals); bear ▼ above the cloud start with purple text above it ("107,860.05", "103,868.01").
- Retest signal: stacked double-wave chevron glyph (~10px wide, two parallel arcs) — green, pointing up, just below the bull edge line; purple, pointing down, just above the bear edge line. Clusters of 2–3 print on consecutive retest bars (HTF shot shows many).
- Settings swatches confirm the default pair teal-green + purple; "Shadow" checkbox governs the two-step cloud fill.

**Color system:** bull family #2ee6a8 edge / #14503f / #0e2f2a fills; bear family #8b5cf6 edge / #3b2072 / #241650 fills; flip-label text uses its side's hue. No stall/amber hue in this module — it encodes direction only. The two-step gradient runs perpendicular to the ribbon (edge → price side).

**States & variants:** bull vs bear = side of price + green vs purple family; Shadow off = cloud layers removed (exact off-state not visually verified); HTF variant ("3 hours" over a lower-TF chart) = stepped edges, broader smoother swings, denser retest chevrons; flips are hard vertical joins — never blended crossovers.

**Interaction affordances visible:** none — static painted plots only.

**Adaptation notes for our terminal:**
- Purple-for-bearish is this module's identity; give it a dedicated violet "counter-trend cloud" token rather than reusing our down color, so it never collides with red candles — but let the green side follow our locale-aware up token.
- Implement as one bright edge polyline + two stacked area fills with opacity tokens; trivially cheap on canvas.
- The flip-cliff vertical join + price-value label is the recognizable signature; format the number with our standard axis formatting and align text beyond the cloud vertex.
- Draw retest chevrons as path glyphs (no font dependency), minimum ~8px; on mobile collapse chevron clusters to the first occurrence per pullback.
- Preserve HTF stair-stepping — it honestly communicates the source timeframe; do not smooth.

---

# 09 — Bands & Trails (Market Waves Pro): ActionWave, TrendMagnet, VectorShift, Voltix Bands

Shared context for all four modules (verified by pixel sampling): chart background `#10131c` (near-black navy), up-candles teal `#089880`, down-candles red `#f03040`. All screenshots are GitBook `dpr=3` renders (~1500–2300 px wide); pixel sizes below are at that scale — divide by ~2–3 for 1x equivalents. White boxes/arrows and the text labels "Ranging", "Weak / Up Trend Momentum", "Momentum Shift" seen in screenshots are doc-author annotations, NOT indicator chrome. None of these four modules renders any text, price labels, or dashboards on the chart.

---

## ActionWave — visual spec
**Source doc:** https://docs.bigbeluga.com/main-toolkits/market-waves-pro-tm/actionwave - **Images studied:** 4 of 7
**Reference image URLs:**
- hero: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FdNwKfz4UUM8pcVSrJyXd%252Fimage.png%3Falt%3Dmedia%26token%3D37c7b99b-9965-4abb-a6a3-1754e0d3f280&width=768&dpr=3&quality=100&sign=b9f4fa2b&sv=2
- circles: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FbcKEq3X5JBukHiAdjDKD%252Fimage.png%3Falt%3Dmedia%26token%3D75e05248-2a12-4f9f-8362-74f424e9466c&width=768&dpr=3&quality=100&sign=abe076d0&sv=2
- uptrend: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FDMw8ghNItU2uO6HbpfNj%252Fimage.png%3Falt%3Dmedia%26token%3De5aa3228-b238-465b-9e8b-c09eba4ae8dd&width=768&dpr=3&quality=100&sign=179c3c69&sv=2
- downtrend: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FFbvVh6RuhLO78pmSBLXg%252Fimage.png%3Falt%3Dmedia%26token%3Dc4249893-8d59-45b3-985e-b96526076be8&width=768&dpr=3&quality=100&sign=d6a586d6&sv=2
(Not downloaded: "Up Trend Shift" `/files/A1DIVfibCQO6WDBRdSkk`, "Down Trend Shift" `/files/JRxIR1mfrVB3RA6VRfvD`, settings `/files/13gokBrNmqFtpioVdiP4` — shift shots repeat the yellow-dot state; not visually verified beyond images above.)

**Canvas anatomy:** A single ultra-smooth macro "wave" line overlaid on candles — one continuous sinusoid-like curve with no kinks (heavier smoothing than any MA the eye is used to). In steady trends it trails price like a soft support (green, below candles in uptrend) or resistance (purple, above candles in downtrend); around major tops/bottoms the curve arcs over/under and crosses through price. At curve crests/troughs (and at local stalls where price re-tests the line) the line segment turns yellow and grows a dotted bead chain.

**Element inventory:**
- Wave line, "hollow tube" construction: two bright parallel rails ~1.5–2 px each with a dark same-hue core between them; total thickness ~9–10 px measured. Uptrend rails `#08b860` over core `#084030`; downtrend rails `#8838e0` over core `#302058`. Perfectly smooth curvature, rounded direction changes, no steps.
- Momentum bead chain: a run of small filled circles laid along the tube centerline; measured dot diameter ~5 px, center-to-center pitch ~13–14 px. Bright yellow `#f0e820`–`#d8e828` at full strength, duller gold `#d0b858`/`#c0a058` where blended over the purple core. Appears in stretches (dozens of dots), not singles.
- Color transition: green→yellow→purple (and reverse) happens as a gradual hue blend over ~10–20 bars around the apex — lime `#a8e030` blend tones sampled between green and yellow. No hard color cut.
- No labels, arrows, markers, or fills beyond the line itself (white arrows in shots are doc annotations).

**Color system:** bull `#08b860` (rails)/`#084030` (core); bear `#8838e0`/`#302058`; warn/transition yellow `#f0e820` with gold anti-alias `#d0b858`; blend lime `#a8e030`. Background `#10131c`. Gradient direction: along the path (time axis), only at state changes.

**States & variants:** Uptrend = green tube below price; downtrend = purple tube above price; momentum-fatigue = yellow dotted segment inside the current tube (docs: caution/exit signal; can occur mid-trend at flat spots, seen on hero right side). No mitigated/filled states; line is continuous history.

**Interaction affordances visible:** none — no tooltips, chips, or hover UI in any shot.

**Adaptation notes for our terminal:**
- Map green→`--up`-family "bull trail" token, purple→a dedicated bear-trail token (NOT our `--down` red — red is candle territory; BigBeluga deliberately avoids red/green collision by using purple). Yellow→`--warn`.
- Keep the dual-rail + dark-core tube; it reads as "band" at a glance and survives on light themes better than a fat solid stroke.
- Render beads as a dotted polyline overlay (5 px dot / 13 px pitch at 3x ⇒ ~2 px/5 px at 1x); cap density on mobile by pitch-in-px, not per-bar.
- Hue-lerp the transition over N bars rather than hard-switching color; it is the module's signature.
- zh locale: our up/down pair flips; bind trail colors to semantic trend tokens, not to up/down candle tokens.

---

## TrendMagnet — visual spec
**Source doc:** https://docs.bigbeluga.com/main-toolkits/market-waves-pro-tm/trendmagnet - **Images studied:** 5 of 8
**Reference image URLs:**
- hero: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FFvraEuzuTQOzr3SdTumh%252Fimage.png%3Falt%3Dmedia%26token%3Db388a467-8026-4ba9-aa5f-da0bbb3e6291&width=768&dpr=3&quality=100&sign=49bfe664&sv=2
- scalp: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FrKCvOTM9GnDSTgzJqhOd%252Fimage.png%3Falt%3Dmedia%26token%3D249e9ac1-6cb0-4fa9-8200-caaf71f33bc9&width=768&dpr=3&quality=100&sign=84b717b1&sv=2
- triple-lines: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FRGXI1DNvoM7ko0SwqBFG%252Fimage.png%3Falt%3Dmedia%26token%3D81bbf25c-da69-4763-bdc0-880e6fd9c58b&width=768&dpr=3&quality=100&sign=2d6662f7&sv=2
- confirmation: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252F3GYxLAL1CI2Aw9PD02no%252Fimage.png%3Falt%3Dmedia%26token%3D0b5d53bc-0d1e-46de-a717-1b7d96c8aac2&width=768&dpr=3&quality=100&sign=d60d5e4a&sv=2
- weakness: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FqJaMcBejvMOgkbidA3q1%252Fimage.png%3Falt%3Dmedia%26token%3D12018740-21ef-4fce-8040-0e0da51d44c6&width=768&dpr=3&quality=100&sign=b9b4e95d&sv=2
(Not downloaded: Normal `/files/wnL1pPlfRX2c7gofq96G`, Macro `/files/PEfkSVj5bpdQY0BMEMaY` mode shots, settings `/files/8bpzNqKI2rbZLS5InEUM` — mode variants differ only in smoothness/flip frequency; not visually verified.)

**Canvas anatomy:** Two layers. (1) On price: a "magnet" band that hugs price closely and moves in a stair-step way — dead-flat horizontal plateaus during pauses/ranges, connected by curved slopes when price runs. Sits below price in uptrends (support), above in downtrends (resistance); price chops through it during ranges. (2) Pinned at the pane edges: the "Magnet Bar" — a horizontal triple-line strip drawn at the BOTTOM edge for the uptrend period and at the TOP edge for the downtrend period, running exactly the time-span of that trend and color-flagging momentum health along the way.

**Element inventory:**
- Trend band: same hollow-tube build as ActionWave (two ~1.5 px bright rails + dark core), total ~12 px. Uptrend rails teal-green `#08b080`, core `#084038`; downtrend rails bright violet `#7028d0`–`#8a3fd6` family, core `#301050`/`#380850`. Signature shape = flat shelf → smooth S-slope → flat shelf ("magnet snap" look), visibly steppier than ActionWave.
- Color flip: gradual blend across the turn (green fades toward purple over the rounded top), as in ActionWave.
- Magnet Bar strip: exactly 3 parallel horizontal hairlines, each ~1 px, vertical pitch 6 px (total strip ≈13 px tall), flush to pane top or bottom. Base color = trend color (bottom strip teal `#00a080`/`#008060`; top strip violet `#7028d0`/`#6020b0`); segments recolor to orange `#f89800`/`#f0a020` for weak-momentum stretches. Colors alternate along time (teal→orange→teal…), segment boundaries are hard cuts.
- Annotation microcopy in docs shots (not chrome): "Ranging", "Weak / Up Trend Momentum", "Momentum Shift".

**Color system:** bull teal `#08b080` (+ strip `#00a080`); bear violet `#7028d0` (core `#301050`); warn orange `#f89800` (strip only); background `#10131c`. No gradients other than the flip blend.

**States & variants:** trending-up (green band below price + bottom strip), trending-down (purple band above price + top strip), ranging (band goes flat and price straddles it — docs: "avoid entries"), weak momentum (orange strip segments; the longer/denser the orange, the stronger the exhaustion warning). Sensitivity modes Scalp/Normal/Macro change flip frequency and slope smoothness only, not styling.

**Interaction affordances visible:** none.

**Adaptation notes for our terminal:**
- Same token mapping as ActionWave (bull-trail teal / bear-trail violet / warn orange); keep both modules on one shared trail-token set so they read as a family.
- The edge-pinned triple-line strip must be drawn in screen space (pinned to pane edge, not price scale). In our engine implement as an overlay lane ~4–5 px tall at 1x; on mobile collapse the 3 hairlines to a single 2 px bar to survive DPR rounding.
- Plateau-and-slope geometry is the identity: quantize the band to "hold last value until threshold broken, then ease to new level" rather than continuous smoothing.
- Consider a subtle tooltip on strip hover ("weak momentum since <t>") — vendor has none; cheap differentiation.

---

## VectorShift — visual spec
**Source doc:** https://docs.bigbeluga.com/main-toolkits/market-waves-pro-tm/vectorshift - **Images studied:** 4 of 7
**Reference image URLs:**
- hero: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252F8e5iBmsvBHgSDCQ1tes8%252Fimage.png%3Falt%3Dmedia%26token%3D8afa3234-7611-410f-8844-34cd597ee8aa&width=768&dpr=3&quality=100&sign=8c6aa328&sv=2
- flat-dashed: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FGFiwtJvtGBFWdSvy8L4W%252Fimage.png%3Falt%3Dmedia%26token%3Db3fa5a20-a583-4827-ba97-ce9f40b76f92&width=768&dpr=3&quality=100&sign=8f49ae11&sv=2
- bull-reentry: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FlV1sVQT2PpoTRQlVjuYI%252Fimage.png%3Falt%3Dmedia%26token%3Dd58b4e72-3903-4ab2-b2e7-4922264b35c1&width=768&dpr=3&quality=100&sign=e7db51f3&sv=2
- bear-reentry: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FIjJGCqZrTENhTRUqcs20%252Fimage.png%3Falt%3Dmedia%26token%3D801507c6-ea29-40c4-bf92-d310556d0046&width=768&dpr=3&quality=100&sign=76e249fb&sv=2
(Not downloaded: sharp-slope closeup `/files/rjM6N9tb7FTztKkZSNDY`, second flat-zone shot `/files/sfLU3KqhsjgX0e8MTzIV`, settings `/files/uBosU3aIVn6YAZuTcRG8`.)

**Canvas anatomy:** The most "premium" look of the family: a neon stair-step baseline that trails BELOW price in uptrends (cyan) and ABOVE price in downtrends (orange), with a wide soft glow halo around the whole path. Plateaus are perfectly horizontal; level changes are smooth sigmoid risers. At a trend flip the old line simply ends with a filled dot and the new color continues from the other side of price. During chop, the solid line is replaced by a thin yellow dashed horizontal level at the last plateau price. Tiny dotted-stem chevron arrows print under candles (bull) or over candles (bear) at re-entry retests. In the hero shot the candles themselves are thin and muted so the trail dominates.

**Element inventory:**
- Trail line: solid core ~3–5 px; bull core cyan `#00b8d0`, bear core orange `#f06830`. Rounded joins; sigmoid risers between plateaus.
- Glow halo: symmetric soft bloom, total glow envelope ~18 px around a 3 px core (≈7 px falloff per side); sampled halo tints `#082838` (cyan side) and `#302020`–`#904028` (orange side) — i.e., low-opacity color over the dark bg, not a bright outer stroke.
- Flip dot: filled circle at the terminal point of each finished segment, same color as its segment (`#00b8d0` / `#f06830`), diameter ≈ 3× core width.
- Flat/uncertain zone: yellow `#f8d830` dashed 1–2 px horizontal line (dash ≈ 8–10 px with similar gaps) at plateau price, can run for dozens of bars; short 1-dash yellow ticks also interrupt long solid plateaus at micro-stalls. No glow on yellow.
- Re-entry markers (docs call them "Bullish Re-entry ⇡" / "Bearish Re-entry ⇣"): small chevron arrowhead with 2–3 dot dotted stem, ~12–14 px tall; bull = dimmed cyan `#0098b0` below the candle low; bear = dimmed orange `#c85828` above the candle high.
- No text labels of any kind.

**Color system:** bull cyan `#00b8d0` (halo `#082838`); bear orange `#f06830` (halo warm `#302020`); neutral/uncertain yellow `#f8d830`; background `#10131c`. Glow = radial/blur falloff perpendicular to path.

**States & variants:** trending (solid + glow, cyan vs orange, below vs above price); uncertain/range (yellow dashed, glow off); flip (dot terminator, hard color change, side-of-price switch); re-entry event (arrow marker, dimmed tone of trend color). Modes Scalp/Normal/Macro alter step frequency only (not visually verified).

**Interaction affordances visible:** none.

**Adaptation notes for our terminal:**
- Cyan/orange is a deliberate third axis avoiding candle red/green — map to distinct `--trail-bull`/`--trail-bear` tokens rather than our locale up/down pair (which flips in zh and would collide with candles).
- Implement glow as 2–3 stacked strokes with increasing width and decreasing alpha (cheap on canvas), not a real blur filter; cap glow width on mobile (halo eats ~20 px at 3x, too heavy under 400 px wide).
- The dot-terminator + side-switch at flips is the recognition feature; keep it. Ease risers with a sigmoid (~4–8 bars), never right-angle steps.
- Dashed-yellow "range mode" doubles as an actionable no-trade filter — consider muting our entry signals while it is active.
- Arrow markers: keep monochrome dims of the trail color so they don't compete with our signal arrows; collapse the dotted stem to a plain triangle below ~1.5 px/bar densities.

---

## Voltix Bands — visual spec
**Source doc:** https://docs.bigbeluga.com/main-toolkits/market-waves-pro-tm/voltix-bands - **Images studied:** 4 of 6
**Reference image URLs:**
- reversals: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FgVcV0p22YY7SztJoDCUC%252Fimage.png%3Falt%3Dmedia%26token%3D2b7b8c1a-7b16-44d0-87a2-3a7331a8627f&width=768&dpr=3&quality=100&sign=7f4ebb3f&sv=2
- bull-overext: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252Fu0ovLscinWv41w7DorSk%252Fimage.png%3Falt%3Dmedia%26token%3D1f03320a-c8a2-4108-9022-3252e77245ac&width=768&dpr=3&quality=100&sign=a70d60e3&sv=2
- bear-overext: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FjENvO8F1jh9meGowu3ht%252Fimage.png%3Falt%3Dmedia%26token%3D81138ba1-260c-4964-879a-796c10fc024e&width=768&dpr=3&quality=100&sign=3e0de720&sv=2
- midline: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FUIT0AmMTYmpoMLMW1yMz%252Fimage.png%3Falt%3Dmedia%26token%3D1647ab14-fd1e-43b3-b0a9-4d70263b113a&width=768&dpr=3&quality=100&sign=550e48a7&sv=2
(Not downloaded: midline settings-frame crop `/files/DVS6sbRyD2cvjYWTV4bf`, settings `/files/j4ZU4lJQNJ71H4tnRk17`.)

**Canvas anatomy:** A volatility envelope drawn as two broad, gently undulating RIBBONS far outside price — a purple ribbon above (upper band) and a green ribbon below (lower band) — with open space between them where the candles live. Ribbons are thick (measured 58–85 px at 3x ⇒ roughly 4–6% of pane height) and wave smoothly like ActionWave's curvature. An optional dotted midline snakes through the price area showing trend direction. Signal triangles print where price tags a band; when price pushes past a band, the band itself heats up column-by-column behind those candles.

**Element inventory:**
- Upper ribbon: flat purple fills, two tones — single-layer `#482878`, darker overlap/inner region `#281848` (reads as two translucent ribbons crossing, giving a subtle 3-D braid). Thin hairline along its outer (top) edge, muted green `#285028`-family, ~1 px. Not a gradient — hard tonal regions.
- Lower ribbon: same construction in greens — `#086840`/`#085838` single-layer vs `#083828` overlap; thin muted red `#781820` hairline along its outer (bottom) edge.
- Overextension tinting (the signature): while price trades beyond a band, the ribbon area behind each bar is recolored as a candle-width vertical slice — bullish overextension where price rides above the upper band: khaki-yellow `#a8a858`→`#989858` slices with a red-hot core `#e04018`/`#983010` at deepest penetration; bearish overextension below the lower band: vivid grass-green slices `#48a040`/`#489840` (clearly lighter/yellower than the band's own `#086840`). Slice edges are hard (per-bar columns).
- Reversal triangles: tiny (~8–10 px) filled triangles at the retest bar: yellow up-triangle `#f8d830` under price at lower-band touches; orange down-triangle `#f89800` above price at upper-band touches.
- Voltix midline: dotted polyline of ~2 px round dots at ~4–5 px pitch; teal `#089880` while rising, soft violet `#482878` while falling; color switches at slope turns. Triangles keep printing when ribbons are hidden (seen in midline shot).
- No text, no glow, no dashed lines.

**Color system:** bear/upper purple `#482878` (dark `#281848`); bull/lower green `#086840` (dark `#083828`); overext-warm ramp `#a8a858`→`#983010`/`#e04018` (mild→extreme); overext-cool `#48a040`; signal yellow `#f8d830` / orange `#f89800`; edge hairlines `#285028` (top) and `#781820` (bottom); background `#10131c`.

**States & variants:** neutral (both ribbons quiet, two-tone only); bullish overextension (price above upper band, warm khaki→red heat slices + orange ▼ at exhaustion top); bearish overextension (price below lower band, bright-green slices + yellow ▲ on re-entry); midline bull (teal dots) vs bear (violet dots); bands-hidden mode (midline + triangles only).

**Interaction affordances visible:** none.

**Adaptation notes for our terminal:**
- Ribbon hues ≈ our bear-violet / bull-green trail family — reuse the same trail tokens as ActionWave/TrendMagnet; heat ramp maps to `--warn`→`--danger` tokens; triangles to `--warn`.
- Reproduce the two-tone ribbon with two overlapping ~40%-alpha fills of one color instead of hand-drawn regions; the overlap darkening comes free and animates correctly.
- Per-bar heat slices: implement as bar-aligned alpha fills clipped to the ribbon path — do NOT tint whole-band, the column texture is the signal's identity.
- The 1 px edge hairlines and 2 px midline dots vanish at mobile DPR — floor them at 1 device px and widen dot pitch under 480 px.
- Ribbons at 4–6% pane height overwhelm small charts; scale ribbon thickness with volatility but clamp to ~3% of pane height on mobile.

---

# BigBeluga Market Waves Pro — Candle Coloring / Candlestick Patterns / Market Dashboard
Visual design spec from vendor doc screenshots. Hexes below are pixel-sampled (median-of-patch / dominant-cluster) from the downloaded PNGs, so treat them as measured approximations of the source art, ±compression noise. Local copies: `specs/img/10-candles-dashboard/*.png`.

## Candle Coloring — visual spec
**Source doc:** https://docs.bigbeluga.com/main-toolkits/market-waves-pro-tm/candle-coloring - **Images studied:** 4 of 5
**Reference image URLs:**
- (trend) https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FBjGcLXhkqnPQSUm2Atyi%252Fimage.png%3Falt%3Dmedia%26token%3D56dd76c4-d471-4561-8914-2f02c3bd683c&width=768&dpr=3&quality=100&sign=155de5e5&sv=2
- (momentum) https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FwRs7QbJDcPb3In7G20h0%252Fimage.png%3Falt%3Dmedia%26token%3D415562a5-4a23-46ee-a668-f0ba7a22e936&width=768&dpr=3&quality=100&sign=3db52b4c&sv=2
- (trend+volume) https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FBnnYG51ue6zxBpaO2IpU%252Fimage.png%3Falt%3Dmedia%26token%3D6325a19d-91e0-43ed-8539-78a7c08d2b1f&width=768&dpr=3&quality=100&sign=6ec9273&sv=2
- (momentum+volume) https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252F9i1hn98v8HbB86XHDIWu%252Fimage.png%3Falt%3Dmedia%26token%3D6754af38-c616-4f6d-8055-f905cb4f14bd&width=768&dpr=3&quality=100&sign=33263d6c&sv=2
(5th figure = second momentum+volume example; not downloaded, not visually verified.)

**Canvas anatomy:** Full-bleed dark chart (bg ≈ #10131c, no visible gridlines) where the candles THEMSELVES are the indicator — body and wick are painted the same semantic color per bar. In Trend mode the vendor shot also shows a translucent context fill hugging the price mass: a navy silhouette (≈ #151b36) filling the area under candles during the bullish leg, and a faint dark-red haze (≈ #17121a→transparent) behind the bearish leg top-right, plus tiny rounded-square trend-flip badges floating just above/below the flip bar.

**Element inventory:**
- Colored candle: standard OHLC candle, body width ≈ 60-70% of slot, 1px wick in the same hue as the body (Trend mode) or pale gray (volume modes). No border stroke.
- Trend-flip badge (Trend shot): ~20px rounded-square pill; bearish = magenta-crimson ≈ #cb1463 with white "▼" + tiny "+" superscript; bullish = green ≈ #12b375 with white "▲" + "+". Anchored above the high / below the low of the flip bar.
- Trend context fill: flat navy ≈ #151b36 under bullish price mass; soft red-tinted gradient haze behind bearish leg (very low alpha, direction: fades away from price).
- Annotation-only chrome in the momentum shot: 1px white outline rectangles framing consolidation zones (doc annotation, not indicator output).

**Color system (sampled):**
- Trend mode: bull green ≈ #12a062→#0bac4e; bear red ≈ #ec3636→#fe3f3f.
- Momentum mode: strong bull #0bac4e; strong bear #ff3f3f; low-momentum aqua #01aec7 (family #03afb1/#04af97); plus an observed 4th transitional shade — dusty mauve ≈ #b46169 on weak bearish bars inside consolidations (docs name only green/purple/aqua; mauve is as-seen).
- Trend+Volume mode: luminance ramp keyed to relative volume. Green ramp ≈ #0d5832 → #0c763c → #0c8441 → #0b9a48 → #0bac4e; red ramp ≈ #9c2c30 → #b23033 → #c53436 → #da3839 → #ff3f3f. Hue constant, brightness/saturation scale with volume.
- Momentum+Volume mode: same two ramps but reaching further down into near-desaturated darks (#0e402a greens, #a92f32 reds) so ranging chop reads almost gray and volume climaxes glow brightest ("heatmap" effect; brightest bars mark tops/bottoms).

**States & variants:** Four user-selectable modes (Trend / Momentum / Trend+Volume / Momentum+Volume). Binary color in Trend; 3(+1) categorical colors in Momentum; continuous intensity ramps in the two volume modes. No mitigated/filled states — color is recomputed per bar.
**Interaction affordances visible:** none (pure bar paint; no tooltips or labels).
**Adaptation notes for our terminal:**
- Map to tokens: bull ramp = our locale-aware "up" color, bear ramp = "down", aqua = a neutral/info accent; never hardcode BigBeluga hexes (zh locale flips up/down).
- Implement volume ramps as lerp(darkBase→fullToken) on relative-volume percentile (5-6 quantized steps ≈ vendor look, cheaper than continuous).
- The vendor's mauve transitional shade is low-value ambiguity — collapse Momentum mode to 3 colors (up/down/neutral-aqua).
- Trend context fill and flip badges belong to a separate "trend signal" layer; keep candle paint independently toggleable.
- Mobile: ramps survive small sizes well; ensure dimmest ramp step keeps ≥3:1 contrast vs bg or bars vanish on OLED.

## Candlestick Patterns — visual spec
**Source doc:** https://docs.bigbeluga.com/main-toolkits/market-waves-pro-tm/candlestick-patterns - **Images studied:** 6 of 16
**Reference image URLs:**
- (bearish-engulfing) https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252Fs2jcKKbBQeQvQrCRdF8s%252Fimage.png%3Falt%3Dmedia%26token%3D3a3bac66-1c0f-4558-ac47-1f9c86774c90&width=768&dpr=3&quality=100&sign=da054106&sv=2
- (shooting-star) https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FRK9tgVBGTTJExE9Pxfrp%252Fimage.png%3Falt%3Dmedia%26token%3D0c712639-4e36-427e-8060-7c3c7e2c8e4e&width=768&dpr=3&quality=100&sign=8f5f1886&sv=2
- (bullish-engulfing) https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252F6ef2lwyw7MPpdlkAq8Ux%252Fimage.png%3Falt%3Dmedia%26token%3D214fb0e9-038b-46b9-9b63-70ae00f3171f&width=768&dpr=3&quality=100&sign=3ec5eb3b&sv=2
- (hammer) https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FRQzm2mwB0hFy4XlDUHzT%252Fimage.png%3Falt%3Dmedia%26token%3Da506abfc-345f-4114-b49f-8ef2f0a86ac1&width=768&dpr=3&quality=100&sign=925b4bf5&sv=2
- (bullish-doji) https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252F0zfvpNz01YR7qB8Tx5CE%252Fimage.png%3Falt%3Dmedia%26token%3D90847c1b-97f8-41fb-987c-145a1a9f9621&width=768&dpr=3&quality=100&sign=5524ce7e&sv=2
- (volume-tooltip) https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FiTR8DMaDFJ6EOAlCwzDG%252Fimage.png%3Falt%3Dmedia%26token%3D93d3c053-500a-4416-8d0c-193f59af384d&width=768&dpr=3&quality=100&sign=af513669&sv=2
(Remaining 10 figures = other pattern close-ups + settings dialog; not downloaded, not visually verified.)

**Canvas anatomy:** Standard TradingView candles (bull teal ≈ #089981, bear red ≈ #f23645, gray wicks) on bg ≈ #10131c. Each detected pattern gets a small three-line TEXT-ONLY stack (no box, no leader line) centered on the pattern's bar column: bearish stacks float above the pattern high, bullish stacks hang below the pattern low.

**Element inventory:**
- Bearish label stack (above bar, top→bottom): pattern code (e.g. "EG"), hollow down-triangle "▽", volume (e.g. "1.736M"). All in one magenta-violet.
- Bullish label stack (below bar, top→bottom): hollow up-triangle "△", pattern code "EG", volume "8.538M". All in one green. Hammer example shows only "H" over "9.883M" (no triangle visible in that crop).
- Star-family variant: code + filled star glyph, "S★" over "103.544K" — the ★ replaces the triangle row in the shot studied.
- Typography: TV default sans; code ≈ 13-14px semibold, volume same size regular, triangle ≈ 8px outline glyph; line spacing tight (~1.1).
- Volume string formats seen: "1.736M", "103.544K", "8.538M", "9.883M", "664.392K", "210" — SI abbreviation with 3 decimals, raw integer when < 1K. Docs: volume = sum of all bars forming the pattern.
- Codes (docs list): HM, S, EG, F3, 3BC, E, H (Harami), TT, "Dj" (Doji, as seen), H (Hammer), IH, R3, 3WS, M, TB.
- (volume-tooltip shot only) TV measure-tool chrome: dark charcoal rounded tooltip, white bold "1 bars, 5m" / "Vol 664.39 K" — platform chrome, not indicator output.

**Color system:** Bearish label magenta-violet ≈ #c930e4; bullish label green ≈ #00e676. Note the bearish accent is PURPLE, not the candle red — signature BigBeluga green/purple duality. Candles keep platform defaults (#089981/#f23645).
**States & variants:** Only bullish-vs-bearish placement + color; no confirmed/invalidated styling visible. Patterns are pre-filtered by mean-reversion phase (logic, not visual).
**Interaction affordances visible:** none from the indicator itself (volume figure is static text; tooltip in fig 15 is the platform's measure tool).
**Adaptation notes for our terminal:**
- Keep the text-stack idiom (no boxes) — it stays legible in dense charts; anchor with ≈4-6px offset from wick extreme and collision-nudge successive labels.
- Map bearish purple → our "down-accent" token and bullish neon green → "up-accent"; do NOT reuse the candle body colors, the contrast between label hue and candle hue is what makes labels pop.
- Normalize the glyph rule (always triangle adjacent to the bar for both sides; star suffix only for Star patterns) — vendor is inconsistent between sides.
- Localize volume abbreviations (K/M vs 万/亿) via our existing formatter; keep 3-decimals cap.
- Mobile: drop the volume line first at <~6px/bar density, keep code+triangle; expose full details in our tap-tooltip instead.

## Market Dashboard — visual spec
**Source doc:** https://docs.bigbeluga.com/main-toolkits/market-waves-pro-tm/market-dashboard - **Images studied:** 8 of 14
**Reference image URLs:**
- (volatility) https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FwkqOyjNKan0wxIeNQHgT%252Fimage.png%3Falt%3Dmedia%26token%3Dcfe8bcae-8f25-4c6a-b6a0-d54e9d8bdfc1&width=768&dpr=3&quality=100&sign=eab8322f&sv=2
- (consolidation) https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FqO19hq6A9kguOB3ZAiVz%252Fimage.png%3Falt%3Dmedia%26token%3Dffe9cf28-5e24-4933-892b-b012357652db&width=768&dpr=3&quality=100&sign=686e9919&sv=2
- (rating) https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FHv4CdzlQi00iHoNBkesD%252Fimage.png%3Falt%3Dmedia%26token%3D3760d304-49e7-4148-ab4a-f31830014d23&width=768&dpr=3&quality=100&sign=4653653&sv=2
- (trendscore-up) https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252F4qYt2e7QsGzuWSC0Sjbt%252Fimage.png%3Falt%3Dmedia%26token%3Dfa4d13e4-a3dc-420d-b2d1-7948f3bd6ea6&width=768&dpr=3&quality=100&sign=1a3dd382&sv=2
- (trendscore-down) https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FPqcpxd2PmAOIgD9krck8%252Fimage.png%3Falt%3Dmedia%26token%3Df2abc7d2-8c4d-4dc2-9eeb-e5b984066baf&width=768&dpr=3&quality=100&sign=57962846&sv=2
- (pressure-bull) https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252Favl6xZmyeuyrRz23S65z%252Fimage.png%3Falt%3Dmedia%26token%3D907d6b31-1868-47f2-8c41-ffd204bafc0a&width=768&dpr=3&quality=100&sign=54d7cf43&sv=2
- (mtftrend-bull) https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FSUKQfMCyTpJa7D8mbs3x%252Fimage.png%3Falt%3Dmedia%26token%3Dedbac5ff-8bef-442b-83e0-1f23ea7f9fa1&width=768&dpr=3&quality=100&sign=126a2caa&sv=2
- (mtfreversal) https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252F1ZWcO0I6e82GqoBIF9l7%252Fimage.png%3Falt%3Dmedia%26token%3Da696950c-b6fd-438e-956e-bc8414ee7873&width=768&dpr=3&quality=100&sign=f1282a3e&sv=2
(Not downloaded → not visually verified: Optimal-Sensitivity row, bearish-pressure, bearish-MTF-shift, MTF-feature dropdown, settings.)

**Canvas anatomy:** A compact table panel pinned to the chart's bottom-right corner (position/size configurable per docs), floating over bg ≈ #10131c. Row order top→bottom as seen: metric rows (Volatility / Consolidation / Beluga Rating / TrendScore / Pressure — only enabled rows render), then a full-width "MTF Screener" header band, then "MTF Trend:" and "MTF Reversal:" rows of five timeframe chips. White arrows/captions in shots are doc annotations.

**Element inventory:**
- Row container: flat dark slate ≈ #181d2b (header band ≈ #1b202d), square corners, no outer border; cells separated by ~1-2px hairlines ≈ #393d49.
- Label cell: left-aligned white ≈ #dbdbdb, TV sans ~13-14px semibold. Microcopy exactly: "Volatility:", "Consolidation:", "Beluga Rating :", "TrendScore:", "Pressure:", "MTF Trend:", "MTF Reversal:", header "MTF Screener".
- Metric value cell: right-adjacent inset cell, slightly darker + tinted by value color (e.g. #163a38 under Strong Buy); value text colored: "79.65%" teal ≈ #32a693, "7.3" green, "Strong Buy" green ≈ #10b06e.
- Score bar (TrendScore & Pressure): a horizontal run of square segments, one segment per score point: first segment = hollow triangle glyph ("△" bull / "▽" bear) on the darkest step, then gradient-filled segments, last segment carries the numeric value in white bold ("7", "8", "-10", "3").
- MTF chip: ~46×34px (at 1273px-wide render) solid square chip, white bold TF text "5M" "15M" "1H" "4H" "1D"; bull = solid teal, bear = solid magenta, neutral = row bg (label-colored text only).
**Color system (sampled):** panel #181d2b; hairline #393d49; text #dbdbdb; bull cell/ramp-end teal #067e6a; bear chip magenta #880e4f; TrendScore bearish ramp is PURPLE not magenta: #30183e→#491a58→#601e71→#772189→#9026a3→#9c27b0 (value cell brightest); bullish ramp #0e3234→#0e3e3c→#0d4945→#0c544d→#0c6056→#0a6b5f→#097667→#067e6a; accent value-text greens #32a693/#10b06e. Gradient direction: darkest at triangle end, brightest at value end.
**States & variants:** TrendScore ±10 → bar length = |score| (−10 showed 10 purple segments; +7/+8 showed 7/8 teal segments); Pressure same idiom (short 2-3 segment bar for "3"); neutral/zero states (gray cell + wave glyph per docs) not visually verified. MTF chips tri-state (teal/magenta/neutral). Rating states: "Strong Buy" seen; Buy/Neutral/Sell/Strong Sell not visually verified.
**Interaction affordances visible:** none — static overlay table; all variation via settings (position, size S/N/L, row toggles, MTF feature row).
**Adaptation notes for our terminal:**
- Rebuild as an HTML/canvas overlay with design tokens: teal→up-token, magenta/purple→down-token family, panel→our surface-2; keep the "one segment per point" score bar — it is the panel's best idea (magnitude legible at a glance).
- Preserve chip tri-state contrast: white text on solid fills passes contrast; neutral chips should stay text-only to make active states scream.
- Distinguish the two bearish hues deliberately (chips crimson-magenta #880e4f vs score-bar violet #9c27b0) or simplify to one down-hue ramp — pick one, document it.
- Add the missing affordance: tap/hover on a row exposing definition + raw value; vendor has none.
- Mobile: collapse to 2 rows (Rating + MTF Trend) below ~480px width; keep chips ≥32px tap targets; our locale flips up/down colors, so never encode bull=green literally.

---



# PART III — Pulse Oscillator visual references

# 11 — Nautilus Oscillator Pro suite (BigBeluga) — visual design spec

All hex values below were pixel-sampled from the vendor's doc screenshots (not eyeballed). Common frame across every screenshot: TradingView dark theme, chart background `#10131c`, candles TV-default teal `#089981` (up) / red `#f23645` (down), oscillator rendered in a separate bottom pane (~40-45% of viewport height). White boxes/arrows seen in shots are doc annotations, not indicator chrome. Local image copies: `/private/tmp/claude-501/-Users-chriswong-Documents-Cluade-charting-app/4efc3e7e-13c7-40a7-a091-5fb8f5049d43/scratchpad/specs/img/11-nautilus-wave/`.

## Nautilus — visual spec
**Source doc:** https://docs.bigbeluga.com/main-toolkits/nautilus-oscillator-pro-tm/nautilus - **Images studied:** 4 of 4
**Reference image URLs:**
- (Scalper) https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FU9oFmuCHvIavwQChIbbE%252Fimage.png%3Falt%3Dmedia%26token%3Db5b78371-3a26-4865-b3bc-39756691ea44&width=768&dpr=3&quality=100&sign=ebb37b72&sv=2
- (DayTrader) https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252Fjzydm1UMHbkfMjlDyqnz%252Fimage.png%3Falt%3Dmedia%26token%3D281f19d6-b665-4369-8d29-d1e836b4a9d9&width=768&dpr=3&quality=100&sign=ca2956db&sv=2
- (SwingTrader) https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FYYJin2fwqYdjebEAAvs8%252Fimage.png%3Falt%3Dmedia%26token%3D62f4d02c-9784-4aad-9c0e-1317b0f0669a&width=768&dpr=3&quality=100&sign=26875178&sv=2
- (GappedLine) https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252Fic27bQm3ktwyOqYfVyPL%252Fimage.png%3Falt%3Dmedia%26token%3D5c25a4bf-4526-4945-aba7-73dca8ec85c4&width=768&dpr=3&quality=100&sign=712b4dfc&sv=2

**Canvas anatomy:** Price candles occupy the top pane; the oscillator lives in a bottom sub-pane centered on a 1px midline. The single main line snakes between an implied overbought band (top ~12% of pane) and oversold band (bottom ~12%); no band fills or scale labels are drawn — the only fixed reference is the midline. Signal glyphs float in the empty margin just above line peaks (bearish) and just below line troughs (bullish). The Scalper shot also shows a floating quick-settings chip over the price pane.

**Element inventory:**
- **Main oscillator line:** ~2-3px core with a two-step neon glow: inner halo at ~35% of core color (~3px each side), outer halo at ~10-12% (~4px further; measured slice for magenta: core `#c40bb7`, inner `#421047`, outer `#22122b`). Core color changes segment-by-segment by phase (see color system); transitions blend over 1-2 bars.
- **Midline:** 1px, very dim steel-blue `#0e2934`→`#0f222d` over `#10131c` bg; full pane width.
- **OB/OS persistence dashes:** stacked horizontal dashed rows (1-3 rows, each row of short ~8px dashes, 2px thick) hugging a peak/trough; hot red `#e60000` on top with microcopy `OB`, green `#00e676` below with microcopy `OS` (tiny ~8px caps label at the row's outer end). Row count/length grows the longer the condition persists.
- **Reversal sparkle:** 4-pointed concave star (~14px) with lighter center — red `#e60000` above peaks, green `#00e676` below troughs.
- **Strong-signal diamond cluster:** four small rotated squares packed in a 2x2 diamond (~16px overall), `#ffeb3b`, dark gaps between the four cells; appears at extreme peaks/troughs, usually adjacent to sparkle + dashes.
- **Quick-settings chip (Scalper shot):** rounded dark panel `#1e222d` (r≈8px) containing: white ~18px checkbox with black check + label "Nautilus" (light grey, ~15px medium); four ~40px rounded-square swatches (`#2af598`, `#c71c39`, `#08aeea`, `#c40bb7`) with darker inner bezel; dropdown pill `#272b36` labeled "Scalper" with chevron; grey circular ⓘ button.
- **Gapped Nautilus line (alt mode):** same glow construction but 3px core, two-color scheme: green `#0eaa0a` (inner halo `#0f5514`) while rising, burnt orange `#983a0a` (inner halo `#4c2414`) while falling; reads brighter than the samples due to bloom.

**Color system:** 4-phase main line: green `#2af598` = rising below midline (accumulation); blue `#08aeea` = rising above midline (strong momentum); red `#c71c39` = declining momentum / OB-OS decline; magenta `#c40bb7` = down→up transition (appears at troughs/flats). Signal layer is deliberately hotter than the line palette: `#e60000` bear, `#00e676` bull, `#ffeb3b` = high-conviction reversal. Gapped mode collapses to green/orange (`#0eaa0a`/`#983a0a`).
**States & variants:** Trading profiles Scalper/Day Trader/Swing Trader only change line smoothness (wiggle density), not styling. Bearish signals always render above the line, bullish below. "Fill the Gaps" mode (fill between main and gapped line) is video-only — not visually verified.
**Interaction affordances visible:** the floating chip implies per-feature toggle + 4 color pickers + profile dropdown + info tooltip. No hover/tooltips visible on canvas.
**Adaptation notes for our terminal:**
- Map: line-green/blue → token `--accent-up` ramp, red → `--accent-down`, magenta → a dedicated `--transition` token; glyph colors should be *hotter* variants of the same tokens, not new hues. Respect our zh locale up/down flip for the red/green semantics.
- Implement glow as two extra strokes (same path, wider width, low alpha), not canvas blur — cheaper and matches the sampled two-step halo.
- Render OB/OS labels and dash stacks in a fixed glyph lane so they never collide with the line; on mobile drop the dash rows first, keep sparkles + diamonds.
- The 2x2 diamond cluster is the signature "act now" mark — keep it exclusive to top-tier signals.
- Draw the midline at ~15% opacity of the accent-blue token; it must stay dimmer than any line segment.

## TrendSync — visual spec
**Source doc:** https://docs.bigbeluga.com/main-toolkits/nautilus-oscillator-pro-tm/trendsync - **Images studied:** 2 of 2
**Reference image URLs:**
- (upper-bars-orange-peak) https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FkURGjbc0gXuDyOfvAaAa%252Fimage.png%3Falt%3Dmedia%26token%3D93bd1c4b-0511-4f5e-9afb-15fd5db6760c&width=768&dpr=3&quality=100&sign=6e618d49&sv=2
- (lower-bars-orange-peak) https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FJecqlPYtfaHlmf16FCHx%252Fimage.png%3Falt%3Dmedia%26token%3D3dd90131-fdc6-4587-bf4d-4da32d396650&width=768&dpr=3&quality=100&sign=9aa709e&sv=2

**Canvas anatomy:** Two fixed horizontal lanes inside the oscillator pane: a bearish lane a little above the line's maximum reach, and a bullish lane at the pane bottom. Each lane is a row of small per-bar rectangles ("trend cells") that appear only while that side's momentum phase is active, forming runs with gaps between phases. The Nautilus line (here mostly 3-color: green/blue/red) runs between the lanes; small pivot dots sit directly on the line at phase flips.
**Element inventory:**
- **Trend cells:** rounded rectangles ~9px tall, ~10-12px wide (one per chart bar, ~1-2px gap; adjacent same-color cells nearly fuse into a band).
- **Bearish (upper) run:** purple/magenta intensity ramp, sampled steps `#34113b` → `#580f5a` → `#7c0f79` → `#a00d98` (dim at run edges, brightest mid-run — brightness tracks momentum strength).
- **Bullish (lower) run:** teal ramp `#15393c` → `#19635d` → `#1d8b7c` → `#21b39d` → `#24ccb1`.
- **Exhaustion cells:** solid orange `#c95f00` replacing 2-5 consecutive cells at peak momentum in EITHER lane (the doc's "possible peak / nearing exhaustion" cue).
- **Pivot dots on the line:** filled circles ~8px: lime `#beef30` at a peak where blue flips to red; spring green `#2af598` at a trough where red flips to green.
- Oscillator line + dim steel midline as in the Nautilus module.
**Color system:** bearish = purple family (matches the line's magenta token), bullish = teal family (near candle-up teal), shared warn color orange `#c95f00` for exhaustion in both lanes; ramps run dim→bright→dim across a run. Lime `#beef30` = confirmed top pivot, `#2af598` = confirmed bottom pivot.
**States & variants:** active run vs no-cell (lane empty between phases); strength encoded by cell brightness; exhaustion = orange override; both-direction coverage (upper + lower lane can be populated in the same viewport). No mitigated/filled states exist.
**Interaction affordances visible:** none (white boxes/arrows are doc annotations).
**Adaptation notes for our terminal:**
- Encode strength as opacity steps of ONE token per side (4-5 quantized steps as sampled) instead of hand-picked hexes; orange maps to our `--warn` token — same token both lanes.
- Snap cell width to bar spacing with a 1px gap; below ~6px bar spacing merge cells into a continuous strip (mobile density).
- Keep lanes at fixed pane offsets (not data-relative) so runs never overlap the line; lanes double as OB/OS fences.
- The pivot dots duplicate information our chart engine can show as phase-flip markers; keep them small (≤8px) and only at confirmed flips to avoid repaint accusations.

## 10X Analysis — visual spec
**Source doc:** https://docs.bigbeluga.com/main-toolkits/nautilus-oscillator-pro-tm/10x-analysis - **Images studied:** 1 of 1
**Reference image URLs:**
- (hero) https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FbdO8hbYmHzKQoab683xD%252Fimage.png%3Falt%3Dmedia%26token%3D6db71154-c9bb-4936-81cc-26653f23cea5&width=768&dpr=3&quality=100&sign=2cf4063f&sv=2

**Canvas anatomy:** A single fixed "activity rail" running the full width of the oscillator pane at the top (just above the line's peaks, at the OB level). The rail is a picket-fence of tiny vertical ticks, one per bar. On normal days ticks are near-invisible dark grey; on exceptional ("10X") days a contiguous run lights up chartreuse, visually bracketing multi-day high-activity windows. Nautilus line, OB/OS glyphs and sparkles render as usual beneath/around it.
**Element inventory:**
- **Baseline ticks:** ~1-2px wide, ~8px tall, ~5px pitch, dark grey-blue `#21242d` (barely above bg) — a continuous dotted guide across the entire pane width.
- **10X ticks:** same geometry but ~14px tall, olive-chartreuse core `#6ea115`/`#6a9c16` with dimmer `#577f17` edge ticks at run boundaries; runs span dozens of bars.
- **Embedded markers:** yellow 2x2 diamond cluster `#ffeb3b` sitting IN the rail at key bars; red 4-point sparkle `#e60000` and small red `OB` dash-stack floating just above the rail (these are the Nautilus signal layer coinciding with 10X windows).
**Color system:** two-state rail: inactive `#21242d` vs active chartreuse `#6ea115` (single hue, edge ticks dimmer); chartreuse deliberately sits between the bull-green and warn-yellow families = "heightened activity, direction-agnostic". `#ffeb3b` diamond = strongest confluence.
**States & variants:** active runs vs inactive baseline only; run edges fade via the dimmer edge tick. Directional coloring: not visually verified (both rally and selloff windows light the same chartreuse).
**Interaction affordances visible:** none.
**Adaptation notes for our terminal:**
- Implement as a per-bar boolean lane with intensity ramp-in/out; use a neutral "activity" token (our chartreuse equivalent), NOT the up/down pair — it is direction-agnostic.
- Always draw the dark baseline ticks: the contrast between baseline and lit run is the entire affordance.
- On mobile collapse tick pitch to bar pitch and clamp height to ~10px; keep runs merged, not per-tick.
- Great candidate to reuse across panes (volume pane, price pane top rail) — keep the rail y-position configurable.

## Volume Mapping — visual spec
**Source doc:** https://docs.bigbeluga.com/main-toolkits/nautilus-oscillator-pro-tm/volume-mapping - **Images studied:** 3 of 3
**Reference image URLs:**
- (hero) https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252Fz9hGhZWSmJlk69bbONEE%252Fimage.png%3Falt%3Dmedia%26token%3D8be0a92c-dd4a-4f49-9548-06d57666d309&width=768&dpr=3&quality=100&sign=be8886e5&sv=2
- (green-closeup) https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FOA2WXSH9vLddTmqWlOUc%252Fimage.png%3Falt%3Dmedia%26token%3D38153cd0-1055-4757-9eb3-102327689ecc&width=768&dpr=3&quality=100&sign=75e82477&sv=2
- (red-closeup) https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FTQx7UaW669BDcJ4vpdWv%252Fimage.png%3Falt%3Dmedia%26token%3D964317a6-8095-43a9-95d7-879bef0c64d3&width=768&dpr=3&quality=100&sign=1d30bbe9&sv=2

**Canvas anatomy:** The mirror of the 10X rail: a full-width tick rail pinned to the BOTTOM of the oscillator pane (below the line's troughs). Every bar gets exactly one tick, colored by dominant volume side, so the rail reads as alternating red/green runs under the whole oscillator. Long uptrends show unbroken green runs (the doc's annotated regions); downtrends unbroken red.
**Element inventory:**
- **Volume ticks:** vertical bars ~2px wide, ~10px tall, one per chart bar (pitch = bar spacing; in the vendor's zoomed crops pitch ~9px). Uniform height — no magnitude encoding visible.
- **Bullish tick:** bright green `#02d06d` (closeup value); rendered in-chart at reduced opacity — sampled on-chart ≈ `#096d43` over bg (~45-50% alpha of the same hue).
- **Bearish tick:** red `#ca303e` (closeup); on-chart ≈ `#5b0e12`-`#610d11` (same ~45% alpha treatment).
- Rail coexists with the Nautilus OS glyph lane; `OS` dash-stacks and green sparkles render just above the rail.
**Color system:** strictly two-state bull/bear pair (`#02d06d` / `#ca303e`) at low opacity so the rail stays ambient; no neutral state observed (every bar is colored), no intensity ramp.
**States & variants:** bullish vs bearish per bar only. Mixed/neutral tick: not visually verified. Magnitude tiers: not visually verified (uniform height everywhere).
**Interaction affordances visible:** none.
**Adaptation notes for our terminal:**
- Use our locale-aware up/down tokens at ~45% opacity; full-opacity ticks (closeup values) only on hover/focus.
- Keep this rail and the 10X rail on opposite pane edges as the vendor does — together they frame the pane; reserve top=activity, bottom=sentiment.
- Consider adding height = relative volume as an improvement (vendor doesn't); cap at 14px to protect the trough glyph lane.
- At mobile density render runs as a continuous 2-3px strip with color segments instead of discrete ticks.

## Nautilus Map — visual spec
**Source doc:** https://docs.bigbeluga.com/main-toolkits/nautilus-oscillator-pro-tm/nautilus-map - **Images studied:** 1 of 1
**Reference image URLs:**
- (map+10x) https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252Fu6NwMiIUS4na6LAwQzNB%252Fimage.png%3Falt%3Dmedia%26token%3Dd1916f90-f1e2-4046-8d08-874f30cb2c96&width=768&dpr=3&quality=100&sign=8c7791ab&sv=2

**Canvas anatomy:** Shown on an intraday chart: the oscillator pane is sliced into equal daily sections by full-height vertical divider lines (~12 dividers across the viewport, evenly spaced at session boundaries). A horizontal midline — noticeably brighter here than in other modules — crosses the whole pane, so the grid reads as a "map" of day-cells above/below zero. The 10X chartreuse rail runs along the pane top simultaneously (the doc's featured pairing), with red sparkles above it and `OS` dash glyphs at troughs.
**Element inventory:**
- **Day dividers:** 1px vertical lines, teal-cyan sampled `#039eb4`, spanning the full oscillator pane height (they do not extend into the price pane); rendered dim enough that the line and glyphs stay dominant.
- **Midline:** 1px horizontal, brighter teal than other shots — sampled `#086c7d`/`#0a5666` (vs `#0e2934` elsewhere), full width.
- **10X rail:** as specced above (`#6ea115` active runs over `#21242d` baseline ticks) — active runs visibly align with specific day-cells, e.g. lighting up 2-3 consecutive sessions.
- **Nautilus line + signal glyphs:** unchanged from the main module (4-phase colors, `#e60000` sparkles, green `OS` stacks).
**Color system:** the Map adds only structural chrome, one cyan-teal family: dividers `#039eb4` (~1px, reads ~40% bright), midline `#086c7d`. Everything else inherits the Nautilus/10X palettes.
**States & variants:** none observed — dividers are uniform (no alternating day shading, no weekend/holiday variant visible). Highlighted "exceptional day" cell fills: not visually verified (highlighting comes solely from the 10X rail).
**Interaction affordances visible:** none.
**Adaptation notes for our terminal:**
- Use our session-boundary API for divider placement (we already compute session opens); draw at ~35-40% of an `--accent-teal`/grid token, 1px, oscillator pane only.
- Brighten the pane midline one step when Map mode is on, as the vendor does — it turns the pane into readable quadrants per day.
- Consider faint alternating day-cell background tint (bg +2-3% luma) as an improvement for mobile, where 1px dividers may alias out.
- Keep dividers behind ALL other layers (rail, line, glyphs) in z-order.

---

# 12 — Nautilus Oscillator Pro: Money Flow, Volume Flow, Divergence Detection, Signals, Signals Dashboard

All screenshots share one environment: TradingView dark chart, background `#10131c`, price candles in the pane above (up candles teal-green ~`#22ab94`, down candles red ~`#f23645`), indicator in a sub-pane below with a faint 1px teal-gray midline (~`#1f3a3a` at low opacity). The Nautilus family look = neon glow on near-black. White block arrows (solid white, triangular head + rectangular stem, ~20–24px) that appear in shots are doc annotations pointing at signals, not indicator output — except where noted. Local image copies: `/private/tmp/claude-501/-Users-chriswong-Documents-Cluade-charting-app/4efc3e7e-13c7-40a7-a091-5fb8f5049d43/scratchpad/specs/img/12-nautilus-signals/`.

## Money Flow — visual spec
**Source doc:** https://docs.bigbeluga.com/main-toolkits/nautilus-oscillator-pro-tm/money-flow - **Images studied:** 3 of 4
**Reference image URLs:**
- hero: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252F7aXt1NxaddEnluUxH1re%252Fimage.png%3Falt%3Dmedia%26token%3Dddc4604f-f329-40b8-8345-ef5ed0d552f2&width=768&dpr=3&quality=100&sign=674ba59a&sv=2
- outflow: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FbGBkpiWYzhc9TPMw0g7o%252Fimage.png%3Falt%3Dmedia%26token%3De68ba312-412f-4a5e-bd23-3769ea14f8ef&width=768&dpr=3&quality=100&sign=6d38bce1&sv=2
- inflow: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FWDMcG4xPQfDcC20bcAZG%252Fimage.png%3Falt%3Dmedia%26token%3D085cf87e-a3e5-4284-a51f-b845e47877df&width=768&dpr=3&quality=100&sign=b54a7eb&sv=2

**Canvas anatomy:** Sub-pane below price. A single smooth area-oscillator ("mountain silhouette") oscillates around a zero midline that runs full width. The positive lobe rises above zero as a green mass; the negative lobe hangs below zero as a magenta mass. No axis labels, no gridlines, no OB/OS bands visible — just the shape against near-black. In the Signals Dashboard hero, this same green wave is rendered as a translucent background layer inside the main oscillator pane (fill ~`#0c4930`), behind the neon line.

**Element inventory:**
- Zero midline: 1px, faint desaturated teal-gray (~`#233a3a`), full pane width.
- Positive lobe: filled area, edge/stroke a mid-forest green (brightest sampled edge ~`#0b663b`, perceptually up to ~`#0f7a45` at lobe peaks), interior fill darker ~`#0e382a`. Fill intensity grows toward the lobe extreme (vertical gradient from near-transparent at zero to saturated at the crest), giving a soft self-glow at peaks; no hard stroke line separate from the fill.
- Negative lobe: mirrored construction; bright magenta-crimson edge (~`#c2185b` family; sampled edge `#7b0c49`) with dark plum interior ~`#301129`; at the zero-crossing transition a violet cast is visible (fill reads purple right under the line, magenta at the depths).
- Doc-annotation chrome seen in shots (not indicator output): white curved swoosh arrows; state captions "Money outflow" in bold magenta `#c2185b` and "Inflow of money" in bold dark sea-green `#056656`, large (~34px) sans, sentence case.
- Divergence markers on MFI (doc fig 4, bullish/bearish divergence lines plotted on the oscillator): not visually verified.

**Color system:** bull/inflow = green ramp `#0e382a → #0b663b → #0f7a45` (fill→edge); bear/outflow = magenta ramp `#301129 → #7b0c49 → #c2185b`; neutral = background `#10131c` + midline `#233a3a`. Gradients run vertically, anchored at zero, intensifying toward each lobe extreme.

**States & variants:** Only two states: above zero (green, inflow) and below zero (magenta, outflow). Same geometry both sides; hue is the entire state encoding. No mitigated/filled variants.

**Interaction affordances visible:** none (no tooltips, handles, or hover chrome in any shot).

**Adaptation notes for our terminal:**
- Map green→`--up`-semantic "inflow" token and magenta→`--down`-semantic "outflow" token; do not hardcode — zh locale flips up/down colors, and magenta-vs-red distinction from candles should be preserved (their outflow magenta is deliberately NOT candle red).
- Implement as area series with vertical alpha gradient keyed to |value|; single polyline + two gradient fills is enough.
- Keep the zero line at ≤25% opacity; it must not compete with the lobes.
- Mobile: the shape reads fine small; drop nothing, but ensure the fill alpha floor ≥0.15 so thin lobes stay visible on low-brightness screens.

## Volume Flow — visual spec
**Source doc:** https://docs.bigbeluga.com/main-toolkits/nautilus-oscillator-pro-tm/volume-flow - **Images studied:** 3 of 3
**Reference image URLs:**
- hero: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FBjOEcyLAAGZdBIt8Oj2e%252Fimage.png%3Falt%3Dmedia%26token%3Dad587efa-e50a-4cac-98c7-14208cc3fb1a&width=768&dpr=3&quality=100&sign=38b15833&sv=2
- shades: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FleDgUqHF0aN0baDcCuaM%252Fimage.png%3Falt%3Dmedia%26token%3Da87c69c0-fce0-4a1b-b6ca-323f2392938c&width=768&dpr=3&quality=100&sign=2c8a54e2&sv=2
- divergence: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FSrfRkXU8yJmDWWzThsGQ%252Fimage.png%3Falt%3Dmedia%26token%3D68c6d97c-c52c-4112-9606-c9bb06d5b4f6&width=768&dpr=3&quality=100&sign=96cb2b0&sv=2

**Canvas anatomy:** Sub-pane histogram of thin vertical bars anchored to a zero baseline, forming smooth bell/wave-shaped clusters (CVD converted to oscillator). Green clusters above zero, magenta clusters below. Divergence trendlines are drawn straight across cluster extremes; no other chrome.

**Element inventory:**
- Bars: ~2–3px wide with ~1px gaps (one per candle), flat color per bar, square ends, baseline-anchored both directions.
- Bright green bar `#19d67b` = fast bullish expansion; dark green bar `#15744c` = bullish cooling. Bright magenta `#f12190` = fast bearish expansion; dark magenta `#811a56` = bearish cooling. Brightness switches bar-by-bar (velocity encoding), so one lobe typically runs dark→bright→dark across its arc.
- Divergence connector lines, 1–2px straight segments joining histogram extremes: crimson-pink line across two upper peaks (bearish, `#f12190`/crimson family), bright green line across two lower troughs (bullish, ~`#38e09b`), and in the divergence close-up additionally a sky-blue/cyan line `#04aec4` joining a lower-high pair of peaks. No text labels on the lines.
- Zero baseline: same faint 1px line as Money Flow.

**Color system:** Two-tone-per-side intensity ramp: bull `#15744c` (cooling) → `#19d67b` (expanding); bear `#811a56` (cooling) → `#f12190` (expanding); connector accents: bearish crimson-pink, bullish spring green `#38e09b`, cyan `#04aec4` secondary; background `#10131c`.

**States & variants:** Four bar states (side × velocity) exactly per the doc's Bright/Dark Green, Bright/Dark Magenta. Divergence lines add bull/bear (green/pink) and a cyan variant (semantic not captioned in-image — likely a second divergence class; treat as configurable accent).

**Interaction affordances visible:** none.

**Adaptation notes for our terminal:**
- Encode side with locale-aware up/down tokens and velocity with a 2-step luminance ramp of the same token (bright = expanding, ~55% luminance drop when cooling) rather than 4 hardcoded hexes.
- Bar width should track bar spacing (match candle width ×0.6) instead of fixed px, so density scales on mobile pinch-zoom.
- Draw divergence connectors as an overlay layer above bars, 1.5px, no glow, with round caps.
- Their magenta reads "bearish" without colliding with candle red — worth keeping as a distinct "flow-bear" token in our palette.
- Skip anti-aliased 1px gaps below ~2px bar pitch on mobile: collapse to a contiguous area to avoid moiré.

## Divergence Detection — visual spec
**Source doc:** https://docs.bigbeluga.com/main-toolkits/nautilus-oscillator-pro-tm/divergence-detection - **Images studied:** 4 of 5
**Reference image URLs:**
- normal-bearish: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FOsrlQVTGnSIPU1zCJdKY%252Fimage.png%3Falt%3Dmedia%26token%3D38dbeaf0-fdaa-4c01-8582-82c6e7832f2d&width=768&dpr=3&quality=100&sign=826b89ce&sv=2
- normal-bullish: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FpIan5lcMGhz4i5dthuLf%252Fimage.png%3Falt%3Dmedia%26token%3D89fd87aa-e7d4-4bad-a5c4-9e897e84958d&width=768&dpr=3&quality=100&sign=13336a57&sv=2
- hidden-bullish: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252Fw49jlmYhDuwwU7Ialn73%252Fimage.png%3Falt%3Dmedia%26token%3Dc80d22f1-87d6-440a-8b7e-7562e4ad90b1&width=768&dpr=3&quality=100&sign=17605d02&sv=2
- multiple: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FqvEUbuna88Xjy1rBkmdI%252Fimage.png%3Falt%3Dmedia%26token%3D6e489a24-8655-49e5-bf3e-b06c2bebef44&width=768&dpr=3&quality=100&sign=89c1aa30&sv=2

**Canvas anatomy:** The Nautilus oscillator itself: one smooth 2–3px polyline in the sub-pane, colored per momentum state in segments, each segment carrying an outer neon glow (same hue, ~4–6px blur, low opacity). Divergence connectors are straight 1–1.5px lines drawn point-to-point across oscillator swing extremes; a solid white block arrow (indicator output here — it appears in every divergence example at the confirmation swing) sits just beyond the second swing point (below lows pointing up, above highs pointing down).

**Element inventory:**
- Oscillator line segments: azure `#08aeea` (strong rise/upper region), crimson `#c71c39`→`#f23645` glow core (falls), spring green `#2af598` (rises out of lows/near zero), magenta (short transitional pieces at inflections, ~`#d81bc9` family — matches the `#c20bb5` ribbon magenta seen in the dashboard hero). Rounded joins, continuous path, glow halo on every segment.
- Normal Bearish connector: paired nearly-parallel lines peak-to-peak — crimson-pink (~`#ec2050`) + cyan (`#04aec4`) — converging at both endpoints, slightly separated mid-span (zoom-verified). Reads as "two divergence events sharing endpoints"; ship as: bearish connector = crimson, secondary/confirmation connector = cyan.
- Normal Bullish connector: bright spring-green line(s) `#38e09b` trough-to-trough; in both bullish examples two green lines fan from one shared origin low to two later lows.
- Hidden Bullish connector: pale desaturated green `#81c784`, single line, visibly softer/lighter than the normal-bullish green.
- Hidden Bearish: not visually verified (not downloaded).
- Multiple divergence: fans of ≥2 connectors from one anchor. Bullish fan = 2 bright green lines. Bearish fan = 2 cyan `#04aec4` lines from a shared first peak; that anchor peak carries a small yellow dot (~7px, `#b8d934`–`#fdd835` family) and a green dot `#31d83a` marks the intervening trough. White doc captions "Multiple Bearish" / "Multiple Bullish" with white block arrows.
- Confirmation marker: solid white block arrow ~14×20px (head ~60% of height), no outline, no glow.

**Color system:** bull-normal `#38e09b`; bull-hidden `#81c784` (same hue desaturated ~40%); bear-normal crimson `#ec2050`; bear-secondary/multiple cyan `#04aec4`; extreme dots yellow `#fdd835` (peak) / green `#31d83a` (trough); white `#ffffff` for arrows/captions.

**States & variants:** Normal vs hidden = saturation tier of the same hue (saturated = reversal, pale = continuation). Single vs multiple = one connector vs fan from shared anchor. No mitigated/expired styling appears — connectors persist as drawn.

**Interaction affordances visible:** none on-chart.

**Adaptation notes for our terminal:**
- Encode divergence class as {direction token} × {saturation tier}; derive the pale "hidden" variant by mixing the base token toward the pane background ~45% rather than a second hardcoded hue.
- The white block arrow is the strongest at-a-glance element; keep it theme-aware (near-white on dark, near-black on light theme).
- The state-segmented neon line is the toolkit's identity; implement glow as a second stroke pass (same path, 3× width, 15–20% alpha) — cheap on canvas, no shader needed.
- Cap connector count per anchor (2) and prefer the most recent two on mobile to avoid spaghetti.
- Our locale-aware pair must drive green/crimson; cyan can map to our `--act` accent.

## Signals — visual spec
**Source doc:** https://docs.bigbeluga.com/main-toolkits/nautilus-oscillator-pro-tm/signals - **Images studied:** 5 of 6 (skipped: settings dialog)
**Reference image URLs:**
- buysell: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FZkC6FYPS3dSygojfVM73%252Fimage.png%3Falt%3Dmedia%26token%3D39a6a8c8-759d-4a24-82fd-f889267e12f9&width=768&dpr=3&quality=100&sign=834f6153&sv=2
- diamonds: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FcRT74AFvnJg4UB1mk57f%252Fimage.png%3Falt%3Dmedia%26token%3Df5117d18-274f-47ca-9025-95774c7063ba&width=768&dpr=3&quality=100&sign=8d3cb124&sv=2
- peaks: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FYETm7dnFGSS7rmVboVhK%252Fimage.png%3Falt%3Dmedia%26token%3D1196e9ba-9e4f-491e-aeae-beebde6cb525&width=768&dpr=3&quality=100&sign=e6e5a9df&sv=2
- obos: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FHnc5FJ5UOD9jBYG05Mth%252F2025-10-20_19-55.png%3Falt%3Dmedia%26token%3D470577b3-a812-4ee7-9133-db89a8e9a436&width=768&dpr=3&quality=100&sign=99cb621c&sv=2
- gapped: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FJAWDgqLqe7zb0DDT2OGX%252Fimage.png%3Falt%3Dmedia%26token%3D54459159-a374-4e2b-a780-3feed611a954&width=768&dpr=3&quality=100&sign=607a6b90&sv=2

**Canvas anatomy:** All signal glyphs live in the oscillator sub-pane, in two glyph lanes: a bottom lane under oscillator troughs (bullish) and a top lane above peaks (bearish). Peak dots sit directly ON the line. The Gapped variant turns the single line into a two-line ribbon with filled spread.

**Element inventory:**
- Buy/Sell reversal marker: "triple lines" = three stacked short horizontal dashes (☰), green `#00e676` below / red `#f23645`-family above; consecutive qualifying bars each print one ☰ so they appear as 2–3 groups side-by-side. Label text "BUY" (green) / "SELL" (red `#e60000` sampled) in small bold uppercase sans beyond the glyphs (visible in dashboard hero as indicator output too).
- DipX diamonds: tiny 4-point sparkle/diamond (✦, ~7px): bullish green `#00e676` in bottom lane; bearish red `#ff5252` in top lane.
- Peak dots: ~8px filled circles ON the polyline at local extremes — trough dot green `#31d83a` (bullish peak signal), crest dot yellow `#fdd835` (bearish peak signal).
- OB/OS exhaustion diamonds: small yellow `#ffeb3b` diamond-with-center-dot glyph (◈, reads as hollow diamond + pip, ~8px), bottom lane = oversold, top lane = overbought.
- Gapped Nautilus: second oscillator line tracking the first with a lag/gap; the spread between lines is filled — descending stretches red (fill ~`#7a2d34`, i.e. crimson at ~40–50% alpha), rising upper-region stretches dark teal-blue `#0d3743`, low-region rises dark green `#122928`; both edge lines keep the neon state colors. Cross markers where the lines cross inside extreme zones: solid orange diamond `#ff6600` at overbought crossings, solid green diamond `#24f38e` at oversold crossings (~8px rotated squares).
- In the dashboard hero the top/bottom pane edges also carry momentum heat ribbons: top strip magenta `#c20bb5` segments with chamfered/slanted joints and brightness steps, orange `#c95f00` burst segments at extremes; bottom strip teal `#26dcbd` with orange bursts. (Rendered by the same indicator; shown on the Signals-family pane.)

**Color system:** bull `#00e676`/`#24f38e`/`#31d83a` greens; bear `#f23645`/`#ff5252`/`#e60000` reds; exhaustion/warn yellow `#ffeb3b`–`#fdd835`; gapped-cross alert orange `#ff6600`; ribbon magenta `#c20bb5` + teal `#26dcbd` + burst orange `#c95f00`; fills at 40–50% alpha over `#10131c`.

**States & variants:** Direction = green vs red mirror across the two lanes; signal families are distinguished by glyph shape (☰ reversal, ✦ dip, ● peak-on-line, ◈ exhaustion, ◆ gapped cross), not by size tiers. Gapped signals are default-off (settings toggle; dialog not downloaded).

**Interaction affordances visible:** none.

**Adaptation notes for our terminal:**
- Keep one glyph vocabulary: shape = signal family, color token = direction, lane = polarity; never encode two things in color alone.
- Yellow is used for BOTH "peak" dots and OB/OS diamonds — map both to our `--warn` token, distinct from up/down pair.
- ☰ marker: render as 3 dashes of bar-width length; on mobile collapse consecutive duplicates into one glyph with a ×n badge to save horizontal space.
- Spread fill for gapped mode: 45% alpha of the direction token, drawn under both lines.
- "BUY"/"SELL" text labels should use our caps micro-label style (10–11px, 600 weight) and be suppressible at high glyph density.

## Signals Dashboard — visual spec
**Source doc:** https://docs.bigbeluga.com/main-toolkits/nautilus-oscillator-pro-tm/signals-dashboard - **Images studied:** 6 of 12 (skipped: settings dialog + 5 redundant row close-ups)
**Reference image URLs:**
- hero: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FJgRqbg3zxhgpZa8AY0Wg%252Fimage.png%3Falt%3Dmedia%26token%3Dd4f5bb64-084a-4b0f-add6-e549aba9fd17&width=768&dpr=3&quality=100&sign=65954fb0&sv=2
- signalsrow: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252F7vSOEg5uu757lFAaniqz%252Fimage.png%3Falt%3Dmedia%26token%3D08145d8f-1552-4ae4-a663-9de23fb31abb&width=768&dpr=3&quality=100&sign=623a00bb&sv=2
- extremerow: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252F27a3ljmHV9WgtDpdyKIL%252Fimage.png%3Falt%3Dmedia%26token%3D98161614-910a-48bd-9b13-1b358e11bea5&width=768&dpr=3&quality=100&sign=2b053e74&sv=2
- trendrow: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FwOFhFuIkb0UkV7umDpUn%252Fimage.png%3Falt%3Dmedia%26token%3D2fef2ca9-01d2-4a74-b620-c3a1b8a6b2a6&width=768&dpr=3&quality=100&sign=ad6cc689&sv=2
- mfirow: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FGWF6PH3xqXKigJBfG8d7%252Fimage.png%3Falt%3Dmedia%26token%3D96e709de-9ec0-47b9-9d33-34863ca61962&width=768&dpr=3&quality=100&sign=76876945&sv=2
- tooltip: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FKRDYd3P5MtHtapEx4xd4%252Fimage.png%3Falt%3Dmedia%26token%3D180c79b1-88a5-4ab8-b603-3c9504822793&width=768&dpr=3&quality=100&sign=be08f2c8&sv=2

**Canvas anatomy:** A fixed table anchored top-right of the price pane, floating over the chart. Header row "Metrics Matrix" + up to 6 timeframe columns ("5m" "15m" "1h" "4h" "D" "2D"). Seven metric rows: "Signals (Buy/Sell)", "Normal Divs", "Hidden Divs", "Extreme (OB/OS)", "Trend Sync", "Money Flow (MFI)", "MFI Divergences". Every data cell is a solid color chip; ~2px dark gutters between cells; flat rectangles (no visible corner radius); row height ~28–30px.

**Element inventory:**
- Header + row-label cells: dark slate `#1f222e` bg, white bold sans (TV table font, ~13–14px).
- Sphere icon: glossy ball ~13px with top-left specular highlight — green (base ~`#2ecc71`, highlight `#6ffca6`) or red (base ~`#e5405e`, highlight `#ff6280`), leading the cell text.
- Signals row: green sphere + "BUY" white bold on teal chip — bright `#0a6b5f` vs dim `#0e3737` variants both appear (dimmer chips accompany older/other-TF signals). "SELL" state: red-sphere/red-chip counterpart presumed — not visually verified.
- Normal/Hidden Divs rows: "Bull" on green-teal chip `#0c554f` with green sphere; "Bear" on crimson chip (bright `#9d2835` / dim `#6f222d`, darkest `#4a1d24`) with red sphere.
- Extreme row: warning-triangle icon (golden-yellow ⚠ with dark "!") + "OS" on crimson chip `#992835` or "OB" on amber chip `#8b570e`/`#82530f` (a much darker amber `#483315` variant also appears).
- Trend Sync row: "▼ Bear" white on purple chip `#6a0f6a`; "▲ Bull" white on teal chip `#1b776d` (unicode solid triangles inline with text).
- Money Flow row: 4-state encoding — sphere color = side of zero (green above / red below), text sign = momentum: "+MFI" / "-MFI"; chip bg follows sphere: dark green `#22422c` or dark maroon `#541d29`. So a green sphere with "-MFI" = bullish-but-cooling (verified in close-up).
- MFI Divergences row: "MFI Div" on teal chip `#0e3637` (green sphere) or crimson chip (red sphere) for bearish.
- Empty state: "-" gray dash centered on neutral `#2c303b` chip.
- Tooltip (hover): dark-gray rounded box `#3d3d3d` (~4px radius) with near-white `#f2f2f2` text, e.g. "Normal Bullish Divergence 42 bars ago".

**Color system:** bull chips teal-green ramp `#0e3737→#0c554f→#0a6b5f`; bear chips crimson ramp `#4a1d24→#6f222d→#9d2835`; MFI side-chips `#22422c` green / `#541d29` maroon; warn amber `#82530f–#8b570e`; trend purple `#6a0f6a` (bear) vs teal `#1b776d` (bull); neutral `#1f222e`/`#2c303b`; all text white.

**States & variants:** Per cell: active bull / active bear / empty "-" (signal aged past lookback buffer). Chip brightness varies (bright vs dim of same hue) across timeframes — recency tiering, exact rule not documented. MFI/CVD rows carry the 4-state matrix (side × momentum). CVD row ("VolumeFlow (CVD)" with "+CVD"/"-CVD" labels): same construction as MFI row — not visually verified (close-up not downloaded).
**Interaction affordances visible:** hover tooltip on any filled cell reporting signal type + age in bars; settings expose position/size/6 TF toggles (dialog not downloaded).

**Adaptation notes for our terminal:**
- Rebuild as an HTML overlay (not canvas): chips = flex row cells with tokenized bgs; far easier i18n and hover than TV's table primitive.
- Map: bull-chip→`--up`-tinted surface, bear-chip→`--down`-tinted surface, OB/OS→`--warn` surface, trend-purple→a dedicated "regime" token (do NOT reuse `--down`); keep text white on all chips (their contrast holds because chips are 30–60% luminance).
- Replace glossy spheres with flat dots or our status-dot component; keep the sign-prefix microcopy ("+MFI"/"-MFI") — it is the cleverest bit of the design (two axes in one cell).
- Per regime-dynamics law, our version should always pair state with age — surface the "N bars ago" from the tooltip as an inline dim suffix on desktop.
- Mobile: 7×6 chips won't fit; collapse to the chart's active TF column + a horizontally scrollable TF strip, and drop row labels to icon+abbrev.
- Respect zh locale color flip via tokens; never hardcode green=bull in chip styles.

---



# PART IV — RSI / MACD Ultimate visual references

# 13 — Ultimate RSI Suite (BigBeluga) — visual design spec

Shared context for all five modules: dark theme, chart background `#10131c`; candles are TradingView-classic teal `#089981` (up) / red `#f23645` (down); the RSI renders in its own sub-pane below price, separated by a 1px `#2e2e2e` divider. All hexes sampled from doc screenshots; treat as approximations of the vendor look, not as our tokens.

## RSI Engine — visual spec
**Source doc:** https://docs.bigbeluga.com/ultimate-suite/ultimate-rsi-suite/rsi-engine - **Images studied:** 4 of 6 (2 skipped were settings-frame crops)
**Reference image URLs:**
- hero: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252F0aPD34BYLPCwlMit7dte%252Fimage.png%3Falt%3Dmedia%26token%3D74490734-6c8f-4eb0-bfa0-f637cd2e91cf&width=768&dpr=3&quality=100&sign=666b97f8&sv=2
- smoothing: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FkCH1bXYHkOOUtlbPsYw4%252Fimage.png%3Falt%3Dmedia%26token%3D9eccf558-41b0-48be-9c6e-65758990edaa&width=768&dpr=3&quality=100&sign=bfb3028d&sv=2
- zones: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252F3WftRYMBbhXol85jcCxU%252Fimage.png%3Falt%3Dmedia%26token%3D10632059-2cbc-42c9-b81a-69677e02659e&width=768&dpr=3&quality=100&sign=aa32e909&sv=2
- settings-crop: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FA7xVNuTKBoJbzyxhWHm1%252Fimage.png%3Falt%3Dmedia%26token%3D3b587cee-3233-4395-af50-e343f9ba1333&width=768&dpr=3&quality=100&sign=a1ec0d07&sv=2

**Canvas anatomy:** Price candles occupy the upper ~60% of the frame; the RSI Engine pane sits below the divider and fills the rest. Inside the pane: a horizontal indigo "neutral band" spans full width between the OS (35) and OB (65) levels with a dashed midline at 50; a single value-colored RSI polyline weaves through it, growing gradient area-fills only where it exits the band; an optional thick yellow smoothing MA rides over the RSI line.

**Element inventory:**
- RSI line: ~1.5–2px polyline whose stroke color is a continuous function of RSI value — red `#f23645` at the top of range, muted olive-gold `#6e6440`–`#a1780f` around the 50 area, green `#4caf50` at the bottom. The color transition happens along the line (per-segment gradient), never a hard switch.
- Area fill (overbought): rendered only while the line is above the band top; fills from the line DOWN to the 65 level. Vertical gradient anchored at the line: `#d1313f` at the line fading linearly to transparent at the band edge (sampled ramp `#d1313f → #a22936 → #72222e → #2a1721 → bg`).
- Area fill (oversold): mirror image below the band bottom; green ramp from `#3b8442` at the line fading to transparent at the 35 level.
- Neutral band: full-width rectangle between 35 and 65. It is NOT a flat fill — a deep-indigo glow `#241a44` is anchored at each boundary and fades to transparent toward the 50 midline (double edge-anchored vertical gradient; in short panes it visually merges into one indigo stripe). No border strokes on the band.
- Midline: 1px dashed light-gray line at 50, ~40% opacity, spanning full pane width (extends into empty right margin too).
- Smoothing MA: thick (~3–4px) smooth polyline, flat bright yellow `#fdd835`; drawn over band and fills, under nothing. Docs: types SMA/EMA/SMMA(RMA)/WMA/VWMA, "Default color: Yellow".
- Settings microcopy seen: "➤ RSI OVERBOUGHT/OVERSOLD", "OB/OS" with inputs "65" and "35".
- Zones doc image contains solid white ⬇/⬆ arrows pointing at the 65/35 boundaries — documentation callouts, not indicator chrome.

**Color system:** bull/oversold = green `#4caf50` (fill ramp to `#3b8442`); bear/overbought = red `#f23645` (fill ramp from `#d1313f`); neutral = olive-gold `#6e6440`; band = indigo `#241a44` on `#10131c` bg; accent/MA = yellow `#fdd835`. Gradients: fills fade line→band-edge; band glow fades edges→midline.

**States & variants:** the whole module is state-driven by value: above-band = red line + red fill, in-band = dim olive line and no fill, below-band = green line + green fill. With smoothing enabled the yellow MA is added. No mitigated/filled lifecycle here.

**Interaction affordances visible:** none (no tooltips/labels in the pane).

**Adaptation notes for our terminal:**
- Map to tokens: their red/green pair → our locale-aware down/up pair (note zh locales flip up/down colors — use semantic bull/bear tokens, not literal red/green); indigo band → a neutral "zone" token at ~15–25% alpha; yellow MA → accent token.
- Implement line coloring as a vertical gradient stroke keyed to pane y (value), not per-segment recolor — cheaper and matches the look.
- The edge-anchored band glow reads as premium; acceptable simplification is a flat 12–15% alpha band plus 1px dashed 50 line.
- Cap fill alpha ~80% at the line; keep fills OUTSIDE the band only, else the pane muddies.
- Mobile: keep band + line; drop the fill gradient below ~360px pane width if perf-bound, keep flat 30% fill.

## RSI Signals — visual spec
**Source doc:** https://docs.bigbeluga.com/ultimate-suite/ultimate-rsi-suite/rsi-signals - **Images studied:** 4 of 6 (2 skipped were settings-frame crops)
**Reference image URLs:**
- hero: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FgqwVpKLpW5ibUb7SEPiA%252Fimage.png%3Falt%3Dmedia%26token%3D71f1599c-ab47-4d6d-b4c8-5dec34c5df00&width=768&dpr=3&quality=100&sign=51fb80bc&sv=2
- on-chart-markers: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FrjUSwVDtxMHNjQBUAVc7%252Fimage.png%3Falt%3Dmedia%26token%3D5edb77e8-2a32-435f-b8bd-0d013488b1ac&width=768&dpr=3&quality=100&sign=63763b30&sv=2
- deviation-levels: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FjPWWCmTWZ8CZF0NgLkQp%252Fimage.png%3Falt%3Dmedia%26token%3Db28c4f32-9287-4684-8525-1c5fabc1eb33&width=768&dpr=3&quality=100&sign=812a815b&sv=2
- yellow-dots+settings: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FhGCDnvAD6saOFD1GAuk2%252Fimage.png%3Falt%3Dmedia%26token%3Db42a863f-64eb-4df5-8066-ef9235bfe4a7&width=768&dpr=3&quality=100&sign=f5a53e8f&sv=2

**Canvas anatomy:** Same Engine pane underneath; Signals adds (a) triangle reversal markers floating above red RSI peaks and below green RSI troughs inside the pane, (b) optional matching triangles on the price chart above swing highs / below swing lows, (c) optional "+1"/"+2" horizontal projection levels drawn on the PRICE chart from a signal, (d) small yellow crossover dots on the RSI line.

**Element inventory:**
- Bearish reversal marker: solid red `#f23645` down-triangle ▼, ~12–14px wide, flat-shaded, no stroke/glow, floated a fixed ~20–30px gap ABOVE the local RSI peak (never touching the line).
- Bullish reversal marker: solid green `#4caf50` up-triangle ▲, mirrored below the RSI trough. On the price chart the same triangles sit just below candle lows / above candle highs at the signal bar (slightly smaller, ~10px).
- Deviation levels (price chart): thin (~1–2px) near-white `#dbdbdb` horizontal segments starting near the signal bar and extending right roughly half a pane width; label "+1" / "+2" in plain white text (~13px, no chip/background) left of the line start, vertically centered. For the bullish case shown, +1 sits above the signal candle and +2 higher still.
- Deviation level states: untouched = solid stroke; touched by price = dashed stroke (~8px dash). In the studied image "+2" is solid, "+1" is dashed and price has traded through it. (Docs confirm: level turns dashed once price touches it.)
- Crossover dots: solid yellow `#fdd835` circles ~8–9px on the RSI polyline exactly at RSI×signal-MA crosses, plotted only when outside the neutral band (red zone above / green zone below). Same yellow as the signal MA line.
- Settings dialog seen: title "Ultimate RSI Suite [BigBeluga]", tabs "Inputs | Style | Visibility", section "➤ RSI SMOOTHING", "Type WMA", length "3", yellow swatch.

**Color system:** bull = `#4caf50`, bear = `#f23645` (same pair as Engine fills but full-opacity flat); execution/crossover accent = yellow `#fdd835`; deviation levels = neutral white `#dbdbdb`. No gradients on markers.

**States & variants:** bullish vs bearish is purely mirror geometry + color swap. Deviation levels have a two-state lifecycle (solid=pending → dashed=hit). Docs describe pane-only vs pane+price display modes; both verified in images.

**Interaction affordances visible:** none beyond alerts implied by docs ("each deviation level can trigger its own alert").

**Adaptation notes for our terminal:**
- Use our semantic up/down tokens for triangles; keep them flat, small and un-glowing — the restraint is what keeps the pane readable.
- Encode the +1/+2 solid→dashed transition; it is the only "consumed" state in this module and traders rely on it. Consider adding a subtle check/opacity drop on hit as an improvement.
- Yellow dot + yellow MA both map to one "accent" token; ensure dot has 1px bg-colored stroke on mobile so it separates from the MA line.
- Mobile: min tap/visual size ~8px for triangles; collapse price-chart duplicates of markers below 480px width and keep pane markers only.

## RSI Divergence — visual spec
**Source doc:** https://docs.bigbeluga.com/ultimate-suite/ultimate-rsi-suite/rsi-divergence - **Images studied:** 3 of 8 (skipped: 2 settings frames, deviation shot covered under RSI Signals, bullish-hidden variant)
**Reference image URLs:**
- hero-rsi-pane: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252Fcn9OiZ1WkKwRA0PlY2c6%252Fimage.png%3Falt%3Dmedia%26token%3D92897736-6090-4936-a0b2-e8333359f964&width=768&dpr=3&quality=100&sign=c2e03e8a&sv=2
- both-panes: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FQoKYvwxiLBSbAOSPOE4I%252Fimage.png%3Falt%3Dmedia%26token%3Dd655eb99-3fb1-413d-95c1-76f3111cee4c&width=768&dpr=3&quality=100&sign=5f508236&sv=2
- bearish-hidden: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FusMLOsETRJjitocyJZKp%252Fimage.png%3Falt%3Dmedia%26token%3D342a8471-73a8-446d-8112-36770ad592cc&width=768&dpr=3&quality=100&sign=660efe23&sv=2

**Canvas anatomy:** Regular divergences are drawn twice — a straight swing-to-swing line on the price chart connecting the two candle extremes, and a matching line on the RSI pane connecting the two RSI extremes — each finished with a small text label + hairline arrow at the confirming swing. Hidden divergences appear as dashed magenta lines on the RSI pane only, with "H-bear"/"H-bull" labels on both panes.

**Element inventory:**
- Regular bullish line: straight ~2px bright spring-green `#00e676` segment, low→higher-low (price) and matching lows on RSI. Note: deliberately BRIGHTER than the marker/fill green `#4caf50`, so divergences pop against the Engine coloring.
- Regular bearish line: straight ~2px red `#fb4040` (a hair lighter than candle red), high→lower-high on both panes.
- Labels: plain text "Bull" (green `#00e676`) / "Bear" (red `#fb4040`), ~13–14px, no chip or background; placed just beyond the second swing (below for Bull, above for Bear) with a 1px arrow glyph (↑ for Bull pointing up at the line end, ↓ for Bear pointing down) between text and line. Chained divergences repeat the label at each confirmed swing (two "Bull" labels on one two-segment line seen).
- Hidden divergence line: dashed magenta `#a81a7f`–`#c41c91` (~1.5px, ~6px dashes) connecting the RSI swing pair; drawn on the RSI pane only — on the price chart only the label+arrow appear at the swings, no connecting line.
- Hidden labels: "H-bear" in the same magenta, tiny ↓ arrow beneath, repeated on price chart and RSI pane. ("H-bull" counterpart documented with mirrored geometry — not visually verified.)
- Deviation +1/+2 levels: same white solid→dashed level system as RSI Signals (docs: "Each level changes to a dashed style once price touches it") — visual details verified in the Signals module image; divergence-page variant not separately downloaded.
- Coexists with Engine band/fills and Signals triangles in the same pane.

**Color system:** bull-divergence green `#00e676`; bear-divergence red `#fb4040`; hidden (both directions) = magenta family `#c41c91` differentiating "continuation" from "reversal" semantics; neutral white `#dbdbdb` for deviation levels.

**States & variants:** regular = solid line + Bull/Bear label; hidden = dashed magenta + "H-" prefixed label; confirmed-only rendering (docs: drawn only when both swings complete — no live/forming state visible).

**Interaction affordances visible:** none.

**Adaptation notes for our terminal:**
- Keep three semantic classes: divergence-bull, divergence-bear (map to locale-aware up/down accent variants, brighter than base), divergence-hidden (single distinct accent, e.g. our magenta/violet token for both hidden directions — vendor uses one magenta for bearish-hidden; verify bullish-hidden before assuming a second hue).
- Label style is bare colored text — no pills. Preserve that; pills would collide with candles at density.
- Draw price-pane and RSI-pane lines from one detection record to guarantee they stay in sync.
- Solid vs dashed is the regular/hidden discriminator — keep it even in monochrome/accessibility modes.
- Mobile: shrink labels to ~10px and drop the arrow glyph first; keep lines.

## RSI Channel — visual spec
**Source doc:** https://docs.bigbeluga.com/ultimate-suite/ultimate-rsi-suite/rsi-channel - **Images studied:** 3 of 5 (skipped Bollinger and Keltner close-ups; hero shows a Bollinger-style channel)
**Reference image URLs:**
- hero-bollinger: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FMdKhjsSUYemqWuu9qkje%252Fimage.png%3Falt%3Dmedia%26token%3Db50e0a84-af61-4617-92c9-6702c6c2d5b4&width=768&dpr=3&quality=100&sign=b3f10809&sv=2
- donchian: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FMy3s38rrzBRymD9Kk7ou%252Fimage.png%3Falt%3Dmedia%26token%3D8b48bd07-ac47-4f79-8693-7a1ce4d1454e&width=768&dpr=3&quality=100&sign=c77609dc&sv=2
- break-detection: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FIqlBrG1zCASVcQT8k8PF%252Fimage.png%3Falt%3Dmedia%26token%3Ddbaca5ad-30d4-42ee-a7cc-ca9bfda6284f&width=768&dpr=3&quality=100&sign=7c36f1ab&sv=2

**Canvas anatomy:** Inside the RSI pane, three additional polylines wrap the adaptive RSI line: violet upper and lower envelope bands and an amber basis midline. No fill between the bands — pure line channel over the Engine's band/fills. Break events pin small colored dots to the pane's extreme top/bottom margins at the trigger bar.

**Element inventory:**
- Upper/lower channel lines: ~1–1.5px violet-purple `#68207e` (sampled `#631f75`–`#68207e`), unfilled, drawn over the neutral band. Bollinger variant: jagged, expanding/contracting with RSI volatility. Donchian variant: staircase plateaus (flat highest/lowest-of-N runs joined by short ramps). Keltner: smoother per docs — not visually verified.
- Basis line: ~1px amber-orange `#a8650c`, midway between bands (Donchian basis is also stepped).
- Upward-break marker: solid bright-green `#00e676` circle, ~10–12px, pinned near the BOTTOM edge of the pane at the breakout bar (docs: "small green circle below the RSI plot" for RSI crossing above the upper channel).
- Downward-break marker: solid red `#f23645` circle pinned near the TOP edge of the pane (docs: "small red circle above the RSI plot"). Note the deliberate opposite-side placement — dots live in the empty margin, never on the line.
- A freshly-forming red break dot appears at the last bar touching the upper Donchian band in the Donchian shot.
- Underlying Engine visuals (indigo edge-glow band with dashed 50 line, value-gradient RSI line, red/green outside-band fills) remain fully visible beneath the channel.

**Color system:** channel structure = violet `#68207e` (upper+lower) and amber `#a8650c` (basis) — intentionally in a different color family from the bull/bear reds/greens so structure never reads as direction; break events reuse the suite's event colors: green `#00e676` (up), red `#f23645` (down).

**States & variants:** three channel types (Bollinger jagged / Donchian stepped / Keltner smooth — only one active at a time); break dots are the only event state (fresh vs none — no aging visible in-pane; docs say recency is shown on the Dashboard instead).

**Interaction affordances visible:** none in-pane; docs link break recency to dashboard cells.

**Adaptation notes for our terminal:**
- Map violet/amber to two neutral "structure" tokens distinct from our up/down pair; do not recolor the channel by direction.
- Pin break dots to fixed pane-margin rows (top for down-breaks, bottom for up-breaks) rather than offsetting from the line — this is the vendor's signature and avoids marker/line collisions.
- Donchian steppiness must be preserved (no spline smoothing) — it is the visual identifier of the type.
- Consider 1px alpha-30% variants of the channel lines on mobile; three extra polylines crowd a short pane quickly.
- Improvement: optional faint violet fill (≤8% alpha) between bands for squeeze readability — vendor has none, keep default off for parity.

## RSI Dashboard — visual spec
**Source doc:** https://docs.bigbeluga.com/ultimate-suite/ultimate-rsi-suite/rsi-dashboard - **Images studied:** 3 of 4 (skipped the settings frame)
**Reference image URLs:**
- hero-in-context: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252F3j7WkMJqyx80xkLLtMSk%252Fimage.png%3Falt%3Dmedia%26token%3D6a37b82c-0bab-4393-a2d1-b83d8d05cc44&width=768&dpr=3&quality=100&sign=56fd4df6&sv=2
- table-closeup: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252F46eyGhNtynpaEjDepKUi%252Fimage.png%3Falt%3Dmedia%26token%3Dfcddf4df-4b42-4151-b71f-3b71c83b1938&width=768&dpr=3&quality=100&sign=1eaaeea5&sv=2
- tooltip: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FLKClv13zGi7zT3dMHUKJ%252Fimage.png%3Falt%3Dmedia%26token%3D23ab63d3-fa8e-44b7-a85e-1c4e748cd45f&width=768&dpr=3&quality=100&sign=673af6de&sv=2

**Canvas anatomy:** A compact matrix table floated over the upper-right of the price chart (position configurable). First column = row labels; remaining 6–8 columns = timeframes. Rows observed: "Timeframe", "Divergence", "OB/OS", "Signals", "Channel Breaks" (hero) and "H-Divergence" (closeup); docs also list a "Cross signals" row (not visually verified). Row set varies with enabled modules.

**Element inventory:**
- Grid: square-cornered cells separated by ~2px gaps of chart-background color (reads as thin dark grid lines). Label column ~3x wider than data cells; at hero scale data cells ≈ 73×58px. No outer border, no shadow.
- Header/label cells: flat charcoal `#252831`–`#303336`, white ~13–16px sans text (TradingView table face, Trebuchet-like), centered. Header cells: "Timeframe", "5M", "15M", "1H", "2H", "4H", "12H", "1D", "7D".
- Inactive cells: same charcoal with a dim gray "-" dash.
- Event cells: fully flood-filled with the event color, white text/glyph centered. Microcopy exactly: "Bull", "Bear", "OB", "OS", "▲", "▼".
- Freshness ramp (the signature): fill brightness decays with event age. Sampled green ramp: `#02da70` (fresh) → `#0da35d` → `#109257` → `#469c4c` → `#196647` (old). Red ramp: `#f23645`/`#e23e3f` (fresh) → `#c43341` → `#be3939` → `#832e3b` → `#662d39`/`#532d35` (old maroon).
- Distinct hue nuances: OB cell pure red `#f23645`, OS cell mid-green `#4caf50`; Channel-break-up cells use an emerald/teal `#0e9d5c`–`#17764e` distinct from signal greens; H-Divergence fresh bull appears as bright mint `#40d38d`.
- Tooltip (hover on a cell): dark charcoal `#3c3d3c` rectangle, square corners, no caret, white ~14px text with leading white glyph — exact copy seen: "▼ Channel Break 13 Bars Back". Format: `<▲|▼> <Event Name> <N> Bars Back`.

**Color system:** bull events = green ramp `#02da70→#196647`; bear events = red ramp `#f23645→#532d35`; neutral/inactive = charcoal `#252831` + gray dash; white foreground everywhere; brightness = recency (bright=last few bars, faded=older, charcoal=none).

**States & variants:** every cell is a 3-way state (bull/bear/none) × continuous freshness dimension; column count 6–8 configurable; "Normal or Compact" size documented (compact closeup verified at ~51×32px cells).

**Interaction affordances visible:** hover tooltip per cell (event type + bars-since + description per docs); implies hover-target behavior on every data cell.

**Adaptation notes for our terminal:**
- Rebuild as HTML overlay (not canvas): flex/grid table with design tokens; bull/bear ramps from our locale-aware pair via `color-mix` against the panel background for the freshness decay (3–4 discrete steps are enough; vendor decay looks stepped, not continuous).
- Keep white-on-flood-fill cells and the charcoal-dash empty state; they carry the glanceability.
- Replace hover tooltip with tap-toggle popover on touch; keep the `▼ <event> N Bars Back` string format.
- Respect reduced-motion/mobile: collapse to 4 timeframe columns under 420px and let the user swipe columns; never shrink text below ~10px.
- Use tabular-lining numerals for TF headers so column widths stay stable.

---

# 14 — BigBeluga "Ultimate MACD Suite" — visual design spec

Shared canvas across all modules: near-black navy pane `#10131c`; 1px gray zero line `#787b86`; candles use TV-classic pair up `#089981` / down `#f23645`. The suite runs in a sub-pane under price, on a **normalized -100..+100 MACD scale**. All hexes sampled from vendor screenshots (PIL pixel probes); treat as approximations of anti-aliased renders.

## MACD Engine — visual spec
**Source doc:** https://docs.bigbeluga.com/ultimate-suite/ultimate-macd-suite/macd-engine - **Images studied:** 4 of 6 (skipped 1 settings dialog + 1 mode-chip duplicate)
**Reference image URLs:**
- (mode-chip) https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FSAaRQZRb28HQJfSqmrBi%252Fimage.png%3Falt%3Dmedia%26token%3Dffdcc24b-7175-4724-bb5d-9fe3ad444996&width=768&dpr=3&quality=100&sign=297390e6&sv=2
- (heatmap) https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252Fkjl9wSkQjtVQDHakjVRp%252Fimage.png%3Falt%3Dmedia%26token%3Da5a31eec-5094-46c7-9447-7c060b16142b&width=768&dpr=3&quality=100&sign=868a5eec&sv=2
- (rising-falling) https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FGC7XLwMA7ILKRA7Rrjna%252Fimage.png%3Falt%3Dmedia%26token%3D039343ce-3595-4f93-9ed2-bf4944852eed&width=768&dpr=3&quality=100&sign=3b50758d&sv=2
- (ob-os+arrows) https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252Ft3TBvoVdCORfFiDNe0i2%252Fimage.png%3Falt%3Dmedia%26token%3D06fcecab-63ff-4ab1-bba1-4628e3a4e139&width=768&dpr=3&quality=100&sign=1a23cf20&sv=2

**Canvas anatomy:** A standalone oscillator pane. One smooth, heavily rounded MACD curve (~2px) sweeps across the full pane height; a 1px gray zero line sits at vertical center. Two horizontal "zone" strips cap the pane: an overbought strip from the +100 level to the pane's top edge, and an oversold strip from -100 to the bottom edge. The curve visually clamps flat against those strips when the normalized value saturates at ±100.

**Element inventory:**
- MACD line: ~2px, strongly smoothed (no bar-level jaggies). HeatMap mode maps the *value* to color: `#00e676` at -100 → orange `#ff9800`/`#fb7e11` around 0 → `#f23645` at +100, continuously interpolated along the curve.
- Rising/Falling mode: same geometry, 2-color slope coloring — rising segments `#00e676`, falling segments `#f23645`, with 1-2px olive blend pixels at each slope flip.
- OB strip: translucent crimson fill (reads `#3c1924` over the bg ≈ `#f23645` at ~15-20% alpha), full pane width, ~8% of pane height, with a soft glow fading downward below the +100 edge. No border stroke.
- OS strip: mirrored translucent green (reads `#1b2f26` ≈ `#00e676` at ~10-15% alpha), glow fading upward.
- Zero line: 1px solid `#787b86`, full width.
- Extreme-touch arrows (OB/OS shot): solid white `#ffffff` block arrows (stem + triangular head, ~20x25px) — down-arrow above the pane at a clamped red peak, up-arrow below at a clamped green trough.
- Settings chip microcopy: label "Style", dropdown value "HeatMap", followed by 3 square color swatches (green / dark-orange / red) = the user-editable 3-stop gradient.

**Color system:** bull/oversold heat `#00e676`; neutral/mid heat `#ff9800`; bear/overbought heat `#f23645`; zone fills = same hues at low alpha; chrome gray `#787b86`; bg `#10131c`. Gradient runs along the polyline, keyed to value (HeatMap) or slope sign (Rising/Falling).

**States & variants:** Two line-color modes (HeatMap vs Rising/Falling) — geometry identical. Saturation/clamp state at ±100 is itself a visual state (flat line hugging the strip). No mitigated/filled states.

**Interaction affordances visible:** none in-chart; only the Style dropdown chip implies configurability.

**Adaptation notes for our terminal:**
- Map green→`buy-heat`, red→`sell-heat` semantic tokens, not raw hexes; note the ramp is *not* the candle up/down pair (oversold=green means "buy heat"), so keep it independent of our locale-flipped `--up/--down` pair and use fixed heat tokens.
- Render the value-keyed gradient with a per-segment interpolated stroke (canvas `createLinearGradient` per segment or per-point colored polyline); 3 stops configurable.
- Keep OB/OS strips as low-alpha fills + fading gradient glow; avoid hard border lines.
- Clamp display at ±100 exactly like the vendor (flat-top look is the signature); keep raw value for tooltips.
- Mobile: 2px line and 8%-height strips survive small panes well; drop the white block arrows below ~320px pane width.

## MACD Signals — visual spec
**Source doc:** https://docs.bigbeluga.com/ultimate-suite/ultimate-macd-suite/macd-signals - **Images studied:** 2 of 2
**Reference image URLs:**
- (pane-hero) https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FAxXnawP9v29GLZtezR3v%252Fimage.png%3Falt%3Dmedia%26token%3Db7470e2b-ddd7-46f6-992b-1e1f6379cc81&width=768&dpr=3&quality=100&sign=2835a70e&sv=2
- (price+pane) https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FKKUHf55OVnJlCslVVrcd%252Fimage.png%3Falt%3Dmedia%26token%3Df4fa7ff6-0f97-45fa-a4f7-eedbc89b426a&width=768&dpr=3&quality=100&sign=cd8b5fa9&sv=2

**Canvas anatomy:** Two-surface module. In the oscillator pane, small filled triangles mark momentum reversals at the OB/OS extremes: ▼ sits *above* the OB strip over a clamped peak; ▲ sits *below* the line trough at the OS strip. The same events are mirrored onto the price chart: ▼ above the swing-high candle, ▲ below the swing-low candle. The full composite also reveals a second, thin light-gray **signal line** (`#8f929c`, ~1px) weaving around the gradient MACD line.

**Element inventory:**
- Bearish marker: solid filled ▼ triangle, ~10-12px wide, `#f23645`, no stroke/label; plotted with a small vertical offset from the extreme (and one bar right of the actual peak — confirmation delay is visible in the hero).
- Bullish marker: solid filled ▲, ~10-12px, `#4caf50` (a deliberately *darker* green than the line's `#00e676` — the pair reads as marker-green vs heat-green).
- Signal line: 1px `#8f929c`, unsmoothed-gray companion under the colored MACD line; visually subordinate (thin, low contrast).
- Price-chart mirrors: identical triangles floating ~0.5 candle-height above highs / below lows.
- MACD line, OB/OS strips, zero line: inherited from Engine (see above).

**Color system:** signal-bear `#f23645`, signal-bull `#4caf50`, companion-line gray `#8f929c`; everything else inherits Engine palette. No gradients on markers.

**States & variants:** Only bullish vs bearish. Markers appear exclusively when the reversal happens inside/at the OB/OS zones (docs: filtered "high-conviction" extremes only) — there is no mid-range variant. No aged/mitigated styling in-pane (aging exists only in the Dashboard).

**Interaction affordances visible:** none (static markers).

**Adaptation notes for our terminal:**
- Use our semantic `signal-up/signal-down` tokens; on zh locale the up/down color pair flips, so bind triangles to the locale-aware pair rather than fixed green/red.
- Keep the two-green distinction: heat ramp green vs marker green must differ in luminance or the ▲ disappears against an OS-clamped line.
- Mirror-to-price should be a toggle; render price-pane triangles in the overlay layer with collision nudging so they never overlap wicks.
- Confirmation delay (marker one bar after the extreme) should be honest — plot on the confirmed bar, never repaint backward.
- Mobile: triangles scale to ~8px minimum; drop the gray signal line first when pane height < ~80px.

## MACD Divergence — visual spec
**Source doc:** https://docs.bigbeluga.com/ultimate-suite/ultimate-macd-suite/macd-divergence - **Images studied:** 3 of 5 (skipped settings dialog + 1 regular-divergence duplicate)
**Reference image URLs:**
- (regular-hero) https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FCmkn2xOuGvk5e4L7t9qb%252Fimage.png%3Falt%3Dmedia%26token%3D3b628cb7-e489-481e-b17e-5a924bbbbb1f&width=768&dpr=3&quality=100&sign=f69287b5&sv=2
- (hidden-bull) https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FfRnfTkL4KHSEyStAYjSj%252Fimage.png%3Falt%3Dmedia%26token%3Dcb9ca424-df6d-4608-82dd-6be3257d1e76&width=768&dpr=3&quality=100&sign=aac70a35&sv=2
- (hidden-bear) https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252Fw1TsaLHCU6Tuu9OK9gsi%252Fimage.png%3Falt%3Dmedia%26token%3D0bfe2233-5f0b-496b-b92d-8295c6e4cf3c&width=768&dpr=3&quality=100&sign=7517c933&sv=2

**Canvas anatomy:** Straight pivot-to-pivot connector lines drawn **on the MACD pane** between the two swing extremes of the oscillator, with a tiny text label + arrow glyph at the second (confirming) pivot. Hidden divergences additionally stamp labels **on the price chart** at the corresponding candle (below lows for H-bull, above highs for H-bear). Regular-divergence price labels are documented but not visually verified in my downloads.

**Element inventory:**
- Regular bearish line: straight, solid, ~2px `#f23645`-family red connecting MACD high → lower high; label stack above the 2nd pivot: word "Bear" (~11px sans, red `#fb4040`-ish) over a tiny "↓" glyph pointing at the pivot.
- Regular bullish line: straight solid ~2px `#00e676` connecting low → higher low; label below the 2nd pivot: tiny "↑" over the word "Bull" in green.
- Hidden bullish: **dashed** connector (~2px dashes, ~4-6px gaps) in teal-cyan `#1ea8bb`/`#1c95a8`; labels "H-bull" in the same cyan with "↑" glyph, plotted under the oscillator pivot *and* under the price pullback low.
- Hidden bearish: dashed connector in magenta `#bb1c89`; labels "H-bear" magenta with "↓", above oscillator pivot and above the price lower-high.
- Coincident suite markers visible in composites: ▼/▲ triangles and red/green "+" glyphs frequently sit at the same pivots (modules stack).
- Label typography: small (~10-11px) plain sans, no background chip, no border — colored text floating on the pane bg.

**Color system:** regular-bull `#00e676` solid; regular-bear `#f23645` solid; hidden-bull cyan `#1ea8bb` dashed; hidden-bear magenta `#bb1c89` dashed. Four independent, user-settable colors per docs. Line style (solid vs dashed) — not color alone — is the regular-vs-hidden discriminator.
**States & variants:** bullish vs bearish (color + label + which side of the pivot the label sits); regular (reversal, solid) vs hidden (continuation, dashed). Non-lagging per docs: plotted 1 bar after confirmation; no repaint/mitigated styling exists.
**Interaction affordances visible:** none.

**Adaptation notes for our terminal:**
- Encode regular/hidden as solid/dashed stroke tokens and bull/bear as our locale-aware pair; keep hidden hues (cyan/magenta) *outside* the up/down pair so they never collide with candle colors in either locale.
- Label chips: keep vendor's bare-text look but add a 1px bg-colored halo for legibility over the histogram fill.
- Our microcopy: keep "Bull"/"Bear"/"H-bull"/"H-bear" as i18n keys (zh needs translated equivalents; search-row law: one language per row).
- Price-chart mirroring should be per-type toggleable; clamp connector drawing to the oscillator pane only.
- Mobile: dashed lines at 1.5px minimum; hide floating labels under ~360px width, keep connectors.

## MACD Histogram — visual spec
**Source doc:** https://docs.bigbeluga.com/ultimate-suite/ultimate-macd-suite/macd-histogram - **Images studied:** 3 of 4 (skipped 1 weak-momentum crop; its content is described under States)
**Reference image URLs:**
- (hero) https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FI8d5inTovRDhuKdsNTFv%252Fimage.png%3Falt%3Dmedia%26token%3D98dc829c-0f5a-483f-943c-141e935dbb14&width=768&dpr=3&quality=100&sign=3d287bc3&sv=2
- (strong-crop) https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FwZqBm34c9XbAqJFSuFwm%252Fimage.png%3Falt%3Dmedia%26token%3Dd485b72d-f688-4dab-aafe-0db7e32b60e6&width=768&dpr=3&quality=100&sign=7b510855&sv=2
- (price+plus) https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FJkVbxLV8ngx6yw07MOzc%252Fimage.png%3Falt%3Dmedia%26token%3D17afd986-40e1-4280-9545-b04235fb26aa&width=768&dpr=3&quality=100&sign=40447a82&sv=2

**Canvas anatomy:** A histogram "mountain range" anchored to the zero line: tightly packed vertical bars (per-bar width ~3-6px with ~1px gaps, producing a subtle striped texture) whose envelope reads as a smooth filled area. Green-teal mounds above zero, red valleys below. Small "+" glyphs cap turning points: red "+" floats just above a green mound's tip; green "+" hangs just below a red valley's tip. Mirrored "+" also appear on the price chart (red above the candle high at the momentum peak, green below the low at the trough).

**Element inventory:**
- Positive bars: teal-green family `#089981`; per-bar vertical gradient with darker/deeper tone toward the zero baseline (`#0c564f`) rising to `#08977f`-`#089981` at the tip; adjacent-bar brightness varies slightly, giving the striped sheen.
- Negative bars: red family, dark maroon near baseline `#822431` brightening to `#ea3543` at the deepest tips.
- Amplitude→saturation ramp: taller bars are visibly more saturated; small bars sit dim/desaturated near the baseline (docs: strong = saturated, weak = "lighter tones"; the weak-momentum crop was not downloaded — not visually verified beyond the hero's small bars).
- Zero line: 1px `#787b86` running across the fill.
- Reversal "+" glyphs: thin-stroke crosses ~8-10px; bearish turn `#f23645` at positive peaks, bullish turn `#4caf50` at negative troughs; identical mirrors on the price panel offset from wick extremes.
- Doc-only annotation: large white arrows in the strong-momentum crop are documentation callouts, not chrome.

**Color system:** momentum-up teal `#089981` (matches up-candle color exactly), momentum-down red `#f23645` family; ramps: `#0c564f→#08977f` (up), `#822431→#ea3543` (down); glyph pair `#f23645`/`#4caf50`; neutral gray `#787b86`.
**States & variants:** above vs below zero; strong (saturated) vs weak (faded) amplitude; turning-point marked vs unmarked; "+" markers are filtered to meaningful extremes only.
**Interaction affordances visible:** none.

**Adaptation notes for our terminal:**
- Bind bar hues to the locale-aware momentum pair (they equal the candle pair here — reuse `--up/--down` ramps so zh flip stays coherent).
- Implement the ramp as opacity/saturation keyed to |value|/max over the visible window, not fixed stops; keep the 1px bar gap for the signature striping.
- The counter-colored "+" (red plus on green mound) is the key affordance — preserve the inversion; add hover tooltip with bar time + value (vendor has none).
- Cap "+" density with the same extreme-filtering or mobile charts will speckle; min glyph 7px.

## MACD Trend — visual spec
**Source doc:** https://docs.bigbeluga.com/ultimate-suite/ultimate-macd-suite/macd-trend - **Images studied:** 1 of 2 (the other is a settings dialog, skipped)
**Reference image URLs:**
- (hero) https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FTujOYGpccZT8oRfzAYiK%252Fimage.png%3Falt%3Dmedia%26token%3Dad189f8c-b4c8-45b2-af7c-6a0d3d1abff4&width=768&dpr=3&quality=100&sign=d4eb27b9&sv=2

**Canvas anatomy:** Two dedicated horizontal marker lanes framing the oscillator pane. A "Trend Down" lane runs along the very top of the pane (above the OB strip, just under the price/pane separator); a "Trend Up" lane runs along the very bottom (below the OS strip). While a trend phase persists, the active lane fills with a continuous dotted strip of tiny squares; the opposite lane stays empty. Strips start/stop exactly where the momentum engine flips, so alternating red-top / teal-bottom runs read like a binary regime ribbon.

**Element inventory:**
- Down-trend dots: tiny filled squares ~2-3px, muted red `#9d2936` (reads as `#f23645` at roughly half opacity over the bg), spaced ~6-10px apart in a perfectly straight row at a fixed y.
- Up-trend dots: same geometry in muted teal `#0b675b`/`#0c564f` (dimmed `#089981` family) at the bottom lane.
- Doc annotations: "Trend Down" / "Trend Up" large white text + white block arrows are documentation callouts, not indicator chrome.
- Underlying pane in the shot: HeatMap MACD line + gray signal line + OB/OS strips, confirming the lanes sit outside the strips.

**Color system:** trend-up teal (muted `#089981` family), trend-down red (muted `#f23645` family); both deliberately dimmer than line/marker colors so the ribbon reads as background state, not an event.
**States & variants:** exactly two mutually exclusive states (Bull lane on / Bear lane on); no neutral state visible — one lane is always populated; no intensity tiers.
**Interaction affordances visible:** none.

**Adaptation notes for our terminal:**
- Implement as a 1-row regime ribbon per edge (cheap: one dotted polyline each), colors = locale-aware pair at ~50-60% alpha tokens.
- Consider merging into a single lane with color switching to save vertical space on mobile; vendor's two-lane layout wastes a band but makes flips scannable — keep two lanes on desktop.
- Dot pitch should be zoom-independent (fixed px spacing), not bar-indexed, to preserve the dotted texture at all zooms.
- Feed the same Bull/Bear state to the Dashboard "Trend" row so the two surfaces never disagree.

## MACD Dashboard — visual spec
**Source doc:** https://docs.bigbeluga.com/ultimate-suite/ultimate-macd-suite/macd-dashboard - **Images studied:** 3 of 5 (skipped settings dialog + a 2nd tooltip shot)
**Reference image URLs:**
- (hero-table) https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252Fqq53UI9t8FCmJxKKXPHw%252Fimage.png%3Falt%3Dmedia%26token%3Dd18109c7-2b14-4709-9bab-e84067a88058&width=768&dpr=3&quality=100&sign=e13a4bef&sv=2
- (fade-history) https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252F8lAJhH9x5MeEfB0ti0yR%252Fimage.png%3Falt%3Dmedia%26token%3D63d0b674-e26b-4350-986d-8b00a1257f50&width=768&dpr=3&quality=100&sign=951171b2&sv=2
- (tooltip) https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252F4IEJyqA3QvowU39MzUBs%252Fimage.png%3Falt%3Dmedia%26token%3Da7f1398c-d9e9-49b7-81bc-a741934f7e80&width=768&dpr=3&quality=100&sign=33e320f8&sv=2

**Canvas anatomy:** A corner-anchored multi-timeframe grid. Header row "Timeframe" + up to 8 timeframe columns ("5M" "15M" "1H" "2H" "4H" "12H" "1D" "7D"; a 6-column variant shows "5M" "1H" "2H" "4H" "12H" "1D"). Six data rows labeled "MACD", "MACD Signals", "Histogram Signals", "Divergence", "H-Divergence", "Trend". Cells are rounded rects (~3-4px radius) separated by a ~2px gutter in the frame color, giving a tile-grid look.

**Element inventory:**
- Chrome: frame/gutter `#252831`; header + row-label cells `#252831` with off-white `#dbdbdb` ~11px medium sans, centered; row labels left column, slightly wider.
- MACD row: one-decimal numerics ("63.5", "-27.1", "-100", "81.9", "-90.7") white text on heat-mapped cell fill — positive→red ramp (mild `#a7303e` → hot `#cc3341`), negative→green ramp (dim `#1b5b44` → `#119057` → hot `#03d470`). At full saturation ("-100") the fill goes neon green and the text flips to dark for contrast.
- MACD Signals row: glyph "▼" on red fill (fresh `#ea3644`) or "▲" on green fill; fills dim with signal age (fresh `#3a4b44` → old `#273033`); "-" light-gray dash on neutral `#2d3039` when none.
- Histogram Signals row: bare colored glyphs, red "+" `#ed3543` / green "+" (aged sample `#427e49`) on unfilled dark cells; empty cell when no signal.
- Divergence / H-Divergence rows: word chips "Bull" on green fill (`#119057`-`#128753`, fresh brighter) and "Bear" on red fill (`#dc3d3e`-`#ea3644`); "-" otherwise.
- Trend row: persistent "Bull" (teal-green `#146c61`) or "Bear" (`#a0303d`) fill in every column — never empty.
- Tooltip: small rounded chip, dark gray `#3d3d3d` fill, white `#f2f2f2` ~11px text, e.g. "OverSold" hovering over the "-100" cell; docs also cite the format "MACD Signal Down – 17 Bars Back".

**Color system:** the table reuses suite semantics — red = bearish/positive-extreme MACD, green = bullish/negative-extreme MACD; per-cell **recency ramp**: signals persist ≤50 bars, background saturation decays with age until removal.
**States & variants:** fresh vs aged (fill intensity), none ("-"/empty), extreme-contrast flip at ±100, persistent-state row (Trend) vs event rows.
**Interaction affordances visible:** hover tooltips per cell (signal type + bars-back); settings imply corner repositioning and Normal/Compact sizing (not visually verified).

**Adaptation notes for our terminal:**
- Build as a DOM/HTML overlay (not canvas): tile grid with tokens — `--panel`, locale-aware bull/bear fills, and an `age → opacity` scale; keep the neon+dark-text contrast flip rule at extremes.
- Replace hover-only tooltips with tap-friendly popovers on mobile; Compact mode = drop "Histogram Signals" and "H-Divergence" rows first.
- All row labels and "Bull"/"Bear"/"OverSold" strings via i18n keys; keep numeric MACD normalized to one decimal.
- Cap at 4 columns under 480px width; the 2px-gutter rounded-tile look is the signature — preserve it over plain table borders.

---



# PART V — Settings, alerts & screener UI references

# 15 — Settings & Screeners (BigBeluga visual spec)

Group focus: settings-dialog conventions (grouping, toggles, dropdowns, step-sequencer inputs) and screener/dashboard table layout (columns, cell chips, recency fades). Local copies of every image live in `specs/img/15-settings-screeners/`. All hexes were pixel-sampled from the downloaded PNGs, not eyeballed.

Shared observations (verified across all five pages):
- Chart canvas background is a deep navy-black `#10131c`; TradingView settings dialogs render on flat `#1f1f1f` panels with `#dbdbdb` labels.
- Settings sections open with a decorated divider title: em-dash runs flanking two orange diamonds and an amber ALL-CAPS name, e.g. `―――― ◆ CUSTOM STEP ALERTS ◆ ――――` (diamond/title orange ≈ `#f47947`).
- Dropdown VALUES carry inline state glyphs: `❌Disab…` (red-pink ✕ ≈ `#fc4b6e`), `🔵All` (blue dot ≈ `#4683d5`), `🟢Bullish` (mint dot ≈ `#6ffca5`), plus a red `🔴Bearish` variant (documented; seen only in docs text — not visually verified).
- Every settings row ends with a small gray circled-i info icon.

---

## Custom Alert Sequencer (Market Core) — visual spec
**Source doc:** https://docs.bigbeluga.com/main-toolkits/market-core-pro-tm/custom-alert - **Images studied:** 6 of 16
**Reference image URLs:**
- checkbox: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FkVoSHScgEfBJGgwUEfYs%252Fimage.png%3Falt%3Dmedia%26token%3Dfd7b4d31-a6d8-4f79-a6ac-dc588b715e18&width=768&dpr=3&quality=100&sign=e85df02d&sv=2
- maxbars: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FN71a3J97lmAdJJGvOmV3%252Fimage.png%3Falt%3Dmedia%26token%3Dd3c3fe84-60c2-485b-b041-6e93b33b5641&width=768&dpr=3&quality=100&sign=cd4e2ed3&sv=2
- trackerstrip: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FQ0GUWMegpe355D6jq2kv%252Fimage.png%3Falt%3Dmedia%26token%3Df2425be6-fb59-439d-b851-b0f66ded8edf&width=768&dpr=3&quality=100&sign=b7af5394&sv=2
- fullscene: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FNDy6Ki2sypyVVgLGgbdG%252Fimage.png%3Falt%3Dmedia%26token%3D2c6b3f7f-36c7-4f03-8e50-e6f3670add88&width=768&dpr=3&quality=100&sign=6971d7de&sv=2
- steprows: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FjL2t0KAI1deBQKgq2mzN%252Fimage.png%3Falt%3Dmedia%26token%3D39898979-b8f6-4932-a5cb-bd03b044c875&width=768&dpr=3&quality=100&sign=4757d6fc&sv=2
- extsource: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252Fibiv8GRFjRdRhq4uMwGK%252Fimage.png%3Falt%3Dmedia%26token%3D3a0cace7-6178-4b65-ac05-34ce20a7f2bc&width=768&dpr=3&quality=100&sign=6fd2f0d3&sv=2

**Canvas anatomy:** Two surfaces. (1) A settings block inside the TradingView indicator dialog: a `CUSTOM STEP ALERTS` section containing a master checkbox, a numeric window input, then one row per signal family, each row = left label + condition dropdown + `Step` label + numeric step input. (2) On-chart feedback: a horizontal tracker strip pinned at the very bottom of the pane below the candles — one small square per elapsed bar while a sequence is armed, terminating in an orange square when the full chain completes. In the vendor's hero shot, doc annotations ("Step 1 Bullish OB Touch", "Step 2 Bullish BOS", white arrows, white callout boxes) are overlaid — those are documentation art, not product UI.

**Element inventory:**
- Section divider: em-dash runs + `◆` diamonds (`#f47947`) + amber caps title, ~11px letter-spaced.
- Master toggle: square checkbox (white ✓ on dark box), label "Use Custom Alerts", 13px `#dbdbdb`, info icon right.
- Numeric input: "Max Bars allowed between steps" + rounded-rect field (~6px radius, `#1f1f1f` fill, 1px `#575757` border, white value "20", ~110px wide).
- Step rows (the sequencer): label ("Order Blocks", "Market Structure", "Fair Value Gaps") + condition dropdown whose value starts with a mint dot (`🟢`, ≈`#6ffca5`) then truncated option text ("● Brea…", "● BOS …", "● Retest", "● Touch") + caret; then "Step" + numeric field ("1", "2", "3"). Same-height controls aligned in two loose columns.
- External source row: checkbox "External Source" + source dropdown ("RSI: RSI") + comparator dropdown ("Greater …") + "-" separator + value field ("50"); second line "Step" + field ("4").
- Tracker strip (on chart): ~8–10px squares, flat gray `#393b42`, 1 per bar, evenly spaced with ~3px gaps; final trigger square pure orange `#ff9800`, same size. No border, no radius visible at this scale.
- Chart context in hero: order-block bands with magenta bearish-share bar (`#7f279d`/`#b826ea`) labeled "▼ 30.07%" and cyan bullish bar labeled "▲ 69.93%" (`#1dceeb`), extending into a translucent navy row labeled "BALANCED" (`#0f1f2e`); gray dashed structure lines labeled "BOS" / "CHoCH"; green diamond pivot markers.

**Color system:** Settings chrome is monochrome (`#1f1f1f` / `#dbdbdb` / `#575757`) with two accents: section-amber `#f47947` and state-dot mint `#6ffca5`. On-chart: waiting-gray `#393b42` vs success-orange `#ff9800` — orange is deliberately outside the bull/bear pair so "sequence complete" reads as neither long nor short.

**States & variants:** Dropdown value glyph encodes enablement (`❌` disabled vs `🟢`/`🔵` active). Tracker: armed = growing gray square row; success = orange square; reset (window expired) = strip disappears (not visually verified). Same-step-number pairing (simultaneous condition) has no distinct visual on chart in studied images.

**Interaction affordances visible:** Standard dialog controls only (checkboxes, selects, numeric fields, info-tooltips). No on-chart interactivity shown.

**Adaptation notes for our terminal:**
- Model the sequencer as N rows of {signal, condition, step#}; keep the vendor's "step number pairing" semantics but render our version with an explicit vertical timeline (1→2→3) instead of bare numeric fields — their UX hides sequence order in inputs.
- Map success-orange to our `--warn`/accent token (not up/down pair) so completion stays direction-neutral in both locales.
- Replace emoji state glyphs (❌/🟢/🔵) with proper token-colored status dots; emojis break font consistency and zh rendering.
- The bottom tracker strip is cheap to draw (one rect per bar at pane floor, ~8px, gap 3px); give it a max-width fade on mobile so long windows don't dominate.
- Their inline "-" separator between comparator and value is noise — use a labeled value field.
- Keep the decorated section divider concept (icon + caps title) but with our typography; it is an effective scanning anchor in a long dialog.

---

## Alert Stream Setup / Any alert() Function Call (Market Core) — visual spec
**Source doc:** https://docs.bigbeluga.com/main-toolkits/market-core-pro-tm/any-alert-function-call - **Images studied:** 3 of 7
**Reference image URLs:**
- dialogscroll: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252Fed0AYTN3rFnrB8gJl0nE%252Fimage.png%3Falt%3Dmedia%26token%3D8f9cec55-1d32-40dc-b127-474ca90d3bbb&width=768&dpr=3&quality=100&sign=3b67ae8d&sv=2
- statedots: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FXZi4WyniBNk7tSRSDrkc%252Fimage.png%3Falt%3Dmedia%26token%3D4f19d267-3c2d-4b48-96bb-7dadeae277d0&width=768&dpr=3&quality=100&sign=a4c76f3e&sv=2
- template: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252Ft2iDFUBj4uyHAS7PEzdy%252Fimage.png%3Falt%3Dmedia%26token%3Db881893c-77c3-4ba5-a303-3f9e4831fc1f&width=768&dpr=3&quality=100&sign=869304f6&sv=2

**Canvas anatomy:** Entirely a settings-dialog surface (no chart drawing). One long scrolling section `―――― ◆ ANY ALERT() FUNCTION CALL ◆ ――――` lists every alert family as a label+dropdown row. Families are grouped by module, and groups are separated by full-width runs of gray dashes acting as thin visual dividers (a text-based `<hr>`). Order observed: OB group ("OB Breakout Alerts", "OB Touch Alerts"), structure group ("BOS (Break of Structure) Alerts", "ChoCh (Change of Character) Alerts"), FVG group ("FVG Break Alerts", "FVG Created Alerts", "FVG Retest Alerts", "IFVG Retest Alerts"), then "SFP Alerts"; the docs list ~24 rows total in this pattern (rest not visually verified). At the very bottom sits a large free-text message-template box. Dialog footer: "Defaults" dropdown bottom-left; "Cancel" (outlined) and "Ok" (solid white pill, dark text) bottom-right.

**Element inventory:**
- Row: left label 13px `#dbdbdb`, right rounded dropdown (~100px wide, `#1f1f1f` fill, 1px `#575757` border, ~4–6px radius) + gray info dot. Vertical rhythm ~50px per row.
- Dropdown value with state glyph: `❌Disab…` (✕ ≈ `#fc4b6e`), `🔵All` (`#4683d5`), `🟢Bullish` (`#6ffca5`). Truncation with ellipsis at ~9 characters is normal in the vendor's UI.
- Group divider: single row of gray dash characters spanning the label column, ~40% opacity.
- Message template textarea: large rounded rect (~520×220px, ~8px radius, thin light border), monospace-leaning light-gray text `#dbdbdb`; content shows a siren emoji and placeholder tags in double braces: `{{ticker}}`, `{{interval}}`, `{{trigger}}`, `{{close}}`.
- Footer buttons: "Ok" = white filled pill; "Cancel" = dark with light border; "Defaults" = dark dropdown button.

**Color system:** Monochrome dialog chrome; the only color is semantic state inside dropdown values — red-pink ✕ = off, blue = both directions, mint = bullish (red bearish variant documented, not visually verified). Amber `#f47947` reserved for the section header diamonds/title.

**States & variants:** Per-row 4-state enum (Disabled / All / Bullish / Bearish). No other variants; everything else is static chrome.

**Interaction affordances visible:** Dropdowns, scrollbar (right edge visible), textarea editing, footer buttons, info-tooltips. Docs also show pairing with TradingView's native alert-creation modal (condition dropdowns + name/message) — not downloaded within cap.

**Adaptation notes for our terminal:**
- This is a "route many booleans through one stream" pattern: N enum rows + one template. In Settings-v2, render as a table-like list with a segmented control (Off / All / Up / Down) per row instead of dropdowns — one click vs two, and state is visible without opening anything.
- Replace dash-run group separators with real subgroup headers; keep groups collapsible — 24 rows is past comfortable scroll depth on mobile.
- Keep the `{{tag}}` template idea; render known tags as inline chips with autocomplete rather than raw braces text.
- Use our status tokens for the state dots (up/down pair is locale-flipped in zh — never hardcode green=bull).
- Persist a "Defaults" reset affordance; theirs sits in the dialog footer and is easy to find.

---

## SMC Screener — visual spec
**Source doc:** https://docs.bigbeluga.com/screeners/smart-money-concept-screener - **Images studied:** 1 of 1
**Reference image URLs:**
- dashboard: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FRaeaejcJf92XP3GuZt7q%252Fimage.png%3Falt%3Dmedia%26token%3D4bb006d7-cd4a-4fd9-a903-0f8d4a46b5c9&width=768&dpr=3&quality=100&sign=f7c14945&sv=2

**Canvas anatomy:** A dense data matrix anchored bottom-right of the chart pane, 8 columns × 14 asset rows, floating over `#10131c`. Header row: `ASSET | Price | Change % | MS | OB | FVG | SFP | Liquidity`. Left half of the scene shows a price chart with two liquidity/order-flow boxes (purple "STRONG", navy "BALANCED") — a white freehand arrow and white outline around one cell connect chart event to table cell (documentation annotation, not UI). Rows observed: BTCUSDT, ETHUSDT, SOLUSDT, BNBUSDT, XRPUSDT, ADAUSDT, DOGEUSDT, LINKUSDT, AVAXUSDT, DOTUSDT, NEARUSDT, SPY, NIFTY, GOLD — crypto plus index/commodity in one list.

**Element inventory:**
- Header cells: `#252831` fill, light 12px text, centered; the page bg `#10131c` shows through as ~2px gutters, giving a grid of separated tiles rather than ruled lines.
- Asset cells: lighter gray `#383b43` fill, bold white ticker — the only column with a distinct neutral fill, acting as a row header.
- Price cells: near-black fill, plain white numerals ("76465.16", "23748.85").
- Change % cells: fully color-filled — negative rust `#943e2c` ("-0.44%"), positive dark teal `#0a5e55` ("+3.79%", "+0.00%"); white text.
- Signal cells: chip-like filled tiles with label + bars-ago count in parens. Microcopy formats observed: "Touch (4)", "Touch (18)", "OB Bear (0)", "OB Bull (48)", "Bear (0)", "Bull (17)", "Retest (8)", "Retest (0)", "Grab ▼ (44)", "Grab ▼ (31)", "7 | BoS (44)", "4 | BoS- (44)", "3 | BoS (0)"; empty = dim "-" on near-black.
- MS column format is `<count> | BoS (<bars>)` — a leading integer, vertical bar, event, recency.

**Color system:** Bull teal ramp: fresh `#089a83` → aged `#0a5e55` → stale `#103842` → near-black. Bear red ramp: fresh `#b5472c` → aged `#803929` → near-black. Recency drives luminance: `(0)` cells glow saturated, `(39+)` cells are barely above background — the entire table double-encodes direction (hue) and freshness (brightness). Chart boxes: violet `#241837` fill with magenta bar `#b826ea` and cyan labels `#1dceeb` ("▼ 93.28%" / "▲ 6.72%", strength captions "STRONG", "BALANCED"); navy `#0f1f2e` variant for balanced zones.

**States & variants:** Directional (Bull/Bear wording or ▼ glyph) × freshness fade × empty "-". SPY/NIFTY/GOLD rows show sparse signals — empties stay quiet, so active names pop.

**Interaction affordances visible:** None in the still (no sort arrows, no hover shown). Top-right of the image shows TradingView's table minimize/expand icons.

**Adaptation notes for our terminal:**
- Steal the recency-fade: compute cell fill as `mix(token, bg, age/maxAge)` from our `--up`/`--down` pair; it collapses two data dimensions into one glance and is trivial in CSS.
- Keep counts in the label ("Touch (4)") but right-align the parenthetical or set it 1–2px smaller — vendor's single-run text gets cramped at 12px.
- Column set maps to our modules: MS/OB/FVG/SFP/Liquidity → per-desk signal providers; make columns pluggable.
- Use tile-gap grid (bg showing through) instead of border strokes — cheaper and cleaner on hidpi.
- 14 rows × 8 cols will not fit mobile; plan a two-line card per asset (ticker+price+change on line 1, signal chips on line 2), preserving the fade encoding on chips.
- Their positive/negative Change% fills are dim enough to sit behind white text — mirror with our tokens at ~55% saturation, not full brand color.

---

## Market Echo Screener — visual spec
**Source doc:** https://docs.bigbeluga.com/screeners/market-echo-screener-tm - **Images studied:** 1 of 1 (animated GIF, 206 frames; mid-frame studied; final frame is a vendor logo card)
**Reference image URLs:**
- dashboardgif: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252Foj8YNwGtjFEqBpArzeVu%252FScreener.gif%3Falt%3Dmedia%26token%3D87138f13-b0e0-4be0-94e9-2045a5ec7a5c&width=768&dpr=3&quality=100&sign=b5421074&sv=2

**Canvas anatomy:** A 9-column × 14-row matrix panel occupying the lower-right ~60% of the chart pane, on a slightly luminous panel with a faint outer glow; candles run behind/above. Header: `Symbol | Trend Signals | Tps | ActionWave | Magnet | FlowTrend | Smart Bands | Volatility | Price`. Each row is one asset (BTCUSDT … DOTUSDT). Unlike the SMC table, most cells here are text-on-dark rather than filled tiles — only Trend Signals and Tps get filled treatments.

**Element inventory:**
- Header: bold white 13px on `#10131c`; body cells `#34333a`–`#35353b` with ~2px bg gutters.
- Trend Signals cell: filled tile — "Buy" on green `#2f653f` with bright green text; "+ Buy" (power signal, plus-prefixed) same family; "+ Sell" on maroon `#502037` with red text; "--" dim on dark. Fill intensity varies row-to-row (fresh = brighter fill; see recency spec below).
- Tps chip: small square (~24px) with white numeral, green `#297148` for bullish ladders; "--" when none.
- ActionWave / Magnet / FlowTrend / Smart Bands cells: status text with direction glyph — "Bullish Δ" bright green `#0acc5f`; "Bearish ∇" amber; "↑ Bull Signal" / "↓ Bear Signal" amber-orange `#fd9e02`; "↑ Retest" / "↓ Retest" amber or green; "Retest Δ" / "Retest ∇" teal-green; neutral = gray triple-bar glyph "≡" `#5c5d67`.
- Volatility cell: leading state icon + number — cyan-blue snowflake ≈`#3d8df3` for calm ("42.42"), amber warning triangle `#ffad56` for elevated ("56.04", "69.28").
- Price: numerals colored by current direction, TV-red `#f23645` in the studied frame ("115231", "4259.48").

**Color system:** Bull green family `#0acc5f`/`#2f653f`; bear red `#f23645` and maroon fills `#502037`; caution/transition amber `#fd9e02`–`#ffad56`; calm-info blue `#3d8df3`; neutral gray `#5c5d67`. Direction glyph vocabulary is consistent: Δ up, ∇ down, ↑/↓ arrows for signal events, ≡ for flat.

**States & variants:** Four signal grades in one column ("Buy", "+ Buy", "Sell"→"+ Sell", "--"); retest states render amber (in-progress pullback) vs green/teal (confirmed continuation); volatility has at least two icon states here (third state in sibling page). The GIF cycles frames — cells update live; treat as periodic refresh, no transition animation discernible.

**Interaction affordances visible:** None in this asset beyond the animation; hover behavior is documented on the child page (see next module).

**Adaptation notes for our terminal:**
- Two-tier cell treatments (filled tile for the headline signal column, plain colored text for secondary modules) create hierarchy without extra chrome — adopt: our primary signal column gets token-filled chips, everything else stays typographic.
- Replace Δ/∇/≡ glyphs with our icon set but keep the three-way vocabulary (state, event-arrow, neutral).
- Amber as "transition/retest" is a genuinely useful third semantic between up/down — map to `--warn`.
- Volatility "weather icons" (snowflake/warning) are instantly scannable; implement as two-three state icon + value, icon color from an info/warn token pair.
- Panel glow is cosmetic; skip it and rely on our elevation tokens.

---

## Echo Trend Signals & TPs — visual spec
**Source doc:** https://docs.bigbeluga.com/screeners/market-echo-screener-tm/trend-signals-and-take-profits - **Images studied:** 3 of 11
**Reference image URLs:**
- trendcolumn: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FOmnsgpfGWSXhsrcXmTZd%252Fimage.png%3Falt%3Dmedia%26token%3De7a921b4-da27-497b-9d4c-5ad5c63d4b61&width=768&dpr=3&quality=100&sign=ba0b1558&sv=2
- hovertooltip: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FJUrALdROWonf6nPD2nMc%252FScreener1.png%3Falt%3Dmedia%26token%3Dcfe0b89f-3b11-4297-a0ba-52483c264673&width=768&dpr=3&quality=100&sign=2802e76a&sv=2
- tpcolumn: https://docs.bigbeluga.com/~gitbook/image?url=https%3A%2F%2F3353728891-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F1dlOGDREop4WMfLcctYT%252Fuploads%252FgPUqrVQF1pCmALRgQkWv%252Fimage.png%3Falt%3Dmedia%26token%3Dd4deeb78-bbbc-43fe-8b93-d3170b929be9&width=768&dpr=3&quality=100&sign=eda85306&sv=2

**Canvas anatomy:** Close-ups of the same Echo matrix, with the vendor's white callout rectangle drawn around the studied column (annotation, not UI). One image shows the full-width table with the "Trend Signals" column boxed; one shows the "Tps" column boxed; the third shows hover behavior: a cursor on a "Buy" cell raising a tooltip above the header, plus a "Steps" settings row mock (label + numeric field "20") floating at bottom-left of the chart, and chart indicator titles "Market Waves Pro - v1.4.2 [BigBeluga]".

**Element inventory:**
- Trend Signals fills, sampled: fresh "+ Sell" bright brick `#84272e` with red text `#f01111`; older "+ Sell" desaturated plum `#781b40`; "Buy" dark green `#254a44` with mint text `#0bc95e`; inert "--" near-black. Confirms a fade-with-age fill on the headline column.
- Tps chip: square numeric chip, values seen "1"–"6"; green `#2a7246` (white numeral) on bullish rows, crimson `#852431` on bearish rows. Ladder meaning: low number = early move, "5"/"6" = late/exhausted; chips sit centered in a narrow (~48px) column.
- Symbol column: distinct darker fill `#23262e`, bold white tickers — reads as a frozen row-header rail.
- Volatility third state: red-magenta starburst icon (amber core `#ffb628`, magenta rays ≈`#eb0472`) for extreme readings ("70.75", "73.36"), alongside snowflake `#3d8df3` and amber triangle `#ffad56` states.
- Hover tooltip: rounded dark-gray chip `#3d3d3d`, two stacked lines — signal name over recency, e.g. "Buy" / "12 bars back" — light `#f2f2f2` text, small caret/pointer implied by placement above the cell; white arrow cursor rendered on the cell.
- "Steps" input mock: `#1f1f1f` rounded panel, label "Steps" + bordered numeric field "20" — the lookback window governing recency display.
- Price column numerals: `#00e676` green when up, `#f53641` red when down.

**Color system:** Same Echo palette plus the third volatility tier: calm-blue → warn-amber → extreme-magenta/starburst. TP chips reuse the up/down pair at fill level `#2a7246`/`#852431` with white numerals — direction by hue, progression by numeral (no per-level color ramp observed).

**States & variants:** Signal strength ("Buy" vs "+ Buy"); age (bright vs desaturated fill, exact curve not measurable from stills); direction (green/red chips); TP ladder position 1–6; three-tier volatility; price tick direction.

**Interaction affordances visible:** Cell hover → "N bars back" tooltip (the page's central feature); a numeric "Steps" setting controls the recency window. No sorting or row-click evidence.

**Adaptation notes for our terminal:**
- Implement recency as data (`barsSince`) exposed on every screener cell; render fade + hover tooltip ("N bars back" wording, localized) from the same field.
- TP-ladder chip: single square chip, numeral = active TP, fill from locale-aware up/down tokens; add a subtle 6-segment progress tick under the numeral as an improvement (their bare numeral forces users to remember the max).
- Three-tier volatility icons map cleanly to info/warn/critical tokens; keep numeric value beside icon.
- Tooltips must also work on tap (mobile long-press) — vendor pattern is hover-only.
- Keep the darker symbol-rail treatment; it anchors horizontal scanning in wide tables and survives horizontal scroll on mobile if made sticky.

---



# PART VI — Open-source technique mining (BigBeluga public TradingView corpus)

# 16 — TV technique mining: BigBeluga, SMC / structure family

Theme lane: order blocks, market structure, liquidity, fair value gaps, volume profile, support/resistance.
Date mined: 2026-07-28. Method: WebSearch (`site:tradingview.com/script/ BigBeluga <theme>`) → WebFetch of each script page; supplemented by a useThinkScript conversion thread where it exposed concrete math.

## Sourcing caveat (read before trusting quotes)

TradingView **no longer server-renders the Pine source panel** into the script-page HTML — the code block is hydrated client-side, so WebFetch (and JS-rendering reader proxies, which were also tried) return only the description. Mirror hunts (FMZ, GitHub, Scribd, pastebin) found no usable dumps for these ten scripts. Consequently this report has three evidence grades, tagged inline:

- **[desc]** — quoted or paraphrased from the official TradingView description (reliable: BigBeluga descriptions enumerate features, settings names, and visual behavior in detail).
- **[conv]** — math recovered from a third-party ThinkOrSwim conversion thread that mirrors the Pine logic.
- **[idiom]** — reconstruction: the standard Pine v5/v6 implementation pattern that produces the described visual. These are the well-known community idioms (BigBeluga's open scripts follow them), not verbatim code. Treat as "how this class of effect is built in Pine", which is exactly what we need for a clean-room Canvas port.

**License**: every script below carries TradingView's "Open-source script" badge **[desc]**. Exact header lines were not retrievable; BigBeluga open publications typically ship CC BY-NC-SA 4.0 (their headers seen elsewhere read `// © BigBeluga` + CC BY-NC-SA). Operating rule for us: study-only, no code copying, clean-room reimplementation — which these description-level notes already enforce by construction.

Pine platform constants relevant everywhere **[idiom]**: `indicator(..., max_boxes_count=500, max_lines_count=500, max_labels_count=500)` are the hard caps authors raise from the 50-default; oldest drawings garbage-collect automatically when the cap is hit. Transparency is `color.new(color, transp)` with transp 0–100 (100 = invisible); gradients are `color.from_gradient(value, minVal, maxVal, colorLow, colorHigh)`.

---

## 1) Volume Order Blocks [BigBeluga]

- **URL**: https://www.tradingview.com/script/5CpArShF-Volume-Order-Blocks-BigBeluga/
- **Status**: Open-source script, published 2025-03-21 **[desc]**
- **Algorithm [desc]**: Order blocks anchored by **EMA crossovers**, not candle-pattern SMC. Bullish OB forms when "short EMA crosses above the long EMA", placed "at recent lows"; bearish OB on cross-down, at recent highs. A "Sensitivity Detection" input tunes the EMA pair (faster = more blocks). Block volume = "total volume between the EMA crossover bar and the corresponding high (bearish OB) or low (bullish OB)". Percent label: "100% represents the cumulative volume of all OBs in the same category (bullish or bearish)" — i.e. each block's share of the summed volume of all live same-side blocks, so percentages re-normalize as blocks die. Removal: bullish block deleted "when price closes below the bottom of the block"; bearish when close above top.
- **Inputs [desc]**: Sensitivity Detection (int); Midline toggle (bool); Shadow Trend toggle (bool); bull/bear colors. Defaults not published on page.
- **Rendering**:
  - Absolute volume + % shown "next to each order block" **[desc]** → right-edge `label.new(bar_index, mid, txt, style=label.style_label_left)` refreshed on the last bar, one label per live block **[idiom]**.
  - "Dashed midline inside each order block" **[desc]** → `line.new(x1, mid, x2, mid, style=line.style_dashed)` kept in a parallel array with its box **[idiom]**.
  - "Shadow Trend" trend wash with "dynamic color intensity based on price movement" **[desc]** → intensity = `color.from_gradient(normalizedTrendStrength, 0, 1, color.new(c, 95), color.new(c, 55))` painted as background/overlay candles; strength typically distance-from-EMA normalized by ATR **[idiom]**.
  - Block lifecycle → `var array<box>` + `array.unshift` on formation; backwards for-loop each bar checks invalidation, `box.delete(array.remove(...))`; cap enforcement by popping the tail when `size() > showLast` **[idiom]**.

## 2) FVG Order Blocks [BigBeluga]

- **URL**: https://www.tradingview.com/script/xy4EFLtD-FVG-Order-Blocks-BigBeluga/
- **Status**: Open-source script, published 2024-10-14 **[desc]**
- **Algorithm [desc]**: Detects FVGs ("gaps due to strong buying or selling pressure" — the classic 3-candle imbalance `low > high[2]` bull / `high < low[2]` bear **[idiom]**), filtered by a **percentage-size strength filter** ("control which FVGs are displayed based on their percentage size" — gap height as % of price). The order block is then plotted **adjacent to** the gap: "bullish: order block is plotted below the FVG zone; bearish: order block above the zone" — i.e. the origin candle's range becomes the OB, the gap itself the trigger. Each block carries "relative strength by size %". Break handling: "when an imbalance level is broken... the indicator can either delete the level or mark it with a gray color" — dual-mode invalidation. Retests of a surviving block "display potential sell or buy signals".
- **Inputs [desc]**: FVG % strength filter (float); Show Last N order blocks (int); Show Broken Blocks (bool); bull/bear colors; strength bars "can be color-coded based on their percentage".
- **Rendering**:
  - Two stacked boxes per detection (FVG zone + OB zone) with distinct fills; strength shown as a small **bar/percent glyph** color-coded by percentile → `color.from_gradient(sizePct, minPct, maxPct, weakColor, strongColor)` **[idiom]**.
  - Gray-out-on-break is the notable state pattern: instead of deleting, `box.set_bgcolor(b, color.new(color.gray, 90))` + `box.set_border_color(gray)` and stop extending (`box.set_right(bar_index)`) — keeps a visible "consumed" history layer **[idiom]**, mirrored from "mark it with a gray color areas" **[desc]**.
  - Retest signals = triangle/arrow `label.new` at the touch bar **[idiom]**.

## 3) Price Action Smart Money Concepts [BigBeluga] — flagship structure suite

- **URL**: https://www.tradingview.com/script/jvNJYfbL-Price-Action-Smart-Money-Concepts-BigBeluga/
- **Status**: Open-source script, published 2024-08-19, updated 2024-12-23 **[desc]**
- **Algorithm [desc]**: Full SMC stack. (a) **Market structure**: dual-track "Swing" (core) vs "Internal" (fast) structure; BOS vs CHoCH labeling; structure points connected in a "zig-zag pattern" ("Mapping structure"); pivot source selectable — "Algorithmic Logic (Extreme-Adjusted): use max high/low or pivot point calculation" with an "Algorithmic loopback" pivot lookback. (b) **Volumetric order blocks**: formed at reversal points; contain "volume bars representing buying/selling activity within each block"; failed blocks "transform into Breaker Blocks". Overlap suppression via "Hide Overlap"; size via "Construction". (c) **FVG**: normal or "Breaker FVG" mode; mitigation source selectable close/wick/avg; "raids of FVG" flagged. (d) **SFP**: wick-break-and-fail of a prior extreme, volume-threshold filtered, with "white lines showing potential price deviation". (e) **Liquidity**: EQH/EQL ("two or more swing highs/lows at approximately same price level", short/mid/long-term tiers), "Liquidity Prints" (grab wicks), "Sweep Area" liquidation zones, buy/sell-side liquidity with a percentage readout ("strong buy-side pressure (69%)").
- **Inputs [desc]** (names as listed, defaults unpublished): Window, Swing, Mapping structure, Algorithmic Logic, Algorithmic loopback, Show Last, Hide Overlap, Construction, Fair value gaps (normal/breaker), Mitigation (close/wick/avg), SFP lookback, Threshold, Equal H&L (short/mid/long), Liquidity Prints, Sweep Area.
- **Rendering**:
  - Structure lines: solid for swing structure, alternate styling for internal; BOS/CHoCH text labels on the broken level; zig-zag polyline for mapping **[desc]** → `line.new` per leg + `label.new(style_label_down/up)` centered on the break bar **[idiom]**.
  - **Volume bars inside order blocks** — the signature visual: mini intra-zone histogram showing buy vs sell participation of the block's constituent candles → small `box.new` segments laid horizontally inside the zone rect, lengths normalized to zone width **[idiom]**. This is the same "data-inside-the-zone" move as #8's CVD polyline.
  - Sweep markers "x", green/red SFP symbols, color-coded candles by structure regime **[desc]**.
  - Breaker conversion = restyle-in-place (recolor + relabel) rather than delete/recreate **[idiom]**.

## 4) Liquidity Concepts [BigBeluga]

- **URL**: https://www.tradingview.com/script/pII2VRaA-Liquidity-Concepts-BigBeluga/
- **Status**: Open-source script, published 2023-09-01 **[desc]**
- **Algorithm [desc]**: Pivot taxonomy HH/HL/LH/LL (credits LonesomeTheBlue's "Higher Lower" methodology): "an HL point is established when it is lower than an HH point; an LH point is established when it is higher than an LL point". A **verification length** (example: 7 candles) confirms pivots. Liquidity grab: "when one of these points is broken, a line is drawn between the pivot point and the candle that broke it" plus "a box showing all the candles that were involved in the sweep / stop-loss hunt". Grab classes: **Major** boxes when **LH or HL** break (counter-structure liquidity — the meaningful ones), **Minor** when HH or LL break. **Liquidity wicks**: "a pivot point is broken only by the wick and not by the entire body. Bigger wick = more liquidity". Optional trend-based candle coloring.
- **Inputs [desc]**: lookback period; verification length; toggles for pivot labels / boxes / wicks / candle coloring; label text size; colors.
- **Rendering**:
  - Pivot text labels (HH/HL/LH/LL) at swing points; connector line pivot→breaker candle; grab box spanning first-to-last candle of the sweep cluster **[desc]** → `box.new(left=sweepStartBar, right=breakBar, top, bottom)` with major/minor differing by fill opacity/color **[idiom]**.
  - Wick liquidity drawn as a narrow overlay on the wick segment only (from body edge to wick extreme), thickness/opacity scaled to wick length — "bigger wick = more liquidity" **[desc]** → thin `box.new` on (bodyEdge, wickTip) with `color.new(c, 100 - k·wickATRnorm)` **[idiom]**.

## 5) Liqudation HeatMap [BigBeluga] (sic)

- **URL**: https://www.tradingview.com/script/tMtleB1G-Liqudation-HeatMap-BigBeluga/
- **Status**: Open-source script, updated 2025-05-16 **[desc]**
- **Algorithm [desc]**: Proxy liquidation map — no exchange data, no leverage tiers. "Maps areas of potential liquidity using volume or candle range (if volume unavailable)": scans "historical price movements for local highs and lows with elevated volume or candle range", i.e. pivots weighted by activity. "Draws few boxes above and after pivot highs and below pivot lows" and extends them right. Consumption: zones "stop extending once price interacts with them" and it "fades or removes zones once price crosses their midpoints, simulating liquidity being consumed".
- **Inputs**: not enumerated on page **[desc]**.
- **Rendering** — this is the heatmap pattern to steal:
  - Row thickness "automatically adjusts based on volatility (ATR), scaling intelligently across timeframes" **[desc]** — bands are ATR-multiples, not pixel-fixed.
  - Heat scale: "a gradient from lime (low) to yellow (high) to distinguish weak and strong liquidity zones" **[desc]** → `color.from_gradient(zoneVolume, minVol, maxVol, lime, yellow)` per box, usually applied at high transparency (80–92) so overlapping rows self-darken **[idiom]**.
  - **On-chart legend**: "a real-time scale is plotted on the right side, showing the min-max range of volume used for heat calculations" **[desc]** → a vertical stack of small fixed-width boxes at `bar_index + offset`, each cell filled with the gradient sample and labeled min/mid/max — a colorbar built from box primitives **[idiom]**.
  - Fade-on-consumption = progressive transparency bump (`box.set_bgcolor` with higher transp) rather than instant delete **[idiom]**.

## 6) Fair Value Gap & Gap Profile [BigBeluga]

- **URL**: https://www.tradingview.com/script/1FLGV1jW-Fair-Value-Gap-Gap-Profile-BigBeluga/
- **Status**: Open-source script, published 2024-08-26 **[desc]**
- **Algorithm [desc]**: FVG detection with volume attached ("price moved significantly up or down along with a volume"); significance filter; fill tracking (options to show filled gaps and filled gap levels). **Gap Profile**: a side histogram of gap *occurrence density* by price over a lookback — "high points on the FVG Profile indicate areas with a significant number of gaps in the past", read as low-resistance corridors ("price tends to move more fluidly"). Interaction markers "where price interacts with gap levels".
- **Inputs [desc]**: lookback period; significant-gap filter; show filled gaps; show filled levels; show profile; liquidity markers toggle.
- **Rendering**:
  - "Intensivity of color show strength of FVG by volume" **[desc]** — per-gap fill alpha/gradient keyed to the volume of the displacement candle, normalized over the visible gap population → `color.from_gradient(gapVol, lo, hi, faint, strong)` **[idiom]**.
  - Gap Profile = right-side histogram: price axis binned over the lookback (bin height = range/nBins); each bin counts overlapping historical gaps; bar length ∝ count, drawn as `box.new(bar_index+1, binTop, bar_index+1+len, binBottom)` growing rightward from the last bar **[idiom]**.
  - Two-layer history: live gaps (strong) vs filled gaps (faint/outline) — same dual-state layering as #2's gray-out **[idiom]**.

## 7) Multi-Layer Volume Profile [BigBeluga]

- **URL**: https://www.tradingview.com/script/5QtH3KYD-Multi-Layer-Volume-Profile-BigBeluga/
- **Status**: Open-source script, published 2025-05-12 **[desc]**
- **Algorithm [desc]**: Up to **4 nested profiles at fractal time depths — full period, 1/2, 1/4, 1/8** — stacked on one chart to show acceptance across horizons. Per profile: "collects price range (highs/lows) across the selected length; divides this range into equal bins; **assigns volume into bins based on candle close location**; aggregates volume per bin". (Close-bucketing, not HL2 range-spreading — cheaper and it's what the page states.) Tracks total volume and delta volume ("positive for bullish closes, negative for bearish") per profile; POC = max-volume bin.
- **Inputs [desc]**: number of bins ("customizable... more bins = higher granularity, fewer = smoother"), length, per-layer toggles implied.
- **Rendering**:
  - Profiles drawn with **polylines** (explicit in description) — the profile silhouette is one `polyline.new(array<chart.point>)` per layer instead of N boxes: dramatically cheaper object count and gives the stepped-outline look **[desc]+[idiom]**.
  - "Thick blue POC line" per layer; "horizontal reference lines showing its high, low bounds"; total volume label "at the top", delta label "at the base" **[desc]**.
  - Nesting effect: shorter-depth profiles drawn over longer ones with higher opacity, so shared acceptance zones visually reinforce **[idiom]**.

## 8) High Volume Pivot Support & Resistance Zones [BigBeluga]

- **URL**: https://www.tradingview.com/script/AFbHxgBM-High-Volume-Pivot-Support-Resistance-Zones-BigBeluga/
- **Status**: Open-source script, published 2026-06-26 **[desc]**
- **Algorithm [desc]**: Swing pivots qualified by institutional volume: "a zone is only plotted if the pivot bar's volume beats the baseline multiplier" (baseline = volume MA of configurable length × threshold multiplier). Zone role reversal: "when a strong candle close breaks entirely through a zone", support↔resistance flips. Inside each live zone it computes an intra-zone **CVD** ("buying volume minus selling volume based on candle closes").
- **Inputs [desc]**: resistance/support pivot lengths; volume MA length; volume threshold multiplier; support color (yellow) / resistance color (blue); background transparency; label text size.
- **Rendering** — richest zone-object vocabulary in the batch:
  - "Embedded Zone CVD Lines": the CVD series is **normalized into the box height and drawn with custom polylines inside the zone**, plus "a small text readout on the leading edge of the box showing current net CVD" **[desc]**. Data-inside-the-zone again — a sparkline clipped to the zone rect.
  - Break restyling: "broken boxes switch color and border from **solid to dashed**" and swap role colors **[desc]** → `box.set_border_style(line.style_dashed)` + color swap, in place **[idiom]**.
  - Marker vocabulary: "triangle up/down arrows (▲▼)" labeled "Res Breakout"/"Sup Breakdown"; "tiny circle markers" for holds/retests; "diamond marker to flag an advanced flipped S/R retest" **[desc]** — three glyph tiers encoding event significance.

## 9) DeltaFlow Volume Profile [BigBeluga] — supplementary (rendering-dense)

- **URL**: https://www.tradingview.com/script/JUWuAXdx-DeltaFlow-Volume-Profile-BigBeluga/
- **Status**: Open-source script, published 2025-09-15 **[desc]**
- **Algorithm [desc]**: One profile, flow-enriched bins (Bins input range **10–100**). "Within every bin, volume is separated by candle direction into Bull Volume and Bear Volume, then normalized to % of the bin's displayed size." Delta % = "difference between Bull % and Bear % for the bin; positive = buyer dominance". Highest-volume bin gets the PoC band.
- **Inputs [desc]**: LookBack; Bins (10–100); Offset; toggles Delta / Heat Map / Volume Bars / PoC color; separate bull/bear colors.
- **Rendering**:
  - Per bin: "a clean horizontal volume bar plus **stacked Bull % and Bear %**" segments — two-color stacked rect per row — and "a readable 'Δ xx%' tag at the start of each bin" **[desc]**.
  - "Delta Heat Map: optional gradient that **intensifies with higher volume and stronger delta**" — a 2-factor color map (magnitude × bias) **[desc]** → hue from delta sign, saturation/alpha from volume rank: `color.from_gradient(absDelta·volRank, ...)` composed per row **[idiom]**.
  - "PoC band colored separately, labeled with absolute volume (e.g., '1.23M')" **[desc]** — human-format volume abbreviation in labels.

## 10) Market Structure Trend Matrix [BigBeluga] — the one with recovered math

- **URL**: https://www.tradingview.com/script/EdtttXPC-Market-Structure-Trend-Matrix-BigBeluga/
- **Status**: Open-source script **[desc]**; math recovered from the useThinkScript conversion (thread 22402) **[conv]**.
- **Algorithm [conv]**: Pivot = strict window extreme: `ph = high[msLen] == highest(high, 2·msLen+1)[msLen]`, symmetric for lows — i.e. `ta.pivothigh(msLen, msLen)`. **ChoCh** fires on `close crossing above phVal` (bull) / `below plVal` (bear). After a break it projects **four ATR-multiple profit targets** from the break level and runs a **ratcheting ATR trailing stop**: `atrTS = max(atrTS[1], close − atr·atrMult)` in bull trends (monotonic, never loosens) — classic chandelier ratchet.
- **Rendering [desc]+[conv]**: target ladder = stacked horizontal levels labeled T1..T4 above/below the ChoCh break, trailing stop drawn as a stepped line; "matrix" refers to the multi-level labeled ladder. Level ladders + ratchet lines are cheap wins for our engine.

---

## Recurring building blocks (and how we replicate them in SVG/Canvas)

**B1. Zone object pool with state machine (form → extend → restyle-on-break → fade/delete).**
Every script manages `var array<box/line/label>` pools: unshift on formation, backwards-iterate for invalidation each bar, restyle in place (gray-out, dashed border, role-flip) instead of delete when history matters, pop the tail past Show-Last-N.
*Ours*: a `Zone[]` store per overlay (type, priceTop/Bottom, birthIndex, state: live|broken|consumed, styleKey). Canvas draws only zones intersecting the visible index/price window; eviction is array splice — we have no 500-object platform cap, but keep a budget (~300 zones/overlay) and LOD-cull sub-pixel zones. State transitions swap a style token, never rebuild geometry.

**B2. Translucent fill + darker border, letting alpha compositing do the work.**
Pine zones are `bgcolor ≈ transp 80–92`, border transp 0–60. Overlaps (OB inside FVG inside sweep box) read correctly because translucent fills stack multiplicatively.
*Ours*: `ctx.fillStyle = rgba(c, 0.08–0.2)` + 1px `strokeRect` at 0.5-offset for crispness; draw zones back-to-front by birth so newer zones sit on top; never use opaque fills for zones. In SVG: `fill-opacity` on `<rect>`, border via `stroke`.

**B3. Value→color intensity ramps (`color.from_gradient`).**
Used for: FVG volume strength (#6), OB strength % (#2), heat rows lime→yellow (#5), shadow-trend intensity (#1), delta heat 2-factor map (#9).
*Ours*: `lerpColor(t)` in OKLCH (percептually even, matches our dataviz doctrine) with t = rank-normalized metric over the *currently visible population* (BigBeluga normalizes over the lookback population — rank-normalize to be robust to outliers). For 2-factor maps (#9): hue from sign/bias, alpha or chroma from magnitude.

**B4. Heatmap-as-rows + on-chart colorbar legend (#5).**
Rows are ATR-scaled price bands anchored at pivots, extended right until consumed, colored by activity gradient, faded when price crosses midpoint; a right-side min→max gradient scale is built from stacked cells.
*Ours*: horizontal strip rects in price space (height = k·ATR at anchor time), consumption sets `state=fading` and animates alpha down over ~n frames. Colorbar = one offscreen vertical `createLinearGradient` rect + min/max text — trivial in Canvas, and we should standardize it for every heat overlay (GEX heat, liquidity heat).

**B5. Side profile histograms in price space (#6, #7, #9).**
Bin the price range (`nBins` equal slices over a lookback), accumulate a per-bin metric (volume by close-bucket, gap count, bull/bear split), draw right-anchored horizontal bars with length ∝ value; mark POC bin with a contrasting band; stack bull/bear as two segments; annotate bins with Δ% tags and the POC with an abbreviated absolute ("1.23M").
*Ours*: single path per profile — build the stepped silhouette as one `Path2D` polyline (BigBeluga's own move in #7: polylines, not N boxes) and fill; stacked splits as two fills sharing the silhouette baseline. Bin count 10–100 (#9's published range) is a sane input spec. Profile lives in an overlay lane pinned to the right edge of the pane, x-budget ≈ 15–20% of pane width.

**B6. Data-inside-the-zone: embedded mini-series and mini-histograms (#3, #8).**
BigBeluga's differentiator: zones aren't dumb rects — an OB carries intra-block buy/sell volume bars (#3), an S/R zone carries a CVD sparkline normalized to box height with a leading-edge numeric readout (#8).
*Ours*: when a zone's screen height > ~28px and width > ~60px, render an embedded layer: normalize the series to the zone rect (`y = zoneBottom + (v−min)/(max−min)·zoneHeight`), draw as 1px polyline or micro-bars clipped via `ctx.save(); ctx.clip(zoneRect)`. Below the size threshold, degrade to border-only + tooltip. This is high-value for our OB/FVG overlays and costs little.

**B7. Multi-pass glow / soft emphasis.**
Pine has no blur; glow = re-plotting the same series 2–4× with increasing `linewidth` and increasing transparency (e.g. lw8@transp90 → lw5@transp78 → lw2@transp0), and "shadow trend" washes are wide, high-transp gradient bands behind price.
*Ours*: either the honest port (3 strokes, widths 8/5/2, alphas .07/.16/1 — predictable, batchable) or native `ctx.shadowBlur`/SVG `feGaussianBlur` (prettier, slower — cache to an offscreen canvas per series revision). Use for POC lines, active trailing stops, signal emphasis.

**B8. Break/retest marker vocabulary (#8, #3, #4).**
Consistent glyph tiers: ▲▼ = breakout events (with text like "Res Breakout"), ○ small circles = ordinary retest holds, ◆ diamonds = flipped-role retest (highest-signal), ✕ = liquidity sweeps, plus HH/HL/LH/LL and BOS/CHoCH text labels at structure points.
*Ours*: a shared `MarkerGlyph` atlas (canvas paths for triangle/circle/diamond/cross drawn at 3 sizes), semantic tiering encoded in size+fill (filled = confirmed, hollow = tentative). Text labels get collision-avoidance (stack upward per bar like Pine's automatic label stacking).

**B9. Wick-liquidity overlay (#4, #3 "liquidity prints").**
A thin translucent box drawn only over the wick segment (body edge → wick tip) of grab candles, opacity/width scaled by wick length ("bigger wick = more liquidity").
*Ours*: rect of width ≈ 0.6·barWidth centered on the bar, alpha = clamp(wickLen/ATR·k); cheap, reads instantly. Good candidate for our sweep detector overlay.

**B10. Dual-state history layers (live vs consumed).**
Broken FVGs/OBs gray out instead of vanishing (#2, #6 filled-gap levels, #5 fade-on-consumption); borders go dashed on break (#8); breakers get recolored in place (#3).
*Ours*: one `state → style` map per overlay {live: full color, broken: gray 0.06 alpha + dashed 1px (ctx.setLineDash([4,3])), consumed: alpha→0 tween then cull}. Keeping consumed geometry (capped) enables the "was this respected before" read that makes these tools feel institutional.

**B11. Ladders and ratchets (#10).**
ATR-multiple target ladders (T1..T4) projected from a break level; monotonic trailing stop `ts = max(ts[1], close − k·ATR)` drawn as a stepped line.
*Ours*: ladder = 4 horizontal segments + right-edge labels from one anchor object; ratchet = stepped `Path2D` (horizontal-then-vertical segments only). Both are pure-geometry overlays reusable across signal engines (GC-v2 targets, alert levels).

**B12. Population-relative labeling.**
Strength numbers are relative shares, recomputed as the population changes: OB % = share of cumulative same-side OB volume (#1), FVG strength normalized over visible gaps (#6), heat legend min/max from the current window (#5).
*Ours*: recompute label values on every data-window change (pan/zoom), not at object creation — store raw metrics on the object, format at draw time (with the K/M/B abbreviator from #9).

## Cross-cutting input-spec defaults worth adopting

From the published input surfaces: pivot length ~msLen with strict `2n+1` window extremes; profile bins 10–100; Show-Last-N for zone caps; volume filter = volume MA length × threshold multiplier; mitigation source selectable **close / wick / avg** (three-way, #3) — adopt that tri-state on every zone-invalidation rule we ship; broken-zone handling selectable **delete / gray-keep** (#2).

---

# 17 — TV Technique Mining: BigBeluga, Trend + Oscillators

Mined 2026-07-28 via WebSearch/WebFetch from public TradingView script pages and public forum mirrors
(useThinkScript conversion threads, marketcalls port article). TradingView pages render the description
server-side but lazy-load the Pine source pane, so exact code was recovered where public mirrors quote it;
everything else is from the author's own detailed "how it works / visuals" description text.

**License context.** BigBeluga's open-source scripts carry the Creative Commons
**Attribution-NonCommercial-ShareAlike 4.0** header (verified verbatim in the Top G source, and referenced in
the useThinkScript threads). That license does NOT permit us to port code verbatim into a commercial product.
Treatment here is therefore: understand the *technique* (math + rendering pattern), reimplement clean-room in
our own renderer. Short attributed excerpts below are quoted for analysis only. One script encountered
(Nautilus Oscillator) is premium/invite-only — description noted, no code sought, nothing to reuse beyond
publicly stated behavior.

---

## 1) Top G indicator [BigBeluga] — FULL ORIGINAL SOURCE RECOVERED

- **URL:** https://www.tradingview.com/script/JOE1tYTo-Top-G-indicator-BigBeluga/
- **License:** open-source, CC BY-NC-SA 4.0, `//@version=6`, `overlay=true, max_labels_count=500`
  (source quoted in the useThinkScript conversion thread usethinkscript.com/threads/…20471/)
- **Algorithm (exact):**
  - `length = 150` (single int input) + one main color input (default bronze `#CD7F32`).
  - Channel: `lowest(150)`, `highest(150)`; midline = `HMA(avg(lowest, highest), 15)`.
  - Momentum z-score: `roc = ta.roc(close, 8); roc := roc / ta.stdev(roc, 200)` — ROC normalized by its own
    200-bar stdev, i.e. a self-scaling z-score, thresholds at ±2.
  - **Top signal:** high pulls back off the upper channel (`high < highest and high[1] == highest[1]`) while
    z-score 2 bars ago > 2 and the *low* side has been flat 5 bars (`lowest == lowest[5]`) — i.e. blow-off at
    the top of a stable base. **G signal** (bottom): mirror image with z < -2.
  - "Simple" top/bottom variants: same channel-touch geometry without the z-score condition.
  - All signals gated by `barstate.isconfirmed` (no intrabar repaint).
- **Rendering (exact idioms, quoted for analysis):**
  - Floating glyph labels with an invisible chip: `col_na = color.new(color.black, 100)` used as label
    background, only `textcolor` visible. Marker text is a Unicode glyph: `"𝔾"`, `"^"`, `"˅"`, `"Top"`,
    `style_label_up`, `size.large`.
  - Two-tier signal strength encoded purely by text alpha: strong = opaque main color, weak/simple =
    `color.new(main_col, 30)`.
  - **Fake dashed line** by alternating bar visibility: `plot(highest_src, color = bar_index % 2 == 0 ?
    main_col : na)`.
  - **Glow** = duplicate plot layering: `plot(lowest_src, color=main_col, linewidth=1)` PLUS
    `plot(lowest_src, color=color.new(main_col, 80), linewidth=5)` — thin solid core over a wide 80 %-transparent
    underlay of the same series.
  - Channel interior wash: `fill(pl, ph, …, color.new(main_col, 90))` — 90 % transparency fill.

## 2) Two-Pole Oscillator [BigBeluga]

- **URL:** https://www.tradingview.com/script/2Ssn4yDZ-Two-Pole-Oscillator-BigBeluga/
- **License:** open-source (CC BY-NC-SA per mirror thread).
- **Algorithm:** price deviation from a mean (close minus SMA, stdev-normalized) → **two-pole low-pass filter**
  → output bounded ~[-1, +1]. The two-pole filter is two cascaded one-pole smoothers; the public AmiBroker port
  (marketcalls.in) implements it as `omega = 2π/len; alpha = damping*omega; beta = omega²;
  f1 += alpha*(src−f1); f2 += beta*(f1−f2)` — a damped cascade, i.e. Gaussian-ish smoothing with almost no
  overshoot. Signal line = time-shifted copy of the oscillator (release note: "signal offset changed to 0,
  default length set to 15"; originally the signal was the oscillator delayed ~4 bars). Buy/sell = oscillator
  crossing its signal line; each signal spawns a horizontal **invalidation level** at the signal price — if
  price later crosses it, an "X" is plotted there (stop-loss semantics). The ThinkOrSwim conversion thread
  flags that signal plotting references a future bar (`[-1]`) — markers confirm one bar late on TV too.
- **Inputs:** length (default 15), up/down colors, signal display toggles.
- **Rendering:** the signature move is **value-keyed alpha gradient** on the oscillator and its markers,
  verbatim pattern (from search-indexed source text):
  - `color.from_gradient(two_p, -1, 1, up_color, color.new(up_color, 0))`
  - `color.from_gradient(two_p, -1, 1, color.new(dn_color, 0), dn_color)`
  Near 0 the line/markers are most transparent ("weak"), approaching ±1 fully opaque ("strong") — transparency
  itself is the strength channel. Signals plot with price values in the marker label; "X" labels mark
  invalidations at the exact crossover point.

## 3) DSL Oscillator [BigBeluga] — full algorithm via conversion mirror

- **URL:** https://www.tradingview.com/script/bVMgRGq8-DSL-Oscillator-BigBeluga/
  (mirror: usethinkscript.com/threads/…19996/ — samer800 conversion, line-faithful)
- **License:** open-source.
- **Algorithm (exact, reconstructed from the conversion):**
  - Inputs: DSL Length = 10, DSL Mode = Fast|Slow, RSI Length = 10.
  - Base series: `RSI(close, 10)`.
  - **DSL ("Discontinued Signal Lines") primitive** — the reusable core:
    `up := (src > SMA(src, len)) ? up[1] + (k/len)·(src − up[1]) : up[1]` and mirrored `dn` for `src < SMA`,
    with `k = 2` (Fast) or `1` (Slow). Each line only *moves while price is on its side of the mean*, else it
    freezes — produces stair-step adaptive thresholds that remember the last excursion.
  - Oscillator = `ZLEMA((up + dn)/2, 10)`; ZLEMA: `lag = floor((len−1)/2); EMA(2·src − src[lag], len)`.
  - Adaptive OB/OS: run the same DSL primitive *on the oscillator itself* (len 10) → `level_up`, `level_dn`.
  - Signals: cross **above `level_dn` while osc < 55** = buy; cross **below `level_up` while osc > 50** = sell
    (zone filters stop counter-trend chop).
- **Rendering:** main line 2 px, colored by a normalized 0–100 position between the dynamic levels mapped to
  RGB `(255 − col·2.55, col·2.55, 255)` — i.e. a purple→aqua sweep with blue held at 255 (Pine equivalent:
  `color.from_gradient` between level_dn and level_up). Levels drawn as short-dash green/red lines. Signal
  markers = colored dots ON the oscillator line (cyan/magenta). Static context: mid 50, translucent
  green cloud 55–75, red cloud 25–45 (OB/OS wash bands rather than hard lines).

## 4) Target Trend [BigBeluga] — full algorithm via conversion mirror

- **URL:** https://www.tradingview.com/script/QoUmKd1H-Target-Trend-BigBeluga/
  (mirror: usethinkscript.com/threads/…20002/)
- **License:** open-source. `overlay=true, max_lines_count=40`.
- **Inputs:** Trend Length = 10, Set Targets multiplier = 3.5, Show Last Trend Only (bool).
- **Algorithm (exact):**
  - Volatility unit: `atr_value = SMA(ATR(200), 200) × 0.8` — a *very* slow, stable ATR so bands and target
    spacing don't breathe bar-to-bar.
  - Bands: `SMA(high, 10) + atr_value` and `SMA(low, 10) − atr_value`.
  - Trend flip: close crossing above the upper band → up; below lower band → down (plain cross, no
    confirmation count).
  - On flip: entry = close; stop = opposite band value at flip; targets = entry ± atr_value × 3.5 × {1,2,3}.
  - A target is retired the bar after high/low tags it (`hi[1] >= tgt[1] and cntUp > 1`); remaining levels
    persist until trend flips. Stop-out detected when the flip bar's close breaches the stored stop.
- **Rendering:** trailing one-sided band under/over price with translucent cloud between band and `hl2`;
  entry marked with a triangle + price label; entry line dashed gray, stop red, targets green horizontal lines
  extending right; **labels are stateful** — target label flips to a check mark when hit; stop label flips to
  "X" and the line style flips to dashed on stop-out. Old trends' objects pruned (Show Last Trend Only) to
  respect object-count limits.

## 5) Trend Pulse [BigBeluga]

- **URL:** https://www.tradingview.com/script/J5o0F0GR-Trend-Pulse-BigBeluga/
- **License:** open-source.
- **Algorithm (from author description):** structure-driven regime engine. Bearish flip = break below a
  *confirmed pivot low*; bullish flip = break above an **adaptive volatility band** = SMA whose *length
  expands dynamically* plus ATR offset, and which deliberately widens during bearish phases — the longer/older
  the down-regime, the harder a reversal is to trigger ("trend aging" bias). No oscillator involved.
- **Rendering:** candles inherit the active regime color (time-based candle painting); confirmed pivots and
  break points get structural markers; the adaptive band plots as the regime's trailing edge.

## 6) TrendWave Bands [BigBeluga]

- **URL:** https://www.tradingview.com/script/fx48Ku4A-TrendWave-Bands-BigBeluga/
- **License:** open-source.
- **Algorithm:** adaptive upper/lower trend bands; only the band on the *trend side* is emphasized (lower band
  in uptrends, upper in downtrends); flip on band violation; circular markers at reversals.
- **Rendering — the interesting part (recency-keyed gradients, two directions at once):**
  - Main trend band gradient **fades as the trend continues** (opaque at birth → transparent as it ages).
  - A dashed **"wave band" on the opposite side runs the inverse ramp** — faint at trend birth, intensifying
    as the trend matures (visual "pressure building" cue).
  - Reversal signals are circular markers on the band. Net effect: bars-since-flip drives alpha on two
    mirrored layers.

## 7) Gradient Range [BigBeluga]

- **URL:** https://www.tradingview.com/script/6jAT3TT6-Gradient-Range-BigBeluga/
- **License:** open-source.
- **Algorithm:** range box = highest/lowest **close** over a user lookback; dashed midline at the box average;
  regime gate: **ADX < 35 = ranging**, else trending (box logic active only in ranging state). Mean-reversion
  signal: a candle *wick* pokes outside the box and price closes back inside → white circular sweep marker at
  the extreme.
- **Rendering:**
  - **Gradient candles inside the box:** candle color interpolated by vertical position between bounds —
    near-top candles shaded bearish (purple), near-bottom bullish (lime), continuum through the middle
    (per-candle `color.from_gradient(close, boxLow, boxHigh, lime, purple)` pattern with custom plotcandle).
  - **Last-bar-only rendering:** "all calculations and visual elements are processed only on the last bar" —
    box, midline, recolored candles and markers are rebuilt from the latest bar's state instead of being
    incrementally accreted → cheap live re-render, no object-lifecycle bookkeeping.

## 8) Multi-Timeframe Trend Analysis [BigBeluga]

- **URL:** https://www.tradingview.com/script/zfkp3wZA-Multi-Timeframe-Trend-Analysis-BigBeluga/
- **License:** open-source.
- **Algorithm:** 5 user-selected timeframes, each with its own EMA length (request.security per TF); per-TF
  trend = EMA rising vs falling; alignment read off the set.
- **Rendering — dashboard + opacity ladder:**
  - **Table top-right, one row per timeframe:** cell shows the TF and an arrow glyph — "green arrows (🢁) for
    uptrends, purple arrows (🢃) for downtrends" (BigBeluga's up/down palette is green/purple, not green/red).
  - **Opacity ladder on the chart:** all five EMAs plotted with *gradually increasing opacity* by rank
    (fastest = most transparent, slowest = most vivid), plus gradient fills between adjacent EMAs → a ribbon.
  - On-chart flip arrows reuse the same alpha-by-rank encoding.

## 9) Equilibrium Momentum Shift + Divergence [BigBeluga]

- **URL:** https://www.tradingview.com/script/467SFOco-Equilibrium-Momentum-Shift-Divegence-BigBeluga/
- **License:** open-source.
- **Algorithm:** equilibrium = midpoint of highest-high/lowest-low over a range length; oscillator =
  price deviation from that midpoint, double-EMA smoothed, **normalized by half the current range height,
  then compressed with tanh into [-1, +1]**; signal line = EMA of the oscillator; histogram = osc − signal.
  Divergence: classic two-pivot compare — price LL vs oscillator HL (bullish), price HH vs oscillator LH
  (bearish), auto-labeled.
- **Rendering:** gradient-colored oscillator line keyed to directional bias; MACD-style histogram (expansion =
  strengthening); equilibrium midline also plotted on the price chart; divergence lines + labels drawn on the
  oscillator; **mini dashboard** cells: Shift, State (Bullish/Bearish/Neutral), Range Position %, Pressure.

## 10) Regression Slope Oscillator [BigBeluga] (supporting entry)

- **URL:** https://www.tradingview.com/script/5W4FYJfC-Regression-Slope-Oscillator-BigBeluga/
- **License:** open-source.
- **Algorithm:** loops linear-regression slope over many lookbacks (Min Range → Max Range in Step increments)
  and averages them into one oscillator — an ensemble slope. Signals only on confirmed bars: osc crosses above
  signal **while below zero** = bullish reversal; crosses below **while above zero** = bearish.
- **Rendering:** oscillator *and candles* colored on a continuous ramp from oversold (orange) to overbought
  (aqua), normalized against slope extremes seen inside a user "Color Range" window (rolling min/max
  normalization for the gradient domain, not fixed bounds); 2-cell dashboard table top-right: slope sample
  count + current averaged slope.

## (Excluded) Nautilus Oscillator [BigBeluga]

- **URL:** https://www.tradingview.com/script/1odom906-Nautilus-Oscillator-BigBeluga/ — **premium/invite-only,
  NOT open-source**; excluded from technique mining per clean-room rules. Public description only: flat-passband
  smoothing filter, volatility-adaptive thresholds, green↔purple gradient line, histogram, tiered markers
  (circles = strong, X = simple, dots = histogram crosses), 1-vs-3 threshold lines encoding trend strength,
  status dashboard.

---

# Recurring building blocks (and how we replicate them in SVG/Canvas)

**1. Value-keyed alpha gradient on a line (`color.from_gradient(osc, -1, 1, transparent(col), col)`)**
Seen in Two-Pole, DSL, Equilibrium, Regression Slope: color AND alpha are functions of the oscillator value,
so transparency itself encodes signal strength. Canvas/SVG has no per-vertex stroke color, so replicate by
splitting the polyline into per-bar 2-point segments and assigning each segment `stroke`/`globalAlpha` from a
lerp of the segment's mean value; at our bar densities (≤ ~2k segments) this is cheap and is exactly how
Pine renders it internally (per-bar plot coloring).

**2. Glow = stacked duplicate strokes, not blur**
Verbatim in Top G: 1 px solid core + 5 px same-color 80 %-alpha underlay of the *same series*. Replicate by
stroking the same Path2D 2–3 times: width 6 at alpha 0.15, width 3 at alpha 0.3, width 1.5 at alpha 1.0 —
cheaper and crisper than `shadowBlur`/`feGaussianBlur` and identical to the TV look. Same trick applies to
marker dots (big translucent circle under small solid circle).

**3. Recency/age-keyed alpha ramps**
TrendWave fades the trend band as it ages and *inversely* intensifies the opposite dashed band; MTF ladder
maps EMA rank to opacity. Replicate with `alpha = clamp(f(barsSinceEvent))` per segment — one uniform per
segment in Canvas; in SVG, group segments into a handful of alpha buckets to keep node count down.

**4. Floating glyph labels with invisible chips + alpha tiers**
Top G's `label.new(bg = 100 % transparent, textcolor = col)` with Unicode glyphs (𝔾 ^ ˅ ✓ ✖ ▲) and strength
tiers via text alpha (0 vs 30). Replicate as bare `<text>` (SVG) / `fillText` (Canvas) anchored to (bar, price)
with no background rect; tier by fill-opacity. Use ✓/✖ text swaps for stateful levels (see #6).

**5. Stateful level objects (entry/stop/targets) with lifecycle**
Target Trend: on regime flip, create {entry, stop, t1..t3} anchored at the flip bar, extend right; retire a
target when tagged (swap its label to ✓), flip stop line to dashed + ✖ on stop-out; cap retained trends
(`max_lines_count`, "last trend only"). Replicate as an array of level objects {price, bornBar, status} owned
by the indicator, re-rendered each frame; prune beyond N regimes — mirrors Pine's object-count limits and
keeps redraw O(visible objects).

**6. One-sided band + translucent cloud between band and price midline**
Target Trend/Trend Pulse draw only the trend-side band and fill band↔hl2 at ~90 % transparency. Replicate
with a single polygon: band polyline forward + midline polyline reversed, `fill-opacity ≈ 0.08–0.12`, no
stroke; regime color swaps at flip points by splitting the polygon per regime segment.

**7. Gradient candles by position within a container**
Gradient Range recolors candles by proximity to box bounds (lime→purple). Replicate by computing
`t = (close − lo)/(hi − lo)` per candle and lerping body/wick fill; keep the normal palette outside the box.
This is a per-candle override channel our renderer should expose generically (indicator → candlePaint map).

**8. Dashboard tables with glyph cells**
MTF (5 rows, 🢁/🢃 green/purple), Regression Slope (2 cells), Equilibrium (Shift/State/Range %/Pressure).
Replicate as a corner-pinned HTML overlay (position: absolute over the canvas) rather than canvas-drawn text:
rows = metrics, cell bg = state color at low alpha, glyph + value text; recency fades = cell bg alpha keyed
to bars-since-update. Keep it DOM so it never redraws with the chart.

**9. Fake dash via alternating segments — use native dashes instead**
Pine lacks dashed `plot`, hence `bar_index % 2` visibility toggling (Top G). We have real
`setLineDash`/`stroke-dasharray`; the takeaway is semantic: BigBeluga uses dashed = secondary/contextual
(wave band, midline, stopped-out lines), solid = active edge. Adopt that hierarchy.

**10. Normalization idioms for stable gradient domains**
Recurring math trio: z-score by rolling stdev (Top G's roc/stdev(200)); tanh compression to [-1,1]
(Equilibrium); rolling min/max window normalization for the color domain (Regression Slope's "Color Range").
All three exist to make gradient mapping *stationary*. Our engine should expose them as reusable transforms
(zscore(n), tanh, rollingMinMax(n)) feeding any color ramp.

**11. DSL (discontinued signal lines) as an adaptive-threshold primitive**
`line := onSide ? line + (k/len)·(src − line) : line` — freezes when price is on the other side of its mean.
Two uses in one script: on the RSI, then again on the oscillator to make adaptive OB/OS levels. Trivial to
implement as a stateful transform; renders as stair-step dashed lines.

**12. Repaint hygiene patterns**
`barstate.isconfirmed` gating on all signal labels (Top G, Regression Slope "confirmed bars only"), and the
Two-Pole thread demonstrates why: its `[-1]` future-reference variant can't scan. Our port rule: signals
evaluate on bar close; live bar may preview at reduced alpha but must be marked provisional.

---

*Clean-room note: algorithms above are re-stated from public descriptions and public mirrors for technique
understanding. Reimplementations must be written from this spec's math, not from quoted Pine, and must not
reuse BigBeluga naming, default color hexes as a set, or text/branding.*

---

