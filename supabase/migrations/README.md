# `supabase/migrations` — what this directory is, and what it is not

This directory is the **schema source of record** for the shared Supabase project
(`fsldfzlxyavsuwqbceod`). It is NOT a migration runner, and nothing in the deploy chain applies it.

**Before you add a file here, claim its number.** See [Numbering and reservations](#numbering-and-reservations) at the foot of this file for the allocation rule and the current list of open claims.

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

Ruled 2026-09-06 by Meta-CEO B. The DEC record is committed on the Meta-CEO B branch and lands
on macro `main` through macro PR #6903; until that merge this README is the only public copy of
the ruling text.

### Ruling text (binding, DEC-SUPABASE-MIGRATION-NAMESPACE-TERMINAL-LEDGER-2026-09-06)

Four rules, in plain words:

**(a) One forward ledger.** This directory is the only forward migration ledger for the shared
Supabase project `fsldfzlxyavsuwqbceod`. The Macro repo's `scripts/deploy/000N` series is frozen as
a historical record: it is never extended, and any Macro-side DDL need becomes a pull request in
*this* directory instead.

**(b) A number is claimed when a pull request opens.** The next free number is
`max(number on master, numbers claimed by open pull requests) + 1`, recorded in a Reservations
table in this README in the same pull request. A collision resolves in favour of the
earlier-opened pull request; the later one renumbers before merging.

**(c) The initial seed is a one-time ruling exception to (b):** `0011` stays with #507 because it
is a one-file Ready PR whose DDL is already applied live, while #502 is a 25-file Draft that must
rebase regardless; no future exception to (b) without a DEC amendment.

**(d) Every file stays re-runnable, and applying it stays out of band.** Each migration is
idempotent, carries a `-- down:` comment block saying how to undo it, and carries a `-- readback:`
catalog query that answers whether it is live. Applying it remains an operator / Meta-CEO action
performed by hand, out of band, and the pre/post catalog readback is posted on the pull request
before the README application table is updated.

### Operating notes (README author extension, not part of the ruling)

These describe how this README author is implementing rules (a)-(d) above, plus one illustrative
fact about rule (a). None of this is itself ruled text — a future change to any of it needs no DEC
amendment, only a README edit.

- **Numeric collision with Macro's frozen series.** Macro's frozen `scripts/deploy/000N` series
  carries its own `0004`–`0008`, which collide numerically with the files here and mostly describe
  different objects — those numbers are history, not addresses, and nothing should ever be matched
  across the two series by number.
- **Meta-CEO B pre-reservation channel.** Meta-CEO B may reserve a number directly, ahead of any
  pull request opening — as done for `0013`/`0014`, which had no open pull request at the time
  they were first reserved. Such a pre-reservation is written into the table by the ruling record
  that creates it, not by a pull request; the pull request that later claims that number updates
  the table's owner and status columns rather than adding a new row.
- **Formula fold-in.** The `max()` in rule (b) is read here as counting the reservations table
  below as well as open pull requests — not something derived after the formula — precisely so a
  Meta-CEO B pre-reservation with no open pull request (like `0013`/`0014` were, before #513/#514
  opened) is never invisible to the next claimant.
- **Release path.** A reservation is released — its owning claim stood down — the moment its
  pull request closes without merging, or (for a pre-reservation) the moment Meta-CEO B stands it
  down; the row is not removed. Its status changes to `released` in place, replacing `open PR`
  (or `reserved` for a number never opened as a PR), so the table stops reading it as an active
  claim. Because the formula fold-in above counts
  every row in this table regardless of status, a released row's number keeps counting toward
  `max()` like any other row — `released` marks the claim as abandoned, it does not free the
  number for reissue. `released` is a status this README defines to implement the release path
  above; it is not one of the ruling's enumerated statuses. No number below has been released.

### Reservations

| number | name | owner (PR / packet) | status |
|---|---|---|---|
| `0011` | `analytics_eid` | PR #507 (applied live 2026-09-05; readback receipt: https://github.com/mastermindx-market-intelligence/mastermind-terminal/pull/507#issuecomment-5557754941) | applied |
| `0012` | `thesis_objects` | PR #502 (renumbering in flight) | open PR |
| `0013` | `alert_runs_outbox` | PR #513 (open PR, packet B-F08-2) | open PR |
| `0014` | `tenancy_foundation` | PR #514 (open PR, packet B-F12-1) | open PR |

What the statuses mean: **reserved** — the number is claimed (for example, by a Meta-CEO B
pre-reservation) but no pull request carrying its file is open yet; **open PR** — a pull
request carrying the file for this number is open and not yet merged; **merged** — the file
is on `master`; **applied** — an operator has run it against production and posted the
readback. (**released** is an operating-note-only status — see "Release path" above — for a
claim that was stood down; it is not one of the ruling's own status words and
no row currently carries it.)

Only `0011` has reached production: its corrective DDL was applied live on 2026-09-05 via the
management API and recorded on PR #507, ahead of `0011`'s own file landing on `master`. The "in
production?" table above predates this reservation and covers only `0001`–`0010`, so this paragraph
is the record of that fact until that table is updated. None of `0012`/`0013`/`0014` is merged or
applied — do not read this table as a schema that exists beyond `0011`'s applied DDL.

This table is re-verified at merge time, not just at the moment this pull request opened. A later
reader should re-run the same open-pull-request query rather than trust these owner cells past
that point:

```
$ gh pr list --repo mastermindx-market-intelligence/mastermind-terminal --state open --limit 60 \
    --json number,createdAt,files --jq '.[] | . as $p | ($p.files[].path | select(startswith("supabase/migrations/"))) as $f | [$p.number,$p.createdAt,$f] | @tsv'
```
