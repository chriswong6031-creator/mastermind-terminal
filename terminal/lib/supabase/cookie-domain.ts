// Share the Supabase auth session across every *.mastermind-x.com app — the
// macro dashboard (www / apex), this Terminal (app.mastermind-x.com) and the
// bot (bot.mastermind-x.com) — by scoping the session cookie to the parent
// domain. Host-only (returns undefined) on localhost / Vercel previews / any
// other host, so local dev and preview deploys keep working unchanged.
//
// Pairs with the dashboard's @supabase/ssr-compatible cookie (same project,
// same cookie name + format), so one login is recognized on all three.
export function cookieDomainFor(host?: string | null): string | undefined {
  const h = (host || "").split(":")[0].toLowerCase();
  return /(^|\.)mastermind-x\.com$/.test(h) ? ".mastermind-x.com" : undefined;
}
