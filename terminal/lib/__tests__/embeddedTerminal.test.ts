import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";
import { isAllowedMacroOrigin } from "../originNav";

describe("embedded Terminal security contract", () => {
  it("accepts only first-party dashboard origins", () => {
    expect(isAllowedMacroOrigin("https://mastermind-x.com")).toBe(true);
    expect(isAllowedMacroOrigin("https://www.mastermind-x.com")).toBe(true);
    expect(isAllowedMacroOrigin("https://app.mastermind-x.com")).toBe(false);
    expect(isAllowedMacroOrigin("https://mastermind-x.com.attacker.example")).toBe(false);
    expect(isAllowedMacroOrigin("javascript:alert(1)")).toBe(false);
  });

  it("uses CSP framing rather than a conflicting legacy frame header", async () => {
    expect(nextConfig.headers).toBeTypeOf("function");
    const rules = await nextConfig.headers!();
    const appRule = rules.find((rule) => rule.source === "/((?!embed).*)");
    expect(appRule).toBeDefined();

    const csp = appRule!.headers.find(
      (header) => header.key.toLowerCase() === "content-security-policy",
    )?.value;
    expect(csp).toContain(
      "frame-ancestors 'self' https://mastermind-x.com https://www.mastermind-x.com",
    );
    expect(
      appRule!.headers.some((header) => header.key.toLowerCase() === "x-frame-options"),
    ).toBe(false);
  });
});
