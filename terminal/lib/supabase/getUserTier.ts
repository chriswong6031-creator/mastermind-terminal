import { createClient } from "@/lib/supabase/server";

/**
 * Single server-side source of truth for tier gating.
 *
 *   loggedIn — a valid Supabase session (server-VERIFIED via getUser()).
 *   isPro    — profiles.is_pro, the paid bit (supabase/migrations/0001_init.sql).
 *
 * Mirrors the inline pattern in app/api/scripts/save/route.ts so the tier source
 * lives in one place. Uses getUser() (not getSession()) on purpose: a paid gate
 * must verify the token against Supabase, never trust an unverified client cookie.
 */
export async function getUserTier(): Promise<{
  loggedIn: boolean;
  isPro: boolean;
  userId: string | null;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { loggedIn: false, isPro: false, userId: null };
  const { data: prof } = await supabase
    .from("profiles")
    .select("is_pro")
    .eq("id", user.id)
    .single();
  return { loggedIn: true, isPro: !!prof?.is_pro, userId: user.id };
}
