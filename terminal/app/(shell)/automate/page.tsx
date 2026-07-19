import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { PROPRIETARY_SCRIPT } from "@/lib/pine";
import AutomateWorkspace from "@/components/workspaces/AutomateWorkspace";

// Automate workspace (Wave-2 IA) — set-and-forget. Serves /automate under the
// (shell) route group; shared chrome from app/(shell)/layout.tsx. Composes the
// ex-/alerts Alerts view and the ex-/scripts Pine editor under one WorkspaceTabs
// sub-nav (?tab=, default alerts).
//
// Scripts is Pro-gated on SAVE (server-side in /api/scripts/save via profiles.is_pro)
// but readable/runnable for everyone — so this page still hands PineEditor the full
// list: the locked proprietary flagship (viewable, never editable) prepended to the
// signed-in user's saved_scripts. Guests get just the flagship (their own scripts
// live in localStorage and are merged client-side by the editor). is_pro is read the
// same way the save route + admin gate read profiles. auth reads cookies → auto-dynamic.

export const metadata: Metadata = { title: "Automate · Mastermind Terminal" };

type Script = { id: string; name: string; source: string; lang: string; params: Record<string, any>; updated_at: string; locked?: boolean };

export default async function AutomatePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let isPro = false;
  let saved: Script[] = [];
  if (user) {
    const { data: prof } = await supabase.from("profiles").select("is_pro").eq("id", user.id).single();
    isPro = !!prof?.is_pro;
    const { data } = await supabase
      .from("saved_scripts")
      .select("id,name,source,lang,params,updated_at")
      .order("updated_at", { ascending: false });
    saved = (data as Script[] | null) || [];
  }

  // Locked flagship first (viewable/runnable, non-editable), then the user's scripts.
  const scripts: Script[] = [PROPRIETARY_SCRIPT as Script, ...saved];

  return <AutomateWorkspace email={user?.email || ""} isPro={isPro} scripts={scripts} />;
}
