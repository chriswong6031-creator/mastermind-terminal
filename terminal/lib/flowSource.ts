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
import { type Bar6, tfMinutes, resample, sessionEpoch } from "@/lib/intradayShared";

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
const SURFACE_DATES_FIXTURE_FILE = path.join(process.cwd(), "public", "data", "surface_dates_fixture.json");

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
  // Multi-day replay (macro #3499): the sessions index + the date-keyed copies of the two
  // keys above. `surface_dates:` is one prefix; the dated reads carry an extra DATE segment,
  // so they are distinct prefixes rather than an overload — `surface_idx_at:` cannot be
  // mistaken for `surface_idx:` (12th char `_` vs `:`) and `surface_at:` never matches
  // `surface:`. Legacy today-paths above are untouched and remain the LIVE read.
  if (f.startsWith("surface_dates:") && f.length > 14) return true;
  if (f.startsWith("surface_idx_at:") && f.split(":").length === 3 && f.length > 15) return true;
  if (f.startsWith("surface_at:") && f.split(":").length === 4 && f.length > 13) return true;
  if (f === "manifest") return true;
  if (f === "flow_idx") return true;
  if (f === "prophet_idx") return true;
  if (f === "prophet_marks") return true;
  if (f === "enrich") return true;
  if (f === "leaders") return true;
  if (f === "radar") return true;
  return false;
}

/**
 * f-param → Python-hub path. Exported for tests: the surface store now has six f-forms
 * (today + dated × index/frame/sessions) whose prefixes differ by one character, and a
 * mis-resolved key fails silently by falling through to R2 and then to null — it would not
 * throw, it would just show an empty field. Pinning the mapping is the only way to catch that.
 */
export function backendPath(f: string): string {
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
  // Dated variants first — the longer prefixes are disjoint from the today-paths, but
  // matching them ahead of the shorter ones keeps that independent of prefix arithmetic.
  if (f.startsWith("surface_dates:")) return `/api/flow/surface/${f.slice(14)}/dates`;
  if (f.startsWith("surface_idx_at:")) {
    const [, root, date] = f.split(":");
    return `/api/flow/surface/${root}/${date}/idx`;
  }
  if (f.startsWith("surface_at:")) {
    const [, root, date, stamp] = f.split(":");
    return `/api/flow/surface/${root}/${date}/${stamp}`;
  }
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

/** f-param → R2 object key. Exported for tests — see backendPath. */
export function r2Key(f: string): string {
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
  // plus the date-keyed copies the poller writes beside them (macro build_flow_surface.py):
  // live_flow/surface/{ROOT}/dates.json, {ROOT}/{DATE}/idx.json, {ROOT}/{DATE}/{STAMP}.json.
  if (f.startsWith("surface_dates:")) return `live_flow/surface/${f.slice(14)}/dates.json`;
  if (f.startsWith("surface_idx_at:")) {
    const [, root, date] = f.split(":");
    return `live_flow/surface/${root}/${date}/idx.json`;
  }
  if (f.startsWith("surface_at:")) {
    const [, root, date, stamp] = f.split(":");
    return `live_flow/surface/${root}/${date}/${stamp}.json`;
  }
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

// ── Surface fixture helpers (multi-day replay) ───────────────────────────────
//
// The fixture family carries ONE canonical full-day session per root. Multi-day replay is
// exercised by serving that same session under each date the sessions fixture lists, RE-DATED
// so every stamp the UI shows describes the requested session. A date the sessions fixture
// does not list is refused (honest empty) — dev must never be able to invent a session that
// production's retention prune would not have.

const emptySurfaceIndex = (): Record<string, unknown> => ({
  date: "", stamps: [], latest: null, cadenceSec: 0, source: "fixture-empty",
});

const emptySurfaceFrame = (): Record<string, unknown> => ({
  spot: null, price_levels: [], time_steps: [], grids: {}, asof: "", cadence: "",
});

const emptySurfaceDates = (root: string): Record<string, unknown> => ({
  root, dates: [], latest: null, count: 0, retain: 0, cadenceSec: 0, cadence: "",
  asof: "", source: "fixture-empty",
});

/** Swap the YYYY-MM-DD prefix of an ISO-ish stamp for `date` (passthrough if it has none). */
function redate(asof: unknown, date: string): string {
  const s = typeof asof === "string" ? asof : "";
  if (!/^\d{4}-\d{2}-\d{2}/.test(s) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return s;
  return date + s.slice(10);
}

/** True when the sessions fixture lists `date` for `root` (missing fixture → false). */
async function fixtureHasSession(root: string, date: string): Promise<boolean> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  try {
    const raw = await fs.readFile(SURFACE_DATES_FIXTURE_FILE, "utf8");
    const all = JSON.parse(raw) as Record<string, { dates?: unknown }>;
    const dates = all[root]?.dates;
    return Array.isArray(dates) && dates.includes(date);
  } catch {
    return false;
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
  // Sessions index (multi-day replay) — keyed by ROOT. Unknown roots return an honest empty
  // list, which the Terminal reads as "no archived sessions" and hides the session picker.
  if (f.startsWith("surface_dates:")) {
    const root = f.slice(14).toUpperCase();
    try {
      const raw = await fs.readFile(SURFACE_DATES_FIXTURE_FILE, "utf8");
      const all = JSON.parse(raw) as Record<string, Record<string, unknown>>;
      return all[root] ?? emptySurfaceDates(root);
    } catch {
      return emptySurfaceDates(root);
    }
  }
  // Surface frame index — keyed by ROOT (today) or by ROOT+DATE (an archived session).
  // Unknown roots — and dates the sessions index doesn't list — return an honest empty
  // index rather than re-serving today's stamps under someone else's date.
  if (f.startsWith("surface_idx:") || f.startsWith("surface_idx_at:")) {
    const dated = f.startsWith("surface_idx_at:");
    const [, rootRaw, dateRaw] = f.split(":");
    const root = (dated ? rootRaw : f.slice(12)).toUpperCase();
    const date = dated ? dateRaw : "";
    if (dated && !(await fixtureHasSession(root, date))) return emptySurfaceIndex();
    try {
      const raw = await fs.readFile(SURFACE_IDX_FIXTURE_FILE, "utf8");
      const all = JSON.parse(raw) as Record<string, Record<string, unknown>>;
      const idx = all[root];
      if (!idx) return emptySurfaceIndex();
      // One canonical fixture session stands in for every retained date: re-date it so the
      // archived index describes the requested session, not the fixture's own.
      return dated ? { ...idx, date, asof: redate(idx.asof, date) } : idx;
    } catch {
      return emptySurfaceIndex();
    }
  }
  // Surface frame for a given stamp — the fixture stores ONE canonical full-day frame per
  // root; we truncate time_steps + each metric grid to the realized-so-far window for the
  // requested stamp (replay = the surface as it existed at that time). Unknown root/stamp →
  // empty frame (honest "no surface data" state), never fabricated. The `surface_at:` form
  // carries an explicit session DATE; it serves the same truncated frame re-dated to that
  // session, and refuses any date the sessions index doesn't list.
  if (f.startsWith("surface:") || f.startsWith("surface_at:")) {
    const dated = f.startsWith("surface_at:");
    const parts = f.split(":");
    const root = (parts[1] ?? "").toUpperCase();
    const date = dated ? parts[2] ?? "" : "";
    const stamp = dated ? parts[3] ?? "" : parts[2] ?? "";
    if (dated && !(await fixtureHasSession(root, date))) return emptySurfaceFrame();
    try {
      const raw = await fs.readFile(SURFACE_FIXTURE_FILE, "utf8");
      const all = JSON.parse(raw) as Record<string, Record<string, unknown>>;
      const full = all[root];
      if (!full) return emptySurfaceFrame();
      const stamps = (full.stamps as string[]) ?? [];
      const times = (full.time_steps as string[]) ?? [];
      const idx = stamps.indexOf(stamp);
      const upto = idx >= 0 ? idx + 1 : times.length; // unknown stamp → full day
      const gridsFull = (full.grids as Record<string, number[][]>) ?? {};
      const grids: Record<string, number[][]> = {};
      for (const [m, g] of Object.entries(gridsFull)) grids[m] = g.map((row) => row.slice(0, upto));
      const spotPath = (full.spot_path as number[] | undefined) ?? null;
      const sessionDate = dated ? date : (full.session_date as string | undefined);
      return {
        spot: spotPath ? spotPath[Math.max(0, upto - 1)] ?? full.spot : full.spot,
        price_levels: full.price_levels,
        time_steps: times.slice(0, upto),
        grids,
        asof: dated ? redate(full.asof, date) : full.asof,
        cadence: full.cadence,
        metrics: full.metrics,
        root,
        session_date: sessionDate,
      } as Record<string, unknown>;
    } catch {
      return emptySurfaceFrame();
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

// ── Fixture intraday candles (DEV ONLY) ──────────────────────────────────────
//
// The Surface pane draws a heat field (surface fixture) AND price candles (/api/intraday). With no
// market-data key and an empty history store, dev showed the field with no candles at all. These
// helpers derive candles from the surface fixture's OWN spot_path so both layers share one
// synthetic price scale.
//
// NEVER let this reach production. The ONLY caller (app/api/intraday/route.ts) gates strictly on
// FLOW_FIXTURE === "1", a dev-only flag. Deliberately NOT a data file: public/data/intraday/ is not
// gitignored and intradayStore.withStoredHistory() reads it UNCONDITIONALLY, so a synthetic bar file
// there would serve fabricated SPY market data to real users.

/**
 * Deterministic [0,1) hash of a bar index — integer math only (Math.imul fmix32), so the wiggle is
 * byte-identical on every run/platform and fixture screenshots don't churn. Never Math.random().
 */
function hash01(i: number): number {
  let x = (i + 1) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 2246822507) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 3266489909) >>> 0;
  x = (x ^ (x >>> 16)) >>> 0;
  return x / 4294967296;
}

/** 2-dp price rounding (named `round2`, not `r2` — this file's `r2Key`/`R2_BASE` mean Cloudflare R2). */
const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * FLOW_FIXTURE-only intraday candles for a surface-fixture root, on the SAME time axis and price
 * scale as the surface heat field.
 *
 * One Bar6 per fixture time step: close = spot_path[i], open = spot_path[i-1] (first bar opens flat),
 * wicks = a deterministic 5–20 bp extension beyond the body. Epochs use `sessionEpoch` — the app's
 * display-epoch convention, the same one `etDisplay` gives real Polygon bars — so these candles sit
 * on exactly the axis production candles would, and line up with the heat field. Bars come back ascending and epoch-unique.
 *
 * `tf` honoured by resampling the 5-min base upward (tfMinutes > 5). Sub-5m timeframes get the 5m
 * series unchanged — the fixture has no finer granularity to synthesize from.
 *
 * Returns null when the root has no surface fixture (or the fixture lacks a usable spot_path), so
 * the caller falls through to the real path instead of inventing a price series.
 */
export async function intradayFixture(sym: string, tf: string): Promise<Bar6[] | null> {
  const root = (sym || "").trim().toUpperCase();
  if (!root) return null;
  let full: Record<string, unknown> | undefined;
  try {
    const raw = await fs.readFile(SURFACE_FIXTURE_FILE, "utf8");
    const all = JSON.parse(raw) as Record<string, Record<string, unknown>>;
    full = all[root];
  } catch {
    return null;
  }
  if (!full) return null;

  const times = Array.isArray(full.time_steps) ? (full.time_steps as string[]) : [];
  const spotPath = Array.isArray(full.spot_path) ? (full.spot_path as number[]) : [];
  const date = typeof full.session_date === "string" ? full.session_date : "";
  const n = Math.min(times.length, spotPath.length);
  if (!date || n === 0) return null;

  const base: Bar6[] = [];
  for (let i = 0; i < n; i++) {
    const hhmm = String(times[i] ?? "");
    const [hh, mm] = hhmm.split(":").map(Number);
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) continue;
    const close = Number(spotPath[i]);
    const open = Number(i > 0 ? spotPath[i - 1] : spotPath[0]);
    if (!Number.isFinite(close) || !Number.isFinite(open)) continue;
    const epoch = sessionEpoch(date, hhmm);
    if (!Number.isFinite(epoch)) continue;
    const jHi = 0.0005 + hash01(2 * i) * 0.0015;      // 5–20 bp
    const jLo = 0.0005 + hash01(2 * i + 1) * 0.0015;
    // clamp after rounding so a 2-dp high can never land inside the body
    const high = Math.max(round2(Math.max(open, close) * (1 + jHi)), open, close);
    const low = Math.min(round2(Math.min(open, close) * (1 - jLo)), open, close);
    const vol = 400_000 + Math.round(hash01(i + 977) * 1_600_000);
    base.push([epoch, round2(open), high, low, round2(close), vol]);
  }
  if (!base.length) return null;

  base.sort((a, b) => a[0] - b[0]);
  const bars: Bar6[] = [];
  let last = -1;
  for (const b of base) { if (b[0] !== last) { bars.push(b); last = b[0]; } } // ascending + unique

  const mins = tfMinutes(tf);
  return mins > 5 ? resample(bars, mins) : bars;
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
