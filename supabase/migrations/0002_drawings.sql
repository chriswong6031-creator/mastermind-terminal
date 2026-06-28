-- Drawings (chart annotations) — owner-scoped, one row per drawing, per symbol.
-- Anchors are stored in DATA space (time + price), not pixels, so they survive zoom/pan/resize.
create table if not exists public.drawings (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  symbol     text not null,
  kind       text not null,                          -- trendline|ray|hline|rect|fib|text|measure
  data       jsonb not null default '{}'::jsonb,     -- {points:[{t,p}], color?, text?, locked?}
  created_at timestamptz not null default now()
);
create index if not exists drawings_user_symbol on public.drawings(user_id, symbol);

alter table public.drawings enable row level security;
drop policy if exists drawings_owner on public.drawings;
create policy drawings_owner on public.drawings
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
