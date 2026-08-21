import AdminView from "@/components/AdminView";
import { isAdminRequest } from "@/lib/adminGate";
import { notFound, redirect } from "next/navigation";

// Moved under the (shell) route group in Wave-2; URL stays /admin (route groups
// don't affect the path). Admin is off-nav (direct URL only) but now gains the
// shared shell from app/(shell)/layout.tsx — AdminView renders content-only.
//
// Owner plane. isAdminRequest reads cookies → auto-dynamic, never cached.
// Non-admin gets a 404 (don't advertise the route exists); logged-out gets login.
//
// `unavailable` is deliberately NOT folded into either of those. Sending an admin to /login
// during a Supabase blip invites them to re-authenticate against the same broken authority, and
// `notFound()` tells them their console does not exist. Rendering the shell instead lets the
// client's own retry path own the outage — it will get a 503 from the API and say so.
export default async function AdminPage() {
  const verdict = await isAdminRequest();
  if (verdict.status === "anonymous") redirect("/login");
  if (verdict.status === "denied") notFound();
  return <AdminView email={verdict.email ?? ""} authorityUnavailable={verdict.status === "unavailable"} />;
}
