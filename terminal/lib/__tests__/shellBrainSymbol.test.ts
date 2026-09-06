// Review ruling (PR #490, MAJOR 2): AppShell must never mount BrainWidget with an empty
// active symbol — a cold /analysis load opened through the external floating launcher (which
// never calls the in-app "attach exact source" handoff, so `__MM_BRAIN_ACTIVE_SYMBOL__` is
// never written) left `cfg.symbol()` returning "" forever. resolveShellBrainSymbol is the
// pure resolution AppShell now runs on every /analysis entry: route param -> last active
// chart-workspace pane (localStorage "mm.ws") -> the shell default. Tested directly here
// (no DOM/React involved) plus once more at the BrainWidget integration layer in
// brainWidgetColdSymbol.test.ts.
//
// Plain Node environment, no jsdom: this repo's vitest jsdom environment does not provide a
// real window.localStorage (confirmed: `typeof window.localStorage === "undefined"` under
// `@vitest-environment jsdom` here), so resolveShellBrainSymbol takes the narrow
// `ShellBrainSymbolHost` shape (location.href + a getItem-capable store) specifically so a
// plain in-memory stub can stand in for it — see lib/shellBrainSymbol.ts.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { resolveShellBrainSymbol, SHELL_DEFAULT_BRAIN_SYMBOL, type ShellBrainSymbolHost } from "@/lib/shellBrainSymbol";

function makeHost(href: string, mmWs?: unknown): ShellBrainSymbolHost {
  const store = new Map<string, string>();
  if (mmWs !== undefined) store.set("mm.ws", typeof mmWs === "string" ? mmWs : JSON.stringify(mmWs));
  return {
    location: { href },
    localStorage: { getItem: (key: string) => (store.has(key) ? store.get(key)! : null) },
  };
}

describe("resolveShellBrainSymbol", () => {
  it("never resolves to an empty string", () => {
    expect(resolveShellBrainSymbol(makeHost("https://mastermind-x.com/analysis"))).not.toBe("");
  });

  it("falls back to the shell default when there is no route param and no stored workspace", () => {
    expect(resolveShellBrainSymbol(makeHost("https://mastermind-x.com/analysis"))).toBe(SHELL_DEFAULT_BRAIN_SYMBOL);
  });

  it("prefers the route's own ?symbol= query param", () => {
    const host = makeHost("https://mastermind-x.com/analysis?symbol=aapl", { panes: ["MSFT"], activePane: 0 });
    expect(resolveShellBrainSymbol(host)).toBe("AAPL");
  });

  it("falls back to the chart workspace's last active pane when there is no route param", () => {
    const host = makeHost("https://mastermind-x.com/analysis", { panes: ["TSLA", "MSFT"], activePane: 1 });
    expect(resolveShellBrainSymbol(host)).toBe("MSFT");
  });

  it("clamps an out-of-range activePane to the first stored pane instead of throwing", () => {
    const host = makeHost("https://mastermind-x.com/analysis", { panes: ["TSLA"], activePane: 7 });
    expect(resolveShellBrainSymbol(host)).toBe("TSLA");
  });

  it("ignores a malformed ?symbol= value and falls through to the store, never crashing", () => {
    const host = makeHost(
      "https://mastermind-x.com/analysis?symbol=" + encodeURIComponent("not a symbol"),
      { panes: ["NFLX"], activePane: 0 },
    );
    expect(resolveShellBrainSymbol(host)).toBe("NFLX");
  });

  it("ignores a corrupt mm.ws payload and falls back to the default, never throwing", () => {
    const host = makeHost("https://mastermind-x.com/analysis", "{not json");
    expect(() => resolveShellBrainSymbol(host)).not.toThrow();
    expect(resolveShellBrainSymbol(host)).toBe(SHELL_DEFAULT_BRAIN_SYMBOL);
  });

  it("returns the shell default when the host is unavailable (SSR)", () => {
    expect(resolveShellBrainSymbol(undefined)).toBe(SHELL_DEFAULT_BRAIN_SYMBOL);
  });
});

describe("AppShell wires BrainWidget's active prop to resolveShellBrainSymbol (regression guard for the exact reviewer-cited bug site)", () => {
  const APP_SHELL_TSX = readFileSync(join(__dirname, "..", "..", "components", "chrome", "AppShell.tsx"), "utf8");

  it("no longer mounts BrainWidget with the literal empty-string active prop", () => {
    expect(APP_SHELL_TSX).not.toMatch(/<BrainWidget\s+active=""/);
  });

  it("imports resolveShellBrainSymbol and passes its result as BrainWidget's active prop", () => {
    expect(APP_SHELL_TSX).toMatch(/import\s*\{\s*resolveShellBrainSymbol\s*\}\s*from\s*["']@\/lib\/shellBrainSymbol["']/);
    // Whatever local name the memoized value is given, it must (a) be produced by
    // resolveShellBrainSymbol and (b) be the exact expression handed to <BrainWidget active=...>.
    const assignment = APP_SHELL_TSX.match(/const\s+(\w+)\s*=\s*useMemo\(\s*\(\)\s*=>[\s\S]{0,200}?resolveShellBrainSymbol\(\)/);
    expect(assignment, "no useMemo(...) assignment calling resolveShellBrainSymbol() found").not.toBeNull();
    const localName = assignment![1];
    const activeProp = APP_SHELL_TSX.match(/<BrainWidget\s+active=\{(\w+)\}/);
    expect(activeProp, "<BrainWidget active={...}> prop not found").not.toBeNull();
    expect(activeProp![1]).toBe(localName);
  });
});
