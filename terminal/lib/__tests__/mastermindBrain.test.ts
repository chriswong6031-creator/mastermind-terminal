import { describe, expect, it, vi } from "vitest";
import {
  handoffMastermindBrainSymbol,
  openMastermindBrainForSymbol,
  type MastermindBrainHost,
} from "@/lib/mastermindBrain";

describe("Mastermind Brain symbol handoff", () => {
  it("rebinds a stale singleton config before opening it", () => {
    const open = vi.fn();
    const host: MastermindBrainHost = {
      MM_BRAIN_CFG: { symbol: () => "AAPL" },
      MMBrain: { open },
    };

    expect(openMastermindBrainForSymbol("nvda", host)).toBe(true);
    expect(open).toHaveBeenCalledOnce();
    expect(host.MM_BRAIN_CFG?.symbol?.()).toBe("NVDA");
  });

  it("records a valid handoff without claiming that an absent widget opened", () => {
    const host: MastermindBrainHost = {};

    expect(handoffMastermindBrainSymbol("brk.b", host)).toBe(true);
    expect(host.__MM_BRAIN_ACTIVE_SYMBOL__).toBe("BRK.B");
    expect(openMastermindBrainForSymbol("BRK.B", host)).toBe(false);
  });
});
