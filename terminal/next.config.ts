import type { NextConfig } from "next";
import path from "path";

const isProd = process.env.NODE_ENV === "production";

// ── Content-Security-Policy ───────────────────────────────────────────────────
// Derived from an audit of every external resource the BROWSER actually reaches:
//   - inline bootstrap script (app/layout.tsx LOCALE_INIT) + Next App Router streaming
//     inject inline <script> → script-src needs 'unsafe-inline' (a nonce migration is the
//     follow-up hardening; documented in SECURITY.md).
//   - React inline style attributes → style-src 'unsafe-inline'.
//   - shared chart-snapshot <img> served from Cloudflare R2 (app/x/[slug]) → img-src *.r2.dev.
//   - Supabase auth (REST + realtime WS) and the optional live Polygon WS → connect-src.
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
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co wss://socket.polygon.io https://qt.gtimg.cn https://web.ifzq.gtimg.cn https://ifzq.gtimg.cn",
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
  // pin the workspace root (sibling lockfiles exist) so Turbopack stops warning
  turbopack: { root: path.resolve(__dirname) },
  // Never ship client source maps to the browser (this is Next's default; pinned here as a
  // guardrail so proprietary chart/indicator/Pine logic can't be trivially de-minified).
  productionBrowserSourceMaps: false,
  // tsc --noEmit is clean as of 2026-07-11, so builds enforce types again — the
  // 2026-07-07 `typescript.ignoreBuildErrors` escape hatch (FinPage union nits)
  // is removed; CI (.github/workflows/ci.yml) also gates PRs on tsc + vitest.
  // Note: `eslint` key was removed in Next.js 16 — ESLint is no longer built-in.
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
        source: "/(screener|alerts|flow|login)",
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
