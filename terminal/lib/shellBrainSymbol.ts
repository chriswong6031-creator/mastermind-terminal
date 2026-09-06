import { normalizeAnalysisSymbol } from "./analysisSymbol";

/**
 * The Analysis workspace's own fallback symbol when nothing else resolves
 * (matches `components/workspaces/AnalysisWorkspace.tsx`'s `DEFAULT_SYMBOL`).
 */
export const SHELL_DEFAULT_BRAIN_SYMBOL = "NVDA";

interface ShellWorkspaceStore {
  panes?: unknown;
  activePane?: unknown;
}

/**
 * The minimal host shape this resolver needs — deliberately narrower than `Window` (just
 * `location.href` and a `getItem`-capable store) so tests can pass a plain in-memory stub
 * instead of depending on a real `window.localStorage` (unavailable under this repo's vitest
 * jsdom environment — see lib/__tests__/shellBrainSymbol.test.ts). The real `window` object
 * satisfies this structurally with no cast needed.
 */
export interface ShellBrainSymbolHost {
  location: { href: string };
  localStorage: { getItem(key: string): string | null };
}

/**
 * Resolve the symbol AppShell hands the Brain widget on `/analysis` mount, so it is
 * NEVER mounted with an empty active symbol (review ruling, PR #490 MAJOR 2):
 * `handoffMastermindBrainSymbol("")` returns `false` WITHOUT writing the document-level
 * `__MM_BRAIN_ACTIVE_SYMBOL__`, so a cold `/analysis?symbol=NVDA` load opened through the
 * external floating launcher (which never calls the in-app "attach exact source" affordance
 * that would otherwise hand off a real symbol) left `cfg.symbol()` returning `""` forever.
 *
 * Precedence: the route's own `?symbol=` query param → the chart workspace's last active
 * pane (localStorage `"mm.ws"`, written by `components/TerminalShell.tsx`) → the shell
 * default. Every candidate is run through the same identifier grammar
 * (`lib/analysisSymbol.ts`) AnalysisWorkspace itself uses, so this can never resolve to a
 * value AnalysisWorkspace's own seeding would have rejected.
 */
export function resolveShellBrainSymbol(
  win: ShellBrainSymbolHost | undefined = typeof window === "undefined" ? undefined : window,
): string {
  if (!win) return SHELL_DEFAULT_BRAIN_SYMBOL;

  try {
    const url = new URL(win.location.href);
    const fromRoute = normalizeAnalysisSymbol(url.searchParams.get("symbol") ?? undefined);
    if (fromRoute) return fromRoute;
  } catch {
    // malformed location — fall through to the store/default candidates
  }

  try {
    const raw = win.localStorage.getItem("mm.ws");
    const ws = raw ? (JSON.parse(raw) as ShellWorkspaceStore) : null;
    const panes = Array.isArray(ws?.panes) ? (ws!.panes as unknown[]) : null;
    if (panes && panes.length) {
      const idx = Number.isInteger(ws!.activePane) && (ws!.activePane as number) >= 0 && (ws!.activePane as number) < panes.length
        ? (ws!.activePane as number)
        : 0;
      const candidate = panes[idx];
      const fromStore = normalizeAnalysisSymbol(typeof candidate === "string" ? candidate : undefined);
      if (fromStore) return fromStore;
    }
  } catch {
    // corrupt/unavailable localStorage — fall through to the default
  }

  return SHELL_DEFAULT_BRAIN_SYMBOL;
}
