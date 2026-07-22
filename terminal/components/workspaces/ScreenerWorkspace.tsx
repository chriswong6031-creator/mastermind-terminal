"use client";
import { useCallback, useEffect, useState } from "react";
import WorkspaceTabs, { type WorkspaceTab } from "@/components/chrome/WorkspaceTabs";
import ScreenerView from "@/components/ScreenerView";
import HeatmapPageRoot from "@/components/heatmap/HeatmapPageRoot";
import { useShellEmail } from "@/components/chrome/AppShell";
import { useLang } from "@/lib/i18n";

/**
 * Screener workspace composer — the `/screener` body.
 *
 * Sub-tabs: screener (Stock Screener, ex-/screener) · heatmap (ex-/heatmap). Owns
 * `?tab=` (shallow, window.history.replaceState — the app-router idiom that avoids
 * the useSearchParams CSR-bailout). Default = screener. Leaders/Radar are NOT here
 * (they moved to Options Flow when the flat sidebar restored granular workspaces).
 *
 * ── Layout note (nested .main2) ──────────────────────────────────────────────
 * AppShell mounts this page's root element straight into the .app2 grid, so the
 * root must BE the .main2 grid cell. ScreenerView / HeatmapPageRoot each emit their
 * own <main className="main2">; to host them under a tab strip without a rewrite,
 * this composer's root is a <div className="main2"> (the grid cell) and a scoped
 * style makes the inner view fill the remaining height (the .app2>.main2 `flex:1`
 * rule doesn't reach a nested .main2). Only one <main> is ever visible at a time,
 * so the a11y landmark stays singular.
 */

const TABS: WorkspaceTab[] = [
  { key: "screener", labelKey: "wtStockScreener" },
  { key: "heatmap", labelKey: "wtHeatmap" },
];

const KEYS = new Set(["screener", "heatmap"]);
const DEFAULT_TAB = "screener";

export default function ScreenerWorkspace() {
  const { lang } = useLang();
  const email = useShellEmail(); // resolved once by the (shell) layout → AppShell context
  const [tab, setTab] = useState<string>(DEFAULT_TAB);

  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get("tab");
    if (raw && KEYS.has(raw)) setTab(raw);
  }, []);

  const onSelect = useCallback((key: string) => {
    if (!KEYS.has(key)) return;
    setTab(key);
    const u = new URL(window.location.href);
    u.searchParams.set("tab", key);
    window.history.replaceState(null, "", u.toString());
  }, []);

  return (
    <div className="main2 ws-shell" style={{ overflow: "hidden", display: "flex", flexDirection: "column" }}>
      {/* Scoped: let the nested view .main2 fill the cell (see layout note). */}
      <style>{".ws-shell > .ws-body{flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden}.ws-shell .ws-body > .main2{flex:1;min-height:0}"}</style>
      <div style={{ display: "flex", alignItems: "center", padding: "8px 14px", borderBottom: "1px solid var(--line)", flexShrink: 0, gap: 8 }}>
        <WorkspaceTabs
          tabs={TABS}
          active={tab}
          onSelect={onSelect}
          aria-label={lang === "zh" ? "选股选项卡" : "Screener tabs"}
        />
      </div>

      <div className="ws-body">
        {tab === "screener" && <ScreenerView email={email} />}
        {tab === "heatmap" && <HeatmapPageRoot />}
      </div>
    </div>
  );
}
