import AdminView from "@/components/AdminView";
import { isAdminRequest } from "@/lib/adminGate";
import { notFound, redirect } from "next/navigation";

// Owner plane. isAdminRequest reads cookies → auto-dynamic, never cached.
// Non-admin gets a 404 (don't advertise the route exists); logged-out gets the login page.
export default async function AdminPage() {
  const { admin, email } = await isAdminRequest();
  if (!admin) {
    if (!email) redirect("/login");
    notFound();
  }
  return <AdminView email={email!} />;
}
