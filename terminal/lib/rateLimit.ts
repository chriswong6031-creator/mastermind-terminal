// In-memory per-IP fixed-window rate limiter shared by the public read APIs.
//
// This is defence-in-depth at the ORIGIN: `next start` is a single node process, so a
// module-level Map persists across requests (same pattern the snapshot upload route uses).
// It raises the cost of symbol-by-symbol scraping without needing a datastore. The durable
// layer is per-IP rate limiting at the CDN/edge and firewalling the origin so the edge can't
// be bypassed — see SECURITY.md. Treat this as a brake, not a wall.

type Bucket = { count: number; reset: number };

// One bucket-map per limiter name so routes don't share a budget.
const buckets = new Map<string, Map<string, Bucket>>();

function mapFor(name: string): Map<string, Bucket> {
  let m = buckets.get(name);
  if (!m) {
    m = new Map();
    buckets.set(name, m);
  }
  return m;
}

// Best-effort client IP. Behind Caddy/EdgeOne the real visitor is the first X-Forwarded-For hop
// (Caddy is configured with trusted_proxies so it forwards the true client IP). Falls back to a
// single "unknown" bucket, which is acceptable: a proxy that hides the IP just shares one budget.
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

export interface RateOptions {
  /** Distinct budget name (usually the route). */
  name: string;
  windowMs?: number;
  max?: number;
}

export interface RateResult {
  ok: boolean;
  remaining: number;
  retryAfterSec: number;
}

const DEFAULT_WINDOW = 60_000;
// Generous for a human session (the batched watchlist poll is one request every ~6s, ~10/min),
// punishing for a scraper looping the ~8,700-symbol universe one request at a time. Tune per
// deployment with RATE_LIMIT_MAX without a code change.
const DEFAULT_MAX = Number(process.env.RATE_LIMIT_MAX) || 300;

export function rateLimit(req: Request, opts: RateOptions): RateResult {
  const windowMs = opts.windowMs ?? DEFAULT_WINDOW;
  const max = opts.max ?? DEFAULT_MAX;
  const ip = clientIp(req);
  const m = mapFor(opts.name);
  const now = Date.now();

  // Bound memory under a wide IP spread (e.g. a distributed scrape): sweep expired buckets.
  if (m.size > 10_000) {
    for (const [k, v] of m) if (now > v.reset) m.delete(k);
  }

  let b = m.get(ip);
  if (!b || now > b.reset) {
    b = { count: 0, reset: now + windowMs };
    m.set(ip, b);
  }
  if (b.count >= max) {
    return { ok: false, remaining: 0, retryAfterSec: Math.max(1, Math.ceil((b.reset - now) / 1000)) };
  }
  b.count++;
  return { ok: true, remaining: max - b.count, retryAfterSec: 0 };
}

/** Standard 429 response for a tripped limiter. */
export function tooMany(result: RateResult): Response {
  return new Response(JSON.stringify({ error: "rate_limited" }), {
    status: 429,
    headers: {
      "content-type": "application/json",
      "retry-after": String(result.retryAfterSec),
      "cache-control": "no-store",
    },
  });
}
