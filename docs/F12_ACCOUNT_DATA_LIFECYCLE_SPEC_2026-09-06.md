# F12 — Account data export + deletion lifecycle (records-only spec)

**Packet** B-F12-2 · lane F12 · wave B2 · 2026-09-06 · **Kind: records** (no product code)
**File**: `docs/F12_ACCOUNT_DATA_LIFECYCLE_SPEC_2026-09-06.md` (this file), repo `mastermindx-market-intelligence/mastermind-terminal`, branch `claude/mo-b-b2-b-f12-2`.
*(The commission named `research/…`; this repo's default branch has no `research/` directory — `git ls-tree --name-only origin/master` returns `docs` and no `research`. Per the commission's own fallback, this lands in `docs/`.)*
**Live URL after merge: n/a — records only.** Nothing renders; no nav family is touched; no third header exists to create.
**Ledger rows closed:** MO-PAID-087 (lifecycle verification precedes scoping), MO-PAID-086 (export product spec), MO-PAID-078 (blocked on 087).

---

## 0. What this document is, and the one thing it is not

It is a build contract. It is **not** a verification of production. In this estate the DDL files are *not* the database: `supabase/migrations/README.md:6-20` records that the `supabase_migrations` schema **does not exist** in project `fsldfzlxyavsuwqbceod` (`select nspname from pg_namespace where nspname='supabase_migrations'` → `[]`), that DDL is applied by hand per-file, and `README.md:51-53` states outright: **"never infer application status from file order. Ask the database."** `0009` was applied two days before `0008` (`README.md:47-48`). So every cascade claim below is **DDL-asserted, production-unverified**, and §4 is a hard gate before §2/§3 are built.

---

## 1. Every user-scoped table in the estate (one Supabase project, two repos writing to it)

Repo codes: **T** = `mastermind-terminal` @ `origin/master`; **M** = `macro` @ `origin/main`.
Columns: FK to `auth.users` · ON DELETE · RLS · owner policy · reachable today by an authenticated user's own request.

| # | Table | DDL (file:line) | FK → auth.users | ON DELETE | RLS | Owner policy | Export route today |
|---|---|---|---|---|---|---|---|
| 1 | `profiles` | T `supabase/migrations/0001_init.sql:10` | `id` | **cascade** | `0001_init.sql:97` | `profiles_self` `0001_init.sql:107-108` | none (read via `/api/me` proxy only) |
| 2 | `watchlists` | T `0001_init.sql:31` | `user_id` | **cascade** | `0001_init.sql:98` | generic owner loop `0001_init.sql:117` | `T terminal/app/api/watchlist/route.ts:62` (GET) |
| 3 | `watchlist_symbols` | T `0001_init.sql:42` | via parent `watchlists(id)` | **cascade (parent)** | `0001_init.sql:99` | `wls_via_parent` `0001_init.sql:131-133` | same route as #2 |
| 4 | `chart_layouts` | T `0001_init.sql:53` (+ unique idx `0008_chart_layouts_unique_name.sql:84`) | `user_id` | **cascade** | `0001_init.sql:100` | generic owner loop `0001_init.sql:117` | `T terminal/app/api/layouts/route.ts:57` (GET) |
| 5 | `saved_scripts` | T `0001_init.sql:64` | `user_id` | **cascade** | `0001_init.sql:101` | `scripts_owner` `0001_init.sql:124` **+ `scripts_public_read` `0001_init.sql:126-127`** | `T terminal/app/api/scripts/list/route.ts:30` (GET) |
| 6 | `alerts` | T `0001_init.sql:78` | `user_id` | **cascade** | `0001_init.sql:102` | generic owner loop `0001_init.sql:117` | `T terminal/app/api/alerts/route.ts:62` (GET) |
| 7 | `favorites` | T `0001_init.sql:89` | `user_id` | **cascade** | `0001_init.sql:103` | generic owner loop `0001_init.sql:117` | **none** |
| 8 | `drawings` | T `0002_drawings.sql:11` | `user_id` | **cascade** | `0002_drawings.sql:21` | `drawings_owner` `0002_drawings.sql:25-26` | `T terminal/app/api/drawings/route.ts:20` (GET, per-symbol) |
| 9 | `brain_threads` | T `0005_brain_threads.sql:16` | `user_id` | **cascade** | `0005_brain_threads.sql:27` | select-own `0005_brain_threads.sql:31-34` (no insert/update/delete policy — service-role only, `0005:10-11`) | `T terminal/app/api/brain/[...path]/route.ts:200` (GET, proxy) |
| 10 | `brain_messages` | T `0005_brain_threads.sql:39` | via parent `brain_threads(id)` | **cascade (parent)** | `0005_brain_threads.sql:50` | select-own via parent `0005_brain_threads.sql:53-61` | same proxy as #9 |
| 11 | `portfolio_positions` | T `0007_portfolio_positions.sql:86`; M `templates/uwp_supabase.sql:36-55` | `user_id` | **cascade** | T `0007:104` / M `uwp_supabase.sql:36` | 4 policies T `0007:111-127` / M `uwp_supabase.sql:40-55` | `T terminal/app/api/portfolio/route.ts:60` (GET) |
| 12 | `search_events` | T `0003_search_events.sql:43` | `user_id` | **set null** | `0003:54` | **deny-all, no policies on purpose** `0003:53` | **none** (service-role only) |
| 13 | `analytics_events` | T `0004_analytics.sql:32`; M `scripts/deploy/0004_analytics.sql:17` | `user_id` | **set null** | T `0004:47` / M `0004:29` | **deny-all** T `0004:46` | **none** |
| 14 | `ip_geo` | T `0004_analytics.sql:50`; M `scripts/deploy/0004_analytics.sql:31` | none (`ip` PK) | n/a | T `0004:71` / M `0004:39` | **deny-all** `0004:70` | **none** — not user-scoped, but joins to #13 by `ip` |
| 15 | `user_entitlements` | M `scripts/deploy/0005_user_entitlements.sql:10` | `user_id` (PK) | **cascade** | `0005:26` | select-own `0005:33` | M `app/main.py:1044` `GET /api/account` (derived fields only) |
| 16 | `stripe_events` | M `scripts/deploy/0005_user_entitlements.sql:40` | none | n/a | `0005:45` | deny-all | **none** |
| 17 | `support_tickets` | M `scripts/deploy/0007_support_email.sql:24,32` | `user_id` | **set null** | `0007:45` | deny-all (`0007:150`) | **none** |
| 18 | `support_ticket_messages` | M `scripts/deploy/0007_support_email.sql:53,55` | via `support_tickets(id)` | **cascade (parent)** — parent is NOT deleted, so effectively **retained** | `0007:64` | deny-all (`0007:151`) | **none** |
| 19 | `email_log` | M `scripts/deploy/0007_support_email.sql:74,81` | **`user_id uuid` with NO `references` clause** | **none — row survives, carrying `to_email` (`0007:80`)** | `0007:92` | deny-all (`0007:152`) | **none** |
| 20 | `email_prefs` | M `scripts/deploy/0007_support_email.sql:99-100` | `user_id` (PK) | **cascade** | `0007:106` | deny-all (`0007:153`) | M `app/main.py:1072-1075` returns `prefs` from auth metadata, not this table |
| 21 | `email_suppression` | M `scripts/deploy/0007_support_email.sql:113-114` | none — **keyed on the address** (`0007:109-111`) | n/a | `0007:119` | deny-all (`0007:154`) | **none** |
| 22 | `email_campaigns` | M `scripts/deploy/0007_support_email.sql:126` | none | n/a | `0007:143` | deny-all (`0007:155`) | **none** — operator artifact |
| 23 | `trade_episodes` | M `scripts/deploy/0008_trade_memory.sql:13` | `user_id` | **cascade** | `0008:59` | 4 owner policies `0008:62-71` | **none** |
| 24 | `trade_memory_patterns` | M `scripts/deploy/0008_trade_memory.sql:77` | `user_id` | **cascade** | `0008:86` | select-own `0008:88` | **none** |
| 25 | `auth.users.user_metadata` | written M `lib/user_prefs.py:160` via `_admin_url` `lib/user_prefs.py:131-135` | is the user | n/a | GoTrue | service-role key `lib/user_prefs.py:117-123` | read-back M `app/main.py:1072-1075` |
| 26 | research-vault download quota ledger | M `engine/research_vault/download_quota.py:55` (`_quota_dir`), `:61` (`_safe_uid`), `:91` (`_ledger_file`) | **filesystem JSON, not Supabase** | **no cascade — survives account deletion** | n/a | n/a | **none** |
| 27 | Stripe customer + subscriptions | M `app/billing.py:643` (`read_entitlement`), `:550` (PostgREST), `:1470` (`_cancel_subscriptions`) | external processor | **outside our database** | n/a | n/a | Stripe portal `T terminal/app/api/billing/portal/route.ts` |

**Read of that table:**
1. **Twelve tables cascade on auth deletion** (#1-11, 15, 20, 23, 24) — ~85% of the deletion job *if* production FKs match these files, which §4 must prove.
2. **Four tables do NOT cascade and hold identifiable data after deletion**: `search_events`/`analytics_events` null `user_id` but keep re-linkable `anon_id`/`visitor_id`/`ip`; `support_tickets` nulls `user_id` while `support_ticket_messages` keeps the user's own prose; `email_log` keeps `to_email` with no FK at all.
3. **One table must be deliberately RETAINED**: `email_suppression` is address-keyed to cover people who never registered — deleting it would silently re-subscribe someone who unsubscribed.
4. **Two stores live outside Postgres**: the filesystem quota ledger and Stripe. Neither is reached by any cascade.

---

## 2. Export spec (closes MO-PAID-086)

### 2.1 Where it lives
**Owner: the macro repo (FastAPI), new route `GET /api/account/export`.** The account panel is macro-hosted and loaded on every macro page (`M templates/theme.js:469-480`, `M templates/seo_base.html.j2:505`, `M scripts/build_site.py:5775`); identity/entitlement already lives at `M app/main.py:1044`; the Terminal is explicitly a thin proxy that never holds a secret key (`T terminal/app/api/billing/gateway.ts:5-6,20-21`). Building the export in the Terminal would need a second privileged path — **forbidden by F12 do_not_redo (no second auth/tenant plane, no secret store)**. The Terminal's only possible change is a link to the macro account panel; this packet builds none.

### 2.2 Contract
`GET /api/account/export`, `Authorization: Bearer <supabase access token>` → 200 JSON attachment `mastermind-export-<YYYY-MM-DD>.json`; 401 no/invalid token; 429 one export per 15 min per user; 503 `{error, partial:false}` (never a half bundle silently).

Body v1: `schema:"mm.account_export.v1"`, `generated_at`, `account{user_id,email,email_confirmed,created_at,display_name,prefs}` (`app/main.py:1056-1075`, `lib/user_prefs.py:94`), `plan{tier,status,interval,current_period_end}` (`app/billing.py:643`), `collections{watchlists, watchlist_symbols, chart_layouts, saved_scripts, alerts, favorites, drawings, portfolio_positions, brain_threads, brain_messages, trade_episodes, trade_memory_patterns}`, `counts{<collection>:int}` (present for every collection, 0 included), `not_included[{what,why,how_to_ask}]`, `unavailable[{what,why}]`.

Rows are stored rows, unchanged — no scoring, no derived judgement, no LLM-written summary (A7). `unavailable` is the null-disclosure channel: a failed collection is named there, omitted from `counts`, and the bundle still ships — never a silent drop.

### 2.3 Excluded in v1 (plain words, EN+ZH, each `{what,why,how_to_ask}`)
- Site usage records (`search_events`, `analytics_events`, `ip_geo`) — kept partly against a cookie, not the account; ask support.
- Support messages (`support_tickets`, `support_ticket_messages`) — held in helpdesk records; ask support.
- Email delivery records (`email_log`) — a sending record, not account content.
- Payment records (Stripe) — held by the payment processor; receipts in the billing portal.
- Download allowance counters (research-vault quota) — monthly usage count.
CSV/zip is explicitly deferred; copy says "JSON only for now". MO-PAID-086's "CSV/JSON snapshot" is therefore **partially** closed: JSON ships, CSV is a named null.

### 2.4 Plain-language copy (account panel, EN / ZH)
Button: "Download my data" / "下载我的数据". Subtext: "A single file with your watchlists, layouts, drawings, alerts, positions, saved scripts and chat threads." / "一个文件，包含你的自选、布局、画线、提醒、持仓、脚本和对话记录。" Running: "Preparing your file…" / "正在准备文件…" Failure: "We could not build your file. Nothing was changed. Try again in a few minutes." / "暂时无法生成文件。你的数据没有任何改动。请几分钟后再试。" Banned: "export job", "payload", "schema", "RLS", any table name.

### 2.5 Export — not done unless (macro `tests/test_account_export.py`)
1. Owner isolation: seeded user B present in every table, user A's bundle has zero rows with `user_id`≠A.
2. No token, no bundle: absent/expired/other-project token → 401, empty body, no Supabase call.
3. Counts match rows per collection; zero-row collections show `0`, not omitted.
4. A failed collection is disclosed, not dropped: injected read failure → 200, that collection in `unavailable`, absent from `counts`, others intact.
5. `not_included` complete: all five entries present, non-empty `what`/`why`/`how_to_ask` in both languages.
6. No fabricated field: every key in `collections.*` maps to a §1-asserted column; a golden fixture pins the key set.
7. Rate limit holds: second call inside 15 min → 429, no Supabase round trip.

---

## 3. Deletion spec (closes MO-PAID-087; unblocks MO-PAID-078)

### 3.1 Contract
`POST /api/account/delete`, `Authorization: Bearer <token>`, body `{confirm_email}` → 200 `{ok:true, receipt}`; 400 mismatch; 401 no token; 409 already in progress; 503 `{ok:false, stage, receipt(partial)}`.

### 3.2 Order of operations (load-bearing)
0. Verify token→user; require typed `confirm_email` match (`app/account_prefs.py:17-19`).
1. Offer (never force) the §2 export first; UI requires a checkbox acknowledgement.
2. Cancel live Stripe subscriptions — reuse `app/billing.py:1470 _cancel_subscriptions` — must precede identity deletion or a charge lands on a vanished account.
3. Explicit deletes for non-cascading stores: `support_ticket_messages`+`support_tickets` for that user, `email_log` rows for that `user_id` (no FK), scrub `search_events`/`analytics_events` beyond the automatic set-null. Stage 5 does not reach these.
4. Delete the filesystem quota ledger for `_safe_uid(user_id)` (`engine/research_vault/download_quota.py:61,91`) — outside Postgres.
5. `DELETE {SUPABASE_URL}/auth/v1/admin/users/{id}` with the service-role key — the existing admin path (`lib/user_prefs.py:117-123,131-135`). No new secret store, no new auth plane. Cascades tables #1-11,15,20,23,24 *if §4.1 confirms it*.
6. Write a receipt keyed by `sha256(user_id+email)` — never the raw identifiers.
7. Return + email the receipt as a transactional class (not suppressed by `email_prefs.marketing_opt_out`, `scripts/deploy/0007_support_email.sql:95-97`).
Retained on purpose: `email_suppression`, Stripe's own records, aggregate campaign counters — each disclosed by name in the confirmation copy.

**Failure posture:** every stage idempotent/re-runnable; a failure at stage n returns 503 with `stage` + partial receipt, account left usable. A partially deleted account must never be reported as deleted. Stage 5 is the point of no return and runs last by design.

### 3.3 Receipt fields
`request_id`, `subject_digest` (sha256 as above), `requested_at`, `completed_at`, `stages[{name,status:ok|skipped|failed,rows_deleted|null}]`, `retained[{what,why}]`, `export_offered:bool`. **Must be emitted in the K1 `EvidenceRef`/`EvidenceBlock` shape** — the builder maps these fields into that contract rather than inventing a near-miss shape.

### 3.4 Plain-language copy (EN / ZH)
Trigger: "Delete my account" / "删除我的账户". Confirm: "This removes your account and the data you created: watchlists, layouts, drawings, alerts, positions, saved scripts and chat threads. It cannot be undone. Download your data first if you want a copy." / "这将删除你的账户以及你创建的数据：自选、布局、画线、提醒、持仓、脚本和对话记录。无法撤销。如需保留副本，请先下载你的数据。" Kept-on-purpose: "We keep two things: a record that this email asked not to receive marketing, and payment records our payment provider must keep by law." / "我们会保留两项：该邮箱不再接收营销邮件的记录，以及支付服务商依法必须保留的付款记录。" Typed confirm label: "Type your email address to confirm" / "请输入你的邮箱以确认". Success: "Your account is deleted." / "你的账户已删除。" plus "We sent a confirmation to <email>." — never "request submitted" when complete, never "deleted" when it isn't. Partial failure: "We could not finish. Your account is still active and nothing was lost. Contact support with this reference: <request_id>." / "未能完成。你的账户仍然有效，数据没有丢失。请凭此编号联系客服：<request_id>。"

### 3.5 Deletion — not done unless (macro `tests/test_account_deletion.py`)
1. Cascade proof per table: seeded user with ≥1 row in every §1 row 1-11/15/20/23/24 → after stage 5, each returns 0 rows for that id, failing per table name.
2. Non-cascading stores explicitly emptied: `support_tickets`/`support_ticket_messages`/`email_log` hold no row for that user/address; `search_events`/`analytics_events` hold no row bearing the user's `anon_id`/`visitor_id` — the test that would have caught #19's missing FK.
3. Retention intentional and asserted: `email_suppression` for that address still present after deletion, receipt's `retained` names it.
4. Cross-tenant safety: a second seeded user's rows in every table byte-identical before/after.
5. Wrong confirmation deletes nothing: mismatch → 400, zero writes anywhere (row counts, not mock-call counts).
6. Stripe first: injected stage-2 failure → 503 `stage="cancel_subscriptions"`, `auth.users` still holds the user.
7. Idempotent replay: re-run for an already-deleted user → 200, every stage `skipped`, no new receipt row.
8. Receipt carries no raw identifier: neither email nor user id in any stored field; `subject_digest` reproduces from `sha256(user_id+email)`.

---

## 4. Production readbacks the Meta-CEO must run BEFORE any build (mandatory gate)

Via the Management API with the PAT in `charting-app/.env` (`supabase/migrations/README.md:31-35`; strip `--` comments, use `curl` not python-urllib, `README.md:37-39`). Project ref `fsldfzlxyavsuwqbceod` (`README.md:4`). Every §1 cascade cell is unproven until Q1 answers.

1. **Q1 (most important):** `select conrelid::regclass as tbl, conname, confdeltype from pg_constraint where confrelid='auth.users'::regclass order by 1;` — compare row-for-row vs §1; any §1 table absent means stage 5 will not touch it.
2. **Q2:** `select table_name from information_schema.tables where table_schema='public' order by 1;` — tables in prod but no file (README:41-53 makes this non-optional).
3. **Q3:** `select relname, relrowsecurity, relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public';` — RLS actually on.
4. **Q4:** `select tablename, policyname, cmd, qual from pg_policies where schemaname='public' order by 1,2;` — confirms deny-all posture of #12/13/17-22 and the `scripts_public_read` exception (#5).
5. **Q5:** `select column_name, data_type, is_nullable from information_schema.columns where table_schema='public' and table_name='portfolio_positions';` — its exact column set was never fully verified (`0007_portfolio_positions.sql:40-68`).
6. **Q6:** Q1's query restricted to `nspname='auth'` — do `auth.identities`/`sessions`/`refresh_tokens`/`mfa_factors`/`one_time_tokens` cascade? Documented Supabase behaviour, not a fact in our files.
7. **Q7:** `select tgname, tgtype, tgenabled from pg_trigger where tgrelid='auth.users'::regclass and not tgisinternal;` — `0001_init.sql:24-25` installs `on_auth_user_created`; confirm no delete-side trigger.
8. **Q8:** `select id, name, public from storage.buckets;` and, if any, `select count(*) from storage.objects where owner='<test uid>';` — no file in either repo creates a bucket, so whether user files exist is genuinely unknown.
9. **Q9:** `select table_name, privilege_type, grantee from information_schema.role_table_grants where table_schema='public' and grantee in ('anon','authenticated') order by 1;` — confirm `profiles` UPDATE stays narrowed to `display_name` (`0003:27`, `0006:50`).
10. **Q10 (the only proof of hard-vs-soft delete):** create a throwaway user, seed one row per §1 table, snapshot counts, run `DELETE /auth/v1/admin/users/{id}`, re-snapshot. Record whether the row vanishes from `auth.users` or is merely marked deleted.
11. **Q11 (orphan census after Q10):** for `search_events`/`analytics_events`/`support_tickets`/`email_log`, count rows still bearing the test user's `anon_id`/`visitor_id`/`ip`/`to_email` — the exact size of stage 3.

**Gate rule:** if Q1 disagrees with §1 for any table, §3.2 stage 3 grows and this document is amended before code is written — the builder does not reconcile the difference on the fly.

---

## 5. Standing-gate compliance
- **No third nav family:** the future UI is a section of the existing `M templates/account.js`, loaded via `M templates/theme.js:469-480`; no new header/route chrome. This packet ships none of it.
- **No second auth/tenant plane, no secret store** (F12 do_not_redo): identity is existing Bearer/Supabase verification, the privileged call is the already-shipped GoTrue admin URL builder `lib/user_prefs.py:131-135`, and the Terminal stays a keyless proxy.
- **Nulls printed, never hidden:** §2.3 exclusions, §2.2 `unavailable`, §4 Q6/Q8/Q10 named as unknown, CSV named as deferred.
- **No LLM-originated signals/scores/escalations; no trading authority.** Export = stored rows; deletion = mechanical.
- **No proprietary Market Ontology code/text/data/assets** reproduced here.
- **Corrections are typed states:** `ok|skipped|failed` per stage; 503+`stage` for partial; never a bare boolean.
- **Verification law** (`terminal/AGENTS.md:42-43`): the *build* packet that implements this owes a fresh incognito end-to-end pass and light+dark+zh crops of the account panel. This records packet owes none — it renders nothing.

## 6. Live proof
**Records only.** No live URL, no render, no deployment, no screenshot. The proof of this packet is the merged file plus the §4 readback results appended to it in a later build packet.
