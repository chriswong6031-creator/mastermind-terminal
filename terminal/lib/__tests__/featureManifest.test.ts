import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { NATIVE_FEATURES_V1 } from "@/lib/platform/featureManifest";

// The native shells bundle the JSON copy; this pin keeps it byte-equivalent to the
// TypeScript source of truth so a manifest change cannot ship half-applied.
describe("native feature manifest", () => {
  it("contracts/native-features.v1.json mirrors lib/platform/featureManifest.ts", () => {
    const json = JSON.parse(
      readFileSync(new URL("../../../contracts/native-features.v1.json", import.meta.url), "utf8"),
    );
    expect(json).toEqual(NATIVE_FEATURES_V1);
  });

  it("options stays excluded from the native alpha", () => {
    expect(NATIVE_FEATURES_V1.features.options).toBe(false);
    expect(NATIVE_FEATURES_V1.allowedRoutes).not.toContain("/options");
  });
});
