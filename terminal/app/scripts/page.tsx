import { createClient } from "@/lib/supabase/server";
import PineEditor from "@/components/PineEditor";
import { FLAGSHIP_PINE, SAMPLE_MACD } from "@/lib/pine";

export const dynamic = "force-dynamic";

export default async function ScriptsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: prof } = await supabase.from("profiles").select("is_pro").eq("id", user!.id).single();

  const sel = "id,name,source,lang,params,is_public,updated_at";
  let { data: scripts } = await supabase.from("saved_scripts").select(sel).order("updated_at", { ascending: false });
  if (!scripts || scripts.length === 0) {
    await supabase.from("saved_scripts").insert([
      { user_id: user!.id, name: "Golden Oracle Confluence", lang: "pine", source: FLAGSHIP_PINE, params: { rsiLen: 14, fastLen: 14, slowLen: 60, sigLen: 5, confW: 8 } },
      { user_id: user!.id, name: "MACD", lang: "pine", source: SAMPLE_MACD, params: { fast: 12, slow: 26, signal: 9 } },
    ]);
    ({ data: scripts } = await supabase.from("saved_scripts").select(sel).order("updated_at", { ascending: false }));
  }
  return <PineEditor scripts={(scripts as any) || []} isPro={!!prof?.is_pro} email={user?.email || ""} />;
}
