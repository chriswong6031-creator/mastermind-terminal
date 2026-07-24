import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { isPaidTier } from "@/lib/entitlement";
import { PROPRIETARY_SCRIPT } from "@/lib/pine";
import PineEditor from "@/components/PineEditor";

// Scripts (Wave-3 IA) — the Pine editor, split back out of the former Automate page
// into its own /scripts route. Shared chrome from app/(shell)/layout.tsx.
//
// Paid-gated on SAVE (server-side in /api/scripts/save via the macro-api entitlement) but
// readable/runnable for everyone — so this page hands PineEditor the full list: the
// locked proprietary flagship (viewable, never editable) prepended to the signed-in
// user's saved_scripts. Guests get just the flagship (their own scripts live in
// localStorage, merged client-side by the editor). auth reads cookies → auto-dynamic.

export const metadata: Metadata = { title: "Scripts · Mastermind Terminal" };

type Script = { id: string; name: string; source: string; lang: string; params: Record<string, any>; updated_at: string; locked?: boolean };

export default async function ScriptsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let isPro = false;
  let saved: Script[] = [];
  if (user) {
    isPro = await isPaidTier();
    const { data } = await supabase
      .from("saved_scripts")
      .select("id,name,source,lang,params,updated_at")
      .order("updated_at", { ascending: false });
    saved = (data as Script[] | null) || [];
  }

  // Locked flagship first (viewable/runnable, non-editable), then the user's scripts.
  const scripts: Script[] = [PROPRIETARY_SCRIPT as Script, ...saved];

  return <PineEditor scripts={scripts} isPro={isPro} email={user?.email || ""} />;
}
