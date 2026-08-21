// searchEvents.ts — storage plane for universal ticker-search tracking.
//
// Two backends behind one interface:
//   - Supabase `search_events` via the service-role client (production; deny-all RLS table,
//     see supabase/migrations/0003_search_events.sql).
//   - An in-memory ring buffer when the service key is absent (local guest-mode dev). Same
//     module-level-state pattern as lib/rateLimit.ts: `next start` is a single node process.
//
// Both the write path (/api/track/search) and the admin read path (/api/admin/searches) go
// through this module so dev and prod exercise identical filter/aggregate logic.

import { createServiceClient } from "@/lib/supabase/service";

export interface SearchEvent {
  id: number;
  created_at: string; // ISO timestamptz
  symbol: string;
  query: string | null;
  source: string;
  user_id: string | null;
  anon_id: string | null;
  ip: string | null;
  ua: string | null;
}

export type SearchEventInput = Omit<SearchEvent, "id" | "created_at">;

export interface ListFilters {
  limit: number; // caller caps
  beforeId?: number; // cursor: return rows with id < beforeId (newest-first pages)
  symbol?: string; // exact match, uppercased
  source?: string;
  visitor?: string; // matches user_id OR anon_id OR ip exactly
}

export interface SearchStats {
  total: number;
  today: number; // since UTC midnight
  visitors7d: number; // distinct (user_id || anon_id || ip) over trailing 7 days
  topSymbols7d: { symbol: string; count: number }[]; // top 20
  perDay14d: { day: string; count: number }[]; // UTC days, oldest first, zero-filled
}

// ── Read contracts: a read that did not land is NOT an empty result ────────────────────────────
// Both readers used to log their error and return `[]` / zeroed stats, so a Supabase outage was
// indistinguishable from "nobody has searched yet" — the admin console rendered "No searches
// logged yet." and a `0` KPI row over an unread table. Callers now get a discriminated result and
// decide, the same shape `lib/layouts.ts` and `lib/portfolio.ts` use.
//
// Events and stats are answered SEPARATELY on purpose: they are two independent reads, and a
// failed aggregate must not take the usable log down with it.
export type EventsResult =
  | { ok: true; events: SearchEvent[] }
  | { ok: false; error: string };

export type StatsResult =
  | { ok: true; stats: SearchStats }
  | { ok: false; error: string };

// ---------- dev fallback (memory ring) ----------
const DEV_MAX = 2000;
const devRows: SearchEvent[] = [];
let devId = 0;
let warned = false;

function devWarnOnce() {
  if (!warned) {
    warned = true;
    console.warn("[searchEvents] SUPABASE_SERVICE_ROLE_KEY absent — events held in memory only (dev mode)");
  }
}

const visitorKey = (e: Pick<SearchEvent, "user_id" | "anon_id" | "ip">) =>
  e.user_id || e.anon_id || e.ip || "unknown";

// ---------- write ----------
export async function recordSearchEvent(evt: SearchEventInput): Promise<void> {
  const supabase = createServiceClient();
  if (!supabase) {
    devWarnOnce();
    devRows.push({ ...evt, id: ++devId, created_at: new Date().toISOString() });
    if (devRows.length > DEV_MAX) devRows.splice(0, devRows.length - DEV_MAX);
    return;
  }
  const { error } = await supabase.from("search_events").insert(evt);
  if (error) console.error("[searchEvents] insert failed:", error.message);
}

// ---------- read (admin) ----------
export async function listSearchEvents(f: ListFilters): Promise<EventsResult> {
  const supabase = createServiceClient();
  if (!supabase) {
    devWarnOnce();
    let rows = [...devRows].reverse(); // newest first
    if (f.beforeId != null) rows = rows.filter((r) => r.id < f.beforeId!);
    if (f.symbol) rows = rows.filter((r) => r.symbol === f.symbol);
    if (f.source) rows = rows.filter((r) => r.source === f.source);
    if (f.visitor) rows = rows.filter((r) => r.user_id === f.visitor || r.anon_id === f.visitor || r.ip === f.visitor);
    return { ok: true, events: rows.slice(0, f.limit) };
  }
  let q = supabase.from("search_events").select("*").order("id", { ascending: false }).limit(f.limit);
  if (f.beforeId != null) q = q.lt("id", f.beforeId);
  if (f.symbol) q = q.eq("symbol", f.symbol);
  if (f.source) q = q.eq("source", f.source);
  if (f.visitor) {
    // Strip PostgREST or() syntax chars, and only compare against the uuid-typed user_id
    // when the value IS a uuid — a bare IP/anon string there is a Postgres cast error.
    const v = f.visitor.replace(/[,()]/g, "");
    const parts = [`anon_id.eq.${v}`, `ip.eq.${v}`];
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) {
      parts.unshift(`user_id.eq.${v}`);
    }
    q = q.or(parts.join(","));
  }
  const { data, error } = await q;
  if (error) {
    console.error("[searchEvents] list failed:", error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true, events: (data || []) as SearchEvent[] };
}

// Resolve user_ids → emails for the admin table. GoTrue admin lookups, memoised for the
// process lifetime (auth.users emails are effectively immutable here).
const emailCache = new Map<string, string | null>();

export async function resolveUserEmails(ids: string[]): Promise<Record<string, string>> {
  const supabase = createServiceClient();
  const out: Record<string, string> = {};
  if (!supabase) return out;
  const distinct = [...new Set(ids)].filter(Boolean);
  await Promise.all(
    distinct.map(async (id) => {
      if (!emailCache.has(id)) {
        try {
          const { data } = await supabase.auth.admin.getUserById(id);
          // Only cache a definitive answer. A transient GoTrue failure must NOT be memoised as
          // "no email" for the process lifetime — leave it uncached so the next page retries.
          if (data?.user) emailCache.set(id, data.user.email ?? null);
        } catch { /* transient — do not cache */ }
      }
      const email = emailCache.get(id);
      if (email) out[id] = email;
    }),
  );
  return out;
}

// Aggregates over the trailing window. Volume here is human-scale (one row per committed
// search), so a capped 14-day fetch aggregated in JS beats adding RPC surface to the DB.
const STATS_FETCH_CAP = 20_000;

export async function searchStats(): Promise<StatsResult> {
  const supabase = createServiceClient();
  const since14 = new Date(Date.now() - 14 * 86_400_000).toISOString();

  let total = 0;
  let recent: Pick<SearchEvent, "created_at" | "symbol" | "user_id" | "anon_id" | "ip">[];

  if (!supabase) {
    devWarnOnce();
    total = devRows.length;
    recent = devRows.filter((r) => r.created_at >= since14);
  } else {
    const [countRes, windowRes] = await Promise.all([
      supabase.from("search_events").select("*", { count: "exact", head: true }),
      supabase
        .from("search_events")
        .select("created_at,symbol,user_id,anon_id,ip")
        .gte("created_at", since14)
        .order("id", { ascending: false })
        .limit(STATS_FETCH_CAP),
    ]);
    // BOTH queries are load-bearing and BOTH can fail independently. The count error used to be
    // dropped on the floor entirely (`{ count }` destructured without `error`), so a failed count
    // rendered as a confident `0` in the "Total searches" KPI.
    const failure = countRes.error ?? windowRes.error;
    if (failure) {
      console.error("[searchEvents] stats failed:", failure.message);
      return { ok: false, error: failure.message };
    }
    total = countRes.count ?? 0;
    recent = (windowRes.data || []) as typeof recent;
  }

  const now = Date.now();
  const since7 = new Date(now - 7 * 86_400_000).toISOString();
  const todayStart = new Date().toISOString().slice(0, 10); // UTC midnight prefix

  const last7 = recent.filter((r) => r.created_at >= since7);
  const today = recent.filter((r) => r.created_at.slice(0, 10) >= todayStart).length;

  const visitors = new Set(last7.map(visitorKey));

  const symCounts = new Map<string, number>();
  for (const r of last7) symCounts.set(r.symbol, (symCounts.get(r.symbol) || 0) + 1);
  const topSymbols7d = [...symCounts.entries()]
    .map(([symbol, count]) => ({ symbol, count }))
    .sort((a, b) => b.count - a.count || a.symbol.localeCompare(b.symbol))
    .slice(0, 20);

  const dayCounts = new Map<string, number>();
  for (const r of recent) {
    const day = r.created_at.slice(0, 10);
    dayCounts.set(day, (dayCounts.get(day) || 0) + 1);
  }
  const perDay14d: { day: string; count: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const day = new Date(now - i * 86_400_000).toISOString().slice(0, 10);
    perDay14d.push({ day, count: dayCounts.get(day) || 0 });
  }

  return { ok: true, stats: { total, today, visitors7d: visitors.size, topSymbols7d, perDay14d } };
}
