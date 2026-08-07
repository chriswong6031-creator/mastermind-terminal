import { redirect } from "next/navigation";
import LoginFormLegacy from "./LoginFormLegacy";

// MUST be request-time dynamic: the TERMINAL_REQUIRE_AUTH branch below reads a
// RUNTIME env (set on the systemd service, absent in the build shell). Statically
// prerendered, the redirect() was baked in at build time and /login 307'd even in
// lockdown mode — producing an anon redirect LOOP with the middleware
// (/terminal → /login → /terminal?signin=1 → /login → …), which locked guests
// out of sign-in entirely (found live 2026-07-24).
export const dynamic = "force-dynamic";

// /login now routes into the onboarding sheet — ONE login surface everywhere
// (operator order 2026-07-23: landing, macro gear, Terminal settings and this
// page all open the same flow). Sign-out lands here too, so a signed-out user
// gets the sheet ready to sign back in.
//
// Exception: TERMINAL_REQUIRE_AUTH=1 keeps the legacy full-page form — in that
// mode the auth guard bounces guests to /login, and redirecting back to
// /terminal?signin=1 would loop.
export default function Login() {
  if (process.env.TERMINAL_REQUIRE_AUTH === "1") return <LoginFormLegacy />;
  redirect("/terminal?signin=1");
}
