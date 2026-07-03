import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function TerminalLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (process.env.TERMINAL_REQUIRE_AUTH === "1" && !user) redirect("/login");
  return <>{children}</>;
}
