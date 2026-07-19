import type { NextConfig } from "next";
import path from "path";

const isProd = process.env.NODE_ENV === "production";

// ── Deployment id (version-skew protection / stale-chunk self-heal) ───────────
// Each build gets a DISTINCT id: prefer the git sha wired in by scripts/deploy_terminal.sh
// (GIT_SHA / NEXT_DEPLOYMENT_ID), else fall back to the build timestamp so a local `next build`
// still stamps a unique id. Next appends `?dpl=<id>` to every static asset URL and injects
// `data-dpl-id` on <html> + an `x-nextjs-deployment-id` response header — so a client holding a
// stale /flow shell (served inside its SWR window after a deploy) detects the mismatch and does a
// full reload instead of resolving lazy chunks against purged content-hashed factories. This is the
// deterministic half of the options-crash fix (the chunk-retention union in deploy_terminal.sh is
// the belt-and-suspenders half). Keep the id stable ACROSS the containers of a single deploy.
const DEPLOYMENT_ID =
  process.env.GIT_SHA || process.env.NEXT_DEPLOYMENT_ID || `t${Date.now()}`;

// ── Content-Security-Policy ───────────────────────────────────────────────────
// Derived from an audit of every external resource the BROWSER actually reaches:
//   - inline bootstrap script (app/layout.tsx LOCALE_INIT) + Next App Router streaming
//     inject inline <script> → script-src needs 'unsafe-inline' (a nonce migration is the
//     follow-up hardening; documented in SECURITY.md).
//   - React inline style attributes → style-src 'unsafe-inline'.
//   - shared chart-snapshot <img> served from Cloudflare R2 (app/x/[slug]) → img-src *.r2.dev.
//   - Supabase auth (REST + realtime WS) → connect-src. (The former browser→Polygon trades WS was
//     removed 2026-07-19: any NEXT_PUBLIC_* key is world-readable and a dev sub is not a
//     redistribution license — live data now flows server-mediated only, so wss://socket.polygon.io
//     is no longer in connect-src.)
//   - CN/HK quote hosts are fetched SERVER-side today, but are allowed in connect-src as a safe
//     superset so a client fallback path can't silently break live quotes.
// frame-ancestors 'self' + X-Frame-Options block competitors from iframing/rehosting the UI.
// In dev, Turbopack HMR needs 'unsafe-eval'; production stays strict.
const scriptSrc = ["'self'", "'unsafe-inline'", ...(isProd ? [] : ["'unsafe-eval'"])].join(" ");
const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "form-action 'self'",
  `script-src ${scriptSrc}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.r2.dev",
  "font-src 'self'",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://qt.gtimg.cn https://web.ifzq.gtimg.cn https://ifzq.gtimg.cn",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  ...(isProd ? ["upgrade-insecure-requests"] : []),
].join("; ");

// Applied to every app response (Caddy reverse_proxies to `next start` and passes these through).
// NOTE: /data/* is served DIRECTLY by Caddy file_server in production, so it is NOT covered here —
// its CORP/nosniff headers live in the Caddyfile (app/deploy/Caddyfile, macro repo).
const securityHeaders = [
  { key: "Content-Security-Policy", value: CSP },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  // Distinct-per-build id → version-skew protection + stale-chunk self-heal (see DEPLOYMENT_ID above).
  deploymentId: DEPLOYMENT_ID,
  // pin the workspace root (sibling lockfiles exist) so Turbopack stops warning
  turbopack: { root: path.resolve(__dirname) },
  // Never ship client source maps to the browser (this is Next's default; pinned here as a
  // guardrail so proprietary chart/indicator/Pine logic can't be trivially de-minified).
  productionBrowserSourceMaps: false,
  // tsc --noEmit is clean as of 2026-07-11, so builds enforce types again — the
  // 2026-07-07 `typescript.ignoreBuildErrors` escape hatch (FinPage union nits)
  // is removed; CI (.github/workflows/ci.yml) also gates PRs on tsc + vitest.
  // Note: `eslint` key was removed in Next.js 16 — ESLint is no longer built-in.
  // ── Wave-2 IA redirect contract (permanent 308) ────────────────────────────
  // The old single-purpose route dirs (screener/heatmap/alerts/scripts/flow) were
  // deleted; the five-workspace URLs now own those destinations. Redirects are
  // checked before the filesystem, and Next passes through any request query that
  // the destination doesn't already set — so `/heatmap?v=2` → `/discover?tab=heatmap&v=2`
  // and the default `/flow?tab=gex` → `/research?tab=gex` both keep working without
  // enumerating every tab. Bookmarks, the macro dashboard's cross-links and the
  // ?v=2 cache-busted heatmap link all survive.
  async redirects() {
    return [
      { source: "/screener", destination: "/discover?tab=screener", permanent: true },
      { source: "/heatmap", destination: "/discover?tab=heatmap", permanent: true },
      { source: "/alerts", destination: "/automate?tab=alerts", permanent: true },
      { source: "/scripts", destination: "/automate?tab=scripts", permanent: true },
      // The two ex-flow Discover tabs move to /discover; matched by query so only
      // these specific tabs peel off. Ordered BEFORE the catch-all /flow below.
      {
        source: "/flow",
        has: [{ type: "query", key: "tab", value: "leaders" }],
        destination: "/discover?tab=leaders",
        permanent: true,
      },
      {
        source: "/flow",
        has: [{ type: "query", key: "tab", value: "radar" }],
        destination: "/discover?tab=radar",
        permanent: true,
      },
      // Every other /flow (incl. no tab, and tape/desk/tide/tickers/vol/gex/prism/
      // prophet/fundamentals) → Research; the ?tab= value passes through untouched.
      { source: "/flow", destination: "/research", permanent: true },
    ];
  },
  async headers() {
    return [
      // Security headers on every route (framing, CSP, sniffing, referrer, HSTS).
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      // Cache static market-data JSON served from /data/* for 5 min, stale for 1 hour.
      {
        source: "/data/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=300, stale-while-revalidate=3600",
          },
        ],
      },
      // Statically-prerendered HTML would otherwise ship Next's s-maxage=31536000, which the
      // EdgeOne CDN pins for a year (a deploy then can't refresh these shells without a manual
      // console purge — no purge creds exist on the VPS/Mac). Cap edge caching at 5 minutes.
      {
        source: "/",
        headers: [
          {
            key: "Cache-Control",
            value: "public, s-maxage=300, stale-while-revalidate=600",
          },
        ],
      },
      {
        // Wave-2 IA: the workspace shells replace screener/alerts/flow — they need the same
        // 5-minute edge cap or EdgeOne pins their prerendered HTML for a year (the exact
        // stale-shell class behind the Wave-1 module-factory crash).
        source: "/(discover|research|automate|portfolio|login)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, s-maxage=300, stale-while-revalidate=600",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
