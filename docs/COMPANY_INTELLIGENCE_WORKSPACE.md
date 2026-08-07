# Company Intelligence workspace

`/analysis?symbol=<ticker>&page=intelligence` is the Terminal's generation-pinned company-event research surface. It is a context product, not a signal or execution surface.

## Contract

- The browser reads only Terminal's same-origin BFF: `/api/company-intelligence/<ticker>`.
- A response is a bounded, validated `company_intelligence_context.v1` object from one immutable generation. The UI does not fetch, infer, or rewrite source data.
- Every displayed claim opens an evidence receipt. The producer's `field_lineage` selects the source family for that exact normalized field; the UI never guesses history versus overlay versus transcript. Receipts disclose availability, source date, and record/hash identity, while clearly separating field origin from the still-pending paragraph or transcript-span citation.
- `authority=context_only` and `is_context_only=true` are displayed as a product boundary. This workspace never promotes an investment action.

## Interaction model

- The primary Brief combines source-authored structured event context, deterministic reported changes, retained positive/negative read-throughs, the key quote, and explicit source gaps.
- Transcript, History, Topics, and Sources are peer lenses in an inner roving tablist. The outer Financials bar remains responsible for cross-page navigation.
- Selecting a metric, claim, highlight, or quote selects a receipt; **View receipts** can reopen the last selection. The transcript lens hands a verified archive ID to the existing Transcript reader rather than duplicating its document renderer.
- **Ask Mastermind** opens the existing Brain when the workspace is hosted inside the chart. On the standalone Analysis route it carries the selected ticker into `/terminal?ai=1`, where that same Brain is actually mounted; the control never silently no-ops.
- Event selection resets the active evidence selection so a receipt cannot silently refer to another fiscal event.

## Responsive behavior

- **1440×900 desktop:** the evidence inspector is an open sticky rail beside the research canvas.
- **820×1180 tablet:** the inspector is closed by default and opens as a right-side fixed sheet with a scrim.
- **390×844 mobile:** the same inspector becomes a full-height bottom sheet. Escape and the close button dismiss it; no horizontal document overflow is allowed.

## Regression proof

`terminal/e2e/company-intelligence.spec.ts` runs at all three Terminal contract viewports. It fixtures the same-origin BFF (not R2), asserts document-width safety, exercises the desktop rail or responsive sheet open/close flow, and switches the inner Topics lens. The runner activates the existing development-only `ANALYSIS_LOCAL_PREVIEW=1` seam; production cannot use that bypass.
