"use client";
/**
 * HeatmapPageRoot.tsx — shell wrapper for the /heatmap route.
 *
 * Uses the same app2 shell as /flow (OptionsHubView): topbar + AppNav sidebar
 * + main.main2 content area, so the user can navigate to other pages.
 *
 * P0 FIX: previous page.tsx rendered HeatmapView standalone (no nav).
 */

import { useLang } from "@/lib/i18n";
import { BrandLockup } from "@/components/BrandMark";
import { AppNav } from "@/components/AppNav";
import { HeatmapView } from "./HeatmapView";

export default function HeatmapPageRoot() {
  const { lang, setLang } = useLang();

  return (
    <div className="app2 obs obs-ambient">
      <header className="topbar">
        <BrandLockup />
        <div className="tdiv" />
        <span className="page-title">{lang === "zh" ? "热力图" : "Heatmap"}</span>
        <div className="spacer" />
        <button
          className="chip"
          style={{ marginLeft: 8 }}
          onClick={() => setLang(lang === "zh" ? "en" : "zh")}
        >
          {lang === "zh" ? "EN" : "中文"}
        </button>
      </header>

      <AppNav />

      <main className="main2" style={{ overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <HeatmapView />
      </main>
    </div>
  );
}
