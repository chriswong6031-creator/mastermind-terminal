import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Refreshes the auth session on every request and guards the /terminal area.
export async function updateSession(request: NextRequest) {
  const path = request.nextUrl.pathname;
  // Login is disabled — the whole app is public. Set TERMINAL_REQUIRE_AUTH=1 to re-gate everything.
  const requireAuth = process.env.TERMINAL_REQUIRE_AUTH === "1";

  // Fast path: when auth is off, skip the Supabase getUser() round-trip entirely.
  // All we need is the / → /terminal redirect; everything else passes straight through.
  if (!requireAuth) {
    if (path === "/") {
      const url = request.nextUrl.clone();
      url.pathname = "/terminal";
      return NextResponse.redirect(url);
    }
    return NextResponse.next({ request });
  }

  // Auth is on: create the Supabase client and validate the session cookie.
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Wave-3 IA: chart + the six workspaces (old /research, /automate URLs 308 to these
  // before reaching here). Only enforced when TERMINAL_REQUIRE_AUTH=1.
  const PROTECTED = ["/terminal", "/analysis", "/discover", "/options", "/scripts", "/alerts", "/portfolio"];
  // protect the app area; bounce unauthenticated users to /login
  if (!user && PROTECTED.some((p) => path.startsWith(p))) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  // bounce signed-in users away from / and /login
  if (user && (path === "/login" || path === "/")) {
    const url = request.nextUrl.clone();
    url.pathname = "/terminal";
    return NextResponse.redirect(url);
  }
  return response;
}
