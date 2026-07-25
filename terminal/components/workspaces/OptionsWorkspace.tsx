"use client";
import { useCallback, useEffect, useState } from "react";
import WorkspaceTabs, { type WorkspaceTab } from "@/components/chrome/WorkspaceTabs";
import OptionsHubView, { type TabKey } from "@/components/OptionsHubView";
import { useLang } from "@/lib/i18n";

/**
 * Options workspace composer (Wave-3 IA) — the `/options` body (renamed from the
 * former Research page).
 *
 * Renders the ONE sub-nav (WorkspaceTabs) above the OptionsHubView engine and
 * owns the `?tab=` URL state (shallow, via window.history.replaceState — the
 * codebase idiom that dodges the useSearchParams CSR-bailout; officially blessed
 * by Next 16 app-router "shallow routing"). The hub runs CONTROLLED: this
 * composer is the single writer of the active tab.
 *
 * Tab registry order per spec:
 *   tape · desk · tide · tickers · vol (Options Screener) · gex · prism · prophet.
 * (Fundamentals was here as a cross-jump chip; it graduated to the standalone
 * /analysis page. A stray ?tab=fundamentals now redirects there — see below.)
 *
 * Key mapping: the spec's `vol` sub-tab IS the hub's `screener` tab (the Options
 * Screener; the hub folded its old standalone "vol" surface into Tickers). Both
 * `?tab=vol` and `?tab=screener` (arriving from the /flow→/options redirect
 * passthrough) select that one tab. `leaders`/`radar` moved to Discover and are
 * force-redirected there before they reach /options; if one still arrives we
 * hard-navigate to /discover so the URL/behaviour stays correct.
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
  surface: "surface",
  prism: "prism",
  prophet: "prophet",
};

// The tabs the hub is allowed to render under Research (canonical hub keys).
const RESEARCH_ALLOWED: TabKey[] = ["tape", "desk", "tide", "tickers", "screener", "gex", "surface", "prism", "prophet"];

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
  { key: "surface", labelKey: "tabSurface" },
  { key: "prism", labelKey: "wtPrism" },
  { key: "prophet", labelKey: "wtProphet" },
];

// Fundamentals is no longer a tab here — it graduated to the standalone /analysis
// page. This href is kept only so a lingering ?tab=fundamentals deep-link (or the
// next.config redirect passthrough) lands on the new page instead of a dead tab.
const FUNDAMENTALS_HREF = "/analysis";

// hub TabKey → the page tab-key WorkspaceTabs highlights (inverse of HUB_KEY for
// the canonical entries; `screener` maps back to the `vol` pill).
const PAGE_KEY: Record<TabKey, string> = {
  tape: "tape", desk: "desk", tide: "tide", tickers: "tickers",
  screener: "vol", gex: "gex", surface: "surface", prism: "prism", prophet: "prophet",
  leaders: "tape", radar: "tape", // never shown here (redirected to Discover)
};

export default function OptionsWorkspace() {
  const { lang } = useLang();
  const [hubTab, setHubTab] = useState<TabKey>(DEFAULT_TAB);

  // Seed from ?tab= on mount (client-only read — mirrors AppNav's deliberate
  // avoidance of useSearchParams so this page can stay static-prerenderable).
  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get("tab");
    // leaders/radar belong to Discover — a passthrough that slipped past the
    // redirect gets forwarded there (preserves the ex-Flow deep-link contract).
    if (raw === "leaders" || raw === "radar") {
      window.location.replace(`/discover?tab=${raw}`);
      return;
    }
    // fundamentals is a cross-jump, not a hub tab — a cold /research?tab=fundamentals
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
  // key so the URL reads /research?tab=vol, not ...=screener).
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
  // through WorkspaceTabs — sync ?tab= too so a copied /research URL reproduces
  // what's on screen (review P2: the drill left the URL on the pre-drill tab).
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
        allowedTabs={RESEARCH_ALLOWED}
        activeTab={hubTab}
        onTab={onHubTab}
        hideTabStrip
      />
    </main>
  );
}
