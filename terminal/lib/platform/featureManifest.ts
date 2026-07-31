// Native-alpha surface exposure — the ONE place that says what the installable apps show.
// The shells bundle contracts/native-features.v1.json; lib/__tests__/featureManifest.test.ts
// pins that JSON equal to this object so the two cannot drift. Do not scatter platform
// conditionals through product components — consult this manifest instead.

export const NATIVE_FEATURES_V1 = {
  version: 1,
  features: {
    chart: true,
    search: true,
    watchlist: true,
    markets: true,
    analysis: true,
    discover: true,
    options: false,
    alerts: false,
    portfolio: false,
    scripts: false,
    admin: false,
    broker: false,
  },
  // Routes a shell WebView may load; everything else is blocked native-side with a
  // "not in this alpha" notice (options exclusion is enforced here, not in product code).
  allowedRoutes: ["/terminal", "/analysis", "/discover", "/embed/chart"],
} as const;

export type NativeFeatureKey = keyof typeof NATIVE_FEATURES_V1.features;
