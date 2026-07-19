"use client";
import { BrandLockup } from "@/components/BrandMark";
import { AppNav } from "@/components/AppNav";
import MobileNav from "@/components/MobileNav";
import { useLang, useT } from "@/lib/i18n";

/**
 * Persistent chrome for the /flow route, owned by app/flow/layout.tsx.
 *
 * Lifted from OptionsHubView (the .app2 grid + MobileNav + topbar + AppNav) so
 * the chrome lives OUTSIDE the view tree: a crash in OptionsHubView now renders
 * the route error boundary inside .main2 while the logo + nav stay put.
 *
 * View-coupled header bits (live-feed status / as-of stamp) were NOT lifted —
 * they depend on OptionsHubView's own feed state and now render in the tab-bar
 * row inside .main2. The lang toggle stays here because it reads app-wide
 * LangProvider context, not view state.
 */
export default function FlowChrome({ children }: { children: React.ReactNode }) {
  const t = useT();
  const { lang, setLang } = useLang();
  return (
    <div className="app2 obs obs-ambient">
      <MobileNav email="" />
      <header className="topbar">
        <BrandLockup />
        <div className="tdiv" />
        <span className="page-title">{t("flow", "Options")}</span>
        <div className="spacer" />
        <button
          className="chip"
          style={{ marginLeft: 8 }}
          onClick={() => setLang(lang === "zh" ? "en" : "zh")}
          title={lang === "zh" ? "Switch to English" : "切换中文"}
        >
          {lang === "zh" ? "EN" : "中文"}
        </button>
      </header>
      <AppNav />
      {children}
    </div>
  );
}
