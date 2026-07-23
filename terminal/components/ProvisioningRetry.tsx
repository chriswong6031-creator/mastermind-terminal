"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { tPlain } from "@/lib/i18n";

// Auto-recovery for the workspace-provisioning fallback in app/terminal/page.tsx.
//
// Right after signup, two concurrent requests (router.refresh + the page load)
// can race the default-watchlist seed: one inserts, the other re-selects before
// that insert commits and lands on the fallback branch. The data is fine within
// a second — the old static fallback just never looked again, stranding brand-new
// users on a dead "Setting up your workspace…" screen (operator-reported).
//
// This component re-runs the server component on a short backoff, bounded so a
// genuinely broken backend degrades to an honest manual Retry instead of a
// reload loop. sessionStorage (per-tab) carries the attempt count across the
// full server re-renders.
const SS_KEY = "mm.provRetry";
const MAX_AUTO = 4;
const DELAY_MS = 1200;

export default function ProvisioningRetry() {
  const router = useRouter();
  const [exhausted, setExhausted] = useState(false);

  useEffect(() => {
    let n = 0;
    try { n = parseInt(sessionStorage.getItem(SS_KEY) || "0", 10) || 0; } catch { /* ignore */ }
    if (n >= MAX_AUTO) { setExhausted(true); return; }
    const id = setTimeout(() => {
      try { sessionStorage.setItem(SS_KEY, String(n + 1)); } catch { /* ignore */ }
      router.refresh();
    }, DELAY_MS);
    return () => clearTimeout(id);
  }, [router]);

  // Reached the real workspace on a later mount? The page unmounts this component,
  // so the counter only needs clearing when the user retries manually.
  if (!exhausted) return null;
  return (
    <button
      className="ob-btn"
      style={{ marginTop: 16 }}
      onClick={() => {
        try { sessionStorage.removeItem(SS_KEY); } catch { /* ignore */ }
        window.location.reload();
      }}
    >
      {tPlain("obProvRetry", "Retry")}
    </button>
  );
}
