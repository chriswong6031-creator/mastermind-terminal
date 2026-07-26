-- Mastermind Terminal — lock the profiles.is_pro privilege flag against client self-escalation
--
-- ============================ MUST BE APPLIED TO LIVE SUPABASE ============================
-- Shipping this file alone does NOT protect production. Apply it to the live project via the
-- Supabase SQL editor or `supabase db push`. It defines a function (dollar-quoted body with
-- semicolons), so do NOT push it through the naive Management-API split-on-semicolon query endpoint
-- described in HANDOFF.md section 5 -- that splitter breaks on the function body.
-- =========================================================================================
--
-- Threat: the only profiles policy (0001_init.sql `profiles_self`) is `for all using
-- (id = auth.uid())` -- it scopes by ROW, not by COLUMN. is_pro sits on that row, so absent a
-- column-level restriction any signed-in browser could `update profiles set is_pro = true
-- where id = auth.uid()` with the shipped anon key. (is_pro is a UI hint per terminal/AGENTS.md,
-- the authoritative paid gate is macro-api entitlements -- but it must still not be self-writable.)
--
-- Layer 1 (column grants): ALREADY established by 0003_search_events.sql, which revoked the
-- blanket UPDATE and re-granted only display_name to `authenticated` (covering is_pro + is_admin).
-- They are re-asserted idempotently below so this file is self-contained and drift-resistant.
--
-- Layer 2 (trigger, NEW here): a BEFORE UPDATE trigger that reverts any is_pro change not coming
-- from the service role. This holds regardless of grant configuration -- if a future migration or
-- manual GRANT ever re-widens column privileges, the flag stays locked.
--
-- Note: service-role writes (macro-api / backend, carrying role=service_role in the request JWT)
-- pass. A manual UPDATE from the Supabase SQL editor runs as `postgres` with no request.jwt.claims,
-- so it is treated as non-privileged and reverted -- to change is_pro by hand, use the service-role
-- key, or run `alter table public.profiles disable trigger trg_guard_is_pro` for that one update.
--
-- Idempotent / safe to re-run: create-or-replace function, drop-if-exists trigger, and grants that
-- are no-ops when already in place.

-- ---------- Layer 2: BEFORE UPDATE guard trigger (primary defense) ----------
create or replace function public.guard_profiles_is_pro()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.is_pro is distinct from old.is_pro then
    if coalesce((current_setting('request.jwt.claims', true))::jsonb->>'role', '') <> 'service_role' then
      new.is_pro := old.is_pro;   -- silently ignore non-privileged attempts to change the Pro flag
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_guard_is_pro on public.profiles;
create trigger trg_guard_is_pro before update on public.profiles
  for each row execute function public.guard_profiles_is_pro();

-- ---------- Layer 1: column-scoped UPDATE grants (re-asserted, first set in 0003) ----------
revoke update on public.profiles from anon, authenticated;
grant  update (display_name) on public.profiles to authenticated;
