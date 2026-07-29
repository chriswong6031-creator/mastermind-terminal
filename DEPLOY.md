# Deploying the Mastermind Terminal — READ THIS FIRST

**The live site (`app.mastermind-x.com`) is GIT-GATED. `origin/master` is the single source of truth.**

As of 2026-07-09 the VPS build script (`/opt/terminal/terminal-build.sh`) builds **only `origin/master`**.
Editing files under `/opt/terminal/terminal` directly (scp/rsync of a working tree) **does nothing** —
the build ignores the working tree and overwrites it with `master` on every deploy. This exists because
sessions were rsync'ing working trees straight to the box and silently overwriting each other's live work.

## To ship a change — the ONLY supported flow

1. **Branch + commit** your change (work in a git checkout, not on the box).
2. **Open a PR** to `master` on `github.com/chriswong6031-creator/mastermind-terminal`.
3. **Merge to `master`** (get it reviewed / conflicts resolved against everyone else's merged work).
4. **Deploy** — run the build on the VPS (it fetches + builds `origin/master`, zero-downtime, auto-rollback):

   ```sh
   ssh root@146.190.142.17 'bash /opt/terminal/terminal-build.sh'
   ```

That's it. Because everyone deploys the same committed `master`, nobody's work can be reverted by
another session's deploy.

## What the build script does (`terminal-build.sh`)

`git fetch && reset --hard origin/master` in `/opt/terminal/.gitsrc` (a read-only-deploy-key checkout)
→ stage master's `terminal/` + overlay the box's gitignored runtime (`node_modules`, `.env*`, `public/data`)
→ `next build` in the stage → verify `BUILD_ID` → **atomic-swap `.next`** (live site stays up throughout;
auto-rolls-back if health fails) → **runtime-code sync** (cron/systemd scripts, below) → sync
`/opt/terminal/terminal` source back to `master`.

The script's authoring source is **`ops/terminal-build.sh` in this repo** — every deploy re-installs it
to `/opt/terminal/terminal-build.sh` (a change to it takes effect on the *next* deploy). Never edit the
box copy in place.

## What a deploy ships — exact paths

One `terminal-build.sh` run deploys **all** of the following from the same `origin/master` SHA.
If the deploy fails (build error or health check), **nothing** moves — app and runtime code both
stay on the previous state.

| repo path | deployed to | how |
|---|---|---|
| `terminal/` | `/opt/terminal/terminal` + live `.next` | staged `next build` → atomic `.next` swap |
| `ingest/` | `/opt/terminal/ingest` | overlay (nightly `terminal-data`, 5-min `fast_flagship`, `alerts_engine` crons) |
| `signal_layer/` | `/opt/terminal/signal_layer` | overlay (GC-v2 engine imported by `fast_flagship` — reconciled 2026-07-10) |
| `scripts/` | `/opt/terminal/scripts` | overlay (`build_data_coverage` cron) |
| `config/`, `contracts/` | `/opt/terminal/{config,contracts}` | overlay |
| `hub/` | `/opt/terminal/hub` | overlay + `npm ci` if lockfile changed + `systemctl restart quote-hub` **only if changed** |
| `ops/terminal-data` | `/usr/local/bin/terminal-data` | install (the nightly-cron wrapper) |
| `ops/terminal-build.sh` | `/opt/terminal/terminal-build.sh` | install — takes effect on the **next** deploy |
| `ingest/suite_alerts.ts` | `/opt/terminal/ingest/dist/suite_alerts.mjs` | esbuild bundle (step 9) — 5-min cron, reads `public/data`, fires `suite_event` alerts |

**Overlay = `git archive origin/master <dirs> \| tar -x`: tracked files are overwritten; box-only
untracked files are preserved.** As of 2026-07-10 every cron-run script in `ingest/` and the whole
`signal_layer/` (incl. the GC-v2 `confluence_v2.py`) are committed — **origin/master is the source
of truth for all deployed code**. The only box-only files left are runtime caches
(`ingest/hk_universe_cache.json`, `ingest/zh_cache.json`, `ingest/.polygon_*.json`) and `*.bak-*`
backups (all gitignored so a stale copy can't be committed and clobber the box) — that is why the
sync must never become `rsync --delete`.

### Suite-event alerts cron (`ingest/suite_alerts.ts` → `ingest/dist/suite_alerts.mjs`)

The Node sidecar that fires `{type:"suite_event"}` alerts by running the REAL premium-suite
modules (`terminal/lib/suites`) over daily bars — zero algorithm duplication with the chart.
Because it imports `terminal/lib`, the cron consumes an **esbuild bundle** that step 9 of
`terminal-build.sh` rebuilds on every deploy into `/opt/terminal/ingest/dist/suite_alerts.mjs`
(the `dist/` output is untracked, so the step-7 overlay preserves it; a bundle failure is
non-fatal — the cron keeps the previous bundle). Evaluation basis is honest-by-design: module
defaults only (user chart params are client-side), daily bars only, one-shot disarm semantics
identical to `alerts_engine.py`.

**Box-side, install once** (not managed by the deploy — same as the other cron lines).
Offset +4 min so each run follows the 5-min data/flagship refresh:

```cron
4-59/5 * * * * cd /opt/terminal && /usr/bin/node ingest/dist/suite_alerts.mjs >> /var/log/suite-alerts.log 2>&1
```

### Deliberately NOT deployed

- `api/`, `docs/`, `indicator_engine/`, `tests/`, `web/`, `supabase/`, `requirements.txt` — not
  consumed on the box.
- `terminal/public/data/` (gitignored) — market/intel data, refreshed by crons, preserved across deploys.

## Notes

- `public/data/*.json` (market/intel data) is **not** in git — it's refreshed on the box by the nightly
  data crons and preserved across deploys. Do not commit it.
- Secrets live in `/opt/terminal/.env` / `terminal/.env.local` on the box (gitignored) — preserved across deploys.
- `next.config.ts` sets `typescript.ignoreBuildErrors` + `eslint.ignoreDuringBuilds`, so the build won't
  catch type errors — run `tsc --noEmit` yourself before merging.
- Rollback: the previous build is kept at `/opt/terminal/terminal/.next.bak` (auto-restored on a failed
  health check); to force a rollback, swap it back and `systemctl restart terminal`.
