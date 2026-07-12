import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { rateLimit, tooMany } from "@/lib/rateLimit";

// Neural Web display feeds (macro repo → mastermind-x.com/neuralwebdata/). The producer
// serves static JSON with no CORS header, so the browser can't fetch it cross-origin from
// app.mastermind-x.com — this route proxies it same-origin. Display-only context: the
// Terminal never ranks, gates, or scores features off these feeds.
const NW_BASE = process.env.NW_DATA_BASE || "https://mastermind-x.com/neuralwebdata";
const PLANE_FIXTURE_FILE = path.join(process.cwd(), "public", "data", "nw_plane_fixture.json");

const FEEDS: Record<string, string> = {
  market_plane: "market_plane.json",
};

// In-memory cache so concurrent renders share one upstream fetch. The producer publishes
// with max-age=300; matching that keeps this box at ~1 upstream hit / 5 min per feed.
type CacheEntry = { data: Record<string, unknown>; ts: number };
const CACHE: Record<string, CacheEntry> = {};
const TTL_MS = 300_000;

async function fetchFeed(file: string): Promise<Record<string, unknown>> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4_000);
  try {
    const res = await fetch(`${NW_BASE}/${file}`, {
      signal: ctrl.signal,
      headers: { "User-Agent": "mastermind-terminal/1.0" },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as Record<string, unknown>;
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(req: Request): Promise<Response> {
  const rl = rateLimit(req, { name: "nw" });
  if (!rl.ok) return tooMany(rl);
  const url = new URL(req.url);
  const f = url.searchParams.get("f") ?? "market_plane";
  const file = FEEDS[f];
  if (!file) {
    return NextResponse.json({ error: "bad f param" }, { status: 400 });
  }

  // Dev fixture mode: serve the checked-in sample without touching the upstream.
  if (process.env.NW_FIXTURE === "1") {
    try {
      const raw = await fs.readFile(PLANE_FIXTURE_FILE, "utf8");
      return NextResponse.json(JSON.parse(raw) as Record<string, unknown>, {
        headers: { "Cache-Control": "no-store", "X-NW-Source": "fixture" },
      });
    } catch {
      return NextResponse.json({ error: "fixture unavailable" }, { status: 503 });
    }
  }

  const now = Date.now();
  const cached = CACHE[f];
  if (cached && now - cached.ts < TTL_MS) {
    return NextResponse.json(cached.data, { headers: { "Cache-Control": "no-store" } });
  }

  try {
    const data = await fetchFeed(file);
    CACHE[f] = { data, ts: now };
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch {
    if (cached) {
      // Upstream hiccup: serve the last good copy flagged stale so the strip greys out.
      return NextResponse.json({ ...cached.data, stale: true }, {
        headers: { "Cache-Control": "no-store" },
      });
    }
    // Feed absent (e.g. producer not yet deployed) — the strip renders nothing on 503.
    return NextResponse.json({ error: "feed unavailable" }, {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
