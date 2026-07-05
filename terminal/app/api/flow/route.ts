import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

// Upstream base (Python server); falls back to R2 public CDN.
const BACKEND = process.env.FLOW_API_BASE || "http://127.0.0.1:8000";
const R2_BASE = "https://pub-f7ffb4441c5f4ad983ca56ec7c651c61.r2.dev";
const FIXTURE_FILE = path.join(process.cwd(), "public", "data", "flow_fixture.json");

// Bare-minimum in-memory cache so concurrent renders share one fetch.
type CacheEntry = { data: Record<string, unknown>; ts: number };
const CACHE: Record<string, CacheEntry> = {};
const TTL_MS = 30_000;

function r2Key(f: string): string {
  // feed -> live_flow/feed_current.json; meta -> live_flow/meta.json
  if (f === "meta") return "live_flow/meta.json";
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

async function fixtureFor(f: string): Promise<Record<string, unknown>> {
  const raw = await fs.readFile(FIXTURE_FILE, "utf8");
  const all = JSON.parse(raw) as Record<string, Record<string, unknown>>;
  return all[f] ?? {};
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const f = url.searchParams.get("f") ?? "feed";
  if (f !== "feed" && f !== "heat" && f !== "meta") {
    return NextResponse.json({ error: "bad f param" }, { status: 400 });
  }

  // Dev fixture mode: return static fixture data without touching any upstream.
  if (process.env.FLOW_FIXTURE === "1") {
    try {
      const data = await fixtureFor(f);
      return NextResponse.json(data, {
        headers: { "Cache-Control": "no-store", "X-Flow-Source": "fixture" },
      });
    } catch {
      return NextResponse.json({ error: "fixture unavailable" }, { status: 503 });
    }
  }

  const now = Date.now();
  const cached = CACHE[f];
  // Serve from in-memory cache within TTL, but keep fetching async in background.
  // On fresh entry we wait; on stale entry we serve cached + mark stale.

  // Try backend first, fall back to R2 CDN.
  const tryFetch = async (): Promise<Record<string, unknown> | null> => {
    const backendUrl = `${BACKEND}/api/flow/${f}`;
    try {
      return await fetchWithUA(backendUrl);
    } catch {
      // Backend unavailable — try R2 CDN.
      try {
        const r2Url = `${R2_BASE}/${r2Key(f)}`;
        return await fetchWithUA(r2Url);
      } catch {
        return null;
      }
    }
  };

  if (!cached) {
    // First request — must wait.
    const data = await tryFetch();
    if (!data) {
      return NextResponse.json(
        { error: "feed unavailable" },
        { status: 503, headers: { "Cache-Control": "no-store" } }
      );
    }
    CACHE[f] = { data, ts: now };
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  }

  const age = now - cached.ts;
  if (age < TTL_MS) {
    // Fresh cache — return immediately.
    return NextResponse.json(cached.data, { headers: { "Cache-Control": "no-store" } });
  }

  // Stale cache — return last-known with stale flag while re-fetching.
  const stale = { ...cached.data, stale: true };
  // Re-fetch in background (fire-and-forget, no await).
  tryFetch().then((data) => {
    if (data) CACHE[f] = { data, ts: Date.now() };
  });
  return NextResponse.json(stale, { headers: { "Cache-Control": "no-store" } });
}
