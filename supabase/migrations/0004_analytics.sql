-- Mastermind — first-party, site-wide analytics (page views, navigation, dwell, ticker views)
-- + an IP→geolocation cache. Companion to 0003_search_events.sql (ticker searches).
--
-- analytics_events is the universal event stream written by BOTH first-party collectors:
--   - the Terminal   (app.mastermind-x.com) → /api/collect  (Next.js, service-role client)
--   - the macro site (mastermind-x.com)     → /api/collect  (FastAPI, service-role via PostgREST)
-- Every visitor is measured — logged-in (user_id), anonymous (visitor_id = the shared mm_aid
-- first-party cookie, Domain=.mastermind-x.com), plus a client device fingerprint (fp) and the
-- raw client IP. Together these let the owner resolve one human across changing IPs.
--
-- Security/privacy posture mirrors search_events: RLS ENABLED, NO policies (deny-all). The anon
-- key shipped to browsers can neither read nor write; only the service-role key (server-side)
-- writes, and the owner reads through the admin console's Supabase Management-API SQL path.
-- Rows carry raw IPs + user agents + fingerprints — keep out of any public export. The
-- created_at index supports pruning if retention ever becomes a concern.

-- ---------- analytics_events ----------
create table if not exists public.analytics_events (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),                 -- server receive time (authoritative)
  client_ts   timestamptz,                                         -- client event time (best-effort)
  type        text not null check (char_length(type) <= 32),       -- pageview|route|ticker_view|search|terminal_jump|click|scroll|session_start|heartbeat|exit
  site        text not null default '' check (char_length(site) <= 16),   -- terminal|macro
  path        text          check (char_length(path) <= 512),      -- pathname (+hash on analyzer pages)
  ref         text          check (char_length(ref) <= 512),       -- referrer or previous in-app path
  ticker      text          check (char_length(ticker) <= 64),
  dwell_ms    integer       check (dwell_ms is null or dwell_ms between 0 and 86400000),
  scroll      smallint      check (scroll is null or scroll between 0 and 100),
  fp          text          check (char_length(fp) <= 64),         -- client device fingerprint hash
  session_id  text          check (char_length(session_id) <= 64),
  visitor_id  text          check (char_length(visitor_id) <= 64), -- mm_aid first-party cookie
  user_id     uuid references auth.users(id) on delete set null,   -- logged-in visitor (null for guests)
  ip          text          check (char_length(ip) <= 64),
  ua          text          check (char_length(ua) <= 256),
  meta        jsonb
);

create index if not exists analytics_events_created on public.analytics_events (created_at desc);
create index if not exists analytics_events_visitor on public.analytics_events (visitor_id, created_at desc) where visitor_id is not null;
create index if not exists analytics_events_session on public.analytics_events (session_id, created_at) where session_id is not null;
create index if not exists analytics_events_type    on public.analytics_events (type, created_at desc);
create index if not exists analytics_events_ticker  on public.analytics_events (ticker, created_at desc) where ticker is not null;
create index if not exists analytics_events_site    on public.analytics_events (site, created_at desc);
create index if not exists analytics_events_ip      on public.analytics_events (ip) where ip is not null;

-- Deny-all RLS: no policies on purpose (see header). Service role bypasses RLS.
alter table public.analytics_events enable row level security;

-- ---------- ip_geo (IP → geolocation cache; populated by scripts/geo_enrich.py via IPLocate) ----------
create table if not exists public.ip_geo (
  ip           text primary key check (char_length(ip) <= 64),
  country      text,
  country_code text,
  region       text,           -- subdivision / state / province
  city         text,
  lat          double precision,
  lon          double precision,
  asn          text,           -- e.g. AS15169
  org          text,           -- ASN org / company name
  is_vpn       boolean,
  is_proxy     boolean,
  is_tor       boolean,
  is_hosting   boolean,
  is_abuser    boolean,
  fetched_at   timestamptz not null default now()
);

create index if not exists ip_geo_country on public.ip_geo (country_code);

-- Deny-all RLS (same posture as analytics_events). Only the service role reads/writes it.
alter table public.ip_geo enable row level security;
