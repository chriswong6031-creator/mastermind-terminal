"use client";
import { useCallback, useEffect, useState } from "react";
import WorkspaceTabs, { type WorkspaceTab } from "@/components/chrome/WorkspaceTabs";
import OptionsHubView, { type TabKey } from "@/components/OptionsHubView";
import { useLang } from "@/lib/i18n";

/**
 * Options Flow workspace composer — the `/options` body.
 *
 * This is the ex-/research (ex-Wave-1 /flow) OptionsHubView engine, now its own
 * top-level sidebar destination. Renders the ONE sub-nav (WorkspaceTabs) above the
 * hub and owns the `?tab=` URL state (shallow, via window.history.replaceState —
 * the app-router idiom that dodges the useSearchParams CSR-bailout). The hub runs
 * CONTROLLED: this composer is the single writer of the active tab.
 *
 * Tab registry order:
 *   tape · desk · tide · tickers · vol (Options Screener) · gex · prism · prophet
 *   · leaders · radar · fundamentals (a cross-JUMP to /terminal?pane=overview —
 *   not a hub tab).
 *
 * Leaders/Radar live HERE (they moved off the Wave-2 Discover hub when the flat
 * sidebar restored granular workspaces) — they're native hub tabs, so their row →
 * ticker-drill cross-jump works without a separate mount.
 *
 * Key mapping: the spec's `vol` sub-tab IS the hub's `screener` tab (the Options
 * Screener). Both `?tab=vol` and `?tab=screener` (arriving from a legacy
 * redirect passthrough) select that one tab.
 */

// page tab-key → hub TabKey (identity except `vol` → `screener` and the
// non-hub `fundamentals` cross-jump, handled separately below).
const HUB_KEY: Record<string, TabKey> = {
  tape: "tape",
  desk: "desk",
  tide: "tide",
  tickers: "tickers",
  vol: "screener",
  screener: "screener", // legacy flow ?tab=screener alias
  gex: "gex",
  prism: "prism",
  prophet: "prophet",
  leaders: "leaders",
  radar: "radar",
};

// The tabs the hub is allowed to render under Options (canonical hub keys).
const OPTIONS_ALLOWED: TabKey[] = ["tape", "desk", "tide", "tickers", "screener", "gex", "prism", "prophet", "leaders", "radar"];

const DEFAULT_TAB: TabKey = "tape";

// WorkspaceTabs registry (page keys → i18n label keys). `fundamentals` is a
// cross-jump chip, not a hub tab — it deep-links the chart's fundamentals pane.
const TABS: WorkspaceTab[] = [
  { key: "tape", labelKey: "wtOptionsTape" },
  { key: "desk", labelKey: "wtFlowDesk" },
  { key: "tide", labelKey: "wtTide" },
  { key: "tickers", labelKey: "wtTickers" },
  { key: "vol", labelKey: "wtOptionsScreener" },
  { key: "gex", labelKey: "wtGex" },
  { key: "prism", labelKey: "wtPrism" },
  { key: "prophet", labelKey: "wtProphet" },
  { key: "leaders", labelKey: "wtLeaders" },
  { key: "radar", labelKey: "wtRadar" },
  { key: "fundamentals", labelKey: "wtFundamentals" },
];

const FUNDAMENTALS_HREF = "/terminal?pane=overview";

// hub TabKey → the page tab-key WorkspaceTabs highlights (inverse of HUB_KEY for
// the canonical entries; `screener` maps back to the `vol` pill).
const PAGE_KEY: Record<TabKey, string> = {
  tape: "tape", desk: "desk", tide: "tide", tickers: "tickers",
  screener: "vol", vol: "vol", gex: "gex", prism: "prism", prophet: "prophet",
  leaders: "leaders", radar: "radar",
};

export default function OptionsWorkspace() {
  const { lang } = useLang();
  const [hubTab, setHubTab] = useState<TabKey>(DEFAULT_TAB);

  // Seed from ?tab= on mount (client-only read — mirrors AppNav's deliberate
  // avoidance of useSearchParams so this page can stay static-prerenderable).
  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get("tab");
    // fundamentals is a cross-jump, not a hub tab — a cold /options?tab=fundamentals
    // deep-link lands on the chart's fundamentals pane (matches the pill's action).
    if (raw === "fundamentals") {
      window.location.replace(FUNDAMENTALS_HREF);
      return;
    }
    const mapped = raw ? HUB_KEY[raw] : undefined;
    if (mapped) setHubTab(mapped);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // WorkspaceTabs selection → set hub tab + write ?tab= shallowly (using the page
  // key so the URL reads /options?tab=vol, not ...=screener).
  const onSelect = useCallback((pageKey: string) => {
    if (pageKey === "fundamentals") {
      // Cross-jump to the chart's in-shell fundamentals MegaPane (labeled tab).
      window.location.assign(FUNDAMENTALS_HREF);
      return;
    }
    const hk = HUB_KEY[pageKey];
    if (!hk) return;
    setHubTab(hk);
    const u = new URL(window.location.href);
    u.searchParams.set("tab", pageKey);
    window.history.replaceState(null, "", u.toString());
  }, []);

  const activePageKey = PAGE_KEY[hubTab] ?? "tape";

  // Hub-internal drills (e.g. a Tape row → Tickers) change the tab WITHOUT going
  // through WorkspaceTabs — sync ?tab= too so a copied /options URL reproduces
  // what's on screen.
  const onHubTab = useCallback((tab: TabKey) => {
    setHubTab(tab);
    const pageKey = PAGE_KEY[tab];
    if (!pageKey) return;
    const u = new URL(window.location.href);
    u.searchParams.set("tab", pageKey);
    window.history.replaceState(null, "", u.toString());
  }, []);

  return (
    <main className="main2" style={{ overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", padding: "8px 14px", borderBottom: "1px solid var(--line)", flexShrink: 0, gap: 8 }}>
        <WorkspaceTabs
          tabs={TABS}
          active={activePageKey}
          onSelect={onSelect}
          aria-label={lang === "zh" ? "期权选项卡" : "Options tabs"}
        />
      </div>
      <OptionsHubView
        allowedTabs={OPTIONS_ALLOWED}
        activeTab={hubTab}
        onTab={onHubTab}
        hideTabStrip
      />
    </main>
  );
}
