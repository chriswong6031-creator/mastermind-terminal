import { createClient } from "@/lib/supabase/server";
import ScreenerView from "@/components/ScreenerView";

export const dynamic = "force-dynamic";

export default async function ScreenerPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return <ScreenerView email={user?.email || ""} />;
}
