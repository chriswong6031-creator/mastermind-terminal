// Thin wrapper around the Umami tracker (loaded first-party via next.config
// rewrites — see /stats/script.js). Safe to call from anywhere: it no-ops on
// the server, before the tracker script has loaded, and when the tracker is
// blocked (ad blocker / Great Firewall), and it never throws into the UI.
//
// Usage: track("copilot-query", { symbol: "NVDA", kind: "freeform" })

type Umami = { track: (event: string, data?: Record<string, unknown>) => void };

declare global {
  interface Window {
    umami?: Umami;
  }
}

export function track(event: string, data?: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  try {
    window.umami?.track(event, data);
  } catch {
    // Analytics must never break the app — swallow everything.
  }
}
