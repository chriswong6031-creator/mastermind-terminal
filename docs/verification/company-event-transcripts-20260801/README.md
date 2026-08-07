# Company Event Transcripts UI verification

Local verification set captured on 2026-08-01 against the transcript archive and
reader implementation in this branch.

## Covered surfaces

- `desktop-1440-dark-en.png`: populated AAPL archive at 1440 x 900.
- `desktop-1440-reader-dark-en.png`: AAPL `2026Q2` reader, corpus attribution, and explicitly inferred role labels at 1440 x 900.
- `tablet-820-dark-zh.png`: populated archive in Chinese at 820 x 1180.
- `mobile-390-dark-en.png`: populated archive at 390 x 844.
- `mobile-390-reader-dark-en.png`: transcript reader at 390 x 844.
- `mobile-390-empty-dark-en.png`: explicit empty-state fixture at 390 x 844.

## Interaction checks

- No horizontal overflow at 1440, 820, or 390 pixels.
- `?pane=transcripts&tx=<period>` deep links open the requested call after a fresh load.
- First Escape closes the reader and removes `tx`; second Escape closes the archive
  and removes `pane` while preserving the chart and symbol.
- Archive and reader expose keyboard focus, search, period/Q&A filters, speaker
  navigation, copy actions, source links, explicit corpus provenance, and honest
  `inferred` labels for Mastermind-derived speaker roles.
- English and Chinese archive copy were exercised. Terminal is intentionally
  dark-only under the current product contract; this set does not claim light-mode support.

The AAPL body files used for local capture were temporary fixtures copied from the
existing production DefeatBeta corpus. They are not included in this repository.
