"use client";
import { useEffect, useState } from "react";

// The Macro Dashboard (the research/marketing site that deep-links into the Terminal). The Terminal itself
// lives on app.mastermind-x.com, so we deliberately match only the apex/www (and the old GitHub-Pages host)
// — never the app subdomain, which would be the Terminal navigating within itself.
const MACRO_HOSTS = new Set(["mastermind-x.com", "www.mastermind-x.com"]);
const MACRO_ORIGIN = "https://mastermind-x.com";
const KEY = "mm.fromMacro";   // sessionStorage: "1" once detected (survives in-app SPA navigation)
const HREF = "mm.macroHref";  // sessionStorage: best-known dashboard URL to return to

function isMacroHost(host: string) {
  return MACRO_HOSTS.has(host) || host.endsWith(".github.io");
}

/**
 * Detect — and remember for the browser session — that the user arrived at the Terminal *from* the Macro
 * Dashboard. Used to show a prominent "back to the dashboard" affordance and, crucially, to HIDE it for
 * direct visitors (for whom a back button would dump them onto whatever unrelated site they came from).
 *
 * Detection is referrer-first (zero coordination needed: macro→terminal is a cross-site HTTPS hop, so the
 * default referrer policy still sends the dashboard origin) with an explicit `?from=macro` override for
 * cases where the referrer is stripped. The result is cached in sessionStorage so it persists as the user
 * navigates between Terminal routes (where the referrer/param are no longer present).
 */
export function useFromMacro() {
  const [fromMacro, setFromMacro] = useState(false);
  const [macroHref, setMacroHref] = useState<string>(MACRO_ORIGIN);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(KEY) === "1") {
        setFromMacro(true);
        setMacroHref(sessionStorage.getItem(HREF) || MACRO_ORIGIN);
        return;
      }
      const params = new URLSearchParams(window.location.search);
      const flagged = params.get("from") === "macro" || params.get("ref") === "macro";
      let refHref = "";
      try {
        if (document.referrer) {
          const u = new URL(document.referrer);
          if (isMacroHost(u.hostname)) refHref = document.referrer;
        }
      } catch {}
      if (flagged || refHref) {
        const href = refHref || MACRO_ORIGIN;
        sessionStorage.setItem(KEY, "1");
        sessionStorage.setItem(HREF, href);
        setFromMacro(true);
        setMacroHref(href);
      }
    } catch {}
  }, []);

  return { fromMacro, macroHref };
}

/**
 * Return to the Macro Dashboard. In the dominant flow (macro → terminal → back), the previous history
 * entry IS the dashboard, so a real back() restores the exact page + scroll instantly (bfcache). When
 * there's nothing to pop (opened in a fresh tab) we hard-navigate to the captured dashboard URL.
 */
export function backToMacro(macroHref: string) {
  try {
    if (window.history.length > 1 && document.referrer) {
      const u = new URL(document.referrer);
      if (isMacroHost(u.hostname)) { window.history.back(); return; }
    }
  } catch {}
  window.location.assign(macroHref || MACRO_ORIGIN);
}
