"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useT } from "@/lib/i18n";

const ICON: Record<string, string[]> = {
  chart: ["M3 17l5-6 4 3 4-7 5 9", "M3 21h18"],
  screener: [], // rects drawn inline
  scripts: ["M8 7l-5 5 5 5M16 7l5 5-5 5"],
  portfolio: ["M21 12a9 9 0 1 1-9-9v9z"],
  alerts: ["M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"],
  ai: ["M12 2l2.2 5.8L20 10l-5.8 2.2L12 18l-2.2-5.8L4 10l5.8-2.2z"],
};
function Glyph({ k }: { k: string }) {
  if (k === "screener")
    return (<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>);
  return (<svg viewBox="0 0 24 24">{ICON[k].map((d, i) => <path key={i} d={d} />)}</svg>);
}

const TOP = [
  { k: "chart", label: "Chart", href: "/terminal" },
  { k: "screener", label: "Screener", href: "/screener" },
  { k: "scripts", label: "Scripts", href: "/scripts" },
  { k: "portfolio", label: "Portfolio", href: "/portfolio" },
  { k: "alerts", label: "Alerts", href: "/alerts" },
];

export function AppNav() {
  const path = usePathname();
  const router = useRouter();
  const t = useT();
  const activeKey = path.startsWith("/screener") ? "screener" : path.startsWith("/scripts") ? "scripts"
    : path.startsWith("/portfolio") ? "portfolio" : path.startsWith("/alerts") ? "alerts" : "chart";
  const openAI = () => { if (path.startsWith("/terminal")) window.dispatchEvent(new CustomEvent("mm:copilot")); else router.push("/terminal?ai=1"); };
  return (
    <nav className="appnav" aria-label="Primary">
      {TOP.map((it) => {
        const on = it.k === activeKey;
        return (
          <Link key={it.k} href={it.href} className={`navbtn${on ? " on" : ""}`} aria-current={on ? "page" : undefined} aria-label={t(it.k, it.label)} data-tip={t(it.k, it.label)}><Glyph k={it.k} /></Link>
        );
      })}
      <div className="gap" />
      <button className="navbtn" onClick={openAI} aria-label={t("ai")} data-tip={t("ai")}><Glyph k="ai" /></button>
    </nav>
  );
}
