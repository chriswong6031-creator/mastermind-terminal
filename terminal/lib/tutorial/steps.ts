/**
 * steps.ts — 6-module tutorial step definitions for the options desk tutorial.
 *
 * HONESTY DOCTRINE (standing constraints on all copy):
 *   - No "validated", "predictive", or "empirically confirmed" language.
 *   - Direction is always ~soft (tick-rule derived, approximate without NBBO).
 *   - Score tiers are descriptive magnitude labels, not win-probability claims.
 *   - GEX sign is the standard dealer convention — an assumption, not a fact.
 *   - Any accruing / experimental feature is labeled honestly.
 *   - "descriptive — not a recommendation" is the standing qualifier on picks.
 *
 * Target selectors:
 *   - All components use inline style objects; no stable className/id hooks exist.
 *   - Selectors below use data-tut="..." attributes.
 *   - NULL targets produce centered modal steps (graceful fallback).
 *   - data-tut attributes the integrator MUST add are listed at the bottom.
 *
 * Step shape:
 *   id:             unique string
 *   module:         1–6
 *   targetSelector: CSS selector | null  (null → centered modal)
 *   placement:      "top" | "bottom" | "left" | "right" | "center"
 *   titleKey:       TutorialKey for the step title
 *   bodyKey:        TutorialKey for the step body
 */

import type { TutorialKey } from "./tutorialStrings";

export interface TutorialStep {
  id: string;
  module: 1 | 2 | 3 | 4 | 5 | 6;
  /** CSS selector for the spotlight target. null = centered modal (no spotlight). */
  targetSelector: string | null;
  /** Preferred tooltip placement relative to the target (auto-flips on overflow). */
  placement: "top" | "bottom" | "left" | "right" | "center";
  titleKey: TutorialKey;
  bodyKey: TutorialKey;
}

export const TUTORIAL_STEPS: TutorialStep[] = [
  // ── Module 1 — Reading the Flow Desk ──────────────────────────────────────

  {
    id: "m1s1",
    module: 1,
    targetSelector: '[data-tut="flow-feed"]',
    placement: "top",
    titleKey: "m1s1Title",
    bodyKey: "m1s1Body",
  },
  {
    id: "m1s2",
    module: 1,
    targetSelector: '[data-tut="flow-card"]',
    placement: "right",
    titleKey: "m1s2Title",
    bodyKey: "m1s2Body",
  },
  {
    id: "m1s3",
    module: 1,
    targetSelector: '[data-tut="flow-gauge"]',
    placement: "bottom",
    titleKey: "m1s3Title",
    bodyKey: "m1s3Body",
  },
  {
    id: "m1s4",
    module: 1,
    targetSelector: '[data-tut="flow-inspector"]',
    placement: "left",
    titleKey: "m1s4Title",
    bodyKey: "m1s4Body",
  },
  {
    id: "m1s5",
    module: 1,
    targetSelector: null,
    placement: "center",
    titleKey: "m1s5Title",
    bodyKey: "m1s5Body",
  },

  // ── Module 2 — Score & Tiers ───────────────────────────────────────────────

  {
    id: "m2s1",
    module: 2,
    targetSelector: '[data-tut="flow-inspector"]',
    placement: "left",
    titleKey: "m2s1Title",
    bodyKey: "m2s1Body",
  },
  {
    id: "m2s2",
    module: 2,
    targetSelector: '[data-tut="flow-filter-panel"]',
    placement: "bottom",
    titleKey: "m2s2Title",
    bodyKey: "m2s2Body",
  },
  {
    id: "m2s3",
    module: 2,
    targetSelector: '[data-tut="flow-radar"]',
    placement: "bottom",
    titleKey: "m2s3Title",
    bodyKey: "m2s3Body",
  },
  {
    id: "m2s4",
    module: 2,
    targetSelector: '[data-tut="chain-heat"]',
    placement: "left",
    titleKey: "m2s4Title",
    bodyKey: "m2s4Body",
  },

  // ── Module 3 — Chain Heat & Campaigns ─────────────────────────────────────

  {
    id: "m3s1",
    module: 3,
    targetSelector: '[data-tut="chain-heat"]',
    placement: "left",
    titleKey: "m3s1Title",
    bodyKey: "m3s1Body",
  },
  {
    id: "m3s2",
    module: 3,
    targetSelector: '[data-tut="chain-heat-campaign"]',
    placement: "left",
    titleKey: "m3s2Title",
    bodyKey: "m3s2Body",
  },
  {
    id: "m3s3",
    module: 3,
    targetSelector: '[data-tut="chain-heat"]',
    placement: "left",
    titleKey: "m3s3Title",
    bodyKey: "m3s3Body",
  },
  {
    id: "m3s4",
    module: 3,
    targetSelector: null,
    placement: "center",
    titleKey: "m3s4Title",
    bodyKey: "m3s4Body",
  },

  // ── Module 4 — GEX Structure ───────────────────────────────────────────────

  {
    id: "m4s1",
    module: 4,
    targetSelector: '[data-tut="gex-ladder"]',
    placement: "right",
    titleKey: "m4s1Title",
    bodyKey: "m4s1Body",
  },
  {
    id: "m4s2",
    module: 4,
    targetSelector: '[data-tut="gex-flip"]',
    placement: "right",
    titleKey: "m4s2Title",
    bodyKey: "m4s2Body",
  },
  {
    id: "m4s3",
    module: 4,
    targetSelector: '[data-tut="gex-summary"]',
    placement: "bottom",
    titleKey: "m4s3Title",
    bodyKey: "m4s3Body",
  },
  {
    id: "m4s4",
    module: 4,
    targetSelector: '[data-tut="gex-state-card"]',
    placement: "left",
    titleKey: "m4s4Title",
    bodyKey: "m4s4Body",
  },

  // ── Module 5 — Heatmap & Divergence ───────────────────────────────────────

  {
    id: "m5s1",
    module: 5,
    targetSelector: '[data-tut="heatmap-canvas"]',
    placement: "top",
    titleKey: "m5s1Title",
    bodyKey: "m5s1Body",
  },
  {
    id: "m5s2",
    module: 5,
    targetSelector: '[data-tut="heatmap-controls"]',
    placement: "bottom",
    titleKey: "m5s2Title",
    bodyKey: "m5s2Body",
  },
  {
    id: "m5s3",
    module: 5,
    targetSelector: '[data-tut="heatmap-canvas"]',
    placement: "top",
    titleKey: "m5s3Title",
    bodyKey: "m5s3Body",
  },
  {
    id: "m5s4",
    module: 5,
    targetSelector: null,
    placement: "center",
    titleKey: "m5s4Title",
    bodyKey: "m5s4Body",
  },

  // ── Module 6 — Risk & Discipline ──────────────────────────────────────────

  {
    id: "m6s1",
    module: 6,
    targetSelector: null,
    placement: "center",
    titleKey: "m6s1Title",
    bodyKey: "m6s1Body",
  },
  {
    id: "m6s2",
    module: 6,
    targetSelector: null,
    placement: "center",
    titleKey: "m6s2Title",
    bodyKey: "m6s2Body",
  },
  {
    id: "m6s3",
    module: 6,
    targetSelector: null,
    placement: "center",
    titleKey: "m6s3Title",
    bodyKey: "m6s3Body",
  },
  {
    id: "m6s4",
    module: 6,
    targetSelector: null,
    placement: "center",
    titleKey: "m6s4Title",
    bodyKey: "m6s4Body",
  },
  {
    id: "m6s5",
    module: 6,
    targetSelector: null,
    placement: "center",
    titleKey: "m6s5Title",
    bodyKey: "m6s5Body",
  },
];

// ── Module metadata ──────────────────────────────────────────────────────────

export interface ModuleMeta {
  id: 1 | 2 | 3 | 4 | 5 | 6;
  nameKey: TutorialKey;
  subKey: TutorialKey;
  stepIds: string[];
}

export const MODULES: ModuleMeta[] = [
  {
    id: 1,
    nameKey: "m1Name",
    subKey: "m1Sub",
    stepIds: ["m1s1", "m1s2", "m1s3", "m1s4", "m1s5"],
  },
  {
    id: 2,
    nameKey: "m2Name",
    subKey: "m2Sub",
    stepIds: ["m2s1", "m2s2", "m2s3", "m2s4"],
  },
  {
    id: 3,
    nameKey: "m3Name",
    subKey: "m3Sub",
    stepIds: ["m3s1", "m3s2", "m3s3", "m3s4"],
  },
  {
    id: 4,
    nameKey: "m4Name",
    subKey: "m4Sub",
    stepIds: ["m4s1", "m4s2", "m4s3", "m4s4"],
  },
  {
    id: 5,
    nameKey: "m5Name",
    subKey: "m5Sub",
    stepIds: ["m5s1", "m5s2", "m5s3", "m5s4"],
  },
  {
    id: 6,
    nameKey: "m6Name",
    subKey: "m6Sub",
    stepIds: ["m6s1", "m6s2", "m6s3", "m6s4", "m6s5"],
  },
];

/**
 * data-tut attributes the integrator MUST add to existing components:
 *
 *   data-tut="flow-feed"         — outermost div of FeedPane (the scrollable list)
 *   data-tut="flow-card"         — first/representative FlowCard row in FeedPane
 *   data-tut="flow-gauge"        — outermost div of FlowGauge
 *   data-tut="flow-inspector"    — outermost div of InspectorPane
 *   data-tut="flow-filter-panel" — outermost div of FiltersPanel (the slide-in panel)
 *   data-tut="flow-radar"        — outermost div of RadarStrip
 *   data-tut="chain-heat"        — the ChainHeatRail container div in FlowDeskView
 *   data-tut="chain-heat-campaign" — first ChainCampaignRow div (or the campaigns list div)
 *   data-tut="gex-ladder"        — outermost div of StrikeLadder
 *   data-tut="gex-flip"          — the flip-line row or marker element in StrikeLadder
 *   data-tut="gex-summary"       — outermost div of GexSummaryBar
 *   data-tut="gex-state-card"    — outermost div of MarketStateCard
 *   data-tut="heatmap-canvas"    — the CANVAS_AREA div in HeatmapView (the tile grid)
 *   data-tut="heatmap-controls"  — the CONTROLS_ROW div in HeatmapView (the layer picker)
 *
 * Steps with targetSelector: null already use centered modal — no attribute needed.
 * These are: m1s5, m3s4, m5s4, m6s1–m6s5 (all 5 risk/discipline steps).
 */
export const DATA_TUT_ATTRIBUTES = [
  "flow-feed",
  "flow-card",
  "flow-gauge",
  "flow-inspector",
  "flow-filter-panel",
  "flow-radar",
  "chain-heat",
  "chain-heat-campaign",
  "gex-ladder",
  "gex-flip",
  "gex-summary",
  "gex-state-card",
  "heatmap-canvas",
  "heatmap-controls",
] as const;

export type DataTutValue = (typeof DATA_TUT_ATTRIBUTES)[number];
