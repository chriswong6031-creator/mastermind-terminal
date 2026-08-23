Workstream: REQUIRED
Linear: REQUIRED
Portfolio-Mode: REQUIRED
Wave: REQUIRED
Authority: REQUIRED
Completion: REQUIRED

<!--
MAS28-V1-CONTRACT-SHA256: e78cbf00a952f7283a7e0f1e83eb4070c9049c1a445c9a035f9da8652dc6838c
MAS28-V1-RULESET-SHA256: 41d5634a6ca6d4bbd993e728b73d839260452b24c891e556c59da52a184a1859

Replace every REQUIRED value before opening this PR. The six fields must remain
contiguous, column-zero, ordered exactly as shown, and use one ASCII colon plus
one ASCII space. Do not add a second copy of a canonical field above the first
top-level ## heading.

Allowed values:
- Workstream: WS:<KEY> or NONE. A concrete key is uppercase and uses only A-Z,
  0-9, and hyphen-separated segments.
- Linear: MAS-<positive non-zero integer without leading zeroes> or NONE.
- Portfolio-Mode: tracked | maintenance_exception | creates_workstream |
  architecture_candidate.
- Wave: a bounded 1-64 character identifier matching
  [A-Za-z0-9][A-Za-z0-9._-]{0,63}.
- Authority: implementation | records | research | maintenance | proof | deploy |
  architecture_candidate.
- Completion: merge-is-done | built-not-proven | proof-required |
  acceptance-required | records-only.

Native relationship law: relationship hints are visible, whole-line declarations
such as `Fixes MAS-28`, `Relates to MAS-28`, or `Skip MAS-28`; body text is not
proof of GitHub or Linear native linkage. Use a completion-bearing relationship
only when this PR is permitted to complete that exact issue. built-not-proven,
proof-required, and acceptance-required prohibit a completion-capable native
relationship to the declared issue. merge-is-done requires one. Do not use a
relation-only or suppression line to imply completion.
-->

## Summary

<!-- What changes, why it is bounded, and any material user or runtime impact. -->

## Verification

<!-- List exact tests, checks, and real-path proof performed. -->

## Risks and rollback

<!-- State residual risk and a concrete rollback/recovery path, or NONE. -->
