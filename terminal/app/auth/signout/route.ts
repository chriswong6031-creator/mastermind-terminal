import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  // Path-relative Location (not NextResponse.redirect): behind the reverse proxy Next
  // normalizes request.url to its internal listen origin (https://localhost:3000), and the
  // CSP form-action 'self' then blocks that cross-origin redirect after the form POST —
  // the browser resolves a relative Location against the real host instead.
  return new NextResponse(null, { status: 303, headers: { Location: "/login" } });
}
