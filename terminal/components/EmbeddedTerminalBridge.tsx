"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import {
  ensureEmbeddedTerminalSession,
  isAllowedMacroOrigin,
  postToMacroDashboard,
} from "@/lib/originNav";
import {
  TERMINAL_VISUAL_READY_EVENT,
  type TerminalVisualReadyDetail,
} from "@/lib/terminalBoot";

const SYMBOL_RE = /^[A-Za-z0-9][A-Za-z0-9._=^:/+\-]{0,63}$/;

function safeSymbol(value: unknown): string {
  if (typeof value !== "string") return "";
  const symbol = value.trim().toUpperCase();
  return SYMBOL_RE.test(symbol) ? symbol : "";
}

/**
 * Cross-origin lifecycle bridge for the first-party Macro Dashboard iframe.
 *
 * The bridge deliberately knows nothing about chart internals. On the chart route it emits a
 * local event that TerminalShell consumes; from any other workspace it returns to /terminal with
 * the requested symbol. Close/ready messages are restricted to the exact dashboard origins.
 */
export default function EmbeddedTerminalBridge() {
  const pathname = usePathname();

  useEffect(() => {
    if (!ensureEmbeddedTerminalSession()) return;

    document.documentElement.dataset.mmEmbedded = "dashboard";

    const announceReady = () => {
      postToMacroDashboard("terminal:ready", {
        path: window.location.pathname,
        symbol: new URLSearchParams(window.location.search).get("symbol")
          || new URLSearchParams(window.location.search).get("sym")
          || "",
      });
    };

    const onVisualReady = (event: Event) => {
      const detail = (event as CustomEvent<TerminalVisualReadyDetail>).detail;
      postToMacroDashboard("terminal:visual-ready", {
        path: window.location.pathname,
        symbol: detail?.symbol || "",
        state: detail?.state || "data",
      });
    };

    const onMessage = (event: MessageEvent) => {
      if (event.source !== window.parent) return;
      if (!isAllowedMacroOrigin(event.origin)) return;
      const data = event.data;
      if (!data || data.source !== "mastermind-dashboard") return;

      if (data.type === "terminal:close") {
        postToMacroDashboard("terminal:close");
        return;
      }

      if (data.type !== "terminal:set-symbol") return;
      const symbol = safeSymbol(data.symbol);
      if (!symbol) return;

      if (window.location.pathname === "/terminal") {
        const url = new URL(window.location.href);
        url.searchParams.set("symbol", symbol);
        url.searchParams.delete("sym");
        window.history.replaceState(window.history.state, "", url.toString());
        window.dispatchEvent(new CustomEvent("mm:embedded-symbol", { detail: { symbol } }));
        postToMacroDashboard("terminal:symbol-ready", { symbol });
        return;
      }

      const ret = sessionStorage.getItem("mm.macroHref") || document.referrer || "https://www.mastermind-x.com/";
      const url = new URL("/terminal", window.location.origin);
      url.searchParams.set("symbol", symbol);
      url.searchParams.set("embed", "dashboard");
      url.searchParams.set("from", "macro");
      url.searchParams.set("ret", ret);
      window.location.assign(url.toString());
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      postToMacroDashboard("terminal:close");
    };

    window.addEventListener("message", onMessage);
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener(TERMINAL_VISUAL_READY_EVENT, onVisualReady);
    const readyTimer = window.setTimeout(announceReady, 0);

    return () => {
      window.clearTimeout(readyTimer);
      window.removeEventListener("message", onMessage);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener(TERMINAL_VISUAL_READY_EVENT, onVisualReady);
      delete document.documentElement.dataset.mmEmbedded;
    };
  }, []);

  useEffect(() => {
    if (!ensureEmbeddedTerminalSession()) return;
    postToMacroDashboard("terminal:route", { path: pathname });
  }, [pathname]);

  return null;
}
