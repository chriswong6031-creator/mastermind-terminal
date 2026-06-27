import { createClient } from "@/lib/supabase/server";
import AlertsView from "@/components/AlertsView";

export const dynamic = "force-dynamic";

export default async function AlertsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return <AlertsView email={user?.email || ""} />;
}
