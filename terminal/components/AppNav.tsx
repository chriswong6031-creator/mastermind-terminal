"use client";
import Link from "next/link";
import { Suspense } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useT } from "@/lib/i18n";
import { Tip } from "@/components/ui/Tip";

// Line glyphs — all share the 24-box, 1.7-stroke, fill:none house style (.navbtn svg).
// Multi-path keys draw each `d` as a stacked <path>; a few workspaces need composite
// primitives (arc + line + blip, etc.) and render inline below.
const ICON: Record<string, string[]> = {
  chart: ["M3 17l5-6 4 3 4-7 5 9", "M3 21h18"],
  portfolio: ["M21 12a9 9 0 1 1-9-9v9z"],
  ai: ["M12 2l2.2 5.8L20 10l-5.8 2.2L12 18l-2.2-5.8L4 10l5.8-2.2z"],
};

export function Glyph({ k }: { k: string }) {
  // Discover — radar scan: one open concentric arc (the sweep boundary) + a sweep line
  // from center out to a blip on the ring. "Scan the market for setups" reads truer than
  // a literal compass rose, and stays legible at 20px.
  if (k === "discover")
    return (
      <svg viewBox="0 0 24 24">
        <path d="M12 4a8 8 0 1 1-8 8" />
        <path d="M8 8a5.5 5.5 0 1 0 4-2" />
        <path d="M12 12l5.5-4" />
        <circle cx="17.5" cy="8" r="1.15" fill="currentColor" stroke="none" />
      </svg>
    );
  // Research — layered depth lens: a magnifier whose lens holds stacked strata (market
  // depth / order-book layers, seen through analysis). Deliberately NOT a flask.
  if (k === "research")
    return (
      <svg viewBox="0 0 24 24">
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="M7 9h7M7.5 12h6M9 15h3" />
        <path d="M15.5 15.5L21 21" />
      </svg>
    );
  // Automate — bolt inside a loop: a lightning bolt wrapped by a partial circular arrow.
  // "Energy that runs on repeat" — set-and-forget.
  if (k === "automate")
    return (
      <svg viewBox="0 0 24 24">
        <path d="M20 12a8 8 0 1 1-2.3-5.6" />
        <path d="M17.6 3.5v3.4h-3.4" />
        <path d="M12.5 7l-3.5 5h3l-1 4 4.5-6h-3z" />
      </svg>
    );
  return (<svg viewBox="0 0 24 24">{(ICON[k] ?? []).map((d, i) => <path key={i} d={d} />)}</svg>);
}

// The single source of truth for the primary nav. Exported so the mobile drawer (MobileNav)
// derives its items from the SAME list — the two nav surfaces can't drift. Wave-2: navigate
// by JOB (find → analyze → automate → review), not by internal model name.
export const TOP = [
  { k: "chart", label: "Chart", href: "/terminal" },
  { k: "discover", label: "Discover", href: "/discover" },
  { k: "research", label: "Research", href: "/research" },
  { k: "automate", label: "Automate", href: "/automate" },
  { k: "portfolio", label: "Portfolio", href: "/portfolio" },
];

// useSearchParams() forces a CSR bailout during static prerender; the primary nav no longer
// reads params (active key is pure path-prefix), but the Suspense boundary is retained so the
// nav keeps rendering a stable fallback while the shell hydrates.
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
  // Active key = path prefix per workspace. Chart is the default/center. The old Analyst
  // mm:pane-state special case is gone — fundamentals is reachable from the chart rail and
  // Research › fundamentals, so the pane no longer owns a top-level highlight.
  const activeKey = path.startsWith("/discover") ? "discover"
    : path.startsWith("/research") ? "research"
    : path.startsWith("/automate") ? "automate"
    : path.startsWith("/portfolio") ? "portfolio"
    : "chart";
  const openAI = () => { if (path.startsWith("/terminal")) window.dispatchEvent(new CustomEvent("mm:copilot")); else router.push("/terminal?ai=1"); };
  return (
    <nav className="appnav" aria-label="Primary">
      {TOP.map((it) => {
        const on = it.k === activeKey;
        return (
          <Tip key={it.k} label={t(it.k, it.label)} side="right" size="mini">
            <Link
              href={it.href}
              onClick={path.startsWith("/terminal") && it.k === "chart" ? () => window.dispatchEvent(new CustomEvent("mm:close-pane")) : undefined}
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
