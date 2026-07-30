/**
 * Critical-path helpers shared by the server route, chart renderer, and
 * dashboard iframe bridge.
 */

export const TERMINAL_VISUAL_READY_EVENT = "mm:terminal-visual-ready";

const DATA_FILE_SYMBOL_RE = /^[A-Z0-9^][A-Z0-9._=^+\-]{0,63}$/;

export function criticalTerminalDataUrls(value: unknown): string[] {
  if (typeof value !== "string") return [];
  const symbol = value.trim().toUpperCase();
  if (!DATA_FILE_SYMBOL_RE.test(symbol)) return [];
  const encoded = encodeURIComponent(symbol);
  return [`/data/${encoded}.json`, `/data/${encoded}.slice.json`];
}

export type TerminalVisualReadyDetail = {
  symbol: string;
  state: "data" | "empty";
};

/**
 * `setData()` updates the chart model synchronously, but the canvas is painted
 * later. Two animation frames make the dashboard reveal follow a real visual
 * frame instead of the earlier React-shell mount.
 */
export function announceTerminalVisualReady(
  symbol: string,
  state: TerminalVisualReadyDetail["state"] = "data",
): void {
  if (typeof window === "undefined") return;
  const detail: TerminalVisualReadyDetail = { symbol, state };
  const emit = () => {
    window.dispatchEvent(new CustomEvent<TerminalVisualReadyDetail>(
      TERMINAL_VISUAL_READY_EVENT,
      { detail },
    ));
  };

  if (typeof window.requestAnimationFrame !== "function") {
    window.setTimeout(emit, 0);
    return;
  }
  window.requestAnimationFrame(() => window.requestAnimationFrame(emit));
}
