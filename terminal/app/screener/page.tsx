import { createClient } from "@/lib/supabase/server";
import ScreenerView from "@/components/ScreenerView";

export const dynamic = "force-dynamic";

export default async function ScreenerPage() {
  const supabase = await createClient();
  // getSession() reads the cookie locally (no Supabase round-trip); we only need the
  // email for display here, and the screener data is public manifest JSON.
  const { data: { session } } = await supabase.auth.getSession();
  return <ScreenerView email={session?.user?.email || ""} />;
}
