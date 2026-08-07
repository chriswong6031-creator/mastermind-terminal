import { describe, expect, it } from "vitest";
import {
  AUTH_COOKIE_MAX_AGE,
  applyAuthResponseHeaders,
  applySupabaseResponseCookies,
  hostOnlyRemovalHeader,
} from "@/lib/supabase/cookies";

describe("Supabase auth cookie policy", () => {
  it("keeps sessions for the browser's 400-day persistent-cookie ceiling", () => {
    expect(AUTH_COOKIE_MAX_AGE).toBe(34_560_000);
  });

  it("clears the legacy host-only scope without clearing the parent domain", () => {
    const header = hostOnlyRemovalHeader("sb-project-auth-token", {
      domain: ".mastermind-x.com",
      path: "/",
      sameSite: "lax",
      secure: true,
      maxAge: AUTH_COOKIE_MAX_AGE,
    });

    expect(header).toContain("Max-Age=0");
    expect(header).not.toContain("Domain=");
    expect(header).toContain("Path=/");
  });

  it("writes both cookie scopes and forces auth responses private", () => {
    const headers = new Headers();
    applySupabaseResponseCookies(
      headers,
      [
        {
          name: "sb-project-auth-token",
          value: "base64-session",
          options: {
            domain: ".mastermind-x.com",
            path: "/",
            sameSite: "lax",
            secure: true,
            maxAge: AUTH_COOKIE_MAX_AGE,
          },
        },
      ],
      { "Cache-Control": "private, no-store" },
    );

    const setCookies = (
      headers as Headers & { getSetCookie(): string[] }
    ).getSetCookie();
    expect(setCookies).toHaveLength(2);
    expect(setCookies[0]).toContain("Domain=.mastermind-x.com");
    expect(setCookies[1]).not.toContain("Domain=");
    expect(headers.get("Cache-Control")).toContain("no-store");
    expect(headers.get("Vary")).toBe("Cookie");
  });

  it("preserves existing Vary values when adding Cookie", () => {
    const headers = new Headers({ Vary: "Accept-Encoding" });
    applyAuthResponseHeaders(headers);
    expect(headers.get("Vary")).toBe("Accept-Encoding, Cookie");
  });
});
