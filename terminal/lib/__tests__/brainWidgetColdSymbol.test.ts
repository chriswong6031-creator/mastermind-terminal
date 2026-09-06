// @vitest-environment jsdom
//
// Review ruling (PR #490, MAJOR 2): "No test covers launcher-entry." Before this fix,
// AppShell mounted BrainWidget with `active=""` on /analysis, and
// `handoffMastermindBrainSymbol("")` returns `false` WITHOUT writing
// `__MM_BRAIN_ACTIVE_SYMBOL__` (lib/mastermindBrain.ts) — so a cold load opened via the
// external floating launcher (which never calls the in-app "attach exact source" affordance
// that would otherwise hand off a real symbol) left `cfg.symbol()` returning "" forever.
//
// This proves two things end to end through the real BrainWidget component (not just the
// pure resolveShellBrainSymbol unit, covered separately in shellBrainSymbol.test.ts):
//   1. Mounted with AppShell's now-resolved (never-empty) symbol, the singleton's
//      `cfg.symbol()` returns it immediately — with NO explicit attach/handoff call, i.e.
//      exactly the launcher-entry path the review flagged as uncovered.
//   2. A later symbol change on the SAME mounted instance (AppShell recomputing its resolved
//      symbol on a fresh /analysis entry) re-hands-off: `cfg.symbol()` reflects the new value.
//
// Same harness as lib/__tests__/brainWidgetRebinding.test.ts (no @testing-library/react in
// this repo — react-dom/client's createRoot + react's act, written as .ts to match the
// vitest.config.ts include glob).
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import React from "react";
import BrainWidget from "@/components/BrainWidget";
import { resolveShellBrainSymbol, SHELL_DEFAULT_BRAIN_SYMBOL, type ShellBrainSymbolHost } from "@/lib/shellBrainSymbol";
import type { MastermindBrainHost } from "@/lib/mastermindBrain";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const noop = () => undefined;

// resolveShellBrainSymbol takes a narrow host shape (not a real window.localStorage — this
// repo's vitest jsdom environment does not provide one; see shellBrainSymbol.test.ts) so a
// plain in-memory stub stands in for "the route/store state AppShell would have seen".
function makeSymbolHost(href: string, mmWs?: unknown): ShellBrainSymbolHost {
  const store = new Map<string, string>();
  if (mmWs !== undefined) store.set("mm.ws", typeof mmWs === "string" ? mmWs : JSON.stringify(mmWs));
  return {
    location: { href },
    localStorage: { getItem: (key: string) => (store.has(key) ? store.get(key)! : null) },
  };
}

describe("BrainWidget cold /analysis launcher entry never sees an empty symbol (reviewer ruling MAJOR 2)", () => {
  let container: HTMLDivElement;
  let root: Root | undefined;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    const w = window as unknown as MastermindBrainHost & Record<string, unknown>;
    delete w.MM_BRAIN_CFG;
    delete w.MMBrain;
    delete w.__MM_BRAIN_ACTIVE_SYMBOL__;
    document.querySelectorAll('script[src*="mm_brain.js"]').forEach((el) => el.remove());
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    root = undefined;
    container.remove();
  });

  function mount(active: string) {
    act(() => {
      root = createRoot(container);
      root!.render(
        React.createElement(BrainWidget, {
          active,
          onCommand: noop,
          onAnnotate: noop,
        }),
      );
    });
  }

  function rerender(active: string) {
    act(() => {
      root!.render(
        React.createElement(BrainWidget, {
          active,
          onCommand: noop,
          onAnnotate: noop,
        }),
      );
    });
  }

  it("resolves a non-empty symbol on a cold mount with no route param and no stored workspace", () => {
    const symbol = resolveShellBrainSymbol(makeSymbolHost("https://mastermind-x.com/analysis"));
    expect(symbol).toBe(SHELL_DEFAULT_BRAIN_SYMBOL);

    mount(symbol);

    // The launcher-entry path: no attach call, no explicit handoffMastermindBrainSymbol call —
    // only the mount itself. cfg.symbol() must already be real.
    const w = window as unknown as MastermindBrainHost;
    expect(w.MM_BRAIN_CFG?.symbol?.()).toBe(SHELL_DEFAULT_BRAIN_SYMBOL);
    expect(w.MM_BRAIN_CFG?.symbol?.()).not.toBe("");
  });

  it("resolves the chart workspace's last active pane when /analysis was entered without ?symbol=", () => {
    const symbol = resolveShellBrainSymbol(
      makeSymbolHost("https://mastermind-x.com/analysis", { panes: ["TSLA", "MSFT"], activePane: 1 }),
    );
    expect(symbol).toBe("MSFT");

    mount(symbol);

    const w = window as unknown as MastermindBrainHost;
    expect(w.MM_BRAIN_CFG?.symbol?.()).toBe("MSFT");
  });

  it("re-hands-off when the resolved symbol changes on the same mounted instance", () => {
    mount("NVDA");
    const w = window as unknown as MastermindBrainHost;
    expect(w.MM_BRAIN_CFG?.symbol?.()).toBe("NVDA");

    rerender("AMD");
    expect(w.MM_BRAIN_CFG?.symbol?.()).toBe("AMD");
  });
});
