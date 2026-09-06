# F12 — Account data export + deletion lifecycle (records-only spec)

**Packet** B-F12-2 · lane F12 · wave B2 · 2026-09-06 · **Kind: records** (no product code)
**File**: `docs/F12_ACCOUNT_DATA_LIFECYCLE_SPEC_2026-09-06.md` (this file), repo `mastermindx-market-intelligence/mastermind-terminal`, branch `claude/mo-b-b2-b-f12-2`.
*(The commission named `research/…`; this repo's default branch has no `research/` directory — `git ls-tree --name-only origin/master` returns `docs` and no `research`. Per the commission's own fallback, this lands in `docs/`.)*
**Live URL after merge: n/a — records only.** Nothing renders; no nav family is touched; no third header exists to create.
**Ledger rows advanced, NOT closed** (acceptance line 4 is records-only; each row's own `acceptance_test` names a live user action this packet does not perform — see §6): MO-PAID-087 stays PARTIAL (spec + mandatory §4 gate delivered; the ledger's own `next_bounded_child` says DEFER pending Supabase-side verification, which this packet respects by gating §2/§3 behind §4 rather than scoping ahead of it), MO-PAID-086 stays PARTIAL (export spec written; no route exists yet), MO-PAID-078 stays PARTIAL/blocked on 087 (unchanged).

---

## 0. What this document is, and the one thing it is not

It is a build contract. It is **not** a verification of production. In this estate the DDL files are *not* the database: `supabase/migrations/README.md:6-20` records that the `supabase_migrations` schema **does not exist** in project `fsldfzlxyavsuwqbceod` (`select nspname from pg_namespace where nspname='supabase_migrations'` → `[]`; `DSC:TERMINAL-HAS-NO-MIGRATION-LEDGER`), that DDL is applied by hand per-file, and `README.md:51-53` states outright: **"never infer application status from file order. Ask the database."** `0009` was applied two days before `0008` (`README.md:47-48`). So every cascade claim below is **DDL-asserted, production-unverified**, and §4 is a hard gate before §2/§3 are built.

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
| 11 | `portfolio_positions` | T `0007_portfolio_positions.sql:86`; M `templates/uwp_supabase.sql:36-55` | `user_id` (asserted) | **cascade — UNVERIFIED, weakest cell in this table**: the file's own header says the live table predates all committed DDL and was created by hand (`0007_portfolio_positions.sql:10-11` "Against live production the table, RLS and policy statements are NO-OPS"; `:60-64` "NOT ANONYMOUSLY INTROSPECTABLE ... the FK to `auth.users`" is explicitly flagged unconfirmed; corroborated `templates/uwp_supabase.sql:12-14`) | T `0007:104` / M `uwp_supabase.sql:36` (same unverified status) | 4 policies T `0007:111-127` / M `uwp_supabase.sql:40-55` (unverified) | `T terminal/app/api/portfolio/route.ts:60` (GET) |
| 12 | `search_events` | T `0003_search_events.sql:43` | `user_id` | **set null** | `0003:54` | **deny-all, no policies on purpose** `0003:53` | **none** (service-role only) |
| 13 | `analytics_events` | T `0004_analytics.sql:32`; M `scripts/deploy/0004_analytics.sql:17` | `user_id` | **set null** | T `0004:47` / M `0004:29` | **deny-all** T `0004:46` | **none** |
| 14 | `ip_geo` | T `0004_analytics.sql:50`; M `scripts/deploy/0004_analytics.sql:31` | none (`ip` PK) | n/a | T `0004:71` / M `0004:39` | **deny-all** `0004:70` | **none** — not user-scoped, but joins to #13 by `ip` |
| 15 | `user_entitlements` | M `scripts/deploy/0005_user_entitlements.sql:10` | `user_id` (PK) | **cascade** | `0005:26` | select-own `0005:33` | M `app/main.py:1044` `GET /api/account` (derived fields only) |
| 16 | `stripe_events` | M `scripts/deploy/0005_user_entitlements.sql:40` | none | n/a | `0005:45` | deny-all (no policy statement over RLS — comment `0005:37`, RLS enabled `0005:45`) | **none** |
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

*(**"Export route today" = `none`** cells were verified by grepping both repos' route/handler surfaces — `terminal/app/api/**/route.ts` and macro `app/main.py`, `app/billing.py`, `app/mailer.py`, `app/support.py`, `app/marketing_emails.py`, `app/email_segments.py`, `app/unsubscribe.py` — for a GET endpoint that hands an authenticated user their own rows from that table. Several of those tables have service-role writers/ingesters in those same files — e.g. `app/support.py` for #17/18, `app/mailer.py` for #19 — but none has a user-facing read/export path, which is what the column asserts.)*

**Read of that table (corrected — the enumeration is the source of truth; this prose must match it):**
1. **Fifteen tables are cleared when `auth.users` is deleted** — #1,2,4,5,6,7,8,9,11,15,20,23,24 (thirteen rows) cascade *directly* off `auth.users`, plus #3 (`watchlist_symbols`) and #10 (`brain_messages`) are cleared *transitively* because their parent (`watchlists`, `brain_threads`) itself cascades off `auth.users` — together #1-11,15,20,23,24 (15/27 ≈ 56% of the tables in this estate) *if* production FKs match these files, which §4 (Q1 + Q1b below) must prove. #18 (`support_ticket_messages`) is NOT in this group: its parent `support_tickets` uses `set null`, not cascade-delete, so nothing above deletes it — it is handled explicitly in §3.2's non-cascading-store stage instead. (#25 `auth.users.user_metadata` is not a separate row to prove via FK at all — it is a column on the `auth.users` record itself, so it disappears the instant stage 5 deletes that record; no Q1/Q1b proof applies to it, and it is not one of the "fifteen".)
2. **Seven tables/stores do NOT cascade and hold identifiable or re-linkable data after deletion**: `search_events`/`analytics_events` (#12/13) null `user_id` but keep re-linkable `anon_id`/`visitor_id`; `ip_geo` (#14) is never user-scoped and never cascades, but joins to #13 by `ip` — the same identifiable trail by another key; `stripe_events` (#16) has no FK to `auth.users` and is not queryable by `user_id` in our schema, but its payloads carry the Stripe customer/payment identifiers a subject-access request would still need disclosed; `support_tickets` (#17) nulls `user_id` while `support_ticket_messages` (#18) keeps the user's own prose because its parent row is never deleted; `email_log` (#19) keeps `to_email` with no FK at all.
3. **One table must be deliberately RETAINED**: `email_suppression` (#21) is address-keyed to cover people who never registered — deleting it would silently re-subscribe someone who unsubscribed.
4. **Two stores live outside Postgres**: the filesystem quota ledger (#26) and Stripe (#27). Neither is reached by any cascade.
5. **One table holds no user-linkable data at all**: `email_campaigns` (#22) has no FK to any user and is an operator artifact (campaign definitions, not per-user rows) — out of scope for both the export and deletion specs below.

---

## 2. Export spec (advances MO-PAID-086, does not close it)

### 2.1 Where it lives
**Owner: the macro repo (FastAPI), new route `GET /api/account/export`.** The account panel is macro-hosted and loaded on every macro page (`M templates/theme.js:469-480`, `M templates/seo_base.html.j2:505`, `M scripts/build_site.py:5775`); identity/entitlement already lives at `M app/main.py:1044`; the Terminal is explicitly a thin proxy that never holds a secret key (`T terminal/app/api/billing/gateway.ts:5-6,20-21`). Building the export in the Terminal would need a second privileged path — **forbidden by F12 do_not_redo (no second auth/tenant plane, no secret store)**. The Terminal's only possible change is a link to the macro account panel; this packet builds none.

### 2.2 Contract
`GET /api/account/export`, `Authorization: Bearer <supabase access token>` → 200 JSON attachment `mastermind-export-<YYYY-MM-DD>.json`; 401 no/invalid token; 429 one export per 15 min per user; 503 `{error, partial:false}` (never a half bundle silently).

Body v1: `schema:"mm.account_export.v1"`, `generated_at`, `account{user_id,email,email_confirmed,created_at,display_name,prefs}` (`app/main.py:1056-1075`, `lib/user_prefs.py:94`), `plan{tier,status,interval,current_period_end}` (`app/billing.py:643`), `collections{watchlists, watchlist_symbols, chart_layouts, saved_scripts, alerts, favorites, drawings, portfolio_positions, brain_threads, brain_messages, trade_episodes, trade_memory_patterns}`, `counts{<collection>:int}` (present for every collection, 0 included), `not_included[{what,why,how_to_ask}]`, `unavailable[{what,why}]`.

Rows are stored rows, unchanged — no scoring, no derived judgement, no LLM-written summary (A7). `unavailable` is the null-disclosure channel: a failed collection is named there, omitted from `counts`, and the bundle still ships — never a silent drop.

### 2.3 Excluded in v1 (`not_included[{what,why,how_to_ask}]`, EN+ZH, all five entries below)
1. **what** (EN) "Site usage records" / (ZH) "网站使用记录" — covers `search_events`, `analytics_events`, `ip_geo`.
   **why** (EN) "These are tracked by a browser/device identifier, not stored as part of your account profile, so they're handled separately rather than bundled into your account file." / (ZH) "这些记录通过浏览器/设备标识追踪，而非作为账户资料的一部分存储，因此会单独处理，不会归入账户数据文件。"
   **how_to_ask** (EN) "Contact support and name this category; we'll explain what's retained and why." / (ZH) "请联系客服并说明此类别；我们会解释保留了哪些内容及原因。"
2. **what** (EN) "Support messages" / (ZH) "客服工单消息" — covers `support_tickets`, `support_ticket_messages`.
   **why** (EN) "Your support conversations are kept in our helpdesk records, separate from account data." / (ZH) "你的客服对话保存在客服系统记录中，与账户数据分开存放。"
   **how_to_ask** (EN) "Contact support directly — they can pull your ticket history for you." / (ZH) "请直接联系客服，他们可以为你调取工单历史记录。"
3. **what** (EN) "Email delivery records" / (ZH) "邮件发送记录" — covers `email_log`.
   **why** (EN) "This is a record that we sent you an email, not part of your account content." / (ZH) "这只是我们曾向你发送过邮件的记录，不属于账户内容。"
   **how_to_ask** (EN) "Contact support if you need proof a specific email was sent." / (ZH) "如需证明某封邮件已发送，请联系客服。"
4. **what** (EN) "Payment records" / (ZH) "付款记录" — covers Stripe.
   **why** (EN) "Payment records are held by our payment processor, not by us." / (ZH) "付款记录由我们的支付服务商保存，而非我们自己保存。"
   **how_to_ask** (EN) "Find your receipts in the billing portal, or ask support for a copy." / (ZH) "可在账单门户中查看收据，或联系客服索取副本。"
5. **what** (EN) "Download allowance counters" / (ZH) "下载额度计数" — covers the research-vault quota ledger.
   **why** (EN) "This is just a monthly usage count, not account content." / (ZH) "这只是每月使用次数统计，不属于账户内容。"
   **how_to_ask** (EN) "Contact support if you want to know your current count." / (ZH) "如需了解当前计数，请联系客服。"

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

## 3. Deletion spec (advances MO-PAID-087; MO-PAID-078 stays blocked pending 087)

### 3.1 Contract
`POST /api/account/delete`, `Authorization: Bearer <token>`, body `{confirm_email}` → 200 `{ok:true, receipt}`; 400 mismatch; 401 no/invalid token, including a token whose user id no longer exists (round 2 fix — see §3.5 test 9); 409 already in progress; 503 `{ok:false, stage, identity_deleted, receipt(partial)}` — `identity_deleted` is `true` once stage 5 has run, so the client can pick the correct partial-failure copy in §3.4.

### 3.2 Order of operations (load-bearing; round 2 repair below fixes an unreachable-rows defect the round-1 reorder introduced)
0. Verify token→user (`app/main.py:952 require_user`, the same secretless Bearer verification every authed route uses); require a typed `confirm_email` match — this is a new mechanism, no existing typed-confirmation precedent exists anywhere in either repo (grepped both repos for `confirm`; nothing but unrelated prose/comments), so the build packet adds it fresh rather than reusing something that doesn't exist.
1. Offer (never force) the §2 export first; UI requires a checkbox acknowledgement.
2. Cancel live Stripe subscriptions — reuse `app/billing.py:1470 _cancel_subscriptions` — must precede identity deletion or a charge lands on a vanished account.
3. Delete the filesystem quota ledger for `_safe_uid(user_id)` (`engine/research_vault/download_quota.py:61,91`) — outside Postgres.
4. **Capture the identifiers stage 8's purge will need — this MUST run before stage 5, because stage 5's `on delete set null` fires as part of the same statement that deletes the `auth.users` row, and after that the `user_id` link on #12/13/17 is already gone.** `select id from support_tickets where user_id=:uid` (ticket ids, so #18 can be purged by parent id even though its own row was never FK'd to `auth.users`); `select distinct anon_id, visitor_id, ip from search_events where user_id=:uid` and the equivalent for `analytics_events` (the re-linkable trail #12/13 keep once their own `user_id` is nulled). Held only in request-local memory for this call — never persisted, never part of the receipt.
5. `DELETE {SUPABASE_URL}/auth/v1/admin/users/{id}` with the service-role key — the existing admin path (`lib/user_prefs.py:117-123,131-135`). No new secret store, no new auth plane. Cascades tables #1-11,15,20,23,24 *if §4.1/§4.1b confirms it*; also fires the `on delete set null` that clears `user_id` on #12/13/17. **This stage is the point of no return** — every later stage is cleanup/notification, not a chance to abort.
6. Write a receipt keyed by `sha256(user_id+email)` — never the raw identifiers.
7. Return + email the receipt as a transactional class (not suppressed by `email_prefs.marketing_opt_out`, `scripts/deploy/0007_support_email.sql:95-97`). This send inserts an `email_log` row exactly like any other transactional email.
8. Explicit deletes for non-cascading stores, run LAST and on purpose, keyed on the **stage-4 captures** (never on `user_id`, which #12/13/17 no longer carry after stage 5): `support_ticket_messages` by the captured ticket ids, then `support_tickets` by those same ids; **every** `email_log` row matching the user's `to_email` (no FK, so `user_id` was never nulled by stage 5 — this still includes the row stage 7 just wrote, whose job of getting the receipt queued is done by the time this stage runs); `search_events`/`analytics_events` rows matching the captured `anon_id`/`visitor_id` set. Stage 5's cascade does not reach any of these; nothing after stage 8 can re-create them, because stage 8 runs last.
Retained on purpose: `email_suppression`, Stripe's own records, aggregate campaign counters — each disclosed by name in the confirmation copy.

**Why this ordering (round 2 repair for BLOCKER 1):** round 1 moved the explicit purge to run last so it would catch the receipt's own `email_log` write — correct for `email_log`, which has no FK and so is never touched by stage 5's `on delete set null`. But it left `support_tickets`, `search_events` and `analytics_events` looked up "for that user" via `user_id` at the final stage, and those three tables *are* FK'd with `on delete set null` (`scripts/deploy/0007_support_email.sql:32` for `support_tickets`; `0003_search_events.sql:43` and `0004_analytics.sql:32` for the other two) — stage 5's own admin-delete already nulls that column for every one of the user's rows before the final stage ever runs, so "`user_id` = this user" resolves to nothing and the purge silently no-ops. The fix is the new stage 4: capture each row's other identifying keys (ticket id, `anon_id`/`visitor_id`) *before* stage 5 destroys the `user_id` link, and have the final stage delete by those captured keys instead. `email_log`'s own purge is unaffected — it was never nulled, so matching by `to_email` still works exactly as round 1 designed it.

**Because stage 8 purges the very `email_log` row that stage 7's send created (its `_ledger_insert` idem_key claim included), the receipt's own stored record of whether the notification stage already succeeded — not `app/mailer.py:181-192 _ledger_insert`'s idem_key check — is what a resumed/retried run must consult before calling the mailer again: the guard row that would normally stop a duplicate send is gone by design once stage 8 completes.**

**Failure posture:** every stage idempotent/re-runnable; a failure at stage n returns 503 with `stage` + `identity_deleted` + partial receipt. A partially deleted account must never be reported as deleted, and a fully deleted identity must never be reported as still active (see §3.4). Stage 5 is the point of no return; stages 6-8 (receipt, notification, non-cascading purge) still run afterward to complete cleanup and notification even though the account is already gone.

### 3.3 Receipt fields
`request_id`, `subject_digest` (sha256 as above), `requested_at`, `completed_at`, `stages[{name,status:ok|skipped|failed,rows_deleted|null}]`, `retained[{what,why}]`, `export_offered:bool`. **Must be emitted in the K1 `EvidenceRef`/`EvidenceBlock` shape** — the builder maps these fields into that contract rather than inventing a near-miss shape. **Storage (round 2 fix for MAJOR 1):** a new macro table `account_deletion_receipts`, keyed on `request_id` with `subject_digest` indexed, deny-all RLS / service-role-only like every other administrative table in §1 — DDL is out of scope for this records packet, the build packet that implements §3 adds it, but "no new receipt row" (§3.5 test 9) now has a concrete table to assert against.

### 3.4 Plain-language copy (EN / ZH)
Trigger: "Delete my account" / "删除我的账户". Confirm: "This removes your account and the data you created: watchlists, layouts, drawings, alerts, positions, saved scripts and chat threads. It cannot be undone. Download your data first if you want a copy." / "这将删除你的账户以及你创建的数据：自选、布局、画线、提醒、持仓、脚本和对话记录。无法撤销。如需保留副本，请先下载你的数据。" Kept-on-purpose: "We keep two things: a record that this email asked not to receive marketing, and payment records our payment provider must keep by law." / "我们会保留两项：该邮箱不再接收营销邮件的记录，以及支付服务商依法必须保留的付款记录。" Typed confirm label: "Type your email address to confirm" / "请输入你的邮箱以确认". Success: "Your account is deleted." / "你的账户已删除。" plus "We sent a confirmation to <email>." — never "request submitted" when complete, never "deleted" when it isn't.

**Partial failure — two copies, chosen by `identity_deleted` (round 2 fix for BLOCKER 2; the single unconditional copy below was wrong once identity deletion could fail at a later cleanup stage):**
- `identity_deleted:false` (failure at stages 0-4, before the point of no return): "We could not finish. Your account is still active and nothing was lost. Contact support with this reference: <request_id>." / "未能完成。你的账户仍然有效，数据没有丢失。请凭此编号联系客服：<request_id>。"
- `identity_deleted:true` (failure at stages 5-8, after the point of no return): "Your account has been deleted. We're still finishing some cleanup, but there's nothing you need to do. Contact support if you have questions, reference: <request_id>." / "你的账户已删除。我们仍在完成部分清理工作，你无需进行任何操作。如有疑问请联系客服，编号：<request_id>。"
Never show the "still active" copy once `identity_deleted` is true — the account is already gone, and BLOCKER 2 is exactly that inversion.

### 3.5 Deletion — not done unless (macro `tests/test_account_deletion.py`)
1. Cascade proof per table: seeded user with ≥1 row in every §1 row 1-11/15/20/23/24 → after stage 5 (identity deletion), each returns 0 rows for that id, failing per table name.
2. Non-cascading stores explicitly emptied AFTER the full run (stage 8, which runs after the stage-7 receipt send): `support_tickets`/`support_ticket_messages`/`email_log` hold no row for that user/address — including whatever row the stage-7 receipt email itself wrote; `search_events`/`analytics_events` hold no row bearing the captured `anon_id`/`visitor_id` set from stage 4 — the test that would have caught #19's missing FK and #12/13/17's now-nulled `user_id`, both of which the round-1 ordering (querying by `user_id` at the final stage) could never pass.
3. Stage-4 capture actually runs before stage 5, not after: seed a user, run the request up through stage 4, snapshot the captured-identifier set, then null `auth.users`-linked `user_id` on #12/13/17 directly (simulating stage 5's cascade) before stage 8 runs — confirm stage 8 still finds and removes every row using the pre-captured set, proving the capture (not a live `user_id` lookup) is what stage 8 actually uses.
4. Retention intentional and asserted: `email_suppression` for that address still present after deletion, receipt's `retained` names it.
5. Cross-tenant safety: a second seeded user's rows in every table byte-identical before/after.
6. Wrong confirmation deletes nothing: mismatch → 400, zero writes anywhere (row counts, not mock-call counts).
7. Stripe first: injected stage-2 failure → 503 `stage="cancel_subscriptions"`, `identity_deleted:false`, `auth.users` still holds the user (stage numbering unchanged — Stripe cancellation is still stage 2).
8. Post-point-of-no-return failure messaging (BLOCKER 2): injected failure at stage 8 → 503 `stage="purge_noncascading"`, `identity_deleted:true`; the client-facing copy asserted is the "account has been deleted, cleanup still finishing" text, never the "still active" text.
9. Replay after completion is a 401, not a 200 (MAJOR 1): re-run the same request with the same token after a completed deletion → 401, because the token's user id no longer exists (§3.1's ordinary auth contract, not a special replay path) — no additional deletion side effects; no duplicate receipt email, verified via the receipt's own stored record that the notification stage already succeeded (stage 8 has already purged the `email_log` row `_ledger_insert`'s idem_key would otherwise have guarded).
10. Receipt carries no raw identifier: neither email nor user id in any stored field; `subject_digest` reproduces from `sha256(user_id+email)`.

---

## 4. Production readbacks the Meta-CEO must run BEFORE any build (mandatory gate)

Via the Management API with the PAT in `charting-app/.env` (`supabase/migrations/README.md:31-35`; strip `--` comments, use `curl` not python-urllib, `README.md:37-39`). Project ref `fsldfzlxyavsuwqbceod` (`README.md:4`). Every §1 cascade cell is unproven until Q1/Q1b answer.

1. **Q1 (most important):** `select conrelid::regclass as tbl, conname, confdeltype from pg_constraint where confrelid='auth.users'::regclass order by 1;` — compare row-for-row vs §1's *direct* cascades (#1,2,4,5,6,7,8,9,11,15,20,23,24). **Known-expected absences, do not treat as a gate failure:** #3 (`watchlist_symbols`), #10 (`brain_messages`) and #18 (`support_ticket_messages`) FK to a *public* parent (`watchlists`, `brain_threads`, `support_tickets` respectively), never straight to `auth.users`, so Q1 cannot and should not list them — verify them with Q1b instead. Any *other* §1 direct-cascade table absent from Q1 is a real gate failure.
1b. **Q1b (two-level walk, closes the gap Q1 structurally cannot cover):** `select conrelid::regclass as tbl, conname, confdeltype from pg_constraint where confrelid in (select conrelid from pg_constraint where confrelid='auth.users'::regclass and confdeltype='c') order by 1;` — for every parent that Q1 already confirmed cascades, list what cascades off *it*. Expect `watchlist_symbols`→`watchlists` (#3) and `brain_messages`→`brain_threads` (#10) here, proving they ARE cleared when stage 5 runs, transitively. **`support_ticket_messages` (#18) must NOT appear here**, because its parent `support_tickets` (#17) uses `set null`, not cascade, so it is excluded from Q1b's `confdeltype='c'` filter on the parent side — #18 is correctly left to §3.2 stage 8's explicit delete, not to any cascade. If Q1b ever lists #18, the gate fails the other way (the DDL changed and #17 now cascades) and §3.2 stage 8's #18 entry becomes redundant, not wrong.
2. **Q2:** `select table_name from information_schema.tables where table_schema='public' order by 1;` — tables in prod but no file (README:41-53 makes this non-optional).
3. **Q3:** `select relname, relrowsecurity, relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public';` — RLS actually on.
4. **Q4:** `select tablename, policyname, cmd, qual from pg_policies where schemaname='public' order by 1,2;` — confirms deny-all posture of #12/13/17-22 and the `scripts_public_read` exception (#5).
5. **Q5:** the column *names* are already verified (`0007_portfolio_positions.sql:40-43` "VERIFIED PRESENT"); what is genuinely unknown is the FK/PK/NOT NULL/defaults/index, so query those instead: `select conname, contype, confrelid::regclass, confdeltype from pg_constraint where conrelid='public.portfolio_positions'::regclass;` (confirms the row 11 FK-to-`auth.users` claim, currently unverified per `0007_portfolio_positions.sql:60-64` "NOT ANONYMOUSLY INTROSPECTABLE") plus `select column_name, is_nullable, column_default from information_schema.columns where table_schema='public' and table_name='portfolio_positions';` (NOT NULL + defaults).
6. **Q6:** Q1's query restricted to `nspname='auth'` — do `auth.identities`/`sessions`/`refresh_tokens`/`mfa_factors`/`one_time_tokens` cascade? Documented Supabase behaviour, not a fact in our files.
7. **Q7:** `select tgname, tgtype, tgenabled from pg_trigger where tgrelid='auth.users'::regclass and not tgisinternal;` — `0001_init.sql:24-25` installs `on_auth_user_created`; confirm no delete-side trigger.
8. **Q8:** `select id, name, public from storage.buckets;` and, if any, `select count(*) from storage.objects where owner='<test uid>';` — no file in either repo creates a bucket, so whether user files exist is genuinely unknown.
9. **Q9:** `select table_name, privilege_type, grantee from information_schema.role_table_grants where table_schema='public' and grantee in ('anon','authenticated') order by 1;` — confirm `profiles` UPDATE stays narrowed to `display_name` (`0003:27`, `0006:50`).
10. **Q10 (the only proof of hard-vs-soft delete):** create a throwaway user, seed one row per §1 table, snapshot counts — **and, before running the delete, also snapshot the row-level identifiers §3.2 stage 4 will need** (`support_tickets.id`, and `search_events`/`analytics_events`'s `anon_id`/`visitor_id`) — then run `DELETE /auth/v1/admin/users/{id}` and re-snapshot. Record whether the row vanishes from `auth.users` or is merely marked deleted.
11. **Q11 (orphan census after Q10, round 2 fix):** using the identifiers *captured before* Q10's delete — never `user_id`, which the `on delete set null` FKs on #12/13/17 will already have cleared — count rows in `search_events`/`analytics_events`/`support_tickets`/`email_log` still bearing them: the exact size of §3.2 stage 8's explicit-delete job. Querying by `user_id` after the fact would reproduce BLOCKER 1's defect inside the readback plan itself.

**Gate rule:** if Q1/Q1b disagree with §1 for any table (excluding the known-expected #3/#10/#18 absences named above), §3.2 stage 8's explicit-delete list grows and this document is amended before code is written — the builder does not reconcile the difference on the fly.

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
**Records only — the merged path is the proof.** No live URL, no render, no deployment, no screenshot. The proof of this packet is the merged file plus the §4 readback results appended to it in a later build packet.
