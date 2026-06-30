import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function TerminalLayout({ children }: { children: React.ReactNode }) {
  // Only pay for the network-validated auth check when auth is actually enforced.
  // With login disabled (the default), skip the Supabase round-trip entirely — it
  // ran on every Chart-tab visit and gated nothing.
  if (process.env.TERMINAL_REQUIRE_AUTH === "1") {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/login");
  }
  return <>{children}</>;
}
