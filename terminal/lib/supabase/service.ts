import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Service-role Supabase client — server-only, bypasses RLS. Used exclusively for planes the
// anon key must never touch (search_events is deny-all RLS). The key lives in terminal/.env.local
// on the VPS (see HANDOFF.md); it is absent in local guest-mode dev, so callers must handle null
// (routes fall back to the in-memory dev store in lib/searchEvents.ts).
let cached: SupabaseClient | null | undefined;

export function createServiceClient(): SupabaseClient | null {
  if (cached !== undefined) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  // Guest-mode dev uses a stub URL (127.0.0.1:1) — treat it like a missing key.
  if (!url || !key || !/^https:\/\//.test(url)) {
    cached = null;
    return cached;
  }
  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
