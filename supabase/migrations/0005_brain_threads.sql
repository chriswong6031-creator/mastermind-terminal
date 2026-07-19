-- Mastermind Brain — thread persistence for the AI copilot.
--
-- The Brain gateway (FastAPI, mastermind-x.com/api/brain/*) is the SOLE WRITER to these
-- tables. It uses the Supabase service-role key, which bypasses RLS entirely.
-- The Next.js terminal app and any browser client NEVER write directly — they POST to the
-- gateway and receive thread_id + messages in the SSE response.
--
-- RLS is enabled on both tables. The SELECT-own policies below allow authenticated users to
-- read their own rows (for thread-list and thread-detail endpoints that the gateway proxies
-- back to the client). There are NO insert / update / delete policies for anon or
-- authenticated roles — those operations are exclusively service-role.

-- ---------- brain_threads ----------
create table if not exists public.brain_threads (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  title       text not null default '' check (char_length(title) <= 200),
  lane        text not null default 'fast' check (lane in ('fast', 'pro')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Thread list is always ordered user + recency, and filtered by user_id.
create index if not exists brain_threads_user_updated
  on public.brain_threads (user_id, updated_at desc);

alter table public.brain_threads enable row level security;

-- Users may read only their own threads. Writes (insert/update/delete) go through the
-- service-role key inside the gateway — no policy needed for those operations.
create policy "brain_threads_select_own"
  on public.brain_threads
  for select
  using (auth.uid() = user_id);

-- ---------- brain_messages ----------
create table if not exists public.brain_messages (
  id          bigint generated always as identity primary key,
  thread_id   uuid not null references public.brain_threads(id) on delete cascade,
  role        text not null check (role in ('user', 'assistant')),
  content     text not null,
  meta        jsonb,
  created_at  timestamptz not null default now()
);

-- Per-thread message fetch (ordered by id asc for conversation replay).
create index if not exists brain_messages_thread_id
  on public.brain_messages (thread_id, id);

alter table public.brain_messages enable row level security;

-- Users may read messages only from threads they own.
create policy "brain_messages_select_own"
  on public.brain_messages
  for select
  using (
    exists (
      select 1
      from public.brain_threads t
      where t.id = brain_messages.thread_id
        and t.user_id = auth.uid()
    )
  );
