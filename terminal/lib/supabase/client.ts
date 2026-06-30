import { createBrowserClient } from "@supabase/ssr";
import { cookieDomainFor } from "./cookie-domain";

// Browser-side Supabase client (uses the public anon key — safe to ship).
// The session cookie is scoped to .mastermind-x.com so a login here (or on the
// dashboard / bot) is shared across every subdomain.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: {
        domain: cookieDomainFor(
          typeof window !== "undefined" ? window.location.hostname : "",
        ),
      },
    },
  );
}
