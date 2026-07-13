-- Mastermind Terminal — universal ticker-search tracking + admin gate
--
-- search_events is an ANALYTICS table, not user-data: rows are written by the server
-- (service-role key) on every committed ticker search, for every visitor — logged-in users
-- (user_id), anonymous browsers (anon_id = first-party mm_aid cookie), and bare IPs.
-- It is read ONLY by the owner through the /admin Search Log section.
--
-- Security posture: RLS is ENABLED with NO policies. The anon key shipped to every browser
-- can neither read nor write a single row; only the service-role key (server-side, never in
-- the bundle) touches the table. The /api/track/search route is the sole write path and the
-- admin-gated /api/admin/searches route is the sole read path.
--
-- Privacy note: rows carry client IPs and user agents. Keep this table out of any public
-- export; prune old rows if retention ever becomes a concern (index on created_at supports it).

-- ---------- admin gate (profiles.is_admin, alongside the existing is_pro gate) ----------
alter table public.profiles add column if not exists is_admin boolean not null default false;

-- CRITICAL: lock the privilege columns against self-writes. The profiles_self RLS policy
-- (0001_init.sql) is `for all using (id = auth.uid())` — it scopes by ROW, not by column, and
-- Postgres/Supabase grant the authenticated role table-level UPDATE by default. Without this,
-- any logged-in user could `update profiles set is_admin = true where id = auth.uid()` with the
-- shipped anon key and unlock the entire /admin search log (visitor IPs, UAs, emails) — and flip
-- is_pro to bypass the paid gate. Replace the blanket UPDATE grant with a column-scoped one so
-- only display_name is user-writable; is_admin/is_pro become service-role-only.
revoke update on public.profiles from anon, authenticated;
grant  update (display_name) on public.profiles to authenticated;

-- Seed the owner account. Guarded: no-op if the auth user doesn't exist yet — in that case
-- flip the flag by hand after first login (or set ADMIN_EMAILS in terminal/.env.local, which
-- the app honours as a fallback gate).
update public.profiles p set is_admin = true
from auth.users u
where p.id = u.id and lower(u.email) = 'longr2512@gmail.com';

-- ---------- search_events ----------
create table if not exists public.search_events (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  symbol     text not null check (char_length(symbol) between 1 and 64),
  query      text          check (char_length(query) <= 128),   -- raw typed text at commit, when available
  source     text not null default '' check (char_length(source) <= 32),  -- e.g. chart-search, gex-desk
  user_id    uuid references auth.users(id) on delete set null, -- logged-in visitor (null for guests)
  anon_id    text          check (char_length(anon_id) <= 64),  -- mm_aid first-party cookie
  ip         text          check (char_length(ip) <= 64),
  ua         text          check (char_length(ua) <= 256)
);

create index if not exists search_events_created on public.search_events (created_at desc);
create index if not exists search_events_symbol  on public.search_events (symbol, created_at desc);
create index if not exists search_events_user    on public.search_events (user_id, created_at desc) where user_id is not null;

-- Deny-all RLS: no policies on purpose (see header). Service role bypasses RLS.
alter table public.search_events enable row level security;
