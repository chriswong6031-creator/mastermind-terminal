"use client";
import { createContext, useContext } from "react";
import { usePathname } from "next/navigation";
import { BrandLockup } from "@/components/BrandMark";
import { AppNav } from "@/components/AppNav";
import MobileNav from "@/components/MobileNav";
import SettingsMenu from "@/components/SettingsMenu";
import { OnboardingProvider } from "@/components/onboarding/OnboardingProvider";
import { useT } from "@/lib/i18n";

/**
 * AppShell — the ONE shared chrome for every non-chart workspace (Wave-2 IA).
 *
 * Generalizes Wave-1's FlowChrome (app/flow/FlowChrome.tsx) from an Options-only
 * shell into a `{ email, children }` chrome owned by the route-group layout
 * app/(shell)/layout.tsx. It renders the .app2 grid + MobileNav + topbar
 * (BrandLockup + page title + spacer + Settings) + AppNav, and drops the
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
// Chart (/terminal) has its own shell and is intentionally absent.
const TITLE_MAP: Array<[string, string, string]> = [
  ["/analysis", "analysis", "Analysis"],
  ["/discover", "discover", "Discover"],
  ["/options", "options", "Options"],
  ["/scripts", "scripts", "Scripts"],
  ["/alerts", "alerts", "Alerts"],
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
  const path = usePathname();
  const hit = TITLE_MAP.find(([p]) => path.startsWith(p));
  const title = hit ? t(hit[1], hit[2]) : t("flow", "Options");

  return (
    <AppShellEmailCtx.Provider value={email}>
      <OnboardingProvider email={email}>
      <div className="app2 obs obs-ambient">
        <MobileNav email={email} />
        <header className="topbar">
          <BrandLockup />
          <div className="tdiv" />
          <span className="page-title">{title}</span>
          <div className="spacer" />
          {/* Desktop settings/sign-out — the old per-view topbars each carried an avatar
              sign-out form; MobileNav's SettingsMenu is display:none on desktop, so the
              shell must render its own (review P1: dropped desktop sign-out). */}
          <SettingsMenu email={email} />
        </header>
        <AppNav />
        {children}
      </div>
      </OnboardingProvider>
    </AppShellEmailCtx.Provider>
  );
}
