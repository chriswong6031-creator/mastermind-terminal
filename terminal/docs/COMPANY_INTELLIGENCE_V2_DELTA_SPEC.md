# Company Intelligence v2 — Terminal delta specification

**Status:** specification for review. **Not an implementation.** No component in
`terminal/components/fin/` is changed by this branch.

**Ticket:** R0-D Terminal half, Earnings / Company Event Suite Wave 0
([remaining-build handoff](https://github.com/chriswong6031-creator/macro/blob/main/research/EARNINGS_COMPANY_EVENT_SUITE_REMAINING_BUILD_HANDOFF_FOR_CLAUDE_2026-08-06.md) §5 R0-D, §8 UI and UX release law).

**Shaped by:** the frozen Wave 1 producer contract
(`research/EARNINGS_WAVE1_CONTRACT_FREEZE_2026-08-06.md`, answers Q1–Q5).

**Gates:** Wave 2B (claim-cited Brief + multi-document source rail), Wave 3B
(search / compare / calendar / saved UX), Wave 5B (Slides + History Mode).
Nothing in those rows starts until these compositions are approved.

**Reference compositions:** [`docs/refs/company_intelligence_v2/`](refs/company_intelligence_v2/)
— open `index.html`. 14 pages (7 states × EN/ZH), 42 screenshots at 1440 / 820 / 390.

---

## §0 · Acceptance gates

A Wave 2B/3B/5B PR is **not done** unless all of the following hold. These are
gates, not aspirations.

1. **Every visible fact resolves or is named.** A rendered claim carries either an
   exact receipt (`event_id → document_revision → span | cell | region`) or a
   named absence with a reason and a fill condition. There is no third option and
   no blank.
2. **No claim state is painted with `--up` or `--down`.** Availability is not a
   price direction. A zh red-up reader must see the identical receipt palette.
3. **The golden corpus is the grading key, not a suggestion.** A build that
   resolves materially more than 155 of 234 cases to an exact receipt is
   manufacturing citations. 49 typed absences is a floor, not a defect count.
4. **Contract enum names never reach the screen.** `typed_absence`,
   `exact_receipt`, `duplicate_collapsed`, `quarantined`, `claim_citations_pending`,
   `not_covered`, `metadata_only` are internal. The user reads plain words.
5. **Per-step visual crops at 1440 / 820 / 390, EN and ZH, in the PR body**, against
   these reference compositions. `npm run test:e2e:responsive` passes from `terminal/`.
6. **No model confidence, sentiment, positivity, criticism or directional score is
   rendered**, even though the typed client already carries those fields (§11.3).
7. **The word `validated` does not appear in user-facing copy** (§11.1).
8. **No new font family, no vendor visual identity, no CDN asset.** The existing
   `--font-ui` / `--font-num` / `--font-code` stack only.

---

## §1 · What this delta is, and what it refuses to be

Terminal already has a polished, responsive Company Intelligence v1 (PR #313,
extended by #319/#323/#332). **This spec restyles none of it.**

The single problem v2 solves: today every generated brief carries one
event-level `claim_citations_pending = true`. Under the frozen contract (Q3)
that boolean dies and each claim carries either an exact receipt or a typed
absence. A boolean cannot express "nine claims cited, one not" — and the corpus
says 49 of 234 difficult cases land in absence.

So the design problem is not "show citations". It is:

> **make a stated absence look like an honest, finished answer — in the same
> grammar, at the same size, in the same slot as a receipt — so a reader trusts a
> page that is half absent exactly as much as one that is fully cited.**

A design that only looks good when every claim is cited is the wrong design.

---

## §2 · Component-by-component verdict

A reviewer should be able to confirm from this table alone that nothing
already-good is being rebuilt.

| Component | Verdict | What changes |
|---|---|---|
| `CompanyIntelligencePage.tsx` — hero, provenance bar, lens bar, workspace grid, event `<select>`, skeleton, error/empty routing | **unchanged** | Geometry, gradients, sticky lens bar, roving-tabindex keyboard model, `1fr / 352–390px` grid all kept verbatim. |
| `CompanyIntelligencePage.tsx` — claim buttons (`.ci-stance-copy`, `.ci-metric`, `.ci-change-row`, `.ci-quote button`) | **extended** | Already buttons wired to `chooseEvidence`. v2 adds one state class + one trailing locator element. No new interaction. |
| `CompanyIntelligencePage.tsx` — metric tile **labels** | **extended** | Labels stop being hardcoded `Revenue growth / EPS growth / Gross margin / Analyst questions` and come from each claim's own basis (§5.1). A bank has no revenue line. |
| `CompanyIntelligencePage.tsx` — `statusColor()`, transcript status tag | **repaired** | `var(--up)` → receipt-family token (§11.2). |
| `CompanyIntelligencePage.tsx` — `not_covered` empty copy | **repaired** | Drop the word `validated` (§11.1). |
| `EvidenceRail.tsx` — shell, overlay/dialog switch at 1100px, focus trap, `inert`, Escape handling, scrim, focus restore | **unchanged** | This is the best-built thing in the workspace. v2 reuses it exactly. |
| `EvidenceRail.tsx` — body (`.ci-receipt-card` rows, the pending-attribution note) | **extended** | Row set becomes per-claim: document, revision, paragraph, character span, basis, period, currency, fingerprint, known-at. The "span pinning is still pending" note is replaced per state (§5.2). |
| `EvidenceRail.tsx` — `derived_comparison` block | **unchanged** | Already correctly separates a cross-event calculation from a source receipt. Keep the idiom; v2 reuses it for QoQ deltas. |
| `CompanySourceManifest.tsx` | **wrapped** | Today: three fixed `kind`s with one status each. v2 wraps it in a document-revision list (N revisions, supersession and duplicate lineage). The existing row anatomy — icon, title, note, status, Read/Open — survives as the inner row. `var(--up)` repaired (§11.2). |
| `TranscriptSearchWorkspace.tsx` | **unchanged** | Exact ticker-scoped literal search and two-event comparison stay as the explicit exact mode (handoff Wave 3, first bullet). Corpus-wide search is a **different surface** (§5.6), not a replacement. |
| `TranscriptDrawer.tsx` | **unchanged** | Remains the source body. One repair: drop `validated` (§11.1). v2 adds no second reader. |
| `MegaPane.tsx` | **extended** | `FIN_PAGES` gains nothing. The two new lenses live inside the Intelligence page; corpus search and calendar are MegaPane-level surfaces (§5.6, §5.7). |
| `CompanyThemeContextCard.tsx` | **unchanged** | Receipt-first membership projection, already correct. `var(--up)` repaired (§11.2). |
| `CompanyInstitutionalContextCard.tsx` | **unchanged** | Point-in-time 13-F context, already correct. `var(--up)` repaired (§11.2). |
| `app/api/company-source-search/[ticker]/route.ts`, `lib/companySourceSearch.ts`, `lib/companySourceSearchServer.ts` | **unchanged** | Ticker-scoped exact search keeps its route and contract. Corpus search is a new route beside it. |
| `e2e/company-intelligence.spec.ts` | **extended** | Existing 1440/820/390 coverage kept; new specs appended per lens and per state. |
| `app/company-intelligence.css` | **extended** | All `.ci-*` rules unchanged. `.civ-*` rules append. |

**New files v2 introduces** (none replace anything): a receipt-state token block,
`.civ-*` rules, a `CompanyClaimLine` component, a `CompanyDocumentRail`
component, and the two new lens panels.

---

## §3 · The receipt grammar

### 3.1 A fourth semantic colour family

`app/globals.css` already documents three semantic colour families: direction
(`--up`/`--down`, **flipped** by `html[data-updown="east"]`), health
(`--warn`/`--signal`/`--danger`), and aggressor side (`--flow-buy`/`--flow-sell`,
with the comment *"deliberately NOT flipped … aggressor side is not an up/down
direction"*).

Receipt state is the fourth family, and it follows the aggressor-side precedent
for the same reason: **a cited claim is not bullish and an absent claim is not
bearish.**

```css
:root{
  --rcpt-exact:      var(--brand-2);    /* #4d82ff — an exact place in a real document */
  --rcpt-absent:     var(--muted);      /* #717a8e — a stated absence; a complete answer */
  --rcpt-superseded: var(--warn);       /* #e8a33d — the document behind it was replaced */
  --rcpt-withheld:   var(--text-dim);   /* #4a5468 — held back on purpose, not lost       */
}
```

The load-bearing choice is **`--rcpt-absent` is `--muted`, not `--warn`.** Amber
says "something went wrong, look at me". A typed absence is not a fault — it is
the system answering correctly. Amber is spent only where a reader genuinely has
to change what they do: a stale view, or a restated figure.

### 3.2 State lives in the rule style, not only in colour

Every claim is one **ledger line**: a 3px leading rule carrying the state, the
claim in plain words, and a trailing locator.

| State | Rule | Colour | Reads as |
|---|---|---|---|
| exact receipt | solid | `--rcpt-exact` | this opens a real sentence |
| stated absence | **dashed** | `--rcpt-absent` | there is a slot here and it is legitimately unfilled |
| two documents, one event | **double** | `--rcpt-exact` | collapsed duplicate |
| superseded | solid | `--rcpt-superseded` | the release behind it changed |
| withheld | **dotted** | `--rcpt-withheld` | present, deliberately not published |

Four distinguishable encodings that survive greyscale, colour-vision
deficiency, and the zh red-up flip. Colour is confirmation, never the carrier.

### 3.3 The locator: figures for a place, words for a reason

The trailing chip occupies one slot with one job — name **where** the receipt is,
or **what** is missing.

```
┃ “Provision for credit losses was $1,123 million”        [ CFO │ ¶3 ]
╎ Revenue                                                 [ release not indexed ]
┋ Q1 FY2027                                               [ held back ]
```

- A receipt sets the paragraph in `--font-num` with `tabular-nums`; the speaker
  role sits beside it in `--font-ui`.
- An absence sets a lowercase word in `--font-ui`.

Numerals versus words is the pre-lexical cue: the eye knows which kind of answer
it is looking at before it reads either. **Same slot, same size, same baseline —
an absence is a value in the ledger, never a blank.**

Tiering (doctrine §1): the chip is glance tier and carries two tokens only. Byte
offsets, sha256 fingerprints, revision chains and filing numbers are Tier 2 and
live in the evidence rail. In a **tile**, the value slot carries the absence word
and the chip is suppressed — a tile is not a ledger column, so repeating the same
word twice is noise.

Locator vocabulary per receipt kind:

| `locator_kind` | Glance chip | Rail detail |
|---|---|---|
| `text_span` | `CFO · ¶3` | segment index, character span, segment + span sha256 |
| `table_cell` | `p.12 · table 2` | page, table, row, column *(field names undefined — §12.3)* |
| `slide_region` | `p.7 · deck` | page, region box *(field names undefined — §12.3)* |
| absence | the reason, in words | what was searched, when, what would fill it |

### 3.4 A quotation is never translated

In ZH the chrome translates; the quoted source text does not. An English 8-K
sentence rendered in Chinese is no longer a receipt — it is our paraphrase
wearing quotation marks. See `03-stale.zh.html`: every label is Chinese, every
quotation is the source. A translation may be offered as an explicitly-labelled
aid beneath the source, never in place of it.

### 3.5 The absence card

Where a claim row is too small to carry the reason, the absence expands into a
card with exactly three parts, in this order:

1. **What is missing**, as a sentence a person would say.
2. **Why**, naming the real cause — not "data unavailable".
3. **Fills when** — the condition that would make it resolve.

Part 3 is the non-negotiable one. It converts a dead end into a research state
and satisfies §8's "every glance answer has an evidence path and a next research
action" for the case where the action is *not now*.

### 3.6 The stance line

Doctrine Law 1: every panel answers "so what do I do" in plain words on the
glance tier, budget ≤ 14 words. For an evidence surface the stance is a
**research action**:

| Situation | Stance (EN) | Stance (ZH) |
|---|---|---|
| exact receipts | Every line below opens the sentence it came from. | 以下每一条都可直接打开其原文出处。 |
| absences | Nothing to read for these. Each says what is missing and why. | 这些暂无原文可查；每条都注明缺什么、为什么。 |
| stale | Safe to read. The receipts point at fixed documents; only the refresh is late. | 可正常查阅：出处指向的文件本身未变，只是刷新滞后。 |
| corrected | Read the correction first, then the rest as normal. | 先看更正内容，其余照常查阅。 |
| search degraded | Transcripts are answering. Filings are not — those results are missing, not empty. | 电话会检索正常，申报文件检索不可用：该部分是缺失，而非无结果。 |

The stale stance encodes a design insight worth stating plainly: **staleness is a
property of the view, not of the receipt.** A document does not change while we
wait for a refresh. So a stale page keeps its claim rules solid blue and colours
only the header band amber. Greying out an entire page whose receipts are still
perfectly valid would be a lie in the cautious direction.

---

## §4 · Contract binding

| UI element | Contract field | Frozen by | Status |
|---|---|---|---|
| Issuer identity row | `company_event.v1.company_id`, `.security_ids[]` | Q1 | frozen |
| Fiscal label in the hero | `company_event.v1.fiscal_period` | Q4 (event-level, never per-document) | frozen |
| Listing chips (ticker · MIC · class) | issuer `listings[]` — `ticker`, `mic`, `share_class`, `is_primary`, `trading_currency` | Q1 | frozen |
| Claim text | `event_claim.v1.text` | docket §4.1 | frozen |
| Claim state | derived from `event_claim.v1.evidence_spans` — empty ⇒ absence | Q3 | frozen |
| Locator chip | `evidence_span.locator_kind` + `.segment_index` / `.page` | Q3 + corpus `expected_receipt_locator_kinds` | **`table_cell` / `slide_region` field names undefined — §12.3** |
| Rail character span | `span_start_byte`, `span_end_byte`, `segment_sha256`, `text_sha256` | `earnings_narrative.receipt_for_span` | frozen, replays byte-for-byte |
| Basis / units / period / currency | claim `basis`, `units`, `period`, `currency` | handoff Wave 1.5 | frozen ("a number without these is ABSENT, not guessed") |
| Document rail rows | `event_document_revision` — `revision`, `document_kind`, `source_sha256`, `supersedes_source_sha256`, `accession` | Q2 | frozen |
| Filing number | `(cik, accession)` | Q2 | frozen |
| Page/lens state | `corporate_intelligence_health.v1` ∈ `ready \| degraded \| stale \| partial \| blocked_rights \| empty` | Q5 | frozen; `blocked_rights` **must not be minted yet** — §12.4 |
| Source presence (orthogonal axis) | per-source `present \| metadata_only \| missing` | Q5 (explicitly *not* merged into the health enum) | frozen |
| Event-level pending flag | **derived**, never stored: `pending == any(claim has no receipt)` | Q3 | frozen |
| Authority | `context_only`, `may_rank=false`, `may_size=false`, `may_gate=false` | handoff §4 | frozen |

**v1 is not touched.** `company_intelligence_context.v1` keeps
`claim_citations_pending: true` as a hard invariant and a v1 context with `false`
must still raise. v2 is a separate projection consumed by a separate typed client.

---

## §5 · The lens system delta

Existing lens order is preserved and two lenses are appended:

```
Brief · Transcript · Sources · History · Topics · Peers · Slides
 ext      same        wrap      ext      same     new     new (Wave 5B)
```

A lens whose producer wave has not shipped renders in the bar with a `soon`
badge in `--text-dim`. It is never hidden (a hidden capability cannot be
anticipated) and never fake (a `soon` lens is not clickable into a mock). A lens
you are standing on never advertises itself as unbuilt.

### 5.1 Brief — extended

**Shows.** The claim ledger for the selected event: what the company reported,
what management said, what analysts asked.

**Binds to.** `event_claim.v1[]` with `evidence_spans`, `basis`, `units`,
`period`, `currency`.

**Interaction grammar.** Unchanged from v1: a claim is a button; clicking opens
the evidence rail; the rail is a persistent column ≥1101px and a focus-trapped
dialog below that. The only new affordance is the locator chip, which is *part of
the button*, not a second target — one claim, one hit area.

**Metric tile labels come from the claim, not from the component.** This is the
visible half of the bank/insurer/REIT basis classes (44 corpus cases). BAC's tiles
read *Net interest income · Net interest margin · Provision for credit losses ·
CET1 ratio* — not *Revenue growth / EPS growth / Gross margin*. Mapping FFO onto
EPS or net interest income onto revenue silently redefines the series.

**States.** populated · partial · stale · corrected · blocked · empty · provider-down.

**Must not.** Render `metrics.confidence`, `.sentiment`, `.call_positivity`,
`.management_confidence`, `.analyst_criticism`, `.future_outlook`, `.performance`
or `.combined` (§12.5). Infer a basis. Show a QoQ delta as if the current
source alone supported it — the v1 `derived_comparison` separation stays.

### 5.2 Evidence rail — extended body, unchanged shell

Row set per state:

| State | Rows | Note |
|---|---|---|
| exact | document · revision · paragraph · characters · basis · period · currency · fingerprint · known-at | "This quotation is the source text, character for character. It is the company's statement, not our reading of it." |
| absence | looked in · document · period · known-at · last checked | "Nothing was inferred to fill this gap. We would rather show you the hole than a number we cannot point at." |
| superseded | document · revision · replaces · paragraph · characters · basis · known-at | "The quotation still stands. What changed is the release behind it, and everything built on that release was rebuilt." |

The `derived_comparison` block is untouched and still separates a cross-event
calculation from a source receipt.

### 5.3 Sources — wrapped into a document rail

**Shows.** Every document behind one event, newest revision first, with
supersession and duplicate lineage.

**Binds to.** `event_document_revision[]`.

**Interaction grammar.** Row anatomy is v1's `.ci-source-list li` — icon, title,
note, state, Read/Open. What is new is that rows are **revisions**, not kinds, so
one event can show `release rev 2 (amended) → release rev 1 → transcript rev 1`.

**Duplicate collapse** (16 corpus cases, e.g. `CIE-GC-0033` CSCO) renders as one
event with a double rule and the chip `2 copies · 1 event` / `两份文件 · 同一事件`.
Both documents are listed and openable. A second event is never minted.

**Must not.** Present a document-level lineage as a span-level citation. If the
body is not indexed, the row says so (`release not indexed`) and the claims it
would have supported are absences — see `02-partial.html`, which is exactly this
case.

### 5.4 History — extended into narrative and commitments

**Shows.** What was added, dropped, repeated, strengthened or weakened across
quarters, and a management commitment ledger.

**Binds to.** Wave 4A `{repeated, modified, achieved, missed, dropped, unverifiable}`.

**Interaction grammar.** The existing quarter table stays as the numeric view. The
timeline is a second block below it; each row is a ledger line with its own
receipt state, so `unverifiable` renders as a dashed row rather than being
dropped.

**Must not.** Call a commitment "missed" without a receipt for the miss.
`unverifiable` is a first-class outcome, not a rounding error.

### 5.5 Peers / Mentioned By — new

**Shows.** Which issuers named this one, in which direction, by whom, with the
exact span.

**Binds to.** Wave 4A resolved-entity mentions.

**Must not.** Turn similar language into a customer/supplier assertion; let share
classes inflate breadth (Q1 is the defence); render an uncertain edge at all —
those stay internal.

### 5.6 Corpus-wide source search — new, and **not** a lens

The build surface follows the funnel, not the plumbing. A corpus-wide search is
not a property of one ticker, so it does not belong inside a ticker workspace. It
is a MegaPane-level surface; the ticker-scoped exact search in
`TranscriptSearchWorkspace` stays exactly where it is as the explicit exact mode.

**Interaction grammar.** Scope chips are the honesty device. Each scope declares
its own state, and the three failure words are different on purpose:

| Chip state | Word | Means |
|---|---|---|
| on | `12` | answering, N hits |
| unavailable | `index unavailable` | the provider is down; results are **missing**, not empty |
| not built | `not built yet` | the producer wave has not shipped |
| zero | `0` | it answered, and the answer is none |

`07-provider-down.html` renders a partial degradation: transcripts answering,
filings down. Collapsing all four into one grey "no results" would be the lie.

**Must not.** Return an empty list when a provider is down. Leak another issuer's
material through a filter.

### 5.7 Calendar — new, MegaPane-level, watchlist-scoped

Same reasoning as §5.6. Specified here for completeness; composed in Wave 3B.

### 5.8 Slides — new, gated on Wave 5A

**Shows.** Deck pages, page-region receipts, and History Mode across a slide family.

**States.** The one that matters is `06-empty.html`: a redefined slide family.
When the recurring exhibit is restructured, the prior series does not carry
forward and **we do not merge it**. Merging would invent a history that was never
published. The empty state says so and offers both decks separately.

**Must not.** Present a false family merge as history. Show a page region receipt
before Wave 5A can emit one.

### 5.9 Grounded Mastermind answers

The existing `Ask Mastermind` handoff is unchanged. What v2 adds is that the
answer's claims carry the **same locator chips** as the Brief. An answer with a
numeric claim and no receipt is declined, not softened — and the decline uses the
absence grammar, so it reads as the same product.

---

## §6 · The seven states

Each composition renders one state from one named corpus case. Every figure,
quotation, ticker, filing number and fingerprint is extracted by
`refs/company_intelligence_v2/extract_payload.py` from
`GOLDEN_CORPUS_MANIFEST.json` and the committed `mastermind.tx/v1` bodies; the
extractor fails if any quotation is not found byte-for-byte, so a composition
cannot drift from the corpus it claims to render.

| # | State | Case | Symbol | Difficulty class | Corpus outcome | Why this case |
|---|---|---|---|---|---|---|
| 01 | populated | `CIE-GC-0113` | BAC | `bank_basis` | `exact_receipt` | Full receipt density **and** the metric vocabulary must change per issuer basis. |
| 02 | partial | `CIE-GC-0147` | NET | `missing_transcript` | `typed_absence` | The typed-absence hero. No transcript, and the release is held without a text index. |
| 03 | stale | `CIE-GC-0063` | AZN | `dual_listing` | `exact_receipt` | Stale view **plus** two listings of one issuer; proves staleness ≠ untrustworthy receipts. |
| 04 | corrected | `CIE-GC-0018` | BA | `amendment` | `exact_receipt` | Two revisions, supersession chain, one restated figure beside untouched ones. |
| 05 | blocked | `CIE-GC-0211` | AMD | `future_dated_quarantine` | `quarantined` | A record that must not be published, with its real quarantine reason. |
| 06 | empty | `CIE-GC-0187` | UAL | `changed_slide_family` | `typed_absence` | An empty screen that is an invitation to act, not a failure. |
| 07 | provider-down | `CIE-GC-0221` | BK | `edgar_identity_join` | `typed_absence` | Partial degradation: one provider down, another answering, plus a real join gap. |

**Combinations deliberately not composed**

- **`duplicate_collapsed`** (16 cases; `CIE-GC-0033` CSCO extracted into
  `payload.json` as `referenced_only`) has a specified row anatomy (§5.3, double
  rule, `2 copies · 1 event`) but no dedicated page. It is a *row* state inside the
  Sources rail, not a page state, and §04's Sources rail already demonstrates
  multi-revision rendering. Wave 2B must still cover it in E2E.
- **Entitlement-locked** is listed in handoff §8 separately from `blocked`. It
  reuses the withheld shell with a different cause and a different action
  (unlock). It is composed as the note block in `05-blocked.html` rather than as a
  page, because the frozen contract has no field that can produce it (§12.4) — a
  full composition would be inventing a state the producer cannot emit.
- **Light theme** is not applicable. Terminal is dark-only by design
  (`app/settings.css`: *"Terminal is dark-only, so the macro `html[data-theme="light"]`
  branch is not…"*). The release law says "dark/light **where the host surface
  supports both**." The zh red-up palette is the axis that *does* apply here, and
  it is covered: `composition.css` carries the `html[data-updown="east"]` block,
  and the receipt family is provably invariant under it.

---

## §7 · EN / ZH copy

Full table: [`refs/company_intelligence_v2/copy_table.md`](refs/company_intelligence_v2/copy_table.md)
— 143 keys, generated from `build.py`'s `COPY` dict so the table and the
compositions cannot disagree.

### ZH principles for this surface

Chinese equity analysts already have precise words for all of this. Use theirs.

| Concept | ✗ calqued | ✓ native | Why |
|---|---|---|---|
| receipt / provenance | 凭证 (voucher) | **出处** | 出处 is where a statement comes from. 凭证 is an accounting voucher. |
| reporting basis | 基础 / 基准 | **口径** | 口径 is *the* term for GAAP vs non-GAAP basis. |
| earnings release | 收益发布 | **业绩公告** | The term issuers themselves use. |
| filing | 备案 | **申报文件** | 申报 is the SEC/CSRC sense. |
| typed absence | 类型化缺失 | **已注明缺失** | The calque is meaningless in Chinese. |
| held back | 被阻止 | **暂不发布** | "Not published for now" — accurate and unalarming. |

### The absence tokens

These are the words that occupy a receipt's slot. They are the highest-traffic
strings in the whole delta.

| Key | English | 中文 |
|---|---|---|
| `abs.noTranscript` | no transcript | 无电话会记录 |
| `abs.noRelease` | no release | 无业绩公告 |
| `abs.noSpan` | release not indexed | 公告未建立索引 |
| `abs.noBasis` | basis not stated | 未注明口径 |
| `abs.noUnit` | unit not stated | 未注明单位 |
| `abs.seriesChanged` | series redefined | 材料系列已重构 |
| `abs.unjoinable` | sources not matched | 两处来源无法对应 |
| `abs.notReported` | not reported | 未披露 |
| `abs.heldBack` | held back | 暂不发布 |
| `abs.indexDown` | index unavailable | 索引不可用 |
| `abs.notYet` | not built yet | 尚未上线 |

### Page state chips

| Key | English | 中文 |
|---|---|---|
| `state.allCited` | Every claim cited | 每项均有原文出处 |
| `state.partlyCited` | Partly sourced | 部分有出处 |
| `state.lastVerified` | Last verified view | 最近验证视图 |
| `state.restated` | One figure restated | 一项数据已更正 |
| `state.heldBack` | Held back | 暂不发布 |
| `state.newSeries` | New series | 新的材料系列 |
| `state.searchDegraded` | Search partly down | 检索部分不可用 |

### Copy rules

- **No translated text in `title=`.** Use `aria-label` and the existing
  `pick(zh, en, zh)` helper. Terminal's bilingual contract is `pick()` /
  `useLang()`; the Macro `t()` / `td()` pair does not exist here.
- ZH glance strings stay within the same word budget as EN.
- A quotation is never translated (§3.4).
- No contract enum name, no `validated`, no directional or confidence vocabulary.

---

## §8 · Keyboard, focus, and assistive technology

**Inherited from v1 unchanged — do not re-derive:**

- Lens bar is `role="tablist"` with roving `tabindex`, ArrowLeft/Right/Home/End,
  and `selectLens()` scrolls the newly-selected panel back under the sticky bar.
- Evidence rail: `role="complementary"` docked ≥1101px; `role="dialog"` +
  `aria-modal` below that, with a focus trap, Escape (capture phase, so a nested
  drawer can own it), `inert` while closed, and focus restored to the triggering
  element on close.
- `:focus-visible{outline:2px solid var(--brand-2);outline-offset:2px}` globally.
- `.ci-page button, select, a { min-height:36px }`; 40–44px at ≤640.

**New requirements for v2:**

| Concern | Requirement |
|---|---|
| Claim as a control | One claim = one button = one hit area. The locator chip is inside the button, never a nested control. |
| Screen-reader claim label | `aria-label` composes claim + state + locator: *"Provision for credit losses was $1,123 million. Exact source: Chief Financial Officer, paragraph 3."* / *"Revenue. No source: release not indexed."* The state is spoken, never colour-only. |
| Selected claim | `aria-pressed` (v1 idiom, kept). |
| State banner | `role="status"`, `aria-live="polite"`. A correction announces once, not per claim. |
| Absence card | `<section>` with an accessible name from its `<strong>`; the "Fills when" line is part of the same region so it is not orphaned. |
| Locator chip | `aria-hidden` on the `·` separators only; the paragraph number is read. |
| Document rail | `<ul>` of revisions with `aria-label` naming the event; supersession stated in text, not by position alone. |
| Withheld / empty | `role="status"`, focus moves to the heading, and both actions are reachable in one Tab. |
| Contrast | **Measured, not assumed.** Locator-chip foreground is `color-mix(TOKEN 82%, --text)` on a TOKEN-8%-over-`--panel` field: exact **5.96:1**, superseded **8.53:1**, absent **5.21:1** — all clear AA 4.5 for their 9.5px text. `--rcpt-withheld` at 82% measured **3.46:1 and failed**, so the withheld chip mixes lighter at 60% → **5.27:1**. Standing rule: raw `--rcpt-absent` (4.45:1) and raw `--rcpt-withheld` (2.52:1) are **rule and mark colours only** — never set body text to a raw state token. Claim body text is `--text` (13.7:1) or `--text-2` (7.57:1). |
| 200% zoom | Verified: the claim row is a 2-column grid that collapses to 1 column with the locator right-aligned below, and the leading rule spans both rows. No fixed heights on text containers. |
| Reduced motion | This surface has no entrances, pulses or parallax by design. The only transitions are 120ms hover tints, switched off in `@media (prefers-reduced-motion:reduce)`. Nothing to kill because nothing was added. |
| Touch targets | ≥44px for every action at ≤640, including the rail close button and both state actions. |

---

## §9 · Performance budgets

| Budget | Target | How the design meets it |
|---|---|---|
| Terminal shell interaction after load | < 150 ms | The Brief renders from the compact v2 projection only. Document bodies are never in the first payload. |
| Immediate shell | hero + lens bar + panel frames paint before claims resolve | Skeletons are scoped to the claim ledger, never the shell. |
| Skeletons | bounded loading only, **never terminal** | Every failure path resolves to a named state (§6). A skeleton that cannot resolve is a defect, not a state. |
| Long documents | virtualized | Transcript bodies stay in `TranscriptDrawer`; the workspace never inlines one. |
| Slides | lazy, page-at-a-time | Page regions load on demand; a deck never blocks the shell. |
| Indexed search p95 | < 1 s | Corpus search is a separate route; heavy source opens progress independently of the result list. |
| Browser payload | bounded | Claim ledger is paginated by event; the document rail lists revisions, not bodies. |
| Provider timeout | bounded, then a **named** state | A hung provider becomes `index unavailable` on its own scope chip; it never hangs the page or empties a sibling scope. |
| Correction replay | invalidates, does not silently re-render | A superseded claim shows the correction band before its new value. |

---

## §10 · Authority fence

Every qualitative output on this surface is **context only**. The footer states it
once per page: *"Context for research. Nothing here ranks, sizes or gates a
position."* / *"仅用于研究背景；不参与任何排序、仓位或准入判断。"*

This delta must never render: a model confidence, a sentiment or positivity
score, a directional score, a rank, a position size, a gate, a veto, an
expected-return claim, or a probability. It must never let an LLM originate a
signal or an escalation. It must never present a relationship, a topic, a 13-F
change or a narrative delta as directional authority.

---

## §11 · Defects in the shipped v1 that this delta repairs

Found while reading the components. All three are small and all three are real.

### 11.1 `validated` in user-facing copy

Macro CI-guards this word (`scripts/check_validated_claims.py`); Terminal has no
such guard, and three Company Intelligence strings use it:

- `CompanyIntelligencePage.tsx:334` — *"No **validated** company-event view exists for this symbol."*
- `CompanyIntelligencePage.tsx:538` — *"…does not resolve to a **validated** transcript document."*
- `TranscriptDrawer.tsx:294` — *"The **validated** document carries no spoken segments."*

Replacements (they read better anyway): *"We have no company-event view for this
symbol yet."* · *"This quarter does not resolve to a transcript document we can
open."* · *"This document carries no spoken segments."*
`RegimeOutlook.tsx:257,330` carries two more outside this lane — worth a separate
sweep plus a Terminal-side guard.

### 11.2 Availability painted with a direction token

Five call sites paint source availability or readiness with `var(--up)`:

`CompanySourceManifest.tsx:50` · `CompanyIntelligencePage.tsx:57` and `:534` ·
`CompanyThemeContextCard.tsx:98` · `CompanyInstitutionalContextCard.tsx:130`

`--up` is flipped to red by `html[data-updown="east"]`, so **a Chinese-locale
reader on the red-up convention sees "Present" and "Ready" in red.** Availability
is not a price direction. Repair: route all five through the receipt family
(§3.1). `.ci-topic-status.added/.dropped` has the same problem for a
non-directional topic state and should move too.

### 11.3 Qualitative score fields one line from the screen

`lib/companyIntelligence.ts:37–43` and the allowlist at `:227–228` carry
`sentiment`, `confidence`, `call_positivity`, `management_confidence`,
`analyst_criticism`, `future_outlook`, `performance`, `combined`. None is
rendered today. Handoff §2B says "no model confidence or directional score", and
the frozen contract does not forbid them in the v2 projection — so nothing stops
a future tile from binding one. See §12.5.

### 11.4 Secondary micro-copy is below AA 4.5

Measured against the shipped tokens:

| v1 pattern | Pair | Ratio | |
|---|---|---|---|
| `.ci-source-copy small` (9.5px) | `--muted` on `--panel-2` | **4.16** | below AA 4.5 |
| `.ci-provenance-bar` (10px) | `--muted` on `--panel` | **4.45** | below AA 4.5 |
| `.ci-inst-stats i` (9px) | `--text-dim` on `--panel-2` | **2.35** | well below |

This is a Terminal-wide token pattern, not a Company Intelligence bug, and
re-toning it inside one lane would make this workspace visually diverge from
every sibling surface. So: v2's **new** elements use a lifted
`--rcpt-meta` = `color-mix(--muted 80%, --text-2)` (4.65 on `--panel-2`, 4.97 on
`--panel`) which is still clearly secondary, and the v1 sites are flagged here for
a separate Terminal-wide sweep. `--text-dim` at 2.35 should stop carrying text
anywhere.

### 11.5 Cosmetic

`ci-company-mark` takes `displayName.charAt(0)`, rendering "T" for *The Boeing
Company* and *The Bank of New York Mellon Corporation*. Skip a leading article.

---

## §12 · Contract gaps — what Wave 1 does not give the UI

**These block the commissioning session, not this spec.** Each is a place where a
composition above had to decide something the frozen contract does not decide.

### 12.1 No release-sourced exact receipt exists anywhere in the corpus

`golden_corpus_documents.v1.json` contains **220 documents, all
`document_kind: "transcript"`**. Releases appear only as `document_revisions`
metadata — `source_sha256` plus a synthetic accession — with no body. All 140
committed `text_span` receipts are against transcripts.

Wave 1's central promise is that the 8-K / Exhibit 99.1 release becomes the
numeric authority (handoff Wave 1.4–1.5). **The benchmark cannot grade that**, and
no UI element that cites a release can be verified against the corpus. This is
the largest gap.
*Needed:* either release bodies in the corpus, or an explicit statement that
release-sourced claims are out of scope for the R0-D benchmark.

### 12.2 `missing_transcript` cases carry `excerpt_document_id: null`

`CIE-GC-0147` (NET) has `release_present: true` and no document of any kind. The
UI therefore cannot distinguish "the release exists and we hold its text" from
"the release exists and we hold only its hash". Composition 02 chose the second
reading and invented the display token `release not indexed`.
*Needed:* a contract field distinguishing *document held* from *document
indexed*. Without it the UI cannot honestly tell a reader whether opening the
source will show them anything.

### 12.3 `table_cell` and `slide_region` locators have no field names

The corpus declares both shapes and commits no receipt for either (12 and 3
cases). The freeze does not name their fields. Compositions therefore specify the
glance chip (`p.12 · table 2`, `p.7 · deck`) but cannot bind it.
*Needed:* the field set for both locator kinds, before Wave 5B.

### 12.4 `blocked_rights` cannot be produced, but §8 requires a blocked state

Q5 froze `blocked_rights` into the enum and simultaneously ruled it must not be
minted "before there is a rights check that can actually return it". Handoff §8
requires both a `blocked` and an `entitlement-locked` state. Terminal has a
shipped member gate but the contract has no field for it.
*Needed:* either a rights check that can return `blocked_rights`, or a ruling
that entitlement-lock is a client-side state outside
`corporate_intelligence_health.v1`. Composition 05 renders the state that *can* be
produced (quarantine) and treats entitlement as a note.

### 12.5 Nothing forbids qualitative scores in the v2 projection

Eight score fields survive in the typed client (§11.3). §2B forbids rendering
them; no frozen field forbids *projecting* them.
*Needed:* an explicit deny-list on the v2 projection, so the fence is in the
contract rather than in reviewer memory.

### 12.6 "Known at" is unprovable for a wire-sourced document

`golden_corpus_edgar_identity.v1.json` records
`when_semantics: "wall_clock_at_processing_not_source_timestamp"` for every
`edgar_earnings_wire` row, and `joinable_keys_today: ["ticker"]`.

The shipped provenance bar prints *"As known at &lt;timestamp&gt;"* on every
event. For a wire-sourced document that timestamp is when **we** processed it, not
when the source published it — and Wave 1 acceptance requires "availability
timestamps prove no consumer outran the source".
*Needed:* Q2's repair (wire emits a source acceptance timestamp) landed before
any UI prints a known-at for a release. Until then the UI must label it
*"first seen by us"*, which is a different and weaker claim.

### 12.7 The event-level derived flag has no name

Q3 froze `pending == any(claim has no receipt)` as derived. Nothing names the
field. The hero chip needs it (`Every claim cited` vs `Partly sourced`).
*Needed:* a field name, or a ruling that the client computes it.

---

## §13 · How to review this

```bash
open terminal/docs/refs/company_intelligence_v2/index.html
```

Then read `02-partial.html` first. If the typed-absence page does not feel like a
complete, trustworthy answer, the design is wrong and nothing else matters.

To re-derive the compositions from the corpus:

```bash
cd terminal/docs/refs/company_intelligence_v2
python3 extract_payload.py --corpus <macro-worktree-with-the-R0-D-corpus>
python3 build.py
./shoot.sh
```

`extract_payload.py` replays each case's own committed receipt and fails if it
does not match, then locates every additional quotation byte-for-byte inside the
committed bodies. 16 spans across 7 cases verify today.
