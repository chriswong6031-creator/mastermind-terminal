"use client";
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useT } from "@/lib/i18n";
import { Tip } from "@/components/ui/Tip";

const ICON: Record<string, string[]> = {
  chart: ["M3 17l5-6 4 3 4-7 5 9", "M3 21h18"],
  analyst: ["M4 19V5", "M4 19h16", "M8 15l3-4 3 2 4-6"],
  screener: [], // rects drawn inline
  scripts: ["M8 7l-5 5 5 5M16 7l5 5-5 5"],
  portfolio: ["M21 12a9 9 0 1 1-9-9v9z"],
  alerts: ["M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"],
  flow: [], // custom inline — options hub
  heatmap: [], // custom inline — market heatmap
  ai: ["M12 2l2.2 5.8L20 10l-5.8 2.2L12 18l-2.2-5.8L4 10l5.8-2.2z"],
};
export function Glyph({ k }: { k: string }) {
  if (k === "screener")
    return (<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>);
  if (k === "flow")
    return (<svg viewBox="0 0 24 24"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" /></svg>);
  if (k === "heatmap")
    return (<svg viewBox="0 0 24 24"><rect x="3" y="3" width="4" height="4" rx="0.5" /><rect x="10" y="3" width="4" height="4" rx="0.5" /><rect x="17" y="3" width="4" height="4" rx="0.5" /><rect x="3" y="10" width="4" height="4" rx="0.5" /><rect x="10" y="10" width="4" height="4" rx="0.5" /><rect x="17" y="10" width="4" height="4" rx="0.5" /><rect x="3" y="17" width="4" height="4" rx="0.5" /><rect x="10" y="17" width="4" height="4" rx="0.5" /><rect x="17" y="17" width="4" height="4" rx="0.5" /></svg>);
  return (<svg viewBox="0 0 24 24">{ICON[k].map((d, i) => <path key={i} d={d} />)}</svg>);
}

// The single source of truth for the primary nav. Exported so the mobile drawer (TerminalShell)
// derives its items from the SAME list — the two nav surfaces can't drift.
export const TOP = [
  { k: "chart", label: "Chart", href: "/terminal" },
  { k: "analyst", label: "Analyst", href: "/terminal?pane=overview" },
  { k: "screener", label: "Screener", href: "/screener" },
  { k: "scripts", label: "Scripts", href: "/scripts" },
  { k: "portfolio", label: "Portfolio", href: "/portfolio" },
  { k: "alerts", label: "Alerts", href: "/alerts" },
  { k: "flow", label: "Options", href: "/flow" },
  {
    k: "heatmap",
    label: "Heatmap",
    // ?v=2: sidesteps a poisoned EdgeOne cache entry for the bare /heatmap URL
    // (year-long s-maxage shell from before the revalidate=300 fix, referencing
    // deleted JS chunks). Remove after the operator purges /heatmap in the
    // EdgeOne console.
    href: "/heatmap?v=2",
  },
];

// useSearchParams() forces a CSR bailout during static prerender, so the hook lives in an inner
// component behind Suspense (statically-prerendered pages — screener/alerts/flow — need this).
export function AppNav() {
  return (
    <Suspense fallback={<nav className="appnav" aria-label="Primary" />}>
      <AppNavInner />
    </Suspense>
  );
}

function AppNavInner() {
  const path = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const t = useT();
  // The research/fundamentals MegaPane lives in TerminalShell and strips its ?pane= via
  // history.replaceState on close — invisible to useSearchParams, so a URL-derived highlight left
  // "Analyst" lit after the pane was closed. Track the REAL overlay state from the mm:pane-state
  // event TerminalShell broadcasts (fires on open AND close); the URL param only seeds the initial
  // highlight for a deep-linked ?pane= load.
  const [paneOpen, setPaneOpen] = useState(() => path.startsWith("/terminal") && !!params.get("pane"));
  useEffect(() => {
    const h = (e: Event) => setPaneOpen(!!(e as CustomEvent).detail);
    window.addEventListener("mm:pane-state", h);
    return () => window.removeEventListener("mm:pane-state", h);
  }, []);
  const activeKey = path.startsWith("/screener") ? "screener" : path.startsWith("/scripts") ? "scripts"
    : path.startsWith("/portfolio") ? "portfolio" : path.startsWith("/alerts") ? "alerts"
    : path.startsWith("/flow") ? "flow"
    : path.startsWith("/heatmap") ? "heatmap"
    : (path.startsWith("/terminal") && paneOpen) ? "analyst" : "chart";
  const openAI = () => { if (path.startsWith("/terminal")) window.dispatchEvent(new CustomEvent("mm:copilot")); else router.push("/terminal?ai=1"); };
  return (
    <nav className="appnav" aria-label="Primary">
      {TOP.map((it) => {
        const on = it.k === activeKey;
        return (
          <Tip key={it.k} label={t(it.k, it.label)} side="right" size="mini">
            <Link href={it.href} onClick={path.startsWith("/terminal") ? (it.k === "analyst" ? () => window.dispatchEvent(new CustomEvent("mm:open-pane", { detail: "overview" })) : it.k === "chart" ? () => window.dispatchEvent(new CustomEvent("mm:close-pane")) : undefined) : undefined} className={`navbtn${on ? " on" : ""}`} aria-current={on ? "page" : undefined} aria-label={t(it.k, it.label)}><Glyph k={it.k} /></Link>
          </Tip>
        );
      })}
      <div className="gap" />
      <Tip label={t("ai")} side="right" size="mini">
        <button className="navbtn" onClick={openAI} aria-label={t("ai")}><Glyph k="ai" /></button>
      </Tip>
    </nav>
  );
}
