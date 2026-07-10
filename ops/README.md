# ops/ — VPS operational scripts

Source-of-truth for scripts deployed to the VPS. Orchestrator deploys; never edit files
in place on the VPS outside of a deploy.

## terminal-data

VPS path: `/usr/local/bin/terminal-data`
Cron: `30 21 * * *` (21:30 UTC = 17:30 ET, after US market close)

Nightly universe + price refresh. Two-phase design after the 2026-07-09 prevClose fix:

**Phase 1** (~5 min): flagship 37 + Polygon grouped-daily US OHLC + early hydrate → early
baseline swap. Gives the quote hub correct same-day prevClose by ~21:35 UTC.

**Phase 2** (~3-4 hr): full universe marathon (build_universe, expand, enrich, backfill,
gen_slices_all, intel bridge, intl OHLC) → final swap at ~03:00 UTC.

Both swaps are guarded by the 80%-count check (≥1000 floor).

Deploy:
```bash
scp ops/terminal-data root@146.190.142.17:/usr/local/bin/terminal-data
ssh root@146.190.142.17 "chmod +x /usr/local/bin/terminal-data"
```
