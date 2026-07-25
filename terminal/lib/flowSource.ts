/**
 * flowSource.ts — shared server-side data path for the flow feed.
 *
 * Extracted from app/api/flow/route.ts so BOTH the polling GET endpoint and the
 * SSE streaming endpoint (app/api/flow/stream) resolve a payload through one code
 * path: fixture in dev (FLOW_FIXTURE=1), else Python backend → R2 CDN fallback, with
 * the proprietary server-side flowScore attached to the main feed.
 *
 * SERVER-ONLY. Imports fs + the server-only flowScore model — never import from a
 * 'use client' component. See SECURITY.md: the flow_score_v1 weights must not reach
 * the client bundle; attachFlowScores strips them before the payload leaves the box.
 */
import { promises as fs } from "fs";
import path from "path";
import { computeFlowScore, type ScorerInput } from "@/lib/flowScore";
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
const MANIFEST_FIXTURE_FILE = path.join(process.cwd(), "public", "data", "manifest.json");
const PROPHET_FIXTURE_FILE = path.join(process.cwd(), "public", "data", "prophet_fixture.json");
const PROPHET_MARKS_FIXTURE_FILE = path.join(process.cwd(), "public", "data", "prophet_marks_fixture.json");
const ENRICH_FIXTURE_FILE = path.join(process.cwd(), "public", "data", "enrich_fixture.json");
const FLOW_IDX_FIXTURE_FILE = path.join(process.cwd(), "public", "data", "flow_idx_fixture.json");
const SURFACE_IDX_FIXTURE_FILE = path.join(process.cwd(), "public", "data", "surface_idx_fixture.json");
const SURFACE_FIXTURE_FILE = path.join(process.cwd(), "public", "data", "surface_fixture.json");

// Valid f-param values: existing feed|heat|meta, plus hub params.
// Parameterized sub-types: tide, dte, ticker:{ROOT}, vol:{ROOT}, gex:{ROOT}, oi, hot
export function isValidF(f: string): boolean {
  if (["feed", "heat", "meta", "tide", "dte", "oi", "hot", "ctx", "oiconf", "chainheat"].includes(f)) return true;
  if (f.startsWith("ticker:") && f.length > 7) return true;
  if (f.startsWith("vol:") && f.length > 4) return true;
  if (f.startsWith("gex:") && f.length > 4) return true;
  if (f.startsWith("tctx:") && f.length > 5) return true;
  if (f.startsWith("gexstate:") && f.length > 9) return true;
  if (f.startsWith("matrix:") && f.length > 7) return true;
  // Surface replay store: surface_idx:{ROOT} (frame index) + surface:{ROOT}:{STAMP} (one frame).
  if (f.startsWith("surface_idx:") && f.length > 12) return true;
  if (f.startsWith("surface:") && f.split(":").length === 3 && f.length > 10) return true;
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
  // Surface store: /api/flow/surface/{ROOT}/idx  and  /api/flow/surface/{ROOT}/{STAMP}
  if (f.startsWith("surface_idx:")) return `/api/flow/surface/${f.slice(12)}/idx`;
  if (f.startsWith("surface:")) {
    const [, root, stamp] = f.split(":");
    return `/api/flow/surface/${root}/${stamp}`;
  }
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
  // Surface store on R2: live_flow/surface/{ROOT}/idx.json + live_flow/surface/{ROOT}/{STAMP}.json
  if (f.startsWith("surface_idx:")) return `live_flow/surface/${f.slice(12)}/idx.json`;
  if (f.startsWith("surface:")) {
    const [, root, stamp] = f.split(":");
    return `live_flow/surface/${root}/${stamp}.json`;
  }
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
 * No-op for any f that isn't the main feed. Mutates events in place; a malformed
 * event fails soft to a zero score rather than breaking the whole feed.
 */
export function attachFlowScores(f: string, data: Record<string, unknown>): void {
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

export async function fixtureFor(f: string): Promise<Record<string, unknown>> {
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
  if (f.startsWith("vol:")) {
    const root = f.slice(4).toUpperCase();
    const raw = await fs.readFile(VOL_FIXTURE_FILE, "utf8");
    const all = JSON.parse(raw) as Record<string, Record<string, unknown>>;
    return all[root] ?? all[Object.keys(all)[0]] ?? {};
  }
  // GEX fixtures keyed by root. Unknown roots return {} (empty payload) rather than
  // falling back to SPY — so dev matches prod's honest "no GEX yet" empty state.
  if (f.startsWith("gex:")) {
    const root = f.slice(4).toUpperCase();
    const raw = await fs.readFile(GEX_FIXTURE_FILE, "utf8");
    const all = JSON.parse(raw) as Record<string, Record<string, unknown>>;
    return all[root] ?? {};
  }
  if (f === "oi" || f === "hot") {
    const raw = await fs.readFile(SCREENER_FIXTURE_FILE, "utf8");
    const all = JSON.parse(raw) as Record<string, Record<string, unknown>>;
    return all[f] ?? {};
  }
  if (f === "ctx") {
    try {
      const raw = await fs.readFile(CTX_FIXTURE_FILE, "utf8");
      return JSON.parse(raw) as Record<string, unknown>;
    } catch { return {}; }
  }
  if (f === "oiconf") {
    try {
      const raw = await fs.readFile(OICONF_FIXTURE_FILE, "utf8");
      return JSON.parse(raw) as Record<string, unknown>;
    } catch { return { confirmed: [] }; }
  }
  if (f === "chainheat") {
    try {
      const raw = await fs.readFile(CHAINHEAT_FIXTURE_FILE, "utf8");
      return JSON.parse(raw) as Record<string, unknown>;
    } catch { return { schema: "options_flow.chain_heat/v1", campaigns: [] }; }
  }
  if (f.startsWith("tctx:")) {
    const root = f.slice(5).toUpperCase();
    try {
      const raw = await fs.readFile(TCTX_FIXTURE_FILE, "utf8");
      const all = JSON.parse(raw) as Record<string, Record<string, unknown>>;
      return all[root] ?? all[Object.keys(all)[0]] ?? {};
    } catch { return {}; }
  }
  if (f.startsWith("gexstate:")) {
    try {
      const raw = await fs.readFile(GEXSTATE_FIXTURE_FILE, "utf8");
      return JSON.parse(raw) as Record<string, unknown>;
    } catch { return {}; }
  }
  if (f.startsWith("matrix:")) {
    const root = f.slice(7).toUpperCase();
    try {
      const raw = await fs.readFile(MATRIX_FIXTURE_FILE, "utf8");
      const all = JSON.parse(raw) as Record<string, Record<string, unknown>>;
      return all[root] ?? all["SPY"] ?? all[Object.keys(all)[0]] ?? {};
    } catch { return {}; }
  }
  if (f === "manifest") {
    try {
      const raw = await fs.readFile(MANIFEST_FIXTURE_FILE, "utf8");
      return JSON.parse(raw) as Record<string, unknown>;
    } catch { return { symbols: {}, as_of: "", source: "fixture" }; }
  }
  if (f === "flow_idx") {
    try {
      const raw = await fs.readFile(FLOW_IDX_FIXTURE_FILE, "utf8");
      return JSON.parse(raw) as Record<string, unknown>;
    } catch { return { rows: [], as_of: "", source: "fixture-empty" }; }
  }
  // Surface frame index — keyed by ROOT. Unknown roots return an honest empty index.
  if (f.startsWith("surface_idx:")) {
    const root = f.slice(12).toUpperCase();
    try {
      const raw = await fs.readFile(SURFACE_IDX_FIXTURE_FILE, "utf8");
      const all = JSON.parse(raw) as Record<string, Record<string, unknown>>;
      return all[root] ?? { date: "", stamps: [], latest: null, cadenceSec: 0, source: "fixture-empty" };
    } catch {
      return { date: "", stamps: [], latest: null, cadenceSec: 0, source: "fixture-empty" };
    }
  }
  // Surface frame for a given stamp — the fixture stores ONE canonical full-day frame per
  // root; we truncate time_steps + each metric grid to the realized-so-far window for the
  // requested stamp (replay = the surface as it existed at that time). Unknown root/stamp →
  // empty frame (honest "no surface data" state), never fabricated.
  if (f.startsWith("surface:")) {
    const [, rootRaw, stamp] = f.split(":");
    const root = (rootRaw ?? "").toUpperCase();
    const empty = { spot: null, price_levels: [], time_steps: [], grids: {}, asof: "", cadence: "" };
    try {
      const raw = await fs.readFile(SURFACE_FIXTURE_FILE, "utf8");
      const all = JSON.parse(raw) as Record<string, Record<string, unknown>>;
      const full = all[root];
      if (!full) return empty;
      const stamps = (full.stamps as string[]) ?? [];
      const times = (full.time_steps as string[]) ?? [];
      const idx = stamps.indexOf(stamp);
      const upto = idx >= 0 ? idx + 1 : times.length; // unknown stamp → full day
      const gridsFull = (full.grids as Record<string, number[][]>) ?? {};
      const grids: Record<string, number[][]> = {};
      for (const [m, g] of Object.entries(gridsFull)) grids[m] = g.map((row) => row.slice(0, upto));
      const spotPath = (full.spot_path as number[] | undefined) ?? null;
      return {
        spot: spotPath ? spotPath[Math.max(0, upto - 1)] ?? full.spot : full.spot,
        price_levels: full.price_levels,
        time_steps: times.slice(0, upto),
        grids,
        asof: full.asof,
        cadence: full.cadence,
        metrics: full.metrics,
        root,
        session_date: full.session_date,
      } as Record<string, unknown>;
    } catch {
      return empty;
    }
  }
  if (f === "prophet_idx") {
    try {
      const raw = await fs.readFile(PROPHET_FIXTURE_FILE, "utf8");
      return JSON.parse(raw) as Record<string, unknown>;
    } catch { return { schema: "prophet.index/v1", asof: "", plans: [] }; }
  }
  if (f === "prophet_marks") {
    try {
      const raw = await fs.readFile(PROPHET_MARKS_FIXTURE_FILE, "utf8");
      return JSON.parse(raw) as Record<string, unknown>;
    } catch { return { schema: "prophet.live_marks/v1", asof_utc: "", session_date: "", marks: {} }; }
  }
  if (f === "radar") {
    try {
      const raw = await fs.readFile(LEADER_RADAR_FIXTURE_FILE, "utf8");
      return JSON.parse(raw) as Record<string, unknown>;
    } catch { return { schema: "leader_radar.v1", cold_start: true, rows: [], regime: {}, coverage: {} }; }
  }
  if (f === "leaders") {
    try {
      const raw = await fs.readFile(LEADERS_FIXTURE_FILE, "utf8");
      return JSON.parse(raw) as Record<string, unknown>;
    } catch { return { schema: "flow_leaders.v1", cold_start: true, board_a: [], board_b: [], board_a_total: 0 }; }
  }
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

/**
 * Fetch a payload from the live upstream: Python backend first, R2 CDN fallback.
 * `manifest` is a local static file on this box; `flow_idx` has a final GitHub-Pages
 * origin. Returns null when every source fails. (No scoring, no cache — callers own that.)
 */
export async function tryFetchUpstream(f: string): Promise<Record<string, unknown> | null> {
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
}

/**
 * Resolve a fresh, scored payload for `f` — fixture in dev, else live upstream.
 * No caching: callers (GET's SWR cache, the SSE poll loop) decide freshness.
 * Returns null when unavailable.
 */
export async function loadFlowFresh(f: string): Promise<Record<string, unknown> | null> {
  if (process.env.FLOW_FIXTURE === "1") {
    try {
      const data = await fixtureFor(f);
      attachFlowScores(f, data);
      return data;
    } catch {
      return null;
    }
  }
  const data = await tryFetchUpstream(f);
  if (data) attachFlowScores(f, data);
  return data;
}
