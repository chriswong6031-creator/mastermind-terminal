import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // pin the workspace root (sibling lockfiles exist) so Turbopack stops warning
  turbopack: { root: path.resolve(__dirname) },
  // tsc --noEmit is clean as of 2026-07-11, so builds enforce types again — the
  // 2026-07-07 `typescript.ignoreBuildErrors` escape hatch (FinPage union nits)
  // is removed; CI (.github/workflows/ci.yml) also gates PRs on tsc + vitest.
  // Note: `eslint` key was removed in Next.js 16 — ESLint is no longer built-in.
  // Cache static market-data JSON served from /data/* for 5 min, stale for 1 hour.
  async headers() {
    return [
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
