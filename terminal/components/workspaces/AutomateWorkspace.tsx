"use client";
import { useCallback, useEffect, useState } from "react";
import WorkspaceTabs, { type WorkspaceTab } from "@/components/chrome/WorkspaceTabs";
import AlertsView from "@/components/AlertsView";
import PineEditor from "@/components/PineEditor";
import { useLang } from "@/lib/i18n";

type Script = { id: string; name: string; source: string; lang: string; params: Record<string, any>; updated_at: string; locked?: boolean };

/**
 * Automate workspace composer (Wave-2 IA) — the `/automate` body.
 *
 * Sub-tabs (spec order): alerts (ex-/alerts) · scripts (Pine Scripts, ex-/scripts).
 * Owns `?tab=` (shallow, window.history.replaceState). Default = alerts.
 *
 * Scripts data (saved scripts, is_pro, email) is server-loaded by the page and
 * passed down — PineEditor is unchanged (still `{ scripts, isPro, email }`). Both
 * AlertsView and PineEditor bring their own <main className="main2">, so this
 * composer's root is a <div className="main2"> grid cell + a scoped rule that lets
 * the active view fill the remaining height (same pattern as DiscoverWorkspace).
 *
 * PineEditor stays keep-alive-free (unmounted when not active) — matching its
 * standalone /scripts behaviour; its ?id= deep-link + Pine host tear-down on
 * unmount are preserved verbatim.
 */

const TABS: WorkspaceTab[] = [
  { key: "alerts", labelKey: "wtAlerts" },
  { key: "scripts", labelKey: "wtScripts" },
];

const KEYS = new Set(["alerts", "scripts"]);
const DEFAULT_TAB = "alerts";

export default function AutomateWorkspace({
  email,
  isPro,
  scripts,
}: {
  email: string;
  isPro: boolean;
  scripts: Script[];
}) {
  const { lang } = useLang();
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
      <style>{".ws-shell > .ws-body{flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden}.ws-shell .ws-body > .main2{flex:1;min-height:0}"}</style>
      <div style={{ display: "flex", alignItems: "center", padding: "8px 14px", borderBottom: "1px solid var(--line)", flexShrink: 0, gap: 8 }}>
        <WorkspaceTabs
          tabs={TABS}
          active={tab}
          onSelect={onSelect}
          aria-label={lang === "zh" ? "自动化选项卡" : "Automate tabs"}
        />
      </div>

      <div className="ws-body">
        {tab === "alerts" && <AlertsView email={email} />}
        {tab === "scripts" && <PineEditor scripts={scripts} isPro={isPro} email={email} />}
      </div>
    </div>
  );
}
