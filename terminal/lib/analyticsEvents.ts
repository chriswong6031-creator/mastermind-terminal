// analyticsEvents.ts — storage plane for first-party, site-wide analytics.
//
// Sibling of searchEvents.ts: same dual-backend shape (Supabase service-role `analytics_events`
// in prod; an in-memory ring in local guest-mode dev). The write paths are this app's
// /api/collect (app.mastermind-x.com) and the macro site's FastAPI /api/collect
// (mastermind-x.com) — both insert into the same deny-all-RLS table (0004_analytics.sql). Reads
// happen out-of-process in the admin console via the Supabase Management API, so this module is
// write-only here.

import { createServiceClient } from "@/lib/supabase/service";

export interface AnalyticsEventInput {
  type: string;
  site: string;
  path: string | null;
  ref: string | null;
  ticker: string | null;
  dwell_ms: number | null;
  scroll: number | null;
  fp: string | null;
  session_id: string | null;
  visitor_id: string | null;
  user_id: string | null;
  ip: string | null;
  ua: string | null;
  client_ts: string | null;
  meta: Record<string, unknown> | null;
}

// ---------- dev fallback (memory ring) ----------
const DEV_MAX = 5000;
const devRows: (AnalyticsEventInput & { id: number; created_at: string })[] = [];
let devId = 0;
let warned = false;

function devWarnOnce() {
  if (!warned) {
    warned = true;
    console.warn("[analyticsEvents] SUPABASE_SERVICE_ROLE_KEY absent — events held in memory only (dev mode)");
  }
}

// ---------- write ----------
/** Batch-insert analytics events. Best-effort: never throws into the request path. */
export async function recordEvents(rows: AnalyticsEventInput[]): Promise<void> {
  if (!rows.length) return;
  const supabase = createServiceClient();
  if (!supabase) {
    devWarnOnce();
    const now = new Date().toISOString();
    for (const r of rows) devRows.push({ ...r, id: ++devId, created_at: now });
    if (devRows.length > DEV_MAX) devRows.splice(0, devRows.length - DEV_MAX);
    return;
  }
  const { error } = await supabase.from("analytics_events").insert(rows);
  if (error) console.error("[analyticsEvents] insert failed:", error.message);
}

/** Test/introspection hook: the in-memory dev rows (empty in prod). */
export function __devRows() {
  return devRows;
}
