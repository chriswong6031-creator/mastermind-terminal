import AdminView from "@/components/AdminView";
import { isAdminRequest } from "@/lib/adminGate";
import { notFound, redirect } from "next/navigation";

// Moved under the (shell) route group in Wave-2; URL stays /admin (route groups
// don't affect the path). Admin is off-nav (direct URL only) but now gains the
// shared shell from app/(shell)/layout.tsx — AdminView renders content-only.
//
// Owner plane. isAdminRequest reads cookies → auto-dynamic, never cached.
// Non-admin gets a 404 (don't advertise the route exists); logged-out gets login.
export default async function AdminPage() {
  const { admin, email } = await isAdminRequest();
  if (!admin) {
    if (!email) redirect("/login");
    notFound();
  }
  return <AdminView email={email!} />;
}
