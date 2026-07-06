import { createClient } from "@/lib/supabase/server";
import PineEditor from "@/components/PineEditor";
import { SAMPLE_MACD, PROPRIETARY_SCRIPT } from "@/lib/pine";

// dynamic='auto': supabase reads cookies → Next auto-detects dynamic; no need to force it.

export default async function ScriptsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // login disabled — guests get the read-only proprietary flagship only (no DB reads/writes)
  if (!user) {
    return <PineEditor scripts={[PROPRIETARY_SCRIPT] as any} isPro={false} email="" />;
  }

  const { data: prof } = await supabase.from("profiles").select("is_pro").eq("id", user.id).single();

  const sel = "id,name,source,lang,params,is_public,updated_at";
  let { data: scripts } = await supabase.from("saved_scripts").select(sel).order("updated_at", { ascending: false });
  // seed ONE editable example (the proprietary flagship is NOT stored here — it's a locked constant below)
  if (!scripts || scripts.length === 0) {
    await supabase.from("saved_scripts").insert([
      { user_id: user.id, name: "MACD", lang: "pine", source: SAMPLE_MACD, params: { fast: 12, slow: 26, signal: 9 } },
    ]);
    ({ data: scripts } = await supabase.from("saved_scripts").select(sel).order("updated_at", { ascending: false }));
  }
  // the proprietary RM×ST indicator is always first + read-only (users can run it, never edit/delete it)
  const all = [PROPRIETARY_SCRIPT, ...((scripts as any[]) || [])];
  return <PineEditor scripts={all as any} isPro={!!prof?.is_pro} email={user?.email || ""} />;
}
