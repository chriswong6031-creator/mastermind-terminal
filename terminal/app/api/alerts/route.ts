import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isPaidTier } from "@/lib/entitlement";
import { billingAuth, BILLING_BASE } from "@/app/api/billing/gateway";
import { SUITE_ALERT_EVENTS, validateSuiteCondition, validateSuiteSequence } from "@/lib/suiteAlerts";

async function uid() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

// ── condition allow-list ──────────────────────────────────────────────────────
// Anything not named here is rejected at the door: the engine (ingest/alerts_engine.py)
// and the suite lane (Node) only know these types, so an unknown one is a row that can
// never fire — silent dead weight in the user's list.
const LEGACY_TYPES = new Set(["signal", "regime", "price", "rsi"]);
const OPT_TYPES = new Set([
  "opt_gamma_flip", "opt_wall_touch", "opt_premium_burst", "opt_0dte_spike", "opt_surface_pocket",
]);
const SUITE_TYPE = "suite_event";
const SUITE_SEQ_TYPE = "suite_sequence"; // two-step "A then B within N bars" (same suite lane)

const MAX_ALERTS_PER_USER = 50;

/** Owning tier of a catalog event; unknown event → "pro" so an unlisted event fails CLOSED. */
function eventTier(suite: unknown, event: unknown): "free" | "insider" | "pro" {
  const hit = SUITE_ALERT_EVENTS.find((e) => e.suite === suite && e.event === event);
  if (!hit) return "pro";
  return hit.tier === "free" || hit.tier === "insider" ? hit.tier : "pro";
}

/**
 * Pro-ONLY gate. lib/entitlement.ts exposes isPaidTier() (any paid tier) but no tier reader;
 * its doc comment says a pro-only surface must gate on `tier === "pro"`, so this reads the SAME
 * authority (macro-api /api/me via the billing gateway) with the same FAIL-CLOSED rule —
 * no session / non-2xx / throw → false. See the report note: fold into entitlement.ts as
 * isProTier() once that file is free.
 */
async function isProTier(): Promise<boolean> {
  const auth = await billingAuth();
  if (!auth) return false;
  try {
    const r = await fetch(`${BILLING_BASE}/api/me`, {
      headers: { Authorization: `Bearer ${auth.token}`, Accept: "application/json" },
      cache: "no-store",
    });
    if (!r.ok) return false;
    const d = await r.json();
    return d?.tier === "pro";
  } catch {
    return false;
  }
}

export async function GET() {
  const { supabase, user } = await uid();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { data } = await supabase.from("alerts").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
  return NextResponse.json({ alerts: data || [] });
}

export async function POST(req: Request) {
  const { supabase, user } = await uid();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { symbol?: unknown; condition?: unknown };
  const symbol = body.symbol;
  const condition = body.condition as Record<string, unknown> | undefined;
  if (!symbol || typeof symbol !== "string" || !condition || typeof condition !== "object")
    return NextResponse.json({ error: "bad request" }, { status: 400 });

  const type = condition.type;
  if (typeof type !== "string" || (!LEGACY_TYPES.has(type) && !OPT_TYPES.has(type) && type !== SUITE_TYPE && type !== SUITE_SEQ_TYPE))
    return NextResponse.json({ error: `Unknown alert condition: ${String(type)}` }, { status: 400 });

  if (type === SUITE_TYPE || type === SUITE_SEQ_TYPE) {
    // validators: reason string when malformed, null when well-formed.
    const why = type === SUITE_TYPE ? validateSuiteCondition(condition) : validateSuiteSequence(condition);
    if (why) return NextResponse.json({ error: `Invalid suite alert: ${why}` }, { status: 400 });
    // Gate tier: the single event's tier, or for a sequence the HIGHEST tier across its
    // step events — a sequence is entitled only when every step is. eventTier fails
    // CLOSED ("pro") on any unknown event, and the validator already vetted the steps.
    let tier: "free" | "insider" | "pro";
    if (type === SUITE_TYPE) {
      tier = eventTier(condition.suite, condition.event);
    } else {
      const rank = { free: 0, insider: 1, pro: 2 } as const;
      const steps = Array.isArray(condition.steps) ? (condition.steps as Array<{ event?: unknown }>) : [];
      tier = steps.length ? "free" : "pro"; // empty steps cannot pass validation — fail closed anyway
      for (const s of steps) {
        const st = eventTier(condition.suite, s?.event);
        if (rank[st] > rank[tier]) tier = st;
      }
    }
    if (tier !== "free") {
      // FAIL-CLOSED: uncertainty about entitlement is a refusal, never a grant.
      if (!(await isPaidTier()))
        return NextResponse.json({ error: "This suite alert is included with a paid plan — upgrade to unlock." }, { status: 403 });
      if (tier === "pro" && !(await isProTier()))
        return NextResponse.json({ error: "This suite alert is included with the Pro plan — upgrade to unlock." }, { status: 403 });
    }
  }

  // Per-user cap — a runaway client (or a bored user) must not turn the 5-min cron into a crawl.
  const { count } = await supabase.from("alerts").select("id", { count: "exact", head: true }).eq("user_id", user.id);
  if ((count ?? 0) >= MAX_ALERTS_PER_USER)
    return NextResponse.json({ error: `Alert limit reached (${MAX_ALERTS_PER_USER}). Delete one to add another.` }, { status: 400 });

  const { data, error } = await supabase.from("alerts").insert({ user_id: user.id, symbol, condition }).select("*").single();
  if (error) {
    console.error("alerts POST failed:", error);
    return NextResponse.json({ error: "Could not create alert" }, { status: 400 });
  }
  return NextResponse.json({ alert: data });
}

// Re-arm a fired alert: the engine (ingest/alerts_engine.py) disarms on trigger and stamps
// condition.triggered; re-arming strips the stamp and flips active back on.
export async function PATCH(req: Request) {
  const { supabase, user } = await uid();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { id } = await req.json().catch(() => ({}));
  if (!id) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const { data: row } = await supabase.from("alerts").select("*").eq("id", id).eq("user_id", user.id).single();
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  const cond = { ...(row.condition || {}) };
  delete cond.triggered;
  const { data, error } = await supabase.from("alerts").update({ active: true, condition: cond })
    .eq("id", id).eq("user_id", user.id).select("*").single();
  if (error) {
    console.error("alerts PATCH failed:", error);
    return NextResponse.json({ error: "Could not update alert" }, { status: 400 });
  }
  return NextResponse.json({ alert: data });
}

export async function DELETE(req: Request) {
  const { supabase, user } = await uid();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (id) await supabase.from("alerts").delete().eq("user_id", user.id).eq("id", id);
  return NextResponse.json({ ok: true });
}
