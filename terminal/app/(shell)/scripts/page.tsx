import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { isPaidTier } from "@/lib/entitlement";
import { PROPRIETARY_SCRIPT } from "@/lib/pine";
import PineEditorMount from "@/components/mounts/PineEditorMount";
import SignupGate from "@/components/gates/SignupGate";

// Scripts (Wave-3 IA) — the Pine editor, split back out of the former Automate page
// into its own /scripts route. Shared chrome from app/(shell)/layout.tsx.
//
// Member surface: signed-out visitors used to get a read-only editor seeded with just
// the flagship; that guest branch is now the sign-up gate (operator order 2026-07-29).
// The chart (/terminal) is what stays open to guests.
//
// For signed-in users: paid-gated on SAVE (server-side in /api/scripts/save via the
// macro-api entitlement) but readable/runnable on any tier — so this page hands
// PineEditor the full list: the locked proprietary flagship (viewable, never editable)
// prepended to the user's saved_scripts. auth reads cookies → auto-dynamic.

export const metadata: Metadata = { title: "Scripts · Mastermind Terminal" };

type Script = { id: string; name: string; source: string; lang: string; params: Record<string, any>; updated_at: string; locked?: boolean };

export default async function ScriptsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return <SignupGate surface="scripts" />;

  const isPro = await isPaidTier();
  const { data } = await supabase
    .from("saved_scripts")
    .select("id,name,source,lang,params,updated_at")
    .order("updated_at", { ascending: false });
  const saved = (data as Script[] | null) || [];

  // Locked flagship first (viewable/runnable, non-editable), then the user's scripts.
  const scripts: Script[] = [PROPRIETARY_SCRIPT as Script, ...saved];

  return <PineEditorMount scripts={scripts} isPro={isPro} email={user.email || ""} />;
}
