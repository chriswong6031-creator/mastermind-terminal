"use client";
import { SHELL_BRIDGE_VERSION, type MmShellApi, type ShellOutboundMessage } from "@/lib/platform/contract";
import { TF_CANONICAL_ORDER } from "@/lib/startTf";
import { applyLang } from "@/lib/i18n";

/** Post a notification to the native shell. Safe everywhere: without a native host it is a no-op. */
export function postToShell(msg: ShellOutboundMessage) {
  try {
    (window as unknown as { webkit?: { messageHandlers?: { mm?: { postMessage(m: unknown): void } } } })
      .webkit?.messageHandlers?.mm?.postMessage(msg);
  } catch { /* not hosted by a shell */ }
}

/**
 * Install `window.__mmShell` and announce `ready`. Commands deliberately ride the SAME seams
 * the product already exposes — `mm:embedded-symbol` (dashboard warm-iframe symbol switch) and
 * `mm:set-tf` (TF toolbar) — so the bridge adds no second symbol/TF pathway to maintain.
 * Returns the uninstaller (used on unmount / shell-mode teardown).
 */
export function initShellBridge(hooks: { getState: () => { sym: string; tf: string } }): () => void {
  const api: MmShellApi = {
    version: SHELL_BRIDGE_VERSION,
    setSymbol: (sym) => {
      const s = String(sym || "").trim().toUpperCase();
      if (s) window.dispatchEvent(new CustomEvent("mm:embedded-symbol", { detail: { symbol: s } }));
    },
    setTimeframe: (tf) => {
      const t = String(tf || "").trim();
      if (t) window.dispatchEvent(new CustomEvent("mm:set-tf", { detail: { tf: t } }));
    },
    setLang: (lang) => applyLang(lang === "zh" ? "zh" : "en"),
    setDrawTools: (visible) => {
      // Shell mode hides the drawing toolbar by default (chart real estate); the native
      // pencil toggles it back in — pure CSS class flip, no drawing state touched.
      document.querySelector(".app")?.classList.toggle("shell-draw", !!visible);
      return true;
    },
    restoreState: ({ sym, tf } = {}) => {
      if (sym) api.setSymbol(sym);
      if (tf) api.setTimeframe(tf);
    },
    setSession: async ({ access_token, refresh_token }) => {
      if (!access_token || !refresh_token) return false;
      const { createClient } = await import("@/lib/supabase/client");
      const { error } = await createClient().auth.setSession({ access_token, refresh_token });
      // Reload so server components and route handlers see the freshly written auth cookies.
      if (!error) setTimeout(() => window.location.reload(), 80);
      return !error;
    },
    getState: () => hooks.getState(),
  };
  (window as unknown as { __mmShell?: MmShellApi }).__mmShell = api;
  postToShell({ type: "ready", bridgeVersion: SHELL_BRIDGE_VERSION, availableTimeframes: [...TF_CANONICAL_ORDER] });
  return () => {
    const w = window as unknown as { __mmShell?: MmShellApi };
    if (w.__mmShell === api) w.__mmShell = undefined;
  };
}
