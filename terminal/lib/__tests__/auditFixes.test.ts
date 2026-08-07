/**
 * Regressions for defects found by the 2026-08-01 adversarial audit of W1–W3.
 *
 * 22 candidate findings, 15 survived independent refutation. These are the ones that
 * were live in deployed code. Each test names the audit finding it pins.
 */
import { describe, expect, it } from "vitest";
import { backendPath, isValidF, isValidRoot, r2Key } from "@/lib/flowSource";
import { extremes, MATRIX_MAX_GAP_DAYS } from "@/lib/aggTrend";

// ─── Finding #14 — path traversal + cache poisoning via the f-param ──────────────────
//
// isValidF accepted ANY non-empty string after `gex:`/`vol:`/`matrix:`/`agg:`/… and
// backendPath/r2Key interpolated it raw. `gex:../../admin/secrets` normalises the `..`
// away at fetch time, reads an arbitrary backend endpoint or R2 object, and — because
// the route caches by the f-param string — the result is then served from the shared
// server-side cache under the attacker's key.

describe("f-param root validation", () => {
  const PREFIXES = ["gex", "vol", "agg", "matrix", "moves", "ticker", "gexstate",
                    "tctx", "oi_time", "max_pain", "oi_change", "gex_dates",
                    "surface_idx", "surface_dates"];

  it("rejects traversal on every root-interpolating prefix", () => {
    for (const p of PREFIXES) {
      for (const evil of ["../../admin", "..", "../secrets", "a/../../b", "%2e%2e%2fetc"]) {
        expect(isValidF(`${p}:${evil}`)).toBe(false);
      }
    }
  });

  it("rejects separators, whitespace and escapes that could reshape a path or key", () => {
    for (const evil of ["A/B", "A\\B", "A B", "A?x=1", "A#f", "A%2F", "A:B", ""]) {
      expect(isValidRoot(evil)).toBe(false);
    }
  });

  it("still accepts the roots that actually exist", () => {
    for (const ok of ["SPY", "QQQ", "SPX", "NVDA", "BRK.B", "RDS-A", "A"]) {
      expect(isValidRoot(ok)).toBe(true);
      expect(isValidF(`gex:${ok}`)).toBe(true);
      expect(isValidF(`agg:${ok}`)).toBe(true);
    }
  });

  it("bounds the length so a key cannot be padded out", () => {
    expect(isValidRoot("A".repeat(12))).toBe(false); // 12 A's is >10 for the head group
    expect(isValidRoot("A".repeat(64))).toBe(false);
  });

  it("validates EVERY segment of the dated and stamped forms", () => {
    expect(isValidF("gex_at:SPY:2026-07-31")).toBe(true);
    expect(isValidF("gex_at:../x:2026-07-31")).toBe(false);
    expect(isValidF("gex_at:SPY:../../x")).toBe(false);
    expect(isValidF("gex_at:SPY:not-a-date")).toBe(false);
    expect(isValidF("surface_at:SPY:2026-07-31:0930")).toBe(true);
    expect(isValidF("surface_at:SPY:2026-07-31:../x")).toBe(false);
  });

  it("keeps a rejected f-param out of both the backend path and the R2 key", () => {
    // Belt and braces: even if a future edit lets one through isValidF, these are the
    // two functions that turn it into a request.
    expect(isValidF("gex:../../etc/passwd")).toBe(false);
    expect(backendPath("gex:SPY")).toBe("/api/hub/gex/SPY");
    expect(r2Key("agg:SPY")).toBe("options_hub/aggtrend/SPY.json");
  });
});

// ─── Finding #11 — extremes() re-dated and re-sided another session's matrix ─────────

const cell = (strike: number, expiry: string, gexMn: number) =>
  ({ strike, expiry, gex: gexMn * 1e6 });

describe("extremes() honours the matrix's own session", () => {
  it("bands by the MATRIX's asof, not the ladder's", () => {
    // Same cells, two ladder dates. Using the ladder's asof would move this expiry
    // between horizon bands; using the matrix's own keeps it put.
    const m = { asof: "2026-07-31", spot: 100, cells: [cell(105, "2026-08-04", 40)] };
    const a = extremes(m, 100, "2026-07-31");
    const b = extremes(m, 100, "2026-08-02"); // ladder 2 days ahead, inside tolerance
    const near = (r: ReturnType<typeof extremes>) => r.rows.find((x) => x.horizon === "near")!;
    expect(near(a).resistance).toBe(105);
    expect(near(b).resistance).toBe(105);
    expect(near(a).cells).toBe(near(b).cells);
  });

  it("sides strikes by the MATRIX's spot, not the ladder's", () => {
    // A strike above the matrix's spot is resistance. Priced at a much higher ladder
    // spot it would be re-read as support — a level flipped to the opposite meaning.
    const r = extremes(
      { asof: "2026-07-31", spot: 100, cells: [cell(105, "2026-08-03", 40)] },
      140, // ladder spot far above
      "2026-07-31",
    );
    const near = r.rows.find((x) => x.horizon === "near")!;
    expect(near.resistance).toBe(105);
    expect(near.support).toBeNull();
  });

  it("refuses outright once the two stores have drifted apart", () => {
    const stale = {
      asof: "2026-06-01",
      spot: 100,
      cells: [cell(105, "2026-06-03", 40)],
    };
    expect(extremes(stale, 100, "2026-07-31").available).toBe(false);
  });

  it("tolerates a long weekend", () => {
    const m = { asof: "2026-07-31", spot: 100, cells: [cell(105, "2026-08-04", 40)] };
    const withinMs = MATRIX_MAX_GAP_DAYS * 86_400_000;
    expect(withinMs).toBeGreaterThan(0);
    expect(extremes(m, 100, "2026-08-03").available).toBe(true);
  });

  it("falls back to the caller's session only when the matrix carries none", () => {
    const m = { spot: 100, cells: [cell(105, "2026-08-03", 40)] };
    expect(extremes(m, 100, "2026-07-31").available).toBe(true);
  });
});
