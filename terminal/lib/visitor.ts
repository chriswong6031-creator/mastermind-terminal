// Shared first-party visitor identity for the whole mastermind-x.com family.
//
// mm_aid is an anonymous, httpOnly, 2-year id minted server-side on a visitor's first tracked
// action. In production it is scoped to Domain=.mastermind-x.com so the SAME id is shared across
// the macro dashboard (mastermind-x.com), this Terminal (app.mastermind-x.com), and the admin
// console — the mechanism that stitches one human's journey across subdomains. In dev it stays
// host-scoped (no Domain) so localhost works.
//
// Both write routes (/api/track/search and /api/collect) mint/read through here so the cookie
// attributes (and domain) never drift between them.

import type { NextRequest, NextResponse } from "next/server";

export const ANON_COOKIE = "mm_aid";
const TWO_YEARS = 63_072_000; // seconds

// Codepoint-safe clamp (a lone UTF-16 surrogate breaks a Postgres insert).
const clamp = (s: string, n: number) => (s.length <= n ? s : [...s].slice(0, n).join(""));

/** Parent-domain scope in production; undefined (host-only) in dev. MM_COOKIE_DOMAIN overrides
 *  for the VPS if the apex ever changes. */
export function visitorCookieDomain(): string | undefined {
  const explicit = process.env.MM_COOKIE_DOMAIN?.trim();
  if (explicit) return explicit;
  return process.env.NODE_ENV === "production" ? ".mastermind-x.com" : undefined;
}

/** Read the existing mm_aid (clamped) or mint a fresh uuid. `mint` is true when we minted. */
export function readVisitor(req: NextRequest): { anonId: string; mint: boolean } {
  const raw = req.cookies.get(ANON_COOKIE)?.value;
  const existing = raw ? clamp(raw, 64) : undefined;
  return existing ? { anonId: existing, mint: false } : { anonId: crypto.randomUUID(), mint: true };
}

/** Set the mm_aid cookie on a response (only call when minting). */
export function setVisitorCookie(res: NextResponse, anonId: string): void {
  res.cookies.set(ANON_COOKIE, anonId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    domain: visitorCookieDomain(),
    maxAge: TWO_YEARS,
  });
}
