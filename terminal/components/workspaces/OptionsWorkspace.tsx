"use client";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import WorkspaceTabs, { type WorkspaceTab } from "@/components/chrome/WorkspaceTabs";
import OptionsHubView, { type TabKey } from "@/components/OptionsHubView";
import { useLang } from "@/lib/i18n";

/**
 * Options workspace composer (Wave-3 IA) — the `/options` body (renamed from the
 * former Research page).
 *
 * Renders the ONE sub-nav (WorkspaceTabs) above the OptionsHubView engine and
 * owns the `?tab=` URL state. READS resolve synchronously at first render via
 * useSearchParams — safe here because /options is always dynamically rendered
 * (the (shell) layout is force-dynamic and the page performs an entitlement
 * read), so there is no static-prerender CSR-bailout to dodge and the SERVER
 * already renders the deep-linked tab. WRITES stay shallow via
 * window.history.replaceState (Next 16 app-router "shallow routing"). The hub
 * runs CONTROLLED: this composer is the single writer of the active tab.
 *
 * Tab registry order per spec:
 *   tape · desk · tide · tickers · vol (Options Screener) · gex · surface ·
 *   structure · volatility · prophet.
 * (PRISM was retired in masterplan §5.3 — merged into the Exposure desk's matrix view.
 * `?tab=prism` is now an alias onto `gex`; see HUB_KEY.)
 * NOTE the two distinct keys: `vol` is a load-bearing legacy alias for the Options
 * SCREENER (do not touch); `volatility` is the R3 Volatility tab (IV rank / term /
 * skew, per-root options_hub.vol payloads); `structure` is the R3 OI suite
 * (options_hub.oi_time/max_pain/oi_change payloads), ordered before Volatility
 * per the masterplan §5 category order.
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
  // §5.3: PRISM retired into the Exposure desk. Old deep-links keep working — they
  // land on `gex`, and GexDeskView opens on its MATRIX view (it reads ?tab=prism too).
  prism: "gex",
  structure: "structure",
  volatility: "volatility",
  positioning: "positioning",
  prophet: "prophet",
};

// The tabs the hub is allowed to render under Research (canonical hub keys).
const RESEARCH_ALLOWED: TabKey[] = ["tape", "desk", "tide", "tickers", "screener", "gex", "surface", "structure", "volatility", "positioning", "prophet"];

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
  { key: "structure", labelKey: "wtStructure" },
  { key: "volatility", labelKey: "wtVolatility" },
  { key: "positioning", labelKey: "wtPositioning" },
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
  screener: "vol", gex: "gex", surface: "surface",
  structure: "structure", volatility: "volatility", positioning: "positioning", prophet: "prophet",
  leaders: "tape", radar: "tape", // never shown here (redirected to Discover)
};

export default function OptionsWorkspace() {
  const { lang } = useLang();

  // The deep-linked tab derives SYNCHRONOUSLY from ?tab= — the server renders
  // the requested tab and hydration starts on it, so a cold /options?tab=X can
  // never paint (or fetch) the default tab first. The former post-mount
  // window.location.search → setState seed intermittently lost the deep-link
  // and was the react-hooks/set-state-in-effect finding.
  const searchParams = useSearchParams();
  const rawTab = searchParams.get("tab");
  const [hubTab, setHubTab] = useState<TabKey>(() => (rawTab && HUB_KEY[rawTab]) || DEFAULT_TAB);

  // leaders/radar belong to Discover and fundamentals to /analysis — forward a
  // deep-link that slipped past the next.config redirects (preserves the
  // ex-Flow contract). Pure navigation side effect; no state writes here.
  useEffect(() => {
    if (rawTab === "leaders" || rawTab === "radar") {
      window.location.replace(`/discover?tab=${rawTab}`);
    } else if (rawTab === "fundamentals") {
      window.location.replace(FUNDAMENTALS_HREF);
    }
  }, [rawTab]);

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
