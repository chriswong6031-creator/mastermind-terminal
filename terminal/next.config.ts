import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // pin the workspace root (sibling lockfiles exist) so Turbopack stops warning
  turbopack: { root: path.resolve(__dirname) },
  // tsc --noEmit is clean as of 2026-07-06, so builds enforce types again (was
  // ignoreBuildErrors while lightweight-charts LineWidth nits lingered).
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
    ];
  },
};

export default nextConfig;
