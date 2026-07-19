"use client";
import { useState } from "react";
import OptionsHubView from "@/components/OptionsHubView";
import type { TabKey } from "@/components/OptionsHubView";

/**
 * Discover mount points for the two ex-Flow tabs that moved to the Discover
 * workspace (Wave-2 IA): Leaders and Leader Radar.
 *
 * Both reuse the SAME OptionsHubView engine, restricted to a single tab via
 * `allowedTabs`, so the exact data hooks + render + the row → Tickers-drill
 * cross-jump are preserved verbatim (no feature rewrite — this is a nav wave).
 * `allowedTabs={["leaders"]}` implicitly also enables the `tickers` tab inside
 * the engine (see OptionsHubView) so clicking a leader still drills into the
 * ticker view exactly as it did under Options › Leaders.
 *
 * The engine is run CONTROLLED with LOCAL state (not the Discover URL): the
 * Discover page's `?tab=` selects WHICH mount renders, while the internal
 * leaders/radar → tickers drill flips this local `tab` only. That keeps the
 * hub's Tickers drill working without ever writing a `?tab=tickers` value onto
 * the Discover URL (which Discover's own WorkspaceTabs wouldn't recognise).
 * The internal tab strip stays hidden — Discover's WorkspaceTabs is the only sub-nav.
 *
 * Because every fetch in the engine is gated on the active tab, only the
 * leaders/radar (+ tickers-on-drill) data loads — the rest never mount or fetch.
 */

export function DiscoverLeadersMount() {
  const [tab, setTab] = useState<TabKey>("leaders");
  return (
    <OptionsHubView
      allowedTabs={["leaders"]}
      activeTab={tab}
      onTab={setTab}
      hideTabStrip
    />
  );
}

export function DiscoverRadarMount() {
  const [tab, setTab] = useState<TabKey>("radar");
  return (
    <OptionsHubView
      allowedTabs={["radar"]}
      activeTab={tab}
      onTab={setTab}
      hideTabStrip
    />
  );
}
