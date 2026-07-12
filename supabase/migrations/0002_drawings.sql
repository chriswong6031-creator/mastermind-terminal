-- Mastermind Terminal — drawings table (hand-drawn chart annotations, per user)
--
-- The `drawings` table was created out-of-band (the API in app/api/drawings/route.ts reads/writes
-- it) but had NO tracked migration and — critically — no guaranteed Row-Level Security. Without RLS
-- the anon key (shipped to every browser) can read/write EVERY user's drawings. This migration makes
-- the table's owner-scoping explicit and idempotent so it matches the rest of the user-data plane
-- (see 0001_init.sql). Safe to run against an existing table: create/enable/policy are all guarded.

create table if not exists public.drawings (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  symbol     text not null,
  kind       text not null,
  data       jsonb not null default '{}'::jsonb,   -- { points, color, text, width, dash, fontSize, meta }
  created_at timestamptz not null default now()
);
create index if not exists drawings_user on public.drawings(user_id);
create index if not exists drawings_user_symbol on public.drawings(user_id, symbol);

-- ====================== Row-Level Security ======================
alter table public.drawings enable row level security;

-- owner-only: a row is visible/writable only to auth.uid() == user_id
drop policy if exists drawings_owner on public.drawings;
create policy drawings_owner on public.drawings
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
