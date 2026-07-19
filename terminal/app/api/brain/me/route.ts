// Brain-gateway proxy — GET /api/brain/me. Returns the signed-in user's tier + per-lane
// quotas so the copilot can gate the Deep Research toggle (pro-eligible only), matching the
// dashboard's behavior. All logic lives in the gateway; this only forwards the verified session.
//
// Required env: BRAIN_GATEWAY_URL (default https://mastermind-x.com; VPS co-located http://127.0.0.1:8000)

export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const GATEWAY = process.env.BRAIN_GATEWAY_URL || "https://mastermind-x.com";

export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!session || !user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  try {
    const upstream = await fetch(`${GATEWAY}/api/brain/me`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
      signal: req.signal,
    });
    const data = await upstream.json().catch(() => ({}));
    return NextResponse.json(data, { status: upstream.status });
  } catch (e: any) {
    return NextResponse.json(
      { error: "Gateway unreachable", detail: e?.message },
      { status: 502 },
    );
  }
}
