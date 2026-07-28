import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  applyAuthResponseHeaders,
  applySupabaseResponseCookies,
  authCookieOptions,
} from "@/lib/supabase/cookies";

const PROTECTED = [
  "/terminal",
  "/analysis",
  "/discover",
  "/options",
  "/scripts",
  "/alerts",
  "/portfolio",
  "/admin",
  "/flow",
  "/heatmap",
  "/screener",
];

function redirectWithAuthState(url: URL, source: NextResponse) {
  const redirect = NextResponse.redirect(url);
  const getSetCookie = (
    source.headers as Headers & { getSetCookie?: () => string[] }
  ).getSetCookie;
  const setCookies = getSetCookie?.call(source.headers) ?? [];
  setCookies.forEach((cookie) => redirect.headers.append("Set-Cookie", cookie));
  applyAuthResponseHeaders(redirect.headers);
  return redirect;
}

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
      cookieOptions: authCookieOptions(),
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          applySupabaseResponseCookies(response.headers, cookiesToSet, headers);
        },
      },
    },
  );

  // getClaims verifies the JWT signature/expiry locally and only goes to Auth
  // when a refresh is actually due. A transient Auth API hiccup must not turn
  // every ordinary page navigation into an apparent sign-out.
  const { data, error } = await supabase.auth.getClaims();
  const signedIn = !error && typeof data?.claims?.sub === "string";

  // Every auth-aware origin response is private. In particular, never allow a
  // CDN to replay a previously cached /login redirect to a signed-in user.
  applyAuthResponseHeaders(response.headers);

  // protect the app area; bounce unauthenticated users to /login
  if (!signedIn && PROTECTED.some((p) => path.startsWith(p))) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return redirectWithAuthState(url, response);
  }
  // bounce signed-in users away from / and /login
  if (signedIn && (path === "/login" || path === "/")) {
    const url = request.nextUrl.clone();
    url.pathname = "/terminal";
    return redirectWithAuthState(url, response);
  }
  return response;
}
