import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { cookieDomainFor } from "./cookie-domain";

// Server-side Supabase client (RSC / route handlers / server actions).
export async function createClient() {
  const cookieStore = await cookies();
  const host = (await headers()).get("host");
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // share the session cookie across every *.mastermind-x.com subdomain
      cookieOptions: { domain: cookieDomainFor(host) },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component — safe to ignore; middleware refreshes the session.
          }
        },
      },
    },
  );
}
