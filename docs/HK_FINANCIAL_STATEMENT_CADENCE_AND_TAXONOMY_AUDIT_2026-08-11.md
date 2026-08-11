# Hong Kong Financial Statement Cadence and Taxonomy Audit

**Audit date:** 2026-08-11
**Scope:** `mastermind.fund/v1` Hong Kong statement ingestion, normalization, and Terminal display
**Evidence:** 2,798 cached HK issuer files plus live vendor-row spot checks for the controls listed below

## Verdict

The HK feed is not a uniform quarterly dataset. It contains annual-only, semiannual, quarterly, and partial cumulative ladders across four incompatible statement-code families. Correctness therefore requires source-owned period identity and a family adapter per statement row. Calendar-month quarter labels, a blanket four-row difference, or routing every issuer through the `004` industrial schema is financially wrong.

The repair contract is:

1. preserve the vendor's `START_DATE`, `REPORT_DATE`, `DATE_TYPE_CODE`, `FISCAL_YEAR`, `STD_ITEM_CODE`, and `STD_ITEM_NAME`;
2. derive a discrete period only from an exact cumulative base in the same fiscal cycle;
3. subtract additive income and cash-flow values once, never balance-sheet snapshots or EPS;
4. map each row by its actual item-code namespace; and
5. leave concepts, period geometry, or statement units that are not source-proven as `null`.

## Corpus findings

### Coverage and taxonomy

| Latest income namespace | Statement family | Issuers | Share of source-covered issuers |
| --- | --- | ---: | ---: |
| `004` | Industrial/general corporate | 2,592 | 93.81% |
| `003` | Financial services | 103 | 3.73% |
| `001` | Bank | 48 | 1.74% |
| `002` | Insurer | 20 | 0.72% |
| **Total with income rows** |  | **2,763** | **100%** |

There are 2,798 cached issuer files. Thirty-five have no usable source income rows and remain honest source gaps. Under the old `004`-only adapter, 206 issuers rendered a fully null income statement. Family adapters recover all 171 schema-induced misses, reducing fully null statements from 206 to the 35 true gaps.

The namespace is a statement schema, not an issuer-sector guess. Twelve issuers change namespace in their history, so family selection must be performed per row and exposed as per-period provenance; a single current-sector label cannot safely normalize the full series. A few rows contain two complete namespaces at once. For example, `0767.HK` carries both `003` and `004` presentations in H1 2020. There is no retained primary-schema receipt, so those rows are classified as `ambiguous` and all family-specific statement values fail closed rather than selecting a namespace by item count.

### Reporting cadence

The post-migration census contains 44,838 completed fiscal-year cycles:

| Completed-cycle shape | Cycles | Share of cycles with interim rows |
| --- | ---: | ---: |
| Annual only | 5,074 | n/a |
| Has interim rows | 39,764 | 100% |
| Two source rows | 36,361 | 91.343% |
| Three source rows | 1,067 | 2.683% |
| Four source rows | 2,334 | 5.870% |

The three common cardinality buckets cover 39,762 of 39,764 interim cycles; the two residual cycles have five and six source rows and must fail closed rather than be forced into a quarter ladder. Of the interim cycles, 35,887 are the common `H1` + `FY` pattern.

This is predominantly a semiannual feed, not a quarterly one. The transport property may remain named `quarterly` for v1 compatibility, but its display cadence must come from metadata (`annual`, `semiannual`, `quarterly`, or `mixed`).

The generated source-covered artifacts classify 2,064 issuers as semiannual, 192 as quarterly, 496 as mixed, and 11 as annual-only. The 35 true source gaps carry no fabricated cadence.

Fiscal years are also not uniformly calendar years. The latest filing is non-December for 612 of 2,763 source-covered issuers; 789 issuers have a non-December fiscal year somewhere in history. Month-to-quarter conversion therefore mislabels March-year-end and other off-calendar reporters. Sixty-one issuers also have duplicate display labels in their last 12 rows when identity is inferred from months alone.

## Source period contract and normalization

The vendor period codes are milestones, not proof of discrete quarters:

| `DATE_TYPE_CODE` | Source milestone | Typical duration |
| --- | --- | ---: |
| `001` | FY | 12 months |
| `002` | H1 | 6 months |
| `003` | Q1 | 3 months |
| `004` | 9M / Q3 YTD | 9 months |

`START_DATE` and `REPORT_DATE` are the authoritative duration evidence. Canonical identities are formed inside a fiscal cycle:

- Q1 is the filed Q1 value.
- Q2 = H1 − Q1 only when that exact Q1 base exists.
- Q3 = 9M − H1 only when that exact H1 base exists.
- Q4 = FY − 9M only when that exact 9M base exists.
- H2 = FY − H1 when the filing ladder is semiannual.
- Without the required base, keep the source identity (`H1`, `9M`, or `FY`) and return `null` for a requested derived period.

The cumulative base must also use the same statement-code family. Historical schema transitions are real: subtracting an industrial `004` Q1 from a financial-services `003` H1 would manufacture a negative quarter. If a fiscal-year-end transition creates duplicate canonical identities, both source rows remain visible with their report dates appended and comparable-period growth fails closed.

Income-statement totals and cash-flow totals are cumulative flows and may be differenced once. Cash from operations, investing, financing, and capex follow the same rule. Balance-sheet values are point-in-time snapshots and are never differenced. EPS is also never differenced: weighted-average share denominators can change between filings, so only source-reported EPS is shown and any derived Q2/Q3/Q4/H2 EPS is `null`.

Each output row must carry enough provenance to prevent a second normalization pass: vendor and canonical period starts, report end, fiscal year, period kind/number, source period label, cumulative flag, normalization method, reporting cadence, source market, and source family.

## Statement-family mappings

The following mappings use the vendor's total/subtotal concepts. Fallbacks are ordered left to right.

### Income statement

| Family | Revenue / operating income total | Operating expense | Operating profit | Pretax | Tax | Net income | Basic / diluted EPS |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `001` bank | `001003999` | `001005999` | `001010999` | `001011999` | `001012001` | `001025002`, `001012999` | `001027002` / `001027003` |
| `002` insurer | `002003999` | `002007999` | `002010999` | `002011999` | `002012001` | `002014002`, `002013999` | `002027002` / `002027003` |
| `003` financial services | `003003999`, `003001999` | `003007999` | `003010999` | `003011999` | `003012001` | `003015002`, `003012999` | `003027002` / `003027003` |
| `004` industrial | `004001999`, `004001001` | `null` | `004010999` | `004011999` | `004012001` | `004025002`, `004012999` | `004027002` / `004027003` |

Dividend per share uses each family's `027004` then `027001` field. Gross profit and COGS are emitted only for the industrial family, where gross profit is `004007999` and COGS is the supported revenue-minus-gross-profit bridge. Vendor field `004005001` is not ex-COGS operating expense: in the observed corpus it equals revenue minus gross profit (including Tencent), so mapping it as operating expense would duplicate COGS. Industrial operating expense is derived only by the canonical gross-profit-to-operating-income identity in the presentation view.

### Balance sheet

| Family | Assets | Current / non-current assets | Liabilities | Current / non-current liabilities | Equity | Cash | Debt |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `001` bank | `001001999` | `null` / `null` | `001002999` | `null` / `null` | `001011999`, `001009999` | `001001001` | `null` |
| `002` insurer | `002001999` | `null` / `null` | `002002999` | `null` / `null` | `002011999`, `002009999` | `002001001` | `002002008` |
| `003` financial services | `003005999` | `003002999` / `003001999` | `003019999` | `003007999` / `003015999` | `003029999`, `003025999` | `003002010` | `null` |
| `004` industrial | `004009999` | `004002999` / `004001999` | `004025999` | `004011999` / `004020999` | `004036999`, `004030999` | `004002010` | sum of the seven proven components below |

Industrial debt sums current finance leases (`004011006`), current borrowings (`004011010`), current bonds (`004011021`), non-current borrowings (`004020001`), non-current finance leases (`004020005`), convertible notes and bonds (`004020007`), and non-current notes payable (`004020018`). Omitting the lease and note fields materially understates issuers such as `0001.HK`, `0700.HK`, `0941.HK`, and `1378.HK`.

Cash-flow totals use `003999` (operations), `005999` (investing), `007999` (financing), and `005005` (capex). The vendor carries `005005` as a positive gross cash-outflow amount; the Terminal contract emits it with a negative sign and computes industrial FCF as CFO + capex. A derived capex period is emitted only when that cumulative magnitude does not fall; a downward revision or inconsistent ladder leaves capex and FCF `null` instead of turning the negative difference into invented spending. Bank deposits and ordinary funding are not industrial debt. The `003` schema also contains issued bonds and other funding that make a two-code debt sum incomplete. Those debt and net-debt fields remain `null`. Bank/insurer gross profit, COGS, current/non-current splits, and bank debt remain `null`; bank/insurer free cash flow is not presented as a comparable subtotal. These are deliberate semantic nulls, not missing-data defects.

## Representative controls

| Symbol | Control role | Expected evidence |
| --- | --- | --- |
| `0700.HK` Tencent | Full `004` cumulative ladder | Q1/H1/9M/FY source rows normalize to discrete Q1–Q4 additive flows; derived EPS stays null |
| `0001.HK` CK Hutchison | Semiannual `004` issuer | H1/H2 labels; never fabricated Q2/Q4 labels |
| `0005.HK` HSBC | `001` bank | Total operating income and bank subtotals populated; industrial gross profit/debt suppressed |
| `1299.HK` AIA | `002` insurer | Insurer totals populated; unsupported industrial fields suppressed |
| `0388.HK` HKEX | `003` financial services | Financial-services totals populated with `003` provenance |
| `0767.HK` China New Economy Fund | Same-row dual namespace | Ambiguous H1 row fails closed; no item-majority top-line selection or FCF |
| `1973.HK` Tian Tu Capital | Namespace transition | No cumulative difference across `004` and `003` rows |
| `0030.HK` Ban Loong | Fiscal-year transition | Duplicate H1 identities include source dates and are not ambiguous for YoY |
| `0990.HK` Theme International | Decreasing cumulative capex | Derived capex and FCF remain `null` rather than inventing an outflow |
| `1378.HK` China Hongqiao | Multi-component debt | Loans, bonds, notes, convertibles, and finance leases all enter total debt |
| `2720.HK` IFBH | Annual-only / duplicate annual year | Defaults to annual and disambiguates both FY 2022 source rows by end date |
| `AAPL` | US industrial control | Existing US annual/quarterly behavior and industrial waterfall remain unchanged |
| `JPM` | US financial control | Financial presentation does not inherit an industrial revenue/COGS bridge |

Live vendor inspection confirmed that Tencent's reported Q1, H1, 9M, and FY rows share the same fiscal `START_DATE`; they are cumulative filings. A claim that Tencent publishes discrete quarterly values is not safe for this feed.

## Data migration and publication requirement

The original 2,798 cache files predated preservation of `START_DATE`, `FISCAL_YEAR`, and `STD_ITEM_NAME`. Legacy rows therefore could only remain source-labelled and non-differenced; the generator never invented duration evidence that was discarded upstream.

Completion therefore requires a forced HK recollection after the collector change, followed by regeneration and publication of all `.fund.json` artifacts. The collector's `--statements-only` migration mode refreshes the three vendor statements while preserving the existing yfinance block, avoiding an unrelated analyst/profile refetch. It preserves each prior statement block independently when that vendor endpoint returns empty, and ordinary refreshes apply the same protection. Fresh meaningful yfinance fields are merged at field level so a partial profile outage cannot erase an already sourced statement currency.

HK quote currency is not evidence of statement currency. When yfinance does not supply `financialCurrency`, the producer now emits `stmt_currency: null`; Terminal labels the unit unknown and suppresses cross-unit valuation math instead of assuming HKD or USD. Sixty-seven generated artifacts have this honest unknown. EastMoney's report-summary feed exposes an additional `CURRENCY` receipt that the current akshare wrapper discards. Preserving that field is a named collector follow-up; until then, a visible null is the only defensible value.

### Migration receipt

Four protected collector shards completed the forced statement refresh in 4,024–4,042 seconds. They wrote 2,763 source-covered caches, retained the 35 genuine empty-source names, and reported zero transient endpoint blocks requiring preservation. The final endpoint census is identical for income, balance, and cash flow: 2,763 fresh and 35 empty. The two historical gap caches containing non-standard JSON numbers were strictly normalized (`NaN`/infinity to `null`) before generation.

The final local gate scanned 2,798 strict-JSON caches and 2,798 aligned strict-JSON artifacts. It found zero source-covered fully-null income statements, two deliberately fail-closed ambiguous periods, 43,712 populated industrial-debt periods (41,608 using multiple proven components), no duplicate canonical display labels, no semiannual quarter labels, and no metadata/metric alignment errors.

Reproducibility markers:

- cache manifest SHA-256: `1b698a4efba6f0ac876df7247c089ad74a0a25574d033f6f67a02f8a01bcbfe6`
- artifact manifest SHA-256: `7d24bfd3e47650b4ace5ce92d7b7b4cc4d159c81b74874be2cacabec61784128`
- combined receipt SHA-256: `b739ef7d383c431297f348be002d9765946b699508fafd0a843322ec77e18c60`

Normal nightly regeneration without forced recollection would have retained legacy cache geometry; the forced refresh and full `--no-merge` regeneration are complete.

## Cross-repository documentation follow-up

No Macro Dashboard runtime contract change is required for this repair: Terminal owns the HK collector, generator, `mastermind.fund/v1` normalization, and display semantics. Macro Dashboard supplies the cache/runtime location.

Two Macro research notes are stale and should be corrected in a separate Macro change; this audit does **not** edit that repository:

- `/Users/chriswong/Documents/Cluade/Macro Dashboard/research/BREATHING_PLATFORM_CONTINUATION_HANDOFF_2026-08-09.md`, lines 220–225.
- `/Users/chriswong/Documents/Cluade/Macro Dashboard/research/BREATHING_PLATFORM_CONTINUATION_HANDOFF_2026-08-09_SESSION3.md`, lines 481–484.

Both notes speculate that HK may not be cumulative because Tencent publishes discrete quarterlies. For this vendor contract, the observed Tencent rows are cumulative from the same fiscal start. The documentation should point to source dates and period codes rather than issuer-level assumptions.

## Verification receipt

Exact code head tested: `b629033e38b7efc0d19b56e7e422c072bba6cd70` (rebased on `origin/master` `66bc936000f80857173c7947bc01b15fbbea5e2e`).

- Python: 729 tests passed, including the maintained 2,798-file corpus gate, HK interval/taxonomy contract, token-free HK collector import, collector failure paths, and existing Massive/US controls.
- Terminal: 2,570 Vitest tests passed with four existing todos; TypeScript passed; and the Next production build completed. The task-scoped financial page/helper lint run had zero errors and five existing warnings. Including touched legacy `StockAnalysis.tsx` and `fund.ts` exposes ten pre-existing `no-explicit-any` errors and eight additional warnings; this change adds no lint error.
- Responsive suite: 302 tests passed and 131 were intentionally skipped in 2.7 minutes. The suite exercised the contractual 1440×900 desktop, 820×1180 tablet, and 390×844 mobile layouts without a failure.
- Browser: `0001.HK` rendered H1/H2 at all three contractual widths with document width contained and no Q2/Q4 fiction. `0700.HK` retained Q1–Q4; March-year-end `8428.HK` rendered H1/H2; and `0005.HK`, `1299.HK`, and `0388.HK` populated their vendor totals while omitting industrial COGS/gross-profit rows. `AAPL` retained the industrial COGS/gross-profit/operating-expense bridge, while `JPM` used the financial presentation. Localized SSR regressions cover the equivalent Chinese cadence, family, currency, empty-state, and signed-surprise copy.
- Adversarial browser controls: `1973.HK` used a neutral mixed-family top line without the fabricated −96.04M cross-family quarter; `0767.HK` showed its dual-schema H1 2020 as ambiguous with no selected top line; both `0030.HK` H1 2024 rows carried their source dates; `0990.HK` showed dashes for revised H2 capex/FCF; `1378.HK` showed 70.10B total debt from the complete component map; and annual-only `2720.HK` disabled Interim, preserved both dated FY 2022 rows, labelled statement currency unavailable, and suppressed unit-mixing comparisons.
- Mutation guard 1: changing the semiannual producer label from `H2` back to `Q4` made `test_semiannual_h1_and_fy_become_h1_and_h2_without_quarter_fiction` fail on the exact label mismatch.
- Mutation guard 2: removing cumulative-base subtraction made four interval/cash-flow regressions fail, including Tencent-style Q1–Q4 and H1/H2 recovery.
- Mutation guard 3: reintroducing `opex - cogs` made four AAPL/family/waterfall regressions fail, including the exact −158.8B double-subtraction.

All mutations were reverted and their focused suites returned green. No signal, rank, Prophet, trade, or portfolio-authority code changed.
