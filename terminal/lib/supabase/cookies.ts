import { parse, serialize } from "cookie";
import type {
  CookieMethodsBrowser,
  CookieOptions,
  CookieOptionsWithName,
  SetAllCookies,
} from "@supabase/ssr";

/**
 * Supabase sessions are refresh-token sessions, so the browser cookie should
 * outlive the short access-token JWT. Chrome caps persistent cookies at 400
 * days; @supabase/ssr uses the same ceiling.
 */
export const AUTH_COOKIE_MAX_AGE = 400 * 24 * 60 * 60;
export const AUTH_COOKIE_DOMAIN = ".mastermind-x.com";

export function authCookieOptions(): CookieOptionsWithName {
  const domain =
    process.env.NEXT_PUBLIC_MM_AUTH_COOKIE_DOMAIN?.trim() ||
    (process.env.NODE_ENV === "production" ? AUTH_COOKIE_DOMAIN : undefined);

  return {
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: AUTH_COOKIE_MAX_AGE,
    ...(domain ? { domain } : {}),
  };
}

/**
 * When Terminal moves from host-only cookies to the shared parent-domain
 * scope, an old host-only cookie can otherwise shadow the new cookie with the
 * same name. Every browser-side auth write therefore writes the desired scope
 * first, then removes the legacy host-only counterpart.
 */
export const browserAuthCookies: CookieMethodsBrowser = {
  getAll() {
    const parsed = parse(document.cookie);
    return Object.entries(parsed).map(([name, value]) => ({
      name,
      value: value ?? "",
    }));
  },
  setAll(cookiesToSet) {
    cookiesToSet.forEach(({ name, value, options }) => {
      document.cookie = serialize(name, value, options);

      if (options.domain) {
        document.cookie = serialize(
          name,
          "",
          hostOnlyRemovalOptions(options),
        );
      }
    });
  },
};

export function hostOnlyRemovalOptions(options: CookieOptions): CookieOptions {
  const hostOnly = { ...options };
  delete hostOnly.domain;
  return { ...hostOnly, maxAge: 0 };
}

export function hostOnlyRemovalHeader(
  name: string,
  options: CookieOptions,
): string | null {
  if (!options.domain) return null;
  return serialize(name, "", hostOnlyRemovalOptions(options));
}

export function applyAuthResponseHeaders(
  headers: Headers,
  supplied: Record<string, string> = {},
) {
  Object.entries(supplied).forEach(([key, value]) => headers.set(key, value));
  headers.set(
    "Cache-Control",
    "private, no-cache, no-store, must-revalidate, max-age=0",
  );
  headers.set("Expires", "0");
  headers.set("Pragma", "no-cache");

  const vary = headers.get("Vary");
  const values = new Set(
    (vary || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
  values.add("Cookie");
  headers.set("Vary", [...values].join(", "));
}

/**
 * Writes every Supabase Set-Cookie verbatim and also expires the legacy
 * host-only scope. Raw header append is intentional: Next's ResponseCookies
 * map is keyed only by cookie name and would otherwise collapse the two
 * different scopes into one.
 */
export const applySupabaseResponseCookies = (
  headers: Headers,
  cookiesToSet: Parameters<SetAllCookies>[0],
  suppliedHeaders: Record<string, string>,
) => {
  cookiesToSet.forEach(({ name, value, options }) => {
    headers.append("Set-Cookie", serialize(name, value, options));
    const hostOnlyRemoval = hostOnlyRemovalHeader(name, options);
    if (hostOnlyRemoval) headers.append("Set-Cookie", hostOnlyRemoval);
  });
  applyAuthResponseHeaders(headers, suppliedHeaders);
};
