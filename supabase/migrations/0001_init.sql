-- Mastermind Terminal — initial schema (Supabase / Postgres)
-- The USER-DATA plane only (watchlists, layouts, saved scripts, alerts, the Free/Pro gate).
-- Market data, signals, regime, and backtests are NOT stored here — they are read from the
-- macro/Mastermind publish-pull side (research doc §5 data-ownership boundary).
--
-- Every table is owner-scoped via RLS: a row is visible/writable only to auth.uid() == user_id.

-- ---------- profiles (1:1 with auth.users; carries the Free/Pro gate) ----------
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  is_pro       boolean not null default false,   -- Pro unlocks custom + proprietary indicators (D3/§8)
  created_at   timestamptz not null default now()
);

-- auto-create a profile when a new auth user signs up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name) values (new.id, new.raw_user_meta_data->>'name')
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- watchlists + symbols (with sections) ----------
create table if not exists public.watchlists (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  position   int  not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists watchlists_user on public.watchlists(user_id);
-- one list name per user (also makes the app's "seed default" idempotent under a race)
create unique index if not exists watchlists_user_name on public.watchlists(user_id, name);

create table if not exists public.watchlist_symbols (
  id           uuid primary key default gen_random_uuid(),
  watchlist_id uuid not null references public.watchlists(id) on delete cascade,
  symbol       text not null,
  section      text,                              -- e.g. 'Crypto', 'Equities'
  position     int  not null default 0,
  created_at   timestamptz not null default now()
);
create index if not exists wls_watchlist on public.watchlist_symbols(watchlist_id);

-- ---------- chart layouts (saved workspaces) ----------
create table if not exists public.chart_layouts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  config     jsonb not null default '{}'::jsonb,  -- panes, indicators, drawings, timeframe favs
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists layouts_user on public.chart_layouts(user_id);

-- ---------- saved Pine-style scripts (the "My Scripts" library; Pro-gated to USE) ----------
create table if not exists public.saved_scripts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  lang       text not null default 'pine',        -- pine | pinets | pynecore | python
  source     text not null default '',
  params     jsonb not null default '{}'::jsonb,
  is_public  boolean not null default false,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists scripts_user on public.saved_scripts(user_id);

-- ---------- alerts ----------
create table if not exists public.alerts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  symbol     text not null,
  condition  jsonb not null default '{}'::jsonb,  -- {type, op, value, indicator_id?}
  active     boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists alerts_user on public.alerts(user_id);

-- ---------- favorites (starred symbols + starred timeframes) ----------
create table if not exists public.favorites (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       text not null default 'symbol',      -- 'symbol' | 'timeframe' | 'indicator'
  value      text not null,
  created_at timestamptz not null default now(),
  unique (user_id, kind, value)
);

-- ====================== Row-Level Security ======================
alter table public.profiles          enable row level security;
alter table public.watchlists        enable row level security;
alter table public.watchlist_symbols enable row level security;
alter table public.chart_layouts     enable row level security;
alter table public.saved_scripts     enable row level security;
alter table public.alerts            enable row level security;
alter table public.favorites         enable row level security;

-- profiles: owner reads/updates own row
drop policy if exists profiles_self on public.profiles;
create policy profiles_self on public.profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

-- generic owner policy for user_id tables
do $$
declare t text;
begin
  foreach t in array array['watchlists','chart_layouts','alerts','favorites'] loop
    execute format('drop policy if exists %1$s_owner on public.%1$s', t);
    execute format(
      'create policy %1$s_owner on public.%1$s for all using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;

-- saved_scripts: owner full access OR anyone may READ a public script
drop policy if exists scripts_owner on public.saved_scripts;
create policy scripts_owner on public.saved_scripts
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists scripts_public_read on public.saved_scripts;
create policy scripts_public_read on public.saved_scripts
  for select using (is_public = true);

-- watchlist_symbols: access gated through the parent watchlist's ownership
drop policy if exists wls_via_parent on public.watchlist_symbols;
create policy wls_via_parent on public.watchlist_symbols
  for all using (exists (select 1 from public.watchlists w where w.id = watchlist_id and w.user_id = auth.uid()))
  with check (exists (select 1 from public.watchlists w where w.id = watchlist_id and w.user_id = auth.uid()));
