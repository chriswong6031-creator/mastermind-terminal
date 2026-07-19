import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { rateLimit, tooMany } from "@/lib/rateLimit";
// SERVER-ONLY import. The proprietary flow_score_v1 model (weights + curves) lives
// in this module and must never reach the client bundle — see attachFlowScores below
// and SECURITY.md. Do not re-export computeFlowScore to any 'use client' component.
import { computeFlowScore, type ScorerInput } from "@/lib/flowScore";

// Upstream base (Python server); falls back to R2 public CDN. Shared constants — a
// bucket/host rotation edits lib/upstreams.ts once (copilotTools uses the same pair).
import { FLOW_BACKEND as BACKEND, R2_BASE } from "@/lib/upstreams";
const FIXTURE_FILE = path.join(process.cwd(), "public", "data", "flow_fixture.json");
const TIDE_FIXTURE_FILE = path.join(process.cwd(), "public", "data", "tide_fixture.json");
const TICKER_FIXTURE_FILE = path.join(process.cwd(), "public", "data", "ticker_fixture.json");
const DTE_FIXTURE_FILE = path.join(process.cwd(), "public", "data", "dte_fixture.json");
const VOL_FIXTURE_FILE = path.join(process.cwd(), "public", "data", "vol_fixture.json");
const GEX_FIXTURE_FILE = path.join(process.cwd(), "public", "data", "gex_fixture.json");
const SCREENER_FIXTURE_FILE = path.join(process.cwd(), "public", "data", "screener_fixture.json");
const CTX_FIXTURE_FILE = path.join(process.cwd(), "public", "data", "ctx_fixture.json");
const LEADERS_FIXTURE_FILE = path.join(process.cwd(), "public", "data", "flow_leaders_fixture.json");
const LEADER_RADAR_FIXTURE_FILE = path.join(process.cwd(), "public", "data", "leader_radar_fixture.json");
const TCTX_FIXTURE_FILE = path.join(process.cwd(), "public", "data", "tctx_fixture.json");
const OICONF_FIXTURE_FILE = path.join(process.cwd(), "public", "data", "oiconf_fixture.json");
const CHAINHEAT_FIXTURE_FILE = path.join(process.cwd(), "public", "data", "chain_heat_fixture.json");
const GEXSTATE_FIXTURE_FILE = path.join(process.cwd(), "public", "data", "gexstate_fixture.json");
const MATRIX_FIXTURE_FILE = path.join(process.cwd(), "public", "data", "matrix_fixture.json");
const LEVELS_FIXTURE_FILE = path.join(process.cwd(), "public", "data", "levels_fixture.json");
const MANIFEST_FIXTURE_FILE = path.join(process.cwd(), "public", "data", "manifest.json");
const PROPHET_FIXTURE_FILE = path.join(process.cwd(), "public", "data", "prophet_fixture.json");
const PROPHET_MARKS_FIXTURE_FILE = path.join(process.cwd(), "public", "data", "prophet_marks_fixture.json");
const ENRICH_FIXTURE_FILE = path.join(process.cwd(), "public", "data", "enrich_fixture.json");
const FLOW_IDX_FIXTURE_FILE = path.join(process.cwd(), "public", "data", "flow_idx_fixture.json");

// Bare-minimum in-memory cache so concurrent renders share one fetch.
type CacheEntry = { data: Record<string, unknown>; ts: number };
const CACHE: Record<string, CacheEntry> = {};
const TTL_MS = 30_000;

// Inflight dedup: a single background revalidation promise per cache key.
// Without this, N concurrent stale requests each fire a separate upstream fetch.
// The promise resolves/rejects and is cleared from the map in both paths.
const INFLIGHT: Record<string, Promise<Record<string, unknown> | null>> = {};

// Valid f-param values: existing feed|heat|meta, plus new hub params.
// Parameterized sub-types: tide, dte, ticker:{ROOT}, vol:{ROOT}, gex:{ROOT}, oi, hot
type FParam = string;

function isValidF(f: FParam): boolean {
  if (["feed", "heat", "meta", "tide", "dte", "oi", "hot", "ctx", "oiconf", "chainheat"].includes(f)) return true;
  if (f.startsWith("ticker:") && f.length > 7) return true;
  if (f.startsWith("vol:") && f.length > 4) return true;
  if (f.startsWith("gex:") && f.length > 4) return true;
  if (f.startsWith("tctx:") && f.length > 5) return true;
  if (f.startsWith("gexstate:") && f.length > 9) return true;
  if (f.startsWith("matrix:") && f.length > 7) return true;
  if (f.startsWith("levels:") && f.length > 7) return true;
  if (f === "manifest") return true;
  if (f === "flow_idx") return true;
  if (f === "prophet_idx") return true;
  if (f === "prophet_marks") return true;
  if (f === "enrich") return true;
  if (f === "leaders") return true;
  if (f === "radar") return true;
  return false;
}

function backendPath(f: string): string {
  if (f === "tide") return "/api/flow/tide";
  if (f === "dte") return "/api/flow/dte";
  if (f.startsWith("ticker:")) return `/api/flow/ticker/${f.slice(7)}`;
  if (f.startsWith("vol:")) return `/api/hub/vol/${f.slice(4)}`;
  if (f.startsWith("gex:")) return `/api/hub/gex/${f.slice(4)}`;
  if (f === "oi") return "/api/hub/oi";
  if (f === "hot") return "/api/hub/hot";
  if (f === "meta") return "/api/flow/meta";
  if (f === "ctx") return "/api/hub/ctx";
  if (f === "oiconf") return "/api/hub/oiconf";
  if (f.startsWith("tctx:")) return `/api/hub/tctx/${f.slice(5)}`;
  if (f === "chainheat") return "/api/flow/chainheat";
  if (f.startsWith("gexstate:")) return `/api/hub/gexstate/${f.slice(9)}`;
  if (f.startsWith("matrix:")) return `/api/hub/matrix/${f.slice(7)}`;
  if (f.startsWith("levels:")) return `/api/hub/levels/${f.slice(7)}`;
  if (f === "manifest") return "/api/flow/manifest";
  if (f === "flow_idx") return "/api/flow/flow_idx";
  if (f === "prophet_idx") return "/api/hub/prophet";
  if (f === "prophet_marks") return "/api/hub/prophet_marks";
  if (f === "enrich") return "/api/flow/enrich";
  if (f === "leaders") return "/api/flow/leaders";
  if (f === "radar") return "/api/flow/radar";
  return `/api/flow/${f}`;
}

function r2Key(f: string): string {
  if (f === "meta") return "live_flow/meta.json";
  if (f === "tide") return "live_flow/tide_current.json";
  if (f === "dte") return "live_flow/dte_tide_current.json";
  if (f.startsWith("ticker:")) return `live_flow/tickers/${f.slice(7)}.json`;
  if (f.startsWith("vol:")) return `options_hub/vol/${f.slice(4)}.json`;
  if (f.startsWith("gex:")) return `options_hub/gex/${f.slice(4)}.json`;
  if (f === "oi") return "options_hub/oi_movers.json";
  if (f === "hot") return "options_hub/hot_contracts.json";
  if (f === "ctx") return "options_hub/context.json";
  if (f === "oiconf") return "options_hub/oi_confirmed.json";
  if (f.startsWith("tctx:")) return `options_hub/tickers_ctx/${f.slice(5)}.json`;
  if (f === "chainheat") return "live_flow/chain_heat_current.json";
  if (f.startsWith("gexstate:")) return `options_structure/gex_state/${f.slice(9)}.json`;
  if (f.startsWith("matrix:")) return `options_structure/matrix/${f.slice(7)}.json`;
  if (f.startsWith("levels:")) return `levels/${f.slice(7)}.json`;
  if (f === "manifest") return "live_flow/manifest.json";
  if (f === "flow_idx") return "live_flow/flow_idx.json";
  if (f === "prophet_idx") return "prophet/index.json";
  if (f === "prophet_marks") return "live_flow/prophet_marks.json";
  if (f === "enrich") return "live_flow/enrich_current.json";
  if (f === "leaders") return "flowleaders/leaders.json";
  if (f === "radar") return "leaderradar/radar.json";
  return `live_flow/${f}_current.json`;
}

async function fetchWithUA(url: string): Promise<Record<string, unknown>> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 3_000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "mastermind-feed/1.0" },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as Record<string, unknown>;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Attach the proprietary flow_score_v1 result to each event of the main feed
 * payload, SERVER-SIDE, so the browser receives only the computed
 * {score, tier, components:[{key,label,value}]} — never the model weights/curves.
 *
 * `weight` is intentionally dropped from every component: it echoes the raw model
 * weights (0.30/0.20/…) and is not rendered by any client component, so omitting it
 * closes the last weight leak without removing any UI detail.
 *
 * No-op for any f that isn't the main feed — per-ticker / hub payloads carry
 * aggregates (top_contracts, strikes, minutes…), not scorable FlowEvents.
 *
 * Mutates events in place (data is a freshly parsed JSON object). Any single
 * malformed event fails soft to a zero score rather than breaking the whole feed.
 */
function attachFlowScores(f: string, data: Record<string, unknown>): void {
  if (f !== "feed") return;
  const events = (data as { events?: unknown }).events;
  if (!Array.isArray(events)) return;
  for (const ev of events) {
    if (!ev || typeof ev !== "object") continue;
    const rec = ev as Record<string, unknown>;
    try {
      const { score, tier, components } = computeFlowScore(ev as unknown as ScorerInput);
      rec.flowScore = {
        score: Number.isFinite(score) ? score : 0,
        tier,
        components: components.map((c) => ({
          key: c.key,
          label: c.label,
          value: Number.isFinite(c.value) ? c.value : 0,
        })),
      };
    } catch {
      rec.flowScore = { score: 0, tier: "LOW", components: [] };
    }
  }
}

async function fixtureFor(f: string): Promise<Record<string, unknown>> {
  // Tide, DTE, and ticker fixtures live in separate files.
  if (f === "tide") {
    const raw = await fs.readFile(TIDE_FIXTURE_FILE, "utf8");
    return JSON.parse(raw) as Record<string, unknown>;
  }
  if (f === "dte") {
    const raw = await fs.readFile(DTE_FIXTURE_FILE, "utf8");
    return JSON.parse(raw) as Record<string, unknown>;
  }
  if (f.startsWith("ticker:")) {
    const root = f.slice(7);
    const raw = await fs.readFile(TICKER_FIXTURE_FILE, "utf8");
    const all = JSON.parse(raw) as Record<string, Record<string, unknown>>;
    return all[root] ?? all[Object.keys(all)[0]] ?? {};
  }
  // Vol fixtures keyed by root.
  if (f.startsWith("vol:")) {
    const root = f.slice(4).toUpperCase();
    const raw = await fs.readFile(VOL_FIXTURE_FILE, "utf8");
    const all = JSON.parse(raw) as Record<string, Record<string, unknown>>;
    return all[root] ?? all[Object.keys(all)[0]] ?? {};
  }
  // GEX fixtures keyed by root. Unknown roots return {} (empty payload) rather
  // than falling back to SPY — so dev matches prod, where uncovered single names
  // return an empty by_strike and the desk shows its honest "no GEX yet" state.
  if (f.startsWith("gex:")) {
    const root = f.slice(4).toUpperCase();
    const raw = await fs.readFile(GEX_FIXTURE_FILE, "utf8");
    const all = JSON.parse(raw) as Record<string, Record<string, unknown>>;
    return all[root] ?? {};
  }
  // Screener fixtures: "oi" and "hot" are sub-keys in screener_fixture.json.
  if (f === "oi" || f === "hot") {
    const raw = await fs.readFile(SCREENER_FIXTURE_FILE, "utf8");
    const all = JSON.parse(raw) as Record<string, Record<string, unknown>>;
    return all[f] ?? {};
  }
  // Hub context fixture.
  if (f === "ctx") {
    try {
      const raw = await fs.readFile(CTX_FIXTURE_FILE, "utf8");
      return JSON.parse(raw) as Record<string, unknown>;
    } catch { return {}; }
  }
  // OI-confirmed fixture.
  if (f === "oiconf") {
    try {
      const raw = await fs.readFile(OICONF_FIXTURE_FILE, "utf8");
      return JSON.parse(raw) as Record<string, unknown>;
    } catch { return { confirmed: [] }; }
  }
  // Chain Heat fixture.
  if (f === "chainheat") {
    try {
      const raw = await fs.readFile(CHAINHEAT_FIXTURE_FILE, "utf8");
      return JSON.parse(raw) as Record<string, unknown>;
    } catch { return { schema: "options_flow.chain_heat/v1", campaigns: [] }; }
  }
  // Ticker context fixture keyed by root.
  if (f.startsWith("tctx:")) {
    const root = f.slice(5).toUpperCase();
    try {
      const raw = await fs.readFile(TCTX_FIXTURE_FILE, "utf8");
      const all = JSON.parse(raw) as Record<string, Record<string, unknown>>;
      return all[root] ?? all[Object.keys(all)[0]] ?? {};
    } catch { return {}; }
  }
  // GEX state fixture — single-root JSON, root is ignored (fixture is for SPY).
  if (f.startsWith("gexstate:")) {
    try {
      const raw = await fs.readFile(GEXSTATE_FIXTURE_FILE, "utf8");
      return JSON.parse(raw) as Record<string, unknown>;
    } catch { return {}; }
  }
  // Matrix fixture — keyed by root; falls back to SPY if requested root absent.
  if (f.startsWith("matrix:")) {
    const root = f.slice(7).toUpperCase();
    try {
      const raw = await fs.readFile(MATRIX_FIXTURE_FILE, "utf8");
      const all = JSON.parse(raw) as Record<string, Record<string, unknown>>;
      return all[root] ?? all["SPY"] ?? all[Object.keys(all)[0]] ?? {};
    } catch { return {}; }
  }
  // Levels fixture — keyed by root; falls back to SPY if requested root absent.
  if (f.startsWith("levels:")) {
    const root = f.slice(7).toUpperCase();
    try {
      const raw = await fs.readFile(LEVELS_FIXTURE_FILE, "utf8");
      const all = JSON.parse(raw) as Record<string, Record<string, unknown>>;
      return all[root] ?? all["SPY"] ?? all[Object.keys(all)[0]] ?? {};
    } catch { return {}; }
  }
  // Manifest fixture — static public/data/manifest.json (34 names, nightly).
  if (f === "manifest") {
    try {
      const raw = await fs.readFile(MANIFEST_FIXTURE_FILE, "utf8");
      return JSON.parse(raw) as Record<string, unknown>;
    } catch { return { symbols: {}, as_of: "", source: "fixture" }; }
  }
  // Flow index fixture — serve public/data/flow_idx_fixture.json when present so the
  // Heatmap FLOW layer is testable in dev; otherwise degrade gracefully to price-only.
  if (f === "flow_idx") {
    try {
      const raw = await fs.readFile(FLOW_IDX_FIXTURE_FILE, "utf8");
      return JSON.parse(raw) as Record<string, unknown>;
    } catch { return { rows: [], as_of: "", source: "fixture-empty" }; }
  }
  // Prophet index fixture.
  if (f === "prophet_idx") {
    try {
      const raw = await fs.readFile(PROPHET_FIXTURE_FILE, "utf8");
      return JSON.parse(raw) as Record<string, unknown>;
    } catch { return { schema: "prophet.index/v1", asof: "", plans: [] }; }
  }
  // Prophet live-marks fixture.
  if (f === "prophet_marks") {
    try {
      const raw = await fs.readFile(PROPHET_MARKS_FIXTURE_FILE, "utf8");
      return JSON.parse(raw) as Record<string, unknown>;
    } catch { return { schema: "prophet.live_marks/v1", asof_utc: "", session_date: "", marks: {} }; }
  }
  // Leader Radar fixture.
  if (f === "radar") {
    try {
      const raw = await fs.readFile(LEADER_RADAR_FIXTURE_FILE, "utf8");
      return JSON.parse(raw) as Record<string, unknown>;
    } catch { return { schema: "leader_radar.v1", cold_start: true, rows: [], regime: {}, coverage: {} }; }
  }
  // Flow leaders fixture.
  if (f === "leaders") {
    try {
      const raw = await fs.readFile(LEADERS_FIXTURE_FILE, "utf8");
      return JSON.parse(raw) as Record<string, unknown>;
    } catch { return { schema: "flow_leaders.v1", cold_start: true, board_a: [], board_b: [], board_a_total: 0 }; }
  }
  // Flow enrich artifact fixture.
  if (f === "enrich") {
    try {
      const raw = await fs.readFile(ENRICH_FIXTURE_FILE, "utf8");
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {
        schema: "flow.enrich/v1", asof: "", session_date: "",
        thresholds: { elite_q: 66, strong_q: 60, high_q: 55, medium_q: 48 },
        events: {}, confirmed_yesterday: [],
      };
    }
  }
  const raw = await fs.readFile(FIXTURE_FILE, "utf8");
  const all = JSON.parse(raw) as Record<string, Record<string, unknown>>;
  return all[f] ?? {};
}

export async function GET(req: Request): Promise<Response> {
  const rl = rateLimit(req, { name: "flow" });
  if (!rl.ok) return tooMany(rl);
  const url = new URL(req.url);
  const f = url.searchParams.get("f") ?? "feed";
  if (!isValidF(f)) {
    return NextResponse.json({ error: "bad f param" }, { status: 400 });
  }

  // Dev fixture mode: return static fixture data without touching any upstream.
  if (process.env.FLOW_FIXTURE === "1") {
    try {
      const data = await fixtureFor(f);
      attachFlowScores(f, data);
      return NextResponse.json(data, {
        headers: { "Cache-Control": "no-store", "X-Flow-Source": "fixture" },
      });
    } catch {
      return NextResponse.json({ error: "fixture unavailable" }, { status: 503 });
    }
  }

  const now = Date.now();
  const cached = CACHE[f];

  // Try backend first, fall back to R2 CDN.
  const tryFetch = async (): Promise<Record<string, unknown> | null> => {
    // manifest is a LOCAL static file on this box (public/data/manifest.json,
    // refreshed nightly on the VPS) — never an R2 object. Read it directly:
    // zero network hops, and the old backend→R2 chain 503'd in prod.
    if (f === "manifest") {
      try {
        const raw = await fs.readFile(MANIFEST_FIXTURE_FILE, "utf8");
        return JSON.parse(raw) as Record<string, unknown>;
      } catch {
        return null;
      }
    }
    const bUrl = `${BACKEND}${backendPath(f)}`;
    try {
      return await fetchWithUA(bUrl);
    } catch {
      try {
        const r2Url = `${R2_BASE}/${r2Key(f)}`;
        return await fetchWithUA(r2Url);
      } catch {
        // flow_idx has a canonical always-fresh origin: the macro dashboard's
        // deployed site copy. Final fallback so the heatmap flow layer survives
        // a missing/stale R2 mirror.
        if (f === "flow_idx") {
          try {
            return await fetchWithUA(
              "https://chriswong6031-creator.github.io/macro/flow/index.json"
            );
          } catch {
            return null;
          }
        }
        return null;
      }
    }
  };

  if (!cached) {
    const data = await tryFetch();
    if (!data) {
      return NextResponse.json(
        { error: "feed unavailable" },
        { status: 503, headers: { "Cache-Control": "no-store" } }
      );
    }
    // Score once here (before caching) so cache hits reuse the scored payload.
    attachFlowScores(f, data);
    CACHE[f] = { data, ts: now };
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  }

  const age = now - cached.ts;
  if (age < TTL_MS) {
    return NextResponse.json(cached.data, { headers: { "Cache-Control": "no-store" } });
  }

  const stale = { ...cached.data, stale: true };
  // Inflight dedup: only start one background revalidation per cache key.
  // Concurrent stale requests reuse the same promise instead of fanning out N upstream fetches.
  if (!INFLIGHT[f]) {
    INFLIGHT[f] = tryFetch().then(
      (data) => {
        delete INFLIGHT[f];
        if (data) {
          attachFlowScores(f, data);
          CACHE[f] = { data, ts: Date.now() };
        }
        return data;
      },
      () => {
        delete INFLIGHT[f];
        return null;
      }
    );
  }
  return NextResponse.json(stale, { headers: { "Cache-Control": "no-store" } });
}
