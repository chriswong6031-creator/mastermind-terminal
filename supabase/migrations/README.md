# `supabase/migrations` — what this directory is, and what it is not

This directory is the **schema source of record** for the shared Supabase project
(`fsldfzlxyavsuwqbceod`). It is NOT a migration runner, and nothing in the deploy chain applies it.

**Before you add a file here, claim its number.** Numbers are allocated when a pull request opens, not when it merges, and every open claim is listed in [Numbering and reservations](#numbering-and-reservations) at the foot of this file.

## There is no remote migration history

Censused read-only against production on **2026-08-20** via the Management API
(`POST https://api.supabase.com/v1/projects/<ref>/database/query`):

```
select nspname from pg_namespace where nspname = 'supabase_migrations';  ->  []
select version, name from supabase_migrations.schema_migrations;
    ->  ERROR 42P01: relation "supabase_migrations.schema_migrations" does not exist
```

**The `supabase_migrations` schema does not exist.** The Supabase CLI has never been run against
this project — there is no `config.toml`, no CLI on the Mac or the VPS, and no `db push` has ever
executed. So there is no remote history table, no applied/pending ledger, and nothing for a local
filename to be "out of sync" with.

That matters because the usual Supabase reconciliation advice — repair remote history, align
timestamps, `db push` — assumes a ledger that is not there. **Do not run `supabase db push` against
this project without reading the next section first.**

## How DDL actually lands

Applying a migration is an **operator action, out of band**, either in the Supabase SQL editor or
through the Management API with the PAT in `charting-app/.env`:

```bash
curl -X POST "https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_REF/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" --data '{"query":"<sql>"}'
```

Two hard-won rules (see root `HANDOFF.md` §5): strip `--` comments first — the endpoint splits on
`;` and chokes on a `;` inside a comment — and use `curl`, not python-urllib, which gets a
Cloudflare 1010 block.

Because application is manual and per-file, **the files here can be applied out of numeric order,
and have been.** Application status, re-censused 2026-08-21:

| file | object it creates | in production? |
|---|---|---|
| `0001`–`0007` | tables, RLS, policies, indexes | yes (recorded, largely no-ops) |
| `0008_chart_layouts_unique_name.sql` | `chart_layouts_user_name` | **yes** — applied 2026-08-21 |
| `0009_watchlist_symbol_unique.sql` | `wls_watchlist_symbol` | **yes** — applied 2026-08-19 |
| `0010_search_event_stats.sql` | `search_event_stats()` + `search_events_created_at` | **yes** — applied 2026-08-21 |

`0009` was applied two days before `0008`. The numbering records *when the DDL entered the repo*,
not when an operator ran it — so **never infer application status from file order.** Ask the
database:

```sql
select indexname from pg_indexes where schemaname = 'public';
select proname, prosecdef from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public';
```

Verifications recorded at the time of applying, so a later session need not re-derive them:
`search_event_stats` is `prosecdef = false` (INVOKER), `has_function_privilege` is false for both
`anon` and `authenticated` and true for `service_role`, and the same call through PostgREST answers
200 with the service key and `401 42501 permission denied for function` with the anon key.

## Version prefixes must be unique

`0008` was held by two different files at once — `0008_chart_layouts_unique_name.sql` (PR #427,
merged 13:43Z) and `0008_watchlist_symbol_unique.sql` (PR #426, merged 18:02Z) — because the two
PRs were authored in parallel off the same base and neither could see the other's number. The
later-merged file was renamed to `0009`, by merge time: an immutable fact recoverable from git,
unlike application status, which changes the moment an operator runs a file.

`tests/test_migration_ledger.py` now fails CI if two files ever share a prefix again.

## Every file must stay re-runnable

Since there is no ledger, a future session that adopts the CLI would find an empty history and try
to apply **everything** from `0001`. That is survivable only because every file here is idempotent:
`create table if not exists`, `create index if not exists`, `create policy` wrapped in
`duplicate_object` handlers, `drop trigger` before `create trigger`. `0009`'s duplicate-reconcile
`delete` is likewise a no-op once the unique index exists.

**Keep it that way.** A migration that is not safe to re-run is a migration that cannot be applied
in this estate, because nothing here records that it already was.

## Numbering and reservations

Ruled 2026-09-06 by Meta-CEO B. The ruling is intended to be recorded in the Macro repo as
`agentos/decisions/DEC-SUPABASE-MIGRATION-NAMESPACE-TERMINAL-LEDGER-2026-09-06.md`; as of this pull
request that path does **not** exist on macro `origin/main` (checked via `git cat-file -e
origin/main:agentos/decisions/DEC-SUPABASE-MIGRATION-NAMESPACE-TERMINAL-LEDGER-2026-09-06.md`, and
via `git ls-tree --name-only origin/main agentos/decisions/ | grep -iE 'supabase|migration'`, both
empty). The rules below are binding per the ruling regardless; the DEC citation itself is an open
null until that file is committed on macro `main` — do not read its presence here as proof the
record has landed. Four rules, in plain words:

**(a) One forward ledger.** This directory is the only forward migration ledger for the shared
Supabase project `fsldfzlxyavsuwqbceod`. The Macro repo's `scripts/deploy/000N` series is frozen as
a historical record: it is never extended, and any Macro-side DDL need becomes a pull request in
*this* directory instead. Macro's series carries its own `0004`–`0008`, which collide numerically
with the files here and mostly describe different objects — those numbers are history, not
addresses, and nothing should ever be matched across the two series by number.

**(b) A number is claimed when a pull request opens, or reserved directly by Meta-CEO B
ahead of a pull request** (as with `0013`/`0014` below, which have no open pull request yet). The
next free number is `max(number on `master`, numbers already reserved in the table below, numbers
claimed by open pull requests) + 1` — the reservations table is part of the formula, not something
derived after it, precisely so a Meta-CEO B pre-reservation with no open pull request (like `0013`/
`0014`) is never invisible to the next claimant. Whoever opens the pull request writes that number
into the reservations table below **in the same pull request**; a Meta-CEO B pre-reservation is
written into the table by the ruling that creates it. If two pull requests end up on one number, the
earlier-opened one keeps it and the later one renumbers before it merges. **A reservation is
released** — its number returned to the free pool for Meta-CEO B to reassign — the moment its owning
pull request closes without merging, or (for a pre-reservation) the moment Meta-CEO B stands it
down; a released number is struck from the table with a `released` status rather than left `reserved`
so the next claimant's `max()` does not pin it forever.

**(c) The reservations standing today** are `0011` `analytics_eid` (#507), `0012` `thesis_objects`
(#502, renumbering from `0011`), `0013` `alert_runs_outbox` (F08 slice 1, Meta-CEO B), and `0014`
`tenancy_foundation` (F12, Meta-CEO B).

**(d) Every file stays re-runnable, and applying it stays out of band.** Each migration is
idempotent (`create ... if not exists`, `create policy` wrapped in `duplicate_object` handlers,
`drop trigger` before `create trigger`), carries a `-- down:` comment block saying how to undo it,
and carries a `-- readback:` catalog query that answers whether it is live. Applying it remains an
operator / Meta-CEO action performed by hand, out of band: the before-and-after catalog readback is
posted on the pull request first, and only then is the application table above updated.

### Reservations

| number | name | owner (PR / packet) | status |
|---|---|---|---|
| `0011` | `analytics_eid` | PR #507 (ready) | reserved |
| `0012` | `thesis_objects` | PR #502 (draft — renumbers from `0011`) | reserved |
| `0013` | `alert_runs_outbox` | F08 slice 1 (Meta-CEO B) — no pull request open yet | reserved |
| `0014` | `tenancy_foundation` | F12 (Meta-CEO B) — no pull request open yet | reserved |

What the statuses mean: **reserved** — the number is claimed and no file for it is on
`master`; **merged** — the file is on `master`; **applied** — an operator has run it against
production and posted the readback; **released** — the owning pull request closed unmerged (or the
pre-reservation was stood down) and the number has returned to the free pool.

**None of these four is merged, and none is applied.** Nothing in this table has reached the
database, and the "in production?" table above is still the only record of what has. Do not read a
reservation as a schema that exists.

How these numbers were derived, so a later reader can re-check rather than trust: `master` holds up
to `0010`, and the only open pull requests carrying a file in this directory are #507 and #502,
which both claimed `0011` — so `0012`, `0013` and `0014` were the next free numbers.

One thing this table does **not** derive from rule (b): #502 opened on 2026-09-03 and #507 on
2026-09-05, so rule (b)'s earlier-pull-request tiebreak, applied on its own, would have left `0011`
with #502. The 2026-09-06 ruling allocated `0011` to #507 and `0012` to #502 directly. Rule (b)
governs every future collision; this one pair was set by the ruling.
