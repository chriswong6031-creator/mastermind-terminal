"use client";
import { useEffect } from "react";
import { track } from "@/lib/analytics";

// Lightweight client error monitoring on top of the Umami pipeline. Catches
// uncaught exceptions and unhandled promise rejections and reports them as a
// "js-error" event. Deliberately NOT a replacement for Sentry — no stack
// uploads, no source maps — just a cheap signal of "is prod throwing, where,
// and roughly what" that also survives the GFW (same first-party beacon).

// Benign, high-frequency noise we never want to report.
const IGNORE = [
  "ResizeObserver loop limit exceeded",
  "ResizeObserver loop completed with undelivered notifications",
  // Cross-origin script errors are opaque ("Script error.") and non-actionable.
  "Script error.",
];

export default function ErrorMonitor() {
  useEffect(() => {
    const seen = new Set<string>();
    let sent = 0;
    const MAX = 25; // hard cap per page-load — never flood Umami on an error storm

    const report = (kind: "error" | "unhandledrejection", message: string, source = "", line = 0) => {
      try {
        const msg = (message || "unknown").slice(0, 200);
        if (IGNORE.some((s) => msg.includes(s))) return;
        const sig = `${kind}|${msg}|${source}|${line}`;
        if (seen.has(sig)) return; // dedupe identical errors
        if (sent >= MAX) return; // throttle storms
        seen.add(sig);
        sent++;
        track("js-error", { kind, message: msg, source: source.slice(0, 200), line, page: location.pathname });
      } catch {
        // the reporter must never throw
      }
    };

    // Note: resource-load errors (img/script 404s) don't bubble, so this
    // non-capture listener only sees real JS runtime errors.
    const onError = (e: ErrorEvent) => report("error", e.message, e.filename, e.lineno);
    const onRejection = (e: PromiseRejectionEvent) => {
      const r = e.reason as unknown;
      const message =
        r instanceof Error ? `${r.name}: ${r.message}` : typeof r === "string" ? r : "unhandled promise rejection";
      report("unhandledrejection", message);
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
