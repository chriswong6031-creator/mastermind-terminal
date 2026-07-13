import { createClient } from "@/lib/supabase/server";

// Owner gate for the /admin plane (page + APIs).
//
// Admin = any of:
//   1. profiles.is_admin — seeded for the owner in supabase/migrations/0003_search_events.sql;
//   2. email listed in ADMIN_EMAILS (comma-separated, terminal/.env.local) — fallback that
//      works before the migration seed, or for a second owner account;
//   3. dev escape hatch: ADMIN_DEV=1 AND NODE_ENV !== production — local guest-mode preview
//      has no auth server at all, so nothing else can grant access. Never set on the VPS.
export async function isAdminRequest(): Promise<{ admin: boolean; email: string | null }> {
  // Require a POSITIVE dev signal (=== "development"), not merely "not production": a stray
  // process launched without NODE_ENV pinned (custom node server, PM2) must NOT satisfy this.
  if (process.env.NODE_ENV === "development" && process.env.ADMIN_DEV === "1") {
    return { admin: true, email: "dev@local" };
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { admin: false, email: null };

  const email = user.email?.toLowerCase() ?? null;
  const allow = (process.env.ADMIN_EMAILS || "")
    .toLowerCase()
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (email && allow.includes(email)) return { admin: true, email };

  // RLS profiles_self lets a user read their own row with the cookie-auth'd client.
  const { data } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single();
  return { admin: !!data?.is_admin, email };
}
