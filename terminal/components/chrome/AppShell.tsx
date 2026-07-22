"use client";
import { createContext, useContext } from "react";
import { usePathname } from "next/navigation";
import { BrandLockup } from "@/components/BrandMark";
import { AppNav } from "@/components/AppNav";
import MobileNav from "@/components/MobileNav";
import SettingsMenu from "@/components/SettingsMenu";
import { useLang, useT } from "@/lib/i18n";

/**
 * AppShell — the ONE shared chrome for every non-chart (shell) workspace
 * (Screener / Options Flow / Alerts / Scripts / Portfolio / Admin).
 *
 * Generalizes Wave-1's FlowChrome (app/flow/FlowChrome.tsx) from an Options-only
 * shell into a `{ email, children }` chrome owned by the route-group layout
 * app/(shell)/layout.tsx. It renders the .app2 grid + MobileNav + topbar
 * (BrandLockup + page title + spacer + lang toggle) + AppNav, and drops the
 * page's stripped, content-only .main2 subtree into the grid.
 *
 * Because the chrome lives OUTSIDE the page tree, a crash in any workspace view
 * surfaces the route error boundary INSIDE .main2 while logo + nav stay put.
 *
 * The Wave-1 layout fix is preserved verbatim: the root carries `obs obs-ambient`
 * and observatory.css pins .topbar/.appnav/.main2 to explicit grid cells + restores
 * position:fixed on the MobileNav drawer/scrim. Views must NOT reintroduce chrome.
 *
 * Title: resolved from a pathname→i18n-key map for the five workspaces. Falls back
 * to the workspace label so it renders even before the NAV lane lands the new keys.
 */

// email flows from the server (shell) layout (resolved once) down to any client
// child that needs it (e.g. a view's sign-out affordance) without prop-drilling.
const AppShellEmailCtx = createContext<string>("");
export function useShellEmail() {
  return useContext(AppShellEmailCtx);
}

// pathname prefix → [i18n key, english fallback]. Order matters: first match wins.
// Chart (/terminal) has its own shell and is intentionally absent — as is Research,
// which opens as the in-shell MegaPane over the chart (also not a (shell) route).
const TITLE_MAP: Array<[string, string, string]> = [
  ["/screener", "screener", "Screener"],
  ["/options", "options", "Options Flow"],
  ["/alerts", "alerts", "Alerts"],
  ["/scripts", "scripts", "Scripts"],
  ["/portfolio", "pagePortfolio", "Portfolio"],
  ["/admin", "pageAdmin", "Admin"],
];

export default function AppShell({
  email = "",
  children,
}: {
  email?: string;
  children: React.ReactNode;
}) {
  const t = useT();
  const { lang, setLang } = useLang();
  const path = usePathname();
  const hit = TITLE_MAP.find(([p]) => path.startsWith(p));
  // Every (shell) route is in TITLE_MAP; the fallback only fires for an unknown route.
  const title = hit ? t(hit[1], hit[2]) : "";

  return (
    <AppShellEmailCtx.Provider value={email}>
      <div className="app2 obs obs-ambient">
        <MobileNav email={email} />
        <header className="topbar">
          <BrandLockup />
          <div className="tdiv" />
          <span className="page-title">{title}</span>
          <div className="spacer" />
          <button
            className="chip"
            style={{ marginLeft: 8 }}
            onClick={() => setLang(lang === "zh" ? "en" : "zh")}
            title={lang === "zh" ? "Switch to English" : "切换中文"}
          >
            {lang === "zh" ? "EN" : "中文"}
          </button>
          {/* Desktop settings/sign-out — the old per-view topbars each carried an avatar
              sign-out form; MobileNav's SettingsMenu is display:none on desktop, so the
              shell must render its own (review P1: dropped desktop sign-out). */}
          <SettingsMenu email={email} />
        </header>
        <AppNav />
        {children}
      </div>
    </AppShellEmailCtx.Provider>
  );
}
