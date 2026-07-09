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
auto-rolls-back if health fails) → sync `/opt/terminal/terminal` source back to `master`.

## Notes

- `public/data/*.json` (market/intel data) is **not** in git — it's refreshed on the box by the nightly
  data crons and preserved across deploys. Do not commit it.
- Secrets live in `/opt/terminal/.env` / `terminal/.env.local` on the box (gitignored) — preserved across deploys.
- `next.config.ts` sets `typescript.ignoreBuildErrors` + `eslint.ignoreDuringBuilds`, so the build won't
  catch type errors — run `tsc --noEmit` yourself before merging.
- Rollback: the previous build is kept at `/opt/terminal/terminal/.next.bak` (auto-restored on a failed
  health check); to force a rollback, swap it back and `systemctl restart terminal`.
