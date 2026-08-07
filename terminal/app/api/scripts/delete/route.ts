import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Delete one of the signed-in user's saved Pine scripts. Ownership is enforced both by the
// user_id filter here AND by Supabase RLS on saved_scripts (defense in depth), matching the
// auth/ownership pattern used by /api/scripts/save and /api/layouts.
export async function DELETE(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, error: "missing id" }, { status: 400 });

  const { error } = await supabase.from("saved_scripts").delete().eq("id", id).eq("user_id", user.id);
  if (error) {
    console.error("scripts/delete DELETE failed:", error);
    return NextResponse.json({ ok: false, error: "Could not delete script" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
