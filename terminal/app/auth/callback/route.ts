import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Google OAuth PKCE callback. Supabase's signInWithOAuth redirects the browser here with a
// `?code=` param; we exchange it for a session (which sets the auth cookies) and then 303 to
// the post-auth destination.
//
// The redirect is built from a RELATIVE path only — never from request.url's host. Behind the
// reverse proxy Next normalizes request.url to its internal listen origin (https://localhost:3000),
// so a Location derived from it would point off the real host; a path-relative Location is resolved
// by the browser against the true origin instead (same rationale as app/auth/signout/route.ts).
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  // Sanitize `next`: must be a same-origin absolute PATH ("/…"), never protocol-relative ("//host")
  // which the browser would treat as an off-origin redirect.
  const rawNext = searchParams.get("next");
  const next = rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/terminal";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return new NextResponse(null, { status: 303, headers: { Location: "/login?error=oauth" } });
    }
  }

  return new NextResponse(null, { status: 303, headers: { Location: next } });
}
