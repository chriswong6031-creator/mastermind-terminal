import { redirect } from "next/navigation";
import LoginFormLegacy from "./LoginFormLegacy";

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
