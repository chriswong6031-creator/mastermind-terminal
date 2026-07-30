# ops/ — VPS operational scripts

Source-of-truth for scripts deployed to the VPS. Orchestrator deploys; never edit files
in place on the VPS outside of a deploy.

## terminal-build.sh

VPS path: `/opt/terminal/terminal-build.sh` — the git-gated deploy script itself
(see `DEPLOY.md` for the full path-by-path deploy contract).

Every deploy re-installs this file from master onto the box, so an edit to
`ops/terminal-build.sh` takes effect on the **next** deploy after it merges.
Never edit the box copy in place — it is overwritten on every run.

The deploy writes the deployed commit to the gitignored
`terminal/.deployment-id` marker before restarting Next. `next.config.ts` reads
that marker during `next start`, keeping the runtime deployment ID identical to
the ID used during `next build` so clients never fetch the same chunks twice
under build-time and runtime cache keys.

## terminal-data

VPS path: `/usr/local/bin/terminal-data`
Cron: `30 21 * * *` (21:30 UTC = 17:30 ET, after US market close)

Nightly universe + price refresh. Two-phase design after the 2026-07-09 prevClose fix:

**Phase 1** (~5 min): flagship 37 + Polygon grouped-daily US OHLC + early hydrate → early
baseline swap. Gives the quote hub correct same-day prevClose by ~21:35 UTC.

**Phase 2** (~3-4 hr): full universe marathon (build_universe, expand, enrich, backfill,
gen_slices_all, intel bridge, intl OHLC) → final swap at ~03:00 UTC.

Both swaps are guarded by the 80%-count check (≥1000 floor).

Deploy: automatic — every `terminal-build.sh` run installs `ops/terminal-data` to
`/usr/local/bin/terminal-data` (merge to master → deploy; no scp).
