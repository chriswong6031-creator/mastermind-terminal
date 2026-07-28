import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  applyAuthResponseHeaders,
  applySupabaseResponseCookies,
  authCookieOptions,
} from "@/lib/supabase/cookies";

// Google OAuth PKCE callback. Supabase's signInWithOAuth redirects the browser here with a
// `?code=` param; we exchange it for a session (which sets the auth cookies) and then 303 to
// the post-auth destination.
//
// The redirect is built from a RELATIVE path only — never from request.url's host. Behind the
// reverse proxy Next normalizes request.url to its internal listen origin (https://localhost:3000),
// so a Location derived from it would point off the real host; a path-relative Location is resolved
// by the browser against the true origin instead (same rationale as app/auth/signout/route.ts).
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  // Sanitize `next`: must be a same-origin absolute PATH ("/…"), never protocol-relative ("//host")
  // which the browser would treat as an off-origin redirect.
  const rawNext = searchParams.get("next");
  const next = rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/terminal";

  const response = new NextResponse(null, {
    status: 303,
    headers: { Location: next },
  });
  applyAuthResponseHeaders(response.headers);

  if (code) {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookieOptions: authCookieOptions(),
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll(cookiesToSet, headers) {
            applySupabaseResponseCookies(
              response.headers,
              cookiesToSet,
              headers,
            );
          },
        },
      },
    );
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      response.headers.set("Location", "/login?error=oauth");
    }
  }

  return response;
}
