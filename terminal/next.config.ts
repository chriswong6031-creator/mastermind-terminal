import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // pin the workspace root (sibling lockfiles exist) so Turbopack stops warning
  turbopack: { root: path.resolve(__dirname) },
};

export default nextConfig;
