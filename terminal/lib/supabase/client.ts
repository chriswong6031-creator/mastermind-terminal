import { createBrowserClient } from "@supabase/ssr";
import {
  authCookieOptions,
  browserAuthCookies,
} from "@/lib/supabase/cookies";

// Browser-side Supabase client (uses the public anon key — safe to ship).
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: authCookieOptions(),
      cookies: browserAuthCookies,
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: "pkce",
      },
    },
  );
}
