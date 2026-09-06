# `scripts/supabase_apply.py` — how to apply a migration with receipts

## 1. What this is and is not

This is a **reviewed wrapper** around the one Management API call documented in
`supabase/migrations/README.md` (the `POST …/database/query` curl). It is **not**
a migration runner: it does not track which files have been applied, it applies
exactly one named file per invocation, and it grants no authority on its own to
run `--apply` — applying DDL against the shared project remains an out-of-band
Meta-CEO act per `DEC-SUPABASE-MIGRATION-NAMESPACE-TERMINAL-LEDGER-2026-09-06`.
This tool exists to make that one manual act safe and receipted, not to replace
the decision of when to make it.

## 2. The two hard-won rules it encodes (root `HANDOFF.md` §5)

1. **Strip `--` comments before sending SQL to the endpoint.** The endpoint
   splits the query on `;`, and a `;` sitting inside a comment corrupts that
   split. `strip_sql_comments` / `split_statements` are quote- and
   dollar-quote-aware so this never mangles a string literal or a function
   body.
2. **Talk to the endpoint with `curl`, not `urllib`.** `python-urllib` trips a
   Cloudflare 1010 block on this host; `CurlRunner` shells out to `curl` via
   `subprocess` instead, with the token passed on stdin via `--config -` so it
   never appears in `argv` (world-readable via `ps` on a shared host).

## 3. The receipt protocol — never update the README table first

```
python3 scripts/supabase_apply.py supabase/migrations/00NN_x.sql --dry-run
python3 scripts/supabase_apply.py supabase/migrations/00NN_x.sql --apply --receipt /tmp/00NN_receipt.json
```

1. Run `--dry-run` first. Paste nothing yet — this step has made no network
   call and proves nothing landed.
2. Run `--apply --receipt <path>`. Paste the **receipt JSON** on the PR — it
   carries the pre-apply and post-apply catalog readback, not just a claim
   that the apply "worked".
3. **Only after the receipt is posted**, update the application table in
   `supabase/migrations/README.md`. Never the other order — the receipt is the
   evidence the README row exists to summarize.

## 4. What the guards refuse, and why

There is no `supabase_migrations` ledger (`DSC-TERMINAL-HAS-NO-MIGRATION-LEDGER`):
nothing records which files already ran, so every file must answer that
question about itself, every time it is applied. The guards enforce that:

- **`CREATE TABLE`/`INDEX`/`POLICY`/`TRIGGER` without an `IF NOT EXISTS` /
  `duplicate_object` / `DROP … IF EXISTS` guard** — refused. Without a ledger,
  a second run of the same file must be a no-op, not an error.
- **No `-- down:` block** — refused. A file that does not say how to undo
  itself cannot be safely retried either.
- **No `-- readback:` block, or an empty one** — refused. Without a query that
  proves the objects exist, there is nothing for `--apply` to check against.
- **`--allow-legacy` outside `0001`–`0010`** — refused. The waiver exists only
  for the files that predate this convention.

## 5. The 401 playbook

A Supabase Management PAT expires roughly 30 days after it is minted
(`DSC-SUPABASE-MANAGEMENT-PAT-EXPIRES-AT-30-DAYS`). An HTTP 401 here means
**rotate the token**, not debug this script or the migration: mint a fresh
`sbp_…` value and update `charting-app/.env`.

## 6. Transaction-wrapped files

A file that opens with `begin;` and closes with `commit;` (e.g. `0014`) is sent
to the Management API as a **single POST**, wrapper intact — splitting it into
per-statement POSTs would put `begin;` and `commit;` in different HTTP
requests (and therefore different sessions), silently evaporating the
transaction and risking a half-migrated database on a mid-file failure while
the tool has already reported the earlier statements "applied". A file with no
wrapper (e.g. `0013`) is sent one statement at a time, numbered as it goes.

## 7. Worked example (`0013_alert_runs_outbox.sql`-shaped file)

```
$ python3 scripts/supabase_apply.py supabase/migrations/0013_alert_runs_outbox.sql --dry-run
supabase_apply -- supabase/migrations/0013_alert_runs_outbox.sql
project: fsldfzlxyavsuwqbceod    mode: dry-run
sha256:  9f2c...
guards:  re-runnable OK · down block OK · readback block OK
apply mode if run: statement-at-a-time (no begin;/commit; wrapper in this file)

statements that WOULD run (4):
  [01] create table if not exists public.alert_runs ( id bigint …
  [02] create unique index if not exists alert_runs_id_key …
  [03] do $$ begin create policy alert_runs_read …
  …
readback query that WOULD run (3 statements):
  [01] select c.relname from pg_class c where c.relname = 'alert_runs'
  …
objects this file should create (3): table alert_runs · index alert_runs_id_key · policy alert_runs_read

no network call was made.
```

See the PR body for a real transcript run against files on disk, including the
`0010_search_event_stats.sql` refusal (it has no `-- down:`/`-- readback:`
block — a correct exit-3 demonstration of the guard, not a bug).
