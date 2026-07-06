import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// List the signed-in user's saved Pine scripts (guests read localStorage client-side, so a guest
// GET simply returns an empty list). Not Pro-gated: reading/experimenting is free (mirrors the
// scripts page, which lets free accounts view scripts — only SAVE is Pro-gated server-side).
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ scripts: [] });
  const { data, error } = await supabase
    .from("saved_scripts")
    .select("id,name,source,lang,params,updated_at")
    .order("updated_at", { ascending: false });
  if (error) return NextResponse.json({ scripts: [], error: error.message }, { status: 400 });
  return NextResponse.json({ scripts: data || [] });
}
