"use client";
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useT } from "@/lib/i18n";
import { Tip } from "@/components/ui/Tip";

// Line glyphs — all share the 24-box, 1.7-stroke, fill:none house style (.navbtn svg).
// Multi-path keys draw each `d` as a stacked <path>; a few items need composite
// primitives (grid rects, flow polylines) and render inline below.
const ICON: Record<string, string[]> = {
  chart: ["M3 17l5-6 4 3 4-7 5 9", "M3 21h18"],
  scripts: ["M8 7l-5 5 5 5M16 7l5 5-5 5"],
  portfolio: ["M21 12a9 9 0 1 1-9-9v9z"],
  alerts: ["M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"],
  ai: ["M12 2l2.2 5.8L20 10l-5.8 2.2L12 18l-2.2-5.8L4 10l5.8-2.2z"],
};

export function Glyph({ k }: { k: string }) {
  // Research — layered depth lens: a magnifier whose lens holds stacked strata
  // (fundamentals / analysis layers). Opens the full per-stock analysis dashboard
  // (the MegaPane) over the chart. Deliberately NOT a flask.
  if (k === "research")
    return (
      <svg viewBox="0 0 24 24">
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="M7 9h7M7.5 12h6M9 15h3" />
        <path d="M15.5 15.5L21 21" />
      </svg>
    );
  // Screener — a 2×2 scan grid: the market swept cell by cell for setups.
  if (k === "screener")
    return (<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>);
  // Options Flow — two stacked polylines tracing call/put premium flow.
  if (k === "options")
    return (<svg viewBox="0 0 24 24"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" /></svg>);
  return (<svg viewBox="0 0 24 24">{(ICON[k] ?? []).map((d, i) => <path key={i} d={d} />)}</svg>);
}

// The single source of truth for the primary nav. Exported so the mobile drawer (MobileNav)
// derives its items from the SAME list — the two nav surfaces can't drift. Order top→bottom:
// Chart · Research · Screener · Options Flow · Alerts · Scripts · Portfolio.
//
// Research points at the chart's in-shell analysis dashboard (?pane=overview → MegaPane);
// it is a sibling of Chart, not a separate route — see the mm:open-pane handling below.
export const TOP = [
  { k: "chart", label: "Chart", href: "/terminal" },
  { k: "research", label: "Research", href: "/terminal?pane=overview" },
  { k: "screener", label: "Screener", href: "/screener" },
  { k: "options", label: "Options Flow", href: "/options" },
  { k: "alerts", label: "Alerts", href: "/alerts" },
  { k: "scripts", label: "Scripts", href: "/scripts" },
  { k: "portfolio", label: "Portfolio", href: "/portfolio" },
];

// The primary nav no longer reads params for its active key (it's pure path-prefix +
// the mm:pane-state event), but the Suspense boundary is retained so the nav keeps
// rendering a stable fallback while the shell hydrates.
export function AppNav() {
  return (
    <Suspense fallback={<nav className="appnav" aria-label="Primary" />}>
      <AppNavInner />
    </Suspense>
  );
}

function AppNavInner() {
  const path = usePathname();
  const router = useRouter();
  const t = useT();

  // Research (the per-stock analysis MegaPane) lives in TerminalShell and strips its
  // ?pane= via history.replaceState on close — invisible to usePathname. Track the REAL
  // overlay state from the mm:pane-state event TerminalShell broadcasts (fires on open
  // AND close). Seed the initial highlight from the URL on mount (client-only read, so we
  // keep the nav's static-prerender CSR-bailout dodge — no useSearchParams).
  const [paneOpen, setPaneOpen] = useState(false);
  useEffect(() => {
    try {
      const p = new URLSearchParams(window.location.search).get("pane");
      if (window.location.pathname.startsWith("/terminal") && p) setPaneOpen(true);
    } catch {}
    const h = (e: Event) => setPaneOpen(!!(e as CustomEvent).detail);
    window.addEventListener("mm:pane-state", h);
    return () => window.removeEventListener("mm:pane-state", h);
  }, []);

  // Active key = path prefix per workspace. On the chart, Research lights while the
  // analysis pane is open (else Chart). Chart is the default/center.
  const activeKey = path.startsWith("/screener") ? "screener"
    : path.startsWith("/options") ? "options"
    : path.startsWith("/alerts") ? "alerts"
    : path.startsWith("/scripts") ? "scripts"
    : path.startsWith("/portfolio") ? "portfolio"
    : (path.startsWith("/terminal") && paneOpen) ? "research"
    : "chart";

  const openAI = () => { if (path.startsWith("/terminal")) window.dispatchEvent(new CustomEvent("mm:copilot")); else router.push("/terminal?ai=1"); };

  // On the chart, Research/Chart toggle the MegaPane via custom events (no navigation —
  // the pane lives in TerminalShell, and re-clicking a href to the SAME path wouldn't
  // re-fire the deep-link effect). From any other workspace the <Link> href carries the
  // deep-link (?pane=overview) and TerminalShell opens the pane on arrival.
  const onNavClick = (k: string): (() => void) | undefined => {
    if (!path.startsWith("/terminal")) return undefined;
    if (k === "research") return () => window.dispatchEvent(new CustomEvent("mm:open-pane", { detail: "overview" }));
    if (k === "chart") return () => window.dispatchEvent(new CustomEvent("mm:close-pane"));
    return undefined;
  };

  return (
    <nav className="appnav" aria-label="Primary">
      {TOP.map((it) => {
        const on = it.k === activeKey;
        return (
          <Tip key={it.k} label={t(it.k, it.label)} side="right" size="mini">
            <Link
              href={it.href}
              onClick={onNavClick(it.k)}
              className={`navbtn${on ? " on" : ""}`}
              aria-current={on ? "page" : undefined}
              aria-label={t(it.k, it.label)}
            ><Glyph k={it.k} /></Link>
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
