import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Refreshes the auth session on every request and guards the /terminal area.
export async function updateSession(request: NextRequest) {
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

  const path = request.nextUrl.pathname;
  // Login is disabled — the whole app is public. Set TERMINAL_REQUIRE_AUTH=1 to re-gate everything.
  const requireAuth = process.env.TERMINAL_REQUIRE_AUTH === "1";
  const PROTECTED = requireAuth
    ? ["/terminal", "/screener", "/scripts", "/portfolio", "/alerts"]
    : [];
  // protect the app area; bounce signed-in users away from /login
  if (!user && PROTECTED.some((p) => path.startsWith(p))) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  // login disabled → skip the sign-in splash and drop every visitor straight into the app
  if (!requireAuth && path === "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/terminal";
    return NextResponse.redirect(url);
  }
  if (user && (path === "/login" || path === "/")) {
    const url = request.nextUrl.clone();
    url.pathname = "/terminal";
    return NextResponse.redirect(url);
  }
  return response;
}
