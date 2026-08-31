import { describe, expect, it, vi } from "vitest";
import {
  bindMastermindBrainCompanySource,
  openMastermindBrainForCompanySource,
  type MastermindBrainHost,
} from "@/lib/mastermindBrain";

describe("exact company-source Brain handoff", () => {
  it("keeps the newer owner through stale cleanup and opens only with an attached getter", () => {
    const open = vi.fn();
    const host: MastermindBrainHost = { MM_BRAIN_CFG: {}, MMBrain: { open } };
    const releaseOlder = bindMastermindBrainCompanySource(() => ({ span_id: "older" } as never), host);
    const releaseNewer = bindMastermindBrainCompanySource(() => ({ span_id: "newer" } as never), host);

    releaseOlder?.();
    expect(host.MM_BRAIN_CFG?.getCompanySourceSpan?.()).toEqual({ span_id: "newer" });
    expect(openMastermindBrainForCompanySource("nvda", host)).toBe(true);
    expect(host.__MM_BRAIN_ACTIVE_SYMBOL__).toBe("NVDA");
    expect(open).toHaveBeenCalledOnce();

    releaseNewer?.();
    expect(host.MM_BRAIN_CFG?.getCompanySourceSpan).toBeUndefined();
    expect(openMastermindBrainForCompanySource("nvda", host)).toBe(false);
    expect(openMastermindBrainForCompanySource("nvda", {
      MM_BRAIN_CFG: { getCompanySourceSpan: () => ({ span_id: "bound" } as never) },
    })).toBe(false);
  });
});
